import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { estimatorService } from '../services/estimatorService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface BOQRevisionHistoryProps {
  boqId: number;
  compact?: boolean; // Add compact mode for inline display
  showTitle?: boolean; // Option to hide title in compact mode
  refreshTrigger?: number; // Trigger to force refresh from parent
}

const BOQRevisionHistory: React.FC<BOQRevisionHistoryProps> = ({
  boqId,
  compact = false,
  showTitle = true,
  refreshTrigger
}) => {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedVersions, setExpandedVersions] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadRevisionHistory();
  }, [boqId, refreshTrigger]); // Add refreshTrigger to dependencies

  const loadRevisionHistory = async () => {
    setIsLoading(true);
    try {
      const result = await estimatorService.getBOQDetailsHistory(boqId);
      if (result.success && result.data) {
        // The boq_details_history endpoint returns history versions
        const historyList = result.data.history || [];
        const currentVersion = result.data.current_version;

        // Only show revisions that have meaningful data (items and cost)
        const filteredHistory = historyList.filter((v: any) => {
          const hasItems = (v.total_items && v.total_items > 0);
          const hasCost = v.total_cost && v.total_cost > 0;
          const hasBoqDetails = v.boq_details && v.boq_details.items && v.boq_details.items.length > 0;
          return (hasItems || hasBoqDetails) && hasCost;
        });

        // Always show all revisions - don't hide baseline
        const allVersions = currentVersion ? [currentVersion, ...filteredHistory] : filteredHistory;
        setHistory(allVersions);
      }
    } catch (error) {
      console.error('Error loading revision history:', error);
      showError('Failed to load revision history');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to compare two versions and get changes
  const getChanges = (currentVer: any, previousVer: any) => {
    if (!previousVer) return null;

    const changes: any = {
      items: [],
      summary: {}
    };

    const currentItems = currentVer.boq_details?.items || [];
    const previousItems = previousVer.boq_details?.items || [];

    // Compare each item
    currentItems.forEach((currentItem: any, index: number) => {
      const prevItem = previousItems[index];
      if (!prevItem) {
        changes.items.push({
          ...currentItem,
          isNew: true
        });
        return;
      }

      const itemChanges: any = {
        item_name: currentItem.item_name,
        description: currentItem.description,
        materials: [],
        labour: [],
        costs: []
      };

      let hasChanges = false;

      // Compare materials
      currentItem.materials?.forEach((mat: any, matIdx: number) => {
        const prevMat = prevItem.materials?.[matIdx];
        if (!prevMat) {
          itemChanges.materials.push({ ...mat, isNew: true });
          hasChanges = true;
        } else {
          const matChanges: any = { material_name: mat.material_name };
          if (mat.quantity !== prevMat.quantity) {
            matChanges.quantity = { old: prevMat.quantity, new: mat.quantity };
            hasChanges = true;
          }
          if (mat.unit_price !== prevMat.unit_price) {
            matChanges.unit_price = { old: prevMat.unit_price, new: mat.unit_price };
            hasChanges = true;
          }
          if (mat.total_price !== prevMat.total_price) {
            matChanges.total_price = { old: prevMat.total_price, new: mat.total_price };
            hasChanges = true;
          }
          if ((mat.vat_percentage || 0) !== (prevMat.vat_percentage || 0)) {
            matChanges.vat_percentage = { old: prevMat.vat_percentage || 0, new: mat.vat_percentage || 0 };
            hasChanges = true;
          }
          if (Object.keys(matChanges).length > 1) {
            itemChanges.materials.push(matChanges);
          }
        }
      });

      // Compare labour
      currentItem.labour?.forEach((lab: any, labIdx: number) => {
        const prevLab = prevItem.labour?.[labIdx];
        if (!prevLab) {
          itemChanges.labour.push({ ...lab, isNew: true });
          hasChanges = true;
        } else {
          const labChanges: any = { labour_role: lab.labour_role };
          if (lab.hours !== prevLab.hours) {
            labChanges.hours = { old: prevLab.hours, new: lab.hours };
            hasChanges = true;
          }
          if (lab.rate_per_hour !== prevLab.rate_per_hour) {
            labChanges.rate_per_hour = { old: prevLab.rate_per_hour, new: lab.rate_per_hour };
            hasChanges = true;
          }
          if (lab.total_cost !== prevLab.total_cost) {
            labChanges.total_cost = { old: prevLab.total_cost, new: lab.total_cost };
            hasChanges = true;
          }
          if (Object.keys(labChanges).length > 1) {
            itemChanges.labour.push(labChanges);
          }
        }
      });

      // Compare costs
      if (currentItem.overhead_percentage !== prevItem.overhead_percentage) {
        itemChanges.costs.push({
          field: 'Overhead %',
          old: prevItem.overhead_percentage,
          new: currentItem.overhead_percentage
        });
        hasChanges = true;
      }
      if (currentItem.profit_margin_percentage !== prevItem.profit_margin_percentage) {
        itemChanges.costs.push({
          field: 'Profit %',
          old: prevItem.profit_margin_percentage,
          new: currentItem.profit_margin_percentage
        });
        hasChanges = true;
      }
      if (currentItem.discount_percentage !== prevItem.discount_percentage) {
        itemChanges.costs.push({
          field: 'Discount %',
          old: prevItem.discount_percentage || 0,
          new: currentItem.discount_percentage || 0
        });
        hasChanges = true;
      }
      if (currentItem.vat_percentage !== prevItem.vat_percentage) {
        itemChanges.costs.push({
          field: 'VAT %',
          old: prevItem.vat_percentage || 0,
          new: currentItem.vat_percentage || 0
        });
        hasChanges = true;
      }
      if (currentItem.selling_price !== prevItem.selling_price) {
        itemChanges.costs.push({
          field: 'Selling Price',
          old: prevItem.selling_price,
          new: currentItem.selling_price
        });
        hasChanges = true;
      }

      if (hasChanges) {
        changes.items.push(itemChanges);
      }
    });

    // Compare summary
    const currentSummary = currentVer.boq_details?.summary || {};
    const prevSummary = previousVer.boq_details?.summary || {};

    if (currentSummary.total_cost !== prevSummary.total_cost) {
      changes.summary.total_cost = { old: prevSummary.total_cost, new: currentSummary.total_cost };
    }
    if (currentSummary.selling_price !== prevSummary.selling_price) {
      changes.summary.selling_price = { old: prevSummary.selling_price, new: currentSummary.selling_price };
    }

    return changes.items.length > 0 || Object.keys(changes.summary).length > 0 ? changes : null;
  };

  const toggleVersion = (versionId: number) => {
    const newExpanded = new Set(expandedVersions);
    if (newExpanded.has(versionId)) {
      newExpanded.delete(versionId);
    } else {
      newExpanded.add(versionId);
    }
    setExpandedVersions(newExpanded);
  };

  const getVersionIcon = (version: any) => {
    if (version.version === 'current') return '📌';
    return '📝';
  };

  const getVersionColor = (version: any) => {
    if (version.version === 'current') {
      return 'from-green-50 to-green-100/30 border-green-200 text-green-900';
    }
    return 'from-purple-50 to-purple-100/30 border-purple-200 text-purple-900';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <ModernLoadingSpinners size="md" className="mx-auto" />
          <p className="mt-4 text-gray-600">Loading revision history...</p>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className={`text-center ${compact ? 'py-4' : 'py-12'}`}>
        <div className={`bg-gradient-to-r from-purple-50 to-purple-100/30 rounded-lg ${compact ? 'p-4' : 'p-8'} border border-purple-200`}>
          <Clock className={`${compact ? 'w-8 h-8' : 'w-12 h-12'} text-purple-400 mx-auto mb-3`} />
          <p className="text-purple-700 font-medium">No Revisions Yet</p>
          {!compact && <p className="text-sm text-purple-600 mt-1">Revision history will appear here once changes are made</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      {showTitle && (
        <div className="bg-gradient-to-r from-purple-50 to-purple-100/30 rounded-lg p-4 border border-purple-200">
          <h3 className="text-lg font-bold text-purple-900 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Revision Timeline ({history.length} {history.length === 1 ? 'Version' : 'Versions'})
          </h3>
        </div>
      )}

      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {history.slice(0, compact ? 3 : undefined).map((version, index) => {
          const isExpanded = expandedVersions.has(version.boq_detail_history_id || index);
          const previousVersion = history[index + 1]; // Next in array is previous in time
          const changes = getChanges(version, previousVersion);

          return (
            <motion.div
              key={version.boq_detail_history_id || index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`bg-gradient-to-r ${getVersionColor(version)} rounded-lg border ${compact ? 'shadow' : 'shadow-sm'} overflow-hidden`}
            >
              <div
                className={`${compact ? 'p-3' : 'p-4'} cursor-pointer hover:opacity-90`}
                onClick={() => toggleVersion(version.boq_detail_history_id || index)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{getVersionIcon(version)}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        {version.version === 'current' ? 'Current Revision' : `Revision ${version.version}`}
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </h4>
                      <span className="text-xs opacity-75">
                        {new Date(version.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm opacity-90">
                      {version.created_by && (
                        <p><strong>Created By:</strong> {version.created_by}</p>
                      )}
                      <p><strong>Total Items:</strong> {version.total_items || 0}</p>
                      <p><strong>Total Cost:</strong> AED {(version.total_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs bg-white/50 p-2 rounded">
                        <div>
                          <span className="text-gray-600">Materials:</span> {version.total_materials || 0}
                        </div>
                        <div>
                          <span className="text-gray-600">Labour:</span> {version.total_labour || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t border-current/20 bg-white/50 p-4"
                >
                  {version.version === 'current' && !previousVersion ? (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm font-medium text-gray-700">📌 This is the current/latest version</p>
                      <p className="text-xs mt-1">This is the only version - no revisions yet</p>
                    </div>
                  ) : version.version === 'current' && previousVersion && !changes ? (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm font-medium text-gray-700">📌 This is the current/latest version</p>
                      <p className="text-xs mt-1">No changes from previous revision</p>
                    </div>
                  ) : !changes ? (
                    // Show BOQ details for first revision instead of "no changes"
                    <div className="space-y-3">
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                        <h5 className="font-semibold text-sm mb-2 text-blue-900">📋 BOQ Details (Initial Version)</h5>
                        <p className="text-xs text-blue-700">This is the baseline revision</p>
                      </div>

                      {version.boq_details?.items?.map((item: any, itemIdx: number) => (
                        <div key={itemIdx} className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="mb-3">
                            <h6 className="font-semibold text-sm text-gray-900">{item.item_name}</h6>
                            {item.description && (
                              <p className="text-xs text-gray-600">{item.description}</p>
                            )}
                          </div>

                          {/* Materials */}
                          {item.materials && item.materials.length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs font-semibold text-blue-900 mb-2">📦 Materials:</p>
                              <div className="space-y-1">
                                {item.materials.map((mat: any, matIdx: number) => (
                                  <div key={matIdx} className="bg-blue-50 rounded p-2 text-xs">
                                    <p className="font-semibold text-blue-900">{mat.material_name}</p>
                                    <div className="grid grid-cols-2 gap-2 mt-1 text-gray-700">
                                      <div>Quantity: {mat.quantity} {mat.unit}</div>
                                      <div>Unit Price: AED {mat.unit_price}</div>
                                      <div>VAT: {mat.vat_percentage || 0}%</div>
                                      <div className="font-semibold">Total: AED {mat.total_price}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Labour */}
                          {item.labour && item.labour.length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs font-semibold text-orange-900 mb-2">👷 Labour:</p>
                              <div className="space-y-1">
                                {item.labour.map((lab: any, labIdx: number) => (
                                  <div key={labIdx} className="bg-orange-50 rounded p-2 text-xs">
                                    <p className="font-semibold text-orange-900">{lab.labour_role}</p>
                                    <div className="grid grid-cols-2 gap-2 mt-1 text-gray-700">
                                      <div>Hours: {lab.hours}h</div>
                                      <div>Rate: AED {lab.rate_per_hour}/hr</div>
                                      <div className="font-semibold col-span-2">Total: AED {lab.total_cost}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Cost Breakdown */}
                          <div className="bg-gray-50 rounded p-2">
                            <p className="text-xs font-semibold text-gray-900 mb-2">💰 Cost Breakdown:</p>
                            <div className="space-y-1 text-xs text-gray-700">
                              <div className="flex justify-between">
                                <span>Overhead:</span>
                                <span>{item.overhead_percentage || 0}% (AED {item.overhead_amount || 0})</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Profit Margin:</span>
                                <span>{item.profit_margin_percentage || 0}% (AED {item.profit_margin_amount || 0})</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Discount:</span>
                                <span>{item.discount_percentage || 0}% (AED {item.discount_amount || 0})</span>
                              </div>
                              <div className="flex justify-between">
                                <span>VAT:</span>
                                <span>{item.vat_percentage || 0}% (AED {item.vat_amount || 0})</span>
                              </div>
                              <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-300">
                                <span>Selling Price:</span>
                                <span>AED {item.selling_price?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                        <span className="text-orange-600">📝</span>
                        Changes from {previousVersion.version === 'current' ? 'Current Version' : `Revision ${previousVersion.version}`}
                      </h5>
                      <div className="space-y-3">
                        {changes.items.map((itemChange: any, itemIdx: number) => (
                          <div key={itemIdx} className="bg-white rounded-lg p-3 border border-orange-200">
                            <div className="mb-3">
                              <h6 className="font-semibold text-sm text-gray-900">{itemChange.item_name}</h6>
                              {itemChange.description && (
                                <p className="text-xs text-gray-600">{itemChange.description}</p>
                              )}
                            </div>

                            {/* Material Changes */}
                            {itemChange.materials && itemChange.materials.length > 0 && (
                              <div className="mb-3">
                                <p className="text-xs font-semibold text-blue-900 mb-2">📦 Material Changes:</p>
                                <div className="space-y-1">
                                  {itemChange.materials.map((mat: any, matIdx: number) => (
                                    <div key={matIdx} className="bg-blue-50 rounded p-2 text-xs">
                                      <p className="font-semibold text-blue-900">{mat.material_name}</p>
                                      {mat.isNew ? (
                                        <p className="text-green-700 font-medium">✨ New material added</p>
                                      ) : (
                                        <div className="space-y-0.5 mt-1">
                                          {mat.quantity && (
                                            <div className="flex justify-between">
                                              <span className="text-gray-600">Quantity:</span>
                                              <span>
                                                <span className="line-through text-red-600">{mat.quantity.old}</span>
                                                <span className="mx-1">→</span>
                                                <span className="text-green-700 font-semibold">{mat.quantity.new}</span>
                                              </span>
                                            </div>
                                          )}
                                          {mat.unit_price && (
                                            <div className="flex justify-between">
                                              <span className="text-gray-600">Unit Price:</span>
                                              <span>
                                                <span className="line-through text-red-600">AED {mat.unit_price.old}</span>
                                                <span className="mx-1">→</span>
                                                <span className="text-green-700 font-semibold">AED {mat.unit_price.new}</span>
                                              </span>
                                            </div>
                                          )}
                                          {mat.vat_percentage && (
                                            <div className="flex justify-between">
                                              <span className="text-gray-600">VAT %:</span>
                                              <span>
                                                <span className="line-through text-red-600">{mat.vat_percentage.old}%</span>
                                                <span className="mx-1">→</span>
                                                <span className="text-green-700 font-semibold">{mat.vat_percentage.new}%</span>
                                              </span>
                                            </div>
                                          )}
                                          {mat.total_price && (
                                            <div className="flex justify-between font-semibold">
                                              <span className="text-gray-600">Total:</span>
                                              <span>
                                                <span className="line-through text-red-600">AED {mat.total_price.old}</span>
                                                <span className="mx-1">→</span>
                                                <span className="text-green-700">AED {mat.total_price.new}</span>
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Labour Changes */}
                            {itemChange.labour && itemChange.labour.length > 0 && (
                              <div className="mb-3">
                                <p className="text-xs font-semibold text-orange-900 mb-2">👷 Labour Changes:</p>
                                <div className="space-y-1">
                                  {itemChange.labour.map((lab: any, labIdx: number) => (
                                    <div key={labIdx} className="bg-orange-50 rounded p-2 text-xs">
                                      <p className="font-semibold text-orange-900">{lab.labour_role}</p>
                                      {lab.isNew ? (
                                        <p className="text-green-700 font-medium">✨ New labour added</p>
                                      ) : (
                                        <div className="space-y-0.5 mt-1">
                                          {lab.hours && (
                                            <div className="flex justify-between">
                                              <span className="text-gray-600">Hours:</span>
                                              <span>
                                                <span className="line-through text-red-600">{lab.hours.old}h</span>
                                                <span className="mx-1">→</span>
                                                <span className="text-green-700 font-semibold">{lab.hours.new}h</span>
                                              </span>
                                            </div>
                                          )}
                                          {lab.rate_per_hour && (
                                            <div className="flex justify-between">
                                              <span className="text-gray-600">Rate/Hour:</span>
                                              <span>
                                                <span className="line-through text-red-600">AED {lab.rate_per_hour.old}</span>
                                                <span className="mx-1">→</span>
                                                <span className="text-green-700 font-semibold">AED {lab.rate_per_hour.new}</span>
                                              </span>
                                            </div>
                                          )}
                                          {lab.total_cost && (
                                            <div className="flex justify-between font-semibold">
                                              <span className="text-gray-600">Total:</span>
                                              <span>
                                                <span className="line-through text-red-600">AED {lab.total_cost.old}</span>
                                                <span className="mx-1">→</span>
                                                <span className="text-green-700">AED {lab.total_cost.new}</span>
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Cost Changes */}
                            {itemChange.costs && itemChange.costs.length > 0 && (
                              <div className="bg-gray-50 rounded p-2">
                                <p className="text-xs font-semibold text-gray-900 mb-2">💰 Cost Changes:</p>
                                <div className="space-y-1 text-xs">
                                  {itemChange.costs.map((cost: any, costIdx: number) => (
                                    <div key={costIdx} className="flex justify-between">
                                      <span className="text-gray-600">{cost.field}:</span>
                                      <span>
                                        <span className="line-through text-red-600">
                                          {cost.field.includes('%') ? `${cost.old}%` : `AED ${cost.old.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                                        </span>
                                        <span className="mx-1">→</span>
                                        <span className="text-green-700 font-semibold">
                                          {cost.field.includes('%') ? `${cost.new}%` : `AED ${cost.new.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                                        </span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Summary Changes */}
                      {Object.keys(changes.summary).length > 0 && (
                        <div className="mt-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-3 border border-orange-200">
                          <h6 className="font-semibold text-sm mb-2 text-orange-900">📊 Summary Changes</h6>
                          <div className="space-y-2 text-xs">
                            {changes.summary.total_cost && (
                              <div className="flex justify-between">
                                <span className="text-gray-700">Total Cost:</span>
                                <span>
                                  <span className="line-through text-red-600">AED {changes.summary.total_cost.old.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                  <span className="mx-2">→</span>
                                  <span className="text-green-700 font-bold">AED {changes.summary.total_cost.new.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                </span>
                              </div>
                            )}
                            {changes.summary.selling_price && (
                              <div className="flex justify-between font-bold">
                                <span className="text-gray-900">Selling Price:</span>
                                <span>
                                  <span className="line-through text-red-600">AED {changes.summary.selling_price.old.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                  <span className="mx-2">→</span>
                                  <span className="text-green-700">AED {changes.summary.selling_price.new.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </motion.div>
          );
        })}

        {/* Show "View More" link in compact mode if there are more revisions */}
        {compact && history.length > 3 && (
          <div className="text-center pt-2">
            <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View all {history.length} revisions →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (626 lines - CRITICAL)
export default React.memo(BOQRevisionHistory);
