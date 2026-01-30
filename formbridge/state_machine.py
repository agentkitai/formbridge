"""Submission state machine for the FormBridge Intake Contract.

This module implements the core state machine that enforces valid state transitions
for intake submissions. The state machine follows the lifecycle defined in
INTAKE_CONTRACT_SPEC.md §2 (Submission Lifecycle).

The state machine:
- Enforces valid transitions between states
- Tracks current submission state
- Emits typed events for all state transitions
- Provides serialization/deserialization for storage
- Maintains an audit trail of all state changes

Usage:
    >>> from formbridge.state_machine import SubmissionStateMachine
    >>> from formbridge.types import SubmissionState, Actor, ActorKind
    >>> sm = SubmissionStateMachine(submission_id="sub_123")
    >>> sm.state
    <SubmissionState.DRAFT: 'draft'>
    >>> actor = Actor(kind=ActorKind.AGENT, id="bot_1")
    >>> sm.transition_to(SubmissionState.IN_PROGRESS, actor)
    >>> sm.state
    <SubmissionState.IN_PROGRESS: 'in_progress'>
    >>> len(sm.get_events())
    1
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Set
import uuid

from formbridge.events import IntakeEvent
from formbridge.types import Actor, ActorKind, EventType, SubmissionState


class InvalidStateTransitionError(Exception):
    """Raised when attempting an invalid state transition.

    This error is raised when trying to transition from one state to another
    in a way that violates the state machine's transition rules.

    Attributes:
        current_state: The current state before the attempted transition
        target_state: The target state that was attempted
        message: Human-readable error message
    """

    def __init__(self, current_state: SubmissionState, target_state: SubmissionState, message: str):
        self.current_state = current_state
        self.target_state = target_state
        super().__init__(message)


# Map target states to their corresponding event types
# Used for emitting appropriate events on state transitions
STATE_TO_EVENT_TYPE: Dict[SubmissionState, EventType] = {
    SubmissionState.DRAFT: EventType.SUBMISSION_CREATED,
    SubmissionState.SUBMITTED: EventType.SUBMISSION_SUBMITTED,
    SubmissionState.NEEDS_REVIEW: EventType.REVIEW_REQUESTED,
    SubmissionState.APPROVED: EventType.REVIEW_APPROVED,
    SubmissionState.REJECTED: EventType.REVIEW_REJECTED,
    SubmissionState.FINALIZED: EventType.SUBMISSION_FINALIZED,
    SubmissionState.CANCELLED: EventType.SUBMISSION_CANCELLED,
    SubmissionState.EXPIRED: EventType.SUBMISSION_EXPIRED,
}


# Valid state transitions as defined in INTAKE_CONTRACT_SPEC.md §2.3
# Maps each state to the set of states it can transition to
VALID_TRANSITIONS: Dict[SubmissionState, Set[SubmissionState]] = {
    SubmissionState.DRAFT: {
        SubmissionState.IN_PROGRESS,
        SubmissionState.CANCELLED,
        SubmissionState.EXPIRED,
    },
    SubmissionState.IN_PROGRESS: {
        SubmissionState.AWAITING_INPUT,
        SubmissionState.AWAITING_UPLOAD,
        SubmissionState.SUBMITTED,
        SubmissionState.CANCELLED,
        SubmissionState.EXPIRED,
    },
    SubmissionState.AWAITING_INPUT: {
        SubmissionState.IN_PROGRESS,
        SubmissionState.CANCELLED,
        SubmissionState.EXPIRED,
    },
    SubmissionState.AWAITING_UPLOAD: {
        SubmissionState.IN_PROGRESS,
        SubmissionState.CANCELLED,
        SubmissionState.EXPIRED,
    },
    SubmissionState.SUBMITTED: {
        SubmissionState.NEEDS_REVIEW,
        SubmissionState.FINALIZED,
        SubmissionState.REJECTED,
        SubmissionState.CANCELLED,
        SubmissionState.EXPIRED,
    },
    SubmissionState.NEEDS_REVIEW: {
        SubmissionState.APPROVED,
        SubmissionState.REJECTED,
        SubmissionState.CANCELLED,
        SubmissionState.EXPIRED,
    },
    SubmissionState.APPROVED: {
        SubmissionState.FINALIZED,
        SubmissionState.CANCELLED,
        SubmissionState.EXPIRED,
    },
    # Terminal states - no transitions allowed
    SubmissionState.REJECTED: set(),
    SubmissionState.FINALIZED: set(),
    SubmissionState.CANCELLED: set(),
    SubmissionState.EXPIRED: set(),
}


@dataclass
class SubmissionStateMachine:
    """Core state machine for submission lifecycle management.

    Enforces valid state transitions according to the Intake Contract specification.
    Each submission has its own state machine instance that tracks its current state
    and ensures only valid transitions are performed.

    Attributes:
        submission_id: Unique identifier for this submission
        state: Current state of the submission

    Examples:
        >>> sm = SubmissionStateMachine(submission_id="sub_123")
        >>> sm.state
        <SubmissionState.DRAFT: 'draft'>
        >>> sm.transition_to(SubmissionState.IN_PROGRESS)
        >>> sm.state
        <SubmissionState.IN_PROGRESS: 'in_progress'>
        >>> sm.can_transition_to(SubmissionState.SUBMITTED)
        True
        >>> sm.can_transition_to(SubmissionState.FINALIZED)
        False
    """

    submission_id: str
    state: SubmissionState = SubmissionState.DRAFT
    _events: List[IntakeEvent] = field(default_factory=list, init=False, repr=False)

    def can_transition_to(self, target_state: SubmissionState) -> bool:
        """Check if transition to target state is valid.

        Args:
            target_state: The state to potentially transition to

        Returns:
            True if the transition is valid, False otherwise
        """
        valid_targets = VALID_TRANSITIONS.get(self.state, set())
        return target_state in valid_targets

    def transition_to(self, target_state: SubmissionState, actor: Actor) -> None:
        """Transition to a new state and emit a state transition event.

        This method enforces the state machine's transition rules. If the transition
        is invalid, it raises an InvalidStateTransitionError. On successful transition,
        an appropriate event is emitted to the event stream.

        Args:
            target_state: The state to transition to
            actor: The actor performing this transition

        Raises:
            InvalidStateTransitionError: If the transition is not allowed

        Examples:
            >>> from formbridge.types import Actor, ActorKind
            >>> sm = SubmissionStateMachine(submission_id="sub_123")
            >>> actor = Actor(kind=ActorKind.AGENT, id="bot_1")
            >>> sm.transition_to(SubmissionState.IN_PROGRESS, actor)
            >>> sm.state
            <SubmissionState.IN_PROGRESS: 'in_progress'>
            >>> len(sm.get_events())
            1
        """
        if not self.can_transition_to(target_state):
            raise InvalidStateTransitionError(
                current_state=self.state,
                target_state=target_state,
                message=(
                    f"Invalid state transition: cannot transition from "
                    f"'{self.state.value}' to '{target_state.value}'. "
                    f"Valid transitions from '{self.state.value}' are: "
                    f"{', '.join(sorted(s.value for s in VALID_TRANSITIONS[self.state]))}"
                    if VALID_TRANSITIONS[self.state]
                    else f"Invalid state transition: '{self.state.value}' is a terminal state, "
                    f"no transitions are allowed."
                ),
            )

        # Perform state transition
        old_state = self.state
        self.state = target_state

        # Emit state transition event
        self._emit_event(target_state, actor, old_state)

    def is_terminal(self) -> bool:
        """Check if the current state is terminal.

        Terminal states are states from which no further transitions are possible:
        - finalized
        - cancelled
        - expired
        - rejected

        Returns:
            True if the current state is terminal, False otherwise
        """
        return len(VALID_TRANSITIONS[self.state]) == 0

    def _emit_event(
        self,
        new_state: SubmissionState,
        actor: Actor,
        old_state: SubmissionState
    ) -> None:
        """Emit an event for a state transition.

        Args:
            new_state: The state being transitioned to
            actor: The actor performing the transition
            old_state: The previous state before transition
        """
        # Determine event type based on target state
        event_type = STATE_TO_EVENT_TYPE.get(
            new_state,
            EventType.FIELD_UPDATED  # Default fallback for intermediate states
        )

        # Generate unique event ID
        event_id = f"evt_{uuid.uuid4().hex[:16]}"

        # Create and store the event
        event = IntakeEvent(
            event_id=event_id,
            type=event_type,
            submission_id=self.submission_id,
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=new_state,
            payload={"from_state": old_state.value, "to_state": new_state.value}
        )

        self._events.append(event)

    def get_events(self) -> List[IntakeEvent]:
        """Get all events emitted by this state machine.

        Returns:
            List of IntakeEvent objects in chronological order

        Examples:
            >>> from formbridge.types import Actor, ActorKind
            >>> sm = SubmissionStateMachine(submission_id="sub_123")
            >>> actor = Actor(kind=ActorKind.AGENT, id="bot_1")
            >>> sm.transition_to(SubmissionState.IN_PROGRESS, actor)
            >>> events = sm.get_events()
            >>> len(events)
            1
            >>> events[0].type
            <EventType.FIELD_UPDATED: 'field.updated'>
        """
        return list(self._events)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the state machine to a dictionary.

        Returns:
            Dictionary representation suitable for JSON serialization

        Examples:
            >>> sm = SubmissionStateMachine(submission_id="sub_123", state=SubmissionState.IN_PROGRESS)
            >>> sm.to_dict()
            {'submissionId': 'sub_123', 'state': 'in_progress'}
        """
        return {
            "submissionId": self.submission_id,
            "state": self.state.value if isinstance(self.state, SubmissionState) else self.state,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SubmissionStateMachine":
        """Deserialize a state machine from a dictionary.

        Args:
            data: Dictionary containing submissionId and state

        Returns:
            New SubmissionStateMachine instance

        Examples:
            >>> data = {'submissionId': 'sub_123', 'state': 'in_progress'}
            >>> sm = SubmissionStateMachine.from_dict(data)
            >>> sm.submission_id
            'sub_123'
            >>> sm.state
            <SubmissionState.IN_PROGRESS: 'in_progress'>
        """
        state = data["state"]
        if isinstance(state, str):
            state = SubmissionState(state)

        return cls(
            submission_id=data["submissionId"],
            state=state,
        )


__all__ = [
    "SubmissionStateMachine",
    "InvalidStateTransitionError",
    "VALID_TRANSITIONS",
]
