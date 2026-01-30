console.log('Game script loading...');
        
        // Game Constants
const GAME_CONFIG = {
            NUM_PLAYERS: 4,
            CARDS_PER_PLAYER: 13,
            TOTAL_ROUNDS: 5,
            TRUMP_SUIT: '♠',
            CARD_RANKS: ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'],
            CARD_SUITS: ['♠', '♣', '♥', '♦'],
        };

        // Game State
        const gameState = {
            currentRound: 1,
            gamePhase: 'setup',
            isHost: window.GAME_INIT.isHost,
            players: window.GAME_INIT.players,
            deck: [],
            playersHands: [[], [], [], []],
            currentTrickCards: [],
            leadSuit: null,
            bids: [null, null, null, null],
            tricksWon: [0, 0, 0, 0],
            selectedCard: null,
            currentPlayerIndex: 0,
            currentTrick: 0,
            leadPlayerIndex: 0,
            serverCurrentPlayerIndex: 0,
            currentPlayerName: '',
            cardLocked: false, // Lock flag to prevent throwing 2 cards
            endRoundLock: false, // Prevent duplicate endRound processing
            
            init() {
                console.log('Game initialized, isHost:', this.isHost);
                if (!this.isHost) {
                    // Non-host: show waiting message
                    document.getElementById('setup-content').innerHTML = `
                        <h1 style="font-size: 32px; margin-bottom: 10px;">⏳ Waiting for Host</h1>
                        <p style="font-size: 16px; color: #666; margin: 10px 0;">Round <span id="round-num">1</span> of 5</p>
                        <p style="font-size: 14px; color: #666; margin-bottom: 30px;">4 Players • 52 Cards • Trump: Spades ♠</p>
                        <div class="status-text">Waiting for the host to shuffle and deal cards...</div>
                        <div style="font-size: 14px; color: #999; margin-top: 30px;">📌 You'll be able to view and bid on your cards once they're dealt</div>
                    `;
                }
            },

            setupGame() {
                console.log('Setup game started, isHost:', this.isHost);
                const statusEl = document.getElementById('setup-status');
                const self = this;
                
                // Disable the button to prevent multiple clicks
                const setupBtn = document.querySelector('[onclick="gameState.setupGame()"]');
                if (setupBtn) {
                    setupBtn.disabled = true;
                    setupBtn.style.opacity = '0.5';
                }
                
                statusEl.textContent = '🔀 Shuffling and dealing cards...';
                
                // Emit dealCards event to server - server handles all card logic
                if (window.socket && this.isHost) {
                    window.socket.emit('dealCards', { 
                        roomId: window.GAME_INIT.roomId,
                        playerName: window.GAME_INIT.playerName 
                    });
                    console.log('Sent dealCards request to server');
                    
                    // Host should also wait for dealingComplete like other players
                    // The event handler in EJS will update the UI
                }
            },

            proceedToBidding() {
                console.log('Proceeding to bidding phase');
                const self = this;
                document.getElementById('setup-modal').classList.add('hidden');
                setTimeout(() => {
                    self.showBiddingPhase();
                }, 100);
            },

            createDeck() {
                this.deck = [];
                for (let suit of GAME_CONFIG.CARD_SUITS) {
                    for (let rank of GAME_CONFIG.CARD_RANKS) {
                        this.deck.push({ suit, rank });
                    }
                }
                // Shuffle
                for (let i = this.deck.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
                }
            },

            dealCards() {
                this.playersHands = [[], [], [], []];
                for (let i = 0; i < GAME_CONFIG.CARDS_PER_PLAYER; i++) {
                    for (let p = 0; p < GAME_CONFIG.NUM_PLAYERS; p++) {
                        this.playersHands[p].push(this.deck[i * GAME_CONFIG.NUM_PLAYERS + p]);
                    }
                }
                // Sort each player's hand
                for (let i = 0; i < GAME_CONFIG.NUM_PLAYERS; i++) {
                    this.sortHand(this.playersHands[i]);
                }
                console.log('Cards dealt:', this.playersHands[0].length, 'cards to player');
                
                // Emit dealt cards to server so other players know cards are dealt
                if (window.socket && this.isHost) {
                    window.socket.emit('cardsDealt', { roomId: window.GAME_INIT.roomId, playersHands: this.playersHands });
                }
            },

            sortHand(hand) {
                hand.sort((a, b) => {
                    if (a.suit === GAME_CONFIG.TRUMP_SUIT && b.suit !== GAME_CONFIG.TRUMP_SUIT) return -1;
                    if (a.suit !== GAME_CONFIG.TRUMP_SUIT && b.suit === GAME_CONFIG.TRUMP_SUIT) return 1;
                    if (a.suit === b.suit) {
                        return GAME_CONFIG.CARD_RANKS.indexOf(a.rank) - GAME_CONFIG.CARD_RANKS.indexOf(b.rank);
                    }
                    return GAME_CONFIG.CARD_SUITS.indexOf(a.suit) - GAME_CONFIG.CARD_SUITS.indexOf(b.suit);
                });
            },

            showBiddingPhase() {
                console.log('Showing bidding phase');
                this.gamePhase = 'bidding';
                this.tricksWon = [0, 0, 0, 0];
                this.bids = [null, null, null, null];
                this.currentTrick = 0;
                this.currentTrickCards = [];
                this.leadSuit = null;
                
                // Hide turn status display during bidding
                const turnDisplayEl = document.getElementById('turn-status-display');
                if (turnDisplayEl) {
                    turnDisplayEl.style.display = 'none';
                }
                
                this.renderAllCards();
                
                // Update status with bidding instructions
                const statusEl = document.getElementById('player-status');
                if (statusEl) {
                    statusEl.textContent = '📋 Enter your bid (1-13) to start the game';
                    statusEl.style.color = '#f59e0b';
                    statusEl.style.fontWeight = 'bold';
                }
                
                // Show the inline bid entry (hidden by default)
                const bidEntry = document.getElementById('bid-entry');
                if (bidEntry) {
                    bidEntry.classList.remove('hidden');
                    bidEntry.style.display = 'flex';
                    const input = document.getElementById('bid-input');
                    if (input) {
                        input.disabled = false;
                        input.value = '';
                        input.focus();
                    }
                }
                
                // Also make the Place Your Bid action button visible (legacy)
                const openBidBtn = document.getElementById('open-bid-btn');
                if (openBidBtn) {
                    openBidBtn.style.display = 'inline-block';
                }
                
                // Update bid displays
                if (this.updateBidDisplays) this.updateBidDisplays();

                console.log('Bidding phase ready');
            },

            openBiddingModal() {
                console.log('Opening bidding (legacy) - focusing inline input');
                this.focusBidInput && this.focusBidInput();
            },

            closeBiddingModal() {
                console.log('Closing bidding modal');
                const modal = document.getElementById('bid-modal');
                if (modal) {
                    modal.classList.add('hidden');
                }
                // Reset bid selection
                this.bids[0] = null;
                const bidBtn = document.getElementById('bid-btn');
                if (bidBtn) {
                    bidBtn.textContent = '✓ Submit Bid';
                }
            },

            showBidModal() {
                console.warn('showBidModal called but modal removed. Use inline bid input instead.');
            },

            selectBid(amount, event) {
                console.warn('selectBid called but modal removed; use inline input instead.');
                this.bids[0] = amount;
            },

            focusBidInput() {
                const bidEntry = document.getElementById('bid-entry');
                if (bidEntry) {
                    bidEntry.classList.remove('hidden');
                    bidEntry.style.display = 'flex';
                    const input = document.getElementById('bid-input');
                    if (input) input.focus();
                }
            },

            submitBidFromInput() {
                const input = document.getElementById('bid-input');
                const btn = document.getElementById('bid-submit-btn');
                const val = input ? parseInt(input.value, 10) : NaN;
                if (!val || val < 1 || val > 13) {
                    alert('Please enter a bid between 1 and 13');
                    if (input) input.focus();
                    return;
                }
                this.bids[0] = val;
                const bidYouEl = document.getElementById('bid-you');
                if (bidYouEl) bidYouEl.textContent = val;
                // Hide the bid entry UI for this round after submitting
                const bidEntry = document.getElementById('bid-entry');
                if (bidEntry) {
                    bidEntry.classList.add('hidden');
                    bidEntry.style.display = 'none';
                }
                const statusEl = document.getElementById('player-status');
                if (statusEl) statusEl.textContent = '⏳ Waiting for other players to bid...';

                // Show the centered waiting display
                const waitingDisplay = document.getElementById('bidding-waiting-display');
                if (waitingDisplay) {
                    waitingDisplay.style.display = 'flex';
                    waitingDisplay.textContent = '⏳ Waiting for other players to submit their bids...';
                }

                // Send bid to server
                window.socket.emit('submitBid', {
                    roomId: window.GAME_INIT.roomId,
                    playerName: window.GAME_INIT.playerName,
                    bidAmount: val
                });

                console.log('Bid sent to server:', val);
            },

            updateBidDisplays() {
                const ids = ['bid-you', 'bid-left', 'bid-top', 'bid-right'];
                // During bidding phase, bids hasn't been properly mapped to server indices yet
                // So we work with what we have
                for (let i = 0; i < 4; i++) {
                    const el = document.getElementById(ids[i]);
                    if (el) {
                        el.textContent = this.bids[i] === null ? '-' : this.bids[i];
                    }
                }
            },

            submitBid() {
                if (this.bids[0] === null) {
                    alert('Please select a bid first!');
                    return;
                }
                console.log('Bid submitted:', this.bids[0]);
                
                // Close modal
                const modal = document.getElementById('bid-modal');
                if (modal) {
                    modal.classList.add('hidden');
                }
                // Hide inline bid entry controls (if present)
                const bidEntry = document.getElementById('bid-entry');
                if (bidEntry) {
                    bidEntry.classList.add('hidden');
                    bidEntry.style.display = 'none';
                }

                // Also hide any bid buttons used in other UI flows
                const bidBtn = document.getElementById('bid-btn');
                if (bidBtn) bidBtn.style.display = 'none';
                const openBidBtn = document.getElementById('open-bid-btn');
                if (openBidBtn) openBidBtn.style.display = 'none';

                // Show waiting status
                const statusEl = document.getElementById('player-status');
                if (statusEl) statusEl.textContent = '⏳ Waiting for other players to bid...';

                // Send bid to server
                window.socket.emit('submitBid', {
                    roomId: window.GAME_INIT.roomId,
                    playerName: window.GAME_INIT.playerName,
                    bidAmount: this.bids[0]
                });

                console.log('Bid sent to server, waiting for all bids...');
            },

            startPlayingPhase() {
                console.log('Playing phase started');
                this.gamePhase = 'playing';
                this.leadPlayerIndex = 0;
                this.currentPlayerIndex = 0;
                this.serverCurrentPlayerIndex = this.serverCurrentPlayerIndex || 0;  // Use existing value if set by socket event
                // Don't overwrite currentPlayerName if it was set by the socket event
                if (!this.currentPlayerName) {
                    this.currentPlayerName = this.players[0].name;
                }
                this.currentTrickCards = [];
                this.leadSuit = null;
                
                // UNLOCK CARDS for the start of playing phase
                this.cardLocked = false;
                console.log('🔓 Cards unlocked for playing phase');
                
                // Hide the bidding waiting display
                const waitingDisplay = document.getElementById('bidding-waiting-display');
                if (waitingDisplay) {
                    waitingDisplay.style.display = 'none';
                }
                
                this.updatePlayingStatus();
                this.renderAllCards();
            },

            updatePlayingStatus() {
                const statusEl = document.getElementById('player-status');
                const turnDisplayEl = document.getElementById('turn-status-display');
                if (!statusEl || !turnDisplayEl) return;
                
                // Check if it's THIS player's turn by comparing server indices
                const isMyTurn = this.serverCurrentPlayerIndex === this.serverPlayerIndex;
                
                if (isMyTurn) {
                    // Show center display for your turn
                    turnDisplayEl.textContent = '🎴 Your Turn';
                    turnDisplayEl.className = 'turn-status-display your-turn';
                    turnDisplayEl.style.display = 'block';
                    
                    // Update bottom status
                    statusEl.textContent = 'Select a card to play';
                    statusEl.style.color = '#10b981';
                } else {
                    // Show center display for other player's turn
                    turnDisplayEl.textContent = `⏳ ${this.currentPlayerName} Playing...`;
                    turnDisplayEl.className = 'turn-status-display other-turn';
                    turnDisplayEl.style.display = 'block';
                    
                    // Update bottom status
                    statusEl.textContent = `Waiting for ${this.currentPlayerName}...`;
                    statusEl.style.color = '#fbbf24';
                }
            },

            selectCardForPlay(cardEl) {
                // Only allow current player to select cards
                // Check server indices to determine if it's THIS player's turn
                if (this.serverCurrentPlayerIndex !== this.serverPlayerIndex) {
                    console.log(`Not your turn! Current turn: player ${this.serverCurrentPlayerIndex}, You are: player ${this.serverPlayerIndex}`);
                    return;
                }
                
                const prevSelected = document.querySelector('.card.selected');
                if (prevSelected) prevSelected.classList.remove('selected');
                
                cardEl.classList.add('selected');
                
                const cardIndex = Array.from(document.querySelectorAll('.card.playable-card')).indexOf(cardEl);
                if (cardIndex !== -1 && this.playersHands[0][cardIndex]) {
                    this.selectedCard = this.playersHands[0][cardIndex];
                    
                    const playBtn = document.getElementById('play-btn');
                    if (playBtn) {
                        playBtn.style.display = 'inline-block';
                        playBtn.onclick = () => this.submitCardPlay(this.selectedCard, cardEl);
                    }
                }
            },

            getPlayableCards() {
                const hand = this.playersHands[0];
                if (!hand) return [];
                
                // If this is the first card in the trick, player can play any card
                if (this.currentTrickCards.length === 0) {
                    return hand;
                }
                
                // Get the suit of the first card played in this trick (lead suit)
                const firstCard = this.currentTrickCards[0].card;
                const leadSuit = firstCard.suit;
                
                // Get the HIGHEST rank (lowest index) card of the lead suit currently in the trick
                let highestLeadSuitRankIndex = Infinity;
                for (let trickCard of this.currentTrickCards) {
                    if (trickCard.card.suit === leadSuit) {
                        const rankIndex = GAME_CONFIG.CARD_RANKS.indexOf(trickCard.card.rank);
                        highestLeadSuitRankIndex = Math.min(highestLeadSuitRankIndex, rankIndex);
                    }
                }
                
                // Get all same suit cards in hand
                const sameSuitCards = hand.filter(c => c.suit === leadSuit);
                
                // Rule 2: Player must play a card HIGHER than ALL cards of the same suit in the trick
                // This means rankIndex < highestLeadSuitRankIndex (lower index = higher rank)
                const sameHigherCards = sameSuitCards.filter(c => {
                    const rankIndex = GAME_CONFIG.CARD_RANKS.indexOf(c.rank);
                    return rankIndex < highestLeadSuitRankIndex; // Lower index = higher rank (A is index 0)
                });
                
                // If player has cards of the same suit that are higher, MUST play one of them
                if (sameHigherCards.length > 0) {
                    return sameHigherCards;
                }
                
                // If player has same suit cards but none higher (only lower), can play any of them
                if (sameSuitCards.length > 0) {
                    return sameSuitCards;
                }
                
                // Rule 3: If no same suit cards, must play spade
                const spadeCards = hand.filter(c => c.suit === GAME_CONFIG.TRUMP_SUIT);
                if (spadeCards.length > 0) {
                    return spadeCards;
                }
                
                // Rule 4: If no spades, can play any card
                return hand;
            },

            isValidCardPlay(card) {
                const playable = this.getPlayableCards();
                return playable.some(c => c.suit === card.suit && c.rank === card.rank);
            },

            submitCardPlay(card, cardEl) {
                // Use selectedCard if card is not provided
                if (!card) {
                    card = this.selectedCard;
                }
                
                // Verify game phase is playing
                if (this.gamePhase !== 'playing') {
                    console.log('Cannot play cards during bidding phase');
                    return;
                }
                
                // Double-check it's still this player's turn (network safety)
                if (this.serverCurrentPlayerIndex !== this.serverPlayerIndex) {
                    console.log('Not your turn! Cannot play');
                    return;
                }
                
                // Check if cards are already locked (prevent throwing 2 cards)
                if (this.cardLocked) {
                    console.log('Card already played! Waiting for next trick...');
                    return;
                }
                
                if (!card) {
                    console.log('No card to play');
                    return;
                }
                
                // LOCK CARDS - prevent player from throwing another card
                this.cardLocked = true;
                console.log('🔒 Cards locked - player has played their card');
                
                // Disable all card interactions
                const cards = document.querySelectorAll('.card.playable-card');
                cards.forEach(c => {
                    c.style.pointerEvents = 'none';
                    c.style.opacity = '0.5';
                });
                
                window.socket.emit('playCard', {
                    roomId: window.GAME_INIT.roomId,
                    playerName: window.GAME_INIT.playerName,
                    card: card
                });
                
                const idx = this.playersHands[0].indexOf(card);
                if (idx !== -1) {
                    this.playersHands[0].splice(idx, 1);
                }
                
                // Clear selected state
                this.selectedCard = null;
                
                if (cardEl) {
                    cardEl.classList.remove('selected');
                } else {
                    const prevSelected = document.querySelector('.card.selected');
                    if (prevSelected) prevSelected.classList.remove('selected');
                }
                
                const playBtn = document.getElementById('play-btn');
                if (playBtn) playBtn.style.display = 'none';
                
                // Re-render cards to reflect the removal
                this.renderAllCards();
            },

            playCard() {
                if (!this.selectedCard) {
                    alert('Please select a card!');
                    return;
                }

                const card = this.selectedCard;
                const hand = this.playersHands[0];
                const idx = hand.indexOf(card);
                
                if (idx === -1) return;

                if (!this.isValidMove(card, hand)) {
                    alert('Invalid! Follow suit if possible');
                    return;
                }

                hand.splice(idx, 1);
                this.currentTrickCards.push({ playerIndex: 0, card });
                this.selectedCard = null;
                
                this.renderAllCards();
                
                if (this.currentTrickCards.length === GAME_CONFIG.NUM_PLAYERS) {
                    setTimeout(() => this.resolveTrick(), 500);
                } else {
                    setTimeout(() => this.aiPlayCards(), 300);
                }
            },

            isValidMove(card, hand) {
                if (this.currentTrickCards.length === 0) {
                    this.leadSuit = card.suit;
                    return true;
                }

                const hasSuit = hand.some(c => c.suit === this.leadSuit);
                if (hasSuit && card.suit !== this.leadSuit) {
                    return false;
                }
                return true;
            },

            aiPlayCards() {
                while (this.currentTrickCards.length < GAME_CONFIG.NUM_PLAYERS) {
                    const playerIndex = this.currentTrickCards.length;
                    const hand = this.playersHands[playerIndex];
                    if (hand.length === 0) continue;

                    let card = null;
                    if (this.currentTrickCards.length === 0) {
                        card = hand[0];
                        this.leadSuit = card.suit;
                    } else {
                        const suitCards = hand.filter(c => c.suit === this.leadSuit);
                        card = suitCards.length > 0 ? suitCards[0] : hand[0];
                    }

                    this.currentTrickCards.push({ playerIndex, card });
                    hand.splice(hand.indexOf(card), 1);
                }

                this.renderAllCards();
                setTimeout(() => this.resolveTrick(), 500);
            },

            resolveTrick() {
                let winner = this.currentTrickCards[0].playerIndex;
                let winning = this.currentTrickCards[0].card;

                for (let i = 1; i < this.currentTrickCards.length; i++) {
                    const { playerIndex, card } = this.currentTrickCards[i];
                    if (this.cardBeats(card, winning)) {
                        winning = card;
                        winner = playerIndex;
                    }
                }

                this.tricksWon[winner]++;
                this.leadPlayerIndex = winner;
                this.currentTrick++;
                this.currentTrickCards = [];
                this.leadSuit = null;

                this.renderAllCards();
                this.updateScoreboard();

                if (this.currentTrick === GAME_CONFIG.CARDS_PER_PLAYER) {
                    setTimeout(() => this.endRound(), 800);
                } else {
                    setTimeout(() => this.continuePlaying(), 800);
                }
            },

            cardBeats(card, winner) {
                if (card.suit === GAME_CONFIG.TRUMP_SUIT && winner.suit !== GAME_CONFIG.TRUMP_SUIT) return true;
                if (card.suit !== GAME_CONFIG.TRUMP_SUIT && winner.suit === GAME_CONFIG.TRUMP_SUIT) return false;
                if (card.suit === winner.suit) {
                    return GAME_CONFIG.CARD_RANKS.indexOf(card.rank) < GAME_CONFIG.CARD_RANKS.indexOf(winner.rank);
                }
                return false;
            },

            continuePlaying() {
                this.currentPlayerIndex = this.leadPlayerIndex;
                this.renderAllCards();
            },

            endRound() {
                if (this.endRoundLock) {
                    console.log('endRound: already processing, ignoring duplicate call');
                    return;
                }
                this.endRoundLock = true;
                // Calculate scores for this round using the correct scoring system:
                // - Successful Bid (tricks == bid): bid points
                // - Over Tricks (tricks > bid): bid + 0.1 per extra trick
                // - Failed Bid (tricks < bid): -bid penalty
                
                const roundScores = {}; // Store round scores for each server index
                
                for (let serverIndex = 0; serverIndex < GAME_CONFIG.NUM_PLAYERS; serverIndex++) {
                    const bid = this.bids[serverIndex];
                    const tricks = this.tricksWon[serverIndex];
                    
                    let roundScore;
                    if (tricks >= bid) {
                        // Successful bid or over tricks: bid + 0.1 per extra trick
                        roundScore = bid + (tricks - bid) * 0.1;
                    } else {
                        // Failed bid: penalty equal to the bid amount
                        roundScore = -bid;
                    }
                    
                    roundScores[serverIndex] = roundScore;
                    
                    // Find the player at this server index to update their score
                    const playerAtServerIndex = this.players.find(p => {
                        const pServerIndex = (this.players.indexOf(p) + this.serverPlayerIndex) % 4;
                        return pServerIndex === serverIndex;
                    });
                    if (playerAtServerIndex) {
                        playerAtServerIndex.totalScore += roundScore;
                    }
                }

                this.updateScoreboard();
                
                // Show ROUND scores, not total scores
                const scoreDetails = this.players.map(p => {
                    const pServerIndex = (this.players.indexOf(p) + this.serverPlayerIndex) % 4;
                    const rScore = roundScores[pServerIndex] || 0;
                    return `${p.name}: ${rScore.toFixed(1)}`;
                }).join('\n');
                
                alert(`Round ${this.currentRound} Scores:\n\n${scoreDetails}`);

                console.log(`Round ${this.currentRound} completed. Total rounds: ${GAME_CONFIG.TOTAL_ROUNDS}`);
                
                if (this.currentRound < GAME_CONFIG.TOTAL_ROUNDS) {
                    this.currentRound++;
                    console.log(`Moving to round ${this.currentRound}`);
                    document.getElementById('round-display').textContent = this.currentRound;
                    
                    // Update round number in setup modal
                    const roundNumEl = document.getElementById('round-num');
                    if (roundNumEl) {
                        roundNumEl.textContent = this.currentRound;
                    }
                    
                    // Reset game state for new round
                    this.tricksWon = [0, 0, 0, 0];
                    this.bids = [null, null, null, null];
                    this.currentTrick = 0;
                    this.currentTrickCards = [];
                    this.leadSuit = null;
                    this.playersHands = [[], [], [], []];
                    
                    // Emit to server to start new round (server will handle card dealing)
                    if (window.socket && this.isHost) {
                        console.log('Emitting startNewRound for round', this.currentRound);
                        window.socket.emit('startNewRound', {
                            roomId: window.GAME_INIT.roomId,
                            roundNumber: this.currentRound
                        });
                    }
                    
                    // Show setup screen while waiting for cards to be dealt
                    document.getElementById('setup-modal').classList.remove('hidden');
                    document.getElementById('setup-status').textContent = '🔀 Shuffling and dealing cards...';
                    
                    // keep endRoundLock true until dealingComplete resets it
                    console.log('endRound: waiting for dealingComplete to reset endRoundLock');

                    // Don't show bidding phase yet - wait for dealingComplete event from server
                } else {
                    this.endGame();
                    this.endRoundLock = false;
                }
            },

            endGame() {
                // Sort players by total score in descending order (for ranking)
                const rankedPlayers = [...this.players].sort((a, b) => b.totalScore - a.totalScore);
                
                const finalScores = rankedPlayers
                    .map(p => `${p.name}: ${p.totalScore.toFixed(1)}`)
                    .join('\n');
                
                alert(`🏆 GAME OVER!\n\nFinal Scores:\n${finalScores}`);
                
                // Send final game data to server
                const gameEndData = {
                    roomId: window.GAME_INIT.roomId,
                    players: rankedPlayers.map(p => ({
                        name: p.name,
                        totalScore: p.totalScore,
                        avatar: p.avatar
                    }))
                };
                
                if (window.socket) {
                    window.socket.emit('gameEnded', gameEndData);
                }
                
                // Redirect to winner page after 3 seconds
                setTimeout(() => {
                    window.location.href = `/winner?roomId=${window.GAME_INIT.roomId}`;
                }, 3000);
            },

            updateScoreboard() {
                const pos = ['you', 'left', 'top', 'right'];
                // bids array is indexed by SERVER player indices (0-3)
                // players array is indexed by CLIENT player indices (rotated)
                for (let i = 0; i < GAME_CONFIG.NUM_PLAYERS; i++) {
                    // Convert server player index to client display position
                    const displayIndex = (i - this.serverPlayerIndex + 4) % 4;
                    const posName = pos[displayIndex];
                    
                    // Get player at server index i, then get their client display position
                    const serverPlayerIndex = i;
                    const clientDisplayIndex = (serverPlayerIndex - this.serverPlayerIndex + 4) % 4;
                    
                    document.getElementById(`score-${posName}`).textContent = this.players[clientDisplayIndex].totalScore.toFixed(1);
                    // Bids are indexed by server player index
                    document.getElementById(`bid-${posName}`).textContent = this.bids[serverPlayerIndex] || '-';
                    document.getElementById(`won-${posName}`).textContent = this.tricksWon[serverPlayerIndex];
                }
            },

            updatePlayerNames() {
                const pos = ['you', 'left', 'top', 'right'];
                for (let i = 0; i < GAME_CONFIG.NUM_PLAYERS; i++) {
                    const playerEl = document.getElementById(`player-${pos[i]}`);
                    if (playerEl) {
                        const nameDiv = playerEl.querySelector('.font-bold');
                        if (nameDiv) {
                            nameDiv.textContent = this.players[i].name;
                        }
                    }
                }
            },

            renderAllCards() {
                console.log('Rendering cards...');
                const pos = ['you', 'left', 'top', 'right'];
                
                // Get playable cards for current player
                const playableCards = this.getPlayableCards();
                
                for (let i = 0; i < GAME_CONFIG.NUM_PLAYERS; i++) {
                    const container = document.getElementById(`cards-display-${pos[i]}`);
                    const countEl = document.getElementById(`cards-${pos[i]}`);
                    
                    if (!container) {
                        console.error(`Container not found: cards-display-${pos[i]}`);
                        continue;
                    }
                    
                    if (countEl) {
                        countEl.textContent = this.playersHands[i].length;
                    }
                    
                    container.innerHTML = '';

                    if (i === 0) {
                        console.log('Rendering player 0 cards:', this.playersHands[i].length);
                        // Sort cards by suit, then by rank
                        const sortedCards = this.sortCardsBySuitAndRank(this.playersHands[i]);
                        sortedCards.forEach((card, idx) => {
                            const isPlayable = playableCards.some(c => c.suit === card.suit && c.rank === card.rank);
                            const el = this.createCardElement(card, idx, isPlayable);
                            container.appendChild(el);
                        });
                    } else {
                        for (let j = 0; j < this.playersHands[i].length; j++) {
                            const el = this.createCardElement(null);
                            container.appendChild(el);
                        }
                    }
                }

                // Trick cards
                const trickEl = document.getElementById('trick-cards');
                if (trickEl) {
                    trickEl.innerHTML = '';
                    this.currentTrickCards.forEach(({ playerIndex, card }) => {
                        const cardEl = this.createCardElement(card);
                        const wrap = document.createElement('div');
                        wrap.style.textAlign = 'center';
                        wrap.appendChild(cardEl);
                        const label = document.createElement('div');
                        label.style.color = 'white';
                        label.style.fontSize = '12px';
                        label.style.fontWeight = '600';
                        label.style.marginTop = '5px';
                        label.textContent = this.players[playerIndex].name.substring(0, 3);
                        wrap.appendChild(label);
                        trickEl.appendChild(wrap);
                    });
                }

                this.updateScoreboard();
                console.log('Cards rendered successfully');
            },

            sortCardsBySuitAndRank(cards) {
                return cards.sort((a, b) => {
                    // First, sort by suit
                    const suitDiff = GAME_CONFIG.CARD_SUITS.indexOf(a.suit) - GAME_CONFIG.CARD_SUITS.indexOf(b.suit);
                    if (suitDiff !== 0) {
                        return suitDiff;
                    }
                    // Then, sort by rank within the same suit
                    return GAME_CONFIG.CARD_RANKS.indexOf(a.rank) - GAME_CONFIG.CARD_RANKS.indexOf(b.rank);
                });
            },

            createCardElement(card, cardId, isPlayable = false) {
                const el = document.createElement('div');
                el.className = 'card';

                // Add class to mark player's own cards
                if (cardId !== undefined) {
                    el.classList.add('playable-card');
                    
                    const isMyTurn = this.serverCurrentPlayerIndex === this.serverPlayerIndex;
                    const inPlayingPhase = this.gamePhase === 'playing';
                    
                    // Highlight and enable only if card is playable, it's my turn, we're in playing phase, and cards aren't locked
                    if (isMyTurn && inPlayingPhase && isPlayable && !this.cardLocked) {
                        // Playable card - allow click and hover
                        el.style.cursor = 'pointer';
                        el.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.6)';
                        el.style.border = '3px solid #10b981';
                    } else if (isMyTurn && inPlayingPhase && !isPlayable) {
                        // Not playable - disable interaction
                        el.style.cursor = 'not-allowed';
                        el.style.pointerEvents = 'none';
                        el.style.opacity = '0.5';
                    } else if (this.cardLocked && isMyTurn && inPlayingPhase) {
                        // Card already played - lock it with visual feedback
                        el.style.cursor = 'not-allowed';
                        el.style.pointerEvents = 'none';
                        el.style.opacity = '0.4';
                    } else {
                        // Not my turn or not in playing phase
                        el.style.cursor = 'default';
                        el.style.pointerEvents = 'none';
                    }
                }
                
                if (!card) {
                    // Back
                    const back = document.createElement('div');
                    back.style.width = '100%';
                    back.style.height = '100%';
                    back.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                    back.style.borderRadius = '8px';
                    back.style.display = 'flex';
                    back.style.alignItems = 'center';
                    back.style.justifyContent = 'center';
                    back.style.border = '2px solid #4a5568';
                    back.innerHTML = '<div style="color: white; font-size: 24px; font-weight: bold; opacity: 0.5;">L</div>';
                    el.appendChild(back);
                } else {
                    // Front - with rank in opposite corners
                    const front = document.createElement('div');
                    front.style.width = '100%';
                    front.style.height = '100%';
                    front.style.background = 'white';
                    front.style.border = '2px solid #333';
                    front.style.borderRadius = '8px';
                    front.style.display = 'flex';
                    front.style.alignItems = 'center';
                    front.style.justifyContent = 'center';
                    front.style.padding = '3px 2px';
                    front.style.position = 'relative';
                    
                    const isRed = card.suit === '♥' || card.suit === '♦';
                    const col = isRed ? '#dc2626' : '#1f2937';
                    
                    // Top-left corner
                    const topLeft = document.createElement('div');
                    topLeft.style.position = 'absolute';
                    topLeft.style.top = '2px';
                    topLeft.style.left = '2px';
                    topLeft.style.textAlign = 'center';
                    topLeft.style.lineHeight = '1.2';
                    topLeft.innerHTML = `<div style="color: ${col}; font-weight: bold; font-size: 12px;">${card.rank}</div><div style="color: ${isRed ? '#dc2626' : '#000'}; font-size: 14px;">${card.suit}</div>`;
                    front.appendChild(topLeft);
                    
                    // Center suit (large)
                    const center = document.createElement('div');
                    center.style.fontSize = '28px';
                    center.style.color = isRed ? '#dc2626' : '#000';
                    center.style.display = 'flex';
                    center.style.alignItems = 'center';
                    center.style.justifyContent = 'center';
                    center.textContent = card.suit;
                    front.appendChild(center);
                    
                    // Bottom-right corner (rotated 180 degrees)
                    const bottomRight = document.createElement('div');
                    bottomRight.style.position = 'absolute';
                    bottomRight.style.bottom = '2px';
                    bottomRight.style.right = '2px';
                    bottomRight.style.textAlign = 'center';
                    bottomRight.style.lineHeight = '1.2';
                    bottomRight.style.transform = 'rotate(180deg)';
                    bottomRight.innerHTML = `<div style="color: ${col}; font-weight: bold; font-size: 12px;">${card.rank}</div><div style="color: ${isRed ? '#dc2626' : '#000'}; font-size: 14px;">${card.suit}</div>`;
                    front.appendChild(bottomRight);
                    
                    el.appendChild(front);

                    if (cardId !== undefined) {
                        // Only attach click handler for playable cards
                        const isMyTurn = this.serverCurrentPlayerIndex === this.serverPlayerIndex;
                        
                        // Check if cards are locked (prevent throwing 2 cards)
                        if (isMyTurn && this.gamePhase === 'playing' && isPlayable && !this.cardLocked) {
                            el.onclick = () => this.submitCardPlay(card, el);
                        } else {
                            // Disable interaction for non-playable cards or locked cards
                            el.style.pointerEvents = 'none';
                        }
                    }
                }
                
                return el;
            },

            openMenu() {
                alert('Menu - Coming soon!');
            },

            toggleReactionMenu() {
                const reactionMenu = document.getElementById('reaction-menu');
                if (reactionMenu) {
                    reactionMenu.classList.toggle('active');
                    
                    // Close menu when clicking outside
                    const closeMenu = (e) => {
                        if (!e.target.closest('.reaction-container')) {
                            reactionMenu.classList.remove('active');
                            document.removeEventListener('click', closeMenu);
                        }
                    };
                    
                    if (reactionMenu.classList.contains('active')) {
                        document.addEventListener('click', closeMenu);
                    }
                }
            },

            sendReaction(emoji) {
                // Show reaction above current player's cards
                this.showFloatingReaction(emoji, document.getElementById('cards-display-you'));
                
                // Send reaction to other players
                if (window.socket) {
                    window.socket.emit('playerReaction', {
                        roomId: window.GAME_INIT.roomId,
                        playerName: window.GAME_INIT.playerName,
                        emoji: emoji
                    });
                }
            },

            showFloatingReaction(emoji, targetElement) {
                const reaction = document.createElement('div');
                reaction.className = 'floating-reaction';
                reaction.textContent = emoji;
                
                const rect = targetElement.getBoundingClientRect();
                
                // Generate random X position within the card display area
                const randomX = Math.random() * (rect.width - 40) + rect.left;
                // Start above the cards
                const startY = rect.top - 50;
                
                reaction.style.left = randomX + 'px';
                reaction.style.top = startY + 'px';
                
                document.body.appendChild(reaction);
                
                // Remove after animation
                setTimeout(() => {
                    reaction.remove();
                }, 2000);
            },

            toggleChat() {
                const chatWindow = document.getElementById('chat-window');
                const badge = document.getElementById('chat-badge');
                if (chatWindow) {
                    chatWindow.classList.toggle('hidden');
                    if (!chatWindow.classList.contains('hidden')) {
                        // Chat is now open - hide the badge
                        if (badge) {
                            badge.classList.remove('show');
                        }
                        // Focus on input when chat opens
                        setTimeout(() => {
                            document.getElementById('chat-input').focus();
                        }, 100);
                    }
                }
            },

            sendChatMessage() {
                console.log('[CHAT] sendChatMessage() called');
                
                const input = document.getElementById('chat-input');
                if (!input) {
                    console.error('[CHAT] Chat input element not found');
                    return;
                }
                
                const message = input.value.trim();
                console.log('[CHAT] Message value:', message);
                
                if (!message) {
                    console.log('[CHAT] Message is empty, not sending');
                    return;
                }
                
                console.log('[CHAT] Sending message:', message);
                console.log('[CHAT] RoomId:', window.GAME_INIT.roomId);
                console.log('[CHAT] PlayerName:', window.GAME_INIT.playerName);
                console.log('[CHAT] Socket object:', window.socket);
                console.log('[CHAT] Socket ID:', window.socket?.id);
                
                // Add message to local chat
                this.addChatMessage(window.GAME_INIT.playerName, message, true);
                
                // Send to server
                if (window.socket) {
                    console.log('[CHAT] Emitting gameChat event');
                    window.socket.emit('gameChat', {
                        roomId: window.GAME_INIT.roomId,
                        playerName: window.GAME_INIT.playerName,
                        message: message
                    });
                    console.log('[CHAT] Message emitted to server');
                } else {
                    console.error('[CHAT] Socket object is null/undefined');
                }
                
                input.value = '';
            },

            addChatMessage(playerName, message, isOwn = false) {
                const chatMessages = document.getElementById('chat-messages');
                const messageEl = document.createElement('div');
                messageEl.className = 'chat-message ' + (isOwn ? 'own' : 'other');
                
                const playerEl = document.createElement('div');
                playerEl.className = 'chat-message-player';
                playerEl.textContent = playerName;
                
                const textEl = document.createElement('div');
                textEl.textContent = message;
                
                messageEl.appendChild(playerEl);
                messageEl.appendChild(textEl);
                chatMessages.appendChild(messageEl);
                
                // Show badge if chat is closed and message is from another player
                if (!isOwn) {
                    const chatWindow = document.getElementById('chat-window');
                    if (chatWindow && chatWindow.classList.contains('hidden')) {
                        const badge = document.getElementById('chat-badge');
                        if (badge) {
                            badge.classList.add('show');
                        }
                    }
                }
                
                // Scroll to bottom
                setTimeout(() => {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }, 0);
            },

            initChatListener() {
                const chatInput = document.getElementById('chat-input');
                if (chatInput) {
                    chatInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            this.sendChatMessage();
                        }
                    });
                }

                // Close chat when clicking outside
                document.addEventListener('click', (e) => {
                    const chatWindow = document.getElementById('chat-window');
                    const chatIcon = document.querySelector('.chat-icon');
                    
                    if (chatWindow && !chatWindow.classList.contains('hidden')) {
                        // Check if click is outside both chat window and chat icon
                        if (!chatWindow.contains(e.target) && !chatIcon.contains(e.target)) {
                            this.toggleChat();
                        }
                    }
                });
            }
        };

        // Make gameState global for socket listeners
        window.gameState = gameState;

        // Start game on load
        window.addEventListener('load', () => {
            console.log('Page loaded, initializing game');
            gameState.init();
            gameState.initChatListener();
        });