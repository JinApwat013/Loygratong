import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildProceduralKrathong, KrathongMeshHandle, KrathongVisualConfig } from './krathongBuilder';

interface KrathongPreviewCanvasProps {
  config: KrathongVisualConfig;
}

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

export function KrathongPreviewCanvas({ config }: KrathongPreviewCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const krathongRef = useRef<KrathongMeshHandle | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x09071a, 0.08);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      40,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.1,
      50,
    );
    camera.position.set(2.3, 1.85, 2.55);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 1.9;
    controls.maxDistance = 4.6;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.target.set(0, 0.42, 0);
    controls.update();

    // 3-point lighting
    const hemi = new THREE.HemisphereLight(0xa5b4fc, 0x1e1b4b, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfde68a, 1.6);
    keyLight.position.set(3, 5, 3);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc084fc, 1.1);
    rimLight.position.set(-3, 2.5, -3);
    scene.add(rimLight);

    // Subtle cosmic water disc pedestal
    const waterGeo = new THREE.CircleGeometry(3.5, 48);
    const waterMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0b102b'),
      roughness: 0.14,
      metalness: 0.75,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.receiveShadow = true;
    scene.add(waterMesh);

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
      const elapsed = clock.getElapsedTime();
      if (krathongRef.current) {
        krathongRef.current.group.position.y = Math.sin(elapsed * 1.8) * 0.035;
        krathongRef.current.group.rotation.y = elapsed * 0.22;
        krathongRef.current.update(elapsed, 0);
      }
      controls.update();
      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
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
      if (krathongRef.current) {
        scene.remove(krathongRef.current.group);
        krathongRef.current.dispose();
        krathongRef.current = null;
      }
      waterGeo.dispose();
      waterMat.dispose();
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (krathongRef.current) {
      scene.remove(krathongRef.current.group);
      krathongRef.current.dispose();
    }
    const nextHandle = buildProceduralKrathong(config, { enablePointLight: true });
    scene.add(nextHandle.group);
    krathongRef.current = nextHandle;
  }, [config]);

  if (webglUnavailable) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-white/10 bg-[#0b0920] p-6 text-center">
        <p className="font-display text-lg text-amber-200">ตัวอย่างกระทง 3 มิติ</p>
        <p className="mt-2 text-sm text-slate-400">
          เบราว์เซอร์นี้ปิดการเร่งความเร็ว WebGL แต่ยังสามารถตกแต่งและลอยกระทงได้ตามปกติ
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_50%_20%,rgba(109,40,217,0.28),rgba(7,7,20,0.96))]">
      <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute bottom-3 left-3 text-xs text-slate-400">
        ลากเพื่อหมุนดูกระทงรอบทิศทาง · ซูมเข้าออกได้
      </div>
    </div>
  );
}
