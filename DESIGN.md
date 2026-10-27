---
name: WindDesk
description: Day-ahead wind forecast monitor for a GB power desk, built as a trading-terminal blotter.
colors:
  terminal-black: "#0b0e11"
  pane: "#11161b"
  raised-pane: "#161c22"
  hover-pane: "#1a2128"
  hairline: "#232b33"
  hairline-strong: "#2c3540"
  grid-line: "#1c232a"
  ink: "#e6e9ed"
  ink-secondary: "#a7b0ba"
  ink-muted: "#7d8894"
  terminal-amber: "#f0a63a"
  amber-wash: "rgb(240 166 58 / 14%)"
  amber-flash: "rgb(240 166 58 / 28%)"
  outturn-blue: "#3987e5"
  neso-orange: "#d95926"
  calibrated-aqua: "#199e70"
  calibrated-wash: "rgb(25 158 112 / 16%)"
  status-good: "#0ca30c"
  status-critical: "#e66767"
typography:
  display:
    fontFamily: "'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "2rem"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.15
  title:
    fontFamily: "'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "1.125rem"
    fontWeight: 650
    letterSpacing: "0.01em"
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.65
  data:
    fontFamily: "'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'tnum' 1"
  table:
    fontFamily: "'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    fontFeature: "'tnum' 1"
  label:
    fontFamily: "'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.08em"
rounded:
  hair: "1px"
  sm: "2px"
  bar-end: "4px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
components:
  button:
    backgroundColor: "{colors.raised-pane}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "28px"
    typography: "{typography.table}"
  button-hover:
    backgroundColor: "{colors.hover-pane}"
  button-primary:
    backgroundColor: "{colors.terminal-amber}"
    textColor: "{colors.terminal-black}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "28px"
  segmented-option:
    backgroundColor: "{colors.terminal-black}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "26px"
  segmented-option-pressed:
    backgroundColor: "{colors.terminal-amber}"
    textColor: "{colors.terminal-black}"
  field:
    backgroundColor: "{colors.terminal-black}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "28px"
  panel:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px"
  panel-title:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  quote-cell:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink}"
    padding: "10px 16px"
  table-header:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    padding: "5px 12px"
  blotter-row-active:
    backgroundColor: "{colors.amber-wash}"
  fkey-tab:
    textColor: "{colors.ink-secondary}"
    padding: "0 12px"
    height: "44px"
---

# Design System: WindDesk

## Overview

**Creative North Star: "The Gate-Closure Blotter"**

WindDesk is a trading terminal, not a dashboard. The screen is a set of near-black panes divided by hairline rules, read the way a trader reads a blotter: rows of hourly products, numbers in a monospaced tabular grid, a quote strip of the few figures that decide the morning. Density is high and deliberate; the 4px-based rhythm stays tight (12px gutters between panes, 4-5px table cell padding) so a full delivery day of 24 rows fits beside its chart on a desktop viewport.

Colour is rationed into three jobs that never overlap. Neutrals carry structure and text. Terminal amber carries the interface's own state: selection, focus, pressed toggles, the current page, the primary action. Three validated data inks carry the three data entities (outturn, NESO forecast, calibrated forecast) and appear only as marks: lines, dots, bars, swatches, key strokes. Status green and red appear only beside a check or cross glyph and a label. The system is dark-only by design, for a trading-floor use scene.

Motion is almost absent. State changes ease over 150ms; the one authored moment is an amber tick-flash on a blotter cell whose value just changed, the way a terminal flags a repriced quote. Everything is disabled under reduced motion.

**Key Characteristics:**
- Near-black tonal panes with 1px hairline rules; no cards floating on shadows.
- JetBrains Mono Variable (self-hosted) with tabular numerals for all data, labels and headings; the system UI stack only for prose.
- Amber means "you selected this" and nothing else; it never enters a plot.
- Three fixed data inks bound to entities across every chart, key and table.
- Every chart has a table-view twin, toggled from the panel header.
- 2px corners: squared, instrument-like, never pill or bubble.

## Colors

A near-black terminal palette with one interface accent and three validated data inks, each held to a single job.

### Primary
- **Terminal Amber** (`terminal-amber`): the interface accent. Pressed segmented options, the active F-key tab underline and its key cap, the selected day in the rail, the 2px focus outline, text selection, the input caret, checkbox and range accent, the skip link, and primary buttons (with near-black text). Its washes mark the hovered/linked blotter row (`amber-wash`) and the tick-flash start frame (`amber-flash`).

### Secondary (data inks)
Validated with a CVD and contrast validator against `terminal-black` and `pane`: all pairs distinguishable, each at least 3:1.
- **Outturn Blue** (`outturn-blue`): metered wind generation, the ground truth. Solid line, dots on range bars.
- **NESO Orange** (`neso-orange`): the NESO forecast as published. Line, bars, scatter, and the raw tick on range bars.
- **Calibrated Aqua** (`calibrated-aqua`): the calibrated forecast. Its **Calibrated Wash** (`calibrated-wash`) fills the uncertainty range, in the chart band and in the blotter's inline range bar.

### Tertiary (status)
- **Status Good** (`status-good`) and **Status Critical** (`status-critical`): in-range / out-of-range marks, improvement / regression deltas, invalid-field borders and error text. Always paired with a check or cross SVG icon or an explicit signed label.

### Neutral
- **Terminal Black** (`terminal-black`): the page, the top bar, field and segmented-control wells.
- **Pane** (`pane`): every panel, quote strip, command bar, day rail and sticky table header.
- **Raised Pane** (`raised-pane`): buttons, key caps, inline code, skeleton base.
- **Hover Pane** (`hover-pane`): hover fill for rows, tabs, rail days, buttons.
- **Hairline** (`hairline`) and **Hairline Strong** (`hairline-strong`): pane borders and row rules; control borders, totals rules, scrollbar thumbs, axis lines.
- **Grid Line** (`grid-line`): chart gridlines, solid, quieter than any rule.
- **Ink / Ink Secondary / Ink Muted** (`ink`, `ink-secondary`, `ink-muted`; 15.9 / 8.8 / 5.4:1 on black): primary figures and titles; labels and supporting text; axis ticks, captions, units, table headers.

### Named Rules
**The Amber Is Yours Rule.** Amber marks the user's own state: selection, focus, current page, primary action, a value that just changed. It never encodes data and never appears inside a plot.

**The Ink Is Not Text Rule.** Data inks are marks, never type. A series is named in ink-colour text only through a line, swatch or dot key beside neutral text.

**The Form Not Hue Rule.** Availability of a forecast run is encoded by line form: solid for runs available at gate closure, dashed for runs published after it. Later runs drop to neutral `ink-secondary` dashed, not a new hue.

**The Glyph Pairs Status Rule.** Green and red never stand alone; each wears a check or cross icon or a signed label.

## Typography

**Display / Data / Label Font:** JetBrains Mono Variable (with ui-monospace, SF Mono, Menlo, Consolas)
**Body Font:** system-ui stack (with -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial)

**Character:** A monospaced terminal voice carries everything that is read as data or navigation, with tabular numerals set on the body so columns align everywhere. Prose (ledes, panel notes, findings, methodology) switches to the system sans so explanation reads as explanation, not as data.

### Hierarchy
- **Display** (650, 2rem / 32px, 1.15, -0.01em): page titles on Accuracy, Explorer and Method. Drops to 24px under 640px.
- **Headline** (650, 1.5rem / 24px, 1.15): primary quote value and accuracy finding values.
- **Title** (650, 1.125rem / 18px, +0.01em): the command-bar delivery date and methodology section headings (mono, even inside prose).
- **Body** (400, 0.9375rem / 15px, 1.55-1.65, system sans): page ledes (68ch max) and long prose (64ch max). Panel notes and findings use the same face at 12-13px.
- **Data** (400, 0.8125rem / 13px, 1.45, tabular): the default interface size.
- **Table** (400, 0.75rem / 12px, tabular): tables, buttons, fields, tabs; bold rows at 650.
- **Label** (500-650, 0.6875rem / 11px, +0.06-0.08em, uppercase): panel titles (at 12px), table headers, field labels, quote labels, axis ticks.

### Named Rules
**The Mono Grid Rule.** Every number is set in JetBrains Mono with tabular numerals and right-aligned in its column; only the first column (hour or label) aligns left.

**The Prose Switch Rule.** Sentences of explanation use the system sans; labels, headings and figures stay mono.

## Layout

A single column page, max 1680px, padded 12px top and 16px sides, with panes stacked at a 12px gap. The briefing stacks command bar, one-row 31-day rail and quote strip full width, then a two-column grid (1 : 1.45) of chart-plus-record on the left and the 24-row blotter on the right. Report pages use 2- and 3-column pane grids at the same 12px gap.

Spacing follows a 4px base (`s1`-`s7`: 4, 8, 12, 16, 24, 32, 48px); inside panes the working steps are 8 and 12px. Quote strip and findings use auto-fit columns (min 180px and 260px) divided by internal hairlines rather than gaps.

Responsive behaviour: at 1600px the blotter's wide columns hide; at 1200px the briefing grid collapses to one column and 3-up grids go 2-up; at 860px all grids go single column, the methodology TOC unpins and the top-bar status hides, and divided strips switch from vertical to horizontal rules; at 640px padding tightens, the brand word, key caps and rail label hide, quotes go 2-up, and optional blotter columns drop. The blotter's hour column stays sticky while the table scrolls sideways.

## Elevation & Depth

Flat and tonal. Depth comes from four near-black steps (`terminal-black`, `pane`, `raised-pane`, `hover-pane`) separated by 1px hairlines. Nothing at rest casts a shadow.

### Shadow Vocabulary
- **Floating tooltip** (`box-shadow: 0 8px 24px rgb(0 0 0 / 45%)`): chart tooltips only, the one element that floats over content, on a 96% opaque black fill.
- **Surface ring** (`box-shadow: 0 0 0 2px var(--panel)`): a 2px pane-coloured ring separating data dots from what they sit on (range-bar dots; chart active dots use the same ring as a stroke).

### Named Rules
**The Hairline Not Shadow Rule.** Panes separate by tone and a 1px rule. A shadow is allowed only on something that genuinely floats.

## Shapes

Squared, instrument-like forms. Panes, controls, tabs, rail days, tooltips and key caps share a 2px corner (`rounded.sm`). Small marks (key swatches, range-bar bands and ticks, rail bars) use 1px. Chart bars carry a 4px rounded data end and a square baseline end, the rounded end facing away from zero for negative values. Circles are reserved for data dots and the status dot. Key caps get a 2px bottom border, the one tactile detail. Icons are an authored 16px set: 1.5px stroke, square caps, matching the hairlines.

## Components

### Buttons
- **Shape:** squared (2px), 28px tall, 12px horizontal padding; icon buttons are 28px square.
- **Default:** raised pane fill, strong hairline border, ink text at 12px with +0.04em tracking.
- **Hover / Active:** hover pane fill with the border lifting to ink-muted over 150ms; pressed nudges down 1px.
- **Primary:** amber fill and border, near-black text at 650.
- **Disabled:** muted ink at 55% opacity, not-allowed cursor.

### Segmented Control
- **Style:** a black well with a strong hairline border; options divided by internal rules, 26px tall.
- **State:** pressed option fills amber with near-black text at 650. Used for gate-closure presets and every chart/table view toggle.

### Inputs / Fields
- **Style:** black well, strong hairline border, 2px corners, 28px tall, 12px mono text. Native checkboxes and ranges take the amber accent; the caret is amber.
- **Focus:** border turns amber plus the global 2px amber outline.
- **Error:** border and 11px error text in status critical.

### Panels
- **Corner / Background / Border:** 2px, pane fill, 1px hairline.
- **Header:** at least 36px tall, an uppercase 12px tracked title, an 11px muted sub-line, and actions pushed right (always including the chart/table toggle when the panel holds a chart). Header is ruled off from the body.
- **Body:** 12px padding, or flush for tables. A refreshing panel dims to 55% opacity.
- **Note:** a sans prose footnote at 12px under the body.

### Navigation
- **F-key tabs:** a 44px top bar on terminal black. Each tab is a numbered key cap plus a 12px tracked label in ink secondary. Hover fills hover pane; the current page gets an amber 2px underline and an amber-filled key cap.
- **Status line:** an 11px muted footer under a hairline carrying source, snapshot time and version.

### Quote Strip
A single bordered row of equal-rank cells divided by hairlines: an 11px uppercase label (with a series line key where the figure belongs to a series), a 20px figure at 600 (24px at 650 for the primary quote) with a muted unit, and an 11px muted sub-line.

### Hourly Blotter (signature)
A sticky-header table, one row per hourly product, 4px row padding. Columns run hour, raw, calibrated (bold), range text, an inline range bar, outturn and signed errors with check/cross marks. The inline range bar draws the calibrated wash band, a NESO-orange tick, a calibrated tick and an outturn-blue dot on a strong-hairline baseline. The row linked to the chart's hover fills amber wash. A totals footer sits under a strong rule. A cell whose value changes (new day, new gate closure) flashes amber wash for 900ms; nothing flashes on first load.

### Day Rail
One row of 31 day buttons, each a mini bar (12px wide, strong hairline, ink-muted on hover) over a 10px day label. The selected day takes an amber border, amber wash and an amber bar.

### Charts
Recharts plots on the pane: solid `grid-line` gridlines, `hairline-strong` axis, 11px muted mono ticks, no tick marks, a 1px ink-muted cursor, 2px series strokes, 4px active dots ringed in pane colour, no entry animation. Series keys sit in the panel header as 14px line strokes or 12x8 swatches beside neutral text.

## Do's and Don'ts

### Do:
- **Do** bind each data entity to its ink everywhere: outturn blue, NESO orange, calibrated aqua with its 16% wash for the range.
- **Do** keep amber for selection, focus, current page, primary action and the changed-value flash.
- **Do** encode forecast-run availability by line form: solid if available at gate closure, dashed after.
- **Do** give every chart a table-view twin via the panel header's segmented toggle.
- **Do** pair every status colour with a check or cross icon or a signed label.
- **Do** set all figures in JetBrains Mono with tabular numerals, right-aligned; use the system sans only for prose.
- **Do** separate panes with 1px hairlines and tonal steps; keep corners at 2px.
- **Do** limit transitions to 150ms on the `cubic-bezier(0.16, 1, 0.3, 1)` ease-out, and turn all motion off under `prefers-reduced-motion`.

### Don't:
- **Don't** set text in a data ink; name a series with a key mark beside neutral text.
- **Don't** put amber inside a plot or use it to encode a value.
- **Don't** distinguish forecast runs by adding hues; use dash and neutral ink.
- **Don't** let green or red carry meaning alone.
- **Don't** add a light theme; WindDesk is dark-only by design.
- **Don't** lift panes with shadows; only floating tooltips cast one.
- **Don't** flash or animate values on first load; the tick-flash marks change only.
