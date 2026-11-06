require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const DEMO_EMAIL = process.env.DEMO_SELLER_EMAIL || 'demo-maker@youmadeit.local';
const DEMO_PASSWORD = process.env.DEMO_SELLER_PASSWORD || 'DemoMaker!2026-SafePass';

const PRODUCTS = [
  { name: 'Speckled Stoneware Mug', slugCat: 'ceramics-pottery', price: 2800, qty: 12, days: 2, desc: 'Wheel-thrown mug with a comfortable handle and speckled glaze.', materials: 'Stoneware clay, food-safe glaze', dimensions: '10 oz', style: 'Rustic modern' },
  { name: 'Midnight Ceramic Planter', slugCat: 'ceramics-pottery', price: 4200, qty: 6, days: 9, desc: 'Small indoor planter with drainage hole and matte charcoal finish.', materials: 'Ceramic', dimensions: '4.5 in diameter', style: 'Minimal' },
  { name: 'Hand-Poured Espresso Cups (Set of 2)', slugCat: 'ceramics-pottery', price: 3600, qty: 8, days: 15, desc: 'Matched pair of espresso cups with satin white interior.', materials: 'Porcelain', dimensions: '3 oz each', style: 'Clean' },
  { name: 'Chunky Knit Throw Blanket', slugCat: 'textiles-fiber', price: 8900, qty: 4, days: 4, desc: 'Soft chunky throw, hand-knit for cozy evenings.', materials: 'Chenille yarn', dimensions: '50 x 60 in', color: 'Oatmeal', style: 'Cozy' },
  { name: 'Embroidered Linen Tote', slugCat: 'textiles-fiber', price: 3400, qty: 15, days: 11, desc: 'Reusable tote with subtle botanical embroidery.', materials: 'Linen blend, cotton thread', dimensions: '15 x 16 in', style: 'Everyday' },
  { name: 'Woven Wall Hanging', slugCat: 'textiles-fiber', price: 6500, qty: 3, days: 21, desc: 'Textured fiber art piece made on a frame loom.', materials: 'Cotton, wool, wood dowel', dimensions: '12 x 24 in', style: 'Boho' },
  { name: 'Hammered Brass Hoop Earrings', slugCat: 'jewelry', price: 2400, qty: 20, days: 1, desc: 'Lightweight hoops with hand-hammered texture.', materials: 'Brass, gold-fill posts', dimensions: '1.5 in', style: 'Modern' },
  { name: 'Sea Glass Pendant Necklace', slugCat: 'jewelry', price: 3800, qty: 9, days: 6, desc: 'Frosted sea-glass pendant wrapped by hand.', materials: 'Sea glass, sterling silver', dimensions: '18 in chain', style: 'Coastal' },
  { name: 'Stacking Birthstone Rings', slugCat: 'jewelry', price: 5200, qty: 7, days: 18, desc: 'Slim stacking rings with custom birthstone colors.', materials: 'Sterling silver, glass stones', personalization: 'Choose birthstone color', style: 'Delicate' },
  { name: 'Botanical Risograph Print', slugCat: 'prints-illustrations', price: 1800, qty: 25, days: 3, desc: 'Limited-run risograph print on textured paper.', materials: 'Soy ink, archival paper', dimensions: '8 x 10 in', style: 'Illustrative' },
  { name: 'City Morning Art Print', slugCat: 'prints-illustrations', price: 2200, qty: 14, days: 13, desc: 'Warm illustration of a quiet morning street scene.', materials: 'Giclée print', dimensions: '11 x 14 in', style: 'Contemporary' },
  { name: 'Lavender Soy Candle', slugCat: 'candles-home', price: 1600, qty: 30, days: 5, desc: 'Clean-burning soy candle with calming lavender notes.', materials: 'Soy wax, cotton wick, essential oils', dimensions: '8 oz', style: 'Relaxed' },
  { name: 'Cedar & Amber Candle', slugCat: 'candles-home', price: 1900, qty: 18, days: 17, desc: 'Warm wood-and-amber scent in an amber glass jar.', materials: 'Soy wax, fragrance oil', dimensions: '9 oz', style: 'Warm' },
  { name: 'Walnut Cutting Board', slugCat: 'woodworking', price: 5400, qty: 5, days: 8, desc: 'Edge-grain cutting board finished with food-safe oil.', materials: 'Black walnut', dimensions: '9 x 14 in', style: 'Heirloom' },
  { name: 'Oak Desk Organizer', slugCat: 'woodworking', price: 3100, qty: 10, days: 22, desc: 'Compact organizer for pens, cards, and small tools.', materials: 'Solid oak', dimensions: '8 x 4 x 3 in', style: 'Functional' },
  { name: 'Citrus Poppy Seed Soap Bar', slugCat: 'beauty-wellness', price: 900, qty: 40, days: 7, desc: 'Handmade soap bar with gentle exfoliation.', materials: 'Olive oil, coconut oil, poppy seeds', dimensions: '4.5 oz', style: 'Fresh' },
  { name: 'Rosemary Mint Body Balm', slugCat: 'beauty-wellness', price: 1400, qty: 22, days: 16, desc: 'Nourishing balm for dry hands and cuticles.', materials: 'Shea butter, beeswax, botanicals', dimensions: '2 oz tin', style: 'Herbal' },
  { name: 'Pressed Flower Greeting Cards (Set of 6)', slugCat: 'stationery-paper', price: 1500, qty: 28, days: 10, desc: 'Blank cards featuring pressed floral designs.', materials: 'Recycled cardstock', dimensions: 'A2', style: 'Romantic' },
  { name: 'Hand-Bound Dot Grid Journal', slugCat: 'stationery-paper', price: 2600, qty: 11, days: 19, desc: 'Lay-flat journal with dot grid pages and cloth cover.', materials: 'Cotton cloth, paper', dimensions: '5.5 x 8.5 in', style: 'Classic' },
  { name: 'Ceramic Incense Holder', slugCat: 'ceramics-pottery', price: 2100, qty: 0, days: 12, desc: 'Minimal holder for stick incense with ash catch.', materials: 'Stoneware', dimensions: '9 in', style: 'Minimal', soldOut: true },
  { name: 'Personalized Leather Key Tag', slugCat: 'stationery-paper', price: 1700, qty: 16, days: 14, desc: 'Simple key tag with optional stamped initials.', materials: 'Vegetable-tanned leather', personalization: 'Up to 3 initials', style: 'Utility' },
  { name: 'Glass Bead Suncatcher', slugCat: 'jewelry', price: 2900, qty: 13, days: 20, desc: 'Hanging suncatcher that throws soft color in daylight.', materials: 'Glass beads, brass wire', dimensions: '10 in drop', style: 'Playful' }
];

function imageFor(name) {
  const seed = encodeURIComponent(name.replace(/[^a-zA-Z0-9 ]/g, '').trim());
  return `https://picsum.photos/seed/${seed}/800/800`;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is required.');
  if (!serviceKey) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) in .env to seed demo content.');

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let userId = null;
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (list.error) throw list.error;
  const found = (list.data?.users || []).find(u => (u.email || '').toLowerCase() === DEMO_EMAIL.toLowerCase());
  if (found) {
    userId = found.id;
  } else {
    const created = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'YouMadeIt Demo Studio' }
    });
    if (created.error) throw created.error;
    userId = created.data.user.id;
  }

  const now = new Date().toISOString();
  const { error: profileErr } = await admin.from('profiles').upsert({
    id: userId,
    display_name: 'YouMadeIt Demo Studio',
    email: DEMO_EMAIL,
    role: 'seller',
    approval_status: 'approved',
    approved_at: now,
    approved_by: userId
  }, { onConflict: 'id' });
  if (profileErr) throw profileErr;

  const { data: existingShop } = await admin.from('shops').select('id').eq('owner_id', userId).eq('slug', 'demo-studio').maybeSingle();
  let shopId = existingShop?.id;
  if (!shopId) {
    const { data: shop, error: shopErr } = await admin.from('shops').insert([{
      owner_id: userId,
      name: 'Demo Studio',
      slug: 'demo-studio',
      description: 'Sample handmade listings for exploring the YouMadeIt experience.',
      location: 'Demo City',
      processing_time: '1–3 business days',
      shipping_info: 'Standard shipping calculated at checkout in production; sandbox demo.',
      return_policy: 'Demo listing policy for testing.',
      is_active: true
    }]).select('id').single();
    if (shopErr) throw shopErr;
    shopId = shop.id;
  }

  const { data: cats, error: catErr } = await admin.from('categories').select('id,slug');
  if (catErr) throw catErr;
  const catBySlug = Object.fromEntries((cats || []).map(c => [c.slug, c.id]));

  let created = 0, updated = 0;
  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    const category_id = catBySlug[p.slugCat] || null;
    const createdAt = new Date(Date.now() - p.days * 86400000 - i * 3600000).toISOString();
    const payload = {
      seller_id: userId,
      shop_id: shopId,
      category_id,
      name: p.name,
      description: p.desc,
      price_cents: p.price,
      currency: 'USD',
      status: 'published',
      moderation_status: 'approved',
      quantity: p.soldOut ? 0 : p.qty,
      materials: p.materials || null,
      dimensions: p.dimensions || null,
      color: p.color || null,
      style: p.style || null,
      personalization: p.personalization || null,
      processing_time: '1–3 business days',
      shipping_info: 'Ships in protective packaging.',
      tags: [p.slugCat, 'demo', 'handmade'],
      published_at: createdAt,
      created_at: createdAt,
      updated_at: now
    };

    const { data: existing } = await admin.from('products').select('id').eq('shop_id', shopId).eq('name', p.name).maybeSingle();
    let productId;
    if (existing) {
      const { error } = await admin.from('products').update(payload).eq('id', existing.id);
      if (error) throw error;
      productId = existing.id;
      updated++;
    } else {
      const { data: row, error } = await admin.from('products').insert([payload]).select('id').single();
      if (error) throw error;
      productId = row.id;
      created++;
    }

    const { data: imgs } = await admin.from('product_images').select('id').eq('product_id', productId).limit(1);
    if (!imgs || !imgs.length) {
      const urlImg = imageFor(p.name);
      const { error: imgErr } = await admin.from('product_images').insert([{
        product_id: productId,
        storage_path: 'demo/' + productId,
        url: urlImg,
        is_main: true,
        sort_order: 0
      }]);
      if (imgErr) throw imgErr;
    }
  }

  console.log(`Demo seed complete. Created ${created}, updated ${updated} products for shop demo-studio.`);
  console.log(`Demo seller: ${DEMO_EMAIL} (password from DEMO_SELLER_PASSWORD env or default).`);
}

main().catch(err => { console.error('Seed failed:', err.message || err); process.exit(1); });
