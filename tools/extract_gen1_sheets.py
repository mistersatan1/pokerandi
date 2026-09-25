from PIL import Image
import numpy as np
from scipy import ndimage
import os, collections
IDS1=['mankey','primeape','growlithe','arcanine','poliwag','poliwhirl','politoed','abra','kadabra','alakazam',
 'machop','machoke','machamp','bellsprout','weepinbell','victreebel','tentacool','tentacruel','geodude','graveler',
 'golem','ponyta','rapidash','slowpoke','slowbro','magnemite','magneton','farfetchd','doduo','dodrio',
 'seel','dewgong','grimer','muk','shellder','cloyster','gastly','haunter','gengar','onix',
 'drowzee','hypno','krabby','kingler','voltorb','electrode']
IDS2=['exeggcute','exeggutor','cubone','marowak','hitmonlee','hitmonchan','lickitung','koffing','weezing','rhyhorn',
 'rhydon','chansey','tangela','kangaskhan','horsea','seadra','goldeen','seaking','staryu','starmie',
 'mr_mime','scyther','jynx','electabuzz','magmar','pinsir','tauros','magikarp','gyarados','lapras',
 'ditto','eevee','vaporeon','jolteon','flareon','porygon','omanyte','omastar','kabuto','kabutops',
 'aerodactyl','snorlax','articuno','zapdos','moltres','dratini','dragonair','dragonite','mewtwo','mew']
os.makedirs('out',exist_ok=True)

def tiles(a):
    mn=a.min(axis=2); mx=a.max(axis=2)
    light=(mn>=150)&(mx-mn<=40)
    lab,n=ndimage.label(light, structure=np.ones((3,3)))
    boxes=[]
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if h>=60 and w>=60: boxes.append((sl[0].start,sl[1].start,sl[0].stop,sl[1].stop))
    boxes.sort()
    rows=[]
    for b in boxes:
        if rows and abs(rows[-1][0][0]-b[0])<30: rows[-1].append(b)
        else: rows.append([b])
    out=[]
    for r in rows: out+=sorted(r,key=lambda b:b[1])
    return out

def clean(tile):
    t=tile.astype(int); H,W,_=t.shape
    mn=t.min(axis=2); mx=t.max(axis=2); sat=mx-mn
    bg_like=(mn>=150)&(sat<=40)
    # 테두리에서 체크무늬만 따라 번진다 — 윤곽선(어두운 선)이 막아 준다
    seed=np.zeros_like(bg_like)
    seed[0,:]=seed[-1,:]=seed[:,0]=seed[:,-1]=True
    lab,n=ndimage.label(bg_like)
    ids=set(np.unique(lab[seed & bg_like]))-{0}
    bg=np.isin(lab,list(ids))
    # 둘러싸인 체크무늬 조각(덩굴 고리 안·팔과 몸 사이) — 밝은 칸과 어두운 칸이 섞여 있어야 지운다
    hi,lo=tones_from_border(t)
    mid=(hi.mean()+lo.mean())/2
    tone=np.where(t.mean(axis=2)>=mid,0,1)
    # 체크무늬 조각 판정: 거의 모든 픽셀이 두 체크 색 근처(±22)이고, 그 범위를 벗어난 음영이 거의 없어야 한다.
    # 은색 숟가락·회색 몸통은 두 색보다 어둡거나 밝은 음영이 섞여 있어 걸러진다.
    close=np.minimum(np.abs(t-hi).max(axis=2), np.abs(t-lo).max(axis=2))<=22
    h=hi.mean(); l=lo.mean(); gap=max(1.0, h-l); br=t.mean(axis=2)
    inside_range=~((br<l-gap*0.4)|(br>h+gap*0.4))
    bg=remove_pockets(bg_like,bg,tone,closeness=close & inside_range)
    # 가장자리 반투명 테두리(연한 회색 번짐) 한 겹 더 걷어 낸다
    halo=ndimage.binary_dilation(bg, iterations=1) & (mn>=120) & (sat<=45) & ~bg
    bg|=halo
    alpha=np.where(bg,0,255).astype(np.uint8)
    # 떨어진 작은 조각 제거
    lab2,n2=ndimage.label(alpha>0, structure=np.ones((3,3)))
    if n2:
        sizes=ndimage.sum(np.ones_like(lab2),lab2,range(1,n2+1))
        big=sizes.max()
        for i,sz in enumerate(sizes, start=1):
            if sz<big*0.015: alpha[lab2==i]=0
    rgba=np.dstack([tile.astype(np.uint8),alpha])
    return rgba

def tones_from_border(t):
    ring=np.concatenate([t[:3].reshape(-1,3), t[-3:].reshape(-1,3), t[:,:3].reshape(-1,3), t[:,-3:].reshape(-1,3)])
    # 테두리에 걸친 포켓몬 픽셀(어두운 윤곽 등)은 빼고 밝은 무채색만으로 두 색을 잡는다
    mnr=ring.min(axis=1); satr=ring.max(axis=1)-mnr
    light=ring[(mnr>=150)&(satr<=40)]
    if len(light)>20: ring=light
    br=ring.mean(axis=1)
    thr=(br.max()+br.min())/2
    hi=ring[br>=thr].mean(axis=0); lo=ring[br<thr].mean(axis=0)
    return hi, lo

def remove_pockets(match, bg, tone_map, min_px=30, closeness=None):
    # 윤곽선에 둘러싸여 테두리에서 닿지 않는 체크무늬 조각(팔과 몸 사이, 덩굴 고리 안)도 지운다.
    # 두 색이 모두 섞여 있어야 체크무늬로 본다 — 흰 몸통처럼 한 색뿐인 곳은 남긴다.
    lab,n=ndimage.label(match & ~bg)
    for i,sl in enumerate(ndimage.find_objects(lab), start=1):
        comp=lab[sl]==i
        sz=comp.sum()
        if sz<min_px: continue
        tm=tone_map[sl][comp]
        a0=(tm==0).mean(); a1=(tm==1).mean()
        # 체크무늬는 두 색 "그대로"다. 은색 숟가락·회색 몸통처럼 음영이 여러 단계면 체크무늬가 아니다
        if closeness is not None and closeness[sl][comp].mean() < 0.85:
            continue
        if a0>=0.15 and a1>=0.15:
            bg[sl]|=comp
    return bg

def clean_generic(tile, tol=20):
    t=tile.astype(int)
    hi,lo=tones_from_border(t)
    dhi=np.abs(t-hi).max(axis=2); dlo=np.abs(t-lo).max(axis=2)
    match=np.minimum(dhi,dlo)<=tol
    tone=np.where(dhi<=dlo,0,1)
    seed=np.zeros_like(match); seed[0,:]=seed[-1,:]=seed[:,0]=seed[:,-1]=True
    lab,n=ndimage.label(match)
    ids=set(np.unique(lab[seed&match]))-{0}
    bg=np.isin(lab,list(ids))
    bg=remove_pockets(match,bg,tone)
    halo=ndimage.binary_dilation(bg, iterations=1) & (np.minimum(dhi,dlo)<=tol+14) & ~bg
    bg|=halo
    alpha=np.where(bg,0,255).astype(np.uint8)
    lab2,n2=ndimage.label(alpha>0, structure=np.ones((3,3)))
    if n2:
        sizes=ndimage.sum(np.ones_like(lab2),lab2,range(1,n2+1))
        big=sizes.max()
        for i,sz in enumerate(sizes, start=1):
            if sz<big*0.01: alpha[lab2==i]=0
    return np.dstack([tile.astype(np.uint8),alpha])

def finish(rgba, name, smooth):
    ys,xs=np.nonzero(rgba[...,3])
    if not len(ys): print('EMPTY',name); return
    crop=rgba[ys.min():ys.max()+1, xs.min():xs.max()+1]
    img=Image.fromarray(crop,'RGBA')
    s=max(img.size); pad=int(s*0.04)
    canvas=Image.new('RGBA',(s+pad*2,s+pad*2),(0,0,0,0))
    canvas.paste(img,((s+pad*2-img.size[0])//2,(s+pad*2-img.size[1])//2),img)
    canvas=canvas.resize((96,96), Image.LANCZOS if smooth else Image.NEAREST)
    canvas.save(f'out/{name}.png')

def clean_checker(tile, cell=12, c0=235, c1=205):
    # 두 번째 시트는 정확한 체크무늬(12px 칸 · 235/205)라 칸 위치별 기대색으로 배경을 가린다.
    # 흰 몸통(255)은 기대색(235)과 달라 지워지지 않는다.
    t=tile.astype(int); H,W,_=t.shape
    yy,xx=np.mgrid[0:H,0:W]
    exp=np.where(((xx//cell)+(yy//cell))%2==0, c0, c1)
    diff=np.abs(t-exp[...,None]).max(axis=2)
    match=diff<=8
    lab,n=ndimage.label(match)          # 4-연결: 같은 색 칸끼리는 모서리로만 닿는다
    seed=np.zeros_like(match); seed[0,:]=seed[-1,:]=seed[:,0]=seed[:,-1]=True
    ids=set(np.unique(lab[seed&match]))-{0}
    bg=np.isin(lab,list(ids))
    tone=np.where(exp==c0,0,1)
    bg=remove_pockets(match,bg,tone,min_px=20)
    halo=ndimage.binary_dilation(bg, iterations=1) & (diff<=22) & ~bg
    bg|=halo
    alpha=np.where(bg,0,255).astype(np.uint8)
    lab2,n2=ndimage.label(alpha>0, structure=np.ones((3,3)))
    if n2:
        sizes=ndimage.sum(np.ones_like(lab2),lab2,range(1,n2+1))
        big=sizes.max()
        for i,sz in enumerate(sizes, start=1):
            if sz<big*0.01: alpha[lab2==i]=0
    return np.dstack([tile.astype(np.uint8),alpha])

for f,ids,inset in [('1000034819.png',IDS1,1),('1000034821.png',IDS2,0)]:
    a=np.asarray(Image.open('/mnt/user-data/uploads/'+f).convert('RGB'))
    ts=tiles(a.astype(int))
    assert len(ts)==len(ids),(f,len(ts))
    for (y0,x0,y1,x1),name in zip(ts,ids):
        tile=a[y0+inset:y1-inset, x0+inset:x1-inset]
        finish(clean_checker(tile) if f=='1000034821.png' else clean(tile), name, smooth=True)
print(len(os.listdir('out')))

# 셋째 시트: 골덕 · 발챙이 (큰 칸 두 개, 96px 도트를 확대해 그린 것)
a=np.asarray(Image.open('/mnt/user-data/uploads/1000034823.png').convert('RGB'))
ts=[b for b in tiles(a.astype(int)) if (b[2]-b[0])>200]
assert len(ts)==2, len(ts)
for (y0,x0,y1,x1),name in zip(ts,['golduck','poliwrath']):
    tile=a[y0+3:y1-3, x0+3:x1-3]
    finish(clean_generic(tile, tol=24), name, smooth=True)
print('third sheet ok')
