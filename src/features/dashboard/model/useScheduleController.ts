import { useState } from 'react';
import type { LocalWorkspace } from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import {
  patchScheduleEdit,
  saveScheduleAction,
  scheduleEditForMember
} from '@/modules/schedule';
import type { ScheduleEdit } from '../types';

type UseScheduleControllerOptions = {
  activeUser: AppUser | null;
  createId: () => string;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setMessage: (message: string) => void;
  trainerFor: (memberId: string) => AppUser | null;
  workspace: LocalWorkspace | null;
};

type ScheduleController = {
  saveSchedule: (memberId: string) => void;
  scheduleEditFor: (memberId: string) => ScheduleEdit;
  updateScheduleEdit: (memberId: string, patch: Partial<ScheduleEdit>) => void;
};

export function useScheduleController({
  activeUser,
  createId,
  saveWorkspace,
  setMessage,
  trainerFor,
  workspace
}: UseScheduleControllerOptions): ScheduleController {
  const [scheduleEdits, setScheduleEdits] = useState<Record<string, ScheduleEdit>>({});

  function scheduleEditFor(memberId: string): ScheduleEdit {
    return scheduleEditForMember({
      workspace,
      edits: scheduleEdits,
      memberId
    });
  }

  function updateScheduleEdit(memberId: string, patch: Partial<ScheduleEdit>): void {
    setScheduleEdits((current) =>
      patchScheduleEdit({
        current,
        workspace,
        memberId,
        patch
      })
    );
  }

  function saveSchedule(memberId: string): void {
    const result = saveScheduleAction({
      workspace,
      activeUser,
      memberId,
      edit: scheduleEdits[memberId] ?? scheduleEditFor(memberId),
      trainer: trainerFor(memberId),
      now: new Date().toISOString(),
      createId
    });

    if (!result) return;
    if ('error' in result) {
      setMessage(result.error);
      return;
    }

    saveWorkspace(result.workspace);
    setMessage(result.message);
  }

  return {
    saveSchedule,
    scheduleEditFor,
    updateScheduleEdit
  };
}
