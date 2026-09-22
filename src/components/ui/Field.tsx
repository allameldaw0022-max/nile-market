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
        <label htmlFor={htmlFor} className="block text-[13px] font-bold text-navy-700">
          {label}
          {required && <span className="text-[--color-danger] ms-1" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert"
           className="text-xs text-[--color-danger] font-medium">{error}</p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-sand-600">{hint}</p>
      ) : null}
    </div>
  );
}

const base =
  'w-full rounded-[--radius-md] border bg-white px-3 text-[15px] text-navy-900 ' +
  'placeholder:text-sand-400 transition-colors ' +
  'disabled:bg-sand-100 disabled:text-sand-600';

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
          error ? 'border-[--color-danger]' : 'border-sand-300 focus:border-nile-500',
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
          error ? 'border-[--color-danger]' : 'border-sand-300 focus:border-nile-500',
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
          error ? 'border-[--color-danger]' : 'border-sand-300 focus:border-nile-500',
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
    <label className="flex cursor-pointer items-start gap-3 rounded-[--radius-md]
                      border border-sand-200 p-3.5 hover:border-nile-300">
      <input type="checkbox" name={name} className="mt-0.5 size-4 accent-[--color-nile-500]"
             defaultChecked={defaultChecked} checked={checked}
             onChange={onChange ? (e) => onChange(e.target.checked) : undefined} />
      <span>
        <span className="block text-sm font-bold text-navy-900">{label}</span>
        {hint && <span className="block text-xs text-sand-600">{hint}</span>}
      </span>
    </label>
  );
}
