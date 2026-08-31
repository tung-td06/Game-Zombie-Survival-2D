// scripts/generate-assets.mjs
// Generate placeholder SVG assets for Zombie Survival Web.
// Colors mirror src/game/colors.ts (hex equivalents of settings.py COLORS).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, "..", "public", "assets", "images");
mkdirSync(out, { recursive: true });
mkdirSync(join(out, "tiles"), { recursive: true });

const c = {
  player: "#5ADCFF",
  playerDark: "#2878A0",
  zNormal: "#56963E",
  zFast: "#AAB446",
  zTank: "#6E5282",
  zExploder: "#C47834",
  zRanged: "#468C8C",
  zBoss: "#AA282E",
  bullet: "#FFE88C",
  enemyBullet: "#FF6E5A",
  blood: "#96141A",
  xp: "#6EDC78",
  bg: "#10120E",
  road: "#262628",
  roadLine: "#D2BE5A",
  building: "#3A3842",
  buildingRoof: "#4A4854",
  house: "#563E30",
  houseRoof: "#6C503C",
  tree: "#224E28",
  treeDark: "#18381E",
  carRed: "#8C2C2C",
  carBlue: "#304484",
  carYellow: "#A88A30",
  crate: "#806238",
  barricade: "#6E6E70",
  border: "#2E2E32",
};

function svg(content) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${content}</svg>\n`;
}

const files = {
  "player.svg": svg(`
    <circle cx="32" cy="32" r="20" fill="${c.player}"/>
    <circle cx="32" cy="32" r="12" fill="${c.playerDark}"/>
    <polygon points="32,32 50,26 50,38" fill="${c.player}"/>
  `),
  "zombie-normal.svg": svg(`<circle cx="32" cy="32" r="18" fill="${c.zNormal}"/><circle cx="26" cy="28" r="2.5" fill="#000"/><circle cx="38" cy="28" r="2.5" fill="#000"/>`),
  "zombie-fast.svg": svg(`<ellipse cx="32" cy="32" rx="14" ry="18" fill="${c.zFast}"/><circle cx="28" cy="28" r="2" fill="#000"/><circle cx="36" cy="28" r="2" fill="#000"/>`),
  "zombie-tank.svg": svg(`<circle cx="32" cy="32" r="26" fill="${c.zTank}"/><rect x="20" y="26" width="6" height="6" fill="#000"/><rect x="38" y="26" width="6" height="6" fill="#000"/>`),
  "zombie-exploder.svg": svg(`<circle cx="32" cy="32" r="22" fill="${c.zExploder}"/><circle cx="26" cy="30" r="3" fill="#000"/><circle cx="38" cy="30" r="3" fill="#000"/><path d="M20 42 Q32 50 44 42" stroke="#000" stroke-width="2" fill="none"/>`),
  "zombie-ranged.svg": svg(`<circle cx="32" cy="32" r="18" fill="${c.zRanged}"/><circle cx="26" cy="30" r="2.5" fill="#000"/><circle cx="38" cy="30" r="2.5" fill="#000"/><rect x="44" y="28" width="14" height="8" fill="${c.zRanged}"/>`),
  "zombie-boss.svg": svg(`
    <circle cx="32" cy="32" r="30" fill="${c.zBoss}"/>
    <circle cx="22" cy="28" r="4" fill="#000"/>
    <circle cx="42" cy="28" r="4" fill="#000"/>
    <path d="M18 44 L46 44" stroke="#000" stroke-width="3"/>
  `),
  "bullet.svg": svg(`<circle cx="32" cy="32" r="6" fill="${c.bullet}"/><circle cx="32" cy="32" r="3" fill="#FFF"/>`),
  "enemy-bullet.svg": svg(`<circle cx="32" cy="32" r="7" fill="${c.enemyBullet}"/>`),
  "loot-coin.svg": svg(`<circle cx="32" cy="32" r="14" fill="#F0C850"/><text x="32" y="38" text-anchor="middle" font-size="18" fill="#806238" font-family="monospace" font-weight="bold">$</text>`),
  "loot-health.svg": svg(`<rect x="20" y="28" width="24" height="8" fill="#FF3C46"/><rect x="28" y="20" width="8" height="24" fill="#FF3C46"/>`),
  "loot-ammo.svg": svg(`<rect x="20" y="26" width="24" height="12" fill="#5AB4FF"/><rect x="22" y="28" width="20" height="2" fill="#FFF"/><rect x="22" y="32" width="20" height="2" fill="#FFF"/>`),
  "tiles/road.svg": svg(`<rect width="64" height="64" fill="${c.road}"/>`),
  "tiles/road-h.svg": svg(`<rect width="64" height="64" fill="${c.road}"/><rect x="0" y="30" width="64" height="4" fill="${c.roadLine}"/>`),
  "tiles/road-v.svg": svg(`<rect width="64" height="64" fill="${c.road}"/><rect x="30" y="0" width="4" height="64" fill="${c.roadLine}"/>`),
  "tiles/building.svg": svg(`<rect x="6" y="6" width="52" height="52" fill="${c.building}"/><rect x="6" y="6" width="52" height="8" fill="${c.buildingRoof}"/>`),
  "tiles/house.svg": svg(`<polygon points="6,32 32,10 58,32 58,58 6,58" fill="${c.houseRoof}"/><rect x="10" y="34" width="44" height="24" fill="${c.house}"/><rect x="28" y="40" width="8" height="18" fill="${c.border}"/>`),
  "tiles/tree.svg": svg(`<circle cx="32" cy="32" r="22" fill="${c.tree}"/><circle cx="24" cy="26" r="8" fill="${c.treeDark}"/>`),
  "tiles/car-red.svg": svg(`<rect x="10" y="20" width="44" height="24" rx="4" fill="${c.carRed}"/><rect x="18" y="14" width="28" height="10" fill="${c.carRed}"/><circle cx="20" cy="46" r="5" fill="#000"/><circle cx="44" cy="46" r="5" fill="#000"/>`),
  "tiles/car-blue.svg": svg(`<rect x="10" y="20" width="44" height="24" rx="4" fill="${c.carBlue}"/><rect x="18" y="14" width="28" height="10" fill="${c.carBlue}"/><circle cx="20" cy="46" r="5" fill="#000"/><circle cx="44" cy="46" r="5" fill="#000"/>`),
  "tiles/car-yellow.svg": svg(`<rect x="10" y="20" width="44" height="24" rx="4" fill="${c.carYellow}"/><rect x="18" y="14" width="28" height="10" fill="${c.carYellow}"/><circle cx="20" cy="46" r="5" fill="#000"/><circle cx="44" cy="46" r="5" fill="#000"/>`),
  "tiles/crate.svg": svg(`<rect x="10" y="10" width="44" height="44" fill="${c.crate}"/><rect x="10" y="10" width="44" height="6" fill="#9C7640"/><rect x="30" y="10" width="4" height="44" fill="#9C7640"/>`),
  "tiles/barricade.svg": svg(`<rect x="4" y="20" width="56" height="24" fill="${c.barricade}"/><rect x="4" y="20" width="56" height="4" fill="#909094"/><rect x="4" y="40" width="56" height="4" fill="#505054"/>`),
};

let n = 0;
for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(out, name), content);
  n++;
}
console.log(`generated ${n} assets in ${out}`);
