// Liste over åbne lobbyer (ÅBNE SPIL). Interface, som panelet bygger på; backend 'fake' (localStorage, deles mellem faner) indtil Firestore er sat op.
// Lobby = { code, hostName, mode, map, count, max, hasCode, updatedAt }
export const STALE_MS = 2 * 60 * 1000, HEARTBEAT_MS = 30 * 1000;
const KEY = 'hexarena.fakeLobbies';

export function fakeBackend(store = globalThis.localStorage) {
  const mem = {}; const rd = () => { try { return JSON.parse(store?.getItem(KEY) || '{}'); } catch { return { ...mem }; } };
  const wr = (o) => { try { store ? store.setItem(KEY, JSON.stringify(o)) : Object.assign(mem, o); } catch {} };
  return {
    async all() { return Object.values(store ? rd() : mem); },
    async put(l) { if (store) { const o = rd(); o[l.code] = l; wr(o); } else mem[l.code] = l; },
    async del(code) { if (store) { const o = rd(); delete o[code]; wr(o); } else delete mem[code]; },
  };
}

// Firestore (lobbies/{CODE}) via Firebase JS SDK fra gstatic, anonym login. Indlæses først ved brug; fejler den, giver list() [] og publish ignoreres.
const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const FIELDS = (l) => ({ hostName: String(l.hostName || 'Vært').slice(0, 40), mode: String(l.mode || 'knockout').slice(0, 20), map: String(l.map || '').slice(0, 40),
  max: Math.max(2, Math.min(40, l.max | 0)), count: Math.max(1, Math.min(Math.max(2, Math.min(40, l.max | 0)), l.count | 0)), hasCode: !!l.hasCode });
export function firestoreBackend() {
  let ready = null; const created = new Set();
  const init = () => ready ||= (async () => {
    const [app, auth, fs, { firebaseConfig }] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'), import('./firebaseConfig.js')]);
    const a = app.initializeApp(firebaseConfig, 'hexarena-lobbies'), au = auth.getAuth(a), db = fs.getFirestore(a);
    return { au, auth, db, fs };
  })().catch(e => { ready = null; throw e; });
  const login = async (x) => { if (!x.au.currentUser) await x.auth.signInAnonymously(x.au); return x.au.currentUser.uid; };
  return {
    async all() { const x = await init(), q = await x.fs.getDocs(x.fs.collection(x.db, 'lobbies'));
      return q.docs.map(d => { const v = d.data(); return { code: d.id, ...v, updatedAt: v.updatedAt?.toMillis?.() ?? 0, createdAt: v.createdAt?.toMillis?.() ?? 0 }; }); },
    async put(l) { const x = await init(), uid = await login(x), ref = x.fs.doc(x.db, 'lobbies', String(l.code).toUpperCase()), ts = x.fs.serverTimestamp();
      if (created.has(ref.id)) { try { await x.fs.updateDoc(ref, { ...FIELDS(l), hostUid: uid, updatedAt: ts }); return; } catch { created.delete(ref.id); } }
      await x.fs.setDoc(ref, { ...FIELDS(l), hostUid: uid, createdAt: ts, updatedAt: ts }); created.add(ref.id); },
    async del(code) { const x = await init(); await login(x); await x.fs.deleteDoc(x.fs.doc(x.db, 'lobbies', String(code).toUpperCase())); created.delete(String(code).toUpperCase()); },
  };
}
// 'auto' (standard): Firestore på live-siden; fake på localhost, under automatiserede tests (navigator.webdriver) eller med ?lobbies=fake
export function defaultBackend(loc = globalThis.location, nav = globalThis.navigator) {
  const q = loc ? new URLSearchParams(loc.search).get('lobbies') : null;
  if (q === 'fake' || q === 'firestore') return q;
  return !loc || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(loc.hostname) || nav?.webdriver ? 'fake' : 'firestore';
}
let shared = null; // én Firestore-forbindelse pr. side

export function createLobbyList({ backend = 'auto', now = () => Date.now() } = {}) {
  const kind = backend === 'auto' ? defaultBackend() : backend;
  const be = kind === 'fake' ? fakeBackend() : kind === 'firestore' ? (shared ||= firestoreBackend()) : backend; let timer = null, lastCode = null;
  const api = {
    async list() {
      try { const t = now(); return (await be.all()).filter(l => l && t - (l.updatedAt || 0) < STALE_MS && l.count < l.max).sort((a, b) => b.updatedAt - a.updatedAt); }
      catch { return []; }
    },
    async publish(lobby) { try { lastCode = lobby.code; await be.put({ ...lobby, updatedAt: now() }); } catch {} }, // fejl ignoreres: man kan stadig hoste
    async remove(code = lastCode) { try { if (code) await be.del(code); } catch {} },
    // Værten: publicér nu og hvert 30. s; getLobby() returnerer null, når lobbyen ikke skal vises (startet/fuld/lukket) -> fjernes
    startHeartbeat(getLobby) {
      api.stop(); const tick = () => { const l = getLobby(); if (l && l.count < l.max) api.publish(l); else api.remove(); };
      tick(); timer = setInterval(tick, HEARTBEAT_MS);
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
  return api;
}
