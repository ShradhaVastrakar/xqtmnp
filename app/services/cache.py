"""Simple file-based JSON cache for downloaded Elexon rows."""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class FileCache:
    def __init__(self, directory: str) -> None:
        self._dir = Path(directory)

    @property
    def _path(self) -> Path:
        return self._dir / "elexon_wind.json"

    def load(self, fingerprint: str) -> dict[str, Any] | None:
        """Return the cached payload if present, readable and for the same query."""
        try:
            payload = json.loads(self._path.read_text())
            if payload.get("fingerprint") != fingerprint:
                return None
            payload["fetched_at"] = datetime.fromisoformat(payload["fetched_at"])
            return payload
        except (OSError, ValueError, KeyError):
            return None

    def save(self, fingerprint: str, forecasts: list, actuals: list, fetched_at: datetime) -> None:
        """Atomic write; a failure to cache is non-fatal (read-only filesystems)."""
        payload = {
            "fingerprint": fingerprint,
            "fetched_at": fetched_at.astimezone(timezone.utc).isoformat(),
            "forecasts": forecasts,
            "actuals": actuals,
        }
        try:
            self._dir.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=self._dir, suffix=".tmp")
            with os.fdopen(fd, "w") as fh:
                json.dump(payload, fh)
            os.replace(tmp, self._path)
        except OSError:
            pass
