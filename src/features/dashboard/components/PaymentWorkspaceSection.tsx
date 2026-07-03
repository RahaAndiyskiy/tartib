import type { Dispatch, SetStateAction } from 'react';
import type {
  LocalBillingPlan,
  LocalTrainingGroup
} from '@shared/lib/localWorkspace';
import type {
  AppUser,
  BillingPlanType,
  PaymentRequest,
  PaymentRequestStatus
} from '@shared/types/domain';
import { hasRole } from '@/core/roles';
import {
  PaymentDrawer,
  PaymentWorkspaceRegistryPanel,
  type DelayDraftLike,
  type PaymentActionGroup,
  type PaymentEditFormValue,
  type PaymentView
} from '@/modules/payments';

type PaymentWorkspaceSectionProps = {
  activeUser: AppUser;
  paymentView: PaymentView;
  paymentSearch: string;
  visibleMembers: AppUser[];
  filteredPaymentMembers: AppUser[];
  visiblePaymentActionGroups: PaymentActionGroup[];
  paidPaymentResults: PaymentRequest[];
  paymentActionCount: number;
  overduePaymentCount: number;
  paymentActionGroupsOpen: Record<string, boolean>;
  currentPaymentByMemberId: Map<string, PaymentRequest>;
  activePlanByMemberId: Map<string, LocalBillingPlan>;
  selectedPaymentMemberId: string;
  selectedPaymentMember: AppUser | null;
  selectedPayment?: PaymentRequest | null;
  selectedPaymentPlan?: LocalBillingPlan | null;
  selectedPaymentGroup?: LocalTrainingGroup | null;
  selectedPaymentHistory: PaymentRequest[];
  selectedPaymentHistoryOpen: boolean;
  paymentEditOpen: boolean;
  statusLabels: Record<PaymentRequestStatus | 'not-set', string>;
  planLabels: Record<BillingPlanType, string>;
  userName: (userId: string) => string;
  groupFor: (memberId: string) => LocalTrainingGroup | null;
  formatShortDate: (date?: string | null) => string;
  todayString: () => string;
  prepaymentPeriodLabel: (date: string, months: number) => string;
  canSubmitPayment: (payment: PaymentRequest) => boolean;
  canSubmitPrepayment: (payment: PaymentRequest) => boolean;
  paymentLockedText: (payment: PaymentRequest) => string | null;
  delayDraftFor: (payment: PaymentRequest) => DelayDraftLike;
  updateDelayDraft: (paymentId: string, patch: Partial<DelayDraftLike>) => void;
  prepaymentMonthsFor: (paymentId: string) => number;
  setPrepaymentMonths: Dispatch<SetStateAction<Record<string, number>>>;
  setHistoryOpenByMember: Dispatch<SetStateAction<Record<string, boolean>>>;
  setPaymentView: (view: PaymentView) => void;
  setPaymentSearch: (search: string) => void;
  setPaymentActionGroupsOpen: Dispatch<SetStateAction<Record<string, boolean>>>;
  setSelectedPaymentMemberId: (memberId: string) => void;
  setPaymentEditOpen: (open: boolean) => void;
  isPendingAction: (key: string) => boolean;
  buttonLabel: (key: string, label: string) => string;
  paymentEditFor: (memberId: string) => PaymentEditFormValue;
  updatePaymentEdit: (memberId: string, patch: Partial<PaymentEditFormValue>) => void;
  saveMemberPayment: (memberId: string) => void;
  updatePaymentStatus: (paymentId: string, status: PaymentRequestStatus) => void;
  decidePaymentDelay: (paymentId: string, approved: boolean) => void;
  submitPaymentConfirmation: (paymentId: string) => void;
  requestPaymentDelay: (paymentId: string) => void;
  openPrepayment: (payment: PaymentRequest) => void;
  submitPrepayment: (paymentId: string) => void;
  deleteMemberPayment: (payment: PaymentRequest) => void;
};

export function PaymentWorkspaceSection({
  activeUser,
  paymentView,
  paymentSearch,
  visibleMembers,
  filteredPaymentMembers,
  visiblePaymentActionGroups,
  paidPaymentResults,
  paymentActionCount,
  overduePaymentCount,
  paymentActionGroupsOpen,
  currentPaymentByMemberId,
  activePlanByMemberId,
  selectedPaymentMemberId,
  selectedPaymentMember,
  selectedPayment,
  selectedPaymentPlan,
  selectedPaymentGroup,
  selectedPaymentHistory,
  selectedPaymentHistoryOpen,
  paymentEditOpen,
  statusLabels,
  planLabels,
  userName,
  groupFor,
  formatShortDate,
  todayString,
  prepaymentPeriodLabel,
  canSubmitPayment,
  canSubmitPrepayment,
  paymentLockedText,
  delayDraftFor,
  updateDelayDraft,
  prepaymentMonthsFor,
  setPrepaymentMonths,
  setHistoryOpenByMember,
  setPaymentView,
  setPaymentSearch,
  setPaymentActionGroupsOpen,
  setSelectedPaymentMemberId,
  setPaymentEditOpen,
  isPendingAction,
  buttonLabel,
  paymentEditFor,
  updatePaymentEdit,
  saveMemberPayment,
  updatePaymentStatus,
  decidePaymentDelay,
  submitPaymentConfirmation,
  requestPaymentDelay,
  openPrepayment,
  submitPrepayment,
  deleteMemberPayment
}: PaymentWorkspaceSectionProps): React.ReactElement {
  return (
    <section className="payments-workspace">
      {/* Реестр отвечает за поиск и выбор ученика; детали выбранной оплаты открываются отдельно. */}
      <PaymentWorkspaceRegistryPanel
        paymentView={paymentView}
        paymentSearch={paymentSearch}
        visibleMembers={visibleMembers}
        filteredPaymentMembers={filteredPaymentMembers}
        visiblePaymentActionGroups={visiblePaymentActionGroups}
        paidPaymentResults={paidPaymentResults}
        paymentActionCount={paymentActionCount}
        overduePaymentCount={overduePaymentCount}
        paymentActionGroupsOpen={paymentActionGroupsOpen}
        currentPaymentByMemberId={currentPaymentByMemberId}
        activePlanByMemberId={activePlanByMemberId}
        selectedPaymentMemberId={selectedPaymentMemberId}
        planLabels={planLabels}
        statusLabels={statusLabels}
        userName={userName}
        groupFor={groupFor}
        formatShortDate={formatShortDate}
        setPaymentView={setPaymentView}
        setPaymentSearch={setPaymentSearch}
        setPaymentActionGroupsOpen={setPaymentActionGroupsOpen}
        setSelectedPaymentMemberId={setSelectedPaymentMemberId}
        setPaymentEditOpen={setPaymentEditOpen}
      />
      {/* Drawer содержит весь сценарий конкретного счёта и не усложняет основной список. */}
      {selectedPaymentMember ? (
        <PaymentDrawer
          activeUser={activeUser}
          selectedPaymentMember={selectedPaymentMember}
          selectedPayment={selectedPayment}
          selectedPaymentPlan={selectedPaymentPlan}
          selectedPaymentGroup={selectedPaymentGroup}
          selectedPaymentHistory={selectedPaymentHistory}
          selectedPaymentHistoryOpen={selectedPaymentHistoryOpen}
          paymentEditOpen={paymentEditOpen}
          paymentEdit={paymentEditFor(selectedPaymentMember.id)}
          statusLabels={statusLabels}
          planLabels={planLabels}
          userName={userName}
          formatShortDate={formatShortDate}
          todayString={todayString}
          prepaymentPeriodLabel={prepaymentPeriodLabel}
          canManagePayments={hasRole(activeUser, 'owner') || hasRole(activeUser, 'trainer')}
          canSubmitPayment={canSubmitPayment}
          canSubmitPrepayment={canSubmitPrepayment}
          paymentLockedText={paymentLockedText}
          delayDraftFor={delayDraftFor}
          updateDelayDraft={updateDelayDraft}
          prepaymentMonthsFor={prepaymentMonthsFor}
          setPrepaymentMonths={setPrepaymentMonths}
          setHistoryOpenByMember={setHistoryOpenByMember}
          isPendingAction={isPendingAction}
          buttonLabel={buttonLabel}
          onClose={() => setSelectedPaymentMemberId('')}
          onEditOpenChange={setPaymentEditOpen}
          onEditChange={updatePaymentEdit}
          onSavePayment={saveMemberPayment}
          onUpdatePaymentStatus={updatePaymentStatus}
          onDecidePaymentDelay={decidePaymentDelay}
          onSubmitPaymentConfirmation={submitPaymentConfirmation}
          onRequestPaymentDelay={requestPaymentDelay}
          onOpenPrepayment={openPrepayment}
          onSubmitPrepayment={submitPrepayment}
          onDeletePayment={deleteMemberPayment}
        />
      ) : null}
    </section>
  );
}
