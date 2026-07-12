create or replace function public.skip_payment_and_advance(
  p_payment_id uuid,
  p_organization_id uuid
)
returns table(payment jsonb, next_payment jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_payment public.payment_requests%rowtype;
  current_plan public.billing_plans%rowtype;
  updated_payment public.payment_requests%rowtype;
  inserted_payment public.payment_requests%rowtype;
  should_advance boolean := false;
  target_month date;
  last_day integer;
  target_day integer;
  next_due_date date;
  month_names text[] := array[
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
  ];
begin
  select *
  into current_payment
  from public.payment_requests
  where id = p_payment_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Оплата не найдена.';
  end if;

  if current_payment.status not in ('active', 'overdue', 'delayed', 'skip_requested') then
    raise exception 'Этот месяц нельзя отметить пропущенным.';
  end if;

  if current_payment.plan_id is not null then
    select *
    into current_plan
    from public.billing_plans
    where id = current_payment.plan_id
      and organization_id = p_organization_id
    for update;

    should_advance := found
      and current_plan.active
      and current_plan.type = 'monthly'
      and current_payment.is_current;
  end if;

  update public.payment_requests
  set
    status = 'skipped',
    is_current = false
  where id = current_payment.id
  returning * into updated_payment;

  if should_advance then
    target_month := date_trunc('month', current_payment.due_date)::date + interval '1 month';
    last_day := extract(day from (target_month + interval '1 month - 1 day'))::integer;
    target_day := least(coalesce(current_plan.billing_day, extract(day from current_payment.due_date)::integer), last_day);
    next_due_date := make_date(
      extract(year from target_month)::integer,
      extract(month from target_month)::integer,
      target_day
    );

    insert into public.payment_requests (
      organization_id,
      member_id,
      trainer_id,
      amount,
      due_date,
      status,
      plan_id,
      period_label,
      is_current,
      coverage_months,
      paid_at
    )
    values (
      p_organization_id,
      current_payment.member_id,
      current_payment.trainer_id,
      current_plan.base_amount,
      next_due_date,
      'active',
      current_plan.id,
      month_names[extract(month from next_due_date)::integer] || ' ' || extract(year from next_due_date)::integer,
      true,
      1,
      null
    )
    returning * into inserted_payment;
  end if;

  payment := to_jsonb(updated_payment);
  next_payment := case
    when inserted_payment.id is null then null
    else to_jsonb(inserted_payment)
  end;
  return next;
end;
$$;

revoke all on function public.skip_payment_and_advance(uuid, uuid) from public;
revoke all on function public.skip_payment_and_advance(uuid, uuid) from anon;
revoke all on function public.skip_payment_and_advance(uuid, uuid) from authenticated;
grant execute on function public.skip_payment_and_advance(uuid, uuid) to service_role;
