-- 004_workspace_rpc.sql
-- Добавляет RPC-функции для получения текущей идентичности и workspace одним вызовом.

create index if not exists users_organization_id_idx on public.users (organization_id);
create index if not exists users_auth_user_id_idx on public.users (auth_user_id);
create index if not exists user_roles_user_id_idx on public.user_roles (user_id);
create index if not exists trainer_members_organization_id_trainer_id_idx on public.trainer_members (organization_id, trainer_id);
create index if not exists trainer_members_member_id_idx on public.trainer_members (member_id);
create index if not exists groups_organization_id_trainer_id_idx on public.groups (organization_id, trainer_id);
create index if not exists group_members_group_id_member_id_idx on public.group_members (group_id, member_id);
create index if not exists billing_plans_member_id_active_idx on public.billing_plans (member_id, active);
create index if not exists payment_requests_organization_id_trainer_id_idx on public.payment_requests (organization_id, trainer_id);
create index if not exists payment_requests_member_id_is_current_idx on public.payment_requests (member_id, is_current);
create index if not exists notifications_user_id_read_idx on public.notifications (user_id, read);

create or replace function public.get_current_identity()
returns table(
  auth_user_id uuid,
  profile_id uuid,
  organization_id uuid,
  role public.user_role,
  username text,
  first_name text,
  last_name text,
  phone text,
  email text,
  created_at timestamptz,
  roles public.user_role[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.auth_user_id,
    u.id as profile_id,
    u.organization_id,
    u.role,
    u.username,
    u.first_name,
    u.last_name,
    u.phone,
    u.email,
    u.created_at,
    coalesce(
      array_agg(ur.role order by ur.role) filter (where ur.role is not null),
      array[u.role]
    ) as roles
  from public.users u
  left join public.user_roles ur on ur.user_id = u.id
  where u.auth_user_id = auth.uid()
  group by
    u.auth_user_id,
    u.id,
    u.organization_id,
    u.role,
    u.username,
    u.first_name,
    u.last_name,
    u.phone,
    u.email,
    u.created_at;
$$;

create or replace function public.get_workspace()
returns table(workspace jsonb, active_user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
with app_user as (
  select
    u.id as profile_id,
    u.organization_id,
    u.role,
    bool_or(ur.role = 'owner') as is_owner,
    bool_or(ur.role = 'trainer') as is_trainer,
    bool_or(ur.role = 'member') as is_member
  from public.users u
  left join public.user_roles ur on ur.user_id = u.id
  where u.auth_user_id = auth.uid()
  group by u.id, u.organization_id, u.role
),
trainer_member_relations as (
  select tm.*
  from public.trainer_members tm
  where tm.organization_id = (select organization_id from app_user)
),
current_trainer_members as (
  select tm.member_id
  from trainer_member_relations tm
  where tm.trainer_id = (select profile_id from app_user)
),
current_member_trainer as (
  select tm.trainer_id
  from trainer_member_relations tm
  where tm.member_id = (select profile_id from app_user)
),
visible_user_ids as (
  select u.id
  from public.users u
  where u.organization_id = (select organization_id from app_user)
    and (
      (select is_owner from app_user)
      or u.id = (select profile_id from app_user)
      or ((select is_trainer from app_user) and u.id in (select member_id from current_trainer_members))
      or ((select is_member from app_user) and u.id in (select trainer_id from current_member_trainer))
    )
),
visible_group_ids as (
  select g.id
  from public.groups g
  where g.organization_id = (select organization_id from app_user)
    and (
      (select is_owner from app_user)
      or g.trainer_id = (select profile_id from app_user)
      or exists (
        select 1
        from public.group_members gm
        where gm.group_id = g.id
          and gm.member_id = (select profile_id from app_user)
      )
    )
),
visible_assignments as (
  select tm.*
  from trainer_member_relations tm
  where
    (select is_owner from app_user)
    or tm.trainer_id = (select profile_id from app_user)
    or tm.member_id = (select profile_id from app_user)
),
visible_group_members as (
  select gm.*
  from public.group_members gm
  where gm.organization_id = (select organization_id from app_user)
    and (
      (select is_owner from app_user)
      or (
        (select is_trainer from app_user)
        and exists (
          select 1
          from public.groups g
          where g.id = gm.group_id
            and g.trainer_id = (select profile_id from app_user)
        )
      )
      or gm.member_id = (select profile_id from app_user)
    )
),
visible_billing_plans as (
  select bp.*
  from public.billing_plans bp
  where bp.organization_id = (select organization_id from app_user)
    and (
      (select is_owner from app_user)
      or bp.trainer_id = (select profile_id from app_user)
      or bp.member_id = (select profile_id from app_user)
    )
),
visible_payments as (
  select *
  from (
    select pr.*,
      row_number() over (partition by (pr.status = 'paid') order by pr.created_at desc) as paid_row
    from public.payment_requests pr
    where pr.organization_id = (select organization_id from app_user)
      and (
        (select is_owner from app_user)
        or pr.trainer_id = (select profile_id from app_user)
        or pr.member_id = (select profile_id from app_user)
      )
  ) pr
  where pr.status <> 'paid' or pr.paid_row <= 50
),
visible_notifications as (
  select n.*
  from public.notifications n
  where n.organization_id = (select organization_id from app_user)
    and n.user_id = (select profile_id from app_user)
  order by n.created_at desc
  limit 50
),
users_with_roles as (
  select
    u.*,
    coalesce(
      array_agg(ur.role order by ur.role) filter (where ur.role is not null),
      array[u.role]
    ) as roles
  from public.users u
  left join public.user_roles ur on ur.user_id = u.id
  where u.organization_id = (select organization_id from app_user)
  group by u.id
)
select
  jsonb_build_object(
    'version', 5,
    'organization', (
      select to_jsonb(o)
      from public.organizations o
      where o.id = (select organization_id from app_user)
    ),
    'users', coalesce(
      (
        select jsonb_agg(to_jsonb(u) || jsonb_build_object('roles', u.roles) order by u.created_at asc)
        from users_with_roles u
        where u.id in (select id from visible_user_ids)
      ), '[]'::jsonb
    ),
    'assignments', coalesce(
      (
        select jsonb_agg(to_jsonb(a) order by a.created_at asc)
        from visible_assignments a
      ), '[]'::jsonb
    ),
    'billingPlans', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', bp.id,
          'memberId', bp.member_id,
          'trainerId', bp.trainer_id,
          'type', bp.type,
          'trainingFormat', bp.training_format,
          'baseAmount', bp.base_amount::numeric,
          'billingDay', bp.billing_day,
          'active', bp.active,
          'createdAt', bp.created_at,
          'updatedAt', bp.updated_at
        ) order by bp.created_at asc)
        from visible_billing_plans bp
      ), '[]'::jsonb
    ),
    'payments', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'organization_id', p.organization_id,
          'member_id', p.member_id,
          'trainer_id', p.trainer_id,
          'amount', p.amount,
          'due_date', p.due_date,
          'status', p.status,
          'created_at', p.created_at,
          'plan_id', p.plan_id,
          'period_label', p.period_label,
          'is_current', p.is_current,
          'paid_at', p.paid_at,
          'delay_requested_date', p.delay_requested_date,
          'delay_comment', p.delay_comment,
          'delay_status', p.delay_status,
          'delay_requested_at', p.delay_requested_at,
          'delay_decided_at', p.delay_decided_at,
          'delay_decided_by', p.delay_decided_by
        ) order by p.created_at desc)
        from visible_payments p
      ), '[]'::jsonb
    ),
    'expenses', '[]'::jsonb,
    'groups', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', g.id,
          'trainerId', g.trainer_id,
          'activity', g.activity,
          'days', g.days,
          'time', to_char(g.time, 'HH24:MI'),
          'note', g.note,
          'createdAt', g.created_at,
          'updatedAt', g.updated_at
        ) order by g.created_at asc)
        from public.groups g
        where g.id in (select id from visible_group_ids)
      ), '[]'::jsonb
    ),
    'groupMembers', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', gm.id,
          'groupId', gm.group_id,
          'memberId', gm.member_id,
          'createdAt', gm.created_at
        ) order by gm.created_at asc)
        from visible_group_members gm
      ), '[]'::jsonb
    ),
    'schedules', '[]'::jsonb,
    'notifications', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', n.id,
          'userId', n.user_id,
          'message', n.message,
          'createdAt', n.created_at,
          'read', n.read,
          'eventKey', n.event_key,
          'paymentId', n.payment_id
        ) order by n.created_at desc)
        from visible_notifications n
      ), '[]'::jsonb
    )
  ),
  (select profile_id from app_user);
$$;
