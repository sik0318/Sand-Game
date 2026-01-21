const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = [];      // {id, name, host}
let gameOrder = [];    // 랜덤하게 섞인 순서
let sandAmount = 100;
let turnIndex = 0;
let isStarted = false;

// 배열을 랜덤하게 섞는 함수
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

io.on('connection', (socket) => {
    // 1. 입장 시 이름 등록
    socket.on('joinGame', (userName) => {
        const isHost = players.length === 0;
        players.push({ id: socket.id, name: userName, host: isHost });
        io.emit('playerUpdate', players);
    });

    // 2. 게임 시작 (방장만 가능)
    socket.on('startGame', () => {
        if (players.length > 0 && socket.id === players[0].id) {
            sandAmount = 100;
            isStarted = true;
            turnIndex = 0;
            // 플레이어 순서를 랜덤하게 결정
            gameOrder = shuffle([...players]);
            io.emit('gameBegin', { 
                sand: sandAmount, 
                order: gameOrder, 
                currentTurn: gameOrder[turnIndex].id 
            });
        }
    });

    // 3. 모래 가져오기
    socket.on('takeSand', (amount) => {
        if (!isStarted || socket.id !== gameOrder[turnIndex].id) return;

        sandAmount -= amount;
        const fallChance = (105 - sandAmount) / 100; // 정교한 확률 계산

        if (Math.random() < fallChance || sandAmount <= 0) {
            io.emit('gameOver', { loserName: gameOrder[turnIndex].name });
            isStarted = false;
        } else {
            turnIndex = (turnIndex + 1) % gameOrder.length;
            io.emit('updateState', { 
                sand: sandAmount, 
                currentTurn: gameOrder[turnIndex].id 
            });
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (players.length > 0) players[0].host = true;
        io.emit('playerUpdate', players);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Server is running!'));
