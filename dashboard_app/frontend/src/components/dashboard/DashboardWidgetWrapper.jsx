import React from 'react';
import { useDashboardData } from '../../hooks/useDashboardData';
import KpiRibbon from './KpiRibbon';
import PlantStatsTable from './PlantStatsTable';
import TrendChart from './TrendChart';
import TopPlantsChart from './TopPlantsChart';
import RegionalChart from './RegionalChart';
import MovementTypeTable from './MovementTypeTable';
import { Zap } from 'lucide-react';

export default function DashboardWidgetWrapper({ components = [], filters = {} }) {
  const data = useDashboardData(filters);

  if (data.loading) {
    return (
      <div className="loading-screen" style={{ minHeight: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-spinner" style={{ position: 'relative', width: '40px', height: '40px' }}>
          <Zap className="loading-spinner-icon" size={20} color="#3b82f6" />
        </div>
        <div className="loading-subtext" style={{ marginTop: '1rem', color: '#64748b' }}>Fetching dashboard data...</div>
      </div>
    );
  }

  const renderComponent = (compName) => {
    switch (compName) {
      case 'kpi': return <KpiRibbon key="kpi" data={data} />;
      case 'table': return <PlantStatsTable key="table" data={data} />;
      case 'trend': return <TrendChart key="trend" data={data} />;
      case 'top_plants': return <TopPlantsChart key="top_plants" data={data} />;
      case 'regional': return <RegionalChart key="regional" data={data} />;
      case 'movement': return <MovementTypeTable key="movement" data={data} />;
      case 'all':
        return (
          <React.Fragment key="all">
            <KpiRibbon data={data} />
            <div className="charts-grid">
              <PlantStatsTable data={data} />
              <TrendChart data={data} />
              <TopPlantsChart data={data} />
              <RegionalChart data={data} />
              <MovementTypeTable data={data} />
            </div>
          </React.Fragment>
        );
      default:
        return null;
    }
  };

  return (
    <div className="dashboard-container" style={{ padding: '0.5rem', background: 'transparent' }}>
      {components.map(renderComponent)}
    </div>
  );
}
