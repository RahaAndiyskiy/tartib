import {
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';

type DashboardUiState = {
  expandedPeople: Record<string, boolean>;
  groupEditorOpenByMember: Record<string, boolean>;
  historyOpenByMember: Record<string, boolean>;
  peopleGroupFilter: string;
  peopleSearch: string;
  setGroupEditorOpenByMember: Dispatch<SetStateAction<Record<string, boolean>>>;
  setHistoryOpenByMember: Dispatch<SetStateAction<Record<string, boolean>>>;
  setPeopleGroupFilter: Dispatch<SetStateAction<string>>;
  setPeopleSearch: Dispatch<SetStateAction<string>>;
  toggleGroupEditor: (memberId: string, nextOpen?: boolean) => void;
  togglePersonExpanded: (userId: string, nextOpen?: boolean) => void;
};

export function useDashboardUiState(): DashboardUiState {
  const [peopleSearch, setPeopleSearch] = useState('');
  const [peopleGroupFilter, setPeopleGroupFilter] = useState('all');
  const [expandedPeople, setExpandedPeople] = useState<Record<string, boolean>>({});
  const [groupEditorOpenByMember, setGroupEditorOpenByMember] = useState<Record<string, boolean>>({});
  const [historyOpenByMember, setHistoryOpenByMember] = useState<Record<string, boolean>>({});

  function togglePersonExpanded(userId: string, nextOpen?: boolean): void {
    setExpandedPeople((current) => ({
      ...current,
      [userId]: nextOpen ?? !current[userId]
    }));
  }

  function toggleGroupEditor(memberId: string, nextOpen?: boolean): void {
    setGroupEditorOpenByMember((current) => ({
      ...current,
      [memberId]: nextOpen ?? !current[memberId]
    }));
  }

  return {
    expandedPeople,
    groupEditorOpenByMember,
    historyOpenByMember,
    peopleGroupFilter,
    peopleSearch,
    setGroupEditorOpenByMember,
    setHistoryOpenByMember,
    setPeopleGroupFilter,
    setPeopleSearch,
    toggleGroupEditor,
    togglePersonExpanded
  };
}
