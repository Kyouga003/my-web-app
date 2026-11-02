// Shared header/navigation � rendered on every page.
// Follows the existing CSS: .site-header, .nav-list, .cart-badge, .cart-count,
// .auth-menu, .menu-btn, .dropdown, .mobile-menu-btn, .mobile-menu.

import { supabase } from '/js/init.js';

export function updateCartCount(count) {
  const n = parseInt(count || 0, 10) || 0;
  document.querySelectorAll('.cart-count').forEach((el) => {
    el.textContent = n;
    el.style.display = n > 0 ? '' : 'none';
    el.setAttribute('aria-label', n + ' item' + (n !== 1 ? 's' : '') + ' in cart');
  });
}

let currentPage = 'home';

const PUBLIC_LINKS = [
  { href: 'index.html', label: 'Home', page: 'home' },
  { href: 'shop.html', label: 'Shop', page: 'shop' },
  { href: 'favorites.html', label: 'Favorites', page: 'favorites' },
  { href: 'cart.html', label: 'Cart', page: 'cart' }
];

const AUTHD_LINKS = [
  { href: 'profile.html', label: 'Profile', page: 'profile', roles: ['buyer', 'seller', 'admin'] },
  { href: 'orders.html', label: 'Orders', page: 'orders', roles: ['buyer', 'seller', 'admin'] },
  { href: 'seller-dashboard.html', label: 'Seller dashboard', page: 'seller', roles: ['seller', 'admin'] },
  { href: 'admin.html', label: 'Administration', page: 'admin', roles: ['admin'] }
];

const MOBILE_DROPDOWN_ITEMS = [
  { href: 'profile.html', label: 'My profile', page: 'profile', roles: ['buyer', 'seller', 'admin'] },
  { href: 'orders.html', label: 'My orders', page: 'orders', roles: ['buyer', 'seller', 'admin'] },
  { href: 'favorites.html', label: 'Favorites', page: 'favorites', roles: ['buyer', 'seller', 'admin'] },
  { href: 'seller-dashboard.html', label: 'Seller dashboard', page: 'seller', roles: ['seller', 'admin'] },
  { href: 'admin.html', label: 'Administration', page: 'admin', roles: ['admin'] }
];

function isAuthPage() {
  const name = location.pathname.split('/').pop() || '';
  return /^(login|register|reset-password)\.html$/.test(name);
}

function linkTag(link) {
  const active = currentPage === link.page ? ' active' : '';
  return '<a href="' + link.href + '" class="nav-link' + active + '">' + link.label + '</a>';
}

function navLinksHTML(authed, role) {
  let html = '';
  for (const link of PUBLIC_LINKS) html += linkTag(link);
  if (authed) {
    for (const link of AUTHD_LINKS) {
      if (!link.roles.includes(role)) continue;
      html += linkTag(link);
    }
  } else if (!isAuthPage()) {
    html += '<a href="login.html" class="nav-link" style="padding:0.35rem 0.9rem;margin-left:0.5rem;font-size:0.9rem;border:1px solid var(--border);border-radius:var(--radius)">Sign in</a>';
  }
  return html;
}

function dropdownHTML(user, role) {
  let items = '';
  for (const it of MOBILE_DROPDOWN_ITEMS) {
    if (!it.roles.includes(role)) continue;
    items += '<a href="' + it.href + '" class="dropdown-item' + (currentPage === it.page ? ' active' : '') + '">' + it.label + '</a>';
  }
  items += '<hr class="dropdown-divider" style="margin:0.5rem 0">' +
    '<button class="dropdown-item signout-btn" style="text-align:left;width:100%;padding:0.65rem 1.25rem;background:transparent;border:none;color:inherit;font:inherit;cursor:pointer">Sign out</button>';
  return items;
}

function mobileMenuHTML(authed, role) {
  let html = '';
  for (const link of PUBLIC_LINKS) html += '<li>' + linkTag(link) + '</li>';
  if (authed) {
    for (const link of AUTHD_LINKS) {
      if (!link.roles.includes(role)) continue;
      html += '<li>' + linkTag(link) + '</li>';
    }
    for (const it of MOBILE_DROPDOWN_ITEMS) {
      if (!it.roles.includes(role)) continue;
      html += '<li><a href="' + it.href + '" class="' + (currentPage === it.page ? 'active' : '') + '">' + it.label + '</a></li>';
    }
    html += '<li><button class="signout-mobile" style="width:100%;text-align:left;padding:0.85rem 1rem;background:transparent;border:none;color:inherit;font:inherit;cursor:pointer;border-top:1px solid var(--border)">Sign out</button></li>';
  } else if (!isAuthPage()) {
    html += '<li><a href="login.html" style="padding:0.85rem 1rem;font-size:0.95rem;border-radius:var(--border)">Sign in</a></li>';
  }
  return html;
}

export function renderHeader({ currentPage: page } = {}) {
  if (page) currentPage = page;
  const existing = document.querySelector('.site-header');
  if (existing) existing.remove();

  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML =
    '<div class="header-inner">' +
    '<a href="index.html" class="brand">' +
    '<span class="brand-mark" aria-hidden="true">&#10027;</span>' +
    '<span>YouMadeIt</span>' +
    '</a>' +
    '<ul class="nav-list" aria-label="Main navigation"></ul>' +
    '<div class="nav-actions">' +
    '<a href="cart.html" class="cart-badge" aria-label="Shopping cart" style="position:relative;display:flex;align-items:center">' +
    '<svg class="cart-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>' +
    '<path d="M3 9l9-3 9 3v4.2l-5-2.1-5 2.1V9z"></path>' +
    '</svg>' +
    '<span class="cart-count">0</span>' +
    '</a>' +
    '<div class="auth-menu" id="auth-menu">' +
    '<button class="menu-btn" id="account-menu-btn" aria-haspopup="true" aria-expanded="false">Account</button>' +
    '<div class="dropdown" id="account-dropdown"></div>' +
    '</div>' +
    '<button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Menu" aria-expanded="false">&#9776;</button>' +
    '</div>' +
    '</div>' +
    '<ul class="mobile-menu" id="mobile-menu"></ul>';

  document.body.insertBefore(header, document.body.firstChild);
  return header;
}

export function renderAuthLinks(user, profile) {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const role = (profile && profile.role) ? profile.role : 'buyer';
  const authed = !!user;
  let dropdownOpen = false;

  const navList = header.querySelector('.nav-list');
  if (navList) navList.innerHTML = navLinksHTML(authed, role);

  const menuBtn = header.querySelector('#account-menu-btn');
  const dropdown = header.querySelector('#account-dropdown');
  const mobileBtn = header.querySelector('#mobile-menu-btn');
  const mobileMenu = header.querySelector('#mobile-menu');

  if (authed) {
    dropdown.innerHTML = dropdownHTML(user, role);
    dropdown.style.display = 'none';
    menuBtn.style.display = '';
    const signout = dropdown.querySelector('.signout-btn');
    if (signout) {
      signout.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { await supabase.auth.signOut(); } catch (_) { /* ignore */ }
        window.location.href = 'index.html';
      });
    }
    menuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropdownOpen = !dropdownOpen;
      dropdown.style.display = dropdownOpen ? 'block' : 'none';
      menuBtn.setAttribute('aria-expanded', dropdownOpen ? 'true' : 'false');
    });
    dropdown.addEventListener('click', (e) => e.stopPropagation());
  } else {
    dropdown.innerHTML = '';
    dropdown.style.display = 'none';
    menuBtn.style.display = 'none';
  }

  const mobileMenu = header.querySelector('#mobile-menu');
  mobileMenu.innerHTML = mobileMenuHTML(authed, role);
  mobileMenu.style.display = 'none';

  let mOpen = false;
  mobileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    mOpen = !mOpen;
    mobileMenu.style.display = mOpen ? 'block' : 'none';
    mobileBtn.setAttribute('aria-expanded', mOpen ? 'true' : 'false');
    if (mOpen) { dropdown.style.display = 'none'; dropdownOpen = false; menuBtn.setAttribute('aria-expanded', 'false'); }
  });
  mobileMenu.addEventListener('click', (e) => e.stopPropagation());
  mobileMenu.querySelectorAll('.signout-mobile').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { await supabase.auth.signOut(); } catch (_) { /* ignore */ }
      window.location.href = 'index.html';
    });
  });

  document.addEventListener('click', () => {
    dropdown.style.display = 'none';
    dropdownOpen = false;
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    mobileMenu.style.display = 'none';
    mOpen = false;
    mobileBtn.setAttribute('aria-expanded', 'false');
  });
  navList.addEventListener('click', (e) => e.stopPropagation());
}

export async function refreshCartCount() {
  try {
    const { currentUser } = await import('/js/init.js');
    if (!currentUser) { updateCartCount(0); return; }
    const { data: cart } = await supabase.from('carts').select('id').eq('user_id', currentUser.id).maybeSingle();
    if (!cart) { updateCartCount(0); return; }
    const { data: items } = await supabase.from('cart_items').select('quantity').eq('cart_id', cart.id);
    updateCartCount(items ? items.reduce((s, i) => s + (i.quantity || 0), 0) : 0);
  } catch (_) { updateCartCount(0); }
}
