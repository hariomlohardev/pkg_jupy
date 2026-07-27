<div align="center">

# 🟧 Jupy

### Brutalist Local Python Notebook

**A fast, self-contained notebook server with terminal, theme store, environments, debugger, widgets, and exports — all in one `pip install`.**

[![PyPI version](https://img.shields.io/pypi/v/jupy-notebook?color=DD614C&label=PyPI&style=flat-square)](https://pypi.org/project/jupy-notebook/)
[![Python](https://img.shields.io/pypi/pyversions/jupy-notebook?style=flat-square)](https://pypi.org/project/jupy-notebook/)
[![License: MIT](https://img.shields.io/badge/License-MIT-DAA144?style=flat-square)](https://opensource.org/licenses/MIT)
[![Downloads](https://img.shields.io/pypi/dm/jupy-notebook?style=flat-square)](https://pypi.org/project/jupy-notebook/)

</div>

---

<!-- 👉 ADD A SCREENSHOT HERE — this is the #1 thing that makes people install -->
<!-- ![Jupy Screenshot](https://raw.githubusercontent.com/hariomlohardev/jupy/main/docs/screenshot.png) -->

---

## ✨ Features

| Category | What you get |
|---|---|
| **Notebook** | Code cells, markdown cells, rich output, plots (matplotlib/plotly/bokeh/altair), MathJax, drag-and-drop reorder, cell folding, collapsible headings |
| **Terminal** | Real PTY terminal (xterm.js + ConPTY on Windows) — tab completion, arrow history, colors, vim, python REPL |
| **Theme Store** | Browse, install, and apply community themes from [themes_jupy](https://github.com/hariomlohardev/themes_jupy) — via CLI or the in-app 🎨 panel |
| **Environments** | Global, named, or per-project virtual environments — switch without restarting |
| **Pip Manager** | Install / uninstall / search packages from the UI or CLI |
| **Debugger** | Breakpoints, step over/into/out, call stack, post-mortem `%debug` |
| **Widgets** | Full ipywidgets-style system: sliders, dropdowns, checkboxes, tabs, accordions, `interact()` |
| **Autocomplete** | Jedi-powered completions + hover documentation tooltips |
| **Exports** | HTML, Python script, Markdown, PDF (print-ready) |
| **Headless Run** | Execute notebooks from the CLI: `jupy run notebook.ipynb` |
| **Checkpoints** | Snapshot and restore notebook versions |
| **Git Integration** | Branch status + one-click commit from the status bar |
| **System Monitor** | Live CPU / RAM / GPU footer bar |
| **Command Palette** | `Ctrl+Shift+P` for every action |
| **Keyboard Shortcuts** | Jupyter-style: `Shift+Enter`, `A`/`B`/`D D`, `Ctrl+Enter`, and more |
| **Presentation Mode** | Distraction-free fullscreen slides |
| **Zen Mode** | Hide all chrome, focus on code |
| **Find & Replace** | `Ctrl+F` across all cells |
| **Themes** | Light/dark toggle + custom theme engine (YAML/JSON tokens) |
| **Magics** | `%time`, `%timeit`, `%run`, `%pip`, `%matplotlib`, `%who`, `%reset`, `%debug`, and 30+ more |

---

## 📦 Installation

```bash
pip install jupy-notebook
```

**Windows terminal** (full ConPTY support):

```bash
pip install "jupy-notebook[terminal]"
```

**Everything** (terminal + file watching + headless execution):

```bash
pip install "jupy-notebook[all]"
```

### Requirements

- Python 3.9+
- No other mandatory dependencies (psutil auto-installs)

---

## 🚀 Quickstart

```bash
# Start the notebook server (opens browser automatically)
jupy

# Or explicitly
jupy serve --port 8000

# Start without opening a browser
jupy serve --no-browser

# Serve a specific project folder
jupy serve --dir ./my_project
```

Then open **http://localhost:8000** and start coding.

---

## 🖥️ CLI Reference

```
jupy                          Start the notebook server (default)
jupy serve [options]          Start the notebook server
jupy doctor [--full]          Check installation health
jupy status                   Show environment + version info

jupy theme add <name>         Install a theme from the store
jupy theme browse             List all available themes
jupy theme search <query>     Search the theme store
jupy theme list               List installed themes
jupy theme use <name>         Activate a theme
jupy theme remove <name>      Uninstall a theme
jupy theme update [--all]     Update theme(s)
jupy theme import <file>      Install from a local .yml/.json
jupy theme export <name>      Export a theme to a file
jupy theme current            Show the active theme
jupy theme reset              Reset to the Jupy default
jupy theme new <name>         Scaffold a new theme for contributors
jupy theme refresh            Force-refresh the theme store cache

jupy env list                 List environments
jupy env create <name>        Create a global environment
jupy env use <mode> [name]    Set active environment (global/project/named)
jupy env info                 Show active environment details
jupy env path                 Print active environment path
jupy env delete <name>        Delete an environment

jupy pip list                 List installed packages
jupy pip install <spec>       Install a package
jupy pip uninstall <name>     Uninstall a package

jupy run <notebook> [-o out]  Execute a notebook headlessly
jupy export <notebook> --format html|py|md|pdf
jupy new <name>               Create a new notebook
jupy init [--sample]          Initialize a folder for Jupy
jupy combine [-o files.md]    Compile project files into one Markdown
jupy config show|set          Show or set per-folder config
```

---

## 🎨 Theme Store

Jupy connects to the [themes_jupy](https://github.com/hariomlohardev/themes_jupy) community registry.

**From the CLI:**

```bash
jupy theme browse              # see what's available
jupy theme add nord-frost      # install
jupy theme use nord-frost      # activate
```

**From the browser:** click the 🎨 icon on the left activity rail → **STORE** tab → browse previews → click **INSTALL**.

**Create your own theme:**

```bash
jupy theme new my-theme        # scaffolds theme.yml + about.json
# edit the files, add a preview.png, then open a PR to themes_jupy
```

---

## ⌨️ Keyboard Shortcuts

### Command Mode (press `Esc` first)

| Shortcut | Action |
|---|---|
| `Shift+Enter` | Run cell & select next |
| `Ctrl+Enter` | Run cell in place |
| `Alt+Enter` | Run cell & insert below |
| `Enter` | Enter edit mode |
| `A` | Insert cell above |
| `B` | Insert cell below |
| `D D` | Delete cell |
| `Z` | Undo delete |
| `↑ / K` | Select cell above |
| `↓ / J` | Select cell below |
| `Ctrl+Shift+↑/↓` | Move cell up/down |
| `I I` | Interrupt kernel |
| `0 0` | Restart kernel |
| `Ctrl+Shift+M` | Merge selected cells |
| `Ctrl+Shift+-` | Split cell at cursor |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+Shift+?` | Shortcuts help |

### Edit Mode

| Shortcut | Action |
|---|---|
| `Esc` | Back to command mode |
| `Ctrl+Space` | Trigger autocomplete |
| `Ctrl+/` | Toggle line comment |
| `Alt+↑/↓` | Move line up/down |
| `Ctrl+F` | Find & replace |
| `Ctrl+S` | Save notebook to server |

---

## 📁 Project Structure

```
my_project/
├── .jupy/
│   ├── config.json          # per-folder env config
│   └── checkpoints/         # notebook snapshots
├── my_notebook.ipynb
└── ...
```

Global data (environments, themes) lives in your OS app-data folder:

| OS | Path |
|---|---|
| Windows | `%LOCALAPPDATA%\Jupy\` |
| macOS | `~/Library/Application Support/Jupy/` |
| Linux | `~/.local/share/jupy/` |

---

## 🛠️ Development

```bash
git clone https://github.com/hariomlohardev/jupy.git
cd jupy
pip install -e ".[all]"
jupy serve
```

### Building & Publishing

```bash
pip install build twine
python -m build
twine check dist/*
twine upload dist/*
```

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit: `git commit -m "feat: add my feature"`
4. Push: `git push origin feat/my-feature`
5. Open a Pull Request

### Contributing Themes

```bash
jupy theme new my-theme
# edit theme.yml + about.json, add preview.png
# open a PR to https://github.com/hariomlohardev/themes_jupy
```

---

## 📄 License

[MIT](LICENSE)

---

## 🙏 Acknowledgments

- Design inspired by Jupyter, Google Colab, and VS Code
- Terminal powered by [xterm.js](https://xtermjs.org/) + [pywinpty](https://github.com/andfoy/pywinpty)
- Theme store powered by [themes_jupy](https://github.com/hariomlohardev/themes_jupy)
- Editor powered by [CodeMirror 5](https://codemirror.net/5/)

---

<div align="center">

**Made with 🟧 by [hariomlohardev](https://github.com/hariomlohardev)**

[Report Bug](https://github.com/hariomlohardev/jupy/issues) · [Request Feature](https://github.com/hariomlohardev/jupy/issues) · [Theme Store](https://github.com/hariomlohardev/themes_jupy)

</div>
