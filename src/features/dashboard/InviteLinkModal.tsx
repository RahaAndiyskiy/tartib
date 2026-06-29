import { Copy, Share2 } from 'lucide-react';
import { formatMoney } from '@shared/constants/app';
import type { LocalTrainingGroup } from '@shared/lib/localWorkspace';
import type { MemberInviteResult } from './types';

type InviteLinkModalProps = {
  invite: MemberInviteResult | null;
  groups: LocalTrainingGroup[];
  isPendingGroup: (groupId: string) => boolean;
  onCreateInvite: (groupId: string) => void;
  onCopy: () => void;
  onShare: () => void;
  onClose: () => void;
};

export function InviteLinkModal({
  invite,
  groups,
  isPendingGroup,
  onCreateInvite,
  onCopy,
  onShare,
  onClose
}: InviteLinkModalProps): React.ReactElement {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="overview-invite-title"
        aria-modal="true"
        className="confirm-modal invite-picker-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        {invite ? (
          <>
            <div>
              <h2 id="overview-invite-title">Ссылка на вступление</h2>
              <p>Группа: {invite.groupName}</p>
            </div>
            <input aria-label="Ссылка на вступление" readOnly value={invite.inviteUrl} />
            <div className="confirm-modal-actions">
              <button className="primary-button" type="button" onClick={onCopy}>
                <Copy size={16} />
                Скопировать
              </button>
              <button className="small-button secondary" type="button" onClick={onShare}>
                <Share2 size={16} />
                Поделиться
              </button>
              <button className="small-button secondary" type="button" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h2 id="overview-invite-title">Выберите группу</h2>
              <p>Для этой группы будет создана ссылка на вступление.</p>
            </div>
            <div className="invite-group-options">
              {groups.map((group) => (
                <button
                  className="group-choice-button"
                  disabled={isPendingGroup(group.id)}
                  key={group.id}
                  type="button"
                  onClick={() => onCreateInvite(group.id)}
                >
                  <strong>{group.activity}</strong>
                  <span>
                    {group.defaultAmount && group.defaultBillingDay
                      ? `${formatMoney(group.defaultAmount)} · ${group.defaultBillingDay} число`
                      : 'Оплата не задана'}
                  </span>
                  <span>{group.days} · {group.time}</span>
                </button>
              ))}
            </div>
            <button className="small-button secondary" type="button" onClick={onClose}>
              Отмена
            </button>
          </>
        )}
      </section>
    </div>
  );
}
