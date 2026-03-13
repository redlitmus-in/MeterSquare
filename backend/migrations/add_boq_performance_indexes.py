"""
Migration script to add performance indexes for BOQ queries
This fixes the N+1 query problem causing timeout issues
"""

from config.db import db
from app import create_app
from sqlalchemy import text

def add_boq_performance_indexes():
    """Add indexes to speed up BOQ queries"""
    try:
        app = create_app()

        with app.app_context():
            # Add indexes to fix N+1 query problem
            indexes_created = []

            # Index on boq_history.boq_id - Most critical for performance
            try:
                db.session.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_boq_history_boq_id
                    ON boq_history(boq_id);
                """))
                indexes_created.append("idx_boq_history_boq_id")
            except Exception as e:
                db.session.rollback()

            # Index on boq_history.boq_id with created_at for sorting
            try:
                db.session.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_boq_history_boq_id_created_at
                    ON boq_history(boq_id, created_at DESC);
                """))
                indexes_created.append("idx_boq_history_boq_id_created_at")
            except Exception as e:
                db.session.rollback()

            # Index on preliminary.project_id (optional, table may not exist)
            try:
                db.session.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_preliminary_project_id
                    ON preliminary(project_id)
                    WHERE is_deleted = false;
                """))
                indexes_created.append("idx_preliminary_project_id")
            except Exception as e:
                db.session.rollback()

            # Index on boq_details.boq_id
            try:
                db.session.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_boq_details_boq_id
                    ON boq_details(boq_id);
                """))
                indexes_created.append("idx_boq_details_boq_id")
            except Exception as e:
                db.session.rollback()

            # Index on boq.project_id and is_deleted for filtering
            try:
                db.session.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_boq_project_id_not_deleted
                    ON boq(project_id, is_deleted);
                """))
                indexes_created.append("idx_boq_project_id_not_deleted")
            except Exception as e:
                db.session.rollback()

            db.session.commit()

            for i, idx in enumerate(indexes_created, 1):
                pass

            return True

    except Exception as e:
        import traceback
        traceback.print_exc()
        return False

    return True

if __name__ == "__main__":

    success = add_boq_performance_indexes()

    if success:
        pass
    else:
        pass
