# MeterSquare API Optimization Tracker

## Root Cause Analysis

### Why is the live site slow?
The primary bottleneck is **server ↔ database network latency**:

| Setup | Latency per Query | pm_dashboard (18 queries) | Total |
|-------|------------------|--------------------------|-------|
| Current: Server → Supabase Mumbai | ~150-300ms | 18 × 200ms | ~3.6s |
| Germany server → Mumbai Supabase | ~150-200ms | 18 × 175ms | ~3.1s (WORSE than fixing code) |
| **Germany server → Frankfurt Supabase** | **~1-5ms** | **18 × 3ms** | **~54ms** ✅ |
| Localhost → Supabase Mumbai | ~150-200ms | 18 × 175ms | ~3.1s |

**Recommendation**: When buying the Germany server, also migrate Supabase to `eu-central-1` (Frankfurt).
This single change will drop response times from 4s → under 500ms WITHOUT any code changes.

---

## Phase 0: Global Fixes (Applied)

### 0.1 ✅ Remove `filter_sensitive_response_data` hook
- **File**: `backend/app.py`
- **Impact**: Removed 200-800ms per response (was parsing entire JSON response on every request)
- **Status**: DONE — hook removed, sensitive field filtering moved to model layer
  - `backend/models/worker.py` → `to_dict(is_admin=False)` pattern
  - `backend/models/login_history.py` → `to_dict(is_admin=False)` pattern
  - `backend/controllers/labour_requisition_controller.py` → passes `is_admin` flag
  - `backend/controllers/admin_controller.py` → passes `is_admin=True` for admin routes

### 0.2 ✅ Connection Pool Configuration
- **File**: `backend/config/db.py`
- **Status**: Already optimized — `pool_size=20`, `max_overflow=10`, `pool_pre_ping=True` for Supabase
- **No changes needed**

### 0.3 ⬜ Database Indexes
- **Files**: `backend/migrations/add_performance_indexes.py` + others exist
- **Status**: Migrations written but need to verify they've been applied to production DB
- **To check**: Run `python3 backend/migrations/verify_priority2_indexes.py` in backend env

---

## Phase 1: PM Dashboard Optimization

**Current**: `pm_dashboard` = 1.38-1.74s (localhost) / ~4s (live)
**Target**: Under 300ms (localhost) / Under 500ms (live with Frankfurt Supabase)

### Queries to combine:
The endpoint makes ~18 separate DB queries. Key ones to batch:

| Query | Current | Fix |
|-------|---------|-----|
| Projects list | 1 query | - |
| Change requests per project | N queries (N+1) | JOIN or subquery |
| BOQ count per project | N queries (N+1) | GROUP BY subquery |
| Notifications count | 1 query | Keep |
| User info | 1 query | Cache with JWT |

**File**: `backend/controllers/pm_dashboard_controller.py`
**Action**: Batch N+1 queries using SQLAlchemy eager loading or subqueries

---

## Phase 2: SE Dashboard Optimization

**File**: `backend/controllers/se_controller.py`
**Issue**: Similar N+1 pattern for projects + change requests

---

## Phase 3: Notifications Optimization

**Current**: `notifications` endpoint = 346ms
**File**: `backend/controllers/notification_controller.py`
**Fix**: Already has aggregated count query — verify it's being used

---

## Phase 4: Frontend Loading Optimization

**Issue**: First API call starts at ~5000ms due to bundle loading waterfall

### Steps:
1. Check chunk splitting in `frontend/vite.config.js`
2. Verify lazy loading for role-based routes
3. Check if `moment.js` or large libraries are imported without tree-shaking

**Files**: `frontend/vite.config.js`, `frontend/src/App.jsx`

---

## Phase 5: Buyer Endpoints

**Slowest buyer calls**: `complete-purchase`, `lpo-list`
**File**: `backend/controllers/buyer_controller.py` (2500+ lines — needs splitting)

---

## Performance Baseline (Captured from DevTools)

| Endpoint | Localhost Time | Live Time | Status |
|----------|---------------|-----------|--------|
| `/api/auth/self` | 525ms | ~2s | Baseline |
| `/api/notifications` | 346ms | ~1.5s | Baseline |
| `/api/pm/dashboard` | 1.38-1.74s | ~4s | Baseline |
| `/api/se/dashboard` | unknown | ~4s | Baseline |

---

## Quick Wins Summary

| Priority | Action | Expected Gain | Effort |
|----------|--------|---------------|--------|
| **#1 HIGHEST** | Move Supabase to Frankfurt (with Germany server) | 80-90% faster | Medium (migration) |
| #2 | Upgrade Supabase compute (Nano → Small, $25/mo) | 20-40% faster | Low (1 click) |
| #3 | Fix pm_dashboard N+1 queries | 40-60% faster | Medium (code) |
| #4 | Fix frontend bundle waterfall | First load 60% faster | Low (config) |
| #5 | Cache user/project data | 30-50% faster | Medium (code) |
| ✅ Done | Remove after_request hook | 200-800ms saved | Done |

---

## Migration Strategy: Mumbai → Frankfurt Supabase

When the Germany server is ready:

```bash
# 1. Create new Supabase project in eu-central-1 (Frankfurt)

# 2. Dump current database (run from any machine)
pg_dump "postgresql://postgres.<ref>:password@aws-1-ap-south-1.pooler.supabase.com:6543/postgres" \
  --no-owner --no-acl -F c -f metersquare_backup.dump

# 3. Restore to Frankfurt project
pg_restore "postgresql://postgres.<new-ref>:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" \
  --no-owner --no-acl -F c metersquare_backup.dump

# 4. Update .env on Germany server
DATABASE_URL=postgresql://postgres.<new-ref>:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# 5. Test and verify all data migrated correctly

# 6. Switch DNS to new server
```

**Supabase Storage** files (uploads, PDFs) will also need to be migrated via the Supabase dashboard → Storage → Download/Upload.

---

_Last Updated: 2026-03-11_
