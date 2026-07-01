import type { FormEvent } from 'react';
import { useState } from 'react';
import type {
  LocalTrainingGroup,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import { hasRole } from '@/core/roles';
import {
  buildGroupDraftFromGroup,
  deleteGroupAction,
  submitGroupDraftAction,
  upsertGroupInWorkspace
} from '@/modules/groups';
import { applyGroupDefaultPaymentToMembers } from '@/modules/payments';
import { emptyGroupDraft } from '../constants';
import type {
  DashboardSection,
  GroupDraft
} from '../types';

type RunRemoteActionWithPending = <T>(
  payload: Record<string, unknown>,
  pendingKey: string
) => Promise<T | null>;

type UseGroupsControllerOptions = {
  activeUser: AppUser | null;
  clearMemberInvite: () => void;
  closeMobileForm: () => void;
  createId: () => string;
  dateAtNoon: (date: string) => number;
  dueDateForBillingDay: (billingDay: number) => string;
  isLocalMode: boolean;
  openFormSection: (section: DashboardSection) => void;
  openMobileForm: () => void;
  periodLabel: (date: string) => string;
  refreshRemoteWorkspace: (reason: string, minIntervalMs?: number) => Promise<void>;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setLastCreatedGroupId: React.Dispatch<React.SetStateAction<string>>;
  setMessage: (message: string) => void;
  setWorkspace: React.Dispatch<React.SetStateAction<LocalWorkspace | null>>;
  todayString: () => string;
  workspace: LocalWorkspace | null;
};

type GroupsController = {
  cancelGroupEdit: () => void;
  createGroup: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  editingGroupId: string;
  groupDraft: GroupDraft;
  openCreateGroup: () => void;
  startGroupEdit: (group: LocalTrainingGroup) => void;
  toggleGroupDay: (day: string) => void;
  updateGroupDraft: (patch: Partial<GroupDraft>) => void;
};

export function useGroupsController({
  activeUser,
  clearMemberInvite,
  closeMobileForm,
  createId,
  dateAtNoon,
  dueDateForBillingDay,
  isLocalMode,
  openFormSection,
  openMobileForm,
  periodLabel,
  refreshRemoteWorkspace,
  runRemoteActionWithPending,
  saveWorkspace,
  setLastCreatedGroupId,
  setMessage,
  setWorkspace,
  todayString,
  workspace
}: UseGroupsControllerOptions): GroupsController {
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(emptyGroupDraft);
  const [editingGroupId, setEditingGroupId] = useState('');

  function updateGroupDraft(patch: Partial<GroupDraft>): void {
    setGroupDraft((current) => ({ ...current, ...patch }));
  }

  function toggleGroupDay(day: string): void {
    setGroupDraft((current) => {
      const selectedDays = current.days ? current.days.split(', ').filter(Boolean) : [];
      const nextDays = selectedDays.includes(day)
        ? selectedDays.filter((item) => item !== day)
        : [...selectedDays, day];

      return {
        ...current,
        days: nextDays.join(', ')
      };
    });
  }

  function openCreateGroup(): void {
    openFormSection('groups');
    setEditingGroupId('');
    setGroupDraft(emptyGroupDraft);
    setMessage('');
  }

  async function createGroup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const result = await submitGroupDraftAction({
      workspace,
      activeUser,
      editingGroupId,
      draft: groupDraft,
      isLocalMode,
      now: new Date().toISOString(),
      createId,
      runRemoteActionWithPending,
      syncDefaultPayments: ({ workspace: syncWorkspace, memberIds, trainerId, amount, billingDay, now }) =>
        applyGroupDefaultPaymentToMembers({
          workspace: syncWorkspace,
          memberIds,
          trainerId,
          amount,
          billingDay,
          dueDate: dueDateForBillingDay(billingDay),
          now,
          createId,
          periodLabel,
          statusForDueDate: (date) =>
            dateAtNoon(date) < dateAtNoon(todayString()) ? 'overdue' : 'active'
        })
    });

    if (result.kind === 'idle') return;

    if (result.kind === 'validation_error') {
      setMessage(result.message);
      return;
    }

    if (result.workspace) {
      saveWorkspace(result.workspace);
    } else {
      setWorkspace((current) => (current ? upsertGroupInWorkspace(current, result.group) : current));
    }

    setGroupDraft(emptyGroupDraft);
    setEditingGroupId('');
    closeMobileForm();
    setLastCreatedGroupId(result.wasEditing ? '' : result.group.id);
    if (result.refreshRemote) {
      void refreshRemoteWorkspace('group-save', 0);
    }
    setMessage(result.message);
  }

  function startGroupEdit(group: LocalTrainingGroup): void {
    if (!activeUser || !hasRole(activeUser, 'trainer')) return;

    setEditingGroupId(group.id);
    setLastCreatedGroupId('');
    clearMemberInvite();
    setGroupDraft(buildGroupDraftFromGroup(group));
    openMobileForm();
    setMessage('Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РіСЂСѓРїРїС‹. Р’РЅРµСЃРёС‚Рµ РёР·РјРµРЅРµРЅРёСЏ Рё СЃРѕС…СЂР°РЅРёС‚Рµ.');
  }

  function cancelGroupEdit(): void {
    setEditingGroupId('');
    setGroupDraft(emptyGroupDraft);
    closeMobileForm();
    setMessage('');
  }

  async function deleteGroup(groupId: string): Promise<void> {
    if (!workspace || !activeUser || !hasRole(activeUser, 'trainer')) return;

    const deleted = await deleteGroupAction({
      workspace,
      groupId,
      isLocalMode,
      runRemoteActionWithPending,
      saveWorkspace,
      setWorkspace
    });
    if (!deleted) return;

    if (editingGroupId === groupId) {
      cancelGroupEdit();
    }
    setLastCreatedGroupId((current) => (current === groupId ? '' : current));

    setMessage('Р“СЂСѓРїРїР° СѓРґР°Р»РµРЅР°.');
  }

  return {
    cancelGroupEdit,
    createGroup,
    deleteGroup,
    editingGroupId,
    groupDraft,
    openCreateGroup,
    startGroupEdit,
    toggleGroupDay,
    updateGroupDraft
  };
}
