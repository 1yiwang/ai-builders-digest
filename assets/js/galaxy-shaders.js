/**
 * Shader materials for the galaxy cover — jelly core + glass planets.
 * Rim glow (Fresnel) + gradient + optional avatar sampling.
 */
import * as THREE from 'three';

const JELLY_CORE_VERT = /* glsl */`
  uniform float uTime;
  uniform float uDisplacement;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    float pulse = 1.0 + sin(uTime * 1.12) * 0.026;
    float n = sin(position.x * 2.5 + uTime * 0.72)
            * cos(position.y * 2.05 + uTime * 0.58)
            * sin(position.z * 2.25 + uTime * 0.48);

    vec3 pos = position + normal * n * uDisplacement * pulse;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const JELLY_CORE_FRAG = /* glsl */`
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uRimPower;
  uniform float uRimStrength;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), uRimPower);

    vec3 base = mix(uColorB, uColorA, fresnel * 0.42 + 0.16);
    vec3 rimColor = mix(uColorA, uColorC, 0.5);
    vec3 rim = rimColor * fresnel * uRimStrength;
    vec3 color = base + rim * 0.88;

    float alpha = 0.82 + fresnel * 0.14;
    gl_FragColor = vec4(color, alpha);
  }
`;

const GLASS_PLANET_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const GLASS_PLANET_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform sampler2D uAvatar;
  uniform float uHasAvatar;
  uniform float uRimPower;
  uniform float uRimStrength;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), uRimPower);

    vec3 inner = uColor * 0.55;
    if (uHasAvatar > 0.5) {
      vec3 av = texture2D(uAvatar, vUv).rgb;
      inner = mix(inner, av, 0.38);
    }

    float coreGlow = 1.0 - fresnel;
    inner += uColor * coreGlow * 0.65;

    vec3 rim = (uColor * 1.25 + vec3(0.25)) * fresnel * uRimStrength;
    vec3 color = inner + rim;

    float alpha = 0.5 + fresnel * 0.45;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createJellyCoreMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDisplacement: { value: 0.13 },
      uColorA: { value: new THREE.Color(0x38bdf8) },
      uColorB: { value: new THREE.Color(0x2563eb) },
      uColorC: { value: new THREE.Color(0x60a5fa) },
      uRimPower: { value: 3.1 },
      uRimStrength: { value: 0.92 },
    },
    vertexShader: JELLY_CORE_VERT,
    fragmentShader: JELLY_CORE_FRAG,
    transparent: true,
    depthWrite: false,
  });
}

export function createGlassPlanetMaterial(colorHex) {
  var col = new THREE.Color(colorHex);
  var uniforms = {
    uColor: { value: col },
    uAvatar: { value: null },
    uHasAvatar: { value: 0 },
    uRimPower: { value: 3.2 },
    uRimStrength: { value: 1.1 },
  };

  var mat = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: GLASS_PLANET_VERT,
    fragmentShader: GLASS_PLANET_FRAG,
    transparent: true,
    depthWrite: false,
  });

  mat.setAvatar = function (texture) {
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      uniforms.uAvatar.value = texture;
      uniforms.uHasAvatar.value = 1;
    }
  };

  return mat;
}

export function createJellyCoreMesh(radius) {
  var geo = new THREE.IcosahedronGeometry(radius, 4);
  var mat = createJellyCoreMaterial();
  var mesh = new THREE.Mesh(geo, mat);
  mesh.userData.isCore = true;
  mesh.userData.shaderMat = mat;
  return mesh;
}

export function createGlassPlanetMesh(size, colorHex, avatarPath, loader) {
  var mat = createGlassPlanetMaterial(colorHex);
  var mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 48, 48), mat);

  if (avatarPath && loader) {
    loader.load(
      avatarPath,
      function (tex) { mat.setAvatar(tex); },
      undefined,
      function () { /* keep color-only glass */ }
    );
  }

  return mesh;
}
