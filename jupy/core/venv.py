import os
import sys
import venv

VENV_DIR = os.path.abspath(".jupy_env")

def ensure_virtualenv():
    """Ensure an isolated .jupy_env virtual environment exists."""
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

    return venv_python, venv_bin

VENV_PYTHON, VENV_BIN = ensure_virtualenv()