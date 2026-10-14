import json,random
from collections import deque
# Store punktsymmetriske baner til spiltilstande. Zoner A/B/C holdes fri (3x3 + 1 felts kant).
def make(mid,name,W,H,seed,nblk):
  r=random.Random(seed);g=[['.']*W for _ in range(H)]
  for x in range(W): g[0][x]=g[H-1][x]='#'
  for y in range(H): g[y][0]=g[y][W-1]='#'
  B=(W//2-2,H//2-2);A=(W//4-1,H//2-1);C=(W-A[0]-3,H-A[1]-3)
  keep=set()
  for zx,zy in (A,B,C):
    for y in range(zy-1,zy+4):
      for x in range(zx-1,zx+4): keep.add((x,y))
  for y in range(1,H-1):
    for x in range(1,5): keep.add((x,y)); keep.add((W-1-x,H-1-y))
  def put(x,y,c):
    for (a,b) in ((x,y),(W-1-x,H-1-y)):
      if (a,b) in keep or not(0<a<W-1 and 0<b<H-1): return False
    g[y][x]=c;g[H-1-y][W-1-x]=c;return True
  for _ in range(nblk):
    x,y=r.randrange(5,W-5),r.randrange(2,H-2);c='#' if r.random()<.6 else 'x'
    if r.random()<.5:
      L=r.randint(2,5)
      for i in range(L): put(x+i,y,c) if r.random()<.5 else put(x,y+i,c)
    else:
      for dy in (0,1):
        for dx in (0,1): put(x+dx,y+dy,c)
  sp={"red":[],"blue":[]}
  for i in range(8):
    y=H//2-4+i;x=1+(i%2)
    g[y][x]='.';g[H-1-y][W-1-x]='.';sp["red"].append({"x":x,"y":y});sp["blue"].append({"x":W-1-x,"y":H-1-y})
  # gange: fjern solide felter med under 2 felts åbning lodret og vandret (simpel: sikr forbundethed)
  s=(1,H//2);seen={s};q=deque([s])
  while q:
    x,y=q.popleft()
    for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
      n=(x+dx,y+dy)
      if g[n[1]][n[0]]=='.' and n not in seen: seen.add(n);q.append(n)
  assert all((p["x"],p["y"]) in seen for t in sp for p in sp[t]),mid
  for zx,zy in (A,B,C): assert all((x,y) in seen for x in range(zx,zx+3) for y in range(zy,zy+3)),mid
  tiles=[{"x":x,"y":y,"type":{"#":"wall","x":"crate"}[g[y][x]]} for y in range(H) for x in range(W) if g[y][x]!='.']
  zones=[{"id":i,"x":zx,"y":zy,"w":3,"h":3} for i,(zx,zy) in zip("ABC",(A,B,C))]
  m={"id":mid,"name":name,"grid":"square","width":W,"height":H,"size":"xl","rows":["".join(r) for r in g],
     "tiles":tiles,"spawns":sp,"spawnZones":{"red":{"x0":1,"x1":2},"blue":{"x0":W-3,"x1":W-2}},"zones":zones}
  json.dump(m,open(f"map_{mid}.json","w"),indent=1);print(name,W,H,len(tiles));print("\n".join(m["rows"]))
def tryall(*a):
  for sd in range(a[4],a[4]+200):
    try: return make(*a[:4],sd,a[5])
    except AssertionError: pass
  raise SystemExit("ingen seed")
tryall("harbor_sq_01","Havnen",40,28,7,38)
tryall("city_sq_01","Byen",48,32,11,55)
MODES={"knockout":["small","medium","large","xl"],"tdm":["medium","large","xl"],"kc":["medium","large","xl"],
       "dom":["medium","large","xl"],"hp":["medium","large","xl"],"hq":["large","xl"]}
d=json.load(open("maps.json"));d["sizes"]["xl"]="Kæmpe"
d["maps"]=[m for m in d["maps"] if m["id"] not in("harbor_sq_01","city_sq_01")]
d["maps"]+= [{"id":"harbor_sq_01","name":"Havnen","size":"xl","width":40,"height":28,"players":[4,4],"file":"data/map_harbor_sq_01.json"},
             {"id":"city_sq_01","name":"Byen","size":"xl","width":48,"height":32,"players":[4,4],"file":"data/map_city_sq_01.json"}]
for m in d["maps"]: m["modes"]=[k for k,v in MODES.items() if m["size"] in v]
json.dump(d,open("maps.json","w"),indent=1,ensure_ascii=False)
modes=[
 {"id":"knockout","name":"Knockout","desc":"Ingen respawn. Holdet der vinder flest runder vinder kampen.","scoreTarget":3,"timeSec":75,"respawnSec":None,"mapTags":MODES["knockout"]},
 {"id":"tdm","name":"Team Deathmatch","desc":"Først til 30 drab. Man respawner efter 3 sekunder.","scoreTarget":30,"timeSec":480,"respawnSec":3,"mapTags":MODES["tdm"]},
 {"id":"kc","name":"Kill Confirmed","desc":"Saml fjendens mærke-brik op for at score. Tag holdkammeratens brik for at nægte point.","scoreTarget":30,"timeSec":480,"respawnSec":3,"tagLifeSec":30,"mapTags":MODES["kc"]},
 {"id":"dom","name":"Domination","desc":"Hold zonerne A, B og C. Hver zone giver 1 point i sekundet. Først til 200.","scoreTarget":200,"timeSec":600,"respawnSec":3,"capSec":5,"mapTags":MODES["dom"]},
 {"id":"hp","name":"Hardpoint","desc":"Stå alene i zonen for at score. Zonen flytter sig hvert 60. sekund.","scoreTarget":150,"timeSec":600,"respawnSec":3,"rotateSec":60,"mapTags":MODES["hp"]},
 {"id":"hq","name":"Headquarters","desc":"Indtag basen og forsvar den. Holdet der holder basen kan ikke respawne.","scoreTarget":200,"timeSec":600,"respawnSec":3,"capSec":6,"moveDelaySec":5,"mapTags":MODES["hq"]}]
json.dump({"default":"knockout","modes":modes},open("modes.json","w"),indent=1,ensure_ascii=False)
