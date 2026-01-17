import React, { useState } from 'react';
import { Users, Clock, Calendar, DollarSign, FileText, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Lock, CheckCircle, AlertCircle } from 'lucide-react';

interface LabourWorkEntry {
  work_date: string;
  hours: number;
  rate_per_hour: number;
  total_cost: number;
  worker_name?: string;
  notes?: string;
}

interface AttendanceRecord {
  attendance_id: number;
  attendance_date: string;
  clock_in_time: string;
  clock_out_time: string;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  hourly_rate: number;
  total_cost: number;
  attendance_status: string;
  approval_status: 'pending' | 'locked' | 'rejected';
  approved_by_name?: string;
  approval_date?: string;
  is_locked: boolean;
}

interface WorkerAssignment {
  assignment_id: number;
  worker_id: number;
  worker_name: string;
  worker_code?: string;
  assignment_start_date: string;
  assignment_end_date?: string;
  hourly_rate: number;
  role_at_site?: string;
  assignment_status: string;
  total_hours_worked: number;
  total_cost: number;
  attendance_records: AttendanceRecord[];
  attendance_locked_count: number;
  attendance_pending_count: number;
  payment_status: 'locked' | 'pending';
  payment_locked: boolean;
}

interface LabourRequisition {
  requisition_id: number;
  requisition_code: string;
  requested_by_name: string;
  request_date: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by_name?: string;
  approval_date?: string;
  site_name: string;
  work_description?: string;
  skill_required?: string;
  assignments: WorkerAssignment[];
  total_hours_worked: number;
  total_cost: number;
  overall_lock_status: 'fully_locked' | 'partially_locked' | 'unlocked';
  total_attendance_records: number;
  locked_attendance_records: number;
  pending_attendance_records: number;
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
  requisitions?: LabourRequisition[];  // New: requisition workflow data
}

interface LabourWorkflowSectionProps {
  labourData: LabourData[];
  title: string;
  showActual?: boolean;
  showWorkflow?: boolean;  // New: toggle for showing detailed workflow
  showPlanned?: boolean;  // New: toggle for showing planned columns (default true)
}

const LabourWorkflowSection: React.FC<LabourWorkflowSectionProps> = ({
  labourData,
  title,
  showActual = false,
  showWorkflow = false,
  showPlanned = true
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [expandedRequisitions, setExpandedRequisitions] = useState<Set<number>>(new Set());

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const toggleRequisition = (reqId: number) => {
    const newExpanded = new Set(expandedRequisitions);
    if (newExpanded.has(reqId)) {
      newExpanded.delete(reqId);
    } else {
      newExpanded.add(reqId);
    }
    setExpandedRequisitions(newExpanded);
  };

  const getLockStatusBadge = (status: string) => {
    if (status === 'fully_locked') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
          <Lock className="w-3 h-3" />
          Fully Locked
        </span>
      );
    } else if (status === 'partially_locked') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold">
          <AlertCircle className="w-3 h-3" />
          Partially Locked
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold">
          <Clock className="w-3 h-3" />
          Unlocked
        </span>
      );
    }
  };

  const getApprovalStatusBadge = (status: 'pending' | 'locked' | 'rejected') => {
    if (status === 'locked') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
          <Lock className="w-3 h-3" />
          Locked
        </span>
      );
    } else if (status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
          <AlertCircle className="w-3 h-3" />
          Rejected
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
          <Clock className="w-3 h-3" />
          Pending
        </span>
      );
    }
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
              {showPlanned && (
                <>
                  <th className="text-right py-3 px-3 text-gray-700 font-bold text-xs uppercase">Planned Hours</th>
                  <th className="text-right py-3 px-3 text-gray-700 font-bold text-xs uppercase">Planned Rate</th>
                  <th className="text-right py-3 px-3 text-gray-700 font-bold text-xs uppercase">Planned Total</th>
                </>
              )}
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
                    {showPlanned && (
                      <>
                        <td className="py-3 px-3 text-right text-gray-700">{lab.planned.hours}</td>
                        <td className="py-3 px-3 text-right text-gray-700">{formatCurrency(lab.planned.rate_per_hour)}</td>
                        <td className="py-3 px-3 text-right font-semibold text-gray-900">{formatCurrency(lab.planned.total)}</td>
                      </>
                    )}

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

      {/* Workflow Details Section - Requisitions, Assignments, and Locks */}
      {showWorkflow && labourData.some(lab => lab.requisitions && lab.requisitions.length > 0) && (
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-3 pb-2 border-b-2 border-gray-300">
            <div className="p-2 bg-gray-800 rounded">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h5 className="text-lg font-bold text-gray-900">Labour Workflow Details</h5>
              <p className="text-xs text-gray-500">Requisitions, assignments, attendance locks, and payment status</p>
            </div>
          </div>

          {labourData.map((lab, labIdx) => (
            lab.requisitions && lab.requisitions.length > 0 && (
              <div key={labIdx} className="mb-4">
                <h6 className="text-sm font-bold text-gray-800 mb-2 px-2">{lab.labour_role}</h6>

                {lab.requisitions.map((req) => {
                  const isReqExpanded = expandedRequisitions.has(req.requisition_id);

                  return (
                    <div key={req.requisition_id} className="mb-3 bg-white rounded-lg border-2 border-gray-300 overflow-hidden shadow-sm">
                      {/* Requisition Header - Clickable */}
                      <div
                        className="p-4 bg-gray-50 border-b border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => toggleRequisition(req.requisition_id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-bold text-gray-900">{req.requisition_code}</span>
                              {getLockStatusBadge(req.overall_lock_status)}
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                req.status === 'approved' ? 'bg-green-100 text-green-800' :
                                req.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {req.status.toUpperCase()}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                              <div><span className="font-semibold">Requested by:</span> {req.requested_by_name}</div>
                              <div><span className="font-semibold">Site:</span> {req.site_name}</div>
                              {req.approved_by_name && (
                                <div><span className="font-semibold">Approved by:</span> {req.approved_by_name}</div>
                              )}
                              <div><span className="font-semibold">Total Cost:</span> ₹{formatCurrency(req.total_cost)}</div>
                            </div>
                          </div>
                          <div className="ml-4">
                            {isReqExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-600" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-600" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Requisition Details - Expandable */}
                      {isReqExpanded && (
                        <div className="p-4">
                          {/* Worker Assignments */}
                          {req.assignments && req.assignments.length > 0 && (
                            <div className="space-y-3">
                              <h6 className="text-sm font-bold text-gray-800 border-b border-gray-200 pb-2">
                                Worker Assignments ({req.assignments.length} workers)
                              </h6>

                              {req.assignments.map((assignment) => (
                                <div key={assignment.assignment_id} className="bg-gray-50 rounded border border-gray-200 p-3">
                                  <div className="grid grid-cols-3 gap-3 mb-3">
                                    <div>
                                      <div className="text-xs text-gray-500">Worker</div>
                                      <div className="font-semibold text-gray-900">
                                        {assignment.worker_name}
                                        {assignment.worker_code && (
                                          <span className="text-xs text-gray-500 ml-1">({assignment.worker_code})</span>
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-gray-500">Rate/Hr</div>
                                      <div className="font-semibold text-gray-900">₹{formatCurrency(assignment.hourly_rate)}</div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-gray-500">Total Hours/Cost</div>
                                      <div className="font-semibold text-gray-900">
                                        {assignment.total_hours_worked}h / ₹{formatCurrency(assignment.total_cost)}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Payment Status */}
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-semibold text-gray-700">Payment:</span>
                                    {assignment.payment_locked ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                                        <Lock className="w-3 h-3" />
                                        Locked ({assignment.attendance_locked_count} days)
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold">
                                        <Clock className="w-3 h-3" />
                                        Pending ({assignment.attendance_pending_count} days)
                                      </span>
                                    )}
                                  </div>

                                  {/* Attendance Records */}
                                  {assignment.attendance_records && assignment.attendance_records.length > 0 && (
                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-gray-700 mb-1">Attendance Records:</div>
                                      <div className="max-h-48 overflow-y-auto">
                                        <table className="w-full text-xs">
                                          <thead className="bg-gray-100 sticky top-0">
                                            <tr>
                                              <th className="text-left py-1 px-2 text-gray-700">Date</th>
                                              <th className="text-left py-1 px-2 text-gray-700">In/Out</th>
                                              <th className="text-right py-1 px-2 text-gray-700">Hours</th>
                                              <th className="text-right py-1 px-2 text-gray-700">Cost</th>
                                              <th className="text-center py-1 px-2 text-gray-700">Status</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {assignment.attendance_records.map((att) => (
                                              <tr key={att.attendance_id} className="border-t border-gray-200">
                                                <td className="py-1 px-2">{new Date(att.attendance_date).toLocaleDateString()}</td>
                                                <td className="py-1 px-2">
                                                  {att.clock_in_time} - {att.clock_out_time}
                                                </td>
                                                <td className="text-right py-1 px-2">
                                                  {att.total_hours}
                                                  {att.overtime_hours > 0 && (
                                                    <span className="text-xs text-orange-600 ml-1">+{att.overtime_hours}OT</span>
                                                  )}
                                                </td>
                                                <td className="text-right py-1 px-2 font-semibold">₹{formatCurrency(att.total_cost)}</td>
                                                <td className="text-center py-1 px-2">
                                                  {getApprovalStatusBadge(att.approval_status)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}

                              {/* Requisition Totals */}
                              <div className="bg-gray-800 text-white rounded p-3 mt-3">
                                <div className="grid grid-cols-3 gap-3 text-sm">
                                  <div>
                                    <div className="text-gray-300 text-xs">Total Hours</div>
                                    <div className="font-bold">{req.total_hours_worked}h</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-300 text-xs">Total Cost</div>
                                    <div className="font-bold">₹{formatCurrency(req.total_cost)}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-300 text-xs">Lock Status</div>
                                    <div className="font-bold">
                                      {req.locked_attendance_records}/{req.total_attendance_records} locked
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* No Assignments */}
                          {(!req.assignments || req.assignments.length === 0) && (
                            <div className="text-center py-4 text-gray-500 text-sm">
                              No workers assigned yet
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
};

export default LabourWorkflowSection;
