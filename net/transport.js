// Transport-interface: { send(peer, ch, msg), broadcast(ch, msg), onMessage(fn(peer, ch, msg)), onPeerJoin(fn(peer)), onPeerLeave(fn(peer)), close() }
// ch: 'r' = reliable/ordnet (roster, events, lobby, kampslut), 'u' = unordnet (snapshots 20 Hz, inputs).
// Hosten er autoritativ; sim/ ved intet om transporten, så en rigtig server kan erstatte PeerJS senere.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // uden forvekslelige tegn (som FlipX)
export const makeCode = (n = 5) => Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const peerIdFor = (code) => 'hexarena-' + code.toUpperCase();

function emitter() {
  const h = { msg: [], join: [], leave: [], status: [] };
  return { h, on: (k, f) => h[k].push(f), emit: (k, ...a) => h[k].forEach(f => f(...a)) };
}

// TURN-relay kan sættes via opts.iceServers senere (Project Lead: fallback på mobilnet)
const peerOpts = (opts) => ({ debug: 1, ...(opts.iceServers ? { config: { iceServers: opts.iceServers } } : {}) });

export function createPeerHost(code, opts = {}) {
  const E = emitter(), peers = new Map(); // peerKey -> { r, u }
  const peer = new Peer(peerIdFor(code), peerOpts(opts));
  peer.on('open', () => E.emit('status', 'open', code));
  peer.on('error', (e) => E.emit('status', 'error', e.type || String(e)));
  peer.on('connection', (conn) => {
    const key = conn.metadata?.cid || conn.peer, ch = conn.label === 'u' ? 'u' : 'r';
    conn.on('open', () => {
      const p = peers.get(key) || {}; p[ch] = conn; peers.set(key, p);
      if (p.r && p.u && !p.joined) { p.joined = true; E.emit('join', key); }
    });
    conn.on('data', (m) => E.emit('msg', key, ch, m));
    conn.on('close', () => { const p = peers.get(key); if (p && p.joined) { peers.delete(key); E.emit('leave', key); } });
  });
  return {
    code, send: (key, ch, m) => { const c = peers.get(key)?.[ch]; if (c && c.open) c.send(m); },
    broadcast(ch, m) { for (const k of peers.keys()) this.send(k, ch, m); },
    onMessage: (f) => E.on('msg', f), onPeerJoin: (f) => E.on('join', f), onPeerLeave: (f) => E.on('leave', f), onStatus: (f) => E.on('status', f),
    close: () => peer.destroy(),
  };
}

export function createPeerClient(code, opts = {}) {
  const E = emitter(), cid = opts.cid || (sessionStorage.hexarenaCid ||= Math.random().toString(36).slice(2, 10)); // samme cid ved genindlæsning = reconnect
  const peer = new Peer(undefined, peerOpts(opts)), conns = {};
  peer.on('error', (e) => E.emit('status', 'error', e.type || String(e)));
  peer.on('open', () => {
    for (const ch of ['r', 'u']) {
      const c = peer.connect(peerIdFor(code), { label: ch, reliable: ch === 'r', serialization: 'json', metadata: { cid } });
      c.on('open', () => { conns[ch] = c; if (conns.r && conns.u) E.emit('join', 'host'); });
      c.on('data', (m) => E.emit('msg', 'host', ch, m));
      c.on('close', () => E.emit('leave', 'host'));
    }
  });
  return {
    cid, send: (_k, ch, m) => { const c = conns[ch]; if (c && c.open) c.send(m); }, broadcast(ch, m) { this.send('host', ch, m); },
    onMessage: (f) => E.on('msg', f), onPeerJoin: (f) => E.on('join', f), onPeerLeave: (f) => E.on('leave', f), onStatus: (f) => E.on('status', f),
    close: () => peer.destroy(),
  };
}

// Loopback til headless tests: simulerer latens og pakketab på 'u'-kanalen.
export function createLoopbackPair({ latencyMs = 0, lossU = 0, rnd = Math.random, now = () => 0, schedule } = {}) {
  const H = emitter(), clients = [];
  const deliver = (fn) => schedule ? schedule(latencyMs, fn) : fn();
  const host = {
    send(key, ch, m) { const c = clients.find(c => c.key === key); if (!c || (ch === 'u' && rnd() < lossU)) return; const s = JSON.stringify(m); deliver(() => c.E.emit('msg', 'host', ch, JSON.parse(s))); },
    broadcast(ch, m) { for (const c of clients) this.send(c.key, ch, m); },
    onMessage: (f) => H.on('msg', f), onPeerJoin: (f) => H.on('join', f), onPeerLeave: (f) => H.on('leave', f), onStatus: () => {}, close() {},
  };
  function addClient(key) {
    const E = emitter(), c = { key, E };
    clients.push(c);
    const api = {
      send(_k, ch, m) { if (ch === 'u' && rnd() < lossU) return; const s = JSON.stringify(m); deliver(() => H.emit('msg', key, ch, JSON.parse(s))); },
      broadcast(ch, m) { this.send('host', ch, m); },
      onMessage: (f) => E.on('msg', f), onPeerJoin: (f) => E.on('join', f), onPeerLeave: (f) => E.on('leave', f), onStatus: () => {}, close() {},
      connect() { H.emit('join', key); E.emit('join', 'host'); },
    };
    return api;
  }
  return { host, addClient };
}

// BroadcastChannel-transport (samme browser, flere faner) – til test af hele spillet uden WebRTC: ?host=1&net=bc / ?room=KODE&net=bc
export function createBcHost(code) {
  const E = emitter(), bc = new BroadcastChannel('hexarena-' + code), peers = new Set();
  bc.onmessage = ({ data: d }) => {
    if (d.to !== 'host') return;
    if (d.kind === 'join') { if (!peers.has(d.from)) { peers.add(d.from); E.emit('join', d.from); } bc.postMessage({ to: d.from, kind: 'joined' }); }
    else if (d.kind === 'leave') { peers.delete(d.from); E.emit('leave', d.from); }
    else E.emit('msg', d.from, d.ch, d.m);
  };
  setTimeout(() => E.emit('status', 'open', code), 0);
  return { code, send: (k, ch, m) => bc.postMessage({ to: k, ch, m }), broadcast(ch, m) { for (const k of peers) this.send(k, ch, m); },
    onMessage: (f) => E.on('msg', f), onPeerJoin: (f) => E.on('join', f), onPeerLeave: (f) => E.on('leave', f), onStatus: (f) => E.on('status', f), close: () => bc.close() };
}
export function createBcClient(code) {
  const E = emitter(), bc = new BroadcastChannel('hexarena-' + code), me = Math.random().toString(36).slice(2, 10);
  let joined = false;
  bc.onmessage = ({ data: d }) => { if (d.to !== me) return; if (d.kind === 'joined') { if (!joined) { joined = true; E.emit('join', 'host'); } } else E.emit('msg', 'host', d.ch, d.m); };
  const hello = setInterval(() => joined ? clearInterval(hello) : bc.postMessage({ to: 'host', from: me, kind: 'join' }), 300);
  addEventListener('pagehide', () => bc.postMessage({ to: 'host', from: me, kind: 'leave' }));
  return { cid: me, send: (_k, ch, m) => bc.postMessage({ to: 'host', from: me, ch, m }), broadcast(ch, m) { this.send('host', ch, m); },
    onMessage: (f) => E.on('msg', f), onPeerJoin: (f) => E.on('join', f), onPeerLeave: (f) => E.on('leave', f), onStatus: (f) => E.on('status', f), close: () => bc.close() };
}
