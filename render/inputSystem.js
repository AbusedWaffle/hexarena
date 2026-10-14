// InputSystem v1 – Brawl Stars-styring. Output: InputFrame { move, aim, fire, ability, abilityAim, seq }.
// Ved intet om våben, mål eller grid. Alle tal i logiske px (1280×720).
export const INPUT = {
  stickRadius: 70, deadzone: 0.12,       // joystick-radius og deadzone (andel af radius)
  tapMaxPx: 18, tapMaxMs: 200,           // tap = auto-aim, hvis fingeren ikke er trukket længere end dette
  cancelPx: 18,                          // træk tilbage til midten og slip = annullér
  abilityBtn: { x: 1150, y: 560, r: 54 },// fast ability-knap
  aimMaxPx: 110,                         // træklængde, der giver fuld længde (granat-afstand)
};

export function createInputSystem(scene, { getPlayerScreenPos, getAbilityRangePx }) {
  const C = INPUT, keys = scene.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E,Q');
  scene.input.addPointer(2);
  scene.input.mouse?.disableContextMenu();
  let seq = 0, move = null, attack = null, abil = null, pendingFire = null, pendingAbility = null, mouse = null;
  const ptr = (id) => { const p = scene.input.manager.pointers.find(q => q.id === id); if (!p) return p; const l = p.wasTouch && live.get(p.identifier); return l ? { ...l, id: p.id, wasTouch: true, upTime: p.upTime, identifier: p.identifier } : p; };
  const lastSeen = new Map(); // sidste kendte position pr. finger, også efter slip
  const lastPos = (p) => { const l = lastSeen.get(p.identifier); return l ? { x: l.x, y: l.y, upTime: p.upTime, id: p.id } : p; };
  const inBtn = (p) => Math.hypot(p.x - C.abilityBtn.x, p.y - C.abilityBtn.y) <= C.abilityBtn.r * 1.25;
  const drag = (s, p) => { const d = Math.hypot(p.x - s.ox, p.y - s.oy); if (s.max !== undefined && d > s.max) s.max = d; return { x: p.x - s.ox, y: p.y - s.oy, d }; };

  // Hele venstre/højre halvdel af skærmen tæller, også sorte kanter uden for selve spillet (Phaser sender dem som *outside*).
  // Tryk på DOM-UI (≡-menu, lobby, knapper) må ikke blive til skud/joystick
  const onUi = (p) => { const t = p.event?.target; return !!(t && t !== scene.game.canvas && t.closest?.('button, a, input, .hl-wrap, .hi-wrap, .hm-ingame')); };
  const onDown = (p) => {
    if (onUi(p)) { if (!p.wasTouch) mouse = null; return; }
    if (!p.wasTouch) { mouse = { right: p.rightButtonDown() }; return; }
    if (inBtn(p) && !abil) { abil = { id: p.id, ox: C.abilityBtn.x, oy: C.abilityBtn.y, max: 0, t: p.downTime }; return; }
    if (p.x < 640 && !move) { move = { id: p.id, ox: p.x, oy: p.y }; return; }   // flydende joystick
    if (p.x >= 640 && !attack) attack = { id: p.id, ox: p.x, oy: p.y, max: 0, t: p.downTime };
  };
  scene.input.on('pointerdown', onDown); scene.input.on('pointerdownoutside', onDown);
  // Phaser opdaterer kun pointere, mens fingeren er over selve canvas. Vi følger derfor alle fingre på hele
  // skærmen selv, så et joystick startet i en sort kant (eller trukket ud over kanten) stadig virker.
  const live = new Map(), sm = scene.scale;
  const pos = (t) => ({ x: sm.transformX(t.pageX), y: sm.transformY(t.pageY) });
  const track = (e) => { for (const t of e.changedTouches) { const q = pos(t); live.set(t.identifier, q); lastSeen.set(t.identifier, q); } };
  const untrack = (e) => { for (const t of e.changedTouches) { lastSeen.set(t.identifier, pos(t)); live.delete(t.identifier); } };
  const opts = { capture: true, passive: true };
  window.addEventListener('touchstart', track, opts); window.addEventListener('touchmove', track, opts);
  window.addEventListener('touchend', untrack, opts); window.addEventListener('touchcancel', untrack, opts);
  scene.events.once('shutdown', () => { for (const [n, f] of [['touchstart', track], ['touchmove', track], ['touchend', untrack], ['touchcancel', untrack]]) window.removeEventListener(n, f, opts); });
  scene.input.on('pointermove', (p) => {
    for (const s of [attack, abil]) if (s && s.id === p.id) s.max = Math.max(s.max, drag(s, p).d);
  });
  const onUp = (p) => {
    if (!p.wasTouch && !mouse) return; // museknappen blev trykket på UI
    if (!p.wasTouch) { // desktop: venstre slip = manuelt skud mod musen, højre slip = sigtet ability
      const s = getPlayerScreenPos(), v = { x: p.x - s.x, y: p.y - s.y };
      if (mouse?.right) pendingAbility = { aim: scaleTo(v, Math.min(1, Math.hypot(v.x, v.y) / Math.max(1, getAbilityRangePx()))) };
      else pendingFire = { aim: v };
      mouse = null; return;
    }
    if (move && move.id === p.id) { move = null; return; }
    if (attack && attack.id === p.id) { pendingFire = release(attack, lastPos(p)); attack = null; return; }
    if (abil && abil.id === p.id) { const r = release({ ...abil, ox: abil.ox, oy: abil.oy }, lastPos(p), true); pendingAbility = r; abil = null; }
  };
  scene.input.on('pointerup', onUp); scene.input.on('pointerupoutside', onUp);
  // tap → auto (aim null), træk → manuel, træk tilbage og slip → annullér (null-resultat)
  function release(s, p, isAbility = false) {
    const d = drag(s, p);
    if (s.max < C.tapMaxPx && (isAbility || p.upTime - s.t < C.tapMaxMs + 400)) return { aim: null };
    if (d.d < C.cancelPx) return null;
    return { aim: isAbility ? scaleTo(d, Math.min(1, d.d / C.aimMaxPx)) : { x: d.x, y: d.y } };
  }
  function stick(s) {
    const p = ptr(s.id); if (!p) return { x: 0, y: 0, kx: s.ox, ky: s.oy };
    const d = drag(s, p), m = Math.min(1, d.d / C.stickRadius);
    if (m < C.deadzone) return { x: 0, y: 0, kx: s.ox, ky: s.oy };
    const k = Math.min(d.d, C.stickRadius);
    return { x: d.x / d.d * m, y: d.y / d.d * m, kx: s.ox + d.x / d.d * k, ky: s.oy + d.y / d.d * k };
  }

  const api = {
    // til HUD: hvad der skal tegnes lige nu (skærmkoordinater)
    state() {
      const out = { move: null, attack: null, ability: null, abilityPressed: !!abil };
      if (move) out.move = { ox: move.ox, oy: move.oy, ...stick(move) };
      if (attack) { const p = ptr(attack.id); if (p) { const d = drag(attack, p); out.attack = { ox: attack.ox, oy: attack.oy, x: p.x, y: p.y, cancel: attack.max >= C.tapMaxPx && d.d < C.cancelPx } } }
      if (abil) { const p = ptr(abil.id); if (p) { const d = drag(abil, p); out.ability = { x: p.x, y: p.y, cancel: abil.max >= C.tapMaxPx && d.d < C.cancelPx } } }
      return out;
    },
    // retning til sigtelinjen (null = ingen manuel sigte i gang)
    aimPreview() {
      if (attack) { const p = ptr(attack.id); if (!p) return null; const d = drag(attack, p); if (attack.max < C.tapMaxPx) return null; return d.d < C.cancelPx ? null : { x: d.x, y: d.y }; }
      if (mouse && !mouse.right) { const p = scene.input.activePointer, s = getPlayerScreenPos(); return { x: p.x - s.x, y: p.y - s.y }; }
      return null;
    },
    // retning + længde (0..1) til ability-sigte (granat-mål)
    abilityPreview() {
      if (abil) { const p = ptr(abil.id); if (!p) return null; const d = drag(abil, p); if (abil.max < C.tapMaxPx) return null; return d.d < C.cancelPx ? null : scaleTo(d, Math.min(1, d.d / C.aimMaxPx)); }
      if (mouse?.right) { const p = scene.input.activePointer, s = getPlayerScreenPos(), v = { x: p.x - s.x, y: p.y - s.y }; return scaleTo(v, Math.min(1, Math.hypot(v.x, v.y) / Math.max(1, getAbilityRangePx()))); }
      return null;
    },
    frame() {
      let mx = (keys.D.isDown || keys.RIGHT.isDown) - (keys.A.isDown || keys.LEFT.isDown);
      let my = (keys.S.isDown || keys.DOWN.isDown) - (keys.W.isDown || keys.UP.isDown);
      if (move) { const s = stick(move); mx = s.x; my = s.y; }
      const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
      let fire = false, aim = api.aimPreview(), ability = false, abilityAim = null;
      if (Phaser.Input.Keyboard.JustDown(keys.SPACE)) { fire = true; aim = null; }
      if (pendingFire) { fire = true; aim = pendingFire.aim; } pendingFire = null;
      if (Phaser.Input.Keyboard.JustDown(keys.E) || Phaser.Input.Keyboard.JustDown(keys.Q)) { ability = true; abilityAim = null; }
      if (pendingAbility) { ability = true; abilityAim = pendingAbility.aim; } pendingAbility = null;
      // sim'en læser ability-sigte fra `aim`, når ability er true og der ikke skydes samtidig
      if (ability && !fire) aim = abilityAim;
      return { move: { x: mx, y: my }, aim, fire, ability, seq: ++seq };
    },
  };
  return api;
}
function scaleTo(v, len) { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l * len, y: v.y / l * len }; }
