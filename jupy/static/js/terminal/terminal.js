/**
 * terminal/terminal.js
 * Real Jupyter-style terminal: xterm.js + raw PTY.
 * Bulletproof version: self-loading CDN, self-diagnostics, aggressive refit.
 */
import { ReconnectingSocket } from '../core/socket.js';

/* ---------- load xterm.js ourselves (2 CDN fallbacks) ---------- */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('failed: ' + src));
    document.head.appendChild(s);
  });
}

function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

const CDNS = [
  { // same CDN your other libraries already use
    css:  'https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm.min.css',
    term: 'https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm.min.js',
    fit:  'https://cdnjs.cloudflare.com/ajax/libs/xterm-addon-fit/0.8.0/xterm-addon-fit.min.js',
  },
  { // backup
    css:  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css',
    term: 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js',
    fit:  'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js',
  },
];

async function ensureXtermLoaded() {
  if (window.Terminal && window.FitAddon) return true;
  for (const cdn of CDNS) {
    try {
      loadCss(cdn.css);
      if (!window.Terminal)  await loadScript(cdn.term);
      if (!window.FitAddon)  await loadScript(cdn.fit);
      if (window.Terminal && window.FitAddon) return true;
    } catch (e) {
      console.warn('[terminal] CDN failed, trying next…', e.message);
    }
  }
  return false;
}

/* ---------- terminal ---------- */
export function setupTerminal(toggleBtn, closeBtn, panel, screen, _o, _i, _p, onResize) {
  let termSocket = null;
  let term = null;
  let fit = null;
  let opened = false;
  let starting = false;
  let gotServerOutput = false;
  const pending = [];

  function send(msg) {
    if (termSocket && termSocket.isOpen) termSocket.send(msg);
    else pending.push(msg);
  }
  function flush() {
    if (!termSocket || !termSocket.isOpen) return;
    while (pending.length) termSocket.send(pending.shift());
  }
  function refit() {
    if (!fit || !opened) return;
    try { fit.fit(); } catch (e) {}
    if (term && term.rows > 0 && term.cols > 0) {
      send({ type: 'resize', rows: term.rows, cols: term.cols });
    }
  }

  function ensureSocket() {
    if (termSocket) return;
    termSocket = new ReconnectingSocket('/ws/terminal', {
      onOpen: () => {
        console.log('[terminal] socket open');
        flush();
        if (term) {
          term.write('\r\n\x1b[32m[connected]\x1b[0m\r\n');
          refit();
          term.focus();
        }
        // WATCHDOG: server must send the shell prompt almost immediately.
        // If nothing arrives in 4s, the server is almost certainly running OLD code.
        gotServerOutput = false;
        setTimeout(() => {
          if (!gotServerOutput && term && termSocket && termSocket.isOpen) {
            term.write('\r\n\x1b[33m[connected, but the server sent no output for 4 seconds]\x1b[0m\r\n');
            term.write('\x1b[33m  1. Restart the Python server (Ctrl+C, then run it again)\x1b[0m\r\n');
            term.write('\x1b[33m  2. Windows users: run  pip install pywinpty  first\x1b[0m\r\n');
            term.write('\x1b[33m  3. Then hard-refresh this page (Ctrl+Shift+R)\x1b[0m\r\n');
          }
        }, 4000);
      },
      onMessage: (data) => {
        if (!term) return;
        if (data.type === 'output') {
          gotServerOutput = true;
          term.write(data.data);
        } else if (data.type === 'clear') {
          term.clear();
        }
      },
      onClose: () => {
        console.log('[terminal] socket closed');
        if (term) term.write('\r\n\x1b[31m[disconnected — reconnecting…]\x1b[0m\r\n');
      },
    });
  }

  async function ensureTerm() {
    if (term || starting) return;
    starting = true;

    screen.innerHTML = '<pre style="color:#9CA3AF;padding:12px;font-family:monospace;">starting terminal…</pre>';
    const ok = await ensureXtermLoaded();

    if (!ok) {
      screen.innerHTML =
        '<pre style="color:#DC2626;padding:12px;font-family:monospace;white-space:pre-wrap;">' +
        'xterm.js could not be loaded from any CDN.\n' +
        'Check your internet / firewall and reload the page.</pre>';
      starting = false;
      return;
    }

    screen.innerHTML = '';
    const host = document.createElement('div');
    host.className = 'terminal-xterm-host';
    screen.appendChild(host);

    term = new window.Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 5000,
      theme: {
        background: '#09090B',
        foreground: '#F9FAFB',
        cursor: '#F9FAFB',
        selectionBackground: '#DAA144',
      },
    });
    fit = new window.FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(host);

    // every keystroke → PTY
    term.onData((data) => {
      // console.log('[terminal] key →', JSON.stringify(data)); 
      ensureSocket();
      send({ type: 'input', data });
    });
    term.onResize(({ cols, rows }) => {
      if (rows > 0 && cols > 0) send({ type: 'resize', rows, cols });
    });

    console.log('[terminal] xterm ready');
    refit();
    requestAnimationFrame(refit);   // refit a few times — covers late layout settling
    setTimeout(refit, 100);
    setTimeout(refit, 500);
  }

  function openTerminal() {
    panel.hidden = false;
    opened = true;
    ensureTerm();
    ensureSocket();
    requestAnimationFrame(refit);
    setTimeout(refit, 120);
    if (onResize) setTimeout(onResize, 60);
  }

  function closeTerminal() {
    panel.hidden = true;
    opened = false;
    if (onResize) onResize();
  }

  function toggleTerminal() {
    if (panel.hidden) openTerminal();
    else closeTerminal();
  }

  toggleBtn.addEventListener('click', toggleTerminal);
  closeBtn.addEventListener('click', closeTerminal);

  // clicking anywhere in the panel focuses the terminal
  panel.addEventListener('mousedown', () => {
    setTimeout(() => { if (term) term.focus(); }, 0);
  });

  window.addEventListener('resize', () => setTimeout(refit, 50));
}