import type { ComponentProps } from 'react';
import type { AppUser } from '@shared/types/domain';
import { hasRole } from '@/core/roles';
import { PeoplePanel } from '@/modules/people';
import { MemberPaymentPanel } from '@/modules/payments';
import type { DashboardSection } from '../types';
import { ExpensesSection } from './ExpensesSection';
import { GroupsSection } from './GroupsSection';
import { OverviewSection } from './OverviewSection';
import { PaymentWorkspaceSection } from './PaymentWorkspaceSection';
import { PersonFormPanel } from './PersonFormPanel';
import { ScheduleSection } from './ScheduleSection';
import { SettingsSection } from './SettingsSection';

type DashboardSectionsProps = {
  activeSection: DashboardSection;
  activeUser: AppUser;
  overviewProps: ComponentProps<typeof OverviewSection> | null;
  peopleProps: ComponentProps<typeof PeoplePanel>;
  personFormProps: ComponentProps<typeof PersonFormPanel>;
  memberPaymentProps: ComponentProps<typeof MemberPaymentPanel>;
  paymentWorkspaceProps: ComponentProps<typeof PaymentWorkspaceSection>;
  groupsProps: ComponentProps<typeof GroupsSection>;
  scheduleProps: ComponentProps<typeof ScheduleSection>;
  expensesProps: ComponentProps<typeof ExpensesSection>;
  settingsProps: ComponentProps<typeof SettingsSection>;
};

export function DashboardSections({
  activeSection,
  activeUser,
  overviewProps,
  peopleProps,
  personFormProps,
  memberPaymentProps,
  paymentWorkspaceProps,
  groupsProps,
  scheduleProps,
  expensesProps,
  settingsProps
}: DashboardSectionsProps): React.ReactElement {
  return (
    <>
      {activeSection === 'overview' && overviewProps ? (
        <OverviewSection {...overviewProps} />
      ) : null}

      {activeSection === 'people' ? (
        <section className="crm-content-grid">
          <PeoplePanel {...peopleProps} />
          <PersonFormPanel {...personFormProps} />
        </section>
      ) : null}

      {activeSection === 'payments' && hasRole(activeUser, 'member') ? (
        <MemberPaymentPanel {...memberPaymentProps} />
      ) : null}

      {activeSection === 'payments' && !hasRole(activeUser, 'member') ? (
        <PaymentWorkspaceSection {...paymentWorkspaceProps} />
      ) : null}

      {activeSection === 'groups' ? <GroupsSection {...groupsProps} /> : null}
      {activeSection === 'schedule' ? <ScheduleSection {...scheduleProps} /> : null}
      {activeSection === 'expenses' && activeUser.role === 'owner' ? (
        <ExpensesSection {...expensesProps} />
      ) : null}
      {activeSection === 'settings' ? <SettingsSection {...settingsProps} /> : null}
    </>
  );
}
