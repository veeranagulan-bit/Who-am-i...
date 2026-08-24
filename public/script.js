const socket = io();

const $ = id => document.getElementById(id);
const homeScreen = $("homeScreen");
const lobbyScreen = $("lobbyScreen");
const characterSelectScreen = $("characterSelectScreen");
const gameScreen = $("gameScreen");
const resultsScreen = $("resultsScreen");
const createModal = $("createModal");
const joinModal = $("joinModal");

let currentRoom = null;
let isHost = false;
let myName = "";
let gameCharacters = [];
let selectedSecretCharacter = null;
let selectedGuess = null;
let selectedEliminateCharacter = null;
let currentPendingQuestion = null;
let latestGameState = null;
let eliminatedCharacters = [];
let myCharacter = null;
let currentCategory = 'anime';

function showOnly(screen) {
    [homeScreen, lobbyScreen, characterSelectScreen, gameScreen, resultsScreen].forEach(s => s.classList.add("hidden"));
    screen.classList.remove("hidden");
}

// Custom Alert System - Clean Game UI
function showCustomAlert(title, message, icon = '⚠️', isDanger = false) {
    const alert = $("customAlert");
    $("alertTitle").textContent = title;
    $("alertMessage").textContent = message;
    $("alertIcon").textContent = icon;
    const button = $("alertButton");
    if (isDanger) {
        button.className = 'alert-button danger';
    } else {
        button.className = 'alert-button';
    }
    alert.classList.add("show");
    return new Promise((resolve) => {
        button.onclick = () => {
            alert.classList.remove("show");
            resolve();
        };
    });
}

// Override showError to use custom alert
function showError(message) {
    showCustomAlert('⚠️ Error', message, '❌', true);
}

$("createGame").onclick = () => { createModal.classList.remove("hidden"); $("createName").focus(); };
$("joinGame").onclick = () => { joinModal.classList.remove("hidden"); $("joinName").focus(); };
$("closeCreate").onclick = () => createModal.classList.add("hidden");
$("closeJoin").onclick = () => joinModal.classList.add("hidden");

$("createRoom").onclick = () => {
    const name = $("createName").value.trim();
    if (!name) return showError("Please enter your name.");
    myName = name;
    socket.emit("createRoom", { name });
};

$("joinRoom").onclick = () => {
    const name = $("joinName").value.trim();
    const roomCode = $("roomCode").value.trim().toUpperCase();
    if (!name) return showError("Please enter your name.");
    if (!roomCode) return showError("Please enter the room code.");
    myName = name;
    socket.emit("joinRoom", { name, roomCode });
};

socket.on("roomCreated", data => {
    currentRoom = data.roomCode;
    isHost = true;
    createModal.classList.add("hidden");
    showLobby();
});

socket.on("roomJoined", data => {
    currentRoom = data.roomCode;
    isHost = false;
    joinModal.classList.add("hidden");
    showLobby();
});

function showLobby() {
    showOnly(lobbyScreen);
    $("displayRoomCode").textContent = currentRoom || "------";
    $("startGame").classList.toggle("hidden", !isHost);
    $("lobbyMessage").textContent = isHost
        ? "You are the host. Select a category and start when your opponent joins."
        : "Waiting for the host to start...";
    
    const categorySelect = $("lobbyCategorySelect");
    if (isHost) {
        categorySelect.style.display = 'block';
        categorySelect.disabled = false;
        categorySelect.value = currentCategory;
    } else {
        categorySelect.style.display = 'block';
        categorySelect.disabled = true;
    }
}

// Category selection in lobby
$("lobbyCategorySelect").onchange = function() {
    if (!isHost) return;
    const category = this.value;
    currentCategory = category;
    socket.emit("updateCategory", { category });
};

socket.on("roomInfo", data => {
    const emoji = data.categoryEmoji || '🎌';
    const name = data.categoryName || 'Anime';
    currentCategory = data.category || 'anime';
    document.querySelectorAll('.anime-badge').forEach(el => {
        if (el.id !== 'lobbyCategoryBadge') {
            el.textContent = `${emoji} ${name.toUpperCase()}`;
        }
    });
    $("lobbyCategory").textContent = `${emoji} ${name}`;
    if (isHost) {
        $("lobbyCategorySelect").value = currentCategory;
    }
});

socket.on("playersUpdated", players => {
    $("playersList").innerHTML = "";
    $("playerCount").textContent = `${players.length} / 2`;
    players.forEach((player, index) => {
        const card = document.createElement("div");
        card.className = "player-card";
        card.innerHTML = `
            <div class="player-avatar">${index === 0 ? "👑" : "🎌"}</div>
            <div class="player-name">${escapeHtml(player.name)}</div>
            ${index === 0 ? '<span class="host">HOST</span>' : ''}
        `;
        $("playersList").appendChild(card);
    });
});

$("startGame").onclick = () => {
    socket.emit("updateCategory", { category: currentCategory });
    socket.emit("startGame");
};

socket.on("gameStarted", () => {
    selectedSecretCharacter = null;
    selectedGuess = null;
    selectedEliminateCharacter = null;
    eliminatedCharacters = [];
    myCharacter = null;
    showOnly(characterSelectScreen);
    $("selectionStatus").textContent = "Choose one character. Your opponent cannot see your choice.";
    buildCharacterSelection();
});

function buildCharacterSelection() {
    $("selectionGrid").innerHTML = "";
    selectedSecretCharacter = null;
    $("selectedCharacterText").textContent = "No character selected";
    $("confirmCharacter").disabled = true;

    gameCharacters.forEach(character => {
        $("selectionGrid").appendChild(makeCharacterCard(character, character => {
            document.querySelectorAll(".selection-character").forEach(c => c.classList.remove("selected"));
            const card = document.querySelector(`[data-character-id="${character.id}"]`);
            card?.classList.add("selected");
            selectedSecretCharacter = character;
            $("selectedCharacterText").textContent = `🔒 Selected: ${character.name}`;
            $("confirmCharacter").disabled = false;
        }, true));
    });
}

function makeCharacterCard(character, onClick, selection = false) {
    const card = document.createElement("div");
    card.className = `character-card ${selection ? "selection-character" : "guess-character"}`;
    card.dataset.characterId = character.id;
    card.innerHTML = `
        <div class="character-image-wrap">
            <img class="character-image" src="${character.image}" alt="${escapeHtml(character.name)}">
            <div class="image-fallback">🎌</div>
        </div>
        <div class="character-name">${escapeHtml(character.name)}</div>
        <div class="character-anime">${escapeHtml(character.anime)}</div>
    `;
    const img = card.querySelector("img");
    img.onerror = () => { img.style.display = "none"; card.querySelector(".image-fallback").style.display = "flex"; };
    card.onclick = () => onClick(character);
    return card;
}

$("confirmCharacter").onclick = () => {
    if (!selectedSecretCharacter) return;
    socket.emit("selectCharacter", { characterId: selectedSecretCharacter.id });
    $("confirmCharacter").disabled = true;
    $("selectionStatus").textContent = "🔒 Character locked! Waiting for your opponent...";
};

socket.on("characterConfirmed", () => {
    $("selectionStatus").textContent = "✅ Locked! Your opponent is choosing now.";
});

socket.on("selectionComplete", () => {
    showOnly(gameScreen);
    $("answerBox").classList.add("hidden");
    $("incomingSection").classList.add("hidden");
    selectedGuess = null;
    selectedEliminateCharacter = null;
    $("selectedGuessText").textContent = "No character selected";
});

socket.on("timerUpdate", data => {
    const timerElement = $("timerValue");
    timerElement.textContent = `${data.timeLeft}s`;
    
    if (data.timeLeft > 30) {
        timerElement.className = 'timer-green';
    } else if (data.timeLeft > 10) {
        timerElement.className = 'timer-yellow';
    } else {
        timerElement.className = 'timer-red';
    }
    
    if (data.playerId === latestGameState?.myId) {
        $("turnIndicator").textContent = `🟢 YOUR TURN — ${data.timeLeft}s left`;
    }
});

socket.on("turnTimeout", data => {
    $("gameStatus").textContent = `⏰ Time's up! ${data.playerName}'s turn now.`;
    $("gameStatus").className = "game-status error";
});

socket.on("gameState", state => {
    latestGameState = state;
    if (state.characters?.length) gameCharacters = state.characters;
    if (state.eliminatedCharacters) eliminatedCharacters = state.eliminatedCharacters;
    if (state.myCharacter) myCharacter = state.myCharacter;
    
    if (state.categoryEmoji && state.categoryName) {
        const displayName = `${state.categoryEmoji} ${state.categoryName.toUpperCase()}`;
        document.querySelectorAll('.anime-badge').forEach(el => {
            if (el.id !== 'lobbyCategoryBadge') {
                el.textContent = displayName;
            }
        });
        $("selectionCategoryName").textContent = state.categoryName;
        $("gameCategoryName").textContent = `2 PLAYER • ${state.categoryName.toUpperCase()}`;
        $("gameCategoryBadge").textContent = `${state.categoryEmoji} ${state.categoryName.toUpperCase()}`;
    }
    
    if (myCharacter) {
        $("myCharacterDisplay").classList.remove("hidden");
        $("myCharacterImage").src = myCharacter.image || '';
        $("myCharacterName").textContent = myCharacter.name;
        $("myCharacterAnime").textContent = `From: ${myCharacter.anime}`;
    }
    
    if (state.phase === "selecting") {
        buildCharacterSelection();
        return;
    }
    if (state.phase === "finished") {
        renderFinished(state);
        return;
    }
    if (state.phase !== "playing") return;

    gameCharacters = state.characters || gameCharacters;
    renderGameState(state);
});

function renderGameState(state) {
    $("myNameLabel").textContent = state.myName || "YOU";
    $("opponentNameLabel").textContent = state.opponent?.name || "OPPONENT";
    $("gameScore").textContent = state.score || 0;
    $("opponentScore").textContent = state.opponentScore || 0;
    $("targetName").textContent = state.opponent?.name || "Opponent";

    const waiting = !!state.pendingQuestion;
    const canAct = state.yourTurn && !waiting;
    
    $("askQuestion").disabled = !canAct;
    $("askCustomQuestion").disabled = !canAct;
    $("customQuestion").disabled = !canAct;
    
    $("guessButton").disabled = !canAct || !selectedGuess;
    $("eliminateButton").disabled = !selectedEliminateCharacter || 
        (selectedEliminateCharacter && eliminatedCharacters.includes(selectedEliminateCharacter.id));

    if (state.pendingQuestion?.toId === state.myId) {
        currentPendingQuestion = state.pendingQuestion;
        $("incomingSection").classList.remove("hidden");
        $("incomingQuestionText").textContent = `“${state.pendingQuestion.text}”`;
        $("gameStatus").textContent = `${state.pendingQuestion.fromName} is waiting for your answer.`;
        $("gameStatus").className = "game-status info";
    } else {
        $("incomingSection").classList.add("hidden");
        if (state.pendingQuestion) {
            $("gameStatus").textContent = "Your question has been sent. Waiting for your opponent's answer...";
            $("gameStatus").className = "game-status info";
        } else if (state.yourTurn) {
            $("turnIndicator").textContent = `🟢 YOUR TURN — ${state.turnTimeLeft || 60}s left`;
            $("gameStatus").textContent = "Your turn! Ask a question, eliminate a character, or make a final guess.";
            $("gameStatus").className = "game-status";
        } else {
            $("turnIndicator").textContent = `🔴 ${state.opponent?.name || "Opponent"}'s turn`;
            $("gameStatus").textContent = "Opponent's turn. Think about your next move.";
            $("gameStatus").className = "game-status";
        }
    }

    renderGuessGrid(state.characters, state.eliminatedCharacters);
}

function renderGuessGrid(characters, eliminated = []) {
    $("characterGrid").innerHTML = "";
    selectedGuess = null;
    selectedEliminateCharacter = null;
    $("selectedGuessText").textContent = "No character selected";
    $("guessButton").disabled = true;
    $("eliminateButton").disabled = true;
    
    characters.forEach(character => {
        const card = document.createElement("div");
        card.className = `character-card guess-character`;
        if (eliminated.includes(character.id)) {
            card.classList.add("eliminated");
        }
        card.dataset.characterId = character.id;
        card.innerHTML = `
            <div class="character-image-wrap">
                <img class="character-image" src="${character.image}" alt="${escapeHtml(character.name)}">
                <div class="image-fallback">🎌</div>
            </div>
            <div class="character-name">${escapeHtml(character.name)}</div>
            <div class="character-anime">${escapeHtml(character.anime)}</div>
        `;
        const img = card.querySelector("img");
        img.onerror = () => { img.style.display = "none"; card.querySelector(".image-fallback").style.display = "flex"; };
        
        card.onclick = () => {
            if (eliminated.includes(character.id)) return;
            
            document.querySelectorAll(".guess-character").forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
            
            selectedGuess = character;
            selectedEliminateCharacter = character;
            $("selectedGuessText").textContent = `Selected: ${character.name}`;
            
            const waiting = !!latestGameState?.pendingQuestion;
            const canAct = latestGameState?.yourTurn && !waiting;
            $("guessButton").disabled = !canAct;
            $("eliminateButton").disabled = false;
        };
        
        $("characterGrid").appendChild(card);
    });
}

function containsCharacterName(text) {
    const lowerText = text.toLowerCase();
    // Get all character names from the current category
    const characterNames = gameCharacters.map(c => c.name.toLowerCase());
    // Check if any character name appears in the text (as a whole word)
    return characterNames.some(name => {
        // Check for whole word match
        const regex = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        return regex.test(text);
    });
}

function sendQuestion(text) {
    text = text.trim();
    if (!text || latestGameState?.yourTurn !== true || latestGameState?.pendingQuestion) return;
    
    // Check for character names in the question
    if (containsCharacterName(text)) {
        showCustomAlert(
            '🚫 Rule Violation!',
            'You cannot ask for the character\'s name directly! Please rephrase your question.',
            '🚫',
            true
        );
        return;
    }
    
    socket.emit("askQuestion", { text });
    $("questionSelect").value = "";
    $("customQuestion").value = "";
    $("answerBox").classList.add("hidden");
}

$("askQuestion").onclick = () => sendQuestion($("questionSelect").value);
$("askCustomQuestion").onclick = () => sendQuestion($("customQuestion").value);
$("customQuestion").addEventListener("keydown", e => { 
    if (e.key === "Enter") sendQuestion(e.target.value); 
});

$("yesButton").onclick = () => answerQuestion(true);
$("noButton").onclick = () => answerQuestion(false);

function answerQuestion(answer) {
    if (!currentPendingQuestion) return;
    socket.emit("answerQuestion", { questionId: currentPendingQuestion.id, answer });
    currentPendingQuestion = null;
    $("incomingSection").classList.add("hidden");
}

$("eliminateButton").onclick = () => {
    if (!selectedEliminateCharacter) {
        showError("Select a character first.");
        return;
    }
    if (eliminatedCharacters.includes(selectedEliminateCharacter.id)) {
        showError("This character is already eliminated.");
        return;
    }
    
    socket.emit("eliminateCharacter", { characterId: selectedEliminateCharacter.id });
    
    selectedEliminateCharacter = null;
    selectedGuess = null;
    $("selectedGuessText").textContent = "No character selected";
    $("guessButton").disabled = true;
    $("eliminateButton").disabled = true;
    document.querySelectorAll(".guess-character").forEach(c => c.classList.remove("selected"));
};

$("guessButton").onclick = () => {
    if (!selectedGuess) {
        showError("Select a character first.");
        return;
    }
    if (!latestGameState?.yourTurn || latestGameState.pendingQuestion) {
        showError("It's not your turn or there's a pending question.");
        return;
    }
    
    socket.emit("makeGuess", { characterId: selectedGuess.id });
    
    selectedGuess = null;
    selectedEliminateCharacter = null;
    $("selectedGuessText").textContent = "No character selected";
    $("guessButton").disabled = true;
    $("eliminateButton").disabled = true;
    document.querySelectorAll(".guess-character").forEach(c => c.classList.remove("selected"));
};

socket.on("characterEliminated", data => {
    if (!eliminatedCharacters.includes(data.characterId)) {
        eliminatedCharacters.push(data.characterId);
    }
    
    const card = document.querySelector(`.guess-character[data-character-id="${data.characterId}"]`);
    if (card) {
        card.classList.add("eliminated");
        card.classList.remove("selected");
    }
    
    if (selectedGuess?.id === data.characterId || selectedEliminateCharacter?.id === data.characterId) {
        selectedGuess = null;
        selectedEliminateCharacter = null;
        $("selectedGuessText").textContent = "No character selected";
        $("guessButton").disabled = true;
        $("eliminateButton").disabled = true;
    }
    
    if (data.byYou) {
        $("gameStatus").textContent = `✅ You eliminated a character!`;
        $("gameStatus").className = "game-status success";
    } else {
        $("gameStatus").textContent = `😮 Your opponent eliminated a character!`;
        $("gameStatus").className = "game-status info";
    }
});

socket.on("questionAnswered", data => {
    $("answerBox").classList.remove("hidden");
    $("answerText").textContent = data.answer ? "✅ YES" : "❌ NO";
    $("answerText").className = data.answer ? "yes-text" : "no-text";
});

socket.on("answerSent", data => {
    $("gameStatus").textContent = data.answer ? "You answered YES. Turn passed to your opponent." : "You answered NO. Turn passed to your opponent.";
    $("gameStatus").className = "game-status info";
});

socket.on("guessResult", data => {
    if (data.correct) {
        $("gameStatus").textContent = `🎉 Correct! You earned ${data.points} points.`;
        $("gameStatus").className = "game-status success";
    } else {
        $("gameStatus").textContent = `❌ Wrong guess! ${data.points} points. Your opponent gets the next turn.`;
        $("gameStatus").className = "game-status error";
    }
});

socket.on("opponentWrongGuess", data => {
    $("gameStatus").textContent = `😏 Your opponent guessed ${data.guessedCharacter} incorrectly. Your turn!`;
    $("gameStatus").className = "game-status info";
});

socket.on("waitingForOpponent", () => {
    $("gameStatus").textContent = "⏳ Waiting for your opponent to agree to play again...";
    $("gameStatus").className = "game-status info";
    $("playAgain").disabled = true;
});

socket.on("opponentWantsPlayAgain", data => {
    showCustomAlert(
        '🔄 Play Again?',
        `${data.playerName} wants to play again. Do you agree?`,
        '🔄',
        false
    ).then(() => {
        socket.emit("playAgain");
    });
});

function renderFinished(state) {
    showOnly(resultsScreen);
    const players = [...(state.players || [])].sort((a, b) => b.score - a.score);
    const winner = players[0];
    $("resultTitle").textContent = winner?.id === state.myId ? "🏆 YOU WIN!" : `🏆 ${winner?.name || "Winner"} WINS!`;
    $("resultSubtitle").textContent = state.result
        ? `${state.result.guessedCharacter} was the secret character.`
        : "Game complete!";

    $("rankingList").innerHTML = "";
    players.forEach((p, index) => {
        const row = document.createElement("div");
        row.className = "ranking-row";
        row.innerHTML = `<span class="rank">${index === 0 ? "🥇" : "🥈"}</span><strong>${escapeHtml(p.name)}</strong><span>${p.score} pts</span>`;
        $("rankingList").appendChild(row);
    });

    if (state.result) {
        $("resultDetails").innerHTML = `
            <div>⚡ Guess time: <b>${state.result.seconds}s</b></div>
            <div>🎯 Guess bonus: <b>+${state.result.points} pts</b></div>
        `;
    }
    
    $("playAgain").disabled = false;
}

$("playAgain").onclick = () => {
    socket.emit("playAgain");
    $("characterGrid").dataset.ready = "false";
    selectedGuess = null;
    selectedEliminateCharacter = null;
    $("playAgain").disabled = true;
    $("resultSubtitle").textContent = "⏳ Waiting for opponent's response...";
};

$("closeGame").onclick = () => socket.emit("closeGame");

socket.on("gameClosed", () => {
    window.location.href = "/";
});

socket.on("playerLeft", () => {
    showOnly(lobbyScreen);
    isHost = true;
    showLobby();
    showCustomAlert('👋 Player Left', 'Your opponent left the game. Waiting for a new player.', '👋');
});

socket.on("newHost", data => {
    if (data.hostId === socket.id) {
        isHost = true;
        $("startGame").classList.remove("hidden");
    }
});

socket.on("errorMessage", showError);

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}