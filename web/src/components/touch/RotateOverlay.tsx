"use client";

// Fullscreen "please rotate your phone" overlay shown when a mobile device
// is in portrait inside the game (or the browser refused the landscape
// orientation lock). Rendered above everything, blocks all input, and hides
// automatically once the viewport is truly landscape — no reload, no state
// loss. Respects safe-area insets.

export default function RotateOverlay() {
  return (
    <div
      data-testid="rotate-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        textAlign: "center",
        background: "rgba(10,12,9,0.94)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        color: "#EBEBE1",
        fontFamily: "ui-monospace, monospace",
        boxSizing: "border-box",
        paddingLeft: "max(24px, env(safe-area-inset-left))",
        paddingRight: "max(24px, env(safe-area-inset-right))",
        paddingTop: "max(24px, env(safe-area-inset-top))",
        paddingBottom: "max(24px, env(safe-area-inset-bottom))",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Rotating phone icon: a portrait phone that spins into landscape. */}
      <div
        aria-hidden="true"
        style={{
          width: 72,
          height: 72,
          position: "relative",
          animation: "zs-rotate-phone 2.2s ease-in-out infinite",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "8px 20px",
            border: "4px solid #FF3C46",
            borderRadius: 10,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 2,
            left: "50%",
            transform: "translateX(-50%)",
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: "#FF3C46",
          }}
        />
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#FF3C46",
        }}
      >
        Please rotate your phone
      </div>
      <div
        style={{
          fontSize: 14,
          color: "#C8C8C2",
          maxWidth: 320,
          lineHeight: 1.6,
        }}
      >
        Xoay điện thoại sang ngang (landscape) để chơi. Trò chơi sẽ tự động
        tiếp tục ngay khi màn hình ở chế độ ngang.
      </div>
    </div>
  );
}