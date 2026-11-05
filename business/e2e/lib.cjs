const { chromium, devices } = require('playwright');
const results = [];
function rec(id, status, note) { results.push({ id, status, note }); console.log(`[${status}] ${id} — ${note || ''}`); }
async function setup(dev = 'iPhone 13', opts = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices[dev], locale: 'ja-JP', ...opts });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => m.type() === 'error' && errs.push(m.text().slice(0, 200)));
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
  return { b, ctx, p, errs };
}
async function controls(p) {
  return p.$$eval('button, a, [role=button], input, textarea, select', els => els.filter(e => e.offsetParent || e.type === 'file').map(e => (e.tagName[0] + ':' + (e.getAttribute('aria-label') || e.innerText || e.placeholder || e.type || '').trim().replace(/\s+/g, ' ').slice(0, 30))));
}
async function overflow(p) { return p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); }
async function click(p, text, opt = {}) {
  const loc = p.getByRole('button', { name: text, exact: !!opt.exact }).filter({ visible: true }).first();
  await loc.click({ timeout: opt.timeout || 5000 });
}
module.exports = { setup, rec, results, controls, overflow, click };
