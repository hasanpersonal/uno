import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, push } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";

// --- Firebase Configuration ---
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

// --- Global States ---
let roomId = null;
let playerName = "";
let playerId = "player_" + Math.random().toString(36).substr(2, 9);
let isHost = false;
let myCards = [];
let gameActive = false;
let autoDrawProcessing = false;

// --- DOM Elements Mapping ---
const screens = {
    join: document.getElementById("join-screen"),
    lobby: document.getElementById("lobby-screen"),
    game: document.getElementById("game-screen"),
    gameOver: document.getElementById("game-over-screen")
};

const createName = document.getElementById("create-name");
const joinName = document.getElementById("join-name");
const joinCode = document.getElementById("join-code");
const errorMsg = document.getElementById("error-message");
const lobbyRoomId = document.getElementById("lobby-room-id");
const lobbyPlayerList = document.getElementById("lobby-player-list");
const lobbyChatBox = document.getElementById("lobby-chat-box");
const lobbyChatInput = document.getElementById("lobby-chat-input");
const btnStartGame = document.getElementById("btn-start-game");
const waitMessage = document.getElementById("wait-message");
const mainDiscardCard = document.getElementById("main-discard-card");
const btnDrawCard = document.getElementById("btn-draw-card");
const playerCardsGrid = document.getElementById("player-cards-grid");
const currentTurnDisplay = document.getElementById("current-turn-display");
const drawCycleIndicator = document.getElementById("draw-cycle-indicator");
const flashTurnAlert = document.getElementById("flash-turn-alert");
const spectatorNotice = document.getElementById("spectator-notice");
const gameChatPopup = document.getElementById("game-chat-popup");
const floatingChatOverlay = document.getElementById("floating-chat-overlay");
const gameChatBox = document.getElementById("game-chat-box");
const gameChatInput = document.getElementById("game-chat-input");

function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[screenName].classList.add("active");
    screens[screenName].classList.remove("hidden");
}

function showError(msg) {
    errorMsg.innerText = msg;
    errorMsg.classList.remove("hidden");
    setTimeout(() => errorMsg.classList.add("hidden"), 3000);
}

// --- UNO Deck Factory ---
const colors = ["Red", "Green", "Blue", "Yellow"];
const values = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Skip", "Reverse", "+2"];

function generateDeck() {
    let deck = [];
    colors.forEach(color => {
        values.forEach(value => {
            deck.push({ color, value, type: "normal" });
            if (value !== "0") deck.push({ color, value, type: "normal" });
        });
    });
    for (let i = 0; i < 4; i++) {
        deck.push({ color: "Black", value: "Wild", type: "wild" });
        deck.push({ color: "Black", value: "+4", type: "wild" });
    }
    return deck.sort(() => Math.random() - 0.5);
}

// --- ROOM CONTROLS ---
document.getElementById("btn-create-room").addEventListener("click", async () => {
    playerName = createName.value.trim();
    if (!playerName) return showError("Please enter your name");
    
    roomId = Math.floor(1000 + Math.random() * 9000).toString();
    isHost = true;
    
    await set(ref(db, `rooms/${roomId}`), {
        host: playerId,
        state: "lobby",
        players: { [playerId]: { name: playerName, cards: [], status: "active", cardCount: 0 } },
        game: { deck: [], discard: { value: "", color: "" }, turn: "", direction: 1 }
    });
    enterLobby();
});

document.getElementById("btn-join-room").addEventListener("click", async () => {
    playerName = joinName.value.trim();
    roomId = joinCode.value.trim();
    
    if (!playerName || !roomId) return showError("Enter name and room code");
    
    const snapshot = await get(ref(db, `rooms/${roomId}`));
    if (snapshot.exists()) {
        if(snapshot.val().state === "playing") return showError("Game already started");
        await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
            name: playerName, cards: [], status: "active", cardCount: 0
        });
        enterLobby();
    } else {
        showError("Room Code does not exist!");
    }
});

function enterLobby() {
    switchScreen("lobby");
    lobbyRoomId.innerText = roomId;
    
    if (isHost) {
        btnStartGame.classList.remove("hidden");
        waitMessage.classList.add("hidden");
    }
    
    onValue(ref(db, `rooms/${roomId}/players`), (snapshot) => {
        if (!snapshot.exists()) return;
        lobbyPlayerList.innerHTML = "";
        Object.values(snapshot.val()).forEach(p => {
            const li = document.createElement("li");
            li.innerText = p.name;
            lobbyPlayerList.appendChild(li);
        });
    });

    onValue(ref(db, `rooms/${roomId}/lobbyChat`), (snapshot) => {
        if (!snapshot.exists()) return;
        lobbyChatBox.innerHTML = "";
        Object.values(snapshot.val()).forEach(c => {
            lobbyChatBox.innerHTML += `<div><b>${c.sender}:</b> ${c.msg}</div>`;
        });
        lobbyChatBox.scrollTop = lobbyChatBox.scrollHeight;
    });

    onValue(ref(db, `rooms/${roomId}/state`), (snapshot) => {
        if (snapshot.val() === "playing" && !gameActive) {
            startGameUI();
        }
    });
}

document.getElementById("btn-lobby-send").addEventListener("click", () => {
    const msg = lobbyChatInput.value.trim();
    if (!msg) return;
    push(ref(db, `rooms/${roomId}/lobbyChat`), { sender: playerName, msg });
    lobbyChatInput.value = "";
});

// --- STATE INITIALIZATION (HOST) ---
btnStartGame.addEventListener("click", async () => {
    const snapshot = await get(ref(db, `rooms/${roomId}/players`));
    const players = snapshot.val();
    const playerIds = Object.keys(players);
    
    let deck = generateDeck();
    let initialDiscard = deck.pop();
    while(initialDiscard.type === "wild" || ["Skip", "Reverse", "+2"].includes(initialDiscard.value)) {
        deck.unshift(initialDiscard);
        initialDiscard = deck.pop();
    }

    playerIds.forEach(id => {
        players[id].cards = deck.splice(-14); 
        players[id].cardCount = 14;
        players[id].status = "active";
    });

    await update(ref(db, `rooms/${roomId}`), {
        state: "playing",
        players: players,
        game: {
            deck: deck,
            discard: initialDiscard,
            turn: playerIds[0],
            direction: 1,
            order: playerIds,
            pendingDraw: 0,
            lastAction: "start"
        }
    });
});

// --- MAIN ENGINE UI ---
function startGameUI() {
    gameActive = true;
    switchScreen("game");
    animateInitialDistribution();

    onValue(ref(db, `rooms/${roomId}/game`), (snapshot) => {
        if (!snapshot.exists()) return;
        updateGameScreen(snapshot.val());
    });

    onValue(ref(db, `rooms/${roomId}/players/${playerId}`), (snapshot) => {
        if (!snapshot.exists()) return;
        const me = snapshot.val();
        myCards = me.cards || [];
        renderMyCards();
        
        if (myCards.length === 0 && me.cardCount === 0 && me.status === "active" && gameActive) {
            spectatorNotice.classList.remove("hidden");
            update(ref(db, `rooms/${roomId}/players/${playerId}`), { status: "spectator" });
        }
    });

    onValue(ref(db, `rooms/${roomId}/gameChat`), (snapshot) => {
        if (!snapshot.exists()) return;
        const chatList = Object.values(snapshot.val());
        const lastChat = chatList[chatList.length - 1];
        
        gameChatBox.innerHTML = "";
        chatList.forEach(c => {
            gameChatBox.innerHTML += `<div><b>${c.sender}:</b> ${c.msg}</div>`;
        });
        gameChatBox.scrollTop = gameChatBox.scrollHeight;

        if(lastChat.sender !== playerName) {
            floatingChatOverlay.innerText = `${lastChat.sender}: ${lastChat.msg}`;
            floatingChatOverlay.classList.remove("hidden");
            setTimeout(() => floatingChatOverlay.classList.add("hidden"), 1000); 
        }
    });
}

function renderMyCards() {
    playerCardsGrid.innerHTML = "";
    myCards.forEach((card, index) => {
        const cardEl = document.createElement("div");
        cardEl.className = "card";
        cardEl.style.color = card.color !== "Black" ? card.color : "black";
        cardEl.innerText = card.value;
        cardEl.onclick = () => playCard(index, card);
        playerCardsGrid.appendChild(cardEl);
    });
}

function updateGameScreen(game) {
    const topCard = game?.discard || { value: "", color: "" };
    mainDiscardCard.innerText = topCard.value || "";
    mainDiscardCard.style.color = topCard.color !== "Black" ? topCard.color : "#fff";
    if(topCard.color === "Black") mainDiscardCard.style.backgroundColor = "#333";
    else mainDiscardCard.style.backgroundColor = "#fff";

    const isMyTurn = (game.turn === playerId);
    drawCycleIndicator.innerText = `Direction: ${game.direction === 1 ? 'Clockwise ↻' : 'Counter ↺'}`;
    
    if (isMyTurn) {
        currentTurnDisplay.innerText = "YOUR TURN!";
        if(["play", "start", "draw"].includes(game.lastAction)) {
            flashTurnAlert.classList.remove("hidden");
            setTimeout(() => flashTurnAlert.classList.add("hidden"), 2000);
        }
    } else {
        currentTurnDisplay.innerText = "Opponent's Turn";
    }

    if (isMyTurn && game.pendingDraw > 0 && !autoDrawProcessing) {
        autoDrawProcessing = true;
        handleAutoDraw(game.pendingDraw, game);
    }
}

async function playCard(index, card) {
    const gameSnapshot = await get(ref(db, `rooms/${roomId}/game`));
    const game = gameSnapshot.val();

    if (game.turn !== playerId) return showError("Not your turn!");
    
    const topCard = game.discard;
    const isValid = card.color === "Black" || card.color === topCard.color || card.value === topCard.value;
    if (!isValid) return showError("Invalid card compilation!");

    let targetCard = { ...card };
    if(card.color === "Black") {
        let chosenColor = prompt("Choose a Color: Red, Green, Blue, Yellow");
        if(chosenColor) {
            chosenColor = chosenColor.trim();
            chosenColor = chosenColor.charAt(0).toUpperCase() + chosenColor.slice(1).toLowerCase();
        }
        if(!["Red", "Green", "Blue", "Yellow"].includes(chosenColor)) {
            chosenColor = "Red"; 
        }
        targetCard.color = chosenColor; 
    }

    if(playerCardsGrid.children[index]) {
        animateFlyingCard(playerCardsGrid.children[index].getBoundingClientRect(), mainDiscardCard.getBoundingClientRect(), card);
    }

    myCards.splice(index, 1);
    await update(ref(db, `rooms/${roomId}/players/${playerId}`), { cards: myCards, cardCount: myCards.length });

    let nextTurnIndex = game.order.indexOf(playerId);
    let pendingDraw = game.pendingDraw || 0;
    
    if (card.value === "Reverse") game.direction *= -1;
    if (card.value === "+2") pendingDraw += 2;
    if (card.value === "+4") pendingDraw += 4;

    let turnStep = game.direction;
    if (card.value === "Skip") turnStep *= 2; 

    let nextTurn = "";
    let loopCount = 0;
    do {
        nextTurnIndex = (nextTurnIndex + turnStep + game.order.length) % game.order.length;
        nextTurn = game.order[nextTurnIndex];
        turnStep = game.direction; 
        loopCount++;
        if(loopCount > game.order.length) break; 
    } while ((await get(ref(db, `rooms/${roomId}/players/${nextTurn}/status`))).val() === "spectator");

    const allPlayersSnap = await get(ref(db, `rooms/${roomId}/players`));
    const allPlayers = allPlayersSnap.val();
    const activePlayers = Object.values(allPlayers).filter(p => p.status === "active" || p.cards?.length > 0);
    
    if (myCards.length === 0 && activePlayers.length <= 1) {
        endGame(allPlayers);
        return;
    }

    await update(ref(db, `rooms/${roomId}/game`), {
        discard: targetCard,
        turn: nextTurn,
        direction: game.direction,
        pendingDraw: pendingDraw,
        lastAction: "play"
    });
}

btnDrawCard.addEventListener("click", async () => {
    const gameSnapshot = await get(ref(db, `rooms/${roomId}/game`));
    const game = gameSnapshot.val();
    
    if (game.turn !== playerId) return showError("Not your turn!");

    animateFlyingCard(btnDrawCard.getBoundingClientRect(), playerCardsGrid.getBoundingClientRect(), {value: "❓", color: "Black"});

    let deck = game.deck || [];
    if (deck.length === 0) deck = generateDeck();
    
    const drawnCard = deck.pop();
    myCards.push(drawnCard);

    await update(ref(db, `rooms/${roomId}/players/${playerId}`), { cards: myCards, cardCount: myCards.length });
    
    let nextTurnIndex = (game.order.indexOf(playerId) + game.direction + game.order.length) % game.order.length;
    while ((await get(ref(db, `rooms/${roomId}/players/${game.order[nextTurnIndex]}/status`))).val() === "spectator") {
        nextTurnIndex = (nextTurnIndex + game.direction + game.order.length) % game.order.length;
    }

    await update(ref(db, `rooms/${roomId}/game`), {
        deck: deck,
        turn: game.order[nextTurnIndex],
        lastAction: "draw"
    });
});

async function handleAutoDraw(amount, game) {
    let deck = game.deck || [];
    if(deck.length < amount) deck = deck.concat(generateDeck());
    
    const drawnCards = deck.splice(-amount);
    myCards.push(...drawnCards);

    const deckRect = btnDrawCard.getBoundingClientRect();
    const handRect = playerCardsGrid.getBoundingClientRect();
    for(let i=0; i<amount; i++) {
        setTimeout(() => animateFlyingCard(deckRect, handRect, {value:"+", color:"Black"}), i*150);
    }

    await update(ref(db, `rooms/${roomId}/players/${playerId}`), { cards: myCards, cardCount: myCards.length });
    
    let nextTurnIndex = (game.order.indexOf(playerId) + game.direction + game.order.length) % game.order.length;
    while ((await get(ref(db, `rooms/${roomId}/players/${game.order[nextTurnIndex]}/status`))).val() === "spectator") {
        nextTurnIndex = (nextTurnIndex + game.direction + game.order.length) % game.order.length;
    }
    
    await update(ref(db, `rooms/${roomId}/game`), {
        deck: deck,
        turn: game.order[nextTurnIndex],
        pendingDraw: 0,
        lastAction: "auto-draw"
    });
    autoDrawProcessing = false;
}

// --- ANIMATION CORE SYSTEM ---
function animateFlyingCard(startRect, endRect, cardData) {
    const animLayer = document.getElementById("animation-layer");
    const flyingCard = document.createElement("div");
    flyingCard.className = "card flying-card";
    flyingCard.innerText = cardData.value;
    flyingCard.style.color = cardData.color !== "Black" ? cardData.color : "black";
    flyingCard.style.position = "fixed";
    flyingCard.style.left = startRect.left + "px";
    flyingCard.style.top = startRect.top + "px";
    
    animLayer.appendChild(flyingCard);

    requestAnimationFrame(() => {
        flyingCard.style.left = endRect.left + "px";
        flyingCard.style.top = endRect.top + "px";
        flyingCard.style.transform = "scale(1.2) rotate(180deg)";
    });

    setTimeout(() => {
        if (animLayer.contains(flyingCard)) animLayer.removeChild(flyingCard);
    }, 600);
}

function animateInitialDistribution() {
    setTimeout(() => {
        const deckSlot = btnDrawCard.getBoundingClientRect();
        const handSlot = playerCardsGrid.getBoundingClientRect();
        
        const startX = deckSlot.left || (window.innerWidth / 2 + 50);
        const startY = deckSlot.top || (window.innerHeight / 2);
        const endX = handSlot.left || (window.innerWidth / 2 - 100);
        const endY = handSlot.top || (window.innerHeight - 150);

        for(let i = 0; i < 14; i++) {
            setTimeout(() => {
                animateFlyingCard(
                    { left: startX, top: startY },
                    { left: endX + (i * 5), top: endY },
                    { value: "UNO", color: "Red" }
                );
            }, i * 100);
        }
    }, 600);
}

// --- GAME CHAT CONTROLS ---
document.getElementById("btn-toggle-chat").addEventListener("click", () => gameChatPopup.classList.toggle("hidden"));
document.getElementById("btn-close-chat").addEventListener("click", () => gameChatPopup.classList.add("hidden"));
document.getElementById("btn-game-send").addEventListener("click", () => {
    const msg = gameChatInput.value.trim();
    if (!msg) return;
    push(ref(db, `rooms/${roomId}/gameChat`), { sender: playerName, msg });
    gameChatInput.value = "";
});

function endGame(players) {
    gameActive = false;
    switchScreen("gameOver");
    const standingsList = document.getElementById("standings-list");
    standingsList.innerHTML = "";
    const sortedPlayers = Object.values(players).sort((a, b) => (a.cardCount || 0) - (b.cardCount || 0));
    sortedPlayers.forEach(p => {
        const li = document.createElement("li");
        li.innerText = `${p.name} - ${p.cardCount === 0 ? "Winner!" : p.cardCount + " Cards Left"}`;
        standingsList.appendChild(li);
    });
}

document.getElementById("btn-back-to-lobby").addEventListener("click", async () => {
    if (isHost) {
        await update(ref(db, `rooms/${roomId}`), { state: "lobby" });
        const snapshot = await get(ref(db, `rooms/${roomId}/players`));
        const players = snapshot.val();
        for(let id in players) {
            await update(ref(db, `rooms/${roomId}/players/${id}`), { cards: [], status: "active", cardCount: 0 });
        }
    }
    enterLobby();
});
