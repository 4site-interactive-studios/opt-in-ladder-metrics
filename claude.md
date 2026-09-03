# CLAUDE.md — 4Site's Opt-In Ladder Analytics Visualizer

This file gives you everything you need to work on this codebase without asking the user to re-explain context. Read it fully before making any changes.

---

## What This Is

A single-file, zero-build, client-side analytics dashboard. The entire application lives in `index.html` — HTML structure, CSS, and JavaScript in one file. No framework, no bundler, no server. It opens directly in a browser.

**User flow:** Upload screen → drop the EN CSV (optionally together with GA4 export files) → dashboard renders → user can filter, add or remove GA4 files, enter or override GA4 pageviews, toggle outliers → everything re-renders reactively.

**The tool is built for 4Site Studios' nonprofit clients** running opt-in ladder campaigns in Engaging Networks. The "ladder" is a sequence of opt-in checkboxes shown to supporters immediately after a donation or advocacy action.

**Two data sources:**
1. **Engaging Networks "Opt-in Ladder Transactions" CSV** — required. One row per opt-in submission.
2. **GA4 Exploration export(s)** — optional. Aggregated `ENGRID_OPTIN_LADDER_SUBMIT` events (pushed by ENgrid's `OptInLadder` component into the GTM dataLayer, forwarded by GTM to GA4) and optional `page_view` rows for the ladder page. Unlocks the GA4 block, the coverage KPI/columns, and auto-filled views.

---

## Architecture

### Single-file constraints
Everything is in `index.html`. When you add features:
- CSS goes in the `<style>` block, organized by component with comment headers
- HTML shell goes in `buildDashboardShell()` as a template literal
- JS goes in the `<script>` block, organized in labeled sections with `// ════` dividers

Do not split into separate files unless explicitly asked to refactor the architecture. The `tests/` folder is separate tooling and does not count.

### Rendering model
There is no virtual DOM. The dashboard re-renders imperatively. `applyFilters()` is the central re-render trigger — it recomputes `filteredRows` and calls every render function in sequence.

**Call chain:**
```
applyFilters()
  → renderKPIs()
  → renderCharts()
  → renderTable()                (calls updateAdblockModeUI() first)
  → renderDepthTable()
  → renderPGGrid()               (if F.hasPG)
  → renderCampaignTable()        (if F.hasCampaignID)
  → renderDeviceBrowserSection() (if F.hasCD32)
  → renderGA4Sections()          (if F.hasGA4Events)
```

Each render function is fully idempotent — safe to call multiple times. Chart renders always call `dc(id)` first to destroy any existing Chart.js instance before creating a new one.

**GA4 import chain** (runs on file import, independent of the EN parse):
```
handleDroppedFiles() / #ga4-file-input change
  → importGA4Files(files)         readFileText → parseGA4Text → merge by signature into ga4Tables
    → finishGA4Ingest(warnings)
        → recomputeGA4State()     flags, ga4AutoViews, ga4Meta
        → buildGA4SectionsShell() fills the #ga4-sections placeholder (never rebuilds the whole shell)
        → buildGA4Inputs()        auto placeholders
        → renderGA4ImportReport()
        → applyFilters()
        → saveCache()
```

### Feature flags
The `F` object controls which sections render. It's populated during `processData()` (EN columns) and `recomputeGA4State()` (GA4 tables). Never hardcode feature visibility — always gate on `F.*`.

```js
const F = {
  hasPG:          false,   // PG * columns present with Y values
  hasER2:         false,   // External Reference 2 has non-null values
  hasTidyContact: false,   // TidyContact Address Record present
  hasCampaignID:  false,   // Campaign ID present
  hasCD32:        false,   // Campaign Data 32 with mobile:/browser: format
  hasGA4Events:     false, // ≥1 ENGRID_OPTIN_LADDER_SUBMIT row → GA4 block, coverage KPI
  hasGA4Time:       false, // totals table carries a month key → Period filter + coverage columns
  hasGA4Views:      false, // page_view rows with a month → ga4AutoViews filled
  hasGA4Parent:     false, // Optin Parent Page Name/ID/Type present
  hasGA4Label:      false, // Optin Label/ID present
  hasGA4FirstStep:  false, // Optin First Step Name/ID present
  hasGA4StepMetric: false, // Optin Step Number / Total Steps / Submission Count sums present
};
```

### State
All global state lives at the top of the `<script>` block:

```js
let allRows      = [];          // all parsed EN rows, never filtered
let filteredRows = [];          // current view after applyFilters()
let charts       = {};          // Chart.js instances keyed by id string
let activePgCols = [];          // PG column names that have any Y values

let outlierThreshold = Infinity; // max depth steps before a supporter is an outlier
let outlierExcluded  = 0;        // count excluded at current threshold

const ga4Views = {};             // 'YYYY-MM' → manually entered pageview count (overrides ga4AutoViews)
const CACHE_KEY = 'optin_ladder_cache';
let currentFingerprint = null;   // set after parse; used for cache matching

let   ga4Tables       = [];      // GA4Table[] — one per distinct column signature
let   ga4Meta         = null;    // import report data (enMissing, warnings)
const ga4AutoViews    = {};      // 'YYYY-MM' → page_view count from imports
let   pendingGA4Files = [];      // GA4 files dropped on the upload screen before the EN file
let   ga4AutoCorrection = false; // measured ad-blocker correction already switched on this session
```

### GA4 data model
```js
GA4Row   { kind:'submit'|'view', event, month:'YYYY-MM'|null, quarter:'YYYY-Qn'|null, _file,
           parentType, parentName, parentId, optinLabel, optinId, firstStepName, firstStepId,  // null when (not set)
           count, stepSum, totalStepsSum, submissionSum }                                     // sums may be null
GA4Table { signature, cols:{key→colIndex}, hasTime, timeSource, hasEventCol,
           files:[{name, rows, delimiter, encoding, metaLines, header, unmapped, ignoredCols, stepAsDim,
                   monthOnly, assumedSubmits, skipped:{totals,nonNumeric,shortRow,noTime}, notSet, ignoredEvents}],
           rows:GA4Row[], months:Set, submitTotal, viewTotal }
```
Rules that must hold:
- Files with the same `signature` are date shards → concatenated (`refreshGA4Table`). Files with different signatures are alternative views of the same events → **never summed**.
- `ga4TotalsTable()` (most submits, prefer `hasTime`) feeds coverage; `ga4ViewsTable()` feeds `ga4AutoViews`; `ga4TableFor(keys)` picks the table for a breakdown.
- Coverage denominators = `allRows` filtered by period only, restricted to the GA4 export's month range. Never apply Source/Campaign/Device/outlier filters to them.
- Custom ranges: EN rows filter by exact day; monthly GA4 tables compare whole overlapping months (`getCoverage` returns `wholeMonths: true` when the range cuts a month) and periods the range cuts into (`d.partial`) are starred with blank GA4 cells unless the GA4 table is day-level (`table.daily`, from `Date`/`Nth day` exports); a quarter missing whole months (`d.incomplete`) is starred but keeps GA4 figures via `clipRange`.
- `(not set)` → `null`; `(other)` stays a string label. First Step is only set on the first step of a session, so followup rows are legitimately `(not set)`.
- Step/total/submission columns are read as GA4 **sum metrics** only (`stepSum/count` = average). If one appears left of the metric block (registered as a dimension) it is ignored and reported.

---

## Key Functions Reference

### Data pipeline (EN)
| Function | Purpose |
|----------|---------|
| `handleDroppedFiles(files, {onDashboard})` | Sniffs each file (`sniffFileKind`) and routes: EN → `processFile`, GA4 → `importGA4Files` or `pendingGA4Files` |
| `processFile(file)` | PapaParse entry point; passes `file.name` to `processData` |
| `processData(data, fileName)` | Feature detection, row parsing, builds fingerprint, triggers cache check, then imports staged GA4 files |
| `parseCD32(v)` | Parses the `Campaign Data 32` string into `{deviceType, browserFamily, deviceBrand, os}` |
| `detectOutlierThreshold(rows)` | Gap-weighted scoring algorithm to find natural depth cutoff |
| `setupOutlierToggle(rows)` | Runs detection, sets `outlierThreshold`, shows/hides toggle |

### GA4 import
| Function | Purpose |
|----------|---------|
| `readFileText(file)` | ArrayBuffer → text with BOM/UTF-16 sniffing; returns `{text, encoding}` |
| `sniffFileKind(file)` | `'en'` / `'ga4'` / `'unknown'` from the first 16 KB |
| `mapGA4Header(cells)` | Header cells → `{cols, unmapped, ignored}` via `GA4_COLUMNS` aliases then regex fallbacks |
| `ga4TimeFromRow(cells, cols)` | Date / Year month / Month (YYYYMM, YYYY-MM, "Jan 2025", MM + Year) → `{month, quarter, source}` |
| `parseGA4Text(text, name, enc)` | Strips `#` metadata, detects delimiter and header row, classifies rows, builds a `GA4Table` or `{error}` |
| `importGA4Files(files)` | Parses each file, merges shards by signature, `finishGA4Ingest`, toasts |
| `removeGA4File(name)` | Drops one file's rows, re-ingests |
| `finishGA4Ingest(warnings)` | Recompute → rebuild GA4 UI → re-render → save; switches correction to measured the first time |
| `recomputeGA4State(warnings)` | Sets all `F.hasGA4*` flags, rebuilds `ga4AutoViews`, builds `ga4Meta` |
| `ga4TotalsTable()` / `ga4ViewsTable()` / `ga4TableFor(keys)` / `ga4StepTable()` | Table selection (see rules above) |
| `currentPeriodKey()` / `periodMatches(r, pk)` / `ga4RowsFor(table, pk, kind)` / `ga4GroupBy(rows, keyFn)` | Period-aware queries. A period key is `null`, `'YYYY-MM'`, `'YYYY-Qn'`, or a range object from `getRange()` (`{start, end, months, partial, label}`); rows with a `date` match by day, monthly GA4 rows by overlapping month |
| `getRange()` / `enDateBounds()` / `clipRange(range, key)` / `quarterMonths(q)` / `periodGA4Figures(d)` | Custom date range (Period = `custom`). `periodGA4Figures` gives a period row its coverage/views: partial periods only from day-level GA4 tables (`table.daily`), otherwise blank; `PARTIAL_NOTE` is the shared footnote |
| `getCoverage(pk)` | `{ga4, en, ratio, wholeExport}` or `null` |
| `getViewsForPeriod(p)` / `allViewsTotal()` | Manual `ga4Views` wins over `ga4AutoViews`; quarters sum months |
| `ga4ViewsForSelection(pk)` / `visitorRate(count, views)` | Ladder page views for the current selection and the `% of visitors` rate used by the Opt-Ins Taken and First Step cards and summary tables |
| `adblockMode()` / `getAdjustedViews(raw, p)` / `adjHeaderSuffix()` / `impliedUpliftLabel(pk)` / `updateAdblockModeUI()` / `onAdblockModeChange()` | Ad-blocker correction: `off` / `manual` (slider) / `measured` (views ÷ coverage, ratio clamped to [0.2, 1]) |
| `buildGA4Meta(warnings)` / `renderGA4ImportReport()` | Import report inside the GA4 Data panel |
| `buildGA4SectionsShell()` / `renderGA4Sections()` | The GA4 block (Ladder Entry Pages, Entry Page Type, Opt-Ins Taken, First Step Shown, Ladder Position Averages) |
| `ga4StepAverages(rows)` / `ga4SummaryData(pk)` | Shared numbers for cards and the executive summary |
| `esc(s)` / `ga4PageTypeLabel(t)` / `quarterOf(month)` / `parseGA4Number(v)` / `normHeader(h)` | Helpers. Every GA4 string written to the DOM or clipboard HTML goes through `esc` |

### Filters & render cycle
| Function | Purpose |
|----------|---------|
| `populateFilters()` | Builds all `<select>` options from `allRows` |
| `applyFilters()` | Reads all filter UI state, rebuilds `filteredRows`, calls all renderers |
| `getPeriodData()` | Aggregates `filteredRows` into per-period objects `{period, label, participants, optins, ratio, oneStepPct, multiStepPct}` |
| `getDepthMap(rows)` | Returns `{supporterID → submissionCount}` map |

### Chart renderers
| Function | Purpose |
|----------|---------|
| `renderCharts()` | Timeseries (dual-axis), Traffic Source, Source Page Type, Depth Distribution |
| `renderDeviceBrowserSection()` | Device Type bar, Browser hbar, Brand hbar, Device-over-time stacked bar |
| `renderGA4Sections()` | GA4 hbars, Entry Page Type chart (`chart-ga4-parent-type`), step pills, scope badges |
| `dc(id)` | Destroy Chart.js instance by key before re-render |
| `hbar(containerId, entries, color, opts)` | Renders a custom HTML horizontal bar list (labels are escaped); `opts.extra(label, count)` adds a trailing cell, used for `% of visitors` |

### Table renderers
| Function | Purpose |
|----------|---------|
| `renderTable()` | Period Breakdown table with optional coverage and GA4 views/CVR columns (`ga4Cells(pk, participants)` is shared by month rows and quarter subtotals) |
| `renderDepthTable(excludedCount)` | Depth steps table with outlier notice |
| `renderPGGrid()` | Preference Group chips |
| `renderCampaignTable()` | Campaign breakdown table |
| `renderKPIs()` | KPI card row (adds GA4 Coverage when `F.hasGA4Events`) |

### GA4 views / cache
| Function | Purpose |
|----------|---------|
| `buildGA4Inputs()` | Renders month input fields; imported views appear as `auto:` placeholders |
| `onGA4Input(month, raw)` | Parses input, updates `ga4Views`, toggles the `auto` class, calls `renderTable()` + `saveCache()` |
| `onAdblockToggle()` / `onAdblockSlider()` | `updateAdblockModeUI()` + `renderTable()` + `saveCache()` |
| `saveCache()` | Serializes current settings to `localStorage` (no GA4 rows) |
| `checkAndRestoreCache(fingerprint)` | Exact match → silent restore + toast; mismatch → banner |
| `applyRestoredCache(cached)` | Applies a cached payload to all UI elements (incl. `adblockMode`) and re-renders |
| `showToast(msg)` | Bottom-right notification, auto-dismisses after 3.5s |

### Executive summary
| Function | Purpose |
|----------|---------|
| `buildExecutiveSummaryHTML()` | Rich-text summary; GA4 sections gated on `F.hasGA4*`, Performance by Period gains GA4 Submits / Coverage / views columns |
| `buildExecutiveSummaryPlaintext()` | Plain-text fallback with the same GA4 blocks |
| `summaryTable()` / `sectionHeading()` / `sectionSpacer()` | Inline-styled building blocks that survive paste into a WYSIWYG |
| `summaryCore()` / `summaryDateRange()` / `summaryDrillDowns()` / `periodTableData()` | Shared inputs for both summaries: participation numbers, period labels (`dateRangeStr` matches the filter text, `longLabel` is client-facing), active filters, and the Performance by Period headers/rows |
| `shortSummaryParts()` / `buildShortSummaryHTML()` / `buildShortSummaryPlaintext()` / `textTable()` | Client-facing "Copy Short Summary": header, Participation, Engagement Quality, Entry Page Type (all rows), Top Ladder Entry Pages, Opt-Ins Taken, First Step Shown (rows ≥ `SHORT_MIN_SHARE`, `(not set)` pages hidden, `% of Visitors` when views exist, footnotes), Performance by Period. Shares stay computed on full totals |
| `copyExecutiveSummary(mode)` | `'full'` or `'short'`; picks builders, button and toast |

### Shell
| Function | Purpose |
|----------|---------|
| `buildDashboardShell()` | Writes the full `#main-content` innerHTML; conditional sections gated on `F.*`; always emits the empty `#ga4-sections` placeholder and the GA4 Data panel |
| `resetDashboard()` | Hides dashboard, shows upload screen, wipes all state (incl. GA4) + cache |

---

## Chart.js Conventions

- All charts use the `PAL` color object — never hardcode hex values in chart configs
- All charts spread `BASE` config and override only what they need
- Charts that show a legend set `plugins.legend.position:'top'` explicitly
- The timeseries chart uses dual Y axes: `y` (left, participants/opt-ins) and `y2` (right, depth ratio)
- `hidden: true` on a dataset renders it crossed-out in the legend but togglable by click
- Chart keys in the `charts` object must match the canvas `id` attribute exactly — `dc('chart-foo')` must match `id="chart-foo"`

```js
const PAL = {
  forest:'#1a3a2a', moss:'#2d5a40', sage:'#4a7c59', fern:'#6fa37f',
  mist:'#c8ddd0', amber:'#d4a017', gold:'#f2c84b', bark:'#8b6914'
};
```

---

## CSS Conventions

- All design tokens are CSS custom properties on `:root` — use `var(--token)` everywhere
- Component CSS is organized with comment headers: `/* ── Component name ── */`
- Chart height is controlled via `.chart-wrap` (220px), `.chart-wrap.tall` (300px), `.chart-wrap.short` (220px — same, reserved for future use)
- Animation: all chart cards use `animation: fadeUp 0.5s ease both` with staggered inline `animation-delay`
- Responsive breakpoints: `cols-4` collapses to 2 cols at 1100px; all multi-col grids collapse to 1 col at 900px
- GA4 pieces live under `/* ── GA4 import / sections ── */`: `.ga4-drop`, `.ga4-import-report`, `.ga4-col-chip`, `.ga4-block`, `.ga4-scope-badge`, `.ga4-filter-note`, `.ga4-stat-pill`, `.ga4-mode-radios`, `.hbar-list.wide`

---

## Adding a New Feature

### New column / data field (EN)
1. Add detection in `processData()` — set a `F.hasXxx` flag
2. Add parsing in the row mapper inside `processData()` — add the field to the returned row object
3. Gate any HTML in `buildDashboardShell()` on `F.hasXxx`
4. Add a render function or extend an existing one
5. Call the render function from `applyFilters()` if it needs to re-render on filter changes

### New GA4 breakdown
1. Add the column to `GA4_COLUMNS` (aliases = normalised GA4 display names, plus a regex fallback) and to `GA4_KEY_LABEL`; add the field to the row object in `parseGA4Text` and to `GA4_DIM_KEYS` if it is a dimension
2. Add a `F.hasGA4Xxx` flag set in `recomputeGA4State()` via `ga4TableFor([...keys])`
3. Add the card markup in `buildGA4SectionsShell()` (with a `data-scope` badge) and its render in `renderGA4Sections()` using `ga4RowsFor(table, pk)` + `ga4GroupBy`
4. Add the numbers to `ga4SummaryData()` and the section to both summary builders
5. Add a fixture column in `tests/gen-fixtures.mjs` and an assertion in `tests/e2e.mjs`

### New chart
1. Add a canvas element in `buildDashboardShell()` with a unique `id`
2. Add a `dc('your-chart-id')` + `new Chart(...)` block in the appropriate render function
3. Use `PAL` for colors, spread `BASE` for options
4. Match the key in `charts['your-chart-id']` exactly to the canvas id

### New KPI
Add an object to the `kpis` array in `renderKPIs()`. Use an existing `accent-*` class or none.

### New filter
1. Add the `<select>` HTML in the filter bar (with `style="display:none"` if conditional)
2. Show it in `populateFilters()` when the relevant `F.*` flag is true
3. Read it in `applyFilters()` and add a filter condition to the `filteredRows` filter
4. Decide explicitly whether it applies to GA4 data (today only Period does) and update the filter note copy

---

## Outlier Algorithm Detail

The algorithm finds the largest "break" in the distribution of supporter depths. It looks for two things simultaneously: a large relative population drop (most supporters stop before this depth) and a sequence gap (no supporters land on intervening depth values). Multiplying these together with `seqGap^1.5` weighting means isolated high-depth outliers score far above gradual tails.

```js
score = relDrop * Math.pow(seqGap, 1.5)
```

Fires only when `relDrop > 4 OR seqGap > 1`. Threshold gets +2 grace steps added to avoid clipping genuine edge cases. The toggle only appears in the UI when the algorithm finds at least one outlier to exclude.

---

## Cache Fingerprint

```
fingerprint = `${fileName}|${allRows.length}|${firstMonth}|${lastMonth}`
```

This is intentionally loose — it matches re-uploads of the same EN export but does not attempt to detect partial re-exports of the same data. If the filename changes or the row count changes, it's treated as a different file and a mismatch banner is shown.

The mismatch banner lets the user import anyway (e.g., they renamed the file or pulled a slightly updated export but their GA4 data is still valid) or start fresh.

Payload: `{fingerprint, outlierEnabled, ga4Views, adblockOn, adblockPct, adblockMode, savedAt}`. GA4 tables are deliberately not cached (size, and re-dropping the file is the workflow); when `adblockMode` is `measured` but no GA4 data is loaded, `adblockMode()` falls back to `manual`.

---

## Testing

```
bash tests/vendor.sh          # once: fetch PapaParse / Chart.js / html2canvas into tests/vendor (git-ignored)
node tests/gen-fixtures.mjs   # synthetic EN CSV + GA4 exports + expected.json into tests/fixtures (git-ignored)
node tests/e2e.mjs            # headless Chromium via Playwright; screenshots land in tests/output
```

`e2e.mjs` loads `index.html` from `file://`, routes the CDN URLs to the vendored files, and drives the real file inputs. It covers EN-only, EN + GA4, the Period/granularity/Source/outlier interactions with coverage, auto views and manual override, both ad-blocker modes, the executive summary (HTML and plaintext), every export edge case (metadata lines, Totals row, thousands separators, TSV, UTF-16, BOM, all time formats, no time, step-as-dimension, unfiltered events, combined tabs), alternative-view tabs, date shards, duplicates, staging GA4 before the EN file, bad files, and reset. Playwright resolves from local `node_modules` or the global install at `/opt/node22/lib/node_modules` (override with `PLAYWRIGHT_GLOBAL`); Chromium from `CHROMIUM_PATH` or `/opt/pw-browsers/chromium`.

If a real GA4 export from a client parses differently than the fixtures (different metadata lines, a totals row placed elsewhere), adjust `parseGA4Text` and add the shape to `gen-fixtures.mjs`.

---

## What Not to Do

- **Don't use `innerHTML` for untrusted content.** All dynamic HTML uses controlled template literals from parsed CSV data. GA4 labels and page names are free text — always route them through `esc()`.
- **Don't add `return` statements in `applyFilters()` early exits.** All render functions need to run together to keep the dashboard consistent.
- **Don't cache Chart.js instances by canvas element reference.** Always key them by string id in the `charts` object so `dc()` can destroy them reliably.
- **Don't add `margin-bottom` to `.ga4-panel` in CSS.** The panel is now embedded inside the Period Breakdown card — spacing is handled by the card padding. Use inline styles for the panel's top margin.
- **Don't show the outlier toggle if `outlierExcluded === 0`.** An empty toggle is confusing. The `setupOutlierToggle()` function already handles this — don't override it.
- **Don't rebuild the dashboard shell on a GA4 import.** It would destroy the adblock toggle/slider state and all charts. Fill `#ga4-sections` via `buildGA4SectionsShell()` instead.
- **Don't sum GA4 tables with different signatures**, and don't present the GA4 sum metrics as counts.
- **Don't apply Source/Campaign/Device/outlier filters to GA4 data or to coverage denominators.** GA4 rows are aggregated and carry none of those attributes.
- **Don't split the file** unless the user explicitly asks for a multi-file refactor. The single-file architecture is a product feature.

---

## Engaging Networks Export Notes

The export is called **"Opt-in Ladder Transactions"** in the EN report interface. Key quirks:

- `Campaign Data 32` is a tilde-delimited key:value string: `mobile:N~tablet:N~browser:Chrome~device:APPLE~os:MacOS`
- `TidyContact Address Record` is a structured blob — the ladder entry page URL is extracted via `url:(https?://[^,}]+)`
- `External Reference 2` stores utm_medium; values of `"null"` (the string) should be treated as missing
- `PG *` columns are named `PG ` + group name and contain `"Y"` or empty string — never a boolean
- Date format is always `YYYY-MM-DD`
- One row = one opt-in submission. A supporter with 3 opt-ins appears 3 times with the same `Supporter ID`

## GA4 Export Notes

- Exports come from a GA4 Exploration (free form) via Export → Download CSV/TSV. Expect optional leading `#` metadata lines, a possible `Totals` row, `(not set)` / `(other)` values, and numbers that may be quoted with thousands separators. TSV downloads may be UTF-16.
- Columns are matched by GA4 **display name** of the custom definitions: `Optin Parent Page Type/Name/ID`, `Optin Label`, `Optin ID`, `Optin First Step Name/ID` (dimensions) and `Optin Step Number`, `Optin Submission Count`, `Optin Total Steps` (sum metrics), plus `Event name`, `Event count`, `Views`, and the time dimensions.
- GA4 lists dimensions before metrics; the first `Event count` / `Views` column marks the metric block. Anything left of it is a dimension.
- GA4's `Month` dimension is a two-digit value — the exploration needs `Year` too (or use `Date` = YYYYMMDD). `Year month` (YYYYMM) is also accepted.
- A real export (NWF, Sep 2026) looked like: `# ----`, `# <property name>`, `# <exploration>-<tab>`, `# 20260701-20260831`, `# ----`, blank, header, then `,,,,,7178,38547,114848,0,Grand total` (label in an extra trailing cell), then rows. `parseGA4Text` reads the range line (used to date `Nth month` / `Nth day`), takes the second non-range header line as the file label (downloads are all `download.csv`), and recognises the trailing-label total row.
- A sum metric that is 0 on every row is nulled and reported (`file.zeroMetrics`); seen for `Optin Submission Count` because GTM's variable reads `ENGRID_OPTIN_LADDER_SUBMISSION_COUNT`, which ENgrid pushes after the event.
- Files carry a numeric `id` (rows reference it as `_fid`); removal and duplicate detection use it, never the file name.
- The event contract (ENgrid `optin-ladder.js` → GTM tag "GA4 Event - Opt-In Ladder Submit"): dataLayer variables `ENGRID_OPTIN_LADDER_PARENT_ID/NAME/TYPE`, `ENGRID_OPTIN_LADDER_FIRST_STEP_ID/NAME` (first step only), `ENGRID_OPTIN_LADDER_SUBMISSION_COUNT`; event `ENGRID_OPTIN_LADDER_SUBMIT` with `opt_in_label`, `opt_in_id`, `opt_in_step`, `opt_in_total_steps`, `submission_count`. Page types come from ENgrid `getPageType()`: DONATION, ADVOCACY, SURVEY, EMAILTOTARGET, ECARD, SUBSCRIBEFORM, EVENT, SUPPORTERHUB, UNSUBSCRIBE, TWEETPAGE, UNKNOWN.
- The full per-client setup recipe lives in `README.md` → "GA4 Exploration Setup Guide".
