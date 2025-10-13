import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ClockIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { boqTrackingService } from '../services/boqTrackingService';

export default function RecordLabourHours() {
  const [boqList, setBOQList] = useState<any[]>([]);
  const [selectedBOQ, setSelectedBOQ] = useState<any | null>(null);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [selectedLabour, setSelectedLabour] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    actual_hours: '',
    actual_rate_per_hour: '',
    work_date: new Date().toISOString().split('T')[0],
    worker_name: '',
    notes: ''
  });

  useEffect(() => {
    fetchBOQs();
  }, []);

  const fetchBOQs = async () => {
    try {
      const response = await boqTrackingService.getProjectsWithBOQ();

      // Filter only approved BOQs
      const approvedBOQs = response.boqs?.filter((boq: any) =>
        boq.boq_status?.toLowerCase() === 'approved'
      ) || [];

      // Fetch BOQ details for each
      const boqsWithDetails = await Promise.all(
        approvedBOQs.map(async (boq: any) => {
          try {
            const details = await boqTrackingService.getBOQDetails(boq.boq_id);
            return {
              ...boq,
              boq_data: details.boq_details || details
            };
          } catch (err) {
            console.error(`Failed to fetch BOQ ${boq.boq_id}:`, err);
            return boq;
          }
        })
      );

      setBOQList(boqsWithDetails);
    } catch (error) {
      console.error('Error fetching BOQs:', error);
      toast.error('Failed to load BOQs');
    }
  };

  const handleBOQChange = (boqId: number) => {
    const boq = boqList.find(b => b.boq_id === boqId);
    setSelectedBOQ(boq || null);
    setSelectedItem(null);
    setSelectedLabour(null);
  };

  const handleItemChange = (itemId: number) => {
    const items = selectedBOQ?.boq_data?.items || [];
    const item = items.find((i: any) => i.master_item_id === itemId);
    setSelectedItem(item || null);
    setSelectedLabour(null);
  };

  const handleLabourChange = (labourId: number) => {
    const labours = selectedItem?.labour || [];
    const labour = labours.find((l: any) => l.master_labour_id === labourId);
    setSelectedLabour(labour || null);

    // Pre-fill with planned values
    if (labour) {
      setFormData(prev => ({
        ...prev,
        actual_hours: labour.hours?.toString() || '',
        actual_rate_per_hour: labour.rate_per_hour?.toString() || ''
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBOQ || !selectedItem || !selectedLabour) {
      toast.error('Please select BOQ, item, and labour');
      return;
    }

    if (!formData.actual_hours || !formData.actual_rate_per_hour) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      await boqTrackingService.recordLabourHours({
        boq_id: selectedBOQ.boq_id,
        project_id: selectedBOQ.project_details?.project_id || selectedBOQ.project_id,
        master_item_id: selectedItem.master_item_id,
        master_labour_id: selectedLabour.master_labour_id,
        labour_role: selectedLabour.labour_role,
        planned_hours: selectedLabour.hours,
        planned_rate_per_hour: selectedLabour.rate_per_hour,
        planned_total: selectedLabour.total_cost,
        actual_hours: parseFloat(formData.actual_hours),
        actual_rate_per_hour: parseFloat(formData.actual_rate_per_hour),
        work_date: formData.work_date,
        worker_name: formData.worker_name,
        notes: formData.notes
      });

      toast.success('Labour hours recorded successfully!');

      // Reset form
      setFormData({
        actual_hours: '',
        actual_rate_per_hour: '',
        work_date: new Date().toISOString().split('T')[0],
        worker_name: '',
        notes: ''
      });
      setSelectedLabour(null);

    } catch (error: any) {
      console.error('Error recording labour hours:', error);
      toast.error(error.response?.data?.error || 'Failed to record labour hours');
    } finally {
      setLoading(false);
    }
  };

  const calculateActualCost = () => {
    const hours = parseFloat(formData.actual_hours) || 0;
    const rate = parseFloat(formData.actual_rate_per_hour) || 0;
    return hours * rate;
  };

  const calculateVariance = () => {
    if (!selectedLabour) return { hours: 0, rate: 0, cost: 0 };

    const hoursVariance = (parseFloat(formData.actual_hours) || 0) - (selectedLabour.hours || 0);
    const rateVariance = (parseFloat(formData.actual_rate_per_hour) || 0) - (selectedLabour.rate_per_hour || 0);
    const costVariance = calculateActualCost() - (selectedLabour.total_cost || 0);

    return { hours: hoursVariance, rate: rateVariance, cost: costVariance };
  };

  const variance = calculateVariance();
  const items = selectedBOQ?.boq_data?.items || [];
  const labours = selectedItem?.labour || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 shadow-md mb-6">
          <div className="flex items-center gap-3">
            <ClockIcon className="w-8 h-8 text-purple-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Record Labour Hours</h1>
              <p className="text-gray-600">Track actual labour hours against planned BOQ</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* BOQ Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Select Project BOQ *
              </label>
              <select
                value={selectedBOQ?.boq_id || ''}
                onChange={(e) => handleBOQChange(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              >
                <option value="">-- Select BOQ --</option>
                {boqList.map(boq => (
                  <option key={boq.boq_id} value={boq.boq_id}>
                    {boq.project_name} - {boq.boq_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Item Selection */}
            {selectedBOQ && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Select Work Item *
                </label>
                <select
                  value={selectedItem?.master_item_id || ''}
                  onChange={(e) => handleItemChange(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                >
                  <option value="">-- Select Item --</option>
                  {items.map((item: any) => (
                    <option key={item.master_item_id} value={item.master_item_id}>
                      {item.item_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Labour Selection */}
            {selectedItem && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Select Labour Role *
                </label>
                <select
                  value={selectedLabour?.master_labour_id || ''}
                  onChange={(e) => handleLabourChange(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                >
                  <option value="">-- Select Labour --</option>
                  {labours.map((labour: any) => (
                    <option key={labour.master_labour_id} value={labour.master_labour_id}>
                      {labour.labour_role} (Planned: {labour.hours} hrs @ AED{labour.rate_per_hour}/hr)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Planned vs Actual Comparison */}
            {selectedLabour && (
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-gray-800">Planned Values</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Labour Hours:</span>
                    <p className="font-semibold">{selectedLabour.hours || 0} hrs</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Labour Rate:</span>
                    <p className="font-semibold">AED{(selectedLabour.rate_per_hour || 0).toFixed(2)}/hr</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Labour Cost:</span>
                    <p className="font-semibold">AED{(selectedLabour.total_cost || 0).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Actual Labour Details */}
            {selectedLabour && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Actual Labour Hours *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.actual_hours}
                    onChange={(e) => setFormData(prev => ({ ...prev, actual_hours: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter actual hours"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Actual Labour Rate (AED/hr) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.actual_rate_per_hour}
                    onChange={(e) => setFormData(prev => ({ ...prev, actual_rate_per_hour: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter actual rate"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Work Date
                  </label>
                  <input
                    type="date"
                    value={formData.work_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, work_date: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Worker Name
                  </label>
                  <input
                    type="text"
                    value={formData.worker_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, worker_name: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter worker name"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Notes
                  </label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Additional notes"
                  />
                </div>
              </div>
            )}

            {/* Calculated Values */}
            {selectedLabour && formData.actual_hours && formData.actual_rate_per_hour && (
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-gray-800">Calculated Values</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Actual Labour Cost:</span>
                    <p className="font-semibold text-lg">AED{calculateActualCost().toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Cost Variance:</span>
                    <p className={`font-semibold text-lg ${variance.cost > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {variance.cost > 0 ? '+' : ''}AED{variance.cost.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs border-t border-green-200 pt-2">
                  <div>
                    <span className="text-gray-600">Hours Variance:</span>
                    <p className={`font-semibold ${variance.hours > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {variance.hours > 0 ? '+' : ''}{variance.hours.toFixed(2)} hrs
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Rate Variance:</span>
                    <p className={`font-semibold ${variance.rate > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {variance.rate > 0 ? '+' : ''}AED{variance.rate.toFixed(2)}/hr
                    </p>
                  </div>
                </div>

                {/* Efficiency Indicator */}
                {selectedLabour.hours > 0 && (
                  <div className="border-t border-green-200 pt-2">
                    <span className="text-gray-600 text-xs">Labour Efficiency:</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            variance.hours <= 0 ? 'bg-green-500' : 'bg-red-500'
                          }`}
                          style={{
                            width: `${Math.min(Math.abs((parseFloat(formData.actual_hours) / selectedLabour.hours) * 100), 100)}%`
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold">
                        {((parseFloat(formData.actual_hours) / selectedLabour.hours) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => {
                  setFormData({
                    actual_hours: '',
                    actual_rate_per_hour: '',
                    work_date: new Date().toISOString().split('T')[0],
                    worker_name: '',
                    notes: ''
                  });
                  setSelectedLabour(null);
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={loading || !selectedLabour}
                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Recording...' : 'Record Labour Hours'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
