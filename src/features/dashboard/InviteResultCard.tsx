import { Copy, Share2, X } from 'lucide-react';
import type { MemberInviteResult } from './types';

type InviteResultCardProps = {
  invite: MemberInviteResult;
  inputLabel: string;
  className?: string;
  onCopy: () => void;
  onClose: () => void;
  onShare: () => void;
};

export function InviteResultCard({
  invite,
  inputLabel,
  className = '',
  onCopy,
  onClose,
  onShare
}: InviteResultCardProps): React.ReactElement {
  return (
    <div className={`invite-result${className ? ` ${className}` : ''}`}>
      <div className="invite-result-header">
        <div>
          <strong>Ссылка для группы {invite.groupName}</strong>
          <span>
            Действует до {new Date(invite.expiresAt).toLocaleDateString('ru-RU')}
          </span>
        </div>
      </div>
      <input aria-label={inputLabel} readOnly value={invite.inviteUrl} />
      <div className="invite-result-actions">
        <button className="ghost-button" type="button" onClick={onCopy}>
          <Copy size={17} /> Копировать
        </button>
        <button className="invite-close-button" aria-label="Закрыть ссылку" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <button className="primary-button" type="button" onClick={onShare}>
          <Share2 size={17} /> Поделиться
        </button>
      </div>
    </div>
  );
}
