import { useEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * Text that edits in place and saves itself: on blur, on Enter (single line),
 * and if the panel closes mid-edit. Escape abandons the edit. Required fields
 * revert rather than save empty.
 */
export function EditableText({
  value,
  onSave,
  multiline = false,
  wrap = false,
  required = false,
  placeholder,
  className = "",
  ariaLabel,
  maxLength,
  onEnterNext,
}: {
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  /** Single-line value that wraps onto several lines (a long title): Enter saves. */
  wrap?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
  maxLength?: number;
  /** Called after Enter saves a single-line field (e.g. to move focus on). */
  onEnterNext?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const latest = useRef({ draft, value, onSave, required });
  latest.current = { draft, value, onSave, required };
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  // Follow the record when it changes elsewhere, unless the user is mid-edit.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const commit = () => {
    const { draft: d, value: v, onSave: save, required: req } = latest.current;
    const next = multiline ? d.replace(/\s+$/, "") : d.trim();
    if (next === v) return;
    if (req && !next) {
      setDraft(v);
      return;
    }
    save(next);
  };

  // Flush an unsaved edit if the panel unmounts while this field has focus.
  useEffect(() => () => {
    if (focused.current) commit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if ((multiline || wrap) && ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [draft, multiline, wrap]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setDraft(value);
      // The blur below commits synchronously; make sure it sees the reverted text.
      latest.current.draft = value;
      focused.current = false;
      (e.target as HTMLElement).blur();
    } else if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
      onEnterNext ? onEnterNext() : (e.target as HTMLElement).blur();
    }
  };

  const common = {
    ref,
    value: draft,
    placeholder,
    maxLength,
    "aria-label": ariaLabel,
    className: `pt-edit ${className}`,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(wrap ? e.target.value.replace(/\n/g, " ") : e.target.value),
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      commit();
    },
    onKeyDown,
  };
  return multiline || wrap ? <textarea rows={1} {...common} /> : <input {...common} />;
}
