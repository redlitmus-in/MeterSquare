"""
Input Validation Utilities for MeterSquare
Provides secure input validation and sanitization

Usage:
    from utils.validators import validate_input, sanitize_string, ValidationError

    # Validate change request data
    try:
        validated = validate_change_request(request.json)
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
"""

import re
import html
from typing import Any, Dict, List, Optional
from config.security_config import SecurityConfig


class ValidationError(Exception):
    """Custom validation error with details"""

    def __init__(self, message: str, field: str = None, details: Dict = None):
        self.message = message
        self.field = field
        self.details = details or {}
        super().__init__(self.message)


def sanitize_string(value: str, max_length: int = None, allow_html: bool = False) -> str:
    """
    Sanitize a string input

    Args:
        value: The string to sanitize
        max_length: Maximum allowed length (truncates if exceeded)
        allow_html: If False, escapes HTML characters

    Returns:
        Sanitized string
    """
    if not isinstance(value, str):
        return str(value) if value is not None else ""

    # Trim whitespace
    value = value.strip()

    # Escape HTML if not allowed
    if not allow_html:
        value = html.escape(value)

    # Remove null bytes
    value = value.replace('\x00', '')

    # Truncate if max_length specified
    if max_length and len(value) > max_length:
        value = value[:max_length]

    return value


def validate_email(email: str) -> str:
    """
    Validate email format

    Args:
        email: Email address to validate

    Returns:
        Validated email (lowercase, trimmed)

    Raises:
        ValidationError: If email is invalid
    """
    if not email:
        raise ValidationError("Email is required", field="email")

    email = email.strip().lower()

    # Basic email regex
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_pattern, email):
        raise ValidationError("Invalid email format", field="email")

    if len(email) > SecurityConfig.MAX_EMAIL_LENGTH:
        raise ValidationError(f"Email must be less than {SecurityConfig.MAX_EMAIL_LENGTH} characters", field="email")

    return email


def validate_phone(phone: str) -> str:
    """
    Validate phone number format

    Args:
        phone: Phone number to validate

    Returns:
        Validated phone (digits only)

    Raises:
        ValidationError: If phone is invalid
    """
    if not phone:
        return None

    # Remove common separators
    phone = re.sub(r'[\s\-\(\)\+]', '', str(phone).strip())

    # Check if it's all digits
    if not phone.isdigit():
        raise ValidationError("Phone number must contain only digits", field="phone")

    # Check length (7-15 digits for international numbers)
    if len(phone) < 7 or len(phone) > 15:
        raise ValidationError("Phone number must be between 7 and 15 digits", field="phone")

    return phone


def validate_positive_number(value: Any, field_name: str = "value", allow_zero: bool = False) -> float:
    """
    Validate that a value is a positive number

    Args:
        value: Value to validate
        field_name: Name of the field for error messages
        allow_zero: If True, allows zero values

    Returns:
        Validated number as float

    Raises:
        ValidationError: If value is not a positive number
    """
    try:
        num = float(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{field_name} must be a number", field=field_name)

    if allow_zero:
        if num < 0:
            raise ValidationError(f"{field_name} cannot be negative", field=field_name)
    else:
        if num <= 0:
            raise ValidationError(f"{field_name} must be a positive number", field=field_name)

    return num


def validate_string_length(value: str, field_name: str, min_length: int = 0, max_length: int = None) -> str:
    """
    Validate string length

    Args:
        value: String to validate
        field_name: Name of the field for error messages
        min_length: Minimum required length
        max_length: Maximum allowed length

    Returns:
        Validated string

    Raises:
        ValidationError: If length is invalid
    """
    if not isinstance(value, str):
        raise ValidationError(f"{field_name} must be a string", field=field_name)

    value = value.strip()

    if len(value) < min_length:
        raise ValidationError(f"{field_name} must be at least {min_length} characters", field=field_name)

    max_len = max_length or SecurityConfig.MAX_STRING_LENGTH
    if len(value) > max_len:
        raise ValidationError(f"{field_name} must be less than {max_len} characters", field=field_name)

    return value


def check_sql_injection(value: str) -> bool:
    """
    Check for common SQL injection patterns
    Returns True if suspicious patterns found

    Note: This is an additional layer. Always use parameterized queries!
    """
    if not isinstance(value, str):
        return False

    # Common SQL injection patterns
    patterns = [
        r"(\s|^)(SELECT|INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|UNION)\s",
        r"(--|#|\/\*)",  # SQL comments
        r";\s*(SELECT|INSERT|UPDATE|DELETE|DROP)",  # Statement chaining
        r"'\s*(OR|AND)\s*'",  # OR/AND injection
        r"1\s*=\s*1",  # Always true condition
        r"'\s*=\s*'"  # Empty comparison
    ]

    value_upper = value.upper()
    for pattern in patterns:
        if re.search(pattern, value_upper, re.IGNORECASE):
            return True

    return False


def validate_change_request(data: Dict) -> Dict:
    """
    Validate change request input data

    Args:
        data: Dictionary containing change request data

    Returns:
        Validated and sanitized data

    Raises:
        ValidationError: If validation fails
    """
    if not data:
        raise ValidationError("No data provided")

    validated = {}
    errors = []

    # Material name (required)
    if 'material_name' in data:
        try:
            material_name = sanitize_string(data['material_name'])
            validated['material_name'] = validate_string_length(
                material_name, 'material_name', min_length=1, max_length=255
            )
            if check_sql_injection(validated['material_name']):
                errors.append({'field': 'material_name', 'error': 'Invalid characters detected'})
        except ValidationError as e:
            errors.append({'field': e.field, 'error': e.message})
    else:
        errors.append({'field': 'material_name', 'error': 'Material name is required'})

    # Quantity (required)
    if 'quantity' in data:
        try:
            validated['quantity'] = validate_positive_number(data['quantity'], 'quantity')
        except ValidationError as e:
            errors.append({'field': e.field, 'error': e.message})
    else:
        errors.append({'field': 'quantity', 'error': 'Quantity is required'})

    # Justification (required, min 10 chars)
    if 'justification' in data:
        try:
            justification = sanitize_string(data['justification'])
            validated['justification'] = validate_string_length(
                justification, 'justification', min_length=10, max_length=1000
            )
        except ValidationError as e:
            errors.append({'field': e.field, 'error': e.message})
    else:
        errors.append({'field': 'justification', 'error': 'Justification is required'})

    # Optional fields
    if 'unit' in data and data['unit']:
        validated['unit'] = sanitize_string(data['unit'], max_length=50)

    if 'rate' in data and data['rate'] is not None:
        try:
            validated['rate'] = validate_positive_number(data['rate'], 'rate', allow_zero=True)
        except ValidationError as e:
            errors.append({'field': e.field, 'error': e.message})

    if errors:
        raise ValidationError(
            "Validation failed",
            details={'errors': errors}
        )

    return validated


def validate_boq_item(data: Dict) -> Dict:
    """
    Validate BOQ item input data

    Args:
        data: Dictionary containing BOQ item data

    Returns:
        Validated and sanitized data

    Raises:
        ValidationError: If validation fails
    """
    if not data:
        raise ValidationError("No data provided")

    validated = {}
    errors = []

    # Description (required)
    if 'description' in data:
        try:
            description = sanitize_string(data['description'])
            validated['description'] = validate_string_length(
                description, 'description', min_length=1, max_length=500
            )
        except ValidationError as e:
            errors.append({'field': e.field, 'error': e.message})
    else:
        errors.append({'field': 'description', 'error': 'Description is required'})

    # Unit (required)
    if 'unit' in data:
        try:
            validated['unit'] = validate_string_length(
                sanitize_string(data['unit']), 'unit', min_length=1, max_length=50
            )
        except ValidationError as e:
            errors.append({'field': e.field, 'error': e.message})
    else:
        errors.append({'field': 'unit', 'error': 'Unit is required'})

    # Quantity (required)
    if 'quantity' in data:
        try:
            validated['quantity'] = validate_positive_number(data['quantity'], 'quantity')
        except ValidationError as e:
            errors.append({'field': e.field, 'error': e.message})
    else:
        errors.append({'field': 'quantity', 'error': 'Quantity is required'})

    # Rate (required)
    if 'rate' in data:
        try:
            validated['rate'] = validate_positive_number(data['rate'], 'rate', allow_zero=True)
        except ValidationError as e:
            errors.append({'field': e.field, 'error': e.message})
    else:
        errors.append({'field': 'rate', 'error': 'Rate is required'})

    # Optional item number
    if 'item_no' in data and data['item_no'] is not None:
        try:
            validated['item_no'] = int(data['item_no'])
            if validated['item_no'] < 1:
                errors.append({'field': 'item_no', 'error': 'Item number must be positive'})
        except (TypeError, ValueError):
            errors.append({'field': 'item_no', 'error': 'Item number must be an integer'})

    if errors:
        raise ValidationError(
            "Validation failed",
            details={'errors': errors}
        )

    return validated


def validate_file_upload(filename: str, file_size: int = None) -> bool:
    """
    Validate file upload

    Args:
        filename: Name of the file
        file_size: Size of the file in bytes (optional)

    Returns:
        True if valid

    Raises:
        ValidationError: If file is invalid
    """
    if not filename:
        raise ValidationError("Filename is required", field="file")

    # Get extension
    if '.' not in filename:
        raise ValidationError("File must have an extension", field="file")

    ext = filename.rsplit('.', 1)[1].lower()

    # Check allowed extensions
    if ext not in SecurityConfig.ALLOWED_FILE_EXTENSIONS:
        raise ValidationError(
            f"File type .{ext} not allowed. Allowed: {', '.join(SecurityConfig.ALLOWED_FILE_EXTENSIONS)}",
            field="file"
        )

    # Check file size
    if file_size is not None:
        max_bytes = SecurityConfig.MAX_FILE_SIZE_MB * 1024 * 1024
        if file_size > max_bytes:
            raise ValidationError(
                f"File size exceeds {SecurityConfig.MAX_FILE_SIZE_MB}MB limit",
                field="file"
            )

    return True


def validate_pagination(page: Any = 1, per_page: Any = 50, max_per_page: int = 100) -> Dict:
    """
    Validate pagination parameters

    Args:
        page: Page number
        per_page: Items per page
        max_per_page: Maximum allowed items per page

    Returns:
        Dictionary with validated page and per_page
    """
    try:
        page = int(page) if page else 1
        page = max(1, page)  # Minimum page is 1
    except (TypeError, ValueError):
        page = 1

    try:
        per_page = int(per_page) if per_page else 50
        per_page = max(1, min(per_page, max_per_page))  # Clamp between 1 and max
    except (TypeError, ValueError):
        per_page = 50

    return {
        'page': page,
        'per_page': per_page
    }
