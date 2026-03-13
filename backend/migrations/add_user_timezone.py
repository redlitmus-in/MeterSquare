"""
Migration: Add timezone column to users table
Run once on the server database.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

def upgrade():
    app = create_app()
    with app.app_context():
        db.session.execute(db.text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT NULL;
        """))
        db.session.commit()

def downgrade():
    app = create_app()
    with app.app_context():
        db.session.execute(db.text("""
            ALTER TABLE users DROP COLUMN IF EXISTS timezone;
        """))
        db.session.commit()

if __name__ == '__main__':
    upgrade()
