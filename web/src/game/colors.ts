// src/game/colors.ts
// Color tokens. Hex equivalents of RGB tuples in settings.py:COLORS.

export const COLORS: Record<string, string> = {
  bg: "#10120E",
  grid: "#181C16",
  road: "#262628",
  road_line: "#D2BE5A",
  building: "#3A3842",
  building_roof: "#4A4854",
  house: "#563E30",
  house_roof: "#6C503C",
  tree: "#224E28",
  tree_dark: "#18381E",
  car_red: "#8C2C2C",
  car_blue: "#304484",
  car_yellow: "#A88A30",
  container: "#346060",
  crate: "#806238",
  barricade: "#6E6E70",
  border: "#2E2E32",

  player: "#5ADCFF",
  player_dark: "#2878A0",
  zombie_normal: "#56963E",
  zombie_fast: "#AAB446",
  zombie_tank: "#6E5282",
  zombie_exploder: "#C47834",
  zombie_ranged: "#468C8C",
  zombie_boss: "#AA282E",

  bullet: "#FFE88C",
  enemy_bullet: "#FF6E5A",
  blood: "#96141A",
  xp: "#6EDC78",

  ui_bg: "#0E0E10",
  ui_panel: "#1A1A20",
  ui_text: "#DEDED6",
  ui_dim: "#82827E",
  ui_accent: "#FF3C46",
  ui_gold: "#F0C850",
  ui_green: "#6EDC82",
  ui_blue: "#5AB4FF",
};

export function color(name: string): string {
  return COLORS[name] ?? "#FF00FF";
}
