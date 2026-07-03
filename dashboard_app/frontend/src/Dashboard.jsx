import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { Activity, Zap, Factory, BarChart3, ListFilter, RefreshCw, Calendar, TrendingUp, TrendingDown, Clock, MessageSquare } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function Dashboard() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  // Filters State
  const [filterPlant, setFilterPlant] = useState('All');
  const [filterCity, setFilterCity] = useState('All');
  const [filterDateRange, setFilterDateRange] = useState('All');

  useEffect(() => {
    axios.get(import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL + '/api/data' : 'http://localhost:3001/api/data')
      .then(res => {
        // Normalize city names: RAIGARH -> Raigarh
        const normalizedData = res.data.map(d => ({
          ...d,
          city: d.city ? d.city.charAt(0).toUpperCase() + d.city.slice(1).toLowerCase() : 'Unknown'
        }));
        setRawData(normalizedData);
        setLoading(false);
        setLastUpdated(new Date().toLocaleString());
      })
      .catch(err => {
        console.error('Error fetching data', err);
        setLoading(false);
      });
  }, []);

  // Format Helpers
  const parseDateString = (dateStr) => {
    if (!dateStr || dateStr.length !== 8) return dateStr;
    const y = dateStr.slice(0, 4);
    const m = dateStr.slice(4, 6);
    const d = dateStr.slice(6, 8);
    const dateObj = new Date(`${y}-${m}-${d}`);
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  };

  const formatLargeNumber = (value) => {
    if (value === null || value === undefined) return '0 kWh';
    if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B kWh';
    if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M kWh';
    if (value >= 1e3) return (value / 1e3).toFixed(1) + 'k kWh';
    return value.toLocaleString() + ' kWh';
  };

  const formatTableNum = (val) => {
    if (!val) return '-';
    return val.toLocaleString();
  };

  const truncateString = (str, num) => {
    if (str.length <= num) return str;
    return str.slice(0, num) + '...';
  };

  const latestDateStr = useMemo(() => {
    if (rawData.length === 0) return null;
    const dates = rawData.map(d => d.date).sort();
    return dates[dates.length - 1];
  }, [rawData]);

  // Derived filtered data
  const filteredData = useMemo(() => {
    return rawData.filter(d => {
      const pName = d.plantName || d.plantKey;
      const matchPlant = filterPlant === 'All' || pName === filterPlant;
      const matchCity = filterCity === 'All' || d.city === filterCity;

      let matchDate = true;
      if (filterDateRange !== 'All' && latestDateStr) {
        const latestY = parseInt(latestDateStr.slice(0, 4));
        const latestM = parseInt(latestDateStr.slice(4, 6)) - 1;
        const latestD = parseInt(latestDateStr.slice(6, 8));
        const latestDateObj = new Date(latestY, latestM, latestD);

        const curY = parseInt(d.date.slice(0, 4));
        const curM = parseInt(d.date.slice(4, 6)) - 1;
        const curD = parseInt(d.date.slice(6, 8));
        const curDateObj = new Date(curY, curM, curD);

        if (filterDateRange === '7D') {
          const sevenDaysAgo = new Date(latestDateObj);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          matchDate = curDateObj >= sevenDaysAgo && curDateObj <= latestDateObj;
        } else if (filterDateRange === '30D') {
          const thirtyDaysAgo = new Date(latestDateObj);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          matchDate = curDateObj >= thirtyDaysAgo && curDateObj <= latestDateObj;
        } else if (filterDateRange === 'Month') {
          matchDate = curY === latestY && curM === latestM;
        }
      }

      return matchPlant && matchCity && matchDate;
    });
  }, [rawData, filterPlant, filterCity, filterDateRange, latestDateStr]);

  const uniquePlants = useMemo(() => [...new Set(rawData.map(d => d.plantName || d.plantKey))].filter(Boolean).sort(), [rawData]);
  const uniqueCities = useMemo(() => [...new Set(rawData.map(d => d.city))].filter(Boolean).sort(), [rawData]);

  // Split into Gen and Con
  const genData = useMemo(() => filteredData.filter(d => ['101', '102'].includes(d.movementType)), [filteredData]);
  const conData = useMemo(() => filteredData.filter(d => ['261', '262'].includes(d.movementType)), [filteredData]);

  // KPIs
  const totalGen = useMemo(() => genData.reduce((sum, d) => sum + d.quantity, 0), [genData]);
  const totalCon = useMemo(() => conData.reduce((sum, d) => sum + d.quantity, 0), [conData]);
  const netDiff = totalGen - totalCon;
  const uniqueGenPlants = useMemo(() => new Set(genData.map(d => d.plantName || d.plantKey)).size, [genData]);
  const uniqueConPlants = useMemo(() => new Set(conData.map(d => d.plantName || d.plantKey)).size, [conData]);

  // Mock Trend Calculations (comparing last 2 distinct dates in the dataset)
  const calculateTrend = (dataset) => {
    const groupedByDate = dataset.reduce((acc, curr) => {
      acc[curr.date] = (acc[curr.date] || 0) + curr.quantity;
      return acc;
    }, {});
    const dates = Object.keys(groupedByDate).sort();
    if (dates.length < 2) return { diff: 0, pct: 0, up: true };
    const current = groupedByDate[dates[dates.length - 1]];
    const previous = groupedByDate[dates[dates.length - 2]];
    const pct = previous === 0 ? 100 : ((current - previous) / previous) * 100;
    return { pct: pct.toFixed(1), up: pct >= 0 };
  };

  const genKpiTrend = useMemo(() => calculateTrend(genData), [genData]);
  const conKpiTrend = useMemo(() => calculateTrend(conData), [conData]);
  const netKpiTrend = { pct: (Math.abs((totalGen - totalCon) / (totalGen || 1)) * 100).toFixed(1), up: netDiff >= 0 };

  const TrendIndicator = ({ trend }) => (
    <div className={`trend-badge ${trend.up ? 'positive' : 'negative'}`}>
      {trend.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      <span>{Math.abs(trend.pct)}%</span>
    </div>
  );

  // AI Chatbot Component
  const Chatbot = () => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const sendMessage = async () => {
      if (!input.trim() || loading) return;
      const question = input.trim();
      const userMsg = { sender: 'user', text: question };
      const placeholderMsg = { sender: 'bot', text: 'Searching the power plant dataset...' };

      const history = [...messages, userMsg].map((msg) => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text,
      }));

      setMessages((prev) => [...prev, userMsg, placeholderMsg]);
      setInput('');
      setLoading(true);

      try {
        const response = await fetch('http://localhost:3001/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            history,
          }),
        });

        const data = await response.json();
        const botText = data.answer || data.error || 'I could not retrieve an answer right now.';
        setMessages((prev) => {
          const current = [...prev];
          const placeholderIndex = current.findIndex((msg) => msg.sender === 'bot' && msg.text === 'Searching the power plant dataset...');
          if (placeholderIndex >= 0) {
            current[placeholderIndex] = { sender: 'bot', text: botText };
          } else {
            current.push({ sender: 'bot', text: botText });
          }
          return current;
        });
      } catch (err) {
        const errorMessage = 'Sorry, the assistant is unavailable right now.';
        setMessages((prev) => {
          const current = [...prev];
          const placeholderIndex = current.findIndex((msg) => msg.sender === 'bot' && msg.text === 'Searching the power plant dataset...');
          if (placeholderIndex >= 0) {
            current[placeholderIndex] = { sender: 'bot', text: errorMessage };
          } else {
            current.push({ sender: 'bot', text: errorMessage });
          }
          return current;
        });
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="chatbot-container">
        <button className="chatbot-button" onClick={() => setOpen(!open)} title="AI Assistant">
          <MessageSquare size={24} />
        </button>
        <div className={`chatbot-widget ${open ? 'open' : ''}`}>
          <div className="chatbot-header">AI Assistant</div>
          <div className="chatbot-body">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chatbot-message ${msg.sender}`}>{msg.text}</div>
            ))}
          </div>
          <div className="chatbot-input-area">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask something..."
              onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
              disabled={loading}
            />
            <button onClick={sendMessage} disabled={loading}>Send</button>
          </div>
        </div>
      </div>
    );
  };


  // Common Chart Options
  const createChartOptions = (isTrend = false) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#e2e8f0', usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          title: (context) => {
            let title = context[0].label;
            if (!isTrend && context[0].dataset.fullLabels) {
              title = context[0].dataset.fullLabels[context[0].dataIndex] || title;
            }
            return title;
          },
          label: (context) => {
            let label = context.dataset.label || '';
            if (label) label += ': ';

            const isHorizontal = context.chart.options.indexAxis === 'y';
            const parsedVal = isHorizontal ? context.parsed.x : context.parsed.y;

            if (parsedVal !== null) {
              label += formatLargeNumber(parsedVal);

              // Percentage contribution
              const dataArray = context.dataset.data;
              const total = dataArray.reduce((sum, val) => sum + (typeof val === 'number' ? val : (val.y || val.x || 0)), 0);
              if (total && total > 0) {
                const pct = ((parsedVal / total) * 100).toFixed(1);
                label += ` (${pct}%)`;
              }

              // Previous period comparison for Trend Charts
              if (isTrend && context.dataIndex > 0) {
                const prevVal = dataArray[context.dataIndex - 1];
                if (prevVal > 0) {
                  const changePct = (((parsedVal - prevVal) / prevVal) * 100).toFixed(1);
                  const sign = changePct >= 0 ? '+' : '';
                  label += `  [prev: ${sign}${changePct}%]`;
                }
              }
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
        ticks: { color: '#94a3b8', callback: formatLargeNumber, padding: 8 }
      },
      x: {
        grid: { display: false },
        ticks: {
          color: '#94a3b8',
          maxTicksLimit: isTrend ? 10 : undefined, // Reduce clutter
          maxRotation: 45,
          minRotation: 0
        }
      }
    }
  });

  // --- Row 1: Table & Dual Trend Chart ---
  const plantStats = useMemo(() => {
    if (!filteredData.length || !latestDateStr) return [];

    const latestY = latestDateStr.slice(0, 4);
    const latestM = latestDateStr.slice(4, 6);
    const statsMap = {};

    filteredData.forEach(d => {
      const pName = d.plantName || d.plantKey || 'Unknown';
      if (!statsMap[pName]) {
        statsMap[pName] = { name: pName, genYesterday: 0, genMTD: 0, conYesterday: 0, conMTD: 0 };
      }
      const isGen = ['101', '102'].includes(d.movementType);
      const isCon = ['261', '262'].includes(d.movementType);
      const isYesterday = d.date === latestDateStr;
      const isMTD = d.date.startsWith(latestY + latestM);

      if (isGen) {
        if (isYesterday) statsMap[pName].genYesterday += d.quantity;
        if (isMTD) statsMap[pName].genMTD += d.quantity;
      }
      if (isCon) {
        if (isYesterday) statsMap[pName].conYesterday += d.quantity;
        if (isMTD) statsMap[pName].conMTD += d.quantity;
      }
    });

    return Object.values(statsMap).sort((a, b) => (b.genMTD + b.conMTD) - (a.genMTD + a.conMTD));
  }, [filteredData, latestDateStr]);

  const processDualTrendChart = () => {
    const grouped = {};
    filteredData.forEach(d => {
      if (!grouped[d.date]) grouped[d.date] = { gen: 0, con: 0 };
      if (['101', '102'].includes(d.movementType)) grouped[d.date].gen += d.quantity;
      if (['261', '262'].includes(d.movementType)) grouped[d.date].con += d.quantity;
    });
    const sortedDates = Object.keys(grouped).sort();
    return {
      labels: sortedDates.map(parseDateString),
      genData: sortedDates.map(d => grouped[d].gen),
      conData: sortedDates.map(d => grouped[d].con)
    };
  };

  const dualTrendData = processDualTrendChart();
  const dualTrendChart = {
    labels: dualTrendData.labels,
    datasets: [
      {
        label: 'Generation',
        data: dualTrendData.genData,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6
      },
      {
        label: 'Consumption',
        data: dualTrendData.conData,
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6
      }
    ]
  };

  // --- Row 2: Top Plants ---
  const processTopPlants = (dataset) => {
    const grouped = dataset.reduce((acc, curr) => {
      const name = curr.plantName || curr.plantKey || 'Unknown';
      acc[name] = (acc[name] || 0) + curr.quantity;
      return acc;
    }, {});
    const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 7);
    return {
      labels: sorted.map(s => truncateString(s[0], 12)),
      fullLabels: sorted.map(s => s[0]),
      data: sorted.map(s => s[1])
    };
  };

  const genTop = processTopPlants(genData);
  const conTop = processTopPlants(conData);

  const genTopChart = {
    labels: genTop.labels,
    datasets: [{
      label: 'Volume',
      data: genTop.data,
      fullLabels: genTop.fullLabels,
      backgroundColor: 'rgba(16, 185, 129, 0.8)',
      hoverBackgroundColor: '#10b981',
      borderRadius: 6
    }]
  };

  const conTopChart = {
    labels: conTop.labels,
    datasets: [{
      label: 'Volume',
      data: conTop.data,
      fullLabels: conTop.fullLabels,
      backgroundColor: 'rgba(244, 63, 94, 0.8)',
      hoverBackgroundColor: '#f43f5e',
      borderRadius: 6
    }]
  };

  // --- Row 3: Combined Grouped Charts ---
  const processRegionalCombined = () => {
    const grouped = {};
    filteredData.forEach(d => {
      const city = d.city;
      if (!grouped[city]) grouped[city] = { gen: 0, con: 0 };
      if (['101', '102'].includes(d.movementType)) grouped[city].gen += d.quantity;
      if (['261', '262'].includes(d.movementType)) grouped[city].con += d.quantity;
    });

    const sortedCities = Object.entries(grouped)
      .sort((a, b) => (b[1].gen + b[1].con) - (a[1].gen + a[1].con))
      .slice(0, 8);

    return {
      labels: sortedCities.map(c => c[0]),
      genData: sortedCities.map(c => c[1].gen),
      conData: sortedCities.map(c => c[1].con)
    };
  };

  const regionalCombined = processRegionalCombined();
  const regionalChart = {
    labels: regionalCombined.labels,
    datasets: [
      { label: 'Generation', data: regionalCombined.genData, backgroundColor: '#10b981', borderRadius: 4, barPercentage: 0.7 },
      { label: 'Consumption', data: regionalCombined.conData, backgroundColor: '#f43f5e', borderRadius: 4, barPercentage: 0.7 }
    ]
  };

  const regionalOptions = {
    ...createChartOptions(),
    indexAxis: 'y',
    scales: {
      x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', callback: formatLargeNumber } },
      y: { grid: { display: false }, ticks: { color: '#e2e8f0', font: { weight: '500' } } }
    }
  };

  // Movement Type: Summary Table
  const processMovementTypes = () => {
    const totals = { '101': 0, '102': 0, '261': 0, '262': 0 };
    filteredData.forEach(d => {
      if (totals.hasOwnProperty(d.movementType)) {
        totals[d.movementType] += d.quantity;
      }
    });
    return totals;
  };

  const mTypeData = processMovementTypes();
  const mTypeTotal = Object.values(mTypeData).reduce((sum, val) => sum + val, 0);
  const mTypeRows = [
    { type: '101', category: 'Generation', qty: mTypeData['101'], color: '#10b981' },
    { type: '102', category: 'Generation', qty: mTypeData['102'], color: '#10b981' },
    { type: '261', category: 'Consumption', qty: mTypeData['261'], color: '#f43f5e' },
    { type: '262', category: 'Consumption', qty: mTypeData['262'], color: '#f43f5e' },
  ];
  if (loading) {
    return <div className="loading"><RefreshCw className="spinner" size={32} /> Loading Enterprise Dashboard...</div>;
  }

  return (
    <div className="dashboard-container">
      {/* Header & Global Filters */}
      <header className="dashboard-header">
        <div className="header-title">
          <h1>Power Plant Analytics</h1>
          <p>Enterprise Generation vs Consumption Dashboard</p>
          <div className="last-updated">
            <Clock size={12} /> Last Updated: {lastUpdated}
          </div>
        </div>

        <div className="filters-bar">
          <div className="filter-group">
            <label><Calendar size={14} /> Date Range</label>
            <select className="filter-select" value={filterDateRange} onChange={e => setFilterDateRange(e.target.value)}>
              <option value="All">All Time</option>
              <option value="7D">Last 7 Days</option>
              <option value="30D">Last 30 Days</option>
              <option value="Month">This Month</option>
            </select>
          </div>
          <div className="filter-group">
            <label><Factory size={14} /> Plant Name</label>
            <select className="filter-select" value={filterPlant} onChange={e => setFilterPlant(e.target.value)}>
              <option value="All">All Plants</option>
              {uniquePlants.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label><Activity size={14} /> Region / City</label>
            <select className="filter-select" value={filterCity} onChange={e => setFilterCity(e.target.value)}>
              <option value="All">All Regions</option>
              {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button className="btn-reset" onClick={() => { setFilterDateRange('All'); setFilterPlant('All'); setFilterCity('All'); }} title="Reset Filters">
            <RefreshCw size={16} /> Reset
          </button>
        </div>
      </header>

      {/* KPI Ribbon */}
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

      {/* Comparative Charts Grid */}
      <div className="charts-grid">
        {/* ROW 1: Table & Dual Trend */}
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
                  <th className="num-col">Generation Yesterday</th>
                  <th className="num-col">Generation MTD</th>
                  <th className="num-col">Consumption Yesterday</th>
                  <th className="num-col">Consumption MTD</th>
                </tr>
              </thead>
              <tbody>
                {plantStats.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No data available</td></tr>
                ) : (
                  plantStats.map((p, idx) => (
                    <tr key={idx}>
                      <td>{p.name}</td>
                      <td className="num-col" style={{ color: '#34d399' }}>{formatTableNum(p.genYesterday)}</td>
                      <td className="num-col" style={{ color: '#10b981' }}>{formatTableNum(p.genMTD)}</td>
                      <td className="num-col" style={{ color: '#fb7185' }}>{formatTableNum(p.conYesterday)}</td>
                      <td className="num-col" style={{ color: '#f43f5e' }}>{formatTableNum(p.conMTD)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title"><Zap size={18} color="#3b82f6" /> Generation vs Consumption Trend</h3>
            <p className="chart-subtitle">Dual comparison over time</p>
          </div>
          <div className="chart-wrapper trend-wrapper">
            <Line data={dualTrendChart} options={createChartOptions(true)} />
          </div>
        </div>

        {/* ROW 2 */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title"><Factory size={18} color="#10b981" /> Top Generating Plants</h3>
            <p className="chart-subtitle">Highest volume producers</p>
          </div>
          <div className="chart-wrapper"><Bar data={genTopChart} options={createChartOptions(false)} /></div>
        </div>
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title"><Factory size={18} color="#f43f5e" /> Top Consuming Plants</h3>
            <p className="chart-subtitle">Highest volume consumers</p>
          </div>
          <div className="chart-wrapper"><Bar data={conTopChart} options={createChartOptions(false)} /></div>
        </div>

        {/* ROW 3 */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title"><BarChart3 size={18} color="#94a3b8" /> Regional Gen vs Con</h3>
            <p className="chart-subtitle">Top 8 regions by volume</p>
          </div>
          <div className="chart-wrapper"><Bar data={regionalChart} options={regionalOptions} /></div>
        </div>
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
      </div>
      {/* END ROW 3 */}
      {/* AI Chatbot */}
      <Chatbot />
    </div>
  );
}

export default Dashboard;
