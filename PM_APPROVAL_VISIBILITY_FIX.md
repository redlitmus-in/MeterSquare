# PM Approval Visibility Fix

## Problem

When Estimator sent BOQ to PM for approval:
- ❌ PM could not see the BOQ
- **Reason**: PM was NOT assigned to project (we removed assignment to fix the flow)
- **Old logic**: `get_all_pm_boqs()` only showed BOQs for assigned projects

## Root Cause

```python
# OLD QUERY (projectmanager_controller.py:76-86)
assigned_projects = db.session.query(Project.project_id).filter(
    Project.user_id == user_id,  # ❌ Only assigned projects
    Project.is_deleted == False
).all()

query = db.session.query(BOQ).filter(
    BOQ.project_id.in_(project_ids)  # ❌ PM can't see BOQs for unassigned projects
)
```

**Issue**: Since PM is NOT assigned when sent for approval, `project.user_id` is `null`, so PM can't see the BOQ!

## Solution

Modified `get_all_pm_boqs()` to show BOQs from **two sources**:

1. **Assigned Projects** (existing logic)
2. **Approval Requests** (new logic) - Check BOQ history for this PM

### Implementation

```python
# NEW QUERY (projectmanager_controller.py:83-100)

# 1. Get BOQs for assigned projects (existing)
assigned_projects = db.session.query(Project.project_id).filter(
    Project.user_id == user_id,
    Project.is_deleted == False
).all()
project_ids = [p.project_id for p in assigned_projects]

# 2. Get BOQs sent to this PM for approval (NEW)
boqs_for_approval_query = db.session.execute(
    text("""
        SELECT DISTINCT bh.boq_id
        FROM boq_history bh,
             jsonb_array_elements(bh.action) AS action_item
        WHERE action_item->>'receiver_role' = 'project_manager'
          AND (action_item->>'recipient_user_id')::INTEGER = :user_id
          AND action_item->>'type' = 'sent_to_pm'
    """),
    {"user_id": user_id}
)
boq_ids_for_approval = [row[0] for row in boqs_for_approval_query]

# 3. Combine both sources
query = db.session.query(BOQ).filter(
    BOQ.is_deleted == False,
    BOQ.email_sent == True,
    db.or_(
        BOQ.project_id.in_(project_ids),      # Assigned projects
        BOQ.boq_id.in_(boq_ids_for_approval)  # Approval requests
    )
).order_by(BOQ.created_at.desc())
```

## How It Works

### Scenario 1: BOQ Sent for Approval (Not Assigned)

```json
{
  "boq_id": 216,
  "project_id": 107,
  "status": "Pending_PM_Approval",
  "user_id": null  // PM NOT assigned
}
```

**BOQ History**:
```json
{
  "boq_id": 216,
  "action": [
    {
      "type": "sent_to_pm",
      "receiver_role": "project_manager",
      "recipient_user_id": 45,  // PM's user_id
      "recipient_name": "John PM"
    }
  ]
}
```

✅ **Result**: PM (user_id=45) can see this BOQ via approval requests query

---

### Scenario 2: BOQ for Assigned Project

```json
{
  "boq_id": 220,
  "project_id": 110,
  "status": "Client_Confirmed",
  "user_id": 45  // PM IS assigned
}
```

✅ **Result**: PM (user_id=45) can see this BOQ via assigned projects query

---

### Scenario 3: Both Cases

PM can see BOQs that are:
- ✅ For projects assigned to them
- ✅ Sent to them for approval (even if not assigned)
- ✅ Both conditions at the same time

## Edge Cases Handled

### Empty Lists

```python
if not project_ids and not boq_ids_for_approval:
    # No projects assigned and no approval requests
    query = db.session.query(BOQ).filter(BOQ.boq_id == -1)  # No results

elif not project_ids:
    # Only approval requests
    query = db.session.query(BOQ).filter(BOQ.boq_id.in_(boq_ids_for_approval))

elif not boq_ids_for_approval:
    # Only assigned projects
    query = db.session.query(BOQ).filter(BOQ.project_id.in_(project_ids))

else:
    # Both - use OR condition
    query = db.session.query(BOQ).filter(
        db.or_(
            BOQ.project_id.in_(project_ids),
            BOQ.boq_id.in_(boq_ids_for_approval)
        )
    )
```

## Testing

### Test Case 1: Send for Approval
```
1. Estimator sends BOQ (boq_id=216) to PM (user_id=45)
2. PM logs in
3. PM calls GET /api/pm_boqs
4. ✅ BOQ 216 should appear in the list
5. ✅ Status should be "Pending_PM_Approval"
```

### Test Case 2: PM Approval
```
1. PM approves BOQ 216
2. Status changes to "PM_Approved"
3. PM calls GET /api/pm_boqs
4. ✅ BOQ 216 should still appear (via approval history)
```

### Test Case 3: Assigned Project
```
1. TD assigns PM (user_id=45) to project 110
2. PM calls GET /api/pm_boqs
3. ✅ All BOQs for project 110 should appear
```

### Test Case 4: Both
```
1. PM has assigned projects (110, 111)
2. PM has approval requests (BOQ 216, 217)
3. PM calls GET /api/pm_boqs
4. ✅ Should see BOQs for projects 110, 111 AND BOQs 216, 217
```

## Database Query Explanation

### JSONB Array Search

```sql
SELECT DISTINCT bh.boq_id
FROM boq_history bh,
     jsonb_array_elements(bh.action) AS action_item
WHERE action_item->>'receiver_role' = 'project_manager'
  AND (action_item->>'recipient_user_id')::INTEGER = :user_id
  AND action_item->>'type' = 'sent_to_pm'
```

**Breakdown**:
- `jsonb_array_elements(bh.action)`: Expands the `action` JSONB array into rows
- `action_item->>'receiver_role'`: Extracts `receiver_role` as text
- `(action_item->>'recipient_user_id')::INTEGER`: Extracts and casts `recipient_user_id` to integer
- `DISTINCT`: Ensures each BOQ appears only once

### Example Data

**BOQ History Table**:
| boq_id | action (JSONB array) |
|--------|----------------------|
| 216 | `[{"type": "sent_to_pm", "recipient_user_id": 45}]` |
| 217 | `[{"type": "sent_to_pm", "recipient_user_id": 46}]` |

**Query for user_id=45**:
```
Result: [216]
```

## Files Modified

- **[projectmanager_controller.py:67-133](d:\laragon\www\MeterSquare\backend\controllers\projectmanager_controller.py:67)**
  - Modified `get_all_pm_boqs()` function
  - Added JSONB query for approval requests
  - Added OR condition to combine assigned + approval BOQs

## Benefits

1. ✅ PM can see BOQs sent for approval
2. ✅ PM can approve/reject without being assigned
3. ✅ Maintains separation: approval ≠ assignment
4. ✅ PM still sees assigned project BOQs
5. ✅ No breaking changes to existing functionality

---

*Last Updated: 2025-10-14*
*Fix Version: 2.1*
