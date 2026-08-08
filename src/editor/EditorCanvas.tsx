import { useEffect, useRef } from "react";
import { store } from "../state/store";
import { renderScene } from "./renderScene";
import { useCanvasInteraction } from "./useCanvasInteraction";
import { createViewport } from "./viewport";

interface EditorCanvasProps {
  onCursorMove: (x: number, z: number) => void;
}

/**
 * Hosts the canvas element: keeps its backing store sized to the element,
 * runs the animation frame loop, and forwards pointer events. Drawing lives
 * in renderScene, interaction in useCanvasInteraction.
 */
export function EditorCanvas({ onCursorMove }: EditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const interaction = useCanvasInteraction(canvasRef, onCursorMove);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frame = 0;
    const draw = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        resizeCanvas(canvas, ctx, width, height);
        renderScene(ctx, store.state, createViewport(store.state.view, width, height), {
          cursor: interaction.cursorRef.current,
          marquee: interaction.marqueeRef.current,
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [interaction.cursorRef, interaction.marqueeRef]);

  return (
    <div className="editor-canvas">
      <canvas
        ref={canvasRef}
        onWheel={interaction.onWheel}
        onMouseDown={interaction.onMouseDown}
        onMouseMove={interaction.onMouseMove}
        onMouseUp={interaction.onMouseUp}
        onMouseLeave={interaction.onMouseLeave}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}

/** Match the backing store to the CSS size at device pixel ratio. */
function resizeCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
