import React, { useState, useEffect } from 'react';
import { Calendar, Factory, Activity, ListFilter, RefreshCw, Clock, ChevronUp, ChevronDown, Zap } from 'lucide-react';

import { useDashboardData } from './hooks/useDashboardData';
import KpiRibbon from './components/dashboard/KpiRibbon';
import PlantStatsTable from './components/dashboard/PlantStatsTable';
import TrendChart from './components/dashboard/TrendChart';
import TopPlantsChart from './components/dashboard/TopPlantsChart';
import RegionalChart from './components/dashboard/RegionalChart';
import MovementTypeTable from './components/dashboard/MovementTypeTable';

const SESSION_ID_KEY = 'dashboard-chat-session-id';
function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function Dashboard({ mode = 'full', filterOverride = null }) {
  const [filterPlant, setFilterPlant] = useState(filterOverride?.plant || 'All');
  const [filterCity, setFilterCity] = useState(filterOverride?.city || 'All');
  const [filterDateRange, setFilterDateRange] = useState(filterOverride?.dateRange || 'All');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    if (filterOverride) {
      if (filterOverride.plant !== undefined) setFilterPlant(filterOverride.plant || 'All');
      if (filterOverride.city !== undefined) setFilterCity(filterOverride.city || 'All');
      if (filterOverride.dateRange !== undefined) setFilterDateRange(filterOverride.dateRange || 'All');
    }
  }, [filterOverride]);

  useEffect(() => {
    let storedSession = window.localStorage.getItem(SESSION_ID_KEY);
    if (!storedSession) {
      storedSession = generateSessionId();
      window.localStorage.setItem(SESSION_ID_KEY, storedSession);
    }
    setSessionId(storedSession);
  }, []);

  const data = useDashboardData({ plant: filterPlant, city: filterCity, dateRange: filterDateRange });

  if (data.loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">
          <div className="loading-spinner-ring"></div>
          <div className="loading-spinner-ring"></div>
          <Zap className="loading-spinner-icon" size={22} />
        </div>
        <div className="loading-text">Loading Enterprise Dashboard</div>
        <div className="loading-subtext">Fetching plant generation and consumption data...</div>
      </div>
    );
  }

  if (mode === 'kpi') return <KpiRibbon data={data} />;
  if (mode === 'table') return <PlantStatsTable data={data} />;
  if (mode === 'trend') return <TrendChart data={data} />;
  if (mode === 'top_plants') return <TopPlantsChart data={data} />;
  if (mode === 'regional') return <RegionalChart data={data} />;
  if (mode === 'movement') return <MovementTypeTable data={data} />;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-title">
          <h1>Power Plant Analytics</h1>
          <p>Generation vs Consumption Dashboard</p>
          <div className="last-updated">
            <Clock size={12} /> Last Updated: {data.lastUpdated}
          </div>
        </div>

        <button className="mobile-filters-toggle" onClick={() => setIsFiltersOpen(!isFiltersOpen)}>
          <ListFilter size={18} /> Filters
          {isFiltersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        <div className={`filters-bar ${isFiltersOpen ? 'open' : ''}`}>
          <div className="filter-group">
            <label><Calendar size={14} /> Date Range</label>
            <select className="filter-select" value={filterDateRange} onChange={e => setFilterDateRange(e.target.value)}>
              <option value="All">All Time</option>
              <option value="7D">Last 7 Days</option>
              <option value="30D">Last 30 Days</option>
              <option value="Month">This Month</option>
              <option value="Year">This Year</option>
            </select>
          </div>
          <div className="filter-group">
            <label><Factory size={14} /> Plant Name</label>
            <select className="filter-select" value={filterPlant} onChange={e => setFilterPlant(e.target.value)}>
              <option value="All">All Plants</option>
              {data.uniquePlants.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label><Activity size={14} /> Region / City</label>
            <select className="filter-select" value={filterCity} onChange={e => setFilterCity(e.target.value)}>
              <option value="All">All Regions</option>
              {data.uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button className="btn-reset" onClick={() => { setFilterDateRange('All'); setFilterPlant('All'); setFilterCity('All'); }} title="Reset Filters">
            <RefreshCw size={16} /> Reset
          </button>
        </div>
      </header>

      <KpiRibbon data={data} />

      <div className="charts-grid">
        <PlantStatsTable data={data} />
        <TrendChart data={data} />
        <TopPlantsChart data={data} />
        <RegionalChart data={data} />
        <MovementTypeTable data={data} />
      </div>
    </div>
  );
}

export default Dashboard;
