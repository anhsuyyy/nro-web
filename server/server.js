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
    console.log(`📡 Người chơi mới kết nối: ${playerId}`);
players[playerId] = { 
        x: Math.random() * 200 + 100, 
        y: Math.random() * 200 + 100, 
        isMoving: false, 
        ws: ws,
        // --- CHỈ SỐ NHÂN VẬT ---
        sucManh: 2000,     // Sức mạnh tổng
        tiemNang: 500,     // Điểm dùng để nâng cấp
        sucDanh: 50,       // Sức đánh gốc
        maxHp: 1000,
        maxKi: 1000
    };
ws.send(JSON.stringify({ 
        type: 'INIT_CONNECTED', 
        data: { 
            id: playerId,
            stats: {
                sucManh: players[playerId].sucManh,
                tiemNang: players[playerId].tiemNang,
                sucDanh: players[playerId].sucDanh,
                maxHp: players[playerId].maxHp,
                maxKi: players[playerId].maxKi
            }
        } 
    }));
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

                    const pX = players[playerId].x;
                    const pY = players[playerId].y;
                    const distance = Math.sqrt(Math.pow(pX - mob.x, 2) + Math.pow(pY - mob.y, 2));

                    if (distance <= 80) { 
                        // Sát thương bằng Sức đánh của người chơi + một chút ngẫu nhiên
                        let damage = players[playerId].sucDanh + Math.floor(Math.random() * 10); 
                        mob.hp -= damage;

                        // Cộng điểm Tiềm năng & Sức mạnh bằng 1/2 lượng damage gây ra
                        let expGained = Math.floor(damage / 2);
                        players[playerId].sucManh += expGained;
                        players[playerId].tiemNang += expGained;

                        if (mob.hp <= 0) {
                            mob.hp = 0; mob.isDead = true;
                            setTimeout(() => { mob.hp = mob.maxHp; mob.isDead = false; }, 5000);
                        }

                        // Gửi gói tin cập nhật chỉ số riêng cho người đấm
                        ws.send(JSON.stringify({
                            type: 'UPDATE_STATS',
                            data: {
                                sucManh: players[playerId].sucManh,
                                tiemNang: players[playerId].tiemNang
                            }
                        }));

                        // Báo hiệu damage cho toàn server vẽ hiệu ứng
                        broadcast({
                            type: 'MOB_DAMAGED',
                            data: { mobId: mob.id, hp: mob.hp, damage: damage, isDead: mob.isDead }
                        });
                    }
                    break;

                // --- TÍNH NĂNG CỘNG ĐIỂM TIỀM NĂNG ---
                case 'UP_STATS':
                    const typeUp = packet.data.statType; // 'HP' hoặc 'SD'
                    const player = players[playerId];

                    if (typeUp === 'SD' && player.tiemNang >= 100) {
                        player.tiemNang -= 100;
                        player.sucDanh += 5; // Tăng 5 sức đánh
                    } else if (typeUp === 'HP' && player.tiemNang >= 50) {
                        player.tiemNang -= 50;
                        player.maxHp += 20; // Tăng 20 HP tối đa
                    }

                    // Gửi lại chỉ số mới sau khi nâng cấp thành công
                    ws.send(JSON.stringify({
                        type: 'INIT_CONNECTED', // Tận dụng lại gói tin này để cập nhật toàn bộ UI chỉ số
                        data: { id: playerId, stats: { sucManh: player.sucManh, tiemNang: player.tiemNang, sucDanh: player.sucDanh, maxHp: player.maxHp, maxKi: player.maxKi } }
                    }));
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