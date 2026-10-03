/* Prépa Marathon de Paris 2027 : script unique (fonctionne aussi en ouvrant index.html directement). */
(function () {
'use strict';
const Plan = (() => {
// Moteur du plan : fonctions pures, sans accès au DOM.
const RACE_DATE = '2027-04-04';
const PLAN_START = '2026-10-05'; // lundi de la semaine 1
const N_WEEKS = 26;
const RECOVERY = [4, 8, 12, 16, 20];

const DAY_MS = 86400000;
const toMs = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toIso = ms => new Date(ms).toISOString().slice(0, 10);
const addDays = (s, n) => toIso(toMs(s) + n * DAY_MS);
const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY_MS);
const weekOf = date => Math.floor(diffDays(PLAN_START, date) / 7) + 1;
const todayIso = () => { const d = new Date(); return toIso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };

const fmtPace = s => { s = Math.round(s); return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}`; };
const fmtTime = s => {
  s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}'${String(sec).padStart(2, '0')}` : `${m}'${String(sec).padStart(2, '0')}`;
};
const fmtClock = s => {
  s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
const fmtDur = s => s >= 120 && s % 60 === 0 ? `${s / 60} min` : s >= 60 && s % 60 === 0 ? '1 min' : `${s} s`;
function parseTime(str) {
  if (!str) return NaN;
  const p = String(str).trim().replace(/h/gi, ':').replace(/['′’]/g, ':').replace(/["″]/g, '').split(':').filter(x => x !== '').map(Number);
  if (p.some(isNaN) || !p.length) return NaN;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] <= 9 ? p[0] * 3600 + p[1] * 60 : p[0] * 60 + p[1];
  return NaN;
}

// Riegel : T2 = T1 * (D2/D1)^1.06
const riegel = (t, d1, d2) => t * Math.pow(d2 / d1, 1.06);

function computePaces(ref, targetSec) {
  const predicted = riegel(ref.timeSec, ref.distKm, 42.195);
  const pm = predicted / 42.195;
  const t10 = riegel(ref.timeSec, ref.distKm, 10);
  const t5 = riegel(ref.timeSec, ref.distKm, 5);
  return {
    predicted, predictedHalf: riegel(ref.timeSec, ref.distKm, 21.0975), t10, t5,
    mp: targetSec / 42.195, seuil: t10 / 10, vma: (t5 / 5) * 0.925, vma2: ((t5 / 5) * 0.925 + t5 / 5) / 2,
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
const phaseOf = n => PHASES.find(p => n >= p.from && n <= p.to);
const PHASE_LIST = PHASES;

// Volume hebdo visé (km) et sortie longue (km)
const V = [0, 42, 46, 50, 40, 52, 55, 58, 46, 60, 62, 64, 50, 65, 67, 69, 54, 70, 72, 75, 58, 72, 65, 70, 50, 38, 22];
const L = [0, 16, 17, 18, 15, 20, 21, 22, 18, 24, 24, 26, 20, 26, 28, 28, 22, 30, 30, 32, 24, 32, 24, 32, 20, 14, 0];
const LONG_MP = { 11: 4, 13: 5, 15: 6, 17: 10, 19: 12, 21: 14, 23: 12, 24: 5, 25: 3 };
const Q1 = {
  1: ['fartlek', [60, 120, 30, 180, 60, 120, 30, 90]], 2: ['court30', [12, 30, 30]], 3: ['cotes', [8, 45]], 4: ['fartlek', [60, 90, 30, 60, 90, 30]],
  5: ['fracT', [5, 180, 90, 'seuil']], 6: ['pyr', { u: 's', set: [60, 120, 180, 240, 180, 120, 60], rec: 60, key: 'seuil' }],
  7: ['court30', [15, 30, 30]], 8: ['cotes', [6, 45]], 9: ['frac', [5, 800, 90, 'vma2']], 10: ['pyr', { u: 'm', set: [400, 800, 1200, 800, 400], rec: 90, key: 'seuil' }],
  11: ['frac', [5, 1000, 120, 'vma2']], 12: ['fartlek', [30, 60, 90, 120, 90, 60, 30, 60]], 13: ['frac', [12, 400, 60, 'vma']], 14: ['frac', [4, 1600, 120, 'seuil']],
  15: ['frac', [6, 800, 90, 'vma2']], 16: ['fartlek', [60, 120, 60, 120, 60, 120]], 17: ['frac', [5, 1000, 120, 'vma2']], 18: ['pyr', { u: 'm', set: [800, 1200, 1600, 1200, 800], rec: 90, key: 'seuil' }],
  19: ['frac', [12, 400, 60, 'vma']], 20: ['fartlek', [90, 60, 120, 30, 180, 60]], 21: ['frac', [6, 800, 90, 'vma2']], 22: ['frac', [6, 400, 60, 'vma']], 23: ['frac', [5, 1000, 120, 'vma2']],
  24: ['frac', [4, 1000, 90, 'seuil']], 25: ['frac', [3, 1000, 90, 'seuil']],
};
const Q2 = {
  1: ['tempo', [2, 8, 2]], 2: ['mpT', [1, 20, 0]], 3: ['tempo', [3, 8, 2]], 4: ['prog', [40, 10]], 5: ['tempo', [2, 12, 2]], 6: ['tempo', [3, 10, 2]],
  7: ['tempo', [2, 15, 3]], 8: ['prog', [45, 15]], 9: ['tempo', [3, 12, 2]], 10: ['mp', [2, 4, 2]], 11: ['tempo', [3, 15, 2]], 12: ['prog', [40, 15]], 13: ['tempo', [4, 10, 2]], 14: ['tempo', [1, 25, 0]],
  15: ['tempo', [3, 12, 2]], 16: ['mp', [2, 4, 2]], 17: ['tempo', [3, 15, 2]], 18: ['mp', [3, 5, 2]], 19: ['tempo', [2, 20, 3]], 20: ['mp', [2, 3, 2]], 21: ['tempo', [3, 12, 2]], 22: ['mp', [2, 3, 2]], 23: ['tempo', [2, 15, 3]],
  24: ['mp', [2, 3, 2]], 25: ['mp', [2, 2, 2]],
};

const KIND_LABEL = { easy: 'Footing', fartlek: 'Fartlek', court: 'Fractionné court', longfrac: 'Fractionné long', cotes: 'Côtes', pyramide: 'Pyramide', seuil: 'Seuil', mp: 'Allure marathon', prog: 'Progressif', long: 'Sortie longue', test: 'Semi test', race: 'Jour J', strength: 'Renfo' };
const KIND_DEF = {
  fartlek: 'Fartlek (« jeu de vitesse » en suédois) : tu alternes accélérations et relances de durées variées, au ressenti, sans allure ni chrono imposés.',
  court: 'Fractionné court : répétitions de 30 secondes à 400 m à allure VMA, avec récupération trottinée. Il développe la vitesse maximale aérobie.',
  longfrac: 'Fractionné long : répétitions de 3 minutes ou de 800 m à 2 km, à allure 3 km, 5 km ou 10 km. Il améliore la puissance et la tenue de l\'effort intense.',
  cotes: 'Côtes : répétitions courtes en montée. Elles renforcent les jambes et la foulée, sans le choc d\'une vitesse élevée.',
  pyramide: 'Pyramide : efforts de durée ou de distance croissante puis décroissante, courus à allure constante.',
  seuil: 'Seuil : allure soutenue que tu pourrais tenir environ une heure. Elle repousse le moment où tu t\'essouffles.',
  mp: 'Allure marathon : travail à l\'allure exacte de la course, pour la reconnaître et la maîtriser.',
  prog: 'Footing progressif : tu démarres facile et tu accélères pour finir à allure marathon.',
  easy: 'Footing : course facile en endurance fondamentale, qui construit la base sans fatigue excessive.',
  long: 'Sortie longue : la séance clé du marathon. Elle prépare le corps à tenir la durée.',
  test: 'Course test : un semi couru à fond contrôlé pour mesurer ta forme et recalibrer les allures.',
  race: 'Le jour J.', strength: 'Renforcement : gainage et force pour stabiliser la foulée et prévenir les blessures.' };

const r1 = x => Math.round(x * 10) / 10;
const WU = 3, CD = 2.5;
const wuStep = P => ({ t: 'Échauffement', d: `17 min de footing facile (${pr(P, 'easy')}), puis 4 lignes droites progressives de 20 s`, km: WU });
const cdStep = () => ({ t: 'Retour au calme', d: '12 min de footing très facile', km: CD });
const mk = (kind, title, steps, rpe, tip, pace) => ({ kind, title, steps, km: r1(steps.reduce((a, s) => a + (s.km || 0), 0)), rpe, tip, ...(pace !== undefined ? { pace } : {}) });
const scaleReps = (n, sc) => n === 1 ? 1 : Math.max(2, Math.round(n * sc));

const short = x => x < 60 ? `${x} s` : x % 60 === 0 ? `${x / 60} min` : `${Math.floor(x / 60)} min ${x % 60} s`;
const tiny = x => x < 60 ? `${x}″` : x % 60 === 0 ? `${x / 60}'` : `${Math.floor(x / 60)}'${String(x % 60).padStart(2, '0')}`;
const KEY_TXT = { vma: 'allure VMA', vma2: 'allure 3 km', seuil: 'allure 10 km' };
const body = (d, km) => ({ t: 'Corps de séance', d, km });

function quality(P, spec, sc) {
  const [type, a] = spec;
  if (type === 'fartlek') {
    const n = Math.max(4, Math.round(a.length * sc)), set = a.slice(0, n), on = set.reduce((x, y) => x + y, 0);
    return mk('fartlek', `${n} accélérations variées`, [wuStep(P), body(`${n} accélérations de durées différentes : ${set.map(tiny).join(' – ')}. Cours-les au ressenti (7 sur 10), sans regarder la montre, et relance quand tu te sens bien. Entre deux, footing facile d'environ la moitié du temps d'effort`, on / P.seuil + on * 0.6 / P.easyHi), cdStep()],
      '6 à 8 sur 10, selon l\'envie', 'Le fartlek est un jeu : varie les durées, change de rythme, fais-toi plaisir. Aucune allure à respecter.', 'Au ressenti');
  }
  if (type === 'court30') {
    const [r0, on, off] = a, reps = scaleReps(r0, sc);
    return mk('court', `${reps} × ${on}/${off}`, [wuStep(P), body(`${reps} × (${on} s rapides à ${fmtPace(P.vma)}/km, puis ${off} s de trot)`, reps * (on / P.vma + off / P.rec)), cdStep()],
      '8 à 9 sur 10', 'Rapide mais relâché. La dernière répétition doit ressembler à la première.', `${fmtPace(P.vma)}/km`);
  }
  if (type === 'cotes') {
    const [r0, dur] = a, reps = scaleReps(r0, sc);
    return mk('cotes', `${reps} × ${dur} s en côte`, [wuStep(P), body(`${reps} montées de ${dur} s sur une pente de 5 à 8 %, effort soutenu (8 sur 10), redescente en trottinant`, reps * (dur / (P.seuil * 1.1) + dur * 1.3 / P.rec)), cdStep()],
      '8 sur 10', 'Pousse avec les bras et les genoux, buste droit. Pas de chrono : c\'est l\'effort qui compte.', 'Au ressenti');
  }
  if (type === 'frac' || type === 'fracT') {
    const [r0, v, rec, key] = a, reps = scaleReps(r0, sc), isT = type === 'fracT';
    const per = isT ? v : (v / 1000) * P[key], kind = !isT && v <= 400 ? 'court' : 'longfrac';
    const work = isT ? reps * v / P[key] : reps * v / 1000;
    return mk(kind, isT ? `${reps} × ${short(v)}` : `${reps} × ${v} m`, [wuStep(P), body(`${reps} × ${isT ? short(v) : v + ' m'} à ${fmtPace(P[key])}/km (${KEY_TXT[key]}${isT ? '' : `, environ ${fmtTime(per)} par répétition`}), récupération de ${rec} s en trottinant`, work + (reps - 1) * rec / P.rec), cdStep()],
      key === 'seuil' ? '7 sur 10' : '8 sur 10', 'Régularité avant tout : mieux vaut une allure constante qu\'un départ trop rapide.', `${fmtPace(P[key])}/km`);
  }
  if (type === 'pyr') {
    const { u, set: set0, rec, key } = a, set = sc < 1 && set0.length > 5 ? set0.slice(1, -1) : set0, n = set.length;
    const work = u === 'm' ? set.reduce((x, y) => x + y, 0) / 1000 : set.reduce((x, y) => x + y, 0) / P[key];
    const lab = set.map(x => u === 'm' ? x : tiny(x));
    return mk('pyramide', `${lab.join('-')}${u === 'm' ? ' m' : ''}`, [wuStep(P), body(`Pyramide : ${lab.join(' – ')}${u === 'm' ? ' m' : ''} à ${fmtPace(P[key])}/km (${KEY_TXT[key]}), récupération de ${rec} s en trottinant entre chaque effort`, work + (n - 1) * rec / P.rec), cdStep()],
      '7 sur 10', 'Garde exactement la même allure du premier au dernier effort, à la montée comme à la descente.', `${fmtPace(P[key])}/km`);
  }
  if (type === 'tempo') {
    const [r0, min, rec] = a, reps = scaleReps(r0, sc);
    const b = reps === 1 ? `${min} min continues à allure seuil (${fmtPace(P.seuil)}/km)` : `${reps} × ${min} min à allure seuil (${fmtPace(P.seuil)}/km), récupération de ${rec} min en trottinant`;
    return mk('seuil', reps === 1 ? `${min} min continues` : `${reps} × ${min} min`, [wuStep(P), body(b, reps * min * 60 / P.seuil + (reps - 1) * rec * 60 / P.rec), cdStep()],
      '7 sur 10, « confortablement dur »', 'Tu dois pouvoir dire quelques mots, pas tenir une conversation.', `${fmtPace(P.seuil)}/km`);
  }
  if (type === 'mpT') {
    const [r0, min, rec] = a, reps = scaleReps(r0, sc);
    return mk('mp', `${min} min continues`, [wuStep(P), body(`${min} min continues à allure marathon (${fmtPace(P.mp)}/km)`, reps * min * 60 / P.mp + (reps - 1) * rec * 60 / P.rec), cdStep()],
      '6 sur 10', 'Première prise de contact avec l\'allure du jour J : elle doit paraître contrôlée.', `${fmtPace(P.mp)}/km`);
  }
  if (type === 'prog') {
    const total = Math.round(a[0] * sc / 5) * 5, mpMin = a[1];
    return mk('prog', `${total} min, finale rapide`, [
      { t: 'Endurance', d: `${total - mpMin} min en endurance (${fmtPace(P.easyLo)} à ${fmtPace(P.easyHi)}/km)`, km: (total - mpMin) * 60 / P.easy },
      { t: 'Accélération', d: `${mpMin} min à allure marathon (${fmtPace(P.mp)}/km), en accélérant progressivement pendant les 3 premières minutes`, km: mpMin * 60 / P.mp },
      { t: 'Retour au calme', d: '5 min très faciles', km: 300 / P.rec }], '3 à 4 sur 10, puis 6 sur 10', 'Séance de qualité en douceur : tu finis plus vite que tu n\'as commencé, sans jamais forcer.', `${fmtPace(P.easy)} puis ${fmtPace(P.mp)}/km`);
  }
  const [r0, kmB, rec] = a, reps = scaleReps(r0, sc);
  return mk('mp', `${reps} × ${kmB} km`, [wuStep(P), body(`${reps} × ${kmB} km à allure marathon (${fmtPace(P.mp)}/km), récupération de ${rec} min en trottinant`, reps * kmB + (reps - 1) * rec * 60 / P.rec), cdStep()],
    '6 sur 10', 'Apprends cette allure : elle doit paraître contrôlée, presque facile au début.', `${fmtPace(P.mp)}/km`);
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

function buildWeek(n, P, cfg, scale = 1) {
  const start = addDays(PLAN_START, (n - 1) * 7), phase = phaseOf(n), rec = RECOVERY.includes(n);
  const qs = rec ? Math.min(scale, 0.8) : scale;
  const mode = cfg.sessionsMode === 'auto' ? (n <= 2 ? 4 : 5) : Number(cfg.sessionsMode);
  const days = {}; // index 0 = lundi
  if (n === 26) {
    if (mode === 5) days[0] = easyRun(P, 6, true);
    days[1] = mk('mp', '3 × 1 km', [wuStep(P),
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

function generate(cfg, ref, scales = {}) {
  const P = computePaces(ref, cfg.targetSec);
  return { P, weeks: Array.from({ length: N_WEEKS }, (_, i) => buildWeek(i + 1, P, cfg, scales[i + 1] || 1)) };
}

// ---------- Jour J ----------
function racePlan(T) {
  const mp = T / 42.195, slow = 5, q = (T - 5 * (mp + slow)) / (42.195 - 5);
  const f = km => km <= 5 ? km * (mp + slow) : 5 * (mp + slow) + (km - 5) * q;
  const marks = [5, 10, 15, 20, 21.0975, 25, 30, 35, 40, 42.195];
  return marks.map((km, i) => {
    const prev = i ? marks[i - 1] : 0;
    return { km, label: km === 21.0975 ? 'Semi' : km === 42.195 ? 'Arrivée' : `${km} km`, cum: f(km), pace: (f(km) - f(prev)) / (km - prev) };
  });
}
function fuelPlan(T, carbsPerH, gelCarbs) {
  const mp = T / 42.195, every = gelCarbs / carbsPerH * 3600, rows = [];
  for (let t = Math.min(every, 1800); ; t += every) { const km = t / mp; if (km > 39) break; rows.push({ time: t, km }); }
  return { rows, every, total: rows.length * gelCarbs };
}

return { RACE_DATE, PLAN_START, N_WEEKS, RECOVERY, toIso, addDays, diffDays, weekOf, todayIso, fmtPace, fmtTime, fmtClock, parseTime, riegel, computePaces, phaseOf, PHASE_LIST, KIND_LABEL, KIND_DEF, buildWeek, generate, racePlan, fuelPlan };
})();

const Store = (() => {
// Stockage local : IndexedDB, avec repli sur localStorage.
const DB = 'prepa-marathon-2027', STORE = 'kv', KEY = 'state';

const defaultState = () => ({
  v: 1,
  settings: { targetSec: 12000, startTime: '08:30', sessionsMode: 'auto', strength: true, carbsPerH: 60, gelCarbs: 25, reduceMotion: false },
  refs: [{ id: 'r0', date: null, distKm: 20, timeSec: 5460, label: '20 km de Tours' }],
  activeRef: 'r0',
  sess: {},       // { "12-1": { status, movedTo, doneDate, km, dur, rpe, hr, shoe, note } }
  weekScale: {},  // { 12: 0.8 }
  extras: [],     // sorties libres
  shoes: [],
  lastShoe: null,
  checklist: {},
});

const open = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

async function load() {
  try {
    const db = await open();
    const v = await new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    if (v) return merge(v);
  } catch (e) { /* repli */ }
  try { const raw = localStorage.getItem(KEY); if (raw) return merge(JSON.parse(raw)); } catch (e) { /* ignore */ }
  return defaultState();
}

const merge = v => { const d = defaultState(); return { ...d, ...v, settings: { ...d.settings, ...(v.settings || {}) } }; };

async function save(state) {
  try {
    const db = await open();
    await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(state, KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch (e) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e2) { console.warn('Sauvegarde impossible', e2); }
  }
}
const persist = () => navigator.storage && navigator.storage.persist ? navigator.storage.persist().catch(() => false) : false;

return { defaultState, load, merge, save, persist };
})();

const { fmtPace, fmtTime, fmtClock, parseTime, KIND_LABEL, KIND_DEF, RACE_DATE, N_WEEKS } = Plan;

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
const fmtDelta = x => x < 60 ? `${Math.round(x)} s` : fmtTime(x);
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
  if (s.pace !== undefined) return s.pace;
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
    <div class="row"><span class="pill solid" style="background:${phaseCol[w.phase.id]};color:${w.phase.id === 'base' || w.phase.id === 'spec' ? '#fff' : 'var(--on-bright)'}">${w.phase.name}${w.rec ? ', récupération' : ''}</span><span class="small"><b>${num(A[n])}</b> / ${num(Pl[n])} km${n === 26 ? ' (course incluse)' : ''}</span></div>
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
    <p>${diff > 0 ? `${fmtDelta(diff)} de plus que l'objectif` : `${fmtDelta(-diff)} de marge sur l'objectif`} de ${fmtTime(S.settings.targetSec)}. ${verdict}</p>
    <p class="small" style="opacity:.8">Calculée avec la formule de Riegel à partir de : ${esc(ref.label)}, ${num(ref.distKm)} km en ${fmtClock(ref.timeSec)}.</p>
    <div class="btns"><button class="btn yellow" data-action="add-ref">Ajouter un chrono test</button></div></section>
  <section class="card"><h3>Chronos de référence</h3><div class="reflist">${refs.map(r => `<label class="ref"><input type="radio" name="aref" value="${r.id}" data-change="setref" ${r.id === ref.id ? 'checked' : ''}><span><b>${esc(r.label)}</b><br><span class="small muted">${r.date ? dShort(r.date) : 'date non renseignée'}, ${num(r.distKm)} km en ${fmtClock(r.timeSec)}, soit ${fmtTime(Plan.riegel(r.timeSec, r.distKm, 42.195))} au marathon</span></span>${S.refs.length > 1 ? `<button class="x" data-action="del-ref" data-id="${r.id}" aria-label="Supprimer">×</button>` : '<span></span>'}</label>`).join('')}</div>
    <p class="small muted">La référence cochée détermine toutes les allures du plan.</p></section>
  <section class="card"><h3>Tes allures</h3><table>
    <tr><td>Footing facile</td><td>${fmtPace(P.easyLo)} à ${fmtPace(P.easyHi)}/km</td></tr>
    <tr><td>Allure marathon</td><td>${fmtPace(P.mp)}/km</td></tr>
    <tr><td>Seuil (allure 10 km)</td><td>${fmtPace(P.seuil)}/km</td></tr>
    <tr><td>Fractionné long (allure 3 km)</td><td>${fmtPace(P.vma2)}/km</td></tr>
    <tr><td>VMA (fractionné court)</td><td>${fmtPace(P.vma)}/km</td></tr>
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
  const tip = `<p class="tip">${esc(s.tip)}</p>`, def = KIND_DEF[s.kind] ? `<p class="small muted">${esc(KIND_DEF[s.kind])}</p>` : '';
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
  openSheet(head, `${info}${def}${tip}${steps}${action}`, s.kind);
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

})();
