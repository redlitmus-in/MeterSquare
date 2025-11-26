"""
Change Request Configuration
Centralized configuration for change request approval workflow
All thresholds and defaults are environment-driven
"""
import os
from typing import Dict, Any


class ChangeRequestConfig:
    """Configuration class for change request system"""

    # Budget Thresholds
    BUDGET_THRESHOLD_TD = float(os.getenv('CR_BUDGET_THRESHOLD_TD', '50000'))  # AED 50,000

    # Default Financial Percentages for BOQ Calculations
    DEFAULT_MISC_PERCENTAGE = float(os.getenv('BOQ_DEFAULT_MISC', '10.0'))  # Miscellaneous
    DEFAULT_OVERHEAD_PROFIT_PERCENTAGE = float(os.getenv('BOQ_DEFAULT_OVERHEAD_PROFIT', '25.0'))  # O&P
    DEFAULT_TRANSPORT_PERCENTAGE = float(os.getenv('BOQ_DEFAULT_TRANSPORT', '5.0'))  # Transport

    # Legacy fields (for backward compatibility with change requests)
    DEFAULT_OVERHEAD_PERCENTAGE = DEFAULT_MISC_PERCENTAGE  # Alias
    DEFAULT_PROFIT_PERCENTAGE = float(os.getenv('CR_DEFAULT_PROFIT', '15.0'))

    # Negotiable Margin Thresholds
    NEGOTIABLE_MARGIN_WARNING_THRESHOLD = float(os.getenv('CR_NEGOTIABLE_MARGIN_WARNING', '60.0'))  # Warning at 60%

    # Approval Roles
    ROLE_SITE_ENGINEER = 'site_supervisor'
    ROLE_PROJECT_MANAGER = 'project_manager'
    ROLE_ESTIMATOR = 'estimator'
    ROLE_TECHNICAL_DIRECTOR = 'technical_director'
    ROLE_BUYER = 'buyer'

    # Status Constants
    STATUS_PENDING = 'pending'
    STATUS_UNDER_REVIEW = 'under_review'
    STATUS_SEND_TO_EST = 'send_to_est'  # PM approved, sent to estimator for pricing
    STATUS_SEND_TO_BUYER = 'send_to_buyer'  # PM approved, sent to buyer for procurement
    STATUS_APPROVED_BY_PM = 'approved_by_pm'
    STATUS_APPROVED_BY_TD = 'approved_by_td'
    STATUS_APPROVED = 'approved'
    STATUS_ASSIGNED_TO_BUYER = 'assigned_to_buyer'
    STATUS_PURCHASE_COMPLETE = 'purchase_completed'  # Fixed: was 'purchase_complete', now 'purchase_completed'
    STATUS_REJECTED = 'rejected'

    # Request Types
    REQUEST_TYPE_EXTRA_MATERIALS = 'EXTRA_MATERIALS'

    @classmethod
    def get_config(cls) -> Dict[str, Any]:
        """Get all configuration as dictionary"""
        return {
            'budget_threshold_td': cls.BUDGET_THRESHOLD_TD,
            'default_overhead_percentage': cls.DEFAULT_OVERHEAD_PERCENTAGE,
            'default_profit_percentage': cls.DEFAULT_PROFIT_PERCENTAGE,
            'roles': {
                'site_engineer': cls.ROLE_SITE_ENGINEER,
                'project_manager': cls.ROLE_PROJECT_MANAGER,
                'estimator': cls.ROLE_ESTIMATOR,
                'technical_director': cls.ROLE_TECHNICAL_DIRECTOR,
                'buyer': cls.ROLE_BUYER
            },
            'statuses': {
                'pending': cls.STATUS_PENDING,
                'under_review': cls.STATUS_UNDER_REVIEW,
                'send_to_est': cls.STATUS_SEND_TO_EST,
                'send_to_buyer': cls.STATUS_SEND_TO_BUYER,
                'approved_by_pm': cls.STATUS_APPROVED_BY_PM,
                'approved_by_td': cls.STATUS_APPROVED_BY_TD,
                'approved': cls.STATUS_APPROVED,
                'assigned_to_buyer': cls.STATUS_ASSIGNED_TO_BUYER,
                'purchase_completed': cls.STATUS_PURCHASE_COMPLETE,  # Fixed key to match status value
                'rejected': cls.STATUS_REJECTED
            }
        }

    @classmethod
    def validate_config(cls) -> bool:
        """Validate configuration on startup"""
        try:
            assert cls.BUDGET_THRESHOLD_TD > 0, "Budget threshold must be positive"
            assert 0 <= cls.DEFAULT_MISC_PERCENTAGE <= 100, "Misc percentage must be 0-100"
            assert 0 <= cls.DEFAULT_OVERHEAD_PROFIT_PERCENTAGE <= 100, "O&P percentage must be 0-100"
            assert 0 <= cls.DEFAULT_TRANSPORT_PERCENTAGE <= 100, "Transport percentage must be 0-100"
            assert 0 <= cls.DEFAULT_PROFIT_PERCENTAGE <= 100, "Profit percentage must be 0-100"
            return True
        except AssertionError as e:
            print(f"⚠️  Configuration validation failed: {e}")
            return False


# Create singleton instance
CR_CONFIG = ChangeRequestConfig()

# Validate on import
if not CR_CONFIG.validate_config():
    raise ValueError("Change Request configuration validation failed")
