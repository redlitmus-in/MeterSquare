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

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [boqs, projects, searchTerm, activeTab]);

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

  const formatCurrency = (value: number) => {
    return `AED ${value.toLocaleString('en-AE', { minimumFractionDigits: 0 })}`;
  };

  const getStatusBadge = (status: BOQStatus) => {
    const config = {
      draft: { className: 'bg-gray-50 text-gray-600 border-gray-200', icon: FileText },
      pending: { className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
      approved: { className: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
      sent_for_confirmation: { className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Send },
      rejected: { className: 'bg-red-50 text-red-700 border-red-200', icon: AlertCircle }
    };

    const { className, icon: Icon } = config[status] || config.draft;

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
                        setSelectedBOQ(boq);
                        setShowPreviewDialog(true);
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <Eye className="h-4 w-4" />
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
              <h1 className="text-2xl font-medium text-gray-900">BOQ Management</h1>
              <p className="text-gray-500 text-sm mt-1">Upload, manage and track Bills of Quantities</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs">{format(new Date(), 'hh:mm a')}</p>
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

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProjects.map((project) => (
                    <Card key={project.project_id} className="border border-gray-200 hover:border-gray-300 transition-colors duration-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-medium text-gray-900">{project.project_name}</CardTitle>
                        <p className="text-sm text-gray-500">{project.description || 'No description'}</p>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{project.location || 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Users className="h-3.5 w-3.5" />
                            <span>Client: {project.client || 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{project.created_at ? format(new Date(project.created_at), 'dd MMM yyyy') : 'N/A'}</span>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <Button
                            className="w-full bg-gray-900 hover:bg-gray-800 text-white"
                            size="sm"
                            onClick={() => toast.info('BOQ creation feature coming soon')}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Create BOQ
                          </Button>
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="flex-1 text-gray-600 hover:text-gray-900"
                              onClick={() => setViewingProject(project)}
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="flex-1 text-gray-600 hover:text-gray-900"
                              onClick={() => {
                                setEditingProject(project);
                                setShowProjectDialog(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-gray-400 hover:text-red-600"
                              onClick={() => setDeletingProject(project)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

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
    </div>
  );
};

export default EstimatorHub;