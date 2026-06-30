import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Clock3,
  CreditCard,
  Share2,
  Wallet
} from 'lucide-react';
import { formatMoney } from '@shared/constants/app';
import type {
  LocalTrainingGroup,
  LocalTrainingSchedule
} from '@shared/lib/localWorkspace';
import type { AppUser, PaymentRequest } from '@shared/types/domain';
import { hasRole } from '@/core/roles';
import type {
  DelayDraftLike,
  PaymentTask,
  PaymentView
} from '@/modules/payments';
import { statusLabels } from '../constants';
import {
  canSubmitPayment,
  paymentLockedText,
  todayString
} from '../utils';

type TodayTaskWithAction = PaymentTask & {
  onClick: () => void;
};

type OverviewSectionProps = {
  activeUser: AppUser;
  activeMemberPayment: PaymentRequest | null;
  activeMemberTrainer: AppUser | null;
  activeMemberGroup: LocalTrainingGroup | null;
  activeMemberSchedule: LocalTrainingSchedule | null;
  todayTasks: TodayTaskWithAction[];
  todayTaskCount: number;
  todayTaskHeadline: string;
  visibleGroups: LocalTrainingGroup[];
  paidAmount: number;
  currentPayments: PaymentRequest[];
  overduePayments: PaymentRequest[];
  delayRequestedPayments: PaymentRequest[];
  delayedPayments: PaymentRequest[];
  delayDraftFor: (payment: PaymentRequest) => DelayDraftLike;
  updateDelayDraft: (paymentId: string, patch: Partial<DelayDraftLike>) => void;
  submitPaymentConfirmation: (paymentId: string) => void;
  requestPaymentDelay: (paymentId: string) => void;
  openPrepayment: (payment: PaymentRequest) => void;
  openPaymentsView: (view: PaymentView) => void;
  openOverviewInviteFlow: () => void;
  isPendingAction: (key: string) => boolean;
};

export function OverviewSection({
  activeUser,
  activeMemberPayment,
  activeMemberTrainer,
  activeMemberGroup,
  activeMemberSchedule,
  todayTasks,
  todayTaskCount,
  todayTaskHeadline,
  visibleGroups,
  paidAmount,
  currentPayments,
  overduePayments,
  delayRequestedPayments,
  delayedPayments,
  delayDraftFor,
  updateDelayDraft,
  submitPaymentConfirmation,
  requestPaymentDelay,
  openPrepayment,
  openPaymentsView,
  openOverviewInviteFlow,
  isPendingAction
}: OverviewSectionProps): React.ReactElement {
  if (hasRole(activeUser, 'member')) {
    return (
      <section className="member-overview">
        <div className="crm-panel member-primary-card">
          <div className="member-card-label">Текущая оплата</div>
          <strong className="member-payment-amount">
            {activeMemberPayment
              ? formatMoney(activeMemberPayment.amount)
              : 'Не назначена'}
          </strong>
          <div className="member-payment-meta">
            <span>
              Срок: {activeMemberPayment?.due_date ?? 'не указан'}
            </span>
            <span className={`status-pill ${activeMemberPayment?.status ?? 'not-set'}`}>
              {statusLabels[activeMemberPayment?.status ?? 'not-set']}
            </span>
          </div>
          {activeMemberPayment && canSubmitPayment(activeMemberPayment) ? (
            <div className="member-payment-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => submitPaymentConfirmation(activeMemberPayment.id)}
              >
                Я оплатил
              </button>
              <div className="delay-request-form">
                <input
                  aria-label="Новая дата оплаты"
                  min={todayString()}
                  type="date"
                  value={delayDraftFor(activeMemberPayment).requestedDate}
                  onChange={(event) =>
                    updateDelayDraft(activeMemberPayment.id, {
                      requestedDate: event.target.value
                    })
                  }
                />
                <input
                  aria-label="Комментарий к отсрочке"
                  placeholder="Причина, необязательно"
                  value={delayDraftFor(activeMemberPayment).comment}
                  onChange={(event) =>
                    updateDelayDraft(activeMemberPayment.id, {
                      comment: event.target.value
                    })
                  }
                />
                <button
                  className="small-button secondary"
                  type="button"
                  onClick={() => requestPaymentDelay(activeMemberPayment.id)}
                >
                  Запросить отсрочку
                </button>
              </div>
            </div>
          ) : null}
          {activeMemberPayment && paymentLockedText(activeMemberPayment) ? (
            <p className="payment-locked-note">
              {paymentLockedText(activeMemberPayment)}
              <button type="button" onClick={() => openPrepayment(activeMemberPayment)}>
                предоплату
              </button>
              .
            </p>
          ) : null}
          {activeMemberPayment?.status === 'delay_requested' ? (
            <p className="inline-note">
              Запрос до {activeMemberPayment.delay_requested_date} отправлен тренеру.
            </p>
          ) : null}
        </div>

        <div className="crm-panel member-info-card">
          <div className="member-card-label">Мой тренер</div>
          <strong>
            {activeMemberTrainer
              ? `${activeMemberTrainer.first_name} ${activeMemberTrainer.last_name}`
              : 'Не назначен'}
          </strong>
          <span>{activeMemberTrainer?.phone ?? activeMemberTrainer?.email ?? 'Контакт не указан'}</span>
        </div>

        <div className="crm-panel member-info-card">
          <div className="member-card-label">Расписание</div>
          <strong>{activeMemberGroup?.activity ?? 'Не назначено'}</strong>
          <span>
            {activeMemberSchedule
              ? `${activeMemberSchedule.days} · ${activeMemberSchedule.time}${activeMemberSchedule.note ? ` · ${activeMemberSchedule.note}` : ''}`
              : 'Тренер пока не добавил расписание'}
          </span>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="today-card">
        <div className="today-card-heading">
          <span className="today-card-icon"><CalendarDays size={20} /></span>
          <strong>Сегодня</strong>
        </div>
        <h2>
          {todayTaskCount > 0 ? todayTaskHeadline : 'Сегодня всё спокойно'}
        </h2>
        {todayTasks.length > 0 ? (
          <div className="today-task-list">
            {todayTasks.map((task) => (
              <button key={task.id} type="button" onClick={task.onClick}>
                <span>
                  <strong>{task.count}</strong>
                  <small>{task.label}</small>
                </span>
                <span className="today-task-action">
                  Открыть <ChevronRight size={18} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="today-calm">
            <span>Новых подтверждений, отсрочек и просрочек нет.</span>
          </div>
        )}
      </section>

      <section className="quick-actions-panel overview-invite-panel">
        <div>
          <span>Основное действие</span>
          <strong>Ссылка на вступление</strong>
        </div>
        <div className="quick-actions single-action">
          <button
            className="quick-action-card"
            type="button"
            disabled={
              visibleGroups.length === 0 ||
              (visibleGroups.length === 1 && isPendingAction(`create-invite:${visibleGroups[0].id}`))
            }
            onClick={openOverviewInviteFlow}
          >
            <Share2 size={18} />
            <span>
              {visibleGroups.length === 0
                ? 'Нет групп'
                : visibleGroups.length === 1 && isPendingAction(`create-invite:${visibleGroups[0].id}`)
                  ? 'Готовим ссылку...'
                  : 'Ссылка на вступление'}
            </span>
          </button>
        </div>
      </section>

      <section className="metric-grid">
        <Metric
          hint="История оплат"
          icon={<Wallet size={18} />}
          label="Получено"
          tone="violet"
          value={formatMoney(paidAmount)}
          onClick={() => openPaymentsView('paid')}
        />
        <Metric
          hint="Открыть список"
          icon={<CreditCard size={18} />}
          label="Активные оплаты"
          tone="violet"
          value={currentPayments.length}
          onClick={() => openPaymentsView('all')}
        />
        <Metric
          hint="Требует оплаты"
          icon={<AlertTriangle size={18} />}
          label="Просрочено"
          tone="danger"
          value={overduePayments.length}
          onClick={() => openPaymentsView('overdue')}
        />
        <Metric
          hint="ждёт / одобрено"
          icon={<Clock3 size={18} />}
          label="Отсрочки"
          tone="violet"
          value={`${delayRequestedPayments.length} / ${delayedPayments.length}`}
          onClick={() => openPaymentsView('actions')}
        />
      </section>
    </>
  );
}

function Metric({
  hint,
  icon,
  label,
  onClick,
  tone = 'violet',
  value
}: {
  hint?: string;
  icon?: ReactNode;
  label: string;
  onClick?: () => void;
  tone?: 'violet' | 'danger';
  value: ReactNode;
}): React.ReactElement {
  const content = (
    <>
      {icon ? <span className="metric-icon">{icon}</span> : null}
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </>
  );

  if (onClick) {
    return (
      <button className={`metric-card metric-card-button ${tone}`} type="button" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <article className={`metric-card ${tone}`}>{content}</article>;
}
