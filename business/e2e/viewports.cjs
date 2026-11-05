const ORIGIN = process.env.E2E_ORIGIN || 'http://localhost:8080';
const { setup, rec, overflow } = require('./lib.cjs');
const apps = { flowa: ORIGIN + '/jp-speed-reader/', kintore: ORIGIN + '/kintore-app/', mindrawer: ORIGIN + '/hikidashi/' };
(async () => {
  for (const dev of ['iPhone SE', 'iPhone 15 Pro Max', 'Galaxy S9+', 'iPad Mini', 'iPhone 13 landscape']) {
    for (const [k, u] of Object.entries(apps)) {
      const { b, ctx, p } = await setup(dev);
      await p.goto(u, { waitUntil: 'networkidle' });
      await p.getByRole('button', { name: 'スキップ' }).filter({ visible: true }).first().click().catch(()=>{});
      await p.waitForTimeout(400);
      const o = await overflow(p);
      // tap targets < 44px
      const small = await p.$$eval('button, a', els => els.filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && (r.height < 40 || r.width < 40)).length);
      const total = await p.$$eval('button, a', els => els.filter(e => e.offsetParent).length);
      rec(`VP-${k}-${dev.replace(/ /g,'')}`, o <= 0 ? 'PASS' : 'FAIL', `overflow=${o}px; small tap targets(<40px) ${small}/${total}`);
      if (dev === 'iPhone SE') await p.screenshot({ path: `vp-${k}-se.png` });
      if (k === 'mindrawer' && dev === 'Galaxy S9+') {
        await p.waitForTimeout(800); const sw = await p.evaluate(() => !!navigator.serviceWorker.controller);
        await ctx.setOffline(true); let ok = false;
        try { await p.reload({ waitUntil: 'load', timeout: 10000 }); ok = /しまう/.test(await p.locator('body').innerText()); } catch {}
        rec('M-offline-launch', ok ? 'PASS' : 'FAIL', `SW=${sw} offline reload ok=${ok}`);
      }
      await b.close();
    }
  }
})();
