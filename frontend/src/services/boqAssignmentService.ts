import { apiClient } from '../api/config';

// Interface for Buyer
export interface Buyer {
  user_id: number;
  full_name: string;
  email: string;
  phone?: string;
}

// Interface for BOQ Assignment Material
export interface AssignmentMaterial {
  material_name: string;
  sub_item_name: string;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
}

// Interface for Vendor
export interface Vendor {
  vendor_id: number;
  company_name: string;
  email: string;
  phone?: string;
}

// Interface for BOQ Assignment
export interface BOQAssignment {
  assignment_id: number;
  boq_id: number;
  project_id: number;
  assigned_by_user_id: number;
  assigned_by_name: string;
  assigned_to_buyer_user_id: number;
  assigned_to_buyer_name: string;
  assigned_to_buyer_date: string;
  status: 'assigned_to_buyer' | 'purchase_completed';
  selected_vendor_id?: number | null;
  selected_vendor_name?: string | null;
  vendor_selected_by_buyer_id?: number | null;
  vendor_selected_by_buyer_name?: string | null;
  vendor_selection_date?: string | null;
  vendor_selection_status?: 'pending_td_approval' | 'approved' | 'rejected' | null;
  vendor_approved_by_td_id?: number | null;
  vendor_approved_by_td_name?: string | null;
  vendor_approval_date?: string | null;
  vendor_rejection_reason?: string | null;
  vendor_email_sent?: boolean;
  vendor_email_sent_date?: string | null;
  vendor_email_sent_by_user_id?: number | null;
  purchase_completed_by_user_id?: number | null;
  purchase_completed_by_name?: string | null;
  purchase_completion_date?: string | null;
  purchase_notes?: string | null;
  created_at: string;
  updated_at?: string | null;
  boq?: {
    boq_id: number;
    boq_name: string;
    boq_number?: string;
  };
  project?: {
    project_id: number;
    project_name: string;
    client?: string;
    location?: string;
  };
  materials?: AssignmentMaterial[];
  total_cost?: number;
  overhead_allocated?: number;
  overhead_percentage?: number;
  base_total?: number;
  vendor?: Vendor | null;
}

// Site Engineer Functions
export const getAvailableBuyers = async (): Promise<Buyer[]> => {
  try {
    const response = await apiClient.get('/available-buyers');
    return response.data.buyers;
  } catch (error) {
    console.error('Error fetching buyers:', error);
    throw error;
  }
};

export const assignBoqToBuyer = async (boqId: number, buyerId: number): Promise<any> => {
  try {
    const response = await apiClient.post(`/boq/${boqId}/assign-buyer`, { buyer_id: buyerId });
    return response.data;
  } catch (error) {
    console.error('Error assigning BOQ to buyer:', error);
    throw error;
  }
};

// ============================================================================
// ITEM-LEVEL ASSIGNMENT FUNCTIONS - PM assigns items to Site Engineers
// ============================================================================

// Get available Site Engineers for item assignment
export const getAvailableSiteEngineers = async (): Promise<any[]> => {
  try {
    const response = await apiClient.get('/all_sitesupervisor');
    // Combine both assigned and unassigned site supervisors
    const allSEs = [
      ...(response.data.assigned_project_managers || []),
      ...(response.data.unassigned_project_managers || [])
    ];
    return allSEs;
  } catch (error) {
    console.error('Error fetching available site engineers:', error);
    throw error;
  }
};

// Assign specific BOQ items to a Site Engineer
export const assignItemsToSE = async (
  boqId: number,
  itemIndices: number[],
  seUserId: number
): Promise<any> => {
  try {
    const response = await apiClient.post('/boq/assign-items-to-se', {
      boq_id: boqId,
      item_indices: itemIndices,
      se_user_id: seUserId
    });
    return response.data;
  } catch (error) {
    console.error('Error assigning items to SE:', error);
    throw error;
  }
};

// Get item assignments for a specific BOQ
export const getItemAssignments = async (boqId: number): Promise<any> => {
  try {
    const response = await apiClient.get(`/boq/${boqId}/item-assignments`);
    return response.data;
  } catch (error) {
    console.error('Error fetching item assignments:', error);
    throw error;
  }
};

// Unassign items from Site Engineer
export const unassignItems = async (
  boqId: number,
  itemIndices: number[]
): Promise<any> => {
  try {
    const response = await apiClient.post('/boq/unassign-items', {
      boq_id: boqId,
      item_indices: itemIndices
    });
    return response.data;
  } catch (error) {
    console.error('Error unassigning items:', error);
    throw error;
  }
};

// Get items assigned to current Site Engineer
export const getMyAssignedItems = async (): Promise<any> => {
  try {
    const response = await apiClient.get('/my-assigned-items');
    return response.data;
  } catch (error) {
    console.error('Error fetching my assigned items:', error);
    throw error;
  }
};

// Buyer Functions
export const getSEBoqAssignments = async (): Promise<BOQAssignment[]> => {
  try {
    const response = await apiClient.get('/buyer/se-boq-assignments');
    return response.data.assignments;
  } catch (error) {
    console.error('Error fetching SE BOQ assignments:', error);
    throw error;
  }
};

export const selectVendorForSEBoq = async (
  assignmentId: number,
  vendorId: number
): Promise<any> => {
  try {
    const response = await apiClient.post(
      `/buyer/se-boq/${assignmentId}/select-vendor`,
      { vendor_id: vendorId }
    );
    return response.data;
  } catch (error) {
    console.error('Error selecting vendor for SE BOQ:', error);
    throw error;
  }
};

// TD Functions
export const tdApproveVendorForSEBoq = async (assignmentId: number): Promise<any> => {
  try {
    const response = await apiClient.post(`/buyer/se-boq/${assignmentId}/td-approve-vendor`, {});
    return response.data;
  } catch (error) {
    console.error('Error approving vendor for SE BOQ:', error);
    throw error;
  }
};

export const tdRejectVendorForSEBoq = async (
  assignmentId: number,
  rejectionReason: string
): Promise<any> => {
  try {
    const response = await apiClient.post(
      `/buyer/se-boq/${assignmentId}/td-reject-vendor`,
      { rejection_reason: rejectionReason }
    );
    return response.data;
  } catch (error) {
    console.error('Error rejecting vendor for SE BOQ:', error);
    throw error;
  }
};

// Buyer Complete Purchase
export const completeSEBoqPurchase = async (
  assignmentId: number,
  notes?: string
): Promise<any> => {
  try {
    const response = await apiClient.post(
      `/buyer/se-boq/${assignmentId}/complete-purchase`,
      { notes: notes || '' }
    );
    return response.data;
  } catch (error) {
    console.error('Error completing SE BOQ purchase:', error);
    throw error;
  }
};

export default {
  getAvailableBuyers,
  assignBoqToBuyer,
  getSEBoqAssignments,
  selectVendorForSEBoq,
  tdApproveVendorForSEBoq,
  tdRejectVendorForSEBoq,
  completeSEBoqPurchase
};
