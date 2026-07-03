import type { FormEvent } from 'react';
import type { AppUser } from '@shared/types/domain';
import { ModalCloseButton } from '@shared/ui/ModalCloseButton';
import type { GroupDraft } from './types';

type GroupFormModalProps = {
  draft: GroupDraft;
  trainers: AppUser[];
  weekDays: string[];
  isOwner: boolean;
  isEditing: boolean;
  isOpen: boolean;
  isPending: boolean;
  submitLabel: string;
  trainerName: (trainerId: string) => string;
  onDraftChange: (patch: Partial<GroupDraft>) => void;
  onToggleDay: (day: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onCancelEdit: () => void;
};

export function GroupFormModal({
  draft,
  trainers,
  weekDays,
  isOwner,
  isEditing,
  isOpen,
  isPending,
  submitLabel,
  trainerName,
  onDraftChange,
  onToggleDay,
  onSubmit,
  onClose,
  onCancelEdit
}: GroupFormModalProps): React.ReactElement {
  return (
    <form className={`crm-panel crm-side-form form-stack${isOpen ? ' mobile-form-open' : ''}`} onSubmit={onSubmit}>
      <div className="crm-panel-header">
        <div>
          <h2>Новая группа</h2>
          <p>Одно направление и расписание</p>
        </div>
        <ModalCloseButton
          label="Закрыть форму"
          onClick={isEditing ? onCancelEdit : onClose}
        />
      </div>
      {isOwner ? (
        <label>
          Ответственный тренер
          <select
            required
            value={draft.trainerId}
            onChange={(event) => onDraftChange({ trainerId: event.target.value })}
          >
            <option value="">Выберите тренера</option>
            {trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainerName(trainer.id)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Вид деятельности
        <input
          placeholder="Например, ММА или грепплинг"
          required
          value={draft.activity}
          onChange={(event) => onDraftChange({ activity: event.target.value })}
        />
      </label>
      <label>
        Дни
        <div className="weekday-grid">
          {weekDays.map((day) => {
            const selected = draft.days.split(', ').includes(day);
            return (
              <label key={day} className={selected ? 'weekday-checkbox selected' : 'weekday-checkbox'}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleDay(day)}
                />
                {day}
              </label>
            );
          })}
        </div>
      </label>
      <label>
        Время
        <input
          type="time"
          required
          value={draft.time}
          onChange={(event) => onDraftChange({ time: event.target.value })}
        />
      </label>
      <div className="split-fields">
        <label>
          Сумма абонемента <span className="optional-label">необязательно</span>
          <input
            min="1"
            step="0.01"
            type="number"
            placeholder="2500"
            value={draft.defaultAmount}
            onChange={(event) => onDraftChange({ defaultAmount: event.target.value })}
          />
        </label>
        <label>
          День оплаты
          <input
            max="31"
            min="1"
            type="number"
            value={draft.defaultBillingDay}
            onChange={(event) => onDraftChange({ defaultBillingDay: event.target.value })}
          />
        </label>
      </div>
      <label>
        Комментарий <span className="optional-label">необязательно</span>
        <input
          placeholder="Зал, возраст или уровень"
          value={draft.note}
          onChange={(event) => onDraftChange({ note: event.target.value })}
        />
      </label>
      <div className={isEditing ? 'form-actions full-width-actions group-form-actions editing' : 'form-actions full-width-actions group-form-actions'}>
        <button
          className="primary-button full-width-button"
          type="submit"
          disabled={isPending}
        >
          {submitLabel}
        </button>
        {isEditing ? (
          <button className="ghost-button group-cancel-button" type="button" onClick={onCancelEdit}>
            Отменить
          </button>
        ) : null}
      </div>
    </form>
  );
}
