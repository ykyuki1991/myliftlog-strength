// Optional real-browser regression suite. Requires Playwright and a local Chromium.
// NODE_PATH=<playwright modules> CHROME_PATH=<chrome> node test_ui.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium, webkit } = require('playwright');

const root = __dirname;
const artifacts = process.env.UI_ARTIFACT_DIR || path.join(os.tmpdir(), 'myliftlog-quiet-ui');
fs.mkdirSync(artifacts, { recursive: true });
let oldVersion = false;
let originOffline = false;
const server = http.createServer((req, res) => {
  if (originOffline) { req.socket.destroy(); return; }
  const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
  if (file.includes('..')) { res.writeHead(400); res.end(); return; }
  try {
    const body = oldVersion ? execFileSync('git', ['show', `70cf64a:${file}`], { cwd: root }) : fs.readFileSync(path.join(root, file));
    const types = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});

// メニューピッカーはヘッダーのオプションシートへ移動した。
// 「シートを開いて選ぶ」をひとまとめにしておく。
async function selectMenu(page, key) {
  // 閉じたシートはDOMに残る（.modal.hidden は visibility で隠す）ので、
  // count ではなく可視性で判定する。
  const row = page.locator(`[data-four-menu-select="${key}"]`);
  if (!(await row.isVisible().catch(() => false))) await page.locator('#hdOptions').click();
  await row.click();
}

async function menuIsSelected(page, key) {
  await page.locator('#hdOptions').click();
  const on = await page.locator(`[data-four-menu-select="${key}"]`).getAttribute('aria-checked');
  await page.keyboard.press('Escape');
  return on === 'true';
}

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = process.env.UI_PUBLIC_URL || `http://127.0.0.1:${server.address().port}/`;
  const options = { headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) };
  const browser = process.env.UI_BROWSER === 'webkit'
    ? await webkit.launch({ headless: true })
    : await chromium.launch(options);
  let checks = 0;
  const check = (value, label) => { assert.ok(value, label); checks++; };
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(url);
    await selectMenu(page, 'chest');
    await page.getByLabel('セット重量 kg', { exact: true }).fill('102.5');
    await page.getByLabel('セット回数', { exact: true }).fill('6');
    // One click after editing must complete, not get swallowed by a change rerender.
    await page.locator('[data-action="completeSet"]').click();
    let session = await page.evaluate(() => getOrCreateTodaySession());
    check(session.exercises[0].sets[0].done && session.exercises[0].sets[0].weight === 102.5 && session.exercises[0].sets[0].reps === 6, 'direct entry + one-click completion');
    const inputTop = await page.locator('.active-set').boundingBox();
    const timerBox = await page.locator('#restTimer').boundingBox();
    const headerBox = await page.locator('#appHeader').boundingBox();
    check(timerBox.y >= headerBox.y - 1 && timerBox.y < headerBox.y + headerBox.height,
      'rest ring sits in the header');
    await page.locator('#restRingBtn').click();
    await page.locator('#restClose').click();
    const afterClose = await page.locator('.active-set').boundingBox();
    check(Math.abs(afterClose.y - inputTop.y) < 2, 'timer does not shift recording controls');
    // RPEは入力ボックスから詳細ブロックへ移動した。一度開けば再描画をまたいで開いたまま。
    await page.locator('details[data-ui-key^="exercise-"] > summary').first().click();
    await page.locator('[data-rpe-edit="9.5"]').click();
    check((await page.evaluate(() => getOrCreateTodaySession())).exercises[0].rpe === '9.5', 'RPE saved');
    await page.locator('[data-rpe-edit="9.5"]').click();
    check((await page.evaluate(() => getOrCreateTodaySession())).exercises[0].rpe === '未入力', 'RPE deselection');
    await page.locator('textarea[data-field="note"]').fill('UI regression draft');
    await page.locator('.chip[data-pain="なし"]').click();
    check(await page.locator('[data-ui-key^="exercise-"]').evaluate(el => el.open), 'disclosure survives rerender');
    const before = await page.evaluate(() => ({ id: getOrCreateTodaySession().sessionId, date: getOrCreateTodaySession().workoutDate }));
    await page.reload();
    session = await page.evaluate(() => getOrCreateTodaySession());
    check(session.sessionId === before.id && session.workoutDate === before.date && session.exercises[0].note === 'UI regression draft', 'reload preserves draft and identity');
    // Build representative history using the existing completion path, never a user's browser data.
    await page.evaluate(() => { const s = getOrCreateTodaySession(); s.exercises.forEach(ex => ex.sets.forEach(set => { set.done = true; })); finishTodaySession(); });
    const next = await page.evaluate(() => store.currentState.nextMenuKey);
    // 同日別セッションは記録画面から外し、オプションシートへ移した。
    await page.locator('#hdOptions').click();
    await page.locator('#btnNewTodaySession').click();
    await selectMenu(page, 'custom');
    await page.locator('#hdOptions').click();
    await page.getByRole('button', { name: '組み合わせを編集' }).click();
    await page.locator('[data-custom-menu="legs"]').check();
    await page.getByRole('button', { name: 'この組み合わせで記録' }).click();
    check(await menuIsSelected(page, 'custom'), 'custom visible selected state');
    await page.evaluate(() => { const s = getOrCreateTodaySession(); s.exercises.forEach(ex => ex.sets.forEach(set => { set.done = true; })); finishTodaySession(); });
    check(await page.evaluate(() => store.currentState.nextMenuKey) === next, 'custom preserves normal sequence');
    check(await page.evaluate(() => new Set(store.logs.map(log => log.sessionId)).size) === 2, 'same-day separate sessions');
    // 同日別セッションは記録画面から外し、オプションシートへ移した。
    await page.locator('#hdOptions').click();
    await page.locator('#btnNewTodaySession').click();
    for (const width of [320, 375, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const screen of ['today', 'log', 'block', 'settings']) {
        await page.locator(`.nav-btn[data-screen="${screen}"]`).click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator(`#main[data-screen="${screen}"]`).waitFor();
        check(await page.locator(`.nav-btn[data-screen="${screen}"]`).getAttribute('aria-current') === 'page', `${screen} navigation state`);
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${screen} overflow at ${width}`);
        const clipped = await page.locator('#main button, #main input, #main select, #main .nx-name').evaluateAll(elements => elements.filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && (r.left < -1 || r.right > innerWidth + 1);
        }).map(el => el.textContent || el.id));
        check(clipped.length === 0, `${screen} clipped controls at ${width}: ${clipped.join(',')}`);
        check(!/undefined|NaN|Daynull/.test(await page.locator('#main').innerText()), `${screen} valid text`);
        await page.screenshot({ path: path.join(artifacts, `${screen}-${width}.png`), fullPage: true, animations: 'disabled' });
      }
    }
    await page.setViewportSize({ width: 320, height: 740 });
    await page.locator('.nav-btn[data-screen="log"]').click();
    // 実測MAXと推定MAXは1タブに統合した。
    for (const type of ['daily', 'monthly', 'max']) {
      await page.locator(`.tab[data-type="${type}"]`).click();
      check(await page.locator(`.tab[data-type="${type}"]`).getAttribute('aria-pressed') === 'true', `${type} log tab state`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${type} log width`);
      if (type === 'max') check(await page.locator('.lift-seg button').evaluateAll(elements => elements.length > 0 && elements.every(el => el.scrollWidth <= el.clientWidth)), `${type} lift labels fit`);
      await page.screenshot({ path: path.join(artifacts, `log-${type}-320.png`), fullPage: true, animations: 'disabled' });
    }
    await page.locator('.nav-btn[data-screen="today"]').click();
    await page.locator('[data-action="editMainSet"]').first().click();
    check(await page.locator('#modal').evaluate(el => !el.classList.contains('hidden')), 'main editor opens');
    check(await page.locator('#modal').evaluate(el => el.scrollWidth <= innerWidth), 'main editor fits 320px');
    await page.screenshot({ path: path.join(artifacts, 'main-editor-320.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.locator('.set-tr[data-edit-ex]').first().click();
    check(await page.getByRole('button', { name: '完了', exact: true }).count() > 0, 'SVG completion controls have accessible names');
    check(await page.locator('#modal [data-se-state="todo"]').first().getAttribute('aria-pressed') === 'true', 'set editor exposes current state');
    await page.screenshot({ path: path.join(artifacts, 'set-editor-320.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.locator('.nav-btn[data-screen="block"]').click();
    await page.locator('[data-ui-key="plan-chest"] > summary').click();
    await page.locator('[data-ui-key="plan-chest"] [data-edit-four-accessory]').first().click();
    check(await page.locator('#modal').evaluate(el => !el.classList.contains('hidden')), 'accessory editor opens');
    check(await page.locator('#modal').evaluate(el => el.scrollWidth <= innerWidth), 'accessory editor fits 320px');
    check(await page.locator('#modal select').first().evaluate(el => el.getBoundingClientRect().height >= 44), 'accessory picker touch target');
    await page.screenshot({ path: path.join(artifacts, 'accessory-editor-320.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.locator('[data-ui-key="plan-chest"] > summary').click();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('.nav-btn[data-screen="today"]').click();
    const contrast = await page.locator('[data-action="completeSet"]').evaluate(el => {
      const lum = color => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(n => { const c = n / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const c = getComputedStyle(el), a = lum(c.color), b = lum(c.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    check(contrast >= 4.5, 'completion text contrast >= 4.5');
    await page.evaluate(() => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, value: 360 });
      visualViewport.dispatchEvent(new Event('resize'));
    });
    check(await page.locator('body').evaluate(el => el.classList.contains('keyboard-open')), 'keyboard-sized visual viewport handled');
    check(await page.locator('.bottom-nav').evaluate(el => getComputedStyle(el).visibility === 'hidden'), 'navigation does not cover keyboard input');
    await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
    await page.locator('.nav-btn[data-screen="block"]').click();
    await page.locator('[data-ui-key="plan-chest"] > summary').click();
    await page.evaluate(() => window.scrollTo(0, 300));
    const scroll = await page.evaluate(() => window.scrollY);
    await page.locator('.nav-btn[data-screen="log"]').click();
    await page.locator('.nav-btn[data-screen="block"]').click();
    check(await page.locator('[data-ui-key="plan-chest"]').evaluate(el => el.open), 'plan expansion preserved across navigation');
    check(Math.abs(await page.evaluate(() => window.scrollY) - scroll) < 2, 'screen scroll restored');
    await page.locator('.nav-btn[data-screen="today"]').click();
    // 「組み合わせを編集」はカスタム選択時にだけシートへ出る。
    await selectMenu(page, 'custom');
    await page.locator('#hdOptions').click();
    await page.getByRole('button', { name: '組み合わせを編集' }).click();
    await page.keyboard.press('Escape');
    check(await page.locator('#modal').evaluate(el => el.classList.contains('hidden')), 'Escape closes modal');
    await page.setViewportSize({ width: 375, height: 430 });
    await page.getByLabel('セット重量 kg', { exact: true }).fill('105');
    await page.locator('[data-action="completeSet"]').click();
    check((await page.evaluate(() => getOrCreateTodaySession())).exercises[0].sets.some(set => set.done && set.weight === 105), 'short viewport input and completion');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    check(await page.locator('.btn-primary').first().evaluate(el => parseFloat(getComputedStyle(el).transitionDuration) < 0.01), 'reduced motion');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async () => (await caches.keys()).includes('mll-strength-v26'));
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    // WebKit's protocol-level offline mode aborts navigation before SW fallback.
    // Locally cut the origin connection instead, exercising the actual fetch failure.
    if (process.env.UI_BROWSER === 'webkit' && !process.env.UI_PUBLIC_URL) originOffline = true;
    else await context.setOffline(true);
    await page.reload();
    await page.locator('.workout-summary, .card-ex').first().waitFor();
    check((await page.evaluate(() => getOrCreateTodaySession())).exercises[0].sets.some(set => set.weight === 105), 'offline draft preserved');
    check(errors.length === 0, errors.join('\n'));
    await context.close();
    originOffline = false;

    if (!process.env.UI_PUBLIC_URL) {
      oldVersion = true;
      const upgrade = await browser.newContext();
      const tab = await upgrade.newPage();
      await tab.goto(url);
      await tab.evaluate(() => navigator.serviceWorker.ready);
      await tab.waitForFunction(async () => (await caches.keys()).includes('mll-strength-v25'));
      await selectMenu(tab, 'custom');
      const old = await tab.evaluate(() => { const s = getOrCreateTodaySession(); s.exercises[0].note = 'upgrade'; persistTodaySession(s); return JSON.stringify(store); });
      oldVersion = false;
      await tab.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
      await tab.waitForFunction(async () => (await caches.keys()).includes('mll-strength-v26') && !(await caches.keys()).includes('mll-strength-v25'));
      await tab.reload();
      // reload直後の evaluate は実行コンテキストの破棄と競合する。DOMが立つまで待つ。
      await tab.locator('#appHeader').waitFor();
      const after = await tab.evaluate(() => JSON.stringify(store));
      fs.writeFileSync(path.join(artifacts, 'upgrade-before.json'), old);
      fs.writeFileSync(path.join(artifacts, 'upgrade-after.json'), after);
      // Existing migration adds null default weights; lifecycle saves update only updatedAt.
      const expected = await tab.evaluate(saved => migrateStoreData(JSON.parse(saved)), old);
      const actual = JSON.parse(after);
      Object.keys(actual.daySessions).forEach(key => {
        assert.ok(actual.daySessions[key].updatedAt >= expected.daySessions[key].updatedAt);
        actual.daySessions[key].updatedAt = expected.daySessions[key].updatedAt;
      });
      assert.deepStrictEqual(actual, expected, 'v24 to v25 preserves all data under existing migration');
      checks++;
      await upgrade.close();
    }
    console.log(`test_ui.js: ${checks} checks passed. Screenshots: ${artifacts}`);
  } finally { await browser.close(); server.close(); }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
