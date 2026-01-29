"""JSON Schema validation engine for the FormBridge Intake Contract.

This module provides a ValidationEngine that validates submission data against
JSON Schema definitions and produces structured, actionable validation results.

The validation engine is designed to be agent-friendly, translating JSON Schema
validation errors into the FormBridge FieldError format with specific error codes,
field paths, and suggested fixes.

See INTAKE_CONTRACT_SPEC.md §3 for the error schema specification.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import jsonschema
from jsonschema import Draft7Validator

from formbridge.errors import FieldError
from formbridge.types import FieldErrorCode


@dataclass(frozen=True)
class ValidationResult:
    """Result of validating submission data against a JSON Schema.

    Attributes:
        is_valid: Whether the data passed all validation checks
        errors: List of field-level validation errors (empty if valid)
        data: The validated data (normalized/coerced by the validator)
        missing_fields: List of required field paths that are missing
        invalid_fields: List of field paths that failed validation

    Examples:
        >>> schema = {'type': 'object', 'properties': {'name': {'type': 'string'}}, 'required': ['name']}
        >>> engine = ValidationEngine(schema)
        >>> result = engine.validate({'name': 'test'})
        >>> result.is_valid
        True
        >>> result.errors
        []
    """
    is_valid: bool
    errors: List[FieldError]
    data: Optional[Dict[str, Any]] = None
    missing_fields: Optional[List[str]] = None
    invalid_fields: Optional[List[str]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for serialization."""
        result: Dict[str, Any] = {
            "isValid": self.is_valid,
            "errors": [e.to_dict() for e in self.errors],
        }
        if self.data is not None:
            result["data"] = self.data
        if self.missing_fields is not None:
            result["missingFields"] = self.missing_fields
        if self.invalid_fields is not None:
            result["invalidFields"] = self.invalid_fields
        return result


class ValidationEngine:
    """JSON Schema validation engine for intake submissions.

    Wraps the jsonschema library and translates validation errors into the
    FormBridge structured error format with field paths, error codes, and
    actionable messages for LLM agents.

    Attributes:
        schema: The JSON Schema definition to validate against
        validator: The underlying jsonschema validator instance

    Examples:
        >>> schema = {
        ...     'type': 'object',
        ...     'properties': {
        ...         'name': {'type': 'string'},
        ...         'age': {'type': 'number', 'minimum': 0}
        ...     },
        ...     'required': ['name']
        ... }
        >>> engine = ValidationEngine(schema)
        >>> result = engine.validate({'name': 'Alice', 'age': 30})
        >>> result.is_valid
        True

        >>> result = engine.validate({'age': -5})
        >>> result.is_valid
        False
        >>> len(result.errors)
        2
    """

    def __init__(self, schema: Dict[str, Any]) -> None:
        """Initialize the validation engine with a JSON Schema.

        Args:
            schema: A JSON Schema definition (Draft 7 or compatible)

        Raises:
            jsonschema.SchemaError: If the provided schema is invalid
        """
        self.schema = schema
        # Validate that the schema itself is valid
        Draft7Validator.check_schema(schema)
        self.validator = Draft7Validator(schema)

    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        """Validate submission data against the schema.

        Args:
            data: The submission data to validate

        Returns:
            ValidationResult with is_valid flag, errors list, and normalized data

        Examples:
            >>> schema = {'type': 'object', 'properties': {'email': {'type': 'string'}}, 'required': ['email']}
            >>> engine = ValidationEngine(schema)
            >>> result = engine.validate({'email': 'test@example.com'})
            >>> result.is_valid
            True

            >>> result = engine.validate({})
            >>> result.is_valid
            False
            >>> result.errors[0].code
            <FieldErrorCode.REQUIRED: 'required'>
        """
        # Collect all validation errors
        errors = list(self.validator.iter_errors(data))

        if not errors:
            # Validation passed - return success with normalized data
            return ValidationResult(
                is_valid=True,
                errors=[],
                data=data,
                missing_fields=[],
                invalid_fields=[],
            )

        # Translate jsonschema errors to FieldError objects
        field_errors: List[FieldError] = []
        missing_fields: List[str] = []
        invalid_fields: List[str] = []

        for error in errors:
            field_error = self._translate_error(error)
            field_errors.append(field_error)

            # Track which fields are missing vs invalid
            if field_error.code == FieldErrorCode.REQUIRED:
                missing_fields.append(field_error.path)
            else:
                invalid_fields.append(field_error.path)

        return ValidationResult(
            is_valid=False,
            errors=field_errors,
            data=data,
            missing_fields=missing_fields,
            invalid_fields=invalid_fields,
        )

    def _translate_error(self, error: jsonschema.ValidationError) -> FieldError:
        """Translate a jsonschema ValidationError to a FormBridge FieldError.

        This method maps jsonschema's error types to FormBridge's FieldErrorCode
        enum and provides agent-friendly error messages.

        Args:
            error: A jsonschema ValidationError instance

        Returns:
            A FieldError with appropriate code, message, and context

        Error mapping:
            - 'required' property errors -> REQUIRED
            - 'type' errors -> INVALID_TYPE
            - 'format' errors -> INVALID_FORMAT
            - 'enum' or 'const' errors -> INVALID_VALUE
            - 'minLength' errors -> TOO_SHORT
            - 'maxLength' errors -> TOO_LONG
            - Other constraint errors -> INVALID_VALUE
        """
        # Build field path from error.path (deque of property names)
        path = ".".join(str(p) for p in error.path) if error.path else error.path[0] if error.path else ""

        # Handle 'required' property errors specially
        if error.validator == "required":
            # The missing property is in error.message, extract it
            missing_prop = error.message.split("'")[1] if "'" in error.message else "field"
            # Build full path
            if path:
                full_path = f"{path}.{missing_prop}"
            else:
                full_path = missing_prop
            return FieldError(
                path=full_path,
                code=FieldErrorCode.REQUIRED,
                message=f"Field '{full_path}' is required but was not provided",
                expected="required field",
                received=None,
            )

        # Handle type mismatches
        if error.validator == "type":
            expected_type = error.validator_value
            received_value = error.instance
            received_type = type(received_value).__name__
            return FieldError(
                path=path,
                code=FieldErrorCode.INVALID_TYPE,
                message=f"Field '{path}' has invalid type. Expected {expected_type}, got {received_type}",
                expected=expected_type,
                received=received_type,
            )

        # Handle format validation errors
        if error.validator == "format":
            expected_format = error.validator_value
            return FieldError(
                path=path,
                code=FieldErrorCode.INVALID_FORMAT,
                message=f"Field '{path}' has invalid format. Expected format: {expected_format}",
                expected=expected_format,
                received=error.instance,
            )

        # Handle enum/const value constraints
        if error.validator in ("enum", "const"):
            expected_values = error.validator_value
            return FieldError(
                path=path,
                code=FieldErrorCode.INVALID_VALUE,
                message=f"Field '{path}' has invalid value. Must be one of: {expected_values}",
                expected=expected_values,
                received=error.instance,
            )

        # Handle string length constraints
        if error.validator == "minLength":
            min_length = error.validator_value
            actual_length = len(error.instance) if error.instance else 0
            return FieldError(
                path=path,
                code=FieldErrorCode.TOO_SHORT,
                message=f"Field '{path}' is too short. Minimum length: {min_length}, got: {actual_length}",
                expected=f"minimum {min_length} characters",
                received=f"{actual_length} characters",
            )

        if error.validator == "maxLength":
            max_length = error.validator_value
            actual_length = len(error.instance) if error.instance else 0
            return FieldError(
                path=path,
                code=FieldErrorCode.TOO_LONG,
                message=f"Field '{path}' is too long. Maximum length: {max_length}, got: {actual_length}",
                expected=f"maximum {max_length} characters",
                received=f"{actual_length} characters",
            )

        # Handle numeric constraints (minimum, maximum, etc.)
        if error.validator in ("minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"):
            constraint_value = error.validator_value
            return FieldError(
                path=path,
                code=FieldErrorCode.INVALID_VALUE,
                message=f"Field '{path}' violates {error.validator} constraint: {constraint_value}",
                expected=f"{error.validator}: {constraint_value}",
                received=error.instance,
            )

        # Handle pattern (regex) validation
        if error.validator == "pattern":
            pattern = error.validator_value
            return FieldError(
                path=path,
                code=FieldErrorCode.INVALID_FORMAT,
                message=f"Field '{path}' does not match required pattern: {pattern}",
                expected=f"pattern: {pattern}",
                received=error.instance,
            )

        # Generic fallback for other validation errors
        return FieldError(
            path=path,
            code=FieldErrorCode.CUSTOM,
            message=f"Field '{path}' validation failed: {error.message}",
            expected=error.validator_value,
            received=error.instance,
        )


__all__ = [
    "ValidationEngine",
    "ValidationResult",
]
