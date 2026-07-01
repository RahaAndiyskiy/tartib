import type {
  LocalBillingPlan,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type {
  AppUser,
  PaymentRequest,
  PaymentRequestStatus
} from '@shared/types/domain';
import { hasRole } from '@/core/roles';
import {
  decidePaymentDelayAction,
  decidePaymentStatusAction,
  deleteMemberPaymentAction,
  requestPaymentDelayAction,
  saveLocalMemberPayment,
  saveRemoteMemberPaymentAction,
  submitPaymentConfirmationAction,
  submitPrepaymentAction,
  upsertBillingPlan,
  upsertPayment,
  validateSavePaymentDraft
} from '@/modules/payments';
import type {
  DelayDraftState,
  PaymentEditState
} from '@/modules/payments/model/usePaymentUiState';

type RunRemoteActionWithPending = <T>(
  payload: Record<string, unknown>,
  pendingKey: string
) => Promise<T | null>;

type UsePaymentActionsControllerOptions = {
  activePlanByMemberId: Map<string, LocalBillingPlan>;
  activeUser: AppUser | null;
  activeUserId: string;
  addMonthsDate: (date: string, billingDay: number | null, monthCount: number) => string;
  assignmentsByMemberId: Map<string, { trainer_id: string }>;
  canSubmitPayment: (payment: PaymentRequest) => boolean;
  canSubmitPrepayment: (payment: PaymentRequest) => boolean;
  clearPaymentEdit: (memberId: string) => void;
  createId: () => string;
  currentPaymentByMemberId: Map<string, PaymentRequest>;
  dateAtNoon: (date: string) => number;
  delayDraftFor: (payment: PaymentRequest) => DelayDraftState;
  isLocalMode: boolean;
  paymentEdits: Record<string, PaymentEditState>;
  periodLabel: (date: string) => string;
  prepaymentMonthsFor: (paymentId: string) => number;
  prepaymentPeriodLabel: (startDate: string, months: number) => string;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setMessage: (message: string) => void;
  setWorkspace: React.Dispatch<React.SetStateAction<LocalWorkspace | null>>;
  todayString: () => string;
  updatePaymentDelayDraft: (payment: PaymentRequest, patch: Partial<DelayDraftState>) => void;
  userName: (userId: string) => string;
  workspace: LocalWorkspace | null;
};

type PaymentActionsController = {
  decidePaymentDelay: (paymentId: string, approved: boolean) => Promise<void>;
  deleteMemberPayment: (payment: PaymentRequest) => Promise<void>;
  requestPaymentDelay: (paymentId: string) => Promise<void>;
  saveMemberPayment: (memberId: string) => Promise<void>;
  submitPaymentConfirmation: (paymentId: string) => Promise<void>;
  submitPrepayment: (paymentId: string) => Promise<void>;
  updateDelayDraft: (paymentId: string, patch: Partial<DelayDraftState>) => void;
  updatePaymentStatus: (paymentId: string, status: PaymentRequestStatus) => Promise<void>;
};

export function usePaymentActionsController({
  activePlanByMemberId,
  activeUser,
  activeUserId,
  addMonthsDate,
  assignmentsByMemberId,
  canSubmitPayment,
  canSubmitPrepayment,
  clearPaymentEdit,
  createId,
  currentPaymentByMemberId,
  dateAtNoon,
  delayDraftFor,
  isLocalMode,
  paymentEdits,
  periodLabel,
  prepaymentMonthsFor,
  prepaymentPeriodLabel,
  runRemoteActionWithPending,
  saveWorkspace,
  setMessage,
  setWorkspace,
  todayString,
  updatePaymentDelayDraft,
  userName,
  workspace
}: UsePaymentActionsControllerOptions): PaymentActionsController {
  async function saveMemberPayment(memberId: string): Promise<void> {
    if (!workspace || !activeUser) return;

    const edit = paymentEdits[memberId];
    const assignment = assignmentsByMemberId.get(memberId);
    const trainerId =
      hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')
        ? activeUser.id
        : assignment?.trainer_id;

    const validation = validateSavePaymentDraft({ edit, trainerId });
    if (!validation.ok && validation.reason === 'missing_trainer') {
      setMessage('У этого ученика не назначен тренер.');
      return;
    }
    if (!validation.ok && validation.reason === 'missing_due_date') {
      setMessage('Укажите сумму и срок оплаты.');
      return;
    }
    if (!validation.ok && validation.reason === 'invalid_amount') {
      setMessage('Сумма оплаты должна быть больше нуля.');
      return;
    }
    if (!edit || !trainerId || !validation.ok) return;

    if (!isLocalMode) {
      const data = await saveRemoteMemberPaymentAction({
        memberId,
        edit,
        amount: validation.amount,
        source: validation.source,
        runRemoteActionWithPending
      });
      if (data?.payment && data.billingPlan) {
        setWorkspace((current) =>
          current ? upsertPayment(upsertBillingPlan(current, data.billingPlan), data.payment) : current
        );
        clearPaymentEdit(memberId);
        setMessage('Оплата сохранена.');
      }
      return;
    }

    const existingPayment = currentPaymentByMemberId.get(memberId);
    const existingPlan = activePlanByMemberId.get(memberId);
    const result = saveLocalMemberPayment({
      workspace,
      memberId,
      trainerId,
      edit,
      amount: validation.amount,
      source: validation.source,
      existingPayment,
      existingPlan,
      now: new Date().toISOString(),
      createId,
      periodLabel
    });
    saveWorkspace(result.workspace);
    clearPaymentEdit(memberId);
    setMessage(result.paymentExisted ? 'Оплата обновлена.' : 'Оплата назначена.');
  }

  async function deleteMemberPayment(payment: PaymentRequest): Promise<void> {
    await deleteMemberPaymentAction({
      workspace,
      payment,
      isLocalMode,
      activeUserId,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage,
      clearPaymentEdit,
      confirmDelete: (message) => window.confirm(message),
      now: new Date().toISOString(),
      createId
    });
  }

  async function updatePaymentStatus(paymentId: string, status: PaymentRequestStatus): Promise<void> {
    const payment = workspace?.payments.find((item) => item.id === paymentId);

    await decidePaymentStatusAction({
      workspace,
      payment,
      status,
      isLocalMode,
      activeUserId,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage,
      clearPaymentEdit,
      now: new Date().toISOString(),
      createId,
      statusAfterRejectedAction: (item) =>
        item.delay_status === 'approved' &&
        item.delay_requested_date &&
        dateAtNoon(item.delay_requested_date) >= dateAtNoon(todayString())
          ? 'delayed'
          : dateAtNoon(item.due_date) < dateAtNoon(todayString())
            ? 'overdue'
            : 'active',
      addMonthsDate,
      periodLabel
    });
  }

  function updateDelayDraft(paymentId: string, patch: Partial<DelayDraftState>): void {
    const payment = workspace?.payments.find((item) => item.id === paymentId);
    if (!payment) return;

    updatePaymentDelayDraft(payment, patch);
  }

  async function requestPaymentDelay(paymentId: string): Promise<void> {
    if (!activeUser || !hasRole(activeUser, 'member')) return;

    const payment = workspace?.payments.find((item) => item.id === paymentId);
    const draft = payment ? delayDraftFor(payment) : { requestedDate: '', comment: '' };

    await requestPaymentDelayAction({
      workspace,
      payment,
      requestedDate: draft.requestedDate,
      comment: draft.comment,
      isLocalMode,
      activeUserId,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage,
      now: new Date().toISOString(),
      createId,
      userName,
      isInvalidRequestedDate: (requestedDate, dueDate) =>
        !requestedDate ||
        dateAtNoon(requestedDate) <= dateAtNoon(dueDate) ||
        dateAtNoon(requestedDate) < dateAtNoon(todayString())
    });
  }

  async function decidePaymentDelay(paymentId: string, approved: boolean): Promise<void> {
    if (!activeUser || (!hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner'))) {
      return;
    }

    const payment = workspace?.payments.find((item) => item.id === paymentId);

    await decidePaymentDelayAction({
      workspace,
      payment,
      approved,
      actorId: activeUser.id,
      isLocalMode,
      activeUserId,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage,
      now: new Date().toISOString(),
      createId,
      statusForDueDate: (dueDate) =>
        dateAtNoon(dueDate) < dateAtNoon(todayString())
          ? 'overdue'
          : approved
            ? 'delayed'
            : 'active',
      periodLabel
    });
  }

  async function submitPaymentConfirmation(paymentId: string): Promise<void> {
    const payment = workspace?.payments.find((item) => item.id === paymentId);

    await submitPaymentConfirmationAction({
      workspace,
      payment,
      isLocalMode,
      activeUserId,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage,
      canSubmitPayment,
      now: new Date().toISOString(),
      createId,
      userName
    });
  }

  async function submitPrepayment(paymentId: string): Promise<void> {
    if (!activeUser || !hasRole(activeUser, 'member')) return;

    const payment = workspace?.payments.find((item) => item.id === paymentId);
    if (!payment || !canSubmitPrepayment(payment)) return;

    await submitPrepaymentAction({
      workspace,
      payment,
      plan: activePlanByMemberId.get(payment.member_id),
      months: prepaymentMonthsFor(paymentId),
      isLocalMode,
      activeUserId,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace,
      setMessage,
      now: new Date().toISOString(),
      createId,
      userName,
      prepaymentPeriodLabel
    });
  }

  return {
    decidePaymentDelay,
    deleteMemberPayment,
    requestPaymentDelay,
    saveMemberPayment,
    submitPaymentConfirmation,
    submitPrepayment,
    updateDelayDraft,
    updatePaymentStatus
  };
}
