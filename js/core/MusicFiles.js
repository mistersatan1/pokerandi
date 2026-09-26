/* MusicFiles.js — 배경음악 파일 재생 (세션 55). 무엇을 틀지는 AudioManager 가 정하고, 여기는 "파일로 틀 수 있나 · 틀기 · 줄이기"만 한다.
 *
 * - <audio> 요소로 튼다(fetch · XHR 없음) — index.html 을 더블클릭(file://)으로 열어도 된다.
 * - 파일이 있는지는 요소가 알려 준다: 첫 정보(loadedmetadata)가 오면 ok, error 면 failed(→ 그 장면은 합성 음악).
 *   처음에는 preload='metadata' 로 머리만 읽는다 — 휴대폰에서 여섯 곡을 한꺼번에 다 받지 않게. 틀 때 전부 받는다.
 * - 음량: 인터넷 주소(http · https)에서는 요소를 WebAudio 에 연결해(createMediaElementSource) 합성 음악과 같은 배경음 음량 · 음소거 노드를 지난다
 *   (아이폰 사파리는 요소의 volume 을 무시해서 이 방법이어야 음량이 먹는다).
 *   file:// 에서는 그렇게 연결하면 크롬이 보안상 무음으로 만들어 버려서, 요소 volume 에 직접 (배경음 음량 × 곡 음량 × 페이드)를 넣는다.
 * - 휴대폰은 "손으로 누른 순간"에만 소리를 틀 수 있다(아이폰은 요소마다). 그래서 누를 때마다(capture) 아직 못 튼 곡을 다시 틀어 보고,
 *   아직 한 번도 안 튼 요소는 소리 없이 틀었다 멈춰 잠금을 풀어 둔다(prime) — 나중에 곡이 바뀔 때(누르지 않은 순간) 틀 수 있게.
 * - 한 파일짜리 테스트판(RPD_INLINE)에는 음악 파일이 없으므로 쓰지 않는다 → 합성 음악.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var M = {
    entries: {},
    base: function () { return 1; },     // AudioManager 가 넣는다: 음소거면 0, 아니면 배경음 음량(file:// 에서만 쓴다)
    TICK_MS: 40
  };

  function clamp01(v) { v = +v; return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; }
  function emit(e) { if (RPD.bus) RPD.bus.emit('music:file', { name: e.name, status: e.status }); }

  M.enabled = function () {
    return !global.RPD_INLINE && typeof global.Audio === 'function' && !!global.document;
  };

  M.init = function () {
    M.entries = {};
    var data = RPD.MusicData;
    if (!M.enabled() || !data || !data.tracks) return M;
    Object.keys(data.tracks).forEach(function (name) {
      var cfg = data.tracks[name];
      if (!cfg || !cfg.file) return;
      var el;
      try { el = new global.Audio(); } catch (e) { return; }
      var e = { name: name, file: cfg.file, vol: cfg.volume == null ? 1 : clamp01(cfg.volume), el: el,
        status: 'loading', level: 0, wanted: false, primed: false, gain: null, timer: null };
      el.preload = 'metadata';
      el.loop = true;
      el.addEventListener('loadedmetadata', function () { if (e.status !== 'ok') { e.status = 'ok'; emit(e); } });
      el.addEventListener('error', function () { e.status = 'failed'; e.wanted = false; emit(e); });
      el.src = cfg.file;
      M.entries[name] = e;
    });
    return M;
  };

  M.crossfade = function () {
    var d = RPD.MusicData;
    return d && d.crossfade != null ? Math.max(0, +d.crossfade || 0) : 1;
  };

  /* 'none'(설정 없음 · 쓰지 않음) · 'loading' · 'ok' · 'failed' */
  M.status = function (name) { var e = M.entries[name]; return e ? e.status : 'none'; };
  M.has = function (name) { return M.status(name) === 'ok'; };
  M.isPlaying = function (name) { var e = M.entries[name]; return !!(e && e.wanted && !e.el.paused); };
  M.playingNames = function () { return Object.keys(M.entries).filter(M.isPlaying); };

  /* AudioContext 가 생기면(첫 누르기) 인터넷 주소에서만 WebAudio 에 연결 */
  M.attach = function (ctx, dest) {
    var loc = global.location;
    if (!ctx || !dest || !ctx.createMediaElementSource || !loc || !/^https?:$/.test(loc.protocol)) return;
    Object.keys(M.entries).forEach(function (k) {
      var e = M.entries[k];
      if (e.gain) return;
      try {
        var src = ctx.createMediaElementSource(e.el);
        var g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g); g.connect(dest);
        e.gain = g;
        e.el.volume = 1;
      } catch (err) { e.gain = null; }
    });
    M.applyAll();
  };

  function apply(e) {
    var v = e.level * e.vol;
    if (e.gain) e.gain.gain.value = v;                                  // 음량 · 음소거는 뒤의 노드가 곱한다
    else { try { e.el.volume = clamp01(v * M.base()); } catch (err) { /* 읽기 전용인 기기 */ } }
  }
  M.applyAll = function () { Object.keys(M.entries).forEach(function (k) { apply(M.entries[k]); }); };

  function fade(e, to, sec, done) {
    if (e.timer) { global.clearInterval(e.timer); e.timer = null; }
    if (!(sec > 0)) { e.level = to; apply(e); if (done) done(); return; }
    var from = e.level, t0 = Date.now();
    e.timer = global.setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / (sec * 1000));
      e.level = from + (to - from) * k;
      apply(e);
      if (k >= 1) { global.clearInterval(e.timer); e.timer = null; if (done) done(); }
    }, M.TICK_MS);
  }

  function tryPlay(e) {
    var p;
    try { p = e.el.play(); } catch (err) { return; }
    if (p && p.catch) p.catch(function () { /* 아직 누르기 전 — 다음 누르기에서 다시(onGesture) */ });
  }

  /* 틀기(sec 초 동안 커지며). restart 면 처음부터 */
  M.play = function (name, sec, restart) {
    var e = M.entries[name];
    if (!e || e.status !== 'ok') return false;
    e.wanted = true;
    e.el.preload = 'auto';
    if (restart) { try { e.el.currentTime = 0; } catch (err) { /* 아직 못 감는 상태 */ } }
    if (e.el.paused) tryPlay(e);
    fade(e, 1, sec);
    return true;
  };

  /* 줄이다가(sec 초) 멈춤 */
  M.fadeOut = function (name, sec) {
    var e = M.entries[name];
    if (!e) return;
    e.wanted = false;
    fade(e, 0, sec, function () { if (!e.wanted) { try { e.el.pause(); } catch (err) { /* 무시 */ } } });
  };

  M.fadeOutExcept = function (keep, sec) {
    Object.keys(M.entries).forEach(function (k) { if (k !== keep && (M.entries[k].wanted || M.entries[k].level > 0)) M.fadeOut(k, sec); });
  };

  /* 바로 멈춤(음소거 · 탭 가림 · 일시정지) — 다시 틀 때 이어서 */
  M.pauseAll = function () {
    Object.keys(M.entries).forEach(function (k) {
      var e = M.entries[k];
      if (e.timer) { global.clearInterval(e.timer); e.timer = null; }
      e.wanted = false; e.level = 0; apply(e);
      try { e.el.pause(); } catch (err) { /* 무시 */ }
    });
  };

  /* 손으로 누른 순간(capture) — 틀려다 막힌 곡을 다시 틀고, 아직 안 풀린 요소는 소리 없이 한 번 틀었다 멈춰 둔다 */
  M.onGesture = function () {
    Object.keys(M.entries).forEach(function (k) {
      var e = M.entries[k];
      if (e.status === 'failed') return;
      if (e.wanted && e.el.paused) { tryPlay(e); e.primed = true; return; }
      if (e.primed || e.wanted || e.status !== 'ok') return;
      e.primed = true;
      var el = e.el;
      el.muted = true;
      var p;
      try { p = el.play(); } catch (err) { el.muted = false; return; }
      var done = function () { if (!e.wanted) { try { el.pause(); el.currentTime = 0; } catch (err) { /* 무시 */ } } el.muted = false; };
      if (p && p.then) p.then(done, function () { el.muted = false; e.primed = false; });
      else done();
    });
  };

  M.bindGestures = function () {
    var d = global.document;
    if (!d || !d.addEventListener || M._bound) return;
    M._bound = true;
    ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { d.addEventListener(ev, M.onGesture, true); });
  };

  RPD.MusicFiles = M;
})(typeof window !== 'undefined' ? window : globalThis);
