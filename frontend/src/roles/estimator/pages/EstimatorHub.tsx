import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import BOQUpload from '../components/BOQUpload';
import BOQPreview from '../components/BOQPreview';
import { estimatorService } from '../services/estimatorService';
import { BOQ, BOQFilter, BOQStatus } from '../types';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  Clock,
  CheckCircle,
  Send,
  Filter,
  Search,
  RefreshCw,
  Eye,
  Edit,
  Trash2,
  Download,
  DollarSign,
  Calendar,
  MapPin,
  MoreVertical,
  Plus,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';

const EstimatorHub: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('upload');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [boqs, setBOQs] = useState<BOQ[]>([]);
  const [filteredBOQs, setFilteredBOQs] = useState<BOQ[]>([]);
  const [selectedBOQ, setSelectedBOQ] = useState<BOQ | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [extractedBOQ, setExtractedBOQ] = useState<BOQ | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BOQStatus | 'all'>('all');

  useEffect(() => {
    loadBOQs();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [boqs, searchTerm, statusFilter, activeTab]);

  const loadBOQs = async () => {
    try {
      setLoading(true);
      const response = await estimatorService.getAllBOQs();
      if (response.success) {
        setBOQs(response.data);
      }
    } catch (error) {
      console.error('Error loading BOQs:', error);
      toast.error('Failed to load BOQs');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadBOQs();
    setRefreshing(false);
    toast.success('Data refreshed');
  };

  const applyFilters = () => {
    let filtered = [...boqs];

    // Filter by tab status
    if (activeTab === 'pending') {
      filtered = filtered.filter(boq => boq.status === 'pending');
    } else if (activeTab === 'approved') {
      filtered = filtered.filter(boq => boq.status === 'approved');
    } else if (activeTab === 'sent') {
      filtered = filtered.filter(boq => boq.status === 'sent_for_confirmation');
    }

    // Filter by status dropdown
    if (statusFilter !== 'all') {
      filtered = filtered.filter(boq => boq.status === statusFilter);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(boq =>
        boq.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        boq.project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        boq.project.client.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredBOQs(filtered);
  };

  const handleUploadSuccess = (boq: BOQ) => {
    setExtractedBOQ(boq);
    setShowUploadDialog(false);
    setShowPreviewDialog(true);
  };

  const handleConfirmBOQ = async () => {
    if (!extractedBOQ) return;

    try {
      setLoading(true);
      const response = await estimatorService.createBOQ({
        ...extractedBOQ,
        status: 'pending'
      });

      if (response.success) {
        toast.success('BOQ created successfully');
        setShowPreviewDialog(false);
        setExtractedBOQ(null);
        setActiveTab('pending');
        await loadBOQs();
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error('Error creating BOQ:', error);
      toast.error('Failed to create BOQ');
    } finally {
      setLoading(false);
    }
  };

  const handleSendForConfirmation = async (boqId: number) => {
    try {
      const response = await estimatorService.sendBOQForConfirmation(boqId);
      if (response.success) {
        toast.success('BOQ sent for confirmation');
        await loadBOQs();
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error('Error sending BOQ:', error);
      toast.error('Failed to send BOQ for confirmation');
    }
  };

  const handleApproveBOQ = async (boqId: number) => {
    try {
      const response = await estimatorService.approveBOQ(boqId);
      if (response.success) {
        toast.success('BOQ approved successfully');
        await loadBOQs();
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error('Error approving BOQ:', error);
      toast.error('Failed to approve BOQ');
    }
  };

  const formatCurrency = (value: number) => {
    return `AED ${value.toLocaleString('en-AE', { minimumFractionDigits: 0 })}`;
  };

  const getStatusBadge = (status: BOQStatus) => {
    const config = {
      draft: { className: 'bg-gray-100 text-gray-700', icon: FileText },
      pending: { className: 'bg-yellow-100 text-yellow-700', icon: Clock },
      approved: { className: 'bg-green-100 text-green-700', icon: CheckCircle },
      sent_for_confirmation: { className: 'bg-blue-100 text-blue-700', icon: Send },
      rejected: { className: 'bg-red-100 text-red-700', icon: AlertCircle }
    };

    const { className, icon: Icon } = config[status] || config.draft;

    return (
      <Badge className={`${className} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const BOQTable = ({ boqList }: { boqList: BOQ[] }) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>BOQ Title</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Total Value</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {boqList.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                No BOQs found
              </TableCell>
            </TableRow>
          ) : (
            boqList.map((boq) => (
              <TableRow key={boq.boq_id}>
                <TableCell className="font-medium">{boq.title}</TableCell>
                <TableCell>{boq.project.name}</TableCell>
                <TableCell>{boq.project.client}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-gray-400" />
                    {boq.project.location}
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatCurrency(boq.summary.grandTotal)}
                </TableCell>
                <TableCell>{getStatusBadge(boq.status)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-gray-400" />
                    {boq.created_at ? format(new Date(boq.created_at), 'dd MMM yyyy') : 'N/A'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedBOQ(boq);
                        setShowPreviewDialog(true);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {boq.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleApproveBOQ(boq.boq_id!)}
                      >
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    {boq.status === 'approved' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSendForConfirmation(boq.boq_id!)}
                      >
                        <Send className="h-4 w-4 text-blue-600" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  if (loading && boqs.length === 0) {
    return <ModernLoadingSpinners variant="pulse" color="blue" />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">BOQ Management</h1>
            <p className="text-gray-600 mt-1">Upload, manage and track Bills of Quantities</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={refreshData}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={() => setShowUploadDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Upload BOQ
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by title, project, or client..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="sent_for_confirmation">Sent for Confirmation</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending ({boqs.filter(b => b.status === 'pending').length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Approved ({boqs.filter(b => b.status === 'approved').length})
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Sent ({boqs.filter(b => b.status === 'sent_for_confirmation').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <BOQUpload
                onUploadSuccess={handleUploadSuccess}
                onCancel={() => setActiveTab('pending')}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pending BOQs</CardTitle>
            </CardHeader>
            <CardContent>
              <BOQTable boqList={filteredBOQs} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Approved BOQs</CardTitle>
            </CardHeader>
            <CardContent>
              <BOQTable boqList={filteredBOQs} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sent" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Sent for Confirmation</CardTitle>
            </CardHeader>
            <CardContent>
              <BOQTable boqList={filteredBOQs} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Upload New BOQ</DialogTitle>
            <DialogDescription>
              Upload a PDF file to extract BOQ data automatically
            </DialogDescription>
          </DialogHeader>
          <BOQUpload
            onUploadSuccess={handleUploadSuccess}
            onCancel={() => setShowUploadDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>BOQ Preview</DialogTitle>
          </DialogHeader>
          {(extractedBOQ || selectedBOQ) && (
            <BOQPreview
              boq={extractedBOQ || selectedBOQ!}
              onConfirm={extractedBOQ ? handleConfirmBOQ : undefined}
              onCancel={() => {
                setShowPreviewDialog(false);
                setExtractedBOQ(null);
                setSelectedBOQ(null);
              }}
              readOnly={!extractedBOQ}
              showActions={!!extractedBOQ}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EstimatorHub;