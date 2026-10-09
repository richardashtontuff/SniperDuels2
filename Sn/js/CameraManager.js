// CameraManager.js - Dual-Pass Rendering, No-Clip Viewmodel & ADS Scope Zoom
import * as THREE from '../vendor/three/three.module.js';

export class CameraManager {
  constructor(renderer, aspect) {
    this.renderer = renderer;

    const safeAspect = (aspect && !isNaN(aspect) && isFinite(aspect) && aspect > 0) ? aspect : (16 / 9);

    // 1. World Camera
    this.baseFov = 75;
    this.scopedFov = 20;
    this.worldCamera = new THREE.PerspectiveCamera(this.baseFov, safeAspect, 0.1, 1000);

    // 2. Dedicated Viewmodel Camera (Fixed FOV prevents fisheye distortion)
    this.vmFov = 52;
    this.vmCamera = new THREE.PerspectiveCamera(this.vmFov, safeAspect, 0.01, 20);

    // Viewmodel scene
    this.vmScene = new THREE.Scene();

    // Lighting for Viewmodel so weapons always look vibrant and distinct
    const vmAmbient = new THREE.AmbientLight(0xffffff, 1.2);
    this.vmScene.add(vmAmbient);
    const vmDirectional = new THREE.DirectionalLight(0xffffff, 1.6);
    vmDirectional.position.set(2, 4, 3);
    this.vmScene.add(vmDirectional);
    const vmRimLight = new THREE.DirectionalLight(0x00d2ff, 0.8);
    vmRimLight.position.set(-2, -1, -2);
    this.vmScene.add(vmRimLight);

    // Scope Overlay DOM Element
    this.scopeOverlay = document.getElementById('sniper-scope-overlay');
  }

  onResize(width, height) {
    const w = (width && width > 0) ? width : (window.innerWidth || 800);
    const h = (height && height > 0) ? height : (window.innerHeight || 600);
    const aspect = w / h;

    this.worldCamera.aspect = aspect;
    this.worldCamera.updateProjectionMatrix();

    this.vmCamera.aspect = aspect;
    this.vmCamera.updateProjectionMatrix();

    this.renderer.setSize(w, h);
  }

  updateADS(adsProgress, delta) {
    const safeProgress = (typeof adsProgress === 'number' && !isNaN(adsProgress)) ? adsProgress : 0;
    // Interpolate World Camera FOV for high magnification zoom
    const targetFov = THREE.MathUtils.lerp(this.baseFov, this.scopedFov, safeProgress);
    this.worldCamera.fov = isNaN(targetFov) ? this.baseFov : targetFov;
    this.worldCamera.updateProjectionMatrix();

    // Update Scope DOM Overlay opacity
    if (!this.scopeOverlay) {
      this.scopeOverlay = document.getElementById('sniper-scope-overlay');
    }
    if (this.scopeOverlay) {
      if (safeProgress > 0.6) {
        this.scopeOverlay.style.opacity = ((safeProgress - 0.6) / 0.4).toFixed(3);
        this.scopeOverlay.style.pointerEvents = 'none';
        this.scopeOverlay.style.display = 'block';
      } else {
        this.scopeOverlay.style.opacity = '0';
        this.scopeOverlay.style.display = 'none';
      }
    }
  }

  // Dual-Pass Render
  render(worldScene, vmScene = null) {
    // Ensure world scene matrix is up to date
    this.worldCamera.updateMatrixWorld(true);

    // Render World
    this.renderer.autoClear = false;
    this.renderer.clear();
    this.renderer.render(worldScene, this.worldCamera);

    // When scoped in ADS, skip viewmodel render pass so the rifle body never obstructs the scope aperture
    if (this.worldCamera.fov < 48) {
      return;
    }

    const sceneToRender = vmScene || this.vmScene;
    if (sceneToRender) {
      // Viewmodel camera is fixed at origin looking directly down -Z at the weapon
      this.vmCamera.position.set(0, 0, 0);
      this.vmCamera.rotation.set(0, 0, 0);
      this.vmCamera.quaternion.set(0, 0, 0, 1);
      this.vmCamera.updateMatrixWorld(true);

      // Clear Depth Buffer so viewmodel renders cleanly on top without wall clipping
      this.renderer.clearDepth();

      // Render Viewmodel Weapon
      this.renderer.render(sceneToRender, this.vmCamera);
    }
  }
}
