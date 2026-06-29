type LogoutConfirmModalProps = {
  onCancel: () => void;
  onConfirm: () => void;
};

export function LogoutConfirmModal({
  onCancel,
  onConfirm
}: LogoutConfirmModalProps): React.ReactElement {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <section
        aria-labelledby="logout-confirm-title"
        aria-modal="true"
        className="confirm-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h2 id="logout-confirm-title">Выйти из аккаунта?</h2>
          <p>После выхода нужно будет снова ввести логин и пароль.</p>
        </div>
        <div className="confirm-modal-actions">
          <button className="primary-button danger-soft" type="button" onClick={onConfirm}>
            Выйти
          </button>
          <button className="small-button secondary" type="button" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </section>
    </div>
  );
}
