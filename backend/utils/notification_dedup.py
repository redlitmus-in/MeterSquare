"""
Notification deduplication utility.
Extracted to its own module to avoid circular imports between
comprehensive_notification_service and labour_notification_service.
"""

from datetime import datetime, timedelta
from models.notification import Notification
from config.logging import get_logger

log = get_logger()


def check_duplicate_notification(user_id, title_pattern, metadata_key, metadata_value, minutes=5):
    """
    Check if a similar notification was already sent recently.
    Returns True if duplicate exists, False otherwise.
    """
    try:
        cutoff_time = datetime.utcnow() - timedelta(minutes=minutes)
        existing = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.deleted_at.is_(None),
            Notification.created_at >= cutoff_time,
            Notification.title.ilike(f'%{title_pattern}%')
        ).first()

        if existing:
            caller_wants_metadata_match = metadata_key and metadata_value is not None

            if caller_wants_metadata_match:
                # Caller provided metadata criteria – only match if existing notification
                # also has matching metadata.  If the old notification has no metadata
                # we must NOT treat it as a duplicate (false-positive).
                if existing.meta_data:
                    stored_value = existing.meta_data.get(metadata_key)
                    if str(stored_value) == str(metadata_value):
                        log.info(f"[DuplicateCheck] Found duplicate notification for user {user_id}, {metadata_key}={metadata_value}")
                        return True
                # Old notification has no metadata or metadata doesn't match – not a dup
                log.debug(f"[DuplicateCheck] Title matched but metadata didn't for user {user_id}, title: {title_pattern}")
                return False
            else:
                # Caller didn't supply metadata criteria – title match alone is enough
                log.info(f"[DuplicateCheck] Found duplicate notification by title for user {user_id}, title pattern: {title_pattern}")
                return True
        return False
    except Exception as e:
        log.error(f"[DuplicateCheck] Error checking duplicate: {e}")
        return False
