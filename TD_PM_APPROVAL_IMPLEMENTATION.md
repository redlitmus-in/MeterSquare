# TD/PM Approval System Implementation Documentation

## Overview
This document outlines the implementation of a flexible approval system where Estimators can send BOQs to either Technical Directors (TD) or Project Managers (PM) for approval.

## Business Requirements

### Workflow Model: **Model B - SHARED Queue**
- Estimator chooses TD or PM when sending BOQ
- Selected person gets BOQ in their "Pending" queue
- **OTHER role can also see it** (both can approve if needed)
- Activity history shows who did what
- Allows flexibility for:
  - Backup if primary approver is busy
  - Verbal confirmation between TD and PM
  - Better visibility across roles

---

## Current Status: Phase 1 (TD Selection Only)

### ✅ Completed Work

#### 1. Database Schema Changes
**File:** `backend/models/boq.py`

Added new fields to BOQ model (lines 21-25):
```python
# Approver tracking (nullable for backward compatibility)
sent_to_user_id = db.Column(db.Integer, nullable=True)  # ID of TD/PM this was sent to
sent_to_role = db.Column(db.String(50), nullable=True)  # 'technical_director' or 'project_manager'
approved_by_user_id = db.Column(db.Integer, nullable=True)  # ID of user who approved
approved_by_name = db.Column(db.String(255), nullable=True)  # Name of user who approved
```

**Why nullable?**
- Backward compatibility with existing BOQs
- Existing BOQs won't break
- Can migrate data gradually

**Migration Required:** Yes (SQL script needed - see Pending Work section)

---

#### 2. Backend API - Fetch Technical Directors
**File:** `backend/controllers/estimator_controller.py` (lines 310-354)

```python
def get_technical_directors():
    """Get all active Technical Directors for BOQ assignment"""
```

**What it does:**
- Fetches all active Technical Directors from database
- Filters by: `role='technical_director'`, `is_active=True`, `is_deleted=False`
- Returns: `[{user_id, full_name, email, department}]`

**Route Registration Required:** Yes (see Pending Work)

---

### ⏳ Pending Work - Phase 1 (TD Selection)

#### 1. Database Migration Script
**File to create:** `backend/migrations/add_boq_approver_fields.sql`

```sql
-- Add approver tracking fields to BOQ table
ALTER TABLE boq
ADD COLUMN sent_to_user_id INTEGER,
ADD COLUMN sent_to_role VARCHAR(50),
ADD COLUMN approved_by_user_id INTEGER,
ADD COLUMN approved_by_name VARCHAR(255);

-- Add indexes for better query performance
CREATE INDEX idx_boq_sent_to_user ON boq(sent_to_user_id);
CREATE INDEX idx_boq_sent_to_role ON boq(sent_to_role);
CREATE INDEX idx_boq_approved_by_user ON boq(approved_by_user_id);

-- Optional: Add foreign key constraints
ALTER TABLE boq
ADD CONSTRAINT fk_boq_sent_to_user
FOREIGN KEY (sent_to_user_id) REFERENCES users(user_id);

ALTER TABLE boq
ADD CONSTRAINT fk_boq_approved_by_user
FOREIGN KEY (approved_by_user_id) REFERENCES users(user_id);
```

**When to run:** Before deploying frontend changes

---

#### 2. Register API Route
**File:** `backend/app.py` or route registration file

Add route:
```python
# In estimator routes section
app.route('/api/estimator/technical-directors', methods=['GET'])(estimator_controller.get_technical_directors)
```

**Alternative (if using Blueprint):**
```python
estimator_bp.route('/technical-directors', methods=['GET'])(get_technical_directors)
```

**Testing:**
```bash
curl http://localhost:5000/api/estimator/technical-directors
# Expected: {"success": true, "data": [{user_id, full_name, email}]}
```

---

#### 3. Frontend Service - Fetch TDs
**File to create/modify:** `frontend/src/roles/estimator/services/estimatorService.ts`

Add new method:
```typescript
async getTechnicalDirectors(): Promise<ApiResponse<any[]>> {
  try {
    const response = await fetch(`${this.baseUrl}/estimator/technical-directors`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return await response.json();
  } catch (error) {
    console.error('Error fetching TDs:', error);
    return { success: false, message: 'Failed to fetch Technical Directors' };
  }
}
```

---

#### 4. Frontend - TD Selection Dialog Component
**File to create:** `frontend/src/roles/estimator/components/SendBOQApproverModal.tsx`

**Component Structure:**
```tsx
interface SendBOQApproverModalProps {
  isOpen: boolean;
  onClose: () => void;
  boq: BOQ;
  onSend: (selectedTDId: number, selectedTDName: string) => void;
}

const SendBOQApproverModal = ({ isOpen, onClose, boq, onSend }) => {
  const [technicalDirectors, setTechnicalDirectors] = useState([]);
  const [selectedTD, setSelectedTD] = useState(null);
  const [isSending, setIsSending] = useState(false);

  // Fetch TDs on mount
  useEffect(() => {
    if (isOpen) {
      fetchTechnicalDirectors();
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send BOQ for Approval</DialogTitle>
          <DialogDescription>
            Select a Technical Director to review: "{boq.boq_name}"
          </DialogDescription>
        </DialogHeader>

        {/* TD Selection Dropdown */}
        <div className="space-y-4">
          <Label>Technical Director</Label>
          <Select value={selectedTD} onValueChange={setSelectedTD}>
            <SelectTrigger>
              <SelectValue placeholder="Select Technical Director..." />
            </SelectTrigger>
            <SelectContent>
              {technicalDirectors.map(td => (
                <SelectItem key={td.user_id} value={td.user_id}>
                  {td.full_name} - {td.department}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button onClick={handleSend} disabled={!selectedTD || isSending}>
              {isSending ? 'Sending...' : 'Send to TD'}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
```

**Where to use:**
- Replace current "Send to TD" button direct action
- Show this modal first, then send after TD selection

---

#### 5. Modify EstimatorHub - Send to TD Flow
**File:** `frontend/src/roles/estimator/pages/EstimatorHub.tsx`

**Current Flow (line ~547):**
```tsx
const handleSendToTD = async (project: any) => {
  // Directly sends to all TDs
  const response = await estimatorService.sendBOQEmail(boq.boq_id);
}
```

**New Flow:**
```tsx
// Add state for TD selection modal
const [showTDSelectionModal, setShowTDSelectionModal] = useState(false);
const [boqToSendToTD, setBoqToSendToTD] = useState(null);

// Updated handler
const handleSendToTD = async (project: any) => {
  const projectBoqs = boqs.filter(boq => boq.project?.project_id == project.project_id);
  if (projectBoqs.length === 0) {
    toast.error('No BOQ found');
    return;
  }

  // Open TD selection modal instead of sending directly
  setBoqToSendToTD(projectBoqs[0]);
  setShowTDSelectionModal(true);
};

// New handler for actual sending after TD selection
const handleSendToSelectedTD = async (selectedTDId: number, selectedTDName: string) => {
  try {
    const response = await estimatorService.sendBOQEmail(
      boqToSendToTD.boq_id,
      {
        td_user_id: selectedTDId,
        td_name: selectedTDName
      }
    );

    if (response.success) {
      toast.success(`BOQ sent to ${selectedTDName}`);
      setShowTDSelectionModal(false);
      await loadBOQs();
    }
  } catch (error) {
    toast.error('Failed to send BOQ');
  }
};

// Add modal in JSX
<SendBOQApproverModal
  isOpen={showTDSelectionModal}
  onClose={() => setShowTDSelectionModal(false)}
  boq={boqToSendToTD}
  onSend={handleSendToSelectedTD}
/>
```

**Also update these locations:**
- Line ~1832: "Send to TD" button in pending tab
- Line ~2010: "Send to TD" button in table view
- Line ~2976: "Send to Technical Director" in popup after edit

---

#### 6. Backend - Update Send BOQ Email Logic
**File:** `backend/controllers/boq_controller.py`

**Current Logic (line ~1110):**
```python
def send_boq_email(boq_id):
    # Gets TD email from request or sends to all TDs
    td_email = data.get('td_email')
```

**Updated Logic:**
```python
def send_boq_email(boq_id):
    try:
        data = request.get_json(silent=True) or {}

        # NEW: Get selected TD user ID
        td_user_id = data.get('td_user_id')
        td_name = data.get('td_name')

        boq = BOQ.query.filter_by(boq_id=boq_id).first()

        # ... existing email send logic ...

        if email_sent:
            # NEW: Save selected TD info
            boq.sent_to_user_id = td_user_id
            boq.sent_to_role = 'technical_director'
            boq.email_sent = True
            boq.status = new_status

            # Add to history
            action_data = {
                'action': 'sent_to_td',
                'sent_to_user_id': td_user_id,
                'sent_to_name': td_name,
                'timestamp': datetime.utcnow().isoformat()
            }

            db.session.commit()
```

---

#### 7. Backend - Update Approval Logic
**File:** `backend/controllers/techical_director_controller.py`

When TD approves BOQ, save who approved:

```python
def approve_boq(boq_id):
    # ... existing logic ...

    # NEW: Save approver info
    current_user = g.user  # From JWT token
    boq.approved_by_user_id = current_user['user_id']
    boq.approved_by_name = current_user['full_name']
    boq.status = 'Approved'

    db.session.commit()
```

---

#### 8. Frontend - Show "Sent to" Indicator
**File:** `frontend/src/roles/technical-director/pages/ProjectApprovals.tsx`

**Add to BOQ Card Display:**
```tsx
{/* Show who this was sent to */}
{estimation.sent_to_user_id && (
  <div className="flex items-center gap-1 text-xs text-gray-600">
    <UserIcon className="w-3 h-3" />
    <span>Sent to: {estimation.sent_to_name || 'TD'}</span>
  </div>
)}

{/* Show who approved */}
{estimation.approved_by_user_id && (
  <div className="flex items-center gap-1 text-xs text-green-600">
    <CheckIcon className="w-3 h-3" />
    <span>Approved by: {estimation.approved_by_name}</span>
  </div>
)}
```

---

#### 9. Update BOQ List API Response
**File:** `backend/controllers/estimator_controller.py` or wherever BOQ list is fetched

Include new fields in response:
```python
def get_boqs():
    boqs = BOQ.query.all()

    boq_list = [{
        'boq_id': boq.boq_id,
        # ... existing fields ...
        'sent_to_user_id': boq.sent_to_user_id,
        'sent_to_role': boq.sent_to_role,
        'approved_by_user_id': boq.approved_by_user_id,
        'approved_by_name': boq.approved_by_name
    } for boq in boqs]
```

---

## Phase 2: PM Selection (Future Implementation)

### Additional Requirements

#### 1. Fetch Project Managers API
**File:** `backend/controllers/estimator_controller.py`

```python
def get_project_managers():
    """Get all active Project Managers for BOQ assignment"""
    # Similar to get_technical_directors()
    # Filter by role='project_manager'
```

---

#### 2. Update Selection Dialog
**File:** `frontend/src/roles/estimator/components/SendBOQApproverModal.tsx`

Add role selection:
```tsx
<RadioGroup value={selectedRole} onValueChange={setSelectedRole}>
  <RadioGroupItem value="td">Technical Director</RadioGroupItem>
  <RadioGroupItem value="pm">Project Manager</RadioGroupItem>
</RadioGroup>

{/* Dynamic dropdown based on selected role */}
{selectedRole === 'td' ? (
  <TechnicalDirectorDropdown />
) : (
  <ProjectManagerDropdown />
)}
```

---

#### 3. Create PM Approval Page
**File to create:** `frontend/src/roles/project-manager/pages/BOQApprovals.tsx`

**Copy from:** `frontend/src/roles/technical-director/pages/ProjectApprovals.tsx`

**Changes:**
- Filter BOQs by: `sent_to_role === 'project_manager'` OR `status === 'pending'` (shared queue)
- Same approve/reject/revise buttons as TD
- Update API calls to PM-specific endpoints (if needed)

---

#### 4. PM Dashboard Navigation
**File:** `frontend/src/roles/project-manager/pages/ProjectManagerDashboard.tsx` (or similar)

Add new navigation item:
```tsx
<NavLink to="/pm/boq-approvals">
  <DocumentCheckIcon />
  BOQ Approvals
</NavLink>
```

---

#### 5. TD View of PM Approvals
**File:** `frontend/src/roles/technical-director/pages/ProjectApprovals.tsx`

Add new tab: "PM Approved Projects"

```tsx
<Tabs>
  <TabsList>
    <TabsTrigger value="pending">Pending</TabsTrigger>
    <TabsTrigger value="approved">Approved</TabsTrigger>
    {/* NEW TAB */}
    <TabsTrigger value="pm_approved">PM Approved</TabsTrigger>
  </TabsList>

  <TabsContent value="pm_approved">
    {/* Show BOQs where: */}
    {/* - sent_to_role === 'project_manager' */}
    {/* - status === 'Approved' */}
    {/* - approved_by_role === 'project_manager' */}
    {/* Read-only view, no approve/reject buttons */}
  </TabsContent>
</Tabs>
```

---

## Testing Checklist

### Phase 1 (TD Selection) Tests

#### Database
- [ ] Run migration script successfully
- [ ] Verify new columns exist in `boq` table
- [ ] Check indexes are created
- [ ] Test foreign key constraints

#### Backend API
- [ ] GET `/api/estimator/technical-directors` returns all TDs
- [ ] Response includes: user_id, full_name, email, department
- [ ] Only active TDs are returned (is_deleted=false, is_active=true)

#### Send BOQ Flow
- [ ] Estimator clicks "Send to TD" → Modal opens
- [ ] Dropdown shows all available TDs
- [ ] Can select a TD from list
- [ ] Click "Send" → BOQ sent successfully
- [ ] `sent_to_user_id` and `sent_to_role` saved in database
- [ ] Email goes to selected TD

#### TD Dashboard
- [ ] TD sees BOQ in "Pending" tab
- [ ] BOQ card shows "Sent to: [TD Name]"
- [ ] TD can approve/reject (existing flow)
- [ ] After approval, `approved_by_user_id` and `approved_by_name` saved

#### Activity History
- [ ] BOQ history shows "Sent to [TD Name]"
- [ ] Shows "Approved by [TD Name]" after approval
- [ ] Timestamps are correct

#### Backward Compatibility
- [ ] Existing BOQs (without new fields) still work
- [ ] Old BOQs display without errors
- [ ] Can approve/reject old BOQs normally

---

### Phase 2 (PM Selection) Tests

#### Backend API
- [ ] GET `/api/estimator/project-managers` returns all PMs
- [ ] PM approval API works same as TD

#### Send BOQ Flow
- [ ] Estimator can choose "TD" or "PM" radio button
- [ ] Dropdown updates based on role selection
- [ ] Can send to PM successfully
- [ ] `sent_to_role = 'project_manager'` saved

#### PM Dashboard
- [ ] PM sees BOQ in their "Pending" tab
- [ ] PM can approve/reject
- [ ] After PM approval, shows in Estimator's "Approved" tab

#### TD Monitoring
- [ ] TD sees PM-approved BOQs in "PM Approved" tab
- [ ] Shows: PM name, approval date, BOQ details
- [ ] No approve/reject buttons (read-only)

#### Shared Queue (Model B)
- [ ] Both TD and PM can see same BOQ
- [ ] Either one can approve
- [ ] First approval wins
- [ ] History shows who approved

---

## Configuration Options

### Option A: Strict Assignment (Not Recommended)
If you change your mind and want exclusive assignment:

**Changes Required:**
1. Filter TD dashboard: `WHERE sent_to_user_id = current_td_id`
2. Prevent other TDs from seeing BOQ
3. Add reassignment feature if TD unavailable

**Pros:** Clear ownership
**Cons:** Less flexible, can get stuck if person unavailable

---

### Option B: Shared Queue (Current Design - RECOMMENDED)
Both roles can see and approve:

**Current Implementation:**
1. No filtering - all TDs see all BOQs
2. `sent_to_user_id` is just a "suggestion"
3. Any TD can approve
4. History tracks who actually approved

**Pros:** Flexible, prevents bottlenecks
**Cons:** Need good communication between TDs

---

## Risk Mitigation

### 1. Multiple People Approve Same BOQ
**Scenario:** TD and PM both try to approve simultaneously

**Solution:**
```python
# Add database constraint
ALTER TABLE boq ADD CONSTRAINT check_single_approval
CHECK (
  (approved_by_user_id IS NULL) OR
  (status IN ('Approved', 'Rejected'))
);

# In code - check before approval
if boq.approved_by_user_id is not None:
    return {"error": "BOQ already approved by someone else"}
```

---

### 2. PM Unavailable After Assignment
**Scenario:** BOQ sent to PM, PM goes on leave

**Solution (Model B solves this!):**
- TD can also see and approve
- No need for reassignment feature
- Activity history shows TD approved instead of PM

---

### 3. Migration Fails
**Backup Plan:**
```bash
# Before migration
pg_dump metersquare_db > backup_before_boq_fields.sql

# If migration fails
psql metersquare_db < backup_before_boq_fields.sql
```

---

## Deployment Plan

### Step 1: Database Migration
```bash
# 1. Backup database
pg_dump production_db > backup_$(date +%Y%m%d).sql

# 2. Run migration on staging first
psql staging_db < migrations/add_boq_approver_fields.sql

# 3. Test on staging

# 4. Run on production during low-traffic hours
psql production_db < migrations/add_boq_approver_fields.sql
```

---

### Step 2: Deploy Backend
```bash
# 1. Deploy new backend code
git pull origin main
pip install -r requirements.txt

# 2. Restart backend server
systemctl restart metersquare-backend

# 3. Verify API endpoint works
curl http://localhost:5000/api/estimator/technical-directors
```

---

### Step 3: Deploy Frontend
```bash
# 1. Build with new changes
cd frontend
npm run build

# 2. Deploy build files
cp -r dist/* /var/www/metersquare/

# 3. Clear browser cache (important!)
# Users should hard-refresh: Ctrl+Shift+R
```

---

## Rollback Plan

If something goes wrong:

### 1. Rollback Frontend (Safe)
```bash
# Use previous build
cp -r /var/www/metersquare/backup/* /var/www/metersquare/
```

### 2. Rollback Backend (Safe)
```bash
git revert <commit-hash>
systemctl restart metersquare-backend
```

### 3. Rollback Database (DANGEROUS)
```bash
# Only if absolutely necessary
# Remove new columns
ALTER TABLE boq DROP COLUMN sent_to_user_id;
ALTER TABLE boq DROP COLUMN sent_to_role;
ALTER TABLE boq DROP COLUMN approved_by_user_id;
ALTER TABLE boq DROP COLUMN approved_by_name;
```

**Note:** Don't rollback DB if data already saved in new columns!

---

## Future Enhancements

### 1. Email Notifications
- Send email to ONLY selected TD (not all TDs)
- Include: "You have been selected by [Estimator] to review BOQ"

### 2. Reassignment Feature
- Allow TD to reassign to another TD
- Button: "Assign to Another TD"
- Tracks reassignment in history

### 3. Workload Balancing
- Show TD workload: "TD John: 5 pending BOQs"
- Suggest TD with least workload

### 4. Performance Metrics
- Track: Average time to approval per TD
- Show: "TD John approves faster than others"

### 5. Approval Delegation
- TD can mark "Out of Office"
- Auto-assign backup TD

---

## Support & Maintenance

### Common Issues

**Issue 1: "No Technical Directors found"**
- Check: Role table has `role='technical_director'`
- Check: Users table has users with that role_id
- Check: Users are `is_active=true`

**Issue 2: "Sent to: undefined" showing on card**
- Check: `sent_to_user_id` is being saved
- Check: API response includes new fields
- Check: User still exists (not deleted)

**Issue 3: "Cannot send BOQ"**
- Check: Migration ran successfully
- Check: Backend route is registered
- Check: CORS allows the endpoint

---

## Contact & Questions

For implementation questions:
- Backend issues: Check `boq_controller.py` logs
- Frontend issues: Check browser console
- Database issues: Check PostgreSQL logs

---

**Document Version:** 1.0
**Last Updated:** 2025-10-09
**Status:** Phase 1 Design Complete, Implementation Pending Approval
