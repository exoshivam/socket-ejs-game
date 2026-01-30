const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);


const PORT = process.env.PORT || 3000;

// Set EJS as the template engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "view"));

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Routes
app.get("/", (req, res) => {
  res.render("index");
});

app.get("/waiting-room", (req, res) => {
  res.render("waiting-room");
});

app.get("/winner", (req, res) => {
  const roomId = req.query.roomId || '';
  const cleanRoomId = roomId.trim().toUpperCase();
  const room = rooms[cleanRoomId];

  if (!room || !room.finalResults) {
    // Fallback if results not found, show default winner page
    return res.render("winner", {
      rankedPlayers: [],
      roomId: cleanRoomId,
      gameTime: "N/A",
      cardsPlayed: "N/A",
      yourWins: "N/A"
    });
  }

  // Prepare player data for display
  const rankedPlayers = (room.finalResults.rankedPlayers || []).map(p => ({
    name: p.name,
    avatar: p.avatar || '👤',
    totalScore: p.totalScore || 0
  }));

  res.render("winner", {
    rankedPlayers: rankedPlayers,
    roomId: cleanRoomId,
    gameTime: "~15 min",
    cardsPlayed: "260",
    yourWins: "0"
  });
});

app.get("/game-room", (req, res) => {
  const roomId = req.query.roomId || '';
  const playerName = req.query.playerName || '';
  const room = rooms[roomId.trim().toUpperCase()];

  if (!room || !room.players || room.players.length === 0) {
    return res.status(400).send('Room not found or empty');
  }

  // Get players from the room (filter out disconnected players for display)
  const connectedPlayers = room.players.filter(p => p.connected !== false);
  
  // Build players array, setting isHost for the current player
  const players = connectedPlayers.map(p => ({
    name: p.name,
    avatar: p.avatar || '👤',
    totalScore: p.totalScore || 0,
    isHost: p.isHost === true,
    id: p.id
  }));

  // Ensure we have exactly 4 players (pad with placeholders if needed)
  while (players.length < 4) {
    players.push({ name: 'Waiting...', avatar: '⏳', totalScore: 0, isHost: false });
  }

  const currentPlayerIsHost = players.some(p => p.name === playerName && p.isHost);
  
  res.render("game-room", { players, currentPlayerIsHost });
});

const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // CREATE ROOM
  socket.on("createRoom", ({ name, avatar, gameType, gameName, gameRules, maxPlayers, type }) => {
    const roomId = generateRoomCode();

    rooms[roomId] = {
      roomId,
      gameType: gameType || 'classic',
      type: type || 'public',
      ...(gameType === 'custom' && {
        gameName,
        gameRules,
        maxPlayers: maxPlayers || 4
      }),
      maxPlayers: maxPlayers || 4,
      players: [
        {
          id: socket.id,
          name,
          avatar,
          isHost: true,
          connected: true
        }
      ]
    };

    socket.join(roomId);

    console.log("Room created:", roomId, "with game type:", gameType);
    console.log("All rooms:", Object.keys(rooms));
    console.log("Host player created:", rooms[roomId].players[0]);

    socket.emit("roomJoined", rooms[roomId]);
    io.to(roomId).emit("updatePlayers", rooms[roomId].players);
    // announce to room
    io.to(roomId).emit("systemMessage", `${name} created the room`);
  });


  // JOIN ROOM (PRIVATE)
  socket.on("joinRoom", ({ roomId, name, avatar }) => {
    const cleanRoomId = roomId.trim().toUpperCase();
    console.log("Join attempt - Looking for room:", cleanRoomId);
    console.log("Available rooms:", Object.keys(rooms));
    
    const room = rooms[cleanRoomId];

    if (!room) {
      console.log("Room not found:", cleanRoomId);
      socket.emit("errorMsg", "Room not found. Available rooms: " + Object.keys(rooms).join(", "));
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit("errorMsg", "Room full");
      return;
    }

    room.players.push({ id: socket.id, name, avatar, isHost: false, connected: true });
    socket.join(cleanRoomId);

    // console.log("Player joined room:",name," ", cleanRoomId, "Players count:", room.players.length);
    socket.emit("roomJoined", room);
    io.to(cleanRoomId).emit("updatePlayers", room.players);
    // system chat message for joins
    io.to(cleanRoomId).emit("systemMessage", `${name} has joined the room`);
  });

  // REJOIN (used when client reloads / creates room and gets a new socket id)
  socket.on("rejoinRoom", ({ roomId, name, avatar }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const room = rooms[cleanRoomId];
    if (!room) {
      socket.emit("errorMsg", "Room not found");
      return;
    }

    // Try to find existing player by name
    let player = room.players.find(p => p.name === name);
    if (player) {
      // update id, avatar and mark connected
      const originalIsHost = player.isHost;
      console.log("Player rejoining - BEFORE:", player);
      player.id = socket.id;
      player.avatar = avatar;
      player.isHost = originalIsHost;  // Explicitly preserve isHost
      player.connected = true;
      console.log("Player rejoining - AFTER:", player);
    } else {
      // add new player if not found
      player = { id: socket.id, name, avatar, isHost: false, connected: true };
      room.players.push(player);
      console.log("New player added:", player);
    }

    socket.join(cleanRoomId);
    console.log("Player rejoined room:", name, cleanRoomId);
    socket.emit("roomJoined", room);
    io.to(cleanRoomId).emit("updatePlayers", room.players);
    io.to(cleanRoomId).emit("systemMessage", `${name} has joined the room`);
  });

  // CHAT MESSAGE - broadcast to room
  socket.on("chatMessage", ({ roomId, name, text }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const room = rooms[cleanRoomId];
    if (!room) {
      socket.emit('errorMsg', 'Room not found');
      return;
    }
    // broadcast chat message to room
    io.to(cleanRoomId).emit('chatMessage', { name, text });
  });

  // QUICK PLAY (PUBLIC ROOM)
  socket.on("quickPlay", ({ name, avatar }) => {
    let room = Object.values(rooms).find(
      r => r.type === "public" && r.players.length < r.maxPlayers
    );

    if (!room) {
      const roomId = generateRoomCode();
      rooms[roomId] = {
        roomId,
        type: "public",
        password: null,
        players: [],
        maxPlayers: 4,
      };
      room = rooms[roomId];
    }

    room.players.push({ id: socket.id, name, avatar });
    socket.join(room.roomId);

    socket.emit("roomJoined", room);
    io.to(room.roomId).emit("updatePlayers", room.players);
  });

  // START GAME
  socket.on("startGame", ({ roomId, name }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const room = rooms[cleanRoomId];
    
    if (!room) {
      socket.emit('errorMsg', 'Room not found');
      return;
    }

    // Check if player is host (match by socket id first)
      let playerById = room.players.find(p => p.id === socket.id);
      const currentHost = room.players.find(p => p.isHost === true);

      let player = null;

      // If the socket id matches a host entry, use it
      if (playerById && playerById.isHost === true) {
        player = playerById;
      }

      // If not, but there's a host entry and the supplied name matches the host, update its id
      if (!player && currentHost && name && currentHost.name === name) {
        currentHost.id = socket.id;
        player = currentHost;
        console.log(`startGame: updated host id by name to ${socket.id}`);
      }

      // As a last resort, if the socket id matches a non-host entry but the name matches the host, update host id
      if (!player && playerById && name && currentHost && currentHost.name === name) {
        currentHost.id = socket.id;
        player = currentHost;
        console.log(`startGame: reconciled host from non-host socket and updated id to ${socket.id}`);
      }

      if (!player || !player.isHost) {
        socket.emit('errorMsg', 'Only the host can start the game');
        return;
      }

    // Check if all 4 players are present
    if (room.players.length !== 4) {
      socket.emit('errorMsg', 'All 4 players must be present to start');
      return;
    }

    console.log(`Game starting in room ${cleanRoomId}:`, room.players.map(p => p.name));
    
    // Broadcast game start to all players in the room
    io.to(cleanRoomId).emit('gameStarted');
  });

  // CARDS DEALT
  // CREATE DECK (server-side)
  function createDeck() {
    const CARD_RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
    const CARD_SUITS = ['♠', '♣', '♥', '♦'];
    const deck = [];
    for (let suit of CARD_SUITS) {
      for (let rank of CARD_RANKS) {
        deck.push({ suit, rank });
      }
    }
    return deck;
  }

  // SHUFFLE DECK (Fisher-Yates)
  function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // DEAL CARDS - Server-side only
  socket.on('dealCards', ({ roomId, playerName }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const room = rooms[cleanRoomId];
    
    if (!room) {
      console.log('dealCards: Room not found:', cleanRoomId);
      socket.emit('errorMsg', 'Room not found');
      return;
    }

    // Verify only host can deal
    let hostPlayer = room.players.find(p => p.isHost && p.id === socket.id);
    
    // Fallback: if socket ID doesn't match, try to find host by name
    if (!hostPlayer && playerName) {
      hostPlayer = room.players.find(p => p.isHost && p.name === playerName);
      if (hostPlayer) {
        hostPlayer.id = socket.id;  // Update socket ID for this new connection
        console.log(`dealCards: Updated host socket ID from rejoin, now ${socket.id}`);
      }
    }
    
    if (!hostPlayer) {
      console.log('dealCards: Host not found or only host can deal. Sender:', socket.id, 'Players:', room.players.map(p => ({ name: p.name, isHost: p.isHost, id: p.id })));
      socket.emit('errorMsg', 'Only the host can deal cards');
      return;
    }

    console.log(`Dealing cards in room ${cleanRoomId}...`);

    // Create, shuffle deck SERVER-SIDE
    let deck = createDeck();
    deck = shuffleDeck(deck);
    console.log(`Deck shuffled: ${deck.length} cards`);

    // Deal 13 cards to each player
    const playerHands = {};
    const connectedPlayers = room.players.filter(p => p.connected !== false);
    console.log(`Dealing to ${connectedPlayers.length} connected players`);
    
    for (let playerIdx = 0; playerIdx < connectedPlayers.length; playerIdx++) {
      const player = connectedPlayers[playerIdx];
      playerHands[player.id] = [];
      
      for (let cardIdx = 0; cardIdx < 13; cardIdx++) {
        playerHands[player.id].push(deck[playerIdx + cardIdx * 4]);
      }
      console.log(`Player ${player.name} (${player.id}): ${playerHands[player.id].length} cards dealt`);
    }

    // Store hands in room (server-side only)
    room.playerHands = playerHands;

    // Send EACH player ONLY their own cards
    connectedPlayers.forEach((player) => {
      if (player.id) {
        console.log(`Sending cards to player ${player.name} (${player.id})`);
        io.to(player.id).emit('cardsDealtToMe', { 
          hand: playerHands[player.id],
          message: 'Your cards have been dealt' 
        });
      }
    });

    // Notify all players that dealing is complete
    io.to(cleanRoomId).emit('dealingComplete', { 
      playerCount: connectedPlayers.length 
    });

    console.log(`Cards dealt successfully in room ${cleanRoomId}. Each player received 13 unique cards.`);
  });

  // REMOVE OLD cardsDealt HANDLER - replaced by dealCards
  // socket.on('cardsDealt', ...) - DELETED

  // JOIN GAME ROOM (when player navigates to game-room page)
  socket.on('joinGameRoom', ({ roomId, playerName }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const room = rooms[cleanRoomId];
    
    if (!room) {
      console.log(`joinGameRoom: Room ${cleanRoomId} not found`);
      socket.emit('errorMsg', 'Room not found');
      return;
    }
    
    // Find and update the player's socket ID (they may have a new socket from page navigation)
    const player = room.players.find(p => p.name === playerName);
    if (player) {
      player.id = socket.id;
      player.connected = true;
      console.log(`joinGameRoom: Updated player ${playerName} socket ID to ${socket.id}`);
    }
    
    // Join socket to the room so they receive broadcasts
    socket.join(cleanRoomId);
    console.log(`Socket ${socket.id} joined game room ${cleanRoomId} as ${playerName}`);
  });

  // GAME CHAT - Broadcast chat messages to all players in the room
  socket.on('gameChat', ({ roomId, playerName, message }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const room = rooms[cleanRoomId];
    
    if (!room) {
      console.log('gameChat: Room not found:', cleanRoomId);
      return;
    }
    
    console.log(`[CHAT] ${playerName} in room ${cleanRoomId}: ${message}`);
    
    // Broadcast message to other players in the room (exclude sender)
    socket.broadcast.to(cleanRoomId).emit('receiveChatMessage', {
      playerName: playerName,
      message: message,
      timestamp: new Date().toLocaleTimeString()
    });
  });

  // PLAYER REACTION - Broadcast reactions to all players in the room
  socket.on('playerReaction', ({ roomId, playerName, emoji }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const room = rooms[cleanRoomId];
    
    if (!room) {
      console.log('playerReaction: Room not found:', cleanRoomId);
      return;
    }
    
    console.log(`[REACTION] ${playerName} in room ${cleanRoomId}: ${emoji}`);
    
    // Broadcast reaction to all players in the room
    io.to(cleanRoomId).emit('receiveReaction', {
      playerName: playerName,
      emoji: emoji
    });
  });
  // BIDDING - Handle player bid submission
  socket.on('submitBid', ({ roomId, playerName, bidAmount }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const room = rooms[cleanRoomId];
    
    if (!room) {
      console.log('submitBid: Room not found:', cleanRoomId);
      return;
    }
    
    // Verify bid is valid
    if (!bidAmount || bidAmount < 1 || bidAmount > 13) {
      socket.emit('errorMsg', 'Invalid bid. Must be between 1 and 13');
      return;
    }
    
    // Initialize bids object and bidding state if not exists
    if (!room.bids) {
      room.bids = {};
    }
    
    if (!room.biddingState) {
      room.biddingState = {
        inProgress: true,
        startTime: Date.now(),
        submittedPlayers: new Set()
      };
    }
    
    // Check if bidding is still in progress for this round
    if (!room.biddingState.inProgress) {
      socket.emit('errorMsg', 'Bidding phase has ended. Game already started.');
      return;
    }
    
    // Check if player has already submitted a bid this round
    if (room.bids[playerName] !== undefined && room.biddingState.submittedPlayers.has(playerName)) {
      console.log(`[BID UPDATE] ${playerName} updated their bid from ${room.bids[playerName]} to ${bidAmount}`);
      // Allow players to update their bid during bidding phase
    } else {
      console.log(`[BID] ${playerName} in room ${cleanRoomId} bid: ${bidAmount}`);
    }
    
    // Store the bid for this player
    room.bids[playerName] = bidAmount;
    room.biddingState.submittedPlayers.add(playerName);
    
    const bidsCount = room.biddingState.submittedPlayers.size;
    const totalPlayers = room.players.filter(p => p.connected !== false).length;
    
    console.log(`[BID STATUS] ${playerName} submitted. Bids received: ${bidsCount}/${totalPlayers} connected players`);
    
    // Broadcast bid count update to all players
    io.to(cleanRoomId).emit('bidSubmittedUpdate', {
      playerName: playerName,
      bidAmount: bidAmount,
      bidsReceivedCount: bidsCount,
      totalPlayersNeeded: totalPlayers
    });
    
    // Check if all CONNECTED players have bid
    if (bidsCount === totalPlayers) {
      console.log(`[BIDS COMPLETE] Room ${cleanRoomId} - All ${totalPlayers} players have submitted bids:`, room.bids);
      
      // Mark bidding as complete
      room.biddingState.inProgress = false;
      room.biddingState.completedAt = Date.now();
      
      // Get only connected players in order
      const connectedPlayers = room.players.filter(p => p.connected !== false);
      
      // Convert bids object to array in player order (only connected players)
      const bidsArray = connectedPlayers.map(p => room.bids[p.name] || 0);
      
      // Initialize game state for card playing
      if (!room.gameState) {
        room.gameState = {
          currentTrick: [],
          currentPlayerIndex: 0,
          leadPlayerIndex: 0,
          leadSuit: null,
          tricksWon: [0, 0, 0, 0],
          trickWinner: null
        };
      } else {
        room.gameState.currentTrick = [];
        room.gameState.currentPlayerIndex = 0;
        room.gameState.leadPlayerIndex = 0;
        room.gameState.leadSuit = null;
      }
      
      // Broadcast all bids to the room
      io.to(cleanRoomId).emit('allBidsSubmitted', {
        bids: room.bids,
        bidsArray: bidsArray,
        players: connectedPlayers.map(p => p.name)
      });
      
      // Start playing phase after 2 seconds
      setTimeout(() => {
        io.to(cleanRoomId).emit('startPlayingPhase', {
          players: connectedPlayers.map(p => p.name),
          bids: bidsArray,
          currentPlayerIndex: 0,
          currentPlayerName: connectedPlayers[0].name
        });
      }, 2000);
    }
  });

  // CARD PLAYING - Handle card play submission
  socket.on('playCard', ({ roomId, playerName, card }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const room = rooms[cleanRoomId];
    
    if (!room || !room.gameState) {
      console.log('playCard: Room or gameState not found');
      return;
    }
    
    const gs = room.gameState;
    const currentPlayer = room.players[gs.currentPlayerIndex];
    
    // Verify it's the correct player's turn
    if (currentPlayer.name !== playerName) {
      console.log(`[PLAY ERROR] ${playerName} tried to play but it's ${currentPlayer.name}'s turn`);
      return;
    }
    
    console.log(`[PLAY] ${playerName} played: ${card.rank}${card.suit}`);
    
    // First card of trick sets the lead suit
    if (gs.currentTrick.length === 0) {
      gs.leadSuit = card.suit;
    }
    
    // Add card to current trick
    gs.currentTrick.push({
      playerIndex: gs.currentPlayerIndex,
      playerName: playerName,
      card: card
    });
    
    // Broadcast the played card to all players
    io.to(cleanRoomId).emit('cardPlayed', {
      playerIndex: gs.currentPlayerIndex,
      playerName: playerName,
      card: card,
      tricksPlayed: gs.currentTrick.length
    });
    
    // Check if trick is complete (all 4 players have played)
    if (gs.currentTrick.length === 4) {
      // Determine trick winner
      const trickWinner = determineTrickWinner(gs.currentTrick, gs.leadSuit);
      gs.tricksWon[trickWinner.playerIndex]++;
      gs.trickWinner = trickWinner.playerIndex;
      gs.leadPlayerIndex = trickWinner.playerIndex;
      
      console.log(`[TRICK] Won by ${trickWinner.playerName} (index ${trickWinner.playerIndex})`);
      
      // Broadcast trick result
      io.to(cleanRoomId).emit('trickComplete', {
        winner: trickWinner.playerIndex,
        winnerName: trickWinner.playerName,
        cards: gs.currentTrick,
        tricksWon: gs.tricksWon
      });
      
      // Check if all 13 tricks are done
      if (gs.tricksWon.reduce((a, b) => a + b, 0) === 13) {
        console.log(`[ROUND COMPLETE] Tricks won:`, gs.tricksWon);
        io.to(cleanRoomId).emit('roundComplete', {
          tricksWon: gs.tricksWon,
          bids: room.bids
        });
      } else {
        // Wait 2 seconds then start next trick
        setTimeout(() => {
          gs.currentTrick = [];
          gs.currentPlayerIndex = gs.leadPlayerIndex;
          gs.leadSuit = null;
          
          io.to(cleanRoomId).emit('nextTrick', {
            currentPlayerIndex: gs.currentPlayerIndex,
            currentPlayerName: room.players[gs.currentPlayerIndex].name,
            tricksWon: gs.tricksWon
          });
        }, 2000);
      }
    } else {
      // Move to next player in cyclic order
      gs.currentPlayerIndex = (gs.currentPlayerIndex + 1) % 4;
      
      io.to(cleanRoomId).emit('nextPlayer', {
        currentPlayerIndex: gs.currentPlayerIndex,
        currentPlayerName: room.players[gs.currentPlayerIndex].name
      });
    }
  });

  // START NEW ROUND
  socket.on('startNewRound', ({ roomId, roundNumber }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const room = rooms[cleanRoomId];
    
    if (!room || !room.gameState) {
      console.log('startNewRound: Room or gameState not found');
      return;
    }
    
    const gs = room.gameState;
    // Only allow the host to start a new round
    const hostPlayer = room.players.find(p => p.isHost === true);
    if (!hostPlayer || hostPlayer.id !== socket.id) {
      console.log('startNewRound: Ignored - not sent by host', socket.id);
      return;
    }
    
    // Reset game state for new round
    gs.currentRound = roundNumber;
    gs.tricksWon = [0, 0, 0, 0];
    gs.bids = [null, null, null, null];
    gs.currentTrick = [];
    gs.currentPlayerIndex = 0;
    gs.leadPlayerIndex = 0;
    gs.leadSuit = null;
    
    // CRITICAL: Reset bidding state for the new round
    // This ensures that all players must submit NEW bids before the game continues
    room.bids = {}; // Clear all previous bids
    room.biddingState = {
      inProgress: true,
      startTime: Date.now(),
      submittedPlayers: new Set()
    };
    
    console.log(`[NEW ROUND] Round ${roundNumber} started in room ${cleanRoomId}. Dealing cards...`);
    
    // DEAL CARDS FOR NEW ROUND (same as initial game setup)
    let deck = createDeck();
    deck = shuffleDeck(deck);
    console.log(`Deck shuffled for round ${roundNumber}: ${deck.length} cards`);

    // Deal 13 cards to each player
    const playerHands = {};
    const connectedPlayers = room.players.filter(p => p.connected !== false);
    console.log(`Dealing to ${connectedPlayers.length} connected players for round ${roundNumber}`);
    
    for (let playerIdx = 0; playerIdx < connectedPlayers.length; playerIdx++) {
      const player = connectedPlayers[playerIdx];
      playerHands[player.id] = [];
      
      for (let cardIdx = 0; cardIdx < 13; cardIdx++) {
        playerHands[player.id].push(deck[playerIdx + cardIdx * 4]);
      }
      console.log(`Player ${player.name} (${player.id}): ${playerHands[player.id].length} cards dealt for round ${roundNumber}`);
    }

    // Store hands in room (server-side only)
    room.playerHands = playerHands;

    // Send EACH player ONLY their own cards
    connectedPlayers.forEach((player) => {
      if (player.id) {
        console.log(`Sending cards to player ${player.name} (${player.id}) for round ${roundNumber}`);
        io.to(player.id).emit('cardsDealtToMe', { 
          hand: playerHands[player.id],
          message: `Round ${roundNumber} cards dealt` 
        });
      }
    });

    // Notify all players that dealing is complete
    io.to(cleanRoomId).emit('dealingComplete', { 
      playerCount: connectedPlayers.length,
      roundNumber: roundNumber
    });

    console.log(`Cards dealt successfully for round ${roundNumber} in room ${cleanRoomId}. Each player received 13 unique cards.`);
  });

  // Helper function to determine trick winner
  function determineTrickWinner(trick, leadSuit) {
    const TRUMP_SUIT = '♠';
    const CARD_RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
    
    let highestCard = trick[0];
    let highestRank = CARD_RANKS.indexOf(highestCard.card.rank);
    
    for (let i = 1; i < trick.length; i++) {
      const card = trick[i].card;
      const cardRank = CARD_RANKS.indexOf(card.rank);
      
      // Trump beats non-trump
      if (card.suit === TRUMP_SUIT && highestCard.card.suit !== TRUMP_SUIT) {
        highestCard = trick[i];
        highestRank = cardRank;
      }
      // Within same suit (trump or lead), higher rank wins
      else if (card.suit === highestCard.card.suit && cardRank < highestRank) {
        highestCard = trick[i];
        highestRank = cardRank;
      }
    }
    
    return {
      playerIndex: highestCard.playerIndex,
      playerName: highestCard.playerName,
      card: highestCard.card
    };
  }

  // GAME ENDED - Receive final scores and rankings from game room
  socket.on('gameEnded', ({ roomId, players }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const room = rooms[cleanRoomId];
    
    if (!room) {
      console.log('gameEnded: Room not found:', cleanRoomId);
      return;
    }
    
    // Store final game results in the room for the winner page
    room.finalResults = {
      timestamp: new Date(),
      rankedPlayers: players,
      totalRounds: 5
    };
    
    console.log('Game ended in room', cleanRoomId);
    console.log('Final rankings:', players.map(p => `${p.name}: ${p.totalScore}`));
  });

  // REPLAY GAME - Reset game state for a new game with same players
  socket.on('replayGame', ({ roomId }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const room = rooms[cleanRoomId];
    
    if (!room) {
      console.log('replayGame: Room not found:', cleanRoomId);
      socket.emit('errorMsg', 'Room not found');
      return;
    }
    
    // Reset game-related state while keeping player info
    room.bids = {};
    room.gameState = null;
    room.playerHands = {};
    room.finalResults = null;
    room.currentRound = 1;
    
    // Reset player scores
    room.players.forEach(p => {
      p.totalScore = 0;
    });
    
    console.log('Game reset in room', cleanRoomId, 'for replay');
    
    // Notify all players in the room that game state has been reset
    io.to(cleanRoomId).emit('gameResetForReplay', {
      message: 'Game has been reset. Ready to play again!'
    });
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const initialPlayerCount = room.players.length;
      
      // Find the player who is leaving to get their name
      const leavingPlayer = room.players.find(p => p.id === socket.id);
      const playerName = leavingPlayer ? leavingPlayer.name : "Unknown";

      if (leavingPlayer) {
        // Mark player as disconnected but keep their slot to preserve isHost
        leavingPlayer.id = null;
        leavingPlayer.connected = false;
      }

      io.to(roomId).emit("updatePlayers", room.players);

      // Announce the player leaving to the room
      if (leavingPlayer) {
        io.to(roomId).emit("systemMessage", `${playerName} has left the room`);
      }

      console.log(`Room ${roomId}: ${initialPlayerCount} -> ${room.players.length} players`);

      // Only delete room if it has no players AND didn't just start (grace period)
      // Don't automatically delete rooms - let them persist
      // if (room.players.length === 0) {
      //   delete rooms[roomId];
      // }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

