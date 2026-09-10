// src/game/ufoInfo.ts
// Extended UFO information for the UI "THÔNG TIN VŨ KHÍ & UFO" section.
// All UFOs share the same combat engine stats (DRONE_ORBIT=40, DRONE_RANGE=280,
// DRONE_FIRE_COOLDOWN=0.55, droneDamage=18 from player.ts). This file adds
// rarity/lore/strength-weakness metadata purely for the information panel —
// it does NOT affect gameplay.

export interface UfoSpecialAbility {
  name: string;
  description: string;
  damage?: number;
  cooldown?: number;
  radius?: number;
  duration?: number;
  targets?: number;
  effect?: string;
}

export interface UfoExtInfo {
  /** Must match UfoDef.id in ufo.ts */
  id: string;
  type: string;
  rarity: "Thường" | "Hiếm" | "Sử thi" | "Huyền thoại";
  rarityColor: string;
  levelReq: number;
  // --- Combat stats (shared engine, tuned per lore) ---
  hp: number;
  damage: number;
  fireRate: number; // shots per second
  attackRange: number;
  projectileSpeed: number;
  critChance: number; // %
  // --- Movement stats ---
  orbitSpeed: number; // degrees per second
  detectionRange: number;
  // --- Defense stats ---
  armor: number;
  damageReduction: number; // %
  // --- Special ability ---
  specialAbility?: UfoSpecialAbility;
  // --- Lore ---
  description: string;
  strengths: string[];
  weaknesses: string[];
}

/** Stat maximums across all UFOs for normalised progress bars. */
export const UFO_STAT_MAX = {
  hp: 1200,
  damage: 60,
  fireRate: 3.5,
  attackRange: 400,
  projectileSpeed: 900,
  critChance: 30,
  orbitSpeed: 240,
  detectionRange: 350,
  armor: 45,
  damageReduction: 35,
} as const;

export const UFO_EXT_CATALOG: UfoExtInfo[] = [
  {
    id: "drone",
    type: "Chiến đấu",
    rarity: "Thường",
    rarityColor: "#C8C8C2",
    levelReq: 1,
    hp: 500,
    damage: 18,
    fireRate: 1.82,
    attackRange: 280,
    projectileSpeed: 600,
    critChance: 5,
    orbitSpeed: 120,
    detectionRange: 280,
    armor: 10,
    damageReduction: 5,
    description:
      "UFO Drone là đĩa bay chiến đấu cổ điển, tự động quay quanh người chơi và khai hỏa vào zombie gần nhất. Được thiết kế đơn giản nhưng đáng tin cậy, phù hợp cho người chơi mới bắt đầu.",
    strengths: [
      "Giá mua thấp nhất",
      "Dễ sử dụng ngay từ đầu",
      "Tốc độ bắn ổn định",
    ],
    weaknesses: [
      "Chỉ số HP trung bình",
      "Không có khả năng đặc biệt",
      "Tầm phát hiện giới hạn",
    ],
  },
  {
    id: "wasp",
    type: "Tấn công nhanh",
    rarity: "Hiếm",
    rarityColor: "#FFD76A",
    levelReq: 5,
    hp: 420,
    damage: 22,
    fireRate: 2.8,
    attackRange: 300,
    projectileSpeed: 760,
    critChance: 12,
    orbitSpeed: 175,
    detectionRange: 310,
    armor: 8,
    damageReduction: 4,
    specialAbility: {
      name: "WASP STING",
      description: "Lao thẳng vào kẻ thù gần nhất, gây sát thương tức thì và làm choáng.",
      damage: 40,
      cooldown: 6,
      radius: 60,
      duration: 0.4,
      targets: 1,
      effect: "Stun 0.5 giây",
    },
    description:
      "WASP là đĩa tấn công tốc độ cao với vỏ vàng ánh kim. Nó di chuyển nhanh quanh quỹ đạo, lao vào kẻ thù với tốc độ khó đoán. Tỷ lệ bắn nhanh nhưng HP thấp hơn.",
    strengths: [
      "Tốc độ bắn cao nhất",
      "Tốc độ quỹ đạo nhanh",
      "Tỷ lệ chí mạng tốt",
      "Có khả năng đặc biệt Sting",
    ],
    weaknesses: ["HP thấp nhất", "Phòng thủ yếu", "Cooldown khả năng khá cao"],
  },
  {
    id: "phantom",
    type: "Ẩn thân / Trinh sát",
    rarity: "Hiếm",
    rarityColor: "#C58BFF",
    levelReq: 8,
    hp: 600,
    damage: 20,
    fireRate: 1.5,
    attackRange: 340,
    projectileSpeed: 700,
    critChance: 18,
    orbitSpeed: 140,
    detectionRange: 340,
    armor: 14,
    damageReduction: 10,
    specialAbility: {
      name: "PHANTOM CLOAK",
      description:
        "Tạm thời ẩn thân khỏi zombie, giảm tầm phát hiện của kẻ thù trong khu vực.",
      damage: 0,
      cooldown: 12,
      radius: 200,
      duration: 3,
      targets: 0,
      effect: "Ẩn thân 3 giây, zombie mất mục tiêu",
    },
    description:
      "PHANTOM là đĩa bay ẩn thân bí ẩn với vỏ tím đen. Khó quan sát trong bóng tối, nó có tầm phát hiện xa và tỷ lệ chí mạng cao. Phù hợp với chiến thuật hit-and-run.",
    strengths: [
      "Tầm phát hiện và tầm bắn lớn nhất",
      "Tỷ lệ chí mạng rất cao",
      "Khả năng ẩn thân độc đáo",
      "Phòng thủ ổn",
    ],
    weaknesses: [
      "Tốc độ bắn thấp nhất",
      "Giá mua cao",
      "Cooldown khả năng lâu nhất",
    ],
  },
  {
    id: "goliath",
    type: "Hỗ trợ hạng nặng",
    rarity: "Sử thi",
    rarityColor: "#FF6B6B",
    levelReq: 12,
    hp: 1100,
    damage: 42,
    fireRate: 1.2,
    attackRange: 290,
    projectileSpeed: 550,
    critChance: 8,
    orbitSpeed: 90,
    detectionRange: 295,
    armor: 40,
    damageReduction: 28,
    specialAbility: {
      name: "WAR STOMP",
      description: "Phát ra sóng xung kích hạ gục zombie trong vùng xung quanh.",
      damage: 80,
      cooldown: 9,
      radius: 150,
      duration: 1.2,
      targets: 10,
      effect: "Knockback tất cả zombie trong phạm vi",
    },
    description:
      "GOLIATH là đĩa hỗ trợ hạng nặng với vỏ chiến sự đỏ rực. Cung cấp sức mạnh phòng thủ vượt trội và sát thương lớn, nhưng di chuyển chậm hơn. Lý tưởng để tanking.",
    strengths: [
      "HP và phòng thủ cao nhất",
      "Sát thương mỗi phát mạnh nhất",
      "Giảm sát thương xuất sắc",
      "Khả năng War Stomp diện rộng",
    ],
    weaknesses: [
      "Tốc độ bắn chậm",
      "Tốc độ quỹ đạo chậm nhất",
      "Giá mua đắt",
    ],
  },
  {
    id: "vulture",
    type: "Độc / Kiểm soát",
    rarity: "Sử thi",
    rarityColor: "#8CFF8C",
    levelReq: 15,
    hp: 720,
    damage: 28,
    fireRate: 2.0,
    attackRange: 310,
    projectileSpeed: 640,
    critChance: 10,
    orbitSpeed: 155,
    detectionRange: 320,
    armor: 20,
    damageReduction: 15,
    specialAbility: {
      name: "TOXIC CLOUD",
      description:
        "Phun đám mây độc xanh, gây sát thương liên tục trong vùng ảnh hưởng.",
      damage: 15,
      cooldown: 7,
      radius: 130,
      duration: 4,
      targets: 8,
      effect: "Poisoned 4 giây, -15 HP/giây",
    },
    description:
      "VULTURE là đĩa bay độc tố với vầng hào quang xanh lá ám muội. Nó dùng vũ khí hóa học để làm suy yếu và tiêu diệt zombie theo thời gian. Rất hiệu quả trong kiểm soát đám đông.",
    strengths: [
      "Kiểm soát khu vực tốt",
      "Sát thương độc liên tục hiệu quả",
      "Cân bằng tốt giữa tấn công và phòng thủ",
    ],
    weaknesses: [
      "Ít hiệu quả với boss đơn",
      "Cần thời gian để phát huy tác dụng",
      "Giá mua đắt",
    ],
  },
  {
    id: "sentinel",
    type: "Nguyên mẫu / Hộ vệ",
    rarity: "Huyền thoại",
    rarityColor: "#E8F4FF",
    levelReq: 20,
    hp: 950,
    damage: 55,
    fireRate: 2.2,
    attackRange: 330,
    projectileSpeed: 820,
    critChance: 22,
    orbitSpeed: 160,
    detectionRange: 335,
    armor: 38,
    damageReduction: 30,
    specialAbility: {
      name: "PLASMA NOVA",
      description:
        "Kích hoạt bão plasma toàn màn hình, gây sát thương hủy diệt cho tất cả zombie.",
      damage: 150,
      cooldown: 15,
      radius: 380,
      duration: 2,
      targets: 30,
      effect: "Slow 50% trong 2 giây",
    },
    description:
      "SENTINEL là nguyên mẫu hộ vệ tiên tiến nhất với vỏ bạc trắng huyền diệu. Công nghệ plasma thế hệ mới cho phép nó đạt tốc độ đạn cao nhất, sát thương mạnh, và khả năng đặc biệt hủy diệt toàn màn hình.",
    strengths: [
      "Chỉ số toàn diện cao nhất",
      "Plasma Nova diện rộng tàn sát",
      "Tốc độ đạn nhanh nhất",
      "Tỷ lệ chí mạng rất cao",
    ],
    weaknesses: [
      "Giá mua đắt nhất",
      "Yêu cầu cấp độ cao",
      "Cooldown Plasma Nova lâu",
    ],
  },
];

/** Get extended UFO info by id. */
export function ufoExtInfo(id: string): UfoExtInfo | undefined {
  return UFO_EXT_CATALOG.find((u) => u.id === id);
}
