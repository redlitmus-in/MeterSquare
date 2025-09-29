import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import BOQCreationForm from '@/components/forms/BOQCreationForm';
import BOQDetailsModal from '../components/BOQDetailsModal';
import BOQEditModal from '../components/BOQEditModal';
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
  Search,
  Eye,
  Edit,
  Trash2,
  Calendar,
  MapPin,
  Plus,
  AlertCircle,
  Building2,
  Users,
  FolderOpen,
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
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
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
  const [boqs, setBOQs] = useState<BOQ[]>([]);
  const [filteredBOQs, setFilteredBOQs] = useState<BOQ[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<any[]>([]);
  const [selectedBOQ, setSelectedBOQ] = useState<BOQ | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [viewingProject, setViewingProject] = useState<any>(null);
  const [deletingProject, setDeletingProject] = useState<any>(null);
  const [extractedBOQ, setExtractedBOQ] = useState<BOQ | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showBOQCreationDialog, setShowBOQCreationDialog] = useState(false);
  const [selectedProjectForBOQ, setSelectedProjectForBOQ] = useState<any>(null);
  const [showBoqDetails, setShowBoqDetails] = useState(false);
  const [selectedBoqForDetails, setSelectedBoqForDetails] = useState<BOQ | null>(null);
  const [editingBoq, setEditingBoq] = useState<BOQ | null>(null);
  const [showBoqEdit, setShowBoqEdit] = useState(false);
  const [deletingBoq, setDeletingBoq] = useState<any>(null);

  useEffect(() => {
    loadProjects();
    loadBOQs();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [boqs, projects, searchTerm, activeTab]);

  const loadBOQs = async () => {
    try {
      setLoading(true);
      const response = await estimatorService.getAllBOQs();
      if (response.success) {
        // Map the backend BOQ data to include proper project structure
        const mappedBOQs = response.data.map((boq: any) => ({
          ...boq,
          boq_id: boq.boq_id,
          title: boq.boq_name || boq.title || 'Unnamed BOQ',
          project: {
            project_id: boq.project_id,
            name: boq.project_name || 'Unknown Project',
            client: boq.client || 'Unknown Client',
            location: boq.location || 'Unknown Location'
          },
          summary: {
            grandTotal: boq.total_cost || boq.selling_price || boq.estimatedSellingPrice || 0
          },
          total_cost: boq.total_cost || boq.selling_price || boq.estimatedSellingPrice || 0,
          status: boq.status || 'draft',
          created_at: boq.created_at
        }));
        setBOQs(mappedBOQs);
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

  const applyFilters = () => {
    // Filter projects
    if (activeTab === 'projects') {
      let filteredProj = [...projects];

      if (searchTerm) {
        filteredProj = filteredProj.filter(project =>
          project.project_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.description?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      setFilteredProjects(filteredProj);
    } else {
      // Filter BOQs
      let filtered = [...boqs];

      // Filter by tab status
      if (activeTab === 'pending') {
        filtered = filtered.filter(boq => boq.status === 'pending');
      } else if (activeTab === 'approved') {
        filtered = filtered.filter(boq => boq.status === 'approved');
      } else if (activeTab === 'sent') {
        filtered = filtered.filter(boq => boq.status === 'sent_for_confirmation');
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
    }
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

  const handleCreateBOQ = (project: any) => {
    setSelectedProjectForBOQ(project);
    setShowBOQCreationDialog(true);
  };

  const handleBOQCreated = (boqId: number) => {
    toast.success('BOQ created successfully!');
    setShowBOQCreationDialog(false);
    setSelectedProjectForBOQ(null);
    setActiveTab('pending');
    loadBOQs(); // Refresh the BOQ list
  };

  const handleDeleteBOQ = async () => {
    if (!deletingBoq) return;

    try {
      const response = await estimatorService.deleteBOQ(deletingBoq.boq_id);
      if (response.success) {
        toast.success('BOQ deleted successfully');
        setDeletingBoq(null);
        await loadBOQs(); // Refresh the BOQ list
      } else {
        toast.error(response.message || 'Failed to delete BOQ');
      }
    } catch (error) {
      toast.error('Failed to delete BOQ');
    }
  };

  const formatCurrency = (value: number) => {
    return `AED ${value.toLocaleString('en-AE', { minimumFractionDigits: 0 })}`;
  };

  const getStatusBadge = (status: string) => {
    const normalizedStatus = status?.toLowerCase().replace('_', '') || 'draft';
    const config: Record<string, { className: string; icon: any }> = {
      draft: { className: 'bg-gray-50 text-gray-600 border-gray-200', icon: FileText },
      inreview: { className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
      approved: { className: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
      sentforconfirmation: { className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Send },
      rejected: { className: 'bg-red-50 text-red-700 border-red-200', icon: AlertCircle }
    };

    const { className, icon: Icon } = config[normalizedStatus] || config.draft;

    return (
      <Badge variant="outline" className={`${className} flex items-center gap-1 border`}>
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const BOQTable = ({ boqList }: { boqList: BOQ[] }) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-200">
            <TableHead className="text-gray-600">BOQ Title</TableHead>
            <TableHead className="text-gray-600">Project</TableHead>
            <TableHead className="text-gray-600">Client</TableHead>
            <TableHead className="text-gray-600">Location</TableHead>
            <TableHead className="text-right text-gray-600">Total Value</TableHead>
            <TableHead className="text-gray-600">Status</TableHead>
            <TableHead className="text-gray-600">Created</TableHead>
            <TableHead className="text-gray-600">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {boqList.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-12 text-gray-500">
                <div className="flex flex-col items-center">
                  <FileText className="h-12 w-12 text-gray-300 mb-3" />
                  <p className="text-base">No BOQs found</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            boqList.map((boq) => (
              <TableRow key={boq.boq_id} className="border-gray-200 hover:bg-gray-50/50">
                <TableCell className="font-medium">{boq.title}</TableCell>
                <TableCell className="text-gray-600">{boq.project.name}</TableCell>
                <TableCell className="text-gray-600">{boq.project.client}</TableCell>
                <TableCell className="text-gray-600">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-gray-400" />
                    {boq.project.location}
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(boq.summary.grandTotal)}
                </TableCell>
                <TableCell>{getStatusBadge(boq.status)}</TableCell>
                <TableCell className="text-gray-600">
                  {boq.created_at ? format(new Date(boq.created_at), 'dd MMM yyyy') : 'N/A'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedBoqForDetails(boq);
                        setShowBoqDetails(true);
                      }}
                      className="h-8 w-8 p-0"
                      title="View BOQ Details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingBoq(boq);
                        setShowBoqEdit(true);
                      }}
                      className="h-8 w-8 p-0"
                      title="Edit BOQ"
                    >
                      <Edit className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDeletingBoq(boq);
                      }}
                      className="h-8 w-8 p-0"
                      title="Delete BOQ"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                    {boq.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleApproveBOQ(boq.boq_id!)}
                        className="h-8 w-8 p-0"
                      >
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    {boq.status === 'approved' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSendForConfirmation(boq.boq_id!)}
                        className="h-8 w-8 p-0"
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
    <div className="min-h-screen bg-white">
      {/* Professional Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-medium text-gray-900">Projects</h1>
              <p className="text-gray-500 text-sm mt-1">Manage your projects and create BOQs</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs">{format(new Date(), 'hh:mm:ss a')}</p>
              <p className="text-gray-400 text-xs">{format(new Date(), 'MMM dd, yyyy')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="border-b border-gray-100 bg-gray-50/50">
        <div className="px-8 py-4">
          <div className="grid grid-cols-4 gap-8">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-gray-100 rounded">
                <FolderOpen className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-medium text-gray-900">{projects.length}</p>
                <p className="text-xs text-gray-500">Total Projects</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="p-2 bg-yellow-50 rounded">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-medium text-gray-900">{boqs.filter(b => b.status === 'pending').length}</p>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="p-2 bg-green-50 rounded">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-medium text-gray-900">{boqs.filter(b => b.status === 'approved').length}</p>
                <p className="text-xs text-gray-500">Approved</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-50 rounded">
                <Send className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-medium text-gray-900">{boqs.filter(b => b.status === 'sent_for_confirmation').length}</p>
                <p className="text-xs text-gray-500">Sent</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by title, project, or client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-gray-200 focus:border-gray-300 focus:ring-0"
            />
          </div>
        </div>

        {/* Content Tabs */}
        <div className="bg-white">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start p-0 h-auto bg-transparent border-b border-gray-200">
              <TabsTrigger
                value="projects"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:text-gray-900 text-gray-500 px-4 py-3"
              >
                Projects
                <span className="ml-2 text-gray-400">({projects.length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="pending"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:text-gray-900 text-gray-500 px-4 py-3"
              >
                Pending
                <span className="ml-2 text-gray-400">({boqs.filter(b => b.status === 'pending').length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="approved"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:text-gray-900 text-gray-500 px-4 py-3"
              >
                Approved
                <span className="ml-2 text-gray-400">({boqs.filter(b => b.status === 'approved').length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="sent"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:text-gray-900 text-gray-500 px-4 py-3"
              >
                Sent
                <span className="ml-2 text-gray-400">({boqs.filter(b => b.status === 'sent_for_confirmation').length})</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="projects" className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-medium text-gray-900">Projects</h2>
                  <Button
                    onClick={() => setShowProjectDialog(true)}
                    className="bg-gray-900 hover:bg-gray-800 text-white"
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Project
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProjects.map((project, index) => {
                    // Count BOQs for this project
                    const projectBoqs = boqs.filter(boq => boq.project?.project_id == project.project_id);
                    const boqCount = projectBoqs.length;

                    return (
                    <motion.div
                      key={project.project_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * index }}
                      className="bg-white rounded-2xl border border-blue-100 p-6 hover:shadow-lg transition-all hover:border-blue-300 hover:shadow-blue-100/50"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg">
                            <Building2 className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 text-lg">{project.project_name}</h3>
                            <p className="text-sm text-gray-500">Project ID: {project.project_id}</p>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <div className="mb-4">
                        <p className="text-sm text-gray-600">{project.description || 'No description'}</p>
                      </div>

                      {/* BOQ Status */}
                      <div className="mb-4">
                        {boqCount > 0 ? (
                          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3 border border-green-200">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-green-600" />
                                <span className="text-sm font-medium text-green-700">
                                  {boqCount} BOQ{boqCount > 1 ? 's' : ''} Created
                                </span>
                              </div>
                              <div className="flex gap-1">
                                {projectBoqs.slice(0, 3).map((boq, idx) => {
                                  const statusColors: Record<string, string> = {
                                    'draft': 'bg-gray-200 text-gray-700',
                                    'Draft': 'bg-gray-200 text-gray-700',
                                    'pending': 'bg-yellow-200 text-yellow-700',
                                    'approved': 'bg-green-200 text-green-700',
                                    'sent_for_confirmation': 'bg-blue-200 text-blue-700'
                                  };
                                  const color = statusColors[boq.status] || 'bg-gray-200 text-gray-700';
                                  return (
                                    <span key={idx} className={`text-xs px-2 py-0.5 rounded ${color}`}>
                                      {boq.status}
                                    </span>
                                  );
                                })}
                                {boqCount > 3 && (
                                  <span className="text-xs text-gray-500">+{boqCount - 3}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-gray-400" />
                              <span className="text-sm text-gray-500">No BOQ Created</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Content Grid */}
                      <div className="grid grid-cols-1 gap-3 mb-6">
                        <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-lg p-3">
                          <div className="flex items-center gap-2 text-gray-600 mb-1">
                            <MapPin className="h-4 w-4 text-blue-600" />
                            <span className="text-xs font-medium text-blue-600">Location</span>
                          </div>
                          <p className="font-semibold text-gray-900 text-sm">{project.location || 'N/A'}</p>
                        </div>
                        <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-lg p-3">
                          <div className="flex items-center gap-2 text-gray-600 mb-1">
                            <Users className="h-4 w-4 text-blue-600" />
                            <span className="text-xs font-medium text-blue-600">Client</span>
                          </div>
                          <p className="font-semibold text-gray-900 text-sm">{project.client || 'N/A'}</p>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg p-3">
                          <div className="flex items-center gap-2 text-gray-600 mb-1">
                            <Calendar className="h-4 w-4 text-green-600" />
                            <span className="text-xs font-medium text-green-600">Created</span>
                          </div>
                          <p className="font-semibold text-green-700 text-sm">
                            {project.created_at ? format(new Date(project.created_at), 'dd MMM yyyy') : 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Create BOQ Button */}
                      <div className="mb-4">
                        <Button
                          className={`w-full font-medium ${
                            boqCount > 0
                              ? 'bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                          size="sm"
                          onClick={() => handleCreateBOQ(project)}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {boqCount > 0 ? 'Create Another BOQ' : 'Create BOQ'}
                        </Button>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                            onClick={() => setViewingProject(project)}
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                            onClick={() => {
                              setEditingProject(project);
                              setShowProjectDialog(true);
                            }}
                          >
                            Edit
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setDeletingProject(project)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </motion.div>
                    );
                  })}

                  {projects.length === 0 && !searchTerm && (
                    <div className="col-span-full border-2 border-dashed border-gray-200 rounded-lg">
                      <div className="flex flex-col items-center justify-center py-12">
                        <FolderOpen className="h-10 w-10 text-gray-300 mb-4" />
                        <h3 className="text-base font-medium text-gray-900 mb-1">No projects yet</h3>
                        <p className="text-sm text-gray-500 mb-4">Create your first project to start managing BOQs</p>
                        <Button
                          onClick={() => setShowProjectDialog(true)}
                          className="bg-gray-900 hover:bg-gray-800 text-white"
                          size="sm"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create Project
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="pending" className="p-6">
              <BOQTable boqList={filteredBOQs} />
            </TabsContent>

            <TabsContent value="approved" className="p-6">
              <BOQTable boqList={filteredBOQs} />
            </TabsContent>

            <TabsContent value="sent" className="p-6">
              <BOQTable boqList={filteredBOQs} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialogs remain the same */}
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

      <Dialog open={showProjectDialog} onOpenChange={(open) => {
        setShowProjectDialog(open);
        if (!open) setEditingProject(null);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingProject ? 'Edit Project' : 'Create New Project'}
            </DialogTitle>
            <DialogDescription>
              {editingProject
                ? 'Update project details'
                : 'Create a new project to manage BOQs'}
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

      <Dialog open={!!viewingProject} onOpenChange={(open) => !open && setViewingProject(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Project Details</DialogTitle>
          </DialogHeader>
          {viewingProject && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">Project Name</Label>
                  <p className="text-sm font-medium">{viewingProject.project_name}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Client</Label>
                  <p className="text-sm">{viewingProject.client || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Location</Label>
                  <p className="text-sm">{viewingProject.location || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Work Type</Label>
                  <p className="text-sm">{viewingProject.work_type || 'N/A'}</p>
                </div>
              </div>

              {/* BOQ Section */}
              <div className="border-t pt-4">
                <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  Related BOQs
                </h3>
                {(() => {
                  // Filter BOQs by matching project_id
                  const projectBoqs = boqs.filter(boq => {
                    // Handle both number and string comparison
                    return boq.project?.project_id == viewingProject.project_id;
                  });

                  if (projectBoqs.length === 0) {
                    return (
                      <div className="bg-gray-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-600">No BOQs created for this project yet</p>
                        <Button
                          size="sm"
                          className="mt-3 bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => {
                            handleCreateBOQ(viewingProject);
                            setViewingProject(null);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create BOQ
                        </Button>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {projectBoqs.map((boq) => (
                        <div key={boq.boq_id} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-sm">{boq.title}</h4>
                              <div className="flex items-center gap-4 mt-1">
                                <span className="text-xs text-gray-600">
                                  Status: {getStatusBadge(boq.status).label}
                                </span>
                                {boq.total_cost && (
                                  <span className="text-xs text-gray-600">
                                    Total: {formatCurrency(boq.total_cost)}
                                  </span>
                                )}
                                <span className="text-xs text-gray-600">
                                  Created: {boq.created_at ? format(new Date(boq.created_at), 'dd MMM yyyy') : 'N/A'}
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => {
                                  setSelectedBoqForDetails(boq);
                                  setShowBoqDetails(true);
                                  setViewingProject(null);
                                }}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => {
                                  setEditingBoq(boq);
                                  setShowBoqEdit(true);
                                  setViewingProject(null);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  setDeletingBoq(boq);
                                  setViewingProject(null);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
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

      <Dialog open={!!deletingProject} onOpenChange={(open) => !open && setDeletingProject(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingProject?.project_name}"?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeletingProject(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteProject}
            >
              Delete Project
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* BOQ Delete Confirmation Dialog */}
      <Dialog open={!!deletingBoq} onOpenChange={(open) => !open && setDeletingBoq(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Confirm Delete BOQ
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingBoq?.title || deletingBoq?.boq_name}"?
              This action cannot be undone and will permanently remove this BOQ.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeletingBoq(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteBOQ}
            >
              Delete BOQ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* BOQ Creation Dialog */}
      <BOQCreationForm
        isOpen={showBOQCreationDialog}
        onClose={() => {
          setShowBOQCreationDialog(false);
          setSelectedProjectForBOQ(null);
        }}
        onSubmit={handleBOQCreated}
        selectedProject={selectedProjectForBOQ}
      />

      {/* BOQ Details Modal */}
      <BOQDetailsModal
        isOpen={showBoqDetails}
        onClose={() => {
          setShowBoqDetails(false);
          setSelectedBoqForDetails(null);
        }}
        boq={selectedBoqForDetails}
        onEdit={() => {
          if (selectedBoqForDetails) {
            setShowBoqDetails(false);
            setEditingBoq(selectedBoqForDetails);
            setShowBoqEdit(true);
          }
        }}
        onDownload={() => {
          toast.info('BOQ download feature will be implemented soon');
        }}
      />

      {/* BOQ Edit Modal */}
      <BOQEditModal
        isOpen={showBoqEdit}
        onClose={() => {
          setShowBoqEdit(false);
          setEditingBoq(null);
        }}
        boq={editingBoq}
        onSave={() => {
          loadBOQs(); // Refresh the list
          setShowBoqEdit(false);
          setEditingBoq(null);
        }}
      />
    </div>
  );
};

export default EstimatorHub;