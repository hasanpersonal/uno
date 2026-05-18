// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCKqsxIC2aGBR0UnejiXlIaJeKAfdW_Zp0",
    authDomain: "online-ha.firebaseapp.com",
    databaseURL: "https://online-ha-default-rtdb.firebaseio.com",
    projectId: "online-ha",
    storageBucket: "online-ha.firebasestorage.app",
    messagingSenderId: "1033988386517",
    appId: "1:1033988386517:web:e75348acd3f9765a84bc5c",
    measurementId: "G-T6GYPQT874"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// DOM Elements
const screens = {
    lobby: document.getElementById('lobby-screen'),
    waiting: document.getElementById('waiting-room'),
    game: document.getElementById('game-board')
};

let myPlayerId = "";
let currentRoomId = "";
let isHost = false;

// Game Config
const UNO_COLORS = ["red", "blue", "green", "yellow"];
const UNO_VALUES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Skip", "Reverse"];

// Utility Functions
function generateRandomId() {
    return Math.random().toString(36).substr(2, 9);
}

function generateRandomCard() {
    const color = UNO_COLORS[Math.floor(Math.random() * UNO_COLORS.length)];
    const value = UNO_VALUES[Math.floor(Math.random() * UNO_VALUES.length)];
    return { color, value, id: generateRandomId() };
}

function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.style.display = 'none');
    screens[screenName].style.display = 'block';
}

// 1. CREATE ROOM
document.getElementById('btn-create').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    if (!name) return alert("Enter your name!");

    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    myPlayerId = generateRandomId();
    currentRoomId = roomId;
    isHost = true;

    database.ref('rooms/' + roomId).set({
        status: "waiting",
        hostId: myPlayerId,
        turnIndex: 0,
        direction: 1, // 1 for forward, -1 for reverse
        playerOrder: [myPlayerId],
        players: {
            [myPlayerId]: { name: name, cards: [] }
        }
    }).then(() => {
        document.getElementById('display-room-code').innerText = roomId;
        document.getElementById('btn-start').style.display = 'inline-block';
        document.getElementById('waiting-msg').style.display = 'none';
        switchScreen('waiting');
        listenToRoom();
    });
});

// 2. JOIN ROOM
document.getElementById('btn-join').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    const roomId = document.getElementById('room-code-input').value.trim();
    if (!name || !roomId) return alert("Enter Name and Room Code!");

    database.ref('rooms/' + roomId).once('value', snapshot => {
        if (!snapshot.exists()) return alert("Room not found!");
        if (snapshot.val().status !== "waiting") return alert("Game already started!");

        myPlayerId = generateRandomId();
        currentRoomId = roomId;

        let roomData = snapshot.val();
        let updatedOrder = roomData.playerOrder || [];
        updatedOrder.push(myPlayerId);

        let updates = {};
        updates['/playerOrder'] = updatedOrder;
        updates['/players/' + myPlayerId] = { name: name, cards: [] };

        database.ref('rooms/' + roomId).update(updates).then(() => {
            document.getElementById('display-room-code').innerText = roomId;
            switchScreen('waiting');
            listenToRoom();
        });
    });
});

// 3. START GAME (Host Only)
document.getElementById('btn-start').addEventListener('click', () => {
    database.ref('rooms/' + currentRoomId).once('value', snapshot => {
        let roomData = snapshot.val();
        let updates = {};

        // Deal 7 cards to each player
        roomData.playerOrder.forEach(pid => {
            let startingHand = [];
            for(let i=0; i<7; i++) startingHand.push(generateRandomCard());
            updates['/players/' + pid + '/cards'] = startingHand;
        });

        // Set starting card (Only numbers to be safe)
        let firstCard = generateRandomCard();
        while(["Skip", "Reverse"].includes(firstCard.value)) {
            firstCard = generateRandomCard();
        }

        updates['/status'] = "playing";
        updates['/currentCard'] = firstCard;

        database.ref('rooms/' + currentRoomId).update(updates);
    });
});

// 4. LIVE DATABASE LISTENER
function listenToRoom() {
    database.ref('rooms/' + currentRoomId).on('value', snapshot => {
        const data = snapshot.val();
        if (!data) return;

        // WAITING ROOM LOGIC
        if (data.status === "waiting") {
            const list = document.getElementById('players-list');
            list.innerHTML = "";
            data.playerOrder.forEach(pid => {
                let li = document.createElement('li');
                li.innerText = data.players[pid].name + (pid === data.hostId ? " (Host)" : "");
                list.appendChild(li);
            });
        } 
        // GAME PLAY LOGIC
        else if (data.status === "playing") {
            if (screens.game.style.display === 'none') {
                switchScreen('game');
                document.getElementById('game-room-id').innerText = currentRoomId;
            }

            renderGame(data);
        }
    });
}

// 5. RENDER GAME BOARD
function renderGame(data) {
    const turnPlayerId = data.playerOrder[data.turnIndex];
    const isMyTurn = (turnPlayerId === myPlayerId);

    // Turn Indicator Update
    document.getElementById('turn-indicator').innerText = isMyTurn ? "🔥 YOUR TURN 🔥" : `${data.players[turnPlayerId].name}'s Turn`;
    document.getElementById('turn-indicator').style.color = isMyTurn ? "#00ff00" : "#ffaa00";

    // Center Card Update
    const centerCardDiv = document.getElementById('current-card');
    centerCardDiv.className = `uno-card ${data.currentCard.color}`;
    centerCardDiv.innerText = data.currentCard.value;

    // Opponents Status Update
    const opponentsArea = document.getElementById('opponents-area');
    opponentsArea.innerHTML = "";
    data.playerOrder.forEach(pid => {
        if (pid !== myPlayerId) {
            let pData = data.players[pid];
            let cardCount = pData.cards ? Object.keys(pData.cards).length : 0;
            opponentsArea.innerHTML += `<div class="opponent-box">${pData.name}: <span>${cardCount} Cards</span></div>`;
        }
    });

    // My Hand Update
    const myHandDiv = document.getElementById('my-cards');
    myHandDiv.innerHTML = "";
    let myCards = data.players[myPlayerId].cards || [];
    
    // Firebase returns arrays as objects sometimes if indexes are messed up, formatting it:
    let myCardsArray = Array.isArray(myCards) ? myCards : Object.values(myCards);

    myCardsArray.forEach((card, index) => {
        if (!card) return;
        let cardDiv = document.createElement('div');
        cardDiv.className = `uno-card my-card-item ${card.color}`;
        cardDiv.innerText = card.value;

        cardDiv.onclick = () => {
            if (!isMyTurn) return;
            playCard(card, index, data);
        };
        myHandDiv.appendChild(cardDiv);
    });
}

// 6. PLAY CARD LOGIC
function playCard(card, cardIndex, roomData) {
    // Validation
    let isColorMatch = card.color === roomData.currentCard.color;
    let isValueMatch = card.value === roomData.currentCard.value;

    if (!isColorMatch && !isValueMatch) {
        return alert("Card doesn't match color or number!");
    }

    let myCards = Array.isArray(roomData.players[myPlayerId].cards) 
        ? roomData.players[myPlayerId].cards 
        : Object.values(roomData.players[myPlayerId].cards);
        
    myCards.splice(cardIndex, 1); // Remove card from hand

    // Winner Check
    if (myCards.length === 0) {
        alert("🎉 YOU WON! 🎉");
    }

    let nextTurnIndex = roomData.turnIndex;
    let direction = roomData.direction || 1;
    const totalPlayers = roomData.playerOrder.length;

    // Special Cards Logic
    if (card.value === "Reverse") {
        if (totalPlayers === 2) {
            // In 2 player, Reverse acts like a Skip
            nextTurnIndex = (nextTurnIndex + direction) % totalPlayers;
        } else {
            direction *= -1;
        }
    } else if (card.value === "Skip") {
        nextTurnIndex = (nextTurnIndex + direction) % totalPlayers;
    }

    // Move to next player
    nextTurnIndex = (nextTurnIndex + direction) % totalPlayers;
    if (nextTurnIndex < 0) nextTurnIndex += totalPlayers;

    database.ref('rooms/' + currentRoomId).update({
        currentCard: card,
        turnIndex: nextTurnIndex,
        direction: direction,
        [`players/${myPlayerId}/cards`]: myCards
    });
}

// 7. DRAW CARD LOGIC
document.getElementById('btn-draw').addEventListener('click', () => {
    database.ref('rooms/' + currentRoomId).once('value', snapshot => {
        let roomData = snapshot.val();
        let turnPlayerId = roomData.playerOrder[roomData.turnIndex];
        
        if (turnPlayerId !== myPlayerId) return alert("Not your turn!");

        let myCards = roomData.players[myPlayerId].cards || [];
        let myCardsArray = Array.isArray(myCards) ? myCards : Object.values(myCards);
        
        myCardsArray.push(generateRandomCard());

        let direction = roomData.direction || 1;
        let totalPlayers = roomData.playerOrder.length;
        let nextTurnIndex = (roomData.turnIndex + direction) % totalPlayers;
        if (nextTurnIndex < 0) nextTurnIndex += totalPlayers;

        database.ref('rooms/' + currentRoomId).update({
            turnIndex: nextTurnIndex,
            [`players/${myPlayerId}/cards`]: myCardsArray
        });
    });
});
