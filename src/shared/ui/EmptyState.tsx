import type { ReactNode } from 'react';
import { classNames } from './classNames';

type EmptyStateProps = {
  action?: ReactNode;
  className?: string;
  description?: string;
  title: string;
};

export function EmptyState({ action, className, description, title }: EmptyStateProps): JSX.Element {
  return (
    <div className={classNames('ui-empty-state', 'empty-state', Boolean(action) && 'action-empty', className)}>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="ui-empty-state-action">{action}</div> : null}
    </div>
  );
}
