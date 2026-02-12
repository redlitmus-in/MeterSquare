import React, { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { formatCurrency } from '@/utils/formatters';
import { useAutoSync } from '@/hooks/useAutoSync';
import { storeService, StoreItem } from '../services/storeService';
import { PAGINATION, STALE_TIMES } from '@/lib/constants';

const Store: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [storeCurrentPage, setStoreCurrentPage] = useState(1);


  // Fetch store items from backend
  const { data: storeItems, isLoading } = useAutoSync<StoreItem[]>({
    queryKey: ['buyer-store-items'],
    fetchFn: () => storeService.getStoreItems(),
    realtimeTables: ['inventory_materials'],
    staleTime: STALE_TIMES.STANDARD,
  });

  // Reset store page when search/category changes
  useEffect(() => {
    setStoreCurrentPage(1);
  }, [searchTerm, selectedCategory]);

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
      const searchLower = searchTerm.toLowerCase().trim();
      // ✅ Search by ID (S-123, 123), name, or description
      const itemIdString = `s-${item.id}`;
      const matchesSearch = !searchTerm ||
                           item.name.toLowerCase().includes(searchLower) ||
                           item.description?.toLowerCase().includes(searchLower) ||
                           itemIdString.includes(searchLower) ||
                           item.id?.toString().includes(searchTerm.trim());
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [storeItems, searchTerm, selectedCategory]);

  // Pagination for Store Items
  const storeTotalPages = Math.ceil(filteredItems.length / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedStoreItems = useMemo(() => {
    const startIndex = (storeCurrentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return filteredItems.slice(startIndex, startIndex + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [filteredItems, storeCurrentPage]);

  // Clamp store page when total pages changes (e.g., real-time data update)
  useEffect(() => {
    if (storeCurrentPage > storeTotalPages && storeTotalPages > 0) {
      setStoreCurrentPage(storeTotalPages);
    }
  }, [storeTotalPages, storeCurrentPage]);

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

      {/* Store Content */}
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paginatedStoreItems.map((item, index) => (
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

          {/* Pagination for Store Items */}
          {!isLoading && filteredItems.length > 0 && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4">
              <div className="text-sm text-gray-600">
                Showing {((storeCurrentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE) + 1} - {Math.min(storeCurrentPage * PAGINATION.DEFAULT_PAGE_SIZE, filteredItems.length)} of {filteredItems.length} materials
                {storeItems && filteredItems.length !== storeItems.length && (
                  <span className="text-gray-400"> (filtered from {storeItems.length})</span>
                )}
              </div>
              {storeTotalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStoreCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={storeCurrentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-gray-600 px-2">
                    Page {storeCurrentPage} of {storeTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStoreCurrentPage(prev => Math.min(prev + 1, storeTotalPages))}
                    disabled={storeCurrentPage === storeTotalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(Store);
