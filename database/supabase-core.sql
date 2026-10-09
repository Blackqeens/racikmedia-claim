-- Racik Media Supabase foundation
-- Apply to a fresh Supabase project. Do not run schema.sql or schema-b2b.sql first:
-- those legacy schemas define their own public.users and public.orders tables.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone text,
  city text,
  bio text not null default '',
  avatar_path text,
  role text not null default 'member'
    check (role in ('member', 'seller', 'penyedia_jasa', 'mekanik', 'admin', 'master_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, city)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'city', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and current_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only a trusted server may change profile roles';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger protect_profile_role_before_update
  before update on public.profiles
  for each row execute function public.protect_profile_role();

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(trim(name)) >= 3),
  slug text not null unique,
  description text not null default '',
  category text,
  price numeric(14,2) not null check (price >= 0),
  unit text not null default 'pcs',
  stock integer not null default 0 check (stock >= 0),
  image_paths text[] not null default '{}',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_services (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(trim(name)) >= 3),
  slug text not null unique,
  description text not null default '',
  category text,
  base_price numeric(14,2) not null check (base_price >= 0),
  unit text not null default 'per layanan',
  location text,
  image_paths text[] not null default '{}',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.buyer_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'confirmed', 'in_progress', 'completed', 'cancelled', 'refunded')),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  service_fee numeric(14,2) not null default 0 check (service_fee >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  payment_method text,
  shipping_address jsonb not null default '{}'::jsonb,
  buyer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.buyer_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.buyer_orders(id) on delete cascade,
  item_type text not null check (item_type in ('product', 'service')),
  product_id uuid references public.catalog_products(id) on delete restrict,
  service_id uuid references public.catalog_services(id) on delete restrict,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored,
  constraint buyer_order_item_has_one_catalog_item check (
    (item_type = 'product' and product_id is not null and service_id is null)
    or (item_type = 'service' and service_id is not null and product_id is null)
  )
);

create table public.service_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_number text not null unique,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  service_id uuid not null references public.catalog_services(id) on delete restrict,
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  quantity integer not null default 1 check (quantity > 0),
  requested_at timestamptz not null,
  preferred_time text,
  location text,
  buyer_note text,
  estimated_total numeric(14,2) not null check (estimated_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index catalog_products_active_idx on public.catalog_products (is_active, category);
create index catalog_services_active_idx on public.catalog_services (is_active, category);
create index buyer_orders_buyer_created_idx on public.buyer_orders (buyer_id, created_at desc);
create index buyer_orders_seller_created_idx on public.buyer_orders (seller_id, created_at desc);
create index buyer_order_items_order_idx on public.buyer_order_items (order_id);
create index service_bookings_buyer_created_idx on public.service_bookings (buyer_id, created_at desc);
create index service_bookings_seller_created_idx on public.service_bookings (seller_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_services enable row level security;
alter table public.buyer_orders enable row level security;
alter table public.buyer_order_items enable row level security;
alter table public.service_bookings enable row level security;

create policy profiles_read_self
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy products_public_read_active
  on public.catalog_products for select to anon, authenticated
  using (is_active = true);

create policy products_seller_read_own
  on public.catalog_products for select to authenticated
  using (seller_id = (select auth.uid()));

create policy products_seller_insert_own
  on public.catalog_products for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('seller', 'penyedia_jasa')
    )
  );

create policy products_seller_update_own
  on public.catalog_products for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy services_public_read_active
  on public.catalog_services for select to anon, authenticated
  using (is_active = true);

create policy services_seller_read_own
  on public.catalog_services for select to authenticated
  using (seller_id = (select auth.uid()));

create policy services_seller_insert_own
  on public.catalog_services for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('seller', 'penyedia_jasa')
    )
  );

create policy services_seller_update_own
  on public.catalog_services for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy buyer_orders_read_participant
  on public.buyer_orders for select to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));

create policy buyer_order_items_read_participant
  on public.buyer_order_items for select to authenticated
  using (
    exists (
      select 1 from public.buyer_orders o
      where o.id = order_id
        and (o.buyer_id = (select auth.uid()) or o.seller_id = (select auth.uid()))
    )
  );

create policy service_bookings_read_participant
  on public.service_bookings for select to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));

-- Writes for orders and bookings intentionally have no client-side insert policy.
-- Add Supabase Edge Functions that validate prices, ownership, and availability
-- before inserting with the service role key kept server-side.

grant select on public.catalog_products, public.catalog_services to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.buyer_orders, public.buyer_order_items, public.service_bookings to authenticated;
grant insert, update on public.catalog_products, public.catalog_services to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-images',
  'catalog-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy catalog_images_public_read
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'catalog-images');

create policy catalog_images_seller_upload_own_folder
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'catalog-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('seller', 'penyedia_jasa')
    )
  );

create policy catalog_images_seller_update_own_folder
  on storage.objects for update to authenticated
  using (
    bucket_id = 'catalog-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'catalog-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy catalog_images_seller_delete_own_folder
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'catalog-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
