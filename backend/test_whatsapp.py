"""
Test WhatsApp with callback URL
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
TEST_PHONE = "918668186815"

print("=" * 60)
print("WHATSAPP TEST - Callback URL")
print("=" * 60)
print(f"API URL: {API_URL}")
print(f"API TOKEN: {API_TOKEN[:10]}...")
print(f"SOURCE: {SOURCE_NUMBER}")
print(f"PHONE_ID: {PHONE_ID}")
print(f"TEST TO: {TEST_PHONE}")
print("=" * 60)

headers = {
    'x-api-key': API_TOKEN,
    'Content-Type': 'application/json'
}

payload = {
    "id": str(uuid.uuid4()),
    "imType": "whatsapp",
    "source_number": SOURCE_NUMBER,
    "destination_number": TEST_PHONE,
    "contentType": "text",
    "text": "Hi Team, Just a friendly reminder about our meeting today at 11.30 regarding ECHT. See you there, Rajan",
    "channel_id": PHONE_ID
}

print(f"\nSending request...")
print(f"Payload: {payload}")

try:
    response = requests.post(API_URL, json=payload, headers=headers, timeout=30)

    print(f"\n✓ Status: {response.status_code}")
    print(f"✓ Response: {response.text}")

    if response.status_code == 200:
        response_data = response.json() if response.text else {}

        if response_data.get('code') == 'ok':
            print("\n✅ SUCCESS! Message sent (got 'ok' code)")
        elif not response_data or not response_data.get('error'):
            print("\n✅ SUCCESS! Message sent (empty response = success)")
        else:
            print(f"\n❌ FAILED: {response_data}")
    else:
        print(f"\n❌ HTTP Error: {response.status_code}")

except Exception as e:
    print(f"\n❌ Exception: {e}")

print("\n" + "=" * 60)
print("Check your phone for the test message!")
print("=" * 60)
