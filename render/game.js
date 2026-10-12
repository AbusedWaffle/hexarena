import { PALETTE, FX } from '../art/palette.js';
import { drawUnit } from '../art/shapes.js';
import { AbilityFx } from '../art/abilityFx.js';
import { TILE_PX } from '../sim/grid.js';
import { drawSquareMap } from '../art/squareMap.js';
import { createWorld, addPlayer, step, snapshot, raycast, DT, setClass, setTeam, startMatch } from '../sim/world.js';
import { createInputSystem } from './inputSystem.js';
import { createHud } from './hud.js';
import { createAI } from '../sim/ai.js';
import { createPeerHost, createPeerClient, createBcHost, createBcClient, makeCode } from '../net/transport.js';
import { createHostSession, createClientSession } from '../net/session.js';

const [map, classes, aiCfg] = await Promise.all(['data/map_paintyard_sq_01.json', 'data/classes.square.json', 'data/ai.json'].map(u => fetch(u).then(r => r.json())));
// URL: ?diff=easy|normal|hard  &red=3 (antal røde bots)  &blue=0 (blå holdkammerater)  &aidebug=1
const QS = new URLSearchParams(location.search), AI_DIFF = QS.get('diff') || 'normal', AI_DEBUG = QS.has('aidebug');
// Multiplayer: ?host=1 opretter et spil (kode vises), ?room=KODE deltager. Ellers singleplayer mod bots.
addEventListener('hexarena:lobby-start', () => { globalThis.__lobbyStarted = true; globalThis.__arena?.onLobbyStart?.(); });
// ?lobby=1: også spil mod robotter starter i lobbyen (menuen sætter det). Uden den starter et lokalt spil straks, som testlinks forventer.
const LOBBY = QS.has('host') || QS.has('lobby');
const ROOM = (QS.get('room') || '').toUpperCase(), MODE = ROOM ? 'client' : QS.has('host') ? 'host' : 'local';
const MY_CLS = classes[QS.get('cls')] ? QS.get('cls') : 'Assault';
// Kamera-tal: synsfelt i tiles, følge-blødhed (andel pr. frame ved 60 fps; 0,15 ≈ 0,1 s forsinkelse) og fremskydning under manuel sigte
const CAMERA = { tilesW: 14, tilesH: 8, lerp: 0.15, aimLeadTiles: 1.5 };
const hexStr = (c) => '#' + c.toString(16).padStart(6, '0');

class Arena extends Phaser.Scene {
  create() {
    this.ai = null; this.net = null; this.client = null;
    if (MODE === 'client') {
      this.client = createClientSession((QS.get('net') === 'bc' ? createBcClient : createPeerClient)(ROOM), { map, classes, cls: MY_CLS,
        onWelcome: (me) => { this.me = me; }, onSettings: (st, started) => { globalThis.__lobbySettings = st; globalThis.dispatchEvent(new CustomEvent('hexarena:lobby', { detail: { mode: 'client', isHost: false, settings: st, started } })); }, onFull: () => this.netMsg?.setText('Spillet er fuldt') });
      this.world = this.client.world;
      addEventListener('hexarena:lobby-class', (e) => { if (classes[e.detail?.cls]) this.client.setClass(e.detail.cls); });
      this.me = { x: 0, y: 0, team: 'blue', cls: MY_CLS, alive: false }; // pladsholder, indtil hosten svarer
    } else {
      this.world = createWorld(map, classes);
      this.me = addPlayer(this.world, { team: 'blue', cls: MY_CLS, id: 'me' });
      // AI-bots på de øvrige pladser. I multiplayer overtager netværksspillere bot-pladser, og en bot tager over, hvis de forlader spillet.
      this.ai = createAI(this.world, aiCfg, Date.now() & 0xffff);
      const order = ['Assault', 'Sniper', 'Scout', 'Engineer', 'Support'], maxPer = classes._match.maxPerTeam ?? 4;
      const nRed = Math.min(maxPer, Number(QS.get('red') ?? (MODE === 'host' ? maxPer : 3))), nBlue = Math.min(maxPer - 1, Number(QS.get('blue') ?? (MODE === 'host' ? maxPer - 1 : 0)));
      for (let i = 0; i < nRed; i++) this.ai.addBot(addPlayer(this.world, { team: 'red', cls: order[i % 5], id: 'botR' + i }).id, AI_DIFF);
      for (let i = 0; i < nBlue; i++) this.ai.addBot(addPlayer(this.world, { team: 'blue', cls: order[(i + 1) % 5], id: 'botB' + i }).id, AI_DIFF);
      if (MODE === 'host') {
        const code = makeCode(), tr = (QS.get('net') === 'bc' ? createBcHost : createPeerHost)(code);
        // Lobby-overlay (ui/lobby.js) lytter på 'hexarena:lobby' og viser kode, QR, holdliste og status.
        const lobby = (d) => globalThis.dispatchEvent(new CustomEvent('hexarena:lobby', { detail: { code, ...d } }));
        this.net = createHostSession(this.world, tr, this.netOpts = { ai: this.ai, aiDifficulty: AI_DIFF, onRoster: (r) => { lobby({ roster: r }); if (!this.started) this.applyLobbySettings(this.settings, true); },
          settings: () => this.settings, started: () => !!this.started });
        tr.onStatus((st, info) => lobby(st === 'open' ? { status: 'open', roster: this.net.roster() } : { status: 'error', error: String(info) }));
        lobby({ status: 'connecting' });
        this.code = code;
      }
      this.lobbyEmit = MODE === 'host' ? (d) => globalThis.dispatchEvent(new CustomEvent('hexarena:lobby', { detail: { code: this.code, ...d } })) : (d) => globalThis.dispatchEvent(new CustomEvent('hexarena:lobby', { detail: d }));
      if (LOBBY) {
        this.settings = null; this.started = false;
        addEventListener('hexarena:lobby-settings', (e) => this.applyLobbySettings(e.detail?.settings));
        addEventListener('hexarena:lobby-class', (e) => { if (!this.started && classes[e.detail?.cls]) { setClass(this.world, this.me, e.detail.cls); this.net?.sendRoster(); this.lobbyEmit({ roster: this.rosterNow() }); } });
        if (globalThis.__lobbySettings) this.applyLobbySettings(globalThis.__lobbySettings);
        this.lobbyEmit({ mode: MODE, isHost: true, settings: this.settings, roster: this.rosterNow() });
      } else this.started = true;
    }
    this.prev = this.cur = MODE === 'client' ? null : snapshot(this.world); this.acc = 0;
    this.staticG = this.add.graphics(); this.drawMap();
    this.g = this.add.graphics(); this.fxG = this.add.graphics(); this.ghosts = new Map(); this.pops = []; this.abilityFx = new AbilityFx(this);
    this.camTarget = this.add.zone(this.me.x, this.me.y, 1, 1);
    // Kamera som i Brawl Stars: egen spiller altid i midten, ingen banegrænser (uden for banen ses baggrunden),
    // zoom så man ser ca. CAMERA.tilesW × CAMERA.tilesH tiles, og blød følge.
    const zoom = Math.min(1280 / (CAMERA.tilesW * TILE_PX), 720 / (CAMERA.tilesH * TILE_PX));
    this.cameras.main.setZoom(zoom).setBackgroundColor(hexStr(PALETTE.bg)).startFollow(this.camTarget, false, CAMERA.lerp, CAMERA.lerp);
    this.cameras.main.centerOn(this.me.x, this.me.y);
    this.input_ = createInputSystem(this, {
      getPlayerScreenPos: () => this.hudUI.toScreen(this.me.x, this.me.y),
      getAbilityRangePx: () => ((classes[this.me.cls].ability?.throwRange) || 6) * TILE_PX });
    this.hudUI = createHud(this, { map, classes, world: this.world, input: this.input_ });
    this.trails = []; this.dmg = new Map(); this.sparks = [];
    this.help = this.hudUI.add(this.add.text(16, 690, 'WASD bevæg · venstreklik hold+slip = skyd · mellemrum = auto-aim · E = ability · højreklik hold+slip = sigtet ability', { fontSize: 12, color: '#5a6385' }).setScrollFactor(0).setDepth(10).setVisible(!this.sys.game.device.input.touch));
    this.netMsg = MODE !== 'client' ? null : this.add.text(640, 60, 'Forbinder til ' + ROOM + '...', { fontFamily: 'Roboto Mono, monospace', fontSize: 16, color: hexStr(PALETTE.text), align: 'center', backgroundColor: '#06091Acc', padding: { x: 10, y: 6 } }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(11);
    this.t = 0; globalThis.__arena = this; // dev-hook til UI-test
    if (globalThis.__lobbyStarted) this.onLobbyStart(); // 'Start kampen' kom før scenen var klar
  }
  rosterNow() { return this.net ? this.net.roster() : this.world.players.map(p => ({ id: p.id, team: p.team, cls: p.cls, human: p.id === 'me' })); }
  // Lobby-indstillinger (kun host/lokal): holdstørrelse, bots til/fra, antal, sværhedsgrad, runder og rundelængde. Træder i kraft ved 'Start kampen'.
  applyLobbySettings(st, quiet = false) {
    if (this.started) return; if (st) this.settings = { ...this.settings, ...st }; st = this.settings; if (!st) return;
    const w = this.world, mc = w.classes._match, size = Math.max(1, Math.min(4, st.teamSize | 0 || 3));
    mc.maxPerTeam = size; if (st.roundsToWin) mc.roundsToWin = +st.roundsToWin; if (st.roundTimeSec) mc.roundTimeSec = +st.roundTimeSec;
    const diff = st.botDifficulty || AI_DIFF; if (this.netOpts) this.netOpts.aiDifficulty = diff;
    const isHuman = (p) => p.id === 'me' || (this.net && [...this.net.slots.values()].includes(p.id));
    for (const p of [...w.players]) if (!isHuman(p)) { this.ai.removeBot(p.id); w.players.splice(w.players.indexOf(p), 1); }
    const count = (t) => w.players.filter(p => p.team === t).length;
    for (const p of w.players) { const o = p.team === 'blue' ? 'red' : 'blue'; if (count(p.team) > size && count(o) < size) setTeam(w, p, o); } // for mange mennesker på et hold
    const order = ['Assault', 'Sniper', 'Scout', 'Engineer', 'Support'];
    let bots = st.bots === false ? 0 : Math.min(st.botCount ?? 2 * size, 2 * size - w.players.length), n = 0;
    while (bots-- > 0) { const team = count('red') <= count('blue') ? 'red' : 'blue'; if (count(team) >= size) break; this.ai.addBot(addPlayer(w, { team, cls: order[n % 5], id: 'bot' + team[0].toUpperCase() + (this.botSeq = (this.botSeq || 0) + 1) }).id, diff); n++; }
    this.lobbyEmit({ settings: st, roster: this.rosterNow() });
    if (this.net) { this.net.sendSettings(st); if (!quiet) this.net.sendRoster(); }
  }
  onLobbyStart() {
    if (this.started || !LOBBY || MODE === 'client') return;
    this.started = true; startMatch(this.world); this.net?.sendSettings(this.settings, true); this.net?.sendRoster();
  }
  hostText(code, roster) {
    const humans = roster.filter(r => r.human).length, url = location.origin + location.pathname + '?room=' + code;
    return 'Spilkode: ' + code + '   ·   ' + humans + ' spiller' + (humans === 1 ? '' : 'e') + ' (resten er bots)' + String.fromCharCode(10) + url;
  }
  drawMap() {
    // banen fra Artists drawSquareMap, med aktuel kasse-tilstand (ødelagte kasser tegnes ikke)
    const live = { ...map, tiles: [...this.world.tiles.values()].filter(t => t.type !== 'floor').map(t => ({ x: t.x, y: t.y, type: t.type })) };
    drawSquareMap(this.staticG, live, TILE_PX, (x, y) => { const t = this.world.tiles.get(x + ',' + y); return FX.crateDamageTint[Math.min(2, Math.floor((1 - t.hp / t.maxHp) * 3))]; });
  }
  update(_, dtMs) {
    this.t += dtMs / 1000; this.acc += dtMs / 1000;
    let redraw = false;
    while (this.acc >= DT) {
      this.acc -= DT;
      if (this.client) {
        if (!this.client.you) continue;
        this.client.sendInput(this.input_.frame());
        const v = this.client.view(); if (!v) continue;
        if (!this.cur) { this.cur = v; this.netMsg.setVisible(false); redraw = true; }
        this.prev = this.cur; this.cur = v;
      } else {
        // Host: kampen står stille i lobbyen, indtil 'Start kampen' (hexarena:lobby-start / __lobbyStarted). Lokalt spil starter med det samme.
        if (LOBBY && !this.started) {
          this.net?.frames(); this.input_.frame(); // tøm input, så intet hober sig op
          const s = snapshot(this.world); s.events = []; s.match.roundIntroLeft = Math.max(s.match.roundIntroLeft || 0, 0.1); // >0: klienter forudsiger ikke bevægelse
          this.prev = this.cur = s; this.net?.publish(s); continue;
        }
        const inputs = { ...this.ai.frames(), ...(this.net ? this.net.frames() : {}), me: this.input_.frame() };
        step(this.world, inputs);
        this.prev = this.cur; this.cur = snapshot(this.world);
        this.net?.publish(this.cur);
      }
      for (const e of this.cur.events) {
        this.abilityFx.onEvent(e, this.cur); this.hudUI.onEvent(e, this.cur);
        if (e.type === 'crateDeployed') redraw = true;
        if (e.type === 'crateDamaged' || e.type === 'crateBroken' || e.type === 'crateRespawned') redraw = true;
        if (e.type === 'crateRespawnWarning') this.ghosts.set(e.x + ',' + e.y, { x: e.x, y: e.y, born: this.time.now });
        if (e.type === 'crateRespawnCancelled') this.ghosts.delete(e.x + ',' + e.y);
        if (e.type === 'crateRespawned') { this.ghosts.delete(e.x + ',' + e.y); this.pops.push({ x: e.x, y: e.y, born: this.time.now }); }
        if (e.type === 'shot' && e.hitscan) this.trails.push({ ...e, born: this.time.now });
        if (e.type === 'hit') {
          const d = this.dmg.get(e.id), now = this.time.now;
          if (d && now - d.last < FX.damageNumber.mergeWindowMs) { d.total += e.damage; d.last = now; d.pop = now; }
          else this.dmg.set(e.id, { total: e.damage, last: now, pop: now, born: now });
          const p = this.cur.players.find(q => q.id === e.id);
          for (let i = 0; i < FX.hitSpark.count; i++) { const a = Math.random() * 6.28; this.sparks.push({ x: e.x, y: e.y, vx: Math.cos(a) * FX.hitSpark.speed, vy: Math.sin(a) * FX.hitSpark.speed, c: p.team === 'blue' ? PALETTE.blueGlow : PALETTE.redGlow, born: now }); }
          if (e.id === 'me') this.cameras.main.shake(FX.screenShake.ms, FX.screenShake.hit / 1000);
        }
        if (e.type === 'kill' && (e.by === 'me' || e.id === 'me')) this.cameras.main.shake(FX.screenShake.ms, FX.screenShake.death / 1000);
      }
    }
    if (redraw) { this.staticG.clear(); this.drawMap(); }
    if (!this.cur) return; // klient: venter på første snapshot
    this.draw(this.acc / DT);
  }
  draw(alpha) {
    const g = this.g, now = this.time.now; g.clear(); this.fxG.clear();
    const lerp = (a, b) => a + (b - a) * alpha;
    for (const p of this.cur.players) {
      const pp = this.prev.players.find(q => q.id === p.id) || p; if (!p.alive) continue;
      const x = lerp(pp.x, p.x), y = lerp(pp.y, p.y), col = p.team === 'blue' ? PALETTE.blue : PALETTE.red, glow = p.team === 'blue' ? PALETTE.blueGlow : PALETTE.redGlow, r = p.radius ?? TILE_PX * 0.4;
      if (p.id === 'me') { const la = this.input_.aimPreview(), ll = la ? Math.hypot(la.x, la.y) || 1 : 1; this.camTarget.setPosition(x + (la ? la.x / ll * CAMERA.aimLeadTiles * TILE_PX : 0), y + (la ? la.y / ll * CAMERA.aimLeadTiles * TILE_PX : 0)); g.lineStyle(2, 0xffffff, 0.8).strokeCircle(x, y, r + 5); }
      drawUnit(g, classes[p.cls]?.shape, x, y, r, (p.facing ?? Math.atan2(p.aim?.y || 0, p.aim?.x || 1)), col, glow);
      if (p.spawnShieldLeft > 0) g.lineStyle(2, glow, FX.spawnShield.alpha + 0.3 * Math.sin(now / FX.spawnShield.pulseMs * 6.28)).strokeCircle(x, y, r + 9);
      { const z = this.cameras.main.zoom, bw = 36 / z, bh = 4 / z, by = y - r - 10 / z - bh; g.fillStyle(0x000000, 0.6).fillRect(x - bw / 2, by, bw, bh).fillStyle(col).fillRect(x - bw / 2, by, bw * p.hp / p.maxHp, bh); } // HP-bar i fast skærmstørrelse (36×4 px) uanset zoom
      if (p.id === 'me') for (let i = 0; i < classes[p.cls].weapon.charges; i++) { const f = i < p.charges ? 1 : i === p.charges ? p.chargeProgress : 0; g.fillStyle(0x000000, 0.6).fillRect(x - 18 + i * 12.5, y + r + 8, 11, 3).fillStyle(PALETTE.score).fillRect(x - 18 + i * 12.5, y + r + 8, 11 * f, 3); }
    }
    const aim = this.input_.aimPreview();
    if (aim && this.me.alive) { const r = raycast(this.world, this.me, aim, classes[this.me.cls].weapon.range * TILE_PX, { ignoreId: 'me', ignoreTeam: this.me.team }); g.lineStyle(3, PALETTE.blueGlow, 0.35).lineBetween(this.me.x, this.me.y, r.point.x, r.point.y); }
    const ab = this.input_.abilityPreview(), abd = classes[this.me.cls].ability;
    if (ab && this.me.alive && abd && ['grenade', 'dash', 'deploy_crate'].includes(abd.id)) {
      const rng = (abd.throwRange || abd.distance || (abd.placeRange + 0.5) || 3) * TILE_PX, l = Math.hypot(ab.x, ab.y) || 1, len = abd.id === 'grenade' ? Math.max(0.05, l) * rng : rng;
      const tx = this.me.x + ab.x / l * len, ty = this.me.y + ab.y / l * len;
      g.lineStyle(2, PALETTE.score, 0.5).lineBetween(this.me.x, this.me.y, tx, ty);
      if (abd.id === 'grenade') g.lineStyle(2, PALETTE.score, 0.8).strokeCircle(tx, ty, abd.radius * TILE_PX).fillStyle(PALETTE.score, 0.12).fillCircle(tx, ty, abd.radius * TILE_PX);
    }
    for (const b of this.cur.projectiles) { const pb = this.prev.projectiles.find(q => q.id === b.id) || b; const x = lerp(pb.x, b.x), y = lerp(pb.y, b.y), c = b.team === 'blue' ? PALETTE.blueGlow : PALETTE.redGlow; g.lineStyle(FX.bulletTrail.width, c, FX.bulletTrail.alpha).lineBetween(pb.x, pb.y, x, y).fillStyle(c).fillCircle(x, y, 3); }
    this.abilityFx.draw(this.fxG, now, this.cur);
    this.trails = this.trails.filter(t => now - t.born < FX.bulletTrail.ms);
    for (const gh of this.ghosts.values()) { const a = FX.crateRespawn.ghostAlpha * (0.6 + 0.4 * Math.sin((now - gh.born) / FX.crateRespawn.pulseMs * 6.28)); const m = TILE_PX * 0.08; this.fxG.fillStyle(PALETTE.crate, a).fillRect(gh.x * TILE_PX + m, gh.y * TILE_PX + m, TILE_PX - 2 * m, TILE_PX - 2 * m).lineStyle(2, PALETTE.crateEdge, a * 2).strokeRect(gh.x * TILE_PX + m, gh.y * TILE_PX + m, TILE_PX - 2 * m, TILE_PX - 2 * m); }
    this.pops = this.pops.filter(pp => now - pp.born < FX.crateRespawn.popMs);
    for (const pp of this.pops) { const k = (now - pp.born) / FX.crateRespawn.popMs; const sz = TILE_PX * (0.84 + 0.3 * k); this.fxG.lineStyle(3, PALETTE.crateEdge, 1 - k).strokeRect((pp.x + 0.5) * TILE_PX - sz / 2, (pp.y + 0.5) * TILE_PX - sz / 2, sz, sz); }
    for (const t of this.trails) this.fxG.lineStyle(FX.bulletTrail.width, 0xffffff, 1 - (now - t.born) / FX.bulletTrail.ms).lineBetween(t.from.x, t.from.y, t.to.x, t.to.y);
    this.sparks = this.sparks.filter(s => now - s.born < FX.hitSpark.ms);
    for (const s of this.sparks) { const k = (now - s.born) / 1000; this.fxG.fillStyle(s.c, 1 - (now - s.born) / FX.hitSpark.ms).fillCircle(s.x + s.vx * k, s.y + s.vy * k, FX.hitSpark.size); }
    this.drawDamageNumbers(now);
    if (AI_DEBUG && this.ai) this.drawAIDebug();
    this.hudUI.draw(this.cur);
  }
  drawAIDebug() { // sti, mål og tilstand pr. bot (?aidebug=1)
    const g = this.fxG; this.aiTexts ??= new Map();
    for (const d of this.ai.debug()) {
      const p = this.world.players.find(q => q.id === d.id); let t = this.aiTexts.get(d.id);
      if (!t) { t = this.add.text(0, 0, '', { fontSize: 11, color: '#9fe' }).setOrigin(0.5).setDepth(6); this.aiTexts.set(d.id, t); }
      t.setVisible(p.alive).setText(d.state).setPosition(p.x, p.y + p.radius + 16);
      if (!p.alive) continue;
      g.lineStyle(1, 0x9fffe0, 0.5); let a = p; for (const n of d.path) { const b = { x: (n.x + 0.5) * TILE_PX, y: (n.y + 0.5) * TILE_PX }; g.lineBetween(a.x, a.y, b.x, b.y); a = b; }
      const tg = d.target && this.world.players.find(q => q.id === d.target); if (tg) g.lineStyle(1, 0xffe27a, 0.6).lineBetween(p.x, p.y, tg.x, tg.y);
    }
  }
  drawDamageNumbers(now) {
    const c = FX.damageNumber; this.dmgTexts ??= new Map();
    for (const [id, d] of this.dmg) {
      const age = now - d.last; let txt = this.dmgTexts.get(id);
      if (age > c.holdMs + c.fadeMs) { this.dmg.delete(id); txt?.destroy(); this.dmgTexts.delete(id); continue; }
      const p = this.cur.players.find(q => q.id === id);
      if (!txt) { txt = this.add.text(0, 0, '', { font: c.font, color: hexStr(id === 'me' ? c.selfDamageColor : c.color), stroke: '#000', strokeThickness: c.strokePx }).setOrigin(0.5).setDepth(5); txt.setShadow(0, 0, hexStr(c.glowColor), c.glowBlur, false, true); this.dmgTexts.set(id, txt); }
      let size = 1; for (const [th, s] of c.sizeByTotal) if (d.total >= th) size = s;
      const pop = Math.max(0, 1 - (now - d.pop) / c.popMs) * (c.popScale - 1);
      txt.setText(String(d.total)).setScale(size + pop).setAlpha(age > c.holdMs ? 1 - (age - c.holdMs) / c.fadeMs : 1)
        .setPosition(p.x, p.y + c.offsetY * TILE_PX * 2 - (now - d.born) / 1000 * c.riseHex * TILE_PX);
    }
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 1280, height: 720, backgroundColor: hexStr(PALETTE.bg),
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, input: { activePointers: 3 }, scene: Arena });
