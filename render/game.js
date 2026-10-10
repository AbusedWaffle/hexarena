import { PALETTE, FX } from '../art/palette.js';
import { drawUnit } from '../art/shapes.js';
import { HEX_PX, hexCorners, hexToPixel } from '../sim/hex.js';
import { createWorld, addPlayer, step, snapshot, raycast, DT } from '../sim/world.js';
import { createDevInput } from './devInput.js';

const [map, classes] = await Promise.all(['data/map_paintyard_01.json', 'data/classes.json'].map(u => fetch(u).then(r => r.json())));
const hexStr = (c) => '#' + c.toString(16).padStart(6, '0');

class Arena extends Phaser.Scene {
  create() {
    this.world = createWorld(map, classes);
    this.me = addPlayer(this.world, { team: 'blue', cls: 'Assault', id: 'me' });
    // Placeholder-mål indtil AI er koblet på: røde Assaults, der strafer frem og tilbage
    this.dummies = [0, 1, 2].map(i => addPlayer(this.world, { team: 'red', cls: 'Assault', id: 'dummy' + i }));
    this.prev = this.cur = snapshot(this.world); this.acc = 0;
    this.staticG = this.add.graphics(); this.drawMap();
    this.g = this.add.graphics(); this.fxG = this.add.graphics(); this.ghosts = new Map(); this.pops = [];
    this.camTarget = this.add.zone(this.me.x, this.me.y, 1, 1);
    this.cameras.main.setBackgroundColor(hexStr(PALETTE.bg)).startFollow(this.camTarget, true, 0.15, 0.15);
    this.input_ = createDevInput(this, () => { const c = this.cameras.main; return { x: this.camTarget.x - c.worldView.x, y: this.camTarget.y - c.worldView.y }; });
    this.trails = []; this.dmg = new Map(); this.sparks = [];
    this.hud = this.add.text(640, 16, '', { fontFamily: 'Roboto Mono, monospace', fontSize: 28, color: hexStr(PALETTE.score) }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10);
    this.hud2 = this.add.text(16, 680, '', { fontFamily: 'Roboto Mono, monospace', fontSize: 18, color: hexStr(PALETTE.text) }).setScrollFactor(0).setDepth(10);
    this.help = this.add.text(16, 56, 'WASD bevæg · hold mus = sigt, slip = skyd · mellemrum = auto-aim\nMobil: venstre halvdel = bevæg, højre: tap = auto, træk+slip = manuel', { fontSize: 13, color: '#8a93b5' }).setScrollFactor(0).setDepth(10);
    this.t = 0;
  }
  drawMap() {
    const g = this.staticG, spawnSet = new Set(['blue', 'red'].flatMap(t => map.spawns[t].map(s => s.q + ',' + s.r + ',' + t)));
    for (const t of this.world.tiles.values()) {
      const zone = spawnSet.has(t.q + ',' + t.r + ',blue') ? PALETTE.zoneBlue : spawnSet.has(t.q + ',' + t.r + ',red') ? PALETTE.zoneRed : PALETTE.hexFloor;
      const fill = t.type === 'wall' ? PALETTE.wall : t.type === 'crate' ? PALETTE.crate : zone;
      const edge = t.type === 'wall' ? PALETTE.wallEdge : t.type === 'crate' ? PALETTE.crateEdge : PALETTE.hexLine;
      const cs = hexCorners(t.q, t.r, t.type === 'crate' ? HEX_PX * 0.78 : HEX_PX);
      if (t.type === 'crate') { const pf = hexCorners(t.q, t.r); g.fillStyle(zone).fillPoints(pf, true).lineStyle(2, PALETTE.hexLine).strokePoints(pf, true); }
      const tint = t.type === 'crate' ? FX.crateDamageTint[Math.min(2, Math.floor((1 - t.hp / t.maxHp) * 3))] : 1;
      g.fillStyle(fill, tint).fillPoints(cs, true).lineStyle(2, edge, 0.9).strokePoints(cs, true);
    }
  }
  update(_, dtMs) {
    this.t += dtMs / 1000; this.acc += dtMs / 1000;
    let redraw = false;
    while (this.acc >= DT) {
      this.acc -= DT;
      const inputs = { me: this.input_.frame() };
      this.dummies.forEach((d, i) => { inputs[d.id] = { move: { x: 0, y: Math.sin(this.t * 1.3 + i * 2) }, aim: null, fire: false, ability: false }; });
      step(this.world, inputs);
      this.prev = this.cur; this.cur = snapshot(this.world);
      for (const e of this.cur.events) {
        if (e.type === 'crateDamaged' || e.type === 'crateBroken' || e.type === 'crateRespawned') redraw = true;
        if (e.type === 'crateRespawnWarning') this.ghosts.set(e.q + ',' + e.r, { q: e.q, r: e.r, born: this.time.now });
        if (e.type === 'crateRespawnCancelled') this.ghosts.delete(e.q + ',' + e.r);
        if (e.type === 'crateRespawned') { this.ghosts.delete(e.q + ',' + e.r); this.pops.push({ q: e.q, r: e.r, born: this.time.now }); }
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
    this.draw(this.acc / DT);
  }
  draw(alpha) {
    const g = this.g, now = this.time.now; g.clear(); this.fxG.clear();
    const lerp = (a, b) => a + (b - a) * alpha;
    for (const p of this.cur.players) {
      const pp = this.prev.players.find(q => q.id === p.id) || p; if (!p.alive) continue;
      const x = lerp(pp.x, p.x), y = lerp(pp.y, p.y), col = p.team === 'blue' ? PALETTE.blue : PALETTE.red, glow = p.team === 'blue' ? PALETTE.blueGlow : PALETTE.redGlow, r = HEX_PX * 0.2;
      if (p.id === 'me') { this.camTarget.setPosition(x, y); g.lineStyle(2, 0xffffff, 0.8).strokeCircle(x, y, r + 5); }
      drawUnit(g, classes[p.cls]?.shape, x, y, r, Math.atan2(p.aim?.y || 0, p.aim?.x || 1), col, glow);
      if (p.spawnShieldLeft > 0) g.lineStyle(2, glow, FX.spawnShield.alpha + 0.3 * Math.sin(now / FX.spawnShield.pulseMs * 6.28)).strokeCircle(x, y, r + 9);
      g.fillStyle(0x000000, 0.6).fillRect(x - 18, y - r - 14, 36, 4).fillStyle(col).fillRect(x - 18, y - r - 14, 36 * p.hp / p.maxHp, 4);
      if (p.id === 'me') for (let i = 0; i < classes.Assault.weapon.charges; i++) { const f = i < p.charges ? 1 : i === p.charges ? p.chargeProgress : 0; g.fillStyle(0x000000, 0.6).fillRect(x - 18 + i * 12.5, y + r + 8, 11, 3).fillStyle(PALETTE.score).fillRect(x - 18 + i * 12.5, y + r + 8, 11 * f, 3); }
    }
    const aim = this.input_.aimPreview();
    if (aim && this.me.alive) { const r = raycast(this.world, this.me, aim, classes[this.me.cls].weapon.range * HEX_PX * Math.sqrt(3), { ignoreId: 'me', ignoreTeam: 'blue' }); g.lineStyle(3, PALETTE.blueGlow, 0.35).lineBetween(this.me.x, this.me.y, r.point.x, r.point.y); }
    for (const b of this.cur.projectiles) { const pb = this.prev.projectiles.find(q => q.id === b.id) || b; const x = lerp(pb.x, b.x), y = lerp(pb.y, b.y), c = b.team === 'blue' ? PALETTE.blueGlow : PALETTE.redGlow; g.lineStyle(FX.bulletTrail.width, c, FX.bulletTrail.alpha).lineBetween(pb.x, pb.y, x, y).fillStyle(c).fillCircle(x, y, 3); }
    this.trails = this.trails.filter(t => now - t.born < FX.bulletTrail.ms);
    for (const gh of this.ghosts.values()) { const a = FX.crateRespawn.ghostAlpha * (0.6 + 0.4 * Math.sin((now - gh.born) / FX.crateRespawn.pulseMs * 6.28)); const cs = hexCorners(gh.q, gh.r, HEX_PX * 0.78); this.fxG.fillStyle(PALETTE.crate, a).fillPoints(cs, true).lineStyle(2, PALETTE.crateEdge, a * 2).strokePoints(cs, true); }
    this.pops = this.pops.filter(pp => now - pp.born < FX.crateRespawn.popMs);
    for (const pp of this.pops) { const k = (now - pp.born) / FX.crateRespawn.popMs; this.fxG.lineStyle(3, PALETTE.crateEdge, 1 - k).strokePoints(hexCorners(pp.q, pp.r, HEX_PX * (0.78 + 0.25 * k)), true); }
    for (const t of this.trails) this.fxG.lineStyle(FX.bulletTrail.width, 0xffffff, 1 - (now - t.born) / FX.bulletTrail.ms).lineBetween(t.from.x, t.from.y, t.to.x, t.to.y);
    this.sparks = this.sparks.filter(s => now - s.born < FX.hitSpark.ms);
    for (const s of this.sparks) { const k = (now - s.born) / 1000; this.fxG.fillStyle(s.c, 1 - (now - s.born) / FX.hitSpark.ms).fillCircle(s.x + s.vx * k, s.y + s.vy * k, FX.hitSpark.size); }
    this.drawDamageNumbers(now);
    const m = this.cur.match, me = this.cur.players.find(p => p.id === 'me'), mm = Math.floor(m.timeLeft / 60), ss = String(Math.floor(m.timeLeft % 60)).padStart(2, '0');
    this.hud.setText(m.over ? `KAMP SLUT  ${m.score.blue} – ${m.score.red}` : `${m.score.blue}   ${mm}:${ss}   ${m.score.red}`);
    this.hud2.setText(me.alive ? `HP ${me.hp}/${me.maxHp}   Ladninger ${me.charges}` : `Respawn om ${Math.max(0, me.respawnLeft).toFixed(1)} s`);
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
        .setPosition(p.x, p.y + c.offsetY * HEX_PX - (now - d.born) / 1000 * c.riseHex * HEX_PX * 0.5);
    }
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 1280, height: 720, backgroundColor: hexStr(PALETTE.bg),
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, input: { activePointers: 3 }, scene: Arena });
