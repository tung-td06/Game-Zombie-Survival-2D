"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface LeaderboardEntry {
  username: string;
  score: number;
  kills: number;
  wave: number;
  level: number;
  date: string;
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

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [stats, setStats] = useState({ highScore: 0, totalKills: 0, level: 1 });
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("play");
  const [hovered, setHovered] = useState<string | null>(null);
  const [hasSave, setHasSave] = useState(false);

  useEffect(() => {
    const savedName = localStorage.getItem("zs.username");
    if (savedName) {
      setUsername(savedName);
      setIsLoggedIn(true);
      fetchProfile(savedName);
    }
    fetchLeaderboard();
  }, []);

  const fetchProfile = async (name: string) => {
    try {
      const res = await fetch(`/api/profile?username=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (data.profile) {
        localStorage.setItem("zs.save.v1", JSON.stringify(data.profile));
        setStats({
          highScore: data.profile.high_score || 0,
          totalKills: data.profile.total_kills || 0,
          level: data.profile.player_level || 1,
        });
      } else {
        const localSave = localStorage.getItem("zs.save.v1");
        const defaultProfile = localSave
          ? JSON.parse(localSave)
          : {
              high_score: 0,
              total_kills: 0,
              coins: 0,
              player_level: 1,
              xp: 0,
              unlocked_weapons: ["pistol"],
              weapon_upgrades: {},
              player_upgrades: {},
              achievements: [],
              quests_claimed: [],
              settings: {},
            };
        await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: name, profileData: defaultProfile }),
        });
        setStats({
          highScore: defaultProfile.high_score || 0,
          totalKills: defaultProfile.total_kills || 0,
          level: defaultProfile.player_level || 1,
        });
      }

      // Check if user has a save game
      const saveRes = await fetch(`/api/game/save?username=${encodeURIComponent(name)}`);
      const saveData = await saveRes.json();
      if (saveData.save) {
        setHasSave(true);
      } else {
        setHasSave(false);
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    }
  };

  const fetchLeaderboard = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      if (data.leaderboard) {
        setLeaderboard(data.leaderboard);
        setLastUpdated(new Date().toLocaleTimeString("vi-VN", { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    const cleanName = username.trim();
    localStorage.setItem("zs.username", cleanName);
    setIsLoggedIn(true);
    fetchProfile(cleanName);
  };

  const handleLogout = () => {
    localStorage.removeItem("zs.username");
    localStorage.removeItem("zs.save.v1");
    setUsername("");
    setIsLoggedIn(false);
    setStats({ highScore: 0, totalKills: 0, level: 1 });
    setHasSave(false);
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  };

  const startSinglePlayer = () => {
    if (!isLoggedIn) return;
    router.push(`/play?mode=single&name=${encodeURIComponent(username)}`);
  };

  const continueSinglePlayer = () => {
    if (!isLoggedIn) return;
    router.push(`/play?mode=single&continue=1&name=${encodeURIComponent(username)}`);
  };

  const startNewSinglePlayer = () => {
    if (!isLoggedIn) return;
    if (confirm("Bắt đầu chơi mới sẽ xóa file lưu cũ. Bạn có muốn tiếp tục?")) {
      fetch(`/api/game/save?username=${encodeURIComponent(username)}`, {
        method: "DELETE"
      }).catch(err => console.error("Failed to delete old save:", err));
      router.push(`/play?mode=single&name=${encodeURIComponent(username)}`);
    }
  };

  const hostRoom = () => {
    if (!isLoggedIn) return;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    router.push(`/play?mode=host&room=${code}&name=${encodeURIComponent(username)}`);
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) return;
    if (roomCodeInput.length !== 4) return;
    const code = roomCodeInput.toUpperCase();
    router.push(`/play?mode=guest&room=${code}&name=${encodeURIComponent(username)}`);
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
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
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
            ZOMBIE SURVIVAL
          </h1>
          <p
            style={{
              color: C.dim,
              fontSize: "0.95rem",
              marginTop: 10,
              letterSpacing: 1,
            }}
          >
            POST-APOCALYPTIC TOP-DOWN SHOOTER
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
            {/* Survivor Profile */}
            <div style={{ ...cardBase, padding: 22 }}>
              <h2 style={sectionHeading}>Survivor Profile</h2>

              {!isLoggedIn ? (
                <form
                  onSubmit={handleLogin}
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <label
                    style={{
                      fontSize: 11,
                      color: C.dim,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                    }}
                  >
                    Enter Codename
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    maxLength={15}
                    placeholder="Survivor Name"
                    style={{
                      padding: "10px 12px",
                      backgroundColor: C.bgDeep,
                      border: `1px solid ${C.border}`,
                      color: C.text,
                      fontFamily: "inherit",
                      fontSize: "0.95rem",
                      borderRadius: 4,
                      outline: "none",
                      width: "100%",
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: "10px 12px",
                      backgroundColor: C.red,
                      color: C.bgDeep,
                      border: "none",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      letterSpacing: 1.5,
                      borderRadius: 4,
                      transition: "background-color 0.15s ease",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = C.redHover)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = C.red)
                    }
                  >
                    SIGN IN
                  </button>
                </form>
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
                    <span
                      style={{
                        fontSize: "1.05rem",
                        fontWeight: 700,
                        color: "#FFFFFF",
                        letterSpacing: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                      }}
                      title={username}
                    >
                      {username}
                    </span>
                    <button
                      onClick={handleLogout}
                      style={{
                        background: "none",
                        border: `1px solid ${C.redDeep}`,
                        color: C.red,
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        letterSpacing: 1.5,
                        padding: "5px 10px",
                        borderRadius: 4,
                        fontWeight: 700,
                        transition: "all 0.15s ease",
                        flexShrink: 0,
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
                      LOG OUT
                    </button>
                  </div>

                  {/* Stats grid — labels left, values right; values share a single column */}
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
                      High Score
                    </span>
                    <span
                      style={{
                        color: C.gold,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        justifySelf: "end",
                      }}
                    >
                      {stats.highScore.toLocaleString()}
                    </span>

                    <span
                      style={{
                        color: C.dim,
                        letterSpacing: 1.5,
                        fontSize: 11,
                        textTransform: "uppercase",
                      }}
                    >
                      Total Kills
                    </span>
                    <span
                      style={{
                        color: C.red,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        justifySelf: "end",
                      }}
                    >
                      {stats.totalKills.toLocaleString()}
                    </span>

                    <span
                      style={{
                        color: C.dim,
                        letterSpacing: 1.5,
                        fontSize: 11,
                        textTransform: "uppercase",
                      }}
                    >
                      Level
                    </span>
                    <span
                      style={{
                        color: C.cyan,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        justifySelf: "end",
                      }}
                    >
                      {stats.level}
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
                  <span style={{ ...keyBadge, color: C.cyan, borderColor: C.cyan }}>
                    E&nbsp;(Hold)
                  </span>
                  <span style={controlDesc}>Hút nhanh Loot quanh người</span>
                </li>
                <li style={controlRow}>
                  <span style={keyBadge}>ESC</span>
                  <span style={controlDesc}>Tạm dừng</span>
                </li>
              </ul>

              {/* Objective */}
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.borderSoft}`,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 11,
                    color: C.dim,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    fontWeight: 700,
                  }}
                >
                  Objective
                </h3>
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "8px 0 0 0",
                    fontSize: "0.8rem",
                    lineHeight: 1.7,
                    color: C.textSoft,
                  }}
                >
                  <li>— Survive the waves.</li>
                  <li>— Collect loot.</li>
                  <li>— Upgrade your survivor.</li>
                </ul>
              </div>
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
                label="Game Lobby"
                active={activeTab === "play"}
                onClick={() => setActiveTab("play")}
              />
              <TabButton
                label="Leaderboard"
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
                    <div style={{ fontSize: "2rem" }}>🔒</div>
                    <div
                      style={{
                        fontSize: "0.95rem",
                        color: C.textSoft,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                      }}
                    >
                      VUI LÒNG ĐĂNG NHẬP ĐỂ CHƠI
                    </div>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: C.dim, lineHeight: 1.5 }}>
                      Hãy nhập mật danh (Codename) của bạn ở ô bên trái và nhấn **SIGN IN** để mở khóa tất cả các chế độ chơi đơn và chơi mạng.
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
                  {/* Single Player — primary CTA, but compact */}
                  {hasSave ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                            hovered === "continue" ? "translateY(-1px)" : "none",
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
                          color: C.textSoft || "#EBEBE1",
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          cursor: "pointer",
                          letterSpacing: 2,
                          transition: "all 0.15s ease",
                          transform:
                            hovered === "new_game" ? "translateY(-1px)" : "none",
                          backgroundColor: hovered === "new_game" ? "rgba(255,255,255,0.05)" : "transparent",
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
                      ▶ CHƠI ĐƠN
                    </button>
                  )}

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

                  {/* Co-op cards — equal height, aligned */}
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
                          backgroundColor:
                            hovered === "host" ? C.cyan : C.cyan,
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
                          minHeight: 16,
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
                          placeholder="MÃ PHÒNG"
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
                          minHeight: 16,
                        }}
                      >
                        Nhập mã 4 ký tự để vào
                      </p>
                    </div>
                  </div>
                </div>
              )
            ) : (
                /* Leaderboard */
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {/* Leaderboard Header Actions */}
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
                    <div style={{ fontSize: "0.75rem", color: C.dim, letterSpacing: 0.5 }}>
                      {lastUpdated ? `Cập nhật lúc: ${lastUpdated}` : "Bảng xếp hạng trực tuyến"}
                    </div>
                    <button
                      onClick={fetchLeaderboard}
                      disabled={isRefreshing}
                      style={{
                        padding: "6px 12px",
                        backgroundColor: isRefreshing ? "rgba(255,255,255,0.05)" : "transparent",
                        border: `1px solid ${C.border}`,
                        color: isRefreshing ? C.dim : C.red,
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
                          animation: isRefreshing ? "spin 1s linear infinite" : "none",
                        }}
                      >
                        🔄
                      </span>
                      {isRefreshing ? "Đang tải..." : "Cập nhật"}
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
                      }}
                    >
                      CHƯA CÓ DỮ LIỆU ĐIỂM CAO.
                      <br />
                      HÃY CHƠI VÀ LƯU THÀNH TÍCH!
                    </div>
                  ) : (
                    <div
                      style={{
                        maxHeight: 420,
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
                          fontSize: "0.85rem",
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              backgroundColor: C.panelDeep,
                              color: C.gold,
                              position: "sticky",
                              top: 0,
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
                              Hạng
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
                              Survivor
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
                              Score
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
                              Kills
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
                              Wave
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboard.map((entry, index) => {
                            const rankColor =
                              index === 0
                                ? C.gold
                                : index === 1
                                ? C.silver
                                : index === 2
                                ? C.bronze
                                : C.text;
                            return (
                              <tr
                                key={index}
                                style={{
                                  borderBottom: `1px solid ${C.borderSoft}`,
                                  color: rankColor,
                                  backgroundColor:
                                    index % 2 === 0
                                      ? "transparent"
                                      : "rgba(255,255,255,0.015)",
                                }}
                              >
                                <td
                                  style={{
                                    padding: "10px 12px",
                                    fontWeight: 700,
                                    width: 60,
                                  }}
                                >
                                  #{index + 1}
                                </td>
                                <td
                                  style={{
                                    padding: "10px 12px",
                                    fontWeight: 700,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    maxWidth: 180,
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
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {entry.score.toLocaleString()}
                                </td>
                                <td
                                  style={{
                                    padding: "10px 12px",
                                    color: C.red,
                                    textAlign: "right",
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {entry.kills.toLocaleString()}
                                </td>
                                <td
                                  style={{
                                    padding: "10px 12px",
                                    color: C.cyan,
                                    textAlign: "right",
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {entry.wave}
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

      {/* Responsive: tablet 2-col when wide, mobile 1-col */}
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
      `}</style>
    </main>
  );
}

// ---- subcomponents ---------------------------------------------------------

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

// ---- shared style snippets ------------------------------------------------

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