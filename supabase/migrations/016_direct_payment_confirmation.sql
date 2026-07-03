create or replace function public.confirm_payment_direct_and_advance(
  p_payment_id uuid,
  p_organization_id uuid
)
returns table(payment jsonb, next_payment jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status public.payment_request_status;
begin
  select status
  into current_status
  from public.payment_requests
  where id = p_payment_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Оплата не найдена.';
  end if;

  if current_status not in ('active', 'overdue', 'delayed', 'payment_confirmation') then
    raise exception 'Эту оплату нельзя отметить оплаченной.';
  end if;

  if current_status <> 'payment_confirmation' then
    update public.payment_requests
    set status = 'payment_confirmation'
    where id = p_payment_id;
  end if;

  return query
  select *
  from public.confirm_payment_and_advance(p_payment_id, p_organization_id);
end;
$$;

revoke all on function public.confirm_payment_direct_and_advance(uuid, uuid) from public;
revoke all on function public.confirm_payment_direct_and_advance(uuid, uuid) from anon;
revoke all on function public.confirm_payment_direct_and_advance(uuid, uuid) from authenticated;
grant execute on function public.confirm_payment_direct_and_advance(uuid, uuid) to service_role;
