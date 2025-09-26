import React from 'react';
import { motion } from 'framer-motion';
import { BOQ } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  MapPin,
  Briefcase,
  User,
  Calendar,
  DollarSign,
  Package,
  Edit,
  CheckCircle,
  X
} from 'lucide-react';

interface BOQPreviewProps {
  boq: BOQ;
  onConfirm?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  readOnly?: boolean;
  showActions?: boolean;
}

const BOQPreview: React.FC<BOQPreviewProps> = ({
  boq,
  onConfirm,
  onEdit,
  onCancel,
  readOnly = false,
  showActions = true
}) => {
  const formatCurrency = (value: number) => {
    return `AED ${value.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'approved': return 'bg-green-100 text-green-700';
      case 'rejected': return 'bg-red-100 text-red-700';
      case 'sent_for_confirmation': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <Card className="shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl font-bold text-gray-900">
                {boq.title || 'Bill of Quantities'}
              </CardTitle>
              <p className="text-sm text-gray-600 mt-2">
                Reference: {boq.project.reference || 'BOQ-' + new Date().getFullYear()}
              </p>
            </div>
            <Badge className={getStatusColor(boq.status)}>
              {boq.status.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="mt-6">
          {/* Project Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-start gap-3">
              <Briefcase className="h-5 w-5 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Project</p>
                <p className="font-semibold text-gray-900">{boq.project.name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Client</p>
                <p className="font-semibold text-gray-900">{boq.project.client}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Location</p>
                <p className="font-semibold text-gray-900">{boq.project.location}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Area</p>
                <p className="font-semibold text-gray-900">{boq.project.area || 'N/A'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BOQ Items by Section */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Bill of Quantities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {boq.sections.map((section, sectionIndex) => (
              <motion.div
                key={sectionIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: sectionIndex * 0.1 }}
                className="border rounded-lg overflow-hidden"
              >
                <div className="bg-gray-50 px-4 py-3">
                  <h3 className="font-semibold text-gray-900">
                    {section.section_code && `${section.section_code}. `}
                    {section.section_name}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Item</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Description</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-600 uppercase">Qty</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-600 uppercase">Unit</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 uppercase">Rate</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {section.items.map((item, itemIndex) => (
                        <tr key={itemIndex} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {item.item_no || `${sectionIndex + 1}.${itemIndex + 1}`}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900">{item.description}</div>
                            {item.scope && (
                              <div className="text-xs text-gray-500 mt-1">Scope: {item.scope}</div>
                            )}
                            {item.location && (
                              <div className="text-xs text-gray-500">Location: {item.location}</div>
                            )}
                            {item.brand && (
                              <div className="text-xs text-gray-500">Brand: {item.brand}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-900">
                            {item.quantity.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-600">
                            {item.unit}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-900">
                            {formatCurrency(item.rate)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                            {formatCurrency(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100">
                      <tr>
                        <td colSpan={5} className="px-4 py-2 text-right font-semibold text-gray-700">
                          Section Total:
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">
                          {formatCurrency(section.subtotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-lg font-medium text-gray-900">
                {formatCurrency(boq.summary.total)}
              </span>
            </div>
            {boq.summary.discount && boq.summary.discount > 0 && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">
                    Discount {boq.summary.discountPercentage && `(${boq.summary.discountPercentage}%)`}
                  </span>
                  <span className="text-lg font-medium text-red-600">
                    - {formatCurrency(boq.summary.discount)}
                  </span>
                </div>
                <Separator />
              </>
            )}
            <div className="flex justify-between items-center pt-2">
              <span className="text-xl font-bold text-gray-900">Grand Total</span>
              <span className="text-2xl font-bold text-blue-600">
                {formatCurrency(boq.summary.grandTotal)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Terms & Conditions */}
      {boq.terms && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Terms & Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {boq.terms.validity && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-1">Validity</h4>
                  <p className="text-sm text-gray-600">{boq.terms.validity}</p>
                </div>
              )}
              {boq.terms.paymentTerms && boq.terms.paymentTerms.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">Payment Terms</h4>
                  <ul className="space-y-1">
                    {boq.terms.paymentTerms.map((term, index) => (
                      <li key={index} className="text-sm text-gray-600 flex items-start">
                        <span className="mr-2">•</span>
                        <span>{term}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {boq.terms.exclusions && boq.terms.exclusions.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">Exclusions</h4>
                  <ul className="space-y-1">
                    {boq.terms.exclusions.map((exclusion, index) => (
                      <li key={index} className="text-sm text-gray-600 flex items-start">
                        <span className="mr-2">•</span>
                        <span>{exclusion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {showActions && !readOnly && (
        <Card className="shadow-lg">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-end">
              {onCancel && (
                <Button
                  variant="outline"
                  onClick={onCancel}
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              )}
              {onEdit && (
                <Button
                  variant="outline"
                  onClick={onEdit}
                  className="flex items-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit BOQ
                </Button>
              )}
              {onConfirm && (
                <Button
                  onClick={onConfirm}
                  className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Confirm & Submit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
};

export default BOQPreview;