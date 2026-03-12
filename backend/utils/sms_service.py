"""
SMS service for sending OTP via tuitone.com API
"""
import requests
import secrets
from datetime import datetime, timedelta
from config.logging import get_logger
import os

log = get_logger()

# Tuitone SMS API configuration
SMS_API_URL = "https://tuitone.com/api/sms"
SMS_ACCESS_TOKEN = os.environ.get("SMS_ACCESS_TOKEN")
SMS_CALLER_ID = os.environ.get("SMS_CALLER_ID", "MeterSq")  # Sender ID (max 11 chars)

if not SMS_ACCESS_TOKEN:
    log.warning("SMS_ACCESS_TOKEN not set in environment variables - SMS functionality will be disabled")

ENVIRONMENT = os.environ.get("ENVIRONMENT")

# OTP storage is managed by controllers via authentication._otp_set / _otp_pop


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
        otp = 100000 + secrets.randbelow(900000)

        # If SMS token is not configured, skip API call and return OTP for local testing
        if not SMS_ACCESS_TOKEN:
            log.warning(f"SMS_ACCESS_TOKEN not configured — SMS skipped for {phone_number}. OTP returned to caller.")
            return otp

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
                log.warning(f"SMS send failed but returning OTP for dev environment")
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



# Note: OTP verification for SMS login is handled directly in
# auth_controller.py verify_sms_otp_login() using _otp_pop().
