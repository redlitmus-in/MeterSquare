// Shared utility functions for inventory management
// Eliminates code duplication across multiple pages

import { INVENTORY_DEFAULTS } from '@/lib/inventoryConstants';

export type StockStatus = 'healthy' | 'warning' | 'critical' | 'out-of-stock';

/**
 * Determines stock status based on current stock and minimum threshold
 * @param current - Current stock quantity
 * @param min - Minimum stock level threshold
 * @returns Stock status indicator
 */
export const getStockStatus = (current: number, min: number): StockStatus => {
  if (current === 0) return 'out-of-stock';
  if (current <= min * INVENTORY_DEFAULTS.MIN_STOCK_THRESHOLD) return 'critical';
  if (current <= min) return 'warning';
  return 'healthy';
};

/**
 * Formats currency value with proper symbol
 * @param value - Numeric value to format
 * @param currency - Currency code (default: AED)
 * @returns Formatted currency string
 */
export const formatCurrency = (value: number, currency: string = INVENTORY_DEFAULTS.CURRENCY): string => {
  return `${currency} ${value.toFixed(2)}`;
};

/**
 * Normalizes request status for consistent filtering
 * @param status - Raw status string
 * @returns Normalized status string
 */
export const normalizeStatus = (status: string | undefined): string => {
  const normalized = status?.toUpperCase() || 'PENDING';
  if (normalized === 'SEND_REQUEST') return 'PENDING';
  if (normalized === 'AWAITING_VENDOR_DELIVERY') return 'PENDING';  // Vendor deliveries routed from buyer
  if (normalized === 'DN_PENDING') return 'DN_PENDING';
  return normalized;
};

/**
 * Validates numeric input for inventory operations
 * @param value - Value to validate
 * @param fieldName - Field name for error message
 * @returns Error message if invalid, null if valid
 */
export const validateInventoryNumber = (value: number, fieldName: string): string | null => {
  if (isNaN(value) || value < 0) {
    return `${fieldName} must be a positive number`;
  }
  return null;
};

/**
 * Validates material form data
 * @param data - Form data to validate
 * @returns Error message if invalid, null if valid
 */
export const validateMaterialForm = (data: {
  material_name: string;
  unit: string;
  current_stock: number;
  unit_price: number;
}): string | null => {
  if (!data.material_name.trim()) {
    return 'Material name is required';
  }
  if (!data.unit.trim()) {
    return 'Unit is required';
  }
  const stockError = validateInventoryNumber(data.current_stock, 'Current stock');
  if (stockError) return stockError;

  const priceError = validateInventoryNumber(data.unit_price, 'Unit price');
  if (priceError) return priceError;

  return null;
};
