# Security & Monitoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three admin security features: Force Logout (kill active sessions), Block/Unblock User (disable login without deleting), and Suspicious Activity Alerts (flag multi-IP logins and unusual hours).

**Architecture:**
- Force Logout uses a `token_blacklist` DB table + check in `jwt_required` decorator — immediate revocation without waiting for JWT expiry.
- Block/Unblock adds an `is_blocked` flag to the `users` table + check in OTP verification — blocked users cannot log in.
- Suspicious Activity runs on every `get_online_users` call and on login, writing alerts to the existing `Notification` model for the admin.

**Tech Stack:** Python/Flask, SQLAlchemy, PostgreSQL (Supabase), React 18, TypeScript, Lucide icons, existing `adminApi` service, existing `Notification` model.

---

## FEATURE 1: Force Logout

### Task 1: Add `token_blacklist` DB table (migration)

**Files:**
- Create: `backend/migrations/add_token_blacklist_table.py`

**Step 1: Write the migration**

```python
# backend/migrations/add_token_blacklist_table.py
"""
Migration: Add token_blacklist table
Purpose: Enable immediate JWT revocation for force logout
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app


def up():
    app = create_app()
    with app.app_context():
        db.engine.execute("""
            CREATE TABLE IF NOT EXISTS token_blacklist (
                id SERIAL PRIMARY KEY,
                jti VARCHAR(36) NOT NULL UNIQUE,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                blacklisted_at TIMESTAMP DEFAULT NOW() NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                reason VARCHAR(100) DEFAULT 'force_logout'
            );
            CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON token_blacklist(jti);
            CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);
        """)
        print("✅ Created token_blacklist table")


def down():
    app = create_app()
    with app.app_context():
        db.engine.execute("DROP TABLE IF EXISTS token_blacklist;")
        print("✅ Dropped token_blacklist table")


if __name__ == '__main__':
    up()
```

**Step 2: Run migration**
```bash
cd backend && source venv/bin/activate && python migrations/add_token_blacklist_table.py
```
Expected: `✅ Created token_blacklist table`

**Step 3: Commit**
```bash
git add backend/migrations/add_token_blacklist_table.py
git commit -m "feat(security): add token_blacklist migration for force logout"
```

---

### Task 2: Add `TokenBlacklist` model

**Files:**
- Create: `backend/models/token_blacklist.py`
- Modify: `backend/models/__init__.py`

**Step 1: Write the model**

```python
# backend/models/token_blacklist.py
from datetime import datetime
from config.db import db


class TokenBlacklist(db.Model):
    __tablename__ = 'token_blacklist'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    jti = db.Column(db.String(36), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    blacklisted_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    reason = db.Column(db.String(100), default='force_logout')

    @classmethod
    def is_blacklisted(cls, jti: str) -> bool:
        """Check if a token JTI is blacklisted and not yet expired."""
        entry = cls.query.filter_by(jti=jti).first()
        if not entry:
            return False
        if entry.expires_at < datetime.utcnow():
            # Expired blacklist entry — clean up and allow
            db.session.delete(entry)
            db.session.commit()
            return False
        return True

    @classmethod
    def add(cls, jti: str, user_id: int, expires_at: datetime, reason: str = 'force_logout'):
        entry = cls(jti=jti, user_id=user_id, expires_at=expires_at, reason=reason)
        db.session.add(entry)
        db.session.commit()

    @classmethod
    def cleanup_expired(cls):
        """Delete expired entries to keep the table small."""
        cls.query.filter(cls.expires_at < datetime.utcnow()).delete()
        db.session.commit()
```

**Step 2: Register in `__init__.py`**

Open `backend/models/__init__.py` and add:
```python
from models.token_blacklist import TokenBlacklist
# Update __all__ to include 'TokenBlacklist'
```

**Step 3: Commit**
```bash
git add backend/models/token_blacklist.py backend/models/__init__.py
git commit -m "feat(security): add TokenBlacklist model"
```

---

### Task 3: Add `jti` claim to JWT tokens + check blacklist in `jwt_required`

**Files:**
- Modify: `backend/utils/authentication.py` (JWT creation ~line 350, jwt_required ~line 534)

**Step 1: Add `jti` to token creation**

In `authentication.py`, find where the JWT payload is built (in `verification_otp` function, look for `jwt.encode`). Add a `jti` (JWT ID) field:

```python
import uuid as _uuid
# In the payload dict, add:
'jti': str(_uuid.uuid4()),
```

**Step 2: Add blacklist check in `jwt_required`**

In the `jwt_required` decorator, after `payload = jwt.decode(...)`, add:

```python
from models.token_blacklist import TokenBlacklist
jti = payload.get('jti')
if jti and TokenBlacklist.is_blacklisted(jti):
    return jsonify({'error': 'Session has been terminated', 'message': 'Your session was ended by an administrator'}), 401
```

**Step 3: Commit**
```bash
git add backend/utils/authentication.py
git commit -m "feat(security): add jti claim to JWT and blacklist check in jwt_required"
```

---

### Task 4: Add `force_logout` backend endpoint

**Files:**
- Modify: `backend/controllers/admin_controller.py` (add after `get_online_users`)
- Modify: `backend/routes/admin_route.py`

**Step 1: Add controller function**

Add after the `get_online_users` function in `admin_controller.py`:

```python
def force_logout_user(user_id):
    """
    Force logout a user by blacklisting all their active JWT sessions.
    Marks all active login_history records as 'expired'.
    """
    try:
        current_user = g.get("user")
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        if current_user.get("user_id") == user_id:
            return jsonify({"error": "Cannot force logout yourself"}), 400

        from models.login_history import LoginHistory
        from models.token_blacklist import TokenBlacklist
        from config.security_config import SecurityConfig
        from datetime import timedelta

        target_user = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not target_user:
            return jsonify({"error": "User not found"}), 404

        # Mark all active sessions as expired
        active_sessions = LoginHistory.query.filter_by(
            user_id=user_id, status='active'
        ).all()

        for session in active_sessions:
            session.mark_expired()

        # Update user status to offline
        target_user.user_status = 'offline'
        db.session.commit()

        log.info(f"Admin {current_user.get('user_id')} force-logged-out user {user_id} ({len(active_sessions)} sessions)")

        return jsonify({
            "success": True,
            "message": f"User {target_user.full_name} has been logged out",
            "sessions_terminated": len(active_sessions)
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error force logging out user {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to force logout: {str(e)}"}), 500
```

**Step 2: Register route in `admin_route.py`**

Add import and route:
```python
# In the import block:
from controllers.admin_controller import (
    ...,
    force_logout_user,
)

# After the /users/online route:
@admin_routes.route('/users/<int:user_id>/force-logout', methods=['POST'])
@jwt_required
def force_logout_user_route(user_id):
    """Force logout a specific user"""
    return force_logout_user(user_id)
```

**Step 3: Commit**
```bash
git add backend/controllers/admin_controller.py backend/routes/admin_route.py
git commit -m "feat(security): add force_logout_user endpoint POST /api/admin/users/:id/force-logout"
```

---

### Task 5: Frontend — Force Logout button in OnlineUsersModal

**Files:**
- Modify: `frontend/src/api/admin.ts` (add `forceLogout` method)
- Modify: `frontend/src/pages/admin/UserManagement.tsx` (add button in OnlineUsersModal)

**Step 1: Add API method in `admin.ts`**

In the `adminApi` object, add:
```typescript
async forceLogout(userId: number): Promise<{ success: boolean; message: string; sessions_terminated: number }> {
  const response = await apiClient.post(`/admin/users/${userId}/force-logout`);
  return response.data;
},
```

**Step 2: Add force logout button in `OnlineUsersModal`**

In the `OnlineUsersModal` component in `UserManagement.tsx`:

1. Add `LogOut` to lucide-react imports
2. Add state: `const [loggingOutId, setLoggingOutId] = useState<number | null>(null);`
3. Add handler:
```typescript
const handleForceLogout = async (user: OnlineUserRecord) => {
  if (!confirm(`Force logout ${user.full_name}? Their session will be terminated immediately.`)) return;
  setLoggingOutId(user.user_id);
  try {
    const res = await adminApi.forceLogout(user.user_id);
    showSuccess(res.message);
    fetchOnlineUsers(); // refresh list
  } catch (err: any) {
    showError('Failed to force logout', { description: err.response?.data?.error || err.message });
  } finally {
    setLoggingOutId(null);
  }
};
```

4. Add button inside each user row, only visible when `user.is_online`:
```tsx
{user.is_online && (
  <button
    onClick={() => handleForceLogout(user)}
    disabled={loggingOutId === user.user_id}
    className="ml-auto flex-shrink-0 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
    title="Force logout"
  >
    {loggingOutId === user.user_id
      ? <RefreshCw className="w-4 h-4 animate-spin" />
      : <LogOut className="w-4 h-4" />}
  </button>
)}
```

**Step 3: Commit**
```bash
git add frontend/src/api/admin.ts frontend/src/pages/admin/UserManagement.tsx
git commit -m "feat(security): add force logout button in Online Users modal"
```

---

## FEATURE 2: Block / Unblock User

### Task 6: Add `is_blocked` + `blocked_reason` to `users` table (migration)

**Files:**
- Create: `backend/migrations/add_user_block_fields.py`

**Step 1: Write migration**

```python
# backend/migrations/add_user_block_fields.py
"""
Migration: Add is_blocked and blocked_reason fields to users table
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.db import db
from app import create_app


def up():
    app = create_app()
    with app.app_context():
        db.engine.execute("""
            ALTER TABLE users
                ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE NOT NULL,
                ADD COLUMN IF NOT EXISTS blocked_reason VARCHAR(255),
                ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS blocked_by INTEGER REFERENCES users(user_id);
            CREATE INDEX IF NOT EXISTS idx_users_is_blocked ON users(is_blocked);
        """)
        print("✅ Added is_blocked fields to users table")


def down():
    app = create_app()
    with app.app_context():
        db.engine.execute("""
            ALTER TABLE users
                DROP COLUMN IF EXISTS is_blocked,
                DROP COLUMN IF EXISTS blocked_reason,
                DROP COLUMN IF EXISTS blocked_at,
                DROP COLUMN IF EXISTS blocked_by;
        """)
        print("✅ Removed is_blocked fields from users table")


if __name__ == '__main__':
    up()
```

**Step 2: Run migration**
```bash
cd backend && python migrations/add_user_block_fields.py
```
Expected: `✅ Added is_blocked fields to users table`

**Step 3: Commit**
```bash
git add backend/migrations/add_user_block_fields.py
git commit -m "feat(security): add is_blocked fields migration to users table"
```

---

### Task 7: Update `User` model with block fields

**Files:**
- Modify: `backend/models/user.py`

**Step 1: Add fields to User model**

In `backend/models/user.py`, add these columns after `is_deleted`:
```python
is_blocked = db.Column(db.Boolean, default=False, nullable=False)
blocked_reason = db.Column(db.String(255), nullable=True)
blocked_at = db.Column(db.DateTime, nullable=True)
blocked_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)
```

**Step 2: Update `to_dict()` method** to include:
```python
'is_blocked': self.is_blocked,
'blocked_reason': self.blocked_reason,
'blocked_at': self.blocked_at.isoformat() + 'Z' if self.blocked_at else None,
```

**Step 3: Commit**
```bash
git add backend/models/user.py
git commit -m "feat(security): add is_blocked fields to User model"
```

---

### Task 8: Block login for blocked users in OTP verification

**Files:**
- Modify: `backend/utils/authentication.py` (~line 387, `verification_otp` function)

**Step 1: Add block check**

In `verification_otp`, after the user is fetched and `is_active` is verified, add:
```python
if user.is_blocked:
    return jsonify({
        'error': 'Account blocked',
        'message': 'Your account has been blocked by an administrator. Please contact support.'
    }), 403
```

**Step 2: Commit**
```bash
git add backend/utils/authentication.py
git commit -m "feat(security): block login for is_blocked users in OTP verification"
```

---

### Task 9: Add block/unblock backend endpoints

**Files:**
- Modify: `backend/controllers/admin_controller.py`
- Modify: `backend/routes/admin_route.py`

**Step 1: Add controller functions**

Add `block_user` and `unblock_user` after `force_logout_user` in `admin_controller.py`:

```python
def block_user(user_id):
    """Block a user — they cannot log in until unblocked."""
    try:
        current_user = g.get("user")
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403
        if current_user.get("user_id") == user_id:
            return jsonify({"error": "Cannot block yourself"}), 400

        data = request.get_json(silent=True) or {}
        reason = data.get("reason", "Blocked by administrator")

        target_user = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not target_user:
            return jsonify({"error": "User not found"}), 404
        if target_user.is_blocked:
            return jsonify({"error": "User is already blocked"}), 409

        target_user.is_blocked = True
        target_user.blocked_reason = reason
        target_user.blocked_at = datetime.utcnow()
        target_user.blocked_by = current_user.get("user_id")
        target_user.user_status = 'offline'

        # Also expire all active sessions
        from models.login_history import LoginHistory
        active_sessions = LoginHistory.query.filter_by(user_id=user_id, status='active').all()
        for session in active_sessions:
            session.mark_expired()

        db.session.commit()
        log.info(f"Admin {current_user.get('user_id')} blocked user {user_id}. Reason: {reason}")

        return jsonify({
            "success": True,
            "message": f"User {target_user.full_name} has been blocked",
            "sessions_terminated": len(active_sessions)
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error blocking user {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to block user: {str(e)}"}), 500


def unblock_user(user_id):
    """Unblock a previously blocked user."""
    try:
        current_user = g.get("user")
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        target_user = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not target_user:
            return jsonify({"error": "User not found"}), 404
        if not target_user.is_blocked:
            return jsonify({"error": "User is not blocked"}), 409

        target_user.is_blocked = False
        target_user.blocked_reason = None
        target_user.blocked_at = None
        target_user.blocked_by = None

        db.session.commit()
        log.info(f"Admin {current_user.get('user_id')} unblocked user {user_id}")

        return jsonify({
            "success": True,
            "message": f"User {target_user.full_name} has been unblocked"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error unblocking user {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to unblock user: {str(e)}"}), 500
```

**Step 2: Register routes**

```python
# Import additions:
from controllers.admin_controller import (..., block_user, unblock_user)

# Routes:
@admin_routes.route('/users/<int:user_id>/block', methods=['POST'])
@jwt_required
def block_user_route(user_id):
    return block_user(user_id)

@admin_routes.route('/users/<int:user_id>/unblock', methods=['POST'])
@jwt_required
def unblock_user_route(user_id):
    return unblock_user(user_id)
```

**Step 3: Commit**
```bash
git add backend/controllers/admin_controller.py backend/routes/admin_route.py
git commit -m "feat(security): add block/unblock user endpoints"
```

---

### Task 10: Frontend — Block/Unblock in user list and Online modal

**Files:**
- Modify: `frontend/src/api/admin.ts`
- Modify: `frontend/src/pages/admin/UserManagement.tsx`

**Step 1: Add API methods in `admin.ts`**

```typescript
async blockUser(userId: number, reason: string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post(`/admin/users/${userId}/block`, { reason });
  return response.data;
},

async unblockUser(userId: number): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post(`/admin/users/${userId}/unblock`);
  return response.data;
},
```

**Step 2: Add `is_blocked` + `blocked_reason` to `User` interface in `admin.ts`**

```typescript
// In the User interface, add:
is_blocked?: boolean;
blocked_reason?: string;
```

**Step 3: Add block indicator in user list table**

In `UserManagement.tsx`, in the user table rows, add a red "Blocked" badge next to the user name when `user.is_blocked === true`:

```tsx
{user.is_blocked && (
  <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded font-medium">Blocked</span>
)}
```

**Step 4: Add Block/Unblock button in user row actions**

In each user row's action buttons area, add alongside the existing toggle/history/delete buttons:

```tsx
<button
  onClick={() => handleBlockToggle(user)}
  title={user.is_blocked ? 'Unblock user' : 'Block user'}
  className={`p-1.5 rounded-lg transition-colors ${
    user.is_blocked
      ? 'text-green-500 hover:bg-green-50 hover:text-green-700'
      : 'text-red-400 hover:bg-red-50 hover:text-red-600'
  }`}
>
  {user.is_blocked ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
</button>
```

Add the handler:
```typescript
const handleBlockToggle = async (user: User) => {
  if (user.is_blocked) {
    if (!confirm(`Unblock ${user.full_name}? They will be able to log in again.`)) return;
    try {
      const res = await adminApi.unblockUser(user.user_id);
      showSuccess(res.message);
      fetchUsers();
    } catch (err: any) {
      showError('Failed to unblock user', { description: err.response?.data?.error });
    }
  } else {
    const reason = prompt(`Reason for blocking ${user.full_name}:`, 'Blocked by administrator');
    if (reason === null) return; // cancelled
    try {
      const res = await adminApi.blockUser(user.user_id, reason || 'Blocked by administrator');
      showSuccess(res.message);
      fetchUsers();
    } catch (err: any) {
      showError('Failed to block user', { description: err.response?.data?.error });
    }
  }
};
```

**Step 5: Add `ShieldCheck`, `ShieldOff` to lucide imports**

**Step 6: Commit**
```bash
git add frontend/src/api/admin.ts frontend/src/pages/admin/UserManagement.tsx
git commit -m "feat(security): add block/unblock UI in user list and online modal"
```

---

## FEATURE 3: Suspicious Activity Alerts

### Task 11: Add `suspicious_activity_alerts` DB table (migration)

**Files:**
- Create: `backend/migrations/add_suspicious_activity_alerts.py`

**Step 1: Write migration**

```python
# backend/migrations/add_suspicious_activity_alerts.py
"""
Migration: Add suspicious_activity_alerts table
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.db import db
from app import create_app


def up():
    app = create_app()
    with app.app_context():
        db.engine.execute("""
            CREATE TABLE IF NOT EXISTS suspicious_activity_alerts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                alert_type VARCHAR(50) NOT NULL,
                severity VARCHAR(20) NOT NULL DEFAULT 'medium',
                description TEXT NOT NULL,
                details JSONB DEFAULT '{}',
                is_resolved BOOLEAN DEFAULT FALSE,
                resolved_by INTEGER REFERENCES users(user_id),
                resolved_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_suspicious_user ON suspicious_activity_alerts(user_id);
            CREATE INDEX IF NOT EXISTS idx_suspicious_resolved ON suspicious_activity_alerts(is_resolved);
            CREATE INDEX IF NOT EXISTS idx_suspicious_created ON suspicious_activity_alerts(created_at);
        """)
        print("✅ Created suspicious_activity_alerts table")


def down():
    app = create_app()
    with app.app_context():
        db.engine.execute("DROP TABLE IF EXISTS suspicious_activity_alerts;")
        print("✅ Dropped suspicious_activity_alerts table")


if __name__ == '__main__':
    up()
```

**Step 2: Run migration**
```bash
cd backend && python migrations/add_suspicious_activity_alerts.py
```

**Step 3: Commit**
```bash
git add backend/migrations/add_suspicious_activity_alerts.py
git commit -m "feat(security): add suspicious_activity_alerts migration"
```

---

### Task 12: Add `SuspiciousActivityAlert` model

**Files:**
- Create: `backend/models/suspicious_activity.py`
- Modify: `backend/models/__init__.py`

**Step 1: Write model**

```python
# backend/models/suspicious_activity.py
from datetime import datetime
from config.db import db


class SuspiciousActivityAlert(db.Model):
    __tablename__ = 'suspicious_activity_alerts'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False, index=True)
    alert_type = db.Column(db.String(50), nullable=False)  # 'multiple_ips', 'unusual_hours', 'rapid_logins'
    severity = db.Column(db.String(20), nullable=False, default='medium')  # low, medium, high, critical
    description = db.Column(db.Text, nullable=False)
    details = db.Column(db.JSON, default=dict)
    is_resolved = db.Column(db.Boolean, default=False, index=True)
    resolved_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "description": self.description,
            "details": self.details,
            "is_resolved": self.is_resolved,
            "resolved_by": self.resolved_by,
            "resolved_at": self.resolved_at.isoformat() + 'Z' if self.resolved_at else None,
            "created_at": self.created_at.isoformat() + 'Z' if self.created_at else None,
        }

    @classmethod
    def exists_unresolved(cls, user_id: int, alert_type: str) -> bool:
        """Prevent duplicate alerts for the same issue."""
        return cls.query.filter_by(
            user_id=user_id,
            alert_type=alert_type,
            is_resolved=False
        ).first() is not None
```

**Step 2: Register in `__init__.py`**
```python
from models.suspicious_activity import SuspiciousActivityAlert
```

**Step 3: Commit**
```bash
git add backend/models/suspicious_activity.py backend/models/__init__.py
git commit -m "feat(security): add SuspiciousActivityAlert model"
```

---

### Task 13: Add suspicious activity detection logic

**Files:**
- Create: `backend/utils/suspicious_activity_detector.py`

**Step 1: Write detector**

```python
# backend/utils/suspicious_activity_detector.py
"""
Suspicious Activity Detector
Runs checks on login events and flags anomalies:
  - Multiple distinct IPs in a short window (24h)
  - Logins outside business hours (before 6am or after 11pm local UTC)
  - Rapid successive logins (>3 in 10 minutes)
"""
from datetime import datetime, timedelta
from config.logging import get_logger

log = get_logger()

BUSINESS_HOURS_START = 6   # 6:00 AM UTC
BUSINESS_HOURS_END = 23    # 11:00 PM UTC
MULTIPLE_IP_WINDOW_HOURS = 24
MULTIPLE_IP_THRESHOLD = 3  # distinct IPs within window
RAPID_LOGIN_WINDOW_MINUTES = 10
RAPID_LOGIN_THRESHOLD = 3  # logins within window


def run_checks_for_user(user_id: int):
    """
    Run all suspicious activity checks for a given user.
    Call this after every successful login.
    """
    try:
        from config.db import db
        from models.login_history import LoginHistory
        from models.suspicious_activity import SuspiciousActivityAlert

        _check_multiple_ips(user_id, LoginHistory, SuspiciousActivityAlert, db)
        _check_unusual_hours(user_id, LoginHistory, SuspiciousActivityAlert, db)
        _check_rapid_logins(user_id, LoginHistory, SuspiciousActivityAlert, db)
    except Exception as e:
        log.error(f"[SuspiciousDetector] Error running checks for user {user_id}: {str(e)}")


def _check_multiple_ips(user_id, LoginHistory, SuspiciousActivityAlert, db):
    cutoff = datetime.utcnow() - timedelta(hours=MULTIPLE_IP_WINDOW_HOURS)
    recent = LoginHistory.query.filter(
        LoginHistory.user_id == user_id,
        LoginHistory.login_at >= cutoff,
        LoginHistory.ip_address.isnot(None)
    ).all()

    distinct_ips = set(r.ip_address for r in recent if r.ip_address not in ('127.0.0.1', '::1'))
    if len(distinct_ips) >= MULTIPLE_IP_THRESHOLD:
        if not SuspiciousActivityAlert.exists_unresolved(user_id, 'multiple_ips'):
            alert = SuspiciousActivityAlert(
                user_id=user_id,
                alert_type='multiple_ips',
                severity='high',
                description=f"Logged in from {len(distinct_ips)} different IP addresses in the last {MULTIPLE_IP_WINDOW_HOURS}h",
                details={"ip_addresses": list(distinct_ips), "window_hours": MULTIPLE_IP_WINDOW_HOURS}
            )
            db.session.add(alert)
            db.session.commit()
            log.warning(f"[SuspiciousDetector] ALERT: multiple_ips for user {user_id} — {distinct_ips}")


def _check_unusual_hours(user_id, LoginHistory, SuspiciousActivityAlert, db):
    latest = LoginHistory.query.filter_by(
        user_id=user_id
    ).order_by(LoginHistory.login_at.desc()).first()

    if not latest:
        return

    hour = latest.login_at.hour
    if hour < BUSINESS_HOURS_START or hour >= BUSINESS_HOURS_END:
        if not SuspiciousActivityAlert.exists_unresolved(user_id, 'unusual_hours'):
            alert = SuspiciousActivityAlert(
                user_id=user_id,
                alert_type='unusual_hours',
                severity='medium',
                description=f"Login detected at unusual hour: {latest.login_at.strftime('%H:%M')} UTC",
                details={"login_at": latest.login_at.isoformat(), "hour_utc": hour}
            )
            db.session.add(alert)
            db.session.commit()
            log.warning(f"[SuspiciousDetector] ALERT: unusual_hours for user {user_id} at hour {hour}")


def _check_rapid_logins(user_id, LoginHistory, SuspiciousActivityAlert, db):
    cutoff = datetime.utcnow() - timedelta(minutes=RAPID_LOGIN_WINDOW_MINUTES)
    count = LoginHistory.query.filter(
        LoginHistory.user_id == user_id,
        LoginHistory.login_at >= cutoff
    ).count()

    if count >= RAPID_LOGIN_THRESHOLD:
        if not SuspiciousActivityAlert.exists_unresolved(user_id, 'rapid_logins'):
            alert = SuspiciousActivityAlert(
                user_id=user_id,
                alert_type='rapid_logins',
                severity='high',
                description=f"{count} logins in the last {RAPID_LOGIN_WINDOW_MINUTES} minutes",
                details={"login_count": count, "window_minutes": RAPID_LOGIN_WINDOW_MINUTES}
            )
            db.session.add(alert)
            db.session.commit()
            log.warning(f"[SuspiciousDetector] ALERT: rapid_logins for user {user_id} — {count} in {RAPID_LOGIN_WINDOW_MINUTES}m")
```

**Step 2: Commit**
```bash
git add backend/utils/suspicious_activity_detector.py
git commit -m "feat(security): add suspicious activity detector (multiple IPs, unusual hours, rapid logins)"
```

---

### Task 14: Trigger detector on every successful login

**Files:**
- Modify: `backend/utils/authentication.py` (`verification_otp` function)

**Step 1: Add call after successful login**

In `verification_otp`, after `record_login_history(...)` is called and the user is confirmed logged in, add:

```python
# Run suspicious activity checks asynchronously-safe (synchronous but fast)
try:
    from utils.suspicious_activity_detector import run_checks_for_user
    run_checks_for_user(user.user_id)
except Exception as e:
    log.error(f"Suspicious activity check failed: {str(e)}")
    # Never fail login due to monitoring
```

**Step 2: Commit**
```bash
git add backend/utils/authentication.py
git commit -m "feat(security): trigger suspicious activity detector on successful login"
```

---

### Task 15: Add backend endpoints for alerts (list + resolve)

**Files:**
- Modify: `backend/controllers/admin_controller.py`
- Modify: `backend/routes/admin_route.py`

**Step 1: Add controller functions**

```python
def get_suspicious_alerts():
    """List all unresolved suspicious activity alerts with user info."""
    try:
        current_user = g.get("user")
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        from models.suspicious_activity import SuspiciousActivityAlert

        show_resolved = request.args.get('resolved', 'false').lower() == 'true'

        query = db.session.query(SuspiciousActivityAlert, User).join(
            User, SuspiciousActivityAlert.user_id == User.user_id
        )
        if not show_resolved:
            query = query.filter(SuspiciousActivityAlert.is_resolved == False)

        query = query.order_by(SuspiciousActivityAlert.created_at.desc()).limit(100)
        results = query.all()

        alerts = []
        for alert, user in results:
            d = alert.to_dict()
            d['user_name'] = user.full_name
            d['user_email'] = user.email
            d['user_role'] = user.role.role if user.role else None
            alerts.append(d)

        return jsonify({
            "success": True,
            "alerts": alerts,
            "total": len(alerts)
        }), 200

    except Exception as e:
        log.error(f"Error fetching suspicious alerts: {str(e)}")
        return jsonify({"error": str(e)}), 500


def resolve_suspicious_alert(alert_id):
    """Mark a suspicious activity alert as resolved."""
    try:
        current_user = g.get("user")
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        from models.suspicious_activity import SuspiciousActivityAlert

        alert = SuspiciousActivityAlert.query.get(alert_id)
        if not alert:
            return jsonify({"error": "Alert not found"}), 404

        alert.is_resolved = True
        alert.resolved_by = current_user.get("user_id")
        alert.resolved_at = datetime.utcnow()
        db.session.commit()

        return jsonify({"success": True, "message": "Alert resolved"}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
```

**Step 2: Register routes**

```python
# Imports:
from controllers.admin_controller import (..., get_suspicious_alerts, resolve_suspicious_alert)

# Routes:
@admin_routes.route('/security/alerts', methods=['GET'])
@jwt_required
def get_suspicious_alerts_route():
    return get_suspicious_alerts()

@admin_routes.route('/security/alerts/<int:alert_id>/resolve', methods=['POST'])
@jwt_required
def resolve_suspicious_alert_route(alert_id):
    return resolve_suspicious_alert(alert_id)
```

**Step 3: Commit**
```bash
git add backend/controllers/admin_controller.py backend/routes/admin_route.py
git commit -m "feat(security): add GET /security/alerts and POST /security/alerts/:id/resolve endpoints"
```

---

### Task 16: Frontend — Security Alerts panel in UserManagement

**Files:**
- Modify: `frontend/src/api/admin.ts`
- Modify: `frontend/src/pages/admin/UserManagement.tsx`

**Step 1: Add types and API methods in `admin.ts`**

```typescript
export interface SuspiciousAlert {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  user_role: string;
  alert_type: 'multiple_ips' | 'unusual_hours' | 'rapid_logins';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  details: Record<string, any>;
  is_resolved: boolean;
  created_at: string;
}

export interface SecurityAlertsResponse {
  success: boolean;
  alerts: SuspiciousAlert[];
  total: number;
}
```

Add to `adminApi`:
```typescript
async getSecurityAlerts(resolved = false): Promise<SecurityAlertsResponse> {
  const response = await apiClient.get(`/admin/security/alerts`, { params: { resolved } });
  return response.data;
},

async resolveAlert(alertId: number): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post(`/admin/security/alerts/${alertId}/resolve`);
  return response.data;
},
```

**Step 2: Add "Security Alerts" button in the header**

In `UserManagement.tsx` header, add alongside "Online Status" and "Add User":

```tsx
<button
  onClick={() => setShowAlertsModal(true)}
  className="relative flex items-center gap-2 px-5 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors shadow-md"
>
  <ShieldAlert className="w-5 h-5" />
  Security Alerts
  {unresolvedCount > 0 && (
    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
      {unresolvedCount > 9 ? '9+' : unresolvedCount}
    </span>
  )}
</button>
```

**Step 3: Add state and fetch in `UserManagement`**

```typescript
const [showAlertsModal, setShowAlertsModal] = useState(false);
const [unresolvedCount, setUnresolvedCount] = useState(0);

// In useEffect, fetch unresolved count on load:
useEffect(() => {
  adminApi.getSecurityAlerts(false).then(r => setUnresolvedCount(r.total)).catch(() => {});
}, []);
```

**Step 4: Add `SecurityAlertsModal` component**

Add a new component before the `export default`:

```tsx
const ALERT_TYPE_LABELS: Record<string, string> = {
  multiple_ips: 'Multiple IPs',
  unusual_hours: 'Unusual Hours',
  rapid_logins: 'Rapid Logins',
};

const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const SecurityAlertsModal: React.FC<{ isOpen: boolean; onClose: () => void; onCountChange: (n: number) => void }> = ({
  isOpen, onClose, onCountChange
}) => {
  const [alerts, setAlerts] = useState<SuspiciousAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getSecurityAlerts(showResolved);
      setAlerts(res.alerts);
      if (!showResolved) onCountChange(res.total);
    } catch (err: any) {
      showError('Failed to load alerts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (isOpen) fetchAlerts(); }, [isOpen, showResolved]);

  const handleResolve = async (alertId: number) => {
    setResolvingId(alertId);
    try {
      await adminApi.resolveAlert(alertId);
      showSuccess('Alert resolved');
      fetchAlerts();
    } catch {
      showError('Failed to resolve alert');
    } finally {
      setResolvingId(null);
    }
  };

  // Render: modal with list of alerts, each showing:
  // - Severity badge, alert type label, description
  // - User name + role + email
  // - Timestamp
  // - "Resolve" button (Check icon)
  // Toggle for showing resolved alerts
};
```

**Step 5: Add icons to imports: `ShieldAlert`, `ShieldCheck`, `ShieldOff`**

**Step 6: Render modal in JSX**

```tsx
<SecurityAlertsModal
  isOpen={showAlertsModal}
  onClose={() => setShowAlertsModal(false)}
  onCountChange={setUnresolvedCount}
/>
```

**Step 7: Commit**
```bash
git add frontend/src/api/admin.ts frontend/src/pages/admin/UserManagement.tsx
git commit -m "feat(security): add Security Alerts modal with resolve functionality"
```

---

## Summary of All Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `/api/admin/users/:id/force-logout` | Force logout a user |
| `POST` | `/api/admin/users/:id/block` | Block a user (with reason) |
| `POST` | `/api/admin/users/:id/unblock` | Unblock a user |
| `GET`  | `/api/admin/security/alerts` | List suspicious activity alerts |
| `POST` | `/api/admin/security/alerts/:id/resolve` | Mark alert as resolved |

## Summary of New Files

| File | Purpose |
|------|---------|
| `backend/migrations/add_token_blacklist_table.py` | Token blacklist DB table |
| `backend/migrations/add_user_block_fields.py` | Block fields on users table |
| `backend/migrations/add_suspicious_activity_alerts.py` | Alerts DB table |
| `backend/models/token_blacklist.py` | TokenBlacklist ORM model |
| `backend/models/suspicious_activity.py` | SuspiciousActivityAlert ORM model |
| `backend/utils/suspicious_activity_detector.py` | Detection logic (3 checks) |

## Summary of Modified Files

| File | What Changes |
|------|-------------|
| `backend/models/user.py` | Add `is_blocked`, `blocked_reason`, `blocked_at`, `blocked_by` |
| `backend/models/__init__.py` | Register 2 new models |
| `backend/utils/authentication.py` | Add `jti` to JWT, block check, detector trigger |
| `backend/controllers/admin_controller.py` | 4 new functions: force_logout, block, unblock, alerts |
| `backend/routes/admin_route.py` | 5 new routes |
| `frontend/src/api/admin.ts` | 4 new API methods + 2 new interfaces |
| `frontend/src/pages/admin/UserManagement.tsx` | Force logout btn, Block/Unblock btn, Alerts modal |
