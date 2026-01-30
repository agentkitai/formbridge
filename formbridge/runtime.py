"""IntakeRuntime orchestrator for the FormBridge Intake Contract.

This module provides the IntakeRuntime class that coordinates the state machine,
validation engine, and event system to implement the complete Intake Contract
protocol defined in INTAKE_CONTRACT_SPEC.md.

The runtime manages submission lifecycle, validation, state transitions, and
event emission. It provides the main API for creating and managing intake submissions.

Usage:
    >>> from formbridge.runtime import IntakeRuntime
    >>> schema = {
    ...     "type": "object",
    ...     "properties": {"name": {"type": "string"}},
    ...     "required": ["name"]
    ... }
    >>> runtime = IntakeRuntime(intake_id="vendor_onboarding", schema=schema)
    >>> submission = runtime.create_submission(actor={"kind": "agent", "id": "bot_001"})
    >>> submission["state"]
    'draft'
"""

import secrets
import uuid
from typing import Any, Dict, List, Optional, Union

from formbridge.errors import ErrorDetail, FieldError, IntakeError, NextAction
from formbridge.state_machine import InvalidStateTransitionError, SubmissionStateMachine
from formbridge.types import Actor, ActorKind, ErrorType, SubmissionState
from formbridge.validation import ValidationEngine


class IntakeRuntime:
    """Orchestrator for Intake Contract submission lifecycle.

    The IntakeRuntime coordinates the state machine, validation engine, and event
    system to implement the complete Intake Contract protocol. It manages submission
    creation, field updates, validation, and state transitions.

    Attributes:
        intake_id: Unique identifier for this intake definition
        schema: JSON Schema that defines the structure and validation rules

    Examples:
        >>> schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        >>> runtime = IntakeRuntime(intake_id="test", schema=schema)
        >>> sub = runtime.create_submission(actor={"kind": "agent", "id": "bot"})
        >>> sub["submissionId"]  # doctest: +ELLIPSIS
        'sub_...'
    """

    def __init__(self, intake_id: str, schema: Dict[str, Any]):
        """Initialize the IntakeRuntime.

        Args:
            intake_id: Unique identifier for this intake definition
            schema: JSON Schema that defines the data structure and validation rules
        """
        self.intake_id = intake_id
        self.schema = schema
        self._validation_engine = ValidationEngine(schema)
        self._submissions: Dict[str, Dict[str, Any]] = {}
        self._state_machines: Dict[str, SubmissionStateMachine] = {}
        self._resume_tokens: Dict[str, str] = {}  # resume_token -> submission_id
        self._submission_data: Dict[str, Dict[str, Any]] = {}  # submission_id -> field_data
        self._idempotency_keys: Dict[str, str] = {}  # idempotency_key -> submission_id

    def create_submission(
        self,
        actor: Union[Dict[str, Any], Actor],
        idempotency_key: Optional[str] = None,
        initial_fields: Optional[Dict[str, Any]] = None,
        ttl_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Create a new submission for this intake.

        Creates a new submission instance in DRAFT state (or IN_PROGRESS if
        initial_fields are provided). Supports idempotency to prevent duplicate
        submissions.

        Args:
            actor: The actor creating this submission (dict or Actor instance)
            idempotency_key: Optional key to prevent duplicate creation
            initial_fields: Optional pre-filled field data
            ttl_ms: Optional time-to-live in milliseconds

        Returns:
            Success response with:
                - ok: True
                - submissionId: Unique submission identifier
                - state: Current state ("draft" or "in_progress")
                - resumeToken: Token for resuming this submission
                - schema: The full intake schema
                - missingFields: List of required fields still needed (if initial_fields partial)

        Examples:
            >>> runtime = IntakeRuntime(intake_id="test", schema={"type": "object"})
            >>> sub = runtime.create_submission(actor={"kind": "agent", "id": "bot"})
            >>> sub["ok"]
            True
            >>> sub["state"]
            'draft'
        """
        # Handle idempotency
        if idempotency_key:
            if idempotency_key in self._idempotency_keys:
                existing_submission_id = self._idempotency_keys[idempotency_key]
                return self._get_submission_response(existing_submission_id)

        # Normalize actor
        if isinstance(actor, dict):
            actor = Actor(
                kind=ActorKind(actor["kind"]),
                id=actor["id"],
                name=actor.get("name"),
                metadata=actor.get("metadata")
            )

        # Generate IDs
        submission_id = f"sub_{uuid.uuid4().hex[:16]}"
        resume_token = self._generate_resume_token()

        # Create state machine
        state_machine = SubmissionStateMachine(submission_id=submission_id)
        self._state_machines[submission_id] = state_machine
        self._resume_tokens[resume_token] = submission_id

        # Initialize submission data
        self._submission_data[submission_id] = initial_fields or {}

        # Determine initial state
        if initial_fields:
            # Transition to IN_PROGRESS since fields were provided
            state_machine.transition_to(SubmissionState.IN_PROGRESS, actor)
            state = SubmissionState.IN_PROGRESS
        else:
            state = SubmissionState.DRAFT

        # Store idempotency key
        if idempotency_key:
            self._idempotency_keys[idempotency_key] = submission_id

        # Build response
        response: Dict[str, Any] = {
            "ok": True,
            "submissionId": submission_id,
            "state": state.value,
            "resumeToken": resume_token,
            "schema": self.schema,
        }

        # Add missing fields if initial_fields were provided
        if initial_fields:
            validation_result = self._validation_engine.validate(initial_fields)
            if not validation_result.is_valid:
                response["missingFields"] = validation_result.missing_fields or []

        # Store submission metadata
        self._submissions[submission_id] = {
            "submission_id": submission_id,
            "intake_id": self.intake_id,
            "state": state.value,
            "resume_token": resume_token,
            "created_by": actor.to_dict(),
            "ttl_ms": ttl_ms,
        }

        return response

    def _get_submission_response(self, submission_id: str) -> Dict[str, Any]:
        """Get response for an existing submission (for idempotency)."""
        submission = self._submissions.get(submission_id)
        if not submission:
            raise ValueError(f"Submission {submission_id} not found")

        state_machine = self._state_machines.get(submission_id)
        if not state_machine:
            raise ValueError(f"State machine for {submission_id} not found")

        return {
            "ok": True,
            "submissionId": submission_id,
            "state": state_machine.state.value,
            "resumeToken": submission["resume_token"],
            "schema": self.schema,
        }

    def _generate_resume_token(self) -> str:
        """Generate a cryptographically secure resume token."""
        return f"rt_{secrets.token_urlsafe(32)}"

    def get_submission(self, submission_id: str) -> Dict[str, Any]:
        """Retrieve current submission state and data.

        Args:
            submission_id: The submission identifier

        Returns:
            Complete submission state including fields, state, events, etc.

        Raises:
            ValueError: If submission_id is not found
        """
        submission = self._submissions.get(submission_id)
        if not submission:
            raise ValueError(f"Submission {submission_id} not found")

        state_machine = self._state_machines.get(submission_id)
        if not state_machine:
            raise ValueError(f"State machine for {submission_id} not found")

        data = self._submission_data.get(submission_id, {})
        events = state_machine.get_events()

        return {
            "ok": True,
            "submissionId": submission_id,
            "intakeId": self.intake_id,
            "state": state_machine.state.value,
            "resumeToken": submission["resume_token"],
            "fields": data,
            "events": [event.to_dict() for event in events],
            "createdBy": submission["created_by"],
        }


__all__ = [
    "IntakeRuntime",
]
