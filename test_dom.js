const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const APP_JS = fs.readFileSync('app.js', 'utf8');
const STORAGE_KEY = 'mll_strength_planner_v1';

function makeElement(id) {
  const classes = new Set();
  return {
    id,
    textContent: '',
    onclick: null,
    dataset: {},
    addEventListener() {},
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, force) => {
        if (force === undefined) {
          if (classes.has(name)) classes.delete(name);
          else classes.add(name);
        } else if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
      contains: name => classes.has(name),
    },
  };
}

function createHarness(initialStore = null) {
  const elements = {};
  [
    'restTimer',
    'restToggle',
    'restTimerDisplay',
    'restPlus30',
    'restMinus30',
    'restReset',
    'restClose',
  ].forEach(id => { elements[id] = makeElement(id); });
  elements.restTimer.classList.add('hidden');

  const listeners = { document: {}, window: {} };
  const storage = {};
  if (initialStore) storage[STORAGE_KEY] = JSON.stringify(initialStore);

  const document = {
    getElementById(id) {
      if (!elements[id]) elements[id] = makeElement(id);
      return elements[id];
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(type, handler) {
      listeners.document[type] = listeners.document[type] || [];
      listeners.document[type].push(handler);
    },
    dispatchEvent(event) {
      (listeners.document[event.type] || []).forEach(handler => handler(event));
    },
  };

  const window = {
    addEventListener(type, handler) {
      listeners.window[type] = listeners.window[type] || [];
      listeners.window[type].push(handler);
    },
    dispatchEvent(event) {
      (listeners.window[event.type] || []).forEach(handler => handler(event));
    },
    AudioContext: class {
      createOscillator() {
        return {
          type: '',
          frequency: { value: 0 },
          connect() {},
          start() {},
          stop() {},
        };
      }
      createGain() {
        return { gain: { value: 0 }, connect() {} };
      }
      close() {}
      get destination() { return {}; }
    },
  };

  const context = {
    assert,
    console,
    document,
    window,
    navigator: { vibrate() {} },
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
      },
      setItem(key, value) {
        storage[key] = String(value);
      },
      removeItem(key) {
        delete storage[key];
      },
    },
    confirm: () => false,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: fn => {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout: () => {},
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(APP_JS, context);
  context.window.__mllTest.setupRestTimerControls();
  context.window.__mllTest.setupRestTimerLifecycleEvents();
  return { context, elements, storage, document, window, api: context.window.__mllTest };
}

function savedStore(harness) {
  return JSON.parse(harness.storage[STORAGE_KEY]);
}

function testStartPersistsState() {
  const h = createHarness();
  h.api.setNowProvider(() => 1_000_000);
  h.api.startRestTimer(90, 'ベンチプレス');

  const saved = savedStore(h).restTimerState;
  assert.strictEqual(saved.restStartedAt, 1_000_000);
  assert.strictEqual(saved.restDurationSec, 90);
  assert.strictEqual(saved.restEndAt, 1_090_000);
  assert.strictEqual(saved.running, true);
  assert.strictEqual(saved.targetName, 'ベンチプレス');
  assert.strictEqual(saved.alertedAt, null);
  assert.strictEqual(h.elements.restTimerDisplay.textContent, '01:30');
}

function testRestoreBeforeEnd() {
  const initial = {
    restTimerState: {
      restStartedAt: 1_000_000,
      restDurationSec: 90,
      restEndAt: 1_090_000,
      running: true,
      targetName: 'スクワット',
      alertedAt: null,
    },
  };
  const h = createHarness(initial);
  h.api.setNowProvider(() => 1_030_000);
  h.api.restoreRestTimer();

  assert.strictEqual(h.api.getRestState().remaining, 60);
  assert.strictEqual(h.api.getRestState().running, true);
  assert.strictEqual(h.elements.restTimerDisplay.textContent, '01:00');
}

function testRestoreAfterEnd() {
  const initial = {
    restTimerState: {
      restStartedAt: 1_000_000,
      restDurationSec: 30,
      restEndAt: 1_030_000,
      running: true,
      targetName: 'デッドリフト',
      alertedAt: null,
    },
  };
  const h = createHarness(initial);
  h.api.setNowProvider(() => 1_031_000);
  h.api.restoreRestTimer();

  const state = h.api.getRestState();
  assert.strictEqual(state.remaining, 0);
  assert.strictEqual(state.running, false);
  assert.ok(state.alertedAt);
  assert.strictEqual(h.elements.restTimer.classList.contains('alarm'), true);
}

function testLifecycleEventsRecalculate() {
  const h = createHarness();
  h.api.setNowProvider(() => 2_000_000);
  h.api.startRestTimer(120, 'ロウ');

  h.api.setNowProvider(() => 2_045_000);
  h.document.dispatchEvent({ type: 'visibilitychange' });
  assert.strictEqual(h.api.getRestState().remaining, 75);

  h.api.setNowProvider(() => 2_060_000);
  h.window.dispatchEvent({ type: 'focus' });
  assert.strictEqual(h.api.getRestState().remaining, 60);

  h.api.setNowProvider(() => 2_090_000);
  h.window.dispatchEvent({ type: 'pageshow' });
  assert.strictEqual(h.api.getRestState().remaining, 30);
}

function testControlsStayConsistent() {
  const h = createHarness();
  h.api.setNowProvider(() => 3_000_000);
  h.api.startRestTimer(60, '補助');

  h.elements.restPlus30.onclick();
  assert.strictEqual(h.api.getRestState().remaining, 90);
  assert.strictEqual(savedStore(h).restTimerState.restEndAt, 3_090_000);

  h.elements.restMinus30.onclick();
  assert.strictEqual(h.api.getRestState().remaining, 60);
  assert.strictEqual(savedStore(h).restTimerState.restEndAt, 3_060_000);

  h.api.setNowProvider(() => 3_010_000);
  h.elements.restToggle.onclick();
  assert.strictEqual(h.api.getRestState().running, false);
  assert.strictEqual(h.api.getRestState().remaining, 50);
  assert.strictEqual(savedStore(h).restTimerState.running, false);

  h.api.setNowProvider(() => 3_030_000);
  h.elements.restToggle.onclick();
  assert.strictEqual(h.api.getRestState().running, true);
  assert.strictEqual(savedStore(h).restTimerState.restEndAt, 3_080_000);

  h.elements.restReset.onclick();
  assert.strictEqual(h.api.getRestState().remaining, 60);
  assert.strictEqual(savedStore(h).restTimerState.restEndAt, 3_090_000);

  h.elements.restClose.onclick();
  assert.strictEqual(h.api.getStore().restTimerState, null);
  assert.strictEqual(savedStore(h).restTimerState, null);
  assert.strictEqual(h.elements.restTimer.classList.contains('hidden'), true);
}

testStartPersistsState();
testRestoreBeforeEnd();
testRestoreAfterEnd();
testLifecycleEventsRecalculate();
testControlsStayConsistent();

console.log('test_dom.js: all tests passed');
