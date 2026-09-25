/* EventBus.js — 시스템 간 결합을 끊기 위한 발행/구독.
 * 예: EnemyManager 가 'enemy:died' 를 쏘면 EconomyManager, StatsManager, FxRenderer 가
 * 서로를 전혀 모른 채 각자 반응한다. 순환 의존이 생기지 않는다.
 */
(function (global) {
  'use strict';
  var RPD = global.RPD;

  function EventBus() {
    this._handlers = {};
  }

  EventBus.prototype.on = function (event, fn) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(fn);
    return fn;
  };

  EventBus.prototype.off = function (event, fn) {
    var list = this._handlers[event];
    if (!list) return;
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };

  EventBus.prototype.emit = function (event, payload) {
    var list = this._handlers[event];
    if (!list || list.length === 0) return;
    // 핸들러가 도중에 off 를 호출해도 안전하도록 복사본을 순회한다.
    var copy = list.slice();
    for (var i = 0; i < copy.length; i++) {
      try {
        copy[i](payload);
      } catch (err) {
        console.error('[EventBus] "' + event + '" 핸들러 오류:', err);
      }
    }
  };

  EventBus.prototype.clear = function () { this._handlers = {}; };

  RPD.EventBus = EventBus;
  RPD.bus = new EventBus();
})(typeof window !== 'undefined' ? window : globalThis);
