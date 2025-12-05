/**
 * M2 Store Mock Data
 *
 * Centralized mock data for M2 Store (MeterSquare Internal Inventory)
 * This data is used across all M2 Store UI components until backend is implemented
 */

// ==================== TYPES ====================

export interface M2Material {
  id: number;
  materialName: string;
  brand: string;
  size: string;
  currentStock: number;
  unit: string;
  reorderPoint: number;
  maxStock: number;
  binLocation: string;
  lastRestocked: string;
  avgConsumption: string;
  status: 'healthy' | 'warning' | 'critical';
  value: number; // Total value in INR
  unitPrice: number; // Price per unit
}

export interface M2DispatchRequest {
  id: string;
  buyer: string;
  buyerId: number;
  project: string;
  projectId: number;
  recipient: string;
  recipientId: number;
  materials: {
    materialId: number;
    name: string;
    quantity: number;
    unit: string;
    bin: string;
  }[];
  priority: 'normal' | 'urgent';
  requiredBy: string;
  timeAgo: string;
  changeRequestId?: string;
}

export interface M2Activity {
  id: number;
  type: 'in' | 'out' | 'transfer' | 'adjustment';
  description: string;
  timeAgo: string;
  quantity?: number;
  unit?: string;
  materialName?: string;
  user?: string;
}

export interface M2StockAlert {
  id: number;
  material: string;
  brand: string;
  size: string;
  currentStock: number;
  unit: string;
  reorderPoint: number;
  maxStock: number;
  binLocation: string;
  severity: 'critical' | 'warning';
  daysToStockout: number;
  avgConsumption: string;
  lastRestocked: string;
  suggestedOrderQty: number;
}

export interface M2Vendor {
  id: number;
  name: string;
  code: string;
  email?: string;
  phone?: string;
}

export interface M2BinLocation {
  id: string;
  name: string;
  type: 'rack' | 'section' | 'yard';
  capacity: string;
}

// ==================== MOCK DATA ====================

export const mockM2Materials: M2Material[] = [
  {
    id: 1,
    materialName: 'Cement PPC 43',
    brand: 'UltraTech',
    size: '50 kg',
    currentStock: 450,
    unit: 'bags',
    reorderPoint: 200,
    maxStock: 1000,
    binLocation: 'Rack A-12',
    lastRestocked: '2 days ago',
    avgConsumption: '25 bags/day',
    status: 'healthy',
    value: 337500,
    unitPrice: 750
  },
  {
    id: 2,
    materialName: 'Steel Rebar 12mm',
    brand: 'Tata Steel',
    size: '12mm x 12m',
    currentStock: 0,
    unit: 'pcs',
    reorderPoint: 200,
    maxStock: 500,
    binLocation: 'Rack B-05',
    lastRestocked: '1 week ago',
    avgConsumption: '15 pcs/day',
    status: 'critical',
    value: 0,
    unitPrice: 850
  },
  {
    id: 3,
    materialName: 'Paint Enamel',
    brand: 'Asian Paints',
    size: '20 ltrs',
    currentStock: 0,
    unit: 'ltrs',
    reorderPoint: 50,
    maxStock: 200,
    binLocation: 'Rack C-03',
    lastRestocked: '5 days ago',
    avgConsumption: '8 ltrs/day',
    status: 'critical',
    value: 0,
    unitPrice: 450
  },
  {
    id: 4,
    materialName: 'Cement OPC',
    brand: 'ACC',
    size: '50 kg',
    currentStock: 45,
    unit: 'bags',
    reorderPoint: 100,
    maxStock: 500,
    binLocation: 'Rack A-15',
    lastRestocked: '3 days ago',
    avgConsumption: '12 bags/day',
    status: 'critical',
    value: 36000,
    unitPrice: 800
  },
  {
    id: 5,
    materialName: 'Bricks Red',
    brand: 'Local Supplier',
    size: 'Standard',
    currentStock: 15000,
    unit: 'pcs',
    reorderPoint: 5000,
    maxStock: 20000,
    binLocation: 'Section C',
    lastRestocked: '1 day ago',
    avgConsumption: '500 pcs/day',
    status: 'healthy',
    value: 90000,
    unitPrice: 6
  },
  {
    id: 6,
    materialName: 'Sand M-Sand',
    brand: 'M-Sand',
    size: 'Bulk',
    currentStock: 0.5,
    unit: 'tons',
    reorderPoint: 2,
    maxStock: 10,
    binLocation: 'Yard-01',
    lastRestocked: '4 days ago',
    avgConsumption: '0.3 tons/day',
    status: 'warning',
    value: 7500,
    unitPrice: 15000
  },
  {
    id: 7,
    materialName: 'Tiles Vitrified',
    brand: 'Kajaria',
    size: '600x600mm',
    currentStock: 850,
    unit: 'sqft',
    reorderPoint: 300,
    maxStock: 1500,
    binLocation: 'Rack D-08',
    lastRestocked: '1 week ago',
    avgConsumption: '40 sqft/day',
    status: 'healthy',
    value: 425000,
    unitPrice: 500
  },
  {
    id: 8,
    materialName: 'PVC Pipes 2 inch',
    brand: 'Finolex',
    size: '2 inch x 3m',
    currentStock: 120,
    unit: 'pcs',
    reorderPoint: 100,
    maxStock: 300,
    binLocation: 'Rack E-02',
    lastRestocked: '2 days ago',
    avgConsumption: '8 pcs/day',
    status: 'warning',
    value: 36000,
    unitPrice: 300
  },
  {
    id: 9,
    materialName: 'Electrical Wire 2.5mm',
    brand: 'Polycab',
    size: '2.5mm sq',
    currentStock: 2500,
    unit: 'meters',
    reorderPoint: 1000,
    maxStock: 5000,
    binLocation: 'Rack F-01',
    lastRestocked: '3 days ago',
    avgConsumption: '100 m/day',
    status: 'healthy',
    value: 125000,
    unitPrice: 50
  },
  {
    id: 10,
    materialName: 'Plywood Marine',
    brand: 'Greenply',
    size: '8x4 ft, 18mm',
    currentStock: 35,
    unit: 'sheets',
    reorderPoint: 20,
    maxStock: 100,
    binLocation: 'Rack G-05',
    lastRestocked: '5 days ago',
    avgConsumption: '3 sheets/day',
    status: 'healthy',
    value: 122500,
    unitPrice: 3500
  }
];

export const mockM2PendingDispatches: M2DispatchRequest[] = [
  {
    id: 'M2-OUT-2025-0045',
    buyer: 'Priya Singh',
    buyerId: 1,
    project: 'Project Alpha',
    projectId: 1,
    recipient: 'John Doe (Site Engineer)',
    recipientId: 1,
    materials: [
      {
        materialId: 1,
        name: 'Cement PPC 43',
        quantity: 80,
        unit: 'bags',
        bin: 'Rack A-12'
      }
    ],
    priority: 'urgent',
    requiredBy: '4:00 PM Today',
    timeAgo: '2 hours ago',
    changeRequestId: 'CR-2025-001'
  },
  {
    id: 'M2-OUT-2025-0044',
    buyer: 'Amit Kumar',
    buyerId: 2,
    project: 'Project Beta',
    projectId: 2,
    recipient: 'Sarah Lee (PM)',
    recipientId: 2,
    materials: [
      {
        materialId: 5,
        name: 'Bricks Red',
        quantity: 2000,
        unit: 'pcs',
        bin: 'Section C'
      },
      {
        materialId: 7,
        name: 'Tiles Vitrified',
        quantity: 150,
        unit: 'sqft',
        bin: 'Rack D-08'
      }
    ],
    priority: 'normal',
    requiredBy: 'Tomorrow',
    timeAgo: '5 hours ago',
    changeRequestId: 'CR-2025-002'
  },
  {
    id: 'M2-OUT-2025-0043',
    buyer: 'Priya Singh',
    buyerId: 1,
    project: 'Residential Complex A',
    projectId: 4,
    recipient: 'Mike Wilson (Site Supervisor)',
    recipientId: 3,
    materials: [
      {
        materialId: 9,
        name: 'Electrical Wire 2.5mm',
        quantity: 500,
        unit: 'meters',
        bin: 'Rack F-01'
      },
      {
        materialId: 8,
        name: 'PVC Pipes 2 inch',
        quantity: 30,
        unit: 'pcs',
        bin: 'Rack E-02'
      }
    ],
    priority: 'normal',
    requiredBy: '2 days',
    timeAgo: '1 day ago'
  }
];

export const mockM2RecentActivity: M2Activity[] = [
  {
    id: 1,
    type: 'out',
    description: 'Issued 100 bags Cement PPC 43 to Project Alpha',
    timeAgo: '2 hours ago',
    quantity: 100,
    unit: 'bags',
    materialName: 'Cement PPC 43',
    user: 'Production Manager'
  },
  {
    id: 2,
    type: 'in',
    description: 'Received 5000 pcs Bricks from ABC Suppliers (PO-2025-015)',
    timeAgo: '5 hours ago',
    quantity: 5000,
    unit: 'pcs',
    materialName: 'Bricks Red',
    user: 'Production Manager'
  },
  {
    id: 3,
    type: 'transfer',
    description: 'Transferred 30 bags Cement OPC: Main Store → Site B',
    timeAgo: '1 day ago',
    quantity: 30,
    unit: 'bags',
    materialName: 'Cement OPC',
    user: 'Production Manager'
  },
  {
    id: 4,
    type: 'adjustment',
    description: 'Adjusted +10 pcs Steel Rebar: Physical count reconciliation',
    timeAgo: '2 days ago',
    quantity: 10,
    unit: 'pcs',
    materialName: 'Steel Rebar 12mm',
    user: 'Production Manager'
  },
  {
    id: 5,
    type: 'out',
    description: 'Issued 200 sqft Tiles Vitrified to Project Beta',
    timeAgo: '2 days ago',
    quantity: 200,
    unit: 'sqft',
    materialName: 'Tiles Vitrified',
    user: 'Production Manager'
  }
];

export const mockM2LowStockAlerts: M2StockAlert[] = [
  {
    id: 1,
    material: 'Steel Rebar 12mm',
    brand: 'Tata Steel',
    size: '12mm x 12m',
    currentStock: 0,
    unit: 'pcs',
    reorderPoint: 200,
    maxStock: 500,
    binLocation: 'Rack B-05',
    severity: 'critical',
    daysToStockout: 0,
    avgConsumption: '15 pcs/day',
    lastRestocked: '1 week ago',
    suggestedOrderQty: 500
  },
  {
    id: 2,
    material: 'Paint Enamel',
    brand: 'Asian Paints',
    size: '20 ltrs',
    currentStock: 0,
    unit: 'ltrs',
    reorderPoint: 50,
    maxStock: 200,
    binLocation: 'Rack C-03',
    severity: 'critical',
    daysToStockout: 0,
    avgConsumption: '8 ltrs/day',
    lastRestocked: '5 days ago',
    suggestedOrderQty: 200
  },
  {
    id: 3,
    material: 'Cement OPC',
    brand: 'ACC',
    size: '50 kg',
    currentStock: 45,
    unit: 'bags',
    reorderPoint: 100,
    maxStock: 500,
    binLocation: 'Rack A-15',
    severity: 'critical',
    daysToStockout: 3,
    avgConsumption: '12 bags/day',
    lastRestocked: '3 days ago',
    suggestedOrderQty: 455
  },
  {
    id: 4,
    material: 'Sand M-Sand',
    brand: 'M-Sand',
    size: 'Bulk',
    currentStock: 0.5,
    unit: 'tons',
    reorderPoint: 2,
    maxStock: 10,
    binLocation: 'Yard-01',
    severity: 'warning',
    daysToStockout: 1,
    avgConsumption: '0.3 tons/day',
    lastRestocked: '4 days ago',
    suggestedOrderQty: 9.5
  },
  {
    id: 5,
    material: 'PVC Pipes 2 inch',
    brand: 'Finolex',
    size: '2 inch x 3m',
    currentStock: 120,
    unit: 'pcs',
    reorderPoint: 100,
    maxStock: 300,
    binLocation: 'Rack E-02',
    severity: 'warning',
    daysToStockout: 15,
    avgConsumption: '8 pcs/day',
    lastRestocked: '2 days ago',
    suggestedOrderQty: 180
  }
];

export const mockM2Vendors: M2Vendor[] = [
  {
    id: 1,
    name: 'ABC Suppliers',
    code: 'V-001',
    email: 'contact@abcsuppliers.com',
    phone: '+91 98765 43210'
  },
  {
    id: 2,
    name: 'XYZ Trading Co.',
    code: 'V-002',
    email: 'sales@xyztrading.com',
    phone: '+91 98765 43211'
  },
  {
    id: 3,
    name: 'Prime Materials',
    code: 'V-003',
    email: 'info@primematerials.com',
    phone: '+91 98765 43212'
  },
  {
    id: 4,
    name: 'Metro Suppliers',
    code: 'V-004',
    email: 'orders@metrosuppliers.com',
    phone: '+91 98765 43213'
  }
];

export const mockM2BinLocations: M2BinLocation[] = [
  { id: 'rack-a-01', name: 'Rack A-01', type: 'rack', capacity: 'Medium' },
  { id: 'rack-a-12', name: 'Rack A-12', type: 'rack', capacity: 'Large' },
  { id: 'rack-a-15', name: 'Rack A-15', type: 'rack', capacity: 'Large' },
  { id: 'rack-b-05', name: 'Rack B-05', type: 'rack', capacity: 'Medium' },
  { id: 'rack-c-03', name: 'Rack C-03', type: 'rack', capacity: 'Small' },
  { id: 'rack-d-08', name: 'Rack D-08', type: 'rack', capacity: 'Large' },
  { id: 'rack-e-02', name: 'Rack E-02', type: 'rack', capacity: 'Medium' },
  { id: 'rack-f-01', name: 'Rack F-01', type: 'rack', capacity: 'Large' },
  { id: 'rack-g-05', name: 'Rack G-05', type: 'rack', capacity: 'Medium' },
  { id: 'section-c', name: 'Section C', type: 'section', capacity: 'X-Large' },
  { id: 'yard-01', name: 'Yard-01', type: 'yard', capacity: 'Bulk Storage' },
  { id: 'yard-02', name: 'Yard-02', type: 'yard', capacity: 'Bulk Storage' }
];

// ==================== DASHBOARD STATS ====================

export const mockM2DashboardStats = {
  totalItems: mockM2Materials.length,
  lowStockItems: mockM2Materials.filter(m => m.status === 'warning' || m.status === 'critical').length,
  pendingDispatches: mockM2PendingDispatches.length,
  totalValue: mockM2Materials.reduce((sum, m) => sum + m.value, 0),
  stats: {
    itemsChange: 5.6,
    lowStockCritical: mockM2Materials.filter(m => m.status === 'critical').length,
    dispatchesNew: 2,
    valueChange: 2.3
  }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Get material by ID
 */
export const getMaterialById = (id: number): M2Material | undefined => {
  return mockM2Materials.find(m => m.id === id);
};

/**
 * Get M2 availability for a material
 */
export const getM2Availability = (materialId: number, requestedQty: number) => {
  const material = getMaterialById(materialId);
  if (!material) {
    return {
      available: 0,
      percentage: 0,
      binLocation: ''
    };
  }

  const available = Math.min(material.currentStock, requestedQty);
  const percentage = requestedQty > 0 ? (available / requestedQty) * 100 : 0;

  return {
    available,
    percentage,
    binLocation: material.binLocation,
    material
  };
};

/**
 * Check if material needs reorder
 */
export const needsReorder = (materialId: number): boolean => {
  const material = getMaterialById(materialId);
  if (!material) return false;
  return material.currentStock <= material.reorderPoint;
};

/**
 * Get all critical stock items
 */
export const getCriticalStockItems = (): M2Material[] => {
  return mockM2Materials.filter(m => m.status === 'critical');
};

/**
 * Get all warning stock items
 */
export const getWarningStockItems = (): M2Material[] => {
  return mockM2Materials.filter(m => m.status === 'warning');
};

/**
 * Get healthy stock items
 */
export const getHealthyStockItems = (): M2Material[] => {
  return mockM2Materials.filter(m => m.status === 'healthy');
};

export default {
  materials: mockM2Materials,
  pendingDispatches: mockM2PendingDispatches,
  recentActivity: mockM2RecentActivity,
  lowStockAlerts: mockM2LowStockAlerts,
  vendors: mockM2Vendors,
  binLocations: mockM2BinLocations,
  dashboardStats: mockM2DashboardStats,
  helpers: {
    getMaterialById,
    getM2Availability,
    needsReorder,
    getCriticalStockItems,
    getWarningStockItems,
    getHealthyStockItems
  }
};
