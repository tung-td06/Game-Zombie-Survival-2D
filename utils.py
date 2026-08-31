"""Small shared utilities: math helpers and crash-safe JSON IO."""
from __future__ import annotations

import json
import os
from typing import Any


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def format_time(seconds: float) -> str:
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m:02d}:{s:02d}"


def load_json(path: str, default: dict[str, Any]) -> dict[str, Any]:
    """Load a JSON file; on any error return a copy of `default`.

    Corrupted / missing files must never crash the game.
    """
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            merged = dict(default)
            merged.update(data)
            return merged
    except (OSError, ValueError):
        pass
    return json.loads(json.dumps(default))  # deep copy


def save_json(path: str, data: dict[str, Any]) -> bool:
    """Atomically-ish save JSON. Returns True on success."""
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
        if os.path.exists(path):
            os.replace(tmp, path)
        else:
            os.rename(tmp, path)
        return True
    except OSError:
        return False


def merge_defaults(target: dict[str, Any], defaults: dict[str, Any]) -> None:
    """Recursively fill missing keys in `target` from `defaults`."""
    for key, value in defaults.items():
        if key not in target:
            target[key] = value
        elif isinstance(value, dict) and isinstance(target[key], dict):
            merge_defaults(target[key], value)
