// MapGenerator.js - Multi-Map Arena Engine ("Blockout", "Pool Day", "Rooftop") & Interactive Lobby
import * as THREE from '../vendor/three/three.module.js';
import { AssetLoader } from './AssetLoader.js';

export class MapGenerator {
  constructor(scene) {
    this.scene = scene;
    this.lobbyColliders = [];
    this.arenaColliders = [];
    this.colliders = []; // Combined colliders for physics
    this.targetDummies = [];
    this.duelPads = [];
    this.shopKiosk = null;
    this.mapTerminal = null;

    this.currentMapName = 'blockout'; // 'blockout', 'poolday', 'rooftop'

    this.spawnBlue = new THREE.Vector3(0, 2.55, 55);
    this.spawnOrange = new THREE.Vector3(0, 2.55, -25);
    this.lobbySpawn = new THREE.Vector3(0, 0.55, -84); // Spawn behind the duel pads

    // Procedural textures - crisp, bright competitive Roblox blockout colors
    this.studTexture = this.generateStudTexture('#525c6d', '#677387');
    this.studTextureBlue = this.generateStudTexture('#0088dd', '#00b4ff');
    this.studTextureOrange = this.generateStudTexture('#e66000', '#ff851b');
    this.studTextureFloor = this.generateStudTexture('#444c5a', '#586273');
    this.poolTileTexture = this.generateTileTexture('#00b4d8', '#0077b6');
    this.rooftopTexture = this.generateStudTexture('#343d4d', '#49556b');

    // Groups
    this.lobbyGroup = new THREE.Group();
    this.lobbyGroup.name = 'LobbyGroup';
    this.scene.add(this.lobbyGroup);

    this.arenaGroup = new THREE.Group();
    this.arenaGroup.name = 'ArenaGroup';
    this.scene.add(this.arenaGroup);

    // Water mesh for Pool Day
    this.waterMesh = null;

    // Callbacks
    this.onMapChanged = null;
  }

  // Generates classic Roblox circular stud texture onto an HTML5 Canvas
  generateStudTexture(baseColorHex, studColorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = baseColorHex;
    ctx.fillRect(0, 0, 128, 128);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 126, 126);

    const studPositions = [
      { x: 32, y: 32 }, { x: 96, y: 32 },
      { x: 32, y: 96 }, { x: 96, y: 96 }
    ];

    studPositions.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y + 2, 17, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = studColorHex;
      ctx.fill();

      const grad = ctx.createLinearGradient(p.x - 12, p.y - 12, p.x + 12, p.y + 12);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
      ctx.fillStyle = grad;
      ctx.fill();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  generateTileTexture(c1, c2) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = c2;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillRect(64, 64, 64, 64);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  buildMap() {
    this.buildLobby();
    this.loadArena('blockout');
  }

  // Switch active arena dynamically
  loadArena(mapName) {
    this.currentMapName = mapName;

    // Clear previous arena
    while (this.arenaGroup.children.length > 0) {
      const obj = this.arenaGroup.children[0];
      this.arenaGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
    this.arenaColliders = [];
    this.waterMesh = null;

    if (mapName === 'poolday') {
      this.buildPoolDayArena();
    } else if (mapName === 'rooftop') {
      this.buildRooftopArena();
    } else {
      this.buildBlockoutArena();
    }

    // Recombine colliders
    this.colliders = [...this.lobbyColliders, ...this.arenaColliders];

    if (this.onMapChanged) {
      this.onMapChanged(mapName, this.getWaypointsForMap(mapName));
    }
  }

  createBox(x, y, z, w, h, d, material, parent, isLobby = false) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);

    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const colItem = { box: box, mesh: mesh };

    if (isLobby) {
      this.lobbyColliders.push(colItem);
    } else {
      this.arenaColliders.push(colItem);
    }
    return mesh;
  }

  createRamp(x, y, z, w, h, d, mat, parent, slopeDir = 'south') {
    const rampGroup = new THREE.Group();
    rampGroup.position.set(x, y, z);

    const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, Math.sqrt(h * h + d * d)), mat);
    const angle = Math.atan2(h, d);
    rampMesh.rotation.x = slopeDir === 'south' ? angle : -angle;
    rampMesh.position.set(0, h / 2, 0);
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    rampGroup.add(rampMesh);
    parent.add(rampGroup);

    this.createBox(x, y, z - d * 0.25, w, h * 0.5, d * 0.5, mat, parent);
    this.createBox(x, y, z + d * 0.25, w, h * 0.9, d * 0.5, mat, parent);
  }

  createBarrier(x, y, z, w, h, color) {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.visible = false;
    return mesh;
  }

  // ==========================================
  // 1. ARENA: "BLOCKOUT" (Symmetrical Competitive)
  // ==========================================
  buildBlockoutArena() {
    this.spawnBlue.set(0, 2.55, 55);
    this.spawnOrange.set(0, 2.55, -25);

    const floorMat = new THREE.MeshStandardMaterial({ map: this.studTextureFloor, roughness: 0.6, metalness: 0.1 });
    floorMat.map.repeat.set(16, 32);

    this.createBox(0, 0, 15, 44, 0.5, 100, floorMat, this.arenaGroup);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1f2228, roughness: 0.8 });
    this.createBox(-22, 0.5, 15, 1.5, 9, 100, wallMat, this.arenaGroup);
    this.createBox(22, 0.5, 15, 1.5, 9, 100, wallMat, this.arenaGroup);
    this.createBox(0, 0.5, -35, 44, 9, 1.5, wallMat, this.arenaGroup);
    this.createBox(0, 0.5, 65, 44, 9, 1.5, wallMat, this.arenaGroup);

    const blueMat = new THREE.MeshStandardMaterial({ map: this.studTextureBlue, roughness: 0.5 });
    blueMat.map.repeat.set(4, 3);
    const orangeMat = new THREE.MeshStandardMaterial({ map: this.studTextureOrange, roughness: 0.5 });
    orangeMat.map.repeat.set(4, 3);

    // Blue Team High Perch & Ramp
    this.createBox(0, 0.5, 55, 24, 2.0, 14, blueMat, this.arenaGroup);
    this.createRamp(0, 0.5, 45, 12, 2.0, 6, blueMat, this.arenaGroup, 'south');

    // Orange Team High Perch & Ramp
    this.createBox(0, 0.5, -25, 24, 2.0, 14, orangeMat, this.arenaGroup);
    this.createRamp(0, 0.5, -15, 12, 2.0, 6, orangeMat, this.arenaGroup, 'north');

    // Mid Bridge
    const midBridgeMat = new THREE.MeshStandardMaterial({ color: 0x434c5e, roughness: 0.5 });
    this.createBox(0, 0.5, 15, 16, 2.2, 10, midBridgeMat, this.arenaGroup);
    this.createRamp(0, 0.5, 8, 8, 2.2, 4, midBridgeMat, this.arenaGroup, 'south');
    this.createRamp(0, 0.5, 22, 8, 2.2, 4, midBridgeMat, this.arenaGroup, 'north');

    const railMat = new THREE.MeshStandardMaterial({ color: 0x88c0d0, emissive: 0x003344 });
    this.createBox(-7.5, 2.7, 15, 0.4, 1.0, 10, railMat, this.arenaGroup);
    this.createBox(7.5, 2.7, 15, 0.4, 1.0, 10, railMat, this.arenaGroup);

    // Tactical Cover Blocks
    const crateMat = new THREE.MeshStandardMaterial({ map: this.studTexture, roughness: 0.5 });
    crateMat.map.repeat.set(2, 2);

    const crates = [
      { x: -14, z: 35, w: 3.5, h: 2.2, d: 3.5 },
      { x: -12, z: 15, w: 3.0, h: 2.5, d: 5.0 },
      { x: -14, z: -5, w: 3.5, h: 2.2, d: 3.5 },
      { x: 14, z: 35, w: 3.5, h: 2.2, d: 3.5 },
      { x: 12, z: 15, w: 3.0, h: 2.5, d: 5.0 },
      { x: 14, z: -5, w: 3.5, h: 2.2, d: 3.5 },
      { x: -6, z: 49, w: 2.5, h: 1.3, d: 2.5 },
      { x: 6, z: 49, w: 2.5, h: 1.3, d: 2.5 },
      { x: -6, z: -19, w: 2.5, h: 1.3, d: 2.5 },
      { x: 6, z: -19, w: 2.5, h: 1.3, d: 2.5 }
    ];
    crates.forEach(c => this.createBox(c.x, 0.5, c.z, c.w, c.h, c.d, crateMat, this.arenaGroup));

    this.blueBarrier = this.createBarrier(0, 2.5, 47, 24, 6, 0x00d2ff);
    this.orangeBarrier = this.createBarrier(0, 2.5, -17, 24, 6, 0xff7700);
    this.arenaGroup.add(this.blueBarrier);
    this.arenaGroup.add(this.orangeBarrier);
  }

  // ==========================================
  // 2. ARENA: "POOL DAY" (Sunken Pool & Diving Boards)
  // ==========================================
  buildPoolDayArena() {
    this.spawnBlue.set(0, 2.05, 50);
    this.spawnOrange.set(0, 2.05, -20);

    const tileMat = new THREE.MeshStandardMaterial({ map: this.poolTileTexture, roughness: 0.3 });
    tileMat.map.repeat.set(12, 24);

    // Deck Surrounding Floor
    this.createBox(0, 0, 15, 44, 0.5, 100, tileMat, this.arenaGroup);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x27496d, roughness: 0.7 });
    this.createBox(-22, 0.5, 15, 1.5, 9, 100, wallMat, this.arenaGroup);
    this.createBox(22, 0.5, 15, 1.5, 9, 100, wallMat, this.arenaGroup);
    this.createBox(0, 0.5, -35, 44, 9, 1.5, wallMat, this.arenaGroup);
    this.createBox(0, 0.5, 65, 44, 9, 1.5, wallMat, this.arenaGroup);

    // Sunken Pool Basin (X: -11 to 11, Z: -5 to 35)
    const basinMat = new THREE.MeshStandardMaterial({ color: 0x0081a7, roughness: 0.2 });
    // Side decks
    this.createBox(-16, 0.5, 15, 10, 1.5, 40, tileMat, this.arenaGroup);
    this.createBox(16, 0.5, 15, 10, 1.5, 40, tileMat, this.arenaGroup);
    // End decks
    this.createBox(0, 0.5, 45, 44, 1.5, 20, tileMat, this.arenaGroup);
    this.createBox(0, 0.5, -15, 44, 1.5, 20, tileMat, this.arenaGroup);

    // Translucent Animated Water Mesh in Pool
    const waterGeo = new THREE.PlaneGeometry(22, 40);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x00b4d8,
      transparent: true,
      opacity: 0.72,
      roughness: 0.1,
      metalness: 0.8
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.set(0, 1.4, 15);
    this.arenaGroup.add(this.waterMesh);

    // Diving Boards (Blue & Orange Sniper Vantage Points!)
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const ladderMat = new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.4 });

    // Blue High Diving Platform (Z = 38)
    this.createBox(0, 2.0, 40, 2.5, 3.0, 2.5, ladderMat, this.arenaGroup);
    this.createBox(0, 4.8, 35, 2.0, 0.3, 8.0, boardMat, this.arenaGroup);

    // Orange High Diving Platform (Z = -8)
    this.createBox(0, 2.0, -10, 2.5, 3.0, 2.5, ladderMat, this.arenaGroup);
    this.createBox(0, 4.8, -5, 2.0, 0.3, 8.0, boardMat, this.arenaGroup);

    // Cabanas / Locker Cubicles (Cover)
    const cabanaMat = new THREE.MeshStandardMaterial({ color: 0xfdf0d5, roughness: 0.5 });
    this.createBox(-14, 2.0, 25, 4, 3, 6, cabanaMat, this.arenaGroup);
    this.createBox(-14, 2.0, 5, 4, 3, 6, cabanaMat, this.arenaGroup);
    this.createBox(14, 2.0, 25, 4, 3, 6, cabanaMat, this.arenaGroup);
    this.createBox(14, 2.0, 5, 4, 3, 6, cabanaMat, this.arenaGroup);

    this.blueBarrier = this.createBarrier(0, 2.5, 47, 24, 6, 0x00d2ff);
    this.orangeBarrier = this.createBarrier(0, 2.5, -17, 24, 6, 0xff7700);
    this.arenaGroup.add(this.blueBarrier);
    this.arenaGroup.add(this.orangeBarrier);
  }

  // ==========================================
  // 3. ARENA: "ROOFTOP SKYLINE" (High-Rise Skyscraper)
  // ==========================================
  buildRooftopArena() {
    this.spawnBlue.set(0, 0.55, 55);
    this.spawnOrange.set(0, 0.55, -25);

    const roofMat = new THREE.MeshStandardMaterial({ map: this.rooftopTexture, roughness: 0.7 });
    roofMat.map.repeat.set(16, 32);

    this.createBox(0, 0, 15, 44, 0.5, 100, roofMat, this.arenaGroup);

    // Low parapet walls instead of tall enclosed walls!
    const parapetMat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.6 });
    this.createBox(-21.5, 0.5, 15, 1.0, 1.5, 100, parapetMat, this.arenaGroup);
    this.createBox(21.5, 0.5, 15, 1.0, 1.5, 100, parapetMat, this.arenaGroup);
    this.createBox(0, 0.5, -34.5, 44, 1.5, 1.0, parapetMat, this.arenaGroup);
    this.createBox(0, 0.5, 64.5, 44, 1.5, 1.0, parapetMat, this.arenaGroup);

    // Center Illuminated Helipad
    const heliPadBase = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, 0.4, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 })
    );
    heliPadBase.position.set(0, 0.7, 15);
    this.arenaGroup.add(heliPadBase);
    this.createBox(0, 0.5, 15, 16, 0.4, 16, parapetMat, this.arenaGroup);

    // Neon Yellow Ring & "H" on Helipad
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(6.5, 7.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide })
    );
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(0, 0.92, 15);
    this.arenaGroup.add(ringMesh);

    // HVAC Units & Industrial Ducts (Great tactical cover)
    const hvacMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, metalness: 0.6, roughness: 0.3 });
    const hvacs = [
      { x: -12, z: 32, w: 4.5, h: 2.2, d: 3.5 },
      { x: 12, z: 32, w: 4.5, h: 2.2, d: 3.5 },
      { x: -12, z: -2, w: 4.5, h: 2.2, d: 3.5 },
      { x: 12, z: -2, w: 4.5, h: 2.2, d: 3.5 },
      { x: -7, z: 15, w: 2.5, h: 1.8, d: 5.0 },
      { x: 7, z: 15, w: 2.5, h: 1.8, d: 5.0 }
    ];
    hvacs.forEach(h => this.createBox(h.x, 0.5, h.z, h.w, h.h, h.d, hvacMat, this.arenaGroup));

    // Distant City Skyline Towers (Skybox aesthetic)
    const towerMat = new THREE.MeshBasicMaterial({ color: 0x080a10 });
    const distantTowers = [
      { x: -60, z: 15, w: 25, h: 70, d: 25 },
      { x: 60, z: 15, w: 25, h: 80, d: 25 },
      { x: -50, z: -60, w: 30, h: 90, d: 30 },
      { x: 50, z: -60, w: 30, h: 100, d: 30 },
      { x: 0, z: 95, w: 35, h: 110, d: 35 }
    ];
    distantTowers.forEach(t => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), towerMat);
      b.position.set(t.x, t.h / 2 - 20, t.z);
      this.arenaGroup.add(b);
    });

    this.blueBarrier = this.createBarrier(0, 2.5, 47, 24, 6, 0x00d2ff);
    this.orangeBarrier = this.createBarrier(0, 2.5, -17, 24, 6, 0xff7700);
    this.arenaGroup.add(this.blueBarrier);
    this.arenaGroup.add(this.orangeBarrier);
  }

  // Waypoints for AI Bot navigation tailored to each map
  getWaypointsForMap(mapName) {
    if (mapName === 'poolday') {
      return [
        new THREE.Vector3(-14, 2.0, 5),   // Cabana west
        new THREE.Vector3(14, 2.0, 5),    // Cabana east
        new THREE.Vector3(0, 4.8, -5),    // Diving board orange
        new THREE.Vector3(-14, 2.0, 25),  // Cabana south-west
        new THREE.Vector3(14, 2.0, 25),   // Cabana south-east
        new THREE.Vector3(0, 2.0, 15)     // Pool edge
      ];
    } else if (mapName === 'rooftop') {
      return [
        new THREE.Vector3(-12, 1.8, -2),  // HVAC west
        new THREE.Vector3(12, 1.8, -2),   // HVAC east
        new THREE.Vector3(0, 1.8, 15),    // Helipad center
        new THREE.Vector3(-12, 1.8, 32),  // HVAC south-west
        new THREE.Vector3(12, 1.8, 32),   // HVAC south-east
        new THREE.Vector3(7, 1.8, 15)     // Duct cover
      ];
    } else {
      // Default Blockout
      return [
        new THREE.Vector3(-14, 1.8, -5),
        new THREE.Vector3(-6, 2.8, -19),
        new THREE.Vector3(6, 2.8, -19),
        new THREE.Vector3(14, 1.8, -5),
        new THREE.Vector3(0, 3.0, 15),
        new THREE.Vector3(-12, 1.8, 15),
        new THREE.Vector3(12, 1.8, 15)
      ];
    }
  }

  // ==========================================
  // 4. INTERACTIVE LOBBY
  // ==========================================
  buildLobby() {
    const lobbyFloorMat = new THREE.MeshStandardMaterial({
      map: this.studTextureFloor,
      roughness: 0.4,
      metalness: 0.2
    });
    lobbyFloorMat.map.repeat.set(16, 16);

    this.createBox(0, 0, -100, 44, 0.5, 50, lobbyFloorMat, this.lobbyGroup, true);

    const lobbyWallMat = new THREE.MeshStandardMaterial({ color: 0x323a48, roughness: 0.6 });
    this.createBox(-22, 0.5, -100, 1.5, 9, 50, lobbyWallMat, this.lobbyGroup, true);
    this.createBox(22, 0.5, -100, 1.5, 9, 50, lobbyWallMat, this.lobbyGroup, true);
    this.createBox(0, 0.5, -125, 44, 9, 1.5, lobbyWallMat, this.lobbyGroup, true);

    const glassMat = new THREE.MeshStandardMaterial({ color: 0x3a4f66, roughness: 0.3, metalness: 0.5 });
    this.createBox(-14, 0.5, -75, 16, 9, 1.0, glassMat, this.lobbyGroup, true);
    this.createBox(14, 0.5, -75, 16, 9, 1.0, glassMat, this.lobbyGroup, true);

    // Duel Pads: Middle is 1v1 Duel Pad (reduced size), Left & Right are Solo Bot Duels
    const duelPad1 = this.createDuelPad(0, 0.52, -100, 5.5, 0x00ffcc, '1v1 DUEL PAD', 'multiplayer_queue');
    this.lobbyGroup.add(duelPad1);
    this.duelPads.push(duelPad1);

    const duelPad2 = this.createDuelPad(-13, 0.52, -100, 6.5, 0x00b4d8, 'CASUAL BOT DUEL (SOLO)', 'casual');
    this.lobbyGroup.add(duelPad2);
    this.duelPads.push(duelPad2);

    const duelPad3 = this.createDuelPad(13, 0.52, -100, 6.5, 0xff0055, 'AWP GOD BOT DUEL (SOLO)', 'hard');
    this.lobbyGroup.add(duelPad3);
    this.duelPads.push(duelPad3);

    // Shooting Range (Lobby North)
    const targets = [
      { x: -8, dist: '15m' }, { x: -3, dist: '25m' },
      { x: 3, dist: '35m' }, { x: 8, dist: '50m' }
    ];
    targets.forEach(t => {
      const dummy = AssetLoader.createTargetDummy();
      dummy.position.set(t.x, 0.5, -122);
      this.lobbyGroup.add(dummy);
      this.targetDummies.push(dummy);

      const markerGeo = new THREE.PlaneGeometry(1.6, 0.6);
      markerGeo.rotateX(-Math.PI / 2);
      const markerMesh = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x556677 }));
      markerMesh.position.set(t.x, 0.55, -114);
      this.lobbyGroup.add(markerMesh);
    });

    // Unbox Shop Kiosk (Lobby West: X = -16, Z = -85)
    this.buildShopKiosk(this.lobbyGroup);

    // Map Selector Terminal (Lobby East: X = 16, Z = -85)
    this.buildMapTerminal(this.lobbyGroup);
  }

  createDuelPad(x, y, z, radius, colorHex, labelText, mode) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const padBase = new THREE.Mesh(
      new THREE.CylinderGeometry(radius / 2, radius / 2, 0.15, 24),
      new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.3 })
    );
    group.add(padBase);

    const ringGeo = new THREE.RingGeometry(radius / 2 - 0.25, radius / 2, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.08;
    group.add(ring);

    const innerStud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.2, emissive: colorHex, emissiveIntensity: 0.5 })
    );
    innerStud.position.y = 0.08;
    group.add(innerStud);

    group.userData = {
      isDuelPad: true,
      radius: radius / 2,
      mode: mode,
      label: labelText,
      ringMesh: ring,
      baseColor: colorHex
    };
    return group;
  }

  buildShopKiosk(parent) {
    const kioskGroup = new THREE.Group();
    kioskGroup.position.set(-16, 0.5, -85);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.8, 0.9, 16),
      new THREE.MeshStandardMaterial({ color: 0x2d3436, roughness: 0.4 })
    );
    base.position.y = 0.45;
    kioskGroup.add(base);

    const crateMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00, roughness: 0.3, metalness: 0.8, emissive: 0x332200
    });
    const crateMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.6), crateMat);
    crateMesh.position.y = 1.6;
    kioskGroup.add(crateMesh);

    const textCanvas = document.createElement('canvas');
    textCanvas.width = 256; textCanvas.height = 64;
    const ctx = textCanvas.getContext('2d');
    ctx.fillStyle = '#00ffcc'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CRATE SHOP', 128, 42);

    const textTex = new THREE.CanvasTexture(textCanvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex }));
    sprite.position.set(0, 2.4, 0);
    sprite.scale.set(2.4, 0.6, 1);
    kioskGroup.add(sprite);

    parent.add(kioskGroup);
    this.shopKiosk = { group: kioskGroup, crateMesh: crateMesh };
  }

  buildMapTerminal(parent) {
    const termGroup = new THREE.Group();
    termGroup.position.set(16, 0.5, -85);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.8, 0.9, 16),
      new THREE.MeshStandardMaterial({ color: 0x2d3436, roughness: 0.4 })
    );
    base.position.y = 0.45;
    termGroup.add(base);

    // Floating Rotating Hologram Globe / Icon
    const holoMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.45, 1),
      new THREE.MeshStandardMaterial({ color: 0x00d2ff, wireframe: true, emissive: 0x00d2ff, emissiveIntensity: 0.6 })
    );
    holoMesh.position.y = 1.6;
    termGroup.add(holoMesh);

    const textCanvas = document.createElement('canvas');
    textCanvas.width = 256; textCanvas.height = 64;
    const ctx = textCanvas.getContext('2d');
    ctx.fillStyle = '#00d2ff'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('MAP SELECTOR', 128, 42);

    const textTex = new THREE.CanvasTexture(textCanvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex }));
    sprite.position.set(0, 2.4, 0);
    sprite.scale.set(2.4, 0.6, 1);
    termGroup.add(sprite);

    parent.add(termGroup);
    this.mapTerminal = { group: termGroup, holoMesh: holoMesh };
  }

  update(delta, time) {
    this.duelPads.forEach(pad => {
      const scale = 1.0 + Math.sin(time * 3.5) * 0.04;
      pad.userData.ringMesh.scale.set(scale, scale, scale);
    });

    if (this.shopKiosk) {
      this.shopKiosk.crateMesh.rotation.y += delta * 1.2;
      this.shopKiosk.crateMesh.position.y = 1.6 + Math.sin(time * 2.5) * 0.08;
    }

    if (this.mapTerminal) {
      this.mapTerminal.holoMesh.rotation.y += delta * 1.5;
      this.mapTerminal.holoMesh.rotation.x += delta * 0.8;
      this.mapTerminal.holoMesh.position.y = 1.6 + Math.sin(time * 2.5) * 0.08;
    }

    // Animate water ripples in Pool Day
    if (this.waterMesh) {
      this.waterMesh.position.y = 1.4 + Math.sin(time * 2.0) * 0.03;
    }

    this.targetDummies.forEach(dummy => {
      if (dummy.userData.isKnockedDown) {
        dummy.userData.resetTimer -= delta;
        if (dummy.userData.resetTimer <= 0) {
          dummy.userData.isKnockedDown = false;
          dummy.userData.pivot.rotation.x = 0;
        }
      }
    });
  }

  hitTarget(dummy, isHeadshot) {
    dummy.userData.isKnockedDown = true;
    dummy.userData.resetTimer = 2.5;
    dummy.userData.pivot.rotation.x = -Math.PI / 2.2;
  }
}
