"""FormBridge Intake Contract Runtime & Validation Engine.

FormBridge is an agent-native intake protocol that provides:
- Submission state machine with well-defined lifecycle states
- Structured validation errors that AI agents can deterministically retry against
- Resumable sessions with handoff between agents and humans
- Idempotent submission semantics
- Audit event stream for full traceability

This package implements the core runtime: state machine, validation engine,
and event system as defined in the Intake Contract Specification.

Basic usage:
    >>> from formbridge.runtime import IntakeRuntime
    >>> schema = {
    ...     "type": "object",
    ...     "properties": {"name": {"type": "string"}},
    ...     "required": ["name"]
    ... }
    >>> runtime = IntakeRuntime(intake_id="vendor_onboarding", schema=schema)
    >>> submission = runtime.create_submission(actor={"kind": "agent", "id": "bot_001"})
    >>> print(submission["state"])
    draft
"""

__version__ = "0.1.0"
__author__ = "FormBridge Team"

# Version info
VERSION = (0, 1, 0)

# Core exports
from formbridge.runtime import IntakeRuntime

# Package metadata
__all__ = [
    "__version__",
    "VERSION",
    "IntakeRuntime",
]
