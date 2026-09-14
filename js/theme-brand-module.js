import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { createPublicSales } from './public-sales.js?v=20260913-0210';

const THEME_KEY='renova_theme_v2';
const root=document.documentElement;
const BRAND_LOGO='https://ysxttnnkuyhzvkjheqfy.supabase.co/storage/v1/object/public/renova-assets/LOGO';
const DEVELOPER_IMAGE='https://ysxttnnkuyhzvkjheqfy.supabase.co/storage/v1/object/public/renova-assets/DESENVOLVEDOR%20DO%20SISTEMA';
const DEVELOPER_PAGE_URL='https://cledemilson-oliveira.github.io/ecossistema-renova-web/desenvolvedor.html';
const FALLBACK_LOGO='./assets/renova-brand.svg?v=20260913-0100';

function ensureBrandAssetStyles(){
  if(!document.querySelector('link[data-renova-brand-assets]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='./css/theme-brand-supabase.css?v=20260913-0170';
    link.dataset.renovaBrandAssets='1';
    document.head.appendChild(link);
  }
  if(!document.querySelector('link[data-renova-nextgo-menu]')){
    const menuLink=document.createElement('link');
    menuLink.rel='stylesheet';
    menuLink.href='./css/mobile-menu-nextgo.css?v=20260913-0170';
    menuLink.dataset.renovaNextgoMenu='1';
    document.head.appendChild(menuLink);
  }
}

function preferredTheme(){
  const saved=localStorage.getItem(THEME_KEY);
  return saved==='light'||saved==='dark'?saved:'light';
}

function applyTheme(theme){
  root.dataset.theme=theme;
  root.dataset.userTheme='1';
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
  syncMobileMenuButton();
}

function syncMobileMenuButton(){
  const openBtn=document.querySelector('#mobileMenuBtn');
  if(!openBtn)return;
  const opened=document.body.classList.contains('menu-open');
  openBtn.setAttribute('aria-expanded',opened?'true':'false');
  openBtn.setAttribute('aria-label',opened?'Fechar menu':'Abrir menu');
  openBtn.innerHTML=opened?'<span aria-hidden="true">×</span><b>Fechar</b>':'<span aria-hidden="true">☰</span><b>Menu</b>';
}

function ensureMobileMenuUx(){
  const sidebar=document.querySelector('#sidebar');
  const sidebarHead=sidebar?.querySelector('.sidebar-head');
  const nav=document.querySelector('#mainNav');
  const openBtn=document.querySelector('#mobileMenuBtn');
  const backdrop=document.querySelector('#mobileBackdrop');
  if(!sidebar||!sidebarHead||!nav)return;

  sidebar.classList.add('renova-mobile-dropdown');

  const subscription=nav.querySelector('[data-page="subscription"]');
  const separator=nav.querySelector('.nav-separator');
  if(subscription&&separator&&subscription.previousElementSibling!==separator){
    nav.insertBefore(subscription,separator);
  }

  document.querySelector('#renovaMobileMenuClose')?.remove();

  if(openBtn&&!openBtn.dataset.renovaDropdownBound){
    openBtn.dataset.renovaDropdownBound='1';
    openBtn.setAttribute('aria-controls','sidebar');
    openBtn.setAttribute('aria-haspopup','menu');
    openBtn.addEventListener('click',()=>requestAnimationFrame(syncMobileMenuButton));
  }

  if(!nav.dataset.renovaDropdownBound){
    nav.dataset.renovaDropdownBound='1';
    nav.addEventListener('click',event=>{
      if(event.target.closest('[data-page]'))requestAnimationFrame(closeMobileMenu);
    });
  }

  if(backdrop&&!backdrop.dataset.renovaDropdownBound){
    backdrop.dataset.renovaDropdownBound='1';
    backdrop.addEventListener('click',closeMobileMenu);
  }

  if(!document.body.dataset.renovaDropdownKeys){
    document.body.dataset.renovaDropdownKeys='1';
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&document.body.classList.contains('menu-open'))closeMobileMenu();
    });
    window.addEventListener('resize',()=>{
      if(window.innerWidth>760)closeMobileMenu();
    });
  }

  syncMobileMenuButton();
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

      <a class="renova-ecosystem-link" href="${DEVELOPER_PAGE_URL}" target="_blank" rel="noopener noreferrer" aria-label="Conhecer o desenvolvedor do Ecossistema RENOVA">
        <span>↗</span><b>Conhecer o desenvolvedor</b>
      </a>

      <button id="renovaThemeToggle" class="renova-theme-toggle" type="button">
        <span class="renova-theme-icon">☾</span>
        <span class="renova-theme-text">Modo escuro</span>
      </button>`;

    nav.insertAdjacentElement('afterend',card);
    applyImageFallbacks(card);
    document.querySelector('#renovaThemeToggle')?.addEventListener('click',()=>applyTheme(root.dataset.theme==='light'?'dark':'light'));
  }

  normalizeConnectionLabel();
  ensureMobileMenuUx();
  applyTheme(preferredTheme());
}

let publicSales=null;
let publicAuthRequested=false;

function setAuthTab(mode='login'){
  document.querySelectorAll('.auth-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.authTab===mode));
  document.querySelector('#loginForm')?.classList.toggle('active',mode==='login');
  document.querySelector('#signupForm')?.classList.toggle('active',mode==='signup');
}

function showAuthFromSales(mode='login'){
  publicAuthRequested=true;
  publicSales?.hide();
  document.querySelector('#appView')?.classList.add('hidden');
  document.querySelector('#authView')?.classList.remove('hidden');
  setAuthTab(mode);
  window.scrollTo({top:0,behavior:'instant'});
}

async function ensurePublicSales(){
  const authView=document.querySelector('#authView');
  const appView=document.querySelector('#appView');
  if(!authView||!appView)return;

  const publicSupabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  publicSales=createPublicSales({supabase:publicSupabase,onAuth:showAuthFromSales});

  const showSales=()=>{
    authView.classList.add('hidden');
    appView.classList.add('hidden');
    publicSales?.show();
  };

  const {data:{session}}=await publicSupabase.auth.getSession();
  if(session?.user){
    publicAuthRequested=false;
    publicSales.hide();
  }else{
    publicAuthRequested=false;
    showSales();
  }

  publicSupabase.auth.onAuthStateChange((event,nextSession)=>{
    if(nextSession?.user){
      publicAuthRequested=false;
      publicSales?.hide();
      return;
    }
    if(event==='SIGNED_OUT')publicAuthRequested=false;
    if(!publicAuthRequested)showSales();
  });
}

ensureBrandAssetStyles();
applyTheme(preferredTheme());
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{ensureCard();ensurePublicSales();},{once:true});
}else{
  ensureCard();
  ensurePublicSales();
}
