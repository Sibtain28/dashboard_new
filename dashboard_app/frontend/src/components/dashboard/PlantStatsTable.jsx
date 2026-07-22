
import React from 'react';
import { Factory } from 'lucide-react';
import { formatTableNum } from '../../utils/dashboardUtils';

export default function PlantStatsTable({ data }) {
  const { plantStats, plantTableConfig } = data;
  return (
    <div className="chart-card table-card">
      <div className="chart-header">
        <h3 className="chart-title"><Factory size={18} color="#94a3b8" /> Plant Statistics (kWh)</h3>
        <p className="chart-subtitle">Generation & Consumption by Plant</p>
      </div>
      <div className="chart-wrapper table-wrapper">
        <table className="styled-table">
          <thead>
            <tr>
              <th>Units (Plant)</th>
              <th className="num-col">{plantTableConfig.generationLabel}</th>
              <th className="num-col">{plantTableConfig.consumptionLabel}</th>
            </tr>
          </thead>
          <tbody>
            {plantStats.length === 0 ? (
              <tr><td colSpan="3" style={{ textAlign: 'center', padding: '2rem' }}>No data available</td></tr>
            ) : (
              plantStats.map((p, idx) => (
                <tr key={idx}>
                  <td>{p.name}</td>
                  <td className="num-col" style={{ color: '#10b981' }}>{formatTableNum(p.generation)}</td>
                  <td className="num-col" style={{ color: '#f43f5e' }}>{formatTableNum(p.consumption)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
