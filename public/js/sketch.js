// Moteur de dessin partagé par la vidéo et le tableau blanc.
// Toutes les coordonnées sont normalisées (0..1) pour que les dessins
// restent à la bonne place quelle que soit la taille de l'écran.

export const TOOLS = [
  { id: 'none', label: '✋', title: 'Aucun outil (toucher = lecture/pause)' },
  { id: 'pen', label: '✏️', title: 'Crayon libre' },
  { id: 'line', label: '╱', title: 'Ligne' },
  { id: 'arrow', label: '➚', title: 'Flèche' },
  { id: 'dashed', label: '⇢', title: 'Flèche pointillée (course / passe)' },
  { id: 'rect', label: '▭', title: 'Rectangle' },
  { id: 'ellipse', label: '◯', title: 'Cercle / zone' },
  { id: 'spot', label: '◎', title: 'Projecteur (met un joueur en évidence)' },
  { id: 'token', label: '①', title: 'Pion numéroté (joueur)' },
  { id: 'text', label: 'T', title: 'Texte' },
  { id: 'eraser', label: '⌫', title: 'Gomme (toucher un dessin pour l\'effacer)' },
];

export const COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff', '#111111', '#ff2dd4'];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export class Sketch {
  constructor(canvas, { onAdd, onErase, background } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.shapes = [];
    this.tool = 'none';
    this.color = COLORS[0];
    this.width = 4;
    this.onAdd = onAdd || (() => {});
    this.onErase = onErase || (() => {});
    this.background = background || null;
    this.draft = null;
    this.W = 1; this.H = 1;

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', () => { this.draft = null; this.render(); });
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.setTool(this.tool);
  }

  setTool(tool) {
    this.tool = tool;
    this.canvas.style.pointerEvents = tool === 'none' ? 'none' : 'auto';
    this.canvas.style.cursor = tool === 'eraser' ? 'not-allowed' : tool === 'text' ? 'text' : 'crosshair';
  }

  setShapes(shapes) { this.shapes = shapes; this.render(); }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.W = w; this.H = h;
    this.render();
  }

  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  _down(e) {
    if (this.tool === 'none') return;
    e.preventDefault();
    const p = this._pt(e);
    if (this.tool === 'eraser') {
      const hit = this.hitTest(p);
      if (hit) this.onErase(hit);
      return;
    }
    const base = { id: uid(), color: this.color, w: this.width };
    if (this.tool === 'text') {
      const text = prompt('Texte :');
      if (text && text.trim()) this.onAdd({ ...base, type: 'text', p, text: text.trim() });
      return;
    }
    if (this.tool === 'token') {
      const n = this.shapes.filter((s) => s.type === 'token' && s.color === this.color).length + 1;
      const label = prompt('Numéro ou nom du joueur :', String(n));
      if (label !== null) this.onAdd({ ...base, type: 'token', p, label: label.trim() });
      return;
    }
    this.canvas.setPointerCapture(e.pointerId);
    this.draft = this.tool === 'pen'
      ? { ...base, type: 'pen', pts: [p] }
      : { ...base, type: this.tool, a: p, b: p };
  }

  _move(e) {
    if (!this.draft) return;
    const p = this._pt(e);
    if (this.draft.type === 'pen') this.draft.pts.push(p);
    else this.draft.b = p;
    this.render();
  }

  _up() {
    const d = this.draft;
    this.draft = null;
    if (!d) return;
    const ok = d.type === 'pen'
      ? d.pts.length > 1
      : Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) > 0.005;
    if (ok) {
      if (d.type === 'pen') d.pts = simplify(d.pts, 0.0015);
      this.onAdd(d);
    } else this.render();
  }

  hitTest([x, y]) {
    const tol = 0.02;
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      const [x0, y0, x1, y1] = bbox(s, this.W, this.H);
      if (x >= x0 - tol && x <= x1 + tol && y >= y0 - tol && y <= y1 + tol) return s;
    }
    return null;
  }

  render() {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    if (this.background) this.background(ctx, W, H);
    const all = this.draft ? [...this.shapes, this.draft] : this.shapes;
    // Les projecteurs assombrissent l'image : on les dessine d'abord.
    const spots = all.filter((s) => s.type === 'spot');
    if (spots.length) drawSpots(ctx, spots, W, H);
    for (const s of all) if (s.type !== 'spot') drawShape(ctx, s, W, H);
  }

  // Image PNG du canvas, éventuellement par-dessus une image de fond (frame vidéo).
  toDataURL() { return this.canvas.toDataURL('image/png'); }
}

export function drawShapes(ctx, shapes, W, H) {
  const spots = shapes.filter((s) => s.type === 'spot');
  if (spots.length) drawSpots(ctx, spots, W, H);
  for (const s of shapes) if (s.type !== 'spot') drawShape(ctx, s, W, H);
}

function lw(s, W) { return Math.max(1.5, (s.w * W) / 800); }

function drawShape(ctx, s, W, H) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = lw(s, W);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3;
  const X = (p) => p[0] * W, Y = (p) => p[1] * H;
  switch (s.type) {
    case 'pen': {
      ctx.beginPath();
      s.pts.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))));
      ctx.stroke();
      break;
    }
    case 'line':
      ctx.beginPath(); ctx.moveTo(X(s.a), Y(s.a)); ctx.lineTo(X(s.b), Y(s.b)); ctx.stroke();
      break;
    case 'arrow':
    case 'dashed': {
      const ax = X(s.a), ay = Y(s.a), bx = X(s.b), by = Y(s.b);
      const ang = Math.atan2(by - ay, bx - ax);
      const head = Math.max(10, ctx.lineWidth * 3.5);
      if (s.type === 'dashed') ctx.setLineDash([ctx.lineWidth * 2.5, ctx.lineWidth * 2]);
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.lineTo(bx - Math.cos(ang) * head * 0.8, by - Math.sin(ang) * head * 0.8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - head * Math.cos(ang - 0.45), by - head * Math.sin(ang - 0.45));
      ctx.lineTo(bx - head * Math.cos(ang + 0.45), by - head * Math.sin(ang + 0.45));
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'rect': {
      const x = Math.min(X(s.a), X(s.b)), y = Math.min(Y(s.a), Y(s.b));
      ctx.strokeRect(x, y, Math.abs(X(s.b) - X(s.a)), Math.abs(Y(s.b) - Y(s.a)));
      break;
    }
    case 'ellipse': {
      const cx = (X(s.a) + X(s.b)) / 2, cy = (Y(s.a) + Y(s.b)) / 2;
      const rx = Math.abs(X(s.b) - X(s.a)) / 2, ry = Math.abs(Y(s.b) - Y(s.a)) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      break;
    }
    case 'text': {
      const size = textSize(s, W);
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(2, size / 6);
      ctx.strokeStyle = isLight(s.color) ? '#000' : '#fff';
      ctx.strokeText(s.text, X(s.p), Y(s.p));
      ctx.fillText(s.text, X(s.p), Y(s.p));
      break;
    }
    case 'token': {
      const r = tokenR(W);
      ctx.beginPath(); ctx.arc(X(s.p), Y(s.p), r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1.5, r / 7); ctx.strokeStyle = isLight(s.color) ? '#000' : '#fff'; ctx.stroke();
      if (s.label) {
        ctx.fillStyle = isLight(s.color) ? '#000' : '#fff';
        ctx.font = `700 ${r * (s.label.length > 2 ? 0.7 : 1.05)}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.label, X(s.p), Y(s.p) + 1);
      }
      break;
    }
  }
  ctx.restore();
}

function drawSpots(ctx, spots, W, H) {
  // Assombrit tout sauf les ellipses "projecteur", puis trace leur contour.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  for (const s of spots) {
    const cx = ((s.a[0] + s.b[0]) / 2) * W, cy = ((s.a[1] + s.b[1]) / 2) * H;
    const rx = Math.max(2, (Math.abs(s.b[0] - s.a[0]) * W) / 2), ry = Math.max(2, (Math.abs(s.b[1] - s.a[1]) * H) / 2);
    ctx.moveTo(cx + rx, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2, true);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill('evenodd');
  for (const s of spots) {
    const cx = ((s.a[0] + s.b[0]) / 2) * W, cy = ((s.a[1] + s.b[1]) / 2) * H;
    const rx = Math.max(2, (Math.abs(s.b[0] - s.a[0]) * W) / 2), ry = Math.max(2, (Math.abs(s.b[1] - s.a[1]) * H) / 2);
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = s.color; ctx.lineWidth = lw(s, W); ctx.stroke();
  }
  ctx.restore();
}

const tokenR = (W) => Math.max(10, W * 0.018);
const textSize = (s, W) => Math.max(14, W * 0.03) * (0.6 + s.w / 10);

function bbox(s, W, H) {
  switch (s.type) {
    case 'pen': {
      const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    case 'text': {
      const w = (s.text.length * 0.6 * textSize(s, W)) / W;
      const h = (textSize(s, W) * 1.2) / H;
      return [s.p[0], s.p[1], s.p[0] + w, s.p[1] + h];
    }
    case 'token': {
      const rx = tokenR(W) / W, ry = tokenR(W) / H;
      return [s.p[0] - rx, s.p[1] - ry, s.p[0] + rx, s.p[1] + ry];
    }
    default:
      return [Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1])];
  }
}

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

// Réduit le nombre de points d'un tracé libre (algorithme de Ramer-Douglas-Peucker).
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const d = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1e-9;
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
  };
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const v = d(pts[i], pts[0], pts[pts.length - 1]);
    if (v > max) { max = v; idx = i; }
  }
  if (max > eps) {
    const l = simplify(pts.slice(0, idx + 1), eps);
    const r = simplify(pts.slice(idx), eps);
    return [...l.slice(0, -1), ...r];
  }
  return [pts[0], pts[pts.length - 1]];
}

// Construit une barre d'outils (outils, couleurs, épaisseur, annuler, effacer).
export function buildToolbar(el, sketch, { onUndo, onClear, defaultTool = 'none', withNone = true } = {}) {
  el.innerHTML = '';
  const tools = document.createElement('div');
  tools.className = 'seg tools';
  for (const t of TOOLS) {
    if (t.id === 'none' && !withNone) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = t.label; b.title = t.title; b.dataset.tool = t.id;
    b.onclick = () => select(t.id);
    tools.append(b);
  }
  const colors = document.createElement('div');
  colors.className = 'colors';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.style.background = c; b.title = c; b.dataset.color = c;
    b.onclick = () => { sketch.color = c; refresh(); };
    colors.append(b);
  }
  const width = document.createElement('label');
  width.className = 'width';
  width.innerHTML = 'Épaisseur <input type="range" min="1" max="12" step="1">';
  const wIn = width.querySelector('input');
  wIn.value = sketch.width;
  wIn.oninput = () => { sketch.width = +wIn.value; };
  const undo = document.createElement('button');
  undo.type = 'button'; undo.className = 'btn small'; undo.textContent = '↶ Annuler'; undo.onclick = onUndo;
  const clear = document.createElement('button');
  clear.type = 'button'; clear.className = 'btn small ghost'; clear.textContent = 'Tout effacer'; clear.onclick = onClear;
  el.append(tools, colors, width, undo, clear);

  function select(id) { sketch.setTool(id); refresh(); el.dispatchEvent(new CustomEvent('toolchange', { detail: id })); }
  function refresh() {
    tools.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tool === sketch.tool));
    colors.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.color === sketch.color));
  }
  select(defaultTool);
  return { select };
}
