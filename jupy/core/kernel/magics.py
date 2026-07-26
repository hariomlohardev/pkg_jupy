"""
jupy/core/kernel/magics.py
All IPython-style magics (line and cell).
"""
import os
import sys
import subprocess
import shlex
import time
import tempfile
import io
import contextlib
from collections import deque

# Global state (per kernel instance)
alias_dict = {}
bookmark_dict = {}
dir_stack = deque()
pdb_mode = False
xmode = 'Context'  # 'Plain', 'Context', 'Verbose'
float_precision = None

# --------------------------------------------------------------------
# Helper: run system command and capture output
# --------------------------------------------------------------------
def run_system_command(cmd, capture=False, capture_stderr=False):
    try:
        if capture:
            stderr = subprocess.STDOUT if capture_stderr else subprocess.PIPE
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
            return result.stdout + (result.stderr if capture_stderr else '')
        else:
            subprocess.run(cmd, shell=True, check=False)
            return ''
    except Exception as e:
        return str(e)

# --------------------------------------------------------------------
# Magic implementations
# --------------------------------------------------------------------
def magic_paste(args, cell, namespace):
    # Try to use pyperclip
    try:
        import pyperclip
        text = pyperclip.paste()
        # Execute the pasted code
        exec(text, namespace)
        return "Pasted and executed code from clipboard."
    except ImportError:
        return "pyperclip not installed. Please install: pip install pyperclip"
    except Exception as e:
        return f"Error pasting: {e}"

def magic_cpaste(args, cell, namespace):
    # Read multi-line input until a blank line
    print("Paste your code below. End with a blank line.", file=sys.stderr)
    lines = []
    while True:
        try:
            line = sys.stdin.readline()
        except KeyboardInterrupt:
            return "Interrupted."
        if not line or line.strip() == '':
            break
        lines.append(line)
    code = ''.join(lines)
    try:
        exec(code, namespace)
        return "Executed pasted code."
    except Exception as e:
        return f"Error: {e}"

def magic_edit(args, cell, namespace):
    # Open editor (use $EDITOR or fallback)
    editor = os.environ.get('EDITOR', 'nano')
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as f:
        fname = f.name
    try:
        subprocess.run([editor, fname], check=True)
        with open(fname, 'r') as f:
            code = f.read()
        if code:
            exec(code, namespace)
            return f"Edited and executed {fname}"
        else:
            return "No code entered."
    except Exception as e:
        return f"Error: {e}"
    finally:
        try: os.unlink(fname)
        except: pass

def magic_env(args, cell, namespace):
    if not args:
        # show all env vars
        return '\n'.join(f"{k}={v}" for k,v in os.environ.items())
    if '=' in args[0]:
        # set var
        key, val = args[0].split('=', 1)
        os.environ[key] = val
        return f"Set {key}={val}"
    else:
        # get var
        key = args[0]
        return os.environ.get(key, '')

def magic_alias(args, cell, namespace):
    global alias_dict
    if not args:
        return '\n'.join(f"{k} -> {v}" for k,v in alias_dict.items())
    if len(args) == 1:
        # show specific alias
        return alias_dict.get(args[0], f"Alias {args[0]} not found.")
    else:
        name = args[0]
        cmd = ' '.join(args[1:])
        alias_dict[name] = cmd
        return f"Alias {name} = {cmd}"

def magic_unalias(args, cell, namespace):
    global alias_dict
    if not args:
        return "Usage: %unalias name"
    name = args[0]
    if name in alias_dict:
        del alias_dict[name]
        return f"Removed alias {name}"
    else:
        return f"Alias {name} not found."

def magic_bookmark(args, cell, namespace):
    global bookmark_dict
    if not args:
        return '\n'.join(f"{k} -> {v}" for k,v in bookmark_dict.items())
    if len(args) == 1:
        name = args[0]
        if name in bookmark_dict:
            os.chdir(bookmark_dict[name])
            return f"Changed to bookmark {name}: {bookmark_dict[name]}"
        else:
            return f"Bookmark {name} not found."
    else:
        name = args[0]
        path = args[1] if len(args) > 1 else os.getcwd()
        bookmark_dict[name] = os.path.abspath(path)
        return f"Bookmark {name} -> {bookmark_dict[name]}"

def magic_pushd(args, cell, namespace):
    global dir_stack
    if not args:
        # push current dir and go to home
        dir_stack.append(os.getcwd())
        os.chdir(os.path.expanduser('~'))
        return f"Pushed {os.getcwd()}"
    else:
        dir_stack.append(os.getcwd())
        try:
            os.chdir(args[0])
            return f"Changed to {args[0]}"
        except Exception as e:
            dir_stack.pop()
            return f"Error: {e}"

def magic_popd(args, cell, namespace):
    global dir_stack
    if not dir_stack:
        return "Directory stack is empty."
    prev = dir_stack.pop()
    os.chdir(prev)
    return f"Popped back to {prev}"

def magic_dirs(args, cell, namespace):
    global dir_stack
    return '\n'.join(f"{i}: {d}" for i,d in enumerate(dir_stack))

def magic_sc(args, cell, namespace):
    # shell capture: %sc [options] command
    if not args:
        return "Usage: %sc command"
    cmd = ' '.join(args)
    return run_system_command(cmd, capture=True)

def magic_system(args, cell, namespace):
    # %system or ! command
    if not args:
        return "Usage: %system command"
    cmd = ' '.join(args)
    return run_system_command(cmd, capture=False)

def magic_prun(args, cell, namespace):
    # %prun statement – run under cProfile
    import cProfile, pstats, io
    if not args:
        return "Usage: %prun statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell  # cell magic
    prof = cProfile.Profile()
    try:
        prof.enable()
        exec(code, namespace)
        prof.disable()
    except Exception as e:
        return f"Error: {e}"
    stream = io.StringIO()
    stats = pstats.Stats(prof, stream=stream)
    stats.sort_stats('cumtime').print_stats(20)
    return stream.getvalue()

def magic_lprun(args, cell, namespace):
    # needs line_profiler
    try:
        from line_profiler import LineProfiler
    except ImportError:
        return "line_profiler not installed. Install: pip install line_profiler"
    if not args:
        return "Usage: %lprun statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    prof = LineProfiler()
    try:
        prof.runctx(code, namespace, namespace)
        return prof.print_stats()
    except Exception as e:
        return f"Error: {e}"

def magic_mprun(args, cell, namespace):
    # needs memory_profiler
    try:
        from memory_profiler import memory_usage
    except ImportError:
        return "memory_profiler not installed. Install: pip install memory_profiler"
    if not args:
        return "Usage: %mprun statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    def f():
        exec(code, namespace)
    mem = memory_usage(f, interval=0.1, timeout=10)
    return f"Memory usage: {max(mem):.2f} MiB"

def magic_memit(args, cell, namespace):
    # measure memory usage of a statement
    if not args:
        return "Usage: %memit statement"
    code = ' '.join(args)
    if cell is not None:
        code = cell
    try:
        from memory_profiler import memory_usage
        def f():
            exec(code, namespace)
        mem = memory_usage(f, interval=0.1, timeout=10)
        return f"Memory usage: {max(mem):.2f} MiB"
    except ImportError:
        # fallback: use psutil
        try:
            import psutil
            process = psutil.Process(os.getpid())
            before = process.memory_info().rss
            exec(code, namespace)
            after = process.memory_info().rss
            diff = (after - before) / (1024*1024)
            return f"Memory used: {diff:.2f} MiB"
        except:
            return "memory_profiler or psutil required."

def magic_pdb(args, cell, namespace):
    global pdb_mode
    if not args:
        return f"pdb mode is {'on' if pdb_mode else 'off'}"
    val = args[0].lower()
    if val in ('on', 'true', '1'):
        pdb_mode = True
        return "pdb mode ON"
    else:
        pdb_mode = False
        return "pdb mode OFF"

def magic_xmode(args, cell, namespace):
    global xmode
    if not args:
        return f"xmode = {xmode}"
    mode = args[0].capitalize()
    if mode in ('Plain', 'Context', 'Verbose'):
        xmode = mode
        return f"xmode set to {mode}"
    else:
        return f"Invalid mode: {mode}. Use Plain, Context, or Verbose."

def magic_precision(args, cell, namespace):
    global float_precision
    if not args:
        return f"float precision = {float_precision}"
    try:
        val = int(args[0])
        float_precision = val
        return f"Set float precision to {val}"
    except:
        return "Usage: %precision <integer>"

def magic_config(args, cell, namespace):
    return "Configuration system not implemented yet."

def magic_gui(args, cell, namespace):
    return "GUI event loop integration not implemented."

def magic_load_ext(args, cell, namespace):
    if not args:
        return "Usage: %load_ext module"
    try:
        __import__(args[0])
        return f"Loaded extension {args[0]}"
    except Exception as e:
        return f"Error: {e}"

def magic_unload_ext(args, cell, namespace):
    if not args:
        return "Usage: %unload_ext module"
    # remove from sys.modules?
    if args[0] in sys.modules:
        del sys.modules[args[0]]
        return f"Unloaded {args[0]}"
    else:
        return f"{args[0]} not loaded."

def magic_reload_ext(args, cell, namespace):
    if not args:
        return "Usage: %reload_ext module"
    try:
        import importlib
        mod = importlib.import_module(args[0])
        importlib.reload(mod)
        return f"Reloaded {args[0]}"
    except Exception as e:
        return f"Error: {e}"

# --------------------------------------------------------------------
# Dispatch table
# --------------------------------------------------------------------
MAGIC_DISPATCH = {
    'paste': magic_paste,
    'cpaste': magic_cpaste,
    'edit': magic_edit,
    'env': magic_env,
    'alias': magic_alias,
    'unalias': magic_unalias,
    'bookmark': magic_bookmark,
    'pushd': magic_pushd,
    'popd': magic_popd,
    'dirs': magic_dirs,
    'sc': magic_sc,
    'system': magic_system,
    'prun': magic_prun,
    'lprun': magic_lprun,
    'mprun': magic_mprun,
    'memit': magic_memit,
    'pdb': magic_pdb,
    'xmode': magic_xmode,
    'precision': magic_precision,
    'config': magic_config,
    'gui': magic_gui,
    'load_ext': magic_load_ext,
    'unload_ext': magic_unload_ext,
    'reload_ext': magic_reload_ext,
}
