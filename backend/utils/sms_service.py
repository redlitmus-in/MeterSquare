"""
SMS service for sending OTP via tuitone.com API
"""
import requests
import random
from datetime import datetime, timedelta
from config.logging import get_logger
import os

log = get_logger()

# Tuitone SMS API configuration
SMS_API_URL = "https://tuitone.com/api/sms"
SMS_ACCESS_TOKEN = "9187941f-64b7-4a2b-baff-85df46a9d583"
SMS_CALLER_ID = "MeterSq"  # Sender ID (max 11 chars)

ENVIRONMENT = os.environ.get("ENVIRONMENT")

# OTP storage for phone (shared with authentication.py)
from utils.authentication import otp_storage


def send_sms_otp(phone_number):
    """
    Send OTP via SMS using tuitone.com API

    Args:
        phone_number: The phone number to send OTP to (with country code)

    Returns:
        OTP if successful, None if failed
    """
    try:
        # Generate 6-digit OTP
        otp = random.randint(100000, 999999)

        # Clean phone number for consistent storage key
        clean_phone = ''.join(filter(str.isdigit, str(phone_number)))

        # Store OTP in memory with cleaned phone number as key
        # Prefix phone with 'phone:' to distinguish from email
        storage_key = f"phone:{clean_phone}"
        otp_storage[storage_key] = {
            "otp": otp,
            "expires_at": (datetime.utcnow() + timedelta(seconds=300)).timestamp()
        }
        log.info(f"OTP stored with key: {storage_key}")

        # Prepare SMS message
        message = f"Your MeterSquare verification code is: {otp}. Valid for 5 minutes. Do not share this code."

        # Prepare API request
        headers = {
            "Authorization": f"Bearer {SMS_ACCESS_TOKEN}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        payload = {
            "callerId": SMS_CALLER_ID,
            "number": phone_number,
            "message": message
        }

        log.info(f"Sending SMS OTP to {phone_number}")

        # Send SMS via API
        response = requests.post(SMS_API_URL, json=payload, headers=headers, timeout=30)
        response_data = response.json()

        # Check for errors
        if "error" in response_data:
            log.error(f"SMS API error: {response_data['error']}")
            # Still return OTP for dev testing even if SMS fails
            if ENVIRONMENT != 'production':
                log.warning(f"SMS send failed but returning OTP for dev environment: {otp}")
                return otp
            return None

        log.info(f"SMS OTP sent successfully to {phone_number}")
        return otp

    except requests.exceptions.RequestException as e:
        log.error(f"SMS API request error: {e}")
        # Return OTP for dev testing even if API fails
        if ENVIRONMENT != 'production':
            log.warning(f"SMS API failed but returning OTP for dev environment")
            return otp
        return None
    except Exception as e:
        log.error(f"Error sending SMS OTP: {e}")
        return None


def verify_sms_otp(phone_number, otp_input):
    """
    Verify OTP sent via SMS

    Args:
        phone_number: The phone number OTP was sent to
        otp_input: The OTP entered by user

    Returns:
        tuple: (success: bool, error_message: str or None)
    """
    try:
        storage_key = f"phone:{phone_number}"

        # Get OTP data from storage
        otp_data = otp_storage.get(storage_key)
        if not otp_data:
            return False, "OTP not found or expired"

        stored_otp = otp_data.get("otp")
        expires_at = datetime.fromtimestamp(otp_data.get("expires_at"))

        # Check expiry
        if datetime.utcnow() > expires_at:
            del otp_storage[storage_key]
            return False, "OTP expired"

        # Check if OTP matches
        if int(otp_input) != stored_otp:
            return False, "Invalid OTP"

        # OTP verified, remove from storage
        del otp_storage[storage_key]
        return True, None

    except ValueError:
        return False, "OTP must be a number"
    except Exception as e:
        log.error(f"Error verifying SMS OTP: {e}")
        return False, "Verification failed"
