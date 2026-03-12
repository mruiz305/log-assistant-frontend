import React from 'react';
import s from '../styles';
import { splitLines, classifyLine } from '../utils';

function BotPrettyAnswer({ text, t, lang, showHeader = true }) {
  const lines = splitLines(text);

  const bulletLines = lines
    .map((l) => l.replace(/^[-•]\s*/, '').trim())
    .filter((l) => l.length > 0);

  const looksLikeBullets =
    lines.length >= 2 && lines.filter((l) => /^[-•]\s+/.test(l)).length >= 2;

  if (!looksLikeBullets) {
    return <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>;
  }

  return (
    <div style={s.botAnswerWrap(t)}>
      {showHeader && <div style={s.botAnswerHeader(t)}>{lang === 'es' ? 'Resumen' : 'Summary'}</div>}

      <div style={s.botAnswerList(t)}>
        {bulletLines.map((line, idx) => {
          const { icon, tone } = classifyLine(line);
          return (
            <div key={idx} style={s.botAnswerItem(t, tone)}>
              <div style={s.botAnswerIcon(t, tone)}>{icon}</div>
              <div style={s.botAnswerText(t)}>{line}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default BotPrettyAnswer;
