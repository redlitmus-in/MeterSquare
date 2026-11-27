import React from 'react';
import { AlertCircle, Store } from 'lucide-react';

export interface VendorSummaryRow {
  material_name: string;
  sub_item_name?: string;
  quantity: number;
  unit: string;
  vendor_name?: string;
  routed_to_store?: boolean;
  unit_price: number | null;
  boq_unit_price: number | null;
}

interface VendorSelectionSummaryProps {
  rows: VendorSummaryRow[];
  currency: string;
  poLabel?: string;
}

const formatAmount = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Pre-submit review of a PO: every material with quantity, vendor and pricing,
 * so the buyer can see exactly what goes to TD before confirming.
 */
const VendorSelectionSummary: React.FC<VendorSelectionSummaryProps> = ({ rows, currency, poLabel }) => {
  const missingVendor = rows.filter(r => !r.vendor_name && !r.routed_to_store);
  const vendorCount = new Set(rows.map(r => r.vendor_name).filter(Boolean)).size;
  const vendorTotal = rows.reduce((sum, r) => sum + (r.unit_price !== null ? r.unit_price * r.quantity : 0), 0);
  const boqTotal = rows.reduce((sum, r) => sum + (r.boq_unit_price ? r.boq_unit_price * r.quantity : 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
        {poLabel && <span className="font-semibold text-gray-900">{poLabel}</span>}
        <span><span className="font-semibold">{rows.length}</span> material{rows.length !== 1 ? 's' : ''}</span>
        <span><span className="font-semibold">{vendorCount}</span> vendor{vendorCount !== 1 ? 's' : ''}</span>
        <span>Total: <span className="font-semibold">{currency} {formatAmount(vendorTotal)}</span></span>
        {boqTotal > 0 && <span className="text-gray-500">BOQ: {currency} {formatAmount(boqTotal)}</span>}
      </div>

      {missingVendor.length > 0 && (
        <div role="alert" className="flex gap-2 bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm text-amber-900">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">{missingVendor.length} material{missingVendor.length !== 1 ? 's have' : ' has'} no vendor</span>
            {' '}and will not be included in this submission: {missingVendor.map(r => r.material_name.trim()).join(', ')}
          </span>
        </div>
      )}

      <div className="max-h-80 overflow-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-100 text-gray-600 sticky top-0">
            <tr>
              <th scope="col" className="px-2 py-2 text-left font-medium">#</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Material</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Qty</th>
              <th scope="col" className="px-2 py-2 text-left font-medium">Vendor</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Unit Price</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Total</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">BOQ Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, idx) => {
              const noVendor = !r.vendor_name && !r.routed_to_store;
              return (
                <tr key={`${r.material_name}-${idx}`} className={noVendor ? 'bg-amber-50' : 'bg-white'}>
                  <td className="px-2 py-2 text-gray-500 align-top">{idx + 1}</td>
                  <td className="px-2 py-2 align-top">
                    <div className="font-medium text-gray-900">{r.material_name}</div>
                    {r.sub_item_name && <div className="text-[10px] text-purple-700">{r.sub_item_name}</div>}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap align-top">{r.quantity} {r.unit}</td>
                  <td className="px-2 py-2 align-top">
                    {r.routed_to_store ? (
                      <span className="inline-flex items-center gap-1 text-indigo-700">
                        <Store className="w-3 h-3" aria-hidden="true" /> M2 Store
                      </span>
                    ) : noVendor ? (
                      <span className="font-medium text-amber-700">Not selected</span>
                    ) : (
                      <span className="text-gray-900">{r.vendor_name}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap align-top">
                    {r.unit_price !== null ? formatAmount(r.unit_price) : '—'}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap font-medium align-top">
                    {r.unit_price !== null ? formatAmount(r.unit_price * r.quantity) : '—'}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap text-gray-500 align-top">
                    {r.boq_unit_price ? formatAmount(r.boq_unit_price * r.quantity) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VendorSelectionSummary;
