import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Package, 
  Users, 
  Factory, 
  Truck,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  ArrowRight,
  ArrowDown,
  Building2,
  ClipboardCheck,
  Banknote,
  UserCheck,
  Settings,
  BarChart3,
  Workflow,
  ChevronRight,
  Filter,
  HardHat,
  Wrench,
  Database,
  GitBranch,
  Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface WorkflowNode {
  id: string;
  title: string;
  role: string;
  type: 'start' | 'process' | 'decision' | 'end' | 'flag';
  status?: 'pending' | 'in-progress' | 'approved' | 'rejected' | 'completed';
  color: string;
  icon: React.ElementType;
  x: number;
  y: number;
}

interface WorkflowConnection {
  from: string;
  to: string;
  label?: string;
  type: 'normal' | 'approval' | 'rejection' | 'revision' | 'reference';
}

const ProcessFlowPage: React.FC = () => {
  const [selectedWorkflow, setSelectedWorkflow] = useState('material-purchase');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<string>('all');

  // Material Purchase Workflow based on PDF
  const materialPurchaseNodes: WorkflowNode[] = [
    { id: 'site-supervisor', title: 'Site/MEP Supervisor', role: 'SITE_SUPERVISOR', type: 'start', color: 'bg-gray-500', icon: HardHat, x: 100, y: 200 },
    { id: 'design', title: 'Design', role: 'DESIGN', type: 'process', color: 'bg-rose-500', icon: Settings, x: 100, y: 350 },
    { id: 'procurement', title: 'Procurement', role: 'PROCUREMENT', type: 'process', color: 'bg-emerald-500', icon: Package, x: 350, y: 200 },
    { id: 'qty-spec-flag', title: 'QTY/SPEC Flag', role: 'FLAG', type: 'flag', color: 'bg-pink-400', icon: AlertCircle, x: 500, y: 100 },
    { id: 'project-manager', title: 'Project Manager', role: 'PROJECT_MANAGER', type: 'process', color: 'bg-purple-500', icon: Users, x: 650, y: 200 },
    { id: 'pm-flag', title: 'PM Flag', role: 'FLAG', type: 'flag', color: 'bg-pink-400', icon: AlertCircle, x: 800, y: 250 },
    { id: 'cost-flag', title: 'Cost Flag', role: 'FLAG', type: 'flag', color: 'bg-pink-400', icon: Banknote, x: 500, y: 350 },
    { id: 'estimation', title: 'Estimation', role: 'ESTIMATION', type: 'process', color: 'bg-amber-500', icon: BarChart3, x: 800, y: 350 },
    { id: 'flag', title: 'Flag', role: 'FLAG', type: 'flag', color: 'bg-pink-400', icon: AlertCircle, x: 800, y: 450 },
    { id: 'accounts', title: 'Accounts', role: 'ACCOUNTS', type: 'process', color: 'bg-cyan-500', icon: Banknote, x: 350, y: 500 },
    { id: 'technical-director', title: 'Technical Director', role: 'TECHNICAL_DIRECTOR', type: 'process', color: 'bg-teal-500', icon: Building2, x: 650, y: 500 },
    { id: 'task-completion', title: 'Task Completion', role: 'COMPLETION', type: 'end', color: 'bg-indigo-500', icon: CheckCircle, x: 100, y: 500 }
  ];

  const materialPurchaseConnections: WorkflowConnection[] = [
    { from: 'site-supervisor', to: 'procurement', label: 'Purchase requisition form', type: 'normal' },
    { from: 'site-supervisor', to: 'design', label: 'reference inputs', type: 'reference' },
    { from: 'design', to: 'procurement', label: 'reference inputs', type: 'reference' },
    { from: 'procurement', to: 'qty-spec-flag', type: 'normal' },
    { from: 'qty-spec-flag', to: 'procurement', label: 'Qty & spec revisions', type: 'revision' },
    { from: 'qty-spec-flag', to: 'project-manager', label: 'Qty & spec approvals', type: 'approval' },
    { from: 'procurement', to: 'project-manager', label: 'Purchase requisition form', type: 'normal' },
    { from: 'project-manager', to: 'pm-flag', type: 'normal' },
    { from: 'project-manager', to: 'estimation', label: 'Qty & spec approvals', type: 'approval' },
    { from: 'procurement', to: 'cost-flag', label: 'Cost revision', type: 'normal' },
    { from: 'cost-flag', to: 'procurement', label: 'Cost revision', type: 'revision' },
    { from: 'estimation', to: 'flag', label: 'Qty, spec & cost approvals', type: 'approval' },
    { from: 'flag', to: 'technical-director', label: 'Purchase requisition approvals', type: 'approval' },
    { from: 'accounts', to: 'task-completion', label: 'Payment transaction', type: 'normal' },
    { from: 'technical-director', to: 'accounts', label: 'Acknowledgement of payments', type: 'normal' },
    { from: 'accounts', to: 'procurement', label: 'Acknowledgement of payments', type: 'normal' }
  ];

  // Subcontractor/Vendor Workflow based on PDF
  const subcontractorNodes: WorkflowNode[] = [
    { id: 'pm-vendor', title: 'Project Manager', role: 'PROJECT_MANAGER', type: 'start', color: 'bg-purple-500', icon: Users, x: 100, y: 200 },
    { id: 'design-vendor', title: 'Design', role: 'DESIGN', type: 'process', color: 'bg-rose-500', icon: Settings, x: 100, y: 350 },
    { id: 'procurement-vendor', title: 'Procurement', role: 'PROCUREMENT', type: 'process', color: 'bg-emerald-500', icon: Package, x: 350, y: 200 },
    { id: 'qty-scope-flag', title: 'QTY/SCOPE Flag', role: 'FLAG', type: 'flag', color: 'bg-pink-400', icon: AlertCircle, x: 500, y: 100 },
    { id: 'pm-approval', title: 'Project Manager', role: 'PROJECT_MANAGER', type: 'process', color: 'bg-purple-500', icon: Users, x: 650, y: 200 },
    { id: 'pm-flag-vendor', title: 'PM Flag', role: 'FLAG', type: 'flag', color: 'bg-pink-400', icon: AlertCircle, x: 800, y: 250 },
    { id: 'vendor-check', title: 'Estimation-Vendor Check', role: 'ESTIMATION', type: 'process', color: 'bg-amber-500', icon: ClipboardCheck, x: 500, y: 350 },
    { id: 'estimation-vendor', title: 'Estimation', role: 'ESTIMATION', type: 'process', color: 'bg-amber-500', icon: BarChart3, x: 800, y: 350 },
    { id: 'flag-vendor', title: 'Flag', role: 'FLAG', type: 'flag', color: 'bg-pink-400', icon: AlertCircle, x: 800, y: 450 },
    { id: 'accounts-vendor', title: 'Accounts', role: 'ACCOUNTS', type: 'process', color: 'bg-cyan-500', icon: Banknote, x: 350, y: 500 },
    { id: 'tech-director-vendor', title: 'Technical Director', role: 'TECHNICAL_DIRECTOR', type: 'process', color: 'bg-teal-500', icon: Building2, x: 650, y: 500 },
    { id: 'completion-vendor', title: 'Task Completion', role: 'COMPLETION', type: 'end', color: 'bg-indigo-500', icon: CheckCircle, x: 100, y: 500 }
  ];

  const subcontractorConnections: WorkflowConnection[] = [
    { from: 'pm-vendor', to: 'procurement-vendor', label: 'Vendor scope of work - BOQ ref', type: 'normal' },
    { from: 'pm-vendor', to: 'design-vendor', label: 'reference inputs', type: 'reference' },
    { from: 'design-vendor', to: 'procurement-vendor', label: 'reference inputs', type: 'reference' },
    { from: 'procurement-vendor', to: 'qty-scope-flag', type: 'normal' },
    { from: 'qty-scope-flag', to: 'procurement-vendor', label: 'Qty & scope revisions', type: 'revision' },
    { from: 'qty-scope-flag', to: 'pm-approval', label: 'Qty & scope approvals', type: 'approval' },
    { from: 'procurement-vendor', to: 'pm-approval', label: 'Sub-contractor quotation', type: 'normal' },
    { from: 'procurement-vendor', to: 'vendor-check', label: 'reference inputs', type: 'reference' },
    { from: 'vendor-check', to: 'procurement-vendor', label: 'reference inputs', type: 'reference' },
    { from: 'pm-approval', to: 'pm-flag-vendor', type: 'normal' },
    { from: 'pm-approval', to: 'estimation-vendor', label: 'Qty & scope approvals', type: 'approval' },
    { from: 'estimation-vendor', to: 'flag-vendor', label: 'Qty, scope & cost approvals', type: 'approval' },
    { from: 'flag-vendor', to: 'tech-director-vendor', label: 'Quotation approvals', type: 'approval' },
    { from: 'accounts-vendor', to: 'completion-vendor', label: 'Payment transaction', type: 'normal' },
    { from: 'tech-director-vendor', to: 'accounts-vendor', label: 'Acknowledgement of payments', type: 'normal' }
  ];

  // Material Dispatch Production Workflow
  const productionNodes: WorkflowNode[] = [
    { id: 'design-prod', title: 'Design', role: 'DESIGN', type: 'start', color: 'bg-rose-500', icon: Settings, x: 100, y: 100 },
    { id: 'site-supervisor-prod', title: 'Site Supervisor', role: 'SITE_SUPERVISOR', type: 'process', color: 'bg-gray-500', icon: Factory, x: 100, y: 250 },
    { id: 'procurement-prod', title: 'Procurement', role: 'PROCUREMENT', type: 'process', color: 'bg-emerald-500', icon: Package, x: 350, y: 250 },
    { id: 'qty-spec-flag-prod', title: 'QTY/SPEC Flag', role: 'FLAG', type: 'flag', color: 'bg-pink-400', icon: AlertCircle, x: 500, y: 150 },
    { id: 'pm-prod', title: 'Project Manager', role: 'PROJECT_MANAGER', type: 'process', color: 'bg-purple-500', icon: Users, x: 650, y: 250 },
    { id: 'pm-flag-prod', title: 'PM Flag', role: 'FLAG', type: 'flag', color: 'bg-pink-400', icon: AlertCircle, x: 800, y: 300 },
    { id: 'store-in-charge', title: 'Procurement/Store In Charge', role: 'STORE', type: 'process', color: 'bg-cyan-500', icon: Database, x: 350, y: 400 },
    { id: 'estimation-prod', title: 'Estimation', role: 'ESTIMATION', type: 'process', color: 'bg-amber-500', icon: BarChart3, x: 800, y: 400 },
    { id: 'flag-prod', title: 'Flag', role: 'FLAG', type: 'flag', color: 'bg-pink-400', icon: AlertCircle, x: 800, y: 500 },
    { id: 'tech-dir-prod', title: 'Technical Director', role: 'TECHNICAL_DIRECTOR', type: 'process', color: 'bg-teal-500', icon: Building2, x: 650, y: 550 },
    { id: 'completion-prod', title: 'Task Completion', role: 'COMPLETION', type: 'end', color: 'bg-indigo-500', icon: CheckCircle, x: 100, y: 550 }
  ];

  const productionConnections: WorkflowConnection[] = [
    { from: 'design-prod', to: 'site-supervisor-prod', label: 'reference inputs', type: 'reference' },
    { from: 'site-supervisor-prod', to: 'procurement-prod', label: 'Material requisition form', type: 'normal' },
    { from: 'procurement-prod', to: 'qty-spec-flag-prod', type: 'normal' },
    { from: 'qty-spec-flag-prod', to: 'procurement-prod', label: 'Qty & spec revisions', type: 'revision' },
    { from: 'qty-spec-flag-prod', to: 'pm-prod', label: 'Qty & spec approvals', type: 'approval' },
    { from: 'procurement-prod', to: 'pm-prod', label: 'Material requisition form', type: 'normal' },
    { from: 'pm-prod', to: 'pm-flag-prod', type: 'normal' },
    { from: 'pm-prod', to: 'estimation-prod', label: 'Qty & spec approvals', type: 'approval' },
    { from: 'procurement-prod', to: 'store-in-charge', label: 'Material dispatch for production', type: 'normal' },
    { from: 'store-in-charge', to: 'site-supervisor-prod', label: 'Joinery & furniture production', type: 'normal' },
    { from: 'store-in-charge', to: 'estimation-prod', label: 'Material requisition approvals', type: 'approval' },
    { from: 'estimation-prod', to: 'flag-prod', label: 'Bulk qty approvals', type: 'approval' },
    { from: 'flag-prod', to: 'tech-dir-prod', label: 'Bulk qty request', type: 'approval' },
    { from: 'site-supervisor-prod', to: 'completion-prod', label: 'Acknowledgement of dispatch', type: 'normal' },
    { from: 'store-in-charge', to: 'completion-prod', label: 'Acknowledgement of dispatch', type: 'normal' },
    { from: 'tech-dir-prod', to: 'store-in-charge', label: 'Acknowledgement of dispatch', type: 'normal' }
  ];

  // Material Dispatch Site Works Workflow
  const siteWorksNodes: WorkflowNode[] = [
    { id: 'site-mep', title: 'Site/MEP Supervisor', role: 'SITE_SUPERVISOR', type: 'start', color: 'bg-gray-500', icon: HardHat, x: 100, y: 250 },
    { id: 'design-site', title: 'Design', role: 'DESIGN', type: 'process', color: 'bg-rose-500', icon: Settings, x: 100, y: 400 },
    { id: 'procurement-site', title: 'Procurement', role: 'PROCUREMENT', type: 'process', color: 'bg-emerald-500', icon: Package, x: 350, y: 250 },
    { id: 'qty-spec-req-flag', title: 'QTY/SPEC/REQ Flag', role: 'FLAG', type: 'flag', color: 'bg-pink-400', icon: AlertCircle, x: 500, y: 150 },
    { id: 'pm-site', title: 'Project Manager', role: 'PROJECT_MANAGER', type: 'process', color: 'bg-purple-500', icon: Users, x: 650, y: 250 },
    { id: 'flag-site', title: 'Flag', role: 'FLAG', type: 'flag', color: 'bg-pink-400', icon: AlertCircle, x: 800, y: 350 },
    { id: 'site-supervisor-delivery', title: 'Site Supervisor/MEP', role: 'SITE_SUPERVISOR', type: 'process', color: 'bg-gray-500', icon: Truck, x: 350, y: 450 },
    { id: 'tech-dir-site', title: 'Technical Director', role: 'TECHNICAL_DIRECTOR', type: 'process', color: 'bg-teal-500', icon: Building2, x: 650, y: 500 },
    { id: 'completion-site', title: 'Task Completion', role: 'COMPLETION', type: 'end', color: 'bg-indigo-500', icon: CheckCircle, x: 350, y: 600 }
  ];

  const siteWorksConnections: WorkflowConnection[] = [
    { from: 'site-mep', to: 'procurement-site', label: 'Material request', type: 'normal' },
    { from: 'site-mep', to: 'design-site', label: 'reference inputs', type: 'reference' },
    { from: 'design-site', to: 'site-factory', label: 'reference inputs', type: 'reference' },
    { from: 'procurement-site', to: 'qty-spec-req-flag', type: 'normal' },
    { from: 'qty-spec-req-flag', to: 'procurement-site', label: 'Qty & spec revisions', type: 'revision' },
    { from: 'qty-spec-req-flag', to: 'pm-site', label: 'Qty & spec approvals', type: 'approval' },
    { from: 'procurement-site', to: 'pm-site', label: 'Material delivery note', type: 'normal' },
    { from: 'pm-site', to: 'flag-site', label: 'Bulk qty dispatch approvals', type: 'approval' },
    { from: 'pm-site', to: 'site-supervisor-delivery', label: 'Material delivery note approvals', type: 'approval' },
    { from: 'procurement-site', to: 'site-supervisor-delivery', label: 'Site delivery as per approved delivery note', type: 'normal' },
    { from: 'site-supervisor-delivery', to: 'procurement-site', label: 'Acknowledgement of delivery', type: 'normal' },
    { from: 'site-supervisor-delivery', to: 'completion-site', label: 'Site delivery', type: 'normal' },
    { from: 'flag-site', to: 'tech-dir-site', label: 'Bulk qty dispatch request', type: 'approval' },
    { from: 'tech-dir-site', to: 'pm-site', label: 'Bulk qty dispatch approvals', type: 'approval' },
    { from: 'tech-dir-site', to: 'completion-site', label: 'Acknowledgement of delivery', type: 'normal' }
  ];

  const workflows = {
    'material-purchase': {
      title: 'Material Purchase - Project Bound',
      nodes: materialPurchaseNodes,
      connections: materialPurchaseConnections
    },
    'subcontractor': {
      title: 'Subcontractor/Vendor - Project Bound',
      nodes: subcontractorNodes,
      connections: subcontractorConnections
    },
    'production': {
      title: 'Material Dispatch - Production - Project Bound',
      nodes: productionNodes,
      connections: productionConnections
    },
    'site-works': {
      title: 'Material Dispatch - Site Works - Project Bound',
      nodes: siteWorksNodes,
      connections: siteWorksConnections
    }
  };

  const currentWorkflow = workflows[selectedWorkflow as keyof typeof workflows];

  const roles = [
    { value: 'all', label: 'All Roles' },
    { value: 'TECHNICAL_DIRECTOR', label: 'Technical Director' },
    { value: 'PROJECT_MANAGER', label: 'Project Manager' },
    { value: 'PROCUREMENT', label: 'Procurement' },
    { value: 'ESTIMATION', label: 'Estimation' },
    { value: 'SITE_SUPERVISOR', label: 'Site Supervisor' },
    { value: 'DESIGN', label: 'Design' },
    { value: 'ACCOUNTS', label: 'Accounts' },
    { value: 'STORE', label: 'Store In Charge' }
  ];

  const renderWorkflowNode = (node: WorkflowNode) => {
    const Icon = node.icon;
    const isFiltered = filterRole !== 'all' && node.role !== filterRole && node.role !== 'FLAG' && node.role !== 'COMPLETION';
    const isSelected = selectedNode === node.id;

    return (
      <motion.div
        key={node.id}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ 
          opacity: isFiltered ? 0.3 : 1, 
          scale: 1,
          filter: isFiltered ? 'grayscale(1)' : 'grayscale(0)'
        }}
        whileHover={{ scale: 1.05 }}
        className={`absolute cursor-pointer transition-all duration-200 ${isSelected ? 'z-20' : 'z-10'}`}
        style={{ left: `${node.x}px`, top: `${node.y}px` }}
        onClick={() => setSelectedNode(node.id)}
      >
        <div className={`relative ${isSelected ? 'ring-4 ring-[#243d8a]/40 ring-offset-2' : ''} rounded-lg`}>
          <div className={`${node.color} p-3 rounded-lg shadow-lg border-2 border-white min-w-[140px]`}>
            <div className="flex flex-col items-center space-y-1">
              <Icon className="w-5 h-5 text-white" />
              <div className="text-center">
                <p className="text-white font-semibold text-xs leading-tight">{node.title}</p>
                {node.type === 'flag' && (
                  <Badge className="mt-1 bg-white/20 text-white text-[10px] px-1 py-0">
                    Decision
                  </Badge>
                )}
              </div>
            </div>
          </div>
          {node.status && (
            <div className="absolute -top-2 -right-2">
              {node.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500 bg-white rounded-full" />}
              {node.status === 'in-progress' && <Clock className="w-5 h-5 text-[#243d8a] bg-white rounded-full" />}
              {node.status === 'pending' && <AlertCircle className="w-5 h-5 text-yellow-500 bg-white rounded-full" />}
              {node.status === 'rejected' && <XCircle className="w-5 h-5 text-red-500 bg-white rounded-full" />}
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  const renderConnection = (connection: WorkflowConnection, nodes: WorkflowNode[]) => {
    const fromNode = nodes.find(n => n.id === connection.from);
    const toNode = nodes.find(n => n.id === connection.to);
    
    if (!fromNode || !toNode) return null;

    const x1 = fromNode.x + 70;
    const y1 = fromNode.y + 30;
    const x2 = toNode.x + 70;
    const y2 = toNode.y + 30;

    const strokeColor = connection.type === 'approval' ? '#10b981' : 
                       connection.type === 'rejection' ? '#ef4444' :
                       connection.type === 'revision' ? '#f59e0b' : 
                       connection.type === 'reference' ? '#8b5cf6' : '#6b7280';

    const strokeDasharray = connection.type === 'revision' ? '5,5' : 
                           connection.type === 'reference' ? '3,3' : '0';

    return (
      <svg
        key={`${connection.from}-${connection.to}`}
        className="absolute inset-0 pointer-events-none z-0 w-full h-full"
      >
        <defs>
          <marker
            id={`arrowhead-${connection.from}-${connection.to}`}
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3, 0 6"
              fill={strokeColor}
            />
          </marker>
        </defs>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={strokeColor}
          strokeWidth="2"
          strokeDasharray={strokeDasharray}
          markerEnd={`url(#arrowhead-${connection.from}-${connection.to})`}
        />
        {connection.label && (
          <text
            x={(x1 + x2) / 2}
            y={(y1 + y2) / 2 - 5}
            fill="#4b5563"
            fontSize="9"
            textAnchor="middle"
            className="font-medium bg-white"
            paintOrder="stroke"
            stroke="white"
            strokeWidth="3"
            strokeLinejoin="round"
          >
            {connection.label}
          </text>
        )}
      </svg>
    );
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Workflow className="w-7 h-7 text-[#243d8a]" />
            ERP Process Workflows
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Costing, Estimation & Procurement Management System
          </p>
        </div>
        <div className="flex gap-3">
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map(role => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            className="flex items-center gap-2"
            onClick={() => window.open('/procurement', '_blank')}
          >
            <Package className="w-4 h-4" />
            Procurement Hub
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Live Status
          </Button>
        </div>
      </div>

      {/* Workflow Tabs */}
      <Tabs value={selectedWorkflow} onValueChange={setSelectedWorkflow} className="space-y-6">
        <TabsList className="grid grid-cols-4 w-full max-w-4xl bg-white shadow-sm">
          <TabsTrigger value="material-purchase" className="text-xs data-[state=active]:bg-[#243d8a]/5">
            <Package className="w-4 h-4 mr-1" />
            Material Purchase
          </TabsTrigger>
          <TabsTrigger value="subcontractor" className="text-xs data-[state=active]:bg-purple-50">
            <Users className="w-4 h-4 mr-1" />
            Subcontractor/Vendor
          </TabsTrigger>
          <TabsTrigger value="production" className="text-xs data-[state=active]:bg-emerald-50">
            <Factory className="w-4 h-4 mr-1" />
            Production
          </TabsTrigger>
          <TabsTrigger value="site-works" className="text-xs data-[state=active]:bg-amber-50">
            <Truck className="w-4 h-4 mr-1" />
            Site Works
          </TabsTrigger>
        </TabsList>

        {/* Workflow Canvas */}
        <Card className="overflow-hidden shadow-lg">
          <CardHeader className="bg-gradient-to-r from-[#243d8a]/5 to-indigo-50 border-b">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-[#243d8a]" />
                {currentWorkflow.title}
              </CardTitle>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-white">
                  {currentWorkflow.nodes.length} Steps
                </Badge>
                <Badge variant="outline" className="bg-white">
                  {currentWorkflow.connections.length} Connections
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative bg-gradient-to-br from-gray-50 to-white h-[700px] overflow-auto">
              <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
              <div className="relative w-[1000px] h-[650px]">
                {/* Render Connections */}
                {currentWorkflow.connections.map(connection => 
                  renderConnection(connection, currentWorkflow.nodes)
                )}
                {/* Render Nodes */}
                {currentWorkflow.nodes.map(renderWorkflowNode)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Node Details Panel */}
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {/* Selected Node Details */}
            <Card className="shadow-md">
              <CardHeader className="bg-gradient-to-r from-[#243d8a]/5 to-indigo-50">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-[#243d8a]" />
                  Node Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {(() => {
                  const node = currentWorkflow.nodes.find(n => n.id === selectedNode);
                  if (!node) return null;
                  const Icon = node.icon;
                  return (
                    <>
                      <div className="flex items-center gap-3">
                        <div className={`${node.color} p-2 rounded-lg`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{node.title}</p>
                          <p className="text-xs text-gray-500 capitalize">{node.type}</p>
                        </div>
                      </div>
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Department:</span>
                          <span className="font-medium">{node.role.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Type:</span>
                          <Badge variant="outline" className="text-xs capitalize">
                            {node.type}
                          </Badge>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Status:</span>
                          <Badge className="text-xs bg-green-100 text-green-700">
                            Active
                          </Badge>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Connections */}
            <Card className="shadow-md">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-purple-600" />
                  Connections
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-700">Incoming:</p>
                  {currentWorkflow.connections
                    .filter(c => c.to === selectedNode)
                    .map((conn, idx) => (
                      <div key={idx} className="text-xs bg-[#243d8a]/5 p-2 rounded">
                        <span className="font-medium">
                          {currentWorkflow.nodes.find(n => n.id === conn.from)?.title}
                        </span>
                        {conn.label && (
                          <span className="text-gray-500 block mt-1 text-[10px]">
                            → {conn.label}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-medium text-gray-700">Outgoing:</p>
                  {currentWorkflow.connections
                    .filter(c => c.from === selectedNode)
                    .map((conn, idx) => (
                      <div key={idx} className="text-xs bg-green-50 p-2 rounded">
                        <span className="font-medium">
                          {currentWorkflow.nodes.find(n => n.id === conn.to)?.title}
                        </span>
                        {conn.label && (
                          <span className="text-gray-500 block mt-1 text-[10px]">
                            → {conn.label}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card className="shadow-md">
              <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Settings className="w-4 h-4 text-emerald-600" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-4">
                <Button 
                  className="w-full justify-start text-xs" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const nodeData = currentWorkflow.nodes.find((n: any) => n.id === selectedNode);
                    alert(`Viewing documents for: ${nodeData?.title}\n\nThis would show all related documents for this workflow step.`);
                  }}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  View Documents
                </Button>
                <Button 
                  className="w-full justify-start text-xs" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const nodeData = currentWorkflow.nodes.find((n: any) => n.id === selectedNode);
                    alert(`Assigning user to: ${nodeData?.title}\n\nThis would open a user assignment dialog.`);
                  }}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Assign User
                </Button>
                <Button 
                  className="w-full justify-start text-xs" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const nodeData = currentWorkflow.nodes.find((n: any) => n.id === selectedNode);
                    alert(`History for: ${nodeData?.title}\n\nTimeline:\n- Created: 2 days ago\n- Approved: 1 day ago\n- Current status: ${nodeData?.status || 'Active'}`);
                  }}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  View History
                </Button>
                <Button 
                  className="w-full justify-start text-xs" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const nodeData = currentWorkflow.nodes.find((n: any) => n.id === selectedNode);
                    alert(`Analytics for: ${nodeData?.title}\n\n- Average processing time: 2.3 days\n- Success rate: 95%\n- Bottleneck score: Low`);
                  }}
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  View Analytics
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </Tabs>

      {/* Legend */}
      <Card className="shadow-md">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-slate-50">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-gray-600" />
            Workflow Legend
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-gray-500"></div>
              <span className="text-xs text-gray-600">Normal Flow</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-green-500"></div>
              <span className="text-xs text-gray-600">Approval</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-red-500"></div>
              <span className="text-xs text-gray-600">Rejection</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 border-t-2 border-dashed border-yellow-500"></div>
              <span className="text-xs text-gray-600">Revision</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 border-t-2 border-dashed border-purple-500"></div>
              <span className="text-xs text-gray-600">Reference</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add CSS for grid pattern */}
      <style>{`
        .bg-grid-pattern {
          background-image: 
            linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px);
          background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (651 lines)
export default React.memo(ProcessFlowPage);