const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const esc = (v='') => String(v).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function ensureCss(){
  if(document.querySelector('link[data-mf-public-sales]')) return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./css/public-sales.css?v=20260913-0200';
  link.dataset.mfPublicSales='1';
  document.head.appendChild(link);
}

function featureList(plan){
  const f=plan?.features||{};
  const items=[];
  if(f.dashboard) items.push('Dashboard com visão clara da sua vida financeira');
  if(f.transactions) items.push('Receitas, despesas e movimentações organizadas');
  if(f.accounts) items.push('Gestão de contas e saldos em um só lugar');
  if(f.cards) items.push('Controle de cartões');
  if(f.budgets) items.push('Orçamentos e limites por categoria');
  if(f.goals) items.push('Metas financeiras e acompanhamento de evolução');
  if(f.long_term_planning) items.push('Planejamento financeiro de longo prazo');
  if(f.ai_local) items.push('Modo Análise Local RENOVA para entender riscos e prioridades');
  if(f.ai_training) items.push('Central própria de treinamento');
  if(f.business_workspace) items.push(`Workspace empresarial para até ${Number(plan.user_limit||1)} usuários`);
  if(f.team_management) items.push('Gestão de equipe');
  if(f.ai_chat) items.push('Chat IA preparado para a operação empresarial');
  return items.slice(0,8);
}

function mount(){
  if(document.getElementById('publicSalesView')) return document.getElementById('publicSalesView');
  const section=document.createElement('section');
  section.id='publicSalesView';
  section.className='mf-public hidden';
  section.innerHTML=`
    <header class="mf-public-header">
      <div class="mf-public-brand"><div class="mf-public-mark">R</div><div><strong>MINHAS FINANÇAS</strong><span>RENOVA • Gestão financeira inteligente</span></div></div>
      <nav class="mf-public-nav" aria-label="Navegação da página pública">
        <a href="#mfBenefits">Benefícios</a><a href="#mfPlans">Planos</a><a href="#mfReferral">Indique e Ganhe</a>
      </nav>
      <div class="mf-public-actions">
        <button class="mf-btn" data-public-login type="button">Já tenho conta</button>
        <button class="mf-btn primary free-cta" data-public-signup type="button">Criar conta gratuita</button>
      </div>
    </header>
    <main class="mf-public-main">
      <section class="mf-hero">
        <div class="mf-hero-copy">
          <span class="mf-eyebrow">CONTROLE • CLAREZA • TEMPO DE QUALIDADE</span>
          <h1>Organize o dinheiro. <em>Recupere seu tempo.</em></h1>
          <p>O Minhas Finanças RENOVA transforma tarefas financeiras repetitivas em uma rotina simples e organizada, para você dedicar mais atenção à família, ao negócio e às decisões que realmente dependem de você.</p>
          <div class="mf-hero-actions"><button class="mf-btn primary" data-public-signup type="button">Criar minha conta gratuita</button><button class="mf-btn" data-scroll-plans type="button">Conhecer os planos</button></div>
          <div class="mf-trust"><span>Comece gratuitamente</span><span>Desktop e mobile</span><span>Seus dados preservados</span><span>Evolua no seu ritmo</span></div>
        </div>
        <div class="mf-hero-demo" aria-label="Prévia conceitual do painel">
          <div class="mf-demo-bar"><span class="mf-demo-dot"></span><span class="mf-demo-dot"></span><span class="mf-demo-dot"></span><span class="mf-demo-title">VISÃO FINANCEIRA RENOVA</span></div>
          <div class="mf-demo-grid"><div class="mf-demo-card"><span>Saldo total</span><strong>Visão centralizada</strong></div><div class="mf-demo-card"><span>Resultado do mês</span><strong>Decisão mais rápida</strong></div><div class="mf-demo-card"><span>Orçamentos</span><strong>Limites sob controle</strong></div><div class="mf-demo-card"><span>Metas</span><strong>Progresso visível</strong></div></div>
          <div class="mf-demo-panel"><strong>Menos tarefas soltas. Mais clareza.</strong><p>Contas, movimentações, cartões, orçamentos e metas trabalhando juntos para reduzir retrabalho e facilitar sua rotina.</p></div>
        </div>
      </section>

      <section class="mf-section" id="mfBenefits">
        <div class="mf-section-head"><span class="mf-eyebrow">POR QUE O RENOVA EXISTE</span><h2>Você não precisa gastar seu melhor tempo organizando o que pode ser simplificado.</h2><p>Centralize informações, reduza tarefas manuais e tenha uma visão confiável para decidir melhor.</p></div>
        <div class="mf-pain-grid">
          <article class="mf-card"><div class="mf-card-icon">◫</div><h3>Tudo em um só lugar</h3><p>Contas, entradas, saídas, cartões, orçamento e metas deixam de ficar espalhados em anotações e planilhas desconectadas.</p></article>
          <article class="mf-card"><div class="mf-card-icon">↻</div><h3>Menos retrabalho</h3><p>Uma rotina financeira organizada reduz conferências repetidas e ajuda você a encontrar rapidamente o que precisa.</p></article>
          <article class="mf-card"><div class="mf-card-icon">◎</div><h3>Mais clareza para decidir</h3><p>Visualize o mês, acompanhe prioridades e transforme números em decisões práticas, sem depender de memória ou improviso.</p></article>
          <article class="mf-card"><div class="mf-card-icon">◇</div><h3>Planejamento que sai do papel</h3><p>Defina metas, acompanhe progresso e organize o futuro financeiro com passos que cabem na sua realidade.</p></article>
          <article class="mf-card"><div class="mf-card-icon">✦</div><h3>Análise quando você precisar</h3><p>Nos planos compatíveis, o Modo Análise Local RENOVA ajuda a identificar riscos, prioridades e pontos de atenção nos seus próprios dados.</p></article>
          <article class="mf-card"><div class="mf-card-icon">▣</div><h3>Da vida pessoal ao negócio</h3><p>Comece com sua organização financeira e evolua para uma estrutura empresarial com equipe, treinamentos e ambiente próprio.</p></article>
        </div>
      </section>

      <section class="mf-time-band">
        <div><span class="mf-eyebrow">TECNOLOGIA A SERVIÇO DA VIDA</span><h2>Automatize o simples. Preserve sua energia para o que só você pode fazer.</h2><p>O objetivo não é viver olhando números. É organizar os processos simples para sobrar atenção para conversar com a família, acompanhar seus filhos, cuidar de clientes, criar estratégias e tomar decisões importantes no seu negócio.</p></div>
        <div class="mf-time-points"><div class="mf-time-point"><div>⌂</div><div><b>Mais presença com a família</b><span>Menos tempo procurando informações e refazendo controles.</span></div></div><div class="mf-time-point"><div>⚙</div><div><b>Mais foco no negócio</b><span>Informação organizada para você agir onde sua experiência realmente faz diferença.</span></div></div><div class="mf-time-point"><div>↗</div><div><b>Mais qualidade nas decisões</b><span>Visibilidade financeira para escolher prioridades com mais segurança.</span></div></div></div>
      </section>

      <section class="mf-section">
        <div class="mf-section-head"><span class="mf-eyebrow">RECURSOS QUE TRABALHAM JUNTOS</span><h2>Uma rotina financeira construída para ser simples de usar e fácil de acompanhar.</h2></div>
        <div class="mf-feature-grid"><article class="mf-card"><div class="mf-card-icon">⌂</div><h3>Dashboard</h3><p>Saldo, receitas, despesas e resultado do mês em uma visão direta.</p></article><article class="mf-card"><div class="mf-card-icon">↕</div><h3>Movimentações</h3><p>Histórico organizado de receitas, despesas e transferências.</p></article><article class="mf-card"><div class="mf-card-icon">▣</div><h3>Contas</h3><p>Acompanhe saldos e organize onde seu dinheiro está.</p></article><article class="mf-card"><div class="mf-card-icon">▤</div><h3>Cartões</h3><p>Controle seus cartões junto da mesma rotina financeira.</p></article><article class="mf-card"><div class="mf-card-icon">◎</div><h3>Orçamentos</h3><p>Defina limites e acompanhe categorias para evitar surpresas.</p></article><article class="mf-card"><div class="mf-card-icon">◇</div><h3>Metas</h3><p>Transforme objetivos em acompanhamento visual de progresso.</p></article></div>
      </section>

      <section class="mf-section" id="mfPlans">
        <div class="mf-section-head"><span class="mf-eyebrow">PLANOS MINHAS FINANÇAS RENOVA</span><h2>Comece simples e evolua conforme a sua necessidade.</h2><p>Os valores e recursos abaixo são carregados da configuração oficial do RENOVA.</p></div>
        <div id="mfPlansGrid" class="mf-plans-grid"><div class="mf-sales-loading">Carregando planos...</div></div>
      </section>

      <section class="mf-section" id="mfReferral">
        <div class="mf-section-head"><span class="mf-eyebrow">CRESÇA JUNTO COM O RENOVA</span><h2>Indique, ganhe e evolua.</h2><p>Quando uma ferramenta ajuda você, ela também pode ajudar alguém próximo — e sua indicação pode gerar benefício financeiro recorrente.</p></div>
        <div class="mf-referral">
          <article class="mf-referral-card highlight"><span class="mf-eyebrow">INDIQUE E GANHE</span><h3>Transforme boas indicações em comissão recorrente.</h3><p>Compartilhe seu link de indicação. Quando uma pessoa indicada mantém um plano pago válido, o sistema registra automaticamente a comissão prevista pelas regras do programa.</p><div class="mf-referral-list"><span>Link de indicação individual dentro da sua conta</span><span>Acompanhamento de indicados ativos</span><span>Comissões registradas pelo próprio sistema</span><span>Regra atual dos planos públicos: <strong id="mfReferralRate">25%</strong></span></div></article>
          <article class="mf-referral-card"><span class="mf-eyebrow">INDIQUE E EVOLUA</span><h3>Seu crescimento pode acompanhar o crescimento da comunidade.</h3><p>Além de organizar sua própria vida financeira, você pode apresentar o RENOVA a outras pessoas, acompanhar os resultados das suas indicações e usar essa evolução para fortalecer seus próprios objetivos.</p><div class="mf-referral-list"><span>Uma forma simples de recomendar algo que você já utiliza</span><span>Painel para acompanhar indicações e comissões</span><span>Benefício recorrente enquanto a indicação permanecer válida</span><span>Participação no crescimento do Ecossistema RENOVA</span></div></article>
        </div>
      </section>

      <section class="mf-cta"><span class="mf-eyebrow">COMECE NO SEU RITMO</span><h2>Mais organização financeira. Mais tempo para viver, decidir e construir.</h2><p>Crie sua conta gratuita para conhecer o Minhas Finanças RENOVA. Quando fizer sentido, evolua para o plano que acompanha o seu momento.</p><div class="mf-hero-actions"><button class="mf-btn primary" data-public-signup type="button">Criar conta gratuita</button><button class="mf-btn" data-public-login type="button">Já tenho conta — Entrar</button></div></section>

      <footer class="mf-public-footer"><span>© Minhas Finanças RENOVA • Ecossistema RENOVA</span><span>Organização • Clareza • Tempo de qualidade</span></footer>
    </main>`;
  document.body.prepend(section);
  return section;
}

export function createPublicSales({supabase,onAuth}){
  ensureCss();
  const view=mount();
  let plans=[];

  function show(){view.classList.remove('hidden');document.body.classList.add('public-sales-open');window.scrollTo({top:0,behavior:'instant'});}
  function hide(){view.classList.add('hidden');document.body.classList.remove('public-sales-open');}

  function openAuth(mode='login',planCode=''){
    if(planCode) localStorage.setItem('renova_pending_plan',planCode);
    hide();
    onAuth?.(mode);
  }

  function renderPlans(){
    const grid=document.getElementById('mfPlansGrid');
    if(!grid) return;
    if(!plans.length){grid.innerHTML='<div class="mf-sales-loading">Os planos não puderam ser carregados agora. Você ainda pode criar sua conta gratuita.</div>';return;}
    grid.innerHTML=plans.map(plan=>{
      const features=featureList(plan);
      const recommended=plan.code==='renova_analise';
      const business=plan.code==='renova_business';
      return `<article class="mf-plan ${recommended?'recommended':''} ${business?'business':''}">${recommended?'<span class="mf-plan-ribbon">MAIS RECOMENDADO</span>':''}<span class="mf-eyebrow">${business?'EMPRESAS':'PLANO RENOVA'}</span><h3>${esc(plan.name)}</h3><p class="mf-plan-copy">${esc(plan.description||plan.promise||'')}</p><div class="mf-plan-price"><strong>${money.format(Number(plan.price||0))}</strong><span>/ 30 dias</span></div>${Number(plan.setup_price||0)>0?`<div class="mf-plan-setup">Implantação de lançamento: <strong>${money.format(Number(plan.setup_price))}</strong></div>`:''}<div class="mf-plan-features">${features.map(f=>`<span>${esc(f)}</span>`).join('')}</div><button class="mf-btn ${recommended?'primary':''}" data-choose-plan="${esc(plan.code)}" type="button">Criar conta e escolher este plano</button></article>`;
    }).join('');
    grid.querySelectorAll('[data-choose-plan]').forEach(btn=>btn.addEventListener('click',()=>openAuth('signup',btn.dataset.choosePlan)));
    const rate=Math.max(0,...plans.map(p=>Number(p.referral_rate||0)));
    const rateEl=document.getElementById('mfReferralRate');
    if(rateEl&&rate>0) rateEl.textContent=`${Math.round(rate*100)}%`;
  }

  async function loadPlans(){
    const {data,error}=await supabase.from('ai_subscription_plans').select('code,name,price,description,promise,features,user_limit,setup_price,referral_rate,is_active,is_public,sort_order').eq('is_active',true).eq('is_public',true).order('sort_order');
    if(!error) plans=data||[];
    renderPlans();
  }

  view.querySelectorAll('[data-public-login]').forEach(btn=>btn.addEventListener('click',()=>openAuth('login')));
  view.querySelectorAll('[data-public-signup]').forEach(btn=>btn.addEventListener('click',()=>openAuth('signup')));
  view.querySelectorAll('[data-scroll-plans]').forEach(btn=>btn.addEventListener('click',()=>document.getElementById('mfPlans')?.scrollIntoView({behavior:'smooth'})));
  loadPlans();

  return {show,hide,loadPlans};
}
