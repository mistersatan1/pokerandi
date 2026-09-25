import sys
# ── 쓰지 않는다 ──────────────────────────────────────────────
# 1세대 확장(세션 2x) 때 쓴 일회용 생성기다. "진화 전 ×2 + 아무거나" 옛 규칙으로
# js/data/*.js 를 **통째로 덮어쓴다** — 조합식 개편 v2(세션 32) 이후 돌리면 v2 가 사라진다.
# 조합식은 이제 js/data/recipes.js 를 손으로 고친다(docs/RECIPES_GUIDE.md). 기록용으로만 남겨 둔다.
sys.exit('tools/gen1 은 옛 규칙용 생성기라 막아 두었다 — docs/RECIPES_GUIDE.md 참고')
import json, subprocess, collections
out=subprocess.run(['node','-e','''
const fs=require("fs"),vm=require("vm");
const s={console,window:null};s.window=s;s.globalThis=s;vm.createContext(s);
["js/core/RPD.js","js/core/Utils.js","js/core/EventBus.js","js/data/types.js","js/data/tiers.js","js/data/pokemon.js"].forEach(f=>vm.runInContext(fs.readFileSync(f,"utf8"),s));
console.log(JSON.stringify(s.RPD.PokemonData.list.map(d=>({id:d.id,name:d.name,tier:d.tier,types:d.types,evo:d.evolvesFrom||null}))));'''],capture_output=True,text=True)
L=json.loads(out.stdout)
P={d['id']:d for d in L}
TI={'T1':0,'T2':1,'T3':2,'T4':3,'T5':4}
T=['T1','T2','T3','T4','T5']
def root(i):
    while P[i]['evo']: i=P[i]['evo']
    return i
usage=collections.Counter()
def helper(res, tier, exclude):
    rt=P[res]['types']
    cands=[d for d in L if d['tier']==tier and d['id'] not in exclude and d['id'] not in ('ditto',) and root(d['id'])!=root(res)]
    def score(d):
        shared=len(set(d['types'])&set(rt))
        first=1 if rt[0] in d['types'] else 0
        return (-first,-shared,usage[d['id']],d['id'])
    cands.sort(key=score)
    return cands[0]['id']
recipes=[]; keys=set()
def avail(ty,tier,res):
    return [d for d in L if d['tier']==tier and ty in d['types'] and d['id'] not in (res,'ditto')]
def fix(m,res):
    # 그 타입·등급에 포켓몬이 하나도 없으면 결과의 다른 타입, 그래도 없으면 '아무 타입'
    if not m.startswith('any:'): return m
    _,ty,tier=m.split(':')
    if avail(ty,tier,res): return m
    for alt in P[res]['types']:
        if avail(alt,tier,res): return f'any:{alt}:{tier}'
    return f'any:ANY:{tier}'
def add(res, mats, note):
    mats=[fix(m,res) for m in mats]
    k='+'.join(sorted(mats))
    assert k not in keys, (res,mats)
    keys.add(k); recipes.append((res,mats,note))
    for m in mats: usage[m]+=1
BRANCH_THIRD={'vaporeon':'any:WATER:T1','jolteon':'any:ELECTRIC:T1','flareon':'any:FIRE:T1'}
for d in L:
    r=d['id']; t=TI[d['tier']]
    if t==0: continue
    pre=d['evo']
    if pre in ('eevee',) :
        add(r,['eevee','eevee',BRANCH_THIRD[r]],'분기 진화 — 세 번째 재료가 결과를 정한다'); continue
    if pre:
        pt=TI[P[pre]['tier']]
        if t==pt+1 and pt==0:
            add(r,[pre,pre],'진화 — 진화 전 ×2'); continue
        # 한 단계 아래 도우미 (결과보다 한 등급 아래, 같은 타입)
        h='any:'+P[r]['types'][0]+':'+T[t-1]
        add(r,[pre,pre,h],'진화 — 진화 전 ×2 + 같은 타입 '+['흔함','안흔함','특별함','희귀함'][t-1])
        continue
    # 진화 전이 없는 포켓몬
    if t==1: continue            # 안흔함 단일 — 소환으로만
    ty=P[r]['types']; t1=ty[0]; t2=ty[1] if len(ty)>1 else ty[0]
    up,low=T[t-1],T[t-2]
    tries=[[f'any:{t1}:{up}',f'any:{t2}:{up}',f'any:{t1}:{low}'],
           [f'any:{t1}:{up}',f'any:{t2}:{up}',f'any:{t2}:{low}'],
           [f'any:{t1}:{up}',f'any:{t1}:{up}',f'any:{t1}:{low}'],
           [f'any:{t1}:{up}',f'any:{t1}:{low}',f'any:{t1}:{low}']]
    # 같은 타입 단일이 여럿이면(격투·노말) 다른 타입을 한 칸 섞어 구분한다
    for extra in ['NORMAL','FIGHTING','PSYCHIC','FLYING','WATER','FIRE','GRASS','POISON']:
        tries.append([f'any:{t1}:{up}',f'any:{extra}:{up}',f'any:{t1}:{low}'])
        tries.append([f'any:{t1}:{up}',f'any:{t1}:{up}',f'any:{extra}:{low}'])
    for m in tries:
        m=[fix(x,r) for x in m]
        if '+'.join(sorted(m)) not in keys:
            add(r,m,'단일 — 같은 타입 '+['','','안흔함 2 + 흔함 1','특별함 2 + 안흔함 1','희귀함 2 + 특별함 1'][t]); break
    else: raise SystemExit('고유 조합을 못 만듦 '+r)
print(len(recipes))
json.dump(recipes,open('/home/claude/p1/recipes.json','w'),ensure_ascii=False)
json.dump({k:v['name'] for k,v in P.items()},open('/home/claude/p1/names.json','w'),ensure_ascii=False)
json.dump({k:v['tier'] for k,v in P.items()},open('/home/claude/p1/tiers.json','w'),ensure_ascii=False)
