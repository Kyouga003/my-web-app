-- ============================================================================
-- Arts & Crafts Marketplace — Database Schema
-- Run this entire file in the Supabase SQL Editor of the configured project.
--
-- Creates: profiles, categories, shops, products, product_images, carts,
-- cart_items, favorites, orders, order_items, payments, reviews, notifications,
-- sales_events, seller_inquiries, reports — plus Row Level Security (RLS)
-- policies, indexes, triggers, a public storage bucket for product images, and
-- realtime publication for the live sales feed.
// ============================================================================

-- Extensions
create extension if not exists pgcrypto;

-- 1. Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  display_name text,
  email text,
  avatar_url text,
  bio text,
  role text check (role in ('buyer', 'seller', 'admin')) default 'buyer' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 2. Categories
create table if not exists public.categories (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique not null,
  description text,
  created_at timestamptz default now() not null
);

-- Auto-create a profile row when Supabase Auth creates the user
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'display_name'), split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$ language plpgsql;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();


-- 3. Seller shops
create table if not exists public.shops (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  slug text unique not null,
  description text,
  logo_url text,
  banner_url text,
  location text,
  processing_time text,
  shipping_info text,
  return_policy text,
  social_links jsonb default '{}'::jsonb,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 4. Products
create table if not exists public.products (
  id uuid default gen_random_uuid() primary key,
  seller_id uuid references public.profiles(id) on delete cascade not null,
  shop_id uuid references public.shops(id) on delete cascade not null,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text default 'USD' not null,
  status text check (status in ('draft', 'published')) default 'draft' not null,
  sku text,
  quantity integer not null default 0 check (quantity >= 0),
  condition text,
  materials text,
  dimensions text,
  weight text,
  color text,
  style text,
  personalization text,
  processing_time text,
  shipping_info text,
  tags text[] default '{}' not null,
  published_at timestamptz,
  created_at timestamptz default now() not null,
-- 6. Carts & cart items
create table if not exists public.carts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  updated_at timestamptz default now() not null
);

create table if not exists public.cart_items (
  id uuid default gen_random_uuid() primary key,
  cart_id uuid references public.carts(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade not null,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz default now() not null,
  unique (cart_id, product_id)
);

-- 7. Favorites
create table if not exists public.favorites (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  unique (user_id, product_id)
);

-- 8. Orders & order items
create table if not exists public.orders (
  id uuid default gen_random_uuid() primary key,
  order_number text unique not null,
  buyer_id uuid references public.profiles(id) on delete cascade not null,
  status text check (status in (
    'pending_payment', 'paid', 'processing', 'shipped', 'completed',
    'cancelled', 'refunded'
  )) default 'pending_payment' not null,
  subtotal_cents integer not null default 0,
  shipping_cents integer not null default 0,
  total_cents integer not null default 0,
  currency text default 'USD' not null,
  shipping_address jsonb not null default '{}'::jsonb,
  delivery_method text,
  tracking_number text,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.order_items (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references public.orders(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete set null,
  seller_id uuid references public.profiles(id) on delete cascade not null,
  product_name_snapshot text not null,
  price_cents integer not null,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz default now() not null
);

-- 9. Payments
create table if not exists public.payments (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references public.orders(id) on delete cascade not null unique,
  provider text not null default 'sandbox',
  provider_payment_id text,
  amount_cents integer not null,
  currency text default 'USD' not null,
  status text check (status in ('pending', 'paid', 'failed', 'refunded'))
    default 'pending' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 10. Reviews
create table if not exists public.reviews (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  order_item_id uuid references public.order_items(id) on delete set null,
  buyer_id uuid references public.profiles(id) on delete cascade not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  seller_response text,
  seller_responded_at timestamptz,
  unique (order_item_id)
);

-- 11. Notifications
create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null,
  title text not null,
  body text,
  link text,
  read boolean default false not null,
  created_at timestamptz default now() not null
);

-- 12. Sales events (live sales feed + seller dashboard)
create table if not exists public.sales_events (
  id uuid default gen_random_uuid() primary key,
  type text not null,
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  seller_id uuid references public.profiles(id),
  product_name_snapshot text,
  quantity integer,
  gross_cents integer,
  currency text default 'USD',
  created_at timestamptz default now() not null
);

-- 13. Seller inquiries (buyer-to-seller contact)
create table if not exists public.seller_inquiries (
  id uuid default gen_random_uuid() primary key,
  shop_id uuid references public.shops(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete set null,
  buyer_id uuid references public.profiles(id) on delete cascade not null,
  subject text not null,
  message text not null,
  created_at timestamptz default now() not null
);

-- 14. Reports / moderation
create table if not exists public.reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references public.profiles(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete set null,
  review_id uuid references public.reviews(id) on delete set null,
  reason text not null,
-- ============================================================================
-- Indexes
-- ============================================================================
create index if not exists idx_products_shop on public.products(shop_id);
create index if not exists idx_products_status on public.products(status);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_seller on public.products(seller_id);
create index if not exists idx_product_images_product on public.product_images(product_id);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_order_items_product on public.order_items(product_id);
create index if not exists idx_order_items_seller on public.order_items(seller_id);
create index if not exists idx_orders_buyer on public.orders(buyer_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_payments_order on public.payments(order_id);
create index if not exists idx_reviews_product on public.reviews(product_id);
create index if not exists idx_favorites_user on public.favorites(user_id);
create index if not exists idx_notifications_user on public.notifications(user_id, read);
create index if not exists idx_sales_events_created on public.sales_events(created_at desc);
create index if not exists idx_sales_events_seller on public.sales_events(seller_id, created_at desc);
create index if not exists idx_shops_slug on public.shops(slug);

-- ============================================================================
-- Triggers: updated_at timestamps
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  for t in (
    select tablename from pg_tables where schemaname = 'public'
      and tablename in (
        'profiles','shops','products','product_images','carts','cart_items',
        'favorites','orders','order_items','payments','reviews',
        'notifications','sales_events','seller_inquiries','reports'
      )
  ) loop
    execute format(
      'drop trigger if exists set_updated_at on %I; ' ||
      'create trigger set_updated_at before update on %I ' ||
      'for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- Inventory guard: never let quantity go negative
create or replace function public.guard_non_negative_quantity()
returns trigger as $$
begin
  if new.quantity < 0 then
    raise exception 'Insufficient stock for product %', new.id using errcode = '23514';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_guard_quantity
before update of quantity on public.products
for each row execute function public.guard_non_negative_quantity();

-- ============================================================================
-- Realtime publication for the live sales feed
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.sales_events;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.notifications;

-- ============================================================================
-- Storage bucket for product images (public bucket)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

  status text check (status in ('open', 'reviewed', 'resolved', 'dismissed'))
    default 'open' not null,
  created_at timestamptz default now() not null
);

  updated_at timestamptz default now() not null
);

-- 5. Product images (stored in Supabase Storage bucket 'product-images')
create table if not exists public.product_images (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  storage_path text not null,
  url text not null,
  is_main boolean default false not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null
);


-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.shops enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.favorites enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.sales_events enable row level security;
alter table public.seller_inquiries enable row level security;
alter table public.reports enable row level security;

-- Profiles: public read, owners/admins write
create policy "Profiles are viewable by everyone" on public.profiles
  for select using (true);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "Admins manage all profiles" on public.profiles
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Categories: public read, admins write
create policy "Categories are viewable by everyone" on public.categories for select using (true);
create policy "Admins manage categories" on public.categories
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Shops: public read; owners manage; authenticated can create
create policy "Shops are viewable by everyone" on public.shops for select using (true);
create policy "Shop owners manage own shop" on public.shops
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Authenticated users can create a shop" on public.shops
  for insert with check (auth.uid() = owner_id);


-- Products: published products viewable by everyone; sellers manage own
create policy "Published products are viewable by everyone" on public.products
  for select using (status = 'published');
create policy "Sellers manage own products" on public.products
  using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

-- Product images: public read; sellers manage images of their products
create policy "Product images are viewable by everyone" on public.product_images
  for select using (true);
create policy "Sellers manage images of own products" on public.product_images
  using (exists (
    select 1 from public.products where products.id = product_images.product_id
      and products.seller_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.products where products.id = product_images.product_id
      and products.seller_id = auth.uid()
  ));

-- Carts: users manage own cart
create policy "Users manage own cart" on public.carts
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own cart items" on public.cart_items
  using (exists (
    select 1 from public.carts where carts.id = cart_items.cart_id and carts.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.carts where carts.id = cart_items.cart_id and carts.user_id = auth.uid()
  ));

-- Favorites: users manage own favorites
create policy "Users manage own favorites" on public.favorites
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- Orders: buyer or a seller of an item in the order; admins all
create policy "Orders visible to buyer and involved sellers" on public.orders
  using (
    auth.uid() = buyer_id
    or exists (
      select 1 from public.order_items
      where order_items.order_id = orders.id and order_items.seller_id = auth.uid()
    )
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Buyers can create orders" on public.orders
  for insert with check (auth.uid() = buyer_id);
create policy "Buyers and sellers update own order scope" on public.orders
  for update using (
    auth.uid() = buyer_id
    or exists (
      select 1 from public.order_items
      where order_items.order_id = orders.id and order_items.seller_id = auth.uid()
    )
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Order items: same scope as orders
create policy "Order items visible to buyer and involved sellers" on public.order_items
  using (
    exists (
      select 1 from public.orders where orders.id = order_items.order_id
      and (orders.buyer_id = auth.uid()
        or exists (
          select 1 from public.order_items oi2
          where oi2.order_id = order_items.order_id and oi2.seller_id = auth.uid()
        ))
    )
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Order items insertable with order" on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders where orders.id = order_items.order_id
      and orders.buyer_id = auth.uid()
    )
  );

-- Payments: buyer/seller of the order; admins
create policy "Payments visible to order parties" on public.payments
  using (
    exists (
      select 1 from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.id = payments.order_id
      and (o.buyer_id = auth.uid() or oi.seller_id = auth.uid())
    )
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Reviews: public read; insert only for verified purchases; owners update
create policy "Reviews are viewable by everyone" on public.reviews for select using (true);
create policy "Buyers can review verified purchases" on public.reviews
  for insert with check (
    auth.uid() = buyer_id
    and exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id
        and oi.product_id = product_id
        and o.buyer_id = auth.uid()
        and o.status = 'completed'
    )
  );
create policy "Review owners update own review" on public.reviews
  for update using (auth.uid() = buyer_id);

-- Allow the app / browser to add support rows (notifications, sales events,
-- product images) when the JWT is present. Security stays in the API routes
-- and in RLS checks on the parent tables.
create policy "App can add notifications" on public.notifications
  for insert with check (auth.uid() is not null);

create policy "App can add sales events" on public.sales_events
  for insert with check (auth.uid() is not null);

create policy "App can add product images" on public.product_images
  for insert with check (auth.uid() is not null);

create policy "App can add payment rows" on public.payments
  for insert with check (auth.uid() is not null);

create policy "Sellers respond to reviews of their products" on public.reviews
  for update using (
    exists (
      select 1 from public.products p
      where p.id = reviews.product_id and p.seller_id = auth.uid()
    )
  );


-- Notifications: recipients read own; system creates
create policy "Users read own notifications" on public.notifications
  for select using (auth.uid() = user_id);

-- Sales events: public read (feed-safe, no buyer PII); sellers read own; admins all
create policy "Sales events are viewable by everyone" on public.sales_events for select using (true);
create policy "Sellers read own sales events" on public.sales_events
  for select using (auth.uid() = seller_id);
create policy "Admins read all sales events" on public.sales_events
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Seller inquiries: buyers insert; shop owners read own; admins all
create policy "Buyers can send inquiries" on public.seller_inquiries
  for insert with check (auth.uid() = buyer_id);
create policy "Inquiries visible to shop owner and buyer" on public.seller_inquiries
  for select using (
    auth.uid() = buyer_id
    or exists (select 1 from public.shops where shops.id = seller_inquiries.shop_id and shops.owner_id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Reports: reporters insert; admins read
create policy "Users can file reports" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "Admins manage reports" on public.reports
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Storage: product-images bucket — public read, authenticated upload
create policy "Product images are publicly readable" on storage.objects
  for select using (bucket_id = 'product-images');
create policy "Authenticated users can upload product images" on storage.objects
  for insert with check (bucket_id = 'product-images' and auth.uid() is not null);
create policy "Users can delete own uploads" on storage.objects
  for delete using (bucket_id = 'product-images' and auth.uid() = owner);

-- ============================================================================
-- Seed: default categories
-- ============================================================================
insert into public.categories (name, slug, description) values
  ('Ceramics & Pottery', 'ceramics-pottery', 'Hand-thrown pottery, mugs, bowls, and ceramic art'),
  ('Textiles & Fiber Arts', 'textiles-fiber', 'Knitting, crochet, weaving, embroidery, and fabric goods'),
  ('Jewelry', 'jewelry', 'Handcrafted earrings, necklaces, bracelets, and rings'),
  ('Prints & Illustrations', 'prints-illustrations', 'Original art prints, drawings, and illustrations'),
  ('Candles & Home Fragrance', 'candles-home', 'Hand-poured candles and home fragrance'),
  ('Woodworking', 'woodworking', 'Handcrafted wooden home goods and decor'),
  ('Beauty & Wellness', 'beauty-wellness', 'Handmade soaps, balms, and self-care'),
  ('Stationery & Paper Goods', 'stationery-paper', 'Cards, journals, and paper creations')
on conflict (slug) do nothing;

-- ============================================================================
-- Notes
-- ============================================================================
-- 1. After running this, designate at least one admin:
--    UPDATE public.profiles SET role = 'admin' WHERE id = '<your auth user id>';
-- 2. Email confirmations / password-reset emails depend on SMTP settings in your
--    Supabase project (Authentication > Email Templates).
-- 3. The 'product-images' bucket is public. Uploads are handled from the browser
--    with the Supabase anon key; RLS keeps uploads safe.
// ============================================================================
