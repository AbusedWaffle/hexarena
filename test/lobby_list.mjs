// net/lobbyList.js med fake-backend: publish/list/remove, skjuler gamle og fulde lobbyer, heartbeat fjerner ved null.
const { createLobbyList, fakeBackend } = await import('../net/lobbyList.js');
let t = 1e6; const be = fakeBackend(null), L = createLobbyList({ backend: be, now: () => t }), errs = [], ok = (c, m) => { if (!c) errs.push(m); };
await L.publish({ code: 'AB12', hostName: 'Emil', mode: 'dom', map: 'harbor_sq_01', count: 2, max: 8, hasCode: true });
await L.publish({ code: 'FULL', hostName: 'X', mode: 'tdm', map: 'alley_sq_01', count: 8, max: 8, hasCode: true });
ok((await L.list()).map(l => l.code).join() === 'AB12', 'list viser kun åbne');
t += 3 * 60 * 1000; ok((await L.list()).length === 0, 'gamle skjules');
await L.publish({ code: 'AB12', hostName: 'Emil', mode: 'dom', map: 'harbor_sq_01', count: 3, max: 8, hasCode: true }); ok((await L.list())[0]?.count === 3, 'opdatering');
await L.remove('AB12'); ok((await L.list()).length === 0, 'remove');
let lob = { code: 'HB01', hostName: 'H', mode: 'kc', map: 'cross_sq_01', count: 1, max: 8, hasCode: true }; L.startHeartbeat(() => lob);
ok((await L.list()).length === 1, 'heartbeat publicerer'); lob = null; L.startHeartbeat(() => lob); ok((await L.list()).length === 0, 'heartbeat fjerner'); L.stop();
const bad = createLobbyList({ backend: { all: async () => { throw 1; }, put: async () => { throw 1; }, del: async () => { throw 1; } } });
await bad.publish({ code: 'Z' }); ok((await bad.list()).length === 0, 'fejl -> tom liste');
console.log(errs.length ? 'FEJL: ' + errs.join('; ') : 'OK: lobbyList'); process.exit(errs.length ? 1 : 0);
