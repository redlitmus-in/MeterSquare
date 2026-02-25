"""
Labour Management Controller
Re-export file for backward compatibility.
Actual implementations split into domain modules:
- labour_requisition_controller.py (Steps 1-3: Workers + Requisitions + Approvals)
- labour_assignment_controller.py  (Steps 4-6: Assign + Arrivals + Attendance)
- labour_payroll_controller.py     (Steps 7-8 + Dashboard/Reports)
- labour_helpers.py                (Shared constants, helpers, service instances)
"""
from controllers.labour_helpers import *  # noqa: F401,F403
from controllers.labour_requisition_controller import *  # noqa: F401,F403
from controllers.labour_assignment_controller import *  # noqa: F401,F403
from controllers.labour_payroll_controller import *  # noqa: F401,F403
