import type {
  PaymentRequest,
  PaymentRequestStatus
} from '@shared/types/domain';

export function dateAtNoon(date: string): number {
  return new Date(`${date}T12:00:00`).getTime();
}

export function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function statusAfterRejectedAction(payment: PaymentRequest): PaymentRequestStatus {
  if (
    payment.delay_status === 'approved' &&
    payment.delay_requested_date &&
    dateAtNoon(payment.delay_requested_date) >= dateAtNoon(todayString())
  ) {
    return 'delayed';
  }

  return dateAtNoon(payment.due_date) < dateAtNoon(todayString()) ? 'overdue' : 'active';
}

export function nextMonthDate(date: string, billingDay: number | null): string {
  return addMonthsDate(date, billingDay, 1);
}

export function addMonthsDate(date: string, billingDay: number | null, monthCount: number): string {
  const source = new Date(`${date}T12:00:00`);
  const target = new Date(source.getFullYear(), source.getMonth() + monthCount, 1);
  const year = target.getFullYear();
  const month = target.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(billingDay ?? source.getDate(), lastDay);

  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function periodLabel(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`)
  );
}

export function dueDateForBillingDay(billingDay: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const targetMonth = now.getDate() > billingDay ? month + 1 : month;
  const lastDay = new Date(year, targetMonth + 1, 0).getDate();
  const day = Math.min(billingDay, lastDay);
  const target = new Date(year, targetMonth, day);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
}

export function prepaymentPeriodLabel(date: string, months: number): string {
  const start = periodLabel(date);
  if (months <= 1) return `Предоплата: ${start}`;
  const end = periodLabel(addMonthsDate(date, null, months - 1));
  return `Предоплата: ${start} - ${end}`;
}

export function formatShortDate(date?: string | null): string {
  if (!date) return '—';
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short'
  });
}

export function isPaymentDue(payment: PaymentRequest): boolean {
  return payment.status === 'overdue' || dateAtNoon(payment.due_date) <= dateAtNoon(todayString());
}

export function canSubmitPayment(payment: PaymentRequest): boolean {
  return ['active', 'overdue', 'delayed'].includes(payment.status) && isPaymentDue(payment);
}

export function paymentLockedText(payment: PaymentRequest): string | null {
  if (canSubmitPayment(payment) || !['active', 'delayed'].includes(payment.status)) return null;
  return `Счёт откроется ${formatShortDate(payment.due_date)}. Если хотите закрыть его заранее, используйте `;
}
