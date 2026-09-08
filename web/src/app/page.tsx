"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_SAVE, SaveManager, type SaveData } from "@/game/save";
import { AudioManager } from "@/game/audio";

interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  wave: number;
  zombies_killed: number;
  survival_time: number;
}

interface PlayerStatsData {
  total_games: number;
  best_score: number;
  best_wave: number;
  total_zombies_killed: number;
  best_survival_time: number;
}

type Tab = "play" | "leaderboard";

// Design tokens — keep aligned with globals.css (#10120E bg, #DEDED6 text)
const C = {
  bg: "#10120E",
  bgDeep: "#0A0B08",
  panel: "#1C1E1A",
  panelDeep: "#151713",
  panelInset: "#10120E",
  border: "#3C3C36",
  borderSoft: "#282A24",
  text: "#EBEBE1",
  textSoft: "#C8C8C2",
  dim: "#82827E",
  red: "#FF3C46",
  redHover: "#FF5A63",
  redDeep: "#C82832",
  gold: "#FFC850",
  green: "#6EDC82",
  bronze: "#C88C50",
  silver: "#C8C8C2",
  cyan: "#5ADCFF",
  cyanDim: "#303036",
};

const FONT =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const cardBase: React.CSSProperties = {
  backgroundColor: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
  boxSizing: "border-box",
};

const sectionHeading: React.CSSProperties = {
  margin: "0 0 16px 0",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 2,
  color: C.gold,
  textTransform: "uppercase",
  borderBottom: `1px solid ${C.border}`,
  paddingBottom: 10,
};

function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function Home() {
  const router = useRouter();

  // Auth & User state
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [currentUser, setCurrentUser] = useState<{
    id: string;
    username: string;
    display_name: string;
  } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Player Stats
  const [stats, setStats] = useState<PlayerStatsData>({
    total_games: 0,
    best_score: 0,
    best_wave: 0,
    total_zombies_killed: 0,
    best_survival_time: 0,
  });

  // Room & Save state
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [hasSave, setHasSave] = useState(false);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<Tab>("play");
  const [hovered, setHovered] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch("/api/player/me");
        const data = (await res.json()) as any;
        if (data.success && data.user) {
          setCurrentUser(data.user);
          setIsLoggedIn(true);
          fetchPlayerStats();
          checkSave();
        } else {
          setIsLoggedIn(false);
          setCurrentUser(null);
        }
      } catch {
        setIsLoggedIn(false);
        setCurrentUser(null);
      }
      fetchLeaderboard();
    };
    init();
  }, []);

  const fetchPlayerStats = async () => {
    try {
      const res = await fetch("/api/player/stats");
      const data = (await res.json()) as any;
      if (data.success && data.data) {
        setStats(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch player stats:", err);
    }
  };

  const checkSave = async () => {
    try {
      const saveRes = await fetch("/api/game/save");
      const saveData = (await saveRes.json()) as any;
      setHasSave(!!saveData.save);
    } catch {
      setHasSave(false);
    }
  };

  const fetchLeaderboard = async () => {
    setIsRefreshing(true);
    setLeaderboardError(null);
    try {
      const res = await fetch("/api/leaderboard");
      const data = (await res.json()) as any;
      if (data.success && (data.data || data.leaderboard)) {
        const list = data.data || data.leaderboard;
        setLeaderboard(list);
        setLastUpdated(
          new Date().toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        );
      } else {
        setLeaderboardError("KHÔNG THỂ TẢI BẢNG XẾP HẠNG.");
      }
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
      setLeaderboardError("KHÔNG THỂ TẢI BẢNG XẾP HẠNG.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      const endpoint =
        authTab === "register" ? "/api/player/register" : "/api/player/login";
      const payload =
        authTab === "register"
          ? {
              username: usernameInput,
              password: passwordInput,
              display_name: displayNameInput || usernameInput,
            }
          : {
              username: usernameInput,
              password: passwordInput,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as any;
      if (data.success && data.user) {
        setCurrentUser(data.user);
        setIsLoggedIn(true);
        setUsernameInput("");
        setPasswordInput("");
        setDisplayNameInput("");
        await fetchPlayerStats();
        await checkSave();
      } else {
        setAuthError(data.error || "Đã xảy ra lỗi khi xác thực");
      }
    } catch (err: any) {
      setAuthError("Không thể kết nối đến máy chủ");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/player/logout", { method: "POST" });
    } catch {}
    setCurrentUser(null);
    setIsLoggedIn(false);
    setStats({
      total_games: 0,
      best_score: 0,
      best_wave: 0,
      total_zombies_killed: 0,
      best_survival_time: 0,
    });
    setHasSave(false);
  };

  const startSinglePlayer = () => {
    if (!isLoggedIn || !currentUser) return;
    router.push(
      `/play?mode=single&name=${encodeURIComponent(
        currentUser.display_name || currentUser.username
      )}`
    );
  };

  const continueSinglePlayer = () => {
    if (!isLoggedIn || !currentUser) return;
    router.push(
      `/play?mode=single&continue=1&name=${encodeURIComponent(
        currentUser.display_name || currentUser.username
      )}`
    );
  };

  const startNewSinglePlayer = () => {
    if (!isLoggedIn || !currentUser) return;
    if (confirm("Bắt đầu chơi mới sẽ xóa file lưu cũ. Bạn có muốn tiếp tục?")) {
      // Replace the old save with a fresh server-generated progression
      // (level 1, $0, pistol only, UFO locked, skill tree reset) instead of
      // deleting the row — New Game = Fresh Save State, never the old save.
      fetch("/api/game/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "new_game" }),
      }).catch((err) => console.error("Failed to reset old save:", err));
      router.push(
        `/play?mode=single&name=${encodeURIComponent(
          currentUser.display_name || currentUser.username
        )}`
      );
    }
  };

  const hostRoom = () => {
    if (!isLoggedIn || !currentUser) return;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    router.push(
      `/play?mode=host&room=${code}&name=${encodeURIComponent(
        currentUser.display_name || currentUser.username
      )}`
    );
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn || !currentUser) return;
    if (roomCodeInput.length !== 4) return;
    const code = roomCodeInput.toUpperCase();
    router.push(
      `/play?mode=guest&room=${code}&name=${encodeURIComponent(
        currentUser.display_name || currentUser.username
      )}`
    );
  };

  return (
    <main
      style={{
        backgroundColor: C.bg,
        color: C.text,
        minHeight: "100vh",
        fontFamily: FONT,
        padding: "32px 20px",
        boxSizing: "border-box",
        backgroundImage:
          "radial-gradient(circle at 50% 0%, rgba(255,60,70,0.06) 0%, rgba(10,10,10,0) 55%), radial-gradient(circle at center, rgba(30,8,8,0.45) 0%, rgba(10,10,10,0.95) 100%)",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* Header */}
        <header style={{ textAlign: "center", marginBottom: 28 }}>
          <h1
            style={{
              fontSize: "clamp(1.9rem, 5vw, 3.2rem)",
              fontWeight: 900,
              color: C.red,
              letterSpacing: 4,
              margin: 0,
              textShadow: "0 0 18px rgba(255, 60, 70, 0.35)",
              lineHeight: 1.1,
            }}
          >
            ZOMBIE SURVIVAL 2D
          </h1>
          <p
            style={{
              color: C.dim,
              fontSize: "0.95rem",
              marginTop: 10,
              letterSpacing: 1.5,
            }}
          >
            SURVIVE THE HORDE
          </p>
        </header>

        {/* 2-column lobby grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 5fr) minmax(0, 7fr)",
            gap: 24,
            alignItems: "start",
          }}
          className="zs-lobby-grid"
        >
          {/* LEFT COLUMN */}
          <section
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
              minWidth: 0,
            }}
          >
            {/* Survivor Profile / Auth */}
            <div style={{ ...cardBase, padding: 22 }}>
              <h2 style={sectionHeading}>
                {isLoggedIn ? "MY RECORD (HỒ SƠ SURVIVOR)" : "PLAYER ACCOUNT"}
              </h2>

              {!isLoggedIn ? (
                <div>
                  {/* Auth Mode Toggle */}
                  <div
                    style={{
                      display: "flex",
                      backgroundColor: C.panelDeep,
                      borderRadius: 4,
                      padding: 2,
                      marginBottom: 16,
                      border: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab("login");
                        setAuthError(null);
                      }}
                      style={{
                        flex: 1,
                        padding: "8px 0",
                        backgroundColor:
                          authTab === "login" ? C.red : "transparent",
                        color: authTab === "login" ? C.bgDeep : C.textSoft,
                        border: "none",
                        fontWeight: 700,
                        fontSize: "0.8rem",
                        letterSpacing: 1,
                        borderRadius: 3,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      ĐĂNG NHẬP
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab("register");
                        setAuthError(null);
                      }}
                      style={{
                        flex: 1,
                        padding: "8px 0",
                        backgroundColor:
                          authTab === "register" ? C.red : "transparent",
                        color: authTab === "register" ? C.bgDeep : C.textSoft,
                        border: "none",
                        fontWeight: 700,
                        fontSize: "0.8rem",
                        letterSpacing: 1,
                        borderRadius: 3,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      ĐĂNG KÝ
                    </button>
                  </div>

                  <form
                    onSubmit={handleAuthSubmit}
                    style={{ display: "flex", flexDirection: "column", gap: 12 }}
                  >
                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          color: C.dim,
                          letterSpacing: 1.5,
                          textTransform: "uppercase",
                          display: "block",
                          marginBottom: 4,
                        }}
                      >
                        Tên đăng nhập
                      </label>
                      <input
                        type="text"
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        maxLength={20}
                        required
                        placeholder="username"
                        style={{
                          padding: "10px 12px",
                          backgroundColor: C.bgDeep,
                          border: `1px solid ${C.border}`,
                          color: C.text,
                          fontFamily: "inherit",
                          fontSize: "0.9rem",
                          borderRadius: 4,
                          outline: "none",
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    {authTab === "register" && (
                      <div>
                        <label
                          style={{
                            fontSize: 11,
                            color: C.dim,
                            letterSpacing: 1.5,
                            textTransform: "uppercase",
                            display: "block",
                            marginBottom: 4,
                          }}
                        >
                          Tên hiển thị (Display Name)
                        </label>
                        <input
                          type="text"
                          value={displayNameInput}
                          onChange={(e) => setDisplayNameInput(e.target.value)}
                          maxLength={20}
                          placeholder="Zombie Hunter"
                          style={{
                            padding: "10px 12px",
                            backgroundColor: C.bgDeep,
                            border: `1px solid ${C.border}`,
                            color: C.text,
                            fontFamily: "inherit",
                            fontSize: "0.9rem",
                            borderRadius: 4,
                            outline: "none",
                            width: "100%",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    )}

                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          color: C.dim,
                          letterSpacing: 1.5,
                          textTransform: "uppercase",
                          display: "block",
                          marginBottom: 4,
                        }}
                      >
                        Mật khẩu
                      </label>
                      <input
                        type="password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        required
                        placeholder="••••••••"
                        style={{
                          padding: "10px 12px",
                          backgroundColor: C.bgDeep,
                          border: `1px solid ${C.border}`,
                          color: C.text,
                          fontFamily: "inherit",
                          fontSize: "0.9rem",
                          borderRadius: 4,
                          outline: "none",
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    {authError && (
                      <div
                        style={{
                          color: C.red,
                          fontSize: "0.78rem",
                          backgroundColor: "rgba(255,60,70,0.1)",
                          border: `1px solid ${C.redDeep}`,
                          padding: "8px 10px",
                          borderRadius: 4,
                        }}
                      >
                        {authError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      style={{
                        padding: "11px 12px",
                        backgroundColor: C.red,
                        color: C.bgDeep,
                        border: "none",
                        fontWeight: 800,
                        cursor: authLoading ? "not-allowed" : "pointer",
                        fontSize: "0.9rem",
                        letterSpacing: 1.5,
                        borderRadius: 4,
                        marginTop: 4,
                        opacity: authLoading ? 0.7 : 1,
                        transition: "background-color 0.15s ease",
                      }}
                    >
                      {authLoading
                        ? "ĐANG XỬ LÝ..."
                        : authTab === "register"
                        ? "TẠO TÀI KHOẢN"
                        : "ĐĂNG NHẬP"}
                    </button>
                  </form>
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 16,
                      paddingBottom: 14,
                      borderBottom: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "1.1rem",
                          fontWeight: 800,
                          color: "#FFFFFF",
                          letterSpacing: 1,
                        }}
                      >
                        {currentUser?.display_name || currentUser?.username}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: C.dim,
                          letterSpacing: 1,
                        }}
                      >
                        @{currentUser?.username}
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      style={{
                        background: "none",
                        border: `1px solid ${C.redDeep}`,
                        color: C.red,
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        letterSpacing: 1.5,
                        padding: "6px 12px",
                        borderRadius: 4,
                        fontWeight: 700,
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = C.red;
                        e.currentTarget.style.color = C.bgDeep;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = C.red;
                      }}
                    >
                      ĐĂNG XUẤT
                    </button>
                  </div>

                  {/* Player Stats Grid — MY RECORD */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      columnGap: 16,
                      rowGap: 10,
                      fontSize: "0.85rem",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        color: C.dim,
                        letterSpacing: 1.5,
                        fontSize: 11,
                        textTransform: "uppercase",
                      }}
                    >
                      BEST SCORE
                    </span>
                    <span
                      style={{
                        color: C.gold,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                        fontSize: "0.95rem",
                      }}
                    >
                      {stats.best_score.toLocaleString()}
                    </span>

                    <span
                      style={{
                        color: C.dim,
                        letterSpacing: 1.5,
                        fontSize: 11,
                        textTransform: "uppercase",
                      }}
                    >
                      BEST WAVE
                    </span>
                    <span
                      style={{
                        color: C.cyan,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      Wave {stats.best_wave}
                    </span>

                    <span
                      style={{
                        color: C.dim,
                        letterSpacing: 1.5,
                        fontSize: 11,
                        textTransform: "uppercase",
                      }}
                    >
                      ZOMBIES KILLED
                    </span>
                    <span
                      style={{
                        color: C.red,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {stats.total_zombies_killed.toLocaleString()}
                    </span>

                    <span
                      style={{
                        color: C.dim,
                        letterSpacing: 1.5,
                        fontSize: 11,
                        textTransform: "uppercase",
                      }}
                    >
                      BEST SURVIVAL TIME
                    </span>
                    <span
                      style={{
                        color: C.text,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatTime(stats.best_survival_time)}
                    </span>

                    <span
                      style={{
                        color: C.dim,
                        letterSpacing: 1.5,
                        fontSize: 11,
                        textTransform: "uppercase",
                      }}
                    >
                      TOTAL GAMES
                    </span>
                    <span
                      style={{
                        color: C.textSoft,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {stats.total_games}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* How To Play */}
            <div style={{ ...cardBase, padding: 22 }}>
              <h2 style={sectionHeading}>How To Play</h2>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  fontSize: "0.82rem",
                  lineHeight: 1.7,
                  color: C.textSoft,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <li style={controlRow}>
                  <span style={keyBadge}>WASD</span>
                  <span style={controlDesc}>Di chuyển</span>
                </li>
                <li style={controlRow}>
                  <span style={keyBadge}>MOUSE</span>
                  <span style={controlDesc}>Ngắm bắn</span>
                </li>
                <li style={controlRow}>
                  <span style={keyBadge}>LMB</span>
                  <span style={controlDesc}>Bắn</span>
                </li>
                <li style={controlRow}>
                  <span style={keyBadge}>R</span>
                  <span style={controlDesc}>Thay đạn</span>
                </li>
                <li style={controlRow}>
                  <span style={keyBadge}>1–5</span>
                  <span style={controlDesc}>Đổi vũ khí</span>
                </li>
                <li style={controlRow}>
                  <span
                    style={{ ...keyBadge, color: C.cyan, borderColor: C.cyan }}
                  >
                    E (Hold)
                  </span>
                  <span style={controlDesc}>Hút nhanh Loot quanh người</span>
                </li>
                <li style={controlRow}>
                  <span
                    style={{ ...keyBadge, color: C.gold, borderColor: C.gold }}
                  >
                    F
                  </span>
                  <span style={controlDesc}>Ném bom (nổ theo vùng)</span>
                </li>
                <li style={controlRow}>
                  <span style={keyBadge}>ESC</span>
                  <span style={controlDesc}>Tạm dừng</span>
                </li>
              </ul>
            </div>
          </section>

          {/* RIGHT COLUMN — Tabs + Content */}
          <section
            style={{
              ...cardBase,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            {/* Tabs */}
            <div
              style={{
                display: "flex",
                borderBottom: `1px solid ${C.border}`,
                backgroundColor: C.panelDeep,
                borderRadius: "8px 8px 0 0",
                overflow: "hidden",
              }}
              role="tablist"
            >
              <TabButton
                label="GAME LOBBY"
                active={activeTab === "play"}
                onClick={() => setActiveTab("play")}
              />
              <TabButton
                label="LEADERBOARD"
                active={activeTab === "leaderboard"}
                onClick={() => {
                  setActiveTab("leaderboard");
                  fetchLeaderboard();
                }}
              />
            </div>

            {/* Content Area */}
            <div style={{ padding: "24px 24px 28px", flex: 1 }}>
              {activeTab === "play" ? (
                !isLoggedIn ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "40px 16px",
                      textAlign: "center",
                      color: C.dim,
                      gap: 16,
                    }}
                  >
                    <div style={{ fontSize: "2.5rem" }}>🔒</div>
                    <div
                      style={{
                        fontSize: "0.95rem",
                        color: C.textSoft,
                        fontWeight: 700,
                        letterSpacing: 1,
                      }}
                    >
                      VUI LÒNG ĐĂNG NHẬP ĐỂ CHƠI
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.8rem",
                        color: C.dim,
                        lineHeight: 1.5,
                        maxWidth: 340,
                      }}
                    >
                      Hãy **ĐĂNG NHẬP** hoặc **ĐĂNG KÝ** tài khoản ở khung bên trái để lưu thành tích, save game và tham gia bảng xếp hạng.
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 20,
                    }}
                  >
                    {/* Single Player Buttons */}
                    {hasSave ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        <button
                          onClick={continueSinglePlayer}
                          onMouseEnter={() => setHovered("continue")}
                          onMouseLeave={() => setHovered(null)}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            backgroundColor:
                              hovered === "continue" ? "#FFD700" : "#FFC850",
                            color: C.bgDeep,
                            fontSize: "1.05rem",
                            fontWeight: 800,
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                            letterSpacing: 2,
                            boxShadow:
                              hovered === "continue"
                                ? "0 4px 18px rgba(255, 200, 80, 0.45)"
                                : "0 2px 12px rgba(255, 200, 80, 0.25)",
                            transition:
                              "background-color 0.15s ease, box-shadow 0.15s ease, transform 0.05s ease",
                            transform:
                              hovered === "continue"
                                ? "translateY(-1px)"
                                : "none",
                          }}
                        >
                          ▶ TIẾP TỤC CHƠI (CONTINUE)
                        </button>
                        <button
                          onClick={startNewSinglePlayer}
                          onMouseEnter={() => setHovered("new_game")}
                          onMouseLeave={() => setHovered(null)}
                          style={{
                            width: "100%",
                            padding: "10px 16px",
                            color: C.textSoft,
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            border: `1px solid ${C.border}`,
                            borderRadius: 6,
                            cursor: "pointer",
                            letterSpacing: 2,
                            transition: "all 0.15s ease",
                            transform:
                              hovered === "new_game"
                                ? "translateY(-1px)"
                                : "none",
                            backgroundColor:
                              hovered === "new_game"
                                ? "rgba(255,255,255,0.05)"
                                : "transparent",
                          }}
                        >
                          🎮 CHƠI MỚI (NEW GAME)
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={startSinglePlayer}
                        onMouseEnter={() => setHovered("single")}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          backgroundColor:
                            hovered === "single" ? C.redHover : C.red,
                          color: C.bgDeep,
                          fontSize: "1.05rem",
                          fontWeight: 800,
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          letterSpacing: 2,
                          boxShadow:
                            hovered === "single"
                              ? "0 4px 18px rgba(255, 90, 99, 0.45)"
                              : "0 2px 12px rgba(255, 60, 70, 0.25)",
                          transition:
                            "background-color 0.15s ease, box-shadow 0.15s ease, transform 0.05s ease",
                          transform:
                            hovered === "single" ? "translateY(-1px)" : "none",
                        }}
                      >
                        ▶ CHƠI ĐƠN (SINGLE PLAYER)
                      </button>
                    )}

                    {/* Settings entry point — opens the same persisted settings
                        (AUDIO / GAMEPLAY / DISPLAY) the in-game settings screens
                        read and write via localStorage (zs.save.v1). */}
                    <SettingsButton onClick={() => setShowSettings(true)} />

                    {/* Co-op divider */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          height: 1,
                          backgroundColor: C.border,
                        }}
                      />
                      <span
                        style={{
                          color: C.dim,
                          fontSize: 11,
                          letterSpacing: 1.5,
                          textTransform: "uppercase",
                        }}
                      >
                        Hoặc chơi mạng (Co-op)
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 1,
                          backgroundColor: C.border,
                        }}
                      />
                    </div>

                    {/* Co-op cards */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 16,
                      }}
                      className="zs-coop-grid"
                    >
                      {/* Host */}
                      <div
                        style={{
                          backgroundColor: C.panelDeep,
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          padding: 18,
                          display: "flex",
                          flexDirection: "column",
                          gap: 14,
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            color: C.gold,
                            fontSize: 11,
                            letterSpacing: 1.5,
                            textTransform: "uppercase",
                            fontWeight: 700,
                            textAlign: "center",
                          }}
                        >
                          Tạo phòng mới
                        </h3>
                        <button
                          onClick={hostRoom}
                          onMouseEnter={() => setHovered("host")}
                          onMouseLeave={() => setHovered(null)}
                          style={{
                            padding: "10px 12px",
                            backgroundColor: C.cyan,
                            color: C.bgDeep,
                            border: "none",
                            borderRadius: 4,
                            fontWeight: 800,
                            cursor: "pointer",
                            width: "100%",
                            fontSize: "0.85rem",
                            letterSpacing: 1.5,
                            opacity: hovered === "host" ? 0.9 : 1,
                            transition: "opacity 0.15s ease",
                          }}
                        >
                          HOST ROOM
                        </button>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.72rem",
                            color: C.dim,
                            textAlign: "center",
                            letterSpacing: 0.5,
                          }}
                        >
                          Tạo mã phòng 4 ký tự
                        </p>
                      </div>

                      {/* Join */}
                      <div
                        style={{
                          backgroundColor: C.panelDeep,
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          padding: 18,
                          display: "flex",
                          flexDirection: "column",
                          gap: 14,
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            color: C.gold,
                            fontSize: 11,
                            letterSpacing: 1.5,
                            textTransform: "uppercase",
                            fontWeight: 700,
                            textAlign: "center",
                          }}
                        >
                          Vào phòng có sẵn
                        </h3>
                        <form
                          onSubmit={joinRoom}
                          style={{
                            display: "flex",
                            gap: 8,
                            width: "100%",
                          }}
                        >
                          <input
                            type="text"
                            maxLength={4}
                            value={roomCodeInput}
                            onChange={(e) =>
                              setRoomCodeInput(e.target.value.toUpperCase())
                            }
                            placeholder="MÃ"
                            aria-label="Room code"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: "10px 8px",
                              backgroundColor: C.bgDeep,
                              border: `1px solid ${
                                roomCodeInput.length === 4 ? C.cyan : C.border
                              }`,
                              color: C.text,
                              fontFamily: "inherit",
                              textAlign: "center",
                              fontSize: "0.95rem",
                              letterSpacing: 3,
                              borderRadius: 4,
                              outline: "none",
                              transition: "border-color 0.15s ease",
                            }}
                          />
                          <button
                            type="submit"
                            disabled={roomCodeInput.length !== 4}
                            style={{
                              flex: "0 0 auto",
                              padding: "10px 14px",
                              backgroundColor:
                                roomCodeInput.length === 4
                                  ? C.cyan
                                  : C.cyanDim,
                              color: C.bgDeep,
                              border: "none",
                              borderRadius: 4,
                              fontWeight: 800,
                              cursor:
                                roomCodeInput.length === 4
                                  ? "pointer"
                                  : "not-allowed",
                              letterSpacing: 1.5,
                              fontSize: "0.85rem",
                              transition: "background-color 0.15s ease",
                            }}
                          >
                            JOIN
                          </button>
                        </form>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.72rem",
                            color: C.dim,
                            textAlign: "center",
                            letterSpacing: 0.5,
                          }}
                        >
                          Nhập mã 4 ký tự để vào
                        </p>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                /* Leaderboard View */
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {/* Leaderboard Header Actions & Refresh Button */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 16,
                      paddingBottom: 8,
                      borderBottom: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: leaderboardError ? C.red : C.dim,
                        letterSpacing: 0.5,
                      }}
                    >
                      {leaderboardError
                        ? leaderboardError
                        : lastUpdated
                        ? `Cập nhật lúc: ${lastUpdated}`
                        : "Bảng xếp hạng trực tuyến"}
                    </div>
                    <button
                      onClick={fetchLeaderboard}
                      disabled={isRefreshing}
                      style={{
                        padding: "6px 14px",
                        backgroundColor: isRefreshing
                          ? "rgba(255,255,255,0.05)"
                          : "transparent",
                        border: `1px solid ${
                          leaderboardError ? C.red : C.border
                        }`,
                        color: isRefreshing
                          ? C.dim
                          : leaderboardError
                          ? C.red
                          : C.red,
                        borderRadius: 4,
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: isRefreshing ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          animation: isRefreshing
                            ? "spin 1s linear infinite"
                            : "none",
                        }}
                      >
                        🔄
                      </span>
                      {isRefreshing
                        ? "ĐANG CẬP NHẬT..."
                        : leaderboardError
                        ? "THỬ LẠI"
                        : "CẬP NHẬT"}
                    </button>
                  </div>

                  {leaderboard.length === 0 ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "40px 16px",
                        color: C.dim,
                        fontSize: "0.85rem",
                        letterSpacing: 0.5,
                        lineHeight: 1.6,
                      }}
                    >
                      CHƯA CÓ DỮ LIỆU ĐIỂM CAO.
                      <br />
                      HÃY CHƠI MỘT TRẬN VÀ LƯU THÀNH TÍCH ĐỂ XUẤT HIỆN Ở ĐÂY!
                    </div>
                  ) : (
                    <div
                      style={{
                        maxHeight: 460,
                        overflowY: "auto",
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                      }}
                    >
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          textAlign: "left",
                          fontSize: "0.82rem",
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              backgroundColor: C.panelDeep,
                              color: C.gold,
                              position: "sticky",
                              top: 0,
                              zIndex: 10,
                            }}
                          >
                            <th
                              style={{
                                padding: "10px 12px",
                                fontSize: 11,
                                letterSpacing: 1.5,
                                textTransform: "uppercase",
                                fontWeight: 700,
                              }}
                            >
                              RANK
                            </th>
                            <th
                              style={{
                                padding: "10px 12px",
                                fontSize: 11,
                                letterSpacing: 1.5,
                                textTransform: "uppercase",
                                fontWeight: 700,
                              }}
                            >
                              PLAYER
                            </th>
                            <th
                              style={{
                                padding: "10px 12px",
                                fontSize: 11,
                                letterSpacing: 1.5,
                                textTransform: "uppercase",
                                fontWeight: 700,
                                textAlign: "right",
                              }}
                            >
                              SCORE
                            </th>
                            <th
                              style={{
                                padding: "10px 12px",
                                fontSize: 11,
                                letterSpacing: 1.5,
                                textTransform: "uppercase",
                                fontWeight: 700,
                                textAlign: "right",
                              }}
                            >
                              WAVE
                            </th>
                            <th
                              style={{
                                padding: "10px 12px",
                                fontSize: 11,
                                letterSpacing: 1.5,
                                textTransform: "uppercase",
                                fontWeight: 700,
                                textAlign: "right",
                              }}
                            >
                              KILLS
                            </th>
                            <th
                              style={{
                                padding: "10px 12px",
                                fontSize: 11,
                                letterSpacing: 1.5,
                                textTransform: "uppercase",
                                fontWeight: 700,
                                textAlign: "right",
                              }}
                            >
                              SURVIVAL TIME
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboard.map((entry, index) => {
                            const isTop1 = index === 0;
                            const isTop2 = index === 1;
                            const isTop3 = index === 2;

                            const rankColor = isTop1
                              ? C.gold
                              : isTop2
                              ? C.silver
                              : isTop3
                              ? C.bronze
                              : C.text;

                            const bgStyle = isTop1
                              ? "rgba(255, 200, 80, 0.08)"
                              : isTop2
                              ? "rgba(200, 200, 194, 0.05)"
                              : isTop3
                              ? "rgba(200, 140, 80, 0.05)"
                              : index % 2 === 0
                              ? "transparent"
                              : "rgba(255,255,255,0.015)";

                            return (
                              <tr
                                key={index}
                                style={{
                                  borderBottom: `1px solid ${C.borderSoft}`,
                                  color: rankColor,
                                  backgroundColor: bgStyle,
                                }}
                              >
                                <td
                                  style={{
                                    padding: "10px 12px",
                                    fontWeight: 800,
                                    width: 60,
                                  }}
                                >
                                  {isTop1 ? (
                                    <span style={{ color: C.gold }}>👑 #1</span>
                                  ) : isTop2 ? (
                                    <span style={{ color: C.silver }}>🥈 #2</span>
                                  ) : isTop3 ? (
                                    <span style={{ color: C.bronze }}>🥉 #3</span>
                                  ) : (
                                    `#${index + 1}`
                                  )}
                                </td>
                                <td
                                  style={{
                                    padding: "10px 12px",
                                    fontWeight: 700,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    maxWidth: 160,
                                  }}
                                  title={entry.username}
                                >
                                  {entry.username}
                                </td>
                                <td
                                  style={{
                                    padding: "10px 12px",
                                    color: C.gold,
                                    textAlign: "right",
                                    fontWeight: 800,
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {entry.score.toLocaleString()}
                                </td>
                                <td
                                  style={{
                                    padding: "10px 12px",
                                    color: C.cyan,
                                    textAlign: "right",
                                    fontWeight: 700,
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  Wave {entry.wave}
                                </td>
                                <td
                                  style={{
                                    padding: "10px 12px",
                                    color: C.red,
                                    textAlign: "right",
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {entry.zombies_killed.toLocaleString()}
                                </td>
                                <td
                                  style={{
                                    padding: "10px 12px",
                                    color: C.textSoft,
                                    textAlign: "right",
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {formatTime(entry.survival_time)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Responsive styles */}
      <style>{`
        .zs-lobby-grid {
          grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
        }
        .zs-coop-grid { grid-template-columns: 1fr 1fr; }
        @media (max-width: 880px) {
          .zs-lobby-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 520px) {
          .zs-coop-grid { grid-template-columns: 1fr !important; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes zs-settings-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes zs-settings-pop {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .zs-settings-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 0;
        }
        .zs-settings-row .zs-set-label {
          width: 132px;
          flex-shrink: 0;
        }
        @media (max-width: 560px) {
          .zs-settings-row { flex-wrap: wrap; row-gap: 4px; }
          .zs-settings-row .zs-set-label { width: 100%; }
        }
      `}</style>

      {/* Settings modal — reuses the game's localStorage settings (zs.save.v1). */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </main>
  );
}

// ---- Subcomponents ---------------------------------------------------------

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1,
        padding: "14px 12px",
        background: "transparent",
        border: "none",
        borderBottom: active
          ? `2px solid ${C.red}`
          : hover
          ? `1px solid ${C.border}`
          : "1px solid transparent",
        marginBottom: active ? -1 : 0,
        color: active ? C.red : hover ? C.text : C.dim,
        fontWeight: 700,
        fontSize: "0.95rem",
        cursor: "pointer",
        letterSpacing: 1.5,
        textTransform: "uppercase",
        transition: "color 0.15s ease, border-color 0.15s ease",
        fontFamily: "inherit",
        textShadow: active ? "0 0 8px rgba(255,60,70,0.35)" : "none",
      }}
    >
      {label}
    </button>
  );
}

// ---- Shared Style Snippets ------------------------------------------------

const controlRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "3px 0",
};

const keyBadge: React.CSSProperties = {
  display: "inline-block",
  minWidth: 64,
  padding: "3px 8px",
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  backgroundColor: C.panelDeep,
  color: C.gold,
  fontWeight: 700,
  fontSize: "0.72rem",
  letterSpacing: 1.2,
  textAlign: "center",
  fontFamily: "inherit",
  flexShrink: 0,
};

const controlDesc: React.CSSProperties = {
  color: C.textSoft,
  fontSize: "0.82rem",
};

// ---- Settings -------------------------------------------------------------

type BoolSettingKey =
  | "muted"
  | "fullscreen"
  | "show_fps"
  | "screen_shake"
  | "damage_numbers"
  | "hit_effects"
  | "footstep_dust"
  | "window_lights";

const settingsLabelStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: 1.5,
  color: C.textSoft,
  whiteSpace: "nowrap",
};

const settingsBarStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 70,
  height: 12,
  backgroundColor: "#1E1E26",
  borderRadius: 3,
  position: "relative",
};

const settingsValueStyle: React.CSSProperties = {
  width: 46,
  flexShrink: 0,
  textAlign: "right",
  color: C.gold,
  fontWeight: 800,
  fontSize: "0.8rem",
  fontVariantNumeric: "tabular-nums",
};

function SettingsButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        width: "100%",
        padding: "10px 16px",
        backgroundColor: pressed ? C.bgDeep : hover ? "#26262E" : C.panelDeep,
        color: hover ? "#FFFFFF" : C.textSoft,
        fontSize: "0.95rem",
        fontWeight: 700,
        border: `1px solid ${hover ? C.redHover : C.red}`,
        borderRadius: 6,
        cursor: "pointer",
        letterSpacing: 2,
        textTransform: "uppercase",
        fontFamily: "inherit",
        transition:
          "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
        boxShadow: hover ? "0 0 14px rgba(255, 60, 70, 0.22)" : "none",
      }}
    >
      <span style={{ color: C.gold, marginRight: 8 }}>⚙</span>
      SETTINGS
    </button>
  );
}

function SettingsSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "16px 0 6px",
      }}
    >
      <span
        style={{
          color: C.gold,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        {children}
      </span>
      <div style={{ flex: 1, height: 1, backgroundColor: C.border }} />
    </div>
  );
}

function StepBtn({
  label,
  ariaLabel,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        width: 30,
        height: 30,
        flexShrink: 0,
        borderRadius: 4,
        border: `1px solid ${hover ? C.redHover : C.red}`,
        backgroundColor: pressed ? C.bgDeep : hover ? "#2E2E3A" : "#22222A",
        color: hover ? "#FFFFFF" : C.textSoft,
        fontWeight: 800,
        fontSize: "0.95rem",
        lineHeight: 1,
        cursor: "pointer",
        fontFamily: "inherit",
        transition:
          "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
        boxShadow: hover ? "0 0 10px rgba(255, 60, 70, 0.3)" : "none",
      }}
    >
      {label}
    </button>
  );
}

function PillBtn({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        width: 78,
        padding: "7px 0",
        flexShrink: 0,
        borderRadius: 4,
        border: "none",
        backgroundColor: pressed
          ? "#0A0B08"
          : hover
          ? on
            ? "#7BE88F"
            : "#5A5A62"
          : on
          ? C.green
          : "#4A4A52",
        color: on ? "#0E0E10" : C.textSoft,
        fontWeight: 800,
        fontSize: "0.72rem",
        letterSpacing: 1.5,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background-color 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

function ModalBackButton({ onClose }: { onClose: () => void }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      onClick={onClose}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        width: "100%",
        marginTop: 20,
        padding: "11px 16px",
        backgroundColor: pressed ? C.bgDeep : hover ? "#26262E" : C.panelDeep,
        color: hover ? "#FFFFFF" : C.textSoft,
        fontSize: "0.9rem",
        fontWeight: 800,
        border: `1px solid ${hover ? C.redHover : C.red}`,
        borderRadius: 6,
        cursor: "pointer",
        letterSpacing: 2,
        textTransform: "uppercase",
        fontFamily: "inherit",
        transition:
          "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
        boxShadow: hover ? "0 0 14px rgba(255, 60, 70, 0.25)" : "none",
      }}
    >
      ← BACK
    </button>
  );
}

/**
 * Lobby settings panel. This is a DOM counterpart of the canvas settings
 * screens (menu.ts drawPauseSettings / drawSettings) but shares the exact
 * same persisted store — SaveManager / localStorage "zs.save.v1" — so
 * nothing here can drift from what the game reads on Continue / New Game.
 */
function SettingsModal({ onClose }: { onClose: () => void }) {
  const [st, setSt] = useState<SaveData["settings"]>(() => {
    try {
      return new SaveManager().settings;
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_SAVE.settings));
    }
  });
  const audioRef = useRef<AudioManager | null>(null);

  // Lazy audio mirroring the game's AudioManager, so volume/mute changes are
  // audible immediately and still land in the same persisted settings store.
  const getAudio = (): AudioManager | null => {
    if (!audioRef.current) {
      try {
        audioRef.current = new AudioManager();
        audioRef.current.load(st.master_volume, st.music_volume, st.sfx_volume);
        audioRef.current.setSfxMuted(st.muted);
      } catch {
        audioRef.current = null;
      }
    }
    return audioRef.current;
  };

  // Persist every change to the SAME localStorage key the game uses, so
  // Continue / New Game / the in-game pause menu all pick up these values.
  // Settings are never reset — every open re-reads the stored state.
  const persist = (next: SaveData["settings"]) => {
    setSt(next);
    try {
      const sm = new SaveManager();
      Object.assign(sm.data.settings, next);
      sm.save();
    } catch {
      // localStorage unavailable — keep the in-memory copy for this session.
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changeVolume = (
    key: "master_volume" | "music_volume" | "sfx_volume",
    delta: number,
  ) => {
    const val = Math.max(0, Math.min(1, Math.round((st[key] + delta) * 100) / 100));
    const next = { ...st, [key]: val };
    persist(next);
    try {
      const a = getAudio();
      a?.setVolumes(next.master_volume, next.music_volume, next.sfx_volume);
      if (key !== "music_volume") a?.play("click");
    } catch {
      // Audio unavailable — settings still persist.
    }
  };

  const toggleBool = (key: BoolSettingKey) => {
    const next = { ...st, [key]: !st[key] };
    persist(next);
    try {
      const a = getAudio();
      if (key === "muted") {
        a?.setSfxMuted(next.muted);
        if (!next.muted) a?.play("click");
      } else {
        a?.play("click");
      }
      if (key === "fullscreen") {
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        } else {
          document.documentElement.requestFullscreen?.().catch?.(() => {});
        }
      }
    } catch {
      // Fullscreen/audio failures must never break the settings toggle.
    }
  };

  const volumeRows: Array<
    ["master_volume" | "music_volume" | "sfx_volume", string]
  > = [
    ["master_volume", "MASTER VOLUME"],
    ["music_volume", "MUSIC VOLUME"],
    ["sfx_volume", "SFX VOLUME"],
  ];
  const toggleRows: Array<[BoolSettingKey, string]> = [
    ["screen_shake", "SCREEN SHAKE"],
    ["damage_numbers", "DAMAGE NUMBERS"],
    ["hit_effects", "HIT EFFECTS"],
    ["footstep_dust", "FOOTSTEP DUST"],
    ["window_lights", "WINDOW LIGHTS"],
    ["show_fps", "SHOW FPS"],
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        backgroundColor: "rgba(8, 8, 10, 0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "zs-settings-fade 0.15s ease-out",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="SETTINGS"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "min(88vh, 680px)",
          overflowY: "auto",
          boxSizing: "border-box",
          backgroundColor: C.panel,
          border: `2px solid ${C.red}`,
          borderRadius: 12,
          boxShadow:
            "0 0 34px rgba(255, 60, 70, 0.28), 0 10px 44px rgba(0, 0, 0, 0.65)",
          padding: "22px 24px 24px",
          animation: "zs-settings-pop 0.18s ease-out",
        }}
      >
        {/* Title */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "1.45rem",
              fontWeight: 900,
              color: C.red,
              letterSpacing: 4,
              textShadow: "0 0 14px rgba(255, 60, 70, 0.4)",
            }}
          >
            ⚙ SETTINGS
          </div>
        </div>
        <div
          style={{
            height: 1,
            margin: "10px 0 2px",
            background:
              "linear-gradient(90deg, rgba(255,60,70,0), rgba(255,60,70,0.6), rgba(255,60,70,0))",
          }}
        />

        {/* AUDIO */}
        <SettingsSectionTitle>AUDIO</SettingsSectionTitle>
        {volumeRows.map(([key, label]) => (
          <div key={key} className="zs-settings-row">
            <div className="zs-set-label" style={settingsLabelStyle}>
              {label}
            </div>
            <StepBtn
              label="−"
              ariaLabel={`Giảm ${label}`}
              onClick={() => changeVolume(key, -0.05)}
            />
            <div style={settingsBarStyle}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${Math.round(st[key] * 100)}%`,
                  background: "linear-gradient(90deg, #992030, #FF3C46)",
                  borderRadius: 3,
                }}
              />
            </div>
            <StepBtn
              label="+"
              ariaLabel={`Tăng ${label}`}
              onClick={() => changeVolume(key, 0.05)}
            />
            <div className="zs-set-value" style={settingsValueStyle}>
              {Math.round(st[key] * 100)}%
            </div>
          </div>
        ))}

        <div className="zs-settings-row">
          <div className="zs-set-label" style={settingsLabelStyle}>
            MUTE ALL
          </div>
          <div style={{ flex: 1 }} />
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              flexShrink: 0,
              backgroundColor: st.muted ? C.green : "#4A4A52",
            }}
          />
          <PillBtn
            on={st.muted}
            label={st.muted ? "MUTED" : "UNMUTE"}
            onClick={() => toggleBool("muted")}
          />
        </div>

        {/* GAMEPLAY */}
        <SettingsSectionTitle>GAMEPLAY</SettingsSectionTitle>
        {toggleRows.map(([key, label]) => (
          <div key={key} className="zs-settings-row">
            <div className="zs-set-label" style={settingsLabelStyle}>
              {label}
            </div>
            <div style={{ flex: 1 }} />
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                backgroundColor: st[key] ? C.green : "#4A4A52",
              }}
            />
            <PillBtn
              on={st[key]}
              label={st[key] ? "ON" : "OFF"}
              onClick={() => toggleBool(key)}
            />
          </div>
        ))}

        {/* DISPLAY */}
        <SettingsSectionTitle>DISPLAY</SettingsSectionTitle>
        <div className="zs-settings-row">
          <div className="zs-set-label" style={settingsLabelStyle}>
            FULLSCREEN
          </div>
          <div style={{ flex: 1 }} />
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              flexShrink: 0,
              backgroundColor: st.fullscreen ? C.green : "#4A4A52",
            }}
          />
          <PillBtn
            on={st.fullscreen}
            label={st.fullscreen ? "ON" : "OFF"}
            onClick={() => toggleBool("fullscreen")}
          />
        </div>

        {/* BRIGHTNESS — locked at 100%, read-only (same as in-game). */}
        <div className="zs-settings-row">
          <div className="zs-set-label" style={settingsLabelStyle}>
            BRIGHTNESS
          </div>
          <span
            style={{
              fontSize: "0.62rem",
              color: C.dim,
              letterSpacing: 1.5,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              padding: "2px 7px",
              flexShrink: 0,
            }}
          >
            LOCKED
          </span>
          <div style={settingsBarStyle}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                right: 0,
                background: "linear-gradient(90deg, #8A6000, #FFC850)",
                borderRadius: 3,
              }}
            />
          </div>
          <div className="zs-set-value" style={settingsValueStyle}>
            100%
          </div>
        </div>

        <ModalBackButton onClose={onClose} />
      </div>
    </div>
  );
}