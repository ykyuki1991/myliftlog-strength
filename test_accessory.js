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

  const day3 = api.getDayMenu(3, 1, store.settings);
  assert.ok(day3.exercises.some(ex => ex.isAccessory && ex.name === 'サイドレイズ' && ex.categories.includes('横肩')));
  const day6 = api.getDayMenu(6, 1, store.settings);
  assert.ok(day6.exercises.some(ex => ex.isAccessory && ex.name === 'リアデルトフライ' && ex.categories.includes('後ろ肩')));
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
  assert.ok(summary['横肩'] >= 3);
  assert.ok(summary['後ろ肩'] >= 3);

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
  assert.ok(cutWarnings.some(w => w.message.includes('横肩の直接刺激')));
  assert.ok(cutWarnings.some(w => w.message.includes('後ろ肩の直接刺激')));
  store.settings.accessorySlots = savedSlots;
}

function testUpdateMoveResetAndBlockEditor() {
  const day3Side = store.settings.accessorySlots['3'].find(slot => slot.slotId === 'd3-side-raise');
  api.updateAccessorySlot(3, day3Side.slotId, { ...day3Side, plannedSets: 4, reps: '15〜20' });
  const updated = store.settings.accessorySlots['3'].find(slot => slot.slotId === 'd3-side-raise');
  assert.strictEqual(updated.plannedSets, 4);
  assert.strictEqual(updated.reps, '15〜20');

  const beforeFirst = store.settings.accessorySlots['3'][0].slotId;
  api.moveAccessorySlot(3, 'd3-side-raise', -1);
  assert.notStrictEqual(store.settings.accessorySlots['3'][0].slotId, beforeFirst);

  api.resetAccessorySlotsForDay(3);
  assert.ok(store.settings.accessorySlots['3'].some(slot => slot.slotId === 'd3-side-raise' && slot.plannedSets === 3));

  const blockHtml = api.renderBlock();
  assert.ok(blockHtml.includes('補助種目管理'));
  assert.ok(blockHtml.includes('サイドレイズ'));
  assert.ok(blockHtml.includes('リアデルトフライ'));
  assert.ok(blockHtml.includes('初期おすすめに戻す'));
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
  if (!html.includes('今日は休み')) {
    assert.ok(html.includes('＋補助種目を追加'));
    assert.ok(html.includes('補助編集'));
  }
}

testBig3Unaffected();
testEightDayMenusAndAccessorySlots();
testAddDeleteAccessory();
testLoadSummaryAndWarnings();
testUpdateMoveResetAndBlockEditor();
testAccessoryProgression();
testTodayScreenRenders();

assert.ok(h.storage[STORAGE_KEY], 'store should be persisted during today render');
console.log('test_accessory.js: all tests passed');
