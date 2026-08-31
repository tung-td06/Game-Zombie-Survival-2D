"""LevelTransitionManager — clean state machine for Level Up flow.

States (mutually exclusive, no overlapping boolean flags):

    GAMEPLAY           — normal play
    LEVEL_UP           — upgrade choices shown, gameplay paused, world still
                          visible behind the UI (NO black overlay)
    APPLYING_UPGRADE   — upgrade chosen, side effects being applied (one frame)
    STARTING_NEXT_LEVEL — gameplay resume hook (one frame)

Transitions are funnelled through request_level_up(), choose_upgrade() and
finish_applying(). All entry points are guarded so duplicate calls are
ignored — no double level-up, no double enemy spawn, no double timer reset.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from upgrade import UpgradeSystem


GAMEPLAY = "GAMEPLAY"
LEVEL_UP = "LEVEL_UP"
APPLYING_UPGRADE = "APPLYING_UPGRADE"
STARTING_NEXT_LEVEL = "STARTING_NEXT_LEVEL"


class LevelTransitionManager:
    """Owns the Level Up state machine.

    Public surface:
        state                 current state (read-only)
        choices               currently displayed upgrade ids (or [])
        request_level_up()    move GAMEPLAY -> LEVEL_UP (idempotent)
        choose_upgrade(uid)   LEVEL_UP -> APPLYING_UPGRADE
        finish_applying()     APPLYING_UPGRADE -> STARTING_NEXT_LEVEL
        resume_gameplay()     STARTING_NEXT_LEVEL -> GAMEPLAY
        reset()               return to GAMEPLAY (new run)
        is_gameplay_paused    True when world simulation should be frozen
    """

    def __init__(self, upgrades: "UpgradeSystem") -> None:
        self._upgrades = upgrades
        self._state: str = GAMEPLAY
        self._choices: list[str] = []
        # Internal guards.
        self._transition_in_flight: bool = False
        self._applied_this_round: bool = False
        # Animation phase for UI (driven by Game, optional).
        self.ui_phase: str = "hidden"   # 'hidden' | 'enter' | 'shown' | 'exit'

    # -------------------------------------------------------------- read --
    @property
    def state(self) -> str:
        return self._state

    @property
    def choices(self) -> list[str]:
        return list(self._choices)

    @property
    def is_gameplay_paused(self) -> bool:
        return self._state in (LEVEL_UP, APPLYING_UPGRADE,
                               STARTING_NEXT_LEVEL)

    @property
    def is_level_up_active(self) -> bool:
        return self._state == LEVEL_UP

    # ---------------------------------------------------------- transitions --
    def request_level_up(self, player) -> bool:
        """Move into LEVEL_UP and roll choices.

        Idempotent: calling while already in LEVEL_UP is a no-op (returns
        False). Returns True when the transition was actually started.
        """
        if self._state != GAMEPLAY:
            return False
        self._choices = self._upgrades.roll_choices(player)
        if not self._choices:
            self._choices = [u["id"] for u in self._upgrades.CATALOG][:3]
        self._applied_this_round = False
        self._transition_in_flight = True
        self._state = LEVEL_UP
        self.ui_phase = "enter"
        return True

    def choose_upgrade(self, uid: str) -> bool:
        """LEVEL_UP -> APPLYING_UPGRADE. Ignored outside LEVEL_UP or when
        the choice is not currently offered."""
        if self._state != LEVEL_UP:
            return False
        if uid not in self._choices:
            return False
        if self._applied_this_round:
            return False
        self._applied_this_round = True
        self._state = APPLYING_UPGRADE
        self.ui_phase = "exit"
        return True

    def start_next_batch(self, player) -> bool:
        """Used when more pending levels remain: APPLYING_UPGRADE
        (or STARTING_NEXT_LEVEL) -> LEVEL_UP with a fresh roll."""
        if self._state not in (APPLYING_UPGRADE, STARTING_NEXT_LEVEL):
            return False
        rolled = self._upgrades.roll_choices(player)
        if not rolled:
            rolled = [u["id"] for u in self._upgrades.CATALOG][:3]
        self._choices = rolled
        self._applied_this_round = False
        self._state = LEVEL_UP
        self.ui_phase = "enter"
        return True

    def finish_applying(self) -> bool:
        """APPLYING_UPGRADE -> STARTING_NEXT_LEVEL."""
        if self._state != APPLYING_UPGRADE:
            return False
        self._state = STARTING_NEXT_LEVEL
        return True

    def resume_gameplay(self) -> bool:
        """STARTING_NEXT_LEVEL (or APPLYING_UPGRADE) -> GAMEPLAY.

        Safe to call multiple times. Accepts APPLYING_UPGRADE too so
        callers don't have to remember to call finish_applying() first.
        """
        if self._state not in (STARTING_NEXT_LEVEL, APPLYING_UPGRADE):
            return False
        self._choices = []
        self._transition_in_flight = False
        self._applied_this_round = False
        self._state = GAMEPLAY
        self.ui_phase = "hidden"
        return True

    def reset(self) -> None:
        """Hard reset (new run / game over)."""
        self._state = GAMEPLAY
        self._choices = []
        self._transition_in_flight = False
        self._applied_this_round = False
        self.ui_phase = "hidden"

    # ----------------------------------------------------------- helpers --
    def choices_or_roll(self, player) -> list[str]:
        """Used by APPLYING_UPGRADE -> roll a fresh set if more pending
        levels exist. Returns an empty list if state is not correct."""
        if self._state not in (APPLYING_UPGRADE, STARTING_NEXT_LEVEL):
            return []
        if self._choices:
            return self._choices
        rolled = self._upgrades.roll_choices(player)
        if rolled:
            self._choices = rolled
        return list(self._choices)

    def to_dict(self) -> dict:
        return {
            "state": self._state,
            "choices": list(self._choices),
            "in_flight": self._transition_in_flight,
        }