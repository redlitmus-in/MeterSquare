import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { SimpleHorizontalCards } from '@/components/ui/SimpleHorizontalCards';
import {
  Package,
  Users,
  Banknote,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  ArrowRight,
  Activity,
  BarChart3,
  Building2,
  ShoppingCart,
  Briefcase,
  Target,
  Award,
  Calendar,
  Bell,
  ChevronUp,
  ChevronDown,
  Filter,
  Plus,
  Eye,
  Zap,
  Shield,
  TrendingDown,
  Layers,
  Truck,
  CreditCard,
  MoreHorizontal,
  Settings,
  Download,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/authStore';
import { UserRole } from '@/types';
import { Progress } from '@/components/ui/progress';
import { 
  LineChart as RechartsLineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart as RechartsBarChart, 
  Bar, 
  PieChart as RechartsPieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ComposedChart,
  RadialBarChart,
  RadialBar,
  ScatterChart,
  Scatter,
  ReferenceLine
} from 'recharts';

interface MetricData {
  title: string;
  value: string | number;
  change: number;
  trend: 'up' | 'down';
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}

interface ProjectData {
  id: string;
  name: string;
  client: string;
  status: 'active' | 'completed' | 'on-hold' | 'planning';
  progress: number;
  budget: number;
  spent: number;
  deadline: string;
  manager: string;
}

interface RecentActivity {
  id: string;
  type: 'approval' | 'purchase' | 'task' | 'vendor' | 'payment';
  title: string;
  description: string;
  time: string;
  urgent?: boolean;
  user?: string;
}

const ModernDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');

  // Compact Chart data
  const revenueData = [
    { month: 'Jan', revenue: 2400, profit: 400, target: 2200 },
    { month: 'Feb', revenue: 2600, profit: 500, target: 2400 },
    { month: 'Mar', revenue: 2350, profit: 350, target: 2500 },
    { month: 'Apr', revenue: 2800, profit: 600, target: 2600 },
    { month: 'May', revenue: 3100, profit: 700, target: 2800 },
    { month: 'Jun', revenue: 3300, profit: 800, target: 3000 },
  ];

  const projectStatusData = [
    { name: 'Completed', value: 24, color: '#EF4444' },
    { name: 'Active', value: 15, color: '#3B82F6' },
    { name: 'On Hold', value: 3, color: '#F59E0B' },
    { name: 'Planning', value: 5, color: '#DC2626' },
  ];

  const departmentData = [
    { name: 'Eng', value: 45, target: 50 },
    { name: 'Proc', value: 38, target: 40 },
    { name: 'Quality', value: 42, target: 45 },
    { name: 'Ops', value: 35, target: 40 },
  ];

  // Performance Data
  const performanceData = [
    { name: 'Quality', value: 94 },
    { name: 'Timeline', value: 87 },
    { name: 'Budget', value: 91 },
    { name: 'Satisfaction', value: 96 },
  ];

  // Main metrics - more compact
  const metrics: MetricData[] = [
    {
      title: 'Revenue',
      value: 'AED 2.45M',
      change: 12.5,
      trend: 'up',
      icon: Banknote,
      color: 'text-green-600',
      subtitle: 'This year'
    },
    {
      title: 'Projects',
      value: 24,
      change: 8.3,
      trend: 'up',
      icon: Briefcase,
      color: 'text-[#243d8a]',
      subtitle: '6 new'
    },
    {
      title: 'Approvals',
      value: 15,
      change: -25.0,
      trend: 'down',
      icon: Clock,
      color: 'text-amber-600',
      subtitle: 'Pending'
    },
    {
      title: 'Performance',
      value: '94%',
      change: 3.2,
      trend: 'up',
      icon: Award,
      color: 'text-red-600',
      subtitle: 'Overall'
    }
  ];

  // Compact projects data
  const projects: ProjectData[] = [
    {
      id: '1',
      name: 'Marina Bay Tower A',
      client: 'Marina Development',
      status: 'active',
      progress: 75,
      budget: 850000,
      spent: 637500,
      deadline: '2024-03-15',
      manager: 'Jennifer Wong'
    },
    {
      id: '2',
      name: 'Orchard Office Fit-out',
      client: 'TechCorp Singapore',
      status: 'active',
      progress: 45,
      budget: 1200000,
      spent: 540000,
      deadline: '2024-04-30',
      manager: 'Michael Tan'
    }
  ];

  // Compact activities
  const recentActivities: RecentActivity[] = [
    {
      id: '1',
      type: 'approval',
      title: 'PR Approved',
      description: 'PR-2024-001 approved',
      time: '5m ago',
      urgent: false,
      user: 'John Tan'
    },
    {
      id: '2',
      type: 'vendor',
      title: 'New Quotation',
      description: 'ABC Contractors quotation',
      time: '1h ago',
      urgent: true
    },
    {
      id: '3',
      type: 'payment',
      title: 'Payment Processed',
      description: 'INV-2024-089 paid',
      time: '3h ago',
      user: 'Finance'
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-[#243d8a]/10 text-[#243d8a]/80';
      case 'on-hold':
        return 'bg-yellow-100 text-yellow-800';
      case 'planning':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'approval':
        return <CheckCircle className="w-3 h-3 text-green-600" />;
      case 'purchase':
        return <ShoppingCart className="w-3 h-3 text-[#243d8a]" />;
      case 'vendor':
        return <Users className="w-3 h-3 text-red-600" />;
      case 'payment':
        return <CreditCard className="w-3 h-3 text-indigo-600" />;
      case 'task':
        return <FileText className="w-3 h-3 text-gray-600" />;
      default:
        return <Activity className="w-3 h-3 text-gray-600" />;
    }
  };

  return (
    <div className="p-2 sm:p-3 md:p-4 space-y-3 md:space-y-4 bg-gray-50 min-h-screen w-full overflow-x-hidden">
      {/* Compact Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Projects Overview
          </h1>
          <p className="text-xs text-gray-600 mt-0.5">
            Monitor your active projects and recent activity
          </p>
        </div>
        <div className="flex items-center gap-2 mt-3 md:mt-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/analytics')}
            className="flex items-center gap-1 text-xs px-3 py-1"
          >
            <BarChart3 className="w-3 h-3" />
            Analytics
          </Button>
        </div>
      </div>

      {/* Compact Metrics - Horizontal scroll on mobile */}
      <SimpleHorizontalCards 
        cards={metrics.map((metric, index) => ({
          id: `metric-${index}`,
          title: metric.title,
          value: metric.value,
          subtitle: metric.subtitle,
          icon: <metric.icon className={`w-4 h-4 ${metric.color}`} />,
          bgColor: 'bg-gray-100',
          trend: metric.change ? {
            value: Math.abs(metric.change),
            isUp: metric.trend === 'up'
          } : undefined
        }))}
        className="mb-4"
      />

      {/* Remove the old grid implementation */}
      <div className="hidden">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-600">{metric.title}</p>
                    <p className="text-lg font-bold text-gray-900 mt-1">{metric.value}</p>
                    <div className="flex items-center mt-1">
                      {metric.trend === 'up' ? (
                        <TrendingUp className="w-3 h-3 text-green-500 mr-1" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-500 mr-1" />
                      )}
                      <span className={`text-xs font-medium ${
                        metric.trend === 'up' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {metric.change > 0 ? '+' : ''}{metric.change}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{metric.subtitle}</p>
                  </div>
                  <div className={`p-2 rounded-lg bg-gray-100`}>
                    <metric.icon className={`w-4 h-4 ${metric.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Compact Charts Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        {/* Revenue Chart - Takes 3 columns */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="w-4 h-4 text-red-600" />
              Revenue & Profit Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revenueData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 10 }}
                    axisLine={{ stroke: '#e0e0e0' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    axisLine={{ stroke: '#e0e0e0' }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    fill="url(#revenueGradient)"
                    stroke="#EF4444"
                    strokeWidth={2}
                    name="Revenue"
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={{ fill: '#3B82F6', strokeWidth: 1, r: 3 }}
                    name="Profit"
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    stroke="#DC2626"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={{ fill: '#DC2626', strokeWidth: 1, r: 2 }}
                    name="Target"
                  />
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Project Status Pie Chart - Takes 2 columns */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Briefcase className="w-4 h-4 text-[#243d8a]" />
              Project Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={projectStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {projectStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Second Row Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {/* Department Performance Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="w-4 h-4 text-[#243d8a]" />
              Department Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={departmentData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10 }}
                    axisLine={{ stroke: '#e0e0e0' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    axisLine={{ stroke: '#e0e0e0' }}
                  />
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="target" fill="#e5e7eb" name="Target" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="value" fill="#3B82F6" name="Actual" radius={[2, 2, 0, 0]} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Performance Overview */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="w-4 h-4 text-red-600" />
              Performance Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 xxs:grid-cols-2 gap-2">
              {performanceData.map((item, index) => (
                <div key={item.name} className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-600">{item.name}</div>
                  <div className="text-lg font-bold text-gray-900">{item.value}%</div>
                  <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                    <div
                      className={`h-1 rounded-full ${index % 2 === 0 ? 'bg-red-500' : 'bg-[#243d8a]'}`}
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects and Activities - Compact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {/* Active Projects - Compact */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Briefcase className="w-4 h-4 text-[#243d8a]" />
                Active Projects
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/projects')}
                className="text-xs h-6 px-2"
              >
                View All
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {projects.map((project) => (
              <div key={project.id} className="p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-gray-900">{project.name}</h4>
                    <p className="text-xs text-gray-600">{project.client}</p>
                  </div>
                  <Badge className={`${getStatusColor(project.status)} text-xs`}>
                    {project.status}
                  </Badge>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Progress</span>
                    <span className="font-medium">{project.progress}%</span>
                  </div>
                  <Progress value={project.progress} className="h-1" />
                </div>

                <div className="grid grid-cols-2 xxs:grid-cols-3 gap-2 mt-2 text-xs">
                  <div>
                    <span className="text-gray-500">Budget</span>
                    <p className="font-semibold">AED {(project.budget / 1000).toFixed(0)}K</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Spent</span>
                    <p className="font-semibold text-[#243d8a]">
                      AED {(project.spent / 1000).toFixed(0)}K
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Manager</span>
                    <p className="font-semibold">{project.manager}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity - Compact */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-gray-600" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-2 p-2 hover:bg-gray-50 rounded transition-colors">
                <div className="mt-0.5">{getActivityIcon(activity.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900">{activity.title}</p>
                  <p className="text-xs text-gray-600">{activity.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{activity.time}</span>
                    {activity.user && (
                      <>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500">{activity.user}</span>
                      </>
                    )}
                  </div>
                </div>
                {activity.urgent && (
                  <AlertCircle className="w-3 h-3 text-red-500 animate-pulse" />
                )}
              </div>
            ))}
            
            <div className="pt-2 border-t">
              <Button
                variant="outline"
                className="w-full text-xs h-7"
                onClick={() => navigate('/notifications')}
              >
                View All Activity
                <Bell className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ModernDashboard;