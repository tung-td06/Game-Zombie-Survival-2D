# 🧟 ZOMBIE SURVIVAL 2D

Top-down zombie survival shooter hoàn chỉnh, viết bằng **Python + Pygame**.
Dark / post-apocalyptic style, procedural 4000×4000 city, wave system with
**biomes** (city / industrial / suburbs / park), **wave modifiers**
(Blood Moon, Swarm, Frenzy, Fog), boss waves, **8 weapons**, **skill tree**,
drone companion, dynamic lighting + torch, shop, upgrade, quest,
achievement, day/night cycle, save/load — chơi được ngay lập tức.

## Features (nâng cấp 2026-08)

- 🎨 **Procedural sprites** — mọi nhân vật/đạn/loot/building được vẽ runtime
  bằng pygame primitives, không cần asset ngoài.
- 🌃 **Dynamic lighting** — torch theo player + light flare từ muzzle flame,
  bầu trời tối dần theo day/night cycle, **đèn đường** phát sáng ban đêm.
- 🗺️ **Biome system** — mỗi 5 wave đổi biome (city → industrial → suburbs →
  park), từng biome có ground tint riêng.
- 🌙 **Wave modifiers** — wave 7/14/21 roll Blood Moon (+40% HP), Swarm (+70%
  zombie), Frenzy (+35% speed), Fog (giảm vision).
- 🧟 **2 zombie mới**: Crawler (tốc độ cao, thấp), Necromancer (spawn crawler).
- 👹 **2 boss mới**: Necromancer Boss (wave 15+) — summon minions, AoE barrage.
- 🔫 **3 weapon mới**: Flamethrower (DOT + light), Plasma Rifle, Crossbow
  (pierce).
- 🌲 **Skill Tree** — thay vì chọn 1/3, mỗi level có skill point, vào menu
  PAUSE → SKILL TREE để mua 12 skill trong 3 nhánh (Combat / Survival / Utility).
- 🛸 **Drone companion** — bay quanh player, auto-shoot zombie gần.
- 📦 **Chest loot** — boss drop chest chứa coin/HP/armor/ammo ngẫu nhiên.
- 🩸 **Life steal / regen / magnet** — skill mới cho build đa dạng.
- 🏪 **Persistent shop** — mua MAX HP+20 và ARMOR+10 được lưu vào save và áp
  dụng cho mọi run sau.

## Visual Polish (nâng cấp lần 2)

- 🧍 **Player rotation** — sprite xoay theo aim + 4-frame walk animation.
- 🏢 **Building chi tiết** — windows có thể tắt (flicker), mái ngói vạch
  chéo, cửa ra vào có tay nắm vàng, máy lạnh trên nóc nhà cao tầng.
- 🏠 **House chi tiết** — mái tam giác có shingles, cửa gỗ, 2 cửa sổ phát
  sáng, flicker ngẫu nhiên.
- 🚗 **Car chi tiết** — kính chắn gió phản chiếu, đèn pha/đèn hậu, vạch
  chia đôi.
- 📦 **Container rỉ sét** — vệt rỉ cam, khớp nối ngang dọc, ổ khóa vàng.
- 🚦 **Đèn đường** — phát sáng quanh player ban đêm (light radius 140).
- 🪧 **Biển báo + vũng nước** — trang trí map.
- 🌳 **Cây 3 lớp** — 3 circle màu tạo depth, có lá sáng highlight.
- 🛡️ **Barricade** — sọc vàng đen chéo rõ ràng.
- 🩸 **Damage vignette** — viền đỏ nhấp nháy khi HP < 40%.
- 💨 **Dust particles** — bụi bay khi player chạy.
- 👹 **Boss aura** — halo đỏ/tím nhấp nháy quanh boss.
- 🗺️ **Minimap thật** — có hướng player (mũi tên vàng), streetlamps vàng,
  boss đỏ lớn, necro boss tím, chest riêng.

## Requirements

- Python 3.11+ (đã test với 3.14 + pygame-ce 2.5.8)
- pygame 2.5+ (trên Python ≥3.13 dùng `pygame-ce`)

## Installation

```bash
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

## How to run

**Một lệnh duy nhất** (tự tạo venv + cài dependency nếu chưa có):

```bash
run.bat
```

Hoặc cách thủ công:

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

## Controls

| Phím            | Hành động                          |
|-----------------|------------------------------------|
| `W A S D`       | Di chuyển                          |
| Mouse           | Ngắm                               |
| Left Click      | Bắn (giữ để bắn liên tục với auto) |
| `R`             | Nạp đạn                            |
| `1`–`5`         | Chọn vũ khí                        |
| Middle Click    | Đổi vũ khí tiếp theo               |
| `E` (giữ)       | Hút nhanh loot gần quanh player    |
| `ESC`           | Pause / đóng menu overlay          |
| `F11`           | Fullscreen                         |
| `F3`            | Debug (vẽ collision box, range AI) |

Window hỗ trợ **resize thoải mái** (SCALED) + chọn resolution
1280×720 / 1600×900 / 1920×1080 trong SETTINGS.

## Project structure

```
├── main.py              # Entry point
├── settings.py          # Toàn bộ hằng số cấu hình (DEBUG, day/night, wave...)
├── game.py              # State machine + vòng lặp chính
├── player.py            # Player: move/aim/shoot/XP/upgrade multipliers
├── zombie.py            # AI base + Normal/Fast/Tank/Exploder/Ranged/Boss
├── bullet.py            # Đạn player & enemy (trail, crit, sub-step collision)
├── weapon.py            # Weapon data-driven + WeaponManager
├── camera.py            # Smooth follow + screen shake + culling view rect
├── map.py               # Procedural city: roads/buildings/trees/cars/crates...
├── collision.py         # Circle-vs-rect, axis-separated slide movement
├── spawner.py           # Vị trí spawn (≥500px khỏi player) + chọn loại zombie
├── wave_manager.py      # Wave progression, scaling, boss waves (mỗi 5 wave)
├── particle.py          # Particle system + damage numbers
├── loot.py              # Coins/ammo/health/armor/weapon drops
├── shop.py              # Mua súng/đạn/máu/armor/max HP
├── upgrade.py           # Level-up: chọn 1 trong 3 nâng cấp
├── quest.py             # 5 nhiệm vụ mỗi run, thưởng coins + XP
├── achievement.py       # 7 achievements lưu save.json
├── audio.py             # AudioManager (thiếu file .wav vẫn chạy bình thường)
├── save_manager.py      # Save/load JSON đầy đủ + fallback khi hỏng file
├── input_manager.py     # Input tách riêng, rebindable
├── network.py           # Scaffold multiplayer (Server/Client authoritative)
├── ui.py                # HUD, minimap, crosshair, button, toast
├── menu.py              # Main menu/pause/settings/shop/upgrade/game over
├── utils.py             # clamp/lerp/format_time + JSON an toàn
├── data/
│   ├── weapons.json     # Stats 5 súng (data-driven)
│   ├── zombies.json     # Stats 6 loại zombie
│   ├── upgrades.json    # Catalog nâng cấp level-up
│   └── save.json        # Profile người chơi
└── assets/
    ├── images/
    ├── sounds/          # Thêm .wav/.ogg để bật âm thanh (tên xem audio.py)
    └── fonts/
```

## How to add a weapon

1. Thêm entry vào `data/weapons.json`:

```json
"laser": {
  "name": "LASER", "damage": 80, "magazine": 20, "fire_rate": 0.2,
  "reload_time": 1.5, "bullet_speed": 2000, "spread_deg": 0,
  "pellets": 1, "critical_chance": 0.2, "critical_multiplier": 2.5,
  "auto": true, "price": 5000, "start_reserve": 40
}
```

2. Thêm `"laser"` vào `WEAPON_ORDER` trong `weapon.py`.
Xong — shop, HUD, ammo, crit tự động nhận.

## How to add a zombie

1. Thêm entry vào `data/zombies.json` (hp/speed/damage/radius/score...).
2. Tạo subclass trong `zombie.py`:

```python
class CrawlerZombie(Zombie):
    KIND = "crawler"
```

3. Đăng ký trong `ZOMBIE_CLASSES`, thêm màu vào `ZOMBIE_COLORS`,
   và thêm weight unlock trong `ZombieSpawner.pick_type`.

## How to modify the map

- Đổi seed: `settings.py → MAP_SEED` (mỗi seed = một thành phố mới).
- Đổi mật độ: chỉnh số lượng trong `GameMap._generate()` (buildings,
  trees, cars, crates...).
- Kích thước world: `WORLD_WIDTH / WORLD_HEIGHT`.

## How to modify difficulty

Tất cả trong `settings.py`:

- Số zombie/wave: `BASE_WAVE_SIZE`, `WAVE_SIZE_GROWTH`
- Scale mạnh hơn theo wave: `HP_GROWTH_PER_WAVE`, `SPEED_GROWTH_PER_WAVE`,
  `DAMAGE_GROWTH_PER_WAVE`
- Boss: `BOSS_EVERY_N_WAVES`
- Ngày/đêm: `DAY_LENGTH`, `NIGHT_LENGTH`, `NIGHT_*_BONUS`
- Spawn: `SPAWN_MIN_DIST`, `MAX_ALIVE_ZOMBIES`
- XP: `XP_BASE_REQUIREMENT`; combo: `COMBO_WINDOW`, `COMBO_KILLS_PER_STEP`

Stats chi tiết từng súng/zombie nằm trong `data/*.json`.

## Enable DEBUG

- Sửa `DEBUG = True` trong `settings.py`, hoặc nhấn `F3` trong game.
Hiện: FPS, vị trí, đếm zombie/bullet/particle, wave, spawn rate, night factor
+ vẽ collision box vật cản, attack/detection range của zombie, player radius.

## Multiplayer (scaffold)

`network.py` có sẵn transport TCP/JSON hoạt động thật:
`Server` (authoritative, accept tối đa 4 clients, broadcast snapshot) và
`Client` (gửi input, nhận snapshot, background receive thread).
Game logic đã tách khỏi rendering/input nên sau này chỉ cần cho server chạy
`update_playing()` headless và client render snapshot — xem docstring
đầu file để biết điểm tích hợp.

## Notes

- Không có file âm thanh? Game vẫn chạy 100% (AudioManager tự bỏ qua).
  Muốn có tiếng: đặt `shoot.wav`, `explosion.wav`, `music.ogg`... vào
  `assets/sounds/`.
- Save bị hỏng? Tự fallback về default, không crash.
