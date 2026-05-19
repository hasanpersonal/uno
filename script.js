// ১. ফায়ারবেস কনফিগারেশন ও ইনিশিয়ালাইজেশন (CDN ইমপোর্ট ঠিক করা হয়েছে)
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

// ২. গ্লোবাল স্টেট
let currentRoomCode = null;
let myPlayerId = null;
let myName = "";
let myRole = ""; 
let isCreator = false;
let gameState = null;
let lastMainCardId = ""; // অ্যানিমেশন লুপ আটকানোর জন্য ট্র্যাকিং ভেরিয়েবল

// DOM এলিমেন্ট
const entryScreen = document.getElementById('entry-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const chatContainer = document.getElementById('chat-container');

// ইভেন্ট লিসেনার
document.getElementById('btn-create-room').addEventListener('click', () => handleRoomAction('create'));
document.getElementById('btn-join-player').addEventListener('click', () => handleRoomAction('join-player'));
document.getElementById('btn-join-spectator').addEventListener('click', () => handleRoomAction('join-spectator'));
document.getElementById('btn-send-chat').addEventListener('click', sendChatMessage);
document.getElementById('btn-start-game').addEventListener('click', startGame);
document.getElementById('draw-pile').addEventListener('click', drawCardFromDeck);

// ৩. রুম লজিক
function handleRoomAction(action) {
    myName = document.getElementById('player-name').value.trim();
    const inputCode = document.getElementById('room-code').value.trim().toUpperCase();

    if (!myName) {
        alert("অনুগ্রহ করে নাম লিখুন!");
        return;
    }

    myPlayerId = 'user_' + Math.random().toString(36).substr(2, 9);

    if (action === 'create') {
        currentRoomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
        isCreator = true;
        myRole = 'player';
        setupRoomInFirebase();
    } else {
        if (!inputCode) {
            alert("রুম কোড দিন!");
            return;
        }
        currentRoomCode = inputCode;
        isCreator = false;
        myRole = (action === 'join-player') ? 'player' : 'spectator';
        joinRoomInFirebase();
    }
}

function setupRoomInFirebase() {
    const roomRef = ref(db, `rooms/${currentRoomCode}`);
    const initialData = {
        creator: myPlayerId,
        status: "lobby",
        currentTurn: 0,
        lastAction: { type: 'init', playerId: '', cardId: '' }, // অ্যাকশন ট্র্যাকার
        players: {},
        spectators: {}
    };
    initialData[myRole + 's'][myPlayerId] = { name: myName, id: myPlayerId };

    set(roomRef, initialData).then(() => {
        switchToScreen('lobby');
        listenToRoomChanges();
    });
}

function joinRoomInFirebase() {
    const userRef = ref(db, `rooms/${currentRoomCode}/${myRole}s/${myPlayerId}`);
    set(userRef, { name: myName, id: myPlayerId }).then(() => {
        switchToScreen('lobby');
        listenToRoomChanges();
    }).catch(() => {
        alert("রুম কোডটি সঠিক নয়!");
    });
}

function switchToScreen(screenType) {
    entryScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    chatContainer.classList.add('hidden');

    if (screenType === 'lobby') {
        lobbyScreen.classList.remove('hidden');
        chatContainer.classList.remove('hidden');
        document.getElementById('display-room-code').innerText = currentRoomCode;
    } else if (screenType === 'game') {
        gameScreen.classList.remove('hidden');
        chatContainer.classList.remove('hidden');
    }
}

// ৪. রিয়েলটাইম লিসেনার ও অ্যানিমেশন সিঙ্ক সমাধান
function listenToRoomChanges() {
    const roomRef = ref(db, `rooms/${currentRoomCode}`);
    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        gameState = data;

        if (gameState.creator === myPlayerId) {
            isCreator = true;
            if (gameState.status === 'lobby') document.getElementById('btn-start-game').classList.remove('hidden');
        }

        updateLobbyLists(data.players, data.spectators);
        updateChatMessages(data.chat);

        if (gameState.status === 'playing') {
            if (gameScreen.classList.contains('hidden')) switchToScreen('game');
            
            // নেটওয়ার্ক অ্যানিমেশন হ্যান্ডলার (অন্যান্য প্লেয়ারদের স্ক্রিনে কার্ড ওড়া দেখানোর জন্য)
            const lastAction = gameState.lastAction;
            if (lastAction && lastAction.cardId !== lastMainCardId) {
                lastMainCardId = lastAction.cardId;
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
        } else if (gameState.status === 'lobby' && !gameScreen.classList.contains('hidden')) {
            switchToScreen('lobby');
        }
    });
}

function updateLobbyLists(players, spectators) {
    const pList = document.getElementById('lobby-players');
    const sList = document.getElementById('lobby-spectators');
    pList.innerHTML = ""; sList.innerHTML = "";
    if (players) Object.values(players).forEach(p => pList.innerHTML += `<li>🎮 ${p.name}</li>`);
    if (spectators) Object.values(spectators).forEach(s => sList.innerHTML += `<li>👁️ ${s.name}</li>`);
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    push(ref(db, `rooms/${currentRoomCode}/chat`), { sender: myName, text: msg });
    input.value = "";
}

function updateChatMessages(chatData) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = "";
    if (!chatData) return;
    Object.values(chatData).forEach(m => container.innerHTML += `<div class="chat-message"><strong>${m.sender}:</strong> ${m.text}</div>`);
    container.scrollTop = container.scrollHeight;
}

// ৫. গেম স্টার্ট লজিক
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
    const updatedPlayers = { ...gameState.players };
    playerIds.forEach(id => updatedPlayers[id].cards = deck.splice(0, 7));

    const mainCard = deck.pop();
    lastMainCardId = mainCard.id;

    update(ref(db, `rooms/${currentRoomCode}`), {
        status: "playing",
        deck: deck,
        mainCard: mainCard,
        players: updatedPlayers,
        turnOrder: playerIds,
        currentTurn: 0,
        lastAction: { type: 'init', playerId: '', cardId: mainCard.id }
    });
}

// ৬. UI রেন্ডারিং
function renderGameBoard() {
    const turnOrder = gameState.turnOrder || [];
    const activePlayerId = turnOrder[gameState.currentTurn];
    
    if (activePlayerId) {
        const activeName = gameState.players[activePlayerId]?.name || "অজানা";
        document.getElementById('active-player-name').innerText = (activePlayerId === myPlayerId) ? "আপনার টার্ন!" : `${activeName}-এর টার্ন`;
    }

    const orderContainer = document.getElementById('player-turn-order');
    orderContainer.innerHTML = "";
    turnOrder.forEach(id => {
        const p = gameState.players[id];
        if (p) {
            const activeStyle = (id === activePlayerId) ? "style='border:2px solid #f1c40f; background:#e74c3c;'" : "";
            orderContainer.innerHTML += `<span ${activeStyle}>${p.name} (${p.cards ? p.cards.length : 0})</span>`;
        }
    });

    const mainPile = document.getElementById('main-pile');
    mainPile.innerHTML = "";
    if (gameState.mainCard) mainPile.appendChild(createCardDOM(gameState.mainCard));

    const handContainer = document.getElementById('player-hand');
    handContainer.innerHTML = "";
    
    if (myRole === 'player' && gameState.players[myPlayerId]?.cards) {
        gameState.players[myPlayerId].cards.forEach((card, index) => {
            const cardEl = createCardDOM(card);
            cardEl.addEventListener('click', (e) => {
                if (activePlayerId !== myPlayerId) return alert("আপনার টার্ন নয়!");
                if (card.color === gameState.mainCard.color || card.value === gameState.mainCard.value) {
                    playMyCard(index, card, e.target.closest('.uno-card'));
                } else {
                    alert("কার্ড মেলেনি!");
                }
            });
            handContainer.appendChild(cardEl);
        });
    } else if (myRole === 'spectator') {
        handContainer.innerHTML = "<p style='color:#95a5a6;'>আপনি দর্শক হিসেবে ম্যাচ দেখছেন...</p>";
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

// ৭. অ্যাডভান্সড অ্যানিমেশন ইঞ্জিন (আপনার এবং অন্য প্লেয়ারদের জন্য)
function playMyCard(cardIndex, cardData, cardElement) {
    const rect = cardElement.getBoundingClientRect();
    const mainPileRect = document.getElementById('main-pile').getBoundingClientRect();

    const flyingCard = createCardDOM(cardData);
    flyingCard.classList.add('flying-card');
    flyingCard.style.left = `${rect.left}px`;
    flyingCard.style.top = `${rect.top}px`;
    document.getElementById('animation-layer').appendChild(flyingCard);

    setTimeout(() => {
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
    
    // উপর থেকে কার্ড উঁকি দিয়ে আসবে (যেহেতু অপোনেন্ট উপরে থাকে)
    flyingCard.style.left = `50%`;
    flyingCard.style.top = `-200px`;
    document.getElementById('animation-layer').appendChild(flyingCard);

    setTimeout(() => {
        flyingCard.style.left = `${mainPileRect.left}px`;
        flyingCard.style.top = `${mainPileRect.top}px`;
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
        flyingCard.style.top = `-200px`;
        flyingCard.style.opacity = '0';
    }, 20);

    setTimeout(() => {
        flyingCard.remove();
        renderGameBoard();
    }, 550);
}

// ৮. ডেটাবেস আপডেট ও টার্ন ক্যালকুলেশন
function submitCardToFirebase(cardIndex, cardData) {
    let myCards = [...gameState.players[myPlayerId].cards];
    myCards.splice(cardIndex, 1);

    const updates = {};
    let turnOrder = [...gameState.turnOrder];

    if (myCards.length === 0) {
        alert("আপনার সব কার্ড শেষ! আপনি এখন দর্শক।");
        updates[`rooms/${currentRoomCode}/spectators/${myPlayerId}`] = { name: myName, id: myPlayerId };
        updates[`rooms/${currentRoomCode}/players/${myPlayerId}`] = null;
        myRole = 'spectator';
        turnOrder = turnOrder.filter(id => id !== myPlayerId);
        updates[`rooms/${currentRoomCode}/turnOrder`] = turnOrder;
    } else {
        updates[`rooms/${currentRoomCode}/players/${myPlayerId}/cards`] = myCards;
    }

    if (turnOrder.length <= 1) {
        alert("খেলা শেষ! লবিতে ফিরে যাওয়া হচ্ছে।");
        updates[`rooms/${currentRoomCode}/status`] = "lobby";
    } else {
        // সেফ টার্ন ইনডেক্স ক্যালকুলেশন
        let nextTurn = gameState.currentTurn;
        if (nextTurn >= turnOrder.length) nextTurn = 0;
        else nextTurn = (nextTurn + 1) % turnOrder.length;
        
        updates[`rooms/${currentRoomCode}/currentTurn`] = nextTurn;
    }

    updates[`rooms/${currentRoomCode}/mainCard`] = cardData;
    updates[`rooms/${currentRoomCode}/lastAction`] = { type: 'play', playerId: myPlayerId, cardId: cardData.id, card: cardData };
    
    update(ref(db), updates);
}

function drawCardFromDeck() {
    const turnOrder = gameState.turnOrder || [];
    if (turnOrder[gameState.currentTurn] !== myPlayerId || myRole !== 'player') return alert("আপনার টার্ন নয়!");

    let deck = [...(gameState.deck || [])];
    if (deck.length === 0) return alert("ডেক খালি!");

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
        updates[`rooms/${currentRoomCode}/deck`] = deck;
        updates[`rooms/${currentRoomCode}/players/${myPlayerId}/cards`] = myCards;
        updates[`rooms/${currentRoomCode}/currentTurn`] = nextTurn;
        updates[`rooms/${currentRoomCode}/lastAction`] = { type: 'draw', playerId: myPlayerId, cardId: drawnCard.id };
        update(ref(db), updates);
    }, 550);
}
