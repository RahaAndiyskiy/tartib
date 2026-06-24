import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { classNames } from './classNames';

type FieldShellProps = {
  children: ReactNode;
  className?: string;
  hint?: string;
  label: string;
  optional?: boolean;
};

function FieldShell({ children, className, hint, label, optional = false }: FieldShellProps): JSX.Element {
  return (
    <label className={classNames('ui-field', className)}>
      <span className="ui-field-label">
        {label}
        {optional ? <span className="optional-label">необязательно</span> : null}
      </span>
      {children}
      {hint ? <span className="ui-field-hint">{hint}</span> : null}
    </label>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  hint?: string;
  label: string;
  optional?: boolean;
};

export function TextField({
  className,
  hint,
  label,
  optional,
  ...props
}: TextFieldProps): JSX.Element {
  return (
    <FieldShell hint={hint} label={label} optional={optional}>
      <input className={classNames('ui-input', className)} {...props} />
    </FieldShell>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  hint?: string;
  label: string;
  optional?: boolean;
};

export function SelectField({
  children,
  className,
  hint,
  label,
  optional,
  ...props
}: SelectFieldProps): JSX.Element {
  return (
    <FieldShell hint={hint} label={label} optional={optional}>
      <select className={classNames('ui-select', className)} {...props}>
        {children}
      </select>
    </FieldShell>
  );
}
