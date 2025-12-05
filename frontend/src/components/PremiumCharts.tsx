import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface PremiumChartsProps {
  data?: any;
  type: 'radar' | 'treemap' | 'scatter';
  height?: number;
}

const PremiumCharts: React.FC<PremiumChartsProps> = React.memo(({ data, type, height = 300 }) => {
  // ✅ PERFORMANCE: Lazy load Highcharts premium modules only when needed
  const [chartsLoaded, setChartsLoaded] = useState(false);
  const [Highcharts, setHighcharts] = useState<any>(null);
  const [HighchartsReact, setHighchartsReact] = useState<any>(null);

  // Load chart libraries with premium modules on mount
  useEffect(() => {
    Promise.all([
      import('highcharts'),
      import('highcharts-react-official'),
      import('highcharts/highcharts-more'),
      import('highcharts/modules/treemap')
    ]).then(([HC, HCReact, HCMore, HCTreemap]) => {
      // Initialize modules
      HCMore.default(HC.default);
      HCTreemap.default(HC.default);

      setHighcharts(HC.default);
      setHighchartsReact(() => HCReact.default);
      setChartsLoaded(true);
    }).catch(error => {
      console.error('Failed to load premium chart libraries:', error);
    });
  }, []);
  const chartOptions = useMemo(() => {
    const baseOptions: Highcharts.Options = {
      chart: {
        height: height,
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      credits: {
        enabled: false
      },
      title: {
        text: undefined
      }
    };

    switch (type) {
      case 'radar':
        return {
          ...baseOptions,
          chart: {
            ...baseOptions.chart,
            polar: true,
            type: 'line'
          },
          pane: {
            size: '80%'
          },
          xAxis: {
            categories: data?.map((d: any) => d.subject) || [],
            tickmarkPlacement: 'on',
            lineWidth: 0,
            labels: {
              style: {
                fontSize: '12px',
                color: '#64748b'
              }
            }
          },
          yAxis: {
            gridLineInterpolation: 'polygon',
            lineWidth: 0,
            min: 0,
            labels: {
              style: {
                fontSize: '10px',
                color: '#64748b'
              }
            }
          },
          tooltip: {
            shared: true,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: 'rgba(226, 232, 240, 0.5)',
            borderRadius: 12,
            borderWidth: 1,
            style: {
              color: '#1f2937'
            },
            shadow: {
              color: 'rgba(0, 0, 0, 0.25)',
              offsetX: 0,
              offsetY: 25,
              opacity: 0.5,
              width: 50
            }
          },
          legend: {
            align: 'center',
            verticalAlign: 'bottom',
            layout: 'horizontal',
            itemStyle: {
              color: '#64748b'
            }
          },
          series: [{
            name: 'Current',
            data: data?.map((d: any) => d.A) || [],
            pointPlacement: 'on',
            color: '#8B5CF6',
            lineWidth: 2,
            fillOpacity: 0.3,
            marker: {
              radius: 4
            }
          }, {
            name: 'Target',
            data: data?.map((d: any) => d.B) || [],
            pointPlacement: 'on',
            color: '#3B82F6',
            lineWidth: 2,
            fillOpacity: 0.2,
            marker: {
              radius: 4
            }
          }] as any
        };

      case 'scatter':
        return {
          ...baseOptions,
          chart: {
            ...baseOptions.chart,
            type: 'scatter',
            zoomType: 'xy'
          },
          xAxis: {
            title: {
              text: 'Quality Score',
              style: {
                color: '#64748b'
              }
            },
            labels: {
              style: {
                fontSize: '12px',
                color: '#64748b'
              }
            },
            gridLineWidth: 1,
            gridLineColor: '#e2e8f0'
          },
          yAxis: {
            title: {
              text: 'Timeline Performance',
              style: {
                color: '#64748b'
              }
            },
            labels: {
              style: {
                fontSize: '12px',
                color: '#64748b'
              }
            },
            gridLineColor: '#e2e8f0'
          },
          legend: {
            enabled: true,
            itemStyle: {
              color: '#64748b'
            }
          },
          plotOptions: {
            scatter: {
              marker: {
                radius: 5,
                states: {
                  hover: {
                    enabled: true,
                    lineColor: 'rgb(100,100,100)'
                  }
                }
              },
              states: {
                hover: {
                  marker: {
                    enabled: false
                  }
                }
              }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e2e8f0',
            borderRadius: 8,
            formatter: function() {
              const point = this.point as any;
              return `<div>
                <p style="font-weight: 600; margin: 0 0 4px 0;">${point.name || 'Project'}</p>
                <p style="margin: 0; color: #6b7280; font-size: 12px;">Quality: ${this.x}%</p>
                <p style="margin: 0; color: #6b7280; font-size: 12px;">Timeline: ${this.y}%</p>
              </div>`;
            },
            useHTML: true
          },
          series: [{
            name: 'Projects',
            color: '#10B981',
            data: data?.map((d: any) => ({
              x: d.x,
              y: d.y,
              name: d.name,
              color: `hsl(${120 + d.z}, 70%, 50%)`
            })) || []
          }]
        };

      case 'treemap':
        return {
          ...baseOptions,
          chart: {
            ...baseOptions.chart,
            type: 'treemap'
          },
          colorAxis: {
            minColor: '#FFFFFF',
            maxColor: '#10B981'
          },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e2e8f0',
            borderRadius: 8,
            formatter: function() {
              const point = this.point as any;
              return `<div>
                <p style="font-weight: 600; margin: 0 0 4px 0;">${point.name}</p>
                <p style="margin: 0; color: #6b7280; font-size: 12px;">Value: ${point.value}</p>
              </div>`;
            },
            useHTML: true
          },
          series: [{
            type: 'treemap',
            layoutAlgorithm: 'squarified',
            animationLimit: 1000,
            dataLabels: {
              enabled: true,
              style: {
                fontSize: '13px',
                color: '#1f2937'
              }
            },
            data: data || [{
              name: 'Category A',
              value: 60,
              colorValue: 1
            }, {
              name: 'Category B',
              value: 30,
              colorValue: 2
            }, {
              name: 'Category C',
              value: 10,
              colorValue: 3
            }]
          }] as any
        };

      default:
        return baseOptions;
    }
  }, [data, type, height]);

  // Show loading state while charts are loading
  if (!chartsLoaded || !Highcharts || !HighchartsReact) {
    return (
      <div className="w-full flex items-center justify-center" style={{ height }}>
        <div className="text-gray-500 animate-pulse">Loading chart...</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <HighchartsReact
        highcharts={Highcharts}
        options={chartOptions}
      />
    </motion.div>
  );
});

export default PremiumCharts;