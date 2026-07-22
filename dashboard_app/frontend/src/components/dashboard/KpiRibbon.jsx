
import React from 'react';
import { Zap, Activity, BarChart3, Factory, TrendingUp, TrendingDown } from 'lucide-react';
import { formatLargeNumber } from '../../utils/dashboardUtils';

const TrendIndicator = ({ trend }) => (
  <div className={`trend-badge ${trend.up ? 'positive' : 'negative'}`}>
    {trend.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
    <span>{Math.abs(trend.pct)}%</span>
  </div>
);

export default function KpiRibbon({ data }) {
  const { totalGen, genKpiTrend, totalCon, conKpiTrend, netDiff, netKpiTrend, uniqueGenPlants, uniqueConPlants } = data;
  return (
    <div className="kpi-grid">
      <div className="kpi-card gen">
        <div className="kpi-title"><Zap size={16} color="#10b981" /> Total Generation</div>
        <div className="kpi-value-container">
          <div className="kpi-value">{formatLargeNumber(totalGen)}</div>
          <TrendIndicator trend={genKpiTrend} />
        </div>
      </div>
      <div className="kpi-card con">
        <div className="kpi-title"><Activity size={16} color="#f43f5e" /> Total Consumption</div>
        <div className="kpi-value-container">
          <div className="kpi-value">{formatLargeNumber(totalCon)}</div>
          <TrendIndicator trend={conKpiTrend} />
        </div>
      </div>
      <div className="kpi-card net">
        <div className="kpi-title"><BarChart3 size={16} color="#3b82f6" /> Net Difference</div>
        <div className="kpi-value-container">
          <div className="kpi-value">{formatLargeNumber(netDiff)}</div>
          <TrendIndicator trend={netKpiTrend} />
        </div>
      </div>
      <div className="kpi-card gen-secondary">
        <div className="kpi-title"><Factory size={16} color="#10b981" /> Generating Plants</div>
        <div className="kpi-value">{uniqueGenPlants}</div>
      </div>
      <div className="kpi-card con-secondary">
        <div className="kpi-title"><Factory size={16} color="#f43f5e" /> Consuming Plants</div>
        <div className="kpi-value">{uniqueConPlants}</div>
      </div>
    </div>
  );
}
