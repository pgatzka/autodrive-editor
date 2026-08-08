/**
 * End-to-end smoke test: boots the real app in a browser and drives the parts
 * unit tests cannot reach — canvas mounting, pointer interaction and the React
 * views. Model logic is covered by the vitest specs next to the source.
 *
 * Run with `npm run test:ui`. Set CHROMIUM_PATH to pick a specific browser.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const failures = [];
const check = (condition, message) => {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) failures.push(message);
};

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && existsSync(base)) {
    for (const dir of readdirSync(base)) {
      for (const binary of ["chrome-linux/headless_shell", "chrome-linux/chrome"]) {
        const candidate = path.join(base, dir, binary);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

const server = await createServer({ root: process.cwd(), server: { port: 0 } });
await server.listen();
const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector(".toolstrip");
  check((await page.locator("canvas").count()) === 1, "canvas mounts");

  // place two nodes with the Add tool and connect them by dragging the grid route
  await page.click(".tool-btn:has-text('Add')");
  const canvas = page.locator("canvas");
  await canvas.click({ position: { x: 400, y: 300 } });
  await canvas.click({ position: { x: 500, y: 300 }, modifiers: ["Control"] });
  const afterAdd = await page.evaluate(async () => {
    const { store } = await import("/src/state/store.ts");
    return {
      nodes: store.state.network.waypoints.size,
      edges: [...store.state.network.waypoints.values()].reduce((sum, wp) => sum + wp.out.length, 0),
    };
  });
  check(afterAdd.nodes === 2, `two nodes placed (got ${afterAdd.nodes})`);
  check(afterAdd.edges === 1, `ctrl+click chained them (got ${afterAdd.edges})`);

  // box select both with the Select tool, then delete via the keyboard
  await page.click(".tool-btn:has-text('Select')");
  await page.mouse.move(300, 200);
  await page.mouse.down();
  await page.mouse.move(600, 400, { steps: 5 });
  await page.mouse.up();
  const selected = await page.evaluate(async () => {
    const { store } = await import("/src/state/store.ts");
    return store.state.selection.size;
  });
  check(selected === 2, `box select picked both nodes (got ${selected})`);

  await page.keyboard.press("Delete");
  const afterDelete = await page.evaluate(async () => {
    const { store } = await import("/src/state/store.ts");
    return store.state.network.waypoints.size;
  });
  check(afterDelete === 0, "delete key removed the small selection without asking");

  // inspector tabs render
  for (const tab of ["Markers", "Blueprints", "File"]) {
    await page.click(`.tabs button:has-text('${tab}')`);
    check((await page.locator(".inspector-body").count()) === 1, `${tab} panel renders`);
  }

  // blueprint workspace opens, is unmistakable, and closes without touching the map
  await page.click(".tabs button:has-text('Blueprints')");
  await page.click("button:has-text('New blueprint')");
  check(await page.locator(".canvas-banner").isVisible(), "blueprint banner shown");
  check(await page.locator(".editor-canvas.blueprint-frame").isVisible(), "blueprint frame shown");
  check((await page.locator(".app.blueprint-mode").count()) === 1, "blueprint accent applied");
  await page.click("button:has-text('Discard')");
  check((await page.locator(".canvas-banner").count()) === 0, "blueprint workspace closes");

  // the numeric fields accept typed decimals (a controlled input that
  // re-parsed on every keystroke used to eat the decimal point)
  const gridSize = page.getByRole("textbox", { name: "grid size" });
  await gridSize.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("2.5", { delay: 20 });
  check((await gridSize.inputValue()) === "2.5", "decimal survives typing");
  await page.keyboard.press("Enter");
  const offsetX = page.getByRole("textbox", { name: "Grid offset X" });
  await offsetX.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("1.7");
  await page.keyboard.press("Enter");
  const gridState = await page.evaluate(async () => {
    const { store } = await import("/src/state/store.ts");
    return { size: store.state.settings.gridSize, x: store.state.settings.gridOffsetX };
  });
  check(gridState.size === 2.5, `typed grid size committed (got ${gridState.size})`);
  check(gridState.x === 1.7, `typed offset committed (got ${gridState.x})`);

  // a fine grid used to swallow whole-number offsets, and the chunk width is
  // now the user's to choose
  await gridSize.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("0.5");
  await page.keyboard.press("Enter");
  await offsetX.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("2");
  await page.keyboard.press("Enter");
  const chunk = page.getByRole("textbox", { name: "Cells per chunk" });
  await chunk.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("4");
  await page.keyboard.press("Enter");
  const fineGrid = await page.evaluate(async () => {
    const { store } = await import("/src/state/store.ts");
    const { gridSize, gridOffsetX, gridMajorEvery } = store.state.settings;
    return { size: gridSize, x: gridOffsetX, chunk: gridMajorEvery };
  });
  check(fineGrid.x === 2, `offset survives a 0.5 m grid (got ${fineGrid.x})`);
  check(fineGrid.chunk === 4, `chunk width committed (got ${fineGrid.chunk})`);

  // grid settings are remembered per map
  const remembered = await page.evaluate(async () => {
    const { store } = await import("/src/state/store.ts");
    const { restoreGridForMap, saveGridForMap, currentGrid, applyGrid, defaultGrid } =
      await import("/src/state/gridPersistence.ts");
    const mine = currentGrid();
    await saveGridForMap("SmokeMap", mine);
    applyGrid(defaultGrid());
    store.update((s) => (s.network.mapName = "SmokeMap"));
    return { mine, restored: await restoreGridForMap("SmokeMap") };
  });
  check(
    JSON.stringify(remembered.restored) === JSON.stringify(remembered.mine),
    `grid restored per map (got ${JSON.stringify(remembered.restored)})`
  );

  // stacked nodes are invisible on the canvas, so the File tab counts them
  await page.evaluate(async () => {
    const { store } = await import("/src/state/store.ts");
    const { addWaypoint, connect } = await import("/src/model/graph.ts");
    store.update((s) => {
      const keep = addWaypoint(s.network, 0, 100, 0);
      const dupe = addWaypoint(s.network, 0, 100, 0);
      const east = addWaypoint(s.network, 20, 100, 0);
      connect(s.network, dupe.id, east.id, "oneway");
    });
  });
  await page.click(".tabs button:has-text('File')");
  const merge = page.locator(".inspector button", { hasText: "stacked node" });
  check((await merge.textContent()) === "Merge 1 stacked node", "stacked nodes counted");
  await merge.click();
  const merged = await page.evaluate(async () => {
    const { store } = await import("/src/state/store.ts");
    const [keep] = [...store.state.network.waypoints.values()];
    return { nodes: store.state.network.waypoints.size, out: keep.out.length };
  });
  check(merged.nodes === 2, `stack merged away (got ${merged.nodes} nodes)`);
  check(merged.out === 1, "the survivor kept the duplicate's connection");
  check(
    (await page.locator(".inspector button", { hasText: "No stacked nodes" }).count()) === 1,
    "merge button reports nothing left to do"
  );
  await page.locator(".toast", { hasText: "Merged" }).getByRole("button", { name: "Undo" }).click();
  const restored = await page.evaluate(async () => {
    const { store } = await import("/src/state/store.ts");
    return store.state.network.waypoints.size;
  });
  check(restored === 3, `undo brought the stack back (got ${restored} nodes)`);

  // shortcuts sheet opens from the strip and closes on Escape
  await page.click("button:has-text('Shortcuts')");
  check(await page.locator(".dialog").isVisible(), "shortcuts dialog opens");
  await page.keyboard.press("Escape");
  check((await page.locator(".dialog").count()) === 0, "shortcuts dialog closes");

  check(pageErrors.length === 0, `no page errors (${pageErrors.join("; ")})`);
} finally {
  await browser.close();
  await server.close();
}

console.log(failures.length === 0 ? "\nUI SMOKE PASSED" : `\n${failures.length} UI CHECKS FAILED`);
process.exit(failures.length === 0 ? 0 : 1);
