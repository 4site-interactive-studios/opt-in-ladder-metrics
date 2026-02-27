# 4Site's Opt-In Ladder · Analytics Visualizer

A zero-dependency, client-side analytics dashboard for visualizing Engaging Networks opt-in ladder performance. Drop in a Transaction Export CSV and get an interactive dashboard — no server, no login, no data ever leaves the browser.

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
- GA4 pageview overlay and conversion rate columns (manually entered)

---

## Getting Started

1. Open `index.html` (the dashboard file) in any modern browser
2. Export the **Opt-in Ladder Transactions** report from Engaging Networks
3. Drop the CSV onto the upload screen or click to browse

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

## Dashboard Sections

### KPI Cards
- **Unique Participants** — deduplicated supporter count
- **Total Opt-Ins** — raw submission count
- **Depth Ratio** — opt-ins ÷ participants (core ladder health metric)
- **Multi-Step %** — percentage of participants who took 2+ opt-ins
- **Top Source** — highest volume utm_medium *(requires ER2)*
- **Mobile Share** — percentage of opt-ins from mobile devices *(requires CD32)*

### Participation Over Time
Dual-axis chart. Bars show Unique Participants (gold, default on) and Total Opt-Ins (green, default hidden). Line shows Depth Ratio on the right axis (default hidden). Toggle datasets via the legend.

### Traffic Source Mix *(requires ER2)*
Horizontal bar chart of opt-in volume by utm_medium value.

### Source Page Type *(requires TidyContact)*
Horizontal bar chart — Donation, Advocacy, or Other based on the thank-you page URL in the TidyContact record.

### Ladder Depth Distribution
Bar chart showing how many participants completed 1, 2, 3… 10+ opt-in steps. First bar (1 step) is amber; subsequent bars are sage green.

### Device & Browser Section *(requires CD32)*
- **Device Type** — horizontal bar chart, Desktop/Mobile/Tablet
- **Browser Family** — Chrome, Safari, Firefox, Edge, other
- **Device Brand** — Apple, Microsoft, Google, other
- **Device Type Over Time** — stacked bar chart by period

### Period Breakdown Table
The main data table. Monthly view groups months under quarterly subtotals. Quarterly view shows one row per quarter. Optionally unlocks GA4 conversion rate columns.

**GA4 Pageview Data** (embedded, collapsible, inside the Period Breakdown card): Manually enter monthly pageview counts from GA4 to unlock `GA4 Views`, `Adj. Views`, `CVR (raw)`, and `CVR (adj.)` columns. The ad blocker correction slider (default +25%) inflates raw GA4 numbers to account for client-side tracking gaps.

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
| Period | ✅ | Monthly or quarterly |
| Source | If ER2 present | utm_medium values |
| Campaign | If Campaign ID present | Campaign ID values |
| Device | If CD32 present | Desktop / Mobile / Tablet |
| View | ✅ | Monthly / Quarterly granularity |
| Exclude Outliers | If outliers detected | Toggle with threshold badge |

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
- All GA4 pageview values (keyed by `YYYY-MM`)
- Ad blocker correction on/off
- Ad blocker correction percentage

**Fingerprint:** `filename|rowCount|firstMonth|lastMonth` — matches on exact re-upload of the same export. If the file is different (updated export, different client), a banner appears offering to import the saved settings anyway or start fresh. Reset (↩ New File) clears the cache.

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
| Google Fonts | — | Fraunces, DM Sans, DM Mono |

---

## File Structure

```
index.html          # The entire application — HTML, CSS, and JS in one file
README.md           # This file
CLAUDE.md           # AI assistant context for development
```

The single-file architecture is intentional — it makes the tool trivially portable (email it, put it on a shared drive, open it from a USB stick) and requires zero deployment infrastructure.

---

## Browser Support

Any modern evergreen browser. Requires localStorage for session cache (gracefully skipped if unavailable). No IE support.