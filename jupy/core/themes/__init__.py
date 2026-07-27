"""
jupy/core/themes
Community theme store for Jupy — discovers, installs, manages, and applies
themes from the themes_jupy registry. The on-disk store under <data_dir>/themes
is the single source of truth shared by the CLI and the web UI.
"""
from .schema import ThemeError, parse_theme, validate_theme
from .registry import RegistryClient, DEFAULT_REGISTRY_URL
from .store import ThemeStore

__all__ = [
    "ThemeError", "parse_theme", "validate_theme",
    "RegistryClient", "ThemeStore", "DEFAULT_REGISTRY_URL",
]