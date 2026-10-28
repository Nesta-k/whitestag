import type { SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: React.ReactNode;
}

export function Select({
  label,
  id,
  children,
  className = "",
  ...props
}: SelectProps) {
  const selectId = id ?? props.name;
  return (
    <div className="field">
      <label className="field-label" htmlFor={selectId}>
        {label}
      </label>
      <select id={selectId} className={`select ${className}`.trim()} {...props}>
        {children}
      </select>
    </div>
  );
}
