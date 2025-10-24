import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Search,
  ShoppingCart,
  CheckCircle,
  Clock,
  Building2,
  MapPin,
  FileText,
  Package,
  Calendar,
  Eye,
  Check,
  DollarSign,
  LayoutGrid,
  Table as TableIcon,
  Store,
  Edit
} from 'lucide-react';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { formatCurrency } from '@/utils/formatters';
import { useAutoSync } from '@/hooks/useAutoSync';
import { buyerService, Purchase, PurchaseListResponse } from '../services/buyerService';
import PurchaseDetailsModal from '../components/PurchaseDetailsModal';
import VendorSelectionModal from '../components/VendorSelectionModal';

const PurchaseOrders: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ongoing' | 'pending_approval' | 'completed'>('ongoing');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isVendorSelectionModalOpen, setIsVendorSelectionModalOpen] = useState(false);
  const [completingPurchaseId, setCompletingPurchaseId] = useState<number | null>(null);

  // Fetch pending purchases
  const { data: pendingData, isLoading: isPendingLoading, refetch: refetchPending } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-pending-purchases'],
    fetchFn: () => buyerService.getPendingPurchases(),
    staleTime: 30000,
    refetchInterval: 30000,
  });

  // Fetch completed purchases
  const { data: completedData, isLoading: isCompletedLoading, refetch: refetchCompleted } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-completed-purchases'],
    fetchFn: () => buyerService.getCompletedPurchases(),
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const pendingPurchases: Purchase[] = useMemo(() => {
    return (pendingData?.pending_purchases || []).map(p => ({ ...p, status: 'pending' as const }));
  }, [pendingData]);

  const completedPurchases: Purchase[] = useMemo(() => {
    return (completedData?.completed_purchases || []).map(p => ({ ...p, status: 'completed' as const }));
  }, [completedData]);

  // Separate ongoing and pending approval purchases
  const ongoingPurchases = useMemo(() => {
    return pendingPurchases.filter(p => !p.vendor_selection_pending_td_approval);
  }, [pendingPurchases]);

  const pendingApprovalPurchases = useMemo(() => {
    return pendingPurchases.filter(p => p.vendor_selection_pending_td_approval);
  }, [pendingPurchases]);

  const currentPurchases =
    activeTab === 'ongoing' ? ongoingPurchases :
    activeTab === 'pending_approval' ? pendingApprovalPurchases :
    completedPurchases;

  const filteredPurchases = useMemo(() => {
    return currentPurchases.filter(purchase => {
      const matchesSearch =
        purchase.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        purchase.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        purchase.item_name.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesSearch;
    });
  }, [currentPurchases, searchTerm]);

  const stats = useMemo(() => ({
    ongoing: ongoingPurchases.length,
    pendingApproval: pendingApprovalPurchases.length,
    completed: completedPurchases.length,
  }), [ongoingPurchases, pendingApprovalPurchases, completedPurchases]);

  const handleViewDetails = (purchase: Purchase, openInEditMode: boolean = false) => {
    setSelectedPurchase(purchase);
    setIsDetailsModalOpen(true);
    // Store edit mode preference
    if (openInEditMode) {
      sessionStorage.setItem('purchaseEditMode', 'true');
    } else {
      sessionStorage.removeItem('purchaseEditMode');
    }
  };

  const handleEditPurchase = (purchase: Purchase) => {
    handleViewDetails(purchase, true);
  };

  const handleSelectVendor = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setIsVendorSelectionModalOpen(true);
  };

  const handleMarkAsComplete = async (crId: number) => {
    try {
      setCompletingPurchaseId(crId);
      await buyerService.completePurchase({ cr_id: crId });

      toast.success('Purchase marked as complete successfully!');

      // Refetch both lists
      refetchPending();
      refetchCompleted();
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete purchase');
    } finally {
      setCompletingPurchaseId(null);
    }
  };

  const isLoading = isPendingLoading || isCompletedLoading;

  if (isLoading && currentPurchases.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse" color="purple" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm mb-8">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-purple-500">
                <ShoppingCart className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Approved extra materials and change requests
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Total Purchases</div>
              <div className="text-2xl font-bold text-purple-600">{stats.ongoing + stats.pendingApproval + stats.completed}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Search Bar with Controls */}
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 max-w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by project, client, or item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-gray-200 focus:border-gray-300 focus:ring-0 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('card')}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-all ${
                  viewMode === 'card'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Card view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Table view"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tab Toggle Buttons */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('ongoing')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  activeTab === 'ongoing'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Clock className="w-3 h-3 inline mr-1" />
                Ongoing ({stats.ongoing})
              </button>
              <button
                onClick={() => setActiveTab('pending_approval')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  activeTab === 'pending_approval'
                    ? 'bg-orange-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Store className="w-3 h-3 inline mr-1" />
                Pending Approval ({stats.pendingApproval})
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  activeTab === 'completed'
                    ? 'bg-green-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <CheckCircle className="w-3 h-3 inline mr-1" />
                Completed ({stats.completed})
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {filteredPurchases.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg border border-purple-100 p-12 text-center">
              <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">
                No {activeTab === 'ongoing' ? 'ongoing' : activeTab === 'pending_approval' ? 'pending approval' : 'completed'} purchases found
              </p>
            </div>
          ) : viewMode === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPurchases.map((purchase) => (
                <motion.div
                  key={purchase.cr_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col ${
                    purchase.status === 'completed'
                      ? 'border-green-200'
                      : purchase.vendor_selection_pending_td_approval
                        ? 'border-orange-200'
                        : 'border-purple-200'
                  }`}
                >
                  {/* Card Header */}
                  <div className={`px-4 py-3 border-b ${
                    purchase.status === 'completed'
                      ? 'bg-gradient-to-r from-green-50 to-green-100 border-green-200'
                      : purchase.vendor_selection_pending_td_approval
                        ? 'bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200'
                        : 'bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200'
                  }`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-bold text-gray-900 line-clamp-1">{purchase.project_name}</h3>
                      <Badge className={`${
                        purchase.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : purchase.vendor_selection_pending_td_approval
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-purple-100 text-purple-800'
                      } text-xs whitespace-nowrap`}>
                        CR #{purchase.cr_id}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{purchase.client}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{purchase.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{purchase.boq_name}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="space-y-3 mb-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-0.5">Item</div>
                        <div className="font-medium text-gray-900 text-sm line-clamp-1">{purchase.item_name}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Created</div>
                          <div className="text-xs flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(purchase.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Materials</div>
                          <div className="text-sm font-medium flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {purchase.materials_count} items
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-1.5 mt-auto">
                      {/* Pending Approval Status */}
                      {purchase.vendor_selection_pending_td_approval && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-1">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-orange-600" />
                            <div>
                              <div className="text-xs font-semibold text-orange-900">Vendor Selection Pending</div>
                              <div className="text-xs text-orange-700">Waiting for TD approval</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* First Row: Select Vendor - Only show if no vendor selected and not pending approval */}
                      {purchase.status === 'pending' && !purchase.vendor_id && !purchase.vendor_selection_pending_td_approval && (
                        <Button
                          onClick={() => handleSelectVendor(purchase)}
                          size="sm"
                          className="w-full h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1"
                        >
                          <Store className="w-3 h-3 mr-1" />
                          Select Vendor
                        </Button>
                      )}

                      {/* Second Row: View and Edit */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button
                          onClick={() => handleViewDetails(purchase, false)}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-gray-300 hover:bg-gray-50 px-2 py-1"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                        <Button
                          onClick={() => handleEditPurchase(purchase)}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-gray-300 hover:bg-gray-50 px-2 py-1"
                          disabled={purchase.status === 'completed' || purchase.vendor_selection_pending_td_approval}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      </div>

                      {/* Third Row: Mark as Complete - Only for ongoing, not pending approval */}
                      {purchase.status === 'pending' && !purchase.vendor_selection_pending_td_approval && (
                        <Button
                          onClick={() => handleMarkAsComplete(purchase.cr_id)}
                          disabled={completingPurchaseId === purchase.cr_id}
                          size="sm"
                          className="w-full h-7 text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1"
                        >
                          {completingPurchaseId === purchase.cr_id ? (
                            <>
                              <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Completing...
                            </>
                          ) : (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Mark as Complete
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">CR #</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Project</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden md:table-cell">Client</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden lg:table-cell">Location</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Item</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden sm:table-cell">Materials</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden xl:table-cell">Total Cost</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden lg:table-cell">Created</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredPurchases.map((purchase) => (
                      <motion.tr
                        key={purchase.cr_id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`hover:bg-gray-50 transition-colors ${
                          purchase.status === 'completed'
                            ? 'bg-green-50/30'
                            : purchase.vendor_selection_pending_td_approval
                              ? 'bg-orange-50/30'
                              : ''
                        }`}
                      >
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Badge className={`${
                            purchase.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : purchase.vendor_selection_pending_td_approval
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-purple-100 text-purple-800'
                          } text-xs`}>
                            #{purchase.cr_id}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-gray-900 max-w-[200px] truncate">{purchase.project_name}</div>
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          <div className="text-gray-600 max-w-[150px] truncate">{purchase.client}</div>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <div className="text-gray-600 max-w-[150px] truncate">{purchase.location}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-gray-900 max-w-[180px] truncate">{purchase.item_name}</div>
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          <div className="flex items-center gap-1 text-gray-600">
                            <Package className="w-3.5 h-3.5" />
                            {purchase.materials_count}
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden xl:table-cell">
                          <div className="font-medium text-gray-900">{formatCurrency(purchase.total_cost)}</div>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <div className="text-xs text-gray-600">
                            {new Date(purchase.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              onClick={() => handleViewDetails(purchase)}
                              variant="outline"
                              size="sm"
                              className="px-2 py-1 h-auto text-xs border-gray-300"
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              <span className="hidden sm:inline">View</span>
                            </Button>
                            {purchase.status === 'pending' && (
                              <Button
                                onClick={() => handleMarkAsComplete(purchase.cr_id)}
                                disabled={completingPurchaseId === purchase.cr_id}
                                size="sm"
                                className="px-2 py-1 h-auto text-xs bg-green-600 hover:bg-green-700 text-white"
                              >
                                {completingPurchaseId === purchase.cr_id ? (
                                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <Check className="w-3 h-3 sm:mr-1" />
                                    <span className="hidden sm:inline">Complete</span>
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Purchase Details Modal */}
      {selectedPurchase && (
        <PurchaseDetailsModal
          purchase={selectedPurchase}
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedPurchase(null);
          }}
          onVendorSelected={() => {
            refetchPending();
            refetchCompleted();
          }}
        />
      )}

      {/* Vendor Selection Modal */}
      {selectedPurchase && (
        <VendorSelectionModal
          purchase={selectedPurchase}
          isOpen={isVendorSelectionModalOpen}
          onClose={() => {
            setIsVendorSelectionModalOpen(false);
            setSelectedPurchase(null);
          }}
          onVendorSelected={() => {
            refetchPending();
            refetchCompleted();
          }}
        />
      )}
    </div>
  );
};

export default PurchaseOrders;
