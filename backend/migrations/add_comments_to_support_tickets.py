"""
Migration to add comments column to support_tickets table
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

def run_migration():
    app = create_app()
    with app.app_context():
        try:
            # Add comments column if it doesn't exist
            db.session.execute(db.text("""
                ALTER TABLE support_tickets 
                ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
            """))
            db.session.commit()
            print("Successfully added 'comments' column to support_tickets table")
        except Exception as e:
            db.session.rollback()
            print(f"Error: {str(e)}")
            # Try alternative approach
            try:
                db.session.execute(db.text("""
                    DO $$ 
                    BEGIN 
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name='support_tickets' AND column_name='comments'
                        ) THEN 
                            ALTER TABLE support_tickets ADD COLUMN comments JSONB DEFAULT '[]'::jsonb;
                        END IF;
                    END $$;
                """))
                db.session.commit()
                print("Successfully added 'comments' column (alternative method)")
            except Exception as e2:
                print(f"Alternative method also failed: {str(e2)}")

if __name__ == '__main__':
    run_migration()
