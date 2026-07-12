alter type public.payment_request_status add value if not exists 'skip_requested';
alter type public.payment_request_status add value if not exists 'skipped';
