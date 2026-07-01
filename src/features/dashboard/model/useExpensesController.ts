import type { FormEvent } from 'react';
import { useState } from 'react';
import {
  createExpenseAction,
  markExpensePaidAction
} from '@/modules/expenses';
import { emptyExpenseDraft } from '../constants';
import type { ExpenseDraft } from '../types';
import type { LocalWorkspace } from '@shared/lib/localWorkspace';

type UseExpensesControllerOptions = {
  createId: () => string;
  nextMonthDate: (date: string, billingDay: number) => string;
  periodLabel: (date: string) => string;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setMessage: (message: string) => void;
  workspace: LocalWorkspace | null;
};

type ExpensesController = {
  createExpense: (event: FormEvent<HTMLFormElement>) => void;
  expenseDraft: ExpenseDraft;
  markExpensePaid: (expenseId: string) => void;
  setExpenseDraft: React.Dispatch<React.SetStateAction<ExpenseDraft>>;
};

export function useExpensesController({
  createId,
  nextMonthDate,
  periodLabel,
  saveWorkspace,
  setMessage,
  workspace
}: UseExpensesControllerOptions): ExpensesController {
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(emptyExpenseDraft);

  function createExpense(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const result = createExpenseAction({
      workspace,
      draft: expenseDraft,
      now: new Date().toISOString(),
      createId,
      periodLabel
    });

    if (!result) return;
    if ('error' in result) {
      setMessage(result.error);
      return;
    }

    saveWorkspace(result.workspace);
    setExpenseDraft(emptyExpenseDraft);
    setMessage(result.message);
  }

  function markExpensePaid(expenseId: string): void {
    const result = markExpensePaidAction({
      workspace,
      expenseId,
      now: new Date().toISOString(),
      createId,
      nextMonthDate,
      periodLabel
    });

    if (!result) return;
    saveWorkspace(result.workspace);
    setMessage(result.message);
  }

  return {
    createExpense,
    expenseDraft,
    markExpensePaid,
    setExpenseDraft
  };
}
