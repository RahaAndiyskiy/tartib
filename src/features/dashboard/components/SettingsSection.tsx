import type { FormEvent } from 'react';
import { Bell, LogOut, Settings } from 'lucide-react';
import type { PushAvailability, PushOperationStage } from '@shared/lib/pushClient';
import type { AppUser } from '@shared/types/domain';
import { hasRole, roleLabel } from '@/core/roles';
import { PushToggleButton } from '@/modules/notifications/components/PushToggleButton';
import type { SettingsDraft } from '../types';

type SettingsSectionProps = {
  activeUser: AppUser;
  settingsDraft: SettingsDraft;
  pushStatus: PushAvailability;
  pushPending: boolean;
  pushStage: PushOperationStage | null;
  isLocalMode: boolean;
  isPendingAction: (key: string) => boolean;
  onSettingsDraftChange: (draft: SettingsDraft | ((current: SettingsDraft) => SettingsDraft)) => void;
  onSaveProfile: (event: FormEvent<HTMLFormElement>) => void;
  onSaveOrganization: (event: FormEvent<HTMLFormElement>) => void;
  onTogglePush: () => void;
  onSignOut: () => void;
};

export function SettingsSection({
  activeUser,
  settingsDraft,
  pushStatus,
  pushPending,
  pushStage,
  isLocalMode,
  isPendingAction,
  onSettingsDraftChange,
  onSaveProfile,
  onSaveOrganization,
  onTogglePush,
  onSignOut
}: SettingsSectionProps): React.ReactElement {
  return (
    <section className="settings-grid">
      <form className="crm-panel settings-card form-stack" onSubmit={onSaveProfile}>
        <div className="crm-panel-header">
          <div>
            <h2>Профиль</h2>
            <p>Имя, контакт и данные для входа</p>
          </div>
          <Settings size={20} />
        </div>
        <div className="settings-card-body">
          <div className="settings-avatar-preview">
            <span aria-hidden="true">
              {activeUser.first_name.slice(0, 1)}
              {activeUser.last_name.slice(0, 1)}
            </span>
            <div>
              <strong>Фото профиля</strong>
              <p>Загрузку аватара добавим после подключения Storage и правил доступа.</p>
            </div>
          </div>
          <div className="split-fields">
            <label>
              Имя
              <input
                required
                value={settingsDraft.firstName}
                onChange={(event) =>
                  onSettingsDraftChange((current) => ({ ...current, firstName: event.target.value }))
                }
              />
            </label>
            <label>
              Фамилия
              <input
                required
                value={settingsDraft.lastName}
                onChange={(event) =>
                  onSettingsDraftChange((current) => ({ ...current, lastName: event.target.value }))
                }
              />
            </label>
          </div>
          <label>
            Телефон
            <input
              inputMode="tel"
              placeholder="Номер для связи"
              value={settingsDraft.phone}
              onChange={(event) =>
                onSettingsDraftChange((current) => ({ ...current, phone: event.target.value }))
              }
            />
          </label>
          <div className="settings-readonly-list">
            <div>
              <span>Логин</span>
              <strong>{activeUser.username ?? 'Не указан'}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{activeUser.email ?? 'Не используется'}</strong>
            </div>
            <div>
              <span>Роль</span>
              <strong>{roleLabel(activeUser)}</strong>
            </div>
          </div>
          <button className="primary-button" type="submit" disabled={isPendingAction('update-profile')}>
            {isPendingAction('update-profile') ? 'Сохраняем...' : 'Сохранить профиль'}
          </button>
        </div>
      </form>

      <div className="settings-side-stack">
        {hasRole(activeUser, 'owner') ? (
          <form className="crm-panel settings-card form-stack" onSubmit={onSaveOrganization}>
            <div className="crm-panel-header">
              <div>
                <h2>Клуб</h2>
                <p>Название, которое видят тренеры и ученики</p>
              </div>
            </div>
            <div className="settings-card-body">
              <label>
                Название клуба
                <input
                  required
                  value={settingsDraft.organizationName}
                  onChange={(event) =>
                    onSettingsDraftChange((current) => ({
                      ...current,
                      organizationName: event.target.value
                    }))
                  }
                />
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={isPendingAction('update-organization')}
              >
                {isPendingAction('update-organization') ? 'Сохраняем...' : 'Сохранить клуб'}
              </button>
            </div>
          </form>
        ) : null}

        <section className="crm-panel settings-card">
          <div className="crm-panel-header">
            <div>
              <h2>Уведомления</h2>
              <p>Push для важных оплат и запросов</p>
            </div>
            <Bell size={20} />
          </div>
          <div className="settings-card-body">
            <div className="settings-status-row">
              <span>Статус</span>
              <strong>
                {pushStatus === 'granted'
                  ? 'Включены'
                  : pushStatus === 'blocked'
                    ? 'Заблокированы'
                    : pushStatus === 'disabled'
                      ? 'Не настроены'
                      : pushStatus === 'unsupported'
                        ? 'Не поддерживаются'
                        : 'Выключены'}
              </strong>
            </div>
            {pushStatus === 'granted' ? (
              <p className="inline-note">
                Вы будете получать важные события по оплатам, когда браузер разрешает push.
              </p>
            ) : pushStatus === 'unsupported' || pushStatus === 'blocked' ? (
              <p className="inline-note">
                Проверьте разрешения браузера или откройте приложение как PWA, если push недоступен.
              </p>
            ) : null}
            <PushToggleButton
              pending={pushPending}
              stage={pushStage}
              status={pushStatus}
              onToggle={onTogglePush}
            />
          </div>
        </section>

        {!isLocalMode ? (
          <section className="crm-panel settings-card">
            <div className="settings-card-body">
              <button className="small-button secondary settings-logout-button" type="button" onClick={onSignOut}>
                <LogOut size={16} />
                Выйти из аккаунта
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
