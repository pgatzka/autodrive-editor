import { ConfirmDialog, store, Toast, ToastKind } from "./store";

/**
 * The feedback ladder, chosen by consequence rather than by how much the app
 * wants to talk:
 *   ambient  — status bar, every action (handled by actions setting statusMessage)
 *   confirm  — toast, something left the app (4 s)
 *   loss     — toast carrying its own Undo (8 s)
 *   blocking — dialog, destruction above a threshold
 */

const CONFIRM_MS = 4000;
const UNDO_MS = 8000;

let nextToastId = 1;

export function showToast(
  kind: ToastKind,
  title: string,
  options: { detail?: string; undo?: () => void } = {}
): number {
  const toast: Toast = {
    id: nextToastId++,
    kind,
    title,
    detail: options.detail,
    undo: options.undo,
    timeoutMs: options.undo ? UNDO_MS : CONFIRM_MS,
  };
  store.update((s) => (s.toasts = [...s.toasts, toast]));
  return toast.id;
}

export function dismissToast(id: number): void {
  store.update((s) => (s.toasts = s.toasts.filter((toast) => toast.id !== id)));
}

/**
 * Ask before an irreversible-looking action. Runs immediately when the user
 * has silenced this class of confirmation for the session.
 */
export function confirmAction(dialog: ConfirmDialog): void {
  if (dialog.suppressKey && store.state.suppressedConfirmations.has(dialog.suppressKey)) {
    dialog.onConfirm();
    return;
  }
  store.update((s) => (s.dialog = dialog));
}

export function closeDialog(): void {
  store.update((s) => {
    s.dialog = null;
    s.pendingDeletion = null;
  });
}

export function suppressConfirmation(key: string): void {
  store.update((s) => s.suppressedConfirmations.add(key));
}

export function setShortcutsOpen(open: boolean): void {
  store.update((s) => (s.shortcutsOpen = open));
}
