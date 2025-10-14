# BOQ Approval Flow - Fix Summary

## Problem Fixed

**ISSUE**: When Estimator sent BOQ to PM for approval, the PM was being **assigned** to the project automatically. This was wrong.

**REQUIRED**: PM should only **approve/reject** the BOQ, NOT get assigned to the project.

---

## Correct Flow (Now Implemented)

```
1. Estimator creates BOQ (status: Draft)
   ↓
2. Estimator sends to PM for APPROVAL (PM NOT assigned)
   ↓
3. PM approves/rejects (status: PM_Approved or PM_Rejected)
   ↓ if approved
4. Estimator sends to TD for APPROVAL (TD NOT assigned)
   ↓
5. TD approves/rejects (status: Approved or Rejected)
   ↓ if approved
6. Estimator sends to Client
   ↓
7. Client approves (Estimator confirms → status: Client_Confirmed)
   ↓
8. NOW TD can assign PM to project via "Team Assignment" page
   ↓
9. PM gets assigned and project starts
```

---

## Files Changed

### Backend

#### 1. [estimator_controller.py](d:\laragon\www\MeterSquare\backend\controllers\estimator_controller.py)

**Line 379-382: REMOVED project assignment**
```python
# BEFORE (WRONG):
project.user_id = pm_id  # ❌ PM was assigned here
project.last_modified_by = current_user_name
project.last_modified_at = datetime.utcnow()

# AFTER (CORRECT):
# NOTE: PM is NOT assigned to project here - only after client approval and TD assignment
# ✅ No assignment happens
```

**Line 499-715: ADDED new function**
```python
def send_boq_to_technical_director():
    """Send PM-approved BOQ to Technical Director for final approval"""
    # Validates BOQ status is PM_Approved
    # Sets status to Pending_TD_Approval
    # Sends email to TD
```

**Line 374: CHANGED status**
```python
# BEFORE:
boq.status = 'Pending'

# AFTER:
boq.status = 'Pending_PM_Approval'
```

---

#### 2. [projectmanager_controller.py](d:\laragon\www\MeterSquare\backend\controllers\projectmanager_controller.py)

**Line 67-133: MODIFIED get_all_pm_boqs() to show approval requests**
```python
# BEFORE:
# Only showed BOQs for assigned projects (project.user_id = pm_id)

# AFTER:
# Shows BOQs for BOTH:
# 1. Assigned projects (project.user_id = pm_id)
# 2. Approval requests (BOQ history contains this PM as recipient)

# Query BOQ history to find BOQs sent to this PM for approval
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
```
**Purpose**: PM can now see BOQs sent for approval even if not assigned to project yet

**Line 634-637: CHANGED approval status**
```python
# BEFORE:
boq.status = boq_status  # Generic 'approved' or 'rejected'

# AFTER:
if boq_status == 'approved':
    boq.status = 'PM_Approved'  # Specific status
else:
    boq.status = 'PM_Rejected'
```

**Line 394-403: ADDED validation for assignment**
```python
# Validate that all projects have Client_Confirmed BOQs before TD can assign PM
for boq in boqs:
    if boq.status not in ['Client_Confirmed', 'approved']:
        return jsonify({
            "error": f"Cannot assign PM. BOQ '{boq.boq_name}' must be client-approved first. Current status: {boq.status}"
        }), 400
```

---

#### 3. [send_boq_client.py](d:\laragon\www\MeterSquare\backend\controllers\send_boq_client.py)

**Line 43-48: ADDED validation**
```python
# Validate BOQ is approved by both PM and TD before sending to client
if boq.status != "Approved":
    return jsonify({
        "success": False,
        "error": f"BOQ must be approved by Project Manager and Technical Director before sending to client. Current status: {boq.status}"
    }), 400
```

---

#### 4. [estimator_routes.py](d:\laragon\www\MeterSquare\backend\routes\estimator_routes.py)

**Line 43-46: ADDED new route**
```python
# BOQ Email Notification to Technical Director (after PM approval)
@estimator_routes.route('/boq/send_to_td', methods=['POST'])
@jwt_required
def send_boq_to_td_route():
    return send_boq_to_technical_director()
```

---

### Frontend

#### 1. [estimatorService.ts](d:\laragon\www\MeterSquare\frontend\src\roles\estimator\services\estimatorService.ts)

**Line 1334-1356: ADDED new method**
```typescript
async sendBOQToTechnicalDirector(
  boqId: number,
  technicalDirectorId?: number
): Promise<{success: boolean; message: string}>
```

---

#### 2. [types/index.ts](d:\laragon\www\MeterSquare\frontend\src\roles\estimator\types\index.ts)

**Line 6: UPDATED statuses**
```typescript
// BEFORE:
export type BOQStatus = 'Draft' | 'In_Review' | 'Approved' | 'Sent_for_Confirmation' | 'Rejected';

// AFTER:
export type BOQStatus =
  | 'Draft'
  | 'Pending_PM_Approval'  // NEW
  | 'PM_Approved'          // NEW
  | 'PM_Rejected'          // NEW
  | 'Pending_TD_Approval'  // NEW
  | 'Approved'
  | 'Rejected'
  | 'Sent_for_Confirmation'
  | 'Client_Confirmed'     // NEW
  | 'Client_Rejected';     // NEW
```

---

## Key Changes Summary

| What | Before | After |
|------|--------|-------|
| **Estimator sends to PM** | PM assigned to project ❌ | PM only approves, NOT assigned ✅ |
| **PM approval status** | `approved` | `PM_Approved` ✅ |
| **TD approval flow** | Direct from estimator | After PM approval ✅ |
| **TD assignment** | No validation | Only after `Client_Confirmed` ✅ |
| **Client send validation** | None | Must be `Approved` by TD ✅ |

---

## Status Flow Chart

```
Draft
  ↓ send_to_pm
Pending_PM_Approval
  ↓ PM approves
PM_Approved
  ↓ send_to_td
Pending_TD_Approval
  ↓ TD approves
Approved
  ↓ send_to_client
Sent_for_Confirmation
  ↓ client confirms
Client_Confirmed
  ↓ TD assigns PM (actual assignment)
PM gets assigned to project
```

---

## API Endpoints

| Endpoint | Method | Role | Action | Status Change |
|----------|--------|------|--------|---------------|
| `/api/boq/send_to_pm` | POST | Estimator | Send for PM approval | Draft → Pending_PM_Approval |
| `/api/pm/boq/send_to_estimator` | POST | PM | Approve/Reject | Pending_PM_Approval → PM_Approved/PM_Rejected |
| `/api/boq/send_to_td` | POST | Estimator | Send for TD approval | PM_Approved → Pending_TD_Approval |
| `/api/td/boq/approve_reject` | POST | TD | Approve/Reject | Pending_TD_Approval → Approved/Rejected |
| `/api/send_boq_to_client` | POST | Estimator | Send to client | Approved → Sent_for_Confirmation |
| `/api/confirm_client_approval/:id` | PUT | Estimator | Confirm client | Sent_for_Confirmation → Client_Confirmed |
| `/api/assign_projects` | POST | TD | Assign PM | Client_Confirmed → PM assigned |

---

## Testing Checklist

- [ ] Estimator sends BOQ to PM
- [ ] PM is NOT assigned to project after send
- [ ] PM can approve/reject BOQ
- [ ] Estimator receives PM approval notification
- [ ] Estimator can send PM-approved BOQ to TD
- [ ] TD can approve/reject BOQ
- [ ] Estimator receives TD approval notification
- [ ] Estimator can send TD-approved BOQ to client
- [ ] Estimator cannot send to client if not TD-approved
- [ ] Client approval confirmation works
- [ ] TD cannot assign PM if BOQ not Client_Confirmed
- [ ] TD can assign PM after Client_Confirmed
- [ ] PM receives assignment notification
- [ ] Project shows assigned PM in database

---

## Security Validations

### 1. Send to PM
```python
# No validation needed - can send from Draft
```

### 2. Send to TD
```python
if boq.status != 'PM_Approved':
    return error("BOQ must be approved by PM first")
```

### 3. Send to Client
```python
if boq.status != "Approved":
    return error("BOQ must be approved by PM and TD first")
```

### 4. Assign PM
```python
if boq.status not in ['Client_Confirmed', 'approved']:
    return error("Cannot assign PM. BOQ must be client-approved first")
```

---

## Database Impact

### BOQ Table
- `status` field now uses more specific values
- Values: `Draft`, `Pending_PM_Approval`, `PM_Approved`, `PM_Rejected`, `Pending_TD_Approval`, `Approved`, `Rejected`, `Sent_for_Confirmation`, `Client_Confirmed`, `Client_Rejected`

### Project Table
- `user_id` (PM assignment) only set AFTER client approval
- No longer set when BOQ sent for approval

### BOQHistory Table
- New action types:
  - `sent_to_pm` (approval request)
  - `sent_to_td` (approval request)
  - `client_confirmation`
  - `assigned_project_manager` (actual assignment)

---

## Migration Notes

If you have existing BOQs with status `Pending`, you may need to update them:

```sql
-- Update old 'Pending' status to new statuses based on context
UPDATE boq
SET status = 'Pending_PM_Approval'
WHERE status = 'Pending'
AND email_sent = TRUE;
```

---

*Last Updated: 2025-10-14*
*Fix Version: 2.0*
