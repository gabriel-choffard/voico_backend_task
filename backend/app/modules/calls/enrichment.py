import json
import logging
from dataclasses import dataclass
from typing import Optional

from openai import APIError, AsyncOpenAI
from openai.types.shared_params import ResponseFormatJSONSchema

from app.core.config import settings
from app.modules.calls.schema import CallLabel

logger = logging.getLogger(__name__)

_LABEL_VALUES = [label.value for label in CallLabel]

_SYSTEM_PROMPT = (
    "You analyse customer phone-call transcripts. Given a transcript, write a "
    "concise summary of 2-3 sentences describing what happened, and classify the "
    "call into exactly one of the allowed labels. Respond only via the provided "
    "structured schema."
)

_RESPONSE_FORMAT: ResponseFormatJSONSchema = {
    "type": "json_schema",
    "json_schema": {
        "name": "call_enrichment",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "A 2-3 sentence summary of the call.",
                },
                "label": {
                    "type": "string",
                    "enum": _LABEL_VALUES,
                    "description": "The single best-fit category for the call.",
                },
            },
            "required": ["summary", "label"],
            "additionalProperties": False,
        },
    },
}


@dataclass(frozen=True)
class CallEnrichment:
    """The two AI-generated fields stored on a call."""

    summary: str
    label: CallLabel


class CallEnricher:
    """Thin, best-effort wrapper over the OpenAI Chat Completions API.

    Configuration (key, model, timeout, retries) is read from ``settings`` by
    default, and every value can be overridden via the constructor for tests.
    ``enrich`` never raises: it returns ``None`` on any problem so the caller can
    treat enrichment as optional.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        max_retries: Optional[int] = None,
    ) -> None:
        self._api_key = api_key if api_key is not None else settings.openai_api_key
        self._model = model if model is not None else settings.openai_model
        self._timeout_seconds = (
            timeout_seconds if timeout_seconds is not None else settings.openai_timeout_seconds
        )
        self._max_retries = (
            max_retries if max_retries is not None else settings.openai_max_retries
        )

    async def enrich(self, transcript: Optional[str]) -> Optional[CallEnrichment]:
        """Return a summary + label for ``transcript``, or ``None`` if unavailable."""
        transcript = (transcript or "").strip()
        if not transcript:
            return None
        if not self._api_key:
            logger.warning("OPENAI_API_KEY not configured; skipping call enrichment")
            return None

        try:
            async with AsyncOpenAI(
                api_key=self._api_key,
                timeout=self._timeout_seconds,
                max_retries=self._max_retries,
            ) as client:
                response = await client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "user", "content": transcript},
                    ],
                    response_format=_RESPONSE_FORMAT,
                )

            message = response.choices[0].message
            if getattr(message, "refusal", None):
                logger.error("OpenAI refused to enrich the call: %s", message.refusal)
                return None
            if not message.content:
                logger.error("OpenAI returned an empty enrichment response")
                return None

            data = json.loads(message.content)
            summary = (data.get("summary") or "").strip()
            if not summary:
                logger.error("OpenAI enrichment returned a blank summary")
                return None

            return CallEnrichment(summary=summary, label=CallLabel(data["label"]))
        except APIError as exc:
            logger.warning("OpenAI enrichment unavailable (%s): %s", type(exc).__name__, exc)
            return None
        except Exception:
            logger.exception("Unexpected error during call enrichment; leaving summary/label unset")
            return None
