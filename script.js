/* =========================================================
   CYBER UNO MULTIPLAYER - CORE APPLICAION ENGINE
   ========================================================= */

// Firebase Configuration (Asia Server Link)
const firebaseConfig = {
    apiKey: "AIzaSyCKqsxIC2aGBR0UnejiXlIaJeKAfdW_Zp0",
    authDomain: "online-ha.firebaseapp.com",
    databaseURL: "https://online-ha-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "online-ha",
    storageBucket: "online-ha.firebasestorage.app",
    messagingSenderId: "1033988386517",
    appId: "1:1033988386517:web:e75348acd3f9765a84bc5c",
    measurementId: "G-T6GYPQT874"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// State Management Variables
let myPlayerId = "";
let myPlayerName = "";
let currentRoomId = "";
let isHost = false;
let myRole = "player"; // 'player' or 'spectator'
let roomRef = null;

// Game constants
const UNO_COLORS = ["red", "blue", "green", "yellow"];
const UNO_VALUES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Skip", "Reverse"];
const TRACKER_COLORS = ["#ff0055", "#00f0ff", "#00ff66", "#ffea00", "#a200ff", "#ff7700", "#00ffcc", "#ff00ff"];

// Utility Generators
function generateRandomId() { return Math.random().toString(36).substr(2, 9); }

function generateRandomCard() {
    const isWild = Math.random() < 0.08; // 8% chance of wild card
    if (isWild) {
        return { color: "wild", value: "Wild", id: generateRandomId() };
    }
    const color = UNO_COLORS[Math.floor(Math.random() * UNO_COLORS.length)];
    const value = UNO_VALUES[Math.floor(Math.random() * UNO_VALUES.length)];
    return { color, value, id: generateRandomId() };
}

/* =========================================================
   SCREEN ROUTING & CONTROLS
   ========================================================= */
function showScreen(screenId) {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('waiting-screen').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    
    if(screenId) {
        document.getElementById(screenId).classList.remove('hidden');
    }
}

/* =========================================================
   1. AUTH / ROOM INITIALIZATION
   ========================================================= */

// CREATE ROOM
document.getElementById('btn-create-room').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    if (!name) return alert("Enter your Cyber Name first!");

    myPlayerName = name;
    myPlayerId = generateRandomId();
    currentRoomId = Math.floor(1000 + Math.random() * 9000).toString();
    isHost = true;
    myRole = "player";

    roomRef = database.ref('rooms/' + currentRoomId);
    
    roomRef.set({
        status: "waiting",
        hostId: myPlayerId,
        turnIndex: 0,
        direction: 1, 
        playerOrder: [myPlayerId],
        spectators: {},
        players: {
            [myPlayerId]: { name: name, cards: [], status: "playing" }
        },
        chat: { init: true },
        latestStandings: {}
    }).then(() => {
        setupLobbyUI();
    });
});

// JOIN AS PLAYER
document.getElementById('btn-join-player').addEventListener('click', () => {
    handleJoinRoom("player");
});

// JOIN AS SPECTATOR
document.getElementById('btn-join-spectator').addEventListener('click', () => {
    handleJoinRoom("spectator");
});

function handleJoinRoom(role) {
    const name = document.getElementById('player-name').value.trim();
    const code = document.getElementById('room-code-input').value.trim();
    if (!name || !code) return alert("Enter Name and 4-Digit Room Code!");

    myPlayerName = name;
    myPlayerId = generateRandomId();
    currentRoomId = code;
    myRole = role;
    isHost = false;

    roomRef = database.ref('rooms/' + currentRoomId);

    roomRef.once('value', snapshot => {
        if (!snapshot.exists()) return alert("Matrix Room not found!");
        let roomData = snapshot.val();

        if (role === "player" && roomData.status !== "waiting") {
            return alert("Match already in progress! Try joining as Spectator.");
        }

        let updates = {};
        if (role === "player") {
            let updatedOrder = roomData.playerOrder || [];
            updatedOrder.push(myPlayerId);
            updates['/playerOrder'] = updatedOrder;
            updates['/players/' + myPlayerId] = { name: name, cards: [], status: "playing" };
        } else {
            updates['/spectators/' + myPlayerId] = { name: name };
        }

        roomRef.update(updates).then(() => {
            setupLobbyUI();
        });
    });
}

function setupLobbyUI() {
    document.getElementById('display-room-code').innerText = currentRoomId;
    document.getElementById('role-badge').innerText = myRole.toUpperCase();
    
    if (isHost) {
        document.getElementById('btn-start').classList.remove('hidden');
        document.getElementById('waiting-msg').classList.add('hidden');
    } else {
        document.getElementById('btn-start').classList.add('hidden');
        document.getElementById('waiting-msg').classList.remove('hidden');
    }
    
    showScreen('waiting-screen');
    listenToRoomUpdates();
}

/* =========================================================
   2. MATCH ENGINE START
   ========================================================= */
document.getElementById('btn-start').addEventListener('click', () => {
    roomRef.once('value', snapshot => {
        let roomData = snapshot.val();
        if(!roomData.playerOrder || roomData.playerOrder.length < 2) {
            return alert("Need at least 2 cyber players to boot the engine!");
        }

        let updates = {};
        roomData.playerOrder.forEach(pid => {
            let startingHand = [];
            for (let i = 0; i < 7; i++) startingHand.push(generateRandomCard());
            updates['/players/' + pid + '/cards'] = startingHand;
            updates['/players/' + pid + '/status'] = "playing";
        });

        let firstCard = generateRandomCard();
        while (firstCard.color === "wild" || ["Skip", "Reverse"].includes(firstCard.value)) {
            firstCard = generateRandomCard();
        }

        updates['/status'] = "playing";
        updates['/currentCard'] = firstCard;
        updates['/turnIndex'] = 0;
        updates['/direction'] = 1;
        updates['/rankings'] = []; // Clear old dynamic rankings

        roomRef.update(updates);
    });
});

/* =========================================================
   3. DATA LISTENER & HUD SYNC
   ========================================================= */
function listenToRoomUpdates() {
    roomRef.on('value', snapshot => {
        const data = snapshot.val();
        if (!data) return;

        // --- HANDLER: LOBBY WAITING STAGE ---
        if (data.status === "waiting") {
            showScreen('waiting-screen');
            
            // Render User list
            const list = document.getElementById('players-list');
            list.innerHTML = "";
            if (data.playerOrder) {
                data.playerOrder.forEach(pid => {
                    let li = document.createElement('li');
                    li.innerHTML = `<i class="fas fa-gamepad"></i> ${data.players[pid].name} ${pid === data.hostId ? "(Host)" : ""}`;
                    list.appendChild(li);
                });
            }
            // Render Spectators inside user list
            if (data.spectators) {
                Object.values(data.spectators).forEach(spec => {
                    let li = document.createElement('li');
                    li.style.borderLeft = "3px solid #ffea00";
                    li.innerHTML = `<i class="fas fa-eye"></i> ${spec.name} (Spectator)`;
                    list.appendChild(li);
                });
            }

            // Sync Latest Standings (Previous Match Result)
            const lobbyLeaderboard = document.getElementById('lobby-leaderboard');
            const lobbyLeaderboardList = document.getElementById('lobby-leaderboard-list');
            if (data.latestStandings && Object.keys(data.latestStandings).length > 0) {
                lobbyLeaderboard.classList.remove('hidden');
                lobbyLeaderboardList.innerHTML = "";
                Object.values(data.latestStandings).forEach((entry, idx) => {
                    lobbyLeaderboardList.innerHTML += `<li>#${idx+1} ${entry.name}</li>`;
                });
            } else {
                lobbyLeaderboard.classList.add('hidden');
            }
        } 
        
        // --- HANDLER: LIVE GAMEPLAY HUD ---
        else if (data.status === "playing") {
            showScreen('hud');
            
            if (myRole === "spectator") {
                document.getElementById('spectator-hud-alert').classList.remove('hidden');
            } else {
                document.getElementById('spectator-hud-alert').classList.add('hidden');
            }
            renderGameBoard(data);
        } 
        
        // --- HANDLER: GAMEOVER SCREEN ---
        else if (data.status === "gameover") {
            showScreen('gameover-screen');
            renderGameOver(data);
        }
    });

    // Dual Chat Sync
    roomRef.child('chat').on('child_added', snapshot => {
        if (snapshot.key === "init") return;
        const msg = snapshot.val();
        appendChatMessage(msg);
    });
}

/* =========================================================
   4. GAME BOARD CORE RENDERING
   ========================================================= */
function renderGameBoard(data) {
    const activePlayerId = data.playerOrder[data.turnIndex];
    const isMyTurn = (activePlayerId === myPlayerId && myRole === "player");

    // Dynamic Turn HUD Text
    const turnName = data.players[activePlayerId] ? data.players[activePlayerId].name : "System";
    document.getElementById('current-player-name').innerText = isMyTurn ? "YOUR TURN" : turnName;
    document.getElementById('current-turn-box').style.color = isMyTurn ? "#00ff66" : "#00f0ff";
    document.getElementById('direction-txt').innerText = data.direction === 1 ? "CW" : "CCW";

    // Discard Center Pile Render
    const centerPile = document.getElementById('discard-pile');
    centerPile.className = `uno-card card-${data.currentCard.color} shadow-glow`;
    centerPile.innerHTML = `<span>${data.currentCard.value}</span>`;

    // Opponents Arena Render
    const arena = document.getElementById('opponents-arena');
    arena.innerHTML = "";
    
    data.playerOrder.forEach(pid => {
        let pData = data.players[pid];
        if (!pData) return;
        
        let cardCount = pData.cards ? Object.keys(pData.cards).length : 0;
        let isOpponentTurn = (pid === activePlayerId);
        let statusBadge = pData.status === "finished" ? "🏆 FINISHED" : `${cardCount} Cards`;

        // Render mini profiles grid
        arena.innerHTML += `
            <div class="opp-avatar ${isOpponentTurn ? 'active-turn' : ''}">
                <div class="opp-card-back">${cardCount}</div>
                <div class="opp-name">${pData.name}</div>
            </div>
        `;
    });

    // Local Hand Management (Hide if spectator)
    const handSection = document.getElementById('player-hand-section');
    const cardsWrapper = document.getElementById('player-cards-wrapper');
    
    if (myRole === "spectator" || (data.players[myPlayerId] && data.players[myPlayerId].status === "finished")) {
        handSection.style.display = "none";
    } else {
        handSection.style.display = "block";
        cardsWrapper.innerHTML = "";
        
        let myCards = data.players[myPlayerId].cards || [];
        let myCardsArray = Array.isArray(myCards) ? myCards : Object.values(myCards);
        document.getElementById('hand-count-lbl').innerText = `YOUR MATRIX: ${myCardsArray.length} CARDS`;

        myCardsArray.forEach((card, idx) => {
            if(!card) return;
            let cardDiv = document.createElement('div');
            cardDiv.className = `playable-card card-${card.color}`;
            cardDiv.innerHTML = `<span>${card.value}</span>`;
            
            cardDiv.onclick = () => {
                if (!isMyTurn) return alert("Cyber Lock! It's not your turn transmission.");
                executePlayCard(card, idx, data);
            };
            cardsWrapper.appendChild(cardDiv);
        });
    }

    // --- CAR GAME FOOTER TRACKER ENGINE ---
    updateCarStyleTracker(data);
}

// CAR REACING LANES UPDATER
function updateCarStyleTracker(data) {
    const laneContainer = document.getElementById('tracker-lanes');
    laneContainer.innerHTML = "";
    
    let totalPlayers = data.playerOrder.length;
    let myLeftCount = 0;

    data.playerOrder.forEach((pid, index) => {
        let pData = data.players[pid];
        if(!pData) return;
        
        let cardCount = pData.cards ? Object.keys(pData.cards).length : 0;
        if(pid === myPlayerId) myLeftCount = cardCount;

        // Progress Calculation: 7 card structure reference (0 to 100% logic inversion)
        // More cards = Left side, 0 cards = Complete right side (Win)
        let maxCardsReference = 10;
        let progressPercent = ((maxCardsReference - Math.min(cardCount, maxCardsReference)) / maxCardsReference) * 100;
        if (pData.status === "finished") progressPercent = 100;

        // Lane Calculation offsets
        let laneHeightStep = 100 / totalPlayers;
        let laneTopPosition = (index * laneHeightStep) + (laneHeightStep / 2);

        let dot = document.createElement('div');
        dot.className = "player-progress-dot";
        dot.style.left = `${Math.max(5, Math.min(progressPercent, 95))}%`;
        dot.style.top = `${laneTopPosition}%`;
        dot.style.color = TRACKER_COLORS[index % TRACKER_COLORS.length];
        dot.style.backgroundColor = TRACKER_COLORS[index % TRACKER_COLORS.length];
        dot.title = pData.name;

        laneContainer.appendChild(dot);
    });

    document.getElementById('cards-left-tracker-txt').innerText = myRole === "spectator" ? "LIVE RECON" : `${myLeftCount} MATRIX LEFT`;
}

/* =========================================================
   5. GAMEPLAY MOVES & RULES
   ========================================================= */

// DRAW CARD CONTROLLER
document.getElementById('btn-draw').addEventListener('click', () => {
    if (myRole === "spectator") return;
    
    roomRef.once('value', snapshot => {
        let data = snapshot.val();
        if (data.playerOrder[data.turnIndex] !== myPlayerId) return alert("Not your system turn cycle!");

        let myCards = data.players[myPlayerId].cards || [];
        let myCardsArray = Array.isArray(myCards) ? myCards : Object.values(myCards);
        
        myCardsArray.push(generateRandomCard());
        
        // Pass Turn automatically
        let nextTurn = calculateNextTurnIndex(data);

        roomRef.update({
            turnIndex: nextTurn,
            [`players/${myPlayerId}/cards`]: myCardsArray
        });
    });
});

function executePlayCard(card, cardIndex, roomData) {
    let activeCard = roomData.currentCard;
    
    let isColorMatch = (card.color === activeCard.color || card.color === "wild" || activeCard.color === "wild");
    let isValueMatch = (card.value === activeCard.value);

    if (!isColorMatch && !isValueMatch) {
        return alert("Matrix Conflict! Card must match color or value specs.");
    }

    if (card.color === "wild") {
        document.getElementById('color-chooser-overlay').classList.remove('hidden');
        // Save temporary action parameter on wrapper
        document.getElementById('color-chooser-overlay').dataset.pendingIndex = cardIndex;
    } else {
        commitCardToDatabase(card, cardIndex, roomData);
    }
}

// WILD CARD COLOR POPUP EVENT LISTENER
document.querySelectorAll('.color-choice').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const selectedColor = e.target.id.replace('color-', '');
        const overlay = document.getElementById('color-chooser-overlay');
        const cardIndex = parseInt(overlay.dataset.pendingIndex);
        overlay.classList.add('hidden');

        roomRef.once('value', snapshot => {
            let roomData = snapshot.val();
            let myCards = roomData.players[myPlayerId].cards || [];
            let myCardsArray = Array.isArray(myCards) ? myCards : Object.values(myCards);
            
            let selectedCard = myCardsArray[cardIndex];
            selectedCard.color = selectedColor; // Apply chosen matrix variant color

            commitCardToDatabase(selectedCard, cardIndex, roomData);
        });
    });
});

function commitCardToDatabase(card, cardIndex, roomData) {
    let myCards = Array.isArray(roomData.players[myPlayerId].cards) 
        ? roomData.players[myPlayerId].cards 
        : Object.values(roomData.players[myPlayerId].cards);
        
    myCards.splice(cardIndex, 1);

    let updates = {};
    let currentRankings = roomData.rankings ? [...roomData.rankings] : [];

    // Player Out / Spectator Transformation condition
    if (myCards.length === 0) {
        updates[`/players/${myPlayerId}/status`] = "finished";
        currentRankings.push({ id: myPlayerId, name: myPlayerName });
        updates['/rankings'] = currentRankings;
        alert("🎉 Matrix Core Purged! You secured rank placement.");
    }

    updates[`/players/${myPlayerId}/cards`] = myCards;
    updates['/currentCard'] = card;

    // Evaluate Remaining Players for Auto Match Termination
    let activePlayersLeft = roomData.playerOrder.filter(pid => {
        let status = (pid === myPlayerId) ? (myCards.length === 0 ? "finished" : "playing") : roomData.players[pid].status;
        return status === "playing";
    });

    if (activePlayersLeft.length <= 1) {
        // Append last remaining player to ranking order map
        if(activePlayersLeft.length === 1) {
            let lastPid = activePlayersLeft[0];
            currentRankings.push({ id: lastPid, name: roomData.players[lastPid].name });
            updates['/rankings'] = currentRankings;
        }
        updates['/status'] = "gameover";
        updates['/latestStandings'] = currentRankings; // Store ranking parameters inside room core
    } else {
        // Adjust directional sequences
        let direction = roomData.direction || 1;
        if (card.value === "Reverse") {
            direction *= -1;
            roomData.direction = direction; 
            updates['/direction'] = direction;
        }

        // Setup Skip parameters
        let step = 1;
        if (card.value === "Skip") step = 2;

        let nextTurnIndex = roomData.turnIndex;
        for (let i = 0; i < step; i++) {
            nextTurnIndex = (nextTurnIndex + direction) % roomData.playerOrder.length;
            if (nextTurnIndex < 0) nextTurnIndex += roomData.playerOrder.length;
            
            // Loop until a non-finished player matches sequence index
            if (roomData.players[roomData.playerOrder[nextTurnIndex]].status === "finished") {
                i--; // Extend check loop offset step parameters
            }
        }
        updates['/turnIndex'] = nextTurnIndex;
    }

    roomRef.update(updates);
}

function calculateNextTurnIndex(roomData) {
    let direction = roomData.direction || 1;
    let total = roomData.playerOrder.length;
    let nextIdx = roomData.turnIndex;

    do {
        nextIdx = (nextIdx + direction) % total;
        if (nextIdx < 0) nextIdx += total;
    } while (roomData.players[roomData.playerOrder[nextIdx]].status === "finished");

    return nextIdx;
}

/* =========================================================
   6. REALTIME CHAT TRANSMISSION
   ========================================================= */
document.getElementById('btn-send-lobby-chat').addEventListener('click', sendLobbyMessage);
document.getElementById('lobby-chat-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') sendLobbyMessage(); });

document.getElementById('btn-send-ingame-chat').addEventListener('click', sendInGameMessage);
document.getElementById('ingame-chat-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') sendInGameMessage(); });

function sendLobbyMessage() {
    const inp = document.getElementById('lobby-chat-input');
    const txt = inp.value.trim();
    if(!txt) return;
    roomRef.child('chat').push({ name: myPlayerName, message: txt });
    inp.value = "";
}

function sendInGameMessage() {
    const inp = document.getElementById('ingame-chat-input');
    const txt = inp.value.trim();
    if(!txt) return;
    roomRef.child('chat').push({ name: myPlayerName, message: txt });
    inp.value = "";
}

function appendChatMessage(msg) {
    const lobbyBox = document.getElementById('lobby-chat-messages');
    const ingameBox = document.getElementById('ingame-chat-messages');
    
    let html = `<div><strong>${msg.name}:</strong> ${msg.message}</div>`;
    lobbyBox.innerHTML += html;
    ingameBox.innerHTML += html;
    
    lobbyBox.scrollTop = lobbyBox.scrollHeight;
    ingameBox.scrollTop = ingameBox.scrollHeight;
}

// Collapsible In-game Chat Widget UI Trigger
document.getElementById('ingame-chat-header').addEventListener('click', () => {
    const body = document.getElementById('ingame-chat-body');
    const icon = document.getElementById('chat-toggle-icon');
    body.classList.toggle('hidden');
    icon.className = body.classList.contains('hidden') ? "fas fa-chevron-up" : "fas fa-chevron-down";
});

/* =========================================================
   7. MATCH OVER & AUTOMATIC RESET ROUTINES
   ========================================================= */
function renderGameOver(data) {
    const winnerLabel = document.getElementById('final-winner-lbl');
    const leaderboardList = document.getElementById('leaderboard-list');
    
    if (data.rankings && data.rankings.length > 0) {
        winnerLabel.innerText = `WINNER: ${data.rankings[0].name.toUpperCase()}`;
        leaderboardList.innerHTML = "";
        data.rankings.forEach((rank, index) => {
            leaderboardList.innerHTML += `<li><span>#${index + 1} ${rank.name}</span> <i class="fas fa-medal" style="color:${index===0?'#ffea00':index===1?'#cccccc':'#cd7f32'}"></i></li>`;
        });
    }

    const backBtn = document.getElementById('btn-back-to-lobby');
    const nonHostMsg = document.getElementById('non-host-lobby-msg');

    if (isHost) {
        backBtn.classList.remove('hidden');
        nonHostMsg.classList.add('hidden');
    } else {
        backBtn.classList.add('hidden');
        nonHostMsg.classList.remove('hidden');
    }
}

// HOST ACTION: RESET ENGINE AND RETURN TO LOBBY LOOP
document.getElementById('btn-back-to-lobby').addEventListener('click', () => {
    if(!isHost) return;
    
    // Maintain player list reference parameters, reset status arrays only
    roomRef.once('value', snapshot => {
        let roomData = snapshot.val();
        let updates = {};
        
        updates['/status'] = "waiting";
        updates['/currentCard'] = null;
        updates['/turnIndex'] = 0;
        updates['/direction'] = 1;
        updates['/chat'] = { init: true }; // Flush transmission buffers

        roomData.playerOrder.forEach(pid => {
            updates[`/players/${pid}/cards`] = [];
            updates[`/players/${pid}/status`] = "playing";
        });

        roomRef.update(updates);
    });
});
