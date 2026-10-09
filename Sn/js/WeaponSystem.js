// WeaponSystem.js - Sniper & Knife Viewmodel, ADS, Bolt-Action, Recoil, Sway, Inspect
import * as THREE from '../vendor/three/three.module.js';
import { AssetLoader } from './AssetLoader.js';

export class WeaponSystem {
  constructor(viewModelScene, audioSystem, particleSystem) {
    this.vmScene = viewModelScene;
    this.audio = audioSystem;
    this.particles = particleSystem;

    // Viewmodel root group attached to camera
    this.vmRoot = new THREE.Group();
    this.vmScene.add(this.vmRoot);

    // Weapon state
    this.currentSlot = 'SNIPER'; // 'SNIPER' or 'KNIFE'
    this.lastSlot = 'KNIFE';
    this.isSwitching = false;
    this.switchProgress = 1.0;

    // Sniper Ammo & Cycle state
    this.maxAmmo = 5;
    this.ammo = 5;
    this.isBolting = false;
    this.boltTimer = 0;
    this.boltDuration = 1.1; // Total bolt-action delay
    this.isReloading = false;
    this.reloadTimer = 0;
    this.reloadDuration = 2.2;

    // ADS (Aim Down Sights)
    this.isAiming = false;
    this.adsProgress = 0.0;
    this.adsSpeed = 12.0;

    // Inspect Animation
    this.isInspecting = false;
    this.inspectTimer = 0;
    this.inspectDuration = 1.8;

    // Recoil Spring
    this.recoilPitch = 0;
    this.recoilOffsetZ = 0;
    this.recoilRecoverySpeed = 8.0;

    // Sway & Bobbing
    this.swayTarget = new THREE.Vector2(0, 0);
    this.swayCurrent = new THREE.Vector2(0, 0);
    this.bobTimer = 0;

    // Sights & Positions in Viewmodel space
    this.sniperRestPos = new THREE.Vector3(0.24, -0.22, -0.48);
    this.sniperRestRot = new THREE.Euler(0.04, -0.06, 0.02);
    this.sniperAimPos = new THREE.Vector3(0.0, -0.125, -0.25); // Aligns scope directly with camera eye
    this.sniperAimRot = new THREE.Euler(0, 0, 0);

    this.knifeRestPos = new THREE.Vector3(0.26, -0.24, -0.42);
    this.knifeRestRot = new THREE.Euler(0.2, 0.4, -0.3);

    // Build 3D Models
    this.buildWeapons();
    this.equipSlot('SNIPER', true);
  }

  buildWeapons() {
    // 1. Sniper Viewmodel
    this.sniperMesh = AssetLoader.createProceduralSniper();
    this.sniperMesh.position.copy(this.sniperRestPos);
    this.sniperMesh.rotation.copy(this.sniperRestRot);
    this.vmRoot.add(this.sniperMesh);

    // 2. Knife Viewmodel
    this.knifeMesh = AssetLoader.createProceduralKnife();
    this.knifeMesh.position.copy(this.knifeRestPos);
    this.knifeMesh.rotation.copy(this.knifeRestRot);
    this.knifeMesh.visible = false;
    this.vmRoot.add(this.knifeMesh);
  }

  // Equips weapon slot ('SNIPER' or 'KNIFE')
  equipSlot(slot, instant = false) {
    if (this.currentSlot === slot && !instant) return;
    if (this.isReloading) this.isReloading = false;
    if (this.isAiming) this.setADS(false);

    this.lastSlot = this.currentSlot;
    this.currentSlot = slot;
    this.isInspecting = false;

    if (slot === 'SNIPER') {
      this.sniperMesh.visible = true;
      this.knifeMesh.visible = false;
    } else {
      this.sniperMesh.visible = false;
      this.knifeMesh.visible = true;
      this.audio.playKnifeSlash();
    }
  }

  quickSwitch() {
    const nextSlot = this.currentSlot === 'SNIPER' ? 'KNIFE' : 'SNIPER';
    this.equipSlot(nextSlot);
  }

  // Inspect weapon (Key F)
  inspect() {
    if (this.isBolting || this.isReloading || this.isAiming) return;
    this.isInspecting = true;
    this.inspectTimer = 0;
    if (this.currentSlot === 'KNIFE') {
      this.audio.playKnifeInspect();
    }
  }

  setADS(aiming) {
    if (this.currentSlot !== 'SNIPER') return;
    this.isAiming = aiming;
  }

  // Reload weapon (Key R)
  reload() {
    if (this.currentSlot !== 'SNIPER') return;
    if (this.ammo >= this.maxAmmo || this.isReloading || this.isBolting) return;

    this.isReloading = true;
    this.reloadTimer = 0;
    this.setADS(false);
    this.audio.playReload();
  }

  // Attempt to fire weapon
  canShoot() {
    if (this.currentSlot === 'SNIPER') {
      return !this.isBolting && !this.isReloading && this.ammo > 0;
    } else {
      return !this.isSwitching;
    }
  }

  shoot() {
    if (this.currentSlot === 'KNIFE') {
      this.slashKnife();
      return { fired: true, type: 'KNIFE' };
    }

    // Sniper Shoot Logic
    if (this.ammo <= 0) {
      this.audio.playEmptyDryFire();
      this.reload();
      return { fired: false, type: 'EMPTY' };
    }

    if (this.isBolting || this.isReloading) {
      return { fired: false, type: 'BUSY' };
    }

    // Fire bullet!
    this.ammo--;
    this.audio.playSniperShot();

    // Trigger Bolt-action sequence
    this.isBolting = true;
    this.boltTimer = 0;
    this.audio.playBoltAction();

    // Recoil kickback
    this.recoilPitch = 0.16; // Camera pitch kick
    this.recoilOffsetZ = 0.12; // Weapon push back

    // Eject shell casing from chamber after 0.45s
    setTimeout(() => {
      if (this.sniperMesh && this.currentSlot === 'SNIPER') {
        const barrelPos = new THREE.Vector3();
        this.sniperMesh.getWorldPosition(barrelPos);
        const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(this.sniperMesh.quaternion);
        const upDir = new THREE.Vector3(0, 1, 0).applyQuaternion(this.sniperMesh.quaternion);
        this.particles.ejectShell(barrelPos, rightDir, upDir);
      }
    }, 450);

    return {
      fired: true,
      type: 'SNIPER',
      isAiming: this.isAiming,
      spread: this.getSpread()
    };
  }

  slashKnife() {
    this.audio.playKnifeSlash();
    this.isInspecting = true;
    this.inspectTimer = 0;
    this.inspectDuration = 0.5; // Quick slash swing
  }

  // Accuracy spread: 0 in ADS (laser accurate), wide spread in hipfire
  getSpread(isMoving = false) {
    if (this.isAiming && this.adsProgress > 0.85) {
      return 0.0; // Pinpoint accurate quick-scope/hard-scope
    }
    return isMoving ? 0.08 : 0.045; // No-scope spread
  }

  // Movement speed modifier (Knife gives +30% boost!)
  getSpeedModifier() {
    if (this.currentSlot === 'KNIFE') {
      return 1.32; // Iconic Roblox knife rush boost
    }
    if (this.isAiming) {
      return 0.55; // Slower walking while scoped in
    }
    return 1.0;
  }

  // Applies unlocked custom skin to sniper rifle
  applySniperSkin(skin) {
    if (!this.sniperMesh) return;
    const bodyMesh = this.sniperMesh.userData.bodyMesh;
    const stripeMesh = this.sniperMesh.userData.stripeMesh;

    if (bodyMesh) {
      bodyMesh.material.color.setHex(skin.primaryColor);
      bodyMesh.material.metalness = skin.metalness || 0.3;
      bodyMesh.material.roughness = skin.roughness || 0.4;
    }
    if (stripeMesh) {
      stripeMesh.material.color.setHex(skin.accentColor);
      if (skin.emissive) {
        stripeMesh.material.emissive.setHex(skin.accentColor);
        stripeMesh.material.emissiveIntensity = 0.4;
      } else {
        stripeMesh.material.emissive.setHex(0x000000);
      }
    }
  }

  // Applies unlocked custom skin to knife
  applyKnifeSkin(skin) {
    if (!this.knifeMesh) return;
    const bladeMesh = this.knifeMesh.userData.bladeMesh;
    if (bladeMesh) {
      bladeMesh.material.color.setHex(skin.bladeColor);
      bladeMesh.material.metalness = 0.95;
      bladeMesh.material.roughness = skin.roughness || 0.15;
    }
  }

  // Update mouse sway delta from input
  addSway(deltaX, deltaY) {
    this.swayTarget.x = THREE.MathUtils.clamp(-deltaX * 0.00035, -0.06, 0.06);
    this.swayTarget.y = THREE.MathUtils.clamp(-deltaY * 0.00035, -0.05, 0.05);
  }

  update(delta, isMoving, isSprinting, velocityLength) {
    // 1. Smooth ADS transition
    const targetAds = this.isAiming ? 1.0 : 0.0;
    this.adsProgress = THREE.MathUtils.damp(this.adsProgress, targetAds, this.adsSpeed, delta);

    // 2. Smooth Sway
    this.swayCurrent.lerp(this.swayTarget, 10.0 * delta);
    this.swayTarget.lerp(new THREE.Vector2(0, 0), 6.0 * delta);

    // 3. Procedural Walking Bobbing
    if (isMoving && velocityLength > 0.1) {
      const bobFreq = isSprinting ? 14.0 : 9.5;
      this.bobTimer += delta * bobFreq;
    } else {
      this.bobTimer += delta * 1.5; // Idle breathing
    }

    const bobAmountX = (isMoving ? 0.015 : 0.003) * (1.0 - this.adsProgress * 0.8);
    const bobAmountY = (isMoving ? 0.02 : 0.004) * (1.0 - this.adsProgress * 0.8);
    const bobX = Math.cos(this.bobTimer * 0.5) * bobAmountX;
    const bobY = Math.abs(Math.sin(this.bobTimer)) * bobAmountY;

    // 4. Recoil Recovery
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, this.recoilRecoverySpeed, delta);
    this.recoilOffsetZ = THREE.MathUtils.damp(this.recoilOffsetZ, 0, 12.0, delta);

    // 5. Bolt-Action Sequence Update
    if (this.isBolting) {
      this.boltTimer += delta;
      const progress = this.boltTimer / this.boltDuration;
      const boltGroup = this.sniperMesh.userData.boltGroup;

      if (boltGroup) {
        if (progress < 0.25) {
          // Lift bolt handle
          boltGroup.rotation.z = THREE.MathUtils.lerp(0, -Math.PI / 3, progress / 0.25);
        } else if (progress < 0.55) {
          // Slide bolt back
          const pullP = (progress - 0.25) / 0.3;
          boltGroup.position.z = THREE.MathUtils.lerp(-0.05, 0.12, pullP);
        } else if (progress < 0.8) {
          // Push bolt forward
          const pushP = (progress - 0.55) / 0.25;
          boltGroup.position.z = THREE.MathUtils.lerp(0.12, -0.05, pushP);
        } else {
          // Lock bolt down
          const lockP = (progress - 0.8) / 0.2;
          boltGroup.rotation.z = THREE.MathUtils.lerp(-Math.PI / 3, 0, lockP);
        }
      }

      if (this.boltTimer >= this.boltDuration) {
        this.isBolting = false;
        if (boltGroup) {
          boltGroup.rotation.z = 0;
          boltGroup.position.z = -0.05;
        }
      }
    }

    // 6. Reload Sequence
    if (this.isReloading) {
      this.reloadTimer += delta;
      const rProg = this.reloadTimer / this.reloadDuration;
      const mag = this.sniperMesh.userData.magazine;

      if (mag) {
        if (rProg < 0.3) {
          // Drop magazine down
          mag.position.y = THREE.MathUtils.lerp(-0.12, -0.5, rProg / 0.3);
        } else if (rProg < 0.7) {
          // Magazine offscreen
          mag.position.y = -0.6;
        } else {
          // Insert new magazine
          const insP = (rProg - 0.7) / 0.3;
          mag.position.y = THREE.MathUtils.lerp(-0.5, -0.12, insP);
        }
      }

      if (this.reloadTimer >= this.reloadDuration) {
        this.isReloading = false;
        this.ammo = this.maxAmmo;
        if (mag) mag.position.y = -0.12;
      }
    }

    // 7. Weapon Inspect & Positioning
    if (this.currentSlot === 'SNIPER') {
      const restPos = this.sniperRestPos;
      const aimPos = this.sniperAimPos;

      // Position interpolation (Rest -> ADS)
      const targetPos = new THREE.Vector3().lerpVectors(restPos, aimPos, this.adsProgress);
      targetPos.x += this.swayCurrent.x + bobX;
      targetPos.y += this.swayCurrent.y + bobY;
      targetPos.z += this.recoilOffsetZ;

      this.sniperMesh.position.copy(targetPos);

      // Rotation
      const targetRot = new THREE.Euler(
        THREE.MathUtils.lerp(this.sniperRestRot.x, this.sniperAimRot.x, this.adsProgress) - this.recoilPitch * 0.4,
        THREE.MathUtils.lerp(this.sniperRestRot.y, this.sniperAimRot.y, this.adsProgress) + this.swayCurrent.x * 2.0,
        THREE.MathUtils.lerp(this.sniperRestRot.z, this.sniperAimRot.z, this.adsProgress)
      );

      // Inspect animation tilt
      if (this.isInspecting) {
        this.inspectTimer += delta;
        const inspectProgress = this.inspectTimer / this.inspectDuration;
        const inspectAngle = Math.sin(inspectProgress * Math.PI) * 0.5;
        targetRot.z += inspectAngle;
        targetRot.x += inspectAngle * 0.2;
        if (this.inspectTimer >= this.inspectDuration) {
          this.isInspecting = false;
        }
      }

      this.sniperMesh.rotation.copy(targetRot);
    } else {
      // KNIFE VIEWMODEL
      const pos = this.knifeRestPos.clone();
      pos.x += this.swayCurrent.x + bobX;
      pos.y += this.swayCurrent.y + bobY;
      this.knifeMesh.position.copy(pos);

      const rot = this.knifeRestRot.clone();
      rot.y += this.swayCurrent.x * 3.0;

      if (this.isInspecting) {
        this.inspectTimer += delta;
        const iProgress = this.inspectTimer / this.inspectDuration;
        // 360-degree spin around finger ring
        rot.x += iProgress * Math.PI * 2;
        rot.z += Math.sin(iProgress * Math.PI) * 0.4;
        if (this.inspectTimer >= this.inspectDuration) {
          this.isInspecting = false;
        }
      }

      this.knifeMesh.rotation.copy(rot);
    }
  }

  // Reset all weapon states, timers, and reload on death / round restart
  resetStats() {
    this.ammo = this.maxAmmo;
    this.isBolting = false;
    this.isCyclingBolt = false;
    this.boltTimer = 0;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.isInspecting = false;
    this.inspectTimer = 0;
    this.setADS(false);
    this.adsProgress = 0;
    this.recoilOffsetZ = 0;
    this.recoilPitch = 0;
    if (this.sniperMesh && this.sniperMesh.userData.magazine) {
      this.sniperMesh.userData.magazine.position.y = -0.12;
    }
    if (this.sniperMesh && this.sniperMesh.userData.boltHandle) {
      this.sniperMesh.userData.boltHandle.position.z = 0;
      this.sniperMesh.userData.boltHandle.rotation.z = 0;
    }
    const boltStatus = document.getElementById('bolt-status');
    if (boltStatus) boltStatus.style.display = 'none';
  }
}
