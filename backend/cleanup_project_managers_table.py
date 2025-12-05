import sys
sys.path.insert(0, '.')

from app import create_app
from models import db
from sqlalchemy import text

app = create_app()

with app.app_context():
    print("=" * 60)
    print("REMOVING UNUSED project_managers TABLE")
    print("=" * 60)

    try:
        db.session.execute(text("DROP TABLE IF EXISTS project_managers CASCADE"))
        db.session.commit()
        print("\n[OK] project_managers table removed successfully")
        print("\nMultiple PMs are now stored in project.user_id as JSON array")
    except Exception as e:
        print(f"\n[ERROR] Failed to remove table: {e}")
        db.session.rollback()
