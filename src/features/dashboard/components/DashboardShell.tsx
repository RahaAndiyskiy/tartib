import type { ReactNode } from 'react';
import { useRef } from 'react';
import {
  Bell,
  CalendarDays,
  CreditCard,
  ExternalLink,
  Layers3,
  LayoutDashboard,
  LogOut,
  Plus,
  RotateCcw,
  Settings,
  UserRound,
  Users
} from 'lucide-react';
import type { LocalWorkspace } from '@shared/lib/localWorkspace';
import type { AppUser } from '@shared/types/domain';
import { useScrollLock } from '@shared/ui/useScrollLock';
import { hasRole, roleLabel } from '@/core/roles';
import type { DashboardSection } from '../types';

type SectionMeta = Record<DashboardSection, { title: string; description: string }>;

type DashboardShellProps = {
  workspace: LocalWorkspace;
  activeUser: AppUser;
  activeSection: DashboardSection;
  sectionMeta: SectionMeta;
  isLocalMode: boolean;
  mobileAccountOpen: boolean;
  mobileFormOpen: boolean;
  notificationsOpen: boolean;
  unreadNotificationCount: number;
  children: ReactNode;
  onOpenSection: (section: DashboardSection) => void;
  onSelectActiveUser: (userId: string) => void;
  onOpenNewWindow: () => void;
  onReset: () => void;
  onSignOut: () => void;
  onRequestLogout: () => void;
  onToggleMobileAccount: () => void;
  onCloseMobileAccount: () => void;
  onOpenMobileForm: () => void;
  onCloseMobileForm: () => void;
  onOpenNotifications: () => void;
};

export function DashboardShell({
  workspace,
  activeUser,
  activeSection,
  sectionMeta,
  isLocalMode,
  mobileAccountOpen,
  mobileFormOpen,
  notificationsOpen,
  unreadNotificationCount,
  children,
  onOpenSection,
  onSelectActiveUser,
  onOpenNewWindow,
  onReset,
  onSignOut,
  onRequestLogout,
  onToggleMobileAccount,
  onCloseMobileAccount,
  onOpenMobileForm,
  onCloseMobileForm,
  onOpenNotifications
}: DashboardShellProps): React.ReactElement {
  const isMember = hasRole(activeUser, 'member');
  const canCreateFromHeader = !isMember && (activeSection === 'people' || activeSection === 'groups');
  useScrollLock(mobileFormOpen);

  return (
    <div className="crm-shell">
      <aside className="crm-sidebar">
        <div className="crm-brand">
          <span className="crm-brand-mark">T</span>
          <div>
            <strong>Tartib</strong>
            <span>Управление клубом</span>
          </div>
        </div>

        <div className="crm-organization">
          <span>Организация</span>
          <strong>{workspace.organization.name}</strong>
        </div>

        <nav className="crm-nav" aria-label="Разделы">
          <NavButton
            active={activeSection === 'overview'}
            icon={<LayoutDashboard size={18} />}
            label="Обзор"
            onClick={() => onOpenSection('overview')}
          />
          {!isMember ? (
            <NavButton
              active={activeSection === 'people'}
              icon={<Users size={18} />}
              label={
                hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')
                  ? 'Мои ученики'
                  : 'Команда'
              }
              onClick={() => onOpenSection('people')}
            />
          ) : null}
          <NavButton
            active={activeSection === 'payments'}
            icon={<CreditCard size={18} />}
            label="Оплаты"
            onClick={() => onOpenSection('payments')}
          />
          {isMember ? (
            <NavButton
              active={activeSection === 'schedule'}
              icon={<CalendarDays size={18} />}
              label="Расписание"
              onClick={() => onOpenSection('schedule')}
            />
          ) : (
            <NavButton
              active={activeSection === 'groups'}
              icon={<Layers3 size={18} />}
              label="Группы"
              onClick={() => onOpenSection('groups')}
            />
          )}
          <NavButton
            active={activeSection === 'settings'}
            icon={<Settings size={18} />}
            label="Настройки"
            mobileHidden
            onClick={() => onOpenSection('settings')}
          />
        </nav>

        <div className="crm-sidebar-footer">
          {/* Переключение ролей и сброс данных доступны только в локальном тестовом режиме. */}
          {isLocalMode ? (
            <label className="crm-role-select">
              Работать как
              <select value={activeUser.id} onChange={(event) => onSelectActiveUser(event.target.value)}>
                {workspace.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} · {roleLabel(user)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button className="crm-sidebar-action" type="button" onClick={onOpenNewWindow}>
            <ExternalLink size={16} />
            Новое окно
          </button>
          {isLocalMode ? (
            <button className="crm-sidebar-action danger" type="button" onClick={onReset}>
              <RotateCcw size={16} />
              Сбросить данные
            </button>
          ) : (
            <button className="crm-sidebar-action" type="button" onClick={onSignOut}>
              <LogOut size={16} />
              Выйти
            </button>
          )}
        </div>
      </aside>

      <main className="crm-main">
        {mobileAccountOpen ? (
          <button
            aria-label="Закрыть меню аккаунта"
            className="mobile-account-dismiss"
            type="button"
            onClick={onCloseMobileAccount}
          />
        ) : null}
        {mobileFormOpen ? (
          <button
            aria-label="Закрыть форму добавления"
            className="mobile-form-backdrop"
            type="button"
            onClick={onCloseMobileForm}
          />
        ) : null}
        <div className={mobileAccountOpen ? 'mobile-topbar account-open' : 'mobile-topbar'}>
          <div className="mobile-account-cluster">
            <button
              aria-expanded={mobileAccountOpen}
              aria-label="Меню аккаунта"
              className="mobile-avatar-button"
              type="button"
              onClick={onToggleMobileAccount}
            >
              <span>
                {activeUser.first_name.slice(0, 1)}
                {activeUser.last_name.slice(0, 1)}
              </span>
            </button>
            <button
              aria-label="Аккаунт"
              className="mobile-account-action action-account"
              type="button"
              tabIndex={mobileAccountOpen ? 0 : -1}
              onClick={() => onOpenSection('settings')}
            >
              <UserRound size={18} />
            </button>
            <button
              aria-label="Настройки"
              className="mobile-account-action action-settings"
              type="button"
              tabIndex={mobileAccountOpen ? 0 : -1}
              onClick={() => onOpenSection('settings')}
            >
              <Settings size={18} />
            </button>
            {!isLocalMode ? (
              <button
                aria-label="Выйти"
                className="mobile-account-action action-logout"
                type="button"
                tabIndex={mobileAccountOpen ? 0 : -1}
                onClick={onRequestLogout}
              >
                <LogOut size={18} />
              </button>
            ) : null}
          </div>
          <div className="mobile-title">
            <strong>{workspace.organization.name}</strong>
            <span>{roleLabel(activeUser)}</span>
          </div>
          <button
            aria-label="Уведомления"
            aria-expanded={notificationsOpen}
            className="mobile-notification-button"
            type="button"
            onClick={onOpenNotifications}
          >
            <Bell size={18} />
            {unreadNotificationCount > 0 ? <strong>{unreadNotificationCount}</strong> : null}
          </button>
        </div>
        <header className="crm-header">
          <div>
            <h1>{sectionMeta[activeSection].title}</h1>
            <p>{sectionMeta[activeSection].description}</p>
          </div>
          <div className="crm-header-actions">
            <button
              aria-label="Уведомления"
              aria-expanded={notificationsOpen}
              className="header-notification-button desktop-notification-button"
              type="button"
              onClick={onOpenNotifications}
            >
              <Bell size={19} />
              {unreadNotificationCount > 0 ? <strong>{unreadNotificationCount}</strong> : null}
            </button>
            {canCreateFromHeader ? (
              <button
                aria-expanded={mobileFormOpen}
                aria-label="Добавить"
                className="mobile-create-button"
                type="button"
                onClick={onOpenMobileForm}
              >
                <Plus size={18} />
                {activeSection === 'groups' ? 'Новая группа' : 'Добавить'}
              </button>
            ) : null}
            <div className="crm-user-badge">
              <span>{roleLabel(activeUser)}</span>
              <strong>{activeUser.first_name} {activeUser.last_name}</strong>
            </div>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}

function NavButton({
  active,
  count,
  icon,
  label,
  mobileHidden,
  onClick
}: {
  active: boolean;
  count?: number;
  icon: ReactNode;
  label: string;
  mobileHidden?: boolean;
  onClick: () => void;
}): React.ReactElement {
  const ignoreNextClickRef = useRef(false);

  // iOS после touchend генерирует click: флаг не даёт навигации сработать дважды.
  function handleTouchEnd(event: React.TouchEvent<HTMLButtonElement>): void {
    event.preventDefault();
    ignoreNextClickRef.current = true;
    onClick();
    window.setTimeout(() => {
      ignoreNextClickRef.current = false;
    }, 350);
  }

  function handleClick(): void {
    if (ignoreNextClickRef.current) return;
    onClick();
  }

  return (
    <button
      className={`${active ? 'crm-nav-button active' : 'crm-nav-button'}${mobileHidden ? ' mobile-hidden' : ''}`}
      type="button"
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
    >
      {icon}
      <span>{label}</span>
      {count ? <strong>{count}</strong> : null}
    </button>
  );
}
