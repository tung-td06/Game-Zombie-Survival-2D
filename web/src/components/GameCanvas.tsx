"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "@/game/game";
import { renderScale } from "@/game/pixelArt";
import { useIsMobileControlMode, useOrientation } from "@/lib/device";
import TouchHUD from "./touch/TouchHUD";
import RotateOverlay from "./touch/RotateOverlay";

interface GameCanvasProps {
  mode?: string;
  room?: string;
  name?: string;
  shouldContinue?: boolean;
}

export default function GameCanvas({ mode, room, name, shouldContinue }: GameCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "closed" | "error" | "none">("none");
  // Mobile control mode = touch-primary device (coarse pointer + small
  // viewport). Desktop/laptops never enter it, so joystick events can
  // never affect desktop input.
  const isMobile = useIsMobileControlMode();
  const orientation = useOrientation();
  const isMobileRef = useRef(false);
  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  /** True when a phone must rotate: touch device held in portrait. */
  const needsRotate = isMobile && orientation === "portrait";
  const autoPausedRef = useRef(false);

  // Landscape orientation lock (with graceful fallback): ask the browser
  // to force landscape on phones. When the API is unavailable or rejected
  // (e.g. iOS Safari), the rotate overlay below handles the UX instead.
  const lockLandscape = useCallback(async () => {
    try {
      const so = (window.screen as unknown as {
        orientation?: { lock?: (o: string) => Promise<void> };
      }).orientation;
      if (so?.lock) {
        await so.lock("landscape");
      }
    } catch {
      // Denied — the rotate overlay covers the portrait case.
    }
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    void lockLandscape();
    // Some browsers only honour the lock from a user gesture; retry on the
    // first interaction so the game snaps to landscape when possible.
    const retry = () => void lockLandscape();
    window.addEventListener("pointerdown", retry, { once: true });
    return () => window.removeEventListener("pointerdown", retry);
  }, [isMobile, lockLandscape]);

  // Portrait on mobile: pause gameplay so stray touches can't kill the
  // player; back to landscape: resume the exact run state (no reload, no
  // reset). If the player had already paused, leave their state alone.
  // The game may still be booting (data load → newRun) when the overlay
  // first appears, so while portrait we re-check until the run is paused.
  useEffect(() => {
    if (!needsRotate) {
      if (autoPausedRef.current) {
        autoPausedRef.current = false;
        const g = gameRef.current;
        if (g && g.state === "PAUSED") {
          g.audio.setSfxMuted(g.save.settings.muted);
          g.audio.setPaused(false);
          g.audio.resumeMusic();
          g.state = "PLAYING";
        }
      }
      return;
    }
    const maybePause = () => {
      const g = gameRef.current;
      if (!g || g.state !== "PLAYING") return;
      g.state = "PAUSED";
      g.audio.setPaused(true);
      g.audio.pauseMusic();
      if (typeof document !== "undefined" && document.pointerLockElement) {
        document.exitPointerLock();
      }
      autoPausedRef.current = true;
    };
    maybePause();
    const id = window.setInterval(maybePause, 250);
    return () => window.clearInterval(id);
  }, [needsRotate]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = renderScale();

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      if (gameRef.current) {
        gameRef.current.viewW = w;
        gameRef.current.viewH = h;
        gameRef.current.camera.viewW = w;
        gameRef.current.camera.viewH = h;
      }
    };

    if (mode && mode !== "single") {
      setWsStatus("connecting");
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/multiplayer`;

    const game = new Game(ctx, window.innerWidth, window.innerHeight, {
      smoke: typeof window !== "undefined" && window.location.search.includes("smoke=1"),
      mode: (mode as any) || "single",
      room: room || "",
      username: name || "Survivor",
      wsUrl,
      shouldContinue,
    });
    gameRef.current = game;
    (window as unknown as { __game?: Game }).__game = game;
    resize();

    window.addEventListener("resize", resize);
    // Mobile browsers shrink the visual viewport when the URL bar
    // collapses — keep the canvas sized to the visible area (presentation
    // only; game state is never touched by resize).
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", resize);
      vv.addEventListener("scroll", resize);
    }
    const onPointerLock = () => {
      game.input.pointerLocked = document.pointerLockElement === canvas;
    };
    document.addEventListener("pointerlockchange", onPointerLock);
    
    const onContextMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener("contextmenu", onContextMenu);
    
    const onClick = () => {
      // Only grab pointer lock when actively playing (not in menus/upgrade)
      // and not on mobile (pointer lock is unsupported/undesirable there).
      if (
        !isMobileRef.current &&
        document.pointerLockElement !== canvas &&
        game.state === "PLAYING"
      ) {
        // requestPointerLock returns a promise that rejects when the browser
        // / embedder denies the request (e.g. embedded preview webviews) —
        // swallow that so a denied lock never surfaces as an error on click.
        const lockPromise = canvas.requestPointerLock?.() as
          | Promise<void>
          | undefined;
        lockPromise?.catch?.(() => undefined);
      }
    };
    canvas.addEventListener("click", onClick);

    const onEvent = (e: Event) => game.handleEvent(e);
    window.addEventListener("keydown", onEvent);
    window.addEventListener("keyup", onEvent);
    window.addEventListener("mousemove", onEvent);
    window.addEventListener("mousedown", onEvent);
    window.addEventListener("mouseup", onEvent);

    // ── Dynamic cursor management ──────────────────────────────────────────
    // Read game state each frame and update canvas cursor accordingly:
    //   PLAYING  → crosshair (pointer locked, cursor hidden)
    //   UPGRADE  → pointer when over a card, default otherwise
    //   others   → default
    let cursorRafId = 0;
    const updateCursor = () => {
      const g = gameRef.current;
      if (g) {
        if (g.state === "PLAYING") {
          canvas.style.cursor = "crosshair";
        } else if (g.state === "UPGRADE") {
          // Check if mouse is over any of the current upgrade buttons
          const overCard = g.currentButtons.some(
            (b) => b.contains(g.input.mouseX, g.input.mouseY)
          );
          canvas.style.cursor = overCard ? "pointer" : "default";
        } else {
          // Menus, pause, shop, game-over: show clickable cursor over buttons
          const overBtn = g.currentButtons.some(
            (b) => b.contains(g.input.mouseX, g.input.mouseY)
          );
          canvas.style.cursor = overBtn ? "pointer" : "default";
        }
      }
      cursorRafId = requestAnimationFrame(updateCursor);
    };
    cursorRafId = requestAnimationFrame(updateCursor);

    if (game.netClient) {
      const origStatus = game.netClient.onStatus;
      game.netClient.onStatus = (status) => {
        setWsStatus(status);
        origStatus(status);
      };
    }

    void game.start();

    return () => {
      window.removeEventListener("resize", resize);
      if (vv) {
        vv.removeEventListener("resize", resize);
        vv.removeEventListener("scroll", resize);
      }
      document.removeEventListener("pointerlockchange", onPointerLock);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onEvent);
      window.removeEventListener("keyup", onEvent);
      window.removeEventListener("mousemove", onEvent);
      window.removeEventListener("mousedown", onEvent);
      window.removeEventListener("mouseup", onEvent);
      cancelAnimationFrame(cursorRafId);
      delete (window as unknown as { __game?: Game }).__game;
      game.stop();
    };
  }, [mode, room, name, shouldContinue]);

  const goBack = () => {
    window.location.href = "/";
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={ref} data-testid="game-canvas" />
      {/* Inert screen treatment: corner falloff + faint scanlines. */}
      <div className="zs-screen-fx" aria-hidden="true" />
      {isMobile && gameRef.current && (
        <TouchHUD input={gameRef.current.input} gameRef={gameRef} />
      )}
      {/* Portrait phone: block input and ask for landscape. Hides itself
          automatically on rotation — no reload, no state reset. */}
      {needsRotate && <RotateOverlay />}
      {wsStatus !== "none" && wsStatus !== "open" && (
        <div className="zs-overlay" role="status" aria-live="polite">
          {wsStatus === "connecting" && (
            <div className="zs-modal zs-modal--wait">
              <h2>Room: {room}</h2>
              <p>Connecting to match lobby…</p>
              <div className="zs-spinner" />
            </div>
          )}
          {wsStatus === "closed" && (
            <div className="zs-modal zs-modal--alert">
              <h2>Disconnected</h2>
              <p>The connection to the server was lost.</p>
              <button className="zs-btn" onClick={goBack}>
                Return to lobby
              </button>
            </div>
          )}
          {wsStatus === "error" && (
            <div className="zs-modal zs-modal--alert">
              <h2>Connection error</h2>
              <p>Could not establish a connection to the multiplayer room.</p>
              <button className="zs-btn" onClick={goBack}>
                Return to lobby
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
