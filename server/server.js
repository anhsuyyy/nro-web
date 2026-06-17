// server/server.js
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: 8080 });

const players = {}; 

// --- QUẢN LÝ QUÁI VẬT ---
const mob = {
    id: 'mob_moc_nhan',
    name: 'Mộc Nhân',
    x: 400, // Nằm giữa map
    y: 225,
    maxHp: 1000,
    hp: 1000,
    isDead: false
};

console.log("🚀 Game Server NRO (Giai đoạn 4: PvE) đang chạy cổng 8080");

wss.on('connection', (ws) => {
    const playerId = 'player_' + Math.random().toString(36).substr(2, 9);
    players[playerId] = { x: 0, y: 0, isMoving: false, ws: ws };

    ws.send(JSON.stringify({ type: 'INIT_CONNECTED', data: { id: playerId } }));

    ws.on('message', (message) => {
        try {
            const packet = JSON.parse(message);

            switch (packet.type) {
                case 'PLAYER_MOVE':
                    if (players[playerId]) {
                        players[playerId].x = packet.data.x;
                        players[playerId].y = packet.data.y;
                        players[playerId].isMoving = packet.data.isMoving;
                    }
                    break;

                case 'PLAYER_ATTACK':
                    if (mob.isDead) return;

                    // 1. Kiểm tra khoảng cách giữa người chơi và quái (Dùng công thức Pitago)
                    const pX = players[playerId].x;
                    const pY = players[playerId].y;
                    const distance = Math.sqrt(Math.pow(pX - mob.x, 2) + Math.pow(pY - mob.y, 2));

                    if (distance <= 80) { // Khoảng cách đủ gần để đấm tay (80 pixel)
                        let damage = Math.floor(Math.random() * 20) + 40; // Sức đánh ngẫu nhiên từ 40 - 60
                        mob.hp -= damage;

                        if (mob.hp <= 0) {
                            mob.hp = 0;
                            mob.isDead = true;
                            // Hồi sinh quái sau 5 giây
                            setTimeout(() => {
                                mob.hp = mob.maxHp;
                                mob.isDead = false;
                                console.log("🔄 Mộc Nhân đã hồi sinh!");
                            }, 5000);
                        }

                        // Phát gói tin báo cho tất cả mọi người có người vừa đấm quái
                        broadcast({
                            type: 'MOB_DAMAGED',
                            data: { mobId: mob.id, hp: mob.hp, damage: damage, isDead: mob.isDead }
                        });
                    }
                    break;
            }
        } catch (e) { console.error(e); }
    });

    ws.on('close', () => { delete players[playerId]; });
});

// VÒNG LẶP ĐỒNG BỘ ĐỊNH KỲ (TICK RATE)
setInterval(() => {
    const playersData = {};
    for (let id in players) {
        playersData[id] = { x: players[id].x, y: players[id].y, isMoving: players[id].isMoving };
    }

    // Gửi gộp cả tọa độ người chơi VÀ trạng thái máu của Quái vật về Client
    const payload = JSON.stringify({
        type: 'SYNC_GAME',
        data: { players: playersData, mob: { id: mob.id, name: mob.name, x: mob.x, y: mob.y, hp: mob.hp, maxHp: mob.maxHp, isDead: mob.isDead } }
    });

    for (let id in players) {
        if (players[id].ws.readyState === 1) players[id].ws.send(payload);
    }
}, 50);

function broadcast(packet) {
    const payload = JSON.stringify(packet);
    for (let id in players) {
        if (players[id].ws.readyState === 1) players[id].ws.send(payload);
    }
}