import fs from "fs";
import path from "path";

export interface LeaderboardEntry {
  username: string;
  score: number;
  kills: number;
  wave: number;
  level: number;
  date: string;
}

const DB_DIR = path.join(process.cwd(), "..", "data");
const DB_FILE = path.join(DB_DIR, "db.json");

export interface GameSave {
  username: string;
  save_version: number;
  level: number;
  wave: number;
  score: number;
  money: number;
  player_data: any;
  weapon_data: any;
  inventory_data: any;
  progression_data: any;
  world_data: any;
  created_at: string;
  updated_at: string;
}

interface DbSchema {
  profiles: Record<string, any>;
  leaderboard: LeaderboardEntry[];
  saves: Record<string, GameSave>;
}

const DEFAULT_DB: DbSchema = {
  profiles: {},
  leaderboard: [],
  saves: {},
};

// Ensure database directory and file exist
function initDb(): DbSchema {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), "utf8");
    return DEFAULT_DB;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.saves) {
      parsed.saves = {};
    }
    
    // Clean up any remaining mock data to ensure ONLY real data is displayed
    let changed = false;
    const mockNames = ["alice_99", "doomslayer", "leon_s_k", "zombiehunter", "survivor_01"];
    if (parsed.profiles) {
      for (const key of Object.keys(parsed.profiles)) {
        if (mockNames.includes(key.toLowerCase())) {
          delete parsed.profiles[key];
          changed = true;
        }
      }
    }
    if (parsed.leaderboard) {
      const origLen = parsed.leaderboard.length;
      parsed.leaderboard = parsed.leaderboard.filter(
        (e: any) => !mockNames.includes(e.username.toLowerCase())
      );
      if (parsed.leaderboard.length !== origLen) {
        changed = true;
      }
    }
    
    if (changed) {
      writeDb(parsed);
    }
    return parsed;
  } catch (err) {
    console.error("Failed to read database, resetting to default:", err);
    return DEFAULT_DB;
  }
}

function writeDb(data: DbSchema) {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write database:", err);
  }
}

export function getProfile(username: string): any | null {
  const db = initDb();
  return db.profiles[username.toLowerCase()] || null;
}

export function saveProfile(username: string, profileData: any): void {
  const db = initDb();
  db.profiles[username.toLowerCase()] = profileData;
  writeDb(db);
}

export function getLeaderboard(): LeaderboardEntry[] {
  const db = initDb();
  // Return sorted by score descending
  return db.leaderboard.sort((a, b) => b.score - a.score);
}

export function addLeaderboardEntry(entry: LeaderboardEntry): void {
  const db = initDb();
  
  // Clean up entry to prevent duplicates from the same player unless it's a higher score
  const existingIndex = db.leaderboard.findIndex(
    (e) => e.username.toLowerCase() === entry.username.toLowerCase()
  );
  
  if (existingIndex !== -1) {
    if (entry.score > db.leaderboard[existingIndex]!.score) {
      db.leaderboard[existingIndex] = entry;
    }
  } else {
    db.leaderboard.push(entry);
  }
  
  // Sort and cap to top 20
  db.leaderboard = db.leaderboard
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
    
  writeDb(db);
}

export function getGameSave(username: string): GameSave | null {
  const db = initDb();
  return db.saves?.[username] || null;
}

export function saveGameSave(username: string, save: GameSave): void {
  const db = initDb();
  if (!db.saves) {
    db.saves = {};
  }
  db.saves[username] = save;
  writeDb(db);
}

export function deleteGameSave(username: string): void {
  const db = initDb();
  if (db.saves && db.saves[username]) {
    delete db.saves[username];
    writeDb(db);
  }
}

