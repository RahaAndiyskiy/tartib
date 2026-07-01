import type { AppUser } from '@shared/types/domain';
import { hasRole } from '@/core/roles';
import type { DashboardSection } from '../types';

export type DashboardSectionMeta = Record<DashboardSection, {
  title: string;
  description: string;
}>;

export function buildSectionMeta(activeUser: AppUser | null): DashboardSectionMeta {
  return {
    overview: {
      title: 'Обзор',
      description: 'Главные показатели и текущая ситуация в клубе'
    },
    people: {
      title:
        activeUser && hasRole(activeUser, 'trainer') && !hasRole(activeUser, 'owner')
          ? 'Мои ученики'
          : 'Команда',
      description: 'Тренеры, ученики и распределение ответственности'
    },
    payments: {
      title: activeUser?.role === 'member' ? 'Моя оплата' : 'Оплаты',
      description: 'Текущие суммы, сроки и подтверждения учеников'
    },
    groups: {
      title: 'Группы',
      description: 'Направления, дни и время занятий тренеров'
    },
    schedule: {
      title: activeUser?.role === 'member' ? 'Моё расписание' : 'Расписание',
      description:
        activeUser?.role === 'member'
          ? 'Дни и время ваших тренировок'
          : 'Расписание тренировок учеников'
    },
    expenses: {
      title: 'Расходы',
      description: 'Аренда, коммунальные и другие затраты клуба'
    },
    settings: {
      title: 'Настройки',
      description: 'Профиль, уведомления и параметры клуба'
    }
  };
}

export function sectionForActiveUserChange({
  currentSection,
  nextUser
}: {
  currentSection: DashboardSection;
  nextUser: AppUser | null | undefined;
}): DashboardSection {
  if (currentSection === 'expenses') return 'overview';
  if (currentSection === 'people' && nextUser?.role === 'member') return 'overview';
  if (currentSection === 'groups' && nextUser?.role === 'member') return 'overview';
  if (currentSection === 'schedule' && nextUser?.role !== 'member') return 'groups';

  return currentSection;
}
