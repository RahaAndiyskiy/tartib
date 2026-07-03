import { Plus } from 'lucide-react';

type ModalCloseButtonProps = {
  label?: string;
  onClick: () => void;
};

export function ModalCloseButton({
  label = 'Закрыть',
  onClick
}: ModalCloseButtonProps): React.ReactElement {
  return (
    <button className="modal-close-button" aria-label={label} type="button" onClick={onClick}>
      <Plus size={20} />
    </button>
  );
}
