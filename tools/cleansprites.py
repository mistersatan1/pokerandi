from PIL import Image
import glob, collections, sys
src=sys.argv[1]; out=sys.argv[2]
report={}
for f in sorted(glob.glob(src+'/*.png')):
    name=f.split('/')[-1]
    im=Image.open(f).convert('RGBA'); w,h=im.size; px=im.load()
    n0=sum(1 for i in range(w) for j in range(h) if px[i,j][3]>0)
    # 1) faint noise
    for i in range(w):
        for j in range(h):
            if 0<px[i,j][3]<40: px[i,j]=(0,0,0,0)
    def grayish(p):
        r,g,b,a=p
        return a>0 and max(r,g,b)-min(r,g,b)<=26
    # 2) frame lines: near-edge rows/cols dominated by gray/dark pixels
    for i in list(range(0,14))+list(range(w-16,w)):
        col=[px[i,j] for j in range(h)]
        if sum(1 for p in col if grayish(p) and max(p[:3])<110)>h*0.38:
            for j in range(h):
                if grayish(px[i,j]) and max(px[i,j][:3])<120: px[i,j]=(0,0,0,0)
    for j in list(range(0,12))+list(range(h-12,h)):
        row=[px[i,j] for i in range(w)]
        if sum(1 for p in row if grayish(p) and max(p[:3])<130)>w*0.38:
            for i in range(w):
                if grayish(px[i,j]) and max(px[i,j][:3])<140: px[i,j]=(0,0,0,0)
    # 3) checkerboard background
    def checker(p):
        r,g,b,a=p
        return a>0 and min(r,g,b)>=140 and max(r,g,b)-min(r,g,b)<=22
    band=[(i,j) for i in range(w) for j in range(h) if min(i,j,w-1-i,h-1-j)<12]
    ratio=sum(1 for q in band if checker(px[q]))/len(band)
    if ratio>0.22:
        q=collections.deque(p for p in band if checker(px[p])); seen=set()
        while q:
            p=q.popleft()
            if p in seen: continue
            seen.add(p)
            if not checker(px[p]): continue
            px[p]=(0,0,0,0)
            i,j=p
            for di,dj in ((1,0),(-1,0),(0,1),(0,-1)):
                ni,nj=i+di,j+dj
                if 0<=ni<w and 0<=nj<h and (ni,nj) not in seen: q.append((ni,nj))
        # leftover frame dark line hugging the checker (thin dark outlines of the box)
    # 4) isolated specks: opaque pixels with <2 opaque neighbours
    for it in range(2):
        kill=[]
        for i in range(w):
            for j in range(h):
                if px[i,j][3]==0: continue
                nb=sum(1 for di in (-1,0,1) for dj in (-1,0,1) if (di or dj) and 0<=i+di<w and 0<=j+dj<h and px[i+di,j+dj][3]>0)
                if nb<2: kill.append((i,j))
        for p in kill: px[p]=(0,0,0,0)
    n1=sum(1 for i in range(w) for j in range(h) if px[i,j][3]>0)
    report[name]=(n0-n1, round(ratio,2))
    im.save(out+'/'+name)
print(report)

# 5) pass 2 on outputs: drop thin/small detached components (frame remnants, checker specks)
for f in sorted(glob.glob(out+'/*.png')):
    im=Image.open(f).convert('RGBA'); w,h=im.size; px=im.load()
    seen=set(); comps=[]
    for i in range(w):
        for j in range(h):
            if px[i,j][3]==0 or (i,j) in seen: continue
            st=[(i,j)]; seen.add((i,j)); c=[]
            while st:
                a,b=st.pop(); c.append((a,b))
                for di in (-1,0,1):
                    for dj in (-1,0,1):
                        x,y=a+di,b+dj
                        if 0<=x<w and 0<=y<h and (x,y) not in seen and px[x,y][3]>0:
                            seen.add((x,y)); st.append((x,y))
            comps.append(c)
    big=max(len(c) for c in comps)
    for c in comps:
        xs=[p[0] for p in c]; ys=[p[1] for p in c]
        thick=min(max(xs)-min(xs), max(ys)-min(ys))+1
        if len(c)<big*0.02 or (thick<=3 and len(c)<big*0.15):
            for p in c: px[p]=(0,0,0,0)
    im.save(f)

# 6) thin straight lines (1-2px) near edges, even if touching the art
for f in sorted(glob.glob(out+'/*.png')):
    im=Image.open(f).convert('RGBA'); w,h=im.size; px=im.load()
    op=lambda i,j: 0<=i<w and 0<=j<h and px[i,j][3]>0
    for horiz in (True,False):
        L1,L2=(h,w) if horiz else (w,h)
        for a in list(range(0,22))+list(range(L1-22,L1)):
            run=[]
            for b in range(L2+1):
                i,j=(b,a) if horiz else (a,b)
                if b<L2 and op(i,j): run.append(b); continue
                if len(run)>=22:
                    def side(d):
                        cnt=0
                        for bb in run:
                            ii,jj=(bb,a+d) if horiz else (a+d,bb)
                            if op(ii,jj): cnt+=1
                        return cnt/len(run)
                    # line if at least one side is empty and the other side is sparse, checking 2px thickness
                    s1,s2=side(-1),side(1)
                    t1,t2=side(-2),side(2)
                    if (s1<0.25 and s2<0.25) or (s1<0.2 and t2<0.2) or (s2<0.2 and t1<0.2):
                        for bb in run:
                            for d in (0,):
                                ii,jj=(bb,a) if horiz else (a,bb)
                                px[ii,jj]=(0,0,0,0)
                run=[]
    im.save(f)
