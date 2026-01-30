const socket = io();


        let selectedCharacter = null;
        let selectedGameType = 'classic';

        // Socket connection status
        socket.on("connect", () => {
            console.log("Connected to server");
        });

        socket.on("disconnect", () => {
            console.log("Disconnected from server");
        });
        
        function selectCharacter(element, character) {
            document.querySelectorAll('.character-card').forEach(card => {
                card.classList.remove('selected');
            });
            element.classList.add('selected');
            selectedCharacter = character;
        }
        
        function playGame() {
    const playerName = document.getElementById('playerName').value.trim();

    if (!playerName || !selectedCharacter) {
        alert("Enter name and select character");
        return;
    }

    socket.emit("quickPlay", {
        name: playerName,
        avatar: selectedCharacter
    });
}

        
        function joinRoom() {
    const playerName = document.getElementById('playerName').value.trim();

    if (!playerName || !selectedCharacter) {
        alert("Enter name and select character");
        return;
    }

    const roomCode = prompt("Enter Room Code");
    if (!roomCode) return;

    socket.emit("joinRoom", {
        roomId: roomCode.trim().toUpperCase(), 
        name: playerName,
        avatar: selectedCharacter,
        password: null
    });

    // store local player info for waiting-room rejoin
    sessionStorage.setItem('localPlayer', JSON.stringify({ name: playerName, avatar: selectedCharacter }));
}


        // Game Type Modal Functions
        function openGameTypeModal() {
            const playerName = document.getElementById('playerName').value.trim();
            
            if (!playerName) {
                alert('Please enter your name first!');
                return;
            }

            document.getElementById('gameTypeModal').classList.add('active');
            selectedGameType = 'classic';
            document.querySelector('input[name="gameType"][value="classic"]').checked = true;
            document.getElementById('customGameSection').classList.remove('active');
        }

        function closeGameTypeModal() {
            document.getElementById('gameTypeModal').classList.remove('active');
        }

        function handleGameTypeChange() {
            selectedGameType = document.querySelector('input[name="gameType"]:checked').value;
            const customSection = document.getElementById('customGameSection');
            
            if (selectedGameType === 'custom') {
                customSection.classList.add('active');
            } else {
                customSection.classList.remove('active');
            }
        }

        function confirmGameType() {
            const playerName = document.getElementById('playerName').value.trim();

            if (selectedGameType === 'custom') {
                const customGameName = document.getElementById('customGameName').value.trim();
                const customGameRules = document.getElementById('customGameRules').value.trim();
                const customMaxPlayers = parseInt(document.getElementById('customMaxPlayers').value);

                if (!customGameName) {
                    alert('Please enter a game name!');
                    return;
                }

                if (!customGameRules) {
                    alert('Please describe the game rules!');
                    return;
                }

                if (customMaxPlayers < 2 || customMaxPlayers > 8) {
                    alert('Max players must be between 2 and 8!');
                    return;
                }

                createRoomWithGameType({
                    name: playerName,
                    gameType: 'custom',
                    gameName: customGameName,
                    gameRules: customGameRules,
                    maxPlayers: customMaxPlayers
                });
            } else {
                createRoomWithGameType({
                    name: playerName,
                    gameType: selectedGameType
                });
            }
            // Modal will be closed by createRoomWithGameType after emit
        }

        function createRoomWithGameType(gameData) {
    const playerName = document.getElementById('playerName').value.trim();

    if (!playerName || !selectedCharacter) {
        alert("Enter name and select character");
        return;
    }

    const roomData = {
        name: playerName,
        avatar: selectedCharacter,
        gameType: gameData.gameType,
        type: "public"
    };

    // Add custom game data if applicable
    if (gameData.gameType === 'custom') {
        roomData.gameName = gameData.gameName;
        roomData.gameRules = gameData.gameRules;
        roomData.maxPlayers = gameData.maxPlayers;
    }

    console.log("Emitting createRoom event with data:", roomData);
        // store local player info for waiting-room rejoin
        sessionStorage.setItem('localPlayer', JSON.stringify({ name: playerName, avatar: selectedCharacter }));
        socket.emit("createRoom", roomData);
    
    // Close modal after emitting
    closeGameTypeModal();
}


        // Close modal when clicking outside of it
        window.onclick = function(event) {
            const modal = document.getElementById('gameTypeModal');
            if (event.target == modal) {
                modal.classList.remove('active');
            }
        }

        socket.on("roomJoined", (room) => {
    console.log("Room joined:", room);
    console.log("Room ID:", room.roomId);
    
    // Show room code in alert
    alert(`Room Created Successfully!\nRoom Code: ${room.roomId}\n\nShare this code with other players to join!`);
    
    // Store room data in sessionStorage
    sessionStorage.setItem("roomData", JSON.stringify(room));
    
    // Redirect to waiting room
    window.location.href = "/waiting-room";
});

socket.on("errorMsg", (msg) => {
    console.error("Socket error:", msg);
    alert(msg);
});
