// Headless Chromium checks for the dashboard's GA4 import feature.
// Run:  bash tests/vendor.sh && node tests/gen-fixtures.mjs && node tests/e2e.mjs
// Needs Playwright (local node_modules, or a global install at PLAYWRIGHT_GLOBAL / /opt/node22/lib/node_modules).
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const FX   = join(here, 'fixtures');
const OUT  = join(here, 'output'); mkdirSync(OUT, { recursive: true });
const expected = JSON.parse(readFileSync(join(FX, 'expected.json'), 'utf8'));

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = createRequire(process.env.PLAYWRIGHT_GLOBAL || '/opt/node22/lib/node_modules/_.js')('playwright')); }

const VENDOR = { PapaParse: 'papaparse.min.js', 'Chart.js': 'chart.umd.min.js', html2canvas: 'html2canvas.min.js' };
const exe = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath: exe });

let failures = 0, passes = 0;
function check(name, cond, detail = '') {
  if (cond) { passes++; console.log(`  ok   ${name}`); }
  else { failures++; console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ''}`); }
}

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(/cdnjs\.cloudflare\.com/, route => {
    const url = route.request().url();
    const file = Object.entries(VENDOR).find(([k]) => url.includes(k))?.[1];
    if (!file) return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(join(here, 'vendor', file)) });
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(pathToFileURL(join(root, 'index.html')).href);
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
  return { page, errors };
}
async function loadEN(page, extra = []) {
  await page.setInputFiles('#file-input', [join(FX, 'en-transactions.csv'), ...extra.map(f => join(FX, f))]);
  await page.waitForSelector('#dashboard', { state: 'visible' });
  await page.waitForFunction(() => allRows.length > 0);
  if (extra.length) await page.waitForFunction(() => pendingGA4Files.length === 0 && ga4Tables.length > 0);
  await page.waitForTimeout(150);
}
async function addGA4(page, files) {
  const before = await page.evaluate(() => ga4Tables.reduce((a, t) => a + t.files.length, 0));
  await page.setInputFiles('#ga4-file-input', files.map(f => join(FX, f)));
  await page.waitForFunction(b => ga4Tables.reduce((a, t) => a + t.files.length, 0) > b || document.querySelector('.toast'), before);
  await page.waitForTimeout(150);
}
const headers   = page => page.$$eval('#period-table-head th', ths => ths.map(t => t.textContent.trim()));
const firstRow  = page => page.$$eval('#period-table-body tr', trs => [...trs[0].children].map(td => td.textContent.trim()));
const kpi       = (page, label) => page.evaluate(l => { const c = [...document.querySelectorAll('.kpi-card')].find(k => k.querySelector('.kpi-label').textContent === l); return c ? { value: c.querySelector('.kpi-value').textContent, sub: c.querySelector('.kpi-sub').textContent } : null; }, label);
const flags     = page => page.evaluate(() => ({ ...F }));
const warnings  = page => page.evaluate(() => ga4Meta ? ga4Meta.warnings : []);
const tableInfo = (page, i = 0) => page.evaluate(i => {
  const t = ga4Tables[i]; if (!t) return null; const f = t.files[0];
  return { signature: t.signature, hasTime: t.hasTime, timeSource: t.timeSource, months: [...t.months].sort(), submitTotal: t.submitTotal, viewTotal: t.viewTotal,
           files: t.files.map(f => f.name), delimiter: f.delimiter, encoding: f.encoding, skipped: f.skipped, notSet: f.notSet, ignoredEvents: f.ignoredEvents,
           unmapped: f.unmapped, ignoredCols: f.ignoredCols, stepAsDim: f.stepAsDim, monthOnly: f.monthOnly, metaLines: f.metaLines, zeroMetrics: f.zeroMetrics, rangeText: f.rangeText, label: f.label };
}, i);

console.log('\n1. EN only');
{
  const { page, errors } = await newPage();
  await loadEN(page);
  const f = await flags(page);
  check('no GA4 flags', !f.hasGA4Events && !f.hasGA4Views && !f.hasGA4Time);
  check('no GA4 block', (await page.$('#ga4-block')) === null);
  check('6 base table headers', (await headers(page)).length === 6, (await headers(page)).join('|'));
  check('KPI count 6', (await page.$$('.kpi-card')).length === 6);
  check('rows parsed', await page.evaluate(() => allRows.length) === expected.enRows);
  check('mode radios hidden', await page.evaluate(() => !document.getElementById('adblock-mode-radios').classList.contains('visible')));
  check('import report empty', await page.evaluate(() => document.getElementById('ga4-import-report').innerHTML === ''));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(OUT, 'dashboard-en-only.png'), fullPage: true });
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

console.log('\n2. EN + basic GA4 dropped together');
{
  const { page, errors } = await newPage();
  await loadEN(page, ['ga4-basic.csv']);
  const f = await flags(page);
  check('flags: events/time/parent/label/firststep/stepmetric, no views',
        f.hasGA4Events && f.hasGA4Time && f.hasGA4Parent && f.hasGA4Label && f.hasGA4FirstStep && f.hasGA4StepMetric && !f.hasGA4Views, JSON.stringify(f));
  const t = await tableInfo(page);
  check('CSV utf-8, Year+Month, 6 months', t.delimiter === 'CSV' && t.encoding === 'UTF-8' && t.timeSource === 'Year + Month' && t.months.length === 6, JSON.stringify(t));
  check('submit total', t.submitTotal === expected.totalGA4, `${t.submitTotal} vs ${expected.totalGA4}`);
  check('meta lines captured', t.metaLines.length >= 3, JSON.stringify(t.metaLines));
  check('file label from header tab line', t.label === 'Ladder Submits', t.label);
  check('no unmapped columns', t.unmapped.length === 0, JSON.stringify(t.unmapped));
  check('first step (not set) reported for followup steps', t.notSet.firstStepName > 0);
  const k = await kpi(page, 'GA4 Coverage');
  check('coverage KPI all time', k && k.value === expected.coverageAll, JSON.stringify(k));
  check('entry pages hbar 3 items', (await page.$$('#hbar-ga4-parent .hbar-item')).length === 3);
  check('labels hbar 4 items', (await page.$$('#hbar-ga4-label .hbar-item')).length === 4);
  check('no visitor-rate cells without views', (await page.$$('#hbar-ga4-label .hbar-extra')).length === 0);
  check('first step hbar 1 item', (await page.$$('#hbar-ga4-first-step .hbar-item')).length === 1);
  check('type chart exists', await page.evaluate(() => !!charts['chart-ga4-parent-type']));
  const pills = await page.$$eval('#ga4-step-stats .ga4-stat-value', els => els.map(e => e.textContent));
  check('3 step pills, ladder length 4.0', pills.length === 3 && pills[1] === '4.0', pills.join(','));
  const h = await headers(page);
  check('coverage headers present, no views headers', h.includes('GA4 Submits') && h.includes('Coverage') && !h.includes('GA4 Views'), h.join('|'));
  check('measured mode auto-enabled', await page.evaluate(() => document.getElementById('adblock-mode-radios').classList.contains('visible') && adblockMode() === 'measured'));
  check('panel opened', await page.evaluate(() => document.getElementById('ga4-panel').classList.contains('open')));
  check('report has column chips', (await page.$$('#ga4-import-report .ga4-col-chip')).length >= 12);
  check('first step sub shows starters', (await page.textContent('#ga4-first-step-sub')).includes('GA4 ladder starters'));

  await page.selectOption('#filter-period', 'm:2025-03'); await page.waitForTimeout(100);
  check('coverage KPI March', (await kpi(page, 'GA4 Coverage')).value === expected.coverageByMonth['2025-03'], JSON.stringify(await kpi(page, 'GA4 Coverage')));
  check('scope badge filtered', (await page.textContent('#ga4-scope-badge')).startsWith('Filtered to Mar 2025'), await page.textContent('#ga4-scope-badge'));
  await page.selectOption('#filter-period', 'q:2025-Q1'); await page.waitForTimeout(100);
  check('coverage KPI Q1', (await kpi(page, 'GA4 Coverage')).value === expected.coverageQ1);
  await page.selectOption('#filter-period', 'all');
  await page.selectOption('#filter-granularity', 'quarterly'); await page.waitForTimeout(100);
  check('quarterly view keeps coverage column', (await headers(page)).includes('Coverage'));
  const qrow = await firstRow(page);
  check('quarterly Q1 coverage cell', qrow[7] === expected.coverageQ1, JSON.stringify(qrow));
  await page.selectOption('#filter-granularity', 'monthly');
  await page.selectOption('#filter-source', 'email'); await page.waitForTimeout(100);
  check('filter note active with source filter', await page.evaluate(() => document.getElementById('ga4-filter-note').classList.contains('active')));
  check('coverage unaffected by source filter', (await kpi(page, 'GA4 Coverage')).value === expected.coverageAll);
  await page.selectOption('#filter-source', 'all');
  await page.evaluate(() => document.getElementById('outlier-toggle').click()); await page.waitForTimeout(100);
  check('coverage unaffected by outlier toggle', (await kpi(page, 'GA4 Coverage')).value === expected.coverageAll);
  await page.evaluate(() => document.getElementById('outlier-toggle').click());

  const html = await page.evaluate(() => buildExecutiveSummaryHTML());
  check('summary HTML has GA4 sections', ['GA4 Tracking Coverage', 'Ladder Entry Pages (GA4)', 'Opt-Ins Taken (GA4)', 'First Step Shown (GA4)', 'Ladder Position Averages (GA4)', '>Coverage<', 'GA4 Submits'].every(s => html.includes(s)));
  const txt = await page.evaluate(() => buildExecutiveSummaryPlaintext());
  check('summary text has GA4 blocks', txt.includes('GA4 TRACKING COVERAGE') && txt.includes('LADDER ENTRY PAGES (GA4)') && txt.includes('GA4: Ladder Submits'), txt.slice(0, 400));

  await addGA4(page, ['ga4-views.csv']);
  const f2 = await flags(page);
  check('views tab → hasGA4Views', f2.hasGA4Views && f2.hasGA4Events);
  check('two tables (different signatures)', await page.evaluate(() => ga4Tables.length) === 2);
  check('6 auto placeholders', (await page.$$('.ga4-month-field.auto')).length === 6);
  const newsletterRate = (Object.values(expected.startersGA4ByMonth).reduce((a, b) => a + b, 0) / expected.totalViews * 100).toFixed(2) + '%';
  check('visitor-rate cells on Opt-Ins Taken and First Step', (await page.$$('#hbar-ga4-label .hbar-extra')).length === 4 && (await page.$$eval('#hbar-ga4-label .hbar-extra', els => els[0].textContent)) === newsletterRate && (await page.$$eval('#hbar-ga4-first-step .hbar-extra', els => els[0].textContent)) === newsletterRate, await page.$$eval('#hbar-ga4-label .hbar-extra', els => els.map(e => e.textContent)).then(v => v.join('|')));
  check('legend names the visitor denominator', (await page.textContent('#ga4-label-legend')).includes(expected.totalViews.toLocaleString('en-US')));
  const h2 = await headers(page);
  check('views/CVR headers with measured adj', ['GA4 Views', 'Adj. Views (measured)', 'CVR (raw)', 'CVR (adj.)'].every(x => h2.includes(x)), h2.join('|'));
  const jan = await firstRow(page);
  check('Jan CVR raw', jan[10] === expected.cvrRawJan, JSON.stringify(jan));
  check('Jan adj views = raw ÷ coverage', jan[9] === expected.adjViewsJan.toLocaleString('en-US'), JSON.stringify(jan));
  await page.fill('#ga4-2025-01', '5000'); await page.dispatchEvent('#ga4-2025-01', 'change'); await page.waitForTimeout(100);
  const jan2 = await firstRow(page);
  check('manual override wins', jan2[8] === '5,000' && jan2[10] === (expected.enParticipantsByMonth['2025-01'] / 5000 * 100).toFixed(2) + '%', JSON.stringify(jan2));
  check('manual field not auto', await page.evaluate(() => !document.getElementById('ga4-2025-01').classList.contains('auto')));
  await page.fill('#ga4-2025-01', ''); await page.dispatchEvent('#ga4-2025-01', 'change'); await page.waitForTimeout(100);
  check('cleared → back to auto', await page.evaluate(() => document.getElementById('ga4-2025-01').classList.contains('auto') && ga4Views['2025-01'] === undefined));
  await page.check('input[name="adblock-mode"][value="manual"]'); await page.waitForTimeout(100);
  check('manual mode header', (await headers(page)).includes('Adj. Views (+25%)'), (await headers(page)).join('|'));
  const sum2 = await page.evaluate(() => buildExecutiveSummaryHTML());
  check('summary period table has GA4 Views + Start Rate', sum2.includes('GA4 Views') && sum2.includes('Start Rate'));
  check('summary has % of Visitors columns', (sum2.match(/% of Visitors/g) || []).length >= 2 && (await page.evaluate(() => buildExecutiveSummaryPlaintext())).includes('of visitors'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(OUT, 'dashboard-ga4.png'), fullPage: true });
  await page.locator('.kpi-row').screenshot({ path: join(OUT, 'kpi-row-ga4.png') });
  await page.locator('#ga4-panel').screenshot({ path: join(OUT, 'ga4-panel.png') });
  await page.locator('#ga4-block').screenshot({ path: join(OUT, 'ga4-block.png') });
  await page.evaluate(html => { const d = document.createElement('div'); d.id = '__summary'; d.style.cssText = 'background:#fff;padding:24px;max-width:720px'; d.innerHTML = html; document.body.appendChild(d); }, sum2);
  await page.locator('#__summary').screenshot({ path: join(OUT, 'summary-ga4.png') });
  await page.evaluate(() => document.getElementById('__summary').remove());
  await page.click('.ga4-remove[data-name="ga4-views.csv"]'); await page.waitForTimeout(150);
  check('views removed → flag off, headers back', !(await flags(page)).hasGA4Views && !(await headers(page)).includes('GA4 Views'));
  await page.evaluate(() => resetDashboard());
  check('reset clears GA4 state', await page.evaluate(() => ga4Tables.length === 0 && !F.hasGA4Events && Object.keys(ga4AutoViews).length === 0 && ga4Meta === null));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

console.log('\n3. Edge fixtures');
const totalViews = expected.totalViews;
const edge = [
  ['ga4-tsv-meta.tsv',  (t) => check('tsv: TSV/UTF-8 BOM, totals skipped, thousands parsed, (not set)/(other) rows kept', t.delimiter === 'TSV' && t.encoding === 'UTF-8' && t.skipped.totals === 1 && t.submitTotal === expected.totalGA4 + expected.tsvExtraSubmits && t.timeSource === 'Year + Month', JSON.stringify(t))],
  ['ga4-utf16.tsv',     (t) => check('utf16: decoded', t.encoding === 'UTF-16LE' && t.submitTotal === expected.totalGA4 && t.months.length === 6, JSON.stringify(t))],
  ['ga4-yyyymm.csv',    (t) => check('yyyymm month', t.timeSource === 'Month (YYYYMM)' && t.months.length === 6, JSON.stringify(t))],
  ['ga4-month-text.csv',(t) => check('text month', t.timeSource === 'Month (text)' && t.months.length === 6 && t.submitTotal === expected.totalGA4, JSON.stringify(t))],
  ['ga4-date.csv',      (t) => check('date YYYYMMDD, no meta', t.timeSource === 'Date' && t.months.length === 6 && t.submitTotal === expected.totalGA4 && t.metaLines.length === 0, JSON.stringify(t))],
  ['ga4-month-only.csv',(t, w) => check('month without year → no time + warning', !t.hasTime && t.monthOnly && w.some(x => /Add Year/.test(x)), JSON.stringify({ t, w }))],
  ['ga4-notime.csv',    (t, w) => check('no time cols → hasTime false + warning', !t.hasTime && t.months.length === 0 && t.submitTotal === expected.totalGA4 && w.some(x => /no usable time/.test(x)), JSON.stringify({ t, w }))],
  ['ga4-stepdim.csv',   (t, w, f) => check('step as dimension ignored + warning, total steps still a metric', t.stepAsDim.length === 1 && t.stepAsDim[0] === 'Optin Step Number' && w.some(x => /were ignored/.test(x)) && t.submitTotal === expected.totalGA4 && f.hasGA4StepMetric, JSON.stringify({ t, w }))],
  ['ga4-unfiltered.csv',(t) => check('extra events ignored + reported', t.ignoredEvents.form_start === 6 && t.ignoredEvents.scroll === 6 && t.submitTotal === expected.totalGA4, JSON.stringify(t))],
  ['ga4-real-shape.csv',(t, w) => check('real export shape: Nth month dated from header range, Grand total row, all-zero metric dropped', t.hasTime && t.timeSource === 'Nth month' && JSON.stringify(t.months) === JSON.stringify(['2025-01', '2025-02']) && t.skipped.totals === 1 && t.skipped.shortRow === 0 && t.submitTotal === expected.realShapeSubmits && t.zeroMetrics.includes('Optin Submission Count') && t.rangeText === '2025-01-01 → 2025-02-28' && w.some(x => /0 in every row/.test(x)), JSON.stringify({ t, w }))],
  ['ga4-combined.csv',  (t, w, f) => check('combined submit+page_view tab', t.submitTotal === expected.totalGA4 && t.viewTotal === totalViews && f.hasGA4Views && f.hasGA4Events && !f.hasGA4Parent, JSON.stringify({ t, f }))],
];
for (const [file, assert] of edge) {
  const { page, errors } = await newPage();
  await loadEN(page, [file]);
  const t = await tableInfo(page), w = await warnings(page), f = await flags(page);
  assert(t, w, f);
  if (file === 'ga4-notime.csv') {
    const badge = await page.textContent('#ga4-scope-badge'), h = await headers(page), k = await kpi(page, 'GA4 Coverage');
    check('notime: badge entire export, no coverage headers, KPI says entire export', badge === 'Entire export range' && !h.includes('Coverage') && k.sub.includes('entire export'), JSON.stringify({ badge, h, k }));
  }
  if (file === 'ga4-real-shape.csv') {
    check('real shape: only two step pills (zero metric hidden)', (await page.$$('#ga4-step-stats .ga4-stat-pill')).length === 2);
  }
  if (file === 'ga4-tsv-meta.tsv') {
    const labels = await page.$$eval('#hbar-ga4-parent .hbar-label', els => els.map(e => e.textContent));
    check('tsv: (other) kept as a page label, (not set) last', labels.includes('(other)') && labels[labels.length - 1] === '(not set)', labels.join('|'));
  }
  check(`no page errors (${file})`, errors.length === 0, errors.join(' | '));
  await page.close();
}

console.log('\n4. Alternative-view tabs and date shards');
{
  const { page, errors } = await newPage();
  await loadEN(page, ['ga4-tab-parent.csv', 'ga4-tab-label.csv', 'ga4-tab-first.csv']);
  await page.waitForFunction(() => ga4Tables.length === 3);
  const f = await flags(page);
  check('three tables, all breakdown flags', f.hasGA4Parent && f.hasGA4Label && f.hasGA4FirstStep && f.hasGA4StepMetric, JSON.stringify(f));
  check('coverage not summed across tabs', (await kpi(page, 'GA4 Coverage')).value === expected.coverageAll, JSON.stringify(await kpi(page, 'GA4 Coverage')));
  check('sections rendered from their own tabs', (await page.$$('#hbar-ga4-parent .hbar-item')).length === 3 && (await page.$$('#hbar-ga4-label .hbar-item')).length === 4 && (await page.$$('#hbar-ga4-first-step .hbar-item')).length === 1);
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}
{
  const { page, errors } = await newPage();
  await loadEN(page, ['ga4-shard-q1.csv', 'ga4-shard-q2.csv']);
  await page.waitForFunction(() => ga4Tables.length >= 1 && ga4Tables[0].files.length === 2);
  const t = await tableInfo(page);
  check('shards merged into one table, 6 months, full total', await page.evaluate(() => ga4Tables.length) === 1 && t.months.length === 6 && t.submitTotal === expected.totalGA4, JSON.stringify(t));
  await addGA4(page, ['ga4-shard-q1.csv']);
  const w = await warnings(page);
  check('duplicate file skipped with warning', w.some(x => /already imported/.test(x)) && (await tableInfo(page)).submitTotal === expected.totalGA4, JSON.stringify(w));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

{
  const { page, errors } = await newPage();
  await loadEN(page, ['ga4-tab-pages.csv', 'ga4-tab-steps.csv', 'ga4-views.csv']);
  await page.waitForFunction(() => ga4Tables.length === 3);
  const f = await flags(page);
  check('README recipe (pages + steps + views tabs): all flags', f.hasGA4Parent && f.hasGA4Label && f.hasGA4FirstStep && f.hasGA4StepMetric && f.hasGA4Views && f.hasGA4Time, JSON.stringify(f));
  check('recipe: coverage + every card populated', (await kpi(page, 'GA4 Coverage')).value === expected.coverageAll && (await page.$$('#hbar-ga4-parent .hbar-item')).length === 3 && (await page.$$('#hbar-ga4-label .hbar-item')).length === 4 && (await page.$$('#hbar-ga4-first-step .hbar-item')).length === 1 && (await page.$$('#ga4-step-stats .ga4-stat-pill')).length === 3);
  check('recipe: views auto-filled + CVR columns', (await headers(page)).includes('CVR (raw)') && (await page.$$('.ga4-month-field.auto')).length === 6);
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

console.log('\n5. Upload-screen staging, bad file, dashboard drop');
{
  const { page, errors } = await newPage();
  await page.setInputFiles('#file-input', [join(FX, 'ga4-basic.csv')]);
  await page.waitForFunction(() => document.getElementById('parse-status').textContent.includes('staged'));
  check('GA4-only drop is staged', true);
  await loadEN(page);
  await page.waitForFunction(() => F.hasGA4Events);
  check('staged GA4 imported after EN', (await kpi(page, 'GA4 Coverage')).value === expected.coverageAll);
  await addGA4(page, ['not-ga4.csv']);
  check('bad file → toast, tables unchanged', await page.evaluate(() => ga4Tables.length === 1 && [...document.querySelectorAll('.toast')].some(t => /no header row/.test(t.textContent))));
  const enText = readFileSync(join(FX, 'en-transactions.csv'), 'utf8');
  await page.evaluate(async txt => { await handleDroppedFiles([new File([txt], 'en-transactions.csv', { type: 'text/csv' })], { onDashboard: true }); }, enText);
  await page.waitForTimeout(100);
  check('EN dropped on dashboard → toast, state unchanged', await page.evaluate(() => allRows.length > 0 && [...document.querySelectorAll('.toast')].some(t => /New File/.test(t.textContent))));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
