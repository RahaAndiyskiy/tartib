import { BellOff, BellRing } from 'lucide-react';
import type { PushAvailability } from '@shared/lib/pushClient';

type PushToggleButtonProps = {
  compact?: boolean;
  pending: boolean;
  status: PushAvailability;
  onToggle: () => void;
};

export function PushToggleButton({
  compact = false,
  pending,
  status,
  onToggle
}: PushToggleButtonProps): React.ReactElement | null {
  if (status === 'unsupported' || status === 'blocked') return null;

  const enabled = status === 'granted';
  const label = pending
    ? enabled
      ? 'Отключаем...'
      : 'Включаем...'
    : enabled
      ? 'Push включён'
      : 'Включить push';

  return (
    <button
      aria-pressed={enabled}
      className={`${enabled ? 'small-button secondary' : 'primary-button'} push-toggle-button${enabled ? ' enabled' : ''}${compact ? ' compact' : ''}`}
      disabled={pending}
      title={enabled ? 'Нажмите, чтобы отключить push' : undefined}
      type="button"
      onClick={onToggle}
    >
      {enabled ? <BellRing size={17} /> : <BellOff size={17} />}
      {label}
    </button>
  );
}
