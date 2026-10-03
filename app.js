import * as Plan from './plan.js';
import * as Store from './store.js';
const { fmtPace, fmtTime, fmtClock, parseTime, KIND_LABEL, RACE_DATE, N_WEEKS } = Plan;

let S, G;
const ui = { tab: 'home', week: null };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const dFmt = (iso, o) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', o);
const dShort = iso => dFmt(iso, { day: 'numeric', month: 'short' });
const dLong = iso => dFmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });
const km = n => `${(Math.round(n * 10) / 10).toString().replace('.', ',')} km`;
const num = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
const uid = () => Math.random().toString(36).slice(2, 9);
const fmtTarget = s => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return `${h}h${String(m).padStart(2, '0')}`; };
const parseDur = v => { v = String(v || '').trim(); if (/^\d+$/.test(v)) return Number(v) * 60; return parseTime(v); };

// ---------- Données dérivées ----------
const activeRef = () => S.refs.find(r => r.id === S.activeRef) || S.refs[S.refs.length - 1];
const regen = () => { G = Plan.generate(S.settings, activeRef(), S.weekScale); };
const flat = () => G.weeks.flatMap(w => w.sessions);
const st = id => S.sess[id] || {};
const effDate = s => st(s.id).doneDate || st(s.id).movedTo || s.date;
const curWeek = () => Math.min(N_WEEKS, Math.max(1, Plan.weekOf(Plan.todayIso())));
const isRun = s => s.kind !== 'strength';
const sessionsOfWeek = n => flat().filter(s => Plan.weekOf(effDate(s)) === n).sort((a, b) => effDate(a).localeCompare(effDate(b)) || a.day - b.day);

function actualByWeek() {
  const a = Array(N_WEEKS + 2).fill(0);
  flat().forEach(s => { const x = st(s.id); if (x.status === 'done' && x.km) { const w = Plan.weekOf(effDate(s)); if (w >= 1 && w <= N_WEEKS) a[w] += x.km; } });
  S.extras.forEach(e => { const w = Plan.weekOf(e.date); if (w >= 1 && w <= N_WEEKS) a[w] += e.km; });
  return a;
}
const plannedByWeek = () => [0, ...G.weeks.map(w => w.km)];
const shoeKm = sh => sh.startKm + flat().filter(s => st(s.id).status === 'done' && st(s.id).shoe === sh.id).reduce((a, s) => a + (st(s.id).km || 0), 0) + S.extras.filter(e => e.shoe === sh.id).reduce((a, e) => a + e.km, 0);

function paceHint(s) {
  const P = G.P;
  return { easy: `${fmtPace(P.easyLo)} à ${fmtPace(P.easyHi)}/km`, fartlek: `${fmtPace(P.seuil)}/km`, vma: `${fmtPace(P.vma)}/km`, seuil: `${fmtPace(P.seuil)}/km`, mp: `${fmtPace(P.mp)}/km`, long: s.steps.some(x => /marathon/i.test(x.d)) ? `${fmtPace(P.easyHi)} puis ${fmtPace(P.mp)}/km` : `${fmtPace(P.easyLo)} à ${fmtPace(P.easyHi)}/km`, test: `${fmtPace(P.predictedHalf / 21.0975)}/km`, race: `${fmtPace(P.mp)}/km`, strength: '' }[s.kind];
}

// ---------- Compte à rebours ----------
function countdown() {
  const t = new Date(`${RACE_DATE}T${S.settings.startTime || '08:30'}:00`);
  const ms = t - new Date();
  if (ms <= 0) return { d: 0, h: 0, m: 0, over: true };
  return { d: Math.floor(ms / 864e5), h: Math.floor(ms % 864e5 / 36e5), m: Math.floor(ms % 36e5 / 6e4), over: false };
}
function tick() { const c = countdown(); [['d', c.d], ['h', c.h], ['m', c.m]].forEach(([k, v]) => { const el = document.querySelector(`[data-cd="${k}"]`); if (el) el.textContent = v; }); }

// ---------- Alertes ----------
function alerts() {
  const out = [], today = Plan.todayIso(), cw = curWeek(), started = today >= Plan.PLAN_START, A = actualByWeek(), Pl = plannedByWeek();
  if (!started || today > RACE_DATE) return out;
  const overdue = flat().filter(s => isRun(s) && !st(s.id).status && effDate(s) < today);
  if (overdue.length) out.push({ text: `${overdue.length} séance${overdue.length > 1 ? 's' : ''} passée${overdue.length > 1 ? 's' : ''} sans statut. Indique si elle est faite ou manquée pour garder un suivi juste.`, btn: 'Voir la semaine', act: 'goweek', val: Plan.weekOf(effDate(overdue[0])) });
  const lost = flat().filter(s => isRun(s) && effDate(s) < today && Plan.diffDays(effDate(s), today) <= 14 && (st(s.id).status === 'missed' || !st(s.id).status)).length;
  if (lost >= 2 && !S.weekScale[cw] && cw < N_WEEKS) out.push({ text: `${lost} séances manquées ou non renseignées ces 14 derniers jours. Allège la semaine en cours de 20 %, puis reprends le plan normalement.`, btn: 'Alléger la semaine', act: 'lighten', val: cw });
  if (cw >= 4 && A[cw - 1] > 30 && A[cw - 1] > 1.1 * Math.max(A[cw - 2], A[cw - 3], A[cw - 4])) out.push({ text: `Ton volume a augmenté de plus de 10 % la semaine dernière (${km(A[cw - 1])}). Garde la semaine en cours au niveau prévu et écoute tes jambes.` });
  if (Pl[cw] > 0 && A[cw] > Pl[cw] * 1.15) out.push({ text: `Tu dépasses de ${km(A[cw] - Pl[cw])} le volume prévu cette semaine. Les kilomètres en plus ne remplacent pas la récupération.` });
  S.shoes.filter(sh => !sh.retired).forEach(sh => { const u = shoeKm(sh) / sh.limitKm; if (u >= 0.85) out.push({ text: `${sh.name} approche de sa limite : ${Math.round(shoeKm(sh))} km sur ${sh.limitKm}.` }); });
  return out;
}

// ---------- Icônes ----------
const IC = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plan: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  more: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
const TABS = [['home', 'Accueil'], ['plan', 'Plan'], ['stats', 'Suivi'], ['race', 'Jour J'], ['more', 'Plus']];

// ---------- Vues ----------
function viewHome() {
  const c = countdown(), today = Plan.todayIso(), cw = curWeek(), started = today >= Plan.PLAN_START;
  const A = actualByWeek(), Pl = plannedByWeek(), w = G.weeks[cw - 1];
  const next = flat().filter(s => isRun(s) && !st(s.id).status && effDate(s) >= today).sort((a, b) => effDate(a).localeCompare(effDate(b)))[0];
  const when = !next ? '' : effDate(next) === today ? "Aujourd'hui" : effDate(next) === Plan.addDays(today, 1) ? 'Demain' : dLong(effDate(next));
  const weekSess = sessionsOfWeek(cw).filter(isRun), doneN = weekSess.filter(s => st(s.id).status === 'done').length;
  const pct = Pl[cw] ? Math.min(100, Math.round(A[cw] / Pl[cw] * 100)) : 0;
  const al = alerts();
  return `
  <section class="hero">
    <p class="kicker">Marathon de Paris, dimanche 4 avril 2027</p>
    ${c.over ? '<h1 class="d" style="font-size:64px">C\'est fait.<br>Bravo.</h1>' : `
    <div class="cd" role="timer" aria-label="Compte à rebours avant le départ">
      <div><b data-cd="d">${c.d}</b><span>jours</span></div><div><b data-cd="h">${c.h}</b><span>heures</span></div><div><b data-cd="m">${c.m}</b><span>minutes</span></div>
    </div>`}
    <div class="pills"><span class="pill solid">Objectif ${fmtTime(S.settings.targetSec)}</span><span class="pill">${fmtPace(G.P.mp)}/km</span><span class="pill">Prédiction ${fmtTime(G.P.predicted)}</span></div>
  </section>
  ${al.map((a, i) => `<div class="alert"><p>${esc(a.text)}</p>${a.btn ? `<button class="btn" data-action="${a.act}" data-val="${a.val}">${esc(a.btn)}</button>` : ''}</div>`).join('')}
  <h2 class="sec-title">${started ? (when === "Aujourd'hui" ? "Aujourd'hui" : 'Prochaine séance') : 'Première séance'}</h2>
  ${next ? sessionPanel(next, when) : `<div class="card"><p>${today > RACE_DATE ? 'La course est derrière toi.' : 'Toutes les séances à venir sont renseignées.'}</p></div>`}
  <h2 class="sec-title">Semaine ${cw}${started ? '' : ', dès lundi'}</h2>
  <div class="card">
    <div class="row"><span class="pill solid" style="background:var(--${w.phase.id === 'base' ? 'blue' : w.phase.id === 'dev' ? 'orange' : w.phase.id === 'spec' ? 'violet' : 'pink'});color:${w.phase.id === 'dev' || w.phase.id === 'taper' ? 'var(--navy)' : '#fff'}">${w.phase.name}${w.rec ? ', récupération' : ''}</span><span class="muted small">${dShort(w.start)} au ${dShort(w.end)}</span></div>
    <div class="row"><div class="num">${num(A[cw])}<small>/ ${num(Pl[cw])} km</small></div><div class="num">${doneN}<small>/ ${weekSess.length} séances</small></div></div>
    <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
    <div class="btns"><button class="btn" data-action="goweek" data-val="${cw}">Voir la semaine</button><button class="btn ghost" data-action="add-run">Ajouter une sortie libre</button></div>
  </div>`;
}

function sessionPanel(s, when) {
  const x = st(s.id);
  return `<button class="panel k-${s.kind}" data-action="open" data-id="${s.id}">
    <span class="chip">${KIND_LABEL[s.kind]}</span>
    ${when ? `<span class="when">${esc(when[0].toUpperCase() + when.slice(1))}</span>` : ''}
    <strong class="big">${esc(s.title)}</strong>
    <span class="meta">${s.km ? `<span>${km(s.km)}</span>` : ''}${paceHint(s) ? `<span>${paceHint(s)}</span>` : ''}<span>Effort ${esc(s.rpe)}</span></span></button>`;
}

function viewPlan() {
  const cw = curWeek(), n = ui.week || cw, w = G.weeks[n - 1], today = Plan.todayIso(), A = actualByWeek(), Pl = plannedByWeek();
  const sess = sessionsOfWeek(n);
  const phaseCol = { base: 'var(--blue)', dev: 'var(--orange)', spec: 'var(--violet)', taper: 'var(--pink)' };
  const days = Array.from({ length: 7 }, (_, d) => {
    const date = Plan.addDays(w.start, d), list = sess.filter(s => effDate(s) === date);
    const lab = `<div class="dlabel"><b>${WD[d]}</b><span>${new Date(date + 'T12:00:00').getDate()}</span></div>`;
    const body = list.length ? list.map(s => {
      const x = st(s.id), cls = x.status || '';
      return `<button class="sess k-${s.kind} ${cls}" data-action="open" data-id="${s.id}"><span class="chip">${KIND_LABEL[s.kind]}</span><span class="t">${esc(s.title)}</span><span class="m">${s.km ? km(x.status === 'done' && x.km ? x.km : s.km) : '25 min'}${x.movedTo ? ', déplacée' : ''}</span>${x.status ? `<span class="st" aria-label="${x.status === 'done' ? 'Faite' : 'Manquée'}">${x.status === 'done' ? '✓' : '✕'}</span>` : ''}</button>`;
    }).join('') : '<div class="restline">Repos</div>';
    return `<div class="day ${date === today ? 'today' : ''}">${lab}<div style="display:grid;gap:8px">${body}</div></div>`;
  }).join('');
  return `
  <h2 class="sec-title">Plan sur 26 semaines</h2>
  <div class="weeks" id="weeks">${G.weeks.map(x => `<button class="wchip p-${x.phase.id} ${x.n === cw ? 'now' : ''}" data-action="goweek" data-val="${x.n}" ${x.n === n ? 'aria-current="true"' : ''} aria-label="Semaine ${x.n}">${x.n}</button>`).join('')}</div>
  <section class="card whead">
    <div class="row"><h3>Semaine ${n}</h3><span class="muted small">${dShort(w.start)} au ${dShort(w.end)}</span></div>
    <div class="row"><span class="pill solid" style="background:${phaseCol[w.phase.id]};color:${w.phase.id === 'base' || w.phase.id === 'spec' ? '#fff' : 'var(--ink)'}">${w.phase.name}${w.rec ? ', récupération' : ''}</span><span class="small"><b>${num(A[n])}</b> / ${num(Pl[n])} km${n === 26 ? ' (course incluse)' : ''}</span></div>
    ${w.scale < 1 ? `<p class="small muted">Semaine allégée de ${Math.round((1 - w.scale) * 100)} %.</p>` : ''}
    <div class="btns">${n >= cw && n < N_WEEKS && w.scale === 1 ? `<button class="btn ghost small" data-action="lighten" data-val="${n}">Alléger de 20 %</button>` : ''}${w.scale < 1 ? `<button class="btn ghost small" data-action="unlighten" data-val="${n}">Revenir au plan normal</button>` : ''}</div>
  </section>
  ${days}
  <h2 class="sec-title">Vue d'ensemble</h2>
  <div class="legend"><span><i style="background:var(--blue)"></i>Base</span><span><i style="background:var(--orange)"></i>Développement</span><span><i style="background:var(--violet)"></i>Spécifique</span><span><i style="background:var(--pink)"></i>Affûtage</span></div>
  <div class="grid">${G.weeks.map(x => {
    const pc = Pl[x.n] ? Math.min(100, Math.round(A[x.n] / Pl[x.n] * 100)) : 0;
    return `<button class="tile p-${x.phase.id}" data-action="goweek" data-val="${x.n}" ${x.n === cw ? 'aria-current="true"' : ''}><span class="n">S${x.n}</span><span class="s">${dShort(x.start)}</span><span class="s">${Math.round(Pl[x.n])} km${x.rec ? ', récup' : ''}</span><span class="bar"><i style="width:${pc}%"></i></span></button>`;
  }).join('')}</div>`;
}

function barChart(pl, ac, cur) {
  const Wd = 26 * 22 + 34, H = 190, t = 10, b = 22, l = 28, ch = H - t - b;
  const max = Math.ceil(Math.max(20, ...pl, ...ac) * 1.08 / 20) * 20, y = v => t + ch - v / max * ch;
  let s = `<svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" role="img" aria-label="Kilomètres par semaine : prévu et réalisé">`;
  for (let v = 0; v <= max; v += 20) s += `<line x1="${l}" x2="${Wd}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${l - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  for (let n = 1; n <= 26; n++) {
    const x = l + (n - 1) * 22 + 3;
    s += `<rect x="${x}" y="${y(pl[n])}" width="16" height="${Math.max(0, t + ch - y(pl[n]))}" rx="4" fill="none" stroke="var(--violet)" stroke-width="2" opacity=".55"/>`;
    if (ac[n] > 0) s += `<rect x="${x + 3}" y="${y(ac[n])}" width="10" height="${t + ch - y(ac[n])}" rx="3" fill="var(--orange)"/>`;
    s += `<text x="${x + 8}" y="${H - 6}" text-anchor="middle" ${n === cur ? 'style="fill:var(--ink);font-weight:700"' : ''}>${n}</text>`;
  }
  return s + '</svg>';
}
function lineChart(pl, ac, cur) {
  const Wd = 560, H = 190, t = 10, b = 22, l = 38, ch = H - t - b, cum = a => { let s = 0; return a.map((v, i) => i ? (s += v) : 0); };
  const cp = cum(pl), ca = cum(ac), max = Math.ceil(cp[26] / 200) * 200, X = n => l + (n - 1) / 25 * (Wd - l - 10), Y = v => t + ch - v / max * ch;
  const pts = (arr, to) => Array.from({ length: to }, (_, i) => `${X(i + 1)},${Y(arr[i + 1])}`).join(' ');
  let s = `<svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" role="img" aria-label="Kilométrage cumulé : prévu et réalisé">`;
  for (let v = 0; v <= max; v += 200) s += `<line x1="${l}" x2="${Wd - 6}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${l - 6}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`;
  [1, 6, 11, 16, 21, 26].forEach(n => { s += `<text x="${X(n)}" y="${H - 6}" text-anchor="middle">S${n}</text>`; });
  s += `<polyline points="${pts(cp, 26)}" fill="none" stroke="var(--violet)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`;
  if (Plan.todayIso() >= Plan.PLAN_START) s += `<polyline points="${pts(ca, Math.max(1, cur))}" fill="none" stroke="var(--orange)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s + '</svg>';
}

function viewStats() {
  const P = G.P, ref = activeRef(), A = actualByWeek(), Pl = plannedByWeek(), cw = curWeek(), today = Plan.todayIso();
  const diff = P.predicted - S.settings.targetSec;
  const verdict = diff <= 0 ? 'Ta forme actuelle permet déjà l\'objectif.' : diff < 120 ? 'Objectif à portée : confirme-le avec le semi test de la semaine 22.' : 'L\'écart est important : le volume et la régularité feront la différence.';
  const doneRuns = flat().filter(s => st(s.id).status === 'done' && st(s.id).km);
  const all = [...doneRuns.map(s => st(s.id).km), ...S.extras.map(e => e.km)];
  const plannedSoFar = flat().filter(s => isRun(s) && effDate(s) < today);
  const completed = plannedSoFar.filter(s => st(s.id).status === 'done').length;
  const rate = plannedSoFar.length ? Math.round(completed / plannedSoFar.length * 100) + ' %' : '0 %';
  const refs = [...S.refs].sort((a, b) => (a.date || '0').localeCompare(b.date || '0'));
  return `
  <h2 class="sec-title">Prédiction</h2>
  <section class="pred"><p class="d" style="font-size:20px">Marathon prédit</p><p class="big-pred">${fmtTime(P.predicted)}</p>
    <p>${diff > 0 ? `${fmtTime(diff)} de plus que l'objectif` : `${fmtTime(-diff)} de marge sur l'objectif`} de ${fmtTime(S.settings.targetSec)}. ${verdict}</p>
    <p class="small" style="opacity:.8">Calculée avec la formule de Riegel à partir de : ${esc(ref.label)}, ${num(ref.distKm)} km en ${fmtClock(ref.timeSec)}.</p>
    <div class="btns"><button class="btn yellow" data-action="add-ref">Ajouter un chrono test</button></div></section>
  <section class="card"><h3>Chronos de référence</h3><div class="reflist">${refs.map(r => `<label class="ref"><input type="radio" name="aref" value="${r.id}" data-change="setref" ${r.id === ref.id ? 'checked' : ''}><span><b>${esc(r.label)}</b><br><span class="small muted">${r.date ? dShort(r.date) : 'date non renseignée'}, ${num(r.distKm)} km en ${fmtClock(r.timeSec)}, soit ${fmtTime(Plan.riegel(r.timeSec, r.distKm, 42.195))} au marathon</span></span>${S.refs.length > 1 ? `<button class="x" data-action="del-ref" data-id="${r.id}" aria-label="Supprimer">×</button>` : '<span></span>'}</label>`).join('')}</div>
    <p class="small muted">La référence cochée détermine toutes les allures du plan.</p></section>
  <section class="card"><h3>Tes allures</h3><table>
    <tr><td>Footing facile</td><td>${fmtPace(P.easyLo)} à ${fmtPace(P.easyHi)}/km</td></tr>
    <tr><td>Allure marathon</td><td>${fmtPace(P.mp)}/km</td></tr>
    <tr><td>Seuil (allure 10 km)</td><td>${fmtPace(P.seuil)}/km</td></tr>
    <tr><td>VMA</td><td>${fmtPace(P.vma)}/km</td></tr>
    <tr><td>Récupération trottinée</td><td>${fmtPace(P.rec)}/km</td></tr></table></section>
  <h2 class="sec-title">Volume</h2>
  <section class="card"><h3>Kilomètres par semaine</h3><div class="chart" id="chart1">${barChart(Pl, A, cw)}</div>
    <div class="legend"><span><i style="background:var(--orange)"></i>Réalisé</span><span><i style="border:2px solid var(--violet);background:none"></i>Prévu</span></div></section>
  <section class="card"><h3>Cumul</h3><div class="chart">${lineChart(Pl, A, cw)}</div>
    <div class="legend"><span><i style="background:var(--orange)"></i>Réalisé : ${Math.round(A.reduce((a, b) => a + b, 0))} km</span><span><i style="background:var(--violet)"></i>Prévu : ${Math.round(Pl.reduce((a, b) => a + b, 0))} km</span></div></section>
  <section class="card"><h3>Bilan</h3><div class="stats">
    <div class="stat"><b>${completed}/${plannedSoFar.length}</b><span>séances faites</span></div>
    <div class="stat"><b>${rate}</b><span>taux de réalisation</span></div>
    <div class="stat"><b>${all.length ? num(Math.max(...all)) : 0} km</b><span>plus longue sortie</span></div>
    <div class="stat"><b>${num(Math.max(0, ...A))} km</b><span>meilleure semaine</span></div></div></section>`;
}

const CHECK = [
  ['Dans les semaines qui précèdent', [['c1', 'Retirer le dossard (vérifier dates, lieu et pièces demandées sur le site officiel)'], ['c2', 'Tester tenue, gels et boisson sur au moins deux sorties longues'], ['c3', 'Choisir les chaussures et les porter sur 100 km minimum'], ['c4', 'Repérer le trajet jusqu\'au départ et les horaires de transports'], ['c5', 'Réserver l\'hébergement si besoin']]],
  ['La veille', [['v1', 'Préparer la tenue et épingler le dossard'], ['v2', 'Repas riche en glucides, rien de nouveau'], ['v3', 'Préparer les gels et la flasque'], ['v4', 'Charger la montre'], ['v5', 'Régler le réveil et se coucher tôt']]],
  ['Le matin', [['m1', 'Petit-déjeuner habituel environ 3 h avant le départ'], ['m2', 'Crème anti-frottements et pansements'], ['m3', 'Sac pour la consigne'], ['m4', 'Vêtement jetable pour patienter au départ'], ['m5', 'Échauffement léger de 10 minutes']]],
  ['Matériel', [['e1', 'Chaussures et chaussettes testées'], ['e2', 'Short ou collant, maillot'], ['e3', 'Casquette ou bandeau, lunettes'], ['e4', 'Montre ou chronomètre'], ['e5', 'Gels (nombre selon le plan ci-dessus)']]],
];

function viewRace() {
  const T = S.settings.targetSec, rp = Plan.racePlan(T), fp = Plan.fuelPlan(T, S.settings.carbsPerH, S.settings.gelCarbs), mp = T / 42.195;
  const all = CHECK.flatMap(g => g[1]), done = all.filter(i => S.checklist[i[0]]).length;
  return `
  <h2 class="sec-title">Stratégie d'allure</h2>
  <section class="card"><p>Objectif <b>${fmtTime(T)}</b>, soit <b>${fmtPace(mp)}/km</b> en moyenne. Pars <b>5 secondes par km plus lentement</b> sur les 5 premiers kilomètres, puis cale-toi sur ${fmtPace(rp[1].pace)}/km. À partir du 35e km, accélère seulement si les jambes répondent.</p>
    <table><tr><th>Repère</th><th>Allure</th><th>Passage</th></tr>${rp.map(r => `<tr><td>${r.label}</td><td>${fmtPace(r.pace)}/km</td><td><b>${fmtClock(r.cum)}</b></td></tr>`).join('')}</table>
    <p class="small muted">Le parcours 2027 n'est pas encore dévoilé. Ces passages sont calculés sur des kilomètres réguliers, à ajuster dès que le tracé sera publié.</p></section>
  <h2 class="sec-title">Nutrition</h2>
  <section class="card"><div class="fgrid"><label class="f">Glucides visés (g/heure)<input type="number" inputmode="numeric" min="30" max="100" value="${S.settings.carbsPerH}" data-change="carbsPerH"></label><label class="f">Glucides par gel (g)<input type="number" inputmode="numeric" min="10" max="60" value="${S.settings.gelCarbs}" data-change="gelCarbs"></label></div>
    <p>Prévois <b>${fp.rows.length} gels</b> (environ ${fp.total} g de glucides), un toutes les ${Math.round(fp.every / 60)} minutes.</p>
    <table><tr><th>Gel</th><th>Chrono</th><th>Kilomètre</th></tr>${fp.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${fmtClock(r.time)}</td><td>${num(r.km)}</td></tr>`).join('')}</table>
    <p class="small muted">Bois quelques gorgées à chaque ravitaillement, environ tous les 5 km. Repères généraux : entraîne ton estomac sur tes sorties longues et ne teste rien de nouveau le jour de la course.</p></section>
  <h2 class="sec-title">Check-list <span class="muted" style="font-size:22px">${done}/${all.length}</span></h2>
  ${CHECK.map(([g, items]) => `<section class="card"><h3>${g}</h3>${items.map(([id, t]) => `<label class="check"><input type="checkbox" data-change="check" data-id="${id}" ${S.checklist[id] ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</section>`).join('')}`;
}

function viewMore() {
  const s = S.settings;
  return `
  <h2 class="sec-title">Réglages</h2>
  <section class="card">
    <label class="f">Temps objectif (h:mm:ss)<input type="text" inputmode="numeric" value="${fmtClock(s.targetSec)}" data-change="target"></label>
    <label class="f">Heure de départ de la course<input type="time" value="${esc(s.startTime)}" data-change="startTime"></label>
    <label class="f">Séances de course par semaine<select data-change="mode"><option value="auto" ${s.sessionsMode === 'auto' ? 'selected' : ''}>4 puis 5 à partir de la semaine 3</option><option value="4" ${s.sessionsMode === '4' ? 'selected' : ''}>4 toute la préparation</option><option value="5" ${s.sessionsMode === '5' ? 'selected' : ''}>5 toute la préparation</option></select></label>
    <label class="toggle">Renforcement le mercredi<input type="checkbox" data-change="strength" ${s.strength ? 'checked' : ''}></label>
    <label class="toggle">Réduire les animations<input type="checkbox" data-change="motion" ${s.reduceMotion ? 'checked' : ''}></label>
  </section>
  <h2 class="sec-title">Chaussures</h2>
  <section class="card">${S.shoes.length ? S.shoes.map(sh => {
    const k = shoeKm(sh), p = Math.min(100, Math.round(k / sh.limitKm * 100));
    return `<div class="reflist"><div class="row"><b>${esc(sh.name)}${sh.retired ? ' (retirée)' : ''}</b><span class="small">${Math.round(k)} / ${sh.limitKm} km</span></div><div class="bar ${p >= 100 ? 'bad' : p >= 85 ? 'warn' : 'blue'}"><i style="width:${p}%"></i></div><div class="btns"><button class="btn ghost small" data-action="retire-shoe" data-id="${sh.id}">${sh.retired ? 'Réactiver' : 'Retirer'}</button><button class="btn ghost small" data-action="del-shoe" data-id="${sh.id}">Supprimer</button></div></div>`;
  }).join('<hr style="border:0;border-top:1px solid var(--line);width:100%">') : '<p class="muted">Aucune paire enregistrée. Ajoute-en une pour suivre son usure.</p>'}
    <button class="btn alt" data-action="add-shoe">Ajouter une paire</button></section>
  <h2 class="sec-title">Sauvegarde</h2>
  <section class="card"><p class="small muted">Tes données restent sur cet appareil. Exporte-les régulièrement : vider les données du navigateur les efface.</p>
    <div class="btns"><button class="btn" data-action="export">Exporter en JSON</button><button class="btn ghost" data-action="import">Importer un fichier</button><button class="btn danger" data-action="reset">Tout effacer</button></div></section>`;
}

// ---------- Rendu ----------
function render() {
  document.documentElement.dataset.motion = S.settings.reduceMotion ? 'off' : 'on';
  $('#wm-target').textContent = fmtTarget(S.settings.targetSec);
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="tab" data-action="tab" data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>${icon(k === 'race' ? 'flag' : k)}<span>${l}</span></button>`).join('');
  const v = { home: viewHome, plan: viewPlan, stats: viewStats, race: viewRace, more: viewMore }[ui.tab];
  const y = window.scrollY; $('#view').innerHTML = v(); if (ui.keepScroll) { window.scrollTo(0, y); ui.keepScroll = false; }
  if (ui.tab === 'plan') { const el = document.querySelector('#weeks [aria-current="true"]'); el && el.scrollIntoView({ inline: 'center', block: 'nearest' }); }
  if (ui.tab === 'stats') { const c = $('#chart1'); c && (c.scrollLeft = Math.max(0, (curWeek() - 8) * 22)); }
  tick();
}
function commit(keep = true) { ui.keepScroll = keep; Store.save(S); regen(); render(); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }
function go(tab, top = true) { ui.tab = tab; render(); if (top) window.scrollTo(0, 0); }

// ---------- Fiches (bottom sheet) ----------
const sheet = () => $('#sheet');
function openSheet(head, body, kind = '') { const d = sheet(); d.innerHTML = `<div class="sh-head ${kind ? 'k-' + kind : ''}">${head}<button class="sh-close" data-action="close" aria-label="Fermer">×</button></div><div class="sh-body">${body}</div>`; if (!d.open) d.showModal(); d.querySelector('.sh-body').scrollTop = 0; }
const closeSheet = () => sheet().open && sheet().close();

const shoeOptions = sel => `<option value="">Aucune</option>${S.shoes.filter(s => !s.retired).map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}`;
function logFields(d) {
  return `<div class="fgrid">
    <label class="f full">Date<input type="date" name="date" value="${d.date}"></label>
    ${d.strength ? '' : `<label class="f">Distance (km)<input type="number" name="km" inputmode="decimal" step="0.01" min="0" value="${d.km ?? ''}"></label>`}
    <label class="f ${d.strength ? 'full' : ''}">Durée (h:mm:ss ou minutes)<input type="text" name="dur" inputmode="numeric" placeholder="1:05:00" value="${d.dur ? fmtClock(d.dur) : ''}"></label>
    <label class="f">Ressenti (1 à 10)<select name="rpe"><option value="">—</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => `<option ${Number(d.rpe) === i ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
    <label class="f">FC moyenne (bpm)<input type="number" name="hr" inputmode="numeric" min="40" max="230" value="${d.hr ?? ''}"></label>
    ${d.strength ? '' : `<label class="f full">Chaussures<select name="shoe">${shoeOptions(d.shoe ?? S.lastShoe)}</select></label>`}
    <label class="f full">Notes<textarea name="note" placeholder="Sensations, météo, douleurs…">${esc(d.note || '')}</textarea></label></div>`;
}
function readLog(root, strength) {
  const g = n => root.querySelector(`[name=${n}]`);
  const dur = g('dur').value ? parseDur(g('dur').value) : null;
  if (g('dur').value && isNaN(dur)) { toast('Durée invalide. Exemple : 1:05:00'); return null; }
  return { doneDate: g('date').value || Plan.todayIso(), km: strength ? 0 : Math.max(0, parseFloat(g('km').value) || 0), dur, rpe: g('rpe').value ? Number(g('rpe').value) : null, hr: g('hr').value ? Number(g('hr').value) : null, shoe: strength ? null : (g('shoe').value || null), note: g('note').value.trim() };
}

function sessionSheet(id, mode = 'view') {
  const s = flat().find(x => x.id === id); if (!s) return; const x = st(id), strength = s.kind === 'strength', date = effDate(s);
  const head = `<span class="chip">${KIND_LABEL[s.kind]}</span><strong class="big" style="font-size:40px;padding-right:44px">${esc(s.title)}</strong><span class="when" style="font-weight:600">${esc(dLong(date))}${x.movedTo ? ` (prévue le ${dShort(s.date)})` : ''}</span>`;
  const info = `<dl class="kv">${s.km ? `<dt>Distance</dt><dd>${km(s.km)}</dd>` : '<dt>Durée</dt><dd>25 minutes</dd>'}${paceHint(s) ? `<dt>Allure</dt><dd>${paceHint(s)}</dd>` : ''}<dt>Effort</dt><dd>${esc(s.rpe)}</dd></dl>`;
  const steps = `<div class="steps">${s.steps.map(p => `<div class="step"><b><span>${esc(p.t)}</span>${p.km ? `<span>${km(p.km)}</span>` : ''}</b><span>${esc(p.d)}</span></div>`).join('')}</div>`;
  const tip = `<p class="tip">${esc(s.tip)}</p>`;
  let action = '';
  if (mode === 'log') {
    action = `<form id="logform" onsubmit="return false">${logFields({ date: x.doneDate || (Plan.todayIso() < Plan.PLAN_START ? s.date : Plan.todayIso() > date ? date : Plan.todayIso()), km: x.km ?? (s.km ? Math.round(s.km * 10) / 10 : ''), dur: x.dur, rpe: x.rpe, hr: x.hr, shoe: x.shoe, note: x.note, strength })}</form><div class="btns"><button class="btn alt" data-action="save-log" data-id="${id}">Enregistrer</button><button class="btn ghost" data-action="open" data-id="${id}">Annuler</button></div>`;
  } else if (mode === 'move') {
    action = `<label class="f">Nouvelle date<input type="date" id="movedate" value="${date}" min="${Plan.PLAN_START}" max="${RACE_DATE}"></label><div class="btns"><button class="btn alt" data-action="save-move" data-id="${id}">Déplacer</button><button class="btn ghost" data-action="open" data-id="${id}">Annuler</button></div>`;
  } else if (x.status === 'done') {
    const pace = x.km && x.dur ? `${fmtPace(x.dur / x.km)}/km` : null, sh = S.shoes.find(z => z.id === x.shoe);
    action = `<h3 class="d" style="font-size:24px">Séance faite</h3><dl class="kv"><dt>Date</dt><dd>${esc(dShort(x.doneDate || date))}</dd>${x.km ? `<dt>Distance</dt><dd>${km(x.km)}</dd>` : ''}${x.dur ? `<dt>Durée</dt><dd>${fmtClock(x.dur)}</dd>` : ''}${pace ? `<dt>Allure</dt><dd>${pace}</dd>` : ''}${x.rpe ? `<dt>Ressenti</dt><dd>${x.rpe} sur 10</dd>` : ''}${x.hr ? `<dt>FC moyenne</dt><dd>${x.hr} bpm</dd>` : ''}${sh ? `<dt>Chaussures</dt><dd>${esc(sh.name)}</dd>` : ''}</dl>${x.note ? `<p class="tip">${esc(x.note)}</p>` : ''}<div class="btns"><button class="btn" data-action="log" data-id="${id}">Modifier</button><button class="btn ghost" data-action="clear" data-id="${id}">Annuler le statut</button></div>`;
  } else if (x.status === 'missed') {
    action = `<p><b>Séance manquée.</b> Pas de rattrapage : on ne compense jamais en doublant la charge.</p><div class="btns"><button class="btn" data-action="log" data-id="${id}">Finalement faite</button><button class="btn ghost" data-action="clear" data-id="${id}">Remettre à faire</button></div>`;
  } else {
    action = `<div class="btns"><button class="btn alt" data-action="log" data-id="${id}">Marquer comme faite</button><button class="btn ghost" data-action="miss" data-id="${id}">Manquée</button><button class="btn ghost" data-action="move" data-id="${id}">Déplacer</button>${x.movedTo ? `<button class="btn ghost" data-action="unmove" data-id="${id}">Date d'origine</button>` : ''}</div>`;
  }
  openSheet(head, `${info}${tip}${steps}${action}`, s.kind);
}

function extraSheet() {
  openSheet('<strong class="big" style="font-size:38px;padding-right:44px">Sortie libre</strong><span class="when">Une course hors plan</span>', `<form id="logform" onsubmit="return false">${logFields({ date: Plan.todayIso(), km: '' })}</form><div class="btns"><button class="btn alt" data-action="save-extra">Enregistrer</button></div>`, 'easy');
}
function refSheet() {
  openSheet('<strong class="big" style="font-size:38px;padding-right:44px">Chrono test</strong><span class="when">Course ou test récent</span>', `<form id="refform" onsubmit="return false"><div class="fgrid">
    <label class="f full">Nom<input type="text" name="label" placeholder="10 km de…"></label>
    <label class="f">Date<input type="date" name="date" value="${Plan.todayIso()}"></label>
    <label class="f">Distance<select name="dist"><option value="5">5 km</option><option value="10">10 km</option><option value="15">15 km</option><option value="20">20 km</option><option value="21.0975">Semi-marathon</option><option value="42.195">Marathon</option></select></label>
    <label class="f full">Temps (h:mm:ss ou mm:ss)<input type="text" name="time" inputmode="numeric" placeholder="1:35:00"></label>
    <label class="toggle full">Utiliser comme référence du plan<input type="checkbox" name="use" checked></label></div></form><div class="btns"><button class="btn alt" data-action="save-ref">Enregistrer</button></div>`, 'test');
}
function shoeSheet() {
  openSheet('<strong class="big" style="font-size:38px;padding-right:44px">Nouvelle paire</strong>', `<form id="shoeform" onsubmit="return false"><div class="fgrid"><label class="f full">Modèle<input type="text" name="name" placeholder="ASICS Novablast"></label><label class="f">Km déjà parcourus<input type="number" name="start" inputmode="numeric" min="0" value="0"></label><label class="f">Durée de vie (km)<input type="number" name="limit" inputmode="numeric" min="100" value="700"></label></div></form><div class="btns"><button class="btn alt" data-action="save-shoe">Enregistrer</button></div>`, 'long');
}

// ---------- Actions ----------
const A = {
  tab: el => go(el.dataset.tab),
  goweek: el => { ui.week = Number(el.dataset.val); if (ui.tab !== 'plan') go('plan'); else { render(); window.scrollTo(0, 0); } },
  open: el => sessionSheet(el.dataset.id),
  close: closeSheet,
  log: el => sessionSheet(el.dataset.id, 'log'),
  move: el => sessionSheet(el.dataset.id, 'move'),
  'save-log': el => { const s = flat().find(x => x.id === el.dataset.id), v = readLog($('#logform'), s.kind === 'strength'); if (!v) return; S.sess[s.id] = { ...st(s.id), ...v, status: 'done' }; if (v.shoe) S.lastShoe = v.shoe; closeSheet(); commit(); toast('Séance enregistrée'); },
  'save-move': el => { const d = $('#movedate').value; if (!d) return; S.sess[el.dataset.id] = { ...st(el.dataset.id), movedTo: d }; closeSheet(); commit(); toast('Séance déplacée'); },
  unmove: el => { const x = { ...st(el.dataset.id) }; delete x.movedTo; S.sess[el.dataset.id] = x; closeSheet(); commit(); },
  miss: el => { S.sess[el.dataset.id] = { ...st(el.dataset.id), status: 'missed' }; closeSheet(); commit(); toast('Séance marquée comme manquée'); },
  clear: el => { const x = { ...st(el.dataset.id) }; ['status', 'km', 'dur', 'rpe', 'hr', 'shoe', 'note', 'doneDate'].forEach(k => delete x[k]); S.sess[el.dataset.id] = x; closeSheet(); commit(); },
  'add-run': extraSheet,
  'save-extra': () => { const v = readLog($('#logform'), false); if (!v) return; if (!v.km) { toast('Indique une distance'); return; } S.extras.push({ id: uid(), date: v.doneDate, km: v.km, dur: v.dur, rpe: v.rpe, hr: v.hr, shoe: v.shoe, note: v.note }); if (v.shoe) S.lastShoe = v.shoe; closeSheet(); commit(); toast('Sortie ajoutée'); },
  'add-ref': refSheet,
  'save-ref': () => {
    const f = $('#refform'), g = n => f.querySelector(`[name=${n}]`), t = parseTime(g('time').value);
    if (isNaN(t) || t < 600) { toast('Temps invalide. Exemple : 1:35:00'); return; }
    const r = { id: uid(), date: g('date').value || null, distKm: Number(g('dist').value), timeSec: t, label: g('label').value.trim() || `${num(Number(g('dist').value))} km` };
    S.refs.push(r); if (g('use').checked) S.activeRef = r.id; closeSheet(); commit(false); toast('Chrono enregistré, allures recalculées');
  },
  'del-ref': el => { if (S.refs.length < 2 || !confirm('Supprimer ce chrono ?')) return; S.refs = S.refs.filter(r => r.id !== el.dataset.id); if (S.activeRef === el.dataset.id) S.activeRef = S.refs[S.refs.length - 1].id; commit(); },
  lighten: el => { S.weekScale[el.dataset.val] = 0.8; commit(); toast('Semaine allégée de 20 %'); },
  unlighten: el => { delete S.weekScale[el.dataset.val]; commit(); },
  'add-shoe': shoeSheet,
  'save-shoe': () => { const f = $('#shoeform'), g = n => f.querySelector(`[name=${n}]`); if (!g('name').value.trim()) { toast('Donne un nom à la paire'); return; } S.shoes.push({ id: uid(), name: g('name').value.trim(), startKm: Number(g('start').value) || 0, limitKm: Number(g('limit').value) || 700, retired: false }); closeSheet(); commit(); },
  'retire-shoe': el => { const sh = S.shoes.find(z => z.id === el.dataset.id); sh.retired = !sh.retired; commit(); },
  'del-shoe': el => { if (confirm('Supprimer cette paire ? Elle sera retirée des séances associées.')) { S.shoes = S.shoes.filter(z => z.id !== el.dataset.id); commit(); } },
  export: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' })); a.download = `prepa-marathon-${Plan.todayIso()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Sauvegarde exportée'); },
  import: () => $('#import-file').click(),
  reset: () => { if (confirm('Effacer toutes tes données ? Cette action est définitive.')) { S = Store.defaultState(); commit(false); go('home'); toast('Données effacées'); } },
};
const C = {
  setref: el => { S.activeRef = el.value; commit(); toast('Allures recalculées'); },
  target: el => { const t = parseTime(el.value); if (isNaN(t) || t < 7200 || t > 25200) { toast('Temps invalide. Exemple : 3:20:00'); render(); return; } S.settings.targetSec = t; commit(); },
  startTime: el => { S.settings.startTime = el.value || '08:30'; commit(); },
  mode: el => { S.settings.sessionsMode = el.value; commit(); },
  strength: el => { S.settings.strength = el.checked; commit(); },
  motion: el => { S.settings.reduceMotion = el.checked; commit(); },
  carbsPerH: el => { S.settings.carbsPerH = Math.min(100, Math.max(30, Number(el.value) || 60)); commit(); },
  gelCarbs: el => { S.settings.gelCarbs = Math.min(60, Math.max(10, Number(el.value) || 25)); commit(); },
  check: el => { S.checklist[el.dataset.id] = el.checked; commit(); },
};

document.addEventListener('click', e => {
  if (e.target === sheet()) return closeSheet();
  const el = e.target.closest('[data-action]'); if (el && A[el.dataset.action]) A[el.dataset.action](el);
});
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el && C[el.dataset.change]) C[el.dataset.change](el); });
$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || typeof d !== 'object' || !d.settings || !Array.isArray(d.refs) || !d.refs.length || typeof d.sess !== 'object') throw new Error('format');
    if (!confirm('Remplacer toutes les données actuelles par ce fichier ?')) return;
    S = Store.merge(d); commit(false); toast('Données importées');
  } catch (err) { toast('Fichier invalide'); }
  e.target.value = '';
});

// ---------- Démarrage ----------
async function init() {
  S = await Store.load(); Store.persist(); regen();
  const seg = '<span>La joie de courir ses 42,195 km</span><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 0l1.8 5.2L14 7l-5.2 1.8L7 14l-1.8-5.2L0 7l5.2-1.8z" fill="currentColor"/></svg><span>Objectif 3h20 au 4 avril 2027</span><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="currentColor"/></svg><span>Régularité, patience, sorties longues</span><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" rx="4" fill="currentColor"/></svg>';
  $('#ticker').innerHTML = `<span>${seg}</span><span>${seg}</span>`;
  render(); setInterval(tick, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); if (ui.tab === 'home') render(); } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
