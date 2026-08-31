// src/lib/device.ts
// Mobile detection. Server reads User-Agent for initial DOM hint;
// client uses matchMedia for the authoritative answer (avoids
// hydration mismatch — never call navigator.userAgent at module top level
// in a client component).

import { useEffect, useState } from "react";

export function isMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
}

const MOBILE_QUERY = "(pointer: coarse) and (max-width: 900px)";

function hasMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

/**
 * Authoritative client-side mobile detection. Returns false during SSR
 * and the first paint, then updates on hydration and on media-query
 * changes (rotation, foldables, etc.).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    if (!hasMatchMedia()) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };
    handler(mql);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    // Legacy Safari fallback.
    const legacy = mql as unknown as {
      addListener: (cb: (e: MediaQueryListEvent) => void) => void;
      removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
    };
    legacy.addListener(handler);
    return () => legacy.removeListener(handler);
  }, []);

  return isMobile;
}