import { useMemo } from 'react';
import type {
  LocalTrainingGroup,
  LocalTrainingSchedule
} from '@shared/lib/localWorkspace';
import type { AppUser, PaymentRequest } from '@shared/types/domain';
import type {
  DelayDraftLike,
  PaymentTask,
  PaymentView
} from '@/modules/payments';
import {
  buildPaymentTasks,
  paymentTaskHeadline
} from '@/modules/payments';

type PaymentOverviewLike = {
  currentPayments: PaymentRequest[];
  confirmationPayments: PaymentRequest[];
  delayRequestedPayments: PaymentRequest[];
  overduePayments: PaymentRequest[];
  delayedPayments: PaymentRequest[];
  paidAmount: number;
};

type UseOverviewControllerOptions = {
  activeUser: AppUser | null;
  activeMemberPayment: PaymentRequest | null;
  activeMemberTrainer: AppUser | null;
  activeMemberGroup: LocalTrainingGroup | null;
  activeMemberSchedule: LocalTrainingSchedule | null;
  delayDraftFor: (payment: PaymentRequest) => DelayDraftLike;
  isPendingAction: (key: string) => boolean;
  openOverviewInviteFlow: () => void;
  openPaymentsView: (view: PaymentView) => void;
  openPrepayment: (payment: PaymentRequest) => void;
  paymentOverview: PaymentOverviewLike;
  requestPaymentDelay: (paymentId: string) => void;
  submitPaymentConfirmation: (paymentId: string) => void;
  updateDelayDraft: (paymentId: string, patch: Partial<DelayDraftLike>) => void;
  visibleGroups: LocalTrainingGroup[];
};

type OverviewTask = PaymentTask & {
  onClick: () => void;
};

type OverviewController = {
  activeUser: AppUser;
  activeMemberPayment: PaymentRequest | null;
  activeMemberTrainer: AppUser | null;
  activeMemberGroup: LocalTrainingGroup | null;
  activeMemberSchedule: LocalTrainingSchedule | null;
  currentPayments: PaymentRequest[];
  delayDraftFor: (payment: PaymentRequest) => DelayDraftLike;
  delayedPayments: PaymentRequest[];
  delayRequestedPayments: PaymentRequest[];
  isPendingAction: (key: string) => boolean;
  openOverviewInviteFlow: () => void;
  openPaymentsView: (view: PaymentView) => void;
  openPrepayment: (payment: PaymentRequest) => void;
  overduePayments: PaymentRequest[];
  paidAmount: number;
  requestPaymentDelay: (paymentId: string) => void;
  submitPaymentConfirmation: (paymentId: string) => void;
  todayTasks: OverviewTask[];
  todayTaskCount: number;
  todayTaskHeadline: string;
  updateDelayDraft: (paymentId: string, patch: Partial<DelayDraftLike>) => void;
  visibleGroups: LocalTrainingGroup[];
};

export function useOverviewController({
  activeUser,
  activeMemberPayment,
  activeMemberTrainer,
  activeMemberGroup,
  activeMemberSchedule,
  delayDraftFor,
  isPendingAction,
  openOverviewInviteFlow,
  openPaymentsView,
  openPrepayment,
  paymentOverview,
  requestPaymentDelay,
  submitPaymentConfirmation,
  updateDelayDraft,
  visibleGroups
}: UseOverviewControllerOptions): OverviewController | null {
  const todayTasks = useMemo(
    () =>
      buildPaymentTasks({
        confirmationPayments: paymentOverview.confirmationPayments,
        delayRequestedPayments: paymentOverview.delayRequestedPayments,
        overduePayments: paymentOverview.overduePayments
      }).map((task) => ({
        ...task,
        onClick: () => openPaymentsView(task.id === 'overdue' ? 'overdue' : 'actions')
      })),
    [
      openPaymentsView,
      paymentOverview.confirmationPayments,
      paymentOverview.delayRequestedPayments,
      paymentOverview.overduePayments
    ]
  );
  const todayTaskCount = todayTasks.reduce((sum, task) => sum + task.count, 0);

  if (!activeUser) return null;

  return {
    activeUser,
    activeMemberPayment,
    activeMemberTrainer,
    activeMemberGroup,
    activeMemberSchedule,
    currentPayments: paymentOverview.currentPayments,
    delayDraftFor,
    delayedPayments: paymentOverview.delayedPayments,
    delayRequestedPayments: paymentOverview.delayRequestedPayments,
    isPendingAction,
    openOverviewInviteFlow,
    openPaymentsView,
    openPrepayment,
    overduePayments: paymentOverview.overduePayments,
    paidAmount: paymentOverview.paidAmount,
    requestPaymentDelay,
    submitPaymentConfirmation,
    todayTasks,
    todayTaskCount,
    todayTaskHeadline: paymentTaskHeadline(todayTaskCount),
    updateDelayDraft,
    visibleGroups
  };
}
