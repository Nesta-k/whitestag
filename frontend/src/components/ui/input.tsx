import React from "react";

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, id, className = "", ...props }: Props) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      <input id={id} className={`field-input ${error ? "field-input--error" : ""}`} {...props} />
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

