import type {
  BillingPlanType,
  PaymentRequestStatus,
  TrainingFormat
} from '@shared/types/domain';
import type {
  ExpenseDraft,
  GroupDraft,
  PersonDraft
} from './types';

export const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const emptyPersonDraft: PersonDraft = {
  role: 'trainer',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  username: '',
  password: '',
  groupId: '',
  paymentType: 'monthly',
  trainingFormat: 'group',
  initialAmount: '',
  initialDueDate: ''
};

export const emptyExpenseDraft: ExpenseDraft = {
  name: '',
  amount: '',
  dueDate: '',
  type: 'recurring'
};

export const emptyGroupDraft: GroupDraft = {
  activity: '',
  days: '',
  time: '',
  note: '',
  trainerId: '',
  defaultAmount: '',
  defaultBillingDay: '5'
};

export const statusLabels: Record<PaymentRequestStatus | 'not-set', string> = {
  active: 'Активна',
  delay_requested: 'Запрошена отсрочка',
  delayed: 'Отсрочена',
  payment_confirmation: 'Ожидает подтверждения',
  paid: 'Оплачено',
  overdue: 'Просрочено',
  'not-set': 'Не назначена'
};

export const planLabels: Record<BillingPlanType, string> = {
  monthly: 'Абонемент',
  one_time: 'Разовая оплата'
};

export const formatLabels: Record<TrainingFormat, string> = {
  group: 'Группа',
  individual: 'Индивидуально'
};
