import { loadBackgroundFrom, pickBackgroundFolder } from "../../files/fileio";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";
import { Button, Section, Toggle } from "../components/controls";

/** Terrain background loaded from an FS25 savegame folder. */
export function BackgroundPanel() {
  const state = useStore();
  const background = state.background;

  return (
    <Section title="Map background">
      {background ? (
        <p className="hint">
          {background.mapTitle || "Unknown map"} · {background.sizeMeters} m ·{" "}
          {background.hasGroundTextures ? "ground textures" : "elevation only"}
        </p>
      ) : (
        <p className="hint">
          Loaded automatically with a config inside a savegame folder. New waypoints then take their height
          from the real terrain.
        </p>
      )}

      <div className="field-row">
        <Button wide onClick={() => void pickBackgroundFolder()}>
          Load savegame folder…
        </Button>
        {background && state.filePath && (
          <Button variant="ghost" onClick={() => void loadBackgroundFrom(state.filePath!, false)}>
            Reload
          </Button>
        )}
        {background && (
          <Button variant="ghost" onClick={() => store.update((s) => (s.background = null))}>
            Clear
          </Button>
        )}
      </div>

      {background && (
        <>
          <label className="field-col">
            <span className="label">
              Terrain opacity · {Math.round(state.settings.backgroundOpacity * 100)}%
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(state.settings.backgroundOpacity * 100)}
              onChange={(event) =>
                store.update((s) => (s.settings.backgroundOpacity = Number(event.target.value) / 100))
              }
            />
          </label>
          <Toggle
            label="Show placeables & vehicles"
            checked={state.settings.showIcons}
            onChange={(checked) => store.update((s) => (s.settings.showIcons = checked))}
          />
        </>
      )}
    </Section>
  );
}
