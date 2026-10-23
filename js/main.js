import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createBackdrop, createGround, createMist, createEmbers } from './effects.js';

// ---------------------------------------------------------------------------
// Settings – tweak these to taste
// ---------------------------------------------------------------------------
const CONFIG = {
  year: 2026,
  modelHeight: 2.4,       // every model is scaled to roughly this tall (world units)
  spinSpeed: 0.35,        // turntable speed in radians per second
  slideDuration: 1.1,     // seconds for a model to slide on/off
  background: '#07080b',
  bloom: { strength: 0.35, radius: 0.6, threshold: 0.85 },
};

// Each month gets its own accent colour for the rim lights, mist and UI.
const MONTHS = [
  { key: 'JAN', name: 'January',   accent: '#7fb8ff' },
  { key: 'FEB', name: 'February',  accent: '#ff6f91' },
  { key: 'MAR', name: 'March',     accent: '#6fe3a1' },
  { key: 'APR', name: 'April',     accent: '#b6e36f' },
  { key: 'MAY', name: 'May',       accent: '#ffd36f' },
  { key: 'JUN', name: 'June',      accent: '#ffb347' },
  { key: 'JUL', name: 'July',      accent: '#ff7a45' },
  { key: 'AUG', name: 'August',    accent: '#ff5252' },
  { key: 'SEP', name: 'September', accent: '#c98bff' },
  { key: 'OCT', name: 'October',   accent: '#ff8c2a' },
  { key: 'NOV', name: 'November',  accent: '#9aa7ff' },
  { key: 'DEC', name: 'December',  accent: '#8fe8ff' },
];

const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ui = {
  info: $('info'), month: $('month'), title: $('title'), counter: $('counter'), filetype: $('filetype'),
  prev: $('prev'), next: $('next'), months: $('months'), loader: $('loader'), empty: $('empty'),
  toast: $('toast'), brand: $('brand'),
};
ui.brand.textContent = `Model Archive ${CONFIG.year}`;

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.background);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.1, 100);
const framing = { position: new THREE.Vector3(), target: new THREE.Vector3() };

// Pushes the camera back on narrow screens, and shifts the model right on wide
// screens so the title text on the left has room (like the Dota 2 hero pages).
function updateFraming() {
  const aspect = camera.aspect;
  const distance = 8.5 * Math.max(1, 0.85 / aspect);
  const shiftX = aspect > 1.1 ? -0.9 : 0;
  const lift = aspect > 1.1 ? 0 : -0.35;
  framing.position.set(shiftX, 1.5 + lift, distance);
  framing.target.set(shiftX, 1.15 + lift, 0);
}

// ---------------------------------------------------------------------------
// Lights – warm key light plus strong coloured rim lights from behind
// ---------------------------------------------------------------------------
const accent = new THREE.Color(MONTHS[0].accent);
const targetAccent = accent.clone();

scene.add(new THREE.HemisphereLight('#8a96b8', '#0a0806', 0.5));

const keyLight = new THREE.DirectionalLight('#ffe9d2', 2.2);
keyLight.position.set(3, 6, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -4, right: 4, top: 5, bottom: -2, near: 1, far: 20 });
keyLight.shadow.bias = -0.0005;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight);

const rimLeft = new THREE.DirectionalLight(accent, 3.5);
rimLeft.position.set(-4, 3, -5);
const rimRight = new THREE.DirectionalLight(accent, 2.5);
rimRight.position.set(4.5, 2.5, -4);
const uplight = new THREE.PointLight(accent, 2, 5, 2);
uplight.position.set(0, 0.8, 1.4);
scene.add(rimLeft, rimRight, uplight);

// ---------------------------------------------------------------------------
// Atmosphere + post processing
// ---------------------------------------------------------------------------
const embers = createEmbers(renderer.getPixelRatio());
const effects = [createBackdrop(CONFIG.background), createGround(), createMist(), embers];
effects.forEach((fx) => scene.add(fx.object));

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold,
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// Model loading
// ---------------------------------------------------------------------------
const gltfLoader = new GLTFLoader()
  .setDRACOLoader(new DRACOLoader().setDecoderPath(`${THREE_CDN}libs/draco/gltf/`))
  .setMeshoptDecoder(MeshoptDecoder);
const loaders = { glb: gltfLoader, gltf: gltfLoader, fbx: new FBXLoader(), obj: new OBJLoader() };
const objMaterial = new THREE.MeshStandardMaterial({ color: '#b9b4ac', roughness: 0.55, metalness: 0.1 });
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
const cache = new Map();

function getEntry(item) {
  if (!cache.has(item.url)) {
    const promise = loadModel(item).catch((err) => {
      cache.delete(item.url);
      throw err;
    });
    cache.set(item.url, promise);
  }
  return cache.get(item.url);
}

async function loadModel(item) {
  const loader = loaders[item.ext];
  if (!loader) throw new Error(`Unsupported file type .${item.ext}`);
  const result = item.ext === 'fbx' ? await loadFbx(item.url) : await loader.loadAsync(item.url);
  const object = result.scene ?? result;
  const clips = result.animations ?? [];

  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (item.ext === 'obj') child.material = objMaterial;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((m) => {
      if (!m) return;
      dropMissingTextures(m);
      if (m.map) m.map.anisotropy = maxAnisotropy;
    });
  });

  return { pivot: normalise(object), object, clips };
}

// FBX files reference their textures as separate files. This waits until those have finished (or failed)
// so dropMissingTextures can tell which ones never arrived.
async function loadFbx(url) {
  const manager = new THREE.LoadingManager();
  const settled = new Promise((resolve) => { manager.onLoad = resolve; });
  const result = await new FBXLoader(manager).loadAsync(url);
  await settled;
  return result;
}

// A texture whose file is missing would otherwise render black – or, for an alpha map, make the whole
// model invisible – so fall back to the plain material values instead.
const TEXTURE_SLOTS = ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap',
  'aoMap', 'bumpMap', 'specularMap', 'lightMap', 'displacementMap'];
function dropMissingTextures(material) {
  for (const slot of TEXTURE_SLOTS) {
    const tex = material[slot];
    if (tex?.isTexture && !tex.image) {
      material[slot] = null;
      if (slot === 'alphaMap') material.transparent = material.opacity < 1;
      material.needsUpdate = true;
    }
  }
}

// Scales the model to a consistent size, centres it and stands it on the floor.
function normalise(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const scale = CONFIG.modelHeight / Math.max(size.y, size.x, size.z, 1e-6);
  object.scale.multiplyScalar(scale);

  box.setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= box.min.y;

  const pivot = new THREE.Group();
  pivot.add(object);
  return pivot;
}

// Shown when there are no models yet, or a file fails to load.
function createPlaceholder() {
  const material = new THREE.MeshStandardMaterial({ color: '#1b1d24', metalness: 0.9, roughness: 0.25 });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), material);
  crystal.scale.y = 1.5;
  crystal.position.y = 1.5;
  crystal.castShadow = true;
  crystal.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(crystal.geometry),
    new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.3 }),
  ));
  const pivot = new THREE.Group();
  pivot.add(crystal);
  return { pivot, object: pivot, clips: [] };
}

// ---------------------------------------------------------------------------
// Slots – a model on the stage. root slides sideways, spinner turns.
// ---------------------------------------------------------------------------
const slots = new Set();
let current = null;

function createSlot(entry) {
  const root = new THREE.Group();
  const spinner = new THREE.Group();
  root.add(spinner);
  spinner.add(entry.pivot);

  let mixer = null;
  if (entry.clips.length) {
    mixer = new THREE.AnimationMixer(entry.object);
    mixer.clipAction(entry.clips[0]).play();
  }
  const slot = { root, spinner, mixer };
  scene.add(root);
  slots.add(slot);
  return slot;
}

function removeSlot(slot) {
  scene.remove(slot.root);
  slot.mixer?.stopAllAction();
  slots.delete(slot);
}

// How far a model has to travel to be fully off screen.
function slideDistance() {
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * framing.position.z;
  return halfHeight * camera.aspect + Math.abs(framing.position.x) + CONFIG.modelHeight;
}

// ---------------------------------------------------------------------------
// Tweens
// ---------------------------------------------------------------------------
const tweens = new Set();
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

function tween(duration, onUpdate, ease = easeOutCubic) {
  return new Promise((resolve) => {
    tweens.add({ start: performance.now(), duration: duration * 1000, onUpdate, ease, resolve });
  });
}

function runTweens(now) {
  for (const tw of tweens) {
    const t = Math.min(1, (now - tw.start) / tw.duration);
    tw.onUpdate(tw.ease(t));
    if (t >= 1) {
      tweens.delete(tw);
      tw.resolve();
    }
  }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
let items = [];
let index = -1;
let busy = false;

async function goTo(newIndex, dir) {
  if (busy || !items.length || newIndex === index) return;
  busy = true;
  index = newIndex;
  const item = items[index];
  updateHud(item, dir);

  // Current model slides off immediately while the next one loads.
  const distance = slideDistance();
  const outgoing = current;
  current = null;
  const outDone = outgoing
    ? tween(CONFIG.slideDuration, (e) => {
        outgoing.root.position.x = -dir * distance * e;
        outgoing.root.rotation.y = dir * 0.5 * e;
      }).then(() => removeSlot(outgoing))
    : Promise.resolve();

  const loaderTimer = setTimeout(() => ui.loader.classList.add('visible'), 300);
  let entry;
  try {
    entry = await getEntry(item);
  } catch (err) {
    console.error(`Failed to load ${item.url}`, err);
    showToast(`Couldn't load ${item.file}`);
    entry = createPlaceholder();
  }
  clearTimeout(loaderTimer);
  ui.loader.classList.remove('visible');

  if (outgoing) await Promise.race([outDone, wait(CONFIG.slideDuration * 0.3)]);

  const slot = createSlot(entry);
  slot.spinner.rotation.y = -0.4;
  current = slot;
  await tween(CONFIG.slideDuration, (e) => {
    slot.root.position.x = dir * distance * (1 - e);
    slot.root.rotation.y = -dir * 0.5 * (1 - e);
  });
  await outDone;
  busy = false;
  preload(index + 1);
  preload(index - 1);
}

function step(dir) {
  if (items.length < 2) return;
  goTo((index + dir + items.length) % items.length, dir);
}

function preload(i) {
  const item = items[(i + items.length) % items.length];
  if (item) getEntry(item).catch(() => {});
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');

function updateHud(item, dir) {
  const { info } = ui;
  info.style.setProperty('--dir', dir);
  info.classList.remove('is-entering');
  info.classList.add('is-leaving');

  setTimeout(() => {
    ui.month.textContent = `${item.month.name} ${CONFIG.year}`;
    ui.title.textContent = item.title;
    ui.counter.textContent = `${pad(index + 1)} / ${pad(items.length)}`;
    ui.filetype.textContent = item.ext;
    info.classList.remove('is-leaving');
    info.classList.add('is-entering');
    info.getBoundingClientRect(); // flush so the enter transition plays
    info.classList.remove('is-entering');
  }, 300);

  setAccent(item.month);
  for (const btn of ui.months.children) btn.classList.toggle('active', btn.dataset.month === item.month.key);
}

function setAccent(month) {
  targetAccent.set(month.accent);
  document.documentElement.style.setProperty('--accent', month.accent);
}

function buildMonthNav() {
  for (const month of MONTHS) {
    const count = items.filter((it) => it.month === month).length;
    const btn = document.createElement('button');
    btn.className = 'month-btn';
    btn.dataset.month = month.key;
    btn.disabled = count === 0;
    btn.title = count ? `${month.name} – ${count} model${count > 1 ? 's' : ''}` : `${month.name} – empty`;
    btn.innerHTML = count > 1 ? `${month.key}<sup>${count}</sup>` : month.key;
    btn.addEventListener('click', () => {
      const target = items.findIndex((it) => it.month === month);
      if (target !== -1 && target !== index) goTo(target, target > index ? 1 : -1);
    });
    ui.months.appendChild(btn);
  }
}

let toastTimer;
function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 3500);
}

// ---------------------------------------------------------------------------
// Manifest (models/manifest.json is rebuilt by serve.ps1 from the month folders)
// ---------------------------------------------------------------------------
function titleFromFile(file) {
  const parts = file.split('/');
  let name = parts.pop().replace(/\.[^.]+$/, '');
  // glTF exports are often called scene.gltf – use the folder name instead
  if (/^(scene|model)$/i.test(name) && parts.length) name = parts.pop();
  return name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function loadManifest() {
  try {
    const res = await fetch('models/manifest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (err) {
    console.warn('Could not read models/manifest.json – run serve.bat to generate it.', err);
    return { months: {} };
  }
}

function buildItems(manifest) {
  const list = [];
  for (const month of MONTHS) {
    for (const entry of manifest.months?.[month.key] ?? []) {
      // Entries may be plain filenames, or { "file": "...", "title": "..." } if you hand-edit the manifest.
      const file = typeof entry === 'string' ? entry : entry.file;
      if (!file) continue;
      list.push({
        month,
        file,
        title: (typeof entry === 'object' && entry.title) || titleFromFile(file),
        ext: file.split('.').pop().toLowerCase(),
        url: `models/${month.key}/${file.split('/').map(encodeURIComponent).join('/')}`,
      });
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// Input: arrows, keyboard, drag-to-rotate, subtle mouse parallax
// ---------------------------------------------------------------------------
ui.prev.addEventListener('click', () => step(-1));
ui.next.addEventListener('click', () => step(1));
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

const drag = { active: false, lastX: 0, velocity: 0 };
const pointer = new THREE.Vector2();

canvas.addEventListener('pointerdown', (e) => {
  drag.active = true;
  drag.lastX = e.clientX;
  drag.velocity = 0;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag.active || !current) return;
  const delta = (e.clientX - drag.lastX) * 0.008;
  drag.lastX = e.clientX;
  current.spinner.rotation.y += delta;
  drag.velocity = delta * 60;
});
const endDrag = () => {
  drag.active = false;
  canvas.classList.remove('dragging');
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
window.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
});

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  embers.setPixelRatio(renderer.getPixelRatio());
  updateFraming();
}
window.addEventListener('resize', onResize);

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const lookTarget = new THREE.Vector3();

function frame(now) {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  runTweens(now);

  accent.lerp(targetAccent, 1 - Math.exp(-dt * 2.5));
  rimLeft.color.copy(accent);
  rimRight.color.copy(accent);
  uplight.color.copy(accent);
  effects.forEach((fx) => fx.update(t, accent));

  for (const slot of slots) {
    if (slot !== current || !drag.active) {
      slot.spinner.rotation.y += (CONFIG.spinSpeed + (slot === current ? drag.velocity : 0)) * dt;
    }
    slot.mixer?.update(dt);
  }
  if (!drag.active) drag.velocity *= Math.exp(-dt * 3);

  // Gentle camera float and parallax
  camera.position.set(
    framing.position.x + pointer.x * 0.25,
    framing.position.y - pointer.y * 0.12 + Math.sin(t * 0.5) * 0.04,
    framing.position.z,
  );
  camera.lookAt(lookTarget.copy(framing.target));

  composer.render();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function init() {
  onResize();
  requestAnimationFrame(frame);

  items = buildItems(await loadManifest());
  buildMonthNav();

  if (!items.length) {
    ui.empty.hidden = false;
    ui.prev.disabled = ui.next.disabled = true;
    ui.month.textContent = `${CONFIG.year}`;
    ui.title.textContent = 'Coming soon';
    ui.counter.textContent = '00 / 00';
    current = createSlot(createPlaceholder());
    return;
  }

  ui.prev.disabled = ui.next.disabled = items.length < 2;
  goTo(0, 1);
}

init();
