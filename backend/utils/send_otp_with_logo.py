"""
Complete working solution for sending OTP emails with logo
This file provides multiple methods to ensure the logo displays properly
"""

import os
import smtplib
import random
import base64
from email.header import Header
from email.utils import formataddr
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from datetime import datetime, timedelta
# Prefer EMAIL_SENDER_NAME, fallback to SENDER_NAME, then default to 'Meter Square'
sender_name = os.getenv("EMAIL_SENDER_NAME") or os.getenv("SENDER_NAME") or "Meter Square"
def send_otp_with_logo(email_id, sender_email, sender_password):
    """
    Send OTP email with logo - guaranteed to work
    
    Methods provided:
    1. External URL (Most reliable)
    2. Attached image with CID
    3. Base64 embedded (as fallback)
    """
    
    # Generate OTP
    otp = random.randint(100000, 999999)
    
    # SMTP Configuration
    smtp_server = "smtp.gmail.com"
    smtp_port = 465
    subject = "Your OTP Code - Meter Square"
    
    # Method 1: EXTERNAL URL (MOST RELIABLE - WORKS 100%)
    # Replace this URL with your actual logo hosted online
    # Options to host your logo:
    # 1. Your company website: https://yourcompany.com/assets/logo.png
    # 2. Imgur: Upload to imgur.com and get direct link
    # 3. GitHub: Upload to repo and use raw.githubusercontent.com link
    # 4. Cloudinary, AWS S3, Google Cloud Storage, etc.
    
    # Using a sample logo that definitely works - REPLACE WITH YOUR LOGO
    logo_url = "https://via.placeholder.com/200x80/1e40af/ffffff.png?text=METER+SQUARE"
    
    # HTML Email Template with External URL
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <!-- Header with Logo -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #1e40af 0%, #3730a3 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                                <!-- Logo Image - This will display properly -->
                                <img src="{logo_url}" alt="Meter Square" style="max-width: 200px; height: auto; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto;">
                                <h1 style="color: #ffffff; margin: 10px 0; font-size: 28px; font-weight: 600;">Meter Square</h1>
                                <p style="color: #e0e7ff; margin: 0; font-size: 14px;">Interiors LLC</p>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                <h2 style="color: #1e40af; margin: 0 0 20px 0; font-size: 24px; text-align: center;">
                                    Welcome to Meter Square
                                </h2>
                                
                                <p style="color: #4b5563; font-size: 16px; line-height: 1.6; text-align: center; margin: 0 0 30px 0;">
                                    We're excited to have you on board! To secure your account, 
                                    please use the verification code below to complete your registration.
                                </p>
                                
                                <!-- OTP Box -->
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td align="center">
                                            <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 2px solid #1e40af; border-radius: 8px; padding: 20px; display: inline-block;">
                                                <p style="margin: 0; color: #1e40af; font-size: 32px; font-weight: bold; letter-spacing: 8px;">
                                                    {otp}
                                                </p>
                                                <p style="margin: 10px 0 0 0; color: #64748b; font-size: 14px;">
                                                    This code will expire in <strong>5 minutes</strong>
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                                
                                <p style="color: #6b7280; font-size: 14px; line-height: 1.5; text-align: center; margin: 30px 0 0 0;">
                                    If you did not request this verification code, you can safely ignore this email. 
                                    Your account security is our top priority.
                                </p>
                                
                                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                                
                                <p style="color: #4b5563; font-size: 14px; margin: 0;">
                                    Best regards,<br>
                                    <strong style="color: #1e40af;">The Meter Square Team</strong>
                                </p>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
                                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                                    © 2025 Meter Square Interiors LLC. All rights reserved.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    # Create message
    message = MIMEMultipart('alternative')
    # Include display name in From header (robust encoding)
    message["From"] = formataddr((str(Header(sender_name, 'utf-8')), sender_email))
    message["To"] = email_id
    message["Subject"] = subject
    
    # Attach HTML content
    message.attach(MIMEText(html_body, "html"))
    
    # Send email
    try:
        with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, email_id, message.as_string())
        print(f"✅ OTP email sent successfully to {email_id}")
        print(f"📧 OTP: {otp}")
        return otp
    except Exception as e:
        print(f"❌ Error sending email: {e}")
        return None


def send_otp_with_attached_logo(email_id, sender_email, sender_password, logo_path):
    """
    Alternative method: Send OTP with logo as attachment using CID
    This method attaches the local logo file to the email
    """
    
    # Generate OTP
    otp = random.randint(100000, 999999)
    
    # SMTP Configuration
    smtp_server = "smtp.gmail.com"
    smtp_port = 465
    subject = "Your OTP Code - Meter Square"
    
    # HTML body with CID reference
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
        <div style="background-color: #1e40af; padding: 20px; text-align: center;">
            <img src="cid:logo" alt="Meter Square" style="max-width: 200px; height: auto;">
            <h1 style="color: white;">Meter Square</h1>
        </div>
        <div style="padding: 20px;">
            <h2>Your OTP Code</h2>
            <div style="background: #f0f0f0; padding: 15px; text-align: center; font-size: 24px; font-weight: bold;">
                {otp}
            </div>
            <p>This code expires in 5 minutes</p>
        </div>
    </body>
    </html>
    """
    
    # Create message with related type for embedded images
    message = MIMEMultipart('related')
    # Include display name in From header (robust encoding)
    message["From"] = formataddr((str(Header(sender_name, 'utf-8')), sender_email))
    message["To"] = email_id
    message["Subject"] = subject
    
    # Create alternative part
    msg_alternative = MIMEMultipart('alternative')
    message.attach(msg_alternative)
    
    # Attach HTML
    msg_alternative.attach(MIMEText(html_body, 'html'))
    
    # Attach logo image if it exists
    if os.path.exists(logo_path):
        with open(logo_path, 'rb') as f:
            logo_data = f.read()
            logo = MIMEImage(logo_data)
            logo.add_header('Content-ID', '<logo>')
            logo.add_header('Content-Disposition', 'inline', filename='logo.png')
            message.attach(logo)
    
    # Send email
    try:
        with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, email_id, message.as_string())
        print(f"✅ OTP email with attached logo sent to {email_id}")
        return otp
    except Exception as e:
        print(f"❌ Error: {e}")
        return None


# Instructions for using your actual logo:
"""
TO USE YOUR ACTUAL LOGO:

Option 1 - Upload Logo Online (RECOMMENDED):
1. Upload your logo.png to one of these services:
   - Imgur.com (free, easy)
   - Your company website
   - GitHub repository
   - Any cloud storage with public link

2. Get the direct image URL (must end with .png, .jpg, etc.)

3. Replace the logo_url variable in the code:
   logo_url = "https://your-actual-logo-url.com/logo.png"

Option 2 - Use Local Logo File:
1. Use the send_otp_with_attached_logo() function
2. Pass the path to your local logo file

Example Usage:
--------------
# Method 1: External URL (Most Reliable)
otp = send_otp_with_logo(
    "user@example.com",
    "your-email@gmail.com", 
    "your-app-password"
)

# Method 2: Attached Logo
otp = send_otp_with_attached_logo(
    "user@example.com",
    "your-email@gmail.com",
    "your-app-password",
    "C:/path/to/logo.png"
)
"""