import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  DocumentCheckIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  CalendarIcon,
  UserIcon,
  CurrencyDollarIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  DocumentTextIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  UserPlusIcon,
  TableCellsIcon,
  Squares2X2Icon,
  TrashIcon
} from '@heroicons/react/24/outline';
import {
  FileText,
  TrendingUp,
  AlertCircle,
  Package,
  DollarSign,
  Store,
  Eye,
  Check,
  X as XIcon,
  MapPin
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { apiClient } from '@/api/config';
import { formatCurrency } from '@/utils/formatters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import { tdService } from '@/roles/technical-director/services/tdService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import BOQHistoryTimeline from '@/roles/estimator/components/BOQHistoryTimeline';
import BOQRevisionHistory from '@/roles/estimator/components/BOQRevisionHistory';
import TDRevisionComparisonPage from '@/roles/technical-director/components/TDRevisionComparisonPage';
import BOQDetailsModal from '@/roles/estimator/components/BOQDetailsModal';
import DayExtensionApprovalModal from '@/roles/technical-director/components/DayExtensionApprovalModal';
import {
  exportBOQToExcelInternal,
  exportBOQToExcelClient,
  exportBOQToPDFInternal,
  exportBOQToPDFClient
} from '@/utils/boqExportUtils';
import { downloadInternalBOQPDF, downloadClientBOQPDF } from '@/services/boqPdfService';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

interface BOQItem {
  id: number;
  description: string;
  briefDescription?: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  has_sub_items?: boolean;
  sub_items?: {
    sub_item_name: string;
    scope?: string;
    size?: string;
    description?: string;
    location?: string;
    brand?: string;
    quantity: number;
    unit: string;
    rate: number;
    base_total: number;
    materials_cost: number;
    labour_cost: number;
    materials: {
      name: string;
      material_name?: string;
      quantity: number;
      unit: string;
      rate: number;
      amount: number;
      total_price?: number;
      vat_percentage?: number;
    }[];
    labour: {
      type: string;
      labour_role?: string;
      quantity: number;
      hours?: number;
      unit: string;
      rate: number;
      amount: number;
      total_cost?: number;
    }[];
  }[];
  materials: {
    name: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
  }[];
  labour: {
    type: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
  }[];
  laborCost: number;
  estimatedSellingPrice: number;
  miscellaneous_percentage?: number;
  miscellaneous_amount?: number;
  overheadPercentage?: number;
  overhead_percentage?: number;
  overhead_amount?: number;
  profitMarginPercentage?: number;
  profit_margin_percentage?: number;
  profit_margin_amount?: number;
  discountPercentage?: number;
  vat_percentage?: number;
  vat_amount?: number;
}

interface EstimationItem {
  id: number;
  projectName: string;
  clientName: string;
  estimator: string;
  totalValue: number;
  itemCount: number;
  laborCost: number;
  materialCost: number;
  profitMargin: number;
  overheadPercentage: number;
  discountPercentage?: number;
  discount_amount?: number;
  submittedDate: string;
  status: 'pending' | 'pending_revision' | 'revision_approved' | 'approved' | 'rejected' | 'sent_for_confirmation' | 'client_confirmed' | 'client_rejected' | 'cancelled' | 'completed';
  priority: 'high' | 'medium' | 'low';
  location: string;
  floor: string;
  workingHours: string;
  boqItems?: BOQItem[];
  approvalNotes?: string;
  rejectionReason?: string;
  emailSent?: boolean;
  projectId?: number;
  pmAssigned?: boolean;
  // Project timeline fields
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  // Day extension status
  hasPendingDayExtension?: boolean;
  pendingDayExtensionCount?: number;
}

interface BOQAssignment {
  assignment_id: number;
  boq_id: number;
  project_id: number;
  status: string;
  assigned_by_name: string;
  assigned_to_buyer_name: string;
  assignment_date: string | null;
  vendor_selection_status: string;
  selected_vendor_id: number;
  selected_vendor_name: string;
  vendor_selected_by_buyer_name: string;
  vendor_selection_date: string | null;
  vendor_approved_by_td_name: string | null;
  vendor_approval_date: string | null;
  vendor_rejection_reason: string | null;
  boq: {
    boq_id: number;
    boq_name: string;
  };
  project: {
    project_id: number;
    project_name: string;
    client: string;
    location: string;
  };
  materials: Array<{
    id: number;
    item_name: string;
    sub_item_name: string;
    material_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
  }>;
  total_cost: number;
  overhead_allocated: number;
  overhead_percentage: number;
  base_total: number;
  vendor: {
    vendor_id: number;
    company_name: string;
    email: string;
    phone: string;
    phone_code: string;
    category: string;
  } | null;
}

const ProjectApprovals: React.FC = () => {
  const [selectedEstimation, setSelectedEstimation] = useState<EstimationItem | null>(null);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'revisions' | 'approved' | 'sent' | 'assigned' | 'rejected'>('pending');
  const [revisionSubTab, setRevisionSubTab] = useState<'pending_approval' | 'revision_approved'>('pending_approval');
  const [showBOQModal, setShowBOQModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [boqs, setBOQs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBOQDetails, setLoadingBOQDetails] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyTab, setHistoryTab] = useState<'full' | 'revisions'>('full');
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [downloadType, setDownloadType] = useState<'internal' | 'client'>('internal');
  const [showAssignPMModal, setShowAssignPMModal] = useState(false);
  const [assignMode, setAssignMode] = useState<'create' | 'existing'>('existing');
  const [allPMs, setAllPMs] = useState<any[]>([]);
  const [selectedPMId, setSelectedPMId] = useState<number | null>(null);
  const [newPMData, setNewPMData] = useState({ full_name: '', email: '', phone: '' });
  const [pmSearchQuery, setPmSearchQuery] = useState('');
  const [expandedPMId, setExpandedPMId] = useState<number | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [showPMWorkloadView, setShowPMWorkloadView] = useState(false);
  const [showPMDetailsModal, setShowPMDetailsModal] = useState(false);
  const [selectedProjectPM, setSelectedProjectPM] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [isRevisionApproval, setIsRevisionApproval] = useState(false);

  // Day Extension States
  const [pendingDayExtensions, setPendingDayExtensions] = useState<any[]>([]);
  const [showDayExtensionModal, setShowDayExtensionModal] = useState(false);
  const [selectedDayExtension, setSelectedDayExtension] = useState<any>(null);
  const [loadingDayExtensions, setLoadingDayExtensions] = useState(false);

  // Dynamic Revision Tabs States
  const [revisionTabs, setRevisionTabs] = useState<Array<{
    revision_number: number;
    project_count: number;
    alert_level: 'normal' | 'warning' | 'critical';
  }>>([]);
  const [selectedRevisionNumber, setSelectedRevisionNumber] = useState<number | 'all'>('all');
  const [revisionProjects, setRevisionProjects] = useState<any[]>([]);

  const [loadingRevisionTabs, setLoadingRevisionTabs] = useState(false);
  const [loadingRevisionProjects, setLoadingRevisionProjects] = useState(false);

  // Ref to track previous BOQs data for comparison
  const prevBOQsRef = useRef<string>('');

  // State to trigger BOQ detail refresh after approval/rejection actions
  const [boqDetailsRefreshTrigger, setBoqDetailsRefreshTrigger] = useState(0);

  // Load BOQs on mount and set up auto-refresh polling (ONLY ONCE)
  useEffect(() => {
    loadBOQs(); // Initial load with spinner
    loadPMs(); // Load PMs for assigned tab

    // Poll for new BOQs every 2 seconds (background refresh)
    const intervalId = setInterval(() => {
      loadBOQs(false); // Auto-refresh without showing loading spinner
      loadPMs(); // Also refresh PM data
    }, 2000); // 2 seconds

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, []); // Empty dependency array - run only once on mount

  // Load day extensions only when 'assigned' tab is active and BOQs are loaded
  useEffect(() => {
    if (filterStatus === 'assigned' && boqs.length > 0) {
      loadPendingDayExtensions();
    } else if (filterStatus !== 'assigned') {
      // Clear extensions when leaving assigned tab to free memory
      setPendingDayExtensions([]);
    }
  }, [filterStatus, boqs]); // Load when switching to assigned tab or when BOQs update

  // Load revision tabs when revisions filter is active
  useEffect(() => {
    if (filterStatus === 'revisions') {
      loadRevisionTabs();
    }
  }, [filterStatus]);

  // Reload projects when revision tab changes
  useEffect(() => {
    if (filterStatus === 'revisions' && selectedRevisionNumber) {
      loadRevisionProjects(selectedRevisionNumber);
    }
  }, [selectedRevisionNumber]);

  const loadBOQs = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) {
      setLoading(true);
    }
    try {
      const response = await tdService.getAllTDBOQs();
      if (response.success && response.data) {
        // Only update state if data actually changed (prevents unnecessary re-renders)
        const newDataString = JSON.stringify(response.data);
        if (prevBOQsRef.current !== newDataString) {
          prevBOQsRef.current = newDataString;
          setBOQs(response.data);
        }
      } else {
        console.error('Failed to load BOQs:', response.message);
        // Only show error toast on initial load, not during auto-refresh
        if (showLoadingSpinner) {
          toast.error(response.message || 'Failed to load BOQs');
        }
      }
    } catch (error) {
      console.error('Error loading BOQs:', error);
      // Only show error toast on initial load, not during auto-refresh
      if (showLoadingSpinner) {
        toast.error('Failed to load BOQs');
      }
    } finally {
      if (showLoadingSpinner) {
        setLoading(false);
      }
    }
  };

  // Load Dynamic Revision Tabs
  const loadRevisionTabs = async () => {
    try {
      setLoadingRevisionTabs(true);
      const response = await tdService.getRevisionTabs();
      if (response.success && response.data) {
        setRevisionTabs(response.data);
      } else {
        setRevisionTabs([]);
      }
    } catch (error) {
      console.error('Error loading revision tabs:', error);
      setRevisionTabs([]);
    } finally {
      setLoadingRevisionTabs(false);
    }
  };

  // Load Projects by Revision Number (for TD)
  const loadRevisionProjects = async (revisionNumber: number | 'all') => {
    try {
      setLoadingRevisionProjects(true);
      const response = await tdService.getProjectsByRevision(revisionNumber);
      if (response.success && response.data) {
        setRevisionProjects(response.data);
      } else {
        setRevisionProjects([]);
      }
    } catch (error) {
      console.error('Error loading revision projects:', error);
      setRevisionProjects([]);
    } finally {
      setLoadingRevisionProjects(false);
    }
  };

  // Load Pending Day Extension Requests - Simply extract from BOQ data (no history API calls)
  const loadPendingDayExtensions = () => {
    try {
      // Simply map from the BOQs that have pending extensions
      const extensions = boqs
        .filter((boq: any) => boq.has_pending_day_extension)
        .map((boq: any) => ({
          boq_id: boq.boq_id,
          project_name: boq.project_name,
          count: boq.pending_day_extension_count || 1
        }));

      setPendingDayExtensions(extensions);
    } catch (error) {
      console.error('Error loading pending day extensions:', error);
      setPendingDayExtensions([]);
    }
  };

  // Fetch day extension details only when user clicks to view
  const handleOpenDayExtensionModal = async (boqId: number) => {
    try {
      setLoadingDayExtensions(true);
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api';

      console.log(`Fetching day extensions for BOQ ${boqId}...`);

      const response = await fetch(`${apiUrl}/boq/${boqId}/pending-day-extensions`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      console.log('Day extension API response:', data);

      if (response.ok && data.success) {
        if (data.data && data.data.length > 0) {
          // Sort by request date (most recent first)
          const extensions = data.data.sort((a: any, b: any) => {
            const dateA = new Date(a.request_date || 0).getTime();
            const dateB = new Date(b.request_date || 0).getTime();
            return dateB - dateA;
          });

          console.log(`Found ${extensions.length} pending extension(s)`);
          // Set all extensions instead of just the first one
          setSelectedDayExtension(extensions);
          setShowDayExtensionModal(true);
        } else {
          console.log('No pending extensions found');
          toast.info('No pending day extension requests for this project');
        }
      } else {
        console.error('API error:', data);
        toast.error(data.error || 'Failed to load day extension requests');
      }
    } catch (error) {
      console.error('Error fetching day extension details:', error);
      toast.error('Failed to load day extension requests');
    } finally {
      setLoadingDayExtensions(false);
    }
  };

  const loadBOQDetails = async (boqId: number, listEstimation?: EstimationItem) => {
    setLoadingBOQDetails(true);
    try {
      // Preserve fields from list view that aren't in detail API
      const preservedFields = {
        clientName: listEstimation?.clientName || selectedEstimation?.clientName,
        location: listEstimation?.location || selectedEstimation?.location,
        floor: listEstimation?.floor || selectedEstimation?.floor,
        workingHours: listEstimation?.workingHours || selectedEstimation?.workingHours
      };

      const response = await estimatorService.getBOQById(boqId);
      if (response.success && response.data) {
        const estimation = transformBOQToEstimation(response.data);

        // Always preserve client from list view - detail API doesn't have it
        if (preservedFields.clientName) {
          estimation.clientName = preservedFields.clientName;
        }

        // Prefer location from list if available (it's more reliable)
        if (preservedFields.location && preservedFields.location !== 'N/A') {
          estimation.location = preservedFields.location;
        }

        // For fields that might come from detail API, prefer detail API if available
        if (!estimation.floor || estimation.floor === 'N/A') {
          estimation.floor = preservedFields.floor || estimation.floor;
        }
        if (!estimation.workingHours || estimation.workingHours === 'N/A') {
          estimation.workingHours = preservedFields.workingHours || estimation.workingHours;
        }

        setSelectedEstimation(estimation);
      } else {
        toast.error('Failed to load BOQ details');
      }
    } catch (error) {
      console.error('Error loading BOQ details:', error);
      toast.error('Failed to load BOQ details');
    } finally {
      setLoadingBOQDetails(false);
    }
  };


  // Transform BOQ data to match EstimationItem structure
  const transformBOQToEstimation = (boq: any): EstimationItem => {
    // Handle both list response (project_name, client) and detail response (project_details.project_name)
    const projectName = boq.project_name || boq.project_details?.project_name || boq.boq_name || 'Unnamed Project';
    const clientName = boq.client || boq.project_details?.client || boq.project?.client || 'Unknown Client';
    const status = mapBOQStatus(boq.status);

    // IMPORTANT: Prioritize total_cost as it's the most reliable field after discount
    const totalValue = boq.total_cost || boq.selling_price || boq.estimatedSellingPrice || 0;
    const laborCost = boq.total_labour_cost || 0;
    const materialCost = boq.total_material_cost || 0;
    const itemCount = boq.items_count || 0;

    console.log(`📊 [TD ProjectApprovals] BOQ ${boq.boq_id} - Raw values from backend:`, {
      boq_name: boq.boq_name || boq.project_name,
      total_cost: boq.total_cost,
      selling_price: boq.selling_price,
      estimatedSellingPrice: boq.estimatedSellingPrice,
      discount_percentage: boq.discount_percentage,
      discount_amount: boq.discount_amount
    });
    console.log(`💰 [TD ProjectApprovals] BOQ ${boq.boq_id} - Final totalValue: ${totalValue}`);

    return {
      id: boq.boq_id,
      projectName: projectName,
      clientName: clientName,
      estimator: boq.created_by || boq.created_by_name || 'Unknown',
      totalValue: totalValue,
      itemCount: itemCount,
      laborCost: laborCost,
      materialCost: materialCost,
      profitMargin: boq.profit_margin || boq.profit_margin_percentage || 0,
      overheadPercentage: boq.overhead_percentage || boq.overhead || 0,
      discountPercentage: boq.discount_percentage || 0,
      discount_amount: boq.discount_amount || 0,
      submittedDate: boq.created_at ? new Date(boq.created_at).toISOString().split('T')[0] : '',
      status: status,
      priority: 'medium',
      approvalNotes: status === 'approved' ? boq.notes : undefined,
      rejectionReason: status === 'rejected' ? boq.notes : undefined,
      location: boq.location || boq.project_details?.location || boq.project?.location || 'N/A',
      floor: boq.floor || boq.floor_name || boq.project_details?.floor || boq.project?.floor_name || 'N/A',
      workingHours: boq.hours || boq.working_hours || boq.project_details?.hours || boq.project?.working_hours || 'N/A',
      emailSent: boq.email_sent || false,
      projectId: boq.project_id,
      pmAssigned: !!boq.user_id, // Convert to boolean - user_id indicates PM is assigned to project
      revision_number: boq.revision_number || 0,
      preliminaries: boq.preliminaries || {},
      totalVatAmount: boq.total_vat_amount || boq.totalVatAmount || 0,
      overallVatPercentage: boq.overall_vat_percentage || boq.overallVatPercentage || 0,
      // Project timeline fields
      startDate: boq.start_date || undefined,
      endDate: boq.end_date || undefined,
      durationDays: boq.duration_days || undefined,
      // Day extension status
      hasPendingDayExtension: boq.has_pending_day_extension || false,
      pendingDayExtensionCount: boq.pending_day_extension_count || 0,
      // Support both old format (items) and new format (existing_purchase/new_purchase)
      existingItems: (boq.existing_purchase?.items || boq.items)?.map((item: any, idx: number) => {
        // Helper to clean wrapped values - returns number or 0
        const cleanValue = (val: any): number => {
          if (val === null || val === undefined) return 0;
          if (typeof val === 'object') {
            if (val.parsedValue !== undefined && val.parsedValue !== null) {
              const parsed = parseFloat(val.parsedValue);
              return isNaN(parsed) ? 0 : parsed;
            }
            if (val.source !== undefined && val.source !== null) {
              const parsed = parseFloat(val.source);
              return isNaN(parsed) ? 0 : parsed;
            }
            return 0;
          }
          const parsed = parseFloat(val);
          return isNaN(parsed) ? 0 : parsed;
        };

        // Use actual item quantity and rate if available, otherwise fallback
        const itemQuantity = cleanValue(item.quantity) || 1;
        const itemRate = cleanValue(item.rate) || 0;
        const itemTotal = cleanValue(item.item_total) || (itemQuantity * itemRate);

        // Clean percentages and amounts - try both new and old field names
        const miscPercentage = cleanValue(item.miscellaneous_percentage) || cleanValue(item.overhead_percentage);
        const miscAmount = cleanValue(item.miscellaneous_amount) || (itemTotal * miscPercentage / 100);
        const ohProfitPercentage = cleanValue(item.overhead_profit_percentage) || cleanValue(item.profit_margin_percentage);
        const ohProfitAmount = cleanValue(item.overhead_profit_amount) || cleanValue(item.profit_margin_amount) || (itemTotal * ohProfitPercentage / 100);
        const beforeDiscount = cleanValue(item.before_discount) || (itemTotal + miscAmount + ohProfitAmount);

        return {
          id: item.master_item_id || item.item_id,
          description: item.item_name,
          briefDescription: item.description || '',
          unit: item.unit || 'nos',
          quantity: itemQuantity,
          rate: itemRate,
          amount: cleanValue(item.selling_price) || 0,
          item_total: itemTotal, // NEW: Item total (qty × rate)
          miscellaneous_percentage: miscPercentage,
          miscellaneous_amount: miscAmount,
          overhead_profit_percentage: ohProfitPercentage,
          overhead_profit_amount: ohProfitAmount,
          before_discount: beforeDiscount,
          has_sub_items: item.sub_items && item.sub_items.length > 0,
          sub_items: item.sub_items || [],
          materials: item.sub_items?.length > 0
            ? item.sub_items.flatMap((si: any) => si.materials?.map((mat: any) => ({
                name: mat.material_name,
                description: mat.description || '',
                quantity: mat.quantity,
                unit: mat.unit,
                rate: mat.unit_price,
                amount: mat.total_price,
                vat_percentage: mat.vat_percentage || 0,
                sub_item_name: si.scope || si.sub_item_name
              })) || [])
            : item.materials?.map((mat: any) => ({
                name: mat.material_name,
                description: mat.description || '',
                quantity: mat.quantity,
                unit: mat.unit,
                rate: mat.unit_price,
                amount: mat.total_price,
                vat_percentage: mat.vat_percentage || 0
              })) || [],
          labour: item.sub_items?.length > 0
            ? item.sub_items.flatMap((si: any) => si.labour?.map((lab: any) => ({
                type: lab.labour_role,
                quantity: lab.hours,
                unit: 'hrs',
                rate: lab.rate_per_hour,
                amount: lab.total_cost || (lab.hours * lab.rate_per_hour),
                sub_item_name: si.scope || si.sub_item_name
              })) || [])
            : item.labour?.map((lab: any) => ({
                type: lab.labour_role,
                quantity: lab.hours,
                unit: 'hrs',
                rate: lab.rate_per_hour,
                amount: lab.total_cost
              })) || [],
          laborCost: item.sub_items?.length > 0
            ? item.sub_items.reduce((sum: number, si: any) =>
                sum + (si.labour?.reduce((lSum: number, l: any) =>
                  lSum + (l.total_cost || (l.hours * l.rate_per_hour) || 0), 0) || 0), 0)
            : item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0,
          estimatedSellingPrice: cleanValue(item.selling_price) || 0,
          overheadPercentage: miscPercentage, // Map miscellaneous to overhead for compatibility
          profitMarginPercentage: ohProfitPercentage, // Map overhead_profit to profitMargin for compatibility
          discountPercentage: cleanValue(item.discount_percentage) || 0,
          discount_amount: cleanValue(item.discount_amount) || 0,
          vat_percentage: cleanValue(item.vat_percentage) || 0,
          vat_amount: cleanValue(item.vat_amount) || 0,
          isNew: false // Mark as existing item
        };
      }) || [],
      newItems: boq.new_purchase?.items?.map((item: any) => {
        // Helper to clean wrapped values - returns number or 0
        const cleanValue = (val: any): number => {
          if (val === null || val === undefined) return 0;
          if (typeof val === 'object') {
            if (val.parsedValue !== undefined && val.parsedValue !== null) {
              const parsed = parseFloat(val.parsedValue);
              return isNaN(parsed) ? 0 : parsed;
            }
            if (val.source !== undefined && val.source !== null) {
              const parsed = parseFloat(val.source);
              return isNaN(parsed) ? 0 : parsed;
            }
            return 0;
          }
          const parsed = parseFloat(val);
          return isNaN(parsed) ? 0 : parsed;
        };

        // Use actual item quantity and rate if available, otherwise fallback
        const itemQuantity = cleanValue(item.quantity) || 1;
        const itemRate = cleanValue(item.rate) || 0;
        const itemTotal = cleanValue(item.item_total) || (itemQuantity * itemRate);

        // Clean percentages and amounts - try both new and old field names
        const miscPercentage = cleanValue(item.miscellaneous_percentage) || cleanValue(item.overhead_percentage);
        const miscAmount = cleanValue(item.miscellaneous_amount) || (itemTotal * miscPercentage / 100);
        const ohProfitPercentage = cleanValue(item.overhead_profit_percentage) || cleanValue(item.profit_margin_percentage);
        const ohProfitAmount = cleanValue(item.overhead_profit_amount) || cleanValue(item.profit_margin_amount) || (itemTotal * ohProfitPercentage / 100);
        const beforeDiscount = cleanValue(item.before_discount) || (itemTotal + miscAmount + ohProfitAmount);

        return {
          id: item.master_item_id || item.item_id,
          description: item.item_name,
          briefDescription: item.description || '',
          unit: item.unit || 'nos',
          quantity: itemQuantity,
          rate: itemRate,
          amount: cleanValue(item.selling_price) || 0,
          item_total: itemTotal, // NEW: Item total (qty × rate)
          miscellaneous_percentage: miscPercentage,
          miscellaneous_amount: miscAmount,
          overhead_profit_percentage: ohProfitPercentage,
          overhead_profit_amount: ohProfitAmount,
          before_discount: beforeDiscount,
          has_sub_items: item.sub_items && item.sub_items.length > 0,
          sub_items: item.sub_items || [],
          materials: item.sub_items?.length > 0
            ? item.sub_items.flatMap((si: any) => si.materials?.map((mat: any) => ({
                name: mat.material_name,
                description: mat.description || '',
                quantity: mat.quantity,
                unit: mat.unit,
                rate: mat.unit_price,
                amount: mat.total_price,
                vat_percentage: mat.vat_percentage || 0,
                sub_item_name: si.scope || si.sub_item_name
              })) || [])
            : item.materials?.map((mat: any) => ({
                name: mat.material_name,
                description: mat.description || '',
                quantity: mat.quantity,
                unit: mat.unit,
                rate: mat.unit_price,
                amount: mat.total_price,
                vat_percentage: mat.vat_percentage || 0
              })) || [],
          labour: item.sub_items?.length > 0
            ? item.sub_items.flatMap((si: any) => si.labour?.map((lab: any) => ({
                type: lab.labour_role,
                quantity: lab.hours,
                unit: 'hrs',
                rate: lab.rate_per_hour,
                amount: lab.total_cost || (lab.hours * lab.rate_per_hour),
                sub_item_name: si.scope || si.sub_item_name
              })) || [])
            : item.labour?.map((lab: any) => ({
                type: lab.labour_role,
                quantity: lab.hours,
                unit: 'hrs',
                rate: lab.rate_per_hour,
                amount: lab.total_cost
              })) || [],
          laborCost: item.sub_items?.length > 0
            ? item.sub_items.reduce((sum: number, si: any) =>
                sum + (si.labour?.reduce((lSum: number, l: any) =>
                  lSum + (l.total_cost || (l.hours * l.rate_per_hour) || 0), 0) || 0), 0)
            : item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0,
          estimatedSellingPrice: cleanValue(item.selling_price) || 0,
          overheadPercentage: miscPercentage, // Map miscellaneous to overhead for compatibility
          profitMarginPercentage: ohProfitPercentage, // Map overhead_profit to profitMargin for compatibility
          discountPercentage: cleanValue(item.discount_percentage) || 0,
          discount_amount: cleanValue(item.discount_amount) || 0,
          vat_percentage: cleanValue(item.vat_percentage) || 0,
          vat_amount: cleanValue(item.vat_amount) || 0,
          isNew: true // Mark as new item
        };
      }) || [],
      // Keep boqItems for backward compatibility (combine existing + new)
      boqItems: [
        ...((boq.existing_purchase?.items || boq.items)?.map((item: any) => {
          // Helper to clean wrapped values
          const cleanValue = (val: any): number => {
            if (val === null || val === undefined) return 0;
            if (typeof val === 'object') {
              if (val.parsedValue !== undefined && val.parsedValue !== null) {
                const parsed = parseFloat(val.parsedValue);
                return isNaN(parsed) ? 0 : parsed;
              }
              if (val.source !== undefined && val.source !== null) {
                const parsed = parseFloat(val.source);
                return isNaN(parsed) ? 0 : parsed;
              }
              return 0;
            }
            const parsed = parseFloat(val);
            return isNaN(parsed) ? 0 : parsed;
          };

          const totalQuantity = item.materials?.reduce((sum: number, m: any) => sum + (m.quantity || 0), 0) || 1;
          const sellingPrice = cleanValue(item.selling_price) || 0;
          const calculatedRate = totalQuantity > 0 ? sellingPrice / totalQuantity : sellingPrice;

          // Clean item-level fields
          const itemQty = cleanValue(item.quantity) || totalQuantity;
          const itemRate = cleanValue(item.rate) || calculatedRate;
          const itemTotal = cleanValue(item.item_total) || (itemQty * itemRate);

          // Clean percentages
          const miscPct = cleanValue(item.miscellaneous_percentage) || cleanValue(item.overhead_percentage);
          const ohProfitPct = cleanValue(item.overhead_profit_percentage) || cleanValue(item.profit_margin_percentage);

          return {
            id: item.item_id,
            description: item.item_name,
            briefDescription: item.description || '',
            unit: item.unit || item.materials?.[0]?.unit || 'nos',
            quantity: itemQty,
            rate: itemRate,
            amount: sellingPrice,
            item_total: itemTotal,
            miscellaneous_percentage: miscPct,
            miscellaneous_amount: cleanValue(item.miscellaneous_amount) || (itemTotal * miscPct / 100),
            overhead_profit_percentage: ohProfitPct,
            overhead_profit_amount: cleanValue(item.overhead_profit_amount) || (itemTotal * ohProfitPct / 100),
            has_sub_items: item.sub_items && item.sub_items.length > 0,
            sub_items: item.sub_items || [],
            materials: item.sub_items?.length > 0
              ? item.sub_items.flatMap((si: any) => si.materials?.map((mat: any) => ({
                  name: mat.material_name,
                  description: mat.description || '',
                  quantity: mat.quantity,
                  unit: mat.unit,
                  rate: mat.unit_price,
                  amount: mat.total_price,
                  vat_percentage: mat.vat_percentage || 0,
                  sub_item_name: si.scope || si.sub_item_name
                })) || [])
              : item.materials?.map((mat: any) => ({
                  name: mat.material_name,
                  description: mat.description || '',
                  quantity: mat.quantity,
                  unit: mat.unit,
                  rate: mat.unit_price,
                  amount: mat.total_price,
                  vat_percentage: mat.vat_percentage || 0
                })) || [],
            labour: item.sub_items?.length > 0
              ? item.sub_items.flatMap((si: any) => si.labour?.map((lab: any) => ({
                  type: lab.labour_role,
                  quantity: lab.hours,
                  unit: 'hrs',
                  rate: lab.rate_per_hour,
                  amount: lab.total_cost || (lab.hours * lab.rate_per_hour),
                  sub_item_name: si.scope || si.sub_item_name
                })) || [])
              : item.labour?.map((lab: any) => ({
                  type: lab.labour_role,
                  quantity: lab.hours,
                  unit: 'hrs',
                  rate: lab.rate_per_hour,
                  amount: lab.total_cost
                })) || [],
            laborCost: item.sub_items?.length > 0
              ? item.sub_items.reduce((sum: number, si: any) =>
                  sum + (si.labour?.reduce((lSum: number, l: any) =>
                    lSum + (l.total_cost || (l.hours * l.rate_per_hour) || 0), 0) || 0), 0)
              : item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0,
            estimatedSellingPrice: sellingPrice,
            overheadPercentage: miscPct, // Use cleaned miscellaneous as overhead
            profitMarginPercentage: ohProfitPct, // Use cleaned overhead_profit as profitMargin
            discountPercentage: cleanValue(item.discount_percentage) || 0,
            discount_amount: cleanValue(item.discount_amount) || 0,
            vat_percentage: cleanValue(item.vat_percentage) || 0,
            vat_amount: cleanValue(item.vat_amount) || 0,
            isNew: false
          };
        }) || []),
        ...(boq.new_purchase?.items?.map((item: any) => {
          // Helper to clean wrapped values (same as above)
          const cleanValue = (val: any): number => {
            if (val === null || val === undefined) return 0;
            if (typeof val === 'object') {
              if (val.parsedValue !== undefined && val.parsedValue !== null) {
                const parsed = parseFloat(val.parsedValue);
                return isNaN(parsed) ? 0 : parsed;
              }
              if (val.source !== undefined && val.source !== null) {
                const parsed = parseFloat(val.source);
                return isNaN(parsed) ? 0 : parsed;
              }
              return 0;
            }
            const parsed = parseFloat(val);
            return isNaN(parsed) ? 0 : parsed;
          };

          const totalQuantity = item.materials?.reduce((sum: number, m: any) => sum + (m.quantity || 0), 0) || 1;
          const sellingPrice = cleanValue(item.selling_price) || 0;
          const calculatedRate = totalQuantity > 0 ? sellingPrice / totalQuantity : sellingPrice;

          // Clean item-level fields
          const itemQty = cleanValue(item.quantity) || totalQuantity;
          const itemRate = cleanValue(item.rate) || calculatedRate;
          const itemTotal = cleanValue(item.item_total) || (itemQty * itemRate);

          // Clean percentages
          const miscPct = cleanValue(item.miscellaneous_percentage) || cleanValue(item.overhead_percentage);
          const ohProfitPct = cleanValue(item.overhead_profit_percentage) || cleanValue(item.profit_margin_percentage);

          return {
            id: item.item_id,
            description: item.item_name,
            briefDescription: item.description || '',
            unit: item.unit || item.materials?.[0]?.unit || 'nos',
            quantity: itemQty,
            rate: itemRate,
            amount: sellingPrice,
            item_total: itemTotal,
            miscellaneous_percentage: miscPct,
            miscellaneous_amount: cleanValue(item.miscellaneous_amount) || (itemTotal * miscPct / 100),
            overhead_profit_percentage: ohProfitPct,
            overhead_profit_amount: cleanValue(item.overhead_profit_amount) || (itemTotal * ohProfitPct / 100),
            has_sub_items: item.sub_items && item.sub_items.length > 0,
            sub_items: item.sub_items || [],
            materials: item.sub_items?.length > 0
              ? item.sub_items.flatMap((si: any) => si.materials?.map((mat: any) => ({
                  name: mat.material_name,
                  description: mat.description || '',
                  quantity: mat.quantity,
                  unit: mat.unit,
                  rate: mat.unit_price,
                  amount: mat.total_price,
                  vat_percentage: mat.vat_percentage || 0,
                  sub_item_name: si.scope || si.sub_item_name
                })) || [])
              : item.materials?.map((mat: any) => ({
                  name: mat.material_name,
                  description: mat.description || '',
                  quantity: mat.quantity,
                  unit: mat.unit,
                  rate: mat.unit_price,
                  amount: mat.total_price,
                  vat_percentage: mat.vat_percentage || 0
                })) || [],
            labour: item.sub_items?.length > 0
              ? item.sub_items.flatMap((si: any) => si.labour?.map((lab: any) => ({
                  type: lab.labour_role,
                  quantity: lab.hours,
                  unit: 'hrs',
                  rate: lab.rate_per_hour,
                  amount: lab.total_cost || (lab.hours * lab.rate_per_hour),
                  sub_item_name: si.scope || si.sub_item_name
                })) || [])
              : item.labour?.map((lab: any) => ({
                  type: lab.labour_role,
                  quantity: lab.hours,
                  unit: 'hrs',
                  rate: lab.rate_per_hour,
                  amount: lab.total_cost
                })) || [],
            laborCost: item.sub_items?.length > 0
              ? item.sub_items.reduce((sum: number, si: any) =>
                  sum + (si.labour?.reduce((lSum: number, l: any) =>
                    lSum + (l.total_cost || (l.hours * l.rate_per_hour) || 0), 0) || 0), 0)
              : item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0,
            estimatedSellingPrice: sellingPrice,
            overheadPercentage: miscPct, // Use cleaned miscellaneous as overhead
            profitMarginPercentage: ohProfitPct, // Use cleaned overhead_profit as profitMargin
            discountPercentage: cleanValue(item.discount_percentage) || 0,
            discount_amount: cleanValue(item.discount_amount) || (beforeDiscount * cleanValue(item.discount_percentage) / 100),
            vat_percentage: cleanValue(item.vat_percentage) || 0,
            vat_amount: cleanValue(item.vat_amount) || (afterDiscount * cleanValue(item.vat_percentage) / 100),
            isNew: true
          };
        }) || [])
      ]
    };
  };

  // Map BOQ status to estimation status
  const mapBOQStatus = (status: string): 'pending' | 'pending_revision' | 'revision_approved' | 'approved' | 'rejected' | 'sent_for_confirmation' | 'client_confirmed' | 'client_rejected' | 'cancelled' | 'completed' => {
    if (!status) return 'pending';

    const normalizedStatus = status.toLowerCase().trim();

    // Check for pending revision (estimator sent revised BOQ)
    if (normalizedStatus === 'pending_revision') {
      return 'pending_revision';
    }

    // Check for revision approved (TD approved the revision)
    if (normalizedStatus === 'revision_approved') {
      return 'revision_approved';
    }

    // Check for approved status
    if (normalizedStatus === 'approved' || normalizedStatus === 'approve') {
      return 'approved';
    }

    // Check for rejected status (including client revision rejected)
    if (normalizedStatus === 'rejected' || normalizedStatus === 'reject' || normalizedStatus === 'client_revision_rejected') {
      return 'rejected';
    }

    // Check for completed status
    if (normalizedStatus === 'completed' || normalizedStatus === 'complete') {
      return 'completed';
    }

    // Check for client confirmed (ready for PM assignment)
    if (normalizedStatus === 'client_confirmed') {
      return 'client_confirmed';
    }

    // Check for client rejected (wants changes)
    if (normalizedStatus === 'client_rejected') {
      return 'client_rejected';
    }

    // Check for cancelled (client doesn't want to proceed)
    if (normalizedStatus === 'client_cancelled') {
      return 'cancelled';
    }

    // Check for sent to client (waiting for client confirmation)
    if (normalizedStatus === 'sent_for_confirmation' || normalizedStatus === 'sent_to_client') {
      return 'sent_for_confirmation';
    }

    // All other statuses (draft, in_review, pending) -> pending
    return 'pending';
  };

  // Transform BOQs to estimations (memoized to prevent recalculation on every render)
  const estimations = useMemo(() => boqs.map(transformBOQToEstimation), [boqs]);

  // Sort by submittedDate - most recent first (memoized)
  const sortedEstimations = useMemo(() => {
    return [...estimations].sort((a, b) => {
      const dateA = new Date(a.submittedDate || 0).getTime();
      const dateB = new Date(b.submittedDate || 0).getTime();
      return dateB - dateA; // Descending order (newest first)
    });
  }, [estimations]);

  const filteredEstimations = useMemo(() => sortedEstimations.filter(est => {
    if (filterStatus === 'pending') {
      // Pending: Waiting for TD internal approval (status = pending, sent via email to TD)
      return est.status === 'pending' && !est.pmAssigned;
    } else if (filterStatus === 'revisions') {
      // Revisions: Show ALL BOQs with revision_number != 0
      const hasRevisions = (est as any).revision_number != null && (est as any).revision_number !== 0;

      // Must have revision_number not equal to 0
      if (!hasRevisions) return false;

      // Filter by revision number if specific revision is selected
      if (selectedRevisionNumber !== 'all') {
        const revisionNumber = (est as any).revision_number || 0;
        return revisionNumber === selectedRevisionNumber;
      }

      return true;
    } else if (filterStatus === 'approved') {
      // Approved: TD approved internally, includes "approved", "revision_approved", and "sent_for_confirmation" (waiting for client)
      return (est.status === 'approved' || est.status === 'revision_approved' || est.status === 'sent_for_confirmation') && !est.pmAssigned;
    } else if (filterStatus === 'sent') {
      // Client Response: Shows both approved (client_confirmed) and rejected (client_rejected) by client
      return (est.status === 'client_confirmed' || est.status === 'client_rejected') && !est.pmAssigned;
    } else if (filterStatus === 'assigned') {
      // Assigned: PM has been assigned (can be after client confirms)
      return est.pmAssigned === true && est.status !== 'rejected' && est.status !== 'completed' && est.status !== 'cancelled';
    } else if (filterStatus === 'completed') {
      // Completed: Project is completed
      return est.status === 'completed';
    } else if (filterStatus === 'rejected') {
      // Rejected: TD rejected the BOQ
      return est.status === 'rejected';
    } else if (filterStatus === 'cancelled') {
      // Cancelled: Client doesn't want to proceed with business
      return est.status === 'cancelled';
    }
    return false;
  }), [sortedEstimations, filterStatus, selectedRevisionNumber]);

  const handleApproval = async (id: number, approved: boolean, notes?: string) => {
    try {
      if (approved) {
        // For revision tab: directly approve without comparison modal
        if (isRevisionApproval) {
          setShowApprovalModal(false);
          await handleFinalApproval();
          setIsRevisionApproval(false); // Reset flag
        } else {
          // For pending tab: show comparison modal before approval
          setShowApprovalModal(false);
          setShowComparisonModal(true);
        }
      } else {
        if (!notes || !notes.trim()) {
          toast.error('Please provide a rejection reason');
          return;
        }

        // Set rejecting state to show loading
        setIsRejecting(true);

        // Optimistic update: immediately update UI before API call
        const optimisticBOQs = boqs.map(boq =>
          boq.boq_id === id
            ? { ...boq, status: 'rejected' }
            : boq
        );
        setBOQs(optimisticBOQs);

        // Use client revision method if in revisions tab, otherwise use regular method
        const response = filterStatus === 'revisions'
          ? await tdService.rejectClientRevision(id, notes)
          : await tdService.rejectBOQ(id, notes);
        if (response.success) {
          toast.success('BOQ rejected successfully');

          // Refresh BOQ details BEFORE closing modal to show updated data
          if (showBOQModal && selectedEstimation?.id) {
            await loadBOQDetails(selectedEstimation.id);
          }

          // Refresh data silently in background
          loadBOQs(false);
          setBoqDetailsRefreshTrigger(prev => prev + 1); // Trigger BOQ details refresh
          if (filterStatus === 'revisions') {
            loadRevisionTabs();
          }
        } else {
          toast.error(response.message || 'Failed to reject BOQ');
          // Revert optimistic update on error
          await loadBOQs(false);
        }
      }
    } catch (error) {
      toast.error('An error occurred while processing the request');
      // Revert optimistic update on error
      await loadBOQs(false);
    } finally {
      // Reset rejecting state
      setIsRejecting(false);
    }
    setShowRejectionModal(false);
    setApprovalNotes('');
    setRejectionReason('');
  };

  // Final approval after TD reviews comparison
  const handleFinalApproval = async () => {
    if (!selectedEstimation || isApproving) return;

    setIsApproving(true);
    try {
      // Optimistic update: immediately update UI before API call
      const optimisticBOQs = boqs.map(boq =>
        boq.boq_id === selectedEstimation.id
          ? { ...boq, status: 'Revision_Approved' }
          : boq
      );
      setBOQs(optimisticBOQs);

      // Use client revision method if in revisions tab, otherwise use regular method
      const response = filterStatus === 'revisions'
        ? await tdService.approveClientRevision(selectedEstimation.id, approvalNotes)
        : await tdService.approveBOQ(selectedEstimation.id, approvalNotes);
      if (response.success) {
        toast.success('BOQ approved successfully');

        // Refresh BOQ details BEFORE closing modal to show updated data
        if (showBOQModal && selectedEstimation?.id) {
          await loadBOQDetails(selectedEstimation.id);
        }

        setShowComparisonModal(false); // Close comparison modal
        setApprovalNotes(''); // Clear notes

        // Refresh data silently in background
        loadBOQs(false);
        setBoqDetailsRefreshTrigger(prev => prev + 1); // Trigger BOQ details refresh
        if (filterStatus === 'revisions') {
          loadRevisionTabs();
        }
      } else {
        toast.error(response.message || 'Failed to approve BOQ');
        // Revert optimistic update on error
        await loadBOQs(false);
      }
    } catch (error) {
      console.error('Approval error:', error);
      toast.error('Failed to approve BOQ');
      // Revert optimistic update on error
      await loadBOQs(false);
    } finally {
      setIsApproving(false);
    }
  };

  const handleDownload = async (format: 'excel' | 'pdf') => {
    if (!selectedEstimation) return;

    try {
      const isInternal = downloadType === 'internal';
      const formatName = format === 'excel' ? 'Excel' : 'PDF';
      const typeName = isInternal ? 'Internal' : 'Client';

      toast.loading(`Generating ${typeName} ${formatName} file...`);

      if (format === 'excel') {
        if (isInternal) {
          await exportBOQToExcelInternal(selectedEstimation);
        } else {
          await exportBOQToExcelClient(selectedEstimation);
        }
      } else {
        // Use backend API for PDF generation (modern template with correct port)
        if (isInternal) {
          await downloadInternalBOQPDF(selectedEstimation.id);
        } else {
          await downloadClientBOQPDF(selectedEstimation.id);
        }
      }

      toast.dismiss();
      toast.success(`${typeName} BOQ downloaded successfully as ${formatName}`);
      setShowFormatModal(false);
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to download BOQ');
      console.error('Download error:', error);
    }
  };


  // Load PMs when assign modal opens
  useEffect(() => {
    if (showAssignPMModal) {
      loadPMs();
    }
  }, [showAssignPMModal]);

  const loadPMs = async () => {
    try {
      const response = await tdService.getPMsWithWorkload();
      if (response.success && response.data) {
        setAllPMs(response.data);
      }
    } catch (error) {
      console.error('Error loading PMs:', error);
      toast.error('Failed to load Project Managers');
    }
  };

  const handleAssignPM = async () => {
    if (!selectedEstimation || !selectedEstimation.projectId) {
      toast.error('No project selected');
      return;
    }

    try {
      if (assignMode === 'create') {
        // Validate new PM data
        if (!newPMData.full_name || !newPMData.email || !newPMData.phone) {
          toast.error('Please fill all PM details');
          return;
        }

        toast.loading('Creating Project Manager...');
        const response = await tdService.createPM({
          ...newPMData,
          project_ids: [selectedEstimation.projectId]
        });

        toast.dismiss();
        if (response.success) {
          toast.success('Project Manager created and assigned successfully');
          setShowAssignPMModal(false);
          setNewPMData({ full_name: '', email: '', phone: '' });
          await loadBOQs();
          // Reload the selected BOQ details to update the UI
          if (selectedEstimation) {
            await loadBOQDetails(selectedEstimation.id);
          }
        } else {
          toast.error(response.message);
        }
      } else {
        // Assign to existing PM
        if (!selectedPMId) {
          toast.error('Please select a Project Manager');
          return;
        }

        toast.loading('Assigning Project Manager...');
        const response = await tdService.assignProjectsToPM(selectedPMId, [selectedEstimation.projectId]);

        toast.dismiss();
        if (response.success) {
          toast.success('Project assigned to PM successfully');
          setShowAssignPMModal(false);
          setSelectedPMId(null);
          await loadBOQs();
          // Reload the selected BOQ details to update the UI
          if (selectedEstimation) {
            await loadBOQDetails(selectedEstimation.id);
          }
        } else {
          toast.error(response.message);
        }
      }
    } catch (error) {
      toast.dismiss();
      console.error('Assign PM error:', error);
      toast.error('Failed to assign Project Manager');
    }
  };

  const handleDeletePM = async (userId: number, pmName: string) => {
    // Confirm deletion
    const confirmed = window.confirm(`Are you sure you want to delete Project Manager "${pmName}"? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      toast.loading('Deleting Project Manager...');
      const response = await tdService.deletePM(userId);

      toast.dismiss();
      if (response.success) {
        toast.success('Project Manager deleted successfully');
        // Reload PMs list
        await loadPMs();
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.dismiss();
      console.error('Delete PM error:', error);
      toast.error('Failed to delete Project Manager');
    }
  };


  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircleIcon className="w-5 h-5 text-green-600" />;
      case 'rejected': return <XCircleIcon className="w-5 h-5 text-red-600" />;
      case 'cancelled': return <XCircleIcon className="w-5 h-5 text-red-600" />;
      case 'client_confirmed': return <CheckCircleIcon className="w-5 h-5 text-green-600" />;
      case 'client_rejected': return <XCircleIcon className="w-5 h-5 text-orange-600" />;
      case 'sent_for_confirmation': return <ClockIcon className="w-5 h-5 text-blue-600" />;
      case 'pending_revision': return <DocumentCheckIcon className="w-5 h-5 text-red-600" />;
      default: return <ClockIcon className="w-5 h-5 text-yellow-600" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
              <DocumentCheckIcon className="w-6 h-6 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-[#243d8a]">Project Approvals</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Filter Tabs and View Toggle */}
        <div className="flex items-center justify-between mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 inline-flex gap-1">
            {[
              { key: 'pending', label: 'Pending' },
              { key: 'approved', label: 'Approved' },
              { key: 'sent', label: 'Client Response' },
              { key: 'revisions', label: 'Revisions' },
              { key: 'assigned', label: 'Assigned' },
              { key: 'completed', label: 'Completed' },
              { key: 'rejected', label: 'Rejected by TD' },
              { key: 'cancelled', label: 'Cancelled' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setFilterStatus(tab.key as any);
                  // Reset sub-tab when switching main tabs
                  if (tab.key === 'revisions') {
                    setRevisionSubTab('pending_approval');
                  }
                }}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  filterStatus === tab.key
                    ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-900 border border-red-200 shadow-md'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 inline-flex gap-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'cards'
                  ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-900 border border-red-200 shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              title="Card View"
            >
              <Squares2X2Icon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'table'
                  ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-900 border border-red-200 shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              title="Table View"
            >
              <TableCellsIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TD Revision Comparison Page - Show only for revisions tab */}
        {filterStatus === 'revisions' ? (
          <TDRevisionComparisonPage
            boqList={boqs}
            onApprove={(boq) => {
              // Try to find in filteredEstimations first, otherwise create from BOQ
              let estimation = filteredEstimations.find(est => est.id === boq.boq_id);

              if (!estimation) {
                // Create estimation object from BOQ data
                estimation = {
                  id: boq.boq_id,
                  projectName: boq.title || boq.boq_name || `BOQ ${boq.boq_id}`,
                  clientName: boq.client || 'N/A',
                  estimatedValue: boq.total_cost || boq.selling_price || 0,
                  status: boq.status || 'pending',
                  materialCost: 0,
                  laborCost: 0,
                  overheadPercentage: 0,
                  profitMargin: 0,
                  submittedAt: boq.created_at || new Date().toISOString(),
                };
              }

              setSelectedEstimation(estimation);
              setIsRevisionApproval(true);
              setShowApprovalModal(true);
            }}
            onReject={(boq) => {
              // Try to find in filteredEstimations first, otherwise create from BOQ
              let estimation = filteredEstimations.find(est => est.id === boq.boq_id);

              if (!estimation) {
                // Create estimation object from BOQ data
                estimation = {
                  id: boq.boq_id,
                  projectName: boq.title || boq.boq_name || `BOQ ${boq.boq_id}`,
                  clientName: boq.client || 'N/A',
                  estimatedValue: boq.total_cost || boq.selling_price || 0,
                  status: boq.status || 'pending',
                  materialCost: 0,
                  laborCost: 0,
                  overheadPercentage: 0,
                  profitMargin: 0,
                  submittedAt: boq.created_at || new Date().toISOString(),
                };
              }

              setSelectedEstimation(estimation);
              setShowRejectionModal(true);
            }}
            onViewDetails={async (boq) => {
              // Try to find in filteredEstimations first, otherwise create from BOQ
              let estimation = filteredEstimations.find(est => est.id === boq.boq_id);

              if (!estimation) {
                // Create estimation object from BOQ data
                estimation = {
                  id: boq.boq_id,
                  projectName: boq.title || boq.boq_name || `BOQ ${boq.boq_id}`,
                  clientName: boq.client || 'N/A',
                  estimatedValue: boq.total_cost || boq.selling_price || 0,
                  status: boq.status || 'pending',
                  materialCost: 0,
                  laborCost: 0,
                  overheadPercentage: 0,
                  profitMargin: 0,
                  submittedAt: boq.created_at || new Date().toISOString(),
                };
              }

              await loadBOQDetails(estimation.id, estimation);
              setShowBOQModal(true);
            }}
            onRefresh={async () => {
              await loadBOQs(false);
              await loadRevisionTabs();
            }}
            refreshTrigger={boqDetailsRefreshTrigger}
          />
        ) : (
          /* Estimations List - Show for all other tabs */
          false ? (
          <div className="space-y-4">
            {allPMs.map((pm: any, index: number) => {
              const projectCount = pm.projectCount || 0;
              const isAvailable = projectCount === 0;
              const isBusy = projectCount >= 1 && projectCount <= 3;
              const isOverloaded = projectCount > 3;

              let statusColor = '';
              let statusText = '';
              let statusBg = '';
              let borderColor = '';

              if (isAvailable) {
                statusColor = 'text-green-700';
                statusText = 'Available';
                statusBg = 'bg-green-50';
                borderColor = 'border-green-200';
              } else if (isBusy) {
                statusColor = 'text-yellow-700';
                statusText = 'Busy';
                statusBg = 'bg-yellow-50';
                borderColor = 'border-yellow-200';
              } else {
                statusColor = 'text-red-700';
                statusText = 'Overloaded';
                statusBg = 'bg-red-50';
                borderColor = 'border-red-200';
              }

              return (
                <motion.div
                  key={pm.user_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className={`bg-white rounded-xl shadow-md border-2 ${borderColor} hover:shadow-xl transition-all`}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <UserIcon className="w-8 h-8 text-[#243d8a] p-1.5 bg-blue-100 rounded-lg" />
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">{pm.pm_name || pm.full_name}</h3>
                            <p className="text-sm text-gray-600">{pm.email}</p>
                          </div>
                          <span className={`ml-auto px-4 py-1.5 rounded-full text-sm font-semibold ${statusColor} ${statusBg} border-2 ${borderColor}`}>
                            {statusText}
                          </span>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-gray-600 mb-4">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-gray-700">Phone:</span>
                            <span>{pm.phone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <BuildingOfficeIcon className="w-5 h-5 text-gray-500" />
                            <span className="font-bold text-lg text-[#243d8a]">{projectCount}</span>
                            <span className="text-gray-600">{projectCount === 1 ? 'project' : 'projects'} assigned</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-500">Workload</span>
                            <span className={`font-semibold ${statusColor}`}>
                              {projectCount === 0 ? '0%' : projectCount <= 3 ? `${Math.min(projectCount * 25, 75)}%` : '100%'}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                isAvailable ? 'bg-green-500' : isBusy ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: projectCount === 0 ? '0%' : `${Math.min(projectCount * 20, 100)}%` }}
                            />
                          </div>
                        </div>

                        {/* Assigned Projects List */}
                        {pm.projects && pm.projects.length > 0 && (
                          <div className={`mt-4 p-4 rounded-lg ${statusBg} border ${borderColor}`}>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                              <DocumentTextIcon className="w-4 h-4" />
                              Assigned Projects ({pm.projects.length})
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {pm.projects.map((project: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="bg-white rounded-lg p-3 border border-gray-200 hover:border-[#243d8a] transition-colors"
                                >
                                  <div className="flex items-start gap-2">
                                    <BuildingOfficeIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        {project.project_name}
                                      </p>
                                      <p className="text-xs text-gray-500">ID: {project.project_id}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {projectCount === 0 && (
                          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                            <p className="text-sm text-green-700 flex items-center gap-2">
                              <CheckCircleIcon className="w-5 h-5" />
                              This PM is available and ready to take on new projects
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : viewMode === 'cards' ? (
          /* Card View */
          <div className="space-y-4">
            {filteredEstimations.map((estimation, index) => (
            <motion.div
              key={estimation.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index }}
              className="bg-white rounded-xl shadow-md border border-gray-100 hover:shadow-xl transition-all relative"
            >
              {/* Floating Request Indicator - Show only in 'assigned' tab */}
              {filterStatus === 'assigned' && (() => {
                const hasRequests = estimation.hasPendingDayExtension;
                const requestCount = estimation.pendingDayExtensionCount || 0;

                return (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                    className="absolute -top-2 -right-2 z-10"
                  >
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => handleOpenDayExtensionModal(estimation.id)}
                        className={`rounded-full p-2 shadow-sm hover:shadow-md transition-all cursor-pointer group hover:scale-105 ${
                          hasRequests
                            ? 'bg-blue-500 text-white animate-pulse'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                        title={hasRequests ? `${requestCount} pending day extension request${requestCount > 1 ? 's' : ''}` : 'No pending day extension requests'}
                      >
                        <ClockIcon className="w-5 h-5" />
                      </button>
                      {hasRequests && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-300 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                        </span>
                      )}
                      {/* Tooltip on hover */}
                      <div className="absolute top-full right-0 mt-2 bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-[100]">
                        {hasRequests
                          ? `${requestCount} Day Extension Request${requestCount > 1 ? 's' : ''}`
                          : 'No Pending Requests'
                        }
                        <div className="absolute -top-1 right-3 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}

              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-gray-900">{estimation.projectName}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(estimation.priority)}`}>
                        {estimation.priority} priority
                      </span>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(estimation.status)}
                        <span className={`text-sm font-medium ${
                          estimation.status === 'cancelled' ? 'text-red-600' :
                          estimation.status === 'rejected' ? 'text-red-600' :
                          estimation.status === 'approved' ? 'text-green-600' :
                          estimation.status === 'client_confirmed' ? 'text-green-600' :
                          estimation.status === 'client_rejected' ? 'text-orange-600' :
                          estimation.status === 'pending_revision' ? 'text-red-600' :
                          'text-gray-600'
                        }`}>
                          {estimation.status === 'cancelled' ? 'CLIENT CANCELLED' :
                           estimation.status === 'client_confirmed' ? 'CLIENT CONFIRMED' :
                           estimation.status === 'client_rejected' ? 'CLIENT REJECTED' :
                           estimation.status === 'sent_for_confirmation' ? 'SENT TO CLIENT' :
                           estimation.status === 'pending_revision' ? 'PENDING REVISION' :
                           estimation.status.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-1">
                        <BuildingOfficeIcon className="w-4 h-4" />
                        <span>{estimation.clientName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="w-4 h-4" />
                        <span>Created: {estimation.submittedDate}</span>
                      </div>
                      {estimation.endDate && (
                        <div className="flex items-center gap-1 text-blue-600 font-medium">
                          <ClockIcon className="w-4 h-4" />
                          <span>End: {new Date(estimation.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                      )}
                      {estimation.durationDays && (
                        <div className="flex items-center gap-1 bg-blue-100 px-2 py-0.5 rounded-full">
                          <span className="text-blue-700 font-semibold text-xs">{estimation.durationDays} days</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-5 gap-4">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Total Value</p>
                        <p className="text-lg font-bold text-gray-900">
                          {(() => {
                            console.log(`🎨 [TD Card Render] BOQ ${estimation.id} (${estimation.projectName}) - Displaying totalValue: ${estimation.totalValue}`);
                            return formatCurrency(estimation.totalValue);
                          })()}
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Items</p>
                        <p className="text-lg font-bold text-blue-900">{estimation.itemCount}</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Labor Cost</p>
                        <p className="text-lg font-bold text-green-900">{formatCurrency(estimation.laborCost)}</p>
                      </div>
                      <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Material Cost</p>
                        <p className="text-lg font-bold text-red-900">{formatCurrency(estimation.materialCost)}</p>
                      </div>
                      <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">O&P Margin</p>
                        <p className="text-lg font-bold text-orange-900">{estimation.overheadPercentage + estimation.profitMargin}%</p>
                        <p className="text-[10px] text-orange-700">OH: {estimation.overheadPercentage}% | P: {estimation.profitMargin}%</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={async () => {
                        // Store reference to current estimation BEFORE any state changes
                        const currentEstimation = estimation;
                        // Load full details with preserved client
                        await loadBOQDetails(currentEstimation.id, currentEstimation);
                        setShowBOQModal(true);
                      }}
                      className="p-2.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group"
                      title="View BOQ Details"
                    >
                      <EyeIcon className="w-5 h-5 text-blue-600 group-hover:text-blue-700" />
                    </button>

                    {/* Show PM Details button - Only show when PM is assigned */}
                    {estimation.pmAssigned && (
                      <button
                        onClick={async () => {
                          // Load PM data if not already loaded
                          if (allPMs.length === 0) {
                            await loadPMs();
                          }

                          // Find PM details for this project
                          const pmForProject = allPMs.find(pm =>
                            pm.projects?.some((p: any) => p.project_id === estimation.projectId)
                          );

                          if (pmForProject) {
                            setSelectedProjectPM(pmForProject);
                            setShowPMDetailsModal(true);
                          } else {
                            // Try loading PMs again and retry
                            await loadPMs();
                            const retryPM = allPMs.find(pm =>
                              pm.projects?.some((p: any) => p.project_id === estimation.projectId)
                            );
                            if (retryPM) {
                              setSelectedProjectPM(retryPM);
                              setShowPMDetailsModal(true);
                            } else {
                              toast.error('PM details not found. Please refresh the page.');
                            }
                          }
                        }}
                        className="p-2.5 bg-green-50 hover:bg-green-100 rounded-lg transition-colors group"
                        title="View Assigned PM Details"
                      >
                        <UserIcon className="w-5 h-5 text-green-600 group-hover:text-green-700" />
                      </button>
                    )}

                    {/* Assign PM button - Only show when client has confirmed */}
                    {estimation.status === 'client_confirmed' && !estimation.pmAssigned && (
                      <button
                        onClick={() => {
                          setSelectedEstimation(estimation);
                          setShowAssignPMModal(true);
                        }}
                        className="px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-[#243d8a] text-sm font-medium flex items-center gap-1.5 group"
                        title="Assign Project Manager"
                      >
                        <UserPlusIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        Assign PM
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          </div>
        ) : (
          /* Table View */
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-200">
                    <TableHead className="text-gray-600">Project</TableHead>
                    <TableHead className="text-gray-600">Client</TableHead>
                    <TableHead className="text-gray-600">Submitted</TableHead>
                    <TableHead className="text-right text-gray-600">Total Value</TableHead>
                    <TableHead className="text-right text-gray-600">Items</TableHead>
                    <TableHead className="text-gray-600">Status</TableHead>
                    <TableHead className="text-gray-600">Priority</TableHead>
                    <TableHead className="text-gray-600">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEstimations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-gray-500">
                        <div className="flex flex-col items-center">
                          <DocumentTextIcon className="h-12 w-12 text-gray-300 mb-3" />
                          <p className="text-base">No estimations found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEstimations.map((estimation) => (
                      <TableRow key={estimation.id} className="border-gray-200 hover:bg-gray-50/50">
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-900">{estimation.projectName}</span>
                            <span className="text-xs text-gray-500">{estimation.location}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-600">{estimation.clientName}</TableCell>
                        <TableCell className="text-gray-600">{estimation.submittedDate}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(estimation.totalValue)}
                        </TableCell>
                        <TableCell className="text-right">{estimation.itemCount}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(estimation.status)}
                            <span className={`text-sm font-medium ${
                              estimation.status === 'cancelled' ? 'text-red-600' :
                              estimation.status === 'rejected' ? 'text-red-600' :
                              estimation.status === 'approved' ? 'text-green-600' :
                              estimation.status === 'client_confirmed' ? 'text-green-600' :
                              estimation.status === 'client_rejected' ? 'text-orange-600' :
                              estimation.status === 'pending_revision' ? 'text-red-600' :
                              'text-gray-600'
                            }`}>
                              {estimation.status === 'cancelled' ? 'CLIENT CANCELLED' :
                               estimation.status === 'client_confirmed' ? 'CLIENT CONFIRMED' :
                               estimation.status === 'client_rejected' ? 'CLIENT REJECTED' :
                               estimation.status === 'sent_for_confirmation' ? 'SENT TO CLIENT' :
                               estimation.status === 'pending_revision' ? 'PENDING REVISION' :
                               estimation.status.toUpperCase()}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(estimation.priority)}`}>
                            {estimation.priority}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* View BOQ Details - Always shown */}
                            <button
                              onClick={async () => {
                                const currentEstimation = estimation;
                                await loadBOQDetails(currentEstimation.id, currentEstimation);
                                setShowBOQModal(true);
                              }}
                              className="p-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group"
                              title="View BOQ Details"
                            >
                              <EyeIcon className="w-4 h-4 text-blue-600 group-hover:text-blue-700" />
                            </button>

                            {/* View PM Details - Only when PM is assigned */}
                            {estimation.pmAssigned && (
                              <button
                                onClick={async () => {
                                  if (allPMs.length === 0) {
                                    await loadPMs();
                                  }
                                  const pmForProject = allPMs.find(pm =>
                                    pm.projects?.some((p: any) => p.project_id === estimation.projectId)
                                  );
                                  if (pmForProject) {
                                    setSelectedProjectPM(pmForProject);
                                    setShowPMDetailsModal(true);
                                  } else {
                                    await loadPMs();
                                    const retryPM = allPMs.find(pm =>
                                      pm.projects?.some((p: any) => p.project_id === estimation.projectId)
                                    );
                                    if (retryPM) {
                                      setSelectedProjectPM(retryPM);
                                      setShowPMDetailsModal(true);
                                    } else {
                                      toast.error('PM details not found. Please refresh the page.');
                                    }
                                  }
                                }}
                                className="p-2 bg-green-50 hover:bg-green-100 rounded-lg transition-colors group"
                                title="View Assigned PM Details"
                              >
                                <UserIcon className="w-4 h-4 text-green-600 group-hover:text-green-700" />
                              </button>
                            )}

                            {/* Assign PM - Only when client confirmed and PM not assigned */}
                            {estimation.status === 'client_confirmed' && !estimation.pmAssigned && (
                              <button
                                onClick={() => {
                                  setSelectedEstimation(estimation);
                                  setShowAssignPMModal(true);
                                }}
                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-[#243d8a] text-xs font-medium flex items-center gap-1 group"
                                title="Assign Project Manager"
                              >
                                <UserPlusIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                Assign PM
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}

        {!showPMWorkloadView && filteredEstimations.length === 0 && filterStatus !== 'revisions' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No estimations found for the selected filter</p>
          </div>
        )}

        {/* Approval Modal */}
        {showApprovalModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-md max-w-lg w-full"
            >
              <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-green-200">
                <h2 className="text-xl font-bold text-green-900">Approve BOQ - {selectedEstimation.projectName}</h2>
                <p className="text-sm text-green-700 mt-1">Confirm approval for estimator to send to client</p>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Approval Notes (Optional)
                  </label>
                  <textarea
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    rows={3}
                    placeholder="Add any conditions, notes, or requirements for this approval..."
                  />
                </div>

                <div className="flex items-center gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowApprovalModal(false);
                      setApprovalNotes('');
                    }}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleApproval(selectedEstimation.id, true, approvalNotes)}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <CheckCircleIcon className="w-5 h-5" />
                    Approve Project
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Rejection Modal */}
        {showRejectionModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-md max-w-lg w-full"
            >
              <div className="bg-gradient-to-r from-red-50 to-red-100 px-6 py-4 border-b border-red-200">
                <h2 className="text-xl font-bold text-red-900">Reject Project</h2>
                <p className="text-sm text-red-700 mt-1">{selectedEstimation.projectName}</p>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rejection Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    rows={4}
                    placeholder="Please provide a reason for rejection..."
                    required
                  />
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> The rejection reason will be sent to the estimator for review and corrections.
                  </p>
                </div>

                <div className="flex items-center gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowRejectionModal(false);
                      setRejectionReason('');
                    }}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (rejectionReason.trim()) {
                        handleApproval(selectedEstimation.id, false, rejectionReason);
                      } else {
                        toast.error('Please provide a rejection reason');
                      }
                    }}
                    disabled={isRejecting}
                    className={`px-4 py-2 text-white rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      isRejecting
                        ? 'bg-red-400 cursor-not-allowed'
                        : 'bg-red-500 hover:bg-red-600'
                    }`}
                  >
                    {isRejecting ? (
                      <>
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Rejecting...
                      </>
                    ) : (
                      <>
                        <XCircleIcon className="w-5 h-5" />
                        Reject Project
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* BOQ Details Modal - Using shared component */}
        <BOQDetailsModal
          isOpen={showBOQModal}
          onClose={() => setShowBOQModal(false)}
          boq={selectedEstimation ? { boq_id: selectedEstimation.id, boq_name: selectedEstimation.projectName } : null}
          onDownload={() => setShowFormatModal(true)}
          onApprove={
            selectedEstimation && (selectedEstimation.status === 'pending' || selectedEstimation.status === 'pending_revision')
              ? () => {
                  // Show approval modal (TD needs to review comparison first for pending, or direct approval for revisions)
                  setShowApprovalModal(true);
                }
              : undefined
          }
          onReject={
            selectedEstimation && (selectedEstimation.status === 'pending' || selectedEstimation.status === 'pending_revision')
              ? () => {
                  // Show rejection modal
                  setShowRejectionModal(true);
                }
              : undefined
          }
          refreshTrigger={boqDetailsRefreshTrigger}
        />

        {/* OLD BOQ Modal - TO BE REMOVED - keeping temporarily for reference */}
        {false && showBOQModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-md max-w-6xl w-full max-h-[90vh] overflow-hidden"
            >
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-blue-900">BOQ Details - {selectedEstimation.projectName}</h2>
                    <p className="text-sm text-blue-700">{selectedEstimation.clientName} • {selectedEstimation.location} • {selectedEstimation.floor}</p>
                    <p className="text-xs text-blue-600 mt-1">Working Hours: {selectedEstimation.workingHours}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Download - Only show after TD approves (status approved or later) */}
                    {(selectedEstimation.status === 'approved' ||
                      selectedEstimation.status === 'sent_for_confirmation' ||
                      selectedEstimation.status === 'client_confirmed' ||
                      selectedEstimation.pmAssigned) && (
                      <button
                        onClick={() => setShowFormatModal(true)}
                        className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-1"
                        title="Download BOQ"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                        Download
                      </button>
                    )}

                    {/* Assign PM - Only after client confirmed and PM not yet assigned */}
                    {selectedEstimation.status === 'client_confirmed' && !selectedEstimation.pmAssigned && (
                      <button
                        onClick={() => {
                          setShowAssignPMModal(true);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-red-50 to-red-100 text-red-900 border border-red-200 rounded-lg font-medium text-sm transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                        title="Assign Project Manager to this project"
                      >
                        <UserPlusIcon className="w-4 h-4" />
                        Assign PM
                      </button>
                    )}
                    <button
                      onClick={() => setShowHistoryModal(true)}
                      className="px-3 py-1.5 bg-white/70 hover:bg-white text-blue-700 rounded-lg transition-colors text-sm font-medium flex items-center gap-1"
                    >
                      <ClockIcon className="w-4 h-4" />
                      History
                    </button>
                    <button
                      onClick={() => setShowBOQModal(false)}
                      className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                    >
                      <XMarkIcon className="w-6 h-6 text-blue-900" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                {loadingBOQDetails ? (
                  <div className="flex items-center justify-center py-12">
                    <ModernLoadingSpinners variant="pulse-wave" />
                  </div>
                ) : (
                  <>
                    {/* Preliminaries & Approval Works */}
                    {(selectedEstimation as any).preliminaries &&
                     (((selectedEstimation as any).preliminaries.items?.length > 0) ||
                      (selectedEstimation as any).preliminaries.notes) && (
                      <div className="mb-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-purple-500 rounded-lg">
                            <DocumentTextIcon className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">Preliminaries & Approval Works</h3>
                            <p className="text-xs text-gray-600">Selected conditions and terms</p>
                          </div>
                        </div>

                        {(selectedEstimation as any).preliminaries.items &&
                         (selectedEstimation as any).preliminaries.items.length > 0 && (
                          <div className="space-y-2 mb-4">
                            {(selectedEstimation as any).preliminaries.items.filter((item: any) => item.checked).map((item: any, index: number) => (
                              <div key={index} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-purple-200">
                                <div className="mt-0.5 w-4 h-4 rounded border-2 border-purple-500 bg-purple-500 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                                <div className="flex-1 text-sm text-gray-700">
                                  {item.description}
                                  {item.isCustom && (
                                    <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded font-medium">Custom</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {(selectedEstimation as any).preliminaries.notes && (
                          <div className="bg-white rounded-lg p-4 border border-purple-200">
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">Additional Notes</h4>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {(selectedEstimation as any).preliminaries.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Existing BOQ Items */}
                    {selectedEstimation.existingItems && selectedEstimation.existingItems.length > 0 && (
                      <div className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-gray-900">Existing BOQ Items</h3>
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                            {selectedEstimation.existingItems.length} Items
                          </span>
                        </div>
                        <div className="space-y-4">
                          {selectedEstimation.existingItems.map((item, index) => (
                            <div key={item.id} className="border border-blue-200 rounded-xl p-4 bg-blue-50/30 hover:shadow-md transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-bold text-gray-900">
                              {item.description}
                            </h4>
                            {item.briefDescription && (
                              <p className="text-sm text-gray-600 mt-1">{item.briefDescription}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                              <span>Qty: {item.quantity} {item.unit}</span>
                              <span>Rate: AED{item.rate}/{item.unit}</span>
                            </div>
                          </div>
                        </div>

                        {/* Materials Breakdown */}
                        <div className="bg-blue-50 rounded-lg p-3 mb-3">
                          <p className="text-sm font-semibold text-blue-900 mb-2">+ Raw Materials</p>
                          <div className="space-y-1">
                            {item.materials.map((material, mIndex) => (
                              <div key={mIndex} className="text-sm">
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-700">
                                    {material.name} ({material.quantity} {material.unit})
                                  </span>
                                  <span className="font-medium text-gray-900">
                                    Est. Cost: AED{material.amount.toLocaleString()}
                                  </span>
                                </div>
                                {(material as any).description && (
                                  <p className="text-xs text-gray-500 ml-4 mt-0.5">{(material as any).description}</p>
                                )}
                                {((material as any).vat_percentage || 0) > 0 && (
                                  <p className="text-xs text-blue-600 ml-4 mt-0.5">VAT: {(material as any).vat_percentage}%</p>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="border-t border-blue-200 mt-2 pt-2">
                            <div className="flex justify-between text-sm font-semibold">
                              <span className="text-blue-900">Total Materials:</span>
                              <span className="text-blue-900">AED{item.materials.reduce((sum, m) => sum + m.amount, 0).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Labour Breakdown */}
                        <div className="bg-green-50 rounded-lg p-3 mb-3">
                          <p className="text-sm font-semibold text-green-900 mb-2">+ Labour</p>
                          <div className="space-y-1">
                            {item.labour && item.labour.map((labor, lIndex) => (
                              <div key={lIndex} className="flex items-center justify-between text-sm">
                                <span className="text-gray-700">
                                  {labor.type} ({labor.quantity} {labor.unit})
                                </span>
                                <span className="font-medium text-gray-900">
                                  Est. Cost: AED{labor.amount.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="border-t border-green-200 mt-2 pt-2">
                            <div className="flex justify-between text-sm font-semibold">
                              <span className="text-green-900">Total Labour:</span>
                              <span className="text-green-900">AED{item.laborCost.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Item Total, Miscellaneous, Overhead & Profit, Discount & VAT */}
                        <div className="bg-orange-50 rounded-lg p-3 mb-3">
                          <p className="text-sm font-semibold text-orange-900 mb-2">Pricing Breakdown</p>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-700">Item Total (Qty × Rate)</span>
                              <span className="text-gray-900 font-semibold">AED{((item as any).item_total || (item.quantity * item.rate)).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-700">Miscellaneous ({(item as any).miscellaneous_percentage || item.overheadPercentage || 0}%)</span>
                              <span className="text-gray-900">AED{((item as any).miscellaneous_amount || (((item as any).item_total || (item.quantity * item.rate)) * ((item as any).miscellaneous_percentage || item.overheadPercentage || 0) / 100)).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-700">Overhead & Profit ({(item as any).overhead_profit_percentage || item.profitMarginPercentage || 0}%)</span>
                              <span className="text-gray-900">AED{((item as any).overhead_profit_amount || (((item as any).item_total || (item.quantity * item.rate)) * ((item as any).overhead_profit_percentage || item.profitMarginPercentage || 0) / 100)).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between font-medium border-t border-orange-200 pt-1">
                              <span className="text-gray-700">Subtotal</span>
                              <span className="text-gray-900">AED{((item as any).before_discount || ((item as any).item_total + (item as any).miscellaneous_amount + (item as any).overhead_profit_amount)).toLocaleString()}</span>
                            </div>
                            {((item as any).discount_amount || 0) > 0 && (
                              <div className="flex justify-between text-red-600">
                                <span>Discount ({(item as any).discount_percentage || 0}%)</span>
                                <span className="font-medium">- AED{((item as any).discount_amount || 0).toLocaleString()}</span>
                              </div>
                            )}
                            {((item as any).vat_amount || 0) > 0 && (
                              <div className="flex justify-between text-blue-600">
                                <span>VAT ({(item as any).vat_percentage || 0}%)</span>
                                <span className="font-medium">+ AED{((item as any).vat_amount || 0).toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                          {/* Raw Materials Reference (for internal view) */}
                          <div className="mt-3 pt-2 border-t border-orange-200">
                            <p className="text-xs text-gray-500 font-medium mb-1">Raw Materials Breakdown (Reference Only):</p>
                            <div className="space-y-0.5 text-xs text-gray-600">
                              <div className="flex justify-between">
                                <span>Materials:</span>
                                <span>AED{item.materials.reduce((sum, m) => sum + m.amount, 0).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Labour:</span>
                                <span>AED{item.laborCost.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between font-medium">
                                <span>Raw Materials Total:</span>
                                <span>AED{(item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Estimated Selling Price */}
                        <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-3">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-900">Estimated Selling Price:</span>
                            <span className="text-xl font-bold text-green-900">AED{item.estimatedSellingPrice.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* New Purchase Items */}
                    {selectedEstimation.newItems && selectedEstimation.newItems.length > 0 && (
                      <div className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-gray-900">New Purchase Items</h3>
                          <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                            {selectedEstimation.newItems.length} Items
                          </span>
                        </div>
                        <div className="space-y-4">
                          {selectedEstimation.newItems.map((item, index) => (
                            <div key={item.id} className="border border-red-200 rounded-xl p-4 bg-red-50/30 hover:shadow-md transition-all">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-gray-900">
                                      {item.description}
                                    </h4>
                                    <span className="px-2 py-0.5 text-xs bg-purple-200 text-red-800 rounded font-semibold">NEW</span>
                                  </div>
                                  {item.briefDescription && (
                                    <p className="text-sm text-gray-600 mt-1">{item.briefDescription}</p>
                                  )}
                                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                                    <span>Qty: {item.quantity} {item.unit}</span>
                                    <span>Rate: AED{item.rate}/{item.unit}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Materials Breakdown - Purple Theme */}
                              <div className="bg-red-50 rounded-lg p-3 mb-3 border border-red-200">
                                <p className="text-sm font-semibold text-red-900 mb-2">+ Raw Materials</p>
                                <div className="space-y-1">
                                  {item.materials.map((material, mIndex) => (
                                    <div key={mIndex} className="flex items-center justify-between text-sm">
                                      <span className="text-gray-700">
                                        {material.name} ({material.quantity} {material.unit})
                                      </span>
                                      <span className="font-medium text-gray-900">
                                        Est. Cost: AED{material.amount.toLocaleString()}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className="border-t border-red-200 mt-2 pt-2">
                                  <div className="flex justify-between text-sm font-semibold">
                                    <span className="text-red-900">Total Materials:</span>
                                    <span className="text-red-900">AED{item.materials.reduce((sum, m) => sum + m.amount, 0).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Labour Breakdown */}
                              <div className="bg-green-50 rounded-lg p-3 mb-3">
                                <p className="text-sm font-semibold text-green-900 mb-2">+ Labour</p>
                                <div className="space-y-1">
                                  {item.labour && item.labour.map((labor, lIndex) => (
                                    <div key={lIndex} className="flex items-center justify-between text-sm">
                                      <span className="text-gray-700">
                                        {labor.type} ({labor.quantity} {labor.unit})
                                      </span>
                                      <span className="font-medium text-gray-900">
                                        Est. Cost: AED{labor.amount.toLocaleString()}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className="border-t border-green-200 mt-2 pt-2">
                                  <div className="flex justify-between text-sm font-semibold">
                                    <span className="text-green-900">Total Labour:</span>
                                    <span className="text-green-900">AED{item.laborCost.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Overheads, Profit & Discount */}
                              <div className="bg-yellow-50 rounded-lg p-3 mb-3">
                                <p className="text-sm font-semibold text-gray-900 mb-2">+ Overheads, Profit & Discount</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Overhead ({item.overheadPercentage || 0}%)</span>
                                    <span className="text-gray-900">AED{((item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost) * (item.overheadPercentage || 0) / 100).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Profit Margin ({item.profitMarginPercentage || 0}%)</span>
                                    <span className="text-gray-900">AED{((item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost) * (item.profitMarginPercentage || 0) / 100).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className={`${(item.discountPercentage || 0) > 0 ? 'text-red-600' : 'text-gray-700'}`}>Discount ({item.discountPercentage || 0}%)</span>
                                    <span className={`${(item.discountPercentage || 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}>{(item.discountPercentage || 0) > 0 ? '- ' : ''}AED{((() => {
                                      const baseCost = item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost;
                                      const overhead = baseCost * (item.overheadPercentage || 0) / 100;
                                      const profit = baseCost * (item.profitMarginPercentage || 0) / 100;
                                      const subtotal = baseCost + overhead + profit;
                                      return (subtotal * (item.discountPercentage || 0) / 100).toLocaleString();
                                    })())}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Estimated Selling Price */}
                              <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-3">
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-gray-900">Estimated Selling Price:</span>
                                  <span className="text-xl font-bold text-green-900">AED{item.estimatedSellingPrice.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fallback: No items message */}
                    {(!selectedEstimation.existingItems || selectedEstimation.existingItems.length === 0) &&
                     (!selectedEstimation.newItems || selectedEstimation.newItems.length === 0) && (
                      <div className="text-center py-8 bg-gray-50 rounded-lg">
                        <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-500">No BOQ items available</p>
                      </div>
                    )}
                  </>
                )}

                {/* Cost Summary */}
                <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                  <h4 className="font-bold text-gray-900 mb-3">Cost Summary</h4>
                  <div className="space-y-2">
                    {(() => {
                      // Calculate totals from items if available
                      const totalMaterialCost = selectedEstimation.boqItems?.reduce((sum, item) =>
                        sum + item.materials.reduce((matSum, m) => matSum + m.amount, 0), 0
                      ) || selectedEstimation.materialCost || 0;

                      const totalLaborCost = selectedEstimation.boqItems?.reduce((sum, item) =>
                        sum + item.laborCost, 0
                      ) || selectedEstimation.laborCost || 0;

                      // Use the actual grand total from API, or sum of all item selling prices
                      // This is correct because items may have varying overhead/profit percentages
                      const grandTotal = selectedEstimation.totalValue ||
                        selectedEstimation.boqItems?.reduce((sum, item) => sum + (item.estimatedSellingPrice || 0), 0) || 0;

                      // Calculate VAT from items (both item-level and per-material VAT)
                      const totalVAT = selectedEstimation.boqItems?.reduce((sum, item) => {
                        // Get item-level VAT amount
                        const itemVAT = (item as any).vat_amount || 0;

                        // Also calculate per-material VAT if materials exist
                        let materialVAT = 0;
                        if (item.materials) {
                          materialVAT = item.materials.reduce((matSum, mat) => {
                            const matVatPct = (mat as any).vat_percentage || 0;
                            if (matVatPct > 0) {
                              return matSum + (mat.amount * matVatPct / 100);
                            }
                            return matSum;
                          }, 0);
                        }

                        // Sum both item-level and per-material VAT
                        return sum + itemVAT + materialVAT;
                      }, 0) || 0;

                      // NEW CALCULATION: Calculate from item_total instead of subitems
                      let totalItemTotal = 0;
                      let totalMiscellaneous = 0;
                      let totalOverheadProfit = 0;
                      let totalDiscount = 0;

                      selectedEstimation.boqItems?.forEach((item: any) => {
                        const itemTotal = (item as any).item_total || (item.quantity * item.rate) || 0;
                        const miscAmount = (item as any).miscellaneous_amount || (itemTotal * (item.overheadPercentage || 0) / 100);
                        const overheadProfitAmount = (item as any).overhead_profit_amount || (itemTotal * (item.profitMarginPercentage || 0) / 100);
                        const discountAmount = (item as any).discount_amount || 0;

                        totalItemTotal += itemTotal;
                        totalMiscellaneous += miscAmount;
                        totalOverheadProfit += overheadProfitAmount;
                        totalDiscount += discountAmount;
                      });

                      const baseCost = totalMaterialCost + totalLaborCost;
                      const subtotal = totalItemTotal + totalMiscellaneous + totalOverheadProfit;
                      const afterDiscount = subtotal - totalDiscount;
                      const finalTotal = afterDiscount + totalVAT;

                      // Calculate average percentages
                      const avgMiscPct = totalItemTotal > 0 ? (totalMiscellaneous / totalItemTotal) * 100 : 0;
                      const avgOHProfitPct = totalItemTotal > 0 ? (totalOverheadProfit / totalItemTotal) * 100 : 0;
                      const avgDiscountPct = subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0;

                      return (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Total Material Cost:</span>
                            <span className="font-semibold">AED {totalMaterialCost.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Total Labor Cost:</span>
                            <span className="font-semibold">AED {totalLaborCost.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm pt-2 border-t">
                            <span className="text-gray-700 font-medium">Base Cost:</span>
                            <span className="font-semibold">AED {baseCost.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm pt-2 mt-2 border-t-2">
                            <span className="text-gray-700 font-medium">Item Total (Qty × Rate):</span>
                            <span className="font-bold">AED {totalItemTotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Miscellaneous ({avgMiscPct.toFixed(0)}%):</span>
                            <span className="font-semibold">AED {totalMiscellaneous.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Overhead & Profit ({avgOHProfitPct.toFixed(0)}%):</span>
                            <span className="font-semibold">AED {totalOverheadProfit.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm pt-2 border-t">
                            <span className="text-gray-700">Subtotal:</span>
                            <span className="font-semibold">AED {subtotal.toLocaleString()}</span>
                          </div>
                          {totalDiscount > 0 && (
                            <div className="flex justify-between text-sm text-red-600">
                              <span>Discount ({avgDiscountPct.toFixed(0)}%):</span>
                              <span className="font-semibold">- AED {totalDiscount.toLocaleString()}</span>
                            </div>
                          )}
                          {totalVAT > 0 && (
                            <div className="flex justify-between text-sm text-blue-600">
                              <span>Total VAT:</span>
                              <span className="font-semibold">+ AED {totalVAT.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="border-t border-blue-300 pt-2 mt-2">
                            <div className="flex justify-between">
                              <span className="font-bold text-gray-900">Grand Total:</span>
                              <span className="font-bold text-lg text-green-600">
                                AED {(grandTotal || finalTotal).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Status Messages - Inside Scrollable Area */}
                {selectedEstimation.status === 'approved' && (
                  <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircleIcon className="w-6 h-6" />
                      <span className="font-semibold">This BOQ has been approved</span>
                    </div>
                    {selectedEstimation.approvalNotes && (
                      <p className="text-sm text-green-600 mt-2">Notes: {selectedEstimation.approvalNotes}</p>
                    )}
                  </div>
                )}

                {selectedEstimation.status === 'rejected' && (
                  <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex items-center gap-2 text-red-700">
                      <XCircleIcon className="w-6 h-6" />
                      <span className="font-semibold">This BOQ has been rejected</span>
                    </div>
                    {selectedEstimation.rejectionReason && (
                      <p className="text-sm text-red-600 mt-2">Reason: {selectedEstimation.rejectionReason}</p>
                    )}
                  </div>
                )}

              </div>

              {/* Footer with Approve/Reject Buttons */}
              <div className="bg-gradient-to-r from-gray-50 to-white border-t border-gray-200">
                {/* Approve/Reject Buttons - Only for pending BOQs */}
                {selectedEstimation.status === 'pending' && (
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700">Internal Approval:</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setShowRejectionModal(true)}
                          className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-md"
                        >
                          <XCircleIcon className="w-5 h-5" />
                          Reject
                        </button>
                        <button
                          onClick={() => setShowApprovalModal(true)}
                          className="px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-md"
                        >
                          <CheckCircleIcon className="w-5 h-5" />
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Re-Approve Button - For pending_revision BOQs */}
                {selectedEstimation.status === 'pending_revision' && (
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-red-700">Revision Approval:</span>
                        <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full">Revised by Estimator</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setShowRejectionModal(true)}
                          className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-md"
                        >
                          <XCircleIcon className="w-5 h-5" />
                          Reject
                        </button>
                        <button
                          onClick={() => setShowApprovalModal(true)}
                          className="px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-md"
                        >
                          <CheckCircleIcon className="w-5 h-5" />
                          Re-Approve
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status Info - Only for approved BOQs (before sent to client) */}
                {selectedEstimation.status === 'approved' && (
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="text-sm text-gray-600">
                      <span className="font-semibold text-green-600">✓ Internally Approved</span>
                      <p className="text-xs text-gray-500 mt-0.5">Waiting for Estimator to send to client</p>
                    </div>
                  </div>
                )}

                {/* Status Info - For revision_approved BOQs */}
                {selectedEstimation.status === 'revision_approved' && (
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="text-sm text-gray-600">
                      <span className="font-semibold text-green-600">✓ Revision Approved</span>
                      <p className="text-xs text-gray-500 mt-0.5">Waiting for Estimator to send revision to client</p>
                    </div>
                  </div>
                )}

                {/* Footer Info */}
                <div className="px-6 py-3">
                  <div className="text-sm text-gray-600">
                    Submitted by: <span className="font-semibold">{selectedEstimation.estimator}</span> on {selectedEstimation.submittedDate}
                    {selectedEstimation.emailSent && (
                      <span className="ml-4 text-green-600">
                        <CheckCircleIcon className="w-4 h-4 inline mr-1" />
                        Sent to Client
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Download Format Selection Modal */}
        {showFormatModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-md max-w-md w-full"
            >
              <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-green-200">
                <h2 className="text-xl font-bold text-green-900">Download BOQ</h2>
                <p className="text-sm text-green-700 mt-1">{selectedEstimation.projectName}</p>
              </div>

              <div className="p-6">
                {/* Comparison Tip */}
                {selectedEstimation.status === 'pending' && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">
                        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-blue-800 font-medium">Comparison Tip</p>
                        <p className="text-xs text-blue-700 mt-1">
                          Download both versions to compare what's visible internally vs what the client will see after estimator sends it.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Version Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Version:
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="downloadType"
                        value="internal"
                        checked={downloadType === 'internal'}
                        onChange={() => setDownloadType('internal')}
                        className="w-4 h-4 text-green-600"
                      />
                      <div className="ml-3 flex-1">
                        <span className="font-semibold text-gray-900">Internal Version</span>
                        <p className="text-xs text-gray-600">With overhead & profit margins (complete breakdown)</p>
                      </div>
                    </label>
                    <label className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="downloadType"
                        value="client"
                        checked={downloadType === 'client'}
                        onChange={() => setDownloadType('client')}
                        className="w-4 h-4 text-red-600"
                      />
                      <div className="ml-3 flex-1">
                        <span className="font-semibold text-gray-900">Client Version</span>
                        <p className="text-xs text-gray-600">Without overhead & profit (client-friendly)</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Format Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Format:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleDownload('excel')}
                      className="p-4 border-2 border-green-200 rounded-lg hover:bg-green-50 hover:border-green-400 transition-all group"
                    >
                      <div className="text-center">
                        <div className="w-12 h-12 bg-green-100 rounded-lg mx-auto mb-2 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <span className="font-semibold text-gray-900">Excel</span>
                        <p className="text-xs text-gray-600 mt-1">Multiple sheets with details</p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleDownload('pdf')}
                      className="p-4 border-2 border-red-200 rounded-lg hover:bg-red-50 hover:border-red-400 transition-all group"
                    >
                      <div className="text-center">
                        <div className="w-12 h-12 bg-red-100 rounded-lg mx-auto mb-2 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="font-semibold text-gray-900">PDF</span>
                        <p className="text-xs text-gray-600 mt-1">Professional document</p>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-end">
                  <button
                    onClick={() => setShowFormatModal(false)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* PM Assignment Modal - Modern Design */}
        {showAssignPMModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="bg-[#243d8a] px-6 py-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <UserPlusIcon className="w-6 h-6" />
                      Assign Project Manager
                    </h2>
                    <p className="text-blue-100 text-sm">{selectedEstimation.projectName}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowAssignPMModal(false);
                      setSelectedPMId(null);
                      setNewPMData({ full_name: '', email: '', phone: '' });
                      setAssignMode('existing');
                    }}
                    className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1.5 transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-4 overflow-y-auto flex-1">
                {/* Mode Selection - Modern Tab Style */}
                <div className="bg-gray-100 rounded-lg p-1 mb-3 inline-flex w-full">
                  <button
                    onClick={() => setAssignMode('existing')}
                    className={`flex-1 py-2 px-4 rounded-md font-semibold text-sm transition-all duration-200 ${
                      assignMode === 'existing'
                        ? 'bg-white text-[#243d8a] shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <UserIcon className="w-4 h-4 inline mr-1.5" />
                    Select Existing PM
                  </button>
                  <button
                    onClick={() => setAssignMode('create')}
                    className={`flex-1 py-2 px-4 rounded-md font-semibold text-sm transition-all duration-200 ${
                      assignMode === 'create'
                        ? 'bg-white text-[#243d8a] shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <UserPlusIcon className="w-4 h-4 inline mr-1.5" />
                    Create New PM
                  </button>
                </div>

                {/* Existing PM Selection */}
                {assignMode === 'existing' && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <label className="block text-sm font-semibold text-gray-700">
                        Select Project Manager <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Search PM..."
                        value={pmSearchQuery}
                        onChange={(e) => setPmSearchQuery(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#243d8a] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="max-h-96 overflow-y-auto space-y-4">
                      {/* Filter PMs by search */}
                      {(() => {
                        const filteredPMs = allPMs.filter(pm =>
                          pmSearchQuery === '' ||
                          (pm.pm_name || pm.full_name)?.toLowerCase().includes(pmSearchQuery.toLowerCase()) ||
                          pm.email?.toLowerCase().includes(pmSearchQuery.toLowerCase())
                        );

                        const onlinePMs = filteredPMs.filter(pm => pm.is_active === true);
                        const offlinePMs = filteredPMs.filter(pm => pm.is_active !== true);

                        return (
                          <>
                            {/* Online PMs Section */}
                            {onlinePMs.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-2 px-1">
                                  <UserIcon className="w-4 h-4 text-green-600" />
                                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                  <h3 className="text-xs font-bold text-green-700 uppercase tracking-wide">Online</h3>
                                  <div className="flex-1 h-px bg-green-200"></div>
                                </div>
                                <div className="space-y-2">
                                  {onlinePMs.map((pm: any) => {
                          const isSelected = selectedPMId === pm.user_id;
                          const projectCount = pm.projectCount || 0;
                          const isAvailable = projectCount === 0;
                          const isBusy = projectCount >= 1 && projectCount <= 3;
                          const isOverloaded = projectCount > 3;

                          let statusColor = '';
                          let statusText = '';
                          let statusBg = '';

                          if (isAvailable) {
                            statusColor = 'text-green-700';
                            statusText = 'Available';
                            statusBg = 'bg-green-50 border-green-200';
                          } else if (isBusy) {
                            statusColor = 'text-yellow-700';
                            statusText = 'Busy';
                            statusBg = 'bg-yellow-50 border-yellow-200';
                          } else {
                            statusColor = 'text-red-700';
                            statusText = 'Overloaded';
                            statusBg = 'bg-red-50 border-red-200';
                          }

                          return (
                            <div key={pm.user_id}>
                              <div
                                onClick={() => setSelectedPMId(pm.user_id)}
                                className={`border rounded-md px-3 py-2 cursor-pointer transition-all ${
                                  isSelected
                                    ? 'border-[#243d8a] bg-blue-50 shadow-sm'
                                    : `border-gray-200 hover:border-gray-300 hover:shadow-sm ${statusBg}`
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  {/* Avatar with Online Status */}
                                  <div className="relative flex-shrink-0">
                                    <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                      {(pm.pm_name || pm.full_name).charAt(0).toUpperCase()}
                                    </div>
                                    <div
                                      className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white bg-green-500"
                                      title="Online"
                                    />
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-semibold text-gray-900 text-sm">{pm.pm_name || pm.full_name}</h4>
                                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 flex items-center gap-1 bg-green-100 text-green-700">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                        Online
                                      </span>
                                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor} ${statusBg} border whitespace-nowrap`}>
                                        {statusText}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-gray-600 flex-shrink-0">
                                    <span className="max-w-[200px] truncate">{pm.email}</span>
                                    <span className="whitespace-nowrap">{pm.phone}</span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <div className="flex items-center gap-1">
                                      <BuildingOfficeIcon className="w-4 h-4 text-gray-400" />
                                      <span className="font-medium text-gray-700 text-sm">{projectCount}</span>
                                      <span className="text-gray-500 text-xs">{projectCount === 1 ? 'project' : 'projects'}</span>
                                    </div>
                                    {projectCount > 0 && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedPMId(expandedPMId === pm.user_id ? null : pm.user_id);
                                        }}
                                        className="text-xs text-[#243d8a] hover:underline font-medium whitespace-nowrap"
                                      >
                                        {expandedPMId === pm.user_id ? 'Hide' : 'View'}
                                      </button>
                                    )}
                                    {/* Only show delete button for PMs with no assigned projects */}
                                    {projectCount === 0 && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeletePM(pm.user_id, pm.pm_name || pm.full_name);
                                        }}
                                        className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                                        title="Delete PM"
                                      >
                                        <TrashIcon className="w-4 h-4" />
                                      </button>
                                    )}
                                    {isSelected && (
                                      <CheckCircleIcon className="w-5 h-5 text-[#243d8a] flex-shrink-0" />
                                    )}
                                  </div>
                                </div>
                              </div>

                              {expandedPMId === pm.user_id && pm.projects && pm.projects.length > 0 && (
                                <div className="ml-4 mt-1 mb-2 p-2 bg-gray-50 rounded border-l-2 border-gray-300">
                                  <p className="text-xs font-semibold text-gray-600 mb-1">Assigned Projects:</p>
                                  <ul className="space-y-0.5">
                                    {pm.projects.map((project: any, idx: number) => (
                                      <li key={idx} className="text-xs text-gray-700 flex items-start gap-1">
                                        <span className="text-gray-400">•</span>
                                        <span>{project.project_name}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        })}
                                </div>
                              </div>
                            )}

                            {/* Offline PMs Section */}
                            {offlinePMs.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-2 px-1">
                                  <UserIcon className="w-4 h-4 text-gray-500" />
                                  <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                  <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Offline</h3>
                                  <div className="flex-1 h-px bg-gray-200"></div>
                                </div>
                                <div className="space-y-2">
                                  {offlinePMs.map((pm: any) => {
                          const projectCount = pm.projectCount || 0;
                          const isAvailable = projectCount === 0;
                          const isBusy = projectCount >= 1 && projectCount <= 3;
                          const isOverloaded = projectCount > 3;

                          let statusColor = '';
                          let statusText = '';
                          let statusBg = '';

                          if (isAvailable) {
                            statusColor = 'text-green-700';
                            statusText = 'Available';
                            statusBg = 'bg-green-50 border-green-200';
                          } else if (isBusy) {
                            statusColor = 'text-yellow-700';
                            statusText = 'Busy';
                            statusBg = 'bg-yellow-50 border-yellow-200';
                          } else {
                            statusColor = 'text-red-700';
                            statusText = 'Overloaded';
                            statusBg = 'bg-red-50 border-red-200';
                          }

                          return (
                            <div key={pm.user_id}>
                              <div className="border-2 border-gray-200 bg-gray-50 rounded-md px-3 py-2 cursor-not-allowed opacity-60">
                                <div className="flex items-center gap-3">
                                  {/* Avatar with Offline Status */}
                                  <div className="relative flex-shrink-0">
                                    <div className="w-9 h-9 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                      {(pm.pm_name || pm.full_name).charAt(0).toUpperCase()}
                                    </div>
                                    <div
                                      className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white bg-gray-400"
                                      title="Offline"
                                    />
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-semibold text-gray-700 text-sm">{pm.pm_name || pm.full_name}</h4>
                                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 flex items-center gap-1 bg-gray-200 text-gray-700">
                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                                        Offline
                                      </span>
                                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor} ${statusBg} border whitespace-nowrap`}>
                                        {statusText}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-gray-500 flex-shrink-0">
                                    <span className="max-w-[200px] truncate">{pm.email}</span>
                                    <span className="whitespace-nowrap">{pm.phone}</span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <div className="flex items-center gap-1">
                                      <BuildingOfficeIcon className="w-4 h-4 text-gray-400" />
                                      <span className="font-medium text-gray-600 text-sm">{projectCount}</span>
                                      <span className="text-gray-400 text-xs">{projectCount === 1 ? 'project' : 'projects'}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                                </div>
                              </div>
                            )}

                            {filteredPMs.length === 0 && (
                              <div className="text-center py-8">
                                <UserIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500">No Project Managers found</p>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {allPMs.length === 0 && (
                      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <p className="text-sm text-amber-800 flex items-center gap-2">
                          <DocumentTextIcon className="w-5 h-5" />
                          No Project Managers available. Create a new one.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Create New PM Form */}
                {assignMode === 'create' && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-5"
                  >
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newPMData.full_name}
                        onChange={(e) => setNewPMData({ ...newPMData, full_name: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#243d8a] focus:ring-4 focus:ring-blue-100 transition-all"
                        placeholder="Enter full name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={newPMData.email}
                        onChange={(e) => setNewPMData({ ...newPMData, email: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#243d8a] focus:ring-4 focus:ring-blue-100 transition-all"
                        placeholder="john.doe@company.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Phone Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={newPMData.phone}
                        onChange={(e) => setNewPMData({ ...newPMData, phone: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#243d8a] focus:ring-4 focus:ring-blue-100 transition-all"
                        placeholder="+971 50 123 4567"
                      />
                    </div>
                  </motion.div>
                )}

                {/* Info Note */}
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-[#243d8a] rounded-lg p-5 mt-8">
                  <div className="flex gap-3">
                    <BuildingOfficeIcon className="w-6 h-6 text-[#243d8a] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-[#243d8a] mb-1">Project Assignment</p>
                      <p className="text-sm text-gray-700">
                        The assigned Project Manager will gain full access to manage this project, including site engineers and procurement.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-4 mt-8 pt-6 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowAssignPMModal(false);
                      setSelectedPMId(null);
                      setNewPMData({ full_name: '', email: '', phone: '' });
                      setAssignMode('existing');
                    }}
                    className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAssignPM}
                    className="flex-1 px-6 py-3 bg-[#243d8a] hover:bg-[#1a2d66] text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                  >
                    <UserPlusIcon className="w-5 h-5" />
                    {assignMode === 'create' ? 'Create & Assign' : 'Assign to Project'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* BOQ Comparison Modal - Internal vs Client */}
        {showComparisonModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden"
            >
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">BOQ Comparison - {selectedEstimation.projectName}</h2>
                    <p className="text-sm text-gray-600 mt-1">Compare what TD sees vs what Client will receive</p>
                  </div>
                  <button
                    onClick={() => setShowComparisonModal(false)}
                    className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6 text-gray-700" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-0 overflow-y-auto max-h-[calc(90vh-200px)]">
                {/* Internal Version (Left) */}
                <div className="p-6 bg-orange-50/30 border-r-2 border-orange-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="px-3 py-1 bg-orange-100 border border-orange-300 rounded-lg">
                      <span className="text-sm font-bold text-orange-800">INTERNAL VERSION</span>
                    </div>
                    <span className="text-xs text-gray-600">(What TD sees)</span>
                  </div>

                  {/* BOQ Items - Internal (with Sub-Items) */}
                  <div className="space-y-3 mb-4">
                    {(selectedEstimation.boqItems || []).map((item, index) => {
                      const hasSubItems = (item as any).sub_items && (item as any).sub_items.length > 0;

                      // Calculate item total from all sub-items (client amount = sum of sub-item qty × rate)
                      let itemTotalCost = 0;
                      if (hasSubItems) {
                        itemTotalCost = (item as any).sub_items.reduce((sum: number, si: any) => {
                          return sum + ((si.quantity || 0) * (si.rate || 0));
                        }, 0);
                      } else {
                        itemTotalCost = (item as any).total_selling_price || (item as any).selling_price || (item as any).estimatedSellingPrice || item.amount || 0;
                      }

                      return (
                        <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-bold text-gray-900">{index + 1}. {(item as any).item_name || item.description}</h4>
                            <span className="font-semibold text-orange-600">{formatCurrency(itemTotalCost)}</span>
                          </div>

                          {hasSubItems ? (
                            /* Show Sub-Items with their materials and labour */
                            <div className="space-y-3 ml-4">
                              {(item as any).sub_items.map((subItem: any, sIdx: number) => {
                                const subMaterialTotal = (subItem.materials || []).reduce((sum: number, m: any) => sum + (m.total_price || m.amount || 0), 0);
                                const subLabourTotal = (subItem.labour || []).reduce((sum: number, l: any) => sum + (l.total_cost || l.amount || 0), 0);
                                const subItemClientCost = (subItem.quantity || 0) * (subItem.rate || 0);

                                return (
                                  <div key={sIdx} className="bg-green-50/50 rounded-lg p-3 border border-green-200">
                                    <div className="flex justify-between items-start mb-2">
                                      <h5 className="font-semibold text-green-900 text-sm">
                                        Sub Item {sIdx + 1}: {subItem.sub_item_name || subItem.scope}
                                      </h5>
                                      <div className="text-right">
                                        <div className="text-xs text-gray-600">Client Amount</div>
                                        <div className="font-bold text-green-700">{formatCurrency(subItemClientCost)}</div>
                                      </div>
                                    </div>
                                    {subItem.scope && (
                                      <p className="text-xs text-gray-600 mb-2"><strong>Scope:</strong> {subItem.scope}</p>
                                    )}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600 mb-3">
                                      {subItem.size && <div><span className="font-medium">Size:</span> {subItem.size}</div>}
                                      {subItem.location && <div><span className="font-medium">Location:</span> {subItem.location}</div>}
                                      {subItem.brand && <div><span className="font-medium">Brand:</span> {subItem.brand}</div>}
                                      <div><span className="font-medium">Qty:</span> {subItem.quantity} {subItem.unit}</div>
                                      {subItem.rate && <div><span className="font-medium">Rate:</span> {formatCurrency(subItem.rate)}/{subItem.unit}</div>}
                                    </div>

                                    {/* Sub-item Materials */}
                                    {subItem.materials && subItem.materials.length > 0 && (
                                      <div className="mb-2">
                                        <p className="text-xs font-semibold text-blue-700 mb-1">+ RAW MATERIALS</p>
                                        <div className="space-y-1">
                                          {subItem.materials.map((mat: any, mIdx: number) => (
                                            <div key={mIdx} className="flex justify-between text-xs">
                                              <span className="text-gray-600">{mat.material_name} ({mat.quantity} {mat.unit})</span>
                                              <span className="font-medium">{formatCurrency(mat.total_price || mat.amount || 0)}</span>
                                            </div>
                                          ))}
                                          <div className="flex justify-between text-xs font-semibold pt-1 border-t border-blue-200">
                                            <span>Total Materials:</span>
                                            <span>{formatCurrency(subMaterialTotal)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Sub-item Labour */}
                                    {subItem.labour && subItem.labour.length > 0 && (
                                      <div className="mb-2">
                                        <p className="text-xs font-semibold text-purple-700 mb-1">+ LABOUR</p>
                                        <div className="space-y-1">
                                          {subItem.labour.map((lab: any, lIdx: number) => (
                                            <div key={lIdx} className="flex justify-between text-xs">
                                              <span className="text-gray-600">{lab.labour_role} ({lab.hours} hrs)</span>
                                              <span className="font-medium">{formatCurrency(lab.total_cost || lab.amount || 0)}</span>
                                            </div>
                                          ))}
                                          <div className="flex justify-between text-xs font-semibold pt-1 border-t border-purple-200">
                                            <span>Total Labour:</span>
                                            <span>{formatCurrency(subLabourTotal)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            /* Fallback: Show item-level materials and labour if no sub-items */
                            <>
                              {item.materials && item.materials.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs font-semibold text-gray-700 mb-1">+ RAW MATERIALS</p>
                                  <div className="space-y-1">
                                    {item.materials.map((mat, mIdx) => (
                                      <div key={mIdx} className="flex justify-between text-xs">
                                        <span className="text-gray-600">{mat.name} ({mat.quantity} {mat.unit})</span>
                                        <span className="font-medium">{formatCurrency(mat.amount)}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between text-xs font-semibold pt-1 border-t">
                                      <span>Total Materials:</span>
                                      <span>{formatCurrency(item.materials.reduce((sum, m) => sum + m.amount, 0))}</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {item.labour && item.labour.length > 0 && (
                                <div className="mb-2">
                                  <p className="text-xs font-semibold text-gray-700 mb-1">+ LABOUR</p>
                                  <div className="space-y-1">
                                    {item.labour.map((lab, lIdx) => (
                                      <div key={lIdx} className="flex justify-between text-xs">
                                        <span className="text-gray-600">{lab.type} ({lab.quantity} {lab.unit})</span>
                                        <span className="font-medium">{formatCurrency(lab.amount)}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between text-xs font-semibold pt-1 border-t">
                                      <span>Total Labour:</span>
                                      <span>{formatCurrency(item.laborCost)}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Cost Summary - Internal (NEW FORMAT - Option C) */}
                  <div className="bg-white rounded-lg shadow-sm border border-orange-300 border-2 p-4 mb-4">
                    <h3 className="font-bold text-gray-900 mb-3">Overall Cost Summary</h3>
                    <div className="space-y-3">
                      {(() => {
                        const materialCost = selectedEstimation.materialCost || 0;
                        const labourCost = selectedEstimation.laborCost || 0;

                        // Calculate totals from all sub-items
                        let totalClientAmount = 0;
                        let totalPlannedProfit = 0;
                        let totalActualProfit = 0;
                        let totalMiscCost = 0;
                        let totalTransportCost = 0;

                        (selectedEstimation.boqItems || []).forEach((item: any) => {
                          if (item.sub_items && item.sub_items.length > 0) {
                            item.sub_items.forEach((si: any) => {
                              const clientAmt = (si.quantity || 0) * (si.rate || 0);
                              const matCost = (si.materials || []).reduce((sum: number, m: any) => sum + (m.total_price || m.quantity * m.unit_price || 0), 0);
                              const labCost = (si.labour || []).reduce((sum: number, l: any) => sum + (l.total_cost || l.hours * l.rate_per_hour || 0), 0);
                              const miscAmt = clientAmt * ((si.misc_percentage || 10) / 100);
                              const transportAmt = clientAmt * ((si.transport_percentage || 5) / 100);
                              const opAmt = clientAmt * ((si.overhead_profit_percentage || 25) / 100);

                              const internalCost = matCost + labCost + miscAmt + opAmt + transportAmt;

                              totalClientAmount += clientAmt;
                              totalPlannedProfit += opAmt;
                              totalMiscCost += miscAmt;
                              totalTransportCost += transportAmt;
                              // CORRECTED: Negotiable Margins = Client Amount - Internal Cost Total
                              totalActualProfit += (clientAmt - internalCost);
                            });
                          }
                        });

                        // BOQ-level discount (overall discount applied to entire BOQ)
                        const overallDiscountAmount = (selectedEstimation as any).discount_amount || 0;
                        const overallDiscountPct = selectedEstimation.discountPercentage || 0;

                        // Calculate discount amount from percentage if amount is not provided
                        let totalDiscount = overallDiscountAmount;
                        if (totalDiscount === 0 && overallDiscountPct > 0 && totalClientAmount > 0) {
                          totalDiscount = totalClientAmount * (overallDiscountPct / 100);
                        }

                        const totalInternalCost = materialCost + labourCost + totalMiscCost + totalPlannedProfit + totalTransportCost;
                        const projectMargin = totalClientAmount - totalInternalCost;
                        const marginPercentage = totalClientAmount > 0 ? ((projectMargin / totalClientAmount) * 100) : 0;
                        const profitVariance = totalActualProfit - totalPlannedProfit;
                        const profitVariancePercentage = totalPlannedProfit > 0 ? ((profitVariance / totalPlannedProfit) * 100) : 0;
                        const discountPercentage = totalClientAmount > 0 ? ((totalDiscount / totalClientAmount) * 100) : overallDiscountPct;
                        const grandTotalAfterDiscount = totalClientAmount - totalDiscount;

                        // Calculate profit after discount
                        const negotiableMarginAfterDiscount = grandTotalAfterDiscount - totalInternalCost;
                        const profitMarginPercentage = totalClientAmount > 0 ? (totalActualProfit / totalClientAmount) * 100 : 0;
                        const profitMarginAfterDiscount = grandTotalAfterDiscount > 0 ? (negotiableMarginAfterDiscount / grandTotalAfterDiscount) * 100 : 0;

                        return (
                          <>
                            {/* BOQ Financials */}
                            <div className="bg-blue-50 rounded-lg p-3 border border-blue-300">
                              <h4 className="font-bold text-blue-900 mb-2 text-sm">BOQ Financials</h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-700">Client Amount:</span>
                                  <span className="font-bold text-blue-700">{formatCurrency(totalClientAmount)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-700">Internal Cost:</span>
                                  <span className="font-semibold text-orange-600">{formatCurrency(totalInternalCost)}</span>
                                </div>
                                <div className="ml-4 space-y-1 text-xs text-gray-600">
                                  <div className="flex justify-between">
                                    <span>Materials:</span>
                                    <span>{formatCurrency(materialCost)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Labour:</span>
                                    <span>{formatCurrency(labourCost)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Miscellaneous:</span>
                                    <span>{formatCurrency(totalMiscCost)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Overhead & Profit:</span>
                                    <span>{formatCurrency(totalPlannedProfit)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Transport:</span>
                                    <span>{formatCurrency(totalTransportCost)}</span>
                                  </div>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-blue-300">
                                  <span className="font-bold">Project Margin:</span>
                                  <div className="text-right">
                                    <div className={`font-bold ${projectMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {formatCurrency(projectMargin)}
                                    </div>
                                    <div className="text-xs">({marginPercentage.toFixed(1)}%)</div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Profit Analysis */}
                            <div className="bg-green-50 rounded-lg p-3 border border-green-300">
                              <h4 className="font-bold text-green-900 mb-2 text-sm">Profit Analysis</h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-700">Planned Profit (O&P):</span>
                                  <span className="font-semibold text-blue-600">{formatCurrency(totalPlannedProfit)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-700">Negotiable Margins:</span>
                                  <span className={`font-bold ${totalActualProfit >= totalPlannedProfit ? 'text-green-600' : 'text-orange-600'}`}>
                                    {formatCurrency(totalActualProfit)}
                                  </span>
                                </div>
                                <div className="flex justify-between pt-2 border-t border-green-300">
                                  <span className="font-bold">Variance:</span>
                                  <div className="text-right">
                                    <div className={`font-bold text-sm ${profitVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {profitVariance >= 0 ? '+' : ''}{formatCurrency(profitVariance)}
                                    </div>
                                    <div className="text-xs">({profitVariance >= 0 ? '+' : ''}{profitVariancePercentage.toFixed(1)}%)</div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Grand Total */}
                            <div className="bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg p-3 border-2 border-green-300">
                              <div className="space-y-2">
                                <div className="flex justify-between text-sm font-medium">
                                  <span className="text-gray-800">Subtotal:</span>
                                  <span className="font-semibold">{formatCurrency(totalClientAmount)}</span>
                                </div>
                                {totalDiscount > 0 && (
                                  <div className="flex justify-between text-xs text-red-600">
                                    <span>Discount ({discountPercentage.toFixed(1)}%):</span>
                                    <span className="font-semibold">- {formatCurrency(totalDiscount)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-base font-bold pt-2 border-t border-green-400">
                                  <span className="text-green-900">
                                    Grand Total: <span className="text-xs font-normal text-gray-600">(Excluding VAT)</span>
                                  </span>
                                  <span className="text-green-700">{formatCurrency(grandTotalAfterDiscount)}</span>
                                </div>

                                {/* Show discount impact on profitability */}
                                {totalDiscount > 0 && (
                                  <div className="mt-3 pt-3 border-t border-green-300 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3">
                                    <h6 className="text-xs font-bold text-gray-800 mb-3 flex items-center gap-2">
                                      <TrendingUp className="w-3.5 h-3.5" />
                                      Discount Impact on Profitability
                                    </h6>
                                    <div className="space-y-2 text-xs">
                                      <div className="flex justify-between items-center">
                                        <span className="text-gray-600">Client Cost:</span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-gray-500 line-through">
                                            {formatCurrency(totalClientAmount)}
                                          </span>
                                          <span className="text-blue-700 font-bold">
                                            → {formatCurrency(grandTotalAfterDiscount)}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span className="text-gray-600">Internal Cost:</span>
                                        <span className="font-semibold text-red-600">
                                          {formatCurrency(totalInternalCost)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                                        <span className="text-gray-700 font-medium">Negotiable Margins:</span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-gray-500 line-through">
                                            {formatCurrency(totalActualProfit)}
                                          </span>
                                          <span className={`font-bold ${negotiableMarginAfterDiscount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                            → {formatCurrency(negotiableMarginAfterDiscount)}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="flex justify-between items-center bg-white/60 rounded px-2 py-1">
                                        <span className="text-gray-700 font-medium">Profit Margin:</span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-gray-500 text-xs">
                                            {profitMarginPercentage.toFixed(1)}%
                                          </span>
                                          <span className={`font-bold ${profitMarginAfterDiscount >= 15 ? 'text-emerald-700' : profitMarginAfterDiscount >= 10 ? 'text-orange-600' : 'text-red-600'}`}>
                                            → {profitMarginAfterDiscount.toFixed(1)}%
                                          </span>
                                        </div>
                                      </div>
                                      {profitMarginAfterDiscount < 15 && (
                                        <div className="mt-2 p-2 bg-orange-100 border border-orange-300 rounded text-orange-800 flex items-start gap-2">
                                          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                          <span className="text-xs">
                                            <strong>Warning:</strong> Profit margin is below recommended 15%. This discount significantly reduces profitability.
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Preliminaries & Approval Works - Internal Version */}
                  {(selectedEstimation as any).preliminaries && (
                    (selectedEstimation as any).preliminaries.items?.length > 0 ||
                    (selectedEstimation as any).preliminaries.cost_details ||
                    (selectedEstimation as any).preliminaries.notes
                  ) && (
                    <div className="bg-white rounded-lg shadow-sm border border-orange-200 p-4 mb-4">
                      <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-purple-600" />
                        Preliminaries & Approval Works
                      </h3>

                      {/* Selected Items */}
                      {(selectedEstimation as any).preliminaries.items?.filter((item: any) => item.checked).length > 0 && (
                        <div className="mb-3">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Selected conditions and terms</h4>
                          <div className="space-y-2">
                            {(selectedEstimation as any).preliminaries.items.filter((item: any) => item.checked).map((item: any, index: number) => (
                              <div key={index} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-purple-200">
                                <div className="mt-0.5 w-4 h-4 rounded border-2 border-purple-500 bg-purple-500 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                                <div className="flex-1 text-sm text-gray-700">
                                  {item.description}
                                  {item.isCustom && (
                                    <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded font-medium">Custom</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Cost Details */}
                      {(selectedEstimation as any).preliminaries.cost_details && (
                        (selectedEstimation as any).preliminaries.cost_details.quantity ||
                        (selectedEstimation as any).preliminaries.cost_details.rate ||
                        (selectedEstimation as any).preliminaries.cost_details.amount
                      ) && (
                        <div className="mb-3 bg-orange-50 rounded-lg border border-orange-200 p-3">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Cost Details</h4>
                          <div className="grid grid-cols-4 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Quantity</p>
                              <p className="font-medium text-gray-900">
                                {(selectedEstimation as any).preliminaries.cost_details.quantity || 0}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Unit</p>
                              <p className="font-medium text-gray-900">
                                {(selectedEstimation as any).preliminaries.cost_details.unit || 'nos'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Rate</p>
                              <p className="font-medium text-gray-900">
                                {formatCurrency((selectedEstimation as any).preliminaries.cost_details.rate || 0)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Amount</p>
                              <p className="font-semibold text-orange-700">
                                {formatCurrency((selectedEstimation as any).preliminaries.cost_details.amount || 0)}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Additional Notes */}
                      {(selectedEstimation as any).preliminaries.notes && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Additional Notes</h4>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {(selectedEstimation as any).preliminaries.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Client Version (Right) */}
                <div className="p-6 bg-blue-50/30">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="px-3 py-1 bg-blue-100 border border-blue-300 rounded-lg">
                      <span className="text-sm font-bold text-blue-800">CLIENT VERSION</span>
                    </div>
                    <span className="text-xs text-gray-600">(What Client sees)</span>
                  </div>

                  {/* BOQ Items - Client (SIMPLIFIED - Match PDF Client Format) */}
                  <div className="space-y-3 mb-4">
                    {(selectedEstimation.boqItems || []).map((item, index) => {
                      const hasSubItems = (item as any).sub_items && (item as any).sub_items.length > 0;

                      // Calculate item total from all sub-items (client amount = sum of sub-item qty × rate)
                      let itemTotal = 0;
                      if (hasSubItems) {
                        itemTotal = (item as any).sub_items.reduce((sum: number, si: any) => {
                          return sum + ((si.quantity || 0) * (si.rate || 0));
                        }, 0);
                      }

                      return (
                        <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-bold text-gray-900">{index + 1}. {(item as any).item_name || item.description}</h4>
                            <span className="font-semibold text-blue-600">{formatCurrency(itemTotal)}</span>
                          </div>

                          {hasSubItems ? (
                            /* Show Sub-Items - CLIENT VERSION (Scope, Size, Location, Brand, Qty, Rate, Total ONLY - No materials/labour) */
                            <div className="space-y-2 ml-4">
                              {(item as any).sub_items.map((subItem: any, sIdx: number) => {
                                const subItemAmount = (subItem.quantity || 0) * (subItem.rate || 0);

                                return (
                                  <div key={sIdx} className="bg-blue-50/30 rounded-lg p-3 border border-blue-200">
                                    <h5 className="font-medium text-gray-900 text-sm mb-2">
                                      Sub Item {sIdx + 1}: {subItem.sub_item_name || subItem.scope}
                                    </h5>
                                    {subItem.scope && (
                                      <p className="text-xs text-gray-600 mb-2"><strong>Scope:</strong> {subItem.scope}</p>
                                    )}
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs text-gray-600">
                                      {subItem.size && <div><span className="font-medium">Size:</span> {subItem.size}</div>}
                                      {subItem.location && <div><span className="font-medium">Location:</span> {subItem.location}</div>}
                                      {subItem.brand && <div><span className="font-medium">Brand:</span> {subItem.brand}</div>}
                                      <div><span className="font-medium">Qty:</span> {subItem.quantity} {subItem.unit}</div>
                                      <div><span className="font-medium">Rate:</span> {formatCurrency(subItem.rate || 0)}</div>
                                    </div>
                                    <div className="mt-2 text-right">
                                      <span className="text-sm font-semibold text-blue-700">Total: {formatCurrency(subItemAmount)}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            /* No sub-items: Just show brief item info */
                            <div className="text-xs text-gray-600">
                              {item.briefDescription && <p>{item.briefDescription}</p>}
                              <p className="mt-1">Qty: {item.quantity} {item.unit}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Cost Summary - Client (SIMPLIFIED - Match PDF Client Version) */}
                  <div className="bg-white rounded-lg shadow-sm border border-blue-300 border-2 p-4 mb-4">
                    <h3 className="font-bold text-gray-900 mb-3">Cost Summary</h3>
                    <div className="space-y-3">
                      {(() => {
                        // Client version - Calculate subtotal from sub-items (quantity × rate)
                        let subtotal = 0;

                        (selectedEstimation.boqItems || []).forEach((item: any) => {
                          // Calculate subtotal from sub-items (client amount)
                          if (item.sub_items && item.sub_items.length > 0) {
                            item.sub_items.forEach((si: any) => {
                              subtotal += (si.quantity || 0) * (si.rate || 0);
                            });
                          }
                        });

                        // BOQ-level discount (overall discount applied to entire BOQ)
                        const overallDiscountAmount = (selectedEstimation as any).discount_amount || 0;
                        const overallDiscountPct = selectedEstimation.discountPercentage || 0;

                        // Calculate discount amount from percentage if amount is not provided
                        let overallDiscount = overallDiscountAmount;
                        if (overallDiscount === 0 && overallDiscountPct > 0 && subtotal > 0) {
                          overallDiscount = subtotal * (overallDiscountPct / 100);
                        }

                        const grandTotal = subtotal - overallDiscount;
                        const discountPercentage = subtotal > 0 ? ((overallDiscount / subtotal) * 100) : overallDiscountPct;

                        return (
                          <>
                            <div className="flex justify-between text-base font-medium">
                              <span className="text-gray-800">Subtotal:</span>
                              <span className="font-semibold">{formatCurrency(subtotal)}</span>
                            </div>
                            {overallDiscount > 0 && (
                              <div className="flex justify-between text-sm text-red-600">
                                <span>Discount ({discountPercentage.toFixed(1)}%):</span>
                                <span className="font-semibold">- {formatCurrency(overallDiscount)}</span>
                              </div>
                            )}
                            <div className="flex justify-between pt-3 border-t-2 border-blue-300 text-lg font-bold">
                              <span className="text-blue-900">
                                Grand Total: <span className="text-xs font-normal text-gray-600">(Excluding VAT)</span>
                              </span>
                              <span className="text-green-600">{formatCurrency(grandTotal)}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Preliminaries & Approval Works - Client Version */}
                  {(selectedEstimation as any).preliminaries && (
                    (selectedEstimation as any).preliminaries.items?.length > 0 ||
                    (selectedEstimation as any).preliminaries.cost_details ||
                    (selectedEstimation as any).preliminaries.notes
                  ) && (
                    <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-4 mb-4">
                      <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-purple-600" />
                        Preliminaries & Approval Works
                      </h3>

                      {/* Selected Items */}
                      {(selectedEstimation as any).preliminaries.items?.filter((item: any) => item.checked).length > 0 && (
                        <div className="mb-3">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Selected conditions and terms</h4>
                          <div className="space-y-2">
                            {(selectedEstimation as any).preliminaries.items.filter((item: any) => item.checked).map((item: any, index: number) => (
                              <div key={index} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-purple-200">
                                <div className="mt-0.5 w-4 h-4 rounded border-2 border-purple-500 bg-purple-500 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                                <div className="flex-1 text-sm text-gray-700">
                                  {item.description}
                                  {item.isCustom && (
                                    <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded font-medium">Custom</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Cost Details */}
                      {(selectedEstimation as any).preliminaries.cost_details && (
                        (selectedEstimation as any).preliminaries.cost_details.quantity ||
                        (selectedEstimation as any).preliminaries.cost_details.rate ||
                        (selectedEstimation as any).preliminaries.cost_details.amount
                      ) && (
                        <div className="mb-3 bg-blue-50 rounded-lg border border-blue-200 p-3">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Cost Details</h4>
                          <div className="grid grid-cols-4 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Quantity</p>
                              <p className="font-medium text-gray-900">
                                {(selectedEstimation as any).preliminaries.cost_details.quantity || 0}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Unit</p>
                              <p className="font-medium text-gray-900">
                                {(selectedEstimation as any).preliminaries.cost_details.unit || 'nos'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Rate</p>
                              <p className="font-medium text-gray-900">
                                {formatCurrency((selectedEstimation as any).preliminaries.cost_details.rate || 0)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Amount</p>
                              <p className="font-semibold text-blue-700">
                                {formatCurrency((selectedEstimation as any).preliminaries.cost_details.amount || 0)}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Additional Notes */}
                      {(selectedEstimation as any).preliminaries.notes && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Additional Notes</h4>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {(selectedEstimation as any).preliminaries.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-r from-gray-50 to-white border-t border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    <strong>Key Difference:</strong> Internal version shows sub-items with complete material & labour breakdown. Client version shows sub-items with final prices (misc/overhead/profit included), discount, and VAT only.
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setShowComparisonModal(false);
                        setApprovalNotes('');
                      }}
                      disabled={isApproving}
                      className={`px-6 py-2.5 ${isApproving ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-500 hover:bg-gray-600'} text-white rounded-lg font-medium transition-colors`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleFinalApproval}
                      disabled={isApproving}
                      className={`px-6 py-2.5 ${isApproving ? 'bg-green-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white rounded-lg font-medium transition-colors flex items-center gap-2`}
                    >
                      {isApproving ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Approving...
                        </>
                      ) : (
                        <>
                          <CheckCircleIcon className="w-5 h-5" />
                          Approve
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* PM Details Modal - Show assigned PM details for a project */}
        {showPMDetailsModal && selectedProjectPM && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
            >
              {/* Header */}
              <div className="bg-[#243d8a] px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserIcon className="w-8 h-8 text-white p-1.5 bg-white bg-opacity-20 rounded-lg" />
                    <div>
                      <h2 className="text-xl font-bold text-white">Assigned Project Manager</h2>
                      <p className="text-blue-100 text-sm">PM Details and Workload</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowPMDetailsModal(false);
                      setSelectedProjectPM(null);
                    }}
                    className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                {(() => {
                  const projectCount = selectedProjectPM.projectCount || 0;
                  const isAvailable = projectCount === 0;
                  const isBusy = projectCount >= 1 && projectCount <= 3;
                  const isOverloaded = projectCount > 3;

                  let statusColor = '';
                  let statusText = '';
                  let statusBg = '';
                  let borderColor = '';

                  if (isAvailable) {
                    statusColor = 'text-green-700';
                    statusText = 'Available';
                    statusBg = 'bg-green-50';
                    borderColor = 'border-green-200';
                  } else if (isBusy) {
                    statusColor = 'text-yellow-700';
                    statusText = 'Busy';
                    statusBg = 'bg-yellow-50';
                    borderColor = 'border-yellow-200';
                  } else {
                    statusColor = 'text-red-700';
                    statusText = 'Overloaded';
                    statusBg = 'bg-red-50';
                    borderColor = 'border-red-200';
                  }

                  return (
                    <>
                      {/* PM Info Card */}
                      <div className={`border-2 rounded-xl p-5 mb-4 ${borderColor} ${statusBg}`}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <h3 className="text-2xl font-bold text-gray-900">
                                {selectedProjectPM.pm_name || selectedProjectPM.full_name}
                              </h3>
                              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColor} ${statusBg} border-2 ${borderColor}`}>
                                {statusText}
                              </span>
                            </div>

                            <div className="space-y-2 mb-4">
                              <div className="flex items-center gap-2 text-gray-700">
                                <span className="text-sm font-medium text-gray-500">Email:</span>
                                <span className="text-sm">{selectedProjectPM.email}</span>
                              </div>
                              <div className="flex items-center gap-2 text-gray-700">
                                <span className="text-sm font-medium text-gray-500">Phone:</span>
                                <span className="text-sm">{selectedProjectPM.phone}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mb-3">
                              <BuildingOfficeIcon className="w-5 h-5 text-gray-500" />
                              <span className="font-bold text-xl text-[#243d8a]">{projectCount}</span>
                              <span className="text-gray-600 text-sm">
                                {projectCount === 1 ? 'project' : 'projects'} assigned
                              </span>
                            </div>

                            {/* Progress Bar */}
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-gray-500">Workload Capacity</span>
                                <span className={`font-semibold ${statusColor}`}>
                                  {projectCount === 0 ? '0%' : projectCount <= 3 ? `${Math.min(projectCount * 25, 75)}%` : '100%'}
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-3">
                                <div
                                  className={`h-3 rounded-full transition-all ${
                                    isAvailable ? 'bg-green-500' : isBusy ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: projectCount === 0 ? '0%' : `${Math.min(projectCount * 20, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Assigned Projects List */}
                      {selectedProjectPM.projects && selectedProjectPM.projects.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <DocumentTextIcon className="w-5 h-5 text-gray-500" />
                            All Assigned Projects ({selectedProjectPM.projects.length})
                          </h4>
                          <div className="max-h-64 overflow-y-auto space-y-2">
                            {selectedProjectPM.projects.map((project: any, idx: number) => (
                              <div
                                key={idx}
                                className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:border-[#243d8a] hover:bg-blue-50 transition-colors"
                              >
                                <div className="flex items-start gap-3">
                                  <BuildingOfficeIcon className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {project.project_name}
                                    </p>
                                    <p className="text-xs text-gray-500">Project ID: {project.project_id}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {projectCount === 0 && (
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm text-green-700 flex items-center gap-2">
                            <CheckCircleIcon className="w-5 h-5" />
                            This PM is currently available and has no assigned projects
                          </p>
                        </div>
                      )}

                      {/* Close Button */}
                      <div className="mt-6 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => {
                            setShowPMDetailsModal(false);
                            setSelectedProjectPM(null);
                          }}
                          className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
                        >
                          Close
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}

        {/* History Modal - BOQ History Timeline */}
        {showHistoryModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Compact Header with soft red gradient */}
              <div className="bg-gradient-to-r from-red-50 to-orange-50 px-6 py-3 border-b border-red-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <ClockIcon className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">BOQ History</h2>
                      <p className="text-gray-600 text-xs">{selectedEstimation.projectName}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    className="text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg p-1.5 transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="px-6 pt-4 bg-white border-b border-gray-200">
                <div className="flex gap-2">
                  <button
                    onClick={() => setHistoryTab('full')}
                    className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-all ${
                      historyTab === 'full'
                        ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-900 border-t border-l border-r border-blue-200'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    Full History
                  </button>
                  <button
                    onClick={() => setHistoryTab('revisions')}
                    className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-all ${
                      historyTab === 'revisions'
                        ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-900 border-t border-l border-r border-red-200'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    Revision History
                  </button>
                </div>
              </div>

              {/* Content with light background */}
              <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                {historyTab === 'full' ? (
                  <BOQHistoryTimeline boqId={selectedEstimation.id} />
                ) : (
                  <BOQRevisionHistory boqId={selectedEstimation.id} refreshTrigger={boqDetailsRefreshTrigger} />
                )}
              </div>
            </motion.div>
          </div>
        )}

        {/* Day Extension Approval Modal */}
        {selectedDayExtension && Array.isArray(selectedDayExtension) && (
          <DayExtensionApprovalModal
            isOpen={showDayExtensionModal}
            onClose={() => {
              setShowDayExtensionModal(false);
              setSelectedDayExtension(null);
            }}
            onSuccess={(actionType) => {
              // Reload BOQ list to get updated flags
              loadBOQs();
              // Close modal and clear selection
              setShowDayExtensionModal(false);
              setSelectedDayExtension(null);
            }}
            extensionRequests={selectedDayExtension}
          />
        )}
      </div>
    </div>
  );
};

export default ProjectApprovals;