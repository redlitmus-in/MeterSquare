"""
Notification Model
Handles notification data structure and database operations
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, Text, TIMESTAMP, ForeignKey, JSON
from sqlalchemy.orm import relationship
from config.db import db
import uuid

class Notification(db.Model):
    """Notification model for storing user notifications"""

    __tablename__ = 'notifications'

    # Primary fields
    id = Column(String(100), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False, index=True)  # ✅ Index for user queries
    target_role = Column(String(50), nullable=True, index=True)  # ✅ Index for role-based queries

    # Notification content
    type = Column(String(50), nullable=False)  # email, approval, rejection, alert, info, success, error, update, reminder
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    priority = Column(String(20), default='medium')  # urgent, high, medium, low
    category = Column(String(50), default='system', index=True)  # ✅ Index for category filtering

    # Status fields
    read = Column(Boolean, default=False, index=True)  # ✅ Index for unread queries
    action_required = Column(Boolean, default=False)
    action_url = Column(Text, nullable=True)
    action_label = Column(String(50), nullable=True)

    # Additional data (renamed from metadata to avoid SQLAlchemy reserved word)
    meta_data = Column('metadata', JSON, nullable=True)

    # Sender information
    sender_id = Column(Integer, nullable=True)
    sender_name = Column(String(100), nullable=True)

    # Timestamps
    created_at = Column(TIMESTAMP, default=datetime.utcnow, nullable=False, index=True)  # ✅ Index for sorting
    read_at = Column(TIMESTAMP, nullable=True)
    deleted_at = Column(TIMESTAMP, nullable=True, index=True)  # ✅ Index for soft-delete filtering

    # ✅ PERFORMANCE: Composite indexes for common query patterns
    __table_args__ = (
        db.Index('idx_notification_user_read', 'user_id', 'read'),  # For: WHERE user_id=X AND read=false
        db.Index('idx_notification_user_deleted', 'user_id', 'deleted_at'),  # For: WHERE user_id=X AND deleted_at IS NULL
        db.Index('idx_notification_user_created', 'user_id', 'created_at'),  # For: WHERE user_id=X ORDER BY created_at
    )

    # Relationships
    user = relationship('User', foreign_keys=[user_id], backref='notifications')

    def __repr__(self):
        return f"<Notification {self.id}: {self.title} for user {self.user_id}>"

    def to_dict(self):
        """Convert notification to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'userId': self.user_id,
            'targetRole': self.target_role,
            'type': self.type,
            'title': self.title,
            'message': self.message,
            'priority': self.priority,
            'category': self.category,
            'read': self.read,
            'actionRequired': self.action_required,
            'actionUrl': self.action_url,
            'actionLabel': self.action_label,
            'metadata': self.meta_data,
            'senderId': self.sender_id,
            'senderName': self.sender_name,
            'timestamp': self.created_at.isoformat() if self.created_at else None,
            'readAt': self.read_at.isoformat() if self.read_at else None,
            'deletedAt': self.deleted_at.isoformat() if self.deleted_at else None
        }

    @classmethod
    def create_notification(cls, user_id, type, title, message, **kwargs):
        """
        Factory method to create a notification

        Args:
            user_id: Target user ID
            type: Notification type
            title: Notification title
            message: Notification message
            **kwargs: Additional optional fields

        Returns:
            Notification instance
        """
        return cls(
            id=str(uuid.uuid4()),
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            target_role=kwargs.get('target_role'),
            priority=kwargs.get('priority', 'medium'),
            category=kwargs.get('category', 'system'),
            action_required=kwargs.get('action_required', False),
            action_url=kwargs.get('action_url'),
            action_label=kwargs.get('action_label'),
            meta_data=kwargs.get('metadata'),
            sender_id=kwargs.get('sender_id'),
            sender_name=kwargs.get('sender_name')
        )

    def mark_as_read(self):
        """Mark notification as read"""
        self.read = True
        self.read_at = datetime.utcnow()

    def mark_as_deleted(self):
        """Soft delete notification"""
        self.deleted_at = datetime.utcnow()
