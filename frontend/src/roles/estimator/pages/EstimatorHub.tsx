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
import BOQPreview from '../components/BOQPreview';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
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
import { Label } from '@/components/ui/label';

// Project Creation Form Component
const ProjectCreationForm: React.FC<{
  onSubmit: (data: any) => void;
  onCancel: () => void;
  initialData?: any;
}> = ({ onSubmit, onCancel, initialData }) => {
  const [formData, setFormData] = useState({
    project_name: initialData?.project_name || '',
    description: initialData?.description || '',
    location: initialData?.location || '',
    client: initialData?.client || '',
    work_type: initialData?.work_type || '',
    working_hours: initialData?.working_hours || '',
    floor_name: initialData?.floor_name || '',
    start_date: initialData?.start_date || '',
    end_date: initialData?.end_date || '',
    status: initialData?.status || 'active'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.project_name.trim()) {
      toast.error('Project name is required');
      return;
    }
    onSubmit(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="project_name">Project Name *</Label>
          <Input
            id="project_name"
            value={formData.project_name}
            onChange={(e) => handleChange('project_name', e.target.value)}
            placeholder="Enter project name"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="client">Client</Label>
          <Input
            id="client"
            value={formData.client}
            onChange={(e) => handleChange('client', e.target.value)}
            placeholder="Enter client name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder="Enter project location"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="work_type">Work Type</Label>
          <Input
            id="work_type"
            value={formData.work_type}
            onChange={(e) => handleChange('work_type', e.target.value)}
            placeholder="e.g., Construction, Renovation"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="working_hours">Working Hours</Label>
          <Input
            id="working_hours"
            value={formData.working_hours}
            onChange={(e) => handleChange('working_hours', e.target.value)}
            placeholder="e.g., 8 hours/day"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="floor_name">Floor Name</Label>
          <Input
            id="floor_name"
            value={formData.floor_name}
            onChange={(e) => handleChange('floor_name', e.target.value)}
            placeholder="e.g., Ground Floor, 1st Floor"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="start_date">Start Date</Label>
          <DatePicker
            id="start_date"
            selected={formData.start_date ? new Date(formData.start_date) : null}
            onChange={(date: Date | null) => handleChange('start_date', date ? date.toISOString().split('T')[0] : '')}
            dateFormat="dd/MM/yyyy"
            placeholderText="Select start date"
            minDate={new Date()}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            wrapperClassName="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="end_date">End Date</Label>
          <DatePicker
            id="end_date"
            selected={formData.end_date ? new Date(formData.end_date) : null}
            onChange={(date: Date | null) => handleChange('end_date', date ? date.toISOString().split('T')[0] : '')}
            dateFormat="dd/MM/yyyy"
            placeholderText="Select end date"
            minDate={formData.start_date ? new Date(formData.start_date) : new Date()}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            wrapperClassName="w-full"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Enter project description"
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="bg-green-600 hover:bg-green-700">
          Create Project
        </Button>
      </div>
    </form>
  );
};

const EstimatorHub: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('projects');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [boqs, setBOQs] = useState<BOQ[]>([]);
  const [filteredBOQs, setFilteredBOQs] = useState<BOQ[]>([]);
  const [selectedBOQ, setSelectedBOQ] = useState<BOQ | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [viewingProject, setViewingProject] = useState<any>(null);
  const [deletingProject, setDeletingProject] = useState<any>(null);
  const [extractedBOQ, setExtractedBOQ] = useState<BOQ | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BOQStatus | 'all'>('all');

  useEffect(() => {
    // loadBOQs(); // Disabled - backend endpoint not available
    loadProjects();
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
      toast.error('Failed to load BOQs');
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/all_project`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
    }
  };

  const handleCreateProject = async (projectData: any) => {
    try {
      const url = editingProject
        ? `${import.meta.env.VITE_API_BASE_URL}/update_project/${editingProject.project_id}`
        : `${import.meta.env.VITE_API_BASE_URL}/create_project`;

      const response = await fetch(url, {
        method: editingProject ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(projectData)
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(editingProject ? 'Project updated successfully' : 'Project created successfully');
        setShowProjectDialog(false);
        setEditingProject(null);
        await loadProjects();
        return result.project;
      } else {
        const error = await response.json();
        toast.error(error.error || (editingProject ? 'Failed to update project' : 'Failed to create project'));
      }
    } catch (error) {
      toast.error(editingProject ? 'Failed to update project' : 'Failed to create project');
    }
  };

  const handleDeleteProject = async () => {
    if (!deletingProject) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/delete_project/${deletingProject.project_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        toast.success('Project deleted successfully');
        setDeletingProject(null);
        await loadProjects();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete project');
      }
    } catch (error) {
      toast.error('Failed to delete project');
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    // await Promise.all([loadBOQs(), loadProjects()]); // BOQ endpoint not available
    await loadProjects();
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
          <TabsTrigger value="projects" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Projects ({projects.length})
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

        <TabsContent value="projects" className="mt-6">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Projects</h2>
              <Button onClick={() => setShowProjectDialog(true)} className="bg-green-600 hover:bg-green-700">
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <Card key={project.project_id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{project.project_name}</CardTitle>
                    <p className="text-sm text-gray-600">{project.description || 'No description'}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span>{project.location || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <span>Client: {project.client || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>Created: {project.created_at ? format(new Date(project.created_at), 'dd MMM yyyy') : 'N/A'}</span>
                      </div>
                      <div className="pt-3 space-y-2">
                        <Button
                          size="sm"
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => {
                            // TODO: Implement BOQ creation for this project
                            toast.info('BOQ creation feature coming soon');
                          }}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Create BOQ
                        </Button>
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => setViewingProject(project)}
                            title="View Project"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setEditingProject(project);
                              setShowProjectDialog(true);
                            }}
                            title="Edit Project"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeletingProject(project)}
                            title="Delete Project"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {projects.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileText className="h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
                    <p className="text-gray-600 mb-4 text-center">Create your first project to start managing BOQs</p>
                    <Button onClick={() => setShowProjectDialog(true)} className="bg-green-600 hover:bg-green-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Project
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
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

      {/* Project Creation/Edit Dialog */}
      <Dialog open={showProjectDialog} onOpenChange={(open) => {
        setShowProjectDialog(open);
        if (!open) setEditingProject(null);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Edit Project' : 'Create New Project'}</DialogTitle>
            <DialogDescription>
              {editingProject
                ? 'Update project details'
                : 'Create a new project to start managing BOQs and estimates'}
            </DialogDescription>
          </DialogHeader>
          <ProjectCreationForm
            onSubmit={handleCreateProject}
            onCancel={() => {
              setShowProjectDialog(false);
              setEditingProject(null);
            }}
            initialData={editingProject}
          />
        </DialogContent>
      </Dialog>

      {/* View Project Dialog */}
      <Dialog open={!!viewingProject} onOpenChange={(open) => !open && setViewingProject(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Project Details</DialogTitle>
          </DialogHeader>
          {viewingProject && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Project Name</Label>
                  <p className="text-sm font-medium">{viewingProject.project_name}</p>
                </div>
                <div>
                  <Label>Client</Label>
                  <p className="text-sm">{viewingProject.client || 'N/A'}</p>
                </div>
                <div>
                  <Label>Location</Label>
                  <p className="text-sm">{viewingProject.location || 'N/A'}</p>
                </div>
                <div>
                  <Label>Work Type</Label>
                  <p className="text-sm">{viewingProject.work_type || 'N/A'}</p>
                </div>
                <div>
                  <Label>Working Hours</Label>
                  <p className="text-sm">{viewingProject.working_hours || 'N/A'}</p>
                </div>
                <div>
                  <Label>Floor Name</Label>
                  <p className="text-sm">{viewingProject.floor_name || 'N/A'}</p>
                </div>
                <div>
                  <Label>Start Date</Label>
                  <p className="text-sm">{viewingProject.start_date || 'N/A'}</p>
                </div>
                <div>
                  <Label>End Date</Label>
                  <p className="text-sm">{viewingProject.end_date || 'N/A'}</p>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <p className="text-sm">{viewingProject.description || 'No description provided'}</p>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingProject(viewingProject);
                    setViewingProject(null);
                    setShowProjectDialog(true);
                  }}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button onClick={() => setViewingProject(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingProject} onOpenChange={(open) => !open && setDeletingProject(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription className="pt-3">
              Are you sure you want to delete the project <strong>"{deletingProject?.project_name}"</strong>?
              <br />
              <span className="text-red-500 text-sm mt-2 block">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeletingProject(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteProject}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Project
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EstimatorHub;