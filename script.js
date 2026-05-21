import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

let roomId = null;
let playerName = "";
let playerId = "player_" + Math.random().toString(36).substr(2, 9);
let isHost = false;
let myCards = [];
let gameActive = false;
let autoDrawProcessing = false;
let activeListeners = []; 
let chatTimeout = null; 
let isProcessingAction = false; 

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
const dynamicCycleList = document.getElementById("dynamic-cycle-list");
const flashTurnAlert = document.getElementById("flash-turn-alert");
const spectatorNotice = document.getElementById("spectator-notice");
const gameChatPopup = document.getElementById("game-chat-popup");
const floatingChatOverlay = document.getElementById("floating-chat-overlay");
const gameChatBox = document.getElementById("game-chat-box");
const gameChatInput = document.getElementById("game-chat-input");

function switchScreen(screenName) {
    Object.values(screens).forEach(s => { if(s) { s.classList.remove("active"); s.classList.add("hidden"); } });
    if(screens[screenName]) { screens[screenName].classList.add("active"); screens[screenName].classList.remove("hidden"); }
}

function showError(msg) {
    if(!errorMsg) return;
    errorMsg.innerText = msg;
    errorMsg.classList.remove("hidden");
    setTimeout(() => errorMsg.classList.add("hidden"), 3000);
}

function purgeActiveListeners() {
    activeListeners.forEach(unsubscribe => { if(typeof unsubscribe === 'function') unsubscribe(); });
    activeListeners = [];
}

function createCardDOM(card) {
    const cardEl = document.createElement("div");
    const isWild = card.value === "Wild" || card.value === "+4";
    
    cardEl.className = `uno-card-real-look ${isWild ? 'card-black-look' : 'card-' + card.color.toLowerCase() + '-look'}`;

    if (isWild && card.color !== "Black") {
        cardEl.className = `uno-card-real-look card-${card.color.toLowerCase()}-look`;
    }

    if (isWild && card.color === "Black") {
        const quad = document.createElement("div");
        quad.className = "real-wild-quadrant";
        quad.innerHTML = `<div class="wq-r"></div><div class="wq-b"></div><div class="wq-g"></div><div class="wq-y"></div>`;
        cardEl.appendChild(quad);
    }

    const valueStr = card.value;
    
    const symTop = document.createElement("span");
    symTop.className = "symbol-mini sym-top";
    symTop.innerText = valueStr;
    
    const centerEllipse = document.createElement("div");
    centerEllipse.className = "card-center-ellipse";
    const centerVal = document.createElement("span");
    centerVal.className = "center-huge-value";
    centerVal.innerText = valueStr;
    centerEllipse.appendChild(centerVal);
    
    const symBottom = document.createElement("span");
    symBottom.className = "symbol-mini sym-bottom";
    symBottom.innerText = valueStr;
    
    cardEl.appendChild(symTop);
    cardEl.appendChild(centerEllipse);
    cardEl.appendChild(symBottom);
    
    return cardEl;
}

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

document.getElementById("btn-create-room").addEventListener("click", async () => {
    playerName = createName.value.trim();
    if (!playerName) return showError("Please enter operator identity!");
    
    roomId = Math.floor(1000 + Math.random() * 9000).toString();
    isHost = true;
    
    try {
        await set(ref(db, `rooms/${roomId}`), {
            host: playerId,
            state: "lobby",
            players: { [playerId]: { name: playerName, status: "active", cardCount: 0 } },
            game: { discard: { value: "", color: "" }, turn: "", direction: 1 }
        });
        enterLobby();
    } catch (error) {
        console.error(error);
        showError("Initialization error!");
    }
});

document.getElementById("btn-join-room").addEventListener("click", async () => {
    playerName = joinName.value.trim();
    roomId = joinCode.value.trim();
    if (!playerName || !roomId) return showError("Provide complete sector credentials!");
    
    try {
        const snapshot = await get(ref(db, `rooms/${roomId}`));
        if (snapshot.exists()) {
            if(snapshot.val().state === "playing") return showError("Arena operational inside!");
            await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
                name: playerName, status: "active", cardCount: 0
            });
            enterLobby();
        } else {
            showError("Invalid Sector Node!");
        }
    } catch(e) {
        showError("Node connection failed!");
    }
});

function enterLobby() {
    purgeActiveListeners(); 
    switchScreen("lobby");
    if(lobbyRoomId) lobbyRoomId.innerText = roomId;
    
    if (isHost && btnStartGame && waitMessage) {
        btnStartGame.classList.remove("hidden");
        waitMessage.classList.add("hidden");
    }
    
    const unsubPlayers = onValue(ref(db, `rooms/${roomId}/players`), (snapshot) => {
        if (!snapshot.exists() || !lobbyPlayerList) return;
        lobbyPlayerList.innerHTML = "";
        Object.values(snapshot.val()).forEach(p => {
            const li = document.createElement("li");
            li.innerText = `» RUNTIME: ${p.name.toUpperCase()}`;
            lobbyPlayerList.appendChild(li);
        });
    });
    activeListeners.push(unsubPlayers);

    const unsubLobbyChat = onValue(ref(db, `rooms/${roomId}/lobbyChat`), (snapshot) => {
        if (!snapshot.exists() || !lobbyChatBox) return;
        lobbyChatBox.innerHTML = "";
        Object.values(snapshot.val()).forEach(c => {
            lobbyChatBox.innerHTML += `<div><b>${c.sender}:</b> ${c.msg}</div>`;
        });
        lobbyChatBox.scrollTop = lobbyChatBox.scrollHeight;
    });
    activeListeners.push(unsubLobbyChat);

    const unsubState = onValue(ref(db, `rooms/${roomId}/state`), async (snapshot) => {
        const globalState = snapshot.val();
        if (globalState === "playing" && !gameActive) {
            startGameUI();
        } else if (globalState === "lobby" && gameActive) {
            gameActive = false;
            enterLobby();
        } else if (globalState === "gameOver" && gameActive) {
            const playersSnap = await get(ref(db, `rooms/${roomId}/players`));
            if (playersSnap.exists()) endGame(playersSnap.val());
        }
    });
    activeListeners.push(unsubState);
}

document.getElementById("btn-lobby-send").addEventListener("click", () => {
    if(!lobbyChatInput) return;
    const msg = lobbyChatInput.value.trim();
    if (!msg) return;
    push(ref(db, `rooms/${roomId}/lobbyChat`), { sender: playerName, msg });
    lobbyChatInput.value = "";
});

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
        players[id].cards = deck.splice(-7);
        players[id].cardCount = 7;
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

function startGameUI() {
    gameActive = true;
    switchScreen("game");
    animateInitialDistribution();

    const unsubGame = onValue(ref(db, `rooms/${roomId}/game`), async (snapshot) => {
        if (!snapshot.exists()) return;
        const gameData = snapshot.val();
        updateGameScreen(gameData);
        
        const playersSnap = await get(ref(db, `rooms/${roomId}/players`));
        if (playersSnap.exists()) {
            renderCycleTracker(gameData, playersSnap.val());
        }
    });
    activeListeners.push(unsubGame);

    const unsubPlayersGame = onValue(ref(db, `rooms/${roomId}/players`), (snapshot) => {
        if (!snapshot.exists()) return;
        const allPlayers = snapshot.val();
        const me = allPlayers[playerId];
        if(!me) return;
        
        myCards = me.cards || [];
        renderMyCards();
        
        if (myCards.length === 0 && me.cardCount === 0 && me.status === "active" && gameActive) {
            if(spectatorNotice) spectatorNotice.classList.remove("hidden");
            update(ref(db, `rooms/${roomId}/players/${playerId}`), { status: "spectator" });
        }
    });
    activeListeners.push(unsubPlayersGame);

    const unsubGameChat = onValue(ref(db, `rooms/${roomId}/gameChat`), (snapshot) => {
        if (!snapshot.exists() || !gameChatBox) return;
        const chatList = Object.values(snapshot.val());
        const lastChat = chatList[chatList.length - 1];
        
        gameChatBox.innerHTML = "";
        chatList.forEach(c => {
            gameChatBox.innerHTML += `<div><b>${c.sender}:</b> ${c.msg}</div>`;
        });
        gameChatBox.scrollTop = gameChatBox.scrollHeight;

        if(lastChat.sender !== playerName && floatingChatOverlay) {
            floatingChatOverlay.innerText = `${lastChat.sender}: ${lastChat.msg}`;
            floatingChatOverlay.classList.remove("hidden");
            if(chatTimeout) clearTimeout(chatTimeout);
            chatTimeout = setTimeout(() => floatingChatOverlay.classList.add("hidden"), 1200); 
        }
    });
    activeListeners.push(unsubGameChat);
}

function renderMyCards() {
    if(!playerCardsGrid) return;
    playerCardsGrid.innerHTML = "";
    myCards.forEach((card, index) => {
        const cardDOM = createCardDOM(card);
        cardDOM.onclick = () => playCard(index, card);
        playerCardsGrid.appendChild(cardDOM);
    });
}

function renderCycleTracker(game, allPlayers) {
    if(!dynamicCycleList) return;
    dynamicCycleList.innerHTML = "";
    const order = game.order || [];
    const currentTurn = game.turn;
    
    order.forEach((pId, idx) => {
        const playerData = allPlayers[pId];
        if (!playerData || playerData.status === "spectator") return;

        const node = document.createElement("div");
        node.className = `cycle-node ${pId === currentTurn ? 'active-node' : ''}`;
        node.innerText = `${playerData.name.toUpperCase()} [${playerData.cardCount}]`;
        
        dynamicCycleList.appendChild(node);

        if (idx < order.length - 1) {
            const arrow = document.createElement("span");
            arrow.className = "cycle-arrow";
            arrow.innerText = game.direction === 1 ? "→" : "←";
            dynamicCycleList.appendChild(arrow);
        }
    });
}

function updateGameScreen(game) {
    const topCard = game?.discard || { value: "", color: "Black" };
    
    if(mainDiscardCard) {
        mainDiscardCard.innerHTML = "";
        if (topCard.value) {
            const cardDOM = createCardDOM(topCard);
            mainDiscardCard.className = cardDOM.className;
            mainDiscardCard.innerHTML = cardDOM.innerHTML;
        }
    }

    const isMyTurn = (game.turn === playerId);
    if(currentTurnDisplay) {
        if (isMyTurn) {
            currentTurnDisplay.innerText = "YOUR TERM PHASING... INJECT CODE NOW!";
            currentTurnDisplay.style.color = "var(--neon-green)";
            if(["play", "start", "draw"].includes(game.lastAction) && flashTurnAlert) {
                flashTurnAlert.classList.remove("hidden");
                setTimeout(() => { if(flashTurnAlert) flashTurnAlert.classList.add("hidden"); }, 1600);
            }
        } else {
            currentTurnDisplay.innerText = "WAITING FOR CREW EMISSION CYCLE...";
            currentTurnDisplay.style.color = "#8892b0";
        }
    }

    if (isMyTurn && game.pendingDraw > 0 && !autoDrawProcessing) {
        autoDrawProcessing = true;
        handleAutoDraw(game.pendingDraw, game);
    }
}

async function playCard(index, card) {
    if (isProcessingAction) return; 
    
    const gameSnapshot = await get(ref(db, `rooms/${roomId}/game`));
    const game = gameSnapshot.val();

    if (game.turn !== playerId) return showError("Awaiting synced scheduling turn slot!");
    
    const topCard = game.discard;
    const isValid = card.color === "Black" || card.color === topCard.color || card.value === topCard.value;
    if (!isValid) return showError("UNO Paradigm Error: Card signature mismatch!");

    isProcessingAction = true; 

    let targetCard = { ...card };
    if(card.color === "Black") {
        let chosenColor = prompt("Matrix Choice Selection: Red, Green, Blue, Yellow");
        if(chosenColor) {
            chosenColor = chosenColor.trim();
            chosenColor = chosenColor.charAt(0).toUpperCase() + chosenColor.slice(1).toLowerCase();
        }
        if(!["Red", "Green", "Blue", "Yellow"].includes(chosenColor)) {
            chosenColor = "Red"; 
        }
        targetCard.color = chosenColor; 
    }

    if(playerCardsGrid && playerCardsGrid.children[index] && mainDiscardCard) {
        animateFlyingCard(playerCardsGrid.children[index].getBoundingClientRect(), mainDiscardCard.getBoundingClientRect(), card);
    }

    const updatedLocalCards = [...myCards];
    updatedLocalCards.splice(index, 1);
    myCards = updatedLocalCards;
    
    if (myCards.length === 0) {
        const batchUpdates = {};
        batchUpdates[`rooms/${roomId}/players/${playerId}/cards`] = myCards;
        batchUpdates[`rooms/${roomId}/players/${playerId}/cardCount`] = 0;
        batchUpdates[`rooms/${roomId}/game/discard`] = targetCard;
        batchUpdates[`rooms/${roomId}/game/lastAction`] = "play";
        batchUpdates[`rooms/${roomId}/state`] = "gameOver";
        await update(ref(db), batchUpdates);
        isProcessingAction = false;
        return;
    }

    await update(ref(db, `rooms/${roomId}/players/${playerId}`), { cards: myCards, cardCount: myCards.length });

    const allPlayersSnap = await get(ref(db, `rooms/${roomId}/players`));
    const allPlayers = allPlayersSnap.val();

    let currentIdx = game.order.indexOf(playerId);
    let nextTurn = "";
    
    let direction = game.direction;
    if (card.value === "Reverse") direction *= -1;
    
    let pendingDraw = game.pendingDraw || 0;
    if (card.value === "+2") pendingDraw += 2;
    if (card.value === "+4") pendingDraw += 4;

    // --- STRATEGIC FIX: Strict Multi-user Next Turn Sequence Calculation Loop ---
    let loopIndex = currentIdx;
    let iterations = 0;
    let neededActiveHits = (card.value === "Skip") ? 2 : 1;
    let activeHitsFound = 0;

    while (iterations < game.order.length * 2) {
        loopIndex = (loopIndex + direction + game.order.length) % game.order.length;
        const prospectivePlayerId = game.order[loopIndex];
        
        if (allPlayers[prospectivePlayerId] && allPlayers[prospectivePlayerId].status !== "spectator") {
            activeHitsFound++;
            if (activeHitsFound === neededActiveHits) {
                nextTurn = prospectivePlayerId;
                break;
            }
        }
        iterations++;
    }
    
    if (!nextTurn) nextTurn = playerId; 

    await update(ref(db, `rooms/${roomId}/game`), {
        discard: targetCard,
        turn: nextTurn,
        direction: direction,
        pendingDraw: pendingDraw,
        lastAction: "play"
    });
    
    isProcessingAction = false; 
}

btnDrawCard.addEventListener("click", async () => {
    if (isProcessingAction) return; 

    const gameSnapshot = await get(ref(db, `rooms/${roomId}/game`));
    const game = gameSnapshot.val();
    if (game.turn !== playerId) return showError("Action sequence locked out!");

    isProcessingAction = true; 
    if(btnDrawCard && playerCardsGrid) {
        animateFlyingCard(btnDrawCard.getBoundingClientRect(), playerCardsGrid.getBoundingClientRect(), {value: "🎲", color: "Black"});
    }

    let deck = game.deck || [];
    if (deck.length === 0) deck = generateDeck(); 
    
    const drawnCard = deck.pop();
    const updatedDrawCards = [...myCards, drawnCard];
    myCards = updatedDrawCards;

    await update(ref(db, `rooms/${roomId}/players/${playerId}`), { cards: myCards, cardCount: myCards.length });
    
    const allPlayersSnap = await get(ref(db, `rooms/${roomId}/players`));
    const allPlayers = allPlayersSnap.val();

    const topCard = game.discard;
    const isPlayableImmediate = drawnCard.color === "Black" || drawnCard.color === topCard.color || drawnCard.value === topCard.value;
    
    if (isPlayableImmediate) {
        await update(ref(db, `rooms/${roomId}/game`), { deck: deck, lastAction: "draw" });
        showError("Drawn chip matching node! Deploy card or bypass.");
        isProcessingAction = false;
        return; 
    }

    let nextTurnIndex = game.order.indexOf(playerId);
    let drawLoopCount = 0;
    let nextTurn = "";

    while (drawLoopCount < game.order.length) {
        nextTurnIndex = (nextTurnIndex + game.direction + game.order.length) % game.order.length;
        if (allPlayers[game.order[nextTurnIndex]] && allPlayers[game.order[nextTurnIndex]].status !== "spectator") {
            nextTurn = game.order[nextTurnIndex];
            break;
        }
        drawLoopCount++;
    }

    if(!nextTurn) nextTurn = playerId;

    await update(ref(db, `rooms/${roomId}/game`), {
        deck: deck,
        turn: nextTurn,
        lastAction: "draw"
    });
    
    isProcessingAction = false;
});

async function handleAutoDraw(amount, game) {
    let deck = game.deck || [];
    if(deck.length < amount) deck = deck.concat(generateDeck());
    
    const drawnCards = deck.splice(-amount);
    const updatedAutoCards = [...myCards, ...drawnCards];
    myCards = updatedAutoCards;

    if(btnDrawCard && playerCardsGrid) {
        const deckRect = btnDrawCard.getBoundingClientRect();
        const handRect = playerCardsGrid.getBoundingClientRect();
        for(let i=0; i<amount; i++) {
            setTimeout(() => animateFlyingCard(deckRect, handRect, {value:"+", color:"Black"}), i*120);
        }
    }

    await update(ref(db, `rooms/${roomId}/players/${playerId}`), { cards: myCards, cardCount: myCards.length });
    
    const allPlayersSnap = await get(ref(db, `rooms/${roomId}/players`));
    const allPlayers = allPlayersSnap.val();

    let nextTurnIndex = game.order.indexOf(playerId);
    let autoLoopCount = 0;
    let nextTurn = "";
    
    while (autoLoopCount < game.order.length) {
        nextTurnIndex = (nextTurnIndex + game.direction + game.order.length) % game.order.length;
        if (allPlayers[game.order[nextTurnIndex]] && allPlayers[game.order[nextTurnIndex]].status !== "spectator") {
            nextTurn = game.order[nextTurnIndex];
            break;
        }
        autoLoopCount++;
    }

    if(!nextTurn) nextTurn = playerId;
    
    await update(ref(db, `rooms/${roomId}/game`), {
        deck: deck,
        turn: nextTurn,
        pendingDraw: 0,
        lastAction: "auto-draw"
    });
    autoDrawProcessing = false;
}

function animateFlyingCard(startRect, endRect, cardData) {
    const animLayer = document.getElementById("animation-layer");
    if(!animLayer) return;
    const flyingCard = createCardDOM(cardData);
    flyingCard.className += " flying-card";
    flyingCard.style.position = "fixed";
    flyingCard.style.left = startRect.left + "px";
    flyingCard.style.top = startRect.top + "px";
    flyingCard.style.zIndex = "999999";
    
    animLayer.appendChild(flyingCard);

    requestAnimationFrame(() => {
        flyingCard.style.left = endRect.left + "px";
        flyingCard.style.top = endRect.top + "px";
        flyingCard.style.transform = "scale(1.05) rotate(180deg)";
    });

    setTimeout(() => {
        if (animLayer.contains(flyingCard)) animLayer.removeChild(flyingCard);
    }, 530);
}

function animateInitialDistribution() {
    setTimeout(() => {
        if(!btnDrawCard || !playerCardsGrid) return;
        const deckSlot = btnDrawCard.getBoundingClientRect();
        const handSlot = playerCardsGrid.getBoundingClientRect();
        const startX = deckSlot.left || (window.innerWidth / 2);
        const startY = deckSlot.top || (window.innerHeight / 2);
        const endX = handSlot.left || 40;
        const endY = handSlot.top || (window.innerHeight - 120);

        for(let i = 0; i < 7; i++) {
            setTimeout(() => {
                animateFlyingCard({ left: startX, top: startY }, { left: endX + (i * 12), top: endY }, { value: "NEO", color: "Black" });
            }, i * 90);
        }
    }, 400);
}

if(document.getElementById("btn-toggle-chat")) {
    document.getElementById("btn-toggle-chat").addEventListener("click", () => {
        if(gameChatPopup) gameChatPopup.classList.toggle("hidden");
    });
}
if(document.getElementById("btn-close-chat")) {
    document.getElementById("btn-close-chat").addEventListener("click", () => {
        if(gameChatPopup) gameChatPopup.classList.add("hidden");
    });
}

document.getElementById("btn-game-send").addEventListener("click", () => {
    if(!gameChatInput) return;
    const msg = gameChatInput.value.trim();
    if (!msg) return;
    push(ref(db, `rooms/${roomId}/gameChat`), { sender: playerName, msg });
    gameChatInput.value = "";
});

function endGame(players) {
    gameActive = false;
    switchScreen("gameOver");
    const standingsList = document.getElementById("standings-list");
    if(!standingsList) return;
    standingsList.innerHTML = "";
    const sortedPlayers = Object.values(players).sort((a, b) => (a.cardCount || 0) - (b.cardCount || 0));
    sortedPlayers.forEach(p => {
        const li = document.createElement("li");
        li.innerText = `${p.name.toUpperCase()} » REMAINING CARDS: ${p.cardCount || 0}`;
        standingsList.appendChild(li);
    });
}

document.getElementById("btn-back-to-lobby").addEventListener("click", async () => {
    purgeActiveListeners(); 
    if (isHost) {
        const lobbyResetBatch = {};
        lobbyResetBatch[`rooms/${roomId}/state`] = "lobby";
        
        try {
            const snapshot = await get(ref(db, `rooms/${roomId}/players`));
            if (snapshot.exists()) {
                const players = snapshot.val();
                Object.keys(players).forEach(id => {
                    lobbyResetBatch[`rooms/${roomId}/players/${id}/cards`] = [];
                    lobbyResetBatch[`rooms/${roomId}/players/${id}/status`] = "active";
                    lobbyResetBatch[`rooms/${roomId}/players/${id}/cardCount`] = 0;
                });
            }
            await update(ref(db), lobbyResetBatch);
        } catch(e) {
            console.error("Lobby mutation error:", e);
        }
    }
    enterLobby();
});
