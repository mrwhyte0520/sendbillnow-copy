import { useEffect, useState } from 'react';
import type React from 'react';
import { formatDate } from '../../utils/dateFormat';

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
  const [displayValue, setDisplayValue] = useState<string>(formatDate(initial));

  const { name, ...restInput } = rest;

  useEffect(() => {
    if (value !== undefined) {
      const next = value === null ? '' : String(value);
      setInternalValue(next);
      setDisplayValue(formatDate(next));
    }
  }, [value]);

  const effectiveValue = value !== undefined && value !== null ? String(value) : internalValue;

  useEffect(() => {
    setDisplayValue(formatDate(effectiveValue));
  }, [effectiveValue]);

  const parseDisplayToIso = (raw: string): string | null => {
    const s = String(raw || '').trim();
    const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(s);
    if (!m) return null;
    const mm = Math.max(1, Math.min(12, Number(m[1])));
    const dd = Math.max(1, Math.min(31, Number(m[2])));
    const yyyy = Number(m[3]);
    if (!Number.isFinite(yyyy) || yyyy < 1900 || yyyy > 2500) return null;
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const iso = `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
    // validate actual date
    const d = new Date(yyyy, mm - 1, dd);
    if (Number.isNaN(d.getTime())) return null;
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
    return iso;
  };

  return (
    <div className="relative">
      <input
        {...restInput}
        type="text"
        inputMode="numeric"
        placeholder="MM/DD/YYYY"
        value={displayValue}
        onChange={(e) => {
          const nextDisplay = e.target.value;
          setDisplayValue(nextDisplay);
          if (String(nextDisplay || '').trim() === '') {
            if (value === undefined || value === null) {
              setInternalValue('');
            }
            onValueChange?.('');
            rest.onChange?.({
              ...(e as any),
              target: { ...(e.target as any), value: '' },
              currentTarget: { ...(e.currentTarget as any), value: '' },
            } as any);
            return;
          }
          const iso = parseDisplayToIso(nextDisplay);
          if (iso) {
            if (value === undefined || value === null) {
              setInternalValue(iso);
            }
            onValueChange?.(iso);
            // For compatibility with existing callers that use onChange expecting ISO (YYYY-MM-DD)
            rest.onChange?.({
              ...(e as any),
              target: { ...(e.target as any), value: iso },
              currentTarget: { ...(e.currentTarget as any), value: iso },
            } as any);
          }
        }}
        onBlur={(e) => {
          const iso = parseDisplayToIso(e.target.value);
          if (iso) {
            setDisplayValue(formatDate(iso));
          } else {
            setDisplayValue(formatDate(effectiveValue));
          }
          rest.onBlur?.(e);
        }}
        className={className}
      />

      <input
        {...restInput}
        type="date"
        name={name}
        tabIndex={-1}
        aria-hidden="true"
        value={effectiveValue}
        onChange={(e) => {
          const next = e.target.value;
          if (value === undefined || value === null) {
            setInternalValue(next);
          }
          onValueChange?.(next);
          setDisplayValue(formatDate(next));
          rest.onChange?.(e);
        }}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />

      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500">
        <i className="ri-calendar-line" />
      </div>
    </div>
  );
}
