alter table public.payment_requests
  add column if not exists coverage_months integer not null default 1;

alter table public.payment_requests
  drop constraint if exists payment_requests_coverage_months_check;

alter table public.payment_requests
  add constraint payment_requests_coverage_months_check
  check (coverage_months between 1 and 12);
