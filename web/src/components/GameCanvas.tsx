"use client";

import { useEffect, useRef, useState } from "react";
import { Game } from "@/game/game";
import { useIsMobile } from "@/lib/device";
import TouchHUD from "./touch/TouchHUD";

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
  const isMobile = useIsMobile();
  const isMobileRef = useRef(false);
  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

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
