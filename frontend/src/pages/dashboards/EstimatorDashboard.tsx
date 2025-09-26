import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Calculator,
  FileText,
  TrendingUp,
  DollarSign,
  BarChart3,
  Clock,
  CheckCircle,
  AlertCircle,
  Upload,
  Eye,
  Send,
  Package,
  Activity,
  Target,
  Briefcase
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import BaseDashboard from './BaseDashboard';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import { BOQDashboardMetrics } from '@/roles/estimator/types';
import { toast } from 'sonner';
import { format } from 'date-fns';

const EstimatorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<BOQDashboardMetrics | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await estimatorService.getDashboardMetrics();
      if (response.success && response.data) {
        setMetrics(response.data);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
    toast.success('Dashboard refreshed');
  };

  const baseMetrics = metrics ? [
    {
      title: 'Total BOQs',
      value: metrics.totalBOQs,
      change: '+12%',
      icon: FileText,
      color: 'text-blue-600'
    },
    {
      title: 'Pending Approval',
      value: metrics.pendingBOQs,
      icon: Clock,
      color: 'text-yellow-600'
    },
    {
      title: 'Approved BOQs',
      value: metrics.approvedBOQs,
      change: '+8%',
      icon: CheckCircle,
      color: 'text-green-600'
    },
    {
      title: 'Total Project Value',
      value: `AED ${(metrics.totalProjectValue / 1000000).toFixed(1)}M`,
      change: '+15%',
      icon: DollarSign,
      color: 'text-purple-600'
    }
  ] : [];

  if (loading) {
    return <ModernLoadingSpinners variant="pulse" color="blue" />;
  }

  return (
    <BaseDashboard
      title="Estimator Dashboard"
      subtitle="BOQ Management and Cost Analysis"
      metrics={baseMetrics}
    >
      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        <Button
          onClick={() => navigate('/estimator/boq-management')}
          className="bg-blue-600 hover:bg-blue-700 text-white h-auto flex flex-col items-center justify-center p-4"
        >
          <Upload className="h-6 w-6 mb-2" />
          <span>Upload BOQ</span>
        </Button>
        <Button
          onClick={() => navigate('/estimator/boq-management?tab=pending')}
          variant="outline"
          className="h-auto flex flex-col items-center justify-center p-4 border-yellow-600 text-yellow-600 hover:bg-yellow-50"
        >
          <Eye className="h-6 w-6 mb-2" />
          <span>View Pending</span>
        </Button>
        <Button
          onClick={() => navigate('/estimator/boq-management?tab=approved')}
          variant="outline"
          className="h-auto flex flex-col items-center justify-center p-4 border-green-600 text-green-600 hover:bg-green-50"
        >
          <CheckCircle className="h-6 w-6 mb-2" />
          <span>Approved BOQs</span>
        </Button>
        <Button
          onClick={() => navigate('/estimator/cost-analysis')}
          variant="outline"
          className="h-auto flex flex-col items-center justify-center p-4 border-purple-600 text-purple-600 hover:bg-purple-50"
        >
          <BarChart3 className="h-6 w-6 mb-2" />
          <span>Cost Analysis</span>
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent BOQ Activities */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics?.recentActivities.map((activity) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="mt-1">
                    {activity.action === 'Created' && <Upload className="h-4 w-4 text-blue-600" />}
                    {activity.action === 'Approved' && <CheckCircle className="h-4 w-4 text-green-600" />}
                    {activity.action === 'Updated' && <AlertCircle className="h-4 w-4 text-yellow-600" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {activity.action} - {activity.boq}
                    </p>
                    <p className="text-xs text-gray-500">
                      by {activity.user} • {activity.timestamp}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Projects by Value */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Top Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics?.topProjects.map((project, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Package className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{project.name}</p>
                      <p className="text-sm text-gray-500">
                        AED {(project.value / 1000000).toFixed(2)}M
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={project.status === 'approved' ? 'default' : 'secondary'}
                    className={
                      project.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }
                  >
                    {project.status}
                  </Badge>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Monthly Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Monthly BOQ Trend
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/estimator/reports')}
            >
              View Reports
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {metrics?.monthlyTrend.map((month) => (
                <div key={month.month} className="text-center">
                  <div className="relative">
                    <div
                      className="bg-blue-100 rounded-t-lg transition-all duration-300 hover:bg-blue-200"
                      style={{
                        height: `${(month.count / 10) * 100}px`,
                        minHeight: '20px'
                      }}
                    />
                    <div className="text-xs font-semibold mt-2">{month.month}</div>
                    <div className="text-xs text-gray-500">{month.count} BOQs</div>
                    <div className="text-xs text-gray-600 font-medium">
                      AED {(month.value / 1000000).toFixed(1)}M
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">
                  {metrics?.averageApprovalTime.toFixed(1)} days
                </p>
                <p className="text-sm text-gray-600">Avg. Approval Time</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  {((metrics?.approvedBOQs || 0) / (metrics?.totalBOQs || 1) * 100).toFixed(0)}%
                </p>
                <p className="text-sm text-gray-600">Approval Rate</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">
                  {metrics?.totalBOQs || 0}
                </p>
                <p className="text-sm text-gray-600">Total BOQs</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-600">
                  {metrics?.pendingBOQs || 0}
                </p>
                <p className="text-sm text-gray-600">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </BaseDashboard>
  );
};

export default EstimatorDashboard;