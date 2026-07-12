import type { Dispatch, SetStateAction } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatMoney } from '@shared/constants/app';
import type { LocalBillingPlan } from '@shared/lib/localWorkspace';
import type {
  AppUser,
  BillingPlanType,
  PaymentRequest,
  PaymentRequestStatus,
  TrainingFormat
} from '@shared/types/domain';

type DelayDraftLike = {
  requestedDate: string;
  comment: string;
};

type MemberPaymentPanelProps = {
  activeUser: AppUser;
  activeMemberPlan?: LocalBillingPlan | null;
  activeMemberPayment?: PaymentRequest | null;
  activeMemberPaymentHistory: PaymentRequest[];
  activeMemberTrainer: AppUser | null;
  activeMemberHistoryOpen: boolean;
  statusLabels: Record<PaymentRequestStatus | 'not-set', string>;
  planLabels: Record<BillingPlanType, string>;
  formatLabels: Record<TrainingFormat, string>;
  todayString: () => string;
  formatShortDate: (date?: string | null) => string;
  prepaymentPeriodLabel: (date: string, months: number) => string;
  canSubmitPayment: (payment: PaymentRequest) => boolean;
  canSubmitPrepayment: (payment: PaymentRequest) => boolean;
  paymentLockedText: (payment: PaymentRequest) => string | null;
  delayDraftFor: (payment: PaymentRequest) => DelayDraftLike;
  updateDelayDraft: (paymentId: string, patch: Partial<DelayDraftLike>) => void;
  prepaymentMonthsFor: (paymentId: string) => number;
  setPrepaymentMonths: Dispatch<SetStateAction<Record<string, number>>>;
  setHistoryOpenByMember: Dispatch<SetStateAction<Record<string, boolean>>>;
  isPendingAction: (key: string) => boolean;
  submitPaymentConfirmation: (paymentId: string) => void;
  requestPaymentDelay: (paymentId: string) => void;
  requestMonthSkip: (paymentId: string) => void;
  openPrepayment: (payment: PaymentRequest) => void;
  submitPrepayment: (paymentId: string) => void;
};

export function MemberPaymentPanel({
  activeUser,
  activeMemberPlan,
  activeMemberPayment,
  activeMemberPaymentHistory,
  activeMemberTrainer,
  activeMemberHistoryOpen,
  statusLabels,
  planLabels,
  formatLabels,
  todayString,
  formatShortDate,
  prepaymentPeriodLabel,
  canSubmitPayment,
  canSubmitPrepayment,
  paymentLockedText,
  delayDraftFor,
  updateDelayDraft,
  prepaymentMonthsFor,
  setPrepaymentMonths,
  setHistoryOpenByMember,
  isPendingAction,
  submitPaymentConfirmation,
  requestPaymentDelay,
  requestMonthSkip,
  openPrepayment,
  submitPrepayment
}: MemberPaymentPanelProps): React.ReactElement {
  const canRequestMonthSkip = Boolean(
    activeMemberPayment && ['active', 'overdue', 'delayed'].includes(activeMemberPayment.status)
  );

  return (
    <section className="member-payment-page">
      <div className="crm-panel member-payment-focus">
        <div className="payment-concept-strip">
          <div>
            <span>Условия</span>
            <strong>{activeMemberPlan ? formatMoney(activeMemberPlan.baseAmount) : 'Не настроены'}</strong>
          </div>
          <ChevronRight size={16} />
          <div>
            <span>Текущий счёт</span>
            <strong>{activeMemberPayment ? statusLabels[activeMemberPayment.status] : 'Нет счёта'}</strong>
          </div>
          <ChevronRight size={16} />
          <div>
            <span>История</span>
            <strong>{activeMemberPaymentHistory.length} оплат</strong>
          </div>
        </div>
        <div className="payment-split-overview">
          <section className="payment-current-card">
            <div className="payment-card-heading">
              <span>Текущий счёт</span>
              <span className={`status-pill ${activeMemberPayment?.status ?? 'not-set'}`}>
                {statusLabels[activeMemberPayment?.status ?? 'not-set']}
              </span>
            </div>
            <strong>{activeMemberPayment ? formatMoney(activeMemberPayment.amount) : 'Не назначен'}</strong>
            <dl>
              <div>
                <dt>Период</dt>
                <dd>{activeMemberPayment?.period_label ?? 'Текущий период'}</dd>
              </div>
              <div>
                <dt>Оплатить до</dt>
                <dd>{formatShortDate(activeMemberPayment?.due_date)}</dd>
              </div>
            </dl>
          </section>

          <section className="payment-plan-card">
            <div className="payment-card-heading">
              <span>Условия оплаты</span>
              <strong>{activeMemberPlan ? 'Настроены' : 'Не настроены'}</strong>
            </div>
            <dl>
              <div><dt>Схема</dt><dd>{activeMemberPlan ? planLabels[activeMemberPlan.type] : '—'}</dd></div>
              <div>
                <dt>Формат</dt>
                <dd>{activeMemberPlan?.type === 'monthly' ? formatLabels[activeMemberPlan.trainingFormat] : '—'}</dd>
              </div>
              <div><dt>Базовая сумма</dt><dd>{activeMemberPlan ? formatMoney(activeMemberPlan.baseAmount) : '—'}</dd></div>
              <div><dt>Тренер</dt><dd>{activeMemberTrainer ? `${activeMemberTrainer.first_name} ${activeMemberTrainer.last_name}` : '—'}</dd></div>
            </dl>
          </section>
        </div>

        {activeMemberPayment && (canSubmitPayment(activeMemberPayment) || canRequestMonthSkip) ? (
          <div className="member-payment-controls">
            {canSubmitPayment(activeMemberPayment) ? (
              <>
                <button
                  className="primary-button"
                  type="button"
                  disabled={isPendingAction(`submit-payment:${activeMemberPayment.id}`)}
                  onClick={() => submitPaymentConfirmation(activeMemberPayment.id)}
                >
                  Я оплатил
                </button>
                <div className="payment-delay-form">
                  <div className="payment-detail-section-heading"><h3>Нужна отсрочка?</h3></div>
                  <label>
                    Новая дата
                    <input
                      min={todayString()}
                      type="date"
                      value={delayDraftFor(activeMemberPayment).requestedDate}
                      onChange={(event) => updateDelayDraft(activeMemberPayment.id, { requestedDate: event.target.value })}
                    />
                  </label>
                  <label>
                    Комментарий
                    <input
                      placeholder="Необязательно"
                      value={delayDraftFor(activeMemberPayment).comment}
                      onChange={(event) => updateDelayDraft(activeMemberPayment.id, { comment: event.target.value })}
                    />
                  </label>
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={isPendingAction(`request-delay:${activeMemberPayment.id}`)}
                    onClick={() => requestPaymentDelay(activeMemberPayment.id)}
                  >
                    Запросить отсрочку
                  </button>
                </div>
              </>
            ) : null}
            {canRequestMonthSkip ? (
              <button
                className="ghost-button"
                type="button"
                disabled={isPendingAction(`request-month-skip:${activeMemberPayment.id}`)}
                onClick={() => requestMonthSkip(activeMemberPayment.id)}
              >
                Не буду ходить этот месяц
              </button>
            ) : null}
          </div>
        ) : null}

        {activeMemberPayment && paymentLockedText(activeMemberPayment) ? (
          <div className="payment-info-card">
            <strong>Оплата ещё не открыта</strong>
            <span>
              {paymentLockedText(activeMemberPayment)}
              <button type="button" onClick={() => openPrepayment(activeMemberPayment)}>
                предоплату
              </button>
              .
            </span>
          </div>
        ) : null}

        {activeMemberPayment && canSubmitPrepayment(activeMemberPayment) ? (
          <div className="payment-prepay-card" id={`prepayment-${activeMemberPayment.id}`}>
            <div>
              <strong>Предоплата</strong>
              <span>Можно закрыть один или несколько месяцев одним платежом.</span>
            </div>
            <div className="prepay-months" aria-label="Количество месяцев предоплаты">
              {[1, 2, 3].map((months) => (
                <button
                  className={prepaymentMonthsFor(activeMemberPayment.id) === months ? 'active' : ''}
                  key={months}
                  type="button"
                  onClick={() =>
                    setPrepaymentMonths((current) => ({
                      ...current,
                      [activeMemberPayment.id]: months
                    }))
                  }
                >
                  {months} мес.
                </button>
              ))}
            </div>
            <div className="prepay-total">
              <span>{prepaymentPeriodLabel(activeMemberPayment.due_date, prepaymentMonthsFor(activeMemberPayment.id))}</span>
              <strong>
                {formatMoney(
                  Number(activeMemberPlan?.baseAmount ?? activeMemberPayment.amount) *
                  prepaymentMonthsFor(activeMemberPayment.id)
                )}
              </strong>
            </div>
            <button
              className="ghost-button"
              type="button"
              disabled={isPendingAction(`submit-prepayment:${activeMemberPayment.id}`)}
              onClick={() => submitPrepayment(activeMemberPayment.id)}
            >
              Отправить предоплату
            </button>
          </div>
        ) : null}

        {activeMemberPayment?.status === 'delay_requested' ? (
          <p className="payment-locked-note">
            Запрос отсрочки до {formatShortDate(activeMemberPayment.delay_requested_date)} отправлен тренеру.
          </p>
        ) : null}

        {activeMemberPayment?.status === 'skip_requested' ? (
          <p className="payment-locked-note">
            Запрос пропуска месяца отправлен тренеру.
          </p>
        ) : null}

        <div className="payment-detail-section">
          <button
            className="payment-history-toggle"
            type="button"
            onClick={() =>
              setHistoryOpenByMember((current) => ({
                ...current,
                [activeUser.id]: !activeMemberHistoryOpen
              }))
            }
          >
            <span>
              <strong>История оплат</strong>
              <small>{activeMemberPaymentHistory.length} записей</small>
            </span>
            <ChevronRight className={activeMemberHistoryOpen ? 'open' : ''} size={18} />
          </button>
          {activeMemberHistoryOpen ? (
            <div className="payment-detail-history">
              {activeMemberPaymentHistory.map((payment) => (
                <div key={payment.id}>
                  <span>{payment.period_label ?? payment.due_date}</span>
                  <strong>{formatMoney(payment.amount)}</strong>
                </div>
              ))}
              {activeMemberPaymentHistory.length === 0 ? <p>Оплат пока нет.</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
