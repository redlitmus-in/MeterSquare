from flask import request, jsonify, g
from sqlalchemy.orm import selectinload, joinedload, defer
from config.db import db
from models.project import Project
from models.boq import *
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError
from utils.boq_email_service import BOQEmailService
from utils.response_cache import cached_response, invalidate_cache  # ✅ PERFORMANCE: Response caching
from utils.comprehensive_notification_service import notification_service
from models.user import User
from models.role import Role
from datetime import datetime

log = get_logger()


def get_mep_approval_boq():
    """Get BOQs with Pending_PM_Approval status for the current Project Manager"""
    try:
        # PERFORMANCE: Optional pagination support (backward compatible)
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)  # Cap at 100 items per page

        # Get current logged-in user
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

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

        # Filter by BOQ.last_pm_user_id (the PM this BOQ was sent to)
        # Admin viewing MEP role sees only projects with MEP assigned
        if user_role == 'admin':
            # Admin sees only projects where mep_supervisor_id is not null (MEP assigned projects)
            query = query.filter(
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            )
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

        # PERFORMANCE: Optional pagination support
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        # Get current logged-in user
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

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
                PMAssignSS.assigned_by_pm_id == user_id,
                # FILTER: Only show ongoing (non-completed) projects
                ~Project.status.in_(['completed', 'Completed'])
            )
            .group_by(
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
            )
            .order_by(Project.created_at.desc())
        )

        # Admin can see all assignments, PM/MEP see only their own
        if user_role == 'admin':
            # Remove the user filter for admin
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
                    ~Project.status.in_(['completed', 'Completed']),
                    # Admin sees only MEP-assigned projects
                    Project.mep_supervisor_id.isnot(None),
                    Project.mep_supervisor_id != []
                )
                .group_by(
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
                )
                .order_by(Project.created_at.desc())
            )
        elif user_role == 'mep':
            # MEP sees only projects where their user_id is in mep_supervisor_id JSONB array
            # Same query as PM but filter by mep_supervisor_id
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
        # PERFORMANCE: Optional pagination support (backward compatible)
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)  # Cap at 100 items per page

        # Get current logged-in user
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

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

        # Filter by role - PM sees their BOQs via last_pm_user_id, MEP sees via mep_supervisor_id
        if user_role == 'admin':
            # Admin sees only MEP-assigned projects
            query = query.filter(
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            )
        elif user_role == 'mep':
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

        # PERFORMANCE: Optional pagination support (backward compatible)
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)  # Cap at 100 items per page

        # Get current logged-in user
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

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

        # Filter by current user based on Project.mep_supervisor_id (JSONB array)
        if user_role == 'admin':
            # Admin sees only MEP-assigned pending projects (approved status only)
            query = query.filter(
                BOQ.status.in_(['approved', 'Approved']),
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            )
        elif user_role in ['projectmanager', 'project_manager']:
            # PM sees only projects where their user_id is in Project.user_id JSONB array
            pm_user_id = int(user_id) if user_id else None
            if pm_user_id:
                query = query.filter(Project.user_id.contains([pm_user_id]))
                query = query.filter(BOQ.status.in_(['approved', 'Approved']))
        elif user_role == 'mep':
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
        current_user = g.user
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower()

        # Pagination parameters
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', 20, type=int)
        page_size = min(page_size, 100)

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

        # Filter by role - PM sees their rejected BOQs, MEP sees via mep_supervisor_id
        if user_role == 'admin':
            # Admin viewing MEP role sees only projects with MEP assigned
            query = query.filter(
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            )
        elif user_role == 'mep':
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
        # PERFORMANCE: Optional pagination support
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        # Get current logged-in user
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

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

        # Filter by current user based on Project.user_id (JSONB array)
        if user_role == 'admin':
            # Admin sees only MEP-assigned completed projects
            query = query.filter(
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            )
        elif user_role in ['projectmanager', 'project_manager']:
            # PM sees only completed projects where their user_id is in Project.user_id JSONB array
            query = query.filter(Project.user_id.contains([user_id]))
        elif user_role == 'mep':
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
        from sqlalchemy import func, or_

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get projects assigned to this PM or MEP
        if user_role == 'admin':
            # Admin viewing MEP dashboard sees only projects with MEP assigned
            assigned_projects = Project.query.filter(
                Project.is_deleted == False,
                Project.mep_supervisor_id.isnot(None),
                Project.mep_supervisor_id != []
            ).all()
        elif user_role == 'mep':
            # MEP sees only their assigned projects via mep_supervisor_id
            # IMPORTANT: Convert user_id to integer for JSONB array comparison
            mep_user_id = int(user_id) if user_id else None
            if mep_user_id:
                assigned_projects = Project.query.filter(
                    Project.is_deleted == False,
                    Project.mep_supervisor_id.contains([mep_user_id])
                ).all()
            else:
                assigned_projects = []
        else:
            # PM sees only their assigned projects
            # IMPORTANT: Convert user_id to integer for JSONB array comparison
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

        # Track individual BOQ costs for debugging
        boq_cost_breakdown = []

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

                # Track for debugging
                boq_cost_breakdown.append({
                    'boq_id': boq.boq_id,
                    'boq_name': boq.boq_name,
                    'cost': boq_cost,
                    'items': boq_details.total_items or 0
                })
            else:
                boq_cost_breakdown.append({
                    'boq_id': boq.boq_id,
                    'boq_name': boq.boq_name,
                    'cost': 0,
                    'items': 0,
                    'note': 'No BOQ details found'
                })

            # Categorize BOQ into tabs (MUST MATCH the tab endpoint logic)
            status = boq.status.lower() if boq.status else ''
            project = Project.query.get(boq.project_id)

            # Check if there are assignments for this BOQ
            if user_role == 'mep':
                # MEP: Check if THIS MEP has made assignments
                has_assignment = PMAssignSS.query.filter(
                    PMAssignSS.boq_id == boq.boq_id,
                    PMAssignSS.assigned_by_pm_id == mep_user_id_int,
                    PMAssignSS.is_deleted == False
                ).first() is not None
            elif user_role == 'admin':
                # Admin: Check if ANY assignments exist for this BOQ
                has_assignment = PMAssignSS.query.filter(
                    PMAssignSS.boq_id == boq.boq_id,
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

        return jsonify({
            "success": True,
            "stats": {
                "total_boq_items": total_boq_items,  # Total LINE ITEMS count across all BOQs
                "items_assigned": items_assigned,  # Count of ITEMS assigned (from item_indices)
                "pending_assignment": pending_assignment,  # Count of ITEMS not yet assigned
                "total_projects": len(project_ids),  # Total PROJECT count (plain number)
                "total_project_value": len(project_ids)  # Deprecated: kept for backward compatibility
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
