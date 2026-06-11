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
