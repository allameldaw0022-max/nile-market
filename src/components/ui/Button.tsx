import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold';
type Size = 'sm' | 'md' | 'lg';

/**
 * ★ الأساسي على `teal-600` لا `teal-500`: الأبيض على ‎#00A88F يعطي
 * 3.00:1 — أي أن أهمّ زرّ في المنتج يسقط دون WCAG AA. و‎#008672
 * يعطي 4.51:1 بالدرجة اللونية نفسها. الهوية محفوظة، والنصّ مقروء.
 */
const VARIANTS: Record<Variant, string> = {
  primary:   'bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800 disabled:bg-ink-300',
  secondary: 'bg-ink-800 text-white hover:bg-ink-700 disabled:bg-ink-300',
  outline:   'border border-ink-200 bg-white text-ink-900 hover:border-teal-600 hover:text-teal-700',
  ghost:     'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  danger:    'bg-danger text-white hover:brightness-95',
  // الذهبي لمسة Premium محدودة — نصّه شاركول (7.34:1) لا أبيض (2.40:1)
  gold:      'bg-gold-500 text-ink-900 hover:brightness-95',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9  px-3.5 text-[13px] gap-1.5 rounded-sm',
  md: 'h-11 px-4.5 text-[15px] gap-2   rounded-md',
  lg: 'h-12 px-6   text-[15px] gap-2   rounded-md',
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
        'inline-flex shrink-0 items-center justify-center font-semibold',
        'transition-[background-color,border-color,color] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'min-w-11',                    // هدف لمس ≥44px على الهاتف
        VARIANTS[variant], SIZES[size], className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** رابط بمظهر زرّ — نفس المقاسات والأنماط، دلالة `a` الصحيحة. */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center font-semibold min-w-11',
    'transition-[background-color,border-color,color] duration-150',
    VARIANTS[variant], SIZES[size], className,
  );
}
