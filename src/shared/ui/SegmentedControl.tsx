import type { ReactNode } from 'react';
import { classNames } from './classNames';

type SegmentedOption<TValue extends string> = {
  label: ReactNode;
  value: TValue;
};

type SegmentedControlProps<TValue extends string> = {
  ariaLabel: string;
  className?: string;
  onChange: (value: TValue) => void;
  options: Array<SegmentedOption<TValue>>;
  value: TValue;
};

export function SegmentedControl<TValue extends string>({
  ariaLabel,
  className,
  onChange,
  options,
  value
}: SegmentedControlProps<TValue>): JSX.Element {
  return (
    <div aria-label={ariaLabel} className={classNames('ui-segmented-control', 'segmented-control', className)} role="tablist">
      {options.map((option) => (
        <button
          aria-selected={option.value === value}
          className={option.value === value ? 'active' : ''}
          key={option.value}
          onClick={() => onChange(option.value)}
          role="tab"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
