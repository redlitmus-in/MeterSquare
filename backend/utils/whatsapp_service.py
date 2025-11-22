"""
WhatsApp Service - Send messages via Echt.im WhatsApp Business API
"""
import os
import uuid
import requests
from config.logging import get_logger

log = get_logger()

# Echt.im WhatsApp configuration
ECHT_API_URL = os.getenv("ECHT_API_URL", "https://echt.im/api/v1/message")
ECHT_API_TOKEN = os.getenv("ECHT_API_TOKEN")
ECHT_SOURCE_NUMBER = os.getenv("ECHT_SOURCE_NUMBER")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID")


class WhatsAppService:
    """Service for sending WhatsApp messages via Echt.im API"""

    def __init__(self):
        self.api_url = ECHT_API_URL
        self.api_token = ECHT_API_TOKEN
        self.source_number = ECHT_SOURCE_NUMBER
        self.phone_id = WHATSAPP_PHONE_ID

    def _clean_phone_number(self, phone_number: str) -> str:
        """Clean and format phone number with country code"""
        # Remove all non-digit characters (spaces, +, -, etc.)
        clean_phone = ''.join(filter(str.isdigit, str(phone_number)))
        log.info(f"Phone number cleaning: '{phone_number}' -> '{clean_phone}'")

        # Remove duplicate country code if present
        if clean_phone.startswith('9191') and len(clean_phone) == 14:
            clean_phone = clean_phone[2:]  # Remove first "91"
            log.info(f"Removed duplicate country code: '{clean_phone}'")

        # Ensure phone has country code (assume India if 10 digits)
        if len(clean_phone) == 10:
            clean_phone = '91' + clean_phone
            log.info(f"Added India country code: '{clean_phone}'")

        return clean_phone

    def send_message(self, phone_number: str, message: str) -> dict:
        """
        Send a simple text WhatsApp message

        Args:
            phone_number: Recipient phone number (with country code)
            message: Text message to send

        Returns:
            dict: Response with success status and message
        """
        try:
            if not self.api_token:
                raise ValueError("WhatsApp configuration missing: ECHT_API_TOKEN not set")
            if not self.source_number:
                raise ValueError("WhatsApp configuration missing: ECHT_SOURCE_NUMBER not set")

            clean_phone = self._clean_phone_number(phone_number)
            message_id = str(uuid.uuid4())

            headers = {
                'x-api-key': self.api_token,
                'Content-Type': 'application/json'
            }

            # Echt.im API format
            payload = {
                'id': message_id,
                'imType': 'whatsapp',
                'source_number': self.source_number,
                'destination_number': clean_phone,
                'contentType': 'text',
                'text': message
            }

            # Add phone_id/channel_id if available
            if self.phone_id:
                payload['channel_id'] = self.phone_id

            log.info(f"=== ECHT.IM WHATSAPP API CALL ===")
            log.info(f"URL: {self.api_url}")
            log.info(f"Message ID: {message_id}")
            log.info(f"Source: {self.source_number}")
            log.info(f"Destination: {clean_phone}")

            response = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=30
            )

            log.info(f"Response status: {response.status_code}")
            log.info(f"Response body: {response.text}")

            response_data = response.json() if response.text else {}

            # Check for success
            # - Standard API: {"id": "...", "code": "ok"}
            # - Callback URL: 200 status with empty {} response
            is_success = (
                response.status_code == 200 and
                (response_data.get('code') == 'ok' or not response_data or not response_data.get('error'))
            )

            if is_success:
                log.info(f"WhatsApp message sent successfully to {clean_phone}")
                return {
                    'success': True,
                    'message': 'WhatsApp message sent successfully',
                    'response': response_data
                }
            else:
                error_msg = response_data.get('error') or response_data.get('message') or response.text
                log.error(f"WhatsApp API error: {error_msg}")
                return {
                    'success': False,
                    'message': f'WhatsApp API error: {error_msg}',
                    'debug': {
                        'api_url': self.api_url,
                        'status_code': response.status_code,
                        'request_payload': payload,
                        'response': response_data,
                        'source_number': self.source_number,
                        'phone_id': self.phone_id,
                        'api_token': f"{self.api_token[:10]}..." if self.api_token else None
                    }
                }

        except requests.exceptions.Timeout:
            log.error("WhatsApp API timeout")
            return {'success': False, 'message': 'WhatsApp API request timed out'}
        except requests.exceptions.RequestException as e:
            log.error(f"WhatsApp API request error: {str(e)}")
            return {'success': False, 'message': f'WhatsApp API request failed: {str(e)}'}
        except Exception as e:
            log.error(f"WhatsApp service error: {str(e)}")
            return {'success': False, 'message': f'Failed to send WhatsApp message: {str(e)}'}

    def send_interactive_message(self, phone_number: str, body_text: str, buttons: list, header: str = None, footer: str = None) -> dict:
        """
        Send an interactive WhatsApp message with buttons

        Args:
            phone_number: Recipient phone number
            body_text: Main message body
            buttons: List of button dicts [{"id": "btn1", "title": "Button Text"}]
            header: Optional header text
            footer: Optional footer text

        Returns:
            dict: Response with success status
        """
        try:
            if not self.api_token:
                raise ValueError("WhatsApp configuration missing: ECHT_API_TOKEN not set")

            clean_phone = self._clean_phone_number(phone_number)

            headers = {
                'x-api-key': self.api_token,
                'Content-Type': 'application/json'
            }

            # Build interactive message payload
            interactive = {
                'type': 'button',
                'body': {'text': body_text},
                'action': {
                    'buttons': [
                        {'type': 'reply', 'reply': {'id': btn['id'], 'title': btn['title'][:20]}}  # Max 20 chars
                        for btn in buttons[:3]  # Max 3 buttons
                    ]
                }
            }

            if header:
                interactive['header'] = {'type': 'text', 'text': header}
            if footer:
                interactive['footer'] = {'text': footer}

            payload = {
                'source': self.source_number,
                'destination': clean_phone,
                'type': 'interactive',
                'interactive': interactive
            }

            log.info(f"Sending WhatsApp interactive message to {clean_phone}")

            response = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=30
            )

            if response.status_code in [200, 201]:
                log.info(f"WhatsApp interactive message sent successfully to {clean_phone}")
                return {
                    'success': True,
                    'message': 'WhatsApp message sent successfully',
                    'response': response.json() if response.text else {}
                }
            else:
                # If interactive fails, fallback to text message
                log.warning(f"Interactive message failed, falling back to text: {response.text}")
                return self.send_message(phone_number, body_text)

        except Exception as e:
            log.error(f"WhatsApp interactive error: {str(e)}")
            # Fallback to simple text
            return self.send_message(phone_number, body_text)

    def send_purchase_order(self, phone_number: str, vendor_data: dict, purchase_data: dict,
                           buyer_data: dict, project_data: dict) -> dict:
        """
        Send a purchase order via WhatsApp with formatted details and buttons

        Args:
            phone_number: Vendor phone number
            vendor_data: Vendor information
            purchase_data: Purchase order details with materials
            buyer_data: Buyer/procurement contact info
            project_data: Project information

        Returns:
            dict: Response with success status
        """
        # Build materials list
        materials = purchase_data.get('materials', [])
        materials_text = ""
        for idx, material in enumerate(materials, 1):
            mat_line = f"{idx}. {material.get('material_name', 'N/A')}"
            if material.get('brand'):
                mat_line += f" ({material.get('brand')})"
            mat_line += f" - {material.get('quantity', 0)} {material.get('unit', '')}"
            materials_text += mat_line + "\n"

        # Message body
        body_text = f"""*PURCHASE ORDER*
━━━━━━━━━━━━━━━━━━━━

📋 *PO Number:* CR-{purchase_data.get('cr_id', 'N/A')}
📅 *Date:* {purchase_data.get('date', 'N/A')}

🏢 *Vendor:* {vendor_data.get('company_name', 'N/A')}
📍 *Location:* {project_data.get('location', 'N/A')}

━━━━━━━━━━━━━━━━━━━━
📦 *MATERIALS REQUIRED:*
━━━━━━━━━━━━━━━━━━━━
{materials_text}
*Total Items:* {len(materials)}

━━━━━━━━━━━━━━━━━━━━
👤 *Contact Person:*
{buyer_data.get('name', 'N/A')}
📧 {buyer_data.get('email', 'N/A')}
📞 {buyer_data.get('phone', 'N/A')}

━━━━━━━━━━━━━━━━━━━━
Please confirm receipt and provide delivery timeline.

_MeterSquare Interiors LLC_"""

        log.info(f"=== SENDING PURCHASE ORDER via WhatsApp ===")
        log.info(f"Phone: {phone_number}")
        log.info(f"Vendor: {vendor_data.get('company_name')}")
        log.info(f"Materials count: {len(materials)}")

        # Send as simple text message (more reliable than interactive)
        result = self.send_message(phone_number, body_text)

        log.info(f"WhatsApp send result: {result}")
        return result

    def generate_purchase_order_message(self, vendor_data: dict, purchase_data: dict,
                                        buyer_data: dict, project_data: dict) -> str:
        """
        Generate a formatted purchase order message (for backward compatibility)
        """
        materials = purchase_data.get('materials', [])
        materials_text = ""
        for idx, material in enumerate(materials, 1):
            materials_text += f"\n{idx}. {material.get('material_name', 'N/A')}"
            if material.get('brand'):
                materials_text += f" - {material.get('brand')}"
            materials_text += f" - Qty: {material.get('quantity', 0)} {material.get('unit', '')}"

        return f"""*PURCHASE ORDER - MeterSquare Interiors*

*PO Number:* CR-{purchase_data.get('cr_id', 'N/A')}
*Date:* {purchase_data.get('date', 'N/A')}

*Vendor:* {vendor_data.get('company_name', 'N/A')}
*Location:* {project_data.get('location', 'N/A')}

*Materials Required:*{materials_text}

*Total Items:* {len(materials)}

*Contact Person:*
{buyer_data.get('name', 'N/A')}
Email: {buyer_data.get('email', 'N/A')}
Phone: {buyer_data.get('phone', 'N/A')}

Please confirm receipt and provide delivery timeline.

Thank you,
MeterSquare Interiors LLC"""
