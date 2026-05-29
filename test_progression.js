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
  assert.strictEqual(benchMaxTest.plannedReps, 3);
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
  assert.ok(html.includes('R4 MAX測定'));
  assert.ok(html.includes('MAX測定する'));
  assert.ok(html.includes('今回は測定しない'));
  assert.ok(html.includes('測定方法'));

  const session = Object.values(isolatedStore.daySessions).at(-1);
  assert.ok(isolatedApi.applyDeloadMaxTestModeToSession(session, 'e1rm'));
  assert.ok(session.exercises.some(ex => ex.menuType === 'max-test-e1rm' && ex.key === 'squat'));
  assert.ok(session.exercises.some(ex => ex.menuType === 'max-test-e1rm-backoff' && ex.key === 'squat'));
  assert.ok(!session.exercises.some(ex => ex.key === 'squat' && ex.menuType === 'squat-heavy-backoff'));
  assert.ok(isolatedApi.applyDeloadMaxTestModeToSession(session, 'normal'));
  assert.ok(!session.exercises.some(ex => ex.key === 'squat' && ex.isDeloadMaxTest));
  assert.ok(session.exercises.some(ex => ex.key === 'squat' && ex.isR4NonTest));

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
  assert.ok(logHtml.includes('log-card'));
  const monthHtml = isolatedApi.renderMonthlyLogView();
  assert.ok(monthHtml.includes('2026年05月'));
  assert.ok(monthHtml.includes('実施 2日'));
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

testBig3FormulaUnaffected();
testRirAndEstimatedMax();
testEstimatedMaxFiltering();
testRotationProgressionRules();
testAdoptedProgressionAppliesOnceToNextMenu();
testMaxCandidateAndAdoption();
testDeloadMaxTestResult();
testBlockSuggestionPainSeverity();
testMaxUpdateAndRotationProgressionAreCapped();
testDeloadAccessoryAndMaxTestTiming();
testFutureMainSetOverride();
testAdaptiveR4ProposalAndSelection();
testLogDailyAndMonthlyViews();
testFloorDeadDayUsesBulgarianInsteadOfSquat();

assert.ok(h.storage[STORAGE_KEY], 'store should be persisted');
console.log('test_progression.js: all tests passed');
