-- Allow sellers to manage only their own service listings and read incoming
-- bookings with the buyer's public display name.

drop policy if exists services_seller_delete_own on public.catalog_services;
create policy services_seller_delete_own
  on public.catalog_services for delete to authenticated
  using (seller_id = (select auth.uid()));

grant delete on public.catalog_services to authenticated;

create or replace function public.get_seller_service_bookings()
returns table (
  booking_number text,
  client_name text,
  service_name text,
  requested_at timestamptz,
  booking_status text,
  estimated_total numeric,
  preferred_time text,
  location text,
  buyer_note text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    booking.booking_number,
    coalesce(nullif(profile.display_name, ''), 'Klien'),
    service.name,
    booking.requested_at,
    booking.status,
    booking.estimated_total,
    booking.preferred_time,
    booking.location,
    booking.buyer_note
  from public.service_bookings as booking
  join public.catalog_services as service on service.id = booking.service_id
  join public.profiles as profile on profile.id = booking.buyer_id
  where booking.seller_id = (select auth.uid())
  order by booking.requested_at desc;
$$;

revoke all on function public.get_seller_service_bookings() from public, anon;
grant execute on function public.get_seller_service_bookings() to authenticated;
