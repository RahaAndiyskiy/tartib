import { formatMoney } from '@shared/constants/app';
import type {
  LocalTrainingGroup,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import {
  canManageGroups,
  isTrainerOnlyForGroups
} from '../permissions';
import { countGroupMembers } from '../model/selectors';

type GroupsPanelProps = {
  activeUser: AppUser;
  workspace: LocalWorkspace;
  groups: LocalTrainingGroup[];
  lastCreatedGroupId: string;
  isPendingAction: (key: string) => boolean;
  buttonLabel: (key: string, defaultLabel: string) => string;
  onCreateGroup: () => void;
  onCreateInvite: (groupId: string) => void;
  onEditGroup: (group: LocalTrainingGroup) => void;
  onDeleteGroup: (groupId: string) => void;
};

export function GroupsPanel({
  activeUser,
  workspace,
  groups,
  lastCreatedGroupId,
  isPendingAction,
  buttonLabel,
  onCreateGroup,
  onCreateInvite,
  onEditGroup,
  onDeleteGroup
}: GroupsPanelProps): React.ReactElement {
  const canManage = canManageGroups(activeUser);

  return (
    <div className="crm-panel">
      <div className="crm-panel-header">
        <div>
          <h2>{isTrainerOnlyForGroups(activeUser) ? 'Мои группы' : 'Группы клуба'}</h2>
          <p>Направление сразу определяет расписание учеников</p>
        </div>
      </div>
      <div className="group-list">
        {groups.map((group) => {
          const trainer = workspace.users.find((user) => user.id === group.trainerId);
          const memberCount = countGroupMembers(workspace, group.id);

          return (
            <article className="group-row" key={group.id}>
              <div className="group-activity">
                <span>
                  {group.defaultAmount && group.defaultBillingDay
                    ? `${formatMoney(group.defaultAmount)} · ${group.defaultBillingDay} число`
                    : 'Оплата не задана'}
                </span>
                <strong>{group.activity}</strong>
                <span>{trainer ? `${trainer.first_name} ${trainer.last_name}` : 'Без тренера'}</span>
              </div>
              <div><span>Дни</span><strong>{group.days}</strong></div>
              <div><span>Время</span><strong>{group.time}</strong></div>
              <div><span>Ученики</span><strong>{memberCount}</strong></div>
              <div><span>Комментарий</span><strong>{group.note || '—'}</strong></div>
              {canManage ? (
                <div className="row-actions">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={isPendingAction(`create-invite:${group.id}`)}
                    onClick={() => onCreateInvite(group.id)}
                  >
                    {buttonLabel(`create-invite:${group.id}`, 'Ссылка')}
                  </button>
                  <button className="small-button secondary" type="button" onClick={() => onEditGroup(group)}>
                    Редактировать
                  </button>
                  <button
                    className="small-button danger"
                    type="button"
                    disabled={isPendingAction(`delete-group:${group.id}`)}
                    onClick={() => onDeleteGroup(group.id)}
                  >
                    {buttonLabel(`delete-group:${group.id}`, 'Удалить')}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
        {groups.length === 0 ? (
          <div className="empty-state action-empty">
            <p>Групп пока нет.</p>
            <button className="small-button secondary" type="button" onClick={onCreateGroup}>
              Создать группу
            </button>
          </div>
        ) : null}
      </div>
      {lastCreatedGroupId && groups.some((group) => group.id === lastCreatedGroupId) ? (
        <div className="group-next-step">
          <div>
            <strong>Группа создана</strong>
            <span>Следующий шаг: дать ученикам ссылку для входа.</span>
          </div>
          <button
            className="small-button primary-soft"
            type="button"
            disabled={isPendingAction(`create-invite:${lastCreatedGroupId}`)}
            onClick={() => onCreateInvite(lastCreatedGroupId)}
          >
            Ссылка
          </button>
        </div>
      ) : null}
    </div>
  );
}
