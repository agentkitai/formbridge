"""Event system for the FormBridge Intake Contract.

This module provides the event data structures and event emitter for audit logging
and real-time notifications. Every state transition and significant action emits
a typed IntakeEvent that is recorded in the event stream.

The event stream is append-only, immutable, and serves as the canonical audit trail
(see INTAKE_CONTRACT_SPEC.md §6).
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional
import json

from .types import Actor, ActorKind, EventType, SubmissionState


@dataclass(frozen=True)
class IntakeEvent:
    """A single event in the intake submission lifecycle.

    Events are immutable audit records that track all state transitions
    and significant actions. Each event includes:
    - Unique identifier
    - Event type (from EventType enum)
    - Submission context
    - Timestamp (UTC)
    - Actor who triggered the event
    - Resulting state
    - Optional payload data

    Attributes:
        event_id: Globally unique event identifier (e.g., "evt_01H8...")
        type: Event type from EventType enum
        submission_id: ID of the submission this event relates to
        ts: UTC timestamp when the event occurred
        actor: Actor who triggered this event
        state: Submission state after this event
        payload: Optional event-specific data (e.g., changed fields, error details)

    Examples:
        >>> from datetime import datetime, timezone
        >>> from formbridge.types import Actor, ActorKind, EventType, SubmissionState
        >>>
        >>> event = IntakeEvent(
        ...     event_id="evt_001",
        ...     type=EventType.SUBMISSION_CREATED,
        ...     submission_id="sub_001",
        ...     ts=datetime.now(timezone.utc),
        ...     actor=Actor(kind=ActorKind.AGENT, id="bot_1"),
        ...     state=SubmissionState.DRAFT
        ... )
    """
    event_id: str
    type: EventType
    submission_id: str
    ts: datetime
    actor: Actor
    state: SubmissionState
    payload: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        """Validate and normalize fields."""
        # Convert string actor kind to ActorKind enum if needed
        if isinstance(self.actor, Actor):
            if isinstance(self.actor.kind, str):
                object.__setattr__(
                    self,
                    "actor",
                    Actor(
                        kind=ActorKind(self.actor.kind),
                        id=self.actor.id,
                        name=self.actor.name,
                        metadata=self.actor.metadata,
                    ),
                )

        # Convert string state to SubmissionState enum if needed
        if isinstance(self.state, str):
            object.__setattr__(self, "state", SubmissionState(self.state))

        # Convert string type to EventType enum if needed
        if isinstance(self.type, str):
            object.__setattr__(self, "type", EventType(self.type))

    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary for serialization.

        Returns:
            Dictionary with all event fields, suitable for JSON serialization.
            Timestamp is formatted as ISO 8601 string.
        """
        result: Dict[str, Any] = {
            "eventId": self.event_id,
            "type": self.type.value,
            "submissionId": self.submission_id,
            "ts": self.ts.isoformat(),
            "actor": self.actor.to_dict(),
            "state": self.state.value,
        }
        if self.payload is not None:
            result["payload"] = self.payload
        return result

    def to_jsonl(self) -> str:
        """Convert event to JSONL format (single-line JSON).

        Returns:
            Single-line JSON string suitable for appending to JSONL event stream.
        """
        return json.dumps(self.to_dict(), separators=(',', ':'))

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "IntakeEvent":
        """Create IntakeEvent from dictionary.

        Args:
            data: Dictionary with event fields (camelCase keys)

        Returns:
            IntakeEvent instance
        """
        # Parse timestamp
        ts_str = data["ts"]
        ts = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))

        # Parse actor
        actor = Actor.from_dict(data["actor"])

        return cls(
            event_id=data["eventId"],
            type=EventType(data["type"]),
            submission_id=data["submissionId"],
            ts=ts,
            actor=actor,
            state=SubmissionState(data["state"]),
            payload=data.get("payload"),
        )


EventListener = Callable[[IntakeEvent], None]
"""Type alias for event listener callbacks.

Event listeners are called synchronously when events are emitted.
They should not raise exceptions or perform long-running operations.
"""


class EventEmitter:
    """Event emitter for managing event listeners and dispatching events.

    The EventEmitter follows the observer pattern, allowing components to
    subscribe to specific event types and receive notifications when events occur.

    Features:
    - Type-specific subscriptions (listen to specific event types)
    - Wildcard subscriptions (listen to all events)
    - Synchronous dispatch (listeners called in registration order)
    - Error isolation (listener exceptions don't affect other listeners)

    Examples:
        >>> emitter = EventEmitter()
        >>>
        >>> def on_created(event: IntakeEvent):
        ...     print(f"Submission created: {event.submission_id}")
        >>>
        >>> # Subscribe to specific event type
        >>> emitter.on(EventType.SUBMISSION_CREATED, on_created)
        >>>
        >>> # Subscribe to all events
        >>> emitter.on_any(lambda e: print(f"Event: {e.type.value}"))
        >>>
        >>> # Emit an event
        >>> from datetime import datetime, timezone
        >>> event = IntakeEvent(
        ...     event_id="evt_001",
        ...     type=EventType.SUBMISSION_CREATED,
        ...     submission_id="sub_001",
        ...     ts=datetime.now(timezone.utc),
        ...     actor=Actor(kind=ActorKind.SYSTEM, id="test"),
        ...     state=SubmissionState.DRAFT
        ... )
        >>> emitter.emit(event)
    """

    def __init__(self):
        """Initialize event emitter with empty listener registries."""
        self._listeners: Dict[EventType, List[EventListener]] = {}
        self._any_listeners: List[EventListener] = []

    def on(self, event_type: EventType, listener: EventListener) -> None:
        """Subscribe to a specific event type.

        Args:
            event_type: Event type to listen for
            listener: Callback function to invoke when event occurs
        """
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(listener)

    def on_any(self, listener: EventListener) -> None:
        """Subscribe to all event types (wildcard subscription).

        Args:
            listener: Callback function to invoke for any event
        """
        self._any_listeners.append(listener)

    def off(self, event_type: EventType, listener: EventListener) -> None:
        """Unsubscribe from a specific event type.

        Args:
            event_type: Event type to stop listening to
            listener: Callback function to remove
        """
        if event_type in self._listeners:
            try:
                self._listeners[event_type].remove(listener)
            except ValueError:
                pass  # Listener not registered, ignore

    def off_any(self, listener: EventListener) -> None:
        """Unsubscribe from wildcard subscription.

        Args:
            listener: Callback function to remove
        """
        try:
            self._any_listeners.remove(listener)
        except ValueError:
            pass  # Listener not registered, ignore

    def emit(self, event: IntakeEvent) -> None:
        """Dispatch an event to all registered listeners.

        Listeners are called synchronously in registration order:
        1. Type-specific listeners for this event type
        2. Wildcard listeners (subscribed to all events)

        If a listener raises an exception, it is caught and the error is
        suppressed to prevent affecting other listeners or the caller.

        Args:
            event: Event to dispatch
        """
        # Call type-specific listeners
        if event.type in self._listeners:
            for listener in self._listeners[event.type]:
                try:
                    listener(event)
                except Exception:
                    # Suppress listener exceptions to isolate failures
                    # In production, this should be logged
                    pass

        # Call wildcard listeners
        for listener in self._any_listeners:
            try:
                listener(event)
            except Exception:
                # Suppress listener exceptions
                pass

    def clear(self) -> None:
        """Remove all event listeners.

        Useful for testing or cleanup.
        """
        self._listeners.clear()
        self._any_listeners.clear()

    def listener_count(self, event_type: Optional[EventType] = None) -> int:
        """Get count of registered listeners.

        Args:
            event_type: If provided, count listeners for this type only.
                        If None, count all listeners (including wildcard).

        Returns:
            Number of registered listeners
        """
        if event_type is not None:
            return len(self._listeners.get(event_type, []))
        else:
            # Count all type-specific + wildcard listeners
            total = len(self._any_listeners)
            for listeners in self._listeners.values():
                total += len(listeners)
            return total


__all__ = [
    "IntakeEvent",
    "EventType",
    "EventListener",
    "EventEmitter",
]
