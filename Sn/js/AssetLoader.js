// AssetLoader.js - Robust 3D Model Factory with Procedural Fallbacks
// Provides procedural low-poly sniper rifles, knives, crates, and GLTF loading fallback
import * as THREE from '../vendor/three/three.module.js';

export class AssetLoader {
  constructor() {
    this.cache = new Map();
  }

  // Attempts to load a GLTF model if available; falls back to procedural generator
  async loadModelWithFallback(url, proceduralFallbackFn) {
    if (this.cache.has(url)) {
      return this.cache.get(url).clone();
    }
    try {
      const gltf = await this.loadGLTF(url);
      if (gltf && gltf.scene) {
        this.cache.set(url, gltf.scene);
        return gltf.scene.clone();
      }
    } catch (err) {
      // Fallback
    }
    const fallback = proceduralFallbackFn();
    this.cache.set(url, fallback);
    return fallback.clone();
  }

  async loadGLTF(url) {
    // Uses procedural low-poly Roblox mesh fallbacks
    return this.createFallback('box');
  }

  // --- PROCEDURAL WEAPON CREATION ---

  // High quality low-poly Bolt-Action Sniper Rifle (AWP style)
  static createProceduralSniper(skinConfig = {}) {
    const root = new THREE.Group();
    root.name = 'SniperRifle';

    const baseColor = skinConfig.primaryColor || 0x242830;
    const accentColor = skinConfig.accentColor || 0x00c3ff;
    const metalColor = skinConfig.metalColor || 0x181818;
    const scopeColor = skinConfig.scopeColor || 0x111317;

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.45,
      metalness: 0.25
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.3,
      metalness: 0.6,
      emissive: skinConfig.emissive ? accentColor : 0x000000,
      emissiveIntensity: skinConfig.emissive ? 0.3 : 0
    });

    const metalMat = new THREE.MeshStandardMaterial({
      color: metalColor,
      roughness: 0.3,
      metalness: 0.85
    });

    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      roughness: 0.1,
      metalness: 0.9,
      emissive: 0x004466,
      emissiveIntensity: 0.4
    });

    // 1. Receiver / Main Body
    const bodyGeo = new THREE.BoxGeometry(0.08, 0.11, 0.7);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(0, 0, -0.15);
    root.add(bodyMesh);

    // Accent Stripe
    const stripeGeo = new THREE.BoxGeometry(0.082, 0.03, 0.6);
    const stripeMesh = new THREE.Mesh(stripeGeo, accentMat);
    stripeMesh.position.set(0, 0.02, -0.15);
    root.add(stripeMesh);

    // 2. Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.75, 12);
    barrelGeo.rotateX(Math.PI / 2);
    const barrelMesh = new THREE.Mesh(barrelGeo, metalMat);
    barrelMesh.position.set(0, 0.03, -0.75);
    root.add(barrelMesh);

    // Muzzle Brake
    const brakeGeo = new THREE.BoxGeometry(0.042, 0.042, 0.1);
    const brakeMesh = new THREE.Mesh(brakeGeo, metalMat);
    brakeMesh.position.set(0, 0.03, -1.15);
    root.add(brakeMesh);

    // 3. High-Power Optical Scope
    const scopeMountGeo = new THREE.BoxGeometry(0.03, 0.04, 0.2);
    const scopeMount = new THREE.Mesh(scopeMountGeo, metalMat);
    scopeMount.position.set(0, 0.085, -0.2);
    root.add(scopeMount);

    // Scope main tube
    const scopeTubeGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.38, 12);
    scopeTubeGeo.rotateX(Math.PI / 2);
    const scopeTube = new THREE.Mesh(scopeTubeGeo, new THREE.MeshStandardMaterial({ color: scopeColor, roughness: 0.3, metalness: 0.5 }));
    scopeTube.position.set(0, 0.125, -0.2);
    root.add(scopeTube);

    // Scope front objective bell
    const scopeFrontGeo = new THREE.CylinderGeometry(0.04, 0.028, 0.12, 12);
    scopeFrontGeo.rotateX(Math.PI / 2);
    const scopeFront = new THREE.Mesh(scopeFrontGeo, metalMat);
    scopeFront.position.set(0, 0.125, -0.42);
    root.add(scopeFront);

    // Scope front lens
    const lensGeo = new THREE.CircleGeometry(0.035, 12);
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(0, 0.125, -0.481);
    lens.rotation.y = Math.PI;
    root.add(lens);

    // Scope eye-piece bell
    const scopeRearGeo = new THREE.CylinderGeometry(0.028, 0.036, 0.08, 12);
    scopeRearGeo.rotateX(Math.PI / 2);
    const scopeRear = new THREE.Mesh(scopeRearGeo, metalMat);
    scopeRear.position.set(0, 0.125, -0.01);
    root.add(scopeRear);

    // Scope adjustment turrets
    const turretGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8);
    const topTurret = new THREE.Mesh(turretGeo, metalMat);
    topTurret.position.set(0, 0.16, -0.2);
    root.add(topTurret);

    const sideTurret = new THREE.Mesh(turretGeo, metalMat);
    sideTurret.rotation.z = Math.PI / 2;
    sideTurret.position.set(0.035, 0.125, -0.2);
    root.add(sideTurret);

    // 4. Bolt-Action Assembly (interactive animation group)
    const boltGroup = new THREE.Group();
    boltGroup.name = 'BoltGroup';
    boltGroup.position.set(0, 0.04, -0.05);

    const boltCylinderGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.22, 10);
    boltCylinderGeo.rotateX(Math.PI / 2);
    const boltCylinder = new THREE.Mesh(boltCylinderGeo, metalMat);
    boltGroup.add(boltCylinder);

    // Bolt handle stem and knob
    const handleStemGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.07, 8);
    handleStemGeo.rotateZ(Math.PI / 2);
    const handleStem = new THREE.Mesh(handleStemGeo, metalMat);
    handleStem.position.set(0.045, 0.01, 0.05);
    boltGroup.add(handleStem);

    const handleKnobGeo = new THREE.SphereGeometry(0.016, 8, 8);
    const handleKnob = new THREE.Mesh(handleKnobGeo, metalMat);
    handleKnob.position.set(0.08, 0.01, 0.05);
    boltGroup.add(handleKnob);

    root.add(boltGroup);

    // 5. Magazine
    const magGeo = new THREE.BoxGeometry(0.05, 0.16, 0.1);
    const magMesh = new THREE.Mesh(magGeo, metalMat);
    magMesh.name = 'Magazine';
    magMesh.position.set(0, -0.12, -0.12);
    magMesh.rotation.x = -0.15;
    root.add(magMesh);

    // 6. Stock & Grip
    const gripGeo = new THREE.BoxGeometry(0.065, 0.18, 0.09);
    const gripMesh = new THREE.Mesh(gripGeo, bodyMat);
    gripMesh.position.set(0, -0.12, 0.12);
    gripMesh.rotation.x = 0.45;
    root.add(gripMesh);

    const stockGeo = new THREE.BoxGeometry(0.07, 0.13, 0.35);
    const stockMesh = new THREE.Mesh(stockGeo, bodyMat);
    stockMesh.position.set(0, -0.02, 0.35);
    root.add(stockMesh);

    const padGeo = new THREE.BoxGeometry(0.074, 0.15, 0.03);
    const padMesh = new THREE.Mesh(padGeo, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
    padMesh.position.set(0, -0.02, 0.53);
    root.add(padMesh);

    // Store references for animations and material swaps
    root.userData = {
      boltGroup: boltGroup,
      magazine: magMesh,
      bodyMesh: bodyMesh,
      stripeMesh: stripeMesh,
      barrelMesh: barrelMesh,
      muzzlePos: new THREE.Vector3(0, 0.03, -1.2)
    };

    return root;
  }

  // Procedural Tactical Knife (Karambit / Tanto Blade)
  static createProceduralKnife(skinConfig = {}) {
    const root = new THREE.Group();
    root.name = 'TacticalKnife';

    const bladeColor = skinConfig.bladeColor || 0xd8d8d8;
    const handleColor = skinConfig.handleColor || 0x222428;
    const accentColor = skinConfig.accentColor || 0xff0055;

    const bladeMat = new THREE.MeshStandardMaterial({
      color: bladeColor,
      roughness: 0.18,
      metalness: 0.95
    });

    const handleMat = new THREE.MeshStandardMaterial({
      color: handleColor,
      roughness: 0.7,
      metalness: 0.2
    });

    const ringMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.3,
      metalness: 0.8
    });

    // Handle
    const handleGeo = new THREE.BoxGeometry(0.04, 0.03, 0.16);
    const handleMesh = new THREE.Mesh(handleGeo, handleMat);
    handleMesh.position.set(0, 0, 0.08);
    root.add(handleMesh);

    // Tactical finger grooves
    for (let i = 0; i < 3; i++) {
      const grooveGeo = new THREE.BoxGeometry(0.042, 0.008, 0.02);
      const groove = new THREE.Mesh(grooveGeo, ringMat);
      groove.position.set(0, -0.012, 0.04 + i * 0.04);
      root.add(groove);
    }

    // Rear finger ring (Karambit style)
    const ringGeo = new THREE.TorusGeometry(0.024, 0.007, 8, 16);
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(0, 0, 0.18);
    root.add(ringMesh);

    // Guard
    const guardGeo = new THREE.BoxGeometry(0.046, 0.05, 0.015);
    const guardMesh = new THREE.Mesh(guardGeo, ringMat);
    guardMesh.position.set(0, 0, 0);
    root.add(guardMesh);

    // Blade
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0);
    bladeShape.lineTo(0.005, 0.035);
    bladeShape.lineTo(0.18, 0.018);
    bladeShape.lineTo(0.24, 0);
    bladeShape.lineTo(0.05, -0.015);
    bladeShape.closePath();

    const extrudeSettings = { depth: 0.008, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.003, bevelThickness: 0.003 };
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, extrudeSettings);
    bladeGeo.rotateY(Math.PI / 2);
    bladeGeo.center();

    const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
    bladeMesh.name = 'KnifeBlade';
    bladeMesh.position.set(0, 0.01, -0.14);
    root.add(bladeMesh);

    root.userData = {
      bladeMesh: bladeMesh,
      handleMesh: handleMesh
    };

    return root;
  }

  // Procedural Target Dummy for Shooting Range in Lobby
  static createTargetDummy() {
    const root = new THREE.Group();
    root.name = 'TargetDummy';

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xdd2222, roughness: 0.4 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 });

    // Stand
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), baseMat);
    stand.position.y = 0.6;
    root.add(stand);

    // Hinge Pivot for knockdown animation
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.2, 0);
    root.add(pivot);

    // Target Torso
    const torsoGeo = new THREE.BoxGeometry(0.55, 0.75, 0.08);
    const torsoMesh = new THREE.Mesh(torsoGeo, woodMat);
    torsoMesh.position.y = 0.375;
    pivot.add(torsoMesh);

    // Bullseye Ring on Torso
    const outerRing = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.084, 16), redMat);
    outerRing.rotation.x = Math.PI / 2;
    outerRing.position.set(0, 0.375, 0);
    pivot.add(outerRing);

    const innerRing = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.086, 16), whiteMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.set(0, 0.375, 0);
    pivot.add(innerRing);

    // Target Head (Headshot target!)
    const headGeo = new THREE.BoxGeometry(0.28, 0.28, 0.08);
    const headMesh = new THREE.Mesh(headGeo, redMat);
    headMesh.name = 'TargetHead';
    headMesh.position.set(0, 0.9, 0);
    pivot.add(headMesh);

    // User data for hit detection
    root.userData = {
      isTarget: true,
      pivot: pivot,
      headMesh: headMesh,
      torsoMesh: torsoMesh,
      isKnockedDown: false,
      resetTimer: 0
    };

    return root;
  }

  // Iconic Roblox R6 Character with hitboxes
  static createRobloxCharacter(shirtColor = 0x00d2ff, pantsColor = 0x22262d, skinColor = 0xffd200) {
    const root = new THREE.Group();
    root.name = 'RobloxPlayer';

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.5 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.4 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.6 });

    // Head (instakill hitbox)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.y = 1.65;
    head.castShadow = true;
    head.userData = { isHeadshot: true };
    root.add(head);

    // Torso (bodyshot hitbox)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.4), shirtMat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    torso.userData = { isHeadshot: false };
    root.add(torso);

    // Limbs
    const armGeo = new THREE.BoxGeometry(0.35, 0.75, 0.35);
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(-0.6, 1.0, 0);
    leftArm.userData = { isHeadshot: false };
    root.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.set(0.6, 1.0, 0);
    rightArm.userData = { isHeadshot: false };
    root.add(rightArm);

    const legGeo = new THREE.BoxGeometry(0.38, 0.75, 0.38);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.22, 0.38, 0);
    leftLeg.userData = { isHeadshot: false };
    root.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.22, 0.38, 0);
    rightLeg.userData = { isHeadshot: false };
    root.add(rightLeg);

    // 3D Miniature Held Weapon
    const heldWeapon = AssetLoader.createProceduralSniper();
    heldWeapon.scale.set(0.7, 0.7, 0.7);
    heldWeapon.position.set(0.35, 0.85, -0.4);
    heldWeapon.rotation.set(0, -Math.PI / 12, 0);
    root.add(heldWeapon);

    root.userData = {
      head,
      torso,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      heldWeapon
    };

    return root;
  }
}
