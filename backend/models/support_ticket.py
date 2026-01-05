"""
Support Ticket Model for tracking user-reported bugs and feature requests
"""

from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class SupportTicket(db.Model):
    """
    Support Ticket Model for tracking bugs, issues, and feature implementations
    """
    __tablename__ = "support_tickets"

    ticket_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # Ticket reference number (e.g., BUG-001, IMP-001)
    ticket_number = db.Column(db.String(50), unique=True, nullable=False, index=True)

    # Reporter information (no user FK - standalone project)
    reporter_user_id = db.Column(db.Integer, nullable=True, index=True)
    reporter_name = db.Column(db.String(255), nullable=False)
    reporter_email = db.Column(db.String(255), nullable=False)
    reporter_role = db.Column(db.String(100), nullable=True)

    # Ticket details
    ticket_type = db.Column(db.String(50), nullable=False, index=True)  # 'bug', 'issue', 'implementation', 'feature'
    title = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text, nullable=False)
    current_concern = db.Column(db.Text, nullable=True)  # What is the current issue/concern
    proposed_changes = db.Column(db.Text, nullable=True)  # What changes the user proposes
    priority = db.Column(db.String(20), default='medium')  # 'low', 'medium', 'high', 'critical'

    # Status workflow
    status = db.Column(db.String(50), default='draft', index=True)  # 'draft', 'submitted', 'in_review', 'approved', 'rejected', 'in_progress', 'resolved', 'closed'

    # File attachments (screenshots, documents)
    attachments = db.Column(JSONB, nullable=True, default=list)
    """
    Example structure:
    [
        {
            "file_name": "screenshot.png",
            "file_path": "/uploads/support/screenshot.png",
            "file_type": "image/png",
            "file_size": 1024,
            "uploaded_at": "2024-01-01T00:00:00Z"
        }
    ]
    """

    # Admin response
    admin_response = db.Column(db.Text, nullable=True)
    admin_user_id = db.Column(db.Integer, nullable=True)
    admin_name = db.Column(db.String(255), nullable=True)
    response_date = db.Column(db.DateTime, nullable=True)

    # Approval/Rejection
    approved_by_user_id = db.Column(db.Integer, nullable=True)
    approved_by_name = db.Column(db.String(255), nullable=True)
    approval_date = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(db.Text, nullable=True)
    rejected_by_user_id = db.Column(db.Integer, nullable=True)
    rejected_by_name = db.Column(db.String(255), nullable=True)
    rejection_date = db.Column(db.DateTime, nullable=True)

    # Resolution tracking
    resolved_by_user_id = db.Column(db.Integer, nullable=True)
    resolved_by_name = db.Column(db.String(255), nullable=True)
    resolution_date = db.Column(db.DateTime, nullable=True)
    resolution_notes = db.Column(db.Text, nullable=True)

    # Closure tracking - who closed the ticket
    closed_by = db.Column(db.String(50), nullable=True)  # 'client' or 'dev_team'
    closed_by_name = db.Column(db.String(255), nullable=True)
    closed_date = db.Column(db.DateTime, nullable=True)

    # Comments/Communication between client and dev team
    comments = db.Column(JSONB, nullable=True, default=list)
    """
    Example structure:
    [
        {
            "id": "uuid-string",
            "sender_type": "client" | "dev_team",
            "sender_name": "John Doe",
            "sender_email": "john@example.com",
            "message": "Comment text here",
            "created_at": "2024-01-01T00:00:00Z"
        }
    ]
    """

    # Response history - tracks all admin responses (approval, status change, etc.)
    response_history = db.Column(JSONB, nullable=True, default=list)
    """
    Example structure:
    [
        {
            "type": "approval" | "status_change" | "rejection",
            "response": "Response text here",
            "admin_name": "Development Team",
            "new_status": "approved",
            "created_at": "2024-01-01T00:00:00Z"
        }
    ]
    """

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    submitted_at = db.Column(db.DateTime, nullable=True)  # When user submitted (moved from draft)
    is_deleted = db.Column(db.Boolean, default=False, index=True)

    # Composite indexes for common query patterns
    __table_args__ = (
        db.Index('idx_support_status_type', 'status', 'ticket_type'),
        db.Index('idx_support_reporter_status', 'reporter_user_id', 'status'),
        db.Index('idx_support_deleted_status', 'is_deleted', 'status'),
    )

    @staticmethod
    def generate_ticket_number(ticket_type):
        """Generate unique ticket number based on type"""
        prefix_map = {
            'bug': 'BUG',
            'issue': 'ISS',
            'implementation': 'IMP',
            'feature': 'FTR'
        }
        prefix = prefix_map.get(ticket_type, 'TKT')

        # Get the latest ticket number for this type
        latest = SupportTicket.query.filter(
            SupportTicket.ticket_number.like(f'{prefix}-%')
        ).order_by(SupportTicket.ticket_id.desc()).first()

        if latest:
            try:
                last_num = int(latest.ticket_number.split('-')[1])
                new_num = last_num + 1
            except (ValueError, IndexError):
                new_num = 1
        else:
            new_num = 1

        return f"{prefix}-{str(new_num).zfill(4)}"

    def to_dict(self):
        """Convert to dictionary for JSON response"""
        return {
            'ticket_id': self.ticket_id,
            'ticket_number': self.ticket_number,

            # Reporter
            'reporter_user_id': self.reporter_user_id,
            'reporter_name': self.reporter_name,
            'reporter_email': self.reporter_email,
            'reporter_role': self.reporter_role,

            # Ticket details
            'ticket_type': self.ticket_type,
            'title': self.title,
            'description': self.description,
            'current_concern': self.current_concern,
            'proposed_changes': self.proposed_changes,
            'priority': self.priority,
            'status': self.status,

            # Attachments
            'attachments': self.attachments or [],

            # Admin response
            'admin_response': self.admin_response,
            'admin_user_id': self.admin_user_id,
            'admin_name': self.admin_name,
            'response_date': self.response_date.isoformat() if self.response_date else None,

            # Approval/Rejection
            'approved_by_user_id': self.approved_by_user_id,
            'approved_by_name': self.approved_by_name,
            'approval_date': self.approval_date.isoformat() if self.approval_date else None,
            'rejection_reason': self.rejection_reason,
            'rejected_by_user_id': self.rejected_by_user_id,
            'rejected_by_name': self.rejected_by_name,
            'rejection_date': self.rejection_date.isoformat() if self.rejection_date else None,

            # Resolution
            'resolved_by_user_id': self.resolved_by_user_id,
            'resolved_by_name': self.resolved_by_name,
            'resolution_date': self.resolution_date.isoformat() if self.resolution_date else None,
            'resolution_notes': self.resolution_notes,

            # Closure
            'closed_by': self.closed_by,
            'closed_by_name': self.closed_by_name,
            'closed_date': self.closed_date.isoformat() if self.closed_date else None,

            # Comments
            'comments': self.comments or [],

            # Response history
            'response_history': self.response_history or [],

            # Timestamps
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'is_deleted': self.is_deleted,

            # Computed fields
            'is_editable': self.status in ['draft'],
            'can_submit': self.status == 'draft',
            'can_approve': self.status == 'submitted',
            'can_resolve': self.status in ['approved', 'in_progress', 'pending_deployment'],
        }

    def __repr__(self):
        return f"<SupportTicket {self.ticket_number} - {self.status}>"
