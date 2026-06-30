'use client';

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import type { LocalBillingPlan } from '@shared/lib/localWorkspace';
import type {
  BillingPlanType,
  PaymentRequest,
  TrainingFormat
} from '@shared/types/domain';
import {
  delayDraftForPayment,
  mergeDelayDraft,
  mergePaymentEdit,
  paymentEditForMember,
  prepaymentMonthsForPayment,
  removePaymentEdit,
  type PaymentView
} from './selectors';

export type PaymentEditState = {
  type: BillingPlanType;
  trainingFormat: TrainingFormat;
  individualTerms: boolean;
  currentAmount: string;
  dueDate: string;
  updateFuture: boolean;
};

export type DelayDraftState = {
  requestedDate: string;
  comment: string;
};

const emptyPaymentEdit: PaymentEditState = {
  type: 'monthly',
  trainingFormat: 'group',
  individualTerms: false,
  currentAmount: '',
  dueDate: '',
  updateFuture: false
};

export type PaymentUiState = {
  paymentEdits: Record<string, PaymentEditState>;
  setPaymentEdits: Dispatch<SetStateAction<Record<string, PaymentEditState>>>;
  paymentView: PaymentView;
  setPaymentView: Dispatch<SetStateAction<PaymentView>>;
  paymentSearch: string;
  setPaymentSearch: Dispatch<SetStateAction<string>>;
  selectedPaymentMemberId: string;
  setSelectedPaymentMemberId: Dispatch<SetStateAction<string>>;
  paymentEditOpen: boolean;
  setPaymentEditOpen: Dispatch<SetStateAction<boolean>>;
  paymentActionGroupsOpen: Record<string, boolean>;
  setPaymentActionGroupsOpen: Dispatch<SetStateAction<Record<string, boolean>>>;
  setPrepaymentMonths: Dispatch<SetStateAction<Record<string, number>>>;
  paymentEditFor: (memberId: string) => PaymentEditState;
  updatePaymentEdit: (memberId: string, patch: Partial<PaymentEditState>) => void;
  clearPaymentEdit: (memberId: string) => void;
  delayDraftFor: (payment: PaymentRequest) => DelayDraftState;
  updateDelayDraft: (payment: PaymentRequest, patch: Partial<DelayDraftState>) => void;
  prepaymentMonthsFor: (paymentId: string) => number;
  openPaymentsView: (view: PaymentView) => void;
  selectPaymentMember: (memberId: string, view?: PaymentView) => void;
};

export function usePaymentUiState({
  currentPaymentByMemberId,
  activePlanByMemberId
}: {
  currentPaymentByMemberId: Map<string, PaymentRequest>;
  activePlanByMemberId: Map<string, LocalBillingPlan>;
}): PaymentUiState {
  const [paymentEdits, setPaymentEdits] = useState<Record<string, PaymentEditState>>({});
  const [delayDrafts, setDelayDrafts] = useState<Record<string, DelayDraftState>>({});
  const [prepaymentMonths, setPrepaymentMonths] = useState<Record<string, number>>({});
  const [paymentView, setPaymentView] = useState<PaymentView>('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [selectedPaymentMemberId, setSelectedPaymentMemberId] = useState('');
  const [paymentEditOpen, setPaymentEditOpen] = useState(false);
  const [paymentActionGroupsOpen, setPaymentActionGroupsOpen] = useState<Record<string, boolean>>({});

  const paymentEditFor = useCallback(
    (memberId: string): PaymentEditState =>
      paymentEditForMember({
        edits: paymentEdits,
        memberId,
        payment: currentPaymentByMemberId.get(memberId),
        plan: activePlanByMemberId.get(memberId),
        fallback: emptyPaymentEdit
      }),
    [activePlanByMemberId, currentPaymentByMemberId, paymentEdits]
  );

  const updatePaymentEdit = useCallback(
    (memberId: string, patch: Partial<PaymentEditState>): void => {
      setPaymentEdits((current) =>
        mergePaymentEdit({
          edits: current,
          memberId,
          currentEdit: paymentEditFor(memberId),
          patch
        })
      );
    },
    [paymentEditFor]
  );

  const clearPaymentEdit = useCallback((memberId: string): void => {
    setPaymentEdits((current) => removePaymentEdit(current, memberId));
  }, []);

  const delayDraftFor = useCallback(
    (payment: PaymentRequest): DelayDraftState => delayDraftForPayment({ drafts: delayDrafts, payment }),
    [delayDrafts]
  );

  const updateDelayDraft = useCallback(
    (payment: PaymentRequest, patch: Partial<DelayDraftState>): void => {
      setDelayDrafts((current) =>
        mergeDelayDraft({
          drafts: current,
          paymentId: payment.id,
          currentDraft: delayDraftFor(payment),
          patch
        })
      );
    },
    [delayDraftFor]
  );

  const prepaymentMonthsFor = useCallback(
    (paymentId: string): number => prepaymentMonthsForPayment(prepaymentMonths, paymentId),
    [prepaymentMonths]
  );

  const openPaymentsView = useCallback((view: PaymentView): void => {
    setPaymentView(view);
    setSelectedPaymentMemberId('');
    setPaymentEditOpen(false);
  }, []);

  const selectPaymentMember = useCallback((memberId: string, view?: PaymentView): void => {
    if (view) setPaymentView(view);
    setSelectedPaymentMemberId(memberId);
    setPaymentEditOpen(false);
  }, []);

  return {
    paymentEdits,
    setPaymentEdits,
    paymentView,
    setPaymentView,
    paymentSearch,
    setPaymentSearch,
    selectedPaymentMemberId,
    setSelectedPaymentMemberId,
    paymentEditOpen,
    setPaymentEditOpen,
    paymentActionGroupsOpen,
    setPaymentActionGroupsOpen,
    setPrepaymentMonths,
    paymentEditFor,
    updatePaymentEdit,
    clearPaymentEdit,
    delayDraftFor,
    updateDelayDraft,
    prepaymentMonthsFor,
    openPaymentsView,
    selectPaymentMember
  };
}
