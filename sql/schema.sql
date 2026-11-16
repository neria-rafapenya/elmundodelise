-- El mundo de Lise · esquema de la tienda (prefijo elise_)
-- Ejecutar en Supabase → SQL Editor. Es idempotente: se puede lanzar varias veces.
-- Todas las tablas tienen RLS activado y SIN políticas: solo el servidor (service_role)
-- puede leer y escribir. El navegador nunca accede directamente a estas tablas.


-- Perfiles de cliente (1:1 con auth.users, solo para usuarios de la tienda)
create table if not exists public.elise_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  address     text,
  postal_code text,
  city        text,
  province    text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.elise_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.elise_products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  price_cents int  not null check (price_cents >= 0),
  category_id uuid references public.elise_categories(id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Las imágenes se guardan en el disco del hosting; aquí solo la ruta pública
create table if not exists public.elise_product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.elise_products(id) on delete cascade,
  path       text not null,           -- p. ej. /uploads/products/abc.jpg
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

-- Tallas / colores con su stock
create table if not exists public.elise_product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.elise_products(id) on delete cascade,
  size       text,
  color      text,
  sku        text,
  stock      int  not null default 0 check (stock >= 0),
  created_at timestamptz not null default now()
);

create sequence if not exists public.elise_order_number_seq start 1001;

create table if not exists public.elise_orders (
  id               uuid primary key default gen_random_uuid(),
  number           bigint not null unique default nextval('public.elise_order_number_seq'),
  user_id          uuid not null references auth.users(id),
  status           text not null default 'pending_payment'
                   check (status in ('pending_payment','pending_bizum','paid','preparing','shipped','delivered','cancelled')),
  payment_method   text not null check (payment_method in ('paypal','bizum')),
  subtotal_cents   int not null,
  shipping_cents   int not null default 0,
  total_cents      int not null,
  ship_name        text not null,
  ship_phone       text,
  ship_address     text not null,
  ship_postal_code text not null,
  ship_city        text not null,
  ship_province    text,
  notes            text,
  paypal_order_id  text,
  tracking         text,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.elise_order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.elise_orders(id) on delete cascade,
  product_id       uuid references public.elise_products(id) on delete set null,
  variant_id       uuid references public.elise_product_variants(id) on delete set null,
  name             text not null,
  size             text,
  color            text,
  unit_price_cents int  not null,
  qty              int  not null check (qty > 0)
);

create index if not exists elise_products_category_idx on public.elise_products(category_id);
create index if not exists elise_images_product_idx    on public.elise_product_images(product_id, sort);
create index if not exists elise_variants_product_idx  on public.elise_product_variants(product_id);
create index if not exists elise_orders_user_idx       on public.elise_orders(user_id, created_at desc);
create index if not exists elise_items_order_idx       on public.elise_order_items(order_id);

-- RLS activado sin políticas → nadie salvo service_role
alter table public.elise_profiles         enable row level security;
alter table public.elise_categories       enable row level security;
alter table public.elise_products         enable row level security;
alter table public.elise_product_images   enable row level security;
alter table public.elise_product_variants enable row level security;
alter table public.elise_orders           enable row level security;
alter table public.elise_order_items      enable row level security;

-- Marca un pedido como pagado y descuenta stock de forma atómica.
-- Si falta stock de alguna variante, falla y no cambia nada.
create or replace function public.elise_mark_paid(p_order_id uuid, p_paypal_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_status text;
begin
  select status into v_status from elise_orders where id = p_order_id for update;
  if v_status is null then raise exception 'Pedido no encontrado'; end if;
  if v_status = 'paid' or v_status in ('preparing','shipped','delivered') then return; end if;
  if v_status = 'cancelled' then raise exception 'Pedido cancelado'; end if;

  for r in select variant_id, qty from elise_order_items where order_id = p_order_id and variant_id is not null loop
    update elise_product_variants set stock = stock - r.qty
     where id = r.variant_id and stock >= r.qty;
    if not found then raise exception 'Sin stock suficiente para la variante %', r.variant_id; end if;
  end loop;

  update elise_orders
     set status = 'paid', paid_at = now(), updated_at = now(),
         paypal_order_id = coalesce(p_paypal_id, paypal_order_id)
   where id = p_order_id;
end;
$$;

revoke all on function public.elise_mark_paid(uuid, text) from public, anon, authenticated;
grant execute on function public.elise_mark_paid(uuid, text) to service_role;

-- Categorías de ejemplo (puedes borrarlas)
insert into public.elise_categories (name, slug, sort) values
  ('Vestidos', 'vestidos', 1), ('Camisetas', 'camisetas', 2), ('Complementos', 'complementos', 3)
on conflict (slug) do nothing;

-- Para hacerte administrador, después de registrarte en la tienda:
-- update public.elise_profiles set is_admin = true
--  where id = (select id from auth.users where email = 'TU_EMAIL');
