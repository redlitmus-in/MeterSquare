import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDate, getTodayFormatted } from '@/utils/dateFormatter';
import {
  X,
  FileText,
  Calendar,
  User,
  Building,
  Banknote,
  Hash,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
  MapPin,
  Download,
  Printer,
  Share2,
  Edit
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface DocumentViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: string;
  documentData: any;
  onEdit?: () => void;
  onDownload?: () => void;
  onPrint?: () => void;
}

const DocumentViewModal: React.FC<DocumentViewModalProps> = ({
  isOpen,
  onClose,
  documentType,
  documentData,
  onEdit,
  onDownload,
  onPrint
}) => {
  if (!isOpen || !documentData) return null;

  const handleDownload = () => {
    // Create a formatted document content
    const content = JSON.stringify(documentData, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentType}_${documentData.id || Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    if (onDownload) onDownload();
  };

  const handlePrint = () => {
    window.print();
    if (onPrint) onPrint();
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: any = {
      pending: { color: 'bg-yellow-100 text-yellow-700', icon: Clock },
      approved: { color: 'bg-green-100 text-green-700', icon: CheckCircle },
      rejected: { color: 'bg-red-100 text-red-700', icon: AlertCircle },
      in_progress: { color: 'bg-[#243d8a]/10 text-[#243d8a]/90', icon: Clock },
      completed: { color: 'bg-purple-100 text-purple-700', icon: CheckCircle }
    };
    
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-red-50 to-red-100 border-b border-red-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-red-600" />
                <div>
                  <h2 className="text-xl font-bold text-gray-800">
                    {documentType.replace('_', ' ').toUpperCase()} Details
                  </h2>
                  <p className="text-sm text-gray-600">
                    ID: {documentData.id || documentData.requestId || 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onEdit}
                    className="flex items-center gap-1"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  className="flex items-center gap-1"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="text-gray-600 hover:bg-red-100"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
            <Tabs defaultValue="details" className="space-y-4">
              <TabsList className="grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="items">Items</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">General Information</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-gray-500">Status</p>
                      <div>{getStatusBadge(documentData.status || 'pending')}</div>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-sm text-gray-500">Priority</p>
                      <Badge className={
                        documentData.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                        documentData.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                        documentData.priority === 'medium' ? 'bg-[#243d8a]/10 text-[#243d8a]/90' :
                        'bg-gray-100 text-gray-700'
                      }>
                        {documentData.priority || 'Medium'}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Created Date
                      </p>
                      <p className="font-medium">
                        {documentData.createdDate || documentData.date || 'N/A'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        Requester
                      </p>
                      <p className="font-medium">
                        {documentData.requester || documentData.requestedBy || 'N/A'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <Building className="w-3 h-3" />
                        Project
                      </p>
                      <p className="font-medium">
                        {documentData.project || documentData.projectName || 'N/A'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <Banknote className="w-3 h-3" />
                        Total Amount
                      </p>
                      <p className="font-medium text-lg text-red-600">
                        AED {documentData.totalAmount?.toLocaleString() || '0'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {documentData.description && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700">{documentData.description}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="items" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Line Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {documentData.items && documentData.items.length > 0 ? (
                      <div className="space-y-2">
                        {documentData.items.map((item: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Package className="w-4 h-4 text-gray-500" />
                              <div>
                                <p className="font-medium">{item.description || item.name || 'Item ' + (index + 1)}</p>
                                <p className="text-sm text-gray-500">Qty: {item.quantity || 0} {item.unit || ''}</p>
                              </div>
                            </div>
                            <p className="font-medium">AED {(item.amount || item.price || 0).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">No items available</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Activity History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">Document Created</p>
                          <p className="text-sm text-gray-500">
                            By {documentData.requester || 'System'} on {documentData.createdDate || 'N/A'}
                          </p>
                        </div>
                      </div>
                      
                      {documentData.status === 'approved' && (
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-[#243d8a]/10 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-[#243d8a]" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">Document Approved</p>
                            <p className="text-sm text-gray-500">
                              By Manager on {getTodayFormatted()}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default DocumentViewModal;