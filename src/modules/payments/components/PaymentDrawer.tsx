import type { Dispatch, SetStateAction } from 'react';
import { CheckCircle2, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { formatMoney } from '@shared/constants/app';
import type {
  LocalBillingPlan,
  LocalTrainingGroup
} from '@shared/lib/localWorkspace';
import type {
  AppUser,
  BillingPlanType,
  PaymentRequest,
  PaymentRequestStatus,
  TrainingFormat
} from '@shared/types/domain';
import { useScrollLock } from '@shared/ui/useScrollLock';
import { ModalCloseButton } from '@shared/ui/ModalCloseButton';

export type PaymentEditFormValue = {
  type: BillingPlanType;
  trainingFormat: TrainingFormat;
  individualTerms: boolean;
  currentAmount: string;
  dueDate: string;
  updateFuture: boolean;
};

type DelayDraftLike = {
  requestedDate: string;
  comment: string;
};

type PaymentEditFormProps = {
  memberId: string;
  selectedPayment?: PaymentRequest | null;
  edit: PaymentEditFormValue;
  isPending: boolean;
  submitLabel: string;
  onEditChange: (memberId: string, patch: Partial<PaymentEditFormValue>) => void;
  onSave: (memberId: string) => void;
  onCancel: () => void;
};

function PaymentEditForm({
  memberId,
  selectedPayment,
  edit,
  isPending,
  submitLabel,
  onEditChange,
  onSave,
  onCancel
}: PaymentEditFormProps): React.ReactElement {
  return (
    <div className="payment-edit-form">
      <div className="payment-detail-section-heading">
        <h3>{selectedPayment ? 'Условия и текущий счёт' : 'Новая оплата ученика'}</h3>
        <button className="text-button" type="button" onClick={onCancel}>Отмена</button>
      </div>
      <div className="split-fields">
        <label>
          Сумма счёта
          <input
            min="1"
            step="0.01"
            type="number"
            value={edit.currentAmount}
            onChange={(event) => onEditChange(memberId, { currentAmount: event.target.value })}
          />
        </label>
        <label>
          Оплатить до
          <input
            type="date"
            value={edit.dueDate}
            onChange={(event) => onEditChange(memberId, { dueDate: event.target.value })}
          />
        </label>
      </div>
      <details className="payment-plan-options">
        <summary>
          <span>
            Условия на будущее
            <small>Схема, формат и повторение</small>
          </span>
          <ChevronRight size={17} />
        </summary>
        <div className="payment-plan-options-body">
          <label>
            Схема
            <select
              value={edit.type}
              onChange={(event) => onEditChange(memberId, { type: event.target.value as BillingPlanType })}
            >
              <option value="monthly">Абонемент</option>
              <option value="one_time">Разовая</option>
            </select>
          </label>
          {edit.type === 'monthly' ? (
            <label>
              Формат
              <select
                value={edit.trainingFormat}
                onChange={(event) => onEditChange(memberId, { trainingFormat: event.target.value as TrainingFormat })}
              >
                <option value="group">Группа</option>
                <option value="individual">Индивидуально</option>
              </select>
            </label>
          ) : null}
          {edit.type !== 'one_time' ? (
            <>
              <label className="payment-future-toggle">
                <input
                  checked={edit.individualTerms}
                  type="checkbox"
                  onChange={(event) =>
                    onEditChange(memberId, {
                      individualTerms: event.target.checked,
                      updateFuture: event.target.checked ? true : edit.updateFuture
                    })
                  }
                />
                Индивидуальные условия оплаты
              </label>
              <label className="payment-future-toggle">
                <input
                  checked={edit.updateFuture}
                  type="checkbox"
                  disabled={edit.individualTerms}
                  onChange={(event) => onEditChange(memberId, { updateFuture: event.target.checked })}
                />
                Использовать эту сумму в следующих месяцах
              </label>
            </>
          ) : null}
        </div>
      </details>
      <button
        className="primary-button"
        type="button"
        disabled={isPending}
        onClick={() => onSave(memberId)}
      >
        {submitLabel}
      </button>
    </div>
  );
}

type PaymentDrawerProps = {
  activeUser: AppUser;
  selectedPaymentMember: AppUser;
  selectedPayment?: PaymentRequest | null;
  selectedPaymentPlan?: LocalBillingPlan | null;
  selectedPaymentGroup?: LocalTrainingGroup | null;
  selectedPaymentHistory: PaymentRequest[];
  selectedPaymentHistoryOpen: boolean;
  paymentEditOpen: boolean;
  paymentEdit: PaymentEditFormValue;
  statusLabels: Record<PaymentRequestStatus | 'not-set', string>;
  planLabels: Record<BillingPlanType, string>;
  userName: (userId: string) => string;
  formatShortDate: (date?: string | null) => string;
  todayString: () => string;
  prepaymentPeriodLabel: (date: string, months: number) => string;
  canManagePayments: boolean;
  canSubmitPayment: (payment: PaymentRequest) => boolean;
  canSubmitPrepayment: (payment: PaymentRequest) => boolean;
  paymentLockedText: (payment: PaymentRequest) => string | null;
  delayDraftFor: (payment: PaymentRequest) => DelayDraftLike;
  updateDelayDraft: (paymentId: string, patch: Partial<DelayDraftLike>) => void;
  prepaymentMonthsFor: (paymentId: string) => number;
  setPrepaymentMonths: Dispatch<SetStateAction<Record<string, number>>>;
  setHistoryOpenByMember: Dispatch<SetStateAction<Record<string, boolean>>>;
  isPendingAction: (key: string) => boolean;
  buttonLabel: (key: string, label: string) => string;
  onClose: () => void;
  onEditOpenChange: (open: boolean) => void;
  onEditChange: (memberId: string, patch: Partial<PaymentEditFormValue>) => void;
  onSavePayment: (memberId: string) => void;
  onUpdatePaymentStatus: (paymentId: string, status: PaymentRequestStatus) => void;
  onDecidePaymentDelay: (paymentId: string, approved: boolean) => void;
  onSubmitPaymentConfirmation: (paymentId: string) => void;
  onRequestPaymentDelay: (paymentId: string) => void;
  onOpenPrepayment: (payment: PaymentRequest) => void;
  onSubmitPrepayment: (paymentId: string) => void;
  onDeletePayment: (payment: PaymentRequest) => void;
};

export function PaymentDrawer({
  activeUser,
  selectedPaymentMember,
  selectedPayment,
  selectedPaymentPlan,
  selectedPaymentGroup,
  selectedPaymentHistory,
  selectedPaymentHistoryOpen,
  paymentEditOpen,
  paymentEdit,
  statusLabels,
  planLabels,
  userName,
  formatShortDate,
  todayString,
  prepaymentPeriodLabel,
  canManagePayments,
  canSubmitPayment,
  canSubmitPrepayment,
  paymentLockedText,
  delayDraftFor,
  updateDelayDraft,
  prepaymentMonthsFor,
  setPrepaymentMonths,
  setHistoryOpenByMember,
  isPendingAction,
  buttonLabel,
  onClose,
  onEditOpenChange,
  onEditChange,
  onSavePayment,
  onUpdatePaymentStatus,
  onDecidePaymentDelay,
  onSubmitPaymentConfirmation,
  onRequestPaymentDelay,
  onOpenPrepayment,
  onSubmitPrepayment,
  onDeletePayment
}: PaymentDrawerProps): React.ReactElement {
  useScrollLock();

  const paymentPlanSummary = selectedPaymentPlan
    ? [
        planLabels[selectedPaymentPlan.type],
        formatMoney(selectedPaymentPlan.baseAmount),
        selectedPaymentPlan.type === 'monthly' && selectedPaymentPlan.billingDay
          ? `${selectedPaymentPlan.billingDay}-го числа`
          : 'разово'
      ].join(' · ')
    : 'Условия не настроены';

  return (
    <>
      <button
        className="payment-drawer-backdrop"
        aria-label="Закрыть детали оплаты"
        type="button"
        onClick={onClose}
      />
      <aside className="payment-drawer" aria-label={`Оплата: ${userName(selectedPaymentMember.id)}`}>
        <div className="modal-standard-header payment-drawer-header">
          <div>
            <h2>{userName(selectedPaymentMember.id)}</h2>
            <p>{selectedPaymentGroup?.activity ?? 'Без группы'}</p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="payment-drawer-body">
          <section className="payment-current-card">
            <div className="payment-card-heading">
              <span>Текущий счёт</span>
              <span className={`status-pill ${selectedPayment?.status ?? 'not-set'}`}>
                {statusLabels[selectedPayment?.status ?? 'not-set']}
              </span>
            </div>
            <strong>{selectedPayment ? formatMoney(selectedPayment.amount) : 'Не назначен'}</strong>
            <dl>
              <div>
                <dt>Оплатить до</dt>
                <dd>{formatShortDate(selectedPayment?.due_date)}</dd>
              </div>
              <div>
                <dt>Период</dt>
                <dd>{selectedPayment?.period_label ?? 'Текущий период'}</dd>
              </div>
            </dl>
            {canManagePayments && selectedPayment && ['active', 'overdue', 'delayed'].includes(selectedPayment.status) ? (
              <button
                className="small-button secondary payment-mark-paid-action"
                type="button"
                disabled={isPendingAction(`decide-payment:${selectedPayment.id}`)}
                onClick={() => onUpdatePaymentStatus(selectedPayment.id, 'paid')}
              >
                <CheckCircle2 size={16} />
                Отметить оплаченным
              </button>
            ) : null}
          </section>

          <div className="payment-plan-summary-row">
            <span>
              <strong>Условия оплаты</strong>
              <small>{paymentPlanSummary}</small>
            </span>
            {selectedPaymentPlan?.source === 'individual' ? <em>Индивидуальные</em> : null}
          </div>

          {canManagePayments && paymentEditOpen ? (
            <PaymentEditForm
              memberId={selectedPaymentMember.id}
              selectedPayment={selectedPayment}
              edit={paymentEdit}
              isPending={isPendingAction(`save-payment:${selectedPaymentMember.id}`)}
              submitLabel={buttonLabel(
                `save-payment:${selectedPaymentMember.id}`,
                selectedPayment ? 'Сохранить изменения' : 'Назначить оплату'
              )}
              onEditChange={onEditChange}
              onSave={onSavePayment}
              onCancel={() => onEditOpenChange(false)}
            />
          ) : null}

          {selectedPayment?.status === 'payment_confirmation' && canManagePayments ? (
            <div className="payment-decision-card">
              <div>
                <strong>Ученик сообщил об оплате</strong>
                <span>Проверьте поступление и примите решение.</span>
              </div>
              <div className="payment-primary-actions">
                <button className="primary-button" type="button" disabled={isPendingAction(`decide-payment:${selectedPayment.id}`)} onClick={() => onUpdatePaymentStatus(selectedPayment.id, 'paid')}>
                  Подтвердить
                </button>
                <button className="ghost-button" type="button" disabled={isPendingAction(`decide-payment:${selectedPayment.id}`)} onClick={() => onUpdatePaymentStatus(selectedPayment.id, 'active')}>
                  Отклонить
                </button>
              </div>
            </div>
          ) : null}

          {selectedPayment?.status === 'delay_requested' && canManagePayments ? (
            <div className="payment-decision-card">
              <div>
                <strong>Запрошена отсрочка до {formatShortDate(selectedPayment.delay_requested_date)}</strong>
                <span>{selectedPayment.delay_comment || 'Без комментария'}</span>
              </div>
              <div className="payment-primary-actions">
                <button className="primary-button" type="button" disabled={isPendingAction(`decide-delay:${selectedPayment.id}`)} onClick={() => onDecidePaymentDelay(selectedPayment.id, true)}>
                  Одобрить
                </button>
                <button className="ghost-button" type="button" disabled={isPendingAction(`decide-delay:${selectedPayment.id}`)} onClick={() => onDecidePaymentDelay(selectedPayment.id, false)}>
                  Отклонить
                </button>
              </div>
            </div>
          ) : null}

          {activeUser.role === 'member' && selectedPayment && canSubmitPayment(selectedPayment) ? (
            <div className="member-payment-controls">
              <button className="primary-button" type="button" disabled={isPendingAction(`submit-payment:${selectedPayment.id}`)} onClick={() => onSubmitPaymentConfirmation(selectedPayment.id)}>
                Я оплатил
              </button>
              <div className="payment-delay-form">
                <div className="payment-detail-section-heading"><h3>Нужна отсрочка?</h3></div>
                <label>
                  Новая дата
                  <input
                    min={todayString()}
                    type="date"
                    value={delayDraftFor(selectedPayment).requestedDate}
                    onChange={(event) => updateDelayDraft(selectedPayment.id, { requestedDate: event.target.value })}
                  />
                </label>
                <label>
                  Комментарий
                  <input
                    placeholder="Необязательно"
                    value={delayDraftFor(selectedPayment).comment}
                    onChange={(event) => updateDelayDraft(selectedPayment.id, { comment: event.target.value })}
                  />
                </label>
                <button className="ghost-button" type="button" disabled={isPendingAction(`request-delay:${selectedPayment.id}`)} onClick={() => onRequestPaymentDelay(selectedPayment.id)}>
                  Запросить отсрочку
                </button>
              </div>
            </div>
          ) : null}
          {activeUser.role === 'member' && selectedPayment && paymentLockedText(selectedPayment) ? (
            <div className="payment-info-card">
              <strong>Оплата ещё не открыта</strong>
              <span>
                {paymentLockedText(selectedPayment)}
                <button type="button" onClick={() => onOpenPrepayment(selectedPayment)}>
                  предоплату
                </button>
                .
              </span>
            </div>
          ) : null}

          {selectedPayment && canSubmitPrepayment(selectedPayment) ? (
            <div className="payment-prepay-card" id={`prepayment-${selectedPayment.id}`}>
              <div>
                <strong>Предоплата</strong>
                <span>Можно оплатить раньше срока или закрыть несколько месяцев одним платежом.</span>
              </div>
              <div className="prepay-months" aria-label="Количество месяцев предоплаты">
                {[1, 2, 3].map((months) => (
                  <button
                    className={prepaymentMonthsFor(selectedPayment.id) === months ? 'active' : ''}
                    key={months}
                    type="button"
                    onClick={() =>
                      setPrepaymentMonths((current) => ({
                        ...current,
                        [selectedPayment.id]: months
                      }))
                    }
                  >
                    {months} мес.
                  </button>
                ))}
              </div>
              <div className="prepay-total">
                <span>{prepaymentPeriodLabel(selectedPayment.due_date, prepaymentMonthsFor(selectedPayment.id))}</span>
                <strong>
                  {formatMoney(
                    Number(selectedPaymentPlan?.baseAmount ?? selectedPayment.amount) *
                    prepaymentMonthsFor(selectedPayment.id)
                  )}
                </strong>
              </div>
              <button
                className="ghost-button"
                type="button"
                disabled={isPendingAction(`submit-prepayment:${selectedPayment.id}`)}
                onClick={() => onSubmitPrepayment(selectedPayment.id)}
              >
                Отправить предоплату
              </button>
            </div>
          ) : null}

          <div className="payment-detail-section">
            <button
              className="payment-history-toggle"
              type="button"
              onClick={() =>
                setHistoryOpenByMember((current) => ({
                  ...current,
                  [selectedPaymentMember.id]: !selectedPaymentHistoryOpen
                }))
              }
            >
              <span>
                <strong>История оплат</strong>
                <small>{selectedPaymentHistory.length} записей</small>
              </span>
              <ChevronRight className={selectedPaymentHistoryOpen ? 'open' : ''} size={18} />
            </button>
            {selectedPaymentHistoryOpen ? (
              <div className="payment-detail-history">
                {selectedPaymentHistory.map((payment) => (
                  <div key={payment.id}>
                    <span>{payment.period_label ?? payment.due_date}</span>
                    <strong>{formatMoney(payment.amount)}</strong>
                  </div>
                ))}
                {selectedPaymentHistory.length === 0 ? <p>Оплат пока нет.</p> : null}
              </div>
            ) : null}
          </div>

          {canManagePayments && !paymentEditOpen ? (
            <div className="payment-detail-actions">
              <button
                className="small-button secondary payment-edit-action"
                type="button"
                onClick={() => onEditOpenChange(true)}
              >
                <Pencil size={16} />
                {selectedPayment ? 'Изменить счёт' : 'Настроить оплату'}
              </button>
              {selectedPayment && selectedPayment.status !== 'paid' ? (
                <button
                  aria-label="Удалить счёт"
                  className="small-button danger payment-delete-action"
                  type="button"
                  disabled={isPendingAction(`delete-payment:${selectedPayment.id}`)}
                  onClick={() => onDeletePayment(selectedPayment)}
                >
                  <Trash2 size={17} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
