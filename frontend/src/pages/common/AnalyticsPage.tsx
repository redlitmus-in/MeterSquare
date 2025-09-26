import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDate } from '@/utils/dateFormatter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Treemap,
  ScatterChart,
  Scatter,
  ComposedChart,
  FunnelChart,
  Funnel,
  LabelList,
  RadialBarChart,
  RadialBar
} from 'recharts';
import { 
  BarChart3,
  TrendingUp,
  TrendingDown,
  Banknote,
  ShoppingCart,
  Package,
  Users,
  Calendar,
  Download,
  Filter,
  Eye,
  ArrowUp,
  ArrowDown,
  Target,
  AlertCircle,
  CheckCircle,
  Clock,
  PieChart,
  BarChart,
  TrendingUp as LineChart,
  Activity,
  Layers,
  Zap,
  Globe,
  Award,
  Sparkles,
  Settings,
  RefreshCw,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Star,
  Gauge
} from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface ChartData {
  name: string;
  value: number;
  change: number;
  color: string;
}

interface ReportData {
  id: string;
  title: string;
  description: string;
  category: string;
  lastGenerated: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  status: 'generated' | 'pending' | 'error';
}

const AnalyticsPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState('30d');
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedChart, setExpandedChart] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setRefreshing(false);
  };

  // Enhanced chart data with more advanced datasets
  const procurementData: ChartData[] = [
    { name: 'Jan', value: 125000, change: 12, color: '#ef4444' },
    { name: 'Feb', value: 145000, change: 16, color: '#ef4444' },
    { name: 'Mar', value: 132000, change: -9, color: '#ef4444' },
    { name: 'Apr', value: 168000, change: 27, color: '#ef4444' },
    { name: 'May', value: 189000, change: 13, color: '#ef4444' },
    { name: 'Jun', value: 205000, change: 8, color: '#ef4444' },
    { name: 'Jul', value: 225000, change: 10, color: '#ef4444' },
    { name: 'Aug', value: 245000, change: 9, color: '#ef4444' }
  ];

  const projectData: ChartData[] = [
    { name: 'Completed', value: 24, change: 20, color: '#10B981' },
    { name: 'In Progress', value: 15, change: 7, color: '#3B82F6' },
    { name: 'On Hold', value: 3, change: -2, color: '#F59E0B' },
    { name: 'Cancelled', value: 2, change: -1, color: '#EF4444' }
  ];

  const vendorPerformance: ChartData[] = [
    { name: 'Excellent', value: 12, change: 3, color: '#10B981' },
    { name: 'Good', value: 18, change: 2, color: '#3B82F6' },
    { name: 'Average', value: 8, change: -1, color: '#F59E0B' },
    { name: 'Poor', value: 2, change: -1, color: '#EF4444' }
  ];

  // Advanced analytics datasets
  const performanceRadarData = [
    { subject: 'Quality', A: 120, B: 110, fullMark: 150 },
    { subject: 'Cost', A: 98, B: 130, fullMark: 150 },
    { subject: 'Time', A: 86, B: 130, fullMark: 150 },
    { subject: 'Innovation', A: 99, B: 100, fullMark: 150 },
    { subject: 'Safety', A: 85, B: 90, fullMark: 150 },
    { subject: 'Sustainability', A: 65, B: 85, fullMark: 150 }
  ];

  const heatmapData = [
    { name: 'Engineering', Q1: 45, Q2: 52, Q3: 48, Q4: 61, efficiency: 92 },
    { name: 'Procurement', Q1: 38, Q2: 41, Q3: 45, Q4: 48, efficiency: 88 },
    { name: 'Quality', Q1: 42, Q2: 38, Q3: 41, Q4: 44, efficiency: 85 },
    { name: 'Operations', Q1: 35, Q2: 42, Q3: 38, Q4: 41, efficiency: 78 },
    { name: 'Finance', Q1: 28, Q2: 32, Q3: 35, Q4: 38, efficiency: 82 }
  ];

  const scatterData = [
    { x: 85, y: 92, z: 45, name: 'Project Alpha' },
    { x: 78, y: 88, z: 38, name: 'Project Beta' },
    { x: 92, y: 95, z: 52, name: 'Project Gamma' },
    { x: 88, y: 87, z: 41, name: 'Project Delta' },
    { x: 91, y: 93, z: 48, name: 'Project Epsilon' },
    { x: 76, y: 82, z: 35, name: 'Project Zeta' }
  ];

  const funnelData = [
    { name: 'Leads', value: 1000, fill: '#8884d8' },
    { name: 'Qualified', value: 750, fill: '#83a6ed' },
    { name: 'Proposals', value: 500, fill: '#8dd1e1' },
    { name: 'Contracts', value: 300, fill: '#82ca9d' },
    { name: 'Completed', value: 180, fill: '#ffc658' }
  ];

  const treemapData = [
    { name: 'Engineering', size: 3500, children: [
      { name: 'Structural', size: 1200 },
      { name: 'Electrical', size: 1100 },
      { name: 'Mechanical', size: 800 },
      { name: 'Civil', size: 400 }
    ]},
    { name: 'Operations', size: 2800, children: [
      { name: 'Site Management', size: 1200 },
      { name: 'Quality Control', size: 900 },
      { name: 'Safety', size: 700 }
    ]},
    { name: 'Procurement', size: 2200, children: [
      { name: 'Materials', size: 1000 },
      { name: 'Equipment', size: 700 },
      { name: 'Services', size: 500 }
    ]}
  ];

  // Sample reports data
  const reports: ReportData[] = [
    {
      id: '1',
      title: 'Procurement Spending Analysis',
      description: 'Detailed analysis of procurement spending across all projects',
      category: 'Financial',
      lastGenerated: '2024-08-25',
      frequency: 'monthly',
      status: 'generated'
    },
    {
      id: '2',
      title: 'Vendor Performance Report',
      description: 'Performance metrics and ratings for all active vendors',
      category: 'Vendor Management',
      lastGenerated: '2024-08-24',
      frequency: 'weekly',
      status: 'generated'
    },
    {
      id: '3',
      title: 'Project Progress Dashboard',
      description: 'Real-time project progress and milestone tracking',
      category: 'Project Management',
      lastGenerated: '2024-08-25',
      frequency: 'daily',
      status: 'generated'
    },
    {
      id: '4',
      title: 'Cost Overrun Analysis',
      description: 'Analysis of budget vs actual costs across projects',
      category: 'Financial',
      lastGenerated: '2024-08-23',
      frequency: 'monthly',
      status: 'pending'
    },
    {
      id: '5',
      title: 'Approval Workflow Metrics',
      description: 'Time analysis and bottlenecks in approval processes',
      category: 'Operations',
      lastGenerated: '2024-08-24',
      frequency: 'weekly',
      status: 'generated'
    }
  ];

  const getStatusBadge = (status: ReportData['status']) => {
    const configs = {
      generated: { color: 'bg-green-100 text-green-700 border-green-300', icon: CheckCircle, label: 'Generated' },
      pending: { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: Clock, label: 'Pending' },
      error: { color: 'bg-red-100 text-red-700 border-red-300', icon: AlertCircle, label: 'Error' }
    };
    const config = configs[status];
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.color} border flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const getFrequencyBadge = (frequency: ReportData['frequency']) => {
    const colors = {
      daily: 'bg-[#243d8a]/10 text-[#243d8a]/90 border-[#243d8a]/30',
      weekly: 'bg-purple-100 text-purple-700 border-purple-300',
      monthly: 'bg-orange-100 text-orange-700 border-orange-300'
    };
    
    return (
      <Badge className={`${colors[frequency]} border`}>
        <Calendar className="w-3 h-3 mr-1" />
        {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-amber-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-20 h-20 border-4 border-orange-200 border-t-orange-600 rounded-full mx-auto mb-6"
          />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading Advanced Analytics</h2>
            <p className="text-gray-600">Preparing premium charts and insights...</p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-amber-50 relative overflow-hidden">
      {/* Premium background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-orange-400/10 to-red-400/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-amber-400/10 to-orange-400/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-yellow-400/5 to-orange-400/5 rounded-full blur-3xl animate-pulse delay-500" />
      </div>
      
      <div className="relative z-10 p-6 space-y-6">
        {/* Premium Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative backdrop-blur-xl bg-white/80 border border-white/20 rounded-2xl shadow-2xl p-8 overflow-hidden"
        >
          {/* Glassmorphism overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 via-amber-500/5 to-yellow-500/5" />
          
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                whileHover={{ scale: 1.1, rotate: 360 }}
                transition={{ duration: 0.5 }}
                className="p-4 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl shadow-lg"
              >
                <Sparkles className="w-8 h-8 text-white" />
              </motion.div>
              <div>
                <motion.h1 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-orange-900 to-amber-900 bg-clip-text text-transparent"
                >
                  Advanced Analytics
                </motion.h1>
                <motion.p 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-gray-600 mt-2 flex items-center gap-2"
                >
                  <Globe className="w-4 h-4" />
                  Premium business insights and performance metrics
                </motion.p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="backdrop-blur-sm bg-white/50 border-white/30 hover:bg-white/70 flex items-center gap-2 shadow-lg"
                >
                  {refreshing ? (
                    <ModernLoadingSpinners variant="pulse-wave" size="sm" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Refresh
                </Button>
              </motion.div>
              
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-40 backdrop-blur-sm bg-white/50 border-white/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="backdrop-blur-xl bg-white/90">
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="3m">Last 3 months</SelectItem>
                  <SelectItem value="6m">Last 6 months</SelectItem>
                  <SelectItem value="1y">Last year</SelectItem>
                </SelectContent>
              </Select>
              
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 hover:from-orange-700 hover:via-amber-700 hover:to-orange-800 text-white flex items-center gap-2 shadow-xl"
                  onClick={() => {
                    // Generate sample analytics report data
                    const reportData = {
                      generated: new Date().toISOString(),
                      timeRange: timeRange,
                      metrics: {
                        totalProcurement: 'AED 1.2M',
                        activeProjects: 44,
                        vendorPartners: 127,
                        costSavings: 'AED 185K',
                        efficiencyScore: '94.2%',
                        qualityRating: '4.8/5'
                      },
                      summary: 'Premium Analytics Report generated from MeterSquare ERP'
                    };
                    
                    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `analytics_report_${formatDate(new Date()).replace(/\//g, '-')}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="w-4 h-4" />
                  Export Premium Report
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Premium Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { title: 'Total Procurement', value: 'AED 1.2M', change: '+12%', icon: ShoppingCart, gradient: 'from-red-500 to-pink-500', bgGradient: 'from-red-50 to-pink-50' },
            { title: 'Active Projects', value: '44', change: '+8%', icon: Package, gradient: 'from-[#243d8a] to-cyan-500', bgGradient: 'from-[#243d8a]/5 to-cyan-50' },
            { title: 'Vendor Partners', value: '127', change: '+15%', icon: Users, gradient: 'from-green-500 to-emerald-500', bgGradient: 'from-green-50 to-emerald-50' },
            { title: 'Cost Savings', value: 'AED 185K', change: '+23%', icon: Target, gradient: 'from-purple-500 to-violet-500', bgGradient: 'from-purple-50 to-violet-50' },
            { title: 'Efficiency Score', value: '94.2%', change: '+5%', icon: Zap, gradient: 'from-orange-500 to-amber-500', bgGradient: 'from-orange-50 to-amber-50' },
            { title: 'Quality Rating', value: '4.8/5', change: '+2%', icon: Star, gradient: 'from-indigo-500 to-purple-500', bgGradient: 'from-indigo-50 to-purple-50' }
          ].map((metric, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group"
            >
              <Card className={`relative border-0 backdrop-blur-xl bg-gradient-to-br ${metric.bgGradient} shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer`}>
                {/* Animated shimmer effect */}
                <div className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent transform translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                
                <CardContent className="p-6 relative z-10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-2 font-medium">{metric.title}</p>
                      <motion.p 
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.1 + 0.3 }}
                        className="text-3xl font-bold text-gray-900 mb-3 group-hover:text-gray-800 transition-colors"
                      >
                        {metric.value}
                      </motion.p>
                      <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 + 0.4 }}
                        className="flex items-center"
                      >
                        <div className="flex items-center px-2 py-1 rounded-full bg-green-100 text-green-700">
                          <TrendingUp className="w-3 h-3 mr-1" />
                          <span className="text-xs font-semibold">{metric.change}</span>
                        </div>
                        <span className="text-xs text-gray-500 ml-2">vs last month</span>
                      </motion.div>
                    </div>
                    <motion.div 
                      whileHover={{ scale: 1.2, rotate: 5 }}
                      className={`p-4 rounded-xl bg-gradient-to-br ${metric.gradient} shadow-lg group-hover:shadow-xl transition-shadow duration-300`}
                    >
                      <metric.icon className="w-7 h-7 text-white" />
                    </motion.div>
                  </div>
                  
                  {/* Progress indicator */}
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ delay: index * 0.1 + 0.6, duration: 0.8 }}
                    className={`absolute bottom-0 left-0 h-1 bg-gradient-to-r ${metric.gradient} opacity-70 group-hover:opacity-100 transition-opacity duration-300`}
                  />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-white shadow-sm border">
          <TabsTrigger value="overview" className="data-[state=active]:bg-orange-50">
            <BarChart className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="procurement" className="data-[state=active]:bg-orange-50">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Procurement
          </TabsTrigger>
          <TabsTrigger value="projects" className="data-[state=active]:bg-orange-50">
            <Package className="w-4 h-4 mr-2" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="reports" className="data-[state=active]:bg-orange-50">
            <Calendar className="w-4 h-4 mr-2" />
            Reports
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Procurement Trend Chart */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-orange-50 to-orange-100 border-b">
                <CardTitle className="flex items-center gap-2">
                  <LineChart className="w-5 h-5 text-orange-600" />
                  Procurement Spending Trend
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {procurementData.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <span className="font-medium text-gray-900">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-gray-900">${(item.value / 1000).toFixed(0)}K</span>
                        <div className={`flex items-center gap-1 ${item.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {item.change >= 0 ? (
                            <ArrowUp className="w-4 h-4" />
                          ) : (
                            <ArrowDown className="w-4 h-4" />
                          )}
                          <span className="text-sm font-medium">{Math.abs(item.change)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Interactive Line Chart */}
                <div className="mt-6 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={procurementData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 12 }}
                        axisLine={{ stroke: '#e0e0e0' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        axisLine={{ stroke: '#e0e0e0' }}
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
                      />
                      <Tooltip 
                        formatter={(value: any) => [`$${(value / 1000).toFixed(0)}K`, 'Procurement']}
                        labelStyle={{ color: '#374151' }}
                        contentStyle={{ 
                          backgroundColor: '#ffffff', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#ef4444" 
                        strokeWidth={3}
                        dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, fill: '#dc2626' }}
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Project Status Distribution */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-orange-50 to-orange-100 border-b">
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-orange-600" />
                  Project Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {projectData.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          item.name === 'Completed' ? 'bg-green-500' :
                          item.name === 'In Progress' ? 'bg-blue-500' :
                          item.name === 'On Hold' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}></div>
                        <span className="font-medium text-gray-900">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-gray-900">{item.value}</span>
                        <div className={`flex items-center gap-1 ${item.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {item.change >= 0 ? (
                            <ArrowUp className="w-4 h-4" />
                          ) : (
                            <ArrowDown className="w-4 h-4" />
                          )}
                          <span className="text-sm font-medium">{Math.abs(item.change)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Interactive Pie Chart */}
                <div className="mt-6 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={projectData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {projectData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: any) => [value, 'Projects']}
                        contentStyle={{ 
                          backgroundColor: '#ffffff', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={36}
                        formatter={(value) => <span className="text-gray-700 text-xs">{value}</span>}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Procurement Tab */}
        <TabsContent value="procurement">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Procurement KPIs */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-red-50 to-red-100 border-b">
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-red-600" />
                  Procurement KPIs
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {[
                  { label: 'Purchase Orders', value: '156', change: '+12%' },
                  { label: 'Average Order Value', value: 'AED 7.8K', change: '+8%' },
                  { label: 'Approval Time', value: '2.3 days', change: '-15%' },
                  { label: 'Cost Savings', value: '12.5%', change: '+3%' }
                ].map((kpi, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">{kpi.label}</span>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">{kpi.value}</p>
                      <p className="text-xs text-green-600">{kpi.change}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Vendor Performance */}
            <Card className="lg:col-span-2 shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-red-50 to-red-100 border-b">
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-red-600" />
                  Vendor Performance Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {vendorPerformance.map((item, index) => (
                    <div key={index} className="text-center">
                      <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-2 ${
                        item.name === 'Excellent' ? 'bg-green-100' :
                        item.name === 'Good' ? 'bg-blue-100' :
                        item.name === 'Average' ? 'bg-yellow-100' : 'bg-red-100'
                      }`}>
                        <span className={`font-bold text-lg ${
                          item.name === 'Excellent' ? 'text-green-600' :
                          item.name === 'Good' ? 'text-blue-600' :
                          item.name === 'Average' ? 'text-yellow-600' : 'text-red-600'
                        }`}>{item.value}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className={`text-xs ${item.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.change >= 0 ? '+' : ''}{item.change}
                      </p>
                    </div>
                  ))}
                </div>
                
                {/* Interactive Bar Chart */}
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={vendorPerformance} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 11 }}
                        axisLine={{ stroke: '#e0e0e0' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 11 }}
                        axisLine={{ stroke: '#e0e0e0' }}
                      />
                      <Tooltip 
                        formatter={(value: any) => [value, 'Vendors']}
                        contentStyle={{ 
                          backgroundColor: '#ffffff', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <Bar 
                        dataKey="value" 
                        radius={[4, 4, 0, 0]}
                      >
                        {vendorPerformance.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects">
          <div className="space-y-6">
            {/* Budget Overview Chart */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b">
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-[#243d8a]" />
                  Monthly Budget vs Actual Spending
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={[
                        { month: 'Jan', budget: 450, actual: 425, variance: -25 },
                        { month: 'Feb', budget: 380, actual: 395, variance: 15 },
                        { month: 'Mar', budget: 520, actual: 485, variance: -35 },
                        { month: 'Apr', budget: 420, actual: 445, variance: 25 },
                        { month: 'May', budget: 380, actual: 365, variance: -15 },
                        { month: 'Jun', budget: 480, actual: 505, variance: 25 }
                      ]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="month" 
                        tick={{ fontSize: 12 }}
                        axisLine={{ stroke: '#e0e0e0' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        axisLine={{ stroke: '#e0e0e0' }}
                        tickFormatter={(value) => `$${value}K`}
                      />
                      <Tooltip 
                        formatter={(value: any, name: string) => [`$${value}K`, name === 'budget' ? 'Budget' : name === 'actual' ? 'Actual' : 'Variance']}
                        contentStyle={{ 
                          backgroundColor: '#ffffff', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="budget"
                        stackId="1"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.3}
                        name="Budget"
                      />
                      <Area
                        type="monotone"
                        dataKey="actual"
                        stackId="2"
                        stroke="#ef4444"
                        fill="#ef4444"
                        fillOpacity={0.3}
                        name="Actual"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Project Timeline */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#243d8a]" />
                  Project Timeline & Milestones
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {[
                    { project: 'Marina Bay Residential', progress: 85, status: 'On Track', dueDate: '2024-09-15' },
                    { project: 'Orchard Office Tower', progress: 62, status: 'Delayed', dueDate: '2024-10-30' },
                    { project: 'Sentosa Resort Renovation', progress: 95, status: 'Ahead', dueDate: '2024-08-30' },
                    { project: 'Clarke Quay Commercial', progress: 40, status: 'At Risk', dueDate: '2024-11-20' }
                  ].map((project, index) => (
                    <div key={index} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{project.project}</h4>
                        <Badge className={
                          project.status === 'On Track' ? 'bg-green-100 text-green-700 border-green-300' :
                          project.status === 'Ahead' ? 'bg-[#243d8a]/10 text-[#243d8a]/90 border-[#243d8a]/30' :
                          project.status === 'Delayed' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                          'bg-red-100 text-red-700 border-red-300'
                        }>
                          {project.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>{project.progress}% Complete</span>
                        <span>Due: {project.dueDate}</span>
                      </div>
                      <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            project.status === 'On Track' || project.status === 'Ahead' ? 'bg-green-500' :
                            project.status === 'Delayed' ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${project.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Budget Analysis */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b">
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-[#243d8a]" />
                  Budget vs Actual Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  {[
                    { category: 'Materials', budget: 450000, actual: 425000, variance: -25000 },
                    { category: 'Labor', budget: 320000, actual: 335000, variance: 15000 },
                    { category: 'Equipment', budget: 180000, actual: 165000, variance: -15000 },
                    { category: 'Subcontractors', budget: 280000, actual: 295000, variance: 15000 }
                  ].map((item, index) => (
                    <div key={index} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{item.category}</h4>
                        <div className={`flex items-center gap-1 ${item.variance <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {item.variance <= 0 ? (
                            <ArrowDown className="w-4 h-4" />
                          ) : (
                            <ArrowUp className="w-4 h-4" />
                          )}
                          <span className="text-sm font-medium">
                            ${Math.abs(item.variance / 1000).toFixed(0)}K {item.variance <= 0 ? 'under' : 'over'}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Budget: </span>
                          <span className="font-medium">${(item.budget / 1000).toFixed(0)}K</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Actual: </span>
                          <span className="font-medium">${(item.actual / 1000).toFixed(0)}K</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            </div>
          </div>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports">
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-orange-100 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-orange-600" />
                  Automated Reports
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Filter className="w-4 h-4 mr-2" />
                    Filter
                  </Button>
                  <Button 
                    className="bg-orange-600 hover:bg-orange-700 text-white" 
                    size="sm"
                    onClick={() => {
                      const allReports = {
                        generated: new Date().toISOString(),
                        reports: [
                          { name: 'Monthly Procurement Report', generated: '2024-01-01', status: 'ready' },
                          { name: 'Vendor Performance Report', generated: '2024-01-15', status: 'ready' },
                          { name: 'Cost Analysis Report', generated: '2024-02-01', status: 'ready' },
                          { name: 'Project Status Report', generated: '2024-02-15', status: 'ready' }
                        ]
                      };
                      
                      const blob = new Blob([JSON.stringify(allReports, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `all_reports_${formatDate(new Date()).replace(/\//g, '-')}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Report
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Frequency
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Generated
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reports.map((report, index) => (
                      <motion.tr 
                        key={report.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="hover:bg-gray-50 transition-colors duration-200"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <div className="font-semibold text-gray-900">{report.title}</div>
                            <div className="text-sm text-gray-500">{report.description}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="text-xs">
                            {report.category}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          {getFrequencyBadge(report.frequency)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">{report.lastGenerated}</div>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(report.status)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-gray-600 hover:text-gray-900"
                              onClick={() => {
                                alert(`Viewing report: ${report.title}\n\nThis would open a detailed view of the report.`);
                              }}
                              title="View Report"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-gray-600 hover:text-gray-900"
                              onClick={() => {
                                const reportData = {
                                  title: report.title,
                                  description: report.description,
                                  category: report.category,
                                  frequency: report.frequency,
                                  lastGenerated: report.lastGenerated,
                                  status: report.status,
                                  data: 'Report content would be here...'
                                };
                                
                                const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${report.title.replace(/\s+/g, '_').toLowerCase()}.json`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              }}
                              title="Download Report"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};

export default AnalyticsPage;