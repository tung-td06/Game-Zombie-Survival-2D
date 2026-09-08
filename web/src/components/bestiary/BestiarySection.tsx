"use client";

// Lobby BESTIARY (QUÁI VẬT) — a READ-ONLY reference panel placed under HOW
// TO PLAY in the left column of the Game Lobby. Every stat shown comes from
// /data/zombies.json through bestiaryData (same source gameplay uses); wave
// gates come from enemyGates. Clicking a row opens an in-game detail modal
// (never a browser dialog).
import { useEffect, useState } from "react";
import { loadZombies } from "@/game/data";
import { buildBestiary, type BestiaryEnemy } from "./bestiaryData";
import { EnemySprite } from "./EnemySprite";

// Design tokens — mirror page.tsx / globals.css palette.
const C = {
  bg: "#10120E",
  bgDeep: "#0A0B08",
  panel: "#1C1E1A",
  panelDeep: "#151713",
  border: "#3C3C36",
  borderSoft: "#282A24",
  text: "#EBEBE1",
  textSoft: "#C8C8C2",
  dim: "#82827E",
  red: "#FF3C46",
  redHover: "#FF5A63",
  gold: "#FFC850",
  green: "#6EDC82",
  cyan: "#5ADCFF",
  orange: "#FF9C4A",
};

const cardBase: React.CSSProperties = {
  backgroundColor: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
  boxSizing: "border-box",
};

function ThreatStars({ n, size = 11 }: { n: number; size?: number }) {
  return (
    <span
      aria-label={`${n} trên 5 sao`}
      style={{
        fontSize: size,
        letterSpacing: 1,
        color: C.gold,
        whiteSpace: "nowrap",
        textShadow: "0 0 6px rgba(255,200,80,0.35)",
      }}
    >
      {"★".repeat(n)}
      <span style={{ color: "#4A4A44" }}>{"★".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

export function BestiarySection() {
  const [entries, setEntries] = useState<BestiaryEnemy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<BestiaryEnemy | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    setEntries(null);
    loadZombies()
      .then((data) => {
        if (!alive) return;
        setEntries(buildBestiary(data));
      })
      .catch(() => {
        if (alive) setError("Không tải được dữ liệu quái vật.");
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  return (
    <div style={{ ...cardBase, width: "100%", minWidth: 0 }}>
      {/* Header */}
      <div
        style={{
          padding: "18px 20px 14px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 2,
              color: C.gold,
              textTransform: "uppercase",
            }}
          >
            ☠ BESTIARY · QUÁI VẬT
          </h2>
          {entries && (
            <span
              style={{
                fontSize: 10,
                letterSpacing: 1,
                color: C.dim,
                whiteSpace: "nowrap",
              }}
            >
              {entries.length} LOẠI
            </span>
          )}
        </div>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 11,
            color: C.dim,
            lineHeight: 1.5,
          }}
        >
          Số liệu lấy từ dữ liệu game thật — bấm vào quái vật để xem chi tiết &amp;
          cách đối phó.
        </p>
      </div>

      {/* List / states */}
      {error ? (
        <div style={{ padding: 24, textAlign: "center", color: C.dim }}>
          <div style={{ marginBottom: 12 }}>{error}</div>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            style={{
              padding: "8px 18px",
              background: C.panelDeep,
              color: C.textSoft,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              letterSpacing: 1,
            }}
          >
            THỬ LẠI
          </button>
        </div>
      ) : entries ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: 10,
            gap: 6,
          }}
        >
          {entries.map((e) => (
            <BestiaryRow key={e.kind} entry={e} onClick={() => setSelected(e)} />
          ))}
        </div>
      ) : (
        <div style={{ padding: "28px 20px", textAlign: "center", color: C.dim }}>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: C.red,
              marginRight: 8,
              boxShadow: "0 0 8px rgba(255,60,70,0.8)",
            }}
          />
          ĐANG TẢI DỮ LIỆU QUÁI VẬT…
        </div>
      )}

      {selected && (
        <BestiaryModal entry={selected} onClose={() => setSelected(null)} />
      )}

      {/* Responsive helpers (document-scoped): stat grid collapses to one
          column on narrow screens so nothing overflows the modal. */}
      <style>{`
        .zs-det-grid { grid-template-columns: 1fr 1fr; }
        @media (max-width: 480px) { .zs-det-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

function BestiaryRow({
  entry,
  onClick,
}: {
  entry: BestiaryEnemy;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const accent = entry.isBoss ? C.red : entry.accent;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={`Xem chi tiết ${entry.name}`}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 58px) minmax(0, 1fr)",
        gap: 10,
        alignItems: "center",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        padding: "8px 10px",
        textAlign: "left",
        fontFamily: "inherit",
        color: C.text,
        backgroundColor: hover
          ? entry.isBoss
            ? "rgba(120, 20, 28, 0.25)"
            : C.panelDeep
          : "transparent",
        border: `1px solid ${hover ? (entry.isBoss ? C.red : C.border) : C.borderSoft}`,
        borderLeft: `3px solid ${hover ? accent : entry.isBoss ? "#7A1B22" : "#2A2C26"}`,
        borderRadius: 6,
        cursor: "pointer",
        transition:
          "background-color 0.15s ease, border-color 0.15s ease, border-left-color 0.15s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <EnemySprite kind={entry.kind} radius={entry.radius} size={50} />
      </div>

      <div style={{ minWidth: 0, maxWidth: "100%" }}>
        {/* Name + threat */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            minWidth: 0,
          }}
        >
          <span
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 700,
              fontSize: "0.8rem",
              letterSpacing: 1,
              color: entry.isBoss ? C.red : C.text,
              textShadow: entry.isBoss ? "0 0 10px rgba(255,60,70,0.4)" : "none",
            }}
          >
            {entry.isBoss ? "☠ " : ""}
            {entry.name}
            {entry.isElite ? <span style={{ color: C.cyan }}> ◆</span> : ""}
          </span>
          <span style={{ flexShrink: 0, marginLeft: "auto" }}>
            <ThreatStars n={entry.threat} />
          </span>
        </div>
        {/* Type + mini stats */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 10,
            rowGap: 3,
            marginTop: 4,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: 10,
              letterSpacing: 1,
              color: accent,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {entry.type}
          </span>
          <span
            style={{
              fontSize: 10,
              color: C.dim,
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span style={{ color: "#E86A6A" }}>❤</span> {entry.hp.toLocaleString("en-US")}
            <span style={{ color: C.cyan }}> ⚡</span> {entry.speed}
            <span style={{ color: C.orange }}> ⚔</span> {entry.damage}
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9,
              letterSpacing: 1,
              color: entry.isBoss ? C.red : C.gold,
              border: `1px solid ${entry.isBoss ? C.red : "#4A4430"}`,
              borderRadius: 3,
              padding: "1px 6px",
              backgroundColor: entry.isBoss ? "rgba(255,60,70,0.12)" : "rgba(255,200,80,0.06)",
              whiteSpace: "nowrap",
            }}
          >
            {entry.appears}
          </span>
        </div>
      </div>
    </button>
  );
}

// ---- Detail modal ----------------------------------------------------------

function BestiaryModal({
  entry,
  onClose,
}: {
  entry: BestiaryEnemy;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const accent = entry.isBoss ? C.red : entry.accent;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div
      style={{
        marginTop: 14,
        padding: "10px 12px",
        backgroundColor: C.panelDeep,
        border: `1px solid ${C.borderSoft}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 2,
          color: C.gold,
          marginBottom: 5,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: "0.84rem", lineHeight: 1.55, color: C.textSoft }}>
        {children}
      </div>
    </div>
  );

  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        backgroundColor: "rgba(8, 8, 10, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
        animation: "zs-settings-fade 0.15s ease-out",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Chi tiết quái vật ${entry.name}`}
        onClick={(e) => e.stopPropagation()}
        className="zs-bestiary-modal"
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "min(88vh, 720px)",
          overflowY: "auto",
          boxSizing: "border-box",
          backgroundColor: C.panel,
          border: `2px solid ${entry.isBoss ? C.red : accent}`,
          borderRadius: 12,
          boxShadow: `0 0 34px rgba(255, 60, 70, 0.25), 0 10px 44px rgba(0, 0, 0, 0.7)`,
          padding: "20px 22px 22px",
          animation: "zs-settings-pop 0.18s ease-out",
        }}
      >
        {/* Close */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -6 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            style={{
              width: 30,
              height: 30,
              borderRadius: 4,
              border: `1px solid ${C.border}`,
              backgroundColor: "transparent",
              color: C.dim,
              cursor: "pointer",
              fontSize: 14,
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = C.red;
              e.currentTarget.style.borderColor = C.red;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = C.dim;
              e.currentTarget.style.borderColor = C.border;
            }}
          >
            ✕
          </button>
        </div>

        {/* Sprite + identity */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex",
              padding: 4,
              borderRadius: 10,
              border: `1px solid ${entry.isBoss ? "rgba(255,60,70,0.5)" : C.borderSoft}`,
              backgroundColor: C.panelDeep,
              boxShadow: entry.isBoss
                ? "0 0 22px rgba(255,60,70,0.25)"
                : `0 0 18px ${accent}22`,
            }}
          >
            <EnemySprite kind={entry.kind} radius={entry.radius} size={118} shadow />
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: "1.2rem",
              fontWeight: 900,
              letterSpacing: 2,
              color: entry.isBoss ? C.red : C.text,
              textShadow: entry.isBoss ? "0 0 14px rgba(255,60,70,0.45)" : "none",
              textTransform: "uppercase",
            }}
          >
            {entry.isBoss ? "☠ " : ""}
            {entry.name}
            {entry.isElite ? <span style={{ color: C.cyan }}> ◆</span> : ""}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 8,
              marginTop: 8,
            }}
          >
            <Badge color={accent}>{entry.typeVN.toUpperCase()}</Badge>
            {entry.isBoss && <Badge color={C.red}>BOSS</Badge>}
            {entry.isElite && <Badge color={C.cyan}>BLOOD MOON</Badge>}
            <Badge color={C.gold}>{entry.appears}</Badge>
          </div>
        </div>

        <div
          style={{
            height: 1,
            margin: "16px 0 2px",
            background:
              "linear-gradient(90deg, rgba(255,60,70,0), rgba(255,60,70,0.55), rgba(255,60,70,0))",
          }}
        />

        {/* Stats */}
        <div className="zs-det-grid" style={{ display: "grid", gap: "6px 16px" }}>
          <StatRow label="MÁU (HP)" value={`${entry.hp.toLocaleString("en-US")}`} color="#E86A6A" icon="❤" />
          <StatRow label="TỐC ĐỘ" value={`${entry.speed} px/s`} color={C.cyan} icon="⚡" />
          <StatRow label="SÁT THƯƠNG" value={`${entry.damage}`} color={C.orange} icon="⚔" />
          <StatRow label="ĐỘ NGUY HIỂM" value={<ThreatStars n={entry.threat} />} color={C.gold} icon="" />
        </div>

        {/* Data-driven specials */}
        {entry.specials.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {entry.specials.map((s) => (
              <div
                key={s.label}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "2px 10px",
                  padding: "4px 0",
                  fontSize: "0.78rem",
                  color: C.textSoft,
                  borderBottom: "1px dashed #24241F",
                }}
              >
                <span style={{ color: accent, fontWeight: 700, letterSpacing: 1 }}>
                  {s.label}
                </span>
                <span style={{ minWidth: 0 }}>{s.value}</span>
              </div>
            ))}
          </div>
        )}

        <Section title="ATTACK · CÁCH TẤN CÔNG">{entry.attack}</Section>
        <Section title="BEHAVIOR · HÀNH VI">{entry.behavior}</Section>
        <Section title="WEAKNESS · ĐIỂM YẾU">{entry.weakness}</Section>
        <Section title="HOW TO DEAL · CÁCH ĐỐI PHÓ">{entry.deal}</Section>

        {/* Appears footer */}
        <div
          style={{
            marginTop: 14,
            padding: "8px 12px",
            border: `1px dashed ${C.border}`,
            borderRadius: 6,
            fontSize: "0.78rem",
            color: C.dim,
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          <span style={{ color: C.gold, fontWeight: 700, letterSpacing: 1 }}>XUẤT HIỆN</span>
          {" · "}
          {entry.appears}
          {entry.appearsNote ? (
            <div style={{ marginTop: 4, color: C.dim }}>{entry.appearsNote}</div>
          ) : null}
        </div>

        <p
          style={{
            margin: "12px 0 0",
            textAlign: "center",
            fontSize: 10,
            color: "#5A5A55",
          }}
        >
          Chỉ số lấy trực tiếp từ dữ liệu game — thay đổi trong game sẽ tự đồng bộ tại đây.
        </p>
      </div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.5,
        color,
        border: `1px solid ${color}66`,
        borderRadius: 3,
        padding: "2px 8px",
        backgroundColor: `${color}14`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function StatRow({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
  icon: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        minWidth: 0,
        padding: "5px 10px",
        backgroundColor: C.panelDeep,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 5,
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: 1,
          color: C.dim,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {icon && <span style={{ color }}>{icon} </span>}
        {label}
      </span>
      <span
        style={{
          fontSize: "0.82rem",
          fontWeight: 800,
          color,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          marginLeft: "auto",
        }}
      >
        {value}
      </span>
    </div>
  );
}
