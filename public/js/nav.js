// Shared navigation shell
export function renderHeader({ currentPage = '', cartCount = 0 } = {}) {
  const isAuthPage = currentPage === 'login' || currentPage === 'register' || currentPage === 'reset-password';
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="header-inner container">
      <a href="index.html" class="brand"><span class="brand-mark">M</span>Handmade & Co.</a>
      <nav>
        <ul class="nav-list">
          <li><a href="index.html" class="${currentPage === 'home' ? 'active' : ''}">Home</a></li>
          <li><a href="shop.html" class="${currentPage === 'shop' ? 'active' : ''}">Shop</a></li>
          <li><a href="categories.html" class="${currentPage === 'categories' ? 'active' : ''}">Categories</a></li>
          <li><a href="about.html">About</a></li>
          <li><a href="contact.html">Contact</a></li>
        </ul>
      </nav>
      <div class="nav-actions">
        <a href="favorites.html" class="btn-ghost" aria-label="Favorites">★</a>
        <a href="cart.html" class="cart-badge btn-ghost" aria-label="Cart (<span id="cart-count-text">${cartCount}</span>)">
          <span aria-hidden="true">🛒</span><span class="cart-count" id="cart-count">${cartCount}</span>
        </a>
        <div class="auth-menu" id="auth-menu">
          <button class="menu-btn" id="menu-btn" aria-haspopup="true">Account <span class="visually-hidden">menu</span></button>
          <div class="dropdown" id="auth-dropdown">
            <div id="auth-links"></div>
          </div>
        </div>
        <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Menu">☰</button>
      </div>
    </div>
    <div class="mobile-menu" id="mobile-menu"></div>
  `;
  document.body.prepend(header);

  const mobileMenu = document.getElementById('mobile-menu');
  document.getElementById('mobile-menu-btn').addEventListener('click', () => mobileMenu.classList.toggle('open'));
  const menuBtn = document.getElementById('menu-btn');
  const dropdown = document.getElementById('auth-dropdown');
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('open'); });
  document.addEventListener('click', () => dropdown.classList.remove('open'));

  return header;
}

export function renderAuthLinks(user, profile) {
  const container = document.getElementById('auth-links');
  const mobile = document.getElementById('mobile-menu');
  if (!container) return;
  container.innerHTML = '';
  const links = [];
  if (user) {
    const role = (profile && profile.role) || 'buyer';
    links.push(
      { href: 'profile.html', label: 'Profile' },
      { href: 'orders.html', label: 'My Orders' },
      { href: 'favorites.html', label: 'Favorites' }
    );
    if (role === 'seller' || role === 'admin') {
      links.push({ href: 'seller-dashboard.html', label: 'Seller Dashboard' });
    }
    if (role === 'admin') {
      links.push({ href: 'admin.html', label: 'Administration' });
    }
    links.push({ href: '#', label: 'Sign out', onclick: 'appSignOut()' });
  } else {
    links.push(
      { href: 'login.html', label: 'Sign in' },
      { href: 'register.html', label: 'Create account' }
    );
  }
  links.forEach(l => {
    const a = document.createElement('a');
    a.href = l.href;
    a.textContent = l.label;
    if (l.onclick) a.setAttribute('onclick', l.onclick);
    container.appendChild(a);
  });
  // mobile menu mirror
  mobile.innerHTML = '';
  links.forEach(l => {
    const a = document.createElement('a');
    a.href = l.href;
    a.textContent = l.label;
    if (l.onclick) a.setAttribute('onclick', l.onclick);
    mobile.appendChild(a);
  });
  if (user) {
    const div = document.createElement('div');
    div.className = 'dropdown-divider';
    mobile.appendChild(div);
    const greet = document.createElement('div');
    greet.style.padding = '0.85rem 1rem';
    greet.style.fontSize = '0.9rem';
    greet.style.color = '#746D7D';
    greet.textContent = 'Signed in as ' + (profile && profile.display_name ? profile.display_name : user.email);
    mobile.appendChild(greet);
  }
}

export function updateCartCount(n) {
  const els = document.querySelectorAll('#cart-count');
  els.forEach(el => el.textContent = n);
  const txt = document.getElementById('cart-count-text');
  if (txt) txt.textContent = n;
}

// Called from inline onclick in auth dropdown
window.appSignOut = async () => {
  const { signOut } = await import('/js/init.js');
  await signOut();
};
