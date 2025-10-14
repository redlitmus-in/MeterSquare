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
import SendBOQEmailModal from '../components/SendBOQEmailModal';
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
  LayoutGrid,
  List,
  ShoppingCart,
  Mail,
  Download,
  XCircle as XCircleIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  exportBOQToExcelInternal,
  exportBOQToExcelClient,
  exportBOQToPDFInternal,
  exportBOQToPDFClient
} from '@/utils/boqExportUtils';

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
    area: initialData?.area || '',
    start_date: initialData?.start_date || '',
    duration_days: initialData?.duration_days || '',
    end_date: initialData?.end_date || '',
    status: initialData?.status || 'active'
  });

  // Calculate end date whenever start date or duration changes
  useEffect(() => {
    if (formData.start_date && formData.duration_days) {
      const startDate = new Date(formData.start_date);
      const durationDays = parseInt(formData.duration_days);

      if (!isNaN(durationDays) && durationDays > 0) {
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + durationDays);

        const calculatedEndDate = endDate.toISOString().split('T')[0];
        if (calculatedEndDate !== formData.end_date) {
          setFormData(prev => ({ ...prev, end_date: calculatedEndDate }));
        }
      }
    } else {
      if (formData.end_date) {
        setFormData(prev => ({ ...prev, end_date: '' }));
      }
    }
  }, [formData.start_date, formData.duration_days]);

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
          <Label htmlFor="area">Area</Label>
          <Input
            id="area"
            value={formData.area}
            onChange={(e) => handleChange('area', e.target.value)}
            placeholder="e.g., 1000 sq.ft."
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
          <Label htmlFor="duration_days">Number of Days</Label>
          <Input
            id="duration_days"
            type="number"
            value={formData.duration_days || ''}
            onChange={(e) => handleChange('duration_days', e.target.value)}
            placeholder="e.g., 80 days"
            min="1"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="end_date">End Date</Label>
          <Input
            id="end_date"
            type="text"
            value={formData.end_date ? format(new Date(formData.end_date), 'dd/MM/yyyy') : ''}
            placeholder="Auto-calculated"
            disabled
            className="bg-gray-100 cursor-not-allowed"
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
        <button
          type="submit"
          className="px-6 py-2 text-white rounded-lg hover:opacity-90 transition-all font-semibold"
          style={{ backgroundColor: 'rgb(36, 61, 138)' }}
        >
          {initialData ? 'Update Project' : 'Create Project'}
        </button>
      </div>
    </form>
  );
};

const EstimatorHub: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('projects');
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [sendingToTD, setSendingToTD] = useState(false);
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
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProjects, setTotalProjects] = useState(0);
  const itemsPerPage = 10; // Fixed at 10 items per page
  const [boqCurrentPage, setBoqCurrentPage] = useState(1); // Pagination for BOQ tabs
  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [boqToEmail, setBoqToEmail] = useState<BOQ | null>(null);
  const [emailMode, setEmailMode] = useState<'td' | 'client'>('td'); // Track whether sending to TD or client
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [downloadType, setDownloadType] = useState<'internal' | 'client'>('internal');
  const [boqToDownload, setBoqToDownload] = useState<any>(null);
  const [showClientRejectionModal, setShowClientRejectionModal] = useState(false);
  const [boqToReject, setBoqToReject] = useState<BOQ | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [boqToCancel, setBoqToCancel] = useState<BOQ | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [selectedBoqForRevision, setSelectedBoqForRevision] = useState<BOQ | null>(null);
  const [showSendToTDPopup, setShowSendToTDPopup] = useState(false);
  const [boqToSendToTD, setBoqToSendToTD] = useState<BOQ | null>(null);
  const [isRevisionEdit, setIsRevisionEdit] = useState(false);
  const [isSendingToTD, setIsSendingToTD] = useState(false);

  // Dynamic Revision Tabs States
  const [revisionTabs, setRevisionTabs] = useState<Array<{
    revision_number: number;
    project_count: number;
    alert_level: 'normal' | 'warning' | 'critical';
  }>>([]);
  const [selectedRevisionTab, setSelectedRevisionTab] = useState<number | 'all'>('all');
  const [revisionProjects, setRevisionProjects] = useState<any[]>([]);
  const [loadingRevisionTabs, setLoadingRevisionTabs] = useState(false);
  const [loadingRevisionProjects, setLoadingRevisionProjects] = useState(false);

  // PM Selection Modal States
  const [showPMSelectionModal, setShowPMSelectionModal] = useState(false);
  const [projectToSendToPM, setProjectToSendToPM] = useState<any>(null);
  const [projectManagers, setProjectManagers] = useState<any[]>([]);
  const [selectedPM, setSelectedPM] = useState<number | null>(null);
  const [isSendingToPM, setIsSendingToPM] = useState(false);
  const [loadingPMs, setLoadingPMs] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        await loadProjects(currentPage);
        await loadBOQs();
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Error fetching data:', error);
        }
      } finally {
        setInitialLoadComplete(true);
      }
    };

    fetchData();

    // Set up auto-refresh polling every 30 seconds for BOQs
    const intervalId = setInterval(() => {
      loadBOQs(); // Auto-refresh BOQs in background
    }, 30000); // 30 seconds

    return () => {
      abortController.abort();
      clearInterval(intervalId);
    };
  }, [currentPage]);

  useEffect(() => {
    applyFilters();
  }, [boqs, projects, searchTerm, activeTab]);

  // Reset BOQ pagination when tab changes
  useEffect(() => {
    setBoqCurrentPage(1);
  }, [activeTab]);

  const loadBOQs = async () => {
    try {
      setLoading(true);
      const response = await estimatorService.getAllBOQs();
      if (response.success && response.data) {
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
            grandTotal: boq.selling_price || boq.estimatedSellingPrice || boq.total_cost || 0
          },
          total_cost: boq.selling_price || boq.estimatedSellingPrice || boq.total_cost || 0,
          status: boq.status || 'draft',
          revision_number: boq.revision_number || 0,
          client_rejection_reason: boq.client_rejection_reason,
          created_at: boq.created_at,
          email_sent: boq.email_sent || false,
          pm_assigned: boq.pm_assigned || false
        }));

        // Sort by created_at - most recent first
        const sortedBOQs = mappedBOQs.sort((a: any, b: any) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateB - dateA; // Descending order (newest first)
        });

        setBOQs(sortedBOQs);
      } else {
        setBOQs([]);
      }
    } catch (error: any) {
      console.error('Error loading BOQs:', error);
      if (error.name !== 'AbortError') {
        toast.error('Failed to load BOQs');
      }
      setBOQs([]);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async (page: number = 1) => {
    try {
      const response = await estimatorService.getProjectsPaginated(page, 10);
      if (response.success) {
        setProjects(response.projects);
        setTotalProjects(response.total);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  // Load Dynamic Revision Tabs
  const loadRevisionTabs = async () => {
    try {
      setLoadingRevisionTabs(true);
      const response = await estimatorService.getRevisionTabs();
      if (response.success && response.data) {
        setRevisionTabs(response.data);
      } else {
        setRevisionTabs([]);
      }
    } catch (error) {
      console.error('Error loading revision tabs:', error);
      setRevisionTabs([]);
    } finally {
      setLoadingRevisionTabs(false);
    }
  };

  // Load Projects by Revision Number
  const loadRevisionProjects = async (revisionNumber: number | 'all') => {
    try {
      setLoadingRevisionProjects(true);
      const response = await estimatorService.getProjectsByRevision(revisionNumber);
      if (response.success && response.data) {
        setRevisionProjects(response.data);
      } else {
        setRevisionProjects([]);
      }
    } catch (error) {
      console.error('Error loading revision projects:', error);
      setRevisionProjects([]);
    } finally {
      setLoadingRevisionProjects(false);
    }
  };

  // Load revision tabs when Revisions tab is active
  useEffect(() => {
    if (activeTab === 'revisions') {
      loadRevisionTabs();
      loadRevisionProjects(selectedRevisionTab);
    }
  }, [activeTab]);

  // Reload projects when revision tab changes
  useEffect(() => {
    if (activeTab === 'revisions' && selectedRevisionTab) {
      loadRevisionProjects(selectedRevisionTab);
      setBoqCurrentPage(1); // Reset to page 1 when switching revision tabs
    }
  }, [selectedRevisionTab]);

  const handleCreateProject = async (projectData: any) => {
    try {
      const response = editingProject
        ? await estimatorService.updateProject(editingProject.project_id, projectData)
        : await estimatorService.createProject(projectData);

      if (response.success) {
        toast.success(response.message);
        setShowProjectDialog(false);
        setEditingProject(null);
        await loadProjects();
        return response.project;
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error(editingProject ? 'Failed to update project' : 'Failed to create project');
    }
  };

  const handleDeleteProject = async () => {
    if (!deletingProject) return;

    try {
      const response = await estimatorService.deleteProject(deletingProject.project_id);
      if (response.success) {
        toast.success(response.message);
        setDeletingProject(null);
        await loadProjects();
      } else {
        toast.error(response.message);
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

      // Filter by tab status based on workflow - USE STATUS ONLY
      if (activeTab === 'projects') {
        // Pending: Draft BOQs not sent to TD/PM yet (no status or status = draft) OR client_rejected (needs revision)
        filtered = filtered.filter(boq => {
          const status = boq.status?.toLowerCase() || '';
          return !status || status === 'draft' || status === 'client_rejected' || (status !== 'pending' && status !== 'pending_pm_approval' && status !== 'approved' && status !== 'rejected' && status !== 'sent_for_confirmation' && status !== 'client_confirmed' && status !== 'completed' && status !== 'client_cancelled');
        });
      } else if (activeTab === 'sent') {
        // Send BOQ: Sent to TD or PM, waiting for approval
        filtered = filtered.filter(boq => {
          const status = boq.status?.toLowerCase();
          return status === 'pending' || status === 'pending_pm_approval';
        });
      } else if (activeTab === 'revisions') {
        // Revisions: BOQs that have gone through revision cycle OR are in revision state
        // Once a BOQ enters revision cycle (revision_number > 0), it STAYS in Revisions tab forever
        filtered = filtered.filter(boq => {
          const status = boq.status?.toLowerCase();
          const revisionNumber = boq.revision_number || 0;

          // If revision_number > 0, this BOQ has been through revision - keep it in Revisions tab
          if (revisionNumber > 0) {
            return true;
          }

          // For revision_number = 0, only show if in active revision states
          return status === 'under_revision' || status === 'pending_revision' || status === 'revision_approved';
        });
      } else if (activeTab === 'approved') {
        // Approved: PM approved, TD approved (includes all stages after approvals until PM assignment)
        // EXCLUDE projects with revision_number > 0 (those stay in Revisions tab)
        filtered = filtered.filter(boq => {
          const status = boq.status?.toLowerCase();
          const revisionNumber = boq.revision_number || 0;

          // If this BOQ has gone through revisions, it belongs in Revisions tab, not here
          if (revisionNumber > 0) {
            return false;
          }

          // Show if PM approved, pending TD approval, TD approved, sent to client, or client confirmed (but not yet PM assigned/completed)
          return (status === 'pm_approved' || status === 'pending_td_approval' || status === 'approved' || status === 'sent_for_confirmation' || status === 'client_confirmed') && !boq.pm_assigned;
        });
      } else if (activeTab === 'rejected') {
        // Rejected: TD rejected OR client rejected
        filtered = filtered.filter(boq => {
          const status = boq.status?.toLowerCase();
          return status === 'rejected' || status === 'client_rejected';
        });
      } else if (activeTab === 'completed') {
        // Completed BOQs (PM assigned)
        filtered = filtered.filter(boq =>
          boq.status?.toLowerCase() === 'completed' || boq.pm_assigned === true
        );
      } else if (activeTab === 'cancelled') {
        // Cancelled BOQs (client doesn't want to proceed)
        filtered = filtered.filter(boq =>
          boq.status?.toLowerCase() === 'client_cancelled'
        );
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
        setActiveTab('projects'); // Show pending projects tab
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
    setActiveTab('projects'); // Show pending projects tab
    loadBOQs(); // Refresh the BOQ list
  };

  const handleSendToTD = async (project: any) => {
    setSendingToTD(true);
    try {
      // Find BOQs for this project
      const projectBoqs = boqs.filter(boq => boq.project?.project_id == project.project_id);

      if (projectBoqs.length === 0) {
        toast.error('No BOQ found for this project. Please create a BOQ first.');
        setSendingToTD(false);
        return;
      }

      // Send all BOQs for this project to TD via email
      let successCount = 0;
      let failureCount = 0;

      for (const boq of projectBoqs) {
        const response = await estimatorService.sendBOQEmail(boq.boq_id);

        if (response.success) {
          successCount++;
        } else {
          failureCount++;
          console.error('Failed to send BOQ:', response.message);
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully sent ${successCount} BOQ(s) via email to Technical Director`);
        await loadBOQs(); // Refresh the BOQ list to get updated email_sent status
        setActiveTab('sent'); // Switch to "Send BOQ" tab
      }

      if (failureCount > 0) {
        toast.warning(`${failureCount} BOQ(s) failed to send`);
      }
    } catch (error) {
      console.error('Error sending BOQ to TD:', error);
      toast.error('Failed to send BOQ to Technical Director');
    } finally {
      setSendingToTD(false);
    }
  };

  const handleSendToPM = async (project: any) => {
    try {
      // Find BOQs for this project
      const projectBoqs = boqs.filter(boq => boq.project?.project_id == project.project_id);

      if (projectBoqs.length === 0) {
        toast.error('No BOQ found for this project. Please create a BOQ first.');
        return;
      }

      // Store project and open PM selection modal
      setProjectToSendToPM(project);
      setShowPMSelectionModal(true);

      // Fetch Project Managers from API
      setLoadingPMs(true);
      const pmResult = await estimatorService.getAllProjectManagers();

      if (pmResult.success) {
        setProjectManagers(pmResult.data);
      } else {
        toast.error(pmResult.message || 'Failed to load Project Managers');
      }
      setLoadingPMs(false);
    } catch (error) {
      console.error('Error opening PM selection:', error);
      toast.error('Failed to load Project Managers');
    }
  };

  const handleConfirmSendToPM = async () => {
    if (!selectedPM || !projectToSendToPM) {
      toast.error('Please select a Project Manager');
      return;
    }

    setIsSendingToPM(true);
    try {
      // Find BOQ for this project
      const projectBoqs = boqs.filter(boq => boq.project?.project_id == projectToSendToPM.project_id);

      if (projectBoqs.length === 0) {
        toast.error('No BOQ found for this project');
        setIsSendingToPM(false);
        return;
      }

      const boq = projectBoqs[0]; // Get the first BOQ
      const selectedPMData = projectManagers.find(pm => pm.user_id === selectedPM);

      // Send BOQ to PM using real API
      const response = await estimatorService.sendBOQToProjectManager(boq.boq_id, selectedPM);

      if (response.success) {
        toast.success(`Successfully sent BOQ to ${selectedPMData?.full_name}`);
        setShowPMSelectionModal(false);
        setSelectedPM(null);
        setProjectToSendToPM(null);
        await loadBOQs(); // Refresh BOQ list
      } else {
        toast.error(response.message || 'Failed to send BOQ to Project Manager');
      }
    } catch (error) {
      console.error('Error sending BOQ to PM:', error);
      toast.error('Failed to send BOQ to Project Manager');
    } finally {
      setIsSendingToPM(false);
    }
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

  const handleClientRejection = async () => {
    if (!boqToReject || !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      const result = await estimatorService.rejectClientApproval(boqToReject.boq_id!, rejectionReason);
      if (result.success) {
        toast.success(result.message);
        setShowClientRejectionModal(false);
        setBoqToReject(null);
        setRejectionReason('');
        await loadBOQs(); // Refresh list
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to record client rejection');
    }
  };

  const handleCancelBOQ = async () => {
    if (!boqToCancel || !cancellationReason.trim()) {
      toast.error('Please provide a cancellation reason');
      return;
    }

    try {
      const result = await estimatorService.cancelBOQ(boqToCancel.boq_id!, cancellationReason);
      if (result.success) {
        toast.success(result.message);
        setShowCancelModal(false);
        setBoqToCancel(null);
        setCancellationReason('');
        await loadBOQs(); // Refresh list
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to cancel BOQ');
    }
  };

  const formatCurrency = (value: number) => {
    return `AED ${value.toLocaleString('en-AE', { minimumFractionDigits: 0 })}`;
  };

  const handleDownload = async (format: 'excel' | 'pdf') => {
    if (!boqToDownload) return;

    try {
      const isInternal = downloadType === 'internal';
      const formatName = format === 'excel' ? 'Excel' : 'PDF';
      const typeName = isInternal ? 'Internal' : 'Client';

      toast.loading(`Generating ${typeName} ${formatName} file...`);

      if (format === 'excel') {
        if (isInternal) {
          await exportBOQToExcelInternal(boqToDownload);
        } else {
          await exportBOQToExcelClient(boqToDownload);
        }
      } else {
        if (isInternal) {
          await exportBOQToPDFInternal(boqToDownload);
        } else {
          await exportBOQToPDFClient(boqToDownload);
        }
      }

      toast.dismiss();
      toast.success(`${typeName} BOQ downloaded successfully as ${formatName}`);
      setShowFormatModal(false);
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to download BOQ');
      console.error('Download error:', error);
    }
  };

  const handleDownloadBOQ = async (boq: any) => {
    try {
      // Fetch full BOQ details first
      const result = await estimatorService.getBOQById(boq.boq_id);
      if (!result.success || !result.data) {
        toast.error('Failed to fetch BOQ details');
        return;
      }

      const boqData = result.data;

      // Transform BOQ data to match export function expectations (same as TD does)
      // IMPORTANT: Use existing_purchase.items OR items (same logic as SendBOQEmailModal)
      const items = (boqData.existing_purchase?.items || boqData.items) || [];

      const transformedData = {
        id: boqData.boq_id || boq.boq_id,
        projectName: boqData.project_name || boqData.project_details?.project_name || boq.project?.name || 'Unknown Project',
        clientName: boqData.client || boqData.project_details?.client || boqData.project?.client || boq.client || boq.project_details?.client || 'Unknown Client',
        estimator: boqData.created_by || boqData.created_by_name || 'Unknown',
        totalValue: boqData.selling_price || boqData.estimatedSellingPrice || boqData.total_cost || 0,
        itemCount: items.length || boqData.items_count || 0,
        laborCost: boqData.total_labour_cost || 0,
        materialCost: boqData.total_material_cost || 0,
        profitMargin: boqData.profit_margin || boqData.profit_margin_percentage || 0,
        overheadPercentage: boqData.overhead_percentage || boqData.overhead || 0,
        discountPercentage: boqData.discount_percentage || 0,
        submittedDate: boqData.created_at || new Date().toISOString(),
        location: boqData.location || boqData.project_details?.location || 'N/A',
        floor: boqData.floor_name || boqData.project_details?.floor || 'N/A',
        workingHours: boqData.working_hours || boqData.project_details?.hours || 'N/A',
        preliminaries: boqData.preliminaries || {},
        totalVatAmount: boqData.total_vat_amount || boqData.totalVatAmount || 0,
        overallVatPercentage: boqData.overall_vat_percentage || boqData.overallVatPercentage || 0,
        boqItems: items.map((item: any) => {
          const totalQuantity = item.materials?.reduce((sum: number, m: any) => sum + (m.quantity || 0), 0) || 1;
          const sellingPrice = item.selling_price || 0;

          return {
            id: item.item_id,
            description: item.item_name,
            briefDescription: item.description || '',
            unit: item.materials?.[0]?.unit || 'nos',
            quantity: totalQuantity,
            rate: totalQuantity > 0 ? sellingPrice / totalQuantity : sellingPrice,
            amount: sellingPrice,
            materials: item.materials?.map((mat: any) => ({
              name: mat.material_name,
              quantity: mat.quantity,
              unit: mat.unit,
              rate: mat.unit_price,
              amount: mat.total_price,
              vat_percentage: mat.vat_percentage || 0
            })) || [],
            labour: item.labour?.map((lab: any) => ({
              type: lab.labour_role,
              quantity: lab.hours,
              unit: 'hrs',
              rate: lab.rate_per_hour,
              amount: lab.total_cost
            })) || [],
            laborCost: item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0,
            estimatedSellingPrice: item.selling_price || 0,
            overheadPercentage: item.overhead_percentage || 0,
            profitMarginPercentage: item.profit_margin_percentage || 0,
            discountPercentage: item.discount_percentage || 0,
            vat_percentage: item.vat_percentage || 0,
            vat_amount: item.vat_amount || 0
          };
        }) || []
      };

      setBoqToDownload(transformedData);
      setShowFormatModal(true);
    } catch (error) {
      toast.error('Failed to load BOQ for download');
      console.error('Download error:', error);
    }
  };

  const handleDownloadBOQOld = async (boq: any) => {
    try {
      // Fetch full BOQ details
      const result = await estimatorService.getBOQById(boq.boq_id);
      if (!result.success || !result.data) {
        toast.error('Failed to fetch BOQ details');
        return;
      }

      const boqData = result.data;
      const doc = new jsPDF();

      // Header
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Bill of Quantities (BOQ)', 14, 20);

      // BOQ Info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`BOQ Name: ${boqData.boq_name || 'N/A'}`, 14, 30);
      doc.text(`Project: ${boqData.project_details?.project_name || 'N/A'}`, 14, 36);
      doc.text(`Location: ${boqData.project_details?.location || 'N/A'}`, 14, 42);
      doc.text(`Status: ${boqData.status || 'N/A'}`, 14, 48);
      doc.text(`Created: ${boqData.created_at ? format(new Date(boqData.created_at), 'dd MMM yyyy') : 'N/A'}`, 14, 54);

      let currentY = 64;

      // Items
      boqData.items?.forEach((item: any, index: number) => {
        // Check if we need a new page
        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }

        // Item Header
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`${index + 1}. ${item.item_name}`, 14, currentY);
        currentY += 6;

        if (item.description) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'italic');
          doc.text(`${item.description}`, 20, currentY);
          currentY += 6;
        }

        // Materials Table
        if (item.materials && item.materials.length > 0) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('Materials:', 20, currentY);
          currentY += 6;

          autoTable(doc, {
            startY: currentY,
            head: [['Material', 'Quantity', 'Unit', 'Unit Price', 'Total']],
            body: item.materials.map((m: any) => [
              m.material_name,
              m.quantity.toFixed(2),
              m.unit,
              `AED ${m.unit_price.toFixed(2)}`,
              `AED ${m.total_price.toFixed(2)}`
            ]),
            margin: { left: 20 },
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246], fontSize: 9 },
            bodyStyles: { fontSize: 8 },
          });

          currentY = (doc as any).lastAutoTable.finalY + 6;
        }

        // Labour Table
        if (item.labour && item.labour.length > 0) {
          if (currentY > 250) {
            doc.addPage();
            currentY = 20;
          }

          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('Labour:', 20, currentY);
          currentY += 6;

          autoTable(doc, {
            startY: currentY,
            head: [['Role', 'Hours', 'Rate/Hour', 'Total']],
            body: item.labour.map((l: any) => [
              l.labour_role,
              l.hours.toFixed(2),
              `AED ${l.rate_per_hour.toFixed(2)}`,
              `AED ${l.total_cost.toFixed(2)}`
            ]),
            margin: { left: 20 },
            theme: 'grid',
            headStyles: { fillColor: [249, 115, 22], fontSize: 9 },
            bodyStyles: { fontSize: 8 },
          });

          currentY = (doc as any).lastAutoTable.finalY + 6;
        }

        // Item Costs
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Base Cost: AED ${item.base_cost?.toFixed(2) || '0.00'}`, 20, currentY);
        currentY += 5;
        doc.text(`Overhead (${item.overhead_percentage || 0}%): AED ${item.overhead_amount?.toFixed(2) || '0.00'}`, 20, currentY);
        currentY += 5;
        doc.text(`Profit Margin (${item.profit_margin_percentage || 0}%): AED ${item.profit_margin_amount?.toFixed(2) || '0.00'}`, 20, currentY);
        currentY += 5;
        doc.setFont('helvetica', 'bold');
        doc.text(`Selling Price: AED ${item.selling_price?.toFixed(2) || '0.00'}`, 20, currentY);
        currentY += 10;
      });

      // Summary
      if (currentY > 240) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', 14, currentY);
      currentY += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Items: ${boqData.summary?.total_items || 0}`, 20, currentY);
      currentY += 6;
      doc.text(`Total Materials: ${boqData.summary?.total_materials || 0}`, 20, currentY);
      currentY += 6;
      doc.text(`Total Labour: ${boqData.summary?.total_labour || 0}`, 20, currentY);
      currentY += 6;
      doc.text(`Material Cost: AED ${boqData.summary?.total_material_cost?.toFixed(2) || '0.00'}`, 20, currentY);
      currentY += 6;
      doc.text(`Labour Cost: AED ${boqData.summary?.total_labour_cost?.toFixed(2) || '0.00'}`, 20, currentY);
      currentY += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`Total Cost: AED ${boqData.summary?.total_cost?.toFixed(2) || '0.00'}`, 20, currentY);
      currentY += 6;
      doc.text(`Selling Price: AED ${boqData.summary?.selling_price?.toFixed(2) || '0.00'}`, 20, currentY);

      // Save PDF
      const fileName = `BOQ_${boqData.boq_name?.replace(/[^a-z0-9]/gi, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      doc.save(fileName);

      toast.success('BOQ downloaded successfully');
    } catch (error) {
      console.error('Error downloading BOQ:', error);
      toast.error('Failed to download BOQ');
    }
  };

  const getStatusBadge = (status: string, clientRejectionReason?: string) => {
    const normalizedStatus = status?.toLowerCase().replace('_', '') || 'draft';
    const config: Record<string, { className: string; icon: any; label?: string }> = {
      draft: { className: 'bg-gray-50 text-gray-600 border-gray-200', icon: FileText },
      inreview: { className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
      approved: { className: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
      sentforconfirmation: { className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Send },
      pending: { className: 'bg-orange-50 text-orange-700 border-orange-200', icon: Clock },
      pendingrevision: { className: 'bg-red-50 text-red-700 border-red-200', icon: Clock, label: 'PENDING REVISION' },
      underrevision: { className: 'bg-red-50 text-red-700 border-red-200', icon: Edit, label: 'UNDER REVISION' },
      rejected: { className: 'bg-red-50 text-red-700 border-red-200', icon: AlertCircle },
      clientrejected: { className: 'bg-red-50 text-red-700 border-red-200', icon: AlertCircle },
      clientcancelled: {
        className: 'bg-gray-100 text-gray-700 border-gray-300',
        icon: XCircleIcon,
        label: 'CLIENT CANCELLED'
      }
    };

    const { className, icon: Icon, label } = config[normalizedStatus] || config.draft;
    const tooltipText = clientRejectionReason ? `Client Rejection Reason: ${clientRejectionReason}` : undefined;

    return (
      <Badge
        variant="outline"
        className={`${className} flex items-center gap-1 border cursor-help`}
        title={tooltipText}
      >
        <Icon className="h-3 w-3" />
        {label || status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const BOQCard = ({ boq }: { boq: BOQ }) => {
    // Check BOQ workflow status - Use status field as PRIMARY indicator
    const status = boq.status?.toLowerCase() || '';

    // Get revision number from database
    const revisionNumber = boq.revision_number || 0;

    // Draft: Not sent to TD/PM yet (can edit/delete/send) - status NOT in workflow states
    const isDraft = !status || status === 'draft' || (status !== 'pending' && status !== 'pending_pm_approval' && status !== 'pending_td_approval' && status !== 'pm_approved' && status !== 'pending_revision' && status !== 'under_revision' && status !== 'approved' && status !== 'revision_approved' && status !== 'sent_for_confirmation' && status !== 'client_confirmed' && status !== 'rejected' && status !== 'completed' && status !== 'client_rejected' && status !== 'client_cancelled');
    // Sent to TD or PM: Waiting for approval
    const isSentToTD = status === 'pending' || status === 'pending_pm_approval';
    // PM Approved: Ready to send to TD for final approval
    const isPMApproved = status === 'pm_approved';
    // Pending TD Approval: Sent to TD after PM approval
    const isPendingTDApproval = status === 'pending_td_approval';
    // Pending Revision: Revised BOQ sent to TD for approval
    const isPendingRevision = status === 'pending_revision';
    // Under Revision: BOQ edited, ready to send to TD
    const isUnderRevision = status === 'under_revision';
    // Approved by TD: Ready to send to client
    const isApprovedByTD = status === 'approved';
    // Revision Approved: TD approved revision, ready to send to client
    const isRevisionApproved = status === 'revision_approved';
    // Sent to client: Waiting for client confirmation
    const isSentToClient = status === 'sent_for_confirmation';
    // Client confirmed: Ready for TD to assign PM
    const isClientConfirmed = status === 'client_confirmed';
    // TD rejected: Rejected by Technical Director, can edit and resend
    const isTDRejected = status === 'rejected';
    // Client rejected: Can be edited and resent OR cancelled
    const isClientRejected = status === 'client_rejected';
    // Client cancelled: Permanently cancelled, no actions allowed
    const isClientCancelled = status === 'client_cancelled';
    // Can Edit: Estimator can edit BOQ if it's draft OR approved OR sent to client OR any revision status
    const canEdit = isDraft || isApprovedByTD || isRevisionApproved || isSentToClient || isUnderRevision || isPendingRevision;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200"
      >
        {/* Header */}
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 flex-1">
              <h3 className="font-semibold text-gray-900 text-base">{boq.title}</h3>
              {revisionNumber > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                  Rev {revisionNumber}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                onClick={() => {
                  setSelectedBoqForDetails(boq);
                  setShowBoqDetails(true);
                }}
                title="View Details"
              >
                <Eye className="h-4 w-4" />
              </button>
              {canEdit && (
                <button
                  className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-all"
                  onClick={() => {
                    setEditingBoq(boq);
                    setShowBoqEdit(true);
                  }}
                  title="Edit BOQ"
                >
                  <Edit className="h-4 w-4" />
                </button>
              )}
              {isDraft && (
                <button
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                  onClick={() => setDeletingBoq(boq)}
                  title="Delete BOQ"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              <span className="truncate">{boq.project?.name || 'No project'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-gray-400" />
              <span className="truncate">{boq.project?.client || 'No client'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              <span className="truncate">{boq.project?.location || 'No location'}</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 pb-3 text-center text-sm">
          <span className="font-bold text-blue-600 text-lg">{boq.total_cost ? formatCurrency(boq.total_cost) : 'AED 0'}</span>
          <span className="text-gray-600 ml-1 text-xs">Total Value</span>
        </div>

        {/* Info */}
        <div className="px-4 pb-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Status:</span>
            {getStatusBadge(boq.status, boq.client_rejection_reason)}
          </div>
          {boq.created_at && (
            <div className="flex justify-between">
              <span className="text-gray-500">Created:</span>
              <span className="font-medium text-gray-700">{format(new Date(boq.created_at), 'dd MMM yyyy')}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={`border-t border-gray-200 p-2 sm:p-3 grid ${isClientRejected ? 'grid-cols-3' : 'grid-cols-3'} gap-1 sm:gap-2`}>
          <button
            className="text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 font-semibold px-1"
            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
            onClick={() => {
              setSelectedBoqForDetails(boq);
              setShowBoqDetails(true);
            }}
          >
            <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">View Details</span>
            <span className="sm:hidden">View</span>
          </button>

          {/* Draft BOQs - Can edit and send to TD */}
          {isDraft ? (
            <>
              <button
                className="bg-transparent border-2 border-green-500 text-green-600 text-[10px] sm:text-xs h-8 rounded transition-all duration-300 flex items-center justify-center gap-0.5 sm:gap-1 font-semibold px-1"
                style={{ boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.15)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#22c55e';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#22c55e';
                }}
                onClick={() => {
                  setEditingBoq(boq);
                  setShowBoqEdit(true);
                }}
              >
                <Edit className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Edit BOQ</span>
                <span className="sm:hidden">Edit</span>
              </button>
              <button
                className="text-red-900 text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 px-1 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 shadow-sm"
                onClick={() => {
                  setBoqToEmail(boq);
                  setEmailMode('td'); // Set mode to TD
                  setShowSendEmailModal(true);
                }}
              >
                <Mail className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Send to TD</span>
                <span className="sm:hidden">To TD</span>
              </button>
            </>
          ) : isSentToTD || isPendingTDApproval ? (
            /* Sent to TD/PM - waiting for approval */
            <div className="col-span-2 flex items-center justify-center text-xs text-gray-500">
              <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
              {isPendingTDApproval ? 'Pending TD Approval' : 'Sent to BOQ'}
            </div>
          ) : isPMApproved ? (
            /* PM Approved - Can send to TD */
            <>
              <button
                className="text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 px-1"
                style={{ backgroundColor: 'rgb(34, 197, 94)' }}
                onClick={() => {
                  setEditingBoq(boq);
                  setShowBoqEdit(true);
                }}
              >
                <Edit className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Edit BOQ</span>
                <span className="sm:hidden">Edit</span>
              </button>
              <button
                className="text-blue-900 text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 px-1 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 shadow-sm"
                onClick={async () => {
                  setSendingToTD(true);
                  try {
                    const result = await estimatorService.sendBOQToTechnicalDirector(boq.boq_id!);
                    if (result.success) {
                      toast.success('BOQ sent to Technical Director successfully!');
                      loadBOQs();
                    } else {
                      toast.error(result.message);
                    }
                  } catch (error) {
                    toast.error('Failed to send BOQ to TD');
                  } finally {
                    setSendingToTD(false);
                  }
                }}
                disabled={sendingToTD}
                title="Send to Technical Director for final approval"
              >
                <Send className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">{sendingToTD ? 'Sending...' : 'Send to TD'}</span>
                <span className="sm:hidden">{sendingToTD ? '...' : 'TD'}</span>
              </button>
            </>
          ) : isPendingRevision ? (
            /* Revision sent to TD - waiting for approval */
            <div className="col-span-2 flex items-center justify-center text-xs text-red-700 font-medium">
              <Clock className="h-4 w-4 text-red-600 mr-1" />
              Revision Pending TD Approval
            </div>
          ) : isUnderRevision ? (
            /* Under Revision - edited and ready to send to TD */
            <>
              <button
                className="text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 px-1"
                style={{ backgroundColor: 'rgb(34, 197, 94)' }}
                onClick={() => {
                  setEditingBoq(boq);
                  setIsRevisionEdit(true); // Set flag for revision edit
                  setShowBoqEdit(true);
                }}
              >
                <Edit className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Edit Again</span>
                <span className="sm:hidden">Edit</span>
              </button>
              <button
                className="text-red-900 text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 px-1 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 shadow-sm"
                onClick={async () => {
                  const result = await estimatorService.sendBOQEmail(boq.boq_id!, { comments: 'Sending revised BOQ for review' });
                  if (result.success) {
                    toast.success('Revision sent to Technical Director successfully!');
                    loadBOQs();
                  } else {
                    toast.error(result.message || 'Failed to send revision');
                  }
                }}
                title="Send revised BOQ to Technical Director for approval"
              >
                <Mail className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Send to TD</span>
                <span className="sm:hidden">To TD</span>
              </button>
            </>
          ) : isSentToClient ? (
            /* Sent to client - waiting for client confirmation */
            <>
              <button
                className="text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1 px-1"
                style={{ backgroundColor: 'rgb(34, 197, 94)' }}
                onClick={async () => {
                  const result = await estimatorService.confirmClientApproval(boq.boq_id!);
                  if (result.success) {
                    toast.success(result.message);
                    loadBOQs(); // Refresh list
                  } else {
                    toast.error(result.message);
                  }
                }}
              >
                <CheckCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Client Approved</span>
                <span className="sm:hidden">Approved</span>
              </button>
              <button
                className="text-red-900 text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1 px-1 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 shadow-sm"
                onClick={() => {
                  setSelectedBoqForRevision(boq);
                  setShowRevisionModal(true);
                }}
              >
                <Edit className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Revisions</span>
                <span className="sm:hidden">Revise</span>
              </button>
              <button
                className="text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1 px-1"
                style={{ backgroundColor: 'rgb(239, 68, 68)' }}
                onClick={() => {
                  setBoqToCancel(boq);
                  setShowCancelModal(true);
                }}
              >
                <XCircleIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cancel</span>
                <span className="sm:hidden">Cancel</span>
              </button>
            </>
          ) : isClientConfirmed ? (
            /* Client confirmed - check if PM is assigned */
            boq.pm_assigned ? (
              <div className="col-span-2 flex items-center justify-center text-xs text-blue-700 font-medium">
                <UserIcon className="h-4 w-4 text-blue-600 mr-1" />
                PM Assigned
              </div>
            ) : (
              <div className="col-span-2 flex items-center justify-center text-xs text-green-700 font-medium">
                <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
                Client Approved
              </div>
            )
          ) : isClientRejected ? (
            /* Client rejected - can revise, send to TD, or cancel project */
            <>
              <button
                className="text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 px-1"
                style={{ backgroundColor: 'rgb(34, 197, 94)' }}
                onClick={() => {
                  setEditingBoq(boq);
                  setShowBoqEdit(true);
                }}
              >
                <Edit className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Revise BOQ</span>
                <span className="sm:hidden">Edit</span>
              </button>
              <button
                className="text-red-900 text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 px-1 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 shadow-sm"
                onClick={() => {
                  setBoqToSendToTD(boq);
                  setShowSendToTDPopup(true);
                }}
                title="Send revised BOQ to Technical Director for approval"
                disabled={isSendingToTD}
              >
                {isSendingToTD ? (
                  <div className="animate-spin rounded-full h-3 w-3 sm:h-3.5 sm:w-3.5 border-b-2 border-red-900"></div>
                ) : (
                  <Mail className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                )}
                <span className="hidden sm:inline">Send to TD</span>
                <span className="sm:hidden">To TD</span>
              </button>
              <button
                className="text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 px-1"
                style={{ backgroundColor: 'rgb(239, 68, 68)' }}
                onClick={() => {
                  setBoqToCancel(boq);
                  setShowCancelModal(true);
                }}
                title="Cancel this project permanently"
              >
                <XCircleIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Cancel</span>
                <span className="sm:hidden">Cancel</span>
              </button>
            </>
          ) : isClientCancelled ? (
            /* Client cancelled - No actions allowed, permanently cancelled */
            <div className="col-span-2 flex items-center justify-center text-xs text-gray-500">
              <XCircleIcon className="h-4 w-4 text-gray-600 mr-1" />
              Project Permanently Cancelled
            </div>
          ) : isTDRejected ? (
            /* TD Rejected - Can only edit (after edit, popup will ask to send to TD) */
            <button
              className="col-span-2 text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 px-1"
              style={{ backgroundColor: 'rgb(34, 197, 94)' }}
              onClick={() => {
                setEditingBoq(boq);
                setShowBoqEdit(true);
              }}
            >
              <Edit className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Edit BOQ</span>
              <span className="sm:hidden">Edit</span>
            </button>
          ) : isApprovedByTD || isRevisionApproved ? (
            /* Approved by TD - Can send to client */
            <button
              className="col-span-2 text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1 px-2"
              style={{ backgroundColor: 'rgb(34, 197, 94)' }}
              onClick={() => {
                setBoqToEmail(boq);
                setEmailMode('client');
                setShowSendEmailModal(true);
              }}
            >
              <Mail className="h-3.5 w-3.5" />
              <span>{isRevisionApproved ? 'Send Revision to Client' : 'Send to Client'}</span>
            </button>
          ) : null}
        </div>
      </motion.div>
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
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span>{boq.title}</span>
                    {(boq.revision_number || 0) > 0 && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                        Rev {boq.revision_number}
                      </span>
                    )}
                  </div>
                </TableCell>
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
                <TableCell>{getStatusBadge(boq.status, boq.client_rejection_reason)}</TableCell>
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
                    {(() => {
                      const status = boq.status?.toLowerCase() || '';
                      const isDraft = !status || status === 'draft' || (status !== 'pending' && status !== 'pending_pm_approval' && status !== 'pending_revision' && status !== 'under_revision' && status !== 'approved' && status !== 'rejected' && status !== 'sent_for_confirmation' && status !== 'client_confirmed' && status !== 'completed' && status !== 'client_cancelled' && status !== 'client_rejected');
                      const isPendingRevision = status === 'pending_revision';
                      const isUnderRevision = status === 'under_revision';
                      const isApprovedByTD = status === 'approved';
                      const isRevisionApproved = status === 'revision_approved';
                      const isSentToClient = status === 'sent_for_confirmation';
                      const isClientConfirmed = status === 'client_confirmed';
                      const isClientRejected = status === 'client_rejected';
                      const isClientCancelled = status === 'client_cancelled';

                      if (isClientCancelled) {
                        return (
                          <span className="text-xs text-gray-600 font-medium flex items-center gap-1">
                            <XCircleIcon className="h-4 w-4" />
                            Cancelled
                          </span>
                        );
                      } else if (isPendingRevision) {
                        return (
                          <span className="text-xs text-red-700 font-medium flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            Revision Pending TD Approval
                          </span>
                        );
                      } else if (isUnderRevision) {
                        return (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => { setEditingBoq(boq); setIsRevisionEdit(true); setShowBoqEdit(true); }} className="h-8 w-8 p-0" title="Edit Again">
                              <Edit className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={async () => {
                              const result = await estimatorService.sendBOQEmail(boq.boq_id!, { comments: 'Sending revised BOQ for review' });
                              if (result.success) {
                                toast.success('Revision sent to Technical Director successfully!');
                                loadBOQs();
                              } else {
                                toast.error(result.message || 'Failed to send revision');
                              }
                            }} className="h-8 w-8 p-0" title="Send Revision to TD">
                              <Mail className="h-4 w-4 text-red-600" />
                            </Button>
                          </>
                        );
                      } else if (isClientRejected) {
                        return (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => { setEditingBoq(boq); setShowBoqEdit(true); }} className="h-8 w-8 p-0" title="Revise BOQ">
                              <Edit className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { setBoqToEmail(boq); setEmailMode('td'); setShowSendEmailModal(true); }} className="h-8 w-8 p-0" title="Send Revision to TD">
                              <Mail className="h-4 w-4 text-red-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { setBoqToCancel(boq); setShowCancelModal(true); }} className="h-8 w-8 p-0" title="Cancel Project">
                              <XCircleIcon className="h-4 w-4 text-red-600" />
                            </Button>
                          </>
                        );
                      } else if (isDraft) {
                        return (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => { setEditingBoq(boq); setShowBoqEdit(true); }} className="h-8 w-8 p-0" title="Edit BOQ">
                              <Edit className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { setBoqToEmail(boq); setEmailMode('td'); setShowSendEmailModal(true); }} className="h-8 w-8 p-0" title="Send to TD">
                              <Mail className="h-4 w-4 text-red-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeletingBoq(boq)} className="h-8 w-8 p-0" title="Delete BOQ">
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </>
                        );
                      } else if (isSentToClient) {
                        return (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => { setEditingBoq(boq); setShowBoqEdit(true); }} className="h-8 w-8 p-0" title="Edit BOQ">
                              <Edit className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={async () => { const result = await estimatorService.confirmClientApproval(boq.boq_id!); if (result.success) { toast.success(result.message); loadBOQs(); } else { toast.error(result.message); } }} className="h-8 px-2 text-green-600 hover:text-green-700 hover:bg-green-50" title="Client Approved">
                              <CheckCircle className="h-4 w-4 mr-1" />
                              <span className="text-xs">Approved</span>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedBoqForRevision(boq); setShowRevisionModal(true); }} className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50" title="Revisions">
                              <Edit className="h-4 w-4 mr-1" />
                              <span className="text-xs">Revisions</span>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { setBoqToCancel(boq); setShowCancelModal(true); }} className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50" title="Cancel Project">
                              <XCircleIcon className="h-4 w-4 mr-1" />
                              <span className="text-xs">Cancel</span>
                            </Button>
                          </>
                        );
                      } else if (isClientConfirmed) {
                        return boq.pm_assigned ? (
                          <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                            <UserIcon className="h-4 w-4" />
                            PM Assigned
                          </span>
                        ) : (
                          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                            <CheckCircle className="h-4 w-4" />
                            Client Approved
                          </span>
                        );
                      } else if (isApprovedByTD || boq.status?.toLowerCase() === 'revision_approved') {
                        const isRevApproved = boq.status?.toLowerCase() === 'revision_approved';
                        return (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setEditingBoq(boq); setIsRevisionEdit(isRevApproved); setShowBoqEdit(true); }}
                              className="h-8 w-8 p-0"
                              title="Edit BOQ"
                            >
                              <Edit className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setBoqToEmail(boq); setEmailMode('client'); setShowSendEmailModal(true); }}
                              className="h-8 px-3 text-green-600 hover:text-green-700"
                              title={isRevApproved ? "Send Revision to Client" : "Send to Client"}
                            >
                              <Send className="h-4 w-4 mr-1" />
                              <span className="text-xs">{isRevApproved ? 'Send Revision' : 'Send to Client'}</span>
                            </Button>
                          </>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  if (!initialLoadComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse" color="blue" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header - Match TD Style */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
              <FolderOpen className="w-6 h-6 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-[#243d8a]">Projects & BOQ Management</h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Search Bar with Controls */}
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 max-w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by title, project, or client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-gray-200 focus:border-gray-300 focus:ring-0 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <Button
                size="sm"
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                className={`h-8 px-2 sm:px-3 ${viewMode === 'cards' ? 'text-white hover:opacity-90' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'}`}
                style={viewMode === 'cards' ? { backgroundColor: 'rgb(36, 61, 138)' } : {}}
                onClick={() => {
                  setViewMode('cards');
                  setCurrentPage(1);
                }}
              >
                <LayoutGrid className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Cards</span>
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                className={`h-8 px-2 sm:px-3 ${viewMode === 'table' ? 'text-white hover:opacity-90' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'}`}
                style={viewMode === 'table' ? { backgroundColor: 'rgb(36, 61, 138)' } : {}}
                onClick={() => {
                  setViewMode('table');
                  setCurrentPage(1);
                }}
              >
                <List className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Table</span>
              </Button>
            </div>

            {/* New Project Button */}
            <Button
              onClick={() => setShowProjectDialog(true)}
              className="bg-red-600 hover:bg-red-700 text-white shadow-md h-8 whitespace-nowrap"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="text-xs sm:text-sm">New Project</span>
            </Button>
          </div>
        </div>

        {/* Content Tabs - Match TD Style */}
        <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start p-0 h-auto bg-transparent border-b border-gray-200 mb-6">
              <TabsTrigger
                value="projects"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Pending</span>
                <span className="sm:hidden">Pending</span>
                <span className="ml-1 sm:ml-2 text-gray-400">({projects.filter(p => {
                  const projectBoqs = boqs.filter(boq => boq.project?.project_id == p.project_id);
                  // Only show projects that have NO BOQs or only have draft BOQs
                  return projectBoqs.length === 0 || projectBoqs.every(boq => {
                    const status = boq.status?.toLowerCase() || '';
                    return !status || status === 'draft';
                  });
                }).length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="sent"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Send BOQ</span>
                <span className="sm:hidden">Sent</span>
                <span className="ml-1 sm:ml-2 text-gray-400">({boqs.filter(b => {
                  const status = b.status?.toLowerCase();
                  return status === 'pending' || status === 'pending_pm_approval';
                }).length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="approved"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-400 data-[state=active]:text-green-500 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Approved BOQ</span>
                <span className="sm:hidden">Approved</span>
                <span className="ml-1 sm:ml-2 text-gray-400">({boqs.filter(b => {
                  const s = b.status?.toLowerCase();
                  return s === 'approved' || s === 'sent_for_confirmation' || s === 'client_confirmed' || s === 'client_rejected';
                }).length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="revisions"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-600 data-[state=active]:text-red-600 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Revisions</span>
                <span className="sm:hidden">Revisions</span>
                <span className="ml-1 sm:ml-2 text-gray-400">({boqs.filter(b => {
                  const s = b.status?.toLowerCase();
                  return s === 'under_revision' || s === 'pending_revision' || s === 'revision_approved';
                }).length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="rejected"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-400 data-[state=active]:text-red-500 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Rejected BOQ</span>
                <span className="sm:hidden">Rejected</span>
                <span className="ml-1 sm:ml-2 text-gray-400">({boqs.filter(b => {
                  const s = b.status?.toLowerCase();
                  return s === 'rejected' || s === 'client_rejected';
                }).length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="completed"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:text-green-700 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Completed BOQ</span>
                <span className="sm:hidden">Completed</span>
                <span className="ml-1 sm:ml-2 text-gray-400">({boqs.filter(b => b.status?.toLowerCase() === 'completed').length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="cancelled"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-600 data-[state=active]:text-gray-700 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Cancelled BOQ</span>
                <span className="sm:hidden">Cancelled</span>
                <span className="ml-1 sm:ml-2 text-gray-400">({boqs.filter(b => b.status?.toLowerCase() === 'client_cancelled').length})</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="projects" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Pending Projects</h2>

                {(() => {
                  // Pagination logic - backend returns paginated data
                  const totalPages = Math.ceil(totalProjects / itemsPerPage);
                  const startIndex = (currentPage - 1) * itemsPerPage;

                  return (
                    <>
                      {viewMode === 'cards' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                  {filteredProjects
                    .filter(project => {
                      // Only show projects that have NO BOQs or only have draft BOQs
                      const projectBoqs = boqs.filter(boq => boq.project?.project_id == project.project_id);
                      return projectBoqs.length === 0 || projectBoqs.every(boq => {
                        const status = boq.status?.toLowerCase() || '';
                        return !status || status === 'draft';
                      });
                    })
                    .map((project, index) => {
                    // Count BOQs for this project
                    const projectBoqs = boqs.filter(boq => boq.project?.project_id == project.project_id);
                    const boqCount = projectBoqs.length;
                    const hasSentBoq = projectBoqs.some(boq =>
                      boq.email_sent === true ||
                      boq.status?.toLowerCase() === 'pending' ||
                      boq.status?.toLowerCase() === 'sent_for_confirmation'
                    );

                    return (
                    <motion.div
                      key={project.project_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 * index }}
                      className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200"
                    >
                      {/* Header */}
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-gray-900 text-base flex-1">{project.project_name}</h3>
                          <div className="flex items-center gap-1">
                            <button
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                              onClick={() => {
                                setEditingProject(project);
                                setShowProjectDialog(true);
                              }}
                              title="Edit Project"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                              onClick={() => setDeletingProject(project)}
                              title="Delete Project"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1 text-sm text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-gray-400" />
                            <span className="truncate">{project.client || 'No client'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-gray-400" />
                            <span className="truncate">{project.location || 'No location'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="px-4 pb-3 text-center text-sm">
                        <span className="font-bold text-blue-600 text-lg">{boqCount}</span>
                        <span className="text-gray-600 ml-1">BOQ Items</span>
                      </div>

                      {/* Info */}
                      <div className="px-4 pb-3 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Work Type:</span>
                          <span className="font-medium text-gray-700">{project.work_type || 'Contract'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Site Engineer:</span>
                          <span className="font-medium text-gray-700">{project.site_engineer || 'Not Assigned'}</span>
                        </div>
                        {project.created_at && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Created:</span>
                            <span className="font-medium text-gray-700">{format(new Date(project.created_at), 'dd MMM yyyy')}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="border-t border-gray-200 p-2 sm:p-3 flex flex-wrap gap-1 sm:gap-2">
                        <button
                          className="flex-1 min-w-[80px] text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 font-semibold px-1"
                          style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          onClick={() => setViewingProject(project)}
                        >
                          <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          <span className="hidden sm:inline">View Details</span>
                          <span className="sm:hidden">View</span>
                        </button>
                        {boqCount === 0 ? (
                          <button
                            className="flex-1 min-w-[90px] bg-transparent border-2 border-red-500 text-red-600 text-[10px] sm:text-xs h-8 rounded transition-all duration-300 flex items-center justify-center gap-0.5 sm:gap-1 font-semibold px-1"
                            style={{
                              boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.15)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#ef4444';
                              e.currentTarget.style.color = 'white';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = '#ef4444';
                            }}
                            onClick={() => handleCreateBOQ(project)}
                          >
                            <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            <span className="hidden sm:inline">Create BOQ</span>
                            <span className="sm:hidden">Create</span>
                          </button>
                        ) : hasSentBoq ? (
                          <button
                            className="bg-green-100 text-green-600 text-[10px] sm:text-xs h-8 rounded cursor-not-allowed flex items-center justify-center gap-0.5 sm:gap-1 font-semibold px-1"
                            disabled
                            title="BOQ already sent to TD"
                          >
                            <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            <span className="hidden sm:inline">BOQ Sent</span>
                            <span className="sm:hidden">Sent</span>
                          </button>
                        ) : (
                          <button
                            className="bg-gray-100 text-gray-400 text-[10px] sm:text-xs h-8 rounded cursor-not-allowed flex items-center justify-center gap-0.5 sm:gap-1 font-semibold px-1"
                            disabled
                            title="BOQ already created for this project"
                          >
                            <FileText className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            <span className="hidden sm:inline">BOQ Created</span>
                            <span className="sm:hidden">Created</span>
                          </button>
                        )}
                        {!hasSentBoq && boqCount > 0 ? (
                          <>
                            <button
                              className="flex-1 min-w-[80px] text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 px-2 disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ backgroundColor: 'rgb(22, 163, 74)' }}
                              onClick={() => handleSendToTD(project)}
                              disabled={sendingToTD}
                              title="Send to Technical Director"
                            >
                              {sendingToTD ? (
                                <>
                                  <div className="scale-50">
                                    <ModernLoadingSpinners variant="dots" size="sm" color="white" />
                                  </div>
                                  <span className="hidden sm:inline">Sending...</span>
                                  <span className="sm:hidden">...</span>
                                </>
                              ) : (
                                <>
                                  <Send className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                  <span className="hidden sm:inline">Send to TD</span>
                                  <span className="sm:hidden">TD</span>
                                </>
                              )}
                            </button>
                            <button
                              className="flex-1 min-w-[80px] bg-gradient-to-r from-[#243d8a]/10 to-[#243d8a]/20 text-[#243d8a] text-[10px] sm:text-xs h-8 rounded hover:from-[#243d8a]/20 hover:to-[#243d8a]/30 transition-all flex items-center justify-center gap-0.5 sm:gap-1 px-2 disabled:opacity-50 disabled:cursor-not-allowed border border-[#243d8a]/20"
                              onClick={() => handleSendToPM(project)}
                              disabled={sendingToTD}
                              title="Send to Project Manager"
                            >
                              <Send className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              <span className="hidden sm:inline">Send to PM</span>
                              <span className="sm:hidden">PM</span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </motion.div>
                    );
                  })}

                  {projects.length === 0 && !searchTerm && (
                    <div className="col-span-full bg-gradient-to-br from-gray-50 to-blue-50/30 border-2 border-dashed border-blue-200 rounded-2xl">
                      <div className="flex flex-col items-center justify-center py-16">
                        <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full mb-4">
                          <FolderOpen className="h-12 w-12 text-blue-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">No projects yet</h3>
                        <p className="text-sm text-gray-500 mb-6">Create your first project to start managing BOQs</p>
                        <Button
                          onClick={() => setShowProjectDialog(true)}
                          className="bg-green-600 hover:bg-green-700 text-white shadow-md"
                        >
                          <Plus className="h-5 w-5 mr-2" />
                          Create First Project
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                ) : (
                  <div className="overflow-x-auto bg-white rounded-lg shadow-sm">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-red-50/50 border-b-2 border-red-100">
                          <TableHead className="text-black font-bold text-xs uppercase tracking-wider py-4 px-6 min-w-[200px]">Project</TableHead>
                          <TableHead className="text-black font-bold text-xs uppercase tracking-wider py-4 px-6 min-w-[180px]">Client & Location</TableHead>
                          <TableHead className="text-black font-bold text-xs uppercase tracking-wider py-4 px-6 min-w-[140px]">Work Type</TableHead>
                          <TableHead className="text-black font-bold text-xs uppercase tracking-wider py-4 px-6 text-center min-w-[100px]">BOQ Items</TableHead>
                          <TableHead className="text-black font-bold text-xs uppercase tracking-wider py-4 px-6 min-w-[100px]">Status</TableHead>
                          <TableHead className="text-black font-bold text-xs uppercase tracking-wider py-4 px-6 min-w-[120px]">Created</TableHead>
                          <TableHead className="text-black font-bold text-xs uppercase tracking-wider py-4 px-6 text-center min-w-[140px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProjects.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                              <div className="flex flex-col items-center">
                                <FolderOpen className="h-12 w-12 text-gray-300 mb-3" />
                                <p className="text-base">No projects found</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredProjects
                            .filter(project => {
                              // Filter out projects with sent BOQs from All Projects tab
                              const projectBoqs = boqs.filter(boq => boq.project?.project_id == project.project_id);
                              const hasSentBoq = projectBoqs.some(boq =>
                                boq.email_sent === true ||
                                boq.status?.toLowerCase() === 'pending' ||
                                boq.status?.toLowerCase() === 'sent_for_confirmation'
                              );
                              return !hasSentBoq;
                            })
                            .map((project) => {
                            const projectBoqs = boqs.filter(boq => boq.project?.project_id == project.project_id);
                            const boqCount = projectBoqs.length;
                            const hasSentBoq = projectBoqs.some(boq =>
                              boq.email_sent === true ||
                              boq.status?.toLowerCase() === 'pending' ||
                              boq.status?.toLowerCase() === 'sent_for_confirmation'
                            );

                            return (
                              <TableRow key={project.project_id} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors duration-150">
                                <TableCell className="py-5 px-6">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-50 rounded-lg">
                                      <Building2 className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <div className="max-w-[180px] break-words">
                                      <div className="font-semibold text-gray-900">{project.project_name}</div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="py-5 px-6">
                                  <div className="space-y-1">
                                    <div className="text-gray-900 font-medium break-words max-w-[160px]">{project.client || 'N/A'}</div>
                                    <div className="flex items-center gap-1.5 text-gray-500 text-sm">
                                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className="break-words">{project.location || 'N/A'}</span>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="py-5 px-6">
                                  <div className="text-gray-700 break-words max-w-[140px]">{project.work_type || 'N/A'}</div>
                                </TableCell>
                                <TableCell className="py-5 px-6 text-center">
                                  <div className="inline-flex items-center gap-1.5">
                                    <FileText className="h-4 w-4 text-gray-400" />
                                    <span className="font-semibold text-gray-900">{boqCount}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-5 px-6">
                                  <Badge className={`${project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'} px-3 py-1 rounded-full font-medium text-xs`}>
                                    {project.status || 'active'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="py-5 px-6">
                                  <div className="text-gray-600 text-sm whitespace-nowrap">
                                    {project.created_at ? format(new Date(project.created_at), 'dd MMM yyyy') : 'N/A'}
                                  </div>
                                </TableCell>
                                <TableCell className="py-5 px-6">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setViewingProject(project)}
                                      className="h-7 w-7 p-0 hover:bg-gray-100"
                                      title="View Details"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                    {boqCount === 0 ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleCreateBOQ(project)}
                                        className="h-7 w-7 p-0 hover:bg-green-50"
                                        title="Create BOQ"
                                      >
                                        <Plus className="h-3.5 w-3.5 text-green-600" />
                                      </Button>
                                    ) : hasSentBoq ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled
                                        className="h-7 w-7 p-0 cursor-not-allowed opacity-60"
                                        title="BOQ already sent to TD"
                                      >
                                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled
                                        className="h-7 w-7 p-0 cursor-not-allowed opacity-40"
                                        title="BOQ already created for this project"
                                      >
                                        <FileText className="h-3.5 w-3.5 text-gray-400" />
                                      </Button>
                                    )}
                                    {!hasSentBoq && boqCount > 0 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleSendToTD(project)}
                                        disabled={sendingToTD}
                                        className="h-7 w-7 p-0 hover:bg-green-50 disabled:opacity-50"
                                        title="Send to TD"
                                      >
                                        {sendingToTD ? (
                                          <div className="scale-[0.4]">
                                            <ModernLoadingSpinners variant="dots" size="sm" color="green" />
                                          </div>
                                        ) : (
                                          <Send className="h-3.5 w-3.5 text-green-600" />
                                        )}
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingProject(project);
                                        setShowProjectDialog(true);
                                      }}
                                      className="h-7 w-7 p-0 hover:bg-blue-50"
                                      title="Edit Project"
                                    >
                                      <Edit className="h-3.5 w-3.5 text-blue-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setDeletingProject(project)}
                                      className="h-7 w-7 p-0 hover:bg-red-50"
                                      title="Delete Project"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Pagination */}
                {totalProjects > itemsPerPage && (
                  <div className="flex items-center justify-between bg-white border-t border-gray-200 rounded-b-lg p-4 mt-6">
                    <div className="text-sm text-gray-600 font-medium">
                      Showing {startIndex + 1} to {Math.min(startIndex + filteredProjects.length, totalProjects)} of {totalProjects} projects
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        style={{ color: 'rgb(36, 61, 138)' }}
                      >
                        Previous
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`h-9 w-9 text-sm font-semibold rounded-lg border transition-colors ${
                            currentPage === page
                              ? 'border-[rgb(36,61,138)] bg-blue-50'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                          style={{ color: currentPage === page ? 'rgb(36, 61, 138)' : '#6b7280' }}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        style={{ color: 'rgb(36, 61, 138)' }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
                    </>
                  );
                })()}
              </div>
            </TabsContent>

            <TabsContent value="sent" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                {(() => {
                  const totalBoqPages = Math.ceil(filteredBOQs.length / itemsPerPage);
                  const startIndex = (boqCurrentPage - 1) * itemsPerPage;
                  const endIndex = startIndex + itemsPerPage;
                  const paginatedBOQs = filteredBOQs.slice(startIndex, endIndex);

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900">BOQs Sent for Review</h2>
                        <div className="text-xs sm:text-sm text-gray-600">
                          {filteredBOQs.length} BOQ{filteredBOQs.length !== 1 ? 's' : ''} pending review
                        </div>
                      </div>
                      {viewMode === 'cards' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {paginatedBOQs.map((boq) => (
                            <BOQCard key={boq.boq_id} boq={boq} />
                          ))}
                        </div>
                      ) : (
                        <BOQTable boqList={paginatedBOQs} />
                      )}

                      {/* Pagination Controls */}
                      {totalBoqPages > 1 && (
                        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                          <div className="text-sm text-gray-600">
                            Showing {startIndex + 1} to {Math.min(endIndex, filteredBOQs.length)} of {filteredBOQs.length} BOQs
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setBoqCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={boqCurrentPage === 1}
                              className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              style={{ color: 'rgb(36, 61, 138)' }}
                            >
                              Previous
                            </button>
                            {Array.from({ length: totalBoqPages }, (_, i) => i + 1).map(page => (
                              <button
                                key={page}
                                onClick={() => setBoqCurrentPage(page)}
                                className={`h-9 w-9 text-sm font-semibold rounded-lg border transition-colors ${
                                  boqCurrentPage === page
                                    ? 'border-[rgb(36,61,138)] bg-blue-50'
                                    : 'border-gray-300 hover:bg-gray-50'
                                }`}
                                style={{ color: boqCurrentPage === page ? 'rgb(36, 61, 138)' : '#6b7280' }}
                              >
                                {page}
                              </button>
                            ))}
                            <button
                              onClick={() => setBoqCurrentPage(prev => Math.min(totalBoqPages, prev + 1))}
                              disabled={boqCurrentPage === totalBoqPages}
                              className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              style={{ color: 'rgb(36, 61, 138)' }}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </TabsContent>

            <TabsContent value="approved" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                {(() => {
                  const totalBoqPages = Math.ceil(filteredBOQs.length / itemsPerPage);
                  const startIndex = (boqCurrentPage - 1) * itemsPerPage;
                  const endIndex = startIndex + itemsPerPage;
                  const paginatedBOQs = filteredBOQs.slice(startIndex, endIndex);

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Approved BOQs</h2>
                        <div className="text-xs sm:text-sm text-gray-600">
                          {filteredBOQs.length} BOQ{filteredBOQs.length !== 1 ? 's' : ''} approved by Technical Director
                        </div>
                      </div>
                      {viewMode === 'cards' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {paginatedBOQs.map((boq) => (
                            <BOQCard key={boq.boq_id} boq={boq} />
                          ))}
                        </div>
                      ) : (
                        <BOQTable boqList={paginatedBOQs} />
                      )}

                      {/* Pagination Controls */}
                      {totalBoqPages > 1 && (
                        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                          <div className="text-sm text-gray-600">
                            Showing {startIndex + 1} to {Math.min(endIndex, filteredBOQs.length)} of {filteredBOQs.length} BOQs
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setBoqCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={boqCurrentPage === 1}
                              className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              style={{ color: 'rgb(36, 61, 138)' }}
                            >
                              Previous
                            </button>
                            {Array.from({ length: totalBoqPages }, (_, i) => i + 1).map(page => (
                              <button
                                key={page}
                                onClick={() => setBoqCurrentPage(page)}
                                className={`h-9 w-9 text-sm font-semibold rounded-lg border transition-colors ${
                                  boqCurrentPage === page
                                    ? 'border-[rgb(36,61,138)] bg-blue-50'
                                    : 'border-gray-300 hover:bg-gray-50'
                                }`}
                                style={{ color: boqCurrentPage === page ? 'rgb(36, 61, 138)' : '#6b7280' }}
                              >
                                {page}
                              </button>
                            ))}
                            <button
                              onClick={() => setBoqCurrentPage(prev => Math.min(totalBoqPages, prev + 1))}
                              disabled={boqCurrentPage === totalBoqPages}
                              className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              style={{ color: 'rgb(36, 61, 138)' }}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </TabsContent>

            <TabsContent value="revisions" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                {/* Dynamic Revision Tabs */}
                <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-200">
                  {loadingRevisionTabs ? (
                    <div className="text-sm text-gray-500">Loading revision tabs...</div>
                  ) : (
                    <>
                      <button
                        onClick={() => setSelectedRevisionTab('all')}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                          selectedRevisionTab === 'all'
                            ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        All {filteredBOQs.length > 0 && `(${filteredBOQs.length})`}
                      </button>
                      {/* Reverse order: highest revision first, Initial Review last */}
                      {[...revisionTabs].reverse().map((tab) => (
                        <button
                          key={tab.revision_number}
                          onClick={() => setSelectedRevisionTab(tab.revision_number)}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                            selectedRevisionTab === tab.revision_number
                              ? tab.alert_level === 'critical'
                                ? 'bg-red-100 text-red-700 ring-2 ring-red-500'
                                : tab.alert_level === 'warning'
                                ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-500'
                                : 'bg-green-100 text-green-700 ring-2 ring-green-500'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {tab.revision_number === 0 ? 'Initial Review' : `Rev ${tab.revision_number}`} ({tab.project_count})
                        </button>
                      ))}
                    </>
                  )}
                </div>

                {/* BOQ List */}
                {(() => {
                  // Filter BOQs by selected revision tab
                  let displayBOQs = filteredBOQs;
                  if (selectedRevisionTab !== 'all') {
                    displayBOQs = filteredBOQs.filter(boq => {
                      const revisionNumber = boq.revision_number || 0;
                      return revisionNumber === selectedRevisionTab;
                    });
                  }

                  const totalBoqPages = Math.ceil(displayBOQs.length / itemsPerPage);
                  const startIndex = (boqCurrentPage - 1) * itemsPerPage;
                  const endIndex = startIndex + itemsPerPage;
                  const paginatedBOQs = displayBOQs.slice(startIndex, endIndex);

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                          {selectedRevisionTab === 'all'
                            ? 'All BOQs in Revision'
                            : selectedRevisionTab === 0
                            ? 'Initial Review - First Time Revisions'
                            : `Revision ${selectedRevisionTab} - Projects`
                          }
                        </h2>
                        <div className="text-xs sm:text-sm text-gray-600">
                          {displayBOQs.length} BOQ{displayBOQs.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      {viewMode === 'cards' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {paginatedBOQs.map((boq) => (
                            <BOQCard key={boq.boq_id} boq={boq} />
                          ))}
                        </div>
                      ) : (
                        <BOQTable boqList={paginatedBOQs} />
                      )}

                      {/* Pagination */}
                      {totalBoqPages > 1 && (
                        <div className="flex items-center justify-between pt-4">
                          <button
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 text-sm"
                            onClick={() => setBoqCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={boqCurrentPage === 1}
                          >
                            Previous
                          </button>
                          <span className="text-sm text-gray-600">
                            Page {boqCurrentPage} of {totalBoqPages}
                          </span>
                          <button
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 text-sm"
                            onClick={() => setBoqCurrentPage(prev => Math.min(totalBoqPages, prev + 1))}
                            disabled={boqCurrentPage === totalBoqPages}
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </TabsContent>

            <TabsContent value="rejected" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                {(() => {
                  const totalBoqPages = Math.ceil(filteredBOQs.length / itemsPerPage);
                  const startIndex = (boqCurrentPage - 1) * itemsPerPage;
                  const endIndex = startIndex + itemsPerPage;
                  const paginatedBOQs = filteredBOQs.slice(startIndex, endIndex);

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Rejected BOQs</h2>
                        <div className="text-xs sm:text-sm text-gray-600">
                          {filteredBOQs.length} BOQ{filteredBOQs.length !== 1 ? 's' : ''} rejected by Technical Director
                        </div>
                      </div>
                      {viewMode === 'cards' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {paginatedBOQs.map((boq) => (
                            <BOQCard key={boq.boq_id} boq={boq} />
                          ))}
                        </div>
                      ) : (
                        <BOQTable boqList={paginatedBOQs} />
                      )}

                      {/* Pagination Controls */}
                      {totalBoqPages > 1 && (
                        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                          <div className="text-sm text-gray-600">
                            Showing {startIndex + 1} to {Math.min(endIndex, filteredBOQs.length)} of {filteredBOQs.length} BOQs
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setBoqCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={boqCurrentPage === 1}
                              className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              style={{ color: 'rgb(36, 61, 138)' }}
                            >
                              Previous
                            </button>
                            {Array.from({ length: totalBoqPages }, (_, i) => i + 1).map(page => (
                              <button
                                key={page}
                                onClick={() => setBoqCurrentPage(page)}
                                className={`h-9 w-9 text-sm font-semibold rounded-lg border transition-colors ${
                                  boqCurrentPage === page
                                    ? 'border-[rgb(36,61,138)] bg-blue-50'
                                    : 'border-gray-300 hover:bg-gray-50'
                                }`}
                                style={{ color: boqCurrentPage === page ? 'rgb(36, 61, 138)' : '#6b7280' }}
                              >
                                {page}
                              </button>
                            ))}
                            <button
                              onClick={() => setBoqCurrentPage(prev => Math.min(totalBoqPages, prev + 1))}
                              disabled={boqCurrentPage === totalBoqPages}
                              className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              style={{ color: 'rgb(36, 61, 138)' }}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </TabsContent>

            <TabsContent value="completed" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                {(() => {
                  const totalBoqPages = Math.ceil(filteredBOQs.length / itemsPerPage);
                  const startIndex = (boqCurrentPage - 1) * itemsPerPage;
                  const endIndex = startIndex + itemsPerPage;
                  const paginatedBOQs = filteredBOQs.slice(startIndex, endIndex);

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Completed BOQs</h2>
                        <div className="text-xs sm:text-sm text-gray-600">
                          {filteredBOQs.length} BOQ{filteredBOQs.length !== 1 ? 's' : ''} marked as completed
                        </div>
                      </div>
                      {viewMode === 'cards' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {paginatedBOQs.map((boq) => (
                            <BOQCard key={boq.boq_id} boq={boq} />
                          ))}
                        </div>
                      ) : (
                        <BOQTable boqList={paginatedBOQs} />
                      )}

                      {/* Pagination Controls */}
                      {totalBoqPages > 1 && (
                        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                          <div className="text-sm text-gray-600">
                            Showing {startIndex + 1} to {Math.min(endIndex, filteredBOQs.length)} of {filteredBOQs.length} BOQs
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setBoqCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={boqCurrentPage === 1}
                              className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              style={{ color: 'rgb(36, 61, 138)' }}
                            >
                              Previous
                            </button>
                            {Array.from({ length: totalBoqPages }, (_, i) => i + 1).map(page => (
                              <button
                                key={page}
                                onClick={() => setBoqCurrentPage(page)}
                                className={`h-9 w-9 text-sm font-semibold rounded-lg border transition-colors ${
                                  boqCurrentPage === page
                                    ? 'border-[rgb(36,61,138)] bg-blue-50'
                                    : 'border-gray-300 hover:bg-gray-50'
                                }`}
                                style={{ color: boqCurrentPage === page ? 'rgb(36, 61, 138)' : '#6b7280' }}
                              >
                                {page}
                              </button>
                            ))}
                            <button
                              onClick={() => setBoqCurrentPage(prev => Math.min(totalBoqPages, prev + 1))}
                              disabled={boqCurrentPage === totalBoqPages}
                              className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              style={{ color: 'rgb(36, 61, 138)' }}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </TabsContent>

            <TabsContent value="cancelled" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                {(() => {
                  const totalBoqPages = Math.ceil(filteredBOQs.length / itemsPerPage);
                  const startIndex = (boqCurrentPage - 1) * itemsPerPage;
                  const endIndex = startIndex + itemsPerPage;
                  const paginatedBOQs = filteredBOQs.slice(startIndex, endIndex);

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Cancelled BOQs</h2>
                        <div className="text-xs sm:text-sm text-gray-600">
                          {filteredBOQs.length} BOQ{filteredBOQs.length !== 1 ? 's' : ''} cancelled
                        </div>
                      </div>
                      {viewMode === 'cards' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {paginatedBOQs.map((boq) => (
                            <BOQCard key={boq.boq_id} boq={boq} />
                          ))}
                        </div>
                      ) : (
                        <BOQTable boqList={paginatedBOQs} />
                      )}

                      {/* Pagination Controls */}
                      {totalBoqPages > 1 && (
                        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                          <div className="text-sm text-gray-600">
                            Showing {startIndex + 1} to {Math.min(endIndex, filteredBOQs.length)} of {filteredBOQs.length} BOQs
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setBoqCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={boqCurrentPage === 1}
                              className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              style={{ color: 'rgb(36, 61, 138)' }}
                            >
                              Previous
                            </button>
                            {Array.from({ length: totalBoqPages }, (_, i) => i + 1).map(page => (
                              <button
                                key={page}
                                onClick={() => setBoqCurrentPage(page)}
                                className={`h-9 w-9 text-sm font-semibold rounded-lg border transition-colors ${
                                  boqCurrentPage === page
                                    ? 'border-[rgb(36,61,138)] bg-blue-50'
                                    : 'border-gray-300 hover:bg-gray-50'
                                }`}
                                style={{ color: boqCurrentPage === page ? 'rgb(36, 61, 138)' : '#6b7280' }}
                              >
                                {page}
                              </button>
                            ))}
                            <button
                              onClick={() => setBoqCurrentPage(prev => Math.min(totalBoqPages, prev + 1))}
                              disabled={boqCurrentPage === totalBoqPages}
                              className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              style={{ color: 'rgb(36, 61, 138)' }}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {viewingProject && (
            <>
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100/30 -m-6 mb-6 p-6 border-b border-blue-200">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl">
                    <Building2 className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{viewingProject.project_name}</h2>
                    <p className="text-sm text-gray-500">Project ID: #{viewingProject.project_id}</p>
                  </div>
                </div>
              </div>

              {/* Project Information Grid */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100/20 rounded-lg p-3 border border-blue-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-3.5 w-3.5 text-blue-600" />
                    <Label className="text-xs font-semibold text-blue-900">Client</Label>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{viewingProject.client || 'Not assigned'}</p>
                </div>

                <div className="bg-gradient-to-br from-red-50 to-red-100/20 rounded-lg p-3 border border-red-200">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="h-3.5 w-3.5 text-red-600" />
                    <Label className="text-xs font-semibold text-red-900">Location</Label>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{viewingProject.location || 'Not specified'}</p>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-orange-100/20 rounded-lg p-3 border border-orange-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="h-3.5 w-3.5 text-orange-600" />
                    <Label className="text-xs font-semibold text-orange-900">Work Type</Label>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{viewingProject.work_type || 'Not specified'}</p>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100/20 rounded-lg p-3 border border-green-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-3.5 w-3.5 text-green-600" />
                    <Label className="text-xs font-semibold text-green-900">Working Hours</Label>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{viewingProject.working_hours || 'Not specified'}</p>
                </div>

                {viewingProject.floor_name && (
                  <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/20 rounded-lg p-3 border border-indigo-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                      <Label className="text-xs font-semibold text-indigo-900">Floor Name</Label>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{viewingProject.floor_name}</p>
                  </div>
                )}

                <div className="bg-gradient-to-br from-purple-50 to-purple-100/20 rounded-lg p-3 border border-purple-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="h-3.5 w-3.5 text-purple-600" />
                    <Label className="text-xs font-semibold text-purple-900">Area</Label>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{viewingProject.area || 'Not specified'}</p>
                </div>

                {viewingProject.start_date && (
                  <div className="bg-gradient-to-br from-teal-50 to-teal-100/20 rounded-lg p-3 border border-teal-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-3.5 w-3.5 text-teal-600" />
                      <Label className="text-xs font-semibold text-teal-900">Start Date</Label>
                    </div>
                    <p className="text-sm font-medium text-gray-900">
                      {format(new Date(viewingProject.start_date), 'dd MMM yyyy')}
                    </p>
                  </div>
                )}

                {viewingProject.duration_days && (
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100/20 rounded-lg p-3 border border-amber-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-3.5 w-3.5 text-amber-600" />
                      <Label className="text-xs font-semibold text-amber-900">Duration</Label>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{viewingProject.duration_days} days</p>
                  </div>
                )}

                {viewingProject.end_date && (
                  <div className="bg-gradient-to-br from-rose-50 to-rose-100/20 rounded-lg p-3 border border-rose-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-3.5 w-3.5 text-rose-600" />
                      <Label className="text-xs font-semibold text-rose-900">End Date</Label>
                    </div>
                    <p className="text-sm font-medium text-gray-900">
                      {format(new Date(viewingProject.end_date), 'dd MMM yyyy')}
                    </p>
                  </div>
                )}

                <div className="bg-gradient-to-br from-gray-50 to-gray-100/20 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-3.5 w-3.5 text-gray-600" />
                    <Label className="text-xs font-semibold text-gray-900">Created Date</Label>
                  </div>
                  <p className="text-base font-medium text-gray-900">
                    {viewingProject.created_at ? format(new Date(viewingProject.created_at), 'dd MMM yyyy') : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Description */}
              {viewingProject.description && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mb-6">
                  <Label className="text-xs font-semibold text-gray-700 mb-2 block">Description</Label>
                  <p className="text-sm text-gray-700">{viewingProject.description}</p>
                </div>
              )}

              {/* BOQ Section */}
              <div className="border-t border-gray-200 pt-6">
                {(() => {
                  // Filter BOQs by matching project_id
                  const projectBoqs = boqs.filter(boq => {
                    // Handle both number and string comparison
                    return boq.project?.project_id == viewingProject.project_id;
                  });

                  return (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                          <FileText className="h-5 w-5 text-blue-600" />
                          Related BOQs
                        </h3>
                        {projectBoqs.length === 0 && (
                          <button
                            className="px-4 py-2 bg-white border-2 border-red-500 text-red-600 text-sm rounded-lg hover:bg-red-50 transition-all font-semibold flex items-center gap-2"
                            onClick={() => {
                              handleCreateBOQ(viewingProject);
                              setViewingProject(null);
                            }}
                          >
                            <Plus className="h-4 w-4" />
                            Create New BOQ
                          </button>
                        )}
                      </div>

                      {projectBoqs.length === 0 ? (
                        <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 border-2 border-dashed border-blue-300 rounded-xl p-8 text-center">
                          <div className="p-4 bg-blue-50 rounded-full inline-block mb-3">
                            <FileText className="h-8 w-8 text-blue-600" />
                          </div>
                          <p className="text-sm text-gray-600 mb-2">No BOQs created for this project yet</p>
                          <p className="text-xs text-gray-500">Create your first BOQ to start estimating costs</p>
                        </div>
                      ) : (
                    <div className="space-y-3">
                      {projectBoqs.map((boq) => (
                        <div key={boq.boq_id} className="bg-white border border-blue-100 rounded-lg p-4 hover:shadow-lg hover:border-blue-300 transition-all">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-blue-50 rounded-lg">
                                  <FileText className="h-4 w-4 text-blue-600" />
                                </div>
                                <div>
                                  <h4 className="font-bold text-gray-900">{boq.title}</h4>
                                  <p className="text-xs text-gray-500">BOQ ID: #{boq.boq_id}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-6 ml-11">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">Status:</span>
                                  {getStatusBadge(boq.status, boq.client_rejection_reason)}
                                </div>
                                {boq.total_cost && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">Total:</span>
                                    <span className="text-sm font-bold text-green-700">{formatCurrency(boq.total_cost)}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">Created:</span>
                                  <span className="text-xs text-gray-700">{boq.created_at ? format(new Date(boq.created_at), 'dd MMM yyyy') : 'N/A'}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                className="px-4 py-2 text-white text-sm rounded-lg hover:opacity-90 transition-all font-semibold flex items-center gap-2"
                                style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                                onClick={() => {
                                  setSelectedBoqForDetails(boq);
                                  setShowBoqDetails(true);
                                  setViewingProject(null);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                                View
                              </button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-300"
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
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
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
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-6">
                <Button
                  variant="outline"
                  className="border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={() => {
                    setEditingProject(viewingProject);
                    setViewingProject(null);
                    setShowProjectDialog(true);
                  }}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Project
                </Button>
                <Button
                  className="bg-gray-600 hover:bg-gray-700 text-white"
                  onClick={() => setViewingProject(null)}
                >
                  Close
                </Button>
              </div>
            </>
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

      {/* Client Rejection Modal */}
      <Dialog open={showClientRejectionModal} onOpenChange={(open) => {
        if (!open) {
          setShowClientRejectionModal(false);
          setBoqToReject(null);
          setRejectionReason('');
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircleIcon className="h-5 w-5" />
              Client Rejected BOQ
            </DialogTitle>
            <DialogDescription>
              Record that the client has rejected "{boqToReject?.title || boqToReject?.boq_name}".
              Please provide the reason for rejection so it can be revised.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="rejectionReason" className="text-sm font-medium">
                Rejection Reason <span className="text-red-500">*</span>
              </Label>
              <textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason why client rejected this BOQ..."
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[100px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowClientRejectionModal(false);
                  setBoqToReject(null);
                  setRejectionReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleClientRejection}
                disabled={!rejectionReason.trim()}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel BOQ Modal */}
      <Dialog open={showCancelModal} onOpenChange={(open) => {
        if (!open) {
          setShowCancelModal(false);
          setBoqToCancel(null);
          setCancellationReason('');
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <XCircleIcon className="h-5 w-5" />
              Cancel Project / Close BOQ
            </DialogTitle>
            <DialogDescription>
              Cancel "{boqToCancel?.title || boqToCancel?.boq_name}" because client doesn't want to proceed with the business.
              This will mark the BOQ as cancelled for record keeping.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="cancellationReason" className="text-sm font-medium">
                Cancellation Reason <span className="text-red-500">*</span>
              </Label>
              <textarea
                id="cancellationReason"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Enter reason why client cancelled/closed this project..."
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCancelModal(false);
                  setBoqToCancel(null);
                  setCancellationReason('');
                }}
              >
                Go Back
              </Button>
              <Button
                className="bg-orange-600 hover:bg-orange-700"
                onClick={handleCancelBOQ}
                disabled={!cancellationReason.trim()}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send to TD Popup after Edit */}
      <Dialog open={showSendToTDPopup} onOpenChange={(open) => {
        if (!open) {
          setShowSendToTDPopup(false);
          setBoqToSendToTD(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <CheckCircle className="h-5 w-5" />
              BOQ Revision Saved Successfully!
            </DialogTitle>
            <DialogDescription>
              Your changes to "{boqToSendToTD?.title || boqToSendToTD?.boq_name}" have been saved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            <p className="text-sm text-gray-600">
              Would you like to send this revision to the Technical Director for approval now?
            </p>
            <Button
              className="w-full bg-gradient-to-r from-red-50 to-red-100 text-red-900 hover:from-red-100 hover:to-red-200 border border-red-200 shadow-sm"
              onClick={async () => {
                setIsSendingToTD(true);
                try {
                  const result = await estimatorService.sendBOQEmail(boqToSendToTD?.boq_id!, { comments: 'Sending revised BOQ for review' });
                  if (result.success) {
                    setShowSendToTDPopup(false);
                    toast.success('Revision sent to Technical Director successfully!');
                    await loadBOQs();
                    setActiveTab('revisions'); // Auto-switch to Revisions tab
                  } else {
                    toast.error(result.message || 'Failed to send revision');
                  }
                } finally {
                  setIsSendingToTD(false);
                  setBoqToSendToTD(null);
                }
              }}
              disabled={isSendingToTD}
            >
              {isSendingToTD ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-900 mr-2"></div>
                  Sending to TD...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send to Technical Director
                </>
              )}
            </Button>
            {/* Only show "Send Later" if BOQ is not from rejected tab */}
            {boqToSendToTD?.status?.toLowerCase() !== 'rejected' && boqToSendToTD?.status?.toLowerCase() !== 'client_rejected' && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setShowSendToTDPopup(false);
                  setBoqToSendToTD(null);
                  toast.success('Revision saved! You can send it to TD later.');
                }}
              >
                Send Later
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* PM Selection Modal */}
      <Dialog open={showPMSelectionModal} onOpenChange={(open) => {
        if (!open) {
          setShowPMSelectionModal(false);
          setProjectToSendToPM(null);
          setSelectedPM(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <Users className="h-5 w-5" />
              Send BOQ to Project Manager
            </DialogTitle>
            <DialogDescription>
              Select a Project Manager to review BOQ for "{projectToSendToPM?.project_name}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {loadingPMs ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Loading Project Managers...</span>
              </div>
            ) : projectManagers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p>No Project Managers found</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Select Project Manager</label>
                  {projectManagers.map((pm) => (
                    <button
                      key={pm.user_id}
                      onClick={() => setSelectedPM(pm.user_id)}
                      className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                        selectedPM === pm.user_id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{pm.full_name}</p>
                          <p className="text-sm text-gray-500">{pm.department}</p>
                          <p className="text-xs text-gray-400">{pm.email}</p>
                        </div>
                        {selectedPM === pm.user_id && (
                          <CheckCircle className="h-6 w-6 text-blue-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleConfirmSendToPM}
                    disabled={!selectedPM || isSendingToPM}
                  >
                    {isSendingToPM ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send to PM
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPMSelectionModal(false);
                      setProjectToSendToPM(null);
                      setSelectedPM(null);
                    }}
                    disabled={isSendingToPM}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Revision Options Modal */}
      <Dialog open={showRevisionModal} onOpenChange={(open) => {
        if (!open) {
          setShowRevisionModal(false);
          setSelectedBoqForRevision(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Edit className="h-5 w-5" />
              BOQ Revisions
            </DialogTitle>
            <DialogDescription>
              Choose an action for "{selectedBoqForRevision?.title || selectedBoqForRevision?.boq_name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            <Button
              className="w-full bg-gradient-to-r from-red-50 to-red-100 text-red-900 hover:from-red-100 hover:to-red-200 border border-red-200 shadow-sm"
              onClick={() => {
                setShowRevisionModal(false);
                setEditingBoq(selectedBoqForRevision);
                setIsRevisionEdit(true); // Set flag for revision edit
                setShowBoqEdit(true);
              }}
            >
              <Edit className="h-4 w-4 mr-2" />
              Make Revision
            </Button>
            <Button
              variant="outline"
              className="w-full bg-gradient-to-r from-red-100 to-red-200 text-red-900 hover:from-red-200 hover:to-red-300 border border-red-300"
              onClick={() => {
                setShowRevisionModal(false);
                setBoqToCancel(selectedBoqForRevision);
                setShowCancelModal(true);
              }}
            >
              <XCircleIcon className="h-4 w-4 mr-2" />
              Cancel Project
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowRevisionModal(false);
                setSelectedBoqForRevision(null);
              }}
            >
              Go Back
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
        showNewPurchaseItems={false} // Projects page should NOT show new_purchase items
        onEdit={() => {
          if (selectedBoqForDetails) {
            setShowBoqDetails(false);
            setEditingBoq(selectedBoqForDetails);
            setShowBoqEdit(true);
          }
        }}
        onDownload={() => {
          if (selectedBoqForDetails) {
            handleDownloadBOQ(selectedBoqForDetails);
          }
        }}
      />

      {/* BOQ Edit Modal */}
      <BOQEditModal
        isOpen={showBoqEdit}
        onClose={() => {
          setShowBoqEdit(false);
          setEditingBoq(null);
          setIsRevisionEdit(false); // Reset revision flag
        }}
        boq={editingBoq}
        isRevision={isRevisionEdit} // Pass revision flag to modal
        onSave={async () => {
          await loadBOQs(); // Refresh the list
          setShowBoqEdit(false);
          // Show Send to TD popup after save
          setBoqToSendToTD(editingBoq);
          setShowSendToTDPopup(true);
          setEditingBoq(null);
          setIsRevisionEdit(false); // Reset revision flag
        }}
      />

      {/* Send BOQ Email Modal */}
      {boqToEmail && (
        <SendBOQEmailModal
          isOpen={showSendEmailModal}
          onClose={() => {
            setShowSendEmailModal(false);
            setBoqToEmail(null);
            setEmailMode('td'); // Reset to default
          }}
          boqId={boqToEmail.boq_id!}
          boqName={boqToEmail.boq_name || boqToEmail.title || ''}
          projectName={boqToEmail.project?.name || ''}
          mode={emailMode}
          onEmailSent={() => {
            loadBOQs(); // Refresh to get updated email_sent status
          }}
        />
      )}

      {/* Download Format Selection Modal */}
      {showFormatModal && boqToDownload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full"
          >
            <div className="bg-gradient-to-r from-green-50 to-green-100 p-6 border-b border-green-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-green-900">Download BOQ</h2>
                <button
                  onClick={() => setShowFormatModal(false)}
                  className="p-2 hover:bg-green-200 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-green-700 mt-1">
                Choose BOQ type and format
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* Type Selection */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-gray-700 mb-3">
                  <strong>Note:</strong> Download both versions to compare what's visible internally vs what the client will see after estimator sends it.
                </p>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 bg-white border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                    <input
                      type="radio"
                      name="downloadType"
                      value="internal"
                      checked={downloadType === 'internal'}
                      onChange={() => setDownloadType('internal')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div>
                      <div className="font-semibold text-gray-900">Internal BOQ</div>
                      <div className="text-xs text-gray-600">Includes overhead, profit margins, and detailed breakdown</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-white border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                    <input
                      type="radio"
                      name="downloadType"
                      value="client"
                      checked={downloadType === 'client'}
                      onChange={() => setDownloadType('client')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div>
                      <div className="font-semibold text-gray-900">Client BOQ</div>
                      <div className="text-xs text-gray-600">Simplified version showing only final prices (as client sees)</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Format Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleDownload('excel')}
                  className="flex-1 py-3 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download Excel
                </button>
                <button
                  onClick={() => handleDownload('pdf')}
                  className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download PDF
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default EstimatorHub;