import { BellOff, BellRing, Send } from 'lucide-react';
import type { PushAvailability, PushOperationStage } from '@shared/lib/pushClient';
import type { PushNotice } from '@/features/dashboard/model/useAccountRuntime';

type PushToggleButtonProps = {
  compact?: boolean;
  notice: PushNotice | null;
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
  'saving-subscription': 'Сохраняем подписку',
  'testing-delivery': 'Проверяем доставку'
};

const statusHints: Partial<Record<PushAvailability, string>> = {
  blocked: 'Уведомления заблокированы в настройках браузера или телефона.',
  disabled: 'Push пока не настроен на сервере.',
  enabled: 'Нажмите один раз: Tartib запросит разрешение и сразу отправит тест.',
  granted: 'Push включён. Можно отправить тестовое уведомление.',
  unsupported: 'Этот браузер не поддерживает web push.'
};

export function PushToggleButton({
  compact = false,
  notice,
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
    ? 'Оставайтесь в приложении несколько секунд. Итог появится здесь.'
    : notice?.text ?? statusHints[status];
  const hintTone = notice?.tone ?? (blocked ? 'error' : enabled ? 'success' : 'info');

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
      {hint ? <span className={`push-toggle-hint ${hintTone}`}>{hint}</span> : null}
    </div>
  );
}
