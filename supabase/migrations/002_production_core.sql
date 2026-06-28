create extension if not exists "pg_cron";

alter table public.users
  add column if not exists username text;

update public.users
set username = lower(
  coalesce(
    nullif(split_part(email, '@', 1), ''),
    regexp_replace(first_name || '.' || last_name || '.' || left(id::text, 6), '[^a-zA-Z0-9._-]', '', 'g')
  )
)
where username is null;

alter table public.users
  alter column username set not null;

create unique index if not exists users_username_lower_idx
  on public.users (lower(username));

create table if not exists public.user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

insert into public.user_roles (user_id, role)
select id, role
from public.users
on conflict do nothing;

insert into public.user_roles (user_id, role)
select id, 'trainer'::public.user_role
from public.users
where role = 'owner'
on conflict do nothing;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trainer_id uuid not null references public.users(id) on delete restrict,
  activity text not null,
  days text not null,
  time time not null,
  note text not null default '',
  default_amount numeric(12, 2) check (default_amount is null or default_amount > 0),
  default_billing_day smallint check (default_billing_day is null or default_billing_day between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (member_id)
);

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.users(id) on delete cascade,
  trainer_id uuid not null references public.users(id) on delete restrict,
  type text not null check (type in ('monthly', 'one_time')),
  training_format text not null check (training_format in ('group', 'individual')),
  base_amount numeric(12, 2) not null check (base_amount > 0),
  billing_day smallint check (billing_day between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_requests
  add column if not exists plan_id uuid references public.billing_plans(id) on delete set null,
  add column if not exists period_label text,
  add column if not exists is_current boolean not null default true,
  add column if not exists paid_at timestamptz,
  add column if not exists delay_requested_date date,
  add column if not exists delay_comment text,
  add column if not exists delay_status text check (delay_status in ('pending', 'approved', 'rejected')),
  add column if not exists delay_requested_at timestamptz,
  add column if not exists delay_decided_at timestamptz,
  add column if not exists delay_decided_by uuid references public.users(id) on delete set null;

update public.payment_requests
set status = 'active'
where status = 'pending';

update public.payment_requests
set status = 'payment_confirmation'
where status = 'paid_confirmation';

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  payment_id uuid references public.payment_requests(id) on delete cascade,
  message text not null,
  event_key text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_event_key_idx
  on public.notifications (event_key)
  where event_key is not null;

create index if not exists groups_organization_id_idx on public.groups (organization_id);
create index if not exists groups_trainer_id_idx on public.groups (trainer_id);
create index if not exists group_members_group_id_idx on public.group_members (group_id);
create index if not exists group_members_member_id_idx on public.group_members (member_id);
create index if not exists billing_plans_member_id_idx on public.billing_plans (member_id);
create index if not exists notifications_user_id_idx on public.notifications (user_id);

create or replace function public.current_app_has_role(required_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = public.current_app_user_id()
      and ur.role = required_role
  )
$$;

alter table public.user_roles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.billing_plans enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Users can view own roles" on public.user_roles;
create policy "Users can view own roles"
  on public.user_roles for select to authenticated
  using (
    user_id = public.current_app_user_id()
    or public.current_app_has_role('owner')
  );

drop policy if exists "Organization users can view groups" on public.groups;
create policy "Organization users can view groups"
  on public.groups for select to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and (
      public.current_app_has_role('owner')
      or trainer_id = public.current_app_user_id()
      or exists (
        select 1 from public.group_members gm
        where gm.group_id = groups.id
          and gm.member_id = public.current_app_user_id()
      )
    )
  );

drop policy if exists "Owners and trainers manage groups" on public.groups;
create policy "Owners and trainers manage groups"
  on public.groups for all to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and (
      public.current_app_has_role('owner')
      or trainer_id = public.current_app_user_id()
    )
  )
  with check (
    organization_id = public.current_app_organization_id()
    and (
      public.current_app_has_role('owner')
      or trainer_id = public.current_app_user_id()
    )
  );

drop policy if exists "Organization users can view group members" on public.group_members;
create policy "Organization users can view group members"
  on public.group_members for select to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and (
      public.current_app_has_role('owner')
      or member_id = public.current_app_user_id()
      or exists (
        select 1 from public.groups g
        where g.id = group_members.group_id
          and g.trainer_id = public.current_app_user_id()
      )
    )
  );

drop policy if exists "Owners and trainers manage group members" on public.group_members;
create policy "Owners and trainers manage group members"
  on public.group_members for all to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and (
      public.current_app_has_role('owner')
      or exists (
        select 1 from public.groups g
        where g.id = group_members.group_id
          and g.trainer_id = public.current_app_user_id()
      )
    )
  )
  with check (
    organization_id = public.current_app_organization_id()
    and (
      public.current_app_has_role('owner')
      or exists (
        select 1 from public.groups g
        where g.id = group_members.group_id
          and g.trainer_id = public.current_app_user_id()
      )
    )
  );

drop policy if exists "Organization users can view billing plans" on public.billing_plans;
create policy "Organization users can view billing plans"
  on public.billing_plans for select to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and (
      public.current_app_has_role('owner')
      or trainer_id = public.current_app_user_id()
      or member_id = public.current_app_user_id()
    )
  );

drop policy if exists "Owners and trainers manage billing plans" on public.billing_plans;
create policy "Owners and trainers manage billing plans"
  on public.billing_plans for all to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and (
      public.current_app_has_role('owner')
      or trainer_id = public.current_app_user_id()
    )
  )
  with check (
    organization_id = public.current_app_organization_id()
    and (
      public.current_app_has_role('owner')
      or trainer_id = public.current_app_user_id()
    )
  );

drop policy if exists "Organization users can view notifications" on public.notifications;
create policy "Organization users can view notifications"
  on public.notifications for select to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and user_id = public.current_app_user_id()
  );

drop policy if exists "Users can mark own notifications read" on public.notifications;
create policy "Users can mark own notifications read"
  on public.notifications for update to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and user_id = public.current_app_user_id()
  )
  with check (
    organization_id = public.current_app_organization_id()
    and user_id = public.current_app_user_id()
  );

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
        'Через 3 дня срок оплаты: ' || to_char(p.amount, 'FM999999990.00') || ' ₽.'
      when p.due_date = current_date then
        'Сегодня срок оплаты: ' || to_char(p.amount, 'FM999999990.00') || ' ₽.'
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

do $$
begin
  if exists (select 1 from cron.job where jobname = 'tartib-payment-reminders') then
    perform cron.unschedule('tartib-payment-reminders');
  end if;

  perform cron.schedule(
    'tartib-payment-reminders',
    '5 6 * * *',
    'select public.process_payment_reminders();'
  );
end
$$;
