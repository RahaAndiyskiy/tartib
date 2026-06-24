revoke execute on function public.confirm_payment_and_advance(uuid, uuid) from public;
revoke execute on function public.confirm_payment_and_advance(uuid, uuid) from anon;
revoke execute on function public.confirm_payment_and_advance(uuid, uuid) from authenticated;

grant execute on function public.confirm_payment_and_advance(uuid, uuid) to service_role;
