
import React from 'react';
import { ListFilter } from 'lucide-react';
import { formatTableNum } from '../../utils/dashboardUtils';

export default function MovementTypeTable({ data }) {
  const { mTypeRows, mTypeTotal } = data;
  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3 className="chart-title"><ListFilter size={18} color="#94a3b8" /> Movement Type Breakdown</h3>
        <p className="chart-subtitle">Generation (101/102) vs Consumption (261/262)</p>
      </div>
      <div className="chart-wrapper table-wrapper">
        <table className="styled-table">
          <thead>
            <tr>
              <th>Movement Type</th>
              <th>Category</th>
              <th className="num-col">Quantity (kWh)</th>
              <th className="num-col">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {mTypeRows.map((row) => (
              <tr key={row.type}>
                <td style={{ fontWeight: 600 }}>{row.type}</td>
                <td style={{ color: row.color, fontWeight: 500 }}>{row.category}</td>
                <td className="num-col">{formatTableNum(row.qty)}</td>
                <td className="num-col">
                  {mTypeTotal > 0 ? ((row.qty / mTypeTotal) * 100).toFixed(1) + '%' : '0.0%'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
