"""
jupy/cli_theme.py

CLI theme management for Jupy.

Adds:
    jupy theme list [--all]
    jupy theme search <query>
    jupy theme info <name>
    jupy theme add <name>
    jupy theme add --file <path.yml>
    jupy theme remove <name>
    jupy theme use <name>
    jupy theme update [name]
    jupy theme path
"""

import argparse
import json
import sys


def _print_error(msg):
    print(f"[theme] ERROR: {msg}", file=sys.stderr)


def _author_name(entry):
    author = entry.get("author")
    if isinstance(author, dict):
        return author.get("github", "?")
    return str(author or "?")


def _entry_line(entry, indent="  "):
    unique_name = entry.get("unique_name", "?")
    name = entry.get("name", "?")
    author = _author_name(entry)
    version = entry.get("version", "?")
    return f"{indent}{unique_name:<24} {name:<24} @{author:<16} v{version}"


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_list(args):
    from jupy.core import thememanager

    installed = thememanager.list_installed()
    active = thememanager.get_active_name()

    print("Installed themes:")
    if not installed:
        print("  (none)")

    for t in installed:
        mark = "*" if t.get("unique_name") == active or t.get("active") else " "
        print(
            f" {mark} {t.get('unique_name','?'):<24} "
            f"{t.get('name','?'):<24} "
            f"@{t.get('author','?'):<16} "
            f"v{t.get('version','?')}"
        )

    if args.all:
        print("\nRemote registry:")
        try:
            registry = thememanager.fetch_registry(force=False)
            themes = registry.get("themes", [])

            if not themes:
                print("  (empty registry)")

            for entry in themes:
                print(_entry_line(entry, indent="   "))

            if registry.get("cached"):
                print("\n  (using cached registry — offline?)")

        except Exception as e:
            _print_error(f"could not fetch registry: {e}")
            return 1

    return 0


def cmd_search(args):
    from jupy.core import thememanager

    try:
        results = thememanager.search_registry(args.query)
    except Exception as e:
        _print_error(e)
        return 1

    if not results:
        print(f"No registry themes matched: {args.query}")
        return 0

    print(f"Registry results for: {args.query}\n")
    for entry in results:
        print(_entry_line(entry, indent=""))
        desc = entry.get("description")
        if desc:
            print(f"    {desc}")
        tags = entry.get("tags")
        if tags:
            print(f"    tags: {', '.join(tags)}")
        print()

    return 0


def cmd_info(args):
    from jupy.core import thememanager

    installed = thememanager.get_installed(args.name)

    if installed:
        print("Installed theme:\n")
        print(json.dumps(installed.get("about") or {}, indent=2))

        theme = installed.get("theme") or {}
        colors = theme.get("colors") or {}
        light = colors.get("light") or {}

        if light:
            print("\nPalette (light):")
            for key in (
                "primary",
                "secondary",
                "success",
                "warning",
                "danger",
                "surface",
                "text",
                "bg_well",
                "border",
                "shadow",
            ):
                if key in light:
                    print(f"  {key:<10} {light[key]}")

        return 0

    try:
        entry = thememanager.get_registry_entry(args.name)
    except Exception as e:
        _print_error(e)
        return 1

    if not entry:
        _print_error(f"theme '{args.name}' not found installed or in registry")
        return 1

    print("Registry theme:\n")
    print(json.dumps(entry, indent=2))
    return 0


def cmd_add(args):
    if not args.name and not args.file:
        _print_error("provide a theme name or --file <path>")
        return 2

    from jupy.core import thememanager

    activate = not args.no_activate

    try:
        if args.file:
            print(f"→ installing from file: {args.file}")
            about = thememanager.install_from_file(args.file, activate=activate)
        else:
            print("→ fetching registry…")
            about = thememanager.install_from_registry(args.name, activate=activate)

        print(f"✓ installed: {about.get('unique_name')}")

        if activate:
            print(f"✓ activated: {about.get('name', about.get('unique_name'))}")
            print("Reload Jupy in the browser or open the 🎨 panel to see it.")

        return 0

    except Exception as e:
        _print_error(e)
        return 1


def cmd_remove(args):
    from jupy.core import thememanager

    try:
        ok = thememanager.remove_theme(args.name)
        if not ok:
            _print_error(f"theme '{args.name}' is not installed")
            return 1

        print(f"✓ removed: {args.name}")
        return 0

    except Exception as e:
        _print_error(e)
        return 1


def cmd_use(args):
    from jupy.core import thememanager

    try:
        if args.name in ("default", "__default__"):
            thememanager.set_active(None)
            print("Active theme reset to built-in default.")
            return 0

        installed = thememanager.get_installed(args.name)
        if installed is None:
            _print_error(f"theme '{args.name}' is not installed")
            return 1

        thememanager.set_active(args.name)
        print(f"✓ active theme: {args.name}")
        print("Reload Jupy in the browser or open the 🎨 panel to see it.")
        return 0

    except Exception as e:
        _print_error(e)
        return 1


def cmd_update(args):
    from jupy.core import thememanager

    try:
        results = thememanager.update_theme(args.name)

        if not results:
            print("No installed themes to update.")
            return 0

        ok = True
        for r in results:
            if r.get("success"):
                print(f"✓ updated: {r.get('unique_name')}")
            else:
                ok = False
                print(
                    f"✕ failed: {r.get('unique_name')} — {r.get('error', 'unknown error')}",
                    file=sys.stderr,
                )

        return 0 if ok else 1

    except Exception as e:
        _print_error(e)
        return 1


def cmd_path(args):
    from jupy.core import thememanager

    print(thememanager.get_themes_dir())
    return 0


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def theme_main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)

    parser = argparse.ArgumentParser(
        prog="jupy theme",
        description="Manage Jupy community themes",
    )

    sub = parser.add_subparsers(dest="cmd")

    # list
    p_list = sub.add_parser("list", help="List installed themes")
    p_list.add_argument(
        "--all",
        action="store_true",
        help="Also list remote registry themes",
    )
    p_list.set_defaults(func=cmd_list)

    # search
    p_search = sub.add_parser("search", help="Search remote registry")
    p_search.add_argument("query")
    p_search.set_defaults(func=cmd_search)

    # info
    p_info = sub.add_parser("info", help="Show theme details")
    p_info.add_argument("name")
    p_info.set_defaults(func=cmd_info)

    # add
    p_add = sub.add_parser("add", help="Install a theme")
    p_add.add_argument("name", nargs="?", default=None)
    p_add.add_argument("--file", default=None, help="Install from local .yml/.yaml file")
    p_add.add_argument(
        "--no-activate",
        action="store_true",
        help="Install but do not activate",
    )
    p_add.set_defaults(func=cmd_add)

    # remove
    p_remove = sub.add_parser("remove", help="Uninstall a theme")
    p_remove.add_argument("name")
    p_remove.set_defaults(func=cmd_remove)

    # use
    p_use = sub.add_parser("use", help="Activate an installed theme")
    p_use.add_argument("name")
    p_use.set_defaults(func=cmd_use)

    # update
    p_update = sub.add_parser("update", help="Update one or all installed themes")
    p_update.add_argument("name", nargs="?", default=None)
    p_update.set_defaults(func=cmd_update)

    # path
    p_path = sub.add_parser("path", help="Print theme storage directory")
    p_path.set_defaults(func=cmd_path)

    args = parser.parse_args(argv)

    if not getattr(args, "func", None):
        parser.print_help()
        return 0

    try:
        return args.func(args) or 0
    except KeyboardInterrupt:
        print("\nInterrupted.")
        return 130
    except Exception as e:
        _print_error(e)
        return 1


# ---------------------------------------------------------------------------
# Integration helper for a subparser-based cli.py
# ---------------------------------------------------------------------------

def register_theme_command(subparsers):
    """
    If your cli.py already uses argparse subparsers, call:

        from jupy.cli_theme import register_theme_command
        register_theme_command(sub)

    where `sub` is your subparsers object.
    """
    p = subparsers.add_parser(
        "theme",
        help="Manage community themes",
        add_help=False,
    )
    p.add_argument("theme_args", nargs=argparse.REMAINDER)
    p.set_defaults(func=lambda args: theme_main(args.theme_args))


if __name__ == "__main__":
    sys.exit(theme_main())