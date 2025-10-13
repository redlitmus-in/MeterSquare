/**
 * BOQ Types and Interfaces
 * Based on backend models and API structure
 */

export type BOQStatus = 'Draft' | 'In_Review' | 'Approved' | 'Sent_for_Confirmation' | 'Rejected';
export type WorkType = 'contract' | 'daily_wages' | 'piece_rate';

// Backend-aligned Material interface
export interface BOQMaterial {
  master_material_id?: number;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
}

// Backend-aligned Labour interface
export interface BOQLabour {
  master_labour_id?: number;
  labour_role: string;
  hours: number;
  rate_per_hour: number;
  total_cost: number;
}

// Backend-aligned BOQ Item interface
export interface BOQItemDetailed {
  master_item_id?: number;
  item_name: string;
  description?: string;
  work_type?: WorkType;

  // Cost calculations
  base_cost: number;
  overhead_percentage: number;
  overhead_amount: number;
  profit_margin_percentage: number;
  profit_margin_amount: number;
  total_cost: number;
  selling_price: number;
  totalMaterialCost: number;
  totalLabourCost: number;
  actualItemCost: number;
  estimatedSellingPrice: number;

  // Related data
  materials: BOQMaterial[];
  labour: BOQLabour[];
}

// Creation payload interface
export interface BOQCreatePayload {
  project_id: number;
  boq_name: string;
  status?: string;
  created_by?: string;
  discount_percentage?: number;
  preliminaries?: {
    items: {
      description: string;
      isCustom: boolean;
    }[];
    notes: string;
  };
  items: {
    item_name: string;
    description?: string;
    work_type?: WorkType;
    overhead_percentage?: number;
    profit_margin_percentage?: number;
    discount_percentage?: number;
    materials: {
      material_name: string;
      quantity: number;
      unit: string;
      unit_price: number;
      total_price?: number;
    }[];
    labour: {
      labour_role: string;
      hours: number;
      rate_per_hour: number;
      total_cost?: number;
    }[];
  }[];
}

export interface BOQItem {
  item_id?: number;
  item_no?: string;
  description: string;
  scope?: string;
  location?: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  size?: string;
  brand?: string;
  remarks?: string;
  category?: string;
}

export interface BOQSection {
  section_id?: number;
  section_code?: string;
  section_name: string;
  description?: string;
  items: BOQItem[];
  subtotal: number;
}

export interface BOQSummary {
  total: number;
  discount?: number;
  discountPercentage?: number;
  grandTotal: number;
}

export interface BOQTerms {
  validity?: string;
  paymentTerms?: string[];
  conditions?: string[];
  exclusions?: string[];
}

export interface BOQProject {
  project_id?: string | number;
  name: string;
  client: string;
  location: string;
  floor_name?: string;
  working_hours?: string;
  area?: string;
  workType?: string;
  reference?: string;
  status?: string;
}

export interface BOQ {
  boq_id?: number;
  project: BOQProject;
  title: string;
  boq_name?: string; // Backend uses boq_name
  raised_by?: string;
  status: BOQStatus;
  revision_number?: number; // 0 = original, 1+ = revision cycles
  sections: BOQSection[];
  summary: BOQSummary;
  terms?: BOQTerms;
  created_at?: string;
  created_by?: string;
  last_modified_at?: string;
  last_modified_by?: string;
  approved_by?: string;
  approved_at?: string;
  submission_date?: string;
  pdf_url?: string;
  notes?: string;
  email_sent?: boolean; // Track if BOQ has been emailed to TD
  client_rejection_reason?: string; // Client rejection reason

  // Backend response fields
  items?: BOQItemDetailed[];
  total_cost?: number;
  items_count?: number;
  project_details?: {
    project_name?: string;
    location?: string;
    floor?: string;
    hours?: string;
    status?: string;
  };
}

export interface BOQUploadResponse {
  success: boolean;
  message: string;
  data?: {
    extracted: BOQ;
    confidence?: number;
    warnings?: string[];
  };
}

export interface BOQDashboardMetrics {
  totalBOQs: number;
  pendingBOQs: number;
  approvedBOQs: number;
  rejectedBOQs?: number;
  sentForConfirmation?: number;
  totalProjectValue: number;
  averageApprovalTime: number;
  monthlyTrend: {
    month: string;
    count: number;
    value: number;
  }[];
  topProjects: {
    id?: number;
    name: string;
    value: number;
    status: BOQStatus;
    client?: string;
  }[];
  recentActivities?: {
    id: number;
    type: 'created' | 'updated';
    description: string;
    timestamp: string;
    project: string;
    status: string;
  }[];
}

export interface BOQFilter {
  status?: BOQStatus[];
  project?: string;
  client?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  valueRange?: {
    min: number;
    max: number;
  };
  searchTerm?: string;
}

export interface BOQValidation {
  isValid: boolean;
  errors: {
    field: string;
    message: string;
  }[];
  warnings: {
    field: string;
    message: string;
  }[];
}

// Project selection interface
export interface ProjectOption {
  id: string | number;
  name: string;
  client: string;
  location?: string;
}

// Update payload interface
export interface BOQUpdatePayload {
  project_id?: number;
  boq_id?: number;
  boq_name: string;
  status?: string;
  discount_percentage?: number;
  items: {
    item_id?: number;
    item_name: string;
    description: string;
    work_type?: WorkType;
    overhead_percentage?: number;
    profit_margin_percentage?: number;
    discount_percentage?: number;
    status?: string;
    materials: {
      material_id?: number;
      material_name: string;
      quantity: number;
      unit: string;
      unit_price: number;
      total_price: number;
    }[];
    labour: {
      labour_id?: number;
      labour_role: string;
      hours: number;
      rate_per_hour: number;
      total_cost: number;
      work_type?: string;
    }[];
  }[];
}

// Backend response interfaces
export interface BOQCreateResponse {
  message: string;
  boq: {
    boq_id: number;
    boq_name: string;
    project_id: number;
    status: string;
    total_cost: number;
    items_count: number;
    materials_count: number;
    labour_count: number;
    selling_price: number;
    estimatedSellingPrice: number;
  };
}

export interface BOQGetResponse {
  boq_id: number;
  boq_name: string;
  project_id: number;
  status: string;
  created_at: string;
  created_by: string;
  email_sent?: boolean;
  project_details: {
    project_name: string | null;
    location: string | null;
    floor: string | null;
    hours: string | null;
    status: string | null;
  };
  // Old format (backward compatibility)
  items?: BOQItemDetailed[];
  summary?: {
    total_items: number;
    total_materials: number;
    total_labour: number;
    total_material_cost: number;
    total_labour_cost: number;
    total_cost: number;
    selling_price: number;
    estimatedSellingPrice: number;
  };
  // New format with existing and new purchases
  existing_purchase?: {
    items: BOQItemDetailed[];
    summary: {
      total_items: number;
      total_materials: number;
      total_labour: number;
      total_material_cost: number;
      total_labour_cost: number;
      total_cost: number;
      selling_price: number;
      estimatedSellingPrice: number;
    };
  };
  new_purchase?: {
    items: BOQItemDetailed[];
    summary: {
      total_items: number;
      total_materials: number;
      total_labour: number;
      total_material_cost: number;
      total_labour_cost: number;
      total_cost: number;
      selling_price: number;
      estimatedSellingPrice: number;
    };
  };
  combined_summary?: {
    total_items: number;
    total_materials: number;
    total_labour: number;
    total_material_cost: number;
    total_labour_cost: number;
    total_cost: number;
    selling_price: number;
    estimatedSellingPrice: number;
  };
  overhead_percentage?: number;
  profit_margin?: number;
  profit_margin_percentage?: number;
  total_labour_cost?: number;
  total_material_cost?: number;
  user_id?: number;
}

export interface BOQListResponse {
  message: string;
  count: number;
  data: {
    boq_id: number;
    boq_name: string;
    project_id: number;
    project_name: string | null;
    client: string | null;
    location: string | null;
    status: string;
    email_sent?: boolean;
    items_count: number;
    material_count: number;
    labour_count: number;
    total_cost: number;
    selling_price: number;
    estimatedSellingPrice: number;
    total_material_cost?: number;
    total_labour_cost?: number;
    created_at: string;
    created_by: string;
  }[];
}