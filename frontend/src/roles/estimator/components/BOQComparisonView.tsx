import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { estimatorService } from '../services/estimatorService';
import { toast } from 'sonner';

interface BOQComparisonViewProps {
  boqId: number;
  currentRevisionNumber?: number;
}

const BOQComparisonView: React.FC<BOQComparisonViewProps> = ({ boqId, currentRevisionNumber = 0 }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [selectedPreviousRevision, setSelectedPreviousRevision] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentVersion, setCurrentVersion] = useState<any>(null);
  const [previousVersion, setPreviousVersion] = useState<any>(null);

  useEffect(() => {
    loadRevisionHistory();
  }, [boqId]);

  useEffect(() => {
    if (history.length > 0) {
      // Auto-select the most recent previous revision (first in sorted array)
      const previousRev = history[0];
      if (previousRev) {
        console.log('Auto-selecting revision:', previousRev.version);
        setSelectedPreviousRevision(previousRev.version);
      }
    }
  }, [history]);

  useEffect(() => {
    if (selectedPreviousRevision !== null) {
      const prevVer = history.find(h => h.version === selectedPreviousRevision);
      setPreviousVersion(prevVer);
    }
  }, [selectedPreviousRevision, history]);

  const loadRevisionHistory = async () => {
    setIsLoading(true);
    try {
      const result = await estimatorService.getBOQDetailsHistory(boqId);
      console.log('BOQ History API Response:', result);

      if (result.success && result.data) {
        const historyList = result.data.history || [];
        const current = result.data.current_version;

        console.log('Current Version:', current);
        console.log('History List:', historyList);
        console.log('Current Revision Number:', currentRevisionNumber);

        // Filter history to show only revisions less than current
        // If currentRevisionNumber is 3, show Rev 2, Rev 1, Rev 0
        const filteredHistory = historyList.filter((h: any) => {
          const revNum = typeof h.version === 'number' ? h.version : parseInt(h.version || '0');
          return !isNaN(revNum) && revNum < currentRevisionNumber;
        }).sort((a: any, b: any) => {
          const aNum = typeof a.version === 'number' ? a.version : parseInt(a.version || '0');
          const bNum = typeof b.version === 'number' ? b.version : parseInt(b.version || '0');
          return bNum - aNum; // Sort descending (newest first)
        });

        console.log('Filtered & Sorted History:', filteredHistory);

        setCurrentVersion(current);
        setHistory(filteredHistory);
      }
    } catch (error) {
      console.error('Error loading revision history:', error);
      toast.error('Failed to load revision history');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `AED ${amount?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`;
  };

  const calculateChange = (current: number, previous: number) => {
    if (!previous || previous === 0) return { value: 0, percentage: 0 };
    const change = current - previous;
    const percentage = ((change / previous) * 100).toFixed(2);
    return { value: change, percentage: parseFloat(percentage) };
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4 text-red-600" />;
    if (change < 0) return <TrendingDown className="w-4 h-4 text-green-600" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-red-600 bg-red-50 border-red-200';
    if (change < 0) return 'text-green-600 bg-green-50 border-green-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  const compareItems = () => {
    if (!currentVersion || !previousVersion) return [];

    const currentItems = currentVersion.boq_details?.items || [];
    const previousItems = previousVersion.boq_details?.items || [];

    return currentItems.map((currentItem: any, index: number) => {
      const prevItem = previousItems[index];
      const changes: any = {
        item_name: currentItem.item_name,
        description: currentItem.description,
        materials: [],
        labour: [],
        costs: {},
        isNew: !prevItem
      };

      if (!prevItem) return changes;

      // Compare materials
      currentItem.materials?.forEach((mat: any, matIdx: number) => {
        const prevMat = prevItem.materials?.[matIdx];
        if (!prevMat) {
          changes.materials.push({ ...mat, isNew: true });
        } else {
          const matChange: any = {
            material_name: mat.material_name,
            current: {},
            previous: {},
            changed: false
          };

          if (mat.quantity !== prevMat.quantity) {
            matChange.current.quantity = mat.quantity;
            matChange.previous.quantity = prevMat.quantity;
            matChange.changed = true;
          }
          if (mat.unit_price !== prevMat.unit_price) {
            matChange.current.unit_price = mat.unit_price;
            matChange.previous.unit_price = prevMat.unit_price;
            matChange.changed = true;
          }
          if (mat.total_price !== prevMat.total_price) {
            matChange.current.total_price = mat.total_price;
            matChange.previous.total_price = prevMat.total_price;
            matChange.changed = true;
          }
          if ((mat.vat_percentage || 0) !== (prevMat.vat_percentage || 0)) {
            matChange.current.vat_percentage = mat.vat_percentage || 0;
            matChange.previous.vat_percentage = prevMat.vat_percentage || 0;
            matChange.changed = true;
          }

          if (matChange.changed) {
            changes.materials.push(matChange);
          }
        }
      });

      // Compare labour
      currentItem.labour?.forEach((lab: any, labIdx: number) => {
        const prevLab = prevItem.labour?.[labIdx];
        if (!prevLab) {
          changes.labour.push({ ...lab, isNew: true });
        } else {
          const labChange: any = {
            labour_role: lab.labour_role,
            current: {},
            previous: {},
            changed: false
          };

          if (lab.hours !== prevLab.hours) {
            labChange.current.hours = lab.hours;
            labChange.previous.hours = prevLab.hours;
            labChange.changed = true;
          }
          if (lab.rate_per_hour !== prevLab.rate_per_hour) {
            labChange.current.rate_per_hour = lab.rate_per_hour;
            labChange.previous.rate_per_hour = prevLab.rate_per_hour;
            labChange.changed = true;
          }
          if (lab.total_cost !== prevLab.total_cost) {
            labChange.current.total_cost = lab.total_cost;
            labChange.previous.total_cost = prevLab.total_cost;
            labChange.changed = true;
          }

          if (labChange.changed) {
            changes.labour.push(labChange);
          }
        }
      });

      // Compare costs
      if (currentItem.overhead_percentage !== prevItem.overhead_percentage) {
        changes.costs.overhead = {
          current: currentItem.overhead_percentage,
          previous: prevItem.overhead_percentage
        };
      }
      if (currentItem.profit_margin_percentage !== prevItem.profit_margin_percentage) {
        changes.costs.profit = {
          current: currentItem.profit_margin_percentage,
          previous: prevItem.profit_margin_percentage
        };
      }
      if (currentItem.discount_percentage !== prevItem.discount_percentage) {
        changes.costs.discount = {
          current: currentItem.discount_percentage || 0,
          previous: prevItem.discount_percentage || 0
        };
      }
      if (currentItem.vat_percentage !== prevItem.vat_percentage) {
        changes.costs.vat = {
          current: currentItem.vat_percentage || 0,
          previous: prevItem.vat_percentage || 0
        };
      }
      if (currentItem.selling_price !== prevItem.selling_price) {
        changes.costs.selling_price = {
          current: currentItem.selling_price,
          previous: prevItem.selling_price
        };
      }

      return changes;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading comparison...</p>
        </div>
      </div>
    );
  }

  if (!currentVersion || !previousVersion) {
    return (
      <div className="text-center py-12">
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-8 border border-gray-200">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">No Previous Revision to Compare</p>
          <p className="text-sm text-gray-600 mt-1">This is the first version of the BOQ</p>
        </div>
      </div>
    );
  }

  const comparisons = compareItems();
  const totalCostChange = calculateChange(currentVersion.total_cost || 0, previousVersion.total_cost || 0);

  return (
    <div className="space-y-4">
      {/* Revision Selector */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-200">
        <h3 className="text-lg font-bold text-purple-900 mb-3">Compare Revisions</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-600">Current: Rev {currentRevisionNumber}</span>
          <span className="text-sm text-gray-600 mx-2">|</span>
          <span className="text-sm text-gray-600">Compare with:</span>
          {history.map((rev) => {
            const revNum = typeof rev.version === 'number' ? rev.version : parseInt(rev.version || '0');
            return (
              <button
                key={rev.version}
                onClick={() => setSelectedPreviousRevision(rev.version)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                  selectedPreviousRevision === rev.version
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                {revNum === 0 ? 'Original' : `Rev ${revNum}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary Comparison */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
        <h4 className="font-bold text-blue-900 mb-3">Summary Comparison</h4>
        <div className="grid grid-cols-3 gap-4">
          {/* Previous */}
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <div className="text-xs text-gray-500 mb-1">Rev {previousVersion.version}</div>
            <div className="text-lg font-bold text-gray-900">{formatCurrency(previousVersion.total_cost || 0)}</div>
            <div className="text-xs text-gray-600 mt-1">{previousVersion.total_items || 0} items</div>
          </div>

          {/* Change */}
          <div className={`rounded-lg p-3 border flex flex-col items-center justify-center ${getChangeColor(totalCostChange.value)}`}>
            <div className="flex items-center gap-1 mb-1">
              {getChangeIcon(totalCostChange.value)}
              <span className="text-xs font-semibold">
                {totalCostChange.percentage > 0 ? '+' : ''}{totalCostChange.percentage}%
              </span>
            </div>
            <div className="text-sm font-bold">
              {totalCostChange.value > 0 ? '+' : ''}{formatCurrency(Math.abs(totalCostChange.value))}
            </div>
          </div>

          {/* Current */}
          <div className="bg-white rounded-lg p-3 border border-green-300">
            <div className="text-xs text-green-600 font-semibold mb-1">Current (Rev {currentVersion.version === 'current' ? currentRevisionNumber : currentVersion.version})</div>
            <div className="text-lg font-bold text-green-900">{formatCurrency(currentVersion.total_cost || 0)}</div>
            <div className="text-xs text-gray-600 mt-1">{currentVersion.total_items || 0} items</div>
          </div>
        </div>
      </div>

      {/* Split View - Item by Item Comparison */}
      <div className="space-y-4">
        <h4 className="font-bold text-gray-900 flex items-center gap-2">
          <span>📋</span>
          Item-by-Item Comparison
        </h4>

        {comparisons.filter(c => c.materials.length > 0 || c.labour.length > 0 || Object.keys(c.costs).length > 0 || c.isNew).map((item: any, itemIdx: number) => (
          <motion.div
            key={itemIdx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: itemIdx * 0.05 }}
            className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
          >
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-4 border-b border-gray-200">
              <h5 className="font-semibold text-gray-900">{item.item_name}</h5>
              {item.description && <p className="text-sm text-gray-600 mt-1">{item.description}</p>}
              {item.isNew && <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">✨ New Item</span>}
            </div>

            <div className="grid grid-cols-2 gap-4 p-4">
              {/* Left Side - Previous Revision */}
              <div className="space-y-3">
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                  <h6 className="text-sm font-semibold text-red-900 mb-2">Rev {previousVersion.version}</h6>

                  {/* Materials */}
                  {item.materials.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-700 mb-1">📦 Materials:</p>
                      {item.materials.map((mat: any, matIdx: number) => (
                        <div key={matIdx} className="bg-white rounded p-2 mb-2 text-xs">
                          <p className="font-semibold text-gray-900">{mat.material_name}</p>
                          {mat.isNew ? (
                            <p className="text-gray-500 italic">Not in this revision</p>
                          ) : (
                            <div className="space-y-1 mt-1">
                              {mat.previous.quantity !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Quantity:</span>
                                  <span className="line-through text-red-600">{mat.previous.quantity}</span>
                                </div>
                              )}
                              {mat.previous.unit_price !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Unit Price:</span>
                                  <span className="line-through text-red-600">AED {mat.previous.unit_price}</span>
                                </div>
                              )}
                              {mat.previous.total_price !== undefined && (
                                <div className="flex justify-between font-semibold">
                                  <span className="text-gray-600">Total:</span>
                                  <span className="line-through text-red-600">AED {mat.previous.total_price}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Labour */}
                  {item.labour.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-700 mb-1">👷 Labour:</p>
                      {item.labour.map((lab: any, labIdx: number) => (
                        <div key={labIdx} className="bg-white rounded p-2 mb-2 text-xs">
                          <p className="font-semibold text-gray-900">{lab.labour_role}</p>
                          {lab.isNew ? (
                            <p className="text-gray-500 italic">Not in this revision</p>
                          ) : (
                            <div className="space-y-1 mt-1">
                              {lab.previous.hours !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Hours:</span>
                                  <span className="line-through text-red-600">{lab.previous.hours}h</span>
                                </div>
                              )}
                              {lab.previous.rate_per_hour !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Rate:</span>
                                  <span className="line-through text-red-600">AED {lab.previous.rate_per_hour}/hr</span>
                                </div>
                              )}
                              {lab.previous.total_cost !== undefined && (
                                <div className="flex justify-between font-semibold">
                                  <span className="text-gray-600">Total:</span>
                                  <span className="line-through text-red-600">AED {lab.previous.total_cost}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Costs */}
                  {Object.keys(item.costs).length > 0 && (
                    <div className="bg-white rounded p-2">
                      <p className="text-xs font-semibold text-gray-700 mb-1">💰 Costs:</p>
                      <div className="space-y-1 text-xs">
                        {item.costs.overhead && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Overhead:</span>
                            <span className="line-through text-red-600">{item.costs.overhead.previous}%</span>
                          </div>
                        )}
                        {item.costs.profit && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Profit:</span>
                            <span className="line-through text-red-600">{item.costs.profit.previous}%</span>
                          </div>
                        )}
                        {item.costs.discount && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Discount:</span>
                            <span className="line-through text-red-600">{item.costs.discount.previous}%</span>
                          </div>
                        )}
                        {item.costs.vat && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">VAT:</span>
                            <span className="line-through text-red-600">{item.costs.vat.previous}%</span>
                          </div>
                        )}
                        {item.costs.selling_price && (
                          <div className="flex justify-between font-bold pt-1 border-t">
                            <span className="text-gray-900">Selling Price:</span>
                            <span className="line-through text-red-600">AED {item.costs.selling_price.previous}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side - Current Revision */}
              <div className="space-y-3">
                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                  <h6 className="text-sm font-semibold text-green-900 mb-2">Current Rev {currentVersion.version === 'current' ? currentRevisionNumber : currentVersion.version}</h6>

                  {/* Materials */}
                  {item.materials.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-700 mb-1">📦 Materials:</p>
                      {item.materials.map((mat: any, matIdx: number) => (
                        <div key={matIdx} className="bg-white rounded p-2 mb-2 text-xs">
                          <p className="font-semibold text-gray-900">{mat.material_name}</p>
                          {mat.isNew ? (
                            <p className="text-green-600 font-medium">✨ New material added</p>
                          ) : (
                            <div className="space-y-1 mt-1">
                              {mat.current.quantity !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Quantity:</span>
                                  <span className="text-green-700 font-semibold">{mat.current.quantity}</span>
                                </div>
                              )}
                              {mat.current.unit_price !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Unit Price:</span>
                                  <span className="text-green-700 font-semibold">AED {mat.current.unit_price}</span>
                                </div>
                              )}
                              {mat.current.total_price !== undefined && (
                                <div className="flex justify-between font-semibold">
                                  <span className="text-gray-600">Total:</span>
                                  <span className="text-green-700">AED {mat.current.total_price}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Labour */}
                  {item.labour.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-700 mb-1">👷 Labour:</p>
                      {item.labour.map((lab: any, labIdx: number) => (
                        <div key={labIdx} className="bg-white rounded p-2 mb-2 text-xs">
                          <p className="font-semibold text-gray-900">{lab.labour_role}</p>
                          {lab.isNew ? (
                            <p className="text-green-600 font-medium">✨ New labour added</p>
                          ) : (
                            <div className="space-y-1 mt-1">
                              {lab.current.hours !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Hours:</span>
                                  <span className="text-green-700 font-semibold">{lab.current.hours}h</span>
                                </div>
                              )}
                              {lab.current.rate_per_hour !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Rate:</span>
                                  <span className="text-green-700 font-semibold">AED {lab.current.rate_per_hour}/hr</span>
                                </div>
                              )}
                              {lab.current.total_cost !== undefined && (
                                <div className="flex justify-between font-semibold">
                                  <span className="text-gray-600">Total:</span>
                                  <span className="text-green-700">AED {lab.current.total_cost}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Costs */}
                  {Object.keys(item.costs).length > 0 && (
                    <div className="bg-white rounded p-2">
                      <p className="text-xs font-semibold text-gray-700 mb-1">💰 Costs:</p>
                      <div className="space-y-1 text-xs">
                        {item.costs.overhead && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Overhead:</span>
                            <span className="text-green-700 font-semibold">{item.costs.overhead.current}%</span>
                          </div>
                        )}
                        {item.costs.profit && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Profit:</span>
                            <span className="text-green-700 font-semibold">{item.costs.profit.current}%</span>
                          </div>
                        )}
                        {item.costs.discount && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Discount:</span>
                            <span className="text-green-700 font-semibold">{item.costs.discount.current}%</span>
                          </div>
                        )}
                        {item.costs.vat && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">VAT:</span>
                            <span className="text-green-700 font-semibold">{item.costs.vat.current}%</span>
                          </div>
                        )}
                        {item.costs.selling_price && (
                          <div className="flex justify-between font-bold pt-1 border-t">
                            <span className="text-gray-900">Selling Price:</span>
                            <span className="text-green-700">AED {item.costs.selling_price.current}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (584 lines)
export default React.memo(BOQComparisonView);
