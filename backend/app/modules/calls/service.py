import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, status

from app.modules.calls.enrichment import CallEnricher
from app.modules.calls.repository import CallRepository
from app.modules.calls.schema import (
    CallCounts,
    CallFilters,
    CallResponse,
    CallStatus,
    PaginatedCallsResponse,
    WebhookCallPayload,
)

logger = logging.getLogger(__name__)


class CallService:
    def __init__(self, repository: CallRepository, enricher: Optional[CallEnricher] = None) -> None:
        self.repository = repository
        self.enricher = enricher or CallEnricher()

    async def list_calls(
        self,
        filters: CallFilters,
        page: int,
        page_size: int,
    ) -> PaginatedCallsResponse:
        if (
            filters.min_duration is not None
            and filters.max_duration is not None
            and filters.min_duration > filters.max_duration
        ):
            raise HTTPException(
                status_code=422,
                detail="min_duration cannot be greater than max_duration",
            )

        calls, total, total_pages, counts = await self.repository.list_calls(
            filters, page, page_size
        )
        return PaginatedCallsResponse(
            data=[CallResponse.model_validate(c, from_attributes=True) for c in calls],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            counts=CallCounts(
                in_progress=counts.get("in_progress", 0),
                success=counts.get("success", 0),
                failed=counts.get("failed", 0),
            ),
        )

    async def get_call(self, call_id: uuid.UUID) -> CallResponse:
        call = await self.repository.get_by_id(call_id)
        if call is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
        return CallResponse.model_validate(call, from_attributes=True)

    async def update_notes(self, call_id: uuid.UUID, notes: Optional[str]) -> CallResponse:
        call = await self.repository.get_by_id(call_id)
        if call is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
        call.notes = (notes or "").strip() or None
        call.updated_at = datetime.utcnow()
        updated = await self.repository.update(call)
        return CallResponse.model_validate(updated, from_attributes=True)

    async def process_webhook(self, payload: WebhookCallPayload) -> CallResponse:

        call = await self.repository.get_by_id(payload.call_id)
        if call is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")

        call.status = payload.status
        if payload.duration_seconds is not None:
            call.duration_seconds = payload.duration_seconds
        if payload.raw_transcript is not None:
            call.raw_transcript = payload.raw_transcript
        if payload.ended_at is not None:
            call.ended_at = payload.ended_at
        call.updated_at = datetime.utcnow()

        if payload.status in (CallStatus.success, CallStatus.failed) and payload.raw_transcript:
            enrichment = await self.enricher.enrich(payload.raw_transcript)
            if enrichment is not None:
                call.summary = enrichment.summary
                call.label = enrichment.label

        updated = await self.repository.update(call)
        return CallResponse.model_validate(updated, from_attributes=True)

    async def expire_stale_calls(self, threshold_seconds: int) -> int:
        now = datetime.utcnow()
        cutoff = now - timedelta(seconds=threshold_seconds)

        expired = await self.repository.expire_stale_calls(cutoff=cutoff, now=now)

        logger.info(
            "Stale-call expiry: marked %d call(s) as failed (in_progress for more than %d seconds)",
            expired,
            threshold_seconds,
        )
        return expired
