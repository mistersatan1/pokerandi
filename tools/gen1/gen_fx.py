import sys
# ── 쓰지 않는다 ──────────────────────────────────────────────
# 1세대 확장(세션 2x) 때 쓴 일회용 생성기다. "진화 전 ×2 + 아무거나" 옛 규칙으로
# js/data/*.js 를 **통째로 덮어쓴다** — 조합식 개편 v2(세션 32) 이후 돌리면 v2 가 사라진다.
# 조합식은 이제 js/data/recipes.js 를 손으로 고친다(docs/RECIPES_GUIDE.md). 기록용으로만 남겨 둔다.
sys.exit('tools/gen1 은 옛 규칙용 생성기라 막아 두었다 — docs/RECIPES_GUIDE.md 참고')
import json, subprocess, hashlib, colorsys, re
out=subprocess.run(['node','-e','''
const fs=require("fs"),vm=require("vm");
const s={console,window:null};s.window=s;s.globalThis=s;vm.createContext(s);
["js/core/RPD.js","js/core/Utils.js","js/core/EventBus.js","js/data/types.js","js/data/tiers.js","js/data/pokemon.js","js/data/attackfx.js"].forEach(f=>vm.runInContext(fs.readFileSync(f,"utf8"),s));
const D=s.RPD.AttackFxData;
console.log(JSON.stringify({have:Object.keys(D.list),styles:D.styles,list:s.RPD.PokemonData.list.map(d=>({id:d.id,tier:d.tier,types:d.types,role:d.role,at:d.attackType}))}));'''],capture_output=True,text=True,cwd='.')
J=json.loads(out.stdout)
have=set(J['have']); ST=J['styles']
TI={'T1':0,'T2':1,'T3':2,'T4':3,'T5':4}
def h(s,n): return int(hashlib.md5(s.encode()).hexdigest(),16)%n
def shade(hexc, id_):
    r,g,b=[int(hexc[i:i+2],16)/255 for i in (1,3,5)]
    hh,l,sat=colorsys.rgb_to_hls(r,g,b)
    hh=(hh+(h(id_,41)-20)/360)%1; l=min(0.92,max(0.25,l+(h(id_+'l',21)-10)/100))
    r,g,b=colorsys.hls_to_rgb(hh,l,sat)
    return '#%02x%02x%02x'%(int(r*255),int(g*255),int(b*255))
SHAPE={'FIRE':['flame','orb'],'WATER':['drop','bubble','wave'],'ELECTRIC':['orb','star'],'GRASS':['leaf','seed'],
 'ICE':['needle','crescent'],'FIGHTING':['chop','thrust','fang'],'PSYCHIC':['orb','wave','star'],'GHOST':['wisp','orb'],
 'POISON':['glob','bubble','needle'],'BUG':['needle','silk'],'ROCK':['rock','sand'],'GROUND':['sand','rock','drill'],
 'STEEL':['orb','drill'],'DRAGON':['crescent','fang','wave'],'NORMAL':['orb','claw','star'],'FLYING':['feather','crescent'],'FAIRY':['star','note']}
def fxtype(d):
    r=d['role']; t=d['types'][0]
    if r=='CHAIN_DPS': return 'CHAIN'
    if r in ('AOE_DPS','CONTROL'):
        if t=='FIRE': return 'BREATH'
        return ['EXPLOSION','AREA'][h(d['id'],2)]
    if r=='BOSS_KILLER': return 'SLASH'
    if r=='BUFFER': return 'ORBIT'
    if r=='DEBUFFER' and t in ('GHOST','PSYCHIC'): return 'ORBIT'
    if t in ('PSYCHIC','DRAGON') and r=='SINGLE_DPS': return 'BEAM'
    if r=='SLOW' and t in ('WATER','ICE'): return ['BEAM','PROJECTILE'][h(d['id'],2)]
    if t in ('BUG','FLYING','NORMAL','DRAGON') and r=='SINGLE_DPS' and h(d['id'],3)==0: return 'SLASH'
    return 'PROJECTILE'
lines=[]
for d in J['list']:
    if d['id'] in have: continue
    t=d['types'][0]; st=ST.get(t,ST['NORMAL']); ti=TI[d['tier']]
    ft=fxtype(d)
    shapes=SHAPE.get(t,['orb']); shape=shapes[h(d['id']+'s',len(shapes))]
    col=shade(st['color'],d['id'])
    size=4+ti+h(d['id']+'z',2)
    speed=480+h(d['id']+'v',9)*30
    parts=3+ti*2
    f=[f"type: '{ft}'", f"style: '{t}'", f"shape: '{shape}'", f"color: '{col}'", f"color2: '{st['color2']}'",
       f"size: {size}", f"speed: {speed}", f"particles: {parts}", f"impact: '{st['impact']}'"]
    if ft in ('BEAM','BREATH'): f.append(f"width: {14+ti*6}")
    if ft in ('EXPLOSION','AREA'): f.append(f"radius: {40+ti*14}")
    if ft=='PROJECTILE' and h(d['id']+'c',4)==0: f.append("count: 2")
    if ti>=3:
        sk=['EXPLOSION','AREA','BEAM'][h(d['id']+'k',3)]
        f.append(f"skill: {{ type: '{sk}', scale: {2.2+0.2*(ti-3)+h(d['id'],3)*0.1:.1f}, impact: '{st['impact']}' }}")
        if ti==4: f.append("shake: 0.6")
    lines.append(f"    {d['id']}: {{ "+", ".join(f)+" }}")
print(len(lines))
s=open('js/data/attackfx.js',encoding='utf-8').read()
i=s.index('  var FX = {'); j=s.index('\n  };',i)
s=s[:j]+",\n\n    /* ---------- 1세대 확장 — 역할·타입 규칙으로 만든 설정(개체마다 색·모양·크기가 조금씩 다르다) ---------- */\n"+",\n".join(lines)+s[j:]
open('js/data/attackfx.js','w',encoding='utf-8').write(s)
