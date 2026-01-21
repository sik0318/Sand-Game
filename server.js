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
let roundCount = 0; // 누적된 총 턴 수
let isStarted = false;
let lastLoserId = "";

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

    socket.on('startGame', (mode) => {
        if (players.length === 0 || socket.id !== players[0].id) return;

        if (mode === 'excludeLoser' && lastLoserId) {
            players = players.filter(p => p.id !== lastLoserId);
            if (players.length > 0) players[0].host = true;
            lastLoserId = ""; 
        }

        if (players.length < 1) return;

        // 게임 데이터 초기화
        totalSand = players.length * 40;
        sandAmount = totalSand;
        isStarted = true;
        turnIndex = 0;
        roundCount = 0; // 라운드 카운트 초기화
        players.forEach(p => p.score = 0);
        
        gameOrder = shuffle([...players]);
        io.emit('gameBegin', { 
            sand: sandAmount, 
            totalSand: totalSand,
            order: gameOrder, 
            currentTurn: gameOrder[turnIndex].id 
        });
    });

    socket.on('takeSand', (amount) => {
        if (!isStarted || socket.id !== gameOrder[turnIndex].id) return;

        // 1. 모래 양 차감 및 개인 점수 기록
        sandAmount -= amount;
        const currentPlayer = players.find(p => p.id === socket.id);
        if(currentPlayer) currentPlayer.score += amount;
        
        roundCount++; // 한 명의 턴이 끝날 때마다 증가
        
        // 2. 확률 계산 (남은 모래 비율에 따라)
        // 모래가 아주 조금 남았을 때만 확률이 100%에 가깝게 설계
        const fallChance = Math.min((totalSand - sandAmount) / (totalSand * 0.95), 0.99);
        const isFallen = Math.random() < fallChance;

        // 3. 종료 조건 판정 (순서가 매우 중요합니다)
        
        // A. 모래를 가져갔는데 막대가 쓰러진 경우 (또는 모래가 아예 없는 경우)
        if (isFallen || sandAmount <= 0) {
            lastLoserId = gameOrder[turnIndex].id;
            finishGame(gameOrder[turnIndex].name, "나뭇가지를 쓰러뜨렸습니다!");
        } 
        // B. 막대가 안 쓰러졌는데, 모든 플레이어가 5번씩 완료한 경우
        else if (roundCount >= gameOrder.length * 5) {
            // 모든 플레이어 중 score(가져간 모래 양)가 가장 적은 사람 찾기
            const loser = players.reduce((prev, curr) => (prev.score < curr.score) ? prev : curr);
            lastLoserId = loser.id;
            finishGame(loser.name, "5라운드 종료! 모래를 가장 적게 가져와 패배했습니다.");
        } 
        // C. 게임 계속 진행
        else {
            turnIndex = (turnIndex + 1) % gameOrder.length;
            io.emit('updateState', { 
                sand: sandAmount, 
                currentTurn: gameOrder[turnIndex].id,
                chance: fallChance
            });
        }
    });

    function finishGame(loserName, reason) {
        const results = players.map(p => `${p.name}: ${p.score}`).join(', ');
        io.emit('gameOver', { 
            loserName, 
            reason, 
            results, 
            hostId: players[0].id 
        });
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
