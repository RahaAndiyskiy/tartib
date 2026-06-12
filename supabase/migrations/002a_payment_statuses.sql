alter type public.payment_request_status add value if not exists 'active';
alter type public.payment_request_status add value if not exists 'delay_requested';
alter type public.payment_request_status add value if not exists 'delayed';
alter type public.payment_request_status add value if not exists 'payment_confirmation';
