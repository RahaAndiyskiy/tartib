import { ChevronRight } from 'lucide-react';
import { formatMoney } from '@shared/constants/app';
import type {
  LocalBillingPlan,
  LocalTrainingGroup
} from '@shared/lib/localWorkspace';
import type { PaymentRequest } from '@shared/types/domain';
import {
  planLabels,
  statusLabels
} from './constants';
import { formatShortDate } from './utils';

type PaymentRegistryRowProps = {
  memberName: string;
  payment?: PaymentRequest;
  plan?: LocalBillingPlan;
  group?: LocalTrainingGroup | null;
  isSelected: boolean;
  onSelect: () => void;
};

export function PaymentRegistryRow({
  memberName,
  payment,
  plan,
  group,
  isSelected,
  onSelect
}: PaymentRegistryRowProps): React.ReactElement {
  return (
    <button
      className={`payment-registry-row ${isSelected ? 'selected' : ''}`}
      type="button"
      onClick={onSelect}
    >
      <div className="payment-person">
        <strong>{memberName}</strong>
        <span>
          {group ? group.activity : 'Без группы'}
          {plan ? ` · ${planLabels[plan.type]}` : ' · условия не настроены'}
        </span>
      </div>
      <strong className="payment-amount">{payment ? formatMoney(payment.amount) : '—'}</strong>
      <span className="payment-due">{formatShortDate(payment?.due_date)}</span>
      <span className={`status-pill ${payment?.status ?? 'not-set'}`}>{statusLabels[payment?.status ?? 'not-set']}</span>
      <ChevronRight className="payment-row-arrow" size={18} />
    </button>
  );
}
