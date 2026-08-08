import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureBlueprint } from "../model/blueprint";
import { addWaypoint } from "../model/graph";
import { emptyNetwork } from "../model/types";
import { addNode, selectAll } from "../state/actions";
import { store } from "../state/store";
import { handleShortcut } from "./shortcuts";

vi.mock("../files/fileio", () => ({
  saveConfig: vi.fn(),
  openConfig: vi.fn(),
  loadBlueprintLibrary: vi.fn(),
  persistBlueprintLibrary: vi.fn(),
}));

function press(key: string, options: Partial<KeyboardEventInit> & { target?: EventTarget } = {}): boolean {
  const { target, ...init } = options;
  const event = new KeyboardEvent("keydown", { key, ...init });
  if (target) Object.defineProperty(event, "target", { value: target });
  return handleShortcut(event);
}

beforeEach(() => {
  store.update((s) => {
    s.network = emptyNetwork();
    s.selection = new Set();
    s.tool = "select";
    s.placement = null;
    s.pendingConnectFrom = null;
    s.blueprintEdit = null;
    s.background = null;
    s.settings.snapEnabled = true;
  });
  store.clearHistory();
});

describe("handleShortcut", () => {
  it("selects tools with the number keys", () => {
    expect(press("2")).toBe(true);
    expect(store.state.tool).toBe("add");

    expect(press("4")).toBe(true);
    expect(store.state.tool).toBe("gridroute");

    expect(press("9")).toBe(false);
    expect(store.state.tool).toBe("gridroute");
  });

  it("toggles grid snapping with G", () => {
    expect(press("g")).toBe(true);
    expect(store.state.settings.snapEnabled).toBe(false);
  });

  it("undoes and redoes", () => {
    store.mutate((s) => {
      addWaypoint(s.network, 0, 0, 0);
    });

    expect(press("z", { ctrlKey: true })).toBe(true);
    expect(store.state.network.waypoints.size).toBe(0);

    expect(press("y", { ctrlKey: true })).toBe(true);
    expect(store.state.network.waypoints.size).toBe(1);

    press("z", { ctrlKey: true });
    expect(press("z", { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(store.state.network.waypoints.size).toBe(1);
  });

  it("deletes only when something is selected", () => {
    expect(press("Delete")).toBe(false);

    addNode(0, 0, null, "oneway");
    selectAll();
    expect(press("Delete")).toBe(true);
    expect(store.state.network.waypoints.size).toBe(0);
  });

  it("selects everything with Ctrl+A", () => {
    addNode(0, 0, null, "oneway");
    addNode(10, 0, null, "oneway");

    expect(press("a", { ctrlKey: true })).toBe(true);
    expect(store.state.selection.size).toBe(2);
  });

  it("rotates a pending blueprint placement with R", () => {
    const id = addNode(0, 0, null, "oneway");
    const blueprint = captureBlueprint(store.state.network, new Set([id]), "x")!;
    store.update((s) => (s.placement = { blueprint, rotation: 0 }));

    expect(press("r")).toBe(true);
    expect(store.state.placement!.rotation).toBeCloseTo(Math.PI / 12);

    press("R", { shiftKey: true });
    expect(store.state.placement!.rotation).toBeCloseTo(0);
  });

  it("ignores R when nothing is being placed", () => {
    expect(press("r")).toBe(false);
  });

  it("cancels with Escape", () => {
    addNode(0, 0, null, "oneway");
    selectAll();

    expect(press("Escape")).toBe(true);
    expect(store.state.selection.size).toBe(0);
  });

  it("never intercepts typing in form fields", () => {
    const input = document.createElement("input");
    expect(press("g", { target: input })).toBe(false);
    expect(store.state.settings.snapEnabled).toBe(true);

    const select = document.createElement("select");
    expect(press("2", { target: select })).toBe(false);
  });

  it("leaves unknown combinations to the browser", () => {
    expect(press("p", { ctrlKey: true })).toBe(false);
    expect(press("F5")).toBe(false);
  });
});
