#!/usr/bin/env python3
"""
jupy_themes.py — standalone prototype for searching & fetching themes
from the themes_jupy registry.

This is NOT part of Jupy (yet). It's a working demo of the exact flow
Jupy will use later:  registry.json  ->  search  ->  fetch theme.yml.

Usage:
    python jupy_themes.py list
    python jupy_themes.py search nord
    python jupy_themes.py info nord-frost
    python jupy_themes.py fetch nord-frost
    python jupy_themes.py fetch nord-frost --dir ./my_themes

No dependencies — uses only the Python standard library.
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# Where the registry lives (change these if you move the repo)
# ---------------------------------------------------------------------------
OWNER = "hariomlohardev"
REPO = "themes_jupy"
BRANCH = "main"

REGISTRY_URL = f"https://{OWNER}.github.io/{REPO}/registry.json"
RAW_BASE = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/{BRANCH}"
PAGES_BASE = f"https://{OWNER}.github.io/{REPO}"

DEFAULT_DEST = "./fetched_themes"


# ---------------------------------------------------------------------------
# Tiny terminal colors (auto-disabled when not a real terminal)
# ---------------------------------------------------------------------------
_USE_COLOR = sys.stdout.isatty()

def _c(code, text):
    return f"\033[{code}m{text}\033[0m" if _USE_COLOR else text

def bold(t):   return _c("1", t)
def dim(t):    return _c("2", t)
def red(t):    return _c("31", t)
def green(t):  return _c("32", t)
def yellow(t): return _c("33", t)
def cyan(t):   return _c("36", t)


# ---------------------------------------------------------------------------
# Networking helpers
# ---------------------------------------------------------------------------
def fetch_json(url):
    """GET a URL and parse it as JSON. Raises RuntimeError with a clear message."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "jupy-themes/0.1"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} fetching {url}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Could not reach {url} ({e.reason})") from e
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Registry at {url} is not valid JSON") from e


def download_file(url, dest_path):
    """Download a file to dest_path. Returns the number of bytes written."""
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "jupy-themes/0.1"})
    with urllib.request.urlopen(req, timeout=30) as resp, open(dest_path, "wb") as f:
        total = 0
        while True:
            chunk = resp.read(8192)
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)
    return total


# ---------------------------------------------------------------------------
# Registry access
# ---------------------------------------------------------------------------
def load_registry():
    reg = fetch_json(REGISTRY_URL)
    reg.setdefault("themes", [])
    return reg


def theme_urls(theme):
    """Return the file URLs for a theme, falling back to constructed paths
    if the registry entry is missing them."""
    name = theme["unique_name"]
    urls = theme.get("urls", {})
    return {
        "yml":     urls.get("yml",     f"{RAW_BASE}/themes/{name}/theme.yml"),
        "about":   urls.get("about",   f"{RAW_BASE}/themes/{name}/about.json"),
        "preview": urls.get("preview", f"{PAGES_BASE}/themes/{name}/preview.png"),
        "folder":  urls.get("folder",  f"https://github.com/{OWNER}/{REPO}/tree/{BRANCH}/themes/{name}"),
    }


def find_theme(registry, unique_name):
    for t in registry["themes"]:
        if t["unique_name"] == unique_name:
            return t
    return None


def search_themes(registry, query):
    q = query.lower()
    results = []
    for t in registry["themes"]:
        haystack = " ".join([
            t.get("name", ""),
            t.get("unique_name", ""),
            t.get("description", ""),
            t.get("author", {}).get("github", ""),
            t.get("author", {}).get("display_name", ""),
            " ".join(t.get("tags", [])),
        ]).lower()
        if q in haystack:
            results.append(t)
    return results


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------
def print_theme_table(themes):
    if not themes:
        print(dim("  (no themes found)"))
        return

    headers = ["UNIQUE NAME", "NAME", "AUTHOR", "VERSION", "TAGS"]
    rows = []
    for t in themes:
        rows.append([
            t.get("unique_name", ""),
            t.get("name", ""),
            "@" + t.get("author", {}).get("github", "?"),
            "v" + str(t.get("version", "?")),
            ", ".join(t.get("tags", [])) or dim("—"),
        ])

    widths = [max(len(headers[i]), *(len(r[i]) for r in rows)) for i in range(len(headers))]

    def fmt_row(cells, style=None):
        line = "  ".join(str(c).ljust(widths[i]) for i, c in enumerate(cells))
        return style(line) if style else line

    print(bold(fmt_row(headers)))
    print(dim("  ".join("─" * w for w in widths)))
    for r in rows:
        # highlight the unique name column
        r[0] = cyan(r[0])
        print(fmt_row(r))


def print_theme_info(theme):
    urls = theme_urls(theme)
    author = theme.get("author", {})
    print()
    print(bold(f"  {theme.get('name', theme['unique_name'])}") + dim(f"  ({theme['unique_name']})"))
    print(dim("  " + "─" * 46))
    print(f"  {bold('unique_name')}: {cyan(theme['unique_name'])}")
    print(f"  {bold('version')}    : v{theme.get('version', '?')}")
    print(f"  {bold('author')}     : {author.get('display_name', author.get('github', '?'))} "
          + dim(f"(@{author.get('github', '?')})"))
    if author.get("bio"):
        print(f"  {bold('bio')}        : {author['bio']}")
    print(f"  {bold('tags')}       : {', '.join(theme.get('tags', [])) or dim('—')}")
    print(f"  {bold('license')}    : {theme.get('license', 'MIT')}")
    print(f"  {bold('added')}      : {theme.get('added_at', '?')}")
    print(f"  {bold('description')}: {theme.get('description', '')}")
    print()
    print(f"  {bold('install')}    : {green('jupy theme add ' + theme['unique_name'])}")
    print(f"  {bold('theme.yml')}  : {urls['yml']}")
    print(f"  {bold('source')}     : {urls['folder']}")
    print()


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
def cmd_list(args):
    reg = load_registry()
    n = len(reg["themes"])
    print()
    print(bold(f"  JUPY THEMES REGISTRY") + dim(f"  ·  {n} theme{'s' if n != 1 else ''}"))
    print(dim(f"  {REGISTRY_URL}"))
    print()
    if n == 0:
        print(yellow("  The registry is empty. Add a theme via a PR to themes_jupy!"))
        return
    print_theme_table(reg["themes"])
    print()


def cmd_search(args):
    reg = load_registry()
    results = search_themes(reg, args.query)
    print()
    print(bold(f"  Search results for “{args.query}”") + dim(f"  ·  {len(results)} match{'es' if len(results) != 1 else ''}"))
    print()
    print_theme_table(results)
    print()


def cmd_info(args):
    reg = load_registry()
    theme = find_theme(reg, args.unique_name)
    if not theme:
        print(red(f"\n  ✕ Theme '{args.unique_name}' not found in the registry.\n"))
        print(dim("  Run `python jupy_themes.py list` to see available themes.\n"))
        sys.exit(1)
    print_theme_info(theme)


def cmd_fetch(args):
    reg = load_registry()
    theme = find_theme(reg, args.unique_name)
    if not theme:
        print(red(f"\n  ✕ Theme '{args.unique_name}' not found in the registry.\n"))
        sys.exit(1)

    urls = theme_urls(theme)
    dest_root = os.path.join(args.dir, theme["unique_name"])

    print()
    print(bold(f"  Fetching “{theme.get('name', theme['unique_name'])}”") + dim(f"  →  {dest_root}/"))
    print()

    # theme.yml is required; about.json & preview.png are best-effort extras
    targets = [
        ("theme.yml",   urls["yml"],     True),
        ("about.json",  urls["about"],   False),
        ("preview.png", urls["preview"], False),
    ]

    ok = True
    for filename, url, required in targets:
        dest = os.path.join(dest_root, filename)
        try:
            size = download_file(url, dest)
            print(f"  {green('✓')} {filename:<12} {dim(f'{size/1024:.1f} KB')}")
        except Exception as e:
            if required:
                print(f"  {red('✕')} {filename:<12} {red('FAILED')} — {e}")
                ok = False
            else:
                print(f"  {yellow('!')} {filename:<12} {dim('skipped (optional)')}")

    print()
    if ok:
        print(green(f"  ✓ Theme saved to {dest_root}/"))
        print(dim(f"    Later, Jupy will load this with:  jupy theme add {theme['unique_name']}"))
    else:
        print(red("  ✕ Could not fetch the theme."))
        sys.exit(1)
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        prog="jupy_themes",
        description="Search & fetch themes from the themes_jupy registry (standalone prototype).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="List every theme in the registry")

    p_search = sub.add_parser("search", help="Search themes by name/tag/author/description")
    p_search.add_argument("query")

    p_info = sub.add_parser("info", help="Show full details for one theme")
    p_info.add_argument("unique_name")

    p_fetch = sub.add_parser("fetch", help="Download a theme's files locally")
    p_fetch.add_argument("unique_name")
    p_fetch.add_argument("--dir", default=DEFAULT_DEST,
                         help=f"Destination folder (default: {DEFAULT_DEST})")

    args = parser.parse_args()

    try:
        {
            "list":   cmd_list,
            "search": cmd_search,
            "info":   cmd_info,
            "fetch":  cmd_fetch,
        }[args.command](args)
    except RuntimeError as e:
        print(red(f"\n  ✕ {e}\n"))
        sys.exit(1)
    except KeyboardInterrupt:
        print(dim("\n  cancelled."))
        sys.exit(130)


if __name__ == "__main__":
    main()