// Isolated browser regression for the 2026-10-25 recording UX audit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { chromium } = require('playwright');

const artifacts = process.env.UI_ARTIFACT_DIR || path.join(os.tmpdir(), 'mll-recording-ux');
fs.mkdirSync(artifacts, { recursive: true });
const server = http.createServer((req, res) => {
  const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
  if (file.includes('..')) { res.writeHead(400); res.end(); return; }
  try {
    res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    const body = fs.readFileSync(path.join(__dirname, file));
    res.end(file === 'styles.css' ? body.toString().replaceAll('env(safe-area-inset-top)', 'var(--test-safe-top, 0px)').replaceAll('env(safe-area-inset-bottom)', 'var(--test-safe-bottom, 0px)') : body);
  } catch { res.writeHead(404); res.end(); }
});
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
async function selectMenu(page, key) {
  await page.locator('#hdOptions').click();
  await page.locator(`[data-four-menu-select="${key}"]`).click();
}

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.goto(process.env.UI_PUBLIC_URL || `http://127.0.0.1:${server.address().port}/`);
    const kg = () => page.getByLabel('セット重量 kg', { exact: true });
    const reps = () => page.getByLabel('セット回数', { exact: true });
    const record = () => page.locator('[data-action="completeSet"]');
    await page.evaluate(() => {
      const s = getOrCreateTodaySession();
      s.exercises[0].plannedWeight = 66.25;
      s.exercises[0].sets.forEach(set => { set.weight = 66.25; });
      persistTodaySession(s);
      render();
    });
    const identity = await page.evaluate(() => {
      const s = getOrCreateTodaySession({ persist: false });
      return { id: s.sessionId, date: s.workoutDate, next: store.currentState.nextMenuKey };
    });

    const start = Number(await kg().inputValue());
    await page.getByRole('button', { name: '重量を2.5kg増やす', exact: true }).click();
    check(Number(await kg().inputValue()) === start + 2.5, 'military press uses the requested 2.5kg step');
    await page.locator('details[data-ui-key^="exercise-"] > summary').click();
    await page.locator('[data-action="adjust"]').click();
    await page.locator('[data-adjust-quick="2.5"]').click();
    check(Number(await page.locator('#adj-weight').inputValue()) === start + 2.5, 'adjustment uses the same 2.5kg step');
    await page.locator('#adj-today').click();
    check(Number(await kg().inputValue()) === start + 2.5, 'adjustment saves the displayed value');

    await kg().fill('');
    await page.reload();
    check(await kg().inputValue() === '', 'explicitly cleared weight survives reload');
    check(await kg().getAttribute('aria-invalid') === 'true', 'cleared field is identified accessibly');
    await record().click();
    check(await page.evaluate(() => !getOrCreateTodaySession().exercises[0].sets[0].done && store.logs.length === 0), 'empty weight does not record a stale value');
    check(await page.locator('#set-input-error').isVisible(), 'invalid input has an inline explanation');
    await kg().fill('67.5');
    await reps().fill('4.5');
    await record().click();
    check(await page.evaluate(() => !getOrCreateTodaySession().exercises[0].sets[0].done), 'fractional reps are not truncated and recorded');
    await reps().fill('5');
    await page.getByRole('button', { name: 'RPE 9.5', exact: true }).click();
    check(!(await page.locator('#set-input-error').isVisible()), 'correcting input clears the error');
    await record().click();
    const first = await page.evaluate(() => getOrCreateTodaySession().exercises[0].sets[0]);
    check(first.done && first.weight === 67.5 && first.reps === 5 && String(first.rpe) === '9.5', 'valid direct entry completes in one tap with its RPE');
    check(!first.inputDraft, 'corrected drafts do not pollute the completed set');
    check(await page.evaluate(() => {
      const s = getOrCreateTodaySession();
      return s.sessionId;
    }) === identity.id, 'editing and reload retain session identity');
    check(await page.evaluate(() => getOrCreateTodaySession().workoutDate) === identity.date, 'editing and reload retain the workout date');

    // Older exercises have one RPE, and imported per-set records may use 6/6.5.
    await page.evaluate(() => {
      const s = getOrCreateTodaySession();
      s.exercises[0].rpe = '6.5';
      s.exercises[0].sets.forEach(set => delete set.rpe);
      persistTodaySession(s);
      openSetEditSheet(0);
    });
    check(await page.locator('[data-se-field="rpe"]').first().inputValue() === '6.5', 'legacy RPE is loaded into the editor');
    await page.locator('#btnSetEditSave').click();
    check(await page.evaluate(() => getOrCreateTodaySession().exercises[0].rpe) === '6.5', 'unchanged legacy RPE survives editor save');

    await page.locator('.nav-btn[data-screen="settings"]').click();
    await page.evaluate(() => { store.currentState.isRestSelected = true; saveStore(); });
    await page.locator('#set-bench').fill('130');
    await page.locator('#set-bench').blur();
    check(await page.evaluate(() => store.currentState.isRestSelected), 'MAX autosave preserves rest selection');
    await page.locator('#set-squat').fill('165');
    await page.locator('#set-squat').blur();
    check(await page.evaluate(() => store.currentState.isRestSelected), 'other MAX autosave preserves rest selection');
    await page.locator('#set-next-menu').selectOption('chest');
    check(await page.evaluate(() => !store.currentState.isRestSelected && store.currentState.nextMenuKey === 'chest'), 'deliberate next-menu change clears rest selection');
    await page.locator('.nav-btn[data-screen="today"]').click();
    await selectMenu(page, 'chest');
    const chestStart = Number(await kg().inputValue());
    await page.getByRole('button', { name: '重量を2.5kg増やす', exact: true }).click();
    check(Number(await kg().inputValue()) === chestStart + 2.5, 'bench uses the same 2.5kg step');
    await page.locator('details[data-ui-key^="exercise-"] > summary').click();
    await page.locator('[data-action="adjust"]').click();
    await page.locator('#adj-weight').fill('120');
    await page.locator('#adj-future').click();
    check(await page.evaluate(() => getFourMenuMainPlan('bench', 'chest').weight) === 120, 'future adjustment saves an absolute target');
    check(await page.evaluate(() => !store.manualAdjustments['Four-chest-bench-four-main-bench']), 'future adjustment leaves no accumulating delta');

    check(await page.evaluate(() => {
      const record = { plannedWeight: 95, rpe: '8', sets: [{ weight: 100, reps: 5, done: true }, { weight: 200, reps: 0, done: true, skipped: true }] };
      return previousSummaryEn({ log: record, days: 4 }).startsWith('Last 100.0 × 5');
    }), 'previous performance uses actual sets and excludes skipped sets');

    for (const menu of ['shoulder_arm', 'legs', 'back', 'custom', 'chest']) {
      await selectMenu(page, menu);
      check(await record().count() === 1, `${menu} retains its recording action`);
    }
    check(await page.evaluate(() => store.currentState.nextMenuKey) === 'chest', 'switching/custom selection does not advance the normal rotation');
    check(await page.evaluate(() => store.logs.length === 0), 'editing and menu switching do not create formal logs');

    const freeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const free = await freeContext.newPage();
    free.on('pageerror', e => errors.push(e.message));
    free.on('dialog', d => d.accept());
    await free.clock.install({ time: new Date('2026-10-25T18:00:00+09:00') });
    await free.goto(process.env.UI_PUBLIC_URL || `http://127.0.0.1:${server.address().port}/`);
    const protectedData = await free.evaluate(() => ({ maxes: JSON.stringify(store.settings.maxes), next: store.currentState.nextMenuKey }));
    await selectMenu(free, 'custom');
    await free.locator('#hdOptions').click();
    await free.locator('#startFreeCustom').click();
    check(await free.locator('.custom-empty').count() === 1, 'free custom can start with no predefined exercises');
    await free.locator('#btnAddTodayAccessory').click();
    await free.locator('[data-preset-group="胸"]').click();
    await free.locator('#accAddToday-search').fill('ベンチ');
    const options = await free.locator('#accAddToday-preset option').allTextContents();
    check(options.some(text => text === 'ベンチプレス') && !options.some(text => /ラットプルダウン/.test(text)), 'body part and search narrow the catalog');
    await free.screenshot({ path: path.join(artifacts, 'exercise-picker-390.png'), animations: 'disabled' });
    await free.setViewportSize({ width: 320, height: 667 });
    check(await free.locator('#modal').evaluate(el => el.scrollWidth <= innerWidth), 'body-part exercise picker fits 320px');
    await free.screenshot({ path: path.join(artifacts, 'exercise-picker-320.png'), animations: 'disabled' });
    await free.setViewportSize({ width: 390, height: 844 });
    check(await free.evaluate(() => ACCESSORY_PRESETS.length >= 80), 'expanded catalog has at least 80 exercises');
    await free.locator('#accAddToday-preset').selectOption('bench');
    await free.locator('#accAddToday-weight').fill('80');
    await free.locator('#accAddToday-reps').fill('8');
    await free.locator('#accAddToday-sets').fill('2');
    await free.locator('#acc-add-future').click();
    await free.getByLabel('セット重量 kg', { exact: true }).fill('82.5');
    await free.getByLabel('セット回数', { exact: true }).fill('8');
    await free.locator('[data-action="completeSet"]').click();
    check(await free.locator('#restTimerDisplay').innerText() === '00:00', 'rest begins at zero');
    await free.clock.fastForward(45000);
    check(await free.locator('#restTimerDisplay').innerText() === '00:45', 'rest counts elapsed seconds upward');
    await free.locator('#restRingBtn').click();
    await free.locator('#restToggle').click();
    await free.clock.fastForward(30000);
    check(await free.locator('#restTimerDisplay').innerText() === '00:45', 'paused elapsed time stays fixed');
    await free.reload();
    check(await free.locator('#restTimerDisplay').innerText() === '00:45', 'paused elapsed time survives reload');
    await free.locator('#restRingBtn').click();
    await free.locator('#restToggle').click();
    await free.clock.fastForward(20000);
    check(await free.locator('#restTimerDisplay').innerText() === '01:05', 'resume excludes paused time');
    await free.clock.fastForward(300000);
    check(await free.evaluate(() => restState.running && getRestElapsedSec() === 365), 'elapsed timer continues past its reminder target');
    if (!(await free.locator('#restReset').isVisible())) await free.locator('#restRingBtn').click();
    await free.locator('#restReset').click();
    check(await free.locator('#restTimerDisplay').innerText() === '00:00', 'reset restarts elapsed time');
    await free.locator('#restClose').click();
    await free.locator('[data-action="completeSet"]').click();
    await free.locator('#btnAddTodayAccessory').click();
    await free.locator('[data-preset-group="背中"]').click();
    await free.locator('#accAddToday-preset').selectOption('seated_row');
    await free.locator('#accAddToday-weight').fill('40');
    await free.locator('#accAddToday-reps').fill('10');
    await free.locator('#accAddToday-sets').fill('1');
    await free.locator('#acc-add-today-only').click();
    await free.locator('[data-action="completeSet"]').click();
    await free.locator('#btnAddTodayAccessory').click();
    await free.locator('[data-preset-group="カスタム"]').click();
    await free.locator('#accAddToday-name').fill('バンドプルアパート');
    await free.locator('#accAddToday-weight').fill('0');
    await free.locator('#accAddToday-reps').fill('15');
    await free.locator('#accAddToday-sets').fill('1');
    await free.locator('#acc-add-today-only').click();
    await free.locator('[data-action="completeSet"]').click();
    await free.locator('.workout-summary #btnFinishSession').click();
    const custom = await free.evaluate(() => ({ logs: store.logs, next: store.currentState.nextMenuKey,
      maxes: JSON.stringify(store.settings.maxes), template: getFourMenuAccessorySlots('custom') }));
    check(custom.next === protectedData.next, 'free custom completion does not advance the normal routine');
    check(custom.maxes === protectedData.maxes, 'completion does not automatically update MAX');
    check(custom.logs.length === 3 && custom.logs.every(log => log.menuKey === 'custom'), 'multiple body parts and free-name exercise save as custom logs');
    check(new Set(custom.logs.map(log => log.sessionId)).size === 1, 'free custom has one stable session identity');
    check(custom.template.length === 1 && custom.template[0].plannedWeight === 80, 'future template keeps its chosen weight without automatic increment');
    check(custom.logs.some(log => log.exerciseName === 'バンドプルアパート'), 'a user-defined exercise name is retained');
    await free.screenshot({ path: path.join(artifacts, 'free-workout-summary-390.png'), animations: 'disabled' });
    check(await free.evaluate(() => {
      const restored = migrateStoreData(JSON.parse(JSON.stringify(store)));
      return JSON.stringify(restored.logs) === JSON.stringify(store.logs) && restored.settings.customMenuKeys.length === 0 && restored.settings.fourMenuAccessorySlots.custom.length === 1;
    }), 'free custom and its logs survive backup round trip');
    await free.locator('#hdOptions').click();
    await free.locator('#btnNewTodaySession').click();
    for (let i = 0; i < 3; i++) await free.locator('[data-action="completeSet"]').click();
    await free.locator('#btnFinishSession').click();
    check(await free.evaluate(() => JSON.stringify(store.settings.maxes)) === protectedData.maxes, 'normal workout completion also leaves MAX unchanged');
    const beforeApproval = await free.evaluate(() => getFourMenuMainPlan('shoulderPress', 'shoulder_arm'));
    check(beforeApproval.increaseCandidateWeight === beforeApproval.weight + 2.5, '2.5kg increase is proposed separately from current weight');
    await free.locator('[data-adopt-next-weight="0"]').click();
    check(await free.evaluate(() => getFourMenuMainPlan('shoulderPress', 'shoulder_arm').weight) === beforeApproval.increaseCandidateWeight, 'only explicit adoption changes next weight');
    check(await free.evaluate(() => new Set(store.logs.map(log => log.sessionId)).size) === 2, 'normal and custom sessions on the same date remain separate');
    await freeContext.close();

    for (const width of [320, 375, 390, 430, 768]) {
      await page.setViewportSize({ width, height: width <= 375 ? 667 : 844 });
      for (const screen of ['today', 'block', 'log', 'settings']) {
        await page.locator(`.nav-btn[data-screen="${screen}"]`).click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(180);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        check(!overflow, `${screen} at ${width}px has no horizontal overflow`);
        await page.screenshot({ path: path.join(artifacts, `${screen}-${width}.png`) });
      }
      await page.locator('.nav-btn[data-screen="today"]').click();
      await page.evaluate(() => window.scrollTo(0, 0));
      const rpe = await page.locator('.set-rpe').boundingBox();
      const dock = await page.locator('.set-dock').boundingBox();
      check(rpe && dock && rpe.y + rpe.height <= dock.y + 1, `RPE stays above the dock at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addStyleTag({ content: ':root { --test-safe-top: 47px; --test-safe-bottom: 34px; }' });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.scrollTo(0, 0));
    const safeRpe = await page.locator('.set-rpe').boundingBox();
    const safeDock = await page.locator('.set-dock').boundingBox();
    const safeNav = await page.locator('.bottom-nav').boundingBox();
    check(safeRpe.y + safeRpe.height <= safeDock.y, 'iPhone safe areas leave RPE above the dock');
    check(safeDock.y + safeDock.height <= safeNav.y + 1, 'dock does not overlap the safe-area navigation');
    await page.screenshot({ path: path.join(artifacts, 'today-safe-area-390.png') });
    check(errors.length === 0, errors.join('\n') || 'no browser errors');
    await context.close();
  } finally { await browser.close(); server.close(); }
  console.log(`test_recording_ux.js: ${checks} checks passed; screenshots: ${artifacts}`);
}

run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
