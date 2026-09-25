import sys
# ── 쓰지 않는다 ──────────────────────────────────────────────
# 1세대 확장(세션 2x) 때 쓴 일회용 생성기다. "진화 전 ×2 + 아무거나" 옛 규칙으로
# js/data/*.js 를 **통째로 덮어쓴다** — 조합식 개편 v2(세션 32) 이후 돌리면 v2 가 사라진다.
# 조합식은 이제 js/data/recipes.js 를 손으로 고친다(docs/RECIPES_GUIDE.md). 기록용으로만 남겨 둔다.
sys.exit('tools/gen1 은 옛 규칙용 생성기라 막아 두었다 — docs/RECIPES_GUIDE.md 참고')
import re, hashlib
exec(open('/home/claude/p1/roster.py').read())
TI={'T1':0,'T2':1,'T3':2,'T4':3,'T5':4}
BASE=[12,53,238,1050,4250]
ROLE_F={'SINGLE_DPS':1.0,'AOE_DPS':0.95,'CHAIN_DPS':1.05,'DOT':0.95,'SLOW':0.9,'CONTROL':0.9,'DEBUFFER':0.95,
        'BOSS_KILLER':1.05,'BUFFER':0.95,'ECONOMY':0.92,'UTILITY':0.6}
SPLASH=[40,58,78,98,118]; CHAIN=[2,3,3,4,5]
BURN=[0.18,0.22,0.26,0.30,0.34]; SLOWM=[0.82,0.77,0.72,0.67,0.62]; SLOWD=[1.5,1.9,2.3,2.7,3.1]
SHRED=[12,30,48,66,84]; GOLD=[1,2,3,4,5]; AURA=[0.12,0.18,0.26,0.34,0.40]
SHORT_TYPES={'ROCK','GROUND','FIGHTING'}
LONG_ROLES_T={'PSYCHIC','FLYING','ELECTRIC','DRAGON','ICE'}

def jitter(id_):
    h=int(hashlib.md5(id_.encode()).hexdigest(),16)%1000/1000
    return 0.94+h*0.12

def fields(id_,name,types,role,tier,evo):
    t=TI[tier]
    atk=round(BASE[t]*ROLE_F[role]*jitter(id_))
    if role in ('CONTROL','AOE_DPS') and (set(types)&{'ROCK','GROUND'}) or role=='BOSS_KILLER' and 'FIGHTING' in types:
        rng='R.SHORT'
    elif (set(types)&LONG_ROLES_T) and role in ('SINGLE_DPS','CHAIN_DPS','SLOW','CONTROL') or t>=3 and role not in ('BOSS_KILLER',):
        rng='R.LONG'
    else:
        rng='R.MID'
    f=[f"id:'{id_}'", f"name:'{name}'", f"tier:'{tier}'", "types:["+",".join('"'+x+'"' for x in types)+"]",
       f"role:'{role}'", f"attack:{atk}", "attackSpeed:1.0", f"range:{rng}"]
    if role in ('AOE_DPS','CONTROL'): f+=["attackType:'SPLASH'", f"splash:{SPLASH[t]}"]
    if role=='CHAIN_DPS': f+=["attackType:'CHAIN'", f"chain:{CHAIN[t]}"]
    if role=='DOT': f+=[f"burnChance:{BURN[t]}"]
    if role=='SLOW': f+=[f"slowMul:{SLOWM[t]}", f"slowDuration:{SLOWD[t]}"]
    if role=='DEBUFFER': f+=[f"armorShred:{SHRED[t]}"]
    if role=='ECONOMY': f+=[f"goldPerKill:{GOLD[t]}"]
    if role=='BUFFER': f+=[f"auraAttack:{AURA[t]}"]
    if role=='BOSS_KILLER': f+=["targeting:'BOSS'", f"critRate:{0.16+0.02*t:.2f}", f"critDamage:{1.8+0.05*t:.2f}"]
    if evo: f+=[f"evolvesFrom:'{evo}'"]
    f+=[f"desc:'{name} — {role} 역할의 {tier} 유닛.'"]
    return "    P({ "+", ".join(f)+" })"

s=open('js/data/pokemon.js',encoding='utf-8').read()
# 1) 기존 등급 정리 — 등급을 바꾸고 공격력을 새 등급 기준으로 다시 잡는다
for pid,newt in RETIER.items():
    m=re.search(r"P\(\{ id:'"+pid+r"'[^\n]*\}\)", s)
    line=m.group(0)
    oldt=re.search(r"tier:'(T\d)'",line).group(1)
    atk=int(re.search(r"attack:(\d+)",line).group(1))
    ratio=BASE[TI[newt]]/BASE[TI[oldt]]
    nl=line.replace(f"tier:'{oldt}'",f"tier:'{newt}'").replace(f"attack:{atk}",f"attack:{max(8,round(atk*ratio))}")
    t=TI[newt]
    nl=re.sub(r"splash:\d+",f"splash:{SPLASH[t]}",nl)
    nl=re.sub(r"chain:\d+",f"chain:{CHAIN[t]}",nl)
    nl=re.sub(r"burnChance:[\d.]+",f"burnChance:{BURN[t]}",nl)
    nl=re.sub(r"armorShred:\d+",f"armorShred:{SHRED[t]}",nl)
    nl=re.sub(r"goldPerKill:\d+",f"goldPerKill:{GOLD[t]}",nl)
    nl=re.sub(r"auraAttack:[\d.]+",f"auraAttack:{AURA[t]}",nl)
    nl=re.sub(r"slowMul:[\d.]+",f"slowMul:{SLOWM[t]}",nl)
    nl=re.sub(r"slowDuration:[\d.]+",f"slowDuration:{SLOWD[t]}",nl)
    nl=nl.replace(f"의 {oldt} 유닛",f"의 {newt} 유닛")
    s=s.replace(line,nl)
# 진화 전 표시(기존 계열)
EVO_OLD={'ivysaur':'bulbasaur','venusaur':'ivysaur','charmeleon':'charmander','charizard':'charmeleon',
 'wartortle':'squirtle','blastoise':'wartortle','metapod':'caterpie','butterfree':'metapod','kakuna':'weedle',
 'beedrill':'kakuna','pidgeotto':'pidgey','pidgeot':'pidgeotto','raticate':'rattata','fearow':'spearow',
 'arbok':'ekans','raichu':'pikachu','sandslash':'sandshrew','nidorina':'nidoran_f','nidoqueen':'nidorina',
 'nidorino':'nidoran_m','nidoking':'nidorino','clefable':'clefairy','ninetales':'vulpix','wigglytuff':'jigglypuff',
 'golbat':'zubat','gloom':'oddish','vileplume':'gloom','parasect':'paras','venomoth':'venonat','dugtrio':'diglett',
 'persian':'meowth'}
for pid,pre in EVO_OLD.items():
    m=re.search(r"P\(\{ id:'"+pid+r"'[^\n]*\}\)", s); line=m.group(0)
    if 'evolvesFrom' in line: continue
    s=s.replace(line, line.replace(", desc:", f", evolvesFrom:'{pre}', desc:"))
# 2) 새 95종
block="\n\n    /* ---------- 1세대 확장 (#055~#150) ----------\n     * 수치는 등급 기준값 × 역할 계수 × 개체별 ±6% 로 만들었다(tools 없이 손으로 고쳐도 된다).\n     * evolvesFrom: 진화 전 모습 — 조합식과 '계열' 추첨이 이것을 쓴다. */\n"
block+=",\n".join(fields(*n) for n in NEW)
s=s.replace("\n  ];\n  var byId = {}", ",\n"+block.lstrip(",")+"\n  ];\n  var byId = {}",1)
s=s.replace("/* pokemon.js — 55종 이미지 에셋 로스터. ","/* pokemon.js — 1세대 150종 로스터(히든 제외). ")
open('js/data/pokemon.js','w',encoding='utf-8').write(s)
print('ok')
