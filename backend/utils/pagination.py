"""
Pagination Utility

Single source of truth for pagination across the application.
All controllers should use these helpers instead of hardcoding values.

Usage:
    from utils.pagination import get_pagination_params, create_pagination_response

    # In your route handler:
    page, page_size = get_pagination_params(request)

    # After querying:
    response = create_pagination_response(
        items=items,
        total_count=total,
        page=page,
        page_size=page_size
    )
"""

from flask import Request
from typing import Any, Dict, List, Tuple


# ==================== PAGINATION CONFIGURATION ====================
# Single source of truth - modify these values to change app-wide defaults

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100
MIN_PAGE_SIZE = 1
DEFAULT_PAGE = 1


# ==================== HELPER FUNCTIONS ====================

def get_pagination_params(request: Request) -> Tuple[int, int]:
    """
    Extract and validate pagination parameters from request.

    Supports both naming conventions:
    - page_size / per_page
    - pageSize / perPage

    Args:
        request: Flask request object

    Returns:
        Tuple of (page, page_size) with validated values
    """
    # Get page number
    page = request.args.get('page', DEFAULT_PAGE, type=int)
    page = max(page, 1)  # Ensure page is at least 1

    # Get page size - support multiple parameter names
    page_size = (
        request.args.get('page_size', type=int) or
        request.args.get('per_page', type=int) or
        request.args.get('pageSize', type=int) or
        request.args.get('perPage', type=int) or
        request.args.get('limit', type=int) or
        DEFAULT_PAGE_SIZE
    )

    # Clamp page_size to valid range
    page_size = max(MIN_PAGE_SIZE, min(page_size, MAX_PAGE_SIZE))

    return page, page_size


def calculate_offset(page: int, page_size: int) -> int:
    """
    Calculate SQL offset from page and page_size.

    Args:
        page: Current page number (1-indexed)
        page_size: Number of items per page

    Returns:
        Offset value for SQL query
    """
    return (page - 1) * page_size


def calculate_total_pages(total_count: int, page_size: int) -> int:
    """
    Calculate total number of pages.

    Args:
        total_count: Total number of items
        page_size: Number of items per page

    Returns:
        Total number of pages
    """
    if page_size <= 0:
        return 0
    return (total_count + page_size - 1) // page_size


def create_pagination_response(
    items: List[Any],
    total_count: int,
    page: int,
    page_size: int
) -> Dict[str, Any]:
    """
    Create standardized pagination response object.

    Args:
        items: List of items for current page
        total_count: Total number of items across all pages
        page: Current page number
        page_size: Number of items per page

    Returns:
        Dictionary with pagination metadata
    """
    total_pages = calculate_total_pages(total_count, page_size)

    return {
        "page": page,
        "page_size": page_size,
        "total_count": total_count,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1
    }


def create_empty_pagination_response(page: int = 1, page_size: int = DEFAULT_PAGE_SIZE) -> Dict[str, Any]:
    """
    Create pagination response for empty results.

    Args:
        page: Current page number
        page_size: Number of items per page

    Returns:
        Dictionary with pagination metadata for empty results
    """
    return {
        "page": page,
        "page_size": page_size,
        "total_count": 0,
        "total_pages": 0,
        "has_next": False,
        "has_prev": False
    }


def paginate_list(items: List[Any], page: int, page_size: int) -> Tuple[List[Any], Dict[str, Any]]:
    """
    Paginate an in-memory list.

    Useful for paginating results that are already loaded in memory.

    Args:
        items: Full list of items
        page: Current page number (1-indexed)
        page_size: Number of items per page

    Returns:
        Tuple of (paginated_items, pagination_metadata)
    """
    total_count = len(items)
    offset = calculate_offset(page, page_size)

    paginated_items = items[offset:offset + page_size]
    pagination = create_pagination_response(paginated_items, total_count, page, page_size)

    return paginated_items, pagination
