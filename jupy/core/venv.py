import json
import os
import subprocess
import sys
import venv

VENV_DIR = os.path.abspath(".jupy_env")


def ensure_virtualenv():
    """Ensure isolated .jupy_env virtual environment exists with psutil & jedi."""
    if not os.path.exists(VENV_DIR):
        print(f"[Jupy] Creating isolated virtual environment at {VENV_DIR}...")
        venv.create(VENV_DIR, with_pip=True)
        print("[Jupy] Virtual environment ready.")

    if sys.platform == "win32":
        venv_python = os.path.join(VENV_DIR, "Scripts", "python.exe")
        venv_bin = os.path.join(VENV_DIR, "Scripts")
    else:
        venv_python = os.path.join(VENV_DIR, "bin", "python")
        venv_bin = os.path.join(VENV_DIR, "bin")

    # Auto-install psutil and jedi
    try:
        subprocess.run([venv_python, "-c", "import psutil, jedi"], check=True, capture_output=True)
    except Exception:
        print("[Jupy] Installing core packages (psutil, jedi) into .jupy_env...")
        subprocess.run([venv_python, "-m", "pip", "install", "psutil", "jedi"], capture_output=True)

    return venv_python, venv_bin


VENV_PYTHON, VENV_BIN = ensure_virtualenv()


def list_packages():
    """Returns installed packages in .jupy_env as [{"name": ..., "version": ...}, ...], sorted by name."""
    try:
        result = subprocess.run(
            [VENV_PYTHON, "-m", "pip", "list", "--format=json"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return []
        packages = json.loads(result.stdout)
        packages.sort(key=lambda p: p["name"].lower())
        return packages
    except Exception:
        return ['ss']


def install_package(spec):
    """Installs a package (e.g. "requests" or "requests==2.32.0") into .jupy_env.
    Returns (success: bool, output: str) — output is combined stdout+stderr from pip."""
    spec = (spec or "").strip()
    if not spec:
        return False, "No package name given."
    try:
        result = subprocess.run(
            [VENV_PYTHON, "-m", "pip", "install", spec],
            capture_output=True, text=True, timeout=300
        )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, f"Timed out installing {spec} (5 min limit)."
    except Exception as e:
        return False, str(e)


def uninstall_package(name):
    """Uninstalls a package from .jupy_env. Returns (success: bool, output: str)."""
    name = (name or "").strip()
    if not name:
        return False, "No package name given."
    try:
        result = subprocess.run(
            [VENV_PYTHON, "-m", "pip", "uninstall", "-y", name],
            capture_output=True, text=True, timeout=60
        )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, f"Timed out uninstalling {name}."
    except Exception as e:
        return False, str(e)


def get_python_version():
    """Returns the .jupy_env interpreter's version string, e.g. 'Python 3.11.6'."""
    try:
        result = subprocess.run([VENV_PYTHON, "--version"], capture_output=True, text=True, timeout=5)
        return (result.stdout or result.stderr or "").strip()
    except Exception:
        return "unknown"
