"""Procedural city map: roads, buildings, houses, trees, cars, obstacles.

Generated from a fixed seed so maps are reproducible. Obstacles are stored
in a coarse spatial grid for cheap nearby-lookups (collision + culling).
"""
from __future__ import annotations

import random

import pygame

import settings as S
from collision import circle_rect_collide

CELL = 400


class GameMap:
    """World geometry + rendering. All coordinates are world-space."""

    def __init__(self, seed: int = S.MAP_SEED) -> None:
        self.rng = random.Random(seed)
        self.roads: list[pygame.Rect] = []
        self.obstacles: list[tuple[pygame.Rect, str]] = []
        self._grid: dict[tuple[int, int], list[tuple[pygame.Rect, str]]] = {}
        self.minimap: pygame.Surface | None = None
        self._generate()
        self._build_minimap()

    # ------------------------------------------------------- generation ----
    def _add(self, kind: str, rect: pygame.Rect, solid: bool = True) -> None:
        if solid:
            self.obstacles.append((rect, kind))
            x0 = rect.left // CELL
            x1 = rect.right // CELL
            y0 = rect.top // CELL
            y1 = rect.bottom // CELL
            for gx in range(x0, x1 + 1):
                for gy in range(y0, y1 + 1):
                    self._grid.setdefault((gx, gy), []).append((rect, kind))

    def _overlaps(self, rect: pygame.Rect, pad: int = 30,
                  check_roads: bool = False) -> bool:
        test = rect.inflate(pad * 2, pad * 2)
        for other, _kind in self.obstacles:
            if test.colliderect(other):
                return True
        if check_roads:
            for road in self.roads:
                if test.colliderect(road):
                    return True
        return False

    def _generate(self) -> None:
        rng = self.rng
        w, h = S.WORLD_WIDTH, S.WORLD_HEIGHT

        # Border walls keep everyone inside the world.
        t = 60
        self._add("border", pygame.Rect(-t, -t, w + 2 * t, t))          # top
        self._add("border", pygame.Rect(-t, h, w + 2 * t, t))           # bottom
        self._add("border", pygame.Rect(-t, 0, t, h))                   # left
        self._add("border", pygame.Rect(w, 0, t, h))                    # right

        # Roads: 2 vertical + 2 horizontal strips.
        xs = sorted(rng.sample(range(600, w - 600, 400), 2))
        ys = sorted(rng.sample(range(600, h - 600, 400), 2))
        rw = 140
        for x in xs:
            self.roads.append(pygame.Rect(x - rw // 2, 0, rw, h))
        for y in ys:
            self.roads.append(pygame.Rect(0, y - rw // 2, w, rw))

        # Buildings along/near roads.
        placed = 0
        attempts = 0
        while placed < 16 and attempts < 300:
            attempts += 1
            bw = rng.randint(200, 420)
            bh = rng.randint(160, 320)
            r = pygame.Rect(rng.randint(t + 40, w - bw - t - 40),
                            rng.randint(t + 40, h - bh - t - 40), bw, bh)
            if not self._overlaps(r, pad=70):
                self._add("building", r)
                placed += 1

        # Houses.
        placed, attempts = 0, 0
        while placed < 12 and attempts < 300:
            attempts += 1
            hw = rng.randint(120, 210)
            hh = rng.randint(110, 180)
            r = pygame.Rect(rng.randint(t + 20, w - hw - t - 20),
                            rng.randint(t + 20, h - hh - t - 20), hw, hh)
            if not self._overlaps(r, pad=50):
                self._add("house", r)
                placed += 1

        # Cars parked on road edges.
        for _ in range(14):
            road = rng.choice(self.roads)
            if road.width < road.height:      # vertical road
                side = rng.choice([-1, 1])
                cx = road.centerx + side * (road.width // 2 - 32)
                cy = rng.randint(t + 80, h - t - 80)
                car = pygame.Rect(cx - 45, cy - 25, 90, 50)
            else:                              # horizontal road
                side = rng.choice([-1, 1])
                cx = rng.randint(t + 80, w - t - 80)
                cy = road.centery + side * (road.height // 2 - 32)
                car = pygame.Rect(cx - 45, cy - 25, 90, 50)
            if not self._overlaps(car, pad=8):
                kind = f"car_{rng.choice(['red', 'blue', 'yellow'])}"
                self._add(kind, car)

        # Shipping containers near roads.
        for _ in range(8):
            road = rng.choice(self.roads)
            vertical = road.width < road.height
            cw = (70, 170) if vertical else (170, 70)
            pos_x = road.centerx + rng.randint(-260, 260) if not vertical else \
                road.centerx + rng.choice([-1, 1]) * rng.randint(160, 300)
            pos_y = road.centery + rng.randint(-260, 260) if vertical else \
                road.centery + rng.choice([-1, 1]) * rng.randint(160, 300)
            box = pygame.Rect(pos_x, pos_y, cw[0], cw[1])
            box.clamp_ip(pygame.Rect(t, t, w - 2 * t, h - 2 * t))
            if not self._overlaps(box, pad=25):
                self._add("container", box)

        # Crates and barricades scattered everywhere.
        for _ in range(26):
            box = pygame.Rect(rng.randint(t, w - t - 42),
                              rng.randint(t, h - t - 42),
                              rng.randint(36, 48), rng.randint(36, 48))
            if not self._overlaps(box, pad=18):
                self._add("crate", box)
        for _ in range(16):
            horiz = rng.random() < 0.5
            size = (90, 18) if horiz else (18, 90)
            box = pygame.Rect(rng.randint(t, w - t - size[0]),
                              rng.randint(t, h - t - size[1]), *size)
            if not self._overlaps(box, pad=16):
                self._add("barricade", box)

        # Trees last (small, plenty).
        for _ in range(95):
            radius = rng.randint(17, 28)
            box = pygame.Rect(0, 0, radius * 2, radius * 2)
            box.center = (rng.randint(t + radius, w - t - radius),
                          rng.randint(t + radius, h - t - radius))
            if not self._overlaps(box, pad=10):
                self._add("tree", box)

        # Streetlamps along roads (emit light at night).
        self._lamp_lights: list[tuple[pygame.Rect, int]] = []
        for road in self.roads[:2]:
            if road.width < road.height:
                spacing = 300
                yy = road.top + 100
                while yy < road.bottom - 100:
                    lamp = pygame.Rect(road.centerx + road.width // 2 + 14,
                                       yy - 4, 8, 24)
                    if not self._overlaps(lamp, pad=4):
                        self._add("streetlamp", lamp)
                        self._lamp_lights.append(
                            (pygame.Rect(lamp.centerx - 6, lamp.top - 4,
                                         12, 12),
                             220))
                    yy += spacing
            else:
                spacing = 300
                xx = road.left + 100
                while xx < road.right - 100:
                    lamp = pygame.Rect(xx - 4,
                                       road.centery + road.height // 2 + 14,
                                       8, 24)
                    if not self._overlaps(lamp, pad=4):
                        self._add("streetlamp", lamp)
                        self._lamp_lights.append(
                            (pygame.Rect(lamp.centerx - 6, lamp.top - 4,
                                         12, 12),
                             220))
                    xx += spacing

        # Road signs.
        for _ in range(14):
            sign = pygame.Rect(rng.randint(t + 30, w - t - 60),
                               rng.randint(t + 30, h - t - 60),
                               32, 32)
            if not self._overlaps(sign, pad=4):
                self._add("sign", sign)

        # Puddles (decorative, non-collidable — not in obstacle grid).
        for _ in range(18):
            pw = pygame.Rect(0, 0,
                             rng.randint(30, 60),
                             rng.randint(20, 36))
            pw.center = (rng.randint(t + 30, w - t - 30),
                         rng.randint(t + 30, h - t - 30))
            self.obstacles.append((pw, "puddle"))

    # ------------------------------------------------------------ queries --
    def get_near(self, pos: pygame.Vector2, radius: float) -> list[pygame.Rect]:
        """Obstacle rects possibly touching a circle at pos."""
        x0 = int(pos.x - radius) // CELL
        x1 = int(pos.x + radius) // CELL
        y0 = int(pos.y - radius) // CELL
        y1 = int(pos.y + radius) // CELL
        rects: list[pygame.Rect] = []
        seen: set[int] = set()
        for gx in range(x0, x1 + 1):
            for gy in range(y0, y1 + 1):
                for rect, _k in self._grid.get((gx, gy), ()):
                    if id(rect) not in seen:
                        seen.add(id(rect))
                        rects.append(rect)
        return rects

    def get_near_phasing(self, pos: pygame.Vector2,
                         radius: float) -> list[pygame.Rect]:
        """Obstacles for entities that phase through terrain.

        Returns only the world border walls so phasing enemies can't escape
        the playable area but ignore buildings, cars, crates, etc.
        """
        x0 = int(pos.x - radius) // CELL
        x1 = int(pos.x + radius) // CELL
        y0 = int(pos.y - radius) // CELL
        y1 = int(pos.y + radius) // CELL
        rects: list[pygame.Rect] = []
        seen: set[int] = set()
        for gx in range(x0, x1 + 1):
            for gy in range(y0, y1 + 1):
                for rect, kind in self._grid.get((gx, gy), ()):
                    if kind != "border":
                        continue
                    if id(rect) not in seen:
                        seen.add(id(rect))
                        rects.append(rect)
        return rects

    def blocked(self, pos: pygame.Vector2, radius: float) -> bool:
        for rect in self.get_near(pos, radius):
            if circle_rect_collide(pos.x, pos.y, radius, rect):
                return True
        return False

    def random_free_point(self, rng: random.Random,
                          min_dist: float = 0.0, max_dist: float = 0.0,
                          away_from: pygame.Vector2 | None = None,
                          radius: float = 24.0, tries: int = 80) -> pygame.Vector2 | None:
        for _ in range(tries):
            p = pygame.Vector2(
                rng.uniform(80.0, S.WORLD_WIDTH - 80.0),
                rng.uniform(80.0, S.WORLD_HEIGHT - 80.0),
            )
            if self.blocked(p, radius):
                continue
            if away_from is not None and min_dist > 0:
                d = p.distance_to(away_from)
                if d < min_dist or (max_dist > 0 and d > max_dist):
                    continue
            return p
        return None

    def spawn_points(self, count: int) -> list[pygame.Vector2]:
        pts: list[pygame.Vector2] = []
        for _ in range(count):
            p = self.random_free_point(self.rng)
            if p is not None:
                pts.append(p)
        return pts

    # ----------------------------------------------------------- rendering -
    def draw_ground(self, surface: pygame.Surface, cam,
                 biome: str = "city") -> None:
        bg_dark, bg_light, _ = S.BIOME_TINT.get(biome, S.BIOME_TINT["city"])
        surface.fill(bg_dark)
        view = cam.view_rect
        step = 100
        grid_c = bg_light
        tl = cam.apply(pygame.Vector2(view.left, view.top))
        br = cam.apply(pygame.Vector2(view.right, view.bottom))
        x = (view.left // step) * step
        while x < view.right:
            sx = int(cam.apply(pygame.Vector2(x, 0)).x)
            pygame.draw.line(surface, grid_c,
                             (sx, max(0, int(tl.y))), (sx, min(S.SCREEN_HEIGHT, int(br.y))))
            x += step
        y = (view.top // step) * step
        while y < view.bottom:
            sy = int(cam.apply(pygame.Vector2(0, y)).y)
            pygame.draw.line(surface, grid_c,
                             (max(0, int(tl.x)), sy), (min(S.SCREEN_WIDTH, int(br.x)), sy))
            y += step
        if biome == "park":
            for cy in range(int(view.top), int(view.bottom), 200):
                for cx in range(int(view.left), int(view.right), 200):
                    sx = int(cam.apply(pygame.Vector2(cx, cy)).x)
                    sy = int(cam.apply(pygame.Vector2(cx, cy)).y)
                    pygame.draw.circle(surface, (24, 50, 30),
                                       (sx, sy), 24)
        road_c = S.color("road")
        line_c = S.color("road_line")
        for road in self.roads:
            sr = cam.apply_rect(road)
            if sr.colliderect(surface.get_rect()):
                pygame.draw.rect(surface, road_c, sr)
                if road.width < road.height:
                    start = max(sr.top, 0)
                    yy = start - (start % 70)
                    while yy < min(sr.bottom, S.SCREEN_HEIGHT):
                        pygame.draw.rect(surface, line_c, (sr.centerx - 3, yy, 6, 36))
                        yy += 70
                else:
                    start = max(sr.left, 0)
                    xx = start - (start % 70)
                    while xx < min(sr.right, S.SCREEN_WIDTH):
                        pygame.draw.rect(surface, line_c, (xx, sr.centery - 3, 36, 6))
                        xx += 70

    def draw_obstacles(self, surface: pygame.Surface, cam) -> None:
        view = cam.view_rect
        x0 = view.left // CELL
        x1 = view.right // CELL
        y0 = view.top // CELL
        y1 = view.bottom // CELL
        drawn: set[int] = set()
        for gx in range(int(x0), int(x1) + 1):
            for gy in range(int(y0), int(y1) + 1):
                for rect, kind in self._grid.get((gx, gy), ()):
                    if id(rect) in drawn:
                        continue
                    drawn.add(id(rect))
                    if not view.colliderect(rect):
                        continue
                    self._draw_obstacle(surface, cam, rect, kind)

    def _draw_obstacle(self, surface: pygame.Surface, cam,
                       rect: pygame.Rect, kind: str) -> None:
        sr = cam.apply_rect(rect)
        # Deterministic lit/dark pattern locked to the obstacle's
        # world position. The old implementation mixed in
        # `pygame.time.get_ticks() // 100` so the same building's
        # windows would visibly blink on and off every few frames
        # while you walked past — that was both distracting and a
        # real source of eye strain. Now each building is either
        # "lit" (some windows on) or "dark" (all windows off) for
        # the entire run, with no time-based component.
        flicker_seed = (rect.x * 13 + rect.y * 7) % 100
        flicker = flicker_seed >= 30  # ~70% lit, 30% dark

        if kind == "building":
            sh = sr.move(3, 4)
            pygame.draw.rect(surface, (10, 10, 14), sh, border_radius=4)
            pygame.draw.rect(surface, S.color("building"), sr, border_radius=3)
            pygame.draw.rect(surface, S.color("border"), sr, 3, border_radius=3)
            roof = sr.inflate(-14, -14)
            pygame.draw.rect(surface, S.color("building_roof"), roof,
                             border_radius=3)
            for tx in range(roof.left + 6, roof.right - 6, 14):
                pygame.draw.line(surface, (52, 50, 60),
                                 (tx, roof.top), (tx, roof.bottom))
            for ty in range(roof.top + 6, roof.bottom - 6, 14):
                pygame.draw.line(surface, (52, 50, 60),
                                 (roof.left, ty), (roof.right, ty))

            for wx in range(sr.left + 16, sr.right - 22, 32):
                for wy in range(sr.top + 16, sr.bottom - 22, 38):
                    lit = (wx // 32 + wy // 38) % 3 != 0 and flicker
                    if lit:
                        pygame.draw.rect(surface, (255, 220, 120),
                                         (wx, wy, 12, 16))
                        pygame.draw.rect(surface, (255, 240, 180),
                                         (wx + 2, wy + 2, 4, 5))
                        pygame.draw.rect(surface, (140, 90, 30),
                                         (wx, wy, 12, 16), 1)
                    else:
                        pygame.draw.rect(surface, (12, 16, 22),
                                         (wx, wy, 12, 16))
                        pygame.draw.rect(surface, (4, 6, 10),
                                         (wx + 4, wy + 4, 4, 8))

            door_w = 16
            door_h = 22
            door_x = sr.centerx - door_w // 2
            door_y = sr.bottom - door_h - 3
            pygame.draw.rect(surface, (10, 6, 4),
                             (door_x - 2, door_y - 2, door_w + 4, door_h + 2))
            pygame.draw.rect(surface, (40, 30, 20),
                             (door_x, door_y, door_w, door_h))
            pygame.draw.circle(surface, (200, 180, 80),
                               (door_x + door_w - 3, door_y + door_h // 2), 1)

            ac = (rect.x // 40 + rect.y // 60) % 3
            if ac == 0 and rect.width > 180:
                ac_x = sr.right - 18
                ac_y = sr.top + 6
                pygame.draw.rect(surface, (130, 130, 140),
                                 (ac_x, ac_y, 8, 12))
                pygame.draw.rect(surface, (60, 60, 70),
                                 (ac_x - 2, ac_y - 2, 12, 16), 1)
                pygame.draw.rect(surface, (180, 180, 190),
                                 (ac_x + 1, ac_y + 1, 6, 10))
        elif kind == "house":
            sh = sr.move(2, 3)
            pygame.draw.rect(surface, (10, 6, 4), sh, border_radius=3)
            pygame.draw.rect(surface, S.color("house"), sr, border_radius=3)
            pygame.draw.rect(surface, (40, 28, 22), sr, 3, border_radius=3)

            roof_w = sr.width - 16
            roof_h = sr.height // 3 + 6
            roof_pts = [
                (sr.left + 4, sr.top + 14),
                (sr.centerx, sr.top - 2),
                (sr.right - 4, sr.top + 14),
            ]
            pygame.draw.polygon(surface, S.color("house_roof"), roof_pts)
            pygame.draw.line(surface, (60, 42, 30), roof_pts[1],
                             roof_pts[0], 2)
            pygame.draw.line(surface, (60, 42, 30), roof_pts[1],
                             roof_pts[2], 2)
            for tx in range(sr.left + 16, sr.right - 16, 12):
                pygame.draw.line(surface, (70, 50, 36),
                                 (tx, sr.top + 8),
                                 (tx - 4, sr.top + 14), 1)

            win_x = sr.left + 12
            win_y = sr.top + roof_h + 8
            for wxp in (0, sr.width - 30):
                if flicker:
                    pygame.draw.rect(surface, (255, 220, 120),
                                     (win_x + wxp, win_y, 18, 16))
                    pygame.draw.rect(surface, (255, 240, 180),
                                     (win_x + wxp + 2, win_y + 2, 5, 5))
                else:
                    pygame.draw.rect(surface, (16, 22, 28),
                                     (win_x + wxp, win_y, 18, 16))
                pygame.draw.rect(surface, (40, 28, 20),
                                 (win_x + wxp, win_y, 18, 16), 2)
                pygame.draw.line(surface, (40, 28, 20),
                                 (win_x + wxp + 9, win_y),
                                 (win_x + wxp + 9, win_y + 16), 1)

            door_x = sr.centerx - 8
            door_y = sr.bottom - 28
            pygame.draw.rect(surface, (10, 6, 4),
                             (door_x - 2, door_y - 2, 20, 30))
            pygame.draw.rect(surface, (90, 50, 30),
                             (door_x, door_y, 16, 28))
            pygame.draw.circle(surface, (200, 180, 80),
                               (door_x + 13, door_y + 14), 1)
        elif kind == "tree":
            c = pygame.Vector2(sr.center)
            pygame.draw.ellipse(surface, (8, 18, 12),
                                (int(c.x) - sr.width // 2 - 2,
                                 int(c.y) + sr.height // 2 - 2,
                                 sr.width + 4, 10))
            for layer_i, (r_off, col) in enumerate([
                (0, S.color("tree")),
                (4, S.color("tree_dark")),
                (8, (28, 60, 36)),
            ]):
                pygame.draw.circle(surface, col,
                                   (int(c.x) - layer_i * 2,
                                    int(c.y) - layer_i),
                                   sr.width // 2 - r_off)
            for lx_off, ly_off in ((-3, -4), (4, -2), (-1, 5), (3, 3)):
                pygame.draw.circle(surface, (90, 200, 120, 180),
                                   (int(c.x) + lx_off * sr.width // 14,
                                    int(c.y) + ly_off * sr.height // 14),
                                   max(1, sr.width // 12))
            pygame.draw.rect(surface, (50, 30, 18),
                             (int(c.x) - 2, int(c.y) + 2, 4, 6))
        elif kind.startswith("car"):
            body = S.color(kind.replace("car_", "car_"))
            shadow = sr.move(2, 3)
            pygame.draw.rect(surface, (8, 8, 10), shadow, border_radius=10)
            pygame.draw.rect(surface, body, sr, border_radius=10)
            pygame.draw.rect(surface, (20, 20, 24), sr.inflate(-16, -14),
                             border_radius=6)
            pygame.draw.rect(surface, (140, 200, 240), sr.inflate(-22, -18),
                             border_radius=4)
            pygame.draw.rect(surface, (15, 15, 18), sr, 2, border_radius=10)
            pygame.draw.line(surface, (180, 180, 200),
                             (sr.left + 4, sr.centery),
                             (sr.right - 4, sr.centery), 1)
            pygame.draw.circle(surface, (255, 240, 100),
                               (sr.right - 4, sr.top + 4), 2)
            pygame.draw.circle(surface, (255, 100, 80),
                               (sr.left + 4, sr.bottom - 4), 2)
        elif kind == "container":
            sh = sr.move(2, 3)
            pygame.draw.rect(surface, (8, 12, 12), sh, border_radius=2)
            pygame.draw.rect(surface, S.color("container"), sr)
            for i in range(0, sr.width, 14):
                pygame.draw.line(surface, (38, 74, 74),
                                 (sr.left + i, sr.top),
                                 (sr.left + i, sr.bottom))
            for j in range(0, sr.height, 14):
                pygame.draw.line(surface, (32, 64, 64),
                                 (sr.left, sr.top + j),
                                 (sr.right, sr.top + j))
            for i in range(0, sr.width, 28):
                pygame.draw.line(surface, (140, 70, 50),
                                 (sr.left + i, sr.top + 1),
                                 (sr.left + i + 8, sr.top + 6), 1)
            pygame.draw.rect(surface, (26, 54, 54), sr, 3)
            pygame.draw.rect(surface, (200, 160, 60),
                             (sr.left + 2, sr.bottom - 4, 6, 2))
        elif kind == "crate":
            pygame.draw.rect(surface, (8, 6, 4), sr.move(1, 2),
                             border_radius=3)
            pygame.draw.rect(surface, S.color("crate"), sr, border_radius=3)
            pygame.draw.lines(surface, (86, 62, 32), False,
                              [sr.topleft, sr.bottomright], 3)
            pygame.draw.lines(surface, (86, 62, 32), False,
                              [sr.topright, sr.bottomleft], 3)
            for x in range(sr.left + 4, sr.right - 4, 4):
                pygame.draw.line(surface, (96, 70, 36),
                                 (x, sr.top + 4), (x, sr.bottom - 4), 1)
            pygame.draw.rect(surface, (60, 44, 24), sr, 2, border_radius=3)
        elif kind == "barricade":
            pygame.draw.rect(surface, (16, 16, 18),
                             sr.move(1, 2))
            pygame.draw.rect(surface, S.color("barricade"), sr)
            stripe = (200, 160, 40)
            stripe2 = (40, 40, 40)
            if sr.width > sr.height:
                for i in range(sr.left, sr.right, 24):
                    pygame.draw.polygon(surface, stripe, [
                        (i, sr.bottom), (i + 12, sr.bottom),
                        (i + 24, sr.top), (i + 12, sr.top)])
                    pygame.draw.polygon(surface, stripe2, [
                        (i + 12, sr.bottom), (i + 24, sr.bottom),
                        (i + 36, sr.top), (i + 24, sr.top)])
            else:
                for i in range(sr.top, sr.bottom, 24):
                    pygame.draw.polygon(surface, stripe, [
                        (sr.right, i), (sr.right, i + 12),
                        (sr.left, i + 24), (sr.left, i + 12)])
                    pygame.draw.polygon(surface, stripe2, [
                        (sr.right, i + 12), (sr.right, i + 24),
                        (sr.left, i + 36), (sr.left, i + 24)])
            pygame.draw.rect(surface, (20, 20, 24), sr, 1)
        elif kind == "border":
            pygame.draw.rect(surface, S.color("border"), sr)
            pygame.draw.rect(surface, (20, 20, 24), sr.inflate(-4, -4), 1)
        elif kind == "streetlamp":
            base_x, base_y = sr.centerx, sr.bottom
            pygame.draw.rect(surface, (20, 20, 24),
                             (base_x - 3, base_y - 8, 6, 12))
            pygame.draw.rect(surface, (40, 40, 46),
                             (base_x - 2, base_y - 6, 4, 14))
            pygame.draw.line(surface, (30, 30, 36),
                             (base_x, base_y - 14),
                             (base_x, sr.top + 6), 2)
            pygame.draw.circle(surface, (60, 60, 70),
                               (base_x, sr.top + 4), 5)
            pygame.draw.circle(surface, (255, 220, 130),
                               (base_x, sr.top + 4), 4)
            pygame.draw.circle(surface, (255, 250, 200),
                               (base_x, sr.top + 4), 2)
        elif kind == "sign":
            sh = sr.move(1, 2)
            pygame.draw.rect(surface, (20, 16, 10), sh, border_radius=2)
            pygame.draw.rect(surface, (180, 60, 60), sr, border_radius=2)
            pygame.draw.rect(surface, (240, 240, 240),
                             (sr.left + 4, sr.top + 4,
                              sr.width - 8, sr.height - 8), border_radius=2)
            pygame.draw.rect(surface, (40, 20, 20),
                             (sr.left + 6, sr.top + 6,
                              sr.width - 12, sr.height - 12), border_radius=2)
        elif kind == "puddle":
            pygame.draw.ellipse(surface, (40, 60, 80), sr)
            pygame.draw.ellipse(surface, (80, 130, 160),
                                sr.inflate(-4, -2))
            pygame.draw.ellipse(surface, (180, 220, 240),
                                (sr.left + 4, sr.top + 2, 6, 2))

    # ----------------------------------------------------------- lighting -
    def lamp_light_positions(self) -> list[tuple[pygame.Vector2, int]]:
        """World positions + radius for streetlamps (for lighting)."""
        return [(pygame.Vector2(r.center), rad)
                for r, rad in getattr(self, "_lamp_lights", [])]

# ------------------------------------------------------------- minimap -
    def _build_minimap(self) -> None:
        scale = S.MINIMAP_SIZE / S.WORLD_WIDTH
        surf = pygame.Surface((S.MINIMAP_SIZE, S.MINIMAP_SIZE))
        surf.fill((10, 12, 10))
        for road in self.roads:
            r = pygame.Rect(int(road.x * scale), int(road.y * scale),
                            max(2, int(road.width * scale)),
                            max(2, int(road.height * scale)))
            pygame.draw.rect(surf, (46, 46, 50), r)
        for rect, kind in self.obstacles:
            r = pygame.Rect(int(rect.x * scale), int(rect.y * scale),
                            max(1, int(rect.width * scale)),
                            max(1, int(rect.height * scale)))
            col = {
                "building": (70, 68, 78), "house": (96, 72, 56),
                "tree": (30, 66, 36), "container": (48, 88, 88),
                "crate": (104, 82, 50), "border": (60, 60, 64),
                "streetlamp": (220, 200, 110), "sign": (180, 60, 60),
                "puddle": (60, 90, 120),
            }.get(kind, (56, 56, 60))
            pygame.draw.rect(surf, col, r)
        self.minimap = surf
