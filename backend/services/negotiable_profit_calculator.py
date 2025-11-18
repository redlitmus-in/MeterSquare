"""
Negotiable Profit Calculator Service - DEPRECATED
This service is no longer used for change request calculations.
Kept for backward compatibility with other BOQ operations only.
"""
from typing import Dict, Optional
from config.change_request_config import CR_CONFIG
from config.logging import get_logger

log = get_logger()


class NegotiableProfitCalculator:
    """Service for calculating negotiable profit impact and budget analysis - DEPRECATED for Change Requests"""

    @staticmethod
    def calculate_profit_impact(
        boq_details,
        new_materials_cost: float,
        profit_percentage: Optional[float] = None
    ) -> Optional[Dict]:
        """
        DEPRECATED: This method is no longer used for change requests.
        Returns None for change request operations.
        """
        log.warning("calculate_profit_impact called but is deprecated for change requests")
        return None

    @staticmethod
    def calculate_overhead_impact(
        boq_details,
        new_materials_cost: float,
        profit_percentage: Optional[float] = None
    ) -> Optional[Dict]:
        """
        DEPRECATED: No longer used for change requests
        """
        log.warning("calculate_overhead_impact called but is deprecated for change requests")
        return None

    @staticmethod
    def calculate_materials_total_cost(materials: list) -> float:
        """
        Calculate total cost of materials list

        Args:
            materials: List of material dictionaries with quantity and unit_price

        Returns:
            float: Total cost rounded to 2 decimals
        """
        total = 0.0
        for mat in materials:
            quantity = float(mat.get('quantity', 0))
            unit_price = float(mat.get('unit_price', 0))
            total += quantity * unit_price
        return round(total, 2)

    @staticmethod
    def calculate_change_request_margin(boq_details, new_materials_cost: float, boq_id: int, already_consumed: float = None) -> Optional[Dict]:
        """
        CENTRALIZED calculation for change request negotiable margin
        This is the SINGLE SOURCE OF TRUTH for all negotiable margin calculations

        Formula:
        1. original_allocated = SUM(all sub_items.negotiable_margin) - discount
        2. already_consumed = SUM(approved change requests with NEW materials for this BOQ)
        3. this_request = new_materials_cost
        4. remaining_after = original_allocated - already_consumed - this_request
        5. consumption_percentage = ((already_consumed + this_request) / original_allocated) * 100
        6. exceeds_60_percent = consumption_percentage > 60

        Args:
            boq_details: BOQDetails object with current BOQ data
            new_materials_cost: Total cost of new materials being added
            boq_id: BOQ ID for tracking consumption
            already_consumed: Optional - Sum of approved CRs, if not provided will be 0

        Returns:
            dict: Complete negotiable margin analysis
            None: If calculation fails
        """
        try:
            # Get BOQ summary
            boq_json = boq_details.boq_details or {}
            summary = boq_json.get('summary', {})
            items = boq_json.get('items', [])

            # Step 1: Calculate total negotiable margin from all sub-items
            total_negotiable_margin = 0.0
            for item in items:
                # Check if sub_items exists and is a non-empty list
                sub_items = item.get('sub_items', [])
                if sub_items and isinstance(sub_items, list):
                    for sub_item in sub_items:
                        # negotiable_margin is stored as 'actual_profit' in database
                        sub_negotiable = (
                            sub_item.get('negotiable_margin', 0) or
                            sub_item.get('actual_profit', 0) or
                            0
                        )
                        total_negotiable_margin += sub_negotiable

            # Get discount if present
            discount_amount = summary.get('discount', 0) or 0

            # Original allocated = Total negotiable margin - discount
            original_allocated = total_negotiable_margin - discount_amount

            log.info(f"BOQ {boq_id}: Total negotiable margin={total_negotiable_margin}, Discount={discount_amount}, Original Allocated={original_allocated}")

            # Step 2: Use provided already_consumed or default to 0
            if already_consumed is None:
                already_consumed = 0.0

            # Step 3: This request cost
            this_request = new_materials_cost

            # Step 4: Calculate remaining
            remaining_after = original_allocated - already_consumed - this_request
            is_over_budget = remaining_after < 0

            # Step 5: Calculate consumption percentage
            consumption_percentage = 0.0
            if original_allocated > 0:
                consumption_percentage = ((already_consumed + this_request) / original_allocated) * 100

            # Step 6: Check 60% threshold
            exceeds_60_percent = consumption_percentage > CR_CONFIG.NEGOTIABLE_MARGIN_WARNING_THRESHOLD

            result = {
                'original_allocated': round(original_allocated, 2),
                'discount_applied': round(discount_amount, 2),
                'already_consumed': round(already_consumed, 2),
                'this_request': round(this_request, 2),
                'remaining_after': round(remaining_after, 2),
                'consumption_percentage': round(consumption_percentage, 2),
                'exceeds_60_percent': exceeds_60_percent,
                'is_over_budget': is_over_budget
            }

            log.info(f"BOQ {boq_id} Negotiable Margin Analysis: {result}")
            return result

        except Exception as e:
            log.error(f"Error calculating change request margin: {str(e)}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return None

    @staticmethod
    def format_profit_analysis(profit_data: Dict) -> Dict:
        """
        DEPRECATED: No longer used for change requests
        """
        log.warning("format_profit_analysis called but is deprecated for change requests")
        return {}

    @staticmethod
    def calculate_item_profit_impact(
        item_profit_allocated: float,
        item_profit_consumed_before: float,
        new_sub_items_cost: float
    ) -> Dict:
        """
        DEPRECATED: No longer used for change requests
        """
        log.warning("calculate_item_profit_impact called but is deprecated for change requests")
        return None

    @staticmethod
    def format_budget_impact(profit_data: Dict) -> Dict:
        """
        DEPRECATED: No longer used for change requests
        """
        log.warning("format_budget_impact called but is deprecated for change requests")
        return {}


# Create singleton instance
negotiable_profit_calculator = NegotiableProfitCalculator()


# Backward compatibility aliases
class OverheadCalculator(NegotiableProfitCalculator):
    """
    DEPRECATED: Use NegotiableProfitCalculator instead
    This class is maintained for backward compatibility only
    """
    pass


overhead_calculator = OverheadCalculator()
