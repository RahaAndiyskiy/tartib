alter table public.billing_plans
  add column if not exists source text not null default 'individual'
    check (source in ('group_default', 'individual'));

update public.billing_plans bp
set source = 'group_default'
from public.group_members gm
where bp.member_id = gm.member_id
  and bp.training_format = 'group'
  and bp.type = 'monthly'
  and bp.active = true
  and bp.source = 'individual';
