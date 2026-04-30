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
    confirm: () => false,
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

const h = createHarness();
const api = h.api;
const store = api.getStore();

function testBig3Unaffected() {
  const day1 = api.getDayMenu(1, 1, store.settings);
  const squat = day1.exercises.find(ex => ex.key === 'squat');
  const bench = day1.exercises.find(ex => ex.key === 'bench' && ex.menuType === 'bench-volume');
  assert.strictEqual(squat.plannedWeight, 135);
  assert.strictEqual(squat.plannedReps, 5);
  assert.strictEqual(squat.plannedSets, 3);
  assert.strictEqual(bench.plannedWeight, 82.5);
  assert.strictEqual(bench.plannedSets, 5);
}

function testEightDayMenusAndAccessorySlots() {
  for (let day = 1; day <= 8; day++) {
    const menu = api.getDayMenu(day, 1, store.settings);
    assert.strictEqual(menu.day, day);
    assert.ok(Array.isArray(menu.exercises));
  }
  const day2 = api.getDayMenu(2, 1, store.settings);
  const accessories = day2.exercises.filter(ex => ex.isAccessory);
  assert.ok(accessories.some(ex => ex.slotName === '胸補助' && ex.name === 'インクラインDBプレス'));
  assert.ok(accessories.every(ex => Array.isArray(ex.categories) && Array.isArray(ex.fatigueTags)));
}

function testAddDeleteAccessory() {
  const before = api.buildAccessoryExercises(1, store.settings, false).length;
  api.addAccessorySlot(1);
  assert.strictEqual(api.buildAccessoryExercises(1, store.settings, false).length, before + 1);
  const added = store.settings.accessorySlots['1'].at(-1);
  api.deleteAccessorySlot(1, added.slotId);
  assert.strictEqual(api.buildAccessoryExercises(1, store.settings, false).length, before);
}

function testLoadSummaryAndWarnings() {
  const summary = api.summarizeAccessoryLoad(store.settings);
  assert.ok(summary['背中'] > 0);
  assert.ok(summary['カーフ'] > 0);

  const original = store.settings.accessorySlots['2'][0].plannedSets;
  store.settings.accessorySlots['2'][0].plannedSets = 31;
  const warnings = api.getAccessoryLoadWarnings(store.settings);
  assert.ok(warnings.some(w => w.message.includes('ベンチ系プレス') && w.level === 'danger'));
  store.settings.accessorySlots['2'][0].plannedSets = original;

  const savedSlots = store.settings.accessorySlots;
  store.settings.accessorySlots = { 1: [], 2: [], 3: [], 5: [], 6: [], 7: [] };
  const cutWarnings = api.getAccessoryLoadWarnings(store.settings);
  assert.ok(cutWarnings.some(w => w.message.includes('背中系が8日で10セット未満')));
  assert.ok(cutWarnings.some(w => w.message.includes('脚補助がゼロ')));
  store.settings.accessorySlots = savedSlots;
}

function testAccessoryProgression() {
  const ex = {
    isAccessory: true,
    key: 'incline_db',
    name: 'インクラインDBプレス',
    plannedReps: '8〜10',
    plannedSets: 3,
    weightType: 'dumbbell',
    fatigueTags: ['肩負荷'],
    sets: [
      { reps: 10, done: true },
      { reps: 10, done: true },
      { reps: 10, done: true },
    ],
    rpe: '7',
    pains: [],
  };
  assert.ok(api.suggestAccessoryProgression(ex).includes('軽すぎ'));
  ex.rpe = '9';
  assert.ok(api.suggestAccessoryProgression(ex).includes('適正'));
  ex.pains = ['肩'];
  assert.ok(api.suggestAccessoryProgression(ex).includes('痛みあり'));
}

function testTodayScreenRenders() {
  const html = api.renderToday();
  assert.ok(html.includes('トレーニング') || html.includes('休み'));
}

testBig3Unaffected();
testEightDayMenusAndAccessorySlots();
testAddDeleteAccessory();
testLoadSummaryAndWarnings();
testAccessoryProgression();
testTodayScreenRenders();

assert.ok(h.storage[STORAGE_KEY], 'store should be persisted during today render');
console.log('test_accessory.js: all tests passed');
