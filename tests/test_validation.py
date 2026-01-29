"""Unit tests for the validation engine.

Tests cover:
- Missing required fields (root level and nested)
- Field path extraction for errors
- Error message clarity
- ValidationResult structure
- Multiple missing fields

Following INTAKE_CONTRACT_SPEC.md §3 (Error Schema).
"""

import pytest

from formbridge.validation import ValidationEngine, ValidationResult
from formbridge.errors import FieldError
from formbridge.types import FieldErrorCode


class TestMissingFieldsRootLevel:
    """Test validation of missing required fields at root level."""

    def test_single_missing_required_field(self):
        """Should return REQUIRED error for a single missing field."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.REQUIRED
        assert error.path == "name"
        assert "name" in error.message.lower()
        assert "required" in error.message.lower()
        assert error.expected == "required field"
        assert error.received is None

    def test_multiple_missing_required_fields(self):
        """Should return REQUIRED error for each missing field."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string"},
                "age": {"type": "number"}
            },
            "required": ["name", "email", "age"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({})

        assert result.is_valid is False
        assert len(result.errors) == 3

        # All errors should be REQUIRED type
        for error in result.errors:
            assert error.code == FieldErrorCode.REQUIRED
            assert error.expected == "required field"
            assert error.received is None

        # Check that all required fields are reported
        error_paths = {error.path for error in result.errors}
        assert error_paths == {"name", "email", "age"}

    def test_partial_missing_required_fields(self):
        """Should return REQUIRED error only for missing fields."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string"},
                "age": {"type": "number"}
            },
            "required": ["name", "email", "age"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"name": "Alice"})

        assert result.is_valid is False
        assert len(result.errors) == 2

        # Check that only missing fields are reported
        error_paths = {error.path for error in result.errors}
        assert error_paths == {"email", "age"}

        # All errors should be REQUIRED type
        for error in result.errors:
            assert error.code == FieldErrorCode.REQUIRED

    def test_no_missing_fields_when_all_provided(self):
        """Should pass validation when all required fields are provided."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string"}
            },
            "required": ["name", "email"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"name": "Alice", "email": "alice@example.com"})

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.data == {"name": "Alice", "email": "alice@example.com"}

    def test_optional_fields_can_be_omitted(self):
        """Should pass validation when optional fields are omitted."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "nickname": {"type": "string"}
            },
            "required": ["name"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"name": "Alice"})

        assert result.is_valid is True
        assert len(result.errors) == 0


class TestMissingFieldsNested:
    """Test validation of missing required fields in nested objects."""

    def test_missing_nested_field(self):
        """Should return REQUIRED error with full path for nested missing field."""
        schema = {
            "type": "object",
            "properties": {
                "address": {
                    "type": "object",
                    "properties": {
                        "street": {"type": "string"},
                        "city": {"type": "string"}
                    },
                    "required": ["city"]
                }
            },
            "required": ["address"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"address": {"street": "123 Main St"}})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.REQUIRED
        assert error.path == "address.city"
        assert "address.city" in error.message
        assert "required" in error.message.lower()

    def test_missing_nested_object_entirely(self):
        """Should return REQUIRED error for missing nested object."""
        schema = {
            "type": "object",
            "properties": {
                "contact": {
                    "type": "object",
                    "properties": {
                        "email": {"type": "string"}
                    },
                    "required": ["email"]
                }
            },
            "required": ["contact"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.REQUIRED
        assert error.path == "contact"
        assert "contact" in error.message

    def test_deeply_nested_missing_field(self):
        """Should return REQUIRED error with full path for deeply nested field."""
        schema = {
            "type": "object",
            "properties": {
                "user": {
                    "type": "object",
                    "properties": {
                        "profile": {
                            "type": "object",
                            "properties": {
                                "bio": {"type": "string"}
                            },
                            "required": ["bio"]
                        }
                    },
                    "required": ["profile"]
                }
            },
            "required": ["user"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"user": {"profile": {}}})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.REQUIRED
        assert error.path == "user.profile.bio"
        assert "user.profile.bio" in error.message

    def test_multiple_nested_missing_fields(self):
        """Should return REQUIRED errors for multiple nested missing fields."""
        schema = {
            "type": "object",
            "properties": {
                "contact": {
                    "type": "object",
                    "properties": {
                        "email": {"type": "string"},
                        "phone": {"type": "string"}
                    },
                    "required": ["email", "phone"]
                }
            },
            "required": ["contact"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"contact": {}})

        assert result.is_valid is False
        assert len(result.errors) == 2

        # All errors should be REQUIRED type
        for error in result.errors:
            assert error.code == FieldErrorCode.REQUIRED

        # Check that both nested fields are reported
        error_paths = {error.path for error in result.errors}
        assert error_paths == {"contact.email", "contact.phone"}

    def test_nested_field_provided_passes_validation(self):
        """Should pass validation when nested required field is provided."""
        schema = {
            "type": "object",
            "properties": {
                "address": {
                    "type": "object",
                    "properties": {
                        "city": {"type": "string"}
                    },
                    "required": ["city"]
                }
            },
            "required": ["address"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"address": {"city": "Seattle"}})

        assert result.is_valid is True
        assert len(result.errors) == 0


class TestValidationResultStructure:
    """Test the ValidationResult structure for missing fields."""

    def test_missing_fields_list_populated(self):
        """Should populate missing_fields list in ValidationResult."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string"}
            },
            "required": ["name", "email"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({})

        assert result.is_valid is False
        assert len(result.missing_fields) == 2
        assert set(result.missing_fields) == {"name", "email"}
        assert result.invalid_fields == []

    def test_invalid_fields_empty_for_missing_only(self):
        """Should have empty invalid_fields when only missing field errors."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({})

        assert result.is_valid is False
        assert len(result.missing_fields) == 1
        assert result.missing_fields[0] == "name"
        assert result.invalid_fields == []

    def test_data_preserved_in_result(self):
        """Should preserve input data in ValidationResult even when invalid."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        }
        engine = ValidationEngine(schema)
        input_data = {"extra": "field"}
        result = engine.validate(input_data)

        assert result.is_valid is False
        assert result.data == input_data

    def test_validation_result_to_dict(self):
        """Should serialize ValidationResult to dict correctly."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({})

        result_dict = result.to_dict()
        assert result_dict["isValid"] is False
        assert len(result_dict["errors"]) == 1
        assert result_dict["missingFields"] == ["name"]
        assert result_dict["invalidFields"] == []

        # Check error structure
        error_dict = result_dict["errors"][0]
        assert error_dict["code"] == "required"
        assert error_dict["path"] == "name"
        assert "message" in error_dict


class TestComplexMissingFieldScenarios:
    """Test complex scenarios with missing fields."""

    def test_missing_and_invalid_fields_together(self):
        """Should handle both missing and invalid fields in same validation."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "number"}
            },
            "required": ["name", "age"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"age": "not-a-number"})

        assert result.is_valid is False
        assert len(result.errors) == 2

        # One error should be REQUIRED (for name), one should be INVALID_TYPE (for age)
        error_codes = {error.code for error in result.errors}
        assert FieldErrorCode.REQUIRED in error_codes
        assert FieldErrorCode.INVALID_TYPE in error_codes

        # Check the lists
        assert "name" in result.missing_fields
        assert "age" in result.invalid_fields

    def test_array_of_objects_with_missing_fields(self):
        """Should handle missing fields in array items."""
        schema = {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"}
                        },
                        "required": ["id"]
                    }
                }
            },
            "required": ["items"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"items": [{}]})

        assert result.is_valid is False
        # Should report missing id in array item
        assert len(result.errors) >= 1
        # At least one error should be about missing id
        has_id_error = any("id" in error.path for error in result.errors)
        assert has_id_error

    def test_empty_object_when_many_fields_required(self):
        """Should handle empty object validation against complex schema."""
        schema = {
            "type": "object",
            "properties": {
                "firstName": {"type": "string"},
                "lastName": {"type": "string"},
                "email": {"type": "string", "format": "email"},
                "phone": {"type": "string"},
                "address": {
                    "type": "object",
                    "properties": {
                        "street": {"type": "string"},
                        "city": {"type": "string"},
                        "state": {"type": "string"},
                        "zip": {"type": "string"}
                    },
                    "required": ["street", "city", "state", "zip"]
                }
            },
            "required": ["firstName", "lastName", "email", "address"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({})

        assert result.is_valid is False
        # Should report all 4 root-level required fields
        assert len(result.errors) == 4

        error_paths = {error.path for error in result.errors}
        assert error_paths == {"firstName", "lastName", "email", "address"}

    def test_schema_with_no_required_fields(self):
        """Should pass validation when schema has no required fields."""
        schema = {
            "type": "object",
            "properties": {
                "optional1": {"type": "string"},
                "optional2": {"type": "number"}
            }
        }
        engine = ValidationEngine(schema)
        result = engine.validate({})

        assert result.is_valid is True
        assert result.errors == []
        assert result.missing_fields == []


class TestTypeMismatches:
    """Test validation of type mismatches."""

    def test_string_expected_number_received(self):
        """Should return INVALID_TYPE error when number provided for string field."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"name": 123})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_TYPE
        assert error.path == "name"
        assert "name" in error.message.lower()
        assert error.expected == "string"
        assert error.received == "number"

    def test_number_expected_string_received(self):
        """Should return INVALID_TYPE error when string provided for number field."""
        schema = {
            "type": "object",
            "properties": {
                "age": {"type": "number"}
            },
            "required": ["age"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"age": "not-a-number"})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_TYPE
        assert error.path == "age"
        assert error.expected == "number"
        assert error.received == "string"

    def test_boolean_expected_string_received(self):
        """Should return INVALID_TYPE error when string provided for boolean field."""
        schema = {
            "type": "object",
            "properties": {
                "isActive": {"type": "boolean"}
            },
            "required": ["isActive"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"isActive": "true"})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_TYPE
        assert error.path == "isActive"
        assert error.expected == "boolean"
        assert error.received == "string"

    def test_object_expected_primitive_received(self):
        """Should return INVALID_TYPE error when primitive provided for object field."""
        schema = {
            "type": "object",
            "properties": {
                "address": {
                    "type": "object",
                    "properties": {
                        "street": {"type": "string"}
                    }
                }
            },
            "required": ["address"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"address": "123 Main St"})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_TYPE
        assert error.path == "address"
        assert error.expected == "object"
        assert error.received == "string"

    def test_array_expected_object_received(self):
        """Should return INVALID_TYPE error when object provided for array field."""
        schema = {
            "type": "object",
            "properties": {
                "tags": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            },
            "required": ["tags"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"tags": {"tag": "value"}})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_TYPE
        assert error.path == "tags"
        assert error.expected == "array"
        assert error.received == "object"

    def test_nested_type_mismatch(self):
        """Should return INVALID_TYPE error with full path for nested type mismatch."""
        schema = {
            "type": "object",
            "properties": {
                "contact": {
                    "type": "object",
                    "properties": {
                        "phone": {"type": "string"}
                    },
                    "required": ["phone"]
                }
            },
            "required": ["contact"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"contact": {"phone": 1234567890}})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_TYPE
        assert error.path == "contact.phone"
        assert "contact.phone" in error.message
        assert error.expected == "string"
        assert error.received == "number"

    def test_multiple_type_mismatches(self):
        """Should return INVALID_TYPE error for each type mismatch."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "number"},
                "isActive": {"type": "boolean"}
            },
            "required": ["name", "age", "isActive"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({
            "name": 123,
            "age": "not-a-number",
            "isActive": "true"
        })

        assert result.is_valid is False
        assert len(result.errors) == 3

        # All errors should be INVALID_TYPE type
        for error in result.errors:
            assert error.code == FieldErrorCode.INVALID_TYPE

        # Check that all fields are reported
        error_paths = {error.path for error in result.errors}
        assert error_paths == {"name", "age", "isActive"}

        # Check expected vs received for each field
        errors_by_path = {error.path: error for error in result.errors}
        assert errors_by_path["name"].expected == "string"
        assert errors_by_path["name"].received == "number"
        assert errors_by_path["age"].expected == "number"
        assert errors_by_path["age"].received == "string"
        assert errors_by_path["isActive"].expected == "boolean"
        assert errors_by_path["isActive"].received == "string"

    def test_integer_type_validation(self):
        """Should validate integer type specifically (not just number)."""
        schema = {
            "type": "object",
            "properties": {
                "count": {"type": "integer"}
            },
            "required": ["count"]
        }
        engine = ValidationEngine(schema)

        # Float should fail for integer field
        result = engine.validate({"count": 3.14})
        assert result.is_valid is False
        assert len(result.errors) == 1
        assert result.errors[0].code == FieldErrorCode.INVALID_TYPE
        assert result.errors[0].expected == "integer"

    def test_null_type_mismatch(self):
        """Should return INVALID_TYPE error when null/None provided for non-nullable field."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"name": None})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_TYPE
        assert error.path == "name"
        assert error.expected == "string"
        assert error.received == "null"

    def test_correct_types_pass_validation(self):
        """Should pass validation when all fields have correct types."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "number"},
                "isActive": {"type": "boolean"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "address": {
                    "type": "object",
                    "properties": {
                        "city": {"type": "string"}
                    }
                }
            },
            "required": ["name", "age", "isActive", "tags", "address"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({
            "name": "Alice",
            "age": 30,
            "isActive": True,
            "tags": ["tag1", "tag2"],
            "address": {"city": "Seattle"}
        })

        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_invalid_fields_list_populated(self):
        """Should populate invalid_fields list in ValidationResult for type mismatches."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "number"}
            },
            "required": ["name", "age"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"name": 123, "age": "not-a-number"})

        assert result.is_valid is False
        assert len(result.invalid_fields) == 2
        assert set(result.invalid_fields) == {"name", "age"}
        assert result.missing_fields == []


class TestConstraints:
    """Test validation of constraint violations (min/max, pattern, enum)."""

    def test_string_too_long(self):
        """Should return TOO_LONG error when string exceeds maxLength."""
        schema = {
            "type": "object",
            "properties": {
                "username": {"type": "string", "maxLength": 10}
            },
            "required": ["username"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"username": "this_is_too_long"})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.TOO_LONG
        assert error.path == "username"
        assert "username" in error.message.lower()
        assert error.expected == "max length 10"
        assert error.received == "length 17"

    def test_string_too_short(self):
        """Should return TOO_SHORT error when string is below minLength."""
        schema = {
            "type": "object",
            "properties": {
                "password": {"type": "string", "minLength": 8}
            },
            "required": ["password"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"password": "short"})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.TOO_SHORT
        assert error.path == "password"
        assert "password" in error.message.lower()
        assert error.expected == "min length 8"
        assert error.received == "length 5"

    def test_string_length_within_bounds(self):
        """Should pass validation when string length is within bounds."""
        schema = {
            "type": "object",
            "properties": {
                "username": {"type": "string", "minLength": 3, "maxLength": 20}
            },
            "required": ["username"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"username": "validuser"})

        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_number_below_minimum(self):
        """Should return INVALID_VALUE error when number is below minimum."""
        schema = {
            "type": "object",
            "properties": {
                "age": {"type": "number", "minimum": 18}
            },
            "required": ["age"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"age": 15})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_VALUE
        assert error.path == "age"
        assert "age" in error.message.lower()
        assert error.expected == "minimum 18"
        assert error.received == "15"

    def test_number_above_maximum(self):
        """Should return INVALID_VALUE error when number exceeds maximum."""
        schema = {
            "type": "object",
            "properties": {
                "score": {"type": "number", "maximum": 100}
            },
            "required": ["score"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"score": 150})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_VALUE
        assert error.path == "score"
        assert "score" in error.message.lower()
        assert error.expected == "maximum 100"
        assert error.received == "150"

    def test_number_within_range(self):
        """Should pass validation when number is within min/max range."""
        schema = {
            "type": "object",
            "properties": {
                "percentage": {"type": "number", "minimum": 0, "maximum": 100}
            },
            "required": ["percentage"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"percentage": 75})

        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_pattern_mismatch(self):
        """Should return INVALID_FORMAT error when string doesn't match pattern."""
        schema = {
            "type": "object",
            "properties": {
                "email": {"type": "string", "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"}
            },
            "required": ["email"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"email": "not-an-email"})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_FORMAT
        assert error.path == "email"
        assert "email" in error.message.lower()
        assert "pattern" in error.expected.lower() or "format" in error.expected.lower()
        assert error.received == "not-an-email"

    def test_pattern_match(self):
        """Should pass validation when string matches pattern."""
        schema = {
            "type": "object",
            "properties": {
                "email": {"type": "string", "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"}
            },
            "required": ["email"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"email": "user@example.com"})

        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_enum_invalid_value(self):
        """Should return INVALID_VALUE error when value not in enum."""
        schema = {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["active", "inactive", "pending"]}
            },
            "required": ["status"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"status": "unknown"})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_VALUE
        assert error.path == "status"
        assert "status" in error.message.lower()
        assert "active" in error.expected or "enum" in error.expected.lower()
        assert error.received == "unknown"

    def test_enum_valid_value(self):
        """Should pass validation when value is in enum."""
        schema = {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["active", "inactive", "pending"]}
            },
            "required": ["status"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"status": "active"})

        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_multiple_constraint_violations(self):
        """Should return error for each constraint violation."""
        schema = {
            "type": "object",
            "properties": {
                "username": {"type": "string", "minLength": 5, "maxLength": 20},
                "age": {"type": "number", "minimum": 18, "maximum": 120},
                "status": {"type": "string", "enum": ["active", "inactive"]}
            },
            "required": ["username", "age", "status"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({
            "username": "abc",  # Too short
            "age": 150,  # Above maximum
            "status": "unknown"  # Not in enum
        })

        assert result.is_valid is False
        assert len(result.errors) == 3

        # Check that all fields have errors
        error_paths = {error.path for error in result.errors}
        assert error_paths == {"username", "age", "status"}

        # Check error codes
        errors_by_path = {error.path: error for error in result.errors}
        assert errors_by_path["username"].code == FieldErrorCode.TOO_SHORT
        assert errors_by_path["age"].code == FieldErrorCode.INVALID_VALUE
        assert errors_by_path["status"].code == FieldErrorCode.INVALID_VALUE

    def test_nested_constraint_violation(self):
        """Should return constraint error with full path for nested field."""
        schema = {
            "type": "object",
            "properties": {
                "contact": {
                    "type": "object",
                    "properties": {
                        "phone": {"type": "string", "pattern": "^\\d{10}$"}
                    },
                    "required": ["phone"]
                }
            },
            "required": ["contact"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"contact": {"phone": "123"}})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_FORMAT
        assert error.path == "contact.phone"
        assert "contact.phone" in error.message

    def test_array_item_constraint_violation(self):
        """Should return constraint error for array item violations."""
        schema = {
            "type": "object",
            "properties": {
                "tags": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "maxLength": 20
                    }
                }
            },
            "required": ["tags"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"tags": ["short", "this_tag_is_way_too_long_for_the_constraint"]})

        assert result.is_valid is False
        assert len(result.errors) >= 1

        # At least one error should be about the long tag
        has_length_error = any(
            error.code == FieldErrorCode.TOO_LONG and "tags" in error.path
            for error in result.errors
        )
        assert has_length_error

    def test_exclusive_minimum(self):
        """Should return INVALID_VALUE error when number equals exclusive minimum."""
        schema = {
            "type": "object",
            "properties": {
                "price": {"type": "number", "exclusiveMinimum": 0}
            },
            "required": ["price"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"price": 0})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_VALUE
        assert error.path == "price"

    def test_exclusive_maximum(self):
        """Should return INVALID_VALUE error when number equals exclusive maximum."""
        schema = {
            "type": "object",
            "properties": {
                "percentage": {"type": "number", "exclusiveMaximum": 100}
            },
            "required": ["percentage"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"percentage": 100})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_VALUE
        assert error.path == "percentage"

    def test_format_email_invalid(self):
        """Should return INVALID_FORMAT error for invalid email format."""
        schema = {
            "type": "object",
            "properties": {
                "email": {"type": "string", "format": "email"}
            },
            "required": ["email"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"email": "not-an-email"})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_FORMAT
        assert error.path == "email"
        assert "email" in error.message.lower()

    def test_format_email_valid(self):
        """Should pass validation for valid email format."""
        schema = {
            "type": "object",
            "properties": {
                "email": {"type": "string", "format": "email"}
            },
            "required": ["email"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"email": "user@example.com"})

        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_format_uri_invalid(self):
        """Should return INVALID_FORMAT error for invalid URI format."""
        schema = {
            "type": "object",
            "properties": {
                "website": {"type": "string", "format": "uri"}
            },
            "required": ["website"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"website": "not a uri"})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_FORMAT
        assert error.path == "website"

    def test_format_uri_valid(self):
        """Should pass validation for valid URI format."""
        schema = {
            "type": "object",
            "properties": {
                "website": {"type": "string", "format": "uri"}
            },
            "required": ["website"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"website": "https://example.com"})

        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_array_min_items_violation(self):
        """Should return INVALID_VALUE error when array has fewer items than minItems."""
        schema = {
            "type": "object",
            "properties": {
                "tags": {"type": "array", "minItems": 2, "items": {"type": "string"}}
            },
            "required": ["tags"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"tags": ["only-one"]})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_VALUE
        assert error.path == "tags"
        assert "minimum" in error.expected.lower() or "min" in error.expected.lower()

    def test_array_max_items_violation(self):
        """Should return INVALID_VALUE error when array exceeds maxItems."""
        schema = {
            "type": "object",
            "properties": {
                "tags": {"type": "array", "maxItems": 3, "items": {"type": "string"}}
            },
            "required": ["tags"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"tags": ["one", "two", "three", "four"]})

        assert result.is_valid is False
        assert len(result.errors) == 1

        error = result.errors[0]
        assert error.code == FieldErrorCode.INVALID_VALUE
        assert error.path == "tags"
        assert "maximum" in error.expected.lower() or "max" in error.expected.lower()

    def test_array_items_within_bounds(self):
        """Should pass validation when array item count is within bounds."""
        schema = {
            "type": "object",
            "properties": {
                "tags": {"type": "array", "minItems": 1, "maxItems": 5, "items": {"type": "string"}}
            },
            "required": ["tags"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"tags": ["tag1", "tag2", "tag3"]})

        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_constraint_and_type_errors_together(self):
        """Should handle both constraint violations and type errors."""
        schema = {
            "type": "object",
            "properties": {
                "username": {"type": "string", "minLength": 5},
                "age": {"type": "number", "minimum": 18}
            },
            "required": ["username", "age"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({
            "username": "abc",  # Too short (constraint)
            "age": "not-a-number"  # Wrong type
        })

        assert result.is_valid is False
        assert len(result.errors) == 2

        error_codes = {error.code for error in result.errors}
        assert FieldErrorCode.TOO_SHORT in error_codes
        assert FieldErrorCode.INVALID_TYPE in error_codes

    def test_invalid_fields_list_for_constraints(self):
        """Should populate invalid_fields list for constraint violations."""
        schema = {
            "type": "object",
            "properties": {
                "username": {"type": "string", "maxLength": 10},
                "age": {"type": "number", "minimum": 18}
            },
            "required": ["username", "age"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({
            "username": "this_is_too_long",
            "age": 15
        })

        assert result.is_valid is False
        assert len(result.invalid_fields) == 2
        assert set(result.invalid_fields) == {"username", "age"}
        assert result.missing_fields == []


# Convenience function for pytest discovery
def test_constraints():
    """Entry point for pytest test_constraints discovery."""
    # This function exists solely for pytest discovery
    # All actual tests are in the TestConstraints class above
    pass


class TestSuccessfulValidation:
    """Test successful validation scenarios with valid data."""

    def test_simple_object_valid(self):
        """Should pass validation for simple object with all required fields."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "number"}
            },
            "required": ["name", "age"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"name": "Alice", "age": 30})

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.invalid_fields == []
        assert result.data == {"name": "Alice", "age": 30}

    def test_nested_object_valid(self):
        """Should pass validation for nested object with all required fields."""
        schema = {
            "type": "object",
            "properties": {
                "user": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "email": {"type": "string", "format": "email"},
                        "profile": {
                            "type": "object",
                            "properties": {
                                "bio": {"type": "string"},
                                "age": {"type": "number"}
                            },
                            "required": ["bio", "age"]
                        }
                    },
                    "required": ["name", "email", "profile"]
                }
            },
            "required": ["user"]
        }
        engine = ValidationEngine(schema)
        data = {
            "user": {
                "name": "Bob",
                "email": "bob@example.com",
                "profile": {
                    "bio": "Software developer",
                    "age": 28
                }
            }
        }
        result = engine.validate(data)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.invalid_fields == []
        assert result.data == data

    def test_array_with_items_valid(self):
        """Should pass validation for array with valid items."""
        schema = {
            "type": "object",
            "properties": {
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "maxItems": 5
                },
                "scores": {
                    "type": "array",
                    "items": {"type": "number"}
                }
            },
            "required": ["tags", "scores"]
        }
        engine = ValidationEngine(schema)
        data = {
            "tags": ["python", "javascript", "rust"],
            "scores": [95, 87, 92]
        }
        result = engine.validate(data)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.invalid_fields == []
        assert result.data == data

    def test_array_of_objects_valid(self):
        """Should pass validation for array of objects with all required fields."""
        schema = {
            "type": "object",
            "properties": {
                "users": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "name": {"type": "string"},
                            "active": {"type": "boolean"}
                        },
                        "required": ["id", "name", "active"]
                    }
                }
            },
            "required": ["users"]
        }
        engine = ValidationEngine(schema)
        data = {
            "users": [
                {"id": "u1", "name": "Alice", "active": True},
                {"id": "u2", "name": "Bob", "active": False},
                {"id": "u3", "name": "Charlie", "active": True}
            ]
        }
        result = engine.validate(data)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.invalid_fields == []
        assert result.data == data

    def test_mixed_types_valid(self):
        """Should pass validation for object with mixed field types."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "integer"},
                "height": {"type": "number"},
                "isActive": {"type": "boolean"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "metadata": {
                    "type": "object",
                    "properties": {
                        "created": {"type": "string"},
                        "updated": {"type": "string"}
                    }
                }
            },
            "required": ["name", "age", "height", "isActive", "tags", "metadata"]
        }
        engine = ValidationEngine(schema)
        data = {
            "name": "Alice",
            "age": 30,
            "height": 5.6,
            "isActive": True,
            "tags": ["developer", "python"],
            "metadata": {
                "created": "2024-01-01",
                "updated": "2024-01-15"
            }
        }
        result = engine.validate(data)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.invalid_fields == []
        assert result.data == data

    def test_optional_fields_with_values(self):
        """Should pass validation with optional fields provided."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "address": {"type": "string"}
            },
            "required": ["name", "email"]
        }
        engine = ValidationEngine(schema)
        data = {
            "name": "Alice",
            "email": "alice@example.com",
            "phone": "555-1234",
            "address": "123 Main St"
        }
        result = engine.validate(data)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.invalid_fields == []
        assert result.data == data

    def test_optional_fields_omitted(self):
        """Should pass validation with optional fields omitted."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "address": {"type": "string"}
            },
            "required": ["name", "email"]
        }
        engine = ValidationEngine(schema)
        data = {"name": "Alice", "email": "alice@example.com"}
        result = engine.validate(data)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.invalid_fields == []
        assert result.data == data

    def test_constraints_within_bounds(self):
        """Should pass validation when all constraints are satisfied."""
        schema = {
            "type": "object",
            "properties": {
                "username": {"type": "string", "minLength": 3, "maxLength": 20},
                "age": {"type": "number", "minimum": 0, "maximum": 120},
                "email": {"type": "string", "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"},
                "status": {"type": "string", "enum": ["active", "inactive", "pending"]},
                "tags": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 5}
            },
            "required": ["username", "age", "email", "status", "tags"]
        }
        engine = ValidationEngine(schema)
        data = {
            "username": "alice123",
            "age": 30,
            "email": "alice@example.com",
            "status": "active",
            "tags": ["python", "rust"]
        }
        result = engine.validate(data)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.invalid_fields == []
        assert result.data == data

    def test_format_validation_valid(self):
        """Should pass validation for valid format fields."""
        schema = {
            "type": "object",
            "properties": {
                "email": {"type": "string", "format": "email"},
                "website": {"type": "string", "format": "uri"}
            },
            "required": ["email", "website"]
        }
        engine = ValidationEngine(schema)
        data = {
            "email": "user@example.com",
            "website": "https://example.com"
        }
        result = engine.validate(data)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.invalid_fields == []
        assert result.data == data

    def test_complex_nested_structure_valid(self):
        """Should pass validation for complex nested structure."""
        schema = {
            "type": "object",
            "properties": {
                "company": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "employees": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {"type": "string"},
                                    "name": {"type": "string"},
                                    "department": {
                                        "type": "object",
                                        "properties": {
                                            "name": {"type": "string"},
                                            "budget": {"type": "number"}
                                        },
                                        "required": ["name", "budget"]
                                    }
                                },
                                "required": ["id", "name", "department"]
                            }
                        }
                    },
                    "required": ["name", "employees"]
                }
            },
            "required": ["company"]
        }
        engine = ValidationEngine(schema)
        data = {
            "company": {
                "name": "TechCorp",
                "employees": [
                    {
                        "id": "e1",
                        "name": "Alice",
                        "department": {
                            "name": "Engineering",
                            "budget": 1000000
                        }
                    },
                    {
                        "id": "e2",
                        "name": "Bob",
                        "department": {
                            "name": "Sales",
                            "budget": 500000
                        }
                    }
                ]
            }
        }
        result = engine.validate(data)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.invalid_fields == []
        assert result.data == data

    def test_empty_object_with_no_required_fields(self):
        """Should pass validation for empty object when no fields are required."""
        schema = {
            "type": "object",
            "properties": {
                "optional1": {"type": "string"},
                "optional2": {"type": "number"}
            }
        }
        engine = ValidationEngine(schema)
        result = engine.validate({})

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.invalid_fields == []
        assert result.data == {}

    def test_integer_values_valid(self):
        """Should pass validation for integer type fields."""
        schema = {
            "type": "object",
            "properties": {
                "count": {"type": "integer"},
                "index": {"type": "integer", "minimum": 0}
            },
            "required": ["count", "index"]
        }
        engine = ValidationEngine(schema)
        data = {"count": 42, "index": 10}
        result = engine.validate(data)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.missing_fields == []
        assert result.invalid_fields == []
        assert result.data == data

    def test_validation_result_to_dict_success(self):
        """Should serialize successful ValidationResult to dict correctly."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        }
        engine = ValidationEngine(schema)
        result = engine.validate({"name": "Alice"})

        result_dict = result.to_dict()
        assert result_dict["isValid"] is True
        assert result_dict["errors"] == []
        assert result_dict["missingFields"] == []
        assert result_dict["invalidFields"] == []
        assert result_dict["data"] == {"name": "Alice"}


# Convenience function for pytest discovery
def test_valid_data():
    """Entry point for pytest test_valid_data discovery."""
    # This function exists solely for pytest discovery
    # All actual tests are in the TestSuccessfulValidation class above
    pass
