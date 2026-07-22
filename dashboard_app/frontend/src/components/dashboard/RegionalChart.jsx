
import React from 'react';
import { BarChart3 } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { createChartOptions, formatLargeNumber } from '../../utils/dashboardUtils';

export default function RegionalChart({ data }) {
  const regionalOptions = {
    ...createChartOptions(),
    indexAxis: 'y',
    scales: {
      x: { grid: { color: 'rgba(15, 23, 42, 0.08)' }, ticks: { color: '#64748b', callback: formatLargeNumber } },
      y: { grid: { display: false }, ticks: { color: '#334155', font: { weight: '500' } } }
    }
  };

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title"><BarChart3 size={18} color="#94a3b8" /> Regional Gen vs Con</h3>
        <p className="chart-subtitle">Top 8 regions by volume</p>
      </div>
      <div className="chart-wrapper"><Bar data={data.regionalChart} options={regionalOptions} /></div>
    </div>
  );
}
