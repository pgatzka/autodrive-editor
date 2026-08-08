import { ReactNode } from "react";

/**
 * Shared controls. Every one exposes the same states the design system
 * specifies (default / hover / active / focus / disabled) through CSS classes
 * rather than props, so a state can never be styled two different ways.
 */

export type ButtonVariant = "secondary" | "primary" | "ghost" | "danger" | "danger-solid";

export function Button({
  children,
  variant = "secondary",
  shortcut,
  wide,
  small,
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  /** rendered as a keycap inside the button */
  shortcut?: string;
  wide?: boolean;
  small?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const variantClass = variant === "danger-solid" ? "danger solid" : variant;
  return (
    <button className={cx("btn", variantClass, wide && "wide", small && "sm")} {...rest}>
      {children}
      {shortcut && <kbd className="key">{shortcut}</kbd>}
    </button>
  );
}

export function Keycap({ children }: { children: ReactNode }) {
  return <kbd className="key">{children}</kbd>;
}

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  hint?: string;
  /** small graphic shown before the label — carries the meaning without colour */
  sample?: ReactNode;
  shortcut?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.id}
          role="radio"
          aria-checked={value === option.id}
          title={option.hint}
          className={value === option.id ? "selected" : ""}
          onClick={() => onChange(option.id)}
        >
          {option.sample}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  mixed,
  disabled,
  onChange,
}: {
  label: ReactNode;
  hint?: string;
  checked: boolean;
  /** some of the selection has the flag, some does not */
  mixed?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cx("toggle", !hint && "compact")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = mixed === true && !checked;
        }}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="track" />
      <span className="labels">
        <span className="name">{label}</span>
        {hint && <span className="hint">{mixed ? "mixed" : hint}</span>}
      </span>
    </label>
  );
}

/** Numeric stepper — grid size is adjusted far more often than it is typed. */
export function Stepper({
  value,
  format,
  onStep,
  ariaLabel,
}: {
  value: number;
  format: (value: number) => string;
  onStep: (direction: -1 | 1) => void;
  ariaLabel: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={ariaLabel}>
      <button onClick={() => onStep(-1)} aria-label={`Decrease ${ariaLabel}`}>
        −
      </button>
      <span className="value">{format(value)}</span>
      <button onClick={() => onStep(1)} aria-label={`Increase ${ariaLabel}`}>
        +
      </button>
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="section">
      {title && <h4 className="eyebrow">{title}</h4>}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field-col">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="title">{title}</p>
      <p className="body">{children}</p>
    </div>
  );
}

export function cx(...values: (string | false | undefined | null)[]): string {
  return values.filter(Boolean).join(" ");
}
