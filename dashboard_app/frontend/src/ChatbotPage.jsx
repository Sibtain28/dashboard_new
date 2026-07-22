import { useState, useEffect, useRef } from 'react';
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
import { Mic, MicOff, Volume2, VolumeX, MessageSquare, Send, Plus, Menu, PanelLeftClose, PanelLeftOpen, Trash2, Search } from 'lucide-react';
import './ChatbotPage.css';
import DashboardWidgetWrapper from './components/dashboard/DashboardWidgetWrapper';

const formatLargeNumber = (value) => {
  if (value === null || value === undefined) return '0 kWh';
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B kWh';
  if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M kWh';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + 'k kWh';
  return value.toLocaleString() + ' kWh';
};

const chartColors = ['#10b981', '#f43f5e', '#3b82f6', '#fbbf24', '#8b5cf6'];

const tooltipFormatter = (value, name) => {
  if (String(name).includes('%')) return [`${Number(value).toFixed(1)}%`, name];
  return [formatLargeNumber(value), name];
};

// Secondary prompt for the dynamic welcome area — chosen at random each time
// a fresh/empty chat is shown (initial page load or "New Chat").
// The main greeting (Good morning/afternoon/evening) is time-based, see
// getTimeBasedGreeting() below.
const WELCOME_SUBTITLES = [
  'How can I help you today?',
  'What would you like to create?',
  "What's on your mind?",
  'Ready when you are.',
  'Ask me anything.',
  "Let's build something amazing.",
  'Need help with coding?',
  'Want to brainstorm ideas?',
  'How can I make your day easier?',
  'What are we working on today?',
];

const PROMPT_SUGGESTIONS = [
  'How much power was generated today?',
  'Show the generation trend.',
  'Compare all plants.',
  'Which region performed best?',
  'Give me key insights.',
];

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Picks a greeting based on the current local time of day. Mornings run
// 5am–11:59am, afternoons run 12pm–4:59pm, everything else is evening.
// Occasionally swaps in a plain "Hello" for a bit of variety.
const getTimeBasedGreeting = () => {
  if (Math.random() < 0.15) return 'Hello';
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
};

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
      <div className="bot-chart-wrapper" style={{ height: '300px', width: '100%' }}>
        {chart.chartType === 'candlestick' ? renderCandlestickChart(chart, payload) : chart.chartType === 'gauge' ? renderGaugeChart(chart) : (
          <ResponsiveContainer width="100%" height="100%">
            {chart.chartType === 'line' ? (
              <LineChart data={payload} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={formatLargeNumber} tickLine={false} axisLine={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#f8fafc' }} formatter={tooltipFormatter} />
                <RechartsLegend wrapperStyle={{ color: '#cbd5e1' }} />
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
                <CartesianGrid stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={formatLargeNumber} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#f8fafc' }} formatter={tooltipFormatter} />
                <RechartsLegend wrapperStyle={{ color: '#cbd5e1' }} />
                <RechartsBar yAxisId="left" dataKey="Volume" fill={chart.data.datasets?.[0]?.color || '#2563eb'} radius={[8, 8, 0, 0]} />
                <RechartsLine yAxisId="right" type="monotone" dataKey="Cumulative %" stroke={chart.data.datasets?.[1]?.color || '#f59e0b'} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            ) : chart.chartType === 'bar' || chart.chartType === 'histogram' || chart.chartType === 'waterfall' ? (
              <BarChart data={payload} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={formatLargeNumber} tickLine={false} axisLine={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#f8fafc' }} formatter={tooltipFormatter} />
                <RechartsLegend wrapperStyle={{ color: '#cbd5e1' }} />
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
                <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#f8fafc' }} formatter={tooltipFormatter} />
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

function ChatbotPage() {
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [listening, setListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [sessionId, setSessionId] = useState(''); // '' = unsaved/draft chat, not yet in Recents
  const chatBodyRef = useRef(null);
  const recognitionRef = useRef(null);

  const [sessions, setSessions] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Dynamic welcome copy — randomized once on page load, and again whenever
  // the user starts a fresh chat.
  const [welcomeGreeting, setWelcomeGreeting] = useState(() => getTimeBasedGreeting());
  const [welcomeSubtitle, setWelcomeSubtitle] = useState(() => pickRandom(WELCOME_SUBTITLES));

  // Guard against double-invocation in React 18 StrictMode (dev)
  const hasInitialized = useRef(false);

  const fetchSessions = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${apiBaseUrl}/api/chat/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        return data;
      }
    } catch (e) {
      console.error('Failed to fetch sessions', e);
    }
    return null;
  };

  // On mount: load sessions. If any exist, open the most recent one.
  // If none exist, DO NOT create a backend session — just show a blank draft chat.
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const init = async () => {
      const data = await fetchSessions();
      if (data && data.length > 0) {
        loadSession(data[0].id);
      } else {
        setSessionId('');
        setMessages([]);
      }
    };
    init();
  }, [apiBaseUrl]);

  const loadSession = async (id) => {
    setSessionId(id);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiBaseUrl}/api/chat/sessions/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const formatted = data.map(msg => {
          let content = msg.content;
          try { content = JSON.parse(msg.content); } catch (e) { }

          if (msg.role === 'user') {
            return { sender: 'user', type: 'text', text: typeof content === 'string' ? content : content.text };
          } else {
            if (content && content.type === 'dashboard_component') {
              return { sender: 'bot', type: 'dashboard_component', components: content.components, filters: content.filters };
            }
            if (content && content.type === 'chart') {
              return { sender: 'bot', type: 'chart', chart: content };
            }
            return { sender: 'bot', type: 'text', text: typeof content === 'string' ? content : (content.text || content.message) };
          }
        });
        setMessages(formatted);
      }
    } catch (e) {
      console.error('Failed to load session messages', e);
    }
  };

  // "New Chat" button — purely local, no backend call, no sidebar entry.
  const startNewChat = () => {
    setSessionId('');
    setMessages([]);
    // Re-roll the welcome copy each time a fresh chat is started.
    setWelcomeGreeting(getTimeBasedGreeting());
    setWelcomeSubtitle(pickRandom(WELCOME_SUBTITLES));
  };

  // Creates the backend session record. Called only when the user sends their
  // first message in a draft chat. Returns the new session id.
  const createSessionRecord = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiBaseUrl}/api/chat/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: 'New Chat' })
      });
      if (res.ok) {
        const newSession = await res.json();
        setSessions(prev => [newSession, ...prev]);
        return newSession.id;
      }
    } catch (e) {
      console.error('Failed to create new session', e);
    }
    return null;
  };

  const deleteSession = async (id, event) => {
    if (event) event.stopPropagation();
    const confirmed = window.confirm('Delete this chat? This cannot be undone.');
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiBaseUrl}/api/chat/sessions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setSessions(prev => {
          const updated = prev.filter(s => s.id !== id);

          if (id === sessionId) {
            if (updated.length > 0) {
              loadSession(updated[0].id);
            } else {
              startNewChat();
            }
          }

          return updated;
        });
      } else {
        console.error('Failed to delete session on server');
      }
    } catch (e) {
      console.error('Failed to delete session', e);
    }
  };

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
    if (!chatBodyRef.current) return;
    chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
  }, [messages]);

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

  const sendMessage = async (overrideText) => {
    const question = (typeof overrideText === 'string' ? overrideText : input).trim();
    if (!question || loadingChat) return;
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

    // This is a draft chat (no backend record yet) — create it now, on first send.
    const isFirstMessage = !sessionId;
    let activeSessionId = sessionId;

    if (isFirstMessage) {
      const newId = await createSessionRecord();
      if (newId) {
        activeSessionId = newId;
        setSessionId(newId);
      }
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: question, history: conversationHistory, messages: conversationMessages, sessionId: activeSessionId }),
      });

      const contentType = response.headers.get('content-type') || '';
      let botMessage;

      if (response.ok && contentType.includes('application/json')) {
        const payload = await response.json();

        const chartPayload = payload?.type === 'dashboard_component'
          ? payload
          : payload?.type === 'chart'
            ? payload
            : payload?.chart?.type === 'chart'
              ? payload.chart
              : payload?.chartType && payload?.data
                ? { ...payload, type: 'chart' }
                : null;
        if (payload?.type === 'dashboard_component') {
          botMessage = { sender: 'bot', type: 'dashboard_component', components: payload.components, filters: payload.filters };
        } else if (chartPayload?.data) {
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

      // The backend generates the real title asynchronously after the first
      // message — poll a couple of times so the sidebar picks it up.
      if (isFirstMessage) {
        setTimeout(() => {
          fetchSessions();
        }, 3000);
        setTimeout(() => {
          fetchSessions();
        }, 8000);
      }
    } catch {
      const errorMessage = 'Sorry, the assistant is unavailable. Please make sure the backend is running.';
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

  // Clicking a suggestion chip populates the input, matching prior behavior.
  const handleSuggestionClick = (prompt) => {
    setInput(prompt);
  };

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { name: 'User' };
  const firstName = user.name.split(' ')[0];

  const filteredSessions = sessions.filter((s) =>
    (s.title || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isEmptyChat = messages.length === 0;

  return (
    <div className="chat-layout-wrapper">
      <div className={`chat-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="chat-sidebar-inner">
          <div className="sidebar-header">
            <button className="new-chat-btn" onClick={startNewChat}>
              <Plus size={16} /> New Chat
            </button>
            <button className="toggle-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <PanelLeftClose size={18} />
            </button>
          </div>

          <div className="sidebar-search-row">
            <button
              className="search-chats-btn"
              onClick={() => setSearchOpen((prev) => !prev)}
            >
              <Search size={16} /> Search chats
            </button>
          </div>

          {searchOpen && (
            <div className="sidebar-search-input-wrapper">
              <Search size={14} className="search-input-icon" />
              <input
                type="text"
                className="sidebar-search-input"
                placeholder="Search chats..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="sidebar-sessions">
            {filteredSessions.length > 0 && (
              <div className="sidebar-section-label">Recents</div>
            )}
            {filteredSessions.map(s => (
              <div
                key={s.id}
                className={`session-item ${s.id === sessionId ? 'active' : ''}`}
                onClick={() => loadSession(s.id)}
              >
                <div className="session-item-info" title={s.title}>
                  <MessageSquare size={14} />
                  <span>{s.title}</span>
                </div>
                <button
                  className="session-delete-btn"
                  onClick={(e) => deleteSession(s.id, e)}
                  title="Delete chat"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="chat-page-container" style={{ flex: 1 }}>
        <div className="chat-page-header">
          <div className="chat-page-title">
            {!sidebarOpen && (
              <button className="toggle-sidebar-open" onClick={() => setSidebarOpen(true)}>
                <PanelLeftOpen size={18} />
              </button>
            )}
            <MessageSquare size={16} />
            <h2>SteelAI</h2>
          </div>
        </div>

        <div className="chat-page-body" ref={chatBodyRef}>
          {isEmptyChat ? (
            <div className="chat-page-empty-state">
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                <svg width="120" height="120" viewBox="0 0 260 260">
                  <defs>
                    <radialGradient id="iri" cx="35%" cy="30%" r="75%">
                      <stop offset="0%" stopColor="#9be8ff" />
                      <stop offset="30%" stopColor="#7afcff" />
                      <stop offset="55%" stopColor="#a78bfa" />
                      <stop offset="80%" stopColor="#ff6ec7" />
                      <stop offset="100%" stopColor="#ffd166" />
                    </radialGradient>
                    <filter id="soft" x="-100%" y="-100%" width="300%" height="300%">
                      <feGaussianBlur stdDeviation="14" />
                    </filter>
                  </defs>
                  <circle cx="130" cy="130" r="70" fill="url(#iri)" filter="url(#soft)" opacity="0.55">
                    <animate attributeName="r" values="55;85;55" dur="3.2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0.7;0.4" dur="3.2s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="130" cy="130" r="55" fill="url(#iri)">
                    <animate attributeName="r" values="45;65;45" dur="3.2s" repeatCount="indefinite" />
                    <animateTransform attributeName="transform" type="rotate" from="0 130 130" to="360 130 130" dur="9s" repeatCount="indefinite" />
                  </circle>
                </svg>
              </div>

              <h1 className="welcome-greeting fade-in-up">{welcomeGreeting}, {firstName}</h1>
              <p className="welcome-subtitle fade-in-up fade-in-delay-1">{welcomeSubtitle}</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`chat-page-message ${msg.sender} ${msg.type}`}>
                <div className="message-content">

                  {msg.type === 'dashboard_component' ? (
                    <div style={{ width: '100%', overflow: 'hidden' }}>
                      <DashboardWidgetWrapper components={msg.components} filters={msg.filters} />
                    </div>
                  ) : msg.type === 'chart' ? (
                    renderChartMessage(msg.chart)
                  ) : (
                    <div className="message-text">{msg.text}</div>
                  )}

                </div>
              </div>
            ))
          )}
        </div>

        <div className="chat-page-footer">
          <div className="chat-input-wrapper">
            {isEmptyChat && (
              <div className="prompt-suggestions-row fade-in-up fade-in-delay-2">
                {PROMPT_SUGGESTIONS.map((prompt) => (
                  <button
                    key={prompt}
                    className="prompt-chip"
                    onClick={() => handleSuggestionClick(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            <div className="chat-input-container">
              <input
                type="text"
                className="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="How can SteelAI help you today?"
                onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
                disabled={loadingChat}
              />

              <div className="chat-input-actions">
                <div className="chat-input-left">
                  <span className="model-selector">Ollama 3.2</span>
                </div>
                <div className="chat-input-right">
                  <button
                    className={`chat-icon-action ${listening ? 'active' : ''}`}
                    onClick={toggleListening}
                    disabled={!voiceSupported || loadingChat}
                  >
                    {listening ? <Mic size={16} /> : <MicOff size={16} />}
                  </button>
                  <button
                    className={`chat-icon-action ${ttsEnabled ? 'active' : ''}`}
                    onClick={() => {
                      const next = !ttsEnabled;
                      setTtsEnabled(next);
                      if (!next && typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
                    }}
                  >
                    {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </button>
                  <button className="chat-send-action" onClick={() => sendMessage()} disabled={loadingChat || !input.trim()}>
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
            <div className="chat-footer-hint">
              <span>SteelAI can make mistakes. Please double-check responses.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatbotPage;