import { useState } from "react";
import { exportBlueprintFile, importBlueprintFiles, persistBlueprintLibrary } from "../files/fileio";
import { captureBlueprint } from "../model/blueprint";
import {
  connect,
  connectionBetween,
  deleteWaypoints,
  disconnect,
  evenlySpaceChain,
  insertMidpoint,
  orderAsChain,
  setFlagOn,
  smoothCurve,
} from "../model/graph";
import { FLAG_SUBPRIO, FLAG_TRAFFIC_SYSTEM } from "../model/types";
import { store } from "../state/store";
import { useStore } from "../state/useStore";
import { UpdatePanel } from "./UpdatePanel";

type Tab = "selection" | "markers" | "blueprints" | "file";

export function Sidebar() {
  const [tab, setTab] = useState<Tab>("selection");
  return (
    <div className="sidebar">
      <div className="tabs">
        {(["selection", "markers", "blueprints", "file"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t === "selection" ? "Selection" : t === "markers" ? "Markers" : t === "blueprints" ? "Blueprints" : "File"}
          </button>
        ))}
      </div>
      <div className="panel">
        {tab === "selection" && <SelectionPanel />}
        {tab === "markers" && <MarkersPanel />}
        {tab === "blueprints" && <BlueprintsPanel />}
        {tab === "file" && <FilePanel />}
      </div>
    </div>
  );
}

// ---------------- Selection ----------------

function SelectionPanel() {
  const s = useStore();
  const ids = Array.from(s.selection);
  const wps = ids.map((id) => s.network.waypoints.get(id)).filter((wp) => wp !== undefined);
  const pair = wps.length === 2 ? connectionBetween(s.network, wps[0].id, wps[1].id) : null;
  const allSubprio = wps.length > 0 && wps.every((wp) => (wp.flags & FLAG_SUBPRIO) !== 0);
  const allTraffic = wps.length > 0 && wps.every((wp) => (wp.flags & FLAG_TRAFFIC_SYSTEM) !== 0);

  if (wps.length === 0) {
    return <p className="hint">Nothing selected. Click or box-select nodes with the Select tool.</p>;
  }

  return (
    <div>
      <h3>{wps.length} node(s) selected</h3>
      {wps.length === 1 && (
        <p className="hint">
          #{wps[0].id} — x {wps[0].x.toFixed(2)}, y {wps[0].y.toFixed(2)}, z {wps[0].z.toFixed(2)}
        </p>
      )}

      <h4>Flags</h4>
      <label className="row">
        <input
          type="checkbox"
          checked={allSubprio}
          onChange={(e) => store.mutate((st) => setFlagOn(st.network, ids, FLAG_SUBPRIO, e.target.checked))}
        />
        Subprio (avoided unless needed — pathfinding cost ×20)
      </label>
      <label className="row">
        <input
          type="checkbox"
          checked={allTraffic}
          onChange={(e) => store.mutate((st) => setFlagOn(st.network, ids, FLAG_TRAFFIC_SYSTEM, e.target.checked))}
        />
        Traffic system
      </label>

      {wps.length === 1 && <MarkerEditor wpId={wps[0].id} />}

      <h4>Route tools</h4>
      <div className="btn-col">
        {wps.length === 2 && (
          <>
            <button
              onClick={() =>
                store.mutate((st) => {
                  connect(st.network, wps[0].id, wps[1].id, st.settings.connectionMode);
                  st.statusMessage = `Connected ${wps[0].id} → ${wps[1].id}`;
                })
              }
            >
              Connect ({s.settings.connectionMode})
            </button>
            {pair && (
              <button
                onClick={() =>
                  store.mutate((st) => {
                    disconnect(st.network, wps[0].id, wps[1].id);
                    st.statusMessage = "Disconnected";
                  })
                }
              >
                Disconnect
              </button>
            )}
            {pair && (
              <button
                onClick={() =>
                  store.mutate((st) => {
                    const mid = insertMidpoint(st.network, wps[0].id, wps[1].id);
                    if (mid !== null) st.selection = new Set([mid]);
                    st.statusMessage = mid !== null ? "Midpoint inserted" : "Nodes are not connected";
                  })
                }
              >
                Insert midpoint
              </button>
            )}
            <button
              onClick={() =>
                store.mutate((st) => {
                  const created = smoothCurve(st.network, wps[0].id, wps[1].id, st.settings.curveSegments, st.settings.connectionMode);
                  st.statusMessage = created.length ? `Curve with ${created.length} nodes created` : "Could not create curve";
                })
              }
            >
              Smooth curve ({s.settings.curveSegments} segments)
            </button>
            <label className="row">
              Segments:
              <input
                type="number"
                min={2}
                max={64}
                value={s.settings.curveSegments}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (v >= 2 && v <= 64) store.update((st) => (st.settings.curveSegments = v));
                }}
                style={{ width: 56 }}
              />
            </label>
          </>
        )}
        {wps.length >= 3 && (
          <button
            onClick={() =>
              store.mutate((st) => {
                const chain = orderAsChain(st.network, new Set(ids));
                if (chain) {
                  evenlySpaceChain(st.network, chain);
                  st.statusMessage = `Spaced ${chain.length} nodes evenly`;
                } else {
                  st.statusMessage = "Selection is not a single unbranched path";
                }
              })
            }
          >
            Space evenly along path
          </button>
        )}
        <button
          className="danger"
          onClick={() =>
            store.mutate((st) => {
              deleteWaypoints(st.network, ids);
              st.selection = new Set();
              st.statusMessage = `Deleted ${ids.length} node(s)`;
            })
          }
        >
          Delete selection
        </button>
      </div>
    </div>
  );
}

function MarkerEditor({ wpId }: { wpId: number }) {
  const s = useStore();
  const marker = s.network.markers.find((m) => m.wpId === wpId);
  const [name, setName] = useState(marker?.name ?? "");
  const [group, setGroup] = useState(marker?.group ?? "All");

  return (
    <div>
      <h4>Map marker</h4>
      <div className="row">
        <input placeholder="Marker name" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {s.network.groups.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </div>
      <div className="row">
        <button
          disabled={!name.trim()}
          onClick={() =>
            store.mutate((st) => {
              const existing = st.network.markers.find((m) => m.wpId === wpId);
              if (existing) {
                existing.name = name.trim();
                existing.group = group;
              } else {
                st.network.markers.push({ wpId, name: name.trim(), group });
              }
              st.statusMessage = `Marker "${name.trim()}" set`;
            })
          }
        >
          {marker ? "Update marker" : "Add marker"}
        </button>
        {marker && (
          <button
            className="danger"
            onClick={() =>
              store.mutate((st) => {
                st.network.markers = st.network.markers.filter((m) => m.wpId !== wpId);
                st.statusMessage = "Marker removed";
              })
            }
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------- Markers & groups ----------------

function MarkersPanel() {
  const s = useStore();
  const [newGroup, setNewGroup] = useState("");
  const byGroup = new Map<string, typeof s.network.markers>();
  for (const g of s.network.groups) byGroup.set(g, []);
  for (const m of s.network.markers) {
    if (!byGroup.has(m.group)) byGroup.set(m.group, []);
    byGroup.get(m.group)!.push(m);
  }

  const jumpTo = (wpId: number) => {
    const wp = s.network.waypoints.get(wpId);
    if (!wp) return;
    store.update((st) => {
      st.view.cx = wp.x;
      st.view.cz = wp.z;
      st.view.scale = Math.max(st.view.scale, 3);
      st.selection = new Set([wpId]);
    });
  };

  return (
    <div>
      <h3>Markers &amp; groups</h3>
      <div className="row">
        <input placeholder="New group name" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
        <button
          disabled={!newGroup.trim() || s.network.groups.includes(newGroup.trim())}
          onClick={() => {
            store.mutate((st) => st.network.groups.push(newGroup.trim()));
            setNewGroup("");
          }}
        >
          Add group
        </button>
      </div>
      {Array.from(byGroup.entries()).map(([group, markers]) => (
        <div key={group} className="group-block">
          <h4>
            {group} <span className="hint">({markers.length})</span>
            {group !== "All" && markers.length === 0 && (
              <button
                className="danger small"
                onClick={() => store.mutate((st) => (st.network.groups = st.network.groups.filter((g) => g !== group)))}
              >
                remove
              </button>
            )}
          </h4>
          {markers.map((m) => (
            <div key={m.wpId} className="row marker-row">
              <button className="link" onClick={() => jumpTo(m.wpId)}>
                {m.name}
              </button>
              <span className="hint">#{m.wpId}</span>
            </div>
          ))}
        </div>
      ))}
      {s.network.markers.length === 0 && <p className="hint">No markers yet. Select a single node to add one.</p>}
    </div>
  );
}

// ---------------- Blueprints ----------------

function BlueprintsPanel() {
  const s = useStore();
  const [name, setName] = useState("");

  return (
    <div>
      <h3>Blueprints</h3>
      <div className="row">
        <input placeholder="Blueprint name" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          disabled={s.selection.size === 0 || !name.trim()}
          title="Save the selected nodes and their connections as a reusable blueprint"
          onClick={() => {
            const bp = captureBlueprint(s.network, s.selection, name.trim());
            if (!bp) return;
            store.update((st) => {
              st.blueprints = [...st.blueprints, bp];
              st.statusMessage = `Blueprint "${bp.name}" saved (${bp.nodes.length} nodes)`;
            });
            setName("");
            void persistBlueprintLibrary();
          }}
        >
          Save selection
        </button>
      </div>
      <div className="row">
        <button onClick={() => void importBlueprintFiles()}>Import…</button>
      </div>
      {s.blueprints.length === 0 && <p className="hint">No blueprints yet. Select nodes, give it a name, hit "Save selection".</p>}
      {s.blueprints.map((bp, i) => (
        <div key={i} className="row marker-row">
          <span>
            {bp.name} <span className="hint">({bp.nodes.length} nodes)</span>
          </span>
          <span>
            <button
              title="Move the mouse over the map, R rotates, click to stamp, Esc to finish"
              onClick={() =>
                store.update((st) => {
                  st.placement = { blueprint: bp, rotation: 0 };
                  st.tool = "place";
                  st.statusMessage = `Placing "${bp.name}" — click to stamp, R rotates, Esc cancels`;
                })
              }
            >
              Place
            </button>
            <button onClick={() => void exportBlueprintFile(bp)}>Export</button>
            <button
              className="danger"
              onClick={() => {
                store.update((st) => {
                  st.blueprints = st.blueprints.filter((_, j) => j !== i);
                });
                void persistBlueprintLibrary();
              }}
            >
              ✕
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------- File info ----------------

function FilePanel() {
  const s = useStore();
  const edges = new Set<string>();
  for (const wp of s.network.waypoints.values()) {
    for (const t of wp.out) edges.add(wp.id < t ? `${wp.id}-${t}` : `${t}-${wp.id}`);
  }
  return (
    <div>
      <h3>File</h3>
      <p className="hint">{s.filePath ?? "(not saved yet)"}</p>
      <p className="hint">
        {s.network.waypoints.size} waypoints · {edges.size} connections · {s.network.markers.length} markers
      </p>
      <h4>Metadata</h4>
      <label className="col">
        Map name
        <input value={s.network.mapName} onChange={(e) => store.update((st) => (st.network.mapName = e.target.value))} />
      </label>
      <label className="col">
        Route author
        <input value={s.network.routeAuthor} onChange={(e) => store.update((st) => (st.network.routeAuthor = e.target.value))} />
      </label>
      <label className="col">
        Route version
        <input value={s.network.routeVersion} onChange={(e) => store.update((st) => (st.network.routeVersion = e.target.value))} />
      </label>
      <p className="hint">
        Settings sections of an imported AutoDrive_config.xml are preserved untouched when saving.
      </p>
      <UpdatePanel />
    </div>
  );
}
