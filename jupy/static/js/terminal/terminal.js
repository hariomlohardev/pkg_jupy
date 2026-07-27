/**
 * terminal/terminal.js
 * The right-hand split-pane shell terminal.
 */
import { ReconnectingSocket } from '../core/socket.js';
import { MAX_TERMINAL_OUTPUT_CHARS } from '../config/constants.js';

export function setupTerminal(toggleBtn, closeBtn, panel, screen, output, input, promptLabel, onResize) {
  let termSocket = null;
  const cmdHistory = [];
  let historyIdx = -1;

  function appendOutput(text) {
    output.textContent += text;
    if (output.textContent.length > MAX_TERMINAL_OUTPUT_CHARS) {
      output.textContent = output.textContent.slice(-MAX_TERMINAL_OUTPUT_CHARS);
    }
    screen.scrollTop = screen.scrollHeight;
  }

  function ensureSocket() {
    if (termSocket) return;
    termSocket = new ReconnectingSocket('/ws/terminal', {
      onMessage: (data) => {
        if (data.type === 'output') {
          appendOutput(data.data);
        } else if (data.type === 'prompt') {
          if (promptLabel) promptLabel.textContent = data.data;
        } else if (data.type === 'clear') {
          output.textContent = '';
        }
      },
      onClose: () => appendOutput('\n[connection lost — reconnecting…]\n'),
    });
  }

  function sendRaw(text) {
    if (termSocket && termSocket.isOpen) termSocket.send({ type: 'input', data: text });
  }

  function toggleTerminal() {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      ensureSocket();
      setTimeout(() => input.focus(), 50);
    }
    if (onResize) onResize();
  }
  toggleBtn.addEventListener('click', toggleTerminal);
  closeBtn.addEventListener('click', toggleTerminal);
  screen.addEventListener('click', () => input.focus());

  // ---- ^C / ^D helper buttons (next to the input) ----
  const inputLine = input.parentElement;
  if (inputLine && !document.getElementById('term-ctrlc')) {
    const ctrlC = document.createElement('button');
    ctrlC.id = 'term-ctrlc';
    ctrlC.className = 'btn btn-secondary';
    ctrlC.textContent = '^C';
    ctrlC.title = 'Interrupt (Ctrl+C)';
    ctrlC.style.cssText = 'padding:2px 8px;font-size:0.7rem;';
    ctrlC.addEventListener('click', () => { sendRaw('\x03'); appendOutput('^C'); input.focus(); });

    const ctrlD = document.createElement('button');
    ctrlD.id = 'term-ctrld';
    ctrlD.className = 'btn btn-secondary';
    ctrlD.textContent = '^D';
    ctrlD.title = 'EOF / exit (Ctrl+D)';
    ctrlD.style.cssText = 'padding:2px 8px;font-size:0.7rem;';
    ctrlD.addEventListener('click', () => { sendRaw('\x04'); input.focus(); });

    inputLine.appendChild(ctrlC);
    inputLine.appendChild(ctrlD);
  }

  input.addEventListener('keydown', (e) => {
    if (!termSocket || !termSocket.isOpen) return;

    // Ctrl+C → interrupt the running program (e.g. leave python / stop a loop)
    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      sendRaw('\x03');
      appendOutput('^C');
      return;
    }
    // Ctrl+D → EOF (exit python / shell)
    if (e.ctrlKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      sendRaw('\x04');
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value;
      if (val.trim()) {
        cmdHistory.push(val);
        historyIdx = cmdHistory.length;
      }
      // Don't append locally — the PTY echoes the command back to us.
      sendRaw(val + '\n');
      input.value = '';
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