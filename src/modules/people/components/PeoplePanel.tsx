import {
  ChevronRight,
  Search,
  Trash2
} from 'lucide-react';
import type {
  LocalTrainingGroup
} from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import {
  hasRole,
  roleLabel
} from '@/core/roles';

type PeoplePanelProps = {
  activeUser: AppUser;
  people: AppUser[];
  filteredPeople: AppUser[];
  groups: LocalTrainingGroup[];
  groupFilter: string;
  search: string;
  expandedPeople: Record<string, boolean>;
  groupEditorOpenByMember: Record<string, boolean>;
  getMemberGroup: (memberId: string) => LocalTrainingGroup | null;
  isPendingAction: (key: string) => boolean;
  buttonLabel: (key: string, defaultLabel: string) => string;
  onGroupFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onTogglePerson: (userId: string, nextOpen: boolean) => void;
  onToggleGroupEditor: (memberId: string, nextOpen: boolean) => void;
  onAssignMemberToGroup: (memberId: string, groupId: string) => void;
  onDeleteMember: (memberId: string) => void;
  onCreateGroup: () => void;
  onOpenInviteFlow: (groupId?: string) => void;
};

export function PeoplePanel({
  activeUser,
  people,
  filteredPeople,
  groups,
  groupFilter,
  search,
  expandedPeople,
  groupEditorOpenByMember,
  getMemberGroup,
  isPendingAction,
  buttonLabel,
  onGroupFilterChange,
  onSearchChange,
  onTogglePerson,
  onToggleGroupEditor,
  onAssignMemberToGroup,
  onDeleteMember,
  onCreateGroup,
  onOpenInviteFlow
}: PeoplePanelProps): React.ReactElement {
  const isTrainerOnly = hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner');
  const canManagePeople = !hasRole(activeUser, 'member');

  return (
    <div className="crm-panel">
      <div className="crm-panel-header people-panel-header">
        <div>
          <h2>{isTrainerOnly ? 'Мои ученики' : 'Состав клуба'}</h2>
          <p>{filteredPeople.length} / {people.length}</p>
        </div>
        <select
          aria-label="Фильтр по группе"
          className="people-group-filter"
          value={groupFilter}
          onChange={(event) => onGroupFilterChange(event.target.value)}
        >
          <option value="all">Все группы</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.activity} · {group.days} {group.time}
            </option>
          ))}
          <option value="no-group">Без группы</option>
        </select>
      </div>
      <div className="people-toolbar">
        <label className="people-search">
          <Search size={17} />
          <input
            placeholder="Найти человека"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>
      <div className="people-accordion">
        {filteredPeople.map((user) => {
          const group = user.role === 'member' ? getMemberGroup(user.id) : null;
          const isOpen = expandedPeople[user.id] ?? false;
          const groupEditorOpen = groupEditorOpenByMember[user.id] ?? false;
          const contact = user.email ?? user.phone ?? 'Не указан';

          return (
            <article className={`person-accordion-row ${isOpen ? 'open' : ''}`} key={user.id}>
              <button
                className="person-accordion-summary"
                type="button"
                onClick={() => onTogglePerson(user.id, !isOpen)}
              >
                <span>
                  <strong>{user.first_name} {user.last_name}</strong>
                  <small>{roleLabel(user)}</small>
                </span>
                <ChevronRight className={isOpen ? 'open' : ''} size={18} />
              </button>
              {isOpen ? (
                <div className="person-accordion-detail">
                  <div>
                    <span>Контакт</span>
                    <strong>{contact}</strong>
                  </div>
                  {user.role === 'member' ? (
                    <div className="person-group-detail">
                      <span>Группа</span>
                      <strong>
                        {group ? `${group.activity} · ${group.days} ${group.time}` : 'Без группы'}
                      </strong>
                      {groupEditorOpen ? (
                        <select
                          aria-label="Выберите группу"
                          value={group?.id ?? ''}
                          disabled={isPendingAction(`assign-member-group:${user.id}`)}
                          onChange={(event) => {
                            onAssignMemberToGroup(user.id, event.target.value);
                            onToggleGroupEditor(user.id, false);
                          }}
                        >
                          <option value="">Без группы</option>
                          {groups.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.activity} · {item.days} {item.time}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  ) : null}
                  {user.role === 'member' ? (
                    <div className="person-detail-actions">
                      {groups.length > 0 ? (
                        <button
                          className="small-button secondary compact-action change-group-action"
                          type="button"
                          onClick={() => onToggleGroupEditor(user.id, !groupEditorOpen)}
                        >
                          {groupEditorOpen ? 'Скрыть' : 'Сменить группу'}
                        </button>
                      ) : null}
                      <button
                        aria-label="Удалить ученика"
                        className="small-button danger compact-action delete-person-action"
                        type="button"
                        disabled={isPendingAction(`delete-member:${user.id}`)}
                        onClick={() => onDeleteMember(user.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
        {filteredPeople.length === 0 ? (
          <div className="empty-state action-empty">
            <p>{people.length === 0 ? 'Людей пока нет.' : 'По этому поиску никого нет.'}</p>
            {canManagePeople && groups.length === 0 ? (
              <button className="small-button secondary" type="button" onClick={onCreateGroup}>
                Создать группу
              </button>
            ) : null}
            {canManagePeople && groups.length > 0 ? (
              <button
                className="small-button secondary"
                type="button"
                onClick={() => onOpenInviteFlow(groups[0]?.id)}
              >
                Дать ссылку
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="crm-table legacy-people-table">
        <div className="crm-table-head">
          <span>Имя</span><span>Роль</span><span>Группа</span><span>Контакт</span><span>Действия</span>
        </div>
        {people.map((user) => {
          const group = user.role === 'member' ? getMemberGroup(user.id) : null;
          return (
            <div className="crm-table-row" key={user.id}>
              <strong>{user.first_name} {user.last_name}</strong>
              <span>{roleLabel(user)}</span>
              {user.role === 'member' ? (
                <select
                  value={group?.id ?? ''}
                  disabled={isPendingAction(`assign-member-group:${user.id}`)}
                  onChange={(event) => onAssignMemberToGroup(user.id, event.target.value)}
                >
                  <option value="">Без группы</option>
                  {groups.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.activity} · {item.days} {item.time}
                    </option>
                  ))}
                </select>
              ) : (
                <span>—</span>
              )}
              <span>{user.email ?? user.phone ?? 'Не указан'}</span>
              {user.role === 'member' ? (
                <button
                  className="small-button danger"
                  type="button"
                  disabled={isPendingAction(`delete-member:${user.id}`)}
                  onClick={() => onDeleteMember(user.id)}
                >
                  {buttonLabel(`delete-member:${user.id}`, 'Удалить')}
                </button>
              ) : (
                <span>—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
