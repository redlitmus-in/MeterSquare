"""
Controller for dynamic CC email management.
- Admin manages company-wide default CCs
- Each buyer manages their own custom CCs
- User search for typeahead suggestions
"""
from flask import request, jsonify, g
from config.db import db
from config.logging import get_logger
from models.email_cc import EmailCcDefault, BuyerCcRecipient
from models.user import User
import re

log = get_logger()

EMAIL_REGEX = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


def _normalize_role(role: str) -> str:
    return role.lower().replace('_', '').replace(' ', '').replace('-', '')


# ─── Admin: Default CC Management ────────────────────────────────────────────

def get_cc_defaults():
    """GET /api/email/cc-defaults — Get all active admin CC defaults with valid emails only."""
    try:
        defaults = (
            EmailCcDefault.query
            .filter(
                EmailCcDefault.is_active == True,
                EmailCcDefault.email.isnot(None),
                EmailCcDefault.email != ''
            )
            .order_by(EmailCcDefault.id)
            .all()
        )
        return jsonify({
            "success": True,
            "data": [d.to_dict() for d in defaults]
        }), 200
    except Exception as e:
        log.error(f"Error fetching CC defaults: {e}")
        return jsonify({"success": False, "error": "Failed to fetch CC defaults"}), 500


def add_cc_default():
    """POST /api/admin/email/cc-defaults — Admin adds a new default CC."""
    current_user = g.get("user")
    if current_user.get("role") != "admin":
        return jsonify({"success": False, "error": "Admin access required"}), 403

    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    name = (data.get('name') or '').strip()

    if not email or not EMAIL_REGEX.match(email):
        return jsonify({"success": False, "error": "Valid email is required"}), 400

    try:
        # Check if exists (including soft-deleted)
        existing = EmailCcDefault.query.filter_by(email=email).first()
        if existing:
            if existing.is_active:
                return jsonify({"success": False, "error": "Email already exists in defaults"}), 409
            # Reactivate soft-deleted
            existing.is_active = True
            existing.name = name or existing.name
            existing.created_by = current_user['user_id']
            db.session.commit()
            return jsonify({"success": True, "data": existing.to_dict(), "message": "Default CC re-activated"}), 200

        new_default = EmailCcDefault(
            email=email,
            name=name,
            created_by=current_user['user_id']
        )
        db.session.add(new_default)
        db.session.commit()

        return jsonify({"success": True, "data": new_default.to_dict(), "message": "Default CC added"}), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error adding CC default: {e}")
        return jsonify({"success": False, "error": "Failed to add CC default"}), 500


def remove_cc_default(default_id):
    """DELETE /api/admin/email/cc-defaults/<id> — Admin removes a default CC."""
    current_user = g.get("user")
    if current_user.get("role") != "admin":
        return jsonify({"success": False, "error": "Admin access required"}), 403

    try:
        default = EmailCcDefault.query.filter_by(id=default_id, is_active=True).first()
        if not default:
            return jsonify({"success": False, "error": "Default CC not found"}), 404

        default.is_active = False
        db.session.commit()

        return jsonify({"success": True, "message": "Default CC removed"}), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error removing CC default: {e}")
        return jsonify({"success": False, "error": "Failed to remove CC default"}), 500


# ─── Buyer: Custom CC Management ─────────────────────────────────────────────

def get_buyer_cc_recipients():
    """GET /api/buyer/cc-recipients — Get buyer's custom CC recipients with valid emails only."""
    current_user = g.get("user")
    buyer_id = current_user['user_id']

    try:
        recipients = (
            BuyerCcRecipient.query
            .filter(
                BuyerCcRecipient.buyer_user_id == buyer_id,
                BuyerCcRecipient.is_active == True,
                BuyerCcRecipient.email.isnot(None),
                BuyerCcRecipient.email != ''
            )
            .order_by(BuyerCcRecipient.id)
            .all()
        )
        return jsonify({
            "success": True,
            "data": [r.to_dict() for r in recipients]
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyer CC recipients: {e}")
        return jsonify({"success": False, "error": "Failed to fetch CC recipients"}), 500


def add_buyer_cc_recipient():
    """POST /api/buyer/cc-recipients — Buyer adds a custom CC recipient."""
    import traceback
    try:
        current_user = g.get("user")
        buyer_id = current_user['user_id']

        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        name = (data.get('name') or '').strip()

        if not email or not EMAIL_REGEX.match(email):
            return jsonify({"success": False, "error": "Valid email is required"}), 400

        # Check if exists (including soft-deleted)
        existing = BuyerCcRecipient.query.filter_by(
            buyer_user_id=buyer_id,
            email=email
        ).first()

        if existing:
            if existing.is_active:
                return jsonify({"success": False, "error": "Email already in your CC list"}), 409
            # Reactivate soft-deleted
            existing.is_active = True
            existing.name = name or existing.name
            db.session.commit()
            return jsonify({"success": True, "data": existing.to_dict(), "message": "CC recipient re-activated"}), 200

        recipient = BuyerCcRecipient(
            buyer_user_id=buyer_id,
            email=email,
            name=name
        )
        db.session.add(recipient)
        db.session.commit()

        return jsonify({"success": True, "data": recipient.to_dict(), "message": "CC recipient added"}), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error adding buyer CC recipient: {e}\n{traceback.format_exc()}")
        return jsonify({"success": False, "error": "Failed to add CC recipient", "detail": str(e)}), 500


def remove_buyer_cc_recipient(recipient_id):
    """DELETE /api/buyer/cc-recipients/<id> — Buyer removes a custom CC."""
    current_user = g.get("user")
    buyer_id = current_user['user_id']

    try:
        recipient = BuyerCcRecipient.query.filter_by(
            id=recipient_id,
            buyer_user_id=buyer_id,
            is_active=True
        ).first()

        if not recipient:
            return jsonify({"success": False, "error": "CC recipient not found"}), 404

        recipient.is_active = False
        db.session.commit()

        return jsonify({"success": True, "message": "CC recipient removed"}), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error removing buyer CC recipient: {e}")
        return jsonify({"success": False, "error": "Failed to remove CC recipient"}), 500


# ─── User Search (for typeahead) ─────────────────────────────────────────────

def search_users_for_cc():
    """GET /api/users/search?q= — Search system users by name or email."""
    try:
        q = request.args.get('q', '').strip()
        if len(q) < 2:
            return jsonify({"success": True, "data": []}), 200

        search_filter = f"%{q}%"
        users = User.query.filter(
            User.is_deleted == False,
            db.or_(
                User.full_name.ilike(search_filter),
                User.email.ilike(search_filter)
            )
        ).limit(10).all()

        results = []
        for u in users:
            results.append({
                'user_id': u.user_id,
                'name': u.full_name or '',
                'email': u.email or '',
                'role': u.role.role if u.role else '',
            })

        return jsonify({"success": True, "data": results}), 200

    except Exception as e:
        log.error(f"Error searching users: {e}")
        return jsonify({"success": False, "error": "Search failed"}), 500
