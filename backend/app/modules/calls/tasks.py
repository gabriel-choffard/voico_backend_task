"""Background tasks for the calls module."""

import asyncio
import logging

from app.core.config import settings
from app.core.db import async_session
from app.modules.calls.repository import CallRepository
from app.modules.calls.service import CallService

logger = logging.getLogger(__name__)


async def expire_stale_calls_once(threshold_seconds: int) -> int:
    """Run a single expiry pass inside its own transaction.

    Mirrors the ``@session_manager`` convention used at the router layer —
    commit on success, roll back on error — but for the background job, which
    has no request/decorator to manage the session for it.
    """
    async with async_session() as session:
        service = CallService(CallRepository(session))
        try:
            expired = await service.expire_stale_calls(threshold_seconds)
            await session.commit()
            return expired
        except Exception:
            await session.rollback()
            raise


async def stale_call_expiry_loop() -> None:
    """Periodically expire stale calls until the task is cancelled at shutdown.

    Runs one pass immediately on startup (so already-stale calls are cleaned up
    right away), then every ``STALE_CALL_CHECK_INTERVAL_SECONDS``. A failed pass
    is logged and swallowed so a transient DB error never kills the loop —
    the next interval simply tries again. Config is read once here, at the edge,
    and the threshold is passed down so the service stays config-agnostic.
    """
    interval = settings.stale_call_check_interval_seconds
    threshold = settings.stale_call_threshold_seconds
    logger.info(
        "Stale-call expiry job started (interval=%ds, threshold=%ds)",
        interval,
        threshold,
    )
    try:
        while True:
            try:
                await expire_stale_calls_once(threshold)
            except Exception:
                logger.exception("Stale-call expiry run failed; retrying next interval")
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        logger.info("Stale-call expiry job stopped")
        raise
