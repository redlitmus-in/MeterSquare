import React, { useState, useEffect } from 'react';
import { Search, Send, FileText, Package, CheckCircle, TruckIcon, Calendar, RefreshCw, AlertCircle, X, AlertTriangle, BoxIcon } from 'lucide-react';
import { inventoryService, InternalMaterialRequest, InventoryMaterial } from '../services/inventoryService';
import { toast } from 'sonner';

interface AvailabilityInfo {
  available: boolean;
  current_stock: number;
  requested_quantity: number;
  material_code?: string;
  material_name?: string;
  unit?: string;
  shortage?: number;
}

const DispatchMaterials: React.FC = () => {
  const [allRequests, setAllRequests] = useState<InternalMaterialRequest[]>([]);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dispatching, setDispatching] = useState<number | null>(null);

  // Approval Modal State
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<InternalMaterialRequest | null>(null);
  const [availabilityInfo, setAvailabilityInfo] = useState<AvailabilityInfo | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [requestsData, materialsData] = await Promise.all([
        inventoryService.getAllInternalRequests(),
        inventoryService.getAllInventoryItems()
      ]);
      setAllRequests(requestsData || []);
      setMaterials(materialsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  // Find matching material in inventory
  const findMatchingMaterial = (request: InternalMaterialRequest): InventoryMaterial | undefined => {
    // First try by inventory_material_id if set
    if (request.inventory_material_id) {
      return materials.find(m => m.inventory_material_id === request.inventory_material_id);
    }

    // Try exact match by name, brand, size
    const exactMatch = materials.find(m =>
      m.material_name?.toLowerCase() === request.material_name?.toLowerCase() &&
      (!request.brand || m.brand?.toLowerCase() === request.brand?.toLowerCase()) &&
      (!request.size || m.size?.toLowerCase() === request.size?.toLowerCase())
    );
    if (exactMatch) return exactMatch;

    // Fallback to name-only match
    return materials.find(m =>
      m.material_name?.toLowerCase() === request.material_name?.toLowerCase()
    );
  };

  // Get availability status for a request
  const getAvailabilityStatus = (request: InternalMaterialRequest) => {
    const material = findMatchingMaterial(request);
    if (!material) {
      return { status: 'not-found', text: 'Not in inventory', class: 'text-gray-500 bg-gray-100' };
    }

    const currentStock = material.current_stock || 0;
    const requestedQty = request.quantity || 0;

    if (currentStock >= requestedQty) {
      return {
        status: 'available',
        text: `In Stock: ${currentStock} ${material.unit}`,
        class: 'text-green-700 bg-green-100',
        material
      };
    } else if (currentStock > 0) {
      return {
        status: 'partial',
        text: `Partial: ${currentStock}/${requestedQty} ${material.unit}`,
        class: 'text-orange-700 bg-orange-100',
        material
      };
    } else {
      return {
        status: 'out-of-stock',
        text: 'Out of Stock',
        class: 'text-red-700 bg-red-100',
        material
      };
    }
  };

  // Get status counts
  const statusCounts = {
    all: allRequests.length,
    PENDING: allRequests.filter(r => r.status === 'PENDING').length,
    APPROVED: allRequests.filter(r => r.status === 'APPROVED').length,
    DISPATCHED: allRequests.filter(r => r.status === 'DISPATCHED').length,
    FULFILLED: allRequests.filter(r => r.status === 'FULFILLED').length,
    REJECTED: allRequests.filter(r => r.status === 'REJECTED').length
  };

  // Filter requests
  const filteredRequests = (statusFilter === 'all' ? allRequests : allRequests.filter(r => r.status === statusFilter))
    .filter(req => {
      const materialName = req.material_name || '';
      const requestNumber = req.request_number?.toString() || '';
      return (
        materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        requestNumber.includes(searchTerm)
      );
    });

  // Get status badge
  const getStatusBadge = (status?: string) => {
    const badges: Record<string, { text: string; class: string }> = {
      'PENDING': { text: 'Pending', class: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
      'APPROVED': { text: 'Approved', class: 'bg-blue-100 text-blue-800 border-blue-200' },
      'DISPATCHED': { text: 'Dispatched', class: 'bg-purple-100 text-purple-800 border-purple-200' },
      'FULFILLED': { text: 'Fulfilled', class: 'bg-green-100 text-green-800 border-green-200' },
      'REJECTED': { text: 'Rejected', class: 'bg-red-100 text-red-800 border-red-200' },
      'PROCUREMENT_INITIATED': { text: 'Procurement', class: 'bg-orange-100 text-orange-800 border-orange-200' }
    };

    const badge = badges[status || 'PENDING'] || badges['PENDING'];

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.class}`}>
        {badge.text}
      </span>
    );
  };

  // Open approval modal and check availability
  const openApprovalModal = async (request: InternalMaterialRequest) => {
    setSelectedRequest(request);
    setShowApprovalModal(true);
    setCheckingAvailability(true);
    setAvailabilityInfo(null);

    try {
      // Check availability via API
      const availability = await inventoryService.checkAvailability(request.request_id!);
      setAvailabilityInfo(availability);
      if (availability.inventory_material_id) {
        setSelectedMaterialId(availability.inventory_material_id);
      }
    } catch (error) {
      // Fallback to local check
      const material = findMatchingMaterial(request);
      if (material) {
        const currentStock = material.current_stock || 0;
        const requestedQty = request.quantity || 0;
        setAvailabilityInfo({
          available: currentStock >= requestedQty,
          current_stock: currentStock,
          requested_quantity: requestedQty,
          material_code: material.material_code,
          material_name: material.material_name,
          unit: material.unit,
          shortage: currentStock < requestedQty ? requestedQty - currentStock : 0
        });
        setSelectedMaterialId(material.inventory_material_id || null);
      } else {
        setAvailabilityInfo({
          available: false,
          current_stock: 0,
          requested_quantity: request.quantity || 0,
          material_name: request.material_name,
          shortage: request.quantity || 0
        });
      }
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;

    setDispatching(selectedRequest.request_id!);
    try {
      await inventoryService.approveInternalRequest(selectedRequest.request_id!, {
        inventory_material_id: selectedMaterialId
      });
      toast.success('Request approved successfully! Stock has been allocated.');
      setShowApprovalModal(false);
      setSelectedRequest(null);
      fetchData();
    } catch (error: any) {
      console.error('Error approving request:', error);
      toast.error(error.message || 'Failed to approve request');
    } finally {
      setDispatching(null);
    }
  };

  const handleDispatch = async (requestId: number) => {
    if (!confirm('Are you sure you want to dispatch this material?')) return;

    setDispatching(requestId);
    try {
      await inventoryService.dispatchMaterial(requestId);
      toast.success('Material dispatched successfully!');
      fetchData();
    } catch (error: any) {
      console.error('Error dispatching material:', error);
      toast.error(error.message || 'Failed to dispatch material');
    } finally {
      setDispatching(null);
    }
  };

  const handleFulfill = async (requestId: number) => {
    if (!confirm('Confirm that the material has been delivered and received?')) return;

    setDispatching(requestId);
    try {
      await inventoryService.issueMaterial(requestId);
      toast.success('Material delivery confirmed!');
      fetchData();
    } catch (error: any) {
      console.error('Error fulfilling request:', error);
      toast.error(error.message || 'Failed to confirm delivery');
    } finally {
      setDispatching(null);
    }
  };

  const handleReject = async (requestId: number) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    setDispatching(requestId);
    try {
      await inventoryService.rejectInternalRequest(requestId, reason);
      toast.success('Request rejected');
      fetchData();
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      toast.error(error.message || 'Failed to reject request');
    } finally {
      setDispatching(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dispatch requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Material Dispatch</h1>
              <p className="mt-1 text-sm text-gray-500">
                Process and track material dispatch requests from projects
              </p>
            </div>
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Total</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{statusCounts.all}</p>
              </div>
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-yellow-600 uppercase">Pending</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{statusCounts.PENDING}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-yellow-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-600 uppercase">Approved</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{statusCounts.APPROVED}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-purple-600 uppercase">Dispatched</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{statusCounts.DISPATCHED}</p>
              </div>
              <TruckIcon className="w-8 h-8 text-purple-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-green-600 uppercase">Fulfilled</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{statusCounts.FULFILLED}</p>
              </div>
              <Package className="w-8 h-8 text-green-500" />
            </div>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-1 mb-6 flex flex-wrap gap-1">
          {(['all', 'PENDING', 'APPROVED', 'DISPATCHED', 'FULFILLED', 'REJECTED'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`flex-1 min-w-[100px] px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-purple-100 text-purple-800'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
              {status !== 'all' && ` (${statusCounts[status]})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by material name or request number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
        </div>

        {/* Request List */}
        <div className="space-y-4">
          {filteredRequests.length > 0 ? (
            filteredRequests.map((request) => {
              const availability = getAvailabilityStatus(request);

              return (
                <div key={request.request_id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            Request #{request.request_number || request.request_id}
                          </h3>
                          {getStatusBadge(request.status)}
                          {request.status === 'PENDING' && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${availability.class}`}>
                              <BoxIcon className="w-3 h-3 mr-1" />
                              {availability.text}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Material</p>
                            <p className="font-medium text-gray-900">{request.material_name}</p>
                            {request.brand && <p className="text-xs text-gray-500">Brand: {request.brand}</p>}
                            {request.size && <p className="text-xs text-gray-500">Size: {request.size}</p>}
                          </div>
                          <div>
                            <p className="text-gray-500">Requested Qty</p>
                            <p className="font-bold text-lg text-gray-900">{request.quantity}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Request Date</p>
                            <div className="flex items-center gap-1 font-medium text-gray-900">
                              <Calendar className="w-4 h-4" />
                              {request.created_at ? new Date(request.created_at).toLocaleDateString() : '-'}
                            </div>
                          </div>
                          {availability.material && (
                            <div>
                              <p className="text-gray-500">Available Stock</p>
                              <p className={`font-bold text-lg ${
                                availability.status === 'available' ? 'text-green-600' :
                                availability.status === 'partial' ? 'text-orange-600' : 'text-red-600'
                              }`}>
                                {availability.material.current_stock} {availability.material.unit}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    {request.notes && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Notes:</span> {request.notes}
                        </p>
                      </div>
                    )}

                    {/* Rejection reason */}
                    {request.status === 'REJECTED' && request.rejection_reason && (
                      <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-100">
                        <p className="text-sm text-red-700">
                          <span className="font-medium">Rejection Reason:</span> {request.rejection_reason}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                      {request.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => handleReject(request.request_id!)}
                            disabled={dispatching === request.request_id}
                            className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => openApprovalModal(request)}
                            disabled={dispatching === request.request_id}
                            className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Review & Approve
                          </button>
                        </>
                      )}

                      {request.status === 'APPROVED' && (
                        <button
                          onClick={() => handleDispatch(request.request_id!)}
                          disabled={dispatching === request.request_id}
                          className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {dispatching === request.request_id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          Dispatch Material
                        </button>
                      )}

                      {request.status === 'DISPATCHED' && (
                        <>
                          <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg">
                            <TruckIcon className="w-4 h-4" />
                            In Transit
                          </span>
                          <button
                            onClick={() => handleFulfill(request.request_id!)}
                            disabled={dispatching === request.request_id}
                            className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {dispatching === request.request_id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                            Confirm Delivery
                          </button>
                        </>
                      )}

                      {request.status === 'FULFILLED' && (
                        <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg">
                          <CheckCircle className="w-4 h-4" />
                          Completed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No requests found</h3>
              <p className="text-sm text-gray-500">
                {searchTerm || statusFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'No material dispatch requests available'}
              </p>
            </div>
          )}
        </div>

        {/* Results Count */}
        {filteredRequests.length > 0 && (
          <div className="mt-6 text-sm text-gray-600 text-center">
            Showing {filteredRequests.length} of {allRequests.length} requests
          </div>
        )}
      </div>

      {/* Approval Modal */}
      {showApprovalModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Review & Approve Request</h2>
                <button
                  onClick={() => {
                    setShowApprovalModal(false);
                    setSelectedRequest(null);
                    setAvailabilityInfo(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Request Details */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Request Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Request #</p>
                    <p className="font-medium">{selectedRequest.request_number || selectedRequest.request_id}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Material</p>
                    <p className="font-medium">{selectedRequest.material_name}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Requested Quantity</p>
                    <p className="font-bold text-lg">{selectedRequest.quantity}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Brand / Size</p>
                    <p className="font-medium">
                      {selectedRequest.brand || '-'} / {selectedRequest.size || '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Availability Check */}
              <div className={`rounded-lg p-4 border-2 ${
                checkingAvailability ? 'bg-gray-50 border-gray-200' :
                availabilityInfo?.available ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
              }`}>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Stock Availability
                </h3>

                {checkingAvailability ? (
                  <div className="flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 animate-spin text-gray-500" />
                    <span className="text-gray-600">Checking inventory...</span>
                  </div>
                ) : availabilityInfo ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Current Stock</p>
                        <p className={`font-bold text-xl ${availabilityInfo.available ? 'text-green-600' : 'text-orange-600'}`}>
                          {availabilityInfo.current_stock} {availabilityInfo.unit || ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">After Approval</p>
                        <p className="font-bold text-xl text-gray-900">
                          {Math.max(0, availabilityInfo.current_stock - availabilityInfo.requested_quantity)} {availabilityInfo.unit || ''}
                        </p>
                      </div>
                    </div>

                    {availabilityInfo.available ? (
                      <div className="flex items-center gap-2 text-green-700 bg-green-100 px-3 py-2 rounded-lg">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">Sufficient stock available</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-orange-700 bg-orange-100 px-3 py-2 rounded-lg">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="font-medium">
                          Shortage of {availabilityInfo.shortage} units
                        </span>
                      </div>
                    )}

                    {availabilityInfo.material_code && (
                      <p className="text-xs text-gray-500">
                        Linked to: {availabilityInfo.material_code} - {availabilityInfo.material_name}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-5 h-5" />
                    <span>Material not found in inventory</span>
                  </div>
                )}
              </div>

              {/* Warning for insufficient stock */}
              {availabilityInfo && !availabilityInfo.available && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-yellow-800">Insufficient Stock Warning</h4>
                      <p className="text-sm text-yellow-700 mt-1">
                        Approving this request will result in negative stock or partial fulfillment.
                        Consider rejecting or initiating procurement first.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowApprovalModal(false);
                  setSelectedRequest(null);
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(selectedRequest.request_id!)}
                disabled={dispatching === selectedRequest.request_id}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={dispatching === selectedRequest.request_id || checkingAvailability}
                className={`inline-flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                  availabilityInfo?.available
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-orange-600 hover:bg-orange-700 text-white'
                }`}
              >
                {dispatching === selectedRequest.request_id ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {availabilityInfo?.available ? 'Approve & Allocate Stock' : 'Approve Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(DispatchMaterials);
