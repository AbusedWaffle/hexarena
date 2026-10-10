import json
W,H=15,11
grid={}
for row in range(H):
  for col in range(W):
    t="floor"
    if row in(0,H-1) or col in(0,W-1): t="wall"
    grid[(col,row)]=t
# blue half features (mirrored by point symmetry)
walls=[(3,2),(3,3),(4,7),(5,7),(6,4),(6,5),(2,8)]
crates=[(2,2),(4,3),(4,5),(3,7),(6,2),(5,9),(7,3),(7,1)]
def mir(c):return (W-1-c[0],H-1-c[1])
for c in walls: grid[c]="wall"; grid[mir(c)]="wall"
for c in crates: grid[c]="crate"; grid[mir(c)]="crate"
grid[(7,5)]="crate"  # center
def ax(col,row): return {"q":col-(row-(row&1))//2,"r":row}
tiles=[]
for (col,row),t in sorted(grid.items(),key=lambda k:(k[0][1],k[0][0])):
  d=ax(col,row); d["type"]=t
  if t=="crate": d["hp"]=100
  tiles.append(d)
blue=[(1,3),(1,5),(1,7),(2,4),(2,6)]
spawns={"blue":[ax(*c) for c in blue],"red":[ax(*mir(c)) for c in blue]}
for c in blue: assert grid[c]=="floor" and grid[mir(c)]=="floor"
m={"id":"paintyard_01","name":"Paintyard","width":W,"height":H,"coords":"axial pointy-top, rektangel i odd-r offset","tiles":tiles,"spawns":spawns}
json.dump(m,open("map_paintyard_01.json","w"),indent=1)
# ascii preview + connectivity check
sym={"floor":".","wall":"#","crate":"x"}
sp={c:"B" for c in blue}; sp.update({mir(c):"R" for c in blue})
for row in range(H):
  print((" " if row&1 else "")+" ".join(sp.get((col,row),sym[grid[(col,row)]]) for col in range(W)))
from collections import deque
start=blue[0];seen={start};q=deque([start])
def nb(c,r):
  d=[(1,0),(-1,0),(0,-1),(0,1),(-1,-1),(-1,1)] if r%2==0 else [(1,0),(-1,0),(1,-1),(1,1),(0,-1),(0,1)]
  return [(c+a,r+b) for a,b in d]
while q:
  c=q.popleft()
  for n in nb(*c):
    if n in grid and grid[n]!="wall" and n not in seen: seen.add(n);q.append(n)
print("red spawns reachable:",all(mir(c) in seen for c in blue))
