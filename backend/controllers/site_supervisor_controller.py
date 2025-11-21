from flask import request, jsonify, g
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import func
from config.db import db
from models.project import Project
from models.boq import *
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError
from utils.boq_email_service import BOQEmailService
from models.user import User
from models.role import Role
from datetime import datetime
from utils.admin_viewing_context import get_effective_user_context, should_apply_role_filter
from utils.comprehensive_notification_service import notification_service
import copy

log = get_logger()

def create_sitesupervisor():
    try:
        data = request.get_json()

        # Validate role exists
        role = Role.query.filter_by(role='siteEngineer').first()
        if not role:
            return jsonify({"error": "siteEngineer role not found"}), 404

        # Create new Project Manager user
        new_sitesupervisor = User(
            email=data['email'],
            phone=data['phone'],
            role_id=role.role_id,
            full_name=data['full_name'],
            created_at=datetime.utcnow(),
            is_deleted=False,
            is_active=True,
            department='Site Management'
        )

        db.session.add(new_sitesupervisor)
        db.session.commit()
        new_user_id = new_sitesupervisor.user_id

        # Assign sitesupervisor to multiple projects (accept both 'project_id' and 'project_ids')
        project_ids = data.get('project_ids', data.get('project_id', []))
        assigned_count = 0
        if project_ids:
            for proj_id in project_ids:
                project = Project.query.filter_by(project_id=proj_id, is_deleted=False).first()
                if project:
                    # Assign this sitesupervisor to the project (one sitesupervisor per project, but sitesupervisor can have multiple projects)
                    project.site_supervisor_id = new_user_id
                    project.last_modified_at = datetime.utcnow()
                    db.session.add(project)
                    assigned_count += 1

            db.session.commit()

        return jsonify({
            "message": "Project Manager created successfully",
            "site_supervisor_id": new_user_id,
            "assigned_projects": project_ids
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating siteEngineer: {str(e)}")
        return jsonify({
            "error": f"Failed to create siteEngineer: {str(e)}"
        }), 500

def get_all_sitesupervisor_boqs():
    """
    Get all projects and assigned items for the Site Engineer.
    NEW FLOW: Uses pm_assign_ss as the single source of truth for item assignments.
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        log.info(f"=== SE BOQ API called by user_id={user_id}, role={user_role} ===")

        # Import PMAssignSS model for item-level assignments
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy.orm import joinedload

        # Get effective user context (handles admin viewing as other roles)
        context = get_effective_user_context()
        effective_role = context.get('effective_role', user_role)
        is_admin_viewing = context.get('is_admin_viewing', False)
        effective_user_id = context.get('effective_user_id')  # Specific user ID when viewing as a user

        # NEW FLOW: Query pm_assign_ss first to get all item assignments
        if effective_role == 'admin' and not is_admin_viewing:
            # Pure admin (not viewing as SE) - sees all assignments
            item_assignments = PMAssignSS.query.filter(
                PMAssignSS.is_deleted == False
            ).all()
            log.info(f"=== Admin viewing all assignments ===")
        elif is_admin_viewing and effective_role in ['siteengineer', 'sitesupervisor'] and effective_user_id:
            # Admin viewing as specific SE user - sees only that SE's assignments
            item_assignments = PMAssignSS.query.filter(
                PMAssignSS.assigned_to_se_id == effective_user_id,
                PMAssignSS.is_deleted == False
            ).all()
            log.info(f"=== Admin viewing as SE user {effective_user_id} - filtering by that SE ===")
        elif is_admin_viewing and effective_role in ['siteengineer', 'sitesupervisor']:
            # Admin viewing as SE role (no specific user) - sees all SE assignments
            item_assignments = PMAssignSS.query.filter(
                PMAssignSS.is_deleted == False
            ).all()
            log.info(f"=== Admin viewing as SE role (all SEs) ===")
        else:
            # Regular SE sees only their assignments
            item_assignments = PMAssignSS.query.filter(
                PMAssignSS.assigned_to_se_id == user_id,
                PMAssignSS.is_deleted == False
            ).all()

        log.info(f"=== Found {len(item_assignments)} item assignments for SE {effective_user_id if is_admin_viewing else user_id} ===")

        # Get unique project IDs from assignments
        project_ids_from_assignments = list(set([a.project_id for a in item_assignments if a.project_id]))

        # Also include projects where SE is assigned at project level
        if effective_role == 'admin' and not is_admin_viewing:
            # Pure admin - don't add project-level filter
            all_project_ids = project_ids_from_assignments
        elif is_admin_viewing and effective_role in ['siteengineer', 'sitesupervisor'] and effective_user_id:
            # Admin viewing as specific SE user - include that SE's project-level assignments
            projects_from_project_table = Project.query.filter(
                Project.site_supervisor_id == effective_user_id,
                Project.is_deleted == False
            ).all()
            project_ids_from_project_level = [p.project_id for p in projects_from_project_table]
            all_project_ids = list(set(project_ids_from_assignments + project_ids_from_project_level))
        elif is_admin_viewing and effective_role in ['siteengineer', 'sitesupervisor']:
            # Admin viewing as SE role (no specific user) - show all SE projects
            all_project_ids = project_ids_from_assignments
        else:
            # Regular SE - include their project-level assignments
            projects_from_project_table = Project.query.filter(
                Project.site_supervisor_id == user_id,
                Project.is_deleted == False
            ).all()
            project_ids_from_project_level = [p.project_id for p in projects_from_project_table]
            all_project_ids = list(set(project_ids_from_assignments + project_ids_from_project_level))

        log.info(f"=== Total unique project IDs: {len(all_project_ids)} - {all_project_ids} ===")

        # Fetch all projects in one query
        if not all_project_ids:
            return jsonify({
                "message": "No projects assigned to this Site Engineer",
                "projects": []
            }), 200

        # PERFORMANCE FIX: Use eager loading to prevent N+1 queries
        from sqlalchemy.orm import selectinload

        projects = Project.query.options(
            selectinload(Project.boqs).selectinload(BOQ.details),  # Fixed: use 'details' not 'boq_details'
            selectinload(Project.boqs).selectinload(BOQ.history)
        ).filter(
            Project.project_id.in_(all_project_ids),
            Project.is_deleted == False
        ).all()

        projects_list = []
        for project in projects:
            # Use pre-loaded relationship instead of querying
            boqs = [boq for boq in project.boqs if not boq.is_deleted and boq.email_sent] if hasattr(project, 'boqs') and project.boqs else []

            # Collect BOQ IDs for this project
            boq_ids = [boq.boq_id for boq in boqs]

            # Determine project status from BOQ history
            project_status = project.status or 'assigned'

            # Check if any BOQs exist and have history
            if boqs:
                for boq in boqs:
                    history = BOQHistory.query.filter_by(
                        boq_id=boq.boq_id
                    ).order_by(BOQHistory.action_date.desc()).first()

                    if history and history.receiver_role == 'site_engineer':
                        # Site engineer is the receiver - show as assigned/pending
                        project_status = 'assigned'
                        break

            # Calculate end_date from start_date and duration_days
            end_date = None
            if project.start_date and project.duration_days:
                from datetime import timedelta
                end_date = (project.start_date + timedelta(days=project.duration_days)).isoformat()

            # Check if BOQ has been assigned to a buyer
            boq_assigned_to_buyer = False
            assigned_buyer_name = None
            if boq_ids:
                from models.boq_material_assignment import BOQMaterialAssignment
                assignment = BOQMaterialAssignment.query.filter(
                    BOQMaterialAssignment.boq_id.in_(boq_ids),
                    BOQMaterialAssignment.is_deleted == False
                ).first()

                if assignment:
                    boq_assigned_to_buyer = True
                    assigned_buyer_name = assignment.assigned_to_buyer_name

            # Calculate item assignment counts and collect assigned items details
            items_assigned_to_me = 0
            total_items = 0
            items_by_pm = {}
            assigned_items_details = []
            boqs_with_items = []

            if boq_ids:
                # DEBUG: Check what's in pm_assign_ss for these BOQs
                log.info(f"=== DEBUG: SE user_id = {user_id}, type = {type(user_id)} ===")
                log.info(f"=== DEBUG: BOQ IDs to check = {boq_ids} ===")

                # Check ALL assignments for these BOQs (regardless of SE)
                all_assignments = PMAssignSS.query.filter(
                    PMAssignSS.boq_id.in_(boq_ids),
                    PMAssignSS.is_deleted == False
                ).all()
                log.info(f"=== DEBUG: Found {len(all_assignments)} total assignments in pm_assign_ss for these BOQs ===")
                for a in all_assignments:
                    log.info(f"  - Assignment ID: {a.pm_assign_id}, BOQ: {a.boq_id}, assigned_to_se_id: {a.assigned_to_se_id} (type: {type(a.assigned_to_se_id)}), item_indices: {a.item_indices}")

                for boq_id in boq_ids:
                    boq = next((b for b in boqs if b.boq_id == boq_id), None)
                    # Use pre-loaded relationship instead of querying (relationship name is 'details')
                    boq_details = boq.details[0] if boq and hasattr(boq, 'details') and boq.details and len(boq.details) > 0 else None
                    if boq_details and not boq_details.is_deleted and boq_details.boq_details:
                        items = boq_details.boq_details.get('items', [])
                        total_items += len(items)

                        # Get assignments from pm_assign_ss table for this BOQ and SE
                        assignments = PMAssignSS.query.filter_by(
                            boq_id=boq_id,
                            assigned_to_se_id=user_id,
                            is_deleted=False
                        ).all()

                        log.info(f"=== DEBUG: For BOQ {boq_id}, found {len(assignments)} assignments for SE {user_id} ===")

                        # Collect items assigned to this SE for this BOQ
                        boq_assigned_items = []

                        # Get all assigned item indices for this SE from pm_assign_ss
                        assigned_indices = set()
                        for assignment in assignments:
                            if assignment.item_indices:
                                assigned_indices.update(assignment.item_indices)

                        # Process assigned items
                        for idx in assigned_indices:
                            if idx < len(items):
                                item = items[idx]
                                items_assigned_to_me += 1

                                # Group by PM
                                pm_name = item.get('assigned_by_pm_name', 'Unknown')
                                if pm_name not in items_by_pm:
                                    items_by_pm[pm_name] = {
                                        "pm_name": pm_name,
                                        "pm_user_id": item.get('assigned_by_pm_user_id'),
                                        "items_count": 0
                                    }
                                items_by_pm[pm_name]["items_count"] += 1

                                # Add item details with full structure (excluding prices)
                                # Deep copy the item to avoid modifying the original
                                item_detail = copy.deepcopy(item)

                                # Remove price-related fields from main item
                                price_fields = ['rate', 'amount', 'unitRate', 'totalAmount', 'selling_price',
                                              'base_price', 'profit', 'overhead', 'gst', 'total_cost']
                                for field in price_fields:
                                    item_detail.pop(field, None)

                                # Remove price fields from sub_items if they exist
                                if 'sub_items' in item_detail and isinstance(item_detail['sub_items'], list):
                                    for sub_item in item_detail['sub_items']:
                                        if isinstance(sub_item, dict):
                                            for field in price_fields:
                                                sub_item.pop(field, None)

                                            # Remove price fields from materials in sub_items
                                            if 'materials' in sub_item and isinstance(sub_item['materials'], list):
                                                for material in sub_item['materials']:
                                                    if isinstance(material, dict):
                                                        for field in price_fields + ['unit_price', 'total_price']:
                                                            material.pop(field, None)

                                            # Remove price fields from labour in sub_items
                                            if 'labour' in sub_item and isinstance(sub_item['labour'], list):
                                                for labour in sub_item['labour']:
                                                    if isinstance(labour, dict):
                                                        for field in price_fields + ['wage_per_day', 'total_wage']:
                                                            labour.pop(field, None)

                                # Add assignment metadata
                                item_detail["item_index"] = idx
                                item_detail["assigned_by_pm_name"] = pm_name
                                item_detail["assigned_by_pm_user_id"] = item.get('assigned_by_pm_user_id')
                                item_detail["assignment_date"] = item.get('assignment_date')
                                item_detail["assignment_status"] = item.get('assignment_status', 'assigned')

                                assigned_items_details.append(item_detail)
                                boq_assigned_items.append(item_detail)

                        # Add BOQ with its assigned items if any items are assigned
                        if boq_assigned_items:
                            boqs_with_items.append({
                                "boq_id": boq_id,
                                "boq_name": boq.boq_name if boq else f"BOQ-{boq_id}",
                                "items_count": len(boq_assigned_items),
                                "assigned_items": boq_assigned_items
                            })

            # Convert items_by_pm dict to list
            items_by_pm_list = list(items_by_pm.values())

            # Build areas structure for ExtraMaterialForm compatibility
            # Using floor_name as area (same structure as /api/projects/assigned-to-me)
            area_info = {
                "area_id": 1,  # Placeholder
                "area_name": project.floor_name or "Main Area",
                "boqs": []
            }

            # Add all BOQs to the area's boqs array
            for boq_id in boq_ids:
                boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
                if boq:
                    area_info["boqs"].append({
                        "boq_id": boq.boq_id,
                        "boq_name": boq.boq_name or f"BOQ-{boq.boq_id}",
                        "items": []  # Items will be populated by ExtraMaterialForm if needed
                    })

            # Check if all SE's work has been PM-confirmed
            from models.pm_assign_ss import PMAssignSS
            se_assignments = PMAssignSS.query.filter_by(
                project_id=project.project_id,
                assigned_to_se_id=user_id,
                is_deleted=False,
                se_completion_requested=True  # Only check assignments where SE requested completion
            ).all()

            # SE's work is confirmed if ALL their requested assignments are PM-confirmed
            all_my_work_confirmed = all(a.pm_confirmed_completion for a in se_assignments) if se_assignments else False

            # Check if THIS SE has requested completion (SE-specific, not project-level)
            # If ANY of this SE's assignments has se_completion_requested=True, then this SE requested completion
            my_completion_requested = any(a.se_completion_requested for a in PMAssignSS.query.filter_by(
                project_id=project.project_id,
                assigned_to_se_id=user_id,
                is_deleted=False
            ).all())

            projects_list.append({
                "project_id": project.project_id,
                "project_name": project.project_name,
                "project_code": project.project_code if hasattr(project, 'project_code') else None,
                "client": project.client,
                "location": project.location,
                "start_date": project.start_date.isoformat() if project.start_date else None,
                "end_date": end_date,
                "duration_days": project.duration_days,
                "status": project_status,
                "description": project.description,
                "created_at": project.created_at.isoformat() if project.created_at else None,
                "priority": getattr(project, 'priority', 'medium'),
                "boq_ids": boq_ids,  # List of BOQ IDs for reference
                "completion_requested": project.completion_requested if project.completion_requested is not None else False,
                "my_completion_requested": my_completion_requested,  # SE-specific: did THIS SE request completion?
                "my_work_confirmed": all_my_work_confirmed,  # SE-specific confirmation status
                "boq_assigned_to_buyer": boq_assigned_to_buyer,
                "assigned_buyer_name": assigned_buyer_name,
                # Item assignment counts
                "items_assigned_to_me": items_assigned_to_me,
                "total_items": total_items,
                "items_by_pm": items_by_pm_list,
                # Detailed item information
                "assigned_items_details": assigned_items_details,  # All assigned items with full details
                "boqs_with_items": boqs_with_items,  # BOQs grouped with their assigned items
                # Areas structure for ExtraMaterialForm compatibility
                "areas": [area_info]
            })

        return jsonify({
            "success": True,
            "projects": projects_list,
            "total": len(projects_list)
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error fetching site engineer projects: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to fetch projects: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def get_sitesupervisor_dashboard():
    """Get dashboard statistics for Site Engineer"""
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get effective user context (handles admin viewing as other roles)
        context = get_effective_user_context()

        # Get all projects assigned to this site engineer (admin sees all projects with site supervisor assigned)
        if user_role == 'admin' or not should_apply_role_filter(context):
            projects = Project.query.filter(
                Project.site_supervisor_id.isnot(None),  # Only projects with site supervisor assigned
                Project.is_deleted == False
            ).all()
        else:
            projects = Project.query.filter(
                Project.site_supervisor_id == user_id,
                Project.is_deleted == False
            ).all()

        # Count projects by status
        total_projects = len(projects)
        assigned_projects = 0
        ongoing_projects = 0
        completed_projects = 0

        for project in projects:
            status = (project.status or '').lower()
            if status in ['assigned', 'pending']:
                assigned_projects += 1
            elif status in ['in_progress', 'active']:
                ongoing_projects += 1
            elif status == 'completed':
                completed_projects += 1
            else:
                assigned_projects += 1  # Default to assigned

        return jsonify({
            "success": True,
            "stats": {
                "total_projects": total_projects,
                "assigned_projects": assigned_projects,
                "ongoing_projects": ongoing_projects,
                "completed_projects": completed_projects
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching dashboard stats: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to fetch dashboard stats: {str(e)}"
        }), 500

def get_all_sitesupervisor():
    try:
        role = Role.query.filter_by(role='siteEngineer').first()
        if not role:
            return jsonify({"error": "Role 'siteEngineer' not found"}), 404

        get_sitesupervisors = User.query.filter_by(role_id=role.role_id,is_deleted=False).all()
        assigned_list = []
        unassigned_list = []

        # ✅ PERFORMANCE FIX: Load ALL projects for ALL supervisors in ONE query (N+1 → 1)
        # Get all supervisor IDs
        supervisor_ids = [s.user_id for s in get_sitesupervisors]

        # Query all projects for all supervisors at once
        all_projects_query = Project.query.filter(
            Project.site_supervisor_id.in_(supervisor_ids),
            Project.is_deleted == False
        ).all()

        # Group projects by supervisor_id in memory
        projects_by_supervisor = {}
        for project in all_projects_query:
            if project.site_supervisor_id not in projects_by_supervisor:
                projects_by_supervisor[project.site_supervisor_id] = []
            projects_by_supervisor[project.site_supervisor_id].append(project)

        for sitesupervisor in get_sitesupervisors:
            # Use pre-loaded projects (no query - data already in memory!)
            all_projects = projects_by_supervisor.get(sitesupervisor.user_id, [])

            # Separate ongoing and completed projects
            ongoing_projects = []
            completed_projects = []

            for project in all_projects:
                project_status = (project.status or '').lower()
                project_data = {
                    "project_id": project.project_id,
                    "project_name": project.project_name if hasattr(project, "project_name") else None,
                    "status": project.status,
                    "project_code": project.project_code if project else None,
                }

                if project_status == 'completed':
                    completed_projects.append(project_data)
                else:
                    ongoing_projects.append(project_data)

            # Combine all projects for display (ongoing first, then completed)
            all_project_list = ongoing_projects + completed_projects

            # Count only ongoing projects for assignment limit
            ongoing_count = len(ongoing_projects)

            if all_projects and len(all_projects) > 0:
                # Add single entry for this sitesupervisor with all their projects
                assigned_list.append({
                    "user_id": sitesupervisor.user_id,
                    "sitesupervisor_name": sitesupervisor.full_name,
                    "email": sitesupervisor.email,
                    "phone": sitesupervisor.phone,
                    "user_status": getattr(sitesupervisor, 'user_status', 'offline'),
                    "projects": all_project_list,
                    "project_count": ongoing_count,  # Only count ongoing projects
                    "total_projects": len(all_projects),
                    "completed_projects_count": len(completed_projects)
                })
            else:
                # sitesupervisor without project assignment
                unassigned_list.append({
                    "user_id": sitesupervisor.user_id,
                    "sitesupervisor_name": sitesupervisor.full_name,
                    "email": sitesupervisor.email,
                    "phone": sitesupervisor.phone,
                    "user_status": getattr(sitesupervisor, 'user_status', 'offline'),
                    "projects": [],
                    "project_count": 0,
                    "total_projects": 0,
                    "completed_projects_count": 0
                })

        return jsonify({
            "success": True,
            "assigned_count": len(assigned_list),
            "unassigned_count": len(unassigned_list),
            "assigned_project_managers": assigned_list,
            "unassigned_project_managers": unassigned_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching sitesupervisors: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch sitesupervisors: {str(e)}"
        }), 500

def get_sitesupervisor_id(site_supervisor_id):
    try:
        user_list = []
        projects = Project.query.filter_by(site_supervisor_id=site_supervisor_id).all()

        # If no projects found for this user
        if not projects:
            return jsonify({
                "success": True,
                "count": 0,
                "user_list": []
            }), 200

        # Fetch user only once (no need to query inside loop)
        user = User.query.filter_by(user_id=site_supervisor_id).first()

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
        log.error(f"Error fetching sitesupervisors: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch sitesupervisors: {str(e)}"
        }), 500

def update_sitesupervisor(site_supervisor_id):
    try:
        # Fetch the site supervisor
        user = User.query.filter_by(user_id=site_supervisor_id).first()
        if not user:
            return jsonify({"error": "Site Supervisor not found"}), 404

        data = request.get_json()

        # Update site supervisor details
        if "full_name" in data:
            user.full_name = data["full_name"]
        if "email" in data:
            user.email = data["email"]
        if "phone" in data:
            user.phone = data["phone"]

        # Reassign projects if provided
        if "assigned_projects" in data:
            # Remove current supervisor assignments from all projects
            Project.query.filter_by(site_supervisor_id=site_supervisor_id).update({"site_supervisor_id": None})
            db.session.commit()  # commit after unassigning to ensure DB update

            # Assign new projects
            for project_id in data["assigned_projects"]:
                project = Project.query.filter_by(project_id=project_id, is_deleted=False).first()
                if project:
                    project.site_supervisor_id = site_supervisor_id

        db.session.commit()

        # Build response with updated project assignments
        updated_projects = Project.query.filter_by(site_supervisor_id=site_supervisor_id).all()
        projects_list = [
            {"project_id": p.project_id, "project_name": getattr(p, "project_name", None)}
            for p in updated_projects
        ]

        return jsonify({
            "success": True,
            "message": "Site Supervisor updated successfully",
            "sitesupervisor": {
                "site_supervisor_id": user.user_id,
                "full_name": user.full_name,
                "email": user.email,
                "phone": user.phone,
                "assigned_projects": projects_list
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating site supervisor: {str(e)}")
        return jsonify({
            "error": f"Failed to update site supervisor: {str(e)}"
        }), 500


def delete_sitesupervisor(site_supervisor_id):
    try:
        user = User.query.filter_by(user_id=site_supervisor_id).first()
        if not user:
            return jsonify({"error": "siteEngineer not found"}), 404

        # Check assigned projects
        assigned_projects = Project.query.filter_by(site_supervisor_id=site_supervisor_id).all()
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
                "message": "Cannot delete siteEngineer. They are assigned to one or more projects.",
                "assigned_projects": projects_list
            }), 400

        # Perform soft delete
        user.is_deleted = True
        user.is_active = False
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "siteEngineer deleted successfully",
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting sitesupervisor: {str(e)}")
        return jsonify({
            "error": f"Failed to delete siteEngineer: {str(e)}"
        }), 500

def assign_projects_sitesupervisor():
    try:
        data = request.get_json(silent=True)

        site_supervisor_id = data.get("site_supervisor_id")
        buyer_id = data.get("buyer_id")  # Optional: Buyer assignment
        project_ids = data.get("project_ids")  # list of project IDs

        if not site_supervisor_id or not project_ids:
            return jsonify({"error": "site_supervisor_id and project_ids are required"}), 400

        # Validate Site Engineer
        user = User.query.filter_by(user_id=site_supervisor_id).first()
        if not user:
            return jsonify({"error": "siteEngineer not found"}), 404

        # Validate Buyer if provided
        buyer_user = None
        if buyer_id:
            buyer_user = User.query.filter_by(user_id=buyer_id).first()
            if not buyer_user:
                return jsonify({"error": "Buyer not found"}), 404

        # Get current user (Project Manager)
        current_user = getattr(g, 'user', None)
        pm_name = current_user.get('full_name', 'Project Manager') if current_user else 'Project Manager'
        pm_id = current_user.get('user_id') if current_user else None

        assigned_projects = []
        projects_data_for_email = []
        projects_data_for_buyer_email = []
        boq_histories_updated = 0

        # ✅ PERFORMANCE FIX: Query all projects at once with eager-loaded BOQs (N+1 → 2 queries)
        # Before: 10 projects × (1 project query + 1 BOQ query + M history queries) = 70+ queries
        # After: 2 queries (1 for projects with BOQs, 1 for all histories)
        projects = Project.query.options(
            selectinload(Project.boqs)
        ).filter(
            Project.project_id.in_(project_ids)
        ).all()

        # Create lookup map for fast access
        projects_map = {p.project_id: p for p in projects}

        # Pre-load ALL BOQHistory records for all BOQs at once
        all_boq_ids = []
        for project in projects:
            for boq in project.boqs:
                if not boq.is_deleted:
                    all_boq_ids.append(boq.boq_id)

        # Query all histories at once
        if all_boq_ids:
            from sqlalchemy import distinct
            # Get the latest history for each BOQ
            boq_histories = BOQHistory.query.filter(
                BOQHistory.boq_id.in_(all_boq_ids)
            ).order_by(BOQHistory.boq_id, BOQHistory.action_date.desc()).all()

            # Group by boq_id, keep only the latest
            history_map = {}
            for history in boq_histories:
                if history.boq_id not in history_map:
                    history_map[history.boq_id] = history
        else:
            history_map = {}

        for pid in project_ids:
            project = projects_map.get(pid)  # No query - use pre-loaded data!
            if project:
                project.site_supervisor_id = site_supervisor_id
                # Assign buyer if provided
                if buyer_id:
                    project.buyer_id = buyer_id
                project.last_modified_at = datetime.utcnow()
                project.last_modified_by = pm_name

                assigned_projects.append({
                    "project_id": project.project_id,
                    "project_name": getattr(project, "project_name", None)
                })

                # Collect project data for SE email
                projects_data_for_email.append({
                    "project_name": getattr(project, "project_name", "N/A"),
                    "client": getattr(project, "client", "N/A"),
                    "location": getattr(project, "location", "N/A"),
                    "status": getattr(project, "status", "Active")
                })

                # Collect project data for buyer email (if buyer assigned)
                if buyer_id:
                    projects_data_for_buyer_email.append({
                        "project_name": getattr(project, "project_name", "N/A"),
                        "client": getattr(project, "client", "N/A"),
                        "location": getattr(project, "location", "N/A"),
                        "status": getattr(project, "status", "Active")
                    })

                # Use pre-loaded BOQs (no query!)
                boqs = [boq for boq in project.boqs if not boq.is_deleted]

                for boq in boqs:
                    # Get existing BOQ history from pre-loaded map (no query!)
                    existing_history = history_map.get(boq.boq_id)

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

                    # Prepare new action for Site Engineer assignment
                    comments = f"Site Engineer {user.full_name} assigned to project"
                    if buyer_user:
                        comments = f"Site Engineer {user.full_name} and Buyer {buyer_user.full_name} assigned to project"

                    new_action = {
                        "role": "project_manager",
                        "type": "assigned_site_engineer",
                        "sender": "project_manager",
                        "receiver": "site_engineer",
                        "status": "SE_Assigned",
                        "boq_name": boq.boq_name,
                        "comments": comments,
                        "timestamp": datetime.utcnow().isoformat(),
                        "sender_name": pm_name,
                        "sender_user_id": pm_id,
                        "project_name": project.project_name,
                        "project_id": project.project_id,
                        "assigned_se_name": user.full_name,
                        "assigned_se_user_id": user.user_id,
                        "assigned_se_email": user.email,
                        "assigned_buyer_name": buyer_user.full_name if buyer_user else None,
                        "assigned_buyer_user_id": buyer_user.user_id if buyer_user else None,
                        "assigned_buyer_email": buyer_user.email if buyer_user else None
                    }

                    # Append new action
                    current_actions.append(new_action)
                    log.info(f"Appending SE assignment action to BOQ {boq.boq_id} history. Total actions: {len(current_actions)}")

                    if existing_history:
                        # Update existing history
                        existing_history.action = current_actions
                        # Mark JSONB field as modified for SQLAlchemy
                        from sqlalchemy.orm.attributes import flag_modified
                        flag_modified(existing_history, "action")

                        existing_history.action_by = pm_name
                        existing_history.sender = pm_name
                        existing_history.receiver = user.full_name
                        existing_history.comments = comments
                        existing_history.sender_role = 'project_manager'
                        existing_history.receiver_role = 'site_engineer'
                        existing_history.action_date = datetime.utcnow()
                        existing_history.last_modified_by = pm_name
                        existing_history.last_modified_at = datetime.utcnow()

                        log.info(f"Updated existing history for BOQ {boq.boq_id} with {len(current_actions)} actions")
                    else:
                        # Create new history entry
                        boq_history = BOQHistory(
                            boq_id=boq.boq_id,
                            action=current_actions,
                            action_by=pm_name,
                            boq_status="approved",
                            # boq.status,
                            sender=pm_name,
                            receiver=user.full_name,
                            comments=comments,
                            sender_role='project_manager',
                            receiver_role='site_engineer',
                            action_date=datetime.utcnow(),
                            created_by=pm_name
                        )
                        db.session.add(boq_history)
                        log.info(f"Created new history for BOQ {boq.boq_id} with {len(current_actions)} actions")

                    boq_histories_updated += 1

        db.session.commit()
        log.info(f"Successfully assigned Site Engineer to {len(assigned_projects)} projects and updated {boq_histories_updated} BOQ histories")

        # Send email notification to Site Engineer
        # se_email_sent = False
        # if user.email and projects_data_for_email:
        #     try:
        #         email_service = BOQEmailService()
        #         se_email_sent = email_service.send_se_assignment_notification(
        #             se_email=user.email,
        #             se_name=user.full_name,
        #             pm_name=pm_name,
        #             projects_data=projects_data_for_email
        #         )

        #         if se_email_sent:
        #             log.info(f"Assignment notification email sent successfully to {user.email}")
        #         else:
        #             log.warning(f"Failed to send assignment notification email to {user.email}")
        #     except Exception as email_error:
        #         log.error(f"Error sending assignment notification email: {email_error}")
        #         # Don't fail the entire request if email fails
        #         import traceback
        #         log.error(f"Email error traceback: {traceback.format_exc()}")

        # Send email notification to Buyer (if assigned)
        buyer_email_sent = False
        if buyer_user and buyer_user.email and projects_data_for_buyer_email:
            try:
                email_service = BOQEmailService()
                buyer_email_sent = email_service.send_buyer_assignment_notification(
                    buyer_email=buyer_user.email,
                    buyer_name=buyer_user.full_name,
                    pm_name=pm_name,
                    projects_data=projects_data_for_buyer_email
                )

                if buyer_email_sent:
                    log.info(f"Buyer assignment notification email sent successfully to {buyer_user.email}")
                else:
                    log.warning(f"Failed to send buyer assignment notification email to {buyer_user.email}")
            except Exception as email_error:
                log.error(f"Error sending buyer assignment notification email: {email_error}")
                # Don't fail the entire request if email fails
                import traceback
                log.error(f"Email error traceback: {traceback.format_exc()}")

        response_data = {
            "success": True,
            "message": "Projects assigned successfully",
            "assigned_sitesupervisor": {
                "site_supervisor_id": user.user_id,
                "user_name": user.full_name,
                "email": user.email,
                "phone": user.phone
            },
            "assigned_projects": assigned_projects,
            "assigned_count": len(assigned_projects),
            "boq_histories_updated": boq_histories_updated,
            # "se_email_sent": se_email_sent
        }

        # Add buyer info to response if buyer was assigned
        if buyer_user:
            response_data["assigned_buyer"] = {
                "buyer_id": buyer_user.user_id,
                "buyer_name": buyer_user.full_name,
                "email": buyer_user.email,
                "phone": buyer_user.phone
            }
            response_data["buyer_email_sent"] = buyer_email_sent

        return jsonify(response_data), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        log.error(f"Error assigning projects: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to assign projects: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def request_project_completion(project_id):
    """Site Engineer requests project completion - sends notification to PM"""
    try:
        current_user = g.user
        user_id = current_user['user_id']
        se_name = current_user.get('full_name', 'Site Engineer')

        # Get the project - check both traditional and item-level assignments
        project = Project.query.filter_by(
            project_id=project_id,
            site_supervisor_id=user_id,
            is_deleted=False
        ).first()

        # If not found via traditional assignment, check for item-level assignment
        if not project:
            from models.pm_assign_ss import PMAssignSS

            # Check if user has any items assigned in this project
            item_assignment = PMAssignSS.query.filter_by(
                project_id=project_id,
                assigned_to_se_id=user_id,
                is_deleted=False
            ).first()

            if item_assignment:
                # Get the project without site_supervisor_id check
                project = Project.query.filter_by(
                    project_id=project_id,
                    is_deleted=False
                ).first()

        if not project:
            return jsonify({
                "error": "Project not found or not assigned to you"
            }), 404

        # Check if already completed
        if project.status and project.status.lower() == 'completed':
            return jsonify({
                "error": "Project is already completed"
            }), 400

        # Get BOQ and BOQ history
        boq = BOQ.query.filter_by(project_id=project_id, is_deleted=False).first()
        boq = BOQ.query.filter_by(project_id=project_id, is_deleted=False).first()
        boq_history = BOQHistory.query.filter_by(boq_id=boq.boq_id).first()

        if not boq:
            return jsonify({
                "error": "BOQ not found for this project"
            }), 404

        boq_history = BOQHistory.query.filter_by(boq_id=boq.boq_id).order_by(BOQHistory.action_date.desc()).first()

        # Get Project Manager details (user_id is now JSONB array)
        pm_ids = project.user_id if isinstance(project.user_id, list) else ([project.user_id] if project.user_id else [])
        pm_user = User.query.filter_by(user_id=pm_ids[0]).first() if pm_ids else None
        pm_name = pm_user.full_name if pm_user else "Project Manager"
        pm_email = pm_user.email if pm_user else None

        # Handle existing actions - ensure it's always a list
        if boq_history:
            if boq_history.action is None:
                current_actions = []
            elif isinstance(boq_history.action, list):
                current_actions = boq_history.action
            elif isinstance(boq_history.action, dict):
                current_actions = [boq_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        # Create new action for completion request
        new_action = {
            "role": "site_engineer",
            "type": "completion_requested",
            "sender": "site_engineer",
            "receiver": "project_manager",
            "status": "pending_approval",
            "boq_name": boq.boq_name,
            "project_name": project.project_name,
            "comments": f"Site Engineer {se_name} requested project completion",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": se_name,
            "sender_user_id": user_id,
            "recipient_name": pm_name,
            "recipient_email": pm_email,
            "project_id": project_id
        }

        # Append new action
        current_actions.append(new_action)

        if boq_history:
            # Update existing history
            boq_history.action = current_actions
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_history, "action")
            boq_history.action_by = se_name
            boq_history.sender = se_name
            boq_history.receiver = pm_name
            boq_history.comments = f"Completion request sent to {pm_name}"
            boq_history.sender_role = 'site_engineer'
            boq_history.receiver_role = 'project_manager'
            boq_history.action_date = datetime.utcnow()
            boq_history.last_modified_by = se_name
            boq_history.last_modified_at = datetime.utcnow()
        else:
            # Create new history entry
            boq_history = BOQHistory(
                boq_id=boq.boq_id,
                action=current_actions,
                action_by=se_name,
                boq_status=boq.status,
                sender=se_name,
                receiver=pm_name,
                comments=f"Completion request sent to {pm_name}",
                sender_role='site_engineer',
                receiver_role='project_manager',
                action_date=datetime.utcnow(),
                created_by=se_name
            )
            db.session.add(boq_history)

        # Update SE completion request in pm_assign_ss table
        from models.pm_assign_ss import PMAssignSS

        # Find all assignments for this SE in this project
        se_assignments = PMAssignSS.query.filter_by(
            project_id=project_id,
            assigned_to_se_id=user_id,
            is_deleted=False
        ).all()

        # Mark all SE assignments as completion requested
        for assignment in se_assignments:
            assignment.se_completion_requested = True
            assignment.se_completion_request_date = datetime.utcnow()
            assignment.last_modified_by = se_name
            assignment.last_modified_at = datetime.utcnow()

        # Always recalculate project total_se_assignments to ensure accuracy
        # Count unique PM-SE pairs for this project
        from sqlalchemy import func
        unique_pairs_query = db.session.query(
            func.count(func.distinct(func.concat(
                PMAssignSS.assigned_by_pm_id, '-', PMAssignSS.assigned_to_se_id
            )))
        ).filter(
            PMAssignSS.project_id == project_id,
            PMAssignSS.is_deleted == False,
            PMAssignSS.assigned_by_pm_id.isnot(None),
            PMAssignSS.assigned_to_se_id.isnot(None)
        ).scalar()

        project.total_se_assignments = unique_pairs_query or 0

        # Log for debugging
        log.info(f"Project {project_id}: total_se_assignments = {project.total_se_assignments}, SE assignments found: {len(se_assignments)}")

        # Set completion_requested flag
        project.completion_requested = True
        project.last_modified_at = datetime.utcnow()
        project.last_modified_by = se_name
        # DO NOT set status to completed here - wait for PM approval
        # The project should remain in 'items_assigned' status until PM approves
        # boq.status = "completed"  # REMOVED - premature completion
        # boq_history.boq_status = "completed"  # REMOVED - premature completion

        db.session.commit()

        # Send notification to PM about completion request
        try:
            if pm_ids and len(pm_ids) > 0:
                notification_service.notify_se_completion_request(
                    boq_id=boq.boq_id,
                    project_name=project.project_name,
                    se_id=user_id,
                    se_name=se_name,
                    pm_user_id=pm_ids[0]
                )
        except Exception as notif_error:
            log.error(f"Failed to send completion request notification: {notif_error}")

        log.info(f"Site Engineer {user_id} requested completion for project {project_id}")

        return jsonify({
            "success": True,
            "message": "Completion request sent to Project Manager",
            "project_id": project_id,
            "completion_requested": True,
            "confirmation_status": f"{project.confirmed_completions}/{project.total_se_assignments} confirmations"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error requesting project completion: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to request completion: {str(e)}"
        }), 500


def get_available_buyers():
    """Get list of all active buyers for site engineer to select from"""
    try:
        # Get buyer role
        buyer_role = Role.query.filter_by(role='buyer').first()
        if not buyer_role:
            return jsonify({"error": "Buyer role not found"}), 404

        # Get all active buyers
        buyers = User.query.filter(
            User.role_id == buyer_role.role_id,
            User.is_deleted == False,
            User.is_active == True
        ).all()

        buyers_list = [{
            'user_id': buyer.user_id,
            'full_name': buyer.full_name,
            'email': buyer.email,
            'phone': buyer.phone
        } for buyer in buyers]

        return jsonify({
            "success": True,
            "buyers": buyers_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyers: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch buyers: {str(e)}"
        }), 500

def get_my_assigned_items():
    """SE gets all BOQ items assigned to them across all projects"""
    try:
        from models.pm_assign_ss import PMAssignSS

        # Get current user
        user_id = g.user_id
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        role_name = user.role.role if user.role else 'unknown'

        if role_name != 'siteEngineer' and role_name != 'admin':
            return jsonify({"error": "Only Site Engineers can access this endpoint"}), 403

        # Get all assignments from pm_assign_ss table for this SE
        assignments = PMAssignSS.query.filter_by(
            assigned_to_se_id=user_id,
            is_deleted=False
        ).all()

        my_items = []
        grouped_by_pm = {}
        grouped_by_project = {}
        total_items_count = 0

        for assignment in assignments:
            # Get BOQ
            boq = BOQ.query.filter_by(boq_id=assignment.boq_id, is_deleted=False).first()
            if not boq:
                continue

            # Get project
            project = Project.query.filter_by(project_id=assignment.project_id, is_deleted=False).first()
            if not project:
                continue

            # Get PM details
            pm_user = User.query.get(assignment.assigned_by_pm_id)
            pm_name = pm_user.full_name if pm_user else 'Unknown'

            # Get BOQ details to fetch full item information
            boq_details = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()
            items = boq_details.boq_details.get('items', []) if boq_details and boq_details.boq_details else []

            # Process each assigned item index
            for item_index in (assignment.item_indices or []):
                if item_index >= len(items):
                    continue

                item = items[item_index]
                total_items_count += 1

                item_data = {
                    "boq_id": boq.boq_id,
                    "boq_name": boq.boq_name,
                    "project_id": project.project_id,
                    "project_name": project.project_name,
                    "project_code": project.project_code if hasattr(project, 'project_code') else None,
                    "item_index": item_index,
                    "item_code": item.get('item_code') or item.get('item_number') or item.get('item_name') or item.get('sr_no') or f"Item-{item_index+1}",
                    "description": item.get('description') or item.get('item_name') or item.get('name') or 'N/A',
                    "quantity": item.get('quantity') or item.get('qty'),
                    "unit": item.get('unit') or item.get('uom') or '',
                    "rate": item.get('rate') or item.get('unitRate'),
                    "amount": item.get('amount') or item.get('totalAmount'),
                    "assigned_by_pm_user_id": assignment.assigned_by_pm_id,
                    "assigned_by_pm_name": pm_name,
                    "assignment_date": assignment.assignment_date.isoformat() if assignment.assignment_date else None,
                    "assignment_status": assignment.assignment_status or 'assigned',
                    "notes": assignment.notes
                }

                my_items.append(item_data)

                # Group by PM
                if pm_name not in grouped_by_pm:
                    grouped_by_pm[pm_name] = {
                        "pm_user_id": assignment.assigned_by_pm_id,
                        "pm_name": pm_name,
                        "items_count": 0,
                        "projects": {}
                    }

                pm_group = grouped_by_pm[pm_name]
                pm_group["items_count"] += 1

                # Group by project within PM
                if project.project_name not in pm_group["projects"]:
                    pm_group["projects"][project.project_name] = {
                        "project_id": project.project_id,
                        "project_name": project.project_name,
                        "project_code": project.project_code if hasattr(project, 'project_code') else None,
                        "items_count": 0,
                        "boqs": {}
                    }

                pm_group["projects"][project.project_name]["items_count"] += 1

                # Group by BOQ within project
                if boq.boq_name not in pm_group["projects"][project.project_name]["boqs"]:
                    pm_group["projects"][project.project_name]["boqs"][boq.boq_name] = {
                        "boq_id": boq.boq_id,
                        "boq_name": boq.boq_name,
                        "items_count": 0
                    }

                pm_group["projects"][project.project_name]["boqs"][boq.boq_name]["items_count"] += 1

                # Group by project (for top-level summary)
                if project.project_id not in grouped_by_project:
                    grouped_by_project[project.project_id] = {
                        "project_id": project.project_id,
                        "project_name": project.project_name,
                        "project_code": project.project_code if hasattr(project, 'project_code') else None,
                        "items_count": 0,
                        "boqs": {}
                    }

                grouped_by_project[project.project_id]["items_count"] += 1

                if boq.boq_id not in grouped_by_project[project.project_id]["boqs"]:
                    grouped_by_project[project.project_id]["boqs"][boq.boq_id] = {
                        "boq_id": boq.boq_id,
                        "boq_name": boq.boq_name,
                        "items_count": 0
                    }

                grouped_by_project[project.project_id]["boqs"][boq.boq_id]["items_count"] += 1

        # Convert grouped_by_pm dict to list
        pm_list = []
        for pm_name, pm_data in grouped_by_pm.items():
            # Convert projects dict to list and convert BOQs dict to list within each project
            for proj_name, proj_data in pm_data["projects"].items():
                proj_data["boqs"] = list(proj_data["boqs"].values())
            pm_data["projects"] = list(pm_data["projects"].values())
            pm_list.append(pm_data)

        # Convert grouped_by_project dict to list
        project_list = []
        for proj_id, proj_data in grouped_by_project.items():
            proj_data["boqs"] = list(proj_data["boqs"].values())
            project_list.append(proj_data)

        # Sort by PM name
        pm_list.sort(key=lambda x: x['pm_name'])
        project_list.sort(key=lambda x: x['project_name'])

        return jsonify({
            "success": True,
            "my_items": my_items,
            "grouped_by_pm": pm_list,
            "grouped_by_project": project_list,
            "total_items_assigned": total_items_count,
            "unique_pms_count": len(pm_list),
            "unique_projects_count": len(grouped_by_project),
            "total_assignments": len(assignments)
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error getting assigned items: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to get assigned items: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def assign_boq_to_buyer(boq_id):
    """Site Engineer assigns BOQ materials to a buyer"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment

        current_user = g.user
        se_user_id = current_user['user_id']
        se_name = current_user.get('full_name', 'Site Engineer')

        data = request.get_json()
        buyer_id = data.get('buyer_id')

        if not buyer_id:
            return jsonify({"error": "buyer_id is required"}), 400

        # Verify BOQ exists
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Verify BOQ is assigned to this SE
        project = Project.query.filter_by(
            project_id=boq.project_id,
            is_deleted=False
        ).first()

        if not project:
            return jsonify({"error": "Project not found"}), 404

        if project.site_supervisor_id != se_user_id:
            return jsonify({"error": "You are not assigned to this BOQ"}), 403

        # Verify BOQ has materials before allowing assignment
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details or not boq_details.boq_details:
            return jsonify({"error": "Cannot assign empty BOQ. Please add items and materials to the BOQ first."}), 400

        # Count materials in BOQ
        items = boq_details.boq_details.get('items', [])
        total_materials = 0
        for item in items:
            # Support both old and new BOQ structures
            sub_items = item.get('sub_items', [])
            if (item.get('has_sub_items') and sub_items) or (sub_items and len(sub_items) > 0):
                for sub_item in sub_items:
                    materials = sub_item.get('materials', [])
                    total_materials += len(materials)

        if total_materials == 0:
            return jsonify({
                "error": "Cannot assign BOQ with no materials. Please add materials to the BOQ before assigning to buyer.",
                "boq_name": boq.boq_name,
                "materials_count": 0
            }), 400

        # Verify buyer exists
        buyer_role = Role.query.filter_by(role='buyer').first()
        buyer = User.query.filter(
            User.user_id == buyer_id,
            User.role_id == buyer_role.role_id,
            User.is_deleted == False,
            User.is_active == True
        ).first()

        if not buyer:
            return jsonify({"error": "Buyer not found"}), 404

        # Check if already assigned
        existing_assignment = BOQMaterialAssignment.query.filter_by(
            boq_id=boq_id,
            assigned_to_buyer_user_id=buyer_id,
            is_deleted=False
        ).first()

        if existing_assignment:
            return jsonify({"error": "BOQ already assigned to this buyer"}), 400

        # Create assignment
        assignment = BOQMaterialAssignment(
            boq_id=boq_id,
            project_id=project.project_id,
            assigned_by_user_id=se_user_id,
            assigned_by_name=se_name,
            assigned_to_buyer_user_id=buyer_id,
            assigned_to_buyer_name=buyer.full_name,
            assigned_to_buyer_date=datetime.utcnow(),
            status='assigned_to_buyer'
        )

        db.session.add(assignment)

        # Create BOQ history entry
        boq_history = BOQHistory.query.filter_by(boq_id=boq_id).first()

        # Handle existing actions
        if boq_history:
            if boq_history.action is None:
                current_actions = []
            elif isinstance(boq_history.action, list):
                current_actions = boq_history.action
            elif isinstance(boq_history.action, dict):
                current_actions = [boq_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        # Create new action
        new_action = {
            "role": "site_engineer",
            "type": "boq_assigned_to_buyer",
            "sender": "site_engineer",
            "receiver": "buyer",
            "status": "assigned_to_buyer",
            "boq_name": boq.boq_name,
            "project_name": project.project_name,
            "comments": f"Site Engineer assigned BOQ materials to {buyer.full_name}",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": se_name,
            "sender_user_id": se_user_id,
            "recipient_name": buyer.full_name,
            "recipient_email": buyer.email,
            "assignment_id": assignment.assignment_id
        }

        current_actions.append(new_action)

        if boq_history:
            boq_history.action = current_actions
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_history, "action")
            boq_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=current_actions,
                action_by=se_name,
                boq_status=boq.status,
                sender=se_name,
                receiver=buyer.full_name,
                comments=f"BOQ assigned to buyer {buyer.full_name}",
                sender_role='site_engineer',
                receiver_role='buyer',
                action_date=datetime.utcnow(),
                created_by=se_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # Send email notification to buyer
        try:
            email_service = BOQEmailService()
            email_service.send_assignment_notification(
                buyer_email=buyer.email,
                buyer_name=buyer.full_name,
                se_name=se_name,
                boq_name=boq.boq_name,
                project_name=project.project_name
            )
        except Exception as email_error:
            log.warning(f"Failed to send email notification: {str(email_error)}")

        log.info(f"Site Engineer {se_user_id} assigned BOQ {boq_id} to buyer {buyer_id}")

        return jsonify({
            "success": True,
            "message": f"BOQ materials assigned to {buyer.full_name}",
            "assignment_id": assignment.assignment_id,
            "buyer_name": buyer.full_name
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error assigning BOQ to buyer: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to assign BOQ: {str(e)}"
        }), 500
