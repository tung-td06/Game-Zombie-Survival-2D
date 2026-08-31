"""Audio playback with graceful degradation.

Missing sound files never crash the game — play() simply becomes a no-op.
Drop .wav/.ogg files into assets/sounds/ to enable effects:
  shoot.wav shotgun.wav smg.wav rifle.wav sniper.wav reload.wav
  zombie_hit.wav zombie_die.wav player_hit.wav explosion.wav
  click.wav levelup.wav buy.wav pickup.wav boss_roar.wav music.ogg
"""
from __future__ import annotations

import os

import pygame

import settings as S

SOUND_NAMES = [
    "shoot", "shotgun", "smg", "rifle", "sniper", "reload",
    "zombie_hit", "zombie_die", "player_hit", "explosion",
    "click", "levelup", "buy", "pickup", "boss_roar",
]
_EXTENSIONS = (".ogg", ".wav", ".mp3")


class AudioManager:
    """Loads sounds lazily and applies master/music/sfx volume."""

    def __init__(self) -> None:
        self.enabled = False
        self.sounds: dict[str, pygame.mixer.Sound] = {}
        self.music_path: str | None = None
        self.master = 0.8
        self.music_volume = 0.6
        self.sfx_volume = 0.8
        try:
            pygame.mixer.init()
            self.enabled = True
        except pygame.error:
            self.enabled = False

    # ------------------------------------------------------------- loading -
    def load(self, master: float, music: float, sfx: float) -> None:
        if not self.enabled:
            return
        self.master, self.music_volume, self.sfx_volume = master, music, sfx
        sound_dir = os.path.join(S.ASSETS_DIR, "sounds")
        for name in SOUND_NAMES:
            path = self._find(sound_dir, name)
            if path and name not in self.sounds:
                try:
                    self.sounds[name] = pygame.mixer.Sound(path)
                except pygame.error:
                    pass
        self._apply_volumes()
        music_file = self._find(sound_dir, "music")
        if music_file:
            try:
                pygame.mixer.music.load(music_file)
                self.music_path = music_file
            except pygame.error:
                pass

    @staticmethod
    def _find(directory: str, name: str) -> str | None:
        for ext in _EXTENSIONS:
            path = os.path.join(directory, name + ext)
            if os.path.isfile(path):
                return path
        return None

    def _apply_volumes(self) -> None:
        for snd in self.sounds.values():
            snd.set_volume(self.master * self.sfx_volume)

    def set_volumes(self, master: float, music: float, sfx: float) -> None:
        self.load(master, music, sfx)

    # ------------------------------------------------------------ playback -
    def play(self, name: str) -> None:
        if not self.enabled:
            return
        snd = self.sounds.get(name)
        if snd is not None:
            try:
                snd.play()
            except pygame.error:
                pass

    def start_music(self) -> None:
        if self.enabled and self.music_path:
            try:
                pygame.mixer.music.set_volume(self.master * self.music_volume * 0.6)
                pygame.mixer.music.play(loops=-1)
            except pygame.error:
                pass

    def stop_music(self) -> None:
        if self.enabled:
            try:
                pygame.mixer.music.stop()
            except pygame.error:
                pass
