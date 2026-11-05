const ORIGIN = process.env.E2E_ORIGIN || 'http://localhost:8080';
const { setup, rec, click } = require('./lib.cjs');
const U = ORIGIN + '/jp-speed-reader/';
(async () => {
  const { b, ctx, p, errs } = await setup('iPhone SE');
  await p.goto(U, { waitUntil: 'networkidle' });
  await click(p, 'スキップ'); await click(p, '本を追加'); await click(p, '横書きの短編（テキストPDF）');
  await p.waitForURL(/#\/read\//); const readUrl = p.url();
  await p.waitForTimeout(2000);
  await ctx.setOffline(true);
  await p.goto(U + '#/', { waitUntil: 'load' }).catch(()=>{}); await p.waitForTimeout(500);
  await p.goto(readUrl, { waitUntil: 'load' }).catch(()=>{});
  await p.reload({ waitUntil: 'load' }).catch(()=>{}); await p.waitForTimeout(1500);
  await click(p, '再生', { exact: true }).catch(()=>{}); await p.waitForTimeout(2500);
  // 再生中は操作ボタンが隠れるので、画面下の進捗表示（例「322 / 517字・61.3%」）で判定する
  const m = (await p.locator('body').innerText()).match(/([\d.]+)%/);
  rec('F-offline-read', m && Number(m[1]) > 0 ? 'PASS' : 'FAIL', `offline reload of reader & play, progress=${m ? m[1] : 'NA'}%`);
  await p.screenshot({ path: 'f-08-se-offline-reader.png' });
  // PDF view screen
  await ctx.setOffline(false);
  await p.goto(readUrl.replace('#/read/', '#/pdf/'), { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  const canv = await p.locator('canvas').count();
  rec('F-pdf-viewer', canv > 0 ? 'PASS' : 'FAIL', `canvas elements=${canv}`);
  await p.screenshot({ path: 'f-09-pdfview.png' });
  rec('F-console-errors-2', errs.length ? 'FAIL' : 'PASS', JSON.stringify(errs).slice(0, 300));
  await b.close();
})();
