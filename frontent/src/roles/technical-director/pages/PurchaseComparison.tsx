import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { DocumentChartBarIcon, ArrowLeftIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { showError, showInfo, showSuccess } from '@/utils/toastHelper';
import { useProjectsAutoSync } from '@/hooks/useAutoSync';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/api/config';
import { saveAs } from 'file-saver';

// Interface matching backend response structure
interface ComparisonMaterial {
  material_name: string;
  master_material_id: number | null;
  item_name: string;
  sub_item_name: string;
  unit: string;
  planned: {
    quantity: number;
    rate: number;
    amount: number;
  };
  actual: {
    quantity_purchased: number;
    quantity_used: number;
    remaining_quantity: number;
    unit_price: number;
    amount: number;
  };
  variance: {
    quantity: number;
    rate: number;
    amount: number;
    quantity_percentage: number;
    rate_percentage: number;
    amount_percentage: number;
  };
  status: 'over_budget' | 'under_budget' | 'on_budget' | 'not_purchased';
  // New material from change request
  is_new_material?: boolean;
  change_request_id?: number;
  justification?: string;
}

interface UnplannedMaterial {
  material_name: string;
  master_material_id: number | null;
  item_name: string;
  unit: string;
  quantity_purchased: number;
  quantity_used: number;
  remaining_quantity: number;
  unit_price: number;
  total_amount: number;
  is_from_change_request: boolean;
  status: 'unplanned';
}

interface PurchaseComparisonData {
  project_id: number;
  project_name: string;
  boq_id: number;
  planned_materials: {
    materials: any[];
    summary: {
      total_count: number;
      total_quantity: number;
      total_amount: number;
    };
  };
  actual_materials: {
    materials: any[];
    summary: {
      total_count: number;
      total_quantity_purchased: number;
      total_amount: number;
    };
  };
  comparison: {
    materials: ComparisonMaterial[];
    summary: {
      total_compared: number;
      over_budget_count: number;
      under_budget_count: number;
      on_budget_count: number;
      not_purchased_count: number;
    };
  };
  unplanned_materials: {
    materials: UnplannedMaterial[];
    summary: {
      total_count: number;
      total_amount: number;
    };
  };
  overall_summary: {
    planned_total_amount: number;
    actual_total_amount: number;
    unplanned_total_amount: number;
    total_variance: number;
    variance_percentage: number;
    budget_status: string;
  };
}

export default function PurchaseComparison() {
  const [searchParams] = useSearchParams();
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('live');
  const [comparisonData, setComparisonData] = useState<PurchaseComparisonData | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Real-time auto-sync for BOQ list - use dedicated purchase comparison projects endpoint
  const { data: boqData, isLoading: loading, refetch } = useProjectsAutoSync(
    async () => {
      const token = localStorage.getItem('access_token');
      const response = await apiClient.get('/purchase_comparison_projects', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      let allBOQs: any[] = [];

      if (response.data.success) {
        const data = response.data.data;
        if (Array.isArray(data)) {
          allBOQs = data;
        } else if (data.projects && Array.isArray(data.projects)) {
          allBOQs = data.projects;
        } else if (data.boqs && Array.isArray(data.boqs)) {
          allBOQs = data.boqs;
        }
      }

      if (allBOQs.length === 0) {
        showInfo('No projects with purchase data found');
      }

      return allBOQs;
    }
  );

  const boqList = useMemo(() => boqData || [], [boqData]);

  // Filter BOQs based on active tab
  const filteredBOQList = useMemo(() => {
    if (activeTab === 'live') {
      return boqList.filter((boq: any) => {
        // Check multiple status fields for completed/closed status
        const projectStatus = (boq.project_status || '').toLowerCase();
        const boqStatus = (boq.status || boq.boq_status || '').toLowerCase();
        const isCompleted = projectStatus === 'completed' || projectStatus === 'closed' ||
                          boqStatus === 'completed' || boqStatus === 'closed';
        return !isCompleted;
      });
    } else {
      return boqList.filter((boq: any) => {
        // Check multiple status fields for completed/closed status
        const projectStatus = (boq.project_status || '').toLowerCase();
        const boqStatus = (boq.status || boq.boq_status || '').toLowerCase();
        return projectStatus === 'completed' || projectStatus === 'closed' ||
               boqStatus === 'completed' || boqStatus === 'closed';
      });
    }
  }, [boqList, activeTab]);

  // Fetch purchase comparison data when project is selected
  const fetchComparisonData = async (projectId: number) => {
    setLoadingComparison(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await apiClient.get(`/purchase_comparison/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success) {
        setComparisonData(response.data.data);
      } else {
        showError(response.data.error || 'Failed to fetch comparison data');
      }
    } catch (error: any) {
      console.error('Error fetching comparison:', error);
      showError(error.response?.data?.error || 'Failed to fetch purchase comparison');
    } finally {
      setLoadingComparison(false);
    }
  };

  // Auto-select project from URL param
  useEffect(() => {
    const projectIdFromUrl = searchParams.get('project_id');
    if (projectIdFromUrl && boqList.length > 0 && !selectedProject) {
      const projectId = parseInt(projectIdFromUrl, 10);
      const project = boqList.find((b: any) => b.project_id === projectId);
      if (project) {
        setSelectedProject(project);
        fetchComparisonData(projectId);
      }
    }
  }, [searchParams, boqList, selectedProject]);

  const handleProjectSelect = async (project: any) => {
    setSelectedProject(project);
    await fetchComparisonData(project.project_id);
  };

  const handleBack = () => {
    setSelectedProject(null);
    setComparisonData(null);
  };

  // Export to Excel function
  const handleExportToExcel = async () => {
    if (!comparisonData || !selectedProject) {
      showError('No data to export');
      return;
    }

    setExporting(true);
    try {
      // Dynamically import XLSX to reduce initial bundle size
      const XLSX = await import('xlsx');

      const projectName = selectedProject.project_name || selectedProject.project?.name || 'N/A';
      const totalPlanned = groupedByItem.reduce((sum, group) => sum + group.totals.planned_amount, 0);
      const totalActual = groupedByItem.reduce((sum, group) => sum + group.totals.actual_amount, 0);

      // Prepare Planned Budget sheet
      const plannedBudgetData: any[] = [];
      groupedByItem.forEach((group) => {
        // Add item header
        plannedBudgetData.push({
          'Item': group.item_name,
          'Material Name': '--- ITEM TOTAL ---',
          'Sub Item': '',
          'Unit': '',
          'Planned Amount (AED)': group.totals.planned_amount
        });

        // Add materials
        group.plannedMaterials.forEach((material: any) => {
          plannedBudgetData.push({
            'Item': '',
            'Material Name': material.material_name,
            'Sub Item': material.sub_item_name || '',
            'Unit': material.unit || '',
            'Planned Amount (AED)': material.planned_amount || 0
          });
        });

        plannedBudgetData.push({}); // Empty row
      });

      // Add total row
      plannedBudgetData.push({
        'Item': 'GRAND TOTAL',
        'Material Name': '',
        'Sub Item': '',
        'Unit': '',
        'Planned Amount (AED)': totalPlanned
      });

      // Prepare Actual Spending sheet
      const actualSpendingData: any[] = [];
      groupedByItem.forEach((group) => {
        let groupHasData = false;

        group.actualMaterials
          .filter((material: any) => {
            const purchases = material.purchases || [];
            const hasActivePurchase = purchases.some((p: any) =>
              ['vendor_approved', 'purchase_completed', 'pending_td_approval'].includes(p.cr_status)
            );
            return (material.actual_amount || 0) > 0 || hasActivePurchase || material.is_new_material === true;
          })
          .forEach((material: any) => {
            const purchases = material.purchases || [];
            purchases.forEach((p: any) => {
              if (['vendor_approved', 'purchase_completed', 'pending_td_approval'].includes(p.cr_status)) {
                if (!groupHasData) {
                  // Add item header
                  actualSpendingData.push({
                    'Item': group.item_name,
                    'Material Name': '--- ITEM TOTAL ---',
                    'Sub Item': '',
                    'CR ID': '',
                    'Amount (AED)': '',
                    'VAT (AED)': '',
                    'Total (incl. VAT)': group.totals.actual_amount,
                    'Type': ''
                  });
                  groupHasData = true;
                }

                actualSpendingData.push({
                  'Item': '',
                  'Material Name': material.material_name,
                  'Sub Item': material.sub_item_name || '',
                  'CR ID': p.cr_id || '-',
                  'Amount (AED)': p.amount || 0,
                  'VAT (AED)': p.vat_amount || 0,
                  'Total (incl. VAT)': (p.amount || 0) + (p.vat_amount || 0),
                  'Type': p.is_new_material ? 'NEW' : 'Existing'
                });
              }
            });
          });

        if (groupHasData) {
          actualSpendingData.push({}); // Empty row
        }
      });

      // Add total row
      actualSpendingData.push({
        'Item': 'GRAND TOTAL',
        'Material Name': '',
        'Sub Item': '',
        'CR ID': '',
        'Amount (AED)': '',
        'VAT (AED)': '',
        'Total (incl. VAT)': totalActual,
        'Type': ''
      });

      // Prepare Comparison sheet (side by side)
      const comparisonData: any[] = [];
      groupedByItem.forEach((group) => {
        const balance = group.totals.planned_amount - group.totals.actual_amount;
        comparisonData.push({
          'Item': group.item_name,
          'Planned Amount (AED)': group.totals.planned_amount,
          'Actual Amount (incl. VAT)': group.totals.actual_amount,
          'Balance (AED)': balance,
          'Status': balance >= 0 ? 'Under Budget' : 'Over Budget'
        });
      });

      // Add total row
      const totalBalance = totalPlanned - totalActual;
      comparisonData.push({});
      comparisonData.push({
        'Item': 'GRAND TOTAL',
        'Planned Amount (AED)': totalPlanned,
        'Actual Amount (incl. VAT)': totalActual,
        'Balance (AED)': totalBalance,
        'Status': totalBalance >= 0 ? 'Under Budget' : 'Over Budget'
      });

      // Prepare Summary sheet
      const summaryData = [
        { 'Metric': 'Project Name', 'Value': projectName },
        { 'Metric': 'BOQ ID', 'Value': comparisonData.boq_id || 'N/A' },
        { 'Metric': '', 'Value': '' },
        { 'Metric': 'Total Planned Amount (AED)', 'Value': totalPlanned.toFixed(2) },
        { 'Metric': 'Total Actual Amount (incl. VAT) (AED)', 'Value': totalActual.toFixed(2) },
        { 'Metric': 'Balance (AED)', 'Value': totalBalance.toFixed(2) },
        { 'Metric': 'Variance %', 'Value': totalPlanned > 0 ? `${(((totalActual - totalPlanned) / totalPlanned) * 100).toFixed(2)}%` : '0%' },
        { 'Metric': 'Budget Status', 'Value': totalBalance >= 0 ? 'Under Budget' : 'Over Budget' },
        { 'Metric': '', 'Value': '' },
        { 'Metric': 'Report Generated', 'Value': new Date().toLocaleString('en-GB') }
      ];

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Add Summary sheet
      const ws1 = XLSX.utils.json_to_sheet(summaryData);
      ws1['!cols'] = [{ wch: 35 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

      // Add Comparison sheet
      const ws2 = XLSX.utils.json_to_sheet(comparisonData);
      ws2['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 25 }, { wch: 18 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Comparison');

      // Add Planned Budget sheet
      const ws3 = XLSX.utils.json_to_sheet(plannedBudgetData);
      ws3['!cols'] = [{ wch: 25 }, { wch: 45 }, { wch: 30 }, { wch: 12 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Planned Budget');

      // Add Actual Spending sheet
      const ws4 = XLSX.utils.json_to_sheet(actualSpendingData);
      ws4['!cols'] = [{ wch: 25 }, { wch: 45 }, { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws4, 'Actual Spending');

      // Generate Excel file
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const safeProjectName = (selectedProject.project_name || selectedProject.project?.name || 'Project').replace(/[^a-zA-Z0-9]/g, '_');
      saveAs(data, `Purchase_Comparison_${safeProjectName}_${new Date().toISOString().split('T')[0]}.xlsx`);

      showSuccess('Excel file downloaded successfully');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      showError('Failed to export Excel file');
    } finally {
      setExporting(false);
    }
  };

  // Export to PDF function
  const handleExportToPDF = async () => {
    if (!comparisonData || !selectedProject) {
      showError('No data to export');
      return;
    }

    setExporting(true);
    try {
      // Dynamically import jsPDF
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF('landscape', 'mm', 'a4');
      const projectName = selectedProject.project_name || selectedProject.project?.name || 'N/A';
      const totalPlanned = groupedByItem.reduce((sum, group) => sum + group.totals.planned_amount, 0);
      const totalActual = groupedByItem.reduce((sum, group) => sum + group.totals.actual_amount, 0);
      const totalBalance = totalPlanned - totalActual;

      // Header
      doc.setFontSize(18);
      doc.setTextColor(34, 139, 34); // Green
      doc.text('Purchase Comparison Report', 14, 15);

      doc.setFontSize(12);
      doc.setTextColor(60);
      doc.text(`Project: ${projectName}`, 14, 23);
      doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, 14, 30);

      // Summary Box
      doc.setFillColor(240, 253, 244); // Light green
      doc.rect(200, 10, 85, 28, 'F');
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text('Summary', 205, 17);
      doc.setFontSize(9);
      doc.text(`Planned: AED ${totalPlanned.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, 205, 24);
      doc.text(`Actual: AED ${totalActual.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, 205, 30);
      doc.setTextColor(totalBalance >= 0 ? 34 : 220, totalBalance >= 0 ? 139 : 53, totalBalance >= 0 ? 34 : 69);
      doc.text(`Balance: AED ${totalBalance.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, 205, 36);

      // Comparison Table
      doc.setTextColor(0);
      let yPos = 45;

      const comparisonTableData = groupedByItem.map((group) => {
        const balance = group.totals.planned_amount - group.totals.actual_amount;
        return [
          group.item_name,
          group.totals.planned_amount.toLocaleString('en-AE', { minimumFractionDigits: 2 }),
          group.totals.actual_amount.toLocaleString('en-AE', { minimumFractionDigits: 2 }),
          balance.toLocaleString('en-AE', { minimumFractionDigits: 2 }),
          balance >= 0 ? 'Under Budget' : 'Over Budget'
        ];
      });

      // Add total row
      comparisonTableData.push([
        'GRAND TOTAL',
        totalPlanned.toLocaleString('en-AE', { minimumFractionDigits: 2 }),
        totalActual.toLocaleString('en-AE', { minimumFractionDigits: 2 }),
        totalBalance.toLocaleString('en-AE', { minimumFractionDigits: 2 }),
        totalBalance >= 0 ? 'Under Budget' : 'Over Budget'
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Item', 'Planned (AED)', 'Actual (incl. VAT)', 'Balance (AED)', 'Status']],
        body: comparisonTableData,
        theme: 'grid',
        headStyles: {
          fillColor: [34, 139, 34],
          textColor: 255,
          fontSize: 10,
          fontStyle: 'bold',
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 9,
          valign: 'middle'
        },
        columnStyles: {
          0: { cellWidth: 70, halign: 'left' },
          1: { cellWidth: 40, halign: 'right' },
          2: { cellWidth: 45, halign: 'right' },
          3: { cellWidth: 40, halign: 'right' },
          4: { cellWidth: 30, halign: 'center' }
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        didParseCell: (data: any) => {
          // Color the last row (total)
          if (data.row.index === comparisonTableData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [220, 252, 231];
          }
          // Color status column
          if (data.column.index === 4 && data.row.index < comparisonTableData.length) {
            if (data.cell.raw === 'Over Budget') {
              data.cell.styles.textColor = [220, 53, 69];
            } else {
              data.cell.styles.textColor = [34, 139, 34];
            }
          }
        }
      });

      // New page for detailed breakdown
      doc.addPage();
      doc.setFontSize(14);
      doc.setTextColor(34, 139, 34);
      doc.text('Detailed Actual Spending by Item', 14, 15);

      yPos = 25;

      groupedByItem.forEach((group) => {
        const actualMaterials = group.actualMaterials.filter((material: any) => {
          const purchases = material.purchases || [];
          const hasActivePurchase = purchases.some((p: any) =>
            ['vendor_approved', 'purchase_completed', 'pending_td_approval'].includes(p.cr_status)
          );
          return (material.actual_amount || 0) > 0 || hasActivePurchase || material.is_new_material === true;
        });

        if (actualMaterials.length === 0) return;

        // Check if we need a new page
        if (yPos > 180) {
          doc.addPage();
          yPos = 15;
        }

        // Item header
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.setFont(undefined, 'bold');
        doc.text(`${group.item_name}`, 14, yPos);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Total: AED ${group.totals.actual_amount.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, 200, yPos);
        yPos += 5;

        const materialRows: any[] = [];
        actualMaterials.forEach((material: any) => {
          const purchases = material.purchases || [];
          purchases.forEach((p: any) => {
            if (['vendor_approved', 'purchase_completed', 'pending_td_approval'].includes(p.cr_status)) {
              const total = (p.amount || 0) + (p.vat_amount || 0);
              materialRows.push([
                material.material_name,
                material.sub_item_name || '-',
                p.cr_id ? `PO #${p.cr_id}` : '-',
                (p.amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 }),
                (p.vat_amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 }),
                total.toLocaleString('en-AE', { minimumFractionDigits: 2 }),
                p.is_new_material ? 'NEW' : '-'
              ]);
            }
          });
        });

        if (materialRows.length > 0) {
          autoTable(doc, {
            startY: yPos,
            head: [['Material', 'Sub Item', 'PO ID', 'Amount', 'VAT', 'Total', 'Type']],
            body: materialRows,
            theme: 'striped',
            headStyles: {
              fillColor: [100, 100, 100],
              textColor: 255,
              fontSize: 8,
              fontStyle: 'bold',
              halign: 'center'
            },
            bodyStyles: { fontSize: 8 },
            columnStyles: {
              0: { cellWidth: 60, halign: 'left' },
              1: { cellWidth: 45, halign: 'left' },
              2: { cellWidth: 20, halign: 'center' },
              3: { cellWidth: 25, halign: 'right' },
              4: { cellWidth: 20, halign: 'right' },
              5: { cellWidth: 25, halign: 'right' },
              6: { cellWidth: 15, halign: 'center' }
            },
            margin: { left: 14, right: 14 }
          });

          yPos = (doc as any).lastAutoTable.finalY + 10;
        }
      });

      // Footer on all pages
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Page ${i} of ${pageCount} | MeterSquare - Purchase Comparison Report`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 8,
          { align: 'center' }
        );
      }

      // Save
      const safeProjectName = (selectedProject.project_name || selectedProject.project?.name || 'Project').replace(/[^a-zA-Z0-9]/g, '_');
      doc.save(`Purchase_Comparison_${safeProjectName}_${new Date().toISOString().split('T')[0]}.pdf`);

      showSuccess('PDF file downloaded successfully');
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      showError('Failed to export PDF file');
    } finally {
      setExporting(false);
    }
  };

  // Get status badge styling
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'over_budget':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Over Budget</Badge>;
      case 'under_budget':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Under Budget</Badge>;
      case 'on_budget':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">On Budget</Badge>;
      case 'not_purchased':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Not Purchased</Badge>;
      case 'unplanned':
        return <Badge className="bg-purple-100 text-purple-700 border-purple-200">Unplanned</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">{status}</Badge>;
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: 'AED',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format percentage
  const formatPercentage = (value: number) => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  // Group materials by item_name for item-based view
  // Uses the new API structure: comparison.items[].materials with actual.purchases[]
  const groupedByItem = useMemo(() => {
    // New API structure: comparison.items[] contains item_name and materials[]
    const comparisonItems = comparisonData?.comparison?.items || [];
    // Also get unplanned materials (new materials from change requests)
    // Structure: unplanned_materials.items[].materials[]
    const unplannedItems = comparisonData?.unplanned_materials?.items || [];

    const grouped: { [key: string]: {
      item_name: string;
      plannedMaterials: any[];
      actualMaterials: any[];
      totals: {
        planned_amount: number;
        actual_amount: number;
        variance: number;
      };
    }} = {};

    // Process each item from comparison
    comparisonItems.forEach((item: any) => {
      const itemName = item.item_name || 'Uncategorized';

      if (!grouped[itemName]) {
        grouped[itemName] = {
          item_name: itemName,
          plannedMaterials: [],
          actualMaterials: [],
          totals: {
            planned_amount: item.summary?.planned_amount || 0,
            // We'll calculate actual_amount from CR totals below (not from API summary)
            actual_amount: 0,
            variance: item.summary?.variance || 0
          }
        };
      } else {
        // Add to existing planned totals if same item_name appears multiple times
        grouped[itemName].totals.planned_amount += item.summary?.planned_amount || 0;
        grouped[itemName].totals.variance += item.summary?.variance || 0;
      }

      // Group purchases by CR ID to calculate correct totals (VAT is per CR, not per material)
      const crTotalsMap: { [crId: string]: { amount: number, vat: number } } = {};

      // Process materials within each item
      (item.materials || []).forEach((material: any) => {
        // Add to planned materials
        grouped[itemName].plannedMaterials.push(material);

        // Get CR info from purchases if available
        const purchases = material.purchases || [];
        const firstPurchase = purchases[0];
        const crId = firstPurchase?.cr_id || null;
        const isNewMaterial = purchases.some((p: any) => p.is_new_material === true);
        const totalVat = purchases.reduce((sum: number, p: any) => sum + (p.vat_amount || 0), 0);

        // Track CR totals for correct actual amount calculation
        purchases.forEach((p: any) => {
          const pCrId = p.cr_id || 'unknown';
          if (!crTotalsMap[pCrId]) {
            crTotalsMap[pCrId] = { amount: 0, vat: 0 };
          }
          crTotalsMap[pCrId].amount += (p.amount || 0);
          // Use cr_total_vat if available (same value for all materials in CR), take the max
          if (p.cr_total_vat && p.cr_total_vat > crTotalsMap[pCrId].vat) {
            crTotalsMap[pCrId].vat = p.cr_total_vat;
          } else if (p.vat_amount > 0 && p.vat_amount > crTotalsMap[pCrId].vat) {
            crTotalsMap[pCrId].vat = p.vat_amount;
          }
        });

        grouped[itemName].actualMaterials.push({
          ...material,
          actual_amount: material.actual_amount || 0,
          vat_amount: totalVat,
          is_new_material: isNewMaterial,
          is_from_change_request: purchases.length > 0,
          change_request_id: crId,
          justification: null,
          purchases: purchases
        });
      });

      // Calculate actual_amount from CR totals (amount + VAT per CR)
      Object.values(crTotalsMap).forEach((crData) => {
        grouped[itemName].totals.actual_amount += (crData.amount + crData.vat);
      });
    });

    // Process unplanned materials (new materials from change requests)
    // Structure: unplanned_materials.items[].materials[]
    // Note: Unlike comparison materials, unplanned materials have actual_amount WITHOUT VAT
    // So we need to add vat_amount for unplanned materials
    unplannedItems.forEach((item: any) => {
      const itemName = item.item_name || 'Uncategorized';

      if (!grouped[itemName]) {
        grouped[itemName] = {
          item_name: itemName,
          plannedMaterials: [],
          actualMaterials: [],
          totals: {
            planned_amount: 0,
            actual_amount: 0,
            variance: 0
          }
        };
      }

      // Group unplanned materials by CR ID to calculate VAT correctly (VAT is per CR)
      const crDataMap: { [crId: string]: { totalAmount: number, totalVat: number } } = {};

      // Process each material in this unplanned item
      (item.materials || []).forEach((material: any) => {
        const materialAmount = material.actual_amount || material.amount || material.total_amount || 0;
        const materialVat = material.vat_amount || 0;
        const crId = material.change_request_id || 'unknown';

        // Track CR totals for correct VAT calculation
        if (!crDataMap[crId]) {
          crDataMap[crId] = { totalAmount: 0, totalVat: 0 };
        }
        crDataMap[crId].totalAmount += materialAmount;
        // Use cr_total_vat if available (same value for all materials in CR), take the max
        if (material.cr_total_vat && material.cr_total_vat > crDataMap[crId].totalVat) {
          crDataMap[crId].totalVat = material.cr_total_vat;
        } else if (materialVat > 0 && materialVat > crDataMap[crId].totalVat) {
          crDataMap[crId].totalVat = materialVat;
        }

        grouped[itemName].actualMaterials.push({
          material_name: material.material_name,
          sub_item_name: material.sub_item_name || material.item_name || itemName,
          item_name: material.item_name || itemName,
          actual_amount: materialAmount,
          vat_amount: materialVat,
          is_new_material: true, // All unplanned materials are NEW
          is_from_change_request: true, // All unplanned materials are from change requests
          change_request_id: material.change_request_id || null,
          justification: null,
          purchases: [{
            cr_id: material.change_request_id || null,
            cr_status: material.cr_status || 'purchase_completed',
            is_new_material: true,
            amount: materialAmount,
            vat_amount: materialVat,
            cr_total_vat: material.cr_total_vat || materialVat
          }]
        });
      });

      // Update totals for the group - sum CR totals (amount + VAT per CR)
      // For unplanned materials, we need to add VAT since actual_amount doesn't include it
      Object.values(crDataMap).forEach((crData) => {
        grouped[itemName].totals.actual_amount += (crData.totalAmount + crData.totalVat);
      });
    });

    return Object.values(grouped);
  }, [comparisonData]);


  // Get clean status label
  const getStatusLabel = (boq: any) => {
    const status = boq.status || boq.boq_status || boq.completion_status || '';
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1800px] mx-auto"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 shadow-md mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedProject && (
                <button
                  onClick={handleBack}
                  className="p-2 hover:bg-green-200 rounded-lg transition-colors mr-2"
                >
                  <ArrowLeftIcon className="w-6 h-6 text-green-700" />
                </button>
              )}
              <DocumentChartBarIcon className="w-8 h-8 text-green-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Purchase Comparison</h1>
                <p className="text-gray-600">
                  {selectedProject
                    ? `Comparing estimated vs actual purchases for ${selectedProject.project_name || selectedProject.project?.name || 'Project'}`
                    : 'Compare planned BOQ materials with actual purchases'
                  }
                </p>
              </div>
            </div>

            {/* Download Buttons - Show only when project is selected and data is loaded */}
            {selectedProject && comparisonData && !loadingComparison && (
              <div className="flex items-center gap-2">
                {exporting ? (
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-400 text-white rounded-lg">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Exporting...</span>
                  </div>
                ) : (
                  <>
                    {/* Excel button - commented out for now
                    <button
                      onClick={handleExportToExcel}
                      disabled={exporting}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                      title="Download as Excel"
                    >
                      <ArrowDownTrayIcon className="w-5 h-5" />
                      <span>Excel</span>
                    </button>
                    */}
                    <button
                      onClick={handleExportToPDF}
                      disabled={exporting}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                      title="Download as PDF"
                    >
                      <ArrowDownTrayIcon className="w-5 h-5" />
                      <span>PDF</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-xl shadow-md p-12">
            <div className="flex flex-col items-center justify-center">
              <ModernLoadingSpinners size="xl" />
              <p className="mt-4 text-gray-600 font-medium">Loading Projects...</p>
            </div>
          </div>
        )}

        {/* Project Selection */}
        {!loading && !selectedProject && (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              {/* Tab Headers */}
              <div className="border-b border-gray-200 bg-gray-50 px-6">
                <TabsList className="w-full justify-start bg-transparent h-auto p-0">
                  <TabsTrigger
                    value="live"
                    className="px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:bg-white data-[state=active]:text-green-600 data-[state=active]:shadow-sm transition-all"
                  >
                    <span className="font-semibold">Live Projects</span>
                    <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      {boqList.filter((boq: any) => {
                        const projectStatus = (boq.project_status || '').toLowerCase();
                        const boqStatus = (boq.status || boq.boq_status || '').toLowerCase();
                        const isCompleted = projectStatus === 'completed' || projectStatus === 'closed' ||
                                          boqStatus === 'completed' || boqStatus === 'closed';
                        return !isCompleted;
                      }).length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="completed"
                    className="px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm transition-all"
                  >
                    <span className="font-semibold">Completed</span>
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {boqList.filter((boq: any) => {
                        const projectStatus = (boq.project_status || '').toLowerCase();
                        const boqStatus = (boq.status || boq.boq_status || '').toLowerCase();
                        return projectStatus === 'completed' || projectStatus === 'closed' ||
                               boqStatus === 'completed' || boqStatus === 'closed';
                      }).length}
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Tab Content */}
              <TabsContent value="live" className="p-6 m-0">
                {filteredBOQList.length === 0 ? (
                  <div className="text-center py-12">
                    <DocumentChartBarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No live projects available</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredBOQList.map((boq: any) => (
                      <motion.div
                        key={boq.boq_id || boq.project_id}
                        whileHover={{ scale: 1.02 }}
                        className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-lg transition-all"
                        onClick={() => handleProjectSelect(boq)}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <DocumentChartBarIcon className="w-8 h-8 text-green-500" />
                          <Badge className={getStatusColor(boq)}>{getStatusLabel(boq)}</Badge>
                        </div>
                        <h3 className="font-semibold text-gray-800 mb-2 line-clamp-2">
                          {boq.project_name || boq.project?.name || 'Unnamed Project'}
                        </h3>
                        <p className="text-sm text-gray-500 mb-3 line-clamp-1">
                          {boq.boq_description || `BOQ for ${boq.project_name || 'project'}`}
                        </p>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>BOQ ID: #{boq.boq_id}</span>
                          <span>{boq.created_at ? new Date(boq.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                        </div>
                        <button className="w-full mt-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                          <DocumentChartBarIcon className="w-4 h-4" />
                          View Comparison
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="completed" className="p-6 m-0">
                {filteredBOQList.length === 0 ? (
                  <div className="text-center py-12">
                    <DocumentChartBarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No completed projects available</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredBOQList.map((boq: any) => (
                      <motion.div
                        key={boq.boq_id || boq.project_id}
                        whileHover={{ scale: 1.02 }}
                        className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-lg transition-all"
                        onClick={() => handleProjectSelect(boq)}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <DocumentChartBarIcon className="w-8 h-8 text-blue-500" />
                          <Badge className={getStatusColor(boq)}>{getStatusLabel(boq)}</Badge>
                        </div>
                        <h3 className="font-semibold text-gray-800 mb-2 line-clamp-2">
                          {boq.project_name || boq.project?.name || 'Unnamed Project'}
                        </h3>
                        <p className="text-sm text-gray-500 mb-3 line-clamp-1">
                          {boq.boq_description || `BOQ for ${boq.project_name || 'project'}`}
                        </p>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>BOQ ID: #{boq.boq_id}</span>
                          <span>{boq.created_at ? new Date(boq.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                        </div>
                        <button className="w-full mt-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                          <DocumentChartBarIcon className="w-4 h-4" />
                          View Comparison
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Comparison Data View */}
        {selectedProject && (
          <div className="space-y-6">
            {loadingComparison ? (
              <div className="bg-white rounded-xl shadow-md p-12">
                <div className="flex flex-col items-center justify-center">
                  <ModernLoadingSpinners size="xl" />
                  <p className="mt-4 text-gray-600 font-medium">Loading comparison data...</p>
                </div>
              </div>
            ) : comparisonData && comparisonData.overall_summary ? (
              <>
                {/* Comparison - Item Based Side-by-Side View */}
                {(
                  <div className="space-y-6">
                    {groupedByItem.length === 0 ? (
                      <div className="bg-white rounded-xl shadow-md p-12 text-center">
                        <DocumentChartBarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No materials found</p>
                      </div>
                    ) : (
                      groupedByItem.map((group) => (
                        <div key={group.item_name} className="bg-white rounded-xl shadow-md overflow-hidden border-l-4 border-indigo-500">
                          {/* Item Header */}
                          <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200">
                            <h3 className="font-bold text-gray-800 uppercase tracking-wide">{group.item_name}</h3>
                          </div>

                          {/* Side-by-Side Comparison */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
                            {/* Left Side - Planned Budget */}
                            <div className="p-5">
                              <div className="mb-4">
                                <h4 className="text-lg font-semibold text-gray-800">Planned Budget</h4>
                                <p className="text-sm text-gray-500">Original estimate</p>
                              </div>

                              <div className="mb-3">
                                <p className="text-sm font-medium text-gray-600 mb-2">Sub Items</p>
                              </div>

                              {/* Planned Materials List */}
                              <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="bg-gray-50 px-4 py-2 flex justify-between text-xs font-medium text-gray-500 uppercase">
                                  <span>Material</span>
                                  <span>Amount</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {group.plannedMaterials.map((material, index) => (
                                    <div key={`planned-${material.master_material_id}-${index}`} className="px-4 py-3 flex justify-between items-start">
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">{material.material_name}</p>
                                        <p className="text-xs text-gray-500">[{material.sub_item_name || material.item_name}]</p>
                                      </div>
                                      <p className="text-sm font-medium text-gray-900">
                                        {(material.planned_amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                            </div>

                            {/* Right Side - Actual Spending */}
                            <div className="p-5">
                              <div className="mb-4">
                                <h4 className="text-lg font-semibold text-gray-800">Actual Spending</h4>
                                <p className="text-sm text-gray-500">Real costs incurred</p>
                              </div>

                              <div className="mb-3">
                                <p className="text-sm font-medium text-gray-600 mb-2">Sub Items</p>
                              </div>

                              {/* Actual Materials List */}
                              <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="bg-gray-50 px-4 py-2 flex justify-between text-xs font-medium text-gray-500 uppercase">
                                  <span>Material</span>
                                  <span>Amount</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {group.actualMaterials.filter((m: any) => {
                                    const amount = m.actual_amount || 0;
                                    const purchases = m.purchases || [];
                                    const hasActivePurchase = purchases.some((p: any) =>
                                      ['vendor_approved', 'purchase_completed', 'pending_td_approval'].includes(p.cr_status)
                                    );
                                    return amount > 0 || hasActivePurchase || m.is_new_material === true;
                                  }).length === 0 ? (
                                    <div className="px-4 py-6 text-center text-gray-400 text-sm">
                                      No purchases yet
                                    </div>
                                  ) : (
                                    (() => {
                                      // Group all purchases by CR ID to show CR summary with VAT
                                      const purchasesByCR: { [crId: string]: { materials: any[], totalAmount: number, totalVat: number, hasNewMaterial: boolean } } = {};

                                      group.actualMaterials
                                        .filter((material: any) => {
                                          const amount = material.actual_amount || 0;
                                          const purchases = material.purchases || [];
                                          const hasActivePurchase = purchases.some((p: any) =>
                                            ['vendor_approved', 'purchase_completed', 'pending_td_approval'].includes(p.cr_status)
                                          );
                                          return amount > 0 || hasActivePurchase || material.is_new_material === true;
                                        })
                                        .forEach((material: any) => {
                                          const purchases = material.purchases || [];
                                          const activePurchases = purchases.filter((p: any) =>
                                            ['vendor_approved', 'purchase_completed', 'pending_td_approval'].includes(p.cr_status)
                                          );

                                          activePurchases.forEach((purchase: any) => {
                                            const crId = purchase.cr_id || 'unknown';
                                            if (!purchasesByCR[crId]) {
                                              purchasesByCR[crId] = { materials: [], totalAmount: 0, totalVat: 0, hasNewMaterial: false };
                                            }
                                            purchasesByCR[crId].materials.push({
                                              ...material,
                                              purchase
                                            });
                                            purchasesByCR[crId].totalAmount += (purchase.amount || 0);
                                            // Use cr_total_vat if available (set on last material of CR), otherwise use vat_amount once
                                            if (purchase.cr_total_vat && purchase.cr_total_vat > purchasesByCR[crId].totalVat) {
                                              purchasesByCR[crId].totalVat = purchase.cr_total_vat;
                                            } else if (purchase.vat_amount > 0 && purchasesByCR[crId].totalVat === 0) {
                                              // Only set vat once per CR (vat_amount is only on last material)
                                              purchasesByCR[crId].totalVat = purchase.vat_amount;
                                            }
                                            if (purchase.is_new_material) {
                                              purchasesByCR[crId].hasNewMaterial = true;
                                            }
                                          });
                                        });

                                      // Render grouped by CR
                                      return Object.entries(purchasesByCR).flatMap(([crId, crData]) => {
                                        const elements: React.ReactNode[] = [];
                                        const crTotal = crData.totalAmount + crData.totalVat;
                                        const numMaterials = crData.materials.length;

                                        // Render each material in this CR
                                        crData.materials.forEach((item: any, idx: number) => {
                                          const isLastMaterial = idx === numMaterials - 1;
                                          // For the last material in CR, show total with VAT; otherwise show material amount
                                          const displayAmount = isLastMaterial && numMaterials === 1
                                            ? crTotal  // Single material CR: show total with VAT
                                            : (item.purchase.amount || 0);  // Multi-material CR: show individual amount

                                          elements.push(
                                            <div key={`cr-${crId}-mat-${idx}`} className="px-4 py-3 flex justify-between items-start">
                                              <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <p className="text-sm font-medium text-gray-900">{item.material_name}</p>
                                                  {item.purchase.is_new_material === true ? (
                                                    <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                                                      NEW - PO #{crId}
                                                    </Badge>
                                                  ) : crId !== 'unknown' && (
                                                    <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">
                                                      PO #{crId}
                                                    </Badge>
                                                  )}
                                                </div>
                                                <p className="text-xs text-gray-500">[{item.sub_item_name || item.item_name}]</p>
                                              </div>
                                              <div className="text-right">
                                                <p className="text-sm font-medium text-gray-900">
                                                  {displayAmount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </p>
                                                {isLastMaterial && numMaterials === 1 && crData.totalVat > 0 && (
                                                  <p className="text-xs text-gray-400">(incl. VAT)</p>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        });

                                        // Add PO summary row with total (including VAT) only for multi-material POs
                                        if (numMaterials > 1) {
                                          elements.push(
                                            <div key={`cr-${crId}-summary`} className="px-4 py-2 bg-gray-50 border-t border-gray-200">
                                              <div className="flex justify-between items-center text-sm font-semibold text-gray-700">
                                                <span>PO #{crId} Total {crData.totalVat > 0 ? '(incl. VAT)' : ''}</span>
                                                <span>{crTotal.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                              </div>
                                            </div>
                                          );
                                        }

                                        return elements;
                                      });
                                    })()
                                  )}
                                </div>
                              </div>

                            </div>
                          </div>

                          {/* Item Summary - Three columns */}
                          <div className="p-4 bg-gray-100 border-t border-gray-200">
                            <div className="grid grid-cols-3 gap-4">
                              <div className="p-3 rounded-lg bg-blue-50">
                                <p className="text-xs text-gray-500 mb-1">Total Planned</p>
                                <p className="text-base font-bold text-blue-600">
                                  {group.totals.planned_amount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                              </div>
                              <div className="p-3 rounded-lg bg-green-50">
                                <p className="text-xs text-gray-500 mb-1">Total Actual (incl. VAT)</p>
                                <p className="text-base font-bold text-green-600">
                                  {group.totals.actual_amount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                              </div>
                              <div className={`p-3 rounded-lg ${(group.totals.planned_amount - group.totals.actual_amount) >= 0 ? 'bg-gray-50' : 'bg-red-50'}`}>
                                <p className="text-xs text-gray-500 mb-1">Balance (remaining purchase)</p>
                                <p className={`text-base font-bold ${(group.totals.planned_amount - group.totals.actual_amount) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                                  {(group.totals.planned_amount - group.totals.actual_amount).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Overall Summary - At Bottom */}
                {(() => {
                  // Calculate totals from grouped items (which include VAT)
                  const totalPlanned = groupedByItem.reduce((sum, group) => sum + group.totals.planned_amount, 0);
                  const totalActualWithVat = groupedByItem.reduce((sum, group) => sum + group.totals.actual_amount, 0);
                  const balance = totalPlanned - totalActualWithVat;

                  return (
                    <div className="bg-white rounded-xl shadow-md overflow-hidden mt-6">
                      <div className="p-4 bg-gray-50 border-b border-gray-200">
                        <h3 className="font-bold text-gray-800">Overall Summary</h3>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="p-3 rounded-lg bg-blue-50">
                            <p className="text-xs text-gray-500 mb-1">Total Planned</p>
                            <p className="text-lg font-bold text-blue-600">
                              {totalPlanned.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-green-50">
                            <p className="text-xs text-gray-500 mb-1">Total Actual (incl. VAT)</p>
                            <p className="text-lg font-bold text-green-600">
                              {totalActualWithVat.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className={`p-3 rounded-lg ${balance >= 0 ? 'bg-gray-50' : 'bg-red-50'}`}>
                            <p className="text-xs text-gray-500 mb-1">Balance (remaining purchase)</p>
                            <p className={`text-lg font-bold ${balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                              {balance.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </>
            ) : (
              <div className="bg-white rounded-xl shadow-md p-12 text-center">
                <DocumentChartBarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No comparison data available for this project</p>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
