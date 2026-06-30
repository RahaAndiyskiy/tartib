import type {
  LocalTrainingSchedule,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';

export type ScheduleEditLike = {
  days: string;
  time: string;
  note: string;
};

export function scheduleEditForMember({
  workspace,
  edits,
  memberId
}: {
  workspace: LocalWorkspace | null;
  edits: Record<string, ScheduleEditLike>;
  memberId: string;
}): ScheduleEditLike {
  const existingEdit = edits[memberId];
  if (existingEdit) return existingEdit;

  const schedule = workspace?.schedules.find((item) => item.memberId === memberId);
  return {
    days: schedule?.days ?? '',
    time: schedule?.time ?? '',
    note: schedule?.note ?? ''
  };
}

export function patchScheduleEdit({
  current,
  workspace,
  memberId,
  patch
}: {
  current: Record<string, ScheduleEditLike>;
  workspace: LocalWorkspace | null;
  memberId: string;
  patch: Partial<ScheduleEditLike>;
}): Record<string, ScheduleEditLike> {
  return {
    ...current,
    [memberId]: {
      ...scheduleEditForMember({ workspace, edits: current, memberId }),
      ...patch
    }
  };
}

export function saveScheduleAction({
  workspace,
  activeUser,
  memberId,
  edit,
  trainer,
  now,
  createId
}: {
  workspace: LocalWorkspace | null;
  activeUser: AppUser | null;
  memberId: string;
  edit: ScheduleEditLike;
  trainer: AppUser | null;
  now: string;
  createId: () => string;
}): { workspace: LocalWorkspace; message: string } | { error: string } | null {
  if (!workspace || !activeUser) return null;

  if (!trainer || !edit.days.trim() || !edit.time.trim()) {
    return { error: 'Укажите дни и время тренировок.' };
  }

  const existing = workspace.schedules.find((schedule) => schedule.memberId === memberId);
  const schedule: LocalTrainingSchedule = {
    id: existing?.id ?? createId(),
    memberId,
    trainerId: trainer.id,
    days: edit.days.trim(),
    time: edit.time.trim(),
    note: edit.note.trim(),
    updatedAt: now
  };

  return {
    workspace: {
      ...workspace,
      schedules: existing
        ? workspace.schedules.map((item) => (item.id === existing.id ? schedule : item))
        : [...workspace.schedules, schedule]
    },
    message: 'Расписание сохранено.'
  };
}
