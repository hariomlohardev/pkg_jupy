# Jupy

**Jupy** is a lightweight, local-first, brutalist Python notebook server.

It gives you a fast local notebook environment with code cells, markdown cells,
rich output, plots, widgets, debugger, variable explorer, file browser,
environment manager, pip manager, terminal, checkpoints, exports, and CLI tools.

Everything runs locally on your machine.

---

## Badges

<p align="center">
  <a href="https://pypi.org/project/jupy/">
    <img src="https://img.shields.io/pypi/v/jupy.svg?label=PyPI" alt="PyPI version" />
  </a>
  <a href="https://pypi.org/project/jupy/">
    <img src="https://img.shields.io/pypi/pyversions/jupy.svg" alt="Python versions" />
  </a>
  <a href="https://github.com/hariomlohardev/pkg_jupy/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/hariomlohardev/pkg_jupy.svg" alt="License" />
  </a>
  <a href="https://github.com/hariomlohardev/pkg_jupy/issues">
    <img src="https://img.shields.io/github/issues/hariomlohardev/pkg_jupy.svg" alt="Issues" />
  </a>
  <a href="https://github.com/hariomlohardev/pkg_jupy">
    <img src="https://img.shields.io/github/stars/hariomlohardev/pkg_jupy.svg?style=social" alt="GitHub stars" />
  </a>
</p>

---

## Features

- Local Python notebook server
- Code cells with Python execution
- Markdown cells with live preview
- Rich output rendering
- Matplotlib plot support
- Interactive widgets
- Variable explorer
- Debugger panel
- File browser
- Session notes
- Checkpoints
- Environment manager
- Pip package manager
- Real terminal
- Export notebook to HTML, Python, Markdown, and print-ready PDF
- Headless notebook execution
- Command-line interface
- Theme engine
- Brutalist UI design

---

## Installation

Install from PyPI:

```bash
python -m pip install jupy
```

For full terminal support on Windows, install:

```bash
python -m pip install "jupy[terminal]"
```

For all optional features:

```bash
python -m pip install "jupy[all]"
```
### Optional extras

| Extra      | Purpose |
|------------|---------|
| `terminal` | Full Windows terminal support using `pywinpty` |
| `watch`    | File watching support using `watchdog` |
| `nb`       | Headless notebook execution using `nbformat` |
| `all`      | All optional dependencies |

Example:

```bash
python -m pip install "jupy[terminal]"
```

---

## Install from source

```bash
git clone https://github.com/hariomlohardev/pkg_jupy.git
cd pkg_jupy
python -m pip install -e ".[all]"
```

Then run:

```bash
jupy --help
```

---

## Quickstart

Start the notebook server:

```bash
jupy
```

Or explicitly:

```bash
jupy serve
```

Then open your browser at:

```text
http://localhost:8000
```

You can also run:

```bash
python -m jupy
```

---

## CLI Commands

### Server

```bash
jupy
jupy serve
jupy serve --port 9000
jupy serve --no-browser
jupy serve --dir ./my_project
```

### Doctor / Health Check

```bash
jupy doctor
jupy doctor --full
```

### Status

```bash
jupy status
```

### Environments

```bash
jupy env list
jupy env create datasci
jupy env use named datasci
jupy env use global
jupy env use project
jupy env info
jupy env path
jupy env delete datasci
```

### Pip

```bash
jupy pip list
jupy pip install numpy
jupy pip install "requests==2.32.0"
jupy pip uninstall numpy
```

### Notebooks

```bash
jupy new analysis
jupy run analysis.ipynb --output executed.ipynb
jupy export analysis.ipynb --format html
jupy export analysis.ipynb --format py
jupy export analysis.ipynb --format md
jupy export analysis.ipynb --format pdf
```

### Project Utilities

```bash
jupy init
jupy init --sample
jupy combine --output files.md
jupy config show
jupy config set env_mode named
jupy config set env_name datasci
```

---

## Windows Terminal

On Windows, the real terminal requires `pywinpty`.

Install it with:

```bash
python -m pip install pywinpty
```

Or install Jupy with terminal support:

```bash
python -m pip install "jupy[terminal]"
```

Without `pywinpty`, Windows falls back to a limited pipe-based terminal.

---

## Project Structure

```text
pkg_jupy/
  pyproject.toml
  README.md
  LICENSE
  MANIFEST.in
  create_readme.py
  jupy/
    __init__.py
    __main__.py
    cli.py
    combine.py
    run_notebook.py
    core/
      __init__.py
      autocomplete.py
      envmanager.py
      metrics.py
      terminal.py
      venv.py
      kernel/
        __init__.py
        manager.py
        worker_script.py
    server/
      __init__.py
      handlers.py
      protocol.py
    static/
      index.html
      css/
      js/
```

---

## Development

Clone the repository:

```bash
git clone https://github.com/hariomlohardev/pkg_jupy.git
cd pkg_jupy
```

Create a virtual environment:

```bash
python -m venv .venv
```

Activate it:

### Windows

```bash
.venv\Scripts\activate
```

### macOS / Linux

```bash
source .venv/bin/activate
```

Install in editable mode:

```bash
python -m pip install -e ".[all]"
```

Run:

```bash
jupy --help
jupy doctor --full
jupy serve --no-browser
```



---

## Version

Current version: **0.1.0**

---

## Repository

GitHub: https://github.com/hariomlohardev/pkg_jupy

Issues: https://github.com/hariomlohardev/pkg_jupy/issues

PyPI: https://pypi.org/project/jupy/

---

## License

MIT License

Copyright (c) 2026 hariomlohardev
