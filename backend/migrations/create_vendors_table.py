"""
Migration script to create vendors and vendor_products tables
Run this script to create the vendor management tables
"""

from config.db import db
from sqlalchemy import text
from app import create_app
import sys


def create_vendors_tables():
    """Create vendors and vendor_products tables"""
    try:
        app = create_app()

        with app.app_context():
            print("Connected to database successfully")

            # Create vendors table
            create_vendors_table_query = """
            CREATE TABLE IF NOT EXISTS vendors (
                vendor_id INT AUTO_INCREMENT PRIMARY KEY,
                company_name VARCHAR(255) NOT NULL,
                contact_person_name VARCHAR(255),
                email VARCHAR(255) NOT NULL UNIQUE,
                phone_code VARCHAR(10),
                phone VARCHAR(20),
                street_address TEXT,
                city VARCHAR(100),
                state VARCHAR(100),
                country VARCHAR(100) DEFAULT 'UAE',
                pin_code VARCHAR(20),
                gst_number VARCHAR(50),
                category VARCHAR(100),
                status ENUM('active', 'inactive') DEFAULT 'active',
                is_deleted BOOLEAN DEFAULT FALSE,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                last_modified_by INT,
                FOREIGN KEY (created_by) REFERENCES users(user_id),
                FOREIGN KEY (last_modified_by) REFERENCES users(user_id),
                INDEX idx_email (email),
                INDEX idx_category (category),
                INDEX idx_status (status),
                INDEX idx_created_by (created_by),
                INDEX idx_is_deleted (is_deleted)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """

            db.session.execute(text(create_vendors_table_query))
            print("✓ Vendors table created successfully")

            # Create vendor_products table
            create_vendor_products_table_query = """
            CREATE TABLE IF NOT EXISTS vendor_products (
                product_id INT AUTO_INCREMENT PRIMARY KEY,
                vendor_id INT NOT NULL,
                product_name VARCHAR(255) NOT NULL,
                category VARCHAR(100),
                description TEXT,
                unit VARCHAR(50),
                unit_price DECIMAL(15, 2),
                is_deleted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id) ON DELETE CASCADE,
                INDEX idx_vendor_id (vendor_id),
                INDEX idx_category (category),
                INDEX idx_is_deleted (is_deleted)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """

            db.session.execute(text(create_vendor_products_table_query))
            print("✓ Vendor products table created successfully")

            # Commit changes
            db.session.commit()
            print("\n✓ All vendor tables created successfully!")

            return True

    except Exception as e:
        print(f"✗ Error creating vendor tables: {e}")
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("="*80)
    print("Creating Vendor Management Tables")
    print("="*80)
    print()

    success = create_vendors_tables()

    if success:
        print("\n" + "="*80)
        print("Migration completed successfully!")
        print("="*80)
    else:
        print("\n" + "="*80)
        print("Migration failed!")
        print("="*80)
        sys.exit(1)
