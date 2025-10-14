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

        # Order by most recent first
        query = query.order_by(desc(User.created_at))

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

        roles = Role.query.filter_by(is_deleted=False).order_by(Role.role_id).all()

        roles_list = []
        for role in roles:
            # Get user count for this role
            user_count = User.query.filter_by(role_id=role.role_id, is_deleted=False).count()

            # Get role config from roles_config.py
            role_config = ROLE_HIERARCHY.get(role.role, {})

            roles_list.append({
                "role_id": role.role_id,
                "role": role.role,
                "description": role.description or role_config.get('description'),
                "permissions": role.permissions or role_config.get('permissions'),
                "is_active": role.is_active,
                "user_count": user_count,
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

        # Assign PM
        project.user_id = pm_user_id
        project.last_modified_at = datetime.utcnow()
        project.last_modified_by = current_user.get('email')
        db.session.commit()

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
# SYSTEM STATISTICS & DASHBOARD APIs
# ============================================

@jwt_required
def get_system_stats():
    """
    Get comprehensive system statistics (admin dashboard)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # User statistics
        total_users = User.query.filter_by(is_deleted=False).count()
        active_users = User.query.filter_by(is_deleted=False, is_active=True).count()
        inactive_users = total_users - active_users

        # Project statistics
        total_projects = Project.query.filter_by(is_deleted=False).count()
        active_projects = Project.query.filter(
            Project.is_deleted == False,
            func.lower(Project.status) == 'active'
        ).count()
        completed_projects = Project.query.filter(
            Project.is_deleted == False,
            func.lower(Project.status) == 'completed'
        ).count()
        pending_projects = Project.query.filter(
            Project.is_deleted == False,
            func.lower(Project.status) == 'pending'
        ).count()

        # BOQ statistics
        from models.boq import BOQ
        total_boqs = BOQ.query.filter_by(is_deleted=False).count()
        pending_boqs = BOQ.query.filter_by(is_deleted=False, status='pending').count()
        approved_boqs = BOQ.query.filter_by(is_deleted=False, status='approved').count()

        # Role distribution
        role_distribution = db.session.query(
            Role.role,
            func.count(User.user_id).label('count')
        ).join(
            User, Role.role_id == User.role_id
        ).filter(
            User.is_deleted == False
        ).group_by(Role.role).all()

        roles_stats = [{"role": role, "count": count} for role, count in role_distribution]

        # Recent activity (last 30 days)
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        new_users_30d = User.query.filter(
            User.is_deleted == False,
            User.created_at >= thirty_days_ago
        ).count()
        new_projects_30d = Project.query.filter(
            Project.is_deleted == False,
            Project.created_at >= thirty_days_ago
        ).count()

        return jsonify({
            "users": {
                "total": total_users,
                "active": active_users,
                "inactive": inactive_users,
                "new_last_30d": new_users_30d
            },
            "projects": {
                "total": total_projects,
                "active": active_projects,
                "completed": completed_projects,
                "pending": pending_projects,
                "new_last_30d": new_projects_30d
            },
            "boq": {
                "total": total_boqs,
                "pending": pending_boqs,
                "approved": approved_boqs
            },
            "role_distribution": roles_stats,
            "system_health": 98.5  # Placeholder - can be calculated from actual metrics
        }), 200

    except Exception as e:
        log.error(f"Error fetching system stats: {str(e)}")
        return jsonify({"error": f"Failed to fetch system stats: {str(e)}"}), 500


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

        # Get recent users (last created)
        recent_users = User.query.filter_by(is_deleted=False).order_by(
            desc(User.created_at)
        ).limit(10).all()

        # Get recent projects
        recent_projects = Project.query.filter_by(is_deleted=False).order_by(
            desc(Project.created_at)
        ).limit(10).all()

        activities = []

        # Add user activities
        for user in recent_users:
            role = Role.query.filter_by(role_id=user.role_id).first()
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
# HELPER FUNCTION
# ============================================

def get_all_sitesupervisor():
    """Legacy function - Get all site engineers"""
    try:
        # Get the siteEngineer role
        role = Role.query.filter_by(role='siteEngineer').first()

        if not role:
            return jsonify({"error": "Site Engineer role not found"}), 404

        # Get all users with siteEngineer role
        get_user = User.query.filter_by(role_id=role.role_id, is_deleted=False).all()

        # Build response
        sitesupervisor_details = []
        for user in get_user:
            if user:
                sitesupervisor_details.append({
                    "user_id": user.user_id,
                    "user_name": user.full_name,
                    "role": role.role,
                    "user_status": user.user_status,
                    "phone": user.phone,
                    "department": user.department,
                    "is_active": user.is_active,
                    "is_deleted": user.is_deleted,
                    "last_login": user.last_login.isoformat() if user.last_login else None,
                    "created_at": user.created_at.isoformat() if user.created_at else None,
                    "last_modified_at": user.last_modified_at.isoformat() if user.last_modified_at else None
                })

        return jsonify({
            "sitesupervisor_details": sitesupervisor_details
        }), 200

    except Exception as e:
        log.error(f"Error fetching sitesupervisor: {str(e)}")
        return jsonify({"error": f"Failed to fetch sitesupervisor: {str(e)}"}), 500

# ============================================
# PROJECT MANAGER & SITE ENGINEER APIs
# ============================================

@jwt_required
def get_all_project_managers():
    """
    Get all project managers with their project counts (admin only)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Get the projectManager role
        pm_role = Role.query.filter_by(role='projectManager').first()

        if not pm_role:
            return jsonify({"error": "Project Manager role not found"}), 404

        # Get all users with projectManager role
        project_managers = User.query.filter_by(
            role_id=pm_role.role_id,
            is_deleted=False,
            is_active=True
        ).all()

        pm_list = []
        for pm in project_managers:
            # Count projects assigned to this PM
            project_count = Project.query.filter_by(
                user_id=pm.user_id,
                is_deleted=False
            ).count()

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
            "project_managers": pm_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching project managers: {str(e)}")
        return jsonify({"error": f"Failed to fetch project managers: {str(e)}"}), 500


@jwt_required
def get_all_site_engineers():
    """
    Get all site engineers with their project counts (admin only)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Get the siteEngineer role
        se_role = Role.query.filter_by(role='siteEngineer').first()

        if not se_role:
            return jsonify({"error": "Site Engineer role not found"}), 404

        # Get all users with siteEngineer role
        site_engineers = User.query.filter_by(
            role_id=se_role.role_id,
            is_deleted=False,
            is_active=True
        ).all()

        se_list = []
        for se in site_engineers:
            # Count projects assigned to this SE
            project_count = Project.query.filter_by(
                site_supervisor_id=se.user_id,
                is_deleted=False
            ).count()

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
            "site_engineers": se_list
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

        # Paginate
        total = query.count()
        boqs = query.limit(per_page).offset((page - 1) * per_page).all()

        boq_list = []
        for boq in boqs:
            # Get project info
            project = Project.query.filter_by(project_id=boq.project_id).first()
            
            # Get creator info
            creator = User.query.filter_by(user_id=boq.created_by).first()

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
