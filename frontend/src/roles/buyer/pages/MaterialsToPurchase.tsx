import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
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
  Search,
  Package,
  CheckCircle,
  Clock,
  Building2,
  MapPin,
  LayoutGrid,
  List,
  FileText
} from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { formatCurrency } from '@/utils/formatters';
import { useAutoSync } from '@/hooks/useAutoSync';
import { API_BASE_URL } from '@/api/config';
import { STALE_TIMES } from '@/lib/constants';

interface Material {
  project_id: number;
  project_name: string;
  project_code?: string;
  client: string;
  location: string;
  boq_id: number;
  boq_name: string;
  item_name: string;
  sub_item_name: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  master_material_id: number;
  material_type: string;
  purchase_status?: 'ongoing' | 'complete';
}

interface MaterialsResponse {
  success: boolean;
  materials_count: number;
  total_cost: number;
  projects_count: number;
  materials: Material[];
}

const MaterialsToPurchase: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ongoing' | 'complete'>('ongoing');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  // ✅ OPTIMIZED: Fetch BOQ materials - Real-time updates via Supabase (NO POLLING)
  // BEFORE: Polling every 30 seconds = 2 requests/minute per user
  // AFTER: Real-time subscriptions only = instant updates when BOQ changes (100% reduction in polling)
  const { data: materialsData, isLoading } = useAutoSync<MaterialsResponse>({
    queryKey: ['buyer-boq-materials'],
    fetchFn: async () => {
      const token = localStorage.getItem('access_token');

      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_BASE_URL}/buyer/boq-materials`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch materials');
      }

      return response.json();
    },
    realtimeTables: ['boq', 'boq_items', 'boq_materials', 'boq_sub_items'], // ✅ Real-time subscriptions
    staleTime: STALE_TIMES.DASHBOARD, // ✅ 60 seconds from constants
    // ❌ REMOVED: refetchInterval - No more polling!
  });

  const materials = useMemo(() => {
    if (!materialsData?.materials) return [];

    // For now, treat all as ongoing since backend doesn't have purchase_status
    // In future, you can add purchase_status field in backend
    return materialsData.materials.map(m => ({
      ...m,
      purchase_status: 'ongoing' as const
    }));
  }, [materialsData]);

  const filteredMaterials = useMemo(() => {
    return materials.filter(material => {
      const matchesSearch =
        material.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        material.material_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        material.client.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesTab = material.purchase_status === activeTab;

      return matchesSearch && matchesTab;
    });
  }, [materials, searchTerm, activeTab]);

  const stats = useMemo(() => ({
    ongoing: materials.filter(m => m.purchase_status === 'ongoing').length,
    complete: materials.filter(m => m.purchase_status === 'complete').length,
  }), [materials]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse" color="blue" />
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
              <div className="p-3 rounded-lg bg-blue-500">
                <Package className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Materials to Purchase</h1>
                <p className="text-sm text-gray-600 mt-1">
                  BOQ materials from assigned projects
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Total Projects</div>
              <div className="text-2xl font-bold text-blue-600">{materialsData?.projects_count || 0}</div>
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
              placeholder="Search by project, material, or client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-gray-200 focus:border-gray-300 focus:ring-0 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Tab Toggle Buttons */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('ongoing')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  activeTab === 'ongoing'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Clock className="w-3 h-3 inline mr-1" />
                Ongoing ({stats.ongoing})
              </button>
              <button
                onClick={() => setActiveTab('complete')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  activeTab === 'complete'
                    ? 'bg-green-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <CheckCircle className="w-3 h-3 inline mr-1" />
                Complete ({stats.complete})
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('cards')}
                className={`h-8 px-3 rounded text-xs font-medium transition-all ${
                  viewMode === 'cards'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <LayoutGrid className="h-4 w-4 sm:mr-1.5 inline" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`h-8 px-3 rounded text-xs font-medium transition-all ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <List className="h-4 w-4 sm:mr-1.5 inline" />
                <span className="hidden sm:inline">Table</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'ongoing' | 'complete')}>
            <TabsContent value="ongoing" className="mt-0">
              <div className="space-y-4">
                {filteredMaterials.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No ongoing materials found</p>
                  </div>
                ) : viewMode === 'cards' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredMaterials.map((material, index) => (
                      <motion.div
                        key={`${material.boq_id}-${material.master_material_id}-${index}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-4 py-3 border-b border-blue-200">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-900">{material.project_name}</h3>
                            {material.project_code && (
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                                {material.project_code}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                            <Building2 className="w-3 h-3" />
                            {material.client}
                          </div>
                        </div>
                        <div className="p-4 space-y-3">
                          <div>
                            <div className="text-xs text-gray-500">BOQ</div>
                            <div className="text-sm font-medium">{material.boq_name}</div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-xs text-gray-500">Item</div>
                              <div className="text-sm">{material.item_name}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">Sub-Item</div>
                              <div className="text-sm">{material.sub_item_name}</div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-gray-200">
                            <div className="text-xs text-gray-500 mb-1">Material</div>
                            <div className="font-bold text-gray-900">{material.material_name}</div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-xs text-gray-500">Quantity</div>
                              <div className="text-sm font-medium">{material.quantity} {material.unit}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">Unit Price</div>
                              <div className="text-sm font-medium">{formatCurrency(material.unit_price)}</div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-gray-200">
                            <div className="text-xs text-gray-500">Total Cost</div>
                            <div className="text-lg font-bold text-blue-600">{formatCurrency(material.total_price)}</div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>BOQ</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Sub-Item</TableHead>
                          <TableHead>Material</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Unit Price</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMaterials.map((material, index) => (
                          <TableRow key={`${material.boq_id}-${material.master_material_id}-${index}`}>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="font-semibold text-gray-900">{material.project_name}</div>
                                  {material.project_code && (
                                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                                      {material.project_code}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {material.client}
                                </div>
                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {material.location}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{material.boq_name}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{material.item_name}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-gray-600">{material.sub_item_name}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{material.material_name}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {material.quantity} {material.unit}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{formatCurrency(material.unit_price)}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-bold text-blue-600">{formatCurrency(material.total_price)}</div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="complete" className="mt-0">
              <div className="space-y-4">
                {filteredMaterials.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No completed materials found</p>
                  </div>
                ) : viewMode === 'cards' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredMaterials.map((material, index) => (
                      <motion.div
                        key={`${material.boq_id}-${material.master_material_id}-${index}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-lg border border-green-200 shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="bg-gradient-to-r from-green-50 to-green-100 px-4 py-3 border-b border-green-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-gray-900">{material.project_name}</h3>
                              {material.project_code && (
                                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                                  {material.project_code}
                                </span>
                              )}
                            </div>
                            <Badge className="bg-green-600 text-white">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Complete
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                            <Building2 className="w-3 h-3" />
                            {material.client}
                          </div>
                        </div>
                        <div className="p-4 space-y-3">
                          <div>
                            <div className="text-xs text-gray-500">BOQ</div>
                            <div className="text-sm font-medium">{material.boq_name}</div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-xs text-gray-500">Item</div>
                              <div className="text-sm">{material.item_name}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">Sub-Item</div>
                              <div className="text-sm">{material.sub_item_name}</div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-gray-200">
                            <div className="text-xs text-gray-500 mb-1">Material</div>
                            <div className="font-bold text-gray-900">{material.material_name}</div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-xs text-gray-500">Quantity</div>
                              <div className="text-sm font-medium">{material.quantity} {material.unit}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">Unit Price</div>
                              <div className="text-sm font-medium">{formatCurrency(material.unit_price)}</div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-gray-200">
                            <div className="text-xs text-gray-500">Total Cost</div>
                            <div className="text-lg font-bold text-green-600">{formatCurrency(material.total_price)}</div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>BOQ</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Sub-Item</TableHead>
                          <TableHead>Material</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Unit Price</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMaterials.map((material, index) => (
                          <TableRow key={`${material.boq_id}-${material.master_material_id}-${index}`}>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="font-semibold text-gray-900">{material.project_name}</div>
                                  {material.project_code && (
                                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                                      {material.project_code}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {material.client}
                                </div>
                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {material.location}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{material.boq_name}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{material.item_name}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-gray-600">{material.sub_item_name}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{material.material_name}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {material.quantity} {material.unit}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{formatCurrency(material.unit_price)}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-bold text-green-600">{formatCurrency(material.total_price)}</div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (512 lines)
export default React.memo(MaterialsToPurchase);
