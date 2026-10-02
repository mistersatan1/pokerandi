/* auras.js — 버퍼의 패시브 버프.
 *
 * 특별함 이상 버퍼(역할 BUFFER)는 원래 "주변 아군 공격력 +%"만 있었다.
 * 여기에 버퍼마다 다른 결의 패시브를 하나씩 더 준다 — 누구 옆에 두느냐가 달라진다.
 *
 * ┌─ 고치는 법 ─────────────────────────────────────────────────┐
 * │ 포켓몬 id 를 키로 한 줄. 숫자만 바꾸면 된다. desc 도 같이 고친다. │
 * │ 효과는 셋 중 여럿을 섞어도 된다:                                │
 * │   attackSpeed  주변 아군 공격속도 +비율 (0.1 = +10%)             │
 * │   critRate     주변 아군 치명타율 +비율                          │
 * │   critDamage   주변 아군 치명타 피해 +배수 (0.3 = +30%)          │
 * │   range        주변 아군 사거리 +비율   cooldown 스킬 쿨다운 -비율 │
 * │   armorPierce  방어 무시 비율          bossDamage 보스 피해 +비율  │
 * └─────────────────────────────────────────────────────────────┘
 *
 * "주변" 은 공격력 오라와 같다 — 칸 격자에서 상하좌우·대각선으로 맞닿은 칸.
 * 같은 종류가 여러 버퍼에서 겹치면 더해지되 상한(CAP)에서 멈춘다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  /* 세션 33: 버퍼마다 결이 다르게 — 무엇을 주느냐로 "누구 옆에 두느냐"가 갈린다.
   *   사거리 range · 스킬 쿨다운 cooldown · 방어 무시 armorPierce · 보스 피해 bossDamage 를 새로 넣었다.
   *   공격력 오라도 역할 보정으로 ×1.4 (roletuning.js). 예전엔 5종이 공속·치명 두 축만 나눠 가졌다. */
  var AURAS = {
    clefairy:   { icon: '🌙', name: '달의가루', desc: '주변 아군 사거리 +10%.', range: 0.10 },
    jigglypuff: { icon: '🎤', name: '노래하기', desc: '주변 아군 스킬 쿨다운 -12%.', cooldown: 0.12 },
    psyduck:    { icon: '💫', name: '두통', desc: '주변 아군 방어 무시 +15%.', armorPierce: 0.15 },
    golduck:    { icon: '🌀', name: '정신집중', desc: '주변 아군 치명타율 +10% · 방어 무시 +20%.', critRate: 0.10, armorPierce: 0.20 },
    chansey:    { icon: '🥚', name: '치유의파동', desc: '주변 아군 공격속도 +15% · 스킬 쿨다운 -10%.', attackSpeed: 0.15, cooldown: 0.10 },
    mr_mime:    { icon: '🪞', name: '리플렉터', desc: '주변 아군 치명타 피해 +40% · 사거리 +10%.', critDamage: 0.40, range: 0.10 },
    wigglytuff: { icon: '🎶', name: '응원가', desc: '주변 아군 공격속도 +12% · 치명타 피해 +40%.', attackSpeed: 0.12, critDamage: 0.40 },
    clefable:   { icon: '✨', name: '달빛', desc: '주변 아군 보스 피해 +30% · 치명타율 +12% · 사거리 +10%.', bossDamage: 0.30, critRate: 0.12, range: 0.10 },
    mew:        { icon: '🧬', name: '근원의빛', desc: '주변 아군 공격속도 +15% · 스킬 쿨다운 -15% · 보스 피해 +25%.', attackSpeed: 0.15, cooldown: 0.15, bossDamage: 0.25 }
  };

  var CAP = { attackSpeed: 0.40, critRate: 0.30, critDamage: 1.0, range: 0.25, cooldown: 0.30, armorPierce: 0.50, bossDamage: 0.60 };

  RPD.AuraData = {
    list: AURAS,
    cap: CAP,
    get: function (id) { return AURAS[id] || null; }
  };

  /* ---------- 응원 칸(세션 82) — 응원 칸에 둔 포켓몬이 필드 전체 전투 유닛에게 주는 버프 ----------
   * 응원 가능 여부 · 효과 · 화면 표시(설명서 · 도감 · 보유 목록)는 전부 이 표에서 나온다 — 종 id 를 다른 곳에 흩어 두지 않는다.
   *
   * ① 기존 버퍼 9종(AURAS + 공격력 오라 auraAttack) — "이웃 값 × CHEER_SCALE"로 만든다.
   *    처음 값 0.22 — 응원 칸 1개가 필드 전체에 주는 총효과 ≈ 같은 버퍼를 이웃 자리에 뒀을 때의 총효과.
   *    실측(세션 82 · tools/autoplay.js 버퍼 도달 표본 · 노멀 80판): 버퍼 하나가 닿는 전투 유닛 평균 4.6마리 ÷ 필드 전투 유닛 평균 20.6마리 = 0.22.
   *    (보스 러시 40판 4.0 ÷ 20.0 = 0.20.) 초안(공격력 0.25 · 나머지 0.5)의 "나머지 0.5" 는 이웃 환산의 두 배가 넘어서 쓰지 않았다.
   *    공격력 오라는 역할 보정(RoleTuning.aura — 버퍼 ×1.4)까지 곱한 실제 이웃 값에서 환산한다(픽시 0.42 × 1.4 = +59% → 응원 +6.5%).
   * ② 소환으로 나오는 약한 지원형 8종 — 표에 직접 쓴다(한 축 · 초안 · 측정으로 조정).
   * 합산: 다른 종끼리는 더한다 · 같은 종 두 마리는 한 번 · 축마다 AuraData.cap(공격력은 CHEER_CAP_ATTACK)에서 멈춘다. */
  //    측정(노멀 160판씩): 응원 없음 클리어 9.4% → 0.22 면 22.5%(+13%p) — 요청 규칙("10%p 이상 오르면 SCALE 을 낮춰 다시")대로
  //    0.11 → 17.5%(+8.1%p). 그래서 0.11. 버퍼를 응원 칸에 두면 이웃 자리보다 총효과가 절반쯤이다(VERSION 세션 82).
  var CHEER_SCALE = 0.11;
  var CHEER_CAP_ATTACK = 0.30;
  var CHEER_DIRECT = {
    bulbasaur: { attack: 0.04 },
    oddish:    { range: 0.03 },
    nidoran_f: { armorPierce: 0.04 },
    gastly:    { critRate: 0.03 },
    exeggcute: { attackSpeed: 0.04 },
    vulpix:    { critDamage: 0.12 },
    koffing:   { bossDamage: 0.06 },
    shellder:  { attack: 0.05, armorPierce: 0.05 }
  };
  var CHEER_FROM_AURA = ['clefairy', 'jigglypuff', 'psyduck', 'golduck', 'chansey', 'mr_mime', 'wigglytuff', 'clefable', 'mew'];
  var CHEER_AXES = ['attack', 'attackSpeed', 'critRate', 'critDamage', 'range', 'cooldown', 'armorPierce', 'bossDamage'];
  var CHEER_LABEL = { attack: '공격력', attackSpeed: '공속', critRate: '치명타율', critDamage: '치명 피해', range: '사거리', cooldown: '쿨다운', armorPierce: '방어 무시', bossDamage: '보스 피해' };

  var cheerTable = null;
  function round3(v) { return Math.round(v * 1000) / 1000; }
  /* 처음 쓸 때 만든다 — 역할 보정(roletuning.js)이 이 파일보다 늦게 불러와지므로 */
  function buildCheer() {
    var out = {};
    CHEER_FROM_AURA.forEach(function (id) {
      var d = RPD.PokemonData && RPD.PokemonData.get(id), a = AURAS[id] || {};
      var e = {};
      if (d && d.auraAttack) e.attack = round3(d.auraAttack * (RPD.RoleTuning ? RPD.RoleTuning.aura(d.role) : 1) * CHEER_SCALE);
      CHEER_AXES.forEach(function (k) { if (k !== 'attack' && a[k]) e[k] = round3(a[k] * CHEER_SCALE); });
      e.source = 'aura';
      // 불멸 이상(T6+)은 응원 칸에 못 둔다 — 비싼 유닛이라 필드에서 쓰이게. 대신 전투 칸에 있으면 이 값이 필드 전체에 간다(세션 83)
      if (d && RPD.tierRank && RPD.tierRank(d.tier) >= RPD.tierRank('T6')) e.onField = true;
      out[id] = e;
    });
    Object.keys(CHEER_DIRECT).forEach(function (id) {
      var e = {};
      for (var k in CHEER_DIRECT[id]) e[k] = CHEER_DIRECT[id][k];
      e.source = 'direct';
      out[id] = e;
    });
    return out;
  }

  RPD.CheerData = {
    SCALE: CHEER_SCALE,
    AXES: CHEER_AXES,
    LABEL: CHEER_LABEL,
    capAttack: CHEER_CAP_ATTACK,
    direct: CHEER_DIRECT,
    fromAura: CHEER_FROM_AURA,
    table: function () { if (!cheerTable) cheerTable = buildCheer(); return cheerTable; },
    reset: function () { cheerTable = null; },            // 검사 · 실험(autoplay CHEER_SET)이 표를 바꾼 뒤
    get: function (id) { return this.table()[id] || null; },
    isCheerable: function (id) { var e = this.table()[id]; return !!e && !e.onField; },
    ids: function () { var t = this.table(); return Object.keys(t).filter(function (id) { return !t[id].onField; }); },
    /* 전투 칸에 두면 응원 값을 필드 전체에 주는 종(불멸 이상 버퍼 — 지금은 뮤) */
    fieldIds: function () { var t = this.table(); return Object.keys(t).filter(function (id) { return t[id].onField; }); },
    /* 축마다 상한 */
    capOf: function (k) { return k === 'attack' ? CHEER_CAP_ATTACK : CAP[k]; },
    /* "공속 +4% · 방어 무시 +5%" — 화면 공용 */
    describe: function (e) {
      if (!e) return '';
      return CHEER_AXES.filter(function (k) { return e[k]; }).map(function (k) {
        var v = Math.round(e[k] * 1000) / 10;
        return CHEER_LABEL[k] + (k === 'cooldown' ? ' -' : ' +') + v + '%';
      }).join(' · ');
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
