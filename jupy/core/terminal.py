import os
import subprocess
import sys
from jupy.core.venv import VENV_BIN, VENV_DIR


class TerminalSession:
    """Manages real-time command execution in the jupy_venv context."""
    def __init__(self):
        self.cwd = os.getcwd()

    def get_env(self):
        env = os.environ.copy()
        env["VIRTUAL_ENV"] = VENV_DIR
        env["PATH"] = VENV_BIN + os.path.pathsep + env.get("PATH", "")
        return env

    def get_prompt(self):
        if sys.platform == "win32":
            return f"(jupy_venv) {self.cwd}> "
        else:
            user = os.environ.get("USER", "jupy")
            return f"(jupy_venv) {user}:{os.path.basename(self.cwd)}$ "

    def execute_cmd(self, cmd_str, ws_send_fn):
        cmd = cmd_str.strip()

        if not cmd:
            ws_send_fn({"type": "output", "data": self.get_prompt()})
            return

        # Screen Clear
        if cmd in ("cls", "clear"):
            ws_send_fn({"type": "clear"})
            ws_send_fn({"type": "output", "data": self.get_prompt()})
            return

        # Directory Change (cd)
        if cmd.startswith("cd ") or cmd == "cd":
            target = cmd[3:].strip() if len(cmd) > 3 else os.path.expanduser("~")
            if target == "~":
                target = os.path.expanduser("~")
            new_path = os.path.abspath(os.path.join(self.cwd, target))
            if os.path.exists(new_path) and os.path.isdir(new_path):
                self.cwd = new_path
                ws_send_fn({"type": "output", "data": f"\n{self.get_prompt()}"})
            else:
                ws_send_fn({"type": "output", "data": f"\nThe system cannot find the path specified: {target}\n\n{self.get_prompt()}"})
            return

        # Execute Real OS Command with Unbuffered WebSocket Output Streaming
        try:
            proc = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=self.get_env(),
                cwd=self.cwd,
                bufsize=0
            )

            ws_send_fn({"type": "output", "data": "\n"})

            while True:
                chunk = proc.stdout.read(1024)
                if not chunk and proc.poll() is not None:
                    break
                if chunk:
                    text = chunk.decode("utf-8", errors="replace")
                    ws_send_fn({"type": "output", "data": text})

            proc.communicate()
            ws_send_fn({"type": "output", "data": f"\n{self.get_prompt()}"})

        except Exception as e:
            ws_send_fn({"type": "output", "data": f"\nCommand execution error: {str(e)}\n\n{self.get_prompt()}"})