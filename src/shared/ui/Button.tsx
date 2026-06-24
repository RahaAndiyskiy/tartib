import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { classNames } from './classNames';

type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'text';
type ButtonSize = 'md' | 'sm';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  icon?: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: 'ui-button-primary primary-button',
  secondary: 'ui-button-secondary ghost-button',
  soft: 'ui-button-soft small-button primary-soft',
  ghost: 'ui-button-ghost ghost-button',
  danger: 'ui-button-danger ghost-button danger',
  text: 'ui-button-text text-button'
};

export function Button({
  children,
  className,
  fullWidth = false,
  icon,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      className={classNames(
        'ui-button',
        variantClass[variant],
        size === 'sm' && 'ui-button-sm',
        fullWidth && 'full-width-button',
        className
      )}
      type={type}
      {...props}
    >
      {icon ? <span className="ui-button-icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
