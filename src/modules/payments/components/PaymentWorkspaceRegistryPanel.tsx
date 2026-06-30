import type { Dispatch, SetStateAction } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { formatMoney } from '@shared/constants/app';
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
import type {
  PaymentActionGroup,
  PaymentActionGroupId,
  PaymentView
} from '../model/selectors';
import { PaymentRegistryRow } from './PaymentRegistryRow';

type PaymentWorkspaceRegistryPanelProps = {
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
  planLabels: Record<BillingPlanType, string>;
  statusLabels: Record<PaymentRequestStatus | 'not-set', string>;
  userName: (userId: string) => string;
  groupFor: (memberId: string) => LocalTrainingGroup | null;
  formatShortDate: (date?: string | null) => string;
  setPaymentView: (view: PaymentView) => void;
  setPaymentSearch: (search: string) => void;
  setPaymentActionGroupsOpen: Dispatch<SetStateAction<Record<string, boolean>>>;
  setSelectedPaymentMemberId: (memberId: string) => void;
  setPaymentEditOpen: (open: boolean) => void;
};

export function PaymentWorkspaceRegistryPanel({
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
  planLabels,
  statusLabels,
  userName,
  groupFor,
  formatShortDate,
  setPaymentView,
  setPaymentSearch,
  setPaymentActionGroupsOpen,
  setSelectedPaymentMemberId,
  setPaymentEditOpen
}: PaymentWorkspaceRegistryPanelProps): React.ReactElement {
  const selectPaymentMember = (memberId: string): void => {
    setSelectedPaymentMemberId(memberId);
    setPaymentEditOpen(false);
  };

  const renderPaymentRow = (member: AppUser): React.ReactElement => {
    const payment = currentPaymentByMemberId.get(member.id);
    const plan = activePlanByMemberId.get(member.id);
    const group = groupFor(member.id);

    return (
      <PaymentRegistryRow
        key={member.id}
        memberName={userName(member.id)}
        payment={payment}
        plan={plan}
        group={group}
        isSelected={selectedPaymentMemberId === member.id}
        planLabels={planLabels}
        statusLabels={statusLabels}
        formatShortDate={formatShortDate}
        onSelect={() => selectPaymentMember(member.id)}
      />
    );
  };

  return (
    <div className="crm-panel payments-registry">
      <div className="payments-toolbar">
        <div className="payment-view-tabs" role="tablist" aria-label="Фильтр оплат">
          <button className={paymentView === 'all' ? 'active' : ''} type="button" onClick={() => setPaymentView('all')}>
            Все <span>{visibleMembers.length}</span>
          </button>
          <button className={paymentView === 'actions' ? 'active' : ''} type="button" onClick={() => setPaymentView('actions')}>
            Действия <span>{paymentActionCount}</span>
          </button>
          <button className={paymentView === 'overdue' ? 'active' : ''} type="button" onClick={() => setPaymentView('overdue')}>
            Просрочено <span>{overduePaymentCount}</span>
          </button>
          <button className={paymentView === 'paid' ? 'active' : ''} type="button" onClick={() => setPaymentView('paid')}>
            История
          </button>
        </div>
        <label className="payments-search">
          <Search size={17} />
          <input
            aria-label="Поиск ученика"
            placeholder="Найти ученика"
            value={paymentSearch}
            onChange={(event) => setPaymentSearch(event.target.value)}
          />
        </label>
      </div>

      {paymentView === 'paid' ? (
        <div className="payments-history-list">
          {paidPaymentResults.map((payment) => (
            <button
              className="payment-registry-row history"
              key={payment.id}
              type="button"
              onClick={() => selectPaymentMember(payment.member_id)}
            >
              <div className="payment-person">
                <strong>{userName(payment.member_id)}</strong>
                <span>{payment.period_label ?? payment.due_date}</span>
              </div>
              <strong className="payment-amount">{formatMoney(payment.amount)}</strong>
              <span className="payment-due">{payment.paid_at ? new Date(payment.paid_at).toLocaleDateString('ru-RU') : 'Подтверждено'}</span>
              <span className="status-pill paid">Оплачено</span>
              <ChevronRight className="payment-row-arrow" size={18} />
            </button>
          ))}
          {paidPaymentResults.length === 0 ? (
            <div className="empty-state action-empty">
              <p>
                {paymentSearch.trim()
                  ? 'По этому поиску подтверждённых оплат нет.'
                  : 'Подтверждённых оплат пока нет.'}
              </p>
              <button className="small-button secondary" type="button" onClick={() => setPaymentView('all')}>
                Все оплаты
              </button>
            </div>
          ) : null}
        </div>
      ) : paymentView === 'actions' ? (
        <div className="payment-action-groups">
          {visiblePaymentActionGroups.map((group) => {
            const groupOpen = paymentActionGroupsOpen[group.id] ?? group.members.length > 0;
            return (
              <section className={`payment-action-group ${groupOpen ? 'open' : ''}`} key={group.id}>
                <button
                  className="payment-action-group-header"
                  type="button"
                  onClick={() =>
                    setPaymentActionGroupsOpen((current) => ({
                      ...current,
                      [group.id as PaymentActionGroupId]: !groupOpen
                    }))
                  }
                >
                  <ChevronRight className={groupOpen ? 'open' : ''} size={18} />
                  <div>
                    <h3>{group.title}</h3>
                    <p>{group.description}</p>
                  </div>
                  <strong>{group.members.length}</strong>
                </button>
                {groupOpen && group.members.length > 0 ? (
                  <div className="payment-registry-list compact">
                    {group.members.map((member) => renderPaymentRow(member))}
                  </div>
                ) : null}
              </section>
            );
          })}
          {visiblePaymentActionGroups.length === 0 ? (
            <div className="empty-state action-empty">
              <p>
                {paymentSearch.trim()
                  ? 'По этому поиску задач по оплатам нет.'
                  : 'Сейчас нет задач по оплатам.'}
              </p>
              <button className="small-button secondary" type="button" onClick={() => setPaymentView('all')}>
                Все оплаты
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="payment-registry-list">
          <div className="payment-registry-head">
            <span>Ученик</span>
            <span>Сумма</span>
            <span>Срок</span>
            <span>Статус</span>
            <span />
          </div>
          {filteredPaymentMembers.map((member) => renderPaymentRow(member))}
          {filteredPaymentMembers.length === 0 ? (
            <div className="empty-state action-empty">
              <p>
                {visibleMembers.length === 0 ? 'Ученики ещё не добавлены.' : 'По этому фильтру оплат нет.'}
              </p>
              {paymentView !== 'all' ? (
                <button className="small-button secondary" type="button" onClick={() => setPaymentView('all')}>
                  Все оплаты
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
