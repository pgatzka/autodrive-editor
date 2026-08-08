# AutoDrive Editor — working notes

Desktop editor (Electron + React + canvas) for the FS25 AutoDrive mod's route
networks.

**Read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) before changing code.** It
defines the architecture, the DRY/SOLID/KISS rules and the testing standards
this repository is held to.

## Essentials

- Run `npm run verify` before committing — it is exactly what CI enforces.
- Dependency direction is one-way: `model → state → editor/ui`. Nothing in
  `model/` imports from `state/`, `editor/` or `ui/`.
- Every mutation goes through `state/actions.ts`, so canvas, sidebar and
  keyboard shortcuts share one implementation.
- Tests live beside the code as `*.test.ts`; coverage thresholds are 80% and
  must not be lowered to make a build pass.
- Work happens on `main`. Pushing to `main` publishes a dev prerelease.

## Domain facts worth knowing

- A waypoint has `out` and `incoming` lists. `A→B` present in both is a normal
  one-way link; both directions means two-way; `A→B` present in `out` but not
  in B's `incoming` means the vehicle reverses along that segment.
- AutoDrive requires contiguous waypoint ids, so export compacts them to `1..N`
  and remaps every reference and marker.
- Savegame terrain heights are `value / 65535 * 255` meters; that formula
  reproduces real save data exactly (verified against a known map).
- Draft GitHub releases are invisible to the anonymous API, which is why dev
  builds are published as prereleases instead.
