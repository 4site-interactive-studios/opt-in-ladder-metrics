# 4Site's Opt-In Ladder · Analytics Visualizer

A zero-dependency, client-side analytics dashboard for visualizing Engaging Networks opt-in ladder performance. Drop in a Transaction Export CSV and get an interactive dashboard — no server, no login, no data ever leaves the browser. Optionally drop in a GA4 Exploration export alongside it to layer on tracking coverage, ladder entry pages, and auto-filled conversion rates.

Built by [4Site Studios](https://4sitestudios.com) for nonprofit digital teams.

---

## What It Does

The opt-in ladder is a fundraising pattern where a supporter who completes one action (donation, advocacy, etc.) is immediately presented with a sequence of opt-in checkboxes — joining email lists, SMS, monthly giving, preference groups. This tool visualizes how deeply supporters move through that ladder.

**Core metrics:**
- Unique participants and total opt-in submissions over time
- Depth ratio (opt-ins per participant) — the primary ladder health signal
- 1-step vs. multi-step participation rates
- Outlier detection and filtering (automated, with user override)

**Conditional features** (unlocked by columns present in the export):
- Traffic source mix via `External Reference 2` (utm_medium)
- Source page type (Donation vs. Advocacy) via `TidyContact Address Record`
- Campaign-level breakdown via `Campaign ID`
- Preference Group enrollment via `PG *` columns
- Device, browser, and brand analytics via `Campaign Data 32`
- GA4 pageview overlay and conversion rate columns (imported from a GA4 export, or entered by hand)

**GA4 enrichment** (unlocked by dropping a GA4 Exploration export — see [GA4 Event Data](#ga4-event-data-optional)):
- Tracking coverage: GA4-tracked ladder submits ÷ EN submissions, per month and overall
- Ladder entry pages and entry page type (the donation/advocacy page the ladder was embedded on)
- Opt-ins taken and first step shown, straight from the ENgrid dataLayer events
- Ladder position averages from the GA4 custom metrics
- Auto-filled monthly ladder page views → conversion rate columns, with a measured (not guessed) ad-blocker correction

---

## Getting Started

1. Open `index.html` (the dashboard file) in any modern browser
2. Export the **Opt-in Ladder Transactions** report from Engaging Networks
3. Drop the CSV onto the upload screen or click to browse
4. *(Optional)* Export the client's GA4 Exploration (see the [setup guide](#ga4-exploration-setup-guide)) and drop the CSV/TSV files too — together with the EN file, or later via **Add GA4 Export** in the top bar or the drop zone inside the **GA4 Data** panel

No build step. No npm. No server required.

---

## Required CSV Columns

| Column | Required | Notes |
|--------|----------|-------|
| `Supporter ID` | ✅ | Used to deduplicate participants |
| `Campaign Date` | ✅ | Format: `YYYY-MM-DD` |
| `External Reference 2` | Optional | utm_medium — unlocks Traffic Source chart |
| `TidyContact Address Record` | Optional | Unlocks Source Page Type chart |
| `Campaign ID` | Optional | Unlocks Campaign Breakdown table |
| `PG *` (any columns starting with `PG `) | Optional | Unlocks Preference Group grid |
| `Campaign Data 32` | Optional | Must contain `mobile:` and `browser:` — unlocks device/browser section |

The dashboard auto-detects which columns are present and shows or hides sections accordingly. Exports with only `Supporter ID` and `Campaign Date` will still produce the core KPIs, timeseries, depth distribution, and period table.

---

## GA4 Event Data (optional)

ENgrid's `OptInLadder` component pushes every ladder step submission into the GTM dataLayer as `ENGRID_OPTIN_LADDER_SUBMIT`, GTM forwards it to GA4, and GA4 stores the parameters as custom dimensions and metrics. Exporting a GA4 Exploration built on those definitions and dropping it into the dashboard unlocks the GA4 block. The EN CSV is still required; GA4 files are optional.

**What the import understands**

| GA4 export column | Comes from | Used for |
|---|---|---|
| `Event name` | GA4 | `ENGRID_OPTIN_LADDER_SUBMIT` rows are ladder submits, `page_view` rows are ladder views; other events are ignored and listed in the import report |
| `Event count` / `Views` | GA4 | The number behind every GA4 figure |
| `Optin Parent Page Type` / `Name` / `ID` | ENgrid `parent_page_*` | Ladder Entry Pages and Entry Page Type |
| `Optin Label` / `Optin ID` | ENgrid `opt_in_label` / `opt_in_id` | Opt-Ins Taken |
| `Optin First Step Name` / `ID` | ENgrid `first_step_*` (only set on the first step of a session) | First Step Shown, GA4 ladder starters, GA4 depth ratio |
| `Optin Step Number`, `Optin Total Steps`, `Optin Submission Count` | ENgrid `opt_in_step`, `opt_in_total_steps`, `submission_count` as GA4 **sum** metrics | Ladder Position Averages (each divided by tracked submits) |
| `Year` + `Month`, `Date`, `Year month`, or a `Month` written as `202501` / `Jan 2025` | GA4 time dimensions | Aligns GA4 rows to the dashboard's months and quarters |

Leading `#` metadata lines, a `Totals` row, `(not set)` / `(other)` values, quoted numbers with thousands separators, tab or comma delimiters, and UTF-8 or UTF-16 encodings are all handled. Column headers are matched by GA4 display name (case and punctuation insensitive).

**What it unlocks**

- **GA4 Coverage** KPI and `GA4 Submits` / `Coverage` columns in the Period Breakdown: tracked submits ÷ EN submissions. EN submissions here are filtered by period only, never by Source, Campaign, Device or the outlier toggle, and only months inside the GA4 export's range count. Coverage above 100% is flagged red — it means the exploration is letting extra events through (test traffic, an unfiltered tab) or the EN export is filtered.
- **Google Analytics 4 · Ladder Events** block with Ladder Entry Pages, Entry Page Type, Opt-Ins Taken, First Step Shown, and Ladder Position Averages cards. Each card appears only when its columns are present.
- **Auto-filled views**: when the export contains `page_view` rows with a time column, the monthly view inputs are pre-filled (shown as `auto: 12,400` placeholders) and the `GA4 Views` / `CVR` columns appear. Typing a value overrides that month; clearing it returns to the imported figure.
- **Measured ad-blocker correction**: once GA4 submits are loaded, the correction switches to *Measured (GA4 coverage)* — adjusted views = views ÷ coverage, clamped to at most ×5. *Manual %* keeps the slider behaviour. The badge shows the implied undercount.
- **Copy Summary** gains GA4 Tracking Coverage, Ladder Entry Pages, Entry Page Type, Opt-Ins Taken, First Step Shown and Ladder Position Averages sections, plus `GA4 Submits` / `Coverage` columns in Performance by Period.

**Reading the numbers**

- GA4 fires the submit event on every ladder step form submit, checked or not, so Opt-Ins Taken counts steps reached, not acceptances. PG chips remain the acceptance source.
- First Step values are only recorded on the first step of a session. Rows that carry one are ladder starters, so `GA4 depth ratio = tracked submits ÷ starters`, comparable to the EN depth ratio. Followup-step rows show as `(not set)` for First Step; that is expected.
- Start Rate (in the summary) = GA4 starters ÷ GA4 ladder views. Both sides are undercounted by the same blockers, so the ratio needs no correction.
- Custom definitions only collect data from the day they were registered.

**Several files**

Files with the *same* columns are treated as date shards and concatenated (overlapping months are flagged). Files with *different* columns are alternative views of the same events and are never summed: coverage always comes from the table with the most submits (preferring one with a time column), views from the table with the most `page_view` rows, and each card from the table that carries its dimension. Remove a file with the ✕ on its chip in the import report.

**Import report**

Inside the GA4 Data panel: one chip per file (rows, CSV/TSV, encoding), every column and what it mapped to (unmapped columns in amber), submit and page_view totals, skipped rows, the months covered and which time format was recognised, `(not set)` counts, EN months outside the GA4 range, and warnings.

---

## Dashboard Sections

### KPI Cards
- **Unique Participants** — deduplicated supporter count
- **Total Opt-Ins** — raw submission count
- **Depth Ratio** — opt-ins ÷ participants (core ladder health metric)
- **Multi-Step %** — percentage of participants who took 2+ opt-ins
- **Top Source** — highest volume utm_medium *(requires External Reference 2)*
- **Mobile Share** — percentage of opt-ins from mobile devices *(requires Campaign Data 32)*
- **GA4 Coverage** — GA4-tracked submits ÷ EN submissions for the selected period *(requires GA4 export)*

### Participation Over Time
Dual-axis chart. Bars show Unique Participants (gold, default on) and Total Opt-Ins (green, default hidden). Line shows Depth Ratio on the right axis (default hidden). Toggle datasets via the legend.

### Traffic Source Mix *(requires External Reference 2)*
Horizontal bar chart of opt-in volume by utm_medium value.

### Source Page Type *(requires TidyContact)*
Horizontal bar chart — Donation, Advocacy, or Other based on the thank-you page URL in the TidyContact record.

### Ladder Depth Distribution
Bar chart showing how many participants completed 1, 2, 3… 10+ opt-in steps. First bar (1 step) is amber; subsequent bars are sage green.

### Device & Browser Section *(requires Campaign Data 32)*
- **Device Type** — horizontal bar chart, Desktop/Mobile/Tablet
- **Browser Family** — Chrome, Safari, Firefox, Edge, other
- **Device Brand** — Apple, Microsoft, Google, other
- **Device Type Over Time** — stacked bar chart by period

### Google Analytics 4 · Ladder Events *(requires GA4 export)*
- **Ladder Entry Pages** — top 12 parent pages by tracked submits (`parent_page_name`, falling back to the page ID)
- **Entry Page Type** — Donation, Advocacy, Survey… as reported by ENgrid
- **Opt-Ins Taken** — tracked submits per opt-in step shown
- **First Step Shown** — which opt-in entrants saw first, with GA4 starters and GA4 depth ratio
- **Ladder Position Averages** — average position at submit, configured ladder length, average submissions per session

Each card carries a scope badge: *Filtered to <period>* when the data has a time column and a period is selected, *Entire export range* when it does not. Source, Campaign, Device and Outlier filters never apply to GA4 data; a note above the block turns amber when one of them is active.

### Period Breakdown Table
The main data table. Monthly view groups months under quarterly subtotals. Quarterly view shows one row per quarter. GA4 data adds `GA4 Submits`, `Coverage`, `GA4 Views`, `Adj. Views`, `CVR (raw)` and `CVR (adj.)` columns as it becomes available.

**GA4 Data** (embedded, collapsible, inside the Period Breakdown card): drop GA4 Exploration exports here, read the import report, and enter or override monthly pageview counts. The ad blocker correction has two modes: *Measured (GA4 coverage)*, available once GA4 submits are loaded, and *Manual %* (slider, default +25%). Rows whose CVR or coverage exceed 100% are highlighted red.

### Opt-In Depth Breakdown
Table listing every depth level (1 step, 2 steps…) with participant count and percentage.

### Preference Group Distribution *(requires PG columns)*
Grid of chips showing enrollment count per preference group.

### Campaign Breakdown *(requires Campaign ID)*
Table of campaigns sorted by opt-in volume with participants, total opt-ins, and depth ratio.

---

## Filters

| Filter | Always shown | Condition |
|--------|-------------|-----------|
| Period | ✅ | Monthly or quarterly. Also filters GA4 data that carries a time column |
| Source | If External Reference 2 present | utm_medium values (EN data only) |
| Campaign | If Campaign ID present | Campaign ID values (EN data only) |
| Device | If Campaign Data 32 present | Desktop / Mobile / Tablet (EN data only) |
| View | ✅ | Monthly / Quarterly granularity |
| Exclude Outliers | If outliers detected | Toggle with threshold badge (EN data only; coverage denominators always include outliers) |

---

## Outlier Detection

On parse, the dashboard automatically scans the supporter depth distribution for a statistically significant break — a combination of a large relative drop in population and a gap in the sequence of occupied depth values. Supporters above this threshold (plus a +2 grace buffer) are flagged as outliers.

The toggle only appears when outliers are actually detected. When active, the depth table shows a notice with the count excluded and a "Show all" link.

**Algorithm:** For each consecutive pair of occupied depth values, score = `relDrop × seqGap^1.5`. The pair with the highest score defines the threshold. Threshold is then nudged up by +2 steps to avoid clipping legitimate edge cases.

---

## Session Cache

User adjustments are saved to `localStorage` under the key `optin_ladder_cache` and restored automatically when the same file is re-uploaded.

**What's saved:**
- Outlier toggle on/off
- All manually entered GA4 pageview values (keyed by `YYYY-MM`)
- Ad blocker correction on/off, its percentage, and its mode (measured / manual)

GA4 export rows are **not** cached — re-drop the GA4 files with the EN export. Imported views therefore reappear only when the file is re-dropped; manually typed values are restored from the cache and take precedence.

**Fingerprint:** `filename|rowCount|firstMonth|lastMonth` — matches on exact re-upload of the same EN export. If the file is different (updated export, different client), a banner appears offering to import the saved settings anyway or start fresh. Reset (↩ New File) clears the cache.

---

## GA4 Exploration Setup Guide

Do this once per client property. Data accrues from the day each custom definition is registered.

**1. Confirm the custom definitions** (Admin → Data display → Custom definitions). The dashboard matches on these display names:

| Display name | Scope | Event parameter |
|---|---|---|
| Optin Parent Page Type | Event dimension | `parent_page_type` |
| Optin Parent Page Name | Event dimension | `parent_page_name` |
| Optin Parent Page ID | Event dimension | `parent_page_id` |
| Optin Label | Event dimension | `opt_in_label` |
| Optin ID | Event dimension | `opt_in_id` |
| Optin First Step Name | Event dimension | `first_step_name` |
| Optin First Step ID | Event dimension | `first_step_id` |
| Optin Step Number | Custom metric (sum) | `opt_in_step` |
| Optin Submission Count | Custom metric (sum) | `submission_count` |
| Optin Total Steps | Custom metric (sum) | `opt_in_total_steps` |

The GTM tag *GA4 Event - Opt-In Ladder Submit* sends these parameters with the `ENGRID_OPTIN_LADDER_SUBMIT` event from the ENgrid dataLayer variables.

**2. Create the exploration.** Explore → Blank → Free form. Set the date range to match the EN export. In Tab Settings, set Rows → Show rows to the maximum.

**3. Tabs.** A free-form table takes at most five row dimensions, so the export is split into three tabs that share `Year`, `Month`, `Event name`. The dashboard reads each breakdown from the tab that carries it and never adds tabs together.

| Tab | Rows (in this order) | Values | Filters |
|---|---|---|---|
| Ladder Pages | `Year`, `Month`, `Event name`, `Optin Parent Page Type`, `Optin Parent Page Name` | `Event count` | `Event name` exactly matches `ENGRID_OPTIN_LADDER_SUBMIT` |
| Ladder Steps | `Year`, `Month`, `Event name`, `Optin Label`, `Optin First Step Name` | `Event count`, `Optin Step Number`, `Optin Total Steps`, `Optin Submission Count` | `Event name` exactly matches `ENGRID_OPTIN_LADDER_SUBMIT` |
| Ladder Views | `Year`, `Month`, `Event name` | `Event count` | `Event name` exactly matches `page_view` **and** `Page path and screen class` contains `/page/<ladder page ID>/data/1` **and** `Page location` does not contain `engrid_optin_ladder_followup` |

Set Show rows to 500 and Nested rows to No on every tab. Keep `Event name` even on filtered tabs: it is how the dashboard tells submits from views. Use `Year` + `Month` rather than `Date` to keep row counts low; `Month` alone is a two-digit value the dashboard cannot date. Do not move dimensions into Columns: a pivoted table exports in a shape the importer does not read.

Optional fourth tab when labels or page names get renamed over time: `Year`, `Month`, `Event name`, `Optin ID`, `Optin First Step ID` (or `Optin Parent Page ID`). The dashboard shows names when present and falls back to IDs.

**4. About the views tab.** It counts first-step ladder impressions only, which is stricter than counting every ladder page load, so it will not match historical hand-entered figures exactly. Drop the `Page location` filter if you want every ladder page load instead. The ladder page ID is the numeric ID in the `OptInLadder.iframeUrl` option of the client's ENgrid theme (NWF: 88894).

**5. If a tab hits the 500-row limit or shows `(other)` rows**, shorten the date range and export several shards with identical columns; the dashboard concatenates them and flags overlapping months. The Ladder Pages tab is the one that grows with the number of parent pages.

**6. Export.** On each tab: Export (top right) → Download CSV (TSV also works); each tab downloads separately and takes the tab name as its filename. Drop all files together with the EN CSV, or add them later via *Add GA4 Export*. Check the import report in the GA4 Data panel: every column should show a mapping, the month range should match the EN export, and there should be no warnings.

**Caveats:** GA4 only sees traffic that loads GTM and consents to analytics, which is exactly what the Coverage figure measures. Google Signals thresholding can hide low-count rows in explorations. Adding `opt_in_step` as an event-scoped custom dimension would enable a per-step funnel, but this dashboard reads step data as sum metrics only.

---

## Design System

**Fonts:** Fraunces (display/headings), DM Sans (body), DM Mono (data/labels) — all from Google Fonts.

**Color palette:**

| Token | Hex | Usage |
|-------|-----|-------|
| `--forest` | `#1a3a2a` | Top bar, KPI values |
| `--moss` | `#2d5a40` | Primary chart color, Desktop |
| `--sage` | `#4a7c59` | Secondary bars, depth fills |
| `--fern` | `#6fa37f` | Mobile, muted accents |
| `--mist` | `#c8ddd0` | Badges, subtle fills |
| `--cream` | `#f5f0e8` | Filter bar, alternate rows |
| `--bark` | `#8b6914` | Depth ratio line, GA4 columns |
| `--amber` | `#d4a017` | Tablet, 1-step bar, accents |
| `--gold` | `#f2c84b` | Participants bar, upload highlights |
| `--paper` | `#faf8f3` | Page background |

---

## External Dependencies

Loaded from CDN — no local installation needed.

| Library | Version | Purpose |
|---------|---------|---------|
| [PapaParse](https://www.papaparse.com/) | 5.4.1 | CSV parsing |
| [Chart.js](https://www.chartjs.org/) | 4.4.1 | All chart rendering |
| [html2canvas](https://html2canvas.hertzen.com/) | 1.4.1 | Screenshot export |
| Google Fonts | — | Fraunces, DM Sans, DM Mono |

---

## File Structure

```
index.html            # The entire application — HTML, CSS, and JS in one file
README.md             # This file
CLAUDE.md             # AI assistant context for development
tests/
  vendor.sh           # Fetches the CDN libraries locally for headless tests (git-ignored output)
  gen-fixtures.mjs    # Writes synthetic EN + GA4 fixtures and expected.json (git-ignored output)
  e2e.mjs             # Playwright checks: EN-only, GA4 import, edge-case exports, summary, reset
```

The single-file architecture is intentional — it makes the tool trivially portable (email it, put it on a shared drive, open it from a USB stick) and requires zero deployment infrastructure. The `tests/` folder is for maintainers only and is not needed to use the dashboard.

**Running the tests** (Node 18+ and Playwright with Chromium):

```
bash tests/vendor.sh && node tests/gen-fixtures.mjs && node tests/e2e.mjs
```

---

## Browser Support

Any modern evergreen browser. Requires localStorage for session cache (gracefully skipped if unavailable). No IE support.
