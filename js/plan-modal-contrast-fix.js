// Corrige contraste dos modais/cartões de planos sem alterar o Checkout do Mercado Pago.
// Mantém a identidade RENOVA Dark V2 e garante texto legível em modo claro e escuro.

const style = document.createElement('style');
style.dataset.renovaPlanContrastFix = '1';
style.textContent = `
  /* Superfícies RENOVA de planos */
  .plans-shell,
  .plans-hero,
  .plans-section,
  .plan-card,
  .owner-admin-card,
  .referral-card {
    color: #f4f8ff !important;
  }

  .plans-hero h1,.plans-hero h2,.plans-hero h3,.plans-hero h4,
  .plans-section h1,.plans-section h2,.plans-section h3,.plans-section h4,
  .plan-card h1,.plan-card h2,.plan-card h3,.plan-card h4,
  .owner-admin-card h1,.owner-admin-card h2,.owner-admin-card h3,.owner-admin-card h4,
  .referral-card h1,.referral-card h2,.referral-card h3,.referral-card h4,
  .plan-price strong,.plan-status strong,.referral-stat strong {
    color: #f8fbff !important;
  }

  .plans-hero p,.plans-section p,.owner-admin-card p,.referral-card p,
  .plan-description,.plans-note,.plan-price span,.plan-status span,
  .referral-stat span,.admin-plan-row label,.owner-access-form label {
    color: #b9c8d9 !important;
  }

  .plan-setup,
  .referral-stat,
  .admin-plan-row,
  .access-history-row {
    color: #edf6ff !important;
  }

  /* Modal de escolha de plano: mantém fundo escuro premium com texto claro. */
  .modal-card:has(.plans-shell),
  .modal-card:has(.plans-grid),
  .modal-card:has(.plan-card),
  [class*="plan-modal"],
  [class*="plans-modal"],
  [class*="subscription-modal"],
  [class*="upgrade-modal"] {
    background: linear-gradient(145deg,#0b1728,#07101e) !important;
    color: #f4f8ff !important;
    border-color: rgba(72,202,255,.20) !important;
  }

  .modal-card:has(.plans-shell) .modal-head,
  .modal-card:has(.plans-grid) .modal-head,
  .modal-card:has(.plan-card) .modal-head,
  [class*="plan-modal"] [class*="head"],
  [class*="plans-modal"] [class*="head"],
  [class*="subscription-modal"] [class*="head"],
  [class*="upgrade-modal"] [class*="head"] {
    background: rgba(9,20,35,.98) !important;
    color: #f4f8ff !important;
    border-color: rgba(255,255,255,.08) !important;
  }

  .modal-card:has(.plans-shell) h1,.modal-card:has(.plans-shell) h2,.modal-card:has(.plans-shell) h3,.modal-card:has(.plans-shell) h4,
  .modal-card:has(.plans-grid) h1,.modal-card:has(.plans-grid) h2,.modal-card:has(.plans-grid) h3,.modal-card:has(.plans-grid) h4,
  .modal-card:has(.plan-card) h1,.modal-card:has(.plan-card) h2,.modal-card:has(.plan-card) h3,.modal-card:has(.plan-card) h4,
  [class*="plan-modal"] h1,[class*="plan-modal"] h2,[class*="plan-modal"] h3,[class*="plan-modal"] h4,
  [class*="plans-modal"] h1,[class*="plans-modal"] h2,[class*="plans-modal"] h3,[class*="plans-modal"] h4,
  [class*="subscription-modal"] h1,[class*="subscription-modal"] h2,[class*="subscription-modal"] h3,[class*="subscription-modal"] h4,
  [class*="upgrade-modal"] h1,[class*="upgrade-modal"] h2,[class*="upgrade-modal"] h3,[class*="upgrade-modal"] h4 {
    color: #ffffff !important;
  }

  .modal-card:has(.plans-shell) p,.modal-card:has(.plans-shell) small,.modal-card:has(.plans-shell) span,
  .modal-card:has(.plans-grid) p,.modal-card:has(.plans-grid) small,.modal-card:has(.plans-grid) span,
  .modal-card:has(.plan-card) p,.modal-card:has(.plan-card) small,
  [class*="plan-modal"] p,[class*="plan-modal"] small,
  [class*="plans-modal"] p,[class*="plans-modal"] small,
  [class*="subscription-modal"] p,[class*="subscription-modal"] small,
  [class*="upgrade-modal"] p,[class*="upgrade-modal"] small {
    color: #b9c8d9 !important;
  }

  .modal-card:has(.plan-card) .plan-card,
  [class*="plan-modal"] .plan-card,
  [class*="plans-modal"] .plan-card,
  [class*="subscription-modal"] .plan-card,
  [class*="upgrade-modal"] .plan-card {
    background: linear-gradient(145deg,#111f33,#0a1525) !important;
    border-color: rgba(72,202,255,.18) !important;
    color: #f4f8ff !important;
  }

  .modal-card:has(.plan-card) .plan-card.recommended,
  [class*="plan-modal"] .plan-card.recommended,
  [class*="plans-modal"] .plan-card.recommended {
    border-color: rgba(36,224,195,.52) !important;
    box-shadow: 0 0 0 1px rgba(36,224,195,.10),0 18px 44px rgba(0,0,0,.28) !important;
  }

  .modal-card:has(.plan-card) .ghost-btn,
  [class*="plan-modal"] .ghost-btn,
  [class*="plans-modal"] .ghost-btn,
  [class*="subscription-modal"] .ghost-btn,
  [class*="upgrade-modal"] .ghost-btn {
    background: #15263b !important;
    color: #f2f8ff !important;
    border-color: rgba(170,200,230,.18) !important;
  }

  .modal-card:has(.plan-card) .primary-btn,
  [class*="plan-modal"] .primary-btn,
  [class*="plans-modal"] .primary-btn,
  [class*="subscription-modal"] .primary-btn,
  [class*="upgrade-modal"] .primary-btn {
    color: #04111b !important;
  }

  /* Evita que as regras do modo claro tornem o texto escuro dentro do modal dark. */
  html[data-theme="light"] .modal-card:has(.plans-shell),
  html[data-theme="light"] .modal-card:has(.plans-grid),
  html[data-theme="light"] .modal-card:has(.plan-card),
  html[data-theme="light"] [class*="plan-modal"],
  html[data-theme="light"] [class*="plans-modal"],
  html[data-theme="light"] [class*="subscription-modal"],
  html[data-theme="light"] [class*="upgrade-modal"] {
    color: #f4f8ff !important;
  }

  @media (max-width:700px){
    .modal-card:has(.plans-grid),
    .modal-card:has(.plan-card),
    [class*="plan-modal"],
    [class*="plans-modal"],
    [class*="subscription-modal"],
    [class*="upgrade-modal"] {
      max-width: 100% !important;
    }
  }
`;

document.head.appendChild(style);
