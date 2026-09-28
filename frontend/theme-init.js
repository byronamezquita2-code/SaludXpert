// Externo porque la CSP bloquea scripts inline.
try {
  const savedTheme = localStorage.getItem('saludxpert-theme');
  const initialTheme = savedTheme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = initialTheme;
  document.documentElement.style.colorScheme = initialTheme;
} catch {
  document.documentElement.dataset.theme = 'light';
}
