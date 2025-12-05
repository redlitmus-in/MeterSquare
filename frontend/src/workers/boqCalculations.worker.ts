/**
 * BOQ Calculations Web Worker
 *
 * Offloads heavy BOQ calculations to a background thread to prevent UI blocking.
 * This improves responsiveness during complex material/labor cost calculations.
 *
 * Usage in main thread:
 *   const worker = new Worker(new URL('./workers/boqCalculations.worker.ts', import.meta.url), { type: 'module' });
 *   worker.postMessage({ type: 'calculate', items: boqItems });
 *   worker.onmessage = (e) => {
 *     if (e.data.type === 'success') {
 *       const totals = e.data.result;
 *       // Update UI with calculated totals
 *     }
 *   };
 */

interface BOQItem {
  quantity: number;
  rate: number;
  internal_cost?: number;
  misc_percentage?: number;
  transport_percentage?: number;
  overhead_profit_percentage?: number;
  negotiable_margin?: number;
}

interface CalculationResult {
  totalClientCost: number;
  totalInternalCost: number;
  totalPlannedProfit: number;
  totalActualProfit: number;
  totalMiscAmount: number;
  totalTransportAmount: number;
  totalOverheadProfitAmount: number;
  itemsTotal: number;
  rawMaterialsTotal: number;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, items, config } = e.data;

  switch (type) {
    case 'calculate':
      try {
        // Send progress update
        self.postMessage({ type: 'progress', progress: 0, message: 'Starting calculations...' });

        // Perform heavy calculations
        const result = calculateBOQTotals(items as BOQItem[]);

        self.postMessage({ type: 'progress', progress: 100, message: 'Calculations complete!' });

        // Send success response
        self.postMessage({
          type: 'success',
          result,
          message: 'BOQ calculations completed successfully'
        });
      } catch (error) {
        self.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error during calculations'
        });
      }
      break;

    case 'cancel':
      // Handle cancellation if needed
      self.postMessage({ type: 'cancelled' });
      break;

    default:
      self.postMessage({
        type: 'error',
        error: `Unknown message type: ${type}`
      });
  }
};

/**
 * Calculate BOQ totals from items
 */
function calculateBOQTotals(items: BOQItem[]): CalculationResult {
  const totals: CalculationResult = {
    totalClientCost: 0,
    totalInternalCost: 0,
    totalPlannedProfit: 0,
    totalActualProfit: 0,
    totalMiscAmount: 0,
    totalTransportAmount: 0,
    totalOverheadProfitAmount: 0,
    itemsTotal: 0,
    rawMaterialsTotal: 0,
  };

  items.forEach(item => {
    const amount = item.quantity * item.rate;
    const internalCost = item.internal_cost || 0;

    // Calculate percentages
    const miscAmount = amount * (item.misc_percentage || 0) / 100;
    const transportAmount = amount * (item.transport_percentage || 0) / 100;
    const overheadProfitAmount = amount * (item.overhead_profit_percentage || 0) / 100;

    // Accumulate totals
    totals.totalClientCost += amount;
    totals.totalInternalCost += internalCost;
    totals.totalMiscAmount += miscAmount;
    totals.totalTransportAmount += transportAmount;
    totals.totalOverheadProfitAmount += overheadProfitAmount;

    // Calculate profit
    const plannedProfit = amount - internalCost;
    const actualProfit = plannedProfit - miscAmount - transportAmount;

    totals.totalPlannedProfit += plannedProfit;
    totals.totalActualProfit += actualProfit;
    totals.itemsTotal += amount;
  });

  totals.rawMaterialsTotal = totals.totalClientCost;

  return totals;
}

export {};
