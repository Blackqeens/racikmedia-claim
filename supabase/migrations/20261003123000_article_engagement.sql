-- Article reader interactions and the safe public author profile RPC.
begin;

create table if not exists public.content_article_comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.content_articles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null default 'Pembaca',
  comment_text text not null check (char_length(trim(comment_text)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create or replace function public.set_content_article_comment_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select coalesce(nullif(trim(p.display_name), ''), 'Pembaca')
    into new.author_name
    from public.profiles p
   where p.id = new.author_id;
  return new;
end;
$$;

drop trigger if exists content_article_comment_author on public.content_article_comments;
create trigger content_article_comment_author
  before insert on public.content_article_comments
  for each row execute function public.set_content_article_comment_author();

create table if not exists public.content_article_reactions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.content_articles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'bookmark')),
  created_at timestamptz not null default now(),
  unique (article_id, user_id, reaction_type)
);

create index if not exists content_article_comments_article_created_idx
  on public.content_article_comments (article_id, created_at desc);
create index if not exists content_article_reactions_user_type_idx
  on public.content_article_reactions (user_id, reaction_type, created_at desc);

alter table public.content_article_comments enable row level security;
alter table public.content_article_reactions enable row level security;

drop policy if exists content_article_comments_public_read on public.content_article_comments;
create policy content_article_comments_public_read
  on public.content_article_comments for select to anon, authenticated
  using (
    exists (
      select 1
      from public.content_articles a
      where a.id = article_id
        and a.status = 'published'
        and a.archived_at is null
    )
  );

drop policy if exists content_article_comments_insert_authenticated on public.content_article_comments;
create policy content_article_comments_insert_authenticated
  on public.content_article_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and char_length(trim(comment_text)) between 1 and 2000
    and exists (
      select 1
      from public.content_articles a
      where a.id = article_id
        and a.status = 'published'
        and a.archived_at is null
    )
  );

drop policy if exists content_article_comments_delete_author_or_admin on public.content_article_comments;
create policy content_article_comments_delete_author_or_admin
  on public.content_article_comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_master_admin());

drop policy if exists content_article_reactions_read_self on public.content_article_reactions;
create policy content_article_reactions_read_self
  on public.content_article_reactions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists content_article_reactions_insert_self on public.content_article_reactions;
create policy content_article_reactions_insert_self
  on public.content_article_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.content_articles a
      where a.id = article_id
        and a.status = 'published'
        and a.archived_at is null
    )
  );

drop policy if exists content_article_reactions_delete_self on public.content_article_reactions;
create policy content_article_reactions_delete_self
  on public.content_article_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.get_content_article_engagement(target_article_id uuid)
returns table (like_count bigint, comment_count bigint, liked boolean, bookmarked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.content_article_reactions r
      where r.article_id = target_article_id and r.reaction_type = 'like'),
    (select count(*) from public.content_article_comments c
      where c.article_id = target_article_id),
    exists (
      select 1 from public.content_article_reactions r
      where r.article_id = target_article_id
        and r.user_id = (select auth.uid())
        and r.reaction_type = 'like'
    ),
    exists (
      select 1 from public.content_article_reactions r
      where r.article_id = target_article_id
        and r.user_id = (select auth.uid())
        and r.reaction_type = 'bookmark'
    )
  where exists (
    select 1 from public.content_articles a
    where a.id = target_article_id
      and a.status = 'published'
      and a.archived_at is null
  );
$$;

revoke all on function public.get_content_article_engagement(uuid) from public;
grant execute on function public.get_content_article_engagement(uuid) to anon, authenticated;

create or replace function public.get_public_author_profile(target_author_id uuid)
returns table (
  author_id uuid,
  display_name text,
  city text,
  bio text,
  avatar_path text,
  article_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, coalesce(p.city, ''), coalesce(p.bio, ''),
         p.avatar_path, count(a.id)
  from public.profiles p
  join public.content_articles a on a.author_id = p.id
  where p.id = target_author_id
    and a.status = 'published'
    and a.archived_at is null
  group by p.id, p.display_name, p.city, p.bio, p.avatar_path;
$$;

revoke all on function public.get_public_author_profile(uuid) from public;
grant execute on function public.get_public_author_profile(uuid) to anon, authenticated;

grant select on public.content_article_comments to anon, authenticated;
grant insert, delete on public.content_article_comments to authenticated;
grant select, insert, delete on public.content_article_reactions to authenticated;

commit;
