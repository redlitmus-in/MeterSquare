import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { DocumentTextIcon, ShoppingCartIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { boqTrackingService } from '../services/boqTrackingService';
import PlannedVsActualView from '@/components/boq/PlannedVsActualView';
import { useProjectsAutoSync } from '@/hooks/useAutoSync';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Eye, User } from 'lucide-react';

export default function RecordMaterialPurchase() {
  const [selectedBOQ, setSelectedBOQ] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('live');

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

  // Filter BOQs based on active tab
  const filteredBOQList = useMemo(() => {
    if (activeTab === 'live') {
      // Live projects: Not completed (pm_assigned !== true OR status not indicating completion)
      return boqList.filter((boq: any) => {
        const status = (boq.status || boq.boq_status || '').toLowerCase();
        const isCompleted = boq.pm_assigned === true || status === 'completed' || status === 'closed';
        return !isCompleted;
      });
    } else {
      // Completed projects: pm_assigned = true OR status = completed
      return boqList.filter((boq: any) => {
        const status = (boq.status || boq.boq_status || '').toLowerCase();
        return boq.pm_assigned === true || status === 'completed' || status === 'closed';
      });
    }
  }, [boqList, activeTab]);

  const handleBOQChange = async (boqId: number) => {
    const boq = filteredBOQList.find(b => b.boq_id === boqId);
    setSelectedBOQ(boq || null);
  };

  // Get clean status label
  const getStatusLabel = (boq: any) => {
    const status = boq.status || boq.boq_status || boq.completion_status || '';
    // Clean up status text (remove underscores, capitalize properly)
    return status
      .replace(/_/g, ' ')
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ') || 'Active';
  };

  // Get status color
  const getStatusColor = (boq: any) => {
    const status = (boq.status || boq.boq_status || '').toLowerCase();
    if (status.includes('approved') || status.includes('confirmed') || status === 'completed') {
      return 'bg-green-100 text-green-700 border-green-200';
    } else if (status.includes('pending') || status.includes('sent')) {
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    } else if (status.includes('rejected')) {
      return 'bg-red-100 text-red-700 border-red-200';
    } else {
      return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  // Format role name
  const formatRole = (role: string) => {
    if (!role) return '';
    return role
      .replace(/_/g, ' ')
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Get current location/user of the BOQ based on workflow status
  const getSenderReceiver = (boq: any) => {
    // Sender is the person who created the BOQ (from created_by field)
    const sender = boq.created_by || 'Unknown';

    // Determine current location/owner based on actual status
    const status = (boq.status || boq.boq_status || '').toLowerCase();
    let currentLocation = '';
    let locationRole = '';

    // Map status to current location - showing where the BOQ is NOW
    if (status === 'rejected' || status.includes('pending_revision') || status.includes('under_revision')) {
      // BOQ is back with Estimator for revisions
      currentLocation = 'Estimator';
      locationRole = 'Estimator (Revising)';
    } else if (status.includes('pending') && !status.includes('pending_revision')) {
      // Pending TD/PM approval - with Technical Director
      currentLocation = 'Technical Director';
      locationRole = 'Technical Director (Review)';
    } else if (status === 'approved' && !status.includes('sent_for_confirmation')) {
      // Approved by TD, not yet sent to client
      currentLocation = 'Technical Director';
      locationRole = 'Technical Director (Approved)';
    } else if (status.includes('sent_for_confirmation') || status.includes('client')) {
      // With client for confirmation
      currentLocation = boq.client || 'Client';
      locationRole = 'Client (Review)';
    } else if (status.includes('items_assigned') || status.includes('completed')) {
      // With PM/Buyer or completed
      if (boq.user_id && Array.isArray(boq.user_id) && boq.user_id.length > 0) {
        currentLocation = 'Project Manager';
        locationRole = 'Project Manager';
      } else if (boq.user_id) {
        currentLocation = 'Project Manager';
        locationRole = 'Project Manager';
      } else {
        currentLocation = 'Buyer';
        locationRole = 'Buyer';
      }
    } else if (status === 'revision_approved') {
      // Revision approved by TD
      currentLocation = 'Technical Director';
      locationRole = 'Technical Director (Approved)';
    } else {
      // Default - with Technical Director
      currentLocation = 'Technical Director';
      locationRole = 'Technical Director';
    }

    return {
      sender: {
        name: sender,
        role: 'Created By'
      },
      receiver: {
        name: currentLocation,
        role: locationRole
      }
    };
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

        {/* BOQ Selection - Card Format with Tabs */}
        {!loading && !selectedBOQ && (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              {/* Tab Headers */}
              <div className="border-b border-gray-200 bg-gray-50 px-6">
                <TabsList className="w-full justify-start bg-transparent h-auto p-0">
                  <TabsTrigger
                    value="live"
                    className="px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm transition-all"
                  >
                    <span className="font-semibold">Live Projects</span>
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {boqList.filter((boq: any) => {
                        const status = (boq.status || boq.boq_status || '').toLowerCase();
                        const isCompleted = boq.pm_assigned === true || status === 'completed' || status === 'closed';
                        return !isCompleted;
                      }).length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="completed"
                    className="px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:bg-white data-[state=active]:text-green-600 data-[state=active]:shadow-sm transition-all"
                  >
                    <span className="font-semibold">Completed</span>
                    <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      {boqList.filter((boq: any) => {
                        const status = (boq.status || boq.boq_status || '').toLowerCase();
                        return boq.pm_assigned === true || status === 'completed' || status === 'closed';
                      }).length}
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Live Projects Tab Content */}
              <TabsContent value="live" className="p-6 m-0">
                {filteredBOQList.length === 0 ? (
                  <div className="text-center py-12">
                    <DocumentTextIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 font-medium">No live projects found</p>
                    <p className="text-sm text-gray-400 mt-1">All projects are completed</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredBOQList.map((boq) => (
                      <motion.div
                        key={boq.boq_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="group bg-white rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:shadow-xl transition-all duration-300 overflow-hidden"
                      >
                        {/* Card Header with Status Badge */}
                        <div className="relative p-5 bg-gradient-to-br from-gray-50 to-white">
                          <div className="flex items-start justify-between mb-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                              <DocumentTextIcon className="w-6 h-6 text-blue-600" />
                            </div>
                            <Badge className={`${getStatusColor(boq)} border px-2 py-1 text-xs font-semibold`}>
                              {getStatusLabel(boq)}
                            </Badge>
                          </div>

                          {/* Project Title */}
                          <h3 className="font-bold text-gray-900 text-lg mb-1 line-clamp-2 min-h-[3rem]">
                            {boq.project_name}
                          </h3>

                          {/* BOQ Name */}
                          <p className="text-sm text-gray-600 line-clamp-1 mb-3">
                            BOQ for {boq.boq_name || boq.project_name}
                          </p>
                        </div>

                        {/* Card Body - Project Details */}
                        <div className="px-5 pb-4 space-y-2">
                          <div className="flex justify-between items-center py-1 border-b border-gray-100">
                            <span className="text-xs text-gray-500 font-medium">BOQ ID:</span>
                            <span className="text-sm font-bold text-gray-900">#{boq.boq_id}</span>
                          </div>
                          {boq.created_at && (
                            <div className="flex justify-between items-center py-1 border-b border-gray-100">
                              <span className="text-xs text-gray-500 font-medium">Created:</span>
                              <span className="text-sm font-semibold text-gray-700">
                                {new Date(boq.created_at).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </span>
                            </div>
                          )}

                          {/* Current Location */}
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                                <User className="w-4 h-4 text-blue-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-gray-500 mb-0.5">Current Location</p>
                                <p className="text-sm font-bold text-gray-900 truncate">
                                  {getSenderReceiver(boq).receiver.name}
                                </p>
                                <p className="text-[10px] text-blue-600 font-medium">
                                  {getSenderReceiver(boq).receiver.role}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Card Footer - Action Button */}
                        <div className="px-5 pb-5">
                          <button
                            onClick={() => handleBOQChange(boq.boq_id)}
                            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:shadow-lg group-hover:scale-[1.02]"
                          >
                            <Eye className="w-4 h-4" />
                            View Comparison
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Completed Tab Content */}
              <TabsContent value="completed" className="p-6 m-0">
                {filteredBOQList.length === 0 ? (
                  <div className="text-center py-12">
                    <DocumentTextIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 font-medium">No completed projects found</p>
                    <p className="text-sm text-gray-400 mt-1">Completed projects will appear here</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredBOQList.map((boq) => (
                      <motion.div
                        key={boq.boq_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="group bg-white rounded-xl border-2 border-gray-200 hover:border-green-400 hover:shadow-xl transition-all duration-300 overflow-hidden"
                      >
                        {/* Card Header with Status Badge */}
                        <div className="relative p-5 bg-gradient-to-br from-gray-50 to-white">
                          <div className="flex items-start justify-between mb-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                              <DocumentTextIcon className="w-6 h-6 text-green-600" />
                            </div>
                            <Badge className={`${getStatusColor(boq)} border px-2 py-1 text-xs font-semibold`}>
                              {getStatusLabel(boq)}
                            </Badge>
                          </div>

                          {/* Project Title */}
                          <h3 className="font-bold text-gray-900 text-lg mb-1 line-clamp-2 min-h-[3rem]">
                            {boq.project_name}
                          </h3>

                          {/* BOQ Name */}
                          <p className="text-sm text-gray-600 line-clamp-1 mb-3">
                            BOQ for {boq.boq_name || boq.project_name}
                          </p>
                        </div>

                        {/* Card Body - Project Details */}
                        <div className="px-5 pb-4 space-y-2">
                          <div className="flex justify-between items-center py-1 border-b border-gray-100">
                            <span className="text-xs text-gray-500 font-medium">BOQ ID:</span>
                            <span className="text-sm font-bold text-gray-900">#{boq.boq_id}</span>
                          </div>
                          {boq.created_at && (
                            <div className="flex justify-between items-center py-1 border-b border-gray-100">
                              <span className="text-xs text-gray-500 font-medium">Created:</span>
                              <span className="text-sm font-semibold text-gray-700">
                                {new Date(boq.created_at).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </span>
                            </div>
                          )}

                          {/* Current Location */}
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                                <User className="w-4 h-4 text-blue-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-gray-500 mb-0.5">Current Location</p>
                                <p className="text-sm font-bold text-gray-900 truncate">
                                  {getSenderReceiver(boq).receiver.name}
                                </p>
                                <p className="text-[10px] text-blue-600 font-medium">
                                  {getSenderReceiver(boq).receiver.role}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Card Footer - Action Button */}
                        <div className="px-5 pb-5">
                          <button
                            onClick={() => handleBOQChange(boq.boq_id)}
                            className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:shadow-lg group-hover:scale-[1.02]"
                          >
                            <Eye className="w-4 h-4" />
                            View Comparison
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
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
