from flask import request, jsonify, g
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import or_, and_, func
from config.db import db
from models.project import Project
from models.boq import BOQ, BOQDetails
from models.change_request import ChangeRequest
from models.po_child import POChild
from models.user import User
from models.vendor import Vendor
from models.inventory import *
from config.logging import get_logger
from datetime import datetime, timedelta

log = get_logger()

from controllers.buyer.helpers import process_materials_with_negotiated_prices

__all__ = ['get_buyer_dashboard_analytics']


# ============================================================================
# BUYER DASHBOARD ANALYTICS
# ============================================================================

def get_buyer_dashboard_analytics():
    """Get comprehensive dashboard analytics for Buyer role

    Provides overview of:
    - Purchase order statistics (pending, completed, rejected)
    - Vendor approval pipeline status
    - Material delivery tracking
    - Recent activity
    - Performance metrics

    Note: Admin users see all data, Buyer users ONLY see their own assigned CRs
    """
    try:
        from datetime import timedelta
        from sqlalchemy import func, case, and_

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()
        buyer_name = current_user.get('full_name', '')
        # CRITICAL FIX: Use exact role match to prevent "Buyer Admin" being treated as admin
        is_admin = user_role == 'admin'

        # Get period from query params (default 30 days, max 90 for performance)
        try:
            days = int(request.args.get('days', 30))
            days = max(1, min(days, 90))  # Cap at 90 days for performance
        except (ValueError, TypeError):
            days = 30
        period_start = datetime.utcnow() - timedelta(days=days)

        # ========== PURCHASE ORDER STATISTICS ==========
        # Use the EXACT same query and filtering as get_buyer_pending_purchases
        # to ensure dashboard counts match Purchase Orders page

        from sqlalchemy.orm import selectinload, joinedload

        # Query pending purchases using SAME filter as get_buyer_pending_purchases
        if is_admin:
            pending_crs = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),
                joinedload(ChangeRequest.vendor),
                selectinload(ChangeRequest.store_requests),
                selectinload(ChangeRequest.po_children)
            ).filter(
                ChangeRequest.assigned_to_buyer_user_id.isnot(None),
                ChangeRequest.is_deleted == False,
                func.trim(ChangeRequest.status) != 'purchase_completed',
                or_(
                    ChangeRequest.vendor_selection_status.is_(None),
                    ChangeRequest.vendor_selection_status != 'rejected'
                )
            ).all()
        else:
            pending_crs = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),
                joinedload(ChangeRequest.vendor),
                selectinload(ChangeRequest.store_requests),
                selectinload(ChangeRequest.po_children)
            ).filter(
                or_(
                    and_(
                        func.trim(ChangeRequest.status) == 'under_review',
                        ChangeRequest.approval_required_from == 'buyer',
                        ChangeRequest.assigned_to_buyer_user_id == user_id
                    ),
                    and_(
                        func.trim(ChangeRequest.status).in_(['assigned_to_buyer', 'send_to_buyer']),
                        ChangeRequest.assigned_to_buyer_user_id == user_id
                    ),
                    and_(
                        ChangeRequest.assigned_to_buyer_user_id == user_id,
                        func.trim(ChangeRequest.status).in_(['pending_td_approval', 'vendor_approved'])
                    ),
                    and_(
                        func.trim(ChangeRequest.status).in_(['approved_by_pm', 'send_to_buyer']),
                        ChangeRequest.approval_required_from == 'buyer',
                        ChangeRequest.assigned_to_buyer_user_id == user_id
                    )
                ),
                ChangeRequest.is_deleted == False,
                or_(
                    ChangeRequest.vendor_selection_status.is_(None),
                    ChangeRequest.vendor_selection_status != 'rejected'
                )
            ).all()

        # Initialize counters matching Purchase Orders page tabs
        pending_purchase = 0       # Ongoing > Pending Purchase
        store_approved = 0         # Ongoing > Store Approved
        vendor_approved = 0        # Ongoing > Vendor Approved (parent CRs only)
        store_requests_pending_count = 0    # Pending Approval > Store Pending
        vendor_pending_td_count = 0         # Pending Approval > Vendor Pending

        # Cost tracking
        total_pending_cost = 0
        total_completed_cost = 0

        # Track parent CRs that have pending POChildren (for dedup in Pending Approval count)
        parent_ids_with_pending_po_children = set()

        for cr in pending_crs:
            # Skip if no project or boq
            if not cr.project or not cr.boq:
                continue

            cost = float(cr.materials_total_cost or 0)
            has_vendor = cr.selected_vendor_id is not None

            # Compute vendor_selection_pending_td_approval flag (SAME as get_buyer_pending_purchases)
            vendor_selection_pending_td = (cr.vendor_selection_status == 'pending_td_approval')

            # Compute store request flags (SAME as get_buyer_pending_purchases)
            store_requests = cr.store_requests if cr.store_requests else []
            has_store_requests = len(store_requests) > 0

            all_store_approved = False
            store_pending = False
            store_requested_material_names = []  # Initialize before conditional branches

            # Use routed_materials for accurate individual material tracking
            routed_materials_dashboard = cr.routed_materials or {}
            store_routed_names_dashboard = [
                mat_name for mat_name, info in routed_materials_dashboard.items()
                if isinstance(info, dict) and info.get('routing') == 'store'
            ]

            if has_store_requests:
                # Get materials list for counting total materials
                boq_details = cr.boq.details[0] if cr.boq.details else None
                materials_list, _ = process_materials_with_negotiated_prices(cr, boq_details)
                total_materials = len(materials_list)

                approved_count = sum(1 for r in store_requests if r.status and r.status.lower() in ['approved', 'dispatched', 'fulfilled'])
                pending_count = sum(1 for r in store_requests if r.status and r.status.lower() in ['pending', 'send_request'])

                rejected_count_dashboard = sum(1 for r in store_requests if r.status and r.status.lower() == 'rejected')
                all_rejected_dashboard = rejected_count_dashboard == len(store_requests)

                if all_rejected_dashboard:
                    store_requested_material_names = []
                else:
                    store_requested_material_names = store_routed_names_dashboard
                store_requested_count = len(store_requested_material_names)

                all_store_approved = approved_count == len(store_requests) and len(store_requests) > 0
                store_pending = pending_count > 0 and store_requested_count > 0
            elif store_routed_names_dashboard:
                # FIX: Even without IMR records, routed_materials tracks store-routed materials
                store_requested_material_names = store_routed_names_dashboard
                has_store_requests = True

            # Check for POChildren - same logic as get_buyer_pending_purchases
            po_children = [pc for pc in (cr.po_children or []) if not pc.is_deleted]
            has_pending_po_children = any(pc.status == 'pending_td_approval' for pc in po_children)
            if has_pending_po_children:
                parent_ids_with_pending_po_children.add(cr.cr_id)

            # CRITICAL: Skip parent CRs if all their children are sent to TD or approved
            # This matches get_buyer_pending_purchases line 1130 behavior exactly
            # Without this, parent CRs are double-counted (once as parent, once via po_children_stats)
            if po_children:
                all_children_sent_to_td_or_approved = all(
                    pc.vendor_selection_status in ['pending_td_approval', 'approved']
                    for pc in po_children
                )
                if all_children_sent_to_td_or_approved:
                    # Skip this parent CR - it will be counted via POChildren stats
                    continue

            # ✅ FIX: Skip if all materials are handled by POChildren (complete split)
            total_mats_dashboard = len(cr.materials_data or cr.sub_items_data or [])

            # Count materials in POChildren
            po_child_mats_dashboard = 0
            if po_children:
                for pc in po_children:
                    pc_mats = pc.materials_data or pc.sub_items_data or []
                    po_child_mats_dashboard += len(pc_mats) if isinstance(pc_mats, list) else 0

            # Skip if all materials are in POChildren (complete vendor split)
            if po_child_mats_dashboard >= total_mats_dashboard and total_mats_dashboard > 0 and len(po_children) > 0:
                continue

            # Categorize matching PurchaseOrders.tsx EXACTLY

            # PENDING APPROVAL > Store Pending: store_requests_pending flag
            if store_pending:
                store_requests_pending_count += 1
                total_pending_cost += cost
                continue

            # PENDING APPROVAL > Vendor Pending TD: vendor_selection_pending_td_approval
            if vendor_selection_pending_td:
                # Only count if not a parent with pending POChildren (children counted separately)
                if not has_pending_po_children:
                    vendor_pending_td_count += 1
                total_pending_cost += cost
                continue

            # ONGOING > Store Approved: all_store_requests_approved, no vendor
            if all_store_approved and not has_vendor:
                store_approved += 1
                total_pending_cost += cost
                continue

            # ONGOING > Vendor Approved: has vendor, NOT vendor_selection_pending_td_approval
            if has_vendor:
                vendor_approved += 1
                total_pending_cost += cost
                continue

            # ONGOING > Pending Purchase (fallthrough)
            pending_purchase += 1
            total_pending_cost += cost

        # ========== COMPLETED & REJECTED COUNTS (Separate queries) ==========
        # Query completed CRs
        if is_admin:
            completed_filter = and_(
                ChangeRequest.is_deleted == False,
                ChangeRequest.assigned_to_buyer_user_id.isnot(None),
                func.trim(ChangeRequest.status).in_(['purchase_completed', 'routed_to_store'])
            )
        else:
            completed_filter = and_(
                ChangeRequest.is_deleted == False,
                or_(
                    ChangeRequest.assigned_to_buyer_user_id == user_id,
                    ChangeRequest.purchase_completed_by_user_id == user_id
                ),
                func.trim(ChangeRequest.status).in_(['purchase_completed', 'routed_to_store'])
            )

        completed_stats = db.session.query(
            func.trim(ChangeRequest.status).label('status'),
            func.count(ChangeRequest.cr_id).label('count'),
            func.sum(ChangeRequest.materials_total_cost).label('total_cost')
        ).filter(completed_filter).group_by(func.trim(ChangeRequest.status)).all()

        completed = 0
        routed_to_store = 0
        for row in completed_stats:
            if row.status == 'purchase_completed':
                completed = row.count
                total_completed_cost += float(row.total_cost or 0)
            elif row.status == 'routed_to_store':
                routed_to_store = row.count
                total_completed_cost += float(row.total_cost or 0)

        # Query rejected CRs
        if is_admin:
            rejected_filter = and_(
                ChangeRequest.is_deleted == False,
                ChangeRequest.assigned_to_buyer_user_id.isnot(None),
                ChangeRequest.vendor_selection_status == 'rejected'
            )
        else:
            rejected_filter = and_(
                ChangeRequest.is_deleted == False,
                ChangeRequest.assigned_to_buyer_user_id == user_id,
                ChangeRequest.vendor_selection_status == 'rejected'
            )

        rejected_count = ChangeRequest.query.filter(rejected_filter).count()

        # ========== PO CHILDREN STATISTICS (Filtered by buyer) ==========
        # Filter POChildren by buyer's parent CR assignment or POChild assignment
        # Also calculate POChildren costs to add to completed cost (since parent CRs are skipped)
        if is_admin:
            po_children_stats = db.session.query(
                POChild.status,
                func.count(POChild.id).label('count'),
                func.sum(POChild.materials_total_cost).label('total_cost')
            ).filter(
                POChild.is_deleted == False
            ).group_by(POChild.status).all()
        else:
            # Get POChildren where:
            # 1. The parent CR is assigned to this buyer, OR
            # 2. The POChild was completed by this buyer
            po_children_stats = db.session.query(
                POChild.status,
                func.count(POChild.id).label('count'),
                func.sum(POChild.materials_total_cost).label('total_cost')
            ).join(
                ChangeRequest, POChild.parent_cr_id == ChangeRequest.cr_id
            ).filter(
                POChild.is_deleted == False,
                or_(
                    ChangeRequest.assigned_to_buyer_user_id == user_id,
                    ChangeRequest.purchase_completed_by_user_id == user_id,
                    POChild.purchase_completed_by_user_id == user_id
                )
            ).group_by(POChild.status).all()

        po_children_by_status = {}
        po_children_cost_by_status = {}
        for row in po_children_stats:
            po_children_by_status[row.status] = row.count
            po_children_cost_by_status[row.status] = float(row.total_cost or 0)

        po_children_pending_td = po_children_by_status.get('pending_td_approval', 0)
        po_children_approved = po_children_by_status.get('vendor_approved', 0)
        po_children_completed = po_children_by_status.get('purchase_completed', 0) + po_children_by_status.get('routed_to_store', 0)
        po_children_rejected = po_children_by_status.get('rejected', 0)

        # Add POChildren completed costs to total_completed_cost
        # (This compensates for parent CRs that were skipped because they have all-completed children)
        po_children_completed_cost = po_children_cost_by_status.get('purchase_completed', 0) + po_children_cost_by_status.get('routed_to_store', 0)
        total_completed_cost += po_children_completed_cost

        # ========== VENDOR STATISTICS (Optimized single query) ==========
        # Vendor model uses 'status' (active/inactive) instead of is_approved
        vendor_stats = db.session.query(
            Vendor.status,
            func.count(Vendor.vendor_id).label('count')
        ).filter(
            Vendor.is_deleted == False
        ).group_by(Vendor.status).all()

        # CRITICAL FIX: Map status to COUNT, not status to status
        vendor_by_status = {row.status: row.count for row in vendor_stats}
        total_vendors = vendor_by_status.get('active', 0)
        pending_vendor_approval = vendor_by_status.get('inactive', 0)

        # ========== DELIVERY TRACKING (Optimized) ==========
        # Count all delivery notes (no buyer filtering - shows all deliveries globally)
        # This is intentional as buyers need visibility into all material movements
        delivery_stats = {
            'total': 0,
            'draft': 0,
            'issued': 0,
            'in_transit': 0,
            'delivered': 0,
            'pending_receipt': 0
        }

        try:
            delivery_stats_query = db.session.query(
                func.upper(MaterialDeliveryNote.status).label('status'),
                func.count(MaterialDeliveryNote.delivery_note_id).label('count')
            ).group_by(func.upper(MaterialDeliveryNote.status)).all()
        except Exception as e:
            log.error(f"Failed to fetch delivery stats: {e}")
            delivery_stats_query = []  # Return empty, don't crash dashboard

        for row in delivery_stats_query:
            status = row.status or ''
            count = row.count or 0
            delivery_stats['total'] += count

            if status == 'DRAFT':
                delivery_stats['draft'] += count
            elif status == 'ISSUED':
                delivery_stats['issued'] += count
                delivery_stats['pending_receipt'] += count
            elif status == 'IN_TRANSIT':
                delivery_stats['in_transit'] += count
                delivery_stats['pending_receipt'] += count
            elif status == 'DELIVERED':
                delivery_stats['delivered'] += count

        # ========== STORE REQUEST STATISTICS (Optimized single query) ==========
        # Filter by user for buyers
        if is_admin:
            store_stats = db.session.query(
                ChangeRequest.store_request_status,
                func.count(ChangeRequest.cr_id).label('count')
            ).filter(
                ChangeRequest.is_deleted == False,
                ChangeRequest.store_request_status.isnot(None)
            ).group_by(ChangeRequest.store_request_status).all()
        else:
            store_stats = db.session.query(
                ChangeRequest.store_request_status,
                func.count(ChangeRequest.cr_id).label('count')
            ).filter(
                ChangeRequest.is_deleted == False,
                ChangeRequest.store_request_status.isnot(None),
                or_(
                    ChangeRequest.assigned_to_buyer_user_id == user_id,
                    ChangeRequest.purchase_completed_by_user_id == user_id
                )
            ).group_by(ChangeRequest.store_request_status).all()

        store_by_status = {row.store_request_status: row.count for row in store_stats}
        store_pending_vendor = store_by_status.get('pending_vendor_delivery', 0)
        store_delivered = store_by_status.get('delivered_to_store', 0)
        store_dispatched = store_by_status.get('dispatched_to_site', 0)
        store_completed = store_by_status.get('delivered_to_site', 0)

        # ========== RECENT ACTIVITY (with eager loading) ==========
        recent_period = datetime.utcnow() - timedelta(days=7)

        # Use joinedload to avoid N+1 queries - filter by user for buyers
        if is_admin:
            recent_completions = ChangeRequest.query.options(
                joinedload(ChangeRequest.project)
            ).filter(
                ChangeRequest.is_deleted == False,
                ChangeRequest.status.in_(['purchase_completed', 'routed_to_store']),
                ChangeRequest.purchase_completion_date >= recent_period
            ).order_by(ChangeRequest.purchase_completion_date.desc()).limit(5).all()
        else:
            recent_completions = ChangeRequest.query.options(
                joinedload(ChangeRequest.project)
            ).filter(
                ChangeRequest.is_deleted == False,
                ChangeRequest.status.in_(['purchase_completed', 'routed_to_store']),
                ChangeRequest.purchase_completion_date >= recent_period,
                or_(
                    ChangeRequest.assigned_to_buyer_user_id == user_id,
                    ChangeRequest.purchase_completed_by_user_id == user_id
                )
            ).order_by(ChangeRequest.purchase_completion_date.desc()).limit(5).all()

        recent_activity = []
        for cr in recent_completions:
            project = cr.project

            recent_activity.append({
                'cr_id': cr.cr_id,
                'formatted_id': f"CR-{cr.cr_id}",
                'project_name': project.project_name if project else 'Unknown',
                'item_name': cr.item_name,
                'total_cost': float(cr.materials_total_cost or 0),
                'status': cr.status,
                'completed_at': cr.purchase_completion_date.isoformat() if cr.purchase_completion_date else None,
                'vendor_name': cr.selected_vendor_name
            })

        # ========== PROJECTS OVERVIEW ==========
        # Get unique projects from buyer-stage CRs using optimized query
        if is_admin:
            project_filter = and_(
                ChangeRequest.is_deleted == False,
                ChangeRequest.assigned_to_buyer_user_id.isnot(None)
            )
        else:
            project_filter = and_(
                ChangeRequest.is_deleted == False,
                or_(
                    ChangeRequest.assigned_to_buyer_user_id == user_id,
                    ChangeRequest.purchase_completed_by_user_id == user_id
                )
            )
        project_ids_query = db.session.query(
            func.distinct(ChangeRequest.project_id)
        ).filter(project_filter).all()
        project_ids = {row[0] for row in project_ids_query if row[0]}

        active_projects = Project.query.filter(
            Project.project_id.in_(list(project_ids)),
            Project.is_deleted == False,
            Project.status.in_(['Active', 'In Progress', 'active', 'in_progress'])
        ).count() if project_ids else 0

        # ========== PERFORMANCE METRICS ==========
        # Calculate completion rate using SIMPLIFIED logic that matches frontend client-side calculations
        # Frontend uses: completed / (ongoing + pending_approval + completed) * 100
        # routed_to_store = buyer completed purchase, counts as completed (PM warehouse step is separate)
        total_ongoing = pending_purchase + store_approved + vendor_approved + po_children_approved
        total_pending_approval = store_requests_pending_count + vendor_pending_td_count + po_children_pending_td
        total_completed_all = completed + routed_to_store + po_children_completed
        total_actionable = total_ongoing + total_pending_approval + total_completed_all

        # IMPROVED: Use simple division with better handling of edge cases
        if total_actionable > 0:
            completion_rate = round((total_completed_all * 100.0) / total_actionable, 1)
        else:
            completion_rate = 0.0

        # Calculate average processing time (from vendor approved to purchase completed)
        # Filter by user for buyers
        avg_processing_days = 0
        perf_filter = [
            ChangeRequest.is_deleted == False,
            ChangeRequest.status.in_(['purchase_completed', 'routed_to_store']),
            ChangeRequest.vendor_approval_date.isnot(None),
            ChangeRequest.purchase_completion_date.isnot(None)
        ]
        if not is_admin:
            perf_filter.append(or_(
                ChangeRequest.assigned_to_buyer_user_id == user_id,
                ChangeRequest.purchase_completed_by_user_id == user_id
            ))

        completed_crs_with_dates = ChangeRequest.query.filter(
            *perf_filter
        ).limit(50).all()

        if completed_crs_with_dates:
            total_days = 0
            count = 0
            for cr in completed_crs_with_dates:
                try:
                    if cr.vendor_approval_date and cr.purchase_completion_date:
                        delta = cr.purchase_completion_date - cr.vendor_approval_date
                        # Sanity check: only count positive durations
                        if delta.days >= 0:
                            total_days += delta.days
                            count += 1
                        else:
                            log.warning(f"CR {cr.cr_id} has negative processing time: {delta.days} days")
                except (TypeError, AttributeError) as e:
                    log.warning(f"Invalid date data for CR {cr.cr_id}: {e}")
                    continue
            avg_processing_days = round(total_days / count, 1) if count > 0 else 0

        # ========== TREND DATA (Daily/Weekly purchase counts) ==========
        # Get daily purchase completions for trend chart - filter by user for buyers
        trend_base_filter = [
            ChangeRequest.is_deleted == False,
            ChangeRequest.status.in_(['purchase_completed', 'routed_to_store']),
            ChangeRequest.purchase_completion_date >= period_start
        ]
        if not is_admin:
            trend_base_filter.append(or_(
                ChangeRequest.assigned_to_buyer_user_id == user_id,
                ChangeRequest.purchase_completed_by_user_id == user_id
            ))

        daily_trends = db.session.query(
            func.date(ChangeRequest.purchase_completion_date).label('date'),
            func.count(ChangeRequest.cr_id).label('count'),
            func.sum(ChangeRequest.materials_total_cost).label('total_cost')
        ).filter(
            *trend_base_filter
        ).group_by(
            func.date(ChangeRequest.purchase_completion_date)
        ).order_by(func.date(ChangeRequest.purchase_completion_date)).all()

        # Format trend data
        purchase_trends = []
        for row in daily_trends:
            if row.date:
                purchase_trends.append({
                    'date': row.date.isoformat() if hasattr(row.date, 'isoformat') else str(row.date),
                    'count': row.count or 0,
                    'cost': float(row.total_cost or 0)
                })

        # Weekly aggregation for longer periods
        weekly_trends = []
        if days > 14:
            weekly_data = db.session.query(
                func.date_trunc('week', ChangeRequest.purchase_completion_date).label('week'),
                func.count(ChangeRequest.cr_id).label('count'),
                func.sum(ChangeRequest.materials_total_cost).label('total_cost')
            ).filter(
                *trend_base_filter
            ).group_by(
                func.date_trunc('week', ChangeRequest.purchase_completion_date)
            ).order_by(func.date_trunc('week', ChangeRequest.purchase_completion_date)).all()

            for row in weekly_data:
                if row.week:
                    week_str = row.week.isoformat() if hasattr(row.week, 'isoformat') else str(row.week)
                    weekly_trends.append({
                        'week': week_str[:10],  # Just the date part
                        'count': row.count or 0,
                        'cost': float(row.total_cost or 0)
                    })

        # ========== COST ANALYSIS BY PROJECT ==========
        # Build filter for cost analysis - filter by user for buyers
        # All buyer-relevant statuses for cost analysis
        all_buyer_statuses = ['under_review', 'assigned_to_buyer', 'send_to_buyer', 'approved_by_pm',
                              'pending_td_approval', 'vendor_approved', 'purchase_completed', 'routed_to_store']
        cost_filter = [
            ChangeRequest.is_deleted == False,
            Project.is_deleted == False,
            ChangeRequest.status.in_(all_buyer_statuses + ['pending'])
        ]
        if not is_admin:
            cost_filter.append(or_(
                ChangeRequest.assigned_to_buyer_user_id == user_id,
                ChangeRequest.purchase_completed_by_user_id == user_id
            ))

        project_cost_data = db.session.query(
            Project.project_id,
            Project.project_name,
            func.count(ChangeRequest.cr_id).label('po_count'),
            func.sum(ChangeRequest.materials_total_cost).label('total_cost'),
            func.sum(case(
                (ChangeRequest.status.in_(['purchase_completed', 'routed_to_store']), ChangeRequest.materials_total_cost),
                else_=0
            )).label('completed_cost'),
            func.sum(case(
                (ChangeRequest.status.in_(['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'vendor_approved', 'pending_td_approval']), ChangeRequest.materials_total_cost),
                else_=0
            )).label('pending_cost')
        ).join(
            Project, ChangeRequest.project_id == Project.project_id
        ).filter(
            *cost_filter
        ).group_by(
            Project.project_id,
            Project.project_name
        ).order_by(func.sum(ChangeRequest.materials_total_cost).desc()).limit(10).all()

        cost_by_project = []
        for row in project_cost_data:
            cost_by_project.append({
                'project_id': row.project_id,
                'project_name': row.project_name or 'Unknown',
                'po_count': row.po_count or 0,
                'total_cost': float(row.total_cost or 0),
                'completed_cost': float(row.completed_cost or 0),
                'pending_cost': float(row.pending_cost or 0)
            })

        # ========== COST ANALYSIS BY VENDOR ==========
        # Build filter for vendor cost analysis - filter by user for buyers
        vendor_cost_filter = [
            ChangeRequest.is_deleted == False,
            ChangeRequest.selected_vendor_id.isnot(None),
            ChangeRequest.status.in_(['purchase_completed', 'routed_to_store', 'vendor_approved', 'pending_td_approval'])
        ]
        if not is_admin:
            vendor_cost_filter.append(or_(
                ChangeRequest.assigned_to_buyer_user_id == user_id,
                ChangeRequest.purchase_completed_by_user_id == user_id
            ))

        vendor_cost_data = db.session.query(
            ChangeRequest.selected_vendor_id,
            ChangeRequest.selected_vendor_name,
            func.count(ChangeRequest.cr_id).label('po_count'),
            func.sum(ChangeRequest.materials_total_cost).label('total_cost'),
            func.avg(ChangeRequest.materials_total_cost).label('avg_cost')
        ).filter(
            *vendor_cost_filter
        ).group_by(
            ChangeRequest.selected_vendor_id,
            ChangeRequest.selected_vendor_name
        ).order_by(func.sum(ChangeRequest.materials_total_cost).desc()).limit(10).all()

        cost_by_vendor = []
        for row in vendor_cost_data:
            cost_by_vendor.append({
                'vendor_id': row.selected_vendor_id,
                'vendor_name': row.selected_vendor_name or 'Unknown Vendor',
                'po_count': row.po_count or 0,
                'total_cost': float(row.total_cost or 0),
                'avg_cost': float(row.avg_cost or 0)
            })

        # ========== VENDOR PERFORMANCE METRICS ==========
        # Calculate vendor performance based on delivery times and completion rates
        # Use batched query to avoid N+1 issue
        vendor_performance = []
        if vendor_cost_data:
            # Get top 5 vendor IDs for batched query
            top_vendor_ids = [v.selected_vendor_id for v in vendor_cost_data[:5]]
            vendor_name_map = {v.selected_vendor_id: v.selected_vendor_name or 'Unknown' for v in vendor_cost_data[:5]}
            vendor_spend_map = {v.selected_vendor_id: float(v.total_cost or 0) for v in vendor_cost_data[:5]}

            # Single batched query for all vendor metrics - filter by user for buyers
            vendor_perf_filter = [
                ChangeRequest.is_deleted == False,
                ChangeRequest.selected_vendor_id.in_(top_vendor_ids)
            ]
            if not is_admin:
                vendor_perf_filter.append(or_(
                    ChangeRequest.assigned_to_buyer_user_id == user_id,
                    ChangeRequest.purchase_completed_by_user_id == user_id
                ))

            vendor_metrics = db.session.query(
                ChangeRequest.selected_vendor_id,
                func.count(ChangeRequest.cr_id).label('total'),
                func.sum(case(
                    (ChangeRequest.status.in_(['purchase_completed', 'routed_to_store']), 1),
                    else_=0
                )).label('completed'),
                func.avg(case(
                    (and_(
                        ChangeRequest.vendor_approval_date.isnot(None),
                        ChangeRequest.purchase_completion_date.isnot(None)
                    ), func.extract('epoch', ChangeRequest.purchase_completion_date - ChangeRequest.vendor_approval_date) / 86400),
                    else_=None
                )).label('avg_days')
            ).filter(
                *vendor_perf_filter
            ).group_by(ChangeRequest.selected_vendor_id).all()

            # Build performance data from batched results
            metrics_map = {m.selected_vendor_id: m for m in vendor_metrics}

            for vendor_id in top_vendor_ids:
                m = metrics_map.get(vendor_id)
                if m:
                    # CRITICAL FIX: Proper division by zero handling
                    if m.total and m.total > 0:
                        completion_pct = round((m.completed or 0) / m.total * 100, 1)
                    else:
                        completion_pct = 0.0

                    avg_fulfillment = round(float(m.avg_days or 0), 1)

                    vendor_performance.append({
                        'vendor_id': vendor_id,
                        'vendor_name': vendor_name_map.get(vendor_id, 'Unknown'),
                        'total_orders': m.total or 0,
                        'completed_orders': m.completed or 0,
                        'completion_rate': completion_pct,
                        'avg_fulfillment_days': avg_fulfillment,
                        'total_spend': vendor_spend_map.get(vendor_id, 0),
                        'performance_score': min(100, max(0, completion_pct - (avg_fulfillment * 2)))  # Higher completion, lower days = better
                    })

        # ========== MATERIAL CATEGORIES BREAKDOWN ==========
        # Analyze materials from completed CRs - filter by user for buyers
        material_filter = [
            ChangeRequest.is_deleted == False,
            ChangeRequest.status.in_(['purchase_completed', 'routed_to_store', 'vendor_approved']),
            ChangeRequest.created_at >= period_start
        ]
        if not is_admin:
            material_filter.append(or_(
                ChangeRequest.assigned_to_buyer_user_id == user_id,
                ChangeRequest.purchase_completed_by_user_id == user_id
            ))

        material_categories = {}
        material_crs = ChangeRequest.query.filter(
            *material_filter
        ).limit(100).all()

        for cr in material_crs:
            materials = cr.sub_items_data or cr.materials_data or []
            # CRITICAL FIX: Validate data type before processing
            if not isinstance(materials, list):
                log.warning(f"Invalid materials data type for CR {cr.cr_id}: {type(materials)}")
                continue

            for mat in materials:
                if not isinstance(mat, dict):
                    continue  # Skip invalid entries

                # Handle nested materials structure
                if 'materials' in mat:
                    for sub_mat in mat.get('materials', []):
                        if not isinstance(sub_mat, dict):
                            continue
                        cat = sub_mat.get('category', 'Uncategorized')
                        # IMPROVED: Proper cost calculation with None handling
                        total_price = sub_mat.get('total_price')
                        if total_price is not None:
                            cost = float(total_price)
                        else:
                            quantity = sub_mat.get('quantity', 0)
                            unit_price = sub_mat.get('unit_price', 0)
                            cost = float(quantity) * float(unit_price)

                        if cat not in material_categories:
                            material_categories[cat] = {'count': 0, 'cost': 0}
                        material_categories[cat]['count'] += 1
                        material_categories[cat]['cost'] += cost
                else:
                    cat = mat.get('category', 'Uncategorized')
                    # IMPROVED: Proper cost calculation with None handling
                    total_price = mat.get('total_price')
                    if total_price is not None:
                        cost = float(total_price)
                    else:
                        quantity = mat.get('quantity', 0)
                        unit_price = mat.get('unit_price', 0)
                        cost = float(quantity) * float(unit_price)

                    if cat not in material_categories:
                        material_categories[cat] = {'count': 0, 'cost': 0}
                    material_categories[cat]['count'] += 1
                    material_categories[cat]['cost'] += cost

        # Sort by cost and get top categories
        sorted_categories = sorted(material_categories.items(), key=lambda x: x[1]['cost'], reverse=True)[:10]
        category_breakdown = [
            {'category': cat, 'count': data['count'], 'cost': round(data['cost'], 2)}
            for cat, data in sorted_categories
        ]

        # ========== MONTHLY COMPARISON ==========
        # Compare this month vs last month - filter by user for buyers
        now = datetime.utcnow()
        this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)

        monthly_base_filter = [
            ChangeRequest.is_deleted == False,
            ChangeRequest.status.in_(['purchase_completed', 'routed_to_store'])
        ]
        if not is_admin:
            monthly_base_filter.append(or_(
                ChangeRequest.assigned_to_buyer_user_id == user_id,
                ChangeRequest.purchase_completed_by_user_id == user_id
            ))

        this_month_stats = db.session.query(
            func.count(ChangeRequest.cr_id).label('count'),
            func.sum(ChangeRequest.materials_total_cost).label('cost')
        ).filter(
            *monthly_base_filter,
            ChangeRequest.purchase_completion_date >= this_month_start
        ).first()

        last_month_stats = db.session.query(
            func.count(ChangeRequest.cr_id).label('count'),
            func.sum(ChangeRequest.materials_total_cost).label('cost')
        ).filter(
            *monthly_base_filter,
            ChangeRequest.purchase_completion_date >= last_month_start,
            ChangeRequest.purchase_completion_date < this_month_start
        ).first()

        this_month_count = this_month_stats.count or 0
        this_month_cost = float(this_month_stats.cost or 0)
        last_month_count = last_month_stats.count or 0
        last_month_cost = float(last_month_stats.cost or 0)

        count_change = ((this_month_count - last_month_count) / max(last_month_count, 1)) * 100
        cost_change = ((this_month_cost - last_month_cost) / max(last_month_cost, 1)) * 100

        monthly_comparison = {
            'this_month': {
                'count': this_month_count,
                'cost': round(this_month_cost, 2)
            },
            'last_month': {
                'count': last_month_count,
                'cost': round(last_month_cost, 2)
            },
            'change': {
                'count_pct': round(count_change, 1),
                'cost_pct': round(cost_change, 1)
            }
        }

        # ========== BUILD RESPONSE ==========
        # Response structure matches Purchase Orders page tab counts EXACTLY:
        # - Ongoing = pending_purchase + store_approved + vendor_approved + po_children.vendor_approved
        # - Pending Approval = store_requests_pending + vendor_pending_td + po_children.pending_td_approval
        # - Completed = completed + routed_to_store + po_children.completed (buyer completed purchase)
        # - Rejected = rejected + po_children.rejected

        return jsonify({
            "success": True,
            "period_days": days,
            "generated_at": datetime.utcnow().isoformat(),

            "purchase_orders": {
                # Ongoing sub-tabs (matching Purchase Orders > Ongoing tab)
                "pending_vendor_selection": pending_purchase,  # Ongoing > Pending Purchase
                "store_approved": store_approved,             # Ongoing > Store Approved (NEW)
                "ready_to_complete": vendor_approved,         # Ongoing > Vendor Approved (parent CRs)

                # Pending Approval sub-tabs (matching Purchase Orders > Pending Approval tab)
                "pending_td_approval": vendor_pending_td_count,  # Vendor Pending TD (deduplicated)
                "store_requests_pending": store_requests_pending_count,  # Store Pending

                # Completed & Rejected
                "completed": completed + routed_to_store,
                "routed_to_store": routed_to_store,
                "rejected": rejected_count,

                # Totals matching Purchase Orders page
                # IMPORTANT: Include po_children_approved in ongoing, po_children_pending_td in pending_approval
                "total_ongoing": pending_purchase + store_approved + vendor_approved + po_children_approved,
                "total_pending_approval": store_requests_pending_count + vendor_pending_td_count + po_children_pending_td,
                "total_pending": pending_purchase + store_approved + vendor_approved + store_requests_pending_count + vendor_pending_td_count + po_children_approved + po_children_pending_td,
                "total_completed": completed + routed_to_store + po_children_completed,
                "total_pending_cost": round(total_pending_cost, 2),
                "total_completed_cost": round(total_completed_cost, 2)
            },

            "po_children": {
                "pending_td_approval": po_children_pending_td,
                "vendor_approved": po_children_approved,
                "completed": po_children_completed,
                "rejected": po_children_rejected,
                "total": po_children_pending_td + po_children_approved + po_children_completed + po_children_rejected
            },

            "vendors": {
                "total_approved": total_vendors,
                "pending_approval": pending_vendor_approval
            },

            "deliveries": delivery_stats,

            "store_requests": {
                "pending_vendor_delivery": store_pending_vendor,
                "delivered_to_store": store_delivered,
                "dispatched_to_site": store_dispatched,
                "delivered_to_site": store_completed,
                "total_in_pipeline": store_pending_vendor + store_delivered + store_dispatched
            },

            "projects": {
                "total_with_purchases": len(project_ids),
                "active": active_projects
            },

            "performance": {
                "completion_rate": completion_rate,
                "avg_processing_days": avg_processing_days
            },

            "recent_activity": recent_activity,

            "workload": {
                "pending_actions": pending_purchase + store_approved + vendor_approved,
                "awaiting_approval": vendor_pending_td_count + po_children_pending_td + store_requests_pending_count,
                "pending_deliveries": delivery_stats['pending_receipt'],
                "status": "high" if (pending_purchase + store_approved + vendor_approved) > 10 else "moderate" if (pending_purchase + store_approved + vendor_approved) > 5 else "normal"
            },

            # ========== NEW ANALYTICS DATA ==========
            "trends": {
                "daily": purchase_trends,
                "weekly": weekly_trends
            },

            "cost_analysis": {
                "by_project": cost_by_project,
                "by_vendor": cost_by_vendor
            },

            "vendor_performance": vendor_performance,

            "material_categories": category_breakdown,

            "monthly_comparison": monthly_comparison
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error getting buyer dashboard analytics: {e}")
        log.error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": f"Failed to get dashboard analytics: {str(e)}"
        }), 500
