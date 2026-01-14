from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import *
from config.logging import get_logger
from models.user import User
from models.change_request import ChangeRequest

log = get_logger()

# MEP Role variants for consistent role checking
MEP_ROLES = ['mep', 'mepsupervisor', 'mep_supervisor', 'mep supervisor', 'mep manager', 'mepmanager', 'mep_manager']
ALLOWED_VIEW_AS_ROLES = ['mep', 'mepsupervisor', 'mep_supervisor', 'mep supervisor', 'pm', 'projectmanager', 'project_manager']


# ============================================================================
# HELPER FUNCTIONS - DRY (Don't Repeat Yourself)
# ============================================================================

def get_user_role_context(endpoint_name: str = '') -> tuple:
    """
    Get user role context including admin view_as_role handling.
    Returns: (user_id, original_role, user_role, is_admin_viewing_as, error_response)

    Note: original_role is always the actual user's role (admin stays admin)
          user_role may change if admin uses view_as_role parameter
    """
    current_user = getattr(g, 'user', None)
    if not current_user:
        return None, None, None, False, (jsonify({'error': 'Authentication required'}), 401)

    user_id = current_user.get('user_id')
    original_role = current_user.get('role', '').lower() if current_user else ''
    user_role = original_role
    is_admin_viewing_as = False

    # Check for view_as_role parameter (for admin viewing as another role)
    view_as_role = request.args.get('view_as_role', '').lower()
    if original_role == 'admin' and view_as_role:
        if view_as_role in ALLOWED_VIEW_AS_ROLES:
            log.info(f"Admin {user_id} viewing {endpoint_name} as role: {view_as_role}")
            user_role = view_as_role
            is_admin_viewing_as = True
        else:
            log.warning(f"Admin {user_id} attempted invalid view_as_role: {view_as_role}")

    return user_id, original_role, user_role, is_admin_viewing_as, None


def get_pagination_params() -> tuple:
    """
    Get pagination parameters from request.
    Returns: (page, page_size)
    """
    page = request.args.get('page', type=int)
    page_size = request.args.get('page_size', default=20, type=int)
    page_size = min(page_size, 100)  # Cap at 100 items per page
    return page, page_size


def build_pagination_response(response: dict, page: int, page_size: int, total_count: int) -> dict:
    """
    Add pagination info to response if pagination was requested.
    """
    if page is not None:
        total_pages = (total_count + page_size - 1) // page_size
        response["pagination"] = {
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    return response


# ============================================================================
# MEP ENDPOINTS
# ============================================================================

def get_mep_approval_boq():
    """Get BOQs with Pending_PM_Approval status for the current Project Manager"""
    try:
        page, page_size = get_pagination_params()
        user_id, original_role, user_role, is_admin_viewing_as, error = get_user_role_context('mep_approval_boq')
        if error:
            return error

        # OPTIMIZED: Select only required columns
        query = (
            db.session.query(
                BOQ.boq_id,
                BOQ.boq_name,
                BOQ.project_id,
                BOQ.status,
                BOQ.client_status,
                BOQ.revision_number,
                BOQ.email_sent,
                BOQ.created_at,
                BOQ.created_by,
                BOQ.client_rejection_reason,
                BOQ.last_pm_user_id,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.start_date,
                Project.end_date,
                Project.location,
                Project.floor_name,
                Project.status,
                Project.working_hours,
                Project.user_id,
                User.full_name.label('last_pm_name')
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .filter(BOQ.is_deleted == False)
            .filter(Project.is_deleted == False)
            .filter(BOQ.status == 'Pending_PM_Approval')
            .order_by(BOQ.created_at.desc())
        )

        # Filter by role - Admin always sees ALL MEP data
        if original_role == 'admin':
            # Admin always sees all MEP-assigned projects
            log.info(f"Admin viewing mep_approval_boq - showing all MEP projects")
            query = query.filter(
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            )
        elif user_role in MEP_ROLES:
            # MEP sees only projects assigned to them
            mep_user_id = int(user_id) if user_id else None
            if mep_user_id:
                query = query.filter(Project.mep_supervisor_id.contains([mep_user_id]))
        elif user_role in ['projectmanager', 'project_manager']:
            # PM sees only BOQs assigned to them via last_pm_user_id
            query = query.filter(BOQ.last_pm_user_id == user_id)

        # OPTIMIZED: Only run count query when pagination is requested
        if page is not None:
            total_count = query.count()
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

        # OPTIMIZED: Direct mapping from query results (no N+1 queries)
        pm_approval_boqs = [
            {
                "boq_id": row.boq_id,
                "boq_name": row.boq_name,
                "project_id": row.project_id,
                "project_name": row.project_name,
                "project_code": row.project_code,
                "client": row.client,
                "location": row.location,
                "floor": row.floor_name,
                "hours": row.working_hours,
                "boq_status": row.status,
                "project_status" : row.Project.status,
                "start_date" : row.start_date,
                "end_date" : row.end_date,
                "client_status": row.client_status,
                "revision_number": row.revision_number or 0,
                "email_sent": row.email_sent,
                "user_id": row.user_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "created_by": row.created_by,
                "client_rejection_reason": row.client_rejection_reason,
                "last_pm_user_id": row.last_pm_user_id,
                "last_pm_name": row.last_pm_name
            }
            for row in rows
        ]

        # Build response
        response = {
            "message": "PM Approval BOQs retrieved successfully",
            "count": len(pm_approval_boqs),
            "data": pm_approval_boqs
        }
        response = build_pagination_response(response, page, page_size, total_count)

        return jsonify(response), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error retrieving PM Approval BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve PM Approval BOQs',
            'details': str(e)
        }), 500

def get_mep_assign_project():
    """Get BOQs that the current MEP has assigned to Site Supervisors - ONGOING (non-completed) via pm_assign_ss table"""
    try:
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import func, case

        page, page_size = get_pagination_params()
        user_id, original_role, user_role, is_admin_viewing_as, error = get_user_role_context('mep_assign_project')
        if error:
            return error

        # Subquery to calculate assignment counts for each BOQ
        # Count actual items from item_indices array, not just assignment rows
        assignment_counts = (
            db.session.query(
                PMAssignSS.boq_id,
                func.sum(
                    func.coalesce(func.cardinality(PMAssignSS.item_indices), 0)
                ).label('total_items_assigned'),
                func.sum(
                    case(
                        (PMAssignSS.pm_confirmed_completion == True, func.coalesce(func.cardinality(PMAssignSS.item_indices), 0)),
                        else_=0
                    )
                ).label('confirmed_items_count'),
                func.sum(
                    case(
                        (PMAssignSS.se_completion_requested == True, func.coalesce(func.cardinality(PMAssignSS.item_indices), 0)),
                        else_=0
                    )
                ).label('completion_requested_items_count')
            )
            .filter(PMAssignSS.is_deleted == False)
            .group_by(PMAssignSS.boq_id)
            .subquery()
        )

        # Import BOQDetails to get total_items count
        from models.boq import BOQDetails
        from sqlalchemy import text

        # Subquery to get total items from boq_details
        # Use total_items column directly as it's already calculated and stored correctly
        # Note: boq_details JSONB structure is {items: [...]} not an array at root
        boq_items_count_subquery = (
            db.session.query(
                BOQDetails.boq_id,
                func.coalesce(BOQDetails.total_items, 0).label('total_items')
            )
            .filter(BOQDetails.is_deleted == False)
            .subquery()
        )

        # Query BOQs that current PM has assigned to SS via pm_assign_ss table
        # Select specific columns to avoid grouping issues
        query = (
            db.session.query(
                Project.project_id,
                Project.project_code,
                Project.project_name,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.area,
                Project.work_type,
                Project.start_date,
                Project.end_date,
                Project.duration_days,
                Project.description,
                Project.user_id,
                Project.created_at,
                Project.created_by,
                Project.status.label('project_status'),
                BOQ.status.label('boq_status'),
                BOQ.boq_id,
                BOQ.boq_name,
                func.coalesce(boq_items_count_subquery.c.total_items, 0).label('total_boq_items'),
                func.coalesce(assignment_counts.c.total_items_assigned, 0).label('total_items_assigned'),
                func.coalesce(assignment_counts.c.confirmed_items_count, 0).label('confirmed_items_count'),
                func.coalesce(assignment_counts.c.completion_requested_items_count, 0).label('completion_requested_items_count')
            )
            .join(BOQ, Project.project_id == BOQ.project_id)
            .join(PMAssignSS, BOQ.boq_id == PMAssignSS.boq_id)
            .outerjoin(boq_items_count_subquery, BOQ.boq_id == boq_items_count_subquery.c.boq_id)
            .outerjoin(assignment_counts, BOQ.boq_id == assignment_counts.c.boq_id)
            .filter(
                Project.is_deleted == False,
                BOQ.is_deleted == False,
                PMAssignSS.is_deleted == False,
                # FILTER: Only show ongoing (non-completed) projects
                ~Project.status.in_(['completed', 'Completed'])
            )
        )

        # Filter by role - Admin sees ALL assignments, MEP sees only their assignments
        if original_role == 'admin':
            # Admin sees all MEP-assigned projects (no filter on assigned_by_pm_id)
            log.info(f"Admin viewing mep_assign_project - showing all MEP assignments")
            # Only filter to MEP-assigned projects
            query = query.filter(
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            )
        else:
            # MEP sees only their own assignments
            query = query.filter(PMAssignSS.assigned_by_pm_id == user_id)

        query = query.group_by(
            Project.project_id,
            Project.project_code,
            Project.project_name,
            Project.client,
            Project.location,
            Project.floor_name,
            Project.working_hours,
            Project.area,
            Project.work_type,
            Project.start_date,
            Project.end_date,
            Project.duration_days,
            Project.description,
            Project.user_id,
            Project.created_at,
            Project.created_by,
            Project.status,
            BOQ.boq_id,
            BOQ.status,
            BOQ.boq_name,
            boq_items_count_subquery.c.total_items,
            assignment_counts.c.total_items_assigned,
            assignment_counts.c.confirmed_items_count,
            assignment_counts.c.completion_requested_items_count
        ).order_by(Project.created_at.desc())

        # Pagination
        if page is not None:
            total_count = query.count()
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

        # Map results
        projects = []
        for row in rows:
            # Debug logging
            log.info(f"BOQ {row.boq_id}: total_boq_items={row.total_boq_items}, total_items_assigned={row.total_items_assigned}, confirmed={row.confirmed_items_count}")

            project_data = {
                "project_id": row.project_id,
                "project_code": row.project_code,
                "project_name": row.project_name,
                "client": row.client,
                "location": row.location,
                "floor_name": row.floor_name,
                "working_hours": row.working_hours,
                "area": row.area,
                "work_type": row.work_type,
                "start_date": row.start_date.isoformat() if row.start_date else None,
                "end_date": row.end_date.isoformat() if row.end_date else None,
                "duration_days": row.duration_days,
                "status": row.boq_status,
                "project_status": row.project_status,
                "boq_status": row.boq_status,
                "boq_id": row.boq_id,
                "boq_name": row.boq_name,
                "description": row.description,
                "user_id": row.user_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "created_by": row.created_by,
                # Assignment counts from pm_assign_ss table (counting actual items from item_indices)
                "total_boq_items": int(row.total_boq_items) if row.total_boq_items else 0,  # Total items in BOQ
                "total_items_assigned": int(row.total_items_assigned) if row.total_items_assigned else 0,  # Items assigned to SS
                "confirmed_items_count": int(row.confirmed_items_count) if row.confirmed_items_count else 0,  # Items confirmed by PM
                "completion_requested_items_count": int(row.completion_requested_items_count) if row.completion_requested_items_count else 0,  # Items SE completed
                # Formatted strings for frontend display
                # items_assigned shows: "Items assigned to SS / Total BOQ items" (e.g., "1/2" means 1 assigned out of 2 total)
                "items_assigned": f"{int(row.total_items_assigned) if row.total_items_assigned else 0}/{int(row.total_boq_items) if row.total_boq_items else 0}",
                # confirmations shows: "PM confirmed / Items assigned to SS" (e.g., "0/1", "1/2")
                "confirmations": f"{int(row.confirmed_items_count) if row.confirmed_items_count else 0}/{int(row.total_items_assigned) if row.total_items_assigned else 0}"
            }
            projects.append(project_data)

        # Build response
        response = {
            "message": "MEP assigned projects retrieved successfully",
            "count": len(projects),
            "data": projects
        }
        response = build_pagination_response(response, page, page_size, total_count)

        return jsonify(response), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error retrieving MEP assigned projects: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve MEP assigned projects',
            'details': str(e)
        }), 500

def get_mep_approved_boq():
    """Get projects assigned to the current MEP based on Project.mep_supervisor_id (JSONB array)"""
    try:
        page, page_size = get_pagination_params()
        user_id, original_role, user_role, is_admin_viewing_as, error = get_user_role_context('mep_approved_boq')
        if error:
            return error

        # OPTIMIZED: Select only required columns
        query = (
            db.session.query(
                BOQ.boq_id,
                BOQ.boq_name,
                BOQ.project_id,
                BOQ.status.label('boq_status'),
                BOQ.client_status,
                BOQ.revision_number,
                BOQ.email_sent,
                BOQ.created_at,
                BOQ.created_by,
                BOQ.client_rejection_reason,
                BOQ.last_pm_user_id,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.start_date,
                Project.end_date,
                Project.user_id,
                Project.status.label('project_status'),
                User.full_name.label('last_pm_name')
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .filter(BOQ.is_deleted == False)
            .filter(Project.is_deleted == False)
            .order_by(BOQ.created_at.desc())
        )

        # Filter by role - Admin always sees ALL MEP data
        if original_role == 'admin':
            # Admin always sees all MEP-assigned projects
            log.info(f"Admin viewing mep_approved_boq - showing all MEP projects")
            query = query.filter(
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            )
        elif user_role in MEP_ROLES:
            # MEP sees only projects where their user_id is in mep_supervisor_id JSONB array
            mep_user_id = int(user_id) if user_id else None
            if mep_user_id:
                query = query.filter(Project.mep_supervisor_id.contains([mep_user_id]))
        else:
            # PM sees only BOQs where they are the last PM
            query = query.filter(BOQ.last_pm_user_id == user_id)

        # OPTIMIZED: Only run count query when pagination is requested
        if page is not None:
            total_count = query.count()
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

        # OPTIMIZED: Direct mapping from query results (no N+1 queries)
        pm_approval_boqs = [
            {
                "boq_id": row.boq_id,
                "boq_name": row.boq_name,
                "project_id": row.project_id,
                "project_name": row.project_name,
                "project_code": row.project_code,
                "project_status": row.project_status,
                "client": row.client,
                "location": row.location,
                "floor": row.floor_name,
                "hours": row.working_hours,
                "status": row.boq_status,
                "boq_status": row.boq_status,
                "start_date": row.start_date.isoformat() if row.start_date else None,
                "end_date": row.end_date.isoformat() if row.end_date else None,
                "client_status": row.client_status,
                "revision_number": row.revision_number or 0,
                "email_sent": row.email_sent,
                "user_id": row.user_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "created_by": row.created_by,
                "client_rejection_reason": row.client_rejection_reason,
                "last_pm_user_id": row.last_pm_user_id,
                "last_pm_name": row.last_pm_name
            }
            for row in rows
        ]

        # Build response
        response = {
            "message": "MEP Approval BOQs retrieved successfully",
            "count": len(pm_approval_boqs),
            "data": pm_approval_boqs
        }
        response = build_pagination_response(response, page, page_size, total_count)

        return jsonify(response), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error retrieving MEP Approval BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve MEP Approval BOQs',
            'details': str(e)
        }), 500

def get_mep_pending_boq():
    """Get pending projects assigned to the current MEP - projects with approved BOQs not yet completed + items_assigned projects where MEP hasn't made assignments"""
    try:
        from sqlalchemy import func, or_, and_, exists
        from models.pm_assign_ss import PMAssignSS

        page, page_size = get_pagination_params()
        user_id, original_role, user_role, is_admin_viewing_as, error = get_user_role_context('mep_pending_boq')
        if error:
            return error

        # Query projects with approved BOQs that are pending MEP work
        # We join with BOQ to ensure the project has an approved BOQ and get BOQ status
        query = (
            db.session.query(
                Project,
                BOQ.status.label('boq_status'),
                BOQ.boq_id,
                BOQ.boq_name
            )
            .join(BOQ, Project.project_id == BOQ.project_id)
            .filter(Project.is_deleted == False)
            .filter(BOQ.is_deleted == False)
            .filter(Project.status.notin_(['completed', 'Completed']))
        )

        # Filter by role - Admin always sees ALL MEP data
        if original_role == 'admin':
            # Admin sees all MEP-assigned pending projects
            log.info(f"Admin viewing mep_pending_boq - showing all MEP pending projects")
            query = query.filter(
                BOQ.status.in_(['approved', 'Approved', 'items_assigned']),
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            )
        elif user_role in ['projectmanager', 'project_manager']:
            # PM sees only projects where their user_id is in Project.user_id JSONB array
            pm_user_id = int(user_id) if user_id else None
            if pm_user_id:
                query = query.filter(Project.user_id.contains([pm_user_id]))
                query = query.filter(BOQ.status.in_(['approved', 'Approved']))
        elif user_role in MEP_ROLES:
            # MEP sees only projects where their user_id is in mep_supervisor_id JSONB array
            mep_user_id = int(user_id) if user_id else None
            if mep_user_id:
                query = query.filter(Project.mep_supervisor_id.contains([mep_user_id]))

                # Create a subquery to check if MEP has made ANY assignments for this BOQ
                mep_has_assignments = exists().where(
                    and_(
                        PMAssignSS.boq_id == BOQ.boq_id,
                        PMAssignSS.assigned_by_pm_id == mep_user_id,
                        PMAssignSS.is_deleted == False
                    )
                )

                # Add condition: Show projects with status 'approved' OR
                # projects with status 'items_assigned' where MEP hasn't made ANY assignments
                query = query.filter(
                    or_(
                        BOQ.status.in_(['approved', 'Approved']),
                        and_(
                            BOQ.status == 'items_assigned',
                            ~mep_has_assignments  # NOT EXISTS - MEP has no assignments for this BOQ
                        )
                    )
                )

        # Use distinct to avoid duplicate projects if multiple BOQs exist
        query = query.distinct().order_by(Project.created_at.desc())

        # Pagination
        if page is not None:
            total_count = query.count()
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

        # Map results
        projects = [
            {
                "project_id": row.Project.project_id,
                "project_code": row.Project.project_code,
                "project_name": row.Project.project_name,
                "project_status": row.Project.status,
                "client": row.Project.client,
                "location": row.Project.location,
                "floor_name": row.Project.floor_name,
                "working_hours": row.Project.working_hours,
                "area": row.Project.area,
                "work_type": row.Project.work_type,
                "start_date": row.Project.start_date.isoformat() if row.Project.start_date else None,
                "end_date": row.Project.end_date.isoformat() if row.Project.end_date else None,
                "duration_days": row.Project.duration_days,
                "boq_status": row.boq_status,
                "boq_id": row.boq_id,
                "boq_name": row.boq_name,
                "description": row.Project.description,
                "user_id": row.Project.user_id,
                "created_at": row.Project.created_at.isoformat() if row.Project.created_at else None,
                "created_by": row.Project.created_by
            }
            for row in rows
        ]

        # Build response
        response = {
            "message": "MEP pending projects retrieved successfully",
            "count": len(projects),
            "data": projects
        }
        response = build_pagination_response(response, page, page_size, total_count)

        return jsonify(response), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error retrieving MEP pending projects: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve MEP pending projects',
            'details': str(e)
        }), 500

def get_mep_rejected_boq():
    """
    Get MEP Rejected BOQs - Shows BOQs with status 'PM_Rejected'
    filtered by Project.mep_supervisor_id for MEP users
    """
    try:
        page, page_size = get_pagination_params()
        user_id, original_role, user_role, is_admin_viewing_as, error = get_user_role_context('mep_rejected_boq')
        if error:
            return error

        # Build query - select only needed columns
        query = (
            db.session.query(
                BOQ.boq_id,
                BOQ.boq_name,
                BOQ.project_id,
                BOQ.status,
                BOQ.client_status,
                BOQ.revision_number,
                BOQ.email_sent,
                BOQ.created_at,
                BOQ.created_by,
                BOQ.client_rejection_reason,
                BOQ.last_pm_user_id,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.start_date,
                Project.end_date,
                Project.status.label('project_status'),
                Project.working_hours,
                Project.user_id,
                User.full_name.label('last_pm_name')
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .filter(BOQ.is_deleted == False)
            .filter(Project.is_deleted == False)
            .filter(BOQ.status == 'PM_Rejected')
            .order_by(BOQ.created_at.desc())
        )

        # Filter by role - Admin always sees ALL MEP data
        if original_role == 'admin':
            # Admin always sees all MEP-assigned rejected BOQs
            log.info(f"Admin viewing mep_rejected_boq - showing all MEP rejected BOQs")
            query = query.filter(
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            )
        elif user_role in MEP_ROLES:
            # MEP sees only rejected BOQs for projects where their user_id is in mep_supervisor_id
            mep_user_id = int(user_id) if user_id else None
            if mep_user_id:
                query = query.filter(Project.mep_supervisor_id.contains([mep_user_id]))
        else:
            # PM sees only rejected BOQs where they are the last PM
            query = query.filter(BOQ.last_pm_user_id == user_id)

        # Pagination
        if page is not None:
            total_count = query.count()
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

        # Build response data
        pm_rejected_boqs = [
            {
                "boq_id": row.boq_id,
                "boq_name": row.boq_name,
                "project_id": row.project_id,
                "project_name": row.project_name,
                "project_code": row.project_code,
                "project_status": row.project_status,
                "client": row.client,
                "location": row.location,
                "floor": row.floor_name,
                "hours": row.working_hours,
                "boq_status": row.status,
                "client_status": row.client_status,
                "revision_number": row.revision_number or 0,
                "email_sent": row.email_sent,
                "user_id": row.user_id,
                "start_date": row.start_date,
                "end_date": row.end_date,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "created_by": row.created_by,
                "client_rejection_reason": row.client_rejection_reason,
                "last_pm_user_id": row.last_pm_user_id,
                "last_pm_name": row.last_pm_name
            }
            for row in rows
        ]

        # Build response
        response = {
            "message": "MEP Rejected BOQs retrieved successfully",
            "count": len(pm_rejected_boqs),
            "data": pm_rejected_boqs
        }
        response = build_pagination_response(response, page, page_size, total_count)

        return jsonify(response), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error retrieving MEP Rejected BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve MEP Rejected BOQs',
            'details': str(e)
        }), 500


def get_mep_completed_project():
    """Get completed projects assigned to the current MEP based on Project.mep_supervisor_id (JSONB array)"""
    try:
        page, page_size = get_pagination_params()
        user_id, original_role, user_role, is_admin_viewing_as, error = get_user_role_context('mep_completed_project')
        if error:
            return error

        # Query completed projects assigned to current MEP - Include BOQ info for details view
        query = (
            db.session.query(
                Project.project_id,
                Project.project_code,
                Project.project_name,
                Project.status.label('project_status'),
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.area,
                Project.work_type,
                Project.start_date,
                Project.end_date,
                Project.duration_days,
                Project.description,
                Project.user_id,
                Project.completion_requested,
                Project.total_se_assignments,
                Project.confirmed_completions,
                Project.created_at,
                Project.created_by,
                BOQ.boq_id,
                BOQ.boq_name,
                BOQ.status.label('boq_status')
            )
            .outerjoin(BOQ, (Project.project_id == BOQ.project_id) & (BOQ.is_deleted == False))
            .filter(Project.is_deleted == False)
            .filter(Project.status.in_(['completed', 'Completed']))
            .order_by(Project.created_at.desc())
        )

        # Filter by role - Admin always sees ALL MEP data
        if original_role == 'admin':
            # Admin always sees all MEP-assigned completed projects
            log.info(f"Admin viewing mep_completed_project - showing all MEP completed projects")
            query = query.filter(
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            )
        elif user_role in ['projectmanager', 'project_manager']:
            # PM sees only completed projects where their user_id is in Project.user_id JSONB array
            query = query.filter(Project.user_id.contains([user_id]))
        elif user_role in MEP_ROLES:
            # MEP sees only completed projects where their user_id is in mep_supervisor_id JSONB array
            mep_user_id = int(user_id) if user_id else None
            if mep_user_id:
                query = query.filter(Project.mep_supervisor_id.contains([mep_user_id]))

        # Pagination
        if page is not None:
            total_count = query.count()
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

        # Map results - Include BOQ info for details view
        projects = [
            {
                "project_id": row.project_id,
                "project_code": row.project_code,
                "project_name": row.project_name,
                "project_status": row.project_status,
                "client": row.client,
                "location": row.location,
                "floor_name": row.floor_name,
                "working_hours": row.working_hours,
                "area": row.area,
                "work_type": row.work_type,
                "start_date": row.start_date.isoformat() if row.start_date else None,
                "end_date": row.end_date.isoformat() if row.end_date else None,
                "duration_days": row.duration_days,
                "boq_id": row.boq_id,
                "boq_name": row.boq_name,
                "boq_status": row.boq_status or row.project_status,
                "description": row.description,
                "user_id": row.user_id,
                "completion_requested": row.completion_requested,
                "total_se_assignments": row.total_se_assignments,
                "confirmed_completions": row.confirmed_completions,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "created_by": row.created_by
            }
            for row in rows
        ]

        # Build response
        response = {
            "message": "MEP completed projects retrieved successfully",
            "count": len(projects),
            "data": projects
        }
        response = build_pagination_response(response, page, page_size, total_count)

        return jsonify(response), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error retrieving MEP completed projects: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve MEP completed projects',
            'details': str(e)
        }), 500

def get_mep_dashboard():
    """Get COMPREHENSIVE dashboard statistics for MEP Supervisor

    Includes:
    1. Total BOQ items across all assigned projects
    2. Items assigned to Site Engineers
    3. Pending assignments
    4. Total project value
    5. BOQ status breakdown
    6. BOQ items breakdown (Materials vs Labour)
    7. Recent activities
    """
    try:
        from models.pm_assign_ss import PMAssignSS
        from models.boq import BOQ, BOQDetails
        from models.project import Project
        from sqlalchemy import func, or_, and_, case

        user_id, original_role, user_role, is_admin_viewing_as, error = get_user_role_context('mep_dashboard')
        if error:
            return error

        # Additional validation for dashboard - reject invalid view_as_role
        view_as_role = request.args.get('view_as_role', '').lower()
        if original_role == 'admin' and view_as_role and view_as_role not in ALLOWED_VIEW_AS_ROLES:
            log.warning(f"Admin {user_id} attempted invalid view_as_role: {view_as_role}")
            return jsonify({'error': f'Invalid view_as_role: {view_as_role}'}), 400

        # Get projects assigned to this PM or MEP
        # IMPORTANT: Admin always sees ALL MEP data (regardless of view_as_role)
        if original_role == 'admin':
            # Admin viewing MEP dashboard - always show ALL MEP-assigned projects
            log.info(f"Admin {user_id} viewing MEP dashboard - showing all MEP projects")
            assigned_projects = Project.query.filter(
                Project.is_deleted == False,
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            ).all()
            log.info(f"Admin MEP Dashboard: Found {len(assigned_projects)} MEP-assigned projects")
        elif user_role in MEP_ROLES:
            # Actual MEP user - filter by their user_id in mep_supervisor_id
            mep_user_id = int(user_id) if user_id else None
            log.info(f"MEP Dashboard: Filtering for MEP user_id={mep_user_id}, role={user_role}")
            if mep_user_id:
                assigned_projects = Project.query.filter(
                    Project.is_deleted == False,
                    Project.mep_supervisor_id.contains([mep_user_id])
                ).all()
                log.info(f"MEP Dashboard: Found {len(assigned_projects)} projects for MEP user_id={mep_user_id}")
            else:
                assigned_projects = []
        else:
            # PM sees only their assigned projects
            pm_user_id = int(user_id) if user_id else None
            if pm_user_id:
                assigned_projects = Project.query.filter(
                    Project.is_deleted == False,
                    Project.user_id.contains([pm_user_id])
                ).all()
            else:
                assigned_projects = []

        project_ids = [p.project_id for p in assigned_projects]

        # If no projects, return empty stats
        if not project_ids:
            return jsonify({
                "success": True,
                "stats": {
                    "total_boq_items": 0,
                    "items_assigned": 0,
                    "pending_assignment": 0,
                    "total_project_value": 0
                },
                "tab_counts": {
                    "for_approval": 0,
                    "pending": 0,
                    "assigned": 0,
                    "approved": 0,
                    "rejected": 0,
                    "completed": 0
                },
                "boq_status": {
                    "for_approval": 0,
                    "pending": 0,
                    "assigned": 0,
                    "approved": 0,
                    "rejected": 0,
                    "completed": 0
                },
                "items_breakdown": {
                    "materials": 0,
                    "labour": 0
                },
                "recent_activities": [],
                "projects": []
            }), 200

        # Get all BOQs for these projects
        boqs = BOQ.query.filter(
            BOQ.project_id.in_(project_ids),
            BOQ.is_deleted == False
        ).all()

        # Calculate statistics
        total_boq_items = 0
        total_materials = 0
        total_labour = 0
        total_project_value = 0

        # Check MEP assignments for categorizing 'items_assigned' status
        mep_user_id_int = int(user_id) if user_id else None

        # COUNT PROJECTS PER TAB (not BOQ statuses)
        # These counts should match the tab counts in My Projects page
        tab_counts = {
            "for_approval": 0,
            "pending": 0,
            "assigned": 0,
            "approved": 0,
            "rejected": 0,
            "completed": 0
        }

        for boq in boqs:
            # Get BOQ details
            boq_details = BOQDetails.query.filter_by(
                boq_id=boq.boq_id,
                is_deleted=False
            ).first()

            if boq_details:
                boq_cost = float(boq_details.total_cost or 0)
                total_boq_items += boq_details.total_items or 0
                total_materials += boq_details.total_materials or 0
                total_labour += boq_details.total_labour or 0
                total_project_value += boq_cost

            # Categorize BOQ into tabs (MUST MATCH the tab endpoint logic)
            status = boq.status.lower() if boq.status else ''
            project = Project.query.get(boq.project_id)

            # Check if there are assignments for this BOQ
            # For MEP dashboard, we check if ANY MEP has made assignments (not PM assignments)
            # IMPORTANT: Check original_role first to handle admin viewing as MEP correctly
            if original_role == 'admin':
                # Admin viewing MEP dashboard: Check if ANY MEP has made assignments
                # Get all MEP user IDs for this project
                project_mep_ids = project.mep_supervisor_id if project and project.mep_supervisor_id else []
                if project_mep_ids:
                    has_assignment = PMAssignSS.query.filter(
                        PMAssignSS.boq_id == boq.boq_id,
                        PMAssignSS.assigned_by_pm_id.in_(project_mep_ids),
                        PMAssignSS.is_deleted == False
                    ).first() is not None
                else:
                    has_assignment = False
            elif user_role in MEP_ROLES:
                # Actual MEP user: Check if THIS MEP has made assignments
                has_assignment = PMAssignSS.query.filter(
                    PMAssignSS.boq_id == boq.boq_id,
                    PMAssignSS.assigned_by_pm_id == mep_user_id_int,
                    PMAssignSS.is_deleted == False
                ).first() is not None
            else:
                # Other roles: No assignment check
                has_assignment = False

            # 1. FOR APPROVAL TAB: BOQs with 'Pending_PM_Approval' status
            if 'pending_pm_approval' in status:
                tab_counts["for_approval"] += 1

            # 2. PENDING TAB: BOQs with 'approved' status (any case) OR 'items_assigned' where NO assignments exist
            elif 'approved' in status or (status == 'items_assigned' and not has_assignment):
                tab_counts["pending"] += 1

            # 3. ASSIGNED TAB: BOQs with 'items_assigned' where assignments exist
            elif status == 'items_assigned' and has_assignment:
                tab_counts["assigned"] += 1

            # 4. APPROVED TAB: Same as Pending + Assigned (all approved BOQs including items_assigned)
            # Note: We'll calculate this after the loop

            # 5. REJECTED TAB: BOQs with rejected statuses
            elif 'rejected' in status:
                tab_counts["rejected"] += 1

            # 6. COMPLETED TAB: Projects with 'Completed' status
            elif project and project.status and 'completed' in project.status.lower():
                tab_counts["completed"] += 1

        # Calculate APPROVED count: Pending + Assigned
        tab_counts["approved"] = tab_counts["pending"] + tab_counts["assigned"]

        # Get item assignments to Site Engineers made BY THIS MEP
        boq_ids = [b.boq_id for b in boqs]

        # Get all assignments for MEP-assigned projects
        # Don't filter by assigned_by_pm_id because MEP should see all assignments in their projects
        item_assignments = PMAssignSS.query.filter(
            PMAssignSS.boq_id.in_(boq_ids),
            PMAssignSS.is_deleted == False
        ).all()

        # Count actual items assigned (not just assignment records)
        # Each assignment record can have multiple items in item_indices array
        items_assigned_count = 0
        for assignment in item_assignments:
            if assignment.item_indices and isinstance(assignment.item_indices, list):
                items_assigned_count += len(assignment.item_indices)
            else:
                # If no item_indices, count as 1 item
                items_assigned_count += 1

        items_assigned = items_assigned_count
        pending_assignment = total_boq_items - items_assigned

        # Get recent activities (last 10 BOQs)
        recent_boqs = BOQ.query.filter(
            BOQ.project_id.in_(project_ids),
            BOQ.is_deleted == False
        ).order_by(BOQ.last_modified_at.desc()).limit(10).all()

        recent_activities = []
        for boq in recent_boqs:
            project = Project.query.get(boq.project_id)
            recent_activities.append({
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "project_name": project.project_name if project else None,
                "status": boq.status,
                "last_modified": boq.last_modified_at.isoformat() if boq.last_modified_at else None
            })

        # Get project progress information
        projects_with_progress = []
        for project in assigned_projects:
            # Calculate project progress based on BOQ completion
            project_boqs = [b for b in boqs if b.project_id == project.project_id]
            total_project_boqs = len(project_boqs)

            if total_project_boqs > 0:
                completed_boqs = sum(1 for b in project_boqs if b.status and 'completed' in b.status.lower())
                progress_percentage = int((completed_boqs / total_project_boqs) * 100)
            else:
                progress_percentage = 0

            projects_with_progress.append({
                "project_id": project.project_id,
                "project_name": project.project_name,
                "status": project.status,
                "progress": progress_percentage
            })

        # Purchase Order Status (Change Requests) for MEP's projects
        # IMPORTANT: Apply role-specific filtering to match Material Purchase page logic
        # MEP should only see: their own requests, SE requests sent to them, MEP/Admin originated requests
        from config.change_request_config import CR_CONFIG

        cr_base_filters = [
            ChangeRequest.project_id.in_(project_ids) if project_ids else ChangeRequest.project_id == -1,
            ChangeRequest.is_deleted == False
        ]

        # Define MEP role variants for case-insensitive matching
        mep_role_variants = ['mep', 'mepsupervisor', 'mep_supervisor']

        # Build role-specific filter for MEP (matching change_request_controller.py logic)
        # NOTE: For MEP dashboard, we should ONLY count MEP-related change requests
        # This means: MEP-originated requests OR requests routed through MEP workflow
        # NOT: PM-originated requests (those belong to PM dashboard)
        if original_role == 'admin':
            # Admin viewing MEP dashboard - show ONLY MEP-related requests
            # Filter out PM-originated requests to match what MEP users would see
            mep_visibility_filter = or_(
                # MEP-originated requests (any status)
                func.lower(ChangeRequest.requested_by_role).in_(mep_role_variants),
                # SE requests sent to MEP (not to PM)
                and_(
                    ChangeRequest.status == CR_CONFIG.STATUS_SEND_TO_MEP,
                    ChangeRequest.current_approver_role == CR_CONFIG.ROLE_MEP
                ),
                # SE-originated requests that went through MEP approval workflow
                and_(
                    func.lower(ChangeRequest.requested_by_role).in_(['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor']),
                    ChangeRequest.current_approver_role == CR_CONFIG.ROLE_MEP
                )
            )
        elif user_role in MEP_ROLES:
            # Regular MEP user - apply strict visibility rules
            mep_visibility_filter = or_(
                # MEP-originated pending requests
                and_(
                    func.lower(ChangeRequest.requested_by_role).in_(mep_role_variants),
                    ChangeRequest.status == CR_CONFIG.STATUS_PENDING
                ),
                # SE requests sent specifically to THIS MEP
                and_(
                    ChangeRequest.status == CR_CONFIG.STATUS_SEND_TO_MEP,
                    ChangeRequest.current_approver_role == CR_CONFIG.ROLE_MEP,
                    ChangeRequest.assigned_to_pm_user_id == mep_user_id_int
                ),
                # Admin-originated requests
                func.lower(ChangeRequest.requested_by_role) == 'admin',
                # SE-originated requests assigned to this MEP (approved/completed)
                and_(
                    ChangeRequest.assigned_to_pm_user_id == mep_user_id_int,
                    ChangeRequest.status.in_(CR_CONFIG.MEP_APPROVED_STATUSES)
                ),
                # MEP/Admin originated approved requests
                and_(
                    ChangeRequest.status.in_(CR_CONFIG.MEP_APPROVED_STATUSES),
                    func.lower(ChangeRequest.requested_by_role).in_(mep_role_variants + ['admin']),
                    ChangeRequest.assigned_to_pm_user_id.is_(None)
                ),
                # User's own requests
                ChangeRequest.requested_by_user_id == mep_user_id_int
            )
        else:
            # Other roles: show only user's own requests
            mep_visibility_filter = ChangeRequest.requested_by_user_id == mep_user_id_int

        po_status_counts = db.session.query(
            # Sent to Buyer: under_review (buyer) OR assigned_to_buyer
            func.count(func.distinct(case(
                (or_(
                    and_(ChangeRequest.status == CR_CONFIG.STATUS_UNDER_REVIEW, ChangeRequest.approval_required_from == CR_CONFIG.ROLE_BUYER),
                    ChangeRequest.status == CR_CONFIG.STATUS_ASSIGNED_TO_BUYER
                ), ChangeRequest.cr_id),
                else_=None
            ))).label('sent_to_buyer'),
            # SE Requested: send_to_mep (only requests sent to THIS MEP)
            func.count(func.distinct(case(
                (ChangeRequest.status == CR_CONFIG.STATUS_SEND_TO_MEP, ChangeRequest.cr_id),
                else_=None
            ))).label('se_requested'),
            # Completed: purchase_completed OR routed_to_store
            func.count(func.distinct(case(
                (ChangeRequest.status.in_([CR_CONFIG.STATUS_PURCHASE_COMPLETE, 'routed_to_store']), ChangeRequest.cr_id),
                else_=None
            ))).label('completed'),
            # Rejected: status = 'rejected'
            func.count(func.distinct(case(
                (ChangeRequest.status == CR_CONFIG.STATUS_REJECTED, ChangeRequest.cr_id),
                else_=None
            ))).label('rejected')
        ).filter(
            *cr_base_filters,
            mep_visibility_filter
        ).first()

        purchase_order_status = {
            "sent_to_buyer": po_status_counts.sent_to_buyer or 0,
            "se_requested": po_status_counts.se_requested or 0,
            "completed": po_status_counts.completed or 0,
            "rejected": po_status_counts.rejected or 0
        }

        # Top 5 High Budget Projects - Calculate from BOQ details
        project_budgets = {}
        for boq in boqs:
            boq_details = BOQDetails.query.filter_by(
                boq_id=boq.boq_id,
                is_deleted=False
            ).first()

            if boq_details and boq_details.boq_details:
                boq_json = boq_details.boq_details if isinstance(boq_details.boq_details, dict) else {}
                summary = boq_json.get('summary') or boq_json.get('combined_summary') or {}

                # Try to get grand total from summary
                grand_total = summary.get('total_cost') or summary.get('selling_price') or 0

                # If no summary total, calculate from items
                if not grand_total:
                    items = boq_json.get('items', [])
                    grand_total = sum(float(item.get('total_cost', 0) or 0) for item in items)

                project_id = boq.project_id
                if project_id not in project_budgets:
                    project_budgets[project_id] = 0
                project_budgets[project_id] += float(grand_total or 0)

        top_budget_projects = [
            {
                "project_id": p.project_id,
                "project_name": p.project_name,
                "location": p.location,
                "client": p.client,
                "budget": round(project_budgets.get(p.project_id, 0), 2)
            }
            for p in assigned_projects
        ]

        # Sort by budget descending and take top 5
        top_budget_projects = sorted(top_budget_projects, key=lambda x: x['budget'], reverse=True)[:5]

        return jsonify({
            "success": True,
            "stats": {
                "total_boq_items": total_boq_items,  # Total LINE ITEMS count across all BOQs
                "items_assigned": items_assigned,  # Count of ITEMS assigned (from item_indices)
                "pending_assignment": pending_assignment,  # Count of ITEMS not yet assigned
                "total_projects": len(project_ids),
                "total_project_value": len(project_ids)
            },
            "tab_counts": tab_counts,  # Tab counts matching My Projects page
            "boq_status": {
                "for_approval": tab_counts["for_approval"],
                "pending": tab_counts["pending"],
                "assigned": tab_counts["assigned"],
                "approved": tab_counts["approved"],
                "rejected": tab_counts["rejected"],
                "completed": tab_counts["completed"]
            },
            "items_breakdown": {
                "materials": total_materials,
                "labour": total_labour
            },
            "purchase_order_status": purchase_order_status,
            "top_budget_projects": top_budget_projects,
            "recent_activities": recent_activities,
            "projects": projects_with_progress
        }), 200

    except Exception as e:
        log.error(f"Error getting MEP dashboard stats: {str(e)}")
        import traceback
        log.error(traceback.format_exc())
        return jsonify({
            "error": "Failed to retrieve dashboard statistics",
            "details": str(e)
        }), 500
