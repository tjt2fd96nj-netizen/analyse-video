// Fonds du tableau blanc : terrains de sport dessinés à l'échelle.

const GREEN = '#2f8a3b', GREEN2 = '#2a7d35', LINE = 'rgba(255,255,255,0.9)';

export function drawBackground(kind, ctx, W, H) {
  ctx.save();
  switch (kind) {
    case 'grid': grid(ctx, W, H); break;
    case 'football': pitch(ctx, W, H, 105, 68, football); break;
    case 'futsal': pitch(ctx, W, H, 40, 20, futsal, '#3b6fb6'); break;
    case 'basket': pitch(ctx, W, H, 28, 15, basket, '#c98a4b'); break;
    case 'rugby': pitch(ctx, W, H, 120, 70, rugby); break;
    case 'tennis': pitch(ctx, W, H, 23.77, 10.97, tennis, '#3d7bbf', 1.5); break;
    case 'volley': pitch(ctx, W, H, 18, 9, volley, '#d07a3a', 1.5); break;
    default: ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function grid(ctx, W, H) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#e3e8ef'; ctx.lineWidth = 1;
  const step = W / 32;
  for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

// Dessine un terrain de L x l mètres centré, avec une fonction de tracé en mètres.
function pitch(ctx, W, H, L, l, fn, bg = GREEN, marginM = 4) {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const s = Math.min(W / (L + marginM * 2), H / (l + marginM * 2));
  const ox = (W - L * s) / 2, oy = (H - l * s) / 2;
  if (bg === GREEN) {
    // bandes de tonte
    const n = 12;
    for (let i = 0; i < n; i++) if (i % 2) { ctx.fillStyle = GREEN2; ctx.fillRect(ox + (i * L * s) / n, oy, (L * s) / n, l * s); }
  }
  ctx.translate(ox, oy); ctx.scale(s, s);
  ctx.strokeStyle = LINE; ctx.fillStyle = LINE; ctx.lineWidth = Math.max(0.12, 2 / s);
  fn(ctx, L, l);
}

const rect = (c, x, y, w, h) => c.strokeRect(x, y, w, h);
const line = (c, x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
const circ = (c, x, y, r, a0 = 0, a1 = Math.PI * 2) => { c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke(); };
const dot = (c, x, y, r = 0.25) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };

function football(c, L, l) {
  rect(c, 0, 0, L, l); line(c, L / 2, 0, L / 2, l); circ(c, L / 2, l / 2, 9.15); dot(c, L / 2, l / 2);
  for (const side of [0, 1]) {
    const x = side ? L : 0, d = side ? -1 : 1;
    rect(c, side ? L - 16.5 : 0, l / 2 - 20.16, 16.5, 40.32);
    rect(c, side ? L - 5.5 : 0, l / 2 - 9.16, 5.5, 18.32);
    dot(c, x + d * 11, l / 2);
    const a = Math.acos(5.5 / 9.15);
    circ(c, x + d * 11, l / 2, 9.15, side ? Math.PI - a : -a, side ? Math.PI + a : a);
    rect(c, side ? L : -2, l / 2 - 3.66, 2, 7.32);
  }
}

function futsal(c, L, l) {
  rect(c, 0, 0, L, l); line(c, L / 2, 0, L / 2, l); circ(c, L / 2, l / 2, 3); dot(c, L / 2, l / 2, 0.15);
  for (const side of [0, 1]) {
    const x = side ? L : 0, d = side ? -1 : 1;
    // zone de 6 m (forme handball/futsal simplifiée)
    c.beginPath();
    c.arc(x, l / 2 - 1.5, 6, side ? Math.PI : -Math.PI / 2, side ? Math.PI * 1.5 : 0);
    c.lineTo(x + d * 6, l / 2 + 1.5);
    c.arc(x, l / 2 + 1.5, 6, side ? Math.PI / 2 : 0, side ? Math.PI : Math.PI / 2);
    c.stroke();
    dot(c, x + d * 6, l / 2, 0.15); dot(c, x + d * 10, l / 2, 0.15);
    rect(c, side ? L : -1, l / 2 - 1.5, 1, 3);
  }
}

function basket(c, L, l) {
  rect(c, 0, 0, L, l); line(c, L / 2, 0, L / 2, l); circ(c, L / 2, l / 2, 1.8);
  for (const side of [0, 1]) {
    const x = side ? L : 0, d = side ? -1 : 1, hoop = x + d * 1.575;
    rect(c, side ? L - 5.8 : 0, l / 2 - 2.45, 5.8, 4.9);
    circ(c, x + d * 5.8, l / 2, 1.8);
    const a = Math.asin(6.6 / 6.75);
    const xe = hoop + d * Math.cos(a) * 6.75;
    line(c, x, l / 2 - 6.6, xe, l / 2 - 6.6);
    line(c, x, l / 2 + 6.6, xe, l / 2 + 6.6);
    circ(c, hoop, l / 2, 6.75, side ? Math.PI - a : -a, side ? Math.PI + a : a);
    circ(c, hoop, l / 2, 0.23);
    line(c, x + d * 1.2, l / 2 - 0.9, x + d * 1.2, l / 2 + 0.9);
  }
}

function rugby(c, L, l) {
  const g = 10; // en-but
  rect(c, 0, 0, L, l); line(c, g, 0, g, l); line(c, L - g, 0, L - g, l); line(c, L / 2, 0, L / 2, l);
  c.setLineDash([1, 1]);
  for (const x of [g + 22, L - g - 22]) line(c, x, 0, x, l);
  for (const x of [L / 2 - 10, L / 2 + 10, g + 5, L - g - 5]) line(c, x, 0, x, l);
  c.setLineDash([]);
  for (const x of [g, L - g]) { line(c, x, l / 2 - 2.8, x, l / 2 + 2.8); dot(c, x, l / 2 - 2.8, 0.4); dot(c, x, l / 2 + 2.8, 0.4); }
}

function tennis(c, L, l) {
  rect(c, 0, 0, L, l);
  const s = (l - 8.23) / 2;
  line(c, 0, s, L, s); line(c, 0, l - s, L, l - s);
  line(c, L / 2, -0.5, L / 2, l + 0.5);
  line(c, L / 2 - 6.4, s, L / 2 - 6.4, l - s); line(c, L / 2 + 6.4, s, L / 2 + 6.4, l - s);
  line(c, L / 2 - 6.4, l / 2, L / 2 + 6.4, l / 2);
  line(c, 0, l / 2, 0.3, l / 2); line(c, L, l / 2, L - 0.3, l / 2);
}

function volley(c, L, l) {
  rect(c, 0, 0, L, l); line(c, L / 2, -0.6, L / 2, l + 0.6);
  line(c, L / 2 - 3, 0, L / 2 - 3, l); line(c, L / 2 + 3, 0, L / 2 + 3, l);
}
