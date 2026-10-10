// HexArena palette + FX v1 – farver samplet fra Emils mockup
export const PALETTE = {
  bg:        0x06091A, // næsten sort navy
  hexFloor:  0x070B1E,
  hexLine:   0x1B2139, // tynde grid-linjer, 2 px ved 64 px hex
  zoneBlue:  0x08102A, // svag holdtone på spawn-zone hexes
  zoneRed:   0x120A16,
  wall:      0x1E2846, wallEdge: 0x3A4A75,
  crate:     0x3A2F22, crateEdge: 0xB08A4A,
  blue:      0x2563E8, blueGlow: 0x6FA0FF,
  red:       0xDC261B, redGlow:  0xFF7A6E,
  heal:      0x3DFFA8,
  text:      0xF2F5FF, score: 0xFFE27A,
};

export const FX = {
  glowBlur: 10, glowAlpha: 0.45,
  muzzleFlash: { ms: 60, scale: 1.6 },
  bulletTrail: { ms: 140, width: 3, alpha: 0.7 },     // holdfarvet streg
  hitSpark:    { count: 6, speed: 160, ms: 220, size: 3 }, // holdfarvede prikker
  hitFlash:    { ms: 80, tint: 0xFFFFFF },
  crateBreak:  { shards: 8, ms: 400 },
  crateDamageTint: [1.0, 0.8, 0.6],
  screenShake: { hit: 2, death: 6, ms: 120 },
  spawnShield: { pulseMs: 400, alpha: 0.35 },
  scorePop:    { scale: 1.4, ms: 200 },

  // Flydende skadetal, samlet pr. mål
  damageNumber: {
    mergeWindowMs: 600,      // træffer på samme mål inden for vinduet lægges sammen
    font: '700 28px "Roboto Mono", monospace',
    color: 0xFFFFFF, stroke: 0x000000, strokePx: 3,
    glowColor: 0xFFFFFF, glowBlur: 8,
    offsetY: -0.35,          // hex over målet
    popScale: 1.35, popMs: 120, // pop ved hvert nyt træf
    sizeByTotal: [[0, 1.0], [50, 1.2], [90, 1.45]], // samlet skade -> skala
    critColor: 0xFFE27A,     // Sniper Fokus / gennemboring
    riseHex: 0.4, holdMs: 500, fadeMs: 300,
    selfDamageColor: 0xFF5A5A, // når du selv bliver ramt
  },
};

// Enheder: kun cirkler og trekanter, som i mockuppen.
// Trekanter peger i sigteretningen. Klassen ses på form + størrelse.
export const SHAPES = {
  assault:  { shape: 'circle',   radius: 1.0 },
  support:  { shape: 'circle',   radius: 1.0, mark: 'plus' },
  engineer: { shape: 'circle',   radius: 1.15, ring: true },
  sniper:   { shape: 'triangle', radius: 1.1, aspect: 0.6 }, // smal
  scout:    { shape: 'triangle', radius: 0.85 },
};
