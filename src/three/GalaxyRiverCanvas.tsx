import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Eye, EyeOff, Heart, RotateCcw, Sparkles } from 'lucide-react';
import { Krathong, KrathongStatus } from '../types/universe';
import { buildProceduralKrathong, KrathongMeshHandle } from './krathongBuilder';

interface GalaxyRiverCanvasProps {
  krathongs: Krathong[];
  sharedLoveActive: boolean;
  onReplaySharedLove?: () => void;
  hasSharedLoveEvent: boolean;
  myName?: string;
  partnerName?: string;
}

interface ProjectedLabel {
  krathongId: string;
  ownerName: string;
  wishMessage: string;
  showWish: boolean;
  floatedAt: string | null;
  x: number;
  y: number;
  visible: boolean;
}

type CameraPreset = 'couple' | 'water' | 'moon';

const _projVec = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createHeartGeometry(): THREE.ExtrudeGeometry {
  const x = 0;
  const y = 0;
  const shape = new THREE.Shape();
  shape.moveTo(x, y + 0.14);
  shape.bezierCurveTo(x, y + 0.14, x - 0.04, y + 0.24, x - 0.14, y + 0.24);
  shape.bezierCurveTo(x - 0.28, y + 0.24, x - 0.28, y + 0.06, x - 0.28, y + 0.06);
  shape.bezierCurveTo(x - 0.28, y - 0.06, x - 0.14, y - 0.18, x, y - 0.28);
  shape.bezierCurveTo(x + 0.14, y - 0.18, x + 0.28, y - 0.06, x + 0.28, y + 0.06);
  shape.bezierCurveTo(x + 0.28, y + 0.06, x + 0.28, y + 0.24, x + 0.14, y + 0.24);
  shape.bezierCurveTo(x + 0.04, y + 0.24, x, y + 0.14, x, y + 0.14);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

function formatThaiTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function GalaxyRiverCanvas({
  krathongs,
  sharedLoveActive,
  onReplaySharedLove,
  hasSharedLoveEvent,
  myName,
  partnerName,
}: GalaxyRiverCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraTargetGoal = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null);

  const floatingMapRef = useRef<
    Map<
      string,
      {
        data: Krathong;
        handle: KrathongMeshHandle;
        slotIndex: number;
        targetX: number;
        targetZ: number;
      }
    >
  >(new Map());

  const sharedLoveRef = useRef(sharedLoveActive);
  sharedLoveRef.current = sharedLoveActive;

  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [activePreset, setActivePreset] = useState<CameraPreset>('couple');
  const [arSupported, setArSupported] = useState(false);
  const [arMessage, setArMessage] = useState<string | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const floatingList = krathongs.filter((k) => k.status === KrathongStatus.FLOATING);
  const floatingListRef = useRef(floatingList);
  floatingListRef.current = floatingList;

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'xr' in navigator && navigator.xr) {
      navigator.xr
        .isSessionSupported('immersive-ar')
        .then((supported) => setArSupported(supported))
        .catch(() => setArSupported(false));
    }
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x060516);
    scene.fog = new THREE.FogExp2(0x060516, 0.024);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      52,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.1,
      180,
    );
    camera.position.set(0, 3.6, 8.2);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.055;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;
    controls.minDistance = 3.2;
    controls.maxDistance = 18;
    controls.target.set(0, 0.7, -0.5);
    controls.update();
    controlsRef.current = controls;

    controls.addEventListener('start', () => {
      cameraTargetGoal.current = null;
    });

    // Lighting rig: cool cosmic sky + warm moonlight key + violet rim
    const hemi = new THREE.HemisphereLight(0x818cf8, 0x1e1b4b, 0.7);
    scene.add(hemi);

    const moonLight = new THREE.DirectionalLight(0xfef3c7, 1.45);
    moonLight.position.set(0, 12, -26);
    moonLight.castShadow = !isSoftwareGl;
    moonLight.shadow.camera.left = -12;
    moonLight.shadow.camera.right = 12;
    moonLight.shadow.camera.top = 12;
    moonLight.shadow.camera.bottom = -12;
    moonLight.shadow.bias = -0.0005;
    moonLight.shadow.normalBias = 0.02;
    scene.add(moonLight);

    const nebulaRim = new THREE.DirectionalLight(0xa855f7, 0.9);
    nebulaRim.position.set(-10, 5, 6);
    scene.add(nebulaRim);

    // 1. Cosmic River Surface with animated ripples via onBeforeCompile
    const riverUniforms = { uTime: { value: 0 } };
    const riverGeo = new THREE.PlaneGeometry(120, 120, 96, 96);
    const riverMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#090d29'),
      roughness: 0.14,
      metalness: 0.78,
      emissive: new THREE.Color('#1e1b4b'),
      emissiveIntensity: 0.35,
    });
    riverMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = riverUniforms.uTime;
      shader.vertexShader =
        `uniform float uTime;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float wave1 = sin(position.x * 0.45 + uTime * 1.1) * 0.055;
          float wave2 = cos(position.y * 0.6 - uTime * 0.85) * 0.045;
          transformed.z += wave1 + wave2;`,
        );
    };
    const riverMesh = new THREE.Mesh(riverGeo, riverMat);
    riverMesh.rotation.x = -Math.PI / 2;
    riverMesh.receiveShadow = true;
    scene.add(riverMesh);

    // 2. Distant cosmic silhouette shores so there is no floating void
    const shoreGeo = new THREE.CylinderGeometry(36, 44, 3.8, 48, 1, true, Math.PI * 0.65, Math.PI * 0.7);
    const shoreMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#130c2e'),
      roughness: 0.9,
      side: THREE.BackSide,
    });
    const shoreMesh = new THREE.Mesh(shoreGeo, shoreMat);
    shoreMesh.position.set(0, 1.4, -10);
    scene.add(shoreMesh);

    // 3. Full Moon + Luminous Halo
    const moonGeo = new THREE.SphereGeometry(3.4, 36, 36);
    const moonMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fef9c3'),
      emissive: new THREE.Color('#fde68a'),
      emissiveIntensity: 1.15,
      roughness: 0.6,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.set(0, 10.5, -34);
    scene.add(moonMesh);

    const moonHaloGeo = new THREE.RingGeometry(3.55, 5.8, 48);
    const moonHaloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#c4b5fd'),
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const moonHalo = new THREE.Mesh(moonHaloGeo, moonHaloMat);
    moonHalo.position.copy(moonMesh.position);
    scene.add(moonHalo);

    // 4. Background Starfield
    const starCount = 700;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    const palette = [
      new THREE.Color('#f8fafc'),
      new THREE.Color('#c4b5fd'),
      new THREE.Color('#93c5fd'),
      new THREE.Color('#fde68a'),
    ];
    for (let i = 0; i < starCount; i++) {
      const r = 24 + Math.random() * 48;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45;
      starPos[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
      starPos[i * 3 + 1] = 3 + Math.cos(phi) * r * 0.72;
      starPos[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r - 10;
      const c = palette[i % palette.length];
      starCol[i * 3] = c.r;
      starCol[i * 3 + 1] = c.g;
      starCol[i * 3 + 2] = c.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // 5. Heart Constellation Stars (converge into heart shape in sky during Shared Love Moment)
    const heartStarCount = 72;
    const heartStartPos = new Float32Array(heartStarCount * 3);
    const heartTargetPos = new Float32Array(heartStarCount * 3);
    const heartCurrPos = new Float32Array(heartStarCount * 3);

    for (let i = 0; i < heartStarCount; i++) {
      const t = (i / heartStarCount) * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy =
        13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

      heartTargetPos[i * 3] = hx * 0.34;
      heartTargetPos[i * 3 + 1] = 10.6 + hy * 0.32;
      heartTargetPos[i * 3 + 2] = -24;

      heartStartPos[i * 3] = (Math.random() - 0.5) * 38;
      heartStartPos[i * 3 + 1] = 6 + Math.random() * 14;
      heartStartPos[i * 3 + 2] = -28 + (Math.random() - 0.5) * 10;

      heartCurrPos[i * 3] = heartStartPos[i * 3];
      heartCurrPos[i * 3 + 1] = heartStartPos[i * 3 + 1];
      heartCurrPos[i * 3 + 2] = heartStartPos[i * 3 + 2];
    }

    const heartConstGeo = new THREE.BufferGeometry();
    heartConstGeo.setAttribute('position', new THREE.BufferAttribute(heartCurrPos, 3));
    const heartConstMat = new THREE.PointsMaterial({
      color: new THREE.Color('#f9a8d4'),
      size: 0.36,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    const heartConstPoints = new THREE.Points(heartConstGeo, heartConstMat);
    scene.add(heartConstPoints);

    // 6. Rising 3D Hearts Pool for Shared Love Moment
    const risingHeartGeo = createHeartGeometry();
    const risingHeartMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fb7185'),
      emissive: new THREE.Color('#f43f5e'),
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.15,
      transparent: true,
      opacity: 0.9,
    });
    const risingHearts: Array<{
      mesh: THREE.Mesh;
      phase: number;
      speed: number;
      radius: number;
    }> = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(risingHeartGeo, risingHeartMat);
      m.visible = false;
      scene.add(m);
      risingHearts.push({
        mesh: m,
        phase: (i / 16) * 6,
        speed: 0.65 + (i % 4) * 0.18,
        radius: 0.4 + (i % 5) * 0.45,
      });
    }

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let loveMix = 0;
    let labelFrameSkip = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      riverUniforms.uTime.value = elapsed;

      const isLoveNow = sharedLoveRef.current;
      loveMix = THREE.MathUtils.damp(loveMix, isLoveNow ? 1 : 0, 2.0, delta);

      // Update Heart Constellation in the sky
      const posAttr = heartConstGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < heartStarCount; i++) {
        const ix = i * 3;
        const tx = THREE.MathUtils.lerp(heartStartPos[ix], heartTargetPos[ix], loveMix);
        const ty = THREE.MathUtils.lerp(heartStartPos[ix + 1], heartTargetPos[ix + 1], loveMix);
        const tz = THREE.MathUtils.lerp(heartStartPos[ix + 2], heartTargetPos[ix + 2], loveMix);
        posAttr.array[ix] = THREE.MathUtils.damp(posAttr.array[ix], tx, 3.0, delta);
        posAttr.array[ix + 1] = THREE.MathUtils.damp(posAttr.array[ix + 1], ty, 3.0, delta);
        posAttr.array[ix + 2] = THREE.MathUtils.damp(posAttr.array[ix + 2], tz, 3.0, delta);
      }
      posAttr.needsUpdate = true;
      heartConstMat.opacity = 0.18 + loveMix * 0.82;
      heartConstMat.size = 0.22 + loveMix * 0.24;

      // Update rising 3D hearts
      for (let i = 0; i < risingHearts.length; i++) {
        const item = risingHearts[i];
        item.mesh.visible = loveMix > 0.15;
        if (item.mesh.visible) {
          const cycle = (elapsed * item.speed + item.phase) % 5.5;
          item.mesh.position.set(
            Math.sin(elapsed * 1.4 + i) * item.radius,
            0.35 + cycle * 0.85,
            0.4 + Math.cos(elapsed * 1.1 + i) * 0.6,
          );
          item.mesh.rotation.y = elapsed * 1.2 + i;
          const s = (0.45 + Math.sin(cycle * 0.8) * 0.2) * loveMix;
          item.mesh.scale.setScalar(Math.max(0.01, s));
        }
      }

      // Smoothly animate floating krathongs
      const count = floatingMapRef.current.size;
      let idx = 0;
      floatingMapRef.current.forEach((entry) => {
        const isPairMode = isLoveNow && count >= 2;
        const desiredX = isPairMode
          ? (entry.slotIndex - (count - 1) / 2) * 2.35
          : entry.targetX;
        const desiredZ = isPairMode ? 0.5 : entry.targetZ;

        entry.handle.group.position.x = THREE.MathUtils.damp(
          entry.handle.group.position.x,
          desiredX,
          1.4,
          delta,
        );
        entry.handle.group.position.z = THREE.MathUtils.damp(
          entry.handle.group.position.z,
          desiredZ,
          1.4,
          delta,
        );

        const bobOffset = idx * 1.7;
        entry.handle.group.position.y =
          Math.sin(elapsed * 1.6 + bobOffset) * 0.045 + 0.02;
        entry.handle.group.rotation.z = Math.sin(elapsed * 1.2 + bobOffset) * 0.028;
        entry.handle.group.rotation.y = Math.sin(elapsed * 0.4 + bobOffset) * 0.14;
        entry.handle.update(elapsed, loveMix);
        idx++;
      });

      // Camera preset damping
      if (cameraTargetGoal.current) {
        camera.position.lerp(cameraTargetGoal.current.pos, 1 - Math.exp(-3.5 * delta));
        controls.target.lerp(cameraTargetGoal.current.look, 1 - Math.exp(-3.5 * delta));
        if (camera.position.distanceTo(cameraTargetGoal.current.pos) < 0.05) {
          cameraTargetGoal.current = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      // Project semantic DOM labels every 2 frames to keep React light
      labelFrameSkip++;
      if (labelFrameSkip % 2 === 0 && container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        const nextLabels: ProjectedLabel[] = [];
        floatingMapRef.current.forEach((entry) => {
          _projVec.copy(entry.handle.group.position);
          _projVec.y += 1.55;
          _projVec.project(camera);
          const x = (_projVec.x * 0.5 + 0.5) * w;
          const y = (-_projVec.y * 0.5 + 0.5) * h;
          const visible = _projVec.z < 1 && x > -80 && x < w + 80 && y > -40 && y < h + 40;
          nextLabels.push({
            krathongId: entry.data.krathongId,
            ownerName: entry.data.ownerName,
            wishMessage: entry.data.wishMessage,
            showWish: entry.data.showWish,
            floatedAt: entry.data.floatedAt,
            x,
            y,
            visible,
          });
        });
        setLabels(nextLabels);
      }

      if (isSoftwareGl && !renderer.xr.isPresenting) {
        afterDraw(tick);
      } else if (!renderer.xr.isPresenting) {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    const resizeObserver = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      floatingMapRef.current.forEach((entry) => {
        scene.remove(entry.handle.group);
        entry.handle.dispose();
      });
      floatingMapRef.current.clear();
      riverGeo.dispose();
      riverMat.dispose();
      shoreGeo.dispose();
      shoreMat.dispose();
      moonGeo.dispose();
      moonMat.dispose();
      moonHaloGeo.dispose();
      moonHaloMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      heartConstGeo.dispose();
      heartConstMat.dispose();
      risingHeartGeo.dispose();
      risingHeartMat.dispose();
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Synchronize floating krathongs with the 3D scene
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentIds = new Set(floatingList.map((k) => k.krathongId));

    // Remove krathongs no longer floating (e.g. after room reset)
    floatingMapRef.current.forEach((entry, id) => {
      if (!currentIds.has(id)) {
        scene.remove(entry.handle.group);
        entry.handle.dispose();
        floatingMapRef.current.delete(id);
      }
    });

    // Add newly floated krathongs with smooth glide-in entry position, and sync updated ownerName
    const sortedFloating = [...floatingList].sort((a, b) =>
      (a.floatedAt ?? a.createdAt).localeCompare(b.floatedAt ?? b.createdAt),
    );
    const total = sortedFloating.length;

    sortedFloating.forEach((k, slotIndex) => {
      const targetX = total <= 1 ? 0 : (slotIndex - (total - 1) / 2) * 3.4;
      const targetZ = slotIndex % 2 === 0 ? 0.9 : 0.2;
      const existingEntry = floatingMapRef.current.get(k.krathongId);

      if (existingEntry) {
        existingEntry.data = k;
        existingEntry.slotIndex = slotIndex;
        existingEntry.targetX = targetX;
        existingEntry.targetZ = targetZ;
      } else {
        const handle = buildProceduralKrathong(
          {
            design: k.design,
            flowerColor: k.flowerColor,
            candleColor: k.candleColor,
            decoration: k.decoration,
          },
          { enablePointLight: true },
        );
        const startX = slotIndex % 2 === 0 ? -6.5 : 6.5;
        handle.group.position.set(startX, 0.02, 4.2);
        scene.add(handle.group);
        floatingMapRef.current.set(k.krathongId, {
          data: k,
          handle,
          slotIndex,
          targetX,
          targetZ,
        });
      }
    });
  }, [floatingList]);

  const applyCameraPreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    if (preset === 'couple') {
      cameraTargetGoal.current = {
        pos: new THREE.Vector3(0, 3.6, 8.2),
        look: new THREE.Vector3(0, 0.7, -0.5),
      };
    } else if (preset === 'water') {
      cameraTargetGoal.current = {
        pos: new THREE.Vector3(0, 1.45, 5.8),
        look: new THREE.Vector3(0, 0.85, -3),
      };
    } else {
      cameraTargetGoal.current = {
        pos: new THREE.Vector3(0, 2.8, 10.5),
        look: new THREE.Vector3(0, 6.2, -24),
      };
    }
  };

  const handleEnterAr = async () => {
    setArMessage(null);
    const renderer = rendererRef.current;
    if (!renderer || !navigator.xr) {
      setArMessage('อุปกรณ์หรือเบราว์เซอร์นี้ยังไม่รองรับ WebXR AR (แนะนำเปิดผ่าน Chrome บนมือถือที่รองรับ ARCore)');
      return;
    }
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      if (!supported) {
        setArMessage('อุปกรณ์นี้ไม่รองรับโหมด AR แบบ Immersive แต่สามารถรับชมแม่น้ำ 3 มิติได้เต็มรูปแบบ');
        return;
      }
      const session = await navigator.xr.requestSession('immersive-ar', {
        optionalFeatures: ['local-floor', 'hit-test'],
      });
      await renderer.xr.setSession(session);
    } catch {
      setArMessage('ไม่สามารถเปิดโหมด WebXR AR ได้ กรุณาอนุญาตสิทธิ์กล้องหรือใช้งานบนอุปกรณ์ที่รองรับ');
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-[#060516]">
      {webglUnavailable ? (
        <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center">
          <p className="font-display text-2xl text-amber-200">แม่น้ำกาแล็กซี (Shared Galaxy River)</p>
          <p className="mt-2 max-w-md text-sm text-slate-300">
            ไม่สามารถเริ่มต้น WebGL ในเบราว์เซอร์นี้ได้ แต่ยังตรวจสอบข้อมูลกระทงที่ลอยแล้วด้านล่างได้
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {floatingList.map((k) => (
              <div key={k.krathongId} className="rounded-xl border border-white/10 bg-white/5 p-4 text-left">
                <p className="text-sm font-semibold text-white">เจ้าของ: {k.ownerName}</p>
                <p className="mt-1 text-xs text-emerald-300">สถานะ: ลอยแล้ว</p>
                {k.showWish && k.wishMessage && (
                  <p className="mt-2 text-sm text-slate-200">“{k.wishMessage}”</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      )}

      {/* Semantic Projected Labels over Floating Krathongs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {labels.map(
          (lbl) =>
            lbl.visible && (
              <div
                key={lbl.krathongId}
                style={{
                  transform: `translate(${lbl.x}px, ${lbl.y}px) translate(-50%, -100%)`,
                }}
                className="absolute left-0 top-0 w-56 rounded-xl border border-white/15 bg-[#0c0a24]/88 px-3.5 py-2.5 text-center shadow-xl"
              >
                <div className="flex items-center justify-center gap-1.5 text-xs text-amber-200">
                  <span className="font-semibold text-white">เจ้าของ: {lbl.ownerName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-pink-300">ลอยแล้ว</span>
                </div>
                {lbl.showWish && lbl.wishMessage ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-200">
                    “{lbl.wishMessage}”
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">
                    คำอธิษฐานของ {lbl.ownerName}
                  </p>
                )}
                {lbl.floatedAt && (
                  <p className="font-mono-tabular mt-1 text-[10px] text-slate-400">
                    ลอยเมื่อ {formatThaiTime(lbl.floatedAt)}
                  </p>
                )}
              </div>
            ),
        )}
      </div>

      {/* Empty River State Notice */}
      {floatingList.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center px-4">
          <div className="rounded-xl border border-white/15 bg-[#0b0920]/85 px-5 py-3 text-center">
            <p className="text-sm font-medium text-slate-100">
              {myName && partnerName
                ? `ผิวน้ำกาแล็กซียังเงียบสงบ รอคอยกระทงของ ${myName} และ ${partnerName}`
                : myName
                  ? `ผิวน้ำกาแล็กซียังเงียบสงบ รอคอยกระทงของ ${myName}`
                  : 'ผิวน้ำกาแล็กซียังเงียบสงบ รอคอยกระทงใบแรก'}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              เฉพาะกระทงที่กดลอยแล้วเท่านั้นจึงจะปรากฏบนแม่น้ำแห่งดวงดาวสายนี้
            </p>
          </div>
        </div>
      )}

      {/* AR Compatibility Message */}
      {arMessage && (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-xl border border-amber-400/30 bg-[#120e29]/95 px-4 py-2.5 text-center text-xs text-amber-200 shadow-lg">
          <span>{arMessage}</span>
          <button
            type="button"
            onClick={() => setArMessage(null)}
            className="ml-3 underline hover:text-white"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion, no backdrop-blur over WebGL) */}
      <div className="absolute bottom-4 left-1/2 z-20 flex w-max max-w-[94vw] -translate-x-1/2 flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="mb-1.5 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0c0a20]/90 px-3 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-[#171336] whitespace-nowrap"
        >
          {dockCollapsed ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          <span>{dockCollapsed ? 'แสดงปุ่มควบคุม' : 'ซ่อนปุ่มควบคุม'}</span>
        </button>

        {!dockCollapsed && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#0c0a20]/92 px-3 py-2 shadow-2xl">
            <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
              <button
                type="button"
                onClick={() => applyCameraPreset('couple')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  activePreset === 'couple'
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                มุมมองคู่รัก
              </button>
              <button
                type="button"
                onClick={() => applyCameraPreset('water')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  activePreset === 'water'
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                เหนือผิวน้ำ
              </button>
              <button
                type="button"
                onClick={() => applyCameraPreset('moon')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  activePreset === 'moon'
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                มองดวงจันทร์
              </button>
            </div>

            {hasSharedLoveEvent && onReplaySharedLove && (
              <button
                type="button"
                onClick={onReplaySharedLove}
                className="inline-flex items-center gap-1.5 rounded-lg border border-pink-400/30 bg-pink-500/15 px-3 py-1.5 text-xs font-medium text-pink-200 transition-colors hover:bg-pink-500/25 whitespace-nowrap"
              >
                <Heart className="h-3.5 w-3.5" />
                <span>
                  {myName && partnerName
                    ? `ดูช่วงเวลาของ ${myName} กับ ${partnerName}`
                    : 'ดูช่วงเวลาลอยกระทงคู่'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleEnterAr}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/25 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{arSupported ? 'เปิดโหมด AR' : 'โหมด AR (WebXR)'}</span>
            </button>

            <button
              type="button"
              onClick={() => applyCameraPreset('couple')}
              title="รีเซ็ตมุมกล้อง"
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:text-white whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>รีเซ็ตมุมกล้อง</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
