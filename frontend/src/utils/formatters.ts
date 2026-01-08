/**
 * Shared Formatter Utilities
 * Centralized formatting functions to eliminate code duplication
 */

/**
 * Format number as currency in AED
 * @param value - Number to format
 * @returns Formatted currency string
 */
export const formatCurrency = (value?: number | null): string => {
  if (value === undefined || value === null || isNaN(value)) {
    return 'AED 0.00';
  }
  return `AED ${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

/**
 * Format date to readable string
 * @param dateString - ISO date string or Date object
 * @returns Formatted date string
 */
export const formatDate = (dateString?: string | Date): string => {
  if (!dateString) return 'N/A';

  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Format date with time
 * @param dateString - ISO date string or Date object
 * @returns Formatted date and time string
 */
export const formatDateTime = (dateString?: string | Date): string => {
  if (!dateString) return 'N/A';

  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Format percentage
 * @param value - Number to format as percentage
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string
 */
export const formatPercentage = (value: number, decimals: number = 2): string => {
  return `${value.toFixed(decimals)}%`;
};

/**
 * Format number with thousand separators
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted number string
 */
export const formatNumber = (value: number, decimals: number = 0): string => {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

/**
 * Truncate text to specified length
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text with ellipsis if needed
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

/**
 * Material interface for price calculations
 */
export interface MaterialWithPrice {
  boq_unit_price?: number;
  original_unit_price?: number;
  unit_price?: number;
  quantity?: number;
}

/**
 * Calculate total BOQ amount from materials
 * @param materials - Array of materials with price info
 * @returns Total BOQ amount
 */
export const calculateBOQTotal = (materials: MaterialWithPrice[]): number => {
  return (materials || []).reduce((sum, m) => {
    const boqPrice = m.boq_unit_price || m.original_unit_price || 0;
    return sum + (boqPrice * (m.quantity || 0));
  }, 0);
};

/**
 * Calculate total vendor amount from materials
 * @param materials - Array of materials with price info
 * @returns Total vendor amount
 */
export const calculateVendorTotal = (materials: MaterialWithPrice[]): number => {
  return (materials || []).reduce((sum, m) => {
    const vendorPrice = m.unit_price || m.boq_unit_price || 0;
    return sum + (vendorPrice * (m.quantity || 0));
  }, 0);
};
