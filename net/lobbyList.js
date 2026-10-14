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

export function createLobbyList({ backend = 'fake', now = () => Date.now() } = {}) {
  const be = backend === 'fake' ? fakeBackend() : backend; let timer = null, lastCode = null;
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
