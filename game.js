// Game variables
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth - 270;
canvas.height = window.innerHeight - 100;

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

let keys = {};
let score = 0;
let scrap = 100;
let wave = 1;
let bullets = [];
let enemies = [];
let droppedModules = [];
let particles = [];
let powerUps = [];
let explosions = [];
let buildMode = false;
let selectedModuleType = "gun";
let gameRunning = true;
let powerLevel = 100;
let shieldPower = 100;
let health = 100;
let lastSpawn = 0;
let lastPowerSpawn = 0;
let thrusterParticlesTimer = 0;
let enemySpawnRate = 3000;
let lastWaveIncrease = 0;

// Create stars for background
function createStars() {
    const stars = [];
    const starCount = 200;
    
    for (let i = 0; i < starCount; i++) {
        stars.push({
            x: Math.random() * WIDTH,
            y: Math.random() * HEIGHT,
            size: Math.random() * 2,
            brightness: Math.random() * 0.8 + 0.2,
            speed: Math.random() * 0.5
        });
    }
    
    return stars;
}

const stars = createStars();

// Event listeners
window.addEventListener("blur", () => {
    keys = {};
});

document.addEventListener("keydown", e => {
    keys[e.code] = true;
    
    // Toggle build mode
    if (e.key === "b" && gameRunning) {
        buildMode = !buildMode;
        document.getElementById("buildModeIndicator").style.display = buildMode ? "block" : "none";
        if (!buildMode) {
            // Reset fireCooldown so player can shoot immediately after building
            player.fireCooldown = 0;
            // Do NOT clear space key state or call player.fire() here.
        }
    }
    
    // Activate shield
    if (e.key === "s" && gameRunning && shieldPower > 20) {
        shieldPower -= 0.5;
    }
});

document.addEventListener("keyup", e => keys[e.code] = false);

// Module type selection
document.querySelectorAll(".moduleType").forEach(el => {
    el.addEventListener("click", () => {
        document.querySelectorAll(".moduleType").forEach(m => m.classList.remove("selected"));
        el.classList.add("selected");
        selectedModuleType = el.dataset.type;
    });
});

// Restart button
document.getElementById("restartButton").addEventListener("click", () => {
    document.getElementById("gameOver").style.display = "none";
    resetGame();
    gameRunning = true;
});

// Module class
const moduleSize = 24;
const enemyModuleSize = 32; // Larger modules for enemies

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

class Module {
    constructor(type, isEnemy = false) {
        this.type = type;
        this.hp = this.getMaxHP(isEnemy);
        this.cooldown = 0;
        this.isEnemy = isEnemy;
    }
    
    getMaxHP(isEnemy) {
        const baseHP = {
            core: 5,
            engine: 2,
            gun: 2,
            armor: 4,
            shield: 3
        }[this.type] || 1;
        
        // Enemies have more HP
        return isEnemy ? baseHP * 2 : baseHP;
    }
    
    getCost() {
        return {
            core: 0,
            engine: 10,
            gun: 5,
            armor: 8,
            shield: 15
        }[this.type] || 5;
    }

    draw(x, y) {
        const size = this.isEnemy ? enemyModuleSize : moduleSize;
        
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        ctx.translate(-size/2, -size/2);
        
        // Draw module with gradient and shadow
        const gradient = ctx.createRadialGradient(
            size/2, size/2, 0,
            size/2, size/2, size/2
        );
        
        switch(this.type) {
            case "core":
                gradient.addColorStop(0, this.isEnemy ? "#ff0000" : "#00f7ff");
                gradient.addColorStop(1, this.isEnemy ? "#990000" : "#0077ff");
                break;
            case "engine":
                gradient.addColorStop(0, this.isEnemy ? "#ff9900" : "#00ff9d");
                gradient.addColorStop(1, this.isEnemy ? "#cc6600" : "#00b36b");
                break;
            case "gun":
                gradient.addColorStop(0, "#ff3366");
                gradient.addColorStop(1, "#ff0066");
                break;
            case "armor":
                gradient.addColorStop(0, "#bbbbbb");
                gradient.addColorStop(1, "#888888");
                break;
            case "shield":
                gradient.addColorStop(0, "#9d4edd");
                gradient.addColorStop(1, "#5a189a");
                break;
            default:
                gradient.addColorStop(0, "#ffffff");
                gradient.addColorStop(1, "#cccccc");
        }
        
        ctx.fillStyle = gradient;
        ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
        ctx.shadowBlur = 8;
        ctx.fillRect(0, 0, size, size);
        
        // Draw border
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, size, size);
        
        // Draw HP bar for damaged modules
        if (this.hp < this.getMaxHP(this.isEnemy)) {
            const hpPercent = this.hp / this.getMaxHP(this.isEnemy);
            ctx.fillStyle = hpPercent > 0.5 ? "#00ff00" : hpPercent > 0.25 ? "#ffff00" : "#ff0000";
            ctx.fillRect(2, size - 6, (size - 4) * hpPercent, 4);
        }
        
        ctx.restore();
    }
}

// Ship class
class Ship {
    constructor(x, y, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.modules = { "0,0": new Module("core", !isPlayer) };
        this.isPlayer = isPlayer;
        this.fireCooldown = 0;
        this.shieldActive = false;
        this.speedMultiplier = 1.0;
    }

    update() {
        if (this.isPlayer) this.handleInput();

        this.x += this.vx;
        this.y += this.vy;

        this.vx *= 0.95;
        this.vy *= 0.95;

        this.x = Math.max(0, Math.min(WIDTH, this.x));
        this.y = Math.max(0, Math.min(HEIGHT, this.y));

        // --- FIX: Always decrement fireCooldown as integer ---
        if (this.fireCooldown > 0) {
            this.fireCooldown = Math.max(0, Math.floor(this.fireCooldown - 1));
        }
        if ((this.isPlayer && keys["Space"] && this.fireCooldown === 0 && powerLevel > 5) || 
            (!this.isPlayer && this.fireCooldown === 0)) {
            this.fire();
            this.fireCooldown = this.isPlayer ? 15 : 30 + Math.random() * 30;
            if (!this.isPlayer) {
                this.fireCooldown = Math.floor(this.fireCooldown);
            }
        }
    }

    handleInput() {
        const thrust = this.isPlayer ? 0.3 * this.speedMultiplier : 0.1;
        
        // Movement
        if (this.isPlayer) {
            if (keys["ArrowUp"]) {
                this.vy -= thrust;
                
                // Create thruster particles
                if (thrusterParticlesTimer <= 0) {
                    createThrusterParticles(this.x, this.y, Math.PI/2);
                    thrusterParticlesTimer = 2;
                }
            }
            if (keys["ArrowDown"]) {
                this.vy += thrust * 0.5;
            }
            if (keys["ArrowLeft"]) {
                this.vx -= thrust;
            }
            if (keys["ArrowRight"]) {
                this.vx += thrust;
            }
        }
        
        // Update speed multiplier based on engine modules
        this.speedMultiplier = 1.0;
        for (let key in this.modules) {
            if (this.modules[key].type === "engine") {
                this.speedMultiplier += this.isPlayer ? 0.3 : 0.4; // Enemies are faster
            }
        }
    }

    fire() {
        const size = this.isPlayer ? moduleSize : enemyModuleSize;
        for (let key in this.modules) {
            if (this.modules[key].type === "gun") {
                const [gx, gy] = key.split(",").map(Number);
                let vx = 0, vy = 0;
                if (this.isPlayer) {
                    // Direction: from core (0,0) to (gx,gy)
                    if (gx === 0 && gy === 0) {
                        vx = 0;
                        vy = -8; // Default up
                    } else {
                        const len = Math.hypot(gx, gy);
                        vx = (gx / len) * 8;
                        vy = (gy / len) * 8;
                    }
                } else {
                    // Aim at player
                    const px = this.x + gx * size;
                    const py = this.y + gy * size;
                    const dx = player.x - px;
                    const dy = player.y - py;
                    const dist = Math.hypot(dx, dy);
                    const speed = 6;
                    vx = (dx / dist) * speed;
                    vy = (dy / dist) * speed;
                }
                bullets.push(new Bullet(
                    this.x + gx * size,
                    this.y + gy * size,
                    vx, vy,
                    this,
                    this.isPlayer ? 4 : 6
                ));
                if (!this.isPlayer) {
                    powerLevel -= 1;
                }
            }
        }
    }

    draw() {
        const size = this.isPlayer ? moduleSize : enemyModuleSize;
        
        // Draw shield if active
        if (this.shieldActive && this.isPlayer) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, 60, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(100, 200, 255, ${shieldPower/200})`;
            ctx.lineWidth = 3;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(this.x, this.y, 60, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 200, 255, ${shieldPower/100})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        
        // Draw modules
        for (let key in this.modules) {
            const [gx, gy] = key.split(",").map(Number);
            const px = this.x + gx * size;
            const py = this.y + gy * size;
            this.modules[key].draw(px, py);
        }
        
        // Draw core glow
        ctx.beginPath();
        ctx.arc(this.x, this.y, size/2, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, size/2);
        gradient.addColorStop(0, `rgba(${this.isPlayer ? '0, 247, 255' : '255, 0, 0'}, 0.8)`);
        gradient.addColorStop(1, `rgba(${this.isPlayer ? '0, 119, 255' : '153, 0, 0'}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fill();
    }

    getModulePositions() {
        const size = this.isPlayer ? moduleSize : enemyModuleSize;
        
        return Object.entries(this.modules).map(([k, mod]) => {
            const [gx, gy] = k.split(",").map(Number);
            
            return {
                x: this.x + gx * size,
                y: this.y + gy * size,
                key: k,
                mod: mod
            };
        });
    }
}

// Bullet class
class Bullet {
    constructor(x, y, vx, vy, owner, size = 4) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = 60;
        this.owner = owner;
        this.size = size;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Draw bullet with glow
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size);
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.5, this.owner.isPlayer ? "#ff5555" : "#ff9900");
        gradient.addColorStop(1, this.owner.isPlayer ? "#ff0000" : "#ff6600");
        ctx.fillStyle = gradient;
        ctx.shadowColor = this.owner.isPlayer ? "#ff5555" : "#ff9900";
        ctx.shadowBlur = 10;
        ctx.fill();
        
        ctx.restore();
    }
}

// Scrap class
class Scrap {
    constructor(x, y, amount) {
        this.x = x;
        this.y = y;
        this.amount = amount;
        this.size = 10 + amount;
        this.life = 300;
    }
    
    update() {
        this.life--;
        
        // Move toward player
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < 300) {
            this.x += dx / dist * 2;
            this.y += dy / dist * 2;
        }
    }
    
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Draw scrap
        ctx.fillStyle = "#ffcc00";
        ctx.shadowColor = "#ffcc00";
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw value
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.amount, 0, 0);
        
        ctx.restore();
    }
}

// Create player
const player = new Ship(WIDTH / 2, HEIGHT / 2, true);
player.modules["1,0"] = new Module("gun");
player.modules["-1,0"] = new Module("engine");

// Enemy spawning
function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    switch(side) {
        case 0: x = Math.random() * WIDTH; y = -50; break;
        case 1: x = WIDTH + 50; y = Math.random() * HEIGHT; break;
        case 2: x = Math.random() * WIDTH; y = HEIGHT + 50; break;
        case 3: x = -50; y = Math.random() * HEIGHT; break;
    }
    const e = new Ship(x, y);
    e.modules["0,0"] = new Module("core", true);
    // Advanced enemy configurations
    const config = Math.floor(Math.random() * 5);
    switch(config) {
        case 0: // Aggressive Basic
            e.modules["1,0"] = new Module("gun", true);
            e.modules["-1,0"] = new Module("engine", true);
            e.modules["0,1"] = new Module("gun", true);
            break;
        case 1: // Fast Flanker
            e.modules["1,0"] = new Module("gun", true);
            e.modules["-1,0"] = new Module("engine", true);
            e.modules["-2,0"] = new Module("engine", true);
            e.modules["0,1"] = new Module("engine", true);
            break;
        case 2: // Tanky
            e.modules["1,0"] = new Module("gun", true);
            e.modules["-1,0"] = new Module("armor", true);
            e.modules["0,1"] = new Module("armor", true);
            e.modules["0,-1"] = new Module("armor", true);
            e.modules["1,1"] = new Module("shield", true);
            break;
        case 3: // Gunner Burst
            e.modules["1,0"] = new Module("gun", true);
            e.modules["-1,0"] = new Module("gun", true);
            e.modules["0,1"] = new Module("gun", true);
            e.modules["0,-1"] = new Module("engine", true);
            break;
        case 4: // Advanced
            e.modules["1,0"] = new Module("gun", true);
            e.modules["-1,0"] = new Module("engine", true);
            e.modules["0,1"] = new Module("armor", true);
            e.modules["0,-1"] = new Module("shield", true);
            e.modules["1,1"] = new Module("gun", true);
            e.modules["-1,-1"] = new Module("engine", true);
            break;
    }
    // Increase stats for higher waves
    e.extraAggression = Math.min(1 + wave * 0.1, 2.5);
    e.extraFireRate = Math.max(0.5, 1.5 - wave * 0.05);
    e.dodgeChance = Math.min(0.15 + wave * 0.01, 0.5);
    e.maxSpeed = 2 + wave * 0.1;
    enemies.push(e);
}

// Improved Enemy AI
function updateEnemies() {
    for (let e of enemies) {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const dist = Math.hypot(dx, dy);
        // Dodge incoming bullets
        let dodge = false;
        for (let b of bullets) {
            if (b.owner.isPlayer) {
                const bDist = Math.hypot(b.x - e.x, b.y - e.y);
                if (bDist < 80 && Math.random() < e.dodgeChance) {
                    // Move perpendicular to bullet
                    const perp = Math.sign(b.vx || 1);
                    e.vx += perp * 1.5 * e.extraAggression;
                    dodge = true;
                    break;
                }
            }
        }
        // Aggressive movement: flank and close in
        if (!dodge) {
            if (dist > 120) {
                e.vx += 0.08 * Math.sign(dx) * e.extraAggression;
                e.vy += 0.08 * Math.sign(dy) * e.extraAggression;
            } else if (dist < 60) {
                e.vx -= 0.05 * Math.sign(dx) * e.extraAggression;
                e.vy -= 0.05 * Math.sign(dy) * e.extraAggression;
            }
        }
        // Clamp speed
        const speed = Math.hypot(e.vx, e.vy);
        if (speed > e.maxSpeed) {
            e.vx *= e.maxSpeed / speed;
            e.vy *= e.maxSpeed / speed;
        }
        // --- FIX: Synchronous burst fire logic ---
        if (!e.burst) e.burst = 0;
        if (dist < 350 && Math.floor(e.fireCooldown) <= 0) {
            if (dist < 120) {
                e.burst = 3; // burst shots
                e.burstInterval = 0;
            } else {
                e.burst = 1;
                e.burstInterval = 0;
            }
        }
        if (e.burst > 0) {
            if (!e.burstInterval || Math.floor(e.burstInterval) <= 0) {
                e.fire();
                e.burst--;
                e.burstInterval = 5; // frames between burst shots
                if (e.burst === 0) {
                    e.fireCooldown = Math.floor((dist < 120 ? 10 : 30) * e.extraFireRate);
                }
            } else {
                e.burstInterval = Math.max(0, Math.floor(e.burstInterval - 1));
            }
        } else if (e.fireCooldown > 0) {
            e.fireCooldown = Math.max(0, Math.floor(e.fireCooldown - 1));
        }
        e.update();
        e.draw();
    }
}

// Collision detection
function checkCollisions() {
    // Bullet collisions
    for (let b of bullets) {
        const ships = [player, ...enemies];
        for (let ship of ships) {
            if (b.owner === ship) continue;

            for (let { x, y, key, mod } of ship.getModulePositions()) {
                const size = ship.isPlayer ? moduleSize : enemyModuleSize;
                
                if (
                    b.x < x + size &&
                    b.x + b.size > x &&
                    b.y < y + size &&
                    b.y + b.size > y
                ) {
                    // Skip if shield is active and it's the player
                    if (ship.isPlayer && keys["s"] && shieldPower > 10) {
                        createImpactParticles(b.x, b.y);
                        b.life = 0;
                        shieldPower -= 5;
                        continue;
                    }
                    
                    mod.hp--;
                    createImpactParticles(b.x, b.y);
                    b.life = 0;
                    if (mod.hp <= 0) {
                        if (mod.type !== "core") {
                            droppedModules.push(new Scrap(x, y, mod.getCost() / 2));
                            delete ship.modules[key];
                            
                            if (ship.isPlayer) {
                                health -= 10;
                                ensurePlayerHasGun(); // <-- always keep at least one gun
                            }
                        } else {
                            if (ship === player) {
                                health = 0;
                                gameOver();
                            } else {
                                createExplosion(ship.x, ship.y, 100);
                                score += 20 + Object.keys(ship.modules).length * 8;
                                scrap += 8 + Object.keys(ship.modules).length * 3;
                                enemies = enemies.filter(s => s !== ship);
                                
                                // Drop scrap for each module
                                for (let key in ship.modules) {
                                    if (key !== "0,0") {
                                        const [gx, gy] = key.split(",").map(Number);
                                        const moduleSize = ship.isPlayer ? moduleSize : enemyModuleSize;
                                        droppedModules.push(new Scrap(
                                            ship.x + gx * moduleSize,
                                            ship.y + gy * moduleSize,
                                            ship.modules[key].getCost() / 2
                                        ));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Player collision with scrap
    for (let d of droppedModules) {
        const dx = player.x - d.x;
        const dy = player.y - d.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < 30) {
            scrap += d.amount;
            d.life = 0;
            createScrapCollectParticles(d.x, d.y, d.amount);
        }
    }
}

// --- Ensure player always has at least one gun module ---
function ensurePlayerHasGun() {
    const hasGun = Object.values(player.modules).some(m => m.type === "gun");
    if (!hasGun) {
        // Place a gun at the first available adjacent slot
        const possible = [
            [1,0], [-1,0], [0,1], [0,-1], [1,1], [-1,-1], [1,-1], [-1,1]
        ];
        for (const [gx, gy] of possible) {
            const key = `${gx},${gy}`;
            if (!player.modules[key]) {
                player.modules[key] = new Module("gun");
                break;
            }
        }
    }
}

// Particle effects (unchanged from previous version)
function createThrusterParticles(x, y, angle) {
    for (let i = 0; i < 5; i++) {
        particles.push({
            x: x,
            y: y + 30,
            vx: (Math.random() - 0.5) * 2,
            vy: Math.random() * 3 + 2,
            size: Math.random() * 4 + 2,
            color: i < 3 ? "#ff9900" : "#ff5500",
            life: Math.random() * 20 + 10
        });
    }
}

function createImpactParticles(x, y) {
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            size: Math.random() * 3 + 1,
            color: "#ff5555",
            life: Math.random() * 20 + 10
        });
    }
}

function createExplosion(x, y, size) {
    explosions.push({
        x: x,
        y: y,
        size: 10,
        maxSize: size,
        life: 60,
        color: "#ff9900"
    });
}

function createScrapCollectParticles(x, y, amount) {
    for (let i = 0; i < amount * 2; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            size: Math.random() * 3 + 1,
            color: "#ffcc00",
            life: Math.random() * 20 + 10
        });
    }
}

// Game over
function gameOver() {
    gameRunning = false;
    document.getElementById("finalScore").textContent = "Final Score: " + score;
    document.getElementById("gameOver").style.display = "flex";
}

// Reset game
function resetGame() {
    score = 0;
    scrap = 100;
    wave = 1;
    health = 100;
    powerLevel = 100;
    shieldPower = 100;
    bullets = [];
    enemies = [];
    droppedModules = [];
    particles = [];
    explosions = [];
    buildMode = false;
    enemySpawnRate = 3000;
    
    player.x = WIDTH / 2;
    player.y = HEIGHT / 2;
    player.vx = 0;
    player.vy = 0;
    player.modules = { "0,0": new Module("core") };
    player.modules["1,0"] = new Module("gun");
    player.modules["-1,0"] = new Module("engine");
    
    spawnEnemy();
    spawnEnemy();
    
    document.getElementById("buildModeIndicator").style.display = "none";
    document.getElementById("score").textContent = score;
    document.getElementById("scrap").textContent = scrap;
    document.getElementById("wave").textContent = wave;
}

// --- Build mode mouse tracking ---
let buildMouse = { x: 0, y: 0 };
canvas.addEventListener("mousemove", e => {
    if (!buildMode) return;
    const rect = canvas.getBoundingClientRect();
    buildMouse.x = e.clientX - rect.left;
    buildMouse.y = e.clientY - rect.top;
});

// Build mode placement
function handleBuildMode() {
    if (!buildMode) return;
    
    // Draw grid
    ctx.strokeStyle = "rgba(100, 100, 255, 0.3)";
    ctx.lineWidth = 1;

    // --- Calculate hovered cell ---
    let hoveredCell = null;
    const relX = buildMouse.x - player.x;
    const relY = buildMouse.y - player.y;
    const gridGX = Math.round(relX / moduleSize);
    const gridGY = Math.round(relY / moduleSize);
    if (gridGX >= -2 && gridGX <= 2 && gridGY >= -2 && gridGY <= 2) {
        hoveredCell = { x: gridGX, y: gridGY };
    }

    for (let x = -2; x <= 2; x++) {
        for (let y = -2; y <= 2; y++) {
            const gridX = player.x + x * moduleSize;
            const gridY = player.y + y * moduleSize;
            const key = `${x},${y}`;
            // Draw grid cell
            ctx.strokeRect(gridX, gridY, moduleSize, moduleSize);

            // Highlight available spots
            if (!player.modules[key]) {
                // Highlight hovered cell
                if (hoveredCell && hoveredCell.x === x && hoveredCell.y === y) {
                    ctx.fillStyle = "rgba(0, 255, 255, 0.35)";
                    ctx.fillRect(gridX, gridY, moduleSize, moduleSize);
                } else {
                    ctx.fillStyle = "rgba(0, 200, 255, 0.2)";
                    ctx.fillRect(gridX, gridY, moduleSize, moduleSize);
                }
                // Show cost
                const cost = new Module(selectedModuleType).getCost();
                ctx.fillStyle = scrap >= cost ? "#00ff00" : "#ff0000";
                ctx.font = "12px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(`${cost}`, gridX + moduleSize/2, gridY + moduleSize/2);
            }
        }
    }
}

// Mouse interaction for build mode
canvas.addEventListener("click", e => {
    if (!buildMode || !gameRunning) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    // Snap to grid cell under mouse
    const relX = mouseX - player.x;
    const relY = mouseY - player.y;
    const gridGX = Math.round(relX / moduleSize);
    const gridGY = Math.round(relY / moduleSize);
    if (gridGX < -2 || gridGX > 2 || gridGY < -2 || gridGY > 2) return;
    const key = `${gridGX},${gridGY}`;
    // Prevent building on core or any occupied slot
    if (player.modules[key]) {
        if (key === "0,0") {
            alert("You cannot build on the ship's core.");
        } else {
            alert("That slot is already occupied.");
        }
        return;
    }
    const module = new Module(selectedModuleType);
    const cost = module.getCost();
    const gridX = player.x + gridGX * moduleSize;
    const gridY = player.y + gridGY * moduleSize;
    if (scrap >= cost) {
        player.modules[key] = module;
        scrap -= cost;
        createModulePlaceParticles(gridX, gridY);
        player.fireCooldown = 0;
        // Removed: keys["Space"] = false; // Do not clear space key state after build
        return;
    }
});

// Draw star background
function drawStars() {
    for (const star of stars) {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
        ctx.fillRect(star.x, star.y, star.size, star.size);
        
        // Move stars for parallax effect
        star.x -= star.speed * 0.1;
        if (star.x < -10) star.x = WIDTH + 10;
    }
}

// Main game loop
let lastTime = 0;
function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    
    // Draw background
    drawStars();

    // --- DEBUG OVERLAY: Show firing state ---
    ctx.save();
    ctx.font = "14px monospace";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.globalAlpha = 0.8;
    ctx.fillText(`fireCooldown: ${player.fireCooldown}`, 10, 10);
    ctx.fillText(`powerLevel: ${Math.floor(powerLevel)}`, 10, 28);
    ctx.fillText(`keys[Space]: ${!!keys["Space"]}`, 10, 46);
    ctx.fillText(`buildMode: ${buildMode}`, 10, 64);
    ctx.restore();

    if (gameRunning) {
        // If build mode is active, pause all game updates except build UI
        if (buildMode) {
            // Draw player ship and modules (so user can see what they're building)
            player.draw();
            // Draw dropped scrap for context
            droppedModules.forEach(d => d.draw());
            // Draw explosions and particles for visual continuity
            explosions.forEach(e => {
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
                const gradient = ctx.createRadialGradient(
                    e.x, e.y, 0,
                    e.x, e.y, e.size
                );
                gradient.addColorStop(0, `rgba(255, 200, 0, ${e.life/60})`);
                gradient.addColorStop(1, `rgba(255, 50, 0, 0)`);
                ctx.fillStyle = gradient;
                ctx.fill();
            });
            particles.forEach(p => {
                ctx.globalAlpha = p.life / 30;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            });
            // Draw build mode grid and handle placement
            handleBuildMode();
            // UI updates
            document.getElementById("score").textContent = score;
            document.getElementById("scrap").textContent = scrap;
            document.getElementById("powerValue").textContent = Math.floor(powerLevel) + "%";
            document.getElementById("powerFill").style.width = powerLevel + "%";
            document.getElementById("healthValue").textContent = Math.floor(health) + "%";
            document.getElementById("healthFill").style.width = health + "%";
            document.getElementById("shieldValue").textContent = Math.floor(shieldPower) + "%";
            document.getElementById("shieldFill").style.width = shieldPower + "%";
            // Do not update player, enemies, bullets, collisions, waves, etc.
            requestAnimationFrame(gameLoop);
            return;
        }
        
        // Update thruster particles timer
        if (thrusterParticlesTimer > 0) thrusterParticlesTimer--;
        
        // Update particles
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
        });
        particles = particles.filter(p => p.life > 0);
        
        // Update explosions
        explosions.forEach(e => {
            e.size += (e.maxSize - e.size) * 0.1;
            e.life--;
        });
        explosions = explosions.filter(e => e.life > 0);
        
        // Update player
        player.update();
        
        // Update enemies
        updateEnemies();
        
        // Update dropped scrap
        droppedModules.forEach(d => {
            d.update();
            d.draw();
        });
        droppedModules = droppedModules.filter(d => d.life > 0);
        
        // Update bullets
        bullets.forEach(b => {
            b.update();
            b.draw();
        });
        bullets = bullets.filter(b => b.life > 0);
        
        // Check collisions
        checkCollisions();
        
        // Draw player
        player.draw();
        
        // Draw explosions
        explosions.forEach(e => {
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
            const gradient = ctx.createRadialGradient(
                e.x, e.y, 0,
                e.x, e.y, e.size
            );
            gradient.addColorStop(0, `rgba(255, 200, 0, ${e.life/60})`);
            gradient.addColorStop(1, `rgba(255, 50, 0, 0)`);
            ctx.fillStyle = gradient;
            ctx.fill();
        });
        
        // Draw particles
        particles.forEach(p => {
            ctx.globalAlpha = p.life / 30;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        });
        
        // Spawn enemies
        if (timestamp - lastSpawn > enemySpawnRate) {
            spawnEnemy();
            lastSpawn = timestamp;
            
            // Spawn additional enemies in later waves
            if (wave > 3 && Math.random() < 0.3) {
                spawnEnemy();
            }
        }
        
        // Increase wave difficulty
        if (timestamp - lastWaveIncrease > 20000) {
            wave++;
            enemySpawnRate = Math.max(800, enemySpawnRate - 200);
            lastWaveIncrease = timestamp;
            document.getElementById("wave").textContent = wave;
        }
        
        // Power management
        powerLevel = Math.min(100, powerLevel + 0.1);
        shieldPower = Math.min(100, shieldPower + 0.05);
        health = Math.min(100, health + 0.02);
        
        // Update UI
        document.getElementById("score").textContent = score;
        document.getElementById("scrap").textContent = scrap;
        document.getElementById("powerValue").textContent = Math.floor(powerLevel) + "%";
        document.getElementById("powerFill").style.width = powerLevel + "%";
        document.getElementById("healthValue").textContent = Math.floor(health) + "%";
        document.getElementById("healthFill").style.width = health + "%";
        document.getElementById("shieldValue").textContent = Math.floor(shieldPower) + "%";
        document.getElementById("shieldFill").style.width = shieldPower + "%";
        
        // Handle build mode
        handleBuildMode();
        
        // Auto hide tutorial after 15 seconds
        if (timestamp > 15000) {
            document.getElementById("tutorial").style.opacity = "0.5";
        }
    }
    
    requestAnimationFrame(gameLoop);
}

// Initialize and start game
spawnEnemy();
spawnEnemy();
requestAnimationFrame(gameLoop);