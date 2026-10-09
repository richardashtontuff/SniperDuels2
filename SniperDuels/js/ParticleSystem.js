// ParticleSystem.js - Fast visual FX: Tracers, Muzzle Flash, Ejected Shells, Sparks
import * as THREE from '../vendor/three/three.module.js';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.sparks = [];
    this.shells = [];
    this.confetti = [];

    this.sparkGeo = new THREE.BufferGeometry();
    const sparkPositions = new Float32Array([0, 0, 0]);
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));

    this.shellGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.07, 6);
    this.shellMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Brass gold
      metalness: 0.85,
      roughness: 0.25
    });
  }

  // Thick, vibrant glowing bullet tracer beam from barrel to impact
  addTracer(startVec, endVec) {
    const dir = endVec.clone().sub(startVec);
    const dist = dir.length();
    if (dist < 0.2) return;

    const group = new THREE.Group();

    // 1. Outer luminous glowing beam (Cylinder)
    const outerGeo = new THREE.CylinderGeometry(0.12, 0.12, dist, 8, 1, true);
    outerGeo.translate(0, dist / 2, 0);
    outerGeo.rotateX(Math.PI / 2);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xffcc22,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    group.add(outerMesh);

    // 2. Inner brilliant white-hot laser core
    const innerGeo = new THREE.CylinderGeometry(0.05, 0.05, dist, 6, 1, true);
    innerGeo.translate(0, dist / 2, 0);
    innerGeo.rotateX(Math.PI / 2);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    group.add(innerMesh);

    // 3. Glowing bullet head tip
    const tipGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending
    });
    const tipMesh = new THREE.Mesh(tipGeo, tipMat);
    tipMesh.position.copy(endVec);
    this.scene.add(tipMesh);

    group.position.copy(startVec);
    group.lookAt(endVec);
    this.scene.add(group);

    this.tracers.push({
      group: group,
      tip: tipMesh,
      outerMat: outerMat,
      innerMat: innerMat,
      tipMat: tipMat,
      life: 0.45,
      maxLife: 0.45
    });
  }

  // Wall impact spark burst
  addImpact(point, normal, color = 0xffcc44, count = 12) {
    for (let i = 0; i < count; i++) {
      const pMat = new THREE.PointsMaterial({
        color: color,
        size: 0.08 + Math.random() * 0.06,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending
      });
      const spark = new THREE.Points(this.sparkGeo.clone(), pMat);
      spark.position.copy(point);

      // Random velocity oriented around surface normal
      const vel = normal.clone().multiplyScalar(2.0 + Math.random() * 4.0);
      vel.x += (Math.random() - 0.5) * 4.0;
      vel.y += (Math.random() - 0.5) * 4.0;
      vel.z += (Math.random() - 0.5) * 4.0;

      this.scene.add(spark);
      this.sparks.push({
        mesh: spark,
        vel: vel,
        life: 0.35 + Math.random() * 0.2,
        maxLife: 0.55
      });
    }
  }

  // Eject brass casing on sniper bolt cycle
  ejectShell(position, forwardDir) {
    const shell = new THREE.Mesh(this.shellGeo, this.shellMat);
    shell.position.copy(position);

    // Eject to the right and slightly backward/upward
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), forwardDir));
    const vel = right.multiplyScalar(2.5 + Math.random() * 1.5);
    vel.y += 1.8 + Math.random() * 1.2;
    vel.addScaledVector(forwardDir, -0.8);

    this.scene.add(shell);
    this.shells.push({
      mesh: shell,
      vel: vel,
      rotVel: new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20
      ),
      life: 1.8
    });
  }

  // Confetti explosion on match victory
  spawnVictoryConfetti(origin) {
    const colors = [0xff0055, 0x00d2ff, 0xffd200, 0x00ff88, 0xff7700, 0xaa00ff];
    for (let i = 0; i < 70; i++) {
      const geo = new THREE.PlaneGeometry(0.12, 0.12);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(origin).add(new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 2 + 1,
        (Math.random() - 0.5) * 4
      ));

      this.scene.add(mesh);
      this.confetti.push({
        mesh: mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          2.0 + Math.random() * 3.0,
          (Math.random() - 0.5) * 3
        ),
        rotVel: new THREE.Vector3(Math.random() * 5, Math.random() * 5, Math.random() * 5),
        life: 4.0
      });
    }
  }

  // Backwards-compatible aliases
  createBulletTracer(from, to) { this.addTracer(from, to); }
  createHitSparks(point, normal, color, count) { this.addImpact(point, normal || new THREE.Vector3(0, 1, 0), color, count); }
  createBloodSplatter(point, count) { this.addImpact(point, new THREE.Vector3(0, 1, 0), 0xb30000, count); }
  createConfetti(origin) { this.spawnVictoryConfetti(origin); }
  createMuzzleFlash(pos, dir) {}

  update(delta) {
    // 1. Update bullet tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= delta;
      const progress = Math.max(0, t.life / t.maxLife);
      if (t.outerMat) t.outerMat.opacity = progress * 0.95;
      if (t.innerMat) t.innerMat.opacity = progress;
      if (t.tipMat) t.tipMat.opacity = progress;

      if (t.life <= 0) {
        this.scene.remove(t.group);
        this.scene.remove(t.tip);
        t.group.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        });
        if (t.tip.geometry) t.tip.geometry.dispose();
        if (t.tip.material) t.tip.material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // 2. Update sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= delta;
      s.mesh.position.addScaledVector(s.vel, delta);
      s.vel.y -= 9.8 * delta; // Gravity
      s.mesh.material.opacity = Math.max(0, s.life / s.maxLife);

      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.material.dispose();
        this.sparks.splice(i, 1);
      }
    }

    // 3. Update ejected shells
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      sh.life -= delta;
      sh.mesh.position.addScaledVector(sh.vel, delta);
      sh.vel.y -= 12.0 * delta; // Shell gravity
      sh.mesh.rotation.x += sh.rotVel.x * delta;
      sh.mesh.rotation.y += sh.rotVel.y * delta;

      // Floor bounce at Y = 0.05
      if (sh.mesh.position.y < 0.05) {
        sh.mesh.position.y = 0.05;
        sh.vel.y *= -0.4;
        sh.vel.x *= 0.6;
        sh.vel.z *= 0.6;
      }

      if (sh.life <= 0) {
        this.scene.remove(sh.mesh);
        this.shells.splice(i, 1);
      }
    }

    // 4. Update victory confetti
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.life -= delta;
      c.mesh.position.addScaledVector(c.vel, delta);
      c.vel.y -= 3.0 * delta; // Slow flutter gravity
      c.mesh.rotation.x += c.rotVel.x * delta;
      c.mesh.rotation.y += c.rotVel.y * delta;

      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        c.mesh.material.dispose();
        this.confetti.splice(i, 1);
      }
    }
  }
}
