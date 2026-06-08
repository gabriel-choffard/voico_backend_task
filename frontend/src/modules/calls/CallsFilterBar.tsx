import { useEffect, useRef, useState } from "react";
import { Plus, X, Check, SlidersHorizontal } from "lucide-react";
import { CALL_LABELS, type CallFilterValues } from "@/types/calls";

type FieldKey = keyof CallFilterValues;

interface FieldDef {
  key: FieldKey;
  label: string;
  type: "text" | "number" | "select";
  placeholder?: string;
  options?: readonly string[];
  /** Suffix shown after numeric values (e.g. "s" for seconds). */
  unit?: string;
}

/** The Task 2 filters. Order here is the order chips/editors appear in. */
const FIELDS: FieldDef[] = [
  { key: "caller_name", label: "Caller", type: "text", placeholder: "name…" },
  { key: "phone_number", label: "Phone", type: "text", placeholder: "number…" },
  { key: "label", label: "Label", type: "select", options: CALL_LABELS },
  { key: "min_duration", label: "Min duration", type: "number", placeholder: "0", unit: "s" },
  { key: "max_duration", label: "Max duration", type: "number", placeholder: "600", unit: "s" },
];

const ACCENT = "#FDDF5C";

function commitValue(field: FieldDef, raw: string): string | number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (field.type === "number") {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  return trimmed;
}

function formatValue(field: FieldDef, value: string | number): string {
  if (field.type === "number") return `${value}${field.unit ?? ""}`;
  return String(value);
}

interface CallsFilterBarProps {
  filters: CallFilterValues;
  onChange: (filters: CallFilterValues) => void;
}

export function CallsFilterBar({ filters, onChange }: CallsFilterBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<FieldKey | null>(null);

  // Fields rendered in the bar: every active filter, plus whichever one is being
  // added/edited. Filtering off a stable `FIELDS` order keeps each field's React
  // key and position fixed, so the editor never remounts (and loses focus) when a
  // freshly-typed value flips the field from "inactive" to "active".
  const shownFields = FIELDS.filter((f) => filters[f.key] !== undefined || f.key === editing);
  const availableFields = FIELDS.filter((f) => filters[f.key] === undefined && f.key !== editing);
  const hasActive = FIELDS.some((f) => filters[f.key] !== undefined);

  // Close the add-menu / editor when clicking anywhere outside the bar.
  useEffect(() => {
    if (!menuOpen && editing === null) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setEditing(null);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen, editing]);

  function setField(key: FieldKey, value: string | number | undefined) {
    const next: CallFilterValues = { ...filters };
    if (value === undefined || value === "") {
      delete next[key];
    } else {
      (next as Record<FieldKey, string | number>)[key] = value;
    }
    onChange(next);
  }

  function removeField(key: FieldKey) {
    if (editing === key) setEditing(null);
    setField(key, undefined);
  }

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
      </div>

      {shownFields.map((field) =>
        editing === field.key ? (
          <FilterEditor
            key={field.key}
            field={field}
            initialValue={filters[field.key]}
            onCommit={(v) => setField(field.key, v)}
            onClose={() => setEditing(null)}
          />
        ) : (
          <FilterChip
            key={field.key}
            field={field}
            value={filters[field.key] as string | number}
            onEdit={() => {
              setMenuOpen(false);
              setEditing(field.key);
            }}
            onRemove={() => removeField(field.key)}
          />
        )
      )}

      {availableFields.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setMenuOpen((o) => !o);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add filter
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-white py-1 shadow-lg">
              {availableFields.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(field.key);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
                >
                  {field.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {hasActive && (
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            onChange({});
          }}
          className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function FilterChip({
  field,
  value,
  onEdit,
  onRemove,
}: {
  field: FieldDef;
  value: string | number;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 py-1 pl-2.5 pr-1 text-xs">
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
        title="Edit filter"
      >
        <span className="text-muted-foreground">{field.label}:</span>
        <span className="font-semibold text-foreground">{formatValue(field, value)}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${field.label} filter`}
        className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function FilterEditor({
  field,
  initialValue,
  onCommit,
  onClose,
}: {
  field: FieldDef;
  initialValue: string | number | undefined;
  onCommit: (value: string | number | undefined) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(
    initialValue === undefined || initialValue === "" ? "" : String(initialValue)
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Commit to the filter state on every keystroke so the chip/UI stay live;
  // CallsPage debounces the actual request. Numeric fields are kept to digits.
  function handleChange(raw: string) {
    const next = field.type === "number" ? raw.replace(/[^0-9]/g, "") : raw;
    setDraft(next);
    onCommit(commitValue(field, next));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  if (field.type === "select") {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full border-2 bg-white py-1 pl-2.5 pr-2 text-xs shadow-sm"
        style={{ borderColor: ACCENT }}
      >
        <span className="text-muted-foreground">{field.label}:</span>
        <select
          autoFocus
          aria-label={field.label}
          value={typeof initialValue === "string" ? initialValue : ""}
          onChange={(e) => {
            onCommit(e.target.value === "" ? undefined : e.target.value);
            onClose();
          }}
          className="cursor-pointer bg-transparent font-semibold text-foreground focus:outline-none"
        >
          <option value="">Any</option>
          {field.options!.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border-2 bg-white py-1 pl-2.5 pr-1 text-xs shadow-sm"
      style={{ borderColor: ACCENT }}
    >
      <span className="whitespace-nowrap text-muted-foreground">{field.label}:</span>
      <input
        ref={inputRef}
        type="text"
        inputMode={field.type === "number" ? "numeric" : "text"}
        aria-label={field.label}
        value={draft}
        placeholder={field.placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-24 bg-transparent font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground/50 focus:outline-none"
      />
      {field.unit && draft !== "" && <span className="text-muted-foreground">{field.unit}</span>}
      <button
        type="button"
        onClick={onClose}
        aria-label="Done editing filter"
        className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Check className="h-3 w-3" />
      </button>
    </div>
  );
}
