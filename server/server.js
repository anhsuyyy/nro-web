// server/server.js
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const wss = new WebSocketServer({ port: 8080 });
const DATA_FILE = path.join(__dirname, 'players.json');

let players = {}; 

function loadAllData() {
    try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } 
    catch (e) { console.error(e); }
    return {};
}
function saveAllData(data) {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4), 'utf8'); } catch (e) { console.error(e); }
}

// KHỞI TẠO MẢNG QUÁI VẬT (Bao gồm nhiều Mộc Nhân ngẫu nhiên trên map 800x450)
let mobs = [];
const TOTAL_MOBS = 5; // Số lượng quái xuất hiện trên bản đồ

function spawnMobs() {
    mobs = [];
    for (let i = 0; i < TOTAL_MOBS; i++) {
        mobs.push({
            id: 'mob_' + i,
            name: 'Mộc Nhân',
            x: Math.floor(Math.random() * 700) + 50,  // Tọa độ x từ 50 đến 750
            y: Math.floor(Math.random() * 350) + 50,  // Tọa độ y từ 50 đến 400
            maxHp: 1000,
            hp: 1000,
            isDead: false
        });
    }
}
spawnMobs(); // Tạo quái lần đầu

console.log("🚀 Server NRO đang chạy cổng 8080");

wss.on('connection', (ws) => {
    let username = null;

    ws.on('message', (message) => {
        try {
            const packet = JSON.parse(message);

            // 1. XỬ LÝ ĐĂNG NHẬP / ĐĂNG KÝ
            if (packet.type === 'AUTH') {
                const { user, pass, isRegister, isGameSession } = packet.data;
                const allData = loadAllData();

                if (isRegister) {
                    if (allData[user]) return ws.send(JSON.stringify({ type: 'AUTH_FAIL', data: { msg: 'Tài khoản đã tồn tại!' } }));
                    allData[user] = { password: pass, chosenPlanet: false };
                    saveAllData(allData);
                    ws.send(JSON.stringify({ type: 'NEED_CHOOSE_PLANET', data: { username: user } }));
                } else {
                    if (isGameSession) {
                        if (!allData[user]) return ws.send(JSON.stringify({ type: 'AUTH_FAIL', data: { msg: 'Tài khoản không tồn tại!' } }));
                        username = user;
                        loginSuccess(ws, username, allData[username]);
                        return;
                    }
                    if (!allData[user] || allData[user].password !== pass) {
                        return ws.send(JSON.stringify({ type: 'AUTH_FAIL', data: { msg: 'Sai tài khoản hoặc mật khẩu!' } }));
                    }
                    if (!allData[user].chosenPlanet) {
                        return ws.send(JSON.stringify({ type: 'NEED_CHOOSE_PLANET', data: { username: user } }));
                    }
                    username = user;
                    loginSuccess(ws, username, allData[username]);
                }
                return;
            }

            // 2. XỬ LÝ CHỌN HÀNH TINH
            if (packet.type === 'CHOOSE_PLANET') {
                const { user, planet } = packet.data;
                const allData = loadAllData();
                allData[user] = {
                    ...allData[user],
                    chosenPlanet: planet, x: 300, y: 300,
                    sucManh: 2000, tiemNang: 1000, sucDanh: 50, maxHp: 1000, hp: 1000,
                    skills: getSkillsByPlanet(planet)
                };
                saveAllData(allData);
                username = user;
                loginSuccess(ws, username, allData[username]);
                return;
            }

            if (!username || !players[username]) return;
            const player = players[username];

            switch (packet.type) {
                case 'PLAYER_MOVE':
                    player.x = packet.data.x; player.y = packet.data.y; player.isMoving = packet.data.isMoving;
                    break;

                // 3. TUNG CHIÊU THỨC (ĐÁNH NHIỀU QUÁI VẬT)
                case 'PLAYER_USE_SKILL':
                    const skillIndex = packet.data.skillIndex;
                    const skill = player.skills[skillIndex - 1];

                    // Tìm con quái gần nhất đang còn sống trong tầm đánh
                    let targetMob = null;
                    let minDistance = skill.range;

                    mobs.forEach(m => {
                        if (m.isDead) return;
                        const dist = Math.sqrt(Math.pow(player.x - m.x, 2) + Math.pow(player.y - m.y, 2));
                        if (dist < minDistance) {
                            minDistance = dist;
                            targetMob = m;
                        }
                    });

                    // Nếu không có quái nào trong tầm đánh thì bỏ qua
                    if (!targetMob) return;

                    let damage = 0;
                    let effect = null;

                    if (skill.id === 'td_3_thaiduong') { effect = 'CHOANG'; damage = 10; } 
                    else if (skill.id === 'nm_3_trithuong') { player.hp = Math.min(player.maxHp, player.hp + 300); effect = 'HEAL'; } 
                    else if (skill.id === 'xd_3_bienkhi') { effect = 'BIEN_KHI'; damage = player.sucDanh * 3; } 
                    else { damage = Math.floor(player.sucDanh * skill.dmgMultiplier) + Math.floor(Math.random() * 10); }

                    targetMob.hp = Math.max(0, targetMob.hp - damage);
                    
                    // Logic tính Tiềm năng cộng thêm (bằng 100% lượng sát thương gây ra)
                    let congTiemNang = damage;
                    player.sucManh += congTiemNang;
                    player.tiemNang += congTiemNang;

                    // Nếu quái chết, hồi sinh ngẫu nhiên lại chỗ khác sau 3 giây
                    if (targetMob.hp <= 0) { 
                        targetMob.isDead = true; 
                        const deadMobId = targetMob.id;
                        setTimeout(() => { 
                            const m = mobs.find(mb => mb.id === deadMobId);
                            if (m) {
                                m.x = Math.floor(Math.random() * 700) + 50;
                                m.y = Math.floor(Math.random() * 350) + 50;
                                m.hp = m.maxHp; 
                                m.isDead = false; 
                            }
                        }, 3000); 
                    }

                    // Gửi cập nhật chỉ số nhân vật ngay lập tức cho riêng người chơi đó
                    ws.send(JSON.stringify({ 
                        type: 'UPDATE_STATS', 
                        data: { sucManh: player.sucManh, tiemNang: player.tiemNang, hp: player.hp } 
                    }));
                    
                    // Phát thông báo hiệu ứng kỹ năng kèm lượng tiềm năng được cộng cho cả map thấy
                    broadcast({
                        type: 'SKILL_EFFECT_BROADCAST',
                        data: { 
                            attackerId: username, 
                            skillName: skill.name, 
                            damage: damage, 
                            effect: effect, 
                            mobId: targetMob.id,
                            mobX: targetMob.x,
                            mobY: targetMob.y,
                            tiemNangCong: congTiemNang
                        }
                    });
                    break;
            }
        } catch (e) { console.error(e); }
    });

    ws.on('close', () => {
        if (username && players[username]) {
            const allData = loadAllData();
            const p = players[username];
            allData[username] = { ...allData[username], x: p.x, y: p.y, sucManh: p.sucManh, tiemNang: p.tiemNang, sucDanh: p.sucDanh, maxHp: p.maxHp, hp: p.hp };
            saveAllData(allData);
            delete players[username];
        }
    });
});

function loginSuccess(ws, username, dbData) {
    players[username] = { ...dbData, isMoving: false, ws: ws };
    ws.send(JSON.stringify({
        type: 'INIT_CONNECTED',
        data: { id: username, x: players[username].x, y: players[username].y, planet: players[username].chosenPlanet, skills: players[username].skills, stats: { sucManh: players[username].sucManh, tiemNang: players[username].tiemNang, sucDanh: players[username].sucDanh, maxHp: players[username].maxHp } }
    }));
}

function getSkillsByPlanet(planet) {
    if (planet === 'TRAI_DAT') return [
        { name: 'Đấm Galick', range: 80, dmgMultiplier: 1.0, id: 'td_1_dam' },
        { name: 'Kamejoko', range: 300, dmgMultiplier: 1.8, id: 'td_2_chuong' },
        { name: 'Thái Dương Hạ San', range: 150, dmgMultiplier: 0.2, id: 'td_3_thaiduong' }
    ];
    if (planet === 'NAMEC') return [
        { name: 'Đấm Demon', range: 80, dmgMultiplier: 1.1, id: 'nm_1_dam' },
        { name: 'Masenko', range: 250, dmgMultiplier: 1.5, id: 'nm_2_chuong' },
        { name: 'Trị Thương', range: 50, dmgMultiplier: 0, id: 'nm_3_trithuong' }
    ];
    if (planet === 'XAYDA') return [
        { name: 'Đấm Dragon', range: 80, dmgMultiplier: 1.2, id: 'xd_1_dam' },
        { name: 'Antomic', range: 240, dmgMultiplier: 1.6, id: 'xd_2_chuong' },
        { name: 'Biến Khỉ', range: 100, dmgMultiplier: 2.5, id: 'xd_3_bienkhi' }
    ];
}

function broadcast(packet) {
    const payload = JSON.stringify(packet);
    for (let id in players) { if (players[id].ws.readyState === 1) players[id].ws.send(payload); }
}

// GAME TICK LOOP - ĐỒNG BỘ ĐỊNH KỲ 100MS
setInterval(() => {
    const playersList = {};
    for (let id in players) {
        playersList[id] = { x: players[id].x, y: players[id].y, isMoving: players[id].isMoving };
    }
    broadcast({
        type: 'SYNC_GAME',
        data: { players: playersList, mobs: mobs } // Gửi mảng quái mobs thay vì mob đơn lẻ
    });
}, 100);