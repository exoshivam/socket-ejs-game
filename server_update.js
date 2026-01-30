app.get("/game-room", (req, res) => {
  const roomId = req.query.roomId || '';
  const playerName = req.query.playerName || '';
  const room = rooms[roomId.trim().toUpperCase()];

  if (!room || !room.players || room.players.length === 0) {
    return res.status(400).send('Room not found or empty');
  }

  // Get players from the room (filter out disconnected players)
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
