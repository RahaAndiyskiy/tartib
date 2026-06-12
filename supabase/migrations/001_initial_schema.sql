create extension if not exists "pgcrypto";

do $$
begin
  create type public.user_role as enum ('owner', 'trainer', 'member');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_request_status as enum (
    'pending',
    'paid_confirmation',
    'paid',
    'overdue'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.user_role not null,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  constraint users_email_format check (
    email is null or email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  )
);

create table if not exists public.trainer_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trainer_id uuid not null references public.users(id) on delete cascade,
  member_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (trainer_id, member_id),
  constraint trainer_members_distinct_users check (trainer_id <> member_id)
);

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.users(id) on delete cascade,
  trainer_id uuid not null references public.users(id) on delete restrict,
  amount numeric(12, 2) not null,
  due_date date not null,
  status public.payment_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint payment_requests_positive_amount check (amount > 0)
);

create index if not exists users_organization_id_idx
  on public.users (organization_id);

create index if not exists users_auth_user_id_idx
  on public.users (auth_user_id);

create index if not exists trainer_members_organization_id_idx
  on public.trainer_members (organization_id);

create index if not exists trainer_members_trainer_id_idx
  on public.trainer_members (trainer_id);

create index if not exists trainer_members_member_id_idx
  on public.trainer_members (member_id);

create index if not exists payment_requests_organization_id_idx
  on public.payment_requests (organization_id);

create index if not exists payment_requests_member_id_idx
  on public.payment_requests (member_id);

create index if not exists payment_requests_trainer_id_idx
  on public.payment_requests (trainer_id);

create index if not exists payment_requests_status_idx
  on public.payment_requests (status);

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.users
  where auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_app_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.users
  where auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.users
  where auth_user_id = auth.uid()
  limit 1
$$;

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.trainer_members enable row level security;
alter table public.payment_requests enable row level security;

drop policy if exists "Organization members can view organization" on public.organizations;
create policy "Organization members can view organization"
  on public.organizations
  for select
  to authenticated
  using (id = public.current_app_organization_id());

drop policy if exists "Owners can update organization" on public.organizations;
create policy "Owners can update organization"
  on public.organizations
  for update
  to authenticated
  using (
    id = public.current_app_organization_id()
    and public.current_app_role() = 'owner'
  )
  with check (
    id = public.current_app_organization_id()
    and public.current_app_role() = 'owner'
  );

drop policy if exists "Owners can create users in organization" on public.users;
create policy "Owners can create users in organization"
  on public.users
  for insert
  to authenticated
  with check (
    organization_id = public.current_app_organization_id()
    and public.current_app_role() = 'owner'
  );

drop policy if exists "Users can view visible organization users" on public.users;
create policy "Users can view visible organization users"
  on public.users
  for select
  to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and (
      public.current_app_role() = 'owner'
      or id = public.current_app_user_id()
      or (
        public.current_app_role() = 'trainer'
        and (
          id = public.current_app_user_id()
          or exists (
            select 1
            from public.trainer_members tm
            where tm.trainer_id = public.current_app_user_id()
              and tm.member_id = public.users.id
          )
        )
      )
    )
  );

drop policy if exists "Owners can update organization users" on public.users;
create policy "Owners can update organization users"
  on public.users
  for update
  to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and public.current_app_role() = 'owner'
  )
  with check (
    organization_id = public.current_app_organization_id()
    and public.current_app_role() = 'owner'
  );

drop policy if exists "Trainers can update assigned members" on public.users;
create policy "Trainers can update assigned members"
  on public.users
  for update
  to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and role = 'member'
    and public.current_app_role() = 'trainer'
    and exists (
      select 1
      from public.trainer_members tm
      where tm.trainer_id = public.current_app_user_id()
        and tm.member_id = public.users.id
    )
  )
  with check (
    organization_id = public.current_app_organization_id()
    and role = 'member'
  );

drop policy if exists "Owners can manage trainer member assignments" on public.trainer_members;
create policy "Owners can manage trainer member assignments"
  on public.trainer_members
  for all
  to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and public.current_app_role() = 'owner'
  )
  with check (
    organization_id = public.current_app_organization_id()
    and public.current_app_role() = 'owner'
  );

drop policy if exists "Trainers can view own assignments" on public.trainer_members;
create policy "Trainers can view own assignments"
  on public.trainer_members
  for select
  to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and (
      trainer_id = public.current_app_user_id()
      or member_id = public.current_app_user_id()
    )
  );

drop policy if exists "Owners can manage payment requests" on public.payment_requests;
create policy "Owners can manage payment requests"
  on public.payment_requests
  for all
  to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and public.current_app_role() = 'owner'
  )
  with check (
    organization_id = public.current_app_organization_id()
    and public.current_app_role() = 'owner'
  );

drop policy if exists "Trainers can create payment requests for assigned members" on public.payment_requests;
create policy "Trainers can create payment requests for assigned members"
  on public.payment_requests
  for insert
  to authenticated
  with check (
    organization_id = public.current_app_organization_id()
    and trainer_id = public.current_app_user_id()
    and public.current_app_role() = 'trainer'
    and status in ('pending', 'overdue')
    and exists (
      select 1
      from public.trainer_members tm
      where tm.trainer_id = public.current_app_user_id()
        and tm.member_id = payment_requests.member_id
    )
  );

drop policy if exists "Trainers can view own payment requests" on public.payment_requests;
create policy "Trainers can view own payment requests"
  on public.payment_requests
  for select
  to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and trainer_id = public.current_app_user_id()
  );

drop policy if exists "Members can view own payment requests" on public.payment_requests;
create policy "Members can view own payment requests"
  on public.payment_requests
  for select
  to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and member_id = public.current_app_user_id()
  );

drop policy if exists "Members can confirm pending payments" on public.payment_requests;
create policy "Members can confirm pending payments"
  on public.payment_requests
  for update
  to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and member_id = public.current_app_user_id()
    and status = 'pending'
  )
  with check (
    organization_id = public.current_app_organization_id()
    and member_id = public.current_app_user_id()
    and status = 'paid_confirmation'
  );

drop policy if exists "Trainers can approve or reject confirmations" on public.payment_requests;
create policy "Trainers can approve or reject confirmations"
  on public.payment_requests
  for update
  to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and trainer_id = public.current_app_user_id()
    and status = 'paid_confirmation'
  )
  with check (
    organization_id = public.current_app_organization_id()
    and trainer_id = public.current_app_user_id()
    and status in ('paid', 'pending')
  );
