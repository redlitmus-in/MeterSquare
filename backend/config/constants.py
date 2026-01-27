"""
Application Constants and Enums

This module contains all hardcoded status strings, role strings, and magic values
used throughout the application. Using constants instead of hardcoded strings:
- Prevents typos (IDE autocomplete)
- Makes refactoring easier
- Provides single source of truth
- Enables type checking
"""

from enum import Enum


# ==================== PURCHASE & CHANGE REQUEST STATUSES ====================

class PurchaseStatus(str, Enum):
    """Purchase/Change Request status constants"""
    PENDING = 'pending'
    PENDING_VENDOR_SELECTION = 'pending_vendor_selection'
    VENDOR_SELECTED = 'vendor_selected'
    VENDOR_SELECTED_PENDING_TD_APPROVAL = 'vendor_selected_pending_td_approval'
    TD_APPROVED_PENDING_PURCHASE = 'td_approved_pending_purchase'
    PENDING_PM_APPROVAL = 'pending_pm_approval'
    PM_APPROVED = 'pm_approved'
    PM_REJECTED = 'pm_rejected'
    PENDING_TD_APPROVAL = 'pending_td_approval'
    TD_APPROVED = 'td_approved'
    TD_REJECTED = 'td_rejected'
    APPROVED = 'approved'
    REJECTED = 'rejected'
    COMPLETED = 'completed'
    PURCHASE_COMPLETED = 'purchase_completed'
    ROUTED_TO_STORE = 'routed_to_store'
    CANCELLED = 'cancelled'
    IN_PROGRESS = 'in_progress'


class VendorSelectionStatus(str, Enum):
    """Vendor selection status for purchases and POChildren"""
    PENDING = 'pending'
    PENDING_TD_APPROVAL = 'pending_td_approval'
    APPROVED = 'approved'
    TD_APPROVED = 'approved'  # Alias
    REJECTED = 'rejected'
    TD_REJECTED = 'td_rejected'
    PENDING_BUYER_SELECTION = 'pending_buyer_selection'
    BUYER_SELECTED = 'buyer_selected'


class POChildStatus(str, Enum):
    """POChild-specific status constants"""
    PENDING_TD_APPROVAL = 'pending_td_approval'
    APPROVED = 'approved'
    TD_APPROVED = 'approved'  # Alias
    REJECTED = 'rejected'
    TD_REJECTED = 'td_rejected'
    PURCHASE_COMPLETED = 'purchase_completed'
    CANCELLED = 'cancelled'


# ==================== USER ROLES ====================

class UserRole(str, Enum):
    """User role constants"""
    ADMIN = 'admin'
    TECHNICAL_DIRECTOR = 'technical_director'
    TECHNICALDIRECTOR = 'technicaldirector'  # Legacy without underscore
    TECHNICAL_DIRECTOR_SPACE = 'technical director'  # Legacy with space
    TD = 'td'  # Abbreviation
    BUYER = 'buyer'
    PROJECT_MANAGER = 'pm'
    SITE_ENGINEER = 'se'
    SITE_SUPERVISOR = 'site_supervisor'
    ESTIMATOR = 'estimator'
    VENDOR = 'vendor'


# Role Helper Functions
def is_technical_director(role: str) -> bool:
    """
    Check if role is Technical Director (handles all variations)

    Args:
        role: User role string

    Returns:
        True if role is any variation of Technical Director
    """
    if not role:
        return False

    role_lower = role.lower().strip()
    return role_lower in [
        UserRole.TECHNICAL_DIRECTOR.value,
        UserRole.TECHNICALDIRECTOR.value,
        UserRole.TECHNICAL_DIRECTOR_SPACE.value,
        UserRole.TD.value,
        'technical_director',
        'technicaldirector',
        'technical director',
        'td'
    ]


def is_admin_role(role: str) -> bool:
    """Check if role is Admin"""
    if not role:
        return False
    return role.lower().strip() == UserRole.ADMIN.value


def is_buyer_role(role: str) -> bool:
    """Check if role is Buyer"""
    if not role:
        return False
    return 'buyer' in role.lower()


def is_project_manager_role(role: str) -> bool:
    """Check if role is Project Manager"""
    if not role:
        return False
    return role.lower().strip() in [UserRole.PROJECT_MANAGER.value, 'pm', 'project_manager']


def is_site_engineer_role(role: str) -> bool:
    """Check if role is Site Engineer"""
    if not role:
        return False
    return role.lower().strip() in [UserRole.SITE_ENGINEER.value, 'se', 'site_engineer', 'site_supervisor', 'siteengineer', 'sitesupervisor']


# ==================== BOQ STATUSES ====================

class BOQStatus(str, Enum):
    """BOQ status constants"""
    DRAFT = 'draft'
    PENDING_CLIENT_APPROVAL = 'pending_client_approval'
    CLIENT_APPROVED = 'client_approved'
    CLIENT_REJECTED = 'client_rejected'
    ACTIVE = 'active'
    COMPLETED = 'completed'
    CANCELLED = 'cancelled'


# ==================== INVENTORY STATUSES ====================

class DeliveryNoteStatus(str, Enum):
    """Delivery Note status constants"""
    PENDING = 'pending'
    DISPATCHED = 'dispatched'
    RECEIVED = 'received'
    PARTIALLY_RECEIVED = 'partially_received'
    CANCELLED = 'cancelled'


class StoreRequestStatus(str, Enum):
    """Internal Material Request (Store Request) status"""
    PENDING = 'pending'
    APPROVED = 'approved'
    REJECTED = 'rejected'
    FULFILLED = 'fulfilled'
    CANCELLED = 'cancelled'


# ==================== EMAIL & NOTIFICATION TYPES ====================

class EmailType(str, Enum):
    """Email notification types"""
    VENDOR_SELECTED = 'vendor_selected'
    VENDOR_APPROVED = 'vendor_approved'
    VENDOR_REJECTED = 'vendor_rejected'
    PURCHASE_COMPLETED = 'purchase_completed'
    TD_APPROVAL_REQUESTED = 'td_approval_requested'
    PM_APPROVAL_REQUESTED = 'pm_approval_requested'
    APPROVAL_GRANTED = 'approval_granted'
    APPROVAL_REJECTED = 'approval_rejected'
    LPO_SENT = 'lpo_sent'
    DELIVERY_NOTE_CREATED = 'delivery_note_created'


class NotificationType(str, Enum):
    """In-app notification types"""
    APPROVAL_REQUEST = 'approval_request'
    APPROVAL_GRANTED = 'approval'
    APPROVAL_REJECTED = 'rejection'
    VENDOR_SELECTION = 'vendor_selection'
    PURCHASE_UPDATE = 'purchase_update'
    DELIVERY_UPDATE = 'delivery'
    SYSTEM = 'system'
    INFO = 'info'
    WARNING = 'warning'
    ERROR = 'error'


# ==================== BUSINESS RULES & LIMITS ====================

# Purchase Notes
MAX_PURCHASE_NOTES_LENGTH = 5000
MIN_PURCHASE_NOTES_LENGTH = 10

# Supplier Notes
MAX_SUPPLIER_NOTES_LENGTH = 5000

# Materials
MAX_MATERIALS_PER_PURCHASE = 100
MAX_MATERIALS_PER_DELIVERY = 100

# File Uploads
MAX_LPO_FILE_SIZE = 5 * 1024 * 1024  # 5MB
MAX_BOQ_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_LPO_EXTENSIONS = ['.pdf', '.docx', '.doc']
ALLOWED_BOQ_EXTENSIONS = ['.xlsx', '.xls']
ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif']

# Pagination
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# Price Precision
PRICE_DECIMAL_PLACES = 2


# ==================== SUPABASE CONFIGURATION ====================

class SupabaseConfig:
    """Supabase storage configuration"""
    BUCKET_NAME = "file_upload"
    LPO_FOLDER = "lpo_files"
    BOQ_FOLDER = "boq_files"
    DELIVERY_NOTE_FOLDER = "delivery_notes"
    PROFILE_IMAGES_FOLDER = "profile_images"

    @staticmethod
    def get_public_url_base(supabase_url: str) -> str:
        """Get Supabase public URL base"""
        return f"{supabase_url}/storage/v1/object/public/{SupabaseConfig.BUCKET_NAME}/"


# ==================== DEFAULT VALUES ====================

class DefaultValues:
    """Default values for various entities"""
    UNKNOWN_PROJECT = 'Unknown'
    UNKNOWN_VENDOR = 'Not Selected'
    UNKNOWN_USER = 'Unknown User'
    DEFAULT_QUANTITY = 0
    DEFAULT_PRICE = 0.0
    DEFAULT_VAT_RATE = 0.05  # 5%
    DEFAULT_CURRENCY = 'AED'

    # Company/Store defaults
    DEFAULT_COMPANY_NAME = 'MeterSquare'
    DEFAULT_STORE_NAME = 'M2 Store'
    DEFAULT_SITE_ENGINEER_TITLE = 'Site Engineer'


# ==================== VALIDATION PATTERNS ====================

# Email validation (basic)
EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

# Phone validation (international)
PHONE_REGEX = r'^\+?[1-9]\d{1,14}$'

# Material name normalization
def normalize_material_name(name: str) -> str:
    """
    Normalize material name for comparison

    Args:
        name: Material name string

    Returns:
        Normalized lowercase, trimmed string
    """
    return name.lower().strip() if name else ''


# ==================== ERROR MESSAGES ====================

class ErrorMessages:
    """Standard error messages"""
    UNAUTHORIZED = "Access denied. Insufficient permissions."
    NOT_FOUND = "Resource not found."
    INVALID_INPUT = "Invalid input data."
    INVALID_STATUS = "Invalid status transition."
    INVALID_ROLE = "Invalid user role."
    MISSING_REQUIRED = "Missing required field: {field}"
    EXCEEDS_MAX_LENGTH = "Field exceeds maximum length: {field}"
    INVALID_FORMAT = "Invalid format: {field}"
    ALREADY_EXISTS = "Resource already exists."
    OPERATION_FAILED = "Operation failed. Please try again."
    DATABASE_ERROR = "Database operation failed."
    EXTERNAL_API_ERROR = "External service unavailable."


# ==================== SUCCESS MESSAGES ====================

class SuccessMessages:
    """Standard success messages"""
    CREATED = "{resource} created successfully."
    UPDATED = "{resource} updated successfully."
    DELETED = "{resource} deleted successfully."
    APPROVED = "{resource} approved successfully."
    REJECTED = "{resource} rejected successfully."
    SENT = "{resource} sent successfully."
    COMPLETED = "{resource} completed successfully."
