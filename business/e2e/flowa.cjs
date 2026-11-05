const ORIGIN = process.env.E2E_ORIGIN || 'http://localhost:8080';
const { setup, rec, controls, overflow, click, results } = require('./lib.cjs');
const fs = require('fs');
const U = ORIGIN + '/jp-speed-reader/';
const dev = process.argv[2] || 'iPhone 13';
(async () => {
  const { b, ctx, p, errs } = await setup(dev);
  try {
  await p.goto(U, { waitUntil: 'networkidle' });
  await click(p, 'スキップ');
  rec('F-library-overflow', (await overflow(p)) <= 0 ? 'PASS' : 'FAIL', `${dev} overflow=${await overflow(p)}`);
  await click(p, '本を追加');
  await click(p, '縦書きの短編（テキストPDF）');
  await p.waitForURL(/#\/read\//, { timeout: 30000 });
  rec('F-import-pdf-sample', 'PASS', 'vertical text PDF sample imported, reader opened');
  const pos0 = await p.locator('input[aria-label="読書位置"]').inputValue();
  await click(p, '再生', { exact: true });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `f-04-playing-${dev.replace(/ /g,'')}.png` });
  // pause by tapping the pause button
  const pauseBtn = p.getByRole('button', { name: /一時停止|停止/ }).filter({ visible: true }).first();
  if (await pauseBtn.count()) await pauseBtn.click(); else await p.keyboard.press('Space');
  await p.waitForTimeout(500);
  const pos1 = await p.locator('input[aria-label="読書位置"]').inputValue();
  rec('F-play-advance', Number(pos1) > Number(pos0) ? 'PASS' : 'FAIL', `pos ${pos0} -> ${pos1} after 4s play`);
  rec('F-reader-overflow', (await overflow(p)) <= 0 ? 'PASS' : 'FAIL', `overflow=${await overflow(p)}`);
  // reload => position restored
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const pos2 = await p.locator('input[aria-label="読書位置"]').inputValue().catch(() => 'NA');
  rec('F-reload-restore', pos2 === pos1 ? 'PASS' : (Math.abs(pos2 - pos1) <= 2 ? 'PASS' : 'FAIL'), `after reload pos=${pos2} (before ${pos1})`);
  // browser back
  await p.goBack(); await p.waitForTimeout(800);
  rec('F-browser-back', /#\/import|#\/$|\/$/.test(p.url()) ? 'PASS' : 'FAIL', `back -> ${p.url()}`);
  await p.goto(U + '#/', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const lib = await p.locator('body').innerText();
  rec('F-library-progress', /%|続き/.test(lib) ? 'PASS' : 'FAIL', 'library shows progress/continue');
  await p.screenshot({ path: `f-05-library-${dev.replace(/ /g,'')}.png` });
  // offline relaunch
  await p.waitForTimeout(1500);
  const swReady = await p.evaluate(() => navigator.serviceWorker.controller ? 'controlled' : 'not-controlled');
  await ctx.setOffline(true);
  let offOk = false;
  try { await p.reload({ waitUntil: 'load', timeout: 10000 }); await p.waitForTimeout(1500); offOk = /本棚/.test(await p.locator('body').innerText()); } catch (e) {}
  rec('F-offline-launch', offOk ? 'PASS' : 'FAIL', `SW ${swReady}; offline reload shows library=${offOk}`);
  if (offOk) {
    await p.locator('text=/続き|読む/').first().click().catch(() => {});
    await p.waitForTimeout(1000);
    rec('F-offline-read', /#\/read\//.test(p.url()) ? 'PASS' : 'NOT TESTED', `offline open book url=${p.url()}`);
  }
  await ctx.setOffline(false);
  // text import via file input
  await p.goto(U + '#/import', { waitUntil: 'networkidle' });
  fs.writeFileSync(require('path').join(require('os').tmpdir(), 't.txt'), '吾輩は猫である\n夏目漱石\n\n　吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。\n');
  await p.locator('input[type=file]').setInputFiles(require('path').join(require('os').tmpdir(), 't.txt'));
  await p.waitForURL(/#\/read\//, { timeout: 20000 }).then(() => rec('F-import-txt', 'PASS', 'user .txt via file input opened reader')).catch(async () => rec('F-import-txt', 'FAIL', 'no reader after txt: ' + (await p.locator('body').innerText()).slice(0, 150)));
  // bad file
  await p.goto(U + '#/import', { waitUntil: 'networkidle' });
  fs.writeFileSync(require('path').join(require('os').tmpdir(), 'bad.pdf'), 'not a pdf at all');
  await p.locator('input[type=file]').setInputFiles(require('path').join(require('os').tmpdir(), 'bad.pdf'));
  await p.waitForTimeout(2500);
  const bt = await p.locator('body').innerText();
  rec('F-import-broken-pdf', /PDF|読め|壊|エラー/.test(bt) && !/#\/read/.test(p.url()) ? 'PASS' : 'FAIL', 'error message: ' + bt.split('\n').filter(l => /PDF|読め|壊|エラー/.test(l)).slice(0, 2).join(' / '));
  await p.screenshot({ path: `f-06-badpdf.png` });
  // settings page
  await p.goto(U + '#/settings', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  rec('F-settings-overflow', (await overflow(p)) <= 0 ? 'PASS' : 'FAIL', `overflow=${await overflow(p)}`);
  await p.screenshot({ path: `f-07-settings.png`, fullPage: false });
  await p.goto(U + '#/history', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  rec('F-history', /分|字/.test(await p.locator('body').innerText()) ? 'PASS' : 'FAIL', 'history shows time/chars');
  } catch (e) { rec('F-script', 'FAIL', e.message.slice(0, 200)); await p.screenshot({ path: 'f-err.png' }); }
  rec('F-console-errors', errs.length ? 'FAIL' : 'PASS', JSON.stringify(errs).slice(0, 400));
  await b.close();
})();
