# Design brief: AutoDrive Editor UI revamp

_Hand this to Claude Design as the prompt. It describes the product, the users,
every screen element that must survive, and the constraints the implementation
imposes. Nothing here asks for a rewrite of behaviour — only a new visual and
interaction design for the existing capabilities._

---

## The product

**AutoDrive Editor** is a Windows/macOS/Linux desktop app (Electron + React +
TypeScript, rendering to a single HTML canvas) for building road networks used
by the AutoDrive mod in the game _Farming Simulator 25_.

Players hand-place hundreds of waypoints in-game by driving a tractor around,
which is slow and imprecise. This editor replaces that: it opens the game's
`AutoDrive_config.xml` from a savegame folder, draws the route network on top of
the map's real terrain, and lets people edit it like a vector drawing —
snapping to a grid, stamping reusable "blueprints", and saving back to the game.

## Who uses it

Farming Simulator players, not professional designers or engineers. They are
comfortable with games and mods but not with CAD software. Sessions are long
(30–120 minutes) and repetitive: place nodes, connect them, adjust, repeat. Many
run the app on a second monitor beside the game, often at night, sometimes on a
laptop screen at 1366×768.

Two moods to design for:

1. **Focused building** — long stretches of clicking on the canvas. The UI
   should get out of the way and never steal attention from the map.
2. **Orientation** — "where am I, what is this node, what did I just do".
   Status and structure need to be readable at a glance.

## What is wrong with the current UI

It is functional but was never designed. Specifically:

- A dense strip of identical grey buttons across the top; the active tool is
  hard to spot at a glance, and nothing communicates which mode you are in.
- The sidebar is a wall of small controls with no hierarchy — a marker editor, a
  file panel, an update checker and a terrain-opacity slider all look equally
  important.
- No visual identity: default system font, flat greys and greens, no spacing
  rhythm, no iconography.
- Feedback is a single line of text in a status bar; destructive actions
  (deleting 40 nodes) look the same as harmless ones.
- Everything is one density; there is no distinction between the primary tools
  used constantly and settings touched once a session.

## What the design must deliver

A cohesive, modern desktop-app look — think Figma, Linear, or a good map editor
— that makes the canvas the hero and organises everything else into a calm,
legible shell. Deliverables:

1. **Visual language**: color system (dark theme primary; light theme optional
   but must be specified if included), typography scale, spacing rhythm, corner
   radii, elevation/borders, icon style, and a small component library
   (buttons, segmented controls, inputs, sliders, tabs, list rows, toggles,
   tooltips, dialogs, toasts).
2. **Layout** for the main window: how the tool strip, the canvas, the
   inspector/sidebar and the status area relate; what collapses at narrow
   widths; where the app breathes.
3. **States**: hover / active / disabled / focus for every control, plus empty
   states, loading, and error presentation.
4. **The canvas's own visual grammar** — see the constraints below.
5. **Annotated screens** for the flows listed under "Flows to cover".

## Functionality that must remain reachable

Do not drop capability; reorganise it. Everything below exists today.

**Tools** (mutually exclusive, currently keys 1–4):

- **Select** — click a node, shift-click to add, drag to move a selection,
  drag on empty space for a rubber-band box selection.
- **Add nodes** — click places a node; Ctrl+click chains it to the previous one.
- **Connect** — click node A then node B; clicking the pair repeatedly cycles
  through connection types and finally removes the link.
- **Grid route** — click two nodes; a node is generated at every grid-line
  crossing on the straight line between them.
- **Place blueprint** (entered from the blueprint list, not the tool strip) — a
  ghost preview follows the cursor, `R` / `Shift+R` rotates it in 15° steps,
  clicking stamps it, `Esc` finishes.

**Global settings in the tool strip**: connection type to draw (one-way /
two-way / reverse), grid size in meters (a number, e.g. 2), snap on/off,
undo, redo.

**File actions**: New, Open…, Save, Save As… (Save shows an unsaved-changes
indicator).

**Inspector — currently four tabs:**

- _Selection_: node count and, for one node, its id and x/y/z; two flag
  toggles ("Subprio" — a routing penalty, and "Traffic system"); a marker
  editor for a single node (name + group, add/update/remove); route tools that
  appear based on how many nodes are selected — Connect, Disconnect, Insert
  midpoint, Smooth curve (with a segment-count input), Space evenly along path
  (3+ nodes), and Delete selection (destructive).
- _Markers_: create/remove named groups; list markers by group; clicking a
  marker jumps the view to it.
- _Blueprints_: "New blueprint" (opens a separate editing workspace), "Import…",
  capture-selection-as-blueprint (name field + button), and a list where each
  entry offers Place / Edit / Export / Delete.
- _File_: current file path; counts of waypoints, connections and markers; map
  name, route author, route version fields; a map-background section (load
  savegame folder, reload, clear, terrain opacity slider, show placeables &
  vehicles toggle); and an updater (stable/unstable channel radio, "Check for
  updates", "Download & install", release info).

**Blueprint workspace**: a distinct mode where the canvas edits a small
reusable snippet instead of the map. Today it swaps the file buttons for a name
field plus Save / Save & close / Discard, tints the canvas background, and shows
a "BLUEPRINT" chip in the status bar. **This mode must be unmistakable** — users
must never wonder whether they are editing their map or a blueprint.

**Status bar**: last action message, cursor position in world meters, zoom
level, node count, snap state.

## Canvas constraints (these are technical, please design within them)

The map area is a single `<canvas>` drawn imperatively — it is _not_ DOM, so it
cannot use CSS. Specify its visuals as explicit colors and sizes:

- **Background**: hillshaded terrain rendered from the savegame's heightmap,
  tinted by the map's painted ground textures (grass, gravel, dirt, asphalt).
  It sits under everything at adjustable opacity. When no savegame is loaded,
  a plain field color is shown instead.
- **Grid**: minor lines every grid unit, emphasised lines every 10th, hidden
  when they would be denser than ~6 px apart.
- **Nodes**: small filled circles. Variants: normal, "subprio" (a flagged
  routing penalty), selected, and the pending start-node of a connection.
- **Connections**: lines between nodes in three distinguishable kinds — one-way
  (with a direction arrow), two-way, and reverse (currently dashed). They must
  be tellable apart by shape as well as color, for color-blind users.
- **Markers**: a labeled pin above a node.
- **World icons**: placeables (buildings) and vehicles from the savegame, with
  labels that appear only when zoomed in.
- **Overlays**: rubber-band selection rectangle, blueprint ghost preview, a
  crosshair "anchor" in the blueprint workspace.

Zoom ranges from 0.05 to 60 pixels per meter, so every canvas element needs a
rule for how it scales and when labels appear or disappear.

## Flows to cover in the deliverable

1. **First run** — no file open. What does the empty canvas say? How does a user
   discover "open your savegame"?
2. **Open a savegame and edit** — terrain appears, network loads, user selects a
   tool and works. Show the tool strip in its active state.
3. **Inspecting a selection** — one node vs. many nodes selected.
4. **Building a blueprint** — entering the blueprint workspace, the mode change,
   saving and returning.
5. **Placing a blueprint** — ghost preview and rotation affordance on the canvas.
6. **Saving** — unsaved-changes indicator, save confirmation.
7. **Destructive action** — deleting a large selection: how is it flagged, and
   is undo discoverable?
8. **Checking for updates** — a rarely used, low-priority surface.

## Constraints and preferences

- **Desktop only.** No mobile layout. Design for 1366×768 up to 2560×1440;
  the canvas must stay dominant at every size.
- **Dark theme first.** Users often work at night beside a bright game window.
  The terrain background is a mid-tone green/tan, so chrome must sit against it
  without vibrating.
- **Accessibility**: readable at 100% OS scaling, WCAG AA contrast for text,
  visible keyboard focus, and canvas elements distinguishable without relying on
  color alone. Keyboard shortcuts exist for tools (1–4), snap (G), undo/redo,
  save, select-all, delete, and Escape — surface them in the design (tooltips or
  a shortcuts panel).
- **Performance**: the canvas repaints every animation frame; chrome around it
  should not depend on heavy effects (no large blurs behind the map area).
- **Implementation reality**: React + plain CSS today, with a small existing
  component set. A CSS-variable-based token system is welcome. Please avoid
  designs that would require a heavyweight component framework or a runtime
  CSS-in-JS library.
- **No branding exists yet.** An app icon and a simple wordmark would be
  welcome, in a style that suits a farming/mapping tool without being cartoonish.

## What "done" looks like

- A token set (colors, type, spacing, radii, shadows) I can drop into CSS
  variables.
- Component specs with all interaction states.
- Annotated mockups for the flows above, at a realistic window size.
- The canvas visual spec as concrete values (hex colors, pixel sizes, dash
  patterns, zoom thresholds).
- A short rationale for the layout decisions, so the implementation can make
  consistent choices where the mockups are silent.
