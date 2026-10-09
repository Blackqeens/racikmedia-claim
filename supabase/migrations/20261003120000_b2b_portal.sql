begin;

create or replace function public.is_b2b_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'master_admin')
  );
$$;

revoke all on function public.is_b2b_admin() from public;
grant execute on function public.is_b2b_admin() to authenticated;

create table if not exists public.corporate_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  company_name text not null check (char_length(trim(company_name)) between 2 and 200),
  npwp text not null check (char_length(trim(npwp)) between 8 and 30),
  address text not null check (char_length(trim(address)) between 8 and 500),
  pic_name text not null check (char_length(trim(pic_name)) between 2 and 120),
  pic_phone text not null check (char_length(trim(pic_phone)) between 8 and 30),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists corporate_clients_npwp_normalized_idx
  on public.corporate_clients (regexp_replace(npwp, '[^0-9]', '', 'g'));

create table if not exists public.seller_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  business_name text not null check (char_length(trim(business_name)) between 2 and 200),
  registration_number text not null check (char_length(trim(registration_number)) between 4 and 40),
  document_path text not null,
  identity_document_path text,
  selfie_document_path text,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.b2b_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  client_id uuid not null references public.corporate_clients(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  description text not null check (char_length(trim(description)) between 3 and 1000),
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  subtotal numeric(14,2) generated always as (quantity * unit_price) stored,
  tax_pct numeric(5,2) not null default 11 check (tax_pct between 0 and 100),
  tax_amount numeric(14,2) generated always as (round(quantity * unit_price * tax_pct / 100, 2)) stored,
  total_amount numeric(14,2) generated always as (quantity * unit_price + round(quantity * unit_price * tax_pct / 100, 2)) stored,
  due_date date not null,
  status text not null default 'unpaid'
    check (status in ('unpaid', 'paid', 'overdue', 'cancelled')),
  pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.b2b_agreements (
  id uuid primary key default gen_random_uuid(),
  agreement_number text not null unique,
  client_id uuid not null references public.corporate_clients(id) on delete restrict,
  invoice_id uuid not null references public.b2b_invoices(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 3 and 200),
  agreement_text text not null check (char_length(trim(agreement_text)) between 20 and 20000),
  status text not null default 'awaiting_signatures'
    check (status in ('awaiting_signatures', 'active', 'declined', 'completed')),
  buyer_accepted_at timestamptz,
  seller_accepted_at timestamptz,
  buyer_accepted_by uuid references public.profiles(id) on delete set null,
  seller_accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_b2b_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists corporate_clients_updated_at on public.corporate_clients;
create trigger corporate_clients_updated_at
  before update on public.corporate_clients
  for each row execute function public.set_b2b_updated_at();

drop trigger if exists seller_verifications_updated_at on public.seller_verifications;
create trigger seller_verifications_updated_at
  before update on public.seller_verifications
  for each row execute function public.set_b2b_updated_at();

drop trigger if exists b2b_invoices_updated_at on public.b2b_invoices;
create trigger b2b_invoices_updated_at
  before update on public.b2b_invoices
  for each row execute function public.set_b2b_updated_at();

drop trigger if exists b2b_agreements_updated_at on public.b2b_agreements;
create trigger b2b_agreements_updated_at
  before update on public.b2b_agreements
  for each row execute function public.set_b2b_updated_at();

create index if not exists corporate_clients_status_idx
  on public.corporate_clients (status, created_at desc);
create index if not exists seller_verifications_status_idx
  on public.seller_verifications (status, created_at desc);
create index if not exists b2b_invoices_client_created_idx
  on public.b2b_invoices (client_id, created_at desc);
create index if not exists b2b_agreements_client_created_idx
  on public.b2b_agreements (client_id, created_at desc);

alter table public.corporate_clients enable row level security;
alter table public.seller_verifications enable row level security;
alter table public.b2b_invoices enable row level security;
alter table public.b2b_agreements enable row level security;

drop policy if exists corporate_clients_read_parties on public.corporate_clients;
create policy corporate_clients_read_parties
  on public.corporate_clients for select to authenticated
  using (user_id = (select auth.uid()) or public.is_b2b_admin());

drop policy if exists corporate_clients_insert_self on public.corporate_clients;
create policy corporate_clients_insert_self
  on public.corporate_clients for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

drop policy if exists corporate_clients_resubmit_self on public.corporate_clients;
create policy corporate_clients_resubmit_self
  on public.corporate_clients for update to authenticated
  using (user_id = (select auth.uid()) and status in ('pending', 'rejected'))
  with check (user_id = (select auth.uid()) and status = 'pending');

drop policy if exists corporate_clients_admin_update on public.corporate_clients;
create policy corporate_clients_admin_update
  on public.corporate_clients for update to authenticated
  using (public.is_b2b_admin())
  with check (public.is_b2b_admin());

drop policy if exists seller_verifications_read_parties on public.seller_verifications;
create policy seller_verifications_read_parties
  on public.seller_verifications for select to authenticated
  using (user_id = (select auth.uid()) or public.is_b2b_admin());

drop policy if exists seller_verifications_insert_self on public.seller_verifications;
create policy seller_verifications_insert_self
  on public.seller_verifications for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('member', 'seller', 'penyedia_jasa')
    )
  );

drop policy if exists seller_verifications_resubmit_self on public.seller_verifications;
create policy seller_verifications_resubmit_self
  on public.seller_verifications for update to authenticated
  using (user_id = (select auth.uid()) and status in ('pending', 'rejected'))
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('member', 'seller', 'penyedia_jasa')
    )
  );

drop policy if exists seller_verifications_admin_update on public.seller_verifications;
create policy seller_verifications_admin_update
  on public.seller_verifications for update to authenticated
  using (public.is_b2b_admin())
  with check (public.is_b2b_admin());

create or replace function public.review_b2b_seller_verification(
  target_verification_id uuid,
  approved boolean,
  admin_note text default null
)
returns public.seller_verifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  verification public.seller_verifications%rowtype;
begin
  if not public.is_b2b_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.seller_verifications
     set status = case when approved then 'verified' else 'rejected' end,
         review_note = nullif(trim(admin_note), ''),
         reviewed_by = (select auth.uid()),
         reviewed_at = now(),
         updated_at = now()
   where id = target_verification_id
   returning * into verification;

  if not found then
    raise exception 'Seller verification not found' using errcode = 'P0002';
  end if;

  if approved then
    update public.profiles
       set role = 'seller'
     where id = verification.user_id
       and role in ('member', 'seller', 'penyedia_jasa');
  end if;

  return verification;
end;
$$;

revoke all on function public.review_b2b_seller_verification(uuid, boolean, text) from public;
grant execute on function public.review_b2b_seller_verification(uuid, boolean, text) to authenticated;

drop policy if exists b2b_invoices_read_parties on public.b2b_invoices;
create policy b2b_invoices_read_parties
  on public.b2b_invoices for select to authenticated
  using (
    public.is_b2b_admin()
    or seller_id = (select auth.uid())
    or exists (
      select 1 from public.corporate_clients c
      where c.id = client_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists b2b_invoices_admin_insert on public.b2b_invoices;
create policy b2b_invoices_admin_insert
  on public.b2b_invoices for insert to authenticated
  with check (
    public.is_b2b_admin()
    and issued_by = (select auth.uid())
    and exists (
      select 1 from public.corporate_clients c
      where c.id = client_id and c.status = 'verified'
    )
    and exists (
      select 1 from public.seller_verifications sv
      where sv.user_id = seller_id and sv.status = 'verified'
    )
  );

drop policy if exists b2b_agreements_read_parties on public.b2b_agreements;
create policy b2b_agreements_read_parties
  on public.b2b_agreements for select to authenticated
  using (
    public.is_b2b_admin()
    or seller_id = (select auth.uid())
    or exists (
      select 1 from public.corporate_clients c
      where c.id = client_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists b2b_agreements_admin_insert on public.b2b_agreements;
create policy b2b_agreements_admin_insert
  on public.b2b_agreements for insert to authenticated
  with check (
    public.is_b2b_admin()
    and created_by = (select auth.uid())
    and status = 'awaiting_signatures'
    and exists (
      select 1 from public.corporate_clients c
      where c.id = client_id and c.status = 'verified'
    )
    and exists (
      select 1 from public.seller_verifications sv
      where sv.user_id = seller_id and sv.status = 'verified'
    )
    and exists (
      select 1 from public.b2b_invoices i
      where i.id = b2b_agreements.invoice_id
        and i.client_id = b2b_agreements.client_id
        and i.seller_id = b2b_agreements.seller_id
    )
  );

create or replace function public.respond_to_b2b_agreement(
  target_agreement_id uuid,
  accept boolean
)
returns public.b2b_agreements
language plpgsql
security definer
set search_path = ''
as $$
declare
  agreement public.b2b_agreements%rowtype;
  caller_id uuid := (select auth.uid());
  is_buyer boolean;
  is_seller boolean;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select a.* into agreement
  from public.b2b_agreements a
  where a.id = target_agreement_id
  for update;

  if not found then
    raise exception 'Agreement not found' using errcode = 'P0002';
  end if;
  if agreement.status <> 'awaiting_signatures' then
    raise exception 'Agreement is no longer awaiting signatures' using errcode = '22023';
  end if;

  select c.user_id = caller_id into is_buyer
  from public.corporate_clients c where c.id = agreement.client_id;
  is_buyer := coalesce(is_buyer, false);
  is_seller := agreement.seller_id = caller_id;

  if not is_buyer and not is_seller then
    raise exception 'Not an agreement party' using errcode = '42501';
  end if;

  if not accept then
    update public.b2b_agreements
       set status = 'declined', updated_at = now()
     where id = target_agreement_id
     returning * into agreement;
    return agreement;
  end if;

  if is_buyer then
    update public.b2b_agreements
       set buyer_accepted_at = coalesce(buyer_accepted_at, now()),
           buyer_accepted_by = caller_id,
           status = case when seller_accepted_at is not null then 'active' else status end,
           updated_at = now()
     where id = target_agreement_id
     returning * into agreement;
  else
    update public.b2b_agreements
       set seller_accepted_at = coalesce(seller_accepted_at, now()),
           seller_accepted_by = caller_id,
           status = case when buyer_accepted_at is not null then 'active' else status end,
           updated_at = now()
     where id = target_agreement_id
     returning * into agreement;
  end if;
  return agreement;
end;
$$;

revoke all on function public.respond_to_b2b_agreement(uuid, boolean) from public;
grant execute on function public.respond_to_b2b_agreement(uuid, boolean) to authenticated;

grant select, insert, update on public.corporate_clients to authenticated;
grant select, insert, update on public.seller_verifications to authenticated;
grant select, insert on public.b2b_invoices to authenticated;
grant select, insert on public.b2b_agreements to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('seller-verification', 'seller-verification', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png']),
  ('b2b-invoices', 'b2b-invoices', false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists seller_verification_read_own_or_admin on storage.objects;
create policy seller_verification_read_own_or_admin
  on storage.objects for select to authenticated
  using (
    bucket_id = 'seller-verification'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text)
      or public.is_b2b_admin()
    )
  );

drop policy if exists seller_verification_upload_own on storage.objects;
create policy seller_verification_upload_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'seller-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('member', 'seller', 'penyedia_jasa')
    )
  );

drop policy if exists seller_verification_update_own on storage.objects;
create policy seller_verification_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'seller-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'seller-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists seller_verification_delete_own on storage.objects;
create policy seller_verification_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'seller-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists b2b_invoice_read_parties on storage.objects;
create policy b2b_invoice_read_parties
  on storage.objects for select to authenticated
  using (
    bucket_id = 'b2b-invoices'
    and exists (
      select 1 from public.b2b_invoices i
      left join public.corporate_clients c on c.id = i.client_id
      where i.pdf_path = name
        and (i.seller_id = (select auth.uid())
          or c.user_id = (select auth.uid())
          or public.is_b2b_admin())
    )
  );

commit;
