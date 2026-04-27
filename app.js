const { 
  auth, db, storage, gProv, 
  onAuthStateChanged, signInWithPopup, signOut, 
  collection, doc, onSnapshot, addDoc, updateDoc, 
  deleteDoc, getDoc, getDocs, query, orderBy, 
  where, serverTimestamp, ref, uploadBytes, getDownloadURL 
} = window._fb;
// ═══════════════════════════════════════════════════════════
//  CIPÓ DELIVERY — app.js
//  Versão SaaS · Firebase · Mercado Pago Pix · Anti-Golpe
// ═══════════════════════════════════════════════════════════

'use strict';

/* ── Aguarda Firebase ─────────────────────────────────────── */
const _BOOT = setInterval(() => {
  if (window._fb) { clearInterval(_BOOT); _boot(); }
}, 80);

/* ── Estado Global ────────────────────────────────────────── */
const S = {
  user:          null,
  currentScreen: 'home',
  currentMoment: 'todos',
  currentStore:  null,           // { id, data }
  lojistaStoreId: null,
  cart: {
    storeId:      null,
    storeName:    '',
    deliveryFee:  0,
    items:        [],
  },
  orderFilter:   'pendente',
  mapInit:       false,
  bannerIndex:   0,
  bannerTimer:   null,
  pixPolling:    null,
  pixOrderId:    null,
  pendingAfterLogin: null,      // função a executar após login
};

/* ── Unsubs (listeners em tempo real) ─────────────────────── */
const UNSUB = {};

/* ─────────────────────────────────────────────────────────── */
/*  BOOT                                                       */
/* ─────────────────────────────────────────────────────────── */
function _boot() {
  const { auth, onAuthStateChanged } = _fb;

  onAuthStateChanged(auth, user => {
    S.user = user;
    _updateAuthUI(user);
    if (S.currentScreen === 'orders') _loadOrders();
  });

  // Splash → app
  setTimeout(() => {
    const splash = document.getElementById('splash');
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      _loadBanners();
      _loadStores();
    }, 500);
  }, 1800);
}

/* ─────────────────────────────────────────────────────────── */
/*  AUTH                                                       */
/* ─────────────────────────────────────────────────────────── */
function _updateAuthUI(user) {
  const avatar  = document.getElementById('profile-avatar');
  const name    = document.getElementById('profile-name');
  const email   = document.getElementById('profile-email');
  const btn     = document.getElementById('btn-auth');

  if (user) {
    name.textContent  = `Olá, ${user.displayName?.split(' ')[0] || 'usuário'}!`;
    email.textContent = user.email || '';
    btn.textContent   = 'Sair';
    btn.onclick       = doLogout;
    if (user.photoURL) {
      avatar.innerHTML = `<img src="${user.photoURL}" alt="foto"/>`;
    }
  } else {
    name.textContent  = 'Olá, visitante!';
    email.textContent = '';
    btn.textContent   = 'Entrar';
    btn.onclick       = handleAuthBtn;
    avatar.innerHTML  = '<i class="fa-solid fa-user"></i>';
  }
}

function handleAuthBtn() {
  const user = auth.currentUser;
  if (user) {
    signOut(auth); 
  } else {
    doLogin(); 
  }
}

async function doLogin() {
  try {
    await signInWithPopup(auth, gProv);
    console.log("Login realizado com sucesso!");
  } catch (error) {
    console.error("Erro no login:", error);
    if (typeof showToast === "function") showToast("Erro ao entrar com Google");
  }
}

async function doLogout() {
  await _fb.signOut(_fb.auth);
  S.user = null;
  toast('Até logo! 👋');
}

function openLoginModal() {
  document.getElementById('login-modal').classList.remove('hidden');
}
function closeLoginModal(e) {
  if (e && e.target !== document.getElementById('login-modal')) return;
  document.getElementById('login-modal').classList.add('hidden');
}

/* ─────────────────────────────────────────────────────────── */
/*  NAVEGAÇÃO                                                  */
/* ─────────────────────────────────────────────────────────── */
function navigate(screenId) {
  // Esconde telas
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = '';
  });

  const el = document.getElementById('screen-' + screenId);
  if (!el) return;
  el.classList.add('active');
  S.currentScreen = screenId;

  // Nav ativa
  ['home','orders','profile'].forEach(id => {
    document.getElementById('nav-' + id)?.classList.toggle('active', id === screenId);
  });

  // Side-effects por tela
  if (screenId === 'orders')  _loadOrders();
  if (screenId === 'profile') _checkLojistaLink();
}

/* ─────────────────────────────────────────────────────────── */
/*  BANNERS ROTATIVOS                                          */
/* ─────────────────────────────────────────────────────────── */
function _loadBanners() {
  const { db, collection, query, orderBy, onSnapshot } = _fb;
  try {
    const q = query(collection(db, 'banners'), orderBy('order', 'asc'));
    onSnapshot(q, snap => {
      const banners = [];
      snap.forEach(d => banners.push({ id: d.id, ...d.data() }));
      if (banners.length) _renderBanners(banners);
    });
  } catch(e) { /* fallback estático já no HTML */ }
}

function _renderBanners(banners) {
  const track = document.getElementById('banner-track');
  const dots  = document.getElementById('banner-dots');
  if (!track || !banners.length) return;

  track.innerHTML = banners.map(b => `
    <div class="banner" style="${b.bgColor ? 'background:'+b.bgColor : ''}">
      <div class="banner-text">
        ${b.tag ? `<span class="banner-tag">${_esc(b.tag)}</span>` : ''}
        <h3>${_esc(b.title || '')}</h3>
        ${b.cta ? `<span class="banner-cta">${_esc(b.cta)}</span>` : ''}
      </div>
      <div class="banner-img">${b.emoji || '🛵'}</div>
    </div>
  `).join('');

  dots.innerHTML = banners.map((_, i) =>
    `<span class="${i === 0 ? 'active' : ''}"></span>`
  ).join('');

  // Auto-rotate
  clearInterval(S.bannerTimer);
  if (banners.length > 1) {
    S.bannerIndex = 0;
    S.bannerTimer = setInterval(() => {
      S.bannerIndex = (S.bannerIndex + 1) % banners.length;
      _rotateBanner(banners.length);
    }, 4000);
  }
}

function _rotateBanner(total) {
  const dots = document.querySelectorAll('#banner-dots span');
  dots.forEach((d, i) => d.classList.toggle('active', i === S.bannerIndex));
}

/* ─────────────────────────────────────────────────────────── */
/*  LOJAS                                                      */
/* ─────────────────────────────────────────────────────────── */
function _loadStores() {
  const { db, collection, query, orderBy, onSnapshot, where } = _fb;
  if (UNSUB.stores) UNSUB.stores();

  try {
    const q = query(
      collection(db, 'stores'),
      where('active', '==', true),
      orderBy('rating', 'desc')
    );
    UNSUB.stores = onSnapshot(q, snap => {
      const stores = [];
      snap.forEach(d => stores.push({ id: d.id, ...d.data() }));
      _renderStores(stores);
    });
  } catch(e) {
    // Demo fallback quando Firebase não configurado
    _renderStoresFallback();
  }
}

function _renderStoresFallback() {
  const DEMO = [
    { id:'d1', name:'Pizzaria do Zé',   emoji:'🍕', rating:4.8, deliveryTime:'30–45', deliveryFee:0,   isOpen:true,  moment:'almoco',  category:'Pizza • Italiana',      active:true },
    { id:'d2', name:'Burguer Cipó',      emoji:'🍔', rating:4.6, deliveryTime:'20–35', deliveryFee:3.5, isOpen:true,  moment:'lanches', category:'Lanches • Hambúrguer',  active:true },
    { id:'d3', name:'Açaí da Serra',     emoji:'🫐', rating:4.9, deliveryTime:'15–25', deliveryFee:0,   isOpen:true,  moment:'madruga', category:'Açaí • Sorvetes',       active:true },
    { id:'d4', name:'Brasa & Brasa',     emoji:'🥩', rating:4.7, deliveryTime:'40–55', deliveryFee:5,   isOpen:false, moment:'jantar',  category:'Churrasco • Marmita',   active:true },
    { id:'d5', name:'Depósito do Frio',  emoji:'🥤', rating:4.5, deliveryTime:'10–20', deliveryFee:2,   isOpen:true,  moment:'bebidas', category:'Bebidas • Conveniência',active:true },
    { id:'d6', name:'Tapioca da Mana',   emoji:'🌮', rating:4.4, deliveryTime:'20–30', deliveryFee:3,   isOpen:true,  moment:'almoco',  category:'Tapioca • Salgados',    active:true },
  ];
  _renderStores(DEMO);
  toast('⚙️ Configure o Firebase para dados reais', false, 5000);
}

function _renderStores(allStores) {
  const skel  = document.getElementById('stores-skeleton');
  const list  = document.getElementById('stores-list');
  const empty = document.getElementById('stores-empty');
  const count = document.getElementById('store-count');

  const stores = S.currentMoment === 'todos'
    ? allStores
    : allStores.filter(s => s.moment === S.currentMoment);

  skel.classList.add('hidden');

  if (!stores.length) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    count.textContent = '';
    return;
  }
  empty.classList.add('hidden');
  list.classList.remove('hidden');
  count.textContent = `${stores.length} loja${stores.length > 1 ? 's' : ''}`;
  list.innerHTML = stores.map(_storeCard).join('');
}

function _storeCard(s) {
  const fee = +s.deliveryFee === 0
    ? `<span class="delivery-fee free">Taxa: Grátis</span>`
    : `<span class="delivery-fee">Taxa: R$ ${(+s.deliveryFee).toFixed(2)}</span>`;
  const closedBadge = !s.isOpen ? `<span class="card-badge fechada">Fechado</span>` : '';
  const grad = _grad(s.emoji);

  return `
  <div class="restaurant-card" onclick="openStore('${s.id}')">
    <div class="card-img">
      <div class="card-img-bg" style="background:linear-gradient(135deg,${grad})"></div>
      <div class="card-img-overlay"></div>
      ${closedBadge}
      <div class="card-emoji-wrap">${s.emoji || '🍽️'}</div>
    </div>
    <div class="card-body">
      <div class="card-title-row">
        <h3>${_esc(s.name)}</h3>
        <span class="card-rating"><i class="fa-solid fa-star"></i>${(+s.rating||0).toFixed(1)}</span>
      </div>
      <p class="card-subtitle">${_esc(s.category||'')}</p>
      <div class="card-meta">
        <span><i class="fa-regular fa-clock"></i> ${s.deliveryTime||'?'}min</span>
        ${fee}
      </div>
    </div>
  </div>`;
}

/* ─────────────────────────────────────────────────────────── */
/*  FILTRO DE CATEGORIA                                        */
/* ─────────────────────────────────────────────────────────── */
function filterCategory(btn, moment) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.currentMoment = moment;
  _loadStores();
}

/* ─────────────────────────────────────────────────────────── */
/*  BUSCA                                                      */
/* ─────────────────────────────────────────────────────────── */
function handleSearch(val) {
  document.getElementById('search-clear').classList.toggle('hidden', !val.trim());
  if (!val.trim()) { _loadStores(); return; }
  const items = document.querySelectorAll('#stores-list .restaurant-card');
  items.forEach(el => {
    const name = el.querySelector('h3')?.textContent?.toLowerCase() || '';
    const cat  = el.querySelector('.card-subtitle')?.textContent?.toLowerCase() || '';
    el.style.display = (name + cat).includes(val.toLowerCase()) ? '' : 'none';
  });
}
function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').classList.add('hidden');
  _loadStores();
}

/* ─────────────────────────────────────────────────────────── */
/*  DETALHE DA LOJA                                            */
/* ─────────────────────────────────────────────────────────── */
async function openStore(storeId) {
  navigate('store');
  S.currentStore = { id: storeId, data: null };

  // Reset
  document.getElementById('products-skeleton').classList.remove('hidden');
  document.getElementById('products-list').classList.add('hidden');
  document.getElementById('products-empty').classList.add('hidden');
  document.getElementById('store-closed-banner').classList.add('hidden');

  const { db, doc, getDoc, collection, query, where, orderBy, onSnapshot } = _fb;

  try {
    const snap = await getDoc(doc(db, 'stores', storeId));
    if (!snap.exists()) { toast('Loja não encontrada', true); return; }
    const store = { id: snap.id, ...snap.data() };
    S.currentStore.data = store;
    _renderStoreHero(store);
    if (!store.isOpen) document.getElementById('store-closed-banner').classList.remove('hidden');

    // Produtos
    if (UNSUB.products) UNSUB.products();
    const pq = query(
      collection(db, 'stores', storeId, 'products'),
      where('active', '==', true),
      orderBy('rating', 'desc')
    );
    UNSUB.products = onSnapshot(pq, psnap => {
      const prods = [];
      psnap.forEach(d => prods.push({ id: d.id, ...d.data() }));
      _renderProducts(prods, store);
    });
  } catch(e) {
    // Demo fallback
    _renderStoreHeroFallback();
    _renderProductsFallback();
  }
}

function _renderStoreHero(s) {
  document.getElementById('store-hero-bg').style.background = `linear-gradient(135deg,${_grad(s.emoji)})`;
  document.getElementById('store-hero-emoji').textContent = s.emoji || '🍽️';
  document.getElementById('store-hero-name').textContent = s.name || '';
  document.getElementById('store-hero-meta').innerHTML =
    `<span>⭐ ${(+s.rating||0).toFixed(1)}</span>
     <span>·</span>
     <span><i class="fa-regular fa-clock"></i> ${s.deliveryTime||'?'}min</span>`;

  const fee = +s.deliveryFee === 0
    ? `<span style="color:var(--green);font-weight:700">Taxa: Grátis</span>`
    : `<span>Taxa: <strong>R$ ${(+s.deliveryFee).toFixed(2)}</strong></span>`;

  document.getElementById('store-info-strip').innerHTML =
    `${fee}
     ${s.category ? `<span>·</span><span>${_esc(s.category)}</span>` : ''}
     ${s.hours    ? `<span><i class="fa-regular fa-clock"></i> ${_esc(s.hours)}</span>` : ''}
     ${s.whatsapp ? `<span><a href="https://wa.me/55${s.whatsapp.replace(/\D/g,'')}" target="_blank" style="color:var(--green)"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a></span>` : ''}`;
}

function _renderStoreHeroFallback() {
  document.getElementById('store-hero-bg').style.background = `linear-gradient(135deg,#FF6B35,#F7931E)`;
  document.getElementById('store-hero-emoji').textContent = '🍕';
  document.getElementById('store-hero-name').textContent = 'Pizzaria do Zé';
  document.getElementById('store-hero-meta').innerHTML = '<span>⭐ 4.8</span><span>·</span><span>30–45min</span>';
  document.getElementById('store-info-strip').innerHTML = '<span style="color:var(--green);font-weight:700">Taxa: Grátis</span>';
}

function _renderProducts(products, store) {
  document.getElementById('products-skeleton').classList.add('hidden');
  const list  = document.getElementById('products-list');
  const empty = document.getElementById('products-empty');

  if (!products.length) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  list.classList.remove('hidden');
  empty.classList.add('hidden');
  list.innerHTML = products.map(p => _productCard(p, store)).join('');
}

function _productCard(p, store) {
  const img = p.photoURL
    ? `<img src="${p.photoURL}" alt="${_esc(p.name)}"/>`
    : (p.emoji || store?.emoji || '🍽️');

  return `
  <div class="product-card">
    <div class="product-img-box">${img}</div>
    <div class="product-info">
      <div class="product-name">${_esc(p.name)}</div>
      ${p.description ? `<div class="product-desc">${_esc(p.description)}</div>` : ''}
      <div class="product-footer">
        <div>
          <span class="product-price">R$ ${(+p.price||0).toFixed(2)}</span>
          ${p.rating ? `<span class="product-rating" style="margin-left:8px">⭐${(+p.rating).toFixed(1)}</span>` : ''}
        </div>
        <button class="btn-add" onclick='_addToCart(${JSON.stringify({id:p.id,name:p.name,price:p.price,emoji:p.emoji||store?.emoji})}, "${store?.id||''}", ${JSON.stringify(store?.name||'')}, ${+(store?.deliveryFee||0)})'>
          <i class="fa-solid fa-plus" style="font-size:12px"></i>
        </button>
      </div>
    </div>
  </div>`;
}

function _renderProductsFallback() {
  const store = { id:'d1', name:'Pizzaria do Zé', emoji:'🍕', deliveryFee:0 };
  _renderProducts([
    { id:'p1', name:'Pizza Margherita', description:'Molho, mussarela, manjericão fresco.', price:32.90, emoji:'🍕', rating:4.8, active:true },
    { id:'p2', name:'Pizza Calabresa',  description:'Molho, mussarela, calabresa e cebola.',price:35.90, emoji:'🍕', rating:4.6, active:true },
    { id:'p3', name:'Refri Lata 350ml', description:'Gelado.',                              price:5.00,  emoji:'🥤', rating:null, active:true },
  ], store);
}

/* ─────────────────────────────────────────────────────────── */
/*  CARRINHO                                                   */
/* ─────────────────────────────────────────────────────────── */
function _addToCart(product, storeId, storeName, deliveryFee) {
  if (S.cart.storeId && S.cart.storeId !== storeId) {
    if (!confirm(`Seu carrinho tem itens de "${S.cart.storeName}".\nLimpar e adicionar de "${storeName}"?`)) return;
    S.cart = { storeId: null, storeName: '', deliveryFee: 0, items: [] };
  }
  S.cart.storeId     = storeId;
  S.cart.storeName   = storeName;
  S.cart.deliveryFee = deliveryFee;

  const ex = S.cart.items.find(i => i.id === product.id);
  if (ex) ex.qty++;
  else S.cart.items.push({ ...product, qty: 1 });

  _updateCartBadge();
  toast(`✅ ${product.name} adicionado!`);
}

function _updateCartBadge() {
  const total = S.cart.items.reduce((a, i) => a + i.qty, 0);
  const badge = document.getElementById('cart-badge');
  badge.textContent = total;
  badge.classList.toggle('hidden', total === 0);
}

function openCart() {
  _renderCartDrawer();
  document.getElementById('cart-overlay').classList.remove('hidden');
  document.getElementById('cart-drawer').classList.remove('hidden');
}
function closeCart() {
  document.getElementById('cart-overlay').classList.add('hidden');
  document.getElementById('cart-drawer').classList.add('hidden');
}

function _renderCartDrawer() {
  const items    = S.cart.items;
  const itemsEl  = document.getElementById('cart-items');
  const emptyEl  = document.getElementById('cart-empty-msg');
  const footerEl = document.getElementById('cart-footer');

  if (!items.length) {
    itemsEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    footerEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  footerEl.classList.remove('hidden');

  itemsEl.innerHTML = items.map((item, idx) => `
    <div class="cart-item">
      <div class="cart-item-emoji">${item.emoji || '🍽️'}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${_esc(item.name)}</div>
        <div class="cart-item-price">R$ ${(+item.price).toFixed(2)} cada</div>
      </div>
      <div class="qty-controls">
        <button class="qty-btn minus" onclick="_changeQty(${idx},-1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn plus" onclick="_changeQty(${idx},1)">+</button>
      </div>
      <div class="cart-item-total">R$ ${(item.price * item.qty).toFixed(2)}</div>
    </div>
  `).join('');

  const sub  = items.reduce((a, i) => a + i.price * i.qty, 0);
  const fee  = S.cart.deliveryFee;
  const tot  = sub + fee;

  document.getElementById('cart-subtotal').textContent = `R$ ${sub.toFixed(2)}`;
  document.getElementById('cart-delivery').textContent = fee === 0 ? 'Grátis 🎉' : `R$ ${fee.toFixed(2)}`;
  document.getElementById('cart-total').textContent    = `R$ ${tot.toFixed(2)}`;
}

function _changeQty(idx, delta) {
  S.cart.items[idx].qty += delta;
  if (S.cart.items[idx].qty <= 0) S.cart.items.splice(idx, 1);
  _updateCartBadge();
  _renderCartDrawer();
}

/* ─────────────────────────────────────────────────────────── */
/*  CHECKOUT FLOW                                              */
/* ─────────────────────────────────────────────────────────── */
function proceedCheckout() {
  if (!S.user) {
    closeCart();
    S.pendingAfterLogin = proceedCheckout;
    openLoginModal();
    return;
  }
  // Pede endereço antes do Pix
  closeCart();
  document.getElementById('address-modal').classList.remove('hidden');
}

function closeAddressModal(e) {
  if (e && e.target !== document.getElementById('address-modal')) return;
  document.getElementById('address-modal').classList.add('hidden');
}

function confirmAddressAndPix() {
  const addr = document.getElementById('checkout-address').value.trim();
  if (!addr) { toast('⚠️ Informe o endereço de entrega', true); return; }
  S.checkoutAddress = addr;
  document.getElementById('address-modal').classList.add('hidden');
  _openPixModal();
}

function _openPixModal() {
  const items = S.cart.items;
  const total = items.reduce((a,i) => a + i.price * i.qty, 0) + S.cart.deliveryFee;
  document.getElementById('pix-total').textContent = `R$ ${total.toFixed(2)}`;
  document.getElementById('pix-modal').classList.remove('hidden');
  _generatePix(total);
}

function closePixModal(e) {
  if (e && e.target !== document.getElementById('pix-modal')) return;
  document.getElementById('pix-modal').classList.add('hidden');
  clearInterval(S.pixPolling);
}

async function _generatePix(amount) {
  // ── PRODUÇÃO: chame sua Cloud Function aqui ───────────────
  // const res = await fetch('/api/criar-pix', {
  //   method:'POST',
  //   headers:{'Content-Type':'application/json'},
  //   body: JSON.stringify({ amount, email: S.user.email,
  //     description: `Cipó Delivery — ${S.cart.storeName}` })
  // });
  // const { qr_code, qr_code_base64, id } = await res.json();
  // document.getElementById('pix-code-text').textContent = qr_code;
  // document.getElementById('pix-qr').innerHTML = `<img src="data:image/png;base64,${qr_code_base64}" style="width:160px;height:160px"/>`;
  // S.pixOrderId = id;
  // ─────────────────────────────────────────────────────────

  // ── SIMULAÇÃO (substitua pela chamada real acima) ─────────
  await new Promise(r => setTimeout(r, 900));
  const fakeCode = `00020126580014BR.GOV.BCB.PIX013600000000-0000-0000-0000-000000000000520400005303986540${String(Math.round(amount*100)).padStart(7,'0')}5802BR5913CIPO DELIVERY6009CIPOBAHIA6226052200000000000000000000063048F4A`;
  document.getElementById('pix-code-text').textContent = fakeCode;

  // Simulação de confirmação (remove em produção)
  let t = 0;
  S.pixPolling = setInterval(() => {
    t++;
    if (t >= 5) { clearInterval(S.pixPolling); _onPixApproved(); }
  }, 1500);
}

async function _onPixApproved() {
  const statusEl = document.getElementById('pix-status');
  statusEl.className = 'pix-status approved';
  statusEl.innerHTML = '<span class="pix-dot"></span> ✅ Pagamento aprovado! Criando pedido...';

  await _createOrder();
}

async function _createOrder() {
  const { db, collection, addDoc, serverTimestamp } = _fb;
  const items = S.cart.items;
  const sub   = items.reduce((a,i) => a + i.price * i.qty, 0);
  const total = sub + S.cart.deliveryFee;

  const order = {
    userId:       S.user.uid,
    userEmail:    S.user.email,
    userName:     S.user.displayName,
    storeId:      S.cart.storeId,
    storeName:    S.cart.storeName,
    items:        items.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty, emoji:i.emoji||'' })),
    address:      S.checkoutAddress,
    subtotal:     sub,
    deliveryFee:  S.cart.deliveryFee,
    total,
    commission:   +(total * 0.05).toFixed(2),
    netValue:     +(total * 0.95).toFixed(2),
    status:       'aguardando',
    paymentMethod:'pix',
    paidAt:       serverTimestamp(),
    createdAt:    serverTimestamp(),
  };

  try {
    const ref = await addDoc(collection(db, 'orders'), order);
    S.pixOrderId = ref.id;
    S.cart = { storeId:null, storeName:'', deliveryFee:0, items:[] };
    _updateCartBadge();
    document.getElementById('pix-modal').classList.add('hidden');
    toast('🎉 Pedido confirmado! Acompanhe em Pedidos.');
    navigate('orders');
    _playRegister();
  } catch(e) { toast('Erro ao criar pedido. Tente novamente.', true); }
}

function copyPix() {
  const code = document.getElementById('pix-code-text').textContent;
  navigator.clipboard?.writeText(code).then(() => toast('✅ Código copiado!'));
}

function _playRegister() {
  try { const a = document.getElementById('cash-sound'); a.currentTime=0; a.play(); } catch(e){}
}

/* ─────────────────────────────────────────────────────────── */
/*  PEDIDOS (cliente)                                          */
/* ─────────────────────────────────────────────────────────── */
function filterOrders(btn, status) {
  document.querySelectorAll('.order-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.orderFilter = status;
  _loadOrders();
}

function _loadOrders() {
  const loginEl = document.getElementById('orders-login-prompt');
  const skelEl  = document.getElementById('orders-skeleton');
  const listEl  = document.getElementById('orders-list');
  const emptyEl = document.getElementById('orders-empty');

  if (!S.user) {
    skelEl.classList.add('hidden');
    listEl.classList.add('hidden');
    emptyEl.classList.add('hidden');
    loginEl.classList.remove('hidden');
    return;
  }
  loginEl.classList.add('hidden');

  const { db, collection, query, where, orderBy, onSnapshot } = _fb;
  if (UNSUB.orders) UNSUB.orders();

  // Map tab → Firestore status
  const statusMap = {
    pendente:   'aguardando',
    preparando: 'preparando',
    saiu:       'saiu',
    entregue:   'entregue',
  };
  const fsStatus = statusMap[S.orderFilter] || 'aguardando';

  try {
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', S.user.uid),
      where('status', '==', fsStatus),
      orderBy('createdAt', 'desc')
    );
    UNSUB.orders = onSnapshot(q, snap => {
      const orders = [];
      snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
      skelEl.classList.add('hidden');

      // Notify badge if any pending
      const badge = document.getElementById('orders-badge');
      badge.classList.toggle('hidden', orders.length === 0 || fsStatus !== 'aguardando');

      if (!orders.length) {
        listEl.classList.add('hidden');
        emptyEl.classList.remove('hidden');
        return;
      }
      emptyEl.classList.add('hidden');
      listEl.classList.remove('hidden');
      listEl.innerHTML = orders.map(_orderCard).join('');
    });
  } catch(e) {
    skelEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
  }
}

function _orderCard(o) {
  const badgeClass = {
    aguardando: 'badge-aguardando',
    preparando: 'badge-preparando',
    saiu:       'badge-saiu',
    entregue:   'badge-entregue',
  }[o.status] || 'badge-aguardando';
  const labels = { aguardando:'⏳ Aguardando', preparando:'👨‍🍳 Preparando', saiu:'🛵 A caminho', entregue:'✅ Entregue' };
  const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('pt-BR') : 'Agora';

  return `
  <div class="order-card" onclick="openOrderStatus('${o.id}')">
    <div class="order-card-top">
      <span class="order-store-name">${_esc(o.storeName||'')}</span>
      <span class="order-status-badge ${badgeClass}">${labels[o.status]||o.status}</span>
    </div>
    <div class="order-items-text">${(o.items||[]).map(i=>`${i.qty}x ${i.name}`).join(', ')}</div>
    <div class="order-card-bottom">
      <span class="order-date">${date}</span>
      <span class="order-total">R$ ${(+o.total||0).toFixed(2)}</span>
    </div>
  </div>`;
}

async function openOrderStatus(orderId) {
  const modal   = document.getElementById('order-status-modal');
  const content = document.getElementById('order-status-content');
  modal.classList.remove('hidden');
  content.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px">Carregando...</p>';

  const { db, doc, onSnapshot } = _fb;
  if (modal._unsub) modal._unsub();
  modal._unsub = onSnapshot(doc(db, 'orders', orderId), snap => {
    if (!snap.exists()) return;
    content.innerHTML = _orderStatusHTML({ id:snap.id, ...snap.data() });
  });
}

function _orderStatusHTML(o) {
  const steps = [
    { key:'aguardando', label:'Aguardando',       icon:'⏳', desc:'Aguardando confirmação da loja' },
    { key:'preparando', label:'Preparando',        icon:'👨‍🍳', desc:'Sua comida está sendo preparada' },
    { key:'saiu',       label:'A caminho',         icon:'🛵', desc:'Saiu para entrega' },
    { key:'entregue',   label:'Entregue',          icon:'✅', desc:'Pedido entregue com sucesso!' },
  ];
  const curIdx = steps.findIndex(s => s.key === o.status);

  const stepsHTML = steps.map((step, i) => {
    const done   = i < curIdx;
    const active = i === curIdx;
    const circleClass = done ? 'done' : active ? 'active' : 'idle';
    const lineClass   = done ? 'done' : 'idle';
    return `
      <div class="status-step">
        <div class="status-circle ${circleClass}">${step.icon}</div>
        <div class="status-label">
          <p style="${!done && !active ? 'color:var(--text-muted)' : ''}">${step.label}</p>
          <span>${step.desc}</span>
        </div>
      </div>
      ${i < steps.length-1 ? `<div class="status-line ${lineClass}"></div>` : ''}`;
  }).join('');

  const summary = (o.items||[]).map(i =>
    `<div class="status-summary-row"><span>${i.qty}x ${_esc(i.name)}</span><span>R$ ${(i.price*i.qty).toFixed(2)}</span></div>`
  ).join('');

  return `
    <div class="status-track">${stepsHTML}</div>
    <div class="status-summary">
      ${summary}
      <div class="status-summary-row status-summary-total">
        <span>Total</span><span>R$ ${(+o.total||0).toFixed(2)}</span>
      </div>
      ${o.address ? `<div style="font-size:11px;color:var(--text-muted);margin-top:8px">📍 ${_esc(o.address)}</div>` : ''}
    </div>`;
}

function closeOrderStatus(e) {
  if (e && e.target !== document.getElementById('order-status-modal')) return;
  const modal = document.getElementById('order-status-modal');
  if (modal._unsub) modal._unsub();
  modal.classList.add('hidden');
}

/* ─────────────────────────────────────────────────────────── */
/*  PERFIL — MODO LOJISTA                                      */
/* ─────────────────────────────────────────────────────────── */
async function _checkLojistaLink() {
  if (!S.user) return;
  const { db, collection, query, where, getDocs } = _fb;
  try {
    const snap = await getDocs(
      query(collection(db,'stores'), where('ownerId','==',S.user.uid), where('active','==',true))
    );
    S.lojistaStoreId = snap.empty ? null : snap.docs[0].id;
  } catch(e) { S.lojistaStoreId = null; }
}

async function handleLojistaMode() {
  if (!S.user) {
    S.pendingAfterLogin = handleLojistaMode;
    openLoginModal();
    return;
  }
  await _checkLojistaLink();
  if (S.lojistaStoreId) {
    // Loja vinculada → abre painel (loja.html)
    window.location.href = 'loja.html';
  } else {
    // Sem loja → formulário de parceria
    navigate('partner');
  }
}

/* ─────────────────────────────────────────────────────────── */
/*  CADASTRO DE PARCEIRO                                       */
/* ─────────────────────────────────────────────────────────── */
let _logoFile = null;

function handleLogoSelect(input) {
  if (input.files[0]) {
    _logoFile = input.files[0];
    document.getElementById('p-logo-label').textContent = `✅ ${input.files[0].name}`;
  }
}

async function submitPartnerForm() {
  if (!S.user) { S.pendingAfterLogin = submitPartnerForm; openLoginModal(); return; }

  const name     = document.getElementById('p-name').value.trim();
  const owner    = document.getElementById('p-owner').value.trim();
  const docNum   = document.getElementById('p-doc').value.trim();
  const whatsapp = document.getElementById('p-whatsapp').value.trim();
  const address  = document.getElementById('p-address').value.trim();
  const moment   = document.getElementById('p-moment').value;
  const fee      = parseFloat(document.getElementById('p-fee').value) || 0;
  const prep     = parseInt(document.getElementById('p-prep').value)  || 30;
  const emoji    = document.getElementById('p-emoji').value.trim()    || '🍽️';
  const desc     = document.getElementById('p-desc').value.trim();
  const hours    = document.getElementById('p-hours').value.trim();

  if (!name || !owner || !docNum || !whatsapp || !address) {
    toast('⚠️ Preencha todos os campos obrigatórios', true); return;
  }

  const { db, storage, collection, addDoc, serverTimestamp, ref, uploadBytes, getDownloadURL } = _fb;

  let logoURL = '';
  if (_logoFile) {
    try {
      const storRef = ref(storage, `logos/${S.user.uid}_${Date.now()}`);
      const up      = await uploadBytes(storRef, _logoFile);
      logoURL       = await getDownloadURL(up.ref);
    } catch(e) { toast('Erro ao enviar logo: ' + e.message, true); return; }
  }

  try {
    await addDoc(collection(db, 'stores'), {
      name, owner, document: docNum, whatsapp, address,
      moment, deliveryFee: fee, prepTime: prep,
      emoji, description: desc, hours,
      logoURL, ownerId: S.user.uid,
      active:  false,     // ← aguarda aprovação do admin
      isOpen:  false,
      rating:  5.0,
      deliveryTime: `${prep}–${prep+15}`,
      createdAt: serverTimestamp(),
    });
    toast('✅ Solicitação enviada! Aguarde aprovação em até 24h.');
    navigate('profile');
  } catch(e) { toast('Erro: ' + e.message, true); }
}

/* ─────────────────────────────────────────────────────────── */
/*  MAPA                                                       */
/* ─────────────────────────────────────────────────────────── */
function openMapModal() {
  document.getElementById('map-modal').classList.remove('hidden');
  if (!S.mapInit) { setTimeout(_initMap, 150); S.mapInit = true; }
}
function closeMapModal(e) {
  if (e && e.target !== document.getElementById('map-modal')) return;
  document.getElementById('map-modal').classList.add('hidden');
}

function _initMap() {
  const cipo = [-11.0855, -38.5122];
  const map  = L.map('map', { center: cipo, zoom: 15, zoomControl: false });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO', subdomains:'abcd', maxZoom:19
  }).addTo(map);

  const mkPremium = L.divIcon({ className:'',
    html:`<div class="map-pin premium"><i class="fa-solid fa-star"></i></div>`,
    iconSize:[38,38], iconAnchor:[19,38] });
  const mkStd = L.divIcon({ className:'',
    html:`<div class="map-pin standard"><i class="fa-solid fa-utensils"></i></div>`,
    iconSize:[34,34], iconAnchor:[17,34] });

  L.marker([-10.8023,-38.5158],{icon:mkPremium}).addTo(map)
    .bindPopup('<b>🌟 Pizzaria do Zé</b><br>Premium · ⭐ 4.8');
  L.marker([-10.8050,-38.5180],{icon:mkStd}).addTo(map)
    .bindPopup('<b>🍔 Burguer Cipó</b><br>⭐ 4.6');
  L.marker([-10.8000,-38.5140],{icon:mkStd}).addTo(map)
    .bindPopup('<b>🫐 Açaí da Serra</b><br>⭐ 4.9');

  L.circle(cipo, { radius:1500, color:'#EA1D2C', fillColor:'#EA1D2C',
    fillOpacity:.05, weight:1.5, dashArray:'6,6' }).addTo(map);

  // Pins reais do Firestore
  try {
    const { db, collection, onSnapshot } = _fb;
    onSnapshot(collection(db,'stores'), snap => {
      snap.forEach(d => {
        const s = d.data();
        if (s.lat && s.lng && s.active) {
          const icon = L.divIcon({ className:'',
            html:`<div class="map-pin ${s.plan==='ouro'?'premium':'standard'}" style="font-size:16px">${s.emoji||'🍽️'}</div>`,
            iconSize:[38,38], iconAnchor:[19,38] });
          L.marker([s.lat,s.lng],{icon}).addTo(map)
            .bindPopup(`<b>${s.name}</b><br>⭐ ${s.rating||'–'}`);
        }
      });
    });
  } catch(e) {}
}

/* ─────────────────────────────────────────────────────────── */
/*  GENÉRICO                                                   */
/* ─────────────────────────────────────────────────────────── */
function closeModal(id, e) {
  if (e && e.target !== document.getElementById(id)) return;
  document.getElementById(id).classList.add('hidden');
}
function openCheckout(plan, price) {
  const msg = encodeURIComponent(`Olá! Quero assinar o Plano ${plan} (R$${price}/mês) do Cipó Delivery!`);
  document.getElementById('pchk-title').textContent = `Plano ${plan} Selecionado! 🎉`;
  document.getElementById('pchk-price').textContent = `R$ ${price}/mês`;
  document.getElementById('pchk-wa').href = `https://wa.me/5575999999999?text=${msg}`;
  document.getElementById('partner-checkout-modal').classList.remove('hidden');
}

/* ── Toast ─────────────────────────────────────────────────── */
let _toastT;
function toast(msg, isErr = false, dur = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast${isErr?' error':''}`;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.className = 'toast hidden', dur);
}

/* ── Helpers ───────────────────────────────────────────────── */
function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _grad(emoji) {
  const m = { '🍕':'#FF6B35,#F7931E','🍔':'#E8A045,#C0392B','🫐':'#6C3483,#A569BD',
    '🥩':'#922B21,#E74C3C','🥤':'#1A5276,#2E86C1','🌮':'#D35400,#E67E22',
    '🍽️':'#555,#888','🌙':'#1a1a2e,#16213e','🥘':'#8B4513,#D2691E' };
  return m[emoji] || '#667eea,#764ba2';
}
window.handleAuthBtn = handleAuthBtn;
window.doLogin = doLogin;
window.navigate = navigate;
window.filterCategory = filterCategory;
window.openCart = openCart;
window.handleSearch = handleSearch;
window.clearSearch = clearSearch;
