import json
from collections import deque
# Top-halvdele; nederste halvdel = punktspejling (R->B). Gange >= 2 felter.
MAPS=[
 ("alley_sq_01","Gyden","small",[2,4],[
  "################",
  "#R......x......#",
  "#R.xx......##..#",
  "#.R....x...x...#",
  "#R..##.....x...#"]),
 ("cross_sq_01","Krydset","small",[2,4],[
  "##################",
  "#.......xx.......#",
  "#R..x.........#..#",
  "#.R.x...##....#..#",
  "#R.....x.........#",
  "#.R..###.....x...#"]),
 ("warehouse_sq_01","Lagerhallen","medium",[3,4],[
  "########################",
  "#.....x.....x..........#",
  "#..xx...xx.....xx..x...#",
  "#R........x.........x..#",
  "#.R..x.......xx........#",
  "#R...x..xx.......x..#..#",
  "#.R.......x...x.....#..#",
  "#R....xx.......x.......#"]),
 ("canal_sq_01","Kanalen","medium",[3,4],[
  "##########################",
  "#.........x..............#",
  "#R.xx.....x....####..x...#",
  "#.R.....##.........x.....#",
  "#R...x.......x.....x..#..#",
  "#.R..x..####......x...#..#",
  "#R.......................#"]),
 ("factory_sq_01","Fabrikken","large",[4,4],[
  "################################",
  "#..............x...............#",
  "#..xx....####..x.....xx....x...#",
  "#R.....................x.......#",
  "#.R..x.....x....######.x...#...#",
  "#R...x.....x...........x...#...#",
  "#.R.....######.....x...........#",
  "#R.................x.....xx....#",
  "#..##.....x....x.........x.....#",
  "#.........x....x...###.........#"]),
]
out=[{"id":"paintyard_sq_01","name":"Malergården","size":"medium","width":24,"height":16,"players":[3,4],"file":"data/map_paintyard_sq_01.json"}]
for mid,name,size,pl,top in MAPS:
  W=len(top[0]);h=len(top);H=2*h
  assert all(len(r)==W for r in top),mid
  g=[list(r) for r in top]+[[None]*W for _ in range(h)]
  for y in range(h):
    for x in range(W): g[H-1-y][W-1-x]={"R":"B"}.get(top[y][x],top[y][x])
  tiles=[];sp={"red":[],"blue":[]}
  for y in range(H):
    for x in range(W):
      c=g[y][x]
      if c=="R": sp["red"].append({"x":x,"y":y})
      if c=="B": sp["blue"].append({"x":x,"y":y})
      t={"#":"wall","x":"crate"}.get(c)
      if t: tiles.append({"x":x,"y":y,"type":t})
  s=(sp["red"][0]["x"],sp["red"][0]["y"]);seen={s};q=deque([s])
  while q:
    x,y=q.popleft()
    for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
      n=(x+dx,y+dy)
      if g[n[1]][n[0]] not in "#x" and n not in seen: seen.add(n);q.append(n)
  ok=all((p["x"],p["y"]) in seen for t in sp for p in sp[t])
  assert ok and len(sp["red"])>=4,(mid,len(sp["red"]))
  m={"id":mid,"name":name,"grid":"square","width":W,"height":H,"size":size,
     "_note":"Kun vægge og kasser er listet; alt andet er floor. Kasse-HP kommer fra _match.crateHp.",
     "rows":["".join(r) for r in g],"tiles":tiles,"spawns":sp,
     "spawnZones":{"red":{"x0":1,"x1":2},"blue":{"x0":W-3,"x1":W-2}}}
  json.dump(m,open(f"map_{mid}.json","w"),indent=1)
  out.append({"id":mid,"name":name,"size":size,"width":W,"height":H,"players":pl,"file":f"data/map_{mid}.json"})
  print(name,W,H,len(sp["red"]),"OK");print("\n".join(m["rows"]))
json.dump({"default":"paintyard_sq_01","sizes":{"small":"Lille","medium":"Mellem","large":"Stor"},"maps":out},open("maps.json","w"),indent=1,ensure_ascii=False)
