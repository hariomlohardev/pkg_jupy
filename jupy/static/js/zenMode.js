export function initZenMode() {
    let active = false;
    const topbar = document.querySelector('.topbar');
    const systemBar = document.querySelector('.system-bar-wrapper');
    const envPanel = document.getElementById('env-manager-panel');
    const terminalPanel = document.getElementById('terminal-panel');

    function toggle() {
        active = !active;
        [topbar, systemBar, envPanel, terminalPanel].forEach(el => {
            if (el) el.style.display = active ? 'none' : '';
        });
        const fileBrowser = document.getElementById('file-browser-panel');
        const varExplorer = document.getElementById('var-explorer-panel');
        const debuggerPanel = document.getElementById('debugger-panel');
        [fileBrowser, varExplorer, debuggerPanel].forEach(el => {
            if (el) el.style.display = active ? 'none' : '';
        });
    }

    window.toggleZenMode = toggle;
    return { toggle, isActive: () => active };
}