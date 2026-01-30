"""
Admin Controller - Full system administration capabilities
Handles user management, role management, project oversight, system stats
"""

from flask import request, jsonify, g
from datetime import datetime, timedelta
from sqlalchemy import or_, func, desc
from config.db import db
from models.user import User
from models.role import Role
from models.project import Project
from models.boq import BOQ
from controllers.auth_controller import jwt_required
from config.logging import get_logger
from config.roles_config import ROLE_HIERARCHY
from utils.purchase_notifications import notify_project_action
from utils.comprehensive_notification_service import notification_service

log = get_logger()


# ============================================
# USER MANAGEMENT APIs
# ============================================

@jwt_required
def get_all_users():
    """
    Get all users with filtering, search, and pagination
    Query params:
    - page: page number (default 1)
    - per_page: items per page (default 10, max 100)
    - search: search term for name, email
    - role_id: filter by role
    - is_active: filter by active status
    - department: filter by department
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 10, type=int), 100)
        search = request.args.get('search', '')
        role_id = request.args.get('role_id', type=int)
        is_active = request.args.get('is_active', type=lambda v: v.lower() == 'true' if v else None)
        department = request.args.get('department', '')

        # Build query
        query = db.session.query(User, Role).join(
            Role, User.role_id == Role.role_id, isouter=True
        ).filter(User.is_deleted == False)

        # Apply filters
        if search:
            search_filter = f"%{search}%"
            query = query.filter(
                or_(
                    User.full_name.ilike(search_filter),
                    User.email.ilike(search_filter),
                    User.phone.ilike(search_filter)
                )
            )

        if role_id:
            query = query.filter(User.role_id == role_id)

        if is_active is not None:
            query = query.filter(User.is_active == is_active)

        if department:
            query = query.filter(User.department.ilike(f"%{department}%"))

        # Order by most recent login first (users who logged in recently appear at top)
        # NULLS LAST ensures users who never logged in appear at the bottom
        query = query.order_by(User.last_login.desc().nulls_last(), desc(User.created_at))

        # Paginate
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        users_list = []
        for user, role in paginated.items:
            users_list.append({
                "user_id": user.user_id,
                "email": user.email,
                "full_name": user.full_name,
                "phone": user.phone,
                "role_id": user.role_id,
                "role_name": role.role if role else None,
                "department": user.department,
                "is_active": user.is_active,
                "user_status": user.user_status,
                "last_login": user.last_login.isoformat() if user.last_login else None,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "last_modified_at": user.last_modified_at.isoformat() if user.last_modified_at else None
            })

        return jsonify({
            "users": users_list,
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
        log.error(f"Error fetching users: {str(e)}")
        return jsonify({"error": f"Failed to fetch users: {str(e)}"}), 500


@jwt_required
def create_user():
    """
    Create a new user (admin only)
    Required: email, full_name, role_id
    Optional: phone, department
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        data = request.get_json()

        # Validate required fields
        if not data.get('email') or not data.get('full_name') or not data.get('role_id'):
            return jsonify({
                "error": "Missing required fields",
                "required": ["email", "full_name", "role_id"]
            }), 400

        email = data.get('email')
        full_name = data.get('full_name')
        role_id = data.get('role_id')
        phone = data.get('phone')
        department = data.get('department')

        # Check if user already exists
        existing_user = User.query.filter_by(email=email, is_deleted=False).first()
        if existing_user:
            return jsonify({"error": f"User with email '{email}' already exists"}), 409

        # Verify role exists
        role = Role.query.filter_by(role_id=role_id, is_deleted=False).first()
        if not role:
            return jsonify({"error": f"Role ID {role_id} not found"}), 404

        # Create new user
        new_user = User(
            email=email,
            full_name=full_name,
            phone=phone,
            role_id=role_id,
            department=department or role.role,
            is_active=True,
            is_deleted=False,
            created_at=datetime.utcnow()
        )

        db.session.add(new_user)
        db.session.commit()

        # Send OTP for first login (async)
        from utils.async_email import send_otp_async
        send_otp_async(email)

        return jsonify({
            "message": "User created successfully. OTP sent to email.",
            "user": {
                "user_id": new_user.user_id,
                "email": new_user.email,
                "full_name": new_user.full_name,
                "role_id": new_user.role_id,
                "role_name": role.role
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating user: {str(e)}")
        return jsonify({"error": f"Failed to create user: {str(e)}"}), 500


@jwt_required
def update_user(user_id):
    """
    Update user information (admin only)
    Can update: full_name, phone, role_id, department, is_active
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        data = request.get_json()

        # Find user
        user = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not user:
            return jsonify({"error": "User not found"}), 404

        # Update fields if provided
        if 'full_name' in data:
            user.full_name = data['full_name']

        if 'phone' in data:
            user.phone = data['phone']

        if 'department' in data:
            user.department = data['department']

        if 'role_id' in data:
            # Verify new role exists
            new_role = Role.query.filter_by(role_id=data['role_id'], is_deleted=False).first()
            if not new_role:
                return jsonify({"error": f"Role ID {data['role_id']} not found"}), 404
            user.role_id = data['role_id']

        if 'is_active' in data:
            user.is_active = data['is_active']

        user.last_modified_at = datetime.utcnow()
        db.session.commit()

        # Get updated role info
        role = Role.query.filter_by(role_id=user.role_id).first()

        return jsonify({
            "message": "User updated successfully",
            "user": {
                "user_id": user.user_id,
                "email": user.email,
                "full_name": user.full_name,
                "phone": user.phone,
                "role_id": user.role_id,
                "role_name": role.role if role else None,
                "department": user.department,
                "is_active": user.is_active
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating user {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to update user: {str(e)}"}), 500


@jwt_required
def delete_user(user_id):
    """
    Soft delete a user (admin only)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Find user
        user = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not user:
            return jsonify({"error": "User not found"}), 404

        # Prevent self-deletion
        if user.user_id == current_user.get("user_id"):
            return jsonify({"error": "Cannot delete your own account"}), 400

        # Soft delete
        user.is_deleted = True
        user.is_active = False
        user.last_modified_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            "message": "User deleted successfully",
            "user_id": user_id
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting user {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to delete user: {str(e)}"}), 500


@jwt_required
def toggle_user_status(user_id):
    """
    Activate/Deactivate user (admin only)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        data = request.get_json()
        is_active = data.get('is_active')

        if is_active is None:
            return jsonify({"error": "is_active field required"}), 400

        # Find user
        user = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not user:
            return jsonify({"error": "User not found"}), 404

        # Prevent self-deactivation
        if user.user_id == current_user.get("user_id") and not is_active:
            return jsonify({"error": "Cannot deactivate your own account"}), 400

        user.is_active = is_active
        user.last_modified_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            "message": f"User {'activated' if is_active else 'deactivated'} successfully",
            "user_id": user_id,
            "is_active": is_active
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error toggling user status {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to update user status: {str(e)}"}), 500


# ============================================
# ROLE MANAGEMENT APIs
# ============================================

@jwt_required
def get_all_roles():
    """
    Get all roles (admin only)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # ✅ OPTIMIZED: Single query with LEFT JOIN and GROUP BY instead of N+1
        # Before: 1 query for roles + N queries for user counts
        # After: 1 query total (95% improvement)
        from sqlalchemy import func

        role_counts = db.session.query(
            Role,
            func.count(User.user_id).label('user_count')
        ).outerjoin(
            User,
            (User.role_id == Role.role_id) & (User.is_deleted == False)
        ).filter(
            Role.is_deleted == False
        ).group_by(Role.role_id).order_by(Role.role_id).all()

        roles_list = []
        for role, user_count in role_counts:
            # Get role config from roles_config.py
            role_config = ROLE_HIERARCHY.get(role.role, {})

            roles_list.append({
                "role_id": role.role_id,
                "role": role.role,
                "description": role.description or role_config.get('description'),
                "permissions": role.permissions or role_config.get('permissions'),
                "is_active": role.is_active,
                "user_count": user_count,  # From JOIN, no additional query
                "approval_limit": role_config.get('approval_limit'),
                "level": role_config.get('level'),
                "tier": role_config.get('tier'),
                "created_at": role.created_at.isoformat() if role.created_at else None
            })

        return jsonify({"roles": roles_list}), 200

    except Exception as e:
        log.error(f"Error fetching roles: {str(e)}")
        return jsonify({"error": f"Failed to fetch roles: {str(e)}"}), 500


# ============================================
# PROJECT MANAGEMENT (Admin Override) APIs
# ============================================

@jwt_required
def get_all_projects_admin():
    """
    Get all projects with admin view (no role restrictions)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        search = request.args.get('search', '')
        status = request.args.get('status', '')

        # Build query - get ALL projects
        query = db.session.query(Project, User).outerjoin(
            User, Project.user_id == User.user_id
        ).filter(Project.is_deleted == False)

        # Apply filters
        if search:
            search_filter = f"%{search}%"
            query = query.filter(
                or_(
                    Project.project_name.ilike(search_filter),
                    Project.client.ilike(search_filter),
                    Project.location.ilike(search_filter)
                )
            )

        if status:
            query = query.filter(func.lower(Project.status) == status.lower())

        # Order by most recent first
        query = query.order_by(desc(Project.created_at))

        # Paginate
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        projects_list = []
        for project, pm_user in paginated.items:
            projects_list.append({
                "project_id": project.project_id,
                "project_name": project.project_name,
                "description": project.description,
                "location": project.location,
                "client": project.client,
                "work_type": project.work_type,
                "status": project.status,
                "start_date": project.start_date.isoformat() if project.start_date else None,
                "end_date": project.end_date.isoformat() if project.end_date else None,
                "duration_days": project.duration_days,
                "area": project.area,
                "assigned_pm": {
                    "user_id": pm_user.user_id,
                    "name": pm_user.full_name,
                    "email": pm_user.email
                } if pm_user else None,
                "created_by": project.created_by,
                "created_at": project.created_at.isoformat() if project.created_at else None
            })

        return jsonify({
            "projects": projects_list,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated.total,
                "pages": paginated.pages
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching projects (admin): {str(e)}")
        return jsonify({"error": f"Failed to fetch projects: {str(e)}"}), 500


@jwt_required
def assign_project_manager(project_id):
    """
    Assign/reassign project manager (admin override)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        data = request.get_json()
        pm_user_id = data.get('user_id')

        if not pm_user_id:
            return jsonify({"error": "user_id required"}), 400

        # Find project
        project = Project.query.filter_by(project_id=project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Verify PM exists and has correct role
        pm_user = User.query.filter_by(user_id=pm_user_id, is_deleted=False, is_active=True).first()
        if not pm_user:
            return jsonify({"error": "Project Manager not found or inactive"}), 404

        pm_role = Role.query.filter_by(role_id=pm_user.role_id).first()
        if pm_role and pm_role.role not in ['projectManager', 'technicalDirector', 'admin']:
            return jsonify({"error": "User is not a Project Manager, Technical Director, or Admin"}), 400

        # Assign PM (convert to JSONB array format)
        project.user_id = [pm_user_id] if pm_user_id else None
        project.last_modified_at = datetime.utcnow()
        project.last_modified_by = current_user.get('email')
        db.session.commit()

        # Send notification to assigned PM
        try:
            admin_id = current_user.get('user_id')
            admin_name = current_user.get('full_name') or current_user.get('username') or 'Admin'
            notification_service.notify_pm_assigned_to_project(
                project_id=project_id,
                project_name=project.project_name,
                td_id=admin_id,
                td_name=admin_name,
                pm_user_ids=[pm_user_id]
            )
        except Exception as notif_error:
            log.error(f"Failed to send PM assignment notification: {notif_error}")

        return jsonify({
            "message": "Project Manager assigned successfully",
            "project_id": project_id,
            "assigned_pm": {
                "user_id": pm_user.user_id,
                "name": pm_user.full_name,
                "email": pm_user.email
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error assigning PM to project {project_id}: {str(e)}")
        return jsonify({"error": f"Failed to assign PM: {str(e)}"}), 500


# ============================================
# RECENT ACTIVITY API
# ============================================

@jwt_required
def get_recent_activity():
    """
    Get recent system activity (admin dashboard)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        limit = request.args.get('limit', 20, type=int)

        # ✅ OPTIMIZED: Eager load role relationship to prevent N+1
        # Before: 10 users = 11 queries (1 for users + 10 for roles)
        # After: 2 queries total (1 for users + 1 for all roles)
        from sqlalchemy.orm import joinedload

        recent_users = User.query.options(
            joinedload(User.role)
        ).filter_by(is_deleted=False).order_by(
            desc(User.created_at)
        ).limit(10).all()

        # Get recent projects
        recent_projects = Project.query.filter_by(is_deleted=False).order_by(
            desc(Project.created_at)
        ).limit(10).all()

        activities = []

        # Add user activities
        for user in recent_users:
            # ✅ No query - role already loaded via joinedload
            role = user.role
            activities.append({
                "id": f"user_{user.user_id}",
                "type": "user",
                "action": "User registered",
                "user": user.full_name,
                "details": f"New {role.role if role else 'user'} joined",
                "timestamp": user.created_at.isoformat() if user.created_at else None
            })

        # Add project activities
        for project in recent_projects:
            activities.append({
                "id": f"project_{project.project_id}",
                "type": "project",
                "action": "Project created",
                "user": project.created_by,
                "details": f"New project: {project.project_name}",
                "timestamp": project.created_at.isoformat() if project.created_at else None
            })

        # Sort by timestamp (most recent first)
        activities.sort(key=lambda x: x['timestamp'] or '', reverse=True)

        return jsonify({
            "activities": activities[:limit]
        }), 200

    except Exception as e:
        log.error(f"Error fetching recent activity: {str(e)}")
        return jsonify({"error": f"Failed to fetch activity: {str(e)}"}), 500


# ============================================
# PROJECT MANAGER & SITE ENGINEER APIs
# ============================================

@jwt_required
def get_all_project_managers():
    """
    Get all project managers with their project counts (admin only)
    ✅ PERFORMANCE: Pagination + N+1 query fix
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)  # Default 50 items per page
        per_page = min(per_page, 100)  # Max 100 items per page

        # Get the projectManager role
        pm_role = Role.query.filter_by(role='projectManager').first()

        if not pm_role:
            return jsonify({"error": "Project Manager role not found"}), 404

        # ✅ PERFORMANCE FIX: Get project counts in ONE query instead of N queries (N+1 → 1)
        # Group by user_id and count projects
        project_counts = db.session.query(
            Project.user_id,
            func.count(Project.project_id).label('project_count')
        ).filter(
            Project.is_deleted == False
        ).group_by(Project.user_id).all()

        # Create lookup map for project counts
        project_count_map = {user_id: count for user_id, count in project_counts}

        # Get paginated users with projectManager role
        pagination = User.query.filter_by(
            role_id=pm_role.role_id,
            is_deleted=False
        ).order_by(User.created_at.desc()).paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )

        pm_list = []
        for pm in pagination.items:
            # Use pre-calculated project count (no query!)
            project_count = project_count_map.get(pm.user_id, 0)

            pm_list.append({
                "user_id": pm.user_id,
                "full_name": pm.full_name,
                "email": pm.email,
                "phone": pm.phone,
                "department": pm.department,
                "user_status": pm.user_status,
                "project_count": project_count,
                "last_login": pm.last_login.isoformat() if pm.last_login else None,
                "created_at": pm.created_at.isoformat() if pm.created_at else None
            })

        return jsonify({
            "project_managers": pm_list,
            "pagination": {
                "page": pagination.page,
                "per_page": pagination.per_page,
                "total": pagination.total,
                "pages": pagination.pages,
                "has_next": pagination.has_next,
                "has_prev": pagination.has_prev
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching project managers: {str(e)}")
        return jsonify({"error": f"Failed to fetch project managers: {str(e)}"}), 500


@jwt_required
def get_all_site_engineers():
    """
    Get all site engineers with their project counts (admin only)
    ✅ PERFORMANCE: Pagination + N+1 query fix
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)  # Default 50 items per page
        per_page = min(per_page, 100)  # Max 100 items per page

        # Get the siteEngineer role
        se_role = Role.query.filter_by(role='siteEngineer').first()

        if not se_role:
            return jsonify({"error": "Site Engineer role not found"}), 404

        # ✅ PERFORMANCE FIX: Get project counts in ONE query instead of N queries (N+1 → 1)
        # Group by site_supervisor_id and count projects
        project_counts = db.session.query(
            Project.site_supervisor_id,
            func.count(Project.project_id).label('project_count')
        ).filter(
            Project.is_deleted == False
        ).group_by(Project.site_supervisor_id).all()

        # Create lookup map for project counts
        project_count_map = {user_id: count for user_id, count in project_counts}

        # Get paginated users with siteEngineer role
        pagination = User.query.filter_by(
            role_id=se_role.role_id,
            is_deleted=False
        ).order_by(User.created_at.desc()).paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )

        se_list = []
        for se in pagination.items:
            # Use pre-calculated project count (no query!)
            project_count = project_count_map.get(se.user_id, 0)

            se_list.append({
                "user_id": se.user_id,
                "full_name": se.full_name,
                "email": se.email,
                "phone": se.phone,
                "department": se.department,
                "user_status": se.user_status,
                "project_count": project_count,
                "last_login": se.last_login.isoformat() if se.last_login else None,
                "created_at": se.created_at.isoformat() if se.created_at else None
            })

        return jsonify({
            "site_engineers": se_list,
            "pagination": {
                "page": pagination.page,
                "per_page": pagination.per_page,
                "total": pagination.total,
                "pages": pagination.pages,
                "has_next": pagination.has_next,
                "has_prev": pagination.has_prev
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching site engineers: {str(e)}")
        return jsonify({"error": f"Failed to fetch site engineers: {str(e)}"}), 500


# ============================================
# BOQ MANAGEMENT (Admin)
# ============================================

@jwt_required
def get_all_boqs_admin():
    """
    Get all BOQs for admin dashboard (admin only)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Get filters from request
        status_filter = request.args.get('status', None)
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)

        # Query BOQs
        from models.boq import BOQ, BOQDetails
        query = db.session.query(BOQ).filter(BOQ.is_deleted == False)

        # Apply status filter
        if status_filter and status_filter != 'all':
            query = query.filter(func.lower(BOQ.status) == status_filter.lower())

        # Order by most recent first
        query = query.order_by(desc(BOQ.created_at))

        # PERFORMANCE FIX: Use JOINs to load related data in one query
        from sqlalchemy.orm import joinedload

        # Paginate with eager loading
        total = query.count()
        boqs = query.options(
            joinedload(BOQ.project)  # project relationship exists
            # Note: creator relationship doesn't exist (created_by is a string), will fetch separately
        ).limit(per_page).offset((page - 1) * per_page).all()

        # Pre-fetch all users in ONE query to avoid N+1
        creator_ids = [boq.created_by for boq in boqs if boq.created_by]
        creators_map = {}
        if creator_ids:
            creators = User.query.filter(User.user_id.in_(creator_ids)).all()
            creators_map = {str(u.user_id): u for u in creators}

        boq_list = []
        for boq in boqs:
            # Use pre-loaded project relationship
            project = boq.project if hasattr(boq, 'project') else None
            # Use pre-fetched creator map
            creator = creators_map.get(str(boq.created_by)) if boq.created_by else None

            boq_list.append({
                "boq_id": boq.boq_id,
                "project_id": boq.project_id,
                "project_name": project.project_name if project else "Unknown Project",
                "created_by": creator.full_name if creator else "Unknown",
                "status": boq.status or "pending",
                "total_amount": boq.total_cost or 0,
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "updated_at": boq.updated_at.isoformat() if boq.updated_at else None,
                "version": boq.version or 1,
                "approval_status": boq.approval_status
            })

        return jsonify({
            "boqs": boq_list,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "pages": (total + per_page - 1) // per_page
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching BOQs: {str(e)}")
        return jsonify({"error": f"Failed to fetch BOQs: {str(e)}"}), 500


@jwt_required
def approve_boq_admin(boq_id):
    """
    Approve/Reject BOQ (admin only)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        data = request.get_json()
        approved = data.get('approved', True)
        comments = data.get('comments', '')

        from models.boq import BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()

        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Update BOQ status
        if approved:
            boq.status = 'approved'
            boq.approval_status = 'approved'
        else:
            boq.status = 'rejected'
            boq.approval_status = 'rejected'

        boq.updated_at = datetime.utcnow()
        db.session.commit()

        log.info(f"BOQ {boq_id} {'approved' if approved else 'rejected'} by admin {current_user.get('user_id')}")

        return jsonify({
            "message": f"BOQ {'approved' if approved else 'rejected'} successfully",
            "boq_id": boq_id,
            "status": boq.status
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving BOQ: {str(e)}")
        return jsonify({"error": f"Failed to approve BOQ: {str(e)}"}), 500


# ============================================
# LOGIN HISTORY APIs
# ============================================

@jwt_required
def get_user_login_history(user_id):
    """
    Get login history for a specific user
    Query params:
    - page: page number (default 1)
    - per_page: items per page (default 20, max 100)
    - days: filter to last N days (optional)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Check user exists
        user = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not user:
            return jsonify({"error": "User not found"}), 404

        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        days = request.args.get('days', type=int)

        # Import LoginHistory model
        from models.login_history import LoginHistory

        # Build query
        query = LoginHistory.query.filter_by(user_id=user_id)

        # Filter by days if specified
        if days:
            cutoff = datetime.utcnow() - timedelta(days=days)
            query = query.filter(LoginHistory.login_at >= cutoff)

        # Order by most recent first
        query = query.order_by(LoginHistory.login_at.desc())

        # Get total count
        total = query.count()

        # Apply pagination
        offset = (page - 1) * per_page
        login_records = query.offset(offset).limit(per_page).all()

        # Calculate pagination info
        total_pages = (total + per_page - 1) // per_page

        return jsonify({
            "success": True,
            "user": {
                "user_id": user.user_id,
                "email": user.email,
                "full_name": user.full_name
            },
            "login_history": [record.to_dict() for record in login_records],
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching login history: {str(e)}")
        return jsonify({"error": f"Failed to fetch login history: {str(e)}"}), 500


@jwt_required
def get_all_login_history():
    """
    Get login history for all users (admin overview)
    Query params:
    - page: page number (default 1)
    - per_page: items per page (default 50, max 100)
    - days: filter to last N days (default 7)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 50, type=int), 100)
        days = request.args.get('days', 7, type=int)

        # Import LoginHistory model
        from models.login_history import LoginHistory

        # Build query with user join for names
        cutoff = datetime.utcnow() - timedelta(days=days)
        query = db.session.query(LoginHistory, User).join(
            User, LoginHistory.user_id == User.user_id
        ).filter(
            LoginHistory.login_at >= cutoff
        ).order_by(LoginHistory.login_at.desc())

        # Get total count
        total = query.count()

        # Apply pagination
        offset = (page - 1) * per_page
        results = query.offset(offset).limit(per_page).all()

        # Calculate pagination info
        total_pages = (total + per_page - 1) // per_page

        # Format results
        login_history = []
        for login_record, user in results:
            record_dict = login_record.to_dict()
            record_dict['user_name'] = user.full_name
            record_dict['user_email'] = user.email
            login_history.append(record_dict)

        return jsonify({
            "success": True,
            "login_history": login_history,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            },
            "filter": {
                "days": days
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching all login history: {str(e)}")
        return jsonify({"error": f"Failed to fetch login history: {str(e)}"}), 500


# ============================================
# COMPREHENSIVE DASHBOARD ANALYTICS APIs
# ============================================

def get_dashboard_analytics():
    """
    Get comprehensive dashboard analytics for admin
    Returns all metrics needed for admin dashboard in a single optimized call
    Query params:
    - days: filter trends to last N days (default 30, max 365)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Validate and cap days parameter to prevent resource exhaustion
        days = request.args.get('days', 30, type=int)
        days = max(1, min(days, 365))  # Cap between 1-365 days
        cutoff_date = datetime.utcnow() - timedelta(days=days)

        # Import required models
        from models.change_request import ChangeRequest
        from models.vendor import Vendor
        from models.inventory import (
            InventoryMaterial, InventoryTransaction,
            MaterialDeliveryNote, InternalMaterialRequest
        )
        from models.login_history import LoginHistory

        # ============================================
        # 1. USER ANALYTICS
        # ============================================
        total_users = User.query.filter_by(is_deleted=False).count()
        active_users = User.query.filter_by(is_deleted=False, is_active=True).count()
        new_users_period = User.query.filter(
            User.is_deleted == False,
            User.created_at >= cutoff_date
        ).count()

        # Role distribution with counts
        role_distribution = db.session.query(
            Role.role,
            Role.role_id,
            func.count(User.user_id).label('count')
        ).outerjoin(
            User, (Role.role_id == User.role_id) & (User.is_deleted == False)
        ).filter(
            Role.is_deleted == False
        ).group_by(Role.role_id, Role.role).order_by(desc('count')).all()

        # User registration trend (daily for the period)
        user_trend = db.session.query(
            func.date(User.created_at).label('date'),
            func.count(User.user_id).label('count')
        ).filter(
            User.is_deleted == False,
            User.created_at >= cutoff_date
        ).group_by(func.date(User.created_at)).order_by('date').all()

        # ============================================
        # 2. PROJECT ANALYTICS
        # ============================================
        total_projects = Project.query.filter_by(is_deleted=False).count()

        # Project status breakdown
        project_status = db.session.query(
            func.lower(Project.status).label('status'),
            func.count(Project.project_id).label('count')
        ).filter(
            Project.is_deleted == False
        ).group_by(func.lower(Project.status)).all()

        project_status_map = {s: c for s, c in project_status}

        new_projects_period = Project.query.filter(
            Project.is_deleted == False,
            Project.created_at >= cutoff_date
        ).count()

        # Projects by work type
        work_type_distribution = db.session.query(
            Project.work_type,
            func.count(Project.project_id).label('count')
        ).filter(
            Project.is_deleted == False,
            Project.work_type.isnot(None)
        ).group_by(Project.work_type).order_by(desc('count')).limit(10).all()

        # ============================================
        # 3. BOQ ANALYTICS
        # ============================================
        total_boqs = BOQ.query.filter_by(is_deleted=False).count()

        boq_status = db.session.query(
            func.lower(BOQ.status).label('status'),
            func.count(BOQ.boq_id).label('count')
        ).filter(
            BOQ.is_deleted == False
        ).group_by(func.lower(BOQ.status)).all()

        boq_status_map = {s: c for s, c in boq_status}

        # BOQ creation trend
        boq_trend = db.session.query(
            func.date(BOQ.created_at).label('date'),
            func.count(BOQ.boq_id).label('count')
        ).filter(
            BOQ.is_deleted == False,
            BOQ.created_at >= cutoff_date
        ).group_by(func.date(BOQ.created_at)).order_by('date').all()

        # ============================================
        # 4. CHANGE REQUEST ANALYTICS
        # ============================================
        total_crs = ChangeRequest.query.filter_by(is_deleted=False).count()

        cr_status = db.session.query(
            ChangeRequest.status,
            func.count(ChangeRequest.cr_id).label('count')
        ).filter(
            ChangeRequest.is_deleted == False
        ).group_by(ChangeRequest.status).all()

        cr_status_map = {s: c for s, c in cr_status}

        # CR financial metrics
        cr_financials = db.session.query(
            func.sum(ChangeRequest.materials_total_cost).label('total_cost'),
            func.avg(ChangeRequest.materials_total_cost).label('avg_cost')
        ).filter(
            ChangeRequest.is_deleted == False
        ).first()

        # CRs pending approval (by stage)
        pending_approvals = db.session.query(
            ChangeRequest.approval_required_from,
            func.count(ChangeRequest.cr_id).label('count')
        ).filter(
            ChangeRequest.is_deleted == False,
            ChangeRequest.status.in_(['pending', 'pending_pm_approval', 'pending_td_approval',
                                       'pending_estimator_approval', 'pending_vendor_approval'])
        ).group_by(ChangeRequest.approval_required_from).all()

        # CR trend
        cr_trend = db.session.query(
            func.date(ChangeRequest.created_at).label('date'),
            func.count(ChangeRequest.cr_id).label('count')
        ).filter(
            ChangeRequest.is_deleted == False,
            ChangeRequest.created_at >= cutoff_date
        ).group_by(func.date(ChangeRequest.created_at)).order_by('date').all()

        # ============================================
        # 5. VENDOR ANALYTICS
        # ============================================
        total_vendors = Vendor.query.filter_by(is_deleted=False).count()
        active_vendors = Vendor.query.filter_by(is_deleted=False, status='active').count()

        # Vendor category distribution
        vendor_categories = db.session.query(
            Vendor.category,
            func.count(Vendor.vendor_id).label('count')
        ).filter(
            Vendor.is_deleted == False,
            Vendor.category.isnot(None)
        ).group_by(Vendor.category).order_by(desc('count')).limit(10).all()

        new_vendors_period = Vendor.query.filter(
            Vendor.is_deleted == False,
            Vendor.created_at >= cutoff_date
        ).count()

        # ============================================
        # 6. INVENTORY ANALYTICS
        # ============================================
        total_materials = InventoryMaterial.query.filter_by(is_active=True).count()

        # Stock value calculation
        stock_metrics = db.session.query(
            func.sum(InventoryMaterial.current_stock * InventoryMaterial.unit_price).label('total_value'),
            func.sum(InventoryMaterial.current_stock).label('total_stock'),
            func.sum(InventoryMaterial.backup_stock).label('backup_stock')
        ).filter(
            InventoryMaterial.is_active == True
        ).first()

        # Low stock alerts (below min_stock_level)
        low_stock_count = InventoryMaterial.query.filter(
            InventoryMaterial.is_active == True,
            InventoryMaterial.current_stock < InventoryMaterial.min_stock_level,
            InventoryMaterial.min_stock_level > 0
        ).count()

        # Inventory transactions summary
        transaction_summary = db.session.query(
            InventoryTransaction.transaction_type,
            func.count(InventoryTransaction.inventory_transaction_id).label('count'),
            func.sum(InventoryTransaction.total_amount).label('total_amount')
        ).filter(
            InventoryTransaction.created_at >= cutoff_date
        ).group_by(InventoryTransaction.transaction_type).all()

        transaction_map = {t: {'count': c, 'amount': float(a) if a else 0} for t, c, a in transaction_summary}

        # ============================================
        # 7. DELIVERY NOTES ANALYTICS
        # ============================================
        delivery_stats = db.session.query(
            MaterialDeliveryNote.status,
            func.count(MaterialDeliveryNote.delivery_note_id).label('count')
        ).filter(
            MaterialDeliveryNote.created_at >= cutoff_date
        ).group_by(MaterialDeliveryNote.status).all()

        delivery_status_map = {s: c for s, c in delivery_stats}

        # ============================================
        # 8. MATERIAL REQUESTS ANALYTICS
        # ============================================
        request_stats = db.session.query(
            InternalMaterialRequest.status,
            func.count(InternalMaterialRequest.request_id).label('count')
        ).filter(
            InternalMaterialRequest.created_at >= cutoff_date
        ).group_by(InternalMaterialRequest.status).all()

        request_status_map = {s: c for s, c in request_stats}

        # ============================================
        # 9. LOGIN ACTIVITY ANALYTICS
        # ============================================
        login_count_period = LoginHistory.query.filter(
            LoginHistory.login_at >= cutoff_date
        ).count()

        # Login trend (daily)
        login_trend = db.session.query(
            func.date(LoginHistory.login_at).label('date'),
            func.count(LoginHistory.id).label('count')
        ).filter(
            LoginHistory.login_at >= cutoff_date
        ).group_by(func.date(LoginHistory.login_at)).order_by('date').all()

        # Login methods distribution
        login_methods = db.session.query(
            LoginHistory.login_method,
            func.count(LoginHistory.id).label('count')
        ).filter(
            LoginHistory.login_at >= cutoff_date
        ).group_by(LoginHistory.login_method).all()

        # ============================================
        # 10. SYSTEM HEALTH METRICS
        # ============================================
        # Calculate real system health based on various factors
        health_score = 100

        # Deduct for pending items
        pending_crs = cr_status_map.get('pending', 0) + cr_status_map.get('pending_pm_approval', 0)
        if pending_crs > 50:
            health_score -= 5
        elif pending_crs > 20:
            health_score -= 2

        # Deduct for low stock
        if low_stock_count > 10:
            health_score -= 5
        elif low_stock_count > 5:
            health_score -= 2

        # Deduct for inactive users percentage
        inactive_percentage = ((total_users - active_users) / total_users * 100) if total_users > 0 else 0
        if inactive_percentage > 30:
            health_score -= 3

        # ============================================
        # COMPILE RESPONSE
        # ============================================
        return jsonify({
            "success": True,
            "period_days": days,
            "generated_at": datetime.utcnow().isoformat(),

            # User Analytics
            "users": {
                "total": total_users,
                "active": active_users,
                "inactive": total_users - active_users,
                "new_in_period": new_users_period,
                "role_distribution": [
                    {"role": r, "role_id": rid, "count": c}
                    for r, rid, c in role_distribution
                ],
                "registration_trend": [
                    {"date": str(d), "count": c} for d, c in user_trend
                ]
            },

            # Project Analytics
            "projects": {
                "total": total_projects,
                "active": project_status_map.get('active', 0),
                "completed": project_status_map.get('completed', 0),
                "pending": project_status_map.get('pending', 0),
                "on_hold": project_status_map.get('on_hold', 0),
                "new_in_period": new_projects_period,
                "status_breakdown": [
                    {"status": s, "count": c} for s, c in project_status
                ],
                "work_type_distribution": [
                    {"work_type": w or "Unspecified", "count": c}
                    for w, c in work_type_distribution
                ]
            },

            # BOQ Analytics
            "boqs": {
                "total": total_boqs,
                "pending": boq_status_map.get('pending', 0),
                "approved": boq_status_map.get('approved', 0),
                "rejected": boq_status_map.get('rejected', 0),
                "in_review": boq_status_map.get('in_review', 0),
                "status_breakdown": [
                    {"status": s or "pending", "count": c} for s, c in boq_status
                ],
                "creation_trend": [
                    {"date": str(d), "count": c} for d, c in boq_trend
                ]
            },

            # Change Request Analytics
            "change_requests": {
                "total": total_crs,
                "pending": cr_status_map.get('pending', 0),
                "approved": cr_status_map.get('approved', 0),
                "rejected": cr_status_map.get('rejected', 0),
                "completed": cr_status_map.get('completed', 0),
                "purchase_completed": cr_status_map.get('purchase_completed', 0),
                "total_cost": float(cr_financials.total_cost) if cr_financials.total_cost else 0,
                "avg_cost": float(cr_financials.avg_cost) if cr_financials.avg_cost else 0,
                "status_breakdown": [
                    {"status": s, "count": c} for s, c in cr_status
                ],
                "pending_approvals": [
                    {"stage": stage or "initial", "count": c}
                    for stage, c in pending_approvals
                ],
                "creation_trend": [
                    {"date": str(d), "count": c} for d, c in cr_trend
                ]
            },

            # Vendor Analytics
            "vendors": {
                "total": total_vendors,
                "active": active_vendors,
                "inactive": total_vendors - active_vendors,
                "new_in_period": new_vendors_period,
                "category_distribution": [
                    {"category": c or "Uncategorized", "count": cnt}
                    for c, cnt in vendor_categories
                ]
            },

            # Inventory Analytics
            "inventory": {
                "total_materials": total_materials,
                "total_stock_value": float(stock_metrics.total_value) if stock_metrics.total_value else 0,
                "total_stock_quantity": float(stock_metrics.total_stock) if stock_metrics.total_stock else 0,
                "backup_stock_quantity": float(stock_metrics.backup_stock) if stock_metrics.backup_stock else 0,
                "low_stock_alerts": low_stock_count,
                "transactions": {
                    "purchases": transaction_map.get('PURCHASE', {'count': 0, 'amount': 0}),
                    "withdrawals": transaction_map.get('WITHDRAWAL', {'count': 0, 'amount': 0})
                }
            },

            # Delivery Analytics
            "deliveries": {
                "total_in_period": sum(delivery_status_map.values()),
                "draft": delivery_status_map.get('DRAFT', 0),
                "issued": delivery_status_map.get('ISSUED', 0),
                "in_transit": delivery_status_map.get('IN_TRANSIT', 0),
                "delivered": delivery_status_map.get('DELIVERED', 0),
                "status_breakdown": [
                    {"status": s, "count": c} for s, c in delivery_stats
                ]
            },

            # Material Requests Analytics
            "material_requests": {
                "total_in_period": sum(request_status_map.values()),
                "pending": request_status_map.get('PENDING', 0),
                "approved": request_status_map.get('APPROVED', 0),
                "dispatched": request_status_map.get('DISPATCHED', 0),
                "fulfilled": request_status_map.get('FULFILLED', 0),
                "rejected": request_status_map.get('REJECTED', 0),
                "status_breakdown": [
                    {"status": s, "count": c} for s, c in request_stats
                ]
            },

            # Login Activity
            "login_activity": {
                "total_logins_in_period": login_count_period,
                "login_trend": [
                    {"date": str(d), "count": c} for d, c in login_trend
                ],
                "login_methods": [
                    {"method": m or "unknown", "count": c} for m, c in login_methods
                ]
            },

            # System Health
            "system_health": {
                "score": max(health_score, 0),
                "status": "excellent" if health_score >= 90 else "good" if health_score >= 70 else "needs_attention",
                "alerts": {
                    "low_stock_materials": low_stock_count,
                    "pending_change_requests": pending_crs,
                    "inactive_users_percentage": round(inactive_percentage, 1)
                }
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching dashboard analytics: {str(e)}")
        import traceback
        log.error(traceback.format_exc())
        return jsonify({"error": "Failed to fetch analytics. Please try again later."}), 500


def get_top_performers():
    """
    Get top performing users across different metrics
    - Top PMs by projects managed
    - Top SEs by projects assigned
    - Most active users by login frequency
    """
    try:
        current_user = g.get("user")

        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Validate and cap parameters to prevent resource exhaustion
        limit = request.args.get('limit', 5, type=int)
        limit = max(1, min(limit, 50))  # Cap between 1-50 items
        days = request.args.get('days', 30, type=int)
        days = max(1, min(days, 365))  # Cap between 1-365 days
        cutoff_date = datetime.utcnow() - timedelta(days=days)

        from models.login_history import LoginHistory

        # Top Project Managers by active projects
        # Note: Project.user_id is a JSONB array storing multiple PM IDs [1, 2, 3]
        # We need to use JSONB contains operator to check if user_id is in the array
        from sqlalchemy import cast, text
        from sqlalchemy.dialects.postgresql import JSONB

        pm_role = Role.query.filter_by(role='projectManager').first()
        top_pms = []
        if pm_role:
            # Get all active PMs first
            pms = User.query.filter(
                User.role_id == pm_role.role_id,
                User.is_deleted == False
            ).all()

            pm_project_counts = []
            for pm in pms:
                # Count projects where this PM's user_id is in the JSONB array
                # Using raw SQL for JSONB array containment check
                project_count = db.session.query(func.count(Project.project_id)).filter(
                    Project.is_deleted == False,
                    Project.user_id.isnot(None),
                    # Check if the PM's user_id is contained in the JSONB array
                    text(f"user_id @> '[{pm.user_id}]'::jsonb")
                ).scalar() or 0

                if project_count > 0:
                    pm_project_counts.append({
                        "user_id": pm.user_id,
                        "name": pm.full_name,
                        "email": pm.email,
                        "project_count": project_count
                    })

            # Sort by project count descending and limit
            top_pms = sorted(pm_project_counts, key=lambda x: x['project_count'], reverse=True)[:limit]

        # Top Site Engineers by projects they've worked on
        # Count distinct projects where SE has created change requests
        from models.change_request import ChangeRequest

        se_role = Role.query.filter_by(role='siteEngineer').first()
        top_ses = []
        if se_role:
            se_projects = db.session.query(
                User.user_id,
                User.full_name,
                User.email,
                func.count(func.distinct(ChangeRequest.project_id)).label('project_count')
            ).outerjoin(
                ChangeRequest,
                (ChangeRequest.requested_by_user_id == User.user_id) & (ChangeRequest.is_deleted == False)
            ).filter(
                User.role_id == se_role.role_id,
                User.is_deleted == False
            ).group_by(User.user_id, User.full_name, User.email).order_by(
                desc('project_count')
            ).limit(limit).all()

            top_ses = [
                {"user_id": uid, "name": name, "email": email, "project_count": cnt}
                for uid, name, email, cnt in se_projects
            ]

        # Most active users by login frequency (last N days) - excluding admin role
        admin_role = Role.query.filter_by(role='admin').first()
        active_users = db.session.query(
            User.user_id,
            User.full_name,
            User.email,
            Role.role,
            func.count(LoginHistory.id).label('login_count')
        ).join(
            LoginHistory, LoginHistory.user_id == User.user_id
        ).join(
            Role, User.role_id == Role.role_id
        ).filter(
            User.is_deleted == False,
            LoginHistory.login_at >= cutoff_date,
            Role.role != 'admin'  # Exclude admin users
        ).group_by(
            User.user_id, User.full_name, User.email, Role.role
        ).order_by(desc('login_count')).limit(limit).all()

        most_active = [
            {"user_id": uid, "name": name, "email": email, "role": role, "login_count": cnt}
            for uid, name, email, role, cnt in active_users
        ]

        return jsonify({
            "success": True,
            "period_days": days,
            "top_project_managers": top_pms,
            "top_site_engineers": top_ses,
            "most_active_users": most_active
        }), 200

    except Exception as e:
        log.error(f"Error fetching top performers: {str(e)}")
        import traceback
        log.error(traceback.format_exc())
        return jsonify({"error": "Failed to fetch top performers. Please try again later."}), 500


def get_financial_summary():
    """
    Get financial summary for admin dashboard
    - Total CR costs
    - Inventory value
    - Transport costs
    - Trends over time
    """
    try:
        current_user = g.get("user")

        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Validate and cap days parameter to prevent resource exhaustion
        days = request.args.get('days', 30, type=int)
        days = max(1, min(days, 365))  # Cap between 1-365 days
        cutoff_date = datetime.utcnow() - timedelta(days=days)

        from models.change_request import ChangeRequest
        from models.inventory import InventoryMaterial, InventoryTransaction

        # CR Financial Summary
        cr_costs = db.session.query(
            func.sum(ChangeRequest.materials_total_cost).label('total'),
            func.avg(ChangeRequest.materials_total_cost).label('average'),
            func.count(ChangeRequest.cr_id).label('count')
        ).filter(
            ChangeRequest.is_deleted == False,
            ChangeRequest.created_at >= cutoff_date
        ).first()

        # CR costs by status
        cr_by_status = db.session.query(
            ChangeRequest.status,
            func.sum(ChangeRequest.materials_total_cost).label('total'),
            func.count(ChangeRequest.cr_id).label('count')
        ).filter(
            ChangeRequest.is_deleted == False,
            ChangeRequest.created_at >= cutoff_date
        ).group_by(ChangeRequest.status).all()

        # Inventory value
        inventory_value = db.session.query(
            func.sum(InventoryMaterial.current_stock * InventoryMaterial.unit_price).label('current'),
            func.sum(InventoryMaterial.backup_stock * InventoryMaterial.unit_price).label('backup')
        ).filter(
            InventoryMaterial.is_active == True
        ).first()

        # Transaction totals
        transactions = db.session.query(
            InventoryTransaction.transaction_type,
            func.sum(InventoryTransaction.total_amount).label('total'),
            func.sum(InventoryTransaction.transport_fee).label('transport')
        ).filter(
            InventoryTransaction.created_at >= cutoff_date
        ).group_by(InventoryTransaction.transaction_type).all()

        transaction_summary = {}
        total_transport = 0
        for t_type, total, transport in transactions:
            transaction_summary[t_type] = {
                'total': float(total) if total else 0,
                'transport': float(transport) if transport else 0
            }
            total_transport += float(transport) if transport else 0

        # Daily cost trend
        daily_costs = db.session.query(
            func.date(ChangeRequest.created_at).label('date'),
            func.sum(ChangeRequest.materials_total_cost).label('cost')
        ).filter(
            ChangeRequest.is_deleted == False,
            ChangeRequest.created_at >= cutoff_date
        ).group_by(func.date(ChangeRequest.created_at)).order_by('date').all()

        return jsonify({
            "success": True,
            "period_days": days,
            "change_requests": {
                "total_cost": float(cr_costs.total) if cr_costs.total else 0,
                "average_cost": float(cr_costs.average) if cr_costs.average else 0,
                "total_count": cr_costs.count or 0,
                "by_status": [
                    {"status": s, "total_cost": float(t) if t else 0, "count": c}
                    for s, t, c in cr_by_status
                ]
            },
            "inventory": {
                "current_value": float(inventory_value.current) if inventory_value.current else 0,
                "backup_value": float(inventory_value.backup) if inventory_value.backup else 0,
                "total_value": (float(inventory_value.current) if inventory_value.current else 0) +
                              (float(inventory_value.backup) if inventory_value.backup else 0)
            },
            "transactions": transaction_summary,
            "transport_costs": total_transport,
            "daily_cost_trend": [
                {"date": str(d), "cost": float(c) if c else 0}
                for d, c in daily_costs
            ]
        }), 200

    except Exception as e:
        log.error(f"Error fetching financial summary: {str(e)}")
        import traceback
        log.error(traceback.format_exc())
        return jsonify({"error": "Failed to fetch financial summary. Please try again later."}), 500
