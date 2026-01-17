import React, { useState } from 'react';
import { Users, Clock, Calendar, DollarSign, FileText, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';

interface LabourWorkEntry {
  work_date: string;
  hours: number;
  rate_per_hour: number;
  total_cost: number;
  worker_name?: string;
  notes?: string;
}

interface LabourData {
  labour_role: string;
  planned: {
    hours: number;
    rate_per_hour: number;
    total: number;
  };
  actual?: {
    hours: number;
    rate_per_hour: number;
    total: number;
    labour_history?: LabourWorkEntry[];
  };
  variance?: {
    status: 'overrun' | 'saved' | 'neutral';
    amount: number;
  };
  variance_reason?: string;
}

interface LabourWorkflowSectionProps {
  labourData: LabourData[];
  title: string;
  showActual?: boolean;
}

const LabourWorkflowSection: React.FC<LabourWorkflowSectionProps> = ({
  labourData,
  title,
  showActual = false
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const formatCurrency = (value: number): string => {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="mb-6">
      {/* Section Header - Clean & Professional */}
      <div className="flex items-center gap-3 mb-3 pb-2 border-b-2 border-gray-300">
        <div className="p-2 bg-gray-800 rounded">
          <Users className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h5 className="text-lg font-bold text-gray-900">{title}</h5>
          <p className="text-xs text-gray-500">Labour costs and work tracking</p>
        </div>
        <span className="px-3 py-1 bg-gray-800 text-white rounded text-sm font-semibold">
          {labourData.length} {labourData.length === 1 ? 'Role' : 'Roles'}
        </span>
      </div>

      {/* Labour Table - Professional Clean Design */}
      <div className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          {/* Table Header - Clean Gray */}
          <thead className="bg-gray-100 border-b-2 border-gray-300">
            <tr>
              <th className="text-left py-3 px-4 text-gray-700 font-bold text-xs uppercase">Role</th>
              <th className="text-right py-3 px-3 text-gray-700 font-bold text-xs uppercase">Planned Hours</th>
              <th className="text-right py-3 px-3 text-gray-700 font-bold text-xs uppercase">Planned Rate</th>
              <th className="text-right py-3 px-3 text-gray-700 font-bold text-xs uppercase">Planned Total</th>
              {showActual && (
                <>
                  <th className="text-right py-3 px-3 text-gray-700 font-bold text-xs uppercase">Actual Hours</th>
                  <th className="text-right py-3 px-3 text-gray-700 font-bold text-xs uppercase">Actual Rate</th>
                  <th className="text-right py-3 px-3 text-gray-700 font-bold text-xs uppercase">Actual Total</th>
                  <th className="text-right py-3 px-3 text-gray-700 font-bold text-xs uppercase">Variance</th>
                  <th className="text-center py-3 px-3 text-gray-700 font-bold text-xs uppercase">Details</th>
                </>
              )}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {labourData.map((lab, idx) => {
              const actualHours = lab.actual?.hours ?? lab.planned.hours;
              const actualRate = lab.actual?.rate_per_hour ?? lab.planned.rate_per_hour;
              const actualTotal = lab.actual?.total ?? lab.planned.total;
              const isOverrun = lab.variance?.status === 'overrun';
              const isSaved = lab.variance?.status === 'saved';
              const varianceAmount = lab.variance?.amount ?? 0;
              const hasHistory = lab.actual?.labour_history && lab.actual.labour_history.length > 0;
              const isExpanded = expandedRows.has(idx);

              return (
                <React.Fragment key={idx}>
                  {/* Main Row */}
                  <tr className={`border-t border-gray-200 hover:bg-gray-50 transition-colors ${
                    isOverrun ? 'bg-red-50/20' : isSaved ? 'bg-green-50/20' : ''
                  }`}>
                    {/* Role */}
                    <td className="py-3 px-4 font-semibold text-gray-900">
                      <div className="flex items-center gap-2">
                        {lab.labour_role}
                        {isOverrun && <TrendingUp className="w-4 h-4 text-red-600" />}
                        {isSaved && <TrendingDown className="w-4 h-4 text-green-600" />}
                      </div>
                    </td>

                    {/* Planned Data */}
                    <td className="py-3 px-3 text-right text-gray-700">{lab.planned.hours}</td>
                    <td className="py-3 px-3 text-right text-gray-700">{formatCurrency(lab.planned.rate_per_hour)}</td>
                    <td className="py-3 px-3 text-right font-semibold text-gray-900">{formatCurrency(lab.planned.total)}</td>

                    {/* Actual Data (if showing) */}
                    {showActual && (
                      <>
                        <td className={`py-3 px-3 text-right font-medium ${
                          isOverrun ? 'text-red-700' : isSaved ? 'text-green-700' : 'text-gray-700'
                        }`}>
                          {actualHours}
                        </td>
                        <td className={`py-3 px-3 text-right font-medium ${
                          isOverrun ? 'text-red-700' : isSaved ? 'text-green-700' : 'text-gray-700'
                        }`}>
                          {formatCurrency(actualRate)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className={`font-bold ${
                              isOverrun ? 'text-red-700' : isSaved ? 'text-green-700' : 'text-gray-900'
                            }`}>
                              {formatCurrency(actualTotal)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {varianceAmount !== 0 && (
                            <span className={`font-semibold text-sm ${
                              isOverrun ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {isOverrun ? '+' : '-'}{formatCurrency(Math.abs(varianceAmount))}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {hasHistory && (
                            <button
                              onClick={() => toggleRow(idx)}
                              className="p-1 hover:bg-gray-200 rounded transition-colors"
                              title="View work history"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-600" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-600" />
                              )}
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>

                  {/* Expanded Row - Work History */}
                  {showActual && hasHistory && isExpanded && (
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={9} className="py-4 px-6">
                        <div className="space-y-3">
                          {/* Work History Header */}
                          <div className="flex items-center gap-2 pb-2 border-b border-gray-300">
                            <FileText className="w-4 h-4 text-gray-600" />
                            <span className="text-sm font-bold text-gray-800">Work History</span>
                            <span className="text-xs text-gray-500">
                              ({lab.actual?.labour_history?.length} {lab.actual?.labour_history?.length === 1 ? 'entry' : 'entries'})
                            </span>
                          </div>

                          {/* Work Entries Table */}
                          <div className="bg-white rounded border border-gray-200 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-100 border-b border-gray-200">
                                <tr>
                                  <th className="text-left py-2 px-3 text-gray-700 font-semibold">Date</th>
                                  <th className="text-left py-2 px-3 text-gray-700 font-semibold">Worker</th>
                                  <th className="text-right py-2 px-3 text-gray-700 font-semibold">Hours</th>
                                  <th className="text-right py-2 px-3 text-gray-700 font-semibold">Rate/Hr</th>
                                  <th className="text-right py-2 px-3 text-gray-700 font-semibold">Amount</th>
                                  <th className="text-left py-2 px-3 text-gray-700 font-semibold">Notes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lab.actual?.labour_history?.map((entry, entryIdx) => (
                                  <tr key={entryIdx} className="border-t border-gray-100 hover:bg-gray-50">
                                    <td className="py-2 px-3 text-gray-700">
                                      <div className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3 text-gray-500" />
                                        {formatDate(entry.work_date)}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-gray-700 font-medium">
                                      {entry.worker_name || '-'}
                                    </td>
                                    <td className="py-2 px-3 text-right text-gray-700">
                                      <div className="flex items-center justify-end gap-1">
                                        <Clock className="w-3 h-3 text-gray-500" />
                                        {entry.hours}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-right text-gray-700">
                                      <div className="flex items-center justify-end gap-1">
                                        <DollarSign className="w-3 h-3 text-gray-500" />
                                        {formatCurrency(entry.rate_per_hour)}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-right font-semibold text-gray-900">
                                      {formatCurrency(entry.total_cost)}
                                    </td>
                                    <td className="py-2 px-3 text-gray-600 italic text-xs">
                                      {entry.notes || '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              {/* Total Row */}
                              <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                                <tr>
                                  <td colSpan={2} className="py-2 px-3 text-right font-bold text-gray-800">
                                    Total:
                                  </td>
                                  <td className="py-2 px-3 text-right font-bold text-gray-900">
                                    {lab.actual?.hours}
                                  </td>
                                  <td className="py-2 px-3 text-right font-bold text-gray-900">
                                    {formatCurrency(lab.actual?.rate_per_hour || 0)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-bold text-gray-900">
                                    {formatCurrency(lab.actual?.total || 0)}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>

                          {/* Variance Explanation */}
                          {lab.variance_reason && (
                            <div className="mt-2 p-3 bg-blue-50 border-l-4 border-blue-400 rounded">
                              <p className="text-xs text-gray-700">
                                <span className="font-semibold">Variance Reason:</span> {lab.variance_reason}
                              </p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LabourWorkflowSection;
