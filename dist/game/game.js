(() => {
'use strict';

/* ------------------------------------------------------------------ */
/*  canvas + helpers                                                   */
/* ------------------------------------------------------------------ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
let VW = 1, VH = 1;

function resize() {
  VW = Math.max(320, window.innerWidth);
  VH = Math.max(320, window.innerHeight);
  canvas.width = Math.floor(VW * DPR);
  canvas.height = Math.floor(VH * DPR);
  canvas.style.width = VW + 'px';
  canvas.style.height = VH + 'px';
}
window.addEventListener('resize', resize);
resize();

const TAU = Math.PI * 2;
const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const normAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
const $ = (id) => document.getElementById(id);

const el = {
  hud: $('hud'), topbar: $('topbar'), mobile: $('mobile'), bossWrap: $('bossWrap'),
  hpFill: $('hpFill'), hpText: $('hpText'), xpFill: $('xpFill'), xpText: $('xpText'),
  levelChip: $('levelChip'), dashChip: $('dashChip'), timeText: $('timeText'),
  stageText: $('stageText'), waveText: $('waveText'), shieldChip: $('shieldChip'), scoreText: $('scoreText'), killsText: $('killsText'),
  comboText: $('comboText'), bossName: $('bossName'), bossHpText: $('bossHpText'),
  bossFill: $('bossFill'), banner: $('banner'), bannerTitle: $('bannerTitle'),
  bannerSub: $('bannerSub'), cards: $('cards'), levelNum: $('levelNum'),
  rerollBtn: $('rerollBtn'), rerollHint: $('rerollHint'), muteBtn: $('muteBtn'),
  pauseBtn: $('pauseBtn'), joy: $('joy'), joyKnob: $('joyKnob'), dashBtn: $('dashBtn'),
  bestScore: $('bestScore'), bestTime: $('bestTime'),
  bossGrid: $('bossGrid'), bossBtn: $('bossBtn'), bossBack: $('bossBack'), tutorialStart: $('tutorialStart')
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  if (id) $(id).classList.remove('hidden');
}
function hideScreens() { document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden')); }
function setHud(on) {
  el.hud.classList.toggle('hidden', !on);
  el.topbar.classList.toggle('hidden', !on);
  el.mobile.classList.toggle('hidden', !on);
  if (!on) el.bossWrap.classList.add('hidden');
}
function formatTime(t) {
  t = Math.max(0, Math.floor(t));
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

/* ------------------------------------------------------------------ */
/*  storage + procedural audio                                         */
/* ------------------------------------------------------------------ */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
};

let AC = null, masterGain = null;
let muted = !!store.get('neon-muted', false);

function audioInit() {
  if (!AC) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    AC = new Ctx();
    masterGain = AC.createGain();
    masterGain.gain.value = muted ? 0 : 0.55;
    masterGain.connect(AC.destination);
  }
  if (AC.state === 'suspended') AC.resume();
}
function tone(freq, end, dur, type, vol, delay) {
  if (!AC || muted) return;
  const t = AC.currentTime + (delay || 0);
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(Math.max(20, freq), t);
  if (end != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.03), t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(masterGain);
  o.start(t);
  o.stop(t + dur + 0.03);
}
const sfx = {
  shoot() { tone(760, 520, 0.045, 'square', 0.012); },
  hit() { tone(160, 90, 0.045, 'triangle', 0.02); },
  gem() { tone(1050, 1500, 0.055, 'sine', 0.022); },
  hurt() { tone(120, 52, 0.2, 'sawtooth', 0.07); },
  dash() { tone(280, 760, 0.12, 'sine', 0.045); },
  level() { [523, 659, 784].forEach((f, i) => tone(f, f, 0.16, 'triangle', 0.035, i * 0.07)); },
  stage() { [392, 523, 659, 784].forEach((f, i) => tone(f, f, 0.24, 'triangle', 0.038, i * 0.09)); },
  boss() { tone(70, 42, 0.55, 'sawtooth', 0.075); tone(140, 80, 0.4, 'square', 0.025, 0.04); },
  explode() { tone(90, 34, 0.22, 'sawtooth', 0.05); },
  missile() { tone(480, 880, 0.1, 'square', 0.018); },
  pickup() { tone(620, 920, 0.1, 'triangle', 0.04); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.5, 'triangle', 0.045, i * 0.12)); },
  lose() { tone(220, 60, 0.9, 'sawtooth', 0.055); }
};
function toggleMute() {
  muted = !muted;
  store.set('neon-muted', muted);
  if (masterGain) masterGain.gain.value = muted ? 0 : 0.55;
  el.muteBtn.textContent = muted ? '×' : '♪';
  el.muteBtn.classList.toggle('off', muted);
}

/* ------------------------------------------------------------------ */
/*  world / state                                                      */
/* ------------------------------------------------------------------ */
const WORLD = { w: 4200, h: 2800 };
const STAGE_WAVE_TIME = 44;
const STAGES = [
  { name: '碎裂回廊', boss: '裂隙守卫', pattern: 'rift', color: '#c084fc', accent: '#ff3d8b', bg0: '#090716', bg1: '#04050f', grid: 'rgba(118,90,255,0.075)', gridMajor: 'rgba(160,130,255,0.12)', bullet: '#ff5c8a', hazard: 'none', table: ['grunt', 'swift', 'grunt'] },
  { name: '蜂巢苗圃', boss: '蜂巢母体', pattern: 'hive', color: '#a3e635', accent: '#84cc16', bg0: '#07120a', bg1: '#040b06', grid: 'rgba(132,204,22,0.065)', gridMajor: 'rgba(163,230,53,0.11)', bullet: '#d9f99d', hazard: 'none', table: ['grunt', 'swift', 'orbiter', 'gunner'] },
  { name: '熔核铸造厂', boss: '熔核巨像', pattern: 'forge', color: '#fb923c', accent: '#f97316', bg0: '#150906', bg1: '#0b0403', grid: 'rgba(251,146,60,0.075)', gridMajor: 'rgba(251,146,60,0.12)', bullet: '#ff9f43', hazard: 'ember', table: ['grunt', 'brute', 'gunner', 'bomber'] },
  { name: '虚空织机', boss: '虚空织者', pattern: 'weaver', color: '#8b5cf6', accent: '#a78bfa', bg0: '#0b0718', bg1: '#05030d', grid: 'rgba(139,92,246,0.08)', gridMajor: 'rgba(167,139,250,0.13)', bullet: '#c084fc', hazard: 'void', table: ['swift', 'gunner', 'sniper', 'orbiter'] },
  { name: '霜蚀棱镜', boss: '霜蚀棱镜', pattern: 'prism', color: '#38bdf8', accent: '#7dd3fc', bg0: '#061019', bg1: '#03080e', grid: 'rgba(56,189,248,0.075)', gridMajor: 'rgba(125,211,252,0.12)', bullet: '#7dd3fc', hazard: 'frost', table: ['gunner', 'brute', 'sniper', 'swift'] },
  { name: '雷暴天线', boss: '雷暴核心', pattern: 'storm', color: '#facc15', accent: '#fde047', bg0: '#141005', bg1: '#0a0802', grid: 'rgba(250,204,21,0.07)', gridMajor: 'rgba(253,224,71,0.12)', bullet: '#fde047', hazard: 'none', table: ['swift', 'orbiter', 'bomber', 'gunner'] },
  { name: '镜像剧场', boss: '镜像双子', pattern: 'twin', color: '#f472b6', accent: '#fb7185', bg0: '#140712', bg1: '#0a040b', grid: 'rgba(244,114,182,0.075)', gridMajor: 'rgba(251,113,133,0.12)', bullet: '#f9a8d4', hazard: 'void', table: ['sniper', 'swift', 'brute', 'gunner'] },
  { name: '终焉之门', boss: '终焉核心', pattern: 'final', color: '#ff3d8b', accent: '#ff3d8b', bg0: '#16040e', bg1: '#0a0208', grid: 'rgba(255,61,139,0.08)', gridMajor: 'rgba(255,92,138,0.13)', bullet: '#ff5c8a', hazard: 'ember', table: ['brute', 'bomber', 'sniper', 'orbiter', 'swift'] }
];
const BOSS_HP = [6000, 10000, 15000, 21000, 28000, 37000, 48000, 20000000000];
const STAGE_QUOTAS = [24, 32, 40, 48, 58, 68, 80, 92];
const MAX_ENEMIES = 100;
const BOSS_RADIUS = [58, 64, 70, 60, 62, 66, 58, 86];
const BOSS_SPEED = [42, 34, 46, 54, 38, 48, 58, 52];

const game = {
  state: 'title', time: 0, stageIndex: 0, stageClock: 0, stageBossSpawned: false,
  stageQuota: 0, stageKills: 0, stageSpawned: 0,
  intermission: 0, hazardTimer: 5, boss: null, finishTimer: 0,
  spawnTimer: 1.2, eliteTimer: 55, score: 0, kills: 0, combo: 1, comboTimer: 0,
  shake: 0, flash: 0, hudClock: 0, pendingLevels: 0, levelRerolls: 1,
  choices: [], enemyId: 0, levelTimer: null, lastGemSfx: 0, totalStages: STAGES.length,
  challengeMode: false, challengeStage: -1,
  quality: 'high', slowTime: 0, crashReported: false, mirrorTime: 0,
  hiveTouchTimer: 0, hiveDotTime: 0, voidActive: false, voidNeed: 0, voidKills: 0, voidReturn: null, voidExitTimer: 0
};

function makePlayer() {
  return {
    x: WORLD.w / 2, y: WORLD.h / 2, r: 15, speed: 255,
    hp: 100, maxHp: 100,
    level: 1, xp: 0, xpNext: 8,
    dmgMul: 1, fireRateMul: 1, bulletSpeed: 900, crit: 0.05,
    multi: 0, pierce: 0, magnet: 150, armor: 0, xpMul: 1,
    lifesteal: 0, thorns: 0, dashCdBonus: 1, scoreMul: 1,
    slowAura: 0, berserk: false,
    upg: {},
    pulseTimer: 0.15, missileTimer: 1.4, chainTimer: 1.6, novaTimer: 2.2,
    orbAngle: 0, moveX: 0, moveY: 0, aim: 0,
    invuln: 0, dashCd: 0, dashTime: 0, dashX: 1, dashY: 0, overdrive: 0,
    beamTimer: 3.2, droneTimer: 1.1, droneAngle: 0,
    shield: 0, shieldMax: 0, shieldTimer: 12,
    slowTime: 0, turretTimer: 8, overchargeTimer: 16
  };
}
let player = makePlayer();

const enemies = [], bullets = [], ebullets = [], gems = [], pickups = [];
const particles = [], texts = [], waves = [], lightnings = [], hazards = [], beams = [], beamFx = [], turrets = [];
const portals = [], strikes = [], sectors = [];
const stars = Array.from({ length: 280 }, () => ({
  x: rnd(WORLD.w), y: rnd(WORLD.h), r: rnd(1.5, 0.35), a: rnd(0.5, 0.1), p: rnd(TAU)
}));
const cam = { x: 0, y: 0 };

function dashMax() { return 2.1 * player.dashCdBonus; }

/* ------------------------------------------------------------------ */
/*  upgrades                                                           */
/* ------------------------------------------------------------------ */
const UPGRADES = [
  { id: 'power', icon: '✦', name: '过载弹芯', tag: '脉冲', desc: '脉冲伤害 +28%', max: 8, weight: 10, apply() { player.dmgMul *= 1.28; } },
  { id: 'rate', icon: '⚡', name: '超频回路', tag: '脉冲', desc: '射速 +18%', max: 8, weight: 10, apply() { player.fireRateMul *= 1.18; } },
  { id: 'multi', icon: '⋔', name: '分裂枪管', tag: '脉冲', desc: '每轮脉冲弹 +1', max: 4, weight: 5, apply() { player.multi += 1; } },
  { id: 'pierce', icon: '➤', name: '穿甲弹头', tag: '脉冲', desc: '子弹穿透 +1', max: 3, weight: 7, apply() { player.pierce += 1; } },
  { id: 'crit', icon: '◎', name: '临界瞄准', tag: '脉冲', desc: '暴击率 +8%', max: 5, weight: 7, apply() { player.crit = Math.min(0.75, player.crit + 0.08); } },
  { id: 'speed', icon: '⇢', name: '矢量推进', tag: '生存', desc: '移动速度 +8%', max: 5, weight: 9, apply() { player.speed *= 1.08; } },
  { id: 'vitality', icon: '❤', name: '扩容装甲', tag: '生存', desc: '最大生命 +25 并回复 25', max: 5, weight: 9, apply() { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); } },
  { id: 'armor', icon: '▣', name: '相位镀层', tag: '生存', desc: '受到伤害 -1', max: 4, weight: 6, apply() { player.armor += 1; } },
  { id: 'magnet', icon: '⌁', name: '磁力线圈', tag: '生存', desc: '拾取范围 +35%', max: 4, weight: 8, apply() { player.magnet *= 1.35; } },
  { id: 'xp', icon: '◇', name: '数据嗅觉', tag: '成长', desc: '经验获取 +20%', max: 3, weight: 7, apply() { player.xpMul *= 1.2; } },
  { id: 'orb', icon: '◈', name: '轨道刃', tag: '武器', desc: '增加一把环绕刀刃', max: 5, weight: 7, apply() { /* counted via upg */ } },
  { id: 'missile', icon: '➹', name: '追猎导弹', tag: '武器', desc: '增加一枚追踪导弹', max: 4, weight: 6, apply() { /* counted via upg */ } },
  { id: 'chain', icon: '⌇', name: '链式电弧', tag: '武器', desc: '电弧 +1 跳，伤害提升', max: 4, weight: 6, apply() { /* counted via upg */ } },
  { id: 'nova', icon: '◎', name: '脉冲新星', tag: '武器', desc: '周期释放范围冲击波', max: 4, weight: 6, apply() { /* counted via upg */ } },
  { id: 'lifesteal', icon: '†', name: '吸血协议', tag: '生存', desc: '每次击杀回复 0.5 生命', max: 3, weight: 4, apply() { player.lifesteal += 0.5; } },
  { id: 'dashcd', icon: '⟳', name: '冷却超频', tag: '机动', desc: '冲刺冷却 -15%', max: 4, weight: 7, apply() { player.dashCdBonus *= 0.85; } },
  { id: 'dashblast', icon: '✹', name: '冲刺过载', tag: '机动', desc: '冲刺结束引发范围爆炸', max: 3, weight: 5, apply() { /* counted via upg */ } },
  { id: 'velocity', icon: '➟', name: '加速弹道', tag: '脉冲', desc: '子弹速度 +20%', max: 3, weight: 6, apply() { player.bulletSpeed *= 1.2; } },
  { id: 'greed', icon: '¤', name: '赏金协议', tag: '成长', desc: '获得分数 +20%', max: 3, weight: 5, apply() { player.scoreMul += 0.2; } },
  { id: 'berserk', icon: '☠', name: '背水一战', tag: '生存', desc: '生命低于 35% 时射速 +35%', max: 1, weight: 3, apply() { player.berserk = true; } },
  { id: 'thorns', icon: '✕', name: '反伤力场', tag: '生存', desc: '接触你的敌人受到 8 伤害', max: 3, weight: 3, apply() { player.thorns += 8; } },
  { id: 'slow', icon: '∿', name: '熵减场', tag: '控制', desc: '敌人移动速度 -6%', max: 3, weight: 4, apply() { player.slowAura = Math.min(0.3, player.slowAura + 0.06); } },
  { id: 'beam', icon: '▰', name: '棱镜射线', tag: '武器', desc: '周期发射贯穿射线', max: 4, weight: 6, apply() { player.beamTimer = Math.min(player.beamTimer, 1.2); } },
  { id: 'drone', icon: '◇', name: '僚机编队', tag: '武器', desc: '环绕僚机自动射击', max: 3, weight: 6, apply() { player.droneTimer = Math.min(player.droneTimer, 0.5); } },
  { id: 'ricochet', icon: '↺', name: '跳弹弹头', tag: '脉冲', desc: '脉冲子弹 +1 次弹射', max: 3, weight: 6, apply() {} },
  { id: 'frost', icon: '❄', name: '霜冻弹头', tag: '控制', desc: '脉冲命中减速 35%', max: 3, weight: 5, apply() {} },
  { id: 'poison', icon: '☣', name: '腐蚀弹头', tag: '脉冲', desc: '脉冲命中附加持续伤害', max: 3, weight: 5, apply() {} },
  { id: 'shield', icon: '⬡', name: '护盾电容', tag: '生存', desc: '获得 1 层自动充能护盾', max: 3, weight: 5, apply() { player.shieldMax += 1; player.shield = player.shieldMax; player.shieldTimer = 12; } },
  { id: 'chainexplode', icon: '✹', name: '连锁殉爆', tag: '武器', desc: '击杀敌人时引发爆炸', max: 3, weight: 5, apply() {} },
  { id: 'critexplode', icon: '✧', name: '暴击奇点', tag: '脉冲', desc: '暴击产生小范围爆炸', max: 2, weight: 4, apply() {} },
  { id: 'execute', icon: '⌖', name: '处决协议', tag: '脉冲', desc: '对低血量敌人伤害 +25%', max: 3, weight: 4, apply() {} },
  { id: 'turret', icon: '▣', name: '部署炮台', tag: '武器', desc: '周期部署自动炮台', max: 3, weight: 5, apply() { player.turretTimer = Math.min(player.turretTimer, 0.8); } },
  { id: 'overcharge', icon: '⚡', name: '超载核心', tag: '成长', desc: '周期进入超载射速状态', max: 3, weight: 4, apply() { player.overchargeTimer = Math.min(player.overchargeTimer, 1.2); } }
];
const FALLBACKS = [
  { id: '_heal', icon: '＋', name: '应急修复', tag: '补给', desc: '回复 35 生命', max: 99, weight: 1, special: true },
  { id: '_score', icon: '¤', name: '赏金缓存', tag: '补给', desc: '立即获得 500 分', max: 99, weight: 1, special: true }
];

function pickUpgrades(n) {
  const pool = UPGRADES.filter((u) => (player.upg[u.id] || 0) < u.max);
  const out = [];
  while (out.length < n && pool.length) {
    let total = 0;
    for (const u of pool) total += u.weight;
    let r = Math.random() * total, idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) { idx = i; break; }
    }
    out.push(pool.splice(idx, 1)[0]);
  }
  while (out.length < n) out.push(FALLBACKS[out.length % FALLBACKS.length]);
  return out;
}

/* ------------------------------------------------------------------ */
/*  UI flow                                                            */
/* ------------------------------------------------------------------ */
let bannerTimer = null;
let hudBest = store.get('neon-best', { score: 0, time: 0 });

function updateBestDisplay() {
  el.bestScore.textContent = (hudBest.score || 0).toLocaleString();
  el.bestTime.textContent = formatTime(hudBest.time || 0);
}
function showBanner(title, sub, color) {
  color = color || '#67e8f9';
  el.bannerTitle.textContent = title;
  el.bannerSub.textContent = sub || '';
  el.banner.style.setProperty('--bannerColor', color);
  el.banner.style.setProperty('--bannerGlow', hexA(color, 0.42));
  el.banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2450);
}
function hideBanner() { el.banner.classList.remove('show'); clearTimeout(bannerTimer); }

function startGame() {
  audioInit();
  game.challengeMode = false;
  game.challengeStage = -1;
  resetGame();
  hideScreens();
  setHud(true);
  game.state = 'playing';
  startStage(0, true);
  updateHud();
}
function resetGame() {
  if (game.levelTimer) { clearTimeout(game.levelTimer); game.levelTimer = null; }
  player = makePlayer();
  enemies.length = 0; bullets.length = 0; ebullets.length = 0;
  gems.length = 0; pickups.length = 0; particles.length = 0; texts.length = 0;
  waves.length = 0; lightnings.length = 0; hazards.length = 0; beams.length = 0; beamFx.length = 0; turrets.length = 0;
  portals.length = 0; strikes.length = 0; sectors.length = 0;
  game.state = 'playing';
  game.time = 0; game.score = 0; game.kills = 0; game.combo = 1; game.comboTimer = 0;
  game.stageIndex = 0; game.stageClock = 0; game.stageQuota = 0; game.stageKills = 0; game.stageSpawned = 0;
  game.stageBossSpawned = false; game.intermission = 0;
  game.hazardTimer = 5; game.spawnTimer = 0.65; game.eliteTimer = 55; game.boss = null;
  game.finishTimer = 0; game.shake = 0; game.flash = 0; game.hudClock = 0;
  game.pendingLevels = 0; game.levelRerolls = 1; game.choices = []; game.enemyId = 0;
  game.lastGemSfx = 0;
  game.quality = 'high'; game.slowTime = 0; game.crashReported = false; game.mirrorTime = 0;
  game.hiveTouchTimer = 0; game.hiveDotTime = 0; game.voidActive = false; game.voidNeed = 0; game.voidKills = 0; game.voidReturn = null; game.voidExitTimer = 0;
  cam.x = clamp(player.x - VW / 2, 0, Math.max(0, WORLD.w - VW));
  cam.y = clamp(player.y - VH / 2, 0, Math.max(0, WORLD.h - VH));
  hideBossBar();
  hideBanner();
  updateHud();
}
function renderBossCards() {
  if (!el.bossGrid) return;
  el.bossGrid.innerHTML = STAGES.map((s, i) => {
    const hp = i === STAGES.length - 1 ? '200亿 HP' : BOSS_HP[i].toLocaleString() + ' HP';
    const lv = 8 + i * 2;
    return '<button class="boss-card' + (i === STAGES.length - 1 ? ' final' : '') + '" data-stage="' + i + '">' +
      '<span class="boss-stage">S' + (i + 1) + (i === STAGES.length - 1 ? ' // FINAL' : '') + '</span>' +
      '<strong>' + s.boss + '</strong>' +
      '<small>' + s.name + ' · ' + hp + '</small>' +
      '<small>预设等级 LV.' + lv + '</small>' +
      '<span class="boss-go">立即挑战 →</span>' +
      '</button>';
  }).join('');
}
function configureChallengePlayer(index) {
  const level = 8 + index * 2;
  player.level = level;
  player.xp = 0;
  player.xpNext = Math.floor(8 * Math.pow(1.16, level - 1));
  player.dmgMul = Math.pow(1.025, level - 1);
  const grant = (id, count) => {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u) return;
    for (let i = 0; i < count && (player.upg[id] || 0) < u.max; i++) applyUpgrade(u);
  };
  grant('power', 4 + Math.floor(index / 2));
  grant('rate', 3 + Math.floor(index / 3));
  grant('multi', 1 + Math.floor(index / 2));
  grant('crit', 2);
  grant('pierce', 1);
  grant('speed', 2);
  grant('vitality', 3);
  grant('armor', 1);
  grant('magnet', 2);
  grant('dashcd', 2);
  grant('missile', 1 + Math.floor(index / 3));
  grant('orb', 1 + Math.floor(index / 2));
  grant('chain', 1 + Math.floor(index / 3));
  grant('nova', 1);
  grant('beam', 1 + Math.floor(index / 3));
  grant('drone', 1);
  grant('turret', 1);
  grant('shield', 1);
  grant('lifesteal', 1);
  grant('overcharge', 1);
  player.hp = player.maxHp;
  player.shield = player.shieldMax;
  player.pendingLevels = 0;
}
function startBossChallenge(index) {
  if (!STAGES[index]) return;
  audioInit();
  resetGame();
  game.challengeMode = true;
  game.challengeStage = index;
  game.stageIndex = index;
  game.stageClock = STAGE_WAVE_TIME;
  game.stageBossSpawned = false;
  game.intermission = 0;
  configureChallengePlayer(index);
  enemies.length = 0;
  ebullets.length = 0;
  hazards.length = 0;
  beams.length = 0;
  hideScreens();
  setHud(true);
  game.state = 'playing';
  spawnBoss(index);
  game.stageBossSpawned = true;
  updateHud();
}
function restartRun() {
  if (game.challengeMode && game.challengeStage >= 0) startBossChallenge(game.challengeStage);
  else startGame();
}
function startStage(index, first) {
  const st = STAGES[index];
  if (!st) return;
  game.stageIndex = index;
  game.stageClock = 0;
  game.stageQuota = STAGE_QUOTAS[index] || 24;
  game.stageKills = 0;
  game.stageSpawned = 0;
  game.mirrorTime = 0;
  game.stageBossSpawned = false;
  game.intermission = 0;
  game.boss = null;
  game.spawnTimer = 0.7;
  game.eliteTimer = 16 + index * 2;
  game.hazardTimer = 5;
  enemies.length = 0;
  ebullets.length = 0;
  hazards.length = 0;
  beams.length = 0;
  beamFx.length = 0;
  portals.length = 0; strikes.length = 0; sectors.length = 0;
  game.hiveTouchTimer = 0; game.hiveDotTime = 0; game.voidActive = false; game.voidNeed = 0; game.voidKills = 0; game.voidReturn = null; game.voidExitTimer = 0;
  hideBossBar();
  if (!first) {
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.16);
    game.score += 800 * index;
    floatText(player.x, player.y - 32, 'SECTOR CLEAR +' + (800 * index), '#5eead4');
  }
  document.documentElement.style.setProperty('--stageAccent', st.accent);
  showBanner('STAGE ' + (index + 1) + ' / ' + STAGES.length + ' // ' + st.name,
    '清空 ' + game.stageQuota + ' 个敌人后挑战 Boss' + (first ? '' : ' // ' + st.boss), st.accent);
  const initial = Math.min(3 + Math.min(2, index), game.stageQuota);
  for (let i = 0; i < initial; i++) {
    const p = spawnPointNear();
    const e = spawnEnemy(pick(st.table), p.x, p.y);
    if (e) game.stageSpawned += 1;
  }
  sfx.stage();
  updateHud();
}
function goTitle() {
  if (game.levelTimer) { clearTimeout(game.levelTimer); game.levelTimer = null; }
  game.state = 'title';
  game.challengeMode = false;
  game.challengeStage = -1;
  game.quality = 'high'; game.slowTime = 0; game.crashReported = false; game.mirrorTime = 0;
  game.boss = null;
  enemies.length = 0; bullets.length = 0; ebullets.length = 0; gems.length = 0;
  pickups.length = 0; particles.length = 0; texts.length = 0; waves.length = 0; lightnings.length = 0;
  hazards.length = 0; beams.length = 0; beamFx.length = 0; turrets.length = 0;
  portals.length = 0; strikes.length = 0; sectors.length = 0;
  game.hiveTouchTimer = 0; game.hiveDotTime = 0; game.voidActive = false; game.voidNeed = 0; game.voidKills = 0; game.voidReturn = null; game.voidExitTimer = 0;
  game.stageIndex = 0; game.stageClock = 0; game.stageQuota = 0; game.stageKills = 0; game.stageSpawned = 0;
  game.stageBossSpawned = false; game.intermission = 0;
  player = makePlayer();
  cam.x = clamp(player.x - VW / 2, 0, Math.max(0, WORLD.w - VW));
  cam.y = clamp(player.y - VH / 2, 0, Math.max(0, WORLD.h - VH));
  hideScreens(); showScreen('title'); setHud(false); hideBossBar(); hideBanner();
  updateBestDisplay();
}
function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  const h = document.querySelector('#pause h2');
  const p = document.querySelector('#pause .muted');
  h.textContent = '已暂停';
  p.textContent = '喘口气。荒原不会等你太久。';
  showScreen('pause');
}
function resumeGame() {
  if (game.state !== 'paused') return;
  game.crashReported = false;
  if (game.pendingLevels > 0) { openLevelUp(); }
  else { hideScreens(); game.state = 'playing'; }
}
function endGame(victory) {
  if (game.state === 'gameover' || game.state === 'victory') return;
  clearTimeout(game.levelTimer);
  game.levelTimer = null;
  const challenge = game.challengeMode;
  game.state = victory ? 'victory' : 'gameover';
  game.mirrorTime = 0;
  game.hiveDotTime = 0;
  game.hiveTouchTimer = 0;
  game.voidActive = false;
  game.voidNeed = 0;
  game.voidKills = 0;
  game.voidReturn = null;
  game.voidExitTimer = 0;
  setHud(false);
  hideScreens();
  hideBossBar();
  hideBanner();
  if (!challenge) {
    const best = store.get('neon-best', { score: 0, time: 0 });
    if (game.score > (best.score || 0)) best.score = game.score;
    if (game.time > (best.time || 0)) best.time = game.time;
    store.set('neon-best', best);
    hudBest = best;
    updateBestDisplay();
  }
  if (victory) {
    $('winTime').textContent = formatTime(game.time);
    $('winKills').textContent = game.kills;
    $('winScore').textContent = game.score.toLocaleString();
    $('winLevel').textContent = player.level;
    const vh = document.querySelector('#victory h2');
    const vp = document.querySelector('#victory .muted');
    if (challenge) {
      vh.textContent = 'Boss 已击破';
      vp.textContent = '挑战成功。核心已经熄灭。';
    } else {
      vh.textContent = '八区已净化';
      vp.textContent = '八颗核心全部熄灭。荒原第一次迎来安静。';
    }
    showScreen('victory');
    sfx.win();
  } else {
    $('goTime').textContent = formatTime(game.time);
    $('goKills').textContent = game.kills;
    $('goScore').textContent = game.score.toLocaleString();
    $('goLevel').textContent = player.level;
    const gh = document.querySelector('#gameover h2');
    const gp = document.querySelector('#gameover .muted');
    if (challenge) {
      gh.textContent = '挑战失败';
      gp.textContent = '核心仍在运转。再试一次。';
    } else {
      gh.textContent = '信号中断';
      gp.textContent = '你的数据残片仍留在荒原里。';
    }
    showScreen('gameover');
    sfx.lose();
  }
}

function openLevelUp() {
  if (game.state !== 'playing') return;
  game.state = 'levelup';
  game.levelRerolls = 1;
  game.choices = pickUpgrades(3);
  el.levelNum.textContent = player.level;
  renderCards();
  updateRerollButton();
  showScreen('levelup');
  sfx.level();
}
function renderCards() {
  el.cards.innerHTML = game.choices.map((u, i) => {
    const lv = player.upg[u.id] || 0;
    const rarity = u.special ? 'common' : u.weight >= 9 ? 'common' : u.weight >= 6 ? 'rare' : 'epic';
    const levelText = u.special ? '补给模块' : 'LV ' + lv + ' / ' + u.max;
    return '<button class="card ' + rarity + '" data-id="' + u.id + '">' +
      '<span class="card-key">' + (i + 1) + '</span>' +
      '<span class="card-icon">' + u.icon + '</span>' +
      '<span class="card-tag">' + u.tag + '</span>' +
      '<strong>' + u.name + '</strong>' +
      '<span class="card-desc">' + u.desc + '</span>' +
      '<span class="card-level">' + levelText + '</span>' +
      '</button>';
  }).join('');
}
function updateRerollButton() {
  el.rerollBtn.disabled = game.levelRerolls <= 0;
  el.rerollBtn.innerHTML = '刷新 <kbd>R</kbd> (' + game.levelRerolls + ')';
  el.rerollHint.textContent = game.levelRerolls > 0 ? '每级可刷新一次' : '刷新次数已用尽';
}
function rerollChoices() {
  if (game.state !== 'levelup' || game.levelRerolls <= 0) return;
  game.levelRerolls = 0;
  game.choices = pickUpgrades(3);
  renderCards();
  updateRerollButton();
  sfx.pickup();
}
function applyUpgrade(u) {
  if (!u) return;
  if (u.special) {
    if (u.id === '_heal') heal(35);
    if (u.id === '_score') { game.score += 500; floatText(player.x, player.y - 30, '+500', '#fbbf24'); }
    return;
  }
  player.upg[u.id] = (player.upg[u.id] || 0) + 1;
  u.apply();
}
function chooseUpgrade(id) {
  if (game.state !== 'levelup') return;
  const u = UPGRADES.find((x) => x.id === id) || FALLBACKS.find((x) => x.id === id);
  if (!u) return;
  applyUpgrade(u);
  game.pendingLevels = Math.max(0, game.pendingLevels - 1);
  game.choices = [];
  hideScreens();
  game.state = 'playing';
  updateHud();
  sfx.pickup();
  if (game.pendingLevels > 0) {
    game.levelTimer = setTimeout(() => {
      game.levelTimer = null;
      if (game.state === 'playing' && game.pendingLevels > 0) openLevelUp();
    }, 280);
  }
}
function gainXp(amount) {
  if (game.state === 'gameover' || game.state === 'victory') return;
  player.xp += amount * player.xpMul;
  let leveled = false;
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext;
    player.level += 1;
    player.dmgMul *= 1.025;
    player.xpNext = Math.floor(8 * Math.pow(1.16, player.level - 1));
    game.pendingLevels += 1;
    leveled = true;
  }
  if (leveled) {
    player.hp = Math.min(player.maxHp, player.hp + 3);
    if (game.state === 'playing') openLevelUp();
  }
}
function heal(n) {
  player.hp = Math.min(player.maxHp, player.hp + n);
  floatText(player.x, player.y - 28, '+' + Math.round(n), '#5eead4');
}

/* ------------------------------------------------------------------ */
/*  HUD                                                                */
/* ------------------------------------------------------------------ */
function updateHud() {
  const hp = clamp(player.hp / player.maxHp, 0, 1);
  el.hpFill.style.width = (hp * 100).toFixed(1) + '%';
  el.hpText.textContent = Math.ceil(player.hp) + ' / ' + player.maxHp;
  const xp = clamp(player.xp / player.xpNext, 0, 1);
  el.xpFill.style.width = (xp * 100).toFixed(1) + '%';
  el.xpText.textContent = 'XP ' + Math.floor(player.xp) + ' / ' + player.xpNext;
  el.levelChip.textContent = 'LV.' + player.level;
  if (player.dashCd <= 0) { el.dashChip.textContent = '冲刺就绪'; el.dashChip.classList.remove('dim'); }
  else { el.dashChip.textContent = '冲刺 ' + player.dashCd.toFixed(1) + 's'; el.dashChip.classList.add('dim'); }
  el.timeText.textContent = formatTime(game.time);
  el.stageText.textContent = game.voidActive ? 'VOID DOMAIN' : 'STAGE ' + (game.stageIndex + 1) + ' / ' + STAGES.length;
  const stageName = STAGES[game.stageIndex].name;
  if (game.voidActive) {
    el.waveText.textContent = '击杀 ' + game.voidKills + ' / ' + game.voidNeed;
  } else if (game.challengeMode) {
    el.waveText.textContent = stageName + ' · BOSS';
  } else {
    const quota = game.stageQuota || STAGE_QUOTAS[game.stageIndex] || 0;
    el.waveText.textContent = stageName + ' · ' + Math.min(game.stageKills, quota) + ' / ' + quota;
  }
  const bossActive = !!(game.boss && !game.boss.dead);
  const stageHidden = bossActive && !game.voidActive;
  el.stageText.style.visibility = stageHidden ? 'hidden' : 'visible';
  el.waveText.style.visibility = stageHidden ? 'hidden' : 'visible';
  if (player.shieldMax > 0) {
    el.shieldChip.classList.remove('hidden');
    el.shieldChip.textContent = '护盾 ' + player.shield + ' / ' + player.shieldMax;
  } else {
    el.shieldChip.classList.add('hidden');
  }
  el.scoreText.textContent = Math.floor(game.score).toLocaleString();
  el.killsText.textContent = game.kills;
  if (game.combo > 1.05) {
    el.comboText.textContent = 'x' + game.combo.toFixed(1) + ' COMBO';
    el.comboText.classList.remove('hidden');
  } else {
    el.comboText.classList.add('hidden');
  }
  if (game.boss && !game.boss.dead && !game.voidActive) {
    el.bossWrap.classList.remove('hidden');
    const rawP = game.boss.hp / game.boss.maxHp;
    const p = Number.isFinite(rawP) ? clamp(rawP, 0, 1) : 0;
    el.bossFill.style.width = (p * 100).toFixed(2) + '%';
    el.bossHpText.textContent = Number.isFinite(game.boss.hp)
      ? Math.max(0, Math.ceil(game.boss.hp)).toLocaleString() + ' HP'
      : '-- HP';
  } else {
    el.bossWrap.classList.add('hidden');
  }
}
function showBossBar(e) {
  el.bossName.textContent = 'S' + (game.stageIndex + 1) + ' // ' + e.name + (e.final ? ' // FINAL' : '');
  el.bossHpText.textContent = e.maxHp.toLocaleString() + ' HP';
  el.bossFill.style.width = '100%';
  el.bossFill.style.background = 'linear-gradient(90deg,' + e.color + ',#ffe4ef)';
  el.bossWrap.classList.remove('hidden');
}
function hideBossBar() { el.bossWrap.classList.add('hidden'); }

/* ------------------------------------------------------------------ */
/*  input                                                              */
/* ------------------------------------------------------------------ */
const keys = Object.create(null);
const joy = { active: false, id: null, dx: 0, dy: 0, max: 42 };

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'Enter' && !$('tutorial').classList.contains('hidden')) { showScreen('title'); return; }
  if (e.code === 'Enter' && (game.state === 'title' || game.state === 'gameover' || game.state === 'victory') && $('bossSelect').classList.contains('hidden')) restartRun();
  if (e.code === 'Escape') {
    if (game.state === 'playing') pauseGame();
    else if (game.state === 'paused') resumeGame();
    else if (game.state === 'title' && !$('bossSelect').classList.contains('hidden')) showScreen('title');
    else if (game.state === 'title' && !$('tutorial').classList.contains('hidden')) showScreen('title');
  }
  if (e.code === 'Space') tryDash();
  if (e.code === 'KeyM') toggleMute();
  if (game.state === 'levelup') {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
    if (n !== undefined && game.choices[n]) chooseUpgrade(game.choices[n].id);
    if (e.code === 'KeyR') rerollChoices();
  }
  if (e.code === 'KeyR' && (game.state === 'gameover' || game.state === 'victory')) restartRun();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  if (game.state === 'playing') pauseGame();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') pauseGame();
});

function updateJoy(e) {
  const r = el.joy.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = e.clientX - cx, dy = e.clientY - cy;
  const d = Math.hypot(dx, dy) || 1;
  const f = Math.min(1, d / joy.max);
  joy.dx = (dx / d) * f;
  joy.dy = (dy / d) * f;
  el.joyKnob.style.transform = 'translate(' + (dx / d) * f * joy.max + 'px,' + (dy / d) * f * joy.max + 'px)';
}
el.joy.addEventListener('pointerdown', (e) => {
  if (game.state !== 'playing') return;
  e.preventDefault();
  joy.active = true;
  joy.id = e.pointerId;
  try { el.joy.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  updateJoy(e);
});
el.joy.addEventListener('pointermove', (e) => {
  if (joy.active && e.pointerId === joy.id) updateJoy(e);
});
function endJoy(e) {
  if (e.pointerId !== joy.id) return;
  joy.active = false; joy.id = null; joy.dx = 0; joy.dy = 0;
  el.joyKnob.style.transform = 'translate(0,0)';
}
el.joy.addEventListener('pointerup', endJoy);
el.joy.addEventListener('pointercancel', endJoy);
el.dashBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); tryDash(); });
window.addEventListener('contextmenu', (e) => e.preventDefault());

$('startBtn').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', resumeGame);
$('pauseBtn').addEventListener('click', pauseGame);
$('muteBtn').addEventListener('click', toggleMute);
$('quitBtn').addEventListener('click', goTitle);
$('menuBtn').addEventListener('click', goTitle);
$('winMenuBtn').addEventListener('click', goTitle);
$('againBtn').addEventListener('click', restartRun);
$('winAgainBtn').addEventListener('click', restartRun);
$('tutorialStart').addEventListener('click', () => showScreen('title'));
$('bossBtn').addEventListener('click', () => { renderBossCards(); showScreen('bossSelect'); });
$('bossBack').addEventListener('click', () => showScreen('title'));
el.bossGrid.addEventListener('click', (e) => { const card = e.target.closest('.boss-card'); if (card) startBossChallenge(Number(card.dataset.stage)); });
el.rerollBtn.addEventListener('click', rerollChoices);
el.cards.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) chooseUpgrade(card.dataset.id);
});
el.muteBtn.textContent = muted ? '×' : '♪';
el.muteBtn.classList.toggle('off', muted);

/* ------------------------------------------------------------------ */
/*  queries                                                            */
/* ------------------------------------------------------------------ */
function nearestEnemy(x, y, maxDist) {
  let best = null, bd = (maxDist || 99999) * (maxDist || 99999);
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.boss && game.voidActive) continue;
    const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function nearestFrom(x, y, maxDist, exclude) {
  let best = null, bd = maxDist * maxDist;
  for (const e of enemies) {
    if (e.dead || exclude.has(e.id)) continue;
    const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/*  player actions                                                     */
/* ------------------------------------------------------------------ */
function tryDash() {
  if (game.state !== 'playing' || player.dashCd > 0 || player.dashTime > 0) return;
  let dx = player.moveX, dy = player.moveY;
  if (!dx && !dy) {
    const t = nearestEnemy(player.x, player.y, 1100);
    if (t) { dx = t.x - player.x; dy = t.y - player.y; }
    else { dx = Math.cos(player.aim); dy = Math.sin(player.aim); }
  }
  const d = Math.hypot(dx, dy) || 1;
  player.dashX = dx / d; player.dashY = dy / d;
  player.dashTime = 0.16;
  player.dashCd = dashMax();
  player.invuln = Math.max(player.invuln, 0.38);
  game.shake = Math.max(game.shake, 6);
  burst(player.x, player.y, '#67e8f9', 14, 220, 3);
  sfx.dash();
}

function firePulse() {
  const t = nearestEnemy(player.x, player.y, aimRange());
  if (!t) return false;
  const base = Math.atan2(t.y - player.y, t.x - player.x);
  player.aim = base;
  const count = 1 + player.multi;
  const dmgBase = 22 * player.dmgMul * (1 - player.multi * 0.06);
  for (let i = 0; i < count; i++) {
    const a = base + (i - (count - 1) / 2) * 0.12;
    const crit = Math.random() < player.crit;
    const dmg = dmgBase * (crit ? 2 : 1);
    bullets.push({
      type: 'bullet', x: player.x + Math.cos(a) * 18, y: player.y + Math.sin(a) * 18,
      vx: Math.cos(a) * player.bulletSpeed, vy: Math.sin(a) * player.bulletSpeed,
      r: crit ? 5.5 : 4, dmg, pierce: player.pierce, life: 1.5, hit: [],
      crit, color: crit ? '#fde68a' : '#7ff7ff',
      bounces: player.upg.ricochet || 0,
      frost: player.upg.frost || 0,
      poison: player.upg.poison || 0
    });
    particles.push({ x: player.x + Math.cos(a) * 20, y: player.y + Math.sin(a) * 20, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, life: 0.18, maxLife: 0.18, size: 3, color: '#a5f3fc' });
  }
  sfx.shoot();
  return true;
}
function fireMissiles() {
  const lvl = player.upg.missile || 0;
  if (!lvl) return;
  const list = enemies.filter((e) => !e.dead).sort((a, b) => dist2(a, player) - dist2(b, player)).slice(0, lvl);
  if (!list.length) return;
  list.forEach((target, i) => {
    const a = player.aim + (i - (list.length - 1) / 2) * 0.24;
    bullets.push({
      type: 'rocket', x: player.x + Math.cos(a) * 16, y: player.y + Math.sin(a) * 16,
      vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, angle: a, speed: 390,
      target, dmg: (48 + 16 * lvl) * player.dmgMul, life: 3, r: 6,
      trail: 0, color: '#fbbf24'
    });
  });
  sfx.missile();
}
function castChain() {
  const lvl = player.upg.chain || 0;
  if (!lvl) return;
  let current = nearestEnemy(player.x, player.y, 1000);
  if (!current) return;
  const hit = new Set();
  let from = { x: player.x, y: player.y };
  let dmg = (30 + 8 * lvl) * player.dmgMul;
  for (let i = 0; i < 3 + lvl; i++) {
    if (!current || hit.has(current.id)) break;
    hit.add(current.id);
    lightnings.push(makeBolt(from, current, '#a78bfa'));
    damageEnemy(current, dmg, false);
    from = { x: current.x, y: current.y };
    current = nearestFrom(current.x, current.y, 270, hit);
    dmg *= 0.85;
  }
  tone(880, 420, 0.12, 'sawtooth', 0.025);
}
function castNova() {
  const lvl = player.upg.nova || 0;
  if (!lvl) return;
  const radius = 125 + 28 * lvl;
  waves.push({ x: player.x, y: player.y, r: 24, maxR: radius, life: 0.5, maxLife: 0.5, color: '#22d3ee' });
  for (const e of [...enemies]) {
    if (e.dead) continue;
    if (Math.hypot(e.x - player.x, e.y - player.y) < radius + e.r) {
      damageEnemy(e, (34 + 16 * lvl) * player.dmgMul, false);
      e.kx += (e.x - player.x) * 1.4;
      e.ky += (e.y - player.y) * 1.4;
    }
  }
  game.shake = Math.max(game.shake, 5);
  sfx.explode();
}
function updateOrbs(dt) {
  const count = player.upg.orb || 0;
  if (!count) return;
  player.orbAngle += dt * 2.8;
  const radius = 68 + count * 5;
  for (let i = 0; i < count; i++) {
    const a = player.orbAngle + i * TAU / count;
    const ox = player.x + Math.cos(a) * radius;
    const oy = player.y + Math.sin(a) * radius;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (e.dead || e.orbCd > 0) continue;
      if ((e.x - ox) * (e.x - ox) + (e.y - oy) * (e.y - oy) < (e.r + 11) * (e.r + 11)) {
        damageEnemy(e, (18 + 6 * count) * player.dmgMul, false);
        e.orbCd = 0.34;
        e.kx += Math.cos(a) * 80; e.ky += Math.sin(a) * 80;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  expanded player systems                                            */
/* ------------------------------------------------------------------ */
function pointLineDistSq(x, y, angle, len, px, py) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const t = (px - x) * dx + (py - y) * dy;
  if (t < 0 || t > len) return 1e9;
  const cx = x + dx * t, cy = y + dy * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}
function spawnBeam(x, y, angle, len, width, warm, life, dmg, color, rotate) {
  beams.push({ x, y, angle, len, width, warm, life, maxLife: warm + life, dmg, color, rotate: rotate || 0, hitCd: 0 });
}
const HAZARD_INFO = {
  ember: { r: 62, delay: 1.1, life: 4.4, dmg: 11, color: '#fb923c' },
  frost: { r: 78, delay: 0.85, life: 5, dmg: 6, color: '#7dd3fc' },
  void: { r: 66, delay: 1, life: 4, dmg: 9, color: '#a78bfa' },
  storm: { r: 72, delay: 0.75, life: 0.5, dmg: 18, color: '#fde047' },
  magma: { r: 64, delay: 0.6, life: 3, dmg: 0, color: '#fb923c' }
};
function spawnHazardAt(x, y, type, scale, delayOverride, lifeOverride) {
  const info = HAZARD_INFO[type] || HAZARD_INFO.ember;
  const delay = delayOverride == null ? info.delay : delayOverride;
  const life = lifeOverride == null ? info.life : lifeOverride;
  hazards.push({
    x, y, r: info.r * (scale || 1), delay, life, maxLife: life, delayMax: delay,
    type, color: info.color, dmg: info.dmg, tick: 0, armed: false, zapped: false
  });
}
function spawnHazard(type) {
  const a = rnd(TAU), r = rnd(540, 260);
  spawnHazardAt(
    clamp(player.x + Math.cos(a) * r, 80, WORLD.w - 80),
    clamp(player.y + Math.sin(a) * r, 80, WORLD.h - 80), type, 1
  );
}
function openPortal(kind, x, y, delay, life) {
  portals.push({
    kind, x: clamp(x, 50, WORLD.w - 50), y: clamp(y, 50, WORLD.h - 50),
    t: 0, delay: delay == null ? 1 : delay, life: life == null ? 2.2 : life,
    spawned: false, color: kind === 'hive' ? '#a3e635' : kind === 'prism' ? '#7dd3fc' : '#c084fc'
  });
}
function spawnPortalContents(p) {
  const st = STAGES[p.stage] || STAGES[0];
  if (p.kind === 'rift') {
    for (let i = 0; i < 10; i++) {
      const a = rnd(TAU), r = rnd(130, 35);
      spawnEnemy(pick(st.table), clamp(p.x + Math.cos(a) * r, 40, WORLD.w - 40), clamp(p.y + Math.sin(a) * r, 40, WORLD.h - 40));
    }
  } else if (p.kind === 'hive') {
    for (let i = 0; i < 20; i++) {
      const a = rnd(TAU), r = rnd(160, 45);
      const e = spawnEnemy(pick(st.table), clamp(p.x + Math.cos(a) * r, 40, WORLD.w - 40), clamp(p.y + Math.sin(a) * r, 40, WORLD.h - 40), { hiveMob: true });
      if (e) e.hiveMob = true;
    }
  } else if (p.kind === 'prism') {
    const b = game.boss;
    if (b && !b.dead) {
      const e = spawnEnemy('prismling', p.x, p.y, { hp: b.maxHp * 0.2, noScale: true, size: 0.5 });
      if (e) { e.prismOwner = b.id; b.prismAlive = true; }
      else { b.prismAlive = false; b.prismSummonTimer = 8; }
    }
  }
}
function updatePortals(dt) {
  for (let i = portals.length - 1; i >= 0; i--) {
    const p = portals[i];
    p.t += dt;
    if (!p.spawned && p.t >= p.delay) {
      p.spawned = true;
      spawnPortalContents(p);
    }
    if (p.t >= p.life) portals.splice(i, 1);
  }
}
function spawnLightningStrike(x, y) {
  strikes.push({ x, y, w: 104, h: 280, t: 0, delay: 1, struck: false, life: 0.45, color: '#fde047' });
}
function updateStrikes(dt) {
  for (let i = strikes.length - 1; i >= 0; i--) {
    const s = strikes[i];
    if (!s.struck) {
      s.t += dt;
      if (s.t >= s.delay) {
        s.struck = true;
        const inside = Math.abs(player.x - s.x) <= s.w / 2 + player.r && Math.abs(player.y - s.y) <= s.h / 2 + player.r;
        lightnings.push(makeBolt({ x: s.x + rnd(-12, 12), y: s.y - s.h / 2 - 260 }, { x: s.x, y: s.y + s.h / 2 }, s.color));
        lightnings.push(makeBolt({ x: s.x + rnd(-20, 20), y: s.y - s.h / 2 - 180 }, { x: s.x, y: s.y + s.h / 2 }, '#ffffff'));
        if (inside) hurtPlayer(20);
        game.shake = Math.max(game.shake, 10);
        burst(s.x, s.y + s.h / 2, s.color, 18, 260, 4);
        sfx.explode();
      }
    } else {
      s.life -= dt;
      if (s.life <= 0) strikes.splice(i, 1);
    }
  }
}
function spawnSectorStrike(x, y, angle) {
  sectors.push({ x, y, angle, spread: TAU / 6, radius: 720, t: 0, delay: 1.2, struck: false, life: 0.5, color: '#ff5c8a' });
}
function updateSectors(dt) {
  for (let i = sectors.length - 1; i >= 0; i--) {
    const s = sectors[i];
    if (!s.struck) {
      s.t += dt;
      if (s.t >= s.delay) {
        s.struck = true;
        const a = Math.atan2(player.y - s.y, player.x - s.x);
        const diff = Math.abs(normAngle(a - s.angle));
        const inside = diff <= s.spread / 2 && Math.hypot(player.x - s.x, player.y - s.y) <= s.radius;
        if (inside) hurtPlayer(25);
        game.shake = Math.max(game.shake, 9);
        burst(s.x + Math.cos(s.angle) * 90, s.y + Math.sin(s.angle) * 90, s.color, 22, 300, 5);
        sfx.explode();
      }
    } else {
      s.life -= dt;
      if (s.life <= 0) sectors.splice(i, 1);
    }
  }
}
function enterVoid(e) {
  if (game.voidActive) return;
  game.voidActive = true;
  game.voidNeed = 25 + 5 * (e.voidCount || 0);
  game.voidKills = 0;
  game.voidExitTimer = 0;
  game.voidReturn = { x: player.x, y: player.y };
  e.voidWarn = 0;
  e.voidHidden = true;
  e.voidTimer = 90;
  for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i].boss) enemies.splice(i, 1);
  ebullets.length = 0; hazards.length = 0; beams.length = 0;
  portals.length = 0; strikes.length = 0; sectors.length = 0;
  player.invuln = Math.max(player.invuln, 1.2);
  const st = STAGES[3] || STAGES[game.stageIndex];
  for (let i = 0; i < game.voidNeed; i++) {
    const a = rnd(TAU), r = rnd(430, 170);
    const m = spawnEnemy(pick(st.table), clamp(player.x + Math.cos(a) * r, 60, WORLD.w - 60), clamp(player.y + Math.sin(a) * r, 60, WORLD.h - 60), { voidMob: true });
    if (m) { m.voidMob = true; m.xp = 0; }
  }
  showBanner('虚空领域', '击败 ' + game.voidNeed + ' 个敌人才能离开', '#a78bfa');
  updateHud();
}
function exitVoid() {
  if (!game.voidActive) return;
  const b = game.boss;
  game.voidActive = false;
  game.voidExitTimer = 0;
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].voidMob) enemies.splice(i, 1);
  if (game.voidReturn) {
    player.x = clamp(game.voidReturn.x, 24, WORLD.w - 24);
    player.y = clamp(game.voidReturn.y, 24, WORLD.h - 24);
  }
  player.invuln = Math.max(player.invuln, 1.2);
  ebullets.length = 0; hazards.length = 0; beams.length = 0;
  portals.length = 0; strikes.length = 0; sectors.length = 0;
  if (b && !b.dead) {
    b.voidHidden = false;
    b.voidCount = (b.voidCount || 0) + 1;
    b.voidTimer = 90;
  }
  game.voidKills = 0;
  game.voidNeed = 0;
  game.voidReturn = null;
  showBanner('虚空脱离', 'Boss 回到战场', '#a78bfa');
  updateHud();
}
function updateVoid(dt) {
  if (!game.voidActive) return;
  if (game.voidKills >= game.voidNeed && game.voidExitTimer <= 0) game.voidExitTimer = 1;
  if (game.voidExitTimer > 0) {
    game.voidExitTimer -= dt;
    if (game.voidExitTimer <= 0) exitVoid();
  }
}
function drawVoidOverlay(t) {
  if (!game.voidActive) return;
  const a = 0.16 + 0.04 * Math.sin(t * 2);
  ctx.save();
  ctx.fillStyle = 'rgba(30,4,60,' + a + ')';
  ctx.fillRect(0, 0, VW, VH);
  ctx.strokeStyle = 'rgba(167,139,250,0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 12]);
  ctx.strokeRect(14, 14, VW - 28, VH - 28);
  ctx.setLineDash([]);
  ctx.fillStyle = '#d8c7ff';
  ctx.font = '700 12px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('VOID DOMAIN // 击杀 ' + game.voidKills + ' / ' + game.voidNeed, VW / 2, 36);
  ctx.restore();
}
function drawPortals(t) {
  for (const p of portals) {
    const opening = clamp(p.t / Math.max(0.01, p.delay), 0, 1);
    const fade = p.spawned ? clamp(1 - (p.t - p.delay) / Math.max(0.01, p.life - p.delay), 0, 1) : opening;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = 0.35 + fade * 0.55;
    if (p.kind === 'rift') {
      drawGlow(p.color, 0, 0, 46 + fade * 28, 0.35);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const yy = -50 + i * 12.5;
        const xx = Math.sin(i * 2.1 + t * 7) * (10 + fade * 13);
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (p.kind === 'hive') {
      drawGlow('#a3e635', 0, 0, 50 + fade * 35, 0.35);
      ctx.strokeStyle = '#a3e635';
      ctx.lineWidth = 2;
      for (let ring = 0; ring < 3; ring++) {
        const rr = 18 + ring * 15 + fade * 8;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = t * (0.8 + ring * 0.2) + i * TAU / 6;
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.stroke();
      }
    } else {
      drawGlow('#7dd3fc', 0, 0, 45 + fade * 30, 0.35);
      ctx.rotate(t * 1.8);
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(TAU / 4);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(45 + fade * 20, 0); ctx.stroke();
      }
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 18 + fade * 10, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
}
function drawStrikes(t) {
  for (const s of strikes) {
    const flash = 0.42 + 0.34 * Math.sin(t * 30 + s.x);
    ctx.save();
    if (!s.struck) {
      ctx.globalAlpha = flash;
      ctx.fillStyle = 'rgba(253,224,71,0.15)';
      ctx.fillRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 18);
      ctx.strokeStyle = '#fff7b0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const top = s.y - s.h / 2 + 24, bottom = s.y + s.h / 2 - 24;
      ctx.moveTo(s.x + 18, top);
      ctx.lineTo(s.x - 20, s.y - 30);
      ctx.lineTo(s.x + 8, s.y - 8);
      ctx.lineTo(s.x - 14, bottom);
      ctx.stroke();
    } else {
      ctx.globalAlpha = clamp(s.life / 0.45, 0, 1);
      ctx.fillStyle = 'rgba(255,255,220,0.35)';
      ctx.fillRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.strokeRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
    }
    ctx.restore();
  }
}
function drawSectors(t) {
  for (const s of sectors) {
    const flash = 0.34 + 0.26 * Math.sin(t * 18 + s.angle);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.globalAlpha = s.struck ? 0.55 : flash;
    ctx.fillStyle = s.struck ? 'rgba(255,255,255,0.28)' : 'rgba(255,61,139,0.12)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, s.radius, s.angle - s.spread / 2, s.angle + s.spread / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = s.struck ? '#ffffff' : s.color;
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
function castBeam() {
  const lvl = player.upg.beam || 0;
  if (!lvl) return;
  const target = nearestEnemy(player.x, player.y, 1100);
  if (!target) return;
  const angle = Math.atan2(target.y - player.y, target.x - player.x);
  const len = 1000;
  beamFx.push({ x: player.x, y: player.y, angle, len, width: 16, life: 0.22, maxLife: 0.22, color: '#7ff7ff' });
  const dmg = (50 + 22 * lvl) * player.dmgMul;
  for (const e of [...enemies]) {
    if (e.dead) continue;
    if (pointLineDistSq(player.x, player.y, angle, len, e.x, e.y) < (16 + e.r) * (16 + e.r)) {
      damageEnemy(e, dmg, false, { noBoom: true });
    }
  }
  game.shake = Math.max(game.shake, 4);
  tone(1240, 320, 0.16, 'sawtooth', 0.026);
}
function fireDrones() {
  const count = player.upg.drone || 0;
  if (!count) return;
  const radius = 52 + count * 7;
  for (let i = 0; i < count; i++) {
    const a = player.droneAngle + i * TAU / count;
    const ox = player.x + Math.cos(a) * radius;
    const oy = player.y + Math.sin(a) * radius;
    const t = nearestEnemy(ox, oy, 700);
    if (!t) continue;
    const angle = Math.atan2(t.y - oy, t.x - ox);
    bullets.push({
      type: 'drone', x: ox, y: oy,
      vx: Math.cos(angle) * 780, vy: Math.sin(angle) * 780,
      r: 3, dmg: (12 + 4 * count) * player.dmgMul, pierce: 0, life: 0.9,
      hit: [], crit: false, color: '#a5f3fc', bounces: 0
    });
  }
}
function deployTurret() {
  const lvl = player.upg.turret || 0;
  if (!lvl) return;
  const a = rnd(TAU), r = 62;
  turrets.push({
    x: clamp(player.x + Math.cos(a) * r, 40, WORLD.w - 40),
    y: clamp(player.y + Math.sin(a) * r, 40, WORLD.h - 40),
    life: 8 + lvl * 2, maxLife: 8 + lvl * 2, fireTimer: 0.25,
    dmg: (20 + 8 * lvl) * player.dmgMul, angle: 0
  });
  if (turrets.length > 3 + lvl) turrets.shift();
  floatText(player.x, player.y - 30, 'TURRET', '#a5f3fc');
  sfx.pickup();
}
function updateTurrets(dt) {
  for (let i = turrets.length - 1; i >= 0; i--) {
    const t = turrets[i];
    t.life -= dt;
    if (t.life <= 0) { turrets.splice(i, 1); continue; }
    t.fireTimer -= dt;
    if (t.fireTimer <= 0) {
      const target = nearestEnemy(t.x, t.y, 680);
      if (target) {
        t.angle = Math.atan2(target.y - t.y, target.x - t.x);
        bullets.push({
          type: 'turret', x: t.x, y: t.y,
          vx: Math.cos(t.angle) * 840, vy: Math.sin(t.angle) * 840,
          r: 3.5, dmg: t.dmg, pierce: 0, life: 0.9, hit: [],
          crit: false, color: '#67e8f9', bounces: 0
        });
      }
      t.fireTimer = 0.55;
    }
  }
}
function updateBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.warm -= dt;
    b.life -= dt;
    b.hitCd -= dt;
    b.angle += (b.rotate || 0) * dt;
    if (b.life <= 0) { beams.splice(i, 1); continue; }
    if (b.warm > 0) continue;
    if (b.hitCd <= 0 && pointLineDistSq(b.x, b.y, b.angle, b.len, player.x, player.y) < (b.width / 2 + player.r) * (b.width / 2 + player.r)) {
      hurtPlayer(b.dmg);
      b.hitCd = 0.5;
    }
  }
}
function updateHazards(dt) {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.delay -= dt;
    h.life -= dt;
    h.tick -= dt;
    if (h.life <= 0) { hazards.splice(i, 1); continue; }
    if (h.delay > 0) continue;
    if (!h.armed) {
      h.armed = true;
      if (h.type === 'storm') lightnings.push(makeBolt({ x: h.x, y: h.y - 520 }, { x: h.x, y: h.y }, h.color));
    }
    const inside = Math.hypot(player.x - h.x, player.y - h.y) < h.r + player.r;
    if (h.type === 'magma') {
      if (inside) {
        h.tick -= dt;
        if (h.tick <= 0) { hurtPlayer(1); h.tick = 0.5; }
      }
      continue;
    }
    if (inside) {
      if (h.type === 'frost') player.slowTime = Math.max(player.slowTime, 0.55);
      if (h.tick <= 0) { hurtPlayer(h.dmg); h.tick = 0.55; }
    }
  }
}
function updateBeamFx(dt) {
  for (let i = beamFx.length - 1; i >= 0; i--) {
    beamFx[i].life -= dt;
    if (beamFx[i].life <= 0) beamFx.splice(i, 1);
  }
}

/* ------------------------------------------------------------------ */
/*  world updates                                                      */
/* ------------------------------------------------------------------ */
function update(dt) {
  game.time += dt;
  if (!game.boss && game.intermission <= 0) game.stageClock += dt;
  game.shake = Math.max(0, game.shake - dt * 30);
  game.flash = Math.max(0, game.flash - dt * 2.8);
  if (game.mirrorTime > 0) {
    game.mirrorTime -= dt;
    if (game.mirrorTime <= 0) {
      game.mirrorTime = 0;
      showBanner('镜面恢复', '左右移动恢复正常', '#67e8f9');
    }
  }
  game.hudClock += dt;

  updatePlayer(dt);
  updateSpawning(dt);
  updateTurrets(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updateEnemyBullets(dt);
  updateBeams(dt);
  updateHazards(dt);
  updatePortals(dt);
  updateStrikes(dt);
  updateSectors(dt);
  updateVoid(dt);
  updateGems(dt);
  updatePickups(dt);
  updateWaves(dt);
  updateParticles(dt);
  updateBeamFx(dt);
  updateTexts(dt);

  if (game.comboTimer > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) game.combo = 1;
  }
  if (game.finishTimer > 0) {
    game.finishTimer -= dt;
    if (game.finishTimer <= 0) endGame(true);
  }
  if (game.hudClock > 0.08) { game.hudClock = 0; updateHud(); }
  updateCamera(dt);
}

function updatePlayer(dt) {
  player.invuln = Math.max(0, player.invuln - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.overdrive = Math.max(0, player.overdrive - dt);
  player.slowTime = Math.max(0, player.slowTime - dt);
  if (player.shieldMax > 0 && player.shield < player.shieldMax) {
    player.shieldTimer -= dt;
    if (player.shieldTimer <= 0) {
      player.shield += 1;
      player.shieldTimer = 12;
      burst(player.x, player.y, '#7dd3fc', 10, 120, 3);
      floatText(player.x, player.y - 34, 'SHIELD +1', '#7dd3fc');
      sfx.pickup();
    }
  }
  if (player.upg.overcharge) {
    player.overchargeTimer -= dt;
    if (player.overchargeTimer <= 0) {
      player.overdrive = Math.max(player.overdrive, 2.8);
      player.overchargeTimer = 16;
      floatText(player.x, player.y - 34, 'OVERCHARGE', '#fbbf24');
      burst(player.x, player.y, '#fbbf24', 12, 150, 3);
    }
  }

  let ix = 0, iy = 0;
  if (keys.KeyW || keys.ArrowUp) iy -= 1;
  if (keys.KeyS || keys.ArrowDown) iy += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (joy.active) { ix += joy.dx; iy += joy.dy; }
  if (game.mirrorTime > 0) ix = -ix;
  let mag = Math.hypot(ix, iy);
  if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
  if (mag < 0.1) { ix = 0; iy = 0; }
  player.moveX = ix; player.moveY = iy;

  if (player.dashTime > 0) {
    player.x += player.dashX * 1060 * dt;
    player.y += player.dashY * 1060 * dt;
    player.dashTime -= dt;
    if (Math.random() < 0.8) {
      particles.push({ x: player.x, y: player.y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 0.28, maxLife: 0.28, size: rnd(7, 3), color: '#67e8f9' });
    }
    if (player.dashTime <= 0) {
      player.dashTime = 0;
      const lvl = player.upg.dashblast || 0;
      if (lvl) {
        const radius = 105 + 18 * lvl;
        for (const e of [...enemies]) {
          if (!e.dead && Math.hypot(e.x - player.x, e.y - player.y) < radius + e.r) {
            damageEnemy(e, (40 + 20 * lvl) * player.dmgMul, false);
          }
        }
        waves.push({ x: player.x, y: player.y, r: 20, maxR: radius, life: 0.35, maxLife: 0.35, color: '#ff3d8b' });
        game.shake = Math.max(game.shake, 6);
      }
    }
  } else if (mag > 0) {
    const spd = player.speed * (player.slowTime > 0 ? 0.58 : 1);
    player.x += ix * spd * dt;
    player.y += iy * spd * dt;
  }
  player.x = clamp(player.x, 34, WORLD.w - 34);
  player.y = clamp(player.y, 34, WORLD.h - 34);

  const target = nearestEnemy(player.x, player.y, 1200);
  if (target) player.aim = Math.atan2(target.y - player.y, target.x - player.x);
  else if (mag > 0) player.aim = Math.atan2(iy, ix);

  const berserk = player.berserk && player.hp < player.maxHp * 0.35;
  const haste = (player.overdrive > 0 ? 1.8 : 1) * (berserk ? 1.35 : 1);
  player.pulseTimer -= dt * haste;
  if (player.pulseTimer <= 0) {
    player.pulseTimer = firePulse() ? 0.32 / player.fireRateMul : 0.1;
  }
  if (player.upg.missile) {
    player.missileTimer -= dt;
    if (player.missileTimer <= 0) { fireMissiles(); player.missileTimer = 2.7; }
  }
  if (player.upg.chain) {
    player.chainTimer -= dt;
    if (player.chainTimer <= 0) { castChain(); player.chainTimer = 2.5; }
  }
  if (player.upg.nova) {
    player.novaTimer -= dt;
    if (player.novaTimer <= 0) { castNova(); player.novaTimer = 3.2; }
  }
  player.droneAngle += dt * 1.5;
  if (player.upg.beam) {
    player.beamTimer -= dt;
    if (player.beamTimer <= 0) { castBeam(); player.beamTimer = 3.4; }
  }
  if (player.upg.drone) {
    player.droneTimer -= dt;
    if (player.droneTimer <= 0) { fireDrones(); player.droneTimer = 1.15; }
  }
  if (player.upg.turret) {
    player.turretTimer -= dt;
    if (player.turretTimer <= 0) { deployTurret(); player.turretTimer = 12; }
  }
  updateOrbs(dt);
}

function updateCamera(dt) {
  const tx = clamp(player.x - VW / 2, 0, Math.max(0, WORLD.w - VW));
  const ty = clamp(player.y - VH / 2, 0, Math.max(0, WORLD.h - VH));
  const k = 1 - Math.pow(0.0015, dt);
  cam.x = lerp(cam.x, tx, k);
  cam.y = lerp(cam.y, ty, k);
}

/* ------------------------------------------------------------------ */
/*  spawning                                                           */
/* ------------------------------------------------------------------ */
const ENEMY_TYPES = {
  grunt: { r: 14, hp: 45, speed: 58, dmg: 9, xp: 1, score: 10, color: '#ff3d8b' },
  swift: { r: 10, hp: 30, speed: 118, dmg: 7, xp: 1, score: 12, color: '#fbbf24' },
  brute: { r: 25, hp: 220, speed: 40, dmg: 20, xp: 3, score: 35, color: '#c084fc' },
  gunner: { r: 15, hp: 75, speed: 52, dmg: 11, xp: 2, score: 22, color: '#fb7185' },
  orbiter: { r: 16, hp: 100, speed: 74, dmg: 11, xp: 2, score: 28, color: '#f472b6' },
  bomber: { r: 14, hp: 50, speed: 108, dmg: 24, xp: 2, score: 24, color: '#f97316' },
  sniper: { r: 15, hp: 85, speed: 45, dmg: 14, xp: 3, score: 30, color: '#e879f9' },
  prismling: { r: 62, hp: 1000, speed: 60, dmg: 10, xp: 5, score: 180, color: '#7dd3fc' },
  elite: { r: 30, hp: 3000, speed: 52, dmg: 26, xp: 10, score: 200, color: '#fb923c' }
};

function spawnPoint() {
  const margin = 72;
  const hw = Math.min(900, VW / 2 + margin), hh = Math.min(640, VH / 2 + margin);
  const side = (Math.random() * 4) | 0;
  let x, y;
  if (side === 0) { x = player.x + rnd(-hw, hw); y = player.y - hh; }
  else if (side === 1) { x = player.x + rnd(-hw, hw); y = player.y + hh; }
  else if (side === 2) { x = player.x - hw; y = player.y + rnd(-hh, hh); }
  else { x = player.x + hw; y = player.y + rnd(-hh, hh); }
  x = clamp(x, 46, WORLD.w - 46);
  y = clamp(y, 46, WORLD.h - 46);
  if (Math.hypot(x - player.x, y - player.y) < 300) {
    const a = rnd(TAU), r = Math.min(VW, VH) * 0.5 + 180;
    x = clamp(player.x + Math.cos(a) * r, 46, WORLD.w - 46);
    y = clamp(player.y + Math.sin(a) * r, 46, WORLD.h - 46);
  }
  return { x, y };
}
function spawnPointNear() {
  const a = rnd(TAU), r = rnd(560, 380);
  let x = clamp(player.x + Math.cos(a) * r, 46, WORLD.w - 46);
  let y = clamp(player.y + Math.sin(a) * r, 46, WORLD.h - 46);
  if (Math.hypot(x - player.x, y - player.y) < 220) {
    x = clamp(player.x - Math.cos(a) * r, 46, WORLD.w - 46);
    y = clamp(player.y - Math.sin(a) * r, 46, WORLD.h - 46);
  }
  return { x, y };
}
function aimRange() { return Math.min(880, Math.max(560, Math.min(VW, VH) * 0.82)); }
function spawnEnemy(type, x, y, opts) {
  if (enemies.length >= MAX_ENEMIES) return null;
  const t = ENEMY_TYPES[type] || ENEMY_TYPES.grunt;
  opts = opts || {};
  const scale = 1 + game.time * 0.005 + game.stageIndex * 0.10 + Math.pow(game.time / 180, 1.2) * 0.10;
  const hp = (opts.hp || t.hp) * (opts.noScale ? 1 : scale);
  const e = {
    id: ++game.enemyId, type, x, y, r: t.r * (opts.size || 1),
    hp, maxHp: hp,
    speed: t.speed * (1 + Math.min(0.3, game.time / 1200) + game.stageIndex * 0.018) * (opts.speed || 1),
    dmg: t.dmg, xp: t.xp, score: t.score, color: t.color,
    seed: rnd(TAU), rot: rnd(TAU), hitFlash: 0, orbCd: 0,
    shootTimer: rnd(2.6, 1.1), ringTimer: rnd(3.8, 2.4), charge: 0,
    orbitAngle: rnd(TAU), aimAngle: 0, laserTimer: rnd(4.5, 2.5), laserWarn: 0,
    hiveMob: !!opts.hiveMob, voidMob: !!opts.voidMob,
    slowUntil: 0, slowFactor: 1, poisonDps: 0, poisonUntil: 0, poisonTick: 0,
    kx: 0, ky: 0, dead: false, boss: false, elite: type === 'elite', final: false
  };
  enemies.push(e);
  return e;
}
function spawnGroup() {
  if (enemies.length >= (game.quality === 'low' ? 70 : MAX_ENEMIES)) return;
  const remaining = game.stageQuota - game.stageSpawned;
  if (remaining <= 0) return;
  const st = STAGES[game.stageIndex];
  const count = Math.min(remaining, Math.min(7, 1 + Math.floor(game.stageClock / 16) + Math.floor(game.stageIndex / 3) + (Math.random() < 0.28 ? 1 : 0)));
  for (let i = 0; i < count; i++) {
    const p = spawnPoint();
    const e = spawnEnemy(pick(st.table), p.x, p.y);
    if (e) game.stageSpawned += 1;
  }
}
function spawnElite() {
  const p = spawnPoint();
  spawnEnemy('elite', p.x, p.y);
  showBanner('精英信号', '击破它，夺取数据核心', '#fb923c');
}
function updateSpawning(dt) {
  if (game.finishTimer > 0) return;
  if (game.intermission > 0) {
    game.intermission -= dt;
    if (game.intermission <= 0 && !game.boss) {
      if (game.stageIndex + 1 < STAGES.length) startStage(game.stageIndex + 1, false);
    }
    return;
  }
  if (game.boss) return;

  const st = STAGES[game.stageIndex];
  if (!game.stageBossSpawned && game.stageSpawned >= game.stageQuota && game.stageKills >= game.stageQuota && enemies.length === 0) {
    ebullets.length = 0;
    hazards.length = 0;
    beams.length = 0;
    spawnBoss(game.stageIndex);
    game.stageBossSpawned = true;
    return;
  }

  if (game.stageSpawned < game.stageQuota) {
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      spawnGroup();
      game.spawnTimer = Math.max(0.56, 1.02 - game.stageClock * 0.008 - game.stageIndex * 0.02) * rnd(1.1, 0.9);
    }
    game.eliteTimer -= dt;
    if (game.eliteTimer <= 0) {
      spawnElite();
      game.eliteTimer = 20 + game.stageIndex * 2;
    }
  }
  if (st.hazard !== 'none') {
    game.hazardTimer -= dt;
    if (game.hazardTimer <= 0) {
      spawnHazard(st.hazard);
      game.hazardTimer = 7.5 + rnd(4);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  enemy behaviour                                                    */
/* ------------------------------------------------------------------ */
function spawnEBullet(x, y, angle, speed, dmg, color, r, shape) {
  if (ebullets.length >= 320) ebullets.shift();
  ebullets.push({
    x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    r: r || 5, dmg, color: color || '#ff5c8a', life: 6,
    shape: shape || 'orb', spin: rnd(TAU)
  });
}
function spawnBoss(stageIndex) {
  const st = STAGES[stageIndex];
  const a = rnd(TAU);
  const br = BOSS_RADIUS[stageIndex] || 64;
  const margin = 100 + br;
  let x = clamp(player.x + Math.cos(a) * 350, cam.x + margin, cam.x + VW - margin);
  let y = clamp(player.y + Math.sin(a) * 350, cam.y + margin, cam.y + VH - margin);
  if (y < cam.y + 240) y = Math.min(cam.y + VH - margin, cam.y + 270);
  if (Math.hypot(x - player.x, y - player.y) < 230) {
    x = clamp(player.x - Math.cos(a) * 350, cam.x + margin, cam.x + VW - margin);
    y = clamp(player.y - Math.sin(a) * 350, cam.y + margin, cam.y + VH - margin);
  }
  const hp = BOSS_HP[stageIndex] || 3000;
  const e = {
    id: ++game.enemyId, type: 'boss', name: st.boss, pattern: st.pattern, stage: stageIndex,
    x, y, r: BOSS_RADIUS[stageIndex] || 64, hp, maxHp: hp,
    speed: BOSS_SPEED[stageIndex] || 44, dmg: 22 + stageIndex * 3,
    xp: Math.round(player.xpNext * (1.8 + stageIndex * 0.25)), score: 2200 + stageIndex * 1000,
    damageScale: stageIndex === STAGES.length - 1 ? 100000 : 1,
    color: st.color, seed: rnd(TAU), rot: 0, hitFlash: 0, orbCd: 0,
    slowUntil: 0, slowFactor: 1, poisonDps: 0, poisonUntil: 0, poisonTick: 0, lastDmgText: 0,
    ringTimer: 1.8, aimTimer: 2.2, spiralTimer: 0.8, spiralAngle: 0,
    summonTimer: 4.5, chargeTimer: 3.4, chargeWarm: 0, charging: false,
    chargeX: 0, chargeY: 0, dashTime: 0, dashX: 0, dashY: 0, trailTimer: 0,
    teleportTimer: 3.4, teleportWarm: 0, teleX: 0, teleY: 0,
    beamTimer: 3, satTimer: 1.4, satAngle: 0, stormTimer: 2.2, hazardTimer: 6,
    mirrorTimer: 3.5, mirrorWarn: 0, mirrorShotTimer: 3.2, swapTimer: 4.0, swapWarn: 0, mirrorBeamTimer: 2.2,
    phaseSkillTimer: 2.4, riftTimer: 5, hiveTimer: 4, hiveSummoned: false,
    magmaTimer: 3.2, voidTimer: 12, voidWarn: 0, voidCount: 0,
    prismSummonTimer: 5, prismAlive: false, lightningTimer: 3.8, sectorShots: 0, sectorTimer: 3,
    phase: 0, dead: false, boss: true, elite: false,
    final: stageIndex === STAGES.length - 1
  };
  enemies.push(e);
  game.boss = e;
  showBossBar(e);
  showBanner('WARNING // ' + e.name, 'STAGE ' + (stageIndex + 1) + ' // 击穿核心', st.color);
  sfx.boss();
}
function bossMove(e, dt, keep, mul) {
  const dx = player.x - e.x, dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  const sp = e.speed * (mul || 1) * (e.phase === 2 ? 1.25 : 1);
  if (d > keep) {
    e.x += Math.cos(ang) * sp * dt;
    e.y += Math.sin(ang) * sp * dt;
  } else if (d < keep * 0.62) {
    e.x -= Math.cos(ang) * sp * dt;
    e.y -= Math.sin(ang) * sp * dt;
  } else {
    e.x += Math.cos(ang + Math.PI / 2) * sp * 0.45 * dt;
    e.y += Math.sin(ang + Math.PI / 2) * sp * 0.45 * dt;
  }
}
function bossRing(e, count, speed, dmg, shape, color, off) {
  const base = off == null ? rnd(TAU) : off;
  for (let i = 0; i < count; i++) {
    spawnEBullet(e.x, e.y, base + i * TAU / count, speed, dmg, color || e.color, shape === 'shard' ? 5 : 6, shape || 'orb');
  }
}
function bossRingGap(e, count, gap, speed, dmg, shape, color, off) {
  const base = off == null ? rnd(TAU) : off;
  const span = TAU - gap;
  for (let i = 0; i < count; i++) {
    const a = base + gap / 2 + (count > 1 ? span * i / (count - 1) : span / 2);
    spawnEBullet(e.x, e.y, a, speed, dmg, color || e.color, shape === 'shard' ? 5 : 6, shape || 'orb');
  }
}
function bossAim(e, count, spread, speed, dmg, shape, color) {
  const base = Math.atan2(player.y - e.y, player.x - e.x);
  for (let i = 0; i < count; i++) {
    spawnEBullet(e.x, e.y, base + (i - (count - 1) / 2) * spread, speed, dmg, color || e.color, shape === 'shard' ? 5 : 6, shape || 'orb');
  }
}
function bossSpiralStep(e, arms, speed, dmg, shape, color) {
  for (let i = 0; i < arms; i++) {
    spawnEBullet(e.x, e.y, e.spiralAngle + i * TAU / arms, speed, dmg, color || e.color, shape === 'shard' ? 5 : 6, shape || 'orb');
  }
}
function bossSummon(e, type, count) {
  for (let i = 0; i < count; i++) {
    const a = rnd(TAU);
    spawnEnemy(type, e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90);
  }
}
function runPhaseSkill(e) {
  const p = e.phase;
  if (p < 1) return;
  const px = player.x, py = player.y;
  if (e.pattern === 'rift') {
    if (p === 1) {
      for (let i = 0; i < 4; i++) spawnBeam(e.x, e.y, e.rot + i * TAU / 4 + 0.3, 900, 16, 0.55, 0.9, 13, '#c084fc', 0.35);
    } else {
      bossRingGap(e, 26, 0.7, 170, 14, 'orb', '#ff5c8a', e.rot);
      spawnHazardAt(px, py, 'void', 1, 0.7, 3.4);
    }
  } else if (e.pattern === 'hive') {
    if (p === 1) {
      bossSpiralStep(e, 6, 145, 9, 'orb', '#d9f99d');
      e.spiralAngle += 0.34;
    } else {
      bossRingGap(e, 24, 0.75, 160, 12, 'orb', '#d9f99d', e.rot);
      bossSummon(e, 'orbiter', 3);
    }
  } else if (e.pattern === 'forge') {
    if (p === 1) {
      for (let i = 0; i < 3; i++) spawnHazardAt(px + rnd(-90, 90), py + rnd(-90, 90), 'ember', 0.9, 0.8, 3.2);
    } else {
      for (let i = 0; i < 4; i++) spawnBeam(e.x, e.y, e.rot + i * TAU / 4, 1000, 20, 0.6, 1.1, 16, '#fb923c', 0.2);
      spawnHazardAt(px, py, 'ember', 1.2, 0.6, 4);
    }
  } else if (e.pattern === 'weaver') {
    if (p === 1) {
      const base = Math.atan2(py - e.y, px - e.x);
      for (let i = 0; i < 3; i++) spawnBeam(e.x, e.y, base + i * TAU / 3, 850, 14, 0.5, 0.8, 12, '#a78bfa', 0);
    } else {
      spawnHazardAt(px, py, 'void', 1, 0.6, 3.5);
      for (let i = 0; i < 3; i++) spawnBeam(e.x, e.y, e.rot + i * TAU / 3, 900, 16, 0.6, 0.9, 14, '#c084fc', 0.3);
    }
  } else if (e.pattern === 'prism') {
    if (p === 1) {
      bossRingGap(e, 18, 0.8, 150, 11, 'orb', '#7dd3fc', e.rot);
      spawnHazardAt(px, py, 'frost', 1, 0.8, 3.5);
    } else {
      const base = Math.atan2(py - e.y, px - e.x);
      for (let i = 0; i < 3; i++) spawnBeam(e.x, e.y, base + i * TAU / 3, 1000, 18, 0.6, 1.1, 15, '#7dd3fc', 0.2);
    }
  } else if (e.pattern === 'storm') {
    if (p === 1) {
      for (let i = 0; i < 3; i++) spawnHazardAt(px + rnd(-120, 120), py + rnd(-120, 120), 'storm', 1, 0.7, 0.5);
    } else {
      for (let i = 0; i < 4; i++) spawnHazardAt(px + rnd(-150, 150), py + rnd(-150, 150), 'storm', 1, 0.65, 0.5);
      spawnBeam(e.x, e.y, Math.atan2(py - e.y, px - e.x), 950, 18, 0.55, 0.9, 14, '#fde047', 0);
    }
  } else if (e.pattern === 'final') {
    if (p === 1) {
      spawnHazardAt(px, py, pick(['ember', 'storm']), 1, 0.75, 2.8);
    } else {
      bossRingGap(e, 18, 0.7, 190, 14, 'orb', '#ff5c8a', e.rot);
    }
  }
}
function updateBoss(e, dt) {
  if (!e || e.dead || game.voidActive) return;
  const dx = player.x - e.x, dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const ratio = e.hp / e.maxHp;
  const np = ratio < 0.33 ? 2 : ratio < 0.66 ? 1 : 0;
  if (np !== e.phase) {
    e.phase = np;
    game.shake = 14;
    game.flash = Math.max(game.flash, 0.5);
    showBanner('BOSS 第 ' + (np + 1) + ' 阶段', '', e.color);
    e.phaseSkillTimer = 0.8;
    if (e.pattern === 'twin') {
      if (np === 1) e.mirrorTimer = Math.min(e.mirrorTimer, 0.8);
      if (np === 2) { e.swapTimer = Math.min(e.swapTimer, 1.8); e.mirrorBeamTimer = Math.min(e.mirrorBeamTimer, 1.2); }
    } else if (e.pattern === 'rift') {
      e.riftTimer = Math.min(e.riftTimer, 2.2);
    } else if (e.pattern === 'hive') {
      if (np === 2) e.hiveTimer = Math.min(e.hiveTimer, 1.5);
    } else if (e.pattern === 'forge') {
      e.magmaTimer = Math.min(e.magmaTimer, 1.8);
    } else if (e.pattern === 'weaver') {
      e.voidTimer = Math.min(e.voidTimer, 3.5);
    } else if (e.pattern === 'storm') {
      e.lightningTimer = Math.min(e.lightningTimer, 1.8);
    } else if (e.pattern === 'final') {
      e.sectorShots = 0;
      e.sectorTimer = 2.0;
    }
    sfx.boss();
  }
  e.rot += dt * (0.6 + e.phase * 0.25);

  if (e.pattern === 'rift') {
    bossMove(e, dt, 250, 1);
    e.ringTimer -= dt;
    if (e.ringTimer <= 0) {
      bossRing(e, 16 + e.phase * 4, 145 + e.phase * 20, 11 + e.phase * 2, 'orb', '#ff5c8a');
      e.ringTimer = 2.3 - e.phase * 0.3;
    }
    e.summonTimer -= dt;
    if (e.summonTimer <= 0) { bossSummon(e, 'grunt', 2); e.summonTimer = 6; }
    if (e.phase > 0) {
      e.spiralTimer -= dt;
      if (e.spiralTimer <= 0) {
        bossSpiralStep(e, 3, 135, 9, 'orb', '#c084fc');
        e.spiralAngle += 0.3;
        e.spiralTimer = 0.2;
      }
      e.riftTimer -= dt;
      if (e.riftTimer <= 0) {
        openPortal('rift', e.x + rnd(-90, 90), e.y + rnd(-90, 90), 0.9, 2.4);
        showBanner('裂隙开启', '10 个敌人正在涌出', '#c084fc');
        e.riftTimer = e.phase === 2 ? 9 : 12;
      }
    }
  } else if (e.pattern === 'hive') {
    bossMove(e, dt, 330, 0.8);
    e.spiralTimer -= dt;
    if (e.spiralTimer <= 0) {
      bossSpiralStep(e, 2, 118, 8, 'orb', '#d9f99d');
      e.spiralAngle += 0.27;
      e.spiralTimer = e.phase > 0 ? 0.12 : 0.17;
    }
    e.ringTimer -= dt;
    if (e.ringTimer <= 0) {
      bossRing(e, 12, 135, 9, 'orb', '#a3e635');
      e.ringTimer = 3.2;
    }
    e.summonTimer -= dt;
    if (e.summonTimer <= 0) { bossSummon(e, pick(['orbiter', 'swift']), 2); e.summonTimer = 5; }
    if (e.phase === 2 && !e.hiveSummoned) {
      e.hiveTimer -= dt;
      if (e.hiveTimer <= 0) {
        openPortal('hive', e.x + rnd(-80, 80), e.y + rnd(-80, 80), 1.2, 3.2);
        e.hiveSummoned = true;
        showBanner('蜂巢降临', '20 只蜂群正在涌出', '#a3e635');
      }
    }
  } else if (e.pattern === 'forge') {
    if (e.charging) {
      e.chargeWarm -= dt;
      if (e.chargeWarm <= 0) {
        e.charging = false;
        const a = Math.atan2(e.chargeY - e.y, e.chargeX - e.x);
        e.dashX = Math.cos(a); e.dashY = Math.sin(a);
        e.dashTime = 0.42;
        e.trailTimer = 0;
      }
    } else if (e.dashTime > 0) {
      e.x += e.dashX * 640 * dt;
      e.y += e.dashY * 640 * dt;
      e.dashTime -= dt;
      e.trailTimer -= dt;
      if (e.trailTimer <= 0) {
        spawnHazardAt(e.x, e.y, 'ember', 0.62, 0.15, 2.4);
        e.trailTimer = 0.1;
      }
      if (e.dashTime <= 0) {
        spawnHazardAt(e.x, e.y, 'ember', 1.1, 0.1, 4);
        waves.push({ x: e.x, y: e.y, r: 20, maxR: 190, life: 0.45, maxLife: 0.45, color: '#fb923c' });
        game.shake = 10;
      }
    } else {
      bossMove(e, dt, 250, 0.7);
      e.ringTimer -= dt;
      if (e.ringTimer <= 0) {
        bossRing(e, 14, 150, 12, 'orb', '#ff9f43');
        e.ringTimer = 2.8;
      }
      e.chargeTimer -= dt;
      if (e.chargeTimer <= 0) {
        e.charging = true;
        e.chargeWarm = 0.9;
        e.chargeX = player.x;
        e.chargeY = player.y;
        e.chargeTimer = 4.8;
      }
    }
    e.aimTimer -= dt;
    if (e.aimTimer <= 0) {
      bossAim(e, 3, 0.14, 220, 13, 'shard', '#fb923c');
      e.aimTimer = 2.1;
    }
    e.magmaTimer -= dt;
    if (e.magmaTimer <= 0) {
      for (let i = 0; i < 2; i++) {
        spawnHazardAt(player.x + rnd(-120, 120), player.y + rnd(-120, 120), 'magma', 1, 0.6, 3);
      }
      e.magmaTimer = 5.5 - e.phase * 1.1;
    }
  } else if (e.pattern === 'weaver') {
    if (e.teleportWarm > 0) {
      e.teleportWarm -= dt;
      if (e.teleportWarm <= 0) {
        e.x = e.teleX; e.y = e.teleY;
        for (let i = 0; i < 4; i++) spawnBeam(e.x, e.y, i * TAU / 4 + Math.PI / 4, 950, 22, 0.5, 0.9, 14, '#a78bfa', 0);
        game.shake = 8;
        sfx.explode();
        e.teleportTimer = 4.2;
      }
    } else {
      bossMove(e, dt, 260, 0.9);
      e.teleportTimer -= dt;
      if (e.teleportTimer <= 0) {
        const a = rnd(TAU), r = rnd(360, 220);
        e.teleX = clamp(player.x + Math.cos(a) * r, 110, WORLD.w - 110);
        e.teleY = clamp(player.y + Math.sin(a) * r, 110, WORLD.h - 110);
        e.teleportWarm = 0.9;
      }
    }
    e.aimTimer -= dt;
    if (e.aimTimer <= 0) { bossAim(e, 3, 0.2, 225, 13, 'shard', '#c084fc'); e.aimTimer = 1.7; }
    e.ringTimer -= dt;
    if (e.ringTimer <= 0) { bossRing(e, 10, 120, 10, 'orb', '#8b5cf6'); e.ringTimer = 3.4; }
    if (e.voidWarn > 0) {
      e.voidWarn -= dt;
      if (e.voidWarn <= 0) {
        enterVoid(e);
        return;
      }
    } else {
      e.voidTimer -= dt;
      if (e.voidTimer <= 0) {
        e.voidWarn = 1.8;
        showBanner('虚空编织', '即将被拉入虚空', '#a78bfa');
      }
    }
  } else if (e.pattern === 'prism') {
    const ang = Math.atan2(dy, dx);
    const radial = d - 300;
    e.x += (Math.cos(ang + Math.PI / 2) * e.speed * 0.6 + Math.cos(ang) * radial * 0.4) * dt;
    e.y += (Math.sin(ang + Math.PI / 2) * e.speed * 0.6 + Math.sin(ang) * radial * 0.4) * dt;
    e.beamTimer -= dt;
    if (e.beamTimer <= 0) {
      for (let i = 0; i < 3; i++) spawnBeam(e.x, e.y, e.rot + i * TAU / 3, 920, 18, 0.65, 2.2, 12, '#7dd3fc', 0.5);
      e.beamTimer = 5.2;
    }
    e.aimTimer -= dt;
    if (e.aimTimer <= 0) { bossAim(e, 5, 0.12, 230, 11, 'shard', '#7dd3fc'); e.aimTimer = 1.9; }
    e.ringTimer -= dt;
    if (e.ringTimer <= 0) { bossRing(e, 12, 145, 9, 'orb', '#38bdf8'); e.ringTimer = 3.6; }
    if (e.phase > 0) {
      e.hazardTimer -= dt;
      if (e.hazardTimer <= 0) {
        spawnHazardAt(player.x, player.y, 'frost', 1, 0.7, 3.2);
        e.hazardTimer = 6;
      }
    }
    if (!e.prismAlive) {
      e.prismSummonTimer -= dt;
      if (e.prismSummonTimer <= 0) {
        openPortal('prism', e.x + rnd(-80, 80), e.y + rnd(-80, 80), 1.1, 2.1);
        e.prismAlive = true;
        showBanner('棱镜召唤', '一个较小的棱镜核心正在成形', '#7dd3fc');
      }
    }
  } else if (e.pattern === 'storm') {
    bossMove(e, dt, 280, 1.05);
    e.ringTimer -= dt;
    if (e.ringTimer <= 0) { bossRing(e, 14, 170, 10, 'orb', '#fde047'); e.ringTimer = 2.4; }
    e.stormTimer -= dt;
    if (e.stormTimer <= 0) {
      spawnHazardAt(player.x + player.moveX * 110, player.y + player.moveY * 110, 'storm', 1, 0.7, 0.5);
      e.stormTimer = 2.3;
    }
    e.summonTimer -= dt;
    if (e.summonTimer <= 0) { bossSummon(e, pick(['swift', 'orbiter']), 2); e.summonTimer = 6; }
    e.aimTimer -= dt;
    if (e.aimTimer <= 0) { bossAim(e, 3, 0.15, 220, 11, 'shard', '#fde047'); e.aimTimer = 2; }
    if (e.phase > 0) {
      e.beamTimer -= dt;
      if (e.beamTimer <= 0) {
        spawnBeam(e.x, e.y, Math.atan2(dy, dx), 900, 16, 0.6, 0.8, 12, '#fde047', 0);
        e.beamTimer = 4.2;
      }
    }
    e.lightningTimer -= dt;
    if (e.lightningTimer <= 0) {
      spawnLightningStrike(player.x + rnd(-80, 80), player.y + rnd(-50, 50));
      e.lightningTimer = 4.8 - e.phase * 0.7;
    }
  } else if (e.pattern === 'twin') {
    bossMove(e, dt, 300, 1);
    e.satAngle += dt * 1.8;
    e.satTimer -= dt;
    if (e.satTimer <= 0) {
      for (let i = 0; i < 2; i++) {
        const sa = e.satAngle + i * Math.PI;
        const sx = e.x + Math.cos(sa) * 82;
        const sy = e.y + Math.sin(sa) * 82;
        const aa = Math.atan2(player.y - sy, player.x - sx);
        spawnEBullet(sx, sy, aa, 225, 10, '#f9a8d4', 5, 'shard');
      }
      e.satTimer = 1.6;
    }
    e.ringTimer -= dt;
    if (e.ringTimer <= 0) { bossRing(e, 12, 145, 10, 'orb', '#f9a8d4'); e.ringTimer = 3; }
    e.aimTimer -= dt;
    if (e.aimTimer <= 0) { bossAim(e, 3, 0.16, 230, 11, 'shard', '#fb7185'); e.aimTimer = 1.9; }

    // Mirror images fire symmetrical fans from both sides of the arena.
    e.mirrorShotTimer -= dt;
    if (e.mirrorShotTimer <= 0) {
      const base = Math.atan2(player.y - e.y, player.x - e.x);
      const off = e.r + 88;
      for (let s = -1; s <= 1; s += 2) {
        const mx = e.x + s * off;
        const my = e.y + Math.sin(game.time * 1.2 + s) * 10;
        for (let k = -1; k <= 1; k++) {
          spawnEBullet(mx, my, base + k * 0.18 + s * 0.06, 235, 9, s < 0 ? '#f9a8d4' : '#fb7185', 5, 'shard');
        }
      }
      e.mirrorShotTimer = 3.8;
    }

    // Phase 1: mirror the player's horizontal movement.
    if (e.phase >= 1) {
      if (e.mirrorWarn > 0) {
        e.mirrorWarn -= dt;
        if (e.mirrorWarn <= 0) {
          game.mirrorTime = 2.4;
          e.mirrorTimer = e.phase === 2 ? 8 : 11;
          showBanner('镜面翻转', '左右移动反转 2.4 秒', '#f472b6');
          game.flash = Math.max(game.flash, 0.35);
          sfx.boss();
        }
      } else {
        e.mirrorTimer -= dt;
        if (e.mirrorTimer <= 0) {
          e.mirrorWarn = 0.9;
          showBanner('镜面预警', '即将左右反转', '#f9a8d4');
        }
      }
    }

    // Phase 2: swap places with the player and fire mirrored beams.
    if (e.phase >= 2) {
      if (e.swapWarn > 0) {
        e.swapWarn -= dt;
        if (e.swapWarn <= 0) {
          const px = player.x, py = player.y;
          const bx = e.x, by = e.y;
          e.x = clamp(px, 70, WORLD.w - 70);
          e.y = clamp(py, 70, WORLD.h - 70);
          player.x = clamp(bx, 24, WORLD.w - 24);
          player.y = clamp(by, 24, WORLD.h - 24);
          player.invuln = Math.max(player.invuln, 0.9);
          e.swapTimer = 12;
          waves.push({ x: e.x, y: e.y, r: 12, maxR: 210, life: 0.45, maxLife: 0.45, color: '#f472b6' });
          waves.push({ x: player.x, y: player.y, r: 12, maxR: 170, life: 0.4, maxLife: 0.4, color: '#fb7185' });
          game.shake = 14;
          sfx.explode();
        }
      } else {
        e.swapTimer -= dt;
        if (e.swapTimer <= 0) {
          e.swapWarn = 0.9;
          showBanner('空间换位', 'BOSS 即将与你交换位置', '#f472b6');
        }
      }
      e.mirrorBeamTimer -= dt;
      if (e.mirrorBeamTimer <= 0) {
        const base = Math.atan2(player.y - e.y, player.x - e.x);
        spawnBeam(e.x, e.y, base, 1000, 16, 0.55, 0.9, 14, '#f472b6', 0);
        spawnBeam(e.x, e.y, Math.PI - base, 1000, 16, 0.55, 0.9, 14, '#fb7185', 0);
        e.mirrorBeamTimer = 5.2;
      }
    }
  } else {
    // FINAL: layered bullet-hell with a deliberate escape gap, blink windows and dashable lasers.
    if (e.teleportWarm > 0) {
      e.teleportWarm -= dt;
      if (e.teleportWarm <= 0) {
        e.x = e.teleX;
        e.y = e.teleY;
        bossRingGap(e, 20 + e.phase * 6, 0.82, 145, 13, 'orb', '#ff5c8a', e.rot);
        waves.push({ x: e.x, y: e.y, r: 12, maxR: 150, life: 0.4, maxLife: 0.4, color: '#ff5c8a' });
        game.shake = 12;
        sfx.explode();
        e.teleportTimer = 6.2;
      }
    } else {
      bossMove(e, dt, 300, 1.15);
      e.teleportTimer -= dt;
      if (e.teleportTimer <= 0) {
        const a = rnd(TAU), r = rnd(380, 260);
        e.teleX = clamp(player.x + Math.cos(a) * r, cam.x + 120, cam.x + VW - 120);
        e.teleY = clamp(player.y + Math.sin(a) * r, cam.y + 120, cam.y + VH - 120);
        e.teleportWarm = 0.55;
      }
    }

    e.ringTimer -= dt;
    if (e.ringTimer <= 0) {
      bossRingGap(e, 16 + e.phase * 4, 0.78, 150 + e.phase * 18, 12 + e.phase * 2, 'orb', '#ff5c8a', e.rot);
      e.ringTimer = 2.0 - e.phase * 0.15;
    }
    e.aimTimer -= dt;
    if (e.aimTimer <= 0) {
      bossAim(e, 5 + e.phase, 0.1, 250, 13, 'shard', '#fb7185');
      e.aimTimer = 1.55;
    }
    e.spiralTimer -= dt;
    if (e.spiralTimer <= 0) {
      bossSpiralStep(e, 3 + e.phase, 160 + e.phase * 15, 9, 'orb', '#c084fc');
      e.spiralAngle += 0.23;
      e.spiralTimer = 0.2 - e.phase * 0.02;
    }
    e.beamTimer -= dt;
    if (e.beamTimer <= 0) {
      const n = 2 + e.phase;
      for (let i = 0; i < n; i++) {
        spawnBeam(e.x, e.y, e.rot + i * TAU / n + e.phase * 0.25, 1100, 18, 0.55, 1.3, 14, '#ff5c8a', 0.32);
      }
      e.beamTimer = 5.0 - e.phase * 0.4;
    }
    e.hazardTimer -= dt;
    if (e.hazardTimer <= 0) {
      spawnHazardAt(player.x, player.y, pick(['ember', 'storm']), 1, 0.75, 2.6);
      e.hazardTimer = 3.6;
    }
    e.summonTimer -= dt;
    if (e.summonTimer <= 0) {
      bossSummon(e, pick(['bomber', 'sniper']), 2);
      e.summonTimer = 8;
    }
    if (e.sectorShots < 3) {
      e.sectorTimer -= dt;
      if (e.sectorTimer <= 0) {
        spawnSectorStrike(e.x, e.y, Math.atan2(player.y - e.y, player.x - e.x));
        e.sectorShots += 1;
        e.sectorTimer = 5.5;
      }
    }
  }
  if (e.phase > 0 && e.pattern !== 'twin') {
    e.phaseSkillTimer -= dt;
    if (e.phaseSkillTimer <= 0) {
      runPhaseSkill(e);
      e.phaseSkillTimer = e.phase === 2 ? 4.2 : 5.8;
    }
  }
}
function updateEnemies(dt) {
  if (game.hiveTouchTimer < 0) game.hiveTouchTimer = 0;
  let hiveTouch = false;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e || e.dead) { if (e) enemies.splice(i, 1); continue; }
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.orbCd = Math.max(0, e.orbCd - dt);
    if (e.poisonUntil > game.time && Number.isFinite(e.poisonDps) && e.poisonDps > 0) {
      e.poisonTick -= dt;
      if (e.poisonTick <= 0) {
        e.poisonTick = 0.5;
        damageEnemy(e, e.poisonDps * 0.5, false, { noBoom: true, noScale: true });
        if (e.dead) continue;
      }
    }

    if (e.boss) {
      updateBoss(e, dt);
    } else {
      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let ang = Math.atan2(dy, dx);
      let sp = e.speed * (1 - player.slowAura);
      if (e.slowUntil > game.time) sp *= e.slowFactor;
      if (e.type === 'swift') {
        ang += Math.sin(game.time * 7 + e.seed) * 0.7;
      } else if (e.type === 'gunner') {
        if (d < 235) ang += Math.PI;
        else if (d < 340) ang += (e.seed > Math.PI ? 1 : -1) * Math.PI / 2;
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && d < 760) {
          spawnEBullet(e.x, e.y, Math.atan2(dy, dx), 210, 9, '#fb7185', 5, 'bolt');
          e.shootTimer = 2.25;
        }
      } else if (e.type === 'orbiter') {
        e.orbitAngle += dt * 0.75;
        const tx = player.x + Math.cos(e.orbitAngle + e.seed) * 245;
        const ty = player.y + Math.sin(e.orbitAngle + e.seed) * 245;
        ang = Math.atan2(ty - e.y, tx - e.x);
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && d < 720) {
          const base = Math.atan2(dy, dx);
          for (let k = -1; k <= 1; k++) spawnEBullet(e.x, e.y, base + k * 0.16, 205, 8, '#f472b6', 5, 'orb');
          e.shootTimer = 2.7;
        }
      } else if (e.type === 'sniper') {
        if (d < 360) ang += Math.PI;
        else if (d < 520) ang += (e.seed > Math.PI ? 1 : -1) * Math.PI / 2;
        e.aimAngle = Math.atan2(dy, dx);
        if (e.charge > 0) {
          e.charge -= dt;
          if (e.charge <= 0) {
            spawnEBullet(e.x, e.y, e.aimAngle, 560, 14, '#e879f9', 5, 'bolt');
            e.shootTimer = 3;
          }
        } else {
          e.shootTimer -= dt;
          if (e.shootTimer <= 0) e.charge = 1;
        }
        if (d < 360) ang = Math.atan2(dy, dx) + Math.PI;
      } else if (e.type === 'bomber') {
        if (d < e.r + player.r + 18) {
          killEnemy(e);
          continue;
        }
      } else if (e.type === 'prismling') {
        e.orbitAngle += dt * 0.65;
        const tx = player.x + Math.cos(e.orbitAngle + e.seed) * 285;
        const ty = player.y + Math.sin(e.orbitAngle + e.seed) * 285;
        ang = Math.atan2(ty - e.y, tx - e.x);
        e.rot += dt * 1.4;
        e.laserTimer -= dt;
        if (e.laserTimer <= 0) {
          spawnBeam(e.x, e.y, Math.atan2(dy, dx), 1000, 14, 1.5, 0.45, 10, '#7dd3fc', 0);
          e.laserTimer = 5.2;
        }
      } else if (e.type === 'elite') {
        e.ringTimer -= dt;
        if (e.ringTimer <= 0) {
          const off = rnd(TAU);
          for (let k = 0; k < 10; k++) spawnEBullet(e.x, e.y, off + k * TAU / 10, 125, 8, '#fb923c', 4, 'orb');
          e.ringTimer = 3.6;
        }
      }
      e.x += (Math.cos(ang) * sp + e.kx) * dt;
      e.y += (Math.sin(ang) * sp + e.ky) * dt;
      e.rot += dt * (e.type === 'swift' ? 5 : 1.8);
    }
    e.kx *= Math.pow(0.018, dt);
    e.ky *= Math.pow(0.018, dt);
    e.x = clamp(e.x, e.r, WORLD.w - e.r);
    e.y = clamp(e.y, e.r, WORLD.h - e.r);

    if (e.boss && game.voidActive) continue;
    if (e.hiveMob && Math.hypot(player.x - e.x, player.y - e.y) < player.r + e.r) hiveTouch = true;
    if (player.invuln <= 0 && Math.hypot(player.x - e.x, player.y - e.y) < player.r + e.r) {
      if (e.type === 'bomber') { killEnemy(e); continue; }
      if (e.hiveMob) continue;
      hurtPlayer(e.dmg);
      const away = Math.atan2(player.y - e.y, player.x - e.x);
      e.kx += Math.cos(away) * 230;
      e.ky += Math.sin(away) * 230;
      if (player.thorns > 0) damageEnemy(e, player.thorns, false);
    }
  }
  if (hiveTouch && game.hiveDotTime <= 0) {
    game.hiveDotTime = 5;
    game.hiveTouchTimer = 0;
    floatText(player.x, player.y - 42, '蜂群腐蚀 5s', '#a3e635');
    burst(player.x, player.y, '#a3e635', 8, 90, 3);
  }
  if (game.hiveDotTime > 0) {
    game.hiveDotTime -= dt;
    game.hiveTouchTimer -= dt;
    if (game.hiveTouchTimer <= 0) { hurtPlayer(1); game.hiveTouchTimer = 1; }
    if (game.hiveDotTime <= 0) { game.hiveDotTime = 0; game.hiveTouchTimer = 0; }
  } else {
    game.hiveTouchTimer = 0;
  }
}

/* ------------------------------------------------------------------ */
/*  bullets / damage                                                   */
/* ------------------------------------------------------------------ */
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.type === 'rocket') {
      b.life -= dt;
      if (!b.target || b.target.dead) b.target = nearestEnemy(b.x, b.y, 900);
      if (b.target && !b.target.dead) {
        const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
        b.angle += clamp(normAngle(want - b.angle), -6 * dt, 6 * dt);
        b.speed += 120 * dt;
      }
      b.vx = Math.cos(b.angle) * b.speed;
      b.vy = Math.sin(b.angle) * b.speed;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.trail -= dt;
      if (b.trail <= 0) {
        b.trail = 0.025;
        particles.push({ x: b.x, y: b.y, vx: rnd(-15, 15), vy: rnd(-15, 15), life: 0.3, maxLife: 0.3, size: rnd(5, 2), color: '#fbbf24' });
      }
      const close = b.target && Math.hypot(b.target.x - b.x, b.target.y - b.y) < b.target.r + 12;
      if (close || b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.w || b.y > WORLD.h) {
        explodeAt(b.x, b.y, 76, b.dmg, '#fbbf24');
        bullets.splice(i, 1);
      }
      continue;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.y < -20 || b.x > WORLD.w + 20 || b.y > WORLD.h + 20) {
      bullets.splice(i, 1);
      continue;
    }
    let removed = false, bounced = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (e.dead || b.hit.indexOf(e.id) !== -1) continue;
      const rr = b.r + e.r;
      if ((b.x - e.x) * (b.x - e.x) + (b.y - e.y) * (b.y - e.y) <= rr * rr) {
        b.hit.push(e.id);
        damageEnemy(e, b.dmg, b.crit, { frost: b.frost, poison: b.poison });
        if (b.bounces > 0) {
          const next = nearestFrom(b.x, b.y, 300, new Set(b.hit));
          if (next) {
            const na = Math.atan2(next.y - b.y, next.x - b.x);
            b.vx = Math.cos(na) * player.bulletSpeed;
            b.vy = Math.sin(na) * player.bulletSpeed;
            b.life = Math.max(b.life, 0.6);
            b.bounces -= 1;
            b.color = '#bae6fd';
            bounced = true;
            break;
          }
        }
        if (b.hit.length > b.pierce) { bullets.splice(i, 1); removed = true; break; }
      }
    }
    if (removed || bounced) continue;
  }
}
function explodeAt(x, y, radius, dmg, color) {
  waves.push({ x, y, r: 10, maxR: radius, life: 0.38, maxLife: 0.38, color });
  for (const e of [...enemies]) {
    if (!e.dead && Math.hypot(e.x - x, e.y - y) < radius + e.r) damageEnemy(e, dmg, false);
  }
  burst(x, y, color, 20, 310, 5);
  game.shake = Math.max(game.shake, 7);
  sfx.explode();
}
function updateEnemyBullets(dt) {
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < -30 || b.y < -30 || b.x > WORLD.w + 30 || b.y > WORLD.h + 30) {
      ebullets.splice(i, 1);
      continue;
    }
    if (player.invuln <= 0 && Math.hypot(player.x - b.x, player.y - b.y) < player.r + b.r) {
      hurtPlayer(b.dmg);
      ebullets.splice(i, 1);
    }
  }
}
function damageEnemy(e, dmg, crit, opts) {
  if (!e || e.dead || game.state === 'gameover' || game.state === 'victory') return;
  if (!Number.isFinite(dmg) || dmg <= 0) return;
  opts = opts || {};
  if (e.damageScale && e.damageScale > 1 && !opts.noScale) dmg *= e.damageScale;
  if (player.upg.execute && e.hp < e.maxHp * 0.3) dmg *= 1 + 0.25 * player.upg.execute;
  if (opts.frost && !e.boss) {
    e.slowUntil = Math.max(e.slowUntil, game.time + 1.5);
    e.slowFactor = Math.max(0.45, 1 - 0.12 * opts.frost);
  }
  if (opts.poison) {
    // poisonDps already includes the boss damage scale; ticks must not scale again
    const poison = (2 + 2 * opts.poison) * player.dmgMul * (e.boss ? 0.4 : 1) * (e.damageScale || 1);
    if (Number.isFinite(poison) && poison > 0) {
      e.poisonDps = Math.max(e.poisonDps || 0, poison);
      e.poisonUntil = game.time + 3;
      e.poisonTick = Math.min(e.poisonTick || 0.5, 0.5);
    }
  }
  e.hp -= dmg;
  e.hitFlash = 0.1;
  if (e.boss && !crit && (!e.lastDmgText || game.time - e.lastDmgText > 0.18)) {
    e.lastDmgText = game.time;
    floatText(e.x + rnd(-18, 18), e.y - e.r - 16, '-' + Math.round(dmg), '#ffd1dc');
  }
  if (crit) floatText(e.x, e.y - e.r - 8, 'CRIT ' + Math.round(dmg), '#fde68a');
  if (Math.random() < 0.55) {
    particles.push({ x: e.x + rnd(-e.r, e.r), y: e.y + rnd(-e.r, e.r), vx: rnd(-120, 120), vy: rnd(-120, 120), life: 0.24, maxLife: 0.24, size: rnd(4, 2), color: e.color });
  }
  if (crit && player.upg.critexplode && !opts.noBoom) {
    const lvl = player.upg.critexplode, rad = 48 + 8 * lvl;
    waves.push({ x: e.x, y: e.y, r: 8, maxR: rad, life: 0.25, maxLife: 0.25, color: '#fde68a' });
    for (const o of [...enemies]) {
      if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < rad + o.r) {
        damageEnemy(o, dmg * 0.32, false, { noBoom: true, noChainBoom: true });
      }
    }
  }
  if (opts.noChainBoom) e.noChainBoom = true;
  if (e.hp <= 0) killEnemy(e);
}
function bomberBoom(e) {
  waves.push({ x: e.x, y: e.y, r: 10, maxR: 105, life: 0.35, maxLife: 0.35, color: '#fb923c' });
  burst(e.x, e.y, '#fb923c', 28, 330, 5);
  game.shake = Math.max(game.shake, 8);
  if (Math.hypot(player.x - e.x, player.y - e.y) < 100 + player.r) hurtPlayer(24);
  sfx.explode();
}
function killEnemy(e) {
  if (!e || e.dead) return;
  e.dead = true;
  const idx = enemies.indexOf(e);
  if (idx !== -1) enemies.splice(idx, 1);
  if (e.type === 'bomber' && !e.exploded) {
    e.exploded = true;
    bomberBoom(e);
  }
  const chainLvl = player.upg.chainexplode || 0;
  if (chainLvl && !e.noChainBoom) {
    const rad = 55 + 10 * chainLvl;
    waves.push({ x: e.x, y: e.y, r: 8, maxR: rad, life: 0.32, maxLife: 0.32, color: '#ff9f43' });
    for (const o of [...enemies]) {
      if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < rad + o.r) {
        damageEnemy(o, (20 + 14 * chainLvl) * player.dmgMul, false, { noBoom: true, noChainBoom: true });
      }
    }
  }
  game.kills += 1;
  if (e.voidMob) {
    game.voidKills += 1;
    if (game.voidKills >= game.voidNeed) game.voidExitTimer = 1;
  } else if (!e.boss) {
    game.stageKills += 1;
  }
  if (e.type === 'prismling') {
    const b = game.boss;
    if (b && !b.dead) { b.prismAlive = false; b.prismSummonTimer = 30; }
  }
  game.combo = Math.min(10, game.combo + (e.boss ? 1 : 0.08));
  game.comboTimer = 2.5;
  game.score += Math.round((e.score || 10) * game.combo * player.scoreMul);
  game.shake = Math.max(game.shake, e.boss ? 24 : e.elite ? 8 : 2);

  burst(e.x, e.y, e.color, e.boss ? 70 : e.elite ? 34 : 12, e.boss ? 520 : 260, e.boss ? 9 : 4);
  waves.push({ x: e.x, y: e.y, r: 6, maxR: e.boss ? 260 : e.elite ? 100 : 34, life: e.boss ? 0.8 : 0.32, maxLife: e.boss ? 0.8 : 0.32, color: e.color });

  if (!game.challengeMode && !e.voidMob) {
    const gemCount = e.boss ? 18 : e.elite ? 8 : e.type === 'brute' ? 3 : 1;
    for (let i = 0; i < gemCount; i++) {
      const a = rnd(TAU), sp = rnd(190, 40);
      gems.push({
        x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        value: Math.max(0.3, e.xp / gemCount), r: 4, life: 30, attract: !!e.boss, fast: !!e.boss, wobble: rnd(TAU)
      });
    }
  }
  if (e.elite) pickups.push({ type: 'core', x: e.x + 10, y: e.y, r: 13, life: 25, bob: rnd(TAU) });
  if (e.boss || e.elite || Math.random() < 0.035) pickups.push({ type: 'heal', x: e.x - 12, y: e.y, r: 12, life: 25, bob: rnd(TAU) });
  if (e.elite || Math.random() < 0.018) pickups.push({ type: 'overdrive', x: e.x + 14, y: e.y + 8, r: 12, life: 25, bob: rnd(TAU) });
  if (e.type === 'brute' && !e.noSplit) {
    for (let i = 0; i < 2; i++) {
      const g = spawnEnemy('grunt', e.x + rnd(-22, 22), e.y + rnd(-22, 22), { size: 0.8 });
      if (g) { g.hp = g.maxHp = Math.max(8, g.maxHp * 0.55); if (e.voidMob) { g.voidMob = true; g.xp = 0; } if (e.hiveMob) g.hiveMob = true; }
    }
  }
  const gemCap = game.quality === 'low' ? 120 : 200;
  if (gems.length > gemCap) gems.splice(0, gems.length - gemCap);
  if (player.lifesteal > 0) player.hp = Math.min(player.maxHp, player.hp + player.lifesteal);
  if (e.boss) bossDown(e);
}
function bossDown(e) {
  game.boss = null;
  hideBossBar();
  ebullets.length = 0;
  beams.length = 0;
  hazards.length = 0;
  game.shake = 30;
  game.flash = 1;
  game.mirrorTime = 0;
  game.hiveDotTime = 0;
  game.hiveTouchTimer = 0;
  player.invuln = Math.max(player.invuln, 2);
  for (let i = 0; i < 3; i++) {
    waves.push({ x: e.x, y: e.y, r: 10, maxR: 260 + i * 90, life: 0.85, maxLife: 0.85, color: i === 1 ? '#ff3d8b' : '#a78bfa' });
  }
  if (game.challengeMode) {
    game.finishTimer = 2.0;
    showBanner('BOSS 击破', '挑战成功 // 核心熄灭', '#5eead4');
    sfx.win();
  } else if (e.final) {
    game.finishTimer = 2.4;
    showBanner('终焉核心 已摧毁', '八区净化 // EXTRACTION READY', '#5eead4');
    sfx.win();
  } else {
    game.intermission = 3.8;
    game.stageBossSpawned = true;
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.16);
    game.score += 1200 * (e.stage + 1);
    showBanner('区域净化 // ' + STAGES[e.stage].name, '下一区域即将开启 · 回复 16% 生命', '#5eead4');
    sfx.stage();
  }
}

/* ------------------------------------------------------------------ */
/*  pickups / effects                                                  */
/* ------------------------------------------------------------------ */
function updateGems(dt) {
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i];
    g.life -= dt;
    if (g.life <= 0) { gems.splice(i, 1); continue; }
    const dx = player.x - g.x, dy = player.y - g.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < player.magnet || g.attract) {
      g.attract = true;
      const sp = g.fast ? 760 : 280 + Math.max(0, 1 - d / (player.magnet + 1)) * 420;
      g.x += (dx / d) * sp * dt;
      g.y += (dy / d) * sp * dt;
    } else {
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= Math.pow(0.02, dt);
      g.vy *= Math.pow(0.02, dt);
    }
    if (d < player.r + g.r + 6) {
      gainXp(g.value);
      game.score += Math.round(2 * game.combo * player.scoreMul);
      if (game.time - game.lastGemSfx > 0.08) { sfx.gem(); game.lastGemSfx = game.time; }
      burst(g.x, g.y, '#67e8f9', 3, 90, 2);
      gems.splice(i, 1);
    }
  }
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt; p.bob += dt * 3;
    if (p.life <= 0) { pickups.splice(i, 1); continue; }
    const d = Math.hypot(player.x - p.x, player.y - p.y);
    if (d < player.r + p.r + 8) {
      if (p.type === 'heal') { heal(30); sfx.pickup(); }
      if (p.type === 'overdrive') {
        player.overdrive = 6;
        floatText(player.x, player.y - 30, 'OVERDRIVE', '#fbbf24');
        sfx.pickup();
      }
      if (p.type === 'core') {
        gainXp(10 + player.level * 3);
        game.score += 100;
        floatText(player.x, player.y - 30, 'DATA CORE', '#a78bfa');
        sfx.pickup();
      }
      burst(p.x, p.y, p.type === 'heal' ? '#5eead4' : p.type === 'overdrive' ? '#fbbf24' : '#a78bfa', 10, 160, 3);
      pickups.splice(i, 1);
    }
  }
}
function updateWaves(dt) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i];
    w.life -= dt;
    w.r = lerp(w.maxR, 12, w.life / w.maxLife);
    if (w.life <= 0) waves.splice(i, 1);
  }
  for (let i = lightnings.length - 1; i >= 0; i--) {
    lightnings[i].life -= dt;
    if (lightnings[i].life <= 0) lightnings.splice(i, 1);
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= Math.pow(0.08, dt);
    p.vy *= Math.pow(0.08, dt);
  }
  const particleCap = game.quality === 'low' ? 200 : 360;
  if (particles.length > particleCap) particles.splice(0, particles.length - particleCap);
}
function updateTexts(dt) {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt; t.y -= 28 * dt;
    if (t.life <= 0) texts.splice(i, 1);
  }
}
function hurtPlayer(amount) {
  if (player.invuln > 0 || game.state !== 'playing') return;
  if (player.shield > 0) {
    player.shield -= 1;
    player.shieldTimer = 6;
    player.invuln = 0.75;
    game.shake = Math.max(game.shake, 5);
    floatText(player.x, player.y - 30, 'SHIELD', '#7dd3fc');
    burst(player.x, player.y, '#7dd3fc', 14, 180, 3);
    sfx.pickup();
    return;
  }
  const dmg = Math.max(1, amount - player.armor);
  player.hp = Math.max(0, player.hp - dmg);
  player.invuln = 0.55;
  game.shake = Math.max(game.shake, 9);
  game.flash = Math.max(game.flash, 0.32);
  floatText(player.x, player.y - 28, '-' + Math.round(dmg), '#ff5c8a');
  burst(player.x, player.y, '#ff5c8a', 12, 180, 3);
  sfx.hurt();
  if (player.hp <= 0) endGame(false);
}
function burst(x, y, color, count, speed, size) {
  for (let i = 0; i < count; i++) {
    const a = rnd(TAU), s = rnd(speed * 0.22, speed);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rnd(0.75, 0.22), maxLife: 0.75, size: rnd(size, size * 0.3), color
    });
  }
}
function floatText(x, y, text, color) {
  texts.push({ x, y, text, color, life: 0.8, maxLife: 0.8 });
  if (texts.length > 50) texts.splice(0, texts.length - 50);
}
function makeBolt(a, b, color) {
  const pts = [{ x: a.x, y: a.y }];
  const n = 7;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const jitter = rnd(-14, 14);
    pts.push({ x: a.x + dx * t + nx * jitter, y: a.y + dy * t + ny * jitter });
  }
  pts.push({ x: b.x, y: b.y });
  return { pts, life: 0.2, maxLife: 0.2, color };
}

/* ------------------------------------------------------------------ */
/*  rendering                                                          */
/* ------------------------------------------------------------------ */
const glowCache = new Map();
function glowSprite(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, color);
  grd.addColorStop(0.35, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}
function drawGlow(color, x, y, size, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha == null ? 0.35 : alpha;
  ctx.drawImage(glowSprite(color), x - size, y - size, size * 2, size * 2);
  ctx.restore();
}
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const stage = STAGES[game.stageIndex] || STAGES[0];
  const bg = ctx.createLinearGradient(0, 0, 0, VH);
  bg.addColorStop(0, stage.bg0);
  bg.addColorStop(0.55, stage.bg1);
  bg.addColorStop(1, '#04030a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VW, VH);

  const now = performance.now() / 1000;
  let sx = 0, sy = 0;
  if (game.shake > 0) {
    sx = rnd(-game.shake, game.shake);
    sy = rnd(-game.shake, game.shake);
  }
  ctx.save();
  ctx.translate(-cam.x + sx, -cam.y + sy);
  drawGrid();
  drawStars(now);
  drawHazards();
  drawPortals(now);
  drawStrikes(now);
  drawSectors(now);
  drawGems(now);
  drawPickups(now);
  drawWaves();
  drawBeams();
  drawBullets();
  drawTurrets();
  drawEnemies();
  drawPlayer();
  drawEnemyBullets();
  drawBeamFx();
  drawParticles();
  drawLightnings();
  drawTexts();
  ctx.restore();

  if (game.mirrorTime > 0) drawMirrorOverlay(now);
  if (game.voidActive) drawVoidOverlay(now);
  if (game.flash > 0) {
    ctx.fillStyle = 'rgba(255,70,130,' + (game.flash * 0.28) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }
  if (game.state === 'title') drawTitleDecor(now);
}
function drawMirrorOverlay(t) {
  const a = clamp(game.mirrorTime / 2.4, 0, 1);
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, VW, 0);
  g.addColorStop(0, 'rgba(244,114,182,' + (0.08 * a) + ')');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(251,113,133,' + (0.08 * a) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
  ctx.strokeStyle = 'rgba(255,190,225,' + (0.6 * a) + ')';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 10]);
  ctx.beginPath(); ctx.moveTo(VW / 2, 0); ctx.lineTo(VW / 2, VH); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 8);
  ctx.fillStyle = '#ffd1e6';
  ctx.font = '700 12px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('MIRROR // 左右反转', VW / 2, 34);
  ctx.restore();
}
function drawGrid() {
  const stage = STAGES[game.stageIndex] || STAGES[0];
  const step = 90;
  const x0 = Math.floor(cam.x / step) * step;
  const y0 = Math.floor(cam.y / step) * step;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = stage.grid;
  ctx.beginPath();
  for (let x = x0; x <= cam.x + VW + step; x += step) {
    if (x < 0 || x > WORLD.w) continue;
    ctx.moveTo(x, Math.max(0, cam.y));
    ctx.lineTo(x, Math.min(WORLD.h, cam.y + VH));
  }
  for (let y = y0; y <= cam.y + VH + step; y += step) {
    if (y < 0 || y > WORLD.h) continue;
    ctx.moveTo(Math.max(0, cam.x), y);
    ctx.lineTo(Math.min(WORLD.w, cam.x + VW), y);
  }
  ctx.stroke();

  ctx.strokeStyle = stage.gridMajor;
  ctx.beginPath();
  for (let x = Math.floor(cam.x / 450) * 450; x <= cam.x + VW + 450; x += 450) {
    if (x < 0 || x > WORLD.w) continue;
    ctx.moveTo(x, Math.max(0, cam.y));
    ctx.lineTo(x, Math.min(WORLD.h, cam.y + VH));
  }
  for (let y = Math.floor(cam.y / 450) * 450; y <= cam.y + VH + 450; y += 450) {
    if (y < 0 || y > WORLD.h) continue;
    ctx.moveTo(Math.max(0, cam.x), y);
    ctx.lineTo(Math.min(WORLD.w, cam.x + VW), y);
  }
  ctx.stroke();

  ctx.strokeStyle = hexA(stage.accent, 0.32);
  ctx.lineWidth = 2;
  ctx.shadowColor = stage.accent;
  ctx.shadowBlur = 18;
  ctx.strokeRect(0, 0, WORLD.w, WORLD.h);
  ctx.restore();
}
function drawStars(t) {
  const stage = STAGES[game.stageIndex] || STAGES[0];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of stars) {
    if (s.x < cam.x - 10 || s.x > cam.x + VW + 10 || s.y < cam.y - 10 || s.y > cam.y + VH + 10) continue;
    ctx.globalAlpha = s.a * (0.62 + 0.38 * Math.sin(t * 1.8 + s.p));
    ctx.fillStyle = stage.accent;
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.restore();
}
function drawHazards() {
  for (const h of hazards) {
    if (h.x < cam.x - h.r - 30 || h.x > cam.x + VW + h.r + 30 || h.y < cam.y - h.r - 30 || h.y > cam.y + VH + h.r + 30) continue;
    ctx.save();
    if (h.delay > 0) {
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(game.time * 11 + h.x * 0.02);
      ctx.strokeStyle = h.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 8]);
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = h.color;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
      const p = clamp(1 - h.delay / Math.max(0.01, h.delayMax), 0, 1);
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r - 9, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.stroke();
    } else {
      const a = clamp(h.life / h.maxLife, 0, 1);
      drawGlow(h.color, h.x, h.y, h.r * 1.25, 0.22 * a);
      ctx.globalAlpha = 0.12 * a;
      ctx.fillStyle = h.color;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.7 * a;
      ctx.strokeStyle = h.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.55 * a;
      if (h.type === 'frost') {
        for (let i = 0; i < 6; i++) {
          const aa = game.time * 0.3 + i * TAU / 6;
          ctx.beginPath();
          ctx.moveTo(h.x + Math.cos(aa) * h.r * 0.35, h.y + Math.sin(aa) * h.r * 0.35);
          ctx.lineTo(h.x + Math.cos(aa) * h.r * 0.85, h.y + Math.sin(aa) * h.r * 0.85);
          ctx.stroke();
        }
      } else if (h.type === 'ember' || h.type === 'magma') {
        for (let i = 0; i < 5; i++) {
          const aa = game.time * (h.type === 'magma' ? 1.3 : 0.8) + i * TAU / 5;
          const rr = h.r * (0.24 + 0.18 * Math.sin(game.time * 3 + i));
          ctx.beginPath(); ctx.arc(h.x + Math.cos(aa) * h.r * 0.42, h.y + Math.sin(aa) * h.r * 0.42, rr, 0, TAU); ctx.stroke();
        }
        if (h.type === 'magma') {
          ctx.fillStyle = 'rgba(251,146,60,0.12)';
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
        }
      } else {
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 0.52, game.time, game.time + TAU * 0.7); ctx.stroke();
      }
    }
    ctx.restore();
  }
}
function drawBeams() {
  ctx.save();
  ctx.lineCap = 'round';
  for (const b of beams) {
    const x2 = b.x + Math.cos(b.angle) * b.len;
    const y2 = b.y + Math.sin(b.angle) * b.len;
    if (b.warm > 0) {
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(game.time * 14 + b.x);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 11]);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.globalAlpha = clamp(b.life / Math.max(0.01, b.maxLife), 0, 1);
      ctx.strokeStyle = 'rgba(8,0,12,0.92)';
      ctx.lineWidth = b.width + 8;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(2, b.width * 0.22);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }
  ctx.restore();
}
function drawBeamFx() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const f of beamFx) {
    const a = clamp(f.life / f.maxLife, 0, 1);
    const x2 = f.x + Math.cos(f.angle) * f.len;
    const y2 = f.y + Math.sin(f.angle) * f.len;
    ctx.globalAlpha = a * 0.35;
    ctx.strokeStyle = f.color;
    ctx.lineWidth = f.width;
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2, f.width * 0.22);
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.restore();
}
function drawTurrets() {
  for (const t of turrets) {
    drawGlow('#22d3ee', t.x, t.y, 24, 0.35);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.fillStyle = 'rgba(8,20,30,0.9)';
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.rotate(t.angle);
    ctx.strokeStyle = '#a5f3fc';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16, 0); ctx.stroke();
    ctx.restore();
    const p = clamp(t.life / t.maxLife, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(t.x - 12, t.y - 18, 24, 3);
    ctx.fillStyle = '#67e8f9';
    ctx.fillRect(t.x - 12, t.y - 18, 24 * p, 3);
  }
}
function drawGems(t) {
  for (const g of gems) {
    if (g.x < cam.x - 20 || g.x > cam.x + VW + 20 || g.y < cam.y - 20 || g.y > cam.y + VH + 20) continue;
    if (game.quality !== 'low' && gems.length < 120) drawGlow('#22d3ee', g.x, g.y, 13, 0.34);
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(t * 2 + g.wobble);
    ctx.fillStyle = '#a5f3fc';
    ctx.beginPath();
    ctx.moveTo(0, -g.r); ctx.lineTo(g.r, 0); ctx.lineTo(0, g.r); ctx.lineTo(-g.r, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
function drawPickups(t) {
  for (const p of pickups) {
    const y = p.y + Math.sin(p.bob) * 3;
    const color = p.type === 'heal' ? '#5eead4' : p.type === 'overdrive' ? '#fbbf24' : '#a78bfa';
    drawGlow(color, p.x, y, p.r * 2.4, 0.45);
    ctx.save();
    ctx.translate(p.x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = hexA(color, 0.18);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color;
    if (p.type === 'heal') {
      ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4);
    } else if (p.type === 'overdrive') {
      ctx.beginPath(); ctx.moveTo(2, -7); ctx.lineTo(-4, 1); ctx.lineTo(0, 1); ctx.lineTo(-2, 7); ctx.lineTo(4, -1); ctx.lineTo(0, -1); ctx.closePath(); ctx.fill();
    } else {
      ctx.rotate(t * 1.5);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.lineTo(Math.cos(a) * 6, Math.sin(a) * 6); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}
function drawWaves() {
  for (const w of waves) {
    ctx.save();
    ctx.globalAlpha = clamp(w.life / w.maxLife, 0, 1) * 0.7;
    ctx.strokeStyle = w.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}
function drawBullets() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const b of bullets) {
    if (b.type === 'rocket') {
      drawGlow('#fbbf24', b.x, b.y, 16, 0.42);
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-7, 4.5); ctx.lineTo(-3, 0); ctx.lineTo(-7, -4.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      const tail = b.type === 'drone' || b.type === 'turret' ? 0.012 : 0.022;
      drawGlow(b.color, b.x, b.y, b.crit ? 22 : 13, 0.28);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.crit ? 5 : b.type === 'drone' ? 2 : 2.8;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * tail, b.y - b.vy * tail);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * tail * 0.55, b.y - b.vy * tail * 0.55);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.crit ? 2.4 : 1.4, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}
function drawEnemies() {
  for (const e of enemies) {
    if (e.boss && game.voidActive) continue;
    if (e.x < cam.x - e.r - 50 || e.x > cam.x + VW + e.r + 50 || e.y < cam.y - e.r - 50 || e.y > cam.y + VH + e.r + 50) continue;
    if (e.boss) { drawBoss(e); continue; }
    if (e.type === 'sniper' && e.charge > 0) {
      ctx.save();
      ctx.globalAlpha = 0.34 + 0.22 * Math.sin(game.time * 18);
      ctx.strokeStyle = '#ff5c8a';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(player.x, player.y); ctx.stroke();
      ctx.restore();
    }
    if (game.quality !== 'low' && (enemies.length < 70 || e.elite)) drawGlow(e.color, e.x, e.y, e.r * 2.5, e.elite ? 0.46 : 0.24);
    const r = e.r, flash = e.hitFlash > 0, col = flash ? '#ffffff' : e.color;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.fillStyle = flash ? 'rgba(255,255,255,0.72)' : 'rgba(13,4,14,0.95)';
    ctx.strokeStyle = col;

    if (e.type === 'grunt') {
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(-r * 0.34, -r * 0.9);
      ctx.lineTo(0, -r * 0.28);
      ctx.lineTo(r * 0.34, -r * 0.9);
      ctx.lineTo(r, 0);
      ctx.lineTo(r * 0.3, r * 0.65);
      ctx.lineTo(0, r * 0.38);
      ctx.lineTo(-r * 0.3, r * 0.65);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = hexA(e.color, 0.65);
      ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.2); ctx.lineTo(0, -r * 0.65); ctx.lineTo(r * 0.55, -r * 0.2); ctx.stroke();
    } else if (e.type === 'swift') {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.55);
      ctx.lineTo(r * 0.7, r * 0.55);
      ctx.lineTo(0, r * 0.18);
      ctx.lineTo(-r * 0.7, r * 0.55);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = hexA(e.color, 0.6);
      ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.35); ctx.lineTo(-r * 1.15, r * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.5, r * 0.35); ctx.lineTo(r * 1.15, r * 0.9); ctx.stroke();
    } else if (e.type === 'brute') {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * TAU / 8; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = hexA(e.color, 0.6);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * TAU / 6; ctx.lineTo(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58); }
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, TAU); ctx.stroke();
    } else if (e.type === 'gunner') {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU); ctx.fill(); ctx.stroke();
      for (let i = -1; i <= 1; i++) {
        ctx.save(); ctx.rotate(i * 0.48);
        ctx.strokeStyle = col; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(r * 0.45, 0); ctx.lineTo(r * 1.25, 0); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = flash ? '#fff' : '#ff5c8a';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.fill();
    } else if (e.type === 'orbiter') {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = hexA(e.color, 0.65);
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(0, 0, r * 1.08, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 3; i++) {
        const a = game.time * 2 + i * TAU / 3;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, r * 0.15, 0, TAU); ctx.fill();
      }
    } else if (e.type === 'bomber') {
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI / 2 + i * TAU / 16;
        const rad = i % 2 === 0 ? r * 1.3 : r * 0.5;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = flash ? '#fff' : '#fdba74';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3 + Math.sin(game.time * 14 + e.seed) * 2, 0, TAU); ctx.fill();
    } else if (e.type === 'prismling') {
      ctx.rotate(game.time * 0.8 + e.seed);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + i * TAU / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, TAU); ctx.stroke();
      ctx.fillStyle = flash ? '#ffffff' : '#7dd3fc';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.2 + Math.sin(game.time * 8) * 2, 0, TAU); ctx.fill();
    } else if (e.type === 'sniper') {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.5);
      ctx.lineTo(r * 0.48, 0);
      ctx.lineTo(0, r * 1.5);
      ctx.lineTo(-r * 0.48, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = hexA(e.color, 0.65);
      ctx.beginPath(); ctx.moveTo(-r * 1.15, 0); ctx.lineTo(r * 1.15, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.46, 0, TAU); ctx.stroke();
    } else {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * TAU / 10; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = hexA(e.color, 0.7);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); }
      ctx.stroke();
    }

    if (e.type !== 'gunner' && e.type !== 'bomber') {
      ctx.fillStyle = flash ? '#fff' : '#ff3155';
      ctx.beginPath(); ctx.arc(0, -r * 0.14, Math.max(2, r * 0.15), 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(r * 0.04, -r * 0.17, Math.max(1, r * 0.05), 0, TAU); ctx.fill();
    }
    ctx.restore();

    if (e.elite) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251,146,60,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 8]);
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 14, game.time * 1.4, game.time * 1.4 + TAU); ctx.stroke();
      ctx.restore();
    }
    if (e.hp < e.maxHp) {
      const w = Math.max(18, e.r * 2), p = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w, 3);
      ctx.fillStyle = e.elite ? '#fb923c' : e.color;
      ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w * p, 3);
    }
  }
}
function drawBoss(e) {
  const t = game.time, r = e.r, flash = e.hitFlash > 0;
  const col = flash ? '#ffffff' : e.color;
  drawGlow(e.color, e.x, e.y, r * 3.3, 0.42);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.rot);
  ctx.lineJoin = 'round';
  ctx.fillStyle = flash ? 'rgba(255,255,255,0.72)' : 'rgba(13,3,18,0.96)';
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;

  if (e.pattern === 'rift') {
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = hexA(e.color, 0.3 - i * 0.05);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 9]);
      ctx.beginPath(); ctx.arc(0, 0, r + 18 + i * 15, t * (0.3 + i * 0.12), t * (0.3 + i * 0.12) + TAU * 0.72); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * TAU / 6; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = hexA(e.color, 0.6); ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; ctx.lineTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45); }
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 0.28 + Math.sin(t * 5) * 3, 0, TAU); ctx.fill();
  } else if (e.pattern === 'hive') {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * TAU / 8; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = hexA(e.color, 0.65); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = t * 1.4 + i * TAU / 4;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.12, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 0.25 + Math.sin(t * 6) * 2, 0, TAU); ctx.fill();
  } else if (e.pattern === 'forge') {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * TAU / 8; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = hexA(e.color, 0.75); ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + i * TAU / 8;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72); ctx.stroke();
    }
    ctx.fillStyle = flash ? '#fff' : '#fed7aa';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.31 + Math.sin(t * 8) * 3, 0, TAU); ctx.fill();
    ctx.strokeStyle = hexA(e.color, 0.5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r + 13, t * 0.5, t * 0.5 + TAU * 0.75); ctx.stroke();
  } else if (e.pattern === 'weaver') {
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r * 0.92, -r * 0.1); ctx.lineTo(r * 0.55, r * 0.9); ctx.lineTo(-r * 0.55, r * 0.9); ctx.lineTo(-r * 0.92, -r * 0.1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = hexA(e.color, 0.65); ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = t * 0.8 + i * TAU / 4;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, a, a + 0.9); ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.34); ctx.lineTo(r * 0.3, 0); ctx.lineTo(0, r * 0.34); ctx.lineTo(-r * 0.3, 0); ctx.closePath(); ctx.fill();
  } else if (e.pattern === 'prism') {
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r * 0.92, r * 0.6); ctx.lineTo(-r * 0.92, r * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = hexA(e.color, 0.7); ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * TAU / 3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); ctx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35); ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.38); ctx.lineTo(r * 0.4, r * 0.25); ctx.lineTo(-r * 0.4, r * 0.25); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA(e.color, 0.4); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r + 20, t, t + TAU * 0.6); ctx.stroke();
  } else if (e.pattern === 'storm') {
    ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = hexA(e.color, 0.8); ctx.lineWidth = 2.5;
    for (let i = 0; i < 8; i++) {
      const a = t * 0.9 + i * TAU / 8;
      const jitter = Math.sin(t * 14 + i) * r * 0.16;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
      ctx.lineTo(Math.cos(a) * r * 1.05 + jitter, Math.sin(a) * r * 1.05 - jitter);
      ctx.lineTo(Math.cos(a) * r * 1.32, Math.sin(a) * r * 1.32);
      ctx.stroke();
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 0.28 + Math.sin(t * 12) * 3, 0, TAU); ctx.fill();
    ctx.strokeStyle = hexA(e.color, 0.4); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r + 24, 0, TAU); ctx.stroke();
  } else if (e.pattern === 'twin') {
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? -r * 0.38 : r * 0.38;
      ctx.fillStyle = flash ? 'rgba(255,255,255,.7)' : 'rgba(13,3,18,0.96)';
      ctx.strokeStyle = i === 0 ? e.color : '#fb7185';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, 0, r * 0.62, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = i === 0 ? e.color : '#fb7185';
      ctx.beginPath(); ctx.arc(x, 0, r * 0.18, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = hexA(e.color, 0.4); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r + 22, t * 0.7, t * 0.7 + TAU * 0.7); ctx.stroke();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + i * TAU / 12; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = hexA(e.color, 0.32 - i * 0.06);
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 9]);
      ctx.beginPath(); ctx.arc(0, 0, r + 24 + i * 20, t * (0.4 + i * 0.1), t * (0.4 + i * 0.1) + TAU * 0.7); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = hexA(e.color, 0.8); ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * TAU / 6;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); ctx.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3); ctx.stroke();
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 0.35 + Math.sin(t * 7) * 3, 0, TAU); ctx.fill();
  }
  ctx.restore();

  if (e.pattern === 'forge' && e.charging) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 24);
    ctx.strokeStyle = '#ff9f43';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.chargeX, e.chargeY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(e.chargeX, e.chargeY, 34, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  if ((e.pattern === 'weaver' || e.pattern === 'final') && e.teleportWarm > 0) {
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.2 * Math.sin(t * 18);
    ctx.strokeStyle = e.pattern === 'final' ? e.color : '#c084fc';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.arc(e.teleX, e.teleY, e.r * 0.85, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  if (e.pattern === 'weaver' && e.voidWarn > 0) {
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t * 16);
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 9]);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(player.x, player.y); ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 3; i++) {
      const rr = 34 + i * 18 + (1.8 - e.voidWarn) * 26;
      ctx.beginPath(); ctx.arc(player.x, player.y, rr, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = '#d8c7ff';
    ctx.font = '700 11px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('VOID', player.x, player.y - 60);
    ctx.restore();
  }
  if (e.pattern === 'twin') {
    for (let i = 0; i < 2; i++) {
      const a = e.satAngle + i * Math.PI;
      const sx = e.x + Math.cos(a) * 82;
      const sy = e.y + Math.sin(a) * 82;
      drawGlow(i === 0 ? '#f472b6' : '#fb7185', sx, sy, 18, 0.45);
      ctx.fillStyle = i === 0 ? '#f9a8d4' : '#fda4af';
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, TAU); ctx.fill();
    }
    const off = e.r + 62 + Math.sin(t * 1.4) * 6;
    for (let s = -1; s <= 1; s += 2) {
      const mx = e.x + s * off;
      const my = e.y + Math.sin(t * 1.2 + s) * 12;
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.08 * Math.sin(t * 3 + s);
      ctx.strokeStyle = s < 0 ? '#f472b6' : '#fb7185';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, e.r * 0.52, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx - e.r * 0.2, my, 4, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx + e.r * 0.2, my, 4, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (e.swapWarn > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 20);
      ctx.strokeStyle = '#f9a8d4';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(player.x, player.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.9, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 18, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.save();
  ctx.strokeStyle = hexA(e.color, 0.3);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = e.rot * (i % 2 ? -1 : 1) + i * TAU / 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 34 + i * 16, a, a + 1.2); ctx.stroke();
  }
  ctx.restore();
}
function drawPlayer() {
  const count = player.upg.orb || 0;
  const radius = 68 + count * 5;
  for (let i = 0; i < count; i++) {
    const a = player.orbAngle + i * TAU / count;
    const ox = player.x + Math.cos(a) * radius;
    const oy = player.y + Math.sin(a) * radius;
    drawGlow('#a78bfa', ox, oy, 16, 0.5);
    ctx.fillStyle = '#ddd6fe';
    ctx.beginPath(); ctx.arc(ox, oy, 5, 0, TAU); ctx.fill();
  }

  const droneCount = player.upg.drone || 0;
  if (droneCount) {
    const dr = 52 + droneCount * 7;
    for (let i = 0; i < droneCount; i++) {
      const a = player.droneAngle + i * TAU / droneCount;
      const dx = player.x + Math.cos(a) * dr;
      const dy = player.y + Math.sin(a) * dr;
      drawGlow('#67e8f9', dx, dy, 15, 0.4);
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#cffafe';
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  drawGlow('#22d3ee', player.x, player.y, 32, 0.55);
  if (player.overdrive > 0) drawGlow('#fbbf24', player.x, player.y, 52, 0.3);

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.aim + Math.PI / 2);
  if (game.mirrorTime > 0) ctx.scale(-1, 1);
  ctx.fillStyle = 'rgba(34,211,238,0.2)';
  ctx.strokeStyle = player.invuln > 0 && Math.floor(game.time * 20) % 2 ? '#ffffff' : '#7dd3fc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.lineTo(12, 12);
  ctx.lineTo(0, 6);
  ctx.lineTo(-12, 12);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f0fdff';
  ctx.beginPath(); ctx.arc(0, -3, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = game.mirrorTime > 0 ? '#ff9ec7' : '#67e8f9';
  ctx.beginPath(); ctx.arc(-8, 2, 1.8, 0, TAU); ctx.fill();
  ctx.restore();

  if (player.shield > 0) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(game.time * 0.5);
    ctx.strokeStyle = 'rgba(125,211,252,0.8)';
    ctx.fillStyle = 'rgba(56,189,248,0.08)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.lineTo(Math.cos(a) * 29, Math.sin(a) * 29); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (player.invuln > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 10, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  if (game.hiveDotTime > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.18 * Math.sin(game.time * 12);
    drawGlow('#a3e635', player.x, player.y, 40, 0.25);
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 16, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  const cd = clamp(player.dashCd / dashMax(), 0, 1);
  if (cd > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(103,232,249,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cd)); ctx.stroke();
    ctx.restore();
  }
}
function drawEnemyBullets() {
  for (const b of ebullets) {
    const ang = Math.atan2(b.vy, b.vx);
    const r = b.r;
    if (game.quality !== 'low' && ebullets.length < 160) drawGlow(b.color, b.x, b.y, r * 5, 0.28);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    if (b.shape === 'bolt') {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(8,0,12,0.95)';
      ctx.lineWidth = r * 2.8;
      ctx.beginPath(); ctx.moveTo(-r * 1.9, 0); ctx.lineTo(r * 1.9, 0); ctx.stroke();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = r * 1.65;
      ctx.beginPath(); ctx.moveTo(-r * 1.7, 0); ctx.lineTo(r * 1.7, 0); ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, r * 0.45);
      ctx.beginPath(); ctx.moveTo(-r * 1.2, 0); ctx.lineTo(r * 1.2, 0); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(8,0,12,0.95)';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (b.shape === 'shard') {
        ctx.moveTo(r * 2.1, 0); ctx.lineTo(0, r * 1.15); ctx.lineTo(-r * 2.1, 0); ctx.lineTo(0, -r * 1.15);
      } else if (b.shape === 'star') {
        for (let i = 0; i < 16; i++) {
          const a = i * TAU / 16;
          const rr = i % 2 === 0 ? r * 1.8 : r * 0.7;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
      } else {
        ctx.arc(0, 0, r * 1.35, 0, TAU);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = b.color;
      ctx.beginPath();
      if (b.shape === 'shard') {
        ctx.moveTo(r * 1.5, 0); ctx.lineTo(0, r * 0.72); ctx.lineTo(-r * 1.5, 0); ctx.lineTo(0, -r * 0.72);
      } else if (b.shape === 'star') {
        for (let i = 0; i < 8; i++) {
          const a = i * TAU / 8;
          const rr = i % 2 === 0 ? r * 1.2 : r * 0.45;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
      } else {
        ctx.arc(0, 0, r * 0.86, 0, TAU);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, b.shape === 'orb' ? r * 0.36 : r * 0.22, 0, TAU);
      ctx.fill();
      if (b.shape === 'orb') {
        ctx.strokeStyle = hexA(b.color, 0.8);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.05, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
  }
}
function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawLightnings() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const l of lightnings) {
    ctx.globalAlpha = clamp(l.life / l.maxLife, 0, 1);
    ctx.strokeStyle = l.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(l.pts[0].x, l.pts[0].y);
    for (let i = 1; i < l.pts.length; i++) ctx.lineTo(l.pts[i].x, l.pts[i].y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}
function drawTexts() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '700 12px Consolas, monospace';
  for (const t of texts) {
    ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
}
function drawTitleDecor(t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cx = VW * 0.76, cy = VH * 0.5;
  for (let i = 0; i < 4; i++) {
    const r = Math.min(VW, VH) * (0.14 + i * 0.06);
    ctx.strokeStyle = 'rgba(103,232,249,' + (0.12 - i * 0.02) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, t * 0.2 + i, t * 0.2 + i + TAU * 0.65); ctx.stroke();
  }
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(VW, VH) * 0.25);
  g.addColorStop(0, 'rgba(167,139,250,0.16)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - VW, cy - VH, VW * 2, VH * 2);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  boot / loop                                                        */
/* ------------------------------------------------------------------ */
updateBestDisplay();
setHud(false);
showScreen('tutorial');
cam.x = clamp(player.x - VW / 2, 0, Math.max(0, WORLD.w - VW));
cam.y = clamp(player.y - VH / 2, 0, Math.max(0, WORLD.h - VH));

function reportFatal(err) {
  if (game.crashReported) return;
  if (game.state === 'title' || game.state === 'victory' || game.state === 'gameover') return;
  game.crashReported = true;
  game.state = 'paused';
  console.error('[NEON] runtime error', err);
  hideBanner();
  try {
    showScreen('pause');
    const h = document.querySelector('#pause h2');
    const p = document.querySelector('#pause .muted');
    if (h) h.textContent = '运行异常';
    if (p) p.textContent = '运行异常：' + String((err && err.message) || '未知错误').slice(0, 90) + '。请返回标题或刷新页面。';
  } catch (e) { /* keep the loop alive */ }
}
window.addEventListener('error', (e) => reportFatal(e.error || new Error(e.message)));
window.addEventListener('unhandledrejection', (e) => reportFatal(e.reason || new Error('unhandled rejection')));
let lastReal = performance.now();
let lastFrameSeen = lastReal;
let loopEpoch = 0;
let errorCount = 0;
let errorAt = 0;
function startLoop() {
  const epoch = ++loopEpoch;
  lastReal = performance.now();
  lastFrameSeen = lastReal;
  const frame = (now) => {
    if (epoch !== loopEpoch) return;
    lastFrameSeen = now;
    try {
      const realDt = Math.max(0, (now - lastReal) / 1000);
      lastReal = now;
      if (game.state === 'playing') {
        if (realDt > 0.05) game.slowTime += realDt;
        else game.slowTime = Math.max(0, game.slowTime - realDt * 0.5);
        if (game.quality === 'high' && game.slowTime > 1.6) {
          game.quality = 'low';
          showBanner('性能模式', '已自动降低特效密度', '#fbbf24');
        }
      }
      const dt = Math.min(0.033, realDt);
      if (game.state === 'playing') update(dt);
      render();
    } catch (err) {
      console.error('[NEON] frame error', err);
      const t = performance.now();
      if (t - errorAt > 1200) errorCount = 0;
      errorAt = t;
      errorCount += 1;
      game.lastError = String((err && err.message) || err);
      if (errorCount >= 3) {
        reportFatal(err);
      } else {
        showBanner('运行异常', '已尝试继续运行 · 若反复出现请返回标题', '#fbbf24');
      }
    } finally {
      if (epoch === loopEpoch) requestAnimationFrame(frame);
    }
  };
  requestAnimationFrame(frame);
}
startLoop();
setInterval(() => {
  if (game.state === 'playing' && performance.now() - lastFrameSeen > 2500) {
    showBanner('主循环恢复', '画面长时间未更新，正在重新启动', '#fbbf24');
    startLoop();
  }
}, 1000);

})();
