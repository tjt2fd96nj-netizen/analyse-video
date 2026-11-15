// Petites fenêtres de dialogue dans la page (remplacent prompt() et confirm(),
// moins jolis sur mobile et bloqués dans certains lecteurs intégrés).

function dialog({ message, value = null, okLabel = 'OK', danger = false, multiline = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal ask-modal';
    wrap.innerHTML = `
      <form class="ask-card">
        <label class="ask-msg"></label>
        ${value === null ? '' : multiline ? '<textarea class="ask-input" rows="3"></textarea>' : '<input class="ask-input" type="text" autocomplete="off">'}
        <div class="ask-btns">
          <button type="button" class="btn ghost ask-cancel">Annuler</button>
          <button type="submit" class="btn ${danger ? 'danger' : 'primary'}"></button>
        </div>
      </form>`;
    wrap.querySelector('.ask-msg').textContent = message;
    wrap.querySelector('[type=submit]').textContent = okLabel;
    const input = wrap.querySelector('.ask-input');
    if (input) input.value = value;
    const close = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    wrap.querySelector('form').onsubmit = (e) => { e.preventDefault(); close(input ? input.value : true); };
    wrap.querySelector('.ask-cancel').onclick = () => close(null);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(null); });
    if (input && multiline) input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); close(input.value); } });
    document.addEventListener('keydown', onKey, true);
    document.body.append(wrap);
    setTimeout(() => (input || wrap.querySelector('[type=submit]')).focus(), 30);
  });
}

// Renvoie le texte saisi, ou null si annulé.
export const askText = (message, value = '', opts = {}) => dialog({ message, value: value ?? '', ...opts });
// Renvoie true si confirmé.
export const askConfirm = async (message, okLabel = 'Supprimer') => (await dialog({ message, okLabel, danger: true })) === true;
