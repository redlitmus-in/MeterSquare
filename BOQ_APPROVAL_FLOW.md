# BOQ Approval Workflow - Complete Flow

## Overview
This document describes the complete BOQ approval workflow enforcing the sequence:
**Estimator → PM → Estimator → TD → Estimator → Client**

---

## Workflow Diagram

```
┌──────────────┐
│  ESTIMATOR   │ Creates BOQ (status: Draft)
└──────┬───────┘
       │
       ▼ Sends to PM (for APPROVAL only, NO assignment)
┌──────────────┐
│     PM       │ Reviews BOQ (status: Pending_PM_Approval)
└──────┬───────┘
       │
       ├─── Approves ──────► status: PM_Approved (PM NOT assigned yet)
       │
       └─── Rejects ───────► status: PM_Rejected (back to Estimator)
       │
       ▼ (If Approved)
┌──────────────┐
│  ESTIMATOR   │ Receives PM approval
└──────┬───────┘
       │
       ▼ Sends to TD (for APPROVAL only, NO assignment)
┌──────────────┐
│      TD      │ Reviews BOQ (status: Pending_TD_Approval)
└──────┬───────┘
       │
       ├─── Approves ──────► status: Approved
       │
       └─── Rejects ───────► status: Rejected (back to Estimator)
       │
       ▼ (If Approved)
┌──────────────┐
│  ESTIMATOR   │ Can now send to client
└──────┬───────┘
       │
       ▼ Sends to Client
┌──────────────┐
│    CLIENT    │ Reviews BOQ (status: Sent_for_Confirmation)
└──────┬───────┘
       │
       ├─── Confirms ──────► status: Client_Confirmed
       │                     ▼
       │                  ┌──────────────┐
       │                  │      TD      │ NOW TD can assign PM to project
       │                  └──────┬───────┘
       │                         │
       │                         ▼ Assigns PM
       │                  ┌──────────────┐
       │                  │     PM       │ PM gets assigned to project
       │                  └──────────────┘
       │
       └─── Rejects ────────► status: Client_Rejected
```

**CRITICAL NOTES**:
- ✅ When Estimator sends to PM: PM only **APPROVES/REJECTS**, NOT assigned to project
- ✅ When Estimator sends to TD: TD only **APPROVES/REJECTS**, NOT assigned to project
- ✅ PM gets **ASSIGNED** to project ONLY after client approval via TD's "Team Assignment" page
- ✅ TD cannot assign PM unless BOQ status is `Client_Confirmed`

---

## Status Definitions

| Status | Description | Who Can See | Actions Available |
|--------|-------------|-------------|-------------------|
| **Draft** | Initial BOQ creation | Estimator | Edit, Delete, Send to PM |
| **Pending_PM_Approval** | Sent to PM for review | Estimator, PM | PM: Approve/Reject |
| **PM_Approved** | PM has approved | Estimator | Send to TD |
| **PM_Rejected** | PM has rejected | Estimator | Edit, Resend to PM |
| **Pending_TD_Approval** | Sent to TD for review | Estimator, TD | TD: Approve/Reject |
| **Approved** | TD has approved (final) | Estimator | Send to Client |
| **Rejected** | TD has rejected | Estimator | Edit, Resubmit |
| **Sent_for_Confirmation** | Sent to client | Estimator, Client | Wait for client response |
| **Client_Confirmed** | Client approved | Estimator | Start project |
| **Client_Rejected** | Client rejected | Estimator | Revise and resubmit |

---

## Backend Implementation

### 1. Estimator Controller (`estimator_controller.py`)

#### New Function: `send_boq_to_technical_director()`
- **Endpoint**: `POST /api/boq/send_to_td`
- **Purpose**: Send PM-approved BOQ to TD
- **Validation**: BOQ status must be `PM_Approved`
- **Action**: Sets status to `Pending_TD_Approval`
- **Returns**: Success/error message

#### Modified Function: `send_boq_to_project_manager()`
- **Endpoint**: `POST /api/boq/send_to_pm`
- **Change**:
  - Now sets status to `Pending_PM_Approval` (was `Pending`)
  - **REMOVED**: Project assignment logic (lines 379-382)
  - PM is NOT assigned to project when BOQ is sent for approval

### 2. Project Manager Controller (`projectmanager_controller.py`)

#### Modified Function: `send_boq_to_estimator()`
- **Endpoint**: `POST /api/pm/boq/send_to_estimator`
- **Change**:
  - If approved: Sets status to `PM_Approved`
  - If rejected: Sets status to `PM_Rejected`
- **Previous**: Set to generic `approved` or `rejected`

### 3. Technical Director Controller (`techical_director_controller.py`)

#### Existing Function: `td_mail_send()`
- **Endpoint**: `POST /api/td/boq/approve_reject`
- **No changes needed**: Already handles `Pending_TD_Approval` status correctly
- **Action**:
  - If approved: Sets to `Approved`
  - If rejected: Sets to `Rejected`

### 4. Project Manager Controller - Team Assignment (`projectmanager_controller.py`)

#### Modified Function: `assign_projects()`
- **Endpoint**: `POST /api/assign_projects`
- **Purpose**: TD assigns PM to project (actual assignment happens here)
- **Validation Added**:
  ```python
  # Validate that all projects have Client_Confirmed BOQs
  for boq in boqs:
      if boq.status not in ['Client_Confirmed', 'approved']:
          return error("Cannot assign PM. BOQ must be client-approved first")
  ```
- **When**: ONLY after client approval (status: `Client_Confirmed`)
- **Who**: Technical Director only
- **Action**: Sets `project.user_id = pm_id` to assign PM

### 5. Send BOQ to Client (`send_boq_client.py`)

#### Modified Function: `send_boq_to_client()`
- **Endpoint**: `POST /api/send_boq_to_client`
- **Validation Added**:
  ```python
  if boq.status != "Approved":
      return error("BOQ must be approved by PM and TD first")
  ```
- **Purpose**: Prevent sending to client without full approval

---

## Frontend Implementation

### 1. Estimator Service (`estimatorService.ts`)

#### New Method: `sendBOQToTechnicalDirector()`
```typescript
async sendBOQToTechnicalDirector(
  boqId: number,
  technicalDirectorId?: number
): Promise<{success: boolean; message: string}>
```

### 2. Updated Types (`types/index.ts`)

```typescript
export type BOQStatus =
  | 'Draft'
  | 'Pending_PM_Approval'
  | 'PM_Approved'
  | 'PM_Rejected'
  | 'Pending_TD_Approval'
  | 'Approved'
  | 'Rejected'
  | 'Sent_for_Confirmation'
  | 'Client_Confirmed'
  | 'Client_Rejected';
```

### 3. EstimatorHub UI Updates (Needed)

The EstimatorHub component needs to show conditional buttons based on BOQ status:

```typescript
// Conditional button rendering based on status
{boq.status === 'Draft' && (
  <Button onClick={() => sendToPM(boq.boq_id)}>
    Send to PM
  </Button>
)}

{boq.status === 'PM_Approved' && (
  <Button onClick={() => sendToTD(boq.boq_id)}>
    Send to TD
  </Button>
)}

{boq.status === 'Approved' && (
  <Button onClick={() => sendToClient(boq.boq_id)}>
    Send to Client
  </Button>
)}

{(boq.status === 'PM_Rejected' || boq.status === 'Rejected') && (
  <Badge variant="destructive">Rejected</Badge>
  <Button onClick={() => editAndResubmit(boq.boq_id)}>
    Edit & Resubmit
  </Button>
)}
```

---

## API Endpoints Summary

| Endpoint | Method | Role | Purpose | Status Change |
|----------|--------|------|---------|---------------|
| `/api/boq/send_to_pm` | POST | Estimator | Send BOQ to PM | Draft → Pending_PM_Approval |
| `/api/pm/boq/send_to_estimator` | POST | PM | Approve/Reject BOQ | Pending_PM_Approval → PM_Approved/PM_Rejected |
| `/api/boq/send_to_td` | POST | Estimator | Send to TD | PM_Approved → Pending_TD_Approval |
| `/api/td/boq/approve_reject` | POST | TD | Approve/Reject BOQ | Pending_TD_Approval → Approved/Rejected |
| `/api/send_boq_to_client` | POST | Estimator | Send to client | Approved → Sent_for_Confirmation |
| `/api/confirm_client_approval/:id` | PUT | Estimator | Confirm client approval | Sent_for_Confirmation → Client_Confirmed |

---

## Security & Validation

### Validation Rules

1. **Send to PM**: BOQ must be in `Draft` status
2. **Send to TD**: BOQ must be in `PM_Approved` status
3. **Send to Client**: BOQ must be in `Approved` status (both PM and TD approved)

### Error Messages

```json
{
  "error": "BOQ must be approved by Project Manager first. Current status: Draft"
}

{
  "error": "BOQ must be approved by Project Manager and Technical Director before sending to client. Current status: PM_Approved"
}
```

---

## Database Schema (BOQ Table)

```sql
CREATE TABLE boq (
    boq_id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES project(project_id),
    boq_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'Draft',
    -- Possible values:
    -- 'Draft', 'Pending_PM_Approval', 'PM_Approved', 'PM_Rejected',
    -- 'Pending_TD_Approval', 'Approved', 'Rejected',
    -- 'Sent_for_Confirmation', 'Client_Confirmed', 'Client_Rejected'
    revision_number INTEGER DEFAULT 0,
    email_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_modified_at TIMESTAMP,
    last_modified_by VARCHAR(100)
);
```

---

## Testing Checklist

- [ ] Estimator cannot send BOQ directly to TD without PM approval
- [ ] Estimator cannot send BOQ to client without PM+TD approval
- [ ] PM can approve/reject BOQ and it goes back to estimator
- [ ] TD can approve/reject BOQ and it goes back to estimator
- [ ] After PM approves, estimator can send to TD
- [ ] After TD approves, estimator can send to client
- [ ] Status badges show correct colors for each status
- [ ] Email notifications sent at each approval stage
- [ ] BOQ history tracks all approval actions

---

## Future Enhancements

1. **Parallel Approval**: Allow PM and TD to review simultaneously
2. **Multiple Approvers**: Support multiple PMs or TDs
3. **Deadline Tracking**: Add SLA for approval times
4. **Reminder Emails**: Auto-remind pending approvers
5. **Approval Comments**: Capture why approved/rejected
6. **Version Control**: Track BOQ changes between rejections

---

*Last Updated: 2025-10-14*
*Version: 1.0*
