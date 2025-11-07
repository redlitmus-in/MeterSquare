"""
Terms & Conditions Controller
Handles CRUD operations for BOQ Terms & Conditions templates
"""
from flask import Blueprint, request, jsonify, g
from config.db import db
from sqlalchemy import text
from utils.authentication import jwt_required
from datetime import datetime

terms_bp = Blueprint('terms', __name__)


@terms_bp.route('/api/terms', methods=['GET'])
@jwt_required
def get_all_terms():
    """
    Get all active Terms & Conditions templates
    Query params:
        - include_inactive: true/false (default: false)
        - client_id: filter by client_id (optional)
    """
    try:
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        client_id = request.args.get('client_id', None)

        # Build query
        query = """
            SELECT term_id, template_name, terms_text, is_default, is_active,
                   created_by, client_id, created_at, updated_at
            FROM boq_terms
            WHERE 1=1
        """
        params = {}

        # Filter by active status
        if not include_inactive:
            query += " AND is_active = TRUE"

        # Filter by client_id if provided
        if client_id:
            query += " AND (client_id = :client_id OR client_id IS NULL)"
            params['client_id'] = client_id

        query += " ORDER BY is_default DESC, template_name ASC"

        cursor = db.session.execute(text(query), params)
        terms_list = []

        for row in cursor:
            terms_list.append({
                'term_id': row[0],
                'template_name': row[1],
                'terms_text': row[2],
                'is_default': row[3],
                'is_active': row[4],
                'created_by': row[5],
                'client_id': row[6],
                'created_at': row[7].isoformat() if row[7] else None,
                'updated_at': row[8].isoformat() if row[8] else None
            })

        return jsonify({
            'success': True,
            'data': terms_list,
            'total': len(terms_list)
        }), 200

    except Exception as e:
        print(f"Error fetching terms: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch terms: {str(e)}'}), 500


@terms_bp.route('/api/terms/default', methods=['GET'])
@jwt_required
def get_default_terms():
    """Get the default Terms & Conditions template"""
    try:
        query = """
            SELECT term_id, template_name, terms_text, is_default, is_active,
                   created_by, client_id, created_at, updated_at
            FROM boq_terms
            WHERE is_default = TRUE AND is_active = TRUE
            LIMIT 1
        """

        cursor = db.session.execute(text(query))
        row = cursor.fetchone()

        if not row:
            return jsonify({'success': False, 'message': 'No default template found'}), 404

        return jsonify({
            'success': True,
            'data': {
                'term_id': row[0],
                'template_name': row[1],
                'terms_text': row[2],
                'is_default': row[3],
                'is_active': row[4],
                'created_by': row[5],
                'client_id': row[6],
                'created_at': row[7].isoformat() if row[7] else None,
                'updated_at': row[8].isoformat() if row[8] else None
            }
        }), 200

    except Exception as e:
        print(f"Error fetching default terms: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch default terms: {str(e)}'}), 500


@terms_bp.route('/api/terms/<int:term_id>', methods=['GET'])
@jwt_required
def get_term_by_id(term_id):
    """Get a specific Terms & Conditions template by ID"""
    try:
        query = """
            SELECT term_id, template_name, terms_text, is_default, is_active,
                   created_by, client_id, created_at, updated_at
            FROM boq_terms
            WHERE term_id = :term_id
        """

        cursor = db.session.execute(text(query), {'term_id': term_id})
        row = cursor.fetchone()

        if not row:
            return jsonify({'success': False, 'message': 'Template not found'}), 404

        return jsonify({
            'success': True,
            'data': {
                'term_id': row[0],
                'template_name': row[1],
                'terms_text': row[2],
                'is_default': row[3],
                'is_active': row[4],
                'created_by': row[5],
                'client_id': row[6],
                'created_at': row[7].isoformat() if row[7] else None,
                'updated_at': row[8].isoformat() if row[8] else None
            }
        }), 200

    except Exception as e:
        print(f"Error fetching term: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch term: {str(e)}'}), 500


@terms_bp.route('/api/terms', methods=['POST'])
@jwt_required
def create_term():
    """
    Create a new Terms & Conditions template
    Required fields: template_name, terms_text
    Optional fields: is_default, client_id
    """
    try:
        # Check role authorization
        current_user = g.current_user
        allowed_roles = ['Admin', 'Estimator', 'Technical Director']
        if current_user['role'] not in allowed_roles:
            return jsonify({
                'success': False,
                'message': f'Access denied. {", ".join(allowed_roles)} role required.'
            }), 403

        data = request.get_json()

        # Validate required fields
        if not data.get('template_name') or not data.get('terms_text'):
            return jsonify({
                'success': False,
                'message': 'template_name and terms_text are required'
            }), 400

        template_name = data['template_name'].strip()
        terms_text = data['terms_text'].strip()
        is_default = data.get('is_default', False)
        client_id = data.get('client_id', None)
        user_id = current_user['user_id']

        # Check if template name already exists
        check_query = "SELECT term_id FROM boq_terms WHERE template_name = :template_name"
        existing = db.session.execute(text(check_query), {'template_name': template_name}).fetchone()

        if existing:
            return jsonify({
                'success': False,
                'message': 'A template with this name already exists'
            }), 409

        # If this is set as default, unset other defaults
        if is_default:
            db.session.execute(text("UPDATE boq_terms SET is_default = FALSE WHERE is_default = TRUE"))

        # Insert new template
        insert_query = """
            INSERT INTO boq_terms (template_name, terms_text, is_default, is_active, created_by, client_id, created_at, updated_at)
            VALUES (:template_name, :terms_text, :is_default, TRUE, :user_id, :client_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING term_id
        """

        cursor = db.session.execute(text(insert_query), {
            'template_name': template_name,
            'terms_text': terms_text,
            'is_default': is_default,
            'user_id': user_id,
            'client_id': client_id
        })
        new_term_id = cursor.fetchone()[0]

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Template created successfully',
            'term_id': new_term_id
        }), 201

    except Exception as e:
        db.session.rollback()
        print(f"Error creating term: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to create template: {str(e)}'}), 500


@terms_bp.route('/api/terms/<int:term_id>', methods=['PUT'])
@jwt_required
def update_term(term_id):
    """Update an existing Terms & Conditions template"""
    try:
        # Check role authorization
        current_user = g.current_user
        allowed_roles = ['Admin', 'Estimator', 'Technical Director']
        if current_user['role'] not in allowed_roles:
            return jsonify({
                'success': False,
                'message': f'Access denied. {", ".join(allowed_roles)} role required.'
            }), 403

        data = request.get_json()

        # Check if term exists
        check_query = "SELECT term_id, template_name FROM boq_terms WHERE term_id = :term_id"
        existing = db.session.execute(text(check_query), {'term_id': term_id}).fetchone()

        if not existing:
            return jsonify({'success': False, 'message': 'Template not found'}), 404

        # Build update query dynamically based on provided fields
        update_fields = []
        params = {'term_id': term_id}

        if 'template_name' in data:
            # Check if new name conflicts with another template
            name_check = "SELECT term_id FROM boq_terms WHERE template_name = :template_name AND term_id != :term_id"
            conflict = db.session.execute(text(name_check), {
                'template_name': data['template_name'].strip(),
                'term_id': term_id
            }).fetchone()
            if conflict:
                return jsonify({
                    'success': False,
                    'message': 'A template with this name already exists'
                }), 409

            update_fields.append("template_name = :template_name")
            params['template_name'] = data['template_name'].strip()

        if 'terms_text' in data:
            update_fields.append("terms_text = :terms_text")
            params['terms_text'] = data['terms_text'].strip()

        if 'is_default' in data:
            # If setting as default, unset other defaults first
            if data['is_default']:
                db.session.execute(text("UPDATE boq_terms SET is_default = FALSE WHERE is_default = TRUE"))
            update_fields.append("is_default = :is_default")
            params['is_default'] = data['is_default']

        if 'is_active' in data:
            update_fields.append("is_active = :is_active")
            params['is_active'] = data['is_active']

        if 'client_id' in data:
            update_fields.append("client_id = :client_id")
            params['client_id'] = data['client_id']

        if not update_fields:
            return jsonify({'success': False, 'message': 'No fields to update'}), 400

        # Add updated_at
        update_fields.append("updated_at = CURRENT_TIMESTAMP")

        update_query = f"UPDATE boq_terms SET {', '.join(update_fields)} WHERE term_id = :term_id"
        db.session.execute(text(update_query), params)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Template updated successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error updating term: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to update template: {str(e)}'}), 500


@terms_bp.route('/api/terms/<int:term_id>', methods=['DELETE'])
@jwt_required
def delete_term(term_id):
    """
    Soft delete a Terms & Conditions template (set is_active = FALSE)
    Use ?hard=true to permanently delete
    """
    try:
        # Check role authorization
        current_user = g.current_user
        allowed_roles = ['Admin', 'Estimator', 'Technical Director']
        if current_user['role'] not in allowed_roles:
            return jsonify({
                'success': False,
                'message': f'Access denied. {", ".join(allowed_roles)} role required.'
            }), 403

        hard_delete = request.args.get('hard', 'false').lower() == 'true'

        # Check if term exists
        check_query = "SELECT term_id, is_default FROM boq_terms WHERE term_id = :term_id"
        existing = db.session.execute(text(check_query), {'term_id': term_id}).fetchone()

        if not existing:
            return jsonify({'success': False, 'message': 'Template not found'}), 404

        # Prevent deletion of default template
        if existing[1]:  # is_default
            return jsonify({
                'success': False,
                'message': 'Cannot delete the default template. Set another template as default first.'
            }), 400

        if hard_delete:
            # Permanent deletion
            db.session.execute(text("DELETE FROM boq_terms WHERE term_id = :term_id"), {'term_id': term_id})
            message = 'Template permanently deleted'
        else:
            # Soft delete
            db.session.execute(text("UPDATE boq_terms SET is_active = FALSE WHERE term_id = :term_id"), {'term_id': term_id})
            message = 'Template deactivated successfully'

        db.session.commit()

        return jsonify({
            'success': True,
            'message': message
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error deleting term: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to delete template: {str(e)}'}), 500
