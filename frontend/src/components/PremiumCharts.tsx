import React from 'react';
import { motion } from 'framer-motion';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ScatterChart,
  Scatter,
  ResponsiveContainer,
  Cell,
  Tooltip,
  Legend,
  CartesianGrid,
  XAxis,
  YAxis
} from 'recharts';

interface PremiumChartsProps {
  data?: any;
  type: 'radar' | 'treemap' | 'scatter';
  height?: number;
}

const PremiumCharts: React.FC<PremiumChartsProps> = ({ data, type, height = 300 }) => {
  const renderChart = () => {
    switch (type) {
      case 'radar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <RadarChart data={data}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#64748b' }} />
              <PolarRadiusAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Radar
                name="Current"
                dataKey="A"
                stroke="#8B5CF6"
                fill="#8B5CF6"
                fillOpacity={0.3}
                strokeWidth={2}
              />
              <Radar
                name="Target"
                dataKey="B"
                stroke="#3B82F6"
                fill="#3B82F6"
                fillOpacity={0.2}
                strokeWidth={2}
              />
              <Legend />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid rgba(226, 232, 240, 0.5)',
                  borderRadius: '12px',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        );
      
      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                type="number" 
                dataKey="x" 
                name="Quality Score"
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis 
                type="number" 
                dataKey="y" 
                name="Timeline Performance"
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white/95 p-3 rounded-lg border shadow-lg backdrop-blur-sm">
                        <p className="font-semibold">{`${payload[0].payload.name}`}</p>
                        <p className="text-sm text-gray-600">{`Quality: ${payload[0].value}%`}</p>
                        <p className="text-sm text-gray-600">{`Timeline: ${payload[1] ? payload[1].value : payload[0].payload.y}%`}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter name="Projects" fill="#10B981">
                {data?.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={`hsl(${120 + entry.z}, 70%, 50%)`} />
                ))}
              </Scatter>
              <defs>
                <linearGradient id="scatterGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="100%" stopColor="#3B82F6" />
                </linearGradient>
              </defs>
            </ScatterChart>
          </ResponsiveContainer>
        );
      
      case 'treemap':
        return (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-600 mb-2">Advanced Treemap Visualization</p>
              <p className="text-sm text-gray-500">Premium analytics feature coming soon</p>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      {renderChart()}
    </motion.div>
  );
};

export default PremiumCharts;