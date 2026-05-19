/* =========================================================
   CYBER UNO MULTIPLAYER - BUG-FREE PREMIUM ENGINE
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, onDisconnect, update, child } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";

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

let myPlayerId = 'player_' + Math.floor(Math.random() * 1000000);
let myName = '';
let currentRoomId = null;
let isHost = false;
let amISpectator = false;
let myCards = [];
let currentTurnId = null;
let currentColor = '';

const COLORS = ['red', 'blue', 'green', 'yellow'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Skip', 'Reverse', 'Draw2'];

// Attach to Window for HTML onClick recognition
window.createUnoRoom = createUnoRoom;
window.joinUnoRoom = joinUnoRoom;
window.sendChatMessage = sendChatMessage;
window.toggleIngameChat = toggleIngameChat;
window.startUnoGame = startUnoGame;
window.attemptPlayCard = attemptPlayCard;
window.selectWildColor = selectWildColor;
window.backToLobby = backToLobby;
window.triggerUnoShout = triggerUnoShout;
window.drawCard = drawCard;

function createUnoRoom() {
    myName = document.getElementById('player-name').value.trim() || 'CyberHost';
    currentRoomId = Math.floor(1000 + Math.random() * 9000).toString();
    isHost = true;
    amISpectator = false;

    set(ref(db, 'uno_rooms/' + currentRoomId), {
        hostId: myPlayerId,
        state: 'lobby',
        createdAt: new Date().getTime(),
        leaderboard: []
    }).then(() => joinRoomLogic(currentRoomId, false));
}

function joinUnoRoom(asSpectator) {
    myName = document.getElementById('player-name').value.trim() || (asSpectator ? 'Watcher' : 'Player');
    const inputCode = document.getElementById('room-code-input').value.trim();
    if (inputCode.length === 4) {
        currentRoomId = inputCode;
        amISpectator = asSpectator;
        joinRoomLogic(currentRoomId, asSpectator);
    } else {
        alert("Enter a valid 4-digit Matrix Code!");
    }
}

function joinRoomLogic(roomId, spectator) {
    const playerRef = ref(db, `uno_rooms/${roomId}/players/${myPlayerId}`);
    set(playerRef, {
        name: myName,
        isSpectator: spectator,
        cardCount: 0,
        cards: [],
        hasCalledUno: false,
        joinedAt: new Date().getTime()
    });

    onDisconnect(playerRef).remove();

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('waiting-screen').classList.remove('hidden');
    document.getElementById('display-room-code').innerText = roomId;
    document.getElementById('role-badge').innerText = spectator ? "SPECTATOR" : (isHost ? "HOST" : "PLAYER");
    if (isHost) document.getElementById('btn-start').classList.remove('hidden');

    setupRoomListeners(roomId);
}

function setupRoomListeners(roomId) {
    const roomRef = ref(db, `uno_rooms/${roomId}`);

    onValue(child(roomRef, 'players'), (snapshot) => {
        const players = snapshot.val() || {};
        updateLobbyPlayersList(players);
        if (!document.getElementById('hud').classList.contains('hidden')) {
            updateOpponentsArena(players);
            updateFooterTracker(players);
        }
    });

    onValue(child(roomRef, 'state'), (snapshot) => {
        const state = snapshot.val();
        if (state === 'playing') transitionToGame();
        else if (state === 'finished') showGameOverScreen();
        else if (state === 'lobby' && !document.getElementById('gameover-screen').classList.contains('hidden')) resetToLobbyState();
    });

    onValue(child(roomRef, 'chats'), (snapshot) => {
        const chatBoxLobby = document.getElementById('lobby-chat-messages');
        const chatBoxIngame = document.getElementById('ingame-chat-messages');
        chatBoxLobby.innerHTML = '';
        chatBoxIngame.innerHTML = '';
        snapshot.forEach((childSnap) => {
            const msg = childSnap.val();
            const chatHtml = `<div><span style="color:#00f0ff;">[${msg.sender}]</span>: ${msg.text}</div>`;
            chatBoxLobby.innerHTML += chatHtml;
            chatBoxIngame.innerHTML += chatHtml;
        });
        chatBoxLobby.scrollTop = chatBoxLobby.scrollHeight;
        chatBoxIngame.scrollTop = chatBoxIngame.scrollHeight;
    });

    onValue(child(roomRef, 'topCard'), (snapshot) => {
        const card = snapshot.val();
        if (card) renderTopCard(card);
    });

    onValue(child(roomRef, 'currentTurn'), (snapshot) => {
        currentTurnId = snapshot.val();
        if (currentTurnId) {
            onValue(ref(db, `uno_rooms/${currentRoomId}/players/${currentTurnId}/name`), (nameSnap) => {
                document.getElementById('current-player-name').innerText = nameSnap.val() || '---';
            }, { onlyOnce: true });
        }
    });

    onValue(child(roomRef, 'leaderboard'), (snapshot) => {
        const leaders = snapshot.val() || [];
        updateLeaderboardUI(leaders);
    });

    if (!amISpectator) {
        onValue(ref(db, `uno_rooms/${roomId}/players/${myPlayerId}/cards`), (snapshot) => {
            myCards = snapshot.val() || [];
            renderMyHand(myCards);
            checkMyWinCondition(myCards.length);
        });
    }
}

function updateLobbyPlayersList(players) {
    const list = document.getElementById('players-list');
    list.innerHTML = '';
    for (let id in players) {
        let p = players[id];
        let role = p.isSpectator ? '<i class="fas fa-eye text-glow"></i>' : '<i class="fas fa-user-astronaut"></i>';
        list.innerHTML += `<li>${role} ${p.name} ${id === myPlayerId ? '(You)' : ''}</li>`;
    }
}

function sendChatMessage(type) {
    const inputId = type === 'lobby' ? 'lobby-chat-input' : 'ingame-chat-input';
    const input = document.getElementById(inputId);
    const msg = input.value.trim();
    if (msg.length > 0 && currentRoomId) {
        push(ref(db, `uno_rooms/${currentRoomId}/chats`), {
            sender: myName, text: msg, time: new Date().toLocaleTimeString()
        });
        input.value = '';
    }
}

function toggleIngameChat() {
    const body = document.getElementById('ingame-chat-body');
    const icon = document.getElementById('chat-toggle-icon');
    body.classList.toggle('hidden');
    icon.className = body.classList.contains('hidden') ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
}

function triggerUnoShout() {
    if(myCards.length <= 2 && currentRoomId) {
        push(ref(db, `uno_rooms/${currentRoomId}/chats`), {
            sender: "SYSTEM", text: `🚨 ${myName.toUpperCase()} SHOUTED UNO! 🚨`, time: new Date().toLocaleTimeString()
        });
        alert("UNO Call Broadcasted!");
    } else {
        alert("You must have 2 or fewer cards to shout UNO!");
    }
}

function startUnoGame() {
    if (!isHost) return;
    
    let deck = [];
    COLORS.forEach(color => {
        VALUES.forEach(val => {
            deck.push({color: color, value: val, type: 'normal'});
            if(val !== '0') deck.push({color: color, value: val, type: 'normal'});
        });
    });
    for(let i=0; i<4; i++) deck.push({color: 'none', value: 'Wild', type: 'wild'});
    deck.sort(() => Math.random() - 0.5);

    onValue(ref(db, `uno_rooms/${currentRoomId}/players`), (snapshot) => {
        const players = snapshot.val();
        let playerIds = [];
        for (let id in players) {
            if (!players[id].isSpectator) {
                let hand = deck.splice(0, 7);
                set(ref(db, `uno_rooms/${currentRoomId}/players/${id}/cards`), hand);
                set(ref(db, `uno_rooms/${currentRoomId}/players/${id}/cardCount`), 7);
                playerIds.push(id);
            }
        }
        let topCard = deck.find(c => c.type === 'normal');
        deck.splice(deck.indexOf(topCard), 1);

        update(ref(db, `uno_rooms/${currentRoomId}`), {
            state: 'playing', deck: deck, topCard: topCard, activeColor: topCard.color,
            currentTurn: playerIds[0], turnOrder: playerIds, direction: 1
        });
    }, { onlyOnce: true });
}

function transitionToGame() {
    document.getElementById('waiting-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    if (amISpectator) {
        document.getElementById('spectator-hud-alert').classList.remove('hidden');
        document.getElementById('player-hand-section').classList.add('hidden');
    }
}

function renderMyHand(cards) {
    if (amISpectator) return;
    const wrapper = document.getElementById('player-cards-wrapper');
    document.getElementById('hand-count-lbl').innerText = `YOUR MATRIX: ${cards.length} CARDS`;
    wrapper.innerHTML = '';
    cards.forEach((card, index) => {
        let cardClass = card.type === 'wild' ? 'card-wild' : `card-${card.color}`;
        let displayVal = card.value === 'Reverse' ? '⟲' : (card.value === 'Skip' ? '⊘' : (card.value === 'Draw2' ? '+2' : card.value));
        let cardDiv = document.createElement('div');
        cardDiv.className = `playable-card ${cardClass}`;
        cardDiv.innerText = displayVal;
        cardDiv.onclick = () => attemptPlayCard(index);
        wrapper.appendChild(cardDiv);
    });
}

function renderTopCard(card) {
    const pile = document.getElementById('discard-pile');
    pile.classList.remove('empty-pile');
    let cardClass = card.type === 'wild' ? 'card-wild shadow-glow' : `card-${card.color}`;
    let displayVal = card.value === 'Reverse' ? '⟲' : (card.value === 'Skip' ? '⊘' : (card.value === 'Draw2' ? '+2' : card.value));
    pile.className = `uno-card shadow-glow ${cardClass}`;
    pile.innerHTML = displayVal;
    currentColor = card.activeColor || card.color;
    pile.style.borderColor = getCssColor(currentColor);
}

function getCssColor(color) {
    switch(color) {
        case 'red': return '#ff0055'; case 'blue': return '#00f0ff';
        case 'green': return '#00ff66'; case 'yellow': return '#ffea00'; default: return '#fff';
    }
}

function updateOpponentsArena(players) {
    const arena = document.getElementById('opponents-arena');
    arena.innerHTML = '';
    for (let id in players) {
        if (id !== myPlayerId && !players[id].isSpectator) {
            let p = players[id];
            let isTurn = (id === currentTurnId) ? 'active-turn' : '';
            arena.innerHTML += `<div class="opp-avatar ${isTurn}"><div class="opp-card-back">${p.cardCount}</div><div class="opp-name">${p.name}</div></div>`;
        }
    }
}

function attemptPlayCard(cardIndex) {
    if (currentTurnId !== myPlayerId) {
        alert("Not your transmission turn!"); return;
    }
    const card = myCards[cardIndex];
    onValue(ref(db, `uno_rooms/${currentRoomId}`), (snapshot) => {
        const state = snapshot.val();
        const top = state.topCard;
        const activeCol = state.activeColor || top.color;
        
        if (card.color === activeCol || card.value === top.value || card.type === 'wild') {
            if (card.type === 'wild') {
                document.getElementById('color-chooser-overlay').classList.remove('hidden');
                window.pendingCardIndex = cardIndex; 
            } else {
                executePlayCard(cardIndex, card, card.color);
            }
        } else { alert("Matrix Missalign! Card does not match color or value."); }
    }, { onlyOnce: true });
}

function selectWildColor(color) {
    document.getElementById('color-chooser-overlay').classList.add('hidden');
    let card = myCards[window.pendingCardIndex];
    executePlayCard(window.pendingCardIndex, card, color);
}

function executePlayCard(index, card, chosenColor) {
    myCards.splice(index, 1);
    update(ref(db, `uno_rooms/${currentRoomId}/players/${myPlayerId}`), { cards: myCards, cardCount: myCards.length });
    let topCardUpdate = card; topCardUpdate.activeColor = chosenColor;
    update(ref(db, `uno_rooms/${currentRoomId}`), { topCard: topCardUpdate, activeColor: chosenColor });
    passTurnClientSide();
}

function drawCard() {
    if (currentTurnId !== myPlayerId || amISpectator) return;
    onValue(ref(db, `uno_rooms/${currentRoomId}/deck`), (snapshot) => {
        let deck = snapshot.val() || [];
        if(deck.length > 0) {
            let drawn = deck.pop();
            myCards.push(drawn);
            update(ref(db, `uno_rooms/${currentRoomId}/players/${myPlayerId}`), { cards: myCards, cardCount: myCards.length });
            update(ref(db, `uno_rooms/${currentRoomId}`), { deck: deck });
            passTurnClientSide();
        }
    }, { onlyOnce: true });
}

/* ========================================================
   BUG FIXED: TURN PASSING LOGIC (Skips Spectators Properly)
   ======================================================== */
function passTurnClientSide() {
    onValue(ref(db, `uno_rooms/${currentRoomId}`), (snapshot) => {
        let state = snapshot.val();
        let order = state.turnOrder;
        let players = state.players;
        let currIdx = order.indexOf(myPlayerId);
        let nextIdx = currIdx;
        let foundNext = false;

        // Loop to find the next active player who is NOT a spectator
        for(let i = 0; i < order.length; i++) {
            nextIdx = (nextIdx + state.direction + order.length) % order.length;
            let nextPlayerId = order[nextIdx];
            if(players[nextPlayerId] && !players[nextPlayerId].isSpectator) {
                foundNext = true;
                break;
            }
        }
        
        if(foundNext) {
            update(ref(db, `uno_rooms/${currentRoomId}`), { currentTurn: order[nextIdx] });
        } else {
            // Only 1 person left, match over
            update(ref(db, `uno_rooms/${currentRoomId}`), { state: 'finished' });
        }
    }, { onlyOnce: true });
}

function checkMyWinCondition(cardCount) {
    if (cardCount === 0 && !amISpectator && currentRoomId) {
        alert("You have cleared your Matrix Grid! Moving to Spectator Core...");
        amISpectator = true;
        update(ref(db, `uno_rooms/${currentRoomId}/players/${myPlayerId}`), { isSpectator: true });

        onValue(ref(db, `uno_rooms/${currentRoomId}/leaderboard`), (snapshot) => {
            let board = snapshot.val() || [];
            if (!board.some(b => b.id === myPlayerId)) {
                board.push({ name: myName, id: myPlayerId });
                set(ref(db, `uno_rooms/${currentRoomId}/leaderboard`), board);
            }
            onValue(ref(db, `uno_rooms/${currentRoomId}/players`), (psnap) => {
                const players = psnap.val();
                let activeCount = Object.values(players).filter(p => !p.isSpectator).length;
                if (activeCount <= 1) update(ref(db, `uno_rooms/${currentRoomId}`), { state: 'finished' });
            }, { onlyOnce: true });
        }, { onlyOnce: true });

        document.getElementById('player-hand-section').classList.add('hidden');
        document.getElementById('spectator-hud-alert').classList.remove('hidden');
    }
}

function showGameOverScreen() {
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('gameover-screen').classList.remove('hidden');
    onValue(ref(db, `uno_rooms/${currentRoomId}/leaderboard`), (snapshot) => {
        let board = snapshot.val() || [];
        if(board.length > 0) document.getElementById('final-winner-lbl').innerText = `WINNER: ${board[0].name.toUpperCase()}`;
    }, { onlyOnce: true });
}

function updateLeaderboardUI(leaders) {
    let html = '';
    leaders.forEach((l, index) => {
        let medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : '🏅'));
        html += `<li>${medal} ${l.name}</li>`;
    });
    document.getElementById('leaderboard-list').innerHTML = html;
    if(leaders.length > 0) {
        document.getElementById('lobby-leaderboard').classList.remove('hidden');
        document.getElementById('lobby-leaderboard-list').innerHTML = html;
    }
}

function backToLobby() {
    if(isHost) update(ref(db, `uno_rooms/${currentRoomId}`), { state: 'lobby' });
}

function resetToLobbyState() {
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('waiting-screen').classList.remove('hidden');
    amISpectator = false;
    myCards = [];
    document.getElementById('spectator-hud-alert').classList.add('hidden');
    document.getElementById('player-hand-section').classList.remove('hidden');
    update(ref(db, `uno_rooms/${currentRoomId}/players/${myPlayerId}`), { isSpectator: false, cardCount: 0, cards: [] });
}

function updateFooterTracker(players) {
    const lanes = document.getElementById('tracker-lanes');
    lanes.innerHTML = '';
    let totalCardsLeft = 0;
    for(let id in players) {
        if(!players[id].isSpectator) {
            let count = players[id].cardCount || 0;
            totalCardsLeft += count;
            let percentage = Math.max(0, 100 - ((count / 7) * 100)); 
            let dot = document.createElement('div');
            dot.className = 'player-progress-dot';
            dot.style.left = `${percentage}%`;
            dot.style.backgroundColor = (id === myPlayerId) ? '#ffea00' : '#00f0ff';
            lanes.appendChild(dot);
        }
    }
    document.getElementById('cards-left-tracker-txt').innerText = `${totalCardsLeft} CORE UNITS`;
}
