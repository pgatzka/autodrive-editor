import { ReactNode, useRef, useState } from "react";
import { commitNumber, formatNumber, isPartialNumber, NumberRules } from "./numberInput";

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

/**
 * A number you can both type and step.
 *
 * The typed text is held locally until the field is committed (blur or Enter)
 * so intermediate states like "1." or "-" survive; Escape restores the stored
 * value. Everything else in the app keeps reading a plain number.
 */
export function NumberInput({
  value,
  onCommit,
  rules,
  suffix,
  width = 56,
  ariaLabel,
  className,
}: {
  value: number;
  onCommit: (value: number) => void;
  rules?: NumberRules;
  suffix?: string;
  width?: number;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Escape blurs the field, and the blur would otherwise commit the text that
  // was just abandoned; this marks the edit as cancelled for that one blur.
  const cancelled = useRef(false);
  const stored = formatNumber(value, rules?.decimals ?? 1);

  const commit = (text: string) => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    const committed = commitNumber(text, rules);
    if (committed !== null) onCommit(committed);
    setDraft(null);
  };

  return (
    <span className={cx("number-input", className)}>
      <input
        className="input mono"
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        style={{ width }}
        value={draft ?? stored}
        onFocus={(event) => {
          cancelled.current = false;
          setDraft(stored);
          event.target.select();
        }}
        onChange={(event) => {
          if (isPartialNumber(event.target.value)) setDraft(event.target.value);
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          // the canvas shortcuts must not see keys typed into a field
          event.stopPropagation();
          if (event.key === "Enter") commit(event.currentTarget.value);
          if (event.key === "Escape") {
            cancelled.current = true;
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  );
}

/** A typeable number with − / + buttons around it. */
export function Stepper({
  value,
  onCommit,
  onStep,
  rules,
  suffix,
  ariaLabel,
}: {
  value: number;
  onCommit: (value: number) => void;
  onStep: (direction: -1 | 1) => void;
  rules?: NumberRules;
  suffix?: string;
  ariaLabel: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={ariaLabel}>
      <button onClick={() => onStep(-1)} aria-label={`Decrease ${ariaLabel}`} tabIndex={-1}>
        −
      </button>
      <NumberInput
        value={value}
        onCommit={onCommit}
        rules={rules}
        suffix={suffix}
        width={44}
        ariaLabel={ariaLabel}
        className="bare"
      />
      <button onClick={() => onStep(1)} aria-label={`Increase ${ariaLabel}`} tabIndex={-1}>
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
