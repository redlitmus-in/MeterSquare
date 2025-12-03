"""
Terms & Conditions Controller
Handles CRUD operations for BOQ Terms & Conditions templates
"""
from flask import Blueprint, request, jsonify, g
from config.db import db
from sqlalchemy import text
from utils.authentication import jwt_required
from datetime import datetime
from config.logging import get_logger

log = get_logger()

terms_bp = Blueprint('terms', __name__, url_prefix='/api')


@terms_bp.route('/terms', methods=['GET'])
@jwt_required
def get_all_terms():
    """
    Get all active Terms & Conditions
    Query params:
        - include_inactive: true/false (default: false)
    """
    try:
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'

        # Build query
        query = """
            SELECT term_id, terms_text, is_active, display_order,
                   created_by, created_at, updated_at
            FROM boq_terms
            WHERE is_deleted = FALSE
        """
        params = {}

        # Filter by active status
        if not include_inactive:
            query += " AND is_active = TRUE"

        query += " ORDER BY display_order, term_id"

        cursor = db.session.execute(text(query), params)
        terms_list = []

        for row in cursor:
            terms_list.append({
                'term_id': row[0],
                'terms_text': row[1],
                'is_active': row[2],
                'display_order': row[3],
                'created_by': row[4],
                'created_at': row[5].isoformat() if row[5] else None,
                'updated_at': row[6].isoformat() if row[6] else None
            })

        return jsonify({
            'success': True,
            'data': terms_list,
            'total': len(terms_list)
        }), 200

    except Exception as e:
        log.error(f"Error fetching terms: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch terms: {str(e)}'}), 500


@terms_bp.route('/terms/default', methods=['GET'])
@jwt_required
def get_default_terms():
    """Get the first active term (for backward compatibility)"""
    try:
        query = """
            SELECT term_id, terms_text, is_active, display_order,
                   created_by, created_at, updated_at
            FROM boq_terms
            WHERE is_active = TRUE AND is_deleted = FALSE
            ORDER BY display_order, term_id
            LIMIT 1
        """

        cursor = db.session.execute(text(query))
        row = cursor.fetchone()

        if not row:
            return jsonify({'success': False, 'message': 'No terms found'}), 404

        return jsonify({
            'success': True,
            'data': {
                'term_id': row[0],
                'terms_text': row[1],
                'is_active': row[2],
                'display_order': row[3],
                'created_by': row[4],
                'created_at': row[5].isoformat() if row[5] else None,
                'updated_at': row[6].isoformat() if row[6] else None
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching default terms: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch default terms: {str(e)}'}), 500


@terms_bp.route('/terms/<int:term_id>', methods=['GET'])
@jwt_required
def get_term_by_id(term_id):
    """Get a specific term by ID"""
    try:
        query = """
            SELECT term_id, terms_text, is_active, display_order,
                   created_by, created_at, updated_at
            FROM boq_terms
            WHERE term_id = :term_id AND is_deleted = FALSE
        """

        cursor = db.session.execute(text(query), {'term_id': term_id})
        row = cursor.fetchone()

        if not row:
            return jsonify({'success': False, 'message': 'Term not found'}), 404

        return jsonify({
            'success': True,
            'data': {
                'term_id': row[0],
                'terms_text': row[1],
                'is_active': row[2],
                'display_order': row[3],
                'created_by': row[4],
                'created_at': row[5].isoformat() if row[5] else None,
                'updated_at': row[6].isoformat() if row[6] else None
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching term: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch term: {str(e)}'}), 500


@terms_bp.route('/terms', methods=['POST'])
@jwt_required
def create_term():
    """
    Create a new term
    Required fields: terms_text
    """
    try:
        # Check role authorization
        current_user = g.user
        allowed_roles = ['Admin', 'Estimator', 'Technical Director']
        # Case-insensitive role check
        user_role = current_user.get('role', '').strip()
        if not any(user_role.lower() == allowed.lower() for allowed in allowed_roles):
            return jsonify({
                'success': False,
                'message': f'Access denied. {", ".join(allowed_roles)} role required.'
            }), 403

        data = request.get_json()

        # Validate required fields
        if not data.get('terms_text'):
            return jsonify({
                'success': False,
                'message': 'terms_text is required'
            }), 400

        terms_text = data['terms_text'].strip()
        user_id = current_user['user_id']

        # Get max display_order and increment
        max_order = db.session.execute(
            text("SELECT COALESCE(MAX(display_order), 0) FROM boq_terms")
        ).scalar()
        new_order = max_order + 1

        # Insert new term
        insert_query = """
            INSERT INTO boq_terms (terms_text, is_active, is_deleted, display_order, created_by, created_at, updated_at)
            VALUES (:terms_text, TRUE, FALSE, :display_order, :user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING term_id
        """

        cursor = db.session.execute(text(insert_query), {
            'terms_text': terms_text,
            'display_order': new_order,
            'user_id': user_id
        })
        new_term_id = cursor.fetchone()[0]

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Term created successfully',
            'term_id': new_term_id
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating term: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to create term: {str(e)}'}), 500


@terms_bp.route('/terms/<int:term_id>', methods=['PUT'])
@jwt_required
def update_term(term_id):
    """Update an existing term"""
    try:
        # Check role authorization
        current_user = g.user
        allowed_roles = ['Admin', 'Estimator', 'Technical Director']
        # Case-insensitive role check
        user_role = current_user.get('role', '').strip()
        if not any(user_role.lower() == allowed.lower() for allowed in allowed_roles):
            return jsonify({
                'success': False,
                'message': f'Access denied. {", ".join(allowed_roles)} role required.'
            }), 403

        data = request.get_json()

        # Check if term exists
        check_query = "SELECT term_id FROM boq_terms WHERE term_id = :term_id AND is_deleted = FALSE"
        existing = db.session.execute(text(check_query), {'term_id': term_id}).fetchone()

        if not existing:
            return jsonify({'success': False, 'message': 'Term not found'}), 404

        # Build update query dynamically based on provided fields
        update_fields = []
        params = {'term_id': term_id}

        if 'terms_text' in data:
            update_fields.append("terms_text = :terms_text")
            params['terms_text'] = data['terms_text'].strip()

        if 'is_active' in data:
            update_fields.append("is_active = :is_active")
            params['is_active'] = data['is_active']

        if 'display_order' in data:
            update_fields.append("display_order = :display_order")
            params['display_order'] = data['display_order']

        if not update_fields:
            return jsonify({'success': False, 'message': 'No fields to update'}), 400

        # Add updated_at
        update_fields.append("updated_at = CURRENT_TIMESTAMP")

        update_query = f"UPDATE boq_terms SET {', '.join(update_fields)} WHERE term_id = :term_id"
        db.session.execute(text(update_query), params)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Term updated successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating term: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to update term: {str(e)}'}), 500


@terms_bp.route('/terms/<int:term_id>', methods=['DELETE'])
@jwt_required
def delete_term(term_id):
    """
    Soft delete a term (set is_deleted = TRUE)
    Use ?hard=true to permanently delete
    """
    try:
        # Check role authorization
        current_user = g.user
        allowed_roles = ['Admin', 'Estimator', 'Technical Director']
        # Case-insensitive role check
        user_role = current_user.get('role', '').strip()
        if not any(user_role.lower() == allowed.lower() for allowed in allowed_roles):
            return jsonify({
                'success': False,
                'message': f'Access denied. {", ".join(allowed_roles)} role required.'
            }), 403

        hard_delete = request.args.get('hard', 'false').lower() == 'true'

        # Check if term exists
        check_query = "SELECT term_id FROM boq_terms WHERE term_id = :term_id AND is_deleted = FALSE"
        existing = db.session.execute(text(check_query), {'term_id': term_id}).fetchone()

        if not existing:
            return jsonify({'success': False, 'message': 'Term not found'}), 404

        if hard_delete:
            # Permanent deletion
            db.session.execute(text("DELETE FROM boq_terms WHERE term_id = :term_id"), {'term_id': term_id})
            message = 'Term permanently deleted'
        else:
            # Soft delete
            db.session.execute(text("UPDATE boq_terms SET is_deleted = TRUE, is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE term_id = :term_id"), {'term_id': term_id})
            message = 'Term deleted successfully'

        db.session.commit()

        return jsonify({
            'success': True,
            'message': message
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting term: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to delete term: {str(e)}'}), 500


# ===== BOQ-SPECIFIC TERMS ENDPOINTS (Similar to Preliminaries) =====

@terms_bp.route('/boq/<int:boq_id>/terms', methods=['GET'])
@jwt_required
def get_boq_terms(boq_id):
    """
    Get ALL terms with their selection status for a specific BOQ
    Returns all active terms from master with is_checked status
    Similar to GET /api/boq/:boq_id/preliminaries
    """
    try:
        # Fetch all active terms from master
        master_query = """
            SELECT term_id, terms_text, display_order
            FROM boq_terms
            WHERE is_active = TRUE AND is_deleted = FALSE
            ORDER BY display_order, term_id
        """
        master_cursor = db.session.execute(text(master_query))
        master_terms = {}
        for row in master_cursor:
            master_terms[row[0]] = {
                'term_id': row[0],
                'terms_text': row[1],
                'display_order': row[2],
                'is_checked': False  # Default to unchecked
            }

        # Fetch selected term_ids for this BOQ (single row with array)
        selections_query = """
            SELECT term_ids
            FROM boq_terms_selections
            WHERE boq_id = :boq_id
        """
        result = db.session.execute(text(selections_query), {'boq_id': boq_id}).fetchone()
        selected_term_ids = result[0] if result and result[0] else []

        # Update checked status for selected terms
        for term_id in selected_term_ids:
            if term_id in master_terms:
                master_terms[term_id]['is_checked'] = True

        # Convert to list
        terms_list = list(master_terms.values())
        selected_count = sum(1 for term in terms_list if term['is_checked'])

        return jsonify({
            'success': True,
            'boq_id': boq_id,
            'data': terms_list,
            'count': len(terms_list),
            'selected_count': selected_count
        }), 200

    except Exception as e:
        log.error(f"Error fetching BOQ terms: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch BOQ terms: {str(e)}'}), 500


@terms_bp.route('/boq/<int:boq_id>/terms', methods=['POST'])
@jwt_required
def save_boq_terms(boq_id):
    """
    Save term selections for a BOQ
    Request body: {selections: [{term_id, is_checked}]} or {term_ids: [1, 2, 3]}
    Stores as single row with term_ids array
    """
    try:
        # Check role authorization
        current_user = g.user
        allowed_roles = ['Admin', 'Estimator', 'Technical Director']
        user_role = current_user.get('role', '').strip()
        if not any(user_role.lower() == allowed.lower() for allowed in allowed_roles):
            return jsonify({
                'success': False,
                'message': f'Access denied. {", ".join(allowed_roles)} role required.'
            }), 403

        data = request.get_json()

        # Support both formats:
        # 1. {term_ids: [1, 2, 3]} - new format with just selected IDs
        # 2. {selections: [{term_id, is_checked}]} - old format for backwards compatibility
        if 'term_ids' in data:
            selected_term_ids = data.get('term_ids', [])
        else:
            selections = data.get('selections', [])
            # Extract only checked term IDs
            selected_term_ids = [
                s.get('term_id') for s in selections
                if s.get('term_id') and s.get('is_checked', False)
            ]

        # Verify BOQ exists
        boq_check = db.session.execute(
            text("SELECT boq_id FROM boq WHERE boq_id = :boq_id"),
            {'boq_id': boq_id}
        ).fetchone()

        if not boq_check:
            return jsonify({'success': False, 'message': 'BOQ not found'}), 404

        # Check if selection exists for this BOQ
        existing = db.session.execute(
            text("SELECT id FROM boq_terms_selections WHERE boq_id = :boq_id"),
            {'boq_id': boq_id}
        ).fetchone()

        if existing:
            # Update existing row
            db.session.execute(
                text("""
                    UPDATE boq_terms_selections
                    SET term_ids = :term_ids, updated_at = CURRENT_TIMESTAMP
                    WHERE boq_id = :boq_id
                """),
                {'boq_id': boq_id, 'term_ids': selected_term_ids}
            )
        else:
            # Insert new row
            db.session.execute(
                text("""
                    INSERT INTO boq_terms_selections (boq_id, term_ids, created_at, updated_at)
                    VALUES (:boq_id, :term_ids, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """),
                {'boq_id': boq_id, 'term_ids': selected_term_ids}
            )

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Terms selections saved successfully',
            'saved_count': len(selected_term_ids)
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error saving BOQ terms: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to save terms selections: {str(e)}'}), 500


@terms_bp.route('/boq/<int:boq_id>/terms/selected', methods=['GET'])
@jwt_required
def get_boq_selected_terms(boq_id):
    """
    Get only SELECTED terms for a BOQ
    Used for PDF generation and display
    Similar to GET /api/boq/:boq_id/preliminaries/selected
    """
    try:
        # First get the term_ids array for this BOQ
        term_ids_query = """
            SELECT term_ids FROM boq_terms_selections WHERE boq_id = :boq_id
        """
        result = db.session.execute(text(term_ids_query), {'boq_id': boq_id}).fetchone()
        term_ids = result[0] if result and result[0] else []

        selected_terms = []
        if term_ids:
            # Fetch terms for selected IDs
            query = """
                SELECT term_id, terms_text, display_order
                FROM boq_terms
                WHERE term_id = ANY(:term_ids)
                AND is_active = TRUE
                AND is_deleted = FALSE
                ORDER BY display_order, term_id
            """
            cursor = db.session.execute(text(query), {'term_ids': term_ids})

            for row in cursor:
                selected_terms.append({
                    'term_id': row[0],
                    'terms_text': row[1],
                    'display_order': row[2]
                })

        return jsonify({
            'success': True,
            'boq_id': boq_id,
            'data': selected_terms,
            'count': len(selected_terms)
        }), 200

    except Exception as e:
        log.error(f"Error fetching selected BOQ terms: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch selected terms: {str(e)}'}), 500


@terms_bp.route('/terms-master', methods=['GET'])
@jwt_required
def get_all_terms_master():
    """
    Get all active terms for dropdown/selection (simplified endpoint)
    Returns only active, non-deleted terms ordered by display_order
    """
    try:
        query = """
            SELECT term_id, terms_text, display_order
            FROM boq_terms
            WHERE is_active = TRUE AND is_deleted = FALSE
            ORDER BY display_order, term_id
        """

        cursor = db.session.execute(text(query))
        terms_list = []

        for row in cursor:
            terms_list.append({
                'term_id': row[0],
                'terms_text': row[1],
                'display_order': row[2]
            })

        return jsonify({
            'success': True,
            'data': terms_list,
            'count': len(terms_list)
        }), 200

    except Exception as e:
        log.error(f"Error fetching terms master: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch terms: {str(e)}'}), 500


@terms_bp.route('/terms-master', methods=['POST'])
@jwt_required
def create_term_master():
    """
    Create a new master term (simplified - only terms_text required)
    Used when user adds custom term in BOQ creation
    """
    try:
        # Get current user (no role restriction for adding terms during BOQ creation)
        current_user = g.user

        data = request.get_json()
        terms_text = data.get('terms_text', '').strip()

        if not terms_text:
            return jsonify({'success': False, 'message': 'terms_text is required'}), 400

        user_id = current_user.get('user_id')

        # Get max display_order and increment
        max_order = db.session.execute(
            text("SELECT COALESCE(MAX(display_order), 0) FROM boq_terms")
        ).scalar()
        new_order = max_order + 1

        # Insert new term
        insert_query = """
            INSERT INTO boq_terms (terms_text, is_active, is_deleted, display_order, created_by, created_at, updated_at)
            VALUES (:terms_text, TRUE, FALSE, :display_order, :user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING term_id
        """

        cursor = db.session.execute(text(insert_query), {
            'terms_text': terms_text,
            'display_order': new_order,
            'user_id': user_id
        })
        new_term_id = cursor.fetchone()[0]

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Term created successfully',
            'data': {
                'term_id': new_term_id,
                'terms_text': terms_text,
                'display_order': new_order
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating term: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to create term: {str(e)}'}), 500


@terms_bp.route('/terms-master/<int:term_id>', methods=['PUT'])
@jwt_required
def update_term_master(term_id):
    """Update a master term (simplified)"""
    try:
        # Check role authorization
        current_user = g.user
        allowed_roles = ['Admin', 'Estimator', 'Technical Director']
        # Case-insensitive role check
        user_role = current_user.get('role', '').strip()
        if not any(user_role.lower() == allowed.lower() for allowed in allowed_roles):
            return jsonify({
                'success': False,
                'message': f'Access denied. {", ".join(allowed_roles)} role required.'
            }), 403

        data = request.get_json()
        terms_text = data.get('terms_text', '').strip()

        if not terms_text:
            return jsonify({'success': False, 'message': 'terms_text is required'}), 400

        # Check if term exists
        check = db.session.execute(
            text("SELECT term_id FROM boq_terms WHERE term_id = :term_id"),
            {'term_id': term_id}
        ).fetchone()

        if not check:
            return jsonify({'success': False, 'message': 'Term not found'}), 404

        # Update term
        update_query = """
            UPDATE boq_terms
            SET terms_text = :terms_text, updated_at = CURRENT_TIMESTAMP
            WHERE term_id = :term_id
        """
        db.session.execute(text(update_query), {
            'term_id': term_id,
            'terms_text': terms_text
        })
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Term updated successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating term: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to update term: {str(e)}'}), 500


@terms_bp.route('/terms-master/<int:term_id>', methods=['DELETE'])
@jwt_required
def delete_term_master(term_id):
    """Soft delete a master term"""
    try:
        # Check role authorization
        current_user = g.user
        allowed_roles = ['Admin', 'Estimator', 'Technical Director']
        # Case-insensitive role check
        user_role = current_user.get('role', '').strip()
        if not any(user_role.lower() == allowed.lower() for allowed in allowed_roles):
            return jsonify({
                'success': False,
                'message': f'Access denied. {", ".join(allowed_roles)} role required.'
            }), 403

        # Check if term exists
        check = db.session.execute(
            text("SELECT term_id FROM boq_terms WHERE term_id = :term_id"),
            {'term_id': term_id}
        ).fetchone()

        if not check:
            return jsonify({'success': False, 'message': 'Term not found'}), 404

        # Soft delete
        update_query = """
            UPDATE boq_terms
            SET is_deleted = TRUE, is_active = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE term_id = :term_id
        """
        db.session.execute(text(update_query), {'term_id': term_id})
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Term deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting term: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to delete term: {str(e)}'}), 500
