from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import yaml


@dataclass(frozen=True)
class Config:
    settings: Dict[str, Any]
    paths: Dict[str, Any]
    universes: Dict[str, Dict[str, Any]]


def repo_root() -> Path:
    # backend/scripts/utils.py -> repo root
    return Path(__file__).resolve().parents[2]


def load_config(path: Path | None = None) -> Config:
    if path is None:
        path = repo_root() / "universes_config.yml"
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return Config(
        settings=data.get("settings", {}),
        paths=data.get("paths", {}),
        universes=data.get("universes", {}),
    )


def ensure_dir(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p


def _safe_join_under_root(root: Path, rel: str) -> Path:
    """
    Join root + rel and ensure the resolved path remains under root.
    Prevents accidental '../' escaping (common CI bug).
    """
    root = root.resolve()
    target = (root / rel).resolve()
    if target == root or root in target.parents:
        return target
    raise RuntimeError(f"Configured path escapes repo root: {rel} -> {target}")


def artifacts_dir(cfg: Config) -> Path:
    root = repo_root()
    rel = str(cfg.paths.get("artifacts_dir", "artifacts"))
    return ensure_dir(_safe_join_under_root(root, rel))


def public_data_dir(cfg: Config) -> Path:
    root = repo_root()
    rel = str(cfg.paths.get("public_data_dir", "frontend/public/data"))
    return ensure_dir(_safe_join_under_root(root, rel))


def tickers_from_cfg(cfg: Config) -> List[str]:
    seen = set()
    out: List[str] = []
    for u in cfg.universes.values():
        for t in (u.get("tickers") or []):
            t = str(t).strip().upper()
            if t and t not in seen:
                seen.add(t)
                out.append(t)
    return out


def universe_map(cfg: Config) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    for key, u in cfg.universes.items():
        out[key] = [str(t).strip().upper() for t in (u.get("tickers") or []) if str(t).strip()]
    return out
