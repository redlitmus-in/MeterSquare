import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Package, CheckCircle, X, Save, RefreshCw,
  ArrowDownCircle, ArrowUpCircle, AlertTriangle,
  Trash2, Calendar, FileText, RotateCcw, Edit2, Printer, Download, Eye
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  inventoryService,
  InventoryTransaction,
  InventoryMaterial,
  MaterialReturn,
  MaterialCondition,
  CreateMaterialReturnData,
  InternalMaterialRequest,
  MaterialDeliveryNote,
  DeliveryNoteStatus,
  CreateDeliveryNoteData,
  DeliveryNoteItem,
  ProjectWithManagers,
  InventoryConfig,
  DispatchedMaterial
} from '../services/inventoryService';

type MainTabType = 'materials' | 'stock-in' | 'stock-out';
type StockInSubTab = 'grn' | 'returns';
type StockOutSubTab = 'requests' | 'delivery-notes';

// Stock status types for materials
type StockStatus = 'healthy' | 'warning' | 'critical' | 'out-of-stock';

// Helper function to determine stock status
const getStockStatus = (current: number, min: number): StockStatus => {
  if (current === 0) return 'out-of-stock';
  if (current <= min * 0.5) return 'critical';
  if (current <= min) return 'warning';
  return 'healthy';
};

const StockManagement: React.FC = () => {
  // Main tab state
  const [activeMainTab, setActiveMainTab] = useState<MainTabType>('stock-in');
  const [stockInSubTab, setStockInSubTab] = useState<StockInSubTab>('grn');
  const [stockOutSubTab, setStockOutSubTab] = useState<StockOutSubTab>('requests');

  // Data states
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [returns, setReturns] = useState<MaterialReturn[]>([]);
  const [projects, setProjects] = useState<ProjectWithManagers[]>([]);
  const [allRequests, setAllRequests] = useState<InternalMaterialRequest[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<MaterialDeliveryNote[]>([]);
  const [inventoryConfig, setInventoryConfig] = useState<InventoryConfig>({
    store_name: '',
    company_name: '',
    currency: 'AED',
    delivery_note_prefix: 'MDN'
  });
  const [categories, setCategories] = useState<string[]>([]);

  // UI states
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showDeliveryNoteModal, setShowDeliveryNoteModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dnStatusFilter, setDnStatusFilter] = useState<string>('all');

  // Materials Management states
  const [showEditMaterialModal, setShowEditMaterialModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<InventoryMaterial | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [materialCurrentPage, setMaterialCurrentPage] = useState(1);
  const materialsPerPage = 10;

  // Return flow states - dispatched materials from selected project
  const [dispatchedMaterials, setDispatchedMaterials] = useState<DispatchedMaterial[]>([]);
  const [loadingDispatchedMaterials, setLoadingDispatchedMaterials] = useState(false);

  // Print preview state for Delivery Notes
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [selectedDeliveryNote, setSelectedDeliveryNote] = useState<MaterialDeliveryNote | null>(null);

  // Selected request for creating DN from approved request
  const [selectedRequestForDN, setSelectedRequestForDN] = useState<InternalMaterialRequest | null>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    confirmColor?: string;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Confirm',
    confirmColor: 'purple'
  });

  const showConfirmation = (title: string, message: string, onConfirm: () => void, confirmText = 'Confirm', confirmColor = 'purple') => {
    setConfirmModal({ show: true, title, message, onConfirm, confirmText, confirmColor });
  };

  const closeConfirmation = () => {
    setConfirmModal({ ...confirmModal, show: false });
  };

  // Form state for new GRN (purchasing new materials)
  const [formData, setFormData] = useState({
    material_name: '',
    brand: '',
    size: '',
    category: '',
    unit: 'Nos',
    quantity: 0,
    unit_price: 0,
    reference_number: '',
    notes: ''
  });

  // Form state for new Return
  const [returnFormData, setReturnFormData] = useState<CreateMaterialReturnData>({
    inventory_material_id: 0,
    project_id: 0,
    quantity: 0,
    condition: 'Good',
    add_to_stock: true,
    return_reason: '',
    reference_number: '',
    notes: ''
  });

  // Form state for new Delivery Note
  const [dnFormData, setDnFormData] = useState<CreateDeliveryNoteData>({
    project_id: 0,
    delivery_date: new Date().toISOString().split('T')[0],
    attention_to: '',
    delivery_from: '',
    requested_by: '',
    vehicle_number: '',
    driver_name: '',
    driver_contact: '',
    notes: ''
  });

  // Items to add to the delivery note
  const [dnItems, setDnItems] = useState<Array<{
    inventory_material_id: number;
    quantity: number;
    notes: string;
    internal_request_id?: number;
  }>>([]);

  // Form state for adding/editing material
  const [materialFormData, setMaterialFormData] = useState({
    material_name: '',
    brand: '',
    size: '',
    category: '',
    unit: '',
    current_stock: 0,
    min_stock_level: 0,
    unit_price: 0,
    description: '',
    is_active: true
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [txnData, matData, returnsData, projectsData, requestsData, deliveryNotesData, configData] = await Promise.all([
        inventoryService.getAllTransactions(),
        inventoryService.getAllInventoryItems(),
        inventoryService.getAllMaterialReturns(),
        inventoryService.getAllProjects(),
        inventoryService.getSentInternalRequests(), // Get all sent requests from buyers
        inventoryService.getAllDeliveryNotes(),
        inventoryService.getInventoryConfig()
      ]);

      // Filter only PURCHASE transactions for Stock In
      const purchaseTransactions = (txnData || []).filter(
        (t: InventoryTransaction) => t.transaction_type === 'PURCHASE' || (t.transaction_type as string).toLowerCase() === 'purchase'
      );
      setTransactions(purchaseTransactions);
      setMaterials(matData || []);
      setReturns(returnsData?.returns || []);
      setProjects(Array.isArray(projectsData) ? projectsData : (projectsData?.projects || []));
      setAllRequests(requestsData || []);
      setDeliveryNotes(deliveryNotesData?.delivery_notes || []);
      setInventoryConfig(configData);

      // Extract unique categories for filter
      const uniqueCategories = [...new Set((matData || [])
        .map((m: InventoryMaterial) => m.category)
        .filter(Boolean))] as string[];
      setCategories(uniqueCategories);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ==================== STOCK IN HANDLERS ====================

  const handleCreateStockReceipt = async () => {
    if (!formData.material_name || !formData.unit || formData.quantity <= 0 || formData.unit_price <= 0) {
      alert('Please fill all required fields (Material Name, Unit, Quantity, Unit Price)');
      return;
    }

    setSaving(true);
    try {
      // Create the new material with the purchased quantity as initial stock
      const newMaterial = await inventoryService.createInventoryItem({
        material_name: formData.material_name,
        brand: formData.brand || undefined,
        size: formData.size || undefined,
        category: formData.category || undefined,
        unit: formData.unit,
        current_stock: formData.quantity,  // Set initial stock to purchased quantity
        min_stock_level: 0,
        unit_price: formData.unit_price,
        is_active: true
      });

      // Create a PURCHASE transaction to record this in history
      await inventoryService.createTransaction({
        inventory_material_id: newMaterial.inventory_material_id!,
        transaction_type: 'PURCHASE',
        quantity: formData.quantity,
        unit_price: formData.unit_price,
        total_amount: formData.quantity * formData.unit_price,
        reference_number: formData.reference_number,
        notes: formData.notes
      });

      setShowCreateModal(false);
      setFormData({
        material_name: '',
        brand: '',
        size: '',
        category: '',
        unit: 'Nos',
        quantity: 0,
        unit_price: 0,
        reference_number: '',
        notes: ''
      });
      fetchData();
    } catch (error: any) {
      console.error('Error creating stock receipt:', error);
      alert(error.message || 'Failed to record purchase');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateReturn = async () => {
    if (!returnFormData.inventory_material_id || !returnFormData.project_id || returnFormData.quantity <= 0) {
      alert('Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      await inventoryService.createMaterialReturn(returnFormData);
      setShowReturnModal(false);
      setReturnFormData({
        inventory_material_id: 0,
        project_id: 0,
        quantity: 0,
        condition: 'Good',
        add_to_stock: true,
        return_reason: '',
        reference_number: '',
        notes: ''
      });
      setDispatchedMaterials([]);  // Reset dispatched materials
      fetchData();
    } catch (error) {
      console.error('Error creating return:', error);
      alert('Failed to create return');
    } finally {
      setSaving(false);
    }
  };

  // Handler for project selection in Return modal - fetches dispatched materials
  const handleReturnProjectSelect = async (projectId: number) => {
    setReturnFormData({
      ...returnFormData,
      project_id: projectId,
      inventory_material_id: 0,  // Reset material selection
      quantity: 0  // Reset quantity
    });
    setDispatchedMaterials([]);

    if (projectId > 0) {
      setLoadingDispatchedMaterials(true);
      try {
        const result = await inventoryService.getDispatchedMaterialsForProject(projectId);
        setDispatchedMaterials(result.materials || []);
      } catch (error) {
        console.error('Error fetching dispatched materials:', error);
      } finally {
        setLoadingDispatchedMaterials(false);
      }
    }
  };

  const handleReturnMaterialSelect = (materialId: number) => {
    const dispatchedMat = dispatchedMaterials.find(m => m.inventory_material_id === materialId);
    setReturnFormData({
      ...returnFormData,
      inventory_material_id: materialId,
      quantity: 0  // Reset quantity when material changes
    });
  };

  // Get max returnable quantity for selected material
  const getMaxReturnableQuantity = (): number => {
    if (!returnFormData.inventory_material_id) return 0;
    const dispatchedMat = dispatchedMaterials.find(
      m => m.inventory_material_id === returnFormData.inventory_material_id
    );
    return dispatchedMat?.returnable_quantity || 0;
  };

  // ==================== STOCK OUT HANDLERS ====================

  const handleApproveRequest = async (requestId: number) => {
    try {
      await inventoryService.approveInternalRequest(requestId);
      fetchData();
    } catch (error) {
      console.error('Error approving request:', error);
      alert('Failed to approve request');
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      await inventoryService.rejectInternalRequest(requestId, reason);
      fetchData();
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('Failed to reject request');
    }
  };

  const handleDispatchRequest = async (requestId: number) => {
    try {
      await inventoryService.dispatchMaterial(requestId);
      fetchData();
    } catch (error) {
      console.error('Error dispatching:', error);
      alert('Failed to dispatch material');
    }
  };

  // ==================== DELIVERY NOTE HANDLERS ====================

  // Get available recipients for the selected project (PM, MEP, SE)
  const getAvailableRecipients = () => {
    const selectedProject = projects.find(p => p.project_id === dnFormData.project_id);
    if (!selectedProject) return [];

    const recipients: Array<{ name: string; role: string }> = [];

    // Add Project Managers
    selectedProject.project_managers?.forEach(pm => {
      recipients.push({ name: pm.full_name, role: 'Project Manager' });
    });

    // Add MEP Supervisors
    selectedProject.mep_supervisors?.forEach(mep => {
      recipients.push({ name: mep.full_name, role: 'MEP Supervisor' });
    });

    // Add Site Supervisors/Engineers
    selectedProject.site_supervisors?.forEach(se => {
      recipients.push({ name: se.full_name, role: 'Site Engineer' });
    });

    return recipients;
  };

  // Handler for project selection
  const handleDeliveryNoteProjectSelect = (projectId: number) => {
    setDnFormData({
      ...dnFormData,
      project_id: projectId,
      attention_to: ''  // Reset when project changes
    });
  };

  const handleCreateDeliveryNote = async () => {
    if (!dnFormData.project_id || !dnFormData.delivery_date) {
      alert('Please select a project and delivery date');
      return;
    }

    if (dnItems.length === 0) {
      alert('Please add at least one item to the delivery note');
      return;
    }

    setSaving(true);
    try {
      // Create the delivery note
      const newNote = await inventoryService.createDeliveryNote(dnFormData);

      // Add items to the delivery note (with request link if creating from request)
      for (const item of dnItems) {
        await inventoryService.addDeliveryNoteItem(newNote.delivery_note_id!, {
          inventory_material_id: item.inventory_material_id,
          quantity: item.quantity,
          notes: item.notes,
          internal_request_id: item.internal_request_id
        });
      }

      setShowDeliveryNoteModal(false);
      resetDeliveryNoteForm();
      fetchData();
      alert('Delivery note created successfully');
    } catch (error: any) {
      console.error('Error creating delivery note:', error);
      alert(error.message || 'Failed to create delivery note');
    } finally {
      setSaving(false);
    }
  };

  const resetDeliveryNoteForm = () => {
    setDnFormData({
      project_id: 0,
      delivery_date: new Date().toISOString().split('T')[0],
      attention_to: '',
      delivery_from: inventoryConfig.store_name,
      requested_by: '',
      vehicle_number: '',
      driver_name: '',
      driver_contact: '',
      notes: ''
    });
    setDnItems([]);
    setSelectedRequestForDN(null);
  };

  // Handle creating DN from approved request - pre-fills form with request data
  const handleCreateDNFromRequest = (request: InternalMaterialRequest) => {
    setSelectedRequestForDN(request);

    // Pre-fill form with request data
    setDnFormData({
      project_id: request.project_id || 0,
      delivery_date: new Date().toISOString().split('T')[0],
      attention_to: request.project_details?.project_managers?.[0]?.full_name || '',
      delivery_from: inventoryConfig.store_name,
      requested_by: request.requester_details?.full_name || '',
      vehicle_number: '',
      driver_name: '',
      driver_contact: '',
      notes: `Material request #${request.request_number || request.request_id}`
    });

    // Pre-fill items with the request material
    setDnItems([{
      inventory_material_id: request.inventory_material_id || 0,
      quantity: request.quantity || 0,
      notes: '',
      internal_request_id: request.request_id
    }]);

    setShowDeliveryNoteModal(true);
    setStockOutSubTab('delivery-notes');
  };

  const handleAddDnItem = () => {
    setDnItems([...dnItems, { inventory_material_id: 0, quantity: 0, notes: '' }]);
  };

  const handleRemoveDnItem = (index: number) => {
    setDnItems(dnItems.filter((_, i) => i !== index));
  };

  const handleDnItemChange = (index: number, field: string, value: any) => {
    setDnItems(dnItems.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const handleIssueDeliveryNote = (noteId: number) => {
    showConfirmation(
      'Issue Delivery Note',
      'Issue this delivery note? This will deduct stock for all items.',
      async () => {
        closeConfirmation();
        try {
          await inventoryService.issueDeliveryNote(noteId);
          fetchData();
        } catch (error: any) {
          console.error('Error issuing delivery note:', error);
          alert(error.message || 'Failed to issue delivery note');
        }
      },
      'Issue',
      'green'
    );
  };

  const handleDispatchDeliveryNote = (noteId: number) => {
    const now = new Date();
    const dispatchDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const dispatchTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    showConfirmation(
      'Dispatch Delivery Note',
      `Dispatch Date: ${dispatchDate}\nDispatch Time: ${dispatchTime}\n\nConfirm dispatch of this delivery note?`,
      async () => {
        closeConfirmation();
        try {
          await inventoryService.dispatchDeliveryNote(noteId);
          fetchData();
        } catch (error: any) {
          console.error('Error dispatching delivery note:', error);
          alert(error.message || 'Failed to dispatch delivery note');
        }
      },
      'Dispatch',
      'purple'
    );
  };

  const handleCancelDeliveryNote = (noteId: number) => {
    showConfirmation(
      'Cancel Delivery Note',
      'Are you sure you want to cancel this delivery note?',
      async () => {
        closeConfirmation();
        try {
          await inventoryService.cancelDeliveryNote(noteId);
          fetchData();
        } catch (error: any) {
          console.error('Error cancelling delivery note:', error);
          alert(error.message || 'Failed to cancel delivery note');
        }
      },
      'Cancel',
      'red'
    );
  };

  // ==================== PRINT & DOWNLOAD HANDLERS ====================

  const generateDeliveryNotePrintContent = (dn: MaterialDeliveryNote): string => {
    // Generate rows - only actual items, no empty rows
    const items = dn.items || [];

    let itemsHtml = '';
    items.forEach((item, i) => {
      itemsHtml += `
        <tr>
          <td class="cell center">${i + 1}</td>
          <td class="cell">${item.material_name || ''}${item.brand ? ` (${item.brand})` : ''}${item.size ? ` - ${item.size}` : ''}</td>
          <td class="cell center">${item.quantity} ${item.unit || ''}</td>
          <td class="cell">${item.notes || ''}</td>
        </tr>
      `;
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Material Delivery Note - ${dn.delivery_note_number}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: Arial, sans-serif;
            font-size: 11pt;
            color: #000;
            background: #fff;
            padding: 20px;
          }
          .page {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
            border: 2px solid #000;
            padding: 15mm;
          }
          .header-wrapper {
            border: 2px solid #000;
            padding: 10px;
          }
          .header-table {
            width: 100%;
            border-collapse: collapse;
          }
          .header-table td {
            border: 1px solid #000;
            padding: 10px 15px;
            background: #f9f9f9;
            vertical-align: middle;
          }
          .header-table .title-cell {
            text-align: left;
          }
          .header-table .logo-cell {
            width: 120px;
            text-align: center;
          }
          .header-table .logo-cell img {
            height: 40px;
            object-fit: contain;
          }
          .header-table h1 {
            font-size: 14pt;
            font-weight: bold;
            letter-spacing: 1px;
            margin: 0;
          }
          .doc-number {
            font-size: 9pt;
            margin-top: 3px;
            color: #555;
          }
          .gap {
            height: 15px;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
          }
          .info-table td {
            border: 1px solid #000;
            padding: 8px 10px;
            vertical-align: top;
          }
          .info-table .label {
            font-weight: bold;
            width: 25%;
            background: #f9f9f9;
          }
          .info-table .value {
            width: 25%;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
          }
          .items-table th {
            border: 1px solid #000;
            padding: 10px;
            background: #e0e0e0;
            font-weight: bold;
            text-align: center;
          }
          .items-table .cell {
            border: 1px solid #000;
            padding: 8px 10px;
            height: 35px;
          }
          .items-table .center {
            text-align: center;
          }
          .footer-table {
            width: 100%;
            border-collapse: collapse;
          }
          .footer-table td {
            border: 1px solid #000;
            padding: 15px;
            width: 50%;
            height: 60px;
            vertical-align: top;
          }
          .signature-label {
            font-weight: bold;
          }
          @media print {
            body { padding: 0; }
            .page { max-width: none; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <!-- Header - Title on Left, Logo on Right (with outer border) -->
          <div class="header-wrapper">
            <table class="header-table">
              <tr>
                <td class="title-cell">
                  <h1>MATERIAL DELIVERY NOTE</h1>
                  <div class="doc-number">${dn.delivery_note_number}</div>
                </td>
                <td class="logo-cell">
                  <img src="${window.location.origin}/assets/logo.png" alt="Logo" />
                </td>
              </tr>
            </table>
          </div>

          <!-- Gap between header and body -->
          <div class="gap"></div>

          <!-- Info Section -->
          <table class="info-table">
            <tr>
              <td class="label">Project & Location</td>
              <td class="value">${dn.project_details?.project_name || ''}${dn.project_details?.location ? ` - ${dn.project_details.location}` : ''}</td>
              <td class="label">Delivery Date</td>
              <td class="value">${dn.delivery_date ? new Date(dn.delivery_date).toLocaleDateString() : ''}</td>
            </tr>
            <tr>
              <td class="label">Attention to:</td>
              <td class="value">${dn.attention_to || ''}</td>
              <td class="label">Delivery From</td>
              <td class="value">${dn.delivery_from || inventoryConfig.store_name || 'M2 Store'}</td>
            </tr>
            <tr>
              <td class="label" rowspan="2">Materials Requested By:<br><span style="font-weight: normal; font-size: 9pt;">Name & Signature:</span></td>
              <td class="value" rowspan="2">${dn.requested_by || ''}</td>
              <td class="label">Request Date:</td>
              <td class="value">${dn.created_at ? new Date(dn.created_at).toLocaleDateString() : ''}</td>
            </tr>
            <tr>
              <td class="label">Vehicle & Driver:</td>
              <td class="value">${dn.vehicle_number || ''}${dn.driver_name ? ` / ${dn.driver_name}` : ''}</td>
            </tr>
          </table>

          <!-- Gap between info and items table -->
          <div class="gap"></div>

          <!-- Items Table -->
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 60px;">Sr No.</th>
                <th>Description</th>
                <th style="width: 100px;">Qty</th>
                <th style="width: 200px;">Notes</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <!-- Gap between items and footer -->
          <div class="gap"></div>

          <!-- Footer -->
          <div style="display: flex; justify-content: space-between; margin-top: 20px;">
            <div style="width: 45%;">
              <span class="signature-label">Prepared By:</span><br>
              <span style="font-weight: normal;">${dn.prepared_by || ''}</span><br><br>
              <span>Signature:</span><br><br>
              <span>Date:</span>
            </div>
            <div style="width: 45%;">
              <span class="signature-label">Checked By:</span><br><br><br>
              <span>Signature:</span><br><br>
              <span>Date:</span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handlePrintDeliveryNote = (dn: MaterialDeliveryNote) => {
    const printContent = generateDeliveryNotePrintContent(dn);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const handleDownloadDeliveryNote = async (dn: MaterialDeliveryNote) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Load and add logo
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => reject();
        logoImg.src = '/assets/logo.png';
      });
      doc.addImage(logoImg, 'PNG', 14, 10, 40, 15);
    } catch {
      // Continue without logo if it fails to load
    }

    // Header - adjusted position for logo
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('MATERIAL DELIVERY NOTE', pageWidth / 2 + 10, 18, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`${dn.delivery_note_number}`, pageWidth / 2 + 10, 25, { align: 'center' });

    // Horizontal line
    doc.setLineWidth(0.5);
    doc.line(14, 32, pageWidth - 14, 32);

    // Details table with borders
    const startY = 36;
    const rowHeight = 10;
    const leftColWidth = 85;
    const rightColStart = 14 + leftColWidth;
    const tableWidth = pageWidth - 28;

    doc.setFontSize(9);
    doc.setLineWidth(0.3);

    // Row 1: Project & Location | Delivery Date
    doc.rect(14, startY, leftColWidth, rowHeight);
    doc.rect(rightColStart, startY, tableWidth - leftColWidth, rowHeight);
    doc.setFont('helvetica', 'bold');
    doc.text('Project & Location:', 16, startY + 6);
    doc.setFont('helvetica', 'normal');
    const projectLoc = `${dn.project_details?.project_name || '-'}, ${dn.project_details?.location || '-'}`;
    doc.text(projectLoc.length > 35 ? projectLoc.substring(0, 35) + '...' : projectLoc, 16, startY + 6 + 3, { maxWidth: leftColWidth - 5 });
    doc.setFont('helvetica', 'bold');
    doc.text('Delivery Date:', rightColStart + 2, startY + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(dn.delivery_date ? new Date(dn.delivery_date).toLocaleDateString() : '-', rightColStart + 35, startY + 6);

    // Row 2: Attention to | Delivery From
    const row2Y = startY + rowHeight;
    doc.rect(14, row2Y, leftColWidth, rowHeight);
    doc.rect(rightColStart, row2Y, tableWidth - leftColWidth, rowHeight);
    doc.setFont('helvetica', 'bold');
    doc.text('Attention to:', 16, row2Y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(dn.attention_to || '-', 45, row2Y + 6);
    doc.setFont('helvetica', 'bold');
    doc.text('Delivery From:', rightColStart + 2, row2Y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(dn.delivery_from || '-', rightColStart + 35, row2Y + 6);

    // Row 3: Materials Requested By | Name & Signature
    const row3Y = startY + rowHeight * 2;
    doc.rect(14, row3Y, leftColWidth, rowHeight);
    doc.rect(rightColStart, row3Y, tableWidth - leftColWidth, rowHeight);
    doc.setFont('helvetica', 'bold');
    doc.text('Materials Requested By:', 16, row3Y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(dn.requested_by || '-', 58, row3Y + 6);
    doc.setFont('helvetica', 'bold');
    doc.text('Name & Signature:', rightColStart + 2, row3Y + 6);

    // Row 4: Request Date | Vehicle & Driver
    const row4Y = startY + rowHeight * 3;
    doc.rect(14, row4Y, leftColWidth, rowHeight);
    doc.rect(rightColStart, row4Y, tableWidth - leftColWidth, rowHeight);
    doc.setFont('helvetica', 'bold');
    doc.text('Request Date:', 16, row4Y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(dn.request_date ? new Date(dn.request_date).toLocaleDateString() : '-', 45, row4Y + 6);
    doc.setFont('helvetica', 'bold');
    doc.text('Vehicle & Driver:', rightColStart + 2, row4Y + 6);
    doc.setFont('helvetica', 'normal');
    const vehicleDriver = `${dn.vehicle_number || '-'} / ${dn.driver_name || '-'}`;
    doc.text(vehicleDriver, rightColStart + 38, row4Y + 6);

    let yPos = row4Y + rowHeight + 8;

    // Items table - only actual items, no empty rows
    const items = dn.items || [];
    const tableData = items.map((item, index) => [
      index + 1,
      `${item.material_name || ''}${item.brand ? ` (${item.brand})` : ''}${item.size ? ` - ${item.size}` : ''}`,
      `${item.quantity} ${item.unit || ''}`,
      item.notes || '-'
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Material Description', 'Quantity', 'Notes']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [200, 200, 200], textColor: 0, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 80 },
        2: { cellWidth: 35, halign: 'center' },
        3: { cellWidth: 50 }
      },
      styles: { fontSize: 9, cellPadding: 3 }
    });

    // Get final Y position after table
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Notes section
    let notesEndY = finalY;
    if (dn.notes) {
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 14, finalY);
      doc.setFont('helvetica', 'normal');
      doc.text(dn.notes, 14, finalY + 6);
      notesEndY = finalY + 15;
    }

    // Signature section (no borders, no lines)
    const signatureY = notesEndY + 15;
    doc.setFont('helvetica', 'bold');
    doc.text('Prepared By:', 14, signatureY);
    doc.text('Checked By:', pageWidth / 2 + 10, signatureY);

    doc.setFont('helvetica', 'normal');
    doc.text(dn.prepared_by || '', 14, signatureY + 8);

    doc.text('Signature:', 14, signatureY + 20);
    doc.text('Signature:', pageWidth / 2 + 10, signatureY + 20);

    doc.text('Date:', 14, signatureY + 28);
    doc.text('Date:', pageWidth / 2 + 10, signatureY + 28);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

    // Save the PDF
    doc.save(`${dn.delivery_note_number}.pdf`);
  };

  // ==================== MATERIALS MANAGEMENT HANDLERS ====================

  const resetMaterialForm = () => {
    setMaterialFormData({
      material_name: '',
      brand: '',
      size: '',
      category: '',
      unit: '',
      current_stock: 0,
      min_stock_level: 0,
      unit_price: 0,
      description: '',
      is_active: true
    });
    setSelectedMaterial(null);
  };

  const handleMaterialInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setMaterialFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked :
              ['current_stock', 'min_stock_level', 'unit_price'].includes(name) ?
              parseFloat(value) || 0 : value
    }));
  };


  const handleEditMaterialClick = (material: InventoryMaterial) => {
    setSelectedMaterial(material);
    setMaterialFormData({
      material_name: material.material_name,
      brand: material.brand || '',
      size: material.size || '',
      category: material.category || '',
      unit: material.unit,
      current_stock: material.current_stock,
      min_stock_level: material.min_stock_level || 0,
      unit_price: material.unit_price,
      description: material.description || '',
      is_active: material.is_active !== false
    });
    setShowEditMaterialModal(true);
  };

  const handleUpdateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial?.inventory_material_id) return;

    setSaving(true);
    try {
      await inventoryService.updateInventoryItem(selectedMaterial.inventory_material_id, materialFormData);
      setShowEditMaterialModal(false);
      resetMaterialForm();
      fetchData();
    } catch (error: any) {
      console.error('Error updating material:', error);
      alert(error.message || 'Failed to update material');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMaterial = (material: InventoryMaterial) => {
    if (!material.inventory_material_id) return;

    showConfirmation(
      'Delete Material',
      `Are you sure you want to delete "${material.material_name}"?`,
      async () => {
        closeConfirmation();
        try {
          await inventoryService.deleteInventoryItem(material.inventory_material_id!);
          fetchData();
        } catch (error: any) {
          console.error('Error deleting material:', error);
          alert(error.message || 'Failed to delete material');
        }
      },
      'Delete',
      'red'
    );
  };

  // Get status badge color for materials
  const getMaterialStatusColor = (material: InventoryMaterial) => {
    const status = getStockStatus(material.current_stock, material.min_stock_level || 0);
    switch(status) {
      case 'healthy': return 'bg-green-100 text-green-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'critical': return 'bg-orange-100 text-orange-800';
      case 'out-of-stock': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getMaterialStatusText = (material: InventoryMaterial) => {
    const status = getStockStatus(material.current_stock, material.min_stock_level || 0);
    switch(status) {
      case 'healthy': return 'Healthy';
      case 'warning': return 'Low Stock';
      case 'critical': return 'Critical';
      case 'out-of-stock': return 'Out of Stock';
      default: return 'Unknown';
    }
  };

  // ==================== FILTERS ====================

  const filteredTransactions = transactions.filter(txn => {
    const material = materials.find(m => m.inventory_material_id === txn.inventory_material_id);
    const materialName = material?.material_name || '';
    return materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           txn.reference_number?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredReturns = returns.filter(ret => {
    const materialName = ret.material_name || '';
    return materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           ret.reference_number?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredRequests = (statusFilter === 'all'
    ? allRequests
    : allRequests.filter(r => {
        // Normalize status for filtering
        let normalizedStatus = r.status?.toUpperCase() || 'PENDING';
        if (normalizedStatus === 'SEND_REQUEST') normalizedStatus = 'PENDING';
        return normalizedStatus === statusFilter;
      })
    ).filter(r => r.material_name?.toLowerCase().includes(searchTerm.toLowerCase()));

  // Filtered materials for Materials tab
  const filteredMaterials = materials.filter(material => {
    const matchesSearch = searchTerm === '' ||
      material.material_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.material_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.brand?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || material.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Pagination for materials
  const totalMaterialPages = Math.ceil(filteredMaterials.length / materialsPerPage);
  const paginatedMaterials = filteredMaterials.slice(
    (materialCurrentPage - 1) * materialsPerPage,
    materialCurrentPage * materialsPerPage
  );

  // ==================== STATS ====================

  const getStockInStats = () => {
    const todayTransactions = transactions.filter(t => {
      const txnDate = new Date(t.created_at || '').toDateString();
      return txnDate === new Date().toDateString();
    });
    const goodReturns = returns.filter(r => r.condition === 'Good').length;
    const pendingDisposal = returns.filter(r => r.disposal_status === 'pending_review').length;

    return { todayTransactions: todayTransactions.length, goodReturns, pendingDisposal };
  };

  const getStockOutStats = () => {
    // Normalize status for counting
    const normalizeStatus = (status: string | undefined) => {
      const s = status?.toUpperCase() || 'PENDING';
      if (s === 'SEND_REQUEST') return 'PENDING';
      if (s === 'DN_PENDING') return 'DN_PENDING';
      return s;
    };

    return {
      pending: allRequests.filter(r => normalizeStatus(r.status) === 'PENDING').length,
      approved: allRequests.filter(r => normalizeStatus(r.status) === 'APPROVED').length,
      dnPending: allRequests.filter(r => normalizeStatus(r.status) === 'DN_PENDING').length,
      dispatched: allRequests.filter(r => normalizeStatus(r.status) === 'DISPATCHED').length,
      fulfilled: allRequests.filter(r => normalizeStatus(r.status) === 'FULFILLED').length
    };
  };

  const getMaterialsStats = () => {
    const total = materials.length;
    const lowStock = materials.filter(m => {
      const status = getStockStatus(m.current_stock, m.min_stock_level || 0);
      return status === 'warning' || status === 'critical' || status === 'out-of-stock';
    }).length;
    const outOfStock = materials.filter(m => m.current_stock === 0).length;
    return { total, lowStock, outOfStock };
  };

  const stockInStats = getStockInStats();
  const stockOutStats = getStockOutStats();
  const materialsStats = getMaterialsStats();

  // ==================== RENDER ====================

  const getConditionBadge = (condition: MaterialCondition) => {
    const styles = {
      'Good': 'bg-green-100 text-green-800',
      'Damaged': 'bg-yellow-100 text-yellow-800',
      'Defective': 'bg-red-100 text-red-800'
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[condition]}`}>{condition}</span>;
  };

  const getStatusBadge = (status: string) => {
    const normalizedStatus = status?.toUpperCase() || 'PENDING';
    // Map variations to standard statuses
    const statusMap: Record<string, string> = {
      'SEND_REQUEST': 'PENDING',
      'PENDING': 'PENDING',
      'APPROVED': 'APPROVED',
      'DN_PENDING': 'DN_PENDING',
      'DISPATCHED': 'DISPATCHED',
      'FULFILLED': 'FULFILLED',
      'REJECTED': 'REJECTED'
    };
    const displayStatus = statusMap[normalizedStatus] || normalizedStatus;

    const styles: Record<string, string> = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'APPROVED': 'bg-blue-100 text-blue-800',
      'DN_PENDING': 'bg-indigo-100 text-indigo-800',
      'DISPATCHED': 'bg-purple-100 text-purple-800',
      'FULFILLED': 'bg-green-100 text-green-800',
      'REJECTED': 'bg-red-100 text-red-800'
    };

    const labels: Record<string, string> = {
      'PENDING': 'Pending',
      'APPROVED': 'Approved',
      'DN_PENDING': 'DN Created',
      'DISPATCHED': 'Dispatched',
      'FULFILLED': 'Fulfilled',
      'REJECTED': 'Rejected'
    };

    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[displayStatus] || 'bg-gray-100 text-gray-800'}`}>{labels[displayStatus] || displayStatus}</span>;
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>

        {/* Tabs Skeleton */}
        <div className="flex gap-4 animate-pulse">
          <div className="h-12 bg-gray-200 rounded-lg w-32"></div>
          <div className="h-12 bg-gray-200 rounded-lg w-32"></div>
          <div className="h-12 bg-gray-200 rounded-lg w-32"></div>
        </div>

        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-4 gap-4 animate-pulse">
          <div className="h-24 bg-gray-200 rounded-lg"></div>
          <div className="h-24 bg-gray-200 rounded-lg"></div>
          <div className="h-24 bg-gray-200 rounded-lg"></div>
          <div className="h-24 bg-gray-200 rounded-lg"></div>
        </div>

        {/* Table Skeleton */}
        <div className="bg-white rounded-lg shadow-sm p-4 animate-pulse">
          <div className="h-10 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
        <p className="text-gray-600">Manage materials, stock movements - In and Out</p>
      </div>

      {/* Main Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveMainTab('materials')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeMainTab === 'materials'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              <span className="font-semibold">Materials Catalog</span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                {materialsStats.total}
              </span>
              {materialsStats.lowStock > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                  {materialsStats.lowStock} low
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400 font-normal">Define what items you track</span>
          </button>
          <button
            onClick={() => setActiveMainTab('stock-in')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeMainTab === 'stock-in'
                ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="w-5 h-5" />
              <span className="font-semibold">Stock In</span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                {stockInStats.todayTransactions} today
              </span>
            </div>
            <span className="text-xs text-gray-400 font-normal">Receive new stock & returns</span>
          </button>
          <button
            onClick={() => setActiveMainTab('stock-out')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeMainTab === 'stock-out'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5" />
              <span className="font-semibold">Stock Out</span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
                {stockOutStats.pending} pending
              </span>
            </div>
            <span className="text-xs text-gray-400 font-normal">Issue materials to projects</span>
          </button>
        </div>
      </div>

      {/* ==================== MATERIALS TAB ==================== */}
      {activeMainTab === 'materials' && (
        <div className="space-y-6">
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Package className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-blue-900">Materials Catalog</h3>
                <p className="text-sm text-blue-700 mt-1">
                  View all materials available in your store. Materials are added automatically when you:
                </p>
                <div className="flex flex-wrap gap-4 mt-2 text-xs text-blue-600">
                  <span className="flex items-center gap-1">
                    <ArrowDownCircle className="w-3 h-3" />
                    <strong>New Purchases:</strong> Record purchases in Stock In tab
                  </span>
                  <span className="flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />
                    <strong>Returns:</strong> Materials returned from project sites
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by material name, code, or brand..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>

          {/* Materials Table */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Availability</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedMaterials.map((material) => (
                    <tr key={material.inventory_material_id} className={`hover:bg-gray-50 ${material.current_stock === 0 ? 'bg-red-50' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {material.material_code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          <div className="font-medium">{material.material_name}</div>
                          {material.brand && <div className="text-gray-500 text-xs">{material.brand}</div>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {material.category || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {material.current_stock > 0 ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3" />
                            Available
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
                            <X className="w-3 h-3" />
                            Not Available
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          <div className={`font-bold text-lg ${material.current_stock === 0 ? 'text-red-600' : material.current_stock <= (material.min_stock_level || 0) ? 'text-orange-600' : 'text-green-600'}`}>
                            {material.current_stock} {material.unit}
                          </div>
                          <div className="text-gray-500 text-xs">Min: {material.min_stock_level || 0}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {inventoryConfig.currency} {material.unit_price?.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleEditMaterialClick(material)}
                          className="text-indigo-600 hover:text-indigo-900 mr-3"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMaterial(material)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalMaterialPages > 1 && (
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
                <div className="text-sm text-gray-700">
                  Showing {(materialCurrentPage - 1) * materialsPerPage + 1} to {Math.min(materialCurrentPage * materialsPerPage, filteredMaterials.length)} of {filteredMaterials.length} results
                </div>
                <div className="flex gap-2">
                  {Array.from({ length: totalMaterialPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setMaterialCurrentPage(page)}
                      className={`px-3 py-1 rounded ${
                        materialCurrentPage === page
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredMaterials.length === 0 && (
              <div className="text-center py-12">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No materials found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== STOCK IN TAB ==================== */}
      {activeMainTab === 'stock-in' && (
        <div className="space-y-6">
          {/* Info Banner */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ArrowDownCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-green-900">Stock In - Increase Inventory</h3>
                <p className="text-sm text-green-700 mt-1">
                  Record materials <strong>coming into</strong> your store. This <strong>increases stock quantities</strong>.
                </p>
                <div className="flex flex-wrap gap-4 mt-2 text-xs text-green-600">
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3" />
                    <strong>New Purchases:</strong> Materials bought from vendors
                  </span>
                  <span className="flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />
                    <strong>Returns:</strong> Unused materials returned from project sites
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-tabs for Stock In */}
          <div className="flex gap-2">
            <button
              onClick={() => setStockInSubTab('grn')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                stockInSubTab === 'grn'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Package className="w-4 h-4 inline mr-2" />
              New Purchases (GRN)
            </button>
            <button
              onClick={() => setStockInSubTab('returns')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                stockInSubTab === 'returns'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <RotateCcw className="w-4 h-4 inline mr-2" />
              Returns from Site
              {stockInStats.pendingDisposal > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                  {stockInStats.pendingDisposal}
                </span>
              )}
            </button>
          </div>

          {/* Search and Actions */}
          <div className="flex justify-between items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 w-64"
              />
            </div>
            <button
              onClick={() => stockInSubTab === 'grn' ? setShowCreateModal(true) : setShowReturnModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              title={stockInSubTab === 'grn' ? 'Record new stock received from vendor' : 'Record materials returned from project site'}
            >
              <Plus className="w-5 h-5" />
              {stockInSubTab === 'grn' ? 'Record Stock Receipt' : 'Record Return'}
            </button>
          </div>

          {/* GRN Table */}
          {stockInSubTab === 'grn' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase bg-green-50">Stock Added</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        No stock receipts found. Click "Record Stock Receipt" to add incoming stock.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((txn) => {
                      const material = materials.find(m => m.inventory_material_id === txn.inventory_material_id);
                      return (
                        <tr key={txn.inventory_transaction_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {new Date(txn.created_at || '').toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {txn.reference_number || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <div className="font-medium">{material?.material_name || 'Unknown'}</div>
                            <span className="text-gray-500 text-xs">{material?.material_code}</span>
                          </td>
                          <td className="px-6 py-4 text-center bg-green-50">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800">
                              <ArrowDownCircle className="w-4 h-4" />
                              +{txn.quantity} {material?.unit}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {inventoryConfig.currency} {txn.unit_price?.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {inventoryConfig.currency} {txn.total_amount?.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Returns Table */}
          {stockInSubTab === 'returns' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">From Project</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase bg-green-50">Stock Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredReturns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        No material returns found. Click "Record Return" to add materials returned from site.
                      </td>
                    </tr>
                  ) : (
                    filteredReturns.map((ret) => (
                      <tr key={ret.return_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {new Date(ret.created_at || '').toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {ret.reference_number || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <div className="font-medium">{ret.material_name || 'Unknown'}</div>
                          <span className="text-gray-500 text-xs">{ret.material_code}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {ret.project_details?.project_name || `Project ${ret.project_id}`}
                        </td>
                        <td className="px-6 py-4">
                          {getConditionBadge(ret.condition)}
                        </td>
                        <td className="px-6 py-4 text-center bg-green-50">
                          {ret.add_to_stock ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800">
                              <ArrowDownCircle className="w-4 h-4" />
                              +{ret.quantity} {ret.unit}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-500">
                              Not Added
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== STOCK OUT TAB ==================== */}
      {activeMainTab === 'stock-out' && (
        <div className="space-y-6">
          {/* Info Banner */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ArrowUpCircle className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-purple-900">Stock Out - Decrease Inventory</h3>
                <p className="text-sm text-purple-700 mt-1">
                  Issue materials <strong>going out</strong> to project sites. This <strong>decreases stock quantities</strong>.
                </p>
                <div className="flex flex-wrap gap-4 mt-2 text-xs text-purple-600">
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3" />
                    <strong>Requests:</strong> Material requests from Procurement team
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <strong>Delivery Notes:</strong> Official dispatch documents for site delivery
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-tabs for Stock Out */}
          <div className="flex gap-2">
            <button
              onClick={() => setStockOutSubTab('requests')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                stockOutSubTab === 'requests'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Package className="w-4 h-4 inline mr-2" />
              Material Requests
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
                {stockOutStats.pending}
              </span>
            </button>
            <button
              onClick={() => setStockOutSubTab('delivery-notes')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                stockOutSubTab === 'delivery-notes'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Delivery Notes
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                {deliveryNotes.length}
              </span>
            </button>
          </div>

          {/* REQUESTS SUB-TAB */}
          {stockOutSubTab === 'requests' && (
            <>
              {/* Filters - Responsive */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex gap-2 flex-wrap">
                  {['all', 'PENDING', 'APPROVED', 'DN_PENDING', 'DISPATCHED', 'FULFILLED'].map(status => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                        statusFilter === status
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {status === 'all' ? 'All' : status === 'DN_PENDING' ? 'DN Created' : status}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search materials..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 w-64"
                  />
                </div>
              </div>

              {/* Requests Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Desktop Table View */}
            <table className="min-w-full divide-y divide-gray-200 hidden lg:table">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Request #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requester</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                      No material requests found
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((req) => (
                    <tr key={req.request_id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">
                        #{req.request_number || req.request_id}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <div>
                          <div className="font-medium">{req.project_details?.project_name || '-'}</div>
                          <div className="text-gray-500 text-xs">{req.project_details?.project_code || ''}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <div>
                          <div className="font-medium">{req.requester_details?.full_name || '-'}</div>
                          <div className="text-gray-500 text-xs">{req.requester_details?.email || ''}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <div>
                          <div className="font-medium">{req.material_name}</div>
                          {req.brand && <div className="text-gray-500 text-xs">{req.brand}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-bold text-purple-600">
                        {req.quantity} {req.material_details?.unit || ''}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span className={`font-medium ${(req.material_details?.current_stock || 0) >= (req.quantity || 0) ? 'text-green-600' : 'text-red-600'}`}>
                          {req.material_details?.current_stock || 0} {req.material_details?.unit || ''}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {getStatusBadge(req.status || 'PENDING')}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {new Date(req.created_at || '').toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2 flex-wrap">
                          {(req.status === 'PENDING' || req.status === 'send_request') && (
                            <>
                              <button
                                onClick={() => handleApproveRequest(req.request_id!)}
                                className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectRequest(req.request_id!)}
                                className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {(req.status === 'APPROVED' || req.status === 'approved') && (
                            <button
                              onClick={() => handleCreateDNFromRequest(req)}
                              className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center gap-1"
                            >
                              <FileText className="w-3 h-3" />
                              Create DN
                            </button>
                          )}
                          {(req.status === 'DN_PENDING' || req.status === 'dn_pending') && (
                            <span className="px-3 py-1.5 text-xs bg-indigo-100 text-indigo-600 rounded-lg font-medium flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              DN Pending
                            </span>
                          )}
                          {(req.status === 'DISPATCHED' || req.status === 'dispatched') && (
                            <span className="px-3 py-1.5 text-xs bg-purple-100 text-purple-600 rounded-lg font-medium flex items-center gap-1">
                              <ArrowUpCircle className="w-3 h-3" />
                              In Transit
                            </span>
                          )}
                          {(req.status === 'FULFILLED' || req.status === 'fulfilled') && (
                            <span className="px-3 py-1.5 text-xs bg-green-100 text-green-600 rounded-lg font-medium flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Delivered
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-4 p-4">
              {filteredRequests.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No material requests found
                </div>
              ) : (
                filteredRequests.map((req) => (
                  <div key={req.request_id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="text-lg font-bold text-gray-900">#{req.request_number || req.request_id}</span>
                        <div className="text-sm text-gray-500">{new Date(req.created_at || '').toLocaleDateString()}</div>
                      </div>
                      {getStatusBadge(req.status || 'PENDING')}
                    </div>

                    {/* Project & Requester */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <div className="text-xs text-gray-500 uppercase mb-1">Project</div>
                        <div className="font-medium text-sm">{req.project_details?.project_name || '-'}</div>
                        <div className="text-xs text-gray-400">{req.project_details?.project_code}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 uppercase mb-1">Requester</div>
                        <div className="font-medium text-sm">{req.requester_details?.full_name || '-'}</div>
                      </div>
                    </div>

                    {/* Material & Quantity */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="font-medium text-gray-900">{req.material_name}</div>
                      {req.brand && <div className="text-xs text-gray-500">{req.brand}</div>}
                      <div className="flex justify-between items-center mt-2">
                        <div>
                          <span className="text-xs text-gray-500">Requested: </span>
                          <span className="font-bold text-purple-600">{req.quantity} {req.material_details?.unit || ''}</span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500">In Stock: </span>
                          <span className={`font-bold ${(req.material_details?.current_stock || 0) >= (req.quantity || 0) ? 'text-green-600' : 'text-red-600'}`}>
                            {req.material_details?.current_stock || 0}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      {(req.status === 'PENDING' || req.status === 'send_request') && (
                        <>
                          <button
                            onClick={() => handleApproveRequest(req.request_id!)}
                            className="flex-1 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectRequest(req.request_id!)}
                            className="flex-1 px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {(req.status === 'APPROVED' || req.status === 'approved') && (
                        <button
                          onClick={() => handleCreateDNFromRequest(req)}
                          className="flex-1 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center justify-center gap-2"
                        >
                          <FileText className="w-4 h-4" />
                          Create Delivery Note
                        </button>
                      )}
                      {(req.status === 'DN_PENDING' || req.status === 'dn_pending') && (
                        <div className="flex-1 px-4 py-2 text-sm bg-indigo-100 text-indigo-600 rounded-lg font-medium text-center flex items-center justify-center gap-2">
                          <FileText className="w-4 h-4" />
                          DN Created - Pending Dispatch
                        </div>
                      )}
                      {(req.status === 'DISPATCHED' || req.status === 'dispatched') && (
                        <div className="flex-1 px-4 py-2 text-sm bg-purple-100 text-purple-600 rounded-lg font-medium text-center flex items-center justify-center gap-2">
                          <ArrowUpCircle className="w-4 h-4" />
                          In Transit
                        </div>
                      )}
                      {(req.status === 'FULFILLED' || req.status === 'fulfilled') && (
                        <div className="flex-1 px-4 py-2 text-sm bg-green-100 text-green-600 rounded-lg font-medium text-center flex items-center justify-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          Delivered
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
            </>
          )}

          {/* DELIVERY NOTES SUB-TAB */}
          {stockOutSubTab === 'delivery-notes' && (
            <>
              {/* Filters for Delivery Notes */}
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  {['all', 'DRAFT', 'ISSUED', 'IN_TRANSIT', 'DELIVERED'].map(status => (
                    <button
                      key={status}
                      onClick={() => setDnStatusFilter(status)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        dnStatusFilter === status
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {status === 'all' ? 'All' : status.replace('_', ' ')}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowDeliveryNoteModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  New Delivery Note
                </button>
              </div>

              {/* Delivery Notes Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">MDN Number</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dispatch Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {deliveryNotes
                      .filter(dn => dnStatusFilter === 'all' || dn.status === dnStatusFilter)
                      .length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                          No delivery notes found
                        </td>
                      </tr>
                    ) : (
                      deliveryNotes
                        .filter(dn => dnStatusFilter === 'all' || dn.status === dnStatusFilter)
                        .map((dn) => (
                          <tr key={dn.delivery_note_id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              {dn.delivery_note_number}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {dn.project_details?.project_name || `Project ${dn.project_id}`}
                              <span className="text-gray-500 text-xs block">{dn.project_details?.location}</span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {dn.total_items || dn.items?.length || 0} items
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {dn.vehicle_number || '-'}
                              {dn.driver_name && <span className="text-gray-500 text-xs block">{dn.driver_name}</span>}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                dn.status === 'DRAFT' ? 'bg-gray-100 text-gray-700' :
                                dn.status === 'ISSUED' ? 'bg-blue-100 text-blue-700' :
                                dn.status === 'IN_TRANSIT' ? 'bg-purple-100 text-purple-700' :
                                dn.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                                dn.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {dn.status?.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {new Date(dn.delivery_date || '').toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {dn.dispatched_at ? (
                                <div>
                                  <div>{new Date(dn.dispatched_at).toLocaleDateString()}</div>
                                  <div className="text-xs text-gray-400">{new Date(dn.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-1 flex-wrap">
                                {/* Print Preview Button - always visible */}
                                <button
                                  onClick={() => { setSelectedDeliveryNote(dn); setShowPrintPreview(true); }}
                                  className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                                  title="Print Preview"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handlePrintDeliveryNote(dn)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
                                  title="Print"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDownloadDeliveryNote(dn)}
                                  className="p-1.5 text-green-600 hover:bg-green-100 rounded"
                                  title="Download PDF"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                {dn.status === 'DRAFT' && (
                                  <>
                                    <button
                                      onClick={() => handleIssueDeliveryNote(dn.delivery_note_id!)}
                                      className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                    >
                                      Issue
                                    </button>
                                    <button
                                      onClick={() => handleCancelDeliveryNote(dn.delivery_note_id!)}
                                      className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                )}
                                {dn.status === 'ISSUED' && (
                                  <button
                                    onClick={() => handleDispatchDeliveryNote(dn.delivery_note_id!)}
                                    className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                                  >
                                    Dispatch
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== GRN MODAL - NEW PURCHASE ==================== */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">New Purchase - GRN</h2>
                <p className="text-sm text-gray-500">Add new materials to inventory</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Material Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Material Name *</label>
                <input
                  type="text"
                  value={formData.material_name}
                  onChange={(e) => setFormData({ ...formData, material_name: e.target.value })}
                  placeholder="e.g., Cement, Steel Bars, Ceramic Tiles"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Brand & Size */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="e.g., ACC, Tata"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                  <input
                    type="text"
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    placeholder="e.g., 50kg, 12mm"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Category & Unit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g., Cement, Steel, Tiles"
                    list="category-suggestions"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                  <datalist id="category-suggestions">
                    {categories.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  >
                    <option value="Nos">Nos (Numbers)</option>
                    <option value="Bags">Bags</option>
                    <option value="Kg">Kg</option>
                    <option value="Tons">Tons</option>
                    <option value="Meters">Meters</option>
                    <option value="Sqft">Sqft</option>
                    <option value="Sqm">Sqm</option>
                    <option value="Liters">Liters</option>
                    <option value="Bundles">Bundles</option>
                    <option value="Rolls">Rolls</option>
                    <option value="Boxes">Boxes</option>
                    <option value="Sets">Sets</option>
                  </select>
                </div>
              </div>

              {/* Quantity & Unit Price */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                  <input
                    type="number"
                    value={formData.quantity || ''}
                    onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                    min="0"
                    step="0.01"
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price ({inventoryConfig.currency}) *</label>
                  <input
                    type="number"
                    value={formData.unit_price || ''}
                    onChange={(e) => setFormData({ ...formData, unit_price: Number(e.target.value) })}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Total Value Display */}
              {formData.quantity > 0 && formData.unit_price > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-green-700">Total Value:</span>
                    <span className="text-lg font-bold text-green-800">
                      {inventoryConfig.currency} {(formData.quantity * formData.unit_price).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Reference Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                <input
                  type="text"
                  value={formData.reference_number}
                  onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                  placeholder="e.g., INV-2025-001, PO-123"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  placeholder="Vendor name, delivery details, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateStockReceipt}
                disabled={saving || !formData.material_name || !formData.unit || formData.quantity <= 0 || formData.unit_price <= 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Record Purchase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== RETURN MODAL ==================== */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Record Material Return</h2>
              <button onClick={() => { setShowReturnModal(false); setDispatchedMaterials([]); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Step 1: Select Project First */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project (Return From) *</label>
                <select
                  value={returnFormData.project_id}
                  onChange={(e) => handleReturnProjectSelect(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value={0}>Select Project</option>
                  {projects
                    .filter(p => p.site_supervisors && p.site_supervisors.length > 0)
                    .map((p) => (
                      <option key={p.project_id} value={p.project_id}>
                        {p.project_name} ({p.project_code})
                      </option>
                    ))}
                </select>
              </div>

              {/* Step 2: Select Material */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Material *</label>
                <select
                  value={returnFormData.inventory_material_id}
                  onChange={(e) => handleReturnMaterialSelect(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  disabled={!returnFormData.project_id || loadingDispatchedMaterials}
                >
                  <option value={0}>
                    {!returnFormData.project_id
                      ? 'Select a project first'
                      : loadingDispatchedMaterials
                        ? 'Loading materials...'
                        : 'Select Material'}
                  </option>
                  {/* Show dispatched materials if available, otherwise show all returnable inventory materials */}
                  {dispatchedMaterials.length > 0 ? (
                    dispatchedMaterials.map((m) => (
                      <option key={m.inventory_material_id} value={m.inventory_material_id}>
                        {m.material_name} ({m.material_code}) - Max: {m.returnable_quantity} {m.unit}
                      </option>
                    ))
                  ) : (
                    materials.filter(mat => mat.is_returnable).map((mat) => (
                      <option key={mat.inventory_material_id} value={mat.inventory_material_id}>
                        {mat.material_name} ({mat.material_code}) - {mat.unit}
                      </option>
                    ))
                  )}
                </select>
                {returnFormData.project_id > 0 && !loadingDispatchedMaterials && dispatchedMaterials.length === 0 && (
                  <p className="text-xs text-blue-600 mt-1">Showing all returnable materials (no delivery note records found for this project).</p>
                )}
              </div>

              {/* Step 3: Quantity with max validation (only when dispatched materials exist) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity *
                  {returnFormData.inventory_material_id > 0 && dispatchedMaterials.length > 0 && (
                    <span className="text-gray-500 font-normal ml-2">
                      (Max returnable: {getMaxReturnableQuantity()})
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  value={returnFormData.quantity || ''}
                  onChange={(e) => {
                    const qty = Number(e.target.value);
                    // Only apply max limit if dispatched materials exist
                    if (dispatchedMaterials.length > 0) {
                      const max = getMaxReturnableQuantity();
                      setReturnFormData({
                        ...returnFormData,
                        quantity: qty > max ? max : qty
                      });
                    } else {
                      setReturnFormData({
                        ...returnFormData,
                        quantity: qty > 0 ? qty : 0
                      });
                    }
                  }}
                  max={dispatchedMaterials.length > 0 ? getMaxReturnableQuantity() : undefined}
                  min={0}
                  disabled={!returnFormData.inventory_material_id}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
                {dispatchedMaterials.length > 0 && returnFormData.quantity > getMaxReturnableQuantity() && getMaxReturnableQuantity() > 0 && (
                  <p className="text-xs text-red-600 mt-1">Quantity cannot exceed {getMaxReturnableQuantity()}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition *</label>
                <div className="flex gap-2">
                  {(['Good', 'Damaged', 'Defective'] as MaterialCondition[]).map((cond) => (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => setReturnFormData({
                        ...returnFormData,
                        condition: cond,
                        add_to_stock: cond === 'Good' ? returnFormData.add_to_stock : false
                      })}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        returnFormData.condition === cond
                          ? cond === 'Good' ? 'bg-green-100 border-green-500 text-green-700'
                            : cond === 'Damaged' ? 'bg-yellow-100 border-yellow-500 text-yellow-700'
                            : 'bg-red-100 border-red-500 text-red-700'
                          : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {cond === 'Good' && <CheckCircle className="w-4 h-4 inline mr-1" />}
                      {cond === 'Damaged' && <AlertTriangle className="w-4 h-4 inline mr-1" />}
                      {cond === 'Defective' && <Trash2 className="w-4 h-4 inline mr-1" />}
                      {cond}
                    </button>
                  ))}
                </div>
              </div>

              {returnFormData.condition === 'Good' && (
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={returnFormData.add_to_stock}
                      onChange={(e) => setReturnFormData({ ...returnFormData, add_to_stock: e.target.checked })}
                      className="w-4 h-4 text-green-600 rounded"
                    />
                    <span className="text-sm font-medium text-green-800">Add to Inventory Stock</span>
                  </label>
                  <p className="text-xs text-green-600 mt-1">The returned quantity will be added back to material's current stock</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Return Reason</label>
                <input
                  type="text"
                  value={returnFormData.return_reason}
                  onChange={(e) => setReturnFormData({ ...returnFormData, return_reason: e.target.value })}
                  placeholder="e.g., Excess material, Project completed"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                <input
                  type="text"
                  value={returnFormData.reference_number}
                  onChange={(e) => setReturnFormData({ ...returnFormData, reference_number: e.target.value })}
                  placeholder="e.g., RET-2025-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={returnFormData.notes}
                  onChange={(e) => setReturnFormData({ ...returnFormData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowReturnModal(false); setDispatchedMaterials([]); }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateReturn}
                disabled={
                  saving ||
                  !returnFormData.inventory_material_id ||
                  !returnFormData.project_id ||
                  returnFormData.quantity <= 0 ||
                  returnFormData.quantity > getMaxReturnableQuantity()
                }
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Record Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== DELIVERY NOTE MODAL ==================== */}
      {showDeliveryNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl p-6 m-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Create Delivery Note</h2>
              <button onClick={() => { setShowDeliveryNoteModal(false); resetDeliveryNoteForm(); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Project & Date Section */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
                  <select
                    value={dnFormData.project_id}
                    onChange={(e) => handleDeliveryNoteProjectSelect(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value={0}>Select Project</option>
                    {projects
                      .filter(p => p.site_supervisors && p.site_supervisors.length > 0)
                      .map((p) => (
                        <option key={p.project_id} value={p.project_id}>
                          {p.project_name} ({p.project_code})
                        </option>
                      ))}
                  </select>
                  {projects.filter(p => p.site_supervisors && p.site_supervisors.length > 0).length === 0 && (
                    <p className="text-xs text-orange-500 mt-1">No projects with Site Engineers assigned</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Date *</label>
                  <input
                    type="date"
                    value={dnFormData.delivery_date}
                    onChange={(e) => setDnFormData({ ...dnFormData, delivery_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Attention To & Delivery From */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Attention To</label>
                  <select
                    value={dnFormData.attention_to}
                    onChange={(e) => setDnFormData({ ...dnFormData, attention_to: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    disabled={!dnFormData.project_id}
                  >
                    <option value="">Select Recipient</option>
                    {getAvailableRecipients().map((recipient, idx) => (
                      <option key={idx} value={recipient.name}>
                        {recipient.name} ({recipient.role})
                      </option>
                    ))}
                  </select>
                  {dnFormData.project_id > 0 && getAvailableRecipients().length === 0 && (
                    <p className="text-xs text-orange-500 mt-1">No PM/MEP/SE assigned to this project</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delivery From</label>
                  <input
                    type="text"
                    value={dnFormData.delivery_from || inventoryConfig.store_name}
                    onChange={(e) => setDnFormData({ ...dnFormData, delivery_from: e.target.value })}
                    placeholder={inventoryConfig.store_name || 'Store Name'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Vehicle & Driver */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
                  <input
                    type="text"
                    value={dnFormData.vehicle_number}
                    onChange={(e) => setDnFormData({ ...dnFormData, vehicle_number: e.target.value })}
                    placeholder="e.g., DXB-A-12345"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name</label>
                  <input
                    type="text"
                    value={dnFormData.driver_name}
                    onChange={(e) => setDnFormData({ ...dnFormData, driver_name: e.target.value })}
                    placeholder="Driver name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Driver Contact</label>
                  <input
                    type="text"
                    value={dnFormData.driver_contact}
                    onChange={(e) => setDnFormData({ ...dnFormData, driver_contact: e.target.value })}
                    placeholder="+971 50 123 4567"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Materials Section */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    {selectedRequestForDN ? 'Material from Request' : 'Materials *'}
                  </label>
                  {/* Only show Add Material button when NOT creating from a request */}
                  {!selectedRequestForDN && (
                    <button
                      type="button"
                      onClick={handleAddDnItem}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                    >
                      <Plus className="w-4 h-4" /> Add Material
                    </button>
                  )}
                </div>

                {/* Show linked request info when creating from request */}
                {selectedRequestForDN && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-2 text-purple-700 text-sm">
                      <FileText className="w-4 h-4" />
                      <span>Linked to Request #{selectedRequestForDN.request_number || selectedRequestForDN.request_id}</span>
                    </div>
                  </div>
                )}

                {dnItems.length === 0 ? (
                  <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                    No materials added. Click "Add Material" to add items.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dnItems.map((item, index) => {
                      const selectedMaterial = materials.find(m => m.inventory_material_id === item.inventory_material_id);
                      return (
                        <div key={index} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
                          <div className="flex-1">
                            {/* Read-only display when from request, editable select otherwise */}
                            {selectedRequestForDN ? (
                              <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                                <div className="font-medium">{selectedMaterial?.material_name || 'Unknown'}</div>
                                <div className="text-xs text-gray-500">
                                  {selectedMaterial?.material_code} • Stock: {selectedMaterial?.current_stock} {selectedMaterial?.unit}
                                </div>
                              </div>
                            ) : (
                              <select
                                value={item.inventory_material_id}
                                onChange={(e) => handleDnItemChange(index, 'inventory_material_id', Number(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
                              >
                                <option value={0}>Select Material</option>
                                {materials.map((m) => (
                                  <option key={m.inventory_material_id} value={m.inventory_material_id}>
                                    {m.material_name} ({m.material_code}) - Stock: {m.current_stock} {m.unit}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div className="w-24">
                            <input
                              type="number"
                              value={item.quantity || ''}
                              onChange={(e) => handleDnItemChange(index, 'quantity', Number(e.target.value))}
                              placeholder="Qty"
                              readOnly={!!selectedRequestForDN}
                              className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm ${
                                selectedRequestForDN ? 'bg-gray-100 cursor-not-allowed' : 'focus:ring-2 focus:ring-purple-500'
                              }`}
                            />
                          </div>
                          {/* Only show item notes when NOT from request */}
                          {!selectedRequestForDN && (
                            <div className="flex-1">
                              <input
                                type="text"
                                value={item.notes}
                                onChange={(e) => handleDnItemChange(index, 'notes', e.target.value)}
                                placeholder="Notes (optional)"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
                              />
                            </div>
                          )}
                          {/* Only show delete button when NOT from request */}
                          {!selectedRequestForDN && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDnItem(index)}
                              className="p-2 text-red-500 hover:bg-red-100 rounded-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={dnFormData.notes}
                  onChange={(e) => setDnFormData({ ...dnFormData, notes: e.target.value })}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowDeliveryNoteModal(false); resetDeliveryNoteForm(); }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDeliveryNote}
                disabled={saving || !dnFormData.project_id || dnItems.length === 0 || dnItems.some(i => !i.inventory_material_id || i.quantity <= 0)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Create Delivery Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== EDIT MATERIAL MODAL ==================== */}
      {showEditMaterialModal && selectedMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Edit Material - {selectedMaterial.material_code}</h2>
              <button onClick={() => { setShowEditMaterialModal(false); resetMaterialForm(); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleUpdateMaterial} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Material Name *</label>
                <input type="text" name="material_name" value={materialFormData.material_name} onChange={handleMaterialInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                  <input type="text" name="brand" value={materialFormData.brand} onChange={handleMaterialInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                  <input type="text" name="size" value={materialFormData.size} onChange={handleMaterialInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input type="text" name="category" value={materialFormData.category} onChange={handleMaterialInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                  <input type="text" name="unit" value={materialFormData.unit} onChange={handleMaterialInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Stock</label>
                  <input type="number" name="current_stock" value={materialFormData.current_stock} onChange={handleMaterialInputChange} min="0" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock Level</label>
                  <input type="number" name="min_stock_level" value={materialFormData.min_stock_level} onChange={handleMaterialInputChange} min="0" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price ({inventoryConfig.currency})</label>
                <input type="number" name="unit_price" value={materialFormData.unit_price} onChange={handleMaterialInputChange} min="0" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea name="description" value={materialFormData.description} onChange={handleMaterialInputChange} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="flex items-center">
                <input type="checkbox" name="is_active" checked={materialFormData.is_active} onChange={handleMaterialInputChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                <label className="ml-2 block text-sm text-gray-900">Active</label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => { setShowEditMaterialModal(false); resetMaterialForm(); }} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Update Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== PRINT PREVIEW MODAL ==================== */}
      {showPrintPreview && selectedDeliveryNote && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50">
              <h2 className="text-xl font-bold text-gray-900">
                Print Preview - {selectedDeliveryNote.delivery_note_number}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrintDeliveryNote(selectedDeliveryNote)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
                <button
                  onClick={() => handleDownloadDeliveryNote(selectedDeliveryNote)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={() => { setShowPrintPreview(false); setSelectedDeliveryNote(null); }}
                  className="text-gray-400 hover:text-gray-600 ml-2"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Preview Content - A4 Format matching the doc template */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-300">
              <div className="bg-white shadow-lg mx-auto border-2 border-black" style={{ width: '210mm', minHeight: '297mm', padding: '20mm' }}>
                {/* Header - Title on Left, Logo on Right (with gap inside border) */}
                <div className="border-2 border-black p-3">
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr>
                        <td className="border border-black px-4 py-3 bg-gray-50 text-left">
                          <h1 className="text-base font-bold tracking-wide">MATERIAL DELIVERY NOTE</h1>
                          <div className="text-xs mt-1 text-gray-600">{selectedDeliveryNote.delivery_note_number}</div>
                        </td>
                        <td className="border border-black px-4 py-3 bg-gray-50 text-center" style={{ width: '120px' }}>
                          <img src="/assets/logo.png" alt="Logo" className="h-10 object-contain mx-auto" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Gap between header and body */}
                <div className="h-4"></div>

                {/* Info Table */}
                <table className="w-full border-collapse">
                  <tbody>
                    <tr>
                      <td className="border border-black px-3 py-2 font-bold bg-gray-50 w-1/4">Project & Location</td>
                      <td className="border border-black px-3 py-2 w-1/4">
                        {selectedDeliveryNote.project_details?.project_name || ''}
                        {selectedDeliveryNote.project_details?.location ? ` - ${selectedDeliveryNote.project_details.location}` : ''}
                      </td>
                      <td className="border border-black px-3 py-2 font-bold bg-gray-50 w-1/4">Delivery Date</td>
                      <td className="border border-black px-3 py-2 w-1/4">
                        {selectedDeliveryNote.delivery_date ? new Date(selectedDeliveryNote.delivery_date).toLocaleDateString() : ''}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black px-3 py-2 font-bold bg-gray-50">Attention to:</td>
                      <td className="border border-black px-3 py-2">{selectedDeliveryNote.attention_to || ''}</td>
                      <td className="border border-black px-3 py-2 font-bold bg-gray-50">Delivery From</td>
                      <td className="border border-black px-3 py-2">{selectedDeliveryNote.delivery_from || inventoryConfig.store_name || 'M2 Store'}</td>
                    </tr>
                    <tr>
                      <td className="border border-black px-3 py-2 font-bold bg-gray-50" rowSpan={2}>
                        Materials Requested By:<br/>
                        <span className="font-normal text-xs">Name & Signature:</span>
                      </td>
                      <td className="border border-black px-3 py-2" rowSpan={2}>{selectedDeliveryNote.requested_by || ''}</td>
                      <td className="border border-black px-3 py-2 font-bold bg-gray-50">Request Date:</td>
                      <td className="border border-black px-3 py-2">
                        {selectedDeliveryNote.created_at ? new Date(selectedDeliveryNote.created_at).toLocaleDateString() : ''}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black px-3 py-2 font-bold bg-gray-50">Vehicle & Driver:</td>
                      <td className="border border-black px-3 py-2">
                        {selectedDeliveryNote.vehicle_number || ''}
                        {selectedDeliveryNote.driver_name ? ` / ${selectedDeliveryNote.driver_name}` : ''}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Gap between info and items table */}
                <div className="h-4"></div>

                {/* Items Table */}
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-black px-3 py-2 bg-gray-200 font-bold text-center" style={{ width: '60px' }}>Sr No.</th>
                      <th className="border border-black px-3 py-2 bg-gray-200 font-bold text-center">Description</th>
                      <th className="border border-black px-3 py-2 bg-gray-200 font-bold text-center" style={{ width: '100px' }}>Qty</th>
                      <th className="border border-black px-3 py-2 bg-gray-200 font-bold text-center" style={{ width: '200px' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedDeliveryNote.items || []).map((item, i) => (
                      <tr key={i}>
                        <td className="border border-black px-3 py-2 text-center h-9">{i + 1}</td>
                        <td className="border border-black px-3 py-2 h-9">
                          {item.material_name || ''}{item.brand ? ` (${item.brand})` : ''}
                        </td>
                        <td className="border border-black px-3 py-2 text-center h-9">
                          {item.quantity} {item.unit || ''}
                        </td>
                        <td className="border border-black px-3 py-2 h-9">{item.notes || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Gap between items and footer */}
                <div className="h-4"></div>

                {/* Footer Signature */}
                <div className="flex justify-between mt-6">
                  <div className="w-1/2 pr-8">
                    <span className="font-bold text-sm">Prepared By:</span><br />
                    <span className="text-sm">{selectedDeliveryNote.prepared_by || ''}</span><br /><br />
                    <span className="text-sm">Signature:</span><br /><br />
                    <span className="text-sm">Date:</span>
                  </div>
                  <div className="w-1/2 pl-8">
                    <span className="font-bold text-sm">Checked By:</span><br /><br /><br />
                    <span className="text-sm">Signature:</span><br /><br />
                    <span className="text-sm">Date:</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CONFIRMATION MODAL ==================== */}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{confirmModal.title}</h3>
            </div>

            {/* Body */}
            <div className="px-6 py-4">
              <p className="text-gray-600">{confirmModal.message}</p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={closeConfirmation}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`px-4 py-2 text-white rounded-lg font-medium transition-colors ${
                  confirmModal.confirmColor === 'red'
                    ? 'bg-red-600 hover:bg-red-700'
                    : confirmModal.confirmColor === 'green'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockManagement;
