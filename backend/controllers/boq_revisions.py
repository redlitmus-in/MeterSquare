"""
BOQ Revisions Controller

Handles dynamic revision tabs and revision-specific queries
"""

from flask import jsonify, request
from config.db import db
from models.boq import BOQ, BOQDetails
from sqlalchemy import func, and_, or_
from config.logging import get_logger

log = get_logger()


def get_revision_tabs():
    """
    Get all active revision numbers with project counts
    Returns dynamic tabs based on actual data
    """
    try:
        # Query to get unique revision numbers with counts
        # Include BOQs in revision states (match frontend filtering logic)
        # Note: sent_for_confirmation is NOT included - those BOQs move to different tabs
        # Use LOWER() for case-insensitive comparison (database has mixed case statuses)
        result = db.session.query(
            BOQ.revision_number,
            func.count(BOQ.boq_id).label('project_count')
        ).filter(
            # Include revision_number >= 0 to catch legacy BOQs
            or_(BOQ.revision_number > 0, BOQ.revision_number == 0, BOQ.revision_number.is_(None)),
            func.lower(BOQ.status).in_([
                'under_revision',
                'pending_revision',
                'revision_approved'
            ]),
            BOQ.is_deleted == False
        ).group_by(
            BOQ.revision_number
        ).order_by(
            BOQ.revision_number
        ).all()

        tabs = []
        for row in result:
            # Handle NULL revision_number (legacy data)
            revision_num = row.revision_number if row.revision_number is not None else 0

            # For revision_number = 0, these are BOQs in revision state but not yet approved as revisions
            # Show them so they're visible to users (legacy behavior)
            # Once TD approves them, they'll become Rev 1

            # Determine alert level based on revision number
            alert_level = 'normal'
            if revision_num >= 7:
                alert_level = 'critical'
            elif revision_num >= 4:
                alert_level = 'warning'

            tabs.append({
                'revision_number': revision_num,
                'project_count': row.project_count,
                'alert_level': alert_level
            })

        log.info(f"Found {len(tabs)} active revision tabs")
        return jsonify(tabs), 200

    except Exception as e:
        log.error(f"Error getting revision tabs: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_projects_by_revision(revision_number):
    """
    Get all projects for a specific revision number
    """
    try:
        if revision_number == 'all':
            # Get all projects in any revision state (match frontend logic - NO sent_for_confirmation)
            # Use LOWER() for case-insensitive comparison
            boqs = BOQ.query.filter(
                or_(BOQ.revision_number >= 0, BOQ.revision_number.is_(None)),
                func.lower(BOQ.status).in_([
                    'under_revision',
                    'pending_revision',
                    'revision_approved'
                ]),
                BOQ.is_deleted == False
            ).order_by(
                BOQ.revision_number.desc(),
                BOQ.last_modified_at.desc()
            ).all()
        else:
            # Get projects for specific revision number (including 0 for legacy BOQs)
            revision_num = int(revision_number)
            if revision_num == 0:
                # For revision 0, get BOQs with revision_number = 0 or NULL in revision states
                # Use LOWER() for case-insensitive comparison
                boqs = BOQ.query.filter(
                    or_(BOQ.revision_number == 0, BOQ.revision_number.is_(None)),
                    func.lower(BOQ.status).in_([
                        'under_revision',
                        'pending_revision',
                        'revision_approved'
                    ]),
                    BOQ.is_deleted == False
                ).order_by(
                    BOQ.last_modified_at.desc()
                ).all()
            else:
                # For actual revisions (>= 1), only show those still in revision states
                # Use LOWER() for case-insensitive comparison
                boqs = BOQ.query.filter(
                    BOQ.revision_number == revision_num,
                    func.lower(BOQ.status).in_([
                        'under_revision',
                        'pending_revision',
                        'revision_approved'
                    ]),
                    BOQ.is_deleted == False
                ).order_by(
                    BOQ.last_modified_at.desc()
                ).all()

        # Transform BOQ data for frontend
        boq_list = []
        for boq in boqs:
            # Get project details
            project = boq.project
            if not project:
                continue

            # Get BOQ details
            boq_details = BOQDetails.query.filter_by(
                boq_id=boq.boq_id,
                is_deleted=False
            ).first()

            total_cost = 0
            item_count = 0
            if boq_details:
                total_cost = boq_details.total_cost or 0
                item_count = boq_details.total_items or 0

            boq_data = {
                'boq_id': boq.boq_id,
                'boq_name': boq.boq_name,
                'project_id': boq.project_id,
                'project_name': project.project_name,
                'client': project.client,
                'location': project.location,
                'status': boq.status,
                'revision_number': boq.revision_number,
                'total_cost': total_cost,
                'item_count': item_count,
                'created_at': boq.created_at.isoformat() if boq.created_at else None,
                'created_by': boq.created_by,
                'last_modified_at': boq.last_modified_at.isoformat() if boq.last_modified_at else None,
                'last_modified_by': boq.last_modified_by,
                'email_sent': boq.email_sent
            }

            boq_list.append(boq_data)

        log.info(f"Found {len(boq_list)} projects for revision {revision_number}")
        return jsonify(boq_list), 200

    except Exception as e:
        log.error(f"Error getting projects for revision {revision_number}: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_revision_statistics():
    """
    Get statistics about revisions
    Returns overview data for dashboard
    """
    try:
        # Total projects in revision
        total_in_revision = db.session.query(func.count(BOQ.boq_id)).filter(
            BOQ.revision_number > 0,
            BOQ.is_deleted == False
        ).scalar()

        # Projects by revision level
        by_level = db.session.query(
            func.case(
                (BOQ.revision_number.between(1, 3), '1-3'),
                (BOQ.revision_number.between(4, 6), '4-6'),
                (BOQ.revision_number >= 7, '7+'),
                else_='0'
            ).label('level'),
            func.count(BOQ.boq_id).label('count')
        ).filter(
            BOQ.revision_number > 0,
            BOQ.is_deleted == False
        ).group_by('level').all()

        level_stats = {row.level: row.count for row in by_level}

        # Average days in revision (approximate based on last_modified_at)
        # This is a simplified calculation

        stats = {
            'total_in_revision': total_in_revision,
            'by_level': level_stats,
            'critical_count': level_stats.get('7+', 0)
        }

        return jsonify(stats), 200

    except Exception as e:
        log.error(f"Error getting revision statistics: {str(e)}")
        return jsonify({"error": str(e)}), 500
