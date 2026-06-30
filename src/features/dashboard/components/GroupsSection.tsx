import type { FormEvent } from 'react';
import type {
  LocalTrainingGroup,
  LocalWorkspace
} from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import { GroupsPanel } from '@/modules/groups';
import { GroupFormModal } from '../GroupFormModal';
import { InviteResultCard } from '../InviteResultCard';
import type {
  GroupDraft,
  MemberInviteResult
} from '../types';

type GroupsSectionProps = {
  activeUser: AppUser;
  workspace: LocalWorkspace;
  groups: LocalTrainingGroup[];
  trainers: AppUser[];
  draft: GroupDraft;
  invite: MemberInviteResult | null;
  weekDays: string[];
  canView: boolean;
  canManage: boolean;
  isOwner: boolean;
  isEditing: boolean;
  isOpen: boolean;
  isPending: boolean;
  lastCreatedGroupId: string;
  submitLabel: string;
  trainerName: (trainerId: string) => string;
  isPendingAction: (key: string) => boolean;
  buttonLabel: (key: string, label: string) => string;
  onCreateGroup: () => void;
  onCreateInvite: (groupId: string) => void;
  onEditGroup: (group: LocalTrainingGroup) => void;
  onDeleteGroup: (groupId: string) => void;
  onDraftChange: (patch: Partial<GroupDraft>) => void;
  onToggleDay: (day: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCloseForm: () => void;
  onCancelEdit: () => void;
  onCopyInvite: () => void;
  onCloseInvite: () => void;
  onShareInvite: () => void;
};

export function GroupsSection({
  activeUser,
  workspace,
  groups,
  trainers,
  draft,
  invite,
  weekDays,
  canView,
  canManage,
  isOwner,
  isEditing,
  isOpen,
  isPending,
  lastCreatedGroupId,
  submitLabel,
  trainerName,
  isPendingAction,
  buttonLabel,
  onCreateGroup,
  onCreateInvite,
  onEditGroup,
  onDeleteGroup,
  onDraftChange,
  onToggleDay,
  onSubmit,
  onCloseForm,
  onCancelEdit,
  onCopyInvite,
  onCloseInvite,
  onShareInvite
}: GroupsSectionProps): React.ReactElement | null {
  if (!canView) return null;

  return (
    <section className="crm-content-grid">
      <GroupsPanel
        activeUser={activeUser}
        workspace={workspace}
        groups={groups}
        lastCreatedGroupId={lastCreatedGroupId}
        isPendingAction={isPendingAction}
        buttonLabel={buttonLabel}
        onCreateGroup={onCreateGroup}
        onCreateInvite={onCreateInvite}
        onEditGroup={onEditGroup}
        onDeleteGroup={onDeleteGroup}
      />
      {invite ? (
        <InviteResultCard
          invite={invite}
          inputLabel="Ссылка для набора"
          className="group-invite-result"
          onCopy={onCopyInvite}
          onClose={onCloseInvite}
          onShare={onShareInvite}
        />
      ) : null}

      {canManage ? (
        <GroupFormModal
          draft={draft}
          trainers={trainers}
          weekDays={weekDays}
          isOwner={isOwner}
          isEditing={isEditing}
          isOpen={isOpen}
          isPending={isPending}
          submitLabel={submitLabel}
          trainerName={trainerName}
          onDraftChange={onDraftChange}
          onToggleDay={onToggleDay}
          onSubmit={onSubmit}
          onClose={onCloseForm}
          onCancelEdit={onCancelEdit}
        />
      ) : null}
    </section>
  );
}
