with ranked_current_payments as (
  select
    id,
    row_number() over (
      partition by member_id
      order by
        case when status = 'paid' then 1 else 0 end,
        created_at desc,
        id desc
    ) as row_number
  from public.payment_requests
  where is_current
)
update public.payment_requests p
set is_current = false
from ranked_current_payments r
where p.id = r.id
  and r.row_number > 1;

create unique index if not exists payment_requests_one_current_per_member_idx
  on public.payment_requests (member_id)
  where is_current;
