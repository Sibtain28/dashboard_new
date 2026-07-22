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

export function normalizeCityName(city) {
  return city ? city.charAt(0).toUpperCase() + city.slice(1).toLowerCase() : 'Unknown';
}

export function normalizeDashboardRows(rows) {
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

export const parseDateString = (dateStr) => {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  const dateObj = new Date(`${y}-${m}-${d}`);
  return dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
};

export const formatLargeNumber = (value) => {
  if (value === null || value === undefined) return '0 kWh';
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B kWh';
  if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M kWh';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + 'k kWh';
  return value.toLocaleString() + ' kWh';
};

export const formatTableNum = (val) => {
  if (!val) return '-';
  return val.toLocaleString();
};

export const truncateString = (str, num) => {
  if (str.length <= num) return str;
  return str.slice(0, num) + '...';
};

export const createChartOptions = (isTrend = false) => ({
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
        maxTicksLimit: isTrend ? 10 : undefined,
        maxRotation: 45,
        minRotation: 0
      }
    }
  }
});
