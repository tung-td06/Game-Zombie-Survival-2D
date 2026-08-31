"""Entry point for Zombie Survival."""
import pygame

import settings as S
from game import Game


def main() -> None:
    pygame.init()
    # SCALED: logical resolution stays crisp while the OS window is resizable.
    screen = pygame.display.set_mode(
        (S.SCREEN_WIDTH, S.SCREEN_HEIGHT), pygame.RESIZABLE | pygame.SCALED)
    pygame.display.set_caption(S.WINDOW_TITLE)
    try:
        pygame.display.set_icon(pygame.Surface((32, 32)))
    except pygame.error:
        pass
    # Hide the OS cursor — we draw an in-game crosshair instead. This avoids
    # the OS cursor drifting relative to the in-game one on scaled surfaces.
    pygame.mouse.set_visible(False)
    Game(screen).run()
    pygame.quit()


if __name__ == "__main__":
    main()
