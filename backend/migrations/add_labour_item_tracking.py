"""
Migration: Add BOQ labour item tracking fields to labour_requisitions table
This allows tracking which BOQ labour items have requisitions created for them.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from flask import Flask
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)


def run_migration():
    """Add BOQ labour item reference columns to labour_requisitions"""

    with app.app_context():
        # Check if columns already exist
        check_sql = """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'labour_requisitions'
        AND column_name IN ('boq_id', 'item_id', 'labour_id', 'work_status');
        """
        result = db.session.execute(db.text(check_sql))
        existing_columns = {row[0] for row in result}

        columns_to_add = []

        # Add boq_id column to reference the BOQ
        if 'boq_id' not in existing_columns:
            columns_to_add.append("""
                ALTER TABLE labour_requisitions
                ADD COLUMN boq_id INTEGER REFERENCES boq(boq_id);
            """)
            columns_to_add.append("""
                CREATE INDEX IF NOT EXISTS idx_labour_req_boq_id ON labour_requisitions(boq_id);
            """)

        # Add item_id to reference the BOQ item (string as it can be 'item_1_1' format)
        if 'item_id' not in existing_columns:
            columns_to_add.append("""
                ALTER TABLE labour_requisitions
                ADD COLUMN item_id VARCHAR(100);
            """)
            columns_to_add.append("""
                CREATE INDEX IF NOT EXISTS idx_labour_req_item_id ON labour_requisitions(item_id);
            """)

        # Add labour_id to reference the specific labour item
        if 'labour_id' not in existing_columns:
            columns_to_add.append("""
                ALTER TABLE labour_requisitions
                ADD COLUMN labour_id VARCHAR(100);
            """)
            columns_to_add.append("""
                CREATE INDEX IF NOT EXISTS idx_labour_req_labour_id ON labour_requisitions(labour_id);
            """)

        # Add work_status to track completion (pending_assignment, assigned, in_progress, completed)
        if 'work_status' not in existing_columns:
            columns_to_add.append("""
                ALTER TABLE labour_requisitions
                ADD COLUMN work_status VARCHAR(50) DEFAULT 'pending_assignment';
            """)
            columns_to_add.append("""
                CREATE INDEX IF NOT EXISTS idx_labour_req_work_status ON labour_requisitions(work_status);
            """)

        if not columns_to_add:
            print("All columns already exist. No migration needed.")
            return

        # Execute migrations
        for sql in columns_to_add:
            try:
                db.session.execute(db.text(sql.strip()))
                print(f"Executed: {sql.strip()[:60]}...")
            except Exception as e:
                print(f"Error executing SQL: {e}")
                db.session.rollback()
                raise

        db.session.commit()
        print("\n✅ Migration completed successfully!")
        print("Added columns: boq_id, item_id, labour_id, work_status")


if __name__ == '__main__':
    run_migration()
