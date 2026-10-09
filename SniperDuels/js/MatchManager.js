// MatchManager.js - State Machine, Matchmaking Duel Pads, Multi-Round Engine
import * as THREE from '../vendor/three/three.module.js';

export class MatchManager {
  constructor(controls, bot, map, audio, particles, caseSystem) {
    this.controls = controls;
    this.bot = bot;
    this.map = map;
    this.audio = audio;
    this.particles = particles;
    this.caseSystem = caseSystem;
    this.weaponSystem = null;

    // Multi-Round Rules: First to 3 Wins!
    this.maxScore = 3;
    this.scorePlayer = 0; // Blue Score
    this.scoreBot = 0;    // Red Score
    this.roundNumber = 1;
    this.nextRoundNumber = 1;
    this.lastRoundWinner = null;

    // States: 'LOBBY', 'WARMUP', 'ROUND_ACTIVE', 'ROUND_INTERMISSION', 'MATCH_VICTORY'
    this.state = 'LOBBY';
    this.stateTimer = 0;
    this.roundTimeRemaining = 60;

    // Player Combat State
    this.playerHealth = 100;
    this.playerMaxHealth = 100;
    this.isPlayerAlive = true;

    // Pad detection & Multiplayer Queue
    this.activePad = null;
    this.isOnQueuePad = false;
    this.padCountdown = 3.0;
    this.queueTimer = 0;
    this.mpClient = null;
    this.isTwoPlayer = false;
    this.opponentId = null;
    this.myTeam = 'BLUE';

    this.initUI();
  }

  setMultiplayerClient(mpClient) {
    this.mpClient = mpClient;
  }

  setWeaponSystem(weaponSystem) {
    this.weaponSystem = weaponSystem;
  }

  initUI() {
    this.updateHUDScore();
    this.updateHUDHealth();
    this.updateStateBanner('LOBBY PRACTICE - STEP ON A DUEL PAD TO PLAY', false);
  }

  updateHUDScore() {
    const elPlayer = document.getElementById('score-blue');
    const elBot = document.getElementById('score-red');
    if (elPlayer) elPlayer.textContent = this.scorePlayer;
    if (elBot) elBot.textContent = this.scoreBot;

    const pipsBlue = document.getElementById('pips-blue');
    const pipsRed = document.getElementById('pips-red');
    if (pipsBlue && pipsRed) {
      pipsBlue.innerHTML = '';
      pipsRed.innerHTML = '';
      for (let i = 0; i < this.maxScore; i++) {
        const bPip = document.createElement('div');
        bPip.className = `score-pip ${i < this.scorePlayer ? 'active' : ''}`;
        pipsBlue.appendChild(bPip);

        const rPip = document.createElement('div');
        rPip.className = `score-pip ${i < this.scoreBot ? 'active red' : ''}`;
        pipsRed.appendChild(rPip);
      }
    }
  }

  updateHUDHealth() {
    const bar = document.getElementById('health-bar-fill');
    const text = document.getElementById('health-text');
    if (bar) bar.style.width = `${Math.max(0, this.playerHealth)}%`;
    if (text) text.textContent = `${Math.max(0, this.playerHealth)} HP`;

    // Low Health screen effects (pulsing red blood vignette)
    const lowVig = document.getElementById('low-health-vignette');
    if (lowVig) {
      if (!this.isPlayerAlive || this.playerHealth <= 0 || this.state === 'LOBBY' || this.playerHealth > 50) {
        lowVig.style.opacity = '0';
        lowVig.className = '';
      } else if (this.playerHealth <= 25) {
        lowVig.style.opacity = '1';
        lowVig.className = 'critical-health-pulse';
      } else {
        lowVig.style.opacity = '0.85';
        lowVig.className = 'low-health-pulse';
      }
    }
  }

  updateStateBanner(text, visible = true, color = '#ffffff') {
    const banner = document.getElementById('match-status-banner');
    if (banner) {
      banner.style.display = visible ? 'block' : 'none';
      banner.textContent = text;
      banner.style.color = color;
    }
  }

  // Check if player stepped on any Duel Pad in lobby
  checkDuelPads(playerPosition, delta) {
    if (this.state !== 'LOBBY') return;

    let onAnyPad = false;
    let currentSteppedPad = null;

    for (const pad of this.map.duelPads) {
      const padPos = pad.position;
      const dist = Math.hypot(playerPosition.x - padPos.x, playerPosition.z - padPos.z);
      const activeRadius = (this.activePad === pad) ? (pad.userData.radius + 1.5) : pad.userData.radius;

      if (dist < activeRadius) {
        onAnyPad = true;
        currentSteppedPad = pad;
        break;
      }
    }

    if (onAnyPad && currentSteppedPad) {
      if (this.activePad !== currentSteppedPad) {
        this.activePad = currentSteppedPad;
        this.padCountdown = 3.0;
        const diff = (currentSteppedPad.userData.mode === 'hard') ? 'hard' : 'normal';
        this.bot.setDifficulty(diff);
      }

      this.padCountdown -= delta;
      const sec = Math.max(1, Math.ceil(this.padCountdown));
      const padLabel = currentSteppedPad.userData.label || '1v1 DUEL';
      this.updateStateBanner(`DUEL STARTING IN ${sec}... (${padLabel})`, true, '#00ffcc');

      if (this.padCountdown <= 0) {
        this.startSoloMatch();
      }
    } else {
      if (this.activePad) {
        this.activePad = null;
        this.updateStateBanner('LOBBY PRACTICE - STEP ON A DUEL PAD TO PLAY', true, '#ffffff');
      }
    }
  }

  // Starts Solo Bot Match (First to 3 Wins)
  startSoloMatch() {
    this.isTwoPlayer = false;
    this.maxScore = 3;
    this.scorePlayer = 0;
    this.scoreBot = 0;
    this.roundNumber = 1;
    this.activePad = null;
    this.isOnQueuePad = false;
    this.updateHUDScore();
    this.setupRound();
  }

  // Starts 2-Player Match triggered by WebSocket Server!
  startTwoPlayerMatch(myTeam, opponentId, chosenMap = 'blockout', maxScore = 3) {
    this.isTwoPlayer = true;
    this.opponentId = opponentId;
    this.myTeam = myTeam;
    this.activePad = null;
    this.isOnQueuePad = false;
    this.maxScore = maxScore || 3;
    this.scorePlayer = 0;
    this.scoreBot = 0;
    this.roundNumber = 1;
    this.updateHUDScore();

    // Disable AI Bot in 2-player match
    this.bot.mesh.visible = false;
    this.bot.isAlive = false;

    this.setupNextTwoPlayerRound(1);
  }

  // Sets up next 2-Player round: resets player, teleports to spawn perch, raises barriers
  setupNextTwoPlayerRound(roundNum) {
    this.state = 'WARMUP';
    this.stateTimer = 3.0;
    this.roundTimeRemaining = 60;
    this.playerHealth = 100;
    this.isPlayerAlive = true;
    this.updateHUDHealth();

    if (roundNum !== undefined) {
      this.roundNumber = roundNum;
    }

    // Reset camera back to first-person view
    this.controls.resetFromDeath();

    // Reset and reload weapons
    if (this.weaponSystem) {
      this.weaponSystem.resetStats();
    }

    // Stand remote players back up
    if (this.mpClient && this.mpClient.remotePlayers) {
      for (const rp of this.mpClient.remotePlayers.values()) {
        if (rp.group) {
          rp.group.rotation.x = 0;
          rp.group.rotation.z = 0;
          rp.group.position.y = 0.55;
        }
      }
    }

    // Teleport local player to team perch
    if (this.myTeam === 'BLUE') {
      this.controls.teleport(this.map.spawnBlue, new THREE.Vector3(0, 1.8, 0));
    } else {
      this.controls.teleport(this.map.spawnOrange, new THREE.Vector3(0, 1.8, 0));
    }

    // Clear damage vignette
    const vig = document.getElementById('damage-vignette');
    if (vig) vig.style.opacity = '0.0';

    // Raise spawn barrier forcefields
    this.map.blueBarrier.visible = true;
    this.map.orangeBarrier.visible = true;

    this.audio.playCountdownTick();
    this.updateStateBanner(`ROUND ${this.roundNumber} - WARMUP (3)`, true, '#00d2ff');
  }

  // Sets up round for Solo Bot match
  setupRound() {
    this.state = 'WARMUP';
    this.stateTimer = 3.0;
    this.roundTimeRemaining = 60;
    this.playerHealth = 100;
    this.isPlayerAlive = true;
    this.updateHUDHealth();

    // Reset camera from death
    this.controls.resetFromDeath();

    // Reset & reload weapon
    if (this.weaponSystem) {
      this.weaponSystem.resetStats();
    }

    const vig = document.getElementById('damage-vignette');
    if (vig) vig.style.opacity = '0.0';

    // Teleport Player to Blue Spawn, facing North (Orange side)
    this.controls.teleport(this.map.spawnBlue, new THREE.Vector3(0, 1.8, 0));

    // Teleport & reset Bot to Orange Spawn
    this.bot.reset(this.map.spawnOrange);
    this.bot.mesh.rotation.x = 0;

    // Raise spawn barrier forcefields
    this.map.blueBarrier.visible = true;
    this.map.orangeBarrier.visible = true;

    this.audio.playCountdownTick();
    this.updateStateBanner(`ROUND ${this.roundNumber} - WARMUP (3)`, true, '#00d2ff');
  }

  startRoundActive() {
    this.state = 'ROUND_ACTIVE';
    this.map.blueBarrier.visible = false;
    this.map.orangeBarrier.visible = false;
    this.audio.stopLobbyMusic();
    this.audio.playRoundStart();
    this.updateStateBanner('ROUND ACTIVE - ELIMINATE THE ENEMY!', true, '#00ffcc');

    setTimeout(() => {
      if (this.state === 'ROUND_ACTIVE') {
        this.updateStateBanner('', false);
      }
    }, 1500);
  }

  // When player inflicts damage on Bot
  onBotDamaged(damage, isHeadshot) {
    if (this.state !== 'ROUND_ACTIVE') return;

    this.audio.playHitmarker(isHeadshot);
    this.showHitmarker(isHeadshot);
    this.showDamageNumber(damage, isHeadshot);

    const isFatal = this.bot.takeDamage(damage, isHeadshot);
    if (isFatal) {
      this.onBotKilled(isHeadshot);
    }
  }

  // When Bot dies: Player wins the round
  onBotKilled(isHeadshot) {
    this.addKillFeedEntry('YOU', 'BOT_ALPHA', isHeadshot);
    this.scorePlayer++;
    this.updateHUDScore();
    this.audio.playRoundWon();

    // Bot falls over on death
    this.bot.mesh.rotation.x = Math.PI / 2;
    this.bot.mesh.position.y = 0.25;

    if (this.weaponSystem) {
      this.weaponSystem.resetStats();
    }

    if (this.scorePlayer >= this.maxScore) {
      this.triggerMatchVictory('PLAYER');
    } else {
      this.lastRoundWinner = 'YOU';
      this.state = 'ROUND_INTERMISSION';
      this.stateTimer = 3.0;
    }
  }

  // When Player takes damage (from Bot or Remote Player)
  onPlayerDamaged(damage, isHeadshot) {
    if (this.state !== 'ROUND_ACTIVE' || !this.isPlayerAlive) return;

    this.playerHealth -= damage;
    this.updateHUDHealth();
    this.showDamageVignette();

    if (this.playerHealth <= 0) {
      this.isPlayerAlive = false;
      this.playerHealth = 0;
      this.updateHUDHealth();
      this.onPlayerKilled(isHeadshot);
    }
  }

  // When Player dies: Opponent wins the round
  onPlayerKilled(isHeadshot) {
    const killer = this.isTwoPlayer ? 'OPPONENT' : 'BOT_ALPHA';
    this.addKillFeedEntry(killer, 'YOU', isHeadshot);

    // Fall over and unequip scope / reload
    if (!this.isTwoPlayer) {
      this.controls.triggerDeath(this.bot.mesh.position);
      if (this.weaponSystem) {
        this.weaponSystem.resetStats();
      }

      this.scoreBot++;
      this.updateHUDScore();
      this.audio.playRoundLost();

      if (this.scoreBot >= this.maxScore) {
        this.triggerMatchVictory('OPPONENT');
      } else {
        this.lastRoundWinner = 'BOT_ALPHA';
        this.state = 'ROUND_INTERMISSION';
        this.stateTimer = 3.0;
      }
    }
  }

  // Received from server when a round ends in 2-player match
  onTwoPlayerRoundOver(msg) {
    const isMeWinner = (msg.roundWinnerId === this.mpClient?.myId);
    this.lastRoundWinner = isMeWinner ? 'YOU' : 'OPPONENT';

    this.scorePlayer = msg.scores.blue;
    this.scoreBot = msg.scores.red;
    this.updateHUDScore();

    const killer = isMeWinner ? 'YOU' : 'OPPONENT';
    const victim = isMeWinner ? 'OPPONENT' : 'YOU';
    this.addKillFeedEntry(killer, victim, msg.isHeadshot);

    if (isMeWinner) {
      this.audio.playRoundWon();
      // Make defeated opponent's avatar fall over
      if (this.mpClient && this.mpClient.remotePlayers.has(msg.roundLoserId)) {
        const rp = this.mpClient.remotePlayers.get(msg.roundLoserId);
        if (rp && rp.group) {
          rp.group.rotation.x = Math.PI / 2;
          rp.group.position.y = 0.25;
        }
      }
    } else {
      this.audio.playRoundLost();
      // Local player died: fall over and pan camera to winner!
      let winnerPos = null;
      if (this.mpClient && this.mpClient.remotePlayers.has(msg.roundWinnerId)) {
        winnerPos = this.mpClient.remotePlayers.get(msg.roundWinnerId).group.position;
      } else {
        winnerPos = (this.myTeam === 'BLUE') ? this.map.spawnOrange : this.map.spawnBlue;
      }
      this.controls.triggerDeath(winnerPos);
    }

    // Reset weapon state, force unequip scope, reload
    if (this.weaponSystem) {
      this.weaponSystem.resetStats();
    }
    const vig = document.getElementById('damage-vignette');
    if (vig) vig.style.opacity = '0.0';

    this.state = 'ROUND_INTERMISSION';
    this.stateTimer = msg.intermissionSeconds || 3.0;
    this.nextRoundNumber = msg.nextRoundNumber;

    const resText = isMeWinner ? 'ROUND WON!' : 'ROUND LOST!';
    const resCol = isMeWinner ? '#00ffcc' : '#ff4444';
    this.updateStateBanner(`${resText} (BLUE ${this.scorePlayer} - RED ${this.scoreBot}) • NEXT ROUND IN 3...`, true, resCol);
  }

  // Final Victory / Defeat Screen -> Ends Match & Returns to Lobby
  triggerMatchVictory(winner) {
    this.state = 'MATCH_VICTORY';
    this.stateTimer = 3.5;

    if (winner === 'PLAYER' || winner === 'YOU') {
      this.updateStateBanner(`VICTORY! YOU WON THE DUEL (${this.scorePlayer} - ${this.scoreBot}) (+300 COINS)`, true, '#f1c40f');
      this.caseSystem.addCoins(300);
      this.audio.playUnlockFanfare('legendary');
      this.particles.spawnVictoryConfetti(this.controls.getPosition());
    } else if (winner === 'OPPONENT_QUIT') {
      this.updateStateBanner('OPPONENT DISCONNECTED - YOU WIN (+150 COINS)', true, '#f1c40f');
      this.caseSystem.addCoins(150);
      this.audio.playUnlockFanfare('rare');
    } else {
      this.updateStateBanner(`DEFEAT! OPPONENT WON THE DUEL (${this.scoreBot} - ${this.scorePlayer})`, true, '#ff4444');
      this.audio.playRoundLost();
    }
  }

  returnToLobby() {
    this.state = 'LOBBY';
    this.isTwoPlayer = false;
    this.opponentId = null;
    this.activePad = null;
    this.isOnQueuePad = false;
    this.controls.resetFromDeath();
    this.controls.teleport(this.map.lobbySpawn, new THREE.Vector3(0, 1.8, -120));
    this.updateStateBanner('LOBBY PRACTICE - STEP ON A DUEL PAD TO PLAY', true, '#ffffff');
    this.scorePlayer = 0;
    this.scoreBot = 0;
    this.playerHealth = 100;
    this.isPlayerAlive = true;
    this.updateHUDHealth();
    this.updateHUDScore();
    this.audio.startLobbyMusic();

    if (this.weaponSystem) {
      this.weaponSystem.resetStats();
    }

    // Stand all remote player models and bot back up
    this.bot.reset(this.map.spawnOrange);
    this.bot.mesh.rotation.x = 0;

    if (this.mpClient && this.mpClient.remotePlayers) {
      for (const rp of this.mpClient.remotePlayers.values()) {
        if (rp.group) {
          rp.group.rotation.x = 0;
          rp.group.rotation.z = 0;
          rp.group.position.y = 0.55;
        }
      }
    }
  }

  // UI Effects
  showHitmarker(isHeadshot) {
    const hm = document.getElementById('hitmarker');
    if (!hm) return;
    hm.className = `hitmarker-active ${isHeadshot ? 'headshot' : ''}`;
    setTimeout(() => {
      hm.className = '';
    }, 180);
  }

  showDamageNumber(val, isHeadshot) {
    const el = document.createElement('div');
    el.className = `floating-dmg ${isHeadshot ? 'crit' : ''}`;
    el.textContent = isHeadshot ? `${val} CRIT!` : `${val}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  showDamageVignette() {
    const vig = document.getElementById('damage-vignette');
    if (!vig) return;
    vig.style.opacity = '1.0';
    setTimeout(() => {
      vig.style.opacity = '0.0';
    }, 300);
  }

  addKillFeedEntry(killer, victim, isHeadshot) {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const entry = document.createElement('div');
    entry.className = 'kill-feed-entry';
    entry.innerHTML = `
      <span class="killer">${killer}</span>
      <span class="weapon-icon">${isHeadshot ? '🎯 [AWP HEADSHOT]' : '💥 [AWP]'}</span>
      <span class="victim">${victim}</span>
    `;
    feed.appendChild(entry);
    setTimeout(() => {
      entry.style.opacity = '0';
      setTimeout(() => entry.remove(), 500);
    }, 4000);
  }

  update(delta) {
    const playerPos = this.controls.getPosition();

    // Check Duel pads in Lobby
    if (this.state === 'LOBBY') {
      this.checkDuelPads(playerPos, delta);
    }

    // Warmup countdown
    if (this.state === 'WARMUP') {
      this.stateTimer -= delta;
      const count = Math.max(1, Math.ceil(this.stateTimer));
      const duelLabel = this.isTwoPlayer ? '1v1 PLAYER DUEL' : 'SOLO BOT DUEL';
      this.updateStateBanner(`${duelLabel} - ROUND ${this.roundNumber} STARTING IN ${count}...`, true, '#00d2ff');
      if (this.stateTimer <= 0) {
        this.startRoundActive();
      }
    }

    // Intermission between rounds
    if (this.state === 'ROUND_INTERMISSION') {
      this.stateTimer -= delta;
      const count = Math.max(1, Math.ceil(this.stateTimer));
      const isMe = (this.lastRoundWinner === 'YOU');
      const resText = isMe ? 'ROUND WON' : 'ROUND LOST';
      const resCol = isMe ? '#00ffcc' : '#ff4444';
      const targetRound = this.isTwoPlayer ? this.nextRoundNumber : (this.roundNumber + 1);
      this.updateStateBanner(`${resText}! (BLUE ${this.scorePlayer} - RED ${this.scoreBot}) • ROUND ${targetRound} IN ${count}...`, true, resCol);

      if (this.stateTimer <= 0) {
        if (this.isTwoPlayer) {
          this.setupNextTwoPlayerRound(this.nextRoundNumber);
        } else {
          this.roundNumber++;
          this.setupRound();
        }
      }
    }

    // Active round timer
    if (this.state === 'ROUND_ACTIVE') {
      this.roundTimeRemaining -= delta;
      const timerEl = document.getElementById('round-timer');
      if (timerEl) {
        timerEl.textContent = `0:${Math.max(0, Math.ceil(this.roundTimeRemaining)).toString().padStart(2, '0')}`;
      }

      // Round timeout (Draw) -> Move to next round
      if (this.roundTimeRemaining <= 0) {
        this.state = 'ROUND_INTERMISSION';
        this.stateTimer = 3.0;
        this.lastRoundWinner = 'DRAW';
        this.updateStateBanner(`TIME EXPIRED - ROUND DRAW! • NEXT ROUND IN 3...`, true, '#ffffff');
        return;
      }

      // Update AI bot only in Solo Bot mode
      if (!this.isTwoPlayer && this.bot.isAlive) {
        this.bot.update(delta, playerPos, this.state, (dmg, isHead) => {
          this.onPlayerDamaged(dmg, isHead);
        });
      }
    }

    // Match Victory delay -> return to lobby
    if (this.state === 'MATCH_VICTORY') {
      this.stateTimer -= delta;
      if (this.stateTimer <= 0) {
        this.returnToLobby();
      }
    }
  }
}
