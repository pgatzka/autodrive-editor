# Contributing

Thanks for helping improve the AutoDrive editor.

1. Read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — it covers the architecture,
   the DRY/SOLID/KISS rules the codebase follows, and the testing standards.
2. Install and verify:
   ```bash
   npm install
   npm run verify
   ```
3. Make your change with tests next to the code it covers.
4. Run `npm run verify` again. It runs the same gates as CI: formatting, lint,
   typecheck, unit tests and the 80% coverage thresholds.
5. Commit in the imperative mood, explaining _why_ in the body, and push.

A change is ready when the pipeline is green, coverage has not dropped, and the
SonarQube quality gate passes. If a rule genuinely does not fit your change,
say so in the pull request rather than working around it.
