import type { FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { LocalTrainingGroup } from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import { hasRole } from '@/core/roles';
import { InviteResultCard } from '../InviteResultCard';
import type {
  MemberInviteResult,
  PersonDraft
} from '../types';

type PersonFormPanelProps = {
  activeUser: AppUser;
  draft: PersonDraft;
  groups: LocalTrainingGroup[];
  invite: MemberInviteResult | null;
  isLocalMode: boolean;
  isOpen: boolean;
  isMemberInviteForm: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onDraftChange: (patch: Partial<PersonDraft>) => void;
  onClearInvite: () => void;
  onCopyInvite: () => void;
  onCloseInvite: () => void;
  onShareInvite: () => void;
};

export function PersonFormPanel({
  activeUser,
  draft,
  groups,
  invite,
  isLocalMode,
  isOpen,
  isMemberInviteForm,
  onSubmit,
  onClose,
  onDraftChange,
  onClearInvite,
  onCopyInvite,
  onCloseInvite,
  onShareInvite
}: PersonFormPanelProps): React.ReactElement | null {
  if (hasRole(activeUser, 'member')) return null;

  const trainerOnly = hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner');
  const createsMemberInvite = trainerOnly || draft.role === 'member';

  function selectRole(role: PersonDraft['role']): void {
    onClearInvite();
    onDraftChange({ role });
  }

  return (
    <form className={`crm-panel crm-side-form form-stack${isOpen ? ' mobile-form-open' : ''}`} onSubmit={onSubmit}>
      <div className="crm-panel-header">
        <div>
          <h2>{trainerOnly ? 'Новый ученик' : 'Новый человек'}</h2>
          <p>Добавление в клуб</p>
        </div>
        <button
          className="form-close-button"
          aria-label="Закрыть форму"
          type="button"
          onClick={onClose}
        >
          <Plus size={20} />
        </button>
      </div>

      {hasRole(activeUser, 'owner') ? (
        <div className="segmented-control">
          <button
            className={draft.role === 'trainer' ? 'active' : ''}
            type="button"
            onClick={() => selectRole('trainer')}
          >
            Тренер
          </button>
          <button
            className={draft.role === 'member' ? 'active' : ''}
            disabled={groups.length === 0}
            type="button"
            onClick={() => selectRole('member')}
          >
            Ученик
          </button>
        </div>
      ) : null}

      {!isMemberInviteForm ? (
        <>
          <label>
            Имя
            <input
              required
              value={draft.firstName}
              onChange={(event) => onDraftChange({ firstName: event.target.value })}
            />
          </label>
          <label>
            Фамилия
            <input
              required
              value={draft.lastName}
              onChange={(event) => onDraftChange({ lastName: event.target.value })}
            />
          </label>
        </>
      ) : null}

      {!isLocalMode && !createsMemberInvite ? (
        <div className="split-fields">
          <label>
            Логин
            <input
              minLength={3}
              pattern="[A-Za-z0-9._-]+"
              required
              value={draft.username}
              onChange={(event) => onDraftChange({ username: event.target.value })}
            />
          </label>
          <label>
            Временный пароль
            <input
              minLength={6}
              required
              type="password"
              value={draft.password}
              onChange={(event) => onDraftChange({ password: event.target.value })}
            />
          </label>
        </div>
      ) : null}

      {!createsMemberInvite ? (
        <label>
          Телефон <span className="optional-label">необязательно</span>
          <input
            value={draft.phone}
            onChange={(event) => onDraftChange({ phone: event.target.value })}
          />
        </label>
      ) : null}

      {createsMemberInvite ? (
        <>
          <label>
            Группа
            <select
              required
              value={draft.groupId}
              onChange={(event) => onDraftChange({ groupId: event.target.value })}
            >
              <option value="">Выберите группу</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.activity} · {group.days} {group.time}
                </option>
              ))}
            </select>
          </label>
          <p className="inline-hint invite-form-hint">
            Ученик сам создаст логин и пароль по ссылке. После регистрации он автоматически появится в этой группе.
          </p>
        </>
      ) : null}

      <button className="primary-button" type="submit">
        {createsMemberInvite ? 'Создать приглашение' : 'Добавить тренера'}
      </button>

      {invite && createsMemberInvite ? (
        <InviteResultCard
          invite={invite}
          inputLabel="Ссылка-приглашение"
          onCopy={onCopyInvite}
          onClose={onCloseInvite}
          onShare={onShareInvite}
        />
      ) : null}
    </form>
  );
}
