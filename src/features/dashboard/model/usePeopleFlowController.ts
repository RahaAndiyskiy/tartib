import type { FormEvent } from 'react';
import { useState } from 'react';
import {
  writeActiveUserId,
  type LocalTrainingGroup,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import { hasRole } from '@/core/roles';
import {
  createMemberInviteAction,
  submitPersonDraftAction
} from '@/modules/people';
import { emptyPersonDraft } from '../constants';
import type {
  DashboardSection,
  MemberInviteResult,
  PersonDraft
} from '../types';
import { sectionForActiveUserChange } from './navigation';

type RunRemoteAction = (payload: Record<string, unknown>) => Promise<boolean>;
type RunRemoteActionWithPending = <T>(
  payload: Record<string, unknown>,
  pendingKey: string
) => Promise<T | null>;

type UsePeopleFlowControllerOptions = {
  activeSection: DashboardSection;
  activeUser: AppUser | null;
  closeInvitePicker: () => void;
  closeMobileForm: () => void;
  groups: LocalTrainingGroup[];
  isLocalMode: boolean;
  openFormSection: (section: DashboardSection) => void;
  openInvitePicker: () => void;
  periodLabel: (date: string) => string;
  runRemoteAction: RunRemoteAction;
  runRemoteActionWithPending: RunRemoteActionWithPending;
  saveWorkspace: (workspace: LocalWorkspace) => void;
  setActiveUserId: React.Dispatch<React.SetStateAction<string>>;
  setMessage: (message: string) => void;
  switchActiveUserSection: (section: DashboardSection) => void;
  users: AppUser[];
  workspace: LocalWorkspace | null;
};

type PeopleFlowController = {
  addPerson: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  clearMemberInvite: () => void;
  closeMemberInvite: () => void;
  closeOverviewInviteModal: () => void;
  copyMemberInvite: () => Promise<void>;
  createMemberInviteForGroup: (groupId: string) => Promise<void>;
  isMemberInviteForm: boolean;
  lastCreatedGroupId: string;
  memberInvite: MemberInviteResult | null;
  openInviteFlow: (groupId?: string) => void;
  openOverviewInviteFlow: () => void;
  personDraft: PersonDraft;
  selectActiveUser: (userId: string) => void;
  setLastCreatedGroupId: React.Dispatch<React.SetStateAction<string>>;
  shareMemberInvite: () => Promise<void>;
  updatePersonDraft: (patch: Partial<PersonDraft>) => void;
};

export function usePeopleFlowController({
  activeSection,
  activeUser,
  closeInvitePicker,
  closeMobileForm,
  groups,
  isLocalMode,
  openFormSection,
  openInvitePicker,
  periodLabel,
  runRemoteAction,
  runRemoteActionWithPending,
  saveWorkspace,
  setActiveUserId,
  setMessage,
  switchActiveUserSection,
  users,
  workspace
}: UsePeopleFlowControllerOptions): PeopleFlowController {
  const [personDraft, setPersonDraft] = useState<PersonDraft>(emptyPersonDraft);
  const [memberInvite, setMemberInvite] = useState<MemberInviteResult | null>(null);
  const [memberInvitesByGroup, setMemberInvitesByGroup] = useState<Record<string, MemberInviteResult>>({});
  const [lastCreatedGroupId, setLastCreatedGroupId] = useState('');

  const isMemberInviteForm =
    Boolean(activeUser) &&
    !isLocalMode &&
    ((hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')) ||
      personDraft.role === 'member');

  function updatePersonDraft(patch: Partial<PersonDraft>): void {
    setPersonDraft((current) => ({ ...current, ...patch }));
  }

  function selectActiveUser(userId: string): void {
    const nextUser = users.find((user) => user.id === userId);
    setActiveUserId(userId);
    writeActiveUserId(userId);
    switchActiveUserSection(sectionForActiveUserChange({ currentSection: activeSection, nextUser }));
    setMessage('');
  }

  function openInviteFlow(groupId?: string): void {
    openFormSection(groupId ? 'groups' : 'people');
    setMemberInvite(null);
    setMessage('');
    updatePersonDraft({
      role: 'member',
      groupId: groupId ?? personDraft.groupId
    });
  }

  function openOverviewInviteFlow(): void {
    if (groups.length === 0) {
      setMessage('РЎРЅР°С‡Р°Р»Р° СЃРѕР·РґР°Р№С‚Рµ РіСЂСѓРїРїСѓ, С‡С‚РѕР±С‹ РґР°С‚СЊ СЃСЃС‹Р»РєСѓ РЅР° РІСЃС‚СѓРїР»РµРЅРёРµ.');
      return;
    }

    setMessage('');
    setMemberInvite(null);
    if (groups.length === 1) {
      void createMemberInviteForGroup(groups[0].id);
      return;
    }

    openInvitePicker();
  }

  function closeMemberInvite(): void {
    setMemberInvite(null);
    setMessage('');
  }

  function closeOverviewInviteModal(): void {
    closeInvitePicker();
    setMemberInvite(null);
    setMessage('');
  }

  async function createMemberInviteForGroup(groupId: string): Promise<void> {
    const group = groups.find((item) => item.id === groupId) ?? null;
    const result = await createMemberInviteAction({
      group,
      groupId,
      cachedInvite: memberInvitesByGroup[groupId],
      isLocalMode,
      origin: window.location.origin,
      runRemoteActionWithPending
    });

    if (!result) return;
    setMemberInvite(result.invite);
    setMemberInvitesByGroup((current) => ({ ...current, [groupId]: result.invite }));
    setLastCreatedGroupId('');
    setMessage(result.localMode ? 'Р’ Р»РѕРєР°Р»СЊРЅРѕРј СЂРµР¶РёРјРµ СЃСЃС‹Р»РєР° РїРѕРєР°Р·Р°РЅР° РґР»СЏ РїСЂРѕРІРµСЂРєРё РёРЅС‚РµСЂС„РµР№СЃР°.' : '');
  }

  async function addPerson(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const result = await submitPersonDraftAction({
      workspace,
      activeUser,
      draft: personDraft,
      isLocalMode,
      runRemoteAction,
      now: new Date().toISOString(),
      periodLabel
    });

    if (result.kind === 'validation_error') {
      setMessage(result.message);
      return;
    }

    if (result.kind === 'create_member_invite') {
      await createMemberInviteForGroup(result.groupId);
      setPersonDraft((current) => ({
        ...emptyPersonDraft,
        role: 'member',
        groupId: current.groupId
      }));
      return;
    }

    if (result.kind === 'remote_trainer_created') {
      setPersonDraft(emptyPersonDraft);
      closeMobileForm();
      setMessage(result.message);
      return;
    }

    if (result.kind === 'local_person_created') {
      saveWorkspace(result.workspace);
      setPersonDraft(emptyPersonDraft);
      setMessage(result.message);
    }
  }

  async function copyMemberInvite(): Promise<void> {
    if (!memberInvite) return;
    await navigator.clipboard.writeText(memberInvite.inviteUrl);
    setMessage('РЎСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР°.');
  }

  async function shareMemberInvite(): Promise<void> {
    if (!memberInvite) return;

    if (navigator.share) {
      await navigator.share({
        title: `РџСЂРёРіР»Р°С€РµРЅРёРµ РІ РіСЂСѓРїРїСѓ ${memberInvite.groupName}`,
        text: 'РџРµСЂРµР№РґРёС‚Рµ РїРѕ СЃСЃС‹Р»РєРµ, С‡С‚РѕР±С‹ РїСЂРёСЃРѕРµРґРёРЅРёС‚СЊСЃСЏ Рє РіСЂСѓРїРїРµ.',
        url: memberInvite.inviteUrl
      });
      return;
    }

    await copyMemberInvite();
  }

  return {
    addPerson,
    clearMemberInvite: () => setMemberInvite(null),
    closeMemberInvite,
    closeOverviewInviteModal,
    copyMemberInvite,
    createMemberInviteForGroup,
    isMemberInviteForm,
    lastCreatedGroupId,
    memberInvite,
    openInviteFlow,
    openOverviewInviteFlow,
    personDraft,
    selectActiveUser,
    setLastCreatedGroupId,
    shareMemberInvite,
    updatePersonDraft
  };
}
