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
import os
import shutil
from pathlib import Path

def clear_python_cache():
    # Gets the directory where this script is located
    root_dir = Path(__file__).resolve().parent
    print(f"Scanning for Python cache in: {root_dir}\n")
    
    deleted_folders = 0
    deleted_files = 0

    # Walk through all directories and files recursively
    for item in root_dir.rglob('*'):
        # 1. Target and delete __pycache__ directories
        if item.is_dir() and item.name == '__pycache__':
            try:
                shutil.rmtree(item)
                print(f"Removed folder: {item.relative_to(root_dir)}")
                deleted_folders += 1
            except Exception as e:
                print(f"Failed to delete folder {item}: {e}")
                
        # 2. Target and delete loose .pyc or .pyo files
        elif item.is_file() and item.suffix in ['.pyc', '.pyo']:
            try:
                item.unlink()
                print(f"Removed file:   {item.relative_to(root_dir)}")
                deleted_files += 1
            except Exception as e:
                print(f"Failed to delete file {item}: {e}")

    print(f"\nCleanup finished! Removed {deleted_folders} folders and {deleted_files} files.")

# if __name__ == "__main__":
#     clear_python_cache()

if __name__ == "__main__":
    clear_python_cache()
    main()