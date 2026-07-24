/**
 * pyodide-runtime.js
 * Pyodide execution wrapper supporting !pip install & Matplotlib plot capturing
 */
const PyRuntime = (() => {
  const PYODIDE_VERSION = "v0.26.4";
  const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

  let pyodide = null;
  let loadingPromise = null;
  let runCellFn = null;

  const BOOTSTRAP_PY = `
import ast, io, re, sys, traceback, warnings
from contextlib import redirect_stdout, redirect_stderr

warnings.filterwarnings("ignore", message=".*non-GUI backend.*")
warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")

async def __pynb_pip_install__(pkg_str):
    import micropip
    tokens = pkg_str.split()
    pkgs = [t for t in tokens if not t.startswith('-')]
    if not pkgs:
        print("Usage: !pip install <package_name>")
        return
    
    print(f"Installing {', '.join(pkgs)} via micropip...")
    try:
        await micropip.install(pkgs)
        print(f"Successfully installed {', '.join(pkgs)}")
    except Exception as e:
        print(f"Failed to install {', '.join(pkgs)}: {e}", file=sys.stderr)

def __pynb_capture_plots__():
    plot_htmls = []
    if "matplotlib.pyplot" in sys.modules:
        import matplotlib
        import matplotlib.pyplot as plt
        import io, base64
        
        fignums = plt.get_fignums()
        for i in fignums:
            try:
                fig = plt.figure(i)
                buf = io.BytesIO()
                fig.savefig(buf, format="png", bbox_inches="tight", dpi=110)
                buf.seek(0)
                b64 = base64.b64encode(buf.read()).decode("ascii")
                plot_htmls.append(f'<img class="notebook-plot" src="data:image/png;base64,{b64}" alt="Plot" />')
            except Exception:
                pass
        
        try:
            plt.close("all")
        except Exception:
            pass
            
        try:
            from matplotlib._pylab_helpers import Gcf
            Gcf.figs.clear()
        except Exception:
            pass

    return plot_htmls

async def __pynb_run_cell__(code, ns):
    out, err = io.StringIO(), io.StringIO()
    result_repr, error_tb = None, None
    plots = []
    
    lines = code.splitlines()
    pip_cmds = []
    py_lines = []
    
    for line in lines:
        stripped = line.strip()
        if re.match(r'^[!%]?\\s*pip\\s+install\\s+', stripped):
            clean_cmd = re.sub(r'^[!%]?\\s*pip\\s+install\\s+', '', stripped)
            pip_cmds.append(clean_cmd)
        elif re.match(r'^[!%]?\\s*matplotlib\\s+inline', stripped):
            pass
        else:
            py_lines.append(line)
            
    clean_code = "\\n".join(py_lines)
    
    try:
        with redirect_stdout(out), redirect_stderr(err):
            for cmd in pip_cmds:
                await __pynb_pip_install__(cmd)
            
            if "matplotlib" in sys.modules:
                import matplotlib
                try:
                    matplotlib.use("Agg", force=True)
                except Exception:
                    pass
            
            if clean_code.strip():
                tree = ast.parse(clean_code, mode="exec")
                if tree.body and isinstance(tree.body[-1], ast.Expr):
                    last = tree.body.pop()
                    if tree.body:
                        exec(compile(tree, "<cell>", "exec"), ns)
                    expr = ast.Expression(last.value)
                    ast.copy_location(expr, last.value)
                    value = eval(compile(expr, "<cell>", "eval"), ns)
                    if value is not None:
                        result_repr = repr(value)
                else:
                    exec(compile(tree, "<cell>", "exec"), ns)
            
            plots = __pynb_capture_plots__()

    except SyntaxError as e:
        error_tb = "".join(traceback.format_exception_only(type(e), e))
    except Exception as e:
        tb = e.__traceback__.tb_next if e.__traceback__ else None
        error_tb = "".join(traceback.format_exception(type(e), e, tb))
        
    return out.getvalue(), err.getvalue(), result_repr, error_tb, plots
`;

  function freshNamespace() {
    return pyodide.runPython("{'__name__': '__main__'}");
  }

  let namespace = null;

  async function init(onProgress) {
    if (pyodide) return pyodide;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      onProgress?.("Fetching Python runtime…");
      const { loadPyodide } = await import(PYODIDE_CDN + "pyodide.mjs");
      pyodide = await loadPyodide({ indexURL: PYODIDE_CDN });

      onProgress?.("Loading package installer (micropip)…");
      await pyodide.loadPackage("micropip");

      onProgress?.("Initializing kernel…");
      pyodide.runPython(BOOTSTRAP_PY);
      runCellFn = pyodide.globals.get("__pynb_run_cell__");
      namespace = freshNamespace();

      onProgress?.("Ready");
      return pyodide;
    })();

    return loadingPromise;
  }

  async function run(code) {
    if (!pyodide || !runCellFn) throw new Error("PyRuntime not ready");
    const proxy = await runCellFn(code, namespace);
    const [stdout, stderr, result, error, plots] = proxy.toJs();
    proxy.destroy();
    return { stdout, stderr, result, error, plots };
  }

  function restart() {
    if (namespace && namespace.destroy) {
      try { namespace.destroy(); } catch (e) {}
    }
    namespace = freshNamespace();
  }

  return {
    getPyodide: (onProgress) => init(onProgress),
    runCell: async (instance, code, { onStdout, onStderr, onPlot } = {}) => {
      const { stdout, stderr, result, error, plots } = await run(code);
      if (stdout) onStdout?.(stdout.replace(/\n$/, ""));
      if (result != null) onStdout?.(result);
      if (plots && plots.length > 0) {
        plots.forEach((html) => onPlot?.(html));
      }
      if (stderr) onStderr?.(stderr.replace(/\n$/, ""));
      if (error) onStderr?.(error.replace(/\n$/, ""));
    },
    restartKernel: async () => restart(),
    isReady: () => !!pyodide,
  };
})();