"""
Overhead Calculator Service
Centralized overhead and budget impact calculations
Used by both Change Requests and BOQ operations
"""
from typing import Dict, Optional
from config.change_request_config import CR_CONFIG
from config.logging import get_logger

log = get_logger()


class OverheadCalculator:
    """Service for calculating overhead impact and budget analysis"""

    @staticmethod
    def calculate_overhead_impact(
        boq_details,
        new_materials_cost: float,
        overhead_percentage: Optional[float] = None,
        profit_percentage: Optional[float] = None
    ) -> Optional[Dict]:
        """
        Calculate overhead impact when adding new materials to BOQ

        Args:
            boq_details: BOQDetails object with current BOQ data
            new_materials_cost: Total cost of new materials being added
            overhead_percentage: Override default overhead % (optional)
            profit_percentage: Override default profit % (optional)

        Returns:
            dict: Complete overhead analysis with all calculations
            None: If calculation fails
        """
        try:
            # Get BOQ summary
            boq_json = boq_details.boq_details or {}
            summary = boq_json.get('summary', {})

            # Original BOQ totals
            original_base_cost = summary.get('total_cost', 0) or summary.get('selling_price', 0) or 0

            # Get overhead and profit percentages
            items = boq_json.get('items', [])

            # Use provided percentages or extract from BOQ or use defaults
            if overhead_percentage is None:
                if items and len(items) > 0:
                    overhead_percentage = items[0].get('overhead_percentage', CR_CONFIG.DEFAULT_OVERHEAD_PERCENTAGE)
                else:
                    overhead_percentage = CR_CONFIG.DEFAULT_OVERHEAD_PERCENTAGE

            if profit_percentage is None:
                if items and len(items) > 0:
                    profit_percentage = items[0].get('profit_margin_percentage', CR_CONFIG.DEFAULT_PROFIT_PERCENTAGE)
                else:
                    profit_percentage = CR_CONFIG.DEFAULT_PROFIT_PERCENTAGE

            # Calculate original overhead allocated
            # Overhead is calculated as a percentage of the base cost
            # Formula: base_cost * (overhead% / 100)
            original_overhead_allocated = (original_base_cost * overhead_percentage) / 100

            # For simplicity, assume overhead hasn't been consumed yet
            # TODO: In future, track overhead consumption from previous change requests
            original_overhead_used = 0.0
            original_overhead_remaining = original_overhead_allocated - original_overhead_used

            # Calculate overhead consumed by new materials
            # The extra material cost directly consumes from the overhead budget
            overhead_consumed = new_materials_cost

            # Calculate new overhead remaining
            new_overhead_remaining = original_overhead_remaining - overhead_consumed
            is_over_budget = new_overhead_remaining < 0

            # Calculate new totals
            new_base_cost = original_base_cost + new_materials_cost
            new_overhead_total = original_overhead_allocated  # Overhead allocation doesn't change
            new_profit = (new_base_cost * profit_percentage) / 100
            new_total_cost = new_base_cost + new_overhead_total + new_profit

            # Calculate cost increase
            cost_increase_amount = new_total_cost - original_base_cost
            cost_increase_percentage = (cost_increase_amount / original_base_cost * 100) if original_base_cost > 0 else 0

            # Original profit for comparison
            original_profit = (original_base_cost * profit_percentage) / 100

            return {
                'original_overhead_allocated': round(original_overhead_allocated, 2),
                'original_overhead_used': round(original_overhead_used, 2),
                'original_overhead_remaining': round(original_overhead_remaining, 2),
                'original_overhead_percentage': round(overhead_percentage, 2),
                'original_profit_percentage': round(profit_percentage, 2),
                'overhead_consumed': round(overhead_consumed, 2),
                'new_overhead_remaining': round(new_overhead_remaining, 2),
                'is_over_budget': is_over_budget,
                'overhead_balance_impact': round(new_overhead_remaining, 2),
                'profit_impact': round(new_profit - original_profit, 2),
                'new_base_cost': round(new_base_cost, 2),
                'new_total_cost': round(new_total_cost, 2),
                'cost_increase_amount': round(cost_increase_amount, 2),
                'cost_increase_percentage': round(cost_increase_percentage, 2)
            }

        except Exception as e:
            log.error(f"Error calculating overhead impact: {str(e)}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
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
    def format_overhead_analysis(overhead_data: Dict) -> Dict:
        """
        Format overhead data for API response

        Args:
            overhead_data: Raw overhead calculation data

        Returns:
            dict: Formatted overhead analysis
        """
        return {
            'original_allocated': overhead_data.get('original_overhead_allocated', 0),
            'overhead_percentage': overhead_data.get('original_overhead_percentage', 0),
            'consumed_before_request': overhead_data.get('original_overhead_used', 0),
            'available_before_request': overhead_data.get('original_overhead_remaining', 0),
            'consumed_by_this_request': overhead_data.get('overhead_consumed', 0),
            'remaining_after_approval': overhead_data.get('new_overhead_remaining', 0),
            'is_within_budget': not overhead_data.get('is_over_budget', False),
            'balance_type': 'negative' if overhead_data.get('is_over_budget', False) else 'positive',
            'balance_amount': abs(overhead_data.get('new_overhead_remaining', 0))
        }

    @staticmethod
    def calculate_item_overhead_impact(
        item_overhead_allocated: float,
        item_overhead_consumed_before: float,
        new_sub_items_cost: float
    ) -> Dict:
        """
        Calculate overhead impact for a specific BOQ item (not overall BOQ)

        Args:
            item_overhead_allocated: Total overhead allocated for this specific item
            item_overhead_consumed_before: Already consumed overhead for this item
            new_sub_items_cost: Cost of new sub-items being requested

        Returns:
            dict: Item-specific overhead analysis with 40% threshold check
        """
        try:
            item_overhead_available = item_overhead_allocated - item_overhead_consumed_before
            new_overhead_consumed = new_sub_items_cost
            remaining_after = item_overhead_available - new_overhead_consumed
            is_over_budget = remaining_after < 0

            # Calculate percentage of item overhead consumed (for 40% threshold)
            percentage = (new_sub_items_cost / item_overhead_allocated * 100) if item_overhead_allocated > 0 else 0
            exceeds_40_percent = percentage > 40

            return {
                'item_overhead_allocated': round(item_overhead_allocated, 2),
                'item_overhead_consumed_before': round(item_overhead_consumed_before, 2),
                'item_overhead_available': round(item_overhead_available, 2),
                'sub_items_cost': round(new_sub_items_cost, 2),
                'new_overhead_consumed': round(new_overhead_consumed, 2),
                'remaining_after': round(remaining_after, 2),
                'is_over_budget': is_over_budget,
                'percentage_of_item': round(percentage, 2),
                'exceeds_40_percent': exceeds_40_percent
            }
        except Exception as e:
            log.error(f"Error calculating item overhead impact: {str(e)}")
            return None

    @staticmethod
    def format_budget_impact(overhead_data: Dict) -> Dict:
        """
        Format budget impact for API response

        Args:
            overhead_data: Raw overhead calculation data

        Returns:
            dict: Formatted budget impact
        """
        new_total = overhead_data.get('new_total_cost', 0)
        increase_amount = overhead_data.get('cost_increase_amount', 0)
        original_total = new_total - increase_amount if new_total and increase_amount else 0

        return {
            'original_total': round(original_total, 2),
            'new_total_if_approved': round(new_total, 2),
            'increase_amount': round(increase_amount, 2),
            'increase_percentage': round(overhead_data.get('cost_increase_percentage', 0), 2)
        }


# Create singleton instance
overhead_calculator = OverheadCalculator()
