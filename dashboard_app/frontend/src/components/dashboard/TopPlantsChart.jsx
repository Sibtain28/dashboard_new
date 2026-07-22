
import React from 'react';
import { Factory } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { createChartOptions } from '../../utils/dashboardUtils';

export default function TopPlantsChart({ data }) {
  return (
    <div className="charts-grid" style={{ gridTemplateColumns: '1fr', gap: '1rem', display: 'flex', flexDirection: 'column' }}>
      <div className="chart-card">
        <div className="chart-header">
          <h3 className="chart-title"><Factory size={18} color="#10b981" /> Top Generating Plants</h3>
          <p className="chart-subtitle">Highest volume producers</p>
        </div>
        <div className="chart-wrapper"><Bar data={data.genTopChart} options={createChartOptions(false)} /></div>
      </div>
      <div className="chart-card">
        <div className="chart-header">
          <h3 className="chart-title"><Factory size={18} color="#f43f5e" /> Top Consuming Plants</h3>
          <p className="chart-subtitle">Highest volume consumers</p>
        </div>
        <div className="chart-wrapper"><Bar data={data.conTopChart} options={createChartOptions(false)} /></div>
      </div>
    </div>
  );
}
