import { useEffect, useRef } from "react";
import { placedPositions, stampBlueprint } from "../model/blueprint";
import {
  addWaypoint,
  allEdges,
  connect,
  connectAcrossGrid,
  connectionBetween,
  cycleConnection,
  estimateY,
} from "../model/graph";
import { FLAG_SUBPRIO, RouteNetwork, Waypoint } from "../model/types";
import { store } from "../state/store";
import { useStore } from "../state/useStore";

const COLORS = {
  background: "#3a5a40",
  gridMinor: "rgba(255,255,255,0.07)",
  gridMajor: "rgba(255,255,255,0.16)",
  oneway: "#7ddc7d",
  dual: "#6fb3ff",
  reverse: "#ffab52",
  node: "#e05555",
  nodeSubprio: "#f0c93f",
  nodeSelected: "#ffffff",
  marker: "#ffd83d",
  ghost: "rgba(255,255,255,0.55)",
  marquee: "rgba(120,180,255,0.25)",
  marqueeBorder: "rgba(120,180,255,0.9)",
};

interface DragState {
  kind: "pan" | "move" | "marquee";
  startScreen: { x: number; y: number };
  startView?: { cx: number; cz: number };
  /** original positions of moved nodes */
  moveOrigin?: Map<number, { x: number; z: number }>;
  grabbedId?: number;
  marqueeEnd?: { x: number; y: number };
  additive?: boolean;
  moved?: boolean;
}

export function cursorWorld(canvas: HTMLCanvasElement, ev: { clientX: number; clientY: number }) {
  const rect = canvas.getBoundingClientRect();
  const { view } = store.state;
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;
  return {
    x: (sx - rect.width / 2) / view.scale + view.cx,
    z: (sy - rect.height / 2) / view.scale + view.cz,
    sx,
    sy,
  };
}

function findNodeAt(net: RouteNetwork, wx: number, wz: number, scale: number): Waypoint | null {
  const hitRadius = Math.max(6 / scale, 0.8);
  let best: Waypoint | null = null;
  let bestDist = hitRadius * hitRadius;
  for (const wp of net.waypoints.values()) {
    const d = (wp.x - wx) * (wp.x - wx) + (wp.z - wz) * (wp.z - wz);
    if (d <= bestDist) {
      best = wp;
      bestDist = d;
    }
  }
  return best;
}

export function EditorCanvas({ onCursor }: { onCursor: (x: number, z: number) => void }) {
  useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const lastAddedRef = useRef<number | null>(null);
  const ghostPosRef = useRef<{ x: number; z: number } | null>(null);
  const rafRef = useRef(0);

  // ---------- rendering ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let disposed = false;
    const draw = () => {
      if (disposed) return;
      const parent = canvas.parentElement;
      if (parent) {
        const dpr = window.devicePixelRatio || 1;
        const w = parent.clientWidth;
        const h = parent.clientHeight;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        render(ctx, w, h);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const render = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = store.state;
    const { view, network } = s;
    const toSX = (wx: number) => (wx - view.cx) * view.scale + w / 2;
    const toSY = (wz: number) => (wz - view.cz) * view.scale + h / 2;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    // grid
    const grid = s.settings.gridSize;
    if (grid > 0 && grid * view.scale >= 6) {
      const minWX = view.cx - w / 2 / view.scale;
      const maxWX = view.cx + w / 2 / view.scale;
      const minWZ = view.cz - h / 2 / view.scale;
      const maxWZ = view.cz + h / 2 / view.scale;
      ctx.lineWidth = 1;
      for (let gx = Math.floor(minWX / grid) * grid; gx <= maxWX; gx += grid) {
        const major = Math.round(gx / grid) % 10 === 0;
        ctx.strokeStyle = major ? COLORS.gridMajor : COLORS.gridMinor;
        ctx.beginPath();
        ctx.moveTo(toSX(gx), 0);
        ctx.lineTo(toSX(gx), h);
        ctx.stroke();
      }
      for (let gz = Math.floor(minWZ / grid) * grid; gz <= maxWZ; gz += grid) {
        const major = Math.round(gz / grid) % 10 === 0;
        ctx.strokeStyle = major ? COLORS.gridMajor : COLORS.gridMinor;
        ctx.beginPath();
        ctx.moveTo(0, toSY(gz));
        ctx.lineTo(w, toSY(gz));
        ctx.stroke();
      }
    }

    const margin = 40;
    const visible = (sx: number, sy: number) => sx >= -margin && sx <= w + margin && sy >= -margin && sy <= h + margin;

    // edges
    ctx.lineWidth = Math.min(Math.max(view.scale * 0.35, 1), 4);
    const drawArrows = view.scale > 1.2;
    for (const edge of allEdges(network)) {
      const a = network.waypoints.get(edge.from)!;
      const b = network.waypoints.get(edge.to)!;
      const ax = toSX(a.x);
      const ay = toSY(a.z);
      const bx = toSX(b.x);
      const by = toSY(b.z);
      if (!visible(ax, ay) && !visible(bx, by)) continue;
      ctx.strokeStyle = edge.kind === "dual" ? COLORS.dual : edge.kind === "reverse" ? COLORS.reverse : COLORS.oneway;
      ctx.setLineDash(edge.kind === "reverse" ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      if (drawArrows && edge.kind !== "dual") {
        drawArrowHead(ctx, ax, ay, bx, by);
      }
    }

    // pending connect line
    if (s.pendingConnectFrom !== null && ghostPosRef.current) {
      const from = network.waypoints.get(s.pendingConnectFrom);
      if (from) {
        ctx.strokeStyle = COLORS.ghost;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(toSX(from.x), toSY(from.z));
        ctx.lineTo(toSX(ghostPosRef.current.x), toSY(ghostPosRef.current.z));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // nodes
    const r = Math.min(Math.max(view.scale * 0.5, 3), 9);
    const markerByWp = new Map(network.markers.map((m) => [m.wpId, m]));
    for (const wp of network.waypoints.values()) {
      const sx = toSX(wp.x);
      const sy = toSY(wp.z);
      if (!visible(sx, sy)) continue;
      const selected = s.selection.has(wp.id);
      ctx.fillStyle = (wp.flags & FLAG_SUBPRIO) !== 0 ? COLORS.nodeSubprio : COLORS.node;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = COLORS.nodeSelected;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (wp.id === s.pendingConnectFrom) {
        ctx.strokeStyle = COLORS.ghost;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      const marker = markerByWp.get(wp.id);
      if (marker) {
        ctx.fillStyle = COLORS.marker;
        ctx.beginPath();
        ctx.moveTo(sx, sy - r - 10);
        ctx.lineTo(sx + 6, sy - r - 3);
        ctx.lineTo(sx - 6, sy - r - 3);
        ctx.closePath();
        ctx.fill();
        if (view.scale > 0.8) {
          ctx.font = "12px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(marker.name, sx, sy - r - 14);
        }
      }
    }

    // blueprint ghost
    if (s.placement && ghostPosRef.current) {
      const positions = placedPositions(s.placement.blueprint, {
        x: ghostPosRef.current.x,
        z: ghostPosRef.current.z,
        rotation: s.placement.rotation,
      });
      ctx.strokeStyle = COLORS.ghost;
      ctx.lineWidth = 1.5;
      for (const e of s.placement.blueprint.edges) {
        ctx.beginPath();
        ctx.moveTo(toSX(positions[e.from].x), toSY(positions[e.from].z));
        ctx.lineTo(toSX(positions[e.to].x), toSY(positions[e.to].z));
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.ghost;
      for (const p of positions) {
        ctx.beginPath();
        ctx.arc(toSX(p.x), toSY(p.z), Math.max(r - 1, 2), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // marquee
    const drag = dragRef.current;
    if (drag?.kind === "marquee" && drag.marqueeEnd) {
      const x0 = Math.min(drag.startScreen.x, drag.marqueeEnd.x);
      const y0 = Math.min(drag.startScreen.y, drag.marqueeEnd.y);
      const bw = Math.abs(drag.marqueeEnd.x - drag.startScreen.x);
      const bh = Math.abs(drag.marqueeEnd.y - drag.startScreen.y);
      ctx.fillStyle = COLORS.marquee;
      ctx.fillRect(x0, y0, bw, bh);
      ctx.strokeStyle = COLORS.marqueeBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, bw, bh);
    }
  };

  // ---------- interaction ----------

  const onWheel = (ev: React.WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, z } = cursorWorld(canvas, ev);
    store.update((s) => {
      const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newScale = Math.min(Math.max(s.view.scale * factor, 0.05), 60);
      // keep the point under the cursor fixed
      s.view.cx = x - (x - s.view.cx) * (s.view.scale / newScale);
      s.view.cz = z - (z - s.view.cz) * (s.view.scale / newScale);
      s.view.scale = newScale;
    });
  };

  const onMouseDown = (ev: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = store.state;
    const { x, z, sx, sy } = cursorWorld(canvas, ev);

    // pan: middle button, or right button, or space is handled via browser default suppression
    if (ev.button === 1 || ev.button === 2) {
      dragRef.current = {
        kind: "pan",
        startScreen: { x: sx, y: sy },
        startView: { cx: s.view.cx, cz: s.view.cz },
      };
      return;
    }
    if (ev.button !== 0) return;

    switch (s.tool) {
      case "select": {
        const hit = findNodeAt(s.network, x, z, s.view.scale);
        if (hit) {
          if (ev.shiftKey) {
            store.update((st) => {
              if (st.selection.has(hit.id)) st.selection.delete(hit.id);
              else st.selection.add(hit.id);
            });
          } else if (!s.selection.has(hit.id)) {
            store.update((st) => (st.selection = new Set([hit.id])));
          }
          if (store.state.selection.has(hit.id)) {
            const origin = new Map<number, { x: number; z: number }>();
            for (const id of store.state.selection) {
              const wp = s.network.waypoints.get(id);
              if (wp) origin.set(id, { x: wp.x, z: wp.z });
            }
            dragRef.current = { kind: "move", startScreen: { x: sx, y: sy }, moveOrigin: origin, grabbedId: hit.id, moved: false };
          }
        } else {
          dragRef.current = {
            kind: "marquee",
            startScreen: { x: sx, y: sy },
            marqueeEnd: { x: sx, y: sy },
            additive: ev.shiftKey,
          };
        }
        break;
      }
      case "add": {
        const px = store.snap(x);
        const pz = store.snap(z);
        store.mutate((st) => {
          const y = estimateY(st.network, px, pz);
          const wp = addWaypoint(st.network, px, y, pz);
          const prev = lastAddedRef.current;
          if (ev.ctrlKey && prev !== null && st.network.waypoints.has(prev)) {
            connect(st.network, prev, wp.id, st.settings.connectionMode);
          }
          lastAddedRef.current = wp.id;
          st.statusMessage = `Node ${wp.id} at ${px.toFixed(1)}, ${pz.toFixed(1)}`;
        });
        break;
      }
      case "connect": {
        const hit = findNodeAt(s.network, x, z, s.view.scale);
        if (!hit) break;
        if (s.pendingConnectFrom === null || s.pendingConnectFrom === hit.id) {
          store.update((st) => (st.pendingConnectFrom = hit.id));
        } else {
          const from = s.pendingConnectFrom;
          store.mutate((st) => {
            if (connectionBetween(st.network, from, hit.id)) {
              cycleConnection(st.network, from, hit.id);
              const now = connectionBetween(st.network, from, hit.id);
              st.statusMessage = now ? `Connection ${now.from} → ${now.to}: ${now.kind}` : "Connection removed";
            } else {
              connect(st.network, from, hit.id, st.settings.connectionMode);
              st.statusMessage = `Connected ${from} → ${hit.id} (${st.settings.connectionMode})`;
            }
            st.pendingConnectFrom = hit.id;
          });
        }
        break;
      }
      case "gridroute": {
        const hit = findNodeAt(s.network, x, z, s.view.scale);
        if (!hit) break;
        if (s.pendingConnectFrom === null || s.pendingConnectFrom === hit.id) {
          store.update((st) => (st.pendingConnectFrom = hit.id));
        } else {
          const from = s.pendingConnectFrom;
          store.mutate((st) => {
            const created = connectAcrossGrid(st.network, from, hit.id, st.settings.gridSize, st.settings.connectionMode);
            st.statusMessage = `Grid route ${from} → ${hit.id}: ${created.length} nodes inserted`;
            st.pendingConnectFrom = hit.id;
          });
        }
        break;
      }
      case "place": {
        if (!s.placement) break;
        const px = store.snap(x);
        const pz = store.snap(z);
        const placement = s.placement;
        store.mutate((st) => {
          const baseY = estimateY(st.network, px, pz);
          const ids = stampBlueprint(st.network, placement.blueprint, { x: px, z: pz, rotation: placement.rotation }, baseY);
          st.selection = new Set(ids);
          st.statusMessage = `Placed "${placement.blueprint.name}" (${ids.length} nodes) — click to stamp again, Esc to finish`;
        });
        break;
      }
    }
  };

  const onMouseMove = (ev: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, z, sx, sy } = cursorWorld(canvas, ev);
    const s = store.state;
    ghostPosRef.current = { x: store.snap(x), z: store.snap(z) };
    onCursor(x, z);

    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan" && drag.startView) {
      store.update((st) => {
        st.view.cx = drag.startView!.cx - (sx - drag.startScreen.x) / st.view.scale;
        st.view.cz = drag.startView!.cz - (sy - drag.startScreen.y) / st.view.scale;
      });
    } else if (drag.kind === "move" && drag.moveOrigin && drag.grabbedId !== undefined) {
      const origin = drag.moveOrigin.get(drag.grabbedId);
      if (!origin) return;
      const rawDX = (sx - drag.startScreen.x) / s.view.scale;
      const rawDZ = (sy - drag.startScreen.y) / s.view.scale;
      // snap the grabbed node, move the rest rigidly with it
      const dx = store.snap(origin.x + rawDX) - origin.x;
      const dz = store.snap(origin.z + rawDZ) - origin.z;
      drag.moved = drag.moved || Math.abs(rawDX) > 0.01 || Math.abs(rawDZ) > 0.01;
      store.update((st) => {
        for (const [id, o] of drag.moveOrigin!) {
          const wp = st.network.waypoints.get(id);
          if (wp) {
            wp.x = o.x + dx;
            wp.z = o.z + dz;
          }
        }
      });
    } else if (drag.kind === "marquee") {
      drag.marqueeEnd = { x: sx, y: sy };
      store.notify();
    }
  };

  const onMouseUp = () => {
    const canvas = canvasRef.current;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!canvas || !drag) return;

    if (drag.kind === "move" && drag.moveOrigin) {
      if (!drag.moved) return;
      // positions were updated live; convert the net displacement into one undoable mutation
      const finalPositions = new Map<number, { x: number; z: number }>();
      for (const id of drag.moveOrigin.keys()) {
        const wp = store.state.network.waypoints.get(id);
        if (wp) finalPositions.set(id, { x: wp.x, z: wp.z });
      }
      // restore originals, then re-apply as a mutation so undo captures the pre-drag state
      store.update((st) => {
        for (const [id, o] of drag.moveOrigin!) {
          const wp = st.network.waypoints.get(id);
          if (wp) {
            wp.x = o.x;
            wp.z = o.z;
          }
        }
      });
      store.mutate((st) => {
        for (const [id, p] of finalPositions) {
          const wp = st.network.waypoints.get(id);
          if (wp) {
            wp.x = p.x;
            wp.z = p.z;
          }
        }
        st.statusMessage = `Moved ${finalPositions.size} node(s)`;
      });
    } else if (drag.kind === "marquee" && drag.marqueeEnd) {
      const rect = canvas.getBoundingClientRect();
      const { view } = store.state;
      const toWX = (px: number) => (px - rect.width / 2) / view.scale + view.cx;
      const toWZ = (py: number) => (py - rect.height / 2) / view.scale + view.cz;
      const x0 = Math.min(toWX(drag.startScreen.x), toWX(drag.marqueeEnd.x));
      const x1 = Math.max(toWX(drag.startScreen.x), toWX(drag.marqueeEnd.x));
      const z0 = Math.min(toWZ(drag.startScreen.y), toWZ(drag.marqueeEnd.y));
      const z1 = Math.max(toWZ(drag.startScreen.y), toWZ(drag.marqueeEnd.y));
      const clickOnly = Math.abs(drag.startScreen.x - drag.marqueeEnd.x) < 3 && Math.abs(drag.startScreen.y - drag.marqueeEnd.y) < 3;
      store.update((st) => {
        const picked = new Set<number>(drag.additive ? st.selection : []);
        if (!clickOnly) {
          for (const wp of st.network.waypoints.values()) {
            if (wp.x >= x0 && wp.x <= x1 && wp.z >= z0 && wp.z <= z1) picked.add(wp.id);
          }
        }
        st.selection = picked;
        if (!clickOnly) st.statusMessage = `${picked.size} node(s) selected`;
      });
    }
  };

  return (
    <div className="editor-canvas">
      <canvas
        ref={canvasRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => (dragRef.current = null)}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

function drawArrowHead(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) {
  const mx = ax + (bx - ax) * 0.6;
  const my = ay + (by - ay) * 0.6;
  const angle = Math.atan2(by - ay, bx - ax);
  const size = 7;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(mx - size * Math.cos(angle - 0.45), my - size * Math.sin(angle - 0.45));
  ctx.moveTo(mx, my);
  ctx.lineTo(mx - size * Math.cos(angle + 0.45), my - size * Math.sin(angle + 0.45));
  ctx.stroke();
}
