import { loadBackgroundFrom, pickBackgroundFolder } from "../../files/fileio";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";
import { CheckboxField, Field } from "../components/Field";

/** Terrain background loaded from an FS25 savegame folder. */
export function BackgroundPanel() {
  const state = useStore();
  const background = state.background;

  return (
    <div>
      <h4>Map background</h4>
      {background ? (
        <p className="hint">
          {background.mapTitle || "Unknown map"} · {background.sizeMeters} m ·{" "}
          {background.hasGroundTextures ? "ground textures" : "elevation only"} ·{" "}
          {background.placeables.length} placeables · {background.vehicles.length} vehicles
        </p>
      ) : (
        <p className="hint">
          Loaded automatically when you open an AutoDrive_config.xml inside a savegame folder, or pick the
          folder manually. New nodes get their height from the real terrain.
        </p>
      )}

      <div className="row">
        <button onClick={() => void pickBackgroundFolder()}>Load savegame folder…</button>
        {background && state.filePath && (
          <button onClick={() => void loadBackgroundFrom(state.filePath!, false)}>Reload</button>
        )}
        {background && (
          <button className="danger" onClick={() => store.update((s) => (s.background = null))}>
            Clear
          </button>
        )}
      </div>

      {background && (
        <>
          <Field label={`Opacity: ${Math.round(state.settings.backgroundOpacity * 100)}%`}>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(state.settings.backgroundOpacity * 100)}
              onChange={(event) =>
                store.update((s) => (s.settings.backgroundOpacity = Number(event.target.value) / 100))
              }
            />
          </Field>
          <CheckboxField
            label="Show placeables & vehicles"
            checked={state.settings.showIcons}
            onChange={(checked) => store.update((s) => (s.settings.showIcons = checked))}
          />
        </>
      )}
    </div>
  );
}
