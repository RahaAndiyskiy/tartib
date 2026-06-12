import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.TEST_APP_URL ?? 'http://127.0.0.1:3000';
const viewportWidth = Number(process.env.MOBILE_WIDTH ?? 390);
const outputDir = 'tmp/mobile-ui';
const now = new Date().toISOString();
const organizationId = 'mobile-org';
const ownerId = 'mobile-owner';
const trainerId = 'mobile-trainer';
const memberId = 'mobile-member';
const secondMemberId = 'mobile-member-2';
const groupId = 'mobile-group';

const workspace = {
  version: 5,
  organization: {
    id: organizationId,
    name: 'Клуб Единоборств Tartib',
    created_at: now
  },
  users: [
    {
      id: ownerId,
      auth_user_id: null,
      organization_id: organizationId,
      role: 'owner',
      roles: ['owner', 'trainer'],
      first_name: 'Амина',
      last_name: 'Ахмедова',
      phone: null,
      email: null,
      created_at: now
    },
    {
      id: trainerId,
      auth_user_id: null,
      organization_id: organizationId,
      role: 'trainer',
      roles: ['trainer'],
      first_name: 'Мария',
      last_name: 'Каримова',
      phone: '+7 900 000-00-00',
      email: null,
      created_at: now
    },
    {
      id: memberId,
      auth_user_id: null,
      organization_id: organizationId,
      role: 'member',
      roles: ['member'],
      first_name: 'Анна',
      last_name: 'Петрова',
      phone: null,
      email: null,
      created_at: now
    },
    {
      id: secondMemberId,
      auth_user_id: null,
      organization_id: organizationId,
      role: 'member',
      roles: ['member'],
      first_name: 'Елена',
      last_name: 'Соколова',
      phone: null,
      email: null,
      created_at: now
    }
  ],
  assignments: [
    {
      id: 'assignment-1',
      organization_id: organizationId,
      trainer_id: trainerId,
      member_id: memberId,
      created_at: now
    },
    {
      id: 'assignment-2',
      organization_id: organizationId,
      trainer_id: trainerId,
      member_id: secondMemberId,
      created_at: now
    }
  ],
  billingPlans: [
    {
      id: 'plan-1',
      memberId,
      trainerId,
      type: 'monthly',
      trainingFormat: 'group',
      baseAmount: 5000,
      billingDay: 15,
      active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'plan-2',
      memberId: secondMemberId,
      trainerId,
      type: 'monthly',
      trainingFormat: 'individual',
      baseAmount: 8000,
      billingDay: 10,
      active: true,
      createdAt: now,
      updatedAt: now
    }
  ],
  payments: [
    {
      id: 'payment-1',
      organization_id: organizationId,
      member_id: memberId,
      trainer_id: trainerId,
      amount: 5000,
      due_date: '2026-06-15',
      status: 'active',
      created_at: now,
      plan_id: 'plan-1',
      period_label: 'июнь 2026 г.',
      is_current: true,
      paid_at: null
    },
    {
      id: 'payment-2',
      organization_id: organizationId,
      member_id: secondMemberId,
      trainer_id: trainerId,
      amount: 8000,
      due_date: '2026-06-10',
      status: 'delay_requested',
      created_at: now,
      plan_id: 'plan-2',
      period_label: 'июнь 2026 г.',
      is_current: true,
      paid_at: null,
      delay_requested_date: '2026-06-20',
      delay_comment: 'Оплачу после зарплаты',
      delay_status: 'pending'
    }
  ],
  expenses: [],
  groups: [
    {
      id: groupId,
      trainerId,
      activity: 'ММА',
      days: 'Пн, Ср, Пт',
      time: '19:00',
      note: 'Основная группа',
      createdAt: now,
      updatedAt: now
    }
  ],
  groupMembers: [
    { id: 'gm-1', groupId, memberId, createdAt: now },
    { id: 'gm-2', groupId, memberId: secondMemberId, createdAt: now }
  ],
  schedules: [],
  notifications: [
    {
      id: 'notification-1',
      userId: memberId,
      message: 'Через 3 дня срок оплаты: 5000.00 ₽.',
      createdAt: now,
      read: false,
      paymentId: 'payment-1'
    }
  ]
};

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});

async function verifyRole(roleName, activeUserId, sections) {
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: 800 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard`);
  await page.evaluate(
    ({ data, userId }) => {
      window.localStorage.setItem('tartib.local.workspace', JSON.stringify(data));
      window.sessionStorage.setItem('tartib.local.active-user', userId);
    },
    { data: workspace, userId: activeUserId }
  );
  await page.reload();

  const results = [];
  for (const section of sections) {
    if (section.label) {
      await page.locator('.crm-nav-button').filter({ hasText: section.label }).click();
    }
    if (section.openForm) {
      await page.locator('.mobile-create-button').click();
    }
    await page.waitForTimeout(150);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }));
    const overlaps = await page.evaluate(() => {
      const nav = document.querySelector('.crm-sidebar')?.getBoundingClientRect();
      const visibleButtons = [...document.querySelectorAll('button')].filter((button) => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return style.display !== 'none' && rect.width > 0 && rect.height > 0;
      });
      return {
        navTop: nav?.top ?? null,
        shortButtons: visibleButtons
          .filter((button) => button.getBoundingClientRect().height < 38)
          .map((button) => button.textContent?.trim())
      };
    });
    await page.screenshot({
      path: `${outputDir}/${viewportWidth}-${roleName}-${section.name}.png`,
      fullPage: true
    });
    results.push({ section: section.name, dimensions, overlaps });
  }

  await context.close();
  return results;
}

try {
  const owner = await verifyRole('owner', ownerId, [
    { name: 'overview' },
    { name: 'people', label: 'Команда' },
    { name: 'people-form', label: 'Команда', openForm: true },
    { name: 'payments', label: 'Оплаты' },
    { name: 'groups', label: 'Группы' },
    { name: 'groups-form', label: 'Группы', openForm: true }
  ]);
  const member = await verifyRole('member', memberId, [
    { name: 'overview' },
    { name: 'payments', label: 'Оплаты' },
    { name: 'schedule', label: 'Расписание' },
    { name: 'notifications', label: 'Уведомления' }
  ]);

  console.log(JSON.stringify({ owner, member }, null, 2));
} finally {
  await browser.close();
}
