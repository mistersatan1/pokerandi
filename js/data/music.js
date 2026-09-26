/* music.js — 배경음악 파일 설정 (세션 55).
 *
 * 곡 파일을 assets/music/ 에 넣으면 그 장면에서 파일을 반복 재생한다. 없거나 못 불러오면 예전처럼 합성 음악.
 * 파일은 <audio> 요소로 틀기 때문에 index.html 을 더블클릭(file://)으로 열어도 된다.
 *
 *   장면        언제
 *   calm       판 시작 전 · 결과 화면(평시)
 *   battle     라운드 전투
 *   boss       보스가 나왔을 때
 *   hidden     히든 주문 연출
 *   immortal   불멸 주문 연출
 *   transcend  초월 주문 연출
 *
 * file   : 파일 경로. 이름을 바꾸거나 .ogg · .m4a 를 써도 된다(브라우저가 틀 수 있는 형식이면). 비우면('') 그 장면은 항상 합성 음악.
 * volume : 곡별 음량 0~1(기본 1). 설정 창의 배경음 음량 · 음소거가 그 위에 곱해진다 — 곡끼리 크기가 다르면 여기서 맞춘다.
 *
 * 곡이 바뀔 때 crossfade 초만큼 겹쳐 넘어간다. 한 파일짜리 테스트판(npm run build)에는 파일을 넣지 않고 합성 음악만 쓴다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  RPD.MusicData = {
    crossfade: 1.0,
    tracks: {
      calm:      { file: 'assets/music/calm.mp3',      volume: 1.0 },
      battle:    { file: 'assets/music/battle.mp3',    volume: 1.0 },
      boss:      { file: 'assets/music/boss.mp3',      volume: 1.0 },
      hidden:    { file: 'assets/music/hidden.mp3',    volume: 1.0 },
      immortal:  { file: 'assets/music/immortal.mp3',  volume: 1.0 },
      transcend: { file: 'assets/music/transcend.mp3', volume: 1.0 }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
