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

function createHarness(options = {}) {
  const elements = {};
  const storage = {};
  if (options.initialStore) storage[STORAGE_KEY] = JSON.stringify(options.initialStore);
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
  const api = context.window.__mllTest;
  if (options.forceLegacy !== false) api.getStore().settings.programMode = 'legacy8';
  return { api, context, storage, elements };
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
  assert.strictEqual(api.estimateMaxFromSet(120, 1, '10').value, 120);
  assert.strictEqual(api.estimateMaxFromSet(120, 1, '10').confidence, '高');
  assert.strictEqual(api.estimateMaxFromSet(100, 5, '未入力').confidence, '低');
  assert.strictEqual(api.estimateMaxFromSet(100, 5, '未入力').value, null);
  const entry = api.createEstimatedMaxEntry(big3Log({ rpe: '8' }));
  assert.ok(entry.estimatedMax > 115);
  assert.strictEqual(entry.confidence, '高');
  assert.strictEqual(entry.maxUseLabel, '採用候補');
  assert.strictEqual(entry.useForMaxUpdate, true);
}

function testEstimatedMaxFiltering() {
  const intensity = api.createEstimatedMaxEntry(big3Log({ menuType: 'bench-hi-main', rpe: '8.5', sets: [{ weight: 105, reps: 3, done: true }], doneSets: 1, plannedSets: 1 }));
  assert.strictEqual(intensity.maxUseLabel, '採用候補');
  assert.strictEqual(intensity.useForMaxUpdate, true);

  const benchMainFive = api.createEstimatedMaxEntry(big3Log({ menuType: 'bench-hi-main', rpe: '8', sets: [{ weight: 92.5, reps: 5, done: true }], doneSets: 1, plannedSets: 3 }));
  assert.strictEqual(benchMainFive.maxUseLabel, '採用候補');
  assert.strictEqual(benchMainFive.maxUseReason, '強度メイン');
  assert.strictEqual(benchMainFive.useForMaxUpdate, true);

  const halfDeadMainFive = api.createEstimatedMaxEntry(big3Log({ exerciseKey: 'halfDead', exerciseName: 'ハーフデッド', menuType: 'halfDead-hi-main', rpe: '9', sets: [{ weight: 167.5, reps: 5, done: true }], doneSets: 1, plannedSets: 3 }));
  assert.strictEqual(halfDeadMainFive.maxUseLabel, '採用候補');
  assert.strictEqual(halfDeadMainFive.useForMaxUpdate, true);

  const floorDeadMain = api.createEstimatedMaxEntry(big3Log({ exerciseKey: 'floorDead', exerciseName: '床引きデッド', menuType: 'floorDead-main', rpe: '9.5', sets: [{ weight: 160, reps: 5, done: true }, { weight: 160, reps: 5, done: true }, { weight: 160, reps: 5, done: true }], doneSets: 3, plannedSets: 3 }));
  assert.strictEqual(floorDeadMain.maxUseLabel, '採用候補');
  assert.strictEqual(floorDeadMain.maxUseReason, '強度メイン');
  assert.strictEqual(floorDeadMain.useForMaxUpdate, true);

  const floorDeadAlias = api.createEstimatedMaxEntry(big3Log({ exerciseKey: 'floor_dead', exerciseName: '床引きデッド', menuType: 'floorDead-main', rpe: '9', sets: [{ weight: 155, reps: 5, done: true }], doneSets: 1, plannedSets: 1 }));
  assert.strictEqual(floorDeadAlias.liftKey, 'floorDead');
  assert.strictEqual(floorDeadAlias.maxUseLabel, '採用候補');

  const lowerRpeSeven = api.createEstimatedMaxEntry(big3Log({ menuType: 'bench-hi-main', rpe: '7', sets: [{ weight: 90, reps: 7, done: true }], doneSets: 1, plannedSets: 1 }));
  assert.strictEqual(lowerRpeSeven.maxUseLabel, '参考');
  assert.strictEqual(lowerRpeSeven.maxUseReason, '6〜8回');
  assert.strictEqual(lowerRpeSeven.useForMaxUpdate, false);

  const light = api.createEstimatedMaxEntry(big3Log({ menuType: 'bench-light', rpe: '8', sets: [{ weight: 80, reps: 6, done: true }], doneSets: 1, plannedSets: 1 }));
  assert.strictEqual(light.maxUseLabel, '除外');
  assert.strictEqual(light.maxUseReason, '軽め日');
  assert.strictEqual(light.useForMaxUpdate, false);

  const volume = api.createEstimatedMaxEntry(big3Log({ menuType: 'bench-volume', rpe: '8', sets: [{ weight: 85, reps: 6, done: true }], doneSets: 1, plannedSets: 1 }));
  assert.strictEqual(volume.maxUseLabel, '参考');
  assert.strictEqual(volume.useForMaxUpdate, false);

  const deload = api.createEstimatedMaxEntry(big3Log({ isDeload: true, rpe: '8' }));
  assert.strictEqual(deload.maxUseLabel, '除外');
  assert.strictEqual(deload.useForMaxUpdate, false);

  const painful = api.createEstimatedMaxEntry(big3Log({ pains: ['痛み'], rpe: '8' }));
  assert.strictEqual(painful.maxUseLabel, '除外');

  const noRpe = api.createEstimatedMaxEntry(big3Log({ rpe: '未入力' }));
  assert.strictEqual(noRpe, null);

  const r4MaxTest = api.createEstimatedMaxEntry(big3Log({ isDeload: true, menuType: 'max-test-e1rm', rpe: '8.5', sets: [{ weight: 100, reps: 3, done: true }], doneSets: 1, plannedSets: 1 }));
  assert.strictEqual(r4MaxTest.maxUseLabel, '採用候補');
  assert.strictEqual(r4MaxTest.useForMaxUpdate, true);

  const trueOneRm = api.createEstimatedMaxEntry(big3Log({ isDeload: true, menuType: 'max-test-trueOneRm', rpe: '10', sets: [{ weight: 120, reps: 1, done: true }], doneSets: 1, plannedSets: 1 }));
  assert.strictEqual(trueOneRm.estimatedMax, 120);
  assert.strictEqual(trueOneRm.maxUseLabel, '採用候補');
  assert.strictEqual(trueOneRm.maxUseReason, '1RM測定');
  assert.strictEqual(trueOneRm.useForMaxUpdate, true);

  const adoptedHtmlStore = api.getStore();
  adoptedHtmlStore.estimatedMaxHistory = [{
    id: 'adopted-excluded',
    liftKey: 'bench',
    liftName: 'ベンチプレス',
    estimatedMax: 120,
    sourceWeight: 100,
    sourceReps: 5,
    rpe: '8',
    diff: 5,
    date: '2026-05-01',
    maxUseKind: 'excluded',
    maxUseLabel: '除外',
    maxUseReason: '旧判定',
    adopted: true,
    ts: 1,
  }];
  const historyHtml = api.renderEstimatedMaxHistory(1);
  assert.ok(historyHtml.includes('採用済み'));
  assert.ok(!historyHtml.includes('>除外<'));
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

  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();
  isolatedStore.settings.maxes.bench = 115;
  const tooSmallGap = isolatedApi.createEstimatedMaxEntry(big3Log({ rpe: '8', sets: [{ weight: 105, reps: 1, done: true }], doneSets: 1, plannedSets: 1 }));
  assert.strictEqual(isolatedApi.getMaxUpdateCandidate(tooSmallGap), null, 'MAX候補 should not round above estimated max');
}

function testDeloadMaxTestResult() {
  store.settings.deloadMaxTestMode = 'trueOneRm';
  store.settings.maxes.squat = 140;
  const beforeLogs = store.logs.length;
  const result = api.recordMaxTestResult({
    mode: 'trueOneRm',
    liftKey: 'squat',
    weight: 150,
    reps: 1,
    rpe: '10',
    pains: ['なし'],
    note: '',
  });
  assert.strictEqual(result.entry.estimatedMax, 150);
  assert.strictEqual(store.maxTestResults.at(-1).mode, 'trueOneRm');
  assert.strictEqual(store.logs.length, beforeLogs + 1);
  assert.ok(store.logs.at(-1).menuType === 'max-test-trueOneRm');
  assert.strictEqual(store.logs.at(-1).sets[0].reps, 1);
  assert.ok(api.getMaxUpdateCandidate(result.entry));
  assert.strictEqual(result.test.measuredMaxWeight, 150);
  assert.strictEqual(result.test.isMeasuredMax, true);
  assert.strictEqual(result.test.estimatedMax, 150);

  const again = api.recordMaxTestResult({
    mode: 'trueOneRm',
    liftKey: 'squat',
    weight: 150,
    reps: 1,
    rpe: '10',
    pains: ['なし'],
    note: '',
  });
  assert.strictEqual(store.logs.length, beforeLogs + 1, 'max test log should be upserted');
  assert.strictEqual(store.maxTestResults.filter(item => item.liftKey === 'squat' && item.mode === 'trueOneRm').length, 1);
  assert.strictEqual(store.estimatedMaxHistory.filter(item => item.logId === again.entry.logId).length, 1);

  const failed = api.recordMaxTestResult({
    liftKey: 'bench',
    weight: 125,
    reps: 1,
    rpe: '10',
    success: false,
    pains: ['なし'],
    note: '惜しい',
  });
  assert.strictEqual(failed.entry, null);
  assert.strictEqual(failed.test.challengeFailed, true);
  assert.strictEqual(failed.test.measuredMaxWeight, null);
  assert.strictEqual(store.logs.find(log => log.id === failed.log.id).doneSets, 0);
  assert.strictEqual(store.estimatedMaxHistory.some(entry => entry.logId === failed.log.id), false);
}

function testBlockSuggestionPainSeverity() {
  store.logs = [big3Log({ pains: ['違和感'] })];
  const discomfortSuggestion = api.computeNextBlockSuggestion().find(s => s.key === 'bench');
  assert.ok(discomfortSuggestion.delta > 0, 'discomfort should not block block-level increase suggestions');

  store.logs = [big3Log({ pains: ['痛み'] })];
  const painfulSuggestion = api.computeNextBlockSuggestion().find(s => s.key === 'bench');
  assert.strictEqual(painfulSuggestion.delta, 0);
  assert.ok(painfulSuggestion.reason.includes('痛みあり'));
}

function testMaxUpdateAndRotationProgressionAreCapped() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();
  isolatedStore.settings.maxes.bench = 130;
  isolatedStore.logs = [big3Log({ plannedWeight: 100, ts: 1 })];

  const cappedMenu = isolatedApi.getDayMenu(2, 2, isolatedStore.settings);
  const cappedBench = cappedMenu.exercises.find(ex => ex.key === 'bench' && ex.menuType === 'bench-hi-main');
  assert.strictEqual(cappedBench.plannedWeight, 102.5);
  assert.ok(cappedBench.progressionCapped);
  assert.ok(cappedBench.progressionCapped.targetWeight > cappedBench.plannedWeight);

  isolatedStore.rotationProgressions = [{
    id: 'rot-accepted',
    liftKey: 'bench',
    maxKey: 'bench',
    liftName: 'ベンチプレス',
    day: 2,
    menuType: 'bench-hi-main',
    delta: 2.5,
    status: 'accepted',
    createdAt: 2,
    appliedAt: null,
  }];
  const cappedWithRotation = isolatedApi.getDayMenu(2, 2, isolatedStore.settings)
    .exercises.find(ex => ex.key === 'bench' && ex.menuType === 'bench-hi-main');
  assert.strictEqual(cappedWithRotation.plannedWeight, 102.5);
  assert.ok(cappedWithRotation.rotationProgressionApplied);

  isolatedStore.settings.maxes.bench = 115;
  isolatedStore.logs = [];
  const entry = isolatedApi.upsertEstimatedMaxFromLog(big3Log({ sets: [{ weight: 105, reps: 5, done: true }], doneSets: 1, plannedSets: 1 }));
  assert.ok(isolatedApi.adoptEstimatedMax(entry.id));
  assert.ok(isolatedStore.rotationProgressions.every(p => p.status !== 'accepted' && p.status !== 'suggested'));
}

function testDeloadAccessoryAndMaxTestTiming() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  const day1R4 = isolatedApi.getDayMenu(1, 4, isolatedStore.settings);
  const legPress = day1R4.exercises.find(ex => ex.isAccessory && ex.key === 'legpress');
  assert.strictEqual(legPress.isDeloadAccessory, true);
  assert.strictEqual(legPress.normalPlannedSets, 3);
  assert.strictEqual(legPress.plannedSets, 2);
  assert.strictEqual(legPress.targetRpe, '6〜7');
  assert.strictEqual(isolatedApi.suggestAccessoryProgression(legPress), 'デロード中: 重量UPなし');

  assert.strictEqual(isolatedApi.getDeloadMaxTestLiftForDay(1).key, 'squat');
  assert.strictEqual(isolatedApi.getDeloadMaxTestLiftForDay(2).key, 'bench');
  assert.strictEqual(isolatedApi.getDeloadMaxTestLiftForDay(3).key, 'halfDead');
  assert.strictEqual(isolatedApi.getDeloadMaxTestLiftForDay(7).key, 'floorDead');
  assert.strictEqual(isolatedApi.getDeloadMaxTestLiftForDay(5), null);
  assert.ok(day1R4.exercises.some(ex => ex.key === 'squat' && ex.isRequiredR4MaxTest && ex.menuType.startsWith('max-test-')));
  assert.ok(isolatedApi.getDayMenu(2, 4, isolatedStore.settings).exercises.some(ex => ex.key === 'bench' && ex.isRequiredR4MaxTest));
  assert.ok(isolatedApi.getDayMenu(3, 4, isolatedStore.settings).exercises.some(ex => ex.key === 'halfDead' && ex.isRequiredR4MaxTest));
  assert.ok(isolatedApi.getDayMenu(7, 4, isolatedStore.settings).exercises.some(ex => ex.key === 'floorDead' && ex.isRequiredR4MaxTest));

  ['normalDeload', 'lightDeload', 'maintain', 'normalish'].forEach(mode => {
    isolatedStore.settings.r4AdjustmentModes = { 'b1-r4': mode };
    assert.ok(isolatedApi.getDayMenu(1, 4, isolatedStore.settings).exercises.some(ex => ex.key === 'squat' && ex.isRequiredR4MaxTest), `${mode} should keep squat max-test`);
    assert.ok(isolatedApi.getDayMenu(2, 4, isolatedStore.settings).exercises.some(ex => ex.key === 'bench' && ex.isRequiredR4MaxTest), `${mode} should keep bench max-test`);
    assert.ok(isolatedApi.getDayMenu(3, 4, isolatedStore.settings).exercises.some(ex => ex.key === 'halfDead' && ex.isRequiredR4MaxTest), `${mode} should keep half-dead max-test`);
    assert.ok(isolatedApi.getDayMenu(7, 4, isolatedStore.settings).exercises.some(ex => ex.key === 'floorDead' && ex.isRequiredR4MaxTest), `${mode} should keep floor-dead max-test`);
  });

  isolatedStore.settings.r4AdjustmentModes = { 'b1-r4': 'maintain' };
  isolatedStore.logs = [big3Log({ exerciseKey: 'squat', menuType: 'max-test-e1rm', plannedWeight: 120, sets: [{ weight: 120, reps: 1, done: true }], ts: 1 })];
  const maintainedR4 = isolatedApi.getDayMenu(1, 4, isolatedStore.settings);
  const squatMaxTest = maintainedR4.exercises.find(ex => ex.key === 'squat' && ex.isRequiredR4MaxTest);
  assert.ok(squatMaxTest, 'R4 mode changes should keep required max-test slot');
  assert.ok(!squatMaxTest.progressionCapped, 'MAX測定枠 should not be capped as normal progression');
  assert.strictEqual(isolatedApi.evaluateRotationProgression(big3Log({ menuType: 'max-test-e1rm', rpe: '8', doneSets: 1, plannedSets: 1 })), null);

  isolatedStore.settings.maxes.bench = 115;
  isolatedStore.estimatedMaxHistory = [{ liftKey: 'bench', estimatedMax: 130, maxUseKind: 'candidate', useForMaxUpdate: true, ts: 10 }];
  const benchMaxTest = isolatedApi.getDayMenu(2, 4, isolatedStore.settings).exercises.find(ex => ex.key === 'bench' && ex.isRequiredR4MaxTest);
  assert.ok(benchMaxTest.plannedWeight >= 110, 'R4 max-test should challenge current/recent estimated max');
  assert.strictEqual(benchMaxTest.plannedReps, 1);
  assert.strictEqual(benchMaxTest.maxTestMode, 'trueOneRm');
  assert.strictEqual(benchMaxTest.menuType, 'max-test-trueOneRm');
  assert.ok(benchMaxTest.pctNote.includes('基準130kg'));
  const benchBackoff = isolatedApi.getDayMenu(2, 4, isolatedStore.settings).exercises.find(ex => ex.key === 'bench' && ex.isDeloadMaxTestBackoff);
  assert.ok(benchBackoff, 'R4 max-test should include editable backoff');
  benchBackoff.sets = Array.from({ length: benchBackoff.plannedSets }, () => ({ weight: benchBackoff.plannedWeight, reps: benchBackoff.plannedReps, done: false }));
  assert.strictEqual(isolatedApi.applyMainSetEdit(benchBackoff, { plannedWeight: 92.5, plannedReps: 4, plannedSets: 2 }).ok, true);
  assert.strictEqual(benchBackoff.plannedWeight, 92.5);
  assert.strictEqual(benchBackoff.plannedReps, 4);
  assert.strictEqual(benchBackoff.plannedSets, 2);

  isolatedStore.currentState = { block: 1, rotation: 4, day: 1 };
  let html = isolatedApi.renderToday();
  assert.ok(html.includes('MAX測定'));
  assert.ok(html.includes('data-mode="trueOneRm"'), 'MAX測定する/しないの2択（する）');
  assert.ok(html.includes('data-mode="normal"'), 'MAX測定する/しないの2択（しない）');
  assert.ok(!html.includes('e1RM確認'));
  assert.ok(!html.includes('3RM'));
  assert.ok(!html.includes('5RM'));
  assert.ok(!html.includes('方法'));
  assert.ok(html.includes('Lv1'));
  assert.ok(html.includes('今回の強さ'), 'R4のLvセグメントカード');
  assert.ok(!html.includes('MAX測定以外の軽さを選びます'));
  assert.ok(!html.includes('測定結果を入力'));
  assert.ok(html.includes('chip-max'), 'MAX測定種目は金チップ');
  assert.ok(html.includes('バックオフ'));
  assert.strictEqual(isolatedApi.r4IntensityLevelLabel('normalDeload'), 'Lv1');
  assert.strictEqual(isolatedApi.r4IntensityLevelLabel('normalish'), 'Lv4');

  const session = Object.values(isolatedStore.daySessions).at(-1);
  assert.ok(isolatedApi.applyDeloadMaxTestModeToSession(session, 'trueOneRm'));
  assert.ok(session.exercises.some(ex => ex.menuType === 'max-test-trueOneRm' && ex.key === 'squat' && ex.plannedReps === 1));
  assert.ok(session.exercises.some(ex => ex.menuType === 'max-test-trueOneRm-backoff' && ex.key === 'squat'));
  assert.ok(!session.exercises.some(ex => ex.key === 'squat' && ex.menuType === 'squat-heavy-backoff'));
  assert.ok(isolatedApi.applyDeloadMaxTestModeToSession(session, 'normal'));
  assert.ok(!session.exercises.some(ex => ex.key === 'squat' && ex.isDeloadMaxTest));
  assert.ok(session.exercises.some(ex => ex.key === 'squat' && ex.isR4NonTest));
  assert.ok(isolatedApi.selectR4AdjustmentMode('normalish'));
  assert.strictEqual(session.maxTestSkipped, true);
  assert.ok(!session.exercises.some(ex => ex.key === 'squat' && ex.isDeloadMaxTest), 'Lv change should keep max-test skipped');
  assert.ok(session.exercises.some(ex => ex.key === 'squat' && ex.isR4NonTest));

  assert.ok(isolatedApi.applyDeloadMaxTestModeToSession(session, 'trueOneRm'));
  assert.ok(isolatedApi.selectR4AdjustmentMode('lightDeload'));
  assert.strictEqual(session.maxTestSkipped, false);
  assert.ok(session.exercises.some(ex => ex.key === 'squat' && ex.isDeloadMaxTest && ex.maxTestMode === 'trueOneRm'), 'Lv change should keep 1RM max-test');

  isolatedStore.currentState = { block: 1, rotation: 4, day: 5 };
  html = isolatedApi.renderToday();
  assert.ok(!html.includes('デロード時MAX測定'));
}

function testFutureMainSetOverride() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();
  isolatedStore.logs = [big3Log({ plannedWeight: 100, plannedReps: 5, plannedSets: 3, ts: 1 })];
  const originalLog = JSON.stringify(isolatedStore.logs[0]);
  const todayBench = isolatedApi.getDayMenu(2, 1, isolatedStore.settings)
    .exercises.find(ex => ex.key === 'bench' && ex.menuType === 'bench-hi-main');
  todayBench.sets = Array.from({ length: todayBench.plannedSets }, () => ({
    weight: todayBench.plannedWeight,
    reps: todayBench.plannedReps,
    done: false,
  }));

  const result = isolatedApi.applyMainSetEdit(todayBench, { plannedWeight: 97.5, plannedReps: 4, plannedSets: 2 });
  assert.strictEqual(result.ok, true);
  assert.ok(isolatedApi.saveMainSetOverride(2, todayBench));

  const futureBench = isolatedApi.getDayMenu(2, 2, isolatedStore.settings)
    .exercises.find(ex => ex.key === 'bench' && ex.menuType === 'bench-hi-main');
  assert.strictEqual(futureBench.plannedWeight, 97.5);
  assert.strictEqual(futureBench.plannedReps, 4);
  assert.strictEqual(futureBench.plannedSets, 2);

  const otherDayBench = isolatedApi.getDayMenu(6, 2, isolatedStore.settings)
    .exercises.find(ex => ex.key === 'bench' && ex.menuType === 'bench-volume2');
  assert.notStrictEqual(otherDayBench.plannedSets, 2, 'future edit should not leak to other Day/menuType');
  assert.strictEqual(JSON.stringify(isolatedStore.logs[0]), originalLog, 'future edit should not rewrite past logs');
}

function testAdaptiveR4ProposalAndSelection() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();
  isolatedStore.currentState = { block: 1, rotation: 4, day: 1 };
  isolatedStore.logs = [
    big3Log({ date: '2026-05-01', day: 1, rotation: 3, block: 1, ts: 1 }),
    big3Log({ date: '2026-05-05', day: 2, rotation: 3, block: 1, ts: 2 }),
  ];
  const proposal = isolatedApi.getR4AdjustmentProposal('2026-05-06');
  assert.strictEqual(proposal.cumulativeUnexpectedRestDays, 3);
  assert.strictEqual(proposal.recommendedMode, 'lightDeload');
  assert.ok(proposal.modes.some(mode => mode.key === 'maintain'));
  assert.ok(isolatedApi.selectR4AdjustmentMode('maintain'));
  assert.strictEqual(isolatedApi.getSelectedR4AdjustmentMode(isolatedStore.settings), 'maintain');
  const menu = isolatedApi.getDayMenu(1, 4, isolatedStore.settings);
  assert.strictEqual(menu.isAdjustmentRotation, true);
  assert.strictEqual(menu.isDeload, false);
}

function testLogDailyAndMonthlyViews() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();
  isolatedStore.logs = [
    big3Log({ date: '2026-05-14', exerciseName: 'ベンチプレス', ts: 1 }),
    big3Log({ date: '2026-05-15', exerciseName: 'スクワット', exerciseKey: 'squat', menuType: 'squat-hi-main', ts: 2 }),
  ];
  const logHtml = isolatedApi.renderLog();
  assert.ok(logHtml.includes('日別'));
  assert.ok(logHtml.includes('月別'));
  assert.ok(logHtml.includes('推定MAX'), 'MAXと推定MAXはタブを分離');
  assert.ok(logHtml.includes('log-card'));
  const monthHtml = isolatedApi.renderMonthlyLogView();
  assert.ok(monthHtml.includes('2026年5月'), 'calendar should open on the latest logged month');
  assert.ok(monthHtml.includes('トレ日'));
  assert.ok(monthHtml.includes('cal-tr'), 'training days should be marked on the calendar');
  assert.ok(monthHtml.includes('MAX測定'));
}

function testFloorDeadDayUsesBulgarianInsteadOfSquat() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();
  const menu = isolatedApi.getDayMenu(7, 1, isolatedStore.settings);
  assert.ok(menu.exercises.some(ex => ex.key === 'floorDead'), 'floor dead should remain on the floor-dead day');
  assert.ok(!menu.exercises.some(ex => ex.key === 'squat'), 'squat should not be scheduled on the floor-dead day');
  const bulgarian = menu.exercises.find(ex => ex.key === 'bulgarian_split_squat');
  assert.ok(bulgarian, 'Bulgarian split squat should be available as accessory');
  assert.strictEqual(bulgarian.plannedSets, 2);
  assert.strictEqual(bulgarian.targetRpe, '7〜8');
}

function testExerciseRestSettings() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();
  isolatedStore.currentState = { block: 1, rotation: 1, day: 2 };
  isolatedStore.settings.exerciseRestSettings = [{
    id: 'rest-chest-shoulder',
    name: '肩痛のため胸トレ休止',
    parts: ['胸', '肩'],
    exercises: ['ベンチプレス', 'インクラインDBプレス', 'チェストプレス', 'ショルダープレス'],
    startDate: '2000-01-01',
    endDate: '2099-12-31',
    note: '肩痛のため、胸・プレス系を一時的に休む',
  }];

  const menu = isolatedApi.getDayMenu(2, 1, isolatedStore.settings);
  assert.ok(!menu.exercises.some(ex => ex.key === 'bench'), 'rested bench should be removed from normal menu');
  assert.ok(menu.skippedRestExercises.some(ex => ex.key === 'bench'), 'rested bench should be tracked as skipped rest');
  assert.strictEqual(menu.isRest, false, 'rested exercises should not turn the day into a scheduled rest day');
  assert.ok(menu.exercises.some(ex => ex.key === 'chinning'), 'unrelated exercises should remain');

  const html = isolatedApi.renderToday();
  assert.ok(html.includes('休止中'), 'rested exercises should be shown with the gray 休止中 chip');
  assert.ok(html.includes('pause-row'), 'rested exercises should be listed as gray rows at the bottom');
  assert.ok(html.includes('ベンチプレス'), 'rested exercise name should be visible');
  const session = Object.values(isolatedStore.daySessions).find(s => s.day === 2 && s.rotation === 1);
  assert.ok(session);
  assert.ok(!session.exercises.some(ex => ex.key === 'bench'));
  assert.ok(session.skippedRestExercises.some(ex => ex.key === 'bench'));
  assert.strictEqual(session.exercises.some(ex => !isolatedApi.isExerciseComplete(ex)), true, 'remaining exercises keep normal completion behavior');

  isolatedApi.finishTodaySession();
  const restLog = isolatedStore.logs.find(log => log.isExerciseRest && log.exerciseKey === 'bench');
  assert.ok(restLog, 'rested exercise should be saved as rest log');
  assert.strictEqual(restLog.doneSets, 0);
  assert.strictEqual(restLog.plannedSets, 0);
  assert.strictEqual(restLog.restSettingName, '肩痛のため胸トレ休止');
  assert.strictEqual(isolatedApi.createEstimatedMaxEntry({ ...restLog, sets: [{ weight: 100, reps: 1, done: true }], rpe: '10' }).maxUseLabel, '除外');
  assert.strictEqual(isolatedApi.evaluateRotationProgression({ ...restLog, sets: [{ weight: 100, reps: 1, done: true }], rpe: '8' }), null);
  assert.strictEqual(isolatedStore.rotationProgressions.some(p => p.liftKey === 'bench'), false);
  assert.strictEqual(isolatedStore.estimatedMaxHistory.some(e => e.liftKey === 'bench'), false);

  isolatedStore.logs = [restLog];
  assert.strictEqual(isolatedApi.getUnexpectedRestStats('2026-06-05').cumulativeUnexpectedRestDays, 0, 'rest logs should not be counted as normal training for unexpected rest stats');

  isolatedStore.settings.exerciseRestSettings[0].endDate = '2000-01-01';
  const afterRest = isolatedApi.getDayMenu(2, 1, isolatedStore.settings);
  assert.ok(afterRest.exercises.some(ex => ex.key === 'bench'), 'exercise should return after rest period');
  assert.ok(!afterRest.exercises.find(ex => ex.key === 'bench').progressionCapped || afterRest.exercises.find(ex => ex.key === 'bench').plannedWeight > 0, 'return should not add special auto-adjustment');
}

function testRotationFlowAndMaxRecordsFromSession() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  let state = { block: 1, rotation: 1, day: 1 };
  for (let i = 0; i < 31; i++) state = isolatedApi.nextDay(state);
  assert.strictEqual(state.block, 1);
  assert.strictEqual(state.rotation, 4);
  assert.strictEqual(state.day, 8);
  const nextBlockState = isolatedApi.nextDay(state);
  assert.strictEqual(nextBlockState.block, 2);
  assert.strictEqual(nextBlockState.rotation, 1);
  assert.strictEqual(nextBlockState.day, 1);

  isolatedStore.currentState = { block: 1, rotation: 4, day: 2 };
  isolatedStore.settings.maxes.bench = 120;
  isolatedApi.renderToday();
  const todaySession = Object.values(isolatedStore.daySessions).find(item => item.block === 1 && item.rotation === 4 && item.day === 2);
  assert.ok(todaySession);
  const benchMax = todaySession.exercises.find(ex => ex.key === 'bench' && ex.menuType === 'max-test-trueOneRm');
  assert.ok(benchMax);
  benchMax.sets = [{ weight: 122.5, reps: 1, done: true }];
  benchMax.rpe = '10';
  benchMax.pains = ['なし'];
  const benchBackoff = todaySession.exercises.find(ex => ex.key === 'bench' && ex.menuType === 'max-test-trueOneRm-backoff');
  assert.ok(benchBackoff);
  benchBackoff.sets = [{ weight: benchBackoff.plannedWeight, reps: benchBackoff.plannedReps, done: true }];
  benchBackoff.rpe = '7';
  isolatedApi.finishTodaySession();
  const maxLog = isolatedStore.logs.find(log => log.exerciseKey === 'bench' && log.menuType === 'max-test-trueOneRm');
  assert.ok(maxLog);
  assert.strictEqual(maxLog.measuredMaxWeight, 122.5);
  assert.strictEqual(maxLog.isMeasuredMax, true);
  const maxResult = isolatedStore.maxTestResults.find(item => item.logId === maxLog.id);
  assert.ok(maxResult);
  assert.strictEqual(maxResult.measuredMaxWeight, 122.5);
  assert.strictEqual(maxResult.estimatedMax, 122.5);
  const emax = isolatedStore.estimatedMaxHistory.find(entry => entry.logId === maxLog.id);
  assert.ok(emax);
  assert.strictEqual(emax.estimatedMax, 122.5);
  assert.notStrictEqual(maxResult, emax);
  const backoffLog = isolatedStore.logs.find(log => log.exerciseKey === 'bench' && log.menuType === 'max-test-trueOneRm-backoff');
  assert.ok(backoffLog);
  assert.strictEqual(isolatedApi.createEstimatedMaxEntry(backoffLog), null, 'backoff should not be mixed into e1RM history');
  assert.strictEqual(isolatedStore.estimatedMaxHistory.some(entry => entry.logId === backoffLog.id), false);
  assert.strictEqual(isolatedStore.settings.maxes.bench, 120, 'MAX setting should remain user-approved');

  const failedLog = big3Log({
    id: 'failed-max-log',
    exerciseKey: 'bench',
    exerciseName: 'ベンチプレス',
    menuType: 'max-test-trueOneRm',
    isDeload: false,
    rotation: 4,
    day: 2,
    plannedSets: 1,
    doneSets: 0,
    sets: [{ weight: 130, reps: 1, done: false }],
    rpe: '10',
  });
  const failedResult = isolatedApi.upsertMaxTestResultFromLog(failedLog, isolatedApi.createEstimatedMaxEntry(failedLog));
  assert.strictEqual(failedResult.challengeFailed, true);
  assert.strictEqual(failedResult.measuredMaxWeight, null);
  assert.strictEqual(isolatedApi.createEstimatedMaxEntry(failedLog), null);

  isolatedStore.settings.exerciseRestSettings = [{
    id: 'rest-bench',
    name: '胸休止',
    parts: ['胸'],
    exercises: ['ベンチプレス'],
    startDate: '2000-01-01',
    endDate: '2099-12-31',
  }];
  const restMenu = isolatedApi.getDayMenu(2, 1, isolatedStore.settings);
  assert.ok(!restMenu.exercises.some(ex => ex.key === 'bench'));
  const nextWithRest = isolatedApi.nextDay({ block: 1, rotation: 4, day: 8 });
  assert.strictEqual(nextWithRest.block, 2);
  assert.strictEqual(nextWithRest.rotation, 1);
  assert.strictEqual(nextWithRest.day, 1);
}

function testBlockSuggestionHighRpeHalfSteps() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  // RPE 9.5（旧実装の文字列比較 '9'/'10' に一致しない）でも高RPEとして据え置きになること
  isolatedStore.logs = [big3Log({ rpe: '9.5' })];
  const highHalf = isolatedApi.computeNextBlockSuggestion().find(s => s.key === 'bench');
  assert.strictEqual(highHalf.delta, 0, 'RPE 9.5 should be treated as high RPE (no increase)');
  assert.ok(highHalf.reason.includes('RPE9以上'));

  isolatedStore.logs = [big3Log({ rpe: '8.5' })];
  const mid = isolatedApi.computeNextBlockSuggestion().find(s => s.key === 'bench');
  assert.ok(mid.delta > 0, 'RPE 8.5 should still allow increase suggestion');
}

function testLogGroupSummaryExcludesRestLogs() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;

  const summary = isolatedApi.summarizeLogGroup([
    big3Log({ doneSets: 3, plannedSets: 3 }),
    {
      ...big3Log({ exerciseKey: 'incline_db', exerciseName: 'インクラインDBプレス', menuType: 'rest-accessory' }),
      isExerciseRest: true,
      plannedSets: 0,
      doneSets: 0,
      sets: [],
    },
  ]);
  assert.strictEqual(summary.totalCount, 1, 'rest logs should not count as training logs');
  assert.strictEqual(summary.completedCount, 1);
  assert.strictEqual(summary.restCount, 1);
  assert.ok(summary.mainNames.includes('ベンチプレス'));
  assert.ok(!summary.mainNames.includes('インクラインDBプレス'), 'rest log should not lead main names');
}

function testMaxTestHistoryRendering() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  let html = isolatedApi.renderMaxTestHistory();
  assert.ok(html.includes('実測MAXの記録はまだありません'));

  isolatedApi.recordMaxTestResult({
    liftKey: 'bench',
    weight: 122.5,
    reps: 1,
    rpe: '10',
    pains: ['なし'],
    note: '',
  });
  isolatedApi.recordMaxTestResult({
    liftKey: 'squat',
    weight: 160,
    reps: 1,
    rpe: '10',
    success: false,
    pains: ['なし'],
    note: '',
  });
  assert.strictEqual(isolatedStore.maxTestResults.length, 2);

  html = isolatedApi.renderMaxTestHistory();
  assert.ok(html.includes('実測MAX'), 'successful 1RM should be labeled 実測MAX');
  assert.ok(html.includes('122.5kg 成功'));
  assert.ok(html.includes('MAX挑戦'), 'failed 1RM should be labeled MAX挑戦');
  assert.ok(html.includes('160.0kg 失敗'));

  const benchOnly = isolatedApi.renderMaxTestHistory(10, 'bench');
  assert.ok(benchOnly.includes('122.5'), 'lift filter should keep bench attempts');
  assert.ok(!benchOnly.includes('160.0'), 'lift filter should drop other lifts');
}

function testSkippedSetsBehavior() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;

  const session = {
    exercises: [{
      isBig3: true,
      key: 'bench',
      name: 'ベンチプレス',
      menuType: 'bench-hi-main',
      plannedWeight: 100,
      plannedReps: 5,
      plannedSets: 3,
      sets: [
        { weight: 100, reps: 5, done: true },
        { weight: 100, reps: 5, done: false },
        { weight: 100, reps: 5, done: false },
      ],
      rpe: '8',
      pains: [],
      note: '',
    }],
  };

  // スキップ: skipped=true として記録され、完了判定には含むがdone集計には含まない
  const skip = isolatedApi.skipNextSet(session, 0);
  assert.strictEqual(skip.ok, true);
  assert.strictEqual(skip.skippedSet, 1);
  const ex = session.exercises[0];
  assert.strictEqual(ex.sets[1].skipped, true);
  assert.strictEqual(ex.sets[1].done, false);
  assert.strictEqual(isolatedApi.firstPendingSetIndex(ex), 2, 'skipped set should not stay pending');
  assert.strictEqual(isolatedApi.isExerciseComplete(ex), false);

  isolatedApi.toggleNextSetCompletion(session, 0);
  assert.strictEqual(isolatedApi.isExerciseComplete(ex), true, 'done + skipped should complete the exercise');
  assert.strictEqual(ex.sets.filter(s => s.done).length, 2, 'doneSets aggregation must not count skips');

  // スキップは失敗扱いにしない（推定MAX除外判定に影響させない）
  const log = { exerciseKey: 'bench', menuType: 'bench-hi-main', rpe: '8', pains: [], sets: ex.sets.map(s => ({ ...s })), doneSets: 2, plannedSets: 3 };
  const entry = isolatedApi.createEstimatedMaxEntry(log);
  assert.ok(entry, 'skipped set should not be treated as an explicit failure');
  assert.notStrictEqual(entry.maxUseReason, '失敗あり');

  // 戻す: 最後の記録（スキップ含む）を未実施に戻す
  const undo = isolatedApi.undoLastSetRecord(session, 0);
  assert.strictEqual(undo.ok, true);
  assert.strictEqual(undo.revertedSet, 2);
  assert.strictEqual(ex.sets[2].done, false);
}

function testEscapeHtml() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  assert.strictEqual(
    isolatedApi.escapeHtml('<b>"x"&\'</b>'),
    '&lt;b&gt;&quot;x&quot;&amp;&#39;&lt;/b&gt;'
  );
  assert.strictEqual(isolatedApi.escapeHtml(null), '');
}

function testMixedOneRmAttemptKeepsSuccessAndFailure() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  // 同じ測定内の「成功120kg + 失敗125kg」を両方記録する
  const log = big3Log({
    id: 'mixed-max-log',
    menuType: 'max-test-trueOneRm',
    rotation: 4,
    plannedSets: 2,
    doneSets: 1,
    sets: [
      { weight: 120, reps: 1, done: true },
      { weight: 125, reps: 1, done: false },
    ],
    rpe: '10',
  });
  const attempt = isolatedApi.getTrueOneRmAttemptFromLog(log);
  assert.strictEqual(attempt.challengeSucceeded, true, 'success must not be erased by a later failed attempt');
  assert.strictEqual(attempt.measuredMaxWeight, 120);
  assert.strictEqual(attempt.failedAttemptWeight, 125);
  assert.strictEqual(attempt.challengeFailed, true);

  const test = isolatedApi.upsertMaxTestResultFromLog(log);
  assert.strictEqual(test.challengeSucceeded, true);
  assert.strictEqual(test.measuredMaxWeight, 120);
  assert.strictEqual(test.failedAttemptWeight, 125);

  const maxBefore = isolatedStore.settings.maxes.bench;
  const html = isolatedApi.renderMaxTestHistory(10, 'bench');
  assert.ok(html.includes('120.0kg 成功'), 'successful 1RM must appear as MAX');
  assert.ok(html.includes('✗ 125.0'), 'failed attempt must remain in MAX history');
  assert.strictEqual(isolatedStore.settings.maxes.bench, maxBefore, 'MAX setting stays user-approved');
}

function testBestMeasuredAndEstimatedSelection() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  // 実測MAX: 直近ではなく成功した1RMの最高値
  isolatedStore.maxTestResults = [
    { id: 't1', liftKey: 'bench', liftName: 'ベンチプレス', measuredMaxWeight: 122.5, challengeSucceeded: true, challengeFailed: false, date: '2026-05-01', ts: 1 },
    { id: 't2', liftKey: 'bench', liftName: 'ベンチプレス', measuredMaxWeight: 120, challengeSucceeded: true, challengeFailed: false, date: '2026-06-01', ts: 2 },
    { id: 't3', liftKey: 'bench', liftName: 'ベンチプレス', measuredMaxWeight: null, attemptedWeight: 127.5, challengeSucceeded: false, challengeFailed: true, date: '2026-06-10', ts: 3 },
  ];
  const bestMeasured = isolatedApi.bestMeasuredMaxForLift('bench');
  assert.strictEqual(bestMeasured.id, 't1', 'best measured 1RM should win over the latest one');
  assert.strictEqual(isolatedApi.bestMeasuredMaxForLift('squat'), null);

  // 推定MAX: 条件に合う記録（採用候補/採用済み）の中の最大値を表示する
  isolatedStore.estimatedMaxHistory = [
    { id: 'e1', liftKey: 'bench', estimatedMax: 118, maxUseKind: 'candidate', useForMaxUpdate: true, adopted: false, date: '2026-05-02', sourceWeight: 100, sourceReps: 5, rpe: '8', ts: 1 },
    { id: 'e2', liftKey: 'bench', estimatedMax: 121, maxUseKind: 'candidate', useForMaxUpdate: true, adopted: false, date: '2026-05-10', sourceWeight: 105, sourceReps: 4, rpe: '8.5', ts: 2 },
    { id: 'e3', liftKey: 'bench', estimatedMax: 130, maxUseKind: 'reference', useForMaxUpdate: false, adopted: false, date: '2026-06-01', sourceWeight: 90, sourceReps: 8, rpe: '9', ts: 3 },
    { id: 'e4', liftKey: 'bench', estimatedMax: 140, maxUseKind: 'excluded', useForMaxUpdate: false, adopted: false, date: '2026-06-05', sourceWeight: 80, sourceReps: 12, rpe: '10', ts: 4 },
  ];
  const bestEmax = isolatedApi.bestEstimatedMaxEntryForLift('bench');
  assert.strictEqual(bestEmax.id, 'e2', 'main display should be the max among qualified entries, not the latest');

  // 候補が無い場合は参考の最大値へフォールバック
  isolatedStore.estimatedMaxHistory = isolatedStore.estimatedMaxHistory.filter(e => e.maxUseKind !== 'candidate');
  assert.strictEqual(isolatedApi.bestEstimatedMaxEntryForLift('bench').id, 'e3');
}

function testMoveExerciseToActive() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;

  const makeEx = (key, done) => ({
    key,
    name: key,
    menuType: `${key}-hi-main`,
    plannedSets: 1,
    sets: [{ weight: 100, reps: 5, done }],
    rpe: '未入力',
    pains: [],
    note: '',
  });
  const session = { exercises: [makeEx('a', true), makeEx('b', false), makeEx('c', false), makeEx('d', false)] };

  // 「d」を次に実施 → 最初の未完了位置(インデックス1)へ移動。ローテは触らない
  const moved = isolatedApi.moveExerciseToActive(session, 3);
  assert.strictEqual(moved.ok, true);
  assert.strictEqual(moved.moved, true);
  assert.deepStrictEqual(session.exercises.map(ex => ex.key), ['a', 'd', 'b', 'c']);

  // 完了済みは選べない / すでに先頭ならそのまま
  assert.strictEqual(isolatedApi.moveExerciseToActive(session, 0).ok, false);
  assert.strictEqual(isolatedApi.moveExerciseToActive(session, 1).moved, false);
}

function testMaxTabRestoresFromExistingLogs() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  // maxTestResults が空でも、ログに残っているMAX測定から実測MAXを復元する
  isolatedStore.maxTestResults = [];
  isolatedStore.logs = [
    big3Log({
      id: 'old-max-log',
      menuType: 'max-test-trueOneRm',
      rotation: 4,
      plannedSets: 1,
      doneSets: 1,
      sets: [{ weight: 120, reps: 1, done: true }],
      rpe: '10',
      ts: 5,
    }),
    // 表記ゆれキー（floor_dead）のMAX測定も拾う
    big3Log({
      id: 'alias-max-log',
      exerciseKey: 'floor_dead',
      exerciseName: '床引きデッド',
      menuType: 'max-test-trueOneRm',
      rotation: 4,
      plannedSets: 1,
      doneSets: 0,
      sets: [{ weight: 180, reps: 1, done: false }],
      rpe: '10',
      ts: 6,
    }),
  ];

  const benchRecords = isolatedApi.collectMaxTestRecords('bench');
  assert.strictEqual(benchRecords.length, 1, 'max test log should surface in MAX tab data');
  assert.strictEqual(benchRecords[0].challengeSucceeded, true);
  assert.strictEqual(benchRecords[0].measuredMaxWeight, 120);

  const best = isolatedApi.bestMeasuredMaxForLift('bench');
  assert.ok(best, 'MAX tab must not show 記録なし when a successful 1RM exists in logs');
  assert.strictEqual(best.measuredMaxWeight, 120);

  const aliasRecords = isolatedApi.collectMaxTestRecords('floorDead');
  assert.strictEqual(aliasRecords.length, 1, 'alias exercise keys should be normalized');
  assert.strictEqual(aliasRecords[0].challengeFailed, true);

  const html = isolatedApi.renderMaxTestHistory(10, 'bench');
  assert.ok(html.includes('120.0kg 成功'));

  // maxTestResults に同じlogIdがある場合は重複させない
  isolatedApi.upsertMaxTestResultFromLog(isolatedStore.logs[0]);
  assert.strictEqual(isolatedApi.collectMaxTestRecords('bench').length, 1, 'stored result and log must not duplicate');
}

function testFutureAccessoryEditWinsNextGeneration() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  // accessoryDefaults に既定重量があっても、スロットへの「今後にも反映」が次回生成で勝つ
  isolatedStore.settings.accessoryDefaults.incline_db = { weight: 38, reps: '8〜10', sets: 4 };
  const slot = isolatedStore.settings.accessorySlots['2'].find(s => s.key === 'incline_db');
  assert.ok(slot, 'day2 incline slot should exist');

  const updatedOk = isolatedApi.updateAccessorySlot(2, slot.slotId, { ...slot, plannedWeight: 42, reps: '6〜8' });
  assert.strictEqual(updatedOk, true);

  const nextGen = isolatedApi.buildAccessoryExercises(2, isolatedStore.settings, false)
    .find(ex => ex.key === 'incline_db');
  assert.strictEqual(nextGen.plannedWeight, 42, 'edited slot weight must win over accessoryDefaults');
  assert.strictEqual(nextGen.plannedReps, '6〜8', 'edited slot reps must win over accessoryDefaults');

  // スロット重量が未設定なら従来どおり accessoryDefaults を使う
  isolatedApi.updateAccessorySlot(2, slot.slotId, { ...slot, plannedWeight: null, reps: slot.reps });
  const fallback = isolatedApi.buildAccessoryExercises(2, isolatedStore.settings, false)
    .find(ex => ex.key === 'incline_db');
  assert.strictEqual(fallback.plannedWeight, 38, 'defaults stay as fallback when slot has no weight');

  // 未登録slotId（今日だけ追加など）は false を返し、呼び出し側が新規追加できる
  assert.strictEqual(isolatedApi.updateAccessorySlot(2, 'today_2_xxx', { name: 'X' }), false);
  const before = isolatedStore.settings.accessorySlots['2'].length;
  const saved = isolatedApi.addAccessorySlot(2, 'カスタム枠', { slotId: 'today_2_xxx', name: 'ケーブルフライ', plannedSets: 3, reps: '12〜15' });
  assert.ok(saved.slotId && !saved.slotId.startsWith('today_'), 'persisted slot must get a stable id');
  assert.strictEqual(isolatedStore.settings.accessorySlots['2'].length, before + 1);
  assert.ok(!isolatedStore.settings.accessorySlots['2'].some(s => String(s.slotId).startsWith('today_')), 'today-only ids must not leak into settings');
}

function testBodyweightExerciseUsesKgInput() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  isolatedStore.currentState = { block: 1, rotation: 1, day: 2 };
  isolatedApi.renderToday();
  const session = Object.values(isolatedStore.daySessions).find(s => s.day === 2);
  const chinIdx = session.exercises.findIndex(ex => ex.key === 'chinning');
  assert.ok(chinIdx >= 0, 'chinning should be on day2');
  assert.strictEqual(session.exercises[chinIdx].weightType, 'bodyweight');

  // チンニングをアクティブにしてもkg欄が「自重」固定にならない
  isolatedApi.moveExerciseToActive(session, chinIdx);
  let html = isolatedApi.renderToday();
  assert.ok(!html.includes('>自重<'), 'bodyweight exercises must not show fixed 自重 label');
  assert.ok(html.includes('data-vbox="kg"'), 'weight box must stay tappable');
  assert.ok(html.includes('5〜8'), 'planned reps range should show as the reps default');

  // 加重5kg（またはアシスト−相当）をkgとして表示できる
  const chin = session.exercises.find(ex => ex.key === 'chinning');
  const pending = chin.sets[isolatedApi.firstPendingSetIndex(chin)];
  pending.weight = 5;
  html = isolatedApi.renderToday();
  assert.ok(html.includes('5.0<span class="u">kg</span>'), 'entered weight must render as kg');
}

function testInclineDbCurlPresetAndRestScope() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;

  // 通常の種目候補に存在し、部位カテゴリが正規化されている
  const preset = isolatedApi.getAccessoryPreset('incline_db_curl');
  assert.ok(preset, 'インクラインダンベルカール should be a normal preset');
  assert.strictEqual(preset.name, 'インクラインダンベルカール');
  const slot = isolatedApi.applyAccessoryPresetToSlot({}, 'incline_db_curl');
  assert.strictEqual(JSON.stringify(slot.categories), JSON.stringify(['腕']));
  assert.strictEqual(slot.weightType, 'dumbbell');

  // 胸・肩の休止に腕種目が巻き込まれない
  const rest = { parts: ['胸', '肩'], exercises: ['ベンチプレス', 'ショルダープレス'] };
  const curlEx = { key: 'incline_db_curl', name: 'インクラインダンベルカール', categories: ['腕'], fatigueTags: ['肘負荷'] };
  assert.strictEqual(isolatedApi.exerciseMatchesRestSetting(curlEx, rest), false,
    'arm exercise must not be paused by chest/shoulder rest');

  // カテゴリ未分類のカスタム種目も、明示指定なしでは休止されない
  const customEx = { key: 'custom_x', name: 'インクラインダンベルカール', categories: [], fatigueTags: ['低リスク'] };
  assert.strictEqual(isolatedApi.exerciseMatchesRestSetting(customEx, rest), false,
    'uncategorized custom exercise must not be paused implicitly');

  // 明示的に種目指定した場合だけ休止対象（DB/ダンベルの表記ゆれも吸収）
  assert.strictEqual(isolatedApi.exerciseMatchesRestSetting(customEx, { parts: [], exercises: ['インクラインダンベルカール'] }), true);
  assert.strictEqual(isolatedApi.exerciseMatchesRestSetting(customEx, { parts: [], exercises: ['インクラインDBカール'] }), true,
    'DB/ダンベル variants should match the same exercise');
}

function testEstimatedMaxFormulaRegression() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;

  // Epley + RIR補正: e1RM = w × (1 + (reps + RIR) / 30), RIR = 10 − RPE
  assert.strictEqual(isolatedApi.estimateMaxFromSet(170, 7, '9.5').value, 212.5);
  assert.strictEqual(isolatedApi.estimateMaxFromSet(170, 5, '9.5').value, 201, '実機の「推定201.0」は 170×5@9.5 に一致（回数記録ずれが原因で式は正しい）');
  assert.strictEqual(isolatedApi.estimateMaxFromSet(170, 7, '10').value, 209.5);
  assert.strictEqual(isolatedApi.estimateMaxFromSet(100, 5, '8').value, 123.5);
  // 1RMは実重量そのまま（インフレさせない）
  assert.strictEqual(isolatedApi.estimateMaxFromSet(120, 1, '10').value, 120);
  assert.strictEqual(isolatedApi.estimateMaxFromSet(120, 1, '10').confidence, '高');
  // 低RPE・高回数は信頼度を下げ、10回以上は採用候補にしない
  assert.strictEqual(isolatedApi.estimateMaxFromSet(100, 12, '8').confidence, '低');
  const highRep = isolatedApi.createEstimatedMaxEntry(big3Log({
    menuType: 'bench-hi-main', rpe: '8',
    sets: [{ weight: 100, reps: 12, done: true }], doneSets: 1, plannedSets: 1,
  }));
  assert.strictEqual(highRep.maxUseLabel, '除外');
  assert.strictEqual(highRep.maxUseReason, '高レップ');
}

function testEstimatedMaxPicksBestActualSet() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;

  // 実機ケース: ハーフデッド 170×5 / 170×5 / 170×7 @RPE9.5
  // → 採用セットは最大出力の7回セット（212.5）になるべき
  const log = big3Log({
    exerciseKey: 'halfDead',
    exerciseName: 'ハーフデッド',
    menuType: 'halfDead-hi-main',
    plannedWeight: 170,
    plannedReps: 5,
    plannedSets: 3,
    doneSets: 3,
    rpe: '9.5',
    sets: [
      { weight: 170, reps: 5, done: true },
      { weight: 170, reps: 5, done: true },
      { weight: 170, reps: 7, done: true },
    ],
  });
  const entry = isolatedApi.createEstimatedMaxEntry(log);
  assert.strictEqual(entry.sourceReps, 7, 'the actually-performed best set must be selected');
  assert.strictEqual(entry.sourceWeight, 170);
  assert.strictEqual(entry.estimatedMax, 212.5, '170×7@9.5 should beat 170×5@9.5 (201.0)');
  assert.strictEqual(entry.maxUseLabel, '採用候補');

  // 7回@9.5 は採用候補、7回@7.5 は従来どおり参考(6〜8回)
  const c7 = isolatedApi.classifyEstimatedMaxUse(log, 7, { value: 212.5 });
  assert.strictEqual(c7.kind, 'candidate');
  const lowRpe = isolatedApi.classifyEstimatedMaxUse({ ...log, rpe: '7.5' }, 7, { value: 200 });
  assert.strictEqual(lowRpe.kind, 'reference');
  assert.strictEqual(lowRpe.reason, '6〜8回');

  // 2〜5回@10（限界トリプル等）も採用候補に入る
  const triple10 = isolatedApi.classifyEstimatedMaxUse({ ...log, rpe: '10' }, 3, { value: 220 });
  assert.strictEqual(triple10.kind, 'candidate');
}

function testEstimatedMaxMainDisplayReevaluatesLogs() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  const staleEntry = {
    id: 'emax-old',
    logId: 'old-log-id',
    liftKey: 'halfDead',
    maxKey: 'halfDead',
    liftName: 'ハーフデッド',
    date: '2026-06-13',
    block: 1,
    rotation: 2,
    day: 3,
    menuType: 'halfDead-hi-main',
    estimatedMax: 201,
    currentMax: 190,
    sourceWeight: 170,
    sourceReps: 5,
    rpe: '9.5',
    maxUseKind: 'candidate',
    maxUseLabel: '採用候補',
    useForMaxUpdate: true,
    adopted: true,
    ts: 100,
  };
  const updatedLog = big3Log({
    id: 'new-log-id',
    date: '2026-06-13',
    block: 1,
    rotation: 2,
    day: 3,
    exerciseKey: 'halfDead',
    exerciseName: 'ハーフデッド',
    menuType: 'halfDead-hi-main',
    plannedWeight: 170,
    plannedReps: 5,
    plannedSets: 3,
    doneSets: 3,
    rpe: '9.5',
    sets: [
      { weight: 170, reps: 5, done: true },
      { weight: 170, reps: 5, done: true },
      { weight: 170, reps: 7, done: true },
    ],
    ts: 200,
  });

  isolatedStore.estimatedMaxHistory = [staleEntry];
  isolatedStore.logs = [updatedLog];

  const entries = isolatedApi.collectEstimatedMaxEntries('halfDead');
  assert.strictEqual(entries.length, 1, 'stale history and matching latest log should render as one entry');
  assert.strictEqual(entries[0].sourceReps, 7, 'display entry must re-evaluate the latest saved log');
  assert.strictEqual(entries[0].estimatedMax, 212.5);
  assert.strictEqual(entries[0].adopted, false, 'old adopted state must not be applied to a changed estimate');
  assert.strictEqual(entries[0].maxUseLabel, '採用候補');

  const best = isolatedApi.bestEstimatedMaxEntryForLift('halfDead');
  assert.strictEqual(best.estimatedMax, 212.5, 'main e1RM display should not stay pinned to old 201.0');
  assert.strictEqual(best.sourceReps, 7);
}

function testEstimatedMaxUpsertUpdatesSameSlotWhenLogIdChanges() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  isolatedStore.estimatedMaxHistory = [{
    id: 'emax-old',
    logId: 'old-log-id',
    liftKey: 'halfDead',
    maxKey: 'halfDead',
    liftName: 'ハーフデッド',
    date: '2026-06-13',
    block: 1,
    rotation: 2,
    day: 3,
    menuType: 'halfDead-hi-main',
    estimatedMax: 201,
    currentMax: 190,
    sourceWeight: 170,
    sourceReps: 5,
    rpe: '9.5',
    maxUseKind: 'candidate',
    maxUseLabel: '採用候補',
    useForMaxUpdate: true,
    adopted: true,
    ts: 100,
  }];
  const log = big3Log({
    id: 'new-log-id',
    date: '2026-06-13',
    block: 1,
    rotation: 2,
    day: 3,
    exerciseKey: 'halfDead',
    exerciseName: 'ハーフデッド',
    menuType: 'halfDead-hi-main',
    rpe: '9.5',
    sets: [
      { weight: 170, reps: 5, done: true },
      { weight: 170, reps: 5, done: true },
      { weight: 170, reps: 7, done: true },
    ],
    doneSets: 3,
  });

  const entry = isolatedApi.upsertEstimatedMaxFromLog(log);
  assert.strictEqual(entry.id, 'emax-old', 'same day/day-slot should update the old e1RM history row');
  assert.strictEqual(entry.logId, 'new-log-id');
  assert.strictEqual(entry.adopted, false, 'manual adoption state must reset when the source set changes');
  assert.strictEqual(entry.estimatedMax, 212.5);
  assert.strictEqual(isolatedStore.estimatedMaxHistory.length, 1, 're-saving must not duplicate stale e1RM rows');
}

function testCompletedSetEditSyncsLogAndEstimatedMax() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  const session = {
    date: '2026-06-13',
    day: 3,
    block: 1,
    rotation: 2,
    isDeload: false,
    completed: true,
    exercises: [],
  };
  const ex = {
    key: 'halfDead',
    name: 'ハーフデッド',
    menuType: 'halfDead-hi-main',
    plannedWeight: 170,
    plannedReps: 5,
    plannedSets: 3,
    sets: [
      { weight: 170, reps: 5, done: true },
      { weight: 170, reps: 5, done: true },
      { weight: 170, reps: 5, done: true },
    ],
    rpe: '9.5',
    pains: [],
    note: '',
  };
  session.exercises.push(ex);
  isolatedStore.logs = [big3Log({
    id: 'saved-log',
    date: session.date,
    day: session.day,
    block: session.block,
    rotation: session.rotation,
    exerciseKey: 'halfDead',
    exerciseName: 'ハーフデッド',
    menuType: 'halfDead-hi-main',
    rpe: '9.5',
    sets: ex.sets,
    doneSets: 3,
  })];
  isolatedStore.estimatedMaxHistory = [];
  isolatedApi.upsertEstimatedMaxFromLog(isolatedStore.logs[0]);
  assert.strictEqual(isolatedStore.estimatedMaxHistory[0].estimatedMax, 201);

  ex.sets = [
    { weight: 170, reps: 5, done: true },
    { weight: 170, reps: 5, done: true },
    { weight: 170, reps: 7, done: true },
  ];
  const saved = isolatedApi.upsertExerciseLogFromSession(session, ex, true);
  assert.strictEqual(saved.id, 'saved-log', 'completed-session edits should preserve the existing log id');
  assert.strictEqual(saved.sets[2].reps, 7);
  assert.strictEqual(isolatedStore.estimatedMaxHistory.length, 1);
  assert.strictEqual(isolatedStore.estimatedMaxHistory[0].estimatedMax, 212.5);
  assert.strictEqual(isolatedApi.bestEstimatedMaxEntryForLift('halfDead').sourceReps, 7);
}

function testCompletionCommitsCleanRecordValues() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;

  const session = {
    exercises: [{
      isAccessory: true,
      key: 'chinning',
      name: 'チンニング',
      menuType: 'accessory-x',
      plannedWeight: 5,
      plannedReps: '5〜8',
      plannedSets: 3,
      sets: [
        { weight: null, reps: '', done: false },
        { weight: null, reps: '5〜8', done: false },
        { weight: 7.5, reps: 8, done: false },
      ],
      rpe: '未入力',
      pains: [],
      note: '',
    }],
  };

  // 空欄のまま完了 → 予定重量とレンジ下限が実績として確定（レンジ文字列を残さない）
  isolatedApi.toggleNextSetCompletion(session, 0);
  assert.strictEqual(session.exercises[0].sets[0].weight, 5);
  assert.strictEqual(session.exercises[0].sets[0].reps, 5, 'range reps must commit as the lower bound number');

  // レンジ文字列が入っていた旧データも数値へ正規化される
  isolatedApi.toggleNextSetCompletion(session, 0);
  assert.strictEqual(session.exercises[0].sets[1].reps, 5);

  // 入力済みの値は上書きしない
  isolatedApi.toggleNextSetCompletion(session, 0);
  assert.strictEqual(session.exercises[0].sets[2].weight, 7.5);
  assert.strictEqual(session.exercises[0].sets[2].reps, 8);

  assert.strictEqual(isolatedApi.parseRangeMin('8〜12', null), 8);
  assert.strictEqual(isolatedApi.parseRangeMin('', null), null);
}

function testRecalcKeepsSkipsAndTodayOnlyExercises() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  isolatedStore.currentState = { block: 1, rotation: 1, day: 2 };
  isolatedApi.renderToday();
  const session = Object.values(isolatedStore.daySessions).find(s => s.day === 2);

  // 1セット目完了・2セット目スキップ
  isolatedApi.toggleNextSetCompletion(session, 0);
  isolatedApi.skipNextSet(session, 0);
  // 今日だけ追加の種目を模擬
  session.exercises.push({
    isAccessory: true,
    key: 'custom_today_x',
    name: '今日だけ種目',
    menuType: 'accessory-today_x',
    plannedWeight: 20,
    plannedReps: '10',
    plannedSets: 2,
    sets: [{ weight: 20, reps: 10, done: true }, { weight: 20, reps: '', done: false }],
    rpe: '未入力',
    pains: [],
    note: '',
    todayOnlyAdded: true,
  });

  isolatedApi.recalculateTodaySession();
  const after = Object.values(isolatedStore.daySessions).find(s => s.day === 2);
  const firstEx = after.exercises[0];
  assert.strictEqual(firstEx.sets.filter(s => s.done).length, 1, 'done sets must survive recalc');
  assert.strictEqual(firstEx.sets.filter(s => s.skipped).length, 1, 'skipped sets must survive recalc as records');
  assert.ok(after.exercises.some(ex => ex.todayOnlyAdded && ex.key === 'custom_today_x'),
    'today-only added exercises must survive recalc');
}

function testFutureAccessoryEditCoversSetsRepsRpe() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  const slot = isolatedStore.settings.accessorySlots['2'].find(s => s.key === 'incline_db');
  assert.ok(slot);
  isolatedApi.updateAccessorySlot(2, slot.slotId, { ...slot, plannedSets: 5, reps: '6〜8', targetRpe: '9', plannedWeight: 40.5 });
  const next = isolatedApi.buildAccessoryExercises(2, isolatedStore.settings, false).find(ex => ex.key === 'incline_db');
  assert.strictEqual(next.plannedSets, 5, 'sets must carry to next generation');
  assert.strictEqual(next.plannedReps, '6〜8', 'reps must carry to next generation');
  assert.strictEqual(next.targetRpe, '9', 'target RPE must carry to next generation');
  assert.strictEqual(next.plannedWeight, 40.5, 'decimal weights must be preserved');
}

function testUpdateExerciseRestSetting() {
  const isolated = createHarness();
  const isolatedApi = isolated.api;
  const isolatedStore = isolatedApi.getStore();

  isolatedStore.settings.exerciseRestSettings = [{
    id: 'rest-edit-target',
    name: '胸・肩',
    parts: ['胸', '肩'],
    exercises: [],
    startDate: '2026-06-02',
    endDate: '2026-06-15',
    note: '',
  }];

  const updated = isolatedApi.updateExerciseRestSetting('rest-edit-target', {
    name: '肩',
    parts: ['肩'],
    exercises: ['ベンチプレス'],
    endDate: '2099-12-31',
    note: '長引きそう',
  });
  assert.ok(updated);
  assert.strictEqual(updated.id, 'rest-edit-target', 'id must be preserved (no delete & recreate)');
  assert.deepStrictEqual(updated.parts, ['肩']);
  assert.deepStrictEqual(updated.exercises, ['ベンチプレス']);
  assert.strictEqual(updated.startDate, '2026-06-02', 'start date stays unless changed');
  assert.strictEqual(updated.endDate, '2099-12-31');
  assert.strictEqual(updated.note, '長引きそう');
  assert.strictEqual(isolatedStore.settings.exerciseRestSettings.length, 1);
  assert.strictEqual(isolatedApi.updateExerciseRestSetting('missing-id', { note: 'x' }), null);
}

function createFourMenuHarness() {
  const h = createHarness();
  h.api.getStore().settings.programMode = 'fourMenu';
  return h;
}

function testExistingStoreMigratesToFourMenuMode() {
  const saved = {
    version: '1.0.0',
    settings: {
      programMode: 'legacy8',
      maxes: { bench: 125, squat: 170, halfDead: 205, floorDead: 190 },
    },
    currentState: {
      block: 3,
      rotation: 4,
      day: 7,
      nextMenuKey: 'shoulderArms',
    },
    logs: [{
      id: 'old-log',
      date: '2026-06-01',
      block: 2,
      rotation: 3,
      day: 5,
      exerciseKey: 'bench',
      exerciseName: 'ベンチプレス',
      menuType: 'bench-volume',
      plannedSets: 3,
      doneSets: 3,
      sets: [],
      ts: 1,
    }],
  };
  const isolated = createHarness({ initialStore: saved, forceLegacy: false });
  const api = isolated.api;
  const store = api.getStore();
  assert.strictEqual(store.settings.programMode, 'fourMenu');
  assert.strictEqual(store.currentState.nextMenuKey, 'shoulder_arm');
  assert.ok(store.settings.fourMenuAccessorySlots);
  assert.ok(store.settings.fourMenuAccessorySlots.legs.every(slot => typeof slot.reps === 'number'));
  const html = api.renderToday();
  assert.ok(html.includes('4メニュー順番ローテ') || html.includes('次のメニュー'));
  assert.ok(html.includes('肩・腕'));
  assert.ok(!html.includes('B3 / R4 / Day7'), 'today should not prefer legacy progress metadata');
  const logHtml = api.renderDailyLogView();
  assert.ok(logHtml.includes('B2 / R3 / Day5'), 'legacy log view remains readable');
}

function testFourMenuPlanAndProgression() {
  const isolated = createFourMenuHarness();
  const api = isolated.api;
  const store = api.getStore();
  store.settings.maxes = { ...store.settings.maxes, bench: 125, squat: 170, halfDead: 205, floorDead: 190, shoulderPress: 77.5 };

  const chest = api.buildFourMenu('chest', store.settings);
  const bench = chest.exercises.find(ex => ex.key === 'bench');
  assert.ok(bench, 'chest menu must include bench');
  assert.strictEqual(bench.plannedSets, 3);
  assert.strictEqual(bench.plannedReps, 5);
  assert.strictEqual(bench.plannedWeight, 107.5);
  assert.strictEqual(bench.progressionReason, '記録なしのため初期重量');

  store.logs.push({
    id: 'four-bench-complete',
    date: '2026-07-01',
    fourMenuRotation: true,
    exerciseKey: 'bench',
    exerciseName: 'ベンチプレス',
    menuType: 'four-main-bench',
    plannedWeight: 107.5,
    plannedReps: 5,
    plannedSets: 3,
    sets: [{ weight: 107.5, reps: 5, done: true }, { weight: 107.5, reps: 5, done: true }, { weight: 107.5, reps: 5, done: true }],
    doneSets: 3,
    rpe: '8',
    pains: [],
    ts: 1,
  });
  assert.strictEqual(api.getFourMenuMainPlan('bench', 'chest', store.settings).weight, 110);

  store.logs.unshift({
    id: 'four-bench-miss-2',
    date: '2026-07-15',
    fourMenuRotation: true,
    exerciseKey: 'bench',
    exerciseName: 'ベンチプレス',
    menuType: 'four-main-bench',
    plannedWeight: 110,
    plannedReps: 5,
    plannedSets: 3,
    sets: [{ weight: 110, reps: 5, done: true }, { weight: 110, reps: 4, done: true }, { weight: 110, reps: '', done: false }],
    doneSets: 2,
    rpe: '9.5',
    pains: [],
    ts: 3,
  }, {
    id: 'four-bench-miss-1',
    date: '2026-07-08',
    fourMenuRotation: true,
    exerciseKey: 'bench',
    exerciseName: 'ベンチプレス',
    menuType: 'four-main-bench',
    plannedWeight: 110,
    plannedReps: 5,
    plannedSets: 3,
    sets: [{ weight: 110, reps: 5, done: true }, { weight: 110, reps: 4, done: true }, { weight: 110, reps: '', done: false }],
    doneSets: 2,
    rpe: '9',
    pains: [],
    ts: 2,
  });
  const reduced = api.getFourMenuMainPlan('bench', 'chest', store.settings);
  assert.strictEqual(reduced.weight, 100);
  assert.strictEqual(reduced.reason, '2回連続未達のため約10%減');
}

function testFourMenuSessionSelectionAndDeadliftAlternation() {
  const isolated = createFourMenuHarness();
  const api = isolated.api;
  const store = api.getStore();
  store.currentState.nextMenuKey = 'shoulder_arm';
  store.currentState.isRestSelected = false;
  store.currentState.backCompletedCount = 0;

  api.renderToday();
  let session = Object.values(store.daySessions).find(s => s.fourMenuRotation);
  assert.ok(session);
  assert.strictEqual(session.selectedSplitKey, 'shoulder_arm');
  assert.ok(api.selectFourMenuForToday('rest'));
  session = Object.values(store.daySessions).find(s => s.fourMenuRotation);
  assert.strictEqual(session.selectedSplitKey, 'rest');
  assert.strictEqual(session.isRest, true);

  assert.ok(api.selectFourMenuForToday('chest'));
  session = Object.values(store.daySessions).find(s => s.fourMenuRotation);
  assert.strictEqual(session.selectedSplitKey, 'chest');
  assert.strictEqual(session.performedSplitKey, 'chest');
  assert.ok(session.exercises.some(ex => ex.key === 'bench'));

  assert.strictEqual(api.getFourMenuBackLiftKey(store.currentState), 'halfDead');
  store.currentState.backCompletedCount = 1;
  assert.strictEqual(api.getFourMenuBackLiftKey(store.currentState), 'floorDead');
  const back = api.buildFourMenu('back', store.settings);
  assert.ok(back.exercises.some(ex => ex.key === 'floorDead'));
}

function testFourMenuLogRenderingAndOverrideScope() {
  const isolated = createFourMenuHarness();
  const api = isolated.api;
  const store = api.getStore();
  store.logs.push({
    id: 'four-log',
    date: '2026-07-01',
    fourMenuRotation: true,
    splitName: '胸',
    performedSplitKey: 'chest',
    exerciseKey: 'bench',
    exerciseName: 'ベンチプレス',
    menuType: 'four-main-bench',
    plannedWeight: 107.5,
    plannedReps: 5,
    plannedSets: 3,
    sets: [{ weight: 107.5, reps: 5, done: true }],
    doneSets: 1,
    rpe: '8',
    ts: 1,
  }, {
    id: 'legacy-log',
    date: '2026-06-01',
    block: 1,
    rotation: 1,
    day: 2,
    exerciseKey: 'bench',
    exerciseName: 'ベンチプレス',
    menuType: 'bench-volume',
    plannedSets: 3,
    doneSets: 3,
    sets: [],
    ts: 0,
  });
  const html = api.renderDailyLogView();
  assert.ok(html.includes('胸'), 'four-menu logs should show split name');
  assert.ok(html.includes('B1 / R1 / Day2'), 'legacy logs should keep old metadata');

  const menu = api.buildFourMenu('chest', store.settings);
  const bench = menu.exercises.find(ex => ex.key === 'bench');
  bench.plannedWeight = 120;
  assert.ok(api.saveMainSetOverride('chest', bench));
  assert.strictEqual(api.buildFourMenu('chest', store.settings).exercises.find(ex => ex.key === 'bench').plannedWeight, 120);
  assert.notStrictEqual(api.buildFourMenu('legs', store.settings).exercises.find(ex => ex.key === 'squat').plannedWeight, 120);
}

function testFourMenuAccessoryTemplatesAndPlanActions() {
  const isolated = createFourMenuHarness();
  const api = isolated.api;
  const store = api.getStore();
  api.updateHeader();
  assert.ok(isolated.elements.headerStatus.textContent.includes('4メニュー'));
  assert.ok(!isolated.elements.headerStatus.textContent.includes('Day'));
  const initial = api.getFourMenuAccessorySlots('legs');
  assert.ok(initial.length >= 3);
  assert.ok(initial.every(slot => typeof slot.reps === 'number'), 'four-menu planned reps must be numeric');
  assert.strictEqual(initial.find(slot => slot.key === 'legpress').plannedSets, 4);
  assert.strictEqual(initial.find(slot => slot.key === 'legpress').plannedWeight, 250);

  const target = initial.find(slot => slot.key === 'leg_curl');
  assert.ok(api.updateFourMenuAccessorySlot('legs', target.slotId, { ...target, reps: '10〜15', plannedSets: 4 }));
  assert.ok(store.settings.fourMenuAccessorySlots.legs.length);
  let generated = api.buildFourMenu('legs', store.settings).exercises.find(ex => ex.slotId === target.slotId);
  assert.strictEqual(generated.plannedReps, 12);
  assert.strictEqual(generated.plannedSets, 4);

  const todayOnly = { ...generated, plannedReps: 20 };
  assert.strictEqual(todayOnly.plannedReps, 20);
  generated = api.buildFourMenu('legs', store.settings).exercises.find(ex => ex.slotId === target.slotId);
  assert.strictEqual(generated.plannedReps, 12, 'today-only changes must not mutate the template');

  const added = api.addFourMenuAccessorySlot('chest', {
    slotId: 'today_chest_temp',
    slotName: '胸',
    key: 'custom_test',
    name: 'テスト補助',
    plannedSets: 2,
    reps: '8〜12',
    plannedWeight: 20,
    targetRpe: '8',
    categories: ['胸'],
    fatigueTags: [],
  });
  assert.ok(!String(added.slotId).startsWith('today_'));
  assert.strictEqual(added.reps, 10);
  assert.ok(api.buildFourMenu('chest', store.settings).exercises.some(ex => ex.name === 'テスト補助'));
  api.deleteFourMenuAccessorySlot('chest', added.slotId);
  assert.ok(!api.buildFourMenu('chest', store.settings).exercises.some(ex => ex.name === 'テスト補助'));
  assert.ok(store.settings.fourMenuAccessorySlots.legs.length);

  const planHtml = api.renderBlock();
  assert.ok(planHtml.includes('補助種目を追加'));
  assert.ok(planHtml.includes('data-edit-four-accessory'));
  assert.ok(!planHtml.includes('Daynull'));
  assert.ok(!planHtml.includes('undefined'));
  assert.ok(!planHtml.includes('NaN'));
}

function testFourMenuMainIdentityAndCompletionIdempotency() {
  const isolated = createFourMenuHarness();
  const api = isolated.api;
  const store = api.getStore();

  const shoulderMenu = api.buildFourMenu('shoulder-arms', store.settings);
  const military = shoulderMenu.exercises.find(ex => ex.isFourMenuMain);
  assert.ok(military);
  assert.strictEqual(military.name, 'ミリタリープレス');
  assert.strictEqual(military.isBig3, false, 'military press must not enter BIG3/MAX logic');
  military.sets = Array.from({ length: military.plannedSets }, () => ({
    weight: military.plannedWeight,
    reps: military.plannedReps,
    done: false,
  }));
  assert.strictEqual(api.applyMainSetEdit(military, { plannedWeight: 67.5, plannedReps: 5, plannedSets: 3 }).ok, true);
  assert.strictEqual(api.saveMainSetOverride('shoulder_arm', military), true);
  assert.strictEqual(api.buildFourMenu('shoulder_arm', store.settings).exercises.find(ex => ex.isFourMenuMain).plannedWeight, 67.5);

  store.currentState.nextMenuKey = 'back';
  store.currentState.isRestSelected = false;
  api.renderToday();
  const session = Object.values(store.daySessions).find(item => item.fourMenuRotation);
  assert.strictEqual(session.selectedSplitKey, 'back');
  session.exercises.forEach(ex => ex.sets.forEach(set => { set.done = true; }));
  api.finishTodaySession();
  assert.strictEqual(store.currentState.backCompletedCount, 1);
  assert.strictEqual(store.currentState.nextMenuKey, 'shoulder_arm');
  const savedBackLogs = store.logs.filter(log => log.fourMenuRotation);
  assert.ok(savedBackLogs.length);
  assert.ok(savedBackLogs.every(log => log.block == null && log.rotation == null && log.day == null));

  api.finishTodaySession();
  assert.strictEqual(store.currentState.backCompletedCount, 1, 're-saving a completed session must not advance deadlift alternation');
  assert.strictEqual(store.currentState.nextMenuKey, 'shoulder_arm');
}

function testFourMenuStateMigrationAliasesAndBackCount() {
  const saved = {
    settings: { programMode: 'legacy8' },
    currentState: {
      nextMenuKey: 'shoulder-arms',
      lastCompletedMenuKey: 'shoulderArms',
      backCompletedCount: 0,
    },
    logs: [{
      id: 'back-1-main',
      date: '2026-07-01',
      fourMenuRotation: true,
      performedSplitKey: 'back',
      exerciseKey: 'halfDead',
      exerciseName: 'ハーフデッド',
      menuType: 'four-main-halfDead',
      plannedSets: 3,
      doneSets: 3,
      sets: [],
      ts: 1,
    }, {
      id: 'back-1-accessory',
      date: '2026-07-01',
      fourMenuRotation: true,
      performedSplitKey: 'back',
      exerciseKey: 'latpulldown',
      exerciseName: 'ラットプルダウン',
      menuType: 'four-accessory-lat',
      plannedSets: 3,
      doneSets: 3,
      sets: [],
      ts: 2,
    }],
  };
  const isolated = createHarness({ initialStore: saved, forceLegacy: false });
  const store = isolated.api.getStore();
  assert.strictEqual(store.settings.programMode, 'fourMenu');
  assert.strictEqual(store.currentState.nextMenuKey, 'shoulder_arm');
  assert.strictEqual(store.currentState.lastCompletedMenuKey, 'shoulder_arm');
  assert.strictEqual(store.currentState.backCompletedCount, 1, 'one back session must count once, not once per exercise log');
  assert.strictEqual(isolated.api.getFourMenuBackLiftKey(store.currentState), 'floorDead');
}

function testImportMigrationPreservesLegacyAndMaxData() {
  const isolated = createFourMenuHarness();
  const legacyLog = {
    id: 'legacy-preserved',
    date: '2026-01-01',
    block: 2,
    rotation: 3,
    day: 7,
    exerciseKey: 'floorDead',
    exerciseName: '床引きデッド',
    sets: [{ weight: 160, reps: 5, done: true }],
  };
  const estimated = { id: 'emax-preserved', liftKey: 'floorDead', estimatedMax: 190 };
  const maxTest = { id: 'max-preserved', liftKey: 'bench', measuredMax: 120 };
  const migrated = isolated.api.migrateStoreData({
    settings: { programMode: 'legacy8' },
    currentState: { nextMenuKey: 'shoulder_arms' },
    logs: [legacyLog],
    estimatedMaxHistory: [estimated],
    maxTestResults: [maxTest],
  });
  assert.strictEqual(migrated.settings.programMode, 'fourMenu');
  assert.strictEqual(migrated.currentState.nextMenuKey, 'shoulder_arm');
  assert.strictEqual(JSON.stringify(migrated.logs[0]), JSON.stringify(legacyLog));
  assert.strictEqual(JSON.stringify(migrated.estimatedMaxHistory[0]), JSON.stringify(estimated));
  assert.strictEqual(JSON.stringify(migrated.maxTestResults[0]), JSON.stringify(maxTest));
  assert.ok(migrated.settings.fourMenuAccessorySlots.chest.length);
  assert.ok(migrated.settings.fourMenuAccessorySlots.chest.every(slot => typeof slot.reps === 'number'));
}

testBig3FormulaUnaffected();
testRirAndEstimatedMax();
testEstimatedMaxFiltering();
testRotationProgressionRules();
testAdoptedProgressionAppliesOnceToNextMenu();
testMaxCandidateAndAdoption();
testDeloadMaxTestResult();
testBlockSuggestionPainSeverity();
testBlockSuggestionHighRpeHalfSteps();
testLogGroupSummaryExcludesRestLogs();
testMaxTestHistoryRendering();
testSkippedSetsBehavior();
testEscapeHtml();
testMixedOneRmAttemptKeepsSuccessAndFailure();
testBestMeasuredAndEstimatedSelection();
testMoveExerciseToActive();
testMaxTabRestoresFromExistingLogs();
testFutureAccessoryEditWinsNextGeneration();
testBodyweightExerciseUsesKgInput();
testInclineDbCurlPresetAndRestScope();
testEstimatedMaxFormulaRegression();
testEstimatedMaxPicksBestActualSet();
testEstimatedMaxMainDisplayReevaluatesLogs();
testEstimatedMaxUpsertUpdatesSameSlotWhenLogIdChanges();
testCompletedSetEditSyncsLogAndEstimatedMax();
testCompletionCommitsCleanRecordValues();
testRecalcKeepsSkipsAndTodayOnlyExercises();
testFutureAccessoryEditCoversSetsRepsRpe();
testUpdateExerciseRestSetting();
testExistingStoreMigratesToFourMenuMode();
testFourMenuPlanAndProgression();
testFourMenuSessionSelectionAndDeadliftAlternation();
testFourMenuLogRenderingAndOverrideScope();
testFourMenuAccessoryTemplatesAndPlanActions();
testFourMenuMainIdentityAndCompletionIdempotency();
testFourMenuStateMigrationAliasesAndBackCount();
testImportMigrationPreservesLegacyAndMaxData();
testMaxUpdateAndRotationProgressionAreCapped();
testDeloadAccessoryAndMaxTestTiming();
testFutureMainSetOverride();
testAdaptiveR4ProposalAndSelection();
testLogDailyAndMonthlyViews();
testFloorDeadDayUsesBulgarianInsteadOfSquat();
testExerciseRestSettings();
testRotationFlowAndMaxRecordsFromSession();

assert.ok(h.storage[STORAGE_KEY], 'store should be persisted');
console.log('test_progression.js: all tests passed');
