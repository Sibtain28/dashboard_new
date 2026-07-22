
import React from 'react';
import { Zap } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { createChartOptions } from '../../utils/dashboardUtils';

export default function TrendChart({ data }) {
  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title"><Zap size={18} color="#3b82f6" /> Generation vs Consumption Trend</h3>
        <p className="chart-subtitle">Dual comparison over time</p>
      </div>
      <div className="chart-wrapper trend-wrapper">
        <Line data={data.dualTrendChart} options={createChartOptions(true)} />
      </div>
    </div>
  );
}
