const socket = io();

const roomData = JSON.parse(sessionStorage.getItem("roomData"));
const urlParams = new URLSearchParams(window.location.search);
const replayParam = urlParams.get('replay');

// Handle replay mode - rejoin room from winner page
if (replayParam === 'true' && roomData) {
    console.log('Entering replay mode for room:', roomData.roomId);
}

if (!roomData) {
    window.location.href = "/";
}

let isHost = false;
let currentPlayers = [];
let currentSocketId = null;
let localPlayerName = null;

document.getElementById("roomCode").innerText = roomData.roomId;

// Store socket ID when connected
socket.on("connect", () => {
    currentSocketId = socket.id;
    console.log('Connected with socket ID:', currentSocketId);
    
    // If in replay mode, request game reset
    if (replayParam === 'true' && roomData) {
        console.log('Requesting game reset for replay');
        socket.emit('replayGame', { roomId: roomData.roomId });
    }
});

// Listen for game reset for replay
socket.on('gameResetForReplay', (data) => {
    console.log('Game has been reset for replay:', data);
    // Clear the replay param so we don't reset again on refresh
    window.history.replaceState({}, document.title, `/waiting-room`);
});

// Rejoin the room with current socket (helps after redirect/new connection)
const localPlayer = JSON.parse(sessionStorage.getItem('localPlayer') || 'null');
if (localPlayer && localPlayer.name) {
    localPlayerName = localPlayer.name;
    socket.emit('rejoinRoom', { roomId: roomData.roomId, name: localPlayer.name, avatar: localPlayer.avatar });
} else {
    // if no localPlayer info, attempt to rejoin using first player in roomData
    const fallback = (roomData.players && roomData.players[0]) || null;
    if (fallback) {
        localPlayerName = fallback.name;
        socket.emit('rejoinRoom', { roomId: roomData.roomId, name: fallback.name, avatar: fallback.avatar });
    }
}

// Listen for player updates
socket.on("updatePlayers", (players) => {
    console.log("Players updated from server:", players);
    console.log("Local player name:", localPlayerName);
    currentPlayers = players;
    
    // Check if current user is host - find the player with matching name AND ensure isHost flag exists
    isHost = players.some(p => {
        const isMatch = p.name === localPlayerName;
        console.log(`Checking player ${p.name}: isHost=${p.isHost}, localName=${localPlayerName}, isMatch=${isMatch}`);
        return p.isHost === true && isMatch;  // Explicitly check for true
    });
    
    // If not found in server response, check the initial roomData (has the original isHost flags)
    if (!isHost && roomData.players) {
        isHost = roomData.players.some(p => p.name === localPlayerName && p.isHost === true);
        console.log("Fallback check from roomData - isHost:", isHost);
    }
    
    console.log("Is current user host?", isHost);
    
    updatePlayerCards(players);
    document.getElementById("playerCount").innerText = `(${players.length}/${roomData.maxPlayers || 4})`;
    
    // Enable/disable start button
    updateStartButtonState(players);
});

socket.on("errorMsg", (msg) => {
    console.error("Error:", msg);
    alert(msg);
});

// system messages (join/create notifications)
socket.on('systemMessage', (text) => {
    const chatMessages = document.getElementById('chatMessages');
    const sysDiv = document.createElement('div');
    sysDiv.className = 'chat-message mb-3 text-center';
    sysDiv.innerHTML = `<div class="inline-block bg-gray-200 px-3 py-1 rounded-full text-xs text-gray-600">${text}</div>`;
    chatMessages.appendChild(sysDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Listen for game start event
socket.on('gameStarted', () => {
    console.log('Game is starting, redirecting to game room...');
    sessionStorage.setItem('gameStarted', 'true');
    const roomId = roomData.roomId;
    const playerName = localPlayerName;
    setTimeout(() => {
        window.location.href = `/game-room?roomId=${roomId}&playerName=${encodeURIComponent(playerName)}`;
    }, 500);
});

// incoming chat messages
socket.on('chatMessage', ({ name, text }) => {
    const chatMessages = document.getElementById('chatMessages');
    const isLocal = (() => {
        try { const lp = JSON.parse(sessionStorage.getItem('localPlayer') || 'null'); return lp && lp.name === name; } catch(e){return false}
    })();

    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message mb-3 ' + (isLocal ? 'text-right' : '');
    messageDiv.innerHTML = `
        <div class="text-xs text-gray-500 mb-1">${isLocal ? 'You' : name}</div>
        <div class="message-bubble ${isLocal ? 'own' : ''} px-4 py-2 inline-block max-w-xs">${text}</div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

function updatePlayerCards(players) {
    const playersGrid = document.getElementById("playersGrid");
    const maxPlayers = roomData.maxPlayers || 4;
    
    // Clear existing player cards (keep empty slots)
    const playerCards = playersGrid.querySelectorAll(".player-card");
    playerCards.forEach(card => card.remove());
    
    // Add player cards
    playersGrid.innerHTML = '';

    const charEmojis = {
        warrior: '⚔️',
        mage: '🔮',
        rogue: '🗡️'
    };

    for (let i = 0; i < maxPlayers; i++) {
        const player = players[i];

        if (player) {
            const playerCard = document.createElement('div');
            playerCard.className = 'player-card rounded-xl p-4 border-2';

            if (player.isHost) {
                playerCard.classList.add('host');
                playerCard.style.borderColor = '#ffc107';
            } else {
                playerCard.style.borderColor = '#667eea';
            }

            playerCard.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <div class="text-3xl">${charEmojis[player.avatar] || '👤'}</div>
                    <span class="text-xs ${player.isHost ? 'bg-yellow-600' : 'bg-blue-600'} text-white px-2 py-1 rounded-full font-semibold">
                        ${player.isHost ? 'HOST' : 'PLAYER'}
                    </span>
                </div>
                <div class="font-semibold text-gray-800">${player.name}</div>
                <div class="text-xs text-gray-600 mt-1">${(player.avatar || '').charAt(0).toUpperCase() + (player.avatar || '').slice(1)}</div>
            `;

            playersGrid.appendChild(playerCard);
        } else {
            // empty slot
            const empty = document.createElement('div');
            empty.className = 'empty-slot rounded-xl p-4 flex items-center justify-center';
            empty.innerHTML = `
                <div class="text-center text-gray-400">
                    <div class="text-3xl mb-1">👤</div>
                    <div class="text-xs font-medium">Waiting...</div>
                </div>
            `;
            playersGrid.appendChild(empty);
        }
    }
}

function updateStartButtonState(players) {
    const startBtn = document.getElementById('startGameBtn');
    const maxPlayers = roomData.maxPlayers || 4;
    const isReady = players.length === maxPlayers && isHost;
    
    console.log(`updateStartButtonState - isHost: ${isHost}, playerCount: ${players.length}/${maxPlayers}, isReady: ${isReady}`);
    
    if (isReady) {
        console.log('Button should be ENABLED');
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';
        startBtn.textContent = '🎮 START GAME';
    } else if (isHost) {
        console.log('Button should be DISABLED (waiting for more players)');
        startBtn.disabled = true;
        startBtn.textContent = `🎮 START GAME (${players.length}/${maxPlayers})`;
    } else {
        console.log('Button should be DISABLED (not host)');
        startBtn.disabled = true;
        startBtn.textContent = `⏳ Waiting for Host to Start`;
    }
}

function copyRoomCode() {
    const roomCode = document.getElementById('roomCode').textContent;
    navigator.clipboard.writeText(roomCode);
    
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = '✓ Copied!';
    button.style.background = 'rgba(72, 187, 120, 0.3)';
    
    setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '';
    }, 2000);
}

function startGame() {
    if (!isHost) {
        alert('Only the host can start the game!');
        return;
    }
    
    if (currentPlayers.length !== (roomData.maxPlayers || 4)) {
        alert('All 4 players must be present to start the game!');
        return;
    }
    
    console.log('Starting game...');
    // Emit game start event to server
    const localPlayer = JSON.parse(sessionStorage.getItem('localPlayer') || 'null') || {};
    socket.emit('startGame', { roomId: roomData.roomId, name: localPlayer.name });
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (message) {
        // emit to server; server will broadcast back to room
        const localPlayer = JSON.parse(sessionStorage.getItem('localPlayer') || 'null') || {};
        socket.emit('chatMessage', { roomId: roomData.roomId, name: localPlayer.name || localPlayer.playerName || 'Unknown', text: message });
        input.value = '';
    }
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function leaveRoom() {
    if (confirm('Are you sure you want to leave the room?')) {
        sessionStorage.removeItem("roomData");
        window.location.href = "/";
    }
}
