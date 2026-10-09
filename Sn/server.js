// server.js - Full-Featured Real-Time WebSocket & Static Game Server for SNIPER DUELS
const http = require('http');
const fs = require('fs');
const path = require('path');
let WebSocketServer = null;
try {
  WebSocketServer = require('./vendor/ws').WebSocketServer;
} catch (e1) {
  try {
    WebSocketServer = require('ws').WebSocketServer;
  } catch (e2) {
    console.warn('[Server] WebSocketServer not available:', e2.message);
  }
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json'
};

// 1. Static HTTP Request Handler
function requestHandler(req, res) {
  let reqPath = req.url.split('?')[0];

  // Cloud Healthchecks
  if (reqPath === '/health' || reqPath === '/healthz' || reqPath === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }

  if (reqPath === '/') reqPath = '/index.html';

  const filePath = path.join(__dirname, reqPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`500 Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(content, 'utf-8');
    }
  });
}

// 2. HTTP Server instance (binds PORT for Wasmer, Docker & Cloud environments)
const PORT = parseInt(process.env.PORT, 10) || 3000;
const server = http.createServer(requestHandler);

// 3. Real-Time 60Hz Authoritative WebSocket Game Server
const wss = new WebSocketServer({ server });

let clients = new Map();
let nextPlayerId = 1;
let queuePlayers = new Set(); // Set of player IDs standing on the Middle 1v1 Queue Mat
let activeMatches = new Map(); // matchId -> matchData

wss.on('connection', handleConnection);

function handleConnection(ws) {
  const playerId = `player_${nextPlayerId++}`;
  const playerObj = {
    id: playerId,
    ws: ws,
    team: 'BLUE',
    health: 100,
    position: { x: 0, y: 0.55, z: -84 },
    rotation: { y: 0, pitch: 0 },
    slot: 'SNIPER',
    isAiming: false,
    isSliding: false,
    onQueuePad: false,
    matchId: null
  };

  clients.set(playerId, playerObj);
  console.log(`[WS] ${playerId} connected. Total online: ${clients.size}`);

  // Send initialization info
  ws.send(JSON.stringify({
    type: 'INIT',
    playerId: playerId,
    playerCount: clients.size,
    queueCount: queuePlayers.size
  }));

  // Notify other clients about the new player in lobby
  broadcastExcept(playerId, {
    type: 'PLAYER_JOINED',
    player: {
      id: playerId,
      position: playerObj.position,
      rotation: playerObj.rotation,
      slot: playerObj.slot
    }
  });

  // Send existing players to the newcomer
  for (const [id, other] of clients.entries()) {
    if (id !== playerId) {
      ws.send(JSON.stringify({
        type: 'PLAYER_JOINED',
        player: {
          id: other.id,
          position: other.position,
          rotation: other.rotation,
          slot: other.slot
        }
      }));
    }
  }

  // Broadcast updated player counts
  broadcast({
    type: 'SERVER_STATS',
    onlinePlayers: clients.size,
    queuePlayers: queuePlayers.size
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleClientMessage(playerId, data);
    } catch (e) {
      console.warn(`[WS] Invalid message from ${playerId}:`, e.message);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] ${playerId} disconnected.`);
    if (queuePlayers.has(playerId)) {
      queuePlayers.delete(playerId);
      broadcastQueueStatus();
    }

    // If player was in an active match, notify opponent
    if (playerObj.matchId && activeMatches.has(playerObj.matchId)) {
      const match = activeMatches.get(playerObj.matchId);
      const opponentId = match.p1 === playerId ? match.p2 : match.p1;
      const opponent = clients.get(opponentId);
      if (opponent && opponent.ws.readyState === ws.OPEN) {
        opponent.ws.send(JSON.stringify({
          type: 'MATCH_OVER',
          winnerId: opponentId,
          reason: 'OPPONENT_DISCONNECTED'
        }));
        opponent.matchId = null;
      }
      activeMatches.delete(playerObj.matchId);
    }

    clients.delete(playerId);
    broadcast({
      type: 'PLAYER_LEFT',
      playerId: playerId
    });
    broadcast({
      type: 'SERVER_STATS',
      onlinePlayers: clients.size,
      queuePlayers: queuePlayers.size
    });
  });
}

function handleClientMessage(senderId, data) {
  const player = clients.get(senderId);
  if (!player) return;

  switch (data.type) {
    // 60Hz transform sync
    case 'SYNC_TRANSFORM':
      player.position = data.position;
      player.rotation = data.rotation;
      player.slot = data.slot;
      player.isAiming = data.isAiming;
      player.isSliding = data.isSliding;

      broadcastExcept(senderId, {
        type: 'PLAYER_TRANSFORM',
        id: senderId,
        position: data.position,
        rotation: data.rotation,
        slot: data.slot,
        isAiming: data.isAiming,
        isSliding: data.isSliding
      });
      break;

    // Player steps ON the Middle 1v1 Queue Mat
    case 'QUEUE_PAD_ENTER':
      if (player.matchId) return; // already in match
      player.onQueuePad = true;
      queuePlayers.add(senderId);
      console.log(`[Queue] ${senderId} entered 1v1 Queue Mat. Players on mat: ${queuePlayers.size}`);
      checkMatchmakingQueue();
      break;

    // Player steps OFF the Middle 1v1 Queue Mat
    case 'QUEUE_PAD_LEAVE':
      player.onQueuePad = false;
      queuePlayers.delete(senderId);
      console.log(`[Queue] ${senderId} left 1v1 Queue Mat. Players on mat: ${queuePlayers.size}`);
      broadcastQueueStatus();
      break;

    // Gunshot or knife slash
    case 'FIRE_WEAPON':
      broadcastExcept(senderId, {
        type: 'REMOTE_FIRE',
        id: senderId,
        origin: data.origin,
        direction: data.direction,
        spread: data.spread,
        isAiming: data.isAiming,
        weaponType: data.weaponType
      });
      break;

    // Damage inflicted in 1v1 Duel
    case 'INFLICT_DAMAGE':
      // Cannot inflict damage inside the lobby - only in active matches
      if (!player.matchId) {
        console.log(`[Combat] Blocked damage from ${senderId}: players are in lobby.`);
        break;
      }

      const target = clients.get(data.targetId);
      if (target) {
        target.health = Math.max(0, target.health - data.damage);
        console.log(`[Combat] ${senderId} dealt ${data.damage} dmg to ${data.targetId} (Remaining HP: ${target.health})`);

        // Notify target of damage
        if (target.ws.readyState === target.ws.OPEN) {
          target.ws.send(JSON.stringify({
            type: 'DAMAGE_TAKEN',
            attackerId: senderId,
            damage: data.damage,
            isHeadshot: data.isHeadshot,
            remainingHealth: target.health
          }));
        }

        // Notify attacker of hit confirmation
        if (player.ws.readyState === player.ws.OPEN) {
          player.ws.send(JSON.stringify({
            type: 'HIT_CONFIRMED',
            targetId: data.targetId,
            damage: data.damage,
            isHeadshot: data.isHeadshot,
            remainingHealth: target.health
          }));
        }

        // Check for fatal elimination -> Advance Round or End Match
        if (target.health <= 0) {
          const matchId = player.matchId;
          const match = activeMatches.get(matchId);

          if (match) {
            match.scores[senderId] = (match.scores[senderId] || 0) + 1;
            const blueScore = match.scores[match.p1] || 0;
            const redScore = match.scores[match.p2] || 0;
            const winnerScore = match.scores[senderId];

            console.log(`[Combat] Fatal kill! ${senderId} won Round ${match.roundNumber}! Score: Blue ${blueScore} - Red ${redScore}`);

            // Check if player reached maxScore (e.g. 3 wins)
            if (winnerScore >= match.maxScore) {
              console.log(`[Match] ${senderId} won the entire duel (${winnerScore} wins)!`);

              const p1Client = clients.get(match.p1);
              const p2Client = clients.get(match.p2);

              if (p1Client && p1Client.ws.readyState === p1Client.ws.OPEN) {
                p1Client.ws.send(JSON.stringify({
                  type: 'MATCH_OVER',
                  winnerId: senderId,
                  loserId: data.targetId,
                  isHeadshot: data.isHeadshot,
                  isWinner: (senderId === match.p1),
                  scores: { blue: blueScore, red: redScore }
                }));
                p1Client.matchId = null;
                p1Client.onQueuePad = false;
              }

              if (p2Client && p2Client.ws.readyState === p2Client.ws.OPEN) {
                p2Client.ws.send(JSON.stringify({
                  type: 'MATCH_OVER',
                  winnerId: senderId,
                  loserId: data.targetId,
                  isHeadshot: data.isHeadshot,
                  isWinner: (senderId === match.p2),
                  scores: { blue: blueScore, red: redScore }
                }));
                p2Client.matchId = null;
                p2Client.onQueuePad = false;
              }

              queuePlayers.delete(match.p1);
              queuePlayers.delete(match.p2);
              activeMatches.delete(matchId);
              broadcastQueueStatus();
            } else {
              // Advance to next round!
              match.roundNumber++;
              player.health = 100;
              target.health = 100;

              const roundOverMsg = JSON.stringify({
                type: 'ROUND_OVER',
                roundWinnerId: senderId,
                roundLoserId: data.targetId,
                isHeadshot: data.isHeadshot,
                scores: { blue: blueScore, red: redScore },
                nextRoundNumber: match.roundNumber,
                maxScore: match.maxScore,
                intermissionSeconds: 3
              });

              const p1Client = clients.get(match.p1);
              const p2Client = clients.get(match.p2);
              if (p1Client && p1Client.ws.readyState === p1Client.ws.OPEN) p1Client.ws.send(roundOverMsg);
              if (p2Client && p2Client.ws.readyState === p2Client.ws.OPEN) p2Client.ws.send(roundOverMsg);
            }
          } else {
            if (player.ws.readyState === player.ws.OPEN) {
              player.ws.send(JSON.stringify({
                type: 'MATCH_OVER',
                winnerId: senderId,
                loserId: data.targetId,
                isHeadshot: data.isHeadshot,
                isWinner: true,
                scores: { blue: 1, red: 0 }
              }));
            }
            if (target.ws.readyState === target.ws.OPEN) {
              target.ws.send(JSON.stringify({
                type: 'MATCH_OVER',
                winnerId: senderId,
                loserId: data.targetId,
                isHeadshot: data.isHeadshot,
                isWinner: false,
                scores: { blue: 1, red: 0 }
              }));
            }
            player.matchId = null;
            target.matchId = null;
          }
        }
      }
      break;

    case 'VOTE_MAP':
      const currentMatch = activeMatches.get(data.matchId);
      if (currentMatch && currentMatch.state === 'MAP_VOTING') {
        currentMatch.votes[senderId] = data.mapName;
        console.log(`[Vote] ${senderId} voted for ${data.mapName} in match ${data.matchId}`);

        // Recalculate vote tallies
        const counts = { blockout: 0, poolday: 0, rooftop: 0 };
        for (const vote of Object.values(currentMatch.votes)) {
          if (counts[vote] !== undefined) counts[vote]++;
        }
        currentMatch.voteCounts = counts;

        // Broadcast updated tally to both players
        const voteUpdateMsg = JSON.stringify({
          type: 'VOTE_UPDATE',
          votes: counts,
          playerVoted: senderId,
          votedMap: data.mapName
        });
        const p1Client = clients.get(currentMatch.p1);
        const p2Client = clients.get(currentMatch.p2);
        if (p1Client?.ws.readyState === p1Client.ws.OPEN) p1Client.ws.send(voteUpdateMsg);
        if (p2Client?.ws.readyState === p2Client.ws.OPEN) p2Client.ws.send(voteUpdateMsg);

        // If BOTH players have voted, resolve immediately without waiting for remaining time!
        if (Object.keys(currentMatch.votes).length >= 2) {
          console.log(`[Vote] Both players have voted. Resolving map vote immediately!`);
          resolveMapVote(currentMatch);
        }
      }
      break;

    case 'MATCH_EXIT':
      if (player.matchId) {
        const m = activeMatches.get(player.matchId);
        if (m && m.timerInterval) clearInterval(m.timerInterval);
        activeMatches.delete(player.matchId);
        player.matchId = null;
      }
      player.onQueuePad = false;
      queuePlayers.delete(senderId);
      broadcastQueueStatus();
      break;
  }
}

// Checks if 2 players are standing on the Middle Queue Mat to launch the match!
function checkMatchmakingQueue() {
  if (queuePlayers.size < 2) {
    broadcastQueueStatus();
    return;
  }

  const queueArray = Array.from(queuePlayers);
  const p1Id = queueArray[0];
  const p2Id = queueArray[1];

  queuePlayers.delete(p1Id);
  queuePlayers.delete(p2Id);

  // Notify everyone that match is locked in with 2/2 players
  broadcast({
    type: 'QUEUE_UPDATE',
    playersOnPad: 2,
    message: 'BOTH PLAYERS DETECTED (2/2)! STARTING DUEL...'
  });

  const p1 = clients.get(p1Id);
  const p2 = clients.get(p2Id);

    if (p1 && p2 && p1.ws.readyState === p1.ws.OPEN && p2.ws.readyState === p2.ws.OPEN) {
      const matchId = `match_${Date.now()}`;
      p1.matchId = matchId;
      p2.matchId = matchId;
      p1.team = 'BLUE';
      p2.team = 'RED';
      p1.health = 100;
      p2.health = 100;

      const matchData = {
        id: matchId,
        p1: p1Id,
        p2: p2Id,
        state: 'MAP_VOTING',
        votes: {}, // playerId -> mapName ('blockout' | 'poolday' | 'rooftop')
        voteCounts: { blockout: 0, poolday: 0, rooftop: 0 },
        timer: 10,
        timerInterval: null,
        roundNumber: 1,
        maxScore: 3,
        scores: {
          [p1Id]: 0,
          [p2Id]: 0
        }
      };
      activeMatches.set(matchId, matchData);

      console.log(`[Matchmaking] 10-Second Map Voting started for ${p1Id} and ${p2Id}`);

      // Start 10-second countdown timer on server
      matchData.timerInterval = setInterval(() => {
        matchData.timer--;
        if (matchData.timer <= 0) {
          clearInterval(matchData.timerInterval);
          matchData.timerInterval = null;
          if (matchData.state === 'MAP_VOTING') {
            console.log(`[Vote] 10s voting window expired. Resolving map vote!`);
            resolveMapVote(matchData);
          }
        }
      }, 1000);

      // Send MAP_VOTE_START to both players
      const voteStartPayload1 = JSON.stringify({
        type: 'MAP_VOTE_START',
        matchId: matchId,
        opponentId: p2Id,
        myTeam: 'BLUE',
        opponentTeam: 'RED',
        duration: 10
      });
      const voteStartPayload2 = JSON.stringify({
        type: 'MAP_VOTE_START',
        matchId: matchId,
        opponentId: p1Id,
        myTeam: 'RED',
        opponentTeam: 'BLUE',
        duration: 10
      });

      p1.ws.send(voteStartPayload1);
      p2.ws.send(voteStartPayload2);
    }
}

// Resolves map vote: most voted wins; tie or 0 votes triggers random selection
function resolveMapVote(match) {
  if (match.state !== 'MAP_VOTING') return;
  match.state = 'MATCH_ACTIVE';
  if (match.timerInterval) {
    clearInterval(match.timerInterval);
    match.timerInterval = null;
  }

  const allMaps = ['blockout', 'poolday', 'rooftop'];
  const counts = match.voteCounts;

  const maxVotes = Math.max(counts.blockout, counts.poolday, counts.rooftop);
  let winningMap;
  let wasTie = false;

  if (maxVotes === 0) {
    // Neither player voted -> random selection among all 3 maps
    winningMap = allMaps[Math.floor(Math.random() * allMaps.length)];
    wasTie = true;
  } else {
    // Filter maps that tied for the top vote count
    const tiedMaps = allMaps.filter(m => counts[m] === maxVotes);
    if (tiedMaps.length === 1) {
      winningMap = tiedMaps[0];
      wasTie = false;
    } else {
      // Tie -> randomly pick among the tied maps
      winningMap = tiedMaps[Math.floor(Math.random() * tiedMaps.length)];
      wasTie = true;
    }
  }

  match.selectedMap = winningMap;
  console.log(`[Matchmaking] Map vote result: "${winningMap}" (Tally: ${JSON.stringify(counts)}, Tiebreaker: ${wasTie})`);

  const p1 = clients.get(match.p1);
  const p2 = clients.get(match.p2);

  const startMsg1 = JSON.stringify({
    type: 'MATCH_START_2P',
    matchId: match.id,
    opponentId: match.p2,
    myTeam: 'BLUE',
    opponentTeam: 'RED',
    selectedMap: winningMap,
    votes: counts,
    wasTie: wasTie,
    maxScore: match.maxScore
  });

  const startMsg2 = JSON.stringify({
    type: 'MATCH_START_2P',
    matchId: match.id,
    opponentId: match.p1,
    myTeam: 'RED',
    opponentTeam: 'BLUE',
    selectedMap: winningMap,
    votes: counts,
    wasTie: wasTie,
    maxScore: match.maxScore
  });

  if (p1 && p1.ws.readyState === p1.ws.OPEN) p1.ws.send(startMsg1);
  if (p2 && p2.ws.readyState === p2.ws.OPEN) p2.ws.send(startMsg2);

  broadcastQueueStatus();
}

function broadcastQueueStatus() {
  const count = queuePlayers.size;
  broadcast({
    type: 'QUEUE_UPDATE',
    playersOnPad: count,
    message: count === 1 ? 'WAITING FOR OPPONENT (1/2 ON PAD)...' : (count >= 2 ? 'OPPONENT DETECTED! STARTING 1v1...' : 'STAND ON PAD TO QUEUE 1v1')
  });
}

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const client of clients.values()) {
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(payload);
    }
  }
}

function broadcastExcept(excludeId, msg) {
  const payload = JSON.stringify(msg);
  for (const [id, client] of clients.entries()) {
    if (id !== excludeId && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(payload);
    }
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SNIPER DUELS Server live on http://0.0.0.0:${PORT}`);
});
