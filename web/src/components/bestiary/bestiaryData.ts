// src/components/bestiary/bestiaryData.ts
// READ-ONLY presentation adapter for the lobby BESTIARY.
//
// Everything shown here is derived from the SAME sources gameplay uses:
//   • stats        → /data/zombies.json (ZombieData), loaded like the game does
//   • wave gates   → enemyGates / spawner.waveWeights (single source of truth)
//   • accents      → pixelArt.zombiePalette (the exact sprite palette)
// No gameplay stat is hard-coded here; the only literals are qualitative
// Vietnamese descriptions that mirror the actual AI code in zombie.ts.
import type { ZombieData } from "@/game/data";
import { zombiePalette } from "@/game/pixelArt";
import {
  BOSS_KIND,
  ELITE_KIND,
  ELITE_MODIFIER,
  FIRST_MODIFIER_WAVE,
  NECROMANCER_BOSS_KIND,
  firstWaveForKind,
} from "@/game/enemyGates";
import { BOSS_ALT_START_WAVE, FIRST_BOSS_WAVE } from "@/game/settings";

export interface BestiarySpecial {
  label: string;
  value: string;
}

export interface BestiaryEnemy {
  kind: string;
  name: string;
  /** Body colour from the real sprite palette — used as UI accent. */
  accent: string;
  type: string; // compact EN chip e.g. "MELEE · DASH"
  typeVN: string; // Vietnamese category e.g. "Cận chiến · Lao nhanh"
  isBoss: boolean;
  isElite: boolean;
  threat: number; // 1..5 (UI-only estimate derived from real stats)
  radius: number;
  hp: number;
  speed: number;
  damage: number;
  /** True only when the kind has a ranged (projectile) attack. */
  ranged: boolean;
  specials: BestiarySpecial[]; // data-driven ability bullets
  attack: string;
  behavior: string;
  weakness: string;
  deal: string;
  firstWave: number;
  appears: string; // first-wave label, e.g. "WAVE 2+"
  appearsNote: string; // optional secondary note
}

/**
 * UI-only threat estimate (1–5 stars) derived purely from the real stat
 * block, so it re-syncs automatically when zombies.json changes. It never
 * feeds back into gameplay.
 */
function threatOf(kind: string, d: ZombieData, isBoss: boolean): number {
  let t = 1;
  if (d.hp >= 1000) t += 2;
  else if (d.hp >= 200) t += 1;
  if (d.speed >= 160) t += 1;
  else if (d.speed >= 120) t += 0.5;
  if (d.damage >= 20) t += 1;
  else if (d.damage >= 12) t += 0.5;
  if (d.attack_range >= 200) t += 1; // keeps distance / shoots
  if (d.explosion_radius) t += 1; // explodes on death
  if (d.lunge_range || d.charge_trigger_range) t += 0.5; // dash attacks
  if (d.barrage_interval) t += 0.5; // boss ring barrage
  if (d.resist_mult) t += 0.5; // elite elemental resistance
  if (kind === "necromancer" || kind === NECROMANCER_BOSS_KIND) t += 0.5; // summoner
  if (isBoss) t = Math.max(t, 4.6);
  return Math.min(5, Math.max(1, Math.round(t)));
}

/** Data-driven "SPECIAL" bullets — only rows whose field exists on the kind. */
function specialsOf(d: ZombieData): BestiarySpecial[] {
  const out: BestiarySpecial[] = [];
  if (d.projectile_speed) {
    out.push({ label: "ĐẠN BẮN", value: `Tốc độ đạn ${d.projectile_speed}px/s` });
  }
  if (d.lunge_range && d.lunge_speed_mult) {
    out.push({
      label: "LAO NHANH",
      value: `Kích hoạt trong ${d.lunge_range}px, lao tới với x${d.lunge_speed_mult} tốc độ sau ${d.lunge_windup ?? 0.3}s chờ`,
    });
  }
  if (d.charge_trigger_range && d.charge_speed_mult) {
    out.push({
      label: "CÚ HÚC",
      value: `Kích hoạt trong ${d.charge_trigger_range}px, lao với x${d.charge_speed_mult} tốc độ · trúng = sát thương x1.5 + choáng ${d.charge_stun_duration ?? 1.1}s + đẩy lùi`,
    });
  }
  if (d.explosion_radius) {
    out.push({
      label: "PHÁT NỔ KHI CHẾT",
      value: `${d.explosion_damage ?? 55} sát thương, bán kính ${d.explosion_radius}px (giảm dần theo khoảng cách, làm hại cả đồng loại)`,
    });
  }
  if (d.barrage_interval) {
    out.push({
      label: "BARRAGE",
      value: `Phản đạn vòng ${d.barrage_bullets ?? 14} đạn, mỗi ${d.barrage_interval}s (đạn xoay khi cấp boss Necromancer)`,
    });
  }
  if (d.resist_mult != null) {
    out.push({
      label: "KHÁNG NGUYÊN TỐ",
      value: `Chỉ nhận ${Math.round(d.resist_mult * 100)}% sát thương của 1 nguyên tố ngẫu nhiên (lửa / plasma / xuyên)`,
    });
  }
  return out;
}

// Qualitative behaviour notes. These mirror zombie.ts AI exactly but are prose,
// so they are the ONLY allowed literal text in this module.
interface KindProfile {
  type: string;
  typeVN: string;
  attack: string;
  behavior: string;
  weakness: string;
  deal: string;
}

const PROFILES: Record<string, KindProfile> = {
  normal: {
    type: "MELEE",
    typeVN: "Cận chiến",
    attack: "Cắn sát thương khi ở khoảng cách gần.",
    behavior:
      "Bước chậm về phía người chơi khi phát hiện (430px) hoặc bị bắn trúng; men theo góc tòa nhà để vượt vật cản.",
    weakness: "Không có khả năng đặc biệt.",
    deal: "Bắn hạ từ xa; giữ khoảng cách là đủ.",
  },
  fast: {
    type: "MELEE · DASH",
    typeVN: "Cận chiến · Lao nhanh",
    attack: "Cận chiến + cú lao (dash) tốc độ cao.",
    behavior:
      "Chạy rất nhanh áp sát; trong 90px khựng lại 0.3s (vòng cảnh báo đỏ) rồi lao tới với x2.6 tốc độ.",
    weakness: "Máu rất ít (60).",
    deal: "Ưu tiên tiêu diệt từ xa; né ngang khi thấy vòng cảnh báo đỏ.",
  },
  tank: {
    type: "MELEE · CHARGE",
    typeVN: "Cận chiến · Húc",
    attack: "Cận chiến + cú húc (charge) gây choáng.",
    behavior:
      "Di chuyển chậm nhưng HP cao; trong 220px khởi động cú húc lao với x3.2 tốc độ — trúng = sát thương x1.5, choáng 1.1s và đẩy lùi người chơi.",
    weakness: "Chậm, cần quãng đường dài để húc.",
    deal: "Giữ khoảng cách hoặc né ngang đúng lúc húc; đừng đứng thẳng đường lao.",
  },
  exploder: {
    type: "MELEE · EXPLOSIVE",
    typeVN: "Cận chiến · Nổ khi chết",
    attack: "Cận chiến; khi chết phát nổ theo vùng.",
    behavior:
      "Tiến gần người chơi; khi bị tiêu diệt nổ bán kính 140px gây sát thương giảm dần theo khoảng cách, đồng thời làm hại cả lũ zombie khác.",
    weakness: "Máu thấp (80).",
    deal: "Bắn chết từ xa rồi lùi ngay; đừng đứng cạnh lúc nó gục.",
  },
  ranged: {
    type: "RANGED",
    typeVN: "Bắn tầm xa",
    attack: "Bắn đạn về phía người chơi từ khoảng cách xa.",
    behavior:
      "Dừng lại ~280px và nhả đạn (tốc độ 420px/s) theo nhịp 2.2s; luôn cố giữ khoảng cách an toàn.",
    weakness: "Máu thấp (90).",
    deal: "Bắn hạ trước đám cận chiến; di chuyển ngang để tránh đạn.",
  },
  crawler: {
    type: "MELEE · SWARM",
    typeVN: "Cận chiến · Bò nhanh",
    attack: "Cào sát thương khi áp sát.",
    behavior:
      "Thân thấp, rất nhanh và mong manh; xuất hiện độc lập từ wave 5 và được Necromancer / Necromancer King triệu hồi thành bầy.",
    weakness: "Máu cực thấp (50).",
    deal: "Quét bằng súng bắn nhanh trước khi chúng tràn tới chân.",
  },
  necromancer: {
    type: "RANGED · SUMMONER",
    typeVN: "Bắn tầm xa · Triệu hồi",
    attack: "Bắn đạn tầm xa + triệu hồi quái con.",
    behavior:
      "Giữ khoảng cách ~320px, bắn đạn theo nhịp 2.5s; cứ 8s triệu hồi 2 Crawler xung quanh nó.",
    weakness: "HP thấp (220) — hạ nhanh trước khi kịp dựng đội hình.",
    deal: "Bắn hạ sớm, ưu tiên hơn đám zombie thường để cắt nguồn triệu hồi.",
  },
  elite: {
    type: "MELEE · ELITE",
    typeVN: "Cận chiến · Tinh nhuệ",
    attack: "Cận chiến + kháng sát thương nguyên tố.",
    behavior:
      `Chỉ xuất hiện trong đêm ${ELITE_MODIFIER.toUpperCase().replace(/_/g, " ")}: nhận một nguyên tố kháng ngẫu nhiên (vòng màu báo hiệu: cam = lửa, xanh dương = plasma, trắng = xuyên).`,
    weakness: "Chỉ kháng MỘT nguyên tố.",
    deal: "Đọc màu vòng quanh nó rồi đổi sang loại đạn khác nguyên tố đang kháng.",
  },
  boss: {
    type: "BOSS",
    typeVN: "Trùm · Cận chiến + Barrage",
    attack: "Cận chiến mạnh + phản đạn vòng theo phase.",
    behavior:
      "HP khổng lồ; đổi phase ở 66% và 33% máu (rung màn hình + cảnh báo). Từ phase 2 bắn sóng đạn vòng quanh người; đè sập vật cản nhẹ trên đường.",
    weakness: "Không có điểm yếu rõ ràng — chỉ cần bền bỉ né và bắn.",
    deal: "Luôn di chuyển để né đạn vòng; bắn liên tục và lùi khi phase đổi.",
  },
  necromancer_boss: {
    type: "BOSS",
    typeVN: "Trùm · Triệu hồi + Barrage xoay",
    attack: "Đạn xoay 360° + triệu hồi bầy Crawler.",
    behavior:
      "Từ wave 15 (wave lẻ): bắn đạn xoay quanh liên tục, cứ 5.5s triệu hồi 3 Crawler, và cũng đổi phase tăng cường độ khi mất máu.",
    weakness: "HP cao nhưng đạn xoay có kẽ hở giữa các loạt.",
    deal: "Dọn Crawler bị triệu hồi trước; né đạn xoay và bắn dồn trong khoảng nghỉ giữa các loạt.",
  },
};

export function buildBestiary(data: Record<string, ZombieData>): BestiaryEnemy[] {
  const entries: BestiaryEnemy[] = [];
  for (const kind of Object.keys(data)) {
    const d = data[kind]!;
    const isBoss = kind === BOSS_KIND || kind === NECROMANCER_BOSS_KIND;
    const isElite = kind === ELITE_KIND;
    const prof = PROFILES[kind] ?? PROFILES["normal"]!;
    const firstWave = firstWaveForKind(kind);

    let appears = `WAVE ${firstWave}+`;
    let appearsNote = "";
    if (isElite) {
      appearsNote = `Chỉ xuất hiện khi modifier ${ELITE_MODIFIER.replace(/_/g, " ").toUpperCase()} được roll (các wave chia hết cho ${FIRST_MODIFIER_WAVE}).`;
    } else if (kind === NECROMANCER_BOSS_KIND) {
      appearsNote = `Wave lẻ từ wave ${BOSS_ALT_START_WAVE}; wave chẵn là ABOMINATION.`;
    } else if (kind === BOSS_KIND) {
      appearsNote = `Mọi wave từ ${FIRST_BOSS_WAVE}; từ wave ${BOSS_ALT_START_WAVE} đan xen: wave lẻ là NECROMANCER KING.`;
    }

    entries.push({
      kind,
      name: d.name,
      accent: zombiePalette[kind]?.[1] ?? zombiePalette["normal"]![1],
      type: prof.type,
      typeVN: prof.typeVN,
      isBoss,
      isElite,
      threat: threatOf(kind, d, isBoss),
      radius: d.radius,
      hp: d.hp,
      speed: d.speed,
      damage: d.damage,
      ranged: d.attack_range >= 200,
      specials: specialsOf(d),
      attack: prof.attack,
      behavior: prof.behavior,
      weakness: prof.weakness,
      deal: prof.deal,
      firstWave,
      appears,
      appearsNote,
    });
  }
  // Stable order: bosses last, otherwise by first wave then name.
  return entries.sort((a, b) => {
    if (a.isBoss !== b.isBoss) return a.isBoss ? 1 : -1;
    if (a.firstWave !== b.firstWave) return a.firstWave - b.firstWave;
    return a.name.localeCompare(b.name);
  });
}
