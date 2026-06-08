export type CallStatus = "in_progress" | "success" | "failed";

export interface Call {
  id: string;
  phone_number: string;
  caller_name: string | null;
  duration_seconds: number | null;
  status: CallStatus;
  summary: string | null;
  label: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  raw_transcript: string | null;
  notes: string | null;
}

export interface CallCounts {
  in_progress: number;
  success: number;
  failed: number;
}

export interface PaginatedCallsResponse {
  data: Call[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  counts: CallCounts;
}

/** Columns the API allows sorting by (mirrors backend `CallSortField`). */
export type CallSortField =
  | "phone_number"
  | "caller_name"
  | "duration_seconds"
  | "status"
  | "label"
  | "started_at"
  | "created_at";

export type SortOrder = "asc" | "desc";

export interface SortState {
  field: CallSortField;
  order: SortOrder;
}

/** Allowed `label` values (mirrors backend `CallLabel` enum). */
export const CALL_LABELS = [
  "Sales inquiry",
  "Support",
  "Complaint",
  "Appointment",
  "Follow-up",
  "Other",
] as const;

/**
 * Active filter values managed by the filter bar. A key is present only when
 * that filter is active, so it maps 1:1 onto the query params actually sent.
 */
export interface CallFilterValues {
  caller_name?: string;
  phone_number?: string;
  label?: string;
  min_duration?: number;
  max_duration?: number;
}

export interface CallsQueryParams {
  status?: CallStatus;
  caller_name?: string;
  phone_number?: string;
  label?: string;
  min_duration?: number;
  max_duration?: number;
  sort_by?: CallSortField;
  sort_order?: SortOrder;
  page?: number;
  page_size?: number;
}
