import math
import uuid
from typing import Optional

from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.modules.calls.schema import Call, CallFilters, CallStatus, SortOrder


def _escape_like(value: str) -> str:
    """Escape LIKE wildcards so user input is matched literally.

    Without this, a search for ``50%`` or ``a_b`` would be treated as a wildcard
    pattern. We escape the escape char first, then ``%`` and ``_``; the queries
    below pass ``escape="\\"`` so SQLite honours it.
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class CallRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, call_id: uuid.UUID) -> Optional[Call]:
        result = await self.session.exec(select(Call).where(Call.id == call_id))
        return result.first()

    @staticmethod
    def _apply_filters(query, filters: CallFilters, *, include_status: bool):
        """AND together whichever filters are set onto ``query``.

        ``include_status`` lets callers skip the status predicate — used for the
        per-status counts, which reflect the *other* active filters but not the
        currently selected status tab (so the tab badges stay meaningful).
        """
        if include_status and filters.status is not None:
            query = query.where(Call.status == filters.status)
        if filters.caller_name:
            pattern = f"%{_escape_like(filters.caller_name)}%"
            query = query.where(Call.caller_name.ilike(pattern, escape="\\"))  # type: ignore[union-attr]
        if filters.phone_number:
            pattern = f"%{_escape_like(filters.phone_number)}%"
            query = query.where(Call.phone_number.ilike(pattern, escape="\\"))  # type: ignore[attr-defined]
        if filters.label is not None:
            query = query.where(Call.label == filters.label)
        if filters.min_duration is not None:
            query = query.where(Call.duration_seconds >= filters.min_duration)  # type: ignore[operator]
        if filters.max_duration is not None:
            query = query.where(Call.duration_seconds <= filters.max_duration)  # type: ignore[operator]
        return query

    async def list_calls(
        self,
        filters: CallFilters,
        page: int,
        page_size: int,
    ) -> tuple[list[Call], int, int, dict[str, int]]:
        # Total matching the full filter set (including status) — drives pagination.
        count_query = self._apply_filters(
            select(func.count()).select_from(Call), filters, include_status=True
        )
        total = (await self.session.exec(count_query)).one()

        # Per-status counts honour every filter except status, so the tabs show how
        # many calls of each status match the rest of the active search.
        counts_query = self._apply_filters(
            select(Call.status, func.count()).select_from(Call),
            filters,
            include_status=False,
        ).group_by(Call.status)  # type: ignore[arg-type]
        counts_rows = await self.session.exec(counts_query)
        counts: dict[str, int] = {s.value: 0 for s in CallStatus}
        for row_status, row_count in counts_rows:
            key = row_status.value if isinstance(row_status, CallStatus) else str(row_status)
            counts[key] = row_count

        # Page of results: filters + sort + pagination. A secondary sort on id keeps
        # ordering deterministic across pages when the sort column has ties.
        query = self._apply_filters(select(Call), filters, include_status=True)
        sort_column = getattr(Call, filters.sort_by.value)
        direction = (
            sort_column.desc() if filters.sort_order == SortOrder.desc else sort_column.asc()
        )
        offset = (page - 1) * page_size
        query = query.order_by(direction, Call.id).offset(offset).limit(page_size)  # type: ignore[attr-defined]
        result = await self.session.exec(query)
        calls = list(result.all())

        total_pages = math.ceil(total / page_size) if total > 0 else 1
        return calls, total, total_pages, counts

    async def update(self, call: Call) -> Call:
        self.session.add(call)
        await self.session.flush()
        await self.session.refresh(call)
        return call
