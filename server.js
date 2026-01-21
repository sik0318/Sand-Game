const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = [];
let gameOrder = [];
let sandAmount = 100;
let totalSand = 100; // 초기 총량 저장용
let turnIndex = 0;
let roundCount = 0; // 전체 턴 횟수
let isStarted = false;

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

    socket.on('startGame', () => {
        if (players.length > 0 && socket.id === players[0].id) {
            // [1번] 인원수에 비례해 모래 양 설정 (1인당 40)
            totalSand = players.length * 40;
            sandAmount = totalSand;
            isStarted = true;
            turnIndex = 0;
            roundCount = 0;
            players.forEach(p => p.score = 0); // 점수 초기화
            gameOrder = shuffle([...players]);
            io.emit('gameBegin', { 
                sand: sandAmount, 
                totalSand: totalSand,
                order: gameOrder, 
                currentTurn: gameOrder[turnIndex].id 
            });
        }
    });

    socket.on('takeSand', (amount) => {
        if (!isStarted || socket.id !== gameOrder[turnIndex].id) return;

        sandAmount -= amount;
        // 점수(가져간 양) 기록
        const p = players.find(player => player.id === socket.id);
        if(p) p.score += amount;
        
        roundCount++;
        
        const fallChance = (totalSand - sandAmount) / totalSand;
        const isFallen = Math.random() < fallChance;

        if (isFallen || sandAmount <= 0) {
            finishGame(gameOrder[turnIndex].name, "나뭇가지를 쓰러뜨렸습니다!");
        } else {
            // [5번] 모든 플레이어 5턴 종료 체크 (인원수 * 5)
            if (roundCount >= gameOrder.length * 5) {
                // 모래를 가장 적게 가져간 사람 찾기
                const loser = players.reduce((prev, curr) => (prev.score < curr.score) ? prev : curr);
                finishGame(loser.name, "5라운드 종료! 모래를 가장 적게 가져와 패배했습니다.");
            } else {
                turnIndex = (turnIndex + 1) % gameOrder.length;
                io.emit('updateState', { 
                    sand: sandAmount, 
                    currentTurn: gameOrder[turnIndex].id,
                    lastAmount: amount,
                    chance: fallChance
                });
            }
        }
    });

    function finishGame(loserName, reason) {
        // [6번] 각 플레이어의 최종 획득량 포함 안내
        const results = players.map(p => `${p.name}: ${p.score}`).join(', ');
        io.emit('gameOver', { loserName, reason, results });
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
