#!/usr/bin/env python3
"""
Standalone notebook executor (headless).
Usage: python run_notebook.py notebook.ipynb [--output out.ipynb]
"""

import sys
import os
import json
import argparse

def run_notebook(notebook_path, output_path=None):
    try:
        import nbformat
        from nbformat.v4 import new_output
    except ImportError:
        print("Error: 'nbformat' is required for headless execution.")
        print("Install it with: pip install nbformat")
        sys.exit(1)

    # Ensure Jupy dependencies are installed in the current environment
    from jupy.core.envmanager import ensure_jupy_dependencies
    ensure_jupy_dependencies()

    # Import kernel (which will start it)
    from jupy.core.kernel import kernel

    # Ensure kernel is running
    if not kernel.proc or kernel.proc.poll() is not None:
        print("[Jupy] Starting kernel...")
        kernel._ensure_kernel_proc()

    # Load notebook
    if not os.path.exists(notebook_path):
        print(f"Error: Notebook file not found: {notebook_path}")
        sys.exit(1)

    with open(notebook_path, 'r', encoding='utf-8') as f:
        nb = nbformat.read(f, as_version=4)

    print(f"[Jupy] Executing notebook: {notebook_path}")

    total_cells = len(nb.cells)
    for idx, cell in enumerate(nb.cells):
        if cell.cell_type != 'code':
            continue
        print(f"  Running cell {idx+1}/{total_cells}...", end='', flush=True)
        outputs = []
        def ws_send(data):
            outputs.append(data)
        kernel.execute(cell.source, ws_send)
        # Collect outputs into nbformat structure
        for out in outputs:
            if out['type'] == 'stdout':
                cell.outputs.append(new_output('stream', name='stdout', text=out['text']))
            elif out['type'] == 'stderr':
                cell.outputs.append(new_output('stream', name='stderr', text=out['text']))
            elif out['type'] == 'plot':
                cell.outputs.append(new_output('display_data', data={'text/html': out['html']}))
            elif out['type'] == 'display':
                # Pass MIME data directly
                cell.outputs.append(new_output('display_data', data=out['data']))
            elif out['type'] == 'complete':
                # Execution complete marker – ignore
                pass
        print(" done")

    out_path = output_path or notebook_path
    with open(out_path, 'w', encoding='utf-8') as f:
        nbformat.write(nb, f)

    print(f"[Jupy] Notebook executed successfully and saved to: {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Execute a Jupy notebook headlessly")
    parser.add_argument('notebook', help='Path to .ipynb file')
    parser.add_argument('--output', '-o', help='Output file (default: overwrite input)', default=None)
    args = parser.parse_args()
    run_notebook(args.notebook, args.output)