---
name: JC Confort Entregas
description: Delivery passes and departures boards for the JC Confort office and warehouse team.
colors:
  jc-blue: "#0d409b"
  jc-blue-deep: "#0a3683"
  jc-blue-wash: "#e3eaf6"
  alert-red: "#e00420"
  alert-red-text: "#c8031c"
  alert-red-soft: "#fde8ea"
  ink: "#0e1522"
  slate-text: "#4a5467"
  panel-gray-ground: "#e9ecf1"
  pass-white: "#ffffff"
  panel: "#dde2ea"
  muted-fill: "#eef1f5"
  hairline: "#d3d9e2"
  rule: "#c3cad6"
  field-stroke: "#8b95a7"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "clamp(1.75rem, 1.4rem + 1.4vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.005em"
  headline:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.03em"
  title:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\""
  figure:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.01em"
    fontFeature: "\"tnum\""
  label:
    fontFamily: "Barlow Semi Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.06em"
rounded:
  sm: "3.6px"
  md: "4.8px"
  lg: "6px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
components:
  app-bar:
    backgroundColor: "{colors.jc-blue}"
    textColor: "{colors.pass-white}"
    height: "64px"
  button-primary:
    backgroundColor: "{colors.jc-blue}"
    textColor: "{colors.pass-white}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.jc-blue-deep}"
  button-outline:
    backgroundColor: "{colors.pass-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
  button-destructive:
    backgroundColor: "{colors.pass-white}"
    textColor: "{colors.alert-red-text}"
    rounded: "{rounded.md}"
    height: "44px"
  input:
    backgroundColor: "{colors.pass-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "44px"
  chip-estado:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "24px"
  chip-urgente:
    backgroundColor: "{colors.alert-red}"
    textColor: "{colors.pass-white}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "24px"
  chip-alta:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.pass-white}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "24px"
  lane-header:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.pass-white}"
    typography: "{typography.headline}"
    padding: "8px 8px 8px 16px"
    height: "56px"
  pass-card:
    backgroundColor: "{colors.pass-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  estado-option:
    backgroundColor: "{colors.pass-white}"
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.md}"
    height: "52px"
  estado-option-current:
    backgroundColor: "{colors.jc-blue}"
    textColor: "{colors.pass-white}"
  tab-bar:
    backgroundColor: "{colors.pass-white}"
    textColor: "{colors.slate-text}"
    typography: "{typography.label}"
    height: "68px"
---

# Design System: JC Confort Entregas

## Overview

**Creative North Star: "The Delivery Pass"**

Every task is a pase de reparto: a white pass with a printed head, a perforated tear line, and a stub carrying who it is for and when it is due. Every list is a departures board: an ink header, grouped rows ranked by time, fixed columns on desktop. The app is light only, built for warehouse strip lights and office daylight, mostly on phones, and for older, low-confidence users: nothing is small, nothing is dense, every figure is tabular.

The world is one family in three widths (Barlow, Barlow Semi Condensed, Barlow Condensed) over a cool panel-gray ground, with two brand colors that each carry exactly one law. JC blue is the company: the app bar, the pass head in detail view, and every primary action. JC red means something is wrong. Everything else is ink, slate and gray. The rejected reference is the stock rounded-card Trello board with pastel badges.

**Key Characteristics:**
- White passes on a panel-gray ground, with ink header bands on lanes and boards.
- Perforated tear line with punched semicircular notches between a pass's head and stub.
- Uppercase condensed voice for titles, estados, figures and codes; uppercase semi-condensed for field labels; plain Barlow for reading.
- Square-ish corners (3.6px to 6px), hairline rules, low ambient shadows.
- Large targets (44px controls) and a 16px body floor.

## Colors

A two-law palette: one brand blue, one alert red, and a cool ink-to-gray neutral range that does all the remaining work.

### Primary
- **JC Blue** (#0d409b): the app bar, the auth screen header band, the task pass head band, primary buttons, the current estado option, the active nav underline and tab indicator, focus rings, caret and links.
- **JC Blue Deep** (#0a3683): hover state of the primary button only.
- **JC Blue Wash** (#e3eaf6): hover and focus fill on rows, estado options and drop targets; tinted text-on-wash uses JC Blue.

### Secondary
- **Alert Red** (#e00420): solid fills for the Vencida band and chip, the Urgente priority chip, overdue counts on lane headers and rail chips, the Vencidas group row, and the unread count badge.
- **Alert Red Text** (#c8031c): red as text or stroke on white: overdue deadline figures, the overdue "N vencida" summary, the destructive button, the Urgente select.
- **Alert Red Soft** (#fde8ea): background tint behind overdue departure rows (at 60%) and destructive button hover.

### Neutral
- **Ink** (#0e1522): all body text, lane and board header bands, Alta priority chip, pressed filter toggles, the active phone rail chip.
- **Slate Text** (#4a5467): secondary text, field labels, deadline times, inactive tab labels.
- **Panel-Gray Ground** (#e9ecf1): the page background, and the fill behind tear-line notches on full passes.
- **Pass White** (#ffffff): passes, cards, inputs, tab bar, dropdowns.
- **Panel** (#dde2ea): lane bodies, plain group rows, Baja and default estado chips, tear-line notch fill on lane cards.
- **Muted Fill** (#eef1f5): column-header strips on departures boards, footers of passes.
- **Hairline** (#d3d9e2): default borders and row dividers.
- **Rule** (#c3cad6): the dashed tear line, empty-lane dashed border, unpressed filter and estado option strokes, activity timeline.
- **Field Stroke** (#8b95a7): input and select borders.

### Named Rules
**The One Color, One Law Rule.** Blue means JC Confort or "do this"; red means something is wrong (vencida, urgente, unread). Red is never decorative and never a brand accent. Estados are admin-defined, so no estado name (including bloqueada) is ever colored red.

**The Ink Band Rule.** Boards, lanes and departure lists open with an ink band carrying their name in condensed uppercase and their count as a figure. The blue band belongs only to the app bar, the auth header and the open task pass.

## Typography

**Display Font:** Barlow Condensed (with Barlow, ui-sans-serif)
**Body Font:** Barlow (with ui-sans-serif, system-ui)
**Label Font:** Barlow Semi Condensed (with Barlow)

**Character:** One transport-signage family in three widths. The condensed width is the printed voice of the pass (names, estados, dates, counts); the semi-condensed width is the field label; the normal width is for reading.

### Hierarchy
- **Display** (700, clamp(1.75rem, 1.4rem + 1.4vw, 2.25rem), 1.05, uppercase): page and board titles.
- **Headline** (700, 1.25rem, 1, uppercase, 0.03em): ink and blue band titles, section headers (Comentarios, Actividad), the app name in the bar.
- **Title** (600, 1.0625rem, snug): task titles on passes and departure rows. The open pass title is 1.5rem bold.
- **Body** (400, 1rem, 1.5, tabular figures): all reading text; comments cap at 65ch. Secondary text is 0.9375rem.
- **Figure** (600, 1.125rem, condensed, tabular): deadlines, times, counts, the clock on board headers; overdue figures on the pass band run 1.75rem bold.
- **Label** (600, 0.8125rem, 0.06em, uppercase): field labels, chips, badges, tab labels. Nav links use the same voice at 0.9375rem; group rows at 0.875rem with 0.1em tracking.

### Named Rules
**The Three Widths Rule.** Condensed for what is printed on the pass, semi-condensed for what names a field, normal width for what is read. Do not introduce another family.

**The Nothing Small Rule.** Body never drops below 1rem and no label drops below 0.8125rem.

## Layout

Phone first. A 64px sticky blue app bar sits on top; on phones a 68px white tab bar (Tableros, Mis tareas, Avisos, Perfil) is fixed at the bottom with safe-area padding, and main content pads below it. Desktop (from 48rem) moves navigation into the app bar and hides the tab bar. Content is centered at max 80rem with 16px side padding (24px from 48rem), 20px top (28px from 48rem).

Boards are horizontal lane rails. Under 40rem each lane is one screen wide minus 3.5rem so the next one peeks in, with mandatory scroll snap and a row of rail chips above that jump between lanes and carry each lane's count and overdue count. From 40rem lanes are 19.5rem; from 64rem they flex between 16.5rem and 26rem. Lane gap is 12px, card gap 12px, lane padding 10px.

Departure boards are single full-width lists: grouped by time (Vencidas, Hoy, Mañana, Próximas, Sin fecha), rows stacked on phones and aligned to fixed columns from 48rem. Spacing follows a 4px base with 8, 12, 16 and 20px as the working steps.

## Elevation & Depth

Mostly flat with low ambient lift. Depth comes from color bands (ink, blue, red) and the white-pass-on-gray contrast first; shadows are soft, ink-tinted and short. Cards also carry a 1px ink ring at 10% instead of a border.

### Shadow Vocabulary
- **Pass rest** (`box-shadow: 0 1px 2px rgb(14 21 34 / 0.08), 0 3px 10px -6px rgb(14 21 34 / 0.18)`): lane cards at rest.
- **Pass hover** (`box-shadow: 0 2px 4px rgb(14 21 34 / 0.08), 0 10px 22px -10px rgb(14 21 34 / 0.35)`): lane card hover, paired with a 1px lift.
- **Pass dragging** (`box-shadow: 0 18px 40px -12px rgb(14 21 34 / 0.5)`): the dragged card, tilted 1.5deg.
- **Surface** (`box-shadow: 0 1px 2px rgb(14 21 34 / 0.06), 0 6px 20px -10px rgb(14 21 34 / 0.22)`): departure boards; the open pass uses a slightly deeper tail (0 8px 24px -12px at 0.3), generic cards a lighter one.
- **App bar** (`box-shadow: 0 1px 0 rgb(0 0 0 / 0.2), 0 6px 18px -12px rgb(14 21 34 / 0.6)`): under the sticky bar; the tab bar mirrors it upward.
- **Current estado** (`box-shadow: 0 2px 8px -2px rgb(13 64 155 / 0.55)`): the selected estado option only.

### Named Rules
**The Band Before Shadow Rule.** Hierarchy is carried by header bands and the tear line, not by stacking shadows. A new surface gets an ink or white band, not a deeper shadow.

## Shapes

Square-ish corners from a 6px base: 3.6px on chips, badges and count boxes; 4.8px on buttons, inputs, pass cards, rail chips and estado options; 6px on lanes, departure boards, the open pass and cards. Full circles only for avatars, switches, status dots and the tear-line notches. Borders are hairlines (1px) or 1.5px strokes on outline controls and outline chips; empty states use a 2px dashed rule.

The signature form is the **tear line**: a 2px dashed rule inset 14px from the pass edge, with a 16px semicircular notch punched into each side, filled with whatever sits behind the pass (panel gray inside lanes, ground gray on the page) so the pass reads as cut from paper.

## Components

### Buttons
Solid, plain and large.
- **Shape:** gently squared (4.8px), 44px tall, 16px horizontal padding, 1rem semibold Barlow, sentence case.
- **Primary:** JC Blue fill, white text, a 1px ink shadow; hover to JC Blue Deep; press nudges 1px down.
- **Outline:** white fill with a 1.5px ink stroke at 85%; hover to Muted Fill. Filter toggles are outline at 44px with a Rule stroke and turn solid ink when pressed.
- **Destructive:** white fill, 1.5px Alert Red Text stroke and text; hover to Alert Red Soft. Never a solid red button.
- **Ghost:** transparent, ink at 6% on hover; inside ink bands the hover is white at 12%.
- **Focus:** 3px ring in JC Blue at 50%; on blue bands the ring is white at 60%.

### Chips
- **Style:** 24px tall, 3.6px corners, Label voice (0.8125rem uppercase semi-condensed), 8px padding.
- **Estado:** Panel fill with ink text; a done estado is a 1.5px outline at 40% with a check and slate text.
- **Priority:** Urgente solid Alert Red; Alta solid Ink; Media a 1.5px ink outline; Baja Panel with slate text.
- **Vencida:** solid Alert Red with a warning triangle icon.
- **Sin asignar:** 1.5px dashed ink outline.

### Cards / Containers
- **Corner Style:** 4.8px for lane passes, 6px for boards, the open pass and generic cards.
- **Background:** Pass White on the gray ground or on Panel lanes.
- **Shadow Strategy:** see Pass rest and Surface in Elevation & Depth, plus a 1px ink ring at 10%.
- **Border:** none; internal dividers are Hairline.
- **Internal Padding:** 14px on lane passes, 16px (20px from 40rem) on the open pass and boards.

### Inputs / Fields
- **Style:** 44px tall, white fill, 1px Field Stroke border, 4.8px corners, 12px padding, 1rem text, slate placeholder. Labels sit above in the Label voice.
- **Focus:** border turns JC Blue with a 3px JC Blue ring at 50%.
- **Error / Disabled:** Alert Red Text border for errors and for an Urgente priority select; disabled at 50% opacity.

### Navigation
- **App bar:** JC Blue, 64px, the logo on a white plate (44px tall, 3.6px corners) then the app name in the Headline voice. Desktop nav links are Label voice at 0.9375rem, white at 75%; the active link is full white with a 4px white underline bar.
- **Tab bar (phones):** white, four equal tabs with 24px icons over 0.8125rem uppercase labels; active tab in JC Blue with a 4px blue bar at the top edge and a heavier icon stroke; unread count sits on the bell as a red figure badge ringed in white.

### Pass Card (signature)
A lane card: an optional full-width red Vencida strip on top, priority chip and comment count, the title, the tear line, then a two-column stub: "Asignada a" with avatar and name, and "Vence" with the deadline figure, split by a hairline. The deadline figure reads Hoy, Mañana, Ayer or a short date, plus the time; overdue figures turn Alert Red Text.

### Open Pass (signature)
The task detail: a JC Blue head band with the board name and a white close button, a red Vencida band with the overdue figure in 1.75rem condensed when late, the editable title, the tear line, then the estado grid: every estado as a 52px condensed uppercase option (two columns on phones), the current one solid JC Blue with a check. Fields follow in hairline-divided cells.

### Lane and Departures Headers (signature)
Ink bands at least 56px tall with the name in the Headline voice, the count in a white-at-14% box and an overdue count in a red box. On phones the lane header omits both counts because the rail chips carry them. Departure groups are 8px-padded rows under the band: Vencidas solid red, Hoy ink at 90%, the rest Panel.

## Do's and Don'ts

### Do:
- **Do** put every task on a white pass with the tear line between its head and its stub.
- **Do** open every board, lane and list with an ink band and a condensed count.
- **Do** set dates, times, counts and codes as condensed tabular figures, and keep tabular numerals everywhere.
- **Do** keep controls at 44px tall and body text at 1rem or larger.
- **Do** rank lists by time and group them under Vencidas, Hoy, Mañana, Próximas, Sin fecha.
- **Do** change estado in place: the chosen option fills blue without moving anything else.

### Don't:
- **Don't** use red for anything that is not wrong or unread; never color an admin-defined estado red.
- **Don't** use blue for decoration or section color; it is the company or an action.
- **Don't** round corners past 6px on containers or use pill-shaped chips.
- **Don't** use pastel badge colors; chips are panel gray, ink, outline or alert red.
- **Don't** add a dark theme; the app is light only for warehouse lighting.
