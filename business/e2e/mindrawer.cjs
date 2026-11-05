const ORIGIN = process.env.E2E_ORIGIN || 'http://localhost:8080';
const { setup, rec, controls, overflow, click } = require('./lib.cjs');
const U = ORIGIN + '/hikidashi/';
const dev = process.argv[2] || 'iPhone 13';
const tag = dev.replace(/ /g,'');
(async () => {
  const { b, ctx, p, errs } = await setup(dev);
  try {
  await p.goto(U, { waitUntil: 'networkidle' });
  await click(p, 'スキップ'); await p.waitForTimeout(400);
  const notes = ['洗濯物を早く乾かすコツ：バスタオルはアーチ状に干し、扇風機を下から当てると乾くのが速い。', 'プレゼン前に緊張したら、4秒吸って7秒止めて8秒で吐く呼吸を3回。', '2026/12/20 までに年賀状を出す'];
  for (const n of notes) {
    await p.locator('#mSave').click();
    await p.getByPlaceholder('Tips やメモを書く・貼り付ける').fill(n);
    await p.locator('#go').click();
    await p.waitForTimeout(1200);
    // folder choice card may appear
    const c = await controls(p);
    const pick = c.find(x => /^B:(決定|これにする|しまう|OK)$/.test(x));
    if (pick) { console.log('choice card', c.filter(x=>x.startsWith('B:')).slice(0,12)); }
  }
  await p.screenshot({ path: `m-10-after3-${tag}.png` });
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'メモ', exact: true }).first().click(); await p.waitForTimeout(700);
  let t = await p.locator('body').innerText();
  const found = notes.filter(n => t.includes(n.slice(0, 8))).length;
  rec('M-save-reload', found === 3 ? 'PASS' : 'FAIL', `${found}/3 notes visible in Memo tab after reload (keyword filing, no API key)`);
  await p.screenshot({ path: `m-11-memos-${tag}.png` });
  // recall
  await p.getByRole('button', { name: '今日', exact: true }).first().click(); await p.waitForTimeout(300);
  await p.locator('#mAsk').click();
  await p.locator('#askText').fill('これから洗濯する');
  await p.locator('#go').click(); await p.waitForTimeout(1500);
  t = await p.locator('body').innerText();
  await p.screenshot({ path: `m-12-recall-${tag}.png` });
  rec('M-recall-nokey', /バスタオル/.test(t) ? 'PASS' : 'FAIL', 'recall "これから洗濯する" returns laundry note by keyword: ' + t.split('\n').filter(l=>/キーワード|関係/.test(l)).slice(0,2).join(' / '));
  // search
  const s = p.getByRole('button', { name: 'Find' }).first();
  await s.click(); await p.waitForTimeout(300);
  await p.keyboard.type('呼吸'); await p.waitForTimeout(800);
  t = await p.locator('body').innerText();
  rec('M-search', /4秒吸って/.test(t) ? 'PASS' : 'FAIL', 'search "呼吸" finds note');
  await p.keyboard.press('Escape');
  // export
  await p.goto(U, { waitUntil: 'networkidle' });
  await click(p, '設定'); await p.waitForTimeout(500);
  const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await p.getByRole('button', { name: /書き出す|書き出し|Export/ }).filter({ visible: true }).first().click().catch(e => console.log('no export btn', e.message.slice(0,80)));
  const d = await dl;
  if (d) { const pth = await d.path(); const j = require('fs').readFileSync(pth, 'utf8'); rec('M-export-json', j.includes('バスタオル') ? 'PASS' : 'FAIL', `export ${d.suggestedFilename()} ${j.length} bytes`); }
  else rec('M-export-json', 'NOT TESTED', 'export button/download not found in settings');
  await p.screenshot({ path: `m-13-settings-${tag}.png` });
  } catch (e) { rec('M-script', 'FAIL', e.message.slice(0, 300)); await p.screenshot({ path: 'm-err.png' }); console.log(JSON.stringify(await controls(p))); }
  rec('M-console-errors', errs.length ? 'FAIL' : 'PASS', JSON.stringify(errs).slice(0, 400));
  await b.close();
})();
