import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TruckIcon,
  CubeIcon,
  ArrowLeftIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  UserGroupIcon,
  ClockIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { boqTrackingService } from '../../roles/project-manager/services/boqTrackingService';
import { showError, showSuccess } from '@/utils/toastHelper';
import ModernLoadingSpinners from '../ui/ModernLoadingSpinners';

type FilterType = 'transport' | 'materials' | 'labour';

interface ProfitReportViewProps {
  boq: any;
  onClose: () => void;
}

const formatCurrency = (val: number) =>
  `AED ${(val || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (iso: string | null) => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '-';
  }
};

const VarianceBadge: React.FC<{ variance: number; status: string }> = ({ variance, status }) => {
  if (status === 'under') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        <ArrowTrendingDownIcon className="w-3 h-3" />
        Saved {formatCurrency(Math.abs(variance))}
      </span>
    );
  }
  if (status === 'over') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <ArrowTrendingUpIcon className="w-3 h-3" />
        Over {formatCurrency(Math.abs(variance))}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
      <MinusIcon className="w-3 h-3" />
      On Plan
    </span>
  );
};

const SummaryCard: React.FC<{
  label: string; planned: number; actual: number; variance: number; variancePct: number;
}> = ({ label, planned, actual, variance, variancePct }) => {
  const isOver = actual > planned;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{label}</p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] text-gray-400 mb-0.5">Planned</p>
          <p className="text-sm font-bold text-gray-800">{formatCurrency(planned)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 mb-0.5">Actual</p>
          <p className={`text-sm font-bold ${isOver ? 'text-red-600' : 'text-green-600'}`}>
            {formatCurrency(actual)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 mb-0.5">Variance</p>
          <p className={`text-sm font-bold ${isOver ? 'text-red-600' : 'text-green-600'}`}>
            {isOver ? '+' : '-'}{formatCurrency(Math.abs(variance))}
            <span className="text-xs font-normal ml-1">({Math.abs(variancePct).toFixed(1)}%)</span>
          </p>
        </div>
      </div>
    </div>
  );
};

const StatChip: React.FC<{ icon: React.ElementType; label: string; value: string; color: string }> = ({
  icon: Icon, label, value, color,
}) => (
  <div className={`flex items-center gap-3 bg-${color}-50 border border-${color}-200 rounded-xl px-4 py-3`}>
    <div className={`p-2 bg-${color}-100 rounded-lg`}>
      <Icon className={`w-5 h-5 text-${color}-600`} />
    </div>
    <div>
      <p className="text-[10px] text-gray-500 font-medium">{label}</p>
      <p className={`text-base font-bold text-${color}-700`}>{value}</p>
    </div>
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = (status || '').toLowerCase();
  let cls = 'bg-gray-100 text-gray-600';
  if (s === 'approved') cls = 'bg-green-100 text-green-700';
  else if (s === 'pending') cls = 'bg-yellow-100 text-yellow-700';
  else if (s === 'rejected') cls = 'bg-red-100 text-red-700';
  else if (s === 'assigned' || s === 'fully_assigned') cls = 'bg-blue-100 text-blue-700';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {status || '-'}
    </span>
  );
};

const ProfitReportView: React.FC<ProfitReportViewProps> = ({ boq, onClose }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('transport');
  const [downloadingPDF, setDownloadingPDF] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        const result = await boqTrackingService.getProfitReport(boq.boq_id);
        setData(result);
      } catch (err: any) {
        showError(err?.response?.data?.error || 'Failed to load profit report');
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [boq.boq_id]);

  // ─── Shared PDF header ────────────────────────────────────────────────────
  const addPDFHeader = async (doc: any, pageWidth: number, reportTitle: string): Promise<number> => {
    const margin = 14;
    const logoUrl = 'https://i.postimg.cc/q7x6zrYt/logo.png';
    let logoLoaded = false;
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        logoImg.onload = () => { doc.addImage(logoImg, 'PNG', margin, 8, 50, 12); logoLoaded = true; resolve(); };
        logoImg.onerror = () => resolve();
        logoImg.src = logoUrl;
      });
    } catch {}
    if (!logoLoaded) {
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
      doc.text('METER SQUARE', margin, 14);
    }
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50);
    doc.text('METERSQUARE INTERIORS LLC', pageWidth - margin, 12, { align: 'right' });
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(128, 128, 128);
    doc.text('Business Bay, Dubai, UAE', pageWidth - margin, 18, { align: 'right' });
    doc.setDrawColor(236, 32, 36); doc.setLineWidth(0.5);
    doc.line(margin, 24, pageWidth / 2, 24);
    doc.setDrawColor(30, 64, 175);
    doc.line(pageWidth / 2, 24, pageWidth - margin, 24);
    const cx = pageWidth / 2;
    doc.setFontSize(7);
    doc.setTextColor(236, 32, 36); doc.text('Sharjah', cx - 68, 30);
    doc.setTextColor(100, 100, 100); doc.text('P.O. Box 66015 | Tel: 06 5398189', cx - 56, 30);
    doc.setTextColor(180, 180, 180); doc.text('|', cx, 30, { align: 'center' });
    doc.setTextColor(30, 64, 175); doc.text('Dubai', cx + 5, 30);
    doc.setTextColor(100, 100, 100); doc.text('P.O. Box 89381 | Tel: 04 2596772', cx + 15, 30);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(34, 139, 34);
    doc.text(reportTitle, pageWidth / 2, 40, { align: 'center' });
    return 50;
  };

  // ─── Transport PDF ─────────────────────────────────────────────────────────
  const handleDownloadTransportPDF = async () => {
    if (!data) return;
    setDownloadingPDF(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      let yPos = await addPDFHeader(doc, pageWidth, 'Transport Report');

      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
      doc.text(`Project: ${boq.project_name}`, margin, yPos);
      doc.text(`BOQ #${boq.boq_id}  |  Generated: ${new Date().toLocaleString('en-GB')}`, margin, yPos + 6);

      const planned = data.transport?.planned || 0;
      const actual = data.transport?.actual || 0;
      const variance = planned - actual;
      doc.setFillColor(239, 246, 255);
      doc.rect(pageWidth - 95, yPos - 4, 81, 22, 'F');
      doc.setFontSize(8); doc.setTextColor(60);
      doc.text(`Planned: AED ${planned.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, pageWidth - 92, yPos + 2);
      doc.text(`Actual:  AED ${actual.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, pageWidth - 92, yPos + 8);
      doc.setTextColor(variance >= 0 ? 34 : 220, variance >= 0 ? 139 : 53, variance >= 0 ? 34 : 69);
      doc.setFont('helvetica', 'bold');
      doc.text(`Variance: AED ${Math.abs(variance).toLocaleString('en-AE', { minimumFractionDigits: 2 })} ${variance >= 0 ? '(Saved)' : '(Over)'}`, pageWidth - 92, yPos + 14);
      doc.setFont('helvetica', 'normal');
      yPos += 22;

      const details = data.transport?.details || [];
      if (details.length === 0) {
        doc.setFontSize(10); doc.setTextColor(150);
        doc.text('No transport records found', pageWidth / 2, yPos + 10, { align: 'center' });
      } else {
        const rows = details.map((r: any) => [
          r.purpose || '-', r.driver_name || '-', r.vehicle_number || '-',
          r.driver_contact || '-', r.reference || '-',
          formatDate(r.date), r.status || '-',
          `AED ${(r.amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}`
        ]);
        autoTable(doc, {
          startY: yPos,
          head: [['Purpose', 'Driver', 'Vehicle', 'Contact', 'Reference', 'Date', 'Status', 'Amount']],
          body: rows,
          foot: [['Total Actual Transport', '', '', '', '', '', '', `AED ${actual.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`]],
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 7, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7 },
          footStyles: { fillColor: [240, 248, 255], textColor: [30, 30, 30], fontStyle: 'bold', fontSize: 8 },
          columnStyles: { 7: { halign: 'right' } },
          margin: { left: margin, right: margin }
        });
      }

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150);
        doc.text(`Page ${i} of ${pageCount} | MeterSquare – Transport Report`, pageWidth / 2, pageHeight - 8, { align: 'center' });
      }
      const safe = (boq.project_name || 'Project').replace(/[^a-zA-Z0-9]/g, '_');
      doc.save(`Transport_Report_${safe}_${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Transport PDF downloaded');
    } catch (err) {
      console.error(err); showError('Failed to generate Transport PDF');
    } finally { setDownloadingPDF(false); }
  };

  // ─── Material PDF ──────────────────────────────────────────────────────────
  const handleDownloadMaterialPDF = async () => {
    if (!data) return;
    setDownloadingPDF(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      let yPos = await addPDFHeader(doc, pageWidth, 'Material Comparison Report');

      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
      doc.text(`Project: ${boq.project_name}`, margin, yPos);
      doc.text(`BOQ #${boq.boq_id}  |  Generated: ${new Date().toLocaleString('en-GB')}`, margin, yPos + 6);

      const planned = data.materials?.planned || 0;
      const actual = data.materials?.actual || 0;
      const variance = planned - actual;
      doc.setFillColor(240, 253, 244);
      doc.rect(pageWidth - 95, yPos - 4, 81, 22, 'F');
      doc.setFontSize(8); doc.setTextColor(60);
      doc.text(`Planned: AED ${planned.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, pageWidth - 92, yPos + 2);
      doc.text(`Actual:  AED ${actual.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, pageWidth - 92, yPos + 8);
      doc.setTextColor(variance >= 0 ? 34 : 220, variance >= 0 ? 139 : 53, variance >= 0 ? 34 : 69);
      doc.setFont('helvetica', 'bold');
      doc.text(`Variance: AED ${Math.abs(variance).toLocaleString('en-AE', { minimumFractionDigits: 2 })} ${variance >= 0 ? '(Saved)' : '(Over)'}`, pageWidth - 92, yPos + 14);
      doc.setFont('helvetica', 'normal');
      yPos += 22;

      const details = data.materials?.details || [];
      if (details.length === 0) {
        doc.setFontSize(10); doc.setTextColor(150);
        doc.text('No material data found', pageWidth / 2, yPos + 10, { align: 'center' });
      } else {
        const rows = details.map((r: any) => {
          const isCR = Boolean(r.is_new_cr_material);
          const vatAmt = r.vat_amount || 0;
          const actAmtLabel = `AED ${((r.actual_amount || 0) + vatAmt).toLocaleString('en-AE', { minimumFractionDigits: 2 })}`;
          return [
            isCR ? `${r.material_name} [NEW·CR#${r.cr_id}]` : r.material_name,
            r.item_name || '-', r.unit || '-',
            isCR ? 'New' : (r.planned_quantity > 0 ? r.planned_quantity.toFixed(2) : '-'),
            isCR ? '-' : (r.planned_rate > 0 ? `AED ${r.planned_rate.toLocaleString('en-AE', { minimumFractionDigits: 2 })}` : '-'),
            isCR ? '-' : `AED ${(r.planned_amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}`,
            r.actual_quantity > 0 ? r.actual_quantity.toFixed(2) : '-',
            r.actual_rate > 0 ? `AED ${r.actual_rate.toLocaleString('en-AE', { minimumFractionDigits: 2 })}` : '-',
            actAmtLabel,
            isCR ? 'Unplanned' : (r.status === 'over' ? 'Over Budget' : r.status === 'under' ? 'Saved' : 'On Plan')
          ];
        });
        autoTable(doc, {
          startY: yPos,
          head: [['Material', 'Item', 'Unit', 'Plan Qty', 'Plan Rate', 'Plan Amount', 'Act Qty', 'Act Rate', 'Act Amount', 'Variance']],
          body: rows,
          foot: [['Total', '', '', '', '', `AED ${planned.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, '', '', `AED ${actual.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, '']],
          theme: 'striped',
          headStyles: { fillColor: [147, 51, 234], textColor: 255, fontSize: 6.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 6.5 },
          footStyles: { fillColor: [250, 245, 255], textColor: [30, 30, 30], fontStyle: 'bold', fontSize: 7 },
          columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'center' } },
          margin: { left: margin, right: margin }
        });
      }

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150);
        doc.text(`Page ${i} of ${pageCount} | MeterSquare – Material Comparison Report`, pageWidth / 2, pageHeight - 8, { align: 'center' });
      }
      const safe = (boq.project_name || 'Project').replace(/[^a-zA-Z0-9]/g, '_');
      doc.save(`Material_Report_${safe}_${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Material PDF downloaded');
    } catch (err) {
      console.error(err); showError('Failed to generate Material PDF');
    } finally { setDownloadingPDF(false); }
  };

  // ─── Labour PDF ────────────────────────────────────────────────────────────
  const handleDownloadLabourPDF = async () => {
    if (!data) return;
    setDownloadingPDF(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      let yPos = await addPDFHeader(doc, pageWidth, 'Labour Report');

      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
      doc.text(`Project: ${boq.project_name}`, margin, yPos);
      doc.text(`BOQ #${boq.boq_id}  |  Generated: ${new Date().toLocaleString('en-GB')}`, margin, yPos + 6);

      const planned = data.labour?.planned || 0;
      const actual = data.labour?.actual || 0;
      const variance = planned - actual;
      const summary = data.labour?.summary || {};
      doc.setFillColor(255, 237, 213);
      doc.rect(pageWidth - 95, yPos - 4, 81, 22, 'F');
      doc.setFontSize(8); doc.setTextColor(60);
      doc.text(`Planned: AED ${planned.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, pageWidth - 92, yPos + 2);
      doc.text(`Actual:  AED ${actual.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, pageWidth - 92, yPos + 8);
      doc.setTextColor(variance >= 0 ? 34 : 220, variance >= 0 ? 139 : 53, variance >= 0 ? 34 : 69);
      doc.setFont('helvetica', 'bold');
      doc.text(`Variance: AED ${Math.abs(variance).toLocaleString('en-AE', { minimumFractionDigits: 2 })} ${variance >= 0 ? '(Saved)' : '(Over)'}`, pageWidth - 92, yPos + 14);
      doc.setFont('helvetica', 'normal');
      yPos += 22;

      doc.setFontSize(7.5); doc.setTextColor(80);
      doc.text(
        `Workers: ${summary.total_workers || 0}  |  Work Days: ${summary.total_working_days || 0}  |  Total Hrs: ${(summary.total_hours || 0).toFixed(1)}  |  Regular: ${(summary.regular_hours || 0).toFixed(1)}  |  Overtime: ${(summary.overtime_hours || 0).toFixed(1)}  |  Requisitions: ${summary.total_requisitions || 0}`,
        margin, yPos
      );
      yPos += 8;

      // Planned workers table
      const plannedWorkers = data.labour?.planned_workers || [];
      if (plannedWorkers.length > 0) {
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(59, 130, 246);
        doc.text('Planned Labour Breakdown', margin, yPos);
        yPos += 4;
        autoTable(doc, {
          startY: yPos,
          head: [[
            { content: 'Role', styles: { halign: 'left' } },
            { content: 'BOQ Item', styles: { halign: 'left' } },
            { content: 'Planned Hours', styles: { halign: 'right' } },
            { content: 'Rate / Hr', styles: { halign: 'right' } },
            { content: 'Planned Cost', styles: { halign: 'right' } },
          ]],
          body: plannedWorkers.map((pw: any) => [
            pw.labour_role || '-', pw.item_name || '-',
            `${(pw.hours || 0).toFixed(1)} hrs`,
            `AED ${(pw.rate_per_hour || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}`,
            `AED ${(pw.total || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}`
          ]),
          foot: [[
            { content: 'Total Planned Labour', colSpan: 4, styles: { halign: 'left' } },
            { content: `AED ${planned.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, styles: { halign: 'right' } },
          ]],
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 7, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7 },
          footStyles: { fillColor: [239, 246, 255], textColor: [30, 30, 30], fontStyle: 'bold', fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 65 },
            1: { cellWidth: 95 },
            2: { cellWidth: 33, halign: 'right' },
            3: { cellWidth: 38, halign: 'right' },
            4: { cellWidth: 38, halign: 'right' },
          },
          margin: { left: margin, right: margin }
        });
        yPos = (doc as any).lastAutoTable.finalY + 8;
      }

      // Actual workers table
      const workers = data.labour?.workers || [];
      if (workers.length > 0) {
        if (yPos > pageHeight - 60) { doc.addPage(); yPos = 14; }
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(234, 88, 12);
        doc.text('Actual Worker Breakdown', margin, yPos);
        yPos += 4;
        autoTable(doc, {
          startY: yPos,
          head: [[
            { content: 'Code', styles: { halign: 'left' } },
            { content: 'Worker Name', styles: { halign: 'left' } },
            { content: 'Role', styles: { halign: 'left' } },
            { content: 'Phone', styles: { halign: 'left' } },
            { content: 'Work Days', styles: { halign: 'center' } },
            { content: 'Reg. Hrs', styles: { halign: 'right' } },
            { content: 'OT Hrs', styles: { halign: 'right' } },
            { content: 'Total Hrs', styles: { halign: 'right' } },
            { content: 'Rate/Hr', styles: { halign: 'right' } },
            { content: 'Total Cost', styles: { halign: 'right' } },
          ]],
          body: workers.map((w: any) => [
            w.worker_code || '-', w.worker_name || '-', w.labour_role || '-', w.phone || '-',
            String(w.working_days || 0), (w.regular_hours || 0).toFixed(1),
            (w.overtime_hours || 0).toFixed(1), (w.total_hours || 0).toFixed(1),
            `AED ${(w.avg_hourly_rate || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}`,
            `AED ${(w.total_cost || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}`
          ]),
          foot: [[
            { content: `Total (${workers.length})`, colSpan: 4, styles: { halign: 'left' } },
            { content: String(summary.total_working_days || 0), styles: { halign: 'center' } },
            { content: (summary.regular_hours || 0).toFixed(1), styles: { halign: 'right' } },
            { content: (summary.overtime_hours || 0).toFixed(1), styles: { halign: 'right' } },
            { content: (summary.total_hours || 0).toFixed(1), styles: { halign: 'right' } },
            { content: '', styles: { halign: 'right' } },
            { content: `AED ${actual.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, styles: { halign: 'right' } },
          ]],
          theme: 'striped',
          headStyles: { fillColor: [249, 115, 22], textColor: 255, fontSize: 6.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 6.5 },
          footStyles: { fillColor: [255, 247, 237], textColor: [30, 30, 30], fontStyle: 'bold', fontSize: 7 },
          columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 40 },
            2: { cellWidth: 30 },
            3: { cellWidth: 35 },
            4: { cellWidth: 18, halign: 'center' },
            5: { cellWidth: 18, halign: 'right' },
            6: { cellWidth: 16, halign: 'right' },
            7: { cellWidth: 18, halign: 'right' },
            8: { cellWidth: 36, halign: 'right' },
            9: { cellWidth: 36, halign: 'right' },
          },
          margin: { left: margin, right: margin }
        });
        yPos = (doc as any).lastAutoTable.finalY + 8;
      }

      // Requisitions table
      const requisitions = data.labour?.requisitions || [];
      if (requisitions.length > 0) {
        if (yPos > pageHeight - 60) { doc.addPage(); yPos = 14; }
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(13, 148, 136);
        doc.text('Labour Requisitions', margin, yPos);
        yPos += 4;
        autoTable(doc, {
          startY: yPos,
          head: [[
            { content: 'Req Code', styles: { halign: 'left' } },
            { content: 'Site', styles: { halign: 'left' } },
            { content: 'Date', styles: { halign: 'left' } },
            { content: 'Skill / Role', styles: { halign: 'left' } },
            { content: 'Requested By', styles: { halign: 'left' } },
            { content: 'Req.', styles: { halign: 'center' } },
            { content: 'Assigned', styles: { halign: 'center' } },
            { content: 'Attended', styles: { halign: 'center' } },
            { content: 'Hours', styles: { halign: 'right' } },
            { content: 'Cost', styles: { halign: 'right' } },
            { content: 'Status', styles: { halign: 'center' } },
          ]],
          body: requisitions.map((r: any) => [
            r.requisition_code || '-', r.site_name || '-', formatDate(r.required_date),
            r.skill_summary || '-', r.requested_by || '-',
            String(r.workers_requested || '-'), String(r.workers_assigned || 0),
            String(r.workers_attended || 0),
            r.total_hours > 0 ? r.total_hours.toFixed(1) : '-',
            r.total_cost > 0 ? `AED ${r.total_cost.toLocaleString('en-AE', { minimumFractionDigits: 2 })}` : '-',
            r.status || '-'
          ]),
          theme: 'striped',
          headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 6.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 6.5 },
          columnStyles: {
            0: { cellWidth: 24 },
            1: { cellWidth: 32 },
            2: { cellWidth: 24 },
            3: { cellWidth: 38 },
            4: { cellWidth: 32 },
            5: { cellWidth: 15, halign: 'center' },
            6: { cellWidth: 17, halign: 'center' },
            7: { cellWidth: 17, halign: 'center' },
            8: { cellWidth: 15, halign: 'right' },
            9: { cellWidth: 35, halign: 'right' },
            10: { cellWidth: 20, halign: 'center' },
          },
          margin: { left: margin, right: margin }
        });
      }

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150);
        doc.text(`Page ${i} of ${pageCount} | MeterSquare – Labour Report`, pageWidth / 2, pageHeight - 8, { align: 'center' });
      }
      const safe = (boq.project_name || 'Project').replace(/[^a-zA-Z0-9]/g, '_');
      doc.save(`Labour_Report_${safe}_${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Labour PDF downloaded');
    } catch (err) {
      console.error(err); showError('Failed to generate Labour PDF');
    } finally { setDownloadingPDF(false); }
  };

  const filters: { key: FilterType; label: string; icon: React.ElementType; color: string }[] = [
    { key: 'transport', label: 'Transport', icon: TruckIcon, color: 'blue' },
    { key: 'materials', label: 'Material', icon: CubeIcon, color: 'purple' },
    { key: 'labour', label: 'Labour', icon: UserGroupIcon, color: 'orange' },
  ];

  const colorMap: Record<string, { active: string }> = {
    blue:   { active: 'bg-blue-600 text-white shadow-md' },
    purple: { active: 'bg-purple-600 text-white shadow-md' },
    orange: { active: 'bg-orange-500 text-white shadow-md' },
  };

  const purposeColorMap: Record<string, string> = {
    'Store to Site': 'bg-blue-100 text-blue-700',
    'Site to Store (Return)': 'bg-orange-100 text-orange-700',
    'Vendor to Store': 'bg-purple-100 text-purple-700',
    'Labour Transport': 'bg-yellow-100 text-yellow-700',
    'Asset Delivery': 'bg-teal-100 text-teal-700',
    'Asset Return': 'bg-pink-100 text-pink-700',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1600px] mx-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800">{boq.project_name}</h1>
            <p className="text-sm text-gray-500">BOQ #{boq.boq_id} · Profit Report</p>
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-xl shadow-sm p-16 flex flex-col items-center justify-center">
            <ModernLoadingSpinners size="xl" />
            <p className="mt-4 text-gray-600 font-medium">Loading report...</p>
          </div>
        )}

        {!loading && data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <SummaryCard
                label="Transport"
                planned={data.transport?.planned || 0}
                actual={data.transport?.actual || 0}
                variance={data.transport?.variance || 0}
                variancePct={data.transport?.variance_pct || 0}
              />
              <SummaryCard
                label="Materials"
                planned={data.materials?.planned || 0}
                actual={data.materials?.actual || 0}
                variance={data.materials?.variance || 0}
                variancePct={data.materials?.variance_pct || 0}
              />
              <SummaryCard
                label="Labour"
                planned={data.labour?.planned || 0}
                actual={data.labour?.actual || 0}
                variance={data.labour?.variance || 0}
                variancePct={data.labour?.variance_pct || 0}
              />
            </div>

            {/* Filter Tabs */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
                {filters.map((f) => {
                  const isActive = activeFilter === f.key;
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setActiveFilter(f.key)}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                        isActive ? colorMap[f.color].active : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {f.label}
                    </button>
                  );
                })}

                {/* Per-tab PDF download button */}
                <div className="ml-auto">
                  <button
                    onClick={() => {
                      if (activeFilter === 'transport') handleDownloadTransportPDF();
                      else if (activeFilter === 'materials') handleDownloadMaterialPDF();
                      else handleDownloadLabourPDF();
                    }}
                    disabled={downloadingPDF}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                    title={`Download ${activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)} PDF`}
                  >
                    {downloadingPDF ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ArrowDownTrayIcon className="w-4 h-4" />
                    )}
                    <span>
                      {downloadingPDF ? 'Generating...' : `Download ${activeFilter === 'transport' ? 'Transport' : activeFilter === 'materials' ? 'Material' : 'Labour'} PDF`}
                    </span>
                  </button>
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeFilter}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="p-6"
                >
                  {/* ======================== TRANSPORT ======================== */}
                  {activeFilter === 'transport' && (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-gray-800">Transport Comparison</h2>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-500">Planned: <strong className="text-gray-800">{formatCurrency(data.transport?.planned || 0)}</strong></span>
                          <span className="text-gray-500">Actual: <strong className={data.transport?.actual > data.transport?.planned ? 'text-red-600' : 'text-green-600'}>{formatCurrency(data.transport?.actual || 0)}</strong></span>
                        </div>
                      </div>
                      {(!data.transport?.details || data.transport.details.length === 0) ? (
                        <div className="text-center py-12">
                          <TruckIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 font-medium">No transport records found</p>
                          <p className="text-sm text-gray-400 mt-1">Transport fees will appear here when deliveries are recorded</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Purpose</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Driver</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Vehicle</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Contact</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Reference</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {data.transport.details.map((row: any, idx: number) => (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${purposeColorMap[row.purpose] || 'bg-gray-100 text-gray-600'}`}>{row.purpose}</span>
                                  </td>
                                  <td className="px-4 py-3 font-medium text-gray-800">{row.driver_name}</td>
                                  <td className="px-4 py-3 text-gray-600">{row.vehicle_number}</td>
                                  <td className="px-4 py-3 text-gray-600">{row.driver_contact}</td>
                                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.reference}</td>
                                  <td className="px-4 py-3 text-gray-500">{formatDate(row.date)}</td>
                                  <td className="px-4 py-3 text-xs text-gray-500">{row.status}</td>
                                  <td className="px-4 py-3 text-right font-bold text-gray-800">{formatCurrency(row.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                              <tr>
                                <td colSpan={7} className="px-4 py-3 text-sm font-bold text-gray-700">Total Actual Transport</td>
                                <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(data.transport?.actual || 0)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </>
                  )}

                  {/* ======================== MATERIALS ======================== */}
                  {activeFilter === 'materials' && (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-gray-800">Material Comparison</h2>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-500">Planned: <strong className="text-gray-800">{formatCurrency(data.materials?.planned || 0)}</strong></span>
                          <span className="text-gray-500">Actual: <strong className={data.materials?.actual > data.materials?.planned ? 'text-red-600' : 'text-green-600'}>{formatCurrency(data.materials?.actual || 0)}</strong></span>
                        </div>
                      </div>
                      {(!data.materials?.details || data.materials.details.length === 0) ? (
                        <div className="text-center py-12">
                          <CubeIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 font-medium">No material data found</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Material</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Item</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Unit</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Act Qty</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Act Rate</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Act Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {data.materials.details.map((row: any, idx: number) => {
                                const isCR = Boolean(row.is_new_cr_material);
                                const isPending = isCR && row.actual_amount === 0;
                                const vatAmt = row.vat_amount || 0;
                                return (
                                <tr key={idx} className={`transition-colors ${isCR ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-gray-50'}`}>
                                  <td className="px-4 py-3 font-medium text-gray-800">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span>{row.material_name}</span>
                                      {isCR && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                                          NEW · CR #{row.cr_id}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-gray-500 text-xs">{row.item_name || '-'}</td>
                                  <td className="px-4 py-3 text-gray-500">{row.unit || '-'}</td>
                                  <td className="px-4 py-3 text-right text-gray-600">{row.actual_quantity > 0 ? row.actual_quantity.toFixed(2) : '-'}</td>
                                  <td className="px-4 py-3 text-right text-gray-600">{row.actual_rate > 0 ? formatCurrency(row.actual_rate) : '-'}</td>
                                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                                    {formatCurrency(row.actual_amount + vatAmt)}
                                    {vatAmt > 0 && (
                                      <div className="text-xs text-gray-400 font-normal mt-0.5">
                                        (incl. VAT {formatCurrency(vatAmt)})
                                      </div>
                                    )}
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                              <tr>
                                <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-700">Total</td>
                                <td colSpan={2}></td>
                                <td className="px-4 py-3 text-right font-bold text-gray-900">
                                  {formatCurrency((data.materials?.actual || 0) + (data.materials?.total_vat || 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </>
                  )}

                  {/* ======================== LABOUR ======================== */}
                  {activeFilter === 'labour' && (
                    <>
                      <div className="flex items-center justify-between mb-5">
                        <h2 className="text-base font-bold text-gray-800">Labour Report</h2>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-500">Planned: <strong className="text-gray-800">{formatCurrency(data.labour?.planned || 0)}</strong></span>
                          <span className="text-gray-500">Actual: <strong className={data.labour?.actual > data.labour?.planned ? 'text-red-600' : 'text-green-600'}>{formatCurrency(data.labour?.actual || 0)}</strong></span>
                        </div>
                      </div>

                      {/* Labour Stats Row */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                        <StatChip icon={UserGroupIcon} label="Total Workers" value={String(data.labour?.summary?.total_workers || 0)} color="orange" />
                        <StatChip icon={CalendarDaysIcon} label="Working Days" value={String(data.labour?.summary?.total_working_days || 0)} color="blue" />
                        <StatChip icon={ClockIcon} label="Total Hours" value={`${(data.labour?.summary?.total_hours || 0).toFixed(1)} hrs`} color="indigo" />
                        <StatChip icon={ClockIcon} label="Regular Hours" value={`${(data.labour?.summary?.regular_hours || 0).toFixed(1)} hrs`} color="green" />
                        <StatChip icon={ClockIcon} label="Overtime Hours" value={`${(data.labour?.summary?.overtime_hours || 0).toFixed(1)} hrs`} color="red" />
                        <StatChip icon={CheckCircleIcon} label="Requisitions" value={String(data.labour?.summary?.total_requisitions || 0)} color="teal" />
                      </div>

                      {/* ── Planned Labour Breakdown ── */}
                      <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                        <CalendarDaysIcon className="w-4 h-4 text-blue-500" />
                        Planned Labour Breakdown
                      </h3>
                      {(!data.labour?.planned_workers || data.labour.planned_workers.length === 0) ? (
                        <div className="text-center py-8 bg-blue-50 rounded-lg mb-6">
                          <p className="text-gray-500 text-sm">No planned labour found in BOQ</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-blue-200 mb-6">
                          <table className="w-full text-sm">
                            <thead className="bg-blue-50 border-b border-blue-200">
                              <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">BOQ Item</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Planned Hours</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rate / Hr</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Planned Cost</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {data.labour.planned_workers.map((pw: any, idx: number) => (
                                <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                                  <td className="px-4 py-3">
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">{pw.labour_role || '-'}</span>
                                  </td>
                                  <td className="px-4 py-3 text-gray-500 text-xs">{pw.item_name || '-'}</td>
                                  <td className="px-4 py-3 text-right font-semibold text-gray-700">{(pw.hours || 0).toFixed(1)} hrs</td>
                                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(pw.rate_per_hour || 0)}</td>
                                  <td className="px-4 py-3 text-right font-bold text-blue-700">{formatCurrency(pw.total || 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                              <tr>
                                <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-700">Total Planned Labour</td>
                                <td className="px-4 py-3 text-right font-bold text-blue-700">{formatCurrency(data.labour?.planned || 0)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}

                      {/* ── Actual Worker Breakdown ── */}
                      <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                        <UserGroupIcon className="w-4 h-4 text-orange-500" />
                        Actual Worker Breakdown
                      </h3>
                      {(!data.labour?.workers || data.labour.workers.length === 0) ? (
                        <div className="text-center py-10 bg-gray-50 rounded-lg mb-6">
                          <UserGroupIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                          <p className="text-gray-500 font-medium text-sm">No attendance records found</p>
                          <p className="text-xs text-gray-400 mt-1">Labour attendance data will appear here</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200 mb-6">
                          <table className="w-full text-sm">
                            <thead className="bg-orange-50 border-b border-orange-200">
                              <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Code</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Worker Name</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Phone</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Work Days</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Reg. Hours</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">OT Hours</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total Hours</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rate/Hr</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total Cost</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Period</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {data.labour.workers.map((w: any, idx: number) => (
                                <tr key={idx} className="hover:bg-orange-50/30 transition-colors">
                                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{w.worker_code}</td>
                                  <td className="px-4 py-3 font-semibold text-gray-800">{w.worker_name}</td>
                                  <td className="px-4 py-3">
                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">{w.labour_role}</span>
                                  </td>
                                  <td className="px-4 py-3 text-gray-500 text-xs">{w.phone}</td>
                                  <td className="px-4 py-3 text-center font-semibold text-gray-700">{w.working_days}</td>
                                  <td className="px-4 py-3 text-right text-gray-600">{w.regular_hours.toFixed(1)}</td>
                                  <td className="px-4 py-3 text-right text-red-600 font-medium">{w.overtime_hours > 0 ? w.overtime_hours.toFixed(1) : '-'}</td>
                                  <td className="px-4 py-3 text-right font-bold text-gray-800">{w.total_hours.toFixed(1)}</td>
                                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(w.avg_hourly_rate)}</td>
                                  <td className="px-4 py-3 text-right font-bold text-orange-700">{formatCurrency(w.total_cost)}</td>
                                  <td className="px-4 py-3 text-xs text-gray-400">
                                    {formatDate(w.first_date)}{w.last_date && w.last_date !== w.first_date ? ` → ${formatDate(w.last_date)}` : ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-orange-50 border-t-2 border-orange-200">
                              <tr>
                                <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-700">Total ({data.labour.workers.length} Workers)</td>
                                <td className="px-4 py-3 text-center font-bold text-gray-800">{data.labour?.summary?.total_working_days}</td>
                                <td className="px-4 py-3 text-right font-bold text-gray-800">{(data.labour?.summary?.regular_hours || 0).toFixed(1)}</td>
                                <td className="px-4 py-3 text-right font-bold text-red-600">{(data.labour?.summary?.overtime_hours || 0).toFixed(1)}</td>
                                <td className="px-4 py-3 text-right font-bold text-gray-800">{(data.labour?.summary?.total_hours || 0).toFixed(1)}</td>
                                <td></td>
                                <td className="px-4 py-3 text-right font-bold text-orange-700">{formatCurrency(data.labour?.actual || 0)}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}

                      {/* Requisitions Table */}
                      <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 text-teal-500" />
                        Labour Requisitions
                      </h3>
                      {(!data.labour?.requisitions || data.labour.requisitions.length === 0) ? (
                        <div className="text-center py-8 bg-gray-50 rounded-lg">
                          <p className="text-gray-500 text-sm">No requisitions found for this project</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                          <table className="w-full text-sm">
                            <thead className="bg-teal-50 border-b border-teal-200">
                              <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Req Code</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Site</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Start Date</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Skill / Role</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Requested By</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Requested</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Assigned</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Attended</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Hours</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cost</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Approved By</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {data.labour.requisitions.map((r: any, idx: number) => (
                                <tr key={idx} className="hover:bg-teal-50/30 transition-colors">
                                  <td className="px-4 py-3 font-mono text-xs font-semibold text-teal-700">{r.requisition_code}</td>
                                  <td className="px-4 py-3 text-gray-700">{r.site_name}</td>
                                  <td className="px-4 py-3 text-gray-500">{formatDate(r.required_date)}</td>
                                  <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate" title={r.skill_summary}>{r.skill_summary}</td>
                                  <td className="px-4 py-3 text-gray-600 text-xs">
                                    {r.requested_by}
                                    <span className="ml-1 text-gray-400">({r.requester_role})</span>
                                  </td>
                                  <td className="px-4 py-3 text-center font-semibold text-gray-700">{r.workers_requested || '-'}</td>
                                  <td className="px-4 py-3 text-center font-semibold text-blue-700">{r.workers_assigned}</td>
                                  <td className="px-4 py-3 text-center font-semibold text-green-700">{r.workers_attended}</td>
                                  <td className="px-4 py-3 text-right font-semibold text-gray-700">{r.total_hours > 0 ? r.total_hours.toFixed(1) : '-'}</td>
                                  <td className="px-4 py-3 text-right font-bold text-teal-700">{r.total_cost > 0 ? formatCurrency(r.total_cost) : '-'}</td>
                                  <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
                                  <td className="px-4 py-3 text-xs text-gray-500">
                                    {r.approved_by !== '-' ? r.approved_by : '-'}
                                    {r.approval_date && r.approval_date !== null && (
                                      <span className="block text-gray-400">{formatDate(r.approval_date)}</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default ProfitReportView;
