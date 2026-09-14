// Recarrega a folha de Orçamentos com versão nova para evitar cache antigo no NextGo/navegador.
const existing = document.querySelector('link[data-renova-budget-contrast-fix]');
if (!existing) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/budgets-module.css?v=20260914-1455';
  link.dataset.renovaBudgetContrastFix = '1';
  document.head.appendChild(link);
}
