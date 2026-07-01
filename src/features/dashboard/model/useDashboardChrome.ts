import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import type { DashboardSection } from '../types';

type DashboardChromeState = {
  activeSection: DashboardSection;
  mobileFormOpen: boolean;
  mobileAccountOpen: boolean;
  notificationsOpen: boolean;
  logoutConfirmOpen: boolean;
  invitePickerOpen: boolean;
  setActiveSection: Dispatch<SetStateAction<DashboardSection>>;
  setMobileFormOpen: Dispatch<SetStateAction<boolean>>;
  setMobileAccountOpen: Dispatch<SetStateAction<boolean>>;
  setNotificationsOpen: Dispatch<SetStateAction<boolean>>;
  setLogoutConfirmOpen: Dispatch<SetStateAction<boolean>>;
  setInvitePickerOpen: Dispatch<SetStateAction<boolean>>;
  closeTransientUi: () => void;
  openSection: (section: DashboardSection) => void;
  switchActiveUserSection: (section: DashboardSection) => void;
  openNotifications: () => void;
  openPayments: () => void;
  openFormSection: (section: DashboardSection) => void;
  openMobileForm: () => void;
  closeMobileForm: () => void;
  toggleMobileAccount: () => void;
  closeMobileAccount: () => void;
  closeNotifications: () => void;
  closeInvitePicker: () => void;
  openInvitePicker: () => void;
  closeLogoutConfirm: () => void;
  requestLogout: () => void;
};

export function useDashboardChrome(initialSection: DashboardSection = 'overview'): DashboardChromeState {
  const [activeSection, setActiveSection] = useState<DashboardSection>(initialSection);
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);

  const closeTransientUi = useCallback((): void => {
    setMobileFormOpen(false);
    setMobileAccountOpen(false);
    setNotificationsOpen(false);
    setInvitePickerOpen(false);
  }, []);

  const openSection = useCallback((section: DashboardSection): void => {
    setActiveSection(section);
    closeTransientUi();
  }, [closeTransientUi]);

  const switchActiveUserSection = useCallback((section: DashboardSection): void => {
    setActiveSection(section);
    closeTransientUi();
  }, [closeTransientUi]);

  const openNotifications = useCallback((): void => {
    setNotificationsOpen(true);
    setMobileFormOpen(false);
    setMobileAccountOpen(false);
    setInvitePickerOpen(false);
  }, []);

  const openPayments = useCallback((): void => {
    setActiveSection('payments');
    setMobileFormOpen(false);
    setMobileAccountOpen(false);
    setNotificationsOpen(false);
  }, []);

  const openFormSection = useCallback((section: DashboardSection): void => {
    setActiveSection(section);
    setMobileFormOpen(true);
    setMobileAccountOpen(false);
    setNotificationsOpen(false);
    setInvitePickerOpen(false);
  }, []);

  const openMobileForm = useCallback((): void => {
    setMobileFormOpen(true);
  }, []);

  const closeMobileForm = useCallback((): void => {
    setMobileFormOpen(false);
  }, []);

  const toggleMobileAccount = useCallback((): void => {
    setMobileAccountOpen((current) => !current);
  }, []);

  const closeMobileAccount = useCallback((): void => {
    setMobileAccountOpen(false);
  }, []);

  const closeNotifications = useCallback((): void => {
    setNotificationsOpen(false);
  }, []);

  const closeInvitePicker = useCallback((): void => {
    setInvitePickerOpen(false);
  }, []);

  const openInvitePicker = useCallback((): void => {
    setInvitePickerOpen(true);
    setMobileFormOpen(false);
    setMobileAccountOpen(false);
    setNotificationsOpen(false);
  }, []);

  const closeLogoutConfirm = useCallback((): void => {
    setLogoutConfirmOpen(false);
  }, []);

  const requestLogout = useCallback((): void => {
    setMobileAccountOpen(false);
    setLogoutConfirmOpen(true);
  }, []);

  return {
    activeSection,
    mobileFormOpen,
    mobileAccountOpen,
    notificationsOpen,
    logoutConfirmOpen,
    invitePickerOpen,
    setActiveSection,
    setMobileFormOpen,
    setMobileAccountOpen,
    setNotificationsOpen,
    setLogoutConfirmOpen,
    setInvitePickerOpen,
    closeTransientUi,
    openSection,
    switchActiveUserSection,
    openNotifications,
    openPayments,
    openFormSection,
    openMobileForm,
    closeMobileForm,
    toggleMobileAccount,
    closeMobileAccount,
    closeNotifications,
    closeInvitePicker,
    openInvitePicker,
    closeLogoutConfirm,
    requestLogout
  };
}
