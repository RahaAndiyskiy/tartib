import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const envText = await readFile('.env.local', 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    })
);

const baseUrl = process.env.TEST_APP_URL ?? 'http://127.0.0.1:3000';
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const ownerRegistrationSecret =
  process.env.TARTIB_OWNER_REGISTRATION_SECRET ?? env.TARTIB_OWNER_REGISTRATION_SECRET;
const suffix = Date.now().toString(36);
const password = `Test-${suffix}-9`;
const ownerUsername = `owner_${suffix}`;
const trainerUsername = `trainer_${suffix}`;
const otherTrainerUsername = `trainer_other_${suffix}`;
const memberUsername = `member_${suffix}`;
const authEmail = (username) => `${username}@auth.tartib.local`;
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${path} ${response.status}: ${data.error ?? response.statusText}`);
  }
  return data;
}

function setupHeaders(extra = {}) {
  return ownerRegistrationSecret
    ? { ...extra, 'x-tartib-setup-secret': ownerRegistrationSecret }
    : extra;
}

async function signIn(username) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: authEmail(username), password })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Sign in ${username}: ${data.error_description ?? data.msg}`);
  return data.access_token;
}

async function action(token, body) {
  return api('/api/workspace/actions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function workspace(token) {
  return api('/api/workspace', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

let organizationId;
const authUserIds = [];

try {
  await api('/api/auth/register-owner', {
    method: 'POST',
    headers: setupHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      organizationName: `Тестовый клуб ${suffix}`,
      firstName: 'Тест',
      lastName: 'Владелец',
      username: ownerUsername,
      password
    })
  });
  const ownerToken = await signIn(ownerUsername);
  let ownerWorkspace = await workspace(ownerToken);
  organizationId = ownerWorkspace.workspace.organization.id;

  await action(ownerToken, {
    action: 'create_user',
    role: 'trainer',
    firstName: 'Тест',
    lastName: 'Тренер',
    username: trainerUsername,
    password
  });
  await action(ownerToken, {
    action: 'create_user',
    role: 'trainer',
    firstName: 'Другой',
    lastName: 'Тренер',
    username: otherTrainerUsername,
    password
  });
  const trainerToken = await signIn(trainerUsername);
  const otherTrainerToken = await signIn(otherTrainerUsername);

  await action(trainerToken, {
    action: 'save_group',
    activity: 'ММА',
    days: 'Пн, Ср, Пт',
    time: '19:00',
    note: 'Основная группа'
  });
  let trainerWorkspace = await workspace(trainerToken);
  const group = trainerWorkspace.workspace.groups[0];
  if (!group) throw new Error('Group was not created');

  const invitation = await action(trainerToken, {
    action: 'create_member_invite',
    firstName: 'Тест',
    lastName: 'Ученик',
    groupId: group.id
  });
  const inviteToken = new URL(invitation.inviteUrl).pathname.split('/').pop();
  if (!inviteToken) throw new Error('Invitation token was not returned');
  const inviteDetails = await api(`/api/invitations/${inviteToken}`);
  if (
    inviteDetails.firstName !== 'Тест' ||
    inviteDetails.lastName !== 'Ученик' ||
    inviteDetails.group.activity !== 'ММА'
  ) {
    throw new Error('Invitation page returned incorrect student or group data');
  }

  await api(`/api/invitations/${inviteToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: memberUsername,
      password
    })
  });

  trainerWorkspace = await workspace(trainerToken);
  const member = trainerWorkspace.workspace.users.find(
    (item) => item.username === memberUsername
  );
  if (!member) throw new Error('Member was not added after accepting invitation');

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 2);
  const due = dueDate.toISOString().slice(0, 10);
  await action(trainerToken, {
    action: 'save_payment',
    memberId: member.id,
    type: 'monthly',
    trainingFormat: 'group',
    amount: 5000,
    dueDate: due,
    updateFuture: true
  });

  try {
    await action(otherTrainerToken, {
      action: 'save_payment',
      memberId: member.id,
      type: 'monthly',
      trainingFormat: 'group',
      amount: 100,
      dueDate: due,
      updateFuture: true
    });
    throw new Error('Unassigned trainer was able to edit member payment');
  } catch (error) {
    if (!String(error).includes('403')) {
      throw error;
    }
  }

  const memberToken = await signIn(memberUsername);
  let memberWorkspace = await workspace(memberToken);
  let payment = memberWorkspace.workspace.payments.find((item) => item.is_current);
  if (!payment || payment.status !== 'active') throw new Error('Active payment was not created');

  const delayDate = new Date();
  delayDate.setDate(delayDate.getDate() + 7);
  const delayedUntil = delayDate.toISOString().slice(0, 10);
  await action(memberToken, {
    action: 'request_delay',
    paymentId: payment.id,
    requestedDate: delayedUntil,
    comment: 'Тестовый запрос'
  });
  await action(trainerToken, {
    action: 'decide_delay',
    paymentId: payment.id,
    approved: true
  });
  await action(memberToken, { action: 'submit_payment', paymentId: payment.id });
  await action(trainerToken, {
    action: 'decide_payment',
    paymentId: payment.id,
    approved: true
  });

  ownerWorkspace = await workspace(ownerToken);
  const paidPayment = ownerWorkspace.workspace.payments.find((item) => item.id === payment.id);
  const nextPayment = ownerWorkspace.workspace.payments.find(
    (item) => item.member_id === payment.member_id && item.is_current
  );
  if (paidPayment?.status !== 'paid') throw new Error('Payment was not marked paid');
  if (!nextPayment || nextPayment.id === payment.id) throw new Error('Next monthly payment was not created');

  await action(trainerToken, {
    action: 'save_payment',
    memberId: member.id,
    type: 'monthly',
    trainingFormat: 'group',
    amount: 5500,
    dueDate: nextPayment.due_date,
    updateFuture: false
  });
  memberWorkspace = await workspace(memberToken);
  const editedPayment = memberWorkspace.workspace.payments.find(
    (item) => item.id === nextPayment.id
  );
  if (Number(editedPayment?.amount) !== 5500) throw new Error('Payment was not edited');

  await action(trainerToken, {
    action: 'delete_payment',
    paymentId: nextPayment.id
  });
  memberWorkspace = await workspace(memberToken);
  if (memberWorkspace.workspace.payments.some((item) => item.id === nextPayment.id)) {
    throw new Error('Payment was not deleted');
  }
  if (
    !memberWorkspace.workspace.notifications.some((notification) =>
      notification.message.includes('отменён')
    )
  ) {
    throw new Error('Member did not receive deleted payment notification');
  }

  console.log(
    JSON.stringify({
      owner: true,
      trainer: true,
      group: true,
      member: true,
      delay: true,
      payment: paidPayment.status,
      nextPeriod: nextPayment.due_date,
      paymentEdited: true,
      paymentDeleted: true
    })
  );
} finally {
  if (organizationId) {
    const profiles = await admin
      .from('users')
      .select('auth_user_id')
      .eq('organization_id', organizationId);
    for (const profile of profiles.data ?? []) {
      if (profile.auth_user_id) authUserIds.push(profile.auth_user_id);
    }
    await admin.from('organizations').delete().eq('id', organizationId);
  }
  for (const authUserId of authUserIds) {
    await admin.auth.admin.deleteUser(authUserId);
  }
}
