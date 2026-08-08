import { useEffect } from "react";
import { handleShortcut } from "./shortcuts";

/** Binds the keyboard policy in `shortcuts.ts` to the window. */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (handleShortcut(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
