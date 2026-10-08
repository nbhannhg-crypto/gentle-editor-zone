create type public.app_role as enum ('admin', 'merchant');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "users read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);
create policy "admins read all roles" on public.user_roles for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "users manage own profile" on public.profiles for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  owner_id uuid references auth.users(id) on delete cascade not null,
  active boolean not null default true,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.stores to authenticated;
grant all on public.stores to service_role;
alter table public.stores enable row level security;
create policy "owners manage own store" on public.stores for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "admins manage all stores" on public.stores for all to authenticated using (public.has_role(auth.uid(), 'admin'));

alter table public.training_rules add column store_id uuid references public.stores(id) on delete cascade;
alter table public.customers add column store_id uuid references public.stores(id) on delete cascade;
alter table public.channels add column store_id uuid references public.stores(id) on delete cascade;
alter table public.channel_messages add column store_id uuid references public.stores(id) on delete cascade;

create index on public.training_rules (store_id);
create index on public.customers (store_id);
create index on public.channels (store_id);
create index on public.channel_messages (store_id);

create policy "merchants manage own rules" on public.training_rules for all to authenticated
  using (store_id in (select id from public.stores where owner_id = auth.uid()))
  with check (store_id in (select id from public.stores where owner_id = auth.uid()));
create policy "merchants manage own customers" on public.customers for all to authenticated
  using (store_id in (select id from public.stores where owner_id = auth.uid()))
  with check (store_id in (select id from public.stores where owner_id = auth.uid()));
create policy "merchants manage own channels" on public.channels for all to authenticated
  using (store_id in (select id from public.stores where owner_id = auth.uid()))
  with check (store_id in (select id from public.stores where owner_id = auth.uid()));
create policy "merchants manage own channel messages" on public.channel_messages for all to authenticated
  using (store_id in (select id from public.stores where owner_id = auth.uid()))
  with check (store_id in (select id from public.stores where owner_id = auth.uid()));