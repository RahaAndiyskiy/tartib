import { BellOff, BellRing } from 'lucide-react';
import type { PushAvailability, PushOperationStage } from '@shared/lib/pushClient';

type PushToggleButtonProps = {
  compact?: boolean;
  pending: boolean;
  stage: PushOperationStage | null;
  status: PushAvailability;
  onToggle: () => void;
};

const stageLabels: Record<PushOperationStage, string> = {
  'checking-permission': 'Ждём разрешение',
  'loading-config': 'Проверяем настройки',
  'preparing-device': 'Готовим устройство',
  'creating-subscription': 'Подключаем устройство',
  'saving-subscription': 'Сохраняем',
  'removing-subscription': 'Отключаем'
};

const statusHints: Partial<Record<PushAvailability, string>> = {
  disabled: 'Push пока не настроен на сервере.',
  enabled: 'Нажмите, чтобы включить уведомления на этом устройстве.',
  granted: 'Уведомления включены на этом устройстве.'
};

export function PushToggleButton({
  compact = false,
  pending,
  stage,
  status,
  onToggle
}: PushToggleButtonProps): React.ReactElement | null {
  if (status === 'unsupported' || status === 'blocked') return null;

  const enabled = status === 'granted';
  const label = pending
    ? stage
      ? `${stageLabels[stage]}...`
      : enabled
        ? 'Отключаем...'
        : 'Включаем...'
    : enabled
      ? 'Push включён'
      : 'Включить push';
  const hint = pending
    ? 'Не закрывайте приложение, это займёт несколько секунд.'
    : statusHints[status];

  return (
    <div className={`push-toggle-control${compact ? ' compact' : ''}`}>
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
      {hint && !compact ? <span className="push-toggle-hint">{hint}</span> : null}
    </div>
  );
}
