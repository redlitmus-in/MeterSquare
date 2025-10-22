"""
Script to update CR-40 with buyer assignment
"""
import sys
from datetime import datetime
from database import db
from models.user import User
from models.change_request import ChangeRequest
from flask import Flask

# Create Flask app
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///metersquare.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

with app.app_context():
    # Find all buyers
    buyers = User.query.filter_by(role_name='buyer', is_deleted=False).all()
    print(f'\nFound {len(buyers)} active buyers:')
    for buyer in buyers:
        print(f'  - ID: {buyer.user_id}, Name: {buyer.full_name}, Email: {buyer.email}')

    if not buyers:
        print('\nERROR: No buyers found in system!')
        sys.exit(1)

    # Get the first buyer
    buyer = buyers[0]
    print(f'\nUsing buyer: {buyer.full_name} (ID: {buyer.user_id})')

    # Get CR-40
    cr = ChangeRequest.query.get(40)
    if not cr:
        print('\nERROR: CR-40 not found!')
        sys.exit(1)

    print(f'\nCR-40 BEFORE update:')
    print(f'  - Status: {cr.status}')
    print(f'  - assigned_to_buyer_user_id: {cr.assigned_to_buyer_user_id}')
    print(f'  - assigned_to_buyer_name: {cr.assigned_to_buyer_name}')

    # Update CR-40
    cr.assigned_to_buyer_user_id = buyer.user_id
    cr.assigned_to_buyer_name = buyer.full_name
    cr.assigned_to_buyer_date = datetime.utcnow()

    db.session.commit()

    print(f'\nCR-40 AFTER update:')
    print(f'  - Status: {cr.status}')
    print(f'  - assigned_to_buyer_user_id: {cr.assigned_to_buyer_user_id}')
    print(f'  - assigned_to_buyer_name: {cr.assigned_to_buyer_name}')
    print(f'  - assigned_to_buyer_date: {cr.assigned_to_buyer_date}')
    print(f'\nSUCCESS: CR-40 updated!')
