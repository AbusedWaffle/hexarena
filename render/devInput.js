// Midlertidigt dev-input (tastatur/mus + simpel touch). Frontends InputSystem erstatter det; output er samme InputFrame.
export function createDevInput(scene, getPlayerScreenPos) {
  const k = scene.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E');
  let seq = 0, pendingFire = null, aiming = null, moveTouch = null;
  scene.input.addPointer(2);
  scene.input.on('pointerdown', (p) => {
    if (p.wasTouch && p.x < scene.scale.width / 2) { moveTouch = { id: p.id, ox: p.x, oy: p.y }; return; }
    aiming = { id: p.id, ox: p.x, oy: p.y, t: p.downTime };
  });
  scene.input.on('pointerup', (p) => {
    if (moveTouch && moveTouch.id === p.id) { moveTouch = null; return; }
    if (!aiming || aiming.id !== p.id) return;
    const dir = currentAim(p);
    pendingFire = (p.wasTouch && Math.hypot(p.x - aiming.ox, p.y - aiming.oy) < 18 && p.upTime - aiming.t < 200) ? { aim: null } : { aim: dir };
    aiming = null;
  });
  function currentAim(p) {
    if (p.wasTouch) return { x: p.x - aiming.ox, y: p.y - aiming.oy };
    const s = getPlayerScreenPos(); return { x: p.x - s.x, y: p.y - s.y };
  }
  return {
    aimPreview() { if (!aiming) return null; const p = scene.input.manager.pointers.find(q => q.id === aiming.id) || scene.input.activePointer; const d = currentAim(p); return Math.hypot(d.x, d.y) > 18 || !p.wasTouch ? d : null; },
    frame() {
      let mx = (k.D.isDown || k.RIGHT.isDown) - (k.A.isDown || k.LEFT.isDown), my = (k.S.isDown || k.DOWN.isDown) - (k.W.isDown || k.UP.isDown);
      if (moveTouch) { const p = scene.input.manager.pointers.find(q => q.id === moveTouch.id); if (p) { const dx = p.x - moveTouch.ox, dy = p.y - moveTouch.oy, l = Math.hypot(dx, dy); if (l > 8) { const m = Math.min(1, l / 70); mx = dx / l * m; my = dy / l * m; } } }
      const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
      let fire = false, aim = aiming ? this.aimPreview() : null;
      if (Phaser.Input.Keyboard.JustDown(k.SPACE)) { fire = true; aim = null; }
      if (pendingFire) { fire = true; aim = pendingFire.aim; pendingFire = null; }
      return { move: { x: mx, y: my }, aim, fire, ability: Phaser.Input.Keyboard.JustDown(k.E), seq: ++seq };
    },
  };
}
