import sys
sys.path.insert(0, '.')

from app import create_app
from models import db
from sqlalchemy import text

app = create_app()

with app.app_context():
    print("=" * 60)
    print("CHECKING FOR INTEGER user_id VALUES")
    print("=" * 60)

    # Find all projects where user_id is not a JSON array
    result = db.session.execute(text("""
        SELECT project_id, project_name, user_id, pg_typeof(user_id)
        FROM project
        WHERE user_id IS NOT NULL
        ORDER BY project_id
    """))

    print("\nAll projects with user_id:")
    print(f"{'ID':<8} {'Name':<30} {'user_id':<20} {'Type':<10}")
    print("-" * 70)

    needs_fix = []
    for row in result:
        print(f"{row[0]:<8} {row[1]:<30} {str(row[2]):<20} {row[3]:<10}")
        # Check if it's not already a list/array
        if not isinstance(row[2], list):
            needs_fix.append((row[0], row[2]))

    if needs_fix:
        print(f"\n[WARNING] Found {len(needs_fix)} projects with non-array user_id")
        print("\nFixing...")

        for project_id, user_id_val in needs_fix:
            # Convert to JSON array
            db.session.execute(text(f"""
                UPDATE project
                SET user_id = '[{user_id_val}]'::json
                WHERE project_id = {project_id}
            """))

        db.session.commit()
        print(f"[OK] Fixed {len(needs_fix)} projects")

        # Verify
        print("\nVerifying fix...")
        result = db.session.execute(text("""
            SELECT project_id, user_id
            FROM project
            WHERE user_id IS NOT NULL
            LIMIT 5
        """))
        for row in result:
            print(f"  Project {row[0]}: {row[1]}")
    else:
        print("\n[OK] All projects already have JSON array format")
