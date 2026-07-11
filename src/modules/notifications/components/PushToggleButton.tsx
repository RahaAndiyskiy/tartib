import { BellOff, BellRing, Send } from 'lucide-react';
import type { PushAvailability, PushOperationStage } from '@shared/lib/pushClient';

type PushToggleButtonProps = {
  compact?: boolean;
  pending: boolean;
  stage: PushOperationStage | null;
  status: PushAvailability;
  onEnsure: () => void;
  onSendTest: () => void;
};

const stageLabels: Record<PushOperationStage, string> = {
  'checking-permission': 'Ждём разрешение',
  'loading-config': 'Проверяем настройки',
  'preparing-device': 'Готовим устройство',
  'creating-subscription': 'Подключаем устройство',
  'saving-subscription': 'Проверяем доставку',
  'removing-subscription': 'Обновляем'
};

const statusHints: Partial<Record<PushAvailability, string>> = {
  blocked: 'Разрешите уведомления в настройках браузера или устройства.',
  disabled: 'Push пока не настроен на сервере.',
  enabled: 'Нужно один раз разрешить уведомления на этом устройстве.',
  granted: 'Push включён. Tartib будет присылать важные события автоматически.',
  unsupported: 'Этот браузер не поддерживает web push.'
};

export function PushToggleButton({
  compact = false,
  pending,
  stage,
  status,
  onEnsure,
  onSendTest
}: PushToggleButtonProps): React.ReactElement {
  const enabled = status === 'granted';
  const blocked = status === 'blocked' || status === 'unsupported' || status === 'disabled';
  const label = pending
    ? stage
      ? `${stageLabels[stage]}...`
      : 'Проверяем...'
    : enabled
      ? 'Проверить push'
      : blocked
        ? 'Push недоступен'
        : 'Разрешить push';
  const hint = pending
    ? 'Не закрывайте приложение, это займёт несколько секунд.'
    : statusHints[status];

  return (
    <div className={`push-toggle-control${compact ? ' compact' : ''}`}>
      <button
        aria-pressed={enabled}
        className={`${enabled ? 'small-button secondary' : 'primary-button'} push-toggle-button${enabled ? ' enabled' : ''}${compact ? ' compact' : ''}`}
        disabled={pending || blocked}
        type="button"
        onClick={enabled ? onSendTest : onEnsure}
      >
        {enabled ? <Send size={17} /> : blocked ? <BellOff size={17} /> : <BellRing size={17} />}
        {label}
      </button>
      {hint && !compact ? <span className="push-toggle-hint">{hint}</span> : null}
    </div>
  );
}
