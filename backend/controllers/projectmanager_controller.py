"""
PROJECT MANAGER & MEP SUPERVISOR CONTROLLER (SHARED CODE)

This controller handles BOTH Project Manager and MEP Supervisor roles using shared code.

STRICT ROLE SEPARATION:
- Project Managers (PM) see ONLY projects where user_id JSONB array contains their ID
- MEP Supervisors (MEP) see ONLY projects where mep_supervisor_id JSONB array contains their ID
- Admins see ALL projects

ROLE-AWARE FILTERING:
- All functions check user role and filter data accordingly
- PM and MEP have identical capabilities but separate data
- No cross-role data leakage

SHARED FUNCTIONALITY:
- Both roles manage Site Engineers and Buyers (same resources)
- Both roles approve/reject BOQs
- Both roles handle change requests
- Both roles track materials and labour
"""

from flask import request, jsonify, g
from sqlalchemy.orm import selectinload, joinedload
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

def create_pm():
    try:
        data = request.get_json()

        # Validate role exists
        role = Role.query.filter_by(role='projectManager').first()
        if not role:
            return jsonify({"error": "Project Manager role not found"}), 404

        # Create new Project Manager user
        new_pm = User(
            email=data['email'],
            phone=data['phone'],
            role_id=role.role_id,
            full_name=data['full_name'],
            created_at=datetime.utcnow(),
            is_deleted=False,
            is_active=True,
            department='Project Management'
        )

        db.session.add(new_pm)
        db.session.commit()
        new_user_id = new_pm.user_id

        # Assign PM to multiple projects (accept both 'project_id' and 'project_ids')
        project_ids = data.get('project_ids', data.get('project_id', []))
        assigned_count = 0
        if project_ids:
            for proj_id in project_ids:
                project = Project.query.filter_by(project_id=proj_id, is_deleted=False).first()
                if project:
                    # Assign this PM to the project (convert to JSONB array format)
                    project.user_id = [new_user_id] if new_user_id else None
                    project.last_modified_at = datetime.utcnow()
                    db.session.add(project)
                    assigned_count += 1

            db.session.commit()

            # Send notification to newly created PM about project assignments
            try:
                if assigned_count > 0:
                    current_user = g.get("user")
                    assigner_id = current_user.get('user_id') if current_user else None
                    assigner_name = current_user.get('full_name') or current_user.get('username') or 'Admin'

                    for proj_id in project_ids:
                        project = Project.query.filter_by(project_id=proj_id, is_deleted=False).first()
                        if project:
                            notification_service.notify_pm_assigned_to_project(
                                project_id=proj_id,
                                project_name=project.project_name,
                                td_id=assigner_id,
                                td_name=assigner_name,
                                pm_user_ids=[new_user_id]
                            )
            except Exception as notif_error:
                log.error(f"Failed to send PM creation assignment notifications: {notif_error}")

        return jsonify({
            "message": "Project Manager created successfully",
            "user_id": new_user_id,
            "assigned_projects": project_ids
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating Project Manager: {str(e)}")
        return jsonify({
            "error": f"Failed to create Project Manager: {str(e)}"
        }), 500

def get_all_pm_boqs():
    try:
        from utils.admin_viewing_context import get_effective_user_context, should_apply_role_filter

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get effective user context (handles admin viewing as another role)
        context = get_effective_user_context()

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 10, type=int), 100)

        # UNIFIED FILTERING: PM and MEP Manager both see projects assigned to either field
        if user_role == 'admin' or not should_apply_role_filter(context):
            # Admin sees all projects with PM or MEP assigned
            assigned_projects = db.session.query(Project.project_id).filter(
                db.or_(
                    Project.user_id.isnot(None),  # Projects with PM assigned
                    Project.mep_supervisor_id.isnot(None)  # Projects with MEP assigned
                ),
                Project.is_deleted == False
            ).all()
        elif user_role in ['projectmanager', 'mep']:
            # PM and MEP Manager both see projects where EITHER user_id OR mep_supervisor_id contains their ID
            # This allows both manager roles to function identically
            assigned_projects = db.session.query(Project.project_id).filter(
                db.or_(
                    Project.user_id.contains([user_id]),
                    Project.mep_supervisor_id.contains([user_id])
                ),
                Project.is_deleted == False
            ).all()
        else:
            # Unknown role - no projects
            assigned_projects = []

        # Extract project IDs
        project_ids = [p.project_id for p in assigned_projects]

        # Admin sees all BOQs, skip the complex approval query
        if user_role == 'admin':
            boq_ids_for_approval = []
        else:
            # UNIFIED BOQ APPROVAL HISTORY QUERY
            # PM and MEP Manager both see BOQs sent to either manager role
            from sqlalchemy import text

            if user_role in ['projectmanager', 'mep']:
                # PM and MEP Manager see BOQs sent to EITHER manager role
                # Handle both array and scalar action values using UNION
                boqs_for_approval_query = db.session.execute(
                    text("""
                        SELECT DISTINCT boq_id FROM (
                            -- Handle array action values
                            SELECT bh.boq_id
                            FROM boq_history bh,
                                 jsonb_array_elements(
                                CASE
                                    WHEN jsonb_typeof(bh.action) = 'array' THEN bh.action
                                    ELSE '[]'::jsonb
                                END
                             ) AS action_item
                            WHERE jsonb_typeof(bh.action) = 'array'
                              AND (
                                (action_item->>'receiver_role' IN ('project_manager', 'mep')
                                 AND (action_item->>'recipient_user_id')::INTEGER = :user_id
                                 AND action_item->>'type' IN ('sent_to_pm', 'sent_to_mep'))
                                OR
                                (action_item->>'sender_role' IN ('project_manager', 'mep')
                                 AND (action_item->>'decided_by_user_id')::INTEGER = :user_id
                                 AND action_item->>'type' = 'sent_to_estimator')
                              )
                            UNION
                            -- Handle scalar action values
                            SELECT bh.boq_id
                            FROM boq_history bh
                            WHERE jsonb_typeof(bh.action) = 'object'
                              AND (
                                (bh.action->>'receiver_role' IN ('project_manager', 'mep')
                                 AND (bh.action->>'recipient_user_id')::INTEGER = :user_id
                                 AND bh.action->>'type' IN ('sent_to_pm', 'sent_to_mep'))
                                OR
                                (bh.action->>'sender_role' IN ('project_manager', 'mep')
                                 AND (bh.action->>'decided_by_user_id')::INTEGER = :user_id
                                 AND bh.action->>'type' = 'sent_to_estimator')
                              )
                        ) AS combined
                    """),
                    {"user_id": user_id}
                )
            else:
                boqs_for_approval_query = []

            boq_ids_for_approval = [row[0] for row in boqs_for_approval_query] if boqs_for_approval_query else []

        # Build query - get all BOQs for assigned projects OR sent for approval
        # Handle empty lists by providing a fallback
        # Admin sees BOQs only for projects with PM assigned
        if user_role == 'admin':
            # Admin sees BOQs for projects with PM assigned OR BOQs with Pending_PM_Approval status
            query = db.session.query(BOQ).filter(
                BOQ.is_deleted == False,
                BOQ.email_sent == True,
                db.or_(
                    BOQ.project_id.in_(project_ids) if project_ids else False,  # BOQs for projects with PM assigned
                    BOQ.status == 'Pending_PM_Approval',  # OR BOQs with Pending_PM_Approval status
                    BOQ.status == 'PM_Approved'
                )
            ).order_by(BOQ.created_at.desc())
        elif not project_ids and not boq_ids_for_approval:
            # No projects assigned and no approval requests
            query = db.session.query(BOQ).filter(
                BOQ.is_deleted == False,
                BOQ.boq_id == -1  # No results
            )
        elif not project_ids:
            # Only approval requests - show from PM approval onwards until project is assigned
            query = db.session.query(BOQ).filter(
                BOQ.is_deleted == False,
                BOQ.email_sent == True,
                BOQ.boq_id.in_(boq_ids_for_approval),
                BOQ.status.in_(['Pending_PM_Approval', 'PM_Approved', 'PM_Rejected', 'Pending_TD_Approval', 'Approved', 'Sent_for_Confirmation', 'Client_Confirmed', 'Pending_Revision', 'Under_Revision', 'Revision_Approved', 'draft', 'Draft', 'pending', 'Pending'])  # Show throughout approval and revision flow
            ).order_by(BOQ.created_at.desc())
        elif not boq_ids_for_approval:
            # Only assigned projects
            query = db.session.query(BOQ).filter(
                BOQ.is_deleted == False,
                BOQ.email_sent == True,
                BOQ.project_id.in_(project_ids)
            ).order_by(BOQ.created_at.desc())
        else:
            # Both assigned projects and approval requests
            query = db.session.query(BOQ).filter(
                BOQ.is_deleted == False,
                BOQ.email_sent == True,
                db.or_(
                    BOQ.project_id.in_(project_ids),  # Show all BOQs for assigned projects
                    db.and_(
                        BOQ.boq_id.in_(boq_ids_for_approval),  # For approval requests
                        BOQ.status.in_(['Pending_PM_Approval', 'PM_Approved', 'PM_Rejected', 'Pending_TD_Approval', 'Approved', 'Sent_for_Confirmation', 'Client_Confirmed', 'Pending_Revision', 'Under_Revision', 'Revision_Approved', 'draft', 'Draft', 'pending', 'Pending'])  # Show throughout approval and revision flow
                    )
                )
            ).order_by(BOQ.created_at.desc())
        # Paginate
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        # ✅ PERFORMANCE OPTIMIZATION: Batch load all related data in single queries
        # Instead of N+1 queries (1 query per BOQ), we now do 3 batch queries total
        boq_ids = [boq.boq_id for boq in paginated.items]

        # Batch load BOQ History (was: 2 queries per BOQ = 2N queries, now: 1 query total)
        all_history = {}
        if boq_ids:
            history_records = BOQHistory.query.filter(
                BOQHistory.boq_id.in_(boq_ids)
            ).order_by(BOQHistory.action_date.desc()).all()
            for h in history_records:
                if h.boq_id not in all_history:
                    all_history[h.boq_id] = []
                all_history[h.boq_id].append(h)

        # Batch load BOQ Details (was: 1 query per BOQ = N queries, now: 1 query total)
        all_details = {}
        if boq_ids:
            details_records = BOQDetails.query.filter(
                BOQDetails.boq_id.in_(boq_ids),
                BOQDetails.is_deleted == False
            ).all()
            for d in details_records:
                all_details[d.boq_id] = d

        # Collect all user IDs needed (PMs and SEs) for batch loading
        pm_user_ids = set()
        se_user_ids = set()
        for boq in paginated.items:
            if boq.project:
                if boq.project.user_id:
                    pm_ids_list = boq.project.user_id if isinstance(boq.project.user_id, list) else [boq.project.user_id]
                    pm_user_ids.update(pm_ids_list)
                if boq.project.site_supervisor_id:
                    se_user_ids.add(boq.project.site_supervisor_id)

        # Batch load all Users (was: 2 queries per BOQ = 2N queries, now: 1 query total)
        all_users = {}
        all_user_ids = list(pm_user_ids | se_user_ids)
        if all_user_ids:
            users = User.query.filter(User.user_id.in_(all_user_ids)).all()
            for u in users:
                all_users[u.user_id] = u

        # Build response with BOQ details and history
        boqs_list = []
        for boq in paginated.items:
            # Get BOQ history from pre-loaded data (NO QUERY - uses pre-loaded dict)
            history = [h for h in all_history.get(boq.boq_id, [])
                      if not (h.sender_role == 'estimator' and h.receiver_role == 'estimator')]

            # Determine the correct status to display for Project Manager
            display_status = boq.status

            # Preserve special statuses that should not be overridden
            # 'items_assigned' - keeps projects in Assigned tab
            # 'Pending_PM_Approval' - keeps projects in For Approval tab
            preserved_statuses = ['items_assigned', 'Pending_PM_Approval', 'pending_pm_approval']
            if display_status not in preserved_statuses:
                for h in history:
                    if h.receiver_role == 'projectManager':
                        # If PM is receiver and status isn't Pending_PM_Approval, show as pending
                        if boq.status not in ['Pending_PM_Approval', 'pending_pm_approval']:
                            display_status = 'pending'
                        break
                    elif h.sender_role == 'projectManager':
                        # If PM is sender, show the original status
                        display_status = h.boq_status
                        break

            # Get PM status from pre-loaded users (NO QUERY - uses pre-loaded dict)
            pm_status = None
            pm_name = current_user.get('full_name')
            if boq.project and boq.project.user_id:
                # project.user_id is now a JSONB array, get first PM (primary PM)
                pm_ids = boq.project.user_id if isinstance(boq.project.user_id, list) else [boq.project.user_id]
                if pm_ids and len(pm_ids) > 0:
                    pm_user = all_users.get(pm_ids[0])  # ✅ Uses pre-loaded dict instead of query
                    if pm_user:
                        # Get user_status from database, fallback to is_active if user_status is null
                        pm_status = pm_user.user_status if pm_user.user_status else ("Active" if pm_user.is_active else "Inactive")
                        pm_name = pm_user.full_name

            # Build complete project details
            project_details = None
            if boq.project:
                # Get Site Engineer name from pre-loaded users (NO QUERY - uses pre-loaded dict)
                se_name = None
                if boq.project.site_supervisor_id:
                    se_user = all_users.get(boq.project.site_supervisor_id)  # ✅ Uses pre-loaded dict instead of query
                    if se_user:
                        se_name = se_user.full_name

                # Calculate end_date from start_date and duration_days
                end_date = None
                if boq.project.start_date and boq.project.duration_days:
                    from datetime import timedelta
                    end_date = (boq.project.start_date + timedelta(days=boq.project.duration_days)).isoformat()

                project_details = {
                    "project_id": boq.project.project_id,
                    "project_name": boq.project.project_name,
                    "project_code": boq.project.project_code if boq.project else None,
                    "user_id": boq.project.user_id,
                    "user_name": pm_name,
                    "site_supervisor_id": boq.project.site_supervisor_id,
                    "site_supervisor_name": se_name,
                    "location": boq.project.location,
                    "area": boq.project.area,
                    "floor_name": boq.project.floor_name,
                    "working_hours": boq.project.working_hours,
                    "client": boq.project.client,
                    "work_type": boq.project.work_type,
                    "start_date": boq.project.start_date.isoformat() if boq.project.start_date else None,
                    "end_date": end_date,
                    "duration_days": boq.project.duration_days,
                    "project_status": boq.project.status,
                    "project_manager_status": pm_status,
                    "description": boq.project.description,
                    "created_at": boq.project.created_at.isoformat() if boq.project.created_at else None,
                    "created_by": boq.project.created_by,
                    "last_modified_at": boq.project.last_modified_at.isoformat() if boq.project.last_modified_at else None,
                    "last_modified_by": boq.project.last_modified_by,
                    "completion_requested": boq.project.completion_requested if boq.project.completion_requested is not None else False,
                    "total_se_assignments": boq.project.total_se_assignments if hasattr(boq.project, 'total_se_assignments') else 0,
                    "confirmed_completions": boq.project.confirmed_completions if hasattr(boq.project, 'confirmed_completions') else 0
                }

            # Check for pending and approved day extension requests using pre-loaded history (NO QUERY)
            has_pending_day_extension = False
            pending_day_extension_count = 0
            has_approved_extension = False
            if boq.project and boq.project.user_id:  # Only check if PM is assigned
                pending_history = all_history.get(boq.boq_id, [])  # ✅ Uses pre-loaded dict instead of query
                for hist in pending_history:
                    if hist.action and isinstance(hist.action, list):
                        for action in hist.action:
                            action_type = action.get('type', '').lower()
                            action_status = action.get('status', '').lower()
                            # Check for requests PM sent to TD that are still pending
                            if (action_type == 'day_extension_requested' and
                                action_status in ['day_request_send_td', 'edited_by_td']):
                                has_pending_day_extension = True
                                pending_day_extension_count += 1
                            # Check for approved extensions
                            elif action_type == 'day_extension_approved' and action_status == 'approved':
                                has_approved_extension = True

            # Get item assignment counts from pre-loaded data (NO QUERY - uses pre-loaded dict)
            total_items = 0
            items_assigned_by_me = 0
            items_pending_assignment = 0

            boq_details_record = all_details.get(boq.boq_id)  # ✅ Uses pre-loaded dict instead of query
            if boq_details_record and boq_details_record.boq_details:
                items = boq_details_record.boq_details.get('items', [])

                for item in items:
                    # Skip extra materials and change requests from counts (same logic as frontend and assign_items_to_se)
                    item_name = item.get('item_name', '') or item.get('item_code', '')
                    item_code = item.get('item_code', '') or item.get('code', '')
                    is_extra = ('extra material' in item_name.lower() or
                               'cr #' in item_code.lower() or
                               'cr #' in item_name.lower())

                    if is_extra:
                        continue  # Skip extra materials from all counts

                    # Count non-extra items only
                    total_items += 1

                    assigned_by_pm = item.get('assigned_by_pm_user_id')
                    assigned_to_se = item.get('assigned_to_se_user_id')

                    if assigned_to_se and assigned_by_pm == user_id:
                        items_assigned_by_me += 1
                    elif not assigned_to_se:
                        items_pending_assignment += 1

            # Get BOQ details for materials and labour counts
            boq_details_data = None
            total_materials = 0
            total_labour = 0
            if boq_details_record and boq_details_record.boq_details:
                items = boq_details_record.boq_details.get('items', [])
                # Count materials and labour from all items
                for item in items:
                    sub_items = item.get('sub_items', [])
                    for sub_item in sub_items:
                        materials = sub_item.get('materials', [])
                        labour = sub_item.get('labour', [])
                        total_materials += len(materials) if materials else 0
                        total_labour += len(labour) if labour else 0

                boq_details_data = {
                    "total_cost": boq_details_record.boq_details.get('totals', {}).get('total_client_cost', 0),
                    "total_materials": total_materials,
                    "total_labour": total_labour,
                    "total_items": total_items
                }

            boq_data = {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "boq_status": display_status,  # Use the determined status based on role
                "project_id": boq.project_id,  # Add project_id at top level for dashboard
                "project_code": boq.project.project_code if boq.project else None,
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "created_by": boq.created_by,
                "last_modified_at": boq.last_modified_at.isoformat() if boq.last_modified_at else None,
                "last_modified_by": boq.last_modified_by,
                "email_sent": boq.email_sent,
                "project_name": boq.project.project_name if boq.project else None,
                "project_details": project_details,  # Complete project information
                "boq_details": boq_details_data,  # BOQ summary for dashboard charts
                # Day extension status
                "has_pending_day_extension": has_pending_day_extension,
                "pending_day_extension_count": pending_day_extension_count,
                "has_approved_extension": has_approved_extension,
                # Item assignment counts
                "total_items": total_items,
                "items_assigned_by_me": items_assigned_by_me,
                "items_pending_assignment": items_pending_assignment
            }
            boqs_list.append(boq_data)

        return jsonify({
            "boqs": boqs_list,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated.total,
                "pages": paginated.pages,
                "has_prev": paginated.has_prev,
                "has_next": paginated.has_next
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching BOQs: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch BOQs: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def get_all_pm():
    try:
        from datetime import timedelta

        role = Role.query.filter_by(role='projectManager').first()
        if not role:
            return jsonify({"error": "Role 'projectManager' not found"}), 404

        get_pms = User.query.filter_by(role_id=role.role_id,is_deleted=False).all()
        assigned_list = []
        unassigned_list = []

        # Calculate online status dynamically: user is online if last_login was within last 5 minutes
        current_time = datetime.utcnow()
        online_threshold = timedelta(minutes=5)

        # ✅ PERFORMANCE OPTIMIZATION: Batch load all projects with PMs assigned
        # Instead of N queries (1 per PM), we do 1 query for all projects
        pm_user_ids = [pm.user_id for pm in get_pms]

        # Get all projects that have any PM assigned (single query instead of N queries)
        all_projects = Project.query.filter(
            Project.user_id.isnot(None),
            Project.is_deleted == False
        ).all()

        # Build a mapping: pm_user_id -> list of projects
        pm_projects_map = {}
        for project in all_projects:
            if project.user_id:
                # user_id is JSONB array, so iterate through all PM IDs
                pm_ids_in_project = project.user_id if isinstance(project.user_id, list) else [project.user_id]
                for pm_id in pm_ids_in_project:
                    if pm_id in pm_user_ids:  # Only map for PMs we're interested in
                        if pm_id not in pm_projects_map:
                            pm_projects_map[pm_id] = []
                        pm_projects_map[pm_id].append(project)

        for pm in get_pms:
            # Check online status based on user_status field
            # Only "online" is considered online, everything else (offline/NULL) is offline
            is_online = pm.user_status == 'online'
            log.info(f"PM {pm.full_name}: user_status={pm.user_status}, is_online={is_online}")

            # ✅ Get projects from pre-loaded map (NO QUERY - uses pre-loaded dict)
            projects = pm_projects_map.get(pm.user_id, [])

            if projects and len(projects) > 0:
                # Add each project under assigned list
                for project in projects:
                    assigned_list.append({
                        "user_id": pm.user_id,  # Added user_id for assignment functionality
                        "pm_name": pm.full_name,
                        "email": pm.email,
                        "phone": pm.phone,
                        "is_active": is_online,  # Dynamic online status
                        "project_id": project.project_id,
                        "project_name": project.project_name if hasattr(project, "project_name") else None
                    })
            else:
                # PM without project assignment
                unassigned_list.append({
                    "user_id": pm.user_id,
                    "pm_name": pm.full_name,
                    "full_name": pm.full_name,
                    "email": pm.email,
                    "phone": pm.phone,
                    "is_active": is_online,  # Dynamic online status
                    "project_id": None
                })

        return jsonify({
            "success": True,
            "assigned_count": len(assigned_list),
            "unassigned_count": len(unassigned_list),
            "assigned_project_managers": assigned_list,
            "unassigned_project_managers": unassigned_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching PMs: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch PMs: {str(e)}"
        }), 500

def get_pm_id(user_id):
    try:
        user_list = []
        projects = Project.query.filter_by(user_id=user_id).all()

        # If no projects found for this user
        if not projects:
            return jsonify({
                "success": True,
                "count": 0,
                "user_list": []
            }), 200

        # Fetch user only once (no need to query inside loop)
        user = User.query.filter_by(user_id=user_id).first()

        for project in projects:
            user_list.append({
                "user_id": user.user_id,
                "user_name": user.full_name,
                "email": user.email,
                "phone": user.phone,
                "project_id": project.project_id,
                "project_name": getattr(project, "project_name", None)
            })

        return jsonify({
            "success": True,
            "count": len(user_list),
            "user_list": user_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching PMs: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch PMs: {str(e)}"
        }), 500

def update_pm(user_id):
    try:
        # Fetch the PM
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({"error": "Project Manager not found"}), 404

        data = request.get_json()

        # Update PM details
        if "full_name" in data:
            user.full_name = data["full_name"]
        if "email" in data:
            user.email = data["email"]
        if "phone" in data:
            user.phone = data["phone"]

        # Reassign projects if provided
        if "assigned_projects" in data:
            # First remove PM from all current projects
            Project.query.filter_by(user_id=user_id).update({"user_id": None})

            # Assign PM to new projects
            for project_id in data["assigned_projects"]:
                project = Project.query.filter_by(project_id=project_id).first()
                if project:
                    # Convert to JSONB array format
                    project.user_id = [user_id] if user_id else None

        db.session.commit()

        # Send notification to PM about new project assignments
        try:
            if "assigned_projects" in data and data["assigned_projects"]:
                current_user = g.get("user")
                assigner_id = current_user.get('user_id') if current_user else None
                assigner_name = current_user.get('full_name') or current_user.get('username') or 'Admin'

                for project_id in data["assigned_projects"]:
                    project = Project.query.filter_by(project_id=project_id, is_deleted=False).first()
                    if project:
                        notification_service.notify_pm_assigned_to_project(
                            project_id=project_id,
                            project_name=project.project_name,
                            td_id=assigner_id,
                            td_name=assigner_name,
                            pm_user_ids=[user_id]
                        )
        except Exception as notif_error:
            log.error(f"Failed to send PM update assignment notifications: {notif_error}")

        # Build response with updated project assignments
        updated_projects = Project.query.filter_by(user_id=user_id).all()
        projects_list = [
            {"project_id": p.project_id, "project_name": getattr(p, "project_name", None)}
            for p in updated_projects
        ]

        return jsonify({
            "success": True,
            "message": "Project Manager updated successfully",
            "pm": {
                "user_id": user.user_id,
                "full_name": user.full_name,
                "email": user.email,
                "phone": user.phone,
                "assigned_projects": projects_list
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating PM: {str(e)}")
        return jsonify({
            "error": f"Failed to update Project Manager: {str(e)}"
        }), 500

def delete_pm(user_id):
    try:
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({"error": "Project Manager not found"}), 404

        # Check assigned projects
        assigned_projects = Project.query.filter_by(user_id=user_id).all()
        if assigned_projects and len(assigned_projects) > 0:
            projects_list = [
                {
                    "project_id": p.project_id,
                    "project_name": getattr(p, "project_name", None)
                }
                for p in assigned_projects
            ]
            return jsonify({
                "success": False,
                "message": "Cannot delete Project Manager. They are assigned to one or more projects.",
                "assigned_projects": projects_list
            }), 400

        # Perform soft delete
        user.is_deleted = True
        user.is_active = False
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Project Manager deleted successfully",
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting PM: {str(e)}")
        return jsonify({
            "error": f"Failed to delete Project Manager: {str(e)}"
        }), 500

def assign_projects():
    try:
        data = request.get_json(silent=True)

        # Support both single user_id (backward compatibility) and multiple user_ids
        user_id = data.get("user_id")
        user_ids = data.get("user_ids")
        project_ids = data.get("project_ids")  # list of project IDs

        # Convert single user_id to list for uniform processing
        if user_ids:
            pm_ids = user_ids if isinstance(user_ids, list) else [user_ids]
        elif user_id:
            pm_ids = [user_id]
        else:
            return jsonify({"error": "user_id or user_ids is required"}), 400

        if not project_ids:
            return jsonify({"error": "project_ids are required"}), 400

        # ✅ PERFORMANCE FIX: Query all PM users at once (N queries → 1)
        pm_users = User.query.filter(User.user_id.in_(pm_ids)).all()
        if len(pm_users) != len(pm_ids):
            found_ids = [u.user_id for u in pm_users]
            missing = set(pm_ids) - set(found_ids)
            return jsonify({"error": f"Project Manager(s) not found: {list(missing)}"}), 404

        # ✅ PERFORMANCE FIX: Query all projects with eager-loaded BOQs at once (100+ queries → 2)
        projects = Project.query.options(
            selectinload(Project.boqs)
        ).filter(
            Project.project_id.in_(project_ids)
        ).all()

        # Create project lookup dictionary
        projects_map = {p.project_id: p for p in projects}

        # Validate that all projects have Client_Confirmed BOQs (no additional queries)
        for pid in project_ids:
            project = projects_map.get(pid)
            if project:
                # BOQs already loaded - no query needed
                boqs = [b for b in project.boqs if not b.is_deleted]
                for boq in boqs:
                    if boq.status not in ['Client_Confirmed', 'approved']:
                        return jsonify({
                            "error": f"Cannot assign PM. BOQ '{boq.boq_name}' must be client-approved first. Current status: {boq.status}"
                        }), 400

        # Get current user (Technical Director)
        current_user = getattr(g, 'user', None)
        td_name = current_user.get('full_name', 'Technical Director') if current_user else 'Technical Director'
        td_id = current_user.get('user_id') if current_user else None

        assigned_projects = []
        projects_data_for_email = []
        boq_histories_updated = 0

        # Process each project (using already-loaded data - no queries)
        for pid in project_ids:
            project = projects_map.get(pid)
            if project:
                # Store ALL PM IDs as JSON array in user_id field
                project.user_id = pm_ids  # This will be stored as JSON array
                project.last_modified_at = datetime.utcnow()
                project.last_modified_by = td_name

                assigned_projects.append({
                    "project_id": project.project_id,
                    "project_name": getattr(project, "project_name", None)
                })

                # Collect project data for email
                projects_data_for_email.append({
                    "project_name": getattr(project, "project_name", "N/A"),
                    "client": getattr(project, "client", "N/A"),
                    "location": getattr(project, "location", "N/A"),
                    "status": getattr(project, "status", "Active")
                })

                # Get BOQs from already-loaded data (no query - data already in memory)
                boqs = [b for b in project.boqs if not b.is_deleted]

                # Create PM names list for comments
                pm_names_list = ", ".join([pm.full_name for pm in pm_users])

                for boq in boqs:
                    # Get existing BOQ history
                    status = boq.status
                    boq.status = "approved"
                    db.session.add(boq)
                    db.session.commit()
                    existing_history = BOQHistory.query.filter_by(boq_id=boq.boq_id).order_by(BOQHistory.action_date.desc()).first()

                    # Handle existing actions - ensure it's always a list
                    if existing_history:
                        if existing_history.action is None:
                            current_actions = []
                        elif isinstance(existing_history.action, list):
                            current_actions = existing_history.action
                        elif isinstance(existing_history.action, dict):
                            current_actions = [existing_history.action]
                        else:
                            current_actions = []
                    else:
                        current_actions = []

                    # Prepare new action for PM assignment (supporting multiple PMs)
                    new_action = {
                        "role": "technical_director",
                        "type": "assigned_project_manager",
                        "sender": "technical_director",
                        "receiver": "project_manager",
                        "status": "PM_Assigned",
                        "boq_name": boq.boq_name,
                        "comments": f"Project Manager(s) {pm_names_list} assigned to project",
                        "timestamp": datetime.utcnow().isoformat(),
                        "sender_name": td_name,
                        "sender_user_id": td_id,
                        "project_name": project.project_name,
                        "project_id": project.project_id,
                        "assigned_pms": [
                            {
                                "name": pm.full_name,
                                "user_id": pm.user_id,
                                "email": pm.email
                            } for pm in pm_users
                        ]
                    }

                    # Append new action
                    current_actions.append(new_action)
                    log.info(f"Appending PM assignment action to BOQ {boq.boq_id} history. Total actions: {len(current_actions)}")

                    if existing_history:
                        # Update existing history
                        existing_history.action = current_actions
                        # Mark JSONB field as modified for SQLAlchemy
                        from sqlalchemy.orm.attributes import flag_modified
                        flag_modified(existing_history, "action")

                        existing_history.action_by = td_name
                        existing_history.sender = td_name
                        existing_history.receiver = pm_names_list
                        existing_history.comments = f"Project Manager(s) {pm_names_list} assigned to project"
                        existing_history.sender_role = 'technical_director'
                        existing_history.receiver_role = 'project_manager'
                        existing_history.action_date = datetime.utcnow()
                        existing_history.last_modified_by = td_name
                        existing_history.last_modified_at = datetime.utcnow()

                        log.info(f"Updated existing history for BOQ {boq.boq_id} with {len(current_actions)} actions")
                    else:
                        # Create new history entry
                        boq_history = BOQHistory(
                            boq_id=boq.boq_id,
                            action=current_actions,
                            action_by=td_name,
                            boq_status="approved",
                            sender=td_name,
                            receiver=pm_names_list,
                            comments=f"Project Manager(s) {pm_names_list} assigned to project",
                            sender_role='technical_director',
                            receiver_role='project_manager',
                            action_date=datetime.utcnow(),
                            created_by=td_name
                        )
                        db.session.add(boq_history)
                        log.info(f"Created new history for BOQ {boq.boq_id} with {len(current_actions)} actions")

                    boq_histories_updated += 1

        db.session.commit()
        log.info(f"Successfully assigned PM to {len(assigned_projects)} projects and updated {boq_histories_updated} BOQ histories")

        # Send notification to assigned PM(s) about project assignments
        try:
            for proj_data in assigned_projects:
                notification_service.notify_pm_assigned_to_project(
                    project_id=proj_data['project_id'],
                    project_name=proj_data['project_name'],
                    td_id=td_id,
                    td_name=td_name,
                    pm_user_ids=pm_ids  # All PMs assigned to this project
                )
        except Exception as notif_error:
            log.error(f"Failed to send PM assignment notifications: {notif_error}")

        # Send email notification to Project Manager
        email_sent = False
        # if user.email and projects_data_for_email:
            # try:
            #     email_service = BOQEmailService()
            #     email_sent = email_service.send_pm_assignment_notification(
            #         pm_email=user.email,
            #         pm_name=user.full_name,
            #         td_name=td_name,
            #         projects_data=projects_data_for_email
            #     )

            #     if email_sent:
            #         log.info(f"Assignment notification email sent successfully to {user.email}")
            #     else:
            #         log.warning(f"Failed to send assignment notification email to {user.email}")
            # except Exception as email_error:
            #     log.error(f"Error sending assignment notification email: {email_error}")
            #     # Don't fail the entire request if email fails
            #     import traceback
            #     log.error(f"Email error traceback: {traceback.format_exc()}")

        # Prepare response with all assigned PMs
        assigned_pms_data = [
            {
                "user_id": pm.user_id,
                "user_name": pm.full_name,
                "email": pm.email,
                "phone": pm.phone
            } for pm in pm_users
        ]

        message = f"Projects assigned to {len(pm_users)} Project Manager(s) successfully" if len(pm_users) > 1 else "Projects assigned to Project Manager successfully"

        return jsonify({
            "success": True,
            "message": message,
            "assigned_pms": assigned_pms_data,
            "assigned_pm_count": len(pm_users),
            "assigned_projects": assigned_projects,
            "assigned_count": len(assigned_projects),
            "boq_histories_updated": boq_histories_updated,
            "email_sent": email_sent
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        log.error(f"Error assigning projects: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to assign projects: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def assign_items_to_se():
    """PM assigns specific BOQ items to a Site Engineer"""
    try:
        data = request.get_json()

        boq_id = data.get('boq_id')
        item_indices = data.get('item_indices', [])  # List of item indices to assign
        se_user_id = data.get('se_user_id')

        # Validate input
        if not boq_id:
            return jsonify({"error": "boq_id is required"}), 400
        if not item_indices or not isinstance(item_indices, list):
            return jsonify({"error": "item_indices must be a non-empty list"}), 400
        if not se_user_id:
            return jsonify({"error": "se_user_id is required"}), 400

        # Get current user (PM or MEP)
        pm_user_id = g.user_id
        pm_user = User.query.get(pm_user_id)
        if not pm_user:
            return jsonify({"error": "User not found"}), 404

        pm_name = pm_user.full_name
        role_name = pm_user.role.role if pm_user.role else 'unknown'

        # Get BOQ and validate
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Validate PM/MEP is assigned to project
        is_pm = role_name == 'projectManager' and pm_user_id in (project.user_id or [])
        is_mep = role_name == 'mep' and pm_user_id in (project.mep_supervisor_id or [])
        is_admin = role_name == 'admin'

        if not (is_pm or is_mep or is_admin):
            return jsonify({"error": "You are not assigned to this project"}), 403

        # Validate SE exists
        se_user = User.query.get(se_user_id)
        if not se_user or not se_user.role or se_user.role.role != 'siteEngineer':
            return jsonify({"error": "Invalid Site Engineer"}), 400

        se_name = se_user.full_name

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Get items from JSONB
        boq_data = boq_details.boq_details or {}
        items = boq_data.get('items', [])

        if not items:
            return jsonify({"error": "No items found in BOQ"}), 404

        # Validate and assign items
        assigned_items = []
        skipped_items = []

        for item_index in item_indices:
            if item_index < 0 or item_index >= len(items):
                skipped_items.append({
                    "index": item_index,
                    "reason": "Invalid item index"
                })
                continue

            item = items[item_index]

            # Check if item is already assigned by another PM/MEP
            existing_pm_id = item.get('assigned_by_pm_user_id')
            if existing_pm_id and existing_pm_id != pm_user_id:
                skipped_items.append({
                    "index": item_index,
                    "item_code": item.get('item_code', 'N/A'),
                    "reason": f"Already assigned by another {role_name}",
                    "assigned_by": item.get('assigned_by_pm_name')
                })
                continue

            # Assign the item
            item['assigned_by_pm_user_id'] = pm_user_id
            item['assigned_by_pm_name'] = pm_name
            item['assigned_by_role'] = role_name  # Track if PM or MEP assigned this item
            item['assigned_to_se_user_id'] = se_user_id
            item['assigned_to_se_name'] = se_name
            item['assignment_date'] = datetime.utcnow().isoformat()
            item['assignment_status'] = 'assigned'

            assigned_items.append({
                "index": item_index,
                "item_code": item.get('item_code') or item.get('item_number') or item.get('sr_no') or f"Item-{item_index+1}",
                "description": item.get('description') or item.get('item_name') or item.get('name') or 'N/A'
            })

        if not assigned_items:
            return jsonify({
                "error": "No items were assigned",
                "skipped_items": skipped_items
            }), 400

        # Update BOQ details
        boq_data['items'] = items
        boq_details.boq_details = boq_data

        # Mark JSONB field as modified for SQLAlchemy
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(boq_details, "boq_details")

        # Save to pm_assign_ss table
        from models.pm_assign_ss import PMAssignSS

        # Prepare item details for storage
        item_details_for_db = []
        for assigned_item in assigned_items:
            item_index = assigned_item['index']
            item = items[item_index]
            item_details_for_db.append({
                'index': item_index,
                'item_code': assigned_item['item_code'],
                'item_name': assigned_item['description'],
                'quantity': item.get('quantity') or item.get('qty'),
                'unit': item.get('unit') or item.get('uom'),
                'rate': item.get('rate') or item.get('unitRate'),
                'amount': item.get('amount') or item.get('totalAmount')
            })

        # Check if assignment already exists for this BOQ + SE combination
        existing_assignment = PMAssignSS.query.filter_by(
            boq_id=boq_id,
            assigned_to_se_id=se_user_id,
            assigned_by_pm_id=pm_user_id,
            is_deleted=False
        ).first()

        if existing_assignment:
            # Update existing assignment - add new item indices
            existing_indices = existing_assignment.item_indices or []
            new_indices = [item['index'] for item in assigned_items]
            combined_indices = list(set(existing_indices + new_indices))

            existing_assignment.item_indices = combined_indices
            existing_assignment.item_details = item_details_for_db
            existing_assignment.assignment_status = 'assigned'
            existing_assignment.last_modified_at = datetime.utcnow()
            existing_assignment.last_modified_by = pm_name
            log.info(f"Updated existing assignment {existing_assignment.pm_assign_id} with new items")
        else:
            # Create new assignment record
            new_assignment = PMAssignSS(
                project_id=project.project_id,
                boq_id=boq_id,
                item_indices=[item['index'] for item in assigned_items],
                item_details=item_details_for_db,
                assignment_status='assigned',
                assigned_by_pm_id=pm_user_id,
                assigned_to_se_id=se_user_id,
                assignment_date=datetime.utcnow(),
                created_by=pm_name,
                created_at=datetime.utcnow(),
                is_deleted=False
            )
            db.session.add(new_assignment)
            log.info(f"Created new assignment record in pm_assign_ss for BOQ {boq_id}, SE {se_user_id}")

        # Check if all items are now assigned
        all_items_assigned = True
        total_items = 0
        assigned_count = 0

        for item in items:
            # Skip extra materials and change requests from the check
            item_name = item.get('item_name', '') or item.get('item_code', '')
            item_code = item.get('item_code', '') or item.get('code', '')
            is_extra = ('extra material' in item_name.lower() or
                       'cr #' in item_code.lower() or
                       'cr #' in item_name.lower())

            if not is_extra:
                total_items += 1
                if item.get('assignment_status') == 'assigned' and item.get('assigned_to_se_user_id'):
                    assigned_count += 1
                else:
                    all_items_assigned = False

        log.info(f"BOQ {boq_id}: {assigned_count}/{total_items} non-extra items assigned. All assigned: {all_items_assigned}")

        # Update BOQ status based on item assignments
        if assigned_count > 0 and total_items > 0:
            # Set to 'items_assigned' if any items are assigned (not necessarily all)
            # This ensures the project shows in the Assigned tab once assignment begins
            boq.status = 'items_assigned'
            if all_items_assigned:
                log.info(f"✅ All items assigned for BOQ {boq_id}, status set to 'items_assigned'")
            else:
                log.info(f"📋 {assigned_count}/{total_items} items assigned for BOQ {boq_id}, status set to 'items_assigned'")

        # Update BOQ history
        existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

        current_actions = []
        if existing_history and existing_history.action:
            current_actions = existing_history.action if isinstance(existing_history.action, list) else []

        new_action = {
            "role": role_name,
            "type": "items_assigned_to_se",
            "sender": role_name,
            "receiver": "site_engineer",
            "status": "Items_Assigned" if not all_items_assigned else "All_Items_Assigned",
            "pm_user_id": pm_user_id,
            "pm_name": pm_name,
            "se_user_id": se_user_id,
            "se_name": se_name,
            "items_count": len(assigned_items),
            "item_codes": [item['item_code'] for item in assigned_items],
            "all_items_assigned": all_items_assigned,
            "timestamp": datetime.utcnow().isoformat(),
            "project_id": project.project_id,
            "project_name": project.project_name
        }

        current_actions.append(new_action)

        if existing_history:
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
        else:
            new_history = BOQHistory(
                boq_id=boq_id,
                action=current_actions,
                action_by=pm_name,
                is_deleted=False
            )
            db.session.add(new_history)

        db.session.commit()

        log.info(f"{role_name} {pm_name} assigned {len(assigned_items)} items to SE {se_name} for BOQ {boq_id}")

        # Send notification to SE about item assignment
        try:
            notification_service.notify_se_items_assigned(
                boq_id=boq_id,
                project_name=project.project_name,
                pm_id=pm_user_id,
                pm_name=pm_name,
                se_user_id=se_user_id,
                items_count=len(assigned_items)
            )
        except Exception as notif_error:
            log.error(f"Failed to send item assignment notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": f"Successfully assigned {len(assigned_items)} item(s) to {se_name}",
            "assigned_items": assigned_items,
            "skipped_items": skipped_items,
            "se_name": se_name,
            "assigned_by": pm_name,
            "all_items_assigned": all_items_assigned,
            "boq_status": boq.status
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        log.error(f"Error assigning items to SE: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to assign items: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def get_item_assignments(boq_id):
    """Get all item assignments for a specific BOQ"""
    try:
        # Get current user
        user_id = g.user_id
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        role_name = user.role.role if user.role else 'unknown'

        # Get BOQ and validate
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Validate access
        is_pm = role_name == 'projectManager' and user_id in (project.user_id or [])
        is_mep = role_name == 'mep' and user_id in (project.mep_supervisor_id or [])
        is_se = role_name == 'siteEngineer' and project.site_supervisor_id == user_id
        is_admin = role_name == 'admin'

        if not (is_pm or is_mep or is_se or is_admin):
            return jsonify({"error": "You do not have access to this BOQ"}), 403

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Get items from JSONB
        boq_data = boq_details.boq_details or {}
        items = boq_data.get('items', [])

        # Build assignment data
        assignment_data = []
        total_items = len(items)
        assigned_items = 0
        unassigned_items = 0
        my_assignments = 0

        for idx, item in enumerate(items):
            assignment_status = item.get('assignment_status', 'unassigned')
            assigned_by_pm = item.get('assigned_by_pm_user_id')
            assigned_to_se = item.get('assigned_to_se_user_id')

            if assignment_status == 'assigned' and assigned_to_se:
                assigned_items += 1
                if assigned_by_pm == user_id:
                    my_assignments += 1
            else:
                unassigned_items += 1

            assignment_data.append({
                "index": idx,
                "item_code": item.get('item_code') or item.get('item_number') or item.get('sr_no') or f"Item-{idx+1}",
                "description": item.get('description') or item.get('item_name') or item.get('name') or 'N/A',
                "quantity": item.get('quantity') or item.get('qty'),
                "unit": item.get('unit') or item.get('uom') or '',
                "assigned_by_pm_user_id": assigned_by_pm,
                "assigned_by_pm_name": item.get('assigned_by_pm_name'),
                "assigned_to_se_user_id": assigned_to_se,
                "assigned_to_se_name": item.get('assigned_to_se_name'),
                "assignment_date": item.get('assignment_date'),
                "assignment_status": assignment_status,
                "can_modify": not assigned_by_pm or assigned_by_pm == user_id
            })

        return jsonify({
            "success": True,
            "boq_id": boq_id,
            "boq_name": boq.boq_name,
            "project_id": project.project_id,
            "project_name": project.project_name,
            "items": assignment_data,
            "summary": {
                "total_items": total_items,
                "assigned_items": assigned_items,
                "unassigned_items": unassigned_items,
                "my_assignments": my_assignments
            }
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error getting item assignments: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to get item assignments: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def unassign_items_from_se():
    """PM unassigns items from Site Engineer (only their own assignments)"""
    try:
        data = request.get_json()

        boq_id = data.get('boq_id')
        item_indices = data.get('item_indices', [])

        # Validate input
        if not boq_id:
            return jsonify({"error": "boq_id is required"}), 400
        if not item_indices or not isinstance(item_indices, list):
            return jsonify({"error": "item_indices must be a non-empty list"}), 400

        # Get current user
        pm_user_id = g.user_id
        pm_user = User.query.get(pm_user_id)
        if not pm_user:
            return jsonify({"error": "User not found"}), 404

        pm_name = pm_user.full_name
        role_name = pm_user.role.role if pm_user.role else 'unknown'

        # Get BOQ and validate
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Validate PM/MEP is assigned to project
        is_pm = role_name == 'projectManager' and pm_user_id in (project.user_id or [])
        is_mep = role_name == 'mep' and pm_user_id in (project.mep_supervisor_id or [])
        is_admin = role_name == 'admin'

        if not (is_pm or is_mep or is_admin):
            return jsonify({"error": "You are not assigned to this project"}), 403

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Get items from JSONB
        boq_data = boq_details.boq_details or {}
        items = boq_data.get('items', [])

        if not items:
            return jsonify({"error": "No items found in BOQ"}), 404

        # Unassign items
        unassigned_items = []
        skipped_items = []

        for item_index in item_indices:
            if item_index < 0 or item_index >= len(items):
                skipped_items.append({
                    "index": item_index,
                    "reason": "Invalid item index"
                })
                continue

            item = items[item_index]

            # Check if item was assigned by current PM
            existing_pm_id = item.get('assigned_by_pm_user_id')
            if not existing_pm_id:
                skipped_items.append({
                    "index": item_index,
                    "item_code": item.get('item_code', 'N/A'),
                    "reason": "Item is not assigned"
                })
                continue

            if existing_pm_id != pm_user_id and not is_admin:
                skipped_items.append({
                    "index": item_index,
                    "item_code": item.get('item_code', 'N/A'),
                    "reason": "Can only unassign your own assignments"
                })
                continue

            # Unassign the item
            item.pop('assigned_by_pm_user_id', None)
            item.pop('assigned_by_pm_name', None)
            item.pop('assigned_to_se_user_id', None)
            item.pop('assigned_to_se_name', None)
            item.pop('assignment_date', None)
            item['assignment_status'] = 'unassigned'

            unassigned_items.append({
                "index": item_index,
                "item_code": item.get('item_code') or item.get('item_number') or item.get('sr_no') or f"Item-{item_index+1}",
                "description": item.get('description') or item.get('item_name') or item.get('name') or 'N/A'
            })

        if not unassigned_items:
            return jsonify({
                "error": "No items were unassigned",
                "skipped_items": skipped_items
            }), 400

        # Update BOQ details
        boq_data['items'] = items
        boq_details.boq_details = boq_data

        # Mark JSONB field as modified for SQLAlchemy
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(boq_details, "boq_details")

        # Update BOQ history
        existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

        current_actions = []
        if existing_history and existing_history.action:
            current_actions = existing_history.action if isinstance(existing_history.action, list) else []

        new_action = {
            "role": role_name,
            "type": "items_unassigned_from_se",
            "sender": role_name,
            "receiver": "site_engineer",
            "status": "Items_Unassigned",
            "pm_user_id": pm_user_id,
            "pm_name": pm_name,
            "items_count": len(unassigned_items),
            "item_codes": [item['item_code'] for item in unassigned_items],
            "timestamp": datetime.utcnow().isoformat(),
            "project_id": project.project_id,
            "project_name": project.project_name
        }

        current_actions.append(new_action)

        if existing_history:
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
        else:
            new_history = BOQHistory(
                boq_id=boq_id,
                action=current_actions,
                action_by=pm_name,
                is_deleted=False
            )
            db.session.add(new_history)

        db.session.commit()

        log.info(f"{role_name} {pm_name} unassigned {len(unassigned_items)} items from SE for BOQ {boq_id}")

        return jsonify({
            "success": True,
            "message": f"Successfully unassigned {len(unassigned_items)} item(s)",
            "unassigned_items": unassigned_items,
            "skipped_items": skipped_items
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        log.error(f"Error unassigning items: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to unassign items: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def get_available_site_engineers():
    """Get list of available Site Engineers for assignment"""
    try:
        # PERFORMANCE FIX: Pre-calculate counts to prevent N+1 queries
        from models.roles import Role
        from sqlalchemy import func

        se_role = Role.query.filter_by(role_name='siteEngineer').first()
        if not se_role:
            return jsonify({"error": "Site Engineer role not found"}), 404

        # Pre-calculate project counts in ONE query
        project_counts = db.session.query(
            Project.site_supervisor_id,
            func.count(Project.project_id).label('count')
        ).filter(
            Project.is_deleted == False,
            Project.site_supervisor_id.isnot(None)
        ).group_by(Project.site_supervisor_id).all()

        project_count_map = {row[0]: row[1] for row in project_counts}

        # Get site engineers
        site_engineers = User.query.filter_by(
            role_id=se_role.role_id,
            is_deleted=False
        ).all()

        # Pre-load all BOQ details in ONE query for item counting
        from sqlalchemy.orm import selectinload
        boqs_with_details = BOQ.query.options(
            selectinload(BOQ.details)  # Fixed: use 'details' not 'boq_details'
        ).filter(BOQ.is_deleted == False).all()

        # Build item count map per SE (done once for all SEs)
        se_item_counts = {}
        for boq in boqs_with_details:
            boq_details_list = boq.details if hasattr(boq, 'details') else []  # Fixed relationship name
            for boq_details in boq_details_list:
                if boq_details and not boq_details.is_deleted and boq_details.boq_details:
                    items = boq_details.boq_details.get('items', [])
                    for item in items:
                        se_id = item.get('assigned_to_se_user_id')
                        if se_id:
                            se_item_counts[se_id] = se_item_counts.get(se_id, 0) + 1

        se_list = []
        for se in site_engineers:
            # Use pre-calculated counts - NO database queries in loop!
            projects_count = project_count_map.get(se.user_id, 0)
            items_count = se_item_counts.get(se.user_id, 0)

            se_list.append({
                "user_id": se.user_id,
                "full_name": se.full_name,
                "email": se.email,
                "phone_number": se.phone_number,
                "is_active": se.user_status == 'online',
                "projects_count": projects_count,
                "items_assigned_count": items_count,
                "profile_image": se.profile_image
            })

        # Sort by online status first, then by name
        se_list.sort(key=lambda x: (not x['is_active'], x['full_name']))

        return jsonify({
            "success": True,
            "site_engineers": se_list,
            "total_count": len(se_list)
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error getting site engineers: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to get site engineers: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def send_boq_to_estimator():
    """Send BOQ to a specific Estimator"""
    try:
        data = request.get_json()

        boq_id = data.get('boq_id')
        boq_status = data.get('boq_status', '').lower()  # "approved" or "rejected"
        rejection_reason = data.get('rejection_reason', '')
        comments = data.get('comments', '')

        if not boq_id:
            return jsonify({"error": "boq_id is required"}), 400

        if boq_status not in ['approved', 'rejected']:
            return jsonify({"error": "Invalid boq_status. Use 'approved' or 'rejected'."}), 400

        # Get current user (Project Manager)
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        current_user_name = current_user.get('full_name', 'Project Manager')
        current_user_id = current_user.get('user_id')
        current_user_role = current_user.get('role_name', 'project_manager')

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            log.error(f"BOQ {boq_id} not found or deleted")
            return jsonify({"error": f"BOQ {boq_id} not found"}), 404

        log.info(f"Found BOQ {boq_id} with project_id: {boq.project_id}")

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            log.error(f"BOQ details not found for BOQ {boq_id}")
            return jsonify({"error": f"BOQ details not found for BOQ {boq_id}"}), 404

        # Get project (allow soft-deleted projects for BOQ approval flow)
        project = Project.query.filter_by(project_id=boq.project_id).first()
        if not project:
            log.error(f"Project {boq.project_id} not found for BOQ {boq_id}")
            return jsonify({"error": f"Project not found (ID: {boq.project_id}) for BOQ {boq_id}"}), 404

        log.info(f"Found project {project.project_id}: {project.project_name}")

        # Get Estimator user
        estimator_role = Role.query.filter_by(role='estimator').first()
        if not estimator_role:
            return jsonify({"error": "Estimator role not found"}), 404

        estimator = User.query.filter_by(role_id=estimator_role.role_id, is_deleted=False).first()
        if not estimator:
            return jsonify({"error": "Estimator not found"}), 404

        if not estimator.email:
            return jsonify({"error": f"Estimator {estimator.full_name} has no email address"}), 400

        # Prepare email service and data
        boq_email_service = BOQEmailService()

        items_summary = boq_details.boq_details.get('summary', {})
        items_summary['items'] = boq_details.boq_details.get('items', [])

        projects_data = [{
            'project_id': project.project_id,
            'project_name': project.project_name,
            'boq_id': boq.boq_id,
            'boq_name': boq.boq_name,
            'client': getattr(project, 'client', 'N/A'),
            'location': getattr(project, 'location', 'N/A'),
            'total_cost': items_summary.get('total_cost', 0),
            'status': boq_status
        }]

        # Fallback: use existing email function (assuming it's general-purpose)
        # email_sent = boq_email_service.send_pm_assignment_notification(
        #     estimator.email, estimator.full_name, current_user_name, projects_data
        # )

        # if email_sent:
            # If PM approves, set to PM_Approved so estimator can send to TD
            # If PM rejects, set to rejected
        if boq_status == 'approved':
            boq.status = 'PM_Approved'
            boq.client_rejection_reason = None  # Clear any previous rejection reason
        else:
            boq.status = 'PM_Rejected'
            boq.client_rejection_reason = rejection_reason  # Save PM rejection reason
        boq.last_modified_by = current_user_name
        boq.last_modified_at = datetime.utcnow()
        boq.email_sent = True

        # Add to BOQ history
        existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

        new_action = {
            "role": current_user_role,
            "type": "sent_to_estimator",
            "sender": current_user_name,
            "receiver": estimator.full_name,
            "sender_role": current_user_role,
            "receiver_role": "estimator",
            "status": boq.status,
            "comments": comments or f"BOQ {boq_status} and sent to Estimator {estimator.full_name}",
            "rejection_reason": rejection_reason if boq_status == 'rejected' else '',
            "timestamp": datetime.utcnow().isoformat(),
            "decided_by": current_user_name,
            "decided_by_user_id": current_user_id,
            "recipient_email": estimator.email,
            "recipient_name": estimator.full_name,
            "recipient_user_id": estimator.user_id,
            "boq_name": boq.boq_name,
            "project_name": project.project_name
        }

        if existing_history:
            current_actions = []
            if isinstance(existing_history.action, list):
                current_actions = existing_history.action
            elif isinstance(existing_history.action, dict):
                current_actions = [existing_history.action]

            action_exists = any(
                a.get('type') == new_action['type'] and
                a.get('sender') == new_action['sender'] and
                a.get('receiver') == new_action['receiver']
                for a in current_actions
            )

            if not action_exists:
                current_actions.append(new_action)
                existing_history.action = current_actions
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(existing_history, "action")

            existing_history.action_by = current_user_name
            existing_history.boq_status = boq.status
            existing_history.sender = current_user_name
            existing_history.receiver = estimator.full_name
            existing_history.comments = new_action["comments"]
            existing_history.sender_role = current_user_role
            existing_history.receiver_role = 'estimator'
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = current_user_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=[new_action],
                action_by=current_user_name,
                boq_status=boq.status,
                sender=current_user_name,
                receiver=estimator.full_name,
                comments=new_action["comments"],
                sender_role=current_user_role,
                receiver_role='estimator',
                action_date=datetime.utcnow(),
                created_by=current_user_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # Send notification to Estimator about PM's decision
        try:
            # Get estimator user_id from BOQHistory actions
            # This ensures we notify the CORRECT estimator who sent the BOQ to PM
            estimator_user_id = None

            # Find the latest "sent_to_pm" action to get the estimator's user_id
            if existing_history and existing_history.action:
                actions = existing_history.action if isinstance(existing_history.action, list) else [existing_history.action]
                for action in reversed(actions):  # Check from most recent
                    if action.get('sender_role') == 'estimator' and action.get('decided_by_user_id'):
                        estimator_user_id = action.get('decided_by_user_id')
                        break

            # Fallback: Try to get from estimator object (for backwards compatibility)
            if not estimator_user_id and estimator and hasattr(estimator, 'user_id'):
                estimator_user_id = estimator.user_id

            if estimator_user_id:
                notification_service.notify_pm_boq_decision(
                    boq_id=boq_id,
                    project_name=project.project_name,
                    pm_id=current_user_id,
                    pm_name=current_user_name,
                    estimator_user_id=estimator_user_id,
                    approved=(boq_status == 'approved'),
                    rejection_reason=rejection_reason if boq_status == 'rejected' else None
                )
        except Exception as notif_error:
            log.error(f"Failed to send PM decision notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": f"BOQ {boq_status} and sent to Estimator {estimator.full_name}",
            "boq_id": boq_id,
            "estimator": {
                "id": estimator.user_id,
                "name": estimator.full_name,
                "email": estimator.email
            },
            "status": boq.status
        }), 200

        # else:
        #     return jsonify({
        #         "success": False,
        #         "message": "Failed to send BOQ email to Estimator",
        #         "boq_id": boq_id,
        #         "error": "Email service failed"
        #     }), 500

    except Exception as e:
        db.session.rollback()
        log.error(f"Error sending BOQ to Estimator: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to send BOQ to Estimator",
            "error": str(e)
        }), 500


def confirm_se_completion():
    """
    PM confirms SE completion request.
    STRICT: Only the PM who assigned items to the SE can confirm their completion.
    """
    try:
        current_user = g.user
        pm_user_id = current_user['user_id']
        pm_name = current_user.get('full_name', 'Project Manager')

        data = request.get_json()
        project_id = data.get('project_id')
        se_user_id = data.get('se_user_id')

        if not project_id or not se_user_id:
            return jsonify({
                "error": "project_id and se_user_id are required"
            }), 400

        # Import here to avoid circular import
        from models.pm_assign_ss import PMAssignSS

        # CRITICAL: Find assignments where THIS PM assigned to THIS SE
        assignments = PMAssignSS.query.filter_by(
            project_id=project_id,
            assigned_to_se_id=se_user_id,
            assigned_by_pm_id=pm_user_id,  # Must match the PM who assigned
            is_deleted=False
        ).all()

        if not assignments:
            return jsonify({
                "error": "You cannot confirm this SE's completion as you did not assign items to them"
            }), 403

        # Check if SE has requested completion
        if not all(a.se_completion_requested for a in assignments):
            return jsonify({
                "error": "SE has not requested completion for all assigned items yet"
            }), 400

        # Check if already confirmed
        if all(a.pm_confirmed_completion for a in assignments):
            return jsonify({
                "error": "You have already confirmed this SE's completion"
            }), 400

        # Mark all assignments from this PM to this SE as confirmed
        for assignment in assignments:
            if not assignment.pm_confirmed_completion:
                assignment.pm_confirmed_completion = True
                assignment.pm_confirmation_date = datetime.utcnow()
                assignment.last_modified_by = pm_name
                assignment.last_modified_at = datetime.utcnow()

        # Count unique PM-SE confirmation pairs for the project
        from sqlalchemy import func

        # Count confirmed pairs - using proper distinct counting
        confirmed_pairs_query = db.session.query(
            func.count(func.distinct(func.concat(
                PMAssignSS.assigned_by_pm_id, '-', PMAssignSS.assigned_to_se_id
            )))
        ).filter(
            PMAssignSS.project_id == project_id,
            PMAssignSS.is_deleted == False,
            PMAssignSS.se_completion_requested == True,
            PMAssignSS.pm_confirmed_completion == True
        ).scalar()

        confirmed_pairs = confirmed_pairs_query or 0

        # Count total unique PM-SE pairs - using proper distinct counting
        total_pairs_query = db.session.query(
            func.count(func.distinct(func.concat(
                PMAssignSS.assigned_by_pm_id, '-', PMAssignSS.assigned_to_se_id
            )))
        ).filter(
            PMAssignSS.project_id == project_id,
            PMAssignSS.is_deleted == False,
            PMAssignSS.assigned_by_pm_id.isnot(None),
            PMAssignSS.assigned_to_se_id.isnot(None)
        ).scalar()

        total_pairs = total_pairs_query or 0

        # Update project counters
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        project.confirmed_completions = confirmed_pairs
        project.total_se_assignments = total_pairs
        project.last_modified_at = datetime.utcnow()
        project.last_modified_by = pm_name

        # Auto-complete project if all confirmed
        project_completed = False
        if confirmed_pairs == total_pairs and total_pairs > 0:
            project.status = 'completed'
            project.completion_requested = False
            project_completed = True

            # Update BOQ status
            boq = BOQ.query.filter_by(project_id=project_id, is_deleted=False).first()
            if boq:
                boq.status = 'completed'
                boq.last_modified_at = datetime.utcnow()
                boq.last_modified_by = pm_name

            # Add BOQ history entry for project completion
            if boq:
                boq_history = BOQHistory.query.filter_by(boq_id=boq.boq_id).order_by(BOQHistory.action_date.desc()).first()

                new_action = {
                    "type": "project_completed",
                    "status": "completed",
                    "completed_by": pm_name,
                    "completed_by_user_id": pm_user_id,
                    "completion_method": "auto_complete_all_confirmed",
                    "confirmed_pairs": f"{confirmed_pairs}/{total_pairs}",
                    "timestamp": datetime.utcnow().isoformat(),
                    "comments": f"Project auto-completed after all {total_pairs} PM-SE confirmations"
                }

                if boq_history:
                    current_actions = []
                    if isinstance(boq_history.action, list):
                        current_actions = boq_history.action
                    elif isinstance(boq_history.action, dict):
                        current_actions = [boq_history.action]

                    current_actions.append(new_action)
                    boq_history.action = current_actions
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(boq_history, "action")
                    boq_history.last_modified_at = datetime.utcnow()
                    boq_history.last_modified_by = pm_name
                else:
                    new_history = BOQHistory(
                        boq_id=boq.boq_id,
                        action=[new_action],
                        action_by=pm_name,
                        boq_status='completed',
                        sender=pm_name,
                        receiver='system',
                        comments=new_action["comments"],
                        sender_role='project_manager',
                        receiver_role='system',
                        action_date=datetime.utcnow(),
                        created_by=pm_name
                    )
                    db.session.add(new_history)

        db.session.commit()

        # Get SE details for response
        se_user = User.query.get(se_user_id)
        se_name = se_user.full_name if se_user else "Site Engineer"

        log.info(f"PM {pm_user_id} confirmed SE {se_user_id} completion for project {project_id}. Status: {confirmed_pairs}/{total_pairs}")

        # Send notification to SE about completion confirmation
        try:
            boq = BOQ.query.filter_by(project_id=project_id, is_deleted=False).first()
            if boq:
                notification_service.notify_pm_confirms_completion(
                    boq_id=boq.boq_id,
                    project_name=project.project_name,
                    pm_id=pm_user_id,
                    pm_name=pm_name,
                    se_user_id=se_user_id
                )
        except Exception as notif_error:
            log.error(f"Failed to send completion confirmation notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": f"Successfully confirmed {se_name}'s completion",
            "confirmation_status": f"{confirmed_pairs}/{total_pairs} confirmations",
            "project_completed": project_completed,
            "project_status": project.status,
            "details": {
                "se_name": se_name,
                "confirmed_by": pm_name,
                "confirmation_date": datetime.utcnow().isoformat(),
                "all_confirmations_complete": confirmed_pairs == total_pairs
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error confirming SE completion: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to confirm completion: {str(e)}"
        }), 500


def get_project_completion_details(project_id):
    """
    Get detailed completion status showing PM-SE pairs and confirmation status.
    Shows which PMs need to confirm which SE completions.
    """
    try:
        current_user = g.user
        current_pm_id = current_user['user_id']
        current_user_role = current_user.get('role', '').lower()

        # Get project
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Check access - PM/MEP must be assigned to project, Admin can see all
        if current_user_role not in ['admin']:
            # Check if user is assigned as PM or MEP
            pm_ids = project.user_id if isinstance(project.user_id, list) else []
            mep_ids = project.mep_supervisor_id if isinstance(project.mep_supervisor_id, list) else []

            if current_pm_id not in pm_ids and current_pm_id not in mep_ids:
                return jsonify({"error": "You don't have access to this project"}), 403

        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import func

        # Get all unique PM-SE assignment pairs with aggregated data
        assignment_pairs = db.session.query(
            PMAssignSS.assigned_by_pm_id,
            PMAssignSS.assigned_to_se_id,
            func.array_agg(PMAssignSS.item_indices).label('all_item_indices'),
            func.bool_and(PMAssignSS.se_completion_requested).label('completion_requested'),
            func.bool_and(PMAssignSS.pm_confirmed_completion).label('pm_confirmed'),
            func.max(PMAssignSS.se_completion_request_date).label('request_date'),
            func.max(PMAssignSS.pm_confirmation_date).label('confirmation_date')
        ).filter(
            PMAssignSS.project_id == project_id,
            PMAssignSS.is_deleted == False,
            PMAssignSS.assigned_by_pm_id.isnot(None),
            PMAssignSS.assigned_to_se_id.isnot(None)
        ).group_by(
            PMAssignSS.assigned_by_pm_id,
            PMAssignSS.assigned_to_se_id
        ).all()

        # Log for debugging
        log.info(f"Project {project_id} completion details: Found {len(assignment_pairs)} PM-SE pairs")

        # Build detailed response
        details = []
        for pair in assignment_pairs:
            # Get PM and SE user details
            pm_user = User.query.get(pair.assigned_by_pm_id)
            se_user = User.query.get(pair.assigned_to_se_id)

            # Log pair details for debugging
            log.info(f"PM-SE pair: PM {pair.assigned_by_pm_id} -> SE {pair.assigned_to_se_id}, "
                    f"completion_requested: {pair.completion_requested}, pm_confirmed: {pair.pm_confirmed}")

            # Flatten and deduplicate item indices
            all_items = []
            for item_list in pair.all_item_indices:
                if item_list:
                    all_items.extend(item_list)
            unique_items = list(set(all_items))

            details.append({
                "pm_id": pair.assigned_by_pm_id,
                "pm_name": pm_user.full_name if pm_user else "Unknown PM",
                "se_id": pair.assigned_to_se_id,
                "se_name": se_user.full_name if se_user else "Unknown SE",
                "items_count": len(unique_items),
                "item_indices": sorted(unique_items),
                "completion_requested": pair.completion_requested or False,
                "pm_confirmed": pair.pm_confirmed or False,
                "request_date": pair.request_date.isoformat() if pair.request_date else None,
                "confirmation_date": pair.confirmation_date.isoformat() if pair.confirmation_date else None,
                "can_confirm": pair.assigned_by_pm_id == current_pm_id and pair.completion_requested and not pair.pm_confirmed
            })

        # Calculate summary counts
        total_pairs = len(details)
        confirmed_count = sum(1 for d in details if d['pm_confirmed'])
        pending_confirmation = sum(1 for d in details if d['completion_requested'] and not d['pm_confirmed'])
        awaiting_se_request = sum(1 for d in details if not d['completion_requested'])

        # Check if project should be marked complete
        all_confirmed = confirmed_count == total_pairs and total_pairs > 0

        return jsonify({
            "success": True,
            "project_id": project_id,
            "project_name": project.project_name,
            "project_status": project.status,
            "completion_requested": project.completion_requested,
            "confirmation_status": f"{confirmed_count}/{total_pairs} confirmations",
            "summary": {
                "total_assignments": total_pairs,
                "confirmed_completions": confirmed_count,
                "pending_confirmations": pending_confirmation,
                "awaiting_se_requests": awaiting_se_request,
                "all_confirmed": all_confirmed,
                "ready_for_completion": all_confirmed
            },
            "assignment_pairs": details,
            "current_user_can_confirm": [d for d in details if d['can_confirm']]
        }), 200

    except Exception as e:
        log.error(f"Error getting completion details: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to get completion details: {str(e)}"
        }), 500