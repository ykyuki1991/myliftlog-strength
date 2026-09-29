// 2026-09-29 UX監査で見つけた不具合の回帰テスト。実ブラウザ（Playwright）で、
// 日付を進めながら実際のボタン操作で記録する。利用者のブラウザデータは使わない。
// NODE_PATH=<playwright modules> node test_ux_audit.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const root = __dirname;
const server = http.createServer((req, res) => {
  const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
  if (file.includes('..') || file === 'service-worker.js') { res.writeHead(404); res.end(); return; }
  try {
    const body = fs.readFileSync(path.join(root, file));
    const types = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };

async function logAllSets(page) {
  for (let i = 0; i < 80; i++) {
    const btn = page.locator('[data-action="completeSet"]');
    if (!(await btn.count())) return;
    await btn.click();
  }
}

async function selectMenu(page, key) {
  await page.locator('#hdOptions').click();
  await page.locator(`[data-four-menu-select="${key}"]`).click();
}

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 402, height: 874 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Tokyo' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.clock.install({ time: new Date('2026-08-03T18:00:00+09:00') });
    await page.goto(url);

    // --- 重量表示: 1.25kg 刻みを丸めない ---
    check(await page.evaluate(() => fmtW(66.25) === '66.25' && fmtW(70) === '70.0' && fmtW(102.5) === '102.5'), 'fmtW keeps 1.25kg steps');

    // --- FINISH: 1セットも無いときは終えない ---
    const before = await page.evaluate(() => ({ next: store.currentState.nextMenuKey, logs: store.logs.length }));
    await page.locator('#btnFinishSession').click();
    const afterEmpty = await page.evaluate(() => ({ next: store.currentState.nextMenuKey, logs: store.logs.length }));
    check(afterEmpty.next === before.next && afterEmpty.logs === before.logs, 'zero-set FINISH neither writes logs nor advances the rotation');
    check(/1セット以上/.test(await page.locator('#toast').innerText()), 'zero-set FINISH explains why');

    // --- 最後のセットの後にレストを始めない / 終了前のまとめには FINISH がある ---
    await logAllSets(page);
    check(!(await page.locator('#restTimer').isVisible()), 'no rest timer after the last set of the session');
    check(await page.locator('.workout-summary #btnFinishSession').count() === 1, 'summary before finishing offers FINISH');
    await page.locator('.workout-summary #btnFinishSession').click();
    check(await page.locator('.workout-summary #btnViewWorkoutLog').count() === 1, 'summary after finishing offers the log');
    const firstMenu = await page.evaluate(() => store.logs[0].menuKey);

    // --- 新しい日: 1セット目の前でも前回記録を出す ---
    await page.clock.setSystemTime(new Date('2026-08-04T18:00:00+09:00'));
    await page.reload();
    await selectMenu(page, firstMenu);
    const prevText = await page.locator('.ex-previous-value').innerText();
    check(/^Last /.test(prevText), `previous record shown before the first set (${prevText})`);
    check(await page.locator('#main').innerText().then(t => !/66\.3\b/.test(t)), 'no rounded 66.3 on screen');

    // --- トーストが LOG SET に重ならない ---
    await page.locator('[data-action="completeSet"]').click();
    const toast = await page.locator('#toast').boundingBox();
    const dock = await page.locator('.set-dock-btn').boundingBox();
    check(toast && dock && toast.y + toast.height <= dock.y + 1, 'toast sits above LOG SET');

    // --- セット編集: RPE はセットごと ---
    await page.locator('.set-tr[data-edit-ex]').nth(0).click();
    await page.locator('#modal select[data-se-field="rpe"][data-se-idx="0"]').selectOption('9.5');
    await page.locator('#btnSetEditSave').click();
    let ex0 = await page.evaluate(() => getOrCreateTodaySession().exercises[0].sets.map(s => s.rpe ?? null));
    check(String(ex0[0]) === '9.5' && ex0[1] == null, `set editor edits one set's RPE (${ex0})`);
    check(!(await page.locator('[data-se-rpe]').count()), 'no all-sets RPE row');

    // --- FINISH 途中: 確認してから終える。終えた後は記録画面に戻らない ---
    dialogs.length = 0;
    await page.locator('#btnFinishSession').click();
    check(dialogs.some(m => /未実施のセット/.test(m)), 'partial FINISH asks first');
    check(await page.locator('.workout-summary').count() === 1 && !(await page.locator('.set-dock').count()), 'finished session shows its summary, not LOG SET');

    // --- 終わったレストは10分で片付く ---
    await page.evaluate(() => {
      const t = Date.now();
      store.restTimerState = { restStartedAt: t - 20 * 60000, restDurationSec: 60, restEndAt: t - 19 * 60000, running: true, targetName: '', alertedAt: null };
      saveStore();
    });
    await page.reload();
    check(!(await page.locator('#restTimer').isVisible()), 'stale finished rest is cleared on reopen');

    // --- 設定は入力した時点で保存。空欄は保存しない ---
    await page.locator('.nav-btn[data-screen="settings"]').click();
    check(!(await page.locator('#btnSaveSettings').count()), 'no separate save button');
    await page.locator('#set-bench').fill('130');
    await page.locator('#set-bench').blur();
    await page.locator('#set-squat').fill('');
    await page.locator('#set-squat').blur();
    await page.locator('.nav-btn[data-screen="log"]').click();
    const maxes = await page.evaluate(() => JSON.parse(localStorage.getItem('mll_strength_planner_v1')).settings.maxes);
    check(maxes.bench === 130, 'settings autosave');
    check(maxes.squat > 0, 'blank MAX is not saved as 0');

    // --- LOG: 同じ日の中は実施した順、5種目目以降は件数で示す ---
    const order = await page.evaluate(() => {
      const logs = [...logsByDate().values()][0];
      return logs.map(l => String(l.menuType).startsWith('four-main-'));
    });
    check(order[0] === true, 'the main lift leads its day in the log');
    const day0 = await page.locator('.log-card').first().innerText();
    check(!/MAX候補/.test(day0), 'no MAX候補 chip on log days');

    // --- シートは下に引くと閉じる ---
    await page.locator('.nav-btn[data-screen="today"]').click();
    await page.locator('#hdOptions').click();
    await page.evaluate(() => {
      const inner = document.querySelector('#modal .modal-inner');
      const t = (type, y) => {
        const touch = new Touch({ identifier: 1, target: inner, clientX: 200, clientY: y });
        inner.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true }));
      };
      t('touchstart', 500); t('touchmove', 560); t('touchmove', 640); t('touchend', 640);
    });
    check(await page.locator('#modal').evaluate(el => el.classList.contains('hidden')), 'swipe down closes the sheet');

    check(errors.length === 0, errors.join('\n'));
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_ux_audit.js: ${checks} checks passed`);
}

run().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
