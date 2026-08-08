import { ReactNode } from "react";

/** Labeled control laid out in a column. */
export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="col">
      {label}
      {children}
    </label>
  );
}

/** Checkbox with a label, laid out in a row. */
export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

/** Number input that only reports values passing `isValid`. */
export function NumberField({
  value,
  onChange,
  isValid = Number.isFinite,
  width = 56,
  ...rest
}: {
  value: number;
  onChange: (value: number) => void;
  isValid?: (value: number) => boolean;
  width?: number;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      style={{ width }}
      onChange={(event) => {
        const parsed = Number(event.target.value);
        if (Number.isFinite(parsed) && isValid(parsed)) onChange(parsed);
      }}
      {...rest}
    />
  );
}

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  hint?: string;
}

/** Row of mutually exclusive buttons — the toolbar's tool and mode pickers. */
export function SegmentedButtons<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <>
      {options.map((option) => (
        <button
          key={option.id}
          title={option.hint}
          className={value === option.id ? "active" : ""}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </>
  );
}
