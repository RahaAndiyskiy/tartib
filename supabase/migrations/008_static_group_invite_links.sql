alter table public.member_invites
  add column if not exists public_token text unique;

create index if not exists member_invites_active_group_link_idx
  on public.member_invites (organization_id, group_id, status, expires_at)
  where first_name is null and last_name is null and public_token is not null;
