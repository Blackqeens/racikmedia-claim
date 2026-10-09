begin;

create table if not exists public.newsletter_subscribers (
  email text primary key
    check (email = lower(trim(email)) and char_length(email) between 3 and 254),
  status text not null default 'active'
    check (status in ('active', 'unsubscribed')),
  source text not null default 'homepage'
    check (source = 'homepage'),
  consented_at timestamptz not null default now(),
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'active' and unsubscribed_at is null)
    or (status = 'unsubscribed' and unsubscribed_at is not null)
  )
);

alter table public.newsletter_subscribers enable row level security;
revoke all on table public.newsletter_subscribers from public, anon, authenticated;
grant select on table public.newsletter_subscribers to authenticated;

create or replace function public.is_newsletter_admin()
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

revoke all on function public.is_newsletter_admin() from public, anon, authenticated;
grant execute on function public.is_newsletter_admin() to authenticated;

drop policy if exists newsletter_subscribers_admin_read
  on public.newsletter_subscribers;
create policy newsletter_subscribers_admin_read
  on public.newsletter_subscribers
  for select
  to authenticated
  using ((select public.is_newsletter_admin()));

create or replace function public.subscribe_newsletter(
  p_email text,
  p_consent boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if not coalesce(p_consent, false) then
    raise exception 'Persetujuan menerima Newsletter bulanan diperlukan.'
      using errcode = '22023';
  end if;

  if char_length(normalized_email) > 254
    or normalized_email !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'
  then
    raise exception 'Alamat email tidak valid.'
      using errcode = '22023';
  end if;

  insert into public.newsletter_subscribers (email)
  values (normalized_email)
  on conflict (email) do update
    set status = 'active',
        consented_at = now(),
        subscribed_at = now(),
        unsubscribed_at = null
    where public.newsletter_subscribers.status = 'unsubscribed';
end;
$$;

revoke all on function public.subscribe_newsletter(text, boolean) from public;
grant execute on function public.subscribe_newsletter(text, boolean) to anon, authenticated;

commit;
