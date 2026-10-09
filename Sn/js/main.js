// main.js - Browser-Based "SNIPER DUELS" 3D Engine Entry Point
import * as THREE from '../vendor/three/three.module.js';
import { AudioSystem } from './AudioSystem.js';
import { ParticleSystem } from './ParticleSystem.js';
import { MapGenerator } from './MapGenerator.js';
import { CameraManager } from './CameraManager.js';
import { FPSControls } from './Controls.js';
import { WeaponSystem } from './WeaponSystem.js';
import { BotAI } from './BotAI.js';
import { CaseSystem } from './CaseSystem.js';
import { MatchManager } from './MatchManager.js';
import { MultiplayerClient } from './MultiplayerClient.js';

class GameEngine {
  constructor() {
    this.container = document.getElementById('canvas-container');

    const initW = window.innerWidth > 0 ? window.innerWidth : 800;
    const initH = window.innerHeight > 0 ? window.innerHeight : 600;

    // 1. Core WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(initW, initH);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x232a38, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);

    // 2. World Scene & Atmospheric Lighting
    this.worldScene = new THREE.Scene();
    this.worldScene.background = new THREE.Color(0x232a38);
    this.worldScene.fog = new THREE.Fog(0x232a38, 120, 350);

    // Hemisphere skylight (strong ambient fill)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x556677, 1.4);
    this.worldScene.add(hemiLight);

    // Sun Directional Light
    const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.6);
    dirLight.position.set(30, 45, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 160;
    dirLight.shadow.camera.left = -40;
    dirLight.shadow.camera.right = 40;
    dirLight.shadow.camera.top = 70;
    dirLight.shadow.camera.bottom = -70;
    dirLight.shadow.bias = -0.0005;
    this.worldScene.add(dirLight);

    // Overhead Lobby Spot/Point Lights
    const lobbyCenterLight = new THREE.PointLight(0x00ffff, 3.5, 45);
    lobbyCenterLight.position.set(0, 7, -100);
    this.worldScene.add(lobbyCenterLight);

    const targetRangeLight = new THREE.PointLight(0xffffff, 3.0, 40);
    targetRangeLight.position.set(0, 6, -118);
    this.worldScene.add(targetRangeLight);

    const shopLight = new THREE.PointLight(0xffaa00, 2.5, 30);
    shopLight.position.set(-16, 6, -85);
    this.worldScene.add(shopLight);

    const mapTermLight = new THREE.PointLight(0x00d2ff, 2.5, 30);
    mapTermLight.position.set(16, 6, -85);
    this.worldScene.add(mapTermLight);

    // 3. Subsystems
    this.audio = new AudioSystem();
    this.particles = new ParticleSystem(this.worldScene);
    this.map = new MapGenerator(this.worldScene);
    this.map.buildMap();

    // 4. Dual Camera Manager
    this.cameraManager = new CameraManager(this.renderer, initW / initH);

    // 5. FPS Controls
    this.controls = new FPSControls(
      this.cameraManager.worldCamera,
      this.renderer.domElement,
      this.map
    );
    this.worldScene.add(this.controls.yawObject);

    // 6. Weapon System (Sniper & Knife Viewmodels)
    this.weaponSystem = new WeaponSystem(
      this.cameraManager.vmScene,
      this.audio,
      this.particles
    );

    // 7. Bot Opponent
    this.bot = new BotAI(
      this.worldScene,
      this.map,
      this.audio,
      this.particles
    );

    // 8. Economy & Case Unboxing System
    this.caseSystem = new CaseSystem(this.audio, this.weaponSystem);

    // 9. Match Engine (First to 6 Wins)
    this.matchManager = new MatchManager(
      this.controls,
      this.bot,
      this.map,
      this.audio,
      this.particles,
      this.caseSystem
    );

    // 10. Real-time Multiplayer Client
    this.mpClient = new MultiplayerClient(this);
    this.matchManager.setMultiplayerClient(this.mpClient);
    this.matchManager.setWeaponSystem(this.weaponSystem);

    // Wire input events & combat
    this.setupEvents();

    // Clock
    this.clock = new THREE.Clock();

    // Start render loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupEvents() {
    // Resume audio context and start game on play button or blocker click
    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.audio.ensureContext();
        this.controls.startGame();
      });
      playBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.audio.ensureContext();
        this.controls.startGame();
      });
    }

    const blocker = document.getElementById('blocker');
    if (blocker) {
      blocker.addEventListener('click', () => {
        this.audio.ensureContext();
        this.controls.startGame();
      });
    }

    window.addEventListener('click', () => {
      this.audio.ensureContext();
    });

    // Window Resize
    window.addEventListener('resize', () => {
      this.cameraManager.onResize(window.innerWidth, window.innerHeight);
    });

    // Weapon Switching hotkeys (1, 2, Q)
    this.controls.onSlotSwitch = (slot) => {
      this.weaponSystem.equipSlot(slot);
      this.updateHUDWeapon();
    };

    this.controls.onQuickSwitch = () => {
      this.weaponSystem.quickSwitch();
      this.updateHUDWeapon();
    };

    // Return to Lobby (L)
    this.controls.onReturnLobby = () => {
      this.matchManager.returnToLobby();
    };

    // Inspect (F)
    this.controls.onInspect = () => {
      this.weaponSystem.inspect();
    };

    // Reload (R)
    this.controls.onReload = () => {
      this.weaponSystem.reload();
      this.updateHUDWeapon();
    };

    // ADS (Right Click)
    this.controls.onADS = (aiming) => {
      this.weaponSystem.setADS(aiming);
    };

    // Mouse Sway
    this.controls.onMouseMove = (dx, dy) => {
      this.weaponSystem.addSway(dx, dy);
    };

    // Slide callback
    this.controls.onSlide = () => {
      this.audio.playSlide();
    };

    // Map changed callback
    this.map.onMapChanged = (name, waypoints) => {
      this.bot.setWaypoints(waypoints);
    };

    // Interact (E)
    this.controls.onInteract = () => {
      const pPos = this.controls.getPosition();
      const shopPos = new THREE.Vector3(-16, 0.5, -85);
      const mapPos = new THREE.Vector3(16, 0.5, -85);

      if (pPos.distanceTo(shopPos) < 6.0) {
        document.exitPointerLock();
        this.caseSystem.openShopModal();
      } else if (pPos.distanceTo(mapPos) < 6.0) {
        document.exitPointerLock();
        this.openMapModal();
      }
    };

    // Shoot (Left Click)
    this.controls.onShoot = () => {
      this.handleShoot();
    };

    // Helper to bind both click & touchend for mobile reliability
    const bindAction = (el, handler) => {
      if (!el) return;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        handler(e);
      });
      el.addEventListener('touchend', (e) => {
        e.stopPropagation();
        e.preventDefault();
        handler(e);
      });
    };

    // UI Buttons (Shop, Maps, Settings)
    const shopBtn = document.getElementById('shop-open-btn');
    bindAction(shopBtn, () => {
      try { document.exitPointerLock(); } catch (err) {}
      this.caseSystem.openShopModal();
    });

    const shopCloseBtn = document.getElementById('shop-close-btn');
    bindAction(shopCloseBtn, () => {
      this.caseSystem.closeShopModal();
    });

    const mapBtn = document.getElementById('map-open-btn');
    bindAction(mapBtn, () => {
      try { document.exitPointerLock(); } catch (err) {}
      this.openMapModal();
    });

    const mapCloseBtn = document.getElementById('map-close-btn');
    bindAction(mapCloseBtn, () => {
      this.closeMapModal();
    });

    // Mobile Virtual Controls Toggle
    const mobToggleBtn = document.getElementById('mobile-toggle-btn');
    bindAction(mobToggleBtn, () => {
      const mob = document.getElementById('mobile-controls');
      if (mob) {
        mob.style.display = (mob.style.display === 'block') ? 'none' : 'block';
      }
    });

    // Map Cards click & touch
    const mapCards = document.querySelectorAll('.map-card');
    mapCards.forEach(card => {
      bindAction(card, () => {
        const mapName = card.getAttribute('data-map');
        mapCards.forEach(c => {
          c.classList.remove('selected');
          const b = c.querySelector('.map-select-btn');
          if (b) b.textContent = 'SELECT MAP';
        });
        card.classList.add('selected');
        const activeB = card.querySelector('.map-select-btn');
        if (activeB) activeB.textContent = 'SELECTED';
        this.map.loadArena(mapName);
      });
    });

    // Settings Modal
    const settingsBtn = document.getElementById('settings-open-btn');
    bindAction(settingsBtn, () => {
      try { document.exitPointerLock(); } catch (err) {}
      this.openSettingsModal();
    });

    const settingsCloseBtn = document.getElementById('settings-close-btn');
    bindAction(settingsCloseBtn, () => {
      this.closeSettingsModal();
    });

    // Settings inputs
    const sensSlider = document.getElementById('sens-slider');
    const sensVal = document.getElementById('sens-val');
    if (sensSlider && sensVal) {
      sensSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.controls.mouseSensitivity = val;
        sensVal.textContent = (val * 1000).toFixed(1);
      });
    }

    const fovSlider = document.getElementById('fov-slider');
    const fovVal = document.getElementById('fov-val');
    if (fovSlider && fovVal) {
      fovSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        this.cameraManager.baseFov = val;
        this.cameraManager.worldCamera.fov = val;
        this.cameraManager.worldCamera.updateProjectionMatrix();
        fovVal.textContent = `${val}°`;
      });
    }

    const bgmBtn = document.getElementById('bgm-toggle-btn');
    if (bgmBtn) {
      bgmBtn.addEventListener('click', () => {
        if (this.audio.isBgmPlaying) {
          this.audio.stopLobbyMusic();
          bgmBtn.textContent = 'MUSIC: OFF';
          bgmBtn.style.background = '#e74c3c';
        } else {
          this.audio.startLobbyMusic();
          bgmBtn.textContent = 'MUSIC: ON';
          bgmBtn.style.background = '#2ecc71';
        }
      });
    }

    const crosshairColorSelect = document.getElementById('crosshair-color-select');
    if (crosshairColorSelect) {
      crosshairColorSelect.addEventListener('change', (e) => {
        const color = e.target.value;
        const lines = document.querySelectorAll('.crosshair-line');
        const dot = document.querySelector('.crosshair-dot');
        lines.forEach(l => l.style.backgroundColor = color);
        if (dot) dot.style.backgroundColor = color;
      });
    }
  }

  openMapModal() {
    const modal = document.getElementById('map-modal');
    if (modal) modal.style.display = 'flex';
  }

  closeMapModal() {
    const modal = document.getElementById('map-modal');
    if (modal) modal.style.display = 'none';
  }

  openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'flex';
  }

  closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
  }

  handleShoot() {
    if (this.caseSystem.isUnboxing) return;
    // Lock shooting outside of active gameplay (cannot shoot during intermission, warmup, or victory)
    if (this.matchManager.state !== 'LOBBY' && this.matchManager.state !== 'ROUND_ACTIVE') {
      return;
    }

    const shootResult = this.weaponSystem.shoot();
    if (!shootResult.fired) return;

    this.updateHUDWeapon();

    // Knife Attack
    if (shootResult.type === 'KNIFE') {
      this.handleKnifeSlash();
      return;
    }

    // Sniper Bullet Raycast
    const shootRay = this.controls.getShootRay();
    let rayDir = shootRay.direction.clone();

    // Apply hipfire spread (if moving / not in ADS)
    if (shootResult.spread > 0) {
      const spreadX = (Math.random() - 0.5) * shootResult.spread;
      const spreadY = (Math.random() - 0.5) * shootResult.spread;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cameraManager.worldCamera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.cameraManager.worldCamera.quaternion);
      rayDir.addScaledVector(right, spreadX).addScaledVector(up, spreadY).normalize();
    }

    const raycaster = new THREE.Raycaster(shootRay.origin, rayDir, 0.1, 400);

    // Broadcast fire event in multiplayer
    this.mpClient.sendFireWeapon(shootRay.origin, rayDir, shootResult.spread, shootResult.isAiming, shootResult.type);

    // Muzzle position for tracer beam
    const muzzlePos = shootRay.origin.clone().add(rayDir.clone().multiplyScalar(0.8));

    // Objects to test: Bot limbs, Remote players, Target Dummies, and Map Obstacles
    const candidates = [];

    // Bot hitboxes
    if (this.bot.isAlive && this.bot.mesh.visible) {
      candidates.push(this.bot.head, this.bot.torso, this.bot.leftArm, this.bot.rightArm, this.bot.leftLeg, this.bot.rightLeg);
    }

    // Remote human player hitboxes
    if (this.mpClient && this.mpClient.remotePlayers) {
      for (const rp of this.mpClient.remotePlayers.values()) {
        if (rp.group && rp.group.visible) {
          candidates.push(rp.head, rp.torso, rp.leftArm, rp.rightArm, rp.leftLeg, rp.rightLeg);
        }
      }
    }

    // Target Dummies in shooting range
    this.map.targetDummies.forEach(d => {
      if (!d.userData.isKnockedDown) {
        candidates.push(d.userData.headMesh, d.userData.torsoMesh);
      }
    });

    // Map colliders
    this.map.colliders.forEach(c => candidates.push(c.mesh));

    const intersects = raycaster.intersectObjects(candidates, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const hitPoint = hit.point;
      const hitObj = hit.object;

      // 1. Tracer Beam from weapon to impact point
      this.particles.addTracer(muzzlePos, hitPoint);

      // 2. Check if Remote Human Player Hit (Cannot attack in lobby)
      if (hitObj.userData && hitObj.userData.isRemotePlayer) {
        if (this.matchManager.state === 'ROUND_ACTIVE') {
          const isHeadshot = hitObj.userData.isHeadshot === true;
          const damage = isHeadshot ? 150 : 92;
          this.particles.addImpact(hitPoint, hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0), 0xff3300, 14);
          this.mpClient.sendInflictDamage(hitObj.userData.playerId, damage, isHeadshot);
        }
        return;
      }

      // 3. Check if Bot Hit (Cannot attack in lobby)
      if (hitObj.userData && hitObj.userData.isBot) {
        if (this.matchManager.state === 'ROUND_ACTIVE') {
          const isHeadshot = hitObj.userData.isHeadshot === true;
          const damage = isHeadshot ? 150 : 92; // Instakill headshots!
          this.particles.addImpact(hitPoint, hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0), 0xff3300, 14);
          this.matchManager.onBotDamaged(damage, isHeadshot);
        }
        return;
      }

      // 4. Check if Target Dummy Hit (Lobby Range)
      const targetDummy = this.map.targetDummies.find(d =>
        d.userData.headMesh === hitObj || d.userData.torsoMesh === hitObj
      );
      if (targetDummy) {
        const isHeadshot = (hitObj === targetDummy.userData.headMesh);
        const damage = isHeadshot ? 150 : 85;
        this.audio.playHitmarker(isHeadshot);
        this.matchManager.showHitmarker(isHeadshot);
        this.matchManager.showDamageNumber(damage, isHeadshot);
        this.map.hitTarget(targetDummy, isHeadshot);
        this.particles.addImpact(hitPoint, hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0), 0xffcc00, 10);
        return;
      }

      // 5. Wall Impact (sparks & dust)
      if (hit.face) {
        this.particles.addImpact(hitPoint, hit.face.normal, 0xffbb44, 8);
      }
    } else {
      // Bullet shot into the sky
      const farPoint = shootRay.origin.clone().add(rayDir.multiplyScalar(200));
      this.particles.addTracer(muzzlePos, farPoint);
    }
  }

  handleKnifeSlash() {
    if (this.matchManager.state !== 'LOBBY' && this.matchManager.state !== 'ROUND_ACTIVE') {
      return;
    }

    const shootRay = this.controls.getShootRay();
    const raycaster = new THREE.Raycaster(shootRay.origin, shootRay.direction, 0.1, 2.8);

    const candidates = [];
    if (this.bot.isAlive && this.bot.mesh.visible) {
      candidates.push(this.bot.head, this.bot.torso);
    }
    if (this.mpClient && this.mpClient.remotePlayers) {
      for (const rp of this.mpClient.remotePlayers.values()) {
        if (rp.group && rp.group.visible) {
          candidates.push(rp.head, rp.torso);
        }
      }
    }

    const intersects = raycaster.intersectObjects(candidates, false);
    if (intersects.length > 0) {
      const hit = intersects[0];
      // Cannot attack someone in lobby
      if (this.matchManager.state === 'ROUND_ACTIVE') {
        const isHeadshot = hit.object.userData.isHeadshot === true;
        const damage = isHeadshot ? 120 : 65;
        if (hit.object.userData.isRemotePlayer) {
          this.mpClient.sendInflictDamage(hit.object.userData.playerId, damage, isHeadshot);
        } else {
          this.matchManager.onBotDamaged(damage, isHeadshot);
        }
        this.particles.addImpact(hit.point, new THREE.Vector3(0, 1, 0), 0xff0044, 12);
      }
    }
  }

  updateHUDWeapon() {
    const ammoCount = document.getElementById('ammo-count');
    const scopeAmmo = document.getElementById('scope-ammo-val');
    const slotName = document.getElementById('weapon-name');
    const boltNotice = document.getElementById('bolt-status');

    if (ammoCount) {
      if (this.weaponSystem.currentSlot === 'SNIPER') {
        ammoCount.textContent = `${this.weaponSystem.ammo} / ${this.weaponSystem.maxAmmo}`;
      } else {
        ammoCount.textContent = '∞';
      }
    }

    if (scopeAmmo) {
      scopeAmmo.textContent = `${this.weaponSystem.ammo} / ${this.weaponSystem.maxAmmo}`;
    }

    if (slotName) {
      slotName.textContent = this.weaponSystem.currentSlot === 'SNIPER' ? 'AWP BOLT-ACTION' : 'TACTICAL KNIFE';
    }

    if (boltNotice) {
      if (this.weaponSystem.isBolting) {
        boltNotice.style.display = 'block';
        boltNotice.textContent = 'CYCLING BOLT...';
      } else if (this.weaponSystem.isReloading) {
        boltNotice.style.display = 'block';
        boltNotice.textContent = 'RELOADING...';
      } else {
        boltNotice.style.display = 'none';
      }
    }

    // Dynamic Crosshair Spread
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
      if (this.weaponSystem.adsProgress > 0.7) {
        crosshair.style.opacity = '0'; // Hide crosshair in ADS (scope overlay takes over)
      } else {
        crosshair.style.opacity = '1';
        const spreadPx = 14 + (this.weaponSystem.getSpread(true) * 120);
        crosshair.style.setProperty('--spread', `${spreadPx}px`);
      }
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    // 1. Update FPS Movement Physics & Speed modifier
    const speedMod = this.weaponSystem.getSpeedModifier();
    const moveInfo = this.controls.update(delta, speedMod);

    // 2. Update Weapon Viewmodel (sway, bobbing, ADS, bolt action)
    const isMoving = moveInfo ? moveInfo.isMoving : false;
    const isSprinting = moveInfo ? moveInfo.isSprinting : false;
    const velLen = moveInfo ? moveInfo.velocityLength : 0;
    this.weaponSystem.update(delta, isMoving, isSprinting, velLen);

    // 3. Update Camera Zoom for ADS
    this.cameraManager.updateADS(this.weaponSystem.adsProgress, delta);

    // 4. Update Particle Effects (tracers, sparks, ejected shells, confetti)
    this.particles.update(delta);

    // 5. Update Map (pulsing duel pads, floating shop crate, resetting target dummies)
    this.map.update(delta, elapsedTime);

    // 6. Update Match State Machine ("First to 6 Wins", Duel Pads, Bot AI)
    this.matchManager.update(delta);

    // 7. Update HUD dynamic indicators
    this.updateHUDWeapon();

    // 8. Dual-Pass Render (World Scene + No-Clip Viewmodel)
    this.cameraManager.render(this.worldScene, this.weaponSystem.vmScene);
  }
}

// Start Game on Page Load with readyState check
function initGame() {
  if (window.__gameEngineInstance) return;
  try {
    window.__gameEngineInstance = new GameEngine();
  } catch (err) {
    console.error('Failed to initialize GameEngine:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
