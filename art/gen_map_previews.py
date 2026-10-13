# Laver preview-billeder af banerne i spillets stil: python3 art/gen_map_previews.py
import json
from PIL import Image, ImageDraw
H=lambda v:'#%06X'%v
P=dict(bg=0x06091A,floor=0x070B1E,line=0x1B2139,zb=0x08102A,zr=0x120A16,wall=0x1E2846,we=0x3A4A75,crate=0x3A2F22,ce=0xB08A4A,blue=0x6FA0FF,red=0xFF7A6E)
idx=json.load(open('data/maps.json'))
for e in idx['maps']:
    m=json.load(open(e['file'])); W,Hh=m['width'],m['height']; T=max(8,min(320//W,200//Hh))
    im=Image.new('RGB',(W*T+8,Hh*T+8),H(P['bg'])); d=ImageDraw.Draw(im); o=4
    z=m.get('spawnZones',{})
    for y,row in enumerate(m['rows']):
        for x,c in enumerate(row):
            r=(o+x*T,o+y*T,o+x*T+T-1,o+y*T+T-1)
            fl=P['floor']
            for t,k in(('blue','zb'),('red','zr')):
                if t in z and z[t]['x0']<=x<=z[t]['x1']: fl=P[k]
            if c=='#': d.rectangle(r,fill=H(P['wall']),outline=H(P['we']))
            elif c=='x': d.rectangle(r,fill=H(fl),outline=H(P['line'])); d.rectangle((r[0]+1,r[1]+1,r[2]-1,r[3]-1),fill=H(P['crate']),outline=H(P['ce']))
            else: d.rectangle(r,fill=H(fl),outline=H(P['line']))
    for t in('blue','red'):
        for s in m['spawns'].get(t,[]):
            cx,cy=o+s['x']*T+T/2,o+s['y']*T+T/2; q=T*0.3
            d.ellipse((cx-q,cy-q,cx+q,cy+q),fill=H(P[t]))
    im.save(f"art/maps/{e['id']}.png")
    print(e['id'],im.size)
