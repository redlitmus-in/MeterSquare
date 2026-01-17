#!/usr/bin/env python3
"""
Test to see actual labour data in API response
"""
from app import create_app
from controllers.boq_tracking_controller import get_boq_planned_vs_actual
import json

app = create_app()

with app.app_context():
    from flask import g
    class MockUser:
        def __init__(self):
            self.data = {'user_id': 72, 'role': 'Admin', 'username': 'Jitesh'}
        def get(self, key, default=None):
            return self.data.get(key, default)

    g.user = MockUser()

    response = get_boq_planned_vs_actual(843)
    data = response[0].get_json() if isinstance(response, tuple) else response.get_json()

    if 'data' in data and 'labour' in data['data']:
        labour_items = data['data']['labour']
        print(f"Total labour items in response: {len(labour_items)}\n")

        for item in labour_items[:5]:  # Show first 5
            print(f"Labour Role: {item['labour_role']}")
            print(f"  Planned: {item['planned']['hours']}h @ ₹{item['planned']['rate_per_hour']} = ₹{item['planned']['total']}")
            actual = item.get('actual')
            if actual:
                print(f"  Actual: {actual['hours']}h @ ₹{actual['rate_per_hour']} = ₹{actual['total']}")
                print("  ✅ HAS ACTUAL DATA")
            else:
                print(f"  Actual: null")
                print("  ❌ NO ACTUAL DATA (no locked attendance)")
            print()
