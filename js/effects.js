// Atmosphere for the showcase: backdrop glow, faded floor, drifting mist and rising embers.
// Every factory returns an object with an update(time, accentColor) method that main.js calls each frame.
import * as THREE from 'three';

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }
`;

const BASIC_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// White centre fading to black edge; used as an alpha map for soft circular falloffs.
function radialTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.35, '#bbb');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** Large plane far behind the model with a soft coloured glow – the "hero spotlight" look. */
export function createBackdrop(baseColor) {
  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color() },
    uBase: { value: new THREE.Color(baseColor) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: BASIC_VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor, uBase;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        vec2 p = (vUv - vec2(0.5, 0.55)) * vec2(2.2, 1.0);
        float glow = exp(-dot(p, p) * 18.0);
        float haze = exp(-dot(p, p) * 4.0);
        float n = fbm(vUv * vec2(7.0, 3.5) + vec2(uTime * 0.015, uTime * 0.01));
        vec3 col = uBase + uColor * (glow * (0.10 + 0.10 * n) + haze * 0.015);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(70, 36), material);
  mesh.position.set(0, 2, -14);
  mesh.renderOrder = -10;

  return {
    object: mesh,
    update(t, accent) {
      uniforms.uTime.value = t;
      uniforms.uColor.value.copy(accent);
    },
  };
}

/**
 * Brush-drawn motifs from img/decals, drawn as flat planes just in front of the backdrop so the mist,
 * floor and model all render over them. Positions are screen fractions (like CSS left/top %) and sizes
 * are fractions of the screen height / width (like min(vh, vw)), so the layout holds at any window size.
 * spin = seconds per turn (negative turns anticlockwise).
 */
const DECALS = [
  { img: 'rune-circle', opacity: 0.05, spin: 240,
    wide:   { x: 0.61, y: 0.50, vh: 1.05, vw: 0.72 },
    narrow: { x: 0.50, y: 0.52, vh: Infinity, vw: 1.25 } },
  { img: 'starburst',   opacity: 0.06, spin: -160,
    wide:   { x: 0.92, y: 0.16, vh: 0.34, vw: 0.22 },
    narrow: { x: 0.96, y: 0.18, vh: Infinity, vw: 0.46 } },
  { img: 'ring',        opacity: 0.08, spin: 90,
    wide:   { x: 0.09, y: 0.82, vh: 0.26, vw: 0.16 },
    narrow: { x: 0.06, y: 0.74, vh: Infinity, vw: 0.38 } },
];
const DECAL_DEPTH = -13; // just in front of the backdrop (z = -14)
// The opacities above match the old CSS (screen blend in display colour). Light adds up in linear
// colour here, which reads much brighter over a near-black background, so scale it down to match.
const DECAL_GAIN = 0.3;

export function createDecals() {
  const group = new THREE.Group();
  const loader = new THREE.TextureLoader();
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const decals = DECALS.map((def) => {
    const texture = loader.load(`img/decals/${def.img}.webp`);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture, color: new THREE.Color(), opacity: def.opacity * DECAL_GAIN,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.renderOrder = -8; // after the backdrop, before the mist
    group.add(mesh);
    return { def, mesh, material };
  });

  const center = new THREE.Vector3();
  const dir = new THREE.Vector3();

  return {
    object: group,
    // Re-places the decals for the current camera framing; call on resize.
    layout(camera, position, target, narrow) {
      dir.subVectors(target, position).normalize();
      const distance = (DECAL_DEPTH - position.z) / dir.z;
      center.copy(position).addScaledVector(dir, distance);
      const height = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const width = height * camera.aspect;
      for (const { def, mesh } of decals) {
        const l = narrow ? def.narrow : def.wide;
        mesh.position.set(center.x + (l.x - 0.5) * width, center.y + (0.5 - l.y) * height, DECAL_DEPTH);
        mesh.scale.setScalar(Math.min(l.vh * height, l.vw * width));
      }
    },
    update(t, accent) {
      for (const { def, mesh, material } of decals) {
        material.color.copy(accent);
        if (!still) mesh.rotation.z = (-t / def.spin) * Math.PI * 2;
      }
    },
  };
}

/** Dark floor that fades out at the edges, plus a pulsing glow pool under the model. */
export function createGround() {
  const fade = radialTexture();
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 64),
    new THREE.MeshStandardMaterial({
      color: '#121318', roughness: 0.75, metalness: 0.3,
      transparent: true, alphaMap: fade, depthWrite: false,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(), alphaMap: fade, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4,
  });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.005;

  group.add(floor, glow);

  return {
    object: group,
    update(t, accent) {
      glowMaterial.color.copy(accent);
      glowMaterial.opacity = 0.32 + Math.sin(t * 1.3) * 0.06;
    },
  };
}

/**
 * Layers of animated fbm noise on transparent planes. Back layers glow additively, front/ground
 * layers sit around the model's feet so it slides through the mist when changing models.
 */
const MIST_LAYERS = [
  { pos: [0, 2.6, -6],   rot: 0,  size: [26, 10], opacity: 0.14, speed: 0.020, scale: 1.4, tint: 0.7, additive: true },
  { pos: [0, 1.2, -3],   rot: 0,  size: [18, 5],  opacity: 0.10, speed: 0.035, scale: 2.0, tint: 0.5, additive: true },
  { pos: [0, 0.03, 0],   rot: -1, size: [14, 10], opacity: 0.30, speed: 0.030, scale: 2.4, tint: 0.35, radial: true },
  { pos: [0, 0.25, 0],   rot: -1, size: [10, 7],  opacity: 0.18, speed: 0.045, scale: 3.0, tint: 0.30, radial: true },
  { pos: [0, 0.4, 2.4],  rot: 0,  size: [15, 1.6], opacity: 0.16, speed: 0.050, scale: 2.8, tint: 0.25 },
];

export function createMist() {
  const group = new THREE.Group();
  const shared = { uTime: { value: 0 }, uColor: { value: new THREE.Color() } };

  MIST_LAYERS.forEach((layer, i) => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uOpacity: { value: layer.opacity },
        uSpeed: { value: layer.speed },
        uScale: { value: layer.scale },
        uTint: { value: layer.tint },
        uSeed: { value: i * 17.31 },
        uAspect: { value: layer.size[0] / layer.size[1] },
        uRadial: { value: layer.radial ? 1 : 0 },
      },
      vertexShader: BASIC_VERT,
      fragmentShader: /* glsl */ `
        uniform float uTime, uOpacity, uSpeed, uScale, uTint, uSeed, uAspect, uRadial;
        uniform vec3 uColor;
        varying vec2 vUv;
        ${NOISE_GLSL}
        void main() {
          vec2 p = vUv * vec2(uAspect, 1.0) * uScale + uSeed;
          float t = uTime * uSpeed;
          vec2 q = vec2(fbm(p + vec2(t, 0.0)), fbm(p + vec2(-t * 0.7, t * 0.3) + 5.2));
          float n = fbm(p + 2.0 * q + vec2(t * 0.5, 0.0));

          float boxEdge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x)
                        * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
          float radialEdge = smoothstep(0.5, 0.1, length(vUv - 0.5));
          float edge = mix(boxEdge, radialEdge, uRadial);

          float a = smoothstep(0.4, 0.9, n) * edge * uOpacity;
          vec3 col = mix(vec3(0.5, 0.53, 0.6), uColor, uTint) * (0.35 + n * 0.5);
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: layer.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...layer.size), material);
    mesh.position.set(...layer.pos);
    if (layer.rot) mesh.rotation.x = layer.rot * Math.PI / 2;
    mesh.renderOrder = layer.additive ? -5 : 5;
    group.add(mesh);
  });

  return {
    object: group,
    update(t, accent) {
      shared.uTime.value = t;
      shared.uColor.value.copy(accent);
    },
  };
}

/** Glowing particles drifting upward, picked up by the bloom pass. */
export function createEmbers(pixelRatio, count = 220) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 14;
    positions[i * 3 + 1] = Math.random() * 6;
    positions[i * 3 + 2] = -6 + Math.random() * 9;
    seeds[i] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const uniforms = {
    uTime: { value: 0 },
    uHeight: { value: 6 },
    uPixelRatio: { value: pixelRatio },
    uColor: { value: new THREE.Color() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime, uHeight, uPixelRatio;
      attribute float aSeed;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float t = uTime * (0.12 + aSeed * 0.22);
        p.y = mod(position.y + t, uHeight);
        p.x += sin(t * 2.0 + aSeed * 20.0) * 0.35;
        p.z += cos(t * 1.5 + aSeed * 10.0) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (18.0 + aSeed * 32.0) * uPixelRatio / -mv.z;
        float h = p.y / uHeight;
        float flicker = 0.55 + 0.45 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 50.0);
        vAlpha = smoothstep(0.0, 0.15, h) * smoothstep(1.0, 0.6, h) * flicker;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        vec3 col = mix(uColor, vec3(1.0, 0.85, 0.6), 0.35) * 2.2;
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 10;

  return {
    object: points,
    setPixelRatio(pr) { uniforms.uPixelRatio.value = pr; },
    update(t, accent) {
      uniforms.uTime.value = t;
      uniforms.uColor.value.copy(accent);
    },
  };
}
