import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from './classNames';

type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'aside' | 'div' | 'section';
  children: ReactNode;
  title?: string;
  description?: string;
};

export function Panel({
  as: Component = 'section',
  children,
  className,
  description,
  title,
  ...props
}: PanelProps): JSX.Element {
  return (
    <Component className={classNames('ui-panel', 'crm-panel', className)} {...props}>
      {title || description ? (
        <div className="crm-panel-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
        </div>
      ) : null}
      {children}
    </Component>
  );
}
