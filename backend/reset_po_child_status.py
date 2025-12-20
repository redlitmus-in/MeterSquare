"""
Script to reset a PO Child status back to vendor_approved for testing
"""
import psycopg2
import os
import sys

def reset_po_child_status(po_child_id):
    """Reset PO Child status to vendor_approved"""

    conn = None
    try:
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()

        print(f"\n{'='*60}")
        print(f"RESETTING PO CHILD #{po_child_id} STATUS")
        print(f"{'='*60}\n")

        # Check current status
        cursor.execute("""
            SELECT id, status, delivery_routing, store_request_status
            FROM po_child
            WHERE id = %s
        """, (po_child_id,))

        result = cursor.fetchone()
        if not result:
            print(f"❌ PO Child #{po_child_id} not found!")
            return

        current_status = result[1]
        print(f"Current status: {current_status}")
        print(f"Current delivery_routing: {result[2]}")
        print(f"Current store_request_status: {result[3]}")

        # Reset to vendor_approved
        cursor.execute("""
            UPDATE po_child
            SET
                status = 'vendor_approved',
                delivery_routing = 'direct_to_site',
                store_request_status = NULL,
                purchase_completed_by_user_id = NULL,
                purchase_completed_by_name = NULL,
                purchase_completion_date = NULL
            WHERE id = %s
        """, (po_child_id,))

        print(f"\n✅ PO Child #{po_child_id} reset to 'vendor_approved'")
        print(f"   You can now test 'Complete & Send to Store' again!\n")
        print(f"{'='*60}\n")

        cursor.close()

    except Exception as e:
        print(f"\n❌ FAILED: {str(e)}\n")
        raise

    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    # Reset PO Child ID 34 (PO-16.4)
    # To reset a different PO Child, change the ID below
    po_child_id = 34

    if len(sys.argv) > 1:
        po_child_id = int(sys.argv[1])

    reset_po_child_status(po_child_id)
