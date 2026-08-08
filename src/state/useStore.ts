import { useSyncExternalStore } from "react";
import { store } from "./store";

/** Re-renders the component whenever anything in the editor store changes. */
export function useStore() {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store.state;
}
