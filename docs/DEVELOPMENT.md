# Development guidelines

This document is the contract for changes to this repository: how the code is
organised, what "clean" means here, and what has to pass before a change lands.

## Quick start

```bash
npm install
npm run dev          # Vite + Electron with hot reload
npm run verify       # everything CI checks: format, lint, types, tests, coverage
```

Run `npm run verify` before pushing. It is the same set of gates CI runs, so a
green local run means a green pipeline.

| Command                 | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `npm run dev`           | Development app with hot reload              |
| `npm run build`         | Typecheck and bundle the renderer            |
| `npm run lint`          | ESLint (`lint:fix` to autofix)               |
| `npm run format`        | Prettier write (`format:check` to verify)    |
| `npm test`              | Unit tests (vitest)                          |
| `npm run test:watch`    | Unit tests in watch mode                     |
| `npm run test:coverage` | Unit tests with coverage thresholds enforced |
| `npm run test:ui`       | End-to-end smoke test driving the real app   |
| `npm run dist`          | Package installers via electron-builder      |

## Architecture

The dependency direction is strictly one-way: **model → state → editor/ui**.
Nothing in `model/` may import from `state/`, `editor/` or `ui/`.

```
src/
  model/     pure domain logic: no React, no store, no side effects
             graph, blueprint, xml, terrain, png16, updates, types
  state/     the editor store, actions and session handling
             store (state + undo), actions (every mutation), blueprintSession
  editor/    canvas: projection, hit-testing, rendering, input, shortcuts
  ui/        React views: toolbar, sidebar panels, shared components
  files/     Electron/browser IO boundary (dialogs, file reads, persistence)
  testing/   test-only helpers (fixtures, jsdom setup)
electron/    main and preload processes (CommonJS)
```

Why it is split this way:

- **`model/` is pure**, so the tricky parts (XML round-trips, grid routing,
  terrain sampling, semver ordering) are testable without a DOM or a store, and
  a bug there is reproducible from a unit test.
- **`state/actions.ts` owns every mutation.** The canvas, sidebar buttons and
  keyboard shortcuts all call the same action, so a behaviour exists once and
  cannot drift between entry points.
- **`editor/` separates projection, drawing and input.** `viewport.ts` is the
  single definition of world↔screen; `renderScene.ts` only draws;
  `useCanvasInteraction.ts` only interprets pointer events.
- **`files/` is the only place that talks to Electron.** Everything else is
  runtime-agnostic, which is why the app also runs in a plain browser.

## Principles

**DRY.** A rule or constant lives in exactly one place: colours and sizing in
`editor/theme.ts`, world↔screen in `editor/viewport.ts`, XML quirks in
`model/xmlDom.ts`, mutations in `state/actions.ts`. Before adding a helper,
check whether one exists. Duplicated logic is a defect, not a style issue.

**SOLID**, as it applies to a codebase of this size:

- _Single responsibility_ — a module does one thing. If you cannot describe a
  file in one sentence without "and", split it.
- _Open/closed_ — extend through data, not by editing control flow. Adding a
  tool means adding an entry to `TOOL_OPTIONS` and a `case`; adding a sidebar
  tab means adding a row to the `TABS` array.
- _Interface segregation_ — components receive what they use. The Electron
  bridge is a typed interface (`AdBridge`), not an ambient global.
- _Dependency inversion_ — high-level code depends on abstractions:
  `renderScene` takes a `Viewport`, not a canvas; terrain rendering returns raw
  RGBA, and only a thin wrapper knows about `<canvas>`.

**KISS.** Prefer the boring solution. No abstraction for a single caller, no
configuration nobody sets, no cleverness that needs a comment to be read. The
lint rules cap complexity at 15, depth at 4, files at 400 lines and functions
at 120 — when you hit one, that is a signal to split, not to raise the cap.

## Style

- **Naming**: say what it is (`connectAcrossGrid`, not `doGrid`). Booleans read
  as predicates (`hasGroundTextures`). No abbreviations beyond the domain's own
  (`wp` for waypoint is fine in the model, `bg` is not).
- **Comments explain _why_**, never _what_. Document non-obvious domain facts —
  "AutoDrive requires contiguous ids", "drafts are invisible to the anonymous
  API" — and delete anything a reader could get from the code itself.
- **Types**: no `any`. Parse unknown input through a type guard (see
  `isBlueprint`). Prefer `unknown` plus narrowing over casts.
- **Errors**: fail with a message that says what was wrong with which input.
  Use `errorMessage()` when surfacing an unknown thrown value.
- **Formatting** is Prettier's job; never argue about it, run `npm run format`.

## Testing

Tests live next to the code as `*.test.ts` and run in jsdom via vitest.

- **Test behaviour, not implementation.** Assert on outcomes ("ids compacted to
  1..N and references remapped"), not on internal call sequences.
- **Name tests as sentences** describing the guaranteed behaviour — the test
  names are the specification.
- **Cover the edges**: malformed input, empty selections, degenerate geometry,
  values outside the map. Most of the bugs in this domain live there.
- **Use real data where it matters.** `tests/assets/` holds a real FS25
  heightmap and config; the terrain tests assert against known ground truth
  (a placeable at y = 128 m).
- **Coverage must stay at or above 80%** for lines, branches, functions and
  statements. React views and IO wrappers are excluded and covered instead by
  `npm run test:ui`, which drives the real app in a browser.

Do not lower a threshold or add an exclusion to make a build pass — that is a
change to the project's standards and needs to be justified on its own.

## CI/CD

`ci.yml` runs format, lint, typecheck, unit tests with coverage, the UI smoke
test, and (when `SONAR_TOKEN` is configured) a SonarQube Cloud scan whose
quality gate must pass. `release.yml` runs the same gates before packaging;
nothing ships from a red build. See the README for the release channels.

### Enabling SonarQube Cloud

The scan is skipped automatically until the repository has the secret, so CI
stays green before setup:

1. Create the project at <https://sonarcloud.io> (organization `pgatzka`,
   project key `pgatzka_autodrive-editor` — or edit `sonar-project.properties`).
2. Choose "with GitHub Actions" as the analysis method and turn **off**
   automatic analysis, which conflicts with CI-based scans.
3. Add the generated token as the `SONAR_TOKEN` repository secret.
4. In the project's quality gate, keep "Clean as You Code" — new code must have
   no new issues and at least 80% coverage, matching the local thresholds.

## Commits and branches

Work happens on `main`. Write commit subjects in the imperative ("Add terrain
background", not "Added"), and use the body to explain _why_ the change is
shaped the way it is — the diff already shows what changed.
