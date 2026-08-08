import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAJOR_EVERY } from "../model/grid";
import { emptyNetwork } from "../model/types";
import {
  applyGrid,
  currentGrid,
  defaultGrid,
  restoreGridForMap,
  saveGridForMap,
  StoredGrid,
  watchGridSettings,
} from "./gridPersistence";
import { store } from "./store";

const RIVERBEND: StoredGrid = { size: 3, offsetX: 1.5, offsetZ: -0.5, majorEvery: 8 };
const ZIELONKA: StoredGrid = { size: 5, offsetX: 0, offsetZ: 0, majorEvery: 16 };

function openMap(mapName: string) {
  store.update((s) => {
    s.network = { ...emptyNetwork(), mapName };
    s.blueprintEdit = null;
  });
}

beforeEach(() => {
  localStorage.clear();
  applyGrid(defaultGrid());
  openMap("");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("currentGrid / applyGrid", () => {
  it("round-trips the four grid settings", () => {
    applyGrid(RIVERBEND);

    expect(currentGrid()).toEqual(RIVERBEND);
    expect(store.state.settings.gridMajorEvery).toBe(8);
  });

  it("defaults to a 2 m grid on the origin with standard chunks", () => {
    expect(defaultGrid()).toEqual({ size: 2, offsetX: 0, offsetZ: 0, majorEvery: DEFAULT_MAJOR_EVERY });
  });
});

describe("saveGridForMap / restoreGridForMap", () => {
  it("keeps a separate grid per map", async () => {
    await saveGridForMap("Riverbend", RIVERBEND);
    await saveGridForMap("Zielonka", ZIELONKA);

    expect(await restoreGridForMap("Riverbend")).toEqual(RIVERBEND);
    expect(currentGrid()).toEqual(RIVERBEND);
    expect(await restoreGridForMap("Zielonka")).toEqual(ZIELONKA);
    expect(currentGrid()).toEqual(ZIELONKA);
  });

  it("overwrites the entry for a map that was saved before", async () => {
    await saveGridForMap("Riverbend", RIVERBEND);
    await saveGridForMap("Riverbend", ZIELONKA);

    expect(await restoreGridForMap("Riverbend")).toEqual(ZIELONKA);
  });

  it("leaves the grid alone for a map that was never saved", async () => {
    applyGrid(RIVERBEND);

    expect(await restoreGridForMap("Unknown map")).toBeNull();
    expect(currentGrid()).toEqual(RIVERBEND);
  });

  it("ignores configs that carry no map name", async () => {
    await saveGridForMap("", RIVERBEND);

    expect(localStorage.getItem("autodrive-editor.gridByMap")).toBeNull();
    expect(await restoreGridForMap("")).toBeNull();
  });

  it("says which map the restored settings came from", async () => {
    await saveGridForMap("Riverbend", RIVERBEND);
    await restoreGridForMap("Riverbend");

    expect(store.state.statusMessage).toContain("Riverbend");
  });

  it("starts over when the stored settings are unreadable", async () => {
    localStorage.setItem("autodrive-editor.gridByMap", "{not json");

    expect(await restoreGridForMap("Riverbend")).toBeNull();

    // and a save on top of the damaged value still works
    await saveGridForMap("Riverbend", RIVERBEND);
    expect(await restoreGridForMap("Riverbend")).toEqual(RIVERBEND);
  });

  it("discards stored entries that are not grids", async () => {
    localStorage.setItem("autodrive-editor.gridByMap", JSON.stringify({ Riverbend: { size: "wide" } }));

    expect(await restoreGridForMap("Riverbend")).toBeNull();
  });
});

describe("watchGridSettings", () => {
  it("saves the grid for the open map once the changes settle", async () => {
    vi.useFakeTimers();
    const stop = watchGridSettings();
    openMap("Riverbend");

    applyGrid({ ...RIVERBEND, size: 1 });
    applyGrid(RIVERBEND);
    await vi.advanceTimersByTimeAsync(500);
    stop();

    vi.useRealTimers();
    expect(await restoreGridForMap("Riverbend")).toEqual(RIVERBEND);
  });

  it("does not save before the changes settle", async () => {
    vi.useFakeTimers();
    const stop = watchGridSettings();
    openMap("Riverbend");
    applyGrid(RIVERBEND);

    await vi.advanceTimersByTimeAsync(100);
    stop();

    vi.useRealTimers();
    expect(await restoreGridForMap("Riverbend")).toBeNull();
  });

  it("ignores the blueprint workspace, which is not a map", async () => {
    vi.useFakeTimers();
    const stop = watchGridSettings();
    openMap("Riverbend");
    applyGrid(RIVERBEND);
    await vi.advanceTimersByTimeAsync(500);

    // the blueprint editor gets its own grid; the map keeps the one it had
    store.update((s) => (s.blueprintEdit = {} as never));
    applyGrid(ZIELONKA);
    await vi.advanceTimersByTimeAsync(500);
    stop();

    vi.useRealTimers();
    expect(await restoreGridForMap("Riverbend")).toEqual(RIVERBEND);
  });

  it("stops saving after it is unsubscribed", async () => {
    vi.useFakeTimers();
    const stop = watchGridSettings();
    openMap("Riverbend");
    stop();

    applyGrid(RIVERBEND);
    await vi.advanceTimersByTimeAsync(500);

    vi.useRealTimers();
    expect(await restoreGridForMap("Riverbend")).toBeNull();
  });
});
