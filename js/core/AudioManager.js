/* AudioManager.js — 배경음과 효과음.
 *
 * 음원 파일을 쓰지 않는다. 스프라이트를 코드로 그리는 SpriteFactory 와 같은 이유다:
 * index.html 을 더블클릭해서 여는 게임이라 파일이 하나라도 없으면 그 자리에서 깨진다.
 * WebAudio 로 그때그때 합성하면 받을 것도, 깨질 것도 없다.
 * (assets/audio/ 에 파일을 두고 싶어지면 playFile() 자리만 채우면 된다.)
 *
 * 지켜야 하는 것
 *   - 브라우저는 사용자가 한 번 누르기 전에는 소리를 못 낸다. 첫 입력에서 시작한다.
 *   - 효과음이 몰리면(후반 라운드는 초당 수십 마리가 죽는다) 귀가 아프다.
 *     같은 소리는 쿨다운을 두고, 동시 발음 수를 제한한다.
 *   - 탭이 가려지거나 일시정지면 스케줄러를 멈춘다. 배터리와 CPU 를 쓸 이유가 없다.
 *   - 음량은 저장된다. 껐으면 다음 판에도 꺼져 있어야 한다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  var A = {
    ctx: null,
    ready: false,
    muted: false,
    musicVolume: 0.35,
    sfxVolume: 0.6,
    track: null,          // 'calm' | 'battle' | 'boss'
    voices: 0
  };

  var master = null, musicGain = null, sfxGain = null;
  var lastPlayed = {};
  var MAX_VOICES = 14;

  /* ---------- 음계 ---------- */
  function note(n) { return 440 * Math.pow(2, (n - 69) / 12); }   // MIDI 번호 → Hz

  /* ---------- 효과음 표 ----------
   * kind: tone(단음) · arp(아르페지오) · noise(잡음 타격) · sweep(글리산도)
   * cool: 같은 소리를 다시 낼 수 있기까지의 최소 간격(초) */
  var SFX = {
    click:      { kind: 'tone',  wave: 'square',   notes: [84], dur: 0.05, gain: 0.18, cool: 0.04 },
    place:      { kind: 'tone',  wave: 'triangle', notes: [60], dur: 0.12, gain: 0.35, cool: 0.05 },
    summon1:    { kind: 'arp',   wave: 'square',   notes: [72, 76], step: 0.05, dur: 0.1, gain: 0.3, cool: 0.03 },
    summon2:    { kind: 'arp',   wave: 'square',   notes: [72, 76, 79], step: 0.055, dur: 0.11, gain: 0.32, cool: 0.03 },
    summon3:    { kind: 'arp',   wave: 'square',   notes: [72, 76, 79, 84], step: 0.06, dur: 0.13, gain: 0.34, cool: 0.03 },
    craft:      { kind: 'arp',   wave: 'triangle', notes: [67, 71, 74, 79], step: 0.07, dur: 0.18, gain: 0.4, cool: 0.05 },
    craftBig:   { kind: 'arp',   wave: 'sawtooth', notes: [67, 74, 79, 86, 91], step: 0.08, dur: 0.3, gain: 0.4, cool: 0.05 },
    upgrade:    { kind: 'sweep', wave: 'square',   from: 62, to: 74, dur: 0.16, gain: 0.3, cool: 0.05 },
    sell:       { kind: 'sweep', wave: 'triangle', from: 67, to: 55, dur: 0.16, gain: 0.26, cool: 0.05 },
    coin:       { kind: 'arp',   wave: 'square',   notes: [88, 93], step: 0.04, dur: 0.09, gain: 0.26, cool: 0.08 },
    shard:      { kind: 'arp',   wave: 'triangle', notes: [90, 97], step: 0.045, dur: 0.12, gain: 0.26, cool: 0.08 },
    kill:       { kind: 'noise', dur: 0.05, gain: 0.1, hp: 1400, cool: 0.055 },
    hitBig:     { kind: 'noise', dur: 0.12, gain: 0.22, hp: 700, cool: 0.12 },
    skill:      { kind: 'sweep', wave: 'sawtooth', from: 55, to: 84, dur: 0.3, gain: 0.3, cool: 0.1 },
    wave:       { kind: 'arp',   wave: 'triangle', notes: [64, 71], step: 0.09, dur: 0.16, gain: 0.26, cool: 0.4 },
    boss:       { kind: 'arp',   wave: 'sawtooth', notes: [36, 43, 36, 41], step: 0.16, dur: 0.4, gain: 0.4, cool: 1 },
    life:       { kind: 'sweep', wave: 'square',   from: 58, to: 41, dur: 0.3, gain: 0.35, cool: 0.15 },
    lose:       { kind: 'arp',   wave: 'triangle', notes: [64, 60, 55, 48], step: 0.2, dur: 0.5, gain: 0.4, cool: 2 },
    win:        { kind: 'arp',   wave: 'square',   notes: [72, 76, 79, 84, 88], step: 0.12, dur: 0.5, gain: 0.4, cool: 2 },
    spell:      { kind: 'arp',   wave: 'sine',     notes: [60, 67, 72, 76, 79, 84, 88], step: 0.11, dur: 0.6, gain: 0.45, cool: 2 },
    reward:     { kind: 'arp',   wave: 'triangle', notes: [72, 76, 79, 84, 88, 91], step: 0.09, dur: 0.35, gain: 0.4, cool: 1 },
    deny:       { kind: 'tone',  wave: 'square',   notes: [45], dur: 0.12, gain: 0.22, cool: 0.15 }
  };

  /* ---------- 배경음 ----------
   * 8분음표 격자에 베이스·화음·멜로디를 깔아 둔 아주 작은 시퀀서다.
   * null 은 쉼표. 곡은 세 개뿐이지만 라운드 상황에 맞춰 갈아 낀다. */
  var TRACKS = {
    calm: {
      bpm: 92, steps: 16,
      bass:  [45, null, 52, null, 43, null, 50, null, 45, null, 52, null, 41, null, 48, null],
      lead:  [69, null, 72, 76, null, 74, null, 72, 69, null, 67, null, 69, null, null, null],
      padOn: [0, 8]
    },
    battle: {
      bpm: 132, steps: 16,
      bass:  [40, 40, 47, 40, 45, 45, 52, 45, 38, 38, 45, 38, 43, 43, 50, 43],
      lead:  [76, null, 79, 76, 83, null, 81, 79, 76, null, 74, 76, 79, null, 83, null],
      padOn: [0, 4, 8, 12]
    },
    /* 주문 연출 전용 — 히든은 신비롭게, 불멸은 장엄하게, 초월은 가장 크게 */
    hidden: {
      bpm: 84, steps: 16,
      bass:  [50, null, null, null, 53, null, null, null, 57, null, null, null, 55, null, null, null],
      lead:  [74, 77, 81, null, 79, 77, 74, null, 81, 84, 86, null, 84, 81, 79, null],
      padOn: [0, 4, 8, 12]
    },
    immortal: {
      bpm: 96, steps: 16,
      bass:  [38, null, 45, null, 43, null, 50, null, 41, null, 48, null, 45, null, 52, null],
      lead:  [74, null, 77, 81, 79, null, 77, null, 86, null, 84, 81, 82, null, 81, null],
      padOn: [0, 4, 8, 12]
    },
    transcend: {
      bpm: 118, steps: 16,
      bass:  [36, 36, 43, 36, 41, 41, 48, 41, 38, 38, 45, 38, 43, 43, 50, 55],
      lead:  [84, 88, 91, 88, 93, 91, 88, 84, 86, 89, 93, 89, 96, 93, 91, 88],
      padOn: [0, 2, 4, 6, 8, 10, 12, 14]
    },
    boss: {
      bpm: 146, steps: 16,
      bass:  [33, 33, 33, 36, 33, 33, 35, 36, 33, 33, 33, 36, 38, 38, 40, 41],
      lead:  [69, 68, 69, null, 72, null, 68, null, 69, 68, 69, 72, 75, null, 74, null],
      padOn: [0, 8]
    }
  };

  var seq = { step: 0, nextTime: 0, timer: null };

  /* ---------- 준비 ---------- */

  A.init = function () {
    var self = this;

    this.muted = !!RPD.SaveManager.getSetting('audioMuted', false);
    this.musicVolume = num(RPD.SaveManager.getSetting('musicVolume', 0.35), 0.35);
    this.sfxVolume = num(RPD.SaveManager.getSetting('sfxVolume', 0.6), 0.6);

    // 브라우저 정책: 사용자가 한 번 누르기 전에는 소리를 낼 수 없다
    if (typeof document !== 'undefined' && document.addEventListener) {
      var unlock = function () { self.start(); };
      document.addEventListener('pointerdown', unlock, { once: true });
      document.addEventListener('keydown', unlock, { once: true });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) stopSequencer();
        else if (self.ready && !self.muted) startSequencer();
      });
    }

    bindEvents(this);
  };

  function num(v, fallback) {
    var n = parseFloat(v);
    return isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  }

  A.start = function () {
    if (this.ready) return true;
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return false;
    try {
      this.ctx = new Ctx();
    } catch (e) {
      return false;
    }
    master = this.ctx.createGain();
    master.gain.value = this.muted ? 0 : 1;
    master.connect(this.ctx.destination);

    musicGain = this.ctx.createGain();
    musicGain.gain.value = this.musicVolume;
    musicGain.connect(master);

    sfxGain = this.ctx.createGain();
    sfxGain.gain.value = this.sfxVolume;
    sfxGain.connect(master);

    this.ready = true;
    if (this.ctx.resume) this.ctx.resume();

    /* 소리가 깨어나기 전에도 게임은 돌아간다 — 그동안 이벤트가 track 을 이미 정해 뒀을 수 있다.
     * 그 경우 setTrack 은 "같은 곡"이라며 아무것도 하지 않으므로, 여기서 직접 시작한다.
     * (이걸 빠뜨려서 첫 판 배경음이 통째로 안 나왔다) */
    this.track = trackForNow();
    seq.step = 0;
    if (!this.muted && this.musicVolume > 0) startSequencer();
    RPD.bus.emit('audio:ready', {});
    return true;
  };

  A.setMuted = function (muted) {
    this.muted = !!muted;
    RPD.SaveManager.setSetting('audioMuted', this.muted);
    if (master) master.gain.value = this.muted ? 0 : 1;
    if (this.muted) stopSequencer();
    else if (this.ready) startSequencer();
    RPD.bus.emit('audio:changed', this.state());
  };

  A.setMusicVolume = function (v) {
    this.musicVolume = num(v, this.musicVolume);
    RPD.SaveManager.setSetting('musicVolume', this.musicVolume);
    if (musicGain) musicGain.gain.value = this.musicVolume;
    if (this.musicVolume === 0) stopSequencer();
    else if (this.ready && !this.muted) startSequencer();
    RPD.bus.emit('audio:changed', this.state());
  };

  A.setSfxVolume = function (v) {
    this.sfxVolume = num(v, this.sfxVolume);
    RPD.SaveManager.setSetting('sfxVolume', this.sfxVolume);
    if (sfxGain) sfxGain.gain.value = this.sfxVolume;
    RPD.bus.emit('audio:changed', this.state());
  };

  A.state = function () {
    return {
      ready: this.ready, muted: this.muted,
      music: this.musicVolume, sfx: this.sfxVolume,
      track: this.track, voices: this.voices
    };
  };

  /* ---------- 효과음 ---------- */

  A.play = function (name, opts) {
    if (!this.ready || this.muted || this.sfxVolume <= 0) return false;
    var def = SFX[name];
    if (!def) return false;

    var now = this.ctx.currentTime;
    if (lastPlayed[name] && now - lastPlayed[name] < (def.cool || 0)) return false;
    if (this.voices >= MAX_VOICES) return false;
    lastPlayed[name] = now;

    var detune = (opts && opts.detune) || 0;
    var gain = (def.gain || 0.3) * ((opts && opts.gain) || 1);

    switch (def.kind) {
      case 'arp':
        for (var i = 0; i < def.notes.length; i++) {
          tone(this, def.wave, note(def.notes[i] + detune), now + i * def.step, def.dur, gain);
        }
        break;
      case 'sweep':
        sweep(this, def.wave, note(def.from + detune), note(def.to + detune), now, def.dur, gain);
        break;
      case 'noise':
        noise(this, now, def.dur, gain, def.hp);
        break;
      default:
        tone(this, def.wave, note(def.notes[0] + detune), now, def.dur, gain);
    }
    return true;
  };

  function envelope(self, node, start, dur, gain) {
    var g = self.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    node.connect(g);
    g.connect(sfxGain);
    self.voices += 1;
    return g;
  }

  function tone(self, wave, freq, start, dur, gain) {
    var osc = self.ctx.createOscillator();
    osc.type = wave || 'square';
    osc.frequency.setValueAtTime(freq, start);
    envelope(self, osc, start, dur, gain);
    osc.start(start);
    osc.stop(start + dur + 0.02);
    osc.onended = function () { self.voices -= 1; };
  }

  function sweep(self, wave, from, to, start, dur, gain) {
    var osc = self.ctx.createOscillator();
    osc.type = wave || 'square';
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
    envelope(self, osc, start, dur, gain);
    osc.start(start);
    osc.stop(start + dur + 0.02);
    osc.onended = function () { self.voices -= 1; };
  }

  /* 타격음은 짧은 잡음이다. 버퍼를 매번 만들지 않고 한 번 구워 재생한다. */
  var noiseBuffer = null;
  function noise(self, start, dur, gain, highpass) {
    if (!noiseBuffer) {
      var len = Math.floor(self.ctx.sampleRate * 0.3);
      noiseBuffer = self.ctx.createBuffer(1, len, self.ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    var src = self.ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var filter = self.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass || 800;
    src.connect(filter);
    envelope(self, filter, start, dur, gain);
    src.start(start);
    src.stop(start + dur + 0.02);
    src.onended = function () { self.voices -= 1; };
  }

  /* ---------- 배경음 시퀀서 ---------- */

  A.setTrack = function (name) {
    if (!TRACKS[name] || this.track === name) return;
    this.track = name;
    seq.step = 0;
    seq.nextTime = this.ready ? this.ctx.currentTime + 0.05 : 0;
    if (this.ready && !this.muted && this.musicVolume > 0) startSequencer();
    RPD.bus.emit('audio:track', { track: name });
  };

  function trackForNow() {
    var GM = RPD.GameManager;
    if (!GM || !GM.isPlayable || !GM.isPlayable()) return 'calm';
    return RPD.BossManager && RPD.BossManager.active ? 'boss' : 'battle';
  }

  function startSequencer() {
    if (seq.timer || !A.ready) return;
    seq.nextTime = A.ctx.currentTime + 0.05;
    seq.timer = global.setInterval(schedule, 40);
  }

  function stopSequencer() {
    if (!seq.timer) return;
    global.clearInterval(seq.timer);
    seq.timer = null;
  }

  /* 0.2초 앞을 미리 예약한다. setInterval 의 흔들림이 박자에 새지 않게. */
  function schedule() {
    if (!A.ready || A.muted || A.musicVolume <= 0) { stopSequencer(); return; }
    var t = TRACKS[A.track] || TRACKS.calm;
    var stepDur = 60 / t.bpm / 2;
    var ahead = A.ctx.currentTime + 0.2;

    while (seq.nextTime < ahead) {
      playStep(t, seq.step, seq.nextTime, stepDur);
      seq.step = (seq.step + 1) % t.steps;
      seq.nextTime += stepDur;
    }
  }

  function playStep(t, step, when, stepDur) {
    var b = t.bass[step];
    if (b != null) musicTone('triangle', note(b), when, stepDur * 0.9, 0.5);

    var l = t.lead[step];
    if (l != null) musicTone('square', note(l), when, stepDur * 0.8, 0.22);

    if (t.padOn.indexOf(step) >= 0) {
      musicTone('sine', note(t.bass[step] != null ? t.bass[step] + 12 : 60), when, stepDur * 3.5, 0.12);
    }
  }

  function musicTone(wave, freq, start, dur, gain) {
    var osc = A.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, start);
    var g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(musicGain);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /* ---------- 이벤트 연결 ----------
   * 게임 쪽 코드는 소리를 모른다. 여기서 이벤트만 듣는다. */
  function bindEvents(self) {
    var bus = RPD.bus;

    bus.on('summon:result', function (r) {
      if (!r || !r.ok) { self.play('deny'); return; }
      var idx = RPD.TIER_ORDER.indexOf(r.tier);
      self.play(idx >= 2 ? 'summon3' : idx === 1 ? 'summon2' : 'summon1');
    });

    bus.on('recipe:crafted', function (p) {
      var idx = p && p.tier ? RPD.TIER_ORDER.indexOf(p.tier) : 0;
      self.play(idx >= 3 ? 'craftBig' : 'craft');
    });

    bus.on('field:placed', function () { self.play('place'); });
    bus.on('unit:upgraded', function () { self.play('upgrade'); });
    bus.on('unit:sold', function () { self.play('sell'); });
    bus.on('field:slotBought', function () { self.play('coin'); });
    bus.on('storage:expanded', function () { self.play('coin'); });
    bus.on('shard:spent', function () { self.play('shard'); });
    bus.on('unit:skill', function () { self.play('skill'); });

    // 처치음은 음높이를 조금씩 흔들어 같은 소리가 반복되는 느낌을 줄인다
    bus.on('enemy:died', function () {
      self.play('kill', { detune: Math.floor(Math.random() * 5) - 2 });
    });
    bus.on('combat:execute', function () { self.play('hitBig'); });
    bus.on('enemy:shieldBroken', function () { self.play('hitBig'); });

    bus.on('reward:granted', function () { self.play('reward'); });
    bus.on('game:life', function (p) { if (p && p.delta < 0) self.play('life'); });

    bus.on('game:wave', function () {
      self.play('wave');
      self.setTrack(trackForNow());
    });

    bus.on('boss:appeared', function () { self.play('boss'); self.setTrack('boss'); });
    bus.on('boss:cleared', function () { self.setTrack(trackForNow()); });

    bus.on('game:state', function (e) {
      if (!e) return;
      if (e.to === 'LIVE') self.setTrack(trackForNow());
      else self.setTrack('calm');
    });

    bus.on('game:over', function (p) {
      self.play(p && p.cleared ? 'win' : 'lose');
      self.setTrack('calm');
    });

    bus.on('loop:paused', function (paused) {
      if (A.scene) return;                 // 주문 연출 중에는 게임만 멈추고 음악은 계속
      if (paused) stopSequencer();
      else if (self.ready && !self.muted && self.musicVolume > 0) startSequencer();
    });
  }

  A.click = function () { this.play('click'); };

  /* 주문 연출 — 곡을 바꾸고, 끝나면 원래 곡으로 */
  A.setTrack_ = null;
  A.playScene = function (track) {
    this.scene = true;
    this.setTrack(track);
    if (this.ready && !this.muted && this.musicVolume > 0) startSequencer();
  };
  A.restoreTrack = function () {
    this.scene = false;
    this.setTrack(trackForNow());
    if (RPD.Loop && RPD.Loop.paused) stopSequencer();
  };

  /* 검사용 — 배경음 스케줄러가 실제로 돌고 있는지 밖에서 볼 수 있어야 한다 */
  A.musicRunning = function () { return !!seq.timer; };
  A.debug = function () { return { timer: !!seq.timer, step: seq.step, next: seq.nextTime, track: A.track }; };

  RPD.AudioManager = A;
})(typeof window !== 'undefined' ? window : globalThis);
