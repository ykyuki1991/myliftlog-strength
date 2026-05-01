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
    innerHTML: '',
    value: '',
    checked: false,
    dataset: {},
    onclick: null,
    addEventListener() {},
    closest() { return null; },
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, force) => force ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name),
    },
  };
}

function createHarness() {
  const elements = {};
  const storage = {};
  const document = {
    getElementById(id) {
      if (!elements[id]) elements[id] = makeElement(id);
      return elements[id];
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
  };
  const context = {
    console,
    document,
    window: { addEventListener() {} },
    navigator: {},
    localStorage: {
      getItem(key) { return storage[key] || null; },
      setItem(key, value) { storage[key] = String(value); },
      removeItem(key) { delete storage[key]; },
    },
    confirm: () => true,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    Date,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(APP_JS, context);
  return { api: context.window.__mllTest, context, storage, elements };
}

function big3Log(overrides = {}) {
  return {
    id: `log-${Math.random()}`,
    date: '2026-05-01',
    day: 2,
    block: 1,
    rotation: 1,
    isDeload: false,
    exerciseKey: 'bench',
    exerciseName: 'ベンチプレス',
    menuType: 'bench-hi-main',
    plannedWeight: 100,
    plannedReps: 5,
    plannedSets: 3,
    sets: [
      { weight: 100, reps: 5, done: true },
      { weight: 100, reps: 5, done: true },
      { weight: 100, reps: 5, done: true },
    ],
    doneSets: 3,
    rpe: '8',
    pains: [],
    note: '',
    ts: Date.now(),
    ...overrides,
  };
}

const h = createHarness();
const api = h.api;
const store = api.getStore();

function testBig3FormulaUnaffected() {
  const day1 = api.getDayMenu(1, 1, store.settings);
  const squat = day1.exercises.find(ex => ex.key === 'squat');
  assert.strictEqual(squat.plannedWeight, 135);
  assert.strictEqual(squat.plannedSets, 3);
}

function testRirAndEstimatedMax() {
  assert.strictEqual(api.estimateMaxFromSet(100, 5, '8').rir, 2);
  assert.strictEqual(api.estimateMaxFromSet(100, 5, '9').rir, 1);
  assert.strictEqual(api.estimateMaxFromSet(100, 5, '10').rir, 0);
  assert.strictEqual(api.estimateMaxFromSet(100, 5, '未入力').confidence, '低');
  assert.strictEqual(api.estimateMaxFromSet(100, 5, '未入力').value, null);
  const entry = api.createEstimatedMaxEntry(big3Log({ rpe: '8' }));
  assert.ok(entry.estimatedMax > 115);
  assert.strictEqual(entry.confidence, '高');
}

function testRotationProgressionRules() {
  const easy = api.evaluateRotationProgression(big3Log({ rpe: '8', pains: [] }));
  assert.strictEqual(easy.delta, 2.5);
  assert.strictEqual(easy.recommendation, 'increase');

  const hard = api.evaluateRotationProgression(big3Log({ rpe: '9.5' }));
  assert.strictEqual(hard.delta, 0);
  assert.strictEqual(hard.recommendation, 'hold');

  const discomfort = api.evaluateRotationProgression(big3Log({ rpe: '8', pains: ['違和感'] }));
  assert.strictEqual(discomfort.delta, 2.5);

  const painful = api.evaluateRotationProgression(big3Log({ rpe: '8', pains: ['痛み'] }));
  assert.strictEqual(painful.delta, 0);

  const failed = api.evaluateRotationProgression(big3Log({ doneSets: 2 }));
  assert.strictEqual(failed.delta, 0);

  const form = api.evaluateRotationProgression(big3Log({ note: 'フォーム崩れあり' }));
  assert.strictEqual(form.delta, 0);
}

function testAdoptedProgressionAppliesOnceToNextMenu() {
  const suggestion = api.upsertRotationProgressionFromLog(big3Log({ rpe: '8' }));
  assert.strictEqual(suggestion.status, 'suggested');
  assert.ok(api.adoptRotationProgression(suggestion.id));
  const menu = api.getDayMenu(2, 2, store.settings);
  const bench = menu.exercises.find(ex => ex.key === 'bench' && ex.menuType === 'bench-hi-main');
  assert.strictEqual(bench.rotationProgressionApplied, 2.5);
}

function testMaxCandidateAndAdoption() {
  const entry = api.upsertEstimatedMaxFromLog(big3Log({ rpe: '8', sets: [{ weight: 105, reps: 5, done: true }], doneSets: 1, plannedSets: 1 }));
  const candidate = api.getMaxUpdateCandidate(entry);
  assert.ok(candidate);
  assert.ok(candidate.candidate > candidate.current);
  assert.ok(candidate.candidate <= candidate.current + 5);
  assert.ok(api.adoptEstimatedMax(entry.id));
  assert.strictEqual(store.settings.maxes.bench, candidate.candidate);
}

function testDeloadMaxTestResult() {
  store.settings.deloadMaxTestMode = 'threeRm';
  const result = api.recordMaxTestResult({
    mode: 'threeRm',
    liftKey: 'squat',
    weight: 150,
    reps: 3,
    rpe: '9',
    pains: ['なし'],
    note: '',
  });
  assert.ok(result.entry.estimatedMax > 150);
  assert.strictEqual(store.maxTestResults.at(-1).mode, 'threeRm');
  assert.ok(api.getMaxUpdateCandidate(result.entry));
}

testBig3FormulaUnaffected();
testRirAndEstimatedMax();
testRotationProgressionRules();
testAdoptedProgressionAppliesOnceToNextMenu();
testMaxCandidateAndAdoption();
testDeloadMaxTestResult();

assert.ok(h.storage[STORAGE_KEY], 'store should be persisted');
console.log('test_progression.js: all tests passed');
