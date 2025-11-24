"""
Test Socket.IO notification emission
Run this while the Flask server is running to test if Socket.IO works
"""

import requests
import json

# Test notification data
test_notification = {
    "id": "test-123",
    "userId": 4,  # TD user from your debug log
    "type": "info",
    "title": "Test Socket.IO Notification",
    "message": "Testing real-time notification delivery",
    "priority": "high",
    "timestamp": "2025-11-22T12:00:00Z",
    "read": False
}

print("=" * 60)
print("SOCKET.IO NOTIFICATION TEST")
print("=" * 60)
print()

# Check if server is running
try:
    response = requests.get("http://127.0.0.1:5000/api/notifications/count",
                           headers={"Authorization": "Bearer test"},
                           timeout=2)
    print(f"Server Status: Running (Status Code: {response.status_code})")
except Exception as e:
    print(f"Server Status: NOT RUNNING - {e}")
    print("Please start the backend server first!")
    exit(1)

print()
print("To test Socket.IO emission:")
print("1. Open your frontend in browser and login as TD (user_id=4)")
print("2. Open browser console and look for Socket.IO connection messages")
print("3. Run this script to trigger a notification")
print()
print("Expected in browser console:")
print('  - "Connected to notification server"')
print('  - "Joined rooms: user_4, role_technical_director"')
print()
print("Press Enter when ready to test...")
input()

# Now test by creating a notification via API
# This won't work without proper auth, but demonstrates the flow
print("\nAttempting to trigger notification via backend...")
print(f"Target: User {test_notification['userId']}")
print(f"Title: {test_notification['title']}")
print()
print("Check your browser for real-time notification!")
