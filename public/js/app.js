import { projects, newId } from './db.js';
import { videoStorage } from './video-storage.js';
import { Sketch, buildToolbar, drawShapes } from './sketch.js';

const $ = (s) => document.querySelector(s);
const FRAME = 1 / 30;
const DEFAULT_DUR = 3;

// ---------------------------------------------------------------- utilitaires
function fmt(t, cs = true) {
  if (!isFinite(t)) t = 0;
  const m = Math.floor(t / 60), s = t - m * 60;
  return cs ? `${m}:${s.toFixed(2).padStart(5, '0')}` : `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2500);
}
function download(name, href) {
  const a = document.createElement('a');
  a.href = href; a.download = name; document.body.append(a); a.click(); a.remove();
}
const safeName = (s) => (s || 'analyse').replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'analyse';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- état
let P = null;            // analyse ouverte
let urlA = null, urlB = null;
let saveTimer = null;
const undoStack = [];    // { annId, shapeId }
let loopA = null, loopB = null;
let lastT = 0;
let lastKey = '';

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => P && projects.put(P), 300);
}

// ---------------------------------------------------------------- navigation
window.addEventListener('hashchange', route);
async function route() {
  const m = location.hash.match(/^#p=(.+)$/);
  if (m) {
    const p = await projects.get(decodeURIComponent(m[1]));
    if (p) return openProject(p);
    location.hash = '';
  }
  closeProject();
  renderHome();
}

// ---------------------------------------------------------------- accueil
async function renderHome() {
  $('#home').hidden = false; $('#project').hidden = true;
  const list = await projects.list();
  const ul = $('#projectList');
  ul.innerHTML = '';
  $('#emptyHint').hidden = list.length > 0;
  for (const p of list) {
    const li = document.createElement('li');
    const nC = p.annotations.filter((a) => a.text).length, nD = p.annotations.reduce((n, a) => n + a.shapes.length, 0);
    li.innerHTML = `
      <button class="open">
        <span class="ptitle">${esc(p.title)}</span>
        <span class="pmeta">${p.videoRef ? '🎬 ' + esc(p.videoRef.name || 'vidéo') : '🎬 (vidéo à ajouter)'} · ${nC} commentaire(s) · ${nD} dessin(s) · ${p.annotations.filter((a) => a.board).length} schéma(s)
        · ${new Date(p.updatedAt).toLocaleDateString('fr-FR')}</span>
      </button>
      <button class="btn ghost small del" title="Supprimer">🗑</button>`;
    li.querySelector('.open').onclick = () => (location.hash = 'p=' + encodeURIComponent(p.id));
    li.querySelector('.del').onclick = async () => {
      if (!confirm(`Supprimer « ${p.title} » ?`)) return;
      await videoStorage.remove(p.videoRef); await videoStorage.remove(p.compareRef);
      await projects.remove(p.id); renderHome();
    };
    ul.append(li);
  }
}

function blankProject(title) {
  return { id: newId(), title, createdAt: Date.now(), updatedAt: Date.now(), videoRef: null, compareRef: null, annotations: [], boards: [] };
}

$('#newVideoInput').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  toast('Import de la vidéo…');
  const p = blankProject(f.name.replace(/\.[^.]+$/, ''));
  p.videoRef = await videoStorage.upload(f);
  await projects.put(p);
  location.hash = 'p=' + encodeURIComponent(p.id);
};

$('#importInput').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.format !== 'analyse-video') throw new Error('format');
    const p = { ...blankProject(data.title || 'Analyse importée'), annotations: data.annotations || [], slow: data.slow || [] };
    await projects.put(p);
    toast(data.videoName ? `Ajoute maintenant la vidéo « ${data.videoName} »` : 'Analyse importée');
    location.hash = 'p=' + encodeURIComponent(p.id);
  } catch {
    toast('Fichier non reconnu');
  }
};

// Installation de la PWA
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#installBtn').hidden = false; });
$('#installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#installBtn').hidden = true; };

// ---------------------------------------------------------------- projet
const videoA = $('#videoA'), videoB = $('#videoB'), stage = $('#stage');

async function openProject(p) {
  if (P && P.id === p.id) return;
  closeProject();
  P = p;
  $('#home').hidden = true; $('#project').hidden = false;
  $('#projectTitle').value = P.title;
  undoStack.length = 0; loopA = loopB = null; $('#loopChk').checked = false; resetSlowBtn();
  await loadVideoA();
  await loadVideoB();
  renderAnnotations();
  renderSlow();
}

function closeProject() {
  if (!P) return;
  clearTimeout(saveTimer); projects.put(P);
  videoA.pause(); videoB.pause();
  videoA.removeAttribute('src'); videoB.removeAttribute('src'); videoA.load(); videoB.load();
  if (urlA) URL.revokeObjectURL(urlA);
  if (urlB) URL.revokeObjectURL(urlB);
  urlA = urlB = null; P = null;
}

$('#backBtn').onclick = () => (location.hash = '');
$('#projectTitle').oninput = (e) => { P.title = e.target.value; save(); };


// ---------------------------------------------------------------- vidéo A
async function loadVideoA() {
  urlA = await videoStorage.getUrl(P.videoRef);
  $('#noVideo').hidden = !!urlA;
  stage.hidden = !urlA;
  if (urlA) videoA.src = urlA;
  setRate(1);
}

$('#addVideoInput').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !P) return;
  P.videoRef = await videoStorage.upload(f);
  save();
  await loadVideoA();
};

videoA.addEventListener('loadedmetadata', () => {
  stage.style.setProperty('--ar', videoA.videoWidth / videoA.videoHeight || 16 / 9);
  $('#durLabel').textContent = fmt(videoA.duration, false);
  renderMarkers();
  tick(true);
});
videoA.addEventListener('play', () => { $('#playBtn').textContent = '❚❚'; syncB(true); loop(); });
videoA.addEventListener('pause', () => { $('#playBtn').textContent = '▶︎'; syncB(true); tick(true); });
videoA.addEventListener('seeked', () => { lastT = videoA.currentTime; syncB(true); tick(true); });
videoA.addEventListener('ended', () => tick(true));

function togglePlay() {
  if (!urlA) return;
  if (videoA.paused) {
    if (videoSketch.tool !== 'none') toolbarV.select('none');
    videoA.play();
  } else videoA.pause();
}
$('#playBtn').onclick = togglePlay;
stage.addEventListener('click', (e) => { if (e.target !== $('#drawCanvas')) togglePlay(); });

function step(dt) { videoA.pause(); videoA.currentTime = Math.max(0, Math.min(videoA.duration || 0, videoA.currentTime + dt)); }
$('#stepBack').onclick = () => step(-FRAME);
$('#stepFwd').onclick = () => step(FRAME);

const seek = $('#seek');
seek.oninput = () => { if (videoA.duration) videoA.currentTime = (seek.value / 1000) * videoA.duration; };

let userRate = 1;
function setRate(r) {
  userRate = r;
  applyRate(videoA.currentTime);
  document.querySelectorAll('#speedSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.rate === r));
}
document.querySelectorAll('#speedSeg button').forEach((b) => (b.onclick = () => setRate(+b.dataset.rate)));

$('#setA').onclick = () => { loopA = videoA.currentTime; if (loopB != null && loopB <= loopA) loopB = null; $('#loopChk').checked = loopB != null; renderMarkers(); toast(`Début de boucle : ${fmt(loopA)}`); };
$('#setB').onclick = () => { loopB = videoA.currentTime; if (loopA == null || loopA >= loopB) loopA = 0; $('#loopChk').checked = true; renderMarkers(); toast(`Boucle ${fmt(loopA)} → ${fmt(loopB)}`); };
$('#loopChk').onchange = renderMarkers;

// ---------------------------------------------------------------- passages ralentis
// Un passage ralenti est enregistré avec l'analyse : il est lu au ralenti
// à chaque lecture, pour tout le monde, sans toucher au réglage de vitesse.
let slowStart = null;
const slowAt = (t) => (P?.slow || []).find((s) => t >= s.start && t < s.end);
const rateLabel = (r) => ({ 0.1: '0.1×', 0.25: '¼×', 0.5: '½×', 0.75: '¾×' }[r] || r + '×');

function applyRate(t) {
  const seg = slowAt(t);
  const r = seg ? seg.rate : userRate;
  if (videoA.playbackRate !== r) videoA.playbackRate = r;
  if (videoB.playbackRate !== r) videoB.playbackRate = r;
  const badge = $('#slowBadge');
  badge.hidden = !seg;
  if (seg) badge.textContent = `🐢 Ralenti ${rateLabel(seg.rate)}`;
}

$('#slowBtn').onclick = () => {
  if (!urlA) return;
  const t = videoA.currentTime;
  if (slowStart == null) {
    slowStart = t;
    $('#slowBtn').textContent = '🐢 Fin du ralenti';
    $('#slowBtn').classList.add('primary');
    toast(`Début du ralenti : ${fmt(t)}. Avance jusqu'à la fin du passage.`);
    return;
  }
  const start = Math.min(slowStart, t), end = Math.max(slowStart, t);
  resetSlowBtn();
  if (end - start < 0.1) { toast('Passage trop court'); return; }
  P.slow = (P.slow || []).filter((s) => s.end <= start || s.start >= end); // pas de chevauchement
  P.slow.push({ id: newId(), start, end, rate: +$('#slowRate').value });
  P.slow.sort((a, b) => a.start - b.start);
  save(); renderSlow(); applyRate(videoA.currentTime);
  toast(`Ralenti enregistré : ${fmt(start)} → ${fmt(end)}`);
};
function resetSlowBtn() {
  slowStart = null;
  $('#slowBtn').textContent = '🐢 Début du ralenti';
  $('#slowBtn').classList.remove('primary');
}

function renderSlow() {
  const box = $('#slowList');
  box.innerHTML = '';
  for (const s of P.slow || []) {
    const chip = document.createElement('span');
    chip.className = 'slow-chip';
    chip.innerHTML = `<button class="go mono" type="button">${fmt(s.start)} → ${fmt(s.end)}</button>
      <select>${[0.1, 0.25, 0.5, 0.75].map((r) => `<option value="${r}" ${r === s.rate ? 'selected' : ''}>${rateLabel(r)}</option>`).join('')}</select>
      <button class="del" type="button" title="Supprimer ce ralenti">✕</button>`;
    chip.querySelector('.go').onclick = () => { videoA.pause(); videoA.currentTime = s.start; };
    chip.querySelector('select').onchange = (e) => { s.rate = +e.target.value; save(); applyRate(videoA.currentTime); };
    chip.querySelector('.del').onclick = () => { P.slow = P.slow.filter((x) => x !== s); save(); renderSlow(); applyRate(videoA.currentTime); };
    box.append(chip);
  }
  renderMarkers();
}

// Boucle d'affichage pendant la lecture
function loop() {
  if (videoA.paused || !P) return;
  tick(false);
  requestAnimationFrame(loop);
}

function tick(force) {
  const t = videoA.currentTime;
  // Pause automatique sur les commentaires / dessins
  if (!videoA.paused && $('#autoPauseChk').checked) {
    const hit = P.annotations.find((a) => a.t > lastT + 0.001 && a.t <= t && (a.text || a.shapes.length || a.board));
    if (hit) { videoA.pause(); videoA.currentTime = hit.t; lastT = hit.t; if (hit.board) openSchema(hit, true); return; }
  }
  // Boucle A-B
  if (!videoA.paused && $('#loopChk').checked && loopB != null && t >= loopB) {
    videoA.currentTime = loopA || 0; lastT = loopA || 0; return;
  }
  lastT = t;
  applyRate(t);
  if (videoA.duration) seek.value = Math.round((t / videoA.duration) * 1000);
  $('#timeLabel').textContent = fmt(t);
  $('#commentAt').textContent = fmt(t);
  if (urlB && !videoA.paused) syncB(false);

  const vis = visibleAnns(t);
  const key = vis.map((a) => a.id + ':' + a.shapes.length + ':' + a.text.length).join('|');
  if (force || key !== lastKey) {
    lastKey = key;
    videoSketch.setShapes(vis.flatMap((a) => a.shapes));
    const texts = vis.filter((a) => a.text);
    const bubble = $('#noteBubble');
    bubble.hidden = !texts.length;
    bubble.innerHTML = texts.map((a) => `<p>${esc(a.text)}</p>`).join('');
    const withBoard = vis.find((a) => a.board);
    $('#schemaBadge').hidden = !withBoard;
    $('#schemaBadge').onclick = (e) => { e.stopPropagation(); if (withBoard) openSchema(withBoard); };
    document.querySelectorAll('#annList li').forEach((li) => li.classList.toggle('current', vis.some((a) => a.id === li.dataset.id)));
  }
}

function visibleAnns(t) {
  return P.annotations.filter((a) => t >= a.t - 0.02 && t < a.t + (a.dur || DEFAULT_DUR));
}

// ---------------------------------------------------------------- dessin sur la vidéo
const videoSketch = new Sketch($('#drawCanvas'), {
  onAdd(shape) {
    videoA.pause();
    const a = annAt(videoA.currentTime, true);
    a.shapes.push(shape);
    undoStack.push({ annId: a.id, shapeId: shape.id });
    afterAnnChange();
  },
  onErase(shape) {
    for (const a of P.annotations) {
      const i = a.shapes.findIndex((s) => s.id === shape.id);
      if (i >= 0) { a.shapes.splice(i, 1); pruneAnn(a); break; }
    }
    afterAnnChange();
  },
});

const toolbarV = buildToolbar($('#videoTools'), videoSketch, {
  onUndo: undoVideo,
  onClear() {
    const vis = visibleAnns(videoA.currentTime).filter((a) => a.shapes.length);
    if (!vis.length || !confirm('Effacer les dessins affichés à ce moment ?')) return;
    vis.forEach((a) => { a.shapes = []; pruneAnn(a); });
    afterAnnChange();
  },
});
$('#videoTools').addEventListener('toolchange', (e) => { if (e.detail !== 'none') videoA.pause(); });

function undoVideo() {
  while (undoStack.length) {
    const { annId, shapeId } = undoStack.pop();
    const a = P.annotations.find((x) => x.id === annId);
    const i = a ? a.shapes.findIndex((s) => s.id === shapeId) : -1;
    if (i >= 0) {
      a.shapes.splice(i, 1); pruneAnn(a);
      if (Math.abs(videoA.currentTime - a.t) > 0.05 && P.annotations.includes(a)) videoA.currentTime = a.t;
      afterAnnChange(); return;
    }
  }
  toast('Rien à annuler');
}

// Renvoie l'annotation placée à l'instant t (à une image près), ou en crée une.
function annAt(t, create) {
  let a = P.annotations.find((x) => Math.abs(x.t - t) < FRAME / 2);
  if (!a && create) {
    a = { id: newId(), t, dur: DEFAULT_DUR, text: '', shapes: [] };
    P.annotations.push(a);
    P.annotations.sort((x, y) => x.t - y.t);
  }
  return a;
}
function pruneAnn(a) {
  if (!a.text && !a.shapes.length && !a.board) P.annotations = P.annotations.filter((x) => x !== a);
}
function afterAnnChange() { save(); renderAnnotations(); tick(true); }

// ---------------------------------------------------------------- commentaires
$('#commentForm').onsubmit = (e) => {
  e.preventDefault();
  const text = $('#commentText').value.trim();
  if (!text || !urlA) return;
  videoA.pause();
  const a = annAt(videoA.currentTime, true);
  a.text = a.text ? a.text + '\n' + text : text;
  $('#commentText').value = '';
  afterAnnChange();
};
$('#commentText').addEventListener('focus', () => videoA.pause());
$('#commentText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#commentForm').requestSubmit(); } });

function renderAnnotations() {
  const ul = $('#annList');
  ul.innerHTML = '';
  if (!P.annotations.length) ul.innerHTML = '<li class="hint">Mets la vidéo en pause, dessine ou écris un commentaire : il apparaîtra ici.</li>';
  for (const a of P.annotations) {
    const li = document.createElement('li');
    li.dataset.id = a.id;
    li.innerHTML = `
      <button class="time mono">${fmt(a.t)}</button>
      <div class="body">
        <div class="txt">${a.text ? esc(a.text).replace(/\n/g, '<br>') : `<i class="hint">(${a.board ? 'schéma' : 'dessin seul'})</i>`}</div>
        <div class="meta">
          ${a.shapes.length ? `✏️ ${a.shapes.length}` : ''}
          ${a.board ? '<button class="schema" type="button">🧩 schéma</button>' : ''}
          <label>affiché <select class="dur">${[1, 2, 3, 5, 8, 15].map((d) => `<option value="${d}" ${d === (a.dur || DEFAULT_DUR) ? 'selected' : ''}>${d} s</option>`).join('')}</select></label>
        </div>
      </div>
      <div class="acts">
        <button class="edit" title="Modifier le texte">✎</button>
        <button class="del" title="Supprimer">🗑</button>
      </div>`;
    li.querySelector('.time').onclick = () => { videoA.pause(); videoA.currentTime = a.t; };
    li.querySelector('.schema')?.addEventListener('click', () => { videoA.currentTime = a.t; openSchema(a); });
    li.querySelector('.dur').onchange = (e) => { a.dur = +e.target.value; afterAnnChange(); };
    li.querySelector('.edit').onclick = () => {
      const t = prompt('Commentaire :', a.text);
      if (t === null) return;
      a.text = t.trim(); pruneAnn(a); afterAnnChange();
    };
    li.querySelector('.del').onclick = () => {
      if (!confirm('Supprimer ce commentaire et ses dessins ?')) return;
      P.annotations = P.annotations.filter((x) => x !== a); afterAnnChange();
    };
    ul.append(li);
  }
  renderMarkers();
}

function renderMarkers() {
  const box = $('#markers');
  box.innerHTML = '';
  const d = videoA.duration;
  if (!d || !P) return;
  for (const a of P.annotations) {
    const m = document.createElement('span');
    m.className = 'marker' + (a.text ? ' txt' : '');
    m.style.left = `${(a.t / d) * 100}%`;
    m.title = `${fmt(a.t)} ${a.text || '(dessin)'}`;
    box.append(m);
  }
  for (const s of P.slow || []) {
    const r = document.createElement('span');
    r.className = 'slow-range';
    r.style.left = `${(s.start / d) * 100}%`;
    r.style.width = `${((s.end - s.start) / d) * 100}%`;
    r.title = `Ralenti ${rateLabel(s.rate)}`;
    box.append(r);
  }
  if ($('#loopChk').checked && loopB != null) {
    const r = document.createElement('span');
    r.className = 'loop-range';
    r.style.left = `${((loopA || 0) / d) * 100}%`;
    r.style.width = `${((loopB - (loopA || 0)) / d) * 100}%`;
    box.append(r);
  }
}

// ---------------------------------------------------------------- vidéo B (comparaison)
async function loadVideoB() {
  urlB = P.compareRef ? await videoStorage.getUrl(P.compareRef) : null;
  videoB.hidden = !urlB; $('#bControls').hidden = !urlB; $('#removeB').hidden = !urlB;
  if (urlB) {
    videoB.src = urlB;
    $('#comparePanel').open = true;
    const c = P.compare || (P.compare = { opacity: 0.5, blend: 'normal', offset: 0, shiftX: 0, scale: 1 });
    $('#bOpacity').value = c.opacity; $('#bBlend').value = c.blend; $('#bShiftX').value = c.shiftX; $('#bScale').value = c.scale;
    applyB();
  } else {
    videoB.removeAttribute('src');
  }
}
function applyB() {
  const c = P.compare;
  videoB.style.opacity = c.opacity;
  videoB.style.mixBlendMode = c.blend;
  videoB.style.transform = `translateX(${c.shiftX * 100}%) scale(${c.scale})`;
  $('#bOffsetLabel').textContent = `${c.offset >= 0 ? '+' : ''}${c.offset.toFixed(2)} s`;
}
function syncB(hard) {
  if (!urlB || !P) return;
  const target = videoA.currentTime + (P.compare.offset || 0);
  if (videoA.paused) {
    if (!videoB.paused) videoB.pause();
    if (Math.abs(videoB.currentTime - target) > 0.01) videoB.currentTime = Math.max(0, target);
  } else {
    if (hard || Math.abs(videoB.currentTime - target) > 0.2) videoB.currentTime = Math.max(0, target);
    videoB.playbackRate = videoA.playbackRate;
    if (videoB.paused && target >= 0 && target < (videoB.duration || Infinity)) videoB.play().catch(() => {});
  }
}
$('#videoBInput').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !P) return;
  if (P.compareRef) await videoStorage.remove(P.compareRef);
  P.compareRef = await videoStorage.upload(f);
  P.compare = { opacity: 0.5, blend: 'normal', offset: 0, shiftX: 0, scale: 1 };
  save();
  if (urlB) URL.revokeObjectURL(urlB);
  await loadVideoB();
  syncB(true);
};
$('#removeB').onclick = async () => {
  await videoStorage.remove(P.compareRef);
  P.compareRef = null; save();
  if (urlB) URL.revokeObjectURL(urlB);
  await loadVideoB();
};
$('#bOpacity').oninput = (e) => { P.compare.opacity = +e.target.value; applyB(); save(); };
$('#bBlend').onchange = (e) => { P.compare.blend = e.target.value; applyB(); save(); };
$('#bShiftX').oninput = (e) => { P.compare.shiftX = +e.target.value; applyB(); save(); };
$('#bScale').oninput = (e) => { P.compare.scale = +e.target.value; applyB(); save(); };
document.querySelectorAll('[data-boff]').forEach((b) => (b.onclick = () => {
  P.compare.offset = Math.round((P.compare.offset + +b.dataset.boff) * 1000) / 1000;
  applyB(); save(); syncB(true);
}));

// ---------------------------------------------------------------- tableau blanc (schéma sur la vidéo)
// Un schéma est accroché à une annotation : quand la vidéo arrive à ce moment,
// elle se met en pause et le tableau blanc s'ouvre par-dessus.
let schemaAnn = null, schemaResume = false;
const schemaShapes = () => schemaAnn.board.shapes;
const boardSketch = new Sketch($('#boardCanvas'), {
  onAdd(s) { schemaShapes().push(s); save(); boardSketch.setShapes(schemaShapes()); },
  onErase(s) { schemaAnn.board.shapes = schemaShapes().filter((x) => x.id !== s.id); save(); boardSketch.setShapes(schemaShapes()); },
  background: (ctx, W, H) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); },
});
buildToolbar($('#boardTools'), boardSketch, {
  defaultTool: 'pen', withNone: false,
  onUndo: undoSchema,
  onClear() { if (schemaShapes().length && confirm('Effacer tout le schéma ?')) { schemaAnn.board.shapes = []; save(); boardSketch.setShapes([]); } },
});
function undoSchema() { schemaShapes().pop(); save(); boardSketch.setShapes(schemaShapes()); }

function openSchema(a, resume = false) {
  videoA.pause();
  schemaAnn = a; schemaResume = resume;
  $('#schemaAt').textContent = fmt(a.t);
  $('#schemaClose').textContent = resume ? 'Continuer la vidéo ▶︎' : 'Terminé';
  $('#schemaModal').hidden = false;
  boardSketch.resize();
  boardSketch.setShapes(a.board.shapes);
}
function closeSchema() {
  const a = schemaAnn;
  $('#schemaModal').hidden = true;
  schemaAnn = null;
  if (a && !a.board.shapes.length) { delete a.board; pruneAnn(a); }
  afterAnnChange();
  if (schemaResume) videoA.play();
}
$('#schemaClose').onclick = closeSchema;
$('#schemaDelete').onclick = () => {
  if (!confirm('Supprimer ce schéma ?')) return;
  schemaAnn.board.shapes = []; schemaResume = false; closeSchema();
};
$('#addSchemaBtn').onclick = () => {
  if (!urlA) return;
  videoA.pause();
  const a = annAt(videoA.currentTime, true);
  a.board ||= { shapes: [] };
  openSchema(a);
};

// ---------------------------------------------------------------- export
$('#exportBtn').onclick = () => {
  const data = {
    format: 'analyse-video', version: 1, title: P.title, exportedAt: new Date().toISOString(),
    videoName: P.videoRef?.name || null, annotations: P.annotations, slow: P.slow || [],
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  download(`${safeName(P.title)}.analyse.json`, url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Annotations exportées');
};

$('#snapshotBtn').onclick = () => {
  if (schemaAnn) {
    download(`${safeName(P.title)}_schema_${fmt(schemaAnn.t).replace(/[:.]/g, '-')}.png`, boardSketch.toDataURL());
    return;
  }
  if (!urlA || !videoA.videoWidth) return;
  const W = videoA.videoWidth, H = videoA.videoHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(videoA, 0, 0, W, H);
  if (urlB && videoB.videoWidth) {
    const k = P.compare;
    ctx.save();
    ctx.globalAlpha = k.opacity;
    ctx.globalCompositeOperation = k.blend === 'normal' ? 'source-over' : k.blend;
    ctx.translate(W / 2 + k.shiftX * W, H / 2); ctx.scale(k.scale, k.scale);
    // même cadrage que "object-fit: contain"
    const s = Math.min(W / videoB.videoWidth, H / videoB.videoHeight);
    const bw = videoB.videoWidth * s, bh = videoB.videoHeight * s;
    ctx.drawImage(videoB, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  }
  const vis = visibleAnns(videoA.currentTime);
  drawShapes(ctx, vis.flatMap((a) => a.shapes), W, H);
  const texts = vis.filter((a) => a.text).map((a) => a.text);
  if (texts.length) {
    const fs = Math.round(W * 0.025), pad = fs * 0.6;
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    const lines = texts.join('\n').split('\n');
    const bh = lines.length * fs * 1.3 + pad * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, H - bh, W, bh);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, pad, H - bh + pad + i * fs * 1.3));
  }
  try {
    download(`${safeName(P.title)}_${fmt(videoA.currentTime).replace(/[:.]/g, '-')}.png`, c.toDataURL('image/png'));
  } catch {
    toast("Impossible d'exporter l'image de cette vidéo");
  }
};

// ---------------------------------------------------------------- clavier
document.addEventListener('keydown', (e) => {
  if (!P || $('#project').hidden) return;
  if (e.target.closest('input, textarea, select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    if (schemaAnn) undoSchema(); else undoVideo();
    return;
  }
  if (schemaAnn) { if (e.key === 'Escape') closeSchema(); return; }
  {
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowLeft' || e.key === ',') { e.preventDefault(); step(e.shiftKey ? -1 : -FRAME); }
    else if (e.key === 'ArrowRight' || e.key === '.') { e.preventDefault(); step(e.shiftKey ? 1 : FRAME); }
  }
});

// ---------------------------------------------------------------- démarrage
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
route();
