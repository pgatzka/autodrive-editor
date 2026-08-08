import { openConfig } from "../../files/fileio";
import { clampScale } from "../../editor/viewport";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";
import { Button, Keycap } from "../components/controls";

/** Everything drawn as DOM on top of the canvas. */
export function CanvasOverlays() {
  const state = useStore();
  const empty = state.network.waypoints.size === 0 && !state.blueprintEdit;

  return (
    <>
      {state.blueprintEdit && (
        <div className="canvas-banner">Editing blueprint — your map is not affected</div>
      )}
      {empty && <FirstRun />}
      {state.placement && <PlacementHint />}
      <ZoomControls />
    </>
  );
}

/** The empty canvas still shows grid and field colour; this states the next step. */
function FirstRun() {
  return (
    <div className="canvas-empty">
      <h2>No route network open</h2>
      <p>
        Open the AutoDrive_config.xml from a savegame folder to load your network, or start an empty one and
        draw from scratch.
      </p>
      <div className="actions">
        <Button variant="primary" onClick={() => void openConfig()}>
          Open savegame folder…
        </Button>
        <Button onClick={() => store.update((s) => (s.tool = "add"))}>Start empty network</Button>
      </div>
    </div>
  );
}

/** A transient mode gets a transient affordance, gone on Esc. */
function PlacementHint() {
  const state = useStore();
  if (!state.placement) return null;
  const degrees = Math.round((state.placement.rotation * 180) / Math.PI) % 360;

  return (
    <div className="canvas-hint">
      <span className="name">{state.placement.blueprint.name}</span>
      <span className="value">{((degrees + 360) % 360).toString()}°</span>
      <span className="hint">
        <Keycap>R</Keycap> rotate 15°
      </span>
      <span className="hint">
        <Keycap>Click</Keycap> stamp
      </span>
      <span className="hint">
        <Keycap>Esc</Keycap> finish
      </span>
    </div>
  );
}

const ZOOM_BUTTON_STEP = 1.4;

function ZoomControls() {
  return (
    <div className="zoom-controls">
      <button title="Zoom in" onClick={() => zoomBy(ZOOM_BUTTON_STEP)}>
        +
      </button>
      <button title="Zoom out" onClick={() => zoomBy(1 / ZOOM_BUTTON_STEP)}>
        −
      </button>
      <button title="Fit network" onClick={fitToNetwork}>
        ⤢
      </button>
    </div>
  );
}

function zoomBy(factor: number): void {
  store.update((s) => (s.view = { ...s.view, scale: clampScale(s.view.scale * factor) }));
}

/** Frame the whole network, or return to the origin when there is nothing to frame. */
export function fitToNetwork(): void {
  store.update((s) => {
    const waypoints = Array.from(s.network.waypoints.values());
    if (waypoints.length === 0) {
      s.view = { cx: 0, cz: 0, scale: 4 };
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const waypoint of waypoints) {
      minX = Math.min(minX, waypoint.x);
      maxX = Math.max(maxX, waypoint.x);
      minZ = Math.min(minZ, waypoint.z);
      maxZ = Math.max(maxZ, waypoint.z);
    }
    const element = document.querySelector(".editor-canvas");
    const width = element instanceof HTMLElement ? element.clientWidth : 1200;
    const height = element instanceof HTMLElement ? element.clientHeight : 800;
    const scale = Math.min(width / Math.max(maxX - minX, 40), height / Math.max(maxZ - minZ, 40)) * 0.88;
    s.view = { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, scale: clampScale(scale) };
  });
}
