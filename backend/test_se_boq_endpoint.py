"""
Test SE BOQ vendor requests endpoint to see actual error
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from flask import g

# Create app
app = create_app()

with app.app_context():
    # Mock user context (TD user)
    g.user = {
        'user_id': 1,
        'role': 'TechnicalDirector',
        'email': 'td@test.com'
    }

    # Import and call the function directly
    from controllers.techical_director_controller import get_td_se_boq_vendor_requests

    print("Testing get_td_se_boq_vendor_requests()...")
    print("=" * 80)

    try:
        result = get_td_se_boq_vendor_requests()
        print("Success!")
        print(f"Result type: {type(result)}")
        if isinstance(result, tuple):
            print(f"Response: {result[0]}")
            print(f"Status code: {result[1]}")
            print(f"Response data: {result[0].get_json()}")
        else:
            print(f"Result: {result}")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        print("\nFull traceback:")
        traceback.print_exc()
