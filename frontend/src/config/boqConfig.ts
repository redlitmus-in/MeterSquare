/**
 * BOQ Configuration
 * Centralized configuration for BOQ calculations and defaults
 * Must match backend config/change_request_config.py
 */

export const BOQ_CONFIG = {
  // Default Financial Percentages for BOQ Calculations
  DEFAULT_MISC_PERCENTAGE: 10.0,             // Miscellaneous
  DEFAULT_OVERHEAD_PROFIT_PERCENTAGE: 25.0,  // O&P (Overhead & Profit)
  DEFAULT_TRANSPORT_PERCENTAGE: 5.0,         // Transport

  // Formula constants
  FORMULA: {
    // Negotiable Margin = Client Amount - (Materials + Labour + Misc + O&P + Transport)
    NEGOTIABLE_MARGIN_COMPONENTS: ['materials', 'labour', 'misc', 'overhead_profit', 'transport'] as const
  },

  // Validation
  MAX_PERCENTAGE: 100.0,
  MIN_PERCENTAGE: 0.0,

  // Formatting
  CURRENCY_DECIMALS: 2,
  PERCENTAGE_DECIMALS: 2
} as const;

/**
 * Validate that percentages are within allowed range
 */
export function validatePercentage(value: number): boolean {
  return value >= BOQ_CONFIG.MIN_PERCENTAGE && value <= BOQ_CONFIG.MAX_PERCENTAGE;
}

/**
 * Calculate negotiable margin using the correct formula
 * Formula: Negotiable Margin = Client Amount - (Materials + Labour + Misc + O&P + Transport)
 */
export function calculateNegotiableMargin(
  clientAmount: number,
  materialCost: number,
  labourCost: number,
  miscAmount: number,
  overheadProfitAmount: number,
  transportAmount: number
): number {
  const internalCost = materialCost + labourCost + miscAmount + overheadProfitAmount + transportAmount;
  const negotiableMargin = clientAmount - internalCost;
  return Number(negotiableMargin.toFixed(BOQ_CONFIG.CURRENCY_DECIMALS));
}

/**
 * Validate negotiable margin calculation
 * Throws error if calculation is incorrect
 */
export function validateNegotiableMarginCalculation(
  clientAmount: number,
  materialCost: number,
  labourCost: number,
  miscAmount: number,
  overheadProfitAmount: number,
  transportAmount: number,
  calculatedMargin: number
): boolean {
  const expected = calculateNegotiableMargin(
    clientAmount,
    materialCost,
    labourCost,
    miscAmount,
    overheadProfitAmount,
    transportAmount
  );

  const tolerance = 0.01; // Allow 1 cent difference for floating point errors
  const difference = Math.abs(expected - calculatedMargin);

  if (difference > tolerance) {
    const errorMsg = `Negotiable margin calculation error!
Expected: ${expected.toFixed(2)} (Client: ${clientAmount.toFixed(2)} - Internal: ${(materialCost + labourCost + miscAmount + overheadProfitAmount + transportAmount).toFixed(2)})
Got: ${calculatedMargin.toFixed(2)}
Difference: ${difference.toFixed(2)}
Formula: Client Amount - (Materials + Labour + Misc + O&P + Transport)
Breakdown: ${clientAmount.toFixed(2)} - (${materialCost.toFixed(2)} + ${labourCost.toFixed(2)} + ${miscAmount.toFixed(2)} + ${overheadProfitAmount.toFixed(2)} + ${transportAmount.toFixed(2)})`;

    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return true;
}
