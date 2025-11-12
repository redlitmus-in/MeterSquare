import sys
import json
sys.path.insert(0, '.')

from app import create_app
from models import db
from sqlalchemy import text

app = create_app()

with app.app_context():
    print("Testing JSON query...")

    # Check sample data
    result = db.session.execute(text('SELECT project_id, user_id FROM project WHERE user_id IS NOT NULL LIMIT 5'))
    print("\nSample data:")
    for row in result:
        print(f"  Project {row[0]}: user_id = {row[1]}")

    # Test the query
    print("\nTesting contains query for PM ID 5...")
    result2 = db.session.execute(
        text('SELECT project_id FROM project WHERE user_id::jsonb @> CAST(:pm_id AS jsonb)'),
        {'pm_id': json.dumps([5])}
    )
    projects = [row[0] for row in result2]
    print(f"Found {len(projects)} projects: {projects}")

    print("\n[OK] Query works!")
