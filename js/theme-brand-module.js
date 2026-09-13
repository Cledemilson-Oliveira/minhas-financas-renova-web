const THEME_KEY='renova_theme';
const root=document.documentElement;
const BRAND_LOGO='https://ysxttnnkuyhzvkjheqfy.supabase.co/storage/v1/object/public/renova-assets/LOGO';
const DEVELOPER_IMAGE='https://ysxttnnkuyhzvkjheqfy.supabase.co/storage/v1/object/public/renova-assets/DESENVOLVEDOR%20DO%20SISTEMA';
const ECOSSISTEMA_URL='https://ecossistemarenova.servicosgold.com.br';
const FALLBACK_LOGO='./assets/renova-brand.svg?v=20260913-0100';

function ensureBrandAssetStyles(){
  if(document.querySelector('link[data-renova-brand-assets]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./css/theme-brand-supabase.css?v=20260913-0140';
  link.dataset.renovaBrandAssets='1';
  document.head.appendChild(link);
}

function preferredTheme(){
  const saved=localStorage.getItem(THEME_KEY);
  return saved==='light'||saved==='dark'?saved:'dark';
}

function applyTheme(theme){
  root.dataset.theme=theme;
  localStorage.setItem(THEME_KEY,theme);
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',theme==='light'?'#eef4f9':'#050912');
  const btn=document.querySelector('#renovaThemeToggle');
  if(btn){
    const icon=btn.querySelector('.renova-theme-icon');
    const text=btn.querySelector('.renova-theme-text');
    const next=theme==='dark'?'light':'dark';
    if(icon)icon.textContent=theme==='dark'?'☀':'☾';
    if(text)text.textContent=theme==='dark'?'Modo claro':'Modo escuro';
    btn.setAttribute('aria-label',`Ativar modo ${next==='light'?'claro':'escuro'}`);
    btn.title=`Ativar modo ${next==='light'?'claro':'escuro'}`;
  }
  window.dispatchEvent(new CustomEvent('renova:themechange',{detail:{theme}}));
}

function applyImageFallbacks(card){
  const logo=card.querySelector('.renova-company-logo');
  const developer=card.querySelector('.renova-developer-image');
  logo?.addEventListener('error',()=>{
    if(logo.src!==new URL(FALLBACK_LOGO,location.href).href)logo.src=FALLBACK_LOGO;
  },{once:true});
  developer?.addEventListener('error',()=>{
    developer.style.display='none';
    card.classList.add('renova-developer-no-image');
  },{once:true});
}

function normalizeConnectionLabel(){
  const badge=document.querySelector('#connectionBadge');
  if(!badge)return;
  const sync=()=>{
    if((badge.textContent||'').trim().toLowerCase()==='supabase conectado'){
      badge.innerHTML='<i></i> Conectado';
    }
  };
  sync();
  new MutationObserver(sync).observe(badge,{childList:true,subtree:true,characterData:true});
}

function closeMobileMenu(){
  document.body.classList.remove('menu-open');
  const openBtn=document.querySelector('#mobileMenuBtn');
  if(openBtn)openBtn.setAttribute('aria-expanded','false');
}

function ensureMobileMenuUx(){
  const sidebar=document.querySelector('#sidebar');
  const sidebarHead=sidebar?.querySelector('.sidebar-head');
  const nav=document.querySelector('#mainNav');
  const openBtn=document.querySelector('#mobileMenuBtn');
  const backdrop=document.querySelector('#mobileBackdrop');
  if(!sidebar||!sidebarHead||!nav)return;

  // Assinatura fica antes da área de IA para permanecer visível e favorecer conversão.
  const subscription=nav.querySelector('[data-page="subscription"]');
  const separator=nav.querySelector('.nav-separator');
  if(subscription&&separator&&subscription.previousElementSibling!==separator){
    nav.insertBefore(subscription,separator);
  }

  if(!document.querySelector('#renovaMobileMenuClose')){
    const closeBtn=document.createElement('button');
    closeBtn.id='renovaMobileMenuClose';
    closeBtn.className='icon-btn mobile-only renova-mobile-menu-close';
    closeBtn.type='button';
    closeBtn.setAttribute('aria-label','Fechar menu');
    closeBtn.textContent='×';
    sidebarHead.appendChild(closeBtn);
    closeBtn.addEventListener('click',closeMobileMenu);
  }

  if(openBtn){
    openBtn.setAttribute('aria-expanded',document.body.classList.contains('menu-open')?'true':'false');
    openBtn.setAttribute('aria-controls','sidebar');
    openBtn.addEventListener('click',()=>{
      requestAnimationFrame(()=>openBtn.setAttribute('aria-expanded',document.body.classList.contains('menu-open')?'true':'false'));
    });
  }

  // Reforço: qualquer escolha do menu fecha o drawer no mobile.
  nav.addEventListener('click',event=>{
    if(event.target.closest('[data-page]'))requestAnimationFrame(closeMobileMenu);
  });
  backdrop?.addEventListener('click',closeMobileMenu);

  window.addEventListener('resize',()=>{
    if(window.innerWidth>760)closeMobileMenu();
  });
}

function ensureCard(){
  const sidebar=document.querySelector('#sidebar');
  const nav=document.querySelector('#mainNav');
  if(!sidebar||!nav)return;

  let card=document.querySelector('#renovaCompanyCard');
  if(!card){
    card=document.createElement('section');
    card.id='renovaCompanyCard';
    card.className='renova-company-card renova-company-card-vertical';
    card.setAttribute('aria-label','Informações do Ecossistema RENOVA');
    card.innerHTML=`
      <div class="renova-company-brand renova-company-brand-vertical">
        <img class="renova-company-logo" src="${BRAND_LOGO}" alt="Logo Ecossistema RENOVA">
        <div class="renova-company-copy">
          <strong>ECOSSISTEMA RENOVA</strong>
          <span>Gestão • Controle • Resultados</span>
        </div>
      </div>

      <div class="renova-company-creator renova-company-creator-vertical">
        <img class="renova-developer-image" src="${DEVELOPER_IMAGE}" alt="Cledemilson Oliveira de Assis, desenvolvedor do Ecossistema RENOVA">
        <div>
          <span>Desenvolvedor do Ecossistema RENOVA</span>
          <b>Cledemilson Oliveira de Assis</b>
        </div>
      </div>

      <a class="renova-ecosystem-link" href="${ECOSSISTEMA_URL}" target="_blank" rel="noopener noreferrer" aria-label="Acessar site do Ecossistema RENOVA">
        <span>↗</span><b>Acessar Ecossistema RENOVA</b>
      </a>

      <button id="renovaThemeToggle" class="renova-theme-toggle" type="button">
        <span class="renova-theme-icon">☀</span>
        <span class="renova-theme-text">Modo claro</span>
      </button>`;

    nav.insertAdjacentElement('afterend',card);
    applyImageFallbacks(card);
    document.querySelector('#renovaThemeToggle')?.addEventListener('click',()=>applyTheme(root.dataset.theme==='light'?'dark':'light'));
  }

  normalizeConnectionLabel();
  ensureMobileMenuUx();
  applyTheme(root.dataset.theme||preferredTheme());
}

ensureBrandAssetStyles();
applyTheme(root.dataset.theme||preferredTheme());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureCard,{once:true});else ensureCard();
