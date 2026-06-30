import type {
  LocalTrainingGroup,
  LocalTrainingSchedule
} from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import type { ScheduleEdit } from '../types';

type ScheduleSectionProps = {
  activeUser: AppUser;
  visibleMembers: AppUser[];
  activeMemberGroup: LocalTrainingGroup | null;
  activeMemberSchedule: LocalTrainingSchedule | null;
  activeMemberTrainer: AppUser | null;
  userName: (userId: string) => string;
  trainerFor: (memberId: string) => AppUser | null;
  scheduleEditFor: (memberId: string) => ScheduleEdit;
  updateScheduleEdit: (memberId: string, patch: Partial<ScheduleEdit>) => void;
  saveSchedule: (memberId: string) => void;
};

export function ScheduleSection({
  activeUser,
  visibleMembers,
  activeMemberGroup,
  activeMemberSchedule,
  activeMemberTrainer,
  userName,
  trainerFor,
  scheduleEditFor,
  updateScheduleEdit,
  saveSchedule
}: ScheduleSectionProps): React.ReactElement {
  const isMember = activeUser.role === 'member';

  return (
    <section className="crm-panel">
      <div className="crm-panel-header">
        <div>
          <h2>{isMember ? 'Моё расписание' : 'Расписание учеников'}</h2>
          <p>
            {isMember
              ? 'Актуальные дни и время тренировок'
              : 'Одна понятная строка расписания на ученика'}
          </p>
        </div>
      </div>

      {isMember ? (
        <div className="member-schedule-detail">
          <div>
            <span>Направление</span>
            <strong>{activeMemberGroup?.activity ?? 'Не назначено'}</strong>
          </div>
          <div>
            <span>Дни</span>
            <strong>{activeMemberSchedule?.days ?? 'Не назначены'}</strong>
          </div>
          <div>
            <span>Время</span>
            <strong>{activeMemberSchedule?.time ?? 'Не назначено'}</strong>
          </div>
          <div>
            <span>Тренер</span>
            <strong>
              {activeMemberTrainer
                ? `${activeMemberTrainer.first_name} ${activeMemberTrainer.last_name}`
                : 'Не назначен'}
            </strong>
          </div>
          <div>
            <span>Комментарий</span>
            <strong>{activeMemberSchedule?.note || 'Нет комментария'}</strong>
          </div>
        </div>
      ) : (
        <div className="schedule-table">
          <div className="schedule-head">
            <span>Ученик</span><span>Дни</span><span>Время</span><span>Комментарий</span><span>Действие</span>
          </div>
          {visibleMembers.map((member) => {
            const edit = scheduleEditFor(member.id);
            return (
              <div className="schedule-row" key={member.id}>
                <div>
                  <strong>{userName(member.id)}</strong>
                  <span>{trainerFor(member.id)?.first_name ?? 'Без тренера'}</span>
                </div>
                <input
                  placeholder="Пн, Ср, Пт"
                  value={edit.days}
                  onChange={(event) =>
                    updateScheduleEdit(member.id, { days: event.target.value })
                  }
                />
                <input
                  placeholder="18:00"
                  value={edit.time}
                  onChange={(event) =>
                    updateScheduleEdit(member.id, { time: event.target.value })
                  }
                />
                <input
                  placeholder="Зал или группа"
                  value={edit.note}
                  onChange={(event) =>
                    updateScheduleEdit(member.id, { note: event.target.value })
                  }
                />
                <button
                  className="small-button"
                  type="button"
                  onClick={() => saveSchedule(member.id)}
                >
                  Сохранить
                </button>
              </div>
            );
          })}
          {visibleMembers.length === 0 ? (
            <p className="empty-state">Ученики ещё не добавлены.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
