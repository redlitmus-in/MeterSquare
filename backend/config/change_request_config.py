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

    # Default Financial Percentages
    DEFAULT_OVERHEAD_PERCENTAGE = float(os.getenv('CR_DEFAULT_OVERHEAD', '10.0'))
    DEFAULT_PROFIT_PERCENTAGE = float(os.getenv('CR_DEFAULT_PROFIT', '15.0'))

    # Approval Roles
    ROLE_SITE_ENGINEER = 'site_supervisor'
    ROLE_PROJECT_MANAGER = 'project_manager'
    ROLE_ESTIMATOR = 'estimator'
    ROLE_TECHNICAL_DIRECTOR = 'technical_director'

    # Status Constants
    STATUS_PENDING = 'pending'
    STATUS_UNDER_REVIEW = 'under_review'
    STATUS_APPROVED_BY_PM = 'approved_by_pm'
    STATUS_APPROVED_BY_TD = 'approved_by_td'
    STATUS_APPROVED = 'approved'
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
                'technical_director': cls.ROLE_TECHNICAL_DIRECTOR
            },
            'statuses': {
                'pending': cls.STATUS_PENDING,
                'under_review': cls.STATUS_UNDER_REVIEW,
                'approved_by_pm': cls.STATUS_APPROVED_BY_PM,
                'approved_by_td': cls.STATUS_APPROVED_BY_TD,
                'approved': cls.STATUS_APPROVED,
                'rejected': cls.STATUS_REJECTED
            }
        }

    @classmethod
    def validate_config(cls) -> bool:
        """Validate configuration on startup"""
        try:
            assert cls.BUDGET_THRESHOLD_TD > 0, "Budget threshold must be positive"
            assert 0 <= cls.DEFAULT_OVERHEAD_PERCENTAGE <= 100, "Overhead percentage must be 0-100"
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
