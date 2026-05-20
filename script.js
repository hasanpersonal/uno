import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let currentRoomCode = null;
let myPlayerId = null;
let myName = "";
let isCreator = false;
let gameState = null;
let lastActionId = ""; // 🌟 Bug Fix: Action ID tracking for precise animations
let roomListenerUnsubscribe = null;
let totalMessagesSeen = 0;
let hasTurnNotified = false; // Prevents turn overlay from looping continuously

const entryScreen = document.getElementById('entry-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const gameOverScreen = document.getElementById('game-over-screen');

// Chat UI Selectors
const gameChatPanel = document.getElementById('game-chat-panel');
const chatBadge = document.getElementById('chat-badge');

function enableFullscreen() {
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) docEl.requestFullscreen();
    else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
}

// Global Event Listeners
document.getElementById('btn-create-room').addEventListener('click', () => { enableFullscreen(); handleRoomAction('create'); });
document.getElementById('btn-join-player').addEventListener('click', () => { enableFullscreen(); handleRoomAction('join'); });

// Separate Chat Button Triggers
document.getElementById('btn-send-lobby-chat').addEventListener('click', () => sendChatMessage('lobby'));
document.getElementById('btn-send-game-chat').addEventListener('click', () => sendChatMessage('game'));

// Chat Panel Open/Close Toggle
document.getElementById('btn-toggle-chat').addEventListener('click', () => {
    gameChatPanel.classList.remove('hidden');
    chatBadge.classList.add('hidden'); // Clear badge notification
});
document.getElementById('btn-close-chat').addEventListener('click', () => {
    gameChatPanel.classList.add('hidden');
});

document.getElementById('btn-start-game').addEventListener('click', startGame);
document.getElementById('draw-pile').addEventListener('click', drawCardFromDeck);
document.getElementById('btn-return-lobby').addEventListener('click', returnToLobbyIndividually);

function handleRoomAction(action) {
    const createName = document.getElementById('create-player-name').value.trim();
    const joinName = document.getElementById('join-player-name').value.trim();
    const inputCode = document.getElementById('room-code').value.trim();

    if (action === 'create') {
        if (!createName) return alert("Please enter your name to create a room!");
        myName = createName;
        currentRoomCode = Math.floor(1000 + Math.random() * 9000).toString();
        isCreator = true;
        setupRoomInFirebase();
    } else {
        if (!joinName) return alert("Please enter your name to join!");
        if (!inputCode) return alert("Please enter a valid room code!");
        myName = joinName;
        currentRoomCode = inputCode;
        isCreator = false;
        joinRoomInFirebase();
    }
}

function setupRoomInFirebase() {
    myPlayerId = 'user_' + Math.random().toString(36).substr(2, 9);
    const roomRef = ref(db, `rooms/${currentRoomCode}`);
    const initialData = {
        creator: myPlayerId,
        status: "lobby",
        currentTurn: 0,
        lastAction: { type: 'init', playerId: '', cardId: '', actionId: 'init_id' },
        players: {},
        standings: [] 
    };
    initialData.players[myPlayerId] = { name: myName, id: myPlayerId };

    set(roomRef, initialData).then(() => {
        switchToScreen('lobby');
        listenToRoomChanges();
    });
}

function joinRoomInFirebase() {
    myPlayerId = 'user_' + Math.random().toString(36).substr(2, 9);
    const userRef = ref(db, `rooms/${currentRoomCode}/players/${myPlayerId}`);
    set(userRef, { name: myName, id: myPlayerId }).then(() => {
        switchToScreen('lobby');
        listenToRoomChanges();
    }).catch(() => {
        alert("Room not found!");
    });
}

function switchToScreen(screenType) {
    entryScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    if (screenType === 'lobby') {
        lobbyScreen.classList.remove('hidden');
        document.getElementById('display-room-code').innerText = currentRoomCode;
    } else if (screenType === 'game') {
        gameScreen.classList.remove('hidden');
    } else if (screenType === 'gameover') {
        gameOverScreen.classList.remove('hidden');
    }
}

function listenToRoomChanges() {
    const roomRef = ref(db, `rooms/${currentRoomCode}`);
    roomListenerUnsubscribe = onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        gameState = data;

        if (gameState.creator === myPlayerId) {
            isCreator = true;
            if (gameState.status === 'lobby') document.getElementById('btn-start-game').classList.remove('hidden');
        }

        updateLobbyLists(data.players);
        updateChatMessages(data.chat);

        if (gameState.status === 'playing') {
            if (gameScreen.classList.contains('hidden') && gameOverScreen.classList.contains('hidden')) {
                switchToScreen('game');
            }
            
            if (!gameScreen.classList.contains('hidden')) {
                const lastAction = gameState.lastAction;
                // 🌟 Bug Fix: Using unique actionId instead of cardId to fix 'draw & play same card' animation bug
                if (lastAction && lastAction.actionId !== lastActionId) {
                    lastActionId = lastAction.actionId;
                    if (lastAction.playerId !== myPlayerId && lastAction.type === 'play') {
                        triggerOpponentPlayAnimation(lastAction.card);
                    } else if (lastAction.playerId !== myPlayerId && lastAction.type === 'draw') {
                        triggerOpponentDrawAnimation();
                    } else {
                        renderGameBoard();
                    }
                } else {
                    renderGameBoard();
                }
            }
        } else if (gameState.status === 'lobby' && !gameScreen.classList.contains('hidden')) {
            switchToScreen('lobby');
        }
        
        if (gameState.status === 'ended') {
            renderStandingsScreen();
        }
    });
}

function updateLobbyLists(players) {
    const pList = document.getElementById('lobby-players');
    pList.innerHTML = "";
    if (players) Object.values(players).forEach(p => pList.innerHTML += `<li>🎮 ${p.name}</li>`);
}

function sendChatMessage(type) {
    const inputId = type === 'lobby' ? 'lobby-chat-input' : 'game-chat-input';
    const input = document.getElementById(inputId);
    const msg = input.value.trim();
    if (!msg) return;
    push(ref(db, `rooms/${currentRoomCode}/chat`), { sender: myName, text: msg });
    input.value = "";
}

function updateChatMessages(chatData) {
    const lobbyContainer = document.getElementById('lobby-chat-messages');
    const gameContainer = document.getElementById('game-chat-messages');
    
    lobbyContainer.innerHTML = "";
    gameContainer.innerHTML = "";
    
    if (!chatData) return;
    
    const messages = Object.values(chatData);
    
    messages.forEach(m => {
        const template = `<div class="chat-message"><strong>${m.sender}:</strong> ${m.text}</div>`;
        lobbyContainer.innerHTML += template;
        gameContainer.innerHTML += template;
    });

    lobbyContainer.scrollTop = lobbyContainer.scrollHeight;
    gameContainer.scrollTop = gameContainer.scrollHeight;

    // Flashy Notification Trigger
    if (messages.length > totalMessagesSeen) {
        if (gameState && gameState.status === 'playing' && gameChatPanel.classList.contains('hidden')) {
            chatBadge.classList.remove('hidden'); 
        }
        totalMessagesSeen = messages.length;
    }
}

function startGame() {
    if (!isCreator) return;
    const colors = ['red', 'blue', 'green', 'yellow'];
    let deck = [];
    colors.forEach(color => {
        deck.push({ color, value: '0', id: Math.random().toString(36).substr(2, 5) });
        for (let i = 1; i <= 9; i++) {
            deck.push({ color, value: i.toString(), id: Math.random().toString(36).substr(2, 5) });
            deck.push({ color, value: i.toString(), id: Math.random().toString(36).substr(2, 5) });
        }
    });
    deck.sort(() => Math.random() - 0.5);

    const playerIds = Object.keys(gameState.players);
    if(playerIds.length < 2) return alert("Need at least 2 players to start!");

    const updatedPlayers = { ...gameState.players };
    playerIds.forEach(id => updatedPlayers[id].cards = deck.splice(0, 7));

    const mainCard = deck.pop();
    
    // Create initial tracking actionId
    const initialActionId = 'start_' + Math.random().toString(36).substr(2, 9);
    lastActionId = initialActionId;

    update(ref(db, `rooms/${currentRoomCode}`), {
        status: "playing",
        deck: deck,
        mainCard: mainCard,
        players: updatedPlayers,
        turnOrder: playerIds,
        currentTurn: 0,
        standings: [], 
        lastAction: { type: 'init', playerId: '', cardId: mainCard.id, actionId: initialActionId }
    });
}

function renderGameBoard() {
    const turnOrder = gameState.turnOrder || [];
    const activePlayerId = turnOrder[gameState.currentTurn];
    
    if (activePlayerId) {
        const activeName = gameState.players[activePlayerId]?.name || "Unknown";
        document.getElementById('active-player-name').innerText = (activePlayerId === myPlayerId) ? "YOUR TURN!" : `${activeName}'s Turn`;

        // YOUR TURN FLASHY POPUP OVERLAY
        if (activePlayerId === myPlayerId) {
            if (!hasTurnNotified) {
                const turnOverlay = document.getElementById('your-turn-overlay');
                turnOverlay.classList.remove('hidden');
                
                setTimeout(() => {
                    turnOverlay.classList.add('hidden');
                }, 1500);
                
                hasTurnNotified = true;
            }
        } else {
            hasTurnNotified = false; 
        }
    }

    const orderContainer = document.getElementById('player-turn-order');
    orderContainer.innerHTML = "";
    turnOrder.forEach(id => {
        const p = gameState.players[id];
        if (p) {
            const activeStyle = (id === activePlayerId) ? "style='border:2px solid #f1c40f; background:#e74c3c; font-weight:bold;'" : "";
            orderContainer.innerHTML += `<span ${activeStyle}>${p.name} (${p.cards ? p.cards.length : 0})</span>`;
        }
    });

    const mainPile = document.getElementById('main-pile');
    mainPile.innerHTML = "";
    if (gameState.mainCard) mainPile.appendChild(createCardDOM(gameState.mainCard));

    const handContainer = document.getElementById('player-hand');
    handContainer.innerHTML = "";
    
    const isFinished = !turnOrder.includes(myPlayerId);

    // 🌟 Bug Fix: Safe check for active players and scaled-down view for finished players
    if (!isFinished && gameState.players[myPlayerId]?.cards) {
        gameScreen.classList.remove('finished-view');

        gameState.players[myPlayerId].cards.forEach((card, index) => {
            const cardEl = createCardDOM(card);
            cardEl.addEventListener('click', (e) => {
                if (activePlayerId !== myPlayerId) return alert("Not your turn!");
                if (card.color === gameState.mainCard.color || card.value === gameState.mainCard.value) {
                    playMyCard(index, card, e.target.closest('.uno-card'));
                } else {
                    alert("Card doesn't match!");
                }
            });
            handContainer.appendChild(cardEl);
        });
    } else if (isFinished) {
        // Automatically scales down the board via CSS and handles the finished layout
        gameScreen.classList.add('finished-view');
        chatBadge.classList.add('hidden');
    }
}

function createCardDOM(card) {
    const div = document.createElement('div');
    div.className = `uno-card color-${card.color}`;
    div.innerHTML = `
        <div class="card-inner">
            <div class="card-corner corner-top-left">${card.value}</div>
            <div class="card-value">${card.value}</div>
            <div class="card-corner corner-bottom-right">${card.value}</div>
        </div>
    `;
    return div;
}

function playMyCard(cardIndex, cardData, cardElement) {
    const rect = cardElement.getBoundingClientRect();
    const mainPileRect = document.getElementById('main-pile').getBoundingClientRect();

    const flyingCard = createCardDOM(cardData);
    flyingCard.classList.add('flying-card');
    flyingCard.style.left = `${rect.left}px`;
    flyingCard.style.top = `${rect.top}px`;
    document.getElementById('animation-layer').appendChild(flyingCard);

    setTimeout(() => {
        flyingCard.classList.add('main-card-size');
        flyingCard.style.left = `${mainPileRect.left}px`;
        flyingCard.style.top = `${mainPileRect.top}px`;
        flyingCard.style.transform = `rotate(${Math.random() * 20 - 10}deg)`;
    }, 20);

    setTimeout(() => {
        flyingCard.remove();
        submitCardToFirebase(cardIndex, cardData);
    }, 550);
}

function triggerOpponentPlayAnimation(cardData) {
    const mainPileRect = document.getElementById('main-pile').getBoundingClientRect();
    const flyingCard = createCardDOM(cardData);
    flyingCard.classList.add('flying-card');
    flyingCard.classList.add('main-card-size');
    
    flyingCard.style.left = `50%`;
    flyingCard.style.top = `-250px`;
    document.getElementById('animation-layer').appendChild(flyingCard);

    setTimeout(() => {
        flyingCard.style.left = `${mainPileRect.left}px`;
        flyingCard.style.top = `${mainPileRect.top}px`;
        flyingCard.style.transform = `rotate(${Math.random() * 20 - 10}deg)`;
    }, 20);

    setTimeout(() => {
        flyingCard.remove();
        renderGameBoard();
    }, 550);
}

function triggerOpponentDrawAnimation() {
    const drawPileRect = document.getElementById('draw-pile').getBoundingClientRect();
    const flyingCard = document.createElement('div');
    flyingCard.className = "uno-card flying-card";
    flyingCard.innerHTML = `<div class="card-inner" style="background:#2c3e50;"></div>`;
    
    flyingCard.style.left = `${drawPileRect.left}px`;
    flyingCard.style.top = `${drawPileRect.top}px`;
    document.getElementById('animation-layer').appendChild(flyingCard);

    setTimeout(() => {
        flyingCard.style.left = `50%`;
        flyingCard.style.top = `-150px`;
        flyingCard.style.opacity = '0';
    }, 20);

    setTimeout(() => {
        flyingCard.remove();
        renderGameBoard();
    }, 550);
}

function submitCardToFirebase(cardIndex, cardData) {
    let myCards = [...gameState.players[myPlayerId].cards];
    myCards.splice(cardIndex, 1);

    const updates = {};
    let turnOrder = [...gameState.turnOrder];
    let currentStandings = gameState.standings ? [...gameState.standings] : [];
    let currentTurn = gameState.currentTurn;

    if (myCards.length === 0) {
        currentStandings.push(myName);
        updates[`rooms/${currentRoomCode}/standings`] = currentStandings;
        turnOrder = turnOrder.filter(id => id !== myPlayerId);
        updates[`rooms/${currentRoomCode}/turnOrder`] = turnOrder;
        if (currentTurn >= turnOrder.length) currentTurn = 0;
    } else {
        updates[`rooms/${currentRoomCode}/players/${myPlayerId}/cards`] = myCards;
        currentTurn = (currentTurn + 1) % turnOrder.length;
    }

    if (turnOrder.length === 1) {
        const lastPlayerId = turnOrder[0];
        const lastPlayerName = gameState.players[lastPlayerId].name;
        currentStandings.push(lastPlayerName);
        
        updates[`rooms/${currentRoomCode}/standings`] = currentStandings;
        updates[`rooms/${currentRoomCode}/status`] = "ended"; 
    } else {
        updates[`rooms/${currentRoomCode}/currentTurn`] = currentTurn;
    }

    const uniqueActionId = 'play_' + Math.random().toString(36).substr(2, 9);
    updates[`rooms/${currentRoomCode}/mainCard`] = cardData;
    updates[`rooms/${currentRoomCode}/lastAction`] = { type: 'play', playerId: myPlayerId, cardId: cardData.id, card: cardData, actionId: uniqueActionId };
    
    update(ref(db), updates);
}

function drawCardFromDeck() {
    const turnOrder = gameState.turnOrder || [];
    if (!turnOrder.includes(myPlayerId) || turnOrder[gameState.currentTurn] !== myPlayerId) return alert("Not your turn!");

    let deck = [...(gameState.deck || [])];
    if (deck.length === 0) return alert("Deck is empty!");

    const drawnCard = deck.pop();
    let myCards = [...(gameState.players[myPlayerId].cards || [])];
    myCards.push(drawnCard);

    const drawPileRect = document.getElementById('draw-pile').getBoundingClientRect();
    const handRect = document.getElementById('player-hand').getBoundingClientRect();

    const flyingCard = document.createElement('div');
    flyingCard.className = "uno-card flying-card";
    flyingCard.innerHTML = `<div class="card-inner" style="background:#2c3e50;"></div>`;
    flyingCard.style.left = `${drawPileRect.left}px`;
    flyingCard.style.top = `${drawPileRect.top}px`;
    document.getElementById('animation-layer').appendChild(flyingCard);

    setTimeout(() => {
        flyingCard.style.left = `${handRect.left + (handRect.width/2)}px`;
        flyingCard.style.top = `${handRect.top}px`;
        flyingCard.style.opacity = '0';
    }, 20);

    setTimeout(() => {
        flyingCard.remove();
        const nextTurn = (gameState.currentTurn + 1) % turnOrder.length;
        const updates = {};
        const uniqueActionId = 'draw_' + Math.random().toString(36).substr(2, 9);
        
        updates[`rooms/${currentRoomCode}/deck`] = deck;
        updates[`rooms/${currentRoomCode}/players/${myPlayerId}/cards`] = myCards;
        updates[`rooms/${currentRoomCode}/currentTurn`] = nextTurn;
        updates[`rooms/${currentRoomCode}/lastAction`] = { type: 'draw', playerId: myPlayerId, cardId: drawnCard.id, actionId: uniqueActionId };
        update(ref(db), updates);
    }, 550);
}

function renderStandingsScreen() {
    switchToScreen('gameover');
    const container = document.getElementById('standings-list');
    container.innerHTML = "";

    const finalStandings = gameState.standings || [];
    finalStandings.forEach((name, index) => {
        const rank = index + 1;
        const rankClass = rank === 1 ? 'rank-1' : '';
        const trophy = rank === 1 ? '👑' : '⚫';
        container.innerHTML += `
            <div class="standing-item ${rankClass}">
                <span>${trophy} Rank ${rank}: ${name}</span>
                <span>${rank === 1 ? 'Winner' : 'Done'}</span>
            </div>
        `;
    });
}

// 🌟 FIX FOR "RETURN TO LOBBY" BUTTON
function returnToLobbyIndividually() {
    if (roomListenerUnsubscribe) {
        roomListenerUnsubscribe(); 
    }

    hasTurnNotified = false;
    lastActionId = "";

    const updates = {};
    updates[`rooms/${currentRoomCode}/status`] = "lobby";
    updates[`rooms/${currentRoomCode}/players/${myPlayerId}/cards`] = null;
    updates[`rooms/${currentRoomCode}/standings`] = null;
    updates[`rooms/${currentRoomCode}/turnOrder`] = null;

    update(ref(db), updates).then(() => {
        listenToRoomChanges(); 
        switchToScreen('lobby');
    }).catch(err => {
        console.error("Error returning to lobby:", err);
    });
}
