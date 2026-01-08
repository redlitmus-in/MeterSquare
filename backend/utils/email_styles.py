"""
Universal Email Styles for MeterSquare ERP
Using only Dark Black (#000000) and Light Blue (#3b82f6) color scheme
"""

def get_email_styles():
    """Returns the universal email styles for all emails"""
    return """
        <style>
        /* Universal Dark Black and Light Blue Theme */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', 'Helvetica', sans-serif !important;
            background-color: #f0f9ff !important;
            margin: 0 !important;
            padding: 0 !important;
            color: #000000 !important;
            line-height: 1.6 !important;
            -webkit-text-size-adjust: 100% !important;
            -ms-text-size-adjust: 100% !important;
        }
        
        .email-wrapper {
            background-color: #f0f9ff !important;
            padding: 20px !important;
            width: 100% !important;
        }
        
        .email-container {
            max-width: 650px !important;
            margin: 0 auto !important;
            background: #ffffff !important;
            border-radius: 10px !important;
            overflow: hidden !important;
            box-shadow: 0 5px 15px rgba(59, 130, 246, 0.2) !important;
            border: 2px solid #3b82f6 !important;
        }
        
        /* Header Styles */
        .header {
            background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%) !important;
            padding: 25px !important;
            text-align: center !important;
        }
        
        .header h1,
        .header h2 {
            color: #ffffff !important;
            margin: 0 !important;
            font-size: 24px !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
            letter-spacing: 1.5px !important;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
        }
        
        .header img {
            max-width: 180px !important;
            height: auto !important;
            margin-bottom: 15px !important;
        }
        
        /* Content Styles */
        .content {
            padding: 30px !important;
            background: #ffffff !important;
        }
        
        .content h2 {
            color: #000000 !important;
            font-size: 20px !important;
            margin-bottom: 20px !important;
            padding-bottom: 10px !important;
            border-bottom: 2px solid #3b82f6 !important;
        }
        
        .content h3 {
            color: #000000 !important;
            font-size: 18px !important;
            margin: 25px 0 15px 0 !important;
            font-weight: bold !important;
            border-left: 4px solid #3b82f6 !important;
            padding-left: 10px !important;
        }
        
        .content p {
            color: #000000 !important;
            font-size: 14px !important;
            line-height: 1.8 !important;
            margin: 12px 0 !important;
        }
        
        /* Labels and Values */
        .label {
            font-weight: bold !important;
            color: #000000 !important;
            display: inline-block !important;
            min-width: 140px !important;
        }
        
        .value {
            color: #3b82f6 !important;
            font-weight: 500 !important;
        }
        
        /* Table Styles */
        .table-container {
            overflow-x: auto !important;
            margin: 20px 0 !important;
            border-radius: 8px !important;
            border: 2px solid #3b82f6 !important;
        }
        
        table {
            width: 100% !important;
            border-collapse: collapse !important;
            background: #ffffff !important;
        }
        
        table thead {
            background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%) !important;
        }
        
        table th {
            color: #ffffff !important;
            padding: 12px 10px !important;
            text-align: left !important;
            font-size: 13px !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
        }
        
        table tbody tr {
            border-bottom: 1px solid #3b82f6 !important;
        }
        
        table tbody tr:nth-child(even) {
            background: #f0f9ff !important;
        }
        
        table td {
            padding: 12px 10px !important;
            color: #000000 !important;
            font-size: 13px !important;
        }
        
        /* Total Cost Box */
        .total-cost {
            margin: 25px 0 !important;
            padding: 20px !important;
            background: linear-gradient(135deg, #f0f9ff 0%, #dbeafe 100%) !important;
            border: 1px solid #bfdbfe !important;
            border-radius: 10px !important;
            text-align: right !important;
        }
        
        .total-cost .label {
            color: #000000 !important;
            font-size: 16px !important;
            font-weight: bold !important;
        }
        
        .total-cost .amount {
            color: rgb(22 163 74) !important;
            font-size: 24px !important;
            font-weight: bold !important;
            margin-left: 10px !important;
        }
        
        /* Buttons */
        .button {
            display: inline-block !important;
            padding: 12px 30px !important;
            background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%) !important;
            color: #ffffff !important;
            text-decoration: none !important;
            border-radius: 5px !important;
            font-weight: bold !important;
            font-size: 14px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            margin: 10px 5px !important;
            box-shadow: 0 3px 6px rgba(59, 130, 246, 0.3) !important;
        }
        
        .button:hover {
            background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%) !important;
        }
        
        /* Status Badges */
        .status-badge {
            display: inline-block !important;
            padding: 5px 15px !important;
            border-radius: 20px !important;
            font-size: 12px !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
        }
        
        .status-approved {
            background: #3b82f6 !important;
            color: #ffffff !important;
        }
        
        .status-pending {
            background: #f0f9ff !important;
            color: #3b82f6 !important;
            border: 1px solid #3b82f6 !important;
        }
        
        .status-rejected {
            background: #000000 !important;
            color: #ffffff !important;
        }
        
        /* Signature Section */
        .signature {
            margin-top: 30px !important;
            padding-top: 20px !important;
            border-top: 2px solid #3b82f6 !important;
            color: #000000 !important;
            font-size: 14px !important;
        }
        
        .signature strong {
            color: #3b82f6 !important;
            font-size: 16px !important;
        }
        
        /* Footer */
        .footer {
            background: linear-gradient(135deg, #f0f9ff 0%, #dbeafe 100%) !important;
            padding: 25px !important;
            text-align: center !important;
            border-top: 2px solid #3b82f6 !important;
        }
        
        .footer p {
            color: #000000 !important;
            font-size: 13px !important;
            margin: 5px 0 !important;
        }
        
        .footer img {
            max-width: 150px !important;
            height: auto !important;
            margin: 15px auto !important;
            display: block !important;
        }
        
        /* Info Box */
        .info-box {
            background: #f0f9ff !important;
            border-left: 4px solid #3b82f6 !important;
            padding: 15px !important;
            margin: 20px 0 !important;
            border-radius: 0 5px 5px 0 !important;
        }
        
        .info-box p {
            color: #000000 !important;
            margin: 5px 0 !important;
        }
        
        /* Alert Box */
        .alert {
            padding: 15px !important;
            margin: 20px 0 !important;
            border-radius: 5px !important;
            font-weight: 500 !important;
        }
        
        .alert-info {
            background: #f0f9ff !important;
            border: 1px solid #3b82f6 !important;
            color: #000000 !important;
        }
        
        .alert-success {
            background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%) !important;
            color: #ffffff !important;
        }
        
        /* Divider */
        .divider {
            height: 2px !important;
            background: linear-gradient(90deg, transparent, #3b82f6, transparent) !important;
            margin: 25px 0 !important;
        }
        
        /* Responsive Design */
        @media only screen and (max-width: 600px) {
            .email-container {
                width: 100% !important;
                border-radius: 0 !important;
            }
            
            .content {
                padding: 20px !important;
            }
            
            table {
                font-size: 12px !important;
            }
            
            table th,
            table td {
                padding: 8px 5px !important;
            }
            
            .total-cost .amount {
                font-size: 20px !important;
            }
            
            .header h1,
            .header h2 {
                font-size: 20px !important;
            }
        }
        
        /* Print Styles */
        @media print {
            body {
                background: white !important;
            }
            
            .email-container {
                box-shadow: none !important;
                border: 1px solid #3b82f6 !important;
            }
        }
        </style>
    """

def wrap_email_content(content):
    """Wraps email content with the universal styles"""
    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        {get_email_styles()}
    </head>
    <body>
        <div class="email-wrapper">
            {content}
        </div>
    </body>
    </html>
    """