/**
 * AI Builders Digest — Galaxy cover (Three.js)
 * Central jelly Core (shader) + 5 glass-planet shaders + bloom + CSS2D labels.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createJellyCoreMesh, createGlassPlanetMesh } from './galaxy-shaders.js';

const BUILDERS_FALLBACK = {
  builders: [
    { id: 'x:rauchg', name: 'Guillermo Rauch', handle: '@rauchg', label: 'Vercel CEO', xUrl: 'https://x.com/rauchg', avatar: './assets/avatars/x-rauchg.jpg', color: '#22d3ee', size: 0.26, orbit: { radius: 2.8, speed: 0.34, phase: 0 } },
    { id: 'x:levie', name: 'Aaron Levie', handle: '@levie', label: 'Box CEO', xUrl: 'https://x.com/levie', avatar: './assets/avatars/x-levie.jpg', color: '#f97316', size: 0.24, orbit: { radius: 3.2, speed: 0.28, phase: 1.25 } },
    { id: 'x:mattturck', name: 'Matt Turck', handle: '@mattturck', label: 'FirstMark', xUrl: 'https://x.com/mattturck', avatar: './assets/avatars/x-mattturck.jpg', color: '#fbbf24', size: 0.28, orbit: { radius: 3.6, speed: 0.24, phase: 2.5 } },
    { id: 'x:petergyang', name: 'Peter Yang', handle: '@petergyang', label: 'Founder & Investor', xUrl: 'https://x.com/petergyang', avatar: './assets/avatars/x-petergyang.jpg', color: '#a855f7', size: 0.22, orbit: { radius: 4.0, speed: 0.22, phase: 3.8 } },
    { id: 'x:trq212', name: 'Thariq', handle: '@trq212', label: 'Claude Code', xUrl: 'https://x.com/trq212', avatar: './assets/avatars/x-trq212.jpg', color: '#34d399', size: 0.22, orbit: { radius: 4.4, speed: 0.2, phase: 4.9 } },
  ],
};

function isMobile() {
  return window.matchMedia('(max-width: 740px)').matches;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function webglAvailable() {
  try {
    var c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('webgl2')));
  } catch (e) {
    return false;
  }
}

async function loadBuilders() {
  try {
    var res = await fetch('./config/galaxy-builders.json');
    if (res.ok) return await res.json();
  } catch (e) { /* file:// or network */ }
  return BUILDERS_FALLBACK;
}

/** Fixed horizontal orbit ring in the XZ plane (y = 0). */
function createOrbitPath(orbit, color) {
  var segments = 128;
  var points = [];
  var r = orbit.radius;
  for (var i = 0; i <= segments; i++) {
    var angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(r * Math.cos(angle), 0, r * Math.sin(angle)));
  }
  var geo = new THREE.BufferGeometry().setFromPoints(points);
  var lineColor = color ? new THREE.Color(color) : new THREE.Color(0x6366f1);
  return new THREE.LineLoop(
    geo,
    new THREE.LineBasicMaterial({
      color: lineColor,
      transparent: true,
      opacity: 0.28,
    })
  );
}

/** Planet position on a fixed horizontal orbit. */
function orbitPosition(orbit, angle) {
  var r = orbit.radius;
  return new THREE.Vector3(r * Math.cos(angle), 0, r * Math.sin(angle));
}

function findPlanetGroup(obj) {
  var p = obj;
  while (p) {
    if (p.userData && p.userData.builder) return p;
    if (p.userData && p.userData.isCore) return p;
    p = p.parent;
  }
  return null;
}

function createStarfield(count) {
  var positions = new Float32Array(count * 3);
  for (var i = 0; i < count; i++) {
    var r = 40 + Math.random() * 80;
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  var mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: isMobile() ? 0.08 : 0.12,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

function showStaticFallback(container, builders) {
  container.classList.add('galaxy-fallback-active');
  var grid = document.getElementById('galaxyFallback');
  if (!grid) return;
  grid.hidden = false;
  grid.innerHTML = '';
  builders.forEach(function (b) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'galaxy-fallback-card';
    btn.innerHTML =
      '<img src="' + b.avatar + '" alt="" onerror="this.style.display=\'none\'" />' +
      '<span class="galaxy-fallback-name">' + b.name + '</span>';
    btn.addEventListener('click', function () { openPanel(b); });
    grid.appendChild(btn);
  });
}

function getPanelEls() {
  return {
    panel: document.getElementById('galaxyPanel'),
    backdrop: document.getElementById('galaxyPanelBackdrop'),
    avatar: document.getElementById('galaxyPanelAvatar'),
    kicker: document.getElementById('galaxyPanelKicker'),
    title: document.getElementById('galaxyPanelTitle'),
    body: document.getElementById('galaxyPanelBody'),
    link: document.getElementById('galaxyPanelLink'),
    close: document.getElementById('galaxyPanelClose'),
  };
}

function openPanel(builder) {
  var els = getPanelEls();
  if (!els.panel) return;
  els.kicker.textContent = builder.label || 'AI Builder';
  els.title.textContent = builder.name;
  els.body.textContent = builder.handle + ' — ' + (builder.label || '');
  els.link.href = builder.xUrl;
  els.link.textContent = 'View on X →';
  els.avatar.src = builder.avatar;
  els.avatar.alt = builder.name;
  els.panel.classList.add('is-open');
  els.panel.setAttribute('aria-hidden', 'false');
  if (els.backdrop) {
    els.backdrop.classList.add('is-open');
    els.backdrop.setAttribute('aria-hidden', 'false');
  }
}

function closePanel() {
  var els = getPanelEls();
  if (els.panel) {
    els.panel.classList.remove('is-open');
    els.panel.setAttribute('aria-hidden', 'true');
  }
  if (els.backdrop) {
    els.backdrop.classList.remove('is-open');
    els.backdrop.setAttribute('aria-hidden', 'true');
  }
}

function wirePanelUi() {
  var els = getPanelEls();
  if (els.close) els.close.addEventListener('click', closePanel);
  if (els.backdrop) els.backdrop.addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePanel();
  });
}

async function initGalaxy() {
  var container = document.getElementById('galaxyViz');
  if (!container) return;

  var data = await loadBuilders();
  var builders = data.builders || BUILDERS_FALLBACK.builders;

  wirePanelUi();

  if (!webglAvailable()) {
    showStaticFallback(container, builders);
    return;
  }

  var reducedMotion = prefersReducedMotion();
  var mobile = isMobile();
  var starCount = mobile ? 800 : 2000;
  var bloomStrength = mobile ? 0.48 : 0.92;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 5.2, 8.5);
  camera.lookAt(0, 0, 0);

  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.sortObjects = true;
  container.appendChild(renderer.domElement);

  var labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'galaxy-label-layer';
  container.appendChild(labelRenderer.domElement);

  var composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  var bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), bloomStrength, 0.55, 0.08);
  composer.addPass(bloomPass);

  var controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.autoRotate = false;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x6060a0, 0.55));
  var coreLight = new THREE.PointLight(0x88ccff, 2.8, 35);
  coreLight.position.set(0, 0, 0);
  scene.add(coreLight);
  var dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(4, 7, 3);
  scene.add(dirLight);
  var rimLight = new THREE.DirectionalLight(0xa855f7, 0.55);
  rimLight.position.set(-6, 4, -5);
  scene.add(rimLight);

  scene.add(createStarfield(starCount));

  var solarGroup = new THREE.Group();
  scene.add(solarGroup);

  var coreMesh = createJellyCoreMesh(1.25);
  solarGroup.add(coreMesh);

  var coreLabel = document.createElement('div');
  coreLabel.className = 'galaxy-label galaxy-label-core';
  coreLabel.textContent = 'Core';
  var coreLabelObj = new CSS2DObject(coreLabel);
  coreLabelObj.position.set(0, 1.65, 0);
  coreMesh.add(coreLabelObj);

  var planets = [];
  var loader = new THREE.TextureLoader();
  var selectedGroup = null;

  builders.forEach(function (b) {
    var orbit = b.orbit || { radius: 3, speed: 0.3, phase: 0 };

    solarGroup.add(createOrbitPath(orbit, b.color));

    var size = b.size || 0.22;
    var planetMesh = createGlassPlanetMesh(size, b.color || '#a855f7', b.avatar, loader);
    planetMesh.userData.builder = b;
    solarGroup.add(planetMesh);

    var labelEl = document.createElement('a');
    labelEl.className = 'galaxy-label';
    labelEl.href = b.xUrl || '#';
    labelEl.target = '_blank';
    labelEl.rel = 'noopener noreferrer';
    labelEl.textContent = b.name.split(' ')[0];
    labelEl.setAttribute('aria-label', b.name + ' on X');
    labelEl.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    var labelObj = new CSS2DObject(labelEl);
    labelObj.position.set(0, size + 0.22, 0);
    planetMesh.add(labelObj);

    planets.push({
      mesh: planetMesh,
      orbit: orbit,
      angle: orbit.phase || 0,
      baseScale: 1,
    });
  });

  function resize() {
    var w = container.clientWidth;
    var h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
  }
  resize();
  window.addEventListener('resize', resize);

  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();

  function setPointer(event) {
    var rect = renderer.domElement.getBoundingClientRect();
    var clientX = event.clientX;
    var clientY = event.clientY;
    if (event.changedTouches && event.changedTouches.length) {
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else if (event.touches && event.touches.length) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  function highlight(group) {
    if (selectedGroup && selectedGroup !== group) {
      selectedGroup.scale.setScalar(selectedGroup.userData.baseScale || 1);
    }
    selectedGroup = group;
    if (group) {
      group.userData.baseScale = group.userData.baseScale || 1;
      group.scale.setScalar(group.userData.baseScale * 1.22);
    }
  }

  function onPick(event) {
    if (event.target && event.target.closest &&
        event.target.closest('.galaxy-panel, .cover-topline, .cover-philosophy, .cover-scroll, a.galaxy-label')) return;
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObjects(solarGroup.children, true);
    for (var i = 0; i < hits.length; i++) {
      var target = findPlanetGroup(hits[i].object);
      if (!target) continue;
      if (target.userData.isCore) {
        var latest = document.querySelector('.archive-link');
        window.location.href = latest ? latest.getAttribute('href') : '#archive';
        return;
      }
      if (target.userData.builder) {
        highlight(target);
        openPanel(target.userData.builder);
        return;
      }
    }
    highlight(null);
    closePanel();
  }

  renderer.domElement.addEventListener('click', onPick);
  renderer.domElement.addEventListener('touchend', function (e) {
    if (e.changedTouches.length) onPick(e.changedTouches[0]);
  });

  var clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    var dt = clock.getDelta();
    var elapsed = clock.getElapsedTime();

    if (coreMesh.userData.shaderMat) {
      coreMesh.userData.shaderMat.uniforms.uTime.value = elapsed;
    }

    if (!reducedMotion) {
      planets.forEach(function (p) {
        p.angle += p.orbit.speed * dt;
        p.mesh.position.copy(orbitPosition(p.orbit, p.angle));
      });
      solarGroup.rotation.y += 0.12 * dt;
    }
    controls.update();
    composer.render();
    labelRenderer.render(scene, camera);
  }
  animate();
}

initGalaxy();

window.galaxyOpenPanel = openPanel;
