import { NextResponse } from 'next/server';
import { requireIdentity } from '@shared/lib/serverAuth';
import { rateLimit } from '@shared/lib/rateLimit';
import { createMemberInviteAction } from './_lib/invites';
import { createUserAction } from './_lib/users';
import { deleteGroupAction, saveGroupAction } from './_lib/groups';
import { assignMemberGroupAction, deleteMemberAction } from './_lib/members';
import {
  deletePaymentAction,
  paymentLifecycleAction,
  savePaymentAction
} from './_lib/payments';
import { markNotificationsReadAction } from './_lib/notifications';
import type { ActionBody, PaymentActionBody } from './_lib/types';

const paymentActions = new Set<ActionBody['action']>([
  'submit_payment',
  'submit_prepayment',
  'request_delay',
  'decide_delay',
  'decide_payment'
]);

export async function POST(request: Request): Promise<NextResponse> {
  const limited = rateLimit(request, 'workspace-actions', { limit: 120, windowMs: 60 * 1000 });
  if (limited) return limited;

  const identity = await requireIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  }

  const body = (await request.json()) as ActionBody;

  switch (body.action) {
    case 'create_member_invite':
      return createMemberInviteAction(request, identity, body);
    case 'create_user':
      return createUserAction(identity, body);
    case 'save_group':
      return saveGroupAction(identity, body);
    case 'delete_group':
      return deleteGroupAction(identity, body);
    case 'assign_member_group':
      return assignMemberGroupAction(identity, body);
    case 'delete_member':
      return deleteMemberAction(identity, body);
    case 'save_payment':
      return savePaymentAction(identity, body);
    case 'delete_payment':
      return deletePaymentAction(identity, body);
    case 'mark_notifications_read':
      return markNotificationsReadAction(identity);
    default:
      if (paymentActions.has(body.action)) {
        return paymentLifecycleAction(identity, body as PaymentActionBody);
      }
      return NextResponse.json({ error: 'Неизвестное действие.' }, { status: 400 });
  }
}
