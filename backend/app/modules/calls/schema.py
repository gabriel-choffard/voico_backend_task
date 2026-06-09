import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Column, DateTime, Field, SQLModel


class CallStatus(str, Enum):
    in_progress = "in_progress"
    success = "success"
    failed = "failed"


class CallLabel(str, Enum):
    sales_inquiry = "Sales inquiry"
    support = "Support"
    complaint = "Complaint"
    appointment = "Appointment"
    follow_up = "Follow-up"
    other = "Other"


class CallSortField(str, Enum):
    """Columns that ``GET /api/calls`` is allowed to sort by.

    Constraining sorting to an enum (rather than an arbitrary string) keeps the
    repository's ``getattr(Call, ...)`` safe — only these known columns can ever
    be ordered on.
    """

    phone_number = "phone_number"
    caller_name = "caller_name"
    duration_seconds = "duration_seconds"
    status = "status"
    label = "label"
    started_at = "started_at"
    created_at = "created_at"


class SortOrder(str, Enum):
    asc = "asc"
    desc = "desc"


class Call(SQLModel, table=True):
    __tablename__ = "calls"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
    )
    phone_number: str = Field(index=True)
    caller_name: Optional[str] = Field(default=None)
    duration_seconds: Optional[int] = Field(default=None)
    status: CallStatus = Field(default=CallStatus.in_progress, index=True)
    summary: Optional[str] = Field(default=None)
    label: Optional[CallLabel] = Field(default=None)
    started_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime, nullable=False),
    )
    ended_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, nullable=True),
    )
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime, nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime, nullable=False),
    )
    raw_transcript: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)


# --- Request / Response schemas ---


class CallFilters(SQLModel):
    """Combinable, all-optional filters + sort for ``GET /api/calls``.

    Every field is independent and ANDed together by the repository. ``status``
    is included here (driven by the status tabs) alongside the Task 2 filters so
    a single object carries the full query intent.
    """

    status: Optional[CallStatus] = None
    caller_name: Optional[str] = None  # partial, case-insensitive match
    phone_number: Optional[str] = None  # partial, case-insensitive match
    label: Optional[CallLabel] = None  # exact match
    min_duration: Optional[int] = None  # duration_seconds >= min_duration
    max_duration: Optional[int] = None  # duration_seconds <= max_duration
    sort_by: CallSortField = CallSortField.created_at
    sort_order: SortOrder = SortOrder.desc


class WebhookCallPayload(SQLModel):
    call_id: uuid.UUID
    status: CallStatus
    duration_seconds: Optional[int] = None
    raw_transcript: Optional[str] = None
    ended_at: Optional[datetime] = None


class NotesUpdatePayload(SQLModel):
    """Request body for ``PATCH /api/calls/{id}/notes``.

    ``notes`` is required (the key must be present) but may be ``null`` to clear
    the field. Keeping it required — rather than defaulting to ``None`` — avoids
    silently wiping notes when an empty or malformed body is sent.
    """

    notes: Optional[str]


class CallResponse(SQLModel):
    id: uuid.UUID
    phone_number: str
    caller_name: Optional[str]
    duration_seconds: Optional[int]
    status: CallStatus
    summary: Optional[str]
    label: Optional[CallLabel]
    started_at: datetime
    ended_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    raw_transcript: Optional[str]
    notes: Optional[str]


class CallCounts(SQLModel):
    in_progress: int = 0
    success: int = 0
    failed: int = 0


class PaginatedCallsResponse(SQLModel):
    data: list[CallResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    counts: CallCounts
