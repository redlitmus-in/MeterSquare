"""
Quick script to add default payment terms to system_settings
Run this from Flask shell: flask shell
Then: exec(open('add_lpo_terms.py').read())
"""

from models.system_settings import SystemSettings
from config.db import db
import json

def add_default_lpo_terms():
    print("\n" + "="*80)
    print("ADDING DEFAULT LPO PAYMENT TERMS")
    print("="*80)
    
    # Get or create system settings
    settings = SystemSettings.query.first()
    if not settings:
        print("Creating system_settings record...")
        settings = SystemSettings(id=1, company_name='MeterSquare ERP')
        db.session.add(settings)
    
    # Default payment terms
    payment_terms = [
        "100% CDC after delivery",
        "50% Advance, 50% after delivery",
        "30% Advance, 70% after delivery",
        "100% Advance",
        "Net 30 days",
        "Net 60 days",
        "Net 90 days",
        "25% Advance, 75% after delivery",
        "40% Advance, 60% after delivery",
    ]
    
    # Default general terms
    general_terms = [
        "All materials must meet specified quality standards",
        "Supplier must provide necessary certifications",
        "Prices are valid for 30 days from quotation date",
        "Supplier is responsible for safe packaging and delivery",
        "Delivery within 7 working days",
        "Delivery within 14 working days",
        "Delivery as per project schedule",
    ]
    
    # Update system settings
    settings.lpo_payment_terms_list = json.dumps(payment_terms)
    settings.lpo_general_terms = json.dumps(general_terms)
    
    db.session.commit()
    
    print(f"\n✅ Added {len(payment_terms)} payment terms")
    print(f"✅ Added {len(general_terms)} general terms")
    
    print("\n📋 Payment Terms:")
    for i, term in enumerate(payment_terms, 1):
        print(f"  {i}. {term}")
    
    print("\n📋 General Terms:")
    for i, term in enumerate(general_terms, 1):
        print(f"  {i}. {term}")
    
    print("\n" + "="*80)
    print("✅ DONE! Now test in the LPO editor - you should see these terms!")
    print("="*80)

# Run it
if __name__ == '__main__':
    add_default_lpo_terms()
