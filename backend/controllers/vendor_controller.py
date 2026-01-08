from flask import request, jsonify, g
from config.db import db
from models.vendor import Vendor, VendorProduct
from models.user import User
from config.logging import get_logger
from datetime import datetime
from sqlalchemy import or_, and_, func

log = get_logger()


def create_vendor():
    """Create a new vendor"""
    try:
        current_user = g.user
        data = request.get_json()

        # Validate required fields
        if not data.get('company_name'):
            return jsonify({"success": False, "error": "Company name is required"}), 400

        if not data.get('email'):
            return jsonify({"success": False, "error": "Email is required"}), 400

        # Check for duplicate email
        existing_vendor = Vendor.query.filter_by(email=data['email'], is_deleted=False).first()
        if existing_vendor:
            return jsonify({
                "success": False,
                "error": f"Vendor with email '{data['email']}' already exists"
            }), 409

        # Create new vendor
        new_vendor = Vendor(
            company_name=data['company_name'],
            contact_person_name=data.get('contact_person_name'),
            email=data['email'],
            phone_code=data.get('phone_code', '+971'),
            phone=data.get('phone'),
            street_address=data.get('street_address'),
            city=data.get('city'),
            state=data.get('state'),
            country=data.get('country', 'UAE'),
            pin_code=data.get('pin_code'),
            gst_number=data.get('gst_number'),
            category=data.get('category'),
            status=data.get('status', 'active'),
            created_by=current_user['user_id'],
            last_modified_by=current_user['user_id']
        )

        db.session.add(new_vendor)
        db.session.commit()

        log.info(f"Vendor created: {new_vendor.vendor_id} by user {current_user['user_id']}")

        # Send notification to Technical Directors about new vendor
        try:
            from models.role import Role
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            # Get Technical Directors
            td_role = Role.query.filter_by(role='Technical Director', is_deleted=False).first()
            if td_role:
                td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
                for td_user in td_users:
                    notification = NotificationManager.create_notification(
                        user_id=td_user.user_id,
                        type='info',
                        title='New Vendor Created',
                        message=f'Buyer created new vendor: {new_vendor.company_name}',
                        priority='medium',
                        category='vendor',
                        action_url=f'/technical-director/vendors/{new_vendor.vendor_id}',
                        action_label='Review Vendor',
                        metadata={'vendor_id': str(new_vendor.vendor_id), 'company_name': new_vendor.company_name},
                        sender_id=current_user['user_id'],
                        sender_name=current_user.get('full_name', 'Buyer')
                    )
                    send_notification_to_user(td_user.user_id, notification.to_dict())
                    log.info(f"Sent vendor creation notification to TD {td_user.user_id}")
        except Exception as notif_error:
            log.error(f"Failed to send vendor creation notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor created successfully",
            "vendor": new_vendor.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating vendor: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to create vendor: {str(e)}"}), 500


def get_all_vendors():
    """Get all vendors with optional filtering and pagination"""
    try:
        current_user = g.user

        # Get query parameters
        category = request.args.get('category')
        status = request.args.get('status')
        search = request.args.get('search')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        include_deleted = request.args.get('include_deleted', 'false').lower() == 'true'

        # Build query
        query = Vendor.query

        # Filter by deletion status
        if not include_deleted:
            query = query.filter_by(is_deleted=False)

        # Filter by category
        if category:
            query = query.filter_by(category=category)

        # Filter by status
        if status:
            query = query.filter_by(status=status)

        # Search functionality
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    Vendor.company_name.like(search_term),
                    Vendor.contact_person_name.like(search_term),
                    Vendor.email.like(search_term),
                    Vendor.phone.like(search_term),
                    Vendor.city.like(search_term)
                )
            )

        # Order by most recent first
        query = query.order_by(Vendor.created_at.desc())

        # Paginate results
        paginated_vendors = query.paginate(page=page, per_page=per_page, error_out=False)

        vendors_list = [vendor.to_dict() for vendor in paginated_vendors.items]

        # Get statistics
        total_active = Vendor.query.filter_by(status='active', is_deleted=False).count()
        total_inactive = Vendor.query.filter_by(status='inactive', is_deleted=False).count()

        return jsonify({
            "success": True,
            "vendors": vendors_list,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated_vendors.total,
                "pages": paginated_vendors.pages,
                "has_next": paginated_vendors.has_next,
                "has_prev": paginated_vendors.has_prev
            },
            "statistics": {
                "total_active": total_active,
                "total_inactive": total_inactive,
                "total_vendors": total_active + total_inactive
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching vendors: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to fetch vendors: {str(e)}"}), 500


def get_all_vendors_with_products():
    """Get all vendors with their products in a single request - optimized for frontend"""
    try:
        current_user = g.user

        # Get query parameters
        category = request.args.get('category')
        status = request.args.get('status')
        search = request.args.get('search')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 100, type=int)
        include_deleted = request.args.get('include_deleted', 'false').lower() == 'true'

        # Build query
        query = Vendor.query

        # Filter by deletion status
        if not include_deleted:
            query = query.filter_by(is_deleted=False)

        # Filter by category
        if category:
            query = query.filter_by(category=category)

        # Filter by status
        if status:
            query = query.filter_by(status=status)

        # Search functionality
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    Vendor.company_name.like(search_term),
                    Vendor.contact_person_name.like(search_term),
                    Vendor.email.like(search_term),
                    Vendor.phone.like(search_term),
                    Vendor.city.like(search_term)
                )
            )

        # Order by most recent first
        query = query.order_by(Vendor.created_at.desc())

        # Paginate results
        paginated_vendors = query.paginate(page=page, per_page=per_page, error_out=False)

        # Get all vendor IDs from this page
        vendor_ids = [v.vendor_id for v in paginated_vendors.items]

        # Fetch all products for these vendors in a single query
        products_query = VendorProduct.query.filter(
            VendorProduct.vendor_id.in_(vendor_ids),
            VendorProduct.is_deleted == False
        ).all()

        # Group products by vendor_id
        products_by_vendor = {}
        for product in products_query:
            if product.vendor_id not in products_by_vendor:
                products_by_vendor[product.vendor_id] = []
            products_by_vendor[product.vendor_id].append(product.to_dict())

        # Build vendor list with products
        vendors_list = []
        for vendor in paginated_vendors.items:
            vendor_data = vendor.to_dict()
            vendor_data['products'] = products_by_vendor.get(vendor.vendor_id, [])
            vendor_data['products_count'] = len(vendor_data['products'])
            vendors_list.append(vendor_data)

        # Get statistics
        total_active = Vendor.query.filter_by(status='active', is_deleted=False).count()
        total_inactive = Vendor.query.filter_by(status='inactive', is_deleted=False).count()

        return jsonify({
            "success": True,
            "vendors": vendors_list,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated_vendors.total,
                "pages": paginated_vendors.pages,
                "has_next": paginated_vendors.has_next,
                "has_prev": paginated_vendors.has_prev
            },
            "statistics": {
                "total_active": total_active,
                "total_inactive": total_inactive,
                "total_vendors": total_active + total_inactive
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching vendors with products: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to fetch vendors with products: {str(e)}"}), 500


def get_vendor_by_id(vendor_id):
    """Get vendor by ID with products"""
    try:
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()

        if not vendor:
            return jsonify({"success": False, "error": "Vendor not found"}), 404

        vendor_data = vendor.to_dict()

        # Get vendor products
        # ✅ PERFORMANCE: Limit to 200 products per vendor (use pagination for more)
        products = VendorProduct.query.filter_by(vendor_id=vendor_id, is_deleted=False).order_by(VendorProduct.product_id.desc()).limit(200).all()
        vendor_data['products'] = [product.to_dict() for product in products]
        vendor_data['products_count'] = len(products)

        return jsonify({
            "success": True,
            "vendor": vendor_data
        }), 200

    except Exception as e:
        log.error(f"Error fetching vendor {vendor_id}: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to fetch vendor: {str(e)}"}), 500


def update_vendor(vendor_id):
    """Update vendor details"""
    try:
        current_user = g.user
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()

        if not vendor:
            return jsonify({"success": False, "error": "Vendor not found"}), 404

        data = request.get_json()

        # Check for duplicate email if email is being changed
        if 'email' in data and data['email'] != vendor.email:
            existing = Vendor.query.filter(
                Vendor.email == data['email'],
                Vendor.vendor_id != vendor_id,
                Vendor.is_deleted == False
            ).first()
            if existing:
                return jsonify({
                    "success": False,
                    "error": f"Email '{data['email']}' is already in use"
                }), 409

        # Update fields
        if 'company_name' in data:
            vendor.company_name = data['company_name']
        if 'contact_person_name' in data:
            vendor.contact_person_name = data['contact_person_name']
        if 'email' in data:
            vendor.email = data['email']
        if 'phone_code' in data:
            vendor.phone_code = data['phone_code']
        if 'phone' in data:
            vendor.phone = data['phone']
        if 'street_address' in data:
            vendor.street_address = data['street_address']
        if 'city' in data:
            vendor.city = data['city']
        if 'state' in data:
            vendor.state = data['state']
        if 'country' in data:
            vendor.country = data['country']
        if 'pin_code' in data:
            vendor.pin_code = data['pin_code']
        if 'gst_number' in data:
            vendor.gst_number = data['gst_number']
        if 'category' in data:
            vendor.category = data['category']
        if 'status' in data:
            vendor.status = data['status']

        vendor.last_modified_by = current_user['user_id']
        vendor.last_modified_at = datetime.utcnow()

        db.session.commit()

        log.info(f"Vendor updated: {vendor_id} by user {current_user['user_id']}")

        return jsonify({
            "success": True,
            "message": "Vendor updated successfully",
            "vendor": vendor.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating vendor {vendor_id}: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to update vendor: {str(e)}"}), 500


def delete_vendor(vendor_id):
    """Soft delete a vendor"""
    try:
        current_user = g.user
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()

        if not vendor:
            return jsonify({"success": False, "error": "Vendor not found"}), 404

        # Soft delete
        vendor.is_deleted = True
        vendor.status = 'inactive'
        vendor.last_modified_by = current_user['user_id']
        vendor.last_modified_at = datetime.utcnow()

        db.session.commit()

        log.info(f"Vendor deleted: {vendor_id} by user {current_user['user_id']}")

        return jsonify({
            "success": True,
            "message": "Vendor deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting vendor {vendor_id}: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to delete vendor: {str(e)}"}), 500


def add_vendor_product(vendor_id):
    """Add product/service to vendor"""
    try:
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()

        if not vendor:
            return jsonify({"success": False, "error": "Vendor not found"}), 404

        data = request.get_json()

        # Validate required fields
        if not data.get('product_name'):
            return jsonify({"success": False, "error": "Product name is required"}), 400

        # Create new product
        new_product = VendorProduct(
            vendor_id=vendor_id,
            product_name=data['product_name'],
            category=data.get('category'),
            description=data.get('description'),
            unit=data.get('unit'),
            unit_price=data.get('unit_price')
        )

        db.session.add(new_product)
        db.session.commit()

        log.info(f"Product added to vendor {vendor_id}: {new_product.product_id}")

        return jsonify({
            "success": True,
            "message": "Product added successfully",
            "product": new_product.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error adding product to vendor {vendor_id}: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to add product: {str(e)}"}), 500


def get_vendor_products(vendor_id):
    """Get all products for a vendor"""
    try:
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()

        if not vendor:
            return jsonify({"success": False, "error": "Vendor not found"}), 404

        # ✅ PERFORMANCE: Limit to 200 products per vendor (use pagination for more)
        products = VendorProduct.query.filter_by(vendor_id=vendor_id, is_deleted=False).order_by(VendorProduct.product_id.desc()).limit(200).all()
        products_list = [product.to_dict() for product in products]

        return jsonify({
            "success": True,
            "products": products_list,
            "count": len(products_list)
        }), 200

    except Exception as e:
        log.error(f"Error fetching products for vendor {vendor_id}: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to fetch products: {str(e)}"}), 500


def update_vendor_product(vendor_id, product_id):
    """Update vendor product"""
    try:
        product = VendorProduct.query.filter_by(
            product_id=product_id,
            vendor_id=vendor_id,
            is_deleted=False
        ).first()

        if not product:
            return jsonify({"success": False, "error": "Product not found"}), 404

        data = request.get_json()

        # Update fields
        if 'product_name' in data:
            product.product_name = data['product_name']
        if 'category' in data:
            product.category = data['category']
        if 'description' in data:
            product.description = data['description']
        if 'unit' in data:
            product.unit = data['unit']
        if 'unit_price' in data:
            product.unit_price = data['unit_price']

        product.last_modified_at = datetime.utcnow()

        db.session.commit()

        log.info(f"Product updated: {product_id}")

        return jsonify({
            "success": True,
            "message": "Product updated successfully",
            "product": product.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating product {product_id}: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to update product: {str(e)}"}), 500


def delete_vendor_product(vendor_id, product_id):
    """Delete vendor product"""
    try:
        product = VendorProduct.query.filter_by(
            product_id=product_id,
            vendor_id=vendor_id,
            is_deleted=False
        ).first()

        if not product:
            return jsonify({"success": False, "error": "Product not found"}), 404

        # Soft delete
        product.is_deleted = True
        product.last_modified_at = datetime.utcnow()

        db.session.commit()

        log.info(f"Product deleted: {product_id}")

        return jsonify({
            "success": True,
            "message": "Product deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting product {product_id}: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to delete product: {str(e)}"}), 500


def get_vendor_categories():
    """Get list of vendor categories"""
    try:
        categories = [
            'Construction Materials',
            'Electrical Equipment',
            'Plumbing Supplies',
            'HVAC Equipment',
            'Safety Equipment',
            'Tools & Machinery',
            'Furniture',
            'IT Equipment',
            'Office Supplies',
            'Transportation',
            'Consulting Services',
            'Maintenance Services',
            'Other'
        ]

        return jsonify({
            "success": True,
            "categories": categories
        }), 200

    except Exception as e:
        log.error(f"Error fetching categories: {str(e)}")
        return jsonify({"success": False, "error": f"Failed to fetch categories: {str(e)}"}), 500
