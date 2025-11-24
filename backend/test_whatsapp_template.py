"""
Test WhatsApp with approved template
"""
import requests
import uuid
import os
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv("ECHT_API_URL")
API_TOKEN = os.getenv("ECHT_API_TOKEN")
SOURCE_NUMBER = os.getenv("ECHT_SOURCE_NUMBER")
PHONE_ID = os.getenv("WHATSAPP_PHONE_ID")
TEST_PHONE = "918526454931"

print("=" * 60)
print("WHATSAPP TEMPLATE TEST")
print("=" * 60)
print(f"API URL: {API_URL}")
print(f"SOURCE: {SOURCE_NUMBER}")
print(f"TEST TO: {TEST_PHONE}")
print("=" * 60)

headers = {
    'x-api-key': API_TOKEN,
    'Content-Type': 'application/json'
}

# Try 1: Plain text with approved template content
payload1 = {
    "id": str(uuid.uuid4()),
    "imType": "whatsapp",
    "source_number": SOURCE_NUMBER,
    "destination_number": TEST_PHONE,
    "contentType": "text",
    "text": "Hi Team, Just a friendly reminder about our meeting today at 11.30 regarding ECHT. See you there, Rajan",
    "channel_id": PHONE_ID
}

print("\n[Test 1] Approved template text as plain message:")
print(f"Payload: {payload1}")

response = requests.post(API_URL, json=payload1, headers=headers, timeout=30)
print(f"Status: {response.status_code}")
print(f"Response: {response.text}")

# Try 2: Template format (if Echt.im uses template IDs)
payload2 = {
    "id": str(uuid.uuid4()),
    "imType": "whatsapp",
    "source_number": SOURCE_NUMBER,
    "destination_number": TEST_PHONE,
    "contentType": "template",
    "template": {
        "name": "test_echt_utility",
        "language": "en"
    },
    "channel_id": PHONE_ID
}

print("\n[Test 2] Using template ID:")
print(f"Payload: {payload2}")

response2 = requests.post(API_URL, json=payload2, headers=headers, timeout=30)
print(f"Status: {response2.status_code}")
print(f"Response: {response2.text}")

print("\n" + "=" * 60)
print("Check phone for message!")
print("=" * 60)
