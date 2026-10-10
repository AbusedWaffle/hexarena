import json
top=["########################",
     "#..........x...........#",
     "#..xx..................#",
     "#R.x....x...#####...x..#",
     "#.R.....x.......#......#",
     "#R....######....x...#..#",
     "#.R.........x...#...#..#",
     "#R.....xx...........x..#"]
W,H=24,16
g=[list(r) for r in top]+[[None]*W for _ in range(8)]
for y in range(8):
  for x in range(W):
    c=top[y][x]; g[H-1-y][W-1-x]={"R":"B"}.get(c,c)
assert all(len(r)==W for r in g)
tiles=[];sp={"red":[],"blue":[]}
for y in range(H):
  for x in range(W):
    c=g[y][x]
    if c=="R": sp["red"].append({"x":x,"y":y})
    if c=="B": sp["blue"].append({"x":x,"y":y})
    t={"#":"wall","x":"crate"}.get(c,"floor")
    if t!="floor": tiles.append({"x":x,"y":y,"type":t})
zones={"red":{"x0":1,"x1":2},"blue":{"x0":21,"x1":22}}
m={"id":"paintyard_sq_01","name":"Paintyard","grid":"square","width":W,"height":H,
   "_note":"Kun vægge og kasser er listet; alt andet er floor. Kasse-HP kommer fra _match.crateHp.",
   "rows":["".join(r) for r in g],"tiles":tiles,"spawns":sp,"spawnZones":zones}
json.dump(m,open("map_paintyard_sq_01.json","w"),indent=1)
print("\n".join(m["rows"]))
from collections import deque
s=(sp["red"][0]["x"],sp["red"][0]["y"]);seen={s};q=deque([s])
while q:
  x,y=q.popleft()
  for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
    n=(x+dx,y+dy)
    if g[n[1]][n[0]] not in "#x" and n not in seen: seen.add(n);q.append(n)
print("alle spawns nås (uden at bryde kasser):",all((p["x"],p["y"]) in seen for t in sp for p in sp[t]), len(sp["red"]),len(sp["blue"]))
