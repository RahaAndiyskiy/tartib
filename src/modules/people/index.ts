export { PeoplePanel } from './components/PeoplePanel';
export {
  canManagePeople,
  isTrainerOnly
} from './permissions';
export {
  filterPeopleForView,
  mapAssignmentsByMemberId,
  mapGroupMembershipByMemberId,
  selectAllMembers,
  selectPeopleForView,
  selectTrainers,
  selectVisibleMembers
} from './model/selectors';
export {
  assignMemberToGroupAction,
  deleteMemberAction
} from './actions/peopleActions';
