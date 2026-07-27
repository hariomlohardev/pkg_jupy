"""Standalone smoke-test for Phase 1 (themeschema + thememanager)."""
import json, os, sys, tempfile

# make sure the package is importable
sys.path.insert(0, os.path.dirname(__file__))

from jupy.core.themeschema import validate_theme_yml, validate_about, is_valid_color
from jupy.core import thememanager

# ── 1. schema validation ──────────────────────────────────────────────
good_theme = {
    "name": "Test Theme",
    "colors": {
        "light": {
            "primary": "#DD614C", "secondary": "#DAA144",
            "success": "#16A34A", "warning": "#D97706", "danger": "#DC2626",
            "surface": "#FFFFFF", "text": "#111827", "bg_well": "#F3F4F6",
            "border": "#111827", "shadow": "#111827",
        }
    },
    "shape": {"shadow_style": "hard"},
    "density": "comfortable",
}
r = validate_theme_yml(good_theme)
assert r["ok"], f"good theme should pass: {r['errors']}"
print("✓ validate_theme_yml (valid)   OK")

bad_theme = {"colors": {"light": {"primary": "not-a-color"}}}
r = validate_theme_yml(bad_theme)
assert not r["ok"]
print("✓ validate_theme_yml (invalid) OK")

assert is_valid_color("#FFF")
assert is_valid_color("#DD614C")
assert is_valid_color("rgba(0,0,0,0.5)")
assert is_valid_color("var(--color-primary)")
assert not is_valid_color("nope")
print("✓ is_valid_color               OK")

good_about = {
    "name": "Test", "unique_name": "test-theme", "version": "1.0.0",
    "description": "A perfectly valid test theme.", "author": {"github": "me"},
}
r = validate_about(good_about)
assert r["ok"], f"good about should pass: {r['errors']}"
print("✓ validate_about (valid)       OK")

# ── 2. install from YAML text (no network) ────────────────────────────
import yaml
yml_text = yaml.dump(good_theme, default_flow_style=False)

info = thememanager.install_from_yml(
    yml_text,
    about=good_about,
    activate=True,
)
print(f"✓ install_from_yml             OK  → {info['unique_name']}")

# ── 3. list / active / get ────────────────────────────────────────────
installed = thememanager.list_installed()
assert any(t["unique_name"] == "test-theme" for t in installed)
print(f"✓ list_installed               OK  → {len(installed)} theme(s)")

assert thememanager.get_active_name() == "test-theme"
print("✓ get_active_name              OK")

active = thememanager.get_active_theme()
assert active is not None and active["name"] == "Test Theme"
print("✓ get_active_theme             OK")

# ── 4. remove ─────────────────────────────────────────────────────────
assert thememanager.remove_theme("test-theme")
assert thememanager.get_active_name() is None
assert thememanager.get_active_theme() is None
print("✓ remove_theme                 OK  (active fell back to default)")

print("\n🎉 Phase 1 — all checks passed.")