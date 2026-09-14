const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function ensureStyles() {
  if ($('link[data-renova-help-center]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/help-center-module.css?v=20260914-1430';
  link.dataset.renovaHelpCenter = '1';
  document.head.appendChild(link);
}

function guideCard(icon, title, text, extra = '', tags = '') {
  return `
    <article class="hc-guide" data-hc-tags="${tags}">
      <div class="hc-guide-icon" aria-hidden="true">${icon}</div>
      <div class="hc-guide-body">
        <h3>${title}</h3>
        <p>${text}</p>
        ${extra}
      </div>
    </article>`;
}

function ensureNavButton() {
  const nav = $('#mainNav');
  if (!nav || $('#helpCenterNavBtn')) return;
  const button = document.createElement('button');
  button.id = 'helpCenterNavBtn';
  button.className = 'nav-item hc-nav-item';
  button.type = 'button';
  button.dataset.helpCenter = '1';
  button.innerHTML = '<span>?</span><b>Instruções</b>';
  button.setAttribute('aria-label', 'Abrir central de instruções');
  const separator = $('.nav-separator', nav);
  nav.insertBefore(button, separator || null);
}

function ensurePage() {
  const content = $('.content-wrap');
  if (!content || $('#helpCenterPage')) return;

  const page = document.createElement('section');
  page.id = 'helpCenterPage';
  page.className = 'page hc-page';
  page.innerHTML = `
    <div class="hc-hero">
      <div class="hc-hero-copy">
        <span class="eyebrow">CENTRAL DE INSTRUÇÕES</span>
        <h2>Encontre o caminho certo sem perder tempo.</h2>
        <p>Veja onde fazer cada ação no Minhas Finanças RENOVA, entenda os módulos e siga os passos com segurança.</p>
      </div>
      <div class="hc-hero-badge"><span>?</span><div><b>Ajuda rápida</b><small>Desktop e celular</small></div></div>
    </div>

    <div class="hc-search-wrap">
      <span aria-hidden="true">⌕</span>
      <input id="helpCenterSearch" type="search" placeholder="Ex.: lançar despesa, conectar Mercado Pago, criar conta..." autocomplete="off" />
    </div>

    <nav class="hc-jump" aria-label="Atalhos da central de instruções">
      <button type="button" data-hc-scroll="hc-start">Primeiros passos</button>
      <button type="button" data-hc-scroll="hc-finance">Financeiro</button>
      <button type="button" data-hc-scroll="hc-payments">Recebimentos</button>
      <button type="button" data-hc-scroll="hc-planning">Planejamento</button>
      <button type="button" data-hc-scroll="hc-ai">IA e assinatura</button>
      <button type="button" data-hc-scroll="hc-troubleshooting">Problemas comuns</button>
    </nav>

    <section id="hc-start" class="hc-section">
      <div class="hc-section-head"><div><span class="eyebrow">COMECE AQUI</span><h2>Primeiros passos</h2></div><span class="hc-step-count">6 etapas</span></div>
      <div class="hc-start-grid">
        <div class="hc-step"><b>1</b><div><strong>Entre na sua conta</strong><span>Use seu e-mail e senha do RENOVA.</span></div></div>
        <div class="hc-step"><b>2</b><div><strong>Cadastre uma conta financeira</strong><span>Banco, carteira, dinheiro ou conta digital.</span></div></div>
        <div class="hc-step"><b>3</b><div><strong>Registre receitas e despesas</strong><span>Informe valor, data, conta e categoria.</span></div></div>
        <div class="hc-step"><b>4</b><div><strong>Configure recorrências</strong><span>Use receita/despesa fixa por dia quando precisar.</span></div></div>
        <div class="hc-step"><b>5</b><div><strong>Conecte recebimentos</strong><span>Opcional: Mercado Pago Point ou InfinitePay.</span></div></div>
        <div class="hc-step"><b>6</b><div><strong>Acompanhe o Dashboard</strong><span>Saldo, receitas, despesas e resultado do mês.</span></div></div>
      </div>
      <div class="hc-cta-row">
        <button class="primary-btn" type="button" data-hc-go="accounts">Ir para Contas</button>
        <button class="ghost-btn" type="button" data-hc-action="new-transaction">Criar movimentação</button>
      </div>
    </section>

    <section id="hc-finance" class="hc-section">
      <div class="hc-section-head"><div><span class="eyebrow">FINANCEIRO</span><h2>Onde controlar seu dinheiro</h2></div></div>
      <div class="hc-grid">
        ${guideCard('⌂','Dashboard','É a visão geral da sua vida financeira. Mostra saldo total, receitas do mês, despesas do mês, resultado e últimos lançamentos.','<button type="button" class="hc-link" data-hc-go="dashboard">Abrir Dashboard →</button>','dashboard saldo resumo')}
        ${guideCard('↕','Movimentações','Use para registrar Receita, Despesa ou Transferência. Aqui também ficam busca, histórico e acesso às configurações de recebimento.','<button type="button" class="hc-link" data-hc-go="transactions">Abrir Movimentações →</button>','movimentacao receita despesa transferencia historico')}
        ${guideCard('▣','Contas','Cadastre as contas usadas no controle financeiro: conta corrente, poupança, carteira digital, dinheiro, investimentos ou outras.','<button type="button" class="hc-link" data-hc-go="accounts">Abrir Contas →</button>','conta banco carteira saldo patrimonio')}
        ${guideCard('⏱','Receitas e despesas fixas por dia','Ao criar uma movimentação fixa, escolha os dias da semana em que ela deve se repetir. Útil para trabalho diário, comissões e despesas recorrentes.','<button type="button" class="hc-link" data-hc-action="new-transaction">Criar lançamento →</button>','fixa recorrente dia semana segunda sabado')}
        ${guideCard('%','Multas e encargos','Em despesas com vencimento, você pode configurar multa, juros diário e encargo fixo. O RENOVA calcula o valor atualizado quando houver atraso.','','juros multa atraso vencimento encargo')}
        ${guideCard('R$','Formas de recebimento','Nas receitas, registre Dinheiro, PIX, Débito, Crédito ou Outro. Em cartão, a taxa cadastrada da maquininha permite acompanhar bruto, taxa e líquido.','<button type="button" class="hc-link" data-hc-action="payments">Configurar recebimentos →</button>','dinheiro pix debito credito taxa liquido bruto')}
      </div>
    </section>

    <section id="hc-payments" class="hc-section">
      <div class="hc-section-head"><div><span class="eyebrow">RECEBIMENTOS</span><h2>Mercado Pago Point e InfinitePay</h2></div></div>
      <div class="hc-alert hc-alert-info"><b>Segurança primeiro</b><span>O RENOVA não deve pedir sua senha, Access Token ou Client Secret. A conexão do Mercado Pago é feita pela autorização oficial OAuth.</span></div>
      <div class="hc-grid">
        ${guideCard('MP','Conectar Mercado Pago','Abra Movimentações → Recebimentos → Conectar Mercado Pago. Entre com a conta titular que receberá as vendas e autorize o RENOVA.','<button type="button" class="hc-link" data-hc-action="payments">Ir para Recebimentos →</button>','mercado pago oauth conectar titular')}
        ${guideCard('▤','Buscar e vincular sua Point','Depois da autorização, toque em Buscar minhas Points, selecione a maquininha correta e ative o modo PDV.','<button type="button" class="hc-link" data-hc-action="payments">Abrir configuração →</button>','point maquininha pdv terminal gertec')}
        ${guideCard('◇','Cobrar PIX na Point','Em uma nova Receita, escolha PIX, selecione a Point integrada e use Cobrar PIX na Point. O QR Code aparece no terminal.','','pix qr code point')}
        ${guideCard('▣','Débito e Crédito na Point','Em uma Receita, escolha Débito ou Crédito, selecione a Point e toque em Cobrar na Point. A receita só deve ser conciliada após a aprovação.','','cartao credito debito point ordem')}
        ${guideCard('∞','InfinitePay','Em Recebimentos, informe sua InfiniteTag e conecte o Checkout Integrado. A confirmação de pagamento é feita automaticamente pelo backend quando disponível.','<button type="button" class="hc-link" data-hc-action="payments">Abrir Recebimentos →</button>','infinitepay infinitetag checkout')}
        ${guideCard('✓','Conciliação automática','Pagamentos integrados usam o retorno do provedor para registrar a receita e evitar lançamentos duplicados. Não crie uma segunda receita manual enquanto a cobrança estiver processando.','','webhook conciliacao automatico duplicado')}
      </div>
      <div class="hc-alert hc-alert-warn"><b>Conta de colaborador no Mercado Pago</b><span>A autorização inicial deve ser feita pelo titular da conta recebedora. Se o Mercado Pago informar que apenas o dono pode acessar a seção, peça ao titular para concluir a conexão.</span></div>
    </section>

    <section id="hc-planning" class="hc-section">
      <div class="hc-section-head"><div><span class="eyebrow">PLANEJAMENTO</span><h2>Organize o que vem pela frente</h2></div></div>
      <div class="hc-grid">
        ${guideCard('▤','Cartões','Use o módulo Cartões para organizar cartões cadastrados e acompanhar informações relacionadas ao crédito disponíveis na sua conta.','<button type="button" class="hc-link" data-hc-go="cards">Abrir Cartões →</button>','cartao credito')}
        ${guideCard('◎','Orçamentos','Use Orçamentos para definir limites de gastos e acompanhar sua organização por período e categoria, conforme os recursos liberados.','<button type="button" class="hc-link" data-hc-go="budgets">Abrir Orçamentos →</button>','orcamento limite gasto categoria')}
        ${guideCard('◇','Metas','Use Metas para acompanhar objetivos financeiros e visualizar sua evolução conforme os recursos disponíveis no seu plano.','<button type="button" class="hc-link" data-hc-go="goals">Abrir Metas →</button>','meta objetivo economia planejamento')}
      </div>
    </section>

    <section id="hc-ai" class="hc-section">
      <div class="hc-section-head"><div><span class="eyebrow">INTELIGÊNCIA E ACESSO</span><h2>IA Financeira e assinatura</h2></div></div>
      <div class="hc-grid">
        ${guideCard('✦','IA Financeira RENOVA','Quando disponível no seu plano, use a IA Financeira para interpretar informações, tirar dúvidas e apoiar sua organização financeira.','<button type="button" class="hc-link" data-hc-go="ai">Abrir IA Financeira →</button>','ia inteligencia financeiro chat')}
        ${guideCard('★','Assinatura','Veja o status do seu plano e os recursos liberados. Funcionalidades avançadas podem depender de assinatura ativa.','<button type="button" class="hc-link" data-hc-go="subscription">Ver Assinatura →</button>','plano assinatura pagamento acesso')}
      </div>
    </section>

    <section id="hc-troubleshooting" class="hc-section">
      <div class="hc-section-head"><div><span class="eyebrow">RESOLVA RÁPIDO</span><h2>Problemas comuns</h2></div></div>
      <div class="hc-faq">
        <details class="hc-guide" data-hc-tags="point pdv frente caixa pronta"><summary>A Point mostra “Inicie a venda pelo seu sistema de frente de caixa”</summary><p>Isso é bom: significa que a maquininha está em modo PDV e aguardando uma cobrança enviada pelo RENOVA.</p></details>
        <details class="hc-guide" data-hc-tags="queued order fila terminal point"><summary>Aparece “There is already a queued order on the terminal”</summary><p>Há uma cobrança anterior pendente na maquininha. Conclua, cancele ou aguarde a expiração antes de enviar outra ordem.</p></details>
        <details class="hc-guide" data-hc-tags="colaborador titular mercado pago dono"><summary>Mercado Pago diz que apenas o dono pode visitar a seção</summary><p>A sessão está como colaborador. A autorização OAuth inicial precisa ser feita pelo titular da conta que receberá as vendas.</p></details>
        <details class="hc-guide" data-hc-tags="failed fetch erro carregar internet sessao"><summary>“Failed to fetch” ou falha ao carregar</summary><p>Confira a internet, atualize a página e entre novamente se a sessão tiver expirado. Se o erro persistir, use a Central de Ajuda para identificar o módulo e informar o erro ao suporte.</p></details>
        <details class="hc-guide" data-hc-tags="pagamento aprovado nao entrou financeiro webhook"><summary>Pagamento aprovado, mas ainda não apareceu no financeiro</summary><p>Evite lançar outra receita manual imediatamente. Aguarde a conciliação do provedor. Se persistir, o suporte pode verificar a order e o webhook sem precisar da sua senha.</p></details>
        <details class="hc-guide" data-hc-tags="contraste tema escuro claro leitura"><summary>Texto difícil de ler ou contraste ruim</summary><p>Atualize a página com Ctrl + F5 no desktop. O RENOVA possui ajustes de contraste para temas claro e escuro; se algum modal continuar ilegível, envie um print ao suporte.</p></details>
      </div>
    </section>

    <section class="hc-section hc-security">
      <div><span class="eyebrow">SEGURANÇA</span><h2>O que nunca deve ser compartilhado</h2><p>Senha do Mercado Pago, Client Secret, Access Token, service_role do Supabase ou códigos privados. As integrações devem usar autorização oficial e backend seguro.</p></div>
      <div class="hc-security-mark">🔒</div>
    </section>

    <div id="helpCenterEmpty" class="hc-empty hidden">Nenhuma instrução encontrada. Tente outra palavra.</div>
  `;
  content.appendChild(page);
}

function openHelpCenter() {
  const page = $('#helpCenterPage');
  const nav = $('#helpCenterNavBtn');
  if (!page || !nav) return;
  $$('.page').forEach(el => el.classList.remove('active'));
  $$('.nav-item').forEach(el => el.classList.remove('active'));
  page.classList.add('active');
  nav.classList.add('active');
  const eyebrow = $('#pageEyebrow');
  const title = $('#pageTitle');
  if (eyebrow) eyebrow.textContent = 'AJUDA E ORIENTAÇÃO';
  if (title) title.textContent = 'Instruções';
  document.body.classList.remove('menu-open');
  page.scrollIntoView({ block: 'start' });
}

function goToPage(page) {
  const target = $(`#mainNav [data-page="${page}"]`);
  if (target) target.click();
}

function openPayments() {
  goToPage('transactions');
  setTimeout(() => {
    const btn = $('[data-open-payment-settings]');
    if (btn) btn.click();
  }, 180);
}

function newTransaction() {
  const quick = $('#quickAddBtn');
  if (quick) quick.click();
}

function filterGuides(query) {
  const normalized = String(query || '').trim().toLowerCase();
  let visible = 0;
  $$('.hc-guide').forEach(card => {
    const haystack = `${card.textContent || ''} ${card.dataset.hcTags || ''}`.toLowerCase();
    const show = !normalized || haystack.includes(normalized);
    card.classList.toggle('hidden', !show);
    if (show) visible += 1;
  });
  $('#helpCenterEmpty')?.classList.toggle('hidden', visible > 0 || !normalized);
}

function bind() {
  document.addEventListener('click', event => {
    const nav = event.target.closest('#helpCenterNavBtn');
    if (nav) {
      event.preventDefault();
      openHelpCenter();
      return;
    }

    const go = event.target.closest('[data-hc-go]');
    if (go) {
      event.preventDefault();
      goToPage(go.dataset.hcGo);
      return;
    }

    const action = event.target.closest('[data-hc-action]');
    if (action) {
      event.preventDefault();
      if (action.dataset.hcAction === 'payments') openPayments();
      if (action.dataset.hcAction === 'new-transaction') newTransaction();
      return;
    }

    const jump = event.target.closest('[data-hc-scroll]');
    if (jump) {
      event.preventDefault();
      $(`#${jump.dataset.hcScroll}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'helpCenterSearch') filterGuides(event.target.value);
  });
}

function init() {
  ensureStyles();
  ensureNavButton();
  ensurePage();
  bind();
}

init();

window.renovaHelpCenter = { open: openHelpCenter };
