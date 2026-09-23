'use client';
import { cn } from '@/lib/cn';
import { useId } from 'react';
import type {
  InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
} from 'react';

function Wrapper({ label, hint, error, required, htmlFor, children }: {
  label?: string; hint?: string; error?: string; required?: boolean;
  htmlFor: string; children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-[13px] font-bold text-ink-700">
          {label}
          {required && <span className="text-danger ms-1" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert"
           className="text-xs text-danger font-medium">{error}</p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

const base =
  'w-full rounded-md border bg-white px-3 text-[15px] text-ink-900 ' +
  'placeholder:text-ink-400 transition-colors ' +
  'disabled:bg-ink-100 disabled:text-ink-500';

export function Input({
  label, hint, error, className, required, ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string; hint?: string; error?: string;
}) {
  const id = useId();
  const inputId = props.id ?? id;
  return (
    <Wrapper label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <input
        {...props}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(base, 'h-11',
          error ? 'border-danger' : 'border-ink-400 focus:border-teal-600',
          className)}
      />
    </Wrapper>
  );
}

export function Textarea({
  label, hint, error, className, required, ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string; hint?: string; error?: string;
}) {
  const id = useId();
  const inputId = props.id ?? id;
  return (
    <Wrapper label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <textarea
        {...props}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(base, 'py-2.5 min-h-24 leading-relaxed',
          error ? 'border-danger' : 'border-ink-400 focus:border-teal-600',
          className)}
      />
    </Wrapper>
  );
}

export function Select({
  label, hint, error, className, required, children, ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string; hint?: string; error?: string;
}) {
  const id = useId();
  const inputId = props.id ?? id;
  return (
    <Wrapper label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <select
        {...props}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(base, 'h-11',
          error ? 'border-danger' : 'border-ink-400 focus:border-teal-600',
          className)}
      >
        {children}
      </select>
    </Wrapper>
  );
}

export function Switch({ label, hint, name, defaultChecked, checked, onChange }: {
  label: string; hint?: string; name?: string;
  defaultChecked?: boolean; checked?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md
                      border border-ink-200 p-3.5 hover:border-teal-300">
      <input type="checkbox" name={name} className="mt-0.5 size-4 accent-teal-600"
             defaultChecked={defaultChecked} checked={checked}
             onChange={onChange ? (e) => onChange(e.target.checked) : undefined} />
      <span>
        <span className="block text-sm font-bold text-ink-900">{label}</span>
        {hint && <span className="block text-xs text-ink-500">{hint}</span>}
      </span>
    </label>
  );
}
