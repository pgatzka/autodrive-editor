import { newConfig, openConfig, saveConfig } from "../files/fileio";
import { discardBlueprintEditor, saveBlueprintEditor } from "../state/blueprintSession";
import { store } from "../state/store";
import { useStore } from "../state/useStore";
import { Button } from "./components/controls";
import { Wordmark } from "./Wordmark";

/**
 * Row 1 — per-session actions: who you are, what file you are in, saving.
 * In the blueprint workspace the same row carries the blueprint's own
 * controls, in the same position, so the swap reads as a change of job.
 */
export function TitleBar() {
  const state = useStore();

  return (
    <header className="titlebar">
      <Wordmark />
      {state.blueprintEdit ? <BlueprintControls /> : <FileControls />}
    </header>
  );
}

function FileControls() {
  const state = useStore();

  return (
    <>
      <div className="strip-group">
        <Button variant="ghost" onClick={() => newConfig()}>
          New
        </Button>
        <Button variant="ghost" onClick={() => void openConfig()}>
          Open…
        </Button>
        {/* the button itself is the unsaved indicator: filled only when dirty */}
        <Button variant={state.dirty ? "primary" : "ghost"} onClick={() => void saveConfig(false)}>
          Save
        </Button>
        <Button variant="ghost" onClick={() => void saveConfig(true)}>
          Save As…
        </Button>
      </div>

      <div className="path-chip" title={state.filePath ?? "No file open"}>
        {state.filePath ? shortenPath(state.filePath) : "No file open"}
        {/* state repeated as text for anyone who misses the colour */}
        {state.dirty && <span className="unsaved">● unsaved</span>}
      </div>
    </>
  );
}

function BlueprintControls() {
  const state = useStore();
  const session = state.blueprintEdit;
  if (!session) return null;

  return (
    <>
      <div className="strip-group">
        <span className="eyebrow">Blueprint</span>
        <input
          className="input"
          style={{ width: 180 }}
          value={session.name}
          aria-label="Blueprint name"
          onChange={(event) =>
            store.update((s) => {
              if (s.blueprintEdit) s.blueprintEdit = { ...s.blueprintEdit, name: event.target.value };
            })
          }
        />
        <Button variant="primary" onClick={() => saveBlueprintEditor(false)}>
          Save
        </Button>
        <Button onClick={() => saveBlueprintEditor(true)}>Save &amp; close</Button>
        <Button variant="ghost" onClick={() => discardBlueprintEditor()}>
          Discard
        </Button>
      </div>
      <div className="path-chip">Blueprint workspace — your map is not affected</div>
    </>
  );
}

/** Keep the savegame folder and file name; the rest is noise in 46% of a row. */
export function shortenPath(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts.length <= 2 ? path : `…/${parts.slice(-2).join("/")}`;
}
