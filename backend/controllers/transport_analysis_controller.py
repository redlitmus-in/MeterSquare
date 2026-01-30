"""
Transport Fee Analysis Controller
API endpoints for comparing BOQ estimated vs actual transport fees
"""

from flask import Blueprint, jsonify, request
from utils.transport_fee_analysis import (
    get_project_transport_comparison,
    get_all_projects_transport_comparison
)

transport_analysis_bp = Blueprint('transport_analysis', __name__)


@transport_analysis_bp.route('/api/transport-analysis/project/<int:project_id>', methods=['GET'])
def get_project_transport_analysis(project_id):
    """
    Get transport fee comparison for a specific project

    Returns:
        {
            "success": true,
            "data": {
                "project_id": 1,
                "project_name": "Villa Construction",
                "boq_estimated_transport": 15000.00,
                "actual_transport_spent": 12500.00,
                "transport_variance": 2500.00,
                "variance_percentage": 16.67,
                "profit_status": "PROFIT",
                "breakdown": {
                    "vendor_to_store": 3000.00,
                    "store_to_site": 7000.00,
                    "site_to_store": 1500.00,
                    "asset_delivery": 800.00,
                    "asset_return": 200.00
                }
            }
        }
    """
    try:
        data = get_project_transport_comparison(project_id)

        if 'error' in data:
            return jsonify({
                'success': False,
                'error': data['error']
            }), 404

        return jsonify({
            'success': True,
            'data': data
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@transport_analysis_bp.route('/api/transport-analysis/all-projects', methods=['GET'])
def get_all_projects_transport_analysis():
    """
    Get transport fee comparison for all projects

    Returns:
        {
            "success": true,
            "data": [
                {
                    "project_id": 1,
                    "project_name": "Villa Construction",
                    "boq_estimated_transport": 15000.00,
                    "actual_transport_spent": 12500.00,
                    "transport_variance": 2500.00,
                    "variance_percentage": 16.67,
                    "profit_status": "PROFIT",
                    "breakdown": { ... }
                },
                ...
            ],
            "summary": {
                "total_estimated": 50000.00,
                "total_actual": 45000.00,
                "total_variance": 5000.00,
                "overall_variance_percentage": 10.00
            }
        }
    """
    try:
        projects = get_all_projects_transport_comparison()

        # Calculate summary
        total_estimated = sum(p['boq_estimated_transport'] for p in projects)
        total_actual = sum(p['actual_transport_spent'] for p in projects)
        total_variance = total_estimated - total_actual
        overall_variance_pct = (total_variance / total_estimated * 100) if total_estimated > 0 else 0

        return jsonify({
            'success': True,
            'data': projects,
            'summary': {
                'total_estimated': round(total_estimated, 2),
                'total_actual': round(total_actual, 2),
                'total_variance': round(total_variance, 2),
                'overall_variance_percentage': round(overall_variance_pct, 2),
                'total_projects': len(projects)
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@transport_analysis_bp.route('/api/transport-analysis/summary', methods=['GET'])
def get_transport_summary():
    """
    Get high-level transport fee summary across all projects

    Returns:
        {
            "success": true,
            "data": {
                "total_estimated": 50000.00,
                "total_actual": 45000.00,
                "total_variance": 5000.00,
                "variance_percentage": 10.00,
                "projects_in_profit": 8,
                "projects_in_loss": 2,
                "projects_break_even": 1
            }
        }
    """
    try:
        projects = get_all_projects_transport_comparison()

        total_estimated = sum(p['boq_estimated_transport'] for p in projects)
        total_actual = sum(p['actual_transport_spent'] for p in projects)
        total_variance = total_estimated - total_actual
        variance_pct = (total_variance / total_estimated * 100) if total_estimated > 0 else 0

        profit_count = sum(1 for p in projects if p['profit_status'] == 'PROFIT')
        loss_count = sum(1 for p in projects if p['profit_status'] == 'LOSS')
        break_even_count = sum(1 for p in projects if p['profit_status'] == 'BREAK-EVEN')

        return jsonify({
            'success': True,
            'data': {
                'total_estimated': round(total_estimated, 2),
                'total_actual': round(total_actual, 2),
                'total_variance': round(total_variance, 2),
                'variance_percentage': round(variance_pct, 2),
                'projects_in_profit': profit_count,
                'projects_in_loss': loss_count,
                'projects_break_even': break_even_count,
                'total_projects': len(projects)
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
