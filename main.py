"""
main.py - Direct entry point to launch Jupy locally without package installation.
Run with: python main.py
"""
import os
import shutil
import sys

# Ensure local package path is in Python path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

# Clear any stale compiled bytecode before importing. Editing .py files
# (especially by extracting a zip over an existing folder) can leave
# __pycache__/*.pyc files whose recorded source-mtime check doesn't catch
# the change, so Python keeps running the old cached bytecode instead of
# the file you just edited. Wiping __pycache__ on every launch guarantees
# a fresh compile from whatever's actually on disk.
def _clear_pycache(root):
    for dirpath, dirnames, _ in os.walk(root):
        if "__pycache__" in dirnames:
            shutil.rmtree(os.path.join(dirpath, "__pycache__"), ignore_errors=True)
            dirnames.remove("__pycache__")  # don't recurse into what we just deleted

_clear_pycache(os.path.join(BASE_DIR, "jupy"))

from jupy.cli import main

if __name__ == "__main__":
    main()