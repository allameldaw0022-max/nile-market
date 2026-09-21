import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:   'bg-nile-500 text-white hover:bg-nile-600 active:bg-nile-700 disabled:bg-sand-300',
  secondary: 'bg-navy-900 text-white hover:bg-navy-700 disabled:bg-sand-300',
  outline:   'border border-sand-300 bg-white text-navy-900 hover:border-nile-500 hover:text-nile-600',
  ghost:     'text-navy-700 hover:bg-sand-100',
  danger:    'bg-[--color-danger] text-white hover:brightness-95',
  // الذهبي Accent فقط — لا يُستخدم كزر أساسي متكرر (§17.1)
  gold:      'bg-gold-500 text-navy-900 hover:bg-gold-600',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5',
  md: 'h-11 px-4 text-[15px] gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export function Button({
  variant = 'primary', size = 'md', loading = false, icon,
  className, children, disabled, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-[--radius-md] font-bold',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        // هدف لمس ≥44px على الهاتف
        'min-w-11',
        VARIANTS[variant], SIZES[size], className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
