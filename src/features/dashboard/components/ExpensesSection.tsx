import type { FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { LocalExpense, LocalWorkspace } from '@shared/lib/localWorkspace';
import { formatMoney } from '@shared/constants/app';
import type { ExpenseDraft } from '../types';

type ExpensesSectionProps = {
  workspace: LocalWorkspace;
  currentExpenses: LocalExpense[];
  paidExpenses: number;
  pendingExpenses: number;
  expenseDraft: ExpenseDraft;
  onExpenseDraftChange: (draft: ExpenseDraft | ((current: ExpenseDraft) => ExpenseDraft)) => void;
  onCreateExpense: (event: FormEvent<HTMLFormElement>) => void;
  onMarkExpensePaid: (expenseId: string) => void;
};

export function ExpensesSection({
  workspace,
  currentExpenses,
  paidExpenses,
  pendingExpenses,
  expenseDraft,
  onExpenseDraftChange,
  onCreateExpense,
  onMarkExpensePaid
}: ExpensesSectionProps): React.ReactElement {
  return (
    <section className="crm-content-grid">
      <div className="crm-panel">
        <div className="crm-panel-header">
          <div>
            <h2>Расходы клуба</h2>
            <p>Текущие обязательства и история</p>
          </div>
          <div className="metric-inline">
            <span>К оплате</span>
            <strong>{formatMoney(pendingExpenses)}</strong>
          </div>
        </div>

        <div className="expense-table">
          <div className="expense-head">
            <span>Название</span><span>Тип</span><span>Сумма</span><span>Срок</span><span />
          </div>
          {currentExpenses.map((expense) => (
            <div className="expense-row" key={expense.id}>
              <div>
                <strong>{expense.name}</strong>
                <span>{expense.periodLabel}</span>
              </div>
              <span>{expense.type === 'recurring' ? 'Базовый ежемесячный' : 'Разовый'}</span>
              <strong>{formatMoney(expense.amount)}</strong>
              <span>{expense.dueDate}</span>
              <button className="small-button" type="button" onClick={() => onMarkExpensePaid(expense.id)}>
                Отметить оплаченным
              </button>
            </div>
          ))}
          {currentExpenses.length === 0 ? (
            <p className="empty-state">Текущих расходов пока нет.</p>
          ) : null}
        </div>

        <div className="payment-history">
          <div className="crm-panel-header">
            <div>
              <h2>История расходов</h2>
              <p>Всего оплачено: {formatMoney(paidExpenses)}</p>
            </div>
          </div>
          {[...workspace.expenses]
            .filter((expense) => expense.status === 'paid')
            .reverse()
            .map((expense) => (
              <div className="payment-history-row" key={expense.id}>
                <div>
                  <strong>{expense.name}</strong>
                  <span>{expense.periodLabel}</span>
                </div>
                <strong>{formatMoney(expense.amount)}</strong>
                <span>
                  {expense.paidAt
                    ? new Date(expense.paidAt).toLocaleDateString('ru-RU')
                    : 'Оплачено'}
                </span>
              </div>
            ))}
        </div>
      </div>

      <form className="crm-panel crm-side-form form-stack" onSubmit={onCreateExpense}>
        <div className="crm-panel-header">
          <div>
            <h2>Новый расход</h2>
            <p>Добавить обязательство клуба</p>
          </div>
          <Plus size={20} />
        </div>
        <label>
          Название
          <input
            placeholder="Например, аренда"
            required
            value={expenseDraft.name}
            onChange={(event) =>
              onExpenseDraftChange((current) => ({ ...current, name: event.target.value }))
            }
          />
        </label>
        <label>
          Сумма
          <input
            min="1"
            required
            step="0.01"
            type="number"
            value={expenseDraft.amount}
            onChange={(event) =>
              onExpenseDraftChange((current) => ({ ...current, amount: event.target.value }))
            }
          />
        </label>
        <label>
          Срок оплаты
          <input
            required
            type="date"
            value={expenseDraft.dueDate}
            onChange={(event) =>
              onExpenseDraftChange((current) => ({ ...current, dueDate: event.target.value }))
            }
          />
        </label>
        <label>
          Тип расхода
          <select
            value={expenseDraft.type}
            onChange={(event) =>
              onExpenseDraftChange((current) => ({
                ...current,
                type: event.target.value as ExpenseDraft['type']
              }))
            }
          >
            <option value="recurring">Базовый ежемесячный</option>
            <option value="one_time">Разовый</option>
          </select>
        </label>
        <button className="primary-button" type="submit">
          Добавить расход
        </button>
      </form>
    </section>
  );
}
