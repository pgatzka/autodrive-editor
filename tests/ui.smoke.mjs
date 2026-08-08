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
