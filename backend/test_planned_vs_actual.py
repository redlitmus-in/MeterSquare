#!/usr/bin/env python3
"""
Test the planned-vs-actual endpoint
"""
from app import create_app
from controllers.boq_tracking_controller import get_boq_planned_vs_actual
import json

app = create_app()

with app.app_context():
    # Mock the g.user for authorization
    from flask import g
    class MockUser:
        def __init__(self):
            self.data = {'user_id': 72, 'role': 'Admin', 'username': 'Jitesh'}
        def get(self, key, default=None):
            return self.data.get(key, default)

    g.user = MockUser()

    print("=" * 80)
    print("TESTING /planned-vs-actual/843 ENDPOINT")
    print("=" * 80)

    # Call the controller function
    response = get_boq_planned_vs_actual(843)

    # Parse the response
    if hasattr(response, 'get_json'):
        data = response.get_json()
    else:
        data = response[0].get_json() if isinstance(response, tuple) else response

    print("\nResponse Status:", response[1] if isinstance(response, tuple) else 200)

    if 'error' in data:
        print("\n❌ ERROR:", data['error'])
    else:
        print("\n✅ SUCCESS")

        # Check labour data
        if 'data' in data and 'labour' in data['data']:
            labour_items = data['data']['labour']
            print(f"\nTotal labour items: {len(labour_items)}")

            # Check for test sub2 lab2
            for item in labour_items:
                if 'test sub2 lab2' in item.get('labour_role', ''):
                    print(f"\n  Labour Role: {item['labour_role']}")
                    print(f"    Planned Hours: {item['planned']['hours']}")
                    print(f"    Planned Total: ₹{item['planned']['total']}")
                    actual = item.get('actual')
                    if actual:
                        print(f"    Actual Hours: {actual['hours']}")
                        print(f"    Actual Total: ₹{actual['total']}")
                        print("    ✅ ACTUAL DATA FOUND!")
                    else:
                        print("    ⚠️  Actual is null (no locked attendance yet)")
                    break
