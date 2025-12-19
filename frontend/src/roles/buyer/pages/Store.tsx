import React, { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Package, X, SendHorizontal, ClipboardList, RefreshCw } from 'lucide-react';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { formatCurrency } from '@/utils/formatters';
import { useAutoSync } from '@/hooks/useAutoSync';
import { storeService, StoreItem } from '../services/storeService';
import { apiClient } from '@/api/config';
import { API_BASE_URL } from '@/api/config';
import { STALE_TIMES } from '@/lib/constants';

// Use centralized API URL from config
const API_URL = API_BASE_URL;

interface MaterialRequest {
  request_id: number;
  inventory_material_id: number;
  material_name: string;
  quantity: number;
  brand?: string;
  size?: string;
  notes?: string | null;
  status: string;
  created_at: string;
  approved_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  project_details?: {
    project_name: string;
    project_code: string;
  };
}

interface Project {
  project_id: number;
  project_name: string;
  cr_id: number;
  quantity: number;
  unit: string;
  cr_status: string;
  has_active_request?: boolean;
  active_request_status?: string;
}

const Store: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'store' | 'requests'>('store');
  const [requestFilter, setRequestFilter] = useState<'ongoing' | 'completed'>('ongoing');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  const [requestQuantity, setRequestQuantity] = useState<number>(1);
  const [requestNotes, setRequestNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [myRequests, setMyRequests] = useState<MaterialRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Fetch store items from backend
  const { data: storeItems, isLoading } = useAutoSync<StoreItem[]>({
    queryKey: ['buyer-store-items'],
    fetchFn: () => storeService.getStoreItems(),
    realtimeTables: ['inventory_materials'],
    staleTime: STALE_TIMES.STANDARD, // 30 seconds from constants
  });

  // Fetch my requests
  const fetchMyRequests = async () => {
    setIsLoadingRequests(true);
    try {
      const response = await apiClient.get(`/internal_material_requests`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      // Ensure we always have an array
      const data = response.data;
      if (Array.isArray(data)) {
        setMyRequests(data);
      } else if (data && Array.isArray(data.requests)) {
        setMyRequests(data.requests);
      } else {
        setMyRequests([]);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
      setMyRequests([]);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  // Fetch projects for a specific material
  const fetchProjectsForMaterial = async (materialId: number) => {
    setIsLoadingProjects(true);
    try {
      const response = await apiClient.get(`/buyer/store/projects-by-material/${materialId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      const data = response.data;
      const projectsList = Array.isArray(data) ? data : [];
      setProjects(projectsList);
      // Auto-select first project that doesn't have an active request
      const availableProject = projectsList.find((p: Project) => !p.has_active_request);
      if (availableProject) {
        setSelectedProjectId(availableProject.project_id);
        setRequestQuantity(availableProject.quantity || 1);
      } else {
        setSelectedProjectId(null);
        setRequestQuantity(1);
      }
    } catch (error) {
      console.error('Error fetching projects for material:', error);
      setProjects([]);
      setSelectedProjectId(null);
      setRequestQuantity(1);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Load requests when tab changes to requests
  useEffect(() => {
    if (activeTab === 'requests') {
      fetchMyRequests();
    }
  }, [activeTab]);

  // Get unique categories
  const categories = useMemo(() => {
    if (!storeItems) return ['all'];
    const uniqueCategories = [...new Set(storeItems.map(item => item.category))];
    return ['all', ...uniqueCategories];
  }, [storeItems]);

  // Filter items based on search and category
  const filteredItems = useMemo(() => {
    if (!storeItems) return [];

    return storeItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [storeItems, searchTerm, selectedCategory]);

  // Open request modal
  const openRequestModal = (item: StoreItem) => {
    setSelectedItem(item);
    setRequestQuantity(1);
    setRequestNotes('');
    setProjects([]);
    setSelectedProjectId(null);
    setIsRequestModalOpen(true);
    // Fetch projects that have this material
    fetchProjectsForMaterial(item.id);
  };

  // Submit material request
  const submitRequest = async () => {
    if (!selectedItem || requestQuantity <= 0) {
      showError('Please enter a valid quantity');
      return;
    }

    if (!selectedProjectId) {
      showError('Please select a project');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiClient.post(
        `/internal_material_request`,
        {
          inventory_material_id: selectedItem.id,
          material_name: selectedItem.name,
          quantity: requestQuantity,
          unit: projects.find(p => p.project_id === selectedProjectId)?.unit || selectedItem.unit,
          notes: requestNotes,
          project_id: selectedProjectId,
          cr_id: projects.find(p => p.project_id === selectedProjectId)?.cr_id,
          request_type: 'buyer_request'
        },
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data) {
        showSuccess(`Request submitted for ${requestQuantity} ${selectedItem.unit} of ${selectedItem.name}`);
        setIsRequestModalOpen(false);
        setSelectedItem(null);
        // Switch to requests tab to show the new request
        setActiveTab('requests');
      }
    } catch (error: any) {
      console.error('Error submitting request:', error);
      showError(error.response?.data?.error || 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get status badge variant
  const getStatusBadge = (status: string) => {
    const upperStatus = status?.toUpperCase() || '';
    switch (upperStatus) {
      case 'APPROVED':
        return <Badge className="bg-blue-500 hover:bg-blue-600">APPROVED</Badge>;
      case 'DISPATCHED':
      case 'DN_CREATED':
      case 'IN_TRANSIT':
        return <Badge className="bg-orange-500 hover:bg-orange-600">{upperStatus === 'DN_CREATED' ? 'DN CREATED' : upperStatus === 'IN_TRANSIT' ? 'IN TRANSIT' : 'DISPATCHED'}</Badge>;
      case 'FULFILLED':
      case 'DELIVERED':
        return <Badge className="bg-green-500 hover:bg-green-600">COMPLETED</Badge>;
      case 'REJECTED':
        return <Badge variant="destructive">REJECTED</Badge>;
      case 'PENDING':
      case 'SEND_REQUEST':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">PENDING</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 rounded-lg p-6 mb-6 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <Package className="w-6 h-6 text-[#243d8a]" />
          <h1 className="text-2xl font-bold text-[#243d8a]">Store</h1>
        </div>
        <p className="text-gray-600">Browse available materials from M2 Store inventory</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={activeTab === 'store' ? 'default' : 'outline'}
          onClick={() => setActiveTab('store')}
          className={activeTab === 'store' ? 'bg-[#243d8a] hover:bg-[#1a2d66]' : ''}
        >
          <Package className="h-4 w-4 mr-2" />
          Store Items
        </Button>
        <Button
          variant={activeTab === 'requests' ? 'default' : 'outline'}
          onClick={() => setActiveTab('requests')}
          className={activeTab === 'requests' ? 'bg-[#243d8a] hover:bg-[#1a2d66]' : ''}
        >
          <ClipboardList className="h-4 w-4 mr-2" />
          My Requests
          {Array.isArray(myRequests) && myRequests.filter(r => r.status?.toUpperCase() === 'PENDING').length > 0 && (
            <span className="ml-2 bg-yellow-500 text-white text-xs rounded-full px-2 py-0.5">
              {myRequests.filter(r => r.status?.toUpperCase() === 'PENDING').length}
            </span>
          )}
        </Button>
      </div>

      {/* Store Tab Content */}
      {activeTab === 'store' && (
        <>
          {/* Search and Filters */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search materials..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#243d8a]"
              >
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category === 'all' ? 'All Categories' : category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center items-center h-64">
              <ModernLoadingSpinners size="lg" />
            </div>
          )}

          {/* Store Table */}
          {!isLoading && (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#243d8a] text-white">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Material Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Description</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Category</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold">Unit Price</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Unit</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold">Available Stock</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold">Status</th>
                      {/* <th className="px-4 py-3 text-center text-sm font-semibold">Action</th> */}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredItems.map((item, index) => (
                      <tr
                        key={item.id}
                        className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">{item.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600 line-clamp-1">{item.description || '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{item.category || 'General'}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-[#243d8a]">{formatCurrency(item.price)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600">{item.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-medium">{item.available_quantity}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={item.available_quantity > 0 ? 'default' : 'destructive'}>
                            {item.available_quantity > 0 ? 'In Stock' : 'Out of Stock'}
                          </Badge>
                        </td>
                        {/* <td className="px-4 py-3 text-center">
                          <Button
                            size="sm"
                            onClick={() => openRequestModal(item)}
                            disabled={item.available_quantity === 0}
                            className="bg-[#243d8a] hover:bg-[#1a2d66]"
                          >
                            <SendHorizontal className="h-4 w-4 mr-1" />
                            Request
                          </Button>
                        </td> */}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredItems.length === 0 && (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No items found</h3>
                  <p className="text-gray-600">Try adjusting your search or filters</p>
                </div>
              )}
            </div>
          )}

          {!isLoading && filteredItems.length > 0 && (
            <div className="mt-4 text-sm text-gray-600">
              Showing {filteredItems.length} of {storeItems?.length || 0} materials
            </div>
          )}
        </>
      )}

      {/* My Requests Tab Content */}
      {activeTab === 'requests' && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">My Material Requests</h2>
            <div className="flex items-center gap-2">
              {/* Filter buttons */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setRequestFilter('ongoing')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    requestFilter === 'ongoing'
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Ongoing ({myRequests.filter(r => !['FULFILLED', 'DELIVERED', 'REJECTED'].includes(r.status?.toUpperCase() || '')).length})
                </button>
                <button
                  onClick={() => setRequestFilter('completed')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    requestFilter === 'completed'
                      ? 'bg-green-500 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Completed ({myRequests.filter(r => ['FULFILLED', 'DELIVERED'].includes(r.status?.toUpperCase() || '')).length})
                </button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchMyRequests}
                disabled={isLoadingRequests}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isLoadingRequests ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {isLoadingRequests ? (
            <div className="flex justify-center items-center h-64">
              <ModernLoadingSpinners size="lg" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#243d8a] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Request ID</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Material</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Quantity</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Project</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Notes</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Requested On</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {Array.isArray(myRequests) && myRequests
                    .filter(r => {
                      const status = r.status?.toUpperCase() || '';
                      if (requestFilter === 'completed') {
                        return ['FULFILLED', 'DELIVERED'].includes(status);
                      } else {
                        return !['FULFILLED', 'DELIVERED', 'REJECTED'].includes(status);
                      }
                    })
                    .map((request, index) => (
                    <tr
                      key={request.request_id}
                      className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-[#243d8a]">#{request.request_id}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{request.material_name}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold">{request.quantity}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{request.project_details?.project_name || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600 line-clamp-2" title={request.notes || ''}>
                          {request.notes && request.notes.trim() ? request.notes : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{formatDate(request.created_at)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getStatusBadge(request.status)}
                      </td>
                      <td className="px-4 py-3">
                        {request.status?.toUpperCase() === 'REJECTED' && request.rejection_reason ? (
                          <span className="text-sm text-red-600">{request.rejection_reason}</span>
                        ) : ['APPROVED', 'DISPATCHED'].includes(request.status?.toUpperCase()) && request.approved_at ? (
                          <span className="text-sm text-green-600">Approved on {formatDate(request.approved_at)}</span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(!Array.isArray(myRequests) || myRequests.filter(r => {
                const status = r.status?.toUpperCase() || '';
                if (requestFilter === 'completed') {
                  return ['FULFILLED', 'DELIVERED'].includes(status);
                } else {
                  return !['FULFILLED', 'DELIVERED', 'REJECTED'].includes(status);
                }
              }).length === 0) && (
                <div className="text-center py-12">
                  <ClipboardList className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {requestFilter === 'completed' ? 'No completed requests' : 'No ongoing requests'}
                  </h3>
                  <p className="text-gray-600">
                    {requestFilter === 'completed'
                      ? 'Completed requests will appear here when materials are delivered'
                      : 'Submit a material request from the Store tab'}
                  </p>
                  {requestFilter === 'ongoing' && (
                    <Button
                      className="mt-4 bg-[#243d8a] hover:bg-[#1a2d66]"
                      onClick={() => setActiveTab('store')}
                    >
                      Browse Store
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {!isLoadingRequests && Array.isArray(myRequests) && myRequests.length > 0 && (
            <div className="p-4 border-t text-sm text-gray-600">
              Total {myRequests.length} request(s) •
              <span className="text-yellow-600 ml-2">{myRequests.filter(r => ['PENDING', 'SEND_REQUEST'].includes(r.status?.toUpperCase() || '')).length} Pending</span> •
              <span className="text-blue-600 ml-2">{myRequests.filter(r => r.status?.toUpperCase() === 'APPROVED').length} Approved</span> •
              <span className="text-orange-600 ml-2">{myRequests.filter(r => ['DISPATCHED', 'DN_CREATED', 'IN_TRANSIT'].includes(r.status?.toUpperCase() || '')).length} In Transit</span> •
              <span className="text-green-600 ml-2">{myRequests.filter(r => ['FULFILLED', 'DELIVERED'].includes(r.status?.toUpperCase() || '')).length} Completed</span> •
              <span className="text-red-600 ml-2">{myRequests.filter(r => r.status?.toUpperCase() === 'REJECTED').length} Rejected</span>
            </div>
          )}
        </div>
      )}

      {/* Request Modal */}
      {isRequestModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold text-[#243d8a]">Request Material</h2>
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-900">{selectedItem.name}</p>
                <p className="text-sm text-gray-600">{selectedItem.description}</p>
                <div className="flex justify-between mt-2 text-sm">
                  <span className="text-gray-500">Available: {selectedItem.available_quantity} {selectedItem.unit}</span>
                  <span className="font-semibold text-[#243d8a]">{formatCurrency(selectedItem.price)}/{selectedItem.unit}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project <span className="text-red-500">*</span>
                </label>
                {isLoadingProjects ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                    Loading projects...
                  </div>
                ) : projects.length === 0 ? (
                  <div className="w-full px-3 py-2 border border-orange-300 rounded-lg bg-orange-50 text-orange-600 text-sm">
                    No projects found with this material in their BOQ
                  </div>
                ) : projects.every(p => p.has_active_request) ? (
                  <div className="w-full px-3 py-2 border border-orange-300 rounded-lg bg-orange-50 text-orange-600 text-sm">
                    All projects already have active requests for this material
                  </div>
                ) : (
                  <select
                    value={selectedProjectId || ''}
                    onChange={(e) => {
                      const projectId = Number(e.target.value);
                      const selectedProject = projects.find(p => p.project_id === projectId);
                      if (selectedProject && !selectedProject.has_active_request) {
                        setSelectedProjectId(projectId);
                        setRequestQuantity(selectedProject.quantity || 1);
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#243d8a]"
                    required
                  >
                    <option value="">Select a project</option>
                    {projects.map(project => (
                      <option
                        key={project.project_id}
                        value={project.project_id}
                        disabled={project.has_active_request}
                        className={project.has_active_request ? 'text-gray-400' : ''}
                      >
                        {project.project_name} {project.has_active_request ? `(Already requested - ${project.active_request_status})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity Required ({projects.find(p => p.project_id === selectedProjectId)?.unit || selectedItem.unit})
                </label>
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-700 font-medium">
                  {requestQuantity} {projects.find(p => p.project_id === selectedProjectId)?.unit || selectedItem.unit}
                  <span className="text-xs text-gray-500 ml-2">(From approved CR)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="Add any additional notes..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#243d8a] resize-none"
                  rows={3}
                />
              </div>

              <div className="bg-[#243d8a]/5 p-3 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Estimated Cost:</span>
                  <span className="text-xl font-bold text-[#243d8a]">
                    {formatCurrency(selectedItem.price * requestQuantity)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-4 border-t">
              <Button
                variant="outline"
                onClick={() => setIsRequestModalOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={submitRequest}
                disabled={isSubmitting || requestQuantity <= 0 || !selectedProjectId}
                className="flex-1 bg-[#243d8a] hover:bg-[#1a2d66]"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(Store);
