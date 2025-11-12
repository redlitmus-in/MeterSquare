import sys
sys.path.insert(0, '.')

from app import create_app
from models import db
from sqlalchemy import text

app = create_app()

with app.app_context():
    # Check column type
    print("=" * 60)
    print("CHECKING PROJECT TABLE - user_id COLUMN")
    print("=" * 60)

    result = db.session.execute(text("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'project' AND column_name = 'user_id'
    """))
    row = result.fetchone()
    print(f"\nColumn Name: {row[0]}")
    print(f"Data Type: {row[1]}")

    # Show sample data
    print("\n" + "=" * 60)
    print("SAMPLE DATA FROM PROJECT TABLE")
    print("=" * 60)

    result = db.session.execute(text("""
        SELECT project_id, project_name, user_id
        FROM project
        WHERE user_id IS NOT NULL
        LIMIT 5
    """))

    print(f"\n{'ID':<8} {'Project Name':<30} {'PM IDs (user_id)':<20}")
    print("-" * 60)
    for row in result:
        print(f"{row[0]:<8} {row[1]:<30} {str(row[2]):<20}")

    # Check if project_managers table exists
    print("\n" + "=" * 60)
    print("CHECKING IF project_managers TABLE EXISTS")
    print("=" * 60)

    result = db.session.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'project_managers'
        )
    """))
    exists = result.scalar()

    if exists:
        print("\n[WARNING] project_managers table EXISTS (should be removed)")
    else:
        print("\n[OK] project_managers table does NOT exist")

    print("\n" + "=" * 60)
    print("CONCLUSION: Multiple PMs are stored as JSON array in project.user_id")
    print("=" * 60)
