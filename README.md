# AutoDrive Editor (FS25)

A desktop editor for route networks of the [AutoDrive](https://github.com/Stephan-S/FS25_AutoDrive) mod for Farming Simulator 25. Import your savegame's `AutoDrive_config.xml`, edit the waypoint network visually, and export it back.

![Screenshot](docs/screenshot.png)

## Features

- **Import / export `AutoDrive_config.xml`** — exact FS25 format. Waypoint ids are compacted to `1..N` on save, and all other sections of an imported file (user settings, experimental features, …) are preserved untouched.
- **Grid snapping** — configurable grid granularity in meters, toggle with `G`. Applies to placing, dragging, and blueprint stamping.
- **Grid route tool** — connect two nodes and a node is created at *every grid-line crossing* along the route, spaced by your grid setting.
- **Full node/edge editing** — add, move, delete; one-way, two-way, and reverse connections; box select; undo/redo.
- **Blueprints** — save any selection (nodes + connections + markers) as a named blueprint, stamp it anywhere with live move/rotate preview. The library persists between sessions and blueprints can be exported/imported as JSON files to share.
- **Flags** — toggle subprio (pathfinding cost ×20) and traffic-system flags per selection; subprio nodes render yellow.
- **Markers & groups** — create, rename, and delete map markers and organize them into groups.
- **Route tools** — insert midpoint on a connection, distribute a run of nodes evenly, generate a smooth curve between two nodes (tangents follow the adjoining roads).

## Usage

```bash
npm install
npm run dev      # development: Vite + Electron with hot reload
npm run start    # build and run the app
npm run dist     # package installers (NSIS on Windows, AppImage on Linux, DMG on macOS)
```

Your routes live in `Documents/My Games/FarmingSimulator2025/savegame#/AutoDrive_config.xml`. Open it, edit, save — back up the original first, and don't save while the game has the savegame open.

### Controls

| Input | Action |
| --- | --- |
| `1`–`4` | Tools: Select, Add nodes, Connect, Grid route |
| Mouse wheel | Zoom to cursor |
| Middle/right drag | Pan |
| Left click / drag | Select, move selection, box select (`Shift` adds) |
| `Ctrl`+click (Add tool) | Place node connected to the previous one |
| Click node A, then B (Connect tool) | Connect with the active mode; clicking again cycles one-way → other way → two-way → reverse → none |
| `R` / `Shift`+`R` | Rotate blueprint ghost while placing |
| `G` | Toggle grid snap |
| `Ctrl`+`Z` / `Ctrl`+`Y` | Undo / redo |
| `Ctrl`+`S` / `Ctrl`+`Shift`+`S` | Save / Save As |
| `Delete` | Delete selection |
| `Esc` | Cancel placement / pending connection / selection |

## How AutoDrive stores its network

Each waypoint has an id, `x/y/z` position, a `flags` bitmask (`1` = subprio, `2` = traffic system) and two adjacency lists: `out` (ids it drives to) and `incoming` (ids that drive into it). A connection A→B with `B.incoming` containing A is a normal one-way link; both directions present means two-way; A→B *without* the incoming entry means the vehicle drives the segment in reverse. Map markers reference a waypoint id and carry a name and group.

In the XML, `id/x/y/z/flags` are comma-separated lists; `out`/`incoming` are semicolon-separated per waypoint with comma-separated ids inside and `-1` for none.

## Development notes

- Renderer: React + TypeScript + canvas (Vite). Electron main/preload are plain CJS (`electron/`).
- The app also runs in a plain browser (`npx vite`) with file pickers/downloads instead of native dialogs — handy for development and testing.
- Model logic (XML round-trip, grid routing, blueprints) is exercised by a Playwright-driven test against the dev server.
