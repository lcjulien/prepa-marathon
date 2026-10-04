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

// vmaKmh : VMA mesurée (test demi-Cooper). Sans test, la VMA est estimée à partir de la course de référence.
function computePaces(ref, targetSec, vmaKmh) {
  const predicted = riegel(ref.timeSec, ref.distKm, 42.195);
  const pm = predicted / 42.195;
  const t10 = riegel(ref.timeSec, ref.distKm, 10);
  const t5 = riegel(ref.timeSec, ref.distKm, 5);
  const vmaEst = (t5 / 5) * 0.925, measured = Number.isFinite(vmaKmh) && vmaKmh >= 8 && vmaKmh <= 28;
  const vma = measured ? 3600 / vmaKmh : vmaEst;
  return {
    predicted, predictedHalf: riegel(ref.timeSec, ref.distKm, 21.0975), t10, t5,
    vmaKmh: 3600 / vma, vmaMeasured: measured, vmaEstKmh: 3600 / vmaEst,
    // le seuil ne peut pas dépasser 92 % de la VMA, quelle que soit la course de référence
    mp: targetSec / 42.195, seuil: Math.max(t10 / 10, vma / 0.92), vma, vma2: vma / 0.96,
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

const KIND_LABEL = { easy: 'Footing', fartlek: 'Fartlek', court: 'Fractionné court', longfrac: 'Fractionné long', cotes: 'Côtes', pyramide: 'Pyramide', seuil: 'Seuil', mp: 'Allure marathon', prog: 'Progressif', long: 'Sortie longue', test: 'Semi test', cooper: 'Test VMA', race: 'Jour J', strength: 'Renfo' };
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
  cooper: 'Test demi-Cooper : tu cours 6 minutes à la vitesse maximale que tu peux tenir. La distance parcourue donne ta VMA (distance en mètres ÷ 100 = km/h), qui sert à calibrer toutes les allures de fractionné.',
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

const cooperSession = (P, retest) => mk('cooper', retest ? 'Demi-Cooper n°2' : 'Demi-Cooper n°1', [
  { t: 'Échauffement', d: `20 min de footing facile (${pr(P, 'easy')}), mobilité, éducatifs, puis 3 accélérations progressives de 30 s avec récupération complète`, km: 1200 / P.easy },
  { t: 'Test', d: '6 minutes à la vitesse la plus élevée que tu peux tenir de façon régulière, sur une piste de 400 m ou un terrain plat dont tu connais la distance. Note la distance parcourue en mètres : VMA (km/h) = distance ÷ 100', km: 360 / P.vma },
  { t: 'Retour au calme', d: '15 min de footing très facile, puis étirements légers', km: 900 / P.rec }],
  '10 sur 10, effort régulier du début à la fin',
  retest
    ? 'Même protocole que le premier test, si possible au même endroit et à la même heure, pour comparer. Semaine de récupération : tu arrives frais, c\'est le bon moment. Si le temps est mauvais (vent, pluie, sol glissant), décale le test d\'un ou deux jours dans la semaine plutôt que de fausser le résultat. Ensuite, saisis ta distance depuis cette fiche : les allures de VMA se recalculent pour la suite du plan.'
    : 'Veille en repos ou footing très facile. Pars à une allure que tu peux tenir 6 minutes entières : un départ trop rapide fausse le résultat. Évite le vent fort et les sols glissants. Ensuite, saisis ta distance depuis cette fiche : toutes tes allures de VMA se recalculent.',
  'Effort maximal régulier');

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
    const q1 = n === 1 || n === 12 ? cooperSession(P, n === 12) : quality(P, Q1[n], qs), q2 = quality(P, Q2[n], qs);
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

function generate(cfg, ref, scales = {}, vmaKmh = null) {
  const P = computePaces(ref, cfg.targetSec, vmaKmh);
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
// Glucides en course : la boisson d'effort apporte une part de l'objectif, les gels couvrent le reste.
function fuelPlan(T, carbsPerH, gelCarbs, drinkMl = 0, drinkPer100 = 0) {
  const mp = T / 42.195, hours = T / 3600;
  const drinkPerH = Math.max(0, drinkMl) * Math.max(0, drinkPer100) / 100;   // g/h apportés par la boisson
  const gelPerH = Math.max(0, carbsPerH - drinkPerH);                        // g/h restant à couvrir avec des gels
  const every = gelPerH >= 5 ? gelCarbs / gelPerH * 3600 : Infinity, rows = [];
  if (Number.isFinite(every)) for (let t = Math.min(every, 1800), i = 0; i < 40; t += every, i++) { const km = t / mp; if (!(km <= 39)) break; rows.push({ time: t, km }); }
  const gelTotal = rows.length * gelCarbs, drinkTotal = drinkPerH * hours, total = gelTotal + drinkTotal;
  return { rows, every, hours, drinkPerH, gelPerH, gelTotal, drinkTotal, drinkMlTotal: Math.max(0, drinkMl) * hours, total, perHour: total / hours };
}

return { RACE_DATE, PLAN_START, N_WEEKS, RECOVERY, toIso, addDays, diffDays, weekOf, todayIso, fmtPace, fmtTime, fmtClock, parseTime, riegel, computePaces, phaseOf, PHASE_LIST, KIND_LABEL, KIND_DEF, buildWeek, generate, racePlan, fuelPlan };
})();

const Store = (() => {
// Stockage local : IndexedDB, avec repli sur localStorage.
const DB = 'prepa-marathon-2027', STORE = 'kv', KEY = 'state';

const defaultState = () => ({
  v: 1,
  settings: { targetSec: 12000, startTime: '08:30', sessionsMode: 'auto', strength: true, carbsPerH: 60, gelCarbs: 25, drinkMl: 400, drinkCarbs: 6, reduceMotion: false },
  refs: [{ id: 'r0', date: '2026-09-27', distKm: 20, timeSec: 5460, label: '20 km de Tours' }],
  activeRef: 'r0',
  cooper: [],      // tests demi-Cooper : { id, date, distM }
  activeVma: null, // id du test utilisé pour les allures VMA (null = VMA estimée à partir de la course)
  sess: {},       // { "12-1": { status, movedTo, doneDate, km, dur, rpe, hr, shoe, note } }
  weekScale: {},  // { 12: 0.8 }
  extras: [],     // sorties libres
  shoes: [],
  lastShoe: null,
  checklist: {},
  lastExport: null,
});

let dbp = null;
const open = () => dbp || (dbp = new Promise((res, rej) => {
  try {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbp = null; }; res(r.result); };
    r.onerror = () => { dbp = null; rej(r.error); };
  } catch (e) { dbp = null; rej(e); }
}));
const idbGet = async () => { const db = await open(); return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };

async function load() {
  let v = null;
  try { v = await Promise.race([idbGet(), new Promise(r => setTimeout(() => r(null), 3000))]); } catch (e) { /* repli */ }
  if (!v) { try { const raw = localStorage.getItem(KEY); if (raw) v = JSON.parse(raw); } catch (e) { /* ignore */ } }
  return v ? merge(v) : defaultState();
}

// Valide et nettoie un état (stocké ou importé) pour qu'une donnée corrompue ne puisse jamais bloquer l'application.
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
const clampN = (v, d, lo, hi) => (v !== null && v !== '' && Number.isFinite(+v) && +v >= lo && +v <= hi) ? +v : d;
const merge = v => {
  const d = defaultState(); v = isObj(v) ? v : {};
  const settings = { ...d.settings, ...(isObj(v.settings) ? v.settings : {}) };
  settings.targetSec = clampN(settings.targetSec, d.settings.targetSec, 7200, 25200);
  settings.carbsPerH = clampN(settings.carbsPerH, 60, 30, 100);
  settings.gelCarbs = clampN(settings.gelCarbs, 25, 10, 60);
  settings.drinkMl = clampN(settings.drinkMl, 400, 0, 1200);
  settings.drinkCarbs = clampN(settings.drinkCarbs, 6, 0, 15);
  settings.sessionsMode = ['auto', '4', '5'].includes(String(settings.sessionsMode)) ? String(settings.sessionsMode) : 'auto';
  if (!/^\d{2}:\d{2}$/.test(String(settings.startTime))) settings.startTime = '08:30';
  settings.strength = settings.strength !== false; settings.reduceMotion = !!settings.reduceMotion;
  const out = { ...d, ...v, settings };
  let refs = Array.isArray(out.refs) ? out.refs.filter(r => isObj(r) && r.id && Number.isFinite(+r.distKm) && +r.distKm > 0 && Number.isFinite(+r.timeSec) && +r.timeSec > 300).map(r => ({ ...r, distKm: +r.distKm, timeSec: +r.timeSec, label: String(r.label || `${r.distKm} km`) })) : [];
  if (!refs.length) refs = d.refs;
  // Migration : date du 20 km de Tours (27 septembre 2026) pour les données déjà enregistrées
  out.refs = refs.map(r => r.id === 'r0' && !r.date ? { ...r, date: '2026-09-27' } : r);
  if (!out.refs.some(r => r.id === out.activeRef)) out.activeRef = out.refs[out.refs.length - 1].id;
  out.cooper = Array.isArray(out.cooper) ? out.cooper.filter(c => isObj(c) && c.id && Number.isFinite(+c.distM) && +c.distM >= 800 && +c.distM <= 3200).map(c => ({ ...c, distM: +c.distM, date: /^\d{4}-\d{2}-\d{2}$/.test(String(c.date)) ? c.date : null })) : [];
  if (!out.cooper.some(c => c.id === out.activeVma)) out.activeVma = null;
  out.sess = isObj(out.sess) ? out.sess : {}; out.weekScale = isObj(out.weekScale) ? out.weekScale : {}; out.checklist = isObj(out.checklist) ? out.checklist : {};
  out.extras = Array.isArray(out.extras) ? out.extras.filter(e => isObj(e) && Number.isFinite(+e.km) && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date))).map(e => ({ ...e, km: +e.km })) : [];
  out.shoes = Array.isArray(out.shoes) ? out.shoes.filter(h => isObj(h) && h.id && h.name).map(h => ({ ...h, startKm: Number(h.startKm) || 0, limitKm: Number(h.limitKm) > 0 ? Number(h.limitKm) : 700 })) : [];
  return out;
};

async function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* copie de secours seulement */ }
  try {
    const db = await open();
    await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(state, KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch (e) { console.warn('IndexedDB indisponible, copie locale utilisée', e); }
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
const fmtTarget = s => { const t = Math.round(s / 60); return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, '0')}`; };
const parseDur = v => { v = String(v || '').trim(); if (/^\d+$/.test(v)) return Number(v) * 60; return parseTime(v); };

// ---------- Données dérivées ----------
const activeRef = () => S.refs.find(r => r.id === S.activeRef) || S.refs[S.refs.length - 1];
const activeVmaTest = () => S.activeVma ? S.cooper.find(c => c.id === S.activeVma) || null : null;
const activeVmaKmh = () => { const t = activeVmaTest(); return t ? t.distM / 100 : null; };
const regen = () => { G = Plan.generate(S.settings, activeRef(), S.weekScale, activeVmaKmh()); };
// Demi-Cooper : distance en mètres (ou en km si < 20) ; VMA (km/h) = distance / 100
const parseCooper = v => { let d = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); if (d > 0 && d < 20) d *= 1000; return d >= 800 && d <= 3200 ? Math.round(d) : null; };
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
const pad2 = n => String(n).padStart(2, '0');
function countdown() {
  let t = new Date(`${RACE_DATE}T${String(S.settings.startTime || '08:30').slice(0, 5)}:00`);
  if (isNaN(t)) t = new Date(`${RACE_DATE}T08:30:00`);
  const ms = t - new Date();
  if (ms <= -7 * 36e5) return { d: 0, h: 0, m: 0, s: 0, over: true, live: false };   // plus de 7 h après le départ : course terminée
  if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0, over: false, live: true };           // course en cours
  return { d: Math.floor(ms / 864e5), h: Math.floor(ms % 864e5 / 36e5), m: Math.floor(ms % 36e5 / 6e4), s: Math.floor(ms % 6e4 / 1e3), over: false, live: false };
}
// Mise à jour à la seconde des seuls chiffres du compte à rebours (aucun rendu complet)
function updateCd() {
  const c = countdown();
  if ((c.live || c.over) && document.querySelector('[data-cd]')) { render(); return; }
  [['d', c.d], ['h', pad2(c.h)], ['m', pad2(c.m)], ['s', pad2(c.s)]].forEach(([key, v]) => { const el = document.querySelector(`[data-cd="${key}"]`); if (el && el.textContent !== String(v)) el.textContent = v; });
}
// Garde-fou : si les chiffres dépassent leur colonne (police de secours, texte agrandi), on réduit la taille jusqu'à ce que tout tienne
function fitCd() {
  const cd = document.querySelector('.cd'); if (!cd) return;
  cd.style.removeProperty('--cdf');
  let size = parseFloat(getComputedStyle(cd.querySelector('b')).fontSize) || 40, n = 0;
  const over = () => [...cd.children].some(c => c.scrollWidth > c.clientWidth + 1);
  while (over() && size > 18 && n++ < 30) { size *= 0.94; cd.style.setProperty('--cdf', size + 'px'); }
}
function tick() { if (G) renderTicker(); updateCd(); }

// ---------- Alertes ----------
function alerts() {
  const out = [], today = Plan.todayIso(), cw = curWeek(), started = today >= Plan.PLAN_START, A = actualByWeek(), Pl = plannedByWeek();
  if (!started || today > RACE_DATE) return out;
  const due = flat().filter(s => s.kind === 'cooper' && effDate(s) <= today && st(s.id).status !== 'missed').sort((x, y) => effDate(x).localeCompare(effDate(y)));
  if (due.length > S.cooper.length) out.push({ text: `Test demi-Cooper n°${S.cooper.length + 1} à enregistrer : saisis ta distance pour recalculer toutes tes allures de VMA.`, btn: 'Saisir le résultat', act: 'add-cooper', val: due[S.cooper.length].id });
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
    ${c.over ? '<h1 class="d" style="font-size:64px">C\'est fait.<br>Bravo.</h1>' : c.live ? '<h1 class="d" style="font-size:64px">C\'est parti.<br>Bonne course.</h1>' : `
    <div class="cd" role="timer" aria-label="Compte à rebours avant le départ">
      <div><b data-cd="d">${c.d}</b><span>jours</span></div><div><b data-cd="h">${pad2(c.h)}</b><span>heures</span></div><div><b data-cd="m">${pad2(c.m)}</b><span>minutes</span></div><div><b data-cd="s">${pad2(c.s)}</b><span>secondes</span></div>
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
      const ck = x.status === 'done', ms = x.status === 'missed';
      return `<div class="sesswrap"><button class="sess k-${s.kind} ${cls}" data-action="open" data-id="${s.id}"><span class="chip">${KIND_LABEL[s.kind]}</span><span class="t">${esc(s.title)}</span><span class="m">${s.km ? km(ck && x.km ? x.km : s.km) : '25 min'}${x.movedTo ? ', déplacée' : ''}${ms ? ', manquée' : ''}</span></button><button class="qcheck ${cls}" role="checkbox" aria-checked="${ck}" aria-label="Valider la séance : ${esc(s.title)}" data-action="quick" data-id="${s.id}">${ck ? '<svg class="ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg>' : ms ? '✕' : ''}</button></div>`;
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
  const cnt = sessionCounts(), started = today >= Plan.PLAN_START;
  const rate = cnt.due ? Math.round(cnt.done / cnt.due * 100) + ' %' : '—';
  const weeksDone = Array.from({ length: N_WEEKS }, (_, i) => i + 1).filter(n => { const r = sessionsOfWeek(n).filter(isRun); return r.length && r.every(s => st(s.id).status === 'done'); }).length;
  const kmTotal = progress().total;
  const refs = [...S.refs].sort((a, b) => (a.date || '0').localeCompare(b.date || '0'));
  return `
  <h2 class="sec-title">Prédiction</h2>
  <section class="pred"><p class="d" style="font-size:20px">Marathon prédit</p><p class="big-pred">${fmtTime(P.predicted)}</p>
    <p>${diff > 0 ? `${fmtDelta(diff)} de plus que l'objectif` : `${fmtDelta(-diff)} de marge sur l'objectif`} de ${fmtTime(S.settings.targetSec)}. ${verdict}</p>
    <p class="small" style="opacity:.8">Calculée avec la formule de Riegel à partir de : ${esc(ref.label)}, ${num(ref.distKm)} km en ${fmtClock(ref.timeSec)}.</p>
    <div class="btns"><button class="btn yellow" data-action="add-ref">Ajouter un chrono test</button><button class="btn yellow" data-action="add-cooper">Test demi-Cooper</button></div></section>
  <section class="card"><h3>Chronos de référence</h3><div class="reflist">${refs.map(r => `<label class="ref"><input type="radio" name="aref" value="${r.id}" data-change="setref" ${r.id === ref.id ? 'checked' : ''}><span><b>${esc(r.label)}</b><br><span class="small muted">${r.date ? dShort(r.date) : 'date non renseignée'}, ${num(r.distKm)} km en ${fmtClock(r.timeSec)}, soit ${fmtTime(Plan.riegel(r.timeSec, r.distKm, 42.195))} au marathon</span></span>${S.refs.length > 1 ? `<button class="x" data-action="del-ref" data-id="${r.id}" aria-label="Supprimer">×</button>` : '<span></span>'}</label>`).join('')}</div>
    <p class="small muted">La référence cochée détermine les allures de footing, de seuil et la prédiction.</p>
    <h3 style="margin-top:6px">VMA (demi-Cooper)</h3><div class="reflist">
      <label class="ref"><input type="radio" name="avma" value="" data-change="setvma" ${activeVmaTest() ? '' : 'checked'}><span><b>Estimée à partir de ta course</b><br><span class="small muted">${num(P.vmaEstKmh)} km/h, ${fmtPace(3600 / P.vmaEstKmh)}/km</span></span><span></span></label>
      ${[...S.cooper].sort((x, y) => (x.date || '0').localeCompare(y.date || '0')).map(c => `<label class="ref"><input type="radio" name="avma" value="${c.id}" data-change="setvma" ${activeVmaTest() && activeVmaTest().id === c.id ? 'checked' : ''}><span><b>Demi-Cooper, ${num(c.distM / 100)} km/h</b><br><span class="small muted">${c.date ? dShort(c.date) : 'date non renseignée'}, ${c.distM} m en 6 min, soit ${fmtPace(360000 / c.distM)}/km</span></span><button class="x" data-action="del-cooper" data-id="${c.id}" aria-label="Supprimer">×</button></label>`).join('')}
    </div>
    <p class="small muted">${S.cooper.length ? 'La VMA cochée règle les allures de tous les fractionnés et des côtes.' : 'Pas encore de test. Le demi-Cooper du mardi 6 octobre mesurera ta VMA : les allures de fractionné sont aujourd\'hui estimées à partir de ton 20 km.'}</p></section>
  <section class="card"><h3>Tes allures</h3><table>
    <tr><td>Footing facile</td><td>${fmtPace(P.easyLo)} à ${fmtPace(P.easyHi)}/km</td></tr>
    <tr><td>Allure marathon</td><td>${fmtPace(P.mp)}/km</td></tr>
    <tr><td>Seuil (allure 10 km)</td><td>${fmtPace(P.seuil)}/km</td></tr>
    <tr><td>Fractionné long (allure 3 km)</td><td>${fmtPace(P.vma2)}/km</td></tr>
    <tr><td>VMA, ${num(P.vmaKmh)} km/h (fractionné court)</td><td>${fmtPace(P.vma)}/km</td></tr>
    <tr><td>Récupération trottinée</td><td>${fmtPace(P.rec)}/km</td></tr></table>
    <p class="small muted">${P.vmaMeasured ? 'VMA mesurée au test demi-Cooper : les allures de fractionné en découlent.' : 'VMA estimée à partir de ta course. Le test demi-Cooper la rendra plus fiable.'}</p></section>
  <h2 class="sec-title">Volume</h2>
  <section class="card"><h3>Kilomètres par semaine</h3><div class="chart" id="chart1">${barChart(Pl, A, cw)}</div>
    <div class="legend"><span><i style="background:var(--orange)"></i>Réalisé</span><span><i style="border:2px solid var(--violet);background:none"></i>Prévu</span></div></section>
  <section class="card"><h3>Cumul</h3><div class="chart">${lineChart(Pl, A, cw)}</div>
    <div class="legend"><span><i style="background:var(--orange)"></i>Réalisé : ${Math.round(A.reduce((a, b) => a + b, 0))} km</span><span><i style="background:var(--violet)"></i>Prévu : ${Math.round(Pl.reduce((a, b) => a + b, 0))} km</span></div></section>
  <section class="card"><h3>Bilan</h3><div class="stats">
    <div class="stat"><b>${cnt.due ? `${cnt.done}/${cnt.due}` : cnt.done}</b><span>${cnt.due ? 'séances faites sur celles échues' : started ? 'séances faites, aucune échue pour l\'instant' : 'séance faite, le plan démarre le 5 octobre'}</span></div>
    <div class="stat"><b>${rate}</b><span>${cnt.due ? 'taux de réalisation' : 'taux de réalisation à venir'}</span></div>
    <div class="stat"><b>${num(kmTotal)} km</b><span>parcourus au total</span></div>
    <div class="stat"><b>${weeksDone}/${N_WEEKS}</b><span>semaines bouclées</span></div>
    <div class="stat"><b>${all.length ? num(Math.max(...all)) : 0} km</b><span>plus longue sortie</span></div>
    <div class="stat"><b>${num(Math.max(0, ...A))} km</b><span>meilleure semaine</span></div></div>
    <p class="small muted">${cnt.total} séances de course au programme, hors renforcement. Une séance validée est comptée tout de suite, même si elle est du jour ou à venir.</p></section>`;
}

const CHECK = [
  ['Dans les semaines qui précèdent', [['c1', 'Retirer le dossard (vérifier dates, lieu et pièces demandées sur le site officiel)'], ['c2', 'Tester tenue, gels et boisson sur au moins deux sorties longues'], ['c3', 'Choisir les chaussures et les porter sur 100 km minimum'], ['c4', 'Repérer le trajet jusqu\'au départ et les horaires de transports'], ['c5', 'Réserver l\'hébergement si besoin']]],
  ['La veille', [['v1', 'Préparer la tenue et épingler le dossard'], ['v2', 'Repas riche en glucides, rien de nouveau'], ['v3', 'Préparer les gels et la flasque'], ['v4', 'Charger la montre'], ['v5', 'Régler le réveil et se coucher tôt']]],
  ['Le matin', [['m1', 'Petit-déjeuner habituel environ 3 h avant le départ'], ['m2', 'Crème anti-frottements et pansements'], ['m3', 'Sac pour la consigne'], ['m4', 'Vêtement jetable pour patienter au départ'], ['m5', 'Échauffement léger de 10 minutes']]],
  ['Matériel', [['e1', 'Chaussures et chaussettes testées'], ['e2', 'Short ou collant, maillot'], ['e3', 'Casquette ou bandeau, lunettes'], ['e4', 'Montre ou chronomètre'], ['e5', 'Gels et boisson d\'effort (quantités du plan Nutrition)']]],
];

function viewRace() {
  const T = S.settings.targetSec, rp = Plan.racePlan(T), fp = Plan.fuelPlan(T, S.settings.carbsPerH, S.settings.gelCarbs, S.settings.drinkMl, S.settings.drinkCarbs), mp = T / 42.195;
  const all = CHECK.flatMap(g => g[1]), done = all.filter(i => S.checklist[i[0]]).length;
  return `
  <h2 class="sec-title">Stratégie d'allure</h2>
  <section class="card"><p>Objectif <b>${fmtTime(T)}</b>, soit <b>${fmtPace(mp)}/km</b> en moyenne. Pars <b>5 secondes par km plus lentement</b> sur les 5 premiers kilomètres, puis cale-toi sur ${fmtPace(rp[1].pace)}/km. À partir du 35e km, accélère seulement si les jambes répondent.</p>
    <table><tr><th>Repère</th><th>Allure</th><th>Passage</th></tr>${rp.map(r => `<tr><td>${r.label}</td><td>${fmtPace(r.pace)}/km</td><td><b>${fmtClock(r.cum)}</b></td></tr>`).join('')}</table>
    <p class="small muted">Le parcours 2027 n'est pas encore dévoilé. Ces passages sont calculés sur des kilomètres réguliers, à ajuster dès que le tracé sera publié.</p></section>
  <h2 class="sec-title">Nutrition</h2>
  <section class="card"><div class="fgrid">
    <label class="f">Glucides visés (g/heure)<input type="number" inputmode="numeric" min="30" max="100" value="${S.settings.carbsPerH}" data-change="carbsPerH"></label>
    <label class="f">Glucides par gel (g)<input type="number" inputmode="numeric" min="10" max="60" value="${S.settings.gelCarbs}" data-change="gelCarbs"></label>
    <label class="f">Boisson bue (ml par heure)<input type="number" inputmode="numeric" min="0" max="1200" step="50" value="${S.settings.drinkMl}" data-change="drinkMl"></label>
    <label class="f">Glucides de la boisson (g pour 100 ml)<input type="number" inputmode="decimal" min="0" max="15" step="0.5" value="${S.settings.drinkCarbs}" data-change="drinkCarbs"></label></div>
    <p class="small muted">Une boisson d'effort classique contient environ 6 g de glucides pour 100 ml. Mets 0 g si tu bois seulement de l'eau.</p>
    <table><tr><th>Source</th><th>Par heure</th><th>Sur ${fmtTime(T)}</th></tr>
      <tr><td>Boisson</td><td>${S.settings.drinkMl} ml, ${num(fp.drinkPerH)} g</td><td>${num(fp.drinkMlTotal / 1000)} L, ${Math.round(fp.drinkTotal)} g</td></tr>
      <tr><td>Gels</td><td>${fp.rows.length ? num(fp.gelTotal / fp.hours) : 0} g</td><td>${fp.rows.length} gel${fp.rows.length > 1 ? 's' : ''}, ${fp.gelTotal} g</td></tr>
      <tr><td><b>Total estimé</b></td><td><b>${Math.round(fp.perHour)} g</b></td><td><b>${Math.round(fp.total)} g</b></td></tr></table>
    <p>${fp.gelPerH < 5 ? `Ta boisson couvre déjà les <b>${S.settings.carbsPerH} g/h</b> visés : aucun gel n'est nécessaire. Garde-en un ou deux en secours.` : `Objectif de <b>${S.settings.carbsPerH} g/h</b> : la boisson apporte ${num(fp.drinkPerH)} g/h, il reste <b>${num(fp.gelPerH)} g/h</b> à couvrir avec des gels. Prévois <b>${fp.rows.length} gel${fp.rows.length > 1 ? 's' : ''}</b>, un toutes les ${Math.round(fp.every / 60)} minutes.`}${fp.perHour < S.settings.carbsPerH - 3 && fp.gelPerH >= 5 ? ` L'apport estimé (${Math.round(fp.perHour)} g/h) reste un peu sous l'objectif, car le premier gel est pris à 30 minutes et le dernier avant le km 39. Tu peux compenser avec la boisson ou un gel de plus.` : ''}</p>
    ${fp.rows.length ? `<table><tr><th>Gel</th><th>Chrono</th><th>Kilomètre</th></tr>${fp.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${fmtClock(r.time)}</td><td>${num(r.km)}</td></tr>`).join('')}</table>` : ''}
    <p class="small muted">Bois quelques gorgées à chaque ravitaillement, environ tous les 5 km. Vérifie sur le site de l'organisateur ce qui est proposé sur le parcours, et entraîne ton estomac sur tes sorties longues : ne teste rien de nouveau le jour de la course.${S.settings.carbsPerH > 90 ? ' Au-delà de 90 g/h, l\'estomac demande un entraînement progressif sur plusieurs semaines.' : ''}</p></section>
  <h2 class="sec-title">Check-list <span class="muted" style="font-size:22px">${done}/${all.length}</span></h2>
  ${CHECK.map(([g, items]) => `<section class="card"><h3>${g}</h3>${items.map(([id, t]) => `<label class="check"><input type="checkbox" data-change="check" data-id="${id}" ${S.checklist[id] ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</section>`).join('')}`;
}

function viewMore() {
  const s = S.settings;
  return `
  <h2 class="sec-title">Réglages</h2>
  <section class="card">
    <label class="f">Temps objectif (h:mm:ss)<input type="text" autocomplete="off" value="${fmtClock(s.targetSec)}" data-change="target"></label>
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
  <section class="card"><p class="small muted">Tes données restent sur cet appareil. Exporte-les régulièrement : vider les données du navigateur les efface. Dernier export : ${S.lastExport ? esc(dShort(S.lastExport)) : 'jamais'}.</p>
    <div class="btns"><button class="btn" data-action="export">Exporter en JSON</button><button class="btn ghost" data-action="import">Importer un fichier</button><button class="btn danger" data-action="reset">Tout effacer</button></div></section>`;
}

// ---------- Bandeau défilant : phrases construites à partir de tes données ----------
const SEPS = ['<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 0l1.8 5.2L14 7l-5.2 1.8L7 14l-1.8-5.2L0 7l5.2-1.8z" fill="currentColor"/></svg>', '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="currentColor"/></svg>', '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" rx="4" fill="currentColor"/></svg>'];
function tickerItems() {
  const c = countdown(), today = Plan.todayIso(), P = G.P, started = today >= Plan.PLAN_START;
  if (c.live) return ['C\'est le grand jour : bonne course', `Objectif ${fmtTime(S.settings.targetSec)} : ${fmtPace(P.mp)}/km`, 'Pars prudent, finis fort'];
  if (c.over) return ['Marathon de Paris terminé : bravo', `Chrono visé : ${fmtTime(S.settings.targetSec)}`, 'Place à la récupération'];
  const cw = curWeek(), w = G.weeks[cw - 1], A = actualByWeek(), Pl = plannedByWeek(), runs = flat().filter(isRun), items = [];
  items.push(today === RACE_DATE ? 'C\'est aujourd\'hui : bonne course' : c.d === 0 ? 'Départ demain : dernière nuit avant le grand jour' : c.d === 1 ? 'Plus qu\'un jour avant le départ' : `J-${c.d} avant le départ`);
  items.push(started ? `Semaine ${cw} sur ${N_WEEKS}, phase ${w.phase.name.toLowerCase()}${w.rec ? ', semaine de récupération' : ''}` : 'Le plan démarre lundi 5 octobre');
  const next = runs.filter(s => !st(s.id).status && effDate(s) >= today).sort((x, y) => effDate(x).localeCompare(effDate(y)))[0];
  if (next) {
    const d = effDate(next), day = d === today ? 'aujourd\'hui' : d === Plan.addDays(today, 1) ? 'demain' : dFmt(d, { weekday: 'long' });
    const txt = ['easy', 'long', 'test', 'cooper', 'race'].includes(next.kind) ? next.title : `${KIND_LABEL[next.kind]} ${next.title}`;
    items.push(`Prochaine séance : ${day}, ${txt.charAt(0).toLowerCase() + txt.slice(1)}`);
  }
  if (started) items.push(`Cette semaine : ${num(A[cw])} km sur ${num(Pl[cw])} prévus`);
  const total = runs.reduce((s, x) => s + (st(x.id).status === 'done' ? st(x.id).km || 0 : 0), 0) + S.extras.reduce((s, e) => s + e.km, 0);
  if (total > 0) items.push(`${Math.round(total)} km parcourus depuis le début`);
  else if (started) items.push('Aucune séance validée pour l\'instant : à toi de jouer');
  const cnt = sessionCounts();
  if (cnt.due) items.push(`${cnt.done} séance${cnt.done > 1 ? 's' : ''} validée${cnt.done > 1 ? 's' : ''} sur ${cnt.due} échue${cnt.due > 1 ? 's' : ''}`);
  items.push(`Objectif ${fmtTime(S.settings.targetSec)} : ${fmtPace(P.mp)}/km`);
  items.push(`VMA ${num(P.vmaKmh)} km/h, ${P.vmaMeasured ? 'mesurée au test' : 'estimée'}`);
  const diff = P.predicted - S.settings.targetSec;
  items.push(diff > 0 ? `Prédiction ${fmtTime(P.predicted)}, à ${fmtDelta(diff)} de l'objectif` : `Prédiction ${fmtTime(P.predicted)}, objectif à portée`);
  if (cw < 22) items.push(`Semi test dans ${22 - cw} semaine${22 - cw > 1 ? 's' : ''}`); else if (cw === 22) items.push('Semi test cette semaine');
  return items;
}
let tickerKey = '';
function renderTicker() {
  const items = tickerItems(), key = items.join('|'); if (key === tickerKey) return; tickerKey = key;
  const seg = items.map((t, i) => `<span>${esc(t)}</span>${SEPS[i % SEPS.length]}`).join(''), chars = items.join('').length;
  const reps = Math.max(1, Math.ceil(1800 / (chars * 9 + items.length * 40))), half = `<span>${seg.repeat(reps)}</span>`;
  const el = $('#ticker'); el.innerHTML = half + half; el.style.animationDuration = Math.max(30, chars * reps * 0.34) + 's';
}

// ---------- Retour visuel à la validation ----------
const CONF = ['#ff6400', '#f580c8', '#2447d0', '#6446c8', '#ffd60a', '#ffffff'];
const motionOK = () => !S.settings.reduceMotion && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function burst(el, n) {
  if (!motionOK() || !el) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const layer = document.createElement('div'); layer.className = 'confetti'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer);
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i'), size = 6 + Math.random() * 6, ang = Math.random() * Math.PI * 2, dist = 50 + Math.random() * (n > 20 ? 170 : 90);
    p.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size * (Math.random() < .5 ? 1 : .45)}px;background:${CONF[i % CONF.length]};border-radius:${Math.random() < .5 ? '50%' : '2px'}`;
    layer.appendChild(p);
    if (p.animate) p.animate([{ transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist + 70}px)) rotate(${Math.round(Math.random() * 540 - 270)}deg)`, opacity: 0 }], { duration: 750 + Math.random() * 500, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards' });
  }
  setTimeout(() => layer.remove(), 1600);
}
function celebrate(title, sub) {
  let c = $('#cele'); if (!c) { c = document.createElement('div'); c.id = 'cele'; c.setAttribute('role', 'status'); c.setAttribute('aria-live', 'polite'); document.body.appendChild(c); }
  c.innerHTML = `<strong class="d">${esc(title)}</strong><span>${esc(sub)}</span>`;
  c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
  clearTimeout(celebrate.t); celebrate.t = setTimeout(() => c.classList.remove('show'), 3800);
}
// Séances de course : « faites » = toutes celles validées (quelle que soit leur date) ;
// « échues » = les faites + celles dont la date est passée. Une séance du jour ou à venir non validée n'est pas encore échue.
function sessionCounts() {
  const today = Plan.todayIso(), runs = flat().filter(isRun), isDone = s => st(s.id).status === 'done';
  return { done: runs.filter(isDone).length, due: runs.filter(s => isDone(s) || effDate(s) < today).length, total: runs.length };
}
const progress = () => {
  const runs = flat().filter(isRun), done = runs.filter(s => st(s.id).status === 'done');
  return { total: done.reduce((n, s) => n + (st(s.id).km || 0), 0) + S.extras.reduce((n, e) => n + e.km, 0), count: done.length, longMax: Math.max(0, ...done.filter(s => s.kind === 'long').map(s => st(s.id).km || 0)) };
};
// À appeler juste après l'enregistrement d'une séance (avant commit). Retourne l'éventuelle célébration.
function validated(s, before) {
  const x = st(s.id), after = progress(), A = actualByWeek(), wk = Plan.weekOf(effDate(s)), wr = sessionsOfWeek(wk).filter(isRun);
  let c = null;
  if (s.kind === 'race') c = ['Marathon bouclé', 'Bravo, tu l\'as fait.'];
  else if (isRun(s) && wr.length && wr.every(z => st(z.id).status === 'done')) c = [`Semaine ${wk} bouclée`, `${km(A[wk])} parcourus, toutes les séances validées`];
  else if (s.kind === 'long' && before.longMax > 0 && x.km > before.longMax) c = ['Nouvelle plus longue sortie', `${km(x.km)}, ta meilleure de la préparation`];
  else {
    const m = [50, 100, 250, 500, 750, 1000, 1250, 1500].find(v => before.total < v && after.total >= v);
    if (m) c = [`${m} km parcourus`, 'Depuis le début de la préparation'];
    else if (isRun(s) && before.count === 0) c = ['Première séance validée', 'Le plus dur est fait : tu as commencé'];
  }
  ui.justDone = s.id; ui.burstN = c ? 36 : 14;
  if (navigator.vibrate) try { navigator.vibrate(c ? [20, 40, 20] : 15); } catch (e) { /* ignore */ }
  return c;
}
function afterRender() {
  if (!ui.justDone) return;
  const el = document.querySelector(`.qcheck[data-id="${ui.justDone}"]`), n = ui.burstN || 14; ui.justDone = null;
  if (!el || !motionOK()) return;
  el.classList.add('pop'); el.closest('.sesswrap').classList.add('bump'); burst(el, n);
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
  renderTicker();
  tick();
  if (ui.tab === 'home') fitCd();
  afterRender();
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
    <label class="f full">Date<input type="date" name="date" value="${d.date}"${d.bounded ? ` min="${Plan.PLAN_START}" max="${RACE_DATE}"` : ''}></label>
    ${d.strength ? '' : `<label class="f">Distance (km)<input type="number" name="km" inputmode="decimal" step="0.01" min="0" value="${d.km ?? ''}"></label>`}
    <label class="f ${d.strength ? 'full' : ''}">Durée (h:mm:ss ou minutes)<input type="text" name="dur" autocomplete="off" placeholder="1:05:00" value="${d.dur ? fmtClock(d.dur) : ''}"></label>
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
    action = `<form id="logform" onsubmit="return false">${logFields({ date: x.doneDate || (Plan.todayIso() < Plan.PLAN_START ? s.date : Plan.todayIso() > date ? date : Plan.todayIso()), km: x.km ?? (s.km ? Math.round(s.km * 10) / 10 : ''), dur: x.dur, rpe: x.rpe, hr: x.hr, shoe: x.shoe, note: x.note, strength, bounded: true })}</form><div class="btns"><button class="btn alt" data-action="save-log" data-id="${id}">Enregistrer</button><button class="btn ghost" data-action="open" data-id="${id}">Annuler</button></div>`;
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
  const lastT = [...S.cooper].sort((p, q) => (p.date || '0').localeCompare(q.date || '0')).pop();
  const coop = s.kind === 'cooper' && mode === 'view' ? `${lastT ? `<p class="small muted">Dernier test enregistré : ${lastT.date ? esc(dShort(lastT.date)) + ', ' : ''}${lastT.distM} m, soit ${num(lastT.distM / 100)} km/h.</p>` : ''}<div class="btns"><button class="btn yellow" data-action="add-cooper" data-id="${id}">Saisir ma distance du test</button></div>` : '';
  openSheet(head, `${info}${def}${tip}${steps}${coop}${action}`, s.kind);
}

function extraSheet() {
  openSheet('<strong class="big" style="font-size:38px;padding-right:44px">Sortie libre</strong><span class="when">Une course hors plan</span>', `<form id="logform" onsubmit="return false">${logFields({ date: Plan.todayIso(), km: '' })}</form><div class="btns"><button class="btn alt" data-action="save-extra">Enregistrer</button></div>`, 'easy');
}
function refSheet(type = 'race', sessionId = null) {
  ui.refSession = sessionId; const cooper = type === 'cooper', ses = sessionId && flat().find(x => x.id === sessionId);
  const sel = `<label class="f full">Type de test<select data-change="reftype"><option value="race" ${cooper ? '' : 'selected'}>Course ou chrono (5 km à marathon)</option><option value="cooper" ${cooper ? 'selected' : ''}>Test demi-Cooper (6 minutes)</option></select></label>`;
  const dflt = ses && Plan.todayIso() >= Plan.PLAN_START && Plan.todayIso() <= RACE_DATE ? Plan.todayIso() : (ses ? ses.date : Plan.todayIso());
  const fields = cooper ? `
    <label class="f full">Date du test<input type="date" name="date" value="${dflt}"></label>
    <label class="f full">Distance parcourue en 6 minutes (mètres)<input type="text" name="distm" inputmode="decimal" autocomplete="off" placeholder="1650" data-input="coopprev"></label>
    <p class="small muted full" id="cooprev">Formule : VMA (km/h) = distance en mètres ÷ 100.</p>
    <label class="toggle full">Utiliser pour les allures de VMA<input type="checkbox" name="use" checked></label>` : `
    <label class="f full">Nom<input type="text" name="label" placeholder="10 km de…"></label>
    <label class="f">Date<input type="date" name="date" value="${Plan.todayIso()}"></label>
    <label class="f">Distance<select name="dist"><option value="5">5 km</option><option value="10">10 km</option><option value="15">15 km</option><option value="20">20 km</option><option value="21.0975">Semi-marathon</option><option value="42.195">Marathon</option></select></label>
    <label class="f full">Temps (h:mm:ss ou mm:ss)<input type="text" name="time" autocomplete="off" placeholder="1:35:00"></label>
    <label class="toggle full">Utiliser comme référence du plan<input type="checkbox" name="use" checked></label>`;
  openSheet(`<strong class="big" style="font-size:38px;padding-right:44px">${cooper ? 'Test demi-Cooper' : 'Chrono test'}</strong><span class="when">${cooper ? 'Mesure ta VMA' : 'Course ou test récent'}</span>`,
    `<form id="refform" onsubmit="return false"><div class="fgrid">${sel}${fields}</div></form><div class="btns"><button class="btn alt" data-action="${cooper ? 'save-cooper' : 'save-ref'}">Enregistrer</button></div>`, 'test');
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
  quick: el => {
    const s = flat().find(x => x.id === el.dataset.id), x = st(s.id);
    if (x.status === 'done') {
      if ((x.dur || x.rpe || x.hr || x.note) && !confirm('Décocher cette séance effacera les détails enregistrés (durée, ressenti, notes). Continuer ?')) return;
      const y = { ...x }; ['status', 'km', 'dur', 'rpe', 'hr', 'shoe', 'note', 'doneDate'].forEach(k => delete y[k]); S.sess[s.id] = y;
      commit(); toast('Séance décochée'); return;
    }
    const strength = s.kind === 'strength', plannedKm = strength ? 0 : Math.round(s.km * 10) / 10;
    const shoe = !strength && (x.shoe || (S.shoes.some(z => z.id === S.lastShoe && !z.retired) ? S.lastShoe : null));
    const before = progress();
    S.sess[s.id] = { ...x, status: 'done', doneDate: effDate(s), km: x.km ?? plannedKm, ...(shoe ? { shoe } : {}) };
    const cele = validated(s, before);
    commit(); if (cele) celebrate(...cele); else toast(strength ? 'Séance validée' : `Séance validée : ${km(S.sess[s.id].km)}`);
  },
  'save-log': el => { const s = flat().find(x => x.id === el.dataset.id), v = readLog($('#logform'), s.kind === 'strength'); if (!v) return; if (v.doneDate < Plan.PLAN_START || v.doneDate > RACE_DATE) { toast('Choisis une date entre le 5 octobre 2026 et le 4 avril 2027'); return; } const was = st(s.id).status === 'done', before = progress(); S.sess[s.id] = { ...st(s.id), ...v, status: 'done' }; if (v.shoe) S.lastShoe = v.shoe; const cele = was ? null : validated(s, before); closeSheet(); commit(); if (cele) celebrate(...cele); else toast('Séance enregistrée'); },
  'save-move': el => { const d = $('#movedate').value; if (!d) return; if (d < Plan.PLAN_START || d > RACE_DATE) { toast('Choisis une date entre le 5 octobre 2026 et le 4 avril 2027'); return; } S.sess[el.dataset.id] = { ...st(el.dataset.id), movedTo: d }; closeSheet(); commit(); toast('Séance déplacée'); },
  unmove: el => { const x = { ...st(el.dataset.id) }; delete x.movedTo; S.sess[el.dataset.id] = x; closeSheet(); commit(); },
  miss: el => { S.sess[el.dataset.id] = { ...st(el.dataset.id), status: 'missed' }; closeSheet(); commit(); toast('Séance marquée comme manquée'); },
  clear: el => { const x = { ...st(el.dataset.id) }; ['status', 'km', 'dur', 'rpe', 'hr', 'shoe', 'note', 'doneDate'].forEach(k => delete x[k]); S.sess[el.dataset.id] = x; closeSheet(); commit(); },
  'add-run': extraSheet,
  'save-extra': () => { const v = readLog($('#logform'), false); if (!v) return; if (!v.km) { toast('Indique une distance'); return; } S.extras.push({ id: uid(), date: v.doneDate, km: v.km, dur: v.dur, rpe: v.rpe, hr: v.hr, shoe: v.shoe, note: v.note }); if (v.shoe) S.lastShoe = v.shoe; closeSheet(); commit(); toast('Sortie ajoutée'); },
  'add-ref': () => refSheet('race'),
  'add-cooper': el => refSheet('cooper', el && (el.dataset.id || el.dataset.val) || null),
  'save-cooper': () => {
    const f = $('#refform'), g = n => f.querySelector(`[name=${n}]`), d = parseCooper(g('distm').value);
    if (!d) { toast('Distance invalide : entre 800 et 3 200 m (exemple : 1650)'); return; }
    const date = g('date').value || Plan.todayIso(), use = g('use').checked, before = G.P.vmaKmh, sid = ui.refSession, s = sid && flat().find(x => x.id === sid);
    const t = { id: uid(), date, distM: d }; S.cooper.push(t); if (use) S.activeVma = t.id;
    if (s && st(sid).status !== 'done') S.sess[sid] = { ...st(sid), status: 'done', doneDate: date >= Plan.PLAN_START && date <= RACE_DATE ? date : s.date, km: Math.round(s.km * 10) / 10, note: st(sid).note || `Distance du test : ${d} m` };
    ui.refSession = null; closeSheet(); commit(false);
    if (use) celebrate(`VMA : ${num(d / 100)} km/h`, `${fmtPace(360000 / d)}/km. Avant : ${num(before)} km/h (${d / 100 >= before ? '+' : '−'}${num(Math.abs(d / 100 - before))}). Les allures de VMA sont recalculées.`); else toast('Test enregistré');
  },
  'del-cooper': el => { if (!confirm('Supprimer ce test ? Les allures de VMA seront recalculées.')) return; S.cooper = S.cooper.filter(c => c.id !== el.dataset.id); if (S.activeVma === el.dataset.id) S.activeVma = null; commit(); },
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
  export: async () => {
    const name = `prepa-marathon-${Plan.todayIso()}.json`, markDone = () => { S.lastExport = Plan.todayIso(); Store.save(S); };
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Sauvegarde Prépa Marathon' }); markDone(); toast('Sauvegarde partagée'); render(); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    markDone(); toast('Sauvegarde exportée'); render();
  },
  import: () => $('#import-file').click(),
  reset: () => { if (confirm('Effacer toutes tes données ? Cette action est définitive.')) { S = Store.defaultState(); commit(false); go('home'); toast('Données effacées'); } },
};
// Séances déjà renseignées qui n'existeraient plus avec de nouveaux réglages du plan
const orphans = ns => { const ids = new Set(Plan.generate(ns, activeRef(), S.weekScale, activeVmaKmh()).weeks.flatMap(w => w.sessions.map(s => s.id))); return Object.keys(S.sess).filter(id => S.sess[id] && S.sess[id].status && !ids.has(id)); };
function applySetting(key, val) {
  const ns = { ...S.settings, [key]: val }, o = orphans(ns);
  if (o.length && !confirm(`Ce réglage retire ${o.length} séance${o.length > 1 ? 's' : ''} déjà renseignée${o.length > 1 ? 's' : ''} du plan. Leurs données sont conservées et réapparaîtront si tu reviens au réglage précédent. Continuer ?`)) { render(); return; }
  S.settings = ns; commit();
}
const C = {
  setvma: el => { S.activeVma = el.value || null; commit(); toast('Allures de VMA recalculées'); },
  reftype: el => refSheet(el.value, ui.refSession),
  setref: el => { S.activeRef = el.value; commit(); toast('Allures recalculées'); },
  target: el => { const t = parseTime(el.value); if (isNaN(t) || t < 7200 || t > 25200) { toast('Temps invalide. Exemple : 3:20:00'); render(); return; } S.settings.targetSec = t; commit(); },
  startTime: el => { S.settings.startTime = /^\d{2}:\d{2}/.test(el.value) ? el.value.slice(0, 5) : '08:30'; commit(); },
  mode: el => applySetting('sessionsMode', el.value),
  strength: el => applySetting('strength', el.checked),
  motion: el => { S.settings.reduceMotion = el.checked; commit(); },
  carbsPerH: el => { S.settings.carbsPerH = Math.min(100, Math.max(30, Number(el.value) || 60)); commit(); },
  gelCarbs: el => { S.settings.gelCarbs = Math.min(60, Math.max(10, Number(el.value) || 25)); commit(); },
  drinkMl: el => { const v = parseFloat(String(el.value).replace(',', '.')); S.settings.drinkMl = Math.min(1200, Math.max(0, Number.isFinite(v) ? Math.round(v) : 400)); commit(); },
  drinkCarbs: el => { const v = parseFloat(String(el.value).replace(',', '.')); S.settings.drinkCarbs = Math.min(15, Math.max(0, Number.isFinite(v) ? Math.round(v * 10) / 10 : 6)); commit(); },
  check: el => { S.checklist[el.dataset.id] = el.checked; commit(); },
};

document.addEventListener('click', e => {
  if (e.target === sheet()) return closeSheet();
  const el = e.target.closest('[data-action]'); if (el && A[el.dataset.action]) A[el.dataset.action](el);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]'); if (!el || el.dataset.input !== 'coopprev') return;
  const d = parseCooper(el.value), out = $('#cooprev'); if (out) out.textContent = d ? `VMA : ${num(d / 100)} km/h, soit ${fmtPace(360000 / d)}/km` : 'Formule : VMA (km/h) = distance en mètres ÷ 100.';
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
  render();
  let sec = 0; setInterval(() => { if (document.hidden) return; updateCd(); if (++sec % 20 === 0) tick(); }, 1000);
  window.addEventListener('resize', () => { if (ui.tab === 'home') fitCd(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (ui.tab === 'home') fitCd(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); if (ui.tab === 'home') render(); } });
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller; let reloading = false;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      if (sheet().open) { toast('Mise à jour installée : ferme cette fiche et recharge la page'); return; }
      reloading = true; toast('Mise à jour installée, rechargement…'); setTimeout(() => location.reload(), 900);
    });
  }
}
init();

})();
