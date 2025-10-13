# Purchase Request Implementation Guide
## Clean Item-Based Extra Sub-Items Workflow

### ✅ Completed So Far

1. **Model Updated** - `backend/models/change_request.py`
   - Added item-based fields (item_id, item_name)
   - Added item overhead tracking fields
   - Added sub_items_data (JSONB)
   - Added has_new_sub_items, new_sub_item_reason
   - Added percentage_of_item_overhead
   - Updated to_dict() method

2. **Migration Created** - `backend/migrations/add_item_based_change_request_fields.sql`
   - SQL script to add all new fields
   - Includes indexes and comments

### 🔄 Next Steps - Implementation Order

#### Step 1: Run Database Migration
```bash
cd backend
psql -U username -d database_name -f migrations/add_item_based_change_request_fields.sql
```

Or using Python script (create `run_item_migration.py`):
```python
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv('DATABASE_URL'))

with open('migrations/add_item_based_change_request_fields.sql') as f:
    sql = f.read()
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()
```

#### Step 2: Update Overhead Calculator
**File**: `backend/services/overhead_calculator.py`

Add new method:
```python
@staticmethod
def calculate_item_overhead_impact(
    item_overhead_allocated: float,
    item_overhead_consumed_before: float,
    new_sub_items_cost: float
) -> Dict:
    """
    Calculate overhead impact for a specific BOQ item

    Args:
        item_overhead_allocated: Total overhead for the item
        item_overhead_consumed_before: Already consumed overhead
        new_sub_items_cost: Cost of new sub-items being requested

    Returns:
        dict: Item overhead analysis
    """
    item_overhead_available = item_overhead_allocated - item_overhead_consumed_before
    new_overhead_consumed = new_sub_items_cost
    remaining_after = item_overhead_available - new_overhead_consumed
    is_over_budget = remaining_after < 0

    # Calculate percentage of item overhead consumed
    percentage = (new_sub_items_cost / item_overhead_allocated * 100) if item_overhead_allocated > 0 else 0
    exceeds_40_percent = percentage > 40

    return {
        'item_overhead_allocated': round(item_overhead_allocated, 2),
        'item_overhead_consumed_before': round(item_overhead_consumed_before, 2),
        'item_overhead_available': round(item_overhead_available, 2),
        'sub_items_cost': round(new_sub_items_cost, 2),
        'new_overhead_consumed': round(new_overhead_consumed, 2),
        'remaining_after': round(remaining_after, 2),
        'is_over_budget': is_over_budget,
        'percentage_of_item': round(percentage, 2),
        'exceeds_40_percent': exceeds_40_percent
    }
```

#### Step 3: Update Workflow Service
**File**: `backend/services/change_request_workflow.py`

Add 40% threshold logic:
```python
@staticmethod
def determine_approval_route_by_percentage(change_request) -> Tuple[str, str]:
    """
    Determine approval route based on 40% threshold of ITEM overhead
    >40% → TD required
    ≤40% → Estimator only

    Args:
        change_request: ChangeRequest model instance

    Returns:
        tuple: (approval_required_from, next_approver_display_name)
    """
    percentage = change_request.percentage_of_item_overhead or 0

    if percentage > 40:
        log.info(f"CR {change_request.cr_id}: {percentage}% > 40% → Requires TD approval")
        return CR_CONFIG.ROLE_TECHNICAL_DIRECTOR, "Technical Director"
    else:
        log.info(f"CR {change_request.cr_id}: {percentage}% ≤ 40% → Estimator approval only")
        return CR_CONFIG.ROLE_ESTIMATOR, "Estimator"
```

Update `determine_next_approver_after_pm`:
```python
@staticmethod
def determine_next_approver_after_pm(change_request) -> Tuple[str, str]:
    """
    After PM approval, route based on percentage threshold
    """
    return ChangeRequestWorkflow.determine_approval_route_by_percentage(change_request)
```

#### Step 4: Create Assigned Projects API
**File**: `backend/controllers/assigned_projects_controller.py` (NEW)

```python
from flask import jsonify, g
from models.project import Project
from models.boq import BOQ, BOQDetails
from models.change_request import ChangeRequest
from config.logging import get_logger

log = get_logger()

def get_assigned_projects():
    """
    Get all projects assigned to current user (SE or PM)
    Returns projects with BOQ structure and item overhead details
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role_name', '').lower()

        # Get projects based on role
        if user_role in ['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor']:
            projects = Project.query.filter(
                Project.site_supervisor_id == user_id,
                Project.is_deleted == False
            ).all()
        elif user_role in ['projectmanager', 'project_manager']:
            projects = Project.query.filter(
                Project.user_id == user_id,
                Project.is_deleted == False
            ).all()
        else:
            return jsonify({"error": "Unauthorized role"}), 403

        projects_data = []
        for project in projects:
            # Get all BOQs for this project
            boqs = BOQ.query.filter(
                BOQ.project_id == project.project_id,
                BOQ.is_deleted == False,
                BOQ.email_sent == True
            ).all()

            boqs_data = []
            for boq in boqs:
                # Get BOQ details
                boq_details = BOQDetails.query.filter_by(
                    boq_id=boq.boq_id,
                    is_deleted=False
                ).first()

                if not boq_details or not boq_details.boq_details:
                    continue

                items = boq_details.boq_details.get('items', [])

                # Extract items with overhead information
                items_data = []
                for idx, item in enumerate(items):
                    item_id = f"item_{idx}"

                    # Get overhead info from item
                    overhead_allocated = item.get('overhead_amount', 0) or 0

                    # Calculate consumed overhead from approved change requests
                    consumed = db.session.query(
                        func.sum(ChangeRequest.materials_total_cost)
                    ).filter(
                        ChangeRequest.boq_id == boq.boq_id,
                        ChangeRequest.item_id == item_id,
                        ChangeRequest.status == 'approved',
                        ChangeRequest.is_deleted == False
                    ).scalar() or 0

                    available = overhead_allocated - consumed

                    # Get sub-items (materials and labour)
                    sub_items = []
                    for material in item.get('materials', []):
                        sub_items.append({
                            'name': material.get('material_name'),
                            'type': 'material',
                            'quantity': material.get('quantity'),
                            'unit': material.get('unit'),
                            'unit_price': material.get('unit_price')
                        })
                    for labour in item.get('labour', []):
                        sub_items.append({
                            'name': labour.get('labour_role'),
                            'type': 'labour',
                            'hours': labour.get('hours'),
                            'rate_per_hour': labour.get('rate_per_hour')
                        })

                    items_data.append({
                        'item_id': item_id,
                        'item_name': item.get('item_name'),
                        'description': item.get('description'),
                        'overhead_allocated': overhead_allocated,
                        'overhead_consumed': consumed,
                        'overhead_available': available,
                        'sub_items': sub_items
                    })

                boqs_data.append({
                    'boq_id': boq.boq_id,
                    'boq_name': boq.boq_name,
                    'status': boq.status,
                    'items': items_data
                })

            # Get areas/floors from project
            areas = []
            if project.floor_name:
                areas = [project.floor_name]
            if project.area:
                if project.area not in areas:
                    areas.append(project.area)

            projects_data.append({
                'project_id': project.project_id,
                'project_name': project.project_name,
                'location': project.location,
                'areas': areas,
                'boqs': boqs_data
            })

        return jsonify({
            "success": True,
            "projects": projects_data
        }), 200

    except Exception as e:
        log.error(f"Error fetching assigned projects: {str(e)}")
        return jsonify({"error": str(e)}), 500
```

**File**: `backend/routes/assigned_projects_routes.py` (NEW)

```python
from flask import Blueprint
from utils.authentication import jwt_required
from controllers.assigned_projects_controller import get_assigned_projects

assigned_projects_routes = Blueprint('assigned_projects_routes', __name__, url_prefix='/api')

@assigned_projects_routes.route('/projects/assigned-to-me', methods=['GET'])
@jwt_required
def get_assigned_projects_route():
    """Get all projects assigned to current user with BOQ structure"""
    return get_assigned_projects()
```

Register in `backend/config/routes.py`:
```python
from routes.assigned_projects_routes import assigned_projects_routes
app.register_blueprint(assigned_projects_routes)
```

#### Step 5: Update Change Request Controller
**File**: `backend/controllers/change_request_controller.py`

Update `create_change_request()` function:
```python
def create_change_request():
    """
    SE/PM creates a change request to add extra sub-items to a BOQ item

    Request body:
    {
        "boq_id": 123,
        "item_id": "item_0",
        "item_name": "Concrete Work",
        "justification": "Required due to design change",
        "sub_items": [
            {
                "sub_item_name": "Extra Cement",
                "quantity": 20,
                "unit": "bags",
                "unit_price": 400,
                "is_new": true,
                "reason": "Design change requires additional cement"
            }
        ]
    }
    """
    try:
        data = request.get_json()

        # Get current user
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_name = current_user.get('full_name') or current_user.get('username') or 'User'
        user_role = current_user.get('role_name', 'user')

        # Validate input
        boq_id = data.get('boq_id')
        item_id = data.get('item_id')
        item_name = data.get('item_name')
        justification = data.get('justification')
        sub_items = data.get('sub_items', [])

        if not boq_id or not item_id or not item_name:
            return jsonify({"error": "boq_id, item_id, and item_name are required"}), 400

        if not justification or justification.strip() == '':
            return jsonify({"error": "Justification is required"}), 400

        if not sub_items or len(sub_items) == 0:
            return jsonify({"error": "At least one sub-item is required"}), 400

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Get the specific item from BOQ
        items = boq_details.boq_details.get('items', [])
        item_index = int(item_id.split('_')[1]) if '_' in item_id else 0

        if item_index >= len(items):
            return jsonify({"error": "Item not found in BOQ"}), 404

        item = items[item_index]

        # Get item overhead information
        item_overhead_allocated = item.get('overhead_amount', 0) or 0

        # Calculate already consumed overhead from previous approved change requests
        from sqlalchemy import func
        consumed_overhead = db.session.query(
            func.sum(ChangeRequest.materials_total_cost)
        ).filter(
            ChangeRequest.boq_id == boq_id,
            ChangeRequest.item_id == item_id,
            ChangeRequest.status == 'approved',
            ChangeRequest.is_deleted == False
        ).scalar() or 0

        item_overhead_available = item_overhead_allocated - consumed_overhead

        # Calculate sub-items total cost
        sub_items_total_cost = 0.0
        has_new_sub_items = False
        new_sub_item_reasons = []

        processed_sub_items = []
        for sub_item in sub_items:
            quantity = float(sub_item.get('quantity', 0))
            unit_price = float(sub_item.get('unit_price', 0))
            total_price = quantity * unit_price
            sub_items_total_cost += total_price

            is_new = sub_item.get('is_new', False)
            if is_new:
                has_new_sub_items = True
                reason = sub_item.get('reason', '')
                if reason:
                    new_sub_item_reasons.append(f"{sub_item.get('sub_item_name')}: {reason}")

            processed_sub_items.append({
                'sub_item_name': sub_item.get('sub_item_name'),
                'quantity': quantity,
                'unit': sub_item.get('unit', 'nos'),
                'unit_price': unit_price,
                'total_price': total_price,
                'is_new': is_new,
                'reason': sub_item.get('reason', '') if is_new else None
            })

        # Calculate item overhead impact
        overhead_impact = overhead_calculator.calculate_item_overhead_impact(
            item_overhead_allocated,
            consumed_overhead,
            sub_items_total_cost
        )

        # Create change request
        change_request = ChangeRequest(
            boq_id=boq_id,
            project_id=boq.project_id,
            requested_by_user_id=user_id,
            requested_by_name=user_name,
            requested_by_role=user_role,
            request_type='EXTRA_SUB_ITEMS',
            justification=justification,
            status='pending',

            # Item reference
            item_id=item_id,
            item_name=item_name,

            # Item overhead
            item_overhead_allocated=item_overhead_allocated,
            item_overhead_consumed_before=consumed_overhead,
            item_overhead_available=item_overhead_available,

            # Sub-items
            sub_items_data=processed_sub_items,
            has_new_sub_items=has_new_sub_items,
            new_sub_item_reason='\\n'.join(new_sub_item_reasons) if new_sub_item_reasons else None,

            # Percentage calculation
            percentage_of_item_overhead=overhead_impact['percentage_of_item'],

            # Financial (for compatibility)
            materials_total_cost=sub_items_total_cost,
            overhead_consumed=overhead_impact['new_overhead_consumed'],

            # Legacy overhead fields (for backward compatibility)
            original_overhead_allocated=item_overhead_allocated,
            original_overhead_used=consumed_overhead,
            original_overhead_remaining=item_overhead_available,
            new_overhead_remaining=overhead_impact['remaining_after'],
            is_over_budget=overhead_impact['is_over_budget']
        )

        db.session.add(change_request)
        db.session.commit()

        log.info(f"Change request {change_request.cr_id} created for item {item_id} in BOQ {boq_id}")

        return jsonify({
            "success": True,
            "message": "Change request created successfully",
            "cr_id": change_request.cr_id,
            "status": "pending",
            "item": {
                "item_id": item_id,
                "item_name": item_name,
                "overhead_allocated": item_overhead_allocated,
                "overhead_available": item_overhead_available,
                "overhead_consumed_by_request": sub_items_total_cost,
                "percentage_of_overhead": overhead_impact['percentage_of_item'],
                "exceeds_40_percent": overhead_impact['exceeds_40_percent']
            },
            "sub_items_cost": sub_items_total_cost,
            "has_new_sub_items": has_new_sub_items,
            "will_go_to_td": overhead_impact['exceeds_40_percent'],
            "note": "Request created. Click 'Send for Review' to submit."
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating change request: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
```

### Frontend Implementation (Summary)

Due to token limits, here's the structure you need to implement:

#### Frontend Files to Create/Update:

1. **Create**: `frontend/src/components/change-requests/ExtraSubItemsForm.tsx`
   - Project dropdown (from assigned projects API)
   - Area dropdown
   - BOQ dropdown
   - Item dropdown
   - Sub-items multi-add with existing/new toggle
   - Live overhead calculations
   - Warning if >40% (will go to TD)

2. **Update**: `frontend/src/components/layout/ModernSidebar.tsx`
   - Add "Change Requests" menu item for SE and PM roles

3. **Create**: `frontend/src/components/boq/ExtraSubItemsSection.tsx`
   - Separate section in BOQ view
   - Shows extra sub-items grouped by change request
   - Shows overhead consumed per request

4. **Update**: `frontend/src/services/changeRequestService.ts`
   - Add `getAssignedProjects()` API call
   - Update `createChangeRequest()` for new structure

5. **Delete**: `frontend/src/components/modals/RequestExtraMaterialsModal.tsx`
   - No longer needed

### Testing Checklist

- [ ] Database migration runs successfully
- [ ] SE can see only their assigned projects
- [ ] PM can see only their assigned projects
- [ ] Project/Area/BOQ/Item dropdowns populate correctly
- [ ] Sub-items can be added (existing and new)
- [ ] Overhead calculations show correctly
- [ ] Warning shows when >40%
- [ ] SE request routes to PM
- [ ] PM request with ≤40% routes to Estimator
- [ ] PM request with >40% routes to TD
- [ ] TD approval routes to Estimator
- [ ] Estimator approval merges sub-items
- [ ] Extra sub-items display separately in BOQ view

### Summary

This is a complete redesign with:
✅ Item-based overhead calculation (not BOQ-wide)
✅ 40% threshold automatic routing
✅ Dropdown-driven form (no hardcoding)
✅ New sub-item reason tracking
✅ Separate display of extra purchases
✅ Clean, maintainable code structure

Continue implementation following this guide!