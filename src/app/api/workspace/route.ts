import { NextResponse } from 'next/server';
import type { LocalWorkspace } from '@shared/lib/localWorkspace';
import { getSupabaseAdmin } from '@shared/lib/supabaseAdmin';
import { hasServerRole, requireIdentity } from '@shared/lib/serverAuth';

export async function GET(request: Request): Promise<NextResponse> {
  const identity = await requireIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const organizationId = identity.profile.organization_id;
  const isOwner = hasServerRole(identity, 'owner');
  const isTrainer = hasServerRole(identity, 'trainer');

  const [
    organizationResult,
    usersResult,
    rolesResult,
    groupsResult,
    groupMembersResult,
    assignmentsResult,
    plansResult,
    paymentsResult,
    notificationsResult
  ] = await Promise.all([
    admin.from('organizations').select('*').eq('id', organizationId).single(),
    admin.from('users').select('*').eq('organization_id', organizationId),
    admin.from('user_roles').select('*'),
    admin.from('groups').select('*').eq('organization_id', organizationId),
    admin.from('group_members').select('*').eq('organization_id', organizationId),
    admin.from('trainer_members').select('*').eq('organization_id', organizationId),
    admin.from('billing_plans').select('*').eq('organization_id', organizationId),
    admin.from('payment_requests').select('*').eq('organization_id', organizationId),
    admin.from('notifications').select('*').eq('user_id', identity.profile.id)
  ]);

  const firstError = [
    organizationResult,
    usersResult,
    rolesResult,
    groupsResult,
    groupMembersResult,
    assignmentsResult,
    plansResult,
    paymentsResult,
    notificationsResult
  ].find((result) => result.error)?.error;

  if (firstError || !organizationResult.data) {
    return NextResponse.json(
      { error: firstError?.message ?? 'Не удалось загрузить организацию.' },
      { status: 500 }
    );
  }

  const allUsers = usersResult.data ?? [];
  const allGroups = groupsResult.data ?? [];
  const allAssignments = assignmentsResult.data ?? [];
  const allGroupMembers = groupMembersResult.data ?? [];
  const allPlans = plansResult.data ?? [];
  const allPayments = paymentsResult.data ?? [];
  const visibleMemberIds = new Set<string>();

  if (isOwner) {
    allUsers.filter((user) => user.role === 'member').forEach((user) => visibleMemberIds.add(user.id));
  } else if (isTrainer) {
    allAssignments
      .filter((assignment) => assignment.trainer_id === identity.profile.id)
      .forEach((assignment) => visibleMemberIds.add(assignment.member_id));
  } else {
    visibleMemberIds.add(identity.profile.id);
  }

  const visibleUserIds = new Set<string>([identity.profile.id, ...visibleMemberIds]);
  if (isOwner) {
    allUsers.forEach((user) => visibleUserIds.add(user.id));
  } else if (isTrainer) {
    visibleUserIds.add(identity.profile.id);
  } else {
    allAssignments
      .filter((assignment) => assignment.member_id === identity.profile.id)
      .forEach((assignment) => visibleUserIds.add(assignment.trainer_id));
  }

  const rolesByUser = new Map<string, typeof identity.roles>();
  (rolesResult.data ?? []).forEach((row) => {
    const current = rolesByUser.get(row.user_id) ?? [];
    current.push(row.role);
    rolesByUser.set(row.user_id, current);
  });

  const visibleGroupIds = new Set(
    allGroups
      .filter(
        (group) =>
          isOwner ||
          group.trainer_id === identity.profile.id ||
          allGroupMembers.some(
            (assignment) =>
              assignment.group_id === group.id && assignment.member_id === identity.profile.id
          )
      )
      .map((group) => group.id)
  );

  const workspace: LocalWorkspace = {
    version: 5,
    organization: organizationResult.data,
    users: allUsers
      .filter((user) => visibleUserIds.has(user.id))
      .map((user) => ({ ...user, roles: rolesByUser.get(user.id) ?? [user.role] })),
    assignments: allAssignments.filter(
      (assignment) =>
        isOwner ||
        assignment.trainer_id === identity.profile.id ||
        assignment.member_id === identity.profile.id
    ),
    billingPlans: allPlans
      .filter(
        (plan) =>
          isOwner ||
          plan.trainer_id === identity.profile.id ||
          plan.member_id === identity.profile.id
      )
      .map((plan) => ({
        id: plan.id,
        memberId: plan.member_id,
        trainerId: plan.trainer_id,
        type: plan.type,
        trainingFormat: plan.training_format,
        baseAmount: Number(plan.base_amount),
        billingDay: plan.billing_day,
        active: plan.active,
        createdAt: plan.created_at,
        updatedAt: plan.updated_at
      })),
    payments: allPayments
      .filter(
        (payment) =>
          isOwner ||
          payment.trainer_id === identity.profile.id ||
          payment.member_id === identity.profile.id
      )
      .map((payment) => ({ ...payment, amount: Number(payment.amount) })),
    expenses: [],
    groups: allGroups
      .filter((group) => visibleGroupIds.has(group.id))
      .map((group) => ({
        id: group.id,
        trainerId: group.trainer_id,
        activity: group.activity,
        days: group.days,
        time: group.time.slice(0, 5),
        note: group.note,
        createdAt: group.created_at,
        updatedAt: group.updated_at
      })),
    groupMembers: allGroupMembers
      .filter(
        (assignment) =>
          visibleGroupIds.has(assignment.group_id) && visibleMemberIds.has(assignment.member_id)
      )
      .map((assignment) => ({
        id: assignment.id,
        groupId: assignment.group_id,
        memberId: assignment.member_id,
        createdAt: assignment.created_at
      })),
    schedules: [],
    notifications: (notificationsResult.data ?? []).map((notification) => ({
      id: notification.id,
      userId: notification.user_id,
      message: notification.message,
      createdAt: notification.created_at,
      read: notification.read,
      eventKey: notification.event_key ?? undefined,
      paymentId: notification.payment_id ?? undefined
    }))
  };

  return NextResponse.json({ workspace, activeUserId: identity.profile.id });
}
