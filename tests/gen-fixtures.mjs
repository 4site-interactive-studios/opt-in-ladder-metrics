// Deterministic synthetic fixtures for the Opt-In Ladder dashboard tests.
// Writes tests/fixtures/*.csv|tsv plus expected.json (values the e2e asserts against).
// Run: node tests/gen-fixtures.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out  = join(here, 'fixtures');
mkdirSync(out, { recursive: true });

const BOM = '﻿';
const MONTHS = ['2025-01','2025-02','2025-03','2025-04','2025-05','2025-06'];
const LADDER = [                          // configured ladder: step -> opt-in
  { id: '1001', label: 'Newsletter' },
  { id: '1002', label: 'Action Alerts' },
  { id: '1003', label: 'Wildlife Updates' },
  { id: '1004', label: 'Text Messages' },
];
const PAGES = [                           // parent pages hosting the ladder (share of submits)
  { id: '87001', name: 'Year-End Appeal',  type: 'DONATION', share: 0.50 },
  { id: '87002', name: 'Monthly Giving',   type: 'DONATION', share: 0.25 },
  { id: '88001', name: 'Save the Wolves',  type: 'ADVOCACY', share: 0.25 },
];
const STARTERS_PER_MONTH = 400;
const DEPTH_MIX = [0.60, 0.25, 0.10, 0.05];   // share of starters stopping after 1,2,3,4 steps
const GA4_COVERAGE = 0.80;                    // GA4 sees 80% of real submits
const VIEWS_PER_STARTER = 10;                 // ladder first-step page views per starter

// ---- EN transaction export ---------------------------------------------------
const csvEsc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCSV = (header, rows, { delim = ',', eol = '\n', quoteAll = false } = {}) =>
  [header, ...rows].map(r => r.map(v => quoteAll ? `"${String(v).replace(/"/g, '""')}"` : (delim === ',' ? csvEsc(v) : String(v))).join(delim)).join(eol) + eol;

const enHeader = ['Supporter ID','Campaign Date','Campaign ID','External Reference 2','TidyContact Address Record','Campaign Data 32', ...LADDER.map(l => `PG ${l.label}`)];
const enRows = [];
const enRowsByMonth = {}, enParticipantsByMonth = {};
const mediums = ['email', 'social', 'null', 'paid', 'email'];
const cd32s = ['mobile:N~tablet:N~browser:Chrome~device:MICROSOFT~os:Windows', 'mobile:Y~tablet:N~browser:Mobile Safari~device:APPLE~os:iOS',
               'mobile:N~tablet:N~browser:Safari~device:APPLE~os:MacOS', 'mobile:N~tablet:Y~browser:Chrome~device:GOOGLE~os:Android'];
const submitsByMonthStep = {};                // real submits by month and step (index = step-1)
MONTHS.forEach(m => {
  const [y, mo] = m.split('-');
  const days = new Date(+y, +mo, 0).getDate();
  let n = 0;
  submitsByMonthStep[m] = [0, 0, 0, 0];
  DEPTH_MIX.forEach((share, depthIdx) => {
    const count = Math.round(STARTERS_PER_MONTH * share);
    for (let s = 0; s < count; s++) {
      const sid = `S${m.replace('-', '')}${String(n).padStart(4, '0')}`; n++;
      const page = PAGES[n % 4 === 0 ? 2 : (n % 4 === 1 ? 1 : 0)];
      for (let step = 0; step <= depthIdx; step++) {
        const day = String(1 + ((n + step) % days)).padStart(2, '0');
        const pg = LADDER.map((_, i) => i === step ? 'Y' : '');
        enRows.push([sid, `${m}-${day}`, 'Opt-in Ladder 2025', mediums[n % mediums.length],
          `{url:https://support.example.org/page/${page.id}/${page.type === 'DONATION' ? 'donate' : 'action'}/2,ts:${m}-${day}}`,
          cd32s[n % cd32s.length], ...pg]);
        submitsByMonthStep[m][step]++;
      }
    }
  });
  enRowsByMonth[m] = submitsByMonthStep[m].reduce((a, b) => a + b, 0);
  enParticipantsByMonth[m] = n;
});
// One outlier supporter in March with 15 submissions (exercises the outlier toggle; GA4 does not see these)
for (let k = 0; k < 15; k++) enRows.push(['SOUTLIER01', `2025-03-${String(1 + k).padStart(2, '0')}`, 'Opt-in Ladder 2025', 'email',
  '{url:https://support.example.org/page/87001/donate/2,ts:2025-03-01}', cd32s[0], 'Y', '', '', '']);
enRowsByMonth['2025-03'] += 15; enParticipantsByMonth['2025-03'] += 1;
writeFileSync(join(out, 'en-transactions.csv'), toCSV(enHeader, enRows));

// ---- GA4 row model: one row per (month, page, step); 80% of real submits -----
const split = (total, shares) => {           // integer split preserving the total
  const parts = shares.map(s => Math.floor(total * s));
  let rem = total - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; rem > 0; i = (i + 1) % parts.length, rem--) parts[i]++;
  return parts;
};
const ga4 = [];                               // {month, page, step, count}
const ga4SubmitsByMonth = {};
MONTHS.forEach(m => {
  ga4SubmitsByMonth[m] = 0;
  submitsByMonthStep[m].forEach((real, stepIdx) => {
    const tracked = Math.round(real * GA4_COVERAGE);
    split(tracked, PAGES.map(p => p.share)).forEach((c, pi) => {
      if (c > 0) ga4.push({ month: m, page: PAGES[pi], step: stepIdx + 1, count: c });
      ga4SubmitsByMonth[m] += c;
    });
  });
});
const viewsByMonth = Object.fromEntries(MONTHS.map(m => [m, STARTERS_PER_MONTH * VIEWS_PER_STARTER]));

const EVENT = 'ENGRID_OPTIN_LADDER_SUBMIT';
const DIMS = {
  year:      { header: 'Year',                   value: r => r.month.slice(0, 4) },
  monthMM:   { header: 'Month',                  value: r => r.month.slice(5) },
  monthYM:   { header: 'Month',                  value: r => r.month.replace('-', '') },
  monthText: { header: 'Month',                  value: r => new Date(+r.month.slice(0, 4), +r.month.slice(5) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) },
  date:      { header: 'Date',                   value: r => r.month.replace('-', '') + (r.day || '05') },
  event:     { header: 'Event name',             value: r => r.event || EVENT },
  pType:     { header: 'Optin Parent Page Type', value: r => r.page ? r.page.type : '(not set)' },
  pName:     { header: 'Optin Parent Page Name', value: r => r.page ? r.page.name : '(not set)' },
  pId:       { header: 'Optin Parent Page ID',   value: r => r.page ? r.page.id : '(not set)' },
  label:     { header: 'Optin Label',            value: r => r.step ? LADDER[r.step - 1].label : '(not set)' },
  optId:     { header: 'Optin ID',               value: r => r.step ? LADDER[r.step - 1].id : '(not set)' },
  fsName:    { header: 'Optin First Step Name',  value: r => r.step === 1 ? LADDER[0].label : '(not set)' },
  fsId:      { header: 'Optin First Step ID',    value: r => r.step === 1 ? LADDER[0].id : '(not set)' },
};
const METRICS = {
  count:    { header: 'Event count',            value: r => r.count },
  stepSum:  { header: 'Optin Step Number',      value: r => r.step ? r.step * r.count : 0 },
  subSum:   { header: 'Optin Submission Count', value: r => r.step ? r.step * r.count : 0 },
  totalSum: { header: 'Optin Total Steps',      value: r => r.step ? LADDER.length * r.count : 0 },
};
// Aggregate rows over the chosen dimension set so every fixture keeps the exact same totals
function aggregate(rows, dimKeys) {
  const map = new Map();
  rows.forEach(r => {
    const dims = dimKeys.map(k => DIMS[k].value(r));
    const key = dims.join('|');
    const e = map.get(key) || { dims, count: 0, stepSum: 0, subSum: 0, totalSum: 0 };
    e.count += r.count; e.stepSum += METRICS.stepSum.value(r); e.subSum += METRICS.subSum.value(r); e.totalSum += METRICS.totalSum.value(r);
    map.set(key, e);
  });
  return [...map.values()];
}
const META = ['# ----------------------------------------', '# Opt-In Ladder Export', '# Ladder Submits', '# Date range: 20250101-20250630', '# ----------------------------------------', ''];
function emit(name, rows, dimKeys, metricKeys, opts = {}) {
  const agg = aggregate(rows, dimKeys);
  const header = [...dimKeys.map(k => DIMS[k].header), ...metricKeys.map(k => METRICS[k].header)];
  const body = agg.map(e => [...e.dims, ...metricKeys.map(k => opts.fmtNum ? opts.fmtNum(e[k]) : e[k])]);
  if (opts.totalsRow) body.unshift(['Totals', ...Array(dimKeys.length - 1).fill(''), ...metricKeys.map(k => agg.reduce((a, e) => a + e[k], 0))]);
  const eol = opts.eol || '\n';
  let text = toCSV(header, body, { delim: opts.delim || ',', eol, quoteAll: !!opts.quoteAll });
  if (opts.meta !== false) text = META.join(eol) + eol + text;
  if (opts.encoding === 'utf16le') writeFileSync(join(out, name), Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(text, 'utf16le')]));
  else writeFileSync(join(out, name), (opts.bom ? BOM : '') + text);
  return agg;
}
const ALL_DIMS = ['year', 'monthMM', 'event', 'pType', 'pName', 'pId', 'label', 'optId', 'fsName', 'fsId'];
const ALL_METRICS = ['count', 'stepSum', 'subSum', 'totalSum'];

emit('ga4-basic.csv', ga4, ALL_DIMS, ALL_METRICS);
emit('ga4-tsv-meta.tsv', [...ga4, { month: '2025-02', page: null, step: 2, count: 7, event: EVENT }, { month: '2025-02', page: { id: '(other)', name: '(other)', type: 'DONATION' }, step: 1, count: 5, event: EVENT }],
     ALL_DIMS, ALL_METRICS, { delim: '\t', eol: '\r\n', totalsRow: true, quoteAll: true, bom: true, fmtNum: n => n.toLocaleString('en-US') });
emit('ga4-utf16.tsv', ga4, ALL_DIMS, ALL_METRICS, { delim: '\t', encoding: 'utf16le' });
emit('ga4-yyyymm.csv', ga4, ['monthYM', 'event', 'pType', 'pName', 'pId', 'label', 'optId', 'fsName', 'fsId'], ALL_METRICS);
emit('ga4-month-text.csv', ga4, ['monthText', 'event', 'pType', 'pName', 'label', 'fsName'], ['count']);
emit('ga4-month-only.csv', ga4, ['monthMM', 'event', 'pType', 'pName', 'label', 'fsName'], ['count']);
emit('ga4-date.csv', ga4.flatMap(r => [{ ...r, day: '03', count: Math.floor(r.count / 2) }, { ...r, day: '17', count: r.count - Math.floor(r.count / 2) }]).filter(r => r.count > 0),
     ['date', 'event', 'pType', 'pName', 'pId', 'label', 'optId', 'fsName', 'fsId'], ALL_METRICS, { meta: false });
emit('ga4-notime.csv', ga4, ['event', 'pType', 'pName', 'pId', 'label', 'optId', 'fsName', 'fsId'], ALL_METRICS);
// Optin Step Number placed left of Event count (as a dimension) — must be ignored with a warning
{
  const agg = aggregate(ga4, ['year', 'monthMM', 'event', 'pName', 'label']);
  const header = ['Year', 'Month', 'Event name', 'Optin Parent Page Name', 'Optin Label', 'Optin Step Number', 'Event count', 'Optin Total Steps'];
  const body = agg.map(e => [...e.dims, LADDER.findIndex(l => l.label === e.dims[4]) + 1, e.count, e.totalSum]);
  writeFileSync(join(out, 'ga4-stepdim.csv'), META.join('\n') + '\n' + toCSV(header, body));
}
emit('ga4-tab-parent.csv', ga4, ['year', 'monthMM', 'event', 'pType', 'pName', 'pId'], ['count']);
// The README recipe: three tabs that fit GA4's five-row-dimension limit (views tab = ga4-views.csv)
emit('ga4-tab-pages.csv', ga4, ['year', 'monthMM', 'event', 'pType', 'pName'], ['count']);
emit('ga4-tab-steps.csv', ga4, ['year', 'monthMM', 'event', 'label', 'fsName'], ALL_METRICS);
emit('ga4-tab-label.csv',  ga4, ['year', 'monthMM', 'event', 'label', 'optId'], ['count', 'stepSum', 'subSum', 'totalSum']);
emit('ga4-tab-first.csv',  ga4, ['year', 'monthMM', 'event', 'fsName', 'fsId'], ['count']);
emit('ga4-shard-q1.csv', ga4.filter(r => r.month <= '2025-03'), ALL_DIMS, ALL_METRICS);
emit('ga4-shard-q2.csv', ga4.filter(r => r.month >= '2025-04'), ALL_DIMS, ALL_METRICS);
// Unfiltered tab: extra event names that must be ignored and reported
emit('ga4-unfiltered.csv', [...ga4, ...MONTHS.flatMap(m => [{ month: m, page: null, step: 0, count: 900, event: 'form_start' }, { month: m, page: null, step: 0, count: 300, event: 'scroll' }])],
     ['year', 'monthMM', 'event', 'pName', 'label', 'fsName'], ['count']);
// Ladder views tab: page_view rows only (Year, Month, Event name, Event count)
emit('ga4-views.csv', MONTHS.map(m => ({ month: m, page: null, step: 0, count: viewsByMonth[m], event: 'page_view' })), ['year', 'monthMM', 'event'], ['count']);
// Combined coverage tab: both event names in one file
emit('ga4-combined.csv', [...ga4, ...MONTHS.map(m => ({ month: m, page: null, step: 0, count: viewsByMonth[m], event: 'page_view' }))], ['year', 'monthMM', 'event'], ['count']);
// Real-world shape (seen in an NWF export): property + tab name + YYYYMMDD-YYYYMMDD header lines, "Nth month"
// instead of Month, a Grand total row whose label sits in an extra trailing cell, and a sum metric that is 0 everywhere.
{
  const jf = ga4.filter(r => r.month <= '2025-02');
  const agg = aggregate(jf, ['year', 'event', 'label', 'fsName']);
  const nth = r => String(['2025-01', '2025-02'].indexOf(r.month)).padStart(4, '0');
  const byNth = new Map();
  jf.forEach(r => { const k = [nth(r), r.step, 'x'].join('|'); });
  const rows = aggregate(jf.map(r => ({ ...r, _nth: nth(r) })), ['year', 'event', 'label', 'fsName']);
  // aggregate() has no Nth dimension, so build rows by (nth, label, first step) directly
  const map = new Map();
  jf.forEach(r => {
    const dims = [r.month.slice(0, 4), nth(r), EVENT, LADDER[r.step - 1].label, r.step === 1 ? LADDER[0].label : '(not set)'];
    const key = dims.join('|');
    const e = map.get(key) || { dims, count: 0, stepSum: 0, totalSum: 0 };
    e.count += r.count; e.stepSum += r.step * r.count; e.totalSum += LADDER.length * r.count;
    map.set(key, e);
  });
  const body = [...map.values()].map(e => [...e.dims, e.count, e.stepSum, e.totalSum, 0]);
  const tot = [...map.values()].reduce((a, e) => ({ count: a.count + e.count, stepSum: a.stepSum + e.stepSum, totalSum: a.totalSum + e.totalSum }), { count: 0, stepSum: 0, totalSum: 0 });
  const header = ['Year', 'Nth month', 'Event name', 'Optin Label', 'Optin First Step Name', 'Event count', 'Optin Step Number', 'Optin Total Steps', 'Optin Submission Count'];
  const meta = ['# ----------------------------------------', '# GA4 - Test Property - GA4', '# Opt-In Ladder Export-Ladder Steps', '# 20250101-20250228', '# ----------------------------------------', ''];
  const grand = ['', '', '', '', '', tot.count, tot.stepSum, tot.totalSum, 0, 'Grand total'];
  writeFileSync(join(out, 'ga4-real-shape.csv'), meta.join('\n') + '\n' + toCSV(header, [grand, ...body]) + '\n');
}
// Bad file: not a GA4 export at all
writeFileSync(join(out, 'not-ga4.csv'), 'foo,bar\n1,2\n');

const totalEN  = Object.values(enRowsByMonth).reduce((a, b) => a + b, 0);
const totalGA4 = Object.values(ga4SubmitsByMonth).reduce((a, b) => a + b, 0);
const Q1 = ['2025-01', '2025-02', '2025-03'];
const expected = {
  months: MONTHS, enRowsByMonth, enParticipantsByMonth, enRows: enRows.length, enSupporters: new Set(enRows.map(r => r[0])).size,
  ga4SubmitsByMonth, totalEN, totalGA4,
  coverageAll: (totalGA4 / totalEN * 100).toFixed(1) + '%',
  coverageByMonth: Object.fromEntries(MONTHS.map(m => [m, (ga4SubmitsByMonth[m] / enRowsByMonth[m] * 100).toFixed(1) + '%'])),
  coverageQ1: (Q1.reduce((a, m) => a + ga4SubmitsByMonth[m], 0) / Q1.reduce((a, m) => a + enRowsByMonth[m], 0) * 100).toFixed(1) + '%',
  viewsByMonth, totalViews: Object.values(viewsByMonth).reduce((a, b) => a + b, 0),
  startersGA4ByMonth: Object.fromEntries(MONTHS.map(m => [m, ga4.filter(r => r.month === m && r.step === 1).reduce((a, r) => a + r.count, 0)])),
  cvrRawJan: (enParticipantsByMonth['2025-01'] / viewsByMonth['2025-01'] * 100).toFixed(2) + '%',
  adjViewsJan: Math.round(viewsByMonth['2025-01'] / (ga4SubmitsByMonth['2025-01'] / enRowsByMonth['2025-01'])),
  pages: PAGES.map(p => p.name), ladder: LADDER.map(l => l.label), ladderLength: LADDER.length,
  tsvExtraSubmits: 12,
  realShapeSubmits: ga4SubmitsByMonth['2025-01'] + ga4SubmitsByMonth['2025-02'],
};
writeFileSync(join(out, 'expected.json'), JSON.stringify(expected, null, 2));
console.log(`fixtures written to ${out}: EN rows ${enRows.length}, GA4 submits ${totalGA4} / EN ${totalEN} = ${expected.coverageAll}`);
