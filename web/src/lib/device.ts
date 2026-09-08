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
const PORTRAIT_QUERY = "(orientation: portrait)";

function hasMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function listen(
  mql: MediaQueryList,
  handler: (e: MediaQueryListEvent | MediaQueryList) => void,
): () => void {
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
}

/**
 * Authoritative client-side detection of the MOBILE CONTROL MODE
 * (touch-primary device: coarse pointer + phone/tablet viewport). Desktop
 * and laptops with a fine pointer never enter this mode, even if the window
 * is narrow. Returns false during SSR and the first paint, then updates on
 * hydration and media-query changes (rotation, foldables, window resizes).
 */
export function useIsMobileControlMode(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    if (!hasMatchMedia()) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };
    handler(mql);
    return listen(mql, handler);
  }, []);

  return isMobile;
}

/** Backwards-compatible alias for useIsMobileControlMode. */
export function useIsMobile(): boolean {
  return useIsMobileControlMode();
}

/**
 * Current screen orientation. Returns "landscape" during SSR and the first
 * paint (the game's intended orientation), then tracks orientation changes.
 */
export function useOrientation(): "portrait" | "landscape" {
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    "landscape",
  );

  useEffect(() => {
    if (!hasMatchMedia()) return;
    const mql = window.matchMedia(PORTRAIT_QUERY);
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setOrientation(e.matches ? "portrait" : "landscape");
    };
    handler(mql);
    return listen(mql, handler);
  }, []);

  return orientation;
}