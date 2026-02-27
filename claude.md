# CLAUDE.md — 4Site's Opt-In Ladder Analytics Visualizer

This file gives you everything you need to work on this codebase without asking the user to re-explain context. Read it fully before making any changes.

---

## What This Is

A single-file, zero-build, client-side analytics dashboard. The entire application lives in `index.html` — HTML structure, CSS, and JavaScript in one file. No framework, no bundler, no server. It opens directly in a browser.

**User flow:** Upload screen → drop a CSV → dashboard renders → user can filter, enter GA4 data, toggle outliers → everything re-renders reactively.

**The tool is built for 4Site Studios' nonprofit clients** running opt-in ladder campaigns in Engaging Networks. The "ladder" is a sequence of opt-in checkboxes shown to supporters immediately after a donation or advocacy action.

---

## Architecture

### Single-file constraints
Everything is in `index.html`. When you add features:
- CSS goes in the `<style>` block, organized by component with comment headers
- HTML shell goes in `buildDashboardShell()` as a template literal
- JS goes in the `<script>` block, organized in labeled sections with `// ════` dividers

Do not split into separate files unless explicitly asked to refactor the architecture.

### Rendering model
There is no virtual DOM. The dashboard re-renders imperatively. `applyFilters()` is the central re-render trigger — it recomputes `filteredRows` and calls every render function in sequence.

**Call chain:**
```
applyFilters()
  → renderKPIs()
  → renderCharts()
  → renderTable()
  → renderDepthTable()
  → renderPGGrid()        (if F.hasPG)
  → renderCampaignTable() (if F.hasCampaignID)
  → renderDeviceBrowserSection() (if F.hasCD32)
```

Each render function is fully idempotent — safe to call multiple times. Chart renders always call `dc(id)` first to destroy any existing Chart.js instance before creating a new one.

### Feature flags
The `F` object controls which sections render. It's populated during `processData()` by inspecting column presence. Never hardcode feature visibility — always gate on `F.*`.

```js
const F = {
  hasPG:          false,   // PG * columns present with Y values
  hasER2:         false,   // External Reference 2 has non-null values
  hasTidyContact: false,   // TidyContact Address Record present
  hasCampaignID:  false,   // Campaign ID present
  hasCD32:        false,   // Campaign Data 32 with mobile:/browser: format
};
```

### State
All global state lives at the top of the `<script>` block:

```js
let allRows      = [];          // all parsed rows, never filtered
let filteredRows = [];          // current view after applyFilters()
let charts       = {};          // Chart.js instances keyed by id string
let activePgCols = [];          // PG column names that have any Y values

let outlierThreshold = Infinity; // max depth steps before a supporter is an outlier
let outlierExcluded  = 0;        // count excluded at current threshold

const ga4Views = {};             // 'YYYY-MM' → raw pageview count
const CACHE_KEY = 'optin_ladder_cache';
let currentFingerprint = null;   // set after parse; used for cache matching
```

---

## Key Functions Reference

### Data pipeline
| Function | Purpose |
|----------|---------|
| `processFile(file)` | PapaParse entry point; passes `file.name` to `processData` |
| `processData(data, fileName)` | Feature detection, row parsing, builds fingerprint, triggers cache check |
| `parseCD32(v)` | Parses the `Campaign Data 32` string into `{deviceType, browserFamily, deviceBrand, os}` |
| `detectOutlierThreshold(rows)` | Gap-weighted scoring algorithm to find natural depth cutoff |
| `setupOutlierToggle(rows)` | Runs detection, sets `outlierThreshold`, shows/hides toggle |

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
| `dc(id)` | Destroy Chart.js instance by key before re-render |
| `hbar(containerId, entries, color)` | Renders a custom HTML horizontal bar list (used for Browser and Brand only) |

### Table renderers
| Function | Purpose |
|----------|---------|
| `renderTable()` | Period Breakdown table with optional GA4 columns |
| `renderDepthTable(excludedCount)` | Depth steps table with outlier notice |
| `renderPGGrid()` | Preference Group chips |
| `renderCampaignTable()` | Campaign breakdown table |
| `renderKPIs()` | KPI card row |

### GA4 / cache
| Function | Purpose |
|----------|---------|
| `buildGA4Inputs()` | Renders month input fields from `allRows` months |
| `onGA4Input(month, raw)` | Parses input, updates `ga4Views`, calls `renderTable()` + `saveCache()` |
| `onAdblockToggle()` / `onAdblockSlider()` | Updates ad blocker UI state, calls `renderTable()` + `saveCache()` |
| `saveCache()` | Serializes current settings to `localStorage` |
| `checkAndRestoreCache(fingerprint)` | Exact match → silent restore + toast; mismatch → banner |
| `applyRestoredCache(cached)` | Applies a cached payload to all UI elements and re-renders |
| `showToast(msg)` | Bottom-right notification, auto-dismisses after 3.5s |

### Shell
| Function | Purpose |
|----------|---------|
| `buildDashboardShell()` | Writes the full `#main-content` innerHTML; conditional sections gated on `F.*` |
| `resetDashboard()` | Hides dashboard, shows upload screen, wipes all state + cache |

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

---

## Adding a New Feature

### New column / data field
1. Add detection in `processData()` — set a `F.hasXxx` flag
2. Add parsing in the row mapper inside `processData()` — add the field to the returned row object
3. Gate any HTML in `buildDashboardShell()` on `F.hasXxx`
4. Add a render function or extend an existing one
5. Call the render function from `applyFilters()` if it needs to re-render on filter changes

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

This is intentionally loose — it matches re-uploads of the same export but does not attempt to detect partial re-exports of the same data. If the filename changes or the row count changes, it's treated as a different file and a mismatch banner is shown.

The mismatch banner lets the user import anyway (e.g., they renamed the file or pulled a slightly updated export but their GA4 data is still valid) or start fresh.

---

## What Not to Do

- **Don't use `innerHTML` for untrusted content.** All dynamic HTML uses controlled template literals from parsed CSV data. If adding user-facing text inputs that write back to the DOM, sanitize first.
- **Don't add `return` statements in `applyFilters()` early exits.** All render functions need to run together to keep the dashboard consistent.
- **Don't cache Chart.js instances by canvas element reference.** Always key them by string id in the `charts` object so `dc()` can destroy them reliably.
- **Don't add `margin-bottom` to `.ga4-panel` in CSS.** The panel is now embedded inside the Period Breakdown card — spacing is handled by the card padding. Use inline styles for the panel's top margin.
- **Don't show the outlier toggle if `outlierExcluded === 0`.** An empty toggle is confusing. The `setupOutlierToggle()` function already handles this — don't override it.
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