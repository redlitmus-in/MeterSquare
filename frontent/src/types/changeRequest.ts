// Change Request Types for Material Addition Workflow

export type ChangeRequestStatus =
  | 'pending'           // Waiting for approval
  | 'approved_estimator' // Approved by estimator (≤ AED50,000)
  | 'approved_td'        // Approved by TD (> AED50,000)
  | 'rejected'           // Rejected
  | 'client_pending';    // Waiting for client approval

export type ChangeRequestApprovalType = 'estimator' | 'td' | 'client';

export interface ChangeRequestItem {
  item_name: string;
  description?: string;
  work_type?: string;
  materials: {
    material_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
  }[];
  labour: {
    labour_role: string;
    hours: number;
    rate_per_hour: number;
    total_cost: number;
  }[];
  base_cost: number;
  overhead_percentage: number;
  overhead_amount: number;
  profit_margin_percentage: number;
  profit_margin_amount: number;
  selling_price: number;
}

export interface BudgetImpact {
  original_material_cost: number;
  original_labour_cost: number;
  original_base_cost: number;
  original_overhead: number;
  original_profit: number;
  original_total_cost: number;

  new_material_cost: number;
  new_labour_cost: number;
  new_base_cost: number;
  new_overhead: number;
  new_profit: number;
  new_total_cost: number;

  additional_cost: number;
  cost_increase_percentage: number;
  additional_profit: number;
  new_item_count: number;
}

export interface ChangeRequest {
  cr_id: number;
  project_id: number;
  project_name: string;
  boq_id: number;
  boq_name: string;

  // Request details
  requested_by_user_id: number;
  requested_by_name: string;
  request_date: string;

  // Approval flow
  status: ChangeRequestStatus;
  approval_type: ChangeRequestApprovalType;
  approved_by_user_id?: number;
  approved_by_name?: string;
  approval_date?: string;
  rejection_reason?: string;

  // Financial impact
  budget_impact: BudgetImpact;

  // Client billing
  bill_to_client: boolean;
  client_approved?: boolean;

  // New items to add
  new_items: ChangeRequestItem[];

  // Justification
  reason: string;
  notes?: string;

  // Vendor selection and approval
  selected_vendor_id?: number;
  selected_vendor_name?: string;
  vendor_selected_by_buyer_id?: number;
  vendor_selected_by_buyer_name?: string;
  vendor_selection_date?: string;
  vendor_selection_status?: string;
  vendor_approved_by_td_id?: number;
  vendor_approved_by_td_name?: string;
  vendor_approval_date?: string;
  vendor_rejection_reason?: string;

  // Metadata
  created_at: string;
  updated_at: string;
}

export interface ChangeRequestListItem {
  cr_id: number;
  project_name: string;
  requested_by_name: string;
  request_date: string;
  status: ChangeRequestStatus;
  additional_cost: number;
  cost_increase_percentage: number;
  new_items_count: number;
  approval_type: ChangeRequestApprovalType;
}

export interface ChangeRequestSummary {
  total_requests: number;
  pending_estimator: number;
  pending_td: number;
  approved: number;
  rejected: number;
  total_additional_cost: number;
}
