alter table public.member_invites
  alter column first_name drop not null,
  alter column last_name drop not null;
