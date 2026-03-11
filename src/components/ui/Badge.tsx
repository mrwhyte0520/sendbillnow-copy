import React from 'react';

type BadgeSize = 'sm' | 'md' | 'lg';

type BadgeVariant =
  | 'success'
  | 'info'
  | 'warning'
  | 'neutral';

interface BadgeProps {
  children: React.ReactNode;
  size?: BadgeSize;
  variant?: BadgeVariant;
}

export default function Badge({
  children,
  size = 'sm',
  variant = 'neutral',
}: BadgeProps) {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-sm',
  };

  const variantStyles = {
    success: 'bg-emerald-50 text-emerald-700',
    info: 'bg-blue-50 text-blue-700',
    warning: 'bg-amber-50 text-amber-700',
    neutral: 'bg-slate-100 text-slate-700',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md font-medium ${sizeStyles[size]} ${variantStyles[variant]}`}
    >
      {children}
    </span>
  );
}
