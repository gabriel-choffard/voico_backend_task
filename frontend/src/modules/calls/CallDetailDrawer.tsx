import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  X,
  Phone,
  User,
  Clock,
  Calendar,
  FileText,
  Sparkles,
  StickyNote,
  Pencil,
  Check,
  Loader2,
} from "lucide-react";
import { StatusBadge } from "./CallsTable";
import { Button } from "@/components/ui/button";
import { callsApi } from "@/services/api";
import type { Call } from "@/types/calls";

interface CallDetailDrawerProps {
  call: Call | null;
  onClose: () => void;
  /** Called with the updated call after a successful notes save. */
  onUpdated?: (call: Call) => void;
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <div className="text-sm font-medium text-foreground break-words">{value}</div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Not available";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s} sec` : `${s} sec`;
}

function NotesSection({
  call,
  onUpdated,
}: {
  call: Call;
  onUpdated?: (call: Call) => void;
}) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const mutation = useMutation({
    mutationFn: (notes: string | null) => callsApi.updateNotes(call.id, notes),
    onSuccess: (updated) => {
      onUpdated?.(updated);
      // Keep the calls table in sync with the new notes.
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      setIsEditing(false);
    },
  });

  // Reset editing state whenever a different call is selected.
  useEffect(() => {
    setIsEditing(false);
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id]);

  const normalizedDraft = draft.trim();
  const currentNotes = call.notes ?? "";
  const hasChanges = normalizedDraft !== currentNotes;

  function startEditing() {
    setDraft(call.notes ?? "");
    mutation.reset();
    setIsEditing(true);
  }

  function cancelEditing() {
    if (mutation.isPending) return;
    setIsEditing(false);
    mutation.reset();
  }

  function handleSave() {
    // Skip no-op saves; treat an empty/whitespace-only textarea as clearing (null).
    if (!hasChanges || mutation.isPending) return;
    mutation.mutate(normalizedDraft === "" ? null : normalizedDraft);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <div className="px-6 py-4 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Notes</h3>
        </div>
        {!isEditing && (
          <button
            onClick={startEditing}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            rows={4}
            placeholder="Add notes about this call..."
            disabled={mutation.isPending}
            className="w-full rounded-lg border border-border bg-white p-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 resize-y"
          />
          {mutation.isError && (
            <p className="text-xs text-red-500 mt-1">Failed to save notes. Please try again.</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Button size="sm" onClick={handleSave} disabled={mutation.isPending || !hasChanges}>
              {mutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelEditing} disabled={mutation.isPending}>
              Cancel
            </Button>
            <span className="ml-auto text-[11px] text-muted-foreground/70 select-none">
              ⌘/Ctrl+Enter · Esc
            </span>
          </div>
        </div>
      ) : (
        <button
          onClick={startEditing}
          className="w-full text-left rounded-lg p-3 -mx-3 hover:bg-muted/50 transition-colors"
        >
          {call.notes ? (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {call.notes}
            </p>
          ) : (
            <p className="text-sm italic text-muted-foreground/60">Click to add notes…</p>
          )}
        </button>
      )}
    </div>
  );
}

export function CallDetailDrawer({ call, onClose, onUpdated }: CallDetailDrawerProps) {
  if (!call) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Call Details</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">#{call.id.slice(0, 8)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status banner */}
        <div className="px-6 py-3 bg-muted/50 border-b border-border flex items-center justify-between">
          <StatusBadge status={call.status} />
          {call.label && (
            <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium border border-border bg-white text-foreground">
              {call.label}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-4">
            <DetailRow
              icon={<Phone className="h-4 w-4" />}
              label="Phone Number"
              value={<span className="font-mono">{call.phone_number}</span>}
            />
            <DetailRow
              icon={<User className="h-4 w-4" />}
              label="Caller Name"
              value={call.caller_name ?? "Unknown"}
            />
            <DetailRow
              icon={<Clock className="h-4 w-4" />}
              label="Duration"
              value={formatDuration(call.duration_seconds)}
            />
            <DetailRow
              icon={<Calendar className="h-4 w-4" />}
              label="Started At"
              value={format(new Date(call.started_at), "PPpp")}
            />
            {call.ended_at && (
              <DetailRow
                icon={<Calendar className="h-4 w-4" />}
                label="Ended At"
                value={format(new Date(call.ended_at), "PPpp")}
              />
            )}
          </div>

          {/* Notes (inline editable) */}
          <NotesSection call={call} onUpdated={onUpdated} />

          {/* AI Summary */}
          {call.summary && (
            <div className="px-6 py-4 border-t border-border">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4" style={{ color: "#FDDF5C" }} />
                <h3 className="text-sm font-semibold text-foreground">AI Summary</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{call.summary}</p>
            </div>
          )}

          {/* Transcript */}
          {call.raw_transcript && (
            <div className="px-6 py-4 border-t border-border">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Transcript</h3>
              </div>
              <div className="bg-muted rounded-lg p-3 max-h-48 overflow-y-auto">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                  {call.raw_transcript}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">
            Created {format(new Date(call.created_at), "PPpp")}
          </p>
        </div>
      </aside>
    </>
  );
}
