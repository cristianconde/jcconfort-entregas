---
version: 1
slug: "app-app-layout-tsx"
primary_target: "app/(app)/layout.tsx"
related_targets: ["app/(auth)/layout.tsx"]
---

# Surface brief: authenticated app (all routes under app/(app) + auth screens)

Scope: full restyle of the logged-in app and login/setup, phone first. Mode: Operate.
Audience/job: office and warehouse staff at JC Confort (see PRODUCT.md). Most frequent: open Mis tareas, see what is mine and what is late, change a task's estado. Second: scan a board for vencidas, bloqueadas, urgentes, sin asignar.
Constraints: behavior, routes and Spanish copy unchanged; older, low-confidence users: nothing small or dense (body ≥16px, labels ≥13px, targets ≥44px); not flashy or "startup".
Unresolved: the logo exists only as a 447px JPEG (public/brand/jc-confort.png); ask for a vector.

## Direction contract

THESIS: Every task is a delivery pass (pase de reparto) and every list is a departures board ranked by time. Refuses the stock rounded-card Trello board with pastel badges.
OWN-WORLD: White pass on a cool panel-gray ground (#e8ebf0); ink #0e1522, slate text; JC blue #0d409b owns the app bar, primary actions and the pass number; JC red #e00420 is the single alert color, reserved for vencida, urgente and bloqueada, and never decorative. Barlow Condensed for codes, figures and estado; Barlow Semi Condensed uppercase for field labels; Barlow for body. Square-ish corners (4-6px), hairline rules, perforated tear line between the pass header and its segments, tabular figures everywhere.
STORY: The worker opens the app, sees their passes ranked by deadline with a HOY rule (everything above it is late, in red), taps one and changes its estado with one large button.
FIRST VIEWPORT: Phone, Mis tareas: blue app bar with the badge and bell; a departures board header "MIS TAREAS · 09:41"; rows = Nº · title · vence · estado chip in fixed columns; a red-labeled HOY rule; bottom tab bar (Tableros, Mis tareas, Avisos, Perfil).
FORM: Boarding pass + live gate board (dealt challenger, beat my grounded list in the user's choice), fused with raises: in-place editing on the pass, one color one law, one vertical time axis with HOY rule, phone snap rails one estado per screen, state change restyles in place without reflow. Seed key 3ad86c0c.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
