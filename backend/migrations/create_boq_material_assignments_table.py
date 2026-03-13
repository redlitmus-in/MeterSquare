"""
Migration script to create boq_material_assignments table
Run this script to add the BOQ material assignment functionality to your database
"""

import sys
import os

# Add backend directory to Python path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from config.db import db
from models.boq_material_assignment import BOQMaterialAssignment
from models.boq import BOQ
from models.project import Project
from models.vendor import Vendor
from app import create_app


def create_boq_material_assignments_table():
    """Create boq_material_assignments table in database"""
    try:
        app = create_app()

        with app.app_context():
            # Create only the boq_material_assignments table
            db.create_all()


    except Exception as e:
        import traceback
        traceback.print_exc()
        return False

    return True


if __name__ == "__main__":

    success = create_boq_material_assignments_table()

    if success:
        pass
    else:
        pass
