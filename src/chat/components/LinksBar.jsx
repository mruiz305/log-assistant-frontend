
import s from '../styles';
function LinksBar({ links, t, lang }) {
  if (!links || (!links.logsPdf && !links.rosterPdf)) return null;

  const labelLogs = lang === 'es' ? 'Logs PDF' : 'PDF Logs';
  const labelRoster = lang === 'es' ? 'Roster PDF' : 'PDF Roster';

  return (
    <div style={s.linksWrap(t)}>
      {links.logsPdf && (
        <a
          href={links.logsPdf}
          target="_blank"
          rel="noreferrer"
          style={s.linkBtn(t)}
          title={links.logsPdf}
        >
          📄 {labelLogs}
        </a>
      )}

      {links.rosterPdf && (
        <a
          href={links.rosterPdf}
          target="_blank"
          rel="noreferrer"
          style={s.linkBtn(t)}
          title={links.rosterPdf}
        >
          📄 {labelRoster}
        </a>
      )}
    </div>
  );
}
export default LinksBar;