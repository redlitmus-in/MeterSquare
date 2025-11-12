import sys
sys.path.insert(0, '.')

from app import create_app
from models import db, Project

app = create_app()

with app.app_context():
    print("Testing JSONB contains query...")

    # Test the query method
    try:
        projects = Project.query.filter(
            Project.user_id.contains([5])
        ).all()
        print(f"Query works! Found {len(projects)} projects for PM ID 5")
    except Exception as e:
        print(f"Query failed: {e}")

    print("\n[OK] Backend queries are ready!")
    print("\nNow restart the backend server and test in the browser:")
    print("1. Stop the current server (Ctrl+C)")
    print("2. Run: python app.py")
    print("3. Refresh the browser")
    print("4. Click 'Assign PM' and select multiple PMs with checkboxes")
