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
                'X-API-KEY': self.api_token,
                'Content-Type': 'application/json'
            }

            # Echt.im API format (camelCase keys)
            payload = {
                'id': message_id,
                'imType': 'whatsapp',
                'sourceNumber': self.source_number,
                'destinationNumber': clean_phone,
                'contentType': 'text',
                'text': message,
                'channel_id': self.phone_id
            }

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

    def send_document(self, phone_number: str, document_url: str, filename: str, caption: str = None) -> dict:
        """
        Send a document via WhatsApp

        Args:
            phone_number: Recipient phone number
            document_url: Public URL of the document
            filename: Name of the file
            caption: Optional caption for the document

        Returns:
            dict: Response with success status
        """
        try:
            if not self.api_token:
                raise ValueError("WhatsApp configuration missing: ECHT_API_TOKEN not set")

            clean_phone = self._clean_phone_number(phone_number)
            message_id = str(uuid.uuid4())

            headers = {
                'X-API-KEY': self.api_token,
                'Content-Type': 'application/json'
            }

            # Ensure filename has .pdf extension
            if not filename.lower().endswith('.pdf'):
                filename = filename + '.pdf'

            # Echt.im API format for document
            # Remove .pdf extension for title display (WhatsApp shows filename as title)
            title_name = filename.replace('.pdf', '').replace('.PDF', '')

            payload = {
                'id': message_id,
                'imType': 'whatsapp',
                'sourceNumber': self.source_number,
                'destinationNumber': clean_phone,
                'contentType': 'document',
                'attachmentUrl': document_url,
                'attachmentName': filename,
                'fileName': filename,
                'documentFilename': filename,
                'title': title_name,
                'name': title_name,
                'caption': caption or filename,
                'channel_id': self.phone_id
            }

            response = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=30
            )

            if response.status_code == 200:
                response_data = response.json() if response.text else {}
                return {'success': True, 'message': 'Document sent successfully', 'response': response_data}
            else:
                return {'success': False, 'message': f'Failed to send document: {response.text}'}

        except Exception as e:
            log.error(f"Error sending document: {str(e)}")
            return {'success': False, 'message': str(e)}

    def send_purchase_order(self, phone_number: str, vendor_data: dict, purchase_data: dict,
                           buyer_data: dict, project_data: dict, pdf_url: str = None) -> dict:
        """
        Send a purchase order via WhatsApp with formatted details and optional PDF

        Args:
            phone_number: Vendor phone number
            vendor_data: Vendor information
            purchase_data: Purchase order details with materials
            buyer_data: Buyer/procurement contact info
            project_data: Project information
            pdf_url: Optional URL to LPO PDF document

        Returns:
            dict: Response with success status
        """
        # Message body - matching the exact format from design
        body_text = f"""Subject: *Purchase Order Confirmation - PO-{purchase_data.get('cr_id', 'N/A')}*

Dear *{vendor_data.get('company_name', 'Vendor')}*,

Attached is our New Local Purchase Order (LPO) document.

*We kindly request you to:*
• Confirm receipt and acceptance of the order.
• Provide the expected delivery timeline.

We appreciate your swift response.

Regards,
MeterSquare Interiors LLC
{buyer_data.get('phone', '')}

_MeterSquare Interiors LLC_"""

        log.info(f"=== SENDING PURCHASE ORDER via WhatsApp ===")
        log.info(f"Phone: {phone_number}")
        log.info(f"Vendor: {vendor_data.get('company_name')}")
        log.info(f"PDF URL: {pdf_url}")

        # First send the text message
        result = self.send_message(phone_number, body_text)

        if pdf_url and result.get('success'):
            whatsapp_filename = f"LPO-PO-{purchase_data.get('cr_id', 'N/A')}.pdf"
            whatsapp_caption = f"📄 Local Purchase Order - PO-{purchase_data.get('cr_id', 'N/A')}"
            pdf_result = self.send_document(
                phone_number=phone_number,
                document_url=pdf_url,
                filename=whatsapp_filename,
                caption=whatsapp_caption
            )
            if not pdf_result.get('success'):
                print(f"WARNING: Failed to send PDF: {pdf_result.get('message')}")
                # Still return success for text message
        else:
            print(f"WARNING: PDF NOT SENT! -- pdf_url: {pdf_url}")
        return result
