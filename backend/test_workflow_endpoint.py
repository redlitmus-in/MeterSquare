#!/usr/bin/env python3
"""
Test the labour workflow endpoint directly
"""
from app import create_app
from controllers.boq_tracking_controller import get_labour_workflow_details
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
    print("TESTING /labour_workflow/843 ENDPOINT")
    print("=" * 80)

    # Call the controller function
    response = get_labour_workflow_details(843)

    # Parse the response
    if hasattr(response, 'get_json'):
        data = response.get_json()
    else:
        data = response[0].get_json() if isinstance(response, tuple) else response

    print("\nResponse Status:", response[1] if isinstance(response, tuple) else 200)
    print("\nResponse Data:")
    print(json.dumps(data, indent=2, default=str))

    # Check key metrics
    if 'data' in data:
        workflow_data = data['data']
        print("\n" + "=" * 80)
        print("KEY METRICS:")
        print("=" * 80)
        print(f"BOQ Name: {workflow_data.get('boq_name')}")
        print(f"Total Requisitions: {workflow_data.get('total_requisitions')}")
        print(f"Labour Workflow Items: {len(workflow_data.get('labour_workflow', []))}")

        if workflow_data.get('labour_workflow'):
            print("\nRequisition Details:")
            for req in workflow_data['labour_workflow']:
                print(f"\n  Requisition: {req['requisition_code']}")
                print(f"    Status: {req['status']}")
                print(f"    Skill: {req.get('skill_required')}")
                print(f"    Total Hours: {req.get('total_hours_worked')}")
                print(f"    Total Cost: {req.get('total_cost')}")
                print(f"    Assignments: {len(req.get('assignments', []))}")
                print(f"    Lock Status: {req.get('overall_lock_status')}")
