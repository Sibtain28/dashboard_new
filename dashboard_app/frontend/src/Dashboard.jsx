import { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip as ChartJSTooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line as RechartsLine,
  BarChart,
  Bar as RechartsBar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
} from 'recharts';
import { Activity, Zap, Factory, BarChart3, ListFilter, RefreshCw, Calendar, TrendingUp, TrendingDown, Clock, MessageSquare, X as CloseIcon, ChevronDown, ChevronUp, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  ChartJSTooltip,
  Legend,
  Filler
);

const CHAT_STORAGE_KEY = 'dashboard-chat-history-v1';
const SESSION_ID_KEY = 'dashboard-chat-session-id';

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function normalizeCityName(city) {
  return city ? city.charAt(0).toUpperCase() + city.slice(1).toLowerCase() : 'Unknown';
}

function normalizeDashboardRows(rows) {
  return Array.isArray(rows)
    ? rows.map(d => ({
        ...d,
        date: String(d.date || ''),
        movementType: String(d.movementType || ''),
        quantity: Number(d.quantity || 0),
        city: normalizeCityName(d.city),
      }))
    : [];
}

function Dashboard() {
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const [rawData, setRawData] = useState([]);
  const [trendRows, setTrendRows] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ plants: [], cities: [] });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  // Filters State
  const [filterPlant, setFilterPlant] = useState('All');
  const [filterCity, setFilterCity] = useState('All');
  const [filterDateRange, setFilterDateRange] = useState('All');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    let storedSession = window.localStorage.getItem(SESSION_ID_KEY);
    if (!storedSession) {
      storedSession = generateSessionId();
      window.localStorage.setItem(SESSION_ID_KEY, storedSession);
    }
    setSessionId(storedSession);
  }, []);

  useEffect(() => {
    axios.get(`${apiBaseUrl}/api/filter-options`)
      .then(res => {
        setFilterOptions({
          plants: Array.isArray(res.data?.plants) ? res.data.plants.filter(Boolean).sort() : [],
          cities: Array.isArray(res.data?.cities) ? res.data.cities.map(normalizeCityName).filter(Boolean).sort() : [],
        });
      })
      .catch(err => {
        console.error('Error fetching filter options', err);
      });
  }, [apiBaseUrl]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('dateRange', filterDateRange);
    if (filterPlant !== 'All') params.set('plant', filterPlant);
    if (filterCity !== 'All') params.set('city', filterCity);

    setLoading(true);
    axios.get(`${apiBaseUrl}/api/data?${params.toString()}`)
      .then(res => {
        setRawData(normalizeDashboardRows(res.data));
        setLoading(false);
        setLastUpdated(new Date().toLocaleString());
      })
      .catch(err => {
        console.error('Error fetching data', err);
        setLoading(false);
      });
  }, [apiBaseUrl, filterPlant, filterCity, filterDateRange]);

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
        } else if (filterDateRange === 'Year') {
          matchDate = curY === latestY;
        }
      }

      return matchPlant && matchCity && matchDate;
    });
  }, [rawData, filterPlant, filterCity, filterDateRange, latestDateStr]);

  const uniquePlants = useMemo(() => {
    const plants = filterOptions.plants.length ? filterOptions.plants : rawData.map(d => d.plantName || d.plantKey);
    return [...new Set(plants)].filter(Boolean).sort();
  }, [filterOptions.plants, rawData]);
  const uniqueCities = useMemo(() => {
    const cities = filterOptions.cities.length ? filterOptions.cities : rawData.map(d => d.city);
    return [...new Set(cities)].filter(Boolean).sort();
  }, [filterOptions.cities, rawData]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('dateRange', filterDateRange);
    if (filterPlant !== 'All') params.set('plant', filterPlant);
    if (filterCity !== 'All') params.set('city', filterCity);

    axios.get(`${apiBaseUrl}/api/trend?${params.toString()}`)
      .then((res) => {
        const normalizedRows = Array.isArray(res.data)
          ? res.data.map((row) => ({
              date: String(row.date || ''),
              generation: Number(row.generation || 0),
              consumption: Number(row.consumption || 0),
            })).sort((a, b) => String(a.date).localeCompare(String(b.date)))
          : [];
        setTrendRows(normalizedRows);
      })
      .catch((err) => {
        console.error('Error fetching trend data', err);
        setTrendRows([]);
      });
  }, [apiBaseUrl, filterPlant, filterCity, filterDateRange]);

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

  const chatBodyRef = useRef(null);
  const chartColors = ['#10b981', '#f43f5e', '#3b82f6', '#fbbf24', '#8b5cf6'];

  const buildHistoryPayload = (historyMessages) => {
    return (historyMessages || [])
      .filter((msg) => msg && typeof msg === 'object' && msg.type !== 'status')
      .map((msg) => {
        if (msg.type === 'chart') {
          return { role: 'assistant', content: msg.chart?.title || 'Chart generated' };
        }

        if (msg.sender === 'user') {
          return { role: 'user', content: typeof msg.text === 'string' ? msg.text : '' };
        }

        return { role: 'assistant', content: typeof msg.text === 'string' ? msg.text : '' };
      })
      .filter((item) => item.content && item.content.trim());
  };

  const buildRechartData = (chart) => {
    if (!chart?.data || !Array.isArray(chart.data.labels) || !Array.isArray(chart.data.datasets)) {
      return [];
    }

    if (chart.chartType === 'pie') {
      const labels = chart.data.labels || [];
      const values = chart.data.datasets?.[0]?.data || [];
      return labels.map((label, index) => ({
        name: label,
        value: values[index] ?? 0,
        fill: chart.data.datasets?.[0]?.colors?.[index] || chartColors[index % chartColors.length],
      }));
    }

    return chart.data.labels.map((label, index) => {
      const row = { name: label };
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const key = dataset.label || `Series ${datasetIndex + 1}`;
        row[key] = dataset.data?.[index] ?? 0;
        if (dataset.fullLabels) {
          row[`${key}_fullLabel`] = dataset.fullLabels[index];
        }
      });
      return row;
    });
  };

  const renderCandlestickChart = (chart, payload) => {
    const values = payload.flatMap((row) => {
      const candle = row[chart.data.datasets?.[0]?.label || 'Volume'];
      return candle ? [candle.open, candle.high, candle.low, candle.close] : [];
    });
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const range = max - min || 1;
    const width = 720;
    const height = 260;
    const padding = { top: 18, right: 20, bottom: 38, left: 54 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const step = plotWidth / Math.max(payload.length, 1);
    const candleWidth = Math.max(8, Math.min(24, step * 0.44));
    const yFor = (value) => padding.top + ((max - value) / range) * plotHeight;

    return (
      <svg className="special-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart.title || 'Candlestick chart'}>
        <line x1={padding.left} y1={padding.top + plotHeight} x2={width - padding.right} y2={padding.top + plotHeight} className="axis-line" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} className="axis-line" />
        <text x="8" y={padding.top + 4} className="axis-label">{formatLargeNumber(max)}</text>
        <text x="8" y={padding.top + plotHeight} className="axis-label">{formatLargeNumber(min)}</text>
        {payload.map((row, index) => {
          const candle = row[chart.data.datasets?.[0]?.label || 'Volume'];
          if (!candle) return null;
          const x = padding.left + step * index + step / 2;
          const openY = yFor(candle.open);
          const closeY = yFor(candle.close);
          const highY = yFor(candle.high);
          const lowY = yFor(candle.low);
          const isUp = candle.close >= candle.open;
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(3, Math.abs(closeY - openY));
          return (
            <g key={`${row.name}-${index}`}>
              <line x1={x} x2={x} y1={highY} y2={lowY} className={`wick ${isUp ? 'up' : 'down'}`} />
              <rect x={x - candleWidth / 2} y={bodyY} width={candleWidth} height={bodyHeight} rx="3" className={`candle ${isUp ? 'up' : 'down'}`} />
              {index % Math.ceil(payload.length / 6 || 1) === 0 ? <text x={x} y={height - 12} textAnchor="middle" className="axis-label">{row.name}</text> : null}
            </g>
          );
        })}
      </svg>
    );
  };

  const renderGaugeChart = (chart) => {
    const dataset = chart.data.datasets?.[0] || {};
    const value = Number(dataset.data?.[0] || 0);
    const max = Math.max(Number(dataset.max || Math.abs(value) || 1), 1);
    const ratio = Math.min(Math.abs(value) / max, 1);
    const angle = -180 + ratio * 180;
    const needleX = 180 + Math.cos((angle * Math.PI) / 180) * 102;
    const needleY = 150 + Math.sin((angle * Math.PI) / 180) * 102;

    return (
      <div className="gauge-chart" role="img" aria-label={chart.title || 'Gauge chart'}>
        <svg viewBox="0 0 360 210" className="gauge-svg">
          <path d="M60 150 A120 120 0 0 1 300 150" className="gauge-track" />
          <path d="M60 150 A120 120 0 0 1 300 150" className="gauge-progress" style={{ strokeDasharray: `${ratio * 377} 377`, stroke: dataset.color || '#2563eb' }} />
          <line x1="180" y1="150" x2={needleX} y2={needleY} className="gauge-needle" />
          <circle cx="180" cy="150" r="8" className="gauge-hub" />
        </svg>
        <div className="gauge-value">{formatLargeNumber(value)}</div>
        <div className="gauge-caption">{dataset.label || 'Value'} of {formatLargeNumber(max)}</div>
      </div>
    );
  };

  const tooltipFormatter = (value, name) => {
    if (String(name).includes('%')) return [`${Number(value).toFixed(1)}%`, name];
    return [formatLargeNumber(value), name];
  };

  const renderChartMessage = (chart) => {
    const payload = buildRechartData(chart);
    return (
      <div className="bot-chart-card">
        <div className="bot-chart-header">
          <div>
            <div className="bot-chart-title">{chart.title || 'Chart'}</div>
            {chart.subtitle ? <div className="bot-chart-subtitle">{chart.subtitle}</div> : null}
          </div>
        </div>
        <div className="bot-chart-wrapper">
          {chart.chartType === 'candlestick' ? renderCandlestickChart(chart, payload) : chart.chartType === 'gauge' ? renderGaugeChart(chart) : (
            <ResponsiveContainer width="100%" height="100%">
              {chart.chartType === 'line' ? (
              <LineChart data={payload} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#334155', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#334155', fontSize: 12 }} tickFormatter={formatLargeNumber} tickLine={false} axisLine={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid rgba(148, 163, 184, 0.22)', color: '#0f172a' }} formatter={tooltipFormatter} />
                <RechartsLegend wrapperStyle={{ color: '#334155' }} />
                {chart.data.datasets.map((dataset, index) => (
                  <RechartsLine
                    key={`${dataset.label}-${index}`}
                    type="monotone"
                    dataKey={dataset.label || `Series ${index + 1}`}
                    stroke={dataset.color || chartColors[index % chartColors.length]}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            ) : chart.chartType === 'pareto' ? (
              <ComposedChart data={payload} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#334155', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tick={{ fill: '#334155', fontSize: 12 }} tickFormatter={formatLargeNumber} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: '#334155', fontSize: 12 }} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid rgba(148, 163, 184, 0.22)', color: '#0f172a' }} formatter={tooltipFormatter} />
                <RechartsLegend wrapperStyle={{ color: '#334155' }} />
                <RechartsBar yAxisId="left" dataKey="Volume" fill={chart.data.datasets?.[0]?.color || '#2563eb'} radius={[8, 8, 0, 0]} />
                <RechartsLine yAxisId="right" type="monotone" dataKey="Cumulative %" stroke={chart.data.datasets?.[1]?.color || '#f59e0b'} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            ) : chart.chartType === 'bar' || chart.chartType === 'histogram' || chart.chartType === 'waterfall' ? (
              <BarChart data={payload} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#334155', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#334155', fontSize: 12 }} tickFormatter={formatLargeNumber} tickLine={false} axisLine={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid rgba(148, 163, 184, 0.22)', color: '#0f172a' }} formatter={tooltipFormatter} />
                <RechartsLegend wrapperStyle={{ color: '#334155' }} />
                {chart.data.datasets.map((dataset, index) => (
                  <RechartsBar
                    key={`${dataset.label}-${index}`}
                    dataKey={dataset.label || `Series ${index + 1}`}
                    fill={dataset.color || chartColors[index % chartColors.length]}
                    radius={[8, 8, 0, 0]}
                  >
                    {chart.chartType === 'waterfall'
                      ? payload.map((entry, cellIndex) => (
                          <Cell key={`waterfall-${cellIndex}`} fill={entry[dataset.label] >= 0 ? '#10b981' : '#f43f5e'} />
                        ))
                      : null}
                  </RechartsBar>
                ))}
              </BarChart>
            ) : (
              <PieChart>
                <RechartsTooltip contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid rgba(148, 163, 184, 0.22)', color: '#0f172a' }} formatter={tooltipFormatter} />
                <Pie data={payload} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={48} paddingAngle={4}>
                  {payload.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill || chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
              </PieChart>
            )}
            </ResponsiveContainer>
          )}
        </div>
      </div>
    );
  };

  const detectChartIntentFrontend = (question) => {
    const lower = String(question || '').toLowerCase();
    return /trend|compare|comparison|visual|chart|graph|plot|show.*trend|versus|\svs\s|bar|candlestick|ohlc|pareto|gauge|histogram|distribution|waterfall|pie|breakdown|share|percent/i.test(lower);
  };

  const Chatbot = () => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loadingChat, setLoadingChat] = useState(false);
    const [listening, setListening] = useState(false);
    const [ttsEnabled, setTtsEnabled] = useState(false);
    const [voiceSupported, setVoiceSupported] = useState(false);
    const recognitionRef = useRef(null);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      setVoiceSupported(Boolean(SpeechRecognition));
    }, []);

    useEffect(() => {
      return () => {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      };
    }, []);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      try {
        const stored = window.localStorage.getItem(CHAT_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setMessages(parsed);
          }
        }
      } catch (error) {
        console.error('Failed to load chat history', error);
      }
    }, []);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      try {
        const persistedMessages = messages.filter((msg) => msg && msg.type !== 'status');
        window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(persistedMessages));
      } catch (error) {
        console.error('Failed to save chat history', error);
      }
    }, [messages]);

    useEffect(() => {
      if (!open || !chatBodyRef.current) return;
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }, [messages, open]);

    const clearChat = () => {
      setMessages([]);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(CHAT_STORAGE_KEY);
        } catch (error) {
          console.error('Failed to clear chat history', error);
        }
      }
    };

    const speakText = (text) => {
      if (!ttsEnabled || typeof window === 'undefined' || !window.speechSynthesis || !text) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.96;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    };

    const toggleListening = () => {
      if (!voiceSupported || loadingChat) return;
      if (listening && recognitionRef.current) {
        recognitionRef.current.stop();
        setListening(false);
        return;
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      setListening(true);
      recognition.start();
    };

    const sendMessage = async () => {
      if (!input.trim() || loadingChat) return;
      const question = input.trim();
      const wantsChart = detectChartIntentFrontend(question);
      const userMsg = { sender: 'user', type: 'text', text: question };
      const placeholderMsg = {
        sender: 'bot',
        type: 'status',
        text: wantsChart ? 'Generating chart...' : 'Thinking...',
      };
      const conversationHistory = buildHistoryPayload(messages);
      const conversationMessages = [
        ...conversationHistory,
        { role: 'user', content: question },
      ];

      setMessages((prev) => [...prev, userMsg, placeholderMsg]);
      setInput('');
      setLoadingChat(true);

      try {
        const response = await fetch(`${apiBaseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: question, history: conversationHistory, messages: conversationMessages, sessionId }),
        });

        const contentType = response.headers.get('content-type') || '';
        let botMessage;

        if (response.ok && contentType.includes('application/json')) {
          const payload = await response.json();
          const chartPayload = payload?.type === 'chart'
            ? payload
            : payload?.chart?.type === 'chart'
              ? payload.chart
              : payload?.chartType && payload?.data
                ? { ...payload, type: 'chart' }
                : null;
          if (chartPayload?.data) {
            botMessage = { sender: 'bot', type: 'chart', chart: chartPayload };
          } else {
            const text = payload?.message || payload?.response || JSON.stringify(payload);
            botMessage = { sender: 'bot', type: 'text', text };
          }
        } else if (response.ok) {
          const text = await response.text();
          botMessage = { sender: 'bot', type: 'text', text: text || 'No response came back from the assistant.' };
        } else {
          const errorText = await response.text();
          botMessage = { sender: 'bot', type: 'text', text: errorText || 'The assistant returned an error.' };
        }

        setMessages((prev) => {
          const current = [...prev];
          const placeholderIndex = current.findIndex((msg) => msg.sender === 'bot' && msg.type === 'status');
          if (placeholderIndex >= 0) {
            current[placeholderIndex] = botMessage;
          } else {
            current.push(botMessage);
          }
          return current;
        });
        speakText(botMessage.type === 'chart' ? `${botMessage.chart?.title || 'Chart generated'}. ${botMessage.chart?.subtitle || ''}` : botMessage.text);
      } catch {
        const errorMessage = 'Sorry, the assistant is unavailable. Please make sure Ollama is running locally.';
        setMessages((prev) => {
          const current = [...prev];
          const placeholderIndex = current.findIndex((msg) => msg.sender === 'bot' && msg.type === 'status');
          if (placeholderIndex >= 0) {
            current[placeholderIndex] = { sender: 'bot', type: 'text', text: errorMessage };
          } else {
            current.push({ sender: 'bot', type: 'text', text: errorMessage });
          }
          return current;
        });
        speakText(errorMessage);
      } finally {
        setLoadingChat(false);
      }
    };

    return (
      <div className="chatbot-container">
        <button className="chatbot-button" onClick={() => setOpen(!open)} title="AI Assistant">
          <MessageSquare size={24} />
        </button>

        <div className={`chatbot-widget ${open ? 'open' : ''}`}>
          <div className="chatbot-header">
            <div className="chatbot-title">AI Assistant</div>
            <div className="chatbot-header-actions">
              <button className="chatbot-clear" onClick={clearChat} aria-label="Clear chat">
                Clear Chat
              </button>
              <button className="chatbot-close" onClick={() => setOpen(false)} aria-label="Close chat">
                <CloseIcon size={18} />
              </button>
            </div>
          </div>

          <div className="chatbot-body" ref={chatBodyRef}>
            {messages.length === 0 ? (
              <div className="chatbot-empty-state">
                Ask about trends, comparisons, or data insights from the dashboard.
              </div>
            ) : messages.map((msg, idx) => (
              <div key={idx} className={`chatbot-message ${msg.sender} ${msg.type}`}>
                {msg.type === 'chart'
                  ? renderChartMessage(msg.chart)
                  : <div className="message-text">{msg.text}</div>}
              </div>
            ))}
          </div>

          <div className="chatbot-footer">
            <button
              className={`chatbot-icon-action ${listening ? 'active' : ''}`}
              onClick={toggleListening}
              disabled={!voiceSupported || loadingChat}
              title={voiceSupported ? 'Speak your question' : 'Speech recognition is not supported in this browser'}
              aria-label="Speak your question"
            >
              {listening ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for trends, comparisons, or CSV details..."
              onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
              disabled={loadingChat}
            />
            <button
              className={`chatbot-icon-action ${ttsEnabled ? 'active' : ''}`}
              onClick={() => {
                const next = !ttsEnabled;
                setTtsEnabled(next);
                if (!next && typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
              }}
              title="Toggle spoken replies"
              aria-label="Toggle spoken replies"
            >
              {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button onClick={sendMessage} disabled={loadingChat}>Send</button>
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
      legend: { labels: { color: '#334155', usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.96)',
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
        grid: { color: 'rgba(15, 23, 42, 0.08)', drawBorder: false },
        ticks: { color: '#64748b', callback: formatLargeNumber, padding: 8 }
      },
      x: {
        grid: { display: false },
        ticks: {
          color: '#64748b',
          maxTicksLimit: isTrend ? 10 : undefined, // Reduce clutter
          maxRotation: 45,
          minRotation: 0
        }
      }
    }
  });

  const plantTableConfig = useMemo(() => {
    switch (filterDateRange) {
      case '7D':
        return { generationLabel: 'Generation (7D)', consumptionLabel: 'Consumption (7D)' };
      case '30D':
        return { generationLabel: 'Generation (30D)', consumptionLabel: 'Consumption (30D)' };
      case 'Month':
        return { generationLabel: 'Generation MTD', consumptionLabel: 'Consumption MTD' };
      case 'Year':
        return { generationLabel: 'Generation YTD', consumptionLabel: 'Consumption YTD' };
      default:
        return { generationLabel: 'Total Generation', consumptionLabel: 'Total Consumption' };
    }
  }, [filterDateRange]);

  // --- Row 1: Table & Dual Trend Chart ---
  const plantStats = useMemo(() => {
    if (!filteredData.length) return [];

    const statsMap = {};

    filteredData.forEach(d => {
      const pName = d.plantName || d.plantKey || 'Unknown';
      if (!statsMap[pName]) {
        statsMap[pName] = { name: pName, generation: 0, consumption: 0 };
      }
      if (['101', '102'].includes(d.movementType)) {
        statsMap[pName].generation += d.quantity;
      }
      if (['261', '262'].includes(d.movementType)) {
        statsMap[pName].consumption += d.quantity;
      }
    });

    return Object.values(statsMap).sort((a, b) => (b.generation + b.consumption) - (a.generation + a.consumption));
  }, [filteredData]);

  const processDualTrendChart = () => {
    const sortedRows = [...trendRows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return {
      labels: sortedRows.map(row => parseDateString(row.date)),
      genData: sortedRows.map(row => row.generation),
      conData: sortedRows.map(row => row.consumption)
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
      x: { grid: { color: 'rgba(15, 23, 42, 0.08)' }, ticks: { color: '#64748b', callback: formatLargeNumber } },
      y: { grid: { display: false }, ticks: { color: '#334155', font: { weight: '500' } } }
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

        <button 
          className="mobile-filters-toggle" 
          onClick={() => setIsFiltersOpen(!isFiltersOpen)}
        >
          <ListFilter size={18} /> 
          Filters
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
