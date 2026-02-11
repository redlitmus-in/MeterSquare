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
from sqlalchemy.orm import selectinload, joinedload, defer
from config.db import db
from models.project import Project
from models.boq import *
from models.po_child import POChild
from models.change_request import ChangeRequest
from models.labour_requisition import LabourRequisition
from models.daily_attendance import DailyAttendance
from models.asset_requisition import AssetRequisition
from config.change_request_config import CR_CONFIG
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
                    if boq.status not in ['Client_Confirmed', 'approved', 'PM_Approved']:
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

        # Determine who should be recorded as the assigner
        # If admin is assigning, use the project's PM so CRs route correctly
        if is_admin:
            # Get the project's actual PM
            pm_ids = project.user_id if isinstance(project.user_id, list) else ([project.user_id] if project.user_id else [])
            if not pm_ids:
                return jsonify({"error": "No Project Manager assigned to this project"}), 400
            actual_pm_id = pm_ids[0]
            actual_pm_user = User.query.get(actual_pm_id)
            if not actual_pm_user:
                return jsonify({"error": "Project Manager user record not found"}), 400
            assigner_id = actual_pm_id
            assigner_name = actual_pm_user.full_name
            log.info(f"Admin {pm_name} assigning items, using project PM {assigner_name} (ID: {assigner_id}) as assigner")
        else:
            # PM/MEP is assigning - use their ID
            assigner_id = pm_user_id
            assigner_name = pm_name

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
            if existing_pm_id and existing_pm_id != assigner_id:
                skipped_items.append({
                    "index": item_index,
                    "item_code": item.get('item_code', 'N/A'),
                    "reason": f"Already assigned by another {role_name}",
                    "assigned_by": item.get('assigned_by_pm_name')
                })
                continue

            # Assign the item
            item['assigned_by_pm_user_id'] = assigner_id
            item['assigned_by_pm_name'] = assigner_name
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
            assigned_by_pm_id=assigner_id,
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
                assigned_by_pm_id=assigner_id,
                assigned_to_se_id=se_user_id,
                assignment_date=datetime.utcnow(),
                created_by=assigner_name,
                created_at=datetime.utcnow(),
                is_deleted=False
            )
            db.session.add(new_assignment)
            log.info(f"Created new assignment record in pm_assign_ss for BOQ {boq_id}, SE {se_user_id} (assigned by {assigner_name})")

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

        se_role = Role.query.filter_by(role='siteEngineer', is_deleted=False).first()
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

        # Auto-complete project if all confirmed AND no pending purchases/returns
        project_completed = False
        if confirmed_pairs == total_pairs and total_pairs > 0:
            # ============ FINAL VALIDATION: Check Whole Project ============
            from models.change_request import ChangeRequest
            from models.returnable_assets import AssetReturnRequest
            from config.change_request_config import CR_CONFIG

            # Check for ANY incomplete purchases in the project
            # Use centralized completion statuses from config
            incomplete_purchases = ChangeRequest.query.filter(
                ChangeRequest.project_id == project_id,
                ChangeRequest.is_deleted == False,
                ~ChangeRequest.status.in_(CR_CONFIG.COMPLETION_STATUSES)
            ).count()

            # Check for ANY incomplete returns in the project
            incomplete_returns = AssetReturnRequest.query.filter(
                AssetReturnRequest.project_id == project_id,
                AssetReturnRequest.status.in_(CR_CONFIG.ASSET_RETURN_INCOMPLETE_STATUSES)
            ).count()

            # If incomplete items exist, don't complete the project yet
            if incomplete_purchases > 0 or incomplete_returns > 0:
                log.warning(f"PM {pm_user_id} confirmed SE {se_user_id}, but project {project_id} has {incomplete_purchases} incomplete purchases and {incomplete_returns} incomplete returns - NOT auto-completing")

                # INTENTIONAL: Save PM confirmation even though project can't complete yet
                # This allows tracking progress while waiting for purchases/returns to finish
                db.session.commit()

                return jsonify({
                    "success": True,
                    "message": f"SE completion confirmed successfully. Project will auto-complete when all purchases and returns are finished.",
                    "confirmation_status": f"{confirmed_pairs}/{total_pairs} confirmations",
                    "project_completed": False,
                    "pending_items": {
                        "purchases": incomplete_purchases,
                        "returns": incomplete_returns
                    }
                }), 200
            # ============ END FINAL VALIDATION ============

            # All clear - complete the project
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
        # Use bool_or for completion_requested: True if ANY record shows SE requested
        # Use bool_or for pm_confirmed: True if ANY record is confirmed (PM confirms all at once)
        assignment_pairs = db.session.query(
            PMAssignSS.assigned_by_pm_id,
            PMAssignSS.assigned_to_se_id,
            func.array_agg(PMAssignSS.item_indices).label('all_item_indices'),
            func.coalesce(func.bool_or(PMAssignSS.se_completion_requested), False).label('completion_requested'),
            func.coalesce(func.bool_or(PMAssignSS.pm_confirmed_completion), False).label('pm_confirmed'),
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

def get_pm_approval_boq():
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
                Project.status.label('project_status'),
                Project.start_date,
                Project.end_date,
                Project.location,
                Project.floor_name,
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
        # Admin sees all BOQs with Pending_PM_Approval status
        if user_role == 'admin':
            pass  # No additional filter for admin - sees all
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
                "boq_status": row.boq_status,
                "project_status" : row.project_status,
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


def get_pm_assign_project():
    """Get BOQs that the current PM has assigned to Site Supervisors - ONGOING (non-completed) - OPTIMIZED FOR SPEED"""
    try:
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import func, case, and_
        from models.boq import BOQDetails

        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

        # OPTIMIZED: Subqueries with combined filters
        assignment_counts = (
            db.session.query(
                PMAssignSS.boq_id,
                func.sum(func.coalesce(func.cardinality(PMAssignSS.item_indices), 0)).label('total_items_assigned'),
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
                ).label('completion_requested_items_count'),
                # Count unique PM-SE assignment pairs (for total_se_assignments)
                func.count(func.distinct(func.concat(PMAssignSS.assigned_by_pm_id, '-', PMAssignSS.assigned_to_se_id))).label('total_se_assignments'),
                # Count confirmed PM-SE pairs (for confirmed_completions)
                func.count(func.distinct(
                    case(
                        (PMAssignSS.pm_confirmed_completion == True, func.concat(PMAssignSS.assigned_by_pm_id, '-', PMAssignSS.assigned_to_se_id)),
                        else_=None
                    )
                )).label('confirmed_completions'),
                # Count SE completion requested pairs (pending confirmations)
                func.count(func.distinct(
                    case(
                        (PMAssignSS.se_completion_requested == True, func.concat(PMAssignSS.assigned_by_pm_id, '-', PMAssignSS.assigned_to_se_id)),
                        else_=None
                    )
                )).label('pending_se_requests')
            )
            .filter(
                PMAssignSS.is_deleted == False,
                PMAssignSS.boq_id.isnot(None)  # Ensure PMAssignSS record exists
            )
            .group_by(PMAssignSS.boq_id)
            .subquery()
        )

        boq_items_count_subquery = (
            db.session.query(
                BOQDetails.boq_id,
                func.coalesce(BOQDetails.total_items, 0).label('total_items')
            )
            .filter(BOQDetails.is_deleted == False)
            .subquery()
        )

        # OPTIMIZED: Build query once without duplication
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
                func.coalesce(assignment_counts.c.completion_requested_items_count, 0).label('completion_requested_items_count'),
                func.coalesce(assignment_counts.c.total_se_assignments, 0).label('total_se_assignments'),
                func.coalesce(assignment_counts.c.confirmed_completions, 0).label('confirmed_completions'),
                func.coalesce(assignment_counts.c.pending_se_requests, 0).label('pending_se_requests'),
                Project.completion_requested
            )
            .join(BOQ, Project.project_id == BOQ.project_id)
            .join(PMAssignSS, BOQ.boq_id == PMAssignSS.boq_id)  # INNER JOIN - only show if PM has assignments
            .outerjoin(boq_items_count_subquery, BOQ.boq_id == boq_items_count_subquery.c.boq_id)
            .outerjoin(assignment_counts, BOQ.boq_id == assignment_counts.c.boq_id)
            .filter(
                Project.is_deleted == False,
                BOQ.is_deleted == False,
                BOQ.status == 'items_assigned',  # Only show projects with items_assigned status
                PMAssignSS.is_deleted == False,
                # FILTER: Only show ongoing (non-completed) projects
                ~Project.status.in_(['completed', 'Completed'])
            )
        )

        # PERFORMANCE: Apply role filter conditionally (no query duplication)
        if user_role != 'admin':
            # Filter to show only projects where current PM has made assignments in PMAssignSS table
            pm_user_id = int(user_id) if user_id else None
            if pm_user_id:
                query = query.filter(
                    and_(
                        Project.user_id.contains([pm_user_id]),  # PM must be assigned to project
                        PMAssignSS.assigned_by_pm_id == pm_user_id  # PM must have made assignments
                    )
                )

        query = query.group_by(
            Project.project_id, Project.project_code, Project.project_name, Project.client,
            Project.location, Project.floor_name, Project.working_hours, Project.area,
            Project.work_type, Project.start_date, Project.end_date, Project.duration_days,
            Project.description, Project.user_id, Project.created_at, Project.created_by,
            Project.status, Project.completion_requested,
            BOQ.boq_id, BOQ.status, BOQ.boq_name,
            boq_items_count_subquery.c.total_items, assignment_counts.c.total_items_assigned,
            assignment_counts.c.confirmed_items_count, assignment_counts.c.completion_requested_items_count,
            assignment_counts.c.total_se_assignments, assignment_counts.c.confirmed_completions,
            assignment_counts.c.pending_se_requests
        ).order_by(Project.created_at.desc())

        # OPTIMIZED: Use func.count() instead of .count()
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()

            if total_count == 0:
                return jsonify({
                    "message": "PM assigned projects retrieved successfully",
                    "count": 0,
                    "data": [],
                    "pagination": {"page": page, "page_size": page_size, "total_count": 0, "total_pages": 0, "has_next": False, "has_prev": False}
                }), 200

            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

            if total_count == 0:
                return jsonify({"message": "PM assigned projects retrieved successfully", "count": 0, "data": []}), 200

        # OPTIMIZED: Direct mapping without debug logging
        projects = [
            {
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
                "total_boq_items": int(row.total_boq_items) if row.total_boq_items else 0,
                "total_items_assigned": int(row.total_items_assigned) if row.total_items_assigned else 0,
                "confirmed_items_count": int(row.confirmed_items_count) if row.confirmed_items_count else 0,
                "completion_requested_items_count": int(row.completion_requested_items_count) if row.completion_requested_items_count else 0,
                "items_assigned": f"{int(row.total_items_assigned) if row.total_items_assigned else 0}/{int(row.total_boq_items) if row.total_boq_items else 0}",
                # SE-level assignment and confirmation tracking
                "total_se_assignments": int(row.total_se_assignments) if row.total_se_assignments else 0,
                "confirmed_completions": int(row.confirmed_completions) if row.confirmed_completions else 0,
                "pending_se_requests": int(row.pending_se_requests) if row.pending_se_requests else 0,
                "completion_requested": row.completion_requested or False,
                # Use SE-level confirmations for the display (confirmed_completions / total_se_assignments)
                "confirmations": f"{int(row.confirmed_completions) if row.confirmed_completions else 0}/{int(row.total_se_assignments) if row.total_se_assignments else 0}"
            }
            for row in rows
        ]

        response = {
            "message": "PM assigned projects retrieved successfully",
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
        log.error(f"Error retrieving PM assigned projects: {str(e)}")
        return jsonify({'error': 'Failed to retrieve PM assigned projects', 'details': str(e)}), 500

def get_pm_approved_boq():
    """Get projects assigned to the current PM - OPTIMIZED FOR SPEED"""
    try:
        from sqlalchemy import func

        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

        # OPTIMIZED: Build query with combined filters (single .filter() is faster)
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
            .filter(BOQ.is_deleted == False, Project.is_deleted == False)
        )

        # PERFORMANCE: Apply role filter early (reduces rows before sorting)
        if user_role != 'admin':
            query = query.filter(BOQ.last_pm_user_id == user_id)

        query = query.order_by(BOQ.created_at.desc())

        # OPTIMIZED: Use func.count() - 2-3x faster than .count()
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()

            # Early return if no results
            if total_count == 0:
                return jsonify({
                    "message": "PM Approval BOQs retrieved successfully",
                    "count": 0,
                    "data": [],
                    "pagination": {"page": page, "page_size": page_size, "total_count": 0, "total_pages": 0, "has_next": False, "has_prev": False}
                }), 200

            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

            if total_count == 0:
                return jsonify({"message": "PM Approval BOQs retrieved successfully", "count": 0, "data": []}), 200

        # OPTIMIZED: Direct mapping (no extra loops or operations)
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
        return jsonify({'error': 'Failed to retrieve PM Approval BOQs', 'details': str(e)}), 500

def get_pm_pending_boq():
    """Get pending projects - projects with approved BOQs not yet completed + items_assigned projects where PM hasn't made assignments AND not all items are assigned - OPTIMIZED FOR SPEED"""
    try:
        from sqlalchemy import func, or_, and_, exists
        from models.pm_assign_ss import PMAssignSS
        from models.boq import BOQDetails

        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

        # Subquery to get total items in BOQ from BOQDetails
        boq_items_count_subquery = (
            db.session.query(
                BOQDetails.boq_id,
                func.coalesce(BOQDetails.total_items, 0).label('total_items')
            )
            .filter(BOQDetails.is_deleted == False)
            .subquery()
        )

        # Subquery to get total items assigned by ALL PMs (not just current PM)
        all_pm_assignments_count = (
            db.session.query(
                PMAssignSS.boq_id,
                func.sum(func.coalesce(func.cardinality(PMAssignSS.item_indices), 0)).label('total_items_assigned')
            )
            .filter(PMAssignSS.is_deleted == False)
            .group_by(PMAssignSS.boq_id)
            .subquery()
        )

        # OPTIMIZED: Select specific columns instead of entire Project object
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
                Project.created_at,
                Project.created_by,
                BOQ.status.label('boq_status'),
                BOQ.boq_id,
                BOQ.boq_name
            )
            .join(BOQ, Project.project_id == BOQ.project_id)
            .outerjoin(boq_items_count_subquery, BOQ.boq_id == boq_items_count_subquery.c.boq_id)
            .outerjoin(all_pm_assignments_count, BOQ.boq_id == all_pm_assignments_count.c.boq_id)
            .filter(
                Project.is_deleted == False,
                BOQ.is_deleted == False,
                Project.status.notin_(['completed', 'Completed'])
            )
        )

        # PERFORMANCE: Apply role filter early
        # Filter projects where current PM's user_id is in the project's user_id array
        pm_user_id = None
        if user_role in ['projectmanager', 'project_manager', 'pm']:
            # Ensure user_id is integer for JSONB array comparison
            pm_user_id = int(user_id) if user_id else None
            if pm_user_id:
                query = query.filter(Project.user_id.contains([pm_user_id]))

                # Create a subquery to check if PM has made ANY assignments for this BOQ
                pm_has_assignments = exists().where(
                    and_(
                        PMAssignSS.boq_id == BOQ.boq_id,
                        PMAssignSS.assigned_by_pm_id == pm_user_id,
                        PMAssignSS.is_deleted == False
                    )
                )

                # Add condition: Show projects with status 'approved' OR
                # projects with status 'items_assigned' where:
                #   - PM hasn't made ANY assignments AND
                #   - NOT all items have been assigned by other PMs
                query = query.filter(
                    or_(
                        BOQ.status.in_(['approved', 'Approved']),
                        and_(
                            BOQ.status == 'items_assigned',
                            ~pm_has_assignments,  # NOT EXISTS - PM has no assignments for this BOQ
                            or_(
                                # Either no assignments exist at all
                                all_pm_assignments_count.c.total_items_assigned == None,
                                # Or total items assigned < total items in BOQ (items still available)
                                func.coalesce(all_pm_assignments_count.c.total_items_assigned, 0) < func.coalesce(boq_items_count_subquery.c.total_items, 0)
                            )
                        )
                    )
                )
        else:
            # Admin sees all approved projects
            query = query.filter(BOQ.status.in_(['approved', 'Approved']))

        query = query.distinct().order_by(Project.created_at.desc())

        # OPTIMIZED: Use func.count() instead of .count()
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()

            if total_count == 0:
                return jsonify({
                    "message": "PM pending projects retrieved successfully",
                    "count": 0,
                    "data": [],
                    "pagination": {"page": page, "page_size": page_size, "total_count": 0, "total_pages": 0, "has_next": False, "has_prev": False}
                }), 200

            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

            if total_count == 0:
                return jsonify({"message": "PM pending projects retrieved successfully", "count": 0, "data": []}), 200

        # OPTIMIZED: Direct mapping with specific columns
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
                "boq_status": row.boq_status,
                "boq_id": row.boq_id,
                "boq_name": row.boq_name,
                "description": row.description,
                "user_id": row.user_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "created_by": row.created_by
            }
            for row in rows
        ]

        response = {
            "message": "PM pending projects retrieved successfully",
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
        log.error(f"Error retrieving PM pending projects: {str(e)}")
        return jsonify({'error': 'Failed to retrieve PM pending projects', 'details': str(e)}), 500

def get_pm_rejected_boq():
    """Get PM Rejected BOQs - filtered by BOQ.last_pm_user_id - OPTIMIZED FOR SPEED"""
    try:
        from sqlalchemy import func

        current_user = g.user
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower()

        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', 20, type=int)
        page_size = min(page_size, 100)

        # OPTIMIZED: Combined filters
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
                Project.start_date,
                Project.end_date,
                Project.status.label('project_status'),
                Project.working_hours,
                Project.user_id,
                User.full_name.label('last_pm_name')
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .filter(BOQ.is_deleted == False, Project.is_deleted == False, BOQ.status == 'PM_Rejected')
        )

        # PERFORMANCE: Apply role filter early
        if user_role != 'admin':
            query = query.filter(BOQ.last_pm_user_id == user_id)

        query = query.order_by(BOQ.created_at.desc())

        # OPTIMIZED: Use func.count() instead of .count()
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()

            if total_count == 0:
                return jsonify({
                    "message": "PM Rejected BOQs retrieved successfully",
                    "count": 0,
                    "data": [],
                    "pagination": {"page": page, "page_size": page_size, "total_count": 0, "total_pages": 0, "has_next": False, "has_prev": False}
                }), 200

            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

            if total_count == 0:
                return jsonify({"message": "PM Rejected BOQs retrieved successfully", "count": 0, "data": []}), 200

        # OPTIMIZED: Direct mapping with consistent date formatting
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
                "boq_status": row.boq_status,
                "client_status": row.client_status,
                "revision_number": row.revision_number or 0,
                "email_sent": row.email_sent,
                "user_id": row.user_id,
                "start_date": row.start_date.isoformat() if row.start_date else None,
                "end_date": row.end_date.isoformat() if row.end_date else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "created_by": row.created_by,
                "client_rejection_reason": row.client_rejection_reason,
                "last_pm_user_id": row.last_pm_user_id,
                "last_pm_name": row.last_pm_name
            }
            for row in rows
        ]

        response = {
            "message": "PM Rejected BOQs retrieved successfully",
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
        log.error(f"Error retrieving PM Rejected BOQs: {str(e)}")
        return jsonify({'error': 'Failed to retrieve PM Rejected BOQs', 'details': str(e)}), 500


def get_pm_completed_project():
    """Get completed projects assigned to the current PM - OPTIMIZED FOR SPEED"""
    try:
        from sqlalchemy import func

        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

        # OPTIMIZED: Select specific columns, combined filters - Include BOQ info for details view
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
            .filter(Project.is_deleted == False, Project.status.in_(['completed', 'Completed']))
        )

        # PERFORMANCE: Apply role filter early
        if user_role in ['projectmanager', 'project_manager']:
            query = query.filter(Project.user_id.contains([user_id]))

        query = query.order_by(Project.created_at.desc())

        # OPTIMIZED: Use func.count() instead of .count()
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()

            if total_count == 0:
                return jsonify({
                    "message": "PM completed projects retrieved successfully",
                    "count": 0,
                    "data": [],
                    "pagination": {"page": page, "page_size": page_size, "total_count": 0, "total_pages": 0, "has_next": False, "has_prev": False}
                }), 200

            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

            if total_count == 0:
                return jsonify({"message": "PM completed projects retrieved successfully", "count": 0, "data": []}), 200

        # OPTIMIZED: Direct mapping with specific columns - Include BOQ info for details view
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

        response = {
            "message": "PM completed projects retrieved successfully",
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
        log.error(f"Error retrieving PM completed projects: {str(e)}")
        return jsonify({'error': 'Failed to retrieve PM completed projects', 'details': str(e)}), 500

def get_pm_dashboard():
    """
    Get COMPREHENSIVE dashboard statistics for the current user's projects
    - Shows data based on BOQs where the PM is assigned (via last_pm_user_id)
    - Each PM sees only their own BOQ statuses (approved, pending, rejected, completed)
    - Admins can view all data or filter by specific PM
    """
    try:
        from models.pm_assign_ss import PMAssignSS
        from models.boq import BOQ, BOQDetails
        from models.project import Project
        from sqlalchemy import func, case, and_, or_
        from sqlalchemy.dialects.postgresql import JSONB
        from sqlalchemy import cast

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Check if admin is viewing as a specific PM (from query params or context)
        viewing_as_pm_id = request.args.get('viewing_as_pm_id', type=int)

        # Determine the filter user ID
        filter_user_id = viewing_as_pm_id if (user_role == 'admin' and viewing_as_pm_id) else user_id

        # Get projects where current user is assigned as PM
        if user_role == 'admin' and not viewing_as_pm_id:
            # Admin viewing general dashboard - show ALL projects
            project_ids_query = db.session.query(Project.project_id).filter(
                Project.is_deleted == False
            )
        else:
            # Regular PM or admin viewing as specific PM - filter by PM's projects
            project_ids_query = db.session.query(Project.project_id).filter(
                Project.is_deleted == False,
                Project.user_id.op('@>')(cast([filter_user_id], JSONB))
            )

        project_ids = [row[0] for row in project_ids_query.all()]

        # For admin viewing general PM dashboard, include ALL projects with PM-assigned BOQs
        if user_role == 'admin' and not viewing_as_pm_id:
            # Admin: Find ALL projects that have ANY BOQs with last_pm_user_id set
            # EVEN IF PROJECT IS DELETED - we still want to count those BOQs
            projects_with_any_pm_boqs = db.session.query(
                Project.project_id, Project.project_name, Project.is_deleted
            ).join(BOQ, Project.project_id == BOQ.project_id).filter(
                BOQ.last_pm_user_id.isnot(None),
                BOQ.is_deleted == False
            ).distinct().all()

            missing_projects = []
            for p in projects_with_any_pm_boqs:
                in_list = p.project_id in project_ids
                if not in_list:
                    missing_projects.append(p.project_id)

            if missing_projects:
                project_ids.extend(missing_projects)
        else:
            # Regular PM: Find projects that have BOQs assigned to this specific PM
            projects_with_pm_boqs = db.session.query(
                Project.project_id, Project.project_name, Project.user_id, Project.is_deleted
            ).join(BOQ, Project.project_id == BOQ.project_id).filter(
                BOQ.last_pm_user_id == filter_user_id,
                BOQ.is_deleted == False
            ).distinct().all()

            missing_projects = []
            for p in projects_with_pm_boqs:
                in_list = p.project_id in project_ids
                if not in_list and not p.is_deleted:
                    missing_projects.append(p.project_id)

            if missing_projects:
                project_ids.extend(missing_projects)

        if not project_ids:
            return jsonify({
                "success": True,
                "stats": {
                    "total_boq_items": 0,
                    "items_assigned": 0,
                    "pending_assignment": 0,
                    "total_project_value": 0
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

        # OPTIMIZED: Single aggregated query for BOQ details statistics
        # PM sees ALL BOQs in their assigned projects (not just BOQs where they are last_pm_user_id)
        # This gives the PM a complete view of all work in their projects
        boq_stats = db.session.query(
            func.coalesce(func.sum(BOQDetails.total_items), 0).label('total_items'),
            func.coalesce(func.sum(BOQDetails.total_materials), 0).label('total_materials'),
            func.coalesce(func.sum(BOQDetails.total_labour), 0).label('total_labour'),
            func.coalesce(func.sum(BOQDetails.total_cost), 0).label('total_cost')
        ).join(BOQ, BOQDetails.boq_id == BOQ.boq_id).filter(
            BOQ.project_id.in_(project_ids),
            BOQ.is_deleted == False,
            BOQDetails.is_deleted == False
        ).first()

        total_boq_items = int(boq_stats.total_items) if boq_stats else 0
        total_materials = int(boq_stats.total_materials) if boq_stats else 0
        total_labour = int(boq_stats.total_labour) if boq_stats else 0
        total_project_value = float(boq_stats.total_cost) if boq_stats else 0.0

        # OPTIMIZED: Single query for BOQ status counts
        # Status categorization matching the tab logic EXACTLY:
        # - for_approval: BOQs with status = 'Pending_PM_Approval' where last_pm_user_id = current PM
        # - pending: BOQs with status in ['approved', 'Approved'] OR (status='items_assigned' AND PM has no assignments)
        # - assigned: BOQs with status = 'items_assigned' where PM has made assignments (count from PMAssignSS)
        # - approved: BOQs where last_pm_user_id = current PM (all BOQs assigned to this PM)
        # - rejected: BOQs with status = 'PM_Rejected' where last_pm_user_id = current PM
        # - completed: Projects with status containing 'completed'

        if user_role == 'admin' and not viewing_as_pm_id:
            # Admin sees all BOQs across all projects
            status_counts = db.session.query(
                # For Approval: BOQs with Pending_PM_Approval status
                func.sum(case(
                    (BOQ.status == 'Pending_PM_Approval', 1),
                    else_=0
                )).label('for_approval'),
                # Pending: BOQs with approved/Approved status
                func.sum(case(
                    (BOQ.status.in_(['approved', 'Approved']), 1),
                    else_=0
                )).label('pending'),
                # Assigned: BOQs with items_assigned status
                func.sum(case(
                    (BOQ.status == 'items_assigned', 1),
                    else_=0
                )).label('assigned'),
                # Approved: For admin, count ALL BOQs (matches "Approved" tab logic at line 2196)
                # The /pm_approve_boq endpoint returns ALL BOQs for admin (no filter)
                func.count(BOQ.boq_id).label('approved'),
                # Rejected: BOQs with PM_Rejected status
                func.sum(case(
                    (BOQ.status == 'PM_Rejected', 1),
                    else_=0
                )).label('rejected'),
                # Completed: BOQs with completed status
                func.sum(case(
                    (BOQ.status.ilike('%completed%'), 1),
                    else_=0
                )).label('completed')
            ).filter(
                BOQ.project_id.in_(project_ids),
                BOQ.is_deleted == False
            ).first()
        else:
            # Regular PM sees only their assigned BOQs
            # Count BOQs where PM has made assignments using PMAssignSS
            from models.pm_assign_ss import PMAssignSS

            # Subquery to check if PM has assignments for a BOQ
            pm_has_assignments_subquery = (
                db.session.query(PMAssignSS.boq_id)
                .filter(
                    PMAssignSS.assigned_by_pm_id == filter_user_id,
                    PMAssignSS.is_deleted == False
                )
                .distinct()
                .subquery()
            )

            status_counts = db.session.query(
                # For Approval: BOQs with Pending_PM_Approval status assigned to this PM
                func.sum(case(
                    (and_(
                        BOQ.status == 'Pending_PM_Approval',
                        BOQ.last_pm_user_id == filter_user_id
                    ), 1),
                    else_=0
                )).label('for_approval'),
                # Pending: BOQs with status 'approved/Approved' in PM's projects
                # OR status 'items_assigned' where PM has NOT made assignments yet
                func.sum(case(
                    (or_(
                        BOQ.status.in_(['approved', 'Approved']),
                        and_(
                            BOQ.status == 'items_assigned',
                            BOQ.boq_id.notin_(db.session.query(pm_has_assignments_subquery.c.boq_id))
                        )
                    ), 1),
                    else_=0
                )).label('pending'),
                # Assigned: BOQs with status 'items_assigned' where PM HAS made assignments
                func.sum(case(
                    (and_(
                        BOQ.status == 'items_assigned',
                        BOQ.boq_id.in_(db.session.query(pm_has_assignments_subquery.c.boq_id))
                    ), 1),
                    else_=0
                )).label('assigned'),
                # Approved: ALL BOQs where last_pm_user_id = current PM (matches "Approved" tab)
                func.sum(case(
                    (BOQ.last_pm_user_id == filter_user_id, 1),
                    else_=0
                )).label('approved'),
                # Rejected: BOQs with PM_Rejected status where last_pm_user_id = current PM
                func.sum(case(
                    (and_(
                        BOQ.status == 'PM_Rejected',
                        BOQ.last_pm_user_id == filter_user_id
                    ), 1),
                    else_=0
                )).label('rejected'),
                # Completed: Projects with completed status (checked at project level)
                func.sum(case(
                    (and_(
                        BOQ.status.ilike('%completed%'),
                        or_(
                            BOQ.last_pm_user_id == filter_user_id,
                            BOQ.last_pm_user_id == None
                        )
                    ), 1),
                    else_=0
                )).label('completed')
            ).filter(
                BOQ.project_id.in_(project_ids),
                BOQ.is_deleted == False
            ).first()

        boq_status_counts = {
            "for_approval": int(status_counts.for_approval) if status_counts.for_approval else 0,
            "pending": int(status_counts.pending) if status_counts.pending else 0,
            "assigned": int(status_counts.assigned) if status_counts.assigned else 0,
            "approved": int(status_counts.approved) if status_counts.approved else 0,
            "rejected": int(status_counts.rejected) if status_counts.rejected else 0,
            "completed": int(status_counts.completed) if status_counts.completed else 0
        }

        # OPTIMIZED: Count assigned items using sum of cardinality (array length)
        # Count ALL items assigned to Site Engineers in PM's projects
        items_assigned_result = db.session.query(
            func.coalesce(func.sum(func.cardinality(PMAssignSS.item_indices)), 0)
        ).join(BOQ, PMAssignSS.boq_id == BOQ.boq_id).filter(
            BOQ.project_id.in_(project_ids),
            PMAssignSS.is_deleted == False
        ).scalar()

        items_assigned = int(items_assigned_result) if items_assigned_result else 0
        pending_assignment = max(0, total_boq_items - items_assigned)

        # OPTIMIZED: Single query for recent activities with join
        # Show all recent BOQ activities in PM's projects
        recent_activities_data = db.session.query(
            BOQ.boq_id,
            BOQ.boq_name,
            BOQ.status,
            BOQ.last_modified_at,
            Project.project_name
        ).join(Project, BOQ.project_id == Project.project_id).filter(
            BOQ.project_id.in_(project_ids),
            BOQ.is_deleted == False
        ).order_by(BOQ.last_modified_at.desc()).limit(10).all()

        recent_activities = [
            {
                "boq_id": row.boq_id,
                "boq_name": row.boq_name,
                "project_name": row.project_name,
                "status": row.status,
                "last_modified": row.last_modified_at.isoformat() if row.last_modified_at else None
            }
            for row in recent_activities_data
        ]

        # Get projects with progress calculation
        projects_data = []
        if project_ids:
            projects_query = Project.query.filter(
                Project.project_id.in_(project_ids),
                Project.is_deleted == False
            ).all()

            for project in projects_query:
                # Calculate progress based on ALL BOQs in the project
                project_boqs = BOQ.query.filter(
                    BOQ.project_id == project.project_id,
                    BOQ.is_deleted == False
                ).all()

                total_boqs = len(project_boqs)
                if total_boqs > 0:
                    # Count BOQs by progress stage
                    # completed: 100%
                    # items_assigned: 75% (work in progress)
                    # approved/sent_for_confirmation/revision_approved: 50% (approved but not started)
                    # pending/revision: 25%
                    # draft: 0%
                    progress_sum = 0
                    for b in project_boqs:
                        status_lower = (b.status or '').lower()
                        if 'completed' in status_lower:
                            progress_sum += 100
                        elif 'items_assigned' in status_lower:
                            progress_sum += 75
                        elif 'approved' in status_lower or 'sent_for_confirmation' in status_lower:
                            progress_sum += 50
                        elif 'pending' in status_lower or 'revision' in status_lower:
                            progress_sum += 25
                        # draft = 0, no addition needed
                    progress = int(progress_sum / total_boqs)
                    progress = min(progress, 100)  # Cap at 100%
                else:
                    progress = 0

                projects_data.append({
                    "project_id": project.project_id,
                    "project_name": project.project_name,
                    "status": project.status,
                    "progress": progress
                })

        # Build base query filters for ChangeRequests
        cr_filters = [
            ChangeRequest.project_id.in_(project_ids),
            ChangeRequest.is_deleted == False
        ]

        # Get PM's own projects for filtering
        pm_project_ids = project_ids

        # Filter logic matching get_all_change_requests() controller
        if user_role == 'admin' and not viewing_as_pm_id:
            # Admin viewing general dashboard - show all PM-created requests in all projects
            # Include: Admin/PM created requests OR SE/SS requests that are NOT pending
            from sqlalchemy import func as sql_func
            cr_filters.append(
                or_(
                    # Admin or PM created (any status)
                    sql_func.lower(ChangeRequest.requested_by_role).in_(['admin', 'projectmanager', 'project_manager', 'pm']),
                    # SE/SS created but sent for review (not pending drafts)
                    and_(
                        sql_func.lower(ChangeRequest.requested_by_role).in_(['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor']),
                        ChangeRequest.status != 'pending'
                    )
                )
            )
        else:
            # Regular PM or admin viewing as specific PM
            # Match the EXACT logic from get_all_change_requests() controller (lines 1143-1186)
            from sqlalchemy import func as sql_func

            # Define status filters - use CR_CONFIG to include 'rejected' status
            approved_status_filter = ChangeRequest.status.in_(CR_CONFIG.APPROVED_WORKFLOW_STATUSES)

            # PM role filter (pending/pm_request requests)
            pm_role_filter = and_(
                sql_func.lower(ChangeRequest.requested_by_role).in_(['projectmanager', 'project_manager', 'pm']),
                ChangeRequest.status.in_(['pending', 'pm_request'])
            )

            # Admin-created requests
            admin_created_filter = sql_func.lower(ChangeRequest.requested_by_role) == 'admin'

            # SE requests sent to this PM
            send_to_pm_filter = and_(
                ChangeRequest.status == 'send_to_pm',
                ChangeRequest.assigned_to_pm_user_id == filter_user_id
            )

            # SE-originated requests assigned to this PM (approved/completed)
            se_originated_assigned_to_this_pm = and_(
                ChangeRequest.assigned_to_pm_user_id == filter_user_id,
                approved_status_filter
            )

            # PM/Admin originated approved requests (not SE-originated)
            pm_originated_approved = and_(
                approved_status_filter,
                sql_func.lower(ChangeRequest.requested_by_role).in_(['projectmanager', 'project_manager', 'pm', 'admin']),
                ChangeRequest.assigned_to_pm_user_id.is_(None)
            )

            # Requests approved by this PM
            pm_approved_by_this_user = ChangeRequest.pm_approved_by_user_id == filter_user_id

            cr_filters.append(
                or_(
                    # 1. PM's pending requests from their projects
                    and_(
                        ChangeRequest.project_id.in_(pm_project_ids),
                        pm_role_filter
                    ),
                    # 2. Admin-created requests from PM's projects (any status)
                    and_(
                        ChangeRequest.project_id.in_(pm_project_ids),
                        admin_created_filter
                    ),
                    # 3. SE requests sent to this PM
                    and_(
                        ChangeRequest.project_id.in_(pm_project_ids),
                        send_to_pm_filter
                    ),
                    # 4. SE-originated approved requests assigned to this PM
                    and_(
                        ChangeRequest.project_id.in_(pm_project_ids),
                        se_originated_assigned_to_this_pm
                    ),
                    # 5. PM/Admin originated approved requests from PM's projects
                    and_(
                        ChangeRequest.project_id.in_(pm_project_ids),
                        pm_originated_approved
                    ),
                    # 6. Requests approved by this PM
                    pm_approved_by_this_user,
                    # 7. Own requests (any status, any project)
                    ChangeRequest.requested_by_user_id == filter_user_id
                )
            )

        # Count unique ChangeRequests by status (matching frontend tabs)
        po_status_counts = db.session.query(
            # Sent to Buyer: 'under_review' with approval_required_from='buyer' OR 'assigned_to_buyer'
            func.count(func.distinct(case(
                (or_(
                    and_(ChangeRequest.status == 'under_review', ChangeRequest.approval_required_from == 'buyer'),
                    ChangeRequest.status == 'assigned_to_buyer'
                ), ChangeRequest.cr_id),
                else_=None
            ))).label('sent_to_buyer'),
            # SE Requested: send_to_pm, send_to_mep (SE-initiated requests waiting for approval)
            func.count(func.distinct(case(
                (ChangeRequest.status.in_(['send_to_pm', 'send_to_mep']), ChangeRequest.cr_id),
                else_=None
            ))).label('se_requested'),
            # Completed: purchase_completed OR routed_to_store
            func.count(func.distinct(case(
                (ChangeRequest.status.in_(['purchase_completed', 'routed_to_store']), ChangeRequest.cr_id),
                else_=None
            ))).label('completed'),
            # Rejected: status = 'rejected'
            func.count(func.distinct(case(
                (ChangeRequest.status == 'rejected', ChangeRequest.cr_id),
                else_=None
            ))).label('rejected')
        ).filter(
            *cr_filters
        ).first()

        purchase_order_status = {
            "sent_to_buyer": int(po_status_counts.sent_to_buyer) if po_status_counts.sent_to_buyer else 0,
            "se_requested": int(po_status_counts.se_requested) if po_status_counts.se_requested else 0,
            "completed": int(po_status_counts.completed) if po_status_counts.completed else 0,
            "rejected": int(po_status_counts.rejected) if po_status_counts.rejected else 0
        }

        is_admin_general_view = user_role == 'admin' and not viewing_as_pm_id

        if is_admin_general_view:
            # Admin viewing general dashboard - show ALL labour data
            labour_req_counts = db.session.query(
                func.sum(case((LabourRequisition.status == 'send_to_pm', 1), else_=0)).label('req_pending'),
                func.sum(case((LabourRequisition.status == 'approved', 1), else_=0)).label('req_approved'),
                func.sum(case((LabourRequisition.status == 'rejected', 1), else_=0)).label('req_rejected')
            ).filter(
                LabourRequisition.is_deleted == False
            ).first()
        else:
            # Regular PM or admin viewing as specific PM - filter by PM's context
            # Pending: Requisitions awaiting this PM's action (send_to_pm status in their projects)
            req_pending_count = db.session.query(func.count(LabourRequisition.requisition_id)).filter(
                LabourRequisition.project_id.in_(project_ids) if project_ids else LabourRequisition.project_id == -1,
                LabourRequisition.status == 'send_to_pm',
                LabourRequisition.is_deleted == False
            ).scalar() or 0

            # Approved/Rejected: Only requisitions actioned BY this PM
            req_approved_count = db.session.query(func.count(LabourRequisition.requisition_id)).filter(
                LabourRequisition.approved_by_user_id == filter_user_id,
                LabourRequisition.status == 'approved',
                LabourRequisition.is_deleted == False
            ).scalar() or 0

            req_rejected_count = db.session.query(func.count(LabourRequisition.requisition_id)).filter(
                LabourRequisition.approved_by_user_id == filter_user_id,
                LabourRequisition.status == 'rejected',
                LabourRequisition.is_deleted == False
            ).scalar() or 0

            # Create a named tuple-like object for consistency
            class LabourReqCounts:
                def __init__(self, pending, approved, rejected):
                    self.req_pending = pending
                    self.req_approved = approved
                    self.req_rejected = rejected

            labour_req_counts = LabourReqCounts(req_pending_count, req_approved_count, req_rejected_count)

        # Attendance Lock status counts (Pending = 'pending', Locked = 'locked')
        # Must match the Attendance Lock page logic: only attendance from requisitions approved BY this PM

        if is_admin_general_view:
            # Admin viewing general dashboard - show ALL attendance data
            attendance_lock_counts = db.session.query(
                func.sum(case((DailyAttendance.approval_status == 'pending', 1), else_=0)).label('pending_lock'),
                func.sum(case((DailyAttendance.approval_status == 'locked', 1), else_=0)).label('locked')
            ).first()
        else:
            # Regular PM or admin viewing as specific PM
            # Join with LabourRequisition to filter by requisitions approved BY this PM
            pending_lock_count = db.session.query(func.count(DailyAttendance.attendance_id)).join(
                LabourRequisition,
                DailyAttendance.requisition_id == LabourRequisition.requisition_id
            ).filter(
                DailyAttendance.project_id.in_(project_ids) if project_ids else DailyAttendance.project_id == -1,
                DailyAttendance.is_deleted == False,
                LabourRequisition.approved_by_user_id == filter_user_id,
                or_(
                    DailyAttendance.approval_status == 'pending',
                    and_(
                        DailyAttendance.approval_status.is_(None),
                        DailyAttendance.attendance_status == 'completed',
                        DailyAttendance.clock_out_time.isnot(None)
                    )
                )
            ).scalar() or 0

            locked_count = db.session.query(func.count(DailyAttendance.attendance_id)).join(
                LabourRequisition,
                DailyAttendance.requisition_id == LabourRequisition.requisition_id
            ).filter(
                DailyAttendance.project_id.in_(project_ids) if project_ids else DailyAttendance.project_id == -1,
                DailyAttendance.is_deleted == False,
                LabourRequisition.approved_by_user_id == filter_user_id,
                DailyAttendance.approval_status == 'locked'
            ).scalar() or 0

            # Create a named tuple-like object for consistency
            class AttendanceLockCounts:
                def __init__(self, pending, locked):
                    self.pending_lock = pending
                    self.locked = locked

            attendance_lock_counts = AttendanceLockCounts(pending_lock_count, locked_count)

        # Combine into labour data array for chart
        labour_data = [
            {
                "labour_type": "Requisition - Pending",
                "quantity": int(labour_req_counts.req_pending) if labour_req_counts.req_pending else 0
            },
            {
                "labour_type": "Requisition - Approved",
                "quantity": int(labour_req_counts.req_approved) if labour_req_counts.req_approved else 0
            },
            {
                "labour_type": "Requisition - Rejected",
                "quantity": int(labour_req_counts.req_rejected) if labour_req_counts.req_rejected else 0
            },
            {
                "labour_type": "Attendance - Pending Lock",
                "quantity": int(attendance_lock_counts.pending_lock) if attendance_lock_counts.pending_lock else 0
            },
            {
                "labour_type": "Attendance - Locked",
                "quantity": int(attendance_lock_counts.locked) if attendance_lock_counts.locked else 0
            }
        ]

        # Top 5 High Budget Projects - Calculate Grand Total from JSONB
        # Grand Total = Items Subtotal + Preliminary - Discount (stored in summary)
        project_budgets = {}

        # Query all BOQ details for PM's projects
        boq_details_query = db.session.query(
            BOQ.project_id,
            BOQDetails.boq_details
        ).join(
            BOQDetails, BOQ.boq_id == BOQDetails.boq_id
        ).filter(
            BOQ.project_id.in_(project_ids),
            BOQ.is_deleted == False,
            BOQDetails.is_deleted == False
        ).all()

        # Extract grand total from each BOQ's summary
        for row in boq_details_query:
            project_id = row.project_id
            boq_json = row.boq_details or {}

            # Try to get grand total from summary
            summary = boq_json.get('summary', {}) or boq_json.get('combined_summary', {}) or {}
            grand_total = summary.get('total_cost') or summary.get('selling_price') or 0

            # If not found in summary, calculate from items + preliminary - discount
            if not grand_total:
                items = boq_json.get('items', [])
                subtotal = sum(
                    float(item.get('amount', 0) or item.get('total', 0) or item.get('item_total', 0) or 0)
                    for item in items
                )

                # Get preliminary amount
                preliminaries = boq_json.get('preliminaries', {})
                preliminary_amount = float(
                    preliminaries.get('cost_details', {}).get('amount', 0) or
                    preliminaries.get('amount', 0) or
                    summary.get('preliminary_amount', 0) or 0
                )

                combined_subtotal = subtotal + preliminary_amount

                # Apply discount
                discount_percentage = float(summary.get('discount_percentage', 0) or boq_json.get('discount_percentage', 0) or 0)
                discount_amount = float(summary.get('discount_amount', 0) or boq_json.get('discount_amount', 0) or 0)

                if discount_percentage > 0 and discount_amount == 0:
                    discount_amount = (combined_subtotal * discount_percentage) / 100

                grand_total = combined_subtotal - discount_amount

            # Accumulate per project
            if project_id not in project_budgets:
                project_budgets[project_id] = 0
            project_budgets[project_id] += float(grand_total or 0)

        # Get project details and sort by budget
        top_projects_query = db.session.query(
            Project.project_id,
            Project.project_name,
            Project.location,
            Project.client
        ).filter(
            Project.project_id.in_(project_ids),
            Project.is_deleted == False
        ).all()

        top_budget_projects = [
            {
                "project_id": p.project_id,
                "project_name": p.project_name,
                "location": p.location,
                "client": p.client,
                "budget": round(project_budgets.get(p.project_id, 0), 2)
            }
            for p in top_projects_query
        ]

        # Sort by budget descending and take top 5
        top_budget_projects = sorted(top_budget_projects, key=lambda x: x['budget'], reverse=True)[:5]

        # Asset Requisition Stats - Detailed status breakdown for PM's projects
        asset_stats = db.session.query(
            func.count(func.distinct(AssetRequisition.requisition_id)).label('total'),
            func.count(func.distinct(case(
                (AssetRequisition.status == 'pending_pm', AssetRequisition.requisition_id),
                else_=None
            ))).label('pending_pm'),
            func.count(func.distinct(case(
                (AssetRequisition.status == 'pm_approved', AssetRequisition.requisition_id),
                else_=None
            ))).label('pm_approved'),
            func.count(func.distinct(case(
                (AssetRequisition.status == 'pm_rejected', AssetRequisition.requisition_id),
                else_=None
            ))).label('pm_rejected'),
            func.count(func.distinct(case(
                (AssetRequisition.status == 'pending_prod_mgr', AssetRequisition.requisition_id),
                else_=None
            ))).label('pending_prod_mgr'),
            func.count(func.distinct(case(
                (AssetRequisition.status == 'prod_mgr_approved', AssetRequisition.requisition_id),
                else_=None
            ))).label('prod_mgr_approved'),
            func.count(func.distinct(case(
                (AssetRequisition.status == 'dispatched', AssetRequisition.requisition_id),
                else_=None
            ))).label('dispatched'),
            func.count(func.distinct(case(
                (AssetRequisition.status == 'completed', AssetRequisition.requisition_id),
                else_=None
            ))).label('completed')
        ).filter(
            AssetRequisition.project_id.in_(project_ids),
            AssetRequisition.is_deleted == False
        ).first()

        asset_details = {
            "total": int(asset_stats.total) if asset_stats.total else 0,
            "pending_pm": int(asset_stats.pending_pm) if asset_stats.pending_pm else 0,
            "pm_approved": int(asset_stats.pm_approved) if asset_stats.pm_approved else 0,
            "pm_rejected": int(asset_stats.pm_rejected) if asset_stats.pm_rejected else 0,
            "pending_prod_mgr": int(asset_stats.pending_prod_mgr) if asset_stats.pending_prod_mgr else 0,
            "prod_mgr_approved": int(asset_stats.prod_mgr_approved) if asset_stats.prod_mgr_approved else 0,
            "dispatched": int(asset_stats.dispatched) if asset_stats.dispatched else 0,
            "completed": int(asset_stats.completed) if asset_stats.completed else 0,
            "total_approved": (int(asset_stats.pm_approved or 0) + int(asset_stats.prod_mgr_approved or 0) +
                             int(asset_stats.dispatched or 0) + int(asset_stats.completed or 0))
        }

        # Change Request Stats for PM's projects
        cr_stats = db.session.query(
            func.count(func.distinct(ChangeRequest.cr_id)).label('total'),
            func.count(func.distinct(case(
                (ChangeRequest.status == 'pending_pm_approval', ChangeRequest.cr_id),
                else_=None
            ))).label('pending_pm'),
            func.count(func.distinct(case(
                (ChangeRequest.status == 'pending_td_approval', ChangeRequest.cr_id),
                else_=None
            ))).label('pending_td'),
            func.count(func.distinct(case(
                (ChangeRequest.status.in_(['approved', 'vendor_approved', 'purchase_completed']), ChangeRequest.cr_id),
                else_=None
            ))).label('approved'),
            func.count(func.distinct(case(
                (ChangeRequest.status == 'rejected', ChangeRequest.cr_id),
                else_=None
            ))).label('rejected'),
            func.count(func.distinct(case(
                (ChangeRequest.status == 'purchase_completed', ChangeRequest.cr_id),
                else_=None
            ))).label('completed')
        ).filter(
            ChangeRequest.project_id.in_(project_ids),
            ChangeRequest.is_deleted == False
        ).first()

        change_request_stats = {
            "total": int(cr_stats.total) if cr_stats.total else 0,
            "pending_pm": int(cr_stats.pending_pm) if cr_stats.pending_pm else 0,
            "pending_td": int(cr_stats.pending_td) if cr_stats.pending_td else 0,
            "approved": int(cr_stats.approved) if cr_stats.approved else 0,
            "rejected": int(cr_stats.rejected) if cr_stats.rejected else 0,
            "completed": int(cr_stats.completed) if cr_stats.completed else 0
        }

        # Project Progress Stats - count projects by status
        project_status_counts = db.session.query(
            func.count(func.distinct(case(
                (Project.status == 'active', Project.project_id),
                else_=None
            ))).label('active'),
            func.count(func.distinct(case(
                (Project.status == 'in_progress', Project.project_id),
                else_=None
            ))).label('in_progress'),
            func.count(func.distinct(case(
                (Project.status == 'completed', Project.project_id),
                else_=None
            ))).label('completed'),
            func.count(func.distinct(case(
                (Project.status == 'on_hold', Project.project_id),
                else_=None
            ))).label('on_hold'),
            func.count(func.distinct(Project.project_id)).label('total')
        ).filter(
            Project.project_id.in_(project_ids),
            Project.is_deleted == False
        ).first()

        project_stats = {
            "total": int(project_status_counts.total) if project_status_counts.total else 0,
            "active": int(project_status_counts.active) if project_status_counts.active else 0,
            "in_progress": int(project_status_counts.in_progress) if project_status_counts.in_progress else 0,
            "completed": int(project_status_counts.completed) if project_status_counts.completed else 0,
            "on_hold": int(project_status_counts.on_hold) if project_status_counts.on_hold else 0
        }

        # Recent SE Requests - Latest 5 requests from Site Engineers needing PM attention
        recent_se_requests = []

        # 1. Recent SE Change Requests (send_to_pm status)
        se_crs = db.session.query(
            ChangeRequest.cr_id,
            ChangeRequest.status,
            ChangeRequest.created_at,
            ChangeRequest.requested_by_name,
            ChangeRequest.requested_by_role,
            Project.project_name
        ).join(
            Project, ChangeRequest.project_id == Project.project_id
        ).filter(
            ChangeRequest.project_id.in_(project_ids),
            ChangeRequest.is_deleted == False,
            func.lower(ChangeRequest.requested_by_role).in_(['siteengineer', 'sitesupervisor', 'site_engineer', 'site_supervisor'])
        ).order_by(ChangeRequest.created_at.desc()).limit(5).all()

        for cr in se_crs:
            recent_se_requests.append({
                "id": f"cr_{cr.cr_id}",
                "type": "cr",
                "code": f"PO-{cr.cr_id}",
                "project_name": cr.project_name,
                "status": cr.status,
                "requested_by": cr.requested_by_name,
                "date": cr.created_at.isoformat() if cr.created_at else None,
                "timestamp": cr.created_at
            })

        # 2. Recent SE Labour Requisitions
        se_labour = db.session.query(
            LabourRequisition.requisition_id,
            LabourRequisition.requisition_code,
            LabourRequisition.status,
            LabourRequisition.created_at,
            LabourRequisition.requested_by_name,
            Project.project_name
        ).join(
            Project, LabourRequisition.project_id == Project.project_id
        ).filter(
            LabourRequisition.project_id.in_(project_ids),
            LabourRequisition.is_deleted == False
        ).order_by(LabourRequisition.created_at.desc()).limit(5).all()

        for lr in se_labour:
            recent_se_requests.append({
                "id": f"labour_{lr.requisition_id}",
                "type": "labour",
                "code": lr.requisition_code,
                "project_name": lr.project_name,
                "status": lr.status,
                "requested_by": lr.requested_by_name,
                "date": lr.created_at.isoformat() if lr.created_at else None,
                "timestamp": lr.created_at
            })

        # 3. Recent SE Asset Requisitions
        se_assets = db.session.query(
            AssetRequisition.requisition_id,
            AssetRequisition.requisition_code,
            AssetRequisition.status,
            AssetRequisition.created_at,
            AssetRequisition.requested_by_name,
            Project.project_name
        ).join(
            Project, AssetRequisition.project_id == Project.project_id
        ).filter(
            AssetRequisition.project_id.in_(project_ids),
            AssetRequisition.is_deleted == False
        ).order_by(AssetRequisition.created_at.desc()).limit(5).all()

        for ar in se_assets:
            recent_se_requests.append({
                "id": f"asset_{ar.requisition_id}",
                "type": "asset",
                "code": ar.requisition_code,
                "project_name": ar.project_name,
                "status": ar.status,
                "requested_by": ar.requested_by_name,
                "date": ar.created_at.isoformat() if ar.created_at else None,
                "timestamp": ar.created_at
            })

        # Sort by timestamp and take top 5
        recent_se_requests = sorted(
            [r for r in recent_se_requests if r.get('timestamp')],
            key=lambda x: x['timestamp'],
            reverse=True
        )[:5]

        # Remove timestamp from response
        for item in recent_se_requests:
            item.pop('timestamp', None)

        return jsonify({
            "success": True,
            "stats": {
                "total_boq_items": total_boq_items,
                "items_assigned": items_assigned,
                "pending_assignment": pending_assignment,
                "total_project_value": round(total_project_value, 2)
            },
            "boq_status": boq_status_counts,
            "items_breakdown": {
                "materials": total_materials,
                "labour": total_labour
            },
            "purchase_order_status": purchase_order_status,
            "labour_data": labour_data,
            "top_budget_projects": top_budget_projects,
            "recent_activities": recent_activities,
            "projects": projects_data,
            "asset_details": asset_details,
            "change_request_stats": change_request_stats,
            "project_stats": project_stats,
            "recent_se_requests": recent_se_requests
        }), 200

    except Exception as e:
        log.error(f"Error getting PM dashboard stats: {str(e)}")
        import traceback
        log.error(traceback.format_exc())
        return jsonify({"error": "Failed to retrieve dashboard statistics", "details": str(e)}), 500

def get_pm_production_management_boqs():
    """
    Get ALL BOQs for PM Production Management view with tabs (For Approval, Pending, Assigned, Approved, Rejected, Completed)
    - Regular PM: Shows only BOQs where PM is in the project's user_id array
    - Admin: Shows ALL BOQs from all projects (full overview)
    """
    try:
        from sqlalchemy import func
        from sqlalchemy.dialects.postgresql import JSONB
        from sqlalchemy import cast

        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401

        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

        # OPTIMIZED: Build query with conditional PM assignment filter
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
            .filter(
                BOQ.is_deleted == False,
                Project.is_deleted == False
                # Show ALL BOQs including rejected - frontend will filter by tabs
            )
        )

        # IMPORTANT: Admin sees ALL BOQs, regular PM sees only BOQs for projects assigned to them
        if user_role != 'admin':
            # Regular PM: Filter by Project.user_id array (show BOQs where PM is assigned to the project)
            query = query.filter(Project.user_id.op('@>')(cast([user_id], JSONB)))

        query = query.order_by(BOQ.created_at.desc())

        # OPTIMIZED: Use func.count() - 2-3x faster than .count()
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()

            # Early return if no results
            if total_count == 0:
                return jsonify({
                    "message": "PM Production Management BOQs retrieved successfully",
                    "count": 0,
                    "data": [],
                    "pagination": {"page": page, "page_size": page_size, "total_count": 0, "total_pages": 0, "has_next": False, "has_prev": False}
                }), 200

            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

            if total_count == 0:
                return jsonify({"message": "PM Production Management BOQs retrieved successfully", "count": 0, "data": []}), 200

        # OPTIMIZED: Direct mapping
        production_boqs = [
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
                "last_pm_name": row.last_pm_name,
                # Flag to indicate if PM is assigned
                "pm_assigned": bool(row.last_pm_user_id)
            }
            for row in rows
        ]

        response = {
            "message": "PM Production Management BOQs retrieved successfully",
            "count": len(production_boqs),
            "data": production_boqs
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
        log.error(f"Error retrieving PM Production Management BOQs: {str(e)}")
        return jsonify({'error': 'Failed to retrieve PM Production Management BOQs', 'details': str(e)}), 500
