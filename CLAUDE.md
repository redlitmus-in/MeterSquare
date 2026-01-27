# MeterSquare Project Memory

## Project Overview
**MeterSquare** is a comprehensive construction management platform built for managing Bill of Quantities (BOQ), vendor approvals, change requests, material delivery, and project estimation.

**Status**: Active Development
**Team**: Full-stack development team
**Environment**: Windows (Laragon), Git, Supabase

---

## Tech Stack

### Backend
- **Framework**: Python Flask
- **Database**: PostgreSQL (Supabase)
- **ORM**: SQLAlchemy
- **Authentication**: JWT-based
- **File Storage**: Supabase Storage
- **Virtual Environment**: `backend/venv/`

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **State Management**: React Context API
- **Routing**: React Router
- **UI Components**: Custom components + Material-UI patterns
- **Styling**: CSS Modules

### Infrastructure
- **Hosting**: Supabase (Database + Storage)
- **Version Control**: Git (GitHub)
- **Branches**:
  - `main` - Production
  - `develop` - Development
  - Feature branches from `develop`

---

## Project Structure

```
MeterSquare/
├── backend/
│   ├── app.py                    # Flask application entry
│   ├── models/                   # SQLAlchemy models
│   ├── controllers/              # API route controllers
│   ├── utils/                    # Helper functions
│   ├── migrations/               # Database migrations
│   ├── uploads/                  # Temporary file uploads
│   ├── venv/                     # Python virtual environment
│   └── requirements.txt          # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── components/           # React components
│   │   ├── pages/                # Page components
│   │   ├── utils/                # Frontend utilities
│   │   ├── api/                  # API client functions
│   │   └── App.jsx               # Main application
│   ├── dist/                     # Production build
│   ├── package.json              # Node dependencies
│   └── vite.config.js            # Vite configuration
│
└── .claude/                      # Claude Code configuration
    ├── settings.local.json       # Local permissions & hooks
    └── agents/                   # Custom agents
```

---

## Key Features & Workflows

### 1. BOQ Management
- Upload and parse BOQ Excel files
- Create BOQ templates
- Send BOQ to clients for approval
- Track BOQ versions and changes

### 2. Vendor System
- Vendor approval workflow
- Vendor selection for materials
- Purchase order generation (LPO)
- Vendor notifications via email

### 3. Change Requests (CR)
- Site supervisors can request changes
- Material-specific justifications
- PM/TD approval workflow
- Vendor selection for approved CRs
- Purchase completion tracking

### 4. Material Delivery
- Delivery note generation
- Return delivery notes for unused materials
- Material tracking and inventory

### 5. Notifications
- Email notifications for key events
- WhatsApp integration (planned)
- Real-time updates for stakeholders

---

## Database Schema (Key Tables)

### Core Tables
- `users` - User accounts and roles
- `projects` - Construction projects
- `boq` - Bill of Quantities
- `boq_items` - Individual BOQ line items
- `vendors` - Vendor information
- `change_requests` - Change request tracking
- `lpo` - Local Purchase Orders
- `delivery_notes` - Material delivery tracking

### Role Types
- **PM** (Project Manager / Production Manager)
- **TD** (Technical Director)
- **SE** (Site Engineer/Site Supervisor)
- **Estimator**
- **Buyer**
- **Vendor**

---

## Material Delivery Workflow (Enforced Store-Based Routing)

### Overview
**All materials purchased by buyers MUST route through M2 Store warehouse** for quality control and consolidated dispatch to sites. Direct-to-site delivery is deprecated.

### Complete Material Journey

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: PURCHASE COMPLETION (Buyer)                           │
├─────────────────────────────────────────────────────────────────┤
│ 1. Buyer completes CR purchase                                  │
│    ✓ System checks M2 Store availability (optional warning)     │
│    ✓ Sets delivery_routing = 'via_production_manager'           │
│    ✓ Sets store_request_status = 'pending_vendor_delivery'      │
│    ✓ Sets CR status = 'routed_to_store'                         │
│    ✓ Auto-creates Internal Material Request (IMR)               │
│    ✓ Notifies Production Manager about incoming delivery        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: VENDOR DELIVERY TO STORE (External)                   │
├─────────────────────────────────────────────────────────────────┤
│ 2. Vendor delivers materials to M2 Store warehouse              │
│ 3. Production Manager receives & inspects delivery              │
│    ✓ Updates vendor_delivered_to_store = True                   │
│    ✓ Updates store_request_status = 'delivered_to_store'        │
│    ✓ Notifies Buyer (milestone notification)                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: STORE TO SITE DISPATCH (Production Manager)           │
├─────────────────────────────────────────────────────────────────┤
│ 4. PM approves Internal Material Request                        │
│ 5. PM creates Material Delivery Note (DN) for site              │
│    ✓ Allocates materials from inventory_materials table         │
│    ✓ Records driver, vehicle, transport fee                     │
│ 6. PM issues DN (deducts from current_stock)                    │
│ 7. PM dispatches DN (status: IN_TRANSIT)                        │
│    ✓ Updates store_request_status = 'dispatched_to_site'        │
│    ✓ Notifies Buyer & Site Engineer                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: SITE DELIVERY & CONFIRMATION (Site Engineer)          │
├─────────────────────────────────────────────────────────────────┤
│ 8. Site Engineer receives delivery                              │
│ 9. SE confirms receipt (DN status = DELIVERED)                  │
│    ✓ Updates store_request_status = 'delivered_to_site'         │
│    ✓ Updates IMR status = 'FULFILLED'                           │
│    ✓ Notifies Buyer (completion notification)                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 5: RETURNS (Optional - Site Engineer)                    │
├─────────────────────────────────────────────────────────────────┤
│ 10. SE creates Return Delivery Note (RDN) for unused materials  │
│     ✓ Specifies condition: Good/Damaged/Defective               │
│ 11. Driver transports returns to M2 Store                       │
│ 12. PM confirms receipt (RDN status = RECEIVED)                 │
│     ✓ Good → Add to current_stock                               │
│     ✓ Damaged → Add to backup_stock                             │
│     ✓ Defective → Trigger disposal workflow                     │
└─────────────────────────────────────────────────────────────────┘
```

### Key Status Tracking Fields

**Change Request (change_requests table):**
- `delivery_routing` - Always 'via_production_manager' (enforced)
- `store_request_status` - Milestone tracking:
  - `pending_vendor_delivery` - Awaiting vendor to deliver to store
  - `delivered_to_store` - Vendor delivered, awaiting PM dispatch
  - `dispatched_to_site` - In transit to construction site
  - `delivered_to_site` - Completed delivery
- `vendor_delivered_to_store` - Boolean flag for vendor delivery confirmation
- `vendor_delivery_date` - When vendor delivered to warehouse
- `buyer_completion_notes` - Buyer notes at purchase completion

**Internal Material Request (internal_inventory_material_requests table):**
- `source_type` - 'from_vendor_delivery' (auto-created by buyer)
- `status` - 'awaiting_vendor_delivery' → 'PENDING' → 'APPROVED' → 'DISPATCHED' → 'FULFILLED'
- `vendor_delivery_confirmed` - Boolean flag
- `final_destination_site` - Which project site receives materials
- `routed_by_buyer_id` - Buyer who routed materials
- `routed_to_store_at` - Timestamp of routing

**Material Delivery Note (material_delivery_notes table):**
- `status` - DRAFT → ISSUED → IN_TRANSIT → DELIVERED (or PARTIAL)
- `delivery_note_number` - Sequential (MDN-2026-001 format)
- `vehicle_number`, `driver_name`, `driver_contact` - Transport tracking
- `transport_fee` - Transportation cost
- `dispatched_by`, `dispatched_at` - PM dispatch tracking
- `received_by`, `received_at`, `receiver_notes` - Site confirmation

**Return Delivery Note (return_delivery_notes table):**
- `status` - DRAFT → ISSUED → IN_TRANSIT → RECEIVED (or PARTIAL)
- `return_note_number` - Sequential (RDN-2026-001 format)
- `condition` - Good / Damaged / Defective
- `disposal_status` - For damaged items (pending_approval → disposed / repaired)

### API Endpoints for Material Flow

**Buyer Endpoints:**
- `POST /api/buyer/complete-purchase` - Complete purchase, auto-route to store
- `POST /api/inventory/check-availability` - Check M2 Store stock before completion
- `GET /api/buyer/material-status/<cr_id>` - Track material journey milestones *(planned)*

**Production Manager Endpoints:**
- `GET /api/inventory/internal_material_requests` - View pending material requests
- `POST /api/inventory/internal_material/<request_id>/approve` - Approve IMR
- `POST /api/inventory/delivery_notes` - Create Delivery Note for site dispatch
- `POST /api/inventory/delivery_note/<id>/issue` - Issue DN (deduct stock)
- `POST /api/inventory/delivery_note/<id>/dispatch` - Mark as dispatched
- `POST /api/inventory/return_delivery_note/<id>/confirm` - Confirm return receipt

**Site Engineer Endpoints:**
- `GET /api/inventory/my-delivery-notes` - View deliveries for assigned projects
- `POST /api/inventory/delivery_note/<id>/confirm` - Confirm delivery receipt
- `POST /api/inventory/return_delivery_notes` - Create return delivery note
- `GET /api/inventory/my-returnable-materials` - View returnable materials

### Availability Check Feature (NEW - Jan 2026)

**Purpose:** Before completing purchase, buyer can check if materials are available in M2 Store

**Endpoint:** `POST /api/inventory/check-availability`

**Request:**
```json
{
  "materials": [
    {
      "material_name": "Cement 50kg",
      "brand": "UltraTech",
      "size": "50kg",
      "quantity": 100
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "overall_available": false,
  "total_materials": 1,
  "available_count": 0,
  "unavailable_count": 1,
  "materials": [
    {
      "material_name": "Cement 50kg",
      "brand": "UltraTech",
      "size": "50kg",
      "requested_quantity": 100,
      "available_quantity": 75,
      "is_available": false,
      "shortfall": 25,
      "status": "insufficient_stock",
      "inventory_material_id": 42,
      "material_code": "MAT-2026-042"
    }
  ]
}
```

**Implementation:**
- Shows warning if materials unavailable, but allows completion (PM handles procurement)
- Supports fuzzy matching on material name
- Exact matching on brand/size if provided
- Returns inventory_material_id for linking

### Database Tables Reference

**Core Inventory Tables:**
- `inventory_materials` - Central material catalog with stock levels
  - `current_stock` - Primary usable stock
  - `backup_stock` - Damaged/partially usable stock
  - `min_stock_level` - Reorder trigger threshold

- `inventory_transactions` - All stock movements (PURCHASE, WITHDRAWAL)
  - Links to delivery_batch_ref for tracing
  - Records driver, vehicle, transport fee

- `material_delivery_notes` - Outbound deliveries (store → site)
- `delivery_note_items` - Individual materials in each DN

- `return_delivery_notes` - Return deliveries (site → store)
- `return_delivery_note_items` - Individual materials in each RDN

- `material_returns` - Legacy return tracking (being replaced by RDN system)

### Business Rules

1. **Mandatory Store Routing**: All new purchases route via M2 Store (no exceptions)
2. **Availability is Advisory**: Low stock shows warning but doesn't block completion
3. **Quality Control**: Production Manager inspects all vendor deliveries before dispatch
4. **Material Grouping**: One CR creates ONE grouped IMR (not individual requests per material)
5. **Stock Deduction**: Stock only deducted when DN is ISSUED (not on creation)
6. **Return Conditions**: Good returns go to current_stock, Damaged to backup_stock
7. **Disposal Approval**: Defective materials require TD approval for disposal

### Important Code Files

**Backend:**
- [buyer_controller.py:2276](/backend/controllers/buyer_controller.py#L2276) - `complete_purchase()` function (enforces routing)
- [inventory_controller.py:5416](/backend/controllers/inventory_controller.py#L5416) - `check_material_availability()` function
- [inventory_controller.py:2927](/backend/controllers/inventory_controller.py#L2927) - Delivery Note management
- [change_request.py](/backend/models/change_request.py) - CR model with routing fields
- [inventory.py](/backend/models/inventory.py) - All inventory-related models

**Frontend:**
- [buyerService.ts](/frontend/src/roles/buyer/services/buyerService.ts) - Buyer API integration
- [M2StorePurchaseFlow.tsx](/frontend/src/roles/buyer/components/M2StorePurchaseFlow.tsx) - Availability check UI (planned)

### Troubleshooting

**Issue: IMR not created after purchase completion**
- Check if CR has POChildren (they create their own grouped IMRs)
- Verify no duplicate IMRs exist for this CR (prevents double-creation)
- Check logs for "Created 1 grouped Internal Material Request for CR-{id}"

**Issue: Materials not showing in store inventory**
- Verify material added to `inventory_materials` table
- Check `is_deleted = False` and `current_stock > 0`
- Use material_code for unique identification

**Issue: Delivery Note stock deduction not working**
- DN must be in ISSUED status to deduct stock
- Check inventory_transaction_id is created and linked
- Verify sufficient current_stock available

**Issue: Returns not updating stock**
- RDN must be in RECEIVED status to add stock back
- Good condition → current_stock, Damaged → backup_stock
- Check return processing logs for condition-based routing

---

## Common Development Tasks

### Backend Development

```bash
# Activate virtual environment
cd backend
source venv/Scripts/activate  # Windows Git Bash

# Run Flask server
python app.py

# Run specific migration
python migrations/<migration_script>.py

# Install dependencies
pip install <package>
pip freeze > requirements.txt
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Development server (http://localhost:5173)
npm run dev

# Production build
npm run build

# Type checking
npm run type-check

# Linting
npm run lint
```

### Database Operations

```bash
# Connect to Supabase (Production)
PGPASSWORD=<password> psql -h aws-1-ap-south-1.pooler.supabase.com -U postgres.<ref> -d postgres -p 6543

# Connect to Supabase (Dev)
PGPASSWORD=<password> psql -h aws-0-ap-south-1.pooler.supabase.com -U postgres.<ref> -d postgres -p 6543

# Run Python scripts with DB connection
DATABASE_URL="postgresql://..." python <script>.py
```

---

## Important Code Patterns

### Backend Patterns

#### 1. Controller Structure
```python
from flask import Blueprint, request, jsonify
from models.<model> import <Model>

<feature>_bp = Blueprint('<feature>', __name__)

@<feature>_bp.route('/api/<endpoint>', methods=['GET', 'POST'])
def handle_request():
    # Input validation
    # Business logic
    # Database operations
    # Return JSON response
```

#### 2. Notification Helpers
```python
from utils.notification_helpers import (
    notify_vendor_approved,
    notify_cr_created,
    notify_pm_assigned_to_project
)
```

#### 3. Database Models
```python
from app import db

class Model(db.Model):
    __tablename__ = 'table_name'

    id = db.Column(db.Integer, primary_key=True)
    # ... columns

    def to_dict(self):
        return {
            # Serialization logic
        }
```

### Frontend Patterns

#### 1. API Calls
```javascript
// In src/api/<feature>.js
export const fetchData = async () => {
  const response = await fetch('/api/endpoint');
  return response.json();
};
```

#### 2. Component Structure
```javascript
import { useState, useEffect } from 'react';

function Component() {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    // Side effects
  }, [dependencies]);

  return (
    // JSX
  );
}
```

---

## Known Issues & Gotchas

### Backend
- **Database connections**: Always close connections after use
- **File uploads**: Files are temporarily stored in `backend/uploads/`
- **Environment variables**: Use `.env` file (NEVER commit it!)
- **CORS**: Configured in `app.py` for frontend origin

### Frontend
- **API URL**: Check if using local (`http://localhost:8000`) or production
- **File paths**: Use relative paths from src directory
- **State management**: Complex state lives in parent components
- **Build**: Run `npm run build` before deploying

### Database
- **Supabase connection**: Use pooler URL for production (port 6543)
- **Migrations**: Always test migrations on dev database first
- **Indexes**: Critical for performance on large BOQ tables

---

## Security Reminders

### Must Follow
- ✓ **NEVER** commit `.env` files or secrets
- ✓ Use parameterized queries (SQLAlchemy ORM handles this)
- ✓ Validate all user inputs before database operations
- ✓ Check user roles/permissions before sensitive operations
- ✓ Use HTTPS in production
- ✓ Sanitize file uploads (check extension, size, content type)

### Environment Variables
```bash
# Backend .env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_KEY=eyJhbGc...
JWT_SECRET_KEY=...
```

---

## Testing Strategy

### Backend Testing
- Unit tests for critical utilities
- Integration tests for API endpoints
- Database migration testing in dev environment

### Frontend Testing
- Component unit tests
- Integration tests for user flows
- Manual testing in dev environment

---

## Deployment Process

1. **Development**: Work on feature branch from `develop`
2. **Testing**: Test thoroughly in local environment
3. **Code Review**: Create PR to `develop`
4. **Merge**: Merge to `develop` after approval
5. **Production**: Merge `develop` → `main` for production release
6. **Build**: Run `npm run build` in frontend
7. **Deploy**: Upload backend and frontend/dist to server

---

## Recent Work & Context

### Completed Features
- ✓ Vendor approval system with notifications
- ✓ Change request workflow with material justifications
- ✓ LPO generation and terms configuration
- ✓ Return delivery note system
- ✓ Estimator notification system
- ✓ Performance optimizations (caching, pagination)

### Active Focus Areas
- Performance optimization (query efficiency)
- Code quality improvements
- Dead code removal
- Security hardening
- Documentation updates

---

## Cookbook Patterns Applied to MeterSquare

### 1. Extended Thinking
Use for complex architectural decisions, refactoring planning, and debugging multi-step issues.

### 2. Tool Use
- File processing for BOQ Excel uploads
- Email notifications with structured templates
- Database operations with transaction safety

### 3. Structured Outputs
All API responses follow consistent JSON structure:
```json
{
  "success": true,
  "data": {...},
  "message": "...",
  "error": null
}
```

### 4. Agent Workflows
- BOQ processing pipeline (upload → parse → validate → store)
- Approval workflows (request → notify → approve/reject → notify)
- Material procurement (CR → approval → vendor selection → LPO → delivery)

---

## Team Conventions

### Commit Messages
```
feat(module): add new feature
fix(module): fix bug
docs: update documentation
refactor: code restructuring
perf: performance improvement
test: add tests
```

### Branch Naming
```
feature/<feature-name>
bugfix/<bug-description>
hotfix/<critical-fix>
```

### Code Review Checklist
- [ ] Code follows project patterns
- [ ] No hardcoded secrets or credentials
- [ ] Error handling is comprehensive
- [ ] Tests pass (if applicable)
- [ ] No dead code or debug statements
- [ ] Documentation updated if needed

---

## Quick Reference

### Start Development
```bash
# Terminal 1: Backend
cd backend && source venv/Scripts/activate && python app.py

# Terminal 2: Frontend
cd frontend && npm run dev
```

### Common Debugging
```bash
# Check Python syntax
python -m py_compile <file>.py

# Check JavaScript/TypeScript
npx eslint <file>.js
npm run type-check

# Database query debugging
# Add print(sqlalchemy query) in controller
```

### Git Shortcuts
```bash
git status
git add .
git commit -m "feat: description"
git push origin <branch>
```

---

_Last Updated: 2025-12-17_
_This file provides context for Claude Code when working on MeterSquare project_
