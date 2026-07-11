import type { FormEvent } from 'react';
import { Bell, LogOut, Settings } from 'lucide-react';
import type { AppUser } from '@shared/types/domain';
import { hasRole, roleLabel } from '@/core/roles';
import type { SettingsDraft } from '../types';

type SettingsSectionProps = {
  activeUser: AppUser;
  settingsDraft: SettingsDraft;
  isLocalMode: boolean;
  isPendingAction: (key: string) => boolean;
  onSettingsDraftChange: (draft: SettingsDraft | ((current: SettingsDraft) => SettingsDraft)) => void;
  onSaveProfile: (event: FormEvent<HTMLFormElement>) => void;
  onSaveOrganization: (event: FormEvent<HTMLFormElement>) => void;
  onSignOut: () => void;
};

export function SettingsSection({
  activeUser,
  settingsDraft,
  isLocalMode,
  isPendingAction,
  onSettingsDraftChange,
  onSaveProfile,
  onSaveOrganization,
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
              <p>События и действия внутри Tartib</p>
            </div>
            <Bell size={20} />
          </div>
          <div className="settings-card-body">
            <div className="settings-status-row">
              <span>Статус</span>
              <strong>Внутри приложения</strong>
            </div>
            <p className="inline-note">
              Внешние push-уведомления временно скрыты. Сейчас Tartib показывает важные события
              в модалке уведомлений: оплаты, отсрочки и действия, которые можно обработать сразу.
            </p>
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
