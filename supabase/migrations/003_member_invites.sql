create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  trainer_id uuid not null references public.users(id) on delete restrict,
  created_by uuid not null references public.users(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_user_id uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists member_invites_organization_id_idx
  on public.member_invites (organization_id);
create index if not exists member_invites_group_id_idx
  on public.member_invites (group_id);
create index if not exists member_invites_trainer_id_idx
  on public.member_invites (trainer_id);
create index if not exists member_invites_pending_idx
  on public.member_invites (status, expires_at);

alter table public.member_invites enable row level security;

drop policy if exists "Owners and trainers view member invites" on public.member_invites;
create policy "Owners and trainers view member invites"
  on public.member_invites for select to authenticated
  using (
    organization_id = public.current_app_organization_id()
    and (
      public.current_app_has_role('owner')
      or trainer_id = public.current_app_user_id()
    )
  );

drop policy if exists "Owners and trainers manage member invites" on public.member_invites;
create policy "Owners and trainers manage member invites"
  on public.member_invites for all to authenticated
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
