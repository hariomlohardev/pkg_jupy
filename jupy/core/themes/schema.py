"""
Theme parsing + validation. Mirrors the front-end validateTheme() and the
themes_jupy registry's scripts/validate_theme.py so CLI, backend, and browser
all agree on what a valid theme is.
"""
import json
import re

try:
    import yaml
except ImportError:
    yaml = None


class ThemeError(Exception):
    """Raised for any theme store / registry / validation failure."""


COLOR_KEYS = [
    "primary", "secondary", "success", "warning", "danger",
    "surface", "text", "bg_well", "border", "shadow",
    "on_primary", "on_secondary", "on_danger", "muted",
    "terminal_bg", "terminal_fg", "terminal_accent", "plot_bg",
    "primary_tint", "secondary_tint", "hover_tint",
]
REQUIRED_LIGHT_KEYS = [
    "primary", "secondary", "surface", "text", "bg_well", "border", "shadow",
]

_HEX_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_FUNC_RE = re.compile(r"^(rgba?|hsla?)\(", re.IGNORECASE)
_LENGTH_RE = re.compile(r"^\d+(\.\d+)?(px|em|rem|%|vh|vw)?$")


def _is_color(v):
    if not isinstance(v, str):
        return False
    s = v.strip()
    return bool(_HEX_RE.match(s) or _FUNC_RE.match(s) or s.startswith("var("))


def _is_length(v):
    return isinstance(v, str) and bool(_LENGTH_RE.match(v.strip()))


def parse_theme(text, filename="theme.yml"):
    """Parse a theme from YAML or JSON text into a dict."""
    name = (filename or "").lower()
    if name.endswith(".json"):
        try:
            return json.loads(text)
        except Exception as e:
            raise ThemeError(f"Invalid JSON theme: {e}")
    if yaml is None:
        try:
            return json.loads(text)
        except Exception:
            raise ThemeError(
                "PyYAML is required to read .yml themes. Install: pip install pyyaml"
            )
    try:
        data = yaml.safe_load(text)
    except Exception as e:
        raise ThemeError(f"Invalid YAML theme: {e}")
    if data is None:
        raise ThemeError("Theme file is empty.")
    return data


def validate_theme(theme):
    """Return (ok, errors, warnings) for a parsed theme dict."""
    errors = []
    warnings = []

    if not isinstance(theme, dict):
        return False, ["Theme did not parse to an object."], warnings

    if not theme.get("name") or not isinstance(theme.get("name"), str):
        errors.append("Missing required field: name")

    colors = theme.get("colors")
    if not isinstance(colors, dict) or not isinstance(colors.get("light"), dict):
        errors.append("Missing required section: colors.light")
    else:
        light = colors["light"]
        for k in REQUIRED_LIGHT_KEYS:
            if k not in light:
                errors.append(f"colors.light.{k} is required")
        for mode in ("light", "dark"):
            pal = colors.get(mode)
            if not isinstance(pal, dict):
                continue
            for k, v in pal.items():
                if k not in COLOR_KEYS:
                    warnings.append(f"colors.{mode}.{k} is not a recognized token (ignored)")
                    continue
                if not _is_color(v):
                    errors.append(f'colors.{mode}.{k} has invalid color "{v}"')

    shape = theme.get("shape")
    if isinstance(shape, dict):
        ss = shape.get("shadow_style")
        if ss is not None and ss not in ("hard", "soft", "none"):
            errors.append(f'shape.shadow_style must be hard, soft, or none (got "{ss}")')
        for k in ("radius_sm", "radius_md", "border_width"):
            if k in shape and not _is_length(shape[k]):
                errors.append(f'shape.{k} must be a length like "4px" (got "{shape[k]}")')

    density = theme.get("density")
    if density is not None and density not in ("compact", "comfortable", "spacious"):
        errors.append(f"density must be compact, comfortable, or spacious (got {density})")

    cells = theme.get("cells")
    if isinstance(cells, dict):
        card_shadow = (cells.get("card") or {}).get("shadow")
        if card_shadow is not None and card_shadow not in ("hard", "soft", "none"):
            errors.append(f'cells.card.shadow must be hard, soft, or none (got "{card_shadow}")')

    return (len(errors) == 0), errors, warnings