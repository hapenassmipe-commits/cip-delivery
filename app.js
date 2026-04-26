import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  // COLE SUAS CHAVES AQUI DENTRO (apiKey, etc)
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
window._fb = { app, auth, db, onAuthStateChanged };
// ═══════════════════════════════════════════════════════
//  CIPÓ DELIVERY · app.js
//  SaaS Engine: Firebase, Cart, Orders, Lojista, Pix API
// ═══════════════════════════════════════════════════════

'use strict';

// ── Wait for Firebase module to expose _fb ────────────────
let fbReady = false;
const FB_POLL = setInterval(() => {
  if (window._fb) { clearInterval(FB_POLL); fbReady = true; bootApp(); }
}, 100);

// ── State ─────────────────────────────────────────────────
const STATE = {
  currentScreen: 'home',
  currentStoreId: null,
  currentMoment: 'todos',
  currentUser: null,
  lojistaStoreId: null,
  lojistaTab: 'pedidos',
  cart: { storeId: null, storeName: '', items: [], deliveryFee: 0 },
  mapInitialized: false,
  pixOrderId: null,
  pixPolling: null,
};

// ── Unsubscribe handles ───────────────────────────────────
const UNSUBS = {};

// ── Boot ──────────────────────────────────────────────────
function bootApp() {
  const { auth, onAuthStateChanged } = window._fb;

  onAuthStateChanged(auth, user => {
    STATE.currentUser = user;
    updateAuthUI(user);
  });

  setTimeout(() => {
    document.getElementById('splash').style.opacity = '0';
    document.getElementById('splash').style.transition = 'opacity .5s';
    setTimeout(() => {
      document.getElementById('splash').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
    }, 500);
    loadStores();
  }, 1800);
}

// ── Auth UI ───────────────────────────────────────────────
function updateAuthUI(user) {
  const btn = document.getElementById('btn-login-logout');
  const name = document.getElementById('profile-name');
  const email = document.getElementById('profile-email');
  const avatar = document.getElementById('profile-avatar');

  if (user) {
    name.textContent = `Olá, ${user.displayName?.split(' ')[0] || 'usuário'}!`;
    email.textContent = user.email || '';
    btn.textContent = 'Sair';
    btn.onclick = doLogout;
    if (user.photoURL) {
      avatar.innerHTML = `<img src="${user.photoURL}" class="w-full h-full rounded-full object-cover"/>`;
    }
    // Load client orders if on orders screen
    if (STATE.currentScreen === 'orders') loadClientOrders();
  } else {
    name.textContent = 'Olá, visitante!';
    email.textContent = '';
    btn.textContent = 'Entrar';
    btn.onclick = handleAuthBtn;
    avatar.innerHTML = '<i class="fa-solid fa-user"></i>';
  }
}

function handleAuthBtn() {
  if (STATE.currentUser) doLogout();
  else openLoginModal();
}

async function doLogin() {
  const { auth, signInWithPopup, gProvider } = window._fb;
  try {
    await signInWithPopup(auth, gProvider);
    closeLoginModal();
    showToast('✅ Login realizado com sucesso!');
  } catch(e) {
    showToast('Erro no login: ' + e.message, true);
  }
}

async function doLogout() {
  const { auth, signOut } = window._fb;
  await signOut(auth);
  STATE.currentUser = null;
  showToast('Até logo! 👋');
}

// ── Navigation ─────────────────────────────────────────────
function navigate(screen, extra) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.add('hidden');
    s.classList.remove('flex');
  });

  const el = document.getElementById('screen-' + screen);
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('flex');
  STATE.currentScreen = screen;

  // Bottom nav highlight (only for main tabs)
  const navScreens = ['home','map','orders','profile'];
  document.querySelectorAll('.bnav-btn').forEach(b => {
    b.classList.remove('active');
    b.querySelectorAll('.bnav-icon').forEach(i => i.classList.replace('text-brand','text-gray-400'));
    b.querySelectorAll('.bnav-label').forEach(l => { l.classList.replace('text-brand','text-gray-400'); l.classList.replace('font-bold','font-semibold'); });
    b.querySelectorAll('.bnav-dot').forEach(d => d.classList.add('hidden'));
  });

  if (navScreens.includes(screen)) {
    const btn = document.getElementById('nav-' + screen);
    if (btn) {
      btn.classList.add('active');
      btn.querySelectorAll('.bnav-icon').forEach(i => { i.classList.replace('text-gray-400','text-brand'); });
      btn.querySelectorAll('.bnav-label').forEach(l => { l.classList.replace('text-gray-400','text-brand'); l.classList.replace('font-semibold','font-bold'); });
      btn.querySelectorAll('.bnav-dot').forEach(d => d.classList.remove('hidden'));
    }
  }

  // Screen-specific init
  if (screen === 'map' && !STATE.mapInitialized) { initMap(); STATE.mapInitialized = true; }
  if (screen === 'orders') { loadClientOrders(); }
  if (screen === 'lojista') { initLojistaPanel(); }
  if (screen === 'store' && extra) { loadStoreDetail(extra); }
}

// ── FIRESTORE: Load Stores ─────────────────────────────────
function loadStores() {
  const { db, collection, onSnapshot, query, orderBy } = window._fb;
  const q = query(collection(db, 'stores'), orderBy('rating', 'desc'));

  if (UNSUBS.stores) UNSUBS.stores();
  UNSUBS.stores = onSnapshot(q, snap => {
    const stores = [];
    snap.forEach(doc => stores.push({ id: doc.id, ...doc.data() }));
    renderStores(stores);
  }, () => {
    // Demo fallback (Firebase not configured yet)
    renderStoresFallback();
  });
}

function renderStores(stores) {
  const list = document.getElementById('stores-list');
  const skel = document.getElementById('stores-skeleton');
  const empty = document.getElementById('stores-empty');
  const count = document.getElementById('store-count');

  skel.classList.add('hidden');

  const filtered = filterStoresByMoment(stores, STATE.currentMoment);

  if (filtered.length === 0) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    count.textContent = '';
    return;
  }

  empty.classList.add('hidden');
  list.classList.remove('hidden');
  count.textContent = `${filtered.length} loja${filtered.length > 1 ? 's' : ''}`;

  list.innerHTML = filtered.map(s => storeCard(s)).join('');
}

function renderStoresFallback() {
  // Demo data when Firebase not configured
  const demo = [
    { id:'demo1', name:'Pizzaria do Zé', emoji:'🍕', rating:4.8, deliveryTime:'30–45', deliveryFee:0, isOpen:true, moment:'almoco', category:'Pizza • Italiana' },
    { id:'demo2', name:'Burguer Cipó', emoji:'🍔', rating:4.6, deliveryTime:'20–35', deliveryFee:3.5, isOpen:true, moment:'lanches', category:'Lanches • Hambúrguer' },
    { id:'demo3', name:'Açaí da Serra', emoji:'🫐', rating:4.9, deliveryTime:'15–25', deliveryFee:0, isOpen:true, moment:'madruga', category:'Açaí • Sorvetes' },
    { id:'demo4', name:'Brasa & Brasa', emoji:'🥩', rating:4.7, deliveryTime:'40–55', deliveryFee:5, isOpen:false, moment:'jantar', category:'Churrasco • Marmita' },
    { id:'demo5', name:'Depósito do Frio', emoji:'🥤', rating:4.5, deliveryTime:'10–20', deliveryFee:2, isOpen:true, moment:'bebidas', category:'Bebidas • Conveniência' },
    { id:'demo6', name:'Tapioca da Mana', emoji:'🌮', rating:4.4, deliveryTime:'20–30', deliveryFee:3, isOpen:true, moment:'almoco', category:'Tapioca • Salgados' },
  ];
  renderStores(demo);

  // Show config hint
  showToast('⚙️ Configure o Firebase para carregar dados reais', false, 5000);
}

function storeCard(s) {
  const fee = s.deliveryFee === 0
    ? `<span class="text-green-600 font-bold">Grátis</span>`
    : `<span class="text-gray-500 font-semibold">R$ ${Number(s.deliveryFee).toFixed(2)}</span>`;
  const closed = !s.isOpen ? `<div class="absolute inset-0 bg-black/40 rounded-t-2xl flex items-center justify-center"><span class="bg-white/90 text-gray-900 text-xs font-bold px-3 py-1 rounded-full">Fechado</span></div>` : '';

  return `
  <div class="bg-white rounded-2xl overflow-hidden shadow-sm active:scale-[.98] transition-transform cursor-pointer"
    onclick="openStore('${s.id}')">
    <div class="relative h-28 flex items-center justify-center"
      style="background:linear-gradient(135deg,${storeGradient(s.emoji)})">
      ${closed}
      <span class="text-6xl drop-shadow-md">${s.emoji || '🍽️'}</span>
    </div>
    <div class="p-3">
      <div class="flex items-center justify-between mb-0.5">
        <h3 class="font-extrabold text-sm">${escHtml(s.name)}</h3>
        <span class="text-xs bg-amber-50 text-amber-600 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
          <i class="fa-solid fa-star text-[10px]"></i>${Number(s.rating || 0).toFixed(1)}
        </span>
      </div>
      <p class="text-xs text-gray-400 font-medium mb-2">${escHtml(s.category || '')}</p>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500 font-medium flex items-center gap-1">
          <i class="fa-regular fa-clock text-gray-400"></i> ${s.deliveryTime || '?'}min
        </span>
        <span>Taxa: ${fee}</span>
      </div>
    </div>
  </div>`;
}

function storeGradient(emoji) {
  const map = {
    '🍕':'#FF6B35,#F7931E','🍔':'#E8A045,#C0392B','🫐':'#6C3483,#A569BD',
    '🥩':'#922B21,#E74C3C','🥤':'#1A5276,#2E86C1','🌮':'#D35400,#E67E22',
    '🍽️':'#555,#888','🌙':'#1a1a2e,#16213e',
  };
  return map[emoji] || '#667eea,#764ba2';
}

function filterStoresByMoment(stores, moment) {
  if (moment === 'todos') return stores;
  return stores.filter(s => s.moment === moment || s.moment === 'todos');
}

// ── Category / Moment Filter ───────────────────────────────
function filterMoment(btn, moment) {
  document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  STATE.currentMoment = moment;
  loadStores();
}

// ── Search ─────────────────────────────────────────────────
function handleSearch(val) {
  document.getElementById('search-clear').classList.toggle('hidden', !val);
}
function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').classList.add('hidden');
}

// ── Store Detail ───────────────────────────────────────────
async function openStore(storeId) {
  STATE.currentStoreId = storeId;
  navigate('store');
}

async function loadStoreDetail(storeId) {
  const { db, doc, getDoc, collection, query, orderBy, onSnapshot, where } = window._fb;

  // Show skeleton
  document.getElementById('products-skeleton').classList.remove('hidden');
  document.getElementById('products-list').classList.add('hidden');
  document.getElementById('products-empty').classList.add('hidden');
  document.getElementById('store-status-banner').classList.add('hidden');

  try {
    const storeRef = doc(db, 'stores', storeId);
    const storeSnap = await getDoc(storeRef);
    if (!storeSnap.exists()) { showToast('Loja não encontrada', true); return; }

    const store = { id: storeSnap.id, ...storeSnap.data() };
    renderStoreHero(store);

    if (!store.isOpen) {
      document.getElementById('store-status-banner').classList.remove('hidden');
    }

    // Subscribe products
    if (UNSUBS.products) UNSUBS.products();
    const pq = query(
      collection(db, 'stores', storeId, 'products'),
      where('active', '==', true),
      orderBy('rating', 'desc')
    );
    UNSUBS.products = onSnapshot(pq, snap => {
      const products = [];
      snap.forEach(d => products.push({ id: d.id, ...d.data() }));
      renderProducts(products, store);
    });

  } catch(e) {
    // Demo fallback
    renderStoreHeroFallback();
    renderProductsFallback();
  }
}

function renderStoreHero(store) {
  document.getElementById('store-name-hero').textContent = store.name || '';
  document.getElementById('store-meta-hero').innerHTML = `
    <span><i class="fa-solid fa-star text-amber-300 text-xs"></i> ${Number(store.rating || 0).toFixed(1)}</span>
    <span>·</span>
    <span><i class="fa-regular fa-clock text-xs"></i> ${store.deliveryTime || '?'}min</span>
  `;
  const bar = document.getElementById('store-info-bar');
  const fee = store.deliveryFee === 0
    ? `<span class="text-green-600 font-bold">Taxa: Grátis</span>`
    : `<span>Taxa: <strong>R$ ${Number(store.deliveryFee).toFixed(2)}</strong></span>`;
  bar.innerHTML = `${fee} <span class="text-gray-200">|</span> <span>${store.category || ''}</span>`;

  const hero = document.getElementById('store-hero');
  hero.style.background = `linear-gradient(135deg,${storeGradient(store.emoji)})`;
  hero.querySelector('div:not(.absolute)').querySelector('div').textContent = store.emoji || '🍽️';
}

function renderStoreHeroFallback() {
  document.getElementById('store-name-hero').textContent = 'Pizzaria do Zé';
  document.getElementById('store-meta-hero').innerHTML = '<span>⭐ 4.8</span><span>·</span><span>30–45min</span>';
}

function renderProducts(products, store) {
  document.getElementById('products-skeleton').classList.add('hidden');
  const list = document.getElementById('products-list');
  const empty = document.getElementById('products-empty');

  if (!products.length) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  list.classList.remove('hidden');
  empty.classList.add('hidden');
  list.innerHTML = products.map(p => productCard(p, store)).join('');
}

function productCard(p, store) {
  return `
  <div class="bg-white rounded-2xl p-3 flex gap-3 shadow-sm">
    <div class="w-20 h-20 rounded-xl flex-shrink-0 flex items-center justify-center text-4xl"
      style="background:linear-gradient(135deg,${storeGradient(p.emoji || store?.emoji)})">
      ${p.emoji || store?.emoji || '🍽️'}
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between mb-0.5">
        <h4 class="font-bold text-sm truncate">${escHtml(p.name)}</h4>
        ${p.rating ? `<span class="text-[10px] bg-amber-50 text-amber-600 font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-1">⭐${Number(p.rating).toFixed(1)}</span>` : ''}
      </div>
      <p class="text-xs text-gray-400 mb-2 line-clamp-2">${escHtml(p.description || '')}</p>
      <div class="flex items-center justify-between">
        <span class="font-black text-brand">R$ ${Number(p.price || 0).toFixed(2)}</span>
        <button onclick='addToCart(${JSON.stringify({id:p.id,name:p.name,price:p.price,emoji:p.emoji||store?.emoji})}, "${store?.id}", "${escHtml(store?.name||'')}", ${store?.deliveryFee||0})'
          class="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-sm hover:bg-brand-dark transition-colors">
          <i class="fa-solid fa-plus text-xs"></i>
        </button>
      </div>
    </div>
  </div>`;
}

function renderProductsFallback() {
  const products = [
    { id:'p1', name:'Pizza Margherita', description:'Molho, mussarela, manjericão fresco', price:32.90, emoji:'🍕', rating:4.8 },
    { id:'p2', name:'Pizza Calabresa', description:'Molho, mussarela, calabresa fatiada, cebola', price:35.90, emoji:'🍕', rating:4.6 },
    { id:'p3', name:'Refrigerante Lata', description:'350ml gelado', price:5.00, emoji:'🥤', rating:null },
  ];
  renderProducts(products, { id:'demo1', name:'Pizzaria do Zé', emoji:'🍕', deliveryFee:0 });
}

// ── Cart ──────────────────────────────────────────────────
function addToCart(product, storeId, storeName, deliveryFee) {
  if (STATE.cart.storeId && STATE.cart.storeId !== storeId) {
    if (!confirm(`Seu carrinho tem itens de "${STATE.cart.storeName}". Deseja limpar e começar um novo pedido?`)) return;
    STATE.cart = { storeId: null, storeName: '', items: [], deliveryFee: 0 };
  }

  STATE.cart.storeId = storeId;
  STATE.cart.storeName = storeName;
  STATE.cart.deliveryFee = deliveryFee || 0;

  const existing = STATE.cart.items.find(i => i.id === product.id);
  if (existing) {
    existing.qty++;
  } else {
    STATE.cart.items.push({ ...product, qty: 1 });
  }

  updateCartBadge();
  showToast(`✅ ${product.name} adicionado!`);
}

function updateCartBadge() {
  const total = STATE.cart.items.reduce((acc, i) => acc + i.qty, 0);
  const badge = document.getElementById('cart-badge');
  if (total > 0) {
    badge.textContent = total;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function openCart() {
  renderCartDrawer();
  document.getElementById('cart-overlay').classList.remove('hidden');
  document.getElementById('cart-drawer').classList.remove('hidden');
}

function closeCart() {
  document.getElementById('cart-overlay').classList.add('hidden');
  document.getElementById('cart-drawer').classList.add('hidden');
}

function renderCartDrawer() {
  const items = STATE.cart.items;
  const container = document.getElementById('cart-items');
  const empty = document.getElementById('cart-empty');
  const footer = document.getElementById('cart-footer');

  if (!items.length) {
    container.classList.add('hidden');
    empty.classList.remove('hidden');
    footer.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  empty.classList.add('hidden');
  footer.classList.remove('hidden');

  container.innerHTML = items.map((item, idx) => `
    <div class="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
      <span class="text-2xl">${item.emoji || '🍽️'}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold truncate">${escHtml(item.name)}</p>
        <p class="text-xs text-gray-400">R$ ${Number(item.price).toFixed(2)} cada</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="changeQty(${idx},-1)" class="w-7 h-7 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center text-sm font-bold">−</button>
        <span class="w-5 text-center text-sm font-bold">${item.qty}</span>
        <button onclick="changeQty(${idx},1)" class="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center text-sm font-bold">+</button>
      </div>
      <span class="text-sm font-bold w-16 text-right">R$ ${(item.price * item.qty).toFixed(2)}</span>
    </div>
  `).join('');

  const subtotal = items.reduce((acc, i) => acc + i.price * i.qty, 0);
  const delivery = STATE.cart.deliveryFee;
  const total = subtotal + delivery;

  document.getElementById('cart-subtotal').textContent = `R$ ${subtotal.toFixed(2)}`;
  document.getElementById('cart-delivery').textContent = delivery === 0 ? 'Grátis 🎉' : `R$ ${delivery.toFixed(2)}`;
  document.getElementById('cart-total').textContent = `R$ ${total.toFixed(2)}`;
}

function changeQty(idx, delta) {
  STATE.cart.items[idx].qty += delta;
  if (STATE.cart.items[idx].qty <= 0) STATE.cart.items.splice(idx, 1);
  updateCartBadge();
  renderCartDrawer();
}

function proceedCheckout() {
  if (!STATE.currentUser) {
    closeCart();
    openLoginModal(true);
    return;
  }
  closeCart();
  openPixModal();
}

// ── Login Modal ────────────────────────────────────────────
let _afterLogin = null;
function openLoginModal(afterLogin) {
  _afterLogin = afterLogin;
  document.getElementById('login-modal').classList.remove('hidden');
}
function closeLoginModal(e) {
  if (e && e.target !== document.getElementById('login-modal')) return;
  document.getElementById('login-modal').classList.add('hidden');
}

// ── Pix Payment Modal ──────────────────────────────────────
function openPixModal() {
  const items = STATE.cart.items;
  const subtotal = items.reduce((acc, i) => acc + i.price * i.qty, 0);
  const total = subtotal + STATE.cart.deliveryFee;

  document.getElementById('pix-total').textContent = `R$ ${total.toFixed(2)}`;
  document.getElementById('pix-modal').classList.remove('hidden');

  // Call Mercado Pago API to generate Pix
  generatePixPayment(total);
}

function closePixModal(e) {
  if (e && e.target !== document.getElementById('pix-modal')) return;
  document.getElementById('pix-modal').classList.add('hidden');
  if (STATE.pixPolling) { clearInterval(STATE.pixPolling); STATE.pixPolling = null; }
}

async function generatePixPayment(amount) {
  // ── MERCADO PAGO PIX INTEGRATION ──────────────────────────
  // Substitua pela sua lógica de backend. Por segurança, NUNCA
  // exponha o access_token no frontend em produção.
  // Use um Cloud Function / backend para criar o pagamento.
  // Exemplo de chamada a um endpoint seguro:
  //
  // const res = await fetch('https://sua-cloud-function.com/criar-pix', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     amount,
  //     description: 'Pedido Cipó Delivery',
  //     payerEmail: STATE.currentUser.email,
  //   })
  // });
  // const data = await res.json();
  // document.getElementById('pix-code').textContent = data.point_of_interaction.transaction_data.qr_code;
  // STATE.pixOrderId = data.id;
  // startPixPolling(data.id);
  //
  // Por ora, simulamos o fluxo:

  setTimeout(() => {
    const fakeCode = `00020126580014BR.GOV.BCB.PIX0136${crypto.randomUUID()}5204000053039865406${(amount*100).toFixed(0).padStart(10,'0')}5802BR5925CIPO DELIVERY LTDA6009CIPOBAHIA62140510CIPOPIX00163044A0F`;
    document.getElementById('pix-code').textContent = fakeCode;

    // Simulate QR
    const qr = document.getElementById('pix-qr-code');
    qr.innerHTML = `<div class="text-center text-xs text-gray-400 p-2">
      <div class="grid grid-cols-5 gap-0.5 w-28 h-28">
        ${Array(25).fill(0).map((_,i)=>`<div class="${Math.random()>.5?'bg-gray-900':'bg-white'} w-full aspect-square rounded-sm"></div>`).join('')}
      </div>
      <p class="mt-1">QR Code Pix</p>
    </div>`;

    // Simulate payment polling
    pollPixPayment();
  }, 1200);
}

function pollPixPayment() {
  // Em produção: polling no seu backend que verifica o webhook do Mercado Pago
  let attempts = 0;
  STATE.pixPolling = setInterval(() => {
    attempts++;
    // Simulate approval after 8s (demo)
    if (attempts >= 4) {
      clearInterval(STATE.pixPolling);
      onPixConfirmed();
    }
  }, 2000);
}

async function onPixConfirmed() {
  const status = document.getElementById('pix-status');
  status.className = 'flex items-center gap-2 justify-center py-2 rounded-xl text-sm font-semibold text-green-700 bg-green-50 mb-4';
  status.innerHTML = '<i class="fa-solid fa-check-circle text-green-500"></i> Pagamento confirmado! Criando pedido...';

  // Create order in Firestore
  await createOrder();
}

async function createOrder() {
  const { db, addDoc, collection, serverTimestamp } = window._fb;

  const items = STATE.cart.items;
  const subtotal = items.reduce((acc, i) => acc + i.price * i.qty, 0);
  const total = subtotal + STATE.cart.deliveryFee;

  const order = {
    userId:      STATE.currentUser.uid,
    userEmail:   STATE.currentUser.email,
    userName:    STATE.currentUser.displayName,
    storeId:     STATE.cart.storeId,
    storeName:   STATE.cart.storeName,
    items:       items.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty, emoji:i.emoji })),
    subtotal,
    deliveryFee: STATE.cart.deliveryFee,
    total,
    status:      'aguardando',
    paymentMethod:'pix',
    paidAt:      serverTimestamp(),
    createdAt:   serverTimestamp(),
  };

  try {
    const ref = await addDoc(collection(db, 'orders'), order);
    STATE.pixOrderId = ref.id;

    // Reset cart
    STATE.cart = { storeId: null, storeName: '', items: [], deliveryFee: 0 };
    updateCartBadge();

    // Close Pix modal, navigate to orders
    document.getElementById('pix-modal').classList.add('hidden');
    showToast('🎉 Pedido confirmado! Acompanhe na aba Pedidos.');
    navigate('orders');

    // Play cash register sound
    playRegisterSound();

  } catch(e) {
    showToast('Erro ao criar pedido: ' + e.message, true);
  }
}

function playRegisterSound() {
  try {
    const audio = document.getElementById('cash-register-sound');
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch(e) {}
}

function copyPixCode() {
  const code = document.getElementById('pix-code').textContent;
  navigator.clipboard.writeText(code).then(() => showToast('✅ Código Pix copiado!'));
}

// ── Client Orders ──────────────────────────────────────────
function loadClientOrders() {
  if (!STATE.currentUser) {
    document.getElementById('orders-skeleton').classList.add('hidden');
    document.getElementById('orders-list').classList.add('hidden');
    document.getElementById('orders-empty').classList.add('hidden');
    document.getElementById('orders-login-prompt').classList.remove('hidden');
    return;
  }

  document.getElementById('orders-login-prompt').classList.add('hidden');

  const { db, collection, query, where, orderBy, onSnapshot } = window._fb;
  const q = query(
    collection(db, 'orders'),
    where('userId','==', STATE.currentUser.uid),
    orderBy('createdAt','desc')
  );

  if (UNSUBS.clientOrders) UNSUBS.clientOrders();
  UNSUBS.clientOrders = onSnapshot(q, snap => {
    const orders = [];
    snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
    renderClientOrders(orders);
  }, () => {
    document.getElementById('orders-skeleton').classList.add('hidden');
    document.getElementById('orders-empty').classList.remove('hidden');
  });
}

function renderClientOrders(orders) {
  document.getElementById('orders-skeleton').classList.add('hidden');
  const list = document.getElementById('orders-list');
  const empty = document.getElementById('orders-empty');

  if (!orders.length) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  list.classList.remove('hidden');
  empty.classList.add('hidden');
  list.innerHTML = orders.map(o => orderCard(o)).join('');
}

function orderCard(o) {
  const statusMap = {
    aguardando: { label:'Aguardando', cls:'status-aguardando', icon:'⏳' },
    preparando:  { label:'Preparando', cls:'status-preparando', icon:'👨‍🍳' },
    saiu:        { label:'Saiu para entrega', cls:'status-saiu', icon:'🛵' },
    entregue:    { label:'Entregue', cls:'status-entregue', icon:'✅' },
  };
  const st = statusMap[o.status] || statusMap.aguardando;
  const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('pt-BR') : 'Agora';

  return `
  <div class="bg-white rounded-2xl p-4 shadow-sm cursor-pointer" onclick="openOrderStatus('${o.id}')">
    <div class="flex items-center justify-between mb-2">
      <h4 class="font-bold text-sm">${escHtml(o.storeName)}</h4>
      <span class="text-xs px-2 py-0.5 rounded-full font-bold ${st.cls}">${st.icon} ${st.label}</span>
    </div>
    <p class="text-xs text-gray-400 mb-2">${o.items?.map(i=>`${i.qty}x ${i.name}`).join(', ') || ''}</p>
    <div class="flex items-center justify-between">
      <span class="text-xs text-gray-400">${date}</span>
      <span class="font-black text-brand">R$ ${Number(o.total||0).toFixed(2)}</span>
    </div>
  </div>`;
}

async function openOrderStatus(orderId) {
  const { db, doc, onSnapshot } = window._fb;
  const modal = document.getElementById('order-status-modal');
  modal.classList.remove('hidden');

  const unsub = onSnapshot(doc(db, 'orders', orderId), snap => {
    if (!snap.exists()) return;
    const o = { id: snap.id, ...snap.data() };
    renderOrderStatusContent(o);
  });

  modal._unsub = unsub;
}

function renderOrderStatusContent(o) {
  const steps = ['aguardando','preparando','saiu','entregue'];
  const icons  = ['⏳','👨‍🍳','🛵','✅'];
  const labels = ['Aguardando','Preparando','Saiu para entrega','Entregue'];
  const curIdx = steps.indexOf(o.status);

  const stepsHtml = steps.map((s, i) => {
    const done = i <= curIdx;
    const active = i === curIdx;
    return `
    <div class="flex items-center gap-3 ${i < steps.length-1 ? 'mb-3' : ''}">
      <div class="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-lg
        ${active ? 'bg-brand text-white shadow-lg shadow-brand/30' : done ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}">
        ${icons[i]}
      </div>
      <div class="flex-1">
        <p class="text-sm font-bold ${done ? 'text-gray-900' : 'text-gray-400'}">${labels[i]}</p>
      </div>
      ${active ? `<div class="w-2 h-2 rounded-full bg-brand animate-pulse"></div>` : ''}
    </div>
    ${i < steps.length-1 ? `<div class="w-0.5 h-4 ml-5 ${i < curIdx ? 'bg-green-400' : 'bg-gray-200'} rounded-full mb-3"></div>` : ''}`;
  }).join('');

  document.getElementById('order-status-content').innerHTML = `
    <div class="mb-4">${stepsHtml}</div>
    <div class="bg-gray-50 rounded-2xl p-4">
      <p class="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Resumo do Pedido</p>
      ${o.items?.map(i=>`<div class="flex justify-between text-sm py-1"><span>${i.qty}x ${escHtml(i.name)}</span><span class="font-bold">R$ ${(i.price*i.qty).toFixed(2)}</span></div>`).join('')||''}
      <div class="border-t border-gray-200 mt-2 pt-2 flex justify-between font-extrabold">
        <span>Total</span><span class="text-brand">R$ ${Number(o.total||0).toFixed(2)}</span>
      </div>
    </div>`;
}

function closeOrderStatus(e) {
  if (e && e.target !== document.getElementById('order-status-modal')) return;
  const modal = document.getElementById('order-status-modal');
  if (modal._unsub) modal._unsub();
  modal.classList.add('hidden');
}

// ── MAP ────────────────────────────────────────────────────
function initMap() {
  const cipo = [-10.8023, -38.5158];
  const map = L.map('map', { center: cipo, zoom: 15, zoomControl: false });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO', subdomains:'abcd', maxZoom:19
  }).addTo(map);

  const mkPremium = L.divIcon({ className:'', html:`<div class="lmap-pin premium"><i class="fa-solid fa-star text-white"></i></div>`, iconSize:[40,40], iconAnchor:[20,40] });
  const mkStd     = L.divIcon({ className:'', html:`<div class="lmap-pin std"><i class="fa-solid fa-utensils text-white"></i></div>`, iconSize:[36,36], iconAnchor:[18,36] });

  L.marker([-10.8023,-38.5158],{icon:mkPremium}).addTo(map)
    .bindPopup('<b>🌟 Pizzaria do Zé</b><br>Parceiro Premium · 4.8 ⭐');
  L.marker([-10.8050,-38.5180],{icon:mkStd}).addTo(map)
    .bindPopup('<b>🍔 Burguer Cipó</b><br>Parceiro Padrão · 4.6 ⭐');
  L.marker([-10.8000,-38.5140],{icon:mkStd}).addTo(map)
    .bindPopup('<b>🫐 Açaí da Serra</b><br>Parceiro Padrão · 4.9 ⭐');

  L.circle(cipo,{ radius:1500, color:'#DC2626', fillColor:'#DC2626', fillOpacity:0.05, weight:1.5, dashArray:'6,6' }).addTo(map);

  // Load real store pins from Firestore if available
  if (fbReady) loadMapPins(map);
}

function loadMapPins(map) {
  const { db, collection, onSnapshot } = window._fb;
  try {
    onSnapshot(collection(db,'stores'), snap => {
      snap.forEach(d => {
        const s = d.data();
        if (s.lat && s.lng) {
          const icon = L.divIcon({
            className:'',
            html:`<div class="lmap-pin ${s.plan==='ouro'?'premium':'std'}">${s.emoji||'🍽️'}</div>`,
            iconSize:[40,40], iconAnchor:[20,40]
          });
          L.marker([s.lat,s.lng],{icon}).addTo(map)
            .bindPopup(`<b>${s.name}</b><br>⭐ ${s.rating||'–'}`);
        }
      });
    });
  } catch(e) {}
}

// ── LOJISTA PANEL ──────────────────────────────────────────
async function initLojistaPanel() {
  if (!STATE.currentUser) {
    showToast('Faça login para acessar o painel', true);
    navigate('profile');
    return;
  }

  const { db, collection, query, where, getDocs, onSnapshot, orderBy } = window._fb;

  try {
    // Find lojista's store
    const q = query(collection(db,'stores'), where('ownerId','==', STATE.currentUser.uid));
    const snap = await getDocs(q);

    if (snap.empty) {
      document.getElementById('lojista-store-name').textContent = 'Loja não cadastrada — contate o suporte';
      return;
    }

    const storeDoc = snap.docs[0];
    STATE.lojistaStoreId = storeDoc.id;
    const store = storeDoc.data();

    document.getElementById('lojista-store-name').textContent = store.name || 'Minha Loja';
    document.getElementById('store-open-toggle').checked = !!store.isOpen;
    document.getElementById('store-status-label').textContent = store.isOpen ? 'Aberta' : 'Fechada';
    document.getElementById('delivery-fee-input').value = store.deliveryFee ?? '';

    // Config fields
    document.getElementById('cfg-store-name').value    = store.name || '';
    document.getElementById('cfg-store-moment').value  = store.moment || 'todos';
    document.getElementById('cfg-prep-time').value     = store.prepTime || 30;
    document.getElementById('cfg-store-emoji').value   = store.emoji || '';
    document.getElementById('cfg-store-desc').value    = store.description || '';

    // Load orders for this store
    lojistaLoadOrders();
    // Load products
    lojistaLoadProducts();
    // Load financials
    lojistaLoadFinanceiro();

  } catch(e) {
    document.getElementById('lojista-store-name').textContent = 'Erro ao carregar loja';
    showToast('Configure o Firebase para usar o painel', false, 4000);
  }
}

function lojistaTab(tab) {
  const tabs = ['pedidos','cardapio','financeiro','config'];
  tabs.forEach(t => {
    const btn = document.getElementById('tab-'+t);
    const panel = document.getElementById('lojista-'+t);
    if (t === tab) {
      btn.className = 'flex-1 py-3 text-sm font-bold border-b-2 border-brand text-brand';
      panel.classList.remove('hidden');
    } else {
      btn.className = 'flex-1 py-3 text-sm font-semibold text-gray-400 border-b-2 border-transparent';
      panel.classList.add('hidden');
    }
  });
  STATE.lojistaTab = tab;
}

async function toggleStoreStatus(isOpen) {
  if (!STATE.lojistaStoreId) return;
  const { db, doc, updateDoc } = window._fb;
  await updateDoc(doc(db,'stores',STATE.lojistaStoreId), { isOpen });
  document.getElementById('store-status-label').textContent = isOpen ? 'Aberta' : 'Fechada';
  showToast(isOpen ? '🟢 Loja aberta!' : '🔴 Loja fechada.');
}

async function saveDeliveryFee() {
  if (!STATE.lojistaStoreId) return;
  const { db, doc, updateDoc } = window._fb;
  const fee = parseFloat(document.getElementById('delivery-fee-input').value) || 0;
  await updateDoc(doc(db,'stores',STATE.lojistaStoreId), { deliveryFee: fee });
  showToast('✅ Taxa de entrega atualizada!');
}

function lojistaLoadOrders() {
  if (!STATE.lojistaStoreId) return;
  const { db, collection, query, where, orderBy, onSnapshot } = window._fb;
  const q = query(
    collection(db,'orders'),
    where('storeId','==',STATE.lojistaStoreId),
    orderBy('createdAt','desc')
  );

  if (UNSUBS.lojistaOrders) UNSUBS.lojistaOrders();
  UNSUBS.lojistaOrders = onSnapshot(q, snap => {
    const orders = [];
    snap.forEach(d => orders.push({ id:d.id, ...d.data() }));
    renderLojistaOrders(orders);

    // Sound for new orders
    if (snap.docChanges().some(c => c.type === 'added' && c.doc.data().status === 'aguardando')) {
      playRegisterSound();
    }
  }, () => {
    document.getElementById('lojista-orders-list').innerHTML = '';
    document.getElementById('lojista-orders-empty').classList.remove('hidden');
  });
}

function renderLojistaOrders(orders) {
  const list = document.getElementById('lojista-orders-list');
  const empty = document.getElementById('lojista-orders-empty');

  if (!orders.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = orders.map(o => lojistaOrderCard(o)).join('');
}

function lojistaOrderCard(o) {
  const next = { aguardando:'preparando', preparando:'saiu', saiu:'entregue' };
  const nextLabel = { aguardando:'▶ Iniciar preparo', preparando:'🛵 Saiu para entrega', saiu:'✅ Marcar entregue' };

  return `
  <div class="bg-white rounded-2xl p-4 shadow-sm">
    <div class="flex items-center justify-between mb-2">
      <div>
        <p class="font-bold text-sm">${escHtml(o.userName || 'Cliente')}</p>
        <p class="text-xs text-gray-400">${o.items?.map(i=>`${i.qty}x ${i.name}`).join(', ') || ''}</p>
      </div>
      <span class="font-black text-brand">R$ ${Number(o.total||0).toFixed(2)}</span>
    </div>
    <div class="flex gap-2 mt-3">
      <span class="flex-1 text-center text-xs py-1.5 rounded-xl font-bold status-${o.status}">${o.status}</span>
      ${next[o.status] ? `<button onclick="advanceOrder('${o.id}','${next[o.status]}')"
        class="flex-1 text-center text-xs py-1.5 rounded-xl font-bold bg-brand text-white">
        ${nextLabel[o.status]}</button>` : ''}
    </div>
  </div>`;
}

async function advanceOrder(orderId, newStatus) {
  const { db, doc, updateDoc } = window._fb;
  await updateDoc(doc(db,'orders',orderId), { status: newStatus });
  showToast('✅ Status atualizado!');
}

function lojistaLoadProducts() {
  if (!STATE.lojistaStoreId) return;
  const { db, collection, onSnapshot } = window._fb;

  if (UNSUBS.lojistaProducts) UNSUBS.lojistaProducts();
  UNSUBS.lojistaProducts = onSnapshot(
    collection(db,'stores',STATE.lojistaStoreId,'products'),
    snap => {
      const products = [];
      snap.forEach(d => products.push({ id:d.id, ...d.data() }));
      renderProductsManage(products);
    }, () => {
      document.getElementById('products-manage-empty').classList.remove('hidden');
    }
  );
}

function renderProductsManage(products) {
  const list = document.getElementById('products-manage-list');
  const empty = document.getElementById('products-manage-empty');

  if (!products.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = products.map(p => `
    <div class="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm">
      <span class="text-3xl">${p.emoji || '🍽️'}</span>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-sm truncate">${escHtml(p.name)}</p>
        <p class="text-xs text-gray-400">R$ ${Number(p.price||0).toFixed(2)}</p>
      </div>
      <!-- Active toggle -->
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" ${p.active!==false?'checked':''} class="sr-only"
          onchange="toggleProduct('${p.id}', this.checked)"/>
        <div class="w-10 h-5 bg-gray-300 toggle-track rounded-full"></div>
        <div class="toggle-thumb absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm"></div>
      </label>
      <button onclick="openProductModal('${p.id}')" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
        <i class="fa-solid fa-pen text-xs"></i>
      </button>
      <button onclick="deleteProduct('${p.id}')" class="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-400">
        <i class="fa-solid fa-trash-can text-xs"></i>
      </button>
    </div>
  `).join('');
}

async function toggleProduct(productId, active) {
  if (!STATE.lojistaStoreId) return;
  const { db, doc, updateDoc } = window._fb;
  await updateDoc(doc(db,'stores',STATE.lojistaStoreId,'products',productId), { active });
  showToast(active ? '✅ Produto ativado' : '⏸ Produto pausado');
}

async function deleteProduct(productId) {
  if (!confirm('Deseja remover este produto?')) return;
  const { db, doc, deleteDoc } = window._fb;
  await deleteDoc(doc(db,'stores',STATE.lojistaStoreId,'products',productId));
  showToast('🗑 Produto removido');
}

function openProductModal(editId) {
  document.getElementById('product-modal').classList.remove('hidden');
  document.getElementById('prod-editing-id').value = editId || '';
  document.getElementById('product-modal-title').textContent = editId ? 'Editar Produto' : 'Novo Produto';

  if (!editId) {
    ['prod-name','prod-desc','prod-price','prod-rating','prod-emoji'].forEach(id => {
      document.getElementById(id).value = '';
    });
  }
}

function closeProductModal(e) {
  if (e && e.target !== document.getElementById('product-modal')) return;
  document.getElementById('product-modal').classList.add('hidden');
}

async function saveProduct() {
  if (!STATE.lojistaStoreId) return;
  const { db, doc, addDoc, updateDoc, collection } = window._fb;

  const name     = document.getElementById('prod-name').value.trim();
  const desc     = document.getElementById('prod-desc').value.trim();
  const price    = parseFloat(document.getElementById('prod-price').value) || 0;
  const rating   = parseFloat(document.getElementById('prod-rating').value) || null;
  const emoji    = document.getElementById('prod-emoji').value.trim();
  const category = document.getElementById('prod-category').value;
  const editId   = document.getElementById('prod-editing-id').value;

  if (!name || !price) { showToast('⚠️ Nome e preço são obrigatórios', true); return; }

  const data = { name, description:desc, price, rating, emoji, category, active:true };

  if (editId) {
    await updateDoc(doc(db,'stores',STATE.lojistaStoreId,'products',editId), data);
    showToast('✅ Produto atualizado!');
  } else {
    data.createdAt = window._fb.serverTimestamp();
    await addDoc(collection(db,'stores',STATE.lojistaStoreId,'products'), data);
    showToast('✅ Produto adicionado!');
  }

  closeProductModal();
}

async function lojistaLoadFinanceiro() {
  if (!STATE.lojistaStoreId) return;
  const { db, collection, query, where, onSnapshot, orderBy } = window._fb;

  const q = query(
    collection(db,'orders'),
    where('storeId','==',STATE.lojistaStoreId),
    where('status','!=','aguardando'),
    orderBy('status'),
    orderBy('createdAt','desc')
  );

  onSnapshot(q, snap => {
    const orders = [];
    snap.forEach(d => orders.push({ id:d.id, ...d.data() }));
    renderFinanceiro(orders);
  }, () => {});
}

function renderFinanceiro(orders) {
  const content = document.getElementById('financeiro-content');
  if (!orders.length) {
    content.innerHTML = '<p class="text-sm text-center text-gray-400 py-4">Nenhuma venda registrada</p>';
    return;
  }

  const bruto = orders.reduce((a,o) => a + (o.total||0), 0);
  const comissao = bruto * 0.05;
  const liquido = bruto - comissao;

  content.innerHTML = orders.slice(0,10).map(o => `
    <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
      <div>
        <p class="text-xs font-bold">${escHtml(o.userName||'Cliente')}</p>
        <p class="text-[10px] text-gray-400">${o.createdAt?.toDate?.().toLocaleDateString('pt-BR')||'–'}</p>
      </div>
      <div class="text-right">
        <p class="text-sm font-black text-green-600">+ R$ ${(o.total||0).toFixed(2)}</p>
        <p class="text-[10px] text-gray-400">Liq: R$ ${((o.total||0)*0.95).toFixed(2)}</p>
      </div>
    </div>
  `).join('');

  document.getElementById('fin-bruto').textContent    = `R$ ${bruto.toFixed(2)}`;
  document.getElementById('fin-comissao').textContent = `- R$ ${comissao.toFixed(2)}`;
  document.getElementById('fin-liquido').textContent  = `R$ ${liquido.toFixed(2)}`;
}

async function saveStoreConfig() {
  if (!STATE.lojistaStoreId) return;
  const { db, doc, updateDoc } = window._fb;
  const data = {
    name:        document.getElementById('cfg-store-name').value.trim(),
    moment:      document.getElementById('cfg-store-moment').value,
    prepTime:    parseInt(document.getElementById('cfg-prep-time').value) || 30,
    emoji:       document.getElementById('cfg-store-emoji').value.trim(),
    description: document.getElementById('cfg-store-desc').value.trim(),
  };
  await updateDoc(doc(db,'stores',STATE.lojistaStoreId), data);
  document.getElementById('lojista-store-name').textContent = data.name || 'Minha Loja';
  showToast('✅ Configurações salvas!');
}

// ── Plan Checkout Modal ────────────────────────────────────
function openCheckout(plan, price) {
  document.getElementById('checkout-modal-title').textContent = `Plano ${plan} Selecionado! 🎉`;
  document.getElementById('checkout-modal-price').textContent = `R$ ${price}/mês`;
  const msg = encodeURIComponent(`Olá! Quero assinar o Plano ${plan} (R$ ${price}/mês) do Cipó Delivery!`);
  document.getElementById('checkout-whatsapp-link').href = `https://wa.me/5575999999999?text=${msg}`;
  document.getElementById('checkout-modal').classList.remove('hidden');
}

function closeCheckoutModalPlan(e) {
  if (e && e.target !== document.getElementById('checkout-modal')) return;
  document.getElementById('checkout-modal').classList.add('hidden');
}

// ── Toast ──────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, isError=false, duration=2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl animate-fadeIn max-w-[360px] text-center ${isError?'bg-red-600':'bg-gray-900'} text-white`;
  t.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), duration);
}

// ── Utilities ──────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
