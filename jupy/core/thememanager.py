"""
jupy/core/thememanager.py

Central manager for community themes from the themes_jupy registry.

Single source of truth: the CLI (cli.py) and the HTTP API (handlers.py)
both call into this module.  The front-end themeEngine.js is a pure
renderer — it receives parsed theme dicts and compiles them to CSS.

Storage layout (under envmanager.get_data_dir()):

    themes/<unique_name>/theme.yml      the theme tokens
    themes/<unique_name>/about.json     cached registry metadata
    cache/registry.json                 last-fetched registry (offline fallback)
    theme.json                          {"active": "<unique_name>"}
"""

import json
import os
import re
import shutil
import urllib.error
import urllib.request

from jupy.core import envmanager
from jupy.core.themeschema import (
    UNIQUE_NAME_RE,
    validate_about,
    validate_theme_yml,
)

# ── configuration ─────────────────────────────────────────────────────
DEFAULT_REGISTRY_URL = (
    "https://hariomlohardev.github.io/themes_jupy/registry.json"
)
_REGISTRY_URL = os.environ.get("JUPY_THEMES_REGISTRY", DEFAULT_REGISTRY_URL)

MAX_THEME_YML_BYTES = 100 * 1024       # 100 KB
MAX_REGISTRY_BYTES = 2 * 1024 * 1024   # 2 MB
FETCH_TIMEOUT = 10                      # seconds


# ── paths ─────────────────────────────────────────────────────────────

def get_themes_dir():
    """``<data_dir>/themes/`` — one sub-folder per installed theme."""
    path = os.path.join(envmanager.get_data_dir(), "themes")
    os.makedirs(path, exist_ok=True)
    return path


def get_cache_dir():
    path = os.path.join(envmanager.get_data_dir(), "cache")
    os.makedirs(path, exist_ok=True)
    return path


def get_cache_path():
    return os.path.join(get_cache_dir(), "registry.json")


def _active_path():
    return os.path.join(envmanager.get_data_dir(), "theme.json")


# ── YAML helper ───────────────────────────────────────────────────────

def _load_yaml(text):
    """Parse YAML with ``yaml.safe_load``.  Raises a clear ImportError
    message if PyYAML is missing."""
    try:
        import yaml
    except ImportError:
        raise ImportError(
            "PyYAML is required for theme management. "
            "Install it with:  pip install pyyaml"
        ) from None
    return yaml.safe_load(text)


# ── network helpers ───────────────────────────────────────────────────

def _https_get(url, max_bytes):
    """GET *url* over HTTPS with a size cap.  Returns ``bytes``."""
    if not url.startswith("https://"):
        raise ValueError(f"Refusing non-HTTPS URL: {url}")
    req = urllib.request.Request(
        url, headers={"User-Agent": "Jupy-ThemeFetcher/1.0"}
    )
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
        data = resp.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError(
            f"Response from {url} exceeds {max_bytes:,} byte limit"
        )
    return data


# ── registry ──────────────────────────────────────────────────────────

def fetch_registry(force=False):
    """
    Fetch the remote ``registry.json``.  Writes a local cache copy.
    On network failure falls back to the cached copy.

    Returns the registry dict with an extra ``"cached": bool`` flag.
    """
    cache_path = get_cache_path()

    # serve cache unless forced
    if not force and os.path.isfile(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["cached"] = True
            return data
        except Exception:
            pass  # corrupt cache → try network

    try:
        raw = _https_get(_REGISTRY_URL, MAX_REGISTRY_BYTES)
        data = json.loads(raw.decode("utf-8"))
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        data["cached"] = False
        return data
    except Exception as e:
        # fall back to cache
        if os.path.isfile(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                data["cached"] = True
                return data
            except Exception:
                pass
        raise RuntimeError(
            f"Could not fetch theme registry and no local cache "
            f"exists: {e}"
        ) from e


def search_registry(query):
    """Case-insensitive search across name / description / tags / author."""
    registry = fetch_registry()
    q = query.lower()
    results = []
    for entry in registry.get("themes", []):
        haystack = " ".join([
            entry.get("name", ""),
            entry.get("description", ""),
            entry.get("author", {}).get("github", ""),
            " ".join(entry.get("tags", [])),
        ]).lower()
        if q in haystack:
            results.append(entry)
    return results


def get_registry_entry(unique_name):
    """Return the registry entry for *unique_name*, or ``None``."""
    registry = fetch_registry()
    for entry in registry.get("themes", []):
        if entry.get("unique_name") == unique_name:
            return entry
    return None


# ── installed themes ──────────────────────────────────────────────────

def list_installed():
    """``[{unique_name, name, version, author, active}, …]``"""
    themes_dir = get_themes_dir()
    active = get_active_name()
    result = []
    try:
        for entry in sorted(os.listdir(themes_dir)):
            about_path = os.path.join(themes_dir, entry, "about.json")
            if not os.path.isfile(about_path):
                continue
            try:
                with open(about_path, "r", encoding="utf-8") as f:
                    about = json.load(f)
            except Exception:
                continue
            result.append({
                "unique_name": entry,
                "name": about.get("name", entry),
                "version": about.get("version", "?"),
                "author": about.get("author", {}).get("github", "?"),
                "active": entry == active,
            })
    except FileNotFoundError:
        pass
    return result


def get_installed(unique_name):
    """``{"about": dict|None, "theme": dict}`` for one installed theme,
    or ``None`` if not installed."""
    _check_unique_name(unique_name)
    theme_dir = os.path.join(get_themes_dir(), unique_name)
    yml_path = os.path.join(theme_dir, "theme.yml")
    about_path = os.path.join(theme_dir, "about.json")
    if not os.path.isfile(yml_path):
        return None
    with open(yml_path, "r", encoding="utf-8") as f:
        theme = _load_yaml(f.read())
    about = None
    if os.path.isfile(about_path):
        try:
            with open(about_path, "r", encoding="utf-8") as f:
                about = json.load(f)
        except Exception:
            pass
    return {"about": about, "theme": theme}


# ── install / remove / update ─────────────────────────────────────────

def install_from_registry(unique_name, activate=True):
    """Download → validate → install → optionally activate."""
    _check_unique_name(unique_name)
    entry = get_registry_entry(unique_name)
    if entry is None:
        raise ValueError(f'Theme "{unique_name}" not found in registry.')

    yml_url = (entry.get("urls") or {}).get("yml")
    if not yml_url:
        raise ValueError(
            f'Registry entry for "{unique_name}" has no urls.yml field.'
        )

    raw = _https_get(yml_url, MAX_THEME_YML_BYTES)
    yml_text = raw.decode("utf-8")

    about = {
        "unique_name": unique_name,
        "name": entry.get("name", unique_name),
        "version": entry.get("version", "0.0.0"),
        "description": entry.get("description", ""),
        "author": entry.get("author", {}),
        "tags": entry.get("tags", []),
        "urls": entry.get("urls", {}),
    }
    return install_from_yml(yml_text, about=about, activate=activate)


def install_from_file(path, activate=True):
    """Install from a local ``.yml`` / ``.yaml`` file."""
    with open(path, "r", encoding="utf-8") as f:
        yml_text = f.read()
    base = os.path.splitext(os.path.basename(path))[0]
    unique_name = re.sub(r"[^a-z0-9-]", "-", base.lower()).strip("-")
    unique_name = unique_name or "custom-theme"
    about = {
        "unique_name": unique_name,
        "name": unique_name,
        "version": "0.0.0",
        "description": "Locally installed theme",
        "author": {"github": "local"},
    }
    return install_from_yml(yml_text, about=about, activate=activate)


def install_from_yml(yml_text, about=None, activate=True):
    """
    Validate and write a theme from raw YAML text.

    Raises ``ValueError`` (with the error list) if validation fails —
    nothing is written to disk in that case.

    Returns the *about* dict on success.
    """
    theme = _load_yaml(yml_text)

    # validate theme tokens
    result = validate_theme_yml(theme)
    if not result["ok"]:
        raise ValueError(
            "Theme validation failed:\n"
            + "\n".join(f"  ✕ {e}" for e in result["errors"])
        )

    # validate about metadata (if supplied)
    if about:
        about_result = validate_about(about)
        if not about_result["ok"]:
            raise ValueError(
                "about.json validation failed:\n"
                + "\n".join(f"  ✕ {e}" for e in about_result["errors"])
            )

    unique_name = (
        (about or {}).get("unique_name")
        or re.sub(r"[^a-z0-9-]", "-",
                  theme.get("name", "custom").lower()).strip("-")
        or "custom-theme"
    )
    _check_unique_name(unique_name)

    # write to disk
    theme_dir = os.path.join(get_themes_dir(), unique_name)
    os.makedirs(theme_dir, exist_ok=True)

    with open(os.path.join(theme_dir, "theme.yml"), "w",
              encoding="utf-8") as f:
        f.write(yml_text)

    if about:
        with open(os.path.join(theme_dir, "about.json"), "w",
                  encoding="utf-8") as f:
            json.dump(about, f, indent=2)

    if activate:
        set_active(unique_name)

    return about or {
        "unique_name": unique_name,
        "name": theme.get("name", unique_name),
    }


def remove_theme(unique_name):
    """Uninstall.  If it was active → fall back to default."""
    _check_unique_name(unique_name)
    theme_dir = os.path.join(get_themes_dir(), unique_name)
    if not os.path.isdir(theme_dir):
        return False
    shutil.rmtree(theme_dir)
    if get_active_name() == unique_name:
        set_active(None)
    return True


def update_theme(unique_name=None):
    """Re-download one theme (or all installed) from the registry.

    Returns ``[{unique_name, success, error?}, …]``.
    """
    results = []
    targets = (
        [unique_name] if unique_name
        else [t["unique_name"] for t in list_installed()]
    )
    for name in targets:
        try:
            install_from_registry(name, activate=(name == get_active_name()))
            results.append({"unique_name": name, "success": True})
        except Exception as e:
            results.append({
                "unique_name": name, "success": False, "error": str(e),
            })
    return results


# ── active theme ──────────────────────────────────────────────────────

def get_active_name():
    """Active theme's ``unique_name``, or ``None`` (= built-in default)."""
    path = _active_path()
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        name = data.get("active")
        if name and name != "__default__":
            if os.path.isdir(os.path.join(get_themes_dir(), name)):
                return name
        return None
    except Exception:
        return None


def set_active(unique_name):
    """Set the active theme.  ``None`` resets to the built-in default."""
    path = _active_path()
    data = {"active": unique_name or "__default__"}
    if unique_name is not None:
        _check_unique_name(unique_name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_active_theme():
    """
    Parsed theme dict for the active theme, or ``None``
    (= front-end should use ``DEFAULT_THEME``).
    """
    name = get_active_name()
    if name is None:
        return None
    installed = get_installed(name)
    if installed is None:
        return None
    return installed["theme"]


# ── internal ──────────────────────────────────────────────────────────

def _check_unique_name(unique_name):
    """Raise ``ValueError`` if *unique_name* is not filesystem-safe."""
    if not unique_name or not UNIQUE_NAME_RE.match(unique_name):
        raise ValueError(
            f'Invalid unique_name "{unique_name}". '
            f"Must match ^[a-z0-9]+(-[a-z0-9]+)*$."
        )