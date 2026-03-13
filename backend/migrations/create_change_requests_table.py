"""
Migration script to create change_requests table
Run this script to add the change request functionality to your database
"""

from config.db import db
from models.change_request import ChangeRequest
from models.boq import BOQ
from models.project import Project
from models.user import User
from app import create_app

def create_change_requests_table():
    """Create change_requests table in database"""
    try:
        app = create_app()

        with app.app_context():
            # Create only the change_requests table
            db.create_all()


    except Exception as e:
        import traceback
        traceback.print_exc()
        return False

    return True

if __name__ == "__main__":

    success = create_change_requests_table()

    if success:
        pass
    else:
        pass
