"""Core type definitions for the FormBridge Intake Contract.

This module defines the fundamental types used throughout the FormBridge system:
- SubmissionState: Lifecycle states for intake submissions
- ErrorType: Structured error categories for validation and submission failures
- EventType: Audit event types for the event stream
- Actor: Identity representation for agents, humans, and system actors
- FieldErrorCode: Validation error codes for individual fields
- NextActionType: Suggested actions for clients to resolve errors

These types form the contract between clients and the FormBridge runtime,
ensuring consistent, agent-friendly error handling and state management.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional


class SubmissionState(str, Enum):
    """Submission lifecycle states.

    States follow a well-defined state machine (see INTAKE_CONTRACT_SPEC.md §2).
    Terminal states: finalized, cancelled, expired, rejected.
    """
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    AWAITING_INPUT = "awaiting_input"
    AWAITING_UPLOAD = "awaiting_upload"
    SUBMITTED = "submitted"
    NEEDS_REVIEW = "needs_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    FINALIZED = "finalized"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class ErrorType(str, Enum):
    """Error types for IntakeError responses.

    Each error type has specific retry semantics and suggested next actions
    (see INTAKE_CONTRACT_SPEC.md §3.1).
    """
    MISSING = "missing"
    INVALID = "invalid"
    CONFLICT = "conflict"
    NEEDS_APPROVAL = "needs_approval"
    UPLOAD_PENDING = "upload_pending"
    DELIVERY_FAILED = "delivery_failed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class EventType(str, Enum):
    """Audit event types for the event stream.

    Every state transition and significant action emits a typed event
    (see INTAKE_CONTRACT_SPEC.md §6.1).
    """
    SUBMISSION_CREATED = "submission.created"
    FIELD_UPDATED = "field.updated"
    VALIDATION_PASSED = "validation.passed"
    VALIDATION_FAILED = "validation.failed"
    UPLOAD_REQUESTED = "upload.requested"
    UPLOAD_COMPLETED = "upload.completed"
    UPLOAD_FAILED = "upload.failed"
    SUBMISSION_SUBMITTED = "submission.submitted"
    REVIEW_REQUESTED = "review.requested"
    REVIEW_APPROVED = "review.approved"
    REVIEW_REJECTED = "review.rejected"
    DELIVERY_ATTEMPTED = "delivery.attempted"
    DELIVERY_SUCCEEDED = "delivery.succeeded"
    DELIVERY_FAILED = "delivery.failed"
    SUBMISSION_FINALIZED = "submission.finalized"
    SUBMISSION_CANCELLED = "submission.cancelled"
    SUBMISSION_EXPIRED = "submission.expired"
    HANDOFF_LINK_ISSUED = "handoff.link_issued"
    HANDOFF_RESUMED = "handoff.resumed"


class FieldErrorCode(str, Enum):
    """Validation error codes for individual field failures.

    Used in FieldError objects to provide specific, actionable feedback
    (see INTAKE_CONTRACT_SPEC.md §3, FieldError interface).
    """
    REQUIRED = "required"
    INVALID_TYPE = "invalid_type"
    INVALID_FORMAT = "invalid_format"
    INVALID_VALUE = "invalid_value"
    TOO_LONG = "too_long"
    TOO_SHORT = "too_short"
    FILE_REQUIRED = "file_required"
    FILE_TOO_LARGE = "file_too_large"
    FILE_WRONG_TYPE = "file_wrong_type"
    CUSTOM = "custom"


class NextActionType(str, Enum):
    """Suggested next actions for resolving errors.

    Included in IntakeError responses to guide client retry logic
    (see INTAKE_CONTRACT_SPEC.md §3, NextAction interface).
    """
    COLLECT_FIELD = "collect_field"
    REQUEST_UPLOAD = "request_upload"
    WAIT_FOR_REVIEW = "wait_for_review"
    RETRY_DELIVERY = "retry_delivery"
    CANCEL = "cancel"


class ActorKind(str, Enum):
    """Actor type classification.

    Distinguishes between automated agents, human users, and system processes.
    """
    AGENT = "agent"
    HUMAN = "human"
    SYSTEM = "system"


@dataclass(frozen=True)
class Actor:
    """Identity of an actor performing an operation.

    Actors are recorded on every event for audit purposes. Every operation
    requires an actor identity (see INTAKE_CONTRACT_SPEC.md §5).

    Attributes:
        kind: Type of actor (agent, human, or system)
        id: Unique identifier for this actor
        name: Optional display name (e.g., "Onboarding Bot" or "Jane Doe")
        metadata: Optional arbitrary data (e.g., {"model": "claude-3.5", "version": "1.0"})

    Examples:
        >>> agent = Actor(kind=ActorKind.AGENT, id="onboarding_bot", name="Onboarding Bot")
        >>> human = Actor(kind=ActorKind.HUMAN, id="user_123", name="Jane Doe")
        >>> system = Actor(kind=ActorKind.SYSTEM, id="scheduler", name="TTL Expiration Service")
    """
    kind: ActorKind
    id: str
    name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for serialization."""
        result: Dict[str, Any] = {
            "kind": self.kind.value if isinstance(self.kind, ActorKind) else self.kind,
            "id": self.id,
        }
        if self.name is not None:
            result["name"] = self.name
        if self.metadata:
            result["metadata"] = self.metadata
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Actor":
        """Create Actor from dict."""
        kind = data["kind"]
        if isinstance(kind, str):
            kind = ActorKind(kind)
        return cls(
            kind=kind,
            id=data["id"],
            name=data.get("name"),
            metadata=data.get("metadata", {}),
        )


__all__ = [
    "SubmissionState",
    "ErrorType",
    "EventType",
    "FieldErrorCode",
    "NextActionType",
    "ActorKind",
    "Actor",
]
