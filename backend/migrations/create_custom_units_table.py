"""
Migration script to create custom_units table
Run this script to add custom unit functionality to your database
"""

import sys
import os
# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from models.boq import CustomUnit
from app import create_app

def create_custom_units_table():
    """Create custom_units table in database"""
    try:
        app = create_app()

        with app.app_context():
            # Create only the custom_units table
            db.create_all()


    except Exception as e:
        import traceback
        traceback.print_exc()
        return False

    return True

if __name__ == "__main__":

    success = create_custom_units_table()

    if success:
        pass
    else:
        pass
