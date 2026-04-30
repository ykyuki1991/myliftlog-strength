/* ==========================================================================
   MyLiftLog Strength Planner - app.js
   ========================================================================== */

'use strict';

// ===== 定数 =====
const STORAGE_KEY = 'mll_strength_planner_v1';
const APP_VERSION = '1.0.0';

const DEFAULT_SETTINGS = {
  maxes: {
    bench: 115,
    squat: 160,
    halfDead: 190,
    // 床引きデッドはユーザーが過去にハードにやっていない種目。技術練習・補助的位置づけのため初期値170kg固定。
    floorDead: 170,
  },
  increment: 2.5,
  // 'standard' = 通常ボリューム / 'high' = 補助種目と一部メインセットを増量した高ボリュームモード
  trainingVolumeMode: 'high',
  // 'standard' = 安全寄りメイン強度 / 'highIntensity' = 過去実績に近い高強度メイン
  strengthMode: 'highIntensity',
  // 補助種目の初期重量・回数・セット数。重量は固定値。MAX計算なし。
  accessoryDefaults: {
    incline_db:  { weight: 38,  reps: '8〜10',  sets: 4 },
    dips:        { weight: 90,  reps: '8〜10',  sets: 4, note: '自重込み目安' },
    shoulder:    { weight: 60,  reps: '8〜10',  sets: 4 },
    lying_ext:   { weight: 30,  reps: '8〜10',  sets: 3 },
    preacher:    { weight: 14,  reps: '8〜10',  sets: 3 },
    legpress:    { weight: 240, reps: '10',    sets: 4 },
    hack_squat:  { weight: 192, reps: '10〜12', sets: 4 },
    calf:        { weight: 120, reps: '12〜20', sets: 4 },
    latpulldown: { weight: 86,  reps: '8〜12',  sets: 4 },
    machine_row: { weight: 160, reps: '10',    sets: 4 },
    seated_row:  { weight: 77,  reps: '10',    sets: 2 },
    pec_fly:     { weight: 70,  reps: '8〜12',  sets: 3 },
    rear_raise:  { weight: 57,  reps: '8〜12',  sets: 3 },
  },
  accessoryManagementMode: 'aggressive',
  accessorySlots: null,
};

// 補助種目キー → 表示名（設定画面の補助重量編集UI、フォールバック用）
const ACCESSORY_DISPLAY_NAMES = {
  incline_db: 'インクラインDBプレス',
  dips: 'ディップス',
  shoulder: 'ショルダープレス',
  lying_ext: 'ライイングエクステンション',
  preacher: 'ワンハンドDBプリーチャーカール',
  legpress: 'レッグプレス',
  hack_squat: 'ハックスクワット',
  calf: 'カーフレイズ',
  latpulldown: 'ラットプルダウン',
  machine_row: 'マシンロー',
  seated_row: 'シーテッドロー',
  pec_fly: 'ペックフライ',
  rear_raise: 'リアレイズ',
  row: 'ロウ系',
  chinning: 'チンニング',
};

const DEFAULT_STATE = {
  block: 1,
  rotation: 1,  // 1〜4
  day: 1,       // 1〜8
  lastTrainingDate: null,
};

// 種目キー（記録/調整用に使う識別子）
// ベース種目（重量自動計算）
const BIG3_LIFTS = {
  squat: 'スクワット',
  bench: 'ベンチプレス',
  halfDead: 'ハーフデッド',
  floorDead: '床引きデッド',
};

// メニュー種別キー（manualAdjustments のキー）
// 例: "Day1-squat-heavy-top", "Day1-squat-heavy-backoff"

// レスト時間（秒）
const REST_TIME_SEC = {
  big3_top: 300,
  big3_backoff: 240,
  bench_volume: 180,
  squat_dead_volume: 240,
  incline_db: 150,
  dips: 150,
  chinning: 150,
  row: 150,
  shoulder: 150,
  arm: 90,
  calf: 90,
  default: 120,
};

// 痛み選択肢
const PAIN_OPTIONS = ['なし', '肘', '肩', '腰', '膝', 'その他'];

// RPE選択肢
const RPE_OPTIONS = ['未入力', '6', '7', '8', '9', '10'];

const ACCESSORY_CATEGORIES = [
  '胸', '背中', '肩', '腕', '脚前側', '脚後側', 'カーフ',
  'ベンチ系プレス', 'デッド・腰背部負荷', '肩プレス系',
  'チンニング系', 'ロウ系', '脚補助',
];

const ACCESSORY_FATIGUE_TAGS = [
  '肘負荷', '肩負荷', '腰負荷', '膝負荷', '握力負荷', '低リスク', '腰に優しい',
];

const ACCESSORY_MANAGEMENT_MODES = {
  standard: '標準',
  aggressive: '攻める',
  fatigue: '疲労管理',
};

const ACCESSORY_LOAD_LIMITS = {
  'ベンチ系プレス': { caution: 25, danger: 30 },
  '背中': { caution: 22, danger: 28 },
  '脚前側': { caution: 18, danger: 24 },
  'デッド・腰背部負荷': { caution: 12, danger: 16 },
  '腕': { caution: 14, danger: 18 },
  '肩プレス系': { caution: 8, danger: 12 },
  'カーフ': { caution: 16, danger: 22 },
};

const ACCESSORY_SUMMARY_KEYS = [
  '胸', '背中', '肩', '腕', '脚前側', '脚後側', 'カーフ',
  'ベンチ系プレス', 'デッド・腰背部負荷',
  '肘負荷', '肩負荷', '腰負荷', '膝負荷',
];

const DEFAULT_ACCESSORY_SLOTS = {
  1: [
    { slotId: 'd1-quad', slotName: '脚前側補助', key: 'legpress', name: 'レッグプレス', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8', categories: ['脚前側', '脚補助'], fatigueTags: ['膝負荷'], weightType: 'leg_machine', restType: 'default' },
    { slotId: 'd1-calf', slotName: 'カーフ', key: 'calf', name: 'カーフレイズ', setsText: '3〜4', plannedSets: 4, reps: '12〜20', targetRpe: '8〜9', categories: ['カーフ'], fatigueTags: ['低リスク'], weightType: 'calf', restType: 'calf' },
  ],
  2: [
    { slotId: 'd2-chest', slotName: '胸補助', key: 'incline_db', name: 'インクラインDBプレス', setsText: '3', plannedSets: 3, reps: '8〜10', targetRpe: '8〜9', categories: ['胸', 'ベンチ系プレス'], fatigueTags: ['肩負荷'], weightType: 'dumbbell', restType: 'incline_db' },
    { slotId: 'd2-back-chin', slotName: '背中', key: 'chinning', name: 'チンニング', setsText: '3', plannedSets: 3, reps: '5〜8', targetRpe: '8', categories: ['背中', 'チンニング系'], fatigueTags: ['肘負荷', '握力負荷'], weightType: 'bodyweight', restType: 'chinning' },
    { slotId: 'd2-back-row', slotName: '背中', key: 'row', name: 'ロウ系', setsText: '3', plannedSets: 3, reps: '8〜12', targetRpe: '8〜9', categories: ['背中', 'ロウ系'], fatigueTags: ['握力負荷'], weightType: 'upper_machine', restType: 'row' },
    { slotId: 'd2-arm-curl', slotName: '腕', key: 'preacher', name: 'ワンハンドDBプリーチャーカール', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'arm', restType: 'arm' },
    { slotId: 'd2-arm-ext', slotName: '腕', key: 'lying_ext', name: 'ライイングエクステンション', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'arm', restType: 'arm' },
  ],
  3: [
    { slotId: 'd3-shoulder', slotName: '肩', key: 'shoulder', name: 'ショルダープレス', setsText: '2〜3', plannedSets: 3, reps: '5〜8', targetRpe: '7〜8', categories: ['肩', '肩プレス系'], fatigueTags: ['肩負荷'], weightType: 'upper_machine', restType: 'shoulder' },
    { slotId: 'd3-back-friendly', slotName: '腰に優しい背中', key: 'friendly_row', name: '腰に優しいロウ系', setsText: '2〜3', plannedSets: 3, reps: '8〜10', targetRpe: '8', categories: ['背中', 'ロウ系'], fatigueTags: ['腰に優しい', '低リスク'], weightType: 'upper_machine', restType: 'row' },
    { slotId: 'd3-calf', slotName: 'カーフ', key: 'calf', name: 'カーフレイズ', setsText: '3', plannedSets: 3, reps: '12〜20', targetRpe: '8〜9', categories: ['カーフ'], fatigueTags: ['低リスク'], weightType: 'calf', restType: 'calf' },
  ],
  5: [
    { slotId: 'd5-quad', slotName: '脚前側補助', key: 'hack_squat', name: 'ハックスクワット', setsText: '2〜3', plannedSets: 3, reps: '8〜10', targetRpe: '8', categories: ['脚前側', '脚補助'], fatigueTags: ['膝負荷'], weightType: 'leg_machine', restType: 'default' },
    { slotId: 'd5-calf', slotName: 'カーフ', key: 'calf', name: 'カーフレイズ', setsText: '3〜4', plannedSets: 4, reps: '12〜20', targetRpe: '8〜9', categories: ['カーフ'], fatigueTags: ['低リスク'], weightType: 'calf', restType: 'calf' },
  ],
  6: [
    { slotId: 'd6-chest-tri', slotName: '胸・三頭補助', key: 'dips', name: 'ディップス', setsText: '2〜3', plannedSets: 3, reps: '6〜10', targetRpe: '8〜9', categories: ['胸', '腕', 'ベンチ系プレス'], fatigueTags: ['肩負荷', '肘負荷'], weightType: 'bodyweight', restType: 'dips' },
    { slotId: 'd6-back-chin', slotName: '背中', key: 'chinning', name: 'チンニング', setsText: '2', plannedSets: 2, reps: '5〜8', targetRpe: '8', categories: ['背中', 'チンニング系'], fatigueTags: ['肘負荷', '握力負荷'], weightType: 'bodyweight', restType: 'chinning' },
    { slotId: 'd6-back-row', slotName: '背中', key: 'row', name: 'ロウ系', setsText: '3', plannedSets: 3, reps: '8〜12', targetRpe: '8〜9', categories: ['背中', 'ロウ系'], fatigueTags: ['握力負荷'], weightType: 'upper_machine', restType: 'row' },
    { slotId: 'd6-arm-curl', slotName: '腕', key: 'preacher', name: 'ワンハンドDBプリーチャーカール', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'arm', restType: 'arm' },
    { slotId: 'd6-arm-ext', slotName: '腕', key: 'lying_ext', name: 'ライイングエクステンション', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'arm', restType: 'arm' },
  ],
  7: [
    { slotId: 'd7-back-friendly', slotName: '腰に優しい背中', key: 'friendly_row', name: '腰に優しいロウ系', setsText: '2', plannedSets: 2, reps: '8〜12', targetRpe: '8', categories: ['背中', 'ロウ系'], fatigueTags: ['腰に優しい', '低リスク'], weightType: 'upper_machine', restType: 'row' },
    { slotId: 'd7-chin', slotName: 'チンニング', key: 'chinning', name: 'チンニング', setsText: '2', plannedSets: 2, reps: '5〜8', targetRpe: '8', categories: ['背中', 'チンニング系'], fatigueTags: ['肘負荷', '握力負荷'], weightType: 'bodyweight', restType: 'chinning' },
    { slotId: 'd7-calf', slotName: 'カーフ', key: 'calf', name: 'カーフレイズ', setsText: '3', plannedSets: 3, reps: '12〜20', targetRpe: '8〜9', categories: ['カーフ'], fatigueTags: ['低リスク'], weightType: 'calf', restType: 'calf' },
  ],
};

// ===== ストア =====
let store = loadStore();

function defaultStore() {
  return {
    version: APP_VERSION,
    settings: { ...deepClone(DEFAULT_SETTINGS), accessorySlots: defaultAccessorySlots() },
    currentState: deepClone(DEFAULT_STATE),
    logs: [],                // {id, date, day, block, rotation, exerciseKey, exerciseName, menuType, plannedWeight, plannedReps, plannedSets, sets:[{w,r,done}], rpe, pains:[], note, manualAdjusted, ts}
    manualAdjustments: {},   // key: "Day-exerciseKey-menuType" → kg差分
    blockSuggestions: [],    // 過去の提案履歴
    daySessions: {},         // key: "YYYY-MM-DD" → セッションデータ
    restTimerState: null,     // {restStartedAt, restDurationSec, restEndAt, running, targetName, alertedAt}
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw);
    // マージ
    const def = defaultStore();
    // accessoryDefaults はキーごとに深くマージ（既存ユーザーキーは保持、新規キーは追加）
    const mergedAccDefaults = { ...def.settings.accessoryDefaults };
    const userAccDefaults = parsed.settings?.accessoryDefaults || {};
    for (const k of Object.keys(userAccDefaults)) {
      mergedAccDefaults[k] = { ...(mergedAccDefaults[k] || {}), ...userAccDefaults[k] };
    }
    const mergedAccessorySlots = mergeAccessorySlots(parsed.settings?.accessorySlots);
    return {
      ...def,
      ...parsed,
      settings: {
        ...def.settings,
        ...(parsed.settings || {}),
        maxes: { ...def.settings.maxes, ...(parsed.settings?.maxes || {}) },
        accessoryDefaults: mergedAccDefaults,
        accessoryManagementMode: parsed.settings?.accessoryManagementMode || def.settings.accessoryManagementMode,
        accessorySlots: mergedAccessorySlots,
      },
      currentState: { ...def.currentState, ...(parsed.currentState || {}) },
    };
  } catch (e) {
    console.error('load error', e);
    return defaultStore();
  }
}

function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.error('save error', e);
    showToast('保存エラー: ' + e.message);
  }
}

// ===== ユーティリティ =====
function deepClone(obj) {
  // 単純なJSONオブジェクト用の安全なディープコピー（structuredClone非対応環境向けの代替）
  return JSON.parse(JSON.stringify(obj));
}

function defaultAccessorySlots() {
  return deepClone(DEFAULT_ACCESSORY_SLOTS);
}

function mergeAccessorySlots(userSlots) {
  const slots = defaultAccessorySlots();
  if (!userSlots || typeof userSlots !== 'object') return slots;
  for (const day of Object.keys(userSlots)) {
    if (Array.isArray(userSlots[day])) {
      slots[day] = userSlots[day].map(normalizeAccessorySlot).filter(Boolean);
    }
  }
  return slots;
}

function normalizeList(value, allowed = null) {
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(/[,\n、]/);
  const cleaned = list.map(v => String(v).trim()).filter(Boolean);
  return allowed ? cleaned.filter(v => allowed.includes(v)) : cleaned;
}

function parseRangeMax(value, fallback = 1) {
  const nums = String(value ?? '').match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return fallback;
  return Math.max(...nums.map(Number));
}

function parseRpeValue(value) {
  const nums = String(value || '').match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  return Math.max(...nums.map(Number));
}

function accessoryKeyFromName(name) {
  return String(name || 'accessory').trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '')
    .slice(0, 32) || `accessory_${uid()}`;
}

function normalizeAccessorySlot(slot) {
  if (!slot || typeof slot !== 'object') return null;
  const slotId = slot.slotId || `slot_${uid()}`;
  const plannedSets = Math.max(0, parseInt(slot.plannedSets ?? parseRangeMax(slot.setsText, 3), 10) || 0);
  return {
    slotId,
    slotName: slot.slotName || '補助スロット',
    key: slot.key || accessoryKeyFromName(slot.name),
    name: slot.name || '補助種目',
    setsText: slot.setsText || String(plannedSets || 1),
    plannedSets: plannedSets || 1,
    reps: slot.reps || '8〜12',
    targetRpe: slot.targetRpe || '8',
    categories: normalizeList(slot.categories, ACCESSORY_CATEGORIES),
    fatigueTags: normalizeList(slot.fatigueTags, ACCESSORY_FATIGUE_TAGS),
    weightType: slot.weightType || inferAccessoryWeightType(slot),
    restType: slot.restType || 'default',
  };
}

function inferAccessoryWeightType(slot) {
  const name = slot?.name || '';
  const cats = normalizeList(slot?.categories);
  if (cats.includes('カーフ')) return 'calf';
  if (cats.includes('脚前側') || cats.includes('脚補助')) return 'leg_machine';
  if (cats.includes('チンニング系') || name.includes('チンニング') || name.includes('ディップス')) return 'bodyweight';
  if (cats.includes('腕') || name.includes('カール') || name.includes('エクステンション')) return 'arm';
  if (name.includes('DB') || name.includes('ダンベル')) return 'dumbbell';
  return 'upper_machine';
}

function getAccessorySlotsForDay(day, settings = store.settings) {
  const source = settings.accessorySlots || defaultAccessorySlots();
  return (source[String(day)] || source[day] || []).map(normalizeAccessorySlot).filter(Boolean);
}

function buildAccessoryExercises(day, settings, isDeload) {
  const accDefaults = settings.accessoryDefaults || {};
  return getAccessorySlotsForDay(day, settings).map(slot => {
    const def = accDefaults[slot.key] || {};
    const plannedSets = isDeload ? Math.max(1, Math.ceil(slot.plannedSets / 2)) : slot.plannedSets;
    const plannedReps = def.reps != null ? def.reps : slot.reps;
    return {
      key: slot.key,
      name: slot.name,
      menuType: `accessory-${slot.slotId}`,
      plannedWeight: def.weight != null ? def.weight : null,
      plannedReps,
      plannedSets,
      setsText: slot.setsText,
      targetRpe: slot.targetRpe,
      categories: [...slot.categories],
      fatigueTags: [...slot.fatigueTags],
      slotId: slot.slotId,
      slotName: slot.slotName,
      weightType: slot.weightType,
      restSec: REST_TIME_SEC[slot.restType] || REST_TIME_SEC.default,
      isAccessory: true,
    };
  });
}

function getEightDayAccessoryPlan(settings = store.settings) {
  const plan = [];
  for (let day = 1; day <= 8; day++) {
    const isDeload = false;
    for (const ex of buildAccessoryExercises(day, settings, isDeload)) {
      plan.push({ day, ...ex });
    }
  }
  return plan;
}

function summarizeAccessoryLoad(settings = store.settings) {
  const summary = {};
  ACCESSORY_SUMMARY_KEYS.forEach(k => { summary[k] = 0; });
  getEightDayAccessoryPlan(settings).forEach(ex => {
    const sets = parseInt(ex.plannedSets, 10) || 0;
    [...(ex.categories || []), ...(ex.fatigueTags || [])].forEach(tag => {
      if (Object.prototype.hasOwnProperty.call(summary, tag)) summary[tag] += sets;
    });
  });
  return summary;
}

function getAccessoryLoadWarnings(settings = store.settings) {
  const plan = getEightDayAccessoryPlan(settings);
  const summary = summarizeAccessoryLoad(settings);
  const warnings = [];
  Object.entries(ACCESSORY_LOAD_LIMITS).forEach(([key, limit]) => {
    const value = summary[key] || 0;
    if (value >= limit.danger) warnings.push({ level: 'danger', message: `${key} が危険ライン (${value}/${limit.danger}セット) です。関連補助のセット削減を検討してください。` });
    else if (value >= limit.caution) warnings.push({ level: 'caution', message: `${key} が注意ライン (${value}/${limit.caution}セット) です。疲労や痛みを見ながら進めてください。` });
  });
  if ((summary['背中'] || 0) < 10) warnings.push({ level: 'caution', message: `背中系が8日で10セット未満です (${summary['背中'] || 0}セット)。ベンチ・デッドの安定のため追加を検討してください。` });
  if (!plan.some(ex => ex.categories.includes('脚補助'))) warnings.push({ level: 'caution', message: '脚補助がゼロです。スクワット補助として脚前側/脚後側の追加を検討してください。' });
  if (!plan.some(ex => ex.categories.includes('肩'))) warnings.push({ level: 'caution', message: '肩補助がゼロです。肩の耐性作りとして低リスク種目の追加を検討してください。' });
  if (!plan.some(ex => ex.categories.includes('腕'))) warnings.push({ level: 'caution', message: '腕補助がゼロです。肘の状態を見ながら最小限の腕補助を検討してください。' });
  if (!plan.some(ex => ex.categories.includes('背中') && ex.fatigueTags.includes('腰に優しい'))) warnings.push({ level: 'caution', message: '腰に優しい背中種目がゼロです。Day3/Day7に腰に優しいロウ系を入れると疲労干渉を抑えやすくなります。' });
  plan.filter(ex => (ex.day === 3 || ex.day === 7) && ex.categories.includes('ロウ系') && ex.fatigueTags.includes('腰負荷'))
    .forEach(ex => warnings.push({ level: 'caution', message: `Day${ex.day} の ${ex.name} に腰負荷タグがあります。腰に優しい背中種目への変更を検討してください。` }));
  return warnings;
}

function getRepUpperBound(reps) {
  return parseRangeMax(reps, 0);
}

function allDoneSetsHitUpper(ex) {
  const upper = getRepUpperBound(ex.plannedReps);
  const done = (ex.sets || []).filter(s => s.done);
  return upper > 0 && done.length >= (parseInt(ex.plannedSets, 10) || 1) && done.every(s => (parseInt(s.reps, 10) || 0) >= upper);
}

function hasPain(ex) {
  return (ex.pains || []).some(p => p && p !== 'なし');
}

function weightStepText(weightType) {
  switch (weightType) {
    case 'dumbbell': return '片手+1〜2kg';
    case 'leg_machine': return '+5〜10kg';
    case 'bodyweight': return '上限回数達成後に+2.5kg加重';
    case 'arm': return '+1〜2kg';
    case 'calf': return '+5kg or 回数増';
    default: return '+2.5〜5kg';
  }
}

function classifyAccessoryLog(log) {
  if (!log || !String(log.menuType || '').startsWith('accessory')) return null;
  const rpe = parseRpeValue(log.rpe);
  const upper = getRepUpperBound(log.plannedReps);
  const done = (log.sets || []).filter(s => s.done);
  const allDone = done.length >= (parseInt(log.plannedSets, 10) || 1);
  const hitUpper = upper > 0 && allDone && done.every(s => (parseInt(s.reps, 10) || 0) >= upper);
  const painful = (log.pains || []).some(p => p && p !== 'なし');
  if (painful) return 'pain';
  if (hitUpper && rpe != null && rpe <= 8) return 'easy';
  if (hitUpper && rpe === 9) return 'ok';
  if (!allDone || (rpe != null && rpe >= 9.5)) return 'heavy';
  return 'ok';
}

function getRecentAccessoryLogs(ex, limit = 2) {
  return [...store.logs]
    .filter(l => l.exerciseKey === ex.key && String(l.menuType || '').startsWith('accessory'))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

function suggestAccessoryProgression(ex, mode = store.settings.accessoryManagementMode || 'aggressive') {
  if (!ex?.isAccessory) return '';
  const rpe = parseRpeValue(ex.rpe);
  const painful = hasPain(ex);
  const hitUpper = allDoneSetsHitUpper(ex);
  const doneCount = (ex.sets || []).filter(s => s.done).length;
  const expectedSets = parseInt(ex.plannedSets, 10) || 1;
  const failed = doneCount < expectedSets;
  const recentClass = getRecentAccessoryLogs(ex, 2).map(classifyAccessoryLog);
  const twoEasy = recentClass.length >= 2 && recentClass.every(v => v === 'easy');
  const twoHeavy = recentClass.length >= 2 && recentClass.every(v => v === 'heavy');

  if (painful) return `痛みあり: 重量据え置き、1セット削減、または ${ex.fatigueTags?.join('・') || '関連タグ'} の少ない種目変更を提案`;
  if (mode === 'aggressive') {
    if (hitUpper && rpe != null && rpe <= 7) return `軽すぎ: ${weightStepText(ex.weightType)} か1セット追加を提案`;
    if (hitUpper && rpe != null && rpe >= 8 && rpe <= 9) return '適正: この負荷を継続';
    if ((rpe != null && rpe >= 9.5) || failed) return '攻めすぎ: 関連補助を1セット削減、または据え置きを提案';
  }
  if (twoEasy) return `2回連続で楽: ${weightStepText(ex.weightType)} か1セット追加を提案`;
  if (twoHeavy) return '2回連続で重い: 1セット削減を提案';
  if (hitUpper && rpe != null && rpe <= 8) return `次回重量アップ: ${weightStepText(ex.weightType)} を提案`;
  if (hitUpper && rpe === 9) return '据え置き: 上限回数達成だがRPE9';
  if (failed && rpe != null && rpe >= 9) return '据え置き or セット減: 回数未達かつ高RPE';
  return '記録後に前回実績・RPE・痛みから提案します';
}

function roundToIncrement(weight, increment = 2.5) {
  if (!weight || isNaN(weight)) return 0;
  return Math.round(weight / increment) * increment;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(s) {
  return s;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

let nowProvider = () => Date.now();

function nowMs() {
  return nowProvider();
}

function showToast(msg, ms = 2000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), ms);
}

function openModal(title, bodyHtml, onMount) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modal').classList.remove('hidden');
  if (onMount) onMount();
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

// ===== メニュー定義 =====
// パーセンテージは、各ローテ/メニュー種別ごとに設定
// 補助種目は重量計算なし（reps/sets のみ）
function getDayMenu(day, rotation, settings) {
  const M = settings.maxes;
  const inc = settings.increment;
  const r = rotation;
  const isDeload = r === 4;
  const volumeMode = settings.trainingVolumeMode || 'high';
  const isHigh = volumeMode === 'high';
  const strengthMode = settings.strengthMode || 'highIntensity';
  const isHighIntensity = strengthMode === 'highIntensity';
  const accDefaults = settings.accessoryDefaults || {};

  // パーセンテージ取得（1ローテ=index0, 2ローテ=index1, 3ローテ=index2）
  const pick = (arr) => arr[Math.min(r - 1, 2)];

  // 補助種目共通定義
  // standardSets: 標準モードのセット数
  // highSets: 高ボリュームモードのセット数（null の場合は standardSets を使う）
  // deloadSets: R4デロードのセット数（null の場合は standardSets/2 切り上げ）
  // ※ R4デロードは両モードとも標準モードのセット数を基に計算（モードによる差を出さない）
  // 補助種目の重量・回数は accessoryDefaults から取得（設定可能）。
  // 引数の reps は accessoryDefaults に reps が無い場合のフォールバック。
  const accessoryWith = (key, name, reps, standardSets, restType, deloadSets = null, highSets = null) => {
    let sets;
    if (isDeload) {
      sets = deloadSets || Math.max(1, Math.ceil(standardSets / 2));
    } else if (isHigh && highSets != null) {
      sets = highSets;
    } else {
      sets = standardSets;
    }
    const def = accDefaults[key] || {};
    const plannedWeight = (def.weight != null) ? def.weight : null;
    const plannedReps = (def.reps != null) ? def.reps : reps;
    return {
      key, name,
      menuType: 'accessory',
      plannedWeight,
      plannedReps,
      plannedSets: sets,
      restSec: REST_TIME_SEC[restType] || REST_TIME_SEC.default,
      isAccessory: true,
    };
  };

  // 高強度モード用：BIG3メイン × 3セット (パーセンテージ × reps × sets を1メニューで表現)
  // R4デロードのときは呼ばれない想定（呼ばれた場合は通常のbenchByPctロジックでデロード処理）
  const hiMainSets = (key, name, max, pcts, reps, sets, menuType, restType) => {
    const pct = pick(pcts);
    return {
      key, name,
      menuType,
      plannedWeight: roundToIncrement(max * pct / 100, inc),
      plannedReps: reps,
      plannedSets: sets,
      pctNote: `${pct}%`,
      restSec: REST_TIME_SEC[restType] || REST_TIME_SEC.default,
      isBig3: true,
    };
  };

  // BIG3トップシングル
  const topSingle = (key, name, max, pcts, menuType) => {
    if (isDeload) return null;
    const pct = pick(pcts);
    return {
      key, name,
      menuType,
      plannedWeight: roundToIncrement(max * pct / 100, inc),
      plannedReps: 1,
      plannedSets: 1,
      pctNote: `${pct}%`,
      restSec: REST_TIME_SEC.big3_top,
      isBig3: true,
    };
  };

  // BIG3バックオフ
  const backoff = (key, name, max, pcts, repsArr, setsArr, menuType) => {
    let pct, reps, sets;
    if (isDeload) {
      pct = 65;
      reps = 3;
      sets = 2;
    } else {
      pct = pick(pcts);
      reps = pick(repsArr);
      sets = pick(setsArr);
    }
    return {
      key, name,
      menuType,
      plannedWeight: roundToIncrement(max * pct / 100, inc),
      plannedReps: reps,
      plannedSets: sets,
      pctNote: `${pct}%`,
      restSec: menuType.includes('volume') ? REST_TIME_SEC.bench_volume : REST_TIME_SEC.big3_backoff,
      isBig3: true,
    };
  };

  // ベンチボリューム/中重量/軽め系
  const benchByPct = (key, name, max, pcts, repsArr, setsArr, menuType, restType) => {
    let pct, reps, sets;
    if (isDeload) {
      pct = 65;
      reps = 3;
      sets = 2;
    } else {
      pct = pick(pcts);
      reps = pick(repsArr);
      sets = pick(setsArr);
    }
    return {
      key, name,
      menuType,
      plannedWeight: roundToIncrement(max * pct / 100, inc),
      plannedReps: reps,
      plannedSets: sets,
      pctNote: `${pct}%`,
      restSec: REST_TIME_SEC[restType] || REST_TIME_SEC.default,
      isBig3: true,
    };
  };

  let exercises = [];
  let dayName = '';

  switch (day) {
    case 1: {
      dayName = 'Day1: スクワット重め / ベンチボリューム';
      if (isHighIntensity && !isDeload) {
        // 高強度モード: トップシングル+バックオフを 85.0/86.25/87.5% × 5回 × 3セット に置換
        exercises.push(hiMainSets('squat', 'スクワット（高強度メイン）', M.squat,
          [85.0, 86.25, 87.5], 5, 3, 'squat-hi-main', 'squat_dead_volume'));
      } else {
        const sq = topSingle('squat', 'スクワット（トップシングル）', M.squat,
          [87.5, 89.0, 90.6], 'squat-heavy-top');
        if (sq) exercises.push(sq);
        exercises.push(backoff('squat', 'スクワット（バックオフ）', M.squat,
          [79.7, 81.3, 82.8], [3, 3, 3], [4, 4, 3], 'squat-heavy-backoff'));
      }
      exercises.push(benchByPct('bench', 'ベンチプレス（ボリューム）', M.bench,
        [71.7, 73.9, 76.1], [5, 5, 5], [5, 5, 5], 'bench-volume', 'bench_volume'));
      exercises.push(accessoryWith('legpress', 'レッグプレス', '8〜12', 3, 'default', null, 4));
      exercises.push(accessoryWith('calf', 'カーフレイズ', '12〜20', 4, 'calf'));
      break;
    }
    case 2: {
      dayName = 'Day2: ベンチ重め';
      if (isHighIntensity && !isDeload) {
        // 高強度モード: トップシングル+バックオフを 85.0/87.0/89.0% × 5回 × 3セット に置換
        exercises.push(hiMainSets('bench', 'ベンチプレス（高強度メイン）', M.bench,
          [85.0, 87.0, 89.0], 5, 3, 'bench-hi-main', 'bench_volume'));
        // 高強度モード補助: チンニング / マシンロー / プリーチャー / ライイングエクステンション
        exercises.push(accessoryWith('chinning', 'チンニング', '5〜8', 3, 'chinning', null, 4));
        exercises.push(accessoryWith('machine_row', 'マシンロー', '10', 4, 'row'));
        exercises.push(accessoryWith('preacher', 'ワンハンドDBプリーチャーカール', '10〜12', 3, 'arm'));
        exercises.push(accessoryWith('lying_ext', 'ライイングエクステンション', '10〜12', 3, 'arm'));
      } else {
        const bp = topSingle('bench', 'ベンチプレス（トップシングル）', M.bench,
          [91.3, 93.5, 95.7], 'bench-heavy-top');
        if (bp) exercises.push(bp);
        exercises.push(backoff('bench', 'ベンチプレス（バックオフ）', M.bench,
          [80.4, 82.6, 84.8], [3, 3, 3], [4, 4, 3], 'bench-heavy-backoff'));
        exercises.push(accessoryWith('incline_db', 'インクラインDBプレス', '8〜10', 3, 'incline_db', null, 4));
        exercises.push(accessoryWith('chinning', 'チンニング', '5〜8', 3, 'chinning', null, 4));
        exercises.push(accessoryWith('row', 'ロウ系', '8〜12', 4, 'row'));
        exercises.push(accessoryWith('preacher', 'ワンハンドDBプリーチャーカール', '10〜12', 3, 'arm'));
        exercises.push(accessoryWith('lying_ext', 'ライイングエクステンション', '10〜12', 3, 'arm'));
      }
      break;
    }
    case 3: {
      dayName = 'Day3: ハーフデッド重め / ベンチ軽め';
      if (isHighIntensity && !isDeload) {
        // 高強度モード: トップシングル+バックオフを 84.25/85.5/86.75% × 5回 × 3セット に置換
        exercises.push(hiMainSets('halfDead', 'ハーフデッド（高強度メイン）', M.halfDead,
          [84.25, 85.5, 86.75], 5, 3, 'halfDead-hi-main', 'squat_dead_volume'));
      } else {
        const hd = topSingle('halfDead', 'ハーフデッド（トップシングル）', M.halfDead,
          [89.5, 92.1, 93.4], 'halfDead-heavy-top');
        if (hd) exercises.push(hd);
        exercises.push(backoff('halfDead', 'ハーフデッド（バックオフ）', M.halfDead,
          [78.9, 81.6, 82.9], [3, 3, 3], [4, 3, 3], 'halfDead-heavy-backoff'));
      }
      exercises.push(benchByPct('bench', 'ベンチプレス（軽め）', M.bench,
        [65.2, 67.4, 69.6], [3, 3, 3], [6, 6, 5], 'bench-light', 'bench_volume'));
      if (isHighIntensity) {
        // 高強度モード補助: マシンロー / ショルダープレス / カーフレイズ
        exercises.push(accessoryWith('machine_row', 'マシンロー', '10', 3, 'row', null, 4));
        exercises.push(accessoryWith('shoulder', 'ショルダープレス', '5〜8', 3, 'shoulder', null, 4));
        exercises.push(accessoryWith('calf', 'カーフレイズ', '12〜20', 3, 'calf', null, 4));
      } else {
        exercises.push(accessoryWith('shoulder', 'ショルダープレス', '5〜8', 3, 'shoulder', null, 4));
        exercises.push(accessoryWith('row', 'ロウ系', '8〜10', 3, 'row', null, 4));
        exercises.push(accessoryWith('calf', 'カーフレイズ', '12〜20', 3, 'calf', null, 4));
      }
      break;
    }
    case 4:
      dayName = 'Day4: 休み';
      exercises = [];
      break;
    case 5: {
      dayName = 'Day5: スクワットボリューム / ベンチ中重量';
      exercises.push(benchByPct('squat', 'スクワット（ボリューム）', M.squat,
        [71.9, 75.0, 76.6], [5, 5, 5], [5, 5, 5], 'squat-volume', 'squat_dead_volume'));
      exercises.push(benchByPct('bench', 'ベンチプレス（中重量）', M.bench,
        [76.1, 78.3, 80.4], [4, 4, 4], [4, 4, 4], 'bench-mid', 'bench_volume'));
      exercises.push(accessoryWith('hack_squat', 'ハックスクワット', '8〜10', 3, 'default', null, 4));
      exercises.push(accessoryWith('calf', 'カーフレイズ', '12〜20', 4, 'calf'));
      break;
    }
    case 6: {
      dayName = 'Day6: ベンチボリューム';
      // 高ボリュームモード時はメインのベンチボリュームを 4セット → 5セット に増量
      // R4デロード時は benchByPct 内で sets=2 に固定されるため影響なし
      const day6BenchSets = (isHigh && !isDeload) ? [5, 5, 5] : [4, 4, 4];
      exercises.push(benchByPct('bench', 'ベンチプレス（ボリューム）', M.bench,
        [67.4, 69.6, 71.7], [6, 6, 6], day6BenchSets, 'bench-volume2', 'bench_volume'));
      if (isHighIntensity) {
        // 高強度モード補助: インクラインDBプレス / ディップス / ペックフライ / ライイングエクステンション
        exercises.push(accessoryWith('incline_db', 'インクラインDBプレス', '8〜10', 3, 'incline_db', null, 4));
        exercises.push(accessoryWith('dips', 'ディップス', '6〜10', 3, 'dips', null, 4));
        exercises.push(accessoryWith('pec_fly', 'ペックフライ', '8〜12', 3, 'default'));
        exercises.push(accessoryWith('lying_ext', 'ライイングエクステンション', '10〜12', 3, 'arm'));
      } else {
        exercises.push(accessoryWith('dips', 'ディップス', '6〜10', 3, 'dips', null, 4));
        exercises.push(accessoryWith('chinning', 'チンニング', '5〜8', 2, 'chinning', null, 3));
        exercises.push(accessoryWith('row', 'ロウ系', '8〜12', 4, 'row'));
        exercises.push(accessoryWith('preacher', 'ワンハンドDBプリーチャーカール', '10〜12', 3, 'arm'));
        exercises.push(accessoryWith('lying_ext', 'ライイングエクステンション', '10〜12', 3, 'arm'));
      }
      break;
    }
    case 7: {
      dayName = 'Day7: 床引きデッド / スクワット軽め';
      // 床引きデッドはハーフデッド強化の補助・フォーム維持目的のため、
      // 高強度モードでも軽〜中重量を維持。強化対象にしない。
      exercises.push(benchByPct('floorDead', '床引きデッド', M.floorDead,
        [70.6, 73.5, 76.5], [3, 3, 3], [5, 5, 4], 'floorDead-main', 'squat_dead_volume'));
      exercises.push(benchByPct('squat', 'スクワット（軽め）', M.squat,
        [62.5, 64.1, 65.6], [2, 2, 2], [6, 6, 6], 'squat-light', 'squat_dead_volume'));
      if (isHighIntensity) {
        // 高強度モード補助: ラットプルダウン / マシンロー / シーテッドロー / プリーチャー
        exercises.push(accessoryWith('latpulldown', 'ラットプルダウン', '8〜12', 3, 'row', null, 4));
        exercises.push(accessoryWith('machine_row', 'マシンロー', '10', 3, 'row', null, 4));
        exercises.push(accessoryWith('seated_row', 'シーテッドロー', '10', 2, 'row'));
        exercises.push(accessoryWith('preacher', 'ワンハンドDBプリーチャーカール', '10〜12', 3, 'arm'));
      } else {
        exercises.push(accessoryWith('row', 'ロウ系', '8〜12', 3, 'row', null, 4));
        exercises.push(accessoryWith('chinning', 'チンニング', '5〜8', 2, 'chinning', null, 3));
        exercises.push(accessoryWith('calf', 'カーフレイズ', '12〜20', 3, 'calf', null, 4));
      }
      break;
    }
    case 8:
      dayName = 'Day8: 休み';
      exercises = [];
      break;
  }

  exercises = exercises.filter(ex => !ex.isAccessory);
  exercises.push(...buildAccessoryExercises(day, settings, isDeload));

  // 手動調整を適用
  exercises = exercises.map(ex => {
    if (!ex || ex.plannedWeight == null) return ex;
    const adjKey = `Day${day}-${ex.key}-${ex.menuType}`;
    const adj = store.manualAdjustments[adjKey] || 0;
    if (adj !== 0) {
      ex.plannedWeight = roundToIncrement(ex.plannedWeight + adj, inc);
      ex.adjusted = adj;
    }
    return ex;
  });

  return {
    day,
    rotation,
    isDeload,
    isRest: exercises.length === 0,
    name: dayName,
    exercises,
  };
}

// 次のDayを計算（休みも進める）
function nextDay(state) {
  let { day, rotation, block } = state;
  day++;
  if (day > 8) {
    day = 1;
    rotation++;
    if (rotation > 4) {
      rotation = 1;
      block++;
    }
  }
  return { day, rotation, block };
}

// 今日のセッションキー
function todaySessionKey() {
  return `${todayStr()}-b${store.currentState.block}-r${store.currentState.rotation}-d${store.currentState.day}`;
}

// 今日のセッション取得 or 作成
function getOrCreateTodaySession() {
  const key = todaySessionKey();
  if (!store.daySessions[key]) {
    const menu = getDayMenu(store.currentState.day, store.currentState.rotation, store.settings);
    store.daySessions[key] = {
      key,
      date: todayStr(),
      day: store.currentState.day,
      rotation: store.currentState.rotation,
      block: store.currentState.block,
      isDeload: menu.isDeload,
      isRest: menu.isRest,
      dayName: menu.name,
      exercises: menu.exercises.map(ex => ({
        ...ex,
        sets: Array.from({ length: typeof ex.plannedSets === 'number' ? ex.plannedSets : 3 }, () => ({
          weight: ex.plannedWeight,
          reps: typeof ex.plannedReps === 'number' ? ex.plannedReps : '',
          done: false,
        })),
        rpe: '未入力',
        pains: [],
        note: '',
        completed: false,
      })),
      completed: false,
      ts: Date.now(),
    };
    saveStore();
  }
  return store.daySessions[key];
}

// 今日のセッションを再計算（メニューを最新に更新、未実施部分のみ）
function recalculateTodaySession() {
  const key = todaySessionKey();
  const oldSession = store.daySessions[key];
  const menu = getDayMenu(store.currentState.day, store.currentState.rotation, store.settings);

  if (!oldSession) {
    getOrCreateTodaySession();
    return;
  }

  // 実施済みのセットがあるか
  const hasDoneSet = oldSession.exercises.some(ex => ex.sets.some(s => s.done));

  // 既存の入力データを保持しつつ、予定値だけ更新
  // セット数が変わった場合：
  //   - 実施済みセットは絶対に保持
  //   - 未実施セットは新メニューの予定セット数に合わせて再構築
  //   - 実施済み件数 > 新予定セット数 となる場合でも、実施済みセットは削除しない（実施件数優先）
  const newExercises = menu.exercises.map(newEx => {
    const oldEx = oldSession.exercises.find(e => e.key === newEx.key && e.menuType === newEx.menuType);
    const targetSets = typeof newEx.plannedSets === 'number' ? newEx.plannedSets : 3;
    const defaultReps = typeof newEx.plannedReps === 'number' ? newEx.plannedReps : '';

    if (!oldEx) {
      return {
        ...newEx,
        sets: Array.from({ length: targetSets }, () => ({
          weight: newEx.plannedWeight, reps: defaultReps, done: false,
        })),
        rpe: '未入力', pains: [], note: '', completed: false,
      };
    }

    // 既存セットを完了/未完了に分割
    const doneSets = oldEx.sets.filter(s => s.done);
    const undoneSets = oldEx.sets.filter(s => !s.done);

    // 未完了セットの目標数 = max(0, targetSets - doneSets.length)
    const undoneTarget = Math.max(0, targetSets - doneSets.length);
    let newUndone;
    if (undoneSets.length === undoneTarget) {
      // 件数同じ → 重量だけ更新
      newUndone = undoneSets.map(s => ({ ...s, weight: newEx.plannedWeight }));
    } else if (undoneSets.length > undoneTarget) {
      // 件数減 → 先頭から undoneTarget 件を残す
      newUndone = undoneSets.slice(0, undoneTarget).map(s => ({ ...s, weight: newEx.plannedWeight }));
    } else {
      // 件数増 → 既存を更新 + 不足分を追加
      newUndone = [
        ...undoneSets.map(s => ({ ...s, weight: newEx.plannedWeight })),
        ...Array.from({ length: undoneTarget - undoneSets.length }, () => ({
          weight: newEx.plannedWeight, reps: defaultReps, done: false,
        })),
      ];
    }

    const newSets = [...doneSets, ...newUndone];

    return {
      ...newEx,
      sets: newSets,
      rpe: oldEx.rpe,
      pains: oldEx.pains,
      note: oldEx.note,
      completed: oldEx.completed,
    };
  });

  oldSession.exercises = newExercises;
  oldSession.dayName = menu.name;
  oldSession.isDeload = menu.isDeload;
  oldSession.isRest = menu.isRest;
  saveStore();
  return hasDoneSet;
}

// ===== 画面ルーター =====
let currentScreen = 'home';

function navigate(screen) {
  currentScreen = screen;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === screen);
  });
  render();
}

function render() {
  const main = document.getElementById('main');
  switch (currentScreen) {
    case 'home': main.innerHTML = renderHome(); afterHome(); break;
    case 'today': main.innerHTML = renderToday(); afterToday(); break;
    case 'block': main.innerHTML = renderBlock(); afterBlock(); break;
    case 'log': main.innerHTML = renderLog(); afterLog(); break;
    case 'settings': main.innerHTML = renderSettings(); afterSettings(); break;
  }
  updateHeader();
}

function updateHeader() {
  const s = store.currentState;
  document.getElementById('headerStatus').textContent =
    `B${s.block} / R${s.rotation} / D${s.day}`;
}

// ===== ホーム画面 =====
function renderHome() {
  const s = store.currentState;
  const menu = getDayMenu(s.day, s.rotation, store.settings);
  const next = nextDay(s);
  const nextMenu = getDayMenu(next.day, next.rotation, store.settings);

  const exList = menu.isRest
    ? '<div class="rest-day-banner"><div class="big">今日は休み</div><div class="muted">回復に集中しましょう</div></div>'
    : `<ul class="exercise-list">${menu.exercises.map(e => {
        const detail = e.plannedWeight != null
          ? `${e.plannedWeight}kg × ${e.plannedReps}回 × ${e.plannedSets}セット`
          : `${e.plannedReps}回 × ${e.plannedSets}セット`;
        return `<li><span class="ex-name">${e.name}</span> <span class="muted ex-detail">${detail}</span></li>`;
      }).join('')}</ul>`;

  const volumeMode = store.settings.trainingVolumeMode || 'high';
  const modeBadge = `<div class="muted" style="font-size:12px;">ボリュームモード: <span class="${volumeMode === 'high' ? 'text-warn' : ''}">${volumeMode === 'high' ? '高ボリューム' : '標準'}</span></div>`;

  const deloadBanner = menu.isDeload && !menu.isRest
    ? `<div class="deload-banner"><div class="label">疲労抜きローテ（4ローテ目）</div><div class="muted">トップシングルなし、軽めの重量で身体を整える</div></div>`
    : '';

  return `
    <h2 class="screen-title">ホーム</h2>
    <div class="today-summary">
      <div class="meta">ブロック ${s.block} / ローテ ${s.rotation}/4 / Day ${s.day}/8</div>
      <div class="day-name">${menu.name}</div>
      <div class="meta">${todayStr()}</div>
    </div>

    ${deloadBanner}

    <div class="section">
      <h2>今日のメニュー</h2>
      ${modeBadge}
      ${exList}
    </div>

    <div class="section">
      <button class="btn-primary" id="btnStartToday">今日のトレーニングを開始</button>
      <div class="mt-8 btn-row">
        <button class="btn-secondary" id="btnChangeDay">Dayを手動変更</button>
        <button class="btn-secondary" id="btnAdvanceDay">次のDayへ進む</button>
      </div>
    </div>

    <div class="section">
      <h2>次のトレーニング予定</h2>
      <div class="muted">B${next.block} / R${next.rotation} / D${next.day}</div>
      <div class="value-mid mt-8">${nextMenu.name}</div>
    </div>
  `;
}

function afterHome() {
  document.getElementById('btnStartToday').onclick = () => navigate('today');
  document.getElementById('btnChangeDay').onclick = openDayChangeModal;
  document.getElementById('btnAdvanceDay').onclick = () => {
    if (!confirm('次のDayへ進めますか？')) return;
    const n = nextDay(store.currentState);
    store.currentState = { ...store.currentState, ...n };
    saveStore();
    showToast(`B${n.block} / R${n.rotation} / D${n.day} に進みました`);
    render();
  };
}

function openDayChangeModal() {
  const s = store.currentState;
  openModal('Day手動変更', `
    <label class="field"><span>ブロック</span><input type="number" id="cs-block" value="${s.block}" min="1" /></label>
    <label class="field"><span>ローテ (1-4)</span><input type="number" id="cs-rotation" value="${s.rotation}" min="1" max="4" /></label>
    <label class="field"><span>Day (1-8)</span><input type="number" id="cs-day" value="${s.day}" min="1" max="8" /></label>
    <button class="btn-primary" id="cs-save">保存</button>
  `, () => {
    document.getElementById('cs-save').onclick = () => {
      const b = parseInt(document.getElementById('cs-block').value) || 1;
      const r = Math.min(4, Math.max(1, parseInt(document.getElementById('cs-rotation').value) || 1));
      const d = Math.min(8, Math.max(1, parseInt(document.getElementById('cs-day').value) || 1));
      store.currentState = { ...store.currentState, block: b, rotation: r, day: d };
      saveStore();
      closeModal();
      showToast('変更しました');
      render();
    };
  });
}

// ===== 今日のトレーニング画面 =====
function renderToday() {
  const session = getOrCreateTodaySession();
  const s = store.currentState;

  if (session.isRest) {
    return `
      <h2 class="screen-title">今日のトレーニング</h2>
      <div class="rest-day-banner">
        <div class="big">今日は休み</div>
        <div class="muted">Day${s.day} - 休息日</div>
      </div>
      <div class="section">
        <button class="btn-primary" id="btnFinishRest">休息日を完了して次のDayへ</button>
      </div>
    `;
  }

  const deloadBanner = session.isDeload
    ? `<div class="deload-banner"><div class="label">疲労抜きローテ</div><div class="muted">RPE6以下を目安に。痛みがあれば腕トレ・ディップスはスキップ可</div></div>`
    : '';

  const exHtml = session.exercises.map((ex, exIdx) => renderExerciseCard(ex, exIdx)).join('');

  return `
    <h2 class="screen-title">${session.dayName}</h2>
    <div class="muted mb-12">${todayStr()} / B${s.block} R${s.rotation} D${s.day}</div>
    ${deloadBanner}
    ${exHtml}
    <div class="section">
      <button class="btn-success btn-block" id="btnFinishSession">トレーニング完了</button>
    </div>
  `;
}

function renderExerciseCard(ex, exIdx) {
  const setsHtml = ex.sets.map((set, setIdx) => `
    <div class="set-grid">
      <div class="set-no">${setIdx + 1}</div>
      <input type="number" inputmode="decimal" step="0.5" placeholder="重量" value="${set.weight ?? ''}"
        data-ex="${exIdx}" data-set="${setIdx}" data-field="weight" />
      <input type="number" inputmode="numeric" placeholder="回数" value="${set.reps ?? ''}"
        data-ex="${exIdx}" data-set="${setIdx}" data-field="reps" />
      <div class="check"><input type="checkbox" ${set.done ? 'checked' : ''} data-ex="${exIdx}" data-set="${setIdx}" data-field="done" /></div>
    </div>
  `).join('');

  const rpeChips = RPE_OPTIONS.map(r => `
    <div class="chip ${ex.rpe === r ? 'active' : ''}" data-ex="${exIdx}" data-rpe="${r}">${r}</div>
  `).join('');

  const painChips = PAIN_OPTIONS.map(p => `
    <div class="chip pain ${ex.pains.includes(p) ? 'active' : ''}" data-ex="${exIdx}" data-pain="${p}">${p}</div>
  `).join('');

  const planLine = ex.plannedWeight != null
    ? `<div class="plan-line">予定: <span class="strong">${ex.plannedWeight}kg × ${ex.plannedReps}回 × ${ex.plannedSets}セット</span> ${ex.pctNote ? `(${ex.pctNote})` : ''} ${ex.adjusted ? `<span class="text-warn">[調整 ${ex.adjusted > 0 ? '+' : ''}${ex.adjusted}]</span>` : ''}</div>`
    : `<div class="plan-line">予定: <span class="strong">${ex.plannedReps}回 × ${ex.plannedSets}セット</span></div>`;
  const accessoryMeta = ex.isAccessory ? `
    <div class="muted" style="font-size:12px;">スロット: ${ex.slotName || '-'} / 目標RPE: ${ex.targetRpe || '-'}</div>
    <div class="muted" style="font-size:12px;">カテゴリ: ${(ex.categories || []).join('・') || '-'} / 疲労タグ: ${(ex.fatigueTags || []).join('・') || '-'}</div>
    <div class="plan-line text-warn">補助提案: ${suggestAccessoryProgression(ex)}</div>
  ` : '';

  return `
    <div class="exercise-card" data-ex="${exIdx}">
      <div class="head">
        <div class="name">${ex.name}</div>
        <div class="menu-type">${ex.isAccessory ? '補助' : (ex.isBig3 ? 'BIG3' : 'メイン')}</div>
      </div>
      ${planLine}
      ${accessoryMeta}
      <div class="muted">レスト目安: ${Math.round(ex.restSec / 60 * 10) / 10}分</div>

      <div class="set-grid"><div class="set-no">#</div><div class="muted text-center">重量(kg)</div><div class="muted text-center">回数</div><div class="muted text-center">✓</div></div>
      ${setsHtml}

      <div class="row-rpe-pain">
        <div class="muted" style="width:100%;font-size:12px;">RPE:</div>
        ${rpeChips}
      </div>
      <div class="row-rpe-pain">
        <div class="muted" style="width:100%;font-size:12px;">痛み:</div>
        ${painChips}
      </div>

      <label class="field mt-8">
        <span>メモ</span>
        <textarea data-ex="${exIdx}" data-field="note" placeholder="調子・フォーム・気付き等">${ex.note}</textarea>
      </label>

      <div class="actions">
        <button class="btn-secondary btn-small" data-action="rest" data-ex="${exIdx}">レスト開始</button>
        <button class="btn-warn btn-small" data-action="adjust" data-ex="${exIdx}">重量調整</button>
        ${ex.isAccessory ? `<button class="btn-secondary btn-small" data-action="editAccessory" data-ex="${exIdx}">補助編集</button>` : ''}
        <button class="btn-success btn-small" data-action="completeSet" data-ex="${exIdx}">セット完了+レスト</button>
      </div>
    </div>
  `;
}

function afterToday() {
  const session = store.daySessions[todaySessionKey()];

  // 入力 → 保存
  document.querySelectorAll('input[data-field], textarea[data-field]').forEach(el => {
    el.addEventListener('change', (e) => {
      const exIdx = parseInt(el.dataset.ex);
      const field = el.dataset.field;
      const ex = session.exercises[exIdx];
      if (!ex) return;
      if (field === 'note') {
        ex.note = el.value;
      } else {
        const setIdx = parseInt(el.dataset.set);
        const set = ex.sets[setIdx];
        if (!set) return;
        if (field === 'done') set.done = el.checked;
        else if (field === 'weight') set.weight = parseFloat(el.value) || 0;
        else if (field === 'reps') set.reps = parseInt(el.value) || 0;
      }
      saveStore();
    });
  });

  // RPE
  document.querySelectorAll('.chip[data-rpe]').forEach(c => {
    c.addEventListener('click', () => {
      const exIdx = parseInt(c.dataset.ex);
      session.exercises[exIdx].rpe = c.dataset.rpe;
      saveStore();
      render();
    });
  });

  // 痛み（複数選択）
  document.querySelectorAll('.chip[data-pain]').forEach(c => {
    c.addEventListener('click', () => {
      const exIdx = parseInt(c.dataset.ex);
      const pain = c.dataset.pain;
      const ex = session.exercises[exIdx];
      if (pain === 'なし') {
        ex.pains = ex.pains.includes('なし') ? [] : ['なし'];
      } else {
        ex.pains = ex.pains.filter(p => p !== 'なし');
        if (ex.pains.includes(pain)) {
          ex.pains = ex.pains.filter(p => p !== pain);
        } else {
          ex.pains.push(pain);
        }
      }
      saveStore();
      render();
    });
  });

  // アクション
  document.querySelectorAll('button[data-action]').forEach(b => {
    b.addEventListener('click', () => {
      const action = b.dataset.action;
      const exIdx = parseInt(b.dataset.ex);
      const ex = session.exercises[exIdx];
      if (action === 'rest') {
        startRestTimer(ex.restSec, ex.name);
      } else if (action === 'completeSet') {
        // 未完了の最初のセットをdoneに、レスト開始
        const next = ex.sets.find(s => !s.done);
        if (next) {
          next.done = true;
          saveStore();
          startRestTimer(ex.restSec, ex.name);
          render();
        } else {
          startRestTimer(ex.restSec, ex.name);
        }
      } else if (action === 'adjust') {
        openAdjustModal(exIdx);
      } else if (action === 'editAccessory') {
        openAccessoryTodayModal(exIdx);
      }
    });
  });

  const finishBtn = document.getElementById('btnFinishSession');
  if (finishBtn) finishBtn.onclick = finishTodaySession;

  const finishRest = document.getElementById('btnFinishRest');
  if (finishRest) finishRest.onclick = () => {
    finishTodaySession();
  };
}

function openAdjustModal(exIdx) {
  const session = store.daySessions[todaySessionKey()];
  const ex = session.exercises[exIdx];
  const currentWeight = ex.plannedWeight ?? ex.sets.find(s => s.weight != null)?.weight ?? 0;
  openModal('重量調整', `
    <div class="muted mb-8">${ex.name}</div>
    <div>現在の予定: <strong>${currentWeight || '-'}kg</strong></div>
    <label class="field mt-8"><span>新しい予定重量(kg)</span>
      <input type="number" id="adj-weight" step="0.5" value="${currentWeight || ''}" />
    </label>
    <div class="btn-row">
      <button class="btn-secondary" id="adj-today">今日だけ変更</button>
      <button class="btn-warn" id="adj-future">今後にも反映</button>
    </div>
    <div class="muted mt-8" style="font-size:12px;">「今後にも反映」の場合、同じDay×種目×メニュー種別に対し差分を保存します（次ブロックでも継続）</div>
  `, () => {
    document.getElementById('adj-today').onclick = () => {
      const v = parseFloat(document.getElementById('adj-weight').value);
      if (!v) return;
      const newW = roundToIncrement(v, store.settings.increment);
      ex.plannedWeight = newW;
      ex.sets.forEach(s => { if (!s.done) s.weight = newW; });
      saveStore();
      closeModal();
      render();
      showToast('今日のみ変更しました');
    };
    document.getElementById('adj-future').onclick = () => {
      const v = parseFloat(document.getElementById('adj-weight').value);
      if (!v) return;
      const newW = roundToIncrement(v, store.settings.increment);
      if (ex.isAccessory) {
        store.settings.accessoryDefaults[ex.key] = {
          ...(store.settings.accessoryDefaults[ex.key] || {}),
          weight: newW,
          reps: ex.plannedReps,
          sets: ex.plannedSets,
        };
        ex.plannedWeight = newW;
        ex.sets.forEach(s => { if (!s.done) s.weight = newW; });
        saveStore();
        closeModal();
        render();
        showToast('補助重量を今後にも反映しました');
        return;
      }
      const diff = newW - ex.plannedWeight;
      const baseW = ex.plannedWeight - (ex.adjusted || 0);
      const totalAdj = (newW - baseW);
      const adjKey = `Day${session.day}-${ex.key}-${ex.menuType}`;
      store.manualAdjustments[adjKey] = totalAdj;
      ex.plannedWeight = newW;
      ex.adjusted = totalAdj;
      ex.sets.forEach(s => { if (!s.done) s.weight = newW; });
      saveStore();
      closeModal();
      render();
      showToast(`今後にも反映 (${totalAdj > 0 ? '+' : ''}${totalAdj}kg)`);
    };
  });
}

function slotFormHtml(prefix, ex) {
  return `
    <label class="field"><span>種目名</span><input type="text" id="${prefix}-name" value="${ex.name || ''}" /></label>
    <label class="field"><span>セット数</span><input type="number" min="0" id="${prefix}-sets" value="${ex.plannedSets || 1}" /></label>
    <label class="field"><span>レップ範囲</span><input type="text" id="${prefix}-reps" value="${ex.plannedReps || ex.reps || ''}" /></label>
    <label class="field"><span>目標RPE</span><input type="text" id="${prefix}-rpe" value="${ex.targetRpe || '8'}" /></label>
    <label class="field"><span>カテゴリ（、区切り）</span><input type="text" id="${prefix}-categories" value="${(ex.categories || []).join('、')}" /></label>
    <label class="field"><span>疲労タグ（、区切り）</span><input type="text" id="${prefix}-tags" value="${(ex.fatigueTags || []).join('、')}" /></label>
    <label class="field"><span>重量タイプ</span>
      <select id="${prefix}-weightType">
        ${[
          ['dumbbell', 'ダンベル片手種目'],
          ['upper_machine', '上半身マシン・バーベル'],
          ['leg_machine', '脚マシン'],
          ['bodyweight', '自重種目'],
          ['arm', '腕種目'],
          ['calf', 'カーフ'],
        ].map(([v, label]) => `<option value="${v}" ${ex.weightType === v ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </label>
  `;
}

function readSlotForm(prefix, base = {}) {
  const name = document.getElementById(`${prefix}-name`).value.trim() || '補助種目';
  const plannedSets = Math.max(0, parseInt(document.getElementById(`${prefix}-sets`).value, 10) || 0);
  const reps = document.getElementById(`${prefix}-reps`).value.trim() || '8〜12';
  return normalizeAccessorySlot({
    ...base,
    name,
    key: base.key || accessoryKeyFromName(name),
    plannedSets,
    setsText: String(plannedSets),
    reps,
    targetRpe: document.getElementById(`${prefix}-rpe`).value.trim() || '8',
    categories: normalizeList(document.getElementById(`${prefix}-categories`).value, ACCESSORY_CATEGORIES),
    fatigueTags: normalizeList(document.getElementById(`${prefix}-tags`).value, ACCESSORY_FATIGUE_TAGS),
    weightType: document.getElementById(`${prefix}-weightType`).value,
  });
}

function openAccessoryTodayModal(exIdx) {
  const session = store.daySessions[todaySessionKey()];
  const ex = session.exercises[exIdx];
  if (!ex?.isAccessory) return;
  openModal('補助種目編集', `
    <div class="muted mb-8">${ex.slotName || '補助スロット'} / Day${session.day}</div>
    ${slotFormHtml('accToday', ex)}
    <div class="btn-row">
      <button class="btn-secondary" id="acc-today-only">今日だけ変更</button>
      <button class="btn-warn" id="acc-save-future">今後にも反映</button>
      <button class="btn-danger" id="acc-delete-today">今日だけ削除</button>
    </div>
  `, () => {
    document.getElementById('acc-today-only').onclick = () => {
      const updated = readSlotForm('accToday', ex);
      Object.assign(ex, {
        name: updated.name,
        plannedSets: updated.plannedSets,
        plannedReps: updated.reps,
        targetRpe: updated.targetRpe,
        categories: updated.categories,
        fatigueTags: updated.fatigueTags,
        weightType: updated.weightType,
      });
      resizeExerciseSets(ex);
      saveStore();
      closeModal();
      render();
      showToast('今日だけ補助種目を変更しました');
    };
    document.getElementById('acc-save-future').onclick = () => {
      const updated = readSlotForm('accToday', ex);
      updateAccessorySlot(session.day, ex.slotId, updated);
      Object.assign(ex, {
        name: updated.name,
        key: updated.key,
        plannedSets: updated.plannedSets,
        plannedReps: updated.reps,
        targetRpe: updated.targetRpe,
        categories: updated.categories,
        fatigueTags: updated.fatigueTags,
        weightType: updated.weightType,
      });
      resizeExerciseSets(ex);
      saveStore();
      closeModal();
      render();
      showToast('今後にも反映しました');
    };
    document.getElementById('acc-delete-today').onclick = () => {
      session.exercises.splice(exIdx, 1);
      saveStore();
      closeModal();
      render();
      showToast('今日だけ削除しました');
    };
  });
}

function resizeExerciseSets(ex) {
  const target = Math.max(0, parseInt(ex.plannedSets, 10) || 0);
  const defaultReps = typeof ex.plannedReps === 'number' ? ex.plannedReps : '';
  while (ex.sets.length < target) ex.sets.push({ weight: ex.plannedWeight, reps: defaultReps, done: false });
  const done = ex.sets.filter(s => s.done);
  if (ex.sets.length > target && done.length <= target) ex.sets = ex.sets.slice(0, target);
}

function updateAccessorySlot(day, slotId, updatedSlot) {
  const slots = store.settings.accessorySlots || defaultAccessorySlots();
  const key = String(day);
  const idx = (slots[key] || []).findIndex(slot => slot.slotId === slotId);
  if (idx >= 0) slots[key][idx] = normalizeAccessorySlot({ ...slots[key][idx], ...updatedSlot, slotId });
  store.settings.accessorySlots = slots;
}

function deleteAccessorySlot(day, slotId) {
  const slots = store.settings.accessorySlots || defaultAccessorySlots();
  const key = String(day);
  slots[key] = (slots[key] || []).filter(slot => slot.slotId !== slotId);
  store.settings.accessorySlots = slots;
}

function addAccessorySlot(day, slotName) {
  const slots = store.settings.accessorySlots || defaultAccessorySlots();
  const key = String(day);
  slots[key] = slots[key] || [];
  slots[key].push(normalizeAccessorySlot({
    slotId: `custom_${day}_${uid()}`,
    slotName: slotName || '補助スロット',
    key: `custom_${uid()}`,
    name: '新規補助種目',
    setsText: '2',
    plannedSets: 2,
    reps: '8〜12',
    targetRpe: '8',
    categories: [],
    fatigueTags: ['低リスク'],
    weightType: 'upper_machine',
    restType: 'default',
  }));
  store.settings.accessorySlots = slots;
}

function openAccessorySlotSettingsModal(day, slot) {
  openModal('補助種目を今後にも反映', `
    <div class="muted mb-8">Day${day} / ${slot.slotName}</div>
    ${slotFormHtml('accSlot', { ...slot, plannedReps: slot.reps, plannedSets: slot.plannedSets })}
    <div class="btn-row">
      <button class="btn-warn" id="acc-slot-save">今後にも反映</button>
      <button class="btn-danger" id="acc-slot-delete">削除</button>
    </div>
  `, () => {
    document.getElementById('acc-slot-save').onclick = () => {
      const updated = readSlotForm('accSlot', slot);
      updateAccessorySlot(day, slot.slotId, updated);
      saveStore();
      closeModal();
      render();
      showToast('補助種目を更新しました');
    };
    document.getElementById('acc-slot-delete').onclick = () => {
      if (!confirm('この補助種目を今後のメニューから削除しますか？')) return;
      deleteAccessorySlot(day, slot.slotId);
      saveStore();
      closeModal();
      render();
      showToast('補助種目を削除しました');
    };
  });
}

function finishTodaySession() {
  const key = todaySessionKey();
  const session = store.daySessions[key];
  if (!session) return;

  if (session.completed) {
    if (!confirm('既に完了済みです。再度ログを保存しますか？')) return;
  }

  // 各種目をログ化
  session.exercises.forEach(ex => {
    const log = {
      id: uid(),
      date: session.date,
      day: session.day,
      block: session.block,
      rotation: session.rotation,
      isDeload: session.isDeload,
      exerciseKey: ex.key,
      exerciseName: ex.name,
      menuType: ex.menuType,
      plannedWeight: ex.plannedWeight,
      plannedReps: ex.plannedReps,
      plannedSets: ex.plannedSets,
      targetRpe: ex.targetRpe,
      categories: ex.categories || [],
      fatigueTags: ex.fatigueTags || [],
      weightType: ex.weightType,
      slotId: ex.slotId,
      slotName: ex.slotName,
      sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps, done: s.done })),
      doneSets: ex.sets.filter(s => s.done).length,
      rpe: ex.rpe,
      pains: ex.pains,
      note: ex.note,
      manualAdjusted: !!ex.adjusted,
      ts: Date.now(),
    };
    // 重複チェック（同じセッションキー+exerciseKey+menuType）
    const existIdx = store.logs.findIndex(l =>
      l.date === log.date && l.day === log.day && l.block === log.block &&
      l.rotation === log.rotation && l.exerciseKey === log.exerciseKey && l.menuType === log.menuType
    );
    if (existIdx >= 0) store.logs[existIdx] = log;
    else store.logs.push(log);
  });

  session.completed = true;
  store.currentState.lastTrainingDate = session.date;
  saveStore();
  showToast('お疲れさま！記録を保存しました');

  // 4ローテD8（最後／休み）終了時のみ、次ブロック提案を表示
  // R4D7完了時は通常通りD8（休み）へ進める
  if (session.rotation === 4 && session.day === 8) {
    setTimeout(() => {
      if (confirm('ブロック完了！次ブロック提案を見ますか？')) {
        navigate('block');
      }
    }, 800);
  } else {
    setTimeout(() => {
      if (confirm('次のDayへ進みますか？')) {
        const n = nextDay(store.currentState);
        store.currentState = { ...store.currentState, ...n };
        saveStore();
        navigate('home');
      }
    }, 800);
  }
}

// ===== レストタイマー =====
let restState = {
  restStartedAt: null,
  restDurationSec: 0,
  restEndAt: null,
  running: false,
  targetName: '',
  alertedAt: null,
  remaining: 0,
  timerId: null,
};

function createEmptyRestState() {
  return {
    restStartedAt: null,
    restDurationSec: 0,
    restEndAt: null,
    running: false,
    targetName: '',
    alertedAt: null,
    remaining: 0,
    timerId: restState?.timerId || null,
  };
}

function normalizeRestTimerState(state) {
  if (!state || typeof state !== 'object') return null;
  const restDurationSec = Math.max(0, parseInt(state.restDurationSec, 10) || 0);
  const restStartedAt = parseInt(state.restStartedAt, 10) || null;
  const restEndAt = parseInt(state.restEndAt, 10) || null;
  if (!restDurationSec || !restStartedAt || !restEndAt) return null;
  return {
    restStartedAt,
    restDurationSec,
    restEndAt,
    running: !!state.running,
    targetName: state.targetName || '',
    alertedAt: state.alertedAt ? parseInt(state.alertedAt, 10) : null,
  };
}

function serializableRestTimerState() {
  const normalized = normalizeRestTimerState(restState);
  if (!normalized) return null;
  return normalized;
}

function persistRestTimerState() {
  store.restTimerState = serializableRestTimerState();
  saveStore();
}

function clearRestTimerState() {
  store.restTimerState = null;
  saveStore();
}

function getRestRemainingSec(now = nowMs()) {
  if (!restState.restEndAt || !restState.restStartedAt) return 0;
  if (restState.running) {
    return Math.max(0, Math.ceil((restState.restEndAt - now) / 1000));
  }
  return Math.max(0, Math.ceil((restState.restEndAt - restState.restStartedAt) / 1000));
}

function setRestTimerVisibility(visible) {
  const timer = document.getElementById('restTimer');
  if (!timer) return;
  timer.classList.toggle('hidden', !visible);
}

function setRestTimerAlarm(alarm) {
  const timer = document.getElementById('restTimer');
  if (!timer) return;
  timer.classList.toggle('alarm', !!alarm);
}

function setRestToggleText() {
  const toggle = document.getElementById('restToggle');
  if (!toggle) return;
  toggle.textContent = restState.running ? '停止' : '再開';
}

function scheduleRestTick() {
  if (restState.timerId) clearInterval(restState.timerId);
  restState.timerId = setInterval(() => syncRestTimer(), 1000);
}

function stopRestTick() {
  if (restState.timerId) clearInterval(restState.timerId);
  restState.timerId = null;
}

function startRestTimer(sec, targetName = '') {
  const duration = Math.max(1, parseInt(sec, 10) || 0);
  const now = nowMs();
  restState = {
    ...createEmptyRestState(),
    restStartedAt: now,
    restDurationSec: duration,
    restEndAt: now + duration * 1000,
    running: true,
    targetName,
    alertedAt: null,
    remaining: duration,
  };
  setRestTimerVisibility(true);
  setRestTimerAlarm(false);
  setRestToggleText();
  scheduleRestTick();
  persistRestTimerState();
  updateRestDisplay();
}

function syncRestTimer({ persist = true, alert = true } = {}) {
  const active = normalizeRestTimerState(restState);
  if (!active) {
    restState = createEmptyRestState();
    setRestTimerVisibility(false);
    setRestTimerAlarm(false);
    updateRestDisplay();
    if (persist) clearRestTimerState();
    return;
  }

  restState = { ...restState, ...active };
  restState.remaining = getRestRemainingSec();

  if (restState.running && restState.remaining <= 0) {
    restState.running = false;
    restState.remaining = 0;
    stopRestTick();
    if (!restState.alertedAt) {
      restState.alertedAt = nowMs();
      if (alert) {
        playBeep();
        if ('vibrate' in navigator) navigator.vibrate([300, 100, 300]);
      }
    }
  }

  setRestTimerVisibility(true);
  setRestTimerAlarm(restState.remaining <= 0);
  setRestToggleText();
  updateRestDisplay();
  if (persist) persistRestTimerState();
}

function updateRestDisplay() {
  const m = Math.floor(Math.max(0, restState.remaining) / 60);
  const s = Math.max(0, restState.remaining) % 60;
  const display = document.getElementById('restTimerDisplay');
  if (!display) return;
  display.textContent =
    `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.2;
    o.start();
    setTimeout(() => { o.frequency.value = 660; }, 200);
    setTimeout(() => { o.stop(); ctx.close(); }, 500);
  } catch (e) { /* 音再生失敗は無視 */ }
}

function setupRestTimerControls() {
  document.getElementById('restToggle').onclick = () => {
    syncRestTimer({ persist: false, alert: false });
    if (restState.running) {
      const remaining = getRestRemainingSec();
      const now = nowMs();
      restState.running = false;
      restState.restStartedAt = now;
      restState.restEndAt = now + remaining * 1000;
      restState.remaining = remaining;
      setRestToggleText();
    } else {
      const remaining = restState.remaining > 0 ? restState.remaining : restState.restDurationSec || 60;
      const now = nowMs();
      restState.restStartedAt = now;
      restState.restEndAt = now + remaining * 1000;
      restState.running = true;
      restState.alertedAt = null;
      restState.remaining = remaining;
      setRestToggleText();
      setRestTimerAlarm(false);
    }
    scheduleRestTick();
    persistRestTimerState();
    updateRestDisplay();
  };
  document.getElementById('restPlus30').onclick = () => {
    adjustRestTimer(30);
  };
  document.getElementById('restMinus30').onclick = () => {
    adjustRestTimer(-30);
  };
  document.getElementById('restReset').onclick = () => {
    resetRestTimer();
  };
  document.getElementById('restClose').onclick = () => {
    closeRestTimer();
  };
}

function adjustRestTimer(deltaSec) {
  syncRestTimer({ persist: false, alert: false });
  const remaining = Math.max(0, restState.remaining + deltaSec);
  const now = nowMs();
  restState.restStartedAt = now;
  restState.restEndAt = now + remaining * 1000;
  restState.remaining = remaining;
  restState.alertedAt = remaining > 0 ? null : (restState.alertedAt || now);
  restState.running = remaining > 0 ? restState.running : false;
  setRestTimerAlarm(remaining <= 0);
  setRestToggleText();
  scheduleRestTick();
  persistRestTimerState();
  updateRestDisplay();
}

function resetRestTimer() {
  const duration = Math.max(1, restState.restDurationSec || restState.remaining || 60);
  const now = nowMs();
  restState.restStartedAt = now;
  restState.restEndAt = now + duration * 1000;
  restState.restDurationSec = duration;
  restState.running = true;
  restState.alertedAt = null;
  restState.remaining = duration;
  setRestTimerVisibility(true);
  setRestTimerAlarm(false);
  setRestToggleText();
  scheduleRestTick();
  persistRestTimerState();
  updateRestDisplay();
}

function closeRestTimer() {
  restState = createEmptyRestState();
  stopRestTick();
  setRestTimerVisibility(false);
  setRestTimerAlarm(false);
  updateRestDisplay();
  clearRestTimerState();
}

function restoreRestTimer() {
  const saved = normalizeRestTimerState(store.restTimerState);
  if (!saved) {
    restState = createEmptyRestState();
    clearRestTimerState();
    return;
  }
  restState = { ...createEmptyRestState(), ...saved };
  syncRestTimer({ persist: true, alert: false });
  scheduleRestTick();
}

function handleRestTimerLifecycleEvent(event) {
  syncRestTimer({ persist: true, alert: event.type !== 'pagehide' });
}

function setupRestTimerLifecycleEvents() {
  document.addEventListener('visibilitychange', handleRestTimerLifecycleEvent);
  window.addEventListener('focus', handleRestTimerLifecycleEvent);
  window.addEventListener('pageshow', handleRestTimerLifecycleEvent);
  window.addEventListener('pagehide', handleRestTimerLifecycleEvent);
}

// ===== ブロック画面 =====
function renderBlock() {
  const s = store.currentState;
  const cells = [1, 2, 3, 4].map(r => {
    const cls = r === s.rotation ? 'current' : (r === 4 ? 'deload' : '');
    return `<div class="rotation-cell ${cls}">R${r}${r === 4 ? '<br><span class="muted" style="font-size:11px;">疲労抜き</span>' : ''}</div>`;
  }).join('');

  const suggestion = computeNextBlockSuggestion();
  const blockComplete = isCurrentBlockComplete();

  const sugHtml = suggestion.length > 0
    ? suggestion.map(s => `
      <div class="suggestion-row">
        <div>
          <div class="name">${s.name}</div>
          <div class="muted" style="font-size:12px;">${s.reason}</div>
        </div>
        <div class="delta">${s.delta > 0 ? '+' : ''}${s.delta}kg</div>
        <div>→ ${s.newMax}kg</div>
      </div>
    `).join('')
    : '<div class="muted">十分なログがないため提案なし</div>';

  // 未完了時は「参考提案」バナーを表示し、採用系ボタンを無効化
  const referenceBanner = !blockComplete
    ? `<div class="deload-banner" style="background:rgba(96,165,250,0.15);border-left-color:var(--accent);">
         <div class="label" style="color:var(--accent);">参考提案</div>
         <div class="muted">ブロック完了前のため参考提案です。正式な採用は4ローテ目Day8完了後に有効になります。</div>
       </div>`
    : `<div class="deload-banner" style="background:rgba(74,222,128,0.15);border-left-color:var(--success);">
         <div class="label" style="color:var(--success);">ブロック完了</div>
         <div class="muted">提案を採用すると、MAXを更新して次ブロック(R1/D1)へ自動的に進みます。</div>
       </div>`;

  const acceptBtnAttr = blockComplete ? '' : 'disabled style="opacity:0.45;cursor:not-allowed;"';
  const acceptHelp = blockComplete
    ? ''
    : '<div class="muted mt-8" style="font-size:12px;">※ ブロック完了前は採用できません</div>';

  // 1ローテ予定一覧（現在のローテの8日分）
  const rotationOverview = [1,2,3,4,5,6,7,8].map(d => {
    const m = getDayMenu(d, s.rotation, store.settings);
    const isCurrent = d === s.day;
    let summary;
    if (m.isRest) {
      summary = '<div class="muted" style="font-size:12px;">休み</div>';
    } else {
      const exItems = m.exercises.map(e => {
        const detail = e.plannedWeight != null
          ? `${e.plannedWeight}kg × ${e.plannedReps} × ${e.plannedSets}`
          : `${e.plannedReps} × ${e.plannedSets}`;
        return `<li><span class="ex-name" style="font-size:12px;">${e.name}</span> <span class="muted" style="font-size:11px;">${detail}</span></li>`;
      }).join('');
      summary = `<ul class="exercise-list" style="margin:4px 0 0;">${exItems}</ul>`;
    }
    return `
      <div class="rotation-day-card" style="border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:8px;${isCurrent ? 'border-color:var(--accent);background:rgba(96,165,250,0.05);' : ''}">
        <div class="row between" style="align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:600;">Day${d}${isCurrent ? ' <span class="text-warn" style="font-size:10px;">(現在)</span>' : ''}</div>
            <div class="muted" style="font-size:11px;">${m.name}</div>
          </div>
          <button class="btn-secondary btn-small" data-set-day="${d}" ${isCurrent ? 'disabled style="opacity:0.45;"' : ''}>このDayに設定</button>
        </div>
        ${summary}
      </div>
    `;
  }).join('');

  return `
    <h2 class="screen-title">ブロック管理</h2>
    <div class="section">
      <h2>現在の進捗</h2>
      <div class="row between">
        <div><span class="label">ブロック</span><div class="value-big">${s.block}</div></div>
        <div><span class="label">ローテ</span><div class="value-big">${s.rotation}/4</div></div>
        <div><span class="label">Day</span><div class="value-big">${s.day}/8</div></div>
      </div>
      <div class="rotation-grid">${cells}</div>
    </div>

    <div class="section">
      <h2>1ローテ予定一覧（R${s.rotation}）</h2>
      <div class="muted" style="font-size:12px;margin-bottom:8px;">
        現在のローテの8日分のメニューです。「このDayに設定」を押すと、ローテ・ブロックは変更せずDayだけ変更します（過去ログには影響しません）。
      </div>
      ${rotationOverview}
    </div>

    <div class="section">
      <h2>次ブロック重量提案 ${blockComplete ? '<span class="text-success" style="font-size:12px;">[正式]</span>' : '<span class="text-warn" style="font-size:12px;">[参考]</span>'}</h2>
      ${referenceBanner}
      ${sugHtml}
      <div class="btn-row mt-12">
        <button class="btn-success" id="btnAcceptSug" ${acceptBtnAttr}>提案を採用</button>
        <button class="btn-secondary" id="btnEditSug" ${acceptBtnAttr}>編集して採用</button>
        <button class="btn-ghost" id="btnIgnoreSug">提案を無視</button>
      </div>
      ${acceptHelp}
    </div>

    <div class="section">
      <h2>次ブロックへ進む</h2>
      <div class="muted mb-8">手動で次ブロック先頭(R1/D1)へ進めます</div>
      <button class="btn-primary" id="btnNextBlock" ${acceptBtnAttr}>次ブロックへ進む</button>
      ${blockComplete ? '' : '<div class="muted mt-8" style="font-size:12px;">※ 4ローテ目Day8完了後に使用できます</div>'}
    </div>
  `;
}

function afterBlock() {
  const sug = computeNextBlockSuggestion();
  const blockComplete = isCurrentBlockComplete();

  document.getElementById('btnAcceptSug').onclick = () => {
    if (!blockComplete) { showToast('ブロック完了前は採用できません（参考表示）'); return; }
    if (sug.length === 0) { showToast('提案がありません'); return; }
    sug.forEach(s => {
      store.settings.maxes[s.maxKey] = s.newMax;
    });
    store.blockSuggestions.push({ ts: Date.now(), block: store.currentState.block, suggestion: sug, accepted: true });
    // 自動的に次ブロック先頭へ進める
    store.currentState.block++;
    store.currentState.rotation = 1;
    store.currentState.day = 1;
    saveStore();
    showToast('MAX更新 → 次ブロック B' + store.currentState.block + ' に進みました');
    navigate('home');
  };
  document.getElementById('btnEditSug').onclick = () => {
    if (!blockComplete) { showToast('ブロック完了前は採用できません（参考表示）'); return; }
    openEditSuggestionModal(sug);
  };
  document.getElementById('btnIgnoreSug').onclick = () => {
    store.blockSuggestions.push({ ts: Date.now(), block: store.currentState.block, suggestion: sug, accepted: false });
    saveStore();
    showToast('提案を無視しました');
  };
  document.getElementById('btnNextBlock').onclick = () => {
    if (!blockComplete) { showToast('ブロック完了前は次ブロックへ進めません'); return; }
    if (!confirm('次ブロックへ進みますか？(現在ローテ/Dayはリセットされます)')) return;
    store.currentState.block++;
    store.currentState.rotation = 1;
    store.currentState.day = 1;
    saveStore();
    render();
  };

  // 「このDayに設定」ボタン: Dayだけを変更（block/rotation はそのまま）
  document.querySelectorAll('button[data-set-day]').forEach(btn => {
    btn.onclick = () => {
      const d = parseInt(btn.dataset.setDay);
      if (!d || d < 1 || d > 8) return;
      if (d === store.currentState.day) return;
      store.currentState.day = d;
      saveStore();
      showToast(`Day${d} に設定しました`);
      render();
    };
  });
}

function openEditSuggestionModal(sug) {
  if (sug.length === 0) { showToast('提案がありません'); return; }
  const html = sug.map((s, i) => `
    <label class="field">
      <span>${s.name} (現MAX: ${store.settings.maxes[s.maxKey]}kg)</span>
      <input type="number" step="0.5" data-i="${i}" value="${s.newMax}" />
    </label>
  `).join('') + '<button class="btn-primary" id="es-save">保存</button>';
  openModal('提案を編集', html, () => {
    document.getElementById('es-save').onclick = () => {
      sug.forEach((s, i) => {
        const v = parseFloat(document.querySelector(`#modal input[data-i="${i}"]`).value);
        if (v) store.settings.maxes[s.maxKey] = roundToIncrement(v, store.settings.increment);
      });
      store.blockSuggestions.push({ ts: Date.now(), block: store.currentState.block, suggestion: sug, accepted: true, edited: true });
      // 編集して採用も次ブロック先頭へ自動進行
      store.currentState.block++;
      store.currentState.rotation = 1;
      store.currentState.day = 1;
      saveStore();
      closeModal();
      showToast('編集して採用 → 次ブロック B' + store.currentState.block + ' に進みました');
      navigate('home');
    };
  });
}

// 現在のブロックが完了しているか
// 判定: 現ブロックのR4D8セッションがcompleted=true
function isCurrentBlockComplete() {
  const b = store.currentState.block;
  return Object.values(store.daySessions).some(s =>
    s.block === b && s.rotation === 4 && s.day === 8 && s.completed
  );
}

function computeNextBlockSuggestion() {
  // 現ブロックのログから判断
  const block = store.currentState.block;
  const blockLogs = store.logs.filter(l => l.block === block && !l.isDeload);
  if (blockLogs.length === 0) return [];

  const lifts = [
    { key: 'bench', maxKey: 'bench', name: 'ベンチプレス', range: [2.5, 2.5] },
    { key: 'squat', maxKey: 'squat', name: 'スクワット', range: [2.5, 5] },
    { key: 'halfDead', maxKey: 'halfDead', name: 'ハーフデッド', range: [2.5, 5] },
    { key: 'floorDead', maxKey: 'floorDead', name: '床引きデッド', range: [2.5, 5] },
  ];

  // 痛みの関連
  const painRelated = {
    bench: ['肘', '肩'],
    squat: ['腰', '膝'],
    halfDead: ['腰'],
    floorDead: ['腰'],
  };

  return lifts.map(lift => {
    const logs = blockLogs.filter(l => l.exerciseKey === lift.key);
    if (logs.length === 0) return null;

    let totalSets = 0, doneSets = 0, failures = 0;
    let highRPE = false;
    let painFlag = false;

    logs.forEach(l => {
      const planned = l.plannedSets || l.sets.length;
      totalSets += planned;
      doneSets += l.doneSets;
      if (l.doneSets < planned) failures += (planned - l.doneSets);
      if (l.rpe === '9' || l.rpe === '10') highRPE = true;
      if (l.pains && l.pains.some(p => painRelated[lift.key].includes(p))) painFlag = true;
    });

    let delta = 0;
    let reason = '';

    if (painFlag) {
      delta = 0;
      reason = '関連部位に痛み → 据え置き';
    } else if (failures >= 3) {
      delta = -lift.range[0];
      reason = '失敗多数 → 少し下げる';
    } else if (failures > 0) {
      delta = 0;
      reason = '失敗あり → 据え置き';
    } else if (highRPE) {
      delta = 0;
      reason = 'RPE9以上あり → 据え置き';
    } else {
      delta = lift.range[1];
      reason = '全セット成功・RPE8以下・痛みなし → 上げ提案';
    }

    const cur = store.settings.maxes[lift.maxKey];
    const newMax = roundToIncrement(cur + delta, store.settings.increment);
    return { ...lift, delta, reason, newMax };
  }).filter(Boolean);
}

// ===== ログ画面 =====
let logFilter = { type: 'all', exerciseKey: null };

function renderLog() {
  const tabs = `
    <div class="tabs">
      <div class="tab ${logFilter.type === 'all' ? 'active' : ''}" data-type="all">全て</div>
      <div class="tab ${logFilter.type === 'date' ? 'active' : ''}" data-type="date">日付別</div>
      <div class="tab ${logFilter.type === 'bench' ? 'active' : ''}" data-type="bench" data-ex="bench">ベンチ</div>
      <div class="tab ${logFilter.type === 'squat' ? 'active' : ''}" data-type="squat" data-ex="squat">スクワット</div>
      <div class="tab ${logFilter.type === 'halfDead' ? 'active' : ''}" data-type="halfDead" data-ex="halfDead">ハーフデッド</div>
      <div class="tab ${logFilter.type === 'floorDead' ? 'active' : ''}" data-type="floorDead" data-ex="floorDead">床引きデッド</div>
    </div>
  `;

  let logs = [...store.logs].sort((a, b) => b.ts - a.ts);
  if (['bench', 'squat', 'halfDead', 'floorDead'].includes(logFilter.type)) {
    logs = logs.filter(l => l.exerciseKey === logFilter.type);
  }

  const e1RM = (w, r) => r > 0 ? roundToIncrement(w * (1 + r / 30), 0.5) : 0;

  let body;
  if (logs.length === 0) {
    body = '<div class="muted">記録がありません</div>';
  } else {
    body = `
      <div style="overflow-x:auto;">
      <table class="log-table">
        <thead><tr>
          <th>日付</th><th>D/B/R</th><th>種目</th><th>予定</th><th>実施</th><th>RPE</th><th>痛み</th><th>e1RM</th>
        </tr></thead>
        <tbody>
          ${logs.map(l => {
            const setsTxt = l.sets.map(s => s.done ? `${s.weight}×${s.reps}` : `(${s.weight}×${s.reps})`).join(', ');
            const maxE = Math.max(...l.sets.filter(s => s.done).map(s => e1RM(s.weight, s.reps)), 0);
            return `<tr>
              <td>${l.date}</td>
              <td>D${l.day}/B${l.block}/R${l.rotation}${l.isDeload ? '*' : ''}</td>
              <td>${l.exerciseName}</td>
              <td>${l.plannedWeight ?? '-'}kg×${l.plannedReps}×${l.plannedSets}</td>
              <td>${setsTxt}</td>
              <td>${l.rpe}</td>
              <td>${l.pains.join(',') || '-'}</td>
              <td>${maxE || '-'}</td>
            </tr>${l.note ? `<tr><td colspan="8" class="muted">📝 ${l.note}</td></tr>` : ''}`;
          }).join('')}
        </tbody>
      </table>
      </div>
    `;
  }

  // BIG3用シンプルグラフ
  let graph = '';
  if (['bench', 'squat', 'halfDead', 'floorDead'].includes(logFilter.type)) {
    graph = renderSimpleGraph(logs, logFilter.type);
  }

  return `
    <h2 class="screen-title">ログ</h2>
    ${tabs}
    ${graph}
    <div class="section">
      ${body}
    </div>
    <div class="section">
      <h2>データ管理</h2>
      <div class="btn-row">
        <button class="btn-secondary btn-small" id="btnExport">エクスポート(JSON)</button>
        <button class="btn-secondary btn-small" id="btnImport">インポート(JSON)</button>
      </div>
    </div>
  `;
}

function renderSimpleGraph(logs, key) {
  const points = logs.filter(l => l.exerciseKey === key)
    .sort((a, b) => a.ts - b.ts)
    .map(l => {
      const e1 = Math.max(...l.sets.filter(s => s.done).map(s => s.weight * (1 + s.reps / 30)), 0);
      return { date: l.date, e1, w: Math.max(...l.sets.filter(s => s.done).map(s => s.weight), 0) };
    });
  if (points.length === 0) return '';

  const maxV = Math.max(...points.map(p => p.e1), 1);
  const minV = Math.min(...points.map(p => p.e1), maxV);
  const range = Math.max(1, maxV - minV);
  const w = 320, h = 140, pad = 20;

  const xStep = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const polyPts = points.map((p, i) => {
    const x = pad + i * xStep;
    const y = h - pad - ((p.e1 - minV) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  return `
    <div class="section">
      <h3>推定MAX(e1RM)推移</h3>
      <svg viewBox="0 0 ${w} ${h}" class="log-graph" preserveAspectRatio="none">
        <polyline fill="none" stroke="#60a5fa" stroke-width="2" points="${polyPts}" />
        ${points.map((p, i) => {
          const x = pad + i * xStep;
          const y = h - pad - ((p.e1 - minV) / range) * (h - pad * 2);
          return `<circle cx="${x}" cy="${y}" r="3" fill="#3b82f6" />`;
        }).join('')}
        <text x="${pad}" y="14" fill="#94a3b8" font-size="10">${Math.round(maxV)}kg</text>
        <text x="${pad}" y="${h - 4}" fill="#94a3b8" font-size="10">${Math.round(minV)}kg</text>
      </svg>
    </div>
  `;
}

function afterLog() {
  document.querySelectorAll('.tab[data-type]').forEach(t => {
    t.onclick = () => {
      logFilter.type = t.dataset.type;
      render();
    };
  });
  document.getElementById('btnExport').onclick = exportData;
  document.getElementById('btnImport').onclick = importData;
}

function exportData() {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `myliftlog-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/json';
  inp.onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!confirm('現在のデータを上書きしてインポートします。よろしいですか？')) return;
        store = { ...defaultStore(), ...data };
        saveStore();
        showToast('インポート完了');
        render();
      } catch (e) {
        alert('JSON読み込み失敗: ' + e.message);
      }
    };
    reader.readAsText(f);
  };
  inp.click();
}

// ===== 設定画面 =====
function renderAccessoryLoadCheck() {
  const summary = summarizeAccessoryLoad(store.settings);
  const warnings = getAccessoryLoadWarnings(store.settings);
  const rows = ACCESSORY_SUMMARY_KEYS.map(k => `
    <div class="suggestion-row">
      <div class="name">${k}</div>
      <div class="delta">${summary[k] || 0}セット</div>
    </div>
  `).join('');
  const warnHtml = warnings.length === 0
    ? '<div class="muted">現在の8日ローテ負荷は大きな警告なしです</div>'
    : warnings.map(w => `<div class="${w.level === 'danger' ? 'deload-banner' : 'plan-line'}"><span class="${w.level === 'danger' ? 'text-danger' : 'text-warn'}">${w.level === 'danger' ? '危険' : '注意'}:</span> ${w.message}</div>`).join('');
  return `
    <div class="section">
      <h2>負荷チェック</h2>
      <div class="muted" style="font-size:12px;margin-bottom:8px;">8日ローテ全体の補助セット数をカテゴリ・疲労タグ別に集計します。警告は提案であり、実行は禁止しません。</div>
      ${rows}
      <div class="mt-8">${warnHtml}</div>
    </div>
  `;
}

function renderAccessorySlotEditor() {
  const slots = store.settings.accessorySlots || defaultAccessorySlots();
  const dayLabels = {
    1: 'Day1: 脚前側補助 / カーフ',
    2: 'Day2: 胸補助 / 背中 / 腕',
    3: 'Day3: 肩 / 腰に優しい背中 / カーフ',
    5: 'Day5: 脚前側補助 / カーフ',
    6: 'Day6: 胸・三頭補助 / 背中 / 腕',
    7: 'Day7: 腰に優しい背中 / チンニング / カーフ',
  };
  return `
    <div class="section">
      <h2>補助種目編集</h2>
      <div class="muted" style="font-size:12px;margin-bottom:8px;">カテゴリ候補: ${ACCESSORY_CATEGORIES.join('、')}</div>
      <div class="muted" style="font-size:12px;margin-bottom:8px;">疲労タグ候補: ${ACCESSORY_FATIGUE_TAGS.join('、')}</div>
      ${Object.keys(dayLabels).map(day => `
        <div class="subsection" style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px;">
          <h3>${dayLabels[day]}</h3>
          ${(slots[day] || []).map(slot => `
            <div class="suggestion-row" style="align-items:flex-start;">
              <div class="name">
                <div class="strong">${slot.slotName}: ${slot.name}</div>
                <div class="muted" style="font-size:12px;">${slot.setsText || slot.plannedSets}セット / ${slot.reps}回 / 目標RPE${slot.targetRpe}</div>
                <div class="muted" style="font-size:11px;">${(slot.categories || []).join('・') || '-'} / ${(slot.fatigueTags || []).join('・') || '-'}</div>
              </div>
              <button class="btn-secondary btn-small" data-edit-slot-day="${day}" data-edit-slot-id="${slot.slotId}">編集</button>
              <button class="btn-danger btn-small" data-delete-slot-day="${day}" data-delete-slot-id="${slot.slotId}">削除</button>
            </div>
          `).join('')}
          <button class="btn-secondary btn-small" data-add-slot-day="${day}">種目追加</button>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSettings() {
  const m = store.settings.maxes;
  const s = store.currentState;
  const adjList = Object.entries(store.manualAdjustments).filter(([k, v]) => v !== 0);
  const volumeMode = store.settings.trainingVolumeMode || 'high';
  const strengthMode = store.settings.strengthMode || 'highIntensity';
  const accessoryMode = store.settings.accessoryManagementMode || 'aggressive';
  const accDefaults = store.settings.accessoryDefaults || {};

  // 補助種目重量編集UI
  const accKeys = ['incline_db','dips','shoulder','lying_ext','preacher','legpress','hack_squat','calf','latpulldown','machine_row','seated_row','pec_fly','rear_raise'];
  const accEditHtml = accKeys.map(k => {
    const def = accDefaults[k] || {};
    const dispName = ACCESSORY_DISPLAY_NAMES[k] || k;
    const noteHtml = def.note ? `<span class="muted" style="font-size:11px;"> ${def.note}</span>` : '';
    return `
      <div class="acc-edit-row" style="display:grid;grid-template-columns:1fr 90px 90px 70px;gap:6px;align-items:center;margin-bottom:6px;">
        <div style="font-size:13px;">${dispName}${noteHtml}</div>
        <input type="number" step="0.5" data-acc-key="${k}" data-acc-field="weight" value="${def.weight ?? ''}" placeholder="重量" style="font-size:13px;" />
        <input type="text" data-acc-key="${k}" data-acc-field="reps" value="${def.reps ?? ''}" placeholder="回数" style="font-size:13px;" />
        <input type="number" min="1" data-acc-key="${k}" data-acc-field="sets" value="${def.sets ?? ''}" placeholder="セット" style="font-size:13px;" />
      </div>
    `;
  }).join('');

  return `
    <h2 class="screen-title">設定</h2>

    <div class="section">
      <h2>MAX設定</h2>
      <label class="field"><span>ベンチプレスMAX (kg)</span><input type="number" step="0.5" id="set-bench" value="${m.bench}" /></label>
      <label class="field"><span>スクワットMAX (kg)</span><input type="number" step="0.5" id="set-squat" value="${m.squat}" /></label>
      <label class="field"><span>ハーフデッドMAX (kg)</span><input type="number" step="0.5" id="set-halfDead" value="${m.halfDead}" /></label>
      <label class="field"><span>床引きデッドMAX (kg)</span><input type="number" step="0.5" id="set-floorDead" value="${m.floorDead}" /></label>
      <div class="muted" style="font-size:11px;margin-top:-4px;margin-bottom:8px;">※ 床引きデッドはハーフデッド強化の補助・フォーム維持用途のため、初期値170kg。高強度モードでも強化対象になりません。</div>
      <label class="field"><span>重量刻み (kg)</span><input type="number" step="0.5" id="set-inc" value="${store.settings.increment}" /></label>
    </div>

    <div class="section">
      <h2>強度モード</h2>
      <div class="volume-mode-group">
        <label class="volume-mode-option ${strengthMode === 'standard' ? 'active' : ''}">
          <input type="radio" name="strengthMode" value="standard" ${strengthMode === 'standard' ? 'checked' : ''} />
          <div>
            <div class="opt-title">標準モード</div>
            <div class="muted opt-desc">安全寄りの強度。Day1/2/3はトップシングル+バックオフ構成。</div>
          </div>
        </label>
        <label class="volume-mode-option ${strengthMode === 'highIntensity' ? 'active' : ''}">
          <input type="radio" name="strengthMode" value="highIntensity" ${strengthMode === 'highIntensity' ? 'checked' : ''} />
          <div>
            <div class="opt-title">高強度モード <span class="text-warn" style="font-size:11px;">(初期値)</span></div>
            <div class="muted opt-desc">過去実績ベースの高強度メイン。Day1スクワット85.0/86.25/87.5%×5×3、Day2ベンチ85.0/87.0/89.0%×5×3、Day3ハーフデッド84.25/85.5/86.75%×5×3。Day7床引きデッドは変更なし。</div>
          </div>
        </label>
      </div>
      <div class="muted mt-8" style="font-size:12px;">
        ※ 4ローテ目（疲労抜き）は両モードとも同じ縮小ボリューム（モード切替の影響を受けません）。<br>
        ※ Day7床引きデッドはハーフデッド強化の補助・フォーム維持目的のため高強度モードでも変更されません。<br>
        ※ モード変更後、未実施の今後メニューに自動反映されます。<br>
        ※ 過去ログは書き換わりません。
      </div>
    </div>

    <div class="section">
      <h2>トレーニングボリューム</h2>
      <div class="volume-mode-group">
        <label class="volume-mode-option ${volumeMode === 'standard' ? 'active' : ''}">
          <input type="radio" name="volumeMode" value="standard" ${volumeMode === 'standard' ? 'checked' : ''} />
          <div>
            <div class="opt-title">標準モード</div>
            <div class="muted opt-desc">回復を優先した通常ボリューム。補助種目は控えめのセット数で疲労を抑えます。</div>
          </div>
        </label>
        <label class="volume-mode-option ${volumeMode === 'high' ? 'active' : ''}">
          <input type="radio" name="volumeMode" value="high" ${volumeMode === 'high' ? 'checked' : ''} />
          <div>
            <div class="opt-title">高ボリュームモード <span class="text-warn" style="font-size:11px;">(推奨)</span></div>
            <div class="muted opt-desc">補助種目と一部メインセットを増やした高ボリューム版。Day1/2/3/5/6/7の特定種目で +1セット、Day6ベンチボリュームは 4→5セット。</div>
          </div>
        </label>
      </div>
      <div class="muted mt-8" style="font-size:12px;">
        ※ 4ローテ目（疲労抜き）は両モードとも同じ縮小ボリュームです。<br>
        ※ モード変更後、未実施の今後メニューに自動反映されます。今日のメニューは「再計算」を押した時のみ更新されます（実施済みセットは保持）。<br>
        ※ 過去ログは書き換わりません。
      </div>
    </div>

    <div class="section">
      <h2>補助管理モード</h2>
      <div class="volume-mode-group">
        ${Object.entries(ACCESSORY_MANAGEMENT_MODES).map(([value, label]) => `
          <label class="volume-mode-option ${accessoryMode === value ? 'active' : ''}">
            <input type="radio" name="accessoryMode" value="${value}" ${accessoryMode === value ? 'checked' : ''} />
            <div>
              <div class="opt-title">${label}</div>
              <div class="muted opt-desc">${value === 'aggressive' ? '初期値。全成功RPE7以下は軽すぎ、RPE8〜9は適正、失敗やRPE9.5以上は攻めすぎとして提案します。' : value === 'fatigue' ? '疲労干渉と痛みリスクを強めに見て、セット削減・種目変更提案を優先します。' : '標準的に前回実績・RPE・痛みから重量提案します。'}</div>
            </div>
          </label>
        `).join('')}
      </div>
    </div>

    ${renderAccessorySlotEditor()}
    ${renderAccessoryLoadCheck()}

    <div class="section">
      <h2>補助種目の初期重量・回数・セット</h2>
      <div class="muted" style="font-size:12px;margin-bottom:8px;">
        補助種目はMAX計算なし、ここで設定した値が予定として表示されます。空欄にすると重量未設定（自分で入力）になります。
      </div>
      <div class="acc-edit-header" style="display:grid;grid-template-columns:1fr 90px 90px 70px;gap:6px;font-size:11px;color:var(--muted);margin-bottom:4px;">
        <div>種目</div><div>重量(kg)</div><div>回数</div><div>セット</div>
      </div>
      ${accEditHtml}
    </div>

    <div class="section">
      <h2>現在の進行</h2>
      <label class="field"><span>ブロック</span><input type="number" id="set-block" value="${s.block}" min="1" /></label>
      <label class="field"><span>ローテ (1-4)</span><input type="number" id="set-rotation" value="${s.rotation}" min="1" max="4" /></label>
      <label class="field"><span>Day (1-8)</span><input type="number" id="set-day" value="${s.day}" min="1" max="8" /></label>
    </div>

    <div class="section">
      <button class="btn-primary" id="btnSaveSettings">保存</button>
      <div class="btn-row mt-8">
        <button class="btn-warn" id="btnRecalcToday">今日のメニューを再計算</button>
        <button class="btn-danger" id="btnReset">初期値に戻す</button>
      </div>
      <div class="muted mt-8" style="font-size:12px;">
        ※ MAX変更後、未実施の今後メニューは新MAXで自動計算されます。<br>
        ※ 過去ログは書き換えません。<br>
        ※ 今日のメニューは「再計算」を押した時のみ更新されます（実施済みセットは保持）。
      </div>
    </div>

    <div class="section">
      <h2>手動調整一覧</h2>
      ${adjList.length === 0 ? '<div class="muted">調整なし</div>' :
        adjList.map(([k, v]) => `
          <div class="suggestion-row">
            <div class="name" style="font-size:13px;">${k}</div>
            <div class="delta">${v > 0 ? '+' : ''}${v}kg</div>
            <button class="btn-ghost btn-small" data-clear-adj="${k}">解除</button>
          </div>
        `).join('')
      }
    </div>

    <div class="section">
      <h2>データ管理</h2>
      <div class="btn-row">
        <button class="btn-secondary btn-small" id="btnExport2">エクスポート</button>
        <button class="btn-secondary btn-small" id="btnImport2">インポート</button>
        <button class="btn-danger btn-small" id="btnFullReset">全データ削除</button>
      </div>
      <div class="muted mt-8" style="font-size:12px;">
        ストレージキー: ${STORAGE_KEY}<br>
        バージョン: ${APP_VERSION}
      </div>
    </div>
  `;
}

function afterSettings() {
  document.getElementById('btnSaveSettings').onclick = () => {
    const newMaxes = {
      bench: parseFloat(document.getElementById('set-bench').value) || 0,
      squat: parseFloat(document.getElementById('set-squat').value) || 0,
      halfDead: parseFloat(document.getElementById('set-halfDead').value) || 0,
      floorDead: parseFloat(document.getElementById('set-floorDead').value) || 0,
    };
    const newInc = parseFloat(document.getElementById('set-inc').value) || 2.5;
    const newState = {
      block: parseInt(document.getElementById('set-block').value) || 1,
      rotation: Math.min(4, Math.max(1, parseInt(document.getElementById('set-rotation').value) || 1)),
      day: Math.min(8, Math.max(1, parseInt(document.getElementById('set-day').value) || 1)),
    };
    const volumeRadio = document.querySelector('input[name="volumeMode"]:checked');
    const newVolumeMode = volumeRadio ? volumeRadio.value : (store.settings.trainingVolumeMode || 'high');
    const strengthRadio = document.querySelector('input[name="strengthMode"]:checked');
    const newStrengthMode = strengthRadio ? strengthRadio.value : (store.settings.strengthMode || 'highIntensity');
    const accessoryModeRadio = document.querySelector('input[name="accessoryMode"]:checked');
    const newAccessoryMode = accessoryModeRadio ? accessoryModeRadio.value : (store.settings.accessoryManagementMode || 'aggressive');

    // 補助種目重量の収集
    const newAccDefaults = { ...(store.settings.accessoryDefaults || {}) };
    document.querySelectorAll('input[data-acc-key]').forEach(inp => {
      const key = inp.dataset.accKey;
      const field = inp.dataset.accField;
      newAccDefaults[key] = newAccDefaults[key] ? { ...newAccDefaults[key] } : {};
      const val = inp.value.trim();
      if (field === 'weight') {
        newAccDefaults[key].weight = val === '' ? null : parseFloat(val);
      } else if (field === 'sets') {
        const n = parseInt(val);
        newAccDefaults[key].sets = isNaN(n) ? null : n;
      } else { // reps
        newAccDefaults[key].reps = val === '' ? null : val;
      }
    });

    store.settings.maxes = newMaxes;
    store.settings.increment = newInc;
    store.settings.trainingVolumeMode = newVolumeMode;
    store.settings.strengthMode = newStrengthMode;
    store.settings.accessoryManagementMode = newAccessoryMode;
    store.settings.accessoryDefaults = newAccDefaults;
    store.currentState = { ...store.currentState, ...newState };
    saveStore();
    showToast('保存しました');
    render();
  };

  // ラジオボタンの見た目同期（即時反映用、保存は明示的にボタンで）
  document.querySelectorAll('input[name="volumeMode"]').forEach(r => {
    r.addEventListener('change', () => {
      document.querySelectorAll('input[name="volumeMode"]').forEach(other => {
        const opt = other.closest('.volume-mode-option');
        if (opt) opt.classList.toggle('active', other.checked);
      });
    });
  });
  document.querySelectorAll('input[name="strengthMode"]').forEach(r => {
    r.addEventListener('change', () => {
      document.querySelectorAll('input[name="strengthMode"]').forEach(other => {
        const opt = other.closest('.volume-mode-option');
        if (opt) opt.classList.toggle('active', other.checked);
      });
    });
  });
  document.querySelectorAll('input[name="accessoryMode"]').forEach(r => {
    r.addEventListener('change', () => {
      document.querySelectorAll('input[name="accessoryMode"]').forEach(other => {
        const opt = other.closest('.volume-mode-option');
        if (opt) opt.classList.toggle('active', other.checked);
      });
    });
  });

  document.querySelectorAll('button[data-edit-slot-id]').forEach(btn => {
    btn.onclick = () => {
      const day = btn.dataset.editSlotDay;
      const slotId = btn.dataset.editSlotId;
      const slot = (store.settings.accessorySlots?.[day] || []).find(s => s.slotId === slotId);
      if (slot) openAccessorySlotSettingsModal(day, slot);
    };
  });
  document.querySelectorAll('button[data-delete-slot-id]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('この補助種目を今後のメニューから削除しますか？')) return;
      deleteAccessorySlot(btn.dataset.deleteSlotDay, btn.dataset.deleteSlotId);
      saveStore();
      render();
      showToast('補助種目を削除しました');
    };
  });
  document.querySelectorAll('button[data-add-slot-day]').forEach(btn => {
    btn.onclick = () => {
      addAccessorySlot(btn.dataset.addSlotDay);
      saveStore();
      render();
      showToast('補助種目を追加しました');
    };
  });

  document.getElementById('btnRecalcToday').onclick = () => {
    const hadDone = recalculateTodaySession();
    showToast(hadDone ? '今日のメニュー再計算（実施済みセットは保持）' : '今日のメニュー再計算しました');
  };

  document.getElementById('btnReset').onclick = () => {
    if (!confirm('MAXを初期値に戻しますか？(過去ログは保持されます)')) return;
    store.settings = deepClone(DEFAULT_SETTINGS);
    saveStore();
    showToast('初期値に戻しました');
    render();
  };

  document.querySelectorAll('button[data-clear-adj]').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.clearAdj;
      delete store.manualAdjustments[k];
      saveStore();
      showToast('調整を解除しました');
      render();
    };
  });

  document.getElementById('btnExport2').onclick = exportData;
  document.getElementById('btnImport2').onclick = importData;
  document.getElementById('btnFullReset').onclick = () => {
    if (!confirm('全データを削除します。本当によろしいですか？(取り消し不可)')) return;
    if (!confirm('もう一度確認します。本当に全削除しますか？')) return;
    localStorage.removeItem(STORAGE_KEY);
    store = defaultStore();
    saveStore();
    showToast('全データを削除しました');
    render();
  };
}

// ===== 初期化 =====
function init() {
  // Nav
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.addEventListener('click', () => navigate(b.dataset.screen));
  });
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
  setupRestTimerControls();
  setupRestTimerLifecycleEvents();
  restoreRestTimer();

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(e => console.warn('SW reg failed', e));
  }

  navigate('home');
}

document.addEventListener('DOMContentLoaded', init);

if (typeof window !== 'undefined') {
  window.__mllTest = {
    startRestTimer,
    syncRestTimer,
    restoreRestTimer,
    adjustRestTimer,
    resetRestTimer,
    closeRestTimer,
    setupRestTimerControls,
    setupRestTimerLifecycleEvents,
    getDayMenu,
    defaultAccessorySlots,
    buildAccessoryExercises,
    summarizeAccessoryLoad,
    getAccessoryLoadWarnings,
    suggestAccessoryProgression,
    addAccessorySlot,
    deleteAccessorySlot,
    renderToday,
    getRestState: () => ({ ...restState }),
    getStore: () => store,
    setNowProvider: (fn) => { nowProvider = fn; },
  };
}
