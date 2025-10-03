import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ExclamationTriangleIcon,
  PlusIcon,
  CameraIcon,
  XMarkIcon,
  ClockIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';

interface Issue {
  id: number;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'reported' | 'acknowledged' | 'in-progress' | 'resolved';
  reportedAt: string;
  resolvedAt?: string;
  boqItem?: string;
  photos: string[];
}

const ReportIssue: React.FC = () => {
  const [showReportModal, setShowReportModal] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [issuePriority, setIssuePriority] = useState<'high' | 'medium' | 'low'>('medium');

  const [issues, setIssues] = useState<Issue[]>([
    {
      id: 1,
      title: 'Material shortage - Ceiling tiles',
      description: 'Running low on ceiling tiles. Need 50 more sqm to complete Section B.',
      priority: 'high',
      status: 'acknowledged',
      reportedAt: '1 hour ago',
      boqItem: 'False Ceiling - FC-02',
      photos: []
    },
    {
      id: 2,
      title: 'Quality issue - Glass panels damaged',
      description: '3 glass panels received with cracks. Need replacement before installation.',
      priority: 'medium',
      status: 'resolved',
      reportedAt: '3 hours ago',
      resolvedAt: '30 mins ago',
      boqItem: 'Glass Partition - PW-01',
      photos: []
    },
    {
      id: 3,
      title: 'Safety concern - Loose scaffolding',
      description: 'Scaffolding at Section A showing signs of instability. Needs immediate check.',
      priority: 'high',
      status: 'in-progress',
      reportedAt: '2 hours ago',
      photos: []
    }
  ]);

  const handleReportIssue = () => {
    if (!issueTitle.trim() || !issueDescription.trim()) {
      toast.error('Please provide title and description');
      return;
    }

    const newIssue: Issue = {
      id: Date.now(),
      title: issueTitle,
      description: issueDescription,
      priority: issuePriority,
      status: 'reported',
      reportedAt: 'Just now',
      photos: []
    };

    setIssues([newIssue, ...issues]);
    setShowReportModal(false);
    setIssueTitle('');
    setIssueDescription('');
    setIssuePriority('medium');
    toast.success('Issue reported to Project Manager');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'in-progress':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'acknowledged':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'reported':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-50 text-red-600 border-red-200';
      case 'medium':
        return 'bg-yellow-50 text-yellow-600 border-yellow-200';
      case 'low':
        return 'bg-green-50 text-green-600 border-green-200';
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="bg-gradient-to-r from-red-50 to-red-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
                <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-red-900">Report Issue</h1>
                <p className="text-sm text-red-700 mt-1">Escalate site issues to Project Manager</p>
              </div>
            </div>
            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Report New Issue
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <p className="text-sm text-gray-500">Total Issues</p>
            <p className="text-2xl font-bold text-gray-900">{issues.length}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <p className="text-sm text-gray-500">Resolved</p>
            <p className="text-2xl font-bold text-green-600">
              {issues.filter(i => i.status === 'resolved').length}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <p className="text-sm text-gray-500">In Progress</p>
            <p className="text-2xl font-bold text-blue-600">
              {issues.filter(i => i.status === 'in-progress' || i.status === 'acknowledged').length}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <p className="text-sm text-gray-500">High Priority</p>
            <p className="text-2xl font-bold text-red-600">
              {issues.filter(i => i.priority === 'high').length}
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-4">Reported Issues</h2>

          <div className="space-y-4">
            {issues.map((issue, index) => (
              <motion.div
                key={issue.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="border border-gray-200 rounded-xl p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-gray-900 text-lg">{issue.title}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(issue.priority)}`}>
                        {issue.priority} priority
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{issue.description}</p>
                    {issue.boqItem && (
                      <p className="text-xs text-gray-500">Related to: {issue.boqItem}</p>
                    )}
                  </div>

                  <div className="ml-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${getStatusColor(issue.status)}`}>
                      {issue.status}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" />
                    <span>Reported: {issue.reportedAt}</span>
                  </div>
                  {issue.resolvedAt && (
                    <div className="flex items-center gap-1">
                      <CheckCircleIcon className="w-3 h-3 text-green-600" />
                      <span>Resolved: {issue.resolvedAt}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Report Issue Modal */}
        {showReportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full"
            >
              <div className="bg-gradient-to-r from-red-50 to-red-100 px-6 py-4 border-b border-red-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-red-900">Report New Issue</h2>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-6 h-6 text-red-900" />
                </button>
              </div>

              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Issue Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={issueTitle}
                      onChange={(e) => setIssueTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Brief title of the issue"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={issueDescription}
                      onChange={(e) => setIssueDescription(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      rows={4}
                      placeholder="Detailed description of the issue..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Priority
                    </label>
                    <select
                      value={issuePriority}
                      onChange={(e) => setIssuePriority(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Attach Photos (Optional)
                    </label>
                    <button className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-red-500 hover:bg-red-50 transition-colors w-full justify-center">
                      <CameraIcon className="w-5 h-5 text-gray-600" />
                      <span className="text-sm text-gray-600">Take or Upload Photos</span>
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReportIssue}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Report Issue
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportIssue;
