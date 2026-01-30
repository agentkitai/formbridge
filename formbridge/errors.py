"""Structured error types and data classes for the FormBridge Intake Contract.

This module defines the error response schema used throughout the FormBridge system.
All validation and submission errors follow a single envelope structure (IntakeError)
with detailed field-level errors (FieldError) and actionable next steps (NextAction).

The error schema is designed to be agent-friendly, providing structured, actionable
information that an LLM can loop over to resolve issues.

See INTAKE_CONTRACT_SPEC.md §3 for the complete error schema specification.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from formbridge.types import ErrorType, FieldErrorCode, NextActionType, SubmissionState


@dataclass(frozen=True)
class FieldError:
    """Per-field validation error details.

    Represents a single field validation failure with specific error code,
    human-readable message, and optional context about what was expected vs received.

    Attributes:
        path: Dot-notation field path (e.g., "docs.w9", "contact.email")
        code: Specific validation error code
        message: Human-readable error description
        expected: Optional - what was expected (type, format, enum values, etc.)
        received: Optional - what was actually received

    Examples:
        >>> err = FieldError(
        ...     path="email",
        ...     code=FieldErrorCode.INVALID_FORMAT,
        ...     message="Invalid email format",
        ...     expected="valid email address",
        ...     received="not-an-email"
        ... )
        >>> err.path
        'email'
    """
    path: str
    code: FieldErrorCode
    message: str
    expected: Optional[Any] = None
    received: Optional[Any] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for serialization."""
        result: Dict[str, Any] = {
            "path": self.path,
            "code": self.code.value if isinstance(self.code, FieldErrorCode) else self.code,
            "message": self.message,
        }
        if self.expected is not None:
            result["expected"] = self.expected
        if self.received is not None:
            result["received"] = self.received
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FieldError":
        """Create FieldError from dict."""
        code = data["code"]
        if isinstance(code, str):
            code = FieldErrorCode(code)
        return cls(
            path=data["path"],
            code=code,
            message=data["message"],
            expected=data.get("expected"),
            received=data.get("received"),
        )


@dataclass(frozen=True)
class NextAction:
    """Suggested action for resolving an error.

    Provides actionable guidance to clients (especially LLM agents) on what to
    do next to resolve validation or submission issues.

    Attributes:
        action: Type of action to take
        field: Optional - which field this action relates to
        hint: Optional - LLM-friendly guidance text
        accept: Optional - for uploads, allowed MIME types
        max_bytes: Optional - for uploads, maximum file size in bytes

    Examples:
        >>> action = NextAction(
        ...     action=NextActionType.COLLECT_FIELD,
        ...     field="legal_name",
        ...     hint="Please provide the company's legal name as registered"
        ... )
        >>> action.field
        'legal_name'
    """
    action: NextActionType
    field: Optional[str] = None
    hint: Optional[str] = None
    accept: Optional[List[str]] = None
    max_bytes: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for serialization."""
        result: Dict[str, Any] = {
            "action": self.action.value if isinstance(self.action, NextActionType) else self.action,
        }
        if self.field is not None:
            result["field"] = self.field
        if self.hint is not None:
            result["hint"] = self.hint
        if self.accept is not None:
            result["accept"] = self.accept
        if self.max_bytes is not None:
            result["maxBytes"] = self.max_bytes
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "NextAction":
        """Create NextAction from dict."""
        action = data["action"]
        if isinstance(action, str):
            action = NextActionType(action)
        return cls(
            action=action,
            field=data.get("field"),
            hint=data.get("hint"),
            accept=data.get("accept"),
            max_bytes=data.get("maxBytes"),
        )


@dataclass(frozen=True)
class ErrorDetail:
    """Detailed error information within an IntakeError.

    Contains the error type, message, field-level details, suggested next actions,
    and retry information.

    Attributes:
        type: Category of error (missing, invalid, conflict, etc.)
        retryable: Whether the caller can retry this exact operation
        message: Optional human-readable summary
        fields: Optional list of per-field validation errors
        next_actions: Optional list of suggested actions to resolve the error
        retry_after_ms: Optional suggested retry delay in milliseconds
    """
    type: ErrorType
    retryable: bool
    message: Optional[str] = None
    fields: Optional[List[FieldError]] = None
    next_actions: Optional[List[NextAction]] = None
    retry_after_ms: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for serialization."""
        result: Dict[str, Any] = {
            "type": self.type.value if isinstance(self.type, ErrorType) else self.type,
            "retryable": self.retryable,
        }
        if self.message is not None:
            result["message"] = self.message
        if self.fields is not None:
            result["fields"] = [f.to_dict() for f in self.fields]
        if self.next_actions is not None:
            result["nextActions"] = [a.to_dict() for a in self.next_actions]
        if self.retry_after_ms is not None:
            result["retryAfterMs"] = self.retry_after_ms
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ErrorDetail":
        """Create ErrorDetail from dict."""
        error_type = data["type"]
        if isinstance(error_type, str):
            error_type = ErrorType(error_type)

        fields = None
        if "fields" in data and data["fields"] is not None:
            fields = [FieldError.from_dict(f) for f in data["fields"]]

        next_actions = None
        if "nextActions" in data and data["nextActions"] is not None:
            next_actions = [NextAction.from_dict(a) for a in data["nextActions"]]

        return cls(
            type=error_type,
            retryable=data["retryable"],
            message=data.get("message"),
            fields=fields,
            next_actions=next_actions,
            retry_after_ms=data.get("retryAfterMs"),
        )


@dataclass(frozen=True)
class IntakeError:
    """Complete error envelope for all FormBridge validation and submission errors.

    This is the standard error response structure returned by all FormBridge operations.
    It includes the submission context (ID, state, resume token) along with detailed
    error information to help clients (especially LLM agents) understand and resolve issues.

    The error always includes a resume token, allowing clients to continue from where
    they left off even after an error.

    Attributes:
        submission_id: ID of the submission that encountered the error
        state: Current state of the submission
        resume_token: Token to resume/continue this submission
        error: Detailed error information with field-level details and next actions

    Examples:
        >>> from formbridge.types import ErrorType, FieldErrorCode, NextActionType, SubmissionState
        >>> field_err = FieldError(
        ...     path="legal_name",
        ...     code=FieldErrorCode.REQUIRED,
        ...     message="Legal name is required"
        ... )
        >>> next_action = NextAction(
        ...     action=NextActionType.COLLECT_FIELD,
        ...     field="legal_name",
        ...     hint="Provide the company's legal name"
        ... )
        >>> error_detail = ErrorDetail(
        ...     type=ErrorType.MISSING,
        ...     retryable=True,
        ...     message="Required fields are missing",
        ...     fields=[field_err],
        ...     next_actions=[next_action]
        ... )
        >>> intake_error = IntakeError(
        ...     submission_id="sub_123",
        ...     state=SubmissionState.AWAITING_INPUT,
        ...     resume_token="resume_abc",
        ...     error=error_detail
        ... )
        >>> intake_error.submission_id
        'sub_123'
    """
    submission_id: str
    state: SubmissionState
    resume_token: str
    error: ErrorDetail

    @property
    def ok(self) -> bool:
        """Always returns False - this is an error response."""
        return False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for serialization."""
        return {
            "ok": False,
            "submissionId": self.submission_id,
            "state": self.state.value if isinstance(self.state, SubmissionState) else self.state,
            "resumeToken": self.resume_token,
            "error": self.error.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "IntakeError":
        """Create IntakeError from dict."""
        state = data["state"]
        if isinstance(state, str):
            state = SubmissionState(state)

        error_detail = ErrorDetail.from_dict(data["error"])

        return cls(
            submission_id=data["submissionId"],
            state=state,
            resume_token=data["resumeToken"],
            error=error_detail,
        )


__all__ = [
    "FieldError",
    "NextAction",
    "ErrorDetail",
    "IntakeError",
]
