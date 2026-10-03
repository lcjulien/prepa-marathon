// Moteur du plan : fonctions pures, sans accès au DOM.
export const RACE_DATE = '2027-04-04';
export const PLAN_START = '2026-10-05'; // lundi de la semaine 1
export const N_WEEKS = 26;
export const RECOVERY = [4, 8, 12, 16, 20];

const DAY_MS = 86400000;
const toMs = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const toIso = ms => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s, n) => toIso(toMs(s) + n * DAY_MS);
export const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY_MS);
export const weekOf = date => Math.floor(diffDays(PLAN_START, date) / 7) + 1;
export const todayIso = () => { const d = new Date(); return toIso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };

export const fmtPace = s => { s = Math.round(s); return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}`; };
export const fmtTime = s => {
  s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}'${String(sec).padStart(2, '0')}` : `${m}'${String(sec).padStart(2, '0')}`;
};
export const fmtClock = s => {
  s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
const fmtDur = s => s >= 120 && s % 60 === 0 ? `${s / 60} min` : s >= 60 && s % 60 === 0 ? '1 min' : `${s} s`;
export function parseTime(str) {
  if (!str) return NaN;
  const p = String(str).trim().replace(/h/gi, ':').replace(/['′’]/g, ':').replace(/["″]/g, '').split(':').filter(x => x !== '').map(Number);
  if (p.some(isNaN) || !p.length) return NaN;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] <= 9 ? p[0] * 3600 + p[1] * 60 : p[0] * 60 + p[1];
  return NaN;
}

// Riegel : T2 = T1 * (D2/D1)^1.06
export const riegel = (t, d1, d2) => t * Math.pow(d2 / d1, 1.06);

export function computePaces(ref, targetSec) {
  const predicted = riegel(ref.timeSec, ref.distKm, 42.195);
  const pm = predicted / 42.195;
  const t10 = riegel(ref.timeSec, ref.distKm, 10);
  const t5 = riegel(ref.timeSec, ref.distKm, 5);
  return {
    predicted, predictedHalf: riegel(ref.timeSec, ref.distKm, 21.0975), t10, t5,
    mp: targetSec / 42.195, seuil: t10 / 10, vma: (t5 / 5) * 0.925,
    easyLo: pm * 1.145, easyHi: pm * 1.25, easy: pm * 1.2, rec: pm * 1.3,
  };
}
const pr = (P, key) => key === 'easy' ? `${fmtPace(P.easyLo)} à ${fmtPace(P.easyHi)}/km` : `${fmtPace(P[key])}/km`;

// ---------- Tables du plan (index = numéro de semaine) ----------
const PHASES = [
  { id: 'base', name: 'Base', from: 1, to: 6 },
  { id: 'dev', name: 'Développement', from: 7, to: 14 },
  { id: 'spec', name: 'Spécifique', from: 15, to: 23 },
  { id: 'taper', name: 'Affûtage', from: 24, to: 26 },
];
export const phaseOf = n => PHASES.find(p => n >= p.from && n <= p.to);
export const PHASE_LIST = PHASES;

// Volume hebdo visé (km) et sortie longue (km)
const V = [0, 42, 46, 50, 40, 52, 55, 58, 46, 60, 62, 64, 50, 65, 67, 69, 54, 70, 72, 75, 58, 72, 65, 70, 50, 38, 22];
const L = [0, 16, 17, 18, 15, 20, 21, 22, 18, 24, 24, 26, 20, 26, 28, 28, 22, 30, 30, 32, 24, 32, 24, 32, 20, 14, 0];
const LONG_MP = { 11: 4, 13: 5, 15: 6, 17: 10, 19: 12, 21: 14, 23: 12, 24: 5, 25: 3 };
const Q1 = {
  1: ['fartlek', [8, 60, 60]], 2: ['fartlek', [10, 60, 60]], 3: ['fartlek', [6, 120, 60]], 4: ['fartlek', [6, 60, 60]], 5: ['fartlek', [8, 120, 60]], 6: ['fartlek', [10, 120, 60]],
  7: ['vma', [8, 400, 60]], 8: ['vma', [6, 400, 60]], 9: ['vma', [5, 800, 90]], 10: ['vma', [6, 800, 90]], 11: ['vma', [5, 1000, 120]], 12: ['vma', [8, 400, 60]], 13: ['vma', [6, 1000, 120]], 14: ['seuilD', [4, 1600, 120]],
  15: ['vma', [6, 800, 90]], 16: ['vma', [8, 400, 60]], 17: ['vma', [5, 1000, 120]], 18: ['vma', [6, 800, 90]], 19: ['vma', [5, 1000, 120]], 20: ['vma', [6, 400, 60]], 21: ['vma', [6, 800, 90]], 22: ['vma', [6, 400, 60]], 23: ['vma', [5, 1000, 120]],
  24: ['seuilD', [4, 1000, 90]], 25: ['seuilD', [3, 1000, 90]],
};
const Q2 = {
  1: ['tempo', [2, 8, 2]], 2: ['tempo', [2, 10, 2]], 3: ['tempo', [3, 8, 2]], 4: ['tempo', [2, 8, 2]], 5: ['tempo', [2, 12, 2]], 6: ['tempo', [3, 10, 2]],
  7: ['tempo', [2, 15, 3]], 8: ['tempo', [2, 10, 2]], 9: ['tempo', [3, 12, 2]], 10: ['tempo', [2, 20, 3]], 11: ['tempo', [3, 15, 2]], 12: ['tempo', [2, 12, 2]], 13: ['tempo', [4, 10, 2]], 14: ['tempo', [1, 25, 0]],
  15: ['tempo', [3, 12, 2]], 16: ['mp', [2, 4, 2]], 17: ['tempo', [3, 15, 2]], 18: ['mp', [3, 5, 2]], 19: ['tempo', [2, 20, 3]], 20: ['mp', [2, 3, 2]], 21: ['tempo', [3, 12, 2]], 22: ['mp', [2, 3, 2]], 23: ['tempo', [2, 15, 3]],
  24: ['mp', [2, 3, 2]], 25: ['mp', [2, 2, 2]],
};

export const KIND_LABEL = { easy: 'Footing', fartlek: 'Fartlek', vma: 'VMA', seuil: 'Seuil', mp: 'Allure marathon', long: 'Sortie longue', test: 'Semi test', race: 'Jour J', strength: 'Renfo' };

const r1 = x => Math.round(x * 10) / 10;
const WU = 3, CD = 2.5;
const wuStep = P => ({ t: 'Échauffement', d: `17 min de footing facile (${pr(P, 'easy')}), puis 4 lignes droites progressives de 20 s`, km: WU });
const cdStep = () => ({ t: 'Retour au calme', d: '12 min de footing très facile', km: CD });
const mk = (kind, title, steps, rpe, tip) => ({ kind, title, steps, km: r1(steps.reduce((a, s) => a + (s.km || 0), 0)), rpe, tip });
const scaleReps = (n, sc) => n === 1 ? 1 : Math.max(2, Math.round(n * sc));

function quality(P, spec, sc) {
  const [type, a] = spec;
  if (type === 'fartlek') {
    const [reps0, on, off] = a, reps = scaleReps(reps0, sc);
    return mk('fartlek', `${reps} × ${fmtDur(on)} / ${fmtDur(off)}`, [wuStep(P),
      { t: 'Corps de séance', d: `${reps} × (${fmtDur(on)} rapide à ${pr(P, 'seuil')}, puis ${fmtDur(off)} lent)`, km: reps * (on / P.seuil + off / P.easyHi) }, cdStep()],
      '7 sur 10 sur les accélérations', 'Reste fluide : les accélérations sont toniques, jamais à bloc.');
  }
  if (type === 'tempo') {
    const [reps0, min, rec] = a, reps = scaleReps(reps0, sc);
    const body = reps === 1 ? `${min} min continues à allure seuil (${pr(P, 'seuil')})` : `${reps} × ${min} min à allure seuil (${pr(P, 'seuil')}), récupération de ${rec} min en trottinant`;
    return mk('seuil', reps === 1 ? `${min} min continues` : `${reps} × ${min} min`, [wuStep(P),
      { t: 'Corps de séance', d: body, km: reps * min * 60 / P.seuil + (reps - 1) * rec * 60 / P.rec }, cdStep()],
      '7 sur 10, « confortablement dur »', 'Tu dois pouvoir dire quelques mots, pas tenir une conversation.');
  }
  if (type === 'vma' || type === 'seuilD') {
    const [reps0, m, rec] = a, reps = scaleReps(reps0, sc), key = type === 'vma' ? 'vma' : 'seuil';
    const per = (m / 1000) * P[key];
    return mk(key === 'vma' ? 'vma' : 'seuil', `${reps} × ${m} m`, [wuStep(P),
      { t: 'Corps de séance', d: `${reps} × ${m} m à ${pr(P, key)} (environ ${fmtTime(per)} par répétition), récupération de ${rec} s en trottinant`, km: reps * m / 1000 + (reps - 1) * rec / P.rec }, cdStep()],
      key === 'vma' ? '8 à 9 sur 10' : '7 sur 10', key === 'vma' ? 'Régularité avant tout : la dernière répétition doit ressembler à la première.' : 'Allure constante sur toutes les répétitions.');
  }
  // mp
  const [reps0, km, rec] = a, reps = scaleReps(reps0, sc);
  return mk('mp', `${reps} × ${km} km`, [wuStep(P),
    { t: 'Corps de séance', d: `${reps} × ${km} km à allure marathon (${pr(P, 'mp')}), récupération de ${rec} min en trottinant`, km: reps * km + (reps - 1) * rec * 60 / P.rec }, cdStep()],
    '6 sur 10', 'Apprends cette allure : elle doit paraître contrôlée, presque facile au début.');
}

function longRun(P, n, sc) {
  const L0 = r1(L[n] * sc), mpKm = Math.min(LONG_MP[n] || 0, Math.max(0, L0 - 8));
  if (mpKm > 0) {
    const prog = n === 11 || n === 13;
    return mk('long', `Sortie longue ${L0} km`, [
      { t: 'Endurance', d: `${r1(L0 - mpKm - 2)} km en endurance (${pr(P, 'easy')})`, km: L0 - mpKm - 2 },
      { t: prog ? 'Fin progressive' : 'Allure marathon', d: prog ? `${mpKm} km en accélérant progressivement jusqu'à ${pr(P, 'mp')}` : `${mpKm} km à allure marathon (${pr(P, 'mp')})`, km: mpKm },
      { t: 'Retour au calme', d: '2 km très faciles', km: 2 }], '4 à 5 sur 10, puis 6 sur le bloc rapide',
      'Prends tes gels et ta boisson comme le jour J : la sortie longue sert aussi à tester la nutrition.');
  }
  return mk('long', `Sortie longue ${L0} km`, [{ t: 'Endurance', d: `${L0} km en endurance (${pr(P, 'easy')}), terrain plutôt plat`, km: L0 }], '4 sur 10',
    'Pars lentement. Si tu doutes entre deux allures, prends la plus lente.');
}

const easyRun = (P, km, strides) => mk('easy', 'Footing facile', [
  { t: 'Footing', d: `${km} km à ${pr(P, 'easy')}`, km }, ...(strides ? [{ t: 'Lignes droites', d: '5 × 20 s progressives, récupération complète (marche)', km: 0.5 }] : [])],
  '3 à 4 sur 10', 'Tu dois pouvoir parler en phrases complètes.');

const strengthSession = () => mk('strength', 'Renforcement musculaire', [
  { t: 'Circuit, 3 tours', d: '12 squats, 10 fentes par jambe, 15 ponts fessiers, 15 montées de mollets sur une jambe, gainage planche 40 s, gainage latéral 30 s par côté', km: 0 },
  { t: 'Mobilité', d: '5 min : hanches, mollets, ischio-jambiers', km: 0 }], '5 sur 10', 'Séance facultative, 25 minutes. À sauter en cas de grosse fatigue.');

export function buildWeek(n, P, cfg, scale = 1) {
  const start = addDays(PLAN_START, (n - 1) * 7), phase = phaseOf(n), rec = RECOVERY.includes(n);
  const qs = rec ? Math.min(scale, 0.8) : scale;
  const mode = cfg.sessionsMode === 'auto' ? (n <= 2 ? 4 : 5) : Number(cfg.sessionsMode);
  const days = {}; // index 0 = lundi
  if (n === 26) {
    if (mode === 5) days[0] = easyRun(P, 6, true);
    days[1] = mk('mp', '3 × 1 km allure marathon', [wuStep(P),
      { t: 'Corps de séance', d: `3 × 1 km à ${pr(P, 'mp')}, récupération de 2 min en trottinant`, km: 3 + 2 * 120 / P.rec }, cdStep()], '6 sur 10', 'Juste pour garder les jambes réveillées.');
    days[3] = easyRun(P, 5, true);
    days[5] = mk('easy', 'Décrassage veille de course', [{ t: 'Footing', d: `20 min très faciles, puis 4 lignes droites de 15 s`, km: 3.5 }], '2 à 3 sur 10', 'Prépare ta tenue, ton dossard et ta nutrition. Couche-toi tôt.');
    days[6] = { kind: 'race', title: 'Marathon de Paris', km: 42.195, rpe: 'Départ prudent', tip: 'Consulte l\'onglet Jour J pour les temps de passage et la nutrition.',
      steps: [{ t: 'Objectif', d: `${fmtTime(P.mp * 42.195)} soit ${fmtPace(P.mp)}/km`, km: 42.195 }] };
  } else {
    const q1 = quality(P, Q1[n], qs), q2 = quality(P, Q2[n], qs);
    let longS;
    if (n === 22) {
      const semi = P.mp * 42.195 * Math.pow(21.0975 / 42.195, 1.06);
      longS = mk('test', 'Semi-marathon test', [wuStep(P),
        { t: 'Course', d: `21,1 km à allure régulière, objectif environ ${fmtTime(semi)} (${fmtPace(semi / 21.0975)}/km)`, km: 21.0975 }, cdStep()],
        '7 sur 10', 'Enregistre ton chrono dans Suivi : l\'app recalcule alors tes allures et ta prédiction.');
    } else longS = longRun(P, n, scale);
    const nEasy = mode === 5 ? 2 : 1;
    const rest = V[n] * scale - longS.km - q1.km - q2.km;
    const e = Math.min(14, Math.max(n >= 24 ? 4 : 5, Math.round(rest / nEasy * 2) / 2));
    if (mode === 5) days[0] = easyRun(P, e, false);
    days[1] = q1;
    if (cfg.strength && n < 25) days[2] = strengthSession();
    days[3] = q2;
    days[5] = easyRun(P, e, true);
    days[6] = longS;
  }
  const sessions = Object.keys(days).map(Number).sort((a, b) => a - b).map(d => ({ ...days[d], id: `${n}-${d}`, week: n, day: d, date: addDays(start, d) }));
  const runKm = r1(sessions.reduce((a, s) => a + (s.kind === 'strength' ? 0 : s.km), 0));
  return { n, phase, start, end: addDays(start, 6), rec, scale, sessions, km: runKm };
}

export function generate(cfg, ref, scales = {}) {
  const P = computePaces(ref, cfg.targetSec);
  return { P, weeks: Array.from({ length: N_WEEKS }, (_, i) => buildWeek(i + 1, P, cfg, scales[i + 1] || 1)) };
}

// ---------- Jour J ----------
export function racePlan(T) {
  const mp = T / 42.195, slow = 5, q = (T - 5 * (mp + slow)) / (42.195 - 5);
  const f = km => km <= 5 ? km * (mp + slow) : 5 * (mp + slow) + (km - 5) * q;
  const marks = [5, 10, 15, 20, 21.0975, 25, 30, 35, 40, 42.195];
  return marks.map((km, i) => {
    const prev = i ? marks[i - 1] : 0;
    return { km, label: km === 21.0975 ? 'Semi' : km === 42.195 ? 'Arrivée' : `${km} km`, cum: f(km), pace: (f(km) - f(prev)) / (km - prev) };
  });
}
export function fuelPlan(T, carbsPerH, gelCarbs) {
  const mp = T / 42.195, every = gelCarbs / carbsPerH * 3600, rows = [];
  for (let t = Math.min(every, 1800); ; t += every) { const km = t / mp; if (km > 39) break; rows.push({ time: t, km }); }
  return { rows, every, total: rows.length * gelCarbs };
}
