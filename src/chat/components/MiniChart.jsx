import { safeNum } from '../utils';

function MiniChart({ chart, t, lang }) {
  if (!chart) return null;

  // FIX: soporta backend que manda `type` en vez de `kind`
  const kind = String(chart.kind || chart.type || '').toLowerCase(); // 'bar' | 'line' | 'pie' | 'donut'
  const title = String(chart.title || '').trim();

  const labels = Array.isArray(chart.labels) ? chart.labels.map((x) => String(x ?? '')) : [];
  const values = Array.isArray(chart.values) ? chart.values.map((x) => safeNum(x, 0)) : [];

  if (!labels.length || !values.length || labels.length !== values.length) return null;

  // UI text
  const titleFallback = lang === 'es' ? 'Resumen gráfico' : 'Chart summary';

  // Styles (manteniendo tu look)
  const cardStyle = {
    marginTop: 10,
    borderRadius: 14,
    border: `1px solid ${t.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)'}`,
    background: t.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
    padding: 10,
  };

  const headerStyle = {
    fontSize: 12,
    fontWeight: 900,
    color: t.textMuted,
    marginBottom: 8,
    letterSpacing: 0.2,
  };

  const svgBg = t.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)';
  const stroke = t.mode === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.25)';

  // Defaults (solo fallback)
  const accent = t.mode === 'dark' ? 'rgba(250,204,21,0.85)' : 'rgba(15,98,254,0.85)';
  const accent2 = t.mode === 'dark' ? 'rgba(34,197,94,0.75)' : 'rgba(34,197,94,0.75)';
  const accent3 = t.mode === 'dark' ? 'rgba(59,130,246,0.75)' : 'rgba(59,130,246,0.75)';
  const palette = [accent, accent2, accent3, 'rgba(250,204,21,0.55)', 'rgba(34,197,94,0.55)'];


  const colors = Array.isArray(chart.colors) ? chart.colors : null;
  const colorAt = (i) => (colors?.[i] ? String(colors[i]) : palette[i % palette.length]);

  // Dimensions
  const W = 280;
  const H = 120;
  const pad = 12;

  // Helpers
  const maxV = Math.max(...values, 0.00001);
  const sumV = values.reduce((a, b) => a + b, 0);

  // BAR CHART
  const renderBar = () => {
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;

    const barCount = values.length;
    const gap = 6;
    const barW = Math.max(6, Math.floor((innerW - gap * (barCount - 1)) / barCount));

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <rect x="0" y="0" width={W} height={H} rx="12" fill={svgBg} />
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={stroke} strokeWidth="1" />

        {values.map((v, i) => {
          const h = (v / maxV) * (innerH - 10);
          const x = pad + i * (barW + gap);
          const y = H - pad - h;

          return <rect key={i} x={x} y={y} width={barW} height={h} rx="6" fill={colorAt(i)} />;
        })}
      </svg>
    );
  };

  // LINE CHART
  const renderLine = () => {
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;

    const pts = values.map((v, i) => {
      const x = pad + (i / Math.max(values.length - 1, 1)) * innerW;
      const y = pad + (1 - v / maxV) * innerH;
      return { x, y };
    });

    const d = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
    const lineColor = colors?.[0] ? String(colors[0]) : accent;

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <rect x="0" y="0" width={W} height={H} rx="12" fill={svgBg} />

        {[0.25, 0.5, 0.75].map((k) => {
          const y = pad + k * (H - pad * 2);
          return <line key={k} x1={pad} y1={y} x2={W - pad} y2={y} stroke={stroke} strokeWidth="1" />;
        })}

        <path d={d} fill="none" stroke={lineColor} strokeWidth="3" strokeLinecap="round" />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill={lineColor} />)}
      </svg>
    );
  };

  // DONUT CHART
  const renderDonut = () => {
    const cx = 78;
    const cy = 60;
    const r = 34;
    const strokeW = 12;
    const circ = 2 * Math.PI * r;
    let acc = 0;

    const items = values.map((v, i) => {
      const frac = sumV > 0 ? v / sumV : 0;
      const dash = frac * circ;
      const gap = 2.0;
      const start = acc * circ;
      acc += frac;

      return {
        i,
        dash: Math.max(0, dash - gap),
        offset: -start,
        color: colorAt(i),
      };
    });

    const centerLabel = String(chart?.center?.label || (lang === 'es' ? 'Total' : 'Total'));
    const centerValue = safeNum(chart?.center?.value, sumV);

    const legendX = 140;
    const legendY = 22;

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <rect x="0" y="0" width={W} height={H} rx="12" fill={svgBg} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={strokeW} />

        {items.map((it) => (
          <circle
            key={it.i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={it.color}
            strokeWidth={strokeW}
            strokeDasharray={`${it.dash} ${circ}`}
            strokeDashoffset={it.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="round"
          />
        ))}

        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="11" fill={t.textMuted} fontWeight="900">
          {centerLabel}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="20" fill={t.text} fontWeight="950">
          {centerValue}
        </text>

        {labels.slice(0, 5).map((lab, i) => (
          <g key={i}>
            <rect x={legendX} y={legendY + i * 18} width="10" height="10" rx="2" fill={colorAt(i)} />
            <text
              x={legendX + 16}
              y={legendY + i * 18 + 9}
              fontSize="11"
              fill={t.mode === 'dark' ? 'rgba(248,250,252,0.92)' : 'rgba(15,23,42,0.92)'}
              fontWeight="800"
            >
              {lab}
            </text>
          </g>
        ))}
      </svg>
    );
  };

  const body =
    kind === 'line' ? renderLine() : kind === 'pie' || kind === 'donut' ? renderDonut() : renderBar();

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>{title || titleFallback}</div>
      {body}

      <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {labels.slice(0, 6).map((lab, i) => (
          <div
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 999,
              border: `1px solid ${t.border}`,
              background: t.surface2,
              fontSize: 12,
              fontWeight: 900,
              color: t.text,
            }}
            title={`${lab}: ${values[i]}`}
          >
            <span style={{ width: 8, height: 8, borderRadius: 999, background: colorAt(i) }} />
            {lab}: {values[i]}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MiniChart;
