export function initTheme(toggleBtn) {
  function applyTheme() {
    const savedTheme = localStorage.getItem('jupy-theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
      toggleBtn.textContent = savedTheme === 'dark' ? '☀ LIGHT' : '🌙 DARK';
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      toggleBtn.textContent = prefersDark ? '☀ LIGHT' : '🌙 DARK';
    }
  }

  toggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isCurrentlyDark = currentTheme === 'dark' || (!currentTheme && systemDark);

    const nextTheme = isCurrentlyDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('jupy-theme', nextTheme);
    toggleBtn.textContent = nextTheme === 'dark' ? '☀ LIGHT' : '🌙 DARK';
  });

  applyTheme();
}