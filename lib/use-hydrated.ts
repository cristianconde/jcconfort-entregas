import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during SSR and before hydration; true once React controls the page. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
