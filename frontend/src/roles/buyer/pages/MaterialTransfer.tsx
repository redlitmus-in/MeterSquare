import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Truck, SendHorizontal, ClipboardList, RefreshCw, Plus, Trash2, Download, Send, ChevronDown } from 'lucide-react';
import { showSuccess, showError, showWarning } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { apiClient } from '@/api/config';

// Common units for reference dropdown
const COMMON_UNITS = [
  'pcs', 'nos', 'kg', 'g', 'ton', 'mt',
  'm', 'cm', 'mm', 'ft', 'inch', 'rft', 'rm',
  'sqm', 'sqft', 'cum', 'cft', 'ltr', 'ml',
  'bags', 'boxes', 'rolls', 'bundles', 'drums', 'cartons',
  'sets', 'pairs', 'lot', 'ls', 'job'
];

interface ManualMaterial {
  id: string;
  inventory_material_id?: number;
  material_name: string;
  quantity: number;
  unit: string;
}

interface SiteEngineer {
  user_id: number;
  full_name: string;
  email: string;
  phone_number: string;
  project_count: number;
  display_label: string;
}

interface Project {
  project_id: number;
  project_name: string;
  project_code: string | null;
  location: string | null;
  area: string | null;
  display_label: string;
}

const MaterialTransfer: React.FC = () => {
  const [transferSubTab, setTransferSubTab] = useState<'create' | 'history'>('create');
  const [transferDestination, setTransferDestination] = useState<'site' | 'store'>('site');
  const [selectedSiteEngineer, setSelectedSiteEngineer] = useState<SiteEngineer | null>(null);
  const [siteEngineers, setSiteEngineers] = useState<SiteEngineer[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [inventoryMaterials, setInventoryMaterials] = useState<any[]>([]);
  const [manualMaterials, setManualMaterials] = useState<ManualMaterial[]>([
    { id: '1', material_name: '', quantity: 0, unit: 'pcs' }
  ]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverContact, setDriverContact] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferFee, setTransferFee] = useState<number>(0);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [transferHistory, setTransferHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(false);
  const [isLoadingSiteEngineers, setIsLoadingSiteEngineers] = useState(false);
  const [openUnitDropdown, setOpenUnitDropdown] = useState<string | null>(null);
  const unitDropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Dispatch Modal State
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [selectedDNForDispatch, setSelectedDNForDispatch] = useState<{ id: number; number: string } | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // Fetch Site Engineers
  const fetchSiteEngineers = async () => {
    setIsLoadingSiteEngineers(true);
    try {
      const response = await apiClient.get('/buyer/site-engineers', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      setSiteEngineers(response.data || []);
    } catch (error: any) {
      console.error('Error fetching site engineers:', error);
      if (error.response?.status === 401) {
        showError('Session expired. Please login again.');
      }
      setSiteEngineers([]);
    } finally {
      setIsLoadingSiteEngineers(false);
    }
  };

  // Fetch Projects for selected Site Engineer
  const fetchProjectsForSE = async (siteEngineerId: number) => {
    setIsLoadingProjects(true);
    setProjects([]);
    setSelectedProject(null);
    try {
      const response = await apiClient.get(`/buyer/site-engineers/${siteEngineerId}/projects`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      setProjects(response.data || []);
    } catch (error: any) {
      console.error('Error fetching projects:', error);
      if (error.response?.status === 401) {
        showError('Session expired. Please login again.');
      }
      setProjects([]);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Fetch inventory materials (M2 Store catalog)
  const fetchInventoryMaterials = async () => {
    setIsLoadingMaterials(true);
    try {
      const response = await apiClient.get('/buyer/store/items', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      setInventoryMaterials(response.data || []);
    } catch (error: any) {
      console.error('Error fetching inventory materials:', error);
      setInventoryMaterials([]);
    } finally {
      setIsLoadingMaterials(false);
    }
  };

  // Fetch transfer history
  const fetchTransferHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await apiClient.get('/buyer/transfer-history', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      setTransferHistory(response.data.transfers || []);
    } catch (error: any) {
      console.error('Error fetching transfer history:', error);
      if (error.response?.status === 401) {
        showError('Session expired. Please login again.');
      } else if (error.response?.status >= 500) {
        showError('Server error. Please try again later.');
      }
      setTransferHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Download DN PDF
  const handleDownloadDNPDF = async (dnId: number, dnNumber: string) => {
    try {
      const response = await apiClient.get(`/delivery_note/${dnId}/download`, {
        responseType: 'blob',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${dnNumber.replace(/\//g, '-')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showSuccess('DN PDF downloaded successfully!');
    } catch (error: any) {
      console.error('Error downloading DN PDF:', error);
      if (error.response?.status === 401) {
        showError('Session expired. Please login again.');
      } else {
        showError('Failed to download DN PDF');
      }
    }
  };

  // Open dispatch modal
  const openDispatchModal = (dnId: number, dnNumber: string) => {
    setSelectedDNForDispatch({ id: dnId, number: dnNumber });
    setShowDispatchModal(true);
  };

  // Dispatch DN (DRAFT → DISPATCHED)
  const confirmDispatchDN = async () => {
    if (!selectedDNForDispatch) return;

    setIsDispatching(true);
    try {
      const response = await apiClient.post(`/delivery_note/${selectedDNForDispatch.id}/dispatch`, {}, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });

      showSuccess(`${selectedDNForDispatch.number} dispatched successfully!`);
      setShowDispatchModal(false);
      setSelectedDNForDispatch(null);
      fetchTransferHistory(); // Refresh the list
    } catch (error: any) {
      console.error('Error dispatching DN:', error);
      if (error.response?.status === 401) {
        showError('Session expired. Please login again.');
      } else if (error.response?.status === 400) {
        showError(error.response.data.error || 'Cannot dispatch this delivery note');
      } else {
        showError('Failed to dispatch delivery note');
      }
    } finally {
      setIsDispatching(false);
    }
  };

  // Load data when component mounts or sub-tab changes
  useEffect(() => {
    if (transferSubTab === 'create') {
      fetchSiteEngineers();
      fetchInventoryMaterials();
    } else if (transferSubTab === 'history') {
      fetchTransferHistory();
    }
  }, [transferSubTab]);

  // Close unit dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openUnitDropdown) {
        const dropdownRef = unitDropdownRefs.current[openUnitDropdown];
        if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
          setOpenUnitDropdown(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openUnitDropdown]);

  // Get filtered units based on current input
  const getFilteredUnits = (currentValue: string) => {
    if (!currentValue.trim()) return COMMON_UNITS;
    const search = currentValue.toLowerCase();
    return COMMON_UNITS.filter(unit => unit.toLowerCase().includes(search));
  };

  // Add new material row
  // Generate unique material ID
  const generateMaterialId = (): string => {
    const maxId = manualMaterials.length > 0
      ? Math.max(...manualMaterials.map(m => parseInt(m.id) || 0))
      : 0;
    return (maxId + 1).toString();
  };

  // Add new material row
  const addMaterialRow = () => {
    const newMaterial: ManualMaterial = {
      id: generateMaterialId(),
      material_name: '',
      quantity: 0,
      unit: 'pcs'
    };
    setManualMaterials(prev => [...prev, newMaterial]);
  };

  // Remove material row by ID
  const removeMaterialRow = (id: string) => {
    if (manualMaterials.length === 1) {
      showWarning('At least one material row is required');
      return;
    }
    setManualMaterials(prev => prev.filter(m => m.id !== id));
  };

  // Update specific field in material row
  const updateMaterial = (id: string, field: keyof ManualMaterial, value: any) => {
    setManualMaterials(prev =>
      prev.map(material =>
        material.id === id ? { ...material, [field]: value } : material
      )
    );
  };

  // Handle material name change with inventory matching
  const handleMaterialNameChange = (id: string, value: string) => {
    updateMaterial(id, 'material_name', value);

    // Auto-match with inventory material
    if (value.trim()) {
      const matchedMaterial = inventoryMaterials.find(
        inv => inv.name?.toLowerCase() === value.toLowerCase()
      );

      if (matchedMaterial) {
        updateMaterial(id, 'inventory_material_id', matchedMaterial.id);
        updateMaterial(id, 'unit', matchedMaterial.unit || 'pcs');
      } else {
        updateMaterial(id, 'inventory_material_id', undefined);
      }
    }
  };

  // Submit material transfer
  const submitMaterialTransfer = async () => {
    // Validation
    if (transferDestination === 'site' && !selectedSiteEngineer) {
      showError('Please select a Site Engineer for site delivery');
      return;
    }

    if (transferDestination === 'site' && !selectedProject) {
      showError('Please select a Project for delivery');
      return;
    }

    const validMaterials = manualMaterials.filter(m => m.material_name.trim() && m.quantity > 0);
    if (validMaterials.length === 0) {
      showError('Please add at least one material with valid name and quantity');
      return;
    }

    setIsSubmittingTransfer(true);
    try {
      const payload: any = {
        destination_type: transferDestination,
        vehicle_number: vehicleNumber,
        driver_name: driverName,
        driver_contact: driverContact,
        transfer_date: new Date(transferDate).toISOString(),
        notes: transferNotes,
        transfer_fee: transferFee || 0
      };

      if (transferDestination === 'site') {
        payload.site_engineer_id = selectedSiteEngineer?.user_id;
        payload.project_id = selectedProject?.project_id;
      }

      payload.materials = manualMaterials
        .filter(m => m.material_name.trim() && m.quantity > 0)
        .map(m => ({
          inventory_material_id: m.inventory_material_id,
          material_name: m.material_name,
          quantity: m.quantity,
          unit: m.unit
        }));

      const response = await apiClient.post(
        '/buyer/material-transfer',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        showSuccess(`Material transfer created successfully! DN: ${response.data.delivery_note.delivery_note_number}`);
        // Reset form
        setSelectedSiteEngineer(null);
        setManualMaterials([{ id: '1', material_name: '', quantity: 0, unit: 'pcs' }]);
        setVehicleNumber('');
        setDriverName('');
        setDriverContact('');
        setTransferNotes('');
        setTransferFee(0);
        setTransferDate(new Date().toISOString().split('T')[0]);
        // Switch to history tab
        setTransferSubTab('history');
      }
    } catch (error: any) {
      console.error('Error submitting transfer:', error);
      showError(error.response?.data?.error || 'Failed to create material transfer');
    } finally {
      setIsSubmittingTransfer(false);
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
      <div className="bg-gradient-to-r from-orange-500/5 to-orange-500/10 rounded-lg p-6 mb-6 shadow-sm border border-orange-200">
        <div className="flex items-center gap-3 mb-2">
          <Truck className="w-6 h-6 text-orange-600" />
          <h1 className="text-2xl font-bold text-orange-900">Buyer Material Transfer</h1>
        </div>
        <p className="text-gray-700">Transfer materials from vendor to construction site or M2 Store warehouse</p>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {/* Sub-tabs */}
        <div className="flex gap-2 p-4 border-b bg-gray-50">
          <Button
            variant={transferSubTab === 'create' ? 'default' : 'outline'}
            onClick={() => setTransferSubTab('create')}
            className={transferSubTab === 'create' ? 'bg-[#243d8a] hover:bg-[#1a2d66]' : ''}
            size="sm"
          >
            <SendHorizontal className="h-4 w-4 mr-2" />
            Create Transfer
          </Button>
          <Button
            variant={transferSubTab === 'history' ? 'default' : 'outline'}
            onClick={() => setTransferSubTab('history')}
            className={transferSubTab === 'history' ? 'bg-[#243d8a] hover:bg-[#1a2d66]' : ''}
            size="sm"
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            Transfer History
          </Button>
        </div>

        {/* Create Transfer Sub-tab */}
        {transferSubTab === 'create' && (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Create Material Transfer</h3>
              <p className="text-sm text-gray-600">Transfer materials received from vendor directly to site or warehouse</p>
            </div>

            {/* Destination Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Transfer Destination *</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="site"
                    checked={transferDestination === 'site'}
                    onChange={() => setTransferDestination('site')}
                    className="w-4 h-4 text-[#243d8a] focus:ring-[#243d8a]"
                  />
                  <span className="text-sm font-medium">Construction Site (Direct)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="store"
                    checked={transferDestination === 'store'}
                    onChange={() => setTransferDestination('store')}
                    className="w-4 h-4 text-[#243d8a] focus:ring-[#243d8a]"
                  />
                  <span className="text-sm font-medium">M2 Store (Warehouse)</span>
                </label>
              </div>
              {transferDestination === 'store' && (
                <p className="text-xs text-blue-600 mt-1">
                  ℹ️ Materials will be added to M2 Store inventory. Production Manager will dispatch to site later.
                </p>
              )}
            </div>

            {/* Site Engineer Selection (only for site delivery) */}
            {transferDestination === 'site' && (
              <>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Select Site Engineer *</label>
                  {isLoadingSiteEngineers ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                      Loading site engineers...
                    </div>
                  ) : (
                    <select
                      value={selectedSiteEngineer?.user_id || ''}
                      onChange={(e) => {
                        const se = siteEngineers.find(s => s.user_id === Number(e.target.value));
                        setSelectedSiteEngineer(se || null);
                        setSelectedProject(null);
                        if (se) {
                          fetchProjectsForSE(se.user_id);
                        } else {
                          setProjects([]);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#243d8a]"
                    >
                      <option value="">-- Select a Site Engineer --</option>
                      {siteEngineers.map((se) => (
                        <option key={se.user_id} value={se.user_id}>
                          {se.display_label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Project Selection (after selecting Site Engineer) */}
                {selectedSiteEngineer && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Select Project *</label>
                    {isLoadingProjects ? (
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                        Loading projects...
                      </div>
                    ) : projects.length === 0 ? (
                      <div className="w-full px-3 py-2 border border-red-300 rounded-lg bg-red-50 text-red-600">
                        No projects assigned to this Site Engineer
                      </div>
                    ) : (
                      <select
                        value={selectedProject?.project_id || ''}
                        onChange={(e) => {
                          const proj = projects.find(p => p.project_id === Number(e.target.value));
                          setSelectedProject(proj || null);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#243d8a]"
                      >
                        <option value="">-- Select a Project --</option>
                        {projects.map((proj) => (
                          <option key={proj.project_id} value={proj.project_id}>
                            {proj.display_label}
                          </option>
                        ))}
                      </select>
                    )}

                    {selectedProject && (
                      <div className="bg-blue-50 p-4 rounded-lg mt-2">
                        <h4 className="font-medium text-gray-900">Delivery Details</h4>
                        <div className="mt-2 text-sm text-gray-600 space-y-1">
                          <p><strong>Site Engineer:</strong> {selectedSiteEngineer.full_name}</p>
                          <p><strong>Contact:</strong> {selectedSiteEngineer.phone_number || 'N/A'}</p>
                          <p><strong>Project:</strong> {selectedProject.project_name}</p>
                          {selectedProject.location && <p><strong>Location:</strong> {selectedProject.location}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Materials Section */}
            <div className="space-y-3">
              {/* Section Header */}
              <div className="flex justify-between items-center">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Materials *</label>
                  <p className="text-xs text-gray-500 mt-1">
                    Add materials to transfer. Type to match with inventory or enter custom material.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMaterialRow}
                  className="text-[#243d8a] hover:bg-blue-50"
                  disabled={isLoadingMaterials}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Material
                </Button>
              </div>

              {/* Materials Table */}
              <div className="border border-gray-200 rounded-lg shadow-sm overflow-visible">
                <table className="w-full table-fixed">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                    <tr>
                      <th className="w-[45%] px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Material Name
                      </th>
                      <th className="w-[20%] px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th className="w-[20%] px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Unit
                      </th>
                      <th className="w-[15%] px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {manualMaterials.map((material, index) => (
                      <tr
                        key={material.id}
                        className={`
                          transition-colors duration-150
                          ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                          hover:bg-blue-50/30
                        `}
                      >
                        {/* Material Name Input */}
                        <td className="px-4 py-3">
                          {isLoadingMaterials ? (
                            <div className="flex items-center space-x-2">
                              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                              <span className="text-sm text-gray-500">Loading materials...</span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Input
                                type="text"
                                placeholder="Type or select material name"
                                value={material.material_name}
                                onChange={(e) => handleMaterialNameChange(material.id, e.target.value)}
                                className="w-full border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                disabled={isLoadingMaterials}
                              />
                              {/* Inventory Status Badge (only for M2 Store transfers) */}
                              {transferDestination === 'store' && material.material_name.trim() && (
                                <div className="flex items-center gap-1">
                                  {material.inventory_material_id ? (
                                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                                      <span className="mr-1">✓</span> Exists in Store
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                                      <span className="mr-1">✦</span> New Material (will be created)
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Quantity Input */}
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={material.quantity || ''}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              updateMaterial(material.id, 'quantity', isNaN(value) ? 0 : value);
                            }}
                            className="w-full border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                            disabled={isLoadingMaterials}
                          />
                        </td>

                        {/* Unit Input with Dropdown */}
                        <td className="px-4 py-3">
                          <div
                            className="relative"
                            ref={(el) => { unitDropdownRefs.current[material.id] = el; }}
                          >
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="pcs"
                                value={material.unit}
                                onChange={(e) => {
                                  updateMaterial(material.id, 'unit', e.target.value);
                                  if (!openUnitDropdown || openUnitDropdown !== material.id) {
                                    setOpenUnitDropdown(material.id);
                                  }
                                }}
                                onFocus={() => setOpenUnitDropdown(material.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    setOpenUnitDropdown(null);
                                  }
                                }}
                                className="w-full h-10 px-3 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                disabled={isLoadingMaterials}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOpenUnitDropdown(openUnitDropdown === material.id ? null : material.id);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                disabled={isLoadingMaterials}
                              >
                                <ChevronDown className={`h-4 w-4 transition-transform ${openUnitDropdown === material.id ? 'rotate-180' : ''}`} />
                              </button>
                            </div>
                            {/* Dropdown suggestions */}
                            {openUnitDropdown === material.id && (
                              <div
                                className="absolute left-0 top-full z-[9999] mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto"
                                style={{ minWidth: '120px' }}
                              >
                                {getFilteredUnits(material.unit).length > 0 ? (
                                  getFilteredUnits(material.unit).map((unit) => (
                                    <button
                                      key={unit}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        updateMaterial(material.id, 'unit', unit);
                                        setOpenUnitDropdown(null);
                                      }}
                                      className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                                        material.unit.toLowerCase() === unit.toLowerCase()
                                          ? 'bg-blue-50 text-blue-700 font-medium'
                                          : 'text-gray-700'
                                      }`}
                                    >
                                      {unit}
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-3 py-2 text-sm text-gray-500">
                                    No matching units. Type to use custom unit.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Remove Button */}
                        <td className="px-4 py-3 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMaterialRow(material.id)}
                            disabled={manualMaterials.length === 1 || isLoadingMaterials}
                            className={`
                              transition-all duration-150
                              ${manualMaterials.length === 1
                                ? 'text-gray-400 cursor-not-allowed'
                                : 'text-red-600 hover:text-red-700 hover:bg-red-50'
                              }
                            `}
                            title={manualMaterials.length === 1 ? 'At least one material is required' : 'Remove material'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Materials Count Summary */}
              <div className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 px-4 py-2 rounded-md">
                <span>Total Materials: <strong>{manualMaterials.length}</strong></span>
                <span>
                  Valid Entries: <strong>{manualMaterials.filter(m => m.material_name.trim() && m.quantity > 0).length}</strong>
                </span>
              </div>
            </div>

            {/* Transport Details */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Transfer Date *</label>
              <Input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="max-w-xs"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Vehicle Number</label>
                <Input
                  type="text"
                  placeholder="e.g., KA-01-AB-1234"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Driver Name</label>
                <Input
                  type="text"
                  placeholder="Driver's full name"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Driver Contact</label>
                <Input
                  type="tel"
                  placeholder="Phone number"
                  value={driverContact}
                  onChange={(e) => setDriverContact(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Transfer Fee (Optional)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={transferFee || ''}
                  onChange={(e) => setTransferFee(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Transfer Notes</label>
              <textarea
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="Add any special instructions or notes..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#243d8a] resize-none"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedSiteEngineer(null);
                  setManualMaterials([{ id: '1', material_name: '', quantity: 0, unit: 'pcs' }]);
                  setVehicleNumber('');
                  setDriverName('');
                  setDriverContact('');
                  setTransferNotes('');
                  setTransferFee(0);
                }}
              >
                Reset
              </Button>
              <Button
                onClick={submitMaterialTransfer}
                disabled={isSubmittingTransfer}
                className="bg-[#243d8a] hover:bg-[#1a2d66]"
              >
                {isSubmittingTransfer ? 'Creating DN...' : 'Create Delivery Note'}
              </Button>
            </div>
          </div>
        )}

        {/* Transfer History Sub-tab */}
        {transferSubTab === 'history' && (
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Transfer History</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchTransferHistory}
                disabled={isLoadingHistory}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {isLoadingHistory ? (
              <div className="flex justify-center items-center h-64">
                <ModernLoadingSpinners size="lg" />
              </div>
            ) : transferHistory.length === 0 ? (
              <div className="text-center py-12">
                <Truck className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No transfer history</h3>
                <p className="text-gray-600">
                  Create material transfers to see them here
                </p>
                <Button
                  className="mt-4 bg-[#243d8a] hover:bg-[#1a2d66]"
                  onClick={() => setTransferSubTab('create')}
                >
                  Create Transfer
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#243d8a] text-white">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">DN Number</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Project</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Destination</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Transfer Date</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Vehicle</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Driver</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold">Status</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold">Items</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {transferHistory.map((transfer, index) => (
                      <tr key={transfer.delivery_note_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-4 py-3">
                          <span className="font-medium text-[#243d8a]">{transfer.delivery_note_number}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-900">{transfer.project_name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={transfer.destination_type === 'site' ? 'default' : 'outline'}>
                            {transfer.destination_type === 'site' ? 'Construction Site' : 'M2 Store'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600">
                            {transfer.delivery_date ? formatDate(transfer.delivery_date) : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600">{transfer.vehicle_number || '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600">{transfer.driver_name || '-'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            className={
                              transfer.status === 'DELIVERED' ? 'bg-green-500 hover:bg-green-600' :
                              transfer.status === 'IN_TRANSIT' ? 'bg-orange-500 hover:bg-orange-600' :
                              transfer.status === 'ISSUED' ? 'bg-blue-500 hover:bg-blue-600' :
                              'bg-gray-500 hover:bg-gray-600'
                            }
                          >
                            {transfer.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold">{transfer.total_items}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            {/* Dispatch Button - Only for DRAFT status */}
                            {transfer.status === 'DRAFT' && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => openDispatchModal(transfer.delivery_note_id, transfer.delivery_note_number)}
                                className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                                title="Dispatch to destination"
                              >
                                <Send className="h-4 w-4" />
                                Dispatch
                              </Button>
                            )}

                            {/* Download PDF Button - Always available */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadDNPDF(transfer.delivery_note_id, transfer.delivery_note_number)}
                              className="flex items-center gap-1"
                              title="Download PDF"
                            >
                              <Download className="h-4 w-4" />
                              PDF
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!isLoadingHistory && transferHistory.length > 0 && (
              <div className="mt-4 text-sm text-gray-600">
                Total: {transferHistory.length} transfer(s) created
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dispatch Confirmation Modal */}
      {showDispatchModal && selectedDNForDispatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Dispatch</h3>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <Truck className="h-6 w-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-700 mb-2">
                    Are you sure you want to dispatch <strong className="text-gray-900">{selectedDNForDispatch.number}</strong>?
                  </p>
                  <p className="text-sm text-gray-600">
                    This will mark the delivery note as dispatched and in transit to the destination. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-lg">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDispatchModal(false);
                  setSelectedDNForDispatch(null);
                }}
                disabled={isDispatching}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDispatchDN}
                disabled={isDispatching}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isDispatching ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Dispatching...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Dispatch Now
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(MaterialTransfer);
