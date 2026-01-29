"""Unit tests for the submission state machine.

Tests cover:
- Valid state transitions for all states
- State machine initialization
- Terminal state detection
- Serialization and deserialization
- Helper methods (can_transition_to, is_terminal)

Following INTAKE_CONTRACT_SPEC.md §2 (Submission Lifecycle).
"""

import pytest

from formbridge.state_machine import (
    InvalidStateTransitionError,
    SubmissionStateMachine,
    VALID_TRANSITIONS,
)
from formbridge.types import SubmissionState


class TestStateMachineInitialization:
    """Test state machine initialization and defaults."""

    def test_init_with_submission_id(self):
        """Should initialize with submission_id and default to DRAFT state."""
        sm = SubmissionStateMachine(submission_id="sub_123")
        assert sm.submission_id == "sub_123"
        assert sm.state == SubmissionState.DRAFT

    def test_init_with_custom_state(self):
        """Should initialize with custom state if provided."""
        sm = SubmissionStateMachine(
            submission_id="sub_456",
            state=SubmissionState.IN_PROGRESS
        )
        assert sm.submission_id == "sub_456"
        assert sm.state == SubmissionState.IN_PROGRESS


class TestValidTransitionsFromDraft:
    """Test valid transitions from DRAFT state."""

    def test_draft_to_in_progress(self):
        """Should transition from DRAFT to IN_PROGRESS."""
        sm = SubmissionStateMachine(submission_id="sub_001")
        sm.transition_to(SubmissionState.IN_PROGRESS)
        assert sm.state == SubmissionState.IN_PROGRESS

    def test_draft_to_cancelled(self):
        """Should transition from DRAFT to CANCELLED."""
        sm = SubmissionStateMachine(submission_id="sub_002")
        sm.transition_to(SubmissionState.CANCELLED)
        assert sm.state == SubmissionState.CANCELLED

    def test_draft_to_expired(self):
        """Should transition from DRAFT to EXPIRED."""
        sm = SubmissionStateMachine(submission_id="sub_003")
        sm.transition_to(SubmissionState.EXPIRED)
        assert sm.state == SubmissionState.EXPIRED


class TestValidTransitionsFromInProgress:
    """Test valid transitions from IN_PROGRESS state."""

    def test_in_progress_to_awaiting_input(self):
        """Should transition from IN_PROGRESS to AWAITING_INPUT."""
        sm = SubmissionStateMachine(
            submission_id="sub_010",
            state=SubmissionState.IN_PROGRESS
        )
        sm.transition_to(SubmissionState.AWAITING_INPUT)
        assert sm.state == SubmissionState.AWAITING_INPUT

    def test_in_progress_to_awaiting_upload(self):
        """Should transition from IN_PROGRESS to AWAITING_UPLOAD."""
        sm = SubmissionStateMachine(
            submission_id="sub_011",
            state=SubmissionState.IN_PROGRESS
        )
        sm.transition_to(SubmissionState.AWAITING_UPLOAD)
        assert sm.state == SubmissionState.AWAITING_UPLOAD

    def test_in_progress_to_submitted(self):
        """Should transition from IN_PROGRESS to SUBMITTED."""
        sm = SubmissionStateMachine(
            submission_id="sub_012",
            state=SubmissionState.IN_PROGRESS
        )
        sm.transition_to(SubmissionState.SUBMITTED)
        assert sm.state == SubmissionState.SUBMITTED

    def test_in_progress_to_cancelled(self):
        """Should transition from IN_PROGRESS to CANCELLED."""
        sm = SubmissionStateMachine(
            submission_id="sub_013",
            state=SubmissionState.IN_PROGRESS
        )
        sm.transition_to(SubmissionState.CANCELLED)
        assert sm.state == SubmissionState.CANCELLED

    def test_in_progress_to_expired(self):
        """Should transition from IN_PROGRESS to EXPIRED."""
        sm = SubmissionStateMachine(
            submission_id="sub_014",
            state=SubmissionState.IN_PROGRESS
        )
        sm.transition_to(SubmissionState.EXPIRED)
        assert sm.state == SubmissionState.EXPIRED


class TestValidTransitionsFromAwaitingInput:
    """Test valid transitions from AWAITING_INPUT state."""

    def test_awaiting_input_to_in_progress(self):
        """Should transition from AWAITING_INPUT to IN_PROGRESS."""
        sm = SubmissionStateMachine(
            submission_id="sub_020",
            state=SubmissionState.AWAITING_INPUT
        )
        sm.transition_to(SubmissionState.IN_PROGRESS)
        assert sm.state == SubmissionState.IN_PROGRESS

    def test_awaiting_input_to_cancelled(self):
        """Should transition from AWAITING_INPUT to CANCELLED."""
        sm = SubmissionStateMachine(
            submission_id="sub_021",
            state=SubmissionState.AWAITING_INPUT
        )
        sm.transition_to(SubmissionState.CANCELLED)
        assert sm.state == SubmissionState.CANCELLED

    def test_awaiting_input_to_expired(self):
        """Should transition from AWAITING_INPUT to EXPIRED."""
        sm = SubmissionStateMachine(
            submission_id="sub_022",
            state=SubmissionState.AWAITING_INPUT
        )
        sm.transition_to(SubmissionState.EXPIRED)
        assert sm.state == SubmissionState.EXPIRED


class TestValidTransitionsFromAwaitingUpload:
    """Test valid transitions from AWAITING_UPLOAD state."""

    def test_awaiting_upload_to_in_progress(self):
        """Should transition from AWAITING_UPLOAD to IN_PROGRESS."""
        sm = SubmissionStateMachine(
            submission_id="sub_030",
            state=SubmissionState.AWAITING_UPLOAD
        )
        sm.transition_to(SubmissionState.IN_PROGRESS)
        assert sm.state == SubmissionState.IN_PROGRESS

    def test_awaiting_upload_to_cancelled(self):
        """Should transition from AWAITING_UPLOAD to CANCELLED."""
        sm = SubmissionStateMachine(
            submission_id="sub_031",
            state=SubmissionState.AWAITING_UPLOAD
        )
        sm.transition_to(SubmissionState.CANCELLED)
        assert sm.state == SubmissionState.CANCELLED

    def test_awaiting_upload_to_expired(self):
        """Should transition from AWAITING_UPLOAD to EXPIRED."""
        sm = SubmissionStateMachine(
            submission_id="sub_032",
            state=SubmissionState.AWAITING_UPLOAD
        )
        sm.transition_to(SubmissionState.EXPIRED)
        assert sm.state == SubmissionState.EXPIRED


class TestValidTransitionsFromSubmitted:
    """Test valid transitions from SUBMITTED state."""

    def test_submitted_to_needs_review(self):
        """Should transition from SUBMITTED to NEEDS_REVIEW."""
        sm = SubmissionStateMachine(
            submission_id="sub_040",
            state=SubmissionState.SUBMITTED
        )
        sm.transition_to(SubmissionState.NEEDS_REVIEW)
        assert sm.state == SubmissionState.NEEDS_REVIEW

    def test_submitted_to_finalized(self):
        """Should transition from SUBMITTED to FINALIZED."""
        sm = SubmissionStateMachine(
            submission_id="sub_041",
            state=SubmissionState.SUBMITTED
        )
        sm.transition_to(SubmissionState.FINALIZED)
        assert sm.state == SubmissionState.FINALIZED

    def test_submitted_to_rejected(self):
        """Should transition from SUBMITTED to REJECTED."""
        sm = SubmissionStateMachine(
            submission_id="sub_042",
            state=SubmissionState.SUBMITTED
        )
        sm.transition_to(SubmissionState.REJECTED)
        assert sm.state == SubmissionState.REJECTED

    def test_submitted_to_cancelled(self):
        """Should transition from SUBMITTED to CANCELLED."""
        sm = SubmissionStateMachine(
            submission_id="sub_043",
            state=SubmissionState.SUBMITTED
        )
        sm.transition_to(SubmissionState.CANCELLED)
        assert sm.state == SubmissionState.CANCELLED

    def test_submitted_to_expired(self):
        """Should transition from SUBMITTED to EXPIRED."""
        sm = SubmissionStateMachine(
            submission_id="sub_044",
            state=SubmissionState.SUBMITTED
        )
        sm.transition_to(SubmissionState.EXPIRED)
        assert sm.state == SubmissionState.EXPIRED


class TestValidTransitionsFromNeedsReview:
    """Test valid transitions from NEEDS_REVIEW state."""

    def test_needs_review_to_approved(self):
        """Should transition from NEEDS_REVIEW to APPROVED."""
        sm = SubmissionStateMachine(
            submission_id="sub_050",
            state=SubmissionState.NEEDS_REVIEW
        )
        sm.transition_to(SubmissionState.APPROVED)
        assert sm.state == SubmissionState.APPROVED

    def test_needs_review_to_rejected(self):
        """Should transition from NEEDS_REVIEW to REJECTED."""
        sm = SubmissionStateMachine(
            submission_id="sub_051",
            state=SubmissionState.NEEDS_REVIEW
        )
        sm.transition_to(SubmissionState.REJECTED)
        assert sm.state == SubmissionState.REJECTED

    def test_needs_review_to_cancelled(self):
        """Should transition from NEEDS_REVIEW to CANCELLED."""
        sm = SubmissionStateMachine(
            submission_id="sub_052",
            state=SubmissionState.NEEDS_REVIEW
        )
        sm.transition_to(SubmissionState.CANCELLED)
        assert sm.state == SubmissionState.CANCELLED

    def test_needs_review_to_expired(self):
        """Should transition from NEEDS_REVIEW to EXPIRED."""
        sm = SubmissionStateMachine(
            submission_id="sub_053",
            state=SubmissionState.NEEDS_REVIEW
        )
        sm.transition_to(SubmissionState.EXPIRED)
        assert sm.state == SubmissionState.EXPIRED


class TestValidTransitionsFromApproved:
    """Test valid transitions from APPROVED state."""

    def test_approved_to_finalized(self):
        """Should transition from APPROVED to FINALIZED."""
        sm = SubmissionStateMachine(
            submission_id="sub_060",
            state=SubmissionState.APPROVED
        )
        sm.transition_to(SubmissionState.FINALIZED)
        assert sm.state == SubmissionState.FINALIZED

    def test_approved_to_cancelled(self):
        """Should transition from APPROVED to CANCELLED."""
        sm = SubmissionStateMachine(
            submission_id="sub_061",
            state=SubmissionState.APPROVED
        )
        sm.transition_to(SubmissionState.CANCELLED)
        assert sm.state == SubmissionState.CANCELLED

    def test_approved_to_expired(self):
        """Should transition from APPROVED to EXPIRED."""
        sm = SubmissionStateMachine(
            submission_id="sub_062",
            state=SubmissionState.APPROVED
        )
        sm.transition_to(SubmissionState.EXPIRED)
        assert sm.state == SubmissionState.EXPIRED


class TestTerminalStates:
    """Test terminal states have no valid transitions."""

    def test_rejected_is_terminal(self):
        """REJECTED state should be terminal."""
        sm = SubmissionStateMachine(
            submission_id="sub_070",
            state=SubmissionState.REJECTED
        )
        assert sm.is_terminal() is True
        assert len(VALID_TRANSITIONS[SubmissionState.REJECTED]) == 0

    def test_finalized_is_terminal(self):
        """FINALIZED state should be terminal."""
        sm = SubmissionStateMachine(
            submission_id="sub_071",
            state=SubmissionState.FINALIZED
        )
        assert sm.is_terminal() is True
        assert len(VALID_TRANSITIONS[SubmissionState.FINALIZED]) == 0

    def test_cancelled_is_terminal(self):
        """CANCELLED state should be terminal."""
        sm = SubmissionStateMachine(
            submission_id="sub_072",
            state=SubmissionState.CANCELLED
        )
        assert sm.is_terminal() is True
        assert len(VALID_TRANSITIONS[SubmissionState.CANCELLED]) == 0

    def test_expired_is_terminal(self):
        """EXPIRED state should be terminal."""
        sm = SubmissionStateMachine(
            submission_id="sub_073",
            state=SubmissionState.EXPIRED
        )
        assert sm.is_terminal() is True
        assert len(VALID_TRANSITIONS[SubmissionState.EXPIRED]) == 0


class TestCanTransitionTo:
    """Test the can_transition_to helper method."""

    def test_can_transition_to_valid_state(self):
        """Should return True for valid transitions."""
        sm = SubmissionStateMachine(submission_id="sub_080")
        assert sm.can_transition_to(SubmissionState.IN_PROGRESS) is True
        assert sm.can_transition_to(SubmissionState.CANCELLED) is True
        assert sm.can_transition_to(SubmissionState.EXPIRED) is True

    def test_can_transition_to_invalid_state(self):
        """Should return False for invalid transitions."""
        sm = SubmissionStateMachine(submission_id="sub_081")
        assert sm.can_transition_to(SubmissionState.SUBMITTED) is False
        assert sm.can_transition_to(SubmissionState.FINALIZED) is False
        assert sm.can_transition_to(SubmissionState.APPROVED) is False

    def test_can_transition_from_terminal_state(self):
        """Should return False for all transitions from terminal states."""
        sm = SubmissionStateMachine(
            submission_id="sub_082",
            state=SubmissionState.FINALIZED
        )
        # Test all possible states
        for state in SubmissionState:
            assert sm.can_transition_to(state) is False


class TestSerialization:
    """Test state machine serialization and deserialization."""

    def test_to_dict_with_draft_state(self):
        """Should serialize to dict with correct keys."""
        sm = SubmissionStateMachine(submission_id="sub_090")
        data = sm.to_dict()
        assert data == {
            "submissionId": "sub_090",
            "state": "draft"
        }

    def test_to_dict_with_in_progress_state(self):
        """Should serialize IN_PROGRESS state correctly."""
        sm = SubmissionStateMachine(
            submission_id="sub_091",
            state=SubmissionState.IN_PROGRESS
        )
        data = sm.to_dict()
        assert data == {
            "submissionId": "sub_091",
            "state": "in_progress"
        }

    def test_to_dict_with_finalized_state(self):
        """Should serialize terminal state correctly."""
        sm = SubmissionStateMachine(
            submission_id="sub_092",
            state=SubmissionState.FINALIZED
        )
        data = sm.to_dict()
        assert data == {
            "submissionId": "sub_092",
            "state": "finalized"
        }

    def test_from_dict_creates_correct_instance(self):
        """Should deserialize from dict correctly."""
        data = {
            "submissionId": "sub_093",
            "state": "in_progress"
        }
        sm = SubmissionStateMachine.from_dict(data)
        assert sm.submission_id == "sub_093"
        assert sm.state == SubmissionState.IN_PROGRESS

    def test_from_dict_with_terminal_state(self):
        """Should deserialize terminal state correctly."""
        data = {
            "submissionId": "sub_094",
            "state": "finalized"
        }
        sm = SubmissionStateMachine.from_dict(data)
        assert sm.submission_id == "sub_094"
        assert sm.state == SubmissionState.FINALIZED
        assert sm.is_terminal() is True

    def test_roundtrip_serialization(self):
        """Should maintain state through serialize-deserialize cycle."""
        original = SubmissionStateMachine(
            submission_id="sub_095",
            state=SubmissionState.NEEDS_REVIEW
        )
        data = original.to_dict()
        restored = SubmissionStateMachine.from_dict(data)

        assert restored.submission_id == original.submission_id
        assert restored.state == original.state
        assert restored.is_terminal() == original.is_terminal()


class TestInvalidTransitions:
    """Test that invalid state transitions raise errors and don't change state."""

    def test_draft_to_submitted_invalid(self):
        """Should raise error when transitioning from DRAFT to SUBMITTED."""
        sm = SubmissionStateMachine(submission_id="sub_invalid_001")
        with pytest.raises(InvalidStateTransitionError) as exc_info:
            sm.transition_to(SubmissionState.SUBMITTED)

        # State should not have changed
        assert sm.state == SubmissionState.DRAFT
        # Error should contain helpful information
        assert "draft" in str(exc_info.value).lower()
        assert "submitted" in str(exc_info.value).lower()

    def test_draft_to_finalized_invalid(self):
        """Should raise error when transitioning from DRAFT to FINALIZED."""
        sm = SubmissionStateMachine(submission_id="sub_invalid_002")
        with pytest.raises(InvalidStateTransitionError) as exc_info:
            sm.transition_to(SubmissionState.FINALIZED)

        assert sm.state == SubmissionState.DRAFT
        assert exc_info.value.current_state == SubmissionState.DRAFT
        assert exc_info.value.target_state == SubmissionState.FINALIZED

    def test_draft_to_awaiting_input_invalid(self):
        """Should raise error when transitioning from DRAFT to AWAITING_INPUT."""
        sm = SubmissionStateMachine(submission_id="sub_invalid_003")
        with pytest.raises(InvalidStateTransitionError):
            sm.transition_to(SubmissionState.AWAITING_INPUT)
        assert sm.state == SubmissionState.DRAFT

    def test_in_progress_to_approved_invalid(self):
        """Should raise error when transitioning from IN_PROGRESS to APPROVED."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_010",
            state=SubmissionState.IN_PROGRESS
        )
        with pytest.raises(InvalidStateTransitionError):
            sm.transition_to(SubmissionState.APPROVED)
        assert sm.state == SubmissionState.IN_PROGRESS

    def test_in_progress_to_needs_review_invalid(self):
        """Should raise error when transitioning from IN_PROGRESS to NEEDS_REVIEW."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_011",
            state=SubmissionState.IN_PROGRESS
        )
        with pytest.raises(InvalidStateTransitionError):
            sm.transition_to(SubmissionState.NEEDS_REVIEW)
        assert sm.state == SubmissionState.IN_PROGRESS

    def test_awaiting_input_to_submitted_invalid(self):
        """Should raise error when transitioning from AWAITING_INPUT to SUBMITTED."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_020",
            state=SubmissionState.AWAITING_INPUT
        )
        with pytest.raises(InvalidStateTransitionError):
            sm.transition_to(SubmissionState.SUBMITTED)
        assert sm.state == SubmissionState.AWAITING_INPUT

    def test_awaiting_upload_to_finalized_invalid(self):
        """Should raise error when transitioning from AWAITING_UPLOAD to FINALIZED."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_030",
            state=SubmissionState.AWAITING_UPLOAD
        )
        with pytest.raises(InvalidStateTransitionError):
            sm.transition_to(SubmissionState.FINALIZED)
        assert sm.state == SubmissionState.AWAITING_UPLOAD

    def test_submitted_to_in_progress_invalid(self):
        """Should raise error when transitioning from SUBMITTED to IN_PROGRESS."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_040",
            state=SubmissionState.SUBMITTED
        )
        with pytest.raises(InvalidStateTransitionError):
            sm.transition_to(SubmissionState.IN_PROGRESS)
        assert sm.state == SubmissionState.SUBMITTED

    def test_submitted_to_approved_invalid(self):
        """Should raise error when transitioning from SUBMITTED to APPROVED."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_041",
            state=SubmissionState.SUBMITTED
        )
        with pytest.raises(InvalidStateTransitionError):
            sm.transition_to(SubmissionState.APPROVED)
        assert sm.state == SubmissionState.SUBMITTED

    def test_needs_review_to_finalized_invalid(self):
        """Should raise error when transitioning from NEEDS_REVIEW to FINALIZED."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_050",
            state=SubmissionState.NEEDS_REVIEW
        )
        with pytest.raises(InvalidStateTransitionError):
            sm.transition_to(SubmissionState.FINALIZED)
        assert sm.state == SubmissionState.NEEDS_REVIEW

    def test_needs_review_to_in_progress_invalid(self):
        """Should raise error when transitioning from NEEDS_REVIEW to IN_PROGRESS."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_051",
            state=SubmissionState.NEEDS_REVIEW
        )
        with pytest.raises(InvalidStateTransitionError):
            sm.transition_to(SubmissionState.IN_PROGRESS)
        assert sm.state == SubmissionState.NEEDS_REVIEW

    def test_approved_to_rejected_invalid(self):
        """Should raise error when transitioning from APPROVED to REJECTED."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_060",
            state=SubmissionState.APPROVED
        )
        with pytest.raises(InvalidStateTransitionError):
            sm.transition_to(SubmissionState.REJECTED)
        assert sm.state == SubmissionState.APPROVED

    def test_finalized_to_any_state_invalid(self):
        """Should raise error for any transition from FINALIZED terminal state."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_070",
            state=SubmissionState.FINALIZED
        )

        # Test transitions to all non-terminal states
        non_terminal_states = [
            SubmissionState.DRAFT,
            SubmissionState.IN_PROGRESS,
            SubmissionState.AWAITING_INPUT,
            SubmissionState.AWAITING_UPLOAD,
            SubmissionState.SUBMITTED,
            SubmissionState.NEEDS_REVIEW,
            SubmissionState.APPROVED,
        ]

        for target_state in non_terminal_states:
            with pytest.raises(InvalidStateTransitionError) as exc_info:
                sm.transition_to(target_state)
            assert sm.state == SubmissionState.FINALIZED
            assert "terminal state" in str(exc_info.value).lower()

    def test_rejected_to_any_state_invalid(self):
        """Should raise error for any transition from REJECTED terminal state."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_071",
            state=SubmissionState.REJECTED
        )

        # Try to transition to any state
        with pytest.raises(InvalidStateTransitionError) as exc_info:
            sm.transition_to(SubmissionState.IN_PROGRESS)
        assert sm.state == SubmissionState.REJECTED
        assert "terminal state" in str(exc_info.value).lower()

    def test_cancelled_to_any_state_invalid(self):
        """Should raise error for any transition from CANCELLED terminal state."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_072",
            state=SubmissionState.CANCELLED
        )

        with pytest.raises(InvalidStateTransitionError) as exc_info:
            sm.transition_to(SubmissionState.DRAFT)
        assert sm.state == SubmissionState.CANCELLED
        assert "terminal state" in str(exc_info.value).lower()

    def test_expired_to_any_state_invalid(self):
        """Should raise error for any transition from EXPIRED terminal state."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_073",
            state=SubmissionState.EXPIRED
        )

        with pytest.raises(InvalidStateTransitionError) as exc_info:
            sm.transition_to(SubmissionState.IN_PROGRESS)
        assert sm.state == SubmissionState.EXPIRED
        assert "terminal state" in str(exc_info.value).lower()

    def test_error_attributes_are_correct(self):
        """Should set correct attributes on InvalidStateTransitionError."""
        sm = SubmissionStateMachine(
            submission_id="sub_invalid_080",
            state=SubmissionState.IN_PROGRESS
        )

        try:
            sm.transition_to(SubmissionState.APPROVED)
            pytest.fail("Should have raised InvalidStateTransitionError")
        except InvalidStateTransitionError as e:
            assert e.current_state == SubmissionState.IN_PROGRESS
            assert e.target_state == SubmissionState.APPROVED
            assert "in_progress" in str(e).lower()
            assert "approved" in str(e).lower()

    def test_error_message_lists_valid_transitions(self):
        """Should list valid transitions in error message for non-terminal states."""
        sm = SubmissionStateMachine(submission_id="sub_invalid_081")

        try:
            sm.transition_to(SubmissionState.FINALIZED)
            pytest.fail("Should have raised InvalidStateTransitionError")
        except InvalidStateTransitionError as e:
            error_msg = str(e).lower()
            # Should mention the valid transitions from DRAFT
            assert "in_progress" in error_msg
            assert "cancelled" in error_msg
            assert "expired" in error_msg


class TestComplexTransitionFlows:
    """Test multi-step transition flows through the state machine."""

    def test_happy_path_without_review(self):
        """Should handle happy path: draft → in_progress → submitted → finalized."""
        sm = SubmissionStateMachine(submission_id="sub_100")

        # Start: draft
        assert sm.state == SubmissionState.DRAFT

        # Agent starts filling fields
        sm.transition_to(SubmissionState.IN_PROGRESS)
        assert sm.state == SubmissionState.IN_PROGRESS

        # Agent submits
        sm.transition_to(SubmissionState.SUBMITTED)
        assert sm.state == SubmissionState.SUBMITTED

        # System finalizes (no review needed)
        sm.transition_to(SubmissionState.FINALIZED)
        assert sm.state == SubmissionState.FINALIZED
        assert sm.is_terminal() is True

    def test_validation_failure_flow(self):
        """Should handle validation failures: in_progress → awaiting_input → in_progress."""
        sm = SubmissionStateMachine(
            submission_id="sub_101",
            state=SubmissionState.IN_PROGRESS
        )

        # Validation finds missing fields
        sm.transition_to(SubmissionState.AWAITING_INPUT)
        assert sm.state == SubmissionState.AWAITING_INPUT

        # Agent provides missing fields
        sm.transition_to(SubmissionState.IN_PROGRESS)
        assert sm.state == SubmissionState.IN_PROGRESS

    def test_file_upload_flow(self):
        """Should handle file uploads: in_progress → awaiting_upload → in_progress."""
        sm = SubmissionStateMachine(
            submission_id="sub_102",
            state=SubmissionState.IN_PROGRESS
        )

        # Files need to be uploaded
        sm.transition_to(SubmissionState.AWAITING_UPLOAD)
        assert sm.state == SubmissionState.AWAITING_UPLOAD

        # Files uploaded
        sm.transition_to(SubmissionState.IN_PROGRESS)
        assert sm.state == SubmissionState.IN_PROGRESS

    def test_approval_flow_approved(self):
        """Should handle approval flow: submitted → needs_review → approved → finalized."""
        sm = SubmissionStateMachine(
            submission_id="sub_103",
            state=SubmissionState.SUBMITTED
        )

        # Routed to human reviewer
        sm.transition_to(SubmissionState.NEEDS_REVIEW)
        assert sm.state == SubmissionState.NEEDS_REVIEW

        # Reviewer approves
        sm.transition_to(SubmissionState.APPROVED)
        assert sm.state == SubmissionState.APPROVED

        # System finalizes
        sm.transition_to(SubmissionState.FINALIZED)
        assert sm.state == SubmissionState.FINALIZED
        assert sm.is_terminal() is True

    def test_approval_flow_rejected(self):
        """Should handle rejection: submitted → needs_review → rejected."""
        sm = SubmissionStateMachine(
            submission_id="sub_104",
            state=SubmissionState.SUBMITTED
        )

        # Routed to human reviewer
        sm.transition_to(SubmissionState.NEEDS_REVIEW)
        assert sm.state == SubmissionState.NEEDS_REVIEW

        # Reviewer rejects
        sm.transition_to(SubmissionState.REJECTED)
        assert sm.state == SubmissionState.REJECTED
        assert sm.is_terminal() is True

    def test_cancellation_from_any_non_terminal_state(self):
        """Should allow cancellation from any non-terminal state."""
        states_to_test = [
            SubmissionState.DRAFT,
            SubmissionState.IN_PROGRESS,
            SubmissionState.AWAITING_INPUT,
            SubmissionState.AWAITING_UPLOAD,
            SubmissionState.SUBMITTED,
            SubmissionState.NEEDS_REVIEW,
            SubmissionState.APPROVED,
        ]

        for idx, state in enumerate(states_to_test):
            sm = SubmissionStateMachine(
                submission_id=f"sub_cancel_{idx}",
                state=state
            )
            sm.transition_to(SubmissionState.CANCELLED)
            assert sm.state == SubmissionState.CANCELLED
            assert sm.is_terminal() is True

    def test_expiration_from_any_non_terminal_state(self):
        """Should allow expiration from any non-terminal state."""
        states_to_test = [
            SubmissionState.DRAFT,
            SubmissionState.IN_PROGRESS,
            SubmissionState.AWAITING_INPUT,
            SubmissionState.AWAITING_UPLOAD,
            SubmissionState.SUBMITTED,
            SubmissionState.NEEDS_REVIEW,
            SubmissionState.APPROVED,
        ]

        for idx, state in enumerate(states_to_test):
            sm = SubmissionStateMachine(
                submission_id=f"sub_expire_{idx}",
                state=state
            )
            sm.transition_to(SubmissionState.EXPIRED)
            assert sm.state == SubmissionState.EXPIRED
            assert sm.is_terminal() is True

    def test_complex_mixed_mode_flow(self):
        """Should handle complex mixed-mode flow with validation and files."""
        sm = SubmissionStateMachine(submission_id="sub_105")

        # Agent starts
        sm.transition_to(SubmissionState.IN_PROGRESS)

        # Validation finds missing fields
        sm.transition_to(SubmissionState.AWAITING_INPUT)

        # Agent provides fields
        sm.transition_to(SubmissionState.IN_PROGRESS)

        # Files need upload
        sm.transition_to(SubmissionState.AWAITING_UPLOAD)

        # Files uploaded
        sm.transition_to(SubmissionState.IN_PROGRESS)

        # Agent submits
        sm.transition_to(SubmissionState.SUBMITTED)

        # Needs human review
        sm.transition_to(SubmissionState.NEEDS_REVIEW)

        # Human approves
        sm.transition_to(SubmissionState.APPROVED)

        # System finalizes
        sm.transition_to(SubmissionState.FINALIZED)

        assert sm.state == SubmissionState.FINALIZED
        assert sm.is_terminal() is True
