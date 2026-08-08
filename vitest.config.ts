import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // model and state code touches DOMParser/canvas APIs
    environment: "jsdom",
    setupFiles: ["src/testing/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/testing/**",
        "src/main.tsx",
        "src/App.tsx",
        // React views and thin DOM/IPC wrappers: covered by the UI smoke test
        // (tests/ui.smoke.mjs), which drives the real app in a browser
        "src/ui/**",
        "src/files/**",
        "src/editor/EditorCanvas.tsx",
        "src/editor/useCanvasInteraction.ts",
        "src/editor/useKeyboardShortcuts.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
