"""
jupy/core/envmanager.py

Central manager for Jupy's Python environments.

By default, the virtual environment used to run notebook cells lives in a
global, per-machine location outside any project folder (so `pip install jupy`
+ running `jupy` in any random folder never dumps a `.jupy_env/` next to the
user's files). Users can opt in, per-folder, to either:

  - "global"  (default) - a shared global env (envs/default), or any other
                           named global env they've created
  - "project"            - a `.jupy_env` folder local to the current working
                           directory, same as Jupy's old default behavior
  - "named"              - a specific named global env (e.g. "datasci")

The choice is remembered per-folder in `.jupy/config.json` (only written once
the user picks something other than the implicit global default, so a fresh
folder stays clean).

This module also keeps Jupy's own runtime dependencies (currently just
`psutil`, used for the CPU/RAM/GPU footer) separate from whichever venv is
running the user's notebook code — see `ensure_jupy_dependencies()`. Those are
installed into the interpreter that's running the Jupy server itself
(`sys.executable`), never into a user/project venv.
"""
import json
import os
import subprocess
import sys
import venv

APP_NAME = "Jupy"

# Packages Jupy itself needs to *run the server*, installed into sys.executable
# (the interpreter that launched `jupy`), never into a user/project venv.
JUPY_SERVER_DEPENDENCIES = ["psutil"]

# Packages installed into every *code* venv for Jupy's own features (currently
# just Jedi, needed in-process by the kernel worker for autocomplete against
# the user's actual installed packages/namespace). Filtered back out of the
# Pip Manager's package list so they don't clutter the user's view.
JUPY_ENV_DEPENDENCIES = ["jedi", "psutil"]
JUPY_INTERNAL_PACKAGE_NAMES = {"pip", "setuptools", "wheel", "jedi", "parso", "psutil"}

DEFAULT_ENV_NAME = "default"
PROJECT_CONFIG_DIR = ".jupy"
PROJECT_CONFIG_FILE = "config.json"


# ---------------------------------------------------------------------------
# Global data directory (OS-appropriate, outside any project folder)
# ---------------------------------------------------------------------------

def get_data_dir():
    """Returns the OS-appropriate global app-data directory for Jupy."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser(r"~\AppData\Local")
        path = os.path.join(base, APP_NAME)
    elif sys.platform == "darwin":
        path = os.path.expanduser(f"~/Library/Application Support/{APP_NAME}")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
        path = os.path.join(base, APP_NAME.lower())

    os.makedirs(path, exist_ok=True)
    return path


def get_envs_root():
    path = os.path.join(get_data_dir(), "envs")
    os.makedirs(path, exist_ok=True)
    return path


def get_global_env_path(name):
    safe = "".join(c for c in name if c.isalnum() or c in ("-", "_")) or DEFAULT_ENV_NAME
    return os.path.join(get_envs_root(), safe)


def get_project_env_path(cwd=None):
    return os.path.join(cwd or os.getcwd(), ".jupy_env")


# ---------------------------------------------------------------------------
# Per-folder config (which env this folder should use)
# ---------------------------------------------------------------------------

def _project_config_path(cwd=None):
    return os.path.join(cwd or os.getcwd(), PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE)


def load_project_config(cwd=None):
    cwd = cwd or os.getcwd()
    path = _project_config_path(cwd)

    if not os.path.exists(path):
        # Back-compat: a pre-existing project-local .jupy_env (Jupy's old
        # default behavior) means "stay put" rather than silently switching
        # this folder over to the new global default env.
        if os.path.isdir(get_project_env_path(cwd)):
            return {"env_mode": "project", "env_name": DEFAULT_ENV_NAME}
        return {"env_mode": "global", "env_name": DEFAULT_ENV_NAME}

    try:
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        cfg.setdefault("env_mode", "global")
        cfg.setdefault("env_name", DEFAULT_ENV_NAME)
        return cfg
    except Exception:
        return {"env_mode": "global", "env_name": DEFAULT_ENV_NAME}


def save_project_config(cfg, cwd=None):
    path = _project_config_path(cwd)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


# ---------------------------------------------------------------------------
# Venv creation / interpreter paths
# ---------------------------------------------------------------------------

def _interpreter_paths(env_dir):
    if sys.platform == "win32":
        return (
            os.path.join(env_dir, "Scripts", "python.exe"),
            os.path.join(env_dir, "Scripts"),
        )
    return (
        os.path.join(env_dir, "bin", "python"),
        os.path.join(env_dir, "bin"),
    )


def _venv_is_valid(env_dir):
    python, _ = _interpreter_paths(env_dir)
    return os.path.isfile(python)


def ensure_env(env_dir, on_progress=None):
    """Creates a venv at env_dir if missing *or incomplete*, installs Jupy's
    per-env deps (currently just Jedi, for in-process completions). Returns
    (python, bin). Raises RuntimeError with a clear, specific reason if the
    environment still isn't usable afterwards, instead of silently handing
    back a path to an interpreter that doesn't actually work."""
    if os.path.exists(env_dir) and not _venv_is_valid(env_dir):
        if on_progress:
            on_progress(f"Found an incomplete environment at {env_dir} — recreating…")
        try:
            import shutil
            shutil.rmtree(env_dir)
        except Exception as e:
            raise RuntimeError(
                f"Environment at {env_dir} is incomplete/broken and couldn't be "
                f"removed to recreate it: {e}. Try deleting that folder manually."
            ) from e

    if not os.path.exists(env_dir):
        if on_progress:
            on_progress(f"Creating environment at {env_dir}...")
        venv.create(env_dir, with_pip=True)

    python, binpath = _interpreter_paths(env_dir)

    if not os.path.isfile(python):
        raise RuntimeError(
            f"Failed to create a working Python environment at {env_dir} "
            f"(expected an interpreter at {python}, but it's missing). This "
            f"usually means venv creation was interrupted, or antivirus "
            f"software removed files right after creation."
        )

    try:
        subprocess.run([python, "-c", "import jedi"], check=True, capture_output=True)
    except Exception:
        if on_progress:
            on_progress("Installing completion engine...")
        subprocess.run([python, "-m", "pip", "install", "-q"] + JUPY_ENV_DEPENDENCIES, capture_output=True)

    return python, binpath


def ensure_jupy_dependencies():
    """Ensures Jupy's own server-side dependencies (psutil) are importable in
    the interpreter currently running the Jupy server (sys.executable) — the
    user's global Python, NOT any project/code venv. Installs them there if
    missing. Must be called before any module that imports these packages
    (e.g. core/metrics.py) is itself imported."""
    missing = []
    for pkg in JUPY_SERVER_DEPENDENCIES:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)

    if missing:
        print(f"[Jupy] Installing required packages into {sys.executable}: {', '.join(missing)}")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q"] + missing, capture_output=True)


# ---------------------------------------------------------------------------
# Listing global envs
# ---------------------------------------------------------------------------

def list_global_envs():
    root = get_envs_root()
    names = []
    try:
        for entry in sorted(os.listdir(root)):
            if os.path.isdir(os.path.join(root, entry)):
                names.append(entry)
    except Exception:
        pass
    if DEFAULT_ENV_NAME not in names:
        names.insert(0, DEFAULT_ENV_NAME)
    return names


def delete_global_env(name):
    if name == DEFAULT_ENV_NAME:
        return False, "Cannot delete the default environment."
    path = get_global_env_path(name)
    if not os.path.exists(path):
        return False, "Environment does not exist."
    try:
        import shutil
        shutil.rmtree(path)
        return True, ""
    except Exception as e:
        return False, str(e)


# ---------------------------------------------------------------------------
# Resolving / switching the active environment for the current folder
# ---------------------------------------------------------------------------

def resolve_active_env(on_progress=None):
    """Reads this folder's config (or defaults to the global 'default' env),
    ensures that env exists, and returns its info dict."""
    cfg = load_project_config()
    mode = cfg.get("env_mode", "global")
    name = cfg.get("env_name", DEFAULT_ENV_NAME)

    if mode == "project":
        env_dir = get_project_env_path()
        label = "This Folder (.jupy_env)"
    elif mode == "named":
        env_dir = get_global_env_path(name)
        label = f"Global: {name}"
    else:
        mode = "global"
        name = DEFAULT_ENV_NAME
        env_dir = get_global_env_path(DEFAULT_ENV_NAME)
        label = "Global: default"

    python, binpath = ensure_env(env_dir, on_progress=on_progress)

    return {
        "mode": mode,
        "name": name,
        "path": env_dir,
        "python": python,
        "bin": binpath,
        "label": label,
    }


def set_active_env(mode, name=None, on_progress=None):
    """Persists the folder's env choice and ensures it exists. Returns the
    resolved env info (same shape as resolve_active_env)."""
    if mode not in ("global", "project", "named"):
        raise ValueError(f"Invalid env mode: {mode}")

    cfg = {"env_mode": mode, "env_name": name or DEFAULT_ENV_NAME}
    save_project_config(cfg)
    return resolve_active_env(on_progress=on_progress)