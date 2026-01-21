const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = [];
let gameOrder = [];
let sandAmount = 100;
let totalSand = 100;
let turnIndex = 0;
let roundCount = 0;
let isStarted = false;
let lastLoserId = ""; // 마지막 패배자 ID 저장용

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

io.on('connection', (socket) => {
    socket.on('joinGame', (userName) => {
        const isHost = players.length === 0;
        players.push({ id: socket.id, name: userName, host: isHost, score: 0 });
        io.emit('playerUpdate', players);
    });

    // 게임 시작 통합 함수
    socket.on('startGame', (mode) => {
        if (players.length === 0 || socket.id !== players[0].id) return;

        // [2번] 패배자 제외 모드인 경우
        if (mode === 'excludeLoser' && lastLoserId) {
            players = players.filter(p => p.id !== lastLoserId);
            if (players.length > 0) players[0].host = true;
        }

        if (players.length < 1) return;

        totalSand = players.length * 40;
        sandAmount = totalSand;
        isStarted = true;
        turnIndex = 0;
        roundCount = 0;
        players.forEach(p => p.score = 0);
        
        gameOrder = shuffle([...players]); // 무조건 순서 랜덤
        io.emit('gameBegin', { 
            sand: sandAmount, 
            totalSand: totalSand,
            order: gameOrder, 
            currentTurn: gameOrder[turnIndex].id 
        });
    });

    socket.on('takeSand', (amount) => {
        if (!isStarted || socket.id !== gameOrder[turnIndex].id) return;

        sandAmount -= amount;
        const p = players.find(player => player.id === socket.id);
        if(p) p.score += amount;
        
        roundCount++;
        
        const fallChance = (totalSand - sandAmount) / totalSand;
        const isFallen = Math.random() < fallChance;

        if (isFallen || sandAmount <= 0) {
            lastLoserId = gameOrder[turnIndex].id;
            finishGame(gameOrder[turnIndex].name, "나뭇가지를 쓰러뜨렸습니다!");
        } else {
            if (roundCount >= gameOrder.length * 5) {
                const loser = players.reduce((prev, curr) => (prev.score < curr.score) ? prev : curr);
                lastLoserId = loser.id;
                finishGame(loser.name, "5라운드 종료! 가장 적게 가져와 패배했습니다.");
            } else {
                turnIndex = (turnIndex + 1) % gameOrder.length;
                io.emit('updateState', { 
                    sand: sandAmount, 
                    currentTurn: gameOrder[turnIndex].id,
                    chance: fallChance
                });
            }
        }
    });

    function finishGame(loserName, reason) {
        const results = players.map(p => `${p.name}: ${p.score}`).join(', ');
        io.emit('gameOver', { loserName, reason, results, hostId: players[0].id });
        isStarted = false;
    }

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (players.length > 0) players[0].host = true;
        io.emit('playerUpdate', players);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Server running!'));
