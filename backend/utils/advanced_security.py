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
import threading
from datetime import datetime, timedelta
from functools import wraps
from typing import Dict, List, Optional, Set
from collections import defaultdict

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

    logger.info(f"Rate limiter initialized (production={is_production()})")
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
    Thread-safe with automatic block expiration
    Uses database for persistence + memory cache for fast checks
    """

    def __init__(self):
        # Memory cache for fast lookups (synced with database)
        self._blocked_ips: Dict[str, Dict] = {}  # {ip: {'blocked_at': datetime, 'reason': str}}
        self._suspicious_ips: Dict[str, Dict] = defaultdict(lambda: {
            'failed_logins': 0,
            'rate_limit_hits': 0,
            'suspicious_requests': 0,
            'first_seen': datetime.utcnow(),
            'last_seen': datetime.utcnow()
        })
        self._lock = threading.Lock()
        self._db_synced = False

        # Thresholds
        self.FAILED_LOGIN_THRESHOLD = 10  # Block after 10 failed logins
        self.RATE_LIMIT_THRESHOLD = 20    # Block after 20 rate limit hits
        self.SUSPICIOUS_THRESHOLD = 15    # Block after 15 suspicious requests
        self.TOTAL_HISTORICAL_THRESHOLD = 100  # Permanent block after 100 total failed attempts

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

    def _sync_from_database(self):
        """Load blocked IPs and suspicious activity from database into memory cache"""
        # Quick check without lock first (performance optimization)
        if self._db_synced:
            return

        # Thread-safe sync - only one thread should sync
        with self._lock:
            # Double-check after acquiring lock
            if self._db_synced:
                return

            try:
                from models.security import BlockedIP, SecurityAuditLog
                from sqlalchemy import func

                now = datetime.utcnow()
                last_24h = now - timedelta(hours=24)

                # Load blocked IPs
                blocked = BlockedIP.query.filter(
                    BlockedIP.unblocked_at.is_(None),
                    db.or_(
                        BlockedIP.expires_at.is_(None),
                        BlockedIP.expires_at > now,
                        BlockedIP.is_permanent == True
                    )
                ).all()

                for block in blocked:
                    self._blocked_ips[block.ip_address] = {
                        'blocked_at': block.blocked_at,
                        'reason': block.reason,
                        'db_id': block.id,
                        'block_count': block.block_count or 1,
                        'is_permanent': block.is_permanent or False
                    }

                # Load failed login counts per IP from last 24 hours
                # This ensures protection survives server restarts
                failed_logins_by_ip = db.session.query(
                    SecurityAuditLog.ip_address,
                    func.count(SecurityAuditLog.id).label('count')
                ).filter(
                    SecurityAuditLog.event_type == 'LOGIN_FAILED',
                    SecurityAuditLog.timestamp > last_24h,
                    SecurityAuditLog.ip_address.isnot(None)
                ).group_by(SecurityAuditLog.ip_address).all()

                for ip, count in failed_logins_by_ip:
                    if ip and ip not in self._whitelist:
                        self._suspicious_ips[ip]['failed_logins'] = count
                        self._suspicious_ips[ip]['last_seen'] = now

                self._db_synced = True
                logger.info(f"Synced {len(blocked)} blocked IPs and {len(failed_logins_by_ip)} suspicious IPs from database")
            except Exception as e:
                logger.error(f"Failed to sync from database: {e}")
                # Don't set _db_synced so we can retry on next request

    def is_blocked(self, ip: str) -> bool:
        """Check if IP is blocked (thread-safe with expiration check)"""
        if ip in self._whitelist:
            return False

        # Sync from database on first check
        self._sync_from_database()

        with self._lock:
            block_info = self._blocked_ips.get(ip)
            if not block_info:
                return False

            # Permanent blocks never expire
            if block_info.get('is_permanent', False):
                return True

            # Check if block has expired using the stored expiry or calculate from block count
            blocked_at = block_info.get('blocked_at', datetime.utcnow())
            block_count = block_info.get('block_count', 1)

            # Get duration for this block count
            duration_key = min(block_count, 5)
            duration_hours = self.BLOCK_DURATIONS.get(duration_key, 24)

            if duration_hours is None:
                # Permanent block
                return True

            if datetime.utcnow() - blocked_at > timedelta(hours=duration_hours):
                # Block has expired, auto-unblock
                del self._blocked_ips[ip]
                self._unblock_in_database(ip)
                logger.info(f"IP BLOCK EXPIRED: {ip} (was block #{block_count})")
                return False

            return True

    def block_ip(self, ip: str, reason: str = ""):
        """
        Block an IP address with progressive duration
        Each subsequent block increases the duration until permanent
        """
        if ip in self._whitelist:
            logger.warning(f"Attempted to block whitelisted IP: {ip}")
            return

        # Get block count and calculate progressive duration
        block_count, is_permanent, duration_hours = self._get_progressive_block_info(ip)

        if is_permanent:
            expires_at = None
        else:
            expires_at = datetime.utcnow() + timedelta(hours=duration_hours)

        with self._lock:
            self._blocked_ips[ip] = {
                'blocked_at': datetime.utcnow(),
                'reason': reason,
                'block_count': block_count,
                'is_permanent': is_permanent
            }

        # Save to database
        self._save_block_to_database(ip, reason, expires_at, block_count, is_permanent)

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
        """Unblock an IP address"""
        with self._lock:
            self._blocked_ips.pop(ip, None)

        # Update database
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
        Record a failed login attempt
        Memory counter is pre-loaded from DB on startup, so we just increment it
        This ensures protection survives server restarts
        """
        # Ensure we've synced from database first
        self._sync_from_database()

        with self._lock:
            self._suspicious_ips[ip]['failed_logins'] += 1
            self._suspicious_ips[ip]['last_seen'] = datetime.utcnow()
            current_count = self._suspicious_ips[ip]['failed_logins']

        # Check if threshold reached
        if current_count >= self.FAILED_LOGIN_THRESHOLD:
            self.block_ip(ip, f"Too many failed logins ({current_count} in last 24h)")

    def record_rate_limit_hit(self, ip: str):
        """Record a rate limit hit"""
        with self._lock:
            self._suspicious_ips[ip]['rate_limit_hits'] += 1
            self._suspicious_ips[ip]['last_seen'] = datetime.utcnow()

            if self._suspicious_ips[ip]['rate_limit_hits'] >= self.RATE_LIMIT_THRESHOLD:
                self.block_ip(ip, f"Too many rate limit violations ({self._suspicious_ips[ip]['rate_limit_hits']})")

    def record_suspicious_request(self, ip: str, reason: str = ""):
        """Record a suspicious request (SQL injection attempt, etc.)"""
        with self._lock:
            self._suspicious_ips[ip]['suspicious_requests'] += 1
            self._suspicious_ips[ip]['last_seen'] = datetime.utcnow()

            if self._suspicious_ips[ip]['suspicious_requests'] >= self.SUSPICIOUS_THRESHOLD:
                self.block_ip(ip, f"Too many suspicious requests: {reason}")

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
            # Fallback to memory cache with progressive blocking check
            with self._lock:
                current_time = datetime.utcnow()
                expired = []
                for ip, info in self._blocked_ips.items():
                    # Permanent blocks never expire
                    if info.get('is_permanent', False):
                        continue
                    # Calculate expiry based on block count
                    block_count = info.get('block_count', 1)
                    duration_key = min(block_count, 5)
                    duration_hours = self.BLOCK_DURATIONS.get(duration_key, 24)
                    if duration_hours is None:
                        continue  # Permanent
                    if current_time - info.get('blocked_at', current_time) > timedelta(hours=duration_hours):
                        expired.append(ip)
                for ip in expired:
                    del self._blocked_ips[ip]
                return list(self._blocked_ips.keys())

    def get_suspicious_ips(self) -> Dict:
        """Get suspicious IP activity"""
        return dict(self._suspicious_ips)

    def add_to_whitelist(self, ip: str):
        """Add IP to whitelist"""
        self._whitelist.add(ip)
        self.unblock_ip(ip)  # Unblock if previously blocked


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
    Saves to database for persistence + keeps recent logs in memory for fast access
    """

    def __init__(self):
        self._logs: List[Dict] = []
        self._lock = threading.Lock()
        self._max_logs = 1000  # Keep last 1000 logs in memory for fast access

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

        # Add to memory log for fast recent access
        with self._lock:
            self._logs.append(event)
            # Trim if too many logs
            if len(self._logs) > self._max_logs:
                self._logs = self._logs[-self._max_logs:]

        # Also log to file/console
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
            # Fallback to memory logs if database fails
            with self._lock:
                logs = self._logs.copy()
            if event_type:
                logs = [l for l in logs if l['event_type'] == event_type]
            if user_id:
                logs = [l for l in logs if l['user_id'] == user_id]
            if severity:
                logs = [l for l in logs if l['severity'] == severity]
            return sorted(logs, key=lambda x: x['timestamp'], reverse=True)[:limit]

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
            cutoff = datetime.utcnow() - timedelta(hours=hours)
            return [
                l for l in self._logs
                if l['event_type'] == 'LOGIN_FAILED'
                and datetime.fromisoformat(l['timestamp']) > cutoff
            ]

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
            # Fallback to memory-based summary
            now = datetime.utcnow()
            last_24h = now - timedelta(hours=24)

            recent_logs = [
                l for l in self._logs
                if datetime.fromisoformat(l['timestamp']) > last_24h
            ]

            return {
                'total_events_24h': len(recent_logs),
                'failed_logins_24h': len([l for l in recent_logs if l['event_type'] == 'LOGIN_FAILED']),
                'rate_limit_hits_24h': len([l for l in recent_logs if l['event_type'] == 'RATE_LIMIT_EXCEEDED']),
                'blocked_ips_24h': len([l for l in recent_logs if l['event_type'] == 'IP_BLOCKED']),
                'critical_events_24h': len([l for l in recent_logs if l['severity'] == 'CRITICAL']),
                'blocked_ips_count': len(ip_blocker.get_blocked_ips()),
                'suspicious_ips_count': len(ip_blocker.get_suspicious_ips())
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
    logger.info("Initializing advanced security features...")

    # Initialize rate limiter
    init_rate_limiter(app)

    # Register before_request hooks
    @app.before_request
    def security_checks():
        # Check if IP is blocked
        blocked_response = check_ip_blocked()
        if blocked_response:
            return blocked_response

        # Check for suspicious request patterns
        suspicious_response = check_suspicious_request()
        if suspicious_response:
            return suspicious_response

    # Log all requests in production
    @app.after_request
    def log_request(response):
        if is_production() and response.status_code >= 400:
            audit_log(
                "REQUEST_ERROR",
                severity="WARNING" if response.status_code < 500 else "CRITICAL",
                details={
                    "status_code": response.status_code,
                    "path": request.path,
                    "method": request.method
                }
            )
        return response

    logger.info(f"Advanced security initialized (production={is_production()})")

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


def on_login_failed(email: str = None):
    """Call this after failed login"""
    ip = get_remote_address()
    ip_blocker.record_failed_login(ip)
    audit_log(
        "LOGIN_FAILED",
        severity="WARNING",
        details={"email": email[:50] if email else None}
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

                # Get user from database
                user_id = payload.get('user_id')
                if not user_id:
                    return jsonify({
                        "success": False,
                        "error": "Invalid token"
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

    app.register_blueprint(security_bp)
    logger.info("Security routes registered at /api/security/* (admin-protected)")
