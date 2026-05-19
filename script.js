// Firebase Configuration (Aponar Asia Server Link Shoho)
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

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const screens = {
    lobby: document.getElementById('lobby-screen'),
    waiting: document.getElementById('waiting-room'),
    game: document.getElementById('game-board')
};

let myPlayerId = "";
let currentRoomId = "";
let isHost = false;
let actionTriggeredByMe = null; // Animation track korar jonno flag ('play' ba 'draw')

const UNO_COLORS = ["red", "blue", "green", "yellow"];
const UNO_VALUES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Skip", "Reverse"];

function generateRandomId() { return Math.random().toString(36).substr(2, 9); }

function generateRandomCard() {
    const color = UNO_COLORS[Math.floor(Math.random() * UNO_COLORS.length)];
    const value = UNO_VALUES[Math.floor(Math.random() * UNO_VALUES.length)];
    return { color, value, id: generateRandomId() };
}

function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.style.display = 'none');
    screens[screenName].style.display = 'block';
}

// CREATE ROOM
document.getElementById('btn-create').addEventListener('click', () => {
    const name = document.getElementById('host-name').value.trim();
    if (!name) return alert("Enter your name!");

    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    myPlayerId = generateRandomId();
    currentRoomId = roomId;
    isHost = true;

    database.ref('rooms/' + roomId).set({
        status: "waiting",
        hostId: myPlayerId,
        turnIndex: 0,
        direction: 1, 
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

// JOIN ROOM
document.getElementById('btn-join').addEventListener('click', () => {
    const name = document.getElementById('join-name').value.trim();
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

// START GAME
document.getElementById('btn-start').addEventListener('click', () => {
    database.ref('rooms/' + currentRoomId).once('value', snapshot => {
        let roomData = snapshot.val();
        let updates = {};

        roomData.playerOrder.forEach(pid => {
            let startingHand = [];
            for(let i=0; i<7; i++) startingHand.push(generateRandomCard());
            updates['/players/' + pid + '/cards'] = startingHand;
        });

        let firstCard = generateRandomCard();
        while(["Skip", "Reverse"].includes(firstCard.value)) {
            firstCard = generateRandomCard();
        }

        updates['/status'] = "playing";
        updates['/currentCard'] = firstCard;

        database.ref('rooms/' + currentRoomId).update(updates);
    });
});

// DATABASE LISTENER
function listenToRoom() {
    database.ref('rooms/' + currentRoomId).on('value', snapshot => {
        const data = snapshot.val();
        if (!data) return;

        if (data.status === "waiting") {
            const list = document.getElementById('players-list');
            list.innerHTML = "";
            data.playerOrder.forEach(pid => {
                let li = document.createElement('li');
                li.innerText = data.players[pid].name + (pid === data.hostId ? " (Host)" : "");
                list.appendChild(li);
            });
        } 
        else if (data.status === "playing") {
            if (screens.game.style.display === 'none') {
                switchScreen('game');
                document.getElementById('game-room-id').innerText = currentRoomId;
            }
            renderGame(data);
        }
    });
}

// RENDER GAME BOARD (With Dynamic Multi-device Animation Logic)
function renderGame(data) {
    const turnPlayerId = data.playerOrder[data.turnIndex];
    const isMyTurn = (turnPlayerId === myPlayerId);

    document.getElementById('turn-indicator').innerText = isMyTurn ? "🔥 YOUR TURN 🔥" : `${data.players[turnPlayerId].name}'s Turn`;
    document.getElementById('turn-indicator').style.color = isMyTurn ? "#00ff00" : "#ffaa00";

    // --- Dynamic Discard Pile Animation (Center Card) ---
    const centerCardDiv = document.getElementById('current-card');
    
    // Check korbe card asset id change hoyeche kina (notun card mardise keu)
    if (centerCardDiv.dataset.cardId !== data.currentCard.id) {
        centerCardDiv.className = `uno-card ${data.currentCard.color}`;
        centerCardDiv.innerHTML = `<span>${data.currentCard.value}</span>`;
        
        // Puran screen load e animation hobe na, shudhu realtime change e hobe
        if (centerCardDiv.dataset.cardId) {
            if (actionTriggeredByMe === 'play') {
                centerCardDiv.classList.add('anim-play-me'); // Nijer screen e nich theke uree jabe
            } else {
                centerCardDiv.classList.add('anim-play-opp'); // Onno player der phone e upor theke drop hobe
            }
        }
        centerCardDiv.dataset.cardId = data.currentCard.id;
    }

    const opponentsArea = document.getElementById('opponents-area');
    opponentsArea.innerHTML = "";
    data.playerOrder.forEach(pid => {
        if (pid !== myPlayerId) {
            let pData = data.players[pid];
            let cardCount = pData.cards ? Object.keys(pData.cards).length : 0;
            opponentsArea.innerHTML += `<div class="opponent-box">${pData.name}: <span>${cardCount} Cards</span></div>`;
        }
    });

    // --- My Cards Hand Render ---
    const myHandDiv = document.getElementById('my-cards');
    myHandDiv.innerHTML = "";
    let myCards = data.players[myPlayerId].cards || [];
    let myCardsArray = Array.isArray(myCards) ? myCards : Object.values(myCards);

    myCardsArray.forEach((card, index) => {
        if (!card) return;
        let cardDiv = document.createElement('div');
        cardDiv.className = `uno-card my-card-item ${card.color}`;
        cardDiv.innerHTML = `<span>${card.value}</span>`;
        
        // Jodi ami draw kore থাকি, tobe baki card static thakbe ar sudhu shesh notun card-ti draw anim hobe
        if (actionTriggeredByMe === 'draw' && index === myCardsArray.length - 1) {
            cardDiv.classList.add('anim-draw-me');
        } else {
            cardDiv.style.animationDelay = `${index * 0.05}s`;
        }

        cardDiv.onclick = () => {
            if (!isMyTurn) return;
            playCard(card, index, data);
        };
        myHandDiv.appendChild(cardDiv);
    });

    // Code execution sesh hole temporary action type reset kore dibe
    actionTriggeredByMe = null;
}

// PLAY CARD LOGIC
function playCard(card, cardIndex, roomData) {
    let isColorMatch = card.color === roomData.currentCard.color;
    let isValueMatch = card.value === roomData.currentCard.value;

    if (!isColorMatch && !isValueMatch) {
        return alert("Card doesn't match color or number!");
    }

    let myCards = Array.isArray(roomData.players[myPlayerId].cards) 
        ? roomData.players[myPlayerId].cards 
        : Object.values(roomData.players[myPlayerId].cards);
        
    myCards.splice(cardIndex, 1);

    if (myCards.length === 0) {
        alert("🎉 YOU WON! 🎉");
    }

    let nextTurnIndex = roomData.turnIndex;
    let direction = roomData.direction || 1;
    const totalPlayers = roomData.playerOrder.length;

    if (card.value === "Reverse") {
        if (totalPlayers === 2) {
            nextTurnIndex = (nextTurnIndex + direction) % totalPlayers;
        } else {
            direction *= -1;
        }
    } else if (card.value === "Skip") {
        nextTurnIndex = (nextTurnIndex + direction) % totalPlayers;
    }

    nextTurnIndex = (nextTurnIndex + direction) % totalPlayers;
    if (nextTurnIndex < 0) nextTurnIndex += totalPlayers;

    // Local action update
    actionTriggeredByMe = 'play';

    database.ref('rooms/' + currentRoomId).update({
        currentCard: card,
        turnIndex: nextTurnIndex,
        direction: direction,
        [`players/${myPlayerId}/cards`]: myCards
    });
}

// DRAW CARD LOGIC
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

        // Local action update
        actionTriggeredByMe = 'draw';

        database.ref('rooms/' + currentRoomId).update({
            turnIndex: nextTurnIndex,
            [`players/${myPlayerId}/cards`]: myCardsArray
        });
    });
});
