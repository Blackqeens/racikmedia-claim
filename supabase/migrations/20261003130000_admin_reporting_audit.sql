begin;

create table if not exists public.content_article_review_audit (
  id bigint generated always as identity primary key,
  article_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index if not exists content_article_review_audit_article_changed_idx
  on public.content_article_review_audit (article_id, changed_at desc);
create index if not exists content_article_review_audit_changed_idx
  on public.content_article_review_audit (changed_at desc);

alter table public.content_article_review_audit enable row level security;

drop policy if exists content_article_review_audit_admin_read
  on public.content_article_review_audit;
create policy content_article_review_audit_admin_read
  on public.content_article_review_audit for select to authenticated
  using (public.is_b2b_admin());

revoke all on public.content_article_review_audit from anon, authenticated;
grant select on public.content_article_review_audit to authenticated;

create or replace function public.capture_content_article_review_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.content_article_review_audit
      (article_id, actor_id, operation, new_data)
    values (new.id, (select auth.uid()), tg_op, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.content_article_review_audit
      (article_id, actor_id, operation, old_data, new_data)
    values (new.id, (select auth.uid()), tg_op, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.content_article_review_audit
      (article_id, actor_id, operation, old_data)
    values (old.id, (select auth.uid()), tg_op, to_jsonb(old));
    return old;
  end if;
end;
$$;

revoke all on function public.capture_content_article_review_audit() from public;

drop trigger if exists content_articles_review_audit
  on public.content_articles;
create trigger content_articles_review_audit
  after insert or update or delete on public.content_articles
  for each row execute function public.capture_content_article_review_audit();

create index if not exists buyer_orders_report_created_idx
  on public.buyer_orders (created_at, status);
create index if not exists b2b_invoices_report_created_idx
  on public.b2b_invoices (created_at, status);

create or replace function public.get_admin_financial_report(
  target_start date,
  target_end date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  report jsonb;
begin
  if not public.is_b2b_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if target_start is null or target_end is null
     or target_start > target_end
     or target_end - target_start > 1095 then
    raise exception 'Invalid report period (maximum 3 years)' using errcode = '22023';
  end if;

  with month_series as (
    select generate_series(
      date_trunc('month', target_start::timestamp)::date,
      date_trunc('month', target_end::timestamp)::date,
      interval '1 month'
    )::date as month_start
  ),
  order_monthly as (
    select
      date_trunc('month', o.created_at at time zone 'Asia/Jakarta')::date as month_start,
      coalesce(sum(o.total_amount), 0) as order_value,
      coalesce(sum(o.total_amount) filter (
        where o.status in ('paid', 'confirmed', 'in_progress', 'completed')
      ), 0) as captured_order_value,
      coalesce(sum(o.total_amount) filter (where o.status = 'refunded'), 0) as refunded_order_value,
      coalesce(sum(o.total_amount) filter (where o.status = 'cancelled'), 0) as cancelled_order_value
    from public.buyer_orders o
    where o.created_at >= (target_start::timestamp at time zone 'Asia/Jakarta')
      and o.created_at < ((target_end + 1)::timestamp at time zone 'Asia/Jakarta')
    group by 1
  ),
  invoice_monthly as (
    select
      date_trunc('month', i.created_at at time zone 'Asia/Jakarta')::date as month_start,
      coalesce(sum(i.total_amount) filter (where i.status <> 'cancelled'), 0) as invoice_value,
      coalesce(sum(i.total_amount) filter (where i.status = 'paid'), 0) as paid_invoice_value,
      coalesce(sum(i.total_amount) filter (where i.status in ('unpaid', 'overdue')), 0) as outstanding_invoice_value
    from public.b2b_invoices i
    where i.created_at >= (target_start::timestamp at time zone 'Asia/Jakarta')
      and i.created_at < ((target_end + 1)::timestamp at time zone 'Asia/Jakarta')
    group by 1
  ),
  monthly as (
    select
      m.month_start,
      coalesce(o.order_value, 0) as order_value,
      coalesce(o.captured_order_value, 0) as captured_order_value,
      coalesce(o.refunded_order_value, 0) as refunded_order_value,
      coalesce(o.cancelled_order_value, 0) as cancelled_order_value,
      coalesce(i.invoice_value, 0) as invoice_value,
      coalesce(i.paid_invoice_value, 0) as paid_invoice_value,
      coalesce(i.outstanding_invoice_value, 0) as outstanding_invoice_value
    from month_series m
    left join order_monthly o using (month_start)
    left join invoice_monthly i using (month_start)
  )
  select jsonb_build_object(
    'period', jsonb_build_object('start', target_start, 'end', target_end),
    'summary', jsonb_build_object(
      'order_value', coalesce(sum(order_value), 0),
      'captured_order_value', coalesce(sum(captured_order_value), 0),
      'refunded_order_value', coalesce(sum(refunded_order_value), 0),
      'cancelled_order_value', coalesce(sum(cancelled_order_value), 0),
      'b2b_invoice_value', coalesce(sum(invoice_value), 0),
      'paid_b2b_invoice_value', coalesce(sum(paid_invoice_value), 0),
      'outstanding_b2b_invoice_value', coalesce(sum(outstanding_invoice_value), 0)
    ),
    'monthly', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'month', to_char(month_start, 'YYYY-MM'),
          'order_value', order_value,
          'captured_order_value', captured_order_value,
          'refunded_order_value', refunded_order_value,
          'cancelled_order_value', cancelled_order_value,
          'b2b_invoice_value', invoice_value,
          'paid_b2b_invoice_value', paid_invoice_value,
          'outstanding_b2b_invoice_value', outstanding_invoice_value
        ) order by month_start
      ),
      '[]'::jsonb
    )
  )
  into report
  from monthly;

  return report;
end;
$$;

revoke all on function public.get_admin_financial_report(date, date) from public;
grant execute on function public.get_admin_financial_report(date, date) to authenticated;

commit;
