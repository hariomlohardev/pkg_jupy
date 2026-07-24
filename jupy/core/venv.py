import os
import subprocess
import sys
import venv

VENV_DIR = os.path.abspath(".jupy_env")


def ensure_virtualenv():
    """Ensure isolated .jupy_env virtual environment exists with jedi autocompletion."""
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

    # Auto-install Jedi for VS Code-like autocomplete
    try:
        subprocess.run([venv_python, "-c", "import jedi"], check=True, capture_output=True)
    except Exception:
        print("[Jupy] Installing jedi autocompletion engine into .jupy_env...")
        subprocess.run([venv_python, "-m", "pip", "install", "jedi"], capture_output=True)

    return venv_python, venv_bin


VENV_PYTHON, VENV_BIN = ensure_virtualenv()