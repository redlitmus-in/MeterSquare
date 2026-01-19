import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Package,
  Users,
  Calculator,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Clock,
  Calendar,
  DollarSign,
  FileText,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react';
import { boqTrackingService } from '../../roles/project-manager/services/boqTrackingService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '../ui/ModernLoadingSpinners';
import LabourWorkflowSection from './LabourWorkflowSection';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PlannedVsActualViewProps {
  boqId: number;
  onClose?: () => void;
}

const PlannedVsActualView: React.FC<PlannedVsActualViewProps> = ({ boqId, onClose }) => {
  const [data, setData] = useState<any>(null);
  const [labourWorkflowData, setLabourWorkflowData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItemForBreakdown, setSelectedItemForBreakdown] = useState<any>(null);
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [showProfitCalculationModal, setShowProfitCalculationModal] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
    fetchLabourWorkflowData();
  }, [boqId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await boqTrackingService.getPlannedVsActual(boqId);
      setData(response);
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to load BOQ comparison');
      console.error('Error fetching planned vs actual:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLabourWorkflowData = async () => {
    try {
      const response = await boqTrackingService.getLabourWorkflowDetails(boqId);
      if (response.success) {
        setLabourWorkflowData(response.data);
      }
    } catch (error: any) {
      // Silent fail - workflow data is optional enhancement
      console.log('Labour workflow data not available:', error);
    }
  };

  // Helper function to merge labour data with workflow data
  const enrichLabourDataWithWorkflow = (labourArray: any[]) => {
    if (!labourWorkflowData?.labour_workflow) {
      return labourArray;
    }

    // Match requisitions to labour roles to avoid duplicating data
    // Filter requisitions that match the labour role's skill requirement
    return labourArray.map(lab => {
      const matchingReqs = labourWorkflowData.labour_workflow.filter((req: any) => {
        // Match by skill_required or labour_items
        if (req.skill_required === lab.labour_role) {
          return true;
        }
        // Check if any labour_items match this labour role
        return req.labour_items?.some((item: any) =>
          item.skill_required === lab.labour_role ||
          item.labour_role === lab.labour_role
        );
      });

      return {
        ...lab,
        requisitions: matchingReqs.length > 0 ? matchingReqs : labourWorkflowData.labour_workflow
      };
    });
  };

  const handleSendPurchaseRequest = async () => {
    try {
      setSendingRequest(true);
      const response = await boqTrackingService.sendPurchaseRequest(boqId);

      // Show success message with routing information
      if (response.route === 'buyer') {
        showSuccess(response.message || 'Purchase request sent to Buyer (existing BOQ materials)', {
          description: `Assigned to: ${response.buyer?.name}`,
          duration: 5000,
        });
      } else if (response.route === 'estimator') {
        showSuccess(response.message || 'Purchase request sent to Estimator (new materials)', {
          description: `Sent to: ${response.estimator?.name}`,
          duration: 5000,
        });
      } else {
        showSuccess(response.message || 'Purchase request sent successfully');
      }

      // Refresh data after sending
      await fetchData();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.response?.data?.details || 'Failed to send purchase request';
      showError(errorMsg);
      console.error('Error sending purchase request:', error);
    } finally {
      setSendingRequest(false);
    }
  };

  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0.00';
    }
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const openBreakdownModal = (item: any) => {
    setSelectedItemForBreakdown(item);
    setShowBreakdownModal(true);
  };

  // Calculate totals from items
  const calculateTotals = () => {
    if (!data?.items) return { planned_materials: 0, planned_labour: 0, actual_materials: 0, actual_labour: 0 };

    return data.items.reduce((acc: any, item: any) => {
      acc.planned_materials += item.planned.materials_total || 0;
      acc.planned_labour += item.planned.labour_total || 0;
      acc.actual_materials += item.actual.materials_total || 0;
      acc.actual_labour += item.actual.labour_total || 0;
      return acc;
    }, { planned_materials: 0, planned_labour: 0, actual_materials: 0, actual_labour: 0 });
  };

  const totals = calculateTotals();

  const closeBreakdownModal = () => {
    setShowBreakdownModal(false);
    setSelectedItemForBreakdown(null);
  };

  const handleDownloadPDF = async () => {
    if (!data) return;

    try {
      setGeneratingPDF(true);

      // Generate filename with BOQ name and date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const filename = `Profit_Comparison_${data.boq_name?.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.pdf`;

      // Create PDF using jsPDF
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPos = 15;

      // Header
      doc.setFillColor(30, 64, 175);
      doc.rect(0, 0, pageWidth, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Profit Comparison Report', 15, 12);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`BOQ: ${data.boq_name || 'N/A'}`, 15, 19);
      doc.text(`Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 15, 24);

      yPos = 35;

      // Executive Summary (combined with margin breakdown)
      doc.setTextColor(30, 64, 175);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Executive Summary', 15, yPos);
      yPos += 7;

      // Calculate correct values
      const clientPays = data.summary?.discount_details?.grand_total_after_discount || data.summary?.actual_total || 0;
      const actualSpending = data.summary?.actual_spending || 0;
      const negotiableMargin = clientPays - actualSpending;
      const opAllocation = (data.summary?.total_actual_overhead || 0) + (data.summary?.total_planned_profit || 0);
      const costVarianceImpact = negotiableMargin - opAllocation;

      const summaryData = [
        ['Metric', 'Amount (AED)'],
        [
          'CLIENT PAYS',
          formatCurrency(clientPays)
        ],
        [
          'ACTUAL SPENDING',
          formatCurrency(actualSpending)
        ],
        [
          'NEGOTIABLE MARGIN',
          formatCurrency(negotiableMargin)
        ],
        [
          'O&P Allocation (25%)',
          formatCurrency(opAllocation)
        ],
        [
          'Cost Variance Impact',
          formatCurrency(costVarianceImpact)
        ]
      ];

      autoTable(doc, {
        startY: yPos,
        head: [summaryData[0]],
        body: summaryData.slice(1),
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 8, textColor: [75, 85, 99] },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        margin: { left: 15, right: 15 },
      });

      // Items Comparison (one item per page if needed)
      data.items?.forEach((item: any, idx: number) => {
        if (idx > 0) {
          doc.addPage();
          yPos = 15;
        } else {
          yPos = (doc as any).lastAutoTable.finalY + 15;
          if (yPos > pageHeight - 60) {
            doc.addPage();
            yPos = 15;
          }
        }

        doc.setTextColor(30, 64, 175);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`${idx + 1}. ${item.item_name}`, 15, yPos);
        yPos += 7;

        const itemData = [
          ['Component', 'Planned (AED)', 'Actual (AED)', 'Variance (AED)'],
          [
            'Materials',
            formatCurrency(item.planned?.materials_total || 0),
            formatCurrency(item.actual?.materials_total || 0),
            formatCurrency(Math.abs((item.actual?.materials_total || 0) - (item.planned?.materials_total || 0)))
          ],
          [
            'Labour',
            formatCurrency(item.planned?.labour_total || 0),
            formatCurrency(item.actual?.labour_total || 0),
            formatCurrency(Math.abs((item.actual?.labour_total || 0) - (item.planned?.labour_total || 0)))
          ],
          [
            'Base Cost',
            formatCurrency((item.planned?.materials_total || 0) + (item.planned?.labour_total || 0)),
            formatCurrency(item.actual?.base_cost || 0),
            formatCurrency(Math.abs((item.actual?.base_cost || 0) - ((item.planned?.materials_total || 0) + (item.planned?.labour_total || 0))))
          ],
          [
            'Miscellaneous',
            formatCurrency(item.planned?.miscellaneous_amount || 0),
            formatCurrency(item.actual?.miscellaneous_amount || 0),
            '-'
          ],
          [
            'Transport',
            formatCurrency(item.planned?.transport_amount || 0),
            formatCurrency(item.actual?.transport_amount || 0),
            '-'
          ],
          [
            'Actual Spending',
            '-',
            formatCurrency(item.actual?.spending || 0),
            '-'
          ],
          [
            'Client Pays',
            formatCurrency(item.discount_details?.grand_total_after_discount || item.planned?.client_amount_after_discount || 0),
            formatCurrency(item.actual?.total || 0),
            '-'
          ],
          [
            'Negotiable Margin',
            formatCurrency(item.planned?.profit_amount || 0),
            formatCurrency(item.actual?.negotiable_margin || 0),
            formatCurrency(Math.abs((item.actual?.negotiable_margin || 0) - (item.planned?.profit_amount || 0)))
          ]
        ];

        autoTable(doc, {
          startY: yPos,
          head: [itemData[0]],
          body: itemData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 7, textColor: [75, 85, 99] },
          alternateRowStyles: { fillColor: [243, 244, 246] },
          columnStyles: {
            0: { cellWidth: 60, fontStyle: 'bold' },
            1: { halign: 'right', cellWidth: 45 },
            2: { halign: 'right', cellWidth: 45 },
            3: { halign: 'right', cellWidth: 40 }
          },
          margin: { left: 15, right: 15 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 5;

        // Formula note
        doc.setFontSize(7);
        doc.setTextColor(30, 64, 175);
        doc.setFont('helvetica', 'italic');
        const formula = `Formula: Negotiable Margin = Client Pays (${formatCurrency(item.actual?.total || 0)}) - Actual Spending (${formatCurrency(item.actual?.spending || 0)}) = ${formatCurrency(item.actual?.negotiable_margin || 0)}`;
        doc.text(formula, 15, yPos);
      });

      // Footer on last page
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');
      doc.text('This report was generated on ' + now.toLocaleDateString() + ' at ' + now.toLocaleTimeString(), pageWidth / 2, pageHeight - 10, { align: 'center' });
      doc.text('MeterSquare Construction Management System', pageWidth / 2, pageHeight - 6, { align: 'center' });

      // Save PDF
      doc.save(filename);
      showSuccess('PDF downloaded successfully!');

    } catch (error) {
      console.error('PDF generation error:', error);
      showError('Failed to generate PDF. Please try again.');
    } finally {
      setGeneratingPDF(false);
    }
  };


  const getVarianceIcon = (status: string) => {
    switch (status) {
      case 'saved':
      case 'under_budget':
        return <TrendingDown className="w-3 h-3 text-green-600" />;
      case 'overrun':
      case 'over_budget':
        return <TrendingUp className="w-3 h-3 text-red-600" />;
      case 'on_budget':
        return <Minus className="w-3 h-3 text-gray-600" />;
      case 'unplanned':
        return <AlertCircle className="w-3 h-3 text-orange-600" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <ModernLoadingSpinners size="lg" className="mx-auto" />
          <p className="mt-4 text-gray-600 font-medium">Loading comparison data...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 inline-block">
          <p className="text-yellow-800">No data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4" ref={contentRef}>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a] to-[#4a5fa8] rounded-xl p-6 shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">{data.boq_name}</h2>
            <p className="text-sm text-blue-100">Real-time Cost Tracking & Variance Analysis</p>
          </div>
          <button
            onClick={handleDownloadPDF}
            disabled={generatingPDF}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              generatingPDF
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-white text-[#243d8a] hover:bg-blue-50'
            }`}
          >
            <Download className={`w-5 h-5 ${generatingPDF ? 'animate-bounce' : ''}`} />
            {generatingPDF ? 'Generating PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Detailed BOQ View Section */}
      <div className="bg-white rounded-lg shadow-md border border-gray-300 overflow-hidden">
        <div className="bg-gradient-to-r from-[#243d8a] to-[#4a5fa8] px-6 py-4">
          <h3 className="text-lg font-bold text-white">Complete BOQ Details</h3>
          <p className="text-xs text-blue-100 mt-1">Full breakdown of all items with materials and labour</p>
        </div>

        <div className="p-6 max-h-[600px] overflow-y-auto">
          <div className="space-y-6">
            {data.items?.map((item: any, idx: number) => (
              <div key={idx} className="border-l-4 border-gray-400 pl-4">
                <h4 className="text-base font-bold text-gray-900 mb-3">{item.item_name}</h4>
                <p className="text-xs text-gray-500 mb-3">{item.description}</p>

                {/* Materials */}
                {item.materials?.filter((mat: any) => mat.planned && mat.planned.total > 0).length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Materials:</p>
                    <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
                      {item.materials.filter((mat: any) => mat.planned && mat.planned.total > 0).map((mat: any, mIdx: number) => (
                        <div key={mIdx} className="flex justify-between items-center">
                          <span className="text-gray-700 flex items-center gap-2">
                            <span>
                              {mat.material_name}
                              {mat.sub_item_name && (
                                <span className="text-xs text-gray-500 ml-2">
                                  [{mat.sub_item_name}]
                                </span>
                              )}
                              {mat.planned && mat.planned.total > 0 && (
                                <span className="text-xs text-gray-500 ml-2">
                                  ({mat.planned.quantity} {mat.planned.unit} @ {formatCurrency(mat.planned.unit_price)}/{mat.planned.unit})
                                </span>
                              )}
                              {mat.source === 'change_request' && mat.actual && (
                                <span className="text-xs text-gray-500 ml-2">
                                  ({mat.actual.quantity} {mat.actual.unit} @ {formatCurrency(mat.actual.unit_price)}/{mat.actual.unit})
                                </span>
                              )}
                              {!mat.planned && mat.source !== 'change_request' && (
                                <span className="text-xs text-orange-600 ml-2 font-semibold">
                                  (Unplanned)
                                </span>
                              )}
                            </span>
                            {mat.source === 'change_request' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                                NEW - CR #{mat.change_request_id}
                              </span>
                            )}
                          </span>
                          <span className="font-medium text-gray-900">
                            {mat.source === 'change_request'
                              ? formatCurrency(mat.actual?.total || 0)
                              : formatCurrency(mat.planned?.total || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Labour Section - Enhanced */}
                {item.labour?.filter((lab: any) => lab.planned.total > 0).length > 0 && (
                  <div className="mb-4">
                    {/* Labour Header with Icon and Count */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-purple-100 rounded-lg">
                          <Users className="w-4 h-4 text-purple-600" />
                        </div>
                        <p className="text-sm font-bold text-gray-800">Labour Breakdown</p>
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                          {item.labour.filter((lab: any) => lab.planned.total > 0).length} {item.labour.filter((lab: any) => lab.planned.total > 0).length === 1 ? 'Role' : 'Roles'}
                        </span>
                      </div>
                    </div>

                    {/* Labour Table with Enhanced Styling */}
                    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-3 border-2 border-purple-200 shadow-sm">
                      <table className="w-full text-sm">
                        <thead className="border-b-2 border-purple-300">
                          <tr className="bg-purple-100/50">
                            <th className="text-left py-2.5 px-2 text-purple-900 font-bold text-xs uppercase tracking-wide">Role</th>
                            <th className="text-right py-2.5 px-2 text-purple-900 font-bold text-xs uppercase tracking-wide">Hours</th>
                            <th className="text-right py-2.5 px-2 text-purple-900 font-bold text-xs uppercase tracking-wide">Rate/Hr</th>
                            <th className="text-right py-2.5 px-2 text-purple-900 font-bold text-xs uppercase tracking-wide">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.labour
                            .filter((lab: any) => lab.planned.total > 0)
                            .map((lab: any, lIdx: number) => (
                              <tr key={lIdx} className="border-t border-purple-200 hover:bg-white/50 transition-colors">
                                <td className="py-2.5 px-2 text-gray-800 font-medium">{lab.labour_role}</td>
                                <td className="py-2.5 px-2 text-right text-gray-700 font-medium">{lab.planned.hours} hrs</td>
                                <td className="py-2.5 px-2 text-right text-gray-700 font-medium">{formatCurrency(lab.planned.rate_per_hour)}</td>
                                <td className="py-2.5 px-2 text-right font-bold text-purple-700">{formatCurrency(lab.planned.total)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Financial Summary */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 text-sm border-2 border-blue-300 shadow-sm">
                  <h5 className="font-bold text-blue-900 mb-3 text-xs uppercase">Cost Breakdown</h5>

                  {/* Client Amount Section */}
                  <div className="bg-white rounded-lg p-3 mb-3 border border-blue-200">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-gray-600">Client Amount:</span>
                      <span className="font-bold text-lg text-blue-700">{formatCurrency(item.planned.base_cost)}</span>
                    </div>
                    <p className="text-xs text-gray-500 italic">Amount quoted to client</p>
                  </div>

                  {/* Internal Cost Breakdown */}
                  <div className="bg-white rounded-lg p-3 mb-2 border border-gray-300">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Internal Cost:</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Material Total:</span>
                        <span className="font-medium text-gray-900">{formatCurrency(item.planned.materials_total || 0)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Labour Total:</span>
                        <span className="font-medium text-gray-900">{formatCurrency(item.planned.labour_total || 0)}</span>
                      </div>
                      <div className="flex justify-between text-xs pt-1 border-t border-gray-200">
                        <span className="text-gray-600">+ Miscellaneous:</span>
                        <span className="font-medium text-gray-900">{formatCurrency(item.planned.miscellaneous_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">+ Overhead & Profit:</span>
                        <span className="font-medium text-gray-900">{formatCurrency((item.planned.overhead_amount || 0) + (item.planned.profit_amount || 0))}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">+ Transport:</span>
                        <span className="font-medium text-gray-900">{formatCurrency(item.planned.transport_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-sm pt-2 border-t-2 border-gray-300">
                        <span className="text-gray-900">Total Internal Cost:</span>
                        <span className="text-red-700">{formatCurrency(item.planned.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Negotiable Margin Display */}
                  <div className={`rounded-lg p-2 text-xs ${
                    (item.planned.base_cost - item.planned.total) >= 0
                      ? 'bg-green-100 border border-green-300'
                      : 'bg-red-100 border border-red-300'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Negotiable Margin:</span>
                      <span className={`font-bold ${
                        (item.planned.base_cost - item.planned.total) >= 0
                          ? 'text-green-700'
                          : 'text-red-700'
                      }`}>
                        {formatCurrency(item.planned.base_cost - item.planned.total)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Project Totals & Preliminaries Summary */}
            {data.summary && (
              <div className="mt-6 pt-6 border-t-4 border-gray-300">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-5 border-2 border-green-300 shadow-md">
                  <h4 className="text-base font-bold text-green-900 mb-4 uppercase">Project Summary</h4>

                  <div className="space-y-3">
                    {/* Items Subtotal */}
                    <div className="flex justify-between items-center py-2 border-b border-green-200">
                      <span className="font-semibold text-gray-700">Items Subtotal:</span>
                      <span className="font-bold text-lg text-gray-900">{formatCurrency(data.summary.items_subtotal || 0)}</span>
                    </div>

                    {/* Preliminaries */}
                    {data.summary.preliminaries && (data.summary.preliminaries.client_amount || 0) > 0 && (
                      <div className="bg-cyan-50 rounded-lg p-3 border border-cyan-300">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-cyan-900">Preliminary Amount:</span>
                          <span className="font-bold text-lg text-cyan-700">{formatCurrency(data.summary.preliminaries.client_amount)}</span>
                        </div>
                        <div className="text-xs text-gray-600 space-y-1">
                          <div className="flex justify-between">
                            <span>Quantity:</span>
                            <span>{data.summary.preliminaries.quantity || 0} {data.summary.preliminaries.unit || 'Nos'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Rate:</span>
                            <span>{formatCurrency(data.summary.preliminaries.rate || 0)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Combined Subtotal */}
                    <div className="flex justify-between items-center py-2 bg-gray-100 px-3 rounded border border-gray-300">
                      <span className="font-bold text-gray-900">Combined Subtotal:</span>
                      <span className="font-bold text-xl text-blue-700">{formatCurrency(data.summary.combined_subtotal || 0)}</span>
                    </div>

                    {/* Discount */}
                    {data.summary.discount_details && data.summary.discount_details.has_discount && (
                      <div className="bg-orange-50 rounded-lg p-3 border border-orange-300">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-orange-900">
                            Discount ({((data.summary.discount_details.discount_amount / (data.summary.combined_subtotal || data.summary.discount_details.client_cost_before_discount)) * 100).toFixed(2)}%):
                          </span>
                          <span className="font-bold text-lg text-orange-700">
                            -{formatCurrency(data.summary.discount_details.discount_amount)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Grand Total */}
                    <div className="flex justify-between items-center py-3 bg-gradient-to-r from-green-100 to-emerald-100 px-4 rounded-lg border-2 border-green-400 shadow">
                      <span className="font-bold text-green-900 text-base">Grand Total (Excluding VAT):</span>
                      <span className="font-bold text-2xl text-green-700">{formatCurrency(data.summary.grand_total_with_preliminaries || data.summary.grand_total || 0)}</span>
                    </div>

                    {/* Profit Impact Summary */}
                    {data.summary.discount_details && data.summary.discount_details.has_discount && (
                      <div className="mt-4 pt-4 border-t-2 border-green-300">
                        <h5 className="text-sm font-bold text-gray-800 mb-3">Discount Impact on Profitability</h5>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="bg-white rounded p-2 border border-gray-300">
                            <p className="text-gray-600 mb-1">Client Cost:</p>
                            <p className="font-bold text-gray-900">
                              {formatCurrency(data.summary.combined_subtotal || data.summary.discount_details.client_cost_before_discount)} → {formatCurrency(data.summary.grand_total_with_preliminaries || data.summary.discount_details.grand_total_after_discount)}
                            </p>
                          </div>
                          <div className="bg-white rounded p-2 border border-gray-300">
                            <p className="text-gray-600 mb-1">Internal Cost (Actual Spending):</p>
                            <p className="font-bold text-red-700">{formatCurrency(data.summary.actual_spending || data.summary.planned_spending || 0)}</p>
                          </div>
                          <div className="bg-white rounded p-2 border border-gray-300">
                            <p className="text-gray-600 mb-1">Total Margin:</p>
                            <p className={`font-bold ${
                              (data.summary.negotiable_margin || 0) >= 0
                                ? 'text-green-700'
                                : 'text-red-700'
                            }`}>
                              {formatCurrency((data.summary.combined_subtotal || data.summary.discount_details.client_cost_before_discount) - (data.summary.actual_spending || 0))} → {formatCurrency(data.summary.negotiable_margin || 0)}
                            </p>
                          </div>
                          <div className="bg-white rounded p-2 border border-gray-300">
                            <p className="text-gray-600 mb-1">Profit Margin %:</p>
                            <p className={`font-bold ${
                              (data.summary.negotiable_margin || 0) >= 0
                                ? 'text-green-700'
                                : 'text-red-700'
                            }`}>
                              {((((data.summary.combined_subtotal || data.summary.discount_details.client_cost_before_discount) - (data.summary.actual_spending || 0)) / (data.summary.combined_subtotal || data.summary.discount_details.client_cost_before_discount)) * 100).toFixed(1)}% → {(((data.summary.negotiable_margin || 0) / (data.summary.grand_total_with_preliminaries || 1)) * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                        {(((data.summary.negotiable_margin || 0) / (data.summary.grand_total_with_preliminaries || 1)) < 0.15) && (
                          <div className="mt-3 bg-yellow-50 border border-yellow-300 rounded p-2">
                            <p className="text-xs text-yellow-800">
                              <strong>Warning:</strong> Profit margin is below recommended 15%. This discount significantly reduces profitability.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Each Item Comparison Section */}
      {data.items?.map((item: any, index: number) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-white rounded-lg shadow-md border border-gray-300 overflow-hidden"
        >
          {/* Item Header */}
          <div className="bg-gray-50 px-6 py-4 border-b-2 border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">{item.item_name}</h3>
              <button
                onClick={() => openBreakdownModal(item)}
                className="px-4 py-2 bg-gradient-to-r from-[#243d8a] to-[#4a5fa8] hover:from-[#1e3270] hover:to-[#3d4f8a] text-white text-sm font-semibold rounded shadow-md transition-all flex items-center gap-2"
              >
                <Calculator className="w-4 h-4" />
                View Details
              </button>
            </div>
          </div>

          {/* Side-by-Side Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-x divide-gray-200">
            {/* LEFT SIDE - PLANNED */}
            <div className="p-6 bg-gray-50">
              <div className="mb-6">
                <h4 className="text-lg font-bold text-gray-900 mb-1">Planned Budget</h4>
                <p className="text-xs text-gray-500">Original estimate</p>
              </div>

              {/* Sub Items */}
              {item.materials.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3">Sub Items</h5>
                  <div className="bg-white rounded border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-2 px-3 text-gray-700 font-semibold">Material</th>
                          <th className="text-right py-2 px-3 text-gray-700 font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.materials
                          .filter((mat: any) => mat.planned && mat.source !== 'change_request')
                          .map((mat: any, mIdx: number) => (
                          <tr key={mIdx} className="border-t border-gray-100">
                            <td className="py-2 px-3 text-gray-700">
                              <div className="flex flex-col">
                                <span>{mat.material_name}</span>
                                {mat.sub_item_name && (
                                  <span className="text-xs text-gray-500">[{mat.sub_item_name}]</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-medium text-gray-900">
                              {formatCurrency(mat.planned.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Labour - Professional Workflow Section */}
              {item.labour.filter((lab: any) => lab.planned.total > 0).length > 0 && (
                <LabourWorkflowSection
                  labourData={item.labour.filter((lab: any) => lab.planned.total > 0)}
                  title="Planned Labour Costs"
                  showActual={false}
                />
              )}

              {/* Financial Breakdown */}
              <div className="bg-white rounded border border-gray-300 p-4">
                <h5 className="text-sm font-semibold text-gray-700 mb-3">Cost Breakdown</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Material Total:</span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.planned.materials_total)}</span>
                  </div>
                  <div className="flex justify-between py-1 pb-2">
                    <span className="text-gray-600">Labour Total:</span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.planned.labour_total)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-gray-300 font-semibold">
                    <span className="text-gray-700">Base Cost:</span>
                    <span className="text-gray-900">{formatCurrency(item.planned.materials_total + item.planned.labour_total)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="text-lg">+</span> Miscellaneous ({(item.planned.miscellaneous_percentage || 0).toFixed(1)}%):
                    </span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.planned.miscellaneous_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="text-lg">+</span> Overhead & Profit:
                    </span>
                    <span className="font-medium text-gray-900">{formatCurrency((item.planned.overhead_amount || 0) + (item.planned.profit_amount || 0))}</span>
                  </div>
                  <div className="flex justify-between py-1 pb-2 text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="text-lg">+</span> Transport:
                    </span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.planned.transport_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between py-3 border-t-2 border-gray-400 bg-orange-50 -mx-4 px-4">
                    <span className="font-bold text-gray-900 flex items-center gap-1">
                      <span className="text-lg">=</span> Total Planned Spending:
                    </span>
                    <span className="font-bold text-orange-700 text-lg">{formatCurrency(
                      item.planned.materials_total +
                      item.planned.labour_total +
                      (item.planned.miscellaneous_amount || 0) +
                      ((item.planned.overhead_amount || 0) + (item.planned.profit_amount || 0)) +
                      (item.planned.transport_amount || 0)
                    )}</span>
                  </div>
                  <div className="flex justify-between py-3 border-t-2 border-gray-300 bg-blue-50 -mx-4 px-4">
                    <span className="font-bold text-gray-900 flex items-center gap-1">
                      Client Amount:
                    </span>
                    <span className="font-bold text-blue-700 text-lg">{formatCurrency(item.discount_details?.client_cost_before_discount || item.planned?.client_amount_before_discount || item.planned.total)}</span>
                  </div>
                  <div className="flex justify-between py-2 bg-green-50 -mx-4 px-4">
                    <span className="font-semibold text-gray-700">Negotiable Margin:</span>
                    <span className={`font-bold text-lg ${
                      ((item.discount_details?.client_cost_before_discount || item.planned?.client_amount_before_discount || item.planned.total) -
                      (item.planned.materials_total + item.planned.labour_total + (item.planned.miscellaneous_amount || 0) +
                      ((item.planned.overhead_amount || 0) + (item.planned.profit_amount || 0)) + (item.planned.transport_amount || 0))) >= 0
                        ? 'text-green-700'
                        : 'text-red-700'
                    }`}>
                      {formatCurrency(
                        (item.discount_details?.client_cost_before_discount || item.planned?.client_amount_before_discount || item.planned.total) -
                        (item.planned.materials_total + item.planned.labour_total + (item.planned.miscellaneous_amount || 0) +
                        ((item.planned.overhead_amount || 0) + (item.planned.profit_amount || 0)) + (item.planned.transport_amount || 0))
                      )}
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* RIGHT SIDE - ACTUAL */}
            <div className="p-6 bg-white">
              <div className="mb-6">
                <h4 className="text-lg font-bold text-gray-900 mb-1">Actual Spending</h4>
                <p className="text-xs text-gray-500">Real costs incurred</p>
              </div>

              {/* Sub Items */}
              {item.materials.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3">Sub Items</h5>
                  <div className="bg-white rounded border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-2 px-3 text-gray-700 font-semibold">Material</th>
                          <th className="text-right py-2 px-3 text-gray-700 font-semibold">Amount</th>
                          <th className="text-left py-2 px-3 text-gray-700 font-semibold text-xs">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.materials.map((mat: any, mIdx: number) => (
                          <tr key={mIdx} className={`border-t border-gray-100 ${
                            mat.status === 'unplanned' ? 'bg-yellow-50' : ''
                          }`}>
                            <td className="py-2 px-3">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-700">{mat.material_name}</span>
                                  {mat.source === 'change_request' ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                                      NEW - CR #{mat.change_request_id}
                                    </span>
                                  ) : mat.status === 'unplanned' && (
                                    <span className="px-1.5 py-0.5 text-xs bg-orange-500 text-white rounded font-semibold">
                                      NEW
                                    </span>
                                  )}
                                </div>
                                {mat.sub_item_name && (
                                  <span className="text-xs text-gray-500">[{mat.sub_item_name}]</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className={`font-medium ${
                                mat.variance?.status === 'overrun' ? 'text-red-600' :
                                mat.variance?.status === 'saved' ? 'text-green-600' :
                                'text-gray-900'
                              }`}>
                                {mat.actual ? formatCurrency(mat.actual.total) :
                                 mat.planned ? formatCurrency(mat.planned.total) : '-'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-xs text-gray-500 italic">
                              {mat.variance_reason || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Labour - Professional Workflow Section */}
              {item.labour?.length > 0 && item.labour.filter((lab: any) => lab.planned.total > 0 || (lab.actual && lab.actual.total > 0)).length > 0 && (
                <LabourWorkflowSection
                  labourData={enrichLabourDataWithWorkflow(item.labour.filter((lab: any) => lab.planned.total > 0 || (lab.actual && lab.actual.total > 0)))}
                  title="Labour Tracking & Actual Costs"
                  showActual={true}
                  showWorkflow={false}
                  showPlanned={false}
                />
              )}

              {/* Financial Breakdown */}
              <div className="bg-white rounded border border-gray-300 p-4">
                <h5 className="text-sm font-semibold text-gray-700 mb-3">Cost Breakdown</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Material Total:</span>
                    <span className={`font-medium ${
                      item.actual.materials_total > item.planned.materials_total ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {formatCurrency(item.actual.materials_total)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 pb-2">
                    <span className="text-gray-600">Labour Total:</span>
                    <span className={`font-medium ${
                      item.actual.labour_total > item.planned.labour_total ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {formatCurrency(item.actual.labour_total)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-gray-300 font-semibold">
                    <span className="text-gray-700 flex items-center gap-1">
                      Base Cost:
                      <span className="text-[10px] text-gray-400 font-normal italic">
                        (= Mat + Lab)
                      </span>
                    </span>
                    <span className={
                      (item.actual.materials_total + item.actual.labour_total) > (item.planned.materials_total + item.planned.labour_total) ? 'text-red-600' : 'text-gray-900'
                    }>
                      {formatCurrency(item.actual.materials_total + item.actual.labour_total)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="text-lg">+</span> Miscellaneous:
                    </span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.actual.miscellaneous_amount || 0)}</span>
                  </div>
                  {/* REMOVED: O&P is NOT a cost - it's included in Negotiable Margin */}
                  <div className="flex justify-between py-1 pb-2 text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="text-lg">+</span> Transport:
                    </span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.actual.transport_amount || 0)}</span>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded px-2 py-2 mt-2 -mx-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-yellow-900 font-semibold">Actual Spending:</span>
                      <span className="font-bold text-yellow-900">{formatCurrency(item.actual.spending || 0)}</span>
                    </div>
                    <div className="text-[10px] text-yellow-700 mt-1 italic">
                      = {formatCurrency(item.actual.materials_total)} + {formatCurrency(item.actual.labour_total)} + {formatCurrency(item.actual.miscellaneous_amount || 0)} + {formatCurrency(item.actual.transport_amount || 0)}
                    </div>
                  </div>
                  <div className="flex justify-between py-3 border-t-2 border-gray-400 bg-gray-50 -mx-4 px-4">
                    <span className="font-bold text-gray-900">
                      Client Pays:
                    </span>
                    <span className={`font-bold text-lg ${
                      item.actual.total > item.planned.total ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {formatCurrency(item.actual.total)}
                    </span>
                  </div>
                  {/* Formula for Client Pays */}
                  {item.discount_details && item.discount_details.has_discount && (
                    <div className="text-[10px] text-gray-700 mt-1 italic bg-gray-100 px-2 py-1 rounded -mx-4 mx-0">
                      <strong>Formula:</strong> Client Pays = Before Discount - Discount Amount
                      <br />
                      = {formatCurrency(item.discount_details.client_cost_before_discount)} - {formatCurrency(item.discount_details.discount_amount)}
                      <br />
                      = {formatCurrency(item.actual.total)}
                    </div>
                  )}

                  {/* Negotiable Margin Calculation */}
                  <div className="mt-3 pt-3 border-t-2 border-gray-400 bg-gray-50 -mx-4 px-4 pb-3">
                    <div className="flex justify-between text-sm font-semibold mb-2">
                      <span className="text-gray-700">Negotiable Margin:</span>
                      <span className={`text-lg ${(item.actual.negotiable_margin || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(item.actual.negotiable_margin || 0)}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-700 italic bg-gray-100 px-2 py-1 rounded">
                      Formula: Negotiable Margin = Client Pays - Actual Spending
                      <br />
                      = {formatCurrency(item.actual.total)} - {formatCurrency(item.actual.spending || 0)}
                      = {formatCurrency(item.actual.negotiable_margin || 0)}
                    </div>
                  </div>

                  {/* Actual Margin Breakdown */}
                  <div className="mt-3 pt-3 border-t-2 border-blue-300 bg-blue-50 -mx-4 px-4 pb-3">
                    <p className="text-xs font-semibold text-blue-900 mb-2">Actual Margin Breakdown:</p>
                    <div className="space-y-1 text-sm">
                      {(() => {
                        // Calculate O&P from planned percentage on Client Amount
                        const opPercentage = item.planned.overhead_profit_percentage || 25;
                        const opAllocation = (item.actual.total || 0) * (opPercentage / 100);
                        const negotiableMargin = item.actual.negotiable_margin || 0;
                        const actualMargin = opAllocation + negotiableMargin;

                        return (
                          <>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-700">O&P Allocation ({opPercentage}%):</span>
                              <span className="font-medium text-gray-900">
                                {formatCurrency(opAllocation)}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-700">Negotiable Margin:</span>
                              <span className={`font-medium ${
                                negotiableMargin >= 0 ? 'text-green-700' : 'text-red-700'
                              }`}>
                                {formatCurrency(negotiableMargin)}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs pt-2 border-t border-blue-300 font-bold">
                              <span className="text-blue-900">= ACTUAL MARGIN:</span>
                              <span className={`text-lg ${
                                actualMargin >= 0 ? 'text-green-700' : 'text-red-700'
                              }`}>
                                {formatCurrency(actualMargin)}
                              </span>
                            </div>
                            {/* Formula for breakdown */}
                            <div className="text-[10px] text-blue-600 mt-2 italic bg-blue-100 px-2 py-1 rounded border border-blue-200">
                              <strong>Formula:</strong> ACTUAL MARGIN = O&P + Negotiable Margin
                              <br />
                              = {formatCurrency(opAllocation)} + ({formatCurrency(negotiableMargin)})
                              <br />
                              = {formatCurrency(actualMargin)}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </motion.div>
      ))}

      {/* Overall Summary Section */}
      {data.summary && (
        <div className="space-y-6 mt-8">
          {/* Summary Header */}
          <div className="bg-gray-100 rounded-lg p-6 border-2 border-gray-300">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Overall Project Summary</h3>
            <p className="text-sm text-gray-600">Complete financial breakdown across all items</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Planned Summary */}
            <div className="bg-white rounded-lg border border-gray-300 shadow-md overflow-hidden">
              <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                <h4 className="text-base font-bold text-gray-900">Total Planned Budget</h4>
              </div>
              <div className="p-6 space-y-2 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Material Total:</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(totals.planned_materials)}
                  </span>
                </div>
                <div className="flex justify-between py-1 pb-2">
                  <span className="text-gray-600">Labour Total:</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(totals.planned_labour)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-t-2 border-gray-300 font-semibold">
                  <span className="text-gray-700">Base Cost:</span>
                  <span className="text-gray-900">
                    {formatCurrency(totals.planned_materials + totals.planned_labour)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="text-lg">+</span> Miscellaneous:
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data.summary.total_planned_miscellaneous || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="text-lg">+</span> Overhead & Profit:
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency((data.summary.total_planned_overhead || 0) + (data.summary.total_planned_profit || 0))}
                  </span>
                </div>
                <div className="flex justify-between py-1 pb-2 text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="text-lg">+</span> Transport:
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data.summary.total_planned_transport || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-3 border-t-2 border-gray-400 bg-orange-50 -mx-6 px-6">
                  <span className="font-bold text-gray-900 flex items-center gap-1">
                    <span className="text-lg">=</span> Total Planned Spending:
                  </span>
                  <span className="font-bold text-orange-700 text-lg">
                    {formatCurrency(
                      totals.planned_materials +
                      totals.planned_labour +
                      (data.summary.total_planned_miscellaneous || 0) +
                      ((data.summary.total_planned_overhead || 0) + (data.summary.total_planned_profit || 0)) +
                      (data.summary.total_planned_transport || 0)
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-3 border-t-2 border-gray-300 bg-blue-50 -mx-6 px-6">
                  <span className="font-bold text-gray-900 flex items-center gap-1">
                    Client Amount:
                  </span>
                  <span className="font-bold text-blue-700 text-lg">
                    {formatCurrency(data.summary.discount_details?.client_cost_before_discount || data.summary.client_amount_before_discount || data.summary.planned_total)}
                  </span>
                </div>
                <div className="flex justify-between py-2 bg-green-50 -mx-6 px-6">
                  <span className="font-semibold text-gray-700">Negotiable Margin:</span>
                  <span className={`font-bold text-lg ${
                    ((data.summary.discount_details?.client_cost_before_discount || data.summary.client_amount_before_discount || data.summary.planned_total) -
                    (totals.planned_materials + totals.planned_labour + (data.summary.total_planned_miscellaneous || 0) +
                    ((data.summary.total_planned_overhead || 0) + (data.summary.total_planned_profit || 0)) + (data.summary.total_planned_transport || 0))) >= 0
                      ? 'text-green-700'
                      : 'text-red-700'
                  }`}>
                    {formatCurrency(
                      (data.summary.discount_details?.client_cost_before_discount || data.summary.client_amount_before_discount || data.summary.planned_total) -
                      (totals.planned_materials + totals.planned_labour + (data.summary.total_planned_miscellaneous || 0) +
                      ((data.summary.total_planned_overhead || 0) + (data.summary.total_planned_profit || 0)) + (data.summary.total_planned_transport || 0))
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Actual Summary */}
            <div className="bg-white rounded-lg border border-gray-300 shadow-md overflow-hidden">
              <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                <h4 className="text-base font-bold text-gray-900">Total Actual Spending</h4>
              </div>
              <div className="p-6 space-y-2 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Material Total:</span>
                  <span className={`font-medium ${
                    totals.actual_materials > totals.planned_materials
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {formatCurrency(totals.actual_materials)}
                  </span>
                </div>
                <div className="flex justify-between py-1 pb-2">
                  <span className="text-gray-600">Labour Total:</span>
                  <span className={`font-medium ${
                    totals.actual_labour > totals.planned_labour
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {formatCurrency(totals.actual_labour)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-t-2 border-gray-300 font-semibold">
                  <span className="text-gray-700">Base Cost:</span>
                  <span className={`${
                    (totals.actual_materials + totals.actual_labour) >
                    (totals.planned_materials + totals.planned_labour)
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {formatCurrency(totals.actual_materials + totals.actual_labour)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="text-lg">+</span> Miscellaneous:
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data.summary.total_actual_miscellaneous || 0)}
                  </span>
                </div>
                {/* REMOVED: O&P is NOT a cost - it's included in Negotiable Margin */}
                <div className="flex justify-between py-1 pb-2 text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="text-lg">+</span> Transport:
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data.summary.total_actual_transport || 0)}
                  </span>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mt-2 -mx-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-yellow-900 font-semibold">Total Actual Spending:</span>
                    <span className="font-bold text-yellow-900">{formatCurrency(data.summary.actual_spending || 0)}</span>
                  </div>
                  <div className="text-[10px] text-yellow-700 mt-1 italic">
                    = {formatCurrency(totals.actual_materials)} + {formatCurrency(totals.actual_labour)} + {formatCurrency(data.summary.total_actual_miscellaneous || 0)} + {formatCurrency(data.summary.total_actual_transport || 0)}
                  </div>
                </div>
                <div className="flex justify-between py-3 border-t-2 border-gray-400 bg-gray-50 -mx-6 px-6">
                  <span className="font-bold text-gray-900">
                    Client Pays:
                  </span>
                  <span className={`font-bold text-lg ${
                    (data.summary.discount_details?.grand_total_after_discount || data.summary.actual_total) > data.summary.planned_total
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {formatCurrency(data.summary.discount_details?.grand_total_after_discount || data.summary.actual_total)}
                  </span>
                </div>
                {/* Formula for Client Pays (Summary) */}
                {data.summary.discount_details && data.summary.discount_details.has_discount && (
                  <div className="text-[10px] text-gray-700 mt-1 italic bg-gray-100 px-3 py-1 rounded -mx-6 mx-0">
                    <strong>Formula:</strong> Client Pays = Before Discount - Discount Amount
                    <br />
                    = {formatCurrency(data.summary.discount_details.client_cost_before_discount)} - {formatCurrency(data.summary.discount_details.discount_amount)}
                    <br />
                    = {formatCurrency(data.summary.discount_details.grand_total_after_discount)}
                  </div>
                )}

                {/* Negotiable Margin Calculation */}
                <div className="mt-3 pt-3 border-t-2 border-gray-400 bg-gray-50 -mx-6 px-6 pb-3">
                  <div className="flex justify-between text-sm font-semibold mb-2">
                    <span className="text-gray-700">Negotiable Margin:</span>
                    <span className={`text-lg ${(data.summary.total_negotiable_margin || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(data.summary.total_negotiable_margin || 0)}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-700 italic bg-gray-100 px-2 py-1 rounded">
                    Formula: Negotiable Margin = Client Pays - Total Actual Spending
                    <br />
                    = {formatCurrency(data.summary.actual_total || 0)} - {formatCurrency(data.summary.actual_spending || 0)}
                    = {formatCurrency(data.summary.total_negotiable_margin || 0)}
                  </div>
                </div>

                {/* Actual Margin Breakdown */}
                <div className="mt-3 pt-3 border-t-2 border-blue-300 bg-blue-50 -mx-6 px-6 pb-3">
                  <p className="text-xs font-semibold text-blue-900 mb-2">Overall Actual Margin Breakdown:</p>
                  <div className="space-y-1 text-sm">
                    {(() => {
                      // Calculate O&P from planned percentage on Client Amount
                      const clientPays = data.summary.discount_details?.grand_total_after_discount || data.summary.actual_total || 0;
                      const opPercentage = 25; // Standard O&P percentage
                      const opAllocation = clientPays * (opPercentage / 100);
                      const negotiableMargin = data.summary.total_negotiable_margin || 0;
                      const actualMargin = opAllocation + negotiableMargin;

                      return (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-700">O&P Allocation ({opPercentage}%):</span>
                            <span className="font-medium text-gray-900">
                              {formatCurrency(opAllocation)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-700">Negotiable Margin:</span>
                            <span className={`font-medium ${
                              negotiableMargin >= 0 ? 'text-green-700' : 'text-red-700'
                            }`}>
                              {formatCurrency(negotiableMargin)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs pt-2 border-t border-blue-300 font-bold">
                            <span className="text-blue-900">= ACTUAL MARGIN:</span>
                            <span className={`text-lg ${
                              actualMargin >= 0 ? 'text-green-700' : 'text-red-700'
                            }`}>
                              {formatCurrency(actualMargin)}
                            </span>
                          </div>
                          {/* Formula for breakdown */}
                          <div className="text-[10px] text-blue-600 mt-2 italic bg-blue-100 px-2 py-1 rounded border border-blue-200">
                            <strong>Formula:</strong> ACTUAL MARGIN = O&P + Negotiable Margin
                            <br />
                            = {formatCurrency(opAllocation)} + ({formatCurrency(negotiableMargin)})
                            <br />
                            = {formatCurrency(actualMargin)}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Discount Summary */}
          {data.summary?.discount_details?.has_discount && (
            <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg border-2 border-orange-300 shadow-md overflow-hidden">
              <div className="bg-gradient-to-r from-orange-100 to-yellow-100 px-6 py-3 border-b-2 border-orange-300">
                <h4 className="text-base font-bold text-orange-900">Discount Applied to Project</h4>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-lg border border-orange-200 p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">Client Cost (Before Discount)</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.summary.discount_details.client_cost_before_discount)}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-orange-200 p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">Discount Applied</p>
                    <p className="text-2xl font-bold text-orange-600">
                      -{formatCurrency(data.summary.discount_details.discount_amount)}
                      <span className="text-sm ml-2">({data.summary.discount_details.discount_percentage.toFixed(2)}%)</span>
                    </p>
                  </div>
                  <div className="bg-white rounded-lg border border-green-300 p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">Client Pays (After Discount)</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.discount_details.grand_total_after_discount)}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-green-300 p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">Negotiable Margin</p>
                    <p className={`text-2xl font-bold ${data.summary.discount_details.profit_impact.profit_after_discount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(data.summary.discount_details.profit_impact.profit_after_discount)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preliminaries Summary */}
          {data.summary?.preliminaries && (data.summary.preliminaries.client_amount || 0) > 0 && (
            <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-lg border-2 border-cyan-300 shadow-md overflow-hidden">
              <div className="bg-gradient-to-r from-cyan-100 to-blue-100 px-6 py-3 border-b-2 border-cyan-300">
                <h4 className="text-base font-bold text-cyan-900">Preliminaries</h4>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Cost Summary */}
                  <div className="bg-white rounded-lg border border-cyan-200 p-4">
                    <h5 className="text-sm font-semibold text-gray-700 mb-3">Cost Summary</h5>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Quantity:</span>
                        <span className="font-medium">{data.summary.preliminaries.quantity || 0} {data.summary.preliminaries.unit || 'Nos'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Rate:</span>
                        <span className="font-medium">{formatCurrency(data.summary.preliminaries.rate || 0)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t font-semibold">
                        <span className="text-gray-900">Total Amount:</span>
                        <span className="text-cyan-700">{formatCurrency(data.summary.preliminaries.client_amount || 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Internal Cost Breakdown */}
                  <div className="bg-white rounded-lg border border-cyan-200 p-4">
                    <h5 className="text-sm font-semibold text-gray-700 mb-3">Internal Cost Summary</h5>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Base Internal Cost:</span>
                        <span className="font-medium">{formatCurrency(data.summary.preliminaries.internal_cost || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Miscellaneous (10%):</span>
                        <span className="font-medium">{formatCurrency(data.summary.preliminaries.misc_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Overhead & Profit (25%):</span>
                        <span className="font-medium">{formatCurrency(data.summary.preliminaries.overhead_profit_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Transport (5%):</span>
                        <span className="font-medium">{formatCurrency(data.summary.preliminaries.transport_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t font-semibold">
                        <span className="text-gray-900">Total Internal Cost:</span>
                        <span className={`${
                          ((data.summary.preliminaries.internal_cost || 0) + (data.summary.preliminaries.misc_amount || 0) + (data.summary.preliminaries.overhead_profit_amount || 0) + (data.summary.preliminaries.transport_amount || 0)) > (data.summary.preliminaries.client_amount || 0)
                            ? 'text-red-600'
                            : 'text-green-600'
                        }`}>
                          {formatCurrency((data.summary.preliminaries.internal_cost || 0) + (data.summary.preliminaries.misc_amount || 0) + (data.summary.preliminaries.overhead_profit_amount || 0) + (data.summary.preliminaries.transport_amount || 0))}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Combined Totals */}
                <div className="mt-6 pt-6 border-t-2 border-cyan-300">
                  <h5 className="text-sm font-bold text-cyan-900 mb-4">Project Totals (Including Preliminaries)</h5>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg border border-gray-300 p-3">
                      <p className="text-xs text-gray-600 mb-1">Items Subtotal:</p>
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(data.summary.items_subtotal || 0)}</p>
                    </div>
                    <div className="bg-cyan-50 rounded-lg border border-cyan-300 p-3">
                      <p className="text-xs text-gray-600 mb-1">Preliminary Amount:</p>
                      <p className="text-lg font-bold text-cyan-700">{formatCurrency(data.summary.preliminaries.client_amount || 0)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg border border-green-300 p-3">
                      <p className="text-xs text-gray-600 mb-1">Grand Total:</p>
                      <p className="text-lg font-bold text-green-700">{formatCurrency(data.summary.grand_total_with_preliminaries || 0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Variance Summary */}
          <div className="bg-white rounded-lg border border-gray-300 shadow-md overflow-hidden">
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
              <h4 className="text-base font-bold text-gray-900">Overall Variance</h4>
              <p className="text-xs text-gray-600 mt-1">Difference between actual spending and planned budget</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Sub Item Cost Variance:</p>
                  <p className={`text-lg font-bold ${
                    (data.summary.actual_materials_total || 0) - (data.summary.planned_materials_total || 0) > 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(Math.abs((data.summary.actual_materials_total || 0) - (data.summary.planned_materials_total || 0)))}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Labour Cost Variance:</p>
                  <p className={`text-lg font-bold ${
                    (data.summary.actual_labour_total || 0) - (data.summary.planned_labour_total || 0) > 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(Math.abs((data.summary.actual_labour_total || 0) - (data.summary.planned_labour_total || 0)))}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Miscellaneous Variance:</p>
                  <p className={`text-lg font-bold ${
                    (data.summary.total_actual_overhead || 0) - (data.summary.total_planned_overhead || 0) < 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(Math.abs((data.summary.total_actual_overhead || 0) - (data.summary.total_planned_overhead || 0)))}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Transport Variance:</p>
                  <p className={`text-lg font-bold ${
                    (data.summary.total_actual_transport || 0) - (data.summary.total_planned_transport || 0) !== 0
                      ? 'text-orange-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(Math.abs((data.summary.total_actual_transport || 0) - (data.summary.total_planned_transport || 0)))}
                  </p>
                </div>
                {/* REMOVED: O&P Variance - O&P is included in Negotiable Margin, not a separate cost */}
              </div>

              {/* Final Status */}
              <div className={`mt-6 rounded-lg border-2 p-6 ${
                (data.summary.total_actual_profit || 0) >= 0
                  ? 'bg-green-50 border-green-400'
                  : 'bg-red-50 border-red-400'
              }`}>
                <style>{`
                  @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                  }
                  @keyframes glow {
                    0%, 100% { box-shadow: 0 0 5px currentColor, 0 0 10px currentColor, 0 0 15px currentColor; }
                    50% { box-shadow: 0 0 10px currentColor, 0 0 20px currentColor, 0 0 30px currentColor; }
                  }
                  @keyframes pulse-glow {
                    0%, 100% { text-shadow: 0 0 10px currentColor; }
                    50% { text-shadow: 0 0 20px currentColor, 0 0 30px currentColor; }
                  }
                  .float-animation {
                    animation: float 3s ease-in-out infinite;
                  }
                  .glow-animation {
                    animation: glow 2s ease-in-out infinite;
                  }
                  .pulse-glow-animation {
                    animation: pulse-glow 2s ease-in-out infinite;
                  }
                `}</style>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-lg ${
                      (data.summary.negotiable_margin || 0) >= 0 ? 'bg-green-600' : 'bg-red-600'
                    }`}>
                      {(data.summary.negotiable_margin || 0) >= 0 ? '✓' : '✗'}
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 font-semibold uppercase mb-1">Final Project Status</p>
                      <p className={`text-2xl font-bold ${
                        (data.summary.negotiable_margin || 0) >= 0 ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {(data.summary.negotiable_margin || 0) >= 0 ? 'Profit Maintained' : 'Loss Incurred'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold mb-1 uppercase px-3 py-1 rounded-full inline-block ${
                      data.summary.status === 'under_budget' ? 'bg-green-100 text-green-700' :
                      data.summary.status === 'on_budget' ? 'bg-blue-100 text-blue-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {data.summary.status === 'on_budget' ? 'ON BUDGET' : data.summary.status === 'under_budget' ? 'UNDER BUDGET' : 'OVER BUDGET'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {data.summary.status === 'over_budget'
                        ? 'Spent more than planned'
                        : data.summary.status === 'under_budget'
                        ? 'Spent less than planned'
                        : 'Spending as planned'}
                    </p>
                    <div className="flex items-center justify-end gap-3 mt-2">
                      <p className={`text-3xl font-bold ${
                        (data.summary.negotiable_margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        AED{(data.summary.negotiable_margin || 0).toFixed(2)}
                      </p>
                      <button
                        onClick={() => setShowProfitCalculationModal(true)}
                        className="relative group"
                        title="View Calculation Details"
                      >
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all float-animation glow-animation ${
                          (data.summary.negotiable_margin || 0) >= 0 ? 'bg-blue-500 hover:bg-blue-600' : 'bg-orange-500 hover:bg-orange-600'
                        }`}>
                          <Calculator className="w-7 h-7 text-white" />
                        </div>
                      </button>
                    </div>
                    {/* Formula Explanation */}
                    <div className="text-[10px] text-blue-700 mt-3 italic bg-blue-100 px-3 py-2 rounded border border-blue-300">
                      <strong>Formula:</strong> Negotiable Margin = Grand Total - Actual Spending
                      <br />
                      = {formatCurrency(data.summary.grand_total_with_preliminaries || 0)} - {formatCurrency(data.summary.actual_spending || 0)}
                      <br />
                      = {formatCurrency(data.summary.negotiable_margin || 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown Modal - Same as before */}
      {showBreakdownModal && selectedItemForBreakdown && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto"
          >
            <div className="bg-gradient-to-r from-[#243d8a] to-[#4a5fa8] px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Profit/Loss Breakdown: {selectedItemForBreakdown.item_name}</h3>
              <button
                onClick={closeBreakdownModal}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Planned Breakdown */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 border-2 border-blue-300">
                <h4 className="font-bold text-blue-900 mb-3">Planned Financial Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1">
                    <span>Sub Item Cost:</span>
                    <span className="font-semibold">{formatCurrency(selectedItemForBreakdown.planned.materials_total)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Labour Cost:</span>
                    <span className="font-semibold">{formatCurrency(selectedItemForBreakdown.planned.labour_total)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-t-2 border-blue-300 pt-2 font-semibold">
                    <span>Base Cost:</span>
                    <span>{formatCurrency(selectedItemForBreakdown.planned.base_cost)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Miscellaneous ({(selectedItemForBreakdown.planned.miscellaneous_percentage || 0).toFixed(1)}%):</span>
                    <span className="font-semibold">{formatCurrency(selectedItemForBreakdown.planned.miscellaneous_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Overhead & Profit:</span>
                    <span className="font-semibold">{formatCurrency((selectedItemForBreakdown.planned.overhead_amount || 0) + (selectedItemForBreakdown.planned.profit_amount || 0))}</span>
                  </div>
                </div>
              </div>

              {/* Actual Breakdown */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border-2 border-purple-300">
                <h4 className="font-bold text-purple-900 mb-3">Actual Financial Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1">
                    <span>Sub Item Cost:</span>
                    <span className={`font-semibold ${
                      selectedItemForBreakdown.actual.materials_total > selectedItemForBreakdown.planned.materials_total
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}>
                      {formatCurrency(selectedItemForBreakdown.actual.materials_total)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Labour Cost:</span>
                    <span className={`font-semibold ${
                      selectedItemForBreakdown.actual.labour_total > selectedItemForBreakdown.planned.labour_total
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}>
                      {formatCurrency(selectedItemForBreakdown.actual.labour_total)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-t-2 border-purple-300 pt-2 font-semibold">
                    <span>Base Cost:</span>
                    <span className={
                      selectedItemForBreakdown.actual.base_cost > selectedItemForBreakdown.planned.base_cost
                        ? 'text-red-600'
                        : 'text-green-600'
                    }>
                      {formatCurrency(selectedItemForBreakdown.actual.base_cost)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Miscellaneous ({(selectedItemForBreakdown.actual.miscellaneous_percentage || 0).toFixed(1)}%):</span>
                    <span className="font-semibold">{formatCurrency(selectedItemForBreakdown.actual.miscellaneous_amount || 0)}</span>
                  </div>
                  {/* REMOVED: O&P is NOT a cost - it's included in Negotiable Margin */}
                  <div className="flex justify-between py-1">
                    <span>Transport ({(selectedItemForBreakdown.actual.transport_percentage || 0).toFixed(1)}%):</span>
                    <span className="font-semibold">{formatCurrency(selectedItemForBreakdown.actual.transport_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-xs italic text-gray-500">
                    <span>Actual Spending:</span>
                    <span className="font-semibold">{formatCurrency(selectedItemForBreakdown.actual.spending || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Variance */}
              <div className="bg-yellow-50 rounded-lg p-4 border-2 border-yellow-300">
                <h4 className="font-bold text-yellow-900 mb-3">Variance Analysis</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Sub Item Cost Variance:</span>
                    <span className={`font-semibold ${
                      (selectedItemForBreakdown.actual.materials_total - selectedItemForBreakdown.planned.materials_total) > 0
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}>
                      {(selectedItemForBreakdown.actual.materials_total - selectedItemForBreakdown.planned.materials_total) > 0 ? '+' : ''}
                      {formatCurrency(Math.abs(selectedItemForBreakdown.actual.materials_total - selectedItemForBreakdown.planned.materials_total))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Labour Cost Variance:</span>
                    <span className={`font-semibold ${
                      (selectedItemForBreakdown.actual.labour_total - selectedItemForBreakdown.planned.labour_total) > 0
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}>
                      {(selectedItemForBreakdown.actual.labour_total - selectedItemForBreakdown.planned.labour_total) > 0 ? '+' : ''}
                      {formatCurrency(Math.abs(selectedItemForBreakdown.actual.labour_total - selectedItemForBreakdown.planned.labour_total))}
                    </span>
                  </div>
                  {/* REMOVED: O&P Variance - O&P is included in Negotiable Margin, not a separate cost */}
                  {(() => {
                    const materialVariance = selectedItemForBreakdown.actual.materials_total - selectedItemForBreakdown.planned.materials_total;
                    const labourVariance = selectedItemForBreakdown.actual.labour_total - selectedItemForBreakdown.planned.labour_total;
                    const hasCostVariance = materialVariance !== 0 || labourVariance !== 0;

                    // Only show negotiable margin section if there are cost variances
                    if (hasCostVariance) {
                      return (
                        <div className="mt-3 pt-3 border-t border-yellow-400 bg-blue-50 rounded p-3">
                          <div className="text-xs font-semibold text-blue-900 mb-2">
                            Impact on Profit Margin
                          </div>
                          <div className="text-xs text-gray-600 mb-2">
                            Cost overruns have reduced the available profit margin.
                          </div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-600">Planned Negotiable Margin:</span>
                            <span className="text-sm font-semibold">{formatCurrency(selectedItemForBreakdown.planned.profit_amount)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-600">Actual Margin Available:</span>
                            <span className={`text-lg font-bold ${
                              selectedItemForBreakdown.actual.profit_amount >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {formatCurrency(selectedItemForBreakdown.actual.profit_amount)}
                            </span>
                          </div>
                          {selectedItemForBreakdown.actual.profit_amount < selectedItemForBreakdown.planned.profit_amount && (
                            <div className="mt-2 text-xs text-orange-700 bg-orange-100 rounded p-2">
                              ⚠️ Margin reduced by {formatCurrency(selectedItemForBreakdown.planned.profit_amount - selectedItemForBreakdown.actual.profit_amount)} due to cost overruns
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Profit Calculation Modal */}
      {showProfitCalculationModal && data && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto"
          >
            <div className="bg-gradient-to-r from-[#243d8a] to-[#4a5fa8] px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Profit Calculation Details</h3>
              <button
                onClick={() => setShowProfitCalculationModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Client Amount */}
              <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-300">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-blue-900 mb-1">Client Amount</p>
                    <p className="text-xs text-gray-600">What the client pays you (Grand Total)</p>
                  </div>
                  <p className="text-2xl font-bold text-blue-700">
                    {formatCurrency(data.summary.grand_total_with_preliminaries || data.summary.client_amount_after_discount || 0)}
                  </p>
                </div>
              </div>

              {/* Total Actual Spending Breakdown */}
              <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-300">
                <p className="text-sm font-semibold text-gray-900 mb-3">Total Actual Spending Breakdown</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Material Total:</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(data.summary.actual_materials_total || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Labour Total:</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(data.summary.actual_labour_total || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-t border-gray-300 pt-2">
                    <span className="text-gray-700 font-semibold">Base Cost:</span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency((data.summary.actual_materials_total || 0) + (data.summary.actual_labour_total || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Miscellaneous:</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(data.summary.total_actual_miscellaneous || 0)}
                    </span>
                  </div>
                  {/* REMOVED: O&P is NOT part of actual spending - it's included in Negotiable Margin */}
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Transport:</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(data.summary.total_actual_transport || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-gray-400 pt-2">
                    <span className="text-gray-900 font-bold">Total Actual Spending:</span>
                    <span className="font-bold text-red-600 text-lg">
                      {formatCurrency(data.summary.actual_spending || 0)}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1 italic">
                    = {formatCurrency(data.summary.actual_materials_total || 0)} + {formatCurrency(data.summary.actual_labour_total || 0)} + {formatCurrency(data.summary.total_actual_miscellaneous || 0)} + {formatCurrency(data.summary.total_actual_transport || 0)}
                  </div>
                </div>
              </div>

              {/* Calculation Formula */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border-2 border-green-300">
                <p className="text-sm font-semibold text-green-900 mb-3">Negotiable Margin Calculation</p>
                <p className="text-xs text-gray-600 mb-3 italic">Formula: Client Amount - (Materials + Labour + Misc + Transport)</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-gray-700">Client Amount (After Discount):</span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(data.summary.grand_total_with_preliminaries || data.summary.client_amount_after_discount || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-gray-700 flex items-center gap-2">
                      <span className="text-xl">−</span> Actual Spending (Mat + Lab + Misc + Trans):
                    </span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(data.summary.actual_spending || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-t-2 border-green-400 pt-3">
                    <span className="text-green-900 font-bold flex items-center gap-2">
                      <span className="text-xl">=</span> Negotiable Margin (includes O&P):
                    </span>
                    <span className={`font-bold text-2xl ${
                      ((data.summary.grand_total_with_preliminaries || data.summary.client_amount_after_discount || 0) - (data.summary.actual_spending || 0)) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency((data.summary.grand_total_with_preliminaries || data.summary.client_amount_after_discount || 0) - (data.summary.actual_spending || 0))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Explanation */}
              <div className="bg-yellow-50 rounded-lg p-4 border-2 border-yellow-300">
                <p className="text-sm font-semibold text-yellow-900 mb-3">Status Explanation</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 ${
                      (data.summary.negotiable_margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {(data.summary.negotiable_margin || 0) >= 0 ? '✓' : '✗'}
                    </span>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {(data.summary.negotiable_margin || 0) >= 0 ? 'Profit Maintained' : 'Loss Incurred'}
                      </p>
                      <p className="text-gray-600 text-xs">
                        {(data.summary.negotiable_margin || 0) >= 0
                          ? `The project is profitable because the negotiable margin (${formatCurrency(data.summary.negotiable_margin || 0)}) is positive.`
                          : `The project has a loss because actual spending exceeds client amount.`
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 mt-3">
                    <span className={`mt-0.5 ${
                      data.summary.status === 'over_budget' ? 'text-orange-600' : 'text-green-600'
                    }`}>
                      {data.summary.status === 'over_budget' ? '⚠' : '✓'}
                    </span>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {data.summary.status === 'on_budget' ? 'On Budget'
                          : data.summary.status === 'under_budget' ? 'Under Budget'
                          : 'Over Budget'}
                      </p>
                      <p className="text-gray-600 text-xs">
                        {data.summary.status === 'over_budget'
                          ? `You spent ${formatCurrency(data.summary.variance || 0)} more than planned (${formatCurrency(data.summary.actual_total || 0)} vs ${formatCurrency(data.summary.planned_total || 0)}). This is a budget tracking reference - it does not affect profitability.`
                          : data.summary.status === 'under_budget'
                          ? `You spent ${formatCurrency(data.summary.variance || 0)} less than planned. Good cost control!`
                          : 'You spent exactly what was planned.'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (1,072 lines)
export default React.memo(PlannedVsActualView);
