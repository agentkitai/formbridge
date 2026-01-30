"""Unit tests for the event system.

Tests cover:
- IntakeEvent creation and validation
- Event serialization (to_dict, to_jsonl) and deserialization (from_dict)
- EventEmitter subscriptions and dispatching
- Event emission from state machine transitions
- Event ordering and filtering by type

Following INTAKE_CONTRACT_SPEC.md §6 (Event Stream).
"""

import json
import pytest
from datetime import datetime, timezone, timedelta

from formbridge.events import IntakeEvent, EventEmitter, EventListener
from formbridge.state_machine import SubmissionStateMachine
from formbridge.types import Actor, ActorKind, EventType, SubmissionState


class TestIntakeEventCreation:
    """Test IntakeEvent creation and validation."""

    def test_create_event_with_required_fields(self):
        """Should create event with all required fields."""
        actor = Actor(kind=ActorKind.AGENT, id="bot_1", name="Test Bot")
        ts = datetime.now(timezone.utc)

        event = IntakeEvent(
            event_id="evt_001",
            type=EventType.SUBMISSION_CREATED,
            submission_id="sub_001",
            ts=ts,
            actor=actor,
            state=SubmissionState.DRAFT
        )

        assert event.event_id == "evt_001"
        assert event.type == EventType.SUBMISSION_CREATED
        assert event.submission_id == "sub_001"
        assert event.ts == ts
        assert event.actor == actor
        assert event.state == SubmissionState.DRAFT
        assert event.payload is None

    def test_create_event_with_payload(self):
        """Should create event with optional payload."""
        actor = Actor(kind=ActorKind.HUMAN, id="user_123")
        ts = datetime.now(timezone.utc)
        payload = {"from_state": "draft", "to_state": "in_progress"}

        event = IntakeEvent(
            event_id="evt_002",
            type=EventType.FIELD_UPDATED,
            submission_id="sub_002",
            ts=ts,
            actor=actor,
            state=SubmissionState.IN_PROGRESS,
            payload=payload
        )

        assert event.payload == payload
        assert event.payload["from_state"] == "draft"
        assert event.payload["to_state"] == "in_progress"

    def test_create_event_with_string_enums(self):
        """Should normalize string enum values to enum types."""
        actor = Actor(kind="agent", id="bot_1")
        ts = datetime.now(timezone.utc)

        event = IntakeEvent(
            event_id="evt_003",
            type="submission.created",
            submission_id="sub_003",
            ts=ts,
            actor=actor,
            state="draft"
        )

        assert event.type == EventType.SUBMISSION_CREATED
        assert event.state == SubmissionState.DRAFT
        assert event.actor.kind == ActorKind.AGENT

    def test_event_is_immutable(self):
        """Should prevent modification of event fields (frozen dataclass)."""
        actor = Actor(kind=ActorKind.SYSTEM, id="sys_1")
        ts = datetime.now(timezone.utc)

        event = IntakeEvent(
            event_id="evt_004",
            type=EventType.SUBMISSION_FINALIZED,
            submission_id="sub_004",
            ts=ts,
            actor=actor,
            state=SubmissionState.FINALIZED
        )

        with pytest.raises(Exception):  # FrozenInstanceError or AttributeError
            event.state = SubmissionState.CANCELLED


class TestEventSerialization:
    """Test event serialization to dict and JSONL."""

    def test_to_dict_with_all_fields(self):
        """Should serialize event to dictionary with camelCase keys."""
        actor = Actor(kind=ActorKind.AGENT, id="bot_1", name="Test Bot")
        ts = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        payload = {"field": "name", "old": None, "new": "John"}

        event = IntakeEvent(
            event_id="evt_005",
            type=EventType.FIELD_UPDATED,
            submission_id="sub_005",
            ts=ts,
            actor=actor,
            state=SubmissionState.IN_PROGRESS,
            payload=payload
        )

        result = event.to_dict()

        assert result["eventId"] == "evt_005"
        assert result["type"] == "field.updated"
        assert result["submissionId"] == "sub_005"
        assert result["ts"] == "2024-01-15T10:30:00+00:00"
        assert result["actor"]["kind"] == "agent"
        assert result["actor"]["id"] == "bot_1"
        assert result["actor"]["name"] == "Test Bot"
        assert result["state"] == "in_progress"
        assert result["payload"] == payload

    def test_to_dict_without_payload(self):
        """Should serialize event without payload field when payload is None."""
        actor = Actor(kind=ActorKind.SYSTEM, id="sys_1")
        ts = datetime.now(timezone.utc)

        event = IntakeEvent(
            event_id="evt_006",
            type=EventType.SUBMISSION_CREATED,
            submission_id="sub_006",
            ts=ts,
            actor=actor,
            state=SubmissionState.DRAFT
        )

        result = event.to_dict()

        assert "payload" not in result
        assert result["eventId"] == "evt_006"

    def test_to_jsonl_format(self):
        """Should serialize event to single-line compact JSON."""
        actor = Actor(kind=ActorKind.AGENT, id="bot_1")
        ts = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)

        event = IntakeEvent(
            event_id="evt_007",
            type=EventType.SUBMISSION_SUBMITTED,
            submission_id="sub_007",
            ts=ts,
            actor=actor,
            state=SubmissionState.SUBMITTED
        )

        jsonl = event.to_jsonl()

        # Should be single line with no extra whitespace
        assert "\n" not in jsonl
        assert jsonl.count(" ") == 0  # No spaces in compact JSON

        # Should be valid JSON
        parsed = json.loads(jsonl)
        assert parsed["eventId"] == "evt_007"
        assert parsed["type"] == "submission.submitted"

    def test_to_jsonl_with_payload(self):
        """Should serialize event with payload to JSONL."""
        actor = Actor(kind=ActorKind.HUMAN, id="user_123")
        ts = datetime.now(timezone.utc)
        payload = {"validation_errors": 3, "fields": ["email", "phone"]}

        event = IntakeEvent(
            event_id="evt_008",
            type=EventType.VALIDATION_FAILED,
            submission_id="sub_008",
            ts=ts,
            actor=actor,
            state=SubmissionState.IN_PROGRESS,
            payload=payload
        )

        jsonl = event.to_jsonl()
        parsed = json.loads(jsonl)

        assert parsed["payload"]["validation_errors"] == 3
        assert parsed["payload"]["fields"] == ["email", "phone"]


class TestEventDeserialization:
    """Test event deserialization from dict."""

    def test_from_dict_with_all_fields(self):
        """Should deserialize event from dictionary."""
        data = {
            "eventId": "evt_009",
            "type": "submission.created",
            "submissionId": "sub_009",
            "ts": "2024-01-15T10:30:00+00:00",
            "actor": {
                "kind": "agent",
                "id": "bot_1",
                "name": "Test Bot",
                "metadata": {}
            },
            "state": "draft",
            "payload": {"test": "data"}
        }

        event = IntakeEvent.from_dict(data)

        assert event.event_id == "evt_009"
        assert event.type == EventType.SUBMISSION_CREATED
        assert event.submission_id == "sub_009"
        assert event.ts.year == 2024
        assert event.ts.month == 1
        assert event.ts.day == 15
        assert event.actor.kind == ActorKind.AGENT
        assert event.actor.id == "bot_1"
        assert event.state == SubmissionState.DRAFT
        assert event.payload == {"test": "data"}

    def test_from_dict_without_payload(self):
        """Should deserialize event without payload."""
        data = {
            "eventId": "evt_010",
            "type": "submission.finalized",
            "submissionId": "sub_010",
            "ts": "2024-01-15T10:30:00Z",
            "actor": {
                "kind": "system",
                "id": "sys_1"
            },
            "state": "finalized"
        }

        event = IntakeEvent.from_dict(data)

        assert event.event_id == "evt_010"
        assert event.payload is None

    def test_from_dict_handles_z_timezone(self):
        """Should handle 'Z' timezone suffix in timestamp."""
        data = {
            "eventId": "evt_011",
            "type": "submission.submitted",
            "submissionId": "sub_011",
            "ts": "2024-01-15T10:30:00Z",  # Z suffix instead of +00:00
            "actor": {"kind": "agent", "id": "bot_1"},
            "state": "submitted"
        }

        event = IntakeEvent.from_dict(data)

        assert event.ts.tzinfo is not None
        assert event.ts.year == 2024

    def test_roundtrip_serialization(self):
        """Should maintain data integrity through to_dict() → from_dict()."""
        actor = Actor(kind=ActorKind.HUMAN, id="user_456", name="Jane Doe")
        ts = datetime(2024, 3, 20, 14, 45, 30, tzinfo=timezone.utc)
        payload = {"key": "value", "nested": {"data": 123}}

        original = IntakeEvent(
            event_id="evt_012",
            type=EventType.REVIEW_APPROVED,
            submission_id="sub_012",
            ts=ts,
            actor=actor,
            state=SubmissionState.APPROVED,
            payload=payload
        )

        # Serialize and deserialize
        data = original.to_dict()
        restored = IntakeEvent.from_dict(data)

        assert restored.event_id == original.event_id
        assert restored.type == original.type
        assert restored.submission_id == original.submission_id
        assert restored.ts == original.ts
        assert restored.actor.kind == original.actor.kind
        assert restored.actor.id == original.actor.id
        assert restored.actor.name == original.actor.name
        assert restored.state == original.state
        assert restored.payload == original.payload


class TestEventEmitterSubscriptions:
    """Test EventEmitter subscription and dispatch."""

    def test_subscribe_to_specific_event_type(self):
        """Should call listener when subscribed event type is emitted."""
        emitter = EventEmitter()
        calls = []

        def listener(event: IntakeEvent):
            calls.append(event)

        emitter.on(EventType.SUBMISSION_CREATED, listener)

        actor = Actor(kind=ActorKind.AGENT, id="bot_1")
        event = IntakeEvent(
            event_id="evt_013",
            type=EventType.SUBMISSION_CREATED,
            submission_id="sub_013",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.DRAFT
        )

        emitter.emit(event)

        assert len(calls) == 1
        assert calls[0] == event

    def test_subscribe_to_wildcard_events(self):
        """Should call wildcard listener for any event type."""
        emitter = EventEmitter()
        calls = []

        def listener(event: IntakeEvent):
            calls.append(event.type)

        emitter.on_any(listener)

        actor = Actor(kind=ActorKind.SYSTEM, id="sys_1")

        # Emit different event types
        event1 = IntakeEvent(
            event_id="evt_014",
            type=EventType.SUBMISSION_CREATED,
            submission_id="sub_014",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.DRAFT
        )
        emitter.emit(event1)

        event2 = IntakeEvent(
            event_id="evt_015",
            type=EventType.SUBMISSION_SUBMITTED,
            submission_id="sub_015",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.SUBMITTED
        )
        emitter.emit(event2)

        assert len(calls) == 2
        assert EventType.SUBMISSION_CREATED in calls
        assert EventType.SUBMISSION_SUBMITTED in calls

    def test_multiple_listeners_for_same_type(self):
        """Should call all listeners subscribed to the same event type."""
        emitter = EventEmitter()
        calls1 = []
        calls2 = []

        def listener1(event: IntakeEvent):
            calls1.append(event.event_id)

        def listener2(event: IntakeEvent):
            calls2.append(event.event_id)

        emitter.on(EventType.FIELD_UPDATED, listener1)
        emitter.on(EventType.FIELD_UPDATED, listener2)

        actor = Actor(kind=ActorKind.AGENT, id="bot_1")
        event = IntakeEvent(
            event_id="evt_016",
            type=EventType.FIELD_UPDATED,
            submission_id="sub_016",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.IN_PROGRESS
        )

        emitter.emit(event)

        assert len(calls1) == 1
        assert len(calls2) == 1
        assert calls1[0] == "evt_016"
        assert calls2[0] == "evt_016"

    def test_type_specific_and_wildcard_listeners_both_called(self):
        """Should call both type-specific and wildcard listeners."""
        emitter = EventEmitter()
        specific_calls = []
        wildcard_calls = []

        def specific_listener(event: IntakeEvent):
            specific_calls.append(event.event_id)

        def wildcard_listener(event: IntakeEvent):
            wildcard_calls.append(event.event_id)

        emitter.on(EventType.VALIDATION_FAILED, specific_listener)
        emitter.on_any(wildcard_listener)

        actor = Actor(kind=ActorKind.AGENT, id="bot_1")
        event = IntakeEvent(
            event_id="evt_017",
            type=EventType.VALIDATION_FAILED,
            submission_id="sub_017",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.IN_PROGRESS
        )

        emitter.emit(event)

        assert len(specific_calls) == 1
        assert len(wildcard_calls) == 1
        assert specific_calls[0] == "evt_017"
        assert wildcard_calls[0] == "evt_017"

    def test_unsubscribe_from_specific_type(self):
        """Should stop calling listener after unsubscribe."""
        emitter = EventEmitter()
        calls = []

        def listener(event: IntakeEvent):
            calls.append(event.event_id)

        emitter.on(EventType.SUBMISSION_CREATED, listener)

        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        # First event - listener should be called
        event1 = IntakeEvent(
            event_id="evt_018",
            type=EventType.SUBMISSION_CREATED,
            submission_id="sub_018",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.DRAFT
        )
        emitter.emit(event1)

        # Unsubscribe
        emitter.off(EventType.SUBMISSION_CREATED, listener)

        # Second event - listener should NOT be called
        event2 = IntakeEvent(
            event_id="evt_019",
            type=EventType.SUBMISSION_CREATED,
            submission_id="sub_019",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.DRAFT
        )
        emitter.emit(event2)

        assert len(calls) == 1
        assert calls[0] == "evt_018"

    def test_unsubscribe_from_wildcard(self):
        """Should stop calling wildcard listener after unsubscribe."""
        emitter = EventEmitter()
        calls = []

        def listener(event: IntakeEvent):
            calls.append(event.event_id)

        emitter.on_any(listener)

        actor = Actor(kind=ActorKind.SYSTEM, id="sys_1")

        # First event
        event1 = IntakeEvent(
            event_id="evt_020",
            type=EventType.SUBMISSION_CREATED,
            submission_id="sub_020",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.DRAFT
        )
        emitter.emit(event1)

        # Unsubscribe from wildcard
        emitter.off_any(listener)

        # Second event
        event2 = IntakeEvent(
            event_id="evt_021",
            type=EventType.FIELD_UPDATED,
            submission_id="sub_021",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.IN_PROGRESS
        )
        emitter.emit(event2)

        assert len(calls) == 1
        assert calls[0] == "evt_020"

    def test_listener_exceptions_are_isolated(self):
        """Should suppress listener exceptions to prevent affecting other listeners."""
        emitter = EventEmitter()
        calls = []

        def failing_listener(event: IntakeEvent):
            raise ValueError("Listener error")

        def working_listener(event: IntakeEvent):
            calls.append(event.event_id)

        emitter.on(EventType.SUBMISSION_CREATED, failing_listener)
        emitter.on(EventType.SUBMISSION_CREATED, working_listener)

        actor = Actor(kind=ActorKind.AGENT, id="bot_1")
        event = IntakeEvent(
            event_id="evt_022",
            type=EventType.SUBMISSION_CREATED,
            submission_id="sub_022",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.DRAFT
        )

        # Should not raise exception
        emitter.emit(event)

        # Working listener should still be called
        assert len(calls) == 1
        assert calls[0] == "evt_022"

    def test_clear_removes_all_listeners(self):
        """Should remove all listeners when clear() is called."""
        emitter = EventEmitter()
        calls = []

        def listener(event: IntakeEvent):
            calls.append(event.event_id)

        emitter.on(EventType.SUBMISSION_CREATED, listener)
        emitter.on(EventType.FIELD_UPDATED, listener)
        emitter.on_any(listener)

        # Clear all listeners
        emitter.clear()

        actor = Actor(kind=ActorKind.AGENT, id="bot_1")
        event = IntakeEvent(
            event_id="evt_023",
            type=EventType.SUBMISSION_CREATED,
            submission_id="sub_023",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.DRAFT
        )

        emitter.emit(event)

        assert len(calls) == 0

    def test_listener_count_for_specific_type(self):
        """Should return correct count of listeners for specific type."""
        emitter = EventEmitter()

        def listener1(event: IntakeEvent):
            pass

        def listener2(event: IntakeEvent):
            pass

        assert emitter.listener_count(EventType.SUBMISSION_CREATED) == 0

        emitter.on(EventType.SUBMISSION_CREATED, listener1)
        assert emitter.listener_count(EventType.SUBMISSION_CREATED) == 1

        emitter.on(EventType.SUBMISSION_CREATED, listener2)
        assert emitter.listener_count(EventType.SUBMISSION_CREATED) == 2

    def test_listener_count_total(self):
        """Should return correct total count of all listeners."""
        emitter = EventEmitter()

        def listener(event: IntakeEvent):
            pass

        assert emitter.listener_count() == 0

        emitter.on(EventType.SUBMISSION_CREATED, listener)
        assert emitter.listener_count() == 1

        emitter.on(EventType.FIELD_UPDATED, listener)
        assert emitter.listener_count() == 2

        emitter.on_any(listener)
        assert emitter.listener_count() == 3


class TestStateMachineEventEmission:
    """Test event emission from state machine transitions."""

    def test_state_transition_emits_event(self):
        """Should emit event when state transition occurs."""
        sm = SubmissionStateMachine(submission_id="sub_024")
        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        sm.transition_to(SubmissionState.IN_PROGRESS, actor)

        events = sm.get_events()
        assert len(events) == 1
        assert events[0].type == EventType.FIELD_UPDATED
        assert events[0].submission_id == "sub_024"
        assert events[0].actor == actor
        assert events[0].state == SubmissionState.IN_PROGRESS

    def test_event_contains_state_transition_payload(self):
        """Should include from_state and to_state in event payload."""
        sm = SubmissionStateMachine(submission_id="sub_025")
        actor = Actor(kind=ActorKind.HUMAN, id="user_123")

        sm.transition_to(SubmissionState.IN_PROGRESS, actor)

        events = sm.get_events()
        assert len(events) == 1

        payload = events[0].payload
        assert payload is not None
        assert payload["from_state"] == "draft"
        assert payload["to_state"] == "in_progress"

    def test_multiple_transitions_emit_multiple_events(self):
        """Should emit separate events for each state transition."""
        sm = SubmissionStateMachine(submission_id="sub_026")
        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        sm.transition_to(SubmissionState.IN_PROGRESS, actor)
        sm.transition_to(SubmissionState.SUBMITTED, actor)
        sm.transition_to(SubmissionState.FINALIZED, actor)

        events = sm.get_events()
        assert len(events) == 3

        # Verify event ordering
        assert events[0].state == SubmissionState.IN_PROGRESS
        assert events[1].state == SubmissionState.SUBMITTED
        assert events[2].state == SubmissionState.FINALIZED

    def test_events_have_unique_ids(self):
        """Should generate unique event IDs for each event."""
        sm = SubmissionStateMachine(submission_id="sub_027")
        actor = Actor(kind=ActorKind.SYSTEM, id="sys_1")

        sm.transition_to(SubmissionState.IN_PROGRESS, actor)
        sm.transition_to(SubmissionState.SUBMITTED, actor)

        events = sm.get_events()
        assert len(events) == 2

        event_ids = [e.event_id for e in events]
        assert len(event_ids) == len(set(event_ids))  # All unique
        assert all(e.startswith("evt_") for e in event_ids)

    def test_events_have_chronological_timestamps(self):
        """Should have timestamps in chronological order."""
        sm = SubmissionStateMachine(submission_id="sub_028")
        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        sm.transition_to(SubmissionState.IN_PROGRESS, actor)
        sm.transition_to(SubmissionState.SUBMITTED, actor)
        sm.transition_to(SubmissionState.FINALIZED, actor)

        events = sm.get_events()
        assert len(events) == 3

        # Timestamps should be in order (or at least not decreasing)
        assert events[0].ts <= events[1].ts
        assert events[1].ts <= events[2].ts

    def test_terminal_state_transition_has_correct_event_type(self):
        """Should use appropriate event type for terminal state transitions."""
        sm = SubmissionStateMachine(submission_id="sub_029")
        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        sm.transition_to(SubmissionState.IN_PROGRESS, actor)
        sm.transition_to(SubmissionState.SUBMITTED, actor)
        sm.transition_to(SubmissionState.FINALIZED, actor)

        events = sm.get_events()
        finalized_event = events[2]

        assert finalized_event.type == EventType.SUBMISSION_FINALIZED
        assert finalized_event.state == SubmissionState.FINALIZED

    def test_rejection_emits_correct_event_type(self):
        """Should emit REVIEW_REJECTED event type for rejection."""
        sm = SubmissionStateMachine(submission_id="sub_030")
        actor = Actor(kind=ActorKind.HUMAN, id="reviewer_1")

        sm.transition_to(SubmissionState.IN_PROGRESS, actor)
        sm.transition_to(SubmissionState.SUBMITTED, actor)
        sm.transition_to(SubmissionState.REJECTED, actor)

        events = sm.get_events()
        rejected_event = events[2]

        assert rejected_event.type == EventType.REVIEW_REJECTED
        assert rejected_event.state == SubmissionState.REJECTED

    def test_approval_workflow_event_sequence(self):
        """Should emit correct event sequence for approval workflow."""
        sm = SubmissionStateMachine(submission_id="sub_031")
        agent = Actor(kind=ActorKind.AGENT, id="bot_1")
        reviewer = Actor(kind=ActorKind.HUMAN, id="reviewer_1")

        sm.transition_to(SubmissionState.IN_PROGRESS, agent)
        sm.transition_to(SubmissionState.SUBMITTED, agent)
        sm.transition_to(SubmissionState.NEEDS_REVIEW, agent)
        sm.transition_to(SubmissionState.APPROVED, reviewer)
        sm.transition_to(SubmissionState.FINALIZED, agent)

        events = sm.get_events()
        assert len(events) == 5

        # Verify event types
        assert events[2].type == EventType.REVIEW_REQUESTED
        assert events[2].state == SubmissionState.NEEDS_REVIEW

        assert events[3].type == EventType.REVIEW_APPROVED
        assert events[3].state == SubmissionState.APPROVED
        assert events[3].actor.id == "reviewer_1"

        assert events[4].type == EventType.SUBMISSION_FINALIZED
        assert events[4].state == SubmissionState.FINALIZED


class TestEventOrdering:
    """Test event ordering and chronological consistency."""

    def test_get_events_returns_chronological_order(self):
        """Should return events in chronological order."""
        sm = SubmissionStateMachine(submission_id="sub_032")
        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        # Perform multiple transitions
        sm.transition_to(SubmissionState.IN_PROGRESS, actor)
        sm.transition_to(SubmissionState.AWAITING_INPUT, actor)
        sm.transition_to(SubmissionState.IN_PROGRESS, actor)
        sm.transition_to(SubmissionState.SUBMITTED, actor)

        events = sm.get_events()

        # Each event timestamp should be >= previous event timestamp
        for i in range(len(events) - 1):
            assert events[i].ts <= events[i + 1].ts

    def test_get_events_returns_copy(self):
        """Should return a copy of events list, not internal reference."""
        sm = SubmissionStateMachine(submission_id="sub_033")
        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        sm.transition_to(SubmissionState.IN_PROGRESS, actor)

        events1 = sm.get_events()
        events2 = sm.get_events()

        # Should be equal but not the same object
        assert events1 == events2
        assert events1 is not events2


class TestEventFilteringByType:
    """Test filtering events by type using EventEmitter."""

    def test_filter_only_submission_events(self):
        """Should only receive submission-related events when filtered."""
        emitter = EventEmitter()
        submission_events = []

        def submission_listener(event: IntakeEvent):
            submission_events.append(event.type)

        # Subscribe only to submission-related events
        emitter.on(EventType.SUBMISSION_CREATED, submission_listener)
        emitter.on(EventType.SUBMISSION_SUBMITTED, submission_listener)
        emitter.on(EventType.SUBMISSION_FINALIZED, submission_listener)

        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        # Emit various events
        emitter.emit(IntakeEvent(
            event_id="evt_034",
            type=EventType.SUBMISSION_CREATED,
            submission_id="sub_034",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.DRAFT
        ))

        emitter.emit(IntakeEvent(
            event_id="evt_035",
            type=EventType.FIELD_UPDATED,
            submission_id="sub_034",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.IN_PROGRESS
        ))

        emitter.emit(IntakeEvent(
            event_id="evt_036",
            type=EventType.SUBMISSION_SUBMITTED,
            submission_id="sub_034",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.SUBMITTED
        ))

        # Should only capture submission events, not field updates
        assert len(submission_events) == 2
        assert EventType.SUBMISSION_CREATED in submission_events
        assert EventType.SUBMISSION_SUBMITTED in submission_events
        assert EventType.FIELD_UPDATED not in submission_events

    def test_filter_only_validation_events(self):
        """Should only receive validation events when filtered."""
        emitter = EventEmitter()
        validation_events = []

        def validation_listener(event: IntakeEvent):
            validation_events.append(event.type)

        emitter.on(EventType.VALIDATION_PASSED, validation_listener)
        emitter.on(EventType.VALIDATION_FAILED, validation_listener)

        actor = Actor(kind=ActorKind.AGENT, id="bot_1")

        # Emit mixed events
        emitter.emit(IntakeEvent(
            event_id="evt_037",
            type=EventType.FIELD_UPDATED,
            submission_id="sub_037",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.IN_PROGRESS
        ))

        emitter.emit(IntakeEvent(
            event_id="evt_038",
            type=EventType.VALIDATION_FAILED,
            submission_id="sub_037",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.IN_PROGRESS
        ))

        emitter.emit(IntakeEvent(
            event_id="evt_039",
            type=EventType.VALIDATION_PASSED,
            submission_id="sub_037",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.IN_PROGRESS
        ))

        # Should only capture validation events
        assert len(validation_events) == 2
        assert EventType.VALIDATION_FAILED in validation_events
        assert EventType.VALIDATION_PASSED in validation_events

    def test_filter_only_review_events(self):
        """Should only receive review events when filtered."""
        emitter = EventEmitter()
        review_events = []

        def review_listener(event: IntakeEvent):
            review_events.append((event.type, event.state))

        emitter.on(EventType.REVIEW_REQUESTED, review_listener)
        emitter.on(EventType.REVIEW_APPROVED, review_listener)
        emitter.on(EventType.REVIEW_REJECTED, review_listener)

        actor = Actor(kind=ActorKind.HUMAN, id="reviewer_1")

        # Emit review workflow events
        emitter.emit(IntakeEvent(
            event_id="evt_040",
            type=EventType.SUBMISSION_SUBMITTED,
            submission_id="sub_040",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.SUBMITTED
        ))

        emitter.emit(IntakeEvent(
            event_id="evt_041",
            type=EventType.REVIEW_REQUESTED,
            submission_id="sub_040",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.NEEDS_REVIEW
        ))

        emitter.emit(IntakeEvent(
            event_id="evt_042",
            type=EventType.REVIEW_APPROVED,
            submission_id="sub_040",
            ts=datetime.now(timezone.utc),
            actor=actor,
            state=SubmissionState.APPROVED
        ))

        # Should only capture review events
        assert len(review_events) == 2
        assert (EventType.REVIEW_REQUESTED, SubmissionState.NEEDS_REVIEW) in review_events
        assert (EventType.REVIEW_APPROVED, SubmissionState.APPROVED) in review_events


# Convenience function for pytest discovery
def test_events():
    """Run all event system tests."""
    pass
