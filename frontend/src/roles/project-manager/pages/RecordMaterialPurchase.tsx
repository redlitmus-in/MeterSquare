import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { DocumentTextIcon, ShoppingCartIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { boqTrackingService } from '../services/boqTrackingService';
import PlannedVsActualView from '@/components/boq/PlannedVsActualView';
import { useProjectsAutoSync } from '@/hooks/useAutoSync';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

export default function RecordMaterialPurchase() {
  const [selectedBOQ, setSelectedBOQ] = useState<any | null>(null);

  // Real-time auto-sync for BOQ list
  const { data: boqData, isLoading: loading, refetch } = useProjectsAutoSync(
    async () => {
      const response = await boqTrackingService.getAllBOQs();

      // Handle different response structures
      let allBOQs: any[] = [];

      if (Array.isArray(response)) {
        allBOQs = response;
      } else if (response.boqs && Array.isArray(response.boqs)) {
        allBOQs = response.boqs;
      } else if (response.data && Array.isArray(response.data)) {
        allBOQs = response.data;
      } else if (response.items && Array.isArray(response.items)) {
        allBOQs = response.items;
      }

      // Filter for all BOQs except rejected ones
      const filteredBOQs = allBOQs.filter((boq: any) => {
        const status = (boq.status || boq.boq_status || boq.completion_status || '').toLowerCase();
        return status !== 'rejected';
      });

      if (filteredBOQs.length === 0) {
        toast.info('No BOQs found');
      }

      return filteredBOQs;
    }
  );

  const boqList = useMemo(() => boqData || [], [boqData]);

  const handleBOQChange = async (boqId: number) => {
    const boq = boqList.find(b => b.boq_id === boqId);
    setSelectedBOQ(boq || null);
  };


  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1800px] mx-auto"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 shadow-md mb-6">
          <div className="flex items-center gap-3">
            <ShoppingCartIcon className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Production Management</h1>
              <p className="text-gray-600">Compare original BOQ with actual purchases</p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-xl shadow-md p-12">
            <div className="flex flex-col items-center justify-center">
              <ModernLoadingSpinners size="xl" />
              <p className="mt-4 text-gray-600 font-medium">Loading BOQs...</p>
            </div>
          </div>
        )}

        {/* BOQ Selection - Card Format */}
        {!loading && !selectedBOQ && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Select Project BOQ</h2>
            {boqList.length === 0 ? (
              <div className="text-center py-12">
                <DocumentTextIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">No BOQs available</p>
                <p className="text-sm text-gray-400 mt-1">All projects are either pending or rejected</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {boqList.map((boq) => (
                  <motion.div
                    key={boq.boq_id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => handleBOQChange(boq.boq_id)}
                    className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 cursor-pointer hover:shadow-lg transition-all border-2 border-blue-200 hover:border-blue-400"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <DocumentTextIcon className="w-8 h-8 text-blue-600" />
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-semibold">
                        {boq.status || boq.boq_status || 'Completed'}
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-800 mb-1 line-clamp-1">
                      {boq.project_name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-1">{boq.boq_name}</p>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="flex justify-between">
                        <span>BOQ ID:</span>
                        <span className="font-semibold text-gray-800">#{boq.boq_id}</span>
                      </div>
                      {boq.created_at && (
                        <div className="flex justify-between">
                          <span>Created:</span>
                          <span className="font-semibold text-gray-800">
                            {new Date(boq.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <button className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
                        View Comparison
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selected BOQ Header - Show after selection */}
        {selectedBOQ && (
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 mb-6 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DocumentTextIcon className="w-6 h-6 text-purple-600" />
                <div>
                  <h3 className="font-bold text-gray-800">{selectedBOQ.project_name}</h3>
                  <p className="text-sm text-gray-600">{selectedBOQ.boq_name} - BOQ #{selectedBOQ.boq_id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedBOQ(null)}
                className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm font-semibold border border-gray-300"
              >
                ← Change BOQ
              </button>
            </div>
          </div>
        )}

        {/* Planned vs Actual Comparison View */}
        {!loading && selectedBOQ && (
          <PlannedVsActualView boqId={selectedBOQ.boq_id} />
        )}

      </motion.div>
    </div>
  );
}
