import sys
# ── 쓰지 않는다 ──────────────────────────────────────────────
# 1세대 확장(세션 2x) 때 쓴 일회용 생성기다. "진화 전 ×2 + 아무거나" 옛 규칙으로
# js/data/*.js 를 **통째로 덮어쓴다** — 조합식 개편 v2(세션 32) 이후 돌리면 v2 가 사라진다.
# 조합식은 이제 js/data/recipes.js 를 손으로 고친다(docs/RECIPES_GUIDE.md). 기록용으로만 남겨 둔다.
sys.exit('tools/gen1 은 옛 규칙용 생성기라 막아 두었다 — docs/RECIPES_GUIDE.md 참고')
import json,re
R=json.load(open('/home/claude/p1/recipes.json')); N=json.load(open('/home/claude/p1/names.json')); T=json.load(open('/home/claude/p1/tiers.json'))
TYK={'NORMAL':'노말','FIRE':'불꽃','WATER':'물','GRASS':'풀','ELECTRIC':'전기','ICE':'얼음','FIGHTING':'격투','POISON':'독','GROUND':'땅','FLYING':'비행','PSYCHIC':'에스퍼','BUG':'벌레','ROCK':'바위','GHOST':'고스트','DRAGON':'드래곤','STEEL':'강철','FAIRY':'페어리','ANY':'아무 타입'}
TL={'T1':'흔함','T2':'안흔함','T3':'특별함','T4':'희귀함','T5':'전설'}
def nm(x):
    if x.startswith('any:'):
        _,ty,t=x.split(':'); return f'{TYK[ty]} {TL[t]}'
    return N[x]
sec={'T2':[],'T3':[],'T4':[],'T5':[]}
for r,m,n in R: sec[T[r]].append((r,m))
def line(r,m):
    arr=', '.join(f"'{x}'" for x in m)
    return (f"    {{ id: '{r}', materials: [{arr}] }},").ljust(92)+f"// {N[r]} = "+' + '.join(nm(x) for x in m)
titles={'T2':'안흔함 — 진화 전 흔함 ×2','T3':'특별함 — 진화 전 ×2 + 같은 타입 안흔함(아무거나) · 분기 진화 · 단일',
 'T4':'희귀함 — 진화 전 ×2 + 같은 타입 특별함(아무거나) · 단일','T5':'전설 — 진화 전 ×2 + 같은 타입 희귀함(아무거나) · 단일'}
body=[]
for t in ['T2','T3','T4','T5']:
    body.append(f"\n    /* ---------- {titles[t]} ---------- */")
    for r,m in sec[t]: body.append(line(r,m))
lines='\n'.join(body).split('\n')
for i in range(len(lines)-1,-1,-1):
    if lines[i].strip().startswith('{'):
        lines[i]=re.sub(r"\},(\s*//)", r"}\1", lines[i]); break
s=open('js/data/recipes.js',encoding='utf-8').read()
a=s.index('  var RECIPES = ['); b=s.index('  ];',a)
s=s[:a]+'  var RECIPES = ['+'\n'.join(lines)+'\n'+s[b:]
open('js/data/recipes.js','w',encoding='utf-8').write(s)
print('written')
