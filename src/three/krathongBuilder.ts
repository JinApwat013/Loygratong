import * as THREE from 'three';
import { KrathongDecoration, KrathongDesign } from '../types/universe';

export interface KrathongVisualConfig {
  design: KrathongDesign;
  flowerColor: string;
  candleColor: string;
  decoration: KrathongDecoration;
}

export interface KrathongMeshHandle {
  group: THREE.Group;
  flameMesh: THREE.Mesh;
  haloMesh: THREE.Mesh;
  candleLight: THREE.PointLight;
  orbitersGroup: THREE.Group;
  update: (elapsed: number, loveGlowBoost: number) => void;
  dispose: () => void;
}

function createRadialGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 244, 214, 1)');
  grad.addColorStop(0.28, 'rgba(251, 191, 36, 0.72)');
  grad.addColorStop(0.65, 'rgba(244, 114, 182, 0.2)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPetalGeometry(length: number, width: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(width * 0.6, length * 0.25, width * 0.52, length * 0.72, 0, length);
  shape.bezierCurveTo(-width * 0.52, length * 0.72, -width * 0.6, length * 0.25, 0, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.center();
  return geo;
}

export function buildProceduralKrathong(
  config: KrathongVisualConfig,
  options?: { enablePointLight?: boolean },
): KrathongMeshHandle {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const flowerCol = new THREE.Color(config.flowerColor);
  const candleCol = new THREE.Color(config.candleColor);

  // 1. Primary Silhouette: Base Dish depending on KrathongDesign
  let baseMaterial: THREE.Material;
  let baseMesh: THREE.Mesh;

  if (config.design === KrathongDesign.COSMIC_CRYSTAL) {
    const baseGeo = new THREE.CylinderGeometry(0.92, 0.68, 0.24, 10, 1);
    baseMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#7dd3fc'),
      roughness: 0.12,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.86,
      emissive: new THREE.Color('#312e81'),
      emissiveIntensity: 0.35,
    });
    baseMesh = new THREE.Mesh(baseGeo, baseMaterial);
    baseMesh.position.y = 0.12;
    disposables.push(baseGeo, baseMaterial);
  } else if (config.design === KrathongDesign.MOON_BOAT) {
    // Crescent moon hull built with Lathe/Tube arc
    const boatShape = new THREE.Shape();
    boatShape.moveTo(-1.08, 0.16);
    boatShape.quadraticCurveTo(0, -0.45, 1.08, 0.16);
    boatShape.quadraticCurveTo(0, -0.05, -1.08, 0.16);
    const boatGeo = new THREE.ExtrudeGeometry(boatShape, {
      depth: 0.56,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 3,
      curveSegments: 16,
    });
    boatGeo.center();
    baseMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fde68a'),
      roughness: 0.26,
      metalness: 0.72,
      emissive: new THREE.Color('#92400e'),
      emissiveIntensity: 0.25,
    });
    baseMesh = new THREE.Mesh(boatGeo, baseMaterial);
    baseMesh.position.y = 0.2;
    disposables.push(boatGeo, baseMaterial);
  } else if (config.design === KrathongDesign.GALAXY_LEAF) {
    const baseGeo = new THREE.CylinderGeometry(0.94, 0.78, 0.24, 24);
    baseMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#134e4a'),
      roughness: 0.55,
      metalness: 0.18,
      emissive: new THREE.Color('#042f2e'),
      emissiveIntensity: 0.3,
    });
    baseMesh = new THREE.Mesh(baseGeo, baseMaterial);
    baseMesh.position.y = 0.12;
    disposables.push(baseGeo, baseMaterial);
  } else {
    // CLASSIC_LOTUS
    const baseGeo = new THREE.CylinderGeometry(0.9, 0.66, 0.22, 16);
    baseMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3b0764'),
      roughness: 0.38,
      metalness: 0.42,
      emissive: new THREE.Color('#1e1b4b'),
      emissiveIntensity: 0.25,
    });
    baseMesh = new THREE.Mesh(baseGeo, baseMaterial);
    baseMesh.position.y = 0.11;
    disposables.push(baseGeo, baseMaterial);
  }

  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // Golden trim ring around base
  const rimGeo = new THREE.TorusGeometry(0.86, 0.032, 10, 36);
  const rimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fbbf24'),
    roughness: 0.2,
    metalness: 0.88,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.y = 0.22;
  group.add(rimMesh);
  disposables.push(rimGeo, rimMat);

  // 2. Secondary Read: Outer & Inner Lotus Petal Rings
  const outerPetalGeo = createPetalGeometry(0.56, 0.32);
  const innerPetalGeo = createPetalGeometry(0.42, 0.25);

  const outerPetalMat = new THREE.MeshPhysicalMaterial({
    color: flowerCol,
    roughness: 0.32,
    metalness: 0.08,
    clearcoat: 0.45,
    emissive: flowerCol.clone().multiplyScalar(0.18),
  });
  const innerPetalMat = new THREE.MeshPhysicalMaterial({
    color: flowerCol.clone().lerp(new THREE.Color('#ffffff'), 0.28),
    roughness: 0.25,
    metalness: 0.12,
    clearcoat: 0.65,
    emissive: flowerCol.clone().multiplyScalar(0.24),
  });
  disposables.push(outerPetalGeo, innerPetalGeo, outerPetalMat, innerPetalMat);

  const outerCount = config.design === KrathongDesign.COSMIC_CRYSTAL ? 10 : 12;
  for (let i = 0; i < outerCount; i++) {
    const angle = (i / outerCount) * Math.PI * 2;
    const petal = new THREE.Mesh(outerPetalGeo, outerPetalMat);
    const radius = 0.72;
    petal.position.set(Math.cos(angle) * radius, 0.28, Math.sin(angle) * radius);
    petal.rotation.order = 'YXZ';
    petal.rotation.y = -angle + Math.PI / 2;
    petal.rotation.x = 0.88;
    petal.castShadow = true;
    group.add(petal);
  }

  const innerCount = 8;
  for (let i = 0; i < innerCount; i++) {
    const angle = (i / innerCount) * Math.PI * 2 + Math.PI / innerCount;
    const petal = new THREE.Mesh(innerPetalGeo, innerPetalMat);
    const radius = 0.46;
    petal.position.set(Math.cos(angle) * radius, 0.34, Math.sin(angle) * radius);
    petal.rotation.order = 'YXZ';
    petal.rotation.y = -angle + Math.PI / 2;
    petal.rotation.x = 0.56;
    petal.castShadow = true;
    group.add(petal);
  }

  // Central floral cushion
  const cushionGeo = new THREE.CylinderGeometry(0.36, 0.42, 0.14, 18);
  const cushionMat = new THREE.MeshStandardMaterial({
    color: flowerCol.clone().lerp(new THREE.Color('#1e1b4b'), 0.35),
    roughness: 0.6,
    metalness: 0.1,
  });
  const cushionMesh = new THREE.Mesh(cushionGeo, cushionMat);
  cushionMesh.position.y = 0.26;
  group.add(cushionMesh);
  disposables.push(cushionGeo, cushionMat);

  // 3. Accent Detail: Wax Candle, Wick, Flame & Halo
  const candleGeo = new THREE.CylinderGeometry(0.085, 0.1, 0.52, 16);
  const candleMat = new THREE.MeshPhysicalMaterial({
    color: candleCol,
    roughness: 0.35,
    metalness: 0.05,
    clearcoat: 0.4,
    emissive: candleCol.clone().multiplyScalar(0.25),
  });
  const candleMesh = new THREE.Mesh(candleGeo, candleMat);
  candleMesh.position.y = 0.56;
  candleMesh.castShadow = true;
  group.add(candleMesh);
  disposables.push(candleGeo, candleMat);

  const wickGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8);
  const wickMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
  const wickMesh = new THREE.Mesh(wickGeo, wickMat);
  wickMesh.position.y = 0.85;
  group.add(wickMesh);
  disposables.push(wickGeo, wickMat);

  const flameGeo = new THREE.ConeGeometry(0.058, 0.2, 12);
  const flameMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#fef08a'),
  });
  const flameMesh = new THREE.Mesh(flameGeo, flameMat);
  flameMesh.position.y = 0.96;
  group.add(flameMesh);
  disposables.push(flameGeo, flameMat);

  const glowTex = createRadialGlowTexture();
  const haloGeo = new THREE.PlaneGeometry(0.85, 0.85);
  const haloMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const haloMesh = new THREE.Mesh(haloGeo, haloMat);
  haloMesh.position.y = 0.98;
  group.add(haloMesh);
  disposables.push(glowTex, haloGeo, haloMat);

  const candleLight = new THREE.PointLight(
    candleCol.clone().lerp(new THREE.Color('#fde047'), 0.6),
    options?.enablePointLight === false ? 0 : 2.1,
    6.5,
    1.8,
  );
  candleLight.position.set(0, 1.08, 0);
  group.add(candleLight);

  // 4. Decoration Accent Layer
  const orbitersGroup = new THREE.Group();
  group.add(orbitersGroup);

  if (config.decoration === KrathongDecoration.MINI_SATURN) {
    const planetGeo = new THREE.SphereGeometry(0.11, 18, 18);
    const planetMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#c4b5fd'),
      roughness: 0.25,
      metalness: 0.5,
      emissive: new THREE.Color('#6d28d9'),
      emissiveIntensity: 0.4,
    });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.position.set(0.55, 0.72, 0);
    orbitersGroup.add(planet);

    const saturnRingGeo = new THREE.TorusGeometry(0.19, 0.022, 8, 28);
    const saturnRingMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fde68a'),
      roughness: 0.2,
      metalness: 0.85,
    });
    const saturnRing = new THREE.Mesh(saturnRingGeo, saturnRingMat);
    saturnRing.position.copy(planet.position);
    saturnRing.rotation.set(Math.PI / 2.6, 0.3, 0);
    orbitersGroup.add(saturnRing);
    disposables.push(planetGeo, planetMat, saturnRingGeo, saturnRingMat);
  } else if (config.decoration === KrathongDecoration.MOON_PEARLS) {
    const pearlGeo = new THREE.SphereGeometry(0.065, 14, 14);
    const pearlMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#f8fafc'),
      roughness: 0.12,
      metalness: 0.1,
      clearcoat: 1,
      iridescence: 0.9,
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pearl = new THREE.Mesh(pearlGeo, pearlMat);
      pearl.position.set(Math.cos(a) * 0.88, 0.26, Math.sin(a) * 0.88);
      orbitersGroup.add(pearl);
    }
    disposables.push(pearlGeo, pearlMat);
  } else if (config.decoration === KrathongDecoration.STARLIGHT_FIREFLIES) {
    const orbGeo = new THREE.SphereGeometry(0.038, 10, 10);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(
        Math.cos(a) * (0.58 + (i % 2) * 0.22),
        0.52 + (i % 3) * 0.16,
        Math.sin(a) * (0.58 + (i % 2) * 0.22),
      );
      orbitersGroup.add(orb);
    }
    disposables.push(orbGeo, orbMat);
  } else {
    // FLOATING_PETALS
    const miniPetalGeo = createPetalGeometry(0.22, 0.14);
    const miniPetalMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fda4af'),
      roughness: 0.4,
      emissive: new THREE.Color('#be185d'),
      emissiveIntensity: 0.2,
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const mp = new THREE.Mesh(miniPetalGeo, miniPetalMat);
      mp.position.set(Math.cos(a) * 1.06, 0.04, Math.sin(a) * 1.06);
      mp.rotation.x = Math.PI / 2;
      mp.rotation.z = a;
      orbitersGroup.add(mp);
    }
    disposables.push(miniPetalGeo, miniPetalMat);
  }

  // Subtle water contact ring beneath krathong
  const rippleGeo = new THREE.RingGeometry(0.95, 1.18, 36);
  const rippleMat = new THREE.MeshBasicMaterial({
    color: flowerCol.clone().lerp(new THREE.Color('#a78bfa'), 0.5),
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const rippleMesh = new THREE.Mesh(rippleGeo, rippleMat);
  rippleMesh.rotation.x = -Math.PI / 2;
  rippleMesh.position.y = 0.015;
  group.add(rippleMesh);
  disposables.push(rippleGeo, rippleMat);

  const update = (elapsed: number, loveGlowBoost: number) => {
    const flicker = 1 + Math.sin(elapsed * 11.5) * 0.08 + Math.cos(elapsed * 17.3) * 0.05;
    const scaleBoost = 1 + loveGlowBoost * 0.45;
    flameMesh.scale.set(
      (0.92 + Math.sin(elapsed * 9) * 0.06) * scaleBoost,
      flicker * scaleBoost,
      (0.92 + Math.cos(elapsed * 8) * 0.06) * scaleBoost,
    );
    haloMesh.scale.setScalar((0.95 + Math.sin(elapsed * 6) * 0.08) * (1 + loveGlowBoost * 0.75));
    (haloMesh.material as THREE.MeshBasicMaterial).opacity = Math.min(
      1,
      0.72 + loveGlowBoost * 0.28,
    );
    if (options?.enablePointLight !== false) {
      candleLight.intensity = (2.0 + Math.sin(elapsed * 10) * 0.18) * (1 + loveGlowBoost * 1.1);
    }

    if (config.decoration === KrathongDecoration.MINI_SATURN ||
        config.decoration === KrathongDecoration.STARLIGHT_FIREFLIES) {
      orbitersGroup.rotation.y = elapsed * 0.55;
    }

    const rippleScale = 1 + Math.sin(elapsed * 2.2) * 0.06;
    rippleMesh.scale.set(rippleScale, rippleScale, 1);
  };

  const dispose = () => {
    for (const item of disposables) {
      item.dispose();
    }
  };

  return {
    group,
    flameMesh,
    haloMesh,
    candleLight,
    orbitersGroup,
    update,
    dispose,
  };
}
