alter table public.groups
  add column if not exists default_amount numeric(12, 2) check (default_amount is null or default_amount > 0),
  add column if not exists default_billing_day smallint check (default_billing_day is null or default_billing_day between 1 and 31);

