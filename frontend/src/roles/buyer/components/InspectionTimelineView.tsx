import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  ArrowLeftRight,
  Clock,
  AlertTriangle,
  Package,
  Shield,
  Truck,
  CheckCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/utils/formatters';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import {
  vendorInspectionService,
  InspectionTimelineEvent,
} from '@/services/vendorInspectionService';

// ============================================================================
// Props
// ============================================================================

interface InspectionTimelineViewProps {
  crId: number;
}

// ============================================================================
// Event config
// ============================================================================

interface EventConfig {
  icon: React.ReactNode;
  bgColor: string;
  lineColor: string;
}

const getEventConfig = (
  type: string,
  status: string,
): EventConfig => {
  // Determine color by status
  const isSuccess = [
    'fully_approved',
    'approved',
    'td_approved',
    'completed',
    'closed',
    'refund_confirmed',
    'new_vendor_approved',
    'delivered',
  ].includes(status);

  const isPending = [
    'pending',
    'pending_td_approval',
    'return_in_progress',
    'return_initiated',
    'new_vendor_selected',
    'replacement_ordered',
    'created',
  ].includes(status);

  const isRejected = [
    'fully_rejected',
    'partially_approved',
    'td_rejected',
    'rejected',
  ].includes(status);

  let bgColor = 'bg-gray-100';
  let lineColor = 'bg-gray-300';

  if (isSuccess) {
    bgColor = 'bg-green-100';
    lineColor = 'bg-green-400';
  } else if (isPending) {
    bgColor = 'bg-amber-100';
    lineColor = 'bg-amber-400';
  } else if (isRejected) {
    bgColor = 'bg-red-100';
    lineColor = 'bg-red-400';
  }

  // Determine icon by event type
  let icon: React.ReactNode;
  switch (type) {
    case 'inspection':
      icon = (
        <Search
          className={`w-4 h-4 ${
            isSuccess
              ? 'text-green-600'
              : isPending
                ? 'text-amber-600'
                : isRejected
                  ? 'text-red-600'
                  : 'text-gray-500'
          }`}
        />
      );
      break;
    case 'return_request':
      icon = (
        <ArrowLeftRight
          className={`w-4 h-4 ${
            isSuccess
              ? 'text-green-600'
              : isPending
                ? 'text-amber-600'
                : isRejected
                  ? 'text-red-600'
                  : 'text-gray-500'
          }`}
        />
      );
      break;
    case 'return_request_td':
      icon = (
        <Shield
          className={`w-4 h-4 ${
            isSuccess ? 'text-green-600' : isRejected ? 'text-red-600' : 'text-blue-600'
          }`}
        />
      );
      break;
    case 'return_initiated':
      icon = (
        <Truck
          className={`w-4 h-4 ${isPending ? 'text-amber-600' : 'text-blue-600'}`}
        />
      );
      break;
    case 'return_completed':
      icon = (
        <CheckCircle className="w-4 h-4 text-green-600" />
      );
      break;
    case 'iteration':
      icon = (
        <RefreshCw
          className={`w-4 h-4 ${
            isSuccess
              ? 'text-green-600'
              : isPending
                ? 'text-amber-600'
                : isRejected
                  ? 'text-red-600'
                  : 'text-gray-500'
          }`}
        />
      );
      break;
    default:
      icon = (
        <Package
          className={`w-4 h-4 ${
            isSuccess
              ? 'text-green-600'
              : isPending
                ? 'text-amber-600'
                : isRejected
                  ? 'text-red-600'
                  : 'text-gray-500'
          }`}
        />
      );
  }

  return { icon, bgColor, lineColor };
};

const getStatusBadge = (status: string): React.ReactNode => {
  const isSuccess = [
    'fully_approved',
    'approved',
    'td_approved',
    'completed',
    'closed',
    'refund_confirmed',
    'new_vendor_approved',
    'delivered',
  ].includes(status);

  const isPending = [
    'pending',
    'pending_td_approval',
    'return_in_progress',
    'return_initiated',
    'new_vendor_selected',
    'replacement_ordered',
    'created',
  ].includes(status);

  const isRejected = [
    'fully_rejected',
    'partially_approved',
    'td_rejected',
    'rejected',
  ].includes(status);

  let className = 'bg-gray-100 text-gray-700 border-gray-200';
  if (isSuccess) className = 'bg-green-100 text-green-800 border-green-200';
  else if (isPending)
    className = 'bg-amber-100 text-amber-800 border-amber-200';
  else if (isRejected) className = 'bg-red-100 text-red-800 border-red-200';

  return (
    <Badge className={`${className} text-[10px] px-1.5 py-0`}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
};

// ============================================================================
// Component
// ============================================================================

const InspectionTimelineView: React.FC<InspectionTimelineViewProps> = ({
  crId,
}) => {
  const [events, setEvents] = useState<InspectionTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!crId) return;
    fetchTimeline();
  }, [crId]);

  const fetchTimeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await vendorInspectionService.getInspectionTimeline(crId);
      if (result.success) {
        setEvents(result.data?.timeline || []);
      } else {
        setError('Failed to load timeline');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  };

  // Summary stats
  const stats = useMemo(() => {
    const inspections = events.filter((e) => e.type === 'inspection').length;
    const returnRequests = events.filter(
      (e) => e.type === 'return_request' || e.type === 'return_request_td' || e.type === 'return_initiated' || e.type === 'return_completed',
    ).length;
    const iterations = events.filter((e) => e.type === 'iteration').length;
    return { inspections, returnRequests, iterations };
  }, [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <ModernLoadingSpinners size="sm" />
        <span className="text-sm text-gray-500 ml-3">Loading timeline...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-6 px-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        {error}
        <button
          onClick={fetchTimeline}
          className="ml-auto text-red-700 hover:text-red-800 underline text-xs"
        >
          Retry
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">No timeline events found for this CR.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-full px-3 py-1 text-xs font-medium">
          <Search className="w-3 h-3" />
          {stats.inspections} Inspection{stats.inspections !== 1 ? 's' : ''}
        </div>
        <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 text-purple-800 rounded-full px-3 py-1 text-xs font-medium">
          <ArrowLeftRight className="w-3 h-3" />
          {stats.returnRequests} Return Request
          {stats.returnRequests !== 1 ? 's' : ''}
        </div>
        <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-800 rounded-full px-3 py-1 text-xs font-medium">
          <RefreshCw className="w-3 h-3" />
          {stats.iterations} Iteration{stats.iterations !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {events.map((event, index) => {
          const config = getEventConfig(event.type, event.status);
          const isLast = index === events.length - 1;

          return (
            <div key={`${event.type}-${event.id}-${index}`} className="relative flex gap-4">
              {/* Vertical line + dot */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${config.bgColor} shrink-0 z-10`}
                >
                  {config.icon}
                </div>
                {!isLast && (
                  <div
                    className={`w-0.5 flex-1 min-h-[24px] ${config.lineColor}`}
                  />
                )}
              </div>

              {/* Content */}
              <div className={`pb-6 ${isLast ? 'pb-0' : ''} flex-1 min-w-0`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {event.details}
                    </p>
                    {event.actor && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        by {event.actor}
                      </p>
                    )}
                  </div>
                  {getStatusBadge(event.status)}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {formatDateTime(event.timestamp)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default InspectionTimelineView;
