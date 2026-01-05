import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CheckCircle, XCircle, Edit, Send, Clock, User, TrendingUp, TrendingDown, Mail, Calculator } from 'lucide-react';
import { estimatorService } from '../services/estimatorService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import BOQCreationForm from '@/components/forms/BOQCreationForm';
import { useRealtimeUpdateStore } from '@/store/realtimeUpdateStore';
import { API_BASE_URL } from '@/api/config';

interface InternalRevision {
  id: number;
  internal_revision_number: number;
  action_type: string;
  actor_role: string;
  actor_name: string;
  status_before: string;
  status_after: string;
  rejection_reason?: string;
  approval_comments?: string;
  changes_summary?: any;
  created_at: string;
}

interface BOQWithInternalRevisions {
  boq_id: number;
  boq_name: string;
  title: string;
  status: string;
  internal_revision_number: number;
  revision_number: number;
  total_cost: number;
  project: {
    name: string;
    client: string;
    location: string;
  };
  // 🔥 Added from backend - current BOQ data
  items?: any[];
  terms_conditions?: {
    items: Array<{
      id: string;
      term_id: number;
      terms_text: string;
      checked: boolean;
    }>;
  };
}

interface InternalRevisionTimelineProps {
  userRole?: string; // 'estimator', 'technical_director', 'admin'
  onApprove?: (boq: BOQWithInternalRevisions) => void;
  onReject?: (boq: BOQWithInternalRevisions) => void;
  refreshTrigger?: number; // Prop to trigger refresh from parent
  onApprovalComplete?: () => void; // Callback after approval/rejection completes
}

const InternalRevisionTimeline: React.FC<InternalRevisionTimelineProps> = ({
  userRole = 'estimator',
  onApprove,
  onReject,
  refreshTrigger
}) => {
  const API_URL = API_BASE_URL;

  const [boqs, setBOQs] = useState<BOQWithInternalRevisions[]>([]);
  const [selectedBoq, setSelectedBoq] = useState<BOQWithInternalRevisions | null>(null);
  const [internalRevisions, setInternalRevisions] = useState<InternalRevision[]>([]);
  const [isLoadingBOQs, setIsLoadingBOQs] = useState(false);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRevisionIndex, setSelectedRevisionIndex] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [expandedRevisionIndices, setExpandedRevisionIndices] = useState<Set<number>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [originalBOQ, setOriginalBOQ] = useState<any>(null);
  const [isLoadingOriginalBOQ, setIsLoadingOriginalBOQ] = useState(false);

  // Edit and Send to TD states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBOQ, setEditingBOQ] = useState<BOQWithInternalRevisions | null>(null);
  const [isSendingToTD, setIsSendingToTD] = useState(false);
  const [showSendPopupAfterEdit, setShowSendPopupAfterEdit] = useState(false);
  const [editedBOQId, setEditedBOQId] = useState<number | null>(null);

  // TD Approval/Rejection states
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Use ref to track ongoing API calls and prevent duplicates
  const loadingRevisionsRef = useRef<number | null>(null);
  const isInitialMount = useRef(true);

  // ✅ LISTEN TO REAL-TIME UPDATES - Internal revisions update automatically via Supabase
  const boqUpdateTimestamp = useRealtimeUpdateStore(state => state.boqUpdateTimestamp);

  useEffect(() => {
    loadBOQsWithInternalRevisions();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  useEffect(() => {
    // Skip if this is triggered by initial BOQ selection from loadBOQsWithInternalRevisions
    if (selectedBoq && !isInitialMount.current) {
      loadInternalRevisions(selectedBoq.boq_id);
    }
    if (isInitialMount.current && selectedBoq) {
      // On initial mount, load revisions for the first BOQ
      loadInternalRevisions(selectedBoq.boq_id);
      isInitialMount.current = false;
    }
  }, [selectedBoq]);

  // Reload data when refreshTrigger changes (after TD approval/rejection)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      loadBOQsWithInternalRevisions();
      // Don't call loadInternalRevisions here - it will be triggered by selectedBoq change
    }
  }, [refreshTrigger]);

  // ✅ RELOAD internal revisions when real-time update is received from Supabase
  // Supabase listens to PostgreSQL changes and triggers this automatically (no polling needed!)
  useEffect(() => {
    if (boqUpdateTimestamp === 0) return;

    // Reload BOQ list when Supabase detects database changes
    loadBOQsWithInternalRevisions();

    // Reload internal revisions for selected BOQ
    if (selectedBoq) {
      loadInternalRevisions(selectedBoq.boq_id);
    }
  }, [boqUpdateTimestamp]);

  const loadBOQsWithInternalRevisions = async () => {
    setIsLoadingBOQs(true);
    try {
      const response = await fetch(`${API_URL}/boqs/internal_revisions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      const data = await response.json();

      if (data.success) {
        // Sort by most recent first (created_at or updated_at descending)
        const sortedBOQs = [...data.data].sort((a, b) => {
          const dateA = new Date(a.created_at || a.updated_at || 0).getTime();
          const dateB = new Date(b.created_at || b.updated_at || 0).getTime();
          return dateB - dateA; // Most recent first
        });
        setBOQs(sortedBOQs);
        if (sortedBOQs.length > 0 && !selectedBoq) {
          setSelectedBoq(sortedBOQs[0]);
        }
      }
    } catch (error) {
      console.error('Error loading BOQs:', error);
      showError('Failed to load BOQs with internal revisions');
    } finally {
      setIsLoadingBOQs(false);
    }
  };

  const loadInternalRevisions = async (boqId: number) => {
    // Prevent duplicate calls for the same BOQ
    if (loadingRevisionsRef.current === boqId) {
      return;
    }

    loadingRevisionsRef.current = boqId;
    setIsLoadingRevisions(true);
    try {
      const response = await fetch(`${API_URL}/boq/${boqId}/internal_revisions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      const data = await response.json();

      if (data.success) {
        // Filter out ORIGINAL_BOQ type revisions from the regular list
        const regularRevisions = data.data.internal_revisions.filter(
          (rev: InternalRevision) => rev.action_type !== 'ORIGINAL_BOQ'
        );

        // Sort in descending order (latest first)
        const sorted = regularRevisions.sort((a: InternalRevision, b: InternalRevision) =>
          b.internal_revision_number - a.internal_revision_number
        );
        setInternalRevisions(sorted);

        // Check if there's an original_boq in the response
        if (data.data.original_boq) {
          setOriginalBOQ(data.data.original_boq);
        }

        // Auto-select the latest revision for comparison
        if (sorted.length > 0) {
          setSelectedRevisionIndex(0);
        }
      }
    } catch (error) {
      console.error('Error loading internal revisions:', error);
      showError('Failed to load internal revision history');
    } finally {
      setIsLoadingRevisions(false);
      loadingRevisionsRef.current = null; // Reset ref after loading completes
    }
  };

  const handleEditBOQ = async (boq: BOQWithInternalRevisions) => {
    try {
      // Fetch the latest BOQ data with full details
      const response = await fetch(`${API_URL}/boq/${boq.boq_id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // The /boq/{boq_id} endpoint returns BOQ data directly (not wrapped in success/data)
      // Check if response has error field (error response) or boq_id (success response)
      if (data.error) {
        console.error('API returned error:', data.error);
        showError(data.error || 'Failed to load BOQ details');
      } else if (data.boq_id) {
        // The data IS the BOQ data itself, no need to unwrap
        setEditingBOQ(data);
        setShowEditModal(true);
      } else {
        console.error('Unexpected response format:', data);
        showError('Unexpected response format');
      }
    } catch (error) {
      console.error('Error loading BOQ for editing:', error);
      showError('Failed to load BOQ details: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleSendToTD = async (boq: BOQWithInternalRevisions) => {
    setIsSendingToTD(true);
    try {
      const result = await estimatorService.sendBOQEmail(boq.boq_id, {
        comments: 'Sending revised BOQ for review'
      });

      if (result.success) {
        showSuccess('BOQ sent to Technical Director successfully');

        // Reload internal revisions first with the current boq_id
        await loadInternalRevisions(boq.boq_id);

        // Reload BOQs list
        await loadBOQsWithInternalRevisions();

        // Fetch fresh BOQ data to update selectedBoq with new status
        const response = await fetch(`${API_URL}/boqs/internal_revisions`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          }
        });
        const data = await response.json();

        if (data.success) {
          // Find and update the selected BOQ with fresh data
          const updatedBoq = data.data.find((b: BOQWithInternalRevisions) => b.boq_id === boq.boq_id);
          if (updatedBoq) {
            setSelectedBoq(updatedBoq);
          }
        }
      } else {
        showError(result.message || 'Failed to send BOQ to TD');
      }
    } catch (error) {
      console.error('Error sending BOQ to TD:', error);
      showError('Failed to send BOQ to TD');
    } finally {
      setIsSendingToTD(false);
    }
  };

  const handleApproveBOQ = async () => {
    if (!selectedBoq || isProcessing) return;

    setIsProcessing(true);
    try {
      const response = await fetch(`${API_URL}/td_approval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
          boq_id: selectedBoq.boq_id,
          technical_director_status: 'approved',
          rejection_reason: '',
          comments: approvalNotes || 'BOQ approved from internal revision review'
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccess('BOQ approved successfully');
        setShowApprovalModal(false);
        setApprovalNotes('');

        // Reload data and update selectedBoq with fresh status
        await loadBOQsWithInternalRevisions();
        if (selectedBoq) {
          await loadInternalRevisions(selectedBoq.boq_id);

          // Fetch fresh BOQ data to update selectedBoq with new status
          const response = await fetch(`${API_URL}/boqs/internal_revisions`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
          });
          const freshData = await response.json();

          if (freshData.success) {
            const updatedBoq = freshData.data.find((b: BOQWithInternalRevisions) => b.boq_id === selectedBoq.boq_id);
            if (updatedBoq) {
              setSelectedBoq(updatedBoq);
            }
          }
        }
      } else {
        showError(data.message || 'Failed to approve BOQ');
      }
    } catch (error) {
      console.error('Approval error:', error);
      showError('Failed to approve BOQ');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectBOQ = async () => {
    if (!selectedBoq || isProcessing) return;

    if (!rejectionReason || !rejectionReason.trim()) {
      showError('Please provide a rejection reason');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch(`${API_URL}/td_approval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
          boq_id: selectedBoq.boq_id,
          technical_director_status: 'rejected',
          rejection_reason: rejectionReason,
          comments: rejectionReason
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccess('BOQ rejected successfully');
        setShowRejectionModal(false);
        setRejectionReason('');

        // Reload data and update selectedBoq with fresh status
        await loadBOQsWithInternalRevisions();
        if (selectedBoq) {
          await loadInternalRevisions(selectedBoq.boq_id);

          // Fetch fresh BOQ data to update selectedBoq with new status
          const response = await fetch(`${API_URL}/boqs/internal_revisions`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
          });
          const freshData = await response.json();

          if (freshData.success) {
            const updatedBoq = freshData.data.find((b: BOQWithInternalRevisions) => b.boq_id === selectedBoq.boq_id);
            if (updatedBoq) {
              setSelectedBoq(updatedBoq);
            }
          }
        }
      } else {
        showError(data.message || 'Failed to reject BOQ');
      }
    } catch (error) {
      console.error('Rejection error:', error);
      showError('Failed to reject BOQ');
    } finally {
      setIsProcessing(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'TD_APPROVED':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'TD_REJECTED':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'PM_EDITED':
        return <Edit className="h-5 w-5 text-blue-600" />;
      case 'SENT_TO_TD':
      case 'SENT_TO_PM':
        return <Send className="h-5 w-5 text-purple-600" />;
      case 'ESTIMATOR_RESUBMIT':
      case 'INTERNAL_REVISION_EDIT':
        return <Edit className="h-5 w-5 text-orange-600" />;
      case 'CREATED':
        return <User className="h-5 w-5 text-gray-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      'CREATED': 'BOQ Created',
      'PM_EDITED': 'PM Edited',
      'SENT_TO_PM': 'Sent to PM',
      'SENT_TO_TD': 'Sent to TD',
      'TD_REJECTED': 'TD Rejected',
      'TD_APPROVED': 'TD Approved',
      'ESTIMATOR_RESUBMIT': 'Estimator Resubmitted',
      'INTERNAL_REVISION_EDIT': 'Internal Revision'
    };
    return labels[actionType] || actionType;
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'TD_APPROVED':
        return 'bg-green-50 border-green-200';
      case 'TD_REJECTED':
        return 'bg-red-50 border-red-200';
      case 'PM_EDITED':
        return 'bg-blue-50 border-blue-200';
      case 'SENT_TO_TD':
      case 'SENT_TO_PM':
        return 'bg-purple-50 border-purple-200';
      case 'ESTIMATOR_RESUBMIT':
      case 'INTERNAL_REVISION_EDIT':
        return 'bg-orange-50 border-orange-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const formatCurrency = (amount: number) => {
    return `AED ${amount?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`;
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase().replace(/_/g, '');
    if (statusLower === 'internalrevisionpending') {
      return { label: 'Internal Revision Pending', color: 'bg-orange-100 text-orange-700' };
    } else if (statusLower === 'rejected') {
      return { label: 'Rejected', color: 'bg-red-100 text-red-700' };
    }
    return { label: status, color: 'bg-gray-100 text-gray-700' };
  };

  const filteredBOQs = boqs.filter(boq => {
    const searchLower = searchTerm.toLowerCase().trim();
    // ✅ Search by ID (B-123, 123), BOQ name, project name, or client
    const boqIdString = `b-${boq.boq_id || boq.id}`;
    return !searchTerm ||
      boq.boq_name?.toLowerCase().includes(searchLower) ||
      boq.project?.name?.toLowerCase().includes(searchLower) ||
      boq.project?.client?.toLowerCase().includes(searchLower) ||
      boqIdString.includes(searchLower) ||
      (boq.boq_id || boq.id)?.toString().includes(searchTerm.trim());
  });

  // Toggle expansion for a revision
  const toggleRevisionExpansion = (index: number) => {
    const newExpanded = new Set(expandedRevisionIndices);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRevisionIndices(newExpanded);
  };

  // Calculate total from items using API response values
  const calculateTotalFromSnapshot = (snapshot: any) => {
    // 🔥 First, check if total_cost is available in the snapshot (this includes discount AND preliminaries from backend)
    if (snapshot?.total_cost !== undefined && snapshot.total_cost !== null && snapshot.total_cost > 0) {
      // Backend already calculated: (items + preliminaries - discount)
      // So just return it as-is, DON'T add preliminaries again!
      return snapshot.total_cost;
    }

    // Fallback: Calculate from items if total_cost not available
    if (!snapshot?.items || snapshot.items.length === 0) {
      return 0;
    }

    const subtotal = snapshot.items.reduce((total: number, item: any) => {
      const finalTotalPrice = item.selling_price || item.total_selling_price || 0;
      return total + finalTotalPrice;
    }, 0);

    // Add preliminaries amount to subtotal
    const preliminaryAmount = snapshot.preliminaries?.cost_details?.amount || 0;
    const combinedSubtotal = subtotal + preliminaryAmount;

    // 🔥 Apply discount if available (discount applies to combined subtotal)
    const discountAmount = snapshot.discount_amount || 0;
    const discountPercentage = snapshot.discount_percentage || 0;

    let finalDiscount = discountAmount;
    if (discountPercentage > 0 && discountAmount === 0) {
      finalDiscount = (combinedSubtotal * discountPercentage) / 100;
    }

    return combinedSubtotal - finalDiscount;
  };

  const calculateChange = (current: number, previous: number) => {
    if (!previous || previous === 0) return { value: 0, percentage: 0 };
    const change = current - previous;
    const percentage = ((change / previous) * 100).toFixed(2);
    return { value: change, percentage: parseFloat(percentage) };
  };

  // Helper to check if value changed
  const hasChanged = (currentValue: any, previousValue: any): boolean => {
    if (currentValue === undefined || previousValue === undefined) return false;
    if (typeof currentValue === 'number' && typeof previousValue === 'number') {
      return Math.abs(currentValue - previousValue) > 0.01;
    }
    return currentValue !== previousValue;
  };

  // Calculate Grand Total from snapshot items (for display purposes)
  const calculateGrandTotal = (snapshot: any): number => {
    // 🔥 First, check if total_cost is available in the snapshot (this includes discount)
    if (snapshot?.total_cost !== undefined && snapshot.total_cost !== null) {
      return snapshot.total_cost;
    }

    // Fallback: Calculate from items
    if (!snapshot?.items || snapshot.items.length === 0) return 0;

    const allItems = snapshot.items || [];

    // Calculate subtotal (sum of all item client amounts)
    const subtotal = allItems.reduce((sum: number, item: any) => {
      // Calculate client amount for each item
      let itemClientAmount = (item.quantity || 0) * (item.rate || 0);
      if (itemClientAmount === 0 && item.sub_items && item.sub_items.length > 0) {
        // If rate is 0, calculate from sub-items
        itemClientAmount = item.sub_items.reduce((siSum: number, si: any) =>
          siSum + ((si.quantity || 0) * (si.rate || 0)), 0
        );
      }
      return sum + itemClientAmount;
    }, 0);

    // Add preliminaries amount to the subtotal
    const preliminariesAmount = snapshot.preliminaries?.cost_details?.amount || 0;
    const combinedSubtotal = subtotal + preliminariesAmount;

    // Get overall BOQ discount (apply to combined subtotal)
    let overallDiscount = 0;

    if (snapshot.discount_percentage && snapshot.discount_percentage > 0) {
      overallDiscount = (combinedSubtotal * snapshot.discount_percentage) / 100;
    } else if (snapshot.discount_amount && snapshot.discount_amount > 0) {
      overallDiscount = snapshot.discount_amount;
    }

    const grandTotal = combinedSubtotal - overallDiscount;
    return grandTotal;
  };

  // Render Grand Total with Discount Impact
  const renderGrandTotalSection = (snapshot: any) => {
    if (!snapshot?.items || snapshot.items.length === 0) return null;

    const allItems = snapshot.items || [];

    // Calculate subtotal (sum of all item client amounts)
    const itemsSubtotal = allItems.reduce((sum: number, item: any) => {
      // Calculate client amount for each item
      let itemClientAmount = (item.quantity || 0) * (item.rate || 0);
      if (itemClientAmount === 0 && item.sub_items && item.sub_items.length > 0) {
        // If rate is 0, calculate from sub-items
        itemClientAmount = item.sub_items.reduce((siSum: number, si: any) =>
          siSum + ((si.quantity || 0) * (si.rate || 0)), 0
        );
      }
      return sum + itemClientAmount;
    }, 0);

    // Add preliminaries amount to subtotal
    const preliminaryAmount = snapshot.preliminaries?.cost_details?.amount || 0;
    const subtotal = itemsSubtotal + preliminaryAmount;

    // Get overall BOQ discount (applied to combined subtotal including preliminaries)
    let overallDiscount = 0;
    let overallDiscountPercentage = 0;

    if (snapshot.discount_percentage && snapshot.discount_percentage > 0) {
      overallDiscountPercentage = snapshot.discount_percentage;
      overallDiscount = (subtotal * snapshot.discount_percentage) / 100;
    } else if (snapshot.discount_amount && snapshot.discount_amount > 0) {
      overallDiscount = snapshot.discount_amount;
      overallDiscountPercentage = subtotal > 0 ? (overallDiscount / subtotal) * 100 : 0;
    }

    const grandTotal = subtotal - overallDiscount;

    // Calculate internal cost for profitability analysis
    const itemsInternalCost = allItems.reduce((sum: number, item: any) => {
      if (item.sub_items && item.sub_items.length > 0) {
        return sum + item.sub_items.reduce((siSum: number, si: any) => {
          const materials = si.materials?.reduce((m: number, mat: any) => m + (mat.total_price || mat.quantity * mat.unit_price || 0), 0) || 0;
          const labour = si.labour?.reduce((l: number, lab: any) => l + (lab.total_cost || lab.hours * lab.rate_per_hour || 0), 0) || 0;
          const misc = si.misc_amount || (((si.quantity || 0) * (si.rate || 0)) * (si.misc_percentage || 10) / 100);
          const planned = si.planned_profit || si.overhead_profit_amount || (((si.quantity || 0) * (si.rate || 0)) * (si.overhead_profit_percentage || 25) / 100);
          const transport = si.transport_amount || (((si.quantity || 0) * (si.rate || 0)) * (si.transport_percentage || 5) / 100);
          return siSum + materials + labour + misc + planned + transport;
        }, 0);
      }
      return sum + (item.internal_cost || 0);
    }, 0);

    // Add preliminary internal cost
    const preliminaryInternalCost = snapshot.preliminaries?.cost_details?.internal_cost || 0;
    const totalInternalCost = itemsInternalCost + preliminaryInternalCost;

    const negotiableMarginAfterDiscount = grandTotal - totalInternalCost;

    return (
      <div className="mt-4 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg p-4 border-2 border-green-300">
        <div className="space-y-2">
          {preliminaryAmount > 0 ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Items Subtotal:</span>
                <span className="font-semibold">AED {itemsSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Preliminaries:</span>
                <span className="font-semibold">AED {preliminaryAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t border-green-300 pt-2">
                <span className="text-gray-800">Combined Subtotal {overallDiscount > 0 ? '(Before Discount)' : ''}:</span>
                <span className="font-semibold">AED {subtotal.toFixed(2)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-sm font-medium">
              <span className="text-gray-800">Client Cost {overallDiscount > 0 ? '(Before Discount)' : ''}:</span>
              <span className="font-semibold">AED {subtotal.toFixed(2)}</span>
            </div>
          )}
          {overallDiscount > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>Overall Discount ({overallDiscountPercentage.toFixed(1)}%):</span>
              <span className="font-semibold">- AED {overallDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t-2 border-green-400 text-base font-bold">
            <span className="text-green-900">
              Grand Total: <span className="text-xs font-normal text-gray-600">(Excluding VAT)</span>
            </span>
            <span className="text-green-700">AED {grandTotal.toFixed(2)}</span>
          </div>

          {/* Discount Impact on Profitability */}
          {overallDiscount > 0 && totalInternalCost > 0 && (
            <div className="mt-3 pt-3 border-t border-green-300 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3">
              <h6 className="text-xs font-bold text-gray-800 mb-2">📊 Discount Impact on Profitability</h6>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Internal Cost:</span>
                  <span className="font-semibold text-red-600">AED {totalInternalCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-gray-300">
                  <span className="text-gray-700 font-medium">Total Margin (After Discount):</span>
                  <span className={`font-bold ${negotiableMarginAfterDiscount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    AED {negotiableMarginAfterDiscount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render BOQ Items with comparison highlighting
  const renderBOQItemsComparison = (currentSnapshot: any, previousSnapshot: any | null) => {
    if (!currentSnapshot?.items || currentSnapshot.items.length === 0) {
      return <p className="text-sm text-gray-500 italic">No items in this revision</p>;
    }

    return (
      <div className="space-y-3">
        {currentSnapshot.items.map((item: any, itemIdx: number) => {
          // Find matching previous item
          const prevItem = previousSnapshot?.items?.find((pi: any) => pi.item_name === item.item_name);

          // Calculate client amount - if rate is 0 (like in Original BOQ), calculate from sub-items
          let clientAmount = (item.quantity || 0) * (item.rate || 0);
          if (clientAmount === 0 && item.sub_items && item.sub_items.length > 0) {
            // Sum all sub-items' base_total (quantity × rate for each sub-item)
            clientAmount = item.sub_items.reduce((sum: number, subItem: any) => {
              const subItemClientAmount = (subItem.quantity || 0) * (subItem.rate || 0);
              return sum + subItemClientAmount;
            }, 0);
          }

          // Use values directly from API response
          const itemTotal = item.sub_items_cost || item.base_cost || 0;
          const miscellaneousAmount = item.overhead_amount || (clientAmount * ((item.overhead_percentage || 10) / 100));
          const overheadProfitAmount = item.profit_margin_amount || (clientAmount * ((item.profit_margin_percentage || 15) / 100));
          const subtotal = item.subtotal || clientAmount;
          const discountAmount = item.discount_amount || 0;
          const afterDiscount = subtotal - discountAmount;
          const vatAmount = item.vat_amount || 0;
          const finalTotalPrice = item.selling_price || item.total_selling_price || (afterDiscount + vatAmount);

          const isNew = !prevItem;

          return (
            <div key={itemIdx} className={`border rounded-lg overflow-hidden mb-2 ${isNew ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-300'}`}>
              {/* Item Header - Compact */}
              <div className={`px-3 py-2 ${isNew ? 'bg-yellow-100 border-b border-yellow-300' : 'bg-gray-50 border-b border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                      {isNew && <span className="text-xs bg-yellow-300 text-yellow-900 px-2 py-1 rounded font-bold">NEW</span>}
                      🔷 {item.item_name}
                      {item.work_type && (
                        <span className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded font-semibold">
                          {item.work_type}
                        </span>
                      )}
                    </h4>
                    {/* Show main item quantity and unit */}
                    {item.quantity && item.unit && (
                      <p className="text-sm text-gray-700 mt-1 font-medium">
                        Qty: {item.quantity} {item.unit}
                        {item.rate && item.rate > 0 && ` × Rate: AED ${item.rate.toFixed(2)}`}
                        {item.item_total && item.item_total > 0 && (
                          <span className="ml-2 font-bold text-blue-800">
                            = AED {item.item_total.toFixed(2)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Item Body */}
              <div className="p-4">
                {item.description && (
                  <p className="text-sm text-gray-700 mb-3 bg-gray-50 p-2 rounded border-l-4 border-gray-400">{item.description}</p>
                )}

              {/* Sub Items */}
              {item.sub_items && item.sub_items.length > 0 && (
                <div className="mb-2 space-y-2">
                  <h5 className="text-xs font-bold text-indigo-900 mb-2 pb-1 border-b border-indigo-200 bg-indigo-50 px-2 py-1 rounded">
                    📋 Sub Items ({item.sub_items.length})
                  </h5>
                  {item.sub_items.map((subItem: any, subIdx: number) => {
                    const prevSubItem = prevItem?.sub_items?.find((ps: any) => ps.sub_item_name === subItem.sub_item_name);

                    // 🔥 Get image - try multiple sources
                    const currentBOQItem = selectedBoq?.items?.find((i: any) => i.item_name === item.item_name);
                    const currentBOQSubItem = currentBOQItem?.sub_items?.find((si: any) => si.sub_item_name === subItem.sub_item_name);
                    // Try: 1. Current BOQ data, 2. Snapshot data, 3. API response
                    let rawImageData = currentBOQSubItem?.sub_item_image || subItem.sub_item_image || subItem.image;

                    // 🔥 Handle image format - it comes as array of objects with 'url' property
                    let subItemImages: string[] = [];
                    if (Array.isArray(rawImageData)) {
                      subItemImages = rawImageData.map((img: any) => img.url || img).filter(Boolean);
                    } else if (typeof rawImageData === 'string') {
                      subItemImages = [rawImageData];
                    } else if (rawImageData?.url) {
                      subItemImages = [rawImageData.url];
                    }

                    return (
                      <div key={subIdx} className="bg-green-50 border border-green-200 rounded p-2">
                        <div className="flex justify-between items-start mb-1 gap-3">
                          <div className="flex-1">
                            <p className="font-semibold text-xs text-gray-900">{subItem.sub_item_name}</p>
                            {subItem.scope && <p className="text-xs text-gray-600">{subItem.scope}</p>}
                            {/* Show sub-item quantity, unit, and rate */}
                            <p className="text-xs text-gray-600 mt-1">
                              Qty: {subItem.quantity} {subItem.unit} × Rate: AED {subItem.rate?.toFixed(2) || '0.00'}
                            </p>
                          </div>
                          {/* 🔥 Display sub-item images if available */}
                          {subItemImages.length > 0 && (
                            <div className="flex-shrink-0 flex gap-1">
                              {subItemImages.map((imageUrl, imgIdx) => (
                                <img
                                  key={imgIdx}
                                  src={imageUrl}
                                  alt={`${subItem.sub_item_name} ${imgIdx + 1}`}
                                  className="w-12 h-12 object-cover rounded border border-blue-400 shadow-sm cursor-pointer hover:scale-125 transition-transform"
                                  onClick={() => window.open(imageUrl, '_blank')}
                                  title="Click to view full size"
                                />
                              ))}
                            </div>
                          )}
                          <div className="text-right text-xs">
                            {subItem.size && <div className="text-gray-600">Size: {subItem.size}</div>}
                            {subItem.location && <div className="text-gray-600">Loc: {subItem.location}</div>}
                            {subItem.brand && <div className="text-gray-600">Brand: {subItem.brand}</div>}
                            {/* Show base total prominently */}
                            {subItem.base_total !== undefined && (
                              <div className="font-bold text-blue-900 mt-1 bg-blue-100 px-2 py-0.5 rounded">
                                Base: AED {subItem.base_total?.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Sub Item Materials */}
                        {subItem.materials && subItem.materials.length > 0 && (
                          <div className="mb-3 bg-red-50/20 rounded-lg p-3 border border-red-300 hover:border-red-400 transition-all duration-200">
                            <h5 className="text-xs font-bold text-blue-900 mb-2 flex items-center gap-2">
                              📦 Raw Materials
                            </h5>
                            <div className="bg-white rounded border border-blue-200 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-blue-100 border-b border-blue-200">
                                  <tr>
                                    <th className="text-left py-1.5 px-2 font-semibold text-blue-900">Material</th>
                                    <th className="text-center py-1.5 px-2 font-semibold text-blue-900">Qty</th>
                                    <th className="text-center py-1.5 px-2 font-semibold text-blue-900">Unit</th>
                                    <th className="text-right py-1.5 px-2 font-semibold text-blue-900">Rate</th>
                                    <th className="text-right py-1.5 px-2 font-semibold text-blue-900">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {subItem.materials.map((mat: any, matIdx: number) => {
                                    const prevMat = prevSubItem?.materials?.find((pm: any) => pm.material_name === mat.material_name);
                                    const quantityChanged = prevMat ? hasChanged(mat.quantity, prevMat.quantity) : !prevMat;
                                    const priceChanged = prevMat ? hasChanged(mat.quantity * mat.unit_price, prevMat.quantity * prevMat.unit_price) : !prevMat;
                                    const isNewMat = !prevMat;
                                    const materialTotal = mat.total_price || (mat.quantity * mat.unit_price);

                                    return (
                                      <tr key={matIdx} className={`border-b border-blue-100 ${isNewMat ? 'bg-yellow-100' : matIdx % 2 === 0 ? 'bg-blue-50/30' : 'bg-white'}`}>
                                        <td className={`py-1.5 px-2 text-gray-900 ${quantityChanged ? 'bg-yellow-200' : ''}`}>
                                          {mat.material_name}
                                          {mat.description && <div className="text-xs text-gray-500">{mat.description}</div>}
                                        </td>
                                        <td className={`py-1.5 px-2 text-center text-gray-700 ${quantityChanged ? 'bg-yellow-200' : ''}`}>{mat.quantity}</td>
                                        <td className="py-1.5 px-2 text-center text-gray-700 uppercase">{mat.unit}</td>
                                        <td className="py-1.5 px-2 text-right text-gray-700">AED {mat.unit_price?.toFixed(2) || '0.00'}</td>
                                        <td className={`py-1.5 px-2 text-right font-semibold text-blue-700 ${priceChanged ? 'bg-yellow-200' : ''}`}>AED {materialTotal.toFixed(2)}</td>
                                      </tr>
                                    );
                                  })}
                                  <tr className="bg-blue-200 border-t-2 border-blue-400">
                                    <td colSpan={4} className="py-1.5 px-2 font-bold text-blue-900 text-right text-xs">Materials Total:</td>
                                    <td className="py-1.5 px-2 font-bold text-blue-900 text-right text-xs">
                                      AED {subItem.materials.reduce((sum: number, m: any) => sum + (m.total_price || m.quantity * m.unit_price), 0).toFixed(2)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Sub Item Labour */}
                        {subItem.labour && subItem.labour.length > 0 && (
                          <div className="mb-3 bg-red-50/20 rounded-lg p-3 border border-red-300 hover:border-red-400 transition-all duration-200">
                            <h5 className="text-xs font-bold text-orange-900 mb-2 flex items-center gap-2">
                              👷 Labour
                            </h5>
                            <div className="bg-white rounded border border-orange-200 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-orange-100 border-b border-orange-200">
                                  <tr>
                                    <th className="text-left py-1.5 px-2 font-semibold text-orange-900">Role</th>
                                    <th className="text-center py-1.5 px-2 font-semibold text-orange-900">Hours</th>
                                    <th className="text-right py-1.5 px-2 font-semibold text-orange-900">Rate/hr</th>
                                    <th className="text-right py-1.5 px-2 font-semibold text-orange-900">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {subItem.labour.map((lab: any, labIdx: number) => {
                                    const prevLab = prevSubItem?.labour?.find((pl: any) => pl.labour_role === lab.labour_role);
                                    const hoursChanged = prevLab ? hasChanged(lab.hours, prevLab.hours) : !prevLab;
                                    const costChanged = prevLab ? hasChanged(lab.hours * lab.rate_per_hour, prevLab.hours * prevLab.rate_per_hour) : !prevLab;
                                    const isNewLab = !prevLab;
                                    const labourTotal = lab.total_cost || (lab.hours * lab.rate_per_hour);

                                    return (
                                      <tr key={labIdx} className={`border-b border-orange-100 ${isNewLab ? 'bg-yellow-100' : labIdx % 2 === 0 ? 'bg-orange-50/30' : 'bg-white'}`}>
                                        <td className={`py-1.5 px-2 text-gray-900 ${hoursChanged ? 'bg-yellow-200' : ''}`}>{lab.labour_role}</td>
                                        <td className={`py-1.5 px-2 text-center text-gray-700 ${hoursChanged ? 'bg-yellow-200' : ''}`}>{lab.hours} hrs</td>
                                        <td className="py-1.5 px-2 text-right text-gray-700">AED {lab.rate_per_hour?.toFixed(2) || '0.00'}</td>
                                        <td className={`py-1.5 px-2 text-right font-semibold text-orange-700 ${costChanged ? 'bg-yellow-200' : ''}`}>AED {labourTotal.toFixed(2)}</td>
                                      </tr>
                                    );
                                  })}
                                  <tr className="bg-orange-200 border-t-2 border-orange-400">
                                    <td colSpan={3} className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">Labour Total:</td>
                                    <td className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">
                                      AED {subItem.labour.reduce((sum: number, l: any) => sum + (l.total_cost || l.hours * l.rate_per_hour), 0).toFixed(2)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Cost Breakdown Percentages (Per-Sub-Item) with Yellow Highlighting */}
                        <div className="bg-purple-50/50 rounded-lg p-3 border border-purple-300 mt-3">
                          <h5 className="text-xs font-bold text-purple-900 mb-2 flex items-center gap-2">
                            💵 Cost Breakdown Percentages
                          </h5>
                          <div className="space-y-1.5 text-xs">
                            {(() => {
                              const clientAmount = (subItem.quantity || 0) * (subItem.rate || 0);
                              const miscPercentage = subItem.misc_percentage || 10;
                              const miscAmount = subItem.misc_amount || (clientAmount * (miscPercentage / 100));
                              const overheadProfitPercentage = subItem.overhead_profit_percentage || 25;
                              const overheadProfitAmount = subItem.overhead_profit_amount || (clientAmount * (overheadProfitPercentage / 100));
                              const transportPercentage = subItem.transport_percentage || 5;
                              const transportAmount = subItem.transport_amount || (clientAmount * (transportPercentage / 100));

                              // Get previous percentages for comparison
                              const prevMiscPercentage = prevSubItem ? (prevSubItem.misc_percentage || 10) : miscPercentage;
                              const prevOverheadProfitPercentage = prevSubItem ? (prevSubItem.overhead_profit_percentage || 25) : overheadProfitPercentage;
                              const prevTransportPercentage = prevSubItem ? (prevSubItem.transport_percentage || 5) : transportPercentage;

                              // Check if percentages changed
                              const miscChanged = prevSubItem && hasChanged(miscPercentage, prevMiscPercentage);
                              const overheadChanged = prevSubItem && hasChanged(overheadProfitPercentage, prevOverheadProfitPercentage);
                              const transportChanged = prevSubItem && hasChanged(transportPercentage, prevTransportPercentage);

                              return (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Client Amount (Qty × Rate):</span>
                                    <span className="font-semibold text-gray-900">AED {clientAmount.toFixed(2)}</span>
                                  </div>
                                  <div className={`flex justify-between rounded px-2 py-1 ${miscChanged ? 'bg-yellow-200' : ''}`}>
                                    <span className="text-gray-700">Miscellaneous ({miscPercentage}%):</span>
                                    <span className="font-semibold text-red-600">- AED {miscAmount.toFixed(2)}</span>
                                  </div>
                                  <div className={`flex justify-between rounded px-2 py-1 ${overheadChanged ? 'bg-yellow-200' : ''}`}>
                                    <span className="text-gray-700">Overhead & Profit ({overheadProfitPercentage}%):</span>
                                    <span className="font-semibold text-red-600">- AED {overheadProfitAmount.toFixed(2)}</span>
                                  </div>
                                  <div className={`flex justify-between rounded px-2 py-1 ${transportChanged ? 'bg-yellow-200' : ''}`}>
                                    <span className="text-gray-700">Transport ({transportPercentage}%):</span>
                                    <span className="font-semibold text-red-600">- AED {transportAmount.toFixed(2)}</span>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Profit Analysis (Per-Sub-Item) */}
                        <div className="bg-green-50/50 rounded-lg p-3 border border-green-300 mt-3">
                          <h5 className="text-xs font-bold text-green-900 mb-2 flex items-center gap-2">
                            💰 Profit Analysis
                          </h5>
                          <div className="space-y-1.5 text-xs">
                            {(() => {
                              const clientAmount = (subItem.quantity || 0) * (subItem.rate || 0);
                              const materialCost = subItem.material_cost || (subItem.materials?.reduce((sum: number, m: any) => sum + (m.total_price || m.quantity * m.unit_price), 0) || 0);
                              const labourCost = subItem.labour_cost || (subItem.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || l.hours * l.rate_per_hour), 0) || 0);
                              const miscAmount = subItem.misc_amount || (clientAmount * ((subItem.misc_percentage || 10) / 100));
                              const transportAmount = subItem.transport_amount || (clientAmount * ((subItem.transport_percentage || 5) / 100));
                              const plannedProfit = subItem.planned_profit || (clientAmount * ((subItem.overhead_profit_percentage || 25) / 100));
                              const internalCost = subItem.internal_cost || (materialCost + labourCost + miscAmount + plannedProfit + transportAmount);
                              const negotiableMargin = subItem.actual_profit || (clientAmount - internalCost);

                              return (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Client Amount:</span>
                                    <span className="font-semibold text-gray-900">AED {clientAmount.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Materials Cost:</span>
                                    <span className="font-semibold text-gray-900">AED {materialCost.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Labour Cost:</span>
                                    <span className="font-semibold text-gray-900">AED {labourCost.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Misc ({subItem.misc_percentage || 10}%):</span>
                                    <span className="font-semibold text-gray-900">AED {miscAmount.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Overhead & Profit ({subItem.overhead_profit_percentage || 25}%):</span>
                                    <span className="font-semibold text-gray-900">AED {plannedProfit.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Transport ({subItem.transport_percentage || 5}%):</span>
                                    <span className="font-semibold text-gray-900">AED {transportAmount.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between pt-1.5 border-t border-gray-300">
                                    <span className="text-gray-800 font-bold">Internal Cost (Total):</span>
                                    <span className="font-bold text-red-600">AED {internalCost.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between pt-1.5 mt-1.5 border-t border-green-300">
                                    <span className="text-gray-700 font-medium">Planned Profit:</span>
                                    <span className="font-semibold text-blue-600">AED {plannedProfit.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-800 font-medium">Negotiable Margin:</span>
                                    <span className={`font-bold ${negotiableMargin >= plannedProfit ? 'text-green-600' : 'text-orange-600'}`}>
                                      AED {negotiableMargin.toFixed(2)}
                                    </span>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Direct Materials (for items without sub_items) */}
              {(!item.sub_items || item.sub_items.length === 0) && item.materials && item.materials.length > 0 && (
                <div className="mb-4 bg-red-50/20 rounded-lg p-4 border border-red-300 hover:border-red-400 transition-all duration-200">
                  <h4 className="text-sm font-bold text-purple-900 mb-3 flex items-center gap-2">
                    <div className="p-1.5 bg-white rounded shadow-sm">
                      📦
                    </div>
                    Raw Materials
                  </h4>
                  <div className="bg-white rounded-lg border border-purple-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-purple-100 border-b border-purple-200">
                        <tr>
                          <th className="text-left py-2 px-3 font-semibold text-purple-900">Material Name</th>
                          <th className="text-center py-2 px-3 font-semibold text-purple-900">Quantity</th>
                          <th className="text-center py-2 px-3 font-semibold text-purple-900">Unit</th>
                          <th className="text-right py-2 px-3 font-semibold text-purple-900">Rate</th>
                          <th className="text-right py-2 px-3 font-semibold text-purple-900">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.materials.map((mat: any, matIdx: number) => {
                          const prevMat = prevItem?.materials?.find((pm: any) => pm.material_name === mat.material_name);
                          const quantityChanged = prevMat ? hasChanged(mat.quantity, prevMat.quantity) : !prevMat;
                          const priceChanged = prevMat ? hasChanged(mat.total_price, prevMat.total_price) : !prevMat;
                          const isNewMat = !prevMat;

                          return (
                            <tr key={matIdx} className={`border-b border-purple-100 ${isNewMat ? 'bg-yellow-100' : matIdx % 2 === 0 ? 'bg-purple-50/30' : 'bg-white'}`}>
                              <td className={`py-2.5 px-3 text-gray-900 ${quantityChanged ? 'bg-yellow-200' : ''}`}>{mat.material_name}</td>
                              <td className={`py-2.5 px-3 text-center text-gray-700 ${quantityChanged ? 'bg-yellow-200' : ''}`}>{mat.quantity}</td>
                              <td className="py-2.5 px-3 text-center text-gray-700 uppercase">{mat.unit}</td>
                              <td className="py-2.5 px-3 text-right text-gray-700">AED {mat.unit_price?.toFixed(2) || '0.00'}</td>
                              <td className={`py-2.5 px-3 text-right font-semibold text-purple-700 ${priceChanged ? 'bg-yellow-200' : ''}`}>AED {mat.total_price?.toFixed(2) || '0.00'}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-purple-200 border-t-2 border-purple-400">
                          <td colSpan={4} className="py-2.5 px-3 font-bold text-purple-900 text-right">Total Materials:</td>
                          <td className="py-2.5 px-3 font-bold text-purple-900 text-right">
                            AED {item.materials.reduce((sum: any, m: any) => sum + (m.total_price || 0), 0).toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Direct Labour (for items without sub_items) */}
              {(!item.sub_items || item.sub_items.length === 0) && item.labour && item.labour.length > 0 && (
                <div className="mb-4 bg-red-50/20 rounded-lg p-4 border border-red-300 hover:border-red-400 transition-all duration-200">
                  <h4 className="text-sm font-bold text-orange-900 mb-3 flex items-center gap-2">
                    <div className="p-1.5 bg-white rounded shadow-sm">
                      👷
                    </div>
                    Labour Breakdown
                  </h4>
                  <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-orange-100 border-b border-orange-200">
                        <tr>
                          <th className="text-left py-2 px-3 font-semibold text-orange-900">Labour Role</th>
                          <th className="text-center py-2 px-3 font-semibold text-orange-900">Working Hours</th>
                          <th className="text-right py-2 px-3 font-semibold text-orange-900">Rate/Hour</th>
                          <th className="text-right py-2 px-3 font-semibold text-orange-900">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.labour.map((lab: any, labIdx: number) => {
                          const prevLab = prevItem?.labour?.find((pl: any) => pl.labour_role === lab.labour_role);
                          const hoursChanged = prevLab ? hasChanged(lab.hours, prevLab.hours) : !prevLab;
                          const costChanged = prevLab ? hasChanged(lab.total_cost, prevLab.total_cost) : !prevLab;
                          const isNewLab = !prevLab;

                          return (
                            <tr key={labIdx} className={`border-b border-orange-100 ${isNewLab ? 'bg-yellow-100' : labIdx % 2 === 0 ? 'bg-orange-50/30' : 'bg-white'}`}>
                              <td className={`py-2.5 px-3 text-gray-900 ${hoursChanged ? 'bg-yellow-200' : ''}`}>{lab.labour_role}</td>
                              <td className={`py-2.5 px-3 text-center text-gray-700 ${hoursChanged ? 'bg-yellow-200' : ''}`}>{lab.hours} hrs</td>
                              <td className="py-2.5 px-3 text-right text-gray-700">AED {lab.rate_per_hour?.toFixed(2) || '0.00'}</td>
                              <td className={`py-2.5 px-3 text-right font-semibold text-orange-700 ${costChanged ? 'bg-yellow-200' : ''}`}>AED {lab.total_cost?.toFixed(2) || '0.00'}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-orange-200 border-t-2 border-orange-400">
                          <td colSpan={3} className="py-2.5 px-3 font-bold text-orange-900 text-right">Total Labour:</td>
                          <td className="py-2.5 px-3 font-bold text-orange-900 text-right">
                            AED {item.labour.reduce((sum: any, l: any) => sum + (l.total_cost || 0), 0).toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Cost Analysis (Item-Level) - EXACT COPY from BOQDetailsModal */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border-2 border-blue-300 shadow-sm">
                <h5 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                  <Calculator className="w-4 h-4" />
                  Cost Analysis
                </h5>
                <div className="space-y-2 text-sm">
                  {(() => {
                    const clientCost = item.client_cost || item.sub_items?.reduce((sum: number, si: any) => sum + ((si.quantity || 0) * (si.rate || 0)), 0) || 0;
                    const internalCost = item.internal_cost || item.sub_items?.reduce((sum: number, si: any) => {
                      const materialCost = si.materials?.reduce((mSum: number, m: any) => mSum + (m.total_price || m.quantity * m.unit_price), 0) || 0;
                      const labourCost = si.labour?.reduce((lSum: number, l: any) => lSum + (l.total_cost || l.hours * l.rate_per_hour), 0) || 0;
                      const subClientAmount = (si.quantity || 0) * (si.rate || 0);
                      const miscAmount = subClientAmount * ((si.misc_percentage || 10) / 100);
                      const overheadProfitAmount = subClientAmount * ((si.overhead_profit_percentage || 25) / 100);
                      const transportAmount = subClientAmount * ((si.transport_percentage || 5) / 100);
                      return sum + materialCost + labourCost + miscAmount + overheadProfitAmount + transportAmount;
                    }, 0) || 0;
                    const projectMargin = item.project_margin || (clientCost - internalCost);
                    const marginPercentage = clientCost > 0 ? ((projectMargin / clientCost) * 100) : 0;

                    // Calculate previous values for comparison
                    const prevClientCost = prevItem ? (prevItem.client_cost || prevItem.sub_items?.reduce((sum: number, si: any) => sum + ((si.quantity || 0) * (si.rate || 0)), 0) || 0) : 0;
                    const prevInternalCost = prevItem ? (prevItem.internal_cost || prevItem.sub_items?.reduce((sum: number, si: any) => {
                      const materialCost = si.materials?.reduce((mSum: number, m: any) => mSum + (m.total_price || m.quantity * m.unit_price), 0) || 0;
                      const labourCost = si.labour?.reduce((lSum: number, l: any) => lSum + (l.total_cost || l.hours * l.rate_per_hour), 0) || 0;
                      const subClientAmount = (si.quantity || 0) * (si.rate || 0);
                      const miscAmount = subClientAmount * ((si.misc_percentage || 10) / 100);
                      const overheadProfitAmount = subClientAmount * ((si.overhead_profit_percentage || 25) / 100);
                      const transportAmount = subClientAmount * ((si.transport_percentage || 5) / 100);
                      return sum + materialCost + labourCost + miscAmount + overheadProfitAmount + transportAmount;
                    }, 0) || 0) : 0;
                    const prevProjectMargin = prevItem ? (prevItem.project_margin || (prevClientCost - prevInternalCost)) : 0;

                    // Check if values changed
                    const clientCostChanged = prevItem && hasChanged(clientCost, prevClientCost);
                    const internalCostChanged = prevItem && hasChanged(internalCost, prevInternalCost);
                    const marginChanged = prevItem && hasChanged(projectMargin, prevProjectMargin);

                    return (
                      <>
                        <div className={`flex justify-between items-center py-1 rounded px-2 ${clientCostChanged ? 'bg-yellow-200' : ''}`}>
                          <span className="text-gray-700 font-medium">Client Cost (Total):</span>
                          <span className="text-blue-700 font-bold text-base">{formatCurrency(clientCost)}</span>
                        </div>
                        <div className={`flex justify-between items-center py-1 rounded px-2 ${internalCostChanged ? 'bg-yellow-200' : ''}`}>
                          <span className="text-gray-700 font-medium">Internal Cost (Total):</span>
                          <span className="text-orange-600 font-semibold">{formatCurrency(internalCost)}</span>
                        </div>
                        <div className={`flex justify-between items-center pt-2 border-t-2 border-blue-400 rounded px-2 ${marginChanged ? 'bg-yellow-200' : ''}`}>
                          <span className="text-gray-900 font-bold">Negotiable Margin:</span>
                          <div className="text-right">
                            <div className={`font-bold text-lg ${projectMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(projectMargin)}
                            </div>
                            <div className={`text-xs font-semibold ${marginPercentage >= 20 ? 'text-green-600' : marginPercentage >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                              ({marginPercentage.toFixed(1)}% margin)
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const currentRevision = selectedRevisionIndex !== null ? internalRevisions[selectedRevisionIndex] : null;
  const previousRevision = selectedRevisionIndex !== null && selectedRevisionIndex < internalRevisions.length - 1
    ? internalRevisions[selectedRevisionIndex + 1]
    : null;

  const currentSnapshot = currentRevision?.changes_summary;
  const previousSnapshot = previousRevision?.changes_summary;

  const currentTotal = currentSnapshot ? calculateTotalFromSnapshot(currentSnapshot) : 0;
  const previousTotal = previousSnapshot ? calculateTotalFromSnapshot(previousSnapshot) : 0;
  const change = calculateChange(currentTotal, previousTotal);

  return (
    <div className="space-y-6">
      {/* Header with BOQ Selection */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Select Project to View Internal Revisions</h3>

        {/* Recent Projects - Always visible (4-5 most recent) */}
        {!selectedBoq && boqs.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-sm font-semibold text-gray-700 mb-3">Recent Projects:</p>
            <div className="space-y-2">
              {boqs.slice(0, 5).map((boq) => {
                const statusBadge = getStatusBadge(boq.status);
                return (
                  <button
                    key={boq.boq_id}
                    onClick={() => {
                      setSelectedBoq(boq);
                      setSearchTerm('');
                      setShowDropdown(false);
                      setSelectedRevisionIndex(null);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border border-gray-200 rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-semibold text-gray-900">{boq.boq_name}</div>
                          {/* Status Badge */}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge.color}`}>
                            {statusBadge.label}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          {boq.project?.name} • {boq.project?.client}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-sm font-semibold px-2 py-1 rounded inline-block bg-blue-100 text-blue-700">
                          Internal Rev: {boq.internal_revision_number}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search/Select Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder={selectedBoq ? selectedBoq.boq_name : "🔍 Click to select project or search..."}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onClick={() => setShowDropdown(true)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
          />

          {/* Dropdown Results - Show on focus or when typing */}
          {showDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute z-20 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-xl max-h-80 overflow-y-auto"
            >
              {boqs.length > 0 ? (
                (searchTerm ? filteredBOQs : boqs.slice(0, 20)).map((boq) => {
                  const statusBadge = getStatusBadge(boq.status);
                  return (
                    <button
                      key={boq.boq_id}
                      onClick={() => {
                        setSelectedBoq(boq);
                        setSearchTerm('');
                        setShowDropdown(false);
                        setSelectedRevisionIndex(null);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="font-semibold text-gray-900">{boq.boq_name}</div>
                            {/* Status Badge */}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge.color}`}>
                              {statusBadge.label}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">
                            {boq.project?.name} • {boq.project?.client}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="text-sm font-semibold px-2 py-1 rounded inline-block bg-blue-100 text-blue-700">
                            Internal Rev: {boq.internal_revision_number}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{formatCurrency(boq.total_cost)}</div>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-8 text-center text-gray-500">
                  <p className="font-medium">No projects with internal revisions found</p>
                  <p className="text-sm mt-1">Try searching or check other tabs</p>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Selected BOQ Info */}
        {selectedBoq && !searchTerm && (
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-blue-900">{selectedBoq.boq_name}</h4>
                <p className="text-sm text-blue-700">
                  {selectedBoq.project?.name} • {selectedBoq.project?.client}
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-blue-900">
                  Internal Rev: {selectedBoq.internal_revision_number}
                </div>
                <div className="text-sm text-blue-700">{formatCurrency(selectedBoq.total_cost)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Split View: Current (Left) vs Previous (Right) */}
      {selectedBoq && internalRevisions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT SIDE: Current Internal Revision */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 border-b border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-green-900">📌 Current Internal Revision</h3>
                  <p className="text-sm text-green-700">
                    Internal Rev {currentRevision?.internal_revision_number}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-900">
                    {formatCurrency(currentTotal)}
                  </div>
                  {previousSnapshot && change.percentage !== 0 && (
                    <div className={`flex items-center justify-end gap-1 text-xs font-semibold ${
                      change.percentage > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {change.percentage > 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {change.percentage > 0 ? '+' : ''}{change.percentage}%
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Content */}
            {isLoadingRevisions ? (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <ModernLoadingSpinners size="md" />
                <p className="mt-4 text-gray-600">Loading details...</p>
              </div>
            ) : currentSnapshot ? (
              <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
                {/* Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Summary</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Action:</span>
                      <span className="font-semibold">{getActionLabel(currentRevision.action_type)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">By:</span>
                      <span className="font-semibold">{currentRevision.actor_name} ({currentRevision.actor_role})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Date:</span>
                      <span className="font-semibold">
                        {new Date(currentRevision.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Items:</span>
                      <span className="font-semibold">{currentSnapshot.total_items || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Rejection/Approval Messages */}
                {currentRevision.rejection_reason && (
                  <div className="p-3 bg-red-100 border border-red-200 rounded-lg">
                    <p className="text-sm font-semibold text-red-900 mb-1">Rejection Reason:</p>
                    <p className="text-sm text-red-800">{currentRevision.rejection_reason}</p>
                  </div>
                )}
                {currentRevision.approval_comments && (
                  <div className="p-3 bg-green-100 border border-green-200 rounded-lg">
                    <p className="text-sm font-semibold text-green-900 mb-1">Approval Comments:</p>
                    <p className="text-sm text-green-800">{currentRevision.approval_comments}</p>
                  </div>
                )}

                {/* Preliminaries Section - Shown FIRST */}
                {currentSnapshot?.preliminaries && (
                  <div className="mb-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border-2 border-purple-200 shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-purple-900">📋 Preliminaries & Approval Works</h3>
                        <p className="text-sm text-purple-700">Selected conditions and terms</p>
                      </div>
                    </div>

                    {(() => {
                      const prelimData = currentSnapshot.preliminaries;
                      const items = prelimData.items || [];
                      const costDetails = prelimData.cost_details || {};
                      const amount = costDetails.amount || 0;
                      const miscPct = costDetails.misc_percentage || 10;
                      const overheadPct = costDetails.overhead_profit_percentage || 25;
                      const transportPct = costDetails.transport_percentage || 5;

                      return (
                        <>
                          {/* Selected Items */}
                          {items.length > 0 && (
                            <div className="mb-4 bg-white rounded-lg p-4 border border-purple-200">
                              <h5 className="text-sm font-semibold text-gray-900 mb-3">Selected Items:</h5>
                              <div className="space-y-2">
                                {items
                                  .filter((item: any) => item.checked || item.selected)
                                  .map((item: any, idx: number) => (
                                  <div key={idx} className="flex items-start gap-2">
                                    <span className="text-green-600 font-bold mt-0.5">✓</span>
                                    <div className="flex-1">
                                      <p className="text-sm text-gray-800">{item.description}</p>
                                      {item.custom_item && (
                                        <span className="inline-block mt-1 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                          Custom Item
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Cost Summary */}
                          <div className="mb-4 bg-white rounded-lg p-4 border border-purple-200">
                            <h5 className="text-sm font-semibold text-gray-900 mb-3">Cost Summary</h5>
                            <div className="grid grid-cols-4 gap-4">
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Quantity</p>
                                <p className="text-sm font-semibold text-gray-900">{costDetails.quantity || 1}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Unit</p>
                                <p className="text-sm font-semibold text-gray-900">{costDetails.unit || 'lot'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Rate (AED)</p>
                                <p className="text-sm font-semibold text-gray-900">{formatCurrency(costDetails.rate || 0)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Amount (AED)</p>
                                <p className="text-sm font-bold text-purple-900">{formatCurrency(amount)}</p>
                              </div>
                            </div>
                          </div>

                          {/* Internal Cost Summary */}
                          {costDetails.internal_cost !== undefined && (
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                              <h5 className="text-sm font-semibold text-gray-900 mb-3">Internal Cost Summary</h5>
                              {(() => {
                                const internalCostBase = costDetails.internal_cost || 0;
                                const miscAmount = (amount * miscPct) / 100;
                                const overheadAmount = (amount * overheadPct) / 100;
                                const transportAmount = (amount * transportPct) / 100;
                                const totalInternalCost = internalCostBase + miscAmount + overheadAmount + transportAmount;

                                return (
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">Base Internal Cost:</span>
                                      <span className="font-semibold text-gray-900">{formatCurrency(internalCostBase)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">Miscellaneous ({miscPct}%):</span>
                                      <span className="font-semibold text-gray-900">{formatCurrency(miscAmount)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">Overhead & Profit ({overheadPct}%):</span>
                                      <span className="font-semibold text-gray-900">{formatCurrency(overheadAmount)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-700">Transport ({transportPct}%):</span>
                                      <span className="font-semibold text-gray-900">{formatCurrency(transportAmount)}</span>
                                    </div>
                                    <div className="flex justify-between pt-2 border-t-2 border-blue-300">
                                      <span className="text-gray-900 font-bold">Total Internal Cost:</span>
                                      <span className="font-bold text-red-600">{formatCurrency(totalInternalCost)}</span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* 🔥 Terms & Conditions - From current BOQ data */}
                {selectedBoq?.terms_conditions && selectedBoq.terms_conditions.items && selectedBoq.terms_conditions.items.filter(t => t.checked).length > 0 && (
                  <div className="mb-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-5 border-2 border-indigo-300 shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-indigo-900">📝 Terms & Conditions</h3>
                        <p className="text-sm text-indigo-700">{selectedBoq.terms_conditions.items.filter(t => t.checked).length} terms selected</p>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-indigo-200">
                      <div className="space-y-3">
                        {selectedBoq.terms_conditions.items
                          .filter(term => term.checked)
                          .map((term, idx) => (
                            <div key={term.id || idx} className="flex items-start gap-3 p-3 hover:bg-indigo-50 rounded-lg transition-colors border-b border-gray-100 last:border-0">
                              <span className="text-green-600 font-bold mt-0.5 text-xl flex-shrink-0">✓</span>
                              <div className="flex-1">
                                <p className="text-sm text-gray-800 leading-relaxed">{term.terms_text}</p>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Items */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Items</h4>
                  {renderBOQItemsComparison(currentSnapshot, previousSnapshot)}
                </div>

                {/* Grand Total with Discount Impact */}
                {currentSnapshot?.items && currentSnapshot.items.length > 0 && (
                  <div className="mt-6 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg p-5 border-2 border-green-300">
                    <div className="space-y-3">
                      {(() => {
                        const allItems = currentSnapshot.items || [];

                        // Calculate subtotal (sum of all sub-item client amounts)
                        const boqItemsSubtotal = allItems.reduce((sum: number, item: any) => {
                          if (item.sub_items && item.sub_items.length > 0) {
                            return sum + item.sub_items.reduce((siSum: number, si: any) =>
                              siSum + ((si.quantity || 0) * (si.rate || 0)), 0
                            );
                          }
                          return sum + (item.client_cost || 0);
                        }, 0);

                        // Add preliminaries amount to subtotal
                        const preliminariesAmount = currentSnapshot.preliminaries?.cost_details?.amount || 0;
                        const subtotal = boqItemsSubtotal + preliminariesAmount;

                        // Calculate total internal cost from BOQ items
                        const boqItemsInternalCost = allItems.reduce((sum: number, item: any) => {
                          if (item.sub_items && item.sub_items.length > 0) {
                            return sum + item.sub_items.reduce((siSum: number, si: any) => {
                              const matCost = si.materials?.reduce((m: number, mat: any) => m + (mat.total_price || mat.quantity * mat.unit_price), 0) || 0;
                              const labCost = si.labour?.reduce((l: number, lab: any) => l + (lab.total_cost || lab.hours * lab.rate_per_hour), 0) || 0;
                              const clientAmt = (si.quantity || 0) * (si.rate || 0);
                              const miscAmt = clientAmt * ((si.misc_percentage || 10) / 100);
                              const opAmt = clientAmt * ((si.overhead_profit_percentage || 25) / 100);
                              const transportAmt = clientAmt * ((si.transport_percentage || 5) / 100);
                              return siSum + matCost + labCost + miscAmt + opAmt + transportAmt;
                            }, 0);
                          }
                          return sum + (item.internal_cost || 0);
                        }, 0);

                        // Add preliminaries internal cost
                        const preliminariesInternalCost = (() => {
                          if (!currentSnapshot.preliminaries?.cost_details) return 0;
                          const costDetails = currentSnapshot.preliminaries.cost_details;
                          const internalCostBase = costDetails.internal_cost || 0;
                          const miscPct = costDetails.misc_percentage || 10;
                          const overheadPct = costDetails.overhead_profit_percentage || 25;
                          const transportPct = costDetails.transport_percentage || 5;
                          const miscAmount = (preliminariesAmount * miscPct) / 100;
                          const overheadAmount = (preliminariesAmount * overheadPct) / 100;
                          const transportAmount = (preliminariesAmount * transportPct) / 100;
                          return internalCostBase + miscAmount + overheadAmount + transportAmount;
                        })();

                        const totalInternalCost = boqItemsInternalCost + preliminariesInternalCost;

                        // Calculate profits
                        const totalActualProfit = subtotal - totalInternalCost;
                        const profitMarginPercentage = subtotal > 0 ? (totalActualProfit / subtotal) * 100 : 0;

                        // 🔥 Overall discount - Priority 1: Check for overall BOQ-level discount
                        let overallDiscount = 0;
                        let overallDiscountPercentage = 0;

                        if (currentSnapshot.discount_percentage && currentSnapshot.discount_percentage > 0) {
                          overallDiscountPercentage = currentSnapshot.discount_percentage;
                          overallDiscount = (subtotal * currentSnapshot.discount_percentage) / 100;
                        } else if (currentSnapshot.discount_amount && currentSnapshot.discount_amount > 0) {
                          overallDiscount = currentSnapshot.discount_amount;
                          overallDiscountPercentage = subtotal > 0 ? (overallDiscount / subtotal) * 100 : 0;
                        } else {
                          // Priority 2: Calculate item-level discounts
                          allItems.forEach((item: any) => {
                            overallDiscount += (item.discount_amount || 0);
                          });
                          if (subtotal > 0 && overallDiscount > 0) {
                            overallDiscountPercentage = (overallDiscount / subtotal) * 100;
                          }
                        }

                        // Grand total
                        const grandTotal = subtotal - overallDiscount;

                        // Calculate profit after discount
                        const negotiableMarginAfterDiscount = grandTotal - totalInternalCost;
                        const profitMarginAfterDiscount = grandTotal > 0 ? (negotiableMarginAfterDiscount / grandTotal) * 100 : 0;

                        // Get previous discount percentage for comparison
                        const prevDiscountPercentage = previousSnapshot?.discount_percentage || 0;
                        const discountChanged = previousSnapshot && hasChanged(overallDiscountPercentage, prevDiscountPercentage);

                        return (
                          <>
                            <div className="flex justify-between text-base font-medium">
                              <span className="text-gray-800">Client Cost {overallDiscount > 0 ? '(Before Discount)' : ''}:</span>
                              <span className="font-semibold">AED {subtotal.toFixed(2)}</span>
                            </div>
                            {overallDiscount > 0 && (
                              <>
                                <div className={`flex justify-between text-sm text-red-600 rounded px-2 py-1 ${discountChanged ? 'bg-yellow-200' : ''}`}>
                                  <span>Discount ({overallDiscountPercentage.toFixed(1)}%):</span>
                                  <span className="font-semibold">- AED {overallDiscount.toFixed(2)}</span>
                                </div>
                              </>
                            )}
                            <div className="flex justify-between pt-3 border-t-2 border-green-400 text-lg font-bold">
                              <span className="text-green-900">
                                Grand Total: <span className="text-xs font-normal text-gray-600">(Excluding VAT)</span>
                              </span>
                              <span className="text-green-700">AED {grandTotal.toFixed(2)}</span>
                            </div>

                            {/* Show discount impact on profitability */}
                            {overallDiscount > 0 && (
                              <div className="mt-4 pt-4 border-t border-green-300 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3">
                                <h6 className="text-xs font-bold text-gray-800 mb-3 flex items-center gap-2">
                                  📊 Discount Impact on Profitability
                                </h6>
                                <div className="space-y-2 text-xs">
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Client Cost:</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 line-through">
                                        AED {subtotal.toFixed(2)}
                                      </span>
                                      <span className="text-blue-700 font-bold">
                                        → AED {grandTotal.toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Internal Cost:</span>
                                    <span className="font-semibold text-red-600">
                                      AED {totalInternalCost.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                                    <span className="text-gray-700 font-medium">Total Margin:</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 line-through">
                                        AED {totalActualProfit.toFixed(2)}
                                      </span>
                                      <span className={`font-bold ${negotiableMarginAfterDiscount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                        → AED {negotiableMarginAfterDiscount.toFixed(2)}
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
                                      ⚠️
                                      <span className="text-xs">
                                        <strong>Warning:</strong> Profit margin is below recommended 15%. This discount significantly reduces profitability.
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Action Buttons - Different buttons for different roles */}
                {(() => {
                  // 🔥 Fix: Always use main BOQ status as primary source of truth
                  const boqStatus = selectedBoq?.status?.toLowerCase()?.replace(/_/g, '') || '';
                  // Use revision status only if specifically viewing a previous revision with a valid status_after
                  const revisionStatus = currentRevision?.status_after?.toLowerCase()?.replace(/_/g, '') || '';
                  const status = boqStatus; // Always use main BOQ status for button display logic
                  const isRejected = status === 'rejected';
                  const isClientRevisionRejected = status === 'clientrevisionrejected';
                  // 🔥 Fix: Include items_assigned, pmapproved as approved states (BOQ already approved and progressed)
                  const isApproved = status === 'approved' || status === 'revisionapproved' || status === 'itemsassigned' || status === 'pmapproved';
                  const isUnderRevision = status === 'underrevision';
                  const isSentForConfirmation = status === 'sentforconfirmation';
                  const isPendingTDApproval = status === 'pendingtdapproval';
                  const isPendingRevision = status === 'pendingrevision';
                  const isClientConfirmed = status === 'clientconfirmed';
                  const isInternalRevisionPending = status === 'internalrevisionpending';
                  const isClientPendingRevision = status === 'clientpendingrevision';
                  // Get the latest revision's action (first in the array since it's sorted by most recent)
                  const latestRevision = internalRevisions.length > 0 ? internalRevisions[0] : null;
                  const latestAction = latestRevision?.action_type;
                  const currentAction = currentRevision?.action_type;
                  const isPendingApproval = status === 'pendingapproval' || status === 'pending';
                  // 🔥 Fix: Check if the revision was sent to TD or is an internal revision edit
                  // INTERNAL_REVISION_EDIT means estimator saved/submitted the revision for TD review
                  const isSentToTD = latestAction === 'SENT_TO_TD' || currentAction === 'SENT_TO_TD';
                  const isInternalRevisionEdit = latestAction === 'INTERNAL_REVISION_EDIT' || currentAction === 'INTERNAL_REVISION_EDIT';
                  // TD can approve/reject if it's an internal revision edit (not already approved/rejected)
                  const tdCanApprove = isSentToTD || isInternalRevisionEdit;

                  // Statuses where buttons should be hidden (BOQ is in a final or processing state)
                  // Note: isClientRevisionRejected IS included here to hide buttons in Internal Revisions tab
                  // Note: isPendingRevision is EXCLUDED - TD needs to see Approve/Reject buttons for internal revisions
                  // Note: isUnderRevision is EXCLUDED - TD needs to see buttons for internal revisions under review
                  const isInFinalOrProcessingState = isApproved || isSentForConfirmation || isPendingTDApproval || isClientConfirmed || isClientRevisionRejected || isRejected;

                  // Technical Director (or Admin viewing as TD): Show Approve/Reject buttons when pending approval
                  const normalizedUserRole = userRole?.toLowerCase()?.trim() || '';
                  const isTDOrAdmin = normalizedUserRole === 'technical_director' ||
                                      normalizedUserRole === 'technical-director' ||
                                      normalizedUserRole === 'technicaldirector' ||
                                      normalizedUserRole === 'admin';

                  if (isTDOrAdmin) {
                    // 🔥 Fix: Under_Revision means estimator is revising - TD should wait
                    // Show "Under Revision" message, NOT approve/reject buttons
                    if (isUnderRevision) {
                      return (
                        <div className="mt-4 text-center py-3 bg-orange-50 border border-orange-200 rounded-lg">
                          <p className="text-sm font-medium text-orange-800">🔄 Under Revision - Waiting for Estimator to submit</p>
                        </div>
                      );
                    }

                    // Check if already approved by TD
                    const alreadyApproved = latestAction === 'TD_APPROVED';

                    // For Pending_Revision - show buttons (estimator submitted, waiting for TD approval)
                    if (isPendingRevision && !alreadyApproved) {
                      return (
                        <div className="mt-4 flex gap-2">
                          <button
                            className="flex-1 text-white text-sm h-10 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 px-4 font-semibold shadow-md bg-green-600"
                            onClick={() => setShowApprovalModal(true)}
                          >
                            <CheckCircle className="h-4 w-4" />
                            <span>Approve</span>
                          </button>
                          <button
                            className="flex-1 text-white text-sm h-10 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 px-4 font-semibold shadow-md bg-red-600"
                            onClick={() => setShowRejectionModal(true)}
                          >
                            <XCircle className="h-4 w-4" />
                            <span>Reject</span>
                          </button>
                        </div>
                      );
                    }

                    // For Internal_Revision_Pending - show buttons only if there's a revision edit
                    if (isInternalRevisionPending && tdCanApprove && !alreadyApproved) {
                      return (
                        <div className="mt-4 flex gap-2">
                          <button
                            className="flex-1 text-white text-sm h-10 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 px-4 font-semibold shadow-md bg-green-600"
                            onClick={() => setShowApprovalModal(true)}
                          >
                            <CheckCircle className="h-4 w-4" />
                            <span>Approve</span>
                          </button>
                          <button
                            className="flex-1 text-white text-sm h-10 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 px-4 font-semibold shadow-md bg-red-600"
                            onClick={() => setShowRejectionModal(true)}
                          >
                            <XCircle className="h-4 w-4" />
                            <span>Reject</span>
                          </button>
                        </div>
                      );
                    }

                    // If Internal_Revision_Pending but no revision edit yet - waiting for estimator
                    if (isInternalRevisionPending && !tdCanApprove) {
                      return (
                        <div className="mt-4 text-center py-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-sm font-medium text-yellow-800">📝 Pending Estimator Submission</p>
                        </div>
                      );
                    }

                    // Hide buttons if BOQ is already in a final/processing state (excluding Under_Revision which is handled above)
                    if (isInFinalOrProcessingState) {
                      if (isApproved) {
                        return (
                          <div className="mt-4 text-center py-3 bg-green-50 border border-green-200 rounded-lg">
                            <p className="text-sm font-medium text-green-800">✅ Already Approved</p>
                          </div>
                        );
                      }
                      if (isSentForConfirmation) {
                        return (
                          <div className="mt-4 text-center py-3 bg-purple-50 border border-purple-200 rounded-lg">
                            <p className="text-sm font-medium text-purple-800">📧 Sent to Client</p>
                          </div>
                        );
                      }
                      if (isClientConfirmed) {
                        return (
                          <div className="mt-4 text-center py-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm font-medium text-blue-800">✅ Confirmed by Client</p>
                          </div>
                        );
                      }
                    }

                    // Show Approve/Reject buttons only for pending approval (sent to TD for review)
                    // Note: isPendingRevision is already handled above - means waiting for client revision
                    // Note: isInternalRevisionPending is already handled above - means estimator saved but not sent
                    if (isPendingApproval && !isInFinalOrProcessingState) {
                      return (
                        <div className="mt-4 flex gap-2">
                          <button
                            className="flex-1 text-white text-sm h-10 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 px-4 font-semibold shadow-md bg-green-600"
                            onClick={() => setShowApprovalModal(true)}
                          >
                            <CheckCircle className="h-4 w-4" />
                            <span>Approve</span>
                          </button>
                          <button
                            className="flex-1 text-white text-sm h-10 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 px-4 font-semibold shadow-md bg-red-600"
                            onClick={() => setShowRejectionModal(true)}
                          >
                            <XCircle className="h-4 w-4" />
                            <span>Reject</span>
                          </button>
                        </div>
                      );
                    }

                    if (isRejected) {
                      return (
                        <div className="mt-4 text-center py-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm font-medium text-red-800">❌ Rejected - Waiting for Estimator to revise</p>
                        </div>
                      );
                    }

                    // Default: In progress
                    return (
                      <div className="mt-4 text-center py-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm font-medium text-blue-800">📝 In Progress - Not yet sent for approval</p>
                      </div>
                    );
                  }

                  // Estimator/Admin: Show Edit and Send to TD buttons
                  else {
                    // Show appropriate status messages for final/processing states
                    if (isClientConfirmed) {
                      return (
                        <div className="mt-4 text-center py-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm font-medium text-blue-800">✅ Confirmed by Client</p>
                        </div>
                      );
                    }

                    if (isSentForConfirmation) {
                      return (
                        <div className="mt-4 text-center py-3 bg-purple-50 border border-purple-200 rounded-lg">
                          <p className="text-sm font-medium text-purple-800">📧 Sent to Client - Waiting for confirmation</p>
                        </div>
                      );
                    }

                    if (isApproved) {
                      return (
                        <div className="mt-4 text-center py-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm font-medium text-green-800">✅ Approved by TD</p>
                        </div>
                      );
                    }

                    if (isPendingTDApproval) {
                      return (
                        <div className="mt-4 text-center py-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-sm font-medium text-yellow-800">⏳ Pending TD Approval</p>
                        </div>
                      );
                    }

                    if (isUnderRevision) {
                      return (
                        <div className="mt-4 text-center py-3 bg-orange-50 border border-orange-200 rounded-lg">
                          <p className="text-sm font-medium text-orange-800">🔄 Under Revision</p>
                        </div>
                      );
                    }

                    // Show message for client_revision_rejected
                    if (isClientRevisionRejected) {
                      return (
                        <div className="mt-4 text-center py-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm font-medium text-red-800">❌ Client Revision Rejected by TD - Use Client Revisions tab to revise</p>
                        </div>
                      );
                    }

                    // If sent to TD (actually sent, not just saved), hide buttons and show waiting message
                    // isPendingRevision means estimator sent revision to TD and TD hasn't responded yet
                    // Note: Internal_Revision_Pending is NOT included - it means saved but not yet sent
                    // Note: Client_Pending_Revision means client revision sent to TD - hide buttons
                    if (isSentToTD || isPendingApproval || isPendingRevision || isClientPendingRevision) {
                      return (
                        <div className="mt-4 text-center py-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-sm font-medium text-yellow-800">⏳ Sent to TD - Waiting for approval</p>
                        </div>
                      );
                    }

                    // Show buttons for: Rejected, Internal_Revision_Pending, or other editable states
                    // Internal_Revision_Pending means BOQ was edited and saved but NOT yet sent to TD
                    // Exclude isPendingRevision and isClientPendingRevision - already sent to TD, waiting for approval (no buttons)
                    if (isRejected || isInternalRevisionPending || (!isSentToTD && !isPendingApproval && !isPendingRevision && !isClientPendingRevision && !isInFinalOrProcessingState)) {
                      return (
                        <div className="space-y-2 mt-4">
                          <div className="flex gap-2">
                            <button
                              className="flex-1 text-white text-sm h-10 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 px-4 font-semibold shadow-md"
                              style={{ backgroundColor: 'rgb(34, 197, 94)' }}
                              onClick={() => handleEditBOQ(selectedBoq)}
                            >
                              <Edit className="h-4 w-4" />
                              <span>{isRejected ? 'Edit Again' : 'Edit BOQ'}</span>
                            </button>
                            <button
                              className="flex-1 text-red-900 text-sm h-10 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 px-4 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 shadow-md font-semibold"
                              onClick={() => handleSendToTD(selectedBoq)}
                              disabled={isSendingToTD}
                              title="Send revised BOQ to Technical Director for approval"
                            >
                              <Mail className="h-4 w-4" />
                              <span>{isSendingToTD ? 'Sending...' : 'Send to TD'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    }
                  }

                  return null;
                })()}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">No data available</div>
            )}
          </motion.div>

          {/* RIGHT SIDE: Previous Internal Revisions */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 border-b border-purple-200">
              <h3 className="text-lg font-bold text-purple-900">📝 Previous Internal Revisions</h3>
              <p className="text-sm text-purple-700">Click to view details</p>
            </div>

            {/* Content */}
            {isLoadingRevisions ? (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <ModernLoadingSpinners size="md" />
                <p className="mt-4 text-gray-600">Loading revisions...</p>
              </div>
            ) : internalRevisions.length > 0 ? (
              <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                {/* Show Original BOQ first if it exists */}
                {originalBOQ && originalBOQ.boq_details && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border-2 border-blue-300 rounded-lg overflow-hidden"
                  >
                    {/* Header for Original BOQ */}
                    <div className="p-3 border-b bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">📄</span>
                          <div>
                            <div className="font-bold text-sm text-blue-900">Original BOQ</div>
                            <div className="text-xs text-blue-600">Before estimator edits</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-blue-900">
                            {formatCurrency(originalBOQ.boq_details.total_cost || calculateGrandTotal(originalBOQ.boq_details))}
                          </div>
                          <div className="text-xs text-blue-600">
                            {originalBOQ.boq_details.items?.length || 0} items
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Details for Original BOQ */}
                    {expandedRevisionIndices.has(-1) && originalBOQ.boq_details.items && (
                      <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto bg-gradient-to-br from-blue-50 to-blue-100">
                        <div className="text-xs text-blue-700 mb-2">
                          <div className="flex justify-between mb-1">
                            <span>Status: Before Estimator Edits</span>
                            {originalBOQ.boq_details.discount_percentage > 0 && (
                              <span>Overall Discount: {originalBOQ.boq_details.discount_percentage}%</span>
                            )}
                          </div>
                        </div>

                        {/* Preliminaries Section - Shown FIRST (Original BOQ) */}
                        {originalBOQ.boq_details?.preliminaries && (
                          <div className="mb-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border-2 border-purple-200 shadow-lg">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="p-2 bg-white rounded-lg shadow-sm">
                                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="text-lg font-bold text-purple-900">📋 Preliminaries & Approval Works</h3>
                                <p className="text-sm text-purple-700">Selected conditions and terms</p>
                              </div>
                            </div>

                            {(() => {
                              const prelimData = originalBOQ.boq_details.preliminaries;
                              const items = prelimData.items || [];
                              const costDetails = prelimData.cost_details || {};
                              const amount = costDetails.amount || 0;
                              const miscPct = costDetails.misc_percentage || 10;
                              const overheadPct = costDetails.overhead_profit_percentage || 25;
                              const transportPct = costDetails.transport_percentage || 5;

                              return (
                                <>
                                  {/* Selected Items */}
                                  {items.length > 0 && (
                                    <div className="mb-4 bg-white rounded-lg p-4 border border-purple-200">
                                      <h5 className="text-sm font-semibold text-gray-900 mb-3">Selected Items:</h5>
                                      <div className="space-y-2">
                                        {items
                                          .filter((item: any) => item.checked || item.selected)
                                          .map((item: any, idx: number) => (
                                          <div key={idx} className="flex items-start gap-2">
                                            <span className="text-green-600 font-bold mt-0.5">✓</span>
                                            <div className="flex-1">
                                              <p className="text-sm text-gray-800">{item.description}</p>
                                              {item.custom_item && (
                                                <span className="inline-block mt-1 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                                  Custom Item
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Cost Summary */}
                                  <div className="mb-4 bg-white rounded-lg p-4 border border-purple-200">
                                    <h5 className="text-sm font-semibold text-gray-900 mb-3">Cost Summary</h5>
                                    <div className="grid grid-cols-4 gap-4">
                                      <div>
                                        <p className="text-xs text-gray-600 mb-1">Quantity</p>
                                        <p className="text-sm font-semibold text-gray-900">{costDetails.quantity || 1}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-600 mb-1">Unit</p>
                                        <p className="text-sm font-semibold text-gray-900">{costDetails.unit || 'lot'}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-600 mb-1">Rate (AED)</p>
                                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(costDetails.rate || 0)}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-600 mb-1">Amount (AED)</p>
                                        <p className="text-sm font-bold text-purple-900">{formatCurrency(amount)}</p>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Internal Cost Summary */}
                                  {costDetails.internal_cost !== undefined && (
                                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                                      <h5 className="text-sm font-semibold text-gray-900 mb-3">Internal Cost Summary</h5>
                                      {(() => {
                                        const internalCostBase = costDetails.internal_cost || 0;
                                        const miscAmount = (amount * miscPct) / 100;
                                        const overheadAmount = (amount * overheadPct) / 100;
                                        const transportAmount = (amount * transportPct) / 100;
                                        const totalInternalCost = internalCostBase + miscAmount + overheadAmount + transportAmount;

                                        return (
                                          <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                              <span className="text-gray-700">Base Internal Cost:</span>
                                              <span className="font-semibold text-gray-900">{formatCurrency(internalCostBase)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span className="text-gray-700">Miscellaneous ({miscPct}%):</span>
                                              <span className="font-semibold text-gray-900">{formatCurrency(miscAmount)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span className="text-gray-700">Overhead & Profit ({overheadPct}%):</span>
                                              <span className="font-semibold text-gray-900">{formatCurrency(overheadAmount)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span className="text-gray-700">Transport ({transportPct}%):</span>
                                              <span className="font-semibold text-gray-900">{formatCurrency(transportAmount)}</span>
                                            </div>
                                            <div className="flex justify-between pt-2 border-t-2 border-blue-300">
                                              <span className="text-gray-900 font-bold">Total Internal Cost:</span>
                                              <span className="font-bold text-red-600">{formatCurrency(totalInternalCost)}</span>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}

                        {/* 🔥 Terms & Conditions - From current BOQ data */}
                        {selectedBoq?.terms_conditions && selectedBoq.terms_conditions.items && selectedBoq.terms_conditions.items.filter(t => t.checked).length > 0 && (
                          <div className="mb-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-5 border-2 border-indigo-300 shadow-lg">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="p-2 bg-white rounded-lg shadow-sm">
                                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="text-lg font-bold text-indigo-900">📝 Terms & Conditions</h3>
                                <p className="text-sm text-indigo-700">{selectedBoq.terms_conditions.items.filter(t => t.checked).length} terms selected</p>
                              </div>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-indigo-200 max-h-48 overflow-y-auto">
                              <div className="space-y-2">
                                {selectedBoq.terms_conditions.items
                                  .filter(term => term.checked)
                                  .map((term, idx) => (
                                    <div key={term.id || idx} className="flex items-start gap-2 p-2 hover:bg-indigo-50 rounded-lg transition-colors border-b border-gray-100 last:border-0">
                                      <span className="text-green-600 font-bold mt-0.5 flex-shrink-0">✓</span>
                                      <div className="flex-1">
                                        <p className="text-xs text-gray-800 leading-relaxed">{term.terms_text}</p>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {renderBOQItemsComparison(originalBOQ.boq_details, null)}
                        {renderGrandTotalSection(originalBOQ.boq_details)}
                      </div>
                    )}

                    {/* Action Button - Show/Hide Details */}
                    <div className="p-2 bg-blue-50 border-t border-blue-200">
                      <button
                        onClick={() => toggleRevisionExpansion(-1)}
                        className="w-full text-xs px-3 py-2 bg-white border border-blue-300 rounded hover:bg-blue-100 transition-colors font-medium text-blue-900"
                      >
                        {expandedRevisionIndices.has(-1) ? '▲ Hide Details' : '▼ Show Details'}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Show all previous internal revisions (excluding the current one at index 0) */}
                {(() => {
                  const prevRevisions = internalRevisions.slice(1).reverse();
                  return prevRevisions;
                })().map((revision, displayIndex) => {
                  const actualIndex = displayIndex + 1; // Index in expandedRevisionIndices
                  const revisionTotal = revision.changes_summary ? calculateTotalFromSnapshot(revision.changes_summary) : 0;
                  const isExpanded = expandedRevisionIndices.has(actualIndex);
                  const change = calculateChange(currentTotal, revisionTotal);

                  // Find the revision that came BEFORE this one (by internal_revision_number)
                  const currentRevNum = revision.internal_revision_number;
                  const previousRevisionForComparison = currentRevNum > 0
                    ? internalRevisions.find(r => r.internal_revision_number === currentRevNum - 1)?.changes_summary ||
                      originalBOQ?.boq_details || null
                    : null; // Original BOQ has nothing before it

                  return (
                    <motion.div
                      key={revision.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: displayIndex * 0.05 }}
                      className="bg-white border border-gray-200 rounded-lg overflow-hidden"
                    >
                      {/* Header - Always visible */}
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-3 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getActionIcon(revision.action_type)}
                            <div>
                              <div className="font-bold text-gray-900 text-sm">
                                Internal Rev {revision.internal_revision_number}
                              </div>
                              <div className="text-xs text-gray-500">
                                {getActionLabel(revision.action_type)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-gray-900">
                              {formatCurrency(revisionTotal)}
                            </div>
                            {change.percentage !== 0 && (
                              <div className={`flex items-center gap-1 text-xs font-semibold ${
                                change.percentage > 0 ? 'text-red-600' : 'text-green-600'
                              }`}>
                                {change.percentage > 0 ? (
                                  <TrendingUp className="w-3 h-3" />
                                ) : (
                                  <TrendingDown className="w-3 h-3" />
                                )}
                                {change.percentage > 0 ? '+' : ''}{change.percentage}%
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expandable Details */}
                      {isExpanded && revision.changes_summary?.items && (
                        <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 space-y-3 max-h-[500px] overflow-y-auto">
                          <div className="text-xs text-gray-600 mb-2">
                            <div className="flex justify-between mb-1">
                              <span>By: {revision.actor_name} ({revision.actor_role})</span>
                              <span>{new Date(revision.created_at).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}</span>
                            </div>
                          </div>

                          {/* Preliminaries Section - Shown FIRST (Previous Revision) */}
                          {revision.changes_summary?.preliminaries && (
                            <div className="mb-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border-2 border-purple-200 shadow-lg">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-white rounded-lg shadow-sm">
                                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold text-purple-900">📋 Preliminaries & Approval Works</h3>
                                  <p className="text-sm text-purple-700">Selected conditions and terms</p>
                                </div>
                              </div>

                              {(() => {
                                const prelimData = revision.changes_summary.preliminaries;
                                const items = prelimData.items || [];
                                const costDetails = prelimData.cost_details || {};
                                const amount = costDetails.amount || 0;
                                const miscPct = costDetails.misc_percentage || 10;
                                const overheadPct = costDetails.overhead_profit_percentage || 25;
                                const transportPct = costDetails.transport_percentage || 5;

                                return (
                                  <>
                                    {/* Selected Items */}
                                    {items.length > 0 && (
                                      <div className="mb-4 bg-white rounded-lg p-4 border border-purple-200">
                                        <h5 className="text-sm font-semibold text-gray-900 mb-3">Selected Items:</h5>
                                        <div className="space-y-2">
                                          {items
                                            .filter((item: any) => item.checked || item.selected)
                                            .map((item: any, idx: number) => (
                                            <div key={idx} className="flex items-start gap-2">
                                              <span className="text-green-600 font-bold mt-0.5">✓</span>
                                              <div className="flex-1">
                                                <p className="text-sm text-gray-800">{item.description}</p>
                                                {item.custom_item && (
                                                  <span className="inline-block mt-1 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                                    Custom Item
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Cost Summary */}
                                    <div className="mb-4 bg-white rounded-lg p-4 border border-purple-200">
                                      <h5 className="text-sm font-semibold text-gray-900 mb-3">Cost Summary</h5>
                                      <div className="grid grid-cols-4 gap-4">
                                        <div>
                                          <p className="text-xs text-gray-600 mb-1">Quantity</p>
                                          <p className="text-sm font-semibold text-gray-900">{costDetails.quantity || 1}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-gray-600 mb-1">Unit</p>
                                          <p className="text-sm font-semibold text-gray-900">{costDetails.unit || 'lot'}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-gray-600 mb-1">Rate (AED)</p>
                                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(costDetails.rate || 0)}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-gray-600 mb-1">Amount (AED)</p>
                                          <p className="text-sm font-bold text-purple-900">{formatCurrency(amount)}</p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Internal Cost Summary */}
                                    {costDetails.internal_cost !== undefined && (
                                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                                        <h5 className="text-sm font-semibold text-gray-900 mb-3">Internal Cost Summary</h5>
                                        {(() => {
                                          const internalCostBase = costDetails.internal_cost || 0;
                                          const miscAmount = (amount * miscPct) / 100;
                                          const overheadAmount = (amount * overheadPct) / 100;
                                          const transportAmount = (amount * transportPct) / 100;
                                          const totalInternalCost = internalCostBase + miscAmount + overheadAmount + transportAmount;

                                          return (
                                            <div className="space-y-2 text-sm">
                                              <div className="flex justify-between">
                                                <span className="text-gray-700">Base Internal Cost:</span>
                                                <span className="font-semibold text-gray-900">{formatCurrency(internalCostBase)}</span>
                                              </div>
                                              <div className="flex justify-between">
                                                <span className="text-gray-700">Miscellaneous ({miscPct}%):</span>
                                                <span className="font-semibold text-gray-900">{formatCurrency(miscAmount)}</span>
                                              </div>
                                              <div className="flex justify-between">
                                                <span className="text-gray-700">Overhead & Profit ({overheadPct}%):</span>
                                                <span className="font-semibold text-gray-900">{formatCurrency(overheadAmount)}</span>
                                              </div>
                                              <div className="flex justify-between">
                                                <span className="text-gray-700">Transport ({transportPct}%):</span>
                                                <span className="font-semibold text-gray-900">{formatCurrency(transportAmount)}</span>
                                              </div>
                                              <div className="flex justify-between pt-2 border-t-2 border-blue-300">
                                                <span className="text-gray-900 font-bold">Total Internal Cost:</span>
                                                <span className="font-bold text-red-600">{formatCurrency(totalInternalCost)}</span>
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          {/* 🔥 Terms & Conditions - From current BOQ data */}
                          {selectedBoq?.terms_conditions && selectedBoq.terms_conditions.items && selectedBoq.terms_conditions.items.filter(t => t.checked).length > 0 && (
                            <div className="mb-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-5 border-2 border-indigo-300 shadow-lg">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-white rounded-lg shadow-sm">
                                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold text-indigo-900">📝 Terms & Conditions</h3>
                                  <p className="text-sm text-indigo-700">{selectedBoq.terms_conditions.items.filter(t => t.checked).length} terms selected</p>
                                </div>
                              </div>
                              <div className="bg-white rounded-lg p-4 border border-indigo-200 max-h-48 overflow-y-auto">
                                <div className="space-y-2">
                                  {selectedBoq.terms_conditions.items
                                    .filter(term => term.checked)
                                    .map((term, idx) => (
                                      <div key={term.id || idx} className="flex items-start gap-2 p-2 hover:bg-indigo-50 rounded-lg transition-colors border-b border-gray-100 last:border-0">
                                        <span className="text-green-600 font-bold mt-0.5 flex-shrink-0">✓</span>
                                        <div className="flex-1">
                                          <p className="text-xs text-gray-800 leading-relaxed">{term.terms_text}</p>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {renderBOQItemsComparison(revision.changes_summary, previousRevisionForComparison)}
                          {renderGrandTotalSection(revision.changes_summary)}
                        </div>
                      )}

                      {/* Action Button - Show/Hide Details */}
                      <div className="p-2 bg-gray-50 border-t border-gray-200">
                        <button
                          onClick={() => toggleRevisionExpansion(actualIndex)}
                          className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded hover:bg-gray-100 transition-colors font-medium"
                        >
                          {isExpanded ? '▲ Hide Details' : '▼ Show Details'}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="font-medium">No previous internal revisions</p>
                <p className="text-sm mt-1">This is the first internal revision</p>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* No Data State */}
      {selectedBoq && internalRevisions.length === 0 && !isLoadingRevisions && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-12 text-center">
          <Clock className="h-16 w-16 mx-auto mb-4 text-gray-400" />
          <p className="font-medium text-gray-700 text-lg">No internal revision history</p>
          <p className="text-sm mt-2 text-gray-600">
            Internal changes will appear here once tracking begins
          </p>
        </div>
      )}

      {/* BOQ Edit Modal - Using Latest BOQCreationForm */}
      {editingBOQ && (
        <BOQCreationForm
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingBOQ(null);
          }}
          editMode={true}
          existingBoqData={editingBOQ}
          isInternalRevisionMode={true}
          onSubmit={async (boqId) => {
            showSuccess('BOQ updated successfully!');
            setShowEditModal(false);
            setEditingBOQ(null);

            // Reload the internal revisions to show the new changes
            if (selectedBoq) {
              await loadInternalRevisions(selectedBoq.boq_id);
              await loadBOQsWithInternalRevisions();

              // Refresh selectedBoq to get latest status
              const response = await fetch(`${API_URL}/boqs/internal_revisions`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
              });
              const data = await response.json();
              if (data.success) {
                const updatedBoq = data.data.find((b: BOQWithInternalRevisions) => b.boq_id === selectedBoq.boq_id);
                if (updatedBoq) {
                  setSelectedBoq(updatedBoq);
                }
              }
            }

            // 🔥 Show popup asking to send or send later
            setEditedBOQId(selectedBoq?.boq_id || null);
            setShowSendPopupAfterEdit(true);
          }}
        />
      )}

      {/* TD Approval Modal */}
      {showApprovalModal && selectedBoq && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-md max-w-lg w-full"
          >
            <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-green-200">
              <h2 className="text-xl font-bold text-green-900">Approve BOQ</h2>
              <p className="text-sm text-green-700 mt-1">{selectedBoq.boq_name}</p>
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
                  placeholder="Add any notes or requirements..."
                />
              </div>

              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowApprovalModal(false);
                    setApprovalNotes('');
                  }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  disabled={isProcessing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleApproveBOQ}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  disabled={isProcessing}
                >
                  <CheckCircle className="w-5 h-5" />
                  {isProcessing ? 'Approving...' : 'Approve BOQ'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* TD Rejection Modal */}
      {showRejectionModal && selectedBoq && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-md max-w-lg w-full"
          >
            <div className="bg-gradient-to-r from-red-50 to-red-100 px-6 py-4 border-b border-red-200">
              <h2 className="text-xl font-bold text-red-900">Reject BOQ</h2>
              <p className="text-sm text-red-700 mt-1">{selectedBoq.boq_name}</p>
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

              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowRejectionModal(false);
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  disabled={isProcessing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectBOQ}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  disabled={isProcessing}
                >
                  <XCircle className="w-5 h-5" />
                  {isProcessing ? 'Rejecting...' : 'Reject BOQ'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* 🔥 Send Popup After Edit (Like Reject Tab) */}
      {showSendPopupAfterEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
          >
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 rounded-t-2xl">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Mail className="w-6 h-6" />
                Send Revised BOQ to TD?
              </h2>
              <p className="text-sm text-blue-100 mt-1">Your changes have been saved successfully</p>
            </div>

            <div className="p-6">
              <p className="text-gray-700 mb-6">
                Would you like to send this revised BOQ to the Technical Director now, or send it later?
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={async () => {
                    if (selectedBoq) {
                      setShowSendPopupAfterEdit(false);
                      await handleSendToTD(selectedBoq);
                    }
                  }}
                  className="w-full px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  <Mail className="w-5 h-5" />
                  Send to TD Now
                </button>

                <button
                  onClick={() => {
                    setShowSendPopupAfterEdit(false);
                    setEditedBOQId(null);
                    showSuccess('BOQ saved! You can send it to TD later.');
                  }}
                  className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Send Later
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (2,510 lines)
export default React.memo(InternalRevisionTimeline);
