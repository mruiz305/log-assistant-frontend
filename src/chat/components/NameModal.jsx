import { useState } from 'react';
import s from './chat/styles';

function NameModal({ t, lang, onSave, onSkip }) {
  const [name, setName] = useState('');

  const title = lang === 'es' ? '¿Cómo te llamas?' : "What’s your name?";
  const subtitle =
    lang === 'es'
      ? 'Lo usaré para personalizar el chat. Puedes cambiarlo después.'
      : 'I’ll use it to personalize the chat. You can change it later.';
  const placeholder = lang === 'es' ? 'Ej: Milagros' : 'Ex: Ana';
  const save = lang === 'es' ? 'Guardar' : 'Save';
  const skip = lang === 'es' ? 'Ahora no' : 'Not now';

  return (
    <div style={s.modalOverlay(t)}>
      <div style={s.modalCard(t)}>
        <div style={s.modalTitle(t)}>{title}</div>
        <div style={s.modalSub(t)}>{subtitle}</div>

        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          style={s.modalInput(t)}
        />

        <div style={s.modalActions}>
          <button type="button" onClick={onSkip} style={s.modalBtnGhost(t)}>
            {skip}
          </button>

          <button
            type="button"
            onClick={() => onSave(name)}
            style={{
              ...s.modalBtnPrimary(t),
              opacity: name.trim() ? 1 : 0.55,
              cursor: name.trim() ? 'pointer' : 'not-allowed',
            }}
            disabled={!name.trim()}
          >
            {save}
          </button>
        </div>
      </div>
    </div>
  );
}
export default NameModal;