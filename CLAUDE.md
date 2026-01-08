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
- **PM** (Project Manager)
- **TD** (Technical Director)
- **SE** (Site Engineer/Site Supervisor)
- **Estimator**
- **Buyer**
- **Vendor**

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
