"""
Advanced Security Module for MeterSquare
Implements: Rate Limiting, Token Fingerprinting, IP Blocking, Audit Logging

IMPORTANT: These features are PRODUCTION-ONLY by default
Set ENVIRONMENT=production to enable

Usage:
    from utils.advanced_security import init_advanced_security
    init_advanced_security(app)
"""

import os
import re
import json
import hashlib
import logging
from datetime import datetime, timedelta
from functools import wraps
from typing import Dict, List, Optional, Set

from flask import Flask, request, g, jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from config.security_config import is_production, SecurityConfig
from config.db import db

# Logger
logger = logging.getLogger(__name__)

# ============================================
# RATE LIMITING
# ============================================

# Global limiter instance
limiter = None


def get_rate_limit_key():
    """
    Get key for rate limiting - use user_id if authenticated, else IP
    """
    if hasattr(g, 'user') and g.user:
        return f"user:{g.user.get('user_id')}"
    return f"ip:{get_remote_address()}"


def init_rate_limiter(app: Flask) -> Limiter:
    """
    Initialize Flask-Limiter with production-appropriate settings
    """
    global limiter

    # Default limits (applied to all routes)
    default_limits = ["200 per minute", "1000 per hour"] if is_production() else ["10000 per minute"]

    limiter = Limiter(
        app=app,
        key_func=get_rate_limit_key,
        default_limits=default_limits,
        storage_uri="memory://",  # Use Redis in production: "redis://localhost:6379"
        strategy="fixed-window",
        headers_enabled=True,  # Add X-RateLimit headers to responses
    )

    # Custom error handler for rate limit exceeded
    @app.errorhandler(429)
    def rate_limit_exceeded(e):
        logger.warning(f"Rate limit exceeded: {get_remote_address()} - {request.path}")

        # Log to audit
        audit_log(
            event_type="RATE_LIMIT_EXCEEDED",
            severity="WARNING",
            details={
                "path": request.path,
                "method": request.method,
                "limit": str(e.description)
            }
        )

        return jsonify({
            "success": False,
            "error": "rate_limit_exceeded",
            "message": "Too many requests. Please slow down.",
            "retry_after": e.description
        }), 429

    logger.debug(f"Rate limiter initialized (production={is_production()})")
    return limiter


# Decorator for custom rate limits
def rate_limit(limit_string: str):
    """
    Custom rate limit decorator

    Usage:
        @rate_limit("5 per minute")
        def login():
            pass
    """
    def decorator(f):
        if limiter and is_production():
            return limiter.limit(limit_string)(f)
        return f
    return decorator


# ============================================
# TOKEN FINGERPRINTING
# ============================================

class TokenFingerprint:
    """
    Token fingerprinting to detect stolen tokens
    Generates a fingerprint from device/browser characteristics
    """

    @staticmethod
    def generate(request_obj=None) -> str:
        """
        Generate a fingerprint from request characteristics
        """
        if request_obj is None:
            request_obj = request

        components = [
            request_obj.headers.get('User-Agent', ''),
            request_obj.headers.get('Accept-Language', ''),
            request_obj.headers.get('Accept-Encoding', ''),
            # Don't include IP as it can change (mobile networks)
        ]

        fingerprint_string = '|'.join(components)
        return hashlib.sha256(fingerprint_string.encode()).hexdigest()[:32]

    @staticmethod
    def validate(stored_fingerprint: str, request_obj=None) -> bool:
        """
        Validate current request fingerprint against stored one
        """
        if not stored_fingerprint:
            return True  # No fingerprint stored, skip validation

        current_fingerprint = TokenFingerprint.generate(request_obj)

        # Allow some tolerance (browser updates can change User-Agent slightly)
        # In strict mode, require exact match
        return current_fingerprint == stored_fingerprint

    @staticmethod
    def get_device_info(request_obj=None) -> Dict:
        """
        Extract device information from request
        """
        if request_obj is None:
            request_obj = request

        user_agent = request_obj.headers.get('User-Agent', '')

        # Simple device detection
        device_type = 'desktop'
        if 'Mobile' in user_agent or 'Android' in user_agent:
            device_type = 'mobile'
        elif 'Tablet' in user_agent or 'iPad' in user_agent:
            device_type = 'tablet'

        # Simple browser detection
        browser = 'unknown'
        if 'Chrome' in user_agent:
            browser = 'Chrome'
        elif 'Firefox' in user_agent:
            browser = 'Firefox'
        elif 'Safari' in user_agent:
            browser = 'Safari'
        elif 'Edge' in user_agent:
            browser = 'Edge'

        # Simple OS detection
        os_name = 'unknown'
        if 'Windows' in user_agent:
            os_name = 'Windows'
        elif 'Mac OS' in user_agent:
            os_name = 'MacOS'
        elif 'Linux' in user_agent:
            os_name = 'Linux'
        elif 'Android' in user_agent:
            os_name = 'Android'
        elif 'iOS' in user_agent or 'iPhone' in user_agent:
            os_name = 'iOS'

        return {
            'device_type': device_type,
            'browser': browser,
            'os': os_name,
            'user_agent': user_agent[:200]  # Truncate for storage
        }


# ============================================
# IP BLOCKING / BLACKLISTING
# ============================================

class IPBlocker:
    """
    IP blocking and suspicious activity detection
    Uses Redis (if available) for shared cache across workers, DB as source of truth
    No in-memory caching — avoids sync issues between workers
    """

    def __init__(self):
        self._redis = None
        self._init_redis()

    def _init_redis(self):
        """Connect to Redis if REDIS_URL is configured"""
        redis_url = os.getenv('REDIS_URL')
        if not redis_url:
            return
        try:
            import redis
            self._redis = redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
            self._redis.ping()
            logger.info("IPBlocker: Redis connected — using shared cache across workers")
        except Exception as e:
            self._redis = None
            logger.debug(f"IPBlocker: Redis unavailable, falling back to DB queries — {e}")

        # Thresholds
        self.FAILED_LOGIN_THRESHOLD = 10  # Block IP after 10 failed logins from same IP
        self.RATE_LIMIT_THRESHOLD = 20    # Block after 20 rate limit hits
        self.SUSPICIOUS_THRESHOLD = 15    # Block after 15 suspicious requests
        self.TOTAL_HISTORICAL_THRESHOLD = 100  # Permanent block after 100 total failed attempts
        self.USER_FAILED_THRESHOLD = 5    # Lock user account after 5 failed OTP attempts
        self.USER_LOCK_DURATION = 1800    # Lock account for 30 minutes (seconds)

        # Progressive blocking durations (hours)
        # Each time an IP is blocked, the duration increases
        self.BLOCK_DURATIONS = {
            1: 24,      # 1st block: 24 hours
            2: 48,      # 2nd block: 48 hours
            3: 168,     # 3rd block: 7 days (168 hours)
            4: 720,     # 4th block: 30 days (720 hours)
            5: None     # 5th+ block: Permanent (None = no expiry)
        }

        # Whitelist (never block these)
        self._whitelist: Set[str] = {'127.0.0.1', 'localhost', '::1'}

    def is_blocked(self, ip: str) -> bool:
        """
        Check if IP is blocked.
        Redis cache (10s TTL) for speed, DB as source of truth.
        """
        if ip in self._whitelist:
            return False

        if self._redis:
            try:
                cached = self._redis.get(f"ip_blocked:{ip}")
                if cached is not None:
                    return cached == b"1"
            except Exception:
                pass

        try:
            from models.security import BlockedIP

            now = datetime.utcnow()
            block = BlockedIP.query.filter(
                BlockedIP.ip_address == ip,
                BlockedIP.unblocked_at.is_(None),
                db.or_(
                    BlockedIP.expires_at.is_(None),
                    BlockedIP.expires_at > now,
                    BlockedIP.is_permanent == True
                )
            ).first()

            result = block is not None

            if self._redis:
                try:
                    self._redis.setex(f"ip_blocked:{ip}", 10, b"1" if result else b"0")
                except Exception:
                    pass

            return result
        except Exception as e:
            logger.error(f"Failed to check IP block from DB: {e}")
            return False

    def block_ip(self, ip: str, reason: str = ""):
        """
        Block an IP address with progressive duration
        Each subsequent block increases the duration until permanent
        """
        if ip in self._whitelist:
            logger.warning(f"Attempted to block whitelisted IP: {ip}")
            return

        block_count, is_permanent, duration_hours = self._get_progressive_block_info(ip)

        if is_permanent:
            expires_at = None
        else:
            expires_at = datetime.utcnow() + timedelta(hours=duration_hours)

        # Save to database
        self._save_block_to_database(ip, reason, expires_at, block_count, is_permanent)

        # Write to Redis cache immediately so all workers know right away
        if self._redis:
            try:
                ttl = int((expires_at - datetime.utcnow()).total_seconds()) if expires_at else 86400 * 30
                self._redis.setex(f"ip_blocked:{ip}", ttl, b"1")
            except Exception:
                pass

        # Log with severity based on block count
        severity = "CRITICAL" if is_permanent else "WARNING"
        duration_str = "PERMANENT" if is_permanent else f"{duration_hours}h"

        logger.warning(f"IP BLOCKED: {ip} - Block #{block_count} - Duration: {duration_str} - Reason: {reason}")
        audit_log(
            event_type="IP_BLOCKED",
            severity=severity,
            details={
                "ip": ip,
                "reason": reason,
                "block_count": block_count,
                "duration_hours": duration_hours,
                "is_permanent": is_permanent
            }
        )

    def _get_progressive_block_info(self, ip: str) -> tuple:
        """
        Get progressive block information for an IP
        Returns: (block_count, is_permanent, duration_hours)
        """
        try:
            from models.security import BlockedIP, SecurityAuditLog

            # Get previous block count
            existing = BlockedIP.query.filter_by(ip_address=ip).first()
            previous_count = existing.block_count if existing else 0
            new_count = previous_count + 1

            # Check total historical failed attempts
            total_failed = SecurityAuditLog.query.filter(
                SecurityAuditLog.event_type == 'LOGIN_FAILED',
                SecurityAuditLog.ip_address == ip
            ).count()

            # If total attempts exceed threshold, permanent ban
            if total_failed >= self.TOTAL_HISTORICAL_THRESHOLD:
                return (new_count, True, None)

            # Get duration based on block count (cap at 5)
            duration_key = min(new_count, 5)
            duration_hours = self.BLOCK_DURATIONS.get(duration_key, None)

            is_permanent = duration_hours is None

            return (new_count, is_permanent, duration_hours if duration_hours else 0)
        except Exception as e:
            logger.error(f"Failed to get progressive block info: {e}")
            # Default to 24 hours on error
            return (1, False, 24)

    def _save_block_to_database(self, ip: str, reason: str, expires_at: datetime,
                                  block_count: int = 1, is_permanent: bool = False):
        """Save IP block to database with progressive blocking info"""
        try:
            from models.security import BlockedIP

            # Check if IP already exists
            existing = BlockedIP.query.filter_by(ip_address=ip).first()
            if existing:
                # Update existing record
                existing.reason = reason
                existing.blocked_at = datetime.utcnow()
                existing.expires_at = expires_at
                existing.is_permanent = is_permanent
                existing.block_count = block_count
                existing.unblocked_at = None
                existing.unblocked_by = None
            else:
                # Create new record
                block = BlockedIP(
                    ip_address=ip,
                    reason=reason,
                    blocked_at=datetime.utcnow(),
                    expires_at=expires_at,
                    is_permanent=is_permanent,
                    block_count=block_count
                )
                db.session.add(block)

            db.session.commit()
        except Exception as e:
            logger.error(f"Failed to save IP block to database: {e}")
            db.session.rollback()

    def unblock_ip(self, ip: str, user_id: int = None):
        """Unblock an IP address — clears Redis cache + updates DB"""
        if self._redis:
            try:
                self._redis.delete(f"ip_blocked:{ip}")
            except Exception:
                pass

        self._unblock_in_database(ip, user_id)
        logger.info(f"IP UNBLOCKED: {ip}")

    def _unblock_in_database(self, ip: str, user_id: int = None):
        """Mark IP as unblocked in database"""
        try:
            from models.security import BlockedIP

            block = BlockedIP.query.filter_by(ip_address=ip, unblocked_at=None).first()
            if block:
                block.unblocked_at = datetime.utcnow()
                block.unblocked_by = user_id
                db.session.commit()
        except Exception as e:
            logger.error(f"Failed to unblock IP in database: {e}")
            db.session.rollback()

    def record_failed_login(self, ip: str):
        """
        Record a failed login attempt from an IP.
        Does NOT block IP for failed logins — shared WiFi means blocking
        one IP could lock out an entire office/construction site.
        IP blocking is only used for suspicious requests (SQL injection, XSS).
        User account locking (record_user_failed_login) handles brute force protection.
        """
        pass

    def record_rate_limit_hit(self, ip: str):
        """Record a rate limit hit using Redis counter, DB fallback"""
        if self._redis:
            try:
                key = f"rate_limit_hits:{ip}"
                count = self._redis.incr(key)
                self._redis.expire(key, 3600)
                if count >= self.RATE_LIMIT_THRESHOLD:
                    self.block_ip(ip, f"Too many rate limit violations ({count})")
                return
            except Exception:
                pass

        # DB fallback when Redis unavailable
        try:
            from models.security import SecurityAuditLog
            last_hour = datetime.utcnow() - timedelta(hours=1)
            count = SecurityAuditLog.query.filter(
                SecurityAuditLog.event_type == 'RATE_LIMIT_HIT',
                SecurityAuditLog.ip_address == ip,
                SecurityAuditLog.timestamp > last_hour
            ).count()
            if count >= self.RATE_LIMIT_THRESHOLD:
                self.block_ip(ip, f"Too many rate limit violations ({count})")
        except Exception:
            pass

        audit_log("RATE_LIMIT_HIT", severity="WARNING", details={"ip": ip})

    def record_suspicious_request(self, ip: str, reason: str = ""):
        """Record a suspicious request (SQL injection attempt, etc.) using Redis counter, DB fallback"""
        if self._redis:
            try:
                key = f"suspicious_reqs:{ip}"
                count = self._redis.incr(key)
                self._redis.expire(key, 3600)
                if count >= self.SUSPICIOUS_THRESHOLD:
                    self.block_ip(ip, f"Too many suspicious requests: {reason}")
                return
            except Exception:
                pass

        # DB fallback when Redis unavailable
        try:
            from models.security import SecurityAuditLog
            last_hour = datetime.utcnow() - timedelta(hours=1)
            count = SecurityAuditLog.query.filter(
                SecurityAuditLog.event_type == 'SUSPICIOUS_REQUEST',
                SecurityAuditLog.ip_address == ip,
                SecurityAuditLog.timestamp > last_hour
            ).count()
            if count >= self.SUSPICIOUS_THRESHOLD:
                self.block_ip(ip, f"Too many suspicious requests: {reason}")
        except Exception:
            pass

        audit_log("SUSPICIOUS_REQUEST", severity="WARNING", details={"ip": ip, "reason": reason})

    def get_blocked_ips(self) -> List[str]:
        """Get list of blocked IPs from database"""
        try:
            from models.security import BlockedIP

            now = datetime.utcnow()
            blocked = BlockedIP.query.filter(
                BlockedIP.unblocked_at.is_(None),
                db.or_(
                    BlockedIP.expires_at.is_(None),
                    BlockedIP.expires_at > now,
                    BlockedIP.is_permanent == True
                )
            ).all()

            return [b.ip_address for b in blocked]
        except Exception as e:
            logger.error(f"Failed to get blocked IPs from database: {e}")
            return []

    def get_suspicious_ips(self) -> Dict:
        """Get suspicious IP activity from DB audit log"""
        try:
            from models.security import SecurityAuditLog
            from sqlalchemy import func

            last_24h = datetime.utcnow() - timedelta(hours=24)
            results = db.session.query(
                SecurityAuditLog.ip_address,
                func.count(SecurityAuditLog.id).label('count')
            ).filter(
                SecurityAuditLog.event_type == 'LOGIN_FAILED',
                SecurityAuditLog.timestamp > last_24h,
                SecurityAuditLog.ip_address.isnot(None)
            ).group_by(SecurityAuditLog.ip_address).all()

            return {ip: {'failed_logins': count} for ip, count in results}
        except Exception as e:
            logger.error(f"Failed to get suspicious IPs: {e}")
            return {}

    def add_to_whitelist(self, ip: str):
        """Add IP to whitelist"""
        self._whitelist.add(ip)
        self.unblock_ip(ip)  # Unblock if previously blocked

    def is_user_locked(self, identifier: str) -> bool:
        """Check if a user account is temporarily locked after too many failed attempts"""
        if self._redis:
            try:
                return self._redis.get(f"user_locked:{identifier}") is not None
            except Exception:
                pass

        try:
            from models.security import SecurityAuditLog
            last_30min = datetime.utcnow() - timedelta(seconds=self.USER_LOCK_DURATION)
            count = SecurityAuditLog.query.filter(
                SecurityAuditLog.event_type == 'LOGIN_FAILED',
                SecurityAuditLog.timestamp > last_30min,
                SecurityAuditLog.details.cast(db.Text).contains(identifier)
            ).count()
            return count >= self.USER_FAILED_THRESHOLD
        except Exception as e:
            logger.error(f"Failed to check user lock: {e}")
            return False

    def record_user_failed_login(self, identifier: str):
        """Record a failed login for a specific user account (email/phone)"""
        if not identifier:
            return

        if self._redis:
            try:
                key = f"user_fail:{identifier}"
                count = self._redis.incr(key)
                self._redis.expire(key, self.USER_LOCK_DURATION)
                if count >= self.USER_FAILED_THRESHOLD:
                    self._redis.setex(f"user_locked:{identifier}", self.USER_LOCK_DURATION, b"1")
                    logger.warning(f"USER LOCKED: {identifier} — {count} failed attempts in {self.USER_LOCK_DURATION}s")
                    audit_log("USER_LOCKED", severity="WARNING", details={
                        "identifier": identifier[:50],
                        "failed_attempts": count,
                        "lock_duration_minutes": self.USER_LOCK_DURATION // 60
                    })
                return
            except Exception:
                pass

        try:
            from models.security import SecurityAuditLog
            last_30min = datetime.utcnow() - timedelta(seconds=self.USER_LOCK_DURATION)
            count = SecurityAuditLog.query.filter(
                SecurityAuditLog.event_type == 'LOGIN_FAILED',
                SecurityAuditLog.timestamp > last_30min,
                SecurityAuditLog.details.cast(db.Text).contains(identifier)
            ).count()
            if count >= self.USER_FAILED_THRESHOLD:
                logger.warning(f"USER LOCKED: {identifier} — {count} failed attempts (DB count)")
                audit_log("USER_LOCKED", severity="WARNING", details={
                    "identifier": identifier[:50],
                    "failed_attempts": count,
                    "lock_duration_minutes": self.USER_LOCK_DURATION // 60
                })
        except Exception as e:
            logger.error(f"Failed to record user failed login: {e}")

    def unlock_user(self, identifier: str):
        """Manually unlock a user account"""
        if self._redis:
            try:
                self._redis.delete(f"user_locked:{identifier}")
                self._redis.delete(f"user_fail:{identifier}")
            except Exception:
                pass
        logger.info(f"USER UNLOCKED: {identifier}")


# Global IP blocker instance
ip_blocker = IPBlocker()


def check_ip_blocked():
    """
    Middleware to check if IP is blocked
    Call this in before_request
    """
    if not is_production():
        return None

    ip = get_remote_address()
    if ip_blocker.is_blocked(ip):
        logger.warning(f"Blocked IP attempted access: {ip}")
        return jsonify({
            "success": False,
            "error": "ip_blocked",
            "message": "Access denied. Your IP has been blocked due to suspicious activity."
        }), 403

    return None


# ============================================
# AUDIT LOGGING
# ============================================

class AuditLogger:
    """
    Security audit logging
    Tracks all security-relevant events
    Saves to database for persistence, reads from DB for queries
    """

    def __init__(self):
        pass

    def log(self, event_type: str, severity: str = "INFO",
            user_id: int = None, details: Dict = None):
        """
        Log a security event

        Args:
            event_type: Type of event (LOGIN_SUCCESS, LOGIN_FAILED, etc.)
            severity: INFO, WARNING, CRITICAL
            user_id: User ID if applicable
            details: Additional details
        """
        event = {
            'timestamp': datetime.utcnow().isoformat(),
            'event_type': event_type,
            'severity': severity,
            'user_id': user_id,
            'ip_address': get_remote_address() if request else None,
            'user_agent': request.headers.get('User-Agent', '')[:200] if request else None,
            'path': request.path if request else None,
            'method': request.method if request else None,
            'details': details or {}
        }

        # Log to file/console
        log_message = f"AUDIT: [{severity}] {event_type}"
        if user_id:
            log_message += f" user_id={user_id}"
        if details:
            log_message += f" details={json.dumps(details)}"

        if severity == "CRITICAL":
            logger.critical(log_message)
        elif severity == "WARNING":
            logger.warning(log_message)
        else:
            logger.info(log_message)

        # Save to database for persistence
        self._save_to_database(event)

    def _save_to_database(self, event: Dict):
        """Save audit log to database"""
        try:
            from models.security import SecurityAuditLog

            audit_log_entry = SecurityAuditLog(
                timestamp=datetime.fromisoformat(event['timestamp']),
                event_type=event['event_type'],
                severity=event['severity'],
                user_id=event['user_id'],
                ip_address=event['ip_address'],
                user_agent=event['user_agent'],
                path=event['path'],
                method=event['method'],
                details=event['details']
            )

            db.session.add(audit_log_entry)
            db.session.commit()
        except Exception as e:
            # Don't let database errors break the application
            logger.error(f"Failed to save audit log to database: {e}")
            db.session.rollback()

    def get_logs(self, event_type: str = None, user_id: int = None,
                 severity: str = None, limit: int = 100) -> List[Dict]:
        """Get filtered audit logs from database"""
        try:
            from models.security import SecurityAuditLog

            query = SecurityAuditLog.query

            if event_type:
                query = query.filter(SecurityAuditLog.event_type == event_type)
            if user_id:
                query = query.filter(SecurityAuditLog.user_id == user_id)
            if severity:
                query = query.filter(SecurityAuditLog.severity == severity)

            # Order by most recent first
            query = query.order_by(SecurityAuditLog.timestamp.desc())

            # Apply limit
            logs = query.limit(limit).all()

            return [log.to_dict() for log in logs]
        except Exception as e:
            logger.error(f"Failed to get audit logs from database: {e}")
            return []

    def get_failed_logins(self, hours: int = 24) -> List[Dict]:
        """Get failed login attempts in last N hours"""
        try:
            from models.security import SecurityAuditLog

            cutoff = datetime.utcnow() - timedelta(hours=hours)
            logs = SecurityAuditLog.query.filter(
                SecurityAuditLog.event_type == 'LOGIN_FAILED',
                SecurityAuditLog.timestamp > cutoff
            ).order_by(SecurityAuditLog.timestamp.desc()).all()

            return [log.to_dict() for log in logs]
        except Exception as e:
            logger.error(f"Failed to get failed logins from database: {e}")
            return []

    def get_security_summary(self) -> Dict:
        """Get security event summary from database"""
        try:
            from models.security import SecurityAuditLog, BlockedIP
            from sqlalchemy import func

            now = datetime.utcnow()
            last_24h = now - timedelta(hours=24)

            # Get counts from database
            total_events = SecurityAuditLog.query.filter(
                SecurityAuditLog.timestamp > last_24h
            ).count()

            failed_logins = SecurityAuditLog.query.filter(
                SecurityAuditLog.timestamp > last_24h,
                SecurityAuditLog.event_type == 'LOGIN_FAILED'
            ).count()

            rate_limit_hits = SecurityAuditLog.query.filter(
                SecurityAuditLog.timestamp > last_24h,
                SecurityAuditLog.event_type == 'RATE_LIMIT_EXCEEDED'
            ).count()

            blocked_ips_24h = SecurityAuditLog.query.filter(
                SecurityAuditLog.timestamp > last_24h,
                SecurityAuditLog.event_type == 'IP_BLOCKED'
            ).count()

            critical_events = SecurityAuditLog.query.filter(
                SecurityAuditLog.timestamp > last_24h,
                SecurityAuditLog.severity == 'CRITICAL'
            ).count()

            # Get currently blocked IPs count from database
            blocked_ips_count = BlockedIP.query.filter(
                BlockedIP.unblocked_at.is_(None),
                db.or_(
                    BlockedIP.expires_at.is_(None),
                    BlockedIP.expires_at > now,
                    BlockedIP.is_permanent == True
                )
            ).count()

            return {
                'total_events_24h': total_events,
                'failed_logins_24h': failed_logins,
                'rate_limit_hits_24h': rate_limit_hits,
                'blocked_ips_24h': blocked_ips_24h,
                'critical_events_24h': critical_events,
                'blocked_ips_count': blocked_ips_count,
                'suspicious_ips_count': len(ip_blocker.get_suspicious_ips())
            }
        except Exception as e:
            logger.error(f"Failed to get security summary from database: {e}")
            return {
                'total_events_24h': 0,
                'failed_logins_24h': 0,
                'rate_limit_hits_24h': 0,
                'blocked_ips_24h': 0,
                'critical_events_24h': 0,
                'blocked_ips_count': 0,
                'suspicious_ips_count': 0
            }


# Global audit logger instance
audit_logger = AuditLogger()


def audit_log(event_type: str, severity: str = "INFO",
              user_id: int = None, details: Dict = None):
    """
    Convenience function for audit logging

    Usage:
        audit_log("LOGIN_SUCCESS", user_id=123)
        audit_log("SUSPICIOUS_REQUEST", severity="WARNING", details={"reason": "SQL injection attempt"})
    """
    # Get user_id from g if not provided
    if user_id is None and hasattr(g, 'user') and g.user:
        user_id = g.user.get('user_id')

    audit_logger.log(event_type, severity, user_id, details)


# ============================================
# SUSPICIOUS REQUEST DETECTION
# ============================================

# Endpoints that should skip SQL keyword checks (BOQ items often contain words like SELECT, INSERT)
# These endpoints legitimately contain construction terminology that might match SQL patterns
SECURITY_WHITELIST_PATHS = [
    '/api/create_boq',
    '/api/boq/',  # Covers all BOQ operations (update, upload, change-request, etc.)
    '/api/revision_boq',
    '/api/update_internal_boq',
    '/api/change-request',  # Change requests contain material descriptions
    '/api/materials/',  # Material catalog and specifications
    '/api/inventory/',  # Inventory management
    '/api/labour/',  # Labour descriptions and requisitions
    '/api/projects/create',  # Project descriptions might contain keywords
    '/api/projects/update',
    '/api/buyer/',  # Buyer operations (emails with custom bodies, LPO data)
]

# Improved patterns - more context-aware to reduce false positives
SUSPICIOUS_PATTERNS = [
    # SQL Injection - look for actual SQL injection patterns (multiple keywords, quotes, comments)
    r"('|\"|`).*(SELECT|UNION|DROP|DELETE|UPDATE|INSERT).*('|\"|`)",  # SQL with quotes
    r"(SELECT|UNION).*FROM.*WHERE",  # Actual SQL query structure
    r"(DROP|DELETE).*TABLE",  # Table manipulation
    r"(\bOR\b|\bAND\b).*[=<>].*('|\"|`)",  # Boolean SQL injection (OR 1=1, AND 1=1)
    r"(--\s|\/\*|\*\/)",  # SQL comments for bypass
    r";\s*(SELECT|DROP|DELETE|INSERT|UPDATE)",  # Command chaining with semicolon

    # XSS - unchanged, these are always suspicious
    r"(<script|javascript:|onerror=|onload=|onclick=|onmouseover=)",

    # Path traversal - unchanged
    r"(\.\.\/|\.\.\\)",

    # Command injection - be more specific
    r"(\$\(.*\)|`.*`|\|\s*(rm|cat|ls|wget|curl|bash|sh)\s)",  # Actual command execution patterns
]

SUSPICIOUS_REGEX = [re.compile(p, re.IGNORECASE) for p in SUSPICIOUS_PATTERNS]


def check_suspicious_request():
    """
    Check request for suspicious patterns with smart whitelisting
    Call this in before_request
    """
    if not is_production():
        return None

    # Check if the current path is whitelisted (BOQ, materials, etc. can contain construction keywords)
    is_whitelisted = any(request.path.startswith(path) for path in SECURITY_WHITELIST_PATHS)

    # Check query parameters (never whitelisted - attackers shouldn't use query params for injection)
    for key, value in request.args.items():
        if _is_suspicious(value):
            ip = get_remote_address()
            ip_blocker.record_suspicious_request(ip, f"Suspicious query param: {key}")
            audit_log(
                "SUSPICIOUS_REQUEST",
                severity="WARNING",
                details={"type": "query_param", "key": key, "value": value[:100], "path": request.path}
            )
            return jsonify({
                "success": False,
                "error": "invalid_request",
                "message": "Invalid request detected"
            }), 400

    # Check request body (for JSON) - apply whitelist here
    if request.is_json and not is_whitelisted:
        try:
            data = request.get_json(silent=True) or {}
            if _check_dict_suspicious(data):
                ip = get_remote_address()
                ip_blocker.record_suspicious_request(ip, "Suspicious request body")
                audit_log(
                    "SUSPICIOUS_REQUEST",
                    severity="WARNING",
                    details={"type": "request_body", "path": request.path}
                )
                return jsonify({
                    "success": False,
                    "error": "invalid_request",
                    "message": "Invalid request detected"
                }), 400
        except Exception as e:
            logger.debug(f"Could not parse JSON body for security check: {e}")

    return None


def _is_suspicious(value: str) -> bool:
    """Check if a string value contains suspicious patterns"""
    if not value or not isinstance(value, str):
        return False

    for pattern in SUSPICIOUS_REGEX:
        if pattern.search(value):
            return True
    return False


def _check_dict_suspicious(data: Dict, depth: int = 0) -> bool:
    """Recursively check dict for suspicious values"""
    if depth > 10:  # Prevent deep recursion
        return False

    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, str) and _is_suspicious(value):
                return True
            if isinstance(value, (dict, list)):
                if _check_dict_suspicious(value, depth + 1):
                    return True
    elif isinstance(data, list):
        for item in data:
            if _check_dict_suspicious(item, depth + 1):
                return True

    return False


# ============================================
# INITIALIZATION
# ============================================

def init_advanced_security(app: Flask):
    """
    Initialize all advanced security features

    Usage:
        from utils.advanced_security import init_advanced_security
        app = Flask(__name__)
        init_advanced_security(app)
    """
    logger.debug("Initializing advanced security features...")

    # Initialize rate limiter
    init_rate_limiter(app)

    # Register before_request hooks
    @app.before_request
    def security_checks():
        # Skip security checks for CORS preflight requests
        if request.method == 'OPTIONS':
            return None

        # Check if IP is blocked
        blocked_response = check_ip_blocked()
        if blocked_response:
            return blocked_response

        # Check for suspicious request patterns
        suspicious_response = check_suspicious_request()
        if suspicious_response:
            return suspicious_response

    # Auto-cleanup old audit logs on startup (keep last 30 days only)
    with app.app_context():
        try:
            from models.security import SecurityAuditLog
            cutoff = datetime.utcnow() - timedelta(days=30)
            total_deleted = 0
            batch_size = 5000
            while True:
                ids = db.session.query(SecurityAuditLog.id).filter(
                    SecurityAuditLog.timestamp < cutoff
                ).limit(batch_size).all()
                if not ids:
                    break
                SecurityAuditLog.query.filter(
                    SecurityAuditLog.id.in_([i[0] for i in ids])
                ).delete(synchronize_session=False)
                db.session.commit()
                total_deleted += len(ids)
            if total_deleted:
                logger.info(f"Cleaned up {total_deleted} audit logs older than 30 days")
        except Exception as e:
            db.session.rollback()
            logger.debug(f"Audit log cleanup skipped: {e}")

    logger.debug(f"Advanced security initialized (production={is_production()})")

    return {
        'limiter': limiter,
        'ip_blocker': ip_blocker,
        'audit_logger': audit_logger,
        'token_fingerprint': TokenFingerprint
    }


# ============================================
# HELPER FUNCTIONS FOR CONTROLLERS
# ============================================

def on_login_success(user_id: int):
    """Call this after successful login"""
    audit_log("LOGIN_SUCCESS", user_id=user_id, details={
        "device": TokenFingerprint.get_device_info()
    })


def on_login_failed(identifier: str = None):
    """Call this after failed login — tracks both IP and user account"""
    ip = get_remote_address()
    ip_blocker.record_failed_login(ip)
    if identifier:
        ip_blocker.record_user_failed_login(identifier)
    audit_log(
        "LOGIN_FAILED",
        severity="WARNING",
        details={"email": identifier[:50] if identifier else None, "ip": ip}
    )


# ============================================
# API ENDPOINTS FOR SECURITY DASHBOARD
# ============================================

def register_security_routes(app: Flask):
    """
    Register security admin endpoints
    These are protected by admin authentication
    """
    from flask import Blueprint
    from functools import wraps
    import jwt
    import os
    from models.user import User
    from models.role import Role

    security_bp = Blueprint('security', __name__, url_prefix='/api/security')

    # Admin roles allowed to access security endpoints
    SECURITY_ADMIN_ROLES = {'admin', 'pm', 'td', 'technical_director', 'project_manager',
                           'projectmanager', 'technicaldirector', 'productionmanager', 'production_manager'}

    def admin_required(f):
        """Decorator to require admin authentication for security endpoints"""
        @wraps(f)
        def decorated(*args, **kwargs):
            # First, validate JWT token and set g.user
            auth_header = request.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                return jsonify({
                    "success": False,
                    "error": "Authentication required"
                }), 401

            token = auth_header.split(' ')[1]

            try:
                # Decode JWT token
                secret_key = os.getenv('SECRET_KEY')
                payload = jwt.decode(token, secret_key, algorithms=['HS256'])

                # Get user from database and verify active status
                user_id = payload.get('user_id')
                if not user_id:
                    return jsonify({
                        "success": False,
                        "error": "Invalid token"
                    }), 401

                user = User.query.filter_by(user_id=user_id).first()
                if not user or not getattr(user, 'is_active', True):
                    return jsonify({
                        "success": False,
                        "error": "Account is inactive or not found"
                    }), 401

                # Set g.user for the request
                g.user = {
                    'user_id': user_id,
                    'email': payload.get('email'),
                    'role': payload.get('role'),
                    'role_id': payload.get('role_id'),
                    'full_name': payload.get('full_name')
                }

            except jwt.ExpiredSignatureError:
                return jsonify({
                    "success": False,
                    "error": "Token expired"
                }), 401
            except jwt.InvalidTokenError:
                return jsonify({
                    "success": False,
                    "error": "Invalid token"
                }), 401

            # Check if user has admin role
            user_role = (g.user.get('role') or '').lower().replace(' ', '').replace('_', '')
            if user_role not in SECURITY_ADMIN_ROLES:
                audit_log(
                    "UNAUTHORIZED_SECURITY_ACCESS",
                    severity="WARNING",
                    details={"attempted_endpoint": request.path, "user_role": user_role}
                )
                return jsonify({
                    "success": False,
                    "error": "Admin access required"
                }), 403

            return f(*args, **kwargs)
        return decorated

    @security_bp.route('/summary', methods=['GET'])
    @admin_required
    def get_security_summary():
        """Get security summary (admin only)"""
        return jsonify({
            "success": True,
            "data": audit_logger.get_security_summary()
        })

    @security_bp.route('/audit-logs', methods=['GET'])
    @admin_required
    def get_audit_logs():
        """Get audit logs (admin only)"""
        event_type = request.args.get('event_type')
        severity = request.args.get('severity')
        limit = int(request.args.get('limit', 100))

        logs = audit_logger.get_logs(
            event_type=event_type,
            severity=severity,
            limit=limit
        )

        return jsonify({
            "success": True,
            "data": logs,
            "count": len(logs)
        })

    @security_bp.route('/blocked-ips', methods=['GET'])
    @admin_required
    def get_blocked_ips():
        """Get blocked IPs (admin only)"""
        return jsonify({
            "success": True,
            "data": ip_blocker.get_blocked_ips()
        })

    @security_bp.route('/unblock-ip', methods=['POST'])
    @admin_required
    def unblock_ip():
        """Unblock an IP (admin only)"""
        data = request.get_json()
        ip = data.get('ip')
        if ip:
            user_id = g.user.get('user_id') if hasattr(g, 'user') and g.user else None
            ip_blocker.unblock_ip(ip, user_id=user_id)
            audit_log("IP_UNBLOCKED", details={"ip": ip, "unblocked_by": user_id})
            return jsonify({"success": True, "message": f"IP {ip} unblocked"})
        return jsonify({"success": False, "error": "IP required"}), 400

    @security_bp.route('/unlock-user', methods=['POST'])
    @admin_required
    def unlock_user():
        """Unlock a user account (admin only)"""
        data = request.get_json()
        identifier = data.get('email') or data.get('phone')
        if identifier:
            ip_blocker.unlock_user(identifier)
            audit_log("USER_UNLOCKED", details={"identifier": identifier[:50], "unlocked_by": g.user.get('user_id')})
            return jsonify({"success": True, "message": f"User {identifier} unlocked"})
        return jsonify({"success": False, "error": "Email or phone required"}), 400

    app.register_blueprint(security_bp)
    logger.debug("Security routes registered at /api/security/* (admin-protected)")
