require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase server client (anon key). User-scoped operations forward the
// caller's JWT so Row Level Security sees the real authenticated user.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serves HTML/CSS/JS static files

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Runtime config injected into the browser. The Supabase anon key is intended
// to be public; security is enforced by Row Level Security, not by secrecy.
app.get('/js/config.js', (_req, res) => {
  res.type('application/javascript');
  res.send(
    'window.SUPABASE_CONFIG = {\n' +
    '  url: ' + JSON.stringify(process.env.SUPABASE_URL) + ',\n' +
    '  key: ' + JSON.stringify(process.env.SUPABASE_KEY) + '\n' +
    '};\n'
  );
});

app.get('/api/health', async (_req, res) => {
  const { error } = await supabase.from('profiles').select('id').limit(1);
  res.json({ ok: !error, database: !error ? 'connected' : error.message });
});

// Diagnostic: reports which required tables exist (helps after schema setup)
const REQUIRED_TABLES = [
  'profiles', 'categories', 'shops', 'products', 'product_images', 'carts',
  'cart_items', 'favorites', 'orders', 'order_items', 'payments', 'reviews',
  'notifications', 'sales_events', 'seller_inquiries', 'reports'
];

app.get('/api/db/status', async (_req, res) => {
  const status = {};
  for (const table of REQUIRED_TABLES) {
    const { error } = await supabase.from(table).select('*').limit(1);
    status[table] = error ? { exists: false, error: error.message }
      : { exists: true };
  }
  res.json(status);
});

// Build a Supabase client that carries the caller's JWT for RLS.
function serverSupabase(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    global: { headers: { Authorization: token ? `Bearer ${token}` : '' } }
  });
}

async function requireUser(req, res, next) {
  const token = req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
    ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in required' });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired session' });
  req.user = user;
  next();
}

function requireRole(allowed) {
  return async (req, res, next) => {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', req.user.id).single();
    if (!profile || !allowed.includes(profile.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Existing messages API (preserved)
// ---------------------------------------------------------------------------
app.get('/api/messages', async (req, res) => {
  const { data, error } = await supabase.from('messages').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/messages', async (req, res) => {
  const { content } = req.body;
  const { data, error } = await supabase.from('messages').insert([{ content }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Success', data });
});

// ---------------------------------------------------------------------------
// Public read APIs (no auth required)
// ---------------------------------------------------------------------------
app.get('/api/categories', async (_req, res) => {
  const { data, error } = await supabase
    .from('categories').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/shops', async (_req, res) => {
  const { data, error } = await supabase
    .from('shops')
    .select('*, profiles(display_name, avatar_url)')
    .eq('is_active', true)
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/shops/:slug', async (req, res) => {
  const { data: shop, error } = await supabase
    .from('shops')
    .select('*, profiles(*)')
    .eq('slug', req.params.slug)
    .single();
  if (error || !shop) return res.status(404).json({ error: 'Shop not found' });
  const { data: products } = await supabase
    .from('products')
    .select('*, product_images(*)')
    .eq('shop_id', shop.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  res.json({ shop, products: products || [] });
});

// ---------------------------------------------------------------------------
// Seller: shop management (auth required)
// ---------------------------------------------------------------------------
app.post('/api/shops', requireUser, async (req, res) => {
  const { name, slug, description, location, processing_time, shipping_info, return_policy, social_links } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Shop name and slug are required' });
  const { data: profile } = await supabase.from('profiles').select('role, id').eq('id', req.user.id).single();
  if (!profile) {
    return res.status(403).json({ error: 'Profile not found' });
  }
  const { data: existing } = await supabase.from('shops').select('id').eq('slug', slug).limit(1);
  if (existing && existing.length) return res.status(409).json({ error: 'Shop URL already taken' });
  const { data, error } = await supabase.from('shops').insert([{
    owner_id: req.user.id, name, slug, description, location, processing_time,
    shipping_info, return_policy, social_links: social_links || {}
  }]).select();
  if (error) return res.status(500).json({ error: error.message });
  await supabase.from('profiles').update({ role: 'seller' }).eq('id', req.user.id);
  res.status(201).json(data[0]);
});

app.patch('/api/shops/:id', requireUser, async (req, res) => {
  const { data: shop } = await supabase.from('shops').select('owner_id').eq('id', req.params.id).single();
  if (!shop || shop.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your shop' });
  }
  const { data, error } = await supabase.from('shops').update(req.body).eq('id', req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// ---------------------------------------------------------------------------
// Seller: product management (auth required, ownership enforced)
// ---------------------------------------------------------------------------
app.post('/api/products', requireUser, async (req, res) => {
  const {
    shop_id, category_id, name, description, price, currency, status, sku,
    quantity, condition, materials, dimensions, weight, color, style,
    personalization, processing_time, shipping_info, tags
  } = req.body;
  if (!shop_id || !name) return res.status(400).json({ error: 'Shop and product name are required' });
  const { data: shop } = await supabase.from('shops').select('owner_id').eq('id', shop_id).single();
  if (!shop || shop.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your shop' });
  }
  const priceCents = Math.round(parseFloat(price) * 100) || 0;
  const { data, error } = await supabase.from('products').insert([{
    seller_id: req.user.id, shop_id, category_id, name, description,
    price_cents: priceCents, currency: currency || 'USD',
    status: status || 'draft', sku, quantity: parseInt(quantity) || 0,
    condition, materials, dimensions, weight, color, style,
    personalization, processing_time, shipping_info,
    tags: Array.isArray(tags) ? tags : [],
    ...(status === 'published' ? { published_at: new Date().toISOString() } : {})
  }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.patch('/api/products/:id', requireUser, async (req, res) => {
  const { data: product } = await supabase.from('products').select('seller_id, status').eq('id', req.params.id).single();
  if (!product || product.seller_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your product' });
  }
  const updates = { ...req.body };
  if (updates.price !== undefined) updates.price_cents = Math.round(parseFloat(updates.price) * 100);
  delete updates.price;
  if (updates.status === 'published' && product.status !== 'published') {
    updates.published_at = new Date().toISOString();
  }
  const { data, error } = await supabase.from('products').update(updates).eq('id', req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  if (!data.length) return res.status(404).json({ error: 'Product not found' });
  res.json(data[0]);
});

app.delete('/api/products/:id', requireUser, async (req, res) => {
  const { data: product } = await supabase.from('products').select('seller_id').eq('id', req.params.id).single();
  if (!product || product.seller_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your product' });
  }
  const { error } = await supabase.from('products').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Product deleted' });
});

// ---------------------------------------------------------------------------
// Buyer: orders (server-validated totals and stock)
// ---------------------------------------------------------------------------
app.post('/api/orders', requireUser, async (req, res) => {
  const { items, shipping_address, delivery_method, notes, payment_intent_id } = req.body;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'No items in order' });
  }

  if (payment_intent_id) {
    const { data: payment } = await supabase.from('payments').select('provider_payment_id').eq('provider_payment_id', payment_intent_id).single();
    if (payment) {
      const { data: linked } = await supabase.from('orders').select('id').eq('id', payment.order_id).limit(1);
      if (linked && linked.length) {
        return res.status(409).json({ error: 'Order already created for this payment' });
      }
    }
  }

  const productIds = [...new Set(items.map(i => i.product_id))];
  const { data: products } = await supabase
    .from('products').select('id, seller_id, name, price_cents, quantity, status').in('id', productIds);
  if (!products || products.length !== productIds.length) {
    return res.status(400).json({ error: 'One or more products are no longer available' });
  }
  const byId = Object.fromEntries(products.map(p => [p.id, p]));

  let subtotal = 0;
  const lineItems = [];
  for (const item of items) {
    const product = byId[item.product_id];
    if (!product) return res.status(400).json({ error: 'Unknown product' });
    if (product.status !== 'published') {
      return res.status(400).json({ error: product.name + ' is not available' });
    }
    const qty = parseInt(item.quantity) || 1;
    if (qty < 1) return res.status(400).json({ error: 'Invalid quantity' });
    if (product.quantity < qty) {
      return res.status(409).json({ error: 'Not enough stock for ' + product.name });
    }
    subtotal += product.price_cents * qty;
    lineItems.push({ product, qty });
  }

  const shippingCents = 0;
  const total = subtotal + shippingCents;
  const orderNumber = 'CRAFT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();

  const { data: order, error: orderError } = await supabase.from('orders').insert([{
    order_number: orderNumber, buyer_id: req.user.id,
    subtotal_cents: subtotal, shipping_cents: shippingCents, total_cents: total,
    shipping_address: shipping_address || {}, delivery_method, notes
  }]).select().single();
  if (orderError) return res.status(500).json({ error: orderError.message });

  const orderItemsRows = lineItems.map(li => ({
    order_id: order.id, product_id: li.product.id, seller_id: li.product.seller_id,
    product_name_snapshot: li.product.name, price_cents: li.product.price_cents, quantity: li.qty
  }));
  const { error: oiError } = await supabase.from('order_items').insert(orderItemsRows);
  if (oiError) {
    await supabase.from('orders').delete().eq('id', order.id);
    return res.status(500).json({ error: oiError.message });
  }

  const restored = [];
  for (const li of lineItems) {
    const { error: decError, data: decData } = await supabase
      .from('products')
      .update({ quantity: li.product.quantity - li.qty })
      .eq('id', li.product.id)
      .eq('quantity', li.product.quantity)
      .select('quantity');
    if (decError || !decData || !decData.length) {
      for (const r of restored) {
        await supabase.from('products').update({ quantity: r.before }).eq('id', r.id);
      }
      await supabase.from('order_items').delete().eq('order_id', order.id);
      await supabase.from('orders').delete().eq('id', order.id);
      return res.status(409).json({ error: 'Stock changed while ordering: ' + li.product.name });
    }
    restored.push({ id: li.product.id, before: li.product.quantity });
  }

  const { error: payError } = await supabase.from('payments').insert([{
    order_id: order.id, provider: 'sandbox', provider_payment_id: payment_intent_id || null,
    amount_cents: total, currency: 'USD', status: 'pending'
  }]);
  if (payError) console.error('Payment record error:', payError.message);

  const firstItem = lineItems[0];
  await supabase.from('sales_events').insert([{
    type: 'order_placed', order_id: order.id, product_id: firstItem.product.id,
    seller_id: firstItem.product.seller_id, product_name_snapshot: firstItem.product.name,
    quantity: firstItem.qty, gross_cents: total, currency: 'USD'
  }]);

  await supabase.from('notifications').insert([{
    user_id: req.user.id, type: 'order_placed',
    title: 'Order received',
    body: 'Your order #' + orderNumber + ' has been placed.',
    link: '/orders.html?id=' + order.id
  }]);

  for (const li of lineItems) {
    await supabase.from('notifications').insert([{
      user_id: li.product.seller_id, type: 'order_placed',
      title: 'New order',
      body: 'New order #' + orderNumber + ' includes "' + li.product.name + '".',
      link: '/seller-orders.html'
    }]);
  }

  res.status(201).json({ order, payment_intent_id: payment_intent_id || null });
});

app.get('/api/orders/:id', requireUser, async (req, res) => {
  const { data: order, error } = await supabase
    .from('orders').select('*, order_items(*)').eq('id', req.params.id).single();
  if (error || !order) return res.status(404).json({ error: 'Order not found' });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', req.user.id).single();
  const isSeller = order.order_items.some(oi => oi.seller_id === req.user.id);
  if (order.buyer_id !== req.user.id && !isSeller && profile.role !== 'admin') {
    return res.status(403).json({ error: 'Not your order' });
  }
  res.json(order);
});

app.get('/api/orders', requireUser, async (req, res) => {
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', req.user.id).single();
  let query = supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
  if (profile.role === 'admin') {
    // all orders
  } else if (profile.role === 'seller') {
    query = query.filter('order_items.seller_id', 'eq', req.user.id);
  } else {
    query = query.eq('buyer_id', req.user.id);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.patch('/api/orders/:id/ship', requireUser, async (req, res) => {
  const { tracking_number } = req.body;
  const { data: order } = await supabase.from('orders').select('*, order_items(*)').eq('id', req.params.id).single();
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const isSeller = order.order_items.some(oi => oi.seller_id === req.user.id);
  if (!isSeller) return res.status(403).json({ error: 'Only a seller of this order can ship it' });
  if (order.status !== 'paid' && order.status !== 'processing') {
    return res.status(400).json({ error: 'Order is not ready to ship' });
  }
  const { data, error } = await supabase.from('orders')
    .update({ status: 'shipped', tracking_number }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await supabase.from('sales_events').insert([{
    type: 'order_shipped', order_id: order.id, seller_id: req.user.id,
    product_name_snapshot: 'Order #' + order.order_number, gross_cents: order.total_cents, currency: order.currency
  }]);
  await supabase.from('notifications').insert([{
    user_id: order.buyer_id, type: 'order_shipped',
    body: 'Your order #' + order.order_number + ' is on its way' + (tracking_number ? ' (tracking: ' + tracking_number + ')' : '') + '.',
    link: '/orders.html?id=' + order.id
  }]);
  res.json(data);
});

app.patch('/api/orders/:id/cancel', requireUser, async (req, res) => {
  const { data: order } = await supabase.from('orders').select('*, order_items(*)').eq('id', req.params.id).single();
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.buyer_id !== req.user.id) return res.status(403).json({ error: 'Not your order' });
  if (!['pending_payment', 'paid'].includes(order.status)) {
    return res.status(400).json({ error: 'Order cannot be cancelled at this stage' });
  }
  const { data, error } = await supabase.from('orders')
    .update({ status: 'cancelled' }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  for (const oi of order.order_items) {
    if (!oi.product_id) continue;
    const { data: prod } = await supabase.from('products').select('quantity').eq('id', oi.product_id).single();
    if (prod) {
      await supabase.from('products').update({ quantity: prod.quantity + oi.quantity }).eq('id', oi.product_id);
    }
  }
  await supabase.from('sales_events').insert([{
    type: 'order_cancelled', order_id: order.id,
    product_name_snapshot: 'Order #' + order.order_number
  }]);
  res.json(data);
});

// ---------------------------------------------------------------------------
// Payments — SANDBOX (no live payment provider configured)
// ---------------------------------------------------------------------------
app.post('/api/payments/create-intent', requireUser, async (req, res) => {
  const { amount_cents } = req.body;
  if (!amount_cents || amount_cents <= 0) return res.status(400).json({ error: 'Invalid amount' });
  const intentId = 'sandbox_intent_' + Date.now().toString(36);
  await supabase.from('payments').insert([{
    order_id: null, provider: 'sandbox', provider_payment_id: intentId,
    amount_cents, currency: 'USD', status: 'pending'
  }]);
  res.json({ intent_id: intentId, amount_cents, currency: 'USD', test: true });
});

app.post('/api/payments/confirm', requireUser, async (req, res) => {
  const { intent_id } = req.body;
  const { data: payment } = await supabase.from('payments').select('*, orders(*)').eq('provider_payment_id', intent_id).single();
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status === 'paid') return res.json({ status: 'already_paid' });
  const { error } = await supabase.from('payments').update({ status: 'paid' }).eq('id', payment.id);
  if (error) return res.status(500).json({ error: error.message });
  const order = payment.orders;
  if (order && order.status === 'pending_payment') {
    await supabase.from('orders').update({ status: 'paid' }).eq('id', order.id);
    await supabase.from('sales_events').insert([{
      type: 'payment_confirmed', order_id: order.id,
      product_name_snapshot: 'Order #' + order.order_number, gross_cents: order.total_cents, currency: order.currency
    }]);
    await supabase.from('notifications').insert([{
      user_id: order.buyer_id, type: 'payment_confirmed',
      title: 'Payment confirmed',
      body: 'Payment for order #' + order.order_number + ' was confirmed.',
      link: '/orders.html?id=' + order.id
    }]);
  }
  res.json({ status: 'paid', order_id: order ? order.id : null });
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
app.get('/api/admin/orders', requireUser, requireRole(['admin']), async (req, res) => {
  const { data, error } = await supabase.from('orders').select('*, profiles(display_name)').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.patch('/api/admin/products/:id/hide', requireUser, requireRole(['admin']), async (req, res) => {
  const { data, error } = await supabase.from('products').update({ status: 'draft' }).eq('id', req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});