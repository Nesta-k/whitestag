import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, id, error, className = "", ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={`input ${error ? "input-error" : ""} ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...props}
      />
      {error ? (
        <p className="field-error" id={`${inputId}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
