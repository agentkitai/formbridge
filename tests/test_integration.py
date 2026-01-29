"""Integration tests for complete submission lifecycle.

Tests cover end-to-end scenarios combining:
- IntakeRuntime orchestration
- State machine transitions
- Validation engine integration
- Event emission and tracking
- Resume token handling
- Idempotency guarantees

These tests verify that all components work together correctly to implement
the complete Intake Contract protocol as defined in INTAKE_CONTRACT_SPEC.md.
"""

import pytest
from datetime import datetime, timezone

from formbridge.runtime import IntakeRuntime
from formbridge.state_machine import SubmissionStateMachine, InvalidStateTransitionError
from formbridge.types import (
    Actor,
    ActorKind,
    EventType,
    SubmissionState,
)
from formbridge.validation import ValidationEngine


class TestHappyPath:
    """Test the happy path submission lifecycle."""

    def test_happy_path(self):
        """Test complete happy path: create → fill fields → validate → submit.

        This test verifies the ideal flow where:
        1. Agent creates a submission (DRAFT state)
        2. Agent provides all required fields (transitions to IN_PROGRESS)
        3. Validation passes (all fields correct)
        4. Submission can be transitioned to SUBMITTED state
        5. Events are emitted at each step
        """
        # Define schema
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string", "format": "email"},
                "age": {"type": "integer", "minimum": 18}
            },
            "required": ["name", "email"]
        }

        # Create runtime
        runtime = IntakeRuntime(intake_id="test_intake", schema=schema)

        # Step 1: Create submission
        actor = {"kind": "agent", "id": "bot_001", "name": "Test Bot"}
        result = runtime.create_submission(actor=actor)

        # Verify creation response
        assert result["ok"] is True
        assert "submissionId" in result
        assert result["state"] == "draft"
        assert "resumeToken" in result
        assert result["schema"] == schema

        submission_id = result["submissionId"]
        resume_token = result["resumeToken"]

        # Verify submission can be retrieved
        submission = runtime.get_submission(submission_id)
        assert submission["ok"] is True
        assert submission["submissionId"] == submission_id
        assert submission["state"] == "draft"
        assert submission["intakeId"] == "test_intake"
        assert submission["fields"] == {}
        assert "events" in submission

        # Verify initial events (no events yet since no state transitions)
        assert isinstance(submission["events"], list)

        # Step 2: Provide complete, valid data
        complete_data = {
            "name": "Alice Smith",
            "email": "alice@example.com",
            "age": 30
        }

        # Create new submission with initial fields
        result2 = runtime.create_submission(
            actor=actor,
            initial_fields=complete_data,
            idempotency_key="test_key_1"
        )

        assert result2["ok"] is True
        assert result2["state"] == "in_progress"  # Auto-transition when fields provided
        submission_id2 = result2["submissionId"]

        # Step 3: Validate data
        validation_engine = ValidationEngine(schema)
        validation_result = validation_engine.validate(complete_data)

        assert validation_result.is_valid is True
        assert len(validation_result.errors) == 0
        assert validation_result.data == complete_data

        # Step 4: Verify state machine can transition to SUBMITTED
        state_machine = runtime._state_machines[submission_id2]
        actor_obj = Actor(kind=ActorKind.AGENT, id="bot_001", name="Test Bot")

        # Transition to SUBMITTED state
        state_machine.transition_to(SubmissionState.SUBMITTED, actor_obj)
        assert state_machine.state == SubmissionState.SUBMITTED

        # Step 5: Verify events were emitted
        events = state_machine.get_events()
        assert len(events) > 0

        # Should have FIELD_UPDATED event for initial transition
        assert any(e.type == EventType.FIELD_UPDATED for e in events)

        # Should have SUBMISSION_SUBMITTED event
        assert any(e.type == EventType.SUBMISSION_SUBMITTED for e in events)

        # Verify event structure
        for event in events:
            assert event.submission_id == submission_id2
            assert event.actor.id == "bot_001"
            assert hasattr(event, "ts")
            assert isinstance(event.ts, datetime)


class TestSubmissionCreation:
    """Test submission creation scenarios."""

    def test_create_draft_submission(self):
        """Should create submission in DRAFT state when no initial fields."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        result = runtime.create_submission(actor={"kind": "agent", "id": "bot_1"})

        assert result["ok"] is True
        assert result["state"] == "draft"
        assert "submissionId" in result
        assert "resumeToken" in result
        assert result["schema"] == schema

    def test_create_in_progress_submission_with_initial_fields(self):
        """Should create submission in IN_PROGRESS state when initial fields provided."""
        schema = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        result = runtime.create_submission(
            actor={"kind": "agent", "id": "bot_1"},
            initial_fields={"name": "Alice"}
        )

        assert result["ok"] is True
        assert result["state"] == "in_progress"

        # Verify submission data is stored
        submission = runtime.get_submission(result["submissionId"])
        assert submission["fields"] == {"name": "Alice"}

    def test_create_with_partial_initial_fields(self):
        """Should return missingFields when initial_fields are incomplete."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string"}
            },
            "required": ["name", "email"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        result = runtime.create_submission(
            actor={"kind": "agent", "id": "bot_1"},
            initial_fields={"name": "Alice"}  # Missing email
        )

        assert result["ok"] is True
        assert result["state"] == "in_progress"
        assert "missingFields" in result
        assert "email" in result["missingFields"]


class TestIdempotency:
    """Test idempotency guarantees."""

    def test_idempotent_submission_creation(self):
        """Should return same submission for duplicate idempotency key."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        actor = {"kind": "agent", "id": "bot_1"}
        idempotency_key = "unique_key_123"

        # First request
        result1 = runtime.create_submission(actor=actor, idempotency_key=idempotency_key)
        submission_id1 = result1["submissionId"]

        # Second request with same key
        result2 = runtime.create_submission(actor=actor, idempotency_key=idempotency_key)
        submission_id2 = result2["submissionId"]

        # Should return same submission
        assert submission_id1 == submission_id2
        assert result1["resumeToken"] == result2["resumeToken"]

    def test_different_idempotency_keys_create_different_submissions(self):
        """Should create different submissions for different idempotency keys."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        actor = {"kind": "agent", "id": "bot_1"}

        result1 = runtime.create_submission(actor=actor, idempotency_key="key_1")
        result2 = runtime.create_submission(actor=actor, idempotency_key="key_2")

        assert result1["submissionId"] != result2["submissionId"]
        assert result1["resumeToken"] != result2["resumeToken"]


class TestValidationIntegration:
    """Test integration with validation engine."""

    def test_validation_with_missing_required_fields(self):
        """Should detect missing required fields."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string", "format": "email"}
            },
            "required": ["name", "email"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        # Create with incomplete data
        result = runtime.create_submission(
            actor={"kind": "agent", "id": "bot_1"},
            initial_fields={"name": "Alice"}
        )

        # Verify validation detected missing field
        assert "missingFields" in result
        assert "email" in result["missingFields"]

    def test_validation_with_invalid_type(self):
        """Should validate field types using the validation engine."""
        schema = {
            "type": "object",
            "properties": {
                "age": {"type": "integer"}
            },
            "required": ["age"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        # Validate with wrong type
        validation_result = runtime._validation_engine.validate({"age": "not a number"})

        assert validation_result.is_valid is False
        assert len(validation_result.errors) > 0
        assert validation_result.errors[0].path == "age"

    def test_validation_with_constraint_violations(self):
        """Should validate constraints like minimum, maximum, pattern."""
        schema = {
            "type": "object",
            "properties": {
                "age": {"type": "integer", "minimum": 18},
                "email": {"type": "string", "format": "email"}
            },
            "required": ["age", "email"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        # Test minimum constraint
        validation_result = runtime._validation_engine.validate({
            "age": 15,
            "email": "test@example.com"
        })

        assert validation_result.is_valid is False
        assert len(validation_result.errors) > 0

    def test_validation_success_with_all_valid_fields(self):
        """Should pass validation when all fields are valid."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "integer", "minimum": 18},
                "email": {"type": "string", "format": "email"}
            },
            "required": ["name", "age", "email"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        data = {
            "name": "Alice",
            "age": 30,
            "email": "alice@example.com"
        }

        validation_result = runtime._validation_engine.validate(data)

        assert validation_result.is_valid is True
        assert len(validation_result.errors) == 0
        assert validation_result.data == data


class TestStateMachineIntegration:
    """Test integration with state machine."""

    def test_state_transitions_through_runtime(self):
        """Should properly manage state transitions through the runtime."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        # Create submission
        result = runtime.create_submission(actor={"kind": "agent", "id": "bot_1"})
        submission_id = result["submissionId"]

        # Get state machine
        state_machine = runtime._state_machines[submission_id]
        assert state_machine.state == SubmissionState.DRAFT

        # Transition to IN_PROGRESS
        actor = Actor(kind=ActorKind.AGENT, id="bot_1")
        state_machine.transition_to(SubmissionState.IN_PROGRESS, actor)
        assert state_machine.state == SubmissionState.IN_PROGRESS

        # Transition to SUBMITTED
        state_machine.transition_to(SubmissionState.SUBMITTED, actor)
        assert state_machine.state == SubmissionState.SUBMITTED

    def test_invalid_state_transition_raises_error(self):
        """Should raise error for invalid state transitions."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        result = runtime.create_submission(actor={"kind": "agent", "id": "bot_1"})
        submission_id = result["submissionId"]

        state_machine = runtime._state_machines[submission_id]
        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        # Try invalid transition: DRAFT → SUBMITTED (must go through IN_PROGRESS)
        with pytest.raises(InvalidStateTransitionError) as exc_info:
            state_machine.transition_to(SubmissionState.SUBMITTED, actor)

        assert "draft" in str(exc_info.value).lower()
        assert "submitted" in str(exc_info.value).lower()

    def test_terminal_state_prevents_further_transitions(self):
        """Should prevent transitions from terminal states."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        result = runtime.create_submission(actor={"kind": "agent", "id": "bot_1"})
        submission_id = result["submissionId"]

        state_machine = runtime._state_machines[submission_id]
        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        # Transition to terminal state
        state_machine.transition_to(SubmissionState.CANCELLED, actor)
        assert state_machine.state == SubmissionState.CANCELLED
        assert state_machine.is_terminal() is True

        # Try to transition from terminal state
        with pytest.raises(InvalidStateTransitionError) as exc_info:
            state_machine.transition_to(SubmissionState.IN_PROGRESS, actor)

        assert "terminal" in str(exc_info.value).lower()


class TestEventEmission:
    """Test event emission throughout submission lifecycle."""

    def test_events_emitted_on_state_transitions(self):
        """Should emit events when state transitions occur."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        # Create submission with initial fields (triggers transition)
        result = runtime.create_submission(
            actor={"kind": "agent", "id": "bot_1"},
            initial_fields={"name": "Alice"}
        )
        submission_id = result["submissionId"]

        # Get events
        state_machine = runtime._state_machines[submission_id]
        events = state_machine.get_events()

        # Should have at least one event for DRAFT → IN_PROGRESS transition
        assert len(events) > 0
        assert events[0].submission_id == submission_id
        assert events[0].type == EventType.FIELD_UPDATED

    def test_event_payload_contains_transition_details(self):
        """Should include from_state and to_state in event payload."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        result = runtime.create_submission(actor={"kind": "agent", "id": "bot_1"})
        submission_id = result["submissionId"]

        state_machine = runtime._state_machines[submission_id]
        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        # Perform transition
        state_machine.transition_to(SubmissionState.IN_PROGRESS, actor)

        # Check event payload
        events = state_machine.get_events()
        assert len(events) > 0

        last_event = events[-1]
        assert last_event.payload is not None
        assert "from_state" in last_event.payload
        assert "to_state" in last_event.payload
        assert last_event.payload["from_state"] == "draft"
        assert last_event.payload["to_state"] == "in_progress"

    def test_event_actor_tracking(self):
        """Should track actor in events."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        actor_dict = {"kind": "agent", "id": "bot_123", "name": "Test Agent"}
        result = runtime.create_submission(actor=actor_dict)
        submission_id = result["submissionId"]

        state_machine = runtime._state_machines[submission_id]
        actor = Actor(kind=ActorKind.AGENT, id="bot_123", name="Test Agent")

        # Perform transition
        state_machine.transition_to(SubmissionState.IN_PROGRESS, actor)

        # Verify actor in events
        events = state_machine.get_events()
        for event in events:
            assert event.actor.id == "bot_123"
            assert event.actor.kind == ActorKind.AGENT
            assert event.actor.name == "Test Agent"

    def test_multiple_transitions_create_event_chain(self):
        """Should create event chain for multiple transitions."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        result = runtime.create_submission(actor={"kind": "agent", "id": "bot_1"})
        submission_id = result["submissionId"]

        state_machine = runtime._state_machines[submission_id]
        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        # Perform multiple transitions
        state_machine.transition_to(SubmissionState.IN_PROGRESS, actor)
        state_machine.transition_to(SubmissionState.AWAITING_INPUT, actor)
        state_machine.transition_to(SubmissionState.IN_PROGRESS, actor)
        state_machine.transition_to(SubmissionState.SUBMITTED, actor)

        # Verify event chain
        events = state_machine.get_events()
        assert len(events) == 4

        # Verify chronological ordering
        for i in range(len(events) - 1):
            assert events[i].ts <= events[i + 1].ts


class TestResumeTokens:
    """Test resume token handling."""

    def test_resume_token_generated_on_creation(self):
        """Should generate resume token when submission is created."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        result = runtime.create_submission(actor={"kind": "agent", "id": "bot_1"})

        assert "resumeToken" in result
        assert result["resumeToken"].startswith("rt_")
        assert len(result["resumeToken"]) > 10  # Should be long token

    def test_resume_token_mapping_to_submission(self):
        """Should maintain mapping from resume token to submission ID."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        result = runtime.create_submission(actor={"kind": "agent", "id": "bot_1"})
        submission_id = result["submissionId"]
        resume_token = result["resumeToken"]

        # Verify mapping exists
        assert resume_token in runtime._resume_tokens
        assert runtime._resume_tokens[resume_token] == submission_id

    def test_resume_token_returned_in_get_submission(self):
        """Should include resume token in get_submission response."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        result = runtime.create_submission(actor={"kind": "agent", "id": "bot_1"})
        submission_id = result["submissionId"]
        resume_token = result["resumeToken"]

        # Get submission
        submission = runtime.get_submission(submission_id)

        assert submission["resumeToken"] == resume_token


class TestActorNormalization:
    """Test actor dict to Actor object normalization."""

    def test_actor_dict_normalized_to_actor_object(self):
        """Should convert actor dict to Actor object."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        actor_dict = {
            "kind": "human",
            "id": "user_123",
            "name": "Alice Smith",
            "metadata": {"email": "alice@example.com"}
        }

        result = runtime.create_submission(actor=actor_dict)
        submission_id = result["submissionId"]

        # Verify actor stored correctly
        submission = runtime.get_submission(submission_id)
        created_by = submission["createdBy"]

        assert created_by["kind"] == "human"
        assert created_by["id"] == "user_123"
        assert created_by["name"] == "Alice Smith"
        assert created_by["metadata"] == {"email": "alice@example.com"}

    def test_actor_object_accepted_directly(self):
        """Should accept Actor object directly without conversion."""
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        actor = Actor(
            kind=ActorKind.SYSTEM,
            id="system_1",
            name="System Process"
        )

        result = runtime.create_submission(actor=actor)
        submission_id = result["submissionId"]

        submission = runtime.get_submission(submission_id)
        created_by = submission["createdBy"]

        assert created_by["kind"] == "system"
        assert created_by["id"] == "system_1"
        assert created_by["name"] == "System Process"


class TestValidationErrorHandling:
    """Test complete validation error handling flows."""

    def test_missing_fields_error_structure(self):
        """Should return structured errors for missing required fields.

        Verifies that validation errors include:
        - Field paths
        - Error codes (REQUIRED)
        - Human-readable messages
        - Expected vs received values
        """
        schema = {
            "type": "object",
            "properties": {
                "company_name": {"type": "string"},
                "tax_id": {"type": "string"},
                "contact_email": {"type": "string", "format": "email"}
            },
            "required": ["company_name", "tax_id", "contact_email"]
        }
        runtime = IntakeRuntime(intake_id="vendor_onboarding", schema=schema)

        # Validate empty submission
        validation_result = runtime._validation_engine.validate({})

        assert validation_result.is_valid is False
        assert len(validation_result.errors) == 3

        # Verify error structure for each missing field
        error_paths = {err.path for err in validation_result.errors}
        assert "company_name" in error_paths
        assert "tax_id" in error_paths
        assert "contact_email" in error_paths

        # Verify all errors have REQUIRED code
        from formbridge.errors import FieldErrorCode
        for error in validation_result.errors:
            assert error.code == FieldErrorCode.REQUIRED
            assert error.message  # Has human-readable message
            assert "required" in error.message.lower()

    def test_type_error_structure(self):
        """Should return structured errors for type mismatches.

        Verifies that type errors include expected vs received types.
        """
        schema = {
            "type": "object",
            "properties": {
                "revenue": {"type": "number"},
                "employee_count": {"type": "integer"},
                "is_public": {"type": "boolean"}
            },
            "required": ["revenue", "employee_count", "is_public"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        # Provide wrong types
        invalid_data = {
            "revenue": "not a number",
            "employee_count": "not an integer",
            "is_public": "not a boolean"
        }

        validation_result = runtime._validation_engine.validate(invalid_data)

        assert validation_result.is_valid is False
        assert len(validation_result.errors) > 0

        # Verify type errors include expected and received
        from formbridge.errors import FieldErrorCode
        for error in validation_result.errors:
            assert error.code == FieldErrorCode.INVALID_TYPE
            assert error.expected is not None
            assert error.received is not None

    def test_constraint_violation_error_structure(self):
        """Should return structured errors for constraint violations.

        Verifies that constraint errors include constraint details.
        """
        schema = {
            "type": "object",
            "properties": {
                "age": {"type": "integer", "minimum": 18, "maximum": 120},
                "username": {"type": "string", "minLength": 3, "maxLength": 20},
                "status": {"type": "string", "enum": ["active", "inactive", "pending"]}
            },
            "required": ["age", "username", "status"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        # Violate all constraints
        invalid_data = {
            "age": 15,  # Below minimum
            "username": "ab",  # Too short
            "status": "invalid_status"  # Not in enum
        }

        validation_result = runtime._validation_engine.validate(invalid_data)

        assert validation_result.is_valid is False
        assert len(validation_result.errors) == 3

        # Verify constraint error details
        from formbridge.errors import FieldErrorCode
        error_by_path = {err.path: err for err in validation_result.errors}

        age_error = error_by_path["age"]
        assert age_error.code == FieldErrorCode.INVALID_VALUE
        assert age_error.expected is not None
        assert age_error.received == 15

        username_error = error_by_path["username"]
        assert username_error.code == FieldErrorCode.TOO_SHORT
        assert username_error.expected is not None
        assert username_error.received == "ab"

        status_error = error_by_path["status"]
        assert status_error.code == FieldErrorCode.INVALID_VALUE

    def test_nested_field_error_paths(self):
        """Should include full dot-notation paths for nested field errors."""
        schema = {
            "type": "object",
            "properties": {
                "contact": {
                    "type": "object",
                    "properties": {
                        "email": {"type": "string", "format": "email"},
                        "phone": {"type": "string"}
                    },
                    "required": ["email", "phone"]
                },
                "address": {
                    "type": "object",
                    "properties": {
                        "city": {"type": "string"},
                        "postal_code": {"type": "string"}
                    },
                    "required": ["city", "postal_code"]
                }
            },
            "required": ["contact", "address"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        # Partial nested data
        partial_data = {
            "contact": {
                "email": "invalid-email"  # Missing phone
            },
            "address": {}  # Missing city and postal_code
        }

        validation_result = runtime._validation_engine.validate(partial_data)

        assert validation_result.is_valid is False

        # Verify nested field paths
        error_paths = {err.path for err in validation_result.errors}
        assert "contact.email" in error_paths  # Format error
        assert "contact.phone" in error_paths  # Missing
        assert "address.city" in error_paths  # Missing
        assert "address.postal_code" in error_paths  # Missing

    def test_validation_retry_flow(self):
        """Test complete retry flow: invalid → fix → validate → success.

        Simulates agent receiving errors, fixing them, and retrying.
        """
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string", "format": "email"},
                "age": {"type": "integer", "minimum": 18}
            },
            "required": ["name", "email", "age"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        # Step 1: Submit invalid data
        invalid_data = {
            "name": "Alice",
            "email": "not-an-email",  # Invalid format
            "age": 15  # Below minimum
        }

        result1 = runtime._validation_engine.validate(invalid_data)
        assert result1.is_valid is False
        assert len(result1.errors) == 2

        # Step 2: Agent fixes email based on error
        email_error = next(err for err in result1.errors if err.path == "email")
        from formbridge.errors import FieldErrorCode
        assert email_error.code == FieldErrorCode.INVALID_FORMAT

        invalid_data["email"] = "alice@example.com"  # Fix email

        result2 = runtime._validation_engine.validate(invalid_data)
        assert result2.is_valid is False
        assert len(result2.errors) == 1  # Only age error remains

        # Step 3: Agent fixes age based on error
        age_error = result2.errors[0]
        assert age_error.path == "age"
        assert age_error.code == FieldErrorCode.INVALID_VALUE

        invalid_data["age"] = 25  # Fix age

        # Step 4: Validation succeeds
        result3 = runtime._validation_engine.validate(invalid_data)
        assert result3.is_valid is True
        assert len(result3.errors) == 0
        assert result3.data == invalid_data

    def test_mixed_error_types_in_single_validation(self):
        """Should handle multiple error types in single validation.

        Tests that a single validation can return:
        - Missing field errors (REQUIRED)
        - Type errors (INVALID_TYPE)
        - Constraint errors (INVALID_VALUE, TOO_SHORT, etc.)
        """
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "integer", "minimum": 18},
                "email": {"type": "string", "format": "email"},
                "username": {"type": "string", "minLength": 3}
            },
            "required": ["name", "age", "email", "username"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        # Mix of missing, type, and constraint errors
        data = {
            # "name" is missing (REQUIRED)
            "age": "not-a-number",  # Type error (INVALID_TYPE)
            "email": "invalid",  # Format error (INVALID_FORMAT)
            "username": "ab"  # Too short (TOO_SHORT)
        }

        validation_result = runtime._validation_engine.validate(data)

        assert validation_result.is_valid is False
        assert len(validation_result.errors) == 4

        # Verify we have different error types
        from formbridge.errors import FieldErrorCode
        error_codes = {err.code for err in validation_result.errors}
        assert FieldErrorCode.REQUIRED in error_codes
        assert FieldErrorCode.INVALID_TYPE in error_codes
        assert FieldErrorCode.INVALID_FORMAT in error_codes
        assert FieldErrorCode.TOO_SHORT in error_codes

    def test_validation_result_lists(self):
        """Should populate missing_fields and invalid_fields lists correctly."""
        schema = {
            "type": "object",
            "properties": {
                "required_field": {"type": "string"},
                "optional_field": {"type": "string"},
                "typed_field": {"type": "integer"}
            },
            "required": ["required_field", "typed_field"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        # Missing + type error
        data = {
            # "required_field" missing
            "typed_field": "not-an-integer"  # Type error
        }

        validation_result = runtime._validation_engine.validate(data)

        assert validation_result.is_valid is False
        assert "required_field" in validation_result.missing_fields
        assert "typed_field" in validation_result.invalid_fields

    def test_error_messages_are_actionable(self):
        """Should provide clear, actionable error messages for agents."""
        schema = {
            "type": "object",
            "properties": {
                "email": {"type": "string", "format": "email"},
                "age": {"type": "integer", "minimum": 18},
                "status": {"type": "string", "enum": ["active", "pending"]}
            },
            "required": ["email", "age", "status"]
        }
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        invalid_data = {
            "email": "invalid-email",
            "age": 15,
            "status": "unknown"
        }

        validation_result = runtime._validation_engine.validate(invalid_data)

        # All errors should have non-empty messages
        for error in validation_result.errors:
            assert error.message
            assert len(error.message) > 0
            # Messages should be descriptive
            assert any(keyword in error.message.lower()
                      for keyword in ["invalid", "format", "minimum", "must", "expected"])


class TestComplexScenarios:
    """Test complex end-to-end scenarios."""

    def test_full_lifecycle_with_validation_and_events(self):
        """Test complete lifecycle: create → validate → transition → verify events."""
        schema = {
            "type": "object",
            "properties": {
                "company": {"type": "string"},
                "contact_email": {"type": "string", "format": "email"},
                "revenue": {"type": "number", "minimum": 0}
            },
            "required": ["company", "contact_email"]
        }
        runtime = IntakeRuntime(intake_id="vendor_onboarding", schema=schema)

        # Step 1: Create draft
        result = runtime.create_submission(
            actor={"kind": "agent", "id": "onboarding_bot"}
        )
        assert result["state"] == "draft"
        submission_id = result["submissionId"]

        # Step 2: Validate empty submission (should fail)
        validation_result = runtime._validation_engine.validate({})
        assert validation_result.is_valid is False
        assert len(validation_result.missing_fields) > 0

        # Step 3: Validate partial data (should fail)
        partial_data = {"company": "Acme Corp"}
        validation_result = runtime._validation_engine.validate(partial_data)
        assert validation_result.is_valid is False

        # Step 4: Validate complete data (should pass)
        complete_data = {
            "company": "Acme Corp",
            "contact_email": "contact@acme.com",
            "revenue": 1000000
        }
        validation_result = runtime._validation_engine.validate(complete_data)
        assert validation_result.is_valid is True

        # Step 5: Perform state transitions
        state_machine = runtime._state_machines[submission_id]
        actor = Actor(kind=ActorKind.AGENT, id="onboarding_bot")

        state_machine.transition_to(SubmissionState.IN_PROGRESS, actor)
        state_machine.transition_to(SubmissionState.SUBMITTED, actor)
        state_machine.transition_to(SubmissionState.FINALIZED, actor)

        assert state_machine.state == SubmissionState.FINALIZED
        assert state_machine.is_terminal() is True

        # Step 6: Verify event audit trail
        events = state_machine.get_events()
        assert len(events) == 3

        # All events should be for this submission
        for event in events:
            assert event.submission_id == submission_id
            assert event.actor.id == "onboarding_bot"

    def test_approval_workflow_simulation(self):
        """Test approval workflow: submit → needs_review → approved → finalized."""
        schema = {
            "type": "object",
            "properties": {
                "amount": {"type": "number", "minimum": 0}
            },
            "required": ["amount"]
        }
        runtime = IntakeRuntime(intake_id="expense_approval", schema=schema)

        # Create and submit
        result = runtime.create_submission(
            actor={"kind": "agent", "id": "expense_bot"},
            initial_fields={"amount": 5000}
        )
        submission_id = result["submissionId"]

        state_machine = runtime._state_machines[submission_id]
        agent = Actor(kind=ActorKind.AGENT, id="expense_bot")
        reviewer = Actor(kind=ActorKind.HUMAN, id="manager_1", name="Manager")

        # Submit
        state_machine.transition_to(SubmissionState.SUBMITTED, agent)

        # Route to review
        state_machine.transition_to(SubmissionState.NEEDS_REVIEW, agent)
        assert state_machine.state == SubmissionState.NEEDS_REVIEW

        # Manager approves
        state_machine.transition_to(SubmissionState.APPROVED, reviewer)
        assert state_machine.state == SubmissionState.APPROVED

        # Finalize
        system = Actor(kind=ActorKind.SYSTEM, id="delivery_system")
        state_machine.transition_to(SubmissionState.FINALIZED, system)
        assert state_machine.state == SubmissionState.FINALIZED

        # Verify event trail includes multiple actors
        events = state_machine.get_events()
        actor_ids = {event.actor.id for event in events}
        assert "expense_bot" in actor_ids
        assert "manager_1" in actor_ids
        assert "delivery_system" in actor_ids

    def test_rejection_workflow(self):
        """Test rejection workflow: submit → needs_review → rejected."""
        schema = {"type": "object", "properties": {"data": {"type": "string"}}}
        runtime = IntakeRuntime(intake_id="test", schema=schema)

        result = runtime.create_submission(actor={"kind": "agent", "id": "bot"})
        submission_id = result["submissionId"]

        state_machine = runtime._state_machines[submission_id]
        agent = Actor(kind=ActorKind.AGENT, id="bot")
        reviewer = Actor(kind=ActorKind.HUMAN, id="reviewer")

        # Submit and route to review
        state_machine.transition_to(SubmissionState.IN_PROGRESS, agent)
        state_machine.transition_to(SubmissionState.SUBMITTED, agent)
        state_machine.transition_to(SubmissionState.NEEDS_REVIEW, agent)

        # Reviewer rejects
        state_machine.transition_to(SubmissionState.REJECTED, reviewer)
        assert state_machine.state == SubmissionState.REJECTED
        assert state_machine.is_terminal() is True

        # Verify rejection event
        events = state_machine.get_events()
        rejection_events = [e for e in events if e.type == EventType.REVIEW_REJECTED]
        assert len(rejection_events) > 0


# Convenience functions for pytest discovery
def test_happy_path():
    """Run happy path test."""
    test = TestHappyPath()
    test.test_happy_path()


def test_validation_errors():
    """Run validation error handling tests."""
    test = TestValidationErrorHandling()
    test.test_missing_fields_error_structure()
    test.test_type_error_structure()
    test.test_constraint_violation_error_structure()
    test.test_nested_field_error_paths()
    test.test_validation_retry_flow()
    test.test_mixed_error_types_in_single_validation()
    test.test_validation_result_lists()
    test.test_error_messages_are_actionable()


def test_approval_flow():
    """Run approval workflow tests.

    Tests complete approval workflows including:
    - Approval path: submit → needs_review → approved → finalized
    - Rejection path: submit → needs_review → rejected
    - Multi-actor event tracking
    """
    test = TestComplexScenarios()
    test.test_approval_workflow_simulation()
    test.test_rejection_workflow()


def test_resume_and_idempotency():
    """Run resume token and idempotency tests.

    Tests resume token functionality and idempotency guarantees including:
    - Resume token generation on submission creation
    - Resume token mapping to submission ID
    - Resume token included in get_submission response
    - Idempotent submission creation with same key
    - Different idempotency keys create different submissions
    """
    # Test resume tokens
    resume_test = TestResumeTokens()
    resume_test.test_resume_token_generated_on_creation()
    resume_test.test_resume_token_mapping_to_submission()
    resume_test.test_resume_token_returned_in_get_submission()

    # Test idempotency
    idempotency_test = TestIdempotency()
    idempotency_test.test_idempotent_submission_creation()
    idempotency_test.test_different_idempotency_keys_create_different_submissions()
