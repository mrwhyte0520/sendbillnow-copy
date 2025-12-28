import { useEffect, useState } from 'react';
import type React from 'react';

type DateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & {
  value?: string | null;
  onValueChange?: (value: string) => void;
};

/**
 * Simple date input with optional controlled value.
 * - Shows native date picker.
 * - Supports placeholder and custom className.
 */
export default function DateInput({ value, onValueChange, className, defaultValue, ...rest }: DateInputProps) {
  const initial = (value ?? defaultValue ?? '') as string;
  const [internalValue, setInternalValue] = useState<string>(initial);

  useEffect(() => {
    if (value !== undefined && value !== null) {
      setInternalValue(String(value));
    }
  }, [value]);

  const effectiveValue = value !== undefined && value !== null ? String(value) : internalValue;

  return (
    <input
      {...rest}
      type="date"
      value={effectiveValue}
      onChange={(e) => {
        const next = e.target.value;
        if (value === undefined || value === null) {
          setInternalValue(next);
        }
        onValueChange?.(next);
        rest.onChange?.(e);
      }}
      className={className}
    />
  );
}
