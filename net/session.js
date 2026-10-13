// Host- og klient-session oven på et Transport. Hosten kører step() og er autoritativ; klienten spejler state og forudsiger egen bevægelse.
import { createWorld, addPlayer, setClass, predictMove, autoAimPick } from '../sim/world.js';
import { TILE_PX } from '../sim/grid.js';
import { encodeSnap, decodeSnap, rosterOf, remapEvent } from './codec.js';

const INPUT_REDUNDANCY = 3; // hvert input-pakke bærer de sidste 3 frames, så tabte pakker ikke taber skud

// ---------- HOST ----------
// opts: { ai, aiDifficulty, onRoster(roster) }
export function createHostSession(world, transport, opts = {}) {
  const slots = new Map();   // peerKey -> playerId
  const former = new Map();  // peerKey -> playerId for spillere, der har mistet forbindelsen (reconnect får pladsen tilbage)
  const inputs = new Map();  // playerId -> { frame, lastSeq, fire, ability }
  const ai = opts.ai;
  const roster = () => rosterOf(world).map(r => ({ ...r, human: r.id === 'me' || [...slots.values()].includes(r.id) }));
  const tileState = () => [...world.tiles.values()].filter(t => t.type === 'crate' || t.wasCrate || t.deployedBy).map(t => [t.x, t.y, t.type === 'crate' ? Math.max(0, Math.round(t.hp)) : 0, t.maxHp]);
  const sendRoster = () => { const r = roster(); transport.broadcast('r', { t: 'roster', roster: r }); opts.onRoster?.(r); };

  function pickSlot(cls) {
    // hold med færrest mennesker; overtag en bot på det hold, ellers ny plads (højst _match.maxPerTeam)
    const humans = (team) => world.players.filter(p => p.team === team && (p.id === 'me' || [...slots.values()].includes(p.id))).length;
    const teams = ['blue', 'red'].sort((a, b) => humans(a) - humans(b));
    const maxPer = world.classes._match.maxPerTeam ?? 4;
    for (const team of teams) {
      const bot = world.players.find(p => p.team === team && ai?.bots?.has(p.id));
      if (bot) { ai.removeBot(bot.id); if (cls && cls !== bot.cls) setClass(world, bot, cls); return bot; }
      if (world.players.filter(p => p.team === team).length < maxPer) return addPlayer(world, { team, cls: cls || 'Assault' });
    }
    return null;
  }

  transport.onPeerJoin(() => {}); // venter på 'hello' med klassevalg
  transport.onPeerLeave((key) => {
    const id = slots.get(key); if (!id) return;
    slots.delete(key); inputs.delete(id); former.set(key, id);
    if (ai) ai.addBot(id, opts.aiDifficulty || 'normal'); // en bot overtager pladsen, så holdene forbliver hele
    sendRoster();
  });
  transport.onMessage((key, ch, m) => {
    if (m.t === 'hello') {
      let id = slots.get(key), p = id && world.players.find(q => q.id === id);
      if (!p && former.has(key)) { // reconnect: tag pladsen tilbage fra botten (samme id, så score og K/D følger med)
        const fid = former.get(key); former.delete(key); const fp = world.players.find(q => q.id === fid);
        if (fp && ai?.bots?.has(fid)) { ai.removeBot(fid); p = fp; slots.set(key, fid); }
      }
      if (!p) { p = pickSlot(world.classes[m.cls] ? m.cls : null); if (!p) { transport.send(key, 'r', { t: 'full' }); return; } slots.set(key, p.id); }
      transport.send(key, 'r', { t: 'welcome', you: p.id, roster: roster(), tiles: tileState(), tick: world.tick, settings: opts.settings?.() ?? null, started: !!opts.started?.() });
      sendRoster();
    } else if (m.t === 'cls') { // klasseskift fra lobbyen (kun før kampen starter)
      const id = slots.get(key), p = id && world.players.find(q => q.id === id);
      if (p && world.classes[m.cls] && !opts.started?.()) { setClass(world, p, m.cls); sendRoster(); }
    } else if (m.t === 'in') {
      const id = slots.get(key); if (!id) return;
      const st = inputs.get(id) || { frame: null, lastSeq: 0, fire: false, ability: false };
      for (const f of m.f) { // nye frames: seneste move/aim vinder, fire/ability låses til næste tick
        if (f.seq <= st.lastSeq) continue;
        st.lastSeq = f.seq; st.frame = f; st.fire ||= !!f.fire; st.ability ||= !!f.ability;
        if (f.fire) st.fireAim = f.aim; if (f.ability) st.abilityAim = f.aim;
      }
      inputs.set(id, st);
    }
  });
  return {
    transport, slots,
    frames() { // InputFrames for netværksspillere til dette tick
      const out = {};
      for (const [id, st] of inputs) {
        if (!st.frame) continue;
        const aim = st.fire ? st.fireAim : st.ability ? st.abilityAim : st.frame.aim;
        out[id] = { move: st.frame.move, aim: aim ?? null, fire: st.fire, ability: st.ability, seq: st.lastSeq };
        st.fire = st.ability = false;
      }
      return out;
    },
    publish(snap) { // efter step(): snapshot på 'u', events på 'r' (events må ikke gå tabt)
      const r = roster();
      transport.broadcast('u', { t: 's', s: encodeSnap(snap, r) });
      if (snap.events.length) transport.broadcast('r', { t: 'ev', k: snap.tick, e: snap.events.filter(e => !(e.type === 'shot' && !e.hitscan)).map(e => roundEvent(e)) });
    },
    roster, sendRoster,
    sendSettings(settings, started = false) { transport.broadcast('r', { t: 'settings', settings, started }); },
  };
}
const roundEvent = (e) => { const o = {}; for (const [k, v] of Object.entries(e)) o[k] = typeof v === 'number' ? Math.round(v * 10) / 10 : v && typeof v === 'object' ? roundEvent(v) : v; return o; };

// ---------- KLIENT ----------
// opts: { map, classes, cls, name, onWelcome, onRoster, onFull }
export function createClientSession(transport, opts) {
  const world = createWorld(opts.map, opts.classes);
  // Kassetilstand fra welcome; lægges på igen efter et baneskift (sen join midt i en kamp på en anden bane end standard).
  let welcomeTiles = null, welcomeMap = null;
  const applyTiles = () => { for (const [x, y, hp, maxHp] of welcomeTiles || []) { const t = world.tiles.get(x + ',' + y); if (!t) continue; t.type = hp > 0 ? 'crate' : 'floor'; t.hp = hp; t.maxHp = maxHp; } };
  let you = null, roster = [], lastTick = -1, view = null, pending = [], eventQueue = [];
  const remap = (id) => id === you ? 'me' : id === 'me' ? 'host' : id;

  function syncRoster(r) {
    roster = r;
    const ids = new Set(r.map(x => remap(x.id)));
    world.players = world.players.filter(p => ids.has(p.id));
    for (const x of r) {
      const id = remap(x.id); let p = world.players.find(q => q.id === id);
      if (!p) p = addPlayer(world, { team: x.team, cls: x.cls, id });
      else if (p.cls !== x.cls) setClass(world, p, x.cls);
      p.team = x.team;
    }
    world.events = [];
    opts.onRoster?.(r);
  }
  function applyTileEvent(e) {
    const t = world.tiles.get(e.x + ',' + e.y); if (!t) return;
    if (e.type === 'crateBroken') { t.type = 'floor'; t.hp = 0; }
    else if (e.type === 'crateRespawned') { t.type = 'crate'; t.hp = t.maxHp = opts.classes._match.crateHp ?? 100; }
    else if (e.type === 'crateDeployed') { t.type = 'crate'; t.hp = t.maxHp = e.hp; }
    else if (e.type === 'crateDamaged') { t.hp = e.hp; t.maxHp = e.maxHp; }
  }

  transport.onPeerJoin(() => transport.send('host', 'r', { t: 'hello', cls: opts.cls, name: opts.name }));
  transport.onMessage((_k, ch, m) => {
    if (m.t === 'welcome') {
      you = m.you; syncRoster(m.roster); if (m.settings) opts.onSettings?.(m.settings, m.started);
      welcomeTiles = m.tiles; welcomeMap = m.settings?.map ?? null; applyTiles();
      opts.onWelcome?.(world.players.find(p => p.id === 'me'));
    } else if (m.t === 'roster') syncRoster(m.roster);
    else if (m.t === 'full') opts.onFull?.();
    else if (m.t === 'settings') opts.onSettings?.(m.settings, m.started);
    else if (m.t === 'ev') { for (const e0 of m.e) { const e = remapEvent(e0, remap); applyTileEvent(e); eventQueue.push(e);
      if (e.score) { world.match.score = { ...e.score }; if (view) view.match = { ...view.match, score: { ...e.score }, over: view.match.over || e.type === 'matchOver' }; } } }
    else if (m.t === 's' && you) {
      if (m.s.t <= lastTick) return; // unordnet kanal: smid forældede snapshots væk
      lastTick = m.s.t;
      const snap = decodeSnap(m.s, roster, remap);
      for (const sp of snap.players) { const p = world.players.find(q => q.id === sp.id); if (p) Object.assign(p, sp); }
      // Reconciliation: start fra hostens position for egen spiller og afspil de inputs, hosten ikke har set endnu
      const me = world.players.find(p => p.id === 'me');
      if (me) { const ack = snap.players.find(p => p.id === 'me')?.lastSeq ?? 0; pending = pending.filter(f => f.seq > ack); if (me.alive && !(snap.match.roundIntroLeft > 0)) for (const f of pending) predictMove(world, me, me.cls, f.move); }
      world.match = { ...world.match, ...snap.match }; world.projectiles = snap.projectiles; world.grenades = snap.grenades; world.zones = snap.zones;
      view = snap;
    }
  });
  return {
    world, get you() { return you; }, applyTiles(mapId) { if (mapId === welcomeMap) applyTiles(); }, get ready() { return !!(you && view); },
    setClass(cls) { transport.send('host', 'r', { t: 'cls', cls }); },
    sendInput(f) { // kaldes hvert lokalt tick (20 Hz) med egen InputFrame
      pending.push(f); if (pending.length > 60) pending.shift();
      const me = world.players.find(p => p.id === 'me');
      const frozen = view && view.match.roundIntroLeft > 0; // nedtælling: hosten flytter ingen
      if (me) { const ml = Math.hypot(f.move?.x || 0, f.move?.y || 0); me.moveDir = ml > 0.1 ? { x: f.move.x / ml, y: f.move.y / ml } : null; }
      if (me && me.alive && !frozen) { predictMove(world, me, me.cls, f.move); if (f.aim) me.aim = f.aim; }
      transport.send('host', 'u', { t: 'in', f: pending.slice(-INPUT_REDUNDANCY) });
    },
    view() { // snapshot til render/HUD; egen spiller fra prediction
      if (!view) return null;
      const players = view.players.map(p => { if (p.id !== 'me') return p; const me = world.players.find(q => q.id === 'me'); const t = me.alive ? autoAimPick(world, me, world.classes[me.cls].weapon.range * TILE_PX) : null; return { ...p, x: me.x, y: me.y, aim: me.aim, autoTargetId: t ? t.id : null }; });
      const ev = eventQueue; eventQueue = [];
      return { ...view, players, events: ev };
    },
  };
}
