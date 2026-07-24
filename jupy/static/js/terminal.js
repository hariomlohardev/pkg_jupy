import { createTermSocket } from './websocket.js';

export function setupTerminal(toggleBtn, closeBtn, panel, screen, output, input, promptLabel, onResize) {
  let termSocket = null;
  const cmdHistory = [];
  let historyIdx = -1;

  function toggleTerminal() {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      if (!termSocket || termSocket.readyState !== WebSocket.OPEN) {
        output.textContent = 'Jupy Terminal (.jupy_env) Ready.\n';
        termSocket = createTermSocket((data) => {
          if (data.type === 'output') {
            output.textContent += data.data;
            screen.scrollTop = screen.scrollHeight;
          } else if (data.type === 'prompt') {
            if (promptLabel) promptLabel.textContent = data.data;
          } else if (data.type === 'clear') {
            output.textContent = '';
          }
        });
      }
      setTimeout(() => input.focus(), 50);
    }
    if (onResize) onResize();
  }

  toggleBtn.addEventListener('click', toggleTerminal);
  closeBtn.addEventListener('click', toggleTerminal);
  screen.addEventListener('click', () => input.focus());

  input.addEventListener('keydown', (e) => {
    if (!termSocket || termSocket.readyState !== WebSocket.OPEN) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value;
      if (val.trim()) {
        cmdHistory.push(val);
        historyIdx = cmdHistory.length;
      }

      const currentPrompt = promptLabel ? promptLabel.textContent : '(jupy_venv) ❯';
      output.textContent += `${currentPrompt} ${val}\n`;

      termSocket.send(JSON.stringify({ type: 'command', cmd: val }));
      input.value = '';
      screen.scrollTop = screen.scrollHeight;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0 && historyIdx > 0) {
        historyIdx--;
        input.value = cmdHistory[historyIdx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx < cmdHistory.length - 1) {
        historyIdx++;
        input.value = cmdHistory[historyIdx];
      } else {
        historyIdx = cmdHistory.length;
        input.value = '';
      }
    }
  });
}