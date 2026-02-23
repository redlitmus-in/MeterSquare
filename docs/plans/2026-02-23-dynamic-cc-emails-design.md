# Dynamic CC Email Management

## Overview
Replace hardcoded CC email list in VendorEmailModal with a database-backed system. Admin sets company-wide defaults (locked for buyers). Each buyer can add/remove their own custom CC recipients, persisted per-buyer. Typeahead dropdown searches system users and allows free-type emails.

## Database

### Table: `email_cc_defaults` (Admin-managed)
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| email | VARCHAR(255) | Unique, not null |
| name | VARCHAR(255) | Display name |
| is_active | BOOLEAN | Default true, soft delete |
| created_by | INTEGER | Admin user who added |
| created_at | TIMESTAMP | Default now() |

### Table: `buyer_cc_recipients` (Per-buyer custom)
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| buyer_user_id | INTEGER FK | References users.user_id |
| email | VARCHAR(255) | Not null |
| name | VARCHAR(255) | Display name |
| is_active | BOOLEAN | Default true, soft delete |
| created_at | TIMESTAMP | Default now() |
| **Unique constraint** | | (buyer_user_id, email) where is_active=true |

## API Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/email/cc-defaults` | Any auth user | Get admin CC defaults |
| POST | `/api/admin/email/cc-defaults` | Admin only | Add default CC |
| DELETE | `/api/admin/email/cc-defaults/:id` | Admin only | Remove default CC |
| GET | `/api/buyer/cc-recipients` | Buyer | Get buyer's custom CCs |
| POST | `/api/buyer/cc-recipients` | Buyer | Add custom CC |
| DELETE | `/api/buyer/cc-recipients/:id` | Buyer | Remove custom CC |
| GET | `/api/users/search?q=` | Any auth user | Search users for typeahead |

## Frontend Changes

### VendorEmailModal.tsx
- Remove hardcoded `defaultCcEmails` array
- On open: fetch GET `/api/email/cc-defaults` + GET `/api/buyer/cc-recipients`
- Admin defaults: shown with lock icon, always checked, not removable
- Buyer customs: shown with X button, removable (calls DELETE endpoint)
- Add CC input: typeahead searching `/api/users/search?q=`, plus free-type option
- On select from dropdown: POST `/api/buyer/cc-recipients` to persist immediately
- On send: merge admin defaults + buyer customs into cc_emails payload

## Migration
- Seed `email_cc_defaults` with the 7 existing hardcoded emails
- `buyer_cc_recipients` starts empty

## Data Flow
1. Modal opens -> parallel fetch admin defaults + buyer CCs
2. Admin defaults rendered as locked checkboxes
3. Buyer types -> debounced search -> dropdown shows system users + free-type
4. Buyer selects -> POST saves to DB -> added to list with X button
5. Buyer clicks X -> DELETE soft-removes -> removed from list
6. On email send -> merge both lists -> send as cc_emails
