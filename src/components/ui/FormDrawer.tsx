import { useEffect, useId, useState, type ReactNode } from "react";
import { ApiError } from "../../lib/api";
import { Drawer } from "./Overlay";

export type FieldType = "text" | "textarea" | "select" | "date" | "number" | "checkbox" | "initials";

export interface FieldSpec {
  name: string;
  label: string;
  type?: FieldType;
  options?: readonly { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
  /** Sits beside the next half-width field. */
  half?: boolean;
  mono?: boolean;
  max?: number;
}

export type FormValues = Record<string, string | number | boolean>;

export interface FormSpec {
  eyebrow: string;
  title: string;
  submitLabel: string;
  fields: FieldSpec[];
  initial: FormValues;
  /** Throws ApiError to show field messages; resolves to close the drawer. */
  submit: (values: FormValues) => Promise<void>;
  /** Optional destructive action shown at the foot of the form (e.g. "Delete item"). */
  danger?: { label: string; run: () => Promise<boolean> };
  intro?: ReactNode;
}

function coerce(field: FieldSpec, raw: string | boolean): string | number | boolean {
  if (field.type === "checkbox") return Boolean(raw);
  if (field.type === "number") return raw === "" ? "" : Number(raw);
  if (field.type === "initials") return String(raw).toUpperCase();
  return raw;
}

export function FormDrawer({ spec, onClose }: { spec: FormSpec | null; onClose: () => void }) {
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formId = useId();

  useEffect(() => {
    if (spec) {
      setValues(spec.initial);
      setErrors({});
      setFormError(null);
      setBusy(false);
    }
  }, [spec]);

  const set = (field: FieldSpec, raw: string | boolean) => {
    setValues((v) => ({ ...v, [field.name]: coerce(field, raw) }));
    if (errors[field.name]) setErrors((e) => ({ ...e, [field.name]: "" }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spec || busy) return;
    const missing: Record<string, string> = {};
    for (const f of spec.fields) {
      const v = values[f.name];
      if (f.required && f.type !== "checkbox" && (v === undefined || String(v).trim() === "")) missing[f.name] = "Required";
    }
    if (Object.keys(missing).length) {
      setErrors(missing);
      setFormError("Some fields need attention.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await spec.submit(values);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.message);
      } else {
        setFormError((err as Error).message || "Couldn't save that change.");
      }
    } finally {
      setBusy(false);
    }
  };

  const onDanger = async () => {
    if (!spec?.danger || busy) return;
    setBusy(true);
    try {
      if (await spec.danger.run()) onClose();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={!!spec}
      onClose={onClose}
      eyebrow={spec?.eyebrow}
      title={spec?.title ?? ""}
      footer={
        spec && (
          <>
            {spec.danger && (
              <button type="button" className="sds-btn sds-btn--md sds-btn--ghost pt-danger-link" onClick={onDanger} disabled={busy}>
                {spec.danger.label}
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className="sds-btn sds-btn--md sds-btn--ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form={formId} className="sds-btn sds-btn--md sds-btn--primary" disabled={busy} aria-busy={busy}>
              {busy ? <span className="pt-spinner" aria-hidden /> : null}
              {spec.submitLabel}
            </button>
          </>
        )
      }
    >
      {spec && (
        <form id={formId} className="pt-form" onSubmit={onSubmit} noValidate>
          {spec.intro && <div className="pt-form__intro">{spec.intro}</div>}
          {formError && (
            <div className="pt-form__error" role="alert">
              {formError}
            </div>
          )}
          <div className="pt-form__grid">
            {spec.fields.map((f, i) => {
              const id = `${formId}-${f.name}`;
              const err = errors[f.name];
              const v = values[f.name];
              const common = {
                id,
                name: f.name,
                "aria-invalid": err ? true : undefined,
                "aria-describedby": err || f.hint ? `${id}-note` : undefined,
                ...(i === 0 ? { "data-autofocus": true } : {}),
              };
              const cls = `pt-input${f.mono || f.type === "initials" ? " pt-input--mono" : ""}${err ? " pt-input--invalid" : ""}`;
              return (
                <div key={f.name} className={`pt-field${f.half ? " pt-field--half" : ""}${f.type === "checkbox" ? " pt-field--check" : ""}`}>
                  {f.type === "checkbox" ? (
                    <label className="pt-check" htmlFor={id}>
                      <input {...common} type="checkbox" checked={Boolean(v)} onChange={(e) => set(f, e.target.checked)} />
                      <span className="pt-check__box" aria-hidden />
                      <span>{f.label}</span>
                    </label>
                  ) : (
                    <>
                      <label className="pt-field__label" htmlFor={id}>
                        {f.label}
                        {f.required && <span className="pt-field__req" aria-hidden> *</span>}
                      </label>
                      {f.type === "textarea" ? (
                        <textarea
                          {...common}
                          className={`${cls} pt-textarea`}
                          rows={4}
                          maxLength={f.max}
                          placeholder={f.placeholder}
                          value={String(v ?? "")}
                          onChange={(e) => set(f, e.target.value)}
                        />
                      ) : f.type === "select" ? (
                        <div className="pt-select">
                          <select {...common} className={cls} value={String(v ?? "")} onChange={(e) => set(f, e.target.value)}>
                            {!f.required && <option value="">—</option>}
                            {f.options?.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <input
                          {...common}
                          className={cls}
                          type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                          inputMode={f.type === "number" ? "numeric" : undefined}
                          maxLength={f.type === "initials" ? 3 : f.max}
                          placeholder={f.placeholder}
                          value={String(v ?? "")}
                          onChange={(e) => set(f, e.target.value)}
                          autoComplete="off"
                        />
                      )}
                    </>
                  )}
                  {(err || f.hint) && (
                    <div id={`${id}-note`} className={err ? "pt-field__error" : "pt-field__hint"}>
                      {err || f.hint}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </form>
      )}
    </Drawer>
  );
}
