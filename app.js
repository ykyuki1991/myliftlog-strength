/* ==========================================================================
   MyLiftLog Strength Planner - app.js
   ========================================================================== */

'use strict';

// ===== 定数 =====
const STORAGE_KEY = 'mll_strength_planner_v1';
const APP_VERSION = '1.0.0';

const DEFAULT_SETTINGS = {
  programMode: 'fourMenu',
  maxes: {
    bench: 115,
    squat: 160,
    halfDead: 190,
    // 床引きデッドはユーザーが過去にハードにやっていない種目。技術練習・補助的位置づけのため初期値170kg固定。
    floorDead: 170,
    shoulderPress: 77.5,
  },
  increment: 2.5,
  // 'standard' = 通常ボリューム / 'high' = 補助種目と一部メインセットを増量した高ボリュームモード
  trainingVolumeMode: 'high',
  // 'standard' = 安全寄りメイン強度 / 'highIntensity' = 過去実績に近い高強度メイン
  strengthMode: 'highIntensity',
  // R4デロード時のMAX測定方針
  deloadMaxTestMode: 'trueOneRm',
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
    side_raise:  { weight: null, reps: '12〜20', sets: 3 },
    rear_delt_fly: { weight: null, reps: '12〜20', sets: 3 },
    face_pull:   { weight: null, reps: '12〜20', sets: 3 },
  },
  accessoryManagementMode: 'aggressive',
  rotationIncreaseCaps: {
    bench: 2.5,
    squat: 2.5,
    halfDead: 2.5,
    floorDead: 2.5,
  },
  // R4は固定デロードではなく、状態を見てユーザーが選ぶ調整ローテとして扱う。
  r4AdjustmentModes: {},
  // BIG3メイン編集の「今後も変更」。Day×種目×メニュー種別単位で保存し、過去ログは変更しない。
  mainSetOverrides: {},
  // 一定期間だけ部位・種目を休止する設定。予定から外し、失敗/未完了扱いにしない。
  exerciseRestSettings: [],
  accessorySlots: null,
  accessoryShoulderDefaultsAdded: true,
  day7BulgarianDefaultAdded: true,
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
  side_raise: 'サイドレイズ',
  rear_delt_fly: 'リアデルトフライ',
  face_pull: 'フェイスプル',
  row: 'ロウ系',
  chinning: 'チンニング',
};

const DEFAULT_STATE = {
  block: 1,
  rotation: 1,  // 1〜4
  day: 1,       // 1〜8
  lastTrainingDate: null,
  nextMenuKey: 'shoulder_arm',
  isRestSelected: false,
  backCompletedCount: 0,
  lastCompletedMenuKey: null,
  lastCompletedDate: null,
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

// 状態選択肢。部位チェックだけで重量提案を止めないため、強度を中心に記録する。
const PAIN_OPTIONS = ['なし', '違和感', '痛み', '強い痛み'];
const EXERCISE_REST_PARTS = ['胸', '肩', '肘', '腰', '膝', '脚', '背中', '腕'];

// RPE選択肢
const RPE_OPTIONS = ['未入力', '6', '7', '8', '8.5', '9', '9.5', '10'];

const BIG3_LIFTS = {
  bench: { key: 'bench', maxKey: 'bench', name: 'ベンチプレス' },
  squat: { key: 'squat', maxKey: 'squat', name: 'スクワット' },
  halfDead: { key: 'halfDead', maxKey: 'halfDead', name: 'ハーフデッド' },
  floorDead: { key: 'floorDead', maxKey: 'floorDead', name: '床引きデッド' },
};

const FOUR_MENU_ORDER = ['shoulder_arm', 'legs', 'chest', 'back'];
const FOUR_MENU_LABELS = {
  shoulder_arm: '肩・腕',
  legs: '脚',
  chest: '胸',
  back: '背中',
  rest: '休み',
};
const FOUR_MENU_MAIN_LIFTS = {
  shoulderPress: { key: 'shoulderPress', maxKey: 'shoulderPress', name: 'ショルダープレス', fallbackWeight: 65 },
  squat: { key: 'squat', maxKey: 'squat', name: 'スクワット', fallbackWeight: 145 },
  bench: { key: 'bench', maxKey: 'bench', name: 'ベンチプレス', fallbackWeight: 107.5 },
  halfDead: { key: 'halfDead', maxKey: 'halfDead', name: 'ハーフデッド', fallbackWeight: 162.5 },
  floorDead: { key: 'floorDead', maxKey: 'floorDead', name: '床引きデッド', fallbackWeight: 162.5 },
};
const FOUR_MENU_MAIN_BY_MENU = {
  shoulder_arm: 'shoulderPress',
  legs: 'squat',
  chest: 'bench',
};

const BIG3_KEY_ALIASES = {
  floor_dead: 'floorDead',
  floorDeadlift: 'floorDead',
  floor_deadlift: 'floorDead',
  'floor deadlift': 'floorDead',
  '床引きデッド': 'floorDead',
};

const DELOAD_MAX_TEST_MODES = {
  off: 'OFF',
  trueOneRm: '1RM',
};

const DELOAD_MAX_TEST_DAY_LIFTS = {
  1: 'squat',
  2: 'bench',
  3: 'halfDead',
  7: 'floorDead',
};

const R4_ADJUSTMENT_MODES = {
  normalDeload: { label: '通常デロード', short: '通常', deload: true, deloadPct: 65 },
  lightDeload: { label: '軽めデロード', short: '軽め', deload: true, deloadPct: 70 },
  maintain: { label: '維持', short: '維持', deload: false },
  normalish: { label: '通常寄り', short: '通常寄り', deload: false },
  custom: { label: 'カスタム', short: 'カスタム', deload: false },
};

const ACCESSORY_PRESET_GROUPS = [
  {
    group: '胸',
    presets: [
      { key: 'incline_db', name: 'インクラインDBプレス', slotName: '胸補助', setsText: '3', plannedSets: 3, reps: '8〜10', targetRpe: '8〜9', categories: ['胸', 'ベンチ系プレス'], fatigueTags: ['肩負荷'], weightType: 'dumbbell' },
      { key: 'db_press', name: 'ダンベルプレス', slotName: '胸補助', setsText: '3', plannedSets: 3, reps: '8〜10', targetRpe: '8〜9', categories: ['胸', 'ベンチ系プレス'], fatigueTags: ['肩負荷'], weightType: 'dumbbell' },
      { key: 'machine_chest_press', name: 'マシンチェストプレス', slotName: '胸補助', setsText: '3', plannedSets: 3, reps: '8〜12', targetRpe: '8〜9', categories: ['胸', 'ベンチ系プレス'], fatigueTags: ['肩負荷'], weightType: 'upper_machine' },
      { key: 'pec_fly', name: 'ペックフライ', slotName: '胸補助', setsText: '2〜3', plannedSets: 3, reps: '10〜15', targetRpe: '8〜9', categories: ['胸'], fatigueTags: ['肩負荷', '低リスク'], weightType: 'upper_machine' },
      { key: 'cable_fly', name: 'ケーブルフライ', slotName: '胸補助', setsText: '2〜3', plannedSets: 3, reps: '10〜15', targetRpe: '8〜9', categories: ['胸'], fatigueTags: ['肩負荷', '低リスク'], weightType: 'cable' },
      { key: 'dips', name: 'ディップス', slotName: '胸・三頭補助', setsText: '2〜3', plannedSets: 3, reps: '6〜10', targetRpe: '8〜9', categories: ['胸', '腕', 'ベンチ系プレス'], fatigueTags: ['肩負荷', '肘負荷'], weightType: 'bodyweight' },
    ],
  },
  {
    group: '背中',
    presets: [
      { key: 'chinning', name: 'チンニング', slotName: 'チンニング', setsText: '2〜3', plannedSets: 3, reps: '5〜8', targetRpe: '8', categories: ['背中', 'チンニング系'], fatigueTags: ['肘負荷', '握力負荷'], weightType: 'bodyweight' },
      { key: 'latpulldown', name: 'ラットプルダウン', slotName: '背中', setsText: '3', plannedSets: 3, reps: '8〜12', targetRpe: '8〜9', categories: ['背中'], fatigueTags: ['肘負荷'], weightType: 'upper_machine' },
      { key: 'seated_row', name: 'シーテッドロウ', slotName: '背中', setsText: '3', plannedSets: 3, reps: '8〜12', targetRpe: '8〜9', categories: ['背中', 'ロウ系'], fatigueTags: ['低リスク'], weightType: 'upper_machine' },
      { key: 'machine_row', name: 'マシンロウ', slotName: '背中', setsText: '3', plannedSets: 3, reps: '8〜12', targetRpe: '8〜9', categories: ['背中', 'ロウ系'], fatigueTags: ['低リスク'], weightType: 'upper_machine' },
      { key: 'cable_row', name: 'ケーブルロウ', slotName: '背中', setsText: '3', plannedSets: 3, reps: '8〜12', targetRpe: '8〜9', categories: ['背中', 'ロウ系'], fatigueTags: ['低リスク'], weightType: 'cable' },
      { key: 'one_hand_db_row', name: 'ワンハンドDBロウ', slotName: '背中', setsText: '2〜3', plannedSets: 3, reps: '8〜12', targetRpe: '8〜9', categories: ['背中', 'ロウ系'], fatigueTags: ['腰負荷', '握力負荷'], weightType: 'dumbbell' },
      { key: 'barbell_row', name: 'バーベルロウ', slotName: '背中', setsText: '2〜3', plannedSets: 3, reps: '6〜10', targetRpe: '8', categories: ['背中', 'ロウ系', 'デッド・腰背部負荷'], fatigueTags: ['腰負荷', '握力負荷'], weightType: 'barbell' },
    ],
  },
  {
    group: '脚',
    presets: [
      { key: 'legpress', name: 'レッグプレス', slotName: '脚前側補助', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8', categories: ['脚前側', '脚補助'], fatigueTags: ['膝負荷'], weightType: 'leg_machine' },
      { key: 'hack_squat', name: 'ハックスクワット', slotName: '脚前側補助', setsText: '2〜3', plannedSets: 3, reps: '8〜10', targetRpe: '8', categories: ['脚前側', '脚補助'], fatigueTags: ['膝負荷'], weightType: 'leg_machine' },
      { key: 'leg_extension', name: 'レッグエクステンション', slotName: '脚前側補助', setsText: '2〜3', plannedSets: 3, reps: '10〜15', targetRpe: '8〜9', categories: ['脚前側', '脚補助'], fatigueTags: ['膝負荷'], weightType: 'leg_machine' },
      { key: 'leg_curl', name: 'レッグカール', slotName: '脚後側補助', setsText: '2〜3', plannedSets: 3, reps: '10〜15', targetRpe: '8〜9', categories: ['脚後側', '脚補助'], fatigueTags: ['低リスク'], weightType: 'leg_machine' },
      { key: 'bulgarian_split_squat', name: 'ブルガリアンスクワット', slotName: '脚前側補助', setsText: '2', plannedSets: 2, reps: '8〜12', targetRpe: '8', categories: ['脚前側', '脚補助'], fatigueTags: ['膝負荷'], weightType: 'dumbbell' },
      { key: 'romanian_deadlift', name: 'ルーマニアンデッドリフト', slotName: '脚後側補助', setsText: '2〜3', plannedSets: 3, reps: '6〜10', targetRpe: '8', categories: ['脚後側', 'デッド・腰背部負荷'], fatigueTags: ['腰負荷', '握力負荷'], weightType: 'barbell' },
      { key: 'calf', name: 'カーフレイズ', slotName: 'カーフ', setsText: '2〜4', plannedSets: 4, reps: '12〜20', targetRpe: '8〜9', categories: ['カーフ', '脚補助'], fatigueTags: ['低リスク'], weightType: 'leg_machine' },
      { key: 'seated_calf', name: 'シーテッドカーフレイズ', slotName: 'カーフ', setsText: '2〜4', plannedSets: 4, reps: '12〜20', targetRpe: '8〜9', categories: ['カーフ', '脚補助'], fatigueTags: ['低リスク'], weightType: 'leg_machine' },
    ],
  },
  {
    group: '肩',
    presets: [
      { key: 'shoulder', name: 'ショルダープレス', slotName: '肩', setsText: '2〜3', plannedSets: 3, reps: '5〜8', targetRpe: '7〜8', categories: ['肩', '肩プレス系'], fatigueTags: ['肩負荷'], weightType: 'dumbbell' },
      { key: 'machine_shoulder_press', name: 'マシンショルダープレス', slotName: '肩', setsText: '2〜3', plannedSets: 3, reps: '6〜10', targetRpe: '7〜8', categories: ['肩', '肩プレス系'], fatigueTags: ['肩負荷'], weightType: 'upper_machine' },
      { key: 'side_raise', name: 'サイドレイズ', slotName: '肩', setsText: '3', plannedSets: 3, reps: '12〜20', targetRpe: '8〜9', categories: ['肩', '横肩', '肩補助'], fatigueTags: ['肩負荷', '低リスク'], weightType: 'dumbbell' },
      { key: 'cable_side_raise', name: 'ケーブルサイドレイズ', slotName: '肩', setsText: '2〜3', plannedSets: 3, reps: '12〜20', targetRpe: '8〜9', categories: ['肩', '横肩', '肩補助'], fatigueTags: ['肩負荷', '低リスク'], weightType: 'cable' },
      { key: 'rear_delt_fly', name: 'リアデルトフライ', slotName: 'リアデルト系', setsText: '3', plannedSets: 3, reps: '12〜20', targetRpe: '8〜9', categories: ['肩', '後ろ肩', '肩補助'], fatigueTags: ['肩負荷', '低リスク'], weightType: 'upper_machine' },
      { key: 'face_pull', name: 'フェイスプル', slotName: 'リアデルト系', setsText: '3', plannedSets: 3, reps: '12〜20', targetRpe: '8〜9', categories: ['肩', '後ろ肩', '背中', '肩補助'], fatigueTags: ['肩負荷', '低リスク'], weightType: 'cable' },
      { key: 'front_raise', name: 'フロントレイズ', slotName: '肩', setsText: '2', plannedSets: 2, reps: '10〜15', targetRpe: '8', categories: ['肩'], fatigueTags: ['肩負荷'], weightType: 'dumbbell' },
    ],
  },
  {
    group: '腕',
    presets: [
      { key: 'preacher', name: 'ワンハンドDBプリーチャーカール', slotName: '腕', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'dumbbell' },
      { key: 'incline_db_curl', name: 'インクラインダンベルカール', slotName: '腕', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'dumbbell' },
      { key: 'preacher_curl', name: 'プリーチャーカール', slotName: '腕', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'upper_machine' },
      { key: 'hammer_curl', name: 'ハンマーカール', slotName: '腕', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'dumbbell' },
      { key: 'cable_curl', name: 'ケーブルカール', slotName: '腕', setsText: '2〜3', plannedSets: 3, reps: '10〜15', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'cable' },
      { key: 'lying_ext', name: 'ライイングエクステンション', slotName: '腕', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'barbell' },
      { key: 'cable_pressdown', name: 'ケーブルプレスダウン', slotName: '腕', setsText: '2〜3', plannedSets: 3, reps: '10〜15', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'cable' },
      { key: 'oh_triceps_ext', name: 'オーバーヘッドトライセプスエクステンション', slotName: '腕', setsText: '2〜3', plannedSets: 3, reps: '10〜15', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷', '肩負荷'], weightType: 'cable' },
    ],
  },
  {
    group: 'カスタム',
    presets: [
      { key: 'custom', name: '自由入力', slotName: '補助スロット', setsText: '2', plannedSets: 2, reps: '8〜12', targetRpe: '8', categories: [], fatigueTags: [], weightType: 'upper_machine', custom: true },
    ],
  },
];

const ACCESSORY_PRESETS = ACCESSORY_PRESET_GROUPS.flatMap(group => group.presets.map(preset => ({ ...preset, group: group.group })));

const ACCESSORY_CATEGORIES = [
  '胸', '背中', '肩', '腕', '脚前側', '脚後側', 'カーフ',
  'ベンチ系プレス', 'デッド・腰背部負荷', '肩プレス系',
  'チンニング系', 'ロウ系', '脚補助', '横肩', '後ろ肩', '肩補助',
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
  'ベンチ系プレス', 'デッド・腰背部負荷', '横肩', '後ろ肩', '肩補助',
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
    { slotId: 'd3-shoulder', slotName: '肩', key: 'shoulder', name: 'ショルダープレス', setsText: '2〜3', plannedSets: 3, reps: '5〜8', targetRpe: '7〜8', categories: ['肩', '肩補助', '肩プレス系'], fatigueTags: ['肩負荷'], weightType: 'upper_machine', restType: 'shoulder' },
    { slotId: 'd3-side-raise', slotName: '肩', key: 'side_raise', name: 'サイドレイズ', setsText: '3', plannedSets: 3, reps: '12〜20', targetRpe: '8〜9', categories: ['肩', '肩補助', '横肩'], fatigueTags: ['低リスク', '肩負荷'], weightType: 'dumbbell', restType: 'default' },
    { slotId: 'd3-back-friendly', slotName: '背中', key: 'friendly_row', name: 'ロウ系', setsText: '2〜3', plannedSets: 3, reps: '8〜10', targetRpe: '8', categories: ['背中', 'ロウ系'], fatigueTags: ['腰に優しい', '低リスク'], weightType: 'upper_machine', restType: 'row' },
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
    { slotId: 'd6-rear-delt', slotName: 'リアデルト系', key: 'rear_delt_fly', name: 'リアデルトフライ', setsText: '3', plannedSets: 3, reps: '12〜20', targetRpe: '8〜9', categories: ['肩', '背中', '肩補助', '後ろ肩'], fatigueTags: ['低リスク', '肩負荷'], weightType: 'upper_machine', restType: 'default' },
    { slotId: 'd6-arm-curl', slotName: '腕', key: 'preacher', name: 'ワンハンドDBプリーチャーカール', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'arm', restType: 'arm' },
    { slotId: 'd6-arm-ext', slotName: '腕', key: 'lying_ext', name: 'ライイングエクステンション', setsText: '2〜3', plannedSets: 3, reps: '10〜12', targetRpe: '8〜9', categories: ['腕'], fatigueTags: ['肘負荷'], weightType: 'arm', restType: 'arm' },
  ],
  7: [
    { slotId: 'd7-bulgarian', slotName: '脚前側補助', key: 'bulgarian_split_squat', name: 'ブルガリアンスクワット', setsText: '2', plannedSets: 2, reps: '8〜12', targetRpe: '7〜8', categories: ['脚前側', '脚補助'], fatigueTags: ['膝負荷'], weightType: 'dumbbell', restType: 'default' },
    { slotId: 'd7-back-friendly', slotName: '背中', key: 'friendly_row', name: 'ロウ系', setsText: '2', plannedSets: 2, reps: '8〜12', targetRpe: '8', categories: ['背中', 'ロウ系'], fatigueTags: ['腰に優しい', '低リスク'], weightType: 'upper_machine', restType: 'row' },
    { slotId: 'd7-chin', slotName: 'チンニング', key: 'chinning', name: 'チンニング', setsText: '2', plannedSets: 2, reps: '5〜8', targetRpe: '8', categories: ['背中', 'チンニング系'], fatigueTags: ['肘負荷', '握力負荷'], weightType: 'bodyweight', restType: 'chinning' },
    { slotId: 'd7-calf', slotName: 'カーフ', key: 'calf', name: 'カーフレイズ', setsText: '3', plannedSets: 3, reps: '12〜20', targetRpe: '8〜9', categories: ['カーフ'], fatigueTags: ['低リスク'], weightType: 'calf', restType: 'calf' },
  ],
};

const FOUR_MENU_ACCESSORY_SLOTS = {
  shoulder_arm: [
    { slotId: 'fm-shoulder-side-raise', slotName: '肩', key: 'side_raise', name: 'サイドレイズ', plannedSets: 3, setsText: '3', reps: '12〜20', targetRpe: '8〜9', plannedWeight: 14, weightType: 'dumbbell', categories: ['肩', '横肩', '肩補助'], fatigueTags: ['肩負荷', '低リスク'], restType: 'default' },
    { slotId: 'fm-shoulder-rear-delt', slotName: '肩', key: 'rear_delt_fly', name: 'リアデルトフライ', plannedSets: 3, setsText: '3', reps: '12〜20', targetRpe: '8〜9', plannedWeight: 57, weightType: 'upper_machine', categories: ['肩', '後ろ肩', '肩補助'], fatigueTags: ['肩負荷', '低リスク'], restType: 'default' },
    { slotId: 'fm-arm-curl', slotName: '腕', key: 'preacher', name: 'ワンハンドDBプリーチャーカール', plannedSets: 3, setsText: '3', reps: '10〜12', targetRpe: '8〜9', plannedWeight: 14, weightType: 'dumbbell', categories: ['腕'], fatigueTags: ['肘負荷'], restType: 'arm' },
    { slotId: 'fm-arm-ext', slotName: '腕', key: 'lying_ext', name: 'ライイングエクステンション', plannedSets: 3, setsText: '3', reps: '10〜12', targetRpe: '8〜9', plannedWeight: 30, weightType: 'barbell', categories: ['腕'], fatigueTags: ['肘負荷'], restType: 'arm' },
  ],
  legs: [
    { slotId: 'fm-leg-press', slotName: '脚', key: 'legpress', name: 'レッグプレス', plannedSets: 3, setsText: '3', reps: '10〜12', targetRpe: '8', plannedWeight: 240, weightType: 'leg_machine', categories: ['脚前側', '脚補助'], fatigueTags: ['膝負荷'], restType: 'default' },
    { slotId: 'fm-leg-curl', slotName: '脚', key: 'leg_curl', name: 'レッグカール', plannedSets: 3, setsText: '3', reps: '10〜15', targetRpe: '8〜9', plannedWeight: 70, weightType: 'leg_machine', categories: ['脚後側', '脚補助'], fatigueTags: ['低リスク'], restType: 'default' },
    { slotId: 'fm-calf', slotName: 'カーフ', key: 'calf', name: 'カーフレイズ', plannedSets: 4, setsText: '4', reps: '12〜20', targetRpe: '8〜9', plannedWeight: 120, weightType: 'leg_machine', categories: ['カーフ', '脚補助'], fatigueTags: ['低リスク'], restType: 'calf' },
  ],
  chest: [
    { slotId: 'fm-incline-db', slotName: '胸', key: 'incline_db', name: 'インクラインDBプレス', plannedSets: 3, setsText: '3', reps: '8〜10', targetRpe: '8〜9', plannedWeight: 38, weightType: 'dumbbell', categories: ['胸', 'ベンチ系プレス'], fatigueTags: ['肩負荷'], restType: 'incline_db' },
    { slotId: 'fm-dips', slotName: '胸・腕', key: 'dips', name: 'ディップス', plannedSets: 3, setsText: '3', reps: '6〜10', targetRpe: '8〜9', plannedWeight: 90, weightType: 'bodyweight', categories: ['胸', '腕', 'ベンチ系プレス'], fatigueTags: ['肩負荷', '肘負荷'], restType: 'dips' },
    { slotId: 'fm-pec-fly', slotName: '胸', key: 'pec_fly', name: 'ペックフライ', plannedSets: 3, setsText: '3', reps: '10〜15', targetRpe: '8〜9', plannedWeight: 70, weightType: 'upper_machine', categories: ['胸'], fatigueTags: ['肩負荷', '低リスク'], restType: 'default' },
  ],
  back: [
    { slotId: 'fm-latpulldown', slotName: '背中', key: 'latpulldown', name: 'ラットプルダウン', plannedSets: 3, setsText: '3', reps: '8〜12', targetRpe: '8〜9', plannedWeight: 86, weightType: 'upper_machine', categories: ['背中'], fatigueTags: ['肘負荷'], restType: 'chinning' },
    { slotId: 'fm-machine-row', slotName: '背中', key: 'machine_row', name: 'マシンロウ', plannedSets: 3, setsText: '3', reps: '8〜12', targetRpe: '8〜9', plannedWeight: 160, weightType: 'upper_machine', categories: ['背中', 'ロウ系'], fatigueTags: ['低リスク'], restType: 'row' },
    { slotId: 'fm-rear-delt-back', slotName: '肩', key: 'rear_delt_fly', name: 'リアデルトフライ', plannedSets: 3, setsText: '3', reps: '12〜20', targetRpe: '8〜9', plannedWeight: 57, weightType: 'upper_machine', categories: ['肩', '背中', '後ろ肩', '肩補助'], fatigueTags: ['肩負荷', '低リスク'], restType: 'default' },
  ],
};

// ===== ストア =====
let store = loadStore();
let blockViewRotation = null;
let accessoryEditorOpenDay = null;

function defaultStore() {
  return {
    version: APP_VERSION,
    settings: { ...deepClone(DEFAULT_SETTINGS), accessorySlots: defaultAccessorySlots() },
    currentState: deepClone(DEFAULT_STATE),
    logs: [],                // {id, date, day, block, rotation, exerciseKey, exerciseName, menuType, plannedWeight, plannedReps, plannedSets, sets:[{w,r,done}], rpe, pains:[], note, manualAdjusted, ts}
    manualAdjustments: {},   // key: "Day-exerciseKey-menuType" → kg差分
    blockSuggestions: [],    // 過去の提案履歴
    rotationProgressions: [], // BIG3ローテ微増提案/採用履歴
    estimatedMaxHistory: [],  // BIG3推定MAX履歴
    maxTestResults: [],       // デロード/MAX測定結果
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
    const shoulderDefaultsAlreadyAdded = parsed.settings?.accessoryShoulderDefaultsAdded === true;
    const day7BulgarianDefaultAdded = parsed.settings?.day7BulgarianDefaultAdded === true;
    const mergedAccessorySlots = mergeAccessorySlots(parsed.settings?.accessorySlots, shoulderDefaultsAlreadyAdded, day7BulgarianDefaultAdded);
    const mergedSettings = {
      ...def.settings,
      ...(parsed.settings || {}),
      // PR #31 以降の新規運用は4メニュー順番ローテを優先する。
      // 既存localStorageに旧検証用/過去版の programMode が残っていても、旧8日ローテは履歴互換としてのみ残す。
      programMode: 'fourMenu',
      maxes: { ...def.settings.maxes, ...(parsed.settings?.maxes || {}) },
      rotationIncreaseCaps: { ...def.settings.rotationIncreaseCaps, ...(parsed.settings?.rotationIncreaseCaps || {}) },
      r4AdjustmentModes: { ...def.settings.r4AdjustmentModes, ...(parsed.settings?.r4AdjustmentModes || {}) },
      mainSetOverrides: { ...def.settings.mainSetOverrides, ...(parsed.settings?.mainSetOverrides || {}) },
      exerciseRestSettings: Array.isArray(parsed.settings?.exerciseRestSettings) ? parsed.settings.exerciseRestSettings : [],
      accessoryDefaults: mergedAccDefaults,
      accessoryManagementMode: parsed.settings?.accessoryManagementMode || def.settings.accessoryManagementMode,
      accessorySlots: mergedAccessorySlots,
      accessoryShoulderDefaultsAdded: true,
      day7BulgarianDefaultAdded: true,
    };
    const mergedState = {
      ...def.currentState,
      ...(parsed.currentState || {}),
      nextMenuKey: normalizeFourMenuKey(parsed.currentState?.nextMenuKey || parsed.currentState?.selectedSplitKey || def.currentState.nextMenuKey),
      isRestSelected: !!parsed.currentState?.isRestSelected,
      backCompletedCount: parseInt(parsed.currentState?.backCompletedCount, 10) || 0,
    };
    return {
      ...def,
      ...parsed,
      settings: mergedSettings,
      currentState: mergedState,
      rotationProgressions: Array.isArray(parsed.rotationProgressions) ? parsed.rotationProgressions : [],
      estimatedMaxHistory: Array.isArray(parsed.estimatedMaxHistory) ? parsed.estimatedMaxHistory : [],
      maxTestResults: Array.isArray(parsed.maxTestResults) ? parsed.maxTestResults : [],
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

function mergeAccessorySlots(userSlots, shoulderDefaultsAlreadyAdded = true, day7BulgarianDefaultAdded = true) {
  const slots = defaultAccessorySlots();
  if (!userSlots || typeof userSlots !== 'object') return slots;
  for (const day of Object.keys(userSlots)) {
    if (Array.isArray(userSlots[day])) {
      const normalizedUserSlots = userSlots[day].map(normalizeAccessorySlot).filter(Boolean);
      const existingIds = new Set(normalizedUserSlots.map(slot => slot.slotId));
      const dayNum = Number(day);
      const newlyRecommendedSlots = (slots[day] || [])
        .filter(slot => !existingIds.has(slot.slotId))
        .filter(slot => {
          if (!shoulderDefaultsAlreadyAdded && ['d3-side-raise', 'd6-rear-delt'].includes(slot.slotId)) return true;
          if (!day7BulgarianDefaultAdded && dayNum === 7 && slot.slotId === 'd7-bulgarian') return true;
          return false;
        })
        .map(normalizeAccessorySlot)
        .filter(Boolean);
      slots[day] = [...normalizedUserSlots, ...newlyRecommendedSlots];
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

function normalizeSearchText(value) {
  // 「ダンベル」と「DB」の表記ゆれを吸収して種目名マッチを安定させる
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/ダンベル/g, 'db');
}

function parseRangeMin(value, fallback = null) {
  const nums = String(value ?? '').match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return fallback;
  return Math.min(...nums.map(Number));
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

function getAccessoryPreset(keyOrName) {
  const value = String(keyOrName || '');
  return ACCESSORY_PRESETS.find(p => p.key === value || p.name === value) || null;
}

function inferPresetKey(slot = {}) {
  const byKey = getAccessoryPreset(slot.key);
  if (byKey) return byKey.key;
  const byName = getAccessoryPreset(slot.name);
  return byName ? byName.key : 'custom';
}

function accessoryPresetOptionsHtml(selectedKey = 'custom') {
  return ACCESSORY_PRESET_GROUPS.map(group => `
    <optgroup label="${group.group}">
      ${group.presets.map(preset => `<option value="${preset.key}" ${preset.key === selectedKey ? 'selected' : ''}>${preset.name}</option>`).join('')}
    </optgroup>
  `).join('');
}

function applyAccessoryPresetToSlot(base = {}, presetKey = 'custom') {
  const preset = getAccessoryPreset(presetKey) || getAccessoryPreset('custom');
  const keepCustomName = preset?.custom && base.name && base.name !== '新規補助種目';
  return normalizeAccessorySlot({
    ...base,
    ...preset,
    slotId: base.slotId || preset.slotId,
    key: preset.custom ? (base.key || `custom_${uid()}`) : preset.key,
    name: keepCustomName ? base.name : preset.name,
    plannedWeight: base.plannedWeight ?? base.weight ?? null,
    restType: base.restType || preset.restType || 'default',
  });
}

function normalizeBig3Key(key) {
  const raw = String(key || '');
  return BIG3_KEY_ALIASES[raw] || raw;
}

function isBig3Key(key) {
  return Object.prototype.hasOwnProperty.call(BIG3_LIFTS, normalizeBig3Key(key));
}

function isLightBig3Menu(menuType = '') {
  return String(menuType).includes('light');
}

function isVolumeBig3Menu(menuType = '') {
  return String(menuType || '').includes('volume') || String(menuType || '').includes('mid');
}

function isMaxTestMenu(menuType = '') {
  const type = String(menuType || '');
  return type.startsWith('max-test-') && !type.includes('backoff');
}

function isMaxTestBackoffMenu(menuType = '') {
  return String(menuType || '').startsWith('max-test-') && String(menuType || '').includes('backoff');
}

function isIntensityMainMenu(menuType = '') {
  const type = String(menuType || '');
  return type.startsWith('four-main-') || type.includes('hi-main') || type.includes('heavy-top') || type.includes('heavy-backoff') || type.includes('floorDead-main') || isMaxTestMenu(type);
}

function hasFormIssue(note = '') {
  return /フォーム|崩|不安|乱れ/.test(String(note || ''));
}

function hasLogPain(log) {
  return (log?.pains || []).some(p => ['痛み', '強い痛み'].includes(p));
}

function isLogFailed(log) {
  const planned = parseInt(log?.plannedSets, 10) || (log?.sets || []).length || 0;
  return (parseInt(log?.doneSets, 10) || 0) < planned;
}

function hasExplicitFailedSet(log) {
  return (log?.sets || []).some(set => {
    if (set.done || set.skipped) return false;
    const reps = parseInt(set.reps, 10);
    return Number.isFinite(reps) && reps > 0;
  });
}

function dateDiffDays(a, b) {
  const start = new Date(`${a}T00:00:00`);
  const end = new Date(`${b}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function r4AdjustmentKey(block = store.currentState.block) {
  return `b${block}-r4`;
}

function getSelectedR4AdjustmentMode(settings = store.settings, block = store.currentState.block) {
  const mode = settings.r4AdjustmentModes?.[r4AdjustmentKey(block)];
  return R4_ADJUSTMENT_MODES[mode] ? mode : 'normalDeload';
}

function getR4AdjustmentProfile(mode = 'normalDeload') {
  return R4_ADJUSTMENT_MODES[mode] || R4_ADJUSTMENT_MODES.normalDeload;
}

function r4IntensityLevelLabel(mode) {
  return {
    normalDeload: 'Lv1',
    lightDeload: 'Lv2',
    maintain: 'Lv3',
    normalish: 'Lv4',
    custom: 'Lv5',
  }[mode] || 'Lv1';
}

function r4IntensityLevelDescription(mode) {
  return {
    normalDeload: 'Lv1: 疲労抜き',
    lightDeload: 'Lv2: 軽め',
    maintain: 'Lv3: 維持',
    normalish: 'Lv4: 通常寄り',
    custom: 'Lv5: カスタム',
  }[mode] || 'Lv1: 疲労抜き';
}

function countScheduledRestDaysBetween(fromState, toState) {
  if (!fromState || !toState) return 0;
  let cursor = { day: Number(fromState.day), rotation: Number(fromState.rotation), block: Number(fromState.block) };
  let count = 0;
  for (let guard = 0; guard < 40; guard++) {
    cursor = nextDay(cursor);
    if (cursor.block === Number(toState.block) && cursor.rotation === Number(toState.rotation) && cursor.day === Number(toState.day)) break;
    if (cursor.day === 4 || cursor.day === 8) count++;
  }
  return count;
}

function getUnexpectedRestStats(referenceDate = todayStr()) {
  const dates = [...(store.logs || [])]
    .filter(log => log.date && !log.todayOnlyDeleted && !log.isExerciseRest)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const daily = [];
  dates.forEach(log => {
    const last = daily[daily.length - 1];
    if (last && last.date === log.date) {
      last.logs.push(log);
    } else {
      daily.push({ date: log.date, block: log.block, rotation: log.rotation, day: log.day, logs: [log] });
    }
  });

  let cumulativeUnexpectedRestDays = 0;
  for (let i = 1; i < daily.length; i++) {
    const gap = Math.max(0, dateDiffDays(daily[i - 1].date, daily[i].date) - 1);
    const scheduledRest = countScheduledRestDaysBetween(daily[i - 1], daily[i]);
    cumulativeUnexpectedRestDays += Math.max(0, gap - scheduledRest);
  }

  const last = daily[daily.length - 1];
  let consecutiveRestDays = 0;
  if (last) {
    const gap = Math.max(0, dateDiffDays(last.date, referenceDate) - 1);
    const scheduledRest = countScheduledRestDaysBetween(last, store.currentState);
    consecutiveRestDays = Math.max(0, gap - scheduledRest);
  }

  return { cumulativeUnexpectedRestDays, consecutiveRestDays, lastTrainingDate: last?.date || null };
}

function getR4AdjustmentProposal(referenceDate = todayStr()) {
  const stats = getUnexpectedRestStats(referenceDate);
  const recentLogs = [...(store.logs || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 12);
  const hasPainOrFailure = recentLogs.some(log => hasLogPain(log) || isLogFailed(log) || hasFormIssue(log.note));
  const hasEmaxDrop = Object.keys(BIG3_LIFTS).some(key => {
    const recent = recentEstimatedMaxes(key, 2);
    return recent.length >= 2 && recent.every(e => e.trendWarning);
  });
  let recommendedMode = 'normalDeload';
  const reasons = [];

  if (hasPainOrFailure || hasEmaxDrop) {
    recommendedMode = 'normalDeload';
    reasons.push('直近状態: 要注意');
  } else if (stats.consecutiveRestDays >= 7) {
    recommendedMode = 'lightDeload';
    reasons.push('長めの連続休み: 慎重再開');
  } else if (stats.cumulativeUnexpectedRestDays >= 6) {
    recommendedMode = 'normalish';
    reasons.push('予定外休み多め');
  } else if (stats.cumulativeUnexpectedRestDays >= 4) {
    recommendedMode = 'maintain';
    reasons.push('疲労は抜け気味');
  } else if (stats.cumulativeUnexpectedRestDays >= 2) {
    recommendedMode = 'lightDeload';
    reasons.push('軽め調整');
  } else {
    reasons.push('予定通り寄り');
  }

  return {
    ...stats,
    recommendedMode,
    recommendedLabel: R4_ADJUSTMENT_MODES[recommendedMode].label,
    reasons,
    modes: Object.entries(R4_ADJUSTMENT_MODES).map(([key, value]) => ({ key, ...value })),
  };
}

function selectR4AdjustmentMode(mode, block = store.currentState.block) {
  if (!R4_ADJUSTMENT_MODES[mode]) return false;
  store.settings.r4AdjustmentModes = store.settings.r4AdjustmentModes || {};
  store.settings.r4AdjustmentModes[r4AdjustmentKey(block)] = mode;
  saveStore();
  recalculateTodaySession();
  return true;
}

function estimateMaxFromSet(weight, reps, rpe, increment = 0.5) {
  const w = parseFloat(weight);
  const r = parseFloat(reps);
  const rpeValue = parseRpeValue(rpe);
  if (!w || !r || rpeValue == null) {
    return { value: null, rir: null, confidence: '低', reason: 'RPE未入力のため参考外' };
  }
  if (r === 1) {
    return {
      value: roundToIncrement(w, increment),
      rir: Math.max(0, 10 - rpeValue),
      confidence: rpeValue >= 9.5 ? '高' : '中',
      reason: `${w}kg×1回@RPE${rpeValue}`,
    };
  }
  const rir = Math.max(0, 10 - rpeValue);
  const value = roundToIncrement(w * (1 + (r + rir) / 30), increment);
  let confidence = '低';
  if (r >= 2 && r <= 5 && rpeValue >= 8 && rpeValue <= 10) confidence = '高';
  else if (r >= 6 && r <= 8 && rpeValue >= 7 && rpeValue <= 10) confidence = '中';
  return { value, rir, confidence, reason: `${w}kg×${r}回@RPE${rpeValue}` };
}

function bestEstimatedMaxFromLog(log) {
  if (!log || !isBig3Key(log.exerciseKey)) return null;
  const doneSets = (log.sets || []).filter(s => s.done && s.weight && s.reps);
  if (doneSets.length === 0) return null;
  const estimates = doneSets.map(set => {
    const estimate = estimateMaxFromSet(set.weight, set.reps, log.rpe);
    const reps = parseInt(set.reps, 10) || 0;
    const status = classifyEstimatedMaxUse(log, reps, estimate);
    if (status.kind === 'excluded' || reps >= 10 || estimate.value == null) estimate.confidence = '低';
    return { ...estimate, sourceWeight: parseFloat(set.weight), sourceReps: reps };
  }).map(e => ({ ...e, status: classifyEstimatedMaxUse(log, e.sourceReps, e) }))
    .filter(e => e.value != null);
  if (estimates.length === 0) {
    const fallback = doneSets[0];
    const estimate = estimateMaxFromSet(fallback.weight, fallback.reps, log.rpe);
    const reps = parseInt(fallback.reps, 10) || 0;
    const status = classifyEstimatedMaxUse(log, reps, estimate);
    return { ...estimate, status, sourceWeight: parseFloat(fallback.weight), sourceReps: reps, excluded: status.kind === 'excluded' };
  }
  const priority = { candidate: 4, reference: 2, excluded: 1 };
  estimates.sort((a, b) => (priority[b.status.kind] - priority[a.status.kind]) || (b.value - a.value));
  return { ...estimates[0], excluded: estimates[0].status.kind === 'excluded' };
}

function classifyEstimatedMaxUse(log, reps, estimate) {
  const rpe = parseRpeValue(log?.rpe);
  if (!estimate || estimate.value == null || rpe == null) return { kind: 'excluded', label: '除外', reason: 'RPE未入力' };
  if (log?.isExerciseRest) return { kind: 'excluded', label: '除外', reason: '休止' };
  if (!isBig3Key(log?.exerciseKey)) return { kind: 'excluded', label: '除外', reason: '補助種目' };
  if (log.isDeload && !isMaxTestMenu(log.menuType)) return { kind: 'excluded', label: '除外', reason: 'デロード日' };
  if (hasLogPain(log)) return { kind: 'excluded', label: '除外', reason: '痛みあり' };
  if (hasExplicitFailedSet(log)) return { kind: 'excluded', label: '除外', reason: '失敗あり' };
  if (hasFormIssue(log.note)) return { kind: 'excluded', label: '除外', reason: 'フォーム要確認' };
  if (isLightBig3Menu(log.menuType)) return { kind: 'excluded', label: '除外', reason: '軽め日' };
  if (reps >= 10) return { kind: 'excluded', label: '除外', reason: '高レップ' };
  if (isVolumeBig3Menu(log.menuType)) return { kind: 'reference', label: '参考', reason: 'ボリューム日' };
  if (!isIntensityMainMenu(log.menuType)) return { kind: 'excluded', label: '除外', reason: '強度メインではない' };
  if (reps === 1 && rpe >= 9.5 && rpe <= 10) return { kind: 'candidate', label: '採用候補', reason: '1RM測定' };
  // 強度メインの実施セットは2〜8回・RPE8〜10を採用候補にする
  // （以前は2〜5回かつRPE9.5までで、7回@9.5等の高出力セットが「参考」止まりになり、
  //   より低い5回セットの推定値が採用候補に選ばれるズレが起きていた）
  if (reps >= 2 && reps <= 5 && rpe >= 8 && rpe <= 10) return { kind: 'candidate', label: '採用候補', reason: '強度メイン' };
  if (reps >= 6 && reps <= 8 && rpe >= 8 && rpe <= 10) return { kind: 'candidate', label: '採用候補', reason: '強度メイン' };
  if (reps >= 6 && reps <= 8) return { kind: 'reference', label: '参考', reason: '6〜8回' };
  if (rpe >= 7 && rpe < 8) return { kind: 'reference', label: '参考', reason: 'RPE低め' };
  return { kind: 'reference', label: '参考', reason: '測定意図低め' };
}

function createEstimatedMaxEntry(log, source = 'training') {
  const normalizedLiftKey = normalizeBig3Key(log?.exerciseKey);
  const lift = BIG3_LIFTS[normalizedLiftKey];
  if (!lift) return null;
  if (isMaxTestBackoffMenu(log?.menuType)) return null;
  const estimate = bestEstimatedMaxFromLog(log);
  if (!estimate || estimate.value == null) return null;
  const currentMax = store.settings.maxes[lift.maxKey] || 0;
  return {
    id: `emax_${uid()}`,
    source,
    logId: log.id || null,
    liftKey: lift.key,
    maxKey: lift.maxKey,
    liftName: lift.name,
    date: log.date || todayStr(),
    block: log.fourMenuRotation ? null : (log.block ?? store.currentState.block),
    rotation: log.fourMenuRotation ? null : (log.rotation ?? store.currentState.rotation),
    day: log.fourMenuRotation ? null : (log.day ?? store.currentState.day),
    fourMenuRotation: !!log.fourMenuRotation,
    performedSplitKey: log.performedSplitKey || log.selectedSplitKey || log.menuKey || null,
    splitName: log.splitName || log.menuName || null,
    menuType: log.menuType || null,
    estimatedMax: estimate.value,
    currentMax,
    diff: roundToIncrement(estimate.value - currentMax, 0.5),
    sourceWeight: estimate.sourceWeight,
    sourceReps: estimate.sourceReps,
    rpe: log.rpe,
    rir: estimate.rir,
    confidence: estimate.confidence,
    maxUseKind: estimate.status?.kind || 'excluded',
    maxUseLabel: estimate.status?.label || '除外',
    maxUseReason: estimate.status?.reason || '',
    useForMaxUpdate: estimate.status?.kind === 'candidate',
    adopted: false,
    ts: Date.now(),
  };
}

function upsertEstimatedMaxFromLog(log, source = 'training') {
  const entry = createEstimatedMaxEntry(log, source);
  if (!entry) return null;
  const recent = recentEstimatedMaxes(entry.liftKey, 1)[0];
  if (entry.estimatedMax < entry.currentMax && recent?.estimatedMax < entry.currentMax) {
    entry.trendWarning = '2回低下: 疲労注意';
  } else if (entry.estimatedMax < entry.currentMax) {
    entry.trendWarning = '低下: 様子見';
  }
  store.estimatedMaxHistory = store.estimatedMaxHistory || [];
  const existingIdx = store.estimatedMaxHistory.findIndex(e => sameEstimatedMaxEntry(e, entry));
  if (existingIdx >= 0) {
    const existing = store.estimatedMaxHistory[existingIdx];
    const keepAdoption = sameEstimatedMaxResult(existing, entry);
    store.estimatedMaxHistory[existingIdx] = {
      ...existing,
      ...entry,
      id: existing.id,
      adopted: keepAdoption && !!existing.adopted,
      adoptedAt: keepAdoption ? existing.adoptedAt : null,
      adoptedMax: keepAdoption ? existing.adoptedMax : null,
    };
    return store.estimatedMaxHistory[existingIdx];
  }
  store.estimatedMaxHistory.push(entry);
  return entry;
}

function recentEstimatedMaxes(liftKey, limit = 2) {
  return collectEstimatedMaxEntries(liftKey)
    .filter(e => e.liftKey === liftKey && e.useForMaxUpdate)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

function sameEstimatedMaxEntry(a, b) {
  if (!a || !b || a.liftKey !== b.liftKey) return false;
  if (a.logId && b.logId && a.logId === b.logId) return true;
  return String(a.date || '') === String(b.date || '') &&
    Number(a.block) === Number(b.block) &&
    Number(a.rotation) === Number(b.rotation) &&
    Number(a.day) === Number(b.day) &&
    String(a.menuType || '') === String(b.menuType || '');
}

function sameEstimatedMaxResult(a, b) {
  if (!a || !b) return false;
  return Number(a.estimatedMax) === Number(b.estimatedMax) &&
    Number(a.sourceWeight) === Number(b.sourceWeight) &&
    Number(a.sourceReps) === Number(b.sourceReps) &&
    String(a.rpe || '') === String(b.rpe || '');
}

function estimatedMaxEntryKey(entry) {
  if (entry.logId) return `log:${entry.logId}:${entry.liftKey}`;
  return [
    'slot',
    entry.date || '',
    entry.block ?? '',
    entry.rotation ?? '',
    entry.day ?? '',
    entry.liftKey || '',
    entry.menuType || '',
  ].join('|');
}

function collectEstimatedMaxEntries(liftKey = null) {
  const stored = [...(store.estimatedMaxHistory || [])]
    .filter(e => !liftKey || e.liftKey === liftKey);
  const derived = (store.logs || [])
    .map(log => createEstimatedMaxEntry(log, 'log-derived'))
    .filter(Boolean)
    .filter(entry => !liftKey || entry.liftKey === liftKey)
    .map(entry => {
      const existing = stored.find(item => sameEstimatedMaxEntry(item, entry));
      const keepAdoption = existing && sameEstimatedMaxResult(existing, entry);
      return {
        ...(existing || {}),
        ...entry,
        id: existing?.id || `derived_${entry.logId || `${entry.date}_${entry.liftKey}_${entry.menuType || ''}`}`,
        logId: existing?.logId || entry.logId,
        adopted: keepAdoption && !!existing?.adopted,
        adoptedAt: keepAdoption ? existing?.adoptedAt : null,
        adoptedMax: keepAdoption ? existing?.adoptedMax : null,
        ts: entry.ts || existing?.ts || 0,
        derivedFromLog: !existing,
      };
    });
  const merged = new Map();
  stored.forEach(entry => merged.set(estimatedMaxEntryKey(entry), entry));
  derived.forEach(entry => merged.set(estimatedMaxEntryKey(entry), entry));
  return [...merged.values()]
    .filter(e => !liftKey || e.liftKey === liftKey)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function normalizeExerciseRestSetting(setting) {
  if (!setting || typeof setting !== 'object') return null;
  return {
    id: setting.id || `rest_${uid()}`,
    name: setting.name || '休止設定',
    parts: normalizeList(setting.parts).filter(part => EXERCISE_REST_PARTS.includes(part)),
    exercises: normalizeList(setting.exercises),
    startDate: setting.startDate || todayStr(),
    endDate: setting.endDate || setting.startDate || todayStr(),
    note: setting.note || '',
    ended: !!setting.ended,
  };
}

function getActiveExerciseRestSettings(date = todayStr(), settings = store.settings) {
  const targetDate = String(date || todayStr());
  return (settings.exerciseRestSettings || [])
    .map(normalizeExerciseRestSetting)
    .filter(Boolean)
    .filter(rest => !rest.ended && rest.startDate <= targetDate && targetDate <= rest.endDate);
}

function exerciseRestPartsForExercise(ex) {
  const parts = new Set();
  const add = part => { if (EXERCISE_REST_PARTS.includes(part)) parts.add(part); };
  const cats = normalizeList(ex?.categories);
  const tags = normalizeList(ex?.fatigueTags);
  cats.forEach(cat => {
    if (cat.includes('胸') || cat.includes('ベンチ')) add('胸');
    if (cat.includes('肩')) add('肩');
    if (cat.includes('背中') || cat.includes('ロウ') || cat.includes('チンニング') || cat.includes('デッド')) add('背中');
    if (cat.includes('腕')) add('腕');
    if (cat.includes('脚') || cat.includes('カーフ')) add('脚');
  });
  tags.forEach(tag => {
    if (tag.includes('肩')) add('肩');
    if (tag.includes('肘')) add('肘');
    if (tag.includes('腰')) add('腰');
    if (tag.includes('膝')) add('膝');
  });
  if (ex?.key === 'bench') { add('胸'); add('肩'); }
  if (ex?.key === 'squat') { add('脚'); add('膝'); }
  if (ex?.key === 'halfDead' || ex?.key === 'floorDead') { add('背中'); add('腰'); }
  return [...parts];
}

function exerciseRestTokensForExercise(ex) {
  return [
    ex?.key,
    ex?.name,
    ex?.exerciseName,
    ex?.slotName,
    ...(ex?.key === 'bench' ? ['ベンチプレス', 'benchpress'] : []),
    ...(ex?.key === 'squat' ? ['スクワット', 'squat'] : []),
    ...(ex?.key === 'halfDead' ? ['ハーフデッド', 'halfdead'] : []),
    ...(ex?.key === 'floorDead' ? ['床引きデッド', 'floordead', 'floor_dead'] : []),
    ...(ex?.key === 'machine_chest_press' ? ['チェストプレス', 'chestpress'] : []),
  ].map(normalizeSearchText).filter(Boolean);
}

function exerciseMatchesRestSetting(ex, rest) {
  const parts = exerciseRestPartsForExercise(ex);
  const partMatch = (rest.parts || []).some(part => parts.includes(part));
  const tokens = exerciseRestTokensForExercise(ex);
  const exerciseMatch = (rest.exercises || []).map(normalizeSearchText).filter(Boolean)
    .some(target => tokens.some(token => token === target || token.includes(target) || target.includes(token)));
  return partMatch || exerciseMatch;
}

function applyExerciseRestSettingsToExercises(exercises, date = todayStr(), settings = store.settings) {
  const active = getActiveExerciseRestSettings(date, settings);
  if (active.length === 0) return { exercises, skipped: [], active };
  const kept = [];
  const skipped = [];
  exercises.forEach(ex => {
    const rest = active.find(setting => exerciseMatchesRestSetting(ex, setting));
    if (!rest) {
      kept.push(ex);
      return;
    }
    skipped.push({
      ...ex,
      isExerciseRestSkipped: true,
      restSettingId: rest.id,
      restSettingName: rest.name,
      restSettingNote: rest.note,
      restParts: rest.parts,
      restStartDate: rest.startDate,
      restEndDate: rest.endDate,
    });
  });
  return { exercises: kept, skipped, active };
}

function getMaxUpdateCandidate(entry) {
  if (!entry || entry.estimatedMax == null) return null;
  if (entry.useForMaxUpdate === false || (entry.maxUseKind && entry.maxUseKind !== 'candidate')) return null;
  const current = store.settings.maxes[entry.maxKey] || entry.currentMax || 0;
  if (entry.estimatedMax <= current) return null;
  const increment = store.settings.increment || 2.5;
  const capped = Math.min(entry.estimatedMax, current + 5);
  const candidate = Math.floor(capped / increment) * increment;
  if (candidate <= current) return null;
  return { current, estimatedMax: entry.estimatedMax, candidate, diff: roundToIncrement(candidate - current, 0.5) };
}

function getRotationIncreaseCap(liftKey, settings = store.settings) {
  const caps = settings.rotationIncreaseCaps || {};
  const inc = settings.increment || 2.5;
  return parseFloat(caps[liftKey]) || inc;
}

function getPreviousBig3ReferenceWeight(ex) {
  if (!ex || !isBig3Key(ex.key)) return null;
  const recent = [...(store.logs || [])]
    .filter(log => !log.isDeload && log.exerciseKey === ex.key && log.menuType === ex.menuType)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  if (!recent) return null;
  const setWeights = (recent.sets || [])
    .filter(set => set.done && set.weight != null)
    .map(set => parseFloat(set.weight))
    .filter(weight => Number.isFinite(weight));
  const planned = parseFloat(recent.plannedWeight);
  const reference = Math.max(Number.isFinite(planned) ? planned : 0, ...setWeights);
  return reference > 0 ? reference : null;
}

function capBig3ProgressionToPrevious(ex, settings = store.settings) {
  if (!ex || !isBig3Key(ex.key) || ex.plannedWeight == null || isLightBig3Menu(ex.menuType) || isMaxTestMenu(ex.menuType)) return ex;
  const referenceWeight = getPreviousBig3ReferenceWeight(ex);
  if (referenceWeight == null) return ex;
  const cap = getRotationIncreaseCap(ex.key, settings);
  const targetWeight = parseFloat(ex.plannedWeight);
  const maxNext = roundToIncrement(referenceWeight + cap, settings.increment || 2.5);
  if (!Number.isFinite(targetWeight) || targetWeight <= maxNext) return ex;
  return {
    ...ex,
    plannedWeight: maxNext,
    progressionCapped: {
      referenceWeight,
      targetWeight,
      nextWeight: maxNext,
      cap,
    },
  };
}

function capBig3ProgressionsToPrevious(exercises, isDeload, settings = store.settings) {
  if (isDeload) return exercises;
  return exercises.map(ex => capBig3ProgressionToPrevious(ex, settings));
}

function evaluateRotationProgression(log) {
  if (log?.isExerciseRest) return null;
  if (!log || !isBig3Key(log.exerciseKey) || log.isDeload || isLightBig3Menu(log.menuType) || isMaxTestMenu(log.menuType)) return null;
  const lift = BIG3_LIFTS[normalizeBig3Key(log.exerciseKey)];
  const rpe = parseRpeValue(log.rpe);
  const failed = isLogFailed(log);
  const painful = hasLogPain(log);
  const formIssue = hasFormIssue(log.note);
  const estimateEntry = createEstimatedMaxEntry(log, 'rotation-check');
  const maxGapPct = estimateEntry ? ((estimateEntry.estimatedMax - (store.settings.maxes[lift.maxKey] || 0)) / (store.settings.maxes[lift.maxKey] || 1)) * 100 : 0;
  let shouldIncrease = false;
  let recommendation = 'hold';
  let message = `${lift.name}: 据え置き`;

  if (painful) {
    message = `${lift.name}: 痛みあり 据え置き`;
  } else if (formIssue) {
    message = `${lift.name}: フォーム要確認`;
  } else if (failed) {
    message = `${lift.name}: 失敗あり 据え置き`;
  } else if (rpe == null) {
    message = `${lift.name}: RPE未入力`;
  } else if (rpe <= 8) {
    shouldIncrease = true;
    recommendation = 'increase';
    message = `前回成功: 次回 +2.5kg`;
  } else if (rpe <= 9) {
    const aggressive = (store.settings.accessoryManagementMode || 'aggressive') === 'aggressive';
    shouldIncrease = aggressive;
    recommendation = aggressive ? 'increase' : 'hold';
    message = aggressive
      ? `前回成功: 次回 +2.5kg`
      : `${lift.name}: RPE${rpe} 据え置き`;
  } else {
    message = `${lift.name}: RPE${rpe} 据え置き`;
  }

  if (shouldIncrease && maxGapPct >= 2.5) {
    message += ' / MAX更新候補あり';
  }

  return {
    id: `rot_${uid()}`,
    liftKey: lift.key,
    maxKey: lift.maxKey,
    liftName: lift.name,
    day: log.day,
    menuType: log.menuType,
    sourceLogId: log.id || null,
    sourceDate: log.date || todayStr(),
    delta: shouldIncrease ? 2.5 : 0,
    status: shouldIncrease ? 'suggested' : 'hold',
    recommendation,
    message,
    createdAt: Date.now(),
    adoptedAt: null,
    appliedAt: null,
  };
}

function upsertRotationProgressionFromLog(log) {
  const suggestion = evaluateRotationProgression(log);
  if (!suggestion) return null;
  store.rotationProgressions = store.rotationProgressions || [];
  const existingIdx = store.rotationProgressions.findIndex(p =>
    p.sourceLogId && p.sourceLogId === suggestion.sourceLogId && p.liftKey === suggestion.liftKey && p.menuType === suggestion.menuType
  );
  if (existingIdx >= 0) {
    store.rotationProgressions[existingIdx] = { ...store.rotationProgressions[existingIdx], ...suggestion, id: store.rotationProgressions[existingIdx].id };
    return store.rotationProgressions[existingIdx];
  }
  store.rotationProgressions.push(suggestion);
  return suggestion;
}

function findPendingRotationProgressionForExercise(ex, day = null, includeSuggested = true) {
  if (!ex || !isBig3Key(ex.key)) return null;
  const statuses = includeSuggested ? ['suggested', 'accepted'] : ['accepted'];
  return [...(store.rotationProgressions || [])]
    .filter(p => statuses.includes(p.status) && !p.appliedAt && p.liftKey === ex.key)
    .filter(p => day == null || Number(p.day) === Number(day))
    .filter(p => p.menuType === ex.menuType)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}

function applyAcceptedRotationProgressionsToMenu(exercises, day, isDeload, settings = store.settings) {
  if (isDeload) return exercises;
  return exercises.map(ex => {
    if (!ex || !isBig3Key(ex.key) || ex.plannedWeight == null || isLightBig3Menu(ex.menuType) || isMaxTestMenu(ex.menuType)) return ex;
    const progression = findPendingRotationProgressionForExercise(ex, day, false);
    if (!progression || !progression.delta) return ex;
    return {
      ...ex,
      plannedWeight: roundToIncrement(ex.plannedWeight + progression.delta, settings.increment || 2.5),
      rotationProgressionApplied: progression.delta,
      rotationProgressionId: progression.id,
    };
  });
}

function markAppliedRotationProgressions(session) {
  if (!session || session.isDeload) return;
  (session.exercises || []).forEach(ex => {
    if (!ex.rotationProgressionId) return;
    const progression = (store.rotationProgressions || []).find(p => p.id === ex.rotationProgressionId);
    if (progression && progression.status === 'accepted' && !progression.appliedAt) {
      progression.status = 'applied';
      progression.appliedAt = Date.now();
    }
  });
}

function adoptRotationProgression(progressionId) {
  const progression = (store.rotationProgressions || []).find(p => p.id === progressionId);
  if (!progression || progression.status !== 'suggested' || !progression.delta) return false;
  const duplicate = (store.rotationProgressions || []).find(p =>
    p.id !== progression.id && p.status === 'accepted' && !p.appliedAt &&
    p.liftKey === progression.liftKey && Number(p.day) === Number(progression.day) && p.menuType === progression.menuType
  );
  if (duplicate) duplicate.status = 'dismissed';
  progression.status = 'accepted';
  progression.adoptedAt = Date.now();
  saveStore();
  return true;
}

function adoptEstimatedMax(entryId) {
  const entry = (store.estimatedMaxHistory || []).find(e => e.id === entryId);
  const candidate = getMaxUpdateCandidate(entry);
  if (!entry || !candidate) return false;
  store.settings.maxes[entry.maxKey] = candidate.candidate;
  store.rotationProgressions = (store.rotationProgressions || []).map(p => {
    if (p.liftKey === entry.liftKey && ['suggested', 'accepted'].includes(p.status) && !p.appliedAt) {
      return { ...p, status: 'dismissed', dismissedReason: 'max-updated' };
    }
    return p;
  });
  entry.adopted = true;
  entry.adoptedAt = Date.now();
  entry.adoptedMax = candidate.candidate;
  saveStore();
  return true;
}

function getTrueOneRmAttemptFromLog(log) {
  if (!log || !isMaxTestMenu(log.menuType)) return null;
  const lift = BIG3_LIFTS[normalizeBig3Key(log.exerciseKey)];
  if (!lift) return null;
  const oneRepSets = (log.sets || [])
    .map(set => ({
      weight: parseFloat(set.weight),
      reps: parseInt(set.reps, 10),
      done: !!set.done,
    }))
    .filter(set => Number.isFinite(set.weight) && set.weight > 0 && set.reps === 1);
  const plannedWeight = parseFloat(log.plannedWeight);
  if (oneRepSets.length === 0 && !Number.isFinite(plannedWeight)) return null;
  const attemptedWeight = Math.max(
    Number.isFinite(plannedWeight) ? plannedWeight : 0,
    ...oneRepSets.map(set => set.weight)
  );
  // 成功と失敗を独立に評価する（同じ測定内に成功120kg+失敗125kgが共存できる）
  const doneWeights = oneRepSets.filter(set => set.done).map(set => set.weight);
  const failedWeights = oneRepSets.filter(set => !set.done).map(set => set.weight);
  const measuredMaxWeight = doneWeights.length ? Math.max(...doneWeights) : null;
  const failedAttemptWeight = failedWeights.length ? Math.max(...failedWeights) : null;
  const success = measuredMaxWeight != null;
  return {
    mode: 'trueOneRm',
    attemptedWeight,
    measuredMaxWeight,
    failedAttemptWeight,
    challengeSucceeded: success,
    challengeFailed: failedAttemptWeight != null || !success,
  };
}

// 実測MAXレコードの収集（表示専用・storeへ書き込まない）。
// maxTestResults に加えて、既存ログに残っているMAX測定からも復元する
// （旧バージョンで保存されたログや exerciseKey の表記ゆれも拾う）
function collectMaxTestRecords(liftKey = null) {
  const stored = (store.maxTestResults || []).map(t => {
    const succeeded = t.challengeSucceeded ?? t.isMeasuredMax ?? (parseFloat(t.measuredMaxWeight) > 0);
    return {
      ...t,
      liftKey: normalizeBig3Key(t.liftKey),
      challengeSucceeded: succeeded,
      challengeFailed: t.challengeFailed ?? !succeeded,
    };
  });
  const seenLogIds = new Set(stored.map(t => t.logId).filter(Boolean));
  const seenSlots = new Set(stored.map(t => `${t.date}|${t.liftKey}|${t.block}|${t.rotation}|${t.day}`));
  const derived = (store.logs || [])
    .filter(log => isMaxTestMenu(log.menuType) && isBig3Key(log.exerciseKey))
    .filter(log => !log.id || !seenLogIds.has(log.id))
    .map(log => {
      const attempt = getTrueOneRmAttemptFromLog(log);
      if (!attempt) return null;
      const lift = BIG3_LIFTS[normalizeBig3Key(log.exerciseKey)];
      const slot = `${log.date}|${lift.key}|${log.block}|${log.rotation}|${log.day}`;
      if (seenSlots.has(slot)) return null;
      seenSlots.add(slot);
      return {
        id: `maxlog_${log.id || uid()}`,
        logId: log.id || null,
        mode: attempt.mode,
        liftKey: lift.key,
        liftName: lift.name,
        weight: attempt.attemptedWeight,
        attemptedWeight: attempt.attemptedWeight,
        measuredMaxWeight: attempt.measuredMaxWeight,
        failedAttemptWeight: attempt.failedAttemptWeight ?? null,
        challengeSucceeded: attempt.challengeSucceeded,
        challengeFailed: attempt.challengeFailed,
        rpe: log.rpe,
        date: log.date,
        day: log.day,
        block: log.block,
        rotation: log.rotation,
        adopted: false,
        ts: log.ts || 0,
        derivedFromLog: true,
      };
    })
    .filter(Boolean);
  return [...stored, ...derived]
    .filter(t => !liftKey || t.liftKey === liftKey)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

// 実測MAX（成功1RMの最高値）。MAX設定値や推定MAXとは独立
function bestMeasuredMaxForLift(liftKey) {
  const successes = collectMaxTestRecords(liftKey)
    .filter(t => t.challengeSucceeded && parseFloat(t.measuredMaxWeight) > 0);
  if (!successes.length) return null;
  return successes.reduce((best, t) =>
    parseFloat(t.measuredMaxWeight) > parseFloat(best.measuredMaxWeight) ? t : best
  );
}

// 推定MAXのメイン表示: 条件に合う記録（採用候補/採用済み）の中の最大値。
// 候補が無い場合は参考の最大値、それも無ければ最新を返す
function bestEstimatedMaxEntryForLift(liftKey) {
  const entries = collectEstimatedMaxEntries(liftKey);
  if (!entries.length) return null;
  const maxBy = list => list.reduce((best, e) =>
    parseFloat(e.estimatedMax) > parseFloat(best.estimatedMax) ? e : best
  );
  const candidates = entries.filter(e => e.adopted || e.useForMaxUpdate || e.maxUseKind === 'candidate');
  if (candidates.length) return maxBy(candidates);
  const references = entries.filter(e => e.maxUseKind === 'reference');
  if (references.length) return maxBy(references);
  return [...entries].sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
}

function upsertMaxTestResultFromLog(log, entry = null) {
  const attempt = getTrueOneRmAttemptFromLog(log);
  if (!attempt) return null;
  const lift = BIG3_LIFTS[normalizeBig3Key(log.exerciseKey)];
  store.maxTestResults = store.maxTestResults || [];
  const existingIdx = store.maxTestResults.findIndex(item =>
    item.logId === log.id || (
      item.date === log.date &&
      item.liftKey === lift.key &&
      item.mode === attempt.mode &&
      Number(item.day) === Number(log.day) &&
      Number(item.block) === Number(log.block) &&
      Number(item.rotation) === Number(log.rotation)
    )
  );
  const existing = existingIdx >= 0 ? store.maxTestResults[existingIdx] : null;
  const test = {
    id: existing?.id || log.maxTestId || `maxtest_${uid()}`,
    logId: log.id,
    mode: attempt.mode,
    liftKey: lift.key,
    liftName: lift.name,
    weight: attempt.attemptedWeight,
    attemptedWeight: attempt.attemptedWeight,
    reps: 1,
    rpe: log.rpe,
    pains: log.pains || [],
    note: log.note || '',
    measuredMaxWeight: attempt.measuredMaxWeight,
    failedAttemptWeight: attempt.failedAttemptWeight ?? null,
    isMeasuredMax: attempt.challengeSucceeded,
    challengeSucceeded: attempt.challengeSucceeded,
    challengeFailed: attempt.challengeFailed,
    estimatedMax: entry?.estimatedMax ?? null,
    confidence: entry?.confidence ?? null,
    adopted: existing?.adopted || false,
    date: log.date,
    day: log.day,
    block: log.block,
    rotation: log.rotation,
    ts: existing?.ts || log.ts || Date.now(),
  };
  if (existingIdx >= 0) store.maxTestResults[existingIdx] = { ...existing, ...test };
  else store.maxTestResults.push(test);
  log.maxTestId = test.id;
  log.maxAttemptWeight = attempt.attemptedWeight;
  log.measuredMaxWeight = attempt.measuredMaxWeight;
  log.isMeasuredMax = attempt.challengeSucceeded;
  log.maxChallengeSucceeded = attempt.challengeSucceeded;
  log.maxChallengeFailed = attempt.challengeFailed;
  return existingIdx >= 0 ? store.maxTestResults[existingIdx] : test;
}

function recordMaxTestResult(result) {
  const lift = BIG3_LIFTS[result.liftKey];
  if (!lift) return null;
  const mode = 'trueOneRm';
  const date = result.date || todayStr();
  const day = result.day ?? store.currentState.day;
  const block = result.block ?? store.currentState.block;
  const rotation = result.rotation ?? store.currentState.rotation;
  const menuType = `max-test-${mode}`;
  const existingLogIdx = (store.logs || []).findIndex(log =>
    log.date === date && Number(log.day) === Number(day) && Number(log.block) === Number(block) &&
    Number(log.rotation) === Number(rotation) && log.exerciseKey === lift.key && log.menuType === menuType
  );
  const existingLog = existingLogIdx >= 0 ? store.logs[existingLogIdx] : null;
  const ts = Date.now();
  const pseudoLog = {
    id: existingLog?.id || `maxtest_log_${uid()}`,
    date,
    day,
    block,
    rotation,
    isDeload: false,
    isAdjustmentRotation: Number(rotation) === 4,
    exerciseKey: lift.key,
    exerciseName: lift.name,
    menuType,
    plannedWeight: result.weight,
    plannedReps: 1,
    plannedSets: 1,
    sets: [{ weight: result.weight, reps: 1, done: result.success === false ? false : true }],
    doneSets: result.success === false ? 0 : 1,
    rpe: result.rpe,
    pains: result.pains || [],
    note: result.note || '',
    isDeloadMaxTest: true,
    maxTestMode: mode,
    ts: existingLog?.ts || ts,
  };
  const entry = createEstimatedMaxEntry(pseudoLog, 'max-test');
  store.logs = store.logs || [];
  if (existingLogIdx >= 0) store.logs[existingLogIdx] = { ...existingLog, ...pseudoLog };
  else store.logs.push(pseudoLog);

  const test = upsertMaxTestResultFromLog(pseudoLog, entry);
  if (existingLogIdx >= 0) store.logs[existingLogIdx] = { ...store.logs[existingLogIdx], maxTestId: test.id };
  else store.logs[store.logs.length - 1] = { ...store.logs[store.logs.length - 1], maxTestId: test.id };

  let savedEntry = null;
  if (entry) {
    store.estimatedMaxHistory = store.estimatedMaxHistory || [];
    const entryWithTest = { ...entry, maxTestId: test.id };
    const existingEntryIdx = store.estimatedMaxHistory.findIndex(item =>
      (item.logId && item.logId === pseudoLog.id) || (item.maxTestId && item.maxTestId === test.id)
    );
    if (existingEntryIdx >= 0) store.estimatedMaxHistory[existingEntryIdx] = { ...store.estimatedMaxHistory[existingEntryIdx], ...entryWithTest, id: store.estimatedMaxHistory[existingEntryIdx].id };
    else store.estimatedMaxHistory.push(entryWithTest);
    savedEntry = existingEntryIdx >= 0 ? store.estimatedMaxHistory[existingEntryIdx] : entryWithTest;
  }
  saveStore();
  return { test, entry: savedEntry, log: pseudoLog };
}

function renderEstimatedMaxHistory(limit = 6) {
  const entries = collectEstimatedMaxEntries().slice(0, limit);
  if (entries.length === 0) return '<div class="muted">推定MAX履歴はまだありません</div>';
  return entries.map(entry => {
    const candidate = !entry.derivedFromLog ? getMaxUpdateCandidate(entry) : null;
    const statusKind = entry.adopted ? 'candidate' : (entry.maxUseKind || 'excluded');
    const statusLabel = entry.adopted ? '採用済み' : (entry.maxUseLabel || '除外');
    return `
      <div class="suggestion-row emax-row">
        <div>
          <div class="name">${entry.liftName}推定MAX: ${entry.estimatedMax}kg <span class="status-pill ${statusKind === 'candidate' ? 'status-ok' : statusKind === 'reference' ? 'status-caution' : 'status-low'}">${statusLabel}</span></div>
          <div class="muted" style="font-size:12px;">${entry.sourceWeight}kg×${entry.sourceReps}回@RPE${entry.rpe} / ${entry.maxUseReason || '判定'} / 現MAX差 ${entry.diff > 0 ? '+' : ''}${entry.diff}kg / ${entry.date}</div>
          <div class="muted" style="font-size:12px;">MAX更新候補: ${candidate ? `${candidate.candidate}kg (${candidate.diff > 0 ? '+' : ''}${candidate.diff}kg)` : 'なし・様子見'}</div>
          ${entry.trendWarning ? `<div class="load-warning load-warning-caution"><span>注意</span>${entry.trendWarning}</div>` : ''}
        </div>
        ${candidate && !entry.adopted ? `<button class="btn-success btn-small" data-adopt-emax="${entry.id}">採用</button>` : entry.adopted ? '<span class="status-pill status-ok">採用済み</span>' : ''}
      </div>
    `;
  }).join('');
}

// 実測MAX（1RM成功）/ MAX挑戦（1RM失敗）の履歴。推定MAXとは別系統で表示する。
function renderMaxTestHistory(limit = 10, liftKey = null) {
  const entries = collectMaxTestRecords(liftKey).slice(0, limit);
  if (entries.length === 0) return '<div class="muted">実測MAXの記録はまだありません（R4のMAX測定で記録されます）</div>';
  return entries.map(test => {
    const success = !!test.challengeSucceeded;
    const weight = success ? test.measuredMaxWeight : (test.attemptedWeight ?? test.weight);
    return `
      <div class="hist-row">
        <span class="h-date">${fmtDateShort(test.date)}</span>
        <span class="h-val">${fmtW(weight)}<span class="u">kg</span> ×1
          ${!liftKey ? `<span class="h-src">${test.liftName}</span>` : ''}
        </span>
        ${test.adopted ? '<span class="chip chip-max-fill">採用中</span>' : ''}
        ${success && test.failedAttemptWeight ? `<span class="chip chip-pause">✗ ${fmtW(test.failedAttemptWeight)}</span>` : ''}
        <span class="chip ${success ? 'chip-ok' : 'chip-pause'}" title="${success ? '実測MAX' : 'MAX挑戦'}">${success ? `✓ ${fmtW(test.measuredMaxWeight)}kg 成功` : `✗ ${fmtW(weight)}kg 失敗`}</span>
      </div>
    `;
  }).join('');
}

function renderEstimatedMaxSummary() {
  const lifts = [
    { key: 'bench', name: 'ベンチ' },
    { key: 'squat', name: 'スクワット' },
    { key: 'halfDead', name: 'ハーフデッド' },
    { key: 'floorDead', name: '床引きデッド' },
  ];
  const rows = lifts.map(lift => {
    const entry = bestEstimatedMaxEntryForLift(lift.key);
    if (!entry) {
      return `
        <div class="suggestion-row emax-summary-row">
          <div class="name">${lift.name}</div>
          <div class="muted">履歴なし</div>
        </div>
      `;
    }
    const candidate = !entry.derivedFromLog ? getMaxUpdateCandidate(entry) : null;
    const statusKind = entry.adopted ? 'candidate' : (entry.maxUseKind || 'excluded');
    const statusLabel = entry.adopted ? '採用済み' : (entry.maxUseLabel || '参考');
    return `
      <div class="suggestion-row emax-summary-row">
        <div>
          <div class="name">${lift.name}推定MAX: ${entry.estimatedMax}kg</div>
          <div class="muted" style="font-size:12px;">${entry.sourceWeight}kg×${entry.sourceReps}回@RPE${entry.rpe} / ${entry.date}</div>
        </div>
        <span class="status-pill ${candidate ? 'status-caution' : statusKind === 'candidate' ? 'status-ok' : statusKind === 'reference' ? 'status-caution' : 'status-low'}">${candidate ? 'MAX更新候補あり' : statusLabel}</span>
        ${candidate && !entry.adopted ? `<button class="btn-success btn-small" data-adopt-emax="${entry.id}">採用</button>` : entry.adopted ? '<span class="status-pill status-ok">採用済み</span>' : ''}
      </div>
    `;
  }).join('');
  return `
    ${rows}
    <details class="ui-details">
      <summary>履歴を確認</summary>
      ${renderEstimatedMaxHistory(6)}
    </details>
  `;
}

function bindEstimatedMaxActions() {
  document.querySelectorAll('button[data-adopt-emax]').forEach(btn => {
    btn.onclick = () => {
      const entry = (store.estimatedMaxHistory || []).find(e => e.id === btn.dataset.adoptEmax);
      const candidate = getMaxUpdateCandidate(entry);
      if (!candidate) return;
      if (!confirm(`${entry.liftName}のMAXを ${candidate.current}kg → ${candidate.candidate}kg に更新しますか？`)) return;
      if (adoptEstimatedMax(entry.id)) {
        showToast('MAX候補を採用しました');
        render();
      }
    };
  });
}

function getDeloadMaxTestLiftForDay(day) {
  const liftKey = DELOAD_MAX_TEST_DAY_LIFTS[Number(day)];
  return liftKey ? BIG3_LIFTS[liftKey] : null;
}

function getDefaultDeloadMaxTestMode() {
  const mode = store.settings.deloadMaxTestMode || 'trueOneRm';
  return mode === 'off' ? 'normal' : 'trueOneRm';
}

function deloadMaxTestModeLabel(mode) {
  if (mode === 'normal') return '通常デロード';
  return DELOAD_MAX_TEST_MODES[mode] || '1RM';
}

function recentEstimatedMaxBasis(liftKey, settings = store.settings) {
  const lift = BIG3_LIFTS[liftKey];
  if (!lift) return 0;
  const currentMax = parseFloat(settings.maxes?.[lift.maxKey]) || 0;
  const recent = [...(store.estimatedMaxHistory || [])]
    .filter(entry => entry.liftKey === liftKey && (entry.adopted || entry.maxUseKind === 'candidate' || entry.useForMaxUpdate))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  const recentMax = parseFloat(recent?.estimatedMax) || 0;
  return Math.max(currentMax, recentMax);
}

function buildDeloadMaxTestExercises(liftKey, mode, settings = store.settings) {
  const lift = BIG3_LIFTS[liftKey];
  if (!lift || mode === 'normal') return [];
  const normalizedMode = 'trueOneRm';
  const max = recentEstimatedMaxBasis(liftKey, settings);
  const inc = settings.increment || 2.5;
  const modePlan = { pct: 100, reps: 1, rpe: '10', note: '1RM測定' };
  return [
    {
      key: lift.key,
      name: `${lift.name}（MAX測定）`,
      menuType: `max-test-${normalizedMode}`,
      plannedWeight: roundToIncrement(max * modePlan.pct / 100, inc),
      plannedReps: modePlan.reps,
      plannedSets: 1,
      pctNote: `${modePlan.pct}% / RPE${modePlan.rpe} / 基準${max}kg`,
      restSec: REST_TIME_SEC.big3_top,
      isBig3: true,
      isDeloadMaxTest: true,
      maxTestMode: normalizedMode,
      maxTestNote: modePlan.note,
    },
    {
      key: lift.key,
      name: `${lift.name}（バックオフ）`,
      menuType: `max-test-${normalizedMode}-backoff`,
      plannedWeight: roundToIncrement(max * 65 / 100, inc),
      plannedReps: 3,
      plannedSets: 1,
      pctNote: 'バックオフ 65%',
      restSec: REST_TIME_SEC.big3_backoff,
      isBig3: true,
      isDeloadMaxTestBackoff: true,
      maxTestMode: normalizedMode,
    },
  ];
}

function buildRequiredR4MaxTestExercises(liftKey, settings = store.settings) {
  const mode = 'trueOneRm';
  const [main, backoff] = buildDeloadMaxTestExercises(liftKey, mode, settings);
  if (!main) return null;
  const requiredMain = {
    ...main,
    name: `${BIG3_LIFTS[liftKey].name}（MAX測定）`,
    pctNote: `${main.pctNote} / MAX測定`,
    isRequiredR4MaxTest: true,
    maxTestMode: mode,
  };
  return backoff ? [requiredMain, backoff] : [requiredMain];
}

function buildRequiredR4MaxTestExercise(liftKey, settings = store.settings) {
  return buildRequiredR4MaxTestExercises(liftKey, settings)?.[0] || null;
}

function applyRequiredR4MaxTestSlot(exercises, day, rotation, settings = store.settings) {
  if (Number(rotation) !== 4) return exercises;
  const lift = getDeloadMaxTestLiftForDay(day);
  if (!lift) return exercises;
  const maxTestExercises = buildRequiredR4MaxTestExercises(lift.key, settings);
  if (!maxTestExercises?.length) return exercises;
  return [
    ...maxTestExercises,
    ...exercises.filter(ex => !(ex?.isBig3 && ex.key === lift.key)),
  ];
}

function buildR4NonTestExercise(liftKey, settings = store.settings) {
  const lift = BIG3_LIFTS[liftKey];
  if (!lift) return null;
  const profile = getR4AdjustmentProfile(getSelectedR4AdjustmentMode(settings));
  const pct = profile.deloadPct || 75;
  const inc = settings.increment || 2.5;
  const max = parseFloat(settings.maxes?.[lift.maxKey]) || 0;
  return {
    key: lift.key,
    name: `${lift.name}（R4調整）`,
    menuType: `${lift.key}-r4-adjust`,
    plannedWeight: roundToIncrement(max * pct / 100, inc),
    plannedReps: 3,
    plannedSets: 2,
    pctNote: `${pct}% / 測定なし`,
    restSec: REST_TIME_SEC.big3_backoff,
    isBig3: true,
    isR4NonTest: true,
  };
}

function applyDeloadMaxTestModeToSession(session, mode) {
  if (!session?.isDeload && !session?.isAdjustmentRotation) return false;
  const lift = getDeloadMaxTestLiftForDay(session.day);
  if (!lift) return false;
  session.maxTestMode = mode === 'normal' ? 'normal' : 'trueOneRm';
  if (session.maxTestMode === 'normal') {
    const baseMenu = getDayMenu(session.day, session.rotation, store.settings);
    const nonTest = buildR4NonTestExercise(lift.key, store.settings);
    const nextExercises = baseMenu.exercises
      .filter(ex => !(ex.isBig3 && ex.key === lift.key && (ex.isDeloadMaxTest || ex.isDeloadMaxTestBackoff || ex.isRequiredR4MaxTest)))
      .concat(nonTest ? [nonTest] : [])
      .map(ex => {
        const oldEx = session.exercises.find(item => item.key === ex.key && item.menuType === ex.menuType);
        if (oldEx) return { ...ex, sets: oldEx.sets, rpe: oldEx.rpe, pains: oldEx.pains, note: oldEx.note, completed: oldEx.completed };
        return {
          ...ex,
          sets: Array.from({ length: ex.plannedSets || 1 }, () => ({
            weight: ex.plannedWeight,
            reps: typeof ex.plannedReps === 'number' ? ex.plannedReps : '',
            done: false,
          })),
          rpe: '未入力',
          pains: [],
          note: '',
          completed: false,
        };
      });
    session.exercises = nextExercises;
    session.maxTestSkipped = true;
    saveStore();
    return true;
  }
  session.maxTestSkipped = false;
  const baseMenu = getDayMenu(session.day, session.rotation, store.settings);
  const replacement = buildDeloadMaxTestExercises(lift.key, session.maxTestMode, store.settings)
    .map((item, idx) => session.rotation === 4 && idx === 0 ? { ...item, isRequiredR4MaxTest: true, name: `${lift.name}（MAX測定）` } : item);
  const nextExercises = baseMenu.exercises
    .filter(ex => !(ex.isBig3 && ex.key === lift.key))
    .concat(replacement)
    .map(ex => {
      const oldEx = session.exercises.find(item => item.key === ex.key && item.menuType === ex.menuType);
      if (oldEx) return { ...ex, sets: oldEx.sets, rpe: oldEx.rpe, pains: oldEx.pains, note: oldEx.note, completed: oldEx.completed };
      return {
        ...ex,
        sets: Array.from({ length: ex.plannedSets || 1 }, () => ({
          weight: ex.plannedWeight,
          reps: typeof ex.plannedReps === 'number' ? ex.plannedReps : '',
          done: false,
        })),
        rpe: '未入力',
        pains: [],
        note: '',
        completed: false,
      };
    });
  session.exercises = nextExercises;
  saveStore();
  return true;
}

function renderDeloadMaxTestPanel(session) {
  if (!session?.isAdjustmentRotation && !session?.isDeload) return '';
  const lift = getDeloadMaxTestLiftForDay(session.day);
  if (!lift) return '';
  const selectedMode = session.maxTestSkipped ? 'normal' : 'trueOneRm';
  return `
    <div class="card r4-max-card">
      <div class="sec-label">MAX測定</div>
      <div class="row" style="margin-bottom:10px;">
        <span class="chip chip-max">MAX</span>
        <span class="muted">${lift.name}</span>
      </div>
      <div class="btn-pair">
        <button class="${selectedMode === 'trueOneRm' ? 'btn-max' : 'btn-sec'}" data-action="setDeloadMaxMode" data-mode="trueOneRm">する</button>
        <button class="${selectedMode === 'normal' ? 'btn-max' : 'btn-sec'}" data-action="setDeloadMaxMode" data-mode="normal">しない</button>
      </div>
    </div>
  `;
}

function renderR4AdjustmentPanel(session = null) {
  const isR4 = Number(session?.rotation ?? store.currentState.rotation) === 4;
  if (!isR4) return '';
  const proposal = getR4AdjustmentProposal();
  const selected = getSelectedR4AdjustmentMode(store.settings);
  const segOptions = proposal.modes.map(mode => `
    <button class="seg-opt ${selected === mode.key ? 'on' : ''}" data-action="setR4AdjustmentMode" data-r4-mode="${mode.key}">${r4IntensityLevelLabel(mode.key)}</button>
  `).join('');
  const levelHelp = proposal.modes.map(mode => `<span class="chip chip-outline">${r4IntensityLevelDescription(mode.key)}</span>`).join('');
  return `
    <div class="card r4-adjustment-panel">
      <div class="sec-label">今回の強さ</div>
      <div class="seg">${segOptions}</div>
      <div class="seg-ends"><span>軽い</span><span>通常</span></div>
      <details class="ui-details compact-details mt-8">
        <summary>Lvの目安</summary>
        <div class="status-row">${levelHelp}</div>
        <div class="muted mt-8">おすすめ ${r4IntensityLevelLabel(proposal.recommendedMode)} / ${proposal.reasons.join(' / ')} / 予定外休み ${proposal.cumulativeUnexpectedRestDays}日 (連続${proposal.consecutiveRestDays}日)</div>
      </details>
    </div>
  `;
}

function openMaxTestModal(modeOverride = null, liftKeyOverride = null) {
  const session = store.daySessions[todaySessionKey()];
  const liftForDay = getDeloadMaxTestLiftForDay(session?.day);
  const mode = 'trueOneRm';
  const selectedLift = liftKeyOverride || liftForDay?.key || 'bench';
  openModal('MAX測定を入力', `
    <div class="muted mb-8">推定MAXを計算します。採用するまでMAX設定は変わりません。</div>
    <div class="load-warning load-warning-danger"><span>注意</span>1RMは安全環境のみ</div>
    <label class="field"><span>種目</span>
      <select id="maxTestLift">
        ${Object.values(BIG3_LIFTS).map(l => `<option value="${l.key}" ${l.key === selectedLift ? 'selected' : ''}>${l.name}</option>`).join('')}
      </select>
    </label>
    <label class="field"><span>重量(kg)</span><input type="number" step="0.5" id="maxTestWeight" /></label>
    <label class="field"><span>回数</span><input type="number" inputmode="numeric" id="maxTestReps" value="1" /></label>
    <label class="field"><span>RPE</span><input type="text" id="maxTestRpe" value="10" /></label>
    <label class="field"><span>痛み（、区切り）</span><input type="text" id="maxTestPain" value="なし" /></label>
    <label class="field"><span>フォームメモ</span><textarea id="maxTestNote" placeholder="フォーム不安があれば記録"></textarea></label>
    <div class="btn-row">
      <button class="btn-primary" id="maxTestCalc">計算して保存</button>
    </div>
    <div id="maxTestResult" class="mt-8"></div>
  `, () => {
    document.getElementById('maxTestCalc').onclick = () => {
      const result = recordMaxTestResult({
        mode,
        liftKey: document.getElementById('maxTestLift').value,
        weight: parseFloat(document.getElementById('maxTestWeight').value),
        reps: parseInt(document.getElementById('maxTestReps').value, 10),
        rpe: document.getElementById('maxTestRpe').value,
        pains: normalizeList(document.getElementById('maxTestPain').value),
        note: document.getElementById('maxTestNote').value,
      });
      const box = document.getElementById('maxTestResult');
      if (!result) {
        box.innerHTML = '<div class="load-warning load-warning-caution"><span>注意</span>入力値を確認してください。</div>';
        return;
      }
      const candidate = getMaxUpdateCandidate(result.entry);
      box.innerHTML = `<div class="accessory-suggestion"><span class="suggestion-label">推定MAX</span><span>${result.entry.liftName}: ${result.entry.estimatedMax}kg / ${result.entry.maxUseLabel || '判定'} / 更新候補:${candidate ? `${candidate.candidate}kg` : 'なし'}</span></div>
        ${candidate ? `<button class="btn-success btn-small" data-adopt-emax="${result.entry.id}">この値を採用</button>` : ''}`;
      bindEstimatedMaxActions();
    };
  });
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
  const plannedWeight = slot.plannedWeight ?? slot.weight ?? null;
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
    plannedWeight: plannedWeight === '' || plannedWeight == null ? null : parseFloat(plannedWeight),
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
  if (name.includes('ケーブル') || name.includes('フェイスプル')) return 'cable';
  if (name.includes('バーベル')) return 'barbell';
  return 'upper_machine';
}

function getAccessorySlotsForDay(day, settings = store.settings) {
  const source = settings.accessorySlots || defaultAccessorySlots();
  return (source[String(day)] || source[day] || []).map(normalizeAccessorySlot).filter(Boolean);
}

function accessoryExerciseFromSlot(slot, settings, isDeload, day = null) {
  const accDefaults = settings.accessoryDefaults || {};
  const def = accDefaults[slot.key] || {};
  const plannedSets = isDeload ? Math.max(1, Math.ceil(slot.plannedSets / 2)) : slot.plannedSets;
  // スロットに明示された値を最優先（「今後にも反映」した編集が次回生成でも勝つ）。
  // accessoryDefaults はスロット未設定時のフォールバック
  const plannedReps = (slot.reps != null && slot.reps !== '') ? slot.reps : (def.reps != null ? def.reps : slot.reps);
  const normalWeight = slot.plannedWeight != null ? slot.plannedWeight : (def.weight != null ? def.weight : null);
  const plannedWeight = isDeload && normalWeight != null
    ? roundToIncrement(normalWeight * 0.9, settings.increment || 2.5)
    : normalWeight;
  return {
    key: slot.key,
    name: slot.name,
    menuType: `accessory-${slot.slotId}`,
    plannedWeight: plannedWeight ?? null,
    plannedReps,
    plannedSets,
    setsText: slot.setsText,
    targetRpe: isDeload ? '6〜7' : slot.targetRpe,
    normalPlannedSets: slot.plannedSets,
    normalTargetRpe: slot.targetRpe,
    normalPlannedWeight: normalWeight ?? null,
    isDeloadAccessory: !!isDeload,
    deloadTargetRpe: isDeload ? '6〜7' : null,
    categories: [...slot.categories],
    fatigueTags: [...slot.fatigueTags],
    slotId: slot.slotId,
    slotName: slot.slotName,
    weightType: slot.weightType,
    restSec: REST_TIME_SEC[slot.restType] || REST_TIME_SEC.default,
    isAccessory: true,
    day,
  };
}

function buildAccessoryExercises(day, settings, isDeload) {
  return getAccessorySlotsForDay(day, settings).map(slot => {
    return accessoryExerciseFromSlot(slot, settings, isDeload, day);
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
    const label = key === 'デッド・腰背部負荷' ? '腰負荷' : key;
    if (value >= limit.danger) warnings.push({ level: 'danger', message: `${label}高負荷` });
    else if (value >= limit.caution) warnings.push({ level: 'caution', message: `${label}多め` });
  });
  if ((summary['背中'] || 0) < 10) warnings.push({ level: 'caution', message: '背中少なめ' });
  if (!plan.some(ex => ex.categories.includes('脚補助'))) warnings.push({ level: 'caution', message: '脚補助不足' });
  if (!plan.some(ex => ex.categories.includes('肩'))) warnings.push({ level: 'caution', message: '肩補助不足' });
  if ((summary['横肩'] || 0) === 0) warnings.push({ level: 'caution', message: '横肩不足' });
  if ((summary['後ろ肩'] || 0) === 0) warnings.push({ level: 'caution', message: '後ろ肩不足' });
  const shoulderAccessories = plan.filter(ex => ex.categories.includes('肩') || ex.categories.includes('肩補助'));
  if (shoulderAccessories.length > 0 && shoulderAccessories.every(ex => ex.categories.includes('肩プレス系'))) {
    warnings.push({ level: 'caution', message: '肩が前側寄り' });
  }
  if (!plan.some(ex => ex.categories.includes('腕'))) warnings.push({ level: 'caution', message: '腕補助不足' });
  if (!plan.some(ex => ex.categories.includes('背中') && ex.fatigueTags.includes('腰に優しい'))) warnings.push({ level: 'caution', message: '背中少なめ' });
  plan.filter(ex => (ex.day === 3 || ex.day === 7) && ex.categories.includes('ロウ系') && ex.fatigueTags.includes('腰負荷'))
    .forEach(ex => warnings.push({ level: 'caution', message: `Day${ex.day} 腰負荷あり` }));
  if ((summary['肩負荷'] || 0) >= 24 && (summary['ベンチ系プレス'] || 0) >= ACCESSORY_LOAD_LIMITS['ベンチ系プレス'].caution) {
    warnings.push({ level: 'caution', message: '肩負荷多め' });
  }
  return warnings.filter((w, idx, arr) => arr.findIndex(other => other.message === w.message) === idx);
}

function getAccessorySafetyWarnings(slot, day = null) {
  const warnings = [];
  const normalized = normalizeAccessorySlot(slot);
  if (!normalized) return warnings;
  if ((Number(day) === 3 || Number(day) === 7) && normalized.fatigueTags.includes('腰負荷')) {
    warnings.push(`Day${day}: 腰負荷あり`);
  }
  const recentPainLogs = store.logs.filter(l => Array.isArray(l.pains) && l.pains.some(p => p && p !== 'なし'));
  if (normalized.fatigueTags.includes('肩負荷') && recentPainLogs.some(l => l.pains.includes('痛み') || l.pains.includes('強い痛み'))) {
    warnings.push('痛みログあり。肩負荷は慎重に');
  }
  if (normalized.fatigueTags.includes('肘負荷') && recentPainLogs.some(l => l.pains.includes('痛み') || l.pains.includes('強い痛み'))) {
    warnings.push('痛みログあり。肘負荷は慎重に');
  }
  return warnings;
}

function confirmAccessoryChange(message, slot = null, day = null) {
  const warnings = slot ? getAccessorySafetyWarnings(slot, day) : [];
  const warningText = warnings.length ? `\n\n注意:\n${warnings.map(w => `・${w}`).join('\n')}` : '';
  return confirm(`${message}${warningText}`);
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
  return (ex.pains || []).some(p => ['痛み', '強い痛み'].includes(p));
}

function hasStrongPain(ex) {
  return (ex.pains || []).includes('強い痛み');
}

function weightStepText(weightType) {
  switch (weightType) {
    case 'dumbbell': return '片手+1〜2kg';
    case 'cable': return '+1〜2.5kg';
    case 'barbell': return '+2.5〜5kg';
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
  if (ex.isDeloadAccessory) return 'デロード中: 重量UPなし';
  const rpe = parseRpeValue(ex.rpe);
  const painful = hasPain(ex);
  const hitUpper = allDoneSetsHitUpper(ex);
  const doneCount = (ex.sets || []).filter(s => s.done).length;
  const expectedSets = parseInt(ex.plannedSets, 10) || 1;
  const failed = doneCount < expectedSets;
  const recentClass = getRecentAccessoryLogs(ex, 2).map(classifyAccessoryLog);
  const twoEasy = recentClass.length >= 2 && recentClass.every(v => v === 'easy');
  const twoHeavy = recentClass.length >= 2 && recentClass.every(v => v === 'heavy');

  if (hasStrongPain(ex)) return '強い痛み: 要変更';
  if (painful) return '痛みあり: 慎重に';
  if (mode === 'aggressive') {
    if (hitUpper && rpe != null && rpe <= 7) return `軽い: ${weightStepText(ex.weightType)} or +1set`;
    if (hitUpper && rpe != null && rpe >= 8 && rpe <= 9) return '適正';
    if ((rpe != null && rpe >= 9.5) || failed) return '攻めすぎ: 調整';
  }
  if (twoEasy) return `2回楽: ${weightStepText(ex.weightType)} or +1set`;
  if (twoHeavy) return '2回重い: -1set';
  if (hitUpper && rpe != null && rpe <= 8) return `次回: ${weightStepText(ex.weightType)}`;
  if (hitUpper && rpe === 9) return '据え置き';
  if (failed && rpe != null && rpe >= 9) return '据え置き or -1set';
  return '記録後に提案';
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

// 重量表示: 小数1桁固定（120.0）
function fmtW(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return '-';
  return (Math.round(n * 10) / 10).toFixed(1);
}

// 日付表示: 「6/10」形式
function fmtDateShort(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(value || '-');
  return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}`;
}

// ユーザー入力をHTMLへ差し込む際のエスケープ（メモ・名前等の表示崩れ防止）
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
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
  if (document.body?.classList) document.body.classList.add('sheet-open');
  if (onMount) onMount();
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  if (document.body?.classList) document.body.classList.remove('sheet-open');
}

// ===== 4メニュー順番ローテーション =====
function isFourMenuMode(settings = store.settings) {
  return (settings?.programMode || 'fourMenu') === 'fourMenu';
}

function normalizeFourMenuKey(key) {
  const aliases = {
    shoulderArms: 'shoulder_arm',
    shoulder_arm: 'shoulder_arm',
    shouldersArms: 'shoulder_arm',
    shoulder: 'shoulder_arm',
    arms: 'shoulder_arm',
    leg: 'legs',
    legs: 'legs',
    chest: 'chest',
    back: 'back',
  };
  const normalized = aliases[String(key || '')] || key;
  return FOUR_MENU_LABELS[normalized] ? normalized : 'shoulder_arm';
}

function nextFourMenuKey(key) {
  const idx = FOUR_MENU_ORDER.indexOf(normalizeFourMenuKey(key));
  return FOUR_MENU_ORDER[(idx + 1) % FOUR_MENU_ORDER.length];
}

function fourMenuLabel(key) {
  return FOUR_MENU_LABELS[key] || FOUR_MENU_LABELS.shoulder_arm;
}

function getFourMenuState() {
  store.currentState.nextMenuKey = normalizeFourMenuKey(store.currentState.nextMenuKey);
  store.currentState.backCompletedCount = parseInt(store.currentState.backCompletedCount, 10) || 0;
  return store.currentState;
}

function getFourMenuBackLiftKey(state = store.currentState) {
  return ((parseInt(state.backCompletedCount, 10) || 0) % 2 === 0) ? 'halfDead' : 'floorDead';
}

function isFourMainLiftKey(key) {
  return !!FOUR_MENU_MAIN_LIFTS[key];
}

function fourMenuOverrideKey(menuKey, ex) {
  if (!ex?.isBig3) return null;
  return `Four-${normalizeFourMenuKey(menuKey)}-${ex.key}-${ex.menuType}`;
}

function getFourMenuLatestLogsForLift(liftKey, limit = 4) {
  return [...(store.logs || [])]
    .filter(log => log.fourMenuRotation && log.exerciseKey === liftKey && log.menuType === `four-main-${liftKey}` && !log.isExerciseRest && !log.todayOnlyDeleted)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, limit);
}

function isFourMainLogComplete(log) {
  const plannedSets = parseInt(log?.plannedSets, 10) || 3;
  const plannedReps = parseInt(log?.plannedReps, 10) || 5;
  const doneSets = (log?.sets || []).filter(set => set.done);
  return doneSets.length >= plannedSets && doneSets.slice(0, plannedSets).every(set => (parseInt(set.reps, 10) || 0) >= plannedReps);
}

function getFourMenuBaseWeightFromMax(liftKey, settings = store.settings) {
  const lift = FOUR_MENU_MAIN_LIFTS[liftKey];
  const max = parseFloat(settings.maxes?.[lift?.maxKey]);
  const inc = parseFloat(settings.increment) || 2.5;
  if (Number.isFinite(max) && max > 0) return roundToIncrement(max * 0.85, inc);
  return lift?.fallbackWeight || 0;
}

function getFourMenuMainPlan(liftKey, menuKey, settings = store.settings) {
  const lift = FOUR_MENU_MAIN_LIFTS[liftKey];
  const inc = parseFloat(settings.increment) || 2.5;
  const override = settings.mainSetOverrides?.[`Four-${normalizeFourMenuKey(menuKey)}-${liftKey}-four-main-${liftKey}`];
  if (override) {
    return {
      weight: roundToIncrement(parseFloat(override.plannedWeight), inc),
      reps: parseInt(override.plannedReps, 10) || 5,
      sets: parseInt(override.plannedSets, 10) || 3,
      reason: '手動設定',
      referenceDate: override.updatedAt ? fmtDateShort(new Date(override.updatedAt).toISOString().slice(0, 10)) : '記録なし',
    };
  }

  const logs = getFourMenuLatestLogsForLift(liftKey, 3);
  if (!logs.length) {
    return { weight: getFourMenuBaseWeightFromMax(liftKey, settings), reps: 5, sets: 3, reason: '記録なしのため初期重量', referenceDate: '記録なし' };
  }

  const latest = logs[0];
  const latestWeight = roundToIncrement(parseFloat(latest.plannedWeight) || maxSetWeight(latest) || getFourMenuBaseWeightFromMax(liftKey, settings), inc);
  const latestComplete = isFourMainLogComplete(latest);
  const sameWeightMisses = logs.filter(log => roundToIncrement(parseFloat(log.plannedWeight) || maxSetWeight(log), inc) === latestWeight && !isFourMainLogComplete(log)).length;

  if (latestComplete) {
    return { weight: roundToIncrement(latestWeight + inc, inc), reps: 5, sets: 3, reason: '前回完遂のため +2.5kg', referenceDate: fmtDateShort(latest.date) };
  }
  if (sameWeightMisses >= 2) {
    return { weight: roundToIncrement(latestWeight * 0.9, inc), reps: 5, sets: 3, reason: '2回連続未達のため約10%減', referenceDate: fmtDateShort(latest.date) };
  }
  return { weight: latestWeight, reps: 5, sets: 3, reason: '未達のため同重量継続', referenceDate: fmtDateShort(latest.date) };
}

function maxSetWeight(log) {
  const weights = (log?.sets || []).filter(set => set.done).map(set => parseFloat(set.weight)).filter(Number.isFinite);
  return weights.length ? Math.max(...weights) : null;
}

function buildFourMenuMainExercise(menuKey, settings = store.settings) {
  const liftKey = menuKey === 'back' ? getFourMenuBackLiftKey(getFourMenuState()) : FOUR_MENU_MAIN_BY_MENU[menuKey];
  const lift = FOUR_MENU_MAIN_LIFTS[liftKey];
  const plan = getFourMenuMainPlan(liftKey, menuKey, settings);
  return {
    key: lift.key,
    name: lift.name,
    menuType: `four-main-${lift.key}`,
    isBig3: true,
    isFourMenuMain: true,
    plannedWeight: plan.weight,
    plannedReps: plan.reps,
    plannedSets: plan.sets,
    targetRpe: '8〜9',
    restSec: REST_TIME_SEC.big3_top || 300,
    fourMenuKey: menuKey,
    progressionReason: plan.reason,
    progressionReferenceDate: plan.referenceDate,
    deadliftVariant: lift.key === 'halfDead' ? 'rack' : lift.key === 'floorDead' ? 'floor' : null,
  };
}

function fourMenuAccessoryExerciseFromSlot(menuKey, slot) {
  const normalized = normalizeAccessorySlot(slot);
  return {
    key: normalized.key,
    name: normalized.name,
    menuType: `four-accessory-${normalized.slotId || normalized.key}`,
    isAccessory: true,
    fourMenuKey: menuKey,
    slotId: normalized.slotId,
    slotName: normalized.slotName,
    plannedWeight: normalized.plannedWeight,
    plannedReps: normalized.reps,
    plannedSets: normalized.plannedSets,
    targetRpe: normalized.targetRpe,
    categories: normalized.categories || [],
    fatigueTags: normalized.fatigueTags || [],
    weightType: normalized.weightType,
    restSec: REST_TIME_SEC.default,
  };
}

function buildFourMenu(menuKey, settings = store.settings) {
  const normalizedKey = menuKey === 'rest' ? 'rest' : normalizeFourMenuKey(menuKey);
  if (normalizedKey === 'rest') {
    return {
      fourMenuRotation: true,
      menuKey: 'rest',
      name: '休み',
      isRest: true,
      exercises: [],
      skippedRestExercises: [],
      activeExerciseRests: [],
    };
  }
  let exercises = [
    buildFourMenuMainExercise(normalizedKey, settings),
    ...(FOUR_MENU_ACCESSORY_SLOTS[normalizedKey] || []).map(slot => fourMenuAccessoryExerciseFromSlot(normalizedKey, slot)),
  ];
  exercises = applyMainSetOverridesToMenu(exercises, normalizedKey, settings);
  exercises = exercises.map(ex => {
    if (!ex.plannedWeight && ex.isAccessory) {
      const def = settings.accessoryDefaults?.[ex.key];
      if (def && def.weight != null) ex.plannedWeight = def.weight;
    }
    if (ex.plannedWeight != null) {
      const adjKey = `Four-${normalizedKey}-${ex.key}-${ex.menuType}`;
      const adj = store.manualAdjustments?.[adjKey] || 0;
      if (adj) {
        ex.plannedWeight = roundToIncrement(ex.plannedWeight + adj, settings.increment || 2.5);
        ex.adjusted = adj;
      }
    }
    return ex;
  });
  const restApplied = applyExerciseRestSettingsToExercises(exercises, todayStr(), settings);
  exercises = restApplied.exercises;
  return {
    fourMenuRotation: true,
    menuKey: normalizedKey,
    name: fourMenuLabel(normalizedKey),
    isRest: exercises.length === 0 && restApplied.skipped.length === 0,
    exercises,
    skippedRestExercises: restApplied.skipped,
    activeExerciseRests: restApplied.active,
  };
}

// ===== メニュー定義 =====
// パーセンテージは、各ローテ/メニュー種別ごとに設定
// 補助種目は重量計算なし（reps/sets のみ）
function getDayMenu(day, rotation, settings) {
  const M = settings.maxes;
  const inc = settings.increment;
  const r = rotation;
  const r4Mode = r === 4 ? getSelectedR4AdjustmentMode(settings) : null;
  const r4Profile = getR4AdjustmentProfile(r4Mode);
  const isAdjustmentRotation = r === 4;
  const isDeload = isAdjustmentRotation && !!r4Profile.deload;
  const deloadPct = r4Profile.deloadPct || 65;
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
      pct = deloadPct;
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
      pct = deloadPct;
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
        [65.2, 67.4, 69.6], [6, 6, 6], [3, 3, 3], 'bench-light', 'bench_volume'));
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
      dayName = 'Day7: 床引きデッド / 脚補助';
      // 床引きデッドはハーフデッド強化の補助・フォーム維持目的のため、
      // 高強度モードでも軽〜中重量を維持。強化対象にしない。
      exercises.push(benchByPct('floorDead', '床引きデッド', M.floorDead,
        [70.6, 73.5, 76.5], [3, 3, 3], [5, 5, 4], 'floorDead-main', 'squat_dead_volume'));
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

  exercises = applyRequiredR4MaxTestSlot(exercises, day, rotation, settings);
  exercises = exercises.filter(ex => !ex.isAccessory);
  exercises.push(...buildAccessoryExercises(day, settings, isDeload));
  exercises = applyMainSetOverridesToMenu(exercises, day, settings);

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

  exercises = applyAcceptedRotationProgressionsToMenu(exercises, day, isDeload, settings);
  exercises = capBig3ProgressionsToPrevious(exercises, isDeload, settings);
  const restApplied = applyExerciseRestSettingsToExercises(exercises, todayStr(), settings);
  exercises = restApplied.exercises;

  return {
    day,
    rotation,
    isDeload,
    isAdjustmentRotation,
    r4AdjustmentMode: r4Mode,
    isRest: exercises.length === 0 && restApplied.skipped.length === 0,
    name: dayName,
    exercises,
    skippedRestExercises: restApplied.skipped,
    activeExerciseRests: restApplied.active,
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
  if (isFourMenuMode()) return `${todayStr()}-four-menu`;
  return `${todayStr()}-b${store.currentState.block}-r${store.currentState.rotation}-d${store.currentState.day}`;
}

// 今日のセッション取得 or 作成
function getOrCreateTodaySession() {
  const key = todaySessionKey();
  if (!store.daySessions[key]) {
    const fourMode = isFourMenuMode();
    const state = getFourMenuState();
    const selectedMenuKey = fourMode
      ? (state.isRestSelected ? 'rest' : normalizeFourMenuKey(state.nextMenuKey))
      : null;
    const menu = fourMode
      ? buildFourMenu(selectedMenuKey, store.settings)
      : getDayMenu(store.currentState.day, store.currentState.rotation, store.settings);
    store.daySessions[key] = {
      key,
      date: todayStr(),
      day: fourMode ? null : store.currentState.day,
      rotation: fourMode ? null : store.currentState.rotation,
      block: fourMode ? null : store.currentState.block,
      fourMenuRotation: fourMode,
      scheduledDate: todayStr(),
      performedDate: todayStr(),
      scheduledSplitKey: fourMode ? state.nextMenuKey : null,
      selectedSplitKey: fourMode ? menu.menuKey : null,
      performedSplitKey: fourMode && menu.menuKey !== 'rest' ? menu.menuKey : null,
      splitName: fourMode ? menu.name : null,
      deadliftVariant: fourMode && menu.menuKey === 'back' ? getFourMenuBackLiftKey(state) : null,
      isDeload: menu.isDeload,
      isAdjustmentRotation: menu.isAdjustmentRotation,
      r4AdjustmentMode: menu.r4AdjustmentMode,
      isRest: menu.isRest,
      dayName: menu.name,
      activeExerciseRests: menu.activeExerciseRests || [],
      skippedRestExercises: menu.skippedRestExercises || [],
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
    markAppliedRotationProgressions(store.daySessions[key]);
    saveStore();
  }
  return store.daySessions[key];
}

function isExerciseComplete(ex) {
  // スキップ済みセットは「実施済み扱い」で完了判定に含める（記録上はdoneと区別）
  return (ex?.sets || []).length > 0 && ex.sets.every(set => !!set.done || !!set.skipped);
}

function firstPendingSetIndex(ex) {
  return (ex?.sets || []).findIndex(set => !set.done && !set.skipped);
}

function hasSetRecord(set) {
  if (!set) return false;
  return !!set.done;
}

function resizeExerciseSets(ex) {
  const target = Math.max(0, parseInt(ex.plannedSets, 10) || 0);
  const defaultReps = typeof ex.plannedReps === 'number' ? ex.plannedReps : '';
  ex.sets = ex.sets || [];
  while (ex.sets.length < target) {
    ex.sets.push({ weight: ex.plannedWeight, reps: defaultReps, done: false });
  }
  if (ex.sets.length > target) ex.sets = ex.sets.slice(0, target);
}

function applyMainSetEdit(ex, values, options = {}) {
  if (!ex?.isBig3) return { ok: false, reason: 'not-big3' };
  const plannedWeight = parseFloat(values.plannedWeight);
  const plannedReps = parseInt(values.plannedReps, 10);
  const plannedSets = parseInt(values.plannedSets, 10);
  if (!Number.isFinite(plannedWeight) || plannedWeight < 0 || plannedReps < 1 || plannedSets < 1) {
    return { ok: false, reason: 'invalid' };
  }

  const currentSets = ex.sets || [];
  const removedSets = currentSets.slice(plannedSets);
  const removingRecordedSets = removedSets.some(hasSetRecord);
  if (removingRecordedSets && options.confirmDiscard !== true) {
    return { ok: false, reason: 'needs-confirm' };
  }

  ex.plannedWeight = plannedWeight;
  ex.plannedReps = plannedReps;
  ex.plannedSets = plannedSets;
  ex.todayEdited = true;

  const nextSets = currentSets.slice(0, plannedSets).map(set => {
    if (set.done) return { ...set };
    return { ...set, weight: plannedWeight, reps: plannedReps };
  });
  while (nextSets.length < plannedSets) {
    nextSets.push({ weight: plannedWeight, reps: plannedReps, done: false });
  }
  ex.sets = nextSets;
  return { ok: true, removingRecordedSets };
}

function mainSetOverrideKey(day, ex) {
  if (!ex?.isBig3) return null;
  if (typeof day === 'string' && FOUR_MENU_LABELS[day]) return fourMenuOverrideKey(day, ex);
  return `Day${day}-${ex.key}-${ex.menuType}`;
}

function saveMainSetOverride(day, ex) {
  const key = mainSetOverrideKey(day, ex);
  if (!key) return false;
  store.settings.mainSetOverrides = store.settings.mainSetOverrides || {};
  store.settings.mainSetOverrides[key] = {
    plannedWeight: ex.plannedWeight,
    plannedReps: ex.plannedReps,
    plannedSets: ex.plannedSets,
    updatedAt: Date.now(),
  };
  if (store.manualAdjustments) delete store.manualAdjustments[key];
  return true;
}

function applyMainSetOverridesToMenu(exercises, day, settings = store.settings) {
  const overrides = settings.mainSetOverrides || {};
  return exercises.map(ex => {
    const key = mainSetOverrideKey(day, ex);
    const override = key ? overrides[key] : null;
    if (!override) return ex;
    const plannedWeight = parseFloat(override.plannedWeight);
    const plannedReps = parseInt(override.plannedReps, 10);
    const plannedSets = parseInt(override.plannedSets, 10);
    return {
      ...ex,
      plannedWeight: Number.isFinite(plannedWeight) ? plannedWeight : ex.plannedWeight,
      plannedReps: plannedReps > 0 ? plannedReps : ex.plannedReps,
      plannedSets: plannedSets > 0 ? plannedSets : ex.plannedSets,
      mainSetOverridden: true,
    };
  });
}

// 完了時に実績値を確定する。空欄やレンジ表記（5〜8等）を保存データに残さない
function commitSetRecordDefaults(ex, set) {
  if (!ex || !set) return;
  if (set.weight == null || set.weight === '') {
    if (ex.plannedWeight != null) set.weight = ex.plannedWeight;
  }
  if (set.reps == null || set.reps === '') {
    if (typeof ex.plannedReps === 'number') {
      set.reps = ex.plannedReps;
    } else {
      // レンジ表記の場合は下限を実績の最低保証として確定（過大記録を避ける）
      const minReps = parseRangeMin(ex.plannedReps, null);
      if (minReps != null) set.reps = minReps;
    }
  } else if (typeof set.reps === 'string') {
    // 旧データ等でレンジ文字列が入っていた場合は数値へ正規化
    const parsed = parseInt(set.reps, 10);
    if (Number.isFinite(parsed)) set.reps = parsed;
  }
}

function toggleNextSetCompletion(session, exIdx) {
  const ex = session?.exercises?.[exIdx];
  if (!ex) return { ok: false, reason: 'missing-exercise' };
  const nextIdx = firstPendingSetIndex(ex);
  if (nextIdx >= 0) {
    commitSetRecordDefaults(ex, ex.sets[nextIdx]);
    ex.sets[nextIdx].done = true;
    return { ok: true, completedSet: nextIdx, allDone: isExerciseComplete(ex), reverted: false };
  }
  // 戻す対象は「最後に完了したセット」（スキップ行は対象外）
  const sets = ex.sets || [];
  for (let i = sets.length - 1; i >= 0; i--) {
    if (sets[i].done) {
      sets[i].done = false;
      return { ok: true, completedSet: i, allDone: false, reverted: true };
    }
    if (sets[i].skipped) {
      sets[i].skipped = false;
      return { ok: true, completedSet: i, allDone: false, reverted: true };
    }
  }
  return { ok: false, reason: 'no-sets' };
}

function skipNextSet(session, exIdx) {
  const ex = session?.exercises?.[exIdx];
  if (!ex) return { ok: false, reason: 'missing-exercise' };
  const nextIdx = firstPendingSetIndex(ex);
  if (nextIdx < 0) return { ok: false, reason: 'no-pending' };
  ex.sets[nextIdx].skipped = true;
  return { ok: true, skippedSet: nextIdx, allDone: isExerciseComplete(ex) };
}

function selectFourMenuForToday(menuKey) {
  if (!isFourMenuMode()) return false;
  const key = todaySessionKey();
  const oldSession = store.daySessions[key];
  const selected = menuKey === 'rest' ? 'rest' : normalizeFourMenuKey(menuKey);
  const menu = buildFourMenu(selected, store.settings);
  const state = getFourMenuState();
  store.daySessions[key] = {
    ...(oldSession || {}),
    key,
    date: todayStr(),
    fourMenuRotation: true,
    scheduledDate: oldSession?.scheduledDate || todayStr(),
    performedDate: todayStr(),
    scheduledSplitKey: oldSession?.scheduledSplitKey || state.nextMenuKey,
    selectedSplitKey: selected,
    performedSplitKey: selected === 'rest' ? null : selected,
    splitName: menu.name,
    dayName: menu.name,
    isRest: menu.isRest,
    activeExerciseRests: menu.activeExerciseRests || [],
    skippedRestExercises: menu.skippedRestExercises || [],
    deadliftVariant: selected === 'back' ? getFourMenuBackLiftKey(state) : null,
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
    ts: oldSession?.ts || Date.now(),
  };
  saveStore();
  return true;
}

// 最後に記録（完了/スキップ）したセットを未実施に戻す
function undoLastSetRecord(session, exIdx) {
  const ex = session?.exercises?.[exIdx];
  if (!ex) return { ok: false, reason: 'missing-exercise' };
  const sets = ex.sets || [];
  for (let i = sets.length - 1; i >= 0; i--) {
    if (sets[i].done || sets[i].skipped) {
      sets[i].done = false;
      sets[i].skipped = false;
      return { ok: true, revertedSet: i, reverted: true };
    }
  }
  return { ok: false, reason: 'no-recorded' };
}

// 今日のセッションを再計算（メニューを最新に更新、未実施部分のみ）
function recalculateTodaySession() {
  const key = todaySessionKey();
  const oldSession = store.daySessions[key];
  const menu = isFourMenuMode()
    ? buildFourMenu(oldSession?.selectedSplitKey || (store.currentState.isRestSelected ? 'rest' : store.currentState.nextMenuKey), store.settings)
    : getDayMenu(store.currentState.day, store.currentState.rotation, store.settings);

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
  if (!isFourMenuMode() && menu.isAdjustmentRotation && getDeloadMaxTestLiftForDay(menu.day)) {
    const lift = getDeloadMaxTestLiftForDay(menu.day);
    if (oldSession.maxTestSkipped) {
      const nonTest = buildR4NonTestExercise(lift.key, store.settings);
      menu.exercises = [
        ...menu.exercises.filter(ex => !(ex.isBig3 && ex.key === lift.key && (ex.isDeloadMaxTest || ex.isDeloadMaxTestBackoff || ex.isRequiredR4MaxTest))),
        ...(nonTest ? [nonTest] : []),
      ];
    } else {
      const maxTestExercises = buildRequiredR4MaxTestExercises(lift.key, store.settings) || [];
      menu.exercises = [
        ...maxTestExercises,
        ...menu.exercises.filter(ex => !(ex.isBig3 && ex.key === lift.key)),
      ];
    }
  }

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

    // 既存セットを記録済み（完了/スキップ）と未実施に分割。スキップも実績として保持する
    const doneSets = oldEx.sets.filter(s => s.done || s.skipped);
    const undoneSets = oldEx.sets.filter(s => !s.done && !s.skipped);

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

  // 「今日だけ追加」した種目は再生成メニューに含まれないため、消さずに引き継ぐ
  const todayOnlyExtras = oldSession.exercises.filter(ex =>
    ex.todayOnlyAdded && !menu.exercises.some(newEx => newEx.key === ex.key && newEx.menuType === ex.menuType)
  );
  oldSession.exercises = [...newExercises, ...todayOnlyExtras];
  oldSession.dayName = menu.name;
  if (isFourMenuMode()) {
    oldSession.splitName = menu.name;
    oldSession.selectedSplitKey = menu.menuKey;
    oldSession.performedSplitKey = menu.menuKey === 'rest' ? null : menu.menuKey;
    oldSession.deadliftVariant = menu.menuKey === 'back' ? getFourMenuBackLiftKey(getFourMenuState()) : null;
  }
  oldSession.isDeload = menu.isDeload;
  oldSession.isAdjustmentRotation = menu.isAdjustmentRotation;
  oldSession.r4AdjustmentMode = menu.r4AdjustmentMode;
  oldSession.maxTestMode = oldSession.maxTestSkipped ? 'normal' : (oldSession.maxTestMode === 'normal' ? 'normal' : 'trueOneRm');
  oldSession.isRest = menu.isRest;
  oldSession.activeExerciseRests = menu.activeExerciseRests || [];
  oldSession.skippedRestExercises = menu.skippedRestExercises || [];
  saveStore();
  return hasDoneSet;
}

// ===== 画面ルーター =====
let currentScreen = 'today';

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
    case 'today': main.innerHTML = renderToday(); afterToday(); break;
    case 'block': main.innerHTML = renderBlock(); afterBlock(); break;
    case 'log': main.innerHTML = renderLog(); afterLog(); break;
    case 'settings': main.innerHTML = renderSettings(); afterSettings(); break;
  }
  updateHeader();
}

function updateHeader() {
  const s = store.currentState;
  const el = document.getElementById('headerStatus');
  if (!el) return;
  el.innerHTML =
    `B${s.block} / <span class="${Number(s.rotation) === 4 ? 'pos-r4' : ''}">R${s.rotation}</span> / Day${s.day}`;
}

// ===== 今日のトレーニング画面 =====
// 今日画面の編集状態（アクティブセットの値ボックス選択）
let todayEdit = null; // { exIdx, field: 'kg' | 'reps' | 'rpe' }

// 強度/役割チップ（状態は色・強度は文字）
function exerciseRoleChipHtml(ex) {
  const type = String(ex.menuType || '');
  if (ex.isDeloadMaxTest || isMaxTestMenu(type)) return '<span class="chip chip-max">MAX測定</span>';
  if (ex.isDeloadMaxTestBackoff || isMaxTestBackoffMenu(type)) return '<span class="chip chip-outline">バックオフ</span>';
  if (ex.isR4NonTest || type.includes('r4-adjust')) return '<span class="chip chip-outline">R4調整</span>';
  if (ex.isAccessory || type === 'accessory' || type.startsWith('accessory')) return '<span class="chip chip-outline">補助</span>';
  if (type.includes('heavy') || type.includes('hi-main')) return '<span class="chip chip-int-heavy">重</span>';
  if (type.includes('light') || ex.isDeload) return '<span class="chip chip-int-light">軽</span>';
  return '<span class="chip chip-int-mid">中</span>';
}

// 種目の予定表記「80.0kg × 8 × 3セット」
function exercisePlanText(ex) {
  const sets = `${ex.plannedSets}セット`;
  if (ex.plannedWeight != null) return `${fmtW(ex.plannedWeight)}kg × ${ex.plannedReps} × ${sets}`;
  return `${ex.plannedReps} × ${sets}`;
}

// 記録済みセット行（done / skip / todo）。editExIdx指定時はタップでセット編集
function renderStaticSetRow(set, setIdx, editExIdx = null) {
  const stateClass = set.done ? 'set-row-done' : (set.skipped ? 'set-row-skip' : '');
  const value = set.skipped && !set.done
    ? '<span class="chip chip-pause">スキップ</span>'
    : `${fmtW(set.weight)}<span class="u">kg</span> × ${set.reps ?? '-'}`;
  const check = set.done ? '<span class="ck">✓</span>' : '<span class="ck"></span>';
  const editAttr = editExIdx != null ? ` data-edit-ex="${editExIdx}"` : '';
  return `
    <div class="set-row ${stateClass}"${editAttr}>
      <div class="sn">${setIdx + 1}</div>
      <div class="sv">${value}</div>
      <div class="st">${check}</div>
    </div>
  `;
}

// その日の実施順だけ入れ替える（ローテ・予定は変更しない）
function moveExerciseToActive(session, exIdx) {
  const exercises = session?.exercises;
  const target = exercises?.[exIdx];
  if (!target) return { ok: false, reason: 'missing-exercise' };
  if (isExerciseComplete(target)) return { ok: false, reason: 'completed' };
  const firstIncompleteIdx = exercises.findIndex(ex => !isExerciseComplete(ex));
  if (firstIncompleteIdx < 0 || firstIncompleteIdx === exIdx) return { ok: true, moved: false };
  exercises.splice(exIdx, 1);
  const insertAt = exIdx < firstIncompleteIdx ? firstIncompleteIdx - 1 : firstIncompleteIdx;
  exercises.splice(insertAt, 0, target);
  return { ok: true, moved: true };
}

// セット編集シート: 任意の種目・任意のセットを後から修正する
function openSetEditSheet(exIdx) {
  const session = store.daySessions[todaySessionKey()];
  const ex = session?.exercises?.[exIdx];
  if (!ex) return;
  const draft = ex.sets.map(s => ({
    weight: s.weight ?? '',
    reps: s.reps ?? '',
    state: s.done ? 'done' : (s.skipped ? 'skip' : 'todo'),
  }));
  let draftRpe = ex.rpe || '未入力';

  const stateBtn = (idx, state, label) =>
    `<button class="seg-opt ${draft[idx].state === state ? (state === 'skip' ? 'on-pause' : 'on') : ''}" data-se-state="${state}" data-se-idx="${idx}">${label}</button>`;

  const body = () => `
    <div class="sec-label">${escapeHtml(ex.name)}</div>
    ${draft.map((d, i) => `
      <div class="row" style="gap:8px;margin-bottom:10px;align-items:center;">
        <span class="sn" style="flex:0 0 22px;text-align:center;color:var(--text-3);font-weight:800;">${i + 1}</span>
        <input type="number" inputmode="decimal" step="0.5" value="${d.weight}" placeholder="kg" data-se-field="weight" data-se-idx="${i}" style="flex:1.2;min-height:44px;text-align:center;" />
        <input type="number" inputmode="numeric" value="${d.reps}" placeholder="回" data-se-field="reps" data-se-idx="${i}" style="flex:1;min-height:44px;text-align:center;" />
        <div class="seg" style="flex:1.6;">${stateBtn(i, 'done', '✓')}${stateBtn(i, 'skip', 'スキップ')}${stateBtn(i, 'todo', '—')}</div>
      </div>
    `).join('')}
    <div class="sec-label mt-8">RPE</div>
    <div class="sheet-chips">
      ${['7', '8', '8.5', '9', '9.5', '10'].map(r => `<span class="chip chip-tap ${draftRpe === r ? 'on' : ''}" data-se-rpe="${r}">${r}</span>`).join('')}
    </div>
    <button class="btn-primary" id="btnSetEditSave">保存</button>
    <button class="btn-text btn-block" id="btnSetEditCancel">キャンセル</button>
  `;

  const bind = () => {
    document.querySelectorAll('input[data-se-field]').forEach(input => {
      input.oninput = () => {
        const i = parseInt(input.dataset.seIdx, 10);
        if (!draft[i]) return;
        draft[i][input.dataset.seField] = input.value;
      };
    });
    document.querySelectorAll('button[data-se-state]').forEach(btn => {
      btn.onclick = () => {
        const i = parseInt(btn.dataset.seIdx, 10);
        if (!draft[i]) return;
        draft[i].state = btn.dataset.seState;
        paint();
      };
    });
    document.querySelectorAll('[data-se-rpe]').forEach(chip => {
      chip.onclick = () => {
        draftRpe = draftRpe === chip.dataset.seRpe ? '未入力' : chip.dataset.seRpe;
        paint();
      };
    });
    const saveBtn = document.getElementById('btnSetEditSave');
    if (saveBtn) saveBtn.onclick = () => {
      ex.sets = draft.map(d => {
        const weight = parseFloat(d.weight);
        const reps = parseInt(d.reps, 10);
        return {
          weight: Number.isFinite(weight) ? weight : null,
          reps: Number.isFinite(reps) ? reps : '',
          done: d.state === 'done',
          skipped: d.state === 'skip',
        };
      });
      ex.rpe = draftRpe;
      if (session.completed || findSessionExerciseLogIndex(session, ex) >= 0) {
        upsertExerciseLogFromSession(session, ex, true);
      }
      todayEdit = null;
      saveStore();
      closeModal();
      render();
    };
    const cancelBtn = document.getElementById('btnSetEditCancel');
    if (cancelBtn) cancelBtn.onclick = closeModal;
  };

  const paint = () => {
    const bodyEl = document.getElementById('modalBody');
    if (!bodyEl) return;
    bodyEl.innerHTML = body();
    bind();
  };

  openModal('セット編集', body(), bind);
}

// 進行中の種目カード（アクティブセットブロック入り）
function renderActiveExerciseCard(ex, exIdx) {
  const session = store.daySessions[todaySessionKey()];
  const setIdx = firstPendingSetIndex(ex);
  const set = ex.sets[setIdx] || {};
  const totalSets = ex.sets.length;
  const doneRows = ex.sets.slice(0, setIdx).map((s2, i) => renderStaticSetRow(s2, i, exIdx)).join('');
  const todoRows = ex.sets.slice(setIdx + 1).map((s2, i) => renderStaticSetRow(s2, setIdx + 1 + i, exIdx)).join('');
  const editing = todayEdit && todayEdit.exIdx === exIdx ? todayEdit.field : null;
  const hasRecordedSet = ex.sets.some(s2 => s2.done || s2.skipped);

  // 自重種目（チンニング等）もkgで表示・編集する（アシスト=軽く/加重=重くを同じ欄で扱う）
  const currentWeight = set.weight ?? ex.plannedWeight;
  const kgVal = currentWeight != null ? `${fmtW(currentWeight)}<span class="u">kg</span>` : '—';
  const hasSetReps = set.reps != null && set.reps !== '';
  const repsVal = hasSetReps ? `${set.reps}` : `${ex.plannedReps ?? '-'}`;
  const rpeVal = ex.rpe && ex.rpe !== '未入力' ? `@${ex.rpe}` : '—';

  let editorHtml = '';
  if (editing === 'kg') {
    editorHtml = `
      <div class="vb-editor">
        <button class="stepper" data-step-field="kg" data-step-dir="-1" data-ex="${exIdx}">−</button>
        <input class="stp-input" type="number" inputmode="decimal" step="0.1" min="0"
          value="${currentWeight ?? ''}" placeholder="kg" data-direct-field="kg" data-ex="${exIdx}" />
        <button class="stepper" data-step-field="kg" data-step-dir="1" data-ex="${exIdx}">＋</button>
      </div>`;
  } else if (editing === 'reps') {
    editorHtml = `
      <div class="vb-editor">
        <button class="stepper" data-step-field="reps" data-step-dir="-1" data-ex="${exIdx}">−</button>
        <input class="stp-input" type="number" inputmode="numeric" step="1" min="0"
          value="${hasSetReps ? set.reps : ''}" placeholder="${ex.plannedReps ?? '回'}" data-direct-field="reps" data-ex="${exIdx}" />
        <button class="stepper" data-step-field="reps" data-step-dir="1" data-ex="${exIdx}">＋</button>
      </div>`;
  } else if (editing === 'rpe') {
    editorHtml = `
      <div class="vb-editor rpe-editor">
        ${['7', '8', '8.5', '9', '9.5', '10'].map(r => `<span class="chip chip-tap ${ex.rpe === r ? 'on' : ''}" data-rpe-edit="${r}" data-ex="${exIdx}">${r}</span>`).join('')}
      </div>`;
  }

  const activeBlock = setIdx >= 0 ? `
    <div class="active-set">
      <div class="as-head">
        <span class="as-title">セット ${setIdx + 1} / ${totalSets}</span>
        <span class="as-prev">予定 ${exercisePlanText(ex)}${ex.pctNote ? ` ・ ${ex.pctNote}` : ''}${ex.isAccessory && ex.targetRpe ? ` ・ @${ex.targetRpe}` : ''}</span>
      </div>
      <div class="vbox-row">
        <div class="vbox ${editing === 'kg' ? 'selected' : ''}" data-vbox="kg" data-ex="${exIdx}">
          <span class="vb-label">重量</span>
          <span class="vb-val">${kgVal}</span>
        </div>
        <div class="vbox ${editing === 'reps' ? 'selected' : ''}" data-vbox="reps" data-ex="${exIdx}">
          <span class="vb-label">回数</span>
          <span class="vb-val">${repsVal}</span>
        </div>
        <div class="vbox ${editing === 'rpe' ? 'selected' : ''}" data-vbox="rpe" data-ex="${exIdx}">
          <span class="vb-label">RPE</span>
          <span class="vb-val">${rpeVal}</span>
        </div>
      </div>
      ${editorHtml}
      <div class="as-actions">
        <button class="btn-primary" data-action="completeSet" data-ex="${exIdx}">完了</button>
        <button class="btn-ghost" data-action="skipSet" data-ex="${exIdx}">スキップ</button>
      </div>
    </div>
  ` : '';

  const rotationProgression = ex.isBig3 ? findPendingRotationProgressionForExercise(ex, session?.day, true) : null;
  const progressionNote = ex.isBig3 && rotationProgression?.status === 'suggested' && rotationProgression.delta
    ? `<div class="accessory-suggestion"><span class="suggestion-label">次回候補</span><span>${rotationProgression.message}</span><button class="btn-secondary btn-small" data-action="adoptRotation" data-progression-id="${rotationProgression.id}">採用</button></div>`
    : '';

  const painChips = PAIN_OPTIONS.map(p => `
    <span class="chip pain ${ex.pains.includes(p) ? 'active' : ''}" data-ex="${exIdx}" data-pain="${p}">${p}</span>
  `).join('');

  return `
    <div class="card card-ex active" data-ex="${exIdx}">
      <div class="ex-head">
        <div class="ex-title">${ex.name}</div>
        <div class="ex-chips">${exerciseRoleChipHtml(ex)}</div>
      </div>
      ${ex.adjusted ? `<div class="ex-sub">調整 ${ex.adjusted > 0 ? '+' : ''}${ex.adjusted}kg</div>` : ''}
      ${doneRows}
      ${activeBlock}
      ${todoRows}
      ${progressionNote}
      <details class="ui-details compact-details mt-8">
        <summary>メモ・状態・調整</summary>
        <div class="row-rpe-pain">${painChips}</div>
        <label class="field mt-8">
          <span>メモ</span>
          <textarea data-ex="${exIdx}" data-field="note" placeholder="調子・フォーム・気付き等">${escapeHtml(ex.note)}</textarea>
        </label>
        <div class="btn-row">
          <button class="btn-secondary btn-small" data-action="rest" data-ex="${exIdx}">レスト開始</button>
          <button class="btn-secondary btn-small" data-action="adjust" data-ex="${exIdx}">重量調整</button>
          ${ex.isBig3 ? `<button class="btn-secondary btn-small" data-action="editMainSet" data-ex="${exIdx}">BIG3編集</button>` : ''}
          ${ex.isAccessory ? `<button class="btn-secondary btn-small" data-action="editAccessory" data-ex="${exIdx}">補助編集</button>` : ''}
          <button class="btn-secondary btn-small" data-action="editSets" data-ex="${exIdx}">セット編集</button>
          ${hasRecordedSet ? `<button class="btn-ghost btn-small" data-action="undoSet" data-ex="${exIdx}">1つ戻す</button>` : ''}
        </div>
      </details>
    </div>
  `;
}

// 完了済みカード（たたみ・ベスト表示）
function renderCompletedExerciseCard(ex, exIdx) {
  const doneSets = ex.sets.filter(s2 => s2.done);
  const best = doneSets.reduce((acc, s2) => {
    const w = parseFloat(s2.weight);
    return Number.isFinite(w) && w > (acc?.w ?? -1) ? { w, reps: s2.reps } : acc;
  }, null);
  const bestText = best
    ? `ベスト ${fmtW(best.w)}kg ×${best.reps ?? '-'}${ex.rpe && ex.rpe !== '未入力' ? ` @${ex.rpe}` : ''}`
    : 'スキップのみ';
  return `
    <div class="card done-card exercise-card-complete" data-ex="${exIdx}">
      <div class="dn-row">
        <span class="ex-title" style="font-size:15px;">${ex.name}</span>
        <span class="chip chip-ok">✓ 完了</span>
      </div>
      <div class="dn-row mt-8">
        <span class="dn-best">${bestText}</span>
        <span class="row" style="gap:6px;">
          <button class="btn-ghost btn-small" data-action="editSets" data-ex="${exIdx}">編集</button>
          <button class="btn-ghost btn-small" data-action="undoSet" data-ex="${exIdx}">戻す</button>
        </span>
      </div>
    </div>
  `;
}

function renderToday() {
  const session = getOrCreateTodaySession();
  const s = store.currentState;
  const fourMenuPicker = renderFourMenuTodayPicker(session);

  if (session.isRest) {
    return `
      <h2 class="screen-title">今日</h2>
      ${fourMenuPicker}
      <div class="rest-day-banner">
        <div class="big">今日は休み</div>
        <div class="muted">${session.fourMenuRotation ? '4メニュー順番ローテ' : `Day${s.day} ・ 休息日`}</div>
      </div>
      <button class="btn-primary" id="btnFinishRest">休みとして保存</button>
    `;
  }

  const incomplete = session.exercises
    .map((ex, exIdx) => ({ ex, exIdx }))
    .filter(item => !isExerciseComplete(item.ex));
  const completed = session.exercises
    .map((ex, exIdx) => ({ ex, exIdx }))
    .filter(item => isExerciseComplete(item.ex));

  const active = incomplete[0] || null;
  const upNext = incomplete.slice(1);

  const totalDoneSets = session.exercises.reduce((acc, ex) => acc + ex.sets.filter(s2 => s2.done).length, 0);
  const allDoneBanner = !incomplete.length
    ? `<div class="card flat complete-menu-banner">
        <div class="big">✓ 今日のメニュー完了</div>
        <div class="muted">${completed.length}種目 ・ ${totalDoneSets}セット</div>
      </div>`
    : '';

  const nextCard = upNext.length
    ? `<div class="card">
        <div class="sec-label">次の種目</div>
        ${upNext.map(({ ex, exIdx }) => `
          <div class="next-row" data-make-active="${exIdx}" role="button">
            <span class="nx-name">${ex.name}</span>
            <span class="nx-detail">${exercisePlanText(ex)}</span>
            ${exerciseRoleChipHtml(ex)}
            <span class="nx-go" aria-hidden="true">›</span>
          </div>
        `).join('')}
      </div>`
    : '';

  const completedCards = completed.length
    ? `<details class="ui-details completed-exercises" ${incomplete.length ? '' : 'open'}>
        <summary><span>完了済み ${completed.length}件</span></summary>
        ${completed.map(({ ex, exIdx }) => renderCompletedExerciseCard(ex, exIdx)).join('')}
      </details>`
    : '';

  // 休止種目: 灰・リストの最下部
  const pausedRows = (session.skippedRestExercises || []).length
    ? `<div class="card flat">
        ${(session.skippedRestExercises || []).map(ex => `
          <div class="next-row pause-row">
            <span class="nx-name">${escapeHtml(ex.name)}</span>
            <span class="chip chip-pause">休止中</span>
          </div>
        `).join('')}
      </div>`
    : '';

  return `
    <div class="row between" style="margin:2px 0 12px;">
      <h2 class="screen-title" style="margin:0;">今日</h2>
      <span class="muted">${session.dayName}</span>
    </div>
    ${fourMenuPicker}
    ${renderR4AdjustmentPanel(session)}
    ${renderDeloadMaxTestPanel(session)}
    ${active ? renderActiveExerciseCard(active.ex, active.exIdx) : allDoneBanner}
    ${nextCard}
    ${completedCards}
    ${pausedRows}
    <div class="btn-pair mt-12">
      <button class="btn-sec" id="btnAddTodayAccessory">＋補助種目を追加</button>
      <button class="${incomplete.length ? 'btn-sec' : 'btn-primary'}" id="btnFinishSession" style="${incomplete.length ? '' : 'min-height:56px;'}">トレーニング完了</button>
    </div>
  `;
}

function renderFourMenuTodayPicker(session) {
  if (!session?.fourMenuRotation) return '';
  const scheduled = session.scheduledSplitKey || store.currentState.nextMenuKey;
  const selected = session.selectedSplitKey || (session.isRest ? 'rest' : scheduled);
  const buttons = [...FOUR_MENU_ORDER, 'rest'].map(key => `
    <button class="seg-opt ${selected === key ? 'on' : ''}" data-four-menu-select="${key}">
      ${fourMenuLabel(key)}
    </button>
  `).join('');
  return `
    <div class="card flat four-menu-picker">
      <div class="row between">
        <div>
          <div class="sec-label">次のメニュー</div>
          <div class="strong">${fourMenuLabel(scheduled)}</div>
        </div>
        ${selected !== scheduled ? `<span class="chip chip-outline">変更中: ${fourMenuLabel(selected)}</span>` : ''}
      </div>
      <div class="seg mt-8">${buttons}</div>
    </div>
  `;
}


function afterToday() {
  const session = store.daySessions[todaySessionKey()];

  document.querySelectorAll('[data-four-menu-select]').forEach(btn => {
    btn.onclick = () => {
      const hasDone = session?.exercises?.some(ex => (ex.sets || []).some(set => set.done || set.skipped));
      if (hasDone && !confirm('入力済みのセットがあります。今日のメニューを変更しますか？')) return;
      selectFourMenuForToday(btn.dataset.fourMenuSelect);
      render();
    };
  });

  // メモ入力 → 保存
  document.querySelectorAll('textarea[data-field]').forEach(el => {
    el.addEventListener('change', () => {
      const exIdx = parseInt(el.dataset.ex);
      const ex = session.exercises[exIdx];
      if (!ex) return;
      if (el.dataset.field === 'note') ex.note = el.value;
      saveStore();
    });
  });

  // 値ボックス（タップで選択→エディタ開閉）
  document.querySelectorAll('[data-vbox]').forEach(box => {
    box.addEventListener('click', () => {
      const exIdx = parseInt(box.dataset.ex);
      const field = box.dataset.vbox;
      const ex = session.exercises[exIdx];
      if (!ex) return;
      if (todayEdit && todayEdit.exIdx === exIdx && todayEdit.field === field) {
        todayEdit = null; // 再タップで閉じる
      } else {
        todayEdit = { exIdx, field };
      }
      render();
    });
  });

  // ステッパー（kg=設定の刻み / 回=1）
  document.querySelectorAll('button[data-step-field]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const exIdx = parseInt(btn.dataset.ex);
      const dir = parseInt(btn.dataset.stepDir) || 0;
      const field = btn.dataset.stepField;
      const ex = session.exercises[exIdx];
      if (!ex) return;
      const setIdx = firstPendingSetIndex(ex);
      const set = ex.sets[setIdx];
      if (!set) return;
      if (field === 'kg') {
        const inc = parseFloat(store.settings.increment) || 2.5;
        const base = parseFloat(set.weight ?? ex.plannedWeight) || 0;
        set.weight = Math.max(0, Math.round((base + dir * inc) * 100) / 100);
      } else if (field === 'reps') {
        const parsed = parseInt(set.reps, 10);
        // 未入力時はレンジ表記（8〜12等）の上限を初期値にして±する
        const base = Number.isFinite(parsed) ? parsed : parseRangeMax(ex.plannedReps, 0);
        set.reps = Math.max(0, base + dir);
      }
      saveStore();
      render();
    });
  });

  // 直接入力（kg=小数可 / 回=整数）。不正値は保存しない
  document.querySelectorAll('input[data-direct-field]').forEach(input => {
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('change', () => {
      const exIdx = parseInt(input.dataset.ex);
      const field = input.dataset.directField;
      const ex = session.exercises[exIdx];
      if (!ex) return;
      const setIdx = firstPendingSetIndex(ex);
      const set = ex.sets[setIdx];
      if (!set) return;
      if (field === 'kg') {
        const value = parseFloat(input.value);
        if (!Number.isFinite(value) || value < 0) {
          render();
          return;
        }
        set.weight = Math.round(value * 100) / 100;
      } else if (field === 'reps') {
        const value = parseInt(input.value, 10);
        if (!Number.isFinite(value) || value < 0) {
          render();
          return;
        }
        set.reps = value;
      }
      saveStore();
      render();
    });
  });

  // RPE（アクティブセットのエディタ内チップ・再タップで解除）
  document.querySelectorAll('[data-rpe-edit]').forEach(c => {
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      const exIdx = parseInt(c.dataset.ex);
      const ex = session.exercises[exIdx];
      if (!ex) return;
      ex.rpe = ex.rpe === c.dataset.rpeEdit ? '未入力' : c.dataset.rpeEdit;
      todayEdit = null; // タップで確定して閉じる
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
      if (action === 'adoptRotation') {
        if (adoptRotationProgression(b.dataset.progressionId)) {
          showToast('次回+2.5kg補正を採用しました');
          render();
        }
        return;
      }
      if (action === 'setDeloadMaxMode') {
        if (applyDeloadMaxTestModeToSession(session, b.dataset.mode || 'normal')) {
          showToast(`${deloadMaxTestModeLabel(b.dataset.mode || 'normal')}に切り替えました`);
          render();
        }
        return;
      }
      if (action === 'setR4AdjustmentMode') {
        if (selectR4AdjustmentMode(b.dataset.r4Mode)) {
          showToast(`${R4_ADJUSTMENT_MODES[b.dataset.r4Mode]?.label || 'R4調整'}にしました`);
          render();
        }
        return;
      }
      const exIdx = parseInt(b.dataset.ex);
      const ex = session.exercises[exIdx];
      if (!ex) return;
      if (action === 'rest') {
        startRestTimer(ex.restSec, ex.name);
      } else if (action === 'completeSet') {
        const result = toggleNextSetCompletion(session, exIdx);
        if (result.ok) {
          todayEdit = null;
          saveStore();
          if (!result.reverted) startRestTimer(ex.restSec, ex.name);
          else showToast('1セット戻しました');
          render();
        }
      } else if (action === 'skipSet') {
        // スキップ: 記録には残すがタイマーは起動しない
        const result = skipNextSet(session, exIdx);
        if (result.ok) {
          todayEdit = null;
          saveStore();
          render();
        }
      } else if (action === 'undoSet') {
        const result = undoLastSetRecord(session, exIdx);
        if (result.ok) {
          todayEdit = null;
          saveStore();
          showToast('1セット戻しました');
          render();
        }
      } else if (action === 'adjust') {
        openAdjustModal(exIdx);
      } else if (action === 'editMainSet') {
        openMainSetEditModal(exIdx);
      } else if (action === 'editAccessory') {
        openAccessoryTodayModal(exIdx);
      } else if (action === 'editSets') {
        openSetEditSheet(exIdx);
      }
    });
  });

  // 次の種目をタップ → その種目を先に実施（その日の順番だけ入れ替え）
  document.querySelectorAll('[data-make-active]').forEach(row => {
    row.addEventListener('click', () => {
      const result = moveExerciseToActive(session, parseInt(row.dataset.makeActive, 10));
      if (result.ok && result.moved) {
        todayEdit = null;
        saveStore();
        render();
      }
    });
  });

  // 記録済みセット行をタップ → セット編集シート
  document.querySelectorAll('.set-row[data-edit-ex]').forEach(row => {
    row.addEventListener('click', () => {
      openSetEditSheet(parseInt(row.dataset.editEx, 10));
    });
  });

  const finishBtn = document.getElementById('btnFinishSession');
  if (finishBtn) finishBtn.onclick = finishTodaySession;

  const addTodayAccessoryBtn = document.getElementById('btnAddTodayAccessory');
  if (addTodayAccessoryBtn) addTodayAccessoryBtn.onclick = openAccessoryTodayAddModal;

  const normalDeloadBtn = document.getElementById('btnNormalDeload');
  if (normalDeloadBtn) normalDeloadBtn.onclick = () => showToast('通常デロードとして進めます');

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
        // スロットに明示重量がある場合はスロット側も更新（次回生成で確実に反映）
        if (ex.slotId) updateAccessorySlot(session.day, ex.slotId, { plannedWeight: newW });
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
      const adjKey = session.fourMenuRotation
        ? `Four-${session.performedSplitKey || session.selectedSplitKey}-${ex.key}-${ex.menuType}`
        : `Day${session.day}-${ex.key}-${ex.menuType}`;
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
  const slotOptions = ['補助スロット', '脚前側補助', 'カーフ', '胸補助', '背中', '腕', '肩', 'リアデルト系', 'チンニング', '胸・三頭補助'];
  const selectedPreset = inferPresetKey(ex);
  const displaySlotName = ex.slotName === '腰に優しい背中' ? '背中' : (ex.slotName || '補助スロット');
  return `
    <label class="field"><span>種目</span>
      <select id="${prefix}-preset" data-preset-select="${prefix}">
        ${accessoryPresetOptionsHtml(selectedPreset)}
      </select>
    </label>
    <details class="accessory-custom-name" data-custom-name="${prefix}" ${selectedPreset === 'custom' ? 'open' : ''}>
      <summary>種目名を手動編集</summary>
      <label class="field"><span>種目名</span><input type="text" id="${prefix}-name" value="${ex.name || ''}" placeholder="カスタム種目名" /></label>
    </details>
    <label class="field"><span>セット数</span><input type="number" min="0" id="${prefix}-sets" value="${ex.plannedSets || 1}" /></label>
    <label class="field"><span>回数</span><input type="text" id="${prefix}-reps" value="${ex.plannedReps || ex.reps || ''}" /></label>
    <label class="field"><span>RPE</span><input type="text" id="${prefix}-rpe" value="${ex.targetRpe || '8'}" /></label>
    <label class="field"><span>予定重量(kg)</span><input type="number" step="0.5" id="${prefix}-weight" value="${ex.plannedWeight ?? ''}" placeholder="未設定でもOK" /></label>
    <details class="accessory-details">
      <summary>詳細設定</summary>
      <label class="field"><span>スロット</span>
        <input type="text" id="${prefix}-slotName" value="${displaySlotName}" list="${prefix}-slot-options" />
        <datalist id="${prefix}-slot-options">
          ${slotOptions.map(v => `<option value="${v}"></option>`).join('')}
        </datalist>
      </label>
      <label class="field"><span>カテゴリ</span><input type="text" id="${prefix}-categories" value="${(ex.categories || []).join('、')}" /></label>
      <div class="accessory-meta accessory-form-chips">${ACCESSORY_CATEGORIES.map(c => `<span class="accessory-chip" data-chip-target="${prefix}-categories" data-chip-value="${c}">${c}</span>`).join('')}</div>
      <label class="field"><span>疲労タグ</span><input type="text" id="${prefix}-tags" value="${(ex.fatigueTags || []).join('、')}" /></label>
      <div class="accessory-meta accessory-form-chips">${ACCESSORY_FATIGUE_TAGS.map(t => `<span class="accessory-chip accessory-chip-fatigue" data-chip-target="${prefix}-tags" data-chip-value="${t}">${t}</span>`).join('')}</div>
      <label class="field"><span>重量タイプ</span>
        <select id="${prefix}-weightType">
          ${[
            ['dumbbell', 'ダンベル片手'],
            ['upper_machine', '上半身マシン'],
            ['leg_machine', 'マシン脚'],
            ['bodyweight', '自重'],
            ['cable', 'ケーブル'],
            ['barbell', 'バーベル/EZバー'],
            ['arm', '腕種目'],
            ['calf', 'カーフ'],
          ].map(([v, label]) => `<option value="${v}" ${ex.weightType === v ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </label>
    </details>
  `;
}

function readSlotForm(prefix, base = {}) {
  const nameInput = document.getElementById(`${prefix}-name`);
  const plannedSets = Math.max(0, parseInt(document.getElementById(`${prefix}-sets`).value, 10) || 0);
  const reps = document.getElementById(`${prefix}-reps`).value.trim() || '8〜12';
  const plannedWeightRaw = document.getElementById(`${prefix}-weight`)?.value ?? '';
  const presetKey = document.getElementById(`${prefix}-preset`)?.value || inferPresetKey(base);
  const preset = getAccessoryPreset(presetKey);
  const name = nameInput?.value.trim() || (preset && !preset.custom ? preset.name : '') || '補助種目';
  return normalizeAccessorySlot({
    ...base,
    slotName: document.getElementById(`${prefix}-slotName`)?.value.trim() || base.slotName || '補助スロット',
    name,
    key: preset && !preset.custom ? preset.key : (base.key || accessoryKeyFromName(name)),
    plannedSets,
    setsText: String(plannedSets),
    reps,
    targetRpe: document.getElementById(`${prefix}-rpe`).value.trim() || '8',
    categories: normalizeList(document.getElementById(`${prefix}-categories`).value, ACCESSORY_CATEGORIES),
    fatigueTags: normalizeList(document.getElementById(`${prefix}-tags`).value, ACCESSORY_FATIGUE_TAGS),
    plannedWeight: plannedWeightRaw === '' ? null : parseFloat(plannedWeightRaw),
    weightType: document.getElementById(`${prefix}-weightType`).value,
  });
}

function bindSlotFormChips(prefix) {
  document.querySelectorAll(`[data-chip-target^="${prefix}-"]`).forEach(chip => {
    chip.onclick = () => {
      const input = document.getElementById(chip.dataset.chipTarget);
      if (!input) return;
      const value = chip.dataset.chipValue;
      const list = normalizeList(input.value);
      const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value];
      input.value = next.join('、');
    };
  });
}

function fillSlotFormFromPreset(prefix, presetKey) {
  const preset = getAccessoryPreset(presetKey);
  if (!preset) return;
  const setValue = (id, value) => {
    const el = document.getElementById(`${prefix}-${id}`);
    if (el) el.value = value ?? '';
  };
  setValue('name', preset.custom ? '' : preset.name);
  setValue('slotName', preset.slotName);
  setValue('sets', preset.plannedSets);
  setValue('reps', preset.reps);
  setValue('rpe', preset.targetRpe);
  setValue('categories', (preset.categories || []).join('、'));
  setValue('tags', (preset.fatigueTags || []).join('、'));
  setValue('weightType', preset.weightType);
  const nameDetails = document.querySelector(`[data-custom-name="${prefix}"]`);
  if (nameDetails) nameDetails.open = !!preset.custom;
}

function bindAccessoryPresetSelect(prefix) {
  const select = document.getElementById(`${prefix}-preset`);
  if (!select) return;
  select.onchange = () => fillSlotFormFromPreset(prefix, select.value);
}

function applySlotToExercise(ex, updated) {
  Object.assign(ex, {
    name: updated.name,
    key: updated.key,
    plannedWeight: updated.plannedWeight,
    plannedSets: updated.plannedSets,
    plannedReps: updated.reps,
    targetRpe: updated.targetRpe,
    categories: updated.categories,
    fatigueTags: updated.fatigueTags,
    slotId: updated.slotId,
    slotName: updated.slotName,
    weightType: updated.weightType,
    restSec: REST_TIME_SEC[updated.restType] || REST_TIME_SEC.default,
  });
  ex.sets.forEach(set => {
    if (!set.done && updated.plannedWeight != null) set.weight = updated.plannedWeight;
  });
  resizeExerciseSets(ex);
}

function openMainSetEditModal(exIdx) {
  const session = store.daySessions[todaySessionKey()];
  const ex = session?.exercises?.[exIdx];
  if (!ex?.isBig3) return;
  openModal('BIG3メイン編集', `
    <div class="muted mb-8">${ex.name}</div>
    <label class="field">
      <span>予定重量(kg)</span>
      <input type="number" inputmode="decimal" step="0.5" id="mainEditWeight" value="${ex.plannedWeight ?? ''}" />
    </label>
    <label class="field">
      <span>回数</span>
      <input type="number" inputmode="numeric" min="1" id="mainEditReps" value="${ex.plannedReps ?? ''}" />
    </label>
    <label class="field">
      <span>セット数</span>
      <input type="number" inputmode="numeric" min="1" id="mainEditSets" value="${ex.plannedSets ?? ''}" />
    </label>
    <div class="btn-row">
      <button class="btn-primary" id="main-edit-save">今日だけ変更</button>
      <button class="btn-warn" id="main-edit-save-future">今後も変更</button>
    </div>
  `, () => {
    const save = (applyFuture) => {
      const values = {
        plannedWeight: document.getElementById('mainEditWeight').value,
        plannedReps: document.getElementById('mainEditReps').value,
        plannedSets: document.getElementById('mainEditSets').value,
      };
      let result = applyMainSetEdit(ex, values);
      if (result.reason === 'needs-confirm') {
        if (!confirm('削除されるセットに完了記録があります。セット数を減らしますか？')) return;
        result = applyMainSetEdit(ex, values, { confirmDiscard: true });
      }
      if (!result.ok) {
        showToast('入力値を確認してください');
        return;
      }
      if (applyFuture) {
        const scopeLabel = session.fourMenuRotation ? '同じメニュー・種目・枠' : '同じDay・種目・枠';
        if (!confirm(`${scopeLabel}の今後の予定にも反映します。過去ログは変更しません。`)) return;
        saveMainSetOverride(session.fourMenuRotation ? session.performedSplitKey || session.selectedSplitKey : session.day, ex);
      }
      saveStore();
      closeModal();
      render();
      showToast(applyFuture ? 'BIG3予定を今後も変更しました' : 'BIG3予定を今日だけ変更しました');
    };
    document.getElementById('main-edit-save').onclick = () => save(false);
    document.getElementById('main-edit-save-future').onclick = () => save(true);
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
    bindSlotFormChips('accToday');
    bindAccessoryPresetSelect('accToday');
    document.getElementById('acc-today-only').onclick = () => {
      const updated = readSlotForm('accToday', ex);
      applySlotToExercise(ex, updated);
      saveStore();
      closeModal();
      render();
      showToast('今日だけ補助種目を変更しました');
    };
    document.getElementById('acc-save-future').onclick = () => {
      const updated = readSlotForm('accToday', ex);
      if (!confirmAccessoryChange('この変更を今後の同じDayにも反映しますか？', updated, session.day)) return;
      // 既存スロットを更新。未登録（今日だけ追加した種目など）はスロットとして新規保存する
      const persisted = updateAccessorySlot(session.day, ex.slotId, updated);
      if (!persisted) {
        const savedSlot = addAccessorySlot(session.day, updated.slotName, { ...updated, slotId: ex.slotId });
        if (savedSlot?.slotId) updated.slotId = savedSlot.slotId;
      }
      applySlotToExercise(ex, updated);
      saveStore();
      closeModal();
      render();
      showToast('今後にも反映しました');
    };
    document.getElementById('acc-delete-today').onclick = () => {
      if (!confirm('この補助種目を今日だけ削除しますか？今後の基本プログラムには残ります。')) return;
      session.deletedAccessories = session.deletedAccessories || [];
      session.deletedAccessories.push({
        ts: Date.now(),
        action: 'today-only-delete',
        exerciseKey: ex.key,
        exerciseName: ex.name,
        slotId: ex.slotId,
        slotName: ex.slotName,
      });
      session.exercises.splice(exIdx, 1);
      saveStore();
      closeModal();
      render();
      showToast('今日だけ削除しました');
    };
  });
}

function openAccessoryTodayAddModal() {
  const session = store.daySessions[todaySessionKey()];
  if (!session || session.isRest) return;
  const base = normalizeAccessorySlot({
    slotId: `today_${session.day}_${uid()}`,
    slotName: '補助スロット',
    key: `custom_${uid()}`,
    name: '新規補助種目',
    plannedSets: 2,
    reps: '8〜12',
    targetRpe: '8',
    // カテゴリは自動付与しない（未分類のまま）。休止判定は明示的に選んだ部位・種目のみに適用する
    categories: [],
    fatigueTags: ['低リスク'],
    weightType: 'upper_machine',
    restType: 'default',
  });
  openModal('補助種目を追加', `
    <div class="muted mb-8">Day${session.day} に追加します。今日だけ、または今後にも反映を選べます。</div>
    ${slotFormHtml('accAddToday', { ...base, plannedReps: base.reps })}
    <div class="btn-row">
      <button class="btn-secondary" id="acc-add-today-only">今日だけ追加</button>
      <button class="btn-warn" id="acc-add-future">今後にも反映</button>
    </div>
  `, () => {
    bindSlotFormChips('accAddToday');
    bindAccessoryPresetSelect('accAddToday');
    document.getElementById('acc-add-today-only').onclick = () => {
      const updated = readSlotForm('accAddToday', base);
      const ex = accessoryExerciseFromSlot(updated, store.settings, session.isDeload, session.day);
      ex.sets = Array.from({ length: ex.plannedSets }, () => ({ weight: ex.plannedWeight, reps: '', done: false }));
      ex.rpe = '未入力';
      ex.pains = ['なし'];
      ex.note = '';
      ex.todayOnlyAdded = true;
      session.exercises.push(ex);
      saveStore();
      closeModal();
      render();
      showToast('今日だけ補助種目を追加しました');
    };
    document.getElementById('acc-add-future').onclick = () => {
      const updated = readSlotForm('accAddToday', base);
      if (!confirmAccessoryChange('この補助種目を今後の同じDayにも追加しますか？', updated, session.day)) return;
      const savedSlot = addAccessorySlot(session.day, updated.slotName, updated);
      const ex = accessoryExerciseFromSlot(savedSlot, store.settings, session.isDeload, session.day);
      ex.sets = Array.from({ length: ex.plannedSets }, () => ({ weight: ex.plannedWeight, reps: '', done: false }));
      ex.rpe = '未入力';
      ex.pains = ['なし'];
      ex.note = '';
      session.exercises.push(ex);
      saveStore();
      closeModal();
      render();
      showToast('今後にも反映して追加しました');
    };
  });
}

function updateAccessorySlot(day, slotId, updatedSlot) {
  const slots = store.settings.accessorySlots || defaultAccessorySlots();
  const key = String(day);
  const idx = (slots[key] || []).findIndex(slot => slot.slotId === slotId);
  if (idx < 0) {
    store.settings.accessorySlots = slots;
    return false; // 呼び出し側でスロット追加にフォールバックする
  }
  slots[key][idx] = normalizeAccessorySlot({ ...slots[key][idx], ...updatedSlot, slotId });
  store.settings.accessorySlots = slots;
  return true;
}

function deleteAccessorySlot(day, slotId) {
  const slots = store.settings.accessorySlots || defaultAccessorySlots();
  const key = String(day);
  slots[key] = (slots[key] || []).filter(slot => slot.slotId !== slotId);
  store.settings.accessorySlots = slots;
}

function addAccessorySlot(day, slotName, slotData = null) {
  const slots = store.settings.accessorySlots || defaultAccessorySlots();
  const key = String(day);
  slots[key] = slots[key] || [];
  const base = slotData || {
    name: '新規補助種目',
    setsText: '2',
    plannedSets: 2,
    reps: '8〜12',
    targetRpe: '8',
    categories: [],
    fatigueTags: ['低リスク'],
    weightType: 'upper_machine',
    restType: 'default',
  };
  const normalized = normalizeAccessorySlot({
    ...base,
    slotId: slotData?.slotId && !String(slotData.slotId).startsWith('today_') ? slotData.slotId : `custom_${day}_${uid()}`,
    slotName: slotName || slotData?.slotName || '補助スロット',
    key: slotData?.key && !String(slotData.key).startsWith('custom_') ? slotData.key : (slotData?.key || `custom_${uid()}`),
  });
  slots[key].push(normalized);
  store.settings.accessorySlots = slots;
  return normalized;
}

function resetAccessorySlotsForDay(day) {
  const slots = store.settings.accessorySlots || defaultAccessorySlots();
  const key = String(day);
  slots[key] = defaultAccessorySlots()[key] || [];
  store.settings.accessorySlots = slots;
}

function moveAccessorySlot(day, slotId, direction) {
  const slots = store.settings.accessorySlots || defaultAccessorySlots();
  const key = String(day);
  const list = slots[key] || [];
  const idx = list.findIndex(slot => slot.slotId === slotId);
  const nextIdx = idx + direction;
  if (idx < 0 || nextIdx < 0 || nextIdx >= list.length) return;
  const [slot] = list.splice(idx, 1);
  list.splice(nextIdx, 0, slot);
  store.settings.accessorySlots = slots;
}

function openAccessorySlotSettingsModal(day, slot) {
  accessoryEditorOpenDay = String(day);
  openModal('補助種目を今後にも反映', `
    <div class="muted mb-8">Day${day} / ${slot.slotName}</div>
    ${slotFormHtml('accSlot', { ...slot, plannedReps: slot.reps, plannedSets: slot.plannedSets })}
    <div class="btn-row">
      <button class="btn-warn" id="acc-slot-save">今後にも反映</button>
      <button class="btn-danger" id="acc-slot-delete">削除</button>
    </div>
  `, () => {
    bindSlotFormChips('accSlot');
    bindAccessoryPresetSelect('accSlot');
    document.getElementById('acc-slot-save').onclick = () => {
      const updated = readSlotForm('accSlot', slot);
      if (!confirmAccessoryChange('この補助種目の変更を今後にも反映しますか？', updated, day)) return;
      updateAccessorySlot(day, slot.slotId, updated);
      saveStore();
      closeModal();
      render();
      showToast('補助種目を更新しました');
    };
    document.getElementById('acc-slot-delete').onclick = () => {
      if (!confirm('この補助種目を今後のメニューから削除しますか？BIG3本体は削除されません。')) return;
      deleteAccessorySlot(day, slot.slotId);
      saveStore();
      closeModal();
      render();
      showToast('補助種目を削除しました');
    };
  });
}

function openAccessorySlotAddModal(day) {
  accessoryEditorOpenDay = String(day);
  const base = normalizeAccessorySlot({
    slotId: `custom_${day}_${uid()}`,
    slotName: '補助スロット',
    key: `custom_${uid()}`,
    name: '新規補助種目',
    plannedSets: 2,
    reps: '8〜12',
    targetRpe: '8',
    // カテゴリは自動付与しない（休止判定は明示的に選んだ部位・種目のみ）
    categories: [],
    fatigueTags: ['低リスク'],
    weightType: 'upper_machine',
    restType: 'default',
  });
  openModal('補助種目を追加', `
    <div class="muted mb-8">Day${day} の基本プログラムに追加します。</div>
    ${slotFormHtml('accSlotAdd', { ...base, plannedReps: base.reps })}
    <div class="btn-row">
      <button class="btn-warn" id="acc-slot-add-save">今後にも反映</button>
    </div>
  `, () => {
    bindSlotFormChips('accSlotAdd');
    bindAccessoryPresetSelect('accSlotAdd');
    document.getElementById('acc-slot-add-save').onclick = () => {
      const updated = readSlotForm('accSlotAdd', base);
      if (!confirmAccessoryChange('この補助種目を今後のメニューに追加しますか？', updated, day)) return;
      addAccessorySlot(day, updated.slotName, updated);
      saveStore();
      closeModal();
      render();
      showToast('補助種目を追加しました');
    };
  });
}

function bindAccessorySlotEditorActions() {
  document.querySelectorAll('[data-accessory-day]').forEach(detail => {
    detail.addEventListener('toggle', () => {
      if (detail.open) accessoryEditorOpenDay = String(detail.dataset.accessoryDay);
    });
  });
  document.querySelectorAll('button[data-current-accessory-day]').forEach(btn => {
    btn.onclick = () => {
      accessoryEditorOpenDay = String(store.currentState.day);
      render();
    };
  });
  document.querySelectorAll('button[data-edit-slot-id]').forEach(btn => {
    btn.onclick = () => {
      const day = btn.dataset.editSlotDay;
      accessoryEditorOpenDay = String(day);
      const slotId = btn.dataset.editSlotId;
      const slot = (store.settings.accessorySlots?.[day] || []).find(s => s.slotId === slotId);
      if (slot) openAccessorySlotSettingsModal(day, slot);
    };
  });
  document.querySelectorAll('button[data-delete-slot-id]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('この補助種目を今後のメニューから削除しますか？BIG3本体は削除されません。')) return;
      accessoryEditorOpenDay = String(btn.dataset.deleteSlotDay);
      deleteAccessorySlot(btn.dataset.deleteSlotDay, btn.dataset.deleteSlotId);
      saveStore();
      render();
      showToast('補助種目を削除しました');
    };
  });
  document.querySelectorAll('button[data-add-slot-day]').forEach(btn => {
    btn.onclick = () => {
      accessoryEditorOpenDay = String(btn.dataset.addSlotDay);
      openAccessorySlotAddModal(btn.dataset.addSlotDay);
    };
  });
  document.querySelectorAll('button[data-reset-slot-day]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm(`Day${btn.dataset.resetSlotDay} の補助種目を初期おすすめに戻しますか？`)) return;
      accessoryEditorOpenDay = String(btn.dataset.resetSlotDay);
      resetAccessorySlotsForDay(btn.dataset.resetSlotDay);
      saveStore();
      render();
      showToast('初期おすすめに戻しました');
    };
  });
  document.querySelectorAll('button[data-move-slot-id]').forEach(btn => {
    btn.onclick = () => {
      accessoryEditorOpenDay = String(btn.dataset.moveSlotDay);
      moveAccessorySlot(btn.dataset.moveSlotDay, btn.dataset.moveSlotId, parseInt(btn.dataset.moveDir, 10));
      saveStore();
      render();
    };
  });
}

function bindExerciseRestSettingsActions() {
  const addBtn = document.getElementById('btnAddExerciseRest');
  if (addBtn) addBtn.onclick = () => openExerciseRestSheet();
  document.querySelectorAll('button[data-edit-exercise-rest]').forEach(btn => {
    btn.onclick = () => openExerciseRestSheet(btn.dataset.editExerciseRest);
  });
  document.querySelectorAll('button[data-end-exercise-rest]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.endExerciseRest;
      store.settings.exerciseRestSettings = (store.settings.exerciseRestSettings || []).map(rest =>
        rest.id === id ? { ...rest, ended: true, endDate: todayStr() } : rest
      );
      saveStore();
      recalculateTodaySession();
      render();
      showToast('休止設定を終了しました');
    };
  });
  document.querySelectorAll('button[data-delete-exercise-rest]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('この休止設定を削除しますか？過去ログは変更しません。')) return;
      const id = btn.dataset.deleteExerciseRest;
      store.settings.exerciseRestSettings = (store.settings.exerciseRestSettings || []).filter(rest => rest.id !== id);
      saveStore();
      recalculateTodaySession();
      render();
      showToast('休止設定を削除しました');
    };
  });
}

function findSessionExerciseLogIndex(session, ex) {
  if (!session || !ex) return -1;
  if (session.fourMenuRotation) {
    return (store.logs || []).findIndex(l =>
      l.fourMenuRotation && l.date === session.date &&
      l.exerciseKey === ex.key && l.menuType === ex.menuType &&
      (l.performedSplitKey || l.selectedSplitKey || l.menuKey) === (session.performedSplitKey || session.selectedSplitKey)
    );
  }
  return (store.logs || []).findIndex(l =>
    l.date === session.date && Number(l.day) === Number(session.day) &&
    Number(l.block) === Number(session.block) && Number(l.rotation) === Number(session.rotation) &&
    l.exerciseKey === ex.key && l.menuType === ex.menuType
  );
}

function buildExerciseLogFromSession(session, ex, existing = null) {
  const fourMeta = session.fourMenuRotation ? {
    fourMenuRotation: true,
    weeklySplit: false,
    scheduledDate: session.scheduledDate || session.date,
    performedDate: session.performedDate || session.date,
    scheduledSplitKey: session.scheduledSplitKey || null,
    selectedSplitKey: session.selectedSplitKey || null,
    performedSplitKey: session.performedSplitKey || session.selectedSplitKey || null,
    menuKey: session.performedSplitKey || session.selectedSplitKey || null,
    splitName: session.splitName || session.dayName || null,
    menuName: session.splitName || session.dayName || null,
    deadliftVariant: ex.deadliftVariant || session.deadliftVariant || null,
  } : {};
  return {
    id: existing?.id || uid(),
    date: session.date,
    day: session.fourMenuRotation ? null : session.day,
    block: session.fourMenuRotation ? null : session.block,
    rotation: session.fourMenuRotation ? null : session.rotation,
    ...fourMeta,
    isDeload: session.isDeload,
    isAdjustmentRotation: !!session.isAdjustmentRotation,
    r4AdjustmentMode: session.r4AdjustmentMode || null,
    exerciseKey: ex.key,
    exerciseName: ex.name,
    menuType: ex.menuType,
    plannedWeight: ex.plannedWeight,
    plannedReps: ex.plannedReps,
    plannedSets: ex.plannedSets,
    targetRpe: ex.targetRpe,
    isDeloadAccessory: !!ex.isDeloadAccessory,
    normalPlannedSets: ex.normalPlannedSets,
    deloadPlannedSets: ex.isDeloadAccessory ? ex.plannedSets : null,
    normalTargetRpe: ex.normalTargetRpe,
    deloadTargetRpe: ex.deloadTargetRpe,
    categories: ex.categories || [],
    fatigueTags: ex.fatigueTags || [],
    weightType: ex.weightType,
    slotId: ex.slotId,
    slotName: ex.slotName,
    sets: (ex.sets || []).map(s => ({ weight: s.weight, reps: s.reps, done: !!s.done, skipped: !!s.skipped })),
    doneSets: (ex.sets || []).filter(s => s.done).length,
    rpe: ex.rpe,
    pains: ex.pains || [],
    note: ex.note || '',
    manualAdjusted: !!ex.adjusted,
    maxTestId: existing?.maxTestId,
    ts: Date.now(),
  };
}

function upsertExerciseLogFromSession(session, ex, allowCreate = false) {
  store.logs = store.logs || [];
  const existIdx = findSessionExerciseLogIndex(session, ex);
  if (existIdx < 0 && !allowCreate) return null;
  const existing = existIdx >= 0 ? store.logs[existIdx] : null;
  const log = buildExerciseLogFromSession(session, ex, existing);
  if (existIdx >= 0) store.logs[existIdx] = log;
  else store.logs.push(log);
  const savedLog = existIdx >= 0 ? store.logs[existIdx] : store.logs[store.logs.length - 1];
  if (!savedLog.fourMenuRotation && isBig3Key(savedLog.exerciseKey)) {
    const entry = upsertEstimatedMaxFromLog(savedLog);
    if (isMaxTestMenu(savedLog.menuType)) upsertMaxTestResultFromLog(savedLog, entry);
    upsertRotationProgressionFromLog(savedLog);
  } else if (savedLog.fourMenuRotation && isBig3Key(savedLog.exerciseKey)) {
    upsertEstimatedMaxFromLog(savedLog);
  }
  return savedLog;
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
    upsertExerciseLogFromSession(session, ex, true);
  });

  (session.skippedRestExercises || []).forEach(ex => {
    const fourMeta = session.fourMenuRotation ? {
      fourMenuRotation: true,
      scheduledDate: session.scheduledDate || session.date,
      performedDate: session.performedDate || session.date,
      scheduledSplitKey: session.scheduledSplitKey || null,
      selectedSplitKey: session.selectedSplitKey || null,
      performedSplitKey: session.performedSplitKey || session.selectedSplitKey || null,
      menuKey: session.performedSplitKey || session.selectedSplitKey || null,
      splitName: session.splitName || session.dayName || null,
      menuName: session.splitName || session.dayName || null,
    } : {};
    const log = {
      id: uid(),
      date: session.date,
      day: session.fourMenuRotation ? null : session.day,
      block: session.fourMenuRotation ? null : session.block,
      rotation: session.fourMenuRotation ? null : session.rotation,
      ...fourMeta,
      isDeload: session.isDeload,
      isAdjustmentRotation: !!session.isAdjustmentRotation,
      r4AdjustmentMode: session.r4AdjustmentMode || null,
      exerciseKey: ex.key,
      exerciseName: ex.name,
      menuType: `rest-${ex.menuType || ex.key}`,
      plannedWeight: ex.plannedWeight ?? null,
      plannedReps: ex.plannedReps ?? null,
      plannedSets: 0,
      targetRpe: ex.targetRpe || null,
      categories: ex.categories || [],
      fatigueTags: ex.fatigueTags || [],
      weightType: ex.weightType || null,
      slotId: ex.slotId || null,
      slotName: ex.slotName || null,
      sets: [],
      doneSets: 0,
      rpe: '未入力',
      pains: [],
      note: ex.restSettingNote || '休止',
      manualAdjusted: false,
      isExerciseRest: true,
      restSettingId: ex.restSettingId,
      restSettingName: ex.restSettingName,
      restParts: ex.restParts || [],
      restStartDate: ex.restStartDate,
      restEndDate: ex.restEndDate,
      ts: Date.now(),
    };
    const existIdx = store.logs.findIndex(l =>
      l.date === log.date && l.exerciseKey === log.exerciseKey && l.menuType === log.menuType &&
      (!log.fourMenuRotation || (l.performedSplitKey || l.selectedSplitKey || l.menuKey) === (log.performedSplitKey || log.selectedSplitKey || log.menuKey))
    );
    if (existIdx >= 0) store.logs[existIdx] = { ...log, id: store.logs[existIdx].id || log.id };
    else store.logs.push(log);
  });

  (session.deletedAccessories || []).forEach(deleted => {
    const fourMeta = session.fourMenuRotation ? {
      fourMenuRotation: true,
      scheduledDate: session.scheduledDate || session.date,
      performedDate: session.performedDate || session.date,
      scheduledSplitKey: session.scheduledSplitKey || null,
      selectedSplitKey: session.selectedSplitKey || null,
      performedSplitKey: session.performedSplitKey || session.selectedSplitKey || null,
      menuKey: session.performedSplitKey || session.selectedSplitKey || null,
      splitName: session.splitName || session.dayName || null,
      menuName: session.splitName || session.dayName || null,
    } : {};
    const log = {
      id: uid(),
      date: session.date,
      day: session.fourMenuRotation ? null : session.day,
      block: session.fourMenuRotation ? null : session.block,
      rotation: session.fourMenuRotation ? null : session.rotation,
      ...fourMeta,
      isDeload: session.isDeload,
      exerciseKey: deleted.exerciseKey,
      exerciseName: deleted.exerciseName,
      menuType: `accessory-deleted-${deleted.slotId || deleted.exerciseKey}`,
      plannedWeight: null,
      plannedReps: null,
      plannedSets: 0,
      targetRpe: null,
      categories: [],
      fatigueTags: [],
      weightType: null,
      slotId: deleted.slotId,
      slotName: deleted.slotName,
      sets: [],
      doneSets: 0,
      rpe: '未入力',
      pains: [],
      note: '今日だけ削除',
      todayOnlyDeleted: true,
      manualAdjusted: false,
      ts: deleted.ts || Date.now(),
    };
    const existIdx = store.logs.findIndex(l =>
      l.date === log.date && l.exerciseKey === log.exerciseKey && l.menuType === log.menuType &&
      (!log.fourMenuRotation || (l.performedSplitKey || l.selectedSplitKey || l.menuKey) === (log.performedSplitKey || log.selectedSplitKey || log.menuKey))
    );
    if (existIdx >= 0) store.logs[existIdx] = { ...log, id: store.logs[existIdx].id || log.id };
    else store.logs.push(log);
  });

  session.completed = true;
  store.currentState.lastTrainingDate = session.date;
  if (session.fourMenuRotation) {
    const performed = session.performedSplitKey || session.selectedSplitKey;
    if (performed && performed !== 'rest') {
      store.currentState.lastCompletedMenuKey = performed;
      store.currentState.lastCompletedDate = session.date;
      if (performed === 'back') {
        store.currentState.backCompletedCount = (parseInt(store.currentState.backCompletedCount, 10) || 0) + 1;
      }
      store.currentState.nextMenuKey = nextFourMenuKey(performed);
      store.currentState.isRestSelected = false;
    } else {
      store.currentState.isRestSelected = true;
    }
    saveStore();
    showToast('お疲れさま！記録を保存しました');
    if (performed && performed !== 'rest') {
      setTimeout(() => {
        if (confirm(`次は「${fourMenuLabel(store.currentState.nextMenuKey)}」です。次回まで休みにしますか？`)) {
          store.currentState.isRestSelected = true;
          saveStore();
        }
        navigate('today');
      }, 800);
    } else {
      navigate('today');
    }
    return;
  }
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
        navigate('today');
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
  // 進捗バー（要素がある実DOMでのみ更新）
  const fill = document.getElementById('restBarFill');
  if (fill && fill.style) {
    const total = restState.restDurationSec || 0;
    const pct = total > 0 ? Math.max(0, Math.min(100, (restState.remaining / total) * 100)) : 0;
    fill.style.width = `${pct}%`;
  }
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
  if (isFourMenuMode()) return renderFourMenuPlan();
  const s = store.currentState;
  const viewRotation = blockViewRotation || s.rotation;
  const cells = [1, 2, 3, 4].map(r => {
    const cls = [
      r === viewRotation ? 'current' : '',
      r === 4 ? 'deload' : '',
      r === s.rotation ? 'actual-current' : '',
    ].filter(Boolean).join(' ');
    return `<button class="rotation-cell ${cls}" data-block-rotation="${r}">R${r}${r === s.rotation ? '<br><span class="status-pill status-ok">現在</span>' : ''}${r === 4 ? '<br><span class="muted" style="font-size:11px;">調整</span>' : ''}</button>`;
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
    ? `<div class="deload-banner" style="background:var(--accent-soft);border-color:var(--accent-soft);border-left-color:var(--accent);">
         <div class="label" style="color:var(--accent);">参考提案</div>
         <div class="muted">参考表示</div>
       </div>`
    : `<div class="deload-banner" style="background:var(--success-soft);border-color:var(--success-soft);border-left-color:var(--success);">
         <div class="label" style="color:var(--success);">ブロック完了</div>
         <div class="muted">採用で次ブロックへ</div>
       </div>`;

  const acceptBtnAttr = blockComplete ? '' : 'disabled style="opacity:0.45;cursor:not-allowed;"';
  const acceptHelp = blockComplete
    ? ''
    : '<div class="muted mt-8" style="font-size:12px;">完了後に採用可</div>';

  // 1ローテ予定一覧（選択中ローテの8日分）
  const rotationOverview = [1,2,3,4,5,6,7,8].map(d => {
    const m = getDayMenu(d, viewRotation, store.settings);
    const isCurrent = viewRotation === s.rotation && d === s.day;
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
      <details class="rotation-day-card ui-details" ${isCurrent ? 'open' : ''} style="${isCurrent ? 'border-color:var(--accent);background:rgba(79,110,247,0.06);' : ''}">
        <summary>
          <span>
            <span style="font-size:13px;font-weight:600;">Day${d}${isCurrent ? ' <span class="text-warn" style="font-size:10px;">(現在)</span>' : ''}</span>
            <span class="muted" style="font-size:11px;">${m.name}</span>
          </span>
        </summary>
        <div class="row between" style="align-items:center;margin-bottom:6px;">
          <span class="muted" style="font-size:12px;">${m.isRest ? '休息日' : 'メニュー'}</span>
          <button class="btn-secondary btn-small" data-set-day="${d}" ${isCurrent ? 'disabled style="opacity:0.45;"' : ''}>このDayに設定</button>
        </div>
        ${summary}
      </details>
    `;
  }).join('');
  const blockAccessoryEditor = renderAccessorySlotEditor('block');

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
      ${viewRotation !== s.rotation ? `<button class="btn-secondary btn-small mt-8" id="btnBackToCurrentRotation">現在ローテへ戻る</button>` : ''}
    </div>

    <div class="section">
      <h2>8日分の予定（R${viewRotation}）${viewRotation === s.rotation ? '<span class="status-pill status-ok">現在</span>' : ''}</h2>
      <div class="muted" style="font-size:12px;margin-bottom:8px;">
        8日分の予定
      </div>
      ${rotationOverview}
    </div>

    ${blockAccessoryEditor}

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
      <h2>推定MAX要約</h2>
      ${renderEstimatedMaxSummary()}
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
  if (isFourMenuMode()) {
    document.querySelectorAll('[data-set-next-four-menu]').forEach(btn => {
      btn.onclick = () => {
        store.currentState.nextMenuKey = normalizeFourMenuKey(btn.dataset.setNextFourMenu);
        store.currentState.isRestSelected = false;
        saveStore();
        render();
      };
    });
    const restBtn = document.getElementById('btnSetFourMenuRest');
    if (restBtn) restBtn.onclick = () => {
      store.currentState.isRestSelected = true;
      saveStore();
      render();
    };
    return;
  }
  const sug = computeNextBlockSuggestion();
  const blockComplete = isCurrentBlockComplete();

  document.querySelectorAll('button[data-block-rotation]').forEach(btn => {
    btn.onclick = () => {
      const r = parseInt(btn.dataset.blockRotation, 10);
      if (!r || r < 1 || r > 4) return;
      blockViewRotation = r;
      render();
    };
  });
  const backRotationBtn = document.getElementById('btnBackToCurrentRotation');
  if (backRotationBtn) {
    backRotationBtn.onclick = () => {
      blockViewRotation = store.currentState.rotation;
      render();
    };
  }

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
    navigate('today');
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

  bindAccessorySlotEditorActions();
  bindEstimatedMaxActions();
}

function renderFourMenuPlan() {
  const state = getFourMenuState();
  const rows = FOUR_MENU_ORDER.map(menuKey => {
    const menu = buildFourMenu(menuKey, store.settings);
    const main = menu.exercises.find(ex => ex.isBig3);
    const accessoryCount = menu.exercises.filter(ex => ex.isAccessory).length;
    const selected = state.nextMenuKey === menuKey && !state.isRestSelected;
    return `
      <div class="card four-plan-card ${selected ? 'active-plan' : ''}">
        <div class="row between">
          <div>
            <div class="strong">${fourMenuLabel(menuKey)}</div>
            <div class="muted">${main ? `${main.name} ${fmtW(main.plannedWeight)}kg × ${main.plannedReps} × ${main.plannedSets}` : 'メインなし'}</div>
          </div>
          ${selected ? '<span class="status-pill status-ok">次回</span>' : `<button class="btn-secondary btn-small" data-set-next-four-menu="${menuKey}">次回に設定</button>`}
        </div>
        ${main ? `<div class="muted mt-8" style="font-size:12px;">${main.progressionReason} / 参照: ${main.progressionReferenceDate}</div>` : ''}
        <details class="ui-details compact-details mt-8">
          <summary>補助 ${accessoryCount}種目</summary>
          ${(menu.exercises.filter(ex => ex.isAccessory).map(ex => `<div class="next-row"><span class="nx-name">${ex.name}</span><span class="nx-detail">${exercisePlanText(ex)}</span></div>`).join('')) || '<div class="muted">なし</div>'}
        </details>
      </div>
    `;
  }).join('');
  return `
    <h2 class="screen-title">計画</h2>
    <div class="section">
      <h2>4メニュー順番ローテ</h2>
      <div class="row between">
        <div>
          <div class="sec-label">現在の次回</div>
          <div class="value-big">${state.isRestSelected ? '休み' : fourMenuLabel(state.nextMenuKey)}</div>
        </div>
        <button class="btn-secondary btn-small" id="btnSetFourMenuRest">休みにする</button>
      </div>
      <div class="muted mt-8" style="font-size:12px;">肩・腕 → 脚 → 胸 → 背中 の順に進みます</div>
    </div>
    <div class="section">
      <h2>メニュー一覧</h2>
      ${rows}
    </div>
  `;
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
      navigate('today');
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
      const rpeValue = parseRpeValue(l.rpe);
      if (rpeValue != null && rpeValue >= 9) highRPE = true;
      if (hasLogPain(l)) painFlag = true;
    });

    let delta = 0;
    let reason = '';

    if (painFlag) {
      delta = 0;
      reason = '痛みあり → 据え置き';
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
let logFilter = { type: 'daily', maxLift: 'bench', emaxLift: 'bench', month: null, selDate: null };

function renderLog() {
  const tabs = `
    <div class="tabs">
      <button class="tab ${logFilter.type === 'daily' ? 'active' : ''}" data-type="daily">日別</button>
      <button class="tab ${logFilter.type === 'monthly' ? 'active' : ''}" data-type="monthly">月別</button>
      <button class="tab ${logFilter.type === 'max' ? 'active' : ''}" data-type="max">MAX</button>
      <button class="tab ${logFilter.type === 'emax' ? 'active' : ''}" data-type="emax">推定MAX</button>
    </div>
  `;

  const body = logFilter.type === 'monthly'
    ? renderMonthlyLogView()
    : logFilter.type === 'max'
      ? renderMaxLogTab()
      : logFilter.type === 'emax'
        ? renderEmaxLogTab()
        : renderDailyLogView();

  return `
    <h2 class="screen-title">ログ</h2>
    ${tabs}
    ${body}
    <div class="section">
      <h2>データ管理</h2>
      <div class="btn-row">
        <button class="btn-secondary btn-small" id="btnExport">エクスポート(JSON)</button>
        <button class="btn-secondary btn-small" id="btnImport">インポート(JSON)</button>
      </div>
    </div>
  `;
}

// 種目切替セグメント（MAX/推定MAXタブ共通）
function liftSegHtml(selectedKey, dataAttr) {
  return `<div class="seg mb-12">${Object.values(BIG3_LIFTS).map(l => `
    <button class="seg-opt ${selectedKey === l.key ? 'on' : ''}" ${dataAttr}="${l.key}">${l.name.replace('プレス', '').replace('引きデッド', 'デッド')}</button>
  `).join('')}</div>`;
}

// MAXタブ: 1RM挑戦の履歴（実測のみ・推定とは別系統）
function renderMaxLogTab() {
  const liftKey = BIG3_LIFTS[logFilter.maxLift] ? logFilter.maxLift : 'bench';
  const tests = collectMaxTestRecords(liftKey);
  // MAX = 実際に成功した1RMの最高値（設定MAXや推定MAXとは別物）
  const best = bestMeasuredMaxForLift(liftKey);
  const latest = tests[0];
  const value = best ? `${fmtW(best.measuredMaxWeight)}<span class="u">kg</span>` : '—';
  const sub = best
    ? `${fmtDateShort(best.date)} 成功${best.adopted ? ' ・ 採用中' : ''}`
    : latest
      ? `挑戦 ${fmtW(latest.attemptedWeight ?? latest.weight)}kg ✗`
      : '1RM挑戦でここに記録されます';
  return `
    ${liftSegHtml(liftKey, 'data-max-lift')}
    <div class="card max-current gold">
      <div class="mc-label">MAX</div>
      <div class="max-current-val">${value}</div>
      <div class="mc-sub">${sub}</div>
    </div>
    <div class="card">
      <div class="sec-label">履歴</div>
      ${renderMaxTestHistory(12, liftKey)}
    </div>
  `;
}

// 推定MAXタブ: 計算値の履歴（MAXとは完全に別タブ）
function renderEmaxLogTab() {
  const liftKey = BIG3_LIFTS[logFilter.emaxLift] ? logFilter.emaxLift : 'bench';
  const entries = collectEstimatedMaxEntries(liftKey);
  // メイン表示は「条件に合う記録の中の最大推定値」（直近値ではない）
  const best = bestEstimatedMaxEntryForLift(liftKey);
  const currentCard = best
    ? `<div class="card max-current">
        <div class="mc-label">推定MAX</div>
        <div class="max-current-val">${fmtW(best.estimatedMax)}<span class="u">kg</span></div>
        <div class="mc-sub">${fmtDateShort(best.date)} ・ ${fmtW(best.sourceWeight)}×${best.sourceReps} @${best.rpe || '-'}</div>
      </div>`
    : '<div class="card flat"><div class="muted text-center">推定MAXの記録はまだありません</div></div>';
  const rows = entries.slice(0, 14).map(entry => {
    const kind = entry.adopted ? 'adopted' : (entry.maxUseKind || 'excluded');
    const chip = kind === 'adopted'
      ? '<span class="chip chip-adopted">採用済み</span>'
      : kind === 'candidate'
        ? '<span class="chip chip-outline">候補</span>'
        : kind === 'reference'
          ? '<span class="chip chip-pause">参考</span>'
          : '<span class="chip chip-pause">除外</span>';
    const candidate = !entry.adopted && !entry.derivedFromLog ? getMaxUpdateCandidate(entry) : null;
    return `
      <div class="hist-row ${kind === 'excluded' ? 'excluded' : ''}">
        <span class="h-date">${fmtDateShort(entry.date)}</span>
        <span class="h-val">${fmtW(entry.estimatedMax)}<span class="u">kg</span>
          <span class="h-src">${fmtW(entry.sourceWeight)}×${entry.sourceReps} @${entry.rpe || '-'}</span>
        </span>
        ${chip}
        ${candidate ? `<button class="btn-secondary btn-small" data-adopt-emax="${entry.id}">採用</button>` : ''}
      </div>
    `;
  }).join('');
  return `
    ${liftSegHtml(liftKey, 'data-emax-lift')}
    ${currentCard}
    <div class="card">
      <div class="sec-label">履歴</div>
      ${rows || '<div class="muted">履歴なし</div>'}
    </div>
  `;
}

function logsByDate() {
  const map = new Map();
  [...(store.logs || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0)).forEach(log => {
    const key = log.date || '日付なし';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(log);
  });
  return map;
}

function summarizeLogGroup(logs) {
  // 休止ログ・今日だけ削除ログは実施数に含めない（0/0で「完了」に見えるのを防ぐ）
  const trainingLogs = logs.filter(log => !log.isExerciseRest && !log.todayOnlyDeleted);
  const completed = trainingLogs.filter(log => (parseInt(log.doneSets, 10) || 0) >= (parseInt(log.plannedSets, 10) || 0));
  const restCount = logs.length - trainingLogs.length;
  const mainNames = (trainingLogs.length ? trainingLogs : logs).slice(0, 3).map(log => log.exerciseName).filter(Boolean).join(' / ') || '記録';
  const hasCandidate = trainingLogs.some(log => createEstimatedMaxEntry(log, 'log-preview')?.useForMaxUpdate);
  return { completedCount: completed.length, totalCount: trainingLogs.length, restCount, mainNames, hasCandidate };
}

// ログのベストセット表記「160.0×1」
function bestSetText(log) {
  const doneSets = (log.sets || []).filter(s => s.done && s.weight != null);
  if (!doneSets.length) return '';
  const best = doneSets.reduce((acc, s) => (parseFloat(s.weight) > parseFloat(acc.weight) ? s : acc), doneSets[0]);
  return `${fmtW(best.weight)}×${best.reps ?? '-'}`;
}

function renderLogDetail(logs) {
  return logs.map(log => {
    if (log.isExerciseRest || log.todayOnlyDeleted) {
      return `
        <div class="log-detail-row">
          <div class="row between">
            <span class="muted">${escapeHtml(log.exerciseName)}</span>
            <span class="chip chip-pause">${log.isExerciseRest ? '休止中' : '削除'}</span>
          </div>
        </div>
      `;
    }
    const emax = createEstimatedMaxEntry(log, 'log-preview');
    const maxAttempt = getTrueOneRmAttemptFromLog(log);
    const setRows = (log.sets || []).map((s, i) => renderStaticSetRow(s, i)).join('') || '<div class="muted">-</div>';
    return `
      <div class="log-detail-row">
        <div class="row between">
          <strong>${log.exerciseName}</strong>
          ${exerciseRoleChipHtml(log)}
        </div>
        ${setRows}
        <div class="muted">@${log.rpe && log.rpe !== '未入力' ? log.rpe : '-'}${(log.pains || []).filter(p => p !== 'なし').length ? ` ・ ${(log.pains || []).filter(p => p !== 'なし').join('・')}` : ''}</div>
        ${maxAttempt ? `<div class="row" style="gap:6px;"><span class="chip ${maxAttempt.challengeSucceeded ? 'chip-max' : 'chip-pause'}">${maxAttempt.challengeSucceeded ? '実測MAX' : 'MAX挑戦'}</span><span class="muted">${maxAttempt.challengeSucceeded ? `${fmtW(maxAttempt.measuredMaxWeight)}kg ✓成功` : `${fmtW(maxAttempt.attemptedWeight)}kg ✗失敗`}</span></div>` : ''}
        ${emax ? `<div class="row" style="gap:6px;"><span class="chip chip-outline">推定 ${fmtW(emax.estimatedMax)}</span><span class="muted">${emax.maxUseLabel} ・ ${emax.maxUseReason}</span></div>` : ''}
        ${log.note ? `<div class="muted">メモ: ${escapeHtml(log.note)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function logGroupHeaderMeta(first = {}) {
  if (first.fourMenuRotation) {
    const name = first.splitName || first.menuName || fourMenuLabel(first.performedSplitKey || first.selectedSplitKey || first.menuKey);
    return `<span class="muted">${escapeHtml(name)}</span>`;
  }
  return `<span class="muted">B${first.block || '-'} / R${first.rotation || '-'} / Day${first.day || '-'}</span>`;
}

function renderDailyLogView(logMap = logsByDate()) {
  if (logMap.size === 0) return '<div class="card flat"><div class="muted text-center">記録がありません</div></div>';
  return `<div class="log-card-list">${[...logMap.entries()].map(([date, logs], cardIdx) => {
    const first = logs[0] || {};
    const summary = summarizeLogGroup(logs);
    const summaryRows = logs.slice(0, 4).map(log => {
      if (log.isExerciseRest || log.todayOnlyDeleted) return '';
      const best = bestSetText(log);
      return `<span class="muted" style="font-size:12px;">${log.exerciseName}${best ? ` ${best}` : ''}</span>`;
    }).filter(Boolean).join(' ・ ');
    return `
      <details class="section ui-details log-card" ${cardIdx === 0 ? 'open' : ''}>
        <summary>
          <span>
            <span class="log-card-title">${fmtDateShort(date)} ${logGroupHeaderMeta(first)}</span>
            <span class="muted" style="display:block;font-size:12px;">${summaryRows || summary.mainNames}</span>
          </span>
          <span class="status-pill ${summary.hasCandidate ? 'status-caution' : 'status-ok'}">${summary.hasCandidate ? 'MAX候補' : `${summary.completedCount}/${summary.totalCount}`}</span>${summary.restCount ? `<span class="chip chip-pause">休止${summary.restCount}</span>` : ''}
        </summary>
        ${renderLogDetail(logs)}
      </details>
    `;
  }).join('')}</div>`;
}

// 月別: カレンダー（トレ日=青 / MAX測定日=金 / 今日=金枠）
function renderMonthlyLogView() {
  const dateMap = logsByDate();
  const dates = [...dateMap.keys()].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const fallbackMonth = dates.length ? dates[dates.length - 1].slice(0, 7) : todayStr().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(logFilter.month || '') ? logFilter.month : fallbackMonth;
  logFilter.month = month; // 月送り操作の基準を常に保持する
  const [y, m] = month.split('-').map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = todayStr();

  const dayInfo = (dateStr) => {
    const logs = dateMap.get(dateStr) || [];
    const training = logs.filter(log => !log.isExerciseRest && !log.todayOnlyDeleted);
    return {
      trained: training.length > 0,
      maxTested: training.some(log => isMaxTestMenu(log.menuType)),
      logs: training,
    };
  };

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += '<button class="cal-cell empty" tabindex="-1"></button>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const info = dayInfo(dateStr);
    const cls = [
      info.maxTested ? 'cal-max' : (info.trained ? 'cal-tr' : ''),
      dateStr === today ? 'cal-today' : '',
      logFilter.selDate === dateStr ? 'sel' : '',
    ].filter(Boolean).join(' ');
    cells += `<button class="cal-cell ${cls}" data-cal-date="${dateStr}">${d}</button>`;
  }

  const monthDates = dates.filter(d => d.startsWith(month));
  const trainedDays = monthDates.filter(d => dayInfo(d).trained);
  const maxDays = monthDates.filter(d => dayInfo(d).maxTested);
  const rotations = [...new Set(
    monthDates.flatMap(d => (dateMap.get(d) || []).filter(log => !log.isExerciseRest && !log.todayOnlyDeleted).map(log => log.rotation)).filter(r => r != null)
  )].sort((a, b) => a - b);

  const selInfo = logFilter.selDate && logFilter.selDate.startsWith(month) ? dayInfo(logFilter.selDate) : null;
  const selFirst = selInfo?.logs[0];
  const selLine = selInfo && selInfo.logs.length
    ? `<div class="muted mt-8">${fmtDateShort(logFilter.selDate)} ・ ${selFirst.fourMenuRotation ? escapeHtml(selFirst.splitName || selFirst.menuName || fourMenuLabel(selFirst.performedSplitKey || selFirst.selectedSplitKey || selFirst.menuKey)) : `B${selFirst.block || '-'} / R${selFirst.rotation || '-'} / Day${selFirst.day || '-'}`} ・ ${[...new Set(selInfo.logs.map(log => log.exerciseName))].slice(0, 4).join('、')}</div>`
    : (logFilter.selDate && logFilter.selDate.startsWith(month) ? '<div class="muted mt-8">記録なし</div>' : '');

  return `
    <div class="card">
      <div class="cal-head">
        <button data-month-nav="-1" aria-label="前の月">‹</button>
        <span class="cal-title">${y}年${m}月</span>
        <button data-month-nav="1" aria-label="次の月">›</button>
      </div>
      <div class="cal-grid">
        ${['日', '月', '火', '水', '木', '金', '土'].map(d => `<span class="cal-dow">${d}</span>`).join('')}
        ${cells}
      </div>
      <div class="cal-legend">
        <span><span class="dot" style="background:var(--accent);"></span>トレ</span>
        <span><span class="dot" style="background:var(--max);"></span>MAX測定</span>
      </div>
      ${selLine}
    </div>
    <div class="card cal-summary-card">
      <div class="cal-summary">
        <div class="cs-item"><div class="cs-val">${trainedDays.length}</div><div class="cs-label">トレ日</div></div>
        <div class="cs-item"><div class="cs-val">${maxDays.length}</div><div class="cs-label">MAX測定</div></div>
        <div class="cs-item"><div class="cs-val">${rotations.length ? rotations.map(r => `R${r}`).join('・') : '-'}</div><div class="cs-label">ローテ</div></div>
      </div>
    </div>
  `;
}

function renderSimpleGraph(logs, key) {
  const points = logs.filter(l => l.exerciseKey === key)
    .sort((a, b) => a.ts - b.ts)
    .map(l => {
      const estimated = bestEstimatedMaxFromLog(l);
      const e1 = estimated?.value || 0;
      return { date: l.date, e1, w: Math.max(...l.sets.filter(s => s.done).map(s => s.weight), 0) };
    }).filter(p => p.e1 > 0);
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
        <polyline fill="none" stroke="#4f6ef7" stroke-width="2" points="${polyPts}" />
        ${points.map((p, i) => {
          const x = pad + i * xStep;
          const y = h - pad - ((p.e1 - minV) / range) * (h - pad * 2);
          return `<circle cx="${x}" cy="${y}" r="3" fill="#3d5ceb" />`;
        }).join('')}
        <text x="${pad}" y="14" fill="#6b7280" font-size="10">${Math.round(maxV)}kg</text>
        <text x="${pad}" y="${h - 4}" fill="#6b7280" font-size="10">${Math.round(minV)}kg</text>
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
  document.querySelectorAll('[data-max-lift]').forEach(b => {
    b.onclick = () => {
      logFilter.maxLift = b.dataset.maxLift;
      render();
    };
  });
  document.querySelectorAll('[data-emax-lift]').forEach(b => {
    b.onclick = () => {
      logFilter.emaxLift = b.dataset.emaxLift;
      render();
    };
  });
  document.querySelectorAll('button[data-month-nav]').forEach(b => {
    b.onclick = () => {
      const base = /^\d{4}-\d{2}$/.test(logFilter.month || '') ? logFilter.month : todayStr().slice(0, 7);
      const [y, m] = base.split('-').map(Number);
      const next = new Date(y, (m - 1) + (parseInt(b.dataset.monthNav, 10) || 0), 1);
      logFilter.month = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
      logFilter.selDate = null;
      render();
    };
  });
  document.querySelectorAll('button[data-cal-date]').forEach(b => {
    b.onclick = () => {
      logFilter.selDate = logFilter.selDate === b.dataset.calDate ? null : b.dataset.calDate;
      render();
    };
  });
  document.getElementById('btnExport').onclick = exportData;
  document.getElementById('btnImport').onclick = importData;
  bindEstimatedMaxActions();
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
        const def = defaultStore();
        store = {
          ...def,
          ...data,
          settings: {
            ...def.settings,
            ...(data.settings || {}),
            programMode: 'fourMenu',
            maxes: { ...def.settings.maxes, ...(data.settings?.maxes || {}) },
            rotationIncreaseCaps: { ...def.settings.rotationIncreaseCaps, ...(data.settings?.rotationIncreaseCaps || {}) },
            r4AdjustmentModes: { ...def.settings.r4AdjustmentModes, ...(data.settings?.r4AdjustmentModes || {}) },
            mainSetOverrides: { ...def.settings.mainSetOverrides, ...(data.settings?.mainSetOverrides || {}) },
            accessoryDefaults: { ...def.settings.accessoryDefaults, ...(data.settings?.accessoryDefaults || {}) },
            accessorySlots: mergeAccessorySlots(data.settings?.accessorySlots, true, true),
            exerciseRestSettings: Array.isArray(data.settings?.exerciseRestSettings) ? data.settings.exerciseRestSettings : [],
          },
          currentState: {
            ...def.currentState,
            ...(data.currentState || {}),
            nextMenuKey: normalizeFourMenuKey(data.currentState?.nextMenuKey || data.currentState?.selectedSplitKey || def.currentState.nextMenuKey),
            isRestSelected: !!data.currentState?.isRestSelected,
            backCompletedCount: parseInt(data.currentState?.backCompletedCount, 10) || 0,
          },
        };
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
function summarizeMajorAccessoryLoad(settings = store.settings) {
  const groups = {
    chest: { label: '胸', sets: 0 },
    back: { label: '背中', sets: 0 },
    shoulder: { label: '肩', sets: 0 },
    arm: { label: '腕', sets: 0 },
    leg: { label: '脚', sets: 0 },
  };
  const matches = {
    chest: ['胸', 'ベンチ系プレス'],
    back: ['背中', 'ロウ系', 'チンニング系'],
    shoulder: ['肩', '横肩', '後ろ肩', '肩補助', '肩プレス系'],
    arm: ['腕'],
    leg: ['脚前側', '脚後側', '脚補助', 'カーフ', 'デッド・腰背部負荷'],
  };
  if (isFourMenuMode(settings)) {
    FOUR_MENU_ORDER.forEach(menuKey => {
      (FOUR_MENU_ACCESSORY_SLOTS[menuKey] || []).forEach(slot => {
        const ex = fourMenuAccessoryExerciseFromSlot(menuKey, slot);
        const sets = parseInt(ex.plannedSets, 10) || 0;
        Object.entries(matches).forEach(([key, cats]) => {
          if ((ex.categories || []).some(c => cats.includes(c))) groups[key].sets += sets;
        });
      });
    });
    return groups;
  }
  [1,2,3,4,5,6,7,8].forEach(day => {
    const isDeload = false;
    buildAccessoryExercises(day, settings, isDeload).forEach(ex => {
      const sets = parseInt(ex.plannedSets, 10) || 0;
      Object.entries(matches).forEach(([key, cats]) => {
        if ((ex.categories || []).some(c => cats.includes(c))) groups[key].sets += sets;
      });
    });
  });
  return groups;
}

function getMajorLoadStatus(key, sets, warnings = []) {
  const hasWarning = (pattern) => warnings.some(w => pattern.test(w.message));
  if (key === 'chest') {
    if (sets >= 30) return { label: '高め', className: 'status-danger' };
    if (sets >= 25) return { label: '注意', className: 'status-caution' };
  }
  if (key === 'back') {
    if (sets < 10 || hasWarning(/背中少なめ/)) return { label: '少なめ', className: 'status-low' };
    if (sets >= 28) return { label: '高め', className: 'status-danger' };
    if (sets >= 22) return { label: '注意', className: 'status-caution' };
  }
  if (key === 'shoulder') {
    if (hasWarning(/肩補助不足|横肩不足|後ろ肩不足/)) return { label: '少なめ', className: 'status-low' };
    if (sets >= 18 || hasWarning(/肩負荷多め/)) return { label: '注意', className: 'status-caution' };
  }
  if (key === 'arm') {
    if (sets === 0 || hasWarning(/腕補助不足/)) return { label: '少なめ', className: 'status-low' };
    if (sets >= 18) return { label: '高め', className: 'status-danger' };
    if (sets >= 14) return { label: '注意', className: 'status-caution' };
  }
  if (key === 'leg') {
    if (sets === 0 || hasWarning(/脚補助不足/)) return { label: '少なめ', className: 'status-low' };
    if (sets >= 24) return { label: '高め', className: 'status-danger' };
    if (sets >= 18) return { label: '注意', className: 'status-caution' };
  }
  return { label: '適正', className: 'status-ok' };
}

function renderAccessoryLoadCheck(context = 'full') {
  const summary = summarizeAccessoryLoad(store.settings);
  const majorSummary = summarizeMajorAccessoryLoad(store.settings);
  const warnings = getAccessoryLoadWarnings(store.settings);
  const getLoadStatus = (key, value) => {
    const limit = ACCESSORY_LOAD_LIMITS[key];
    if (limit) {
      if (value >= limit.danger) return { label: '危険', className: 'status-danger' };
      if (value >= limit.caution) return { label: '注意', className: 'status-caution' };
    }
    if (key === '背中' && value < 10) return { label: '不足', className: 'status-low' };
    return { label: '適正', className: 'status-ok' };
  };
  const majorRows = Object.entries(majorSummary).map(([key, group]) => {
    const status = getMajorLoadStatus(key, group.sets, warnings);
    return { key, ...group, status };
  });
  const attentionRows = majorRows.filter(row => row.status.label !== '適正');
  const conclusion = `
    <div class="load-summary">
      ${majorRows.map(row => `
        <div class="major-load-card">
          <div class="name">${row.label}</div>
          <div class="muted">${row.sets}セット</div>
          <span class="status-pill ${row.status.className}">${row.status.label}</span>
        </div>
      `).join('')}
    </div>
  `;
  const rows = ACCESSORY_SUMMARY_KEYS.map(k => `
    <div class="suggestion-row load-metric-row">
      <div class="name">${k}</div>
      <div class="delta">${summary[k] || 0}セット</div>
      <div class="status-pill ${getLoadStatus(k, summary[k] || 0).className}">${getLoadStatus(k, summary[k] || 0).label}</div>
    </div>
  `).join('');
  const warnHtml = warnings.length === 0
    ? '<div class="muted">大きな警告なし</div>'
    : attentionRows.length
      ? attentionRows.map(row => `<div class="load-warning ${row.status.className === 'status-danger' ? 'load-warning-danger' : 'load-warning-caution'}"><span>${row.status.label}</span>${row.label}: ${row.status.label}</div>`).join('')
      : warnings.slice(0, 3).map(w => `<div class="load-warning ${w.level === 'danger' ? 'load-warning-danger' : 'load-warning-caution'}"><span>${w.level === 'danger' ? '危険' : '注意'}</span>${w.message}</div>`).join('');
  const body = `
    <div class="muted" style="font-size:12px;margin-bottom:8px;">胸・背中・肩・腕・脚</div>
    ${conclusion}
    <div class="mt-8">${warnHtml}</div>
    <details class="ui-details">
      <summary>詳細数値</summary>
      <div class="muted" style="font-size:12px;margin-bottom:8px;">細かいカテゴリ・疲労タグ</div>
      ${rows}
      <div class="mt-8">${warnings.length ? warnings.map(w => `<div class="load-warning ${w.level === 'danger' ? 'load-warning-danger' : 'load-warning-caution'}"><span>${w.level === 'danger' ? '危険' : '注意'}</span>${w.message}</div>`).join('') : '<div class="muted">詳細警告なし</div>'}</div>
    </details>
  `;
  if (context === 'settings') {
    return `
      <details class="section load-check-section ui-details">
        <summary><h2>負荷チェック</h2></summary>
        ${body}
      </details>
    `;
  }
  return `
    <div class="section load-check-section">
      <h2>負荷チェック</h2>
      ${body}
    </div>
  `;
}

function renderAccessorySlotEditor(context = 'settings') {
  const slots = store.settings.accessorySlots || defaultAccessorySlots();
  const selectedDay = accessoryEditorOpenDay || String(store.currentState.day);
  const dayLabels = {
    1: 'Day1: 脚前側補助 / カーフ',
    2: 'Day2: 胸補助 / 背中 / 腕',
    3: 'Day3: 肩（前肩・横肩） / 背中 / カーフ',
    4: 'Day4: 休息日',
    5: 'Day5: 脚前側補助 / カーフ',
    6: 'Day6: 胸・三頭補助 / 背中 / リアデルト系 / 腕',
    7: 'Day7: 背中 / チンニング / カーフ',
    8: 'Day8: 休息日',
  };
  const heading = context === 'block' ? '補助種目管理' : '補助種目編集';
  const intro = context === 'block'
    ? 'Day別に補助種目を管理'
    : '今後の基本プログラムを編集';
  const body = `
    <div class="muted" style="font-size:12px;margin-bottom:8px;">${intro}</div>
    ${selectedDay !== String(store.currentState.day) ? `<button class="btn-secondary btn-small mb-8" data-current-accessory-day="1">現在Dayへ戻る</button>` : ''}
    <details class="ui-details compact-details">
      <summary>候補を確認</summary>
      <div class="muted" style="font-size:12px;margin-bottom:8px;">カテゴリ: ${ACCESSORY_CATEGORIES.join('、')}</div>
      <div class="muted" style="font-size:12px;margin-bottom:8px;">疲労タグ: ${ACCESSORY_FATIGUE_TAGS.join('、')}</div>
    </details>
    ${Object.keys(dayLabels).map(day => `
      <details class="subsection ui-details accessory-day-details" data-accessory-day="${day}" ${day === selectedDay ? 'open' : ''}>
        <summary>
          <span>${dayLabels[day]}</span>
          <span class="status-pill status-ok">${(slots[day] || []).length}種目</span>
        </summary>
        <div class="row between" style="align-items:center;gap:8px;margin-bottom:8px;">
          <span class="muted" style="font-size:12px;">Day${day}</span>
          <button class="btn-ghost btn-small" data-reset-slot-day="${day}">初期おすすめに戻す</button>
        </div>
        ${(slots[day] || []).length === 0 ? '<div class="muted mb-8" style="font-size:12px;">補助種目なし</div>' : ''}
        ${(slots[day] || []).map((slot, idx, list) => `
          <div class="suggestion-row" style="align-items:flex-start;">
            <div class="name">
              <div class="strong">${slot.slotName}: ${slot.name}</div>
              <div class="muted" style="font-size:12px;">${slot.setsText || slot.plannedSets}セット / ${slot.reps}回 / 目標RPE${slot.targetRpe}</div>
              <details class="ui-details compact-details">
                <summary>詳細</summary>
                <div class="accessory-meta" style="margin:6px 0 0;">
                  ${(slot.categories || []).slice(0, 3).map(c => `<span class="accessory-chip">${c}</span>`).join('')}
                  ${(slot.fatigueTags || []).slice(0, 2).map(t => `<span class="accessory-chip accessory-chip-fatigue">${t}</span>`).join('')}
                </div>
              </details>
            </div>
            <button class="btn-ghost btn-small" data-move-slot-day="${day}" data-move-slot-id="${slot.slotId}" data-move-dir="-1" ${idx === 0 ? 'disabled style="opacity:0.45;"' : ''}>上へ</button>
            <button class="btn-ghost btn-small" data-move-slot-day="${day}" data-move-slot-id="${slot.slotId}" data-move-dir="1" ${idx === list.length - 1 ? 'disabled style="opacity:0.45;"' : ''}>下へ</button>
            <button class="btn-secondary btn-small" data-edit-slot-day="${day}" data-edit-slot-id="${slot.slotId}">編集</button>
            <button class="btn-danger btn-small" data-delete-slot-day="${day}" data-delete-slot-id="${slot.slotId}">削除</button>
          </div>
        `).join('')}
        <button class="btn-secondary btn-small" data-add-slot-day="${day}">＋補助種目を追加</button>
      </details>
    `).join('')}
  `;
  if (context === 'settings') {
    return `
      <details class="section ui-details">
        <summary><h2>${heading}</h2></summary>
        ${body}
      </details>
    `;
  }
  return `
    <div class="section">
      <h2>${heading}</h2>
      ${body}
    </div>
  `;
}

function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// 休止期間の表示「6/2 – 6/16」（未定なら「6/2 – 未定」）
function restPeriodText(rest) {
  const openEnded = !rest.endDate || rest.endDate >= '2099-01-01';
  return `${fmtDateShort(rest.startDate)} – ${openEnded ? '未定' : fmtDateShort(rest.endDate)}`;
}

function renderExerciseRestSettings() {
  const rests = (store.settings.exerciseRestSettings || []).map(normalizeExerciseRestSetting).filter(Boolean);
  const today = todayStr();
  const listHtml = rests.length
    ? rests.map(rest => {
        const active = !rest.ended && rest.startDate <= today && today <= rest.endDate;
        const target = (rest.parts || []).concat(rest.exercises || []).join('・') || rest.name;
        const chip = active
          ? '<span class="chip chip-pause">休止中</span>'
          : rest.ended
            ? '<span class="chip chip-outline">終了</span>'
            : '<span class="chip chip-outline">予定</span>';
        return `
          <div class="card" style="margin-bottom:8px;">
            <div class="row between">
              <span style="font-size:17px;font-weight:700;">${escapeHtml(target)}</span>
              ${chip}
            </div>
            <div class="muted mt-8">${restPeriodText(rest)}</div>
            ${rest.note ? `<div class="muted" style="font-size:12px;">${escapeHtml(rest.note)}</div>` : ''}
            <div class="btn-pair mt-8">
              <button class="btn-sec btn-small" data-edit-exercise-rest="${rest.id}">編集</button>
              <button class="btn-sec btn-small" data-end-exercise-rest="${rest.id}" ${rest.ended ? 'disabled style="opacity:0.45;"' : ''}>終了</button>
              <button class="btn-ghost btn-small" data-delete-exercise-rest="${rest.id}">削除</button>
            </div>
          </div>
        `;
      }).join('')
    : '<div class="card flat"><div class="muted text-center">休止なし</div></div>';
  return `
    <div class="section exercise-rest-section">
      <h2>休止設定</h2>
      ${listHtml}
      <button class="btn-primary mt-8" id="btnAddExerciseRest">追加</button>
    </div>
  `;
}

// 既存休止設定の更新（削除して作り直さなくて済むように）
function updateExerciseRestSetting(id, patch = {}) {
  const list = store.settings.exerciseRestSettings || [];
  const idx = list.findIndex(rest => rest.id === id);
  if (idx < 0) return null;
  const merged = normalizeExerciseRestSetting({ ...normalizeExerciseRestSetting(list[idx]), ...patch, id });
  if (!merged) return null;
  store.settings.exerciseRestSettings = [...list.slice(0, idx), merged, ...list.slice(idx + 1)];
  return merged;
}

// 休止の追加/編集ボトムシート（対象チップ / 期間セグ / メモ の3項目のみ）
// editId 指定時は既存設定を読み込み、保存で同じIDを更新する
function openExerciseRestSheet(editId = null) {
  const targets = [...EXERCISE_REST_PARTS, 'ベンチプレス', 'スクワット', 'デッド'];
  const periods = [
    { key: '1w', label: '1週', days: 6 },
    { key: '2w', label: '2週', days: 13 },
    { key: '1m', label: '1ヶ月', days: 29 },
    { key: 'open', label: '未定', days: null },
  ];
  const editing = editId
    ? (store.settings.exerciseRestSettings || []).map(normalizeExerciseRestSetting).find(rest => rest && rest.id === editId)
    : null;
  const initialTargets = editing ? [...(editing.parts || []), ...(editing.exercises || [])] : [];
  const initialPeriod = (() => {
    if (!editing) return '2w';
    if (!editing.endDate || editing.endDate >= '2099-01-01') return 'open';
    const span = dateDiffDays(editing.startDate, editing.endDate);
    const match = periods.find(p => p.days === span);
    return match ? match.key : 'keep';
  })();
  const state = { targets: new Set(initialTargets), period: initialPeriod };
  openModal(editing ? '休止を編集' : '休止を追加', `
    <div class="sec-label">対象</div>
    <div class="sheet-chips">
      ${targets.map(t => `<span class="chip chip-tap ${state.targets.has(t) ? 'on-pause' : ''}" data-rest-target="${t}">${t}</span>`).join('')}
    </div>
    <div class="sec-label">期間${editing ? `（現在 ${restPeriodText(editing)}）` : ''}</div>
    <div class="seg mb-12">
      ${periods.map(p => `<button class="seg-opt ${state.period === p.key ? 'on-pause' : ''}" data-rest-period="${p.key}">${p.label}</button>`).join('')}
    </div>
    <label class="field"><span>メモ（任意）</span><input type="text" id="exercise-rest-note" value="${editing ? escapeHtml(editing.note || '') : ''}" placeholder="例: 肩の違和感" /></label>
    <div class="card flat" id="restSheetPreview" style="display:${state.targets.size ? '' : 'none'};">
      <div class="sec-label">今日画面では</div>
      <div class="next-row pause-row">
        <span class="nx-name" id="restSheetPreviewName">${escapeHtml(initialTargets.join('・'))}</span>
        <span class="chip chip-pause">休止中</span>
      </div>
    </div>
    <button class="btn-primary mt-8" id="btnConfirmExerciseRest" ${state.targets.size ? '' : 'style="opacity:0.4;" disabled'}>${editing ? '保存' : '追加'}</button>
    <button class="btn-text btn-block" id="btnCancelExerciseRest">キャンセル</button>
  `, () => {
    const refresh = () => {
      const confirmBtn = document.getElementById('btnConfirmExerciseRest');
      const preview = document.getElementById('restSheetPreview');
      const previewName = document.getElementById('restSheetPreviewName');
      const has = state.targets.size > 0;
      if (confirmBtn) {
        confirmBtn.disabled = !has;
        if (confirmBtn.style) confirmBtn.style.opacity = has ? '1' : '0.4';
      }
      if (preview?.style) preview.style.display = has ? '' : 'none';
      if (previewName) previewName.textContent = [...state.targets].join('・');
    };
    document.querySelectorAll('[data-rest-target]').forEach(chip => {
      chip.onclick = () => {
        const value = chip.dataset.restTarget;
        if (state.targets.has(value)) {
          state.targets.delete(value);
          chip.classList.remove('on-pause');
        } else {
          state.targets.add(value);
          chip.classList.add('on-pause');
        }
        refresh();
      };
    });
    document.querySelectorAll('button[data-rest-period]').forEach(btn => {
      btn.onclick = () => {
        state.period = btn.dataset.restPeriod;
        document.querySelectorAll('button[data-rest-period]').forEach(other => {
          other.classList.toggle('on-pause', other === btn);
        });
      };
    });
    const cancelBtn = document.getElementById('btnCancelExerciseRest');
    if (cancelBtn) cancelBtn.onclick = closeModal;
    const confirmBtn = document.getElementById('btnConfirmExerciseRest');
    if (confirmBtn) confirmBtn.onclick = () => {
      if (state.targets.size === 0) {
        showToast('対象を選択してください');
        return;
      }
      const selected = [...state.targets];
      const parts = selected.filter(t => EXERCISE_REST_PARTS.includes(t));
      const exercises = selected.filter(t => !EXERCISE_REST_PARTS.includes(t));
      const note = document.getElementById('exercise-rest-note')?.value || '';
      const period = periods.find(p => p.key === state.period) || null;

      if (editing) {
        const startDate = editing.startDate;
        const endDate = !period
          ? editing.endDate // 期間未変更（カスタム期間はそのまま）
          : period.days == null ? '2099-12-31' : addDaysStr(startDate, period.days);
        const updated = updateExerciseRestSetting(editing.id, {
          name: selected.join('・'),
          parts,
          exercises,
          startDate,
          endDate,
          note,
        });
        if (!updated) return;
        saveStore();
        recalculateTodaySession();
        closeModal();
        render();
        showToast('休止を更新しました');
        return;
      }

      const today = todayStr();
      const effective = period || periods[1];
      const setting = normalizeExerciseRestSetting({
        id: `rest_${uid()}`,
        name: selected.join('・'),
        parts,
        exercises,
        startDate: today,
        endDate: effective.days == null ? '2099-12-31' : addDaysStr(today, effective.days),
        note,
      });
      if (!setting) return;
      store.settings.exerciseRestSettings = [...(store.settings.exerciseRestSettings || []), setting];
      saveStore();
      recalculateTodaySession();
      closeModal();
      render();
      showToast('休止を追加しました');
    };
  });
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
  const accKeys = ['incline_db','dips','shoulder','side_raise','rear_delt_fly','face_pull','lying_ext','preacher','legpress','hack_squat','calf','latpulldown','machine_row','seated_row','pec_fly','rear_raise'];
  const accEditHtml = accKeys.map(k => {
    const def = accDefaults[k] || {};
    const dispName = ACCESSORY_DISPLAY_NAMES[k] || k;
    const noteHtml = def.note ? `<span class="muted" style="font-size:11px;"> ${def.note}</span>` : '';
    return `
      <div class="acc-edit-row">
        <div style="font-size:13px;">${dispName}${noteHtml}</div>
        <input type="number" step="0.5" data-acc-key="${k}" data-acc-field="weight" value="${def.weight ?? ''}" placeholder="重量" />
        <input type="text" data-acc-key="${k}" data-acc-field="reps" value="${def.reps ?? ''}" placeholder="回数" />
        <input type="number" min="1" data-acc-key="${k}" data-acc-field="sets" value="${def.sets ?? ''}" placeholder="セット" />
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
      <label class="field"><span>ショルダープレスMAX (kg)</span><input type="number" step="0.5" id="set-shoulderPress" value="${m.shoulderPress ?? 77.5}" /></label>
      <label class="field"><span>重量刻み (kg)</span><input type="number" step="0.5" id="set-inc" value="${store.settings.increment}" /></label>
      <details class="ui-details compact-details">
        <summary>補足</summary>
        <div class="muted" style="font-size:12px;">床引きデッドは補助扱いのため、高強度モードでも強化対象外です。</div>
      </details>
    </div>

    <div class="section">
      <h2>強度モード</h2>
      <div class="volume-mode-group">
        <label class="volume-mode-option ${strengthMode === 'standard' ? 'active' : ''}">
          <input type="radio" name="strengthMode" value="standard" ${strengthMode === 'standard' ? 'checked' : ''} />
          <div>
            <div class="opt-title">標準モード</div>
            <div class="muted opt-desc">安全寄り</div>
          </div>
        </label>
        <label class="volume-mode-option ${strengthMode === 'highIntensity' ? 'active' : ''}">
          <input type="radio" name="strengthMode" value="highIntensity" ${strengthMode === 'highIntensity' ? 'checked' : ''} />
          <div>
            <div class="opt-title">高強度モード <span class="text-warn" style="font-size:11px;">(初期値)</span></div>
            <div class="muted opt-desc">メイン高強度</div>
          </div>
        </label>
      </div>
      <details class="ui-details compact-details mt-8">
        <summary>補足</summary>
        <div class="muted" style="font-size:12px;">
        ※ 4ローテ目（疲労抜き）は両モードとも同じ縮小ボリューム（モード切替の影響を受けません）。<br>
        ※ Day7床引きデッドはハーフデッド強化の補助・フォーム維持目的のため高強度モードでも変更されません。<br>
        ※ モード変更後、未実施の今後メニューに自動反映されます。<br>
        ※ 過去ログは書き換わりません。
        </div>
      </details>
    </div>

    <div class="section">
      <h2>トレーニングボリューム</h2>
      <div class="volume-mode-group">
        <label class="volume-mode-option ${volumeMode === 'standard' ? 'active' : ''}">
          <input type="radio" name="volumeMode" value="standard" ${volumeMode === 'standard' ? 'checked' : ''} />
          <div>
            <div class="opt-title">標準モード</div>
            <div class="muted opt-desc">回復優先</div>
          </div>
        </label>
        <label class="volume-mode-option ${volumeMode === 'high' ? 'active' : ''}">
          <input type="radio" name="volumeMode" value="high" ${volumeMode === 'high' ? 'checked' : ''} />
          <div>
            <div class="opt-title">高ボリュームモード <span class="text-warn" style="font-size:11px;">(推奨)</span></div>
            <div class="muted opt-desc">補助多め</div>
          </div>
        </label>
      </div>
      <details class="ui-details compact-details mt-8">
        <summary>補足</summary>
        <div class="muted" style="font-size:12px;">
        ※ 4ローテ目（疲労抜き）は両モードとも同じ縮小ボリュームです。<br>
        ※ モード変更後、未実施の今後メニューに自動反映されます。今日のメニューは「再計算」を押した時のみ更新されます（実施済みセットは保持）。<br>
        ※ 過去ログは書き換わりません。
        </div>
      </details>
    </div>

    <div class="section">
      <h2>補助管理モード</h2>
      <div class="volume-mode-group">
        ${Object.entries(ACCESSORY_MANAGEMENT_MODES).map(([value, label]) => `
          <label class="volume-mode-option ${accessoryMode === value ? 'active' : ''}">
            <input type="radio" name="accessoryMode" value="${value}" ${accessoryMode === value ? 'checked' : ''} />
            <div>
              <div class="opt-title">${label}</div>
              <div class="muted opt-desc">${value === 'aggressive' ? '初期値。軽い/適正/攻めすぎを短く表示します。' : value === 'fatigue' ? '疲労・痛みをやや強めに見ます。' : '標準的に提案します。'}</div>
            </div>
          </label>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <h2>デロード時MAX測定</h2>
      <div class="status-row"><span class="status-pill status-ok">1RM</span></div>
      <details class="ui-details compact-details">
        <summary>補足</summary>
        <div class="muted" style="font-size:12px;">R4では測定する/しないだけ選びます。</div>
      </details>
    </div>

    ${renderAccessorySlotEditor()}
    ${renderExerciseRestSettings()}
    ${renderAccessoryLoadCheck('settings')}

    <div class="section">
      <h2>補助種目の初期重量・回数・セット</h2>
      <details class="ui-details compact-details">
        <summary>補足</summary>
        <div class="muted" style="font-size:12px;margin-bottom:8px;">空欄は重量未設定として扱います。</div>
      </details>
      <div class="acc-edit-header">
        <div>種目</div><div>重量(kg)</div><div>回数</div><div>セット</div>
      </div>
      ${accEditHtml}
    </div>

    <div class="section">
      <h2>現在の進行</h2>
      ${isFourMenuMode() ? `
        <label class="field"><span>次回メニュー</span>
          <select id="set-next-menu">
            ${FOUR_MENU_ORDER.map(key => `<option value="${key}" ${normalizeFourMenuKey(s.nextMenuKey) === key ? 'selected' : ''}>${fourMenuLabel(key)}</option>`).join('')}
          </select>
        </label>
        <label class="check-row"><input type="checkbox" id="set-rest-selected" ${s.isRestSelected ? 'checked' : ''} /> 次回まで休み</label>
      ` : `
        <label class="field"><span>ブロック</span><input type="number" id="set-block" value="${s.block}" min="1" /></label>
        <label class="field"><span>ローテ (1-4)</span><input type="number" id="set-rotation" value="${s.rotation}" min="1" max="4" /></label>
        <label class="field"><span>Day (1-8)</span><input type="number" id="set-day" value="${s.day}" min="1" max="8" /></label>
      `}
    </div>

    <div class="section">
      <button class="btn-primary" id="btnSaveSettings">保存</button>
      <div class="btn-row mt-8">
        <button class="btn-warn" id="btnRecalcToday">今日のメニューを再計算</button>
        <button class="btn-danger" id="btnReset">初期値に戻す</button>
      </div>
      <details class="ui-details compact-details mt-8">
        <summary>補足</summary>
        <div class="muted" style="font-size:12px;">
        ※ MAX変更後、未実施の今後メニューは新MAXで自動計算されます。<br>
        ※ 過去ログは書き換えません。<br>
        ※ 今日のメニューは「再計算」を押した時のみ更新されます（実施済みセットは保持）。
        </div>
      </details>
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
      <details class="ui-details compact-details mt-8">
        <summary>詳細</summary>
        <div class="muted" style="font-size:12px;">
        ストレージキー: ${STORAGE_KEY}<br>
        バージョン: ${APP_VERSION}
        </div>
      </details>
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
      shoulderPress: parseFloat(document.getElementById('set-shoulderPress').value) || 77.5,
    };
    const newInc = parseFloat(document.getElementById('set-inc').value) || 2.5;
    const newState = isFourMenuMode()
      ? {
          nextMenuKey: normalizeFourMenuKey(document.getElementById('set-next-menu')?.value),
          isRestSelected: !!document.getElementById('set-rest-selected')?.checked,
        }
      : {
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
    const newDeloadMaxTestMode = 'trueOneRm';

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
    store.settings.deloadMaxTestMode = newDeloadMaxTestMode;
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

  bindAccessorySlotEditorActions();
  bindExerciseRestSettingsActions();

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
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => {
        // 起動ごとに更新チェック（PWAが古いJS/CSSを掴み続けるのを防ぐ）
        if (reg && typeof reg.update === 'function') reg.update().catch(() => {});
      })
      .catch(e => console.warn('SW reg failed', e));
    // 新しいSWに制御が切り替わったら一度だけ再読み込みして最新アセットを読む
    // （初回インストール時はリロードしない）
    if (typeof navigator.serviceWorker.addEventListener === 'function') {
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded || !hadController) return;
        reloaded = true;
        window.location.reload();
      });
    }
  }

  navigate('today');
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
    getAccessoryPreset,
    applyAccessoryPresetToSlot,
    accessoryPresetOptionsHtml,
    fillSlotFormFromPreset,
    normalizeBig3Key,
    estimateMaxFromSet,
    bestEstimatedMaxFromLog,
    classifyEstimatedMaxUse,
    createEstimatedMaxEntry,
    upsertEstimatedMaxFromLog,
    collectEstimatedMaxEntries,
    evaluateRotationProgression,
    upsertRotationProgressionFromLog,
    adoptRotationProgression,
    findPendingRotationProgressionForExercise,
    applyAcceptedRotationProgressionsToMenu,
    capBig3ProgressionToPrevious,
    capBig3ProgressionsToPrevious,
    getRotationIncreaseCap,
    getUnexpectedRestStats,
    getR4AdjustmentProposal,
    getSelectedR4AdjustmentMode,
    selectR4AdjustmentMode,
    getDeloadMaxTestLiftForDay,
    buildDeloadMaxTestExercises,
    buildRequiredR4MaxTestExercise,
    applyRequiredR4MaxTestSlot,
    buildR4NonTestExercise,
    recentEstimatedMaxBasis,
    r4IntensityLevelLabel,
    r4IntensityLevelDescription,
    applyDeloadMaxTestModeToSession,
    isIntensityMainMenu,
    isMaxTestMenu,
    isMaxTestBackoffMenu,
    getMaxUpdateCandidate,
    adoptEstimatedMax,
    recordMaxTestResult,
    getTrueOneRmAttemptFromLog,
    upsertMaxTestResultFromLog,
    normalizeExerciseRestSetting,
    getActiveExerciseRestSettings,
    exerciseMatchesRestSetting,
    applyExerciseRestSettingsToExercises,
    renderEstimatedMaxHistory,
    renderEstimatedMaxSummary,
    isExerciseComplete,
    firstPendingSetIndex,
    applyMainSetEdit,
    saveMainSetOverride,
    applyMainSetOverridesToMenu,
    toggleNextSetCompletion,
    skipNextSet,
    undoLastSetRecord,
    moveExerciseToActive,
    recalculateTodaySession,
    commitSetRecordDefaults,
    parseRangeMin,
    collectMaxTestRecords,
    bestMeasuredMaxForLift,
    bestEstimatedMaxEntryForLift,
    upsertExerciseLogFromSession,
    updateExerciseRestSetting,
    defaultAccessorySlots,
    buildAccessoryExercises,
    accessoryExerciseFromSlot,
    summarizeAccessoryLoad,
    summarizeMajorAccessoryLoad,
    getAccessoryLoadWarnings,
    getAccessorySafetyWarnings,
    suggestAccessoryProgression,
    addAccessorySlot,
    deleteAccessorySlot,
    updateAccessorySlot,
    resetAccessorySlotsForDay,
    moveAccessorySlot,
    renderAccessoryLoadCheck,
    renderSettings,
    renderToday,
    renderLog,
    renderDailyLogView,
    renderMonthlyLogView,
    renderMaxTestHistory,
    summarizeLogGroup,
    escapeHtml,
    renderBlock,
    finishTodaySession,
    nextDay,
    isFourMenuMode,
    buildFourMenu,
    selectFourMenuForToday,
    nextFourMenuKey,
    getFourMenuBackLiftKey,
    getFourMenuMainPlan,
    computeNextBlockSuggestion,
    getRestState: () => ({ ...restState }),
    getStore: () => store,
    setNowProvider: (fn) => { nowProvider = fn; },
  };
}
