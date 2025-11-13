# 📋 TD PROJECT ASSIGNMENT - ADD MEP SELECTION

**Status:** Final 5% - ~30 minutes
**File:** `frontend/src/roles/technical-director/services/tdService.ts`
**Page:** `frontend/src/roles/technical-director/pages/[Project Assignment Page]`

---

## 🎯 WHAT NEEDS TO BE DONE

Add MEP Supervisor selection to TD's project assignment page, similar to how PMs are assigned.

---

## STEP 1: Add `getAllMEPs()` Method to TD Service

**File:** `frontend/src/roles/technical-director/services/tdService.ts`

Add this method after the `getAllPMs()` method (around line 201):

```typescript
// Add this method after getAllPMs()
async getAllMEPs(): Promise<{ success: boolean; data?: any[]; message?: string }> {
  try {
    // Similar to getAllPMs but for MEP role
    const response = await apiClient.get('/all_users');  // Or create specific endpoint

    // Filter users with MEP role
    const allUsers = response.data.users || response.data || [];
    const mepUsers = allUsers.filter((user: any) => {
      const userRole = user.role?.toLowerCase() || '';
      return userRole === 'mep' || userRole === 'mep supervisor' || userRole === 'mep_supervisor';
    });

    // Format MEP data
    const formattedMEPs = mepUsers.map((mep: any) => ({
      user_id: mep.user_id,
      full_name: mep.full_name,
      email: mep.email,
      phone: mep.phone,
      is_active: mep.is_active === true
    }));

    return {
      success: true,
      data: formattedMEPs
    };
  } catch (error: any) {
    console.error('Get all MEPs error:', error.response?.data || error.message);
    return {
      success: false,
      data: [],
      message: error.response?.data?.error || 'Failed to load MEP Supervisors'
    };
  }
}
```

---

## STEP 2: Add `assignMEPsToProjects()` Method

Add this method after `assignProjectsToPM()` (around line 304):

```typescript
// Add this method after assignProjectsToPM()
async assignMEPsToProjects(mepIds: number | number[], projectIds: number[]): Promise<{ success: boolean; message: string }> {
  try {
    // Support both single mepId and multiple mepIds
    const payload = {
      mep_ids: Array.isArray(mepIds) ? mepIds : [mepIds],
      project_ids: projectIds
    };

    // Note: Backend needs to support this endpoint
    const response = await apiClient.post('/assign_mep_projects', payload);
    return {
      success: true,
      message: response.data.message || 'MEP Supervisors assigned successfully'
    };
  } catch (error: any) {
    console.error('Assign MEP projects error:', error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.error || 'Failed to assign MEP Supervisors'
    };
  }
}
```

---

## STEP 3: Update Project Assignment UI

**Find the project assignment page** (likely in `frontend/src/roles/technical-director/pages/`)

Look for where PMs are assigned and add MEP selection alongside it.

### Option A: If using a form component

```tsx
// Inside your project assignment form

// State for MEP selection
const [selectedMEPs, setSelectedMEPs] = useState<number[]>([]);
const [mepList, setMEPList] = useState<any[]>([]);

// Load MEP list on mount
useEffect(() => {
  const loadMEPs = async () => {
    const result = await tdService.getAllMEPs();
    if (result.success && result.data) {
      setMEPList(result.data);
    }
  };
  loadMEPs();
}, []);

// In your JSX, add this after PM selection:

{/* Existing PM Multi-Select */}
<div className="space-y-2">
  <label className="block text-sm font-medium text-gray-700">
    Assign Project Managers *
  </label>
  <Select
    multiple
    value={selectedPMs}
    onChange={(e) => setSelectedPMs(Array.from(e.target.selectedOptions, option => Number(option.value)))}
    className="w-full border rounded-lg px-3 py-2"
  >
    {pmList.map(pm => (
      <option key={pm.user_id} value={pm.user_id}>
        {pm.full_name} ({pm.email})
      </option>
    ))}
  </Select>
</div>

{/* NEW: MEP Multi-Select */}
<div className="space-y-2">
  <label className="block text-sm font-medium text-gray-700">
    Assign MEP Supervisor (Optional)
    <span className="text-xs text-gray-500 ml-2">- Can select multiple</span>
  </label>
  <Select
    multiple
    value={selectedMEPs}
    onChange={(e) => setSelectedMEPs(Array.from(e.target.selectedOptions, option => Number(option.value)))}
    className="w-full border rounded-lg px-3 py-2 border-cyan-300 focus:border-cyan-500"
  >
    {mepList.map(mep => (
      <option key={mep.user_id} value={mep.user_id}>
        {mep.full_name} ({mep.email})
      </option>
    ))}
  </Select>
  <p className="text-xs text-gray-500">
    Hold Ctrl/Cmd to select multiple MEP Supervisors
  </p>
</div>
```

### Option B: If using Shadcn/UI or custom components

```tsx
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';

// MEP Selection with badges
<div className="space-y-2">
  <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
    <Activity className="w-4 h-4 text-cyan-600" />
    Assign MEP Supervisor (Optional)
  </label>

  <div className="border rounded-lg p-3 space-y-2 bg-cyan-50/30">
    {mepList.length === 0 ? (
      <p className="text-sm text-gray-500">No MEP Supervisors available</p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {mepList.map(mep => (
          <Badge
            key={mep.user_id}
            variant={selectedMEPs.includes(mep.user_id) ? 'default' : 'outline'}
            className={`cursor-pointer transition-colors ${
              selectedMEPs.includes(mep.user_id)
                ? 'bg-cyan-600 hover:bg-cyan-700'
                : 'hover:bg-cyan-50'
            }`}
            onClick={() => {
              setSelectedMEPs(prev =>
                prev.includes(mep.user_id)
                  ? prev.filter(id => id !== mep.user_id)
                  : [...prev, mep.user_id]
              );
            }}
          >
            {mep.full_name}
          </Badge>
        ))}
      </div>
    )}
  </div>

  {selectedMEPs.length > 0 && (
    <p className="text-xs text-cyan-700">
      {selectedMEPs.length} MEP Supervisor(s) selected
    </p>
  )}
</div>
```

---

## STEP 4: Update Submit Handler

Update your project assignment submission to include MEP assignment:

```typescript
const handleAssignProject = async () => {
  try {
    if (!selectedProject || selectedPMs.length === 0) {
      toast.error('Please select a project and at least one Project Manager');
      return;
    }

    // Assign PMs
    const pmResult = await tdService.assignProjectsToPM(
      selectedPMs,
      [selectedProject.project_id]
    );

    if (!pmResult.success) {
      toast.error(pmResult.message);
      return;
    }

    // Assign MEPs (optional)
    if (selectedMEPs.length > 0) {
      const mepResult = await tdService.assignMEPsToProjects(
        selectedMEPs,
        [selectedProject.project_id]
      );

      if (!mepResult.success) {
        toast.warning(`PMs assigned, but MEP assignment failed: ${mepResult.message}`);
      } else {
        toast.success(`Project assigned to ${selectedPMs.length} PM(s) and ${selectedMEPs.length} MEP(s)`);
      }
    } else {
      toast.success(`Project assigned to ${selectedPMs.length} PM(s)`);
    }

    // Reset form
    setSelectedPMs([]);
    setSelectedMEPs([]);
    setSelectedProject(null);

    // Refresh data
    refetch();
  } catch (error: any) {
    toast.error('Failed to assign project');
    console.error(error);
  }
};
```

---

## STEP 5: Backend API Endpoint (if needed)

If the backend doesn't have `/assign_mep_projects` endpoint, add it:

**File:** `backend/routes/td_routes.py` or similar

```python
@td_routes.route('/assign_mep_projects', methods=['POST'])
@jwt_required
def assign_mep_to_projects():
    """Assign MEP Supervisors to projects"""
    try:
        data = request.get_json()
        mep_ids = data.get('mep_ids', [])
        project_ids = data.get('project_ids', [])

        if not mep_ids or not project_ids:
            return jsonify({"error": "MEP IDs and Project IDs are required"}), 400

        assigned_count = 0
        for project_id in project_ids:
            project = Project.query.filter_by(project_id=project_id).first()
            if project:
                # Update mep_supervisor_id as JSONB array
                project.mep_supervisor_id = mep_ids
                assigned_count += 1

        db.session.commit()

        return jsonify({
            "message": f"Successfully assigned {len(mep_ids)} MEP(s) to {assigned_count} project(s)",
            "assigned_projects": assigned_count
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
```

---

## 🎨 UI DESIGN GUIDELINES

### Visual Distinction
- **PM Section:** Blue colors (#243d8a)
- **MEP Section:** Cyan colors (#0891b2)

### Example Layout

```
┌─────────────────────────────────────────┐
│ 📋 Assign Project                      │
├─────────────────────────────────────────┤
│                                         │
│ Select Project *                        │
│ [Dropdown: Select project...]           │
│                                         │
│ 👥 Assign Project Managers *            │
│ ┌─────────────────────────────────────┐ │
│ │ [ ] John Smith (PM)                 │ │
│ │ [✓] Sarah Johnson (PM)              │ │
│ │ [✓] Mike Davis (PM)                 │ │
│ └─────────────────────────────────────┘ │
│ 2 Project Managers selected             │
│                                         │
│ ⚡ Assign MEP Supervisor (Optional)     │
│ ┌─────────────────────────────────────┐ │
│ │ [✓] Alex Rodriguez (MEP)            │ │
│ │ [ ] Emma Wilson (MEP)               │ │
│ └─────────────────────────────────────┘ │
│ 1 MEP Supervisor selected               │
│                                         │
│ [Cancel]           [Assign Project →]   │
└─────────────────────────────────────────┘
```

---

## ✅ TESTING CHECKLIST

- [ ] MEP list loads correctly
- [ ] Can select multiple MEPs
- [ ] Can deselect MEPs
- [ ] Submission works with PM only
- [ ] Submission works with PM + MEP
- [ ] MEP sees assigned project after assignment
- [ ] PM sees assigned project after assignment
- [ ] Other PMs/MEPs don't see the project
- [ ] Database shows correct `mep_supervisor_id` array

---

## 🔍 VERIFY IN DATABASE

After assignment:

```sql
-- Check project assignment
SELECT
  project_id,
  project_name,
  user_id AS pm_ids,
  mep_supervisor_id AS mep_ids
FROM project
WHERE project_id = YOUR_PROJECT_ID;

-- Expected result:
-- user_id: [10, 15, 20]  ← PM1, PM2, PM3
-- mep_supervisor_id: [25] ← MEP1
```

---

## 🎯 SUMMARY

**What you need to do:**
1. ✅ Add `getAllMEPs()` method to tdService.ts
2. ✅ Add `assignMEPsToProjects()` method to tdService.ts
3. ✅ Add MEP multi-select UI to project assignment page
4. ✅ Update submit handler to assign MEPs
5. ✅ (Optional) Add backend endpoint if not exists

**Time estimate:** 30 minutes
**Complexity:** Low (copy PM logic, change to MEP)

---

**🎉 AFTER THIS, MEP IMPLEMENTATION IS 100% COMPLETE!**
