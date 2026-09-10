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
  const documentListeners = {};
  const windowListeners = {};
  let storageFailure = false;
  if (options.initialStore) storage[STORAGE_KEY] = JSON.stringify(options.initialStore);
  if (Object.prototype.hasOwnProperty.call(options, 'rawStore')) storage[STORAGE_KEY] = options.rawStore;
  const document = {
    getElementById(id) {
      if (!elements[id]) elements[id] = makeElement(id);
      return elements[id];
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener(type, handler) { documentListeners[type] = handler; },
  };
  const context = {
    console,
    document,
    window: { addEventListener(type, handler) { windowListeners[type] = handler; } },
    navigator: {},
    localStorage: {
      getItem(key) { return storage[key] || null; },
      setItem(key, value) {
        if (storageFailure) throw new Error('simulated storage failure');
        storage[key] = String(value);
      },
      removeItem(key) { delete storage[key]; },
    },
    confirm: options.confirm || (() => true),
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
  return {
    api,
    context,
    storage,
    elements,
    documentListeners,
    windowListeners,
    setStorageFailure: value => { storageFailure = !!value; },
  };
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

function testBodyWeightAndVolumeTrend() {
  const { api } = createHarness();
  const store = api.getStore();
  // schema 3: 器が増えるだけで既存データの意味は変わらない
  assert.ok(Array.isArray(store.bodyWeights), 'bodyWeights は常に配列');
  assert.strictEqual(api.recordBodyWeight('82.4'), true);
  assert.strictEqual(store.bodyWeights.length, 1);
  assert.strictEqual(store.bodyWeights[0].weight, 82.4);
  // 同じ日は上書き、増えない
  assert.strictEqual(api.recordBodyWeight('82.9'), true);
  assert.strictEqual(store.bodyWeights.length, 1);
  assert.strictEqual(store.bodyWeights[0].weight, 82.9);
  // 不正値は保存しない
  assert.strictEqual(api.recordBodyWeight('0'), false);
  assert.strictEqual(api.recordBodyWeight('abc'), false);
  assert.strictEqual(api.recordBodyWeight('500'), false);
  assert.strictEqual(store.bodyWeights.length, 1);
  // 旧データ（bodyWeights なし）を読んでも壊れない
  const migrated = api.migrateStoreData({ logs: [], settings: {} });
  assert.ok(Array.isArray(migrated.bodyWeights));
  assert.strictEqual(migrated.bodyWeights.length, 0);
  // 壊れた要素は落とす
  const dirty = api.migrateStoreData({ bodyWeights: [{ date: '', weight: 1 }, { date: '2026-01-01', weight: 'x' }, { date: '2026-01-02', weight: 80 }] });
  assert.strictEqual(dirty.bodyWeights.length, 1);
  assert.strictEqual(dirty.bodyWeights[0].weight, 80);

  // 体重カードは記録が無くても出る。入力欄がこのカードにしか無いため
  store.bodyWeights = [];
  const emptyCard = api.renderBodyWeightCard();
  assert.ok(emptyCard.includes('id="bodyWeightInput"'), '記録ゼロでも入力欄は出す');
  // 増減に色を付けない（増量中か減量中かはアプリには分からない）
  store.bodyWeights = [
    { date: '2026-06-01', weight: 80 },
    { date: '2026-07-05', weight: 83 },
  ];
  const gainCard = api.renderBodyWeightCard();
  assert.ok(gainCard.includes('trend-delta num plain'), '体重の増減は中立色で出す');
  assert.ok(!/trend-delta num (up|down)/.test(gainCard), '体重の増減に up/down を付けてはいけない');
  assert.ok(gainCard.includes('id="bodyWeightInput"'), '値と入力は同じカードに置く');
}

// 月初の今月と、終わった先月をそのまま比べると必ず大幅減に見える不具合の回帰テスト
function testVolumeTrendComparesEqualPeriods() {
  const { api } = createHarness();
  const store = api.getStore();
  const log = (date, weight) => ({
    id: `v-${date}-${weight}`, date, performedSplitKey: 'chest',
    sets: [{ done: true, weight, reps: 10 }],
  });
  store.logs = [log('2026-09-02', 120), log('2026-08-02', 100), log('2026-08-20', 900)];

  const full = api.monthlyVolumeByMenu(2);
  assert.strictEqual(full.map(m => m.month).join(','), '2026-09,2026-08');
  assert.strictEqual(full[1].byMenu.chest, 10000, '日数を絞らなければ先月は満額');

  const toDate = api.monthlyVolumeByMenu(2, 5);
  assert.strictEqual(toDate.map(m => m.month).join(','), '2026-09,2026-08', '対象月は絞る前の記録で決める');
  assert.strictEqual(toDate[0].byMenu.chest, 1200);
  assert.strictEqual(toDate[1].byMenu.chest, 1000, '先月も同じ日数までで揃える');

  // 絞った結果が空になっても、その月が候補から消えて比較相手がずれてはいけない
  const day1 = api.monthlyVolumeByMenu(2, 1);
  assert.strictEqual(day1.map(m => m.month).join(','), '2026-09,2026-08');
  assert.strictEqual(Object.keys(day1[1].byMenu).length, 0);

  const html = api.renderVolumeTrend();
  assert.ok(html.includes('VOLUME BY MENU'), 'ラベルは英大文字のまま');
  assert.ok(!html.includes('2026-09'), '見出しにISO日付を出さない');
  assert.ok(html.includes('trend-note'), '比較している期間を明示する');
}

// 完了画面の「NEW PR」が一度も出なかった不具合の回帰テスト。
// 完了時に自分のセットが store.logs へ入るため、自己ベストが自分自身になっていた。
function testPrCountsOnlyEarlierSessions() {
  const { api } = createHarness();
  const store = api.getStore();
  store.logs = [{
    id: 'past', sessionId: 'session-past', date: '2026-08-01', exerciseKey: 'bench',
    exerciseName: 'ベンチプレス', sets: [{ weight: 100, reps: 5, done: true }],
  }];
  const ex = { key: 'bench', name: 'ベンチプレス', sets: [{ weight: 110, reps: 3, done: true }] };

  // 進行中（自分のログはまだ無い）: PRとして検出される
  assert.deepStrictEqual(api.sessionPrSetIndexes(ex, null).join(','), '0', '過去の記録を超えたセットはPR');

  // 完了後（自分のログが保存済み）: それでも同じ判定になる
  store.logs.push({
    id: 'today', sessionId: 'session-today', date: '2026-09-10', exerciseKey: 'bench',
    exerciseName: 'ベンチプレス', sets: [{ weight: 110, reps: 3, done: true }],
  });
  const session = { sessionId: 'session-today' };
  assert.strictEqual(api.sessionPrSetIndexes(ex, session).join(','), '0', '保存後も自セッションを除いて判定する');
  assert.strictEqual(api.getExercisePrRecord(ex, session).weight, 100, '自己ベストは過去のセッションから取る');
  assert.strictEqual(api.getExercisePrRecord(ex, null).weight, 110, 'セッション指定なしなら全ログが対象');
}

// 破損したJSONを取り込むと設定画面が Object.entries(null) で落ちていた不具合の回帰テスト
function testMigrationFixesContainerTypes() {
  const { api } = createHarness();
  const broken = api.migrateStoreData({ manualAdjustments: null, blockSuggestions: 'x' });
  assert.strictEqual(typeof broken.manualAdjustments, 'object');
  assert.ok(broken.manualAdjustments && !Array.isArray(broken.manualAdjustments));
  assert.strictEqual(Object.keys(broken.manualAdjustments).length, 0);
  assert.ok(Array.isArray(broken.blockSuggestions));
  // 中身のある値は壊さない
  const kept = api.migrateStoreData({ manualAdjustments: { '1-bench-main': 2.5 }, blockSuggestions: [{ ts: 1 }] });
  assert.strictEqual(kept.manualAdjustments['1-bench-main'], 2.5);
  assert.strictEqual(kept.blockSuggestions.length, 1);
}

// MAXタブに推定MAXを統合したときに、同じ数字とピッカーが二重に出た不具合の回帰テスト
function testMaxTabShowsEachNumberOnce() {
  const { api } = createHarness();
  const store = api.getStore();
  store.estimatedMaxHistory = [
    { id: 'e1', liftKey: 'bench', estimatedMax: 120, maxUseKind: 'candidate', date: '2026-09-01', sourceWeight: 100, sourceReps: 5, rpe: '9' },
  ];
  const html = api.renderMaxLogTab();
  assert.strictEqual((html.match(/class="seg lift-seg/g) || []).length, 1, '種目ピッカーは1つ');
  assert.ok(!html.includes('data-emax-lift'), 'MAXタブに2つ目の種目ピッカーを出さない');
  assert.ok(!html.includes('最新推定MAX'), 'ESTIMATED カードと重複する見出しを出さない');
  assert.ok(html.includes('MEASURED') && html.includes('ESTIMATED'));
  assert.strictEqual((html.match(/120\.0/g) || []).length, 2, 'ESTIMATEDカードと履歴の1行だけ');
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
  // パネル本体はオプションシートへ移動。本文には「今日がMAX測定日」の1行バナーだけ残す。
  assert.ok(html.includes('MAX測定'), '本文にMAX測定日のバナーが残る');
  assert.ok(html.includes('btnOpenMaxTestFromBanner'), 'バナーはシートを開く導線になる');
  const maxPanel = isolatedApi.renderDeloadMaxTestPanel(isolatedApi.getOrCreateTodaySession({ persist: false }));
  assert.ok(maxPanel.includes('data-mode="trueOneRm"'), 'MAX測定する/しないの2択（する）');
  assert.ok(maxPanel.includes('data-mode="normal"'), 'MAX測定する/しないの2択（しない）');
  assert.ok(!html.includes('e1RM確認'));
  assert.ok(!html.includes('3RM'));
  assert.ok(!html.includes('5RM'));
  assert.ok(!html.includes('方法'));
  // R4の強さ選択もオプションシートへ移動した。
  const r4Panel = isolatedApi.renderR4AdjustmentPanel(isolatedApi.getOrCreateTodaySession({ persist: false }));
  assert.ok(r4Panel.includes('Lv1'));
  assert.ok(r4Panel.includes('今回の強さ'), 'R4のLvセグメントカード');
  assert.ok(!html.includes('今回の強さ'), '調整パネルは本文に出さない');
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
  // 実測MAXと推定MAXは1つのタブに統合した。知りたいのは「いま何kg挙がるか」で、
  // 両方を並べて見る値だから。タブが分かれている契約はここで反転する。
  assert.ok(!logHtml.includes('data-type="emax"'), 'MAXと推定MAXは同じタブ');
  assert.ok((logHtml.match(/class="tab /g) || []).length === 3, 'ログのタブは3つ');
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
  assert.ok(html.includes('PAUSED'), 'rested exercises should be shown with the gray PAUSED chip');
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
  // 推奨値は完了時に自動採用し、完了画面から取り消せる（DESIGN.md 原則15）。
  // 「タップするまで変わらない」契約は「自動で変わり、戻せる」契約に置き換わった。
  const finishedKey = Object.keys(isolatedStore.daySessions).find(k => isolatedStore.daySessions[k].completed);
  const applied = isolatedStore.daySessions[finishedKey].autoApplied || [];
  const emaxApplied = applied.find(item => item.kind === 'emax' && item.maxKey === 'bench');
  assert.ok(emaxApplied, 'MAX更新は自動採用され記録に残る');
  assert.strictEqual(emaxApplied.before, 120, '取り消し用に旧値を保持する');
  assert.strictEqual(isolatedStore.settings.maxes.bench, 122.5, 'MAXは自動採用される');
  assert.strictEqual(isolatedApi.undoAutoApplied(finishedKey, applied.indexOf(emaxApplied)), true);
  assert.strictEqual(isolatedStore.settings.maxes.bench, 120, '取り消すと旧値に戻る');
  // 取り消したのに、同じセッションを保存し直すと黙って再適用されていた
  isolatedApi.autoApplySuggestions(isolatedStore.daySessions[finishedKey]);
  assert.strictEqual(isolatedStore.settings.maxes.bench, 120, '取り消した提案は保存し直しても戻らない');
  assert.strictEqual(
    (isolatedStore.daySessions[finishedKey].autoApplied || []).some(item => item.kind === 'emax' && item.maxKey === 'bench'),
    false,
    '取り消した項目が一覧に復活してはいけない'
  );

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

  // 推定MAX: 候補・参考を含む有効な記録の中から過去最高を表示する
  isolatedStore.estimatedMaxHistory = [
    { id: 'e1', liftKey: 'bench', estimatedMax: 118, maxUseKind: 'candidate', useForMaxUpdate: true, adopted: false, date: '2026-05-02', sourceWeight: 100, sourceReps: 5, rpe: '8', ts: 1 },
    { id: 'e2', liftKey: 'bench', estimatedMax: 121, maxUseKind: 'candidate', useForMaxUpdate: true, adopted: false, date: '2026-05-10', sourceWeight: 105, sourceReps: 4, rpe: '8.5', ts: 2 },
    { id: 'e3', liftKey: 'bench', estimatedMax: 130, maxUseKind: 'reference', useForMaxUpdate: false, adopted: false, date: '2026-06-01', sourceWeight: 90, sourceReps: 8, rpe: '9', ts: 3 },
    { id: 'e4', liftKey: 'bench', estimatedMax: 140, maxUseKind: 'excluded', useForMaxUpdate: false, adopted: false, date: '2026-06-05', sourceWeight: 80, sourceReps: 12, rpe: '10', ts: 4 },
  ];
  const bestEmax = isolatedApi.bestEstimatedMaxEntryForLift('bench');
  assert.strictEqual(bestEmax.id, 'e3', 'best display should include a valid reference entry');

  // 候補が無い場合は参考の最大値へフォールバック
  isolatedStore.estimatedMaxHistory = isolatedStore.estimatedMaxHistory.filter(e => e.maxUseKind !== 'candidate');
  assert.strictEqual(isolatedApi.bestEstimatedMaxEntryForLift('bench').id, 'e3');
}

function testEstimatedMaxOrderingAndConsistency() {
  const isolated = createHarness();
  const api = isolated.api;
  const store = api.getStore();
  store.estimatedMaxHistory = [
    { id: 'old-adopted', sourceLogId: 'log-old', liftKey: 'floorDead', estimatedMax: 189.5, maxUseKind: 'candidate', adopted: true, date: '2026-05-29', performedAt: '2026-05-29T20:00:00+09:00', sourceWeight: 160, sourceReps: 5, rpe: '9.5' },
    { id: 'new-candidate', sourceLogId: 'log-new', liftKey: 'floorDead', estimatedMax: 189.5, maxUseKind: 'candidate', adopted: false, date: '2026-06-16', performedAt: '2026-06-16T19:00:00+09:00', sourceWeight: 160, sourceReps: 5, rpe: '9.5' },
    { id: 'newest-reference', sourceLogId: 'log-ref', liftKey: 'floorDead', estimatedMax: 188, maxUseKind: 'reference', adopted: false, date: '2026-06-20', performedAt: '2026-06-20T18:00:00+09:00', sourceWeight: 155, sourceReps: 7, rpe: '7.5' },
    { id: 'excluded-newest', sourceLogId: 'log-excluded', liftKey: 'floorDead', estimatedMax: 230, maxUseKind: 'excluded', adopted: false, date: '2026-06-22', performedAt: '2026-06-22T18:00:00+09:00', sourceWeight: 170, sourceReps: 12, rpe: '10' },
  ];

  assert.strictEqual(api.latestEstimatedMaxEntryForLift('floorDead').id, 'newest-reference', 'latest valid reference should beat an older adopted row');
  assert.strictEqual(api.adoptedEstimatedMaxEntryForLift('floorDead').id, 'old-adopted');
  assert.strictEqual(api.bestEstimatedMaxEntryForLift('floorDead').id, 'new-candidate', 'equal best values prefer the newer performed time');
  assert.strictEqual(
    Array.from(api.collectEstimatedMaxEntries('floorDead'), entry => entry.id).join(','),
    'excluded-newest,newest-reference,new-candidate,old-adopted',
    'history should be performed-time descending regardless of status'
  );

  store.estimatedMaxHistory = [
    { id: 'same-day-old', liftKey: 'bench', estimatedMax: 120, maxUseKind: 'candidate', date: '2026-06-01', timestamp: '2026-06-01T10:00:00+09:00' },
    { id: 'same-day-new', liftKey: 'bench', estimatedMax: 121, maxUseKind: 'candidate', date: '2026-06-01', timestamp: '2026-06-01T20:00:00+09:00' },
  ];
  assert.strictEqual(api.latestEstimatedMaxEntryForLift('bench').id, 'same-day-new', 'same-day entries should use the newer timestamp');
  const emaxHtml = api.renderEmaxLogTab();
  assert.ok(emaxHtml.includes('最新推定MAX'));
  assert.ok((emaxHtml.match(/121\.0/g) || []).length >= 2, 'latest card and matching history row must use the same estimate');

  store.maxTestResults = [{ id: 'measured-only', liftKey: 'bench', measuredMaxWeight: 200, challengeSucceeded: true }];
  assert.strictEqual(api.latestEstimatedMaxEntryForLift('bench').id, 'same-day-new', 'measured 1RM records must stay separate from estimated max');

  store.estimatedMaxHistory = [
    { id: 'tie-b', liftKey: 'squat', estimatedMax: 150, maxUseKind: 'candidate', date: '2026-06-01', ts: 100 },
    { id: 'tie-a', liftKey: 'squat', estimatedMax: 150, maxUseKind: 'candidate', date: '2026-06-01', ts: 100 },
  ];
  assert.strictEqual(api.bestEstimatedMaxEntryForLift('squat').id, 'tie-a', 'identical values and timestamps should use a stable id tie-break');

  store.estimatedMaxHistory = [
    { id: 'session-a', sessionId: 'session-a', liftKey: 'halfDead', menuType: 'halfDead-hi-main', date: '2026-06-02', estimatedMax: 200, maxUseKind: 'candidate' },
    { id: 'session-b', sessionId: 'session-b', liftKey: 'halfDead', menuType: 'halfDead-hi-main', date: '2026-06-02', estimatedMax: 200, maxUseKind: 'candidate' },
    { id: 'duplicate-old', sourceLogId: 'same-log', liftKey: 'halfDead', estimatedMax: 201, maxUseKind: 'candidate', date: '2026-06-03' },
    { id: 'duplicate-new', sourceLogId: 'same-log', liftKey: 'halfDead', estimatedMax: 202, maxUseKind: 'candidate', date: '2026-06-03' },
  ];
  const deduped = api.collectEstimatedMaxEntries('halfDead');
  assert.strictEqual(deduped.filter(entry => entry.sessionId).length, 2, 'different sessions with equal values must remain separate');
  assert.strictEqual(deduped.filter(entry => entry.sourceLogId === 'same-log').length, 1, 'the same source log must be de-duplicated');

  assert.strictEqual(api.estimateMaxFromSet(-100, 5, '9').value, null);
  assert.strictEqual(api.estimateMaxFromSet(100, 0, '9').value, null);
  assert.strictEqual(api.estimateMaxFromSet(100, 5, '').value, null, 'missing RPE must not be guessed');
  assert.strictEqual(api.estimateMaxFromSet(100, 5, '9').value, 120, 'RPE-aware Epley/RIR calculation remains the canonical formula');

  const oldJson = {
    settings: {},
    estimatedMaxHistory: [{ id: 'legacy-emax', liftKey: 'bench', estimatedMax: 110, maxUseKind: 'reference', date: '2025-01-02' }],
  };
  const once = api.migrateStoreData(oldJson);
  const twice = api.migrateStoreData(once);
  assert.strictEqual(once.estimatedMaxHistory.length, 1);
  assert.strictEqual(twice.estimatedMaxHistory.length, 1, 'repeated migration must not grow estimated-max history');
  store.estimatedMaxHistory = once.estimatedMaxHistory;
  assert.strictEqual(api.latestEstimatedMaxEntryForLift('bench').estimatedMax, 110, 'legacy rows without source inputs should fall back to their saved estimate');
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
  assert.ok(html.includes('data-direct-field="kg"'), 'weight must be directly editable without opening a sheet');
  assert.ok(html.includes('5〜8'), 'planned reps range should show as the reps default');

  // 加重5kg（またはアシスト−相当）をkgとして表示できる
  const chin = session.exercises.find(ex => ex.key === 'chinning');
  const pending = chin.sets[isolatedApi.firstPendingSetIndex(chin)];
  pending.weight = 5;
  html = isolatedApi.renderToday();
  assert.ok(/aria-label="セット重量 kg"[^>]*value="5"/.test(html), 'entered weight must render in the kg input');
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
  // メニューピッカーは本文からヘッダーのシートへ移動した。
  // 「5つ選択できて rest は出ない」という契約はシート側で検証する。
  const session = api.getOrCreateTodaySession({ persist: false });
  assert.strictEqual(api.todayHeaderTitle(session), 'SHOULDER & ARM');
  const menuHtml = api.menuSheetRowsHtml(session);
  assert.strictEqual((menuHtml.match(/data-four-menu-select=/g) || []).length, 5);
  assert.ok(!menuHtml.includes('data-four-menu-select="rest"'));
  assert.ok(!html.includes('data-four-menu-select='), 'picker must not render in the page body');
  assert.ok(!html.includes('次のメニュー'));
  assert.ok(!html.includes('<h2 class="screen-title">今日</h2>'));
  assert.ok(!html.includes('変更中:'));
  assert.ok(!html.includes('B3 / R4 / Day7'), 'today should not prefer legacy progress metadata');
  assert.ok(!api.renderLog().includes('<h2 class="screen-title">ログ</h2>'));
  assert.ok(!api.renderBlock().includes('<h2 class="screen-title">計画</h2>'));
  assert.ok(!api.renderSettings().includes('<h2 class="screen-title">設定</h2>'));
  api.updateHeader();
  // ヘッダーは #headerStatus の「B/R/Day」表示をやめ、部位名を出す共通ヘッダーになった。
  assert.ok(!/B\d+ \/ R\d+ \/ Day\d+/.test(isolated.elements.hdTitle.textContent || ''),
    'four-menu header must not fall back to legacy progress metadata');
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
  assert.strictEqual(bench.progressionReason, '初回設定');

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
  assert.strictEqual(reduced.weight, 110);
  assert.strictEqual(reduced.reductionCandidateWeight, 105);
  assert.strictEqual(reduced.reasonCode, 'consecutive_miss_reduction_candidate');
}

function testDataProtectionAndProgressionImprovements() {
  const isolated = createFourMenuHarness();
  const api = isolated.api;
  const store = api.getStore();
  const originalSlots = JSON.stringify(store.settings.fourMenuAccessorySlots);
  store.settings.exerciseRestSettings = [{ id: 'rest-1', name: '胸' }];
  store.settings.mainSetOverrides = { test: { plannedWeight: 99 } };
  store.logs = [{ id: 'keep-log' }];
  store.estimatedMaxHistory = [{ id: 'keep-emax' }];
  store.maxTestResults = [{ id: 'keep-max' }];
  api.resetMaxSettings();
  assert.strictEqual(JSON.stringify(store.settings.fourMenuAccessorySlots), originalSlots);
  assert.strictEqual(store.settings.exerciseRestSettings.length, 1);
  assert.ok(store.settings.mainSetOverrides.test);
  assert.strictEqual(store.logs.length, 1);
  assert.strictEqual(store.estimatedMaxHistory.length, 1);
  assert.strictEqual(store.maxTestResults.length, 1);

  store.settings.mainProgressionSettings.militaryPress = undefined;
  assert.strictEqual(api.getMainProgressionIncrement('shoulderPress', store.settings), 1.25);
  store.settings.mainProgressionSettings.shoulderPress.increment = 1.25;
  assert.strictEqual(api.getMainProgressionIncrement('shoulderPress', store.settings), 1.25);

  const make = (id, ts, complete, weight = 100) => ({
    id, ts, date: `2026-07-0${ts}`, fourMenuRotation: true, exerciseKey: 'bench', menuType: 'four-main-bench',
    plannedWeight: weight, plannedReps: 5, plannedSets: 3,
    sets: complete
      ? [{ reps: 5, done: true }, { reps: 5, done: true }, { reps: 5, done: true }]
      : [{ reps: 5, done: true }, { reps: 4, done: true }, { reps: 0, done: false }],
  });
  store.logs = [make('miss-new', 3, false), make('complete-middle', 2, true), make('miss-old', 1, false)];
  const nonConsecutive = api.getFourMenuMainPlan('bench', 'chest', store.settings);
  assert.strictEqual(nonConsecutive.reasonCode, 'miss_hold');
  store.logs = [make('miss-new', 3, false), make('miss-old', 2, false)];
  assert.strictEqual(api.getFourMenuMainPlan('bench', 'chest', store.settings).reasonCode, 'consecutive_miss_reduction_candidate');
  store.logs = [make('miss-new', 3, false, 100), make('miss-old', 2, false, 97.5)];
  assert.strictEqual(api.getFourMenuMainPlan('bench', 'chest', store.settings).reasonCode, 'miss_hold');
  store.logs = [
    make('miss-new', 4, false),
    { ...make('skipped', 3, false), sets: [{ skipped: true }, { skipped: true }, { skipped: true }] },
    make('complete-old', 2, true),
  ];
  assert.strictEqual(api.getFourMenuMainPlan('bench', 'chest', store.settings).reasonCode, 'miss_hold');
  store.logs = [{ ...make('complete-rpe', 3, true), rpe: '10', pains: ['痛み'] }];
  assert.strictEqual(api.getFourMenuMainPlan('bench', 'chest', store.settings).reasonCode, 'completed_increment');
}

function testRecoveryAndSessionIdentity() {
  const broken = createHarness({ rawStore: '{not-json', forceLegacy: false, confirm: () => true });
  assert.strictEqual(broken.api.getStorageRecovery().active, true);
  const backupKeys = Object.keys(broken.storage).filter(key => key.startsWith(`${STORAGE_KEY}_recovery_`));
  assert.strictEqual(backupKeys.length, 1);
  assert.strictEqual(broken.storage[STORAGE_KEY], '{not-json');
  broken.api.saveStore();
  assert.strictEqual(broken.storage[STORAGE_KEY], '{not-json');
  assert.strictEqual(broken.api.initializeAfterStorageRecovery(), true);
  assert.notStrictEqual(broken.storage[STORAGE_KEY], '{not-json');

  const isolated = createFourMenuHarness();
  const api = isolated.api;
  const store = api.getStore();
  const ex = {
    key: 'bench', name: 'ベンチプレス', menuType: 'four-main-bench', plannedWeight: 100, plannedReps: 5, plannedSets: 1,
    sets: [{ weight: 100, reps: 5, done: true }], rpe: '8', pains: [], isFourMenuMain: true,
  };
  const base = { date: '2026-07-11', fourMenuRotation: true, performedSplitKey: 'chest', selectedSplitKey: 'chest', exercises: [ex] };
  api.upsertExerciseLogFromSession({ ...base, sessionId: 'session-a' }, ex, true);
  api.upsertExerciseLogFromSession({ ...base, sessionId: 'session-b' }, ex, true);
  assert.strictEqual(store.logs.filter(log => log.exerciseKey === 'bench').length, 2);
  api.upsertExerciseLogFromSession({ ...base, sessionId: 'session-a' }, { ...ex, note: 'updated' }, true);
  assert.strictEqual(store.logs.filter(log => log.exerciseKey === 'bench').length, 2);
  assert.strictEqual(store.logs.find(log => log.sessionId === 'session-a').note, 'updated');
}

function testPreviousSummaryAccessoryCandidateAndAnalytics() {
  const isolated = createFourMenuHarness();
  const api = isolated.api;
  const store = api.getStore();
  store.logs = [{
    id: 'prev', sessionId: 'old-session', fourMenuRotation: true, performedSplitKey: 'chest', date: '2026-07-01', performedDate: '2026-07-01', ts: 1,
    exerciseKey: 'bench', exerciseName: 'ベンチプレス', menuType: 'four-main-bench', plannedWeight: 100, plannedSets: 3, plannedReps: 5,
    sets: [{ reps: 5, done: true }, { reps: 5, done: true }, { reps: 5, done: true }], rpe: '9',
  }];
  const summary = api.previousMainSummary({ key: 'bench', menuType: 'four-main-bench' }, { sessionId: 'new', date: '2026-07-09' });
  assert.ok(summary.text.includes('100.0kg 5/5/5'));
  assert.strictEqual(summary.days, 8);

  const accessory = {
    isAccessory: true, slotId: 'fm-test', key: 'test', weightType: 'cable', plannedWeight: 50, plannedSets: 3, plannedReps: 10,
    sets: [{ reps: 10, done: true }, { reps: 11, done: true }, { reps: 10, done: true }],
  };
  assert.strictEqual(api.getAccessoryProgressionCandidate(accessory).candidateWeight, 55);
  assert.strictEqual(api.getAccessoryProgressionCandidate({ ...accessory, sets: accessory.sets.slice(0, 2) }), null);
  assert.strictEqual(api.getAccessoryProgressionCandidate({ ...accessory, weightType: 'bodyweight' }), null);

  store.logs[0].categories = ['胸'];
  store.logs[0].date = new Date().toISOString().slice(0, 10);
  store.logs[0].performedDate = store.logs[0].date;
  assert.strictEqual(api.summarizeDirectSets({ days: 30 }).胸, 3);
}

function testFourMenuSessionSelectionAndDeadliftAlternation() {
  const isolated = createFourMenuHarness();
  const api = isolated.api;
  const store = api.getStore();
  store.currentState.nextMenuKey = 'shoulder_arm';
  store.currentState.isRestSelected = false;
  store.currentState.backCompletedCount = 0;

  const initialHtml = api.renderToday();
  assert.strictEqual(Object.keys(store.daySessions).length, 0, 'opening today must not create an empty session');
  assert.strictEqual(store.logs.length, 0, 'opening today must not create a workout or rest log');
  // ピッカーは本文からシートへ移動。5択であることはシート側で検証する。
  assert.strictEqual((api.menuSheetRowsHtml({ fourMenuRotation: true }).match(/data-four-menu-select=/g) || []).length, 5);
  assert.ok(!initialHtml.includes('data-four-menu-select='), 'picker must not render in the page body');
  assert.ok(api.selectFourMenuForToday('shoulder_arm'));
  let session = Object.values(store.daySessions).find(s => s.fourMenuRotation);
  assert.ok(session);
  assert.strictEqual(session.selectedSplitKey, 'shoulder_arm');
  assert.strictEqual(api.selectFourMenuForToday('rest'), false, 'rest is not a new four-menu selection');
  assert.strictEqual(session.selectedSplitKey, 'shoulder_arm');
  assert.strictEqual(session.isRest, false);
  assert.strictEqual(api.nextFourMenuKey('shoulder_arm'), 'legs');
  assert.strictEqual(api.nextFourMenuKey('legs'), 'chest');
  assert.strictEqual(api.nextFourMenuKey('chest'), 'back');
  assert.strictEqual(api.nextFourMenuKey('back'), 'shoulder_arm');

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

function testManualBackLiftVariantSwitchAndPersistence() {
  const isolated = createFourMenuHarness();
  const api = isolated.api;
  const store = api.getStore();
  store.currentState.nextMenuKey = 'back';
  store.currentState.backCompletedCount = 0;
  store.currentState.lastCompletedBackLiftKey = null;

  api.renderToday();
  assert.ok(api.selectFourMenuForToday('back'));
  let session = api.getOrCreateTodaySession({ persist: false });
  const sessionId = session.sessionId;
  const workoutDate = session.workoutDate;
  assert.strictEqual(session.selectedBackLiftKey, 'halfDead');
  assert.ok(api.backLiftRowsHtml(session).includes('data-back-lift-select="halfDead"'));
  assert.ok(api.backLiftRowsHtml(session).includes('デッドリフト'));
  assert.strictEqual(api.backLiftRowsHtml({ fourMenuRotation: true, selectedSplitKey: 'chest' }), '');

  const logsBeforeSwitch = store.logs.length;
  const emaxBeforeSwitch = store.estimatedMaxHistory.length;
  const countBeforeSwitch = store.currentState.backCompletedCount;
  const half = session.exercises.find(ex => ex.key === 'halfDead');
  const accessory = session.exercises.find(ex => ex.isAccessory);
  half.sets[0] = { weight: 180, reps: 5, done: true };
  half.sets.push({ weight: 175, reps: 5, done: false });
  half.rpe = '9';
  half.note = 'ハーフ下書き';
  half.pains = ['違和感'];
  accessory.note = '補助入力維持';
  accessory.sets[0].weight = 77;
  api.persistTodaySession(session);

  assert.strictEqual(api.switchBackLiftVariant(session, 'floorDead'), true);
  assert.strictEqual(session.sessionId, sessionId);
  assert.strictEqual(session.workoutDate, workoutDate);
  assert.strictEqual(session.selectedBackLiftKey, 'floorDead');
  assert.strictEqual(session.exercises.find(ex => ex.isAccessory).note, '補助入力維持');
  assert.strictEqual(session.exercises.find(ex => ex.isAccessory).sets[0].weight, 77);
  assert.strictEqual(store.logs.length, logsBeforeSwitch);
  assert.strictEqual(store.estimatedMaxHistory.length, emaxBeforeSwitch);
  assert.strictEqual(store.currentState.backCompletedCount, countBeforeSwitch);

  const floor = session.exercises.find(ex => ex.key === 'floorDead');
  assert.ok(floor);
  floor.sets[0] = { weight: 160, reps: 5, done: true };
  floor.rpe = '9.5';
  floor.note = 'デッド下書き';
  api.persistTodaySession(session);
  assert.strictEqual(api.switchBackLiftVariant(session, 'halfDead'), true);
  const restoredHalf = session.exercises.find(ex => ex.key === 'halfDead');
  assert.strictEqual(restoredHalf.sets[0].weight, 180);
  assert.strictEqual(restoredHalf.rpe, '9');
  assert.strictEqual(restoredHalf.note, 'ハーフ下書き');
  assert.strictEqual(restoredHalf.sets.length, half.sets.length);
  assert.strictEqual(api.switchBackLiftVariant(session, 'floorDead'), true);
  const restoredFloor = session.exercises.find(ex => ex.key === 'floorDead');
  assert.strictEqual(restoredFloor.sets[0].weight, 160);
  assert.strictEqual(restoredFloor.rpe, '9.5');
  assert.strictEqual(restoredFloor.note, 'デッド下書き');

  assert.strictEqual(api.selectFourMenuForToday('chest'), true);
  assert.strictEqual(api.selectFourMenuForToday('back'), true);
  session = api.getOrCreateTodaySession({ persist: false });
  assert.strictEqual(session.selectedBackLiftKey, 'floorDead', 'menu tab round-trips must preserve the manual variant');
  assert.strictEqual(session.exercises.find(ex => ex.key === 'floorDead').note, 'デッド下書き');

  session.date = '2026-07-01';
  session.workoutDate = '2026-07-01';
  session.performedDate = '2026-07-01';
  api.persistTodaySession(session);
  const draftExport = JSON.parse(isolated.storage[STORAGE_KEY]);
  const reloaded = createHarness({ initialStore: draftExport, forceLegacy: false });
  const reloadApi = reloaded.api;
  const reloadStore = reloadApi.getStore();
  const reloadSession = reloadApi.getOrCreateTodaySession({ persist: false });
  assert.strictEqual(reloadSession.sessionId, sessionId);
  assert.strictEqual(reloadSession.workoutDate, '2026-07-01');
  assert.strictEqual(reloadSession.selectedBackLiftKey, 'floorDead');
  assert.strictEqual(reloadSession.backVariantDrafts.halfDead.note, 'ハーフ下書き');
  assert.strictEqual(reloadSession.exercises.find(ex => ex.key === 'floorDead').note, 'デッド下書き');

  const discardHarness = createHarness({ initialStore: draftExport, forceLegacy: false, confirm: () => true });
  const discardStore = discardHarness.api.getStore();
  const lastBeforeDiscard = discardStore.currentState.lastCompletedBackLiftKey;
  assert.strictEqual(discardHarness.api.discardIncompleteTodaySession(), true);
  assert.strictEqual(Object.keys(discardStore.daySessions).length, 0);
  assert.strictEqual(discardStore.logs.length, 0);
  assert.strictEqual(discardStore.estimatedMaxHistory.length, 0);
  assert.strictEqual(discardStore.currentState.backCompletedCount, 0);
  assert.strictEqual(discardStore.currentState.lastCompletedBackLiftKey, lastBeforeDiscard);

  const cancelDiscard = createHarness({ initialStore: draftExport, forceLegacy: false, confirm: () => false });
  const cancelSession = cancelDiscard.api.getOrCreateTodaySession({ persist: false });
  assert.strictEqual(cancelDiscard.api.discardIncompleteTodaySession(), false);
  assert.strictEqual(cancelSession.selectedBackLiftKey, 'floorDead');
  assert.strictEqual(cancelSession.backVariantDrafts.halfDead.note, 'ハーフ下書き');
  assert.strictEqual(cancelSession.exercises.find(ex => ex.key === 'floorDead').note, 'デッド下書き');

  reloadSession.exercises.forEach(ex => ex.sets.forEach(set => {
    set.done = true;
    set.skipped = false;
    if (!set.reps) set.reps = ex.plannedReps;
  }));
  reloadSession.exercises.find(ex => ex.key === 'floorDead').rpe = '9.5';
  reloadApi.persistTodaySession(reloadSession);
  reloadApi.finishTodaySession();
  const mainLogs = reloadStore.logs.filter(log => log.sessionId === sessionId && String(log.menuType).startsWith('four-main-'));
  assert.strictEqual(mainLogs.length, 1);
  assert.strictEqual(mainLogs[0].exerciseKey, 'floorDead');
  assert.strictEqual(mainLogs[0].exerciseName, 'デッドリフト');
  assert.strictEqual(reloadStore.logs.some(log => log.sessionId === sessionId && log.exerciseKey === 'halfDead'), false);
  assert.strictEqual(reloadStore.currentState.lastCompletedBackLiftKey, 'floorDead');
  assert.strictEqual(reloadStore.currentState.backCompletedCount, 1);
  assert.strictEqual(reloadApi.getFourMenuBackLiftKey(reloadStore.currentState), 'halfDead');
  assert.ok(reloadStore.estimatedMaxHistory.some(entry => entry.liftKey === 'floorDead'));
  assert.strictEqual(reloadStore.estimatedMaxHistory.some(entry => entry.liftKey === 'halfDead'), false);
  const logCount = reloadStore.logs.length;
  const emaxCount = reloadStore.estimatedMaxHistory.length;
  reloadApi.finishTodaySession();
  assert.strictEqual(reloadStore.currentState.backCompletedCount, 1);
  assert.strictEqual(reloadStore.currentState.lastCompletedBackLiftKey, 'floorDead');
  assert.strictEqual(reloadStore.logs.length, logCount);
  assert.strictEqual(reloadStore.estimatedMaxHistory.length, emaxCount);
}

function testDeadliftDisplayAndLegacySearchCompatibility() {
  const isolated = createFourMenuHarness();
  const api = isolated.api;
  const store = api.getStore();
  const legacyFloorLog = {
    id: 'legacy-floor-name',
    date: '2026-07-02',
    fourMenuRotation: true,
    performedSplitKey: 'back',
    selectedSplitKey: 'back',
    exerciseKey: 'floorDead',
    exerciseName: '床引きデッド',
    menuType: 'four-main-floorDead',
    plannedWeight: 160,
    plannedReps: 5,
    plannedSets: 3,
    doneSets: 3,
    sets: [{ weight: 160, reps: 5, done: true }],
    rpe: '9',
    ts: 1,
  };
  store.logs = [legacyFloorLog];
  store.currentState.lastCompletedBackLiftKey = 'halfDead';
  assert.strictEqual(api.displayExerciseName('floorDead', '床引きデッド'), 'デッドリフト');
  assert.ok(api.renderDailyLogView().includes('デッドリフト'));
  assert.ok(!api.renderDailyLogView().includes('床引きデッド'));
  assert.ok(api.renderSettings().includes('デッドリフトMAX'));
  assert.ok(api.renderBlock().includes('デッドリフト'));
  api.setLogFilter({ query: 'デッドリフト' });
  assert.strictEqual(api.logMatchesFilter(legacyFloorLog), true);
  api.setLogFilter({ query: '床引きデッド' });
  assert.strictEqual(api.logMatchesFilter(legacyFloorLog), true);
  api.setLogFilter({ query: '' });
  assert.strictEqual(api.normalizeBig3Key('floorDead'), 'floorDead');
  assert.strictEqual(api.normalizeBig3Key('床引きデッド'), 'floorDead');
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
  // ヘッダーは #headerStatus の「B/R/Day」表示をやめ、部位名を出す共通ヘッダーになった。
  assert.ok(!/B\d+ \/ R\d+ \/ Day\d+/.test(isolated.elements.hdTitle.textContent || ''),
    'four-menu header must not fall back to legacy progress metadata');
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
  api.selectFourMenuForToday('back');
  const session = Object.values(store.daySessions).find(item => item.fourMenuRotation);
  assert.strictEqual(session.selectedSplitKey, 'back');
  session.exercises.forEach(ex => ex.sets.forEach(set => { set.done = true; }));
  api.finishTodaySession();
  assert.strictEqual(session.status, 'completed');
  assert.ok(session.completedAt);
  assert.strictEqual(store.currentState.backCompletedCount, 1);
  assert.strictEqual(store.currentState.nextMenuKey, 'shoulder_arm');
  const savedBackLogs = store.logs.filter(log => log.fourMenuRotation);
  assert.ok(savedBackLogs.length);
  assert.ok(savedBackLogs.every(log => log.block == null && log.rotation == null && log.day == null));

  api.finishTodaySession();
  assert.strictEqual(store.currentState.backCompletedCount, 1, 're-saving a completed session must not advance deadlift alternation');
  assert.strictEqual(store.currentState.nextMenuKey, 'shoulder_arm');
}

function testIncompleteWorkoutDraftPersistence() {
  const isolated = createFourMenuHarness();
  const api = isolated.api;
  const store = api.getStore();

  api.renderToday();
  assert.strictEqual(Object.keys(store.daySessions).length, 0, 'rendering alone must not persist an empty workout');
  assert.ok(api.selectFourMenuForToday('chest'));
  const session = Object.values(store.daySessions)[0];
  assert.ok(session.sessionId);
  assert.strictEqual(session.status, 'inProgress');
  assert.strictEqual(session.workoutType, 'chest');
  assert.strictEqual(session.workoutDate, session.date);

  const bench = session.exercises.find(ex => ex.key === 'bench');
  bench.sets[0] = { ...bench.sets[0], weight: 101.25, reps: 4, done: true };
  bench.rpe = '9';
  bench.note = '途中保存';
  assert.strictEqual(api.persistTodaySession(session), true);

  bench.note = 'pagehide保存';
  api.setupRestTimerLifecycleEvents();
  isolated.windowListeners.pagehide({ type: 'pagehide' });
  const pagehideSaved = JSON.parse(isolated.storage[STORAGE_KEY]);
  assert.strictEqual(pagehideSaved.daySessions[session.key].exercises.find(ex => ex.key === 'bench').note, 'pagehide保存');
  bench.note = '途中保存';
  api.persistTodaySession(session);

  const persisted = JSON.parse(isolated.storage[STORAGE_KEY]);
  const restoredHarness = createHarness({ initialStore: persisted, forceLegacy: false });
  const restoredApi = restoredHarness.api;
  const restoredStore = restoredApi.getStore();
  const restored = restoredStore.daySessions[session.key];
  assert.strictEqual(restored.sessionId, session.sessionId);
  assert.strictEqual(restored.exercises.find(ex => ex.key === 'bench').sets[0].weight, 101.25);
  assert.strictEqual(restored.exercises.find(ex => ex.key === 'bench').sets[0].reps, 4);
  assert.strictEqual(restored.exercises.find(ex => ex.key === 'bench').rpe, '9');
  assert.strictEqual(restored.exercises.find(ex => ex.key === 'bench').note, '途中保存');

  restored.date = '2026-07-01';
  restored.workoutDate = '2026-07-01';
  restored.performedDate = '2026-07-01';
  restored.updatedAt = Date.now();
  restoredApi.persistTodaySession(restored);
  assert.strictEqual(restoredApi.todaySessionKey(), session.key, 'an incomplete prior-date session must remain active');
  assert.ok(restoredApi.renderToday().includes('未完了トレーニングを復元しています'));

  const nextMenuBeforeDiscard = restoredStore.currentState.nextMenuKey;
  const logsBeforeDiscard = restoredStore.logs.length;
  assert.strictEqual(restoredApi.discardIncompleteTodaySession(), true);
  assert.strictEqual(restoredStore.daySessions[session.key], undefined);
  assert.strictEqual(restoredStore.logs.length, logsBeforeDiscard);
  assert.strictEqual(restoredStore.currentState.nextMenuKey, nextMenuBeforeDiscard);

  const cancelled = createHarness({ initialStore: persisted, forceLegacy: false, confirm: () => false });
  const cancelledSession = cancelled.api.getStore().daySessions[session.key];
  cancelledSession.date = '2026-07-01';
  cancelledSession.status = 'inProgress';
  cancelled.api.getStore().currentState.activeSessionKey = session.key;
  assert.strictEqual(cancelled.api.discardIncompleteTodaySession(), false);
  assert.ok(cancelled.api.getStore().daySessions[session.key], 'cancelling discard must preserve the draft');

  const failing = createHarness({ initialStore: persisted, forceLegacy: false });
  const failingStore = failing.api.getStore();
  const failingSession = failingStore.daySessions[session.key];
  failingStore.currentState.activeSessionKey = session.key;
  const logCountBeforeFailure = failingStore.logs.length;
  failing.setStorageFailure(true);
  failing.api.finishTodaySession();
  assert.strictEqual(failingSession.completed, false, 'failed persistence must not complete the draft');
  assert.strictEqual(failingStore.logs.length, logCountBeforeFailure, 'failed persistence must not create formal logs');
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
  assert.strictEqual(store.currentState.lastCompletedBackLiftKey, 'halfDead');
  assert.strictEqual(isolated.api.getFourMenuBackLiftKey(store.currentState), 'floorDead');
  const migratedAgain = isolated.api.migrateStoreData(store);
  assert.strictEqual(migratedAgain.currentState.lastCompletedBackLiftKey, 'halfDead');
  assert.strictEqual(isolated.api.getFourMenuBackLiftKey(migratedAgain.currentState), 'floorDead');
}

function testBackLiftMigrationUsesLatestCompletedLift() {
  const logs = [{
    id: 'old-half', sessionId: 'back-half', date: '2026-07-01', ts: 100,
    fourMenuRotation: true, performedSplitKey: 'back', exerciseKey: 'halfDead',
    menuType: 'four-main-halfDead', plannedSets: 3, doneSets: 3,
    sets: [{ weight: 180, reps: 5, done: true }],
  }, {
    id: 'new-floor', sessionId: 'back-floor', date: '2026-07-10', ts: 200,
    fourMenuRotation: true, performedSplitKey: 'back', exerciseKey: 'floorDead',
    exerciseName: '床引きデッド', menuType: 'four-main-floorDead', plannedSets: 3, doneSets: 3,
    sets: [{ weight: 160, reps: 5, done: true }],
  }, {
    id: 'new-floor-accessory', sessionId: 'back-floor', date: '2026-07-10', ts: 201,
    fourMenuRotation: true, performedSplitKey: 'back', exerciseKey: 'machine_row',
    menuType: 'four-accessory-row', plannedSets: 3, doneSets: 3,
    sets: [{ weight: 80, reps: 10, done: true }],
  }];
  const isolated = createHarness({
    initialStore: { settings: { programMode: 'fourMenu' }, currentState: { backCompletedCount: 2 }, logs },
    forceLegacy: false,
  });
  const store = isolated.api.getStore();
  assert.strictEqual(store.currentState.lastCompletedBackLiftKey, 'floorDead');
  assert.strictEqual(isolated.api.getFourMenuBackLiftKey(store.currentState), 'halfDead');
  assert.strictEqual(JSON.stringify(store.logs), JSON.stringify(logs), 'migration must not rewrite historical logs');
  const migratedAgain = isolated.api.migrateStoreData(store);
  assert.strictEqual(migratedAgain.currentState.lastCompletedBackLiftKey, 'floorDead');
  assert.strictEqual(isolated.api.getFourMenuBackLiftKey(migratedAgain.currentState), 'halfDead');
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
  const legacyRestLog = { id: 'legacy-rest-preserved', date: '2026-01-02', menuType: 'rest', isRest: true };
  const migrated = isolated.api.migrateStoreData({
    settings: { programMode: 'legacy8' },
    currentState: { nextMenuKey: 'rest', isRestSelected: true },
    logs: [legacyLog, legacyRestLog],
    estimatedMaxHistory: [estimated],
    maxTestResults: [maxTest],
  });
  assert.strictEqual(migrated.settings.programMode, 'fourMenu');
  assert.strictEqual(migrated.currentState.nextMenuKey, 'shoulder_arm');
  assert.strictEqual(migrated.currentState.isRestSelected, false);
  assert.strictEqual(JSON.stringify(migrated.logs[0]), JSON.stringify(legacyLog));
  assert.strictEqual(JSON.stringify(migrated.logs[1]), JSON.stringify(legacyRestLog));
  assert.strictEqual(JSON.stringify(migrated.estimatedMaxHistory[0]), JSON.stringify(estimated));
  assert.strictEqual(JSON.stringify(migrated.maxTestResults[0]), JSON.stringify(maxTest));
  assert.ok(migrated.settings.fourMenuAccessorySlots.chest.length);
  assert.ok(migrated.settings.fourMenuAccessorySlots.chest.every(slot => typeof slot.reps === 'number'));
  const migratedAgain = isolated.api.migrateStoreData(migrated);
  assert.strictEqual(migratedAgain.currentState.nextMenuKey, 'shoulder_arm');
  assert.strictEqual(migratedAgain.logs.filter(log => log.id === legacyRestLog.id).length, 1);
}

function testCustomWorkoutAndDraftSafety() {
  const h = createFourMenuHarness();
  const api = h.api;
  const store = api.getStore();
  api.renderToday();
  assert.ok(api.selectFourMenuForToday('custom'));
  let session = api.getOrCreateTodaySession();
  assert.strictEqual(session.selectedSplitKey, 'custom');
  assert.ok(session.exercises.some(ex => ex.key === 'bench'));
  assert.ok(session.exercises.some(ex => ex.key === 'halfDead'));
  const id = session.sessionId;
  const bench = session.exercises.find(ex => ex.key === 'bench');
  bench.sets[0].weight = 111;
  bench.note = 'keep input';
  api.persistTodaySession(session);
  api.selectFourMenuForToday('legs');
  api.selectFourMenuForToday('custom');
  session = api.getOrCreateTodaySession();
  assert.strictEqual(session.sessionId, id);
  assert.strictEqual(session.exercises.find(ex => ex.key === 'bench').sets[0].weight, 111);
  api.recalculateTodaySession();
  assert.strictEqual(session.exercises.find(ex => ex.key === 'bench').sets[0].weight, 111);
  const imported = createHarness({ initialStore: JSON.parse(h.storage[STORAGE_KEY]), forceLegacy: false });
  assert.strictEqual(imported.api.getOrCreateTodaySession().selectedSplitKey, 'custom');
  const next = store.currentState.nextMenuKey;
  const backCount = store.currentState.backCompletedCount;
  session.exercises.forEach(ex => ex.sets.forEach(set => { set.done = true; }));
  api.finishTodaySession();
  assert.strictEqual(store.currentState.nextMenuKey, next);
  assert.strictEqual(store.currentState.backCompletedCount, backCount);
  assert.ok(store.logs.every(log => log.performedSplitKey === 'custom'));
  assert.ok(api.renderDailyLogView().includes('カスタム'));
  assert.strictEqual(api.selectFourMenuForToday('chest'), false);
  const n = store.logs.length;
  api.finishTodaySession();
  assert.strictEqual(store.logs.length, n);
  assert.ok(api.getFourMenuMainPlan('bench', 'chest').weight > 0);
  const nextSession = api.startNewTodaySession();
  assert.notStrictEqual(nextSession.sessionId, id);
  assert.strictEqual(store.logs.length, n);
  assert.ok(api.selectFourMenuForToday('custom'));
}
function testCustomScopeAndFailedSave() {
  const h = createFourMenuHarness();
  const api = h.api;
  const store = api.getStore();
  api.renderToday();
  api.selectFourMenuForToday('custom');
  const session = api.getOrCreateTodaySession();
  const bench = session.exercises.find(ex => ex.key === 'bench');
  assert.strictEqual(bench.fourMenuKey, 'chest');
  const halfWeight = api.getFourMenuMainPlan('halfDead', 'back').weight;
  api.applyMainSetEdit(bench, { plannedWeight: 120, plannedReps: 5, plannedSets: 3 });
  api.saveMainSetOverride(bench.fourMenuKey, bench);
  assert.strictEqual(api.getFourMenuMainPlan('bench', 'chest').weight, 120);
  assert.strictEqual(api.getFourMenuMainPlan('halfDead', 'back').weight, halfWeight);
  api.addFourMenuAccessorySlot('custom', { key: 'custom-extra', name: 'カスタム補助', plannedSets: 2, reps: 10 });
  const migrated = api.migrateStoreData(JSON.parse(JSON.stringify(store)));
  assert.ok(migrated.settings.fourMenuAccessorySlots.custom.some(ex => ex.key === 'custom-extra'));
  assert.ok(!migrated.settings.fourMenuAccessorySlots.shoulder_arm.some(ex => ex.key === 'custom-extra'));
  h.setStorageFailure(true);
  assert.strictEqual(api.selectFourMenuForToday('legs'), false);
  assert.strictEqual(api.getOrCreateTodaySession().selectedSplitKey, 'custom');
  assert.strictEqual(api.getStore().logs.length, 0);
}
function testCustomReviewRegressions() {
  const { api } = createFourMenuHarness();
  const store = api.getStore();
  api.addFourMenuAccessorySlot('custom', { key: 'custom-pause', name: '休止テスト', plannedSets: 2, reps: 10, plannedWeight: 20 });
  store.settings.exerciseRestSettings = [{ id: 'pause', name: '休止', parts: [], exercises: ['custom-pause'], startDate: '2000-01-01', endDate: '2099-12-31' }];
  const menu = api.buildFourMenu('custom');
  assert.ok(!menu.exercises.some(ex => ex.key === 'custom-pause'));
  assert.ok(menu.skippedRestExercises.some(ex => ex.key === 'custom-pause'));
  api.selectFourMenuForToday('custom');
  const session = api.getOrCreateTodaySession();
  const accessory = session.exercises.find(ex => ex.isAccessory && ex.fourMenuKey === 'chest' && ex.weightType !== 'bodyweight');
  const before = accessory.plannedWeight;
  accessory.sets.forEach(s => { s.done = true; s.reps = accessory.plannedReps; });
  assert.strictEqual(api.applyAccessoryProgressionCandidate(session, accessory), true);
  assert.ok(store.settings.fourMenuAccessorySlots.chest.find(s => s.slotId === accessory.slotId).plannedWeight > before);
  assert.ok(!store.settings.fourMenuAccessorySlots.custom.some(s => s.slotId === accessory.slotId));

  const bench = session.exercises.find(ex => ex.key === 'bench');
  api.saveMainSetOverride('chest', { ...bench, plannedWeight: 120, plannedReps: 4, plannedSets: 2 });
  api.recalculateTodaySession();
  let updated = session.exercises.find(ex => ex.key === 'bench');
  assert.strictEqual(updated.plannedWeight, 120);
  assert.strictEqual(updated.sets.length, 2);
  assert.ok(updated.sets.every(s => s.weight === 120 && s.reps === 4));
  updated.sets[0].weight = 112.5;
  const recorded = JSON.stringify(updated);
  api.saveMainSetOverride('chest', { ...updated, plannedWeight: 125 });
  api.recalculateTodaySession();
  assert.strictEqual(JSON.stringify(session.exercises.find(ex => ex.key === 'bench')), recorded);
}
testCustomReviewRegressions();
testCustomScopeAndFailedSave();
testCustomWorkoutAndDraftSafety();
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
testEstimatedMaxOrderingAndConsistency();
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
testDataProtectionAndProgressionImprovements();
testRecoveryAndSessionIdentity();
testPreviousSummaryAccessoryCandidateAndAnalytics();
testFourMenuSessionSelectionAndDeadliftAlternation();
testManualBackLiftVariantSwitchAndPersistence();
testDeadliftDisplayAndLegacySearchCompatibility();
testFourMenuLogRenderingAndOverrideScope();
testFourMenuAccessoryTemplatesAndPlanActions();
testFourMenuMainIdentityAndCompletionIdempotency();
testIncompleteWorkoutDraftPersistence();
testFourMenuStateMigrationAliasesAndBackCount();
testBackLiftMigrationUsesLatestCompletedLift();
testImportMigrationPreservesLegacyAndMaxData();
testMaxUpdateAndRotationProgressionAreCapped();
testBodyWeightAndVolumeTrend();
testVolumeTrendComparesEqualPeriods();
testMaxTabShowsEachNumberOnce();
testPrCountsOnlyEarlierSessions();
testMigrationFixesContainerTypes();
testDeloadAccessoryAndMaxTestTiming();
testFutureMainSetOverride();
testAdaptiveR4ProposalAndSelection();
testLogDailyAndMonthlyViews();
testFloorDeadDayUsesBulgarianInsteadOfSquat();
testExerciseRestSettings();
testRotationFlowAndMaxRecordsFromSession();

assert.ok(h.storage[STORAGE_KEY], 'store should be persisted');
console.log('test_progression.js: all tests passed');
