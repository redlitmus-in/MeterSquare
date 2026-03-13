"""
Migration: Remove unused overhead tracking columns from change_requests table
Date: 2025-12-19
Description: Removes columns that were never implemented/populated and are marked as removed in the model
"""

import psycopg2
from psycopg2 import sql
import os

def run_migration():
    """Remove unused overhead tracking columns from change_requests table"""

    conn = None
    try:
        # Connect using DATABASE_URL environment variable
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()


        # List of columns to remove (marked as 🗑️ REMOVED in model)
        columns_to_remove = [
            'item_overhead_allocated',
            'item_overhead_consumed_before',
            'item_overhead_available',
            'percentage_of_item_overhead',
            'overhead_consumed',
            'overhead_balance_impact',
            'profit_impact',
            'original_overhead_allocated',
            'original_overhead_used',
            'original_overhead_remaining',
            'original_overhead_percentage',
            'original_profit_percentage',
            'new_overhead_remaining',
            'new_base_cost',
            'new_total_cost',
            'is_over_budget',
            'cost_increase_amount',
            'cost_increase_percentage',
            'new_sub_item_reason'
        ]


        removed_count = 0
        skipped_count = 0

        for column in columns_to_remove:
            try:
                cursor.execute(f"""
                    ALTER TABLE change_requests
                    DROP COLUMN IF EXISTS {column}
                """)
                removed_count += 1
            except Exception as e:
                skipped_count += 1


        cursor.close()

    except Exception as e:
        raise

    finally:
        if conn:
            conn.close()


def rollback_migration():
    """
    WARNING: Cannot restore removed columns without data loss!
    This migration is one-way only.
    """


if __name__ == "__main__":
    """Run migration directly"""
    run_migration()
