// Lobby-overlay for host: stor kode, QR til ?room=KODE, del/kopiér link, holdliste og status.
// Lytter på 'hexarena:lobby' fra render/game.js: detail = {code, status?, error?, roster?}.
import qrcode from '../vendor/qrcode.mjs';

const CSS = `
.hl-wrap{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(6,9,26,.82);font-family:var(--ha-font,'Roboto Mono',monospace);color:var(--ha-text,#E6ECFF);padding:max(8px,env(safe-area-inset-top)) 12px}
.hl-box{display:flex;flex-direction:row;gap:20px;align-items:center;max-width:760px;width:100%;max-height:100%;overflow:auto;box-sizing:border-box;padding:16px 20px;border-radius:14px;background:var(--ha-panel,#0B1030);border:2px solid var(--ha-edge,#22305A)}
.hl-col{display:flex;flex-direction:column;gap:10px;flex:1;min-width:0}
.hl-lbl{font-size:12px;opacity:.7;letter-spacing:.12em;text-transform:uppercase}
.hl-code{font-size:clamp(40px,9vh,64px);font-weight:700;letter-spacing:.18em;line-height:1;user-select:all}
.hl-qr{background:#fff;border-radius:10px;padding:8px;width:min(46vh,220px);aspect-ratio:1;flex:none;align-self:center}
.hl-qr svg{width:100%;height:100%;display:block}
.hl-status{font-size:13px;min-height:1.2em}.hl-status.err{color:#FF6B6B}
.hl-roster{display:flex;flex-wrap:wrap;gap:6px}
.hl-p{white-space:nowrap;font-size:12px;padding:3px 8px;border-radius:6px;border:1px solid currentColor}
.hl-p.blue{color:#4FA3FF}.hl-p.red{color:#FF5A5A}.hl-p.bot{opacity:.45}
.hl-row{display:flex;gap:8px;flex-wrap:wrap}
.hl-row .ha-btn{min-width:0;min-height:44px;font-size:16px;flex:1}
.hl-chip{position:fixed;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:40;font:600 13px 'Roboto Mono',monospace;padding:6px 10px;border-radius:8px;background:rgba(6,9,26,.8);color:#E6ECFF;border:1px solid #4FA3FF;cursor:pointer}
`;

let code = null, roster = [], status = 'connecting', error = '', open = true;
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
const st = el('style'); st.textContent = CSS; document.head.append(st);
const wrap = el('div', 'hl-wrap'); wrap.id = 'lobby';
const chip = el('button', 'hl-chip'); chip.id = 'lobby-chip'; chip.hidden = true;
chip.onclick = () => { open = true; render(); };

const link = () => location.origin + location.pathname + '?room=' + code;

function render() {
  if (!code) return;
  if (!wrap.isConnected) document.body.append(wrap, chip);
  wrap.hidden = !open; chip.hidden = open; chip.textContent = 'Kode ' + code;
  if (!open) return;
  wrap.replaceChildren();
  const box = el('div', 'hl-box'), left = el('div', 'hl-col');
  const codeEl = el('div', 'hl-code', code); codeEl.id = 'lobby-code';
  const s = el('div', 'hl-status' + (status === 'error' ? ' err' : ''),
    status === 'error' ? 'Netværksfejl: ' + error : status === 'open' ? 'Klar – venner kan nu deltage med koden' : 'Opretter spil…');
  s.id = 'lobby-status';
  const humans = roster.filter(r => r.human).length;
  const rl = el('div', 'hl-roster'); rl.id = 'lobby-roster';
  for (const r of roster) rl.append(el('span', 'hl-p ' + r.team + (r.human ? '' : ' bot'), (r.human ? (r.id === 'me' ? 'Dig' : 'Spiller') : 'Robot') + ' ' + (r.cls || '')));
  const row = el('div', 'hl-row');
  const share = el('button', 'ha-btn', navigator.share ? 'Del link' : 'Kopiér link'); share.id = 'lobby-share';
  share.onclick = async () => {
    try { if (navigator.share) await navigator.share({ title: 'HexArena', text: 'Spil med! Kode ' + code, url: link() }); else { await navigator.clipboard.writeText(link()); share.textContent = 'Kopieret ✓'; } }
    catch { try { await navigator.clipboard.writeText(link()); share.textContent = 'Kopieret ✓'; } catch {} }
  };
  const start = el('button', 'ha-btn primary', 'Start kampen'); start.id = 'lobby-start';
  start.onclick = () => { open = false; render(); };
  row.append(share, start);
  left.append(el('div', 'hl-lbl', 'Spilkode'), codeEl, s,
    el('div', 'hl-lbl', humans + ' spiller' + (humans === 1 ? '' : 'e') + ' · resten er robotter'), rl, row);
  const q = qrcode(0, 'M'); q.addData(link()); q.make();
  const qr = el('div', 'hl-qr'); qr.id = 'lobby-qr'; qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  box.append(left, qr); wrap.append(box);
}

globalThis.addEventListener('hexarena:lobby', (e) => {
  const d = e.detail || {};
  if (d.code) code = d.code;
  if (d.roster) roster = d.roster;
  if (d.status) { status = d.status; error = d.error || ''; if (status === 'error') open = true; }
  render();
});
