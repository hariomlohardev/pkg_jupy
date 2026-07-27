"""
jupy/core/themeschema.py

Pure validation for Jupy theme files (theme.yml) and registry metadata
(about.json).  Mirrors the registry's scripts/validate_theme.py and the
front-end themeEngine.js validateTheme() so all three give the same verdict.

⚠️  KEEP IN SYNC with:
    - themes_jupy/scripts/validate_theme.py   (registry-side validator)
    - static/js/theme/themeEngine.js          (front-end validateTheme)
"""

import re

# ── colour-token keys ─────────────────────────────────────────────────
REQUIRED_LIGHT_KEYS = [
    "primary", "secondary", "success", "warning", "danger",
    "surface", "text", "bg_well", "border", "shadow",
]

_OPTIONAL_COLOR_KEYS = [
    "on_primary", "on_secondary", "on_danger", "muted",
    "terminal_bg", "terminal_fg", "terminal_accent", "plot_bg",
    "primary_tint", "secondary_tint", "hover_tint",
]

ALLOWED_COLOR_KEYS = REQUIRED_LIGHT_KEYS + _OPTIONAL_COLOR_KEYS

# ── enums ─────────────────────────────────────────────────────────────
SHADOW_STYLES = ("hard", "soft", "none")
DENSITIES = ("compact", "comfortable", "spacious")

# ── compiled patterns ─────────────────────────────────────────────────
_HEX_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
_FUNC_RE = re.compile(r"^(rgba?|hsla?)\(.+\)$", re.IGNORECASE)
_VAR_RE = re.compile(r"^var\(--[a-zA-Z0-9-]+\)$")

UNIQUE_NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
SEMVER_RE = re.compile(
    r"^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$"
)


# ── public helpers ────────────────────────────────────────────────────

def is_valid_color(value):
    """True if *value* is hex, rgb()/rgba()/hsl()/hsla(), or var(--…)."""
    if not isinstance(value, str):
        return False
    s = value.strip()
    return bool(_HEX_RE.match(s) or _FUNC_RE.match(s) or _VAR_RE.match(s))


def validate_theme_yml(theme):
    """
    Validate a parsed theme.yml dict.

    Returns ``{"ok": bool, "errors": [...], "warnings": [...]}``.
    """
    errors = []
    warnings = []

    if not isinstance(theme, dict):
        return {"ok": False,
                "errors": ["Theme did not parse to a mapping."],
                "warnings": []}

    # -- name --
    if not theme.get("name") or not isinstance(theme["name"], str):
        errors.append("Missing required field: name")

    # -- colors.light / colors.dark --
    colors = theme.get("colors")
    if not isinstance(colors, dict) or not isinstance(colors.get("light"), dict):
        errors.append("Missing required section: colors.light")
    else:
        light = colors["light"]
        for key in REQUIRED_LIGHT_KEYS:
            if key not in light:
                errors.append(f"colors.light.{key} is required")

        for mode in ("light", "dark"):
            palette = colors.get(mode)
            if not isinstance(palette, dict):
                continue
            for key, val in palette.items():
                if key not in ALLOWED_COLOR_KEYS:
                    warnings.append(
                        f"colors.{mode}.{key} is not a recognized token (ignored)"
                    )
                    continue
                if not is_valid_color(val):
                    errors.append(
                        f'colors.{mode}.{key} has invalid color "{val}"'
                    )

    # -- shape --
    shape = theme.get("shape")
    if isinstance(shape, dict):
        ss = shape.get("shadow_style")
        if ss is not None and ss not in SHADOW_STYLES:
            errors.append(
                f"shape.shadow_style must be one of {SHADOW_STYLES} "
                f'(got "{ss}")'
            )
        for k in ("radius_sm", "radius_md", "border_width"):
            v = shape.get(k)
            if v is not None and not isinstance(v, (str, int, float)):
                errors.append(
                    f'shape.{k} must be a length like "4px" (got {v!r})'
                )

    # -- density --
    density = theme.get("density")
    if density is not None and density not in DENSITIES:
        errors.append(
            f"density must be one of {DENSITIES} "
            f'(got "{density}")'
        )

    # -- cells.card.shadow enum --
    cells = theme.get("cells")
    if isinstance(cells, dict):
        card = cells.get("card")
        if isinstance(card, dict):
            cs = card.get("shadow")
            if cs is not None and cs not in SHADOW_STYLES:
                errors.append(
                    f"cells.card.shadow must be one of {SHADOW_STYLES} "
                    f'(got "{cs}")'
                )

    return {"ok": len(errors) == 0, "errors": errors, "warnings": warnings}


def validate_about(about):
    """
    Validate a parsed about.json dict (registry metadata).

    Returns ``{"ok": bool, "errors": [...], "warnings": [...]}``.
    """
    errors = []
    warnings = []

    if not isinstance(about, dict):
        return {"ok": False,
                "errors": ["about.json did not parse to a mapping."],
                "warnings": []}

    # name
    if not about.get("name") or not isinstance(about["name"], str):
        errors.append("Missing required field: name")

    # unique_name
    un = about.get("unique_name")
    if not un or not isinstance(un, str):
        errors.append("Missing required field: unique_name")
    else:
        if len(un) > 40:
            errors.append(f"unique_name must be ≤ 40 chars (got {len(un)})")
        if not UNIQUE_NAME_RE.match(un):
            errors.append(
                f"unique_name must match ^[a-z0-9]+(-[a-z0-9]+)*$ "
                f'(got "{un}")'
            )

    # version (semver)
    ver = about.get("version")
    if not ver or not isinstance(ver, str):
        errors.append("Missing required field: version")
    elif not SEMVER_RE.match(ver):
        errors.append(f'version must be semver (got "{ver}")')

    # description  (10–200 chars)
    desc = about.get("description")
    if not desc or not isinstance(desc, str):
        errors.append("Missing required field: description")
    elif not (10 <= len(desc) <= 200):
        errors.append(
            f"description must be 10–200 chars (got {len(desc)})"
        )

    # author.github
    author = about.get("author")
    if not isinstance(author, dict) or not author.get("github"):
        errors.append("Missing required field: author.github")

    return {"ok": len(errors) == 0, "errors": errors, "warnings": warnings}