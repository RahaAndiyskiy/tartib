create or replace function public.process_payment_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payment_requests
  set status = 'overdue'
  where is_current
    and due_date < current_date
    and status in ('active', 'delayed');

  insert into public.notifications (
    organization_id, user_id, payment_id, message, event_key
  )
  select
    p.organization_id,
    p.member_id,
    p.id,
    case
      when p.due_date = current_date + 3 then
        'Оплата через 3 дня: ' || to_char(p.amount, 'FM999999990.00') || ' ₺.'
      when p.due_date = current_date then
        'Сегодня оплата: ' || to_char(p.amount, 'FM999999990.00') || ' ₺.'
      else
        'Оплата просрочена. Нужна отсрочка?'
    end,
    'payment:' || p.id || ':' || p.due_date || ':' ||
      case
        when p.due_date = current_date + 3 then 'three-days'
        when p.due_date = current_date then 'due-today'
        else 'overdue'
      end
  from public.payment_requests p
  where p.is_current
    and p.status not in ('paid', 'payment_confirmation', 'delay_requested')
    and (
      p.due_date = current_date + 3
      or p.due_date = current_date
      or p.due_date < current_date
    )
  on conflict (event_key) where event_key is not null do nothing;
end;
$$;
