const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { characters, categoryEmojis, categoryNames } = require("./game/characters");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

app.use(express.static("public"));
const rooms = {};

function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function getPlayer(room, id) {
    return room?.players.find(p => p.id === id);
}

function publicCharacters(category) {
    const charList = characters[category] || characters.anime;
    return charList.map(c => ({ id: c.id, name: c.name, anime: c.anime, image: c.image }));
}

function publicPlayers(room) {
    return room.players.map(p => ({ id: p.id, name: p.name, score: p.score }));
}

function containsCharacterName(text, category) {
    const lowerText = text.toLowerCase();
    const charList = characters[category] || characters.anime;
    const characterNames = charList.map(c => c.name.toLowerCase());
    return characterNames.some(name => {
        const regex = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        return regex.test(text);
    });
}

function emitGameState(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    room.players.forEach(player => {
        const opponent = room.players.find(p => p.id !== player.id);
        
        // Get player-specific eliminated characters
        const playerEliminated = room.playerEliminations?.[player.id] || [];
        
        io.to(player.id).emit("gameState", {
            roomCode,
            phase: room.phase,
            myId: player.id,
            myName: player.name,
            opponent: opponent ? { id: opponent.id, name: opponent.name, score: opponent.score } : null,
            score: player.score,
            opponentScore: opponent?.score || 0,
            currentTurnPlayerId: room.currentTurnPlayerId,
            yourTurn: room.currentTurnPlayerId === player.id,
            pendingQuestion: room.pendingQuestion,
            characters: publicCharacters(room.category || 'anime'),
            players: publicPlayers(room),
            gameStartedAt: room.gameStartedAt,
            winnerId: room.winnerId || null,
            result: room.result || null,
            eliminatedCharacters: playerEliminated, // Player-specific eliminations
            category: room.category || 'anime',
            categoryEmoji: categoryEmojis[room.category || 'anime'],
            categoryName: categoryNames[room.category || 'anime'],
            turnTimeLeft: room.turnTimeLeft || 60,
            myCharacter: player.character
        });
    });
}

function sendError(socket, message) {
    socket.emit("errorMessage", message);
}

function startTurnTimer(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    
    if (room.timerInterval) {
        clearInterval(room.timerInterval);
    }
    
    room.turnTimeLeft = 60;
    
    room.timerInterval = setInterval(() => {
        const currentRoom = rooms[roomCode];
        if (!currentRoom || currentRoom.phase !== "playing") {
            clearInterval(currentRoom?.timerInterval);
            return;
        }
        
        currentRoom.turnTimeLeft = (currentRoom.turnTimeLeft || 60) - 1;
        
        currentRoom.players.forEach(player => {
            io.to(player.id).emit("timerUpdate", {
                timeLeft: currentRoom.turnTimeLeft,
                playerId: currentRoom.currentTurnPlayerId
            });
        });
        
        if (currentRoom.turnTimeLeft <= 0) {
            clearInterval(currentRoom.timerInterval);
            const opponent = currentRoom.players.find(p => p.id !== currentRoom.currentTurnPlayerId);
            if (opponent) {
                currentRoom.currentTurnPlayerId = opponent.id;
                currentRoom.turnTimeLeft = 60;
                currentRoom.players.forEach(player => {
                    io.to(player.id).emit("turnTimeout", {
                        newTurnPlayerId: opponent.id,
                        playerName: opponent.name
                    });
                });
                emitGameState(roomCode);
                startTurnTimer(roomCode);
            }
        }
    }, 1000);
}

io.on("connection", socket => {
    console.log("Player connected:", socket.id);

    socket.on("createRoom", data => {
        const name = String(data?.name || "").trim();
        if (!name) return sendError(socket, "Please enter your name.");

        let roomCode = generateRoomCode();
        while (rooms[roomCode]) roomCode = generateRoomCode();

        rooms[roomCode] = {
            host: socket.id,
            players: [{ id: socket.id, name, score: 0, character: null }],
            phase: "lobby",
            currentTurnPlayerId: null,
            pendingQuestion: null,
            questionCounter: 0,
            gameStartedAt: null,
            winnerId: null,
            result: null,
            category: 'anime',
            turnTimeLeft: 60,
            timerInterval: null,
            playAgainRequests: {},
            playerEliminations: {} // Track eliminations per player
        };

        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.emit("roomCreated", { roomCode });
        io.to(roomCode).emit("roomInfo", { 
            category: 'anime',
            categoryEmoji: '🎌',
            categoryName: 'Anime'
        });
        io.to(roomCode).emit("playersUpdated", publicPlayers(rooms[roomCode]));
    });

    socket.on("joinRoom", data => {
        const name = String(data?.name || "").trim();
        const roomCode = String(data?.roomCode || "").trim().toUpperCase();
        if (!name) return sendError(socket, "Please enter your name.");
        if (!roomCode) return sendError(socket, "Please enter the room code.");

        const room = rooms[roomCode];
        if (!room) return sendError(socket, "Room does not exist.");
        if (room.phase !== "lobby") return sendError(socket, "The game has already started.");
        if (room.players.length >= 2) return sendError(socket, "This game is limited to 2 players.");
        if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            return sendError(socket, "That name is already being used.");
        }

        room.players.push({ id: socket.id, name, score: 0, character: null });
        room.playerEliminations[socket.id] = []; // Initialize eliminations for new player
        
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.emit("roomJoined", { roomCode });
        io.to(roomCode).emit("roomInfo", { 
            category: room.category || 'anime',
            categoryEmoji: categoryEmojis[room.category || 'anime'],
            categoryName: categoryNames[room.category || 'anime']
        });
        io.to(roomCode).emit("playersUpdated", publicPlayers(room));
    });

    socket.on("updateCategory", data => {
        const room = rooms[socket.roomCode];
        if (!room) return;
        if (room.host !== socket.id) return sendError(socket, "Only the host can change the category.");
        if (room.phase !== "lobby") return sendError(socket, "Cannot change category after game starts.");
        
        const category = data?.category || 'anime';
        if (!characters[category]) return sendError(socket, "Invalid category.");
        
        room.category = category;
        io.to(socket.roomCode).emit("roomInfo", { 
            category: category,
            categoryEmoji: categoryEmojis[category],
            categoryName: categoryNames[category]
        });
    });

    socket.on("startGame", () => {
        const room = rooms[socket.roomCode];
        if (!room) return sendError(socket, "Room not found.");
        if (room.host !== socket.id) return sendError(socket, "Only the host can start the game.");
        if (room.players.length !== 2) return sendError(socket, "Exactly 2 players are required.");

        room.phase = "selecting";
        room.playerEliminations = {}; // Reset eliminations
        room.players.forEach(p => { 
            p.character = null; 
            p.score = 0;
            room.playerEliminations[p.id] = []; // Initialize empty eliminations
        });
        io.to(socket.roomCode).emit("gameStarted");
        emitGameState(socket.roomCode);
    });

    socket.on("selectCharacter", data => {
        const room = rooms[socket.roomCode];
        if (!room || room.phase !== "selecting") return sendError(socket, "Character selection is not active.");
        const player = getPlayer(room, socket.id);
        const selected = characters[room.category || 'anime'].find(c => c.id === data?.characterId);
        if (!player || !selected) return sendError(socket, "Invalid character.");

        player.character = selected;
        socket.emit("characterConfirmed");

        if (room.players.every(p => p.character)) {
            room.phase = "playing";
            room.currentTurnPlayerId = room.players[0].id;
            room.pendingQuestion = null;
            room.gameStartedAt = Date.now();
            room.turnTimeLeft = 60;
            io.to(socket.roomCode).emit("selectionComplete");
            emitGameState(socket.roomCode);
            startTurnTimer(socket.roomCode);
        }
    });

    socket.on("eliminateCharacter", data => {
        const room = rooms[socket.roomCode];
        if (!room || room.phase !== "playing") return sendError(socket, "The game is not active.");
        
        const charId = String(data?.characterId || "");
        const character = characters[room.category || 'anime'].find(c => c.id === charId);
        if (!character) return sendError(socket, "Invalid character.");

        // Only eliminate for the player who performed the action
        if (!room.playerEliminations[socket.id]) {
            room.playerEliminations[socket.id] = [];
        }
        
        if (!room.playerEliminations[socket.id].includes(charId)) {
            room.playerEliminations[socket.id].push(charId);
            
            // Notify only the player who eliminated
            io.to(socket.id).emit("characterEliminated", { 
                characterId: charId, 
                byYou: true 
            });
            
            // Notify opponent that a character was eliminated (without revealing which one)
            const opponent = room.players.find(p => p.id !== socket.id);
            if (opponent) {
                io.to(opponent.id).emit("opponentEliminated", { 
                    message: "Your opponent eliminated a character!"
                });
            }
            
            // Update game state for both players (with their specific eliminations)
            emitGameState(socket.roomCode);
        }
    });

    socket.on("askQuestion", data => {
        const room = rooms[socket.roomCode];
        if (!room || room.phase !== "playing") return sendError(socket, "The game is not active.");
        if (room.currentTurnPlayerId !== socket.id) return sendError(socket, "It is not your turn.");
        if (room.pendingQuestion) return sendError(socket, "Answer the current question first.");

        const text = String(data?.text || "").trim();
        if (!text || text.length > 160) return sendError(socket, "Enter a question between 1 and 160 characters.");
        
        if (containsCharacterName(text, room.category || 'anime')) {
            return sendError(socket, "❌ You cannot ask for the character's name directly! Be creative!");
        }

        const opponent = room.players.find(p => p.id !== socket.id);
        room.questionCounter++;
        room.pendingQuestion = {
            id: room.questionCounter,
            fromId: socket.id,
            fromName: getPlayer(room, socket.id).name,
            toId: opponent.id,
            text
        };

        room.turnTimeLeft = 60;
        if (room.timerInterval) {
            clearInterval(room.timerInterval);
            startTurnTimer(socket.roomCode);
        }

        emitGameState(socket.roomCode);
        io.to(opponent.id).emit("incomingQuestion", room.pendingQuestion);
    });

    socket.on("answerQuestion", data => {
        const room = rooms[socket.roomCode];
        if (!room || room.phase !== "playing" || !room.pendingQuestion) return sendError(socket, "There is no question to answer.");
        if (room.pendingQuestion.toId !== socket.id) return sendError(socket, "You are not the player who should answer this question.");

        const answer = data?.answer === true;
        const question = room.pendingQuestion;
        room.pendingQuestion = null;

        room.currentTurnPlayerId = question.toId;
        room.turnTimeLeft = 60;
        if (room.timerInterval) {
            clearInterval(room.timerInterval);
            startTurnTimer(socket.roomCode);
        }

        io.to(question.fromId).emit("questionAnswered", {
            questionId: question.id,
            text: question.text,
            answer
        });
        io.to(question.toId).emit("answerSent", { questionId: question.id, answer });
        emitGameState(socket.roomCode);
    });

    socket.on("makeGuess", data => {
        const room = rooms[socket.roomCode];
        if (!room || room.phase !== "playing") return sendError(socket, "The game is not active.");
        if (room.currentTurnPlayerId !== socket.id) return sendError(socket, "It is not your turn.");
        if (room.pendingQuestion) return sendError(socket, "Wait for the question to be answered first.");

        const guessId = String(data?.characterId || "");
        const player = getPlayer(room, socket.id);
        const opponent = room.players.find(p => p.id !== socket.id);
        const guessed = characters[room.category || 'anime'].find(c => c.id === guessId);
        if (!player || !opponent || !guessed) return sendError(socket, "Invalid guess.");

        const correct = opponent.character.id === guessed.id;
        if (correct) {
            const seconds = Math.max(1, Math.floor((Date.now() - room.gameStartedAt) / 1000));
            const points = Math.max(100, 1200 - seconds * 10);
            player.score += points;
            room.phase = "finished";
            room.winnerId = player.id;
            room.result = {
                winnerId: player.id,
                winnerName: player.name,
                loserId: opponent.id,
                loserName: opponent.name,
                guessedCharacter: opponent.character.name,
                points,
                seconds
            };
            if (room.timerInterval) {
                clearInterval(room.timerInterval);
            }
            io.to(socket.roomCode).emit("guessResult", { correct: true, points, guessedCharacter: opponent.character.name });
            emitGameState(socket.roomCode);
        } else {
            player.score = Math.max(0, player.score - 50);
            room.currentTurnPlayerId = opponent.id;
            room.turnTimeLeft = 60;
            if (room.timerInterval) {
                clearInterval(room.timerInterval);
                startTurnTimer(socket.roomCode);
            }
            io.to(socket.id).emit("guessResult", { correct: false, points: -50, guessedCharacter: guessed.name });
            io.to(opponent.id).emit("opponentWrongGuess", { guessedCharacter: guessed.name });
            emitGameState(socket.roomCode);
        }
    });

    socket.on("playAgain", () => {
        const room = rooms[socket.roomCode];
        if (!room || room.players.length !== 2) return sendError(socket, "The game needs both players.");
        
        const player = getPlayer(room, socket.id);
        if (!player) return;
        
        if (!room.playAgainRequests) room.playAgainRequests = {};
        room.playAgainRequests[socket.id] = true;
        
        const allPlayers = room.players.map(p => p.id);
        const allAgreed = allPlayers.every(id => room.playAgainRequests[id] === true);
        
        if (allAgreed) {
            room.phase = "selecting";
            room.currentTurnPlayerId = null;
            room.pendingQuestion = null;
            room.gameStartedAt = null;
            room.winnerId = null;
            room.result = null;
            room.playerEliminations = {};
            room.playAgainRequests = {};
            room.players.forEach(p => { 
                p.character = null; 
                p.score = 0;
                room.playerEliminations[p.id] = [];
            });
            if (room.timerInterval) {
                clearInterval(room.timerInterval);
            }
            io.to(socket.roomCode).emit("gameStarted");
            emitGameState(socket.roomCode);
        } else {
            io.to(socket.id).emit("waitingForOpponent");
            const opponent = room.players.find(p => p.id !== socket.id);
            if (opponent) {
                io.to(opponent.id).emit("opponentWantsPlayAgain", { playerName: player.name });
            }
        }
    });

    socket.on("closeGame", () => {
        const roomCode = socket.roomCode;
        const room = rooms[roomCode];
        if (!room) return;
        if (room.timerInterval) {
            clearInterval(room.timerInterval);
        }
        io.to(roomCode).emit("gameClosed");
        delete rooms[roomCode];
    });

    socket.on("disconnect", () => {
        const roomCode = socket.roomCode;
        const room = rooms[roomCode];
        if (!room) return;
        room.players = room.players.filter(p => p.id !== socket.id);
        if (room.players.length === 0) {
            if (room.timerInterval) {
                clearInterval(room.timerInterval);
            }
            delete rooms[roomCode];
            return;
        }
        room.host = room.players[0].id;
        room.phase = "lobby";
        room.pendingQuestion = null;
        room.currentTurnPlayerId = null;
        room.playAgainRequests = {};
        if (room.timerInterval) {
            clearInterval(room.timerInterval);
        }
        io.to(roomCode).emit("playerLeft");
        io.to(roomCode).emit("playersUpdated", publicPlayers(room));
    });
});

server.listen(PORT, () => {
    console.log("========================================");
    console.log("🎌 WHO AM I? - MULTI-CATEGORY");
    console.log(`🌐 http://localhost:${PORT}`);
    console.log("========================================");
});