/**
 * Shared Purchase List View Component
 * Reusable table component for displaying purchases across different role hubs
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Package,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Eye,
  History,
  ArrowRightLeft,
  Calendar
} from 'lucide-react';

// Generic purchase interface that can accommodate different role-specific purchase types
interface BasePurchase {
  purchase_id: number;
  purpose: string;
  site_location: string;
  total_quantity?: number;
  total_cost?: number;
  created_at?: string;
  date?: string;
  materials_summary?: {
    total_materials?: number;
    total_quantity?: number;
    total_cost?: number;
  };
  // Role-specific status fields
  pm_status?: string;
  project_manager_status?: string;
  estimation_status?: string;
  technical_director_status?: string;
  accounts_status?: string;
  procurement_status?: string;
  current_workflow_status?: string;
  latest_status?: {
    status?: string;
    sender?: string;
  };
}

interface PurchaseListViewProps<T extends BasePurchase> {
  purchases: T[];
  activeTab: string;
  onViewDetails: (id: number) => void;
  onViewHistory: (id: number) => void;
  // Optional action handlers - different roles may have different actions
  onApprove?: (id: number) => void;
  onReject?: (id: number, reason?: string) => void;
  onProcess?: (id: number) => void; // For accounts processing
  onAcknowledge?: (id: number) => void; // For accounts acknowledgement
  onViewTransactionDetails?: (id: number) => void; // For viewing transaction details
  onSendToEstimation?: (id: number) => void; // For PM resending to estimation
  // Processing states
  processingPurchases?: {
    approving?: Set<number>;
    rejecting?: Set<number>;
    processing?: Set<number>;
    acknowledging?: Set<number>;
    resending?: Set<number>;
  };
  // Role-specific configuration
  roleConfig?: {
    role: 'projectManager' | 'estimation' | 'technicalDirector' | 'accounts' | 'procurement';
    statusField: string; // Which status field to use for this role
    showActions?: boolean; // Whether to show action buttons
    actionType?: 'approve-reject' | 'process' | 'acknowledge' | 'resend';
  };
}

export function PurchaseListView<T extends BasePurchase>({
  purchases,
  activeTab,
  onViewDetails,
  onViewHistory,
  onApprove,
  onReject,
  onProcess,
  onAcknowledge,
  onViewTransactionDetails,
  onSendToEstimation,
  processingPurchases = {},
  roleConfig
}: PurchaseListViewProps<T>) {

  const getStatusBadge = (purchase: T) => {
    let status = 'pending';

    // Get status based on role configuration
    if (roleConfig?.statusField) {
      status = (purchase as any)[roleConfig.statusField] || purchase.current_workflow_status || 'pending';
    } else {
      // Fallback to general status detection
      status = purchase.current_workflow_status || purchase.latest_status?.status || 'pending';
    }

    const statusColors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      completed: 'bg-blue-100 text-blue-800',
      processing: 'bg-blue-100 text-blue-800',
      processed: 'bg-green-100 text-green-800',
      acknowledged: 'bg-purple-100 text-purple-800'
    };
    return statusColors[status.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return `AED ${amount.toLocaleString()}`;
  };

  const handleQuickReject = (id: number) => {
    if (onReject) {
      onReject(id, 'Quick rejection from list view');
    }
  };

  const renderActionButtons = (purchase: T) => {
    if (!roleConfig?.showActions) return null;

    const isProcessing = (action: string) => {
      const processingSet = (processingPurchases as any)[action];
      return processingSet && processingSet.has(purchase.purchase_id);
    };

    switch (roleConfig.actionType) {
      case 'approve-reject':
        if (activeTab === 'pending' && onApprove && onReject) {
          return (
            <>
              <Button
                size="sm"
                onClick={() => onApprove(purchase.purchase_id)}
                disabled={isProcessing('approving')}
                className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700"
              >
                {isProcessing('approving') ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle className="h-3 w-3" />
                )}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleQuickReject(purchase.purchase_id)}
                disabled={isProcessing('rejecting')}
                className="h-8 px-3 text-xs"
              >
                {isProcessing('rejecting') ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <XCircle className="h-3 w-3" />
                )}
              </Button>
            </>
          );
        }
        break;

      case 'process':
        if (activeTab === 'processing' && onProcess) {
          return (
            <Button
              size="sm"
              onClick={() => onProcess(purchase.purchase_id)}
              disabled={isProcessing('processing')}
              className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
            >
              {isProcessing('processing') ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                'Process'
              )}
            </Button>
          );
        }
        break;

      case 'acknowledge':
        if (activeTab === 'processed') {
          const hasAcknowledgement = (purchase as any).acknowledgement || (purchase as any).acknowledgement_sent;
          return (
            <>
              {onViewTransactionDetails && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onViewTransactionDetails(purchase.purchase_id)}
                  className="h-8 px-3 text-xs border-blue-600 text-blue-600 hover:bg-blue-50"
                >
                  <ArrowRightLeft className="h-3 w-3 mr-1" />
                  Transaction
                </Button>
              )}
              {onAcknowledge && (
                <Button
                  size="sm"
                  onClick={() => onAcknowledge(purchase.purchase_id)}
                  disabled={hasAcknowledgement || isProcessing('acknowledging')}
                  className={`h-8 px-3 text-xs ${
                    hasAcknowledgement
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  {isProcessing('acknowledging') ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : hasAcknowledgement ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Acknowledged
                    </>
                  ) : (
                    'Acknowledge'
                  )}
                </Button>
              )}
            </>
          );
        }
        break;

      case 'resend':
        if (activeTab === 'estimation_rejected' && onSendToEstimation) {
          return (
            <Button
              size="sm"
              onClick={() => onSendToEstimation(purchase.purchase_id)}
              disabled={isProcessing('resending')}
              className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700"
            >
              {isProcessing('resending') ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                'Resend'
              )}
            </Button>
          );
        }
        break;
    }

    return null;
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="font-semibold">Purchase ID</TableHead>
            <TableHead className="font-semibold">Purpose</TableHead>
            <TableHead className="font-semibold">Location</TableHead>
            <TableHead className="font-semibold">Quantity</TableHead>
            <TableHead className="font-semibold">Total Cost</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold">Date</TableHead>
            <TableHead className="font-semibold text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchases.map((purchase) => (
            <TableRow
              key={purchase.purchase_id}
              className="hover:bg-gray-50 transition-colors"
            >
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  PR #{purchase.purchase_id}
                </div>
              </TableCell>
              <TableCell>
                <div className="max-w-xs">
                  <p className="text-sm font-medium truncate">{purchase.purpose}</p>
                  {purchase.materials_summary?.total_materials && purchase.materials_summary.total_materials > 0 && (
                    <p className="text-xs text-gray-500">
                      {purchase.materials_summary.total_materials} materials
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm">{purchase.site_location}</span>
              </TableCell>
              <TableCell>
                <span className="text-sm font-medium">
                  {purchase.total_quantity?.toLocaleString() || 0}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm font-medium">
                  {formatCurrency(purchase.total_cost || 0)}
                </span>
              </TableCell>
              <TableCell>
                <Badge
                  className={`${getStatusBadge(purchase)} text-xs`}
                  variant="secondary"
                >
                  {(() => {
                    let status = 'pending';
                    if (roleConfig?.statusField) {
                      status = (purchase as any)[roleConfig.statusField] || purchase.current_workflow_status || 'pending';
                    } else {
                      status = purchase.current_workflow_status || purchase.latest_status?.status || 'pending';
                    }
                    return status.charAt(0).toUpperCase() + status.slice(1);
                  })()}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-sm text-gray-600">
                  {formatDate(purchase.created_at || purchase.date || '')}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onViewDetails(purchase.purchase_id)}
                    className="h-8 px-2 text-xs"
                    title="View Details"
                  >
                    <FileText className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onViewHistory(purchase.purchase_id)}
                    className="h-8 px-2 text-xs"
                    title="View History"
                  >
                    <Clock className="h-3 w-3" />
                  </Button>

                  {/* Role-specific action buttons */}
                  {renderActionButtons(purchase)}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default PurchaseListView;