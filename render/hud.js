// HUD v1 – ren visning af snapshot + InputSystem-state. Alt i skærmkoordinater (scrollFactor 0).
import { PALETTE } from '../art/palette.js';
import { TILE_PX } from '../sim/grid.js';
import { INPUT } from './inputSystem.js';
import { hasLineOfSight } from '../sim/world.js';

const hexStr = (c) => '#' + c.toString(16).padStart(6, '0');
export const HUD = { mini: { tile: 5, margin: 16 }, arrow: { inset: 26, size: 11 } };

export function createHud(scene, { map, classes, world, input, meId = 'me' }) {
  const g = scene.add.graphics().setDepth(20);
  const font = 'Roboto Mono, monospace';
  const scoreB = scene.add.text(560, 14, '', { fontFamily: font, fontSize: 34, color: hexStr(PALETTE.blue), fontStyle: 'bold' }).setOrigin(1, 0).setDepth(21);
  const scoreR = scene.add.text(720, 14, '', { fontFamily: font, fontSize: 34, color: hexStr(PALETTE.red), fontStyle: 'bold' }).setOrigin(0, 0).setDepth(21);
  const clock = scene.add.text(640, 18, '', { fontFamily: font, fontSize: 26, color: hexStr(PALETTE.score) }).setOrigin(0.5, 0).setDepth(21);
  const center = scene.add.text(640, 300, '', { fontFamily: font, fontSize: 40, color: hexStr(PALETTE.text), align: 'center', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(21);
  const abilTxt = scene.add.text(INPUT.abilityBtn.x, INPUT.abilityBtn.y, '', { fontFamily: font, fontSize: 22, color: hexStr(PALETTE.text) }).setOrigin(0.5).setDepth(21);
  for (const t of [scoreB, scoreR, clock]) t.setShadow(0, 0, '#000', 6, false, true);
  // Alt HUD ligger i én container, der modvirker kameraets zoom, så HUD'en altid er i skærmkoordinater (1280×720)
  // uanset hvor meget kameraet zoomer. Skærm s vises når container-position = c - c/z og skala = 1/z (c = skærmens midte).
  const layer = scene.add.container(0, 0, [g, scoreB, scoreR, clock, center, abilTxt]).setScrollFactor(0).setDepth(20);
  const fitLayer = () => { const z = scene.cameras.main.zoom; layer.setScale(1 / z).setPosition(640 - 640 / z, 360 - 360 / z); };
  const toScreen = (wx, wy) => { const c = scene.cameras.main, v = c.worldView; return { x: (wx - v.x) * c.zoom, y: (wy - v.y) * c.zoom }; };
  const M = HUD.mini, mw = map.width * M.tile, mh = map.height * M.tile, mx0 = 1280 - M.margin - mw, my0 = M.margin;
  const isTouch = scene.sys.game.device.input.touch;
  let lastRoundMsg = null;

  return {
    // kaldes med hvert event fra sim/netværk
    onEvent(e, snap) {
      if (e.type !== 'roundEnd') return;
      const me = snap.players.find(p => p.id === meId), mine = e.winner === me?.team;
      lastRoundMsg = e.winner === 'draw' ? { text: 'UAFGJORT RUNDE', color: hexStr(PALETTE.text), t: scene.time.now }
        : { text: mine ? 'RUNDE VUNDET' : 'RUNDE TABT', color: hexStr(mine ? PALETTE.blueGlow : PALETTE.redGlow), t: scene.time.now };
    },
    // læg et ekstra objekt (fx hjælpetekst) i HUD-laget
    add(obj) { layer.add(obj); return obj; },
    toScreen,
    draw(snap) {
      fitLayer(); g.clear();
      const me = snap.players.find(p => p.id === meId), m = snap.match, cam = scene.cameras.main, v = cam.worldView;
      // score og ur
      const mm = Math.floor(m.timeLeft / 60), ss = String(Math.floor(m.timeLeft % 60)).padStart(2, '0');
      scoreB.setText(m.score.blue); scoreR.setText(m.score.red); clock.setText(m.over ? 'SLUT' : `${mm}:${ss}`);
      g.fillStyle(0x000000, 0.35).fillRoundedRect(540, 10, 200, 46, 10);
      const MC = classes._match || {}, knockout = (m.mode || MC.mode) === 'knockout';
      if (knockout) {
        // rundestilling: én prik pr. vundet runde (først til roundsToWin), levende spillere som små figurer
        const need = MC.roundsToWin || 3;
        for (let i = 0; i < need; i++) {
          g.fillStyle(i < m.score.blue ? PALETTE.blue : 0x000000, i < m.score.blue ? 1 : 0.5).lineStyle(2, PALETTE.blue, 0.9).fillCircle(522 - i * 18, 33, 6).strokeCircle(522 - i * 18, 33, 6);
          g.fillStyle(i < m.score.red ? PALETTE.red : 0x000000, i < m.score.red ? 1 : 0.5).lineStyle(2, PALETTE.red, 0.9).fillCircle(758 + i * 18, 33, 6).strokeCircle(758 + i * 18, 33, 6);
        }
        for (const team of ['blue', 'red']) {
          const ps = snap.players.filter(p => p.team === team), col = team === 'blue' ? PALETTE.blue : PALETTE.red;
          ps.forEach((p, i) => { const x = team === 'blue' ? 620 - i * 16 : 660 + i * 16; g.fillStyle(p.alive ? col : 0x000000, p.alive ? 1 : 0.4).lineStyle(1.5, col, p.alive ? 1 : 0.5).fillRect(x - 5, 62, 10, 10).strokeRect(x - 5, 62, 10, 10); });
        }
      }

      // minikort: vægge, kasser, spawn-zoner, egne folk; fjender kun med synslinje
      g.fillStyle(PALETTE.bg, 0.8).fillRect(mx0 - 3, my0 - 3, mw + 6, mh + 6).lineStyle(1, PALETTE.wallEdge, 0.8).strokeRect(mx0 - 3, my0 - 3, mw + 6, mh + 6);
      if (map.spawnZones) for (const [team, z] of Object.entries(map.spawnZones)) g.fillStyle(team === 'blue' ? PALETTE.blue : PALETTE.red, 0.18).fillRect(mx0 + z.x0 * M.tile, my0, (z.x1 - z.x0 + 1) * M.tile, mh);
      for (const t of world.tiles.values()) if (t.type === 'wall' || t.type === 'crate') g.fillStyle(t.type === 'wall' ? PALETTE.wallEdge : PALETTE.crateEdge, t.type === 'wall' ? 0.9 : 0.6).fillRect(mx0 + t.x * M.tile, my0 + t.y * M.tile, M.tile, M.tile);
      for (const p of snap.players) {
        if (!p.alive) continue;
        const ally = p.team === me.team, seen = ally || (me.alive && hasLineOfSight(world, me, p));
        if (!seen) continue;
        const px = mx0 + p.x / TILE_PX * M.tile, py = my0 + p.y / TILE_PX * M.tile;
        g.fillStyle(p.team === 'blue' ? PALETTE.blueGlow : PALETTE.redGlow, 1).fillCircle(px, py, p.id === meId ? 3.5 : 2.5);
        if (p.id === meId) g.lineStyle(1, 0xffffff, 1).strokeCircle(px, py, 5);
      }
      g.lineStyle(1, 0xffffff, 0.35).strokeRect(mx0 + v.x / TILE_PX * M.tile, my0 + v.y / TILE_PX * M.tile, v.width / TILE_PX * M.tile, v.height / TILE_PX * M.tile);

      // pile ved skærmkanten for spillere uden for skærmen (fjender kun med synslinje)
      if (me.alive) for (const p of snap.players) {
        if (!p.alive || p.id === meId || v.contains(p.x, p.y)) continue;
        const ally = p.team === me.team; if (!ally && !hasLineOfSight(world, me, p)) continue;
        const { x: sx, y: sy } = toScreen(p.x, p.y), cx = 640, cy = 360, dx = sx - cx, dy = sy - cy;
        const k = Math.min((640 - HUD.arrow.inset) / Math.abs(dx || 1e-6), (360 - HUD.arrow.inset) / Math.abs(dy || 1e-6));
        const ax = cx + dx * k, ay = cy + dy * k, a = Math.atan2(dy, dx), s = HUD.arrow.size;
        g.fillStyle(p.team === 'blue' ? PALETTE.blue : PALETTE.red, ally ? 0.45 : 0.95)
          .fillTriangle(ax + Math.cos(a) * s, ay + Math.sin(a) * s, ax + Math.cos(a + 2.4) * s, ay + Math.sin(a + 2.4) * s, ax + Math.cos(a - 2.4) * s, ay + Math.sin(a - 2.4) * s);
      }

      // auto-aim-mål: den fjende et tap vil ramme (me.autoTargetId fra sim), som en pulserende ring under figuren
      const tgt = me.alive && me.autoTargetId && snap.players.find(p => p.id === me.autoTargetId && p.alive);
      if (tgt) {
        const { x: zx, y: zy } = toScreen(tgt.x, tgt.y), rr = (tgt.radius || 20) * cam.zoom + 8 + 2 * Math.sin(scene.time.now / 120);
        g.lineStyle(2, PALETTE.score, 0.85).strokeCircle(zx, zy, rr);
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.lineBetween(zx + Math.cos(a) * (rr + 2), zy + Math.sin(a) * (rr + 2), zx + Math.cos(a) * (rr + 8), zy + Math.sin(a) * (rr + 8)); }
      }

      // joysticks (kun mens de bruges) og ability-knap
      const st = input.state(), R = INPUT.stickRadius;
      if (st.move) { g.lineStyle(3, PALETTE.text, 0.25).strokeCircle(st.move.ox, st.move.oy, R).fillStyle(PALETTE.text, 0.35).fillCircle(st.move.kx, st.move.ky, 26); }
      if (st.attack) { const c = st.attack.cancel ? PALETTE.red : PALETTE.score; g.lineStyle(3, c, 0.3).strokeCircle(st.attack.ox, st.attack.oy, R).fillStyle(c, 0.4).fillCircle(st.attack.x, st.attack.y, 22); }
      const B = INPUT.abilityBtn, cls = classes[me.cls], cd = cls.ability?.cooldownSec || 1, left = me.abilityCooldownLeft || 0, ready = left <= 0 && me.alive;
      g.fillStyle(0x000000, 0.45).fillCircle(B.x, B.y, B.r).lineStyle(4, ready ? PALETTE.score : PALETTE.wallEdge, ready ? 0.95 : 0.6).strokeCircle(B.x, B.y, B.r);
      if (!ready && left > 0) { g.lineStyle(6, PALETTE.score, 0.9).beginPath(); g.arc(B.x, B.y, B.r - 3, -Math.PI / 2, -Math.PI / 2 + (1 - left / cd) * Math.PI * 2, false); g.strokePath(); }
      if (st.ability) g.lineStyle(2, st.ability.cancel ? PALETTE.red : PALETTE.score, 0.8).lineBetween(B.x, B.y, st.ability.x, st.ability.y).fillStyle(st.ability.cancel ? PALETTE.red : PALETTE.score, 0.6).fillCircle(st.ability.x, st.ability.y, 16);
      abilTxt.setText(ready ? (isTouch ? '★' : 'E') : left > 0 ? Math.ceil(left) : '').setAlpha(ready ? 1 : 0.8);

      // midter-besked: respawn / kamp slut
      const intro = m.roundIntroLeft || 0;
      if (lastRoundMsg && scene.time.now - lastRoundMsg.t < 2500 && !m.over) center.setText(lastRoundMsg.text).setColor(lastRoundMsg.color);
      else if (knockout && intro > 0 && !m.over) center.setText(`RUNDE ${m.round || 1}\n${Math.ceil(intro)}`).setColor(hexStr(PALETTE.score));
      else if (m.over) center.setText(m.score.blue === m.score.red ? 'UAFGJORT' : (m.score.blue > m.score.red) === (me.team === 'blue') ? 'SEJR' : 'NEDERLAG').setColor(hexStr(PALETTE.score));
      else if (!me.alive && knockout) center.setText('Du er ude – ser med').setColor(hexStr(PALETTE.text))
      else if (!me.alive) center.setText(`Respawn om ${Math.max(0, me.respawnLeft).toFixed(1)}`).setColor(hexStr(PALETTE.text));
      else center.setText('');
    },
  };
}
