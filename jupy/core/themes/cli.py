"""
`jupy theme ...` command-line interface.
Self-contained argparse program; cli.py delegates here when argv[1] == "theme".
"""
import argparse
import json
import os
import sys

from .store import ThemeStore
from .schema import ThemeError


def _store():
    return ThemeStore()


def cmd_add(args):
    store = _store()
    meta = store.install(args.unique_name, activate=args.use, on_progress=lambda m: print(m))
    print(f"✓ Installed \"{meta.get('name', args.unique_name)}\" ({args.unique_name}) v{meta.get('version','?')}")
    if args.use:
        print(f"✓ Active theme → {meta.get('name', args.unique_name)}")
    return 0


def cmd_list(args):
    store = _store()
    installed = store.list_installed()
    active = store.get_active_name()
    if not installed:
        print("No themes installed. Try: jupy theme browse")
        return 0
    print("Installed themes (* = active):")
    for t in installed:
        mark = "*" if t["unique_name"] == active else " "
        print(f"  {mark} {t['unique_name']:<24} {str(t.get('name','')):<22} v{t.get('version','?')}")
    return 0


def cmd_browse(args):
    store = _store()
    themes = store.registry.get_themes(force=getattr(args, 'refresh', False))
    active = store.get_active_name()
    installed = {t["unique_name"] for t in store.list_installed()}
    if not themes:
        print("Registry is empty or unreachable.")
        return 0
    print(f"Available themes ({len(themes)}):")
    for t in themes:
        state = " [installed]" if t.get("unique_name") in installed else ""
        mark = "*" if t.get("unique_name") == active else " "
        tags = ", ".join(t.get("tags", []) or [])
        print(f"  {mark} {t.get('unique_name','?'):<24} {str(t.get('name','')):<22} v{t.get('version','?')}  [{tags}]{state}")
    return 0


def cmd_search(args):
    store = _store()
    results = store.registry.search(args.query)
    if not results:
        print(f"No themes match '{args.query}'.")
        return 0
    print(f"Search results for '{args.query}':")
    for t in results:
        tags = ", ".join(t.get("tags", []) or [])
        print(f"  {t.get('unique_name','?'):<24} {str(t.get('name','')):<22} [{tags}]")
    return 0


def cmd_remove(args):
    _store().uninstall(args.unique_name)
    print(f"✓ Removed '{args.unique_name}'.")
    return 0


def cmd_use(args):
    _store().set_active(args.unique_name)
    print(f"✓ Active theme → {args.unique_name}")
    return 0


def cmd_current(args):
    active = _store().get_active_theme()
    if active["is_default"]:
        print("Active theme: Jupy default")
    else:
        print(f"Active theme: {active['theme'].get('name', active['unique_name'])} ({active['unique_name']})")
    return 0


def cmd_reset(args):
    _store().reset_active()
    print("✓ Reset to Jupy default theme.")
    return 0


def cmd_update(args):
    store = _store()
    if args.all:
        updated = store.update_all(on_progress=lambda m: print(m))
        print(f"✓ Updated {len(updated)} theme(s)." if updated else "Everything is up to date.")
        return 0
    if not args.unique_name:
        print("Specify a theme name or use --all.")
        return 2
    meta = store.update(args.unique_name)
    print(f"✓ Updated '{args.unique_name}' to v{meta.get('version','?')}.")
    return 0


def cmd_import(args):
    store = _store()
    with open(args.file, "r", encoding="utf-8") as f:
        text = f.read()
    info = store.install_from_text(text, filename=os.path.basename(args.file),
                                   unique_name=args.name, activate=args.use)
    print(f"✓ Imported \"{info['name']}\" ({info['unique_name']}).")
    if args.use:
        print(f"✓ Active theme → {info['name']}")
    return 0


def cmd_export(args):
    text = _store().export_theme(args.unique_name)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"✓ Exported to {args.output}")
    else:
        sys.stdout.write(text)
    return 0


def cmd_info(args):
    store = _store()
    if store.is_installed(args.unique_name):
        theme = store.get_theme(args.unique_name)
        meta = store._read_install_meta(args.unique_name)
        print(json.dumps({"installed": True, "install": meta, "theme": theme}, indent=2, default=str))
        return 0
    t = store.registry.find_theme(args.unique_name)
    print(json.dumps({"installed": False, "registry": t}, indent=2, default=str))
    return 0


def cmd_refresh(args):
    reg = _store().registry.fetch_registry(force=True)
    print(f"✓ Registry refreshed ({reg.get('count', len(reg.get('themes', [])))} themes).")
    return 0


def cmd_path(args):
    print(_store().base_dir)
    return 0


def cmd_new(args):
    name = args.unique_name
    author = args.author or "Your Name"
    target = os.path.join(os.getcwd(), name)
    if os.path.exists(target) and not args.force:
        print(f"Folder already exists: {target} (use --force)")
        return 1
    os.makedirs(target, exist_ok=True)
    theme_yml = f'''name: "{name.replace('-', ' ').title()}"
author: "{author}"
version: 1
shape:
  radius_sm: 4px
  radius_md: 6px
  border_width: 2px
  shadow_style: hard
density: comfortable
colors:
  light:
    primary: "#DD614C"
    secondary: "#DAA144"
    success: "#16A34A"
    warning: "#D97706"
    danger: "#DC2626"
    surface: "#FFFFFF"
    text: "#111827"
    bg_well: "#F3F4F6"
    border: "#111827"
    shadow: "#111827"
    on_primary: "#FFFFFF"
    on_secondary: "#111827"
    on_danger: "#FFFFFF"
    muted: "#6B7280"
    terminal_bg: "#09090B"
    terminal_fg: "#F9FAFB"
    terminal_accent: "#34D399"
    plot_bg: "#FFFFFF"
'''
    about = {
        "unique_name": name,
        "name": name.replace("-", " ").title(),
        "description": "A custom Jupy theme.",
        "author": {"github": author, "display_name": author},
        "tags": [],
        "license": "MIT",
    }
    with open(os.path.join(target, "theme.yml"), "w", encoding="utf-8") as f:
        f.write(theme_yml)
    with open(os.path.join(target, "about.json"), "w", encoding="utf-8") as f:
        json.dump(about, f, indent=2)
    print(f"✓ Scaffolded theme in {target}")
    print("  Add a preview.png (<=1MB), then open a PR to themes_jupy.")
    print(f"  Test locally: jupy theme import {os.path.join(target, 'theme.yml')} --use")
    return 0


def run_theme_command(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    p = argparse.ArgumentParser(prog="jupy theme", description="Manage Jupy community themes")
    sub = p.add_subparsers(dest="cmd", metavar="command")

    pa = sub.add_parser("add", help="Install a theme from the registry")
    pa.add_argument("unique_name")
    pa.add_argument("--use", action="store_true", help="Activate after installing")
    pa.set_defaults(func=cmd_add)

    pi = sub.add_parser("install", help="Alias for add")
    pi.add_argument("unique_name")
    pi.add_argument("--use", action="store_true")
    pi.set_defaults(func=cmd_add)

    pl = sub.add_parser("list", help="List installed themes")
    pl.set_defaults(func=cmd_list)

    pb = sub.add_parser("browse", help="List all registry themes")
    pb.add_argument("--refresh", action="store_true")
    pb.set_defaults(func=cmd_browse)

    pr = sub.add_parser("registry", help="Alias for browse")
    pr.set_defaults(func=cmd_browse)

    ps = sub.add_parser("search", help="Search the registry")
    ps.add_argument("query")
    ps.set_defaults(func=cmd_search)

    prm = sub.add_parser("remove", help="Uninstall a theme")
    prm.add_argument("unique_name")
    prm.set_defaults(func=cmd_remove)

    pu = sub.add_parser("uninstall", help="Alias for remove")
    pu.add_argument("unique_name")
    pu.set_defaults(func=cmd_remove)

    puse = sub.add_parser("use", help="Activate an installed theme")
    puse.add_argument("unique_name")
    puse.set_defaults(func=cmd_use)

    pc = sub.add_parser("current", help="Show the active theme")
    pc.set_defaults(func=cmd_current)

    preset = sub.add_parser("reset", help="Reset to the Jupy default theme")
    preset.set_defaults(func=cmd_reset)

    pup = sub.add_parser("update", help="Update theme(s)")
    pup.add_argument("unique_name", nargs="?")
    pup.add_argument("--all", action="store_true")
    pup.set_defaults(func=cmd_update)

    pim = sub.add_parser("import", help="Install from a local .yml/.json file")
    pim.add_argument("file")
    pim.add_argument("--name", default=None)
    pim.add_argument("--use", action="store_true")
    pim.set_defaults(func=cmd_import)

    pex = sub.add_parser("export", help="Export an installed theme")
    pex.add_argument("unique_name")
    pex.add_argument("-o", "--output", default=None)
    pex.set_defaults(func=cmd_export)

    pinf = sub.add_parser("info", help="Show details for a theme")
    pinf.add_argument("unique_name")
    pinf.set_defaults(func=cmd_info)

    pref = sub.add_parser("refresh", help="Force-refresh the registry cache")
    pref.set_defaults(func=cmd_refresh)

    ppath = sub.add_parser("path", help="Print the theme store directory")
    ppath.set_defaults(func=cmd_path)

    pn = sub.add_parser("new", help="Scaffold a new theme for contributors")
    pn.add_argument("unique_name")
    pn.add_argument("--author", default=None)
    pn.add_argument("--force", action="store_true")
    pn.set_defaults(func=cmd_new)

    args = p.parse_args(argv)
    if not getattr(args, "func", None):
        p.print_help()
        return 0
    try:
        return args.func(args) or 0
    except ThemeError as e:
        print(f"✗ {e}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nInterrupted.")
        return 130
    except Exception as e:
        print(f"✗ Error: {e}", file=sys.stderr)
        return 1