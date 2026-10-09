// Controls.js - Desktop PointerLock + Touch Virtual Joystick & Drag Engine
import * as THREE from '../vendor/three/three.module.js';

export class FPSControls {
  constructor(camera, domElement, mapGenerator) {
    this.camera = camera;
    this.domElement = domElement;
    this.map = mapGenerator;

    this.isLocked = false;
    this.isGameActive = true; // Always active so player is never frozen
    this.enabled = true;
    this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // Camera pitch & yaw
    this.yawObject = new THREE.Group();
    this.yawObject.position.set(0, 0.5, -84); // Start in Lobby behind duel pads
    this.pitchObject = new THREE.Group();
    this.pitchObject.position.y = 1.75;
    this.yawObject.add(this.pitchObject);
    this.pitchObject.add(this.camera);

    this.pitch = 0;
    this.yaw = 0;
    this.mouseSensitivity = 0.0022;

    // Movement Physics
    this.velocity = new THREE.Vector3();
    this.moveInput = { forward: false, backward: false, left: false, right: false };
    this.joystickVector = { x: 0, y: 0 };
    this.isSprinting = false;
    this.isCrouching = false;
    this.canJump = false;

    // Death camera & Winner spectator pan
    this.isDead = false;
    this.deathTimer = 0;
    this.winnerTargetPos = null;

    // Slide Mechanics
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideDuration = 0.72;
    this.slideDir = new THREE.Vector3();
    this.normalEyeHeight = 1.75;
    this.slideEyeHeight = 0.95;
    this.currentEyeHeight = 1.75;

    this.baseSpeed = 9.0;
    this.sprintMultiplier = 1.35;
    this.crouchMultiplier = 0.6;
    this.jumpForce = 7.5;
    this.gravity = 24.0;
    this.friction = 12.0;

    // Player Collision Bounding Box (AABB)
    this.playerRadius = 0.45;
    this.playerHeight = 1.8;
    this.playerBox = new THREE.Box3();

    // Unified Pointer & Drag tracking for First-Person Look
    this.isDragging = false;
    this.dragPointerId = null;
    this.dragPointerType = null;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.dragDistance = 0;
    this.dragButton = 0;

    // Touch Joystick tracking
    this.joystickTouchId = null;
    this.joystickCenter = { x: 0, y: 0 };
    this.isTouchADS = false;

    // Callbacks
    this.onShoot = null;
    this.onADS = null;
    this.onInspect = null;
    this.onReload = null;
    this.onSlotSwitch = null;
    this.onQuickSwitch = null;
    this.onInteract = null;
    this.onMouseMove = null;
    this.onSlide = null;
    this.onReturnLobby = null;

    this.initEvents();
    this.initMobileControls();
  }

  requestPointerLock() {
    if (!this.domElement) return;
    try {
      const p = this.domElement.requestPointerLock ? this.domElement.requestPointerLock() : null;
      if (p && p.catch) p.catch(() => {});
    } catch (err) {}
  }

  // Starts the game: hides blocker and engages controls
  startGame() {
    this.isGameActive = true;
    const blocker = document.getElementById('blocker');
    if (blocker) blocker.style.display = 'none';

    // Show mobile controls if on touch device OR small viewport OR coarse pointer
    const isMobile = ('ontouchstart' in window) ||
                     (navigator.maxTouchPoints > 0) ||
                     (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
                     (window.innerWidth <= 1024);
    const mobControls = document.getElementById('mobile-controls');
    if (mobControls) {
      mobControls.style.display = isMobile ? 'block' : 'none';
    }

    // Immediately request pointer lock for standard FPS mouse look
    this.requestPointerLock();
  }

  initEvents() {
    // Start button & blocker click
    const playBtn = document.getElementById('play-btn');
    const blocker = document.getElementById('blocker');

    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startGame();
      });
      playBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.startGame();
      });
    }

    if (blocker) {
      blocker.addEventListener('click', () => {
        this.startGame();
      });
    }

    // Auto-reveal touch controls on any touchscreen touch
    window.addEventListener('touchstart', () => {
      const mobControls = document.getElementById('mobile-controls');
      if (mobControls && mobControls.style.display !== 'block') {
        mobControls.style.display = 'block';
      }
    }, { passive: true });

    // Pointer lock state listener
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = (document.pointerLockElement === this.domElement);
    });

    // Re-lock mouse on canvas/screen click when game is active
    window.addEventListener('click', (e) => {
      if (this.isGameActive && !this.isLocked) {
        if (!e.target.closest('#shop-modal, #map-modal, #settings-modal, .shop-window, #blocker, #map-vote-overlay, .vote-modal, #roulette-overlay, #reward-modal, .currency-bar')) {
          this.requestPointerLock();
        }
      }
    });

    // --- MOUSE MOVE (Pointer Lock mode) ---
    document.addEventListener('mousemove', (e) => {
      if (!this.isGameActive || !this.enabled) return;

      if (this.isLocked) {
        const dx = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
        const dy = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
        this.applyLookDelta(dx, dy, this.mouseSensitivity);
      }
    });

    // --- UNIFIED POINTER EVENTS (Drag to look on desktop without pointerlock, touchscreens & mobile) ---
    window.addEventListener('pointerdown', (e) => {
      if (!this.isGameActive || !this.enabled) return;

      // Ignore if clicking inside interactive menus, modals, cards or HUD buttons
      if (e.target && e.target.closest && e.target.closest(
        '#shop-modal, #map-modal, #settings-modal, #blocker, .shop-window, ' +
        '#map-vote-overlay, .vote-modal, .vote-card, ' +
        '#roulette-overlay, #reward-modal, .currency-bar, .hud-btn, ' +
        '#joystick-zone, #mobile-action-buttons, .mob-btn, ' +
        'button, input, select, a, .case-card, .inventory-item, .map-card'
      )) {
        return;
      }

      // Attempt pointer lock on primary mouse click if not locked yet
      if (e.pointerType === 'mouse' && !this.isLocked && e.button === 0) {
        this.requestPointerLock();
      }

      // Right click with mouse -> Aim Down Sights (ADS)
      if (e.button === 2 && this.onADS) {
        this.onADS(true);
      }

      this.isDragging = true;
      this.dragPointerId = e.pointerId;
      this.dragPointerType = e.pointerType;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.dragDistance = 0;
      this.dragButton = e.button;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isGameActive || !this.enabled) return;

      // If pointer locked, mousemove handles it directly with movementX/Y
      if (this.isLocked && e.pointerType === 'mouse') {
        return;
      }

      // If dragging with mouse or touch/pen on screen
      if (this.isDragging && (this.dragPointerId === e.pointerId || e.pointerType === 'mouse')) {
        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.dragDistance += Math.hypot(dx, dy);

        const sens = (e.pointerType === 'touch') ? this.mouseSensitivity * 1.5 : this.mouseSensitivity;
        this.applyLookDelta(dx, dy, sens);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.isDragging && (this.dragPointerId === e.pointerId || e.pointerType === 'mouse')) {
        this.isDragging = false;
        this.dragPointerId = null;

        // Disengage ADS on right click release
        if (e.button === 2 && this.onADS) {
          this.onADS(false);
        }

        // Left click with minimal drag (< 6px) triggers weapon shoot
        if (this.dragButton === 0 && this.dragDistance < 6 && this.onShoot) {
          this.onShoot();
        }
      }
    });

    window.addEventListener('pointercancel', (e) => {
      if (this.dragPointerId === e.pointerId) {
        this.isDragging = false;
        this.dragPointerId = null;
      }
    });

    // When pointer lock is active, handle direct mousedown/up for shooting and scoping
    window.addEventListener('mousedown', (e) => {
      if (!this.isGameActive || !this.isLocked) return;
      if (e.button === 0 && this.onShoot) {
        this.onShoot();
      } else if (e.button === 2 && this.onADS) {
        this.onADS(true);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.isGameActive || !this.isLocked) return;
      if (e.button === 2 && this.onADS) {
        this.onADS(false);
      }
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse Wheel Weapon Swap
    window.addEventListener('wheel', (e) => {
      if (!this.isGameActive) return;
      if (this.onSlotSwitch) {
        if (e.deltaY < 0) {
          this.onSlotSwitch('SNIPER');
        } else if (e.deltaY > 0) {
          this.onSlotSwitch('KNIFE');
        }
      }
    }, { passive: true });

    // Click on weapon card to swap
    const weaponCard = document.querySelector('.weapon-card');
    if (weaponCard) {
      weaponCard.style.cursor = 'pointer';
      weaponCard.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onQuickSwitch) this.onQuickSwitch();
      });
    }

    // --- KEYBOARD INPUT ---
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  applyLookDelta(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;

    // Clamp pitch to avoid screen flipping (-89 deg to +89 deg)
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

    this.yawObject.rotation.y = this.yaw;
    this.pitchObject.rotation.x = this.pitch;

    if (this.onMouseMove) {
      this.onMouseMove(dx, dy);
    }
  }

  // --- MOBILE VIRTUAL JOYSTICK & TOUCH BUTTONS ---
  initMobileControls() {
    const joyZone = document.getElementById('joystick-zone');
    const joyKnob = document.getElementById('joystick-knob');
    if (!joyZone || !joyKnob) return;

    const maxRadius = 45;

    const handleJoyStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.targetTouches[0];
      this.joystickTouchId = touch.identifier;

      const rect = joyZone.getBoundingClientRect();
      this.joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      updateJoy(touch.clientX, touch.clientY);
    };

    const handleJoyMove = (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === this.joystickTouchId) {
          updateJoy(e.touches[i].clientX, e.touches[i].clientY);
          break;
        }
      }
    };

    const handleJoyEnd = (e) => {
      e.preventDefault();
      this.joystickTouchId = null;
      this.joystickVector = { x: 0, y: 0 };
      joyKnob.style.transform = `translate(0px, 0px)`;
    };

    const updateJoy = (clientX, clientY) => {
      let dx = clientX - this.joystickCenter.x;
      let dy = clientY - this.joystickCenter.y;
      const dist = Math.hypot(dx, dy);

      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }

      joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;

      // Normalized vector -1 to 1
      this.joystickVector.x = dx / maxRadius;
      this.joystickVector.y = dy / maxRadius;
    };

    joyZone.addEventListener('touchstart', handleJoyStart, { passive: false });
    joyZone.addEventListener('touchmove', handleJoyMove, { passive: false });
    joyZone.addEventListener('touchend', handleJoyEnd, { passive: false });
    joyZone.addEventListener('touchcancel', handleJoyEnd, { passive: false });

    // Touch Action Buttons (supports touch & mouse click)
    const bindTouchBtn = (id, onAction) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onAction();
      }, { passive: false });
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onAction();
      });
    };

    // Fire Button
    bindTouchBtn('m-btn-fire', () => {
      if (this.onShoot) this.onShoot();
    });

    // ADS Toggle Button
    bindTouchBtn('m-btn-ads', () => {
      this.isTouchADS = !this.isTouchADS;
      const btn = document.getElementById('m-btn-ads');
      if (btn) btn.classList.toggle('active', this.isTouchADS);
      if (this.onADS) this.onADS(this.isTouchADS);
    });

    // Jump Button
    bindTouchBtn('m-btn-jump', () => {
      if (this.canJump) {
        this.velocity.y = this.jumpForce;
        this.canJump = false;
      }
    });

    // Slide Button
    bindTouchBtn('m-btn-slide', () => {
      this.trySlide();
    });

    // Reload Button
    bindTouchBtn('m-btn-reload', () => {
      if (this.onReload) this.onReload();
    });

    // Weapon Swap Button
    bindTouchBtn('m-btn-switch', () => {
      if (this.onQuickSwitch) this.onQuickSwitch();
    });
  }

  onKeyDown(e) {
    if (!this.isGameActive) return;

    const key = (e.key || '').toLowerCase();

    // Slot switching (checks both key and code for international layout support)
    if (e.key === '1' || e.code === 'Digit1' || e.code === 'Numpad1') {
      if (this.onSlotSwitch) this.onSlotSwitch('SNIPER');
      return;
    }
    if (e.key === '2' || e.code === 'Digit2' || e.code === 'Numpad2') {
      if (this.onSlotSwitch) this.onSlotSwitch('KNIFE');
      return;
    }
    if (e.key === 'q' || key === 'q' || e.code === 'KeyQ') {
      if (this.onQuickSwitch) this.onQuickSwitch();
      return;
    }

    if (e.code === 'KeyW' || e.code === 'ArrowUp' || key === 'w' || key === 'arrowup') {
      this.moveInput.forward = true;
    }
    if (e.code === 'KeyS' || e.code === 'ArrowDown' || key === 's' || key === 'arrowdown') {
      this.moveInput.backward = true;
    }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft' || key === 'a' || key === 'arrowleft') {
      this.moveInput.left = true;
    }
    if (e.code === 'KeyD' || e.code === 'ArrowRight' || key === 'd' || key === 'arrowright') {
      this.moveInput.right = true;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || key === 'shift') {
      this.isSprinting = true;
    }
    if (e.code === 'Space' || key === ' ') {
      if (this.canJump) {
        this.velocity.y = this.jumpForce;
        this.canJump = false;
      }
    }
    if (e.code === 'KeyR' || key === 'r') {
      if (this.onReload) this.onReload();
    }
    if (e.code === 'KeyF' || key === 'f') {
      if (this.onInspect) this.onInspect();
    }
    if (e.code === 'KeyE' || key === 'e') {
      if (this.onInteract) this.onInteract();
    }
    if (e.code === 'KeyC' || key === 'c' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
      this.trySlide();
    }
    if (e.code === 'KeyL' || key === 'l') {
      if (this.onReturnLobby) this.onReturnLobby();
    }
  }

  trySlide() {
    const isMovingForward = this.moveInput.forward || (this.joystickVector.y < -0.3);
    if (this.canJump && !this.isSliding && isMovingForward) {
      this.isSliding = true;
      this.slideTimer = this.slideDuration;

      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.slideDir.copy(forward);

      const boostSpeed = this.baseSpeed * this.sprintMultiplier * 1.32;
      this.velocity.x = this.slideDir.x * boostSpeed;
      this.velocity.z = this.slideDir.z * boostSpeed;

      if (this.onSlide) this.onSlide();
    }
  }

  onKeyUp(e) {
    if (!this.isGameActive) return;

    const key = (e.key || '').toLowerCase();

    if (e.code === 'KeyW' || e.code === 'ArrowUp' || key === 'w' || key === 'arrowup') {
      this.moveInput.forward = false;
    }
    if (e.code === 'KeyS' || e.code === 'ArrowDown' || key === 's' || key === 'arrowdown') {
      this.moveInput.backward = false;
    }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft' || key === 'a' || key === 'arrowleft') {
      this.moveInput.left = false;
    }
    if (e.code === 'KeyD' || e.code === 'ArrowRight' || key === 'd' || key === 'arrowright') {
      this.moveInput.right = false;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || key === 'shift') {
      this.isSprinting = false;
    }
  }

  teleport(pos, lookAtTarget = null) {
    this.yawObject.position.copy(pos);
    this.velocity.set(0, 0, 0);

    if (lookAtTarget) {
      const dir = lookAtTarget.clone().sub(pos);
      this.yaw = Math.atan2(-dir.x, -dir.z);
      this.pitch = 0;
      this.yawObject.rotation.y = this.yaw;
      this.pitchObject.rotation.x = this.pitch;
    }
  }

  triggerDeath(winnerPos = null) {
    this.isDead = true;
    this.deathTimer = 0;
    this.winnerTargetPos = winnerPos ? winnerPos.clone() : null;
    this.velocity.set(0, 0, 0);
  }

  resetFromDeath() {
    this.isDead = false;
    this.deathTimer = 0;
    this.winnerTargetPos = null;
    this.currentEyeHeight = this.normalEyeHeight;
    this.pitchObject.position.y = this.normalEyeHeight;
    this.pitchObject.rotation.z = 0;
  }

  get position() {
    return this.yawObject.position;
  }

  getPosition() {
    return this.yawObject.position;
  }

  updateCameraRotation() {
    this.yawObject.rotation.y = this.yaw;
    this.pitchObject.rotation.x = this.pitch;
  }

  getShootRay() {
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    return { origin, direction: forward.normalize() };
  }

  update(delta, speedModifier = 1.0) {
    if (!this.enabled || !this.isGameActive) {
      return { isMoving: false, isSprinting: false, velocityLength: 0 };
    }

    // Death camera: fall to ground & smoothly pan toward winner
    if (this.isDead) {
      this.deathTimer += delta;
      const fallP = Math.min(1.0, this.deathTimer / 0.4);
      this.currentEyeHeight = THREE.MathUtils.lerp(this.normalEyeHeight, 0.35, fallP);
      this.pitchObject.position.y = this.currentEyeHeight;
      this.pitchObject.rotation.z = THREE.MathUtils.lerp(0, -Math.PI / 4, fallP);

      // Smoothly pan camera directly toward the winner
      if (this.winnerTargetPos && this.deathTimer > 0.1) {
        const toWinner = this.winnerTargetPos.clone().sub(this.yawObject.position);
        const targetYaw = Math.atan2(-toWinner.x, -toWinner.z);
        const dist2D = Math.hypot(toWinner.x, toWinner.z);
        const targetPitch = Math.atan2(toWinner.y - 0.35, Math.max(0.1, dist2D));

        // Shortest arc interpolation for yaw
        let diffYaw = (targetYaw - this.yaw) % (Math.PI * 2);
        if (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
        if (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
        this.yaw += diffYaw * Math.min(1.0, delta * 4.5);

        this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, Math.min(1.0, delta * 4.5));
        this.updateCameraRotation();
      }
      return { isMoving: false, isSprinting: false, velocityLength: 0 };
    }

    // 0. Update Slide State & Smooth Camera Eye Height
    if (this.isSliding) {
      this.slideTimer -= delta;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
      }
    }
    const targetHeight = this.isSliding ? this.slideEyeHeight : this.normalEyeHeight;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetHeight, 14.0, delta);
    this.pitchObject.position.y = this.currentEyeHeight;

    const targetRoll = this.isSliding ? -0.05 : 0.0;
    this.pitchObject.rotation.z = THREE.MathUtils.damp(this.pitchObject.rotation.z, targetRoll, 10.0, delta);

    // 1. Calculate desired movement direction from Keyboard OR Touch Joystick
    const moveDir = new THREE.Vector3();

    // Keyboard
    if (this.moveInput.forward) moveDir.z -= 1;
    if (this.moveInput.backward) moveDir.z += 1;
    if (this.moveInput.left) moveDir.x -= 1;
    if (this.moveInput.right) moveDir.x += 1;

    // Joystick input
    if (Math.abs(this.joystickVector.x) > 0.1 || Math.abs(this.joystickVector.y) > 0.1) {
      moveDir.x = this.joystickVector.x;
      moveDir.z = this.joystickVector.y;
    }

    if (moveDir.lengthSq() > 1.0) moveDir.normalize();

    // Rotate input to face player's yaw
    moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    // Speed calculation
    let currentSpeed = this.baseSpeed;
    if (this.isSprinting) currentSpeed *= this.sprintMultiplier;
    currentSpeed *= speedModifier;

    // Acceleration on ground
    if (!this.isSliding && moveDir.lengthSq() > 0) {
      this.velocity.x += moveDir.x * currentSpeed * 12.0 * delta;
      this.velocity.z += moveDir.z * currentSpeed * 12.0 * delta;
    }

    // Friction
    const effectiveFriction = this.isSliding ? this.friction * 0.35 : this.friction;
    this.velocity.x -= this.velocity.x * effectiveFriction * delta;
    this.velocity.z -= this.velocity.z * effectiveFriction * delta;

    // Gravity
    this.velocity.y -= this.gravity * delta;

    // 2. Perform Movement & Collision Resolution
    const pos = this.yawObject.position;
    const deltaX = this.velocity.x * delta;
    const deltaZ = this.velocity.z * delta;
    const deltaY = this.velocity.y * delta;

    pos.x += deltaX;
    this.updatePlayerBox();
    if (this.checkHorizontalCollision()) {
      pos.x -= deltaX;
      this.velocity.x = 0;
    }

    pos.z += deltaZ;
    this.updatePlayerBox();
    if (this.checkHorizontalCollision()) {
      pos.z -= deltaZ;
      this.velocity.z = 0;
    }

    pos.y += deltaY;
    this.updatePlayerBox();

    // Ground check against map colliders
    let grounded = false;
    for (const collider of this.map.colliders) {
      if (this.playerBox.intersectsBox(collider.box)) {
        if (this.velocity.y < 0) {
          pos.y = collider.box.max.y;
          this.velocity.y = 0;
          this.canJump = true;
          grounded = true;
          this.updatePlayerBox();
        } else if (this.velocity.y > 0) {
          pos.y = collider.box.min.y - this.playerHeight;
          this.velocity.y = 0;
        }
      }
    }

    if (pos.y < 0.5) {
      pos.y = 0.5;
      this.velocity.y = 0;
      this.canJump = true;
      grounded = true;
    }

    if (!grounded && Math.abs(this.velocity.y) > 0.5) {
      this.canJump = false;
    }

    return {
      isMoving: moveDir.lengthSq() > 0.01,
      isSprinting: this.isSprinting && moveDir.lengthSq() > 0.01,
      velocityLength: Math.hypot(this.velocity.x, this.velocity.z)
    };
  }

  updatePlayerBox() {
    const pos = this.yawObject.position;
    this.playerBox.min.set(pos.x - this.playerRadius, pos.y, pos.z - this.playerRadius);
    this.playerBox.max.set(pos.x + this.playerRadius, pos.y + this.playerHeight, pos.z + this.playerRadius);
  }

  // Only checks walls and obstacles above feet step-height, never the floor beneath the player
  checkHorizontalCollision() {
    const stepHeight = 0.4;
    const testBox = this.playerBox.clone();
    testBox.min.y += stepHeight;

    for (const collider of this.map.colliders) {
      if (collider.box.max.y <= this.yawObject.position.y + stepHeight) continue;

      if (testBox.intersectsBox(collider.box)) {
        return true;
      }
    }
    return false;
  }

  checkCollision() {
    for (const collider of this.map.colliders) {
      if (this.playerBox.intersectsBox(collider.box)) {
        return true;
      }
    }
    return false;
  }
}
