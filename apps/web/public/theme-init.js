// Aplica o tema salvo antes do primeiro paint (sem "flash" do tema claro).
// Arquivo separado (e não <script> inline) para a CSP do front poder usar script-src 'self'.
(function () {
  var theme;
  try {
    theme = window.localStorage.getItem('traceflow.theme');
  } catch {
    theme = null;
  }
  var dark =
    theme === 'dark' ||
    (theme !== 'light' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  if (dark) root.classList.add('dark');
  root.style.colorScheme = dark ? 'dark' : 'light';
})();
