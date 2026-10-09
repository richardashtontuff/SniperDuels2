// MultiplayerClient.js - Real-Time 60Hz WebSocket Network Sync Client
import * as THREE from '../vendor/three/three.module.js';
import { AssetLoader } from './AssetLoader.js';

export class MultiplayerClient {
  constructor(gameEngine) {
    this.game = gameEngine;
    this.ws = null;
    this.isConnected = false;
    this.localPlayerId = null;
    this.localTeam = 'BLUE';
    this.remotePlayers = new Map(); // id -> { id, group, head, torso, leftArm, rightArm, leftLeg, rightLeg, heldWeapon, targetPos, targetRot }
    this.currentMatchId = null;
    this.currentOpponentId = null;
    this.isTwoPlayerMatch = false;
    this.voteInterval = null;

    this.syncInterval = null;
    this.initVoteUI();
    this.connect();
  }

  initVoteUI() {
    const cards = document.querySelectorAll('.vote-card');
    cards.forEach(card => {
      const handleVote = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.currentMatchId) return;
        const mapName = card.dataset.vote;
        this.castVote(mapName);
      };
      card.addEventListener('click', handleVote);
      card.addEventListener('touchend', handleVote, { passive: false });
    });
  }

  showMapVoting(duration = 10) {
    const overlay = document.getElementById('map-vote-overlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    if (document.exitPointerLock) document.exitPointerLock();

    // Reset cards and badges
    document.querySelectorAll('.vote-card').forEach(c => {
      c.classList.remove('voted', 'winner');
    });
    ['blockout', 'poolday', 'rooftop'].forEach(m => {
      const b = document.getElementById(`vote-badge-${m}`);
      if (b) b.textContent = '0 VOTES';
    });

    const statusText = document.getElementById('vote-status-text');
    if (statusText) statusText.textContent = 'Pick your arena! Most votes wins • Random on tie';

    let timeLeft = duration;
    const timerText = document.getElementById('vote-timer-text');
    if (timerText) timerText.textContent = `TIME: ${timeLeft}s`;

    if (this.voteInterval) clearInterval(this.voteInterval);
    this.voteInterval = setInterval(() => {
      timeLeft--;
      if (timerText) timerText.textContent = `TIME: ${Math.max(0, timeLeft)}s`;
      if (timeLeft <= 0) {
        clearInterval(this.voteInterval);
        this.voteInterval = null;
      }
    }, 1000);
  }

  castVote(mapName) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.currentMatchId) return;

    // Highlight card
    document.querySelectorAll('.vote-card').forEach(c => c.classList.remove('voted'));
    const selectedCard = document.getElementById(`vote-card-${mapName}`);
    if (selectedCard) selectedCard.classList.add('voted');

    const statusText = document.getElementById('vote-status-text');
    if (statusText) statusText.textContent = `YOU VOTED FOR ${mapName.toUpperCase()} ✓ • WAITING FOR OPPONENT...`;

    this.ws.send(JSON.stringify({
      type: 'VOTE_MAP',
      matchId: this.currentMatchId,
      mapName: mapName
    }));
  }

  connect() {
    if (!location.host || location.protocol === 'file:' || location.origin === 'null') {
      console.info('[MultiplayerClient] Standalone/Offline mode active.');
      return;
    }
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${location.host}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log('[MultiplayerClient] Connected to WebSocket Game Server!');
        this.startTransformSync();
        this.updateHUDOnlineStatus(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (e) {
          console.warn('[MultiplayerClient] Bad message:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.updateHUDOnlineStatus(false);
        if (this.syncInterval) clearInterval(this.syncInterval);
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        this.updateHUDOnlineStatus(false);
      };
    } catch (err) {
      console.info('[MultiplayerClient] Running in Solo Offline / Local Bot mode.');
    }
  }

  updateHUDOnlineStatus(online) {
    const banner = document.getElementById('match-status-banner');
    if (online) {
      console.log('[Multiplayer] Real-time multiplayer synchronization active.');
    }
  }

  startTransformSync() {
    // 60Hz state sync
    this.syncInterval = setInterval(() => {
      if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      const pos = this.game.controls.getPosition();
      const payload = {
        type: 'SYNC_TRANSFORM',
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { y: this.game.controls.yaw, pitch: this.game.controls.pitch },
        slot: this.game.weaponSystem.currentSlot,
        isAiming: this.game.weaponSystem.isAiming,
        isSliding: this.game.controls.isSliding
      };

      this.ws.send(JSON.stringify(payload));
    }, 1000 / 60);
  }

  stepOnQueuePad() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'QUEUE_PAD_ENTER' }));
  }

  stepOffQueuePad() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'QUEUE_PAD_LEAVE' }));
  }

  sendFireWeapon(origin, direction, spread, isAiming, weaponType) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'FIRE_WEAPON',
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      spread: spread,
      isAiming: isAiming,
      weaponType: weaponType
    }));
  }

  sendInflictDamage(targetId, damage, isHeadshot) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'INFLICT_DAMAGE',
      targetId: targetId,
      damage: damage,
      isHeadshot: isHeadshot
    }));
  }

  createRemotePlayer(pInfo) {
    if (this.remotePlayers.has(pInfo.id)) return;

    const shirtColor = (pInfo.team === 'RED') ? 0xff4444 : 0x00d2ff;
    const model = AssetLoader.createRobloxCharacter(shirtColor, 0x22262d, 0xffd200);

    model.position.set(pInfo.position.x, pInfo.position.y, pInfo.position.z);
    model.rotation.y = pInfo.rotation ? pInfo.rotation.y : 0;

    // Tag hitboxes for raycasting
    model.userData.head.userData = { isRemotePlayer: true, playerId: pInfo.id, isHeadshot: true };
    model.userData.torso.userData = { isRemotePlayer: true, playerId: pInfo.id, isHeadshot: false };
    model.userData.leftArm.userData = { isRemotePlayer: true, playerId: pInfo.id, isHeadshot: false };
    model.userData.rightArm.userData = { isRemotePlayer: true, playerId: pInfo.id, isHeadshot: false };
    model.userData.leftLeg.userData = { isRemotePlayer: true, playerId: pInfo.id, isHeadshot: false };
    model.userData.rightLeg.userData = { isRemotePlayer: true, playerId: pInfo.id, isHeadshot: false };

    this.game.worldScene.add(model);

    this.remotePlayers.set(pInfo.id, {
      id: pInfo.id,
      group: model,
      head: model.userData.head,
      torso: model.userData.torso,
      leftArm: model.userData.leftArm,
      rightArm: model.userData.rightArm,
      leftLeg: model.userData.leftLeg,
      rightLeg: model.userData.rightLeg,
      heldWeapon: model.userData.heldWeapon,
      targetPos: new THREE.Vector3(pInfo.position.x, pInfo.position.y, pInfo.position.z),
      targetYaw: pInfo.rotation ? pInfo.rotation.y : 0
    });
  }

  removeRemotePlayer(playerId) {
    if (this.remotePlayers.has(playerId)) {
      const rp = this.remotePlayers.get(playerId);
      this.game.worldScene.remove(rp.group);
      this.remotePlayers.delete(playerId);
    }
  }

  handleServerMessage(msg) {
    switch (msg.type) {
      case 'INIT':
        this.localPlayerId = msg.playerId;
        console.log(`[Multiplayer] Assigned ID: ${this.localPlayerId}`);
        const initOnline = document.getElementById('online-count');
        const initQueue = document.getElementById('queue-count');
        if (initOnline && msg.playerCount) initOnline.textContent = msg.playerCount;
        if (initQueue && msg.queueCount !== undefined) initQueue.textContent = msg.queueCount;
        break;

      case 'SERVER_STATS':
        const elOnline = document.getElementById('online-count');
        const elQueue = document.getElementById('queue-count');
        if (elOnline && msg.onlinePlayers !== undefined) elOnline.textContent = msg.onlinePlayers;
        if (elQueue && msg.queuePlayers !== undefined) elQueue.textContent = msg.queuePlayers;
        break;

      case 'PLAYER_JOINED':
        if (msg.player.id !== this.localPlayerId) {
          this.createRemotePlayer(msg.player);
        }
        break;

      case 'PLAYER_LEFT':
        this.removeRemotePlayer(msg.playerId);
        break;

      case 'QUEUE_UPDATE':
        const elQ = document.getElementById('queue-count');
        if (elQ && msg.playersOnPad !== undefined) elQ.textContent = msg.playersOnPad;
        // If local player is waiting on the middle queue pad, display queue progress
        if (this.game.matchManager && this.game.matchManager.activePad && this.game.matchManager.activePad.userData.mode === 'multiplayer_queue') {
          this.game.matchManager.updateStateBanner(msg.message, true, msg.playersOnPad >= 2 ? '#00ffcc' : '#f1c40f');
        }
        break;

      case 'PLAYER_TRANSFORM':
        // Auto-create remote player if model doesn't exist yet
        if (!this.remotePlayers.has(msg.id)) {
          this.createRemotePlayer({
            id: msg.id,
            team: 'BLUE',
            position: msg.position,
            rotation: msg.rotation
          });
        }

        if (this.remotePlayers.has(msg.id)) {
          const rp = this.remotePlayers.get(msg.id);
          rp.targetPos.set(msg.position.x, msg.position.y, msg.position.z);
          rp.targetYaw = msg.rotation.y;

          // Smoothly interpolate position and orientation
          rp.group.position.lerp(rp.targetPos, 0.4);
          rp.group.rotation.y = THREE.MathUtils.lerp(rp.group.rotation.y, rp.targetYaw, 0.4);

          // Animate running legs
          const isMoving = rp.group.position.distanceTo(rp.targetPos) > 0.05;
          const legAngle = isMoving ? Math.sin(Date.now() * 0.012) * 0.5 : 0;
          rp.leftLeg.rotation.x = legAngle;
          rp.rightLeg.rotation.x = -legAngle;

          // Sync weapon visibility
          if (rp.heldWeapon) {
            rp.heldWeapon.visible = (msg.slot === 'SNIPER');
          }
        }
        break;

      case 'MAP_VOTE_START':
        this.currentMatchId = msg.matchId;
        this.currentOpponentId = msg.opponentId;
        this.myTeam = msg.myTeam;
        this.opponentTeam = msg.opponentTeam;
        console.log(`[Multiplayer] Map vote started for match ${this.currentMatchId}`);
        this.showMapVoting(msg.duration || 10);
        break;

      case 'VOTE_UPDATE':
        if (msg.votes) {
          for (const [m, count] of Object.entries(msg.votes)) {
            const b = document.getElementById(`vote-badge-${m}`);
            if (b) b.textContent = `${count} VOTE${count === 1 ? '' : 'S'}`;
          }
        }
        break;

      case 'MATCH_START_2P':
        console.log(`[Matchmaking] 2-Player Match starting against ${msg.opponentId}! Team: ${msg.myTeam}, Arena: ${msg.selectedMap}`);
        this.currentMatchId = msg.matchId;
        this.currentOpponentId = msg.opponentId;
        this.isTwoPlayerMatch = true;

        if (this.voteInterval) {
          clearInterval(this.voteInterval);
          this.voteInterval = null;
        }

        const chosenMap = msg.selectedMap || 'blockout';
        const winnerCard = document.getElementById(`vote-card-${chosenMap}`);
        if (winnerCard) winnerCard.classList.add('winner');

        const statusText = document.getElementById('vote-status-text');
        if (statusText) {
          statusText.textContent = msg.wasTie ?
            `TIEBREAKER! RANDOMLY SELECTED: ${chosenMap.toUpperCase()}` :
            `WINNER: ${chosenMap.toUpperCase()} (MOST VOTES)`;
        }

        setTimeout(() => {
          const overlay = document.getElementById('map-vote-overlay');
          if (overlay) overlay.style.display = 'none';

          // Load the chosen arena
          this.game.map.loadArena(chosenMap);

          // Ensure opponent model is spawned
          if (!this.remotePlayers.has(msg.opponentId)) {
            this.createRemotePlayer({
              id: msg.opponentId,
              team: msg.opponentTeam,
              position: { x: 0, y: 2.55, z: (msg.opponentTeam === 'RED' ? -25 : 55) }
            });
          }

          // Delegate to match manager to start 2-player duel!
          this.game.matchManager.startTwoPlayerMatch(msg.myTeam, msg.opponentId, chosenMap, msg.maxScore);
        }, 1200);
        break;

      case 'REMOTE_FIRE':
        // Render remote player tracer and gunshot audio
        this.game.audio.playSniperShot();
        const start = new THREE.Vector3(msg.origin.x, msg.origin.y, msg.origin.z);
        const dir = new THREE.Vector3(msg.direction.x, msg.direction.y, msg.direction.z);
        const end = start.clone().addScaledVector(dir, 150);
        this.game.particles.addTracer(start, end);
        break;

      case 'DAMAGE_TAKEN':
        // Local player took damage from opponent
        this.game.matchManager.onPlayerDamaged(msg.damage, msg.isHeadshot);
        break;

      case 'HIT_CONFIRMED':
        // Local player shot the opponent
        this.game.audio.playHitmarker(msg.isHeadshot);
        this.game.matchManager.showHitmarker(msg.isHeadshot);
        this.game.matchManager.showDamageNumber(msg.damage, msg.isHeadshot);
        break;

      case 'ROUND_OVER':
        // Multi-round match: advance round and show intermission
        this.game.matchManager.onTwoPlayerRoundOver(msg);
        break;

      case 'MATCH_OVER':
        this.isTwoPlayerMatch = false;
        this.currentMatchId = null;
        this.currentOpponentId = null;

        if (msg.scores) {
          this.game.matchManager.scorePlayer = msg.scores.blue;
          this.game.matchManager.scoreBot = msg.scores.red;
          this.game.matchManager.updateHUDScore();
        }

        if (msg.reason === 'OPPONENT_DISCONNECTED') {
          this.game.matchManager.triggerMatchVictory('OPPONENT_QUIT');
        } else if (msg.isWinner) {
          this.game.matchManager.triggerMatchVictory('YOU');
        } else {
          this.game.matchManager.triggerMatchVictory('OPPONENT');
        }
        break;
    }
  }
}
