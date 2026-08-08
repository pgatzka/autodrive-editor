import { useEffect } from "react";
import { dismissToast } from "../../state/feedback";
import { store, Toast } from "../../state/store";
import { useStore } from "../../state/useStore";
import { Button } from "../components/controls";

/** Toasts sit over the canvas, top-right, and expire on their own. */
export function Toasts() {
  const state = useStore();
  return (
    <div className="toast-stack">
      {state.toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), toast.timeoutMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.timeoutMs]);

  return (
    <div className={`toast ${toast.kind}`} role="status">
      <span className="bar" />
      <div className="content">
        <span className="title">{toast.title}</span>
        {toast.detail && <span className="detail">{toast.detail}</span>}
      </div>
      {toast.undo && (
        <Button
          small
          onClick={() => {
            toast.undo?.();
            dismissToast(toast.id);
            store.update((s) => (s.statusMessage = "Undone"));
          }}
        >
          Undo
        </Button>
      )}
    </div>
  );
}
