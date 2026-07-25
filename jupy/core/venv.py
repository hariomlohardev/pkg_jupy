"""
jupy/core/venv.py

Pip package operations (list/install/uninstall/version) against a given
Python interpreter path. Environment *location* and *selection* now lives in
core/envmanager.py — this module just operates on whatever interpreter it's
given, so it works the same whether that's the global default env, a
project-local env, or a named env.
"""
import json
import subprocess

from jupy.core.envmanager import JUPY_INTERNAL_PACKAGE_NAMES


def list_packages(python):
    """Returns installed packages for the given interpreter as
    [{"name": ..., "version": ...}, ...], sorted by name, with Jupy's own
    internal per-env packages (e.g. jedi) filtered out of the view."""
    try:
        result = subprocess.run(
            [python, "-m", "pip", "list", "--format=json"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return []
        packages = json.loads(result.stdout)
        packages = [p for p in packages if p["name"].lower() not in JUPY_INTERNAL_PACKAGE_NAMES]
        packages.sort(key=lambda p: p["name"].lower())
        return packages
    except Exception:
        return []


def install_package(python, spec):
    """Installs a package (e.g. "requests" or "requests==2.32.0").
    Returns (success: bool, output: str)."""
    spec = (spec or "").strip()
    if not spec:
        return False, "No package name given."
    try:
        result = subprocess.run(
            [python, "-m", "pip", "install", spec],
            capture_output=True, text=True, timeout=300
        )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, f"Timed out installing {spec} (5 min limit)."
    except Exception as e:
        return False, str(e)


def uninstall_package(python, name):
    """Uninstalls a package. Returns (success: bool, output: str)."""
    name = (name or "").strip()
    if not name:
        return False, "No package name given."
    if name.lower() in JUPY_INTERNAL_PACKAGE_NAMES:
        return False, f"{name} is managed by Jupy and can't be removed here."
    try:
        result = subprocess.run(
            [python, "-m", "pip", "uninstall", "-y", name],
            capture_output=True, text=True, timeout=60
        )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, f"Timed out uninstalling {name}."
    except Exception as e:
        return False, str(e)


def get_python_version(python):
    """Returns the interpreter's version string, e.g. 'Python 3.11.6'."""
    try:
        result = subprocess.run([python, "--version"], capture_output=True, text=True, timeout=5)
        return (result.stdout or result.stderr or "").strip()
    except Exception:
        return "unknown"