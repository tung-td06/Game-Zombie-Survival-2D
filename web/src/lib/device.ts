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

// Touch-primary device = coarse pointer + no hover (phones, tablets in
// touch use). Deliberately NO width cap: large phones in landscape (Pro
// Max ≈ 932px, Galaxy ≈ 915px) used to be excluded by a `max-width: 900px`
// cap, so their controls only appeared after a viewport change (pinch zoom
// re-evaluates media queries in some browsers) — the reported "no buttons
// until zoom" bug. Tablets qualify (primary pointer is touch); mouse-first
// hybrids (`pointer: fine`) never do.
const MOBILE_QUERY = "(pointer: coarse) and (hover: none)";
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
 * Initial client-side mobile state, evaluated SYNCHRONOUSLY on the first
 * client render (lazy useState initializer) — the controls don't wait for a
 * post-hydration effect to appear. Safe under SSR: `window` is undefined
 * there, so it returns false, and the components that consume this state are
 * additionally gated by a `mounted` flag, so the server DOM is never
 * contradicted during hydration.
 */
function detectMobileInitial(): boolean {
  if (typeof window === "undefined" || !hasMatchMedia()) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * Authoritative client-side detection of the MOBILE CONTROL MODE
 * (touch-primary device: coarse pointer, no hover). Desktop and laptops
 * with a fine pointer never enter this mode, even if the window is narrow.
 * The initial value is computed synchronously at first client render; the
 * effect keeps it in sync with media-query changes (rotation, foldables,
 * hybrid devices re-plugging a touch screen).
 */
export function useIsMobileControlMode(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(detectMobileInitial);

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