import type {
  LocalExpense,
  LocalWorkspace
} from '@shared/lib/localWorkspace';

type ExpenseDraftLike = {
  name: string;
  amount: string;
  dueDate: string;
  type: 'recurring' | 'one_time';
};

export function createExpenseAction({
  workspace,
  draft,
  now,
  createId,
  periodLabel
}: {
  workspace: LocalWorkspace | null;
  draft: ExpenseDraftLike;
  now: string;
  createId: () => string;
  periodLabel: (date: string) => string;
}): { workspace: LocalWorkspace; message: string } | { error: string } | null {
  if (!workspace) return null;

  const amount = Number(draft.amount);
  if (!draft.name.trim() || amount <= 0 || !draft.dueDate) {
    return { error: 'Укажите название, сумму и срок расхода.' };
  }

  const expense: LocalExpense = {
    id: createId(),
    name: draft.name.trim(),
    amount,
    dueDate: draft.dueDate,
    type: draft.type,
    status: 'pending',
    periodLabel: periodLabel(draft.dueDate),
    isCurrent: true,
    paidAt: null,
    createdAt: now
  };

  return {
    workspace: {
      ...workspace,
      expenses: [...workspace.expenses, expense]
    },
    message: 'Расход добавлен.'
  };
}

export function markExpensePaidAction({
  workspace,
  expenseId,
  now,
  createId,
  nextMonthDate,
  periodLabel
}: {
  workspace: LocalWorkspace | null;
  expenseId: string;
  now: string;
  createId: () => string;
  nextMonthDate: (date: string, billingDay: number) => string;
  periodLabel: (date: string) => string;
}): { workspace: LocalWorkspace; message: string } | null {
  if (!workspace) return null;

  const expense = workspace.expenses.find((item) => item.id === expenseId);
  if (!expense) return null;

  const nextDueDate =
    expense.type === 'recurring'
      ? nextMonthDate(expense.dueDate, new Date(`${expense.dueDate}T12:00:00`).getDate())
      : null;
  const nextExpense: LocalExpense | null = nextDueDate
    ? {
        ...expense,
        id: createId(),
        dueDate: nextDueDate,
        status: 'pending',
        periodLabel: periodLabel(nextDueDate),
        isCurrent: true,
        paidAt: null,
        createdAt: now
      }
    : null;

  return {
    workspace: {
      ...workspace,
      expenses: [
        ...workspace.expenses.map((item) =>
          item.id === expenseId
            ? {
                ...item,
                status: 'paid' as const,
                paidAt: now,
                isCurrent: false
              }
            : item
        ),
        ...(nextExpense ? [nextExpense] : [])
      ]
    },
    message: nextExpense
      ? 'Расход оплачен, следующий месяц создан.'
      : 'Расход оплачен.'
  };
}
