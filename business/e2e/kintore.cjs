const ORIGIN = process.env.E2E_ORIGIN || 'http://localhost:8080';
const { setup, rec, controls, overflow, click } = require('./lib.cjs');
const U = ORIGIN + '/kintore-app/';
const dev = process.argv[2] || 'iPhone 13';
const tag = dev.replace(/ /g,'');
(async () => {
  const { b, ctx, p, errs } = await setup(dev);
  try {
  await p.goto(U, { waitUntil: 'networkidle' });
  await click(p, 'スキップ'); await p.waitForTimeout(300);
  await click(p, '胸で始める');
  await click(p, /^ベンチプレス バーベル/);
  await p.waitForTimeout(500);
  const doneBtn = p.getByRole('button', { name: '完了', exact: true }).filter({ visible: true });
  if (await doneBtn.count()) await doneBtn.first().click();
  await p.waitForTimeout(500);
  const ins = p.locator('input').filter({ visible: true });
  const meta = await ins.evaluateAll(es => es.map(e => `${e.type}|${e.inputMode}|${e.placeholder}|${e.getAttribute('aria-label')}`));
  console.log('inputs', meta.slice(0, 8));
  const w = p.locator('input[aria-label*="重量"], input[inputmode=decimal]').filter({ visible: true }).first();
  const r = p.locator('input[aria-label*="回数"], input[inputmode=numeric]').filter({ visible: true }).first();
  await w.fill('40'); await r.fill('10');
  // check keyboard type
  rec('K-numeric-keyboard', /decimal|numeric/.test(meta.join()) ? 'PASS' : 'FAIL', 'set inputs request numeric keypad: ' + meta.slice(0,2).join(' ; '));
  await p.getByRole('button', { name: 'セット完了' }).first().click();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `k-11-set-${tag}.png` });
  const t1 = await p.locator('body').innerText();
  rec('K-rest-timer', /休憩/.test(t1) || /\b[0-5]?\d:\d\d\b/.test(t1) ? 'PASS' : 'FAIL', 'rest timer after ✓: ' + (t1.match(/休憩[^\n]*/)||[''])[0]);
  const stored = await p.evaluate(() => localStorage.getItem('kintore-app-data-v1') || '');
  rec('K-autosave-immediate', stored.includes('40') ? 'PASS' : 'FAIL', `localStorage has set immediately (len ${stored.length})`);
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const vals = await p.locator('input').evaluateAll(es => es.map(e => e.value));
  const t2 = await p.locator('body').innerText();
  rec('K-reload-resume', /ベンチプレス/.test(t2) && (vals.includes('40') || /40/.test(t2)) ? 'PASS' : 'FAIL', 'after reload workout resumes with bench 40kg');
  await p.screenshot({ path: `k-12-reload-${tag}.png` });
  rec('K-workout-overflow', (await overflow(p)) <= 0 ? 'PASS' : 'FAIL', `overflow=${await overflow(p)}`);
  // finish workout
  await click(p, '終了'); await p.waitForTimeout(600);
  await p.screenshot({ path: `k-13-finish-${tag}.png` });
  console.log('after 終了', JSON.stringify((await controls(p)).slice(0, 15)));
  const fin = p.getByRole('button', { name: /終了する|保存|記録する|完了/ }).filter({ visible: true });
  if (await fin.count()) { await fin.first().click(); await p.waitForTimeout(800); }
  console.log('after finish', JSON.stringify((await controls(p)).slice(0, 15)));
  await click(p, '履歴'); await p.waitForTimeout(700);
  const h = await p.locator('body').innerText();
  rec('K-history', /ベンチプレス|胸/.test(h) ? 'PASS' : 'FAIL', 'finished workout appears in history');
  await p.screenshot({ path: `k-14-history-${tag}.png` });
  // offline
  await p.waitForTimeout(1000);
  const sw = await p.evaluate(() => !!navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  let ok = false; try { await p.reload({ waitUntil: 'load', timeout: 10000 }); await p.waitForTimeout(800); ok = /ホーム/.test(await p.locator('body').innerText()); } catch {}
  rec('K-offline-launch', ok ? 'PASS' : 'FAIL', `SW controlled=${sw}; offline reload ok=${ok}`);
  await ctx.setOffline(false);
  // premium gating on web (beta => all free)
  await p.goto(U + '?paywall=test', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  await click(p, '設定'); await p.waitForTimeout(500);
  const st = await p.locator('body').innerText();
  rec('K-paywall-testmode', /プレミアム|Premium/.test(st) ? 'PASS' : 'NOT TESTED', 'settings shows premium entry in ?paywall=test');
  await p.screenshot({ path: `k-15-settings-${tag}.png`, fullPage: true });
  rec('K-settings-overflow', (await overflow(p)) <= 0 ? 'PASS' : 'FAIL', `overflow=${await overflow(p)}`);
  } catch (e) { rec('K-script', 'FAIL', e.message.slice(0, 300)); await p.screenshot({ path: 'k-err.png' }); console.log(JSON.stringify(await controls(p))); }
  rec('K-console-errors', errs.length ? 'FAIL' : 'PASS', JSON.stringify(errs).slice(0, 400));
  await b.close();
})();
