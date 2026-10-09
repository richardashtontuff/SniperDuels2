// BotAI.js - Intelligent Competitive Roblox R6 Duel Opponent
import * as THREE from '../vendor/three/three.module.js';
import { AssetLoader } from './AssetLoader.js';

export class BotAI {
  constructor(scene, mapGenerator, audioSystem, particleSystem) {
    this.scene = scene;
    this.map = mapGenerator;
    this.audio = audioSystem;
    this.particles = particleSystem;

    this.difficulty = 'normal'; // 'casual', 'normal', 'hard'
    this.health = 100;
    this.isAlive = true;
    this.state = 'IDLE'; // 'IDLE', 'PATROL', 'PEEK', 'AIM', 'SHOOT', 'CYCLE'

    // Timers
    this.reactionTimer = 0;
    this.shootCooldown = 0;
    this.peekTimer = 0;
    this.patrolTimer = 0;
    this.glintMesh = null;

    // Movement & Waypoints
    this.position = new THREE.Vector3(0, 1.8, -25); // Orange Spawn
    this.velocity = new THREE.Vector3();
    this.targetWaypoint = new THREE.Vector3();
    this.speed = 8.5;

    // Build R6 3D Character Mesh
    this.buildCharacterMesh();

    // Arena cover waypoints for smart patrolling
    this.waypoints = [
      new THREE.Vector3(-14, 1.8, -5), // West low cover
      new THREE.Vector3(-6, 2.8, -19), // Orange deck left
      new THREE.Vector3(6, 2.8, -19),  // Orange deck right
      new THREE.Vector3(14, 1.8, -5),  // East low cover
      new THREE.Vector3(0, 3.0, 15),   // Mid bridge
      new THREE.Vector3(-12, 1.8, 15), // Mid west
      new THREE.Vector3(12, 1.8, 15)   // Mid east
    ];

    this.pickNextWaypoint();
  }

  buildCharacterMesh() {
    this.mesh = new THREE.Group();
    this.mesh.name = 'BotCharacter';

    // Iconic Roblox R6 Proportions & Materials
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffd200, roughness: 0.5 }); // Classic Roblox yellow skin
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.4 }); // Orange team jersey
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.6 }); // Dark pants
    const limbMat = new THREE.MeshStandardMaterial({ color: 0xffd200, roughness: 0.5 });

    // Head (instakill hitbox)
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.head = new THREE.Mesh(headGeo, skinMat);
    this.head.position.y = 1.65;
    this.head.castShadow = true;
    this.head.userData = { isBot: true, isHeadshot: true, bot: this };
    this.mesh.add(this.head);

    // Torso (main body hitbox)
    const torsoGeo = new THREE.BoxGeometry(0.8, 0.8, 0.4);
    this.torso = new THREE.Mesh(torsoGeo, torsoMat);
    this.torso.position.y = 1.0;
    this.torso.castShadow = true;
    this.torso.userData = { isBot: true, isHeadshot: false, bot: this };
    this.mesh.add(this.torso);

    // Left Arm & Right Arm
    const armGeo = new THREE.BoxGeometry(0.35, 0.75, 0.35);
    this.leftArm = new THREE.Mesh(armGeo, limbMat);
    this.leftArm.position.set(-0.6, 1.0, 0);
    this.leftArm.userData = { isBot: true, isHeadshot: false, bot: this };
    this.mesh.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, limbMat);
    this.rightArm.position.set(0.6, 1.0, 0);
    this.rightArm.userData = { isBot: true, isHeadshot: false, bot: this };
    this.mesh.add(this.rightArm);

    // Left Leg & Right Leg
    const legGeo = new THREE.BoxGeometry(0.38, 0.75, 0.38);
    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.22, 0.38, 0);
    this.leftLeg.userData = { isBot: true, isHeadshot: false, bot: this };
    this.mesh.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.22, 0.38, 0);
    this.rightLeg.userData = { isBot: true, isHeadshot: false, bot: this };
    this.mesh.add(this.rightLeg);

    // Bot Sniper Rifle attached to right arm
    this.botSniper = AssetLoader.createProceduralSniper({
      primaryColor: 0x111317,
      accentColor: 0xff6600
    });
    this.botSniper.scale.set(0.8, 0.8, 0.8);
    this.botSniper.position.set(0.25, 1.05, -0.4);
    this.mesh.add(this.botSniper);

    // Scope Glint Particle (visual indicator when bot is aiming at you)
    const glintGeo = new THREE.PlaneGeometry(0.4, 0.4);
    const glintMat = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide
    });
    this.glintMesh = new THREE.Mesh(glintGeo, glintMat);
    this.glintMesh.position.set(0.25, 1.15, -1.1);
    this.mesh.add(this.glintMesh);

    this.scene.add(this.mesh);
    this.mesh.position.copy(this.position);
  }

  setDifficulty(diff) {
    this.difficulty = diff;
  }

  setWaypoints(newWaypoints) {
    if (newWaypoints && newWaypoints.length > 0) {
      this.waypoints = newWaypoints;
      this.pickNextWaypoint();
    }
  }

  reset(spawnPos) {
    this.isAlive = true;
    this.health = 100;
    this.state = 'PATROL';
    this.position.copy(spawnPos);
    this.mesh.position.copy(spawnPos);
    this.mesh.visible = true;
    this.shootCooldown = 1.5;
    this.glintMesh.material.opacity = 0;

    // Reset limbs
    this.head.position.set(0, 1.65, 0);
    this.head.rotation.set(0, 0, 0);
    this.torso.position.set(0, 1.0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.leftArm.position.set(-0.6, 1.0, 0);
    this.rightArm.position.set(0.6, 1.0, 0);
    this.leftLeg.position.set(-0.22, 0.38, 0);
    this.rightLeg.position.set(0.22, 0.38, 0);

    this.pickNextWaypoint();
  }

  pickNextWaypoint() {
    const idx = Math.floor(Math.random() * this.waypoints.length);
    this.targetWaypoint.copy(this.waypoints[idx]);
    this.patrolTimer = 3.0 + Math.random() * 4.0;
  }

  takeDamage(amount, isHeadshot) {
    if (!this.isAlive) return false;

    this.health -= amount;

    // Flinch flash red
    this.torso.material.color.setHex(0xffffff);
    setTimeout(() => {
      if (this.torso) this.torso.material.color.setHex(0xff6600);
    }, 80);

    if (this.health <= 0) {
      this.die();
      return true; // Fatal kill
    }
    return false;
  }

  // Classic Roblox shatter death
  die() {
    this.isAlive = false;
    this.glintMesh.material.opacity = 0;

    // Scatter blocky limbs
    const limbs = [this.head, this.torso, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.botSniper];
    limbs.forEach(limb => {
      if (limb) {
        limb.position.y += 0.5;
        limb.position.x += (Math.random() - 0.5) * 0.8;
        limb.position.z += (Math.random() - 0.5) * 0.8;
        limb.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      }
    });

    // Fade out after 2.5s
    setTimeout(() => {
      if (!this.isAlive) this.mesh.visible = false;
    }, 2500);
  }

  // Raycast line of sight check from bot eyes to player position
  canSeePlayer(playerPosition) {
    const botEye = this.position.clone().add(new THREE.Vector3(0, 1.6, 0));
    const playerTarget = playerPosition.clone().add(new THREE.Vector3(0, 1.4, 0));
    const dir = playerTarget.clone().sub(botEye).normalize();
    const dist = botEye.distanceTo(playerTarget);

    const ray = new THREE.Raycaster(botEye, dir, 0.1, dist);
    const meshes = this.map.colliders.map(c => c.mesh);
    const hits = ray.intersectObjects(meshes);

    // If an obstacle hit occurs before reaching the player, line of sight is blocked
    return hits.length === 0;
  }

  update(delta, playerPosition, matchState, onPlayerHit) {
    if (!this.isAlive || matchState !== 'ROUND_ACTIVE') {
      if (this.glintMesh) this.glintMesh.material.opacity = 0;
      return;
    }

    const distToPlayer = this.position.distanceTo(playerPosition);
    const hasSight = this.canSeePlayer(playerPosition);

    // Orient towards player or moving waypoint
    if (hasSight) {
      const lookTarget = new THREE.Vector3(playerPosition.x, this.position.y, playerPosition.z);
      this.mesh.lookAt(lookTarget);
    }

    // --- COMBAT BEHAVIOR & DIFFICULTY TUNING ---
    const config = {
      casual: { reaction: 0.75, aimNoise: 0.12, cycleTime: 2.2 },
      normal: { reaction: 0.45, aimNoise: 0.05, cycleTime: 1.6 },
      hard: { reaction: 0.28, aimNoise: 0.02, cycleTime: 1.2 }
    }[this.difficulty];

    if (this.shootCooldown > 0) {
      this.shootCooldown -= delta;
    }

    if (hasSight) {
      this.state = 'AIM';
      this.reactionTimer += delta;

      // Scope Glint Flashes when aiming
      const glintProg = Math.min(1.0, this.reactionTimer / config.reaction);
      this.glintMesh.material.opacity = glintProg * 0.9;
      this.glintMesh.lookAt(playerPosition);

      // Bot fires sniper rifle when aim is locked!
      if (this.reactionTimer >= config.reaction && this.shootCooldown <= 0) {
        this.fireAtPlayer(playerPosition, config.aimNoise, onPlayerHit);
        this.reactionTimer = 0;
        this.shootCooldown = config.cycleTime;
        this.glintMesh.material.opacity = 0;
      }
    } else {
      this.state = 'PATROL';
      this.reactionTimer = 0;
      this.glintMesh.material.opacity = 0;

      // Patrol towards next waypoint
      this.patrolTimer -= delta;
      if (this.patrolTimer <= 0 || this.position.distanceTo(this.targetWaypoint) < 2.0) {
        this.pickNextWaypoint();
      }

      // Move toward target waypoint
      const moveDir = this.targetWaypoint.clone().sub(this.position).setY(0).normalize();
      this.position.addScaledVector(moveDir, this.speed * delta);
      this.mesh.position.copy(this.position);
      this.mesh.lookAt(this.targetWaypoint.x, this.position.y, this.targetWaypoint.z);

      // Leg running swing animation
      const legAngle = Math.sin(Date.now() * 0.01) * 0.5;
      this.leftLeg.rotation.x = legAngle;
      this.rightLeg.rotation.x = -legAngle;
    }
  }

  fireAtPlayer(playerPosition, aimNoise, onPlayerHit) {
    this.audio.playSniperShot();

    // Muzzle position
    const muzzlePos = new THREE.Vector3();
    this.botSniper.getWorldPosition(muzzlePos);

    // Calculate aim point with slight difficulty inaccuracy
    const target = playerPosition.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * aimNoise * 15,
      1.3 + (Math.random() - 0.5) * aimNoise * 10,
      (Math.random() - 0.5) * aimNoise * 15
    ));

    // Bullet tracer
    this.particles.addTracer(muzzlePos, target);

    // Test hit against player
    const dist = target.distanceTo(playerPosition.clone().add(new THREE.Vector3(0, 1.3, 0)));
    if (dist < 1.1) {
      // Hit!
      const isHeadshot = dist < 0.45;
      const dmg = isHeadshot ? 150 : 85;
      if (onPlayerHit) {
        onPlayerHit(dmg, isHeadshot);
      }
    }
  }
}
