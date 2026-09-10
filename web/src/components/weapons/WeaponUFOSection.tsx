"use client";

// Lobby THONG TIN VU KHI & UFO — a READ-ONLY reference panel placed below
// the Bestiary in the left column. Weapon icons are drawn with the same pixel-
// art style used in the in-game shop (ui.ts -> drawShopIcon). UFO cards mirror
// the UFO_CATALOG from ufo.ts. Clicking a weapon row opens a detail modal.
// Clicking a UFO card shows its detailed stat panel (no modal — inline detail).

import { useEffect, useState } from "react";
import { UFO_CATALOG, type UfoDef } from "@/game/ufo";
import { UFO_EXT_CATALOG, UFO_STAT_MAX, type UfoExtInfo } from "@/game/ufoInfo";
import { WEAPON_ORDER } from "@/game/weapon";
import { loadWeapons, type WeaponData } from "@/game/data";

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
  purple: "#C58BFF",
};

const cardBase: React.CSSProperties = {
  backgroundColor: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
  boxSizing: "border-box",
};

// ─── Weapon Icon SVG ────────────────────────────────────────────────────────

interface WeaponIconProps { id: string; size?: number; }

function WeaponIcon({ id, size = 72 }: WeaponIconProps) {
  const w = size;
  const h = Math.round(size * 0.55);
  return (
    <svg width={w} height={h} viewBox="-36 -15 72 30"
      style={{ display: "block", backgroundColor: "#121216", border: "1px solid rgba(240,200,80,0.3)", borderRadius: 6, flexShrink: 0 }}>
      {id === "pistol" && (<g>
        <polygon points="-6,-1 -12,11 -7,11 -2,-1" fill="#806238" />
        <circle cx="0" cy="2" r="3" fill="none" stroke="#82827E" strokeWidth="1.5" />
        <rect x="-10" y="-9" width="20" height="5" fill="#82827E" />
        <rect x="-10" y="-4" width="8" height="4" fill="#4E4E54" />
        <rect x="8" y="-8" width="2" height="2" fill="#FF3C46" />
      </g>)}
      {id === "shotgun" && (<g>
        <polygon points="-22,-2 -18,6 -10,2 -2,2 -4,-5 -22,-5" fill="#806238" />
        <rect x="2" y="-2" width="10" height="4" fill="#9C7640" />
        <rect x="-10" y="-5" width="32" height="3" fill="#4E4E54" />
        <rect x="-4" y="-2" width="6" height="2" fill="#4E4E54" />
      </g>)}
      {id === "smg" && (<g>
        <polygon points="-6,1 -10,11 -5,11 -1,1" fill="#1E1E24" />
        <path d="M1,1 Q3,10 -1,13 L3,14 Q7,10 5,1 Z" fill="#2E2E32" />
        <rect x="-12" y="-7" width="20" height="8" fill="#3C3C46" />
        <path d="M-12,-5 L-20,-3 L-20,6" fill="none" stroke="#5A5A60" strokeWidth="1.5" />
        <rect x="8" y="-5" width="8" height="2" fill="#787882" />
      </g>)}
      {id === "rifle" && (<g>
        <polygon points="-22,-5 -22,3 -14,3 -8,-1 -10,-6" fill="#344E38" />
        <polygon points="-6,0 -9,10 -5,10 -2,0" fill="#1A1A1E" />
        <path d="M1,1 Q5,12 0,16 L4,17 Q9,12 6,1 Z" fill="#2E2E32" />
        <rect x="-10" y="-6" width="18" height="8" fill="#2E2E34" />
        <rect x="8" y="-6" width="10" height="6" fill="#806238" />
        <rect x="18" y="-5" width="14" height="2" fill="#5A5A60" />
        <rect x="30" y="-7" width="2" height="2" fill="#1E1E22" />
      </g>)}
      {id === "sniper" && (<g>
        <polygon points="-24,-3 -22,5 -12,5 -7,0 -8,-5" fill="#445A44" />
        <rect x="-8" y="-5" width="18" height="6" fill="#2E2E34" />
        <rect x="10" y="-4" width="26" height="2" fill="#5A5A60" />
        <rect x="36" y="-5" width="3" height="4" fill="#1E1E22" />
        <rect x="-4" y="-9" width="12" height="3" fill="#1E1E24" />
        <rect x="-6" y="-10" width="2" height="5" fill="#1E1E24" />
        <rect x="8" y="-10" width="3" height="5" fill="#1E1E24" />
      </g>)}
      {id === "flamethrower" && (<g>
        <rect x="-22" y="-8" width="14" height="12" rx="4" fill="#4E3020" />
        <rect x="-8" y="-3" width="6" height="4" fill="#3C3C3C" />
        <rect x="-2" y="-5" width="16" height="6" fill="#5A3A1A" />
        <rect x="14" y="-3" width="10" height="3" fill="#8A5A2A" />
        <ellipse cx="27" cy="-1" rx="5" ry="4" fill="rgba(255,160,0,0.85)" />
        <ellipse cx="30" cy="-1" rx="3" ry="2.5" fill="rgba(255,90,0,0.9)" />
        <ellipse cx="32" cy="-1" rx="1.5" ry="1.5" fill="#FF3C46" />
      </g>)}
      {id === "plasma" && (<g>
        <rect x="-14" y="-6" width="22" height="8" rx="3" fill="#1E1A2E" />
        <rect x="-10" y="-3" width="6" height="5" rx="1" fill="#5A2A8A" />
        <rect x="-9" y="-2" width="4" height="3" fill="#C58BFF" />
        <rect x="8" y="-4" width="18" height="3" fill="#3A2A5A" />
        <circle cx="28" cy="-2" r="4" fill="rgba(197,139,255,0.6)" />
        <circle cx="28" cy="-2" r="2" fill="#C58BFF" />
        <polygon points="-2,2 -5,12 -1,12 2,2" fill="#1E1E24" />
      </g>)}
      {id === "crossbow" && (<g>
        <rect x="-4" y="-14" width="3" height="28" rx="1" fill="#6E4A1A" />
        <line x1="-2" y1="-12" x2="10" y2="-1" stroke="#DEDED6" strokeWidth="1" />
        <line x1="-2" y1="12" x2="10" y2="-1" stroke="#DEDED6" strokeWidth="1" />
        <polygon points="-22,-3 -20,4 -4,4 -4,-3" fill="#806238" />
        <rect x="-4" y="-2" width="14" height="3" fill="#5A3A1A" />
        <rect x="3" y="-1" width="16" height="1" fill="#C8C8C2" />
        <polygon points="20,-2 24,-0.5 20,1" fill="#C8C8C2" />
      </g>)}
    </svg>
  );
}

// ─── UFO SVG Icon ───────────────────────────────────────────────────────────

function UFOIcon({ tint, glow, size = 56 }: { tint: string; glow: string; size?: number }) {
  const uid = `ug-${tint.replace("#", "").slice(0, 6)}`;
  return (
    <svg width={size} height={size} viewBox="-28 -28 56 56" style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <radialGradient id={uid} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={tint} stopOpacity="0.3" />
          <stop offset="100%" stopColor={tint} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="0" cy="0" rx="24" ry="7" fill="none" stroke={glow} strokeWidth="1.5" opacity="0.6" />
      <ellipse cx="0" cy="-4" rx="10" ry="7" fill={tint} opacity="0.9" />
      <ellipse cx="0" cy="2" rx="20" ry="6" fill={tint} opacity="0.8" />
      <ellipse cx="0" cy="4" rx="14" ry="3" fill="rgba(0,0,0,0.4)" />
      <circle cx="-10" cy="3" r="1.5" fill="#FFFFFF" opacity="0.9" />
      <circle cx="0" cy="5" r="1.5" fill="#FFFFFF" opacity="0.9" />
      <circle cx="10" cy="3" r="1.5" fill="#FFFFFF" opacity="0.9" />
      <ellipse cx="-3" cy="-6" rx="3" ry="2" fill="rgba(255,255,255,0.4)" />
    </svg>
  );
}

// ─── Weapon components ──────────────────────────────────────────────────────

function StatBadge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, minWidth: 48 }}>
      <span style={{ fontSize: 9, color: C.dim, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: "0.78rem", fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </span>
  );
}

const ELEM_COLORS: Record<string, string> = { fire: "#FF9C4A", plasma: "#C58BFF", pierce: "#5ADCFF" };
function ElemBadge({ elem }: { elem: string }) {
  const color = ELEM_COLORS[elem] ?? C.gold;
  const labels: Record<string, string> = { fire: "FIRE", plasma: "PLASMA", pierce: "PIERCE" };
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 1, color,
      border: `1px solid ${color}55`, borderRadius: 3, padding: "1px 6px",
      backgroundColor: `${color}18`, whiteSpace: "nowrap"
    }}>
      {labels[elem] ?? elem.toUpperCase()}
    </span>
  );
}

function WeaponRow({ id, data, onClick }: { id: string; data: WeaponData; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const isFree = data.price === 0;
  const priceColor = isFree ? C.green : C.gold;
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      aria-label={`Xem chi tiết ${data.name}`}
      style={{
        display: "grid", gridTemplateColumns: "auto 1fr", gap: 10,
        alignItems: "center", width: "100%", boxSizing: "border-box",
        padding: "8px 10px", textAlign: "left", fontFamily: "inherit", color: C.text,
        backgroundColor: hover ? "rgba(255,200,80,0.06)" : "transparent",
        border: `1px solid ${hover ? C.border : C.borderSoft}`,
        borderLeft: `3px solid ${hover ? C.gold : "#2A2C26"}`,
        borderRadius: 6, cursor: "pointer",
        transition: "background-color 0.15s ease, border-color 0.15s ease",
      }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <WeaponIcon id={id} size={72} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minWidth: 0 }}>
          <span style={{
            fontWeight: 700, fontSize: "0.8rem", letterSpacing: 1, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0
          }}>
            {data.name}
          </span>
          <span style={{
            flexShrink: 0, fontSize: 10, fontWeight: 700, color: priceColor,
            border: `1px solid ${priceColor}44`, borderRadius: 3, padding: "1px 6px",
            backgroundColor: `${priceColor}10`, whiteSpace: "nowrap"
          }}>
            {isFree ? "FREE" : `${data.price.toLocaleString()}`}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px", marginTop: 5 }}>
          <StatBadge label="DMG" value={data.damage} color={C.red} />
          <StatBadge label="MAG" value={data.magazine} color={C.cyan} />
          <StatBadge label="RLD" value={`${data.reload_time}s`} color={C.textSoft} />
          <StatBadge label="RNG" value={data.range ?? "N/A"} color={C.gold} />
          {data.elem && <ElemBadge elem={data.elem} />}
          {data.auto && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.green,
              border: `1px solid ${C.green}44`, borderRadius: 3, padding: "1px 5px",
              backgroundColor: `${C.green}12`
            }}>AUTO</span>
          )}
        </div>
      </div>
    </button>
  );
}

function WeaponModal({ id, data, onClose }: { id: string; data: WeaponData; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const isFree = data.price === 0;
  return (
    <div onClick={onClose} role="presentation"
      style={{
        position: "fixed", inset: 0, zIndex: 130, backgroundColor: "rgba(8,8,10,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, boxSizing: "border-box", animation: "zs-settings-fade 0.15s ease-out"
      }}>
      <div role="dialog" aria-modal="true" aria-label={`Chi tiết vũ khí ${data.name}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480, maxHeight: "min(88vh,660px)", overflowY: "auto",
          boxSizing: "border-box", backgroundColor: C.panel,
          border: `2px solid ${C.gold}`, borderRadius: 12,
          boxShadow: "0 0 34px rgba(255,200,80,0.2),0 10px 44px rgba(0,0,0,0.7)",
          padding: "20px 22px 22px", animation: "zs-settings-pop 0.18s ease-out"
        }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
          <button type="button" onClick={onClose} aria-label="Đóng"
            style={{
              width: 30, height: 30, borderRadius: 4,
              border: `1px solid ${C.border}`, backgroundColor: "transparent",
              color: C.dim, cursor: "pointer", fontSize: 14, fontFamily: "inherit"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.red; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.dim; e.currentTarget.style.borderColor = C.border; }}>
            X
          </button>
        </div>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{
            display: "inline-flex", padding: 6, borderRadius: 10,
            border: "1px solid rgba(255,200,80,0.3)", backgroundColor: C.panelDeep,
            boxShadow: "0 0 22px rgba(255,200,80,0.15)"
          }}>
            <WeaponIcon id={id} size={100} />
          </div>
          <div style={{
            marginTop: 12, fontSize: "1.1rem", fontWeight: 900,
            letterSpacing: 2, color: C.gold, textTransform: "uppercase"
          }}>{data.name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
              color: isFree ? C.green : C.gold,
              border: `1px solid ${isFree ? C.green : C.gold}55`, borderRadius: 3,
              padding: "2px 8px", backgroundColor: `${isFree ? C.green : C.gold}14`
            }}>
              {isFree ? "FREE - STARTING WEAPON" : `${data.price.toLocaleString()} coins`}
            </span>
            {data.elem && <ElemBadge elem={data.elem} />}
            {data.auto && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.green,
                border: `1px solid ${C.green}55`, borderRadius: 3, padding: "2px 8px",
                backgroundColor: `${C.green}14`
              }}>AUTO-FIRE</span>
            )}
          </div>
        </div>
        <div style={{
          height: 1, margin: "12px 0 14px",
          background: "linear-gradient(90deg,rgba(255,200,80,0),rgba(255,200,80,0.5),rgba(255,200,80,0))"
        }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
          {[
            { label: "SÁT THƯƠNG (DMG)", value: data.damage, color: C.red },
            { label: "CỠ ĐẠN (MAG)", value: data.magazine, color: C.cyan },
            { label: "TỐC BẮN (FIRE RATE)", value: `${data.fire_rate}s`, color: C.gold },
            { label: "NẠP ĐẠN (RELOAD)", value: `${data.reload_time}s`, color: C.textSoft },
            { label: "TẦM BẮN (RANGE)", value: data.range ?? "N/A", color: C.orange },
            { label: "ĐỘ CHÍNH XÁC", value: `${data.spread_deg}°`, color: C.green },
            { label: "TỶ LỆ CRIT", value: `${Math.round(data.critical_chance * 100)}%`, color: C.red },
            { label: "SÁT THƯƠNG CRIT", value: `x${data.critical_multiplier}`, color: C.gold },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 6, padding: "5px 10px", backgroundColor: C.panelDeep,
              border: `1px solid ${C.borderSoft}`, borderRadius: 5
            }}>
              <span style={{ fontSize: 9, letterSpacing: 1, color: C.dim }}>{label}</span>
              <span style={{ fontSize: "0.82rem", fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: "14px 0 0", textAlign: "center", fontSize: 10, color: "#5A5A55" }}>
          Chỉ số lấy từ /data/weapons.json - đồng bộ khi game cập nhật.
        </p>
      </div>
    </div>
  );
}

// ─── UFO Section ─────────────────────────────────────────────────────────────

/** Stat bar row — label + animated fill bar + value text. */
function StatBar({
  label, value, max, color,
}: {
  label: string; value: number; max: number; color: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 9, letterSpacing: 1, color: C.dim, textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: "0.75rem", fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
      <div style={{
        height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.07)",
        overflow: "hidden", position: "relative"
      }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 3,
          backgroundColor: color,
          boxShadow: `0 0 6px ${color}88`,
          transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>
    </div>
  );
}

/** Small selectable UFO card in the left list. */
function UFOSelectCard({
  def, ext, isSelected, onClick,
}: {
  def: UfoDef; ext: UfoExtInfo | undefined; isSelected: boolean; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const active = isSelected || hover;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={`Xem chi tiết ${def.name}`}
      aria-pressed={isSelected}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
        width: "100%", boxSizing: "border-box", textAlign: "left",
        fontFamily: "inherit", cursor: "pointer",
        backgroundColor: isSelected ? `${def.tint}18` : hover ? `${def.tint}0C` : "transparent",
        border: `1px solid ${active ? def.tint + "80" : C.borderSoft}`,
        borderLeft: `3px solid ${active ? def.tint : "#2A2C26"}`,
        borderRadius: 6,
        boxShadow: isSelected ? `0 0 12px ${def.tint}30` : "none",
        transition: "all 0.18s ease",
        outline: "none",
      }}>
      <UFOIcon tint={def.tint} glow={def.glow} size={44} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
          <span style={{
            fontWeight: 700, fontSize: "0.76rem", letterSpacing: 1,
            color: active ? def.tint : C.textSoft,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            transition: "color 0.18s ease"
          }}>{def.name}</span>
          {isSelected && (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1,
              color: def.tint, border: `1px solid ${def.tint}55`,
              borderRadius: 3, padding: "1px 5px",
              backgroundColor: `${def.tint}18`, whiteSpace: "nowrap", flexShrink: 0
            }}>ĐÃ CHỌN</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
          {ext && (
            <span style={{ fontSize: 9, color: ext.rarityColor, fontWeight: 700, letterSpacing: 0.5 }}>
              {ext.rarity}
            </span>
          )}
          <span style={{ fontSize: 9, color: C.dim }}>·</span>
          <span style={{ fontSize: 9, color: C.gold, fontVariantNumeric: "tabular-nums" }}>
            {def.price.toLocaleString()} xu
          </span>
        </div>
        <p style={{
          margin: "3px 0 0", fontSize: "0.7rem", color: C.dim,
          lineHeight: 1.4, fontStyle: "italic",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{def.desc}</p>
      </div>
    </button>
  );
}

/** Full detail panel shown on the right when a UFO is selected. */
function UFODetailPanel({ def, ext, onClose }: { def: UfoDef; ext: UfoExtInfo | undefined; onClose: () => void }) {
  if (!ext) {
    // Fallback: minimal info from catalog only
    return (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 900, fontSize: "1rem", color: def.tint, letterSpacing: 2 }}>
            🛸 {def.name}
          </span>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14 }}
            aria-label="Đóng">✕</button>
        </div>
        <p style={{ margin: 0, fontSize: "0.8rem", color: C.textSoft }}>{def.desc}</p>
      </div>
    );
  }

  const MAX = UFO_STAT_MAX;

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 0,
      animation: "ufo-detail-in 0.22s ease-out",
    }}>
      {/* --- Header --- */}
      <div style={{
        padding: "14px 16px 12px",
        background: `linear-gradient(135deg, ${def.tint}18 0%, transparent 60%)`,
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "flex-start", gap: 12
      }}>
        {/* Big UFO icon */}
        <div style={{
          flexShrink: 0, padding: 8, borderRadius: 10,
          border: `1px solid ${def.tint}40`,
          backgroundColor: `${def.tint}12`,
          boxShadow: `0 0 20px ${def.tint}30`,
        }}>
          <UFOIcon tint={def.tint} glow={def.glow} size={64} />
        </div>
        {/* Title block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{
              margin: 0, fontSize: "1.05rem", fontWeight: 900, letterSpacing: 2,
              color: def.tint, textTransform: "uppercase"
            }}>🛸 {def.name}</h3>
            <button type="button" onClick={onClose} aria-label="Đóng chi tiết UFO"
              style={{
                background: "none", border: `1px solid ${C.border}`, borderRadius: 4,
                color: C.dim, cursor: "pointer", fontSize: 12, padding: "2px 7px",
                fontFamily: "inherit", lineHeight: 1.6,
                transition: "color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.red; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = C.dim; e.currentTarget.style.borderColor = C.border; }}>
              ✕
            </button>
          </div>
          {/* Badges */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 6px", marginTop: 6 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1, color: ext.rarityColor,
              border: `1px solid ${ext.rarityColor}55`, borderRadius: 3, padding: "2px 7px",
              backgroundColor: `${ext.rarityColor}18`,
            }}>{ext.rarity.toUpperCase()}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.cyan,
              border: `1px solid ${C.cyan}44`, borderRadius: 3, padding: "2px 7px",
              backgroundColor: `${C.cyan}12`,
            }}>{ext.type.toUpperCase()}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.gold,
              border: `1px solid ${C.gold}44`, borderRadius: 3, padding: "2px 7px",
              backgroundColor: `${C.gold}12`,
            }}>CẤP ĐỘ ≥ {ext.levelReq}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.green,
              border: `1px solid ${C.green}44`, borderRadius: 3, padding: "2px 7px",
              backgroundColor: `${C.green}12`,
            }}>{def.price.toLocaleString()} xu</span>
          </div>
        </div>
      </div>

      {/* --- Body scrollable area --- */}
      <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>

        {/* --- Combat Stats --- */}
        <section>
          <SectionHeading label="⚔️ CHỈ SỐ CHIẾN ĐẤU" color={C.red} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 6 }}>
            <StatBar label="❤️ Máu (HP)" value={ext.hp} max={MAX.hp} color="#FF6B6B" />
            <StatBar label="⚔️ Sát thương" value={ext.damage} max={MAX.damage} color={C.red} />
            <StatBar label="🔥 Tốc độ bắn (phát/s)" value={ext.fireRate} max={MAX.fireRate} color={C.orange} />
            <StatBar label="📏 Tầm tấn công" value={ext.attackRange} max={MAX.attackRange} color={C.gold} />
            <StatBar label="🚀 Tốc độ đạn" value={ext.projectileSpeed} max={MAX.projectileSpeed} color={C.cyan} />
            <StatBar label="🎯 Tỷ lệ chí mạng (%)" value={ext.critChance} max={MAX.critChance} color="#FF9C4A" />
          </div>
        </section>

        <Divider color={def.tint} />

        {/* --- Movement Stats --- */}
        <section>
          <SectionHeading label="🚀 CHỈ SỐ DI CHUYỂN" color={C.cyan} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 6 }}>
            <StatBar label="🔄 Tốc độ quỹ đạo (°/s)" value={ext.orbitSpeed} max={MAX.orbitSpeed} color={C.cyan} />
            <StatBar label="📡 Tầm phát hiện" value={ext.detectionRange} max={MAX.detectionRange} color="#5ADCFF" />
          </div>
        </section>

        <Divider color={def.tint} />

        {/* --- Defense Stats --- */}
        <section>
          <SectionHeading label="🛡️ CHỈ SỐ PHÒNG THỦ" color={C.green} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 6 }}>
            <StatBar label="🛡️ Giáp" value={ext.armor} max={MAX.armor} color={C.green} />
            <StatBar label="🔰 Giảm sát thương (%)" value={ext.damageReduction} max={MAX.damageReduction} color="#6EDC82" />
          </div>
        </section>

        {/* --- Special Ability --- */}
        {ext.specialAbility && (
          <>
            <Divider color={def.tint} />
            <section>
              <SectionHeading label="⚡ KHẢ NĂNG ĐẶC BIỆT" color={C.purple} />
              <div style={{
                marginTop: 8, padding: "12px 14px",
                backgroundColor: `${C.purple}10`,
                border: `1px solid ${C.purple}40`,
                borderLeft: `3px solid ${C.purple}`,
                borderRadius: 7,
              }}>
                <div style={{
                  fontWeight: 900, fontSize: "0.85rem", letterSpacing: 1.5,
                  color: C.purple, marginBottom: 6
                }}>⚡ {ext.specialAbility.name}</div>
                <p style={{ margin: "0 0 10px", fontSize: "0.76rem", color: C.textSoft, lineHeight: 1.5 }}>
                  {ext.specialAbility.description}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px" }}>
                  {[
                    ext.specialAbility.damage !== undefined && { label: "Sát thương", value: ext.specialAbility.damage, color: C.red },
                    ext.specialAbility.cooldown !== undefined && { label: "Hồi chiêu", value: `${ext.specialAbility.cooldown}s`, color: C.gold },
                    ext.specialAbility.radius !== undefined && { label: "Bán kính", value: `${ext.specialAbility.radius}px`, color: C.orange },
                    ext.specialAbility.duration !== undefined && { label: "Thời gian", value: `${ext.specialAbility.duration}s`, color: C.cyan },
                    ext.specialAbility.targets !== undefined && { label: "Mục tiêu", value: ext.specialAbility.targets || "N/A", color: C.textSoft },
                    ext.specialAbility.effect && { label: "Hiệu ứng", value: ext.specialAbility.effect, color: C.purple },
                  ].filter(Boolean).map((row) => {
                    const r = row as { label: string; value: string | number; color: string };
                    return (
                      <div key={r.label} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "3px 8px", backgroundColor: C.panelDeep,
                        border: `1px solid ${C.borderSoft}`, borderRadius: 4,
                      }}>
                        <span style={{ fontSize: 9, color: C.dim, letterSpacing: 0.5 }}>{r.label}</span>
                        <span style={{ fontSize: "0.74rem", fontWeight: 800, color: r.color }}>{r.value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </>
        )}

        <Divider color={def.tint} />

        {/* --- Description --- */}
        <section>
          <SectionHeading label="📖 MÔ TẢ" color={C.gold} />
          <p style={{
            margin: "8px 0 0", fontSize: "0.78rem", color: C.textSoft, lineHeight: 1.65,
            padding: "10px 12px", backgroundColor: C.panelDeep,
            border: `1px solid ${C.borderSoft}`, borderRadius: 6,
            fontStyle: "italic",
          }}>
            {ext.description}
          </p>
        </section>

        {/* --- Strengths & Weaknesses --- */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <section>
            <SectionHeading label="✅ ĐIỂM MẠNH" color={C.green} />
            <ul style={{ margin: "8px 0 0", padding: "10px 12px 10px 24px",
              backgroundColor: `${C.green}08`, border: `1px solid ${C.green}28`,
              borderLeft: `2px solid ${C.green}`, borderRadius: 6, listStyle: "disc" }}>
              {ext.strengths.map((s) => (
                <li key={s} style={{ fontSize: "0.72rem", color: C.green, marginBottom: 4, lineHeight: 1.4 }}>{s}</li>
              ))}
            </ul>
          </section>
          <section>
            <SectionHeading label="❌ ĐIỂM YẾU" color={C.red} />
            <ul style={{ margin: "8px 0 0", padding: "10px 12px 10px 24px",
              backgroundColor: `${C.red}08`, border: `1px solid ${C.red}28`,
              borderLeft: `2px solid ${C.red}`, borderRadius: 6, listStyle: "disc" }}>
              {ext.weaknesses.map((w) => (
                <li key={w} style={{ fontSize: "0.72rem", color: C.red, marginBottom: 4, lineHeight: 1.4 }}>{w}</li>
              ))}
            </ul>
          </section>
        </div>

        <p style={{ margin: 0, fontSize: 9, color: "#5A5A55", textAlign: "center", lineHeight: 1.5 }}>
          Thông tin đồng bộ từ bộ nhớ game. UFO tự động bắn quanh người chơi.
        </p>
      </div>
    </div>
  );
}

function SectionHeading({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color,
      textTransform: "uppercase", paddingBottom: 4,
      borderBottom: `1px solid ${color}30`,
    }}>
      {label}
    </div>
  );
}

function Divider({ color }: { color: string }) {
  return (
    <div style={{
      height: 1,
      background: `linear-gradient(90deg, transparent, ${color}30, transparent)`,
    }} />
  );
}

// ─── UFO Fleet Tab ────────────────────────────────────────────────────────────

function UFOFleetTab() {
  const [selectedId, setSelectedId] = useState<string>(UFO_CATALOG[0]?.id ?? "");

  const selectedDef = UFO_CATALOG.find((u) => u.id === selectedId) ?? null;
  const selectedExt = UFO_EXT_CATALOG.find((u) => u.id === selectedId);

  const selectedIdx = UFO_CATALOG.findIndex((u) => u.id === selectedId);
  const prevDef = selectedIdx > 0 ? UFO_CATALOG[selectedIdx - 1] : null;
  const nextDef = selectedIdx < UFO_CATALOG.length - 1 ? UFO_CATALOG[selectedIdx + 1] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* --- UFO List (always visible) --- */}
      <div style={{ padding: "8px 10px 6px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: C.dim, marginBottom: 2 }}>
          🛸 DANH SÁCH UFO ({UFO_CATALOG.length})
        </div>
        {UFO_CATALOG.map((def) => {
          const ext = UFO_EXT_CATALOG.find((u) => u.id === def.id);
          return (
            <UFOSelectCard
              key={def.id}
              def={def}
              ext={ext}
              isSelected={selectedId === def.id}
              onClick={() => setSelectedId(def.id)}
            />
          );
        })}
      </div>

      {/* --- Detail panel --- */}
      {selectedDef && (
        <>
          <div style={{
            height: 1, margin: "4px 10px",
            background: `linear-gradient(90deg, transparent, ${selectedDef.tint}40, transparent)`
          }} />
          <UFODetailPanel
            def={selectedDef}
            ext={selectedExt}
            onClose={() => setSelectedId("")}
          />
          {/* Prev / Next navigation */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "6px 14px 10px", gap: 8,
          }}>
            <button type="button"
              disabled={!prevDef}
              onClick={() => prevDef && setSelectedId(prevDef.id)}
              aria-label="UFO trước"
              style={{
                flex: 1, padding: "6px 0", fontFamily: "inherit", cursor: prevDef ? "pointer" : "not-allowed",
                backgroundColor: prevDef ? `${prevDef.tint}12` : "transparent",
                border: `1px solid ${prevDef ? prevDef.tint + "50" : C.borderSoft}`,
                borderRadius: 5, color: prevDef ? prevDef.tint : C.dim,
                fontSize: "0.72rem", fontWeight: 700, letterSpacing: 1,
                transition: "all 0.15s ease",
                opacity: prevDef ? 1 : 0.4,
              }}>
              ← {prevDef ? prevDef.name : "UFO TRƯỚC"}
            </button>
            <span style={{ fontSize: 9, color: C.dim, whiteSpace: "nowrap" }}>
              {selectedIdx + 1} / {UFO_CATALOG.length}
            </span>
            <button type="button"
              disabled={!nextDef}
              onClick={() => nextDef && setSelectedId(nextDef.id)}
              aria-label="UFO tiếp theo"
              style={{
                flex: 1, padding: "6px 0", fontFamily: "inherit", cursor: nextDef ? "pointer" : "not-allowed",
                backgroundColor: nextDef ? `${nextDef.tint}12` : "transparent",
                border: `1px solid ${nextDef ? nextDef.tint + "50" : C.borderSoft}`,
                borderRadius: 5, color: nextDef ? nextDef.tint : C.dim,
                fontSize: "0.72rem", fontWeight: 700, letterSpacing: 1,
                transition: "all 0.15s ease",
                opacity: nextDef ? 1 : 0.4,
              }}>
              {nextDef ? nextDef.name : "UFO TIẾP THEO"} →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main exported component ─────────────────────────────────────────────────

export function WeaponUFOSection() {
  const [weapons, setWeapons] = useState<Record<string, WeaponData> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; data: WeaponData } | null>(null);
  const [tab, setTab] = useState<"weapons" | "ufos">("weapons");

  useEffect(() => {
    let alive = true;
    setError(null);
    loadWeapons()
      .then((data) => { if (alive) setWeapons(data); })
      .catch(() => { if (alive) setError("Không tải được dữ liệu vũ khí."); });
    return () => { alive = false; };
  }, []);

  return (
    <>
      {/* Inject keyframe for detail panel animation */}
      <style>{`
        @keyframes ufo-detail-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ ...cardBase, width: "100%" }}>
        {/* Header */}
        <div style={{ padding: "18px 20px 0", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <h2 style={{
              margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: 2,
              color: C.gold, textTransform: "uppercase"
            }}>
              THÔNG TIN VŨ KHÍ &amp; UFO
            </h2>
            <span style={{ fontSize: 10, letterSpacing: 1, color: C.dim, whiteSpace: "nowrap" }}>
              {tab === "weapons" ? `${WEAPON_ORDER.length} VŨ KHÍ` : `${UFO_CATALOG.length} UFO`}
            </span>
          </div>
          {/* Sub-tabs */}
          <div style={{ display: "flex" }}>
            {(["weapons", "ufos"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: "8px 0", background: "transparent", border: "none",
                  borderBottom: tab === t ? `2px solid ${C.gold}` : "2px solid transparent",
                  color: tab === t ? C.gold : C.dim, fontWeight: 700, fontSize: "0.72rem",
                  letterSpacing: 1.5, cursor: "pointer", fontFamily: "inherit",
                  textTransform: "uppercase", transition: "color 0.15s, border-bottom-color 0.15s"
                }}>
                {t === "weapons" ? "VŨ KHÍ" : "ĐỘI UFO"}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {tab === "weapons" ? (
          <div style={{ padding: "10px 10px 4px", display: "flex", flexDirection: "column", gap: 6 }}>
            {error ? (
              <div style={{ padding: 20, textAlign: "center", color: C.dim, fontSize: "0.82rem" }}>{error}</div>
            ) : !weapons ? (
              <div style={{ padding: "24px 20px", textAlign: "center", color: C.dim }}>
                ĐANG TẢI DỮ LIỆU VŨ KHÍ...
              </div>
            ) : (
              WEAPON_ORDER.map((id) => {
                const data = weapons[id];
                if (!data) return null;
                return <WeaponRow key={id} id={id} data={data} onClick={() => setSelected({ id, data })} />;
              })
            )}
            <p style={{ margin: 0, padding: "6px 4px 10px", fontSize: 10, color: "#5A5A55", lineHeight: 1.5 }}>
              Bấm vào vũ khí để xem chi tiết. Mua tại SHOP trong game.
            </p>
          </div>
        ) : (
          <UFOFleetTab />
        )}

        {selected && <WeaponModal id={selected.id} data={selected.data} onClose={() => setSelected(null)} />}
      </div>
    </>
  );
}
