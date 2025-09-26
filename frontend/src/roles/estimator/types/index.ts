/**
 * BOQ Types and Interfaces
 * Based on the Borders Fitout BOQ structure
 */

export type BOQStatus = 'draft' | 'pending' | 'approved' | 'sent_for_confirmation' | 'rejected';

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
  project_id?: string;
  name: string;
  client: string;
  location: string;
  area?: string;
  workType?: string;
  reference?: string;
}

export interface BOQ {
  boq_id?: number;
  project: BOQProject;
  title: string;
  raised_by?: string;
  status: BOQStatus;
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
  totalProjectValue: number;
  averageApprovalTime: number;
  monthlyTrend: {
    month: string;
    count: number;
    value: number;
  }[];
  topProjects: {
    name: string;
    value: number;
    status: BOQStatus;
  }[];
  recentActivities: {
    id: string;
    action: string;
    boq: string;
    user: string;
    timestamp: string;
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