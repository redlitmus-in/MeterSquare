"""
Migration: Add Vendor, User, and Role Performance Indexes
Date: 2026-01-29
Purpose: Fix slow queries (100-350ms) on vendors, vendor_products, users, and roles tables

These tables were identified as completely or partially unindexed, causing:
- vendor_products queries: 270-290ms
- roles queries: 290-350ms
- users queries: 100-180ms
- vendor queries: 100-150ms

This migration adds critical indexes to bring query times under 50ms.
"""

from config.db import db
from sqlalchemy import text
import logging

log = logging.getLogger(__name__)


def upgrade():
    """Add missing performance indexes for vendors, users, and roles"""

    conn = db.engine.connect()
    trans = conn.begin()

    try:
        log.info("Starting vendor/user/role index migration...")

        # ========== VENDORS TABLE INDEXES ==========
        # Currently has only: idx_vendor_deleted (is_deleted, vendor_id)
        # Missing critical indexes for status filtering and lookups

        log.info("Creating vendor indexes...")

        # Index for active vendor listing (most common query pattern)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_vendor_status_active
            ON vendors(status, is_deleted)
            WHERE is_deleted = false
        """))

        # Index for email lookups (vendor login, uniqueness checks)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_vendor_email_lookup
            ON vendors(email, is_deleted)
            WHERE is_deleted = false
        """))

        # Index for category filtering
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_vendor_category_status
            ON vendors(category, status, is_deleted)
            WHERE is_deleted = false
        """))

        # Index for creator queries
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_vendor_created_by
            ON vendors(created_by, is_deleted)
            WHERE is_deleted = false AND created_by IS NOT NULL
        """))

        # Index for sorting by creation date
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_vendor_created_at_desc
            ON vendors(created_at DESC)
            WHERE is_deleted = false
        """))

        # ========== VENDOR_PRODUCTS TABLE INDEXES ==========
        # Currently has NO explicit indexes - causing 270-290ms queries

        log.info("Creating vendor_products indexes...")

        # Index for vendor's products listing (primary query pattern)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_vendor_product_vendor_active
            ON vendor_products(vendor_id, is_deleted)
            WHERE is_deleted = false
        """))

        # Index for category filtering
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_vendor_product_category
            ON vendor_products(category, is_deleted)
            WHERE is_deleted = false
        """))

        # Index for product name searches with vendor
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_vendor_product_name_vendor
            ON vendor_products(product_name, vendor_id)
            WHERE is_deleted = false
        """))

        # Index for sorting by creation date
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_vendor_product_created_at
            ON vendor_products(created_at DESC)
            WHERE is_deleted = false
        """))

        # ========== USERS TABLE INDEXES ==========
        # Currently has only primary key and role_id FK
        # Missing composite indexes causing 100-180ms queries

        log.info("Creating users indexes...")

        # Index for role-based queries (most common pattern)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_user_role_active
            ON users(role_id, is_active, is_deleted)
            WHERE is_deleted = false AND is_active = true
        """))

        # Index for email lookups (login, password reset)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_user_email_active
            ON users(email, is_deleted, is_active)
            WHERE is_deleted = false
        """))

        # Index for department filtering
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_user_department_active
            ON users(department, is_active)
            WHERE is_deleted = false AND department IS NOT NULL
        """))

        # Index for user status + role queries (workflow routing)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_user_status_role
            ON users(user_status, role_id, is_deleted)
            WHERE is_deleted = false
        """))

        # Index for sorting by creation date
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_user_created_at_desc
            ON users(created_at DESC)
            WHERE is_deleted = false
        """))

        # ========== ROLES TABLE INDEXES ==========
        # Currently has only: role column index
        # Missing composite indexes causing 290-350ms queries

        log.info("Creating roles indexes...")

        # Index for active roles queries
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_role_active_deleted
            ON roles(is_active, is_deleted)
            WHERE is_deleted = false
        """))

        # Index for role lookup with status
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_role_status_lookup
            ON roles(role, is_active, is_deleted)
            WHERE is_deleted = false
        """))

        # ========== NOTIFICATIONS TABLE - SUPPORT TICKETS INDEX ==========
        # Missing index for support ticket dashboard counts (taking 100-180ms)

        log.info("Creating notification support ticket index...")

        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_notification_support_tickets
            ON notifications(category, target_role, read, deleted_at)
            WHERE category = 'support'
        """))

        trans.commit()
        log.info("[SUCCESS] All vendor/user/role indexes created successfully!")

        print("\n" + "="*70)
        print("VENDOR/USER/ROLE INDEX MIGRATION COMPLETED SUCCESSFULLY")
        print("="*70)
        print("\nIndexes Created:")
        print("  - vendors: 5 new indexes (status, email, category, created_by, date)")
        print("  - vendor_products: 4 new indexes (vendor, category, name, date)")
        print("  - users: 5 new indexes (role, email, department, status, date)")
        print("  - roles: 2 new indexes (active, status lookup)")
        print("  - notifications: 1 new index (support tickets)")
        print("\nExpected Performance Improvements:")
        print("  - Vendor queries: 270ms -> 30ms (90% faster)")
        print("  - Vendor products: 290ms -> 40ms (86% faster)")
        print("  - User queries: 180ms -> 30ms (83% faster)")
        print("  - Role queries: 350ms -> 20ms (94% faster)")
        print("  - Notification counts: 180ms -> 30ms (83% faster)")
        print("="*70 + "\n")

    except Exception as e:
        trans.rollback()
        log.error(f"[ERROR] Error creating indexes: {e}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        raise
    finally:
        conn.close()


def downgrade():
    """Remove vendor/user/role indexes"""

    conn = db.engine.connect()
    trans = conn.begin()

    try:
        log.info("Removing vendor/user/role indexes...")

        indexes = [
            # Vendor indexes
            "DROP INDEX IF EXISTS idx_vendor_status_active",
            "DROP INDEX IF EXISTS idx_vendor_email_lookup",
            "DROP INDEX IF EXISTS idx_vendor_category_status",
            "DROP INDEX IF EXISTS idx_vendor_created_by",
            "DROP INDEX IF EXISTS idx_vendor_created_at_desc",
            # Vendor products indexes
            "DROP INDEX IF EXISTS idx_vendor_product_vendor_active",
            "DROP INDEX IF EXISTS idx_vendor_product_category",
            "DROP INDEX IF EXISTS idx_vendor_product_name_vendor",
            "DROP INDEX IF EXISTS idx_vendor_product_created_at",
            # User indexes
            "DROP INDEX IF EXISTS idx_user_role_active",
            "DROP INDEX IF EXISTS idx_user_email_active",
            "DROP INDEX IF EXISTS idx_user_department_active",
            "DROP INDEX IF EXISTS idx_user_status_role",
            "DROP INDEX IF EXISTS idx_user_created_at_desc",
            # Role indexes
            "DROP INDEX IF EXISTS idx_role_active_deleted",
            "DROP INDEX IF EXISTS idx_role_status_lookup",
            # Notification index
            "DROP INDEX IF EXISTS idx_notification_support_tickets"
        ]

        for index_sql in indexes:
            log.info(f"Dropping index: {index_sql}")
            conn.execute(text(index_sql))

        trans.commit()
        log.info("[SUCCESS] All indexes removed successfully")

    except Exception as e:
        trans.rollback()
        log.error(f"[ERROR] Error dropping indexes: {e}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    print("\n" + "="*70)
    print("RUNNING VENDOR/USER/ROLE INDEX MIGRATION")
    print("="*70 + "\n")

    from app import create_app

    app = create_app()

    with app.app_context():
        try:
            upgrade()
            print("\n[SUCCESS] Migration completed successfully!")
            print("="*70 + "\n")
        except Exception as e:
            print(f"\n[ERROR] Migration failed: {e}")
            print("Please check the logs for details.")
            print("="*70 + "\n")
            raise
