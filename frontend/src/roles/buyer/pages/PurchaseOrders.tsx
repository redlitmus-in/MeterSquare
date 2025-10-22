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
  ShoppingCart,
  CheckCircle,
  Clock,
  Building2,
  MapPin,
  FileText,
  Package,
  Calendar,
  LayoutGrid,
  List
} from 'lucide-react';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { formatCurrency } from '@/utils/formatters';
import { useAutoSync } from '@/hooks/useAutoSync';

interface PurchaseMaterial {
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
}

interface PurchaseOrder {
  cr_id: number;
  project_id: number;
  project_name: string;
  client: string;
  location: string;
  boq_id: number;
  boq_name: string;
  item_name: string;
  sub_item_name: string;
  request_type: string;
  reason: string;
  materials: PurchaseMaterial[];
  materials_count: number;
  total_cost: number;
  approved_by: number;
  approved_at: string | null;
  created_at: string;
  purchase_status?: 'ongoing' | 'complete';
}

interface PurchaseOrdersResponse {
  success: boolean;
  pending_purchases_count: number;
  total_cost: number;
  projects_count: number;
  pending_purchases: PurchaseOrder[];
}

const PurchaseOrders: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ongoing' | 'complete'>('ongoing');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Fetch approved change requests (extra materials) with auto-sync
  const { data: purchaseData, isLoading} = useAutoSync<PurchaseOrdersResponse>({
    queryKey: ['buyer-pending-purchases'],
    fetchFn: async () => {
      const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('access_token');

      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_URL}/buyer/new-purchases`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch purchase orders');
      }

      return response.json();
    },
    staleTime: 30000,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const purchaseOrders = useMemo(() => {
    if (!purchaseData?.pending_purchases) return [];

    // For now, treat all as ongoing since backend doesn't have purchase_status
    // In future, you can add purchase_status field in backend
    return purchaseData.pending_purchases.map(po => ({
      ...po,
      purchase_status: 'ongoing' as const
    }));
  }, [purchaseData]);

  const filteredOrders = useMemo(() => {
    return purchaseOrders.filter(order => {
      const matchesSearch =
        order.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.item_name.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesTab = order.purchase_status === activeTab;

      return matchesSearch && matchesTab;
    });
  }, [purchaseOrders, searchTerm, activeTab]);

  const stats = useMemo(() => ({
    ongoing: purchaseOrders.filter(po => po.purchase_status === 'ongoing').length,
    complete: purchaseOrders.filter(po => po.purchase_status === 'complete').length,
  }), [purchaseOrders]);

  if (isLoading) {
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
              <div className="text-sm text-gray-600">Total Projects</div>
              <div className="text-2xl font-bold text-purple-600">{purchaseData?.projects_count || 0}</div>
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
                    ? 'bg-purple-600 text-white'
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
                    ? 'bg-purple-600 text-white'
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
        <div className="bg-white rounded-2xl shadow-lg border border-purple-100 p-6">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'ongoing' | 'complete')}>
            <TabsContent value="ongoing" className="mt-0">
              <div className="space-y-4">
                {filteredOrders.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No ongoing purchase orders found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredOrders.map((order) => (
                      <motion.div
                        key={order.cr_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all"
                      >
                        {/* Order Header */}
                        <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-6 py-4 border-b border-purple-200">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <h3 className="text-lg font-bold text-gray-900">{order.project_name}</h3>
                                <Badge className="bg-purple-100 text-purple-800">CR #{order.cr_id}</Badge>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <div className="flex items-center gap-1">
                                  <Building2 className="w-4 h-4" />
                                  {order.client}
                                </div>
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-4 h-4" />
                                  {order.location}
                                </div>
                                <div className="flex items-center gap-1">
                                  <FileText className="w-4 h-4" />
                                  {order.boq_name}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-purple-600">{formatCurrency(order.total_cost)}</div>
                              <div className="text-xs text-gray-500 mt-1">{order.materials_count} materials</div>
                            </div>
                          </div>
                        </div>

                        {/* Order Details */}
                        <div className="p-6">
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Item</div>
                              <div className="font-medium text-gray-900">{order.item_name}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Sub-Item</div>
                              <div className="font-medium text-gray-900">{order.sub_item_name}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Request Type</div>
                              <Badge className="bg-blue-100 text-blue-800">{order.request_type}</Badge>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Created</div>
                              <div className="text-sm flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(order.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>

                          {/* Justification/Reason */}
                          {order.reason && (
                            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <div className="text-xs font-medium text-blue-800 mb-1">Justification</div>
                              <div className="text-sm text-blue-900">{order.reason}</div>
                            </div>
                          )}

                          {/* Materials Table */}
                          <div className="border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Material Name</TableHead>
                                  <TableHead>Quantity</TableHead>
                                  <TableHead>Unit Price</TableHead>
                                  <TableHead>Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {order.materials.map((material, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell className="font-medium">{material.material_name}</TableCell>
                                    <TableCell>{material.quantity} {material.unit}</TableCell>
                                    <TableCell>{formatCurrency(material.unit_price)}</TableCell>
                                    <TableCell className="font-bold text-purple-600">
                                      {formatCurrency(material.total_price)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="complete" className="mt-0">
              <div className="space-y-4">
                {filteredOrders.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No completed purchase orders found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredOrders.map((order) => (
                      <motion.div
                        key={order.cr_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-lg border border-green-200 shadow-sm hover:shadow-md transition-all"
                      >
                        {/* Order Header */}
                        <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-green-200">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <h3 className="text-lg font-bold text-gray-900">{order.project_name}</h3>
                                <Badge className="bg-green-100 text-green-800">CR #{order.cr_id}</Badge>
                                <Badge className="bg-green-600 text-white">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Completed
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <div className="flex items-center gap-1">
                                  <Building2 className="w-4 h-4" />
                                  {order.client}
                                </div>
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-4 h-4" />
                                  {order.location}
                                </div>
                                <div className="flex items-center gap-1">
                                  <FileText className="w-4 h-4" />
                                  {order.boq_name}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-green-600">{formatCurrency(order.total_cost)}</div>
                              <div className="text-xs text-gray-500 mt-1">{order.materials_count} materials</div>
                            </div>
                          </div>
                        </div>

                        {/* Order Details */}
                        <div className="p-6">
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Item</div>
                              <div className="font-medium text-gray-900">{order.item_name}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Sub-Item</div>
                              <div className="font-medium text-gray-900">{order.sub_item_name}</div>
                            </div>
                          </div>

                          {/* Materials Table */}
                          <div className="border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Material Name</TableHead>
                                  <TableHead>Quantity</TableHead>
                                  <TableHead>Unit Price</TableHead>
                                  <TableHead>Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {order.materials.map((material, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell className="font-medium">{material.material_name}</TableCell>
                                    <TableCell>{material.quantity} {material.unit}</TableCell>
                                    <TableCell>{formatCurrency(material.unit_price)}</TableCell>
                                    <TableCell className="font-bold text-green-600">
                                      {formatCurrency(material.total_price)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </motion.div>
                    ))}
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

export default PurchaseOrders;
