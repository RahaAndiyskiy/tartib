type DashboardLoadingStateProps = {
  error: string;
  onRetry: () => void;
  onLogin: () => void;
};

export function DashboardLoadingState({
  error,
  onRetry,
  onLogin
}: DashboardLoadingStateProps): React.ReactElement {
  return (
    <main className="app-shell loading-state">
      <section className="loading-card">
        <strong>Загружаем клуб...</strong>
        {error ? (
          <>
            <p>{error}</p>
            <div>
              <button className="primary-button" type="button" onClick={onRetry}>
                Повторить
              </button>
              <button className="ghost-button" type="button" onClick={onLogin}>
                Войти заново
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
