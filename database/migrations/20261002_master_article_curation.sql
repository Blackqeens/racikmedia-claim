-- Editorial article curation for the profiles-based Supabase foundation.
-- This deliberately uses a new table instead of the legacy `articles` table,
-- which references the incompatible legacy `users` schema in schema.sql.

create table if not exists public.content_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 5 and 160),
  excerpt text not null default '' check (char_length(excerpt) <= 400),
  content text not null check (char_length(trim(content)) > 0),
  category text not null check (char_length(trim(category)) between 1 and 80),
  tags text[] not null default '{}',
  cover_url text,
  author_id uuid not null references public.profiles(id) on delete restrict,
  author_name text not null,
  author_city text not null default '',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewer_name text not null default '',
  status text not null default 'published'
    check (status in ('draft', 'pending_review', 'published', 'rejected')),
  is_headline boolean not null default false,
  headline_order integer,
  archived_at timestamptz,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_articles_headline_order_check check (
    (is_headline and headline_order is not null and headline_order between 1 and 4)
    or (not is_headline and headline_order is null)
  )
);

create index if not exists content_articles_public_idx
  on public.content_articles (published_at desc)
  where status = 'published' and archived_at is null;

create index if not exists content_articles_headlines_idx
  on public.content_articles (headline_order)
  where is_headline and archived_at is null;

create or replace function public.is_master_admin()
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
      and p.role = 'master_admin'
  );
$$;

revoke all on function public.is_master_admin() from public;
grant execute on function public.is_master_admin() to authenticated;

alter table public.content_articles enable row level security;

drop policy if exists content_articles_public_read on public.content_articles;
create policy content_articles_public_read
  on public.content_articles for select to anon, authenticated
  using (status = 'published' and archived_at is null);

drop policy if exists content_articles_master_admin_read on public.content_articles;
create policy content_articles_master_admin_read
  on public.content_articles for select to authenticated
  using (public.is_master_admin());

drop policy if exists content_articles_master_admin_insert on public.content_articles;
create policy content_articles_master_admin_insert
  on public.content_articles for insert to authenticated
  with check (
    public.is_master_admin()
    and author_id = (select auth.uid())
    and reviewed_by = (select auth.uid())
    and status = 'published'
  );

drop policy if exists content_articles_master_admin_update on public.content_articles;
create policy content_articles_master_admin_update
  on public.content_articles for update to authenticated
  using (public.is_master_admin())
  with check (public.is_master_admin());

grant select on public.content_articles to anon, authenticated;
grant insert, update on public.content_articles to authenticated;

create or replace function public.set_content_article_headline(
  target_article_id uuid,
  enabled boolean
)
returns public.content_articles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  article_row public.content_articles;
  headline_count integer;
begin
  if not public.is_master_admin() then
    raise exception 'Master admin access required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(784221, 1);

  select *
    into article_row
    from public.content_articles
    where id = target_article_id
    for update;

  if not found then
    raise exception 'Article not found' using errcode = 'P0002';
  end if;

  if enabled then
    if article_row.status <> 'published' or article_row.archived_at is not null then
      raise exception 'Only active published articles can be headlined' using errcode = '23514';
    end if;

    select count(*)
      into headline_count
      from public.content_articles
      where is_headline
        and archived_at is null
        and id <> target_article_id;

    if headline_count >= 4 then
      raise exception 'Maximum of four active headlines reached' using errcode = '23514';
    end if;

    update public.content_articles
      set is_headline = true,
          headline_order = headline_count + 1,
          updated_at = now()
      where id = target_article_id
      returning * into article_row;
  else
    update public.content_articles
      set is_headline = false,
          headline_order = null,
          updated_at = now()
      where id = target_article_id
      returning * into article_row;
  end if;

  with ranked_headlines as (
    select id, row_number() over (order by headline_order, published_at, id) as new_order
    from public.content_articles
    where is_headline and archived_at is null
  )
  update public.content_articles a
    set headline_order = ranked_headlines.new_order,
        updated_at = now()
    from ranked_headlines
    where a.id = ranked_headlines.id
      and a.headline_order <> ranked_headlines.new_order;

  select *
    into article_row
    from public.content_articles
    where id = target_article_id;

  return article_row;
end;
$$;

revoke all on function public.set_content_article_headline(uuid, boolean) from public;
grant execute on function public.set_content_article_headline(uuid, boolean) to authenticated;

create table if not exists public.astra_sync_queue (
  article_id uuid primary key references public.content_articles(id) on delete cascade,
  operation text not null check (operation in ('upsert', 'delete')),
  attempts integer not null default 0,
  last_error text,
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists astra_sync_pending_idx
  on public.astra_sync_queue (updated_at)
  where synced_at is null;

alter table public.astra_sync_queue enable row level security;
revoke all on public.astra_sync_queue from anon, authenticated;
grant all on public.astra_sync_queue to service_role;

create or replace function public.queue_content_article_astra_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sync_operation text;
begin
  sync_operation := case
    when new.status = 'published' and new.archived_at is null then 'upsert'
    else 'delete'
  end;

  insert into public.astra_sync_queue (article_id, operation)
  values (new.id, sync_operation)
  on conflict (article_id) do update
    set operation = excluded.operation,
        attempts = 0,
        last_error = null,
        synced_at = null,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists content_articles_astra_sync_queue on public.content_articles;
create trigger content_articles_astra_sync_queue
  after insert or update on public.content_articles
  for each row execute function public.queue_content_article_astra_sync();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'article-covers',
  'article-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists article_covers_public_read on storage.objects;
create policy article_covers_public_read
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'article-covers');

drop policy if exists article_covers_master_admin_insert on storage.objects;
create policy article_covers_master_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'article-covers' and public.is_master_admin());

drop policy if exists article_covers_master_admin_update on storage.objects;
create policy article_covers_master_admin_update
  on storage.objects for update to authenticated
  using (bucket_id = 'article-covers' and public.is_master_admin())
  with check (bucket_id = 'article-covers' and public.is_master_admin());

drop policy if exists article_covers_master_admin_delete on storage.objects;
create policy article_covers_master_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'article-covers' and public.is_master_admin());
