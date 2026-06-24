import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from './classNames';

type BadgeTone =
  | 'active'
  | 'danger'
  | 'delayed'
  | 'muted'
  | 'paid'
  | 'payment_confirmation'
  | 'warning';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  compact?: boolean;
  tone?: BadgeTone;
};

const toneClass: Record<BadgeTone, string> = {
  active: 'active',
  danger: 'overdue',
  delayed: 'delayed',
  muted: 'not-set',
  paid: 'paid',
  payment_confirmation: 'payment_confirmation',
  warning: 'delay_requested'
};

export function Badge({
  children,
  className,
  compact = false,
  tone = 'muted',
  ...props
}: BadgeProps): JSX.Element {
  return (
    <span className={classNames('ui-badge', 'status-pill', toneClass[tone], compact && 'compact', className)} {...props}>
      {children}
    </span>
  );
}
