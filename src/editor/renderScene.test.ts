import { beforeEach, describe, expect, it } from "vitest";
import { captureBlueprint } from "../model/blueprint";
import { addWaypoint, connect } from "../model/graph";
import { emptyNetwork, FLAG_SUBPRIO } from "../model/types";
import { store } from "../state/store";
import { renderScene } from "./renderScene";
import {
  CANVAS_COLORS,
  casingWidth,
  chevronSpacing,
  CONNECTION_COLORS,
  linkWidth,
  nodeRadius,
} from "./theme";
import { createViewport } from "./viewport";

/** Records the drawing calls a scene makes, so layers can be asserted. */
function recordingContext() {
  const calls: { op: string; args: unknown[]; smoothing?: boolean }[] = [];
  const styles: string[] = [];
  const dashes: number[][] = [];
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    setLineDash: (dash: number[]) => dash.length > 0 && dashes.push(dash),
    beginPath: () => calls.push({ op: "beginPath", args: [] }),
    moveTo: (...args: unknown[]) => calls.push({ op: "moveTo", args }),
    lineTo: (...args: unknown[]) => calls.push({ op: "lineTo", args }),
    arcTo: (...args: unknown[]) => calls.push({ op: "arcTo", args }),
    closePath: () => calls.push({ op: "closePath", args: [] }),
    arc: (...args: unknown[]) => calls.push({ op: "arc", args }),
    measureText: (text: string) => ({ width: text.length * 6 }),
    fill: function () {
      styles.push(String(this.fillStyle));
      calls.push({ op: "fill", args: [this.fillStyle] });
    },
    stroke: function () {
      styles.push(String(this.strokeStyle));
      calls.push({ op: "stroke", args: [this.strokeStyle, this.lineWidth] });
    },
    fillRect: function (...args: unknown[]) {
      styles.push(String(this.fillStyle));
      calls.push({ op: "fillRect", args });
    },
    strokeRect: (...args: unknown[]) => calls.push({ op: "strokeRect", args }),
    fillText: (...args: unknown[]) => calls.push({ op: "fillText", args }),
    drawImage: function (...args: unknown[]) {
      calls.push({ op: "drawImage", args, smoothing: this.imageSmoothingEnabled });
    },
  };
  return {
    ctx: context as unknown as CanvasRenderingContext2D,
    calls,
    styles,
    dashes,
    ops: () => calls.map((call) => call.op),
    texts: () => calls.filter((call) => call.op === "fillText").map((call) => String(call.args[0])),
    smoothingAt: (op: string) => calls.find((call) => call.op === op)?.smoothing,
    strokeWidths: (color: string) =>
      calls.filter((call) => call.op === "stroke" && call.args[0] === color).map((call) => call.args[1]),
  };
}

const VIEWPORT = createViewport({ cx: 0, cz: 0, scale: 4 }, 800, 600);
const NO_OVERLAYS = { cursor: null, marquee: null };

function blueprintSession() {
  return {
    index: null,
    name: "x",
    stash: {
      network: emptyNetwork(),
      selection: new Set<number>(),
      view: { cx: 0, cz: 0, scale: 4 },
      dirty: false,
      statusMessage: "",
      history: { undo: [], redo: [] },
    },
  };
}

beforeEach(() => {
  store.update((s) => {
    s.network = emptyNetwork();
    s.selection = new Set();
    s.background = null;
    s.blueprintEdit = null;
    s.placement = null;
    s.pendingConnectFrom = null;
    s.pendingDeletion = null;
    s.settings.gridSize = 2;
    s.settings.gridOffsetX = 0;
    s.settings.gridOffsetZ = 0;
    s.settings.gridMajorEvery = 10;
    s.settings.showIcons = true;
    s.settings.backgroundOpacity = 0.85;
  });
});

describe("renderScene", () => {
  it("paints the flat field and grid when nothing is loaded", () => {
    const { ctx, styles, ops } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(styles[0]).toBe(CANVAS_COLORS.field);
    expect(ops()).toContain("stroke");
  });

  it("uses the indigo field and violet anchor in the blueprint workspace", () => {
    store.update((s) => (s.blueprintEdit = blueprintSession()));
    const { ctx, styles } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(styles[0]).toBe(CANVAS_COLORS.fieldBlueprint);
    expect(styles).toContain(CANVAS_COLORS.blueprint);
  });

  it("drops minor grid lines before major ones as the view zooms out", () => {
    const { ctx: dense, ops: denseOps } = recordingContext();
    renderScene(dense, store.state, createViewport({ cx: 0, cz: 0, scale: 0.5 }, 800, 600), NO_OVERLAYS);
    const { ctx: sparse, ops: sparseOps } = recordingContext();
    renderScene(sparse, store.state, createViewport({ cx: 0, cz: 0, scale: 0.01 }, 800, 600), NO_OVERLAYS);

    // at 0.5 px/m the 2 m grid is too dense, but the 20 m major grid survives
    expect(denseOps().filter((op) => op === "stroke").length).toBeGreaterThan(0);
    expect(sparseOps().filter((op) => op === "stroke")).toHaveLength(0);
  });

  it("emphasises a line every chunk, however wide the chunk is set", () => {
    const majorLines = (cellsPerChunk: number) => {
      store.update((s) => (s.settings.gridMajorEvery = cellsPerChunk));
      const { ctx, styles } = recordingContext();
      renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);
      return styles.filter((style) => style === CANVAS_COLORS.gridMajor).length;
    };

    // the viewport spans 200 m of a 2 m grid: 10-cell chunks are 20 m apart,
    // 4-cell chunks 8 m, so shrinking the chunk emphasises ~2.5x as many lines
    const wide = majorLines(10);
    const narrow = majorLines(4);
    expect(wide).toBeGreaterThan(0);
    expect(narrow / wide).toBeGreaterThan(2);
    expect(narrow / wide).toBeLessThan(3);
  });

  it("shifts the grid with the offset instead of redrawing it on the origin", () => {
    const firstLine = (offsetX: number) => {
      store.update((s) => (s.settings.gridOffsetX = offsetX));
      const { ctx, calls } = recordingContext();
      renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);
      const move = calls.find((call) => call.op === "moveTo");
      return VIEWPORT.toWorldX(Number(move?.args[0]));
    };

    // a 0.5 m shift of a 2 m grid moves every line, it does not snap back
    expect(firstLine(0.5) - firstLine(0)).toBeCloseTo(0.5, 6);
  });

  it("cases every link so it reads over any terrain", () => {
    store.update((s) => {
      const a = addWaypoint(s.network, -10, 0, 0);
      const b = addWaypoint(s.network, 10, 0, 0);
      connect(s.network, a.id, b.id, "oneway");
    });
    const { ctx, strokeWidths } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(strokeWidths(CANVAS_COLORS.linkCasing)).toContain(casingWidth(VIEWPORT.scale));
  });

  it("marks link types by shape as well as colour", () => {
    store.update((s) => {
      const a = addWaypoint(s.network, -20, 0, 0);
      const b = addWaypoint(s.network, 0, 0, 0);
      const c = addWaypoint(s.network, 20, 0, 0);
      const d = addWaypoint(s.network, 40, 0, 0);
      connect(s.network, a.id, b.id, "oneway");
      connect(s.network, b.id, c.id, "dual");
      connect(s.network, c.id, d.id, "reverse");
    });
    const { ctx, styles, dashes, calls } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(styles).toContain(CONNECTION_COLORS.oneway);
    expect(styles).toContain(CONNECTION_COLORS.dual);
    expect(styles).toContain(CONNECTION_COLORS.reverse);
    // reverse is a dashed rail
    const dash = 1.6 * linkWidth(VIEWPORT.scale);
    expect(dashes).toContainEqual([dash, dash]);
    // one-way carries repeated chevrons: three points each, drawn along the link
    const chevronCount = Math.floor((20 * VIEWPORT.scale) / chevronSpacing(VIEWPORT.scale));
    expect(calls.filter((call) => call.op === "lineTo").length).toBeGreaterThanOrEqual(chevronCount);
  });

  it("hides chevrons when zoomed too far out to read them", () => {
    store.update((s) => {
      const a = addWaypoint(s.network, -200, 0, 0);
      const b = addWaypoint(s.network, 200, 0, 0);
      connect(s.network, a.id, b.id, "oneway");
      s.settings.gridSize = 0; // isolate the link from grid strokes
    });
    const far = createViewport({ cx: 0, cz: 0, scale: 0.3 }, 800, 600);
    const { ctx, calls } = recordingContext();

    renderScene(ctx, store.state, far, NO_OVERLAYS);

    // only the casing and the link itself, no chevron strokes
    expect(calls.filter((call) => call.op === "lineTo")).toHaveLength(2);
  });

  it("gives subprio waypoints a square and selection a cyan ring", () => {
    store.update((s) => {
      const plain = addWaypoint(s.network, 0, 0, 0);
      const subprio = addWaypoint(s.network, 10, 0, 0);
      subprio.flags = FLAG_SUBPRIO;
      s.selection = new Set([plain.id]);
    });
    const { ctx, styles, calls } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    const side = nodeRadius(VIEWPORT.scale) * 1.8;
    expect(calls.some((call) => call.op === "fillRect" && call.args[2] === side)).toBe(true);
    expect(styles).toContain(CANVAS_COLORS.nodeSubprio);
    expect(styles).toContain(CANVAS_COLORS.nodeSelected);
  });

  it("draws waypoints as rings with a dark core when zoomed in", () => {
    store.update((s) => {
      addWaypoint(s.network, 0, 0, 0);
    });
    const { ctx, styles } = recordingContext();

    renderScene(ctx, store.state, createViewport({ cx: 0, cz: 0, scale: 6 }, 800, 600), NO_OVERLAYS);

    expect(styles).toContain(CANVAS_COLORS.node);
    expect(styles).toContain(CANVAS_COLORS.nodeCore);
  });

  it("paints waypoints and their links red once a delete is pending", () => {
    store.update((s) => {
      const a = addWaypoint(s.network, 0, 0, 0);
      const b = addWaypoint(s.network, 10, 0, 0);
      connect(s.network, a.id, b.id, "oneway");
      s.pendingDeletion = new Set([a.id, b.id]);
    });
    const { ctx, styles } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(styles.filter((style) => style === CANVAS_COLORS.danger).length).toBeGreaterThanOrEqual(2);
  });

  it("shows marker pins from 1.2 px/m and labels from 2.2", () => {
    store.update((s) => {
      const waypoint = addWaypoint(s.network, 0, 0, 0);
      s.network.markers.push({ wpId: waypoint.id, name: "Farm", group: "All" });
    });

    const { ctx: far, texts: farTexts, styles: farStyles } = recordingContext();
    renderScene(far, store.state, createViewport({ cx: 0, cz: 0, scale: 1.5 }, 800, 600), NO_OVERLAYS);
    expect(farStyles).toContain(CANVAS_COLORS.marker);
    expect(farTexts()).not.toContain("Farm");

    const { ctx: near, texts: nearTexts } = recordingContext();
    renderScene(near, store.state, createViewport({ cx: 0, cz: 0, scale: 3 }, 800, 600), NO_OVERLAYS);
    expect(nearTexts()).toContain("Farm");
  });

  it("draws terrain and world icons when a background is loaded", () => {
    store.update((s) => {
      s.background = {
        canvas: { width: 4, height: 4 } as HTMLCanvasElement,
        field: { samples: 2, sizeMeters: 1, values: new Uint16Array(4) },
        sizeMeters: 100,
        mapTitle: "Test",
        placeables: [{ x: 0, z: 0, label: "silo" }],
        vehicles: [{ x: 10, z: 10, label: "tractor" }],
        hasGroundTextures: true,
      };
    });
    const { ctx, styles, ops, texts } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(ops()).toContain("drawImage");
    expect(styles).toContain(CANVAS_COLORS.worldIcon);
    expect(texts()).toEqual(expect.arrayContaining(["silo", "tractor"]));
  });

  it("keeps terrain texels crisp when magnified and smooths them when minified", () => {
    store.update((s) => {
      s.background = {
        canvas: { width: 4, height: 4 } as HTMLCanvasElement,
        field: { samples: 2, sizeMeters: 1, values: new Uint16Array(4) },
        sizeMeters: 100,
        mapTitle: "Test",
        placeables: [],
        vehicles: [],
        hasGroundTextures: true,
      };
    });

    // one texel per metre: above 1 px/m a texel covers more than a pixel
    const zoomedIn = recordingContext();
    renderScene(zoomedIn.ctx, store.state, createViewport({ cx: 0, cz: 0, scale: 4 }, 800, 600), NO_OVERLAYS);
    expect(zoomedIn.smoothingAt("drawImage")).toBe(false);

    const zoomedOut = recordingContext();
    renderScene(
      zoomedOut.ctx,
      store.state,
      createViewport({ cx: 0, cz: 0, scale: 0.4 }, 800, 600),
      NO_OVERLAYS
    );
    expect(zoomedOut.smoothingAt("drawImage")).toBe(true);
  });

  it("hides world icons when the setting is off", () => {
    store.update((s) => {
      s.settings.showIcons = false;
      s.background = {
        canvas: { width: 4, height: 4 } as HTMLCanvasElement,
        field: { samples: 2, sizeMeters: 1, values: new Uint16Array(4) },
        sizeMeters: 100,
        mapTitle: "Test",
        placeables: [{ x: 0, z: 0, label: "silo" }],
        vehicles: [],
        hasGroundTextures: false,
      };
    });
    const { ctx, texts } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(texts()).not.toContain("silo");
  });

  it("draws the pending connection to the cursor", () => {
    store.update((s) => {
      const id = addWaypoint(s.network, 0, 0, 0).id;
      s.pendingConnectFrom = id;
    });
    const { ctx, styles } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, { cursor: { x: 20, z: 20 }, marquee: null });

    expect(styles).toContain(CANVAS_COLORS.pending);
  });

  it("draws the blueprint ghost with its rotation circle at the cursor", () => {
    store.update((s) => {
      const a = addWaypoint(s.network, 0, 0, 0);
      const b = addWaypoint(s.network, 10, 0, 0);
      connect(s.network, a.id, b.id, "oneway");
      const blueprint = captureBlueprint(s.network, new Set([a.id, b.id]), "pair")!;
      s.placement = { blueprint, rotation: 0 };
    });
    const { ctx, styles, calls } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, { cursor: { x: 50, z: 50 }, marquee: null });

    expect(styles).toContain(CANVAS_COLORS.blueprint);
    // the 42 m rotation circle
    expect(calls.some((call) => call.op === "arc" && call.args[2] === 42 * VIEWPORT.scale)).toBe(true);
  });

  it("draws the rubber band as a filled dashed rectangle", () => {
    const { ctx, ops, styles, dashes } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, { cursor: null, marquee: { x0: 10, y0: 10, x1: 100, y1: 80 } });

    expect(ops()).toContain("strokeRect");
    expect(styles).toContain(CANVAS_COLORS.rubberBandFill);
    expect(dashes).toContainEqual([4, 3]);
  });
});

describe("canvas sizing rules", () => {
  it("clamps the waypoint radius to the spec range", () => {
    expect(nodeRadius(0.01)).toBe(2.2);
    expect(nodeRadius(1000)).toBe(7);
    expect(nodeRadius(4)).toBeCloseTo(3.8);
  });

  it("clamps the link width and derives casing and chevron spacing from it", () => {
    expect(linkWidth(0.01)).toBe(1.2);
    expect(linkWidth(1000)).toBe(3.4);
    expect(casingWidth(4)).toBe(linkWidth(4) + 3);
    expect(chevronSpacing(0.01)).toBe(16);
    expect(chevronSpacing(1000)).toBeCloseTo(9 * 3.4);
  });
});
