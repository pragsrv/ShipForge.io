const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

let keys = {};
let score = 0;
let bullets = [];
let enemies = [];
let droppedModules = [];

document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

const moduleSize = 20;

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

class Module {
  constructor(type) {
    this.type = type;
    this.hp = type === "armor" ? 3 : 1;
  }

  draw(x, y) {
    ctx.fillStyle = {
      core: "#0ff",
      engine: "#0f0",
      gun: "#f00",
      armor: "#888"
    }[this.type] || "#fff";

    ctx.fillRect(x, y, moduleSize, moduleSize);
    ctx.strokeStyle = "#000";
    ctx.strokeRect(x, y, moduleSize, moduleSize);
  }
}

class Ship {
  constructor(x, y, isPlayer = false) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.modules = { "0,0": new Module("core") };
    this.isPlayer = isPlayer;
    this.fireCooldown = 0;
  }

  update() {
    if (this.isPlayer) this.handleInput();

    this.x += this.vx;
    this.y += this.vy;

    this.vx *= 0.98;
    this.vy *= 0.98;

    this.x = Math.max(0, Math.min(WIDTH, this.x));
    this.y = Math.max(0, Math.min(HEIGHT, this.y));

    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.isPlayer && keys[" "] && this.fireCooldown === 0) {
      this.fire();
      this.fireCooldown = 20;
    }
  }

  handleInput() {
    const thrust = 0.2;
    if (keys["ArrowUp"]) this.vy -= thrust;
    if (keys["ArrowDown"]) this.vy += thrust;
    if (keys["ArrowLeft"]) this.vx -= thrust;
    if (keys["ArrowRight"]) this.vx += thrust;
  }

  fire() {
    for (let key in this.modules) {
      if (this.modules[key].type === "gun") {
        const [gx, gy] = key.split(",").map(Number);
        const angle = Math.atan2(gy, gx);
        const speed = 5;
        bullets.push(new Bullet(
          this.x + gx * moduleSize,
          this.y + gy * moduleSize,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          this
        ));
      }
    }
  }

  draw() {
    for (let key in this.modules) {
      const [gx, gy] = key.split(",").map(Number);
      const px = this.x + gx * moduleSize;
      const py = this.y + gy * moduleSize;
      this.modules[key].draw(px, py);
    }
  }

  getModulePositions() {
    return Object.entries(this.modules).map(([k, mod]) => {
      const [gx, gy] = k.split(",").map(Number);
      return {
        x: this.x + gx * moduleSize,
        y: this.y + gy * moduleSize,
        key: k,
        mod: mod
      };
    });
  }
}

class Bullet {
  constructor(x, y, vx, vy, owner) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = 60;
    this.owner = owner;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
  }

  draw() {
    ctx.fillStyle = "#f00";
    ctx.fillRect(this.x, this.y, 4, 4);
  }
}

const player = new Ship(WIDTH / 2, HEIGHT / 2, true);
player.modules["1,0"] = new Module("gun");
player.modules["-1,0"] = new Module("engine");

function spawnEnemy() {
  const e = new Ship(getRandomInt(100, WIDTH - 100), getRandomInt(100, HEIGHT - 100));
  e.modules["0,0"] = new Module("core");
  e.modules["1,0"] = new Module("gun");
  e.modules["-1,0"] = new Module("engine");
  enemies.push(e);
}

function updateEnemies() {
  for (let e of enemies) {
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 100) {
      e.vx += 0.05 * Math.sign(dx);
      e.vy += 0.05 * Math.sign(dy);
    }
    if (dist < 300 && e.fireCooldown === 0) {
      e.fire();
      e.fireCooldown = 50;
    }
    e.update();
    e.draw();
  }
}

function checkCollisions() {
  for (let b of bullets) {
    const ships = [player, ...enemies];
    for (let ship of ships) {
      if (b.owner === ship) continue;

      for (let { x, y, key, mod } of ship.getModulePositions()) {
        if (
          b.x < x + moduleSize &&
          b.x + 4 > x &&
          b.y < y + moduleSize &&
          b.y + 4 > y
        ) {
          mod.hp--;
          b.life = 0;
          if (mod.hp <= 0) {
            if (mod.type !== "core") {
              droppedModules.push({ x, y, type: mod.type });
              delete ship.modules[key];
            } else {
              if (ship === player) {
                alert("You were sunk! Final Score: " + score);
                location.reload();
              } else {
                score += 10;
                enemies = enemies.filter(s => s !== ship);
              }
            }
          }
        }
      }
    }
  }
}

function updateDroppedModules() {
  for (let d of droppedModules) {
    ctx.fillStyle = "#ccc";
    ctx.fillRect(d.x, d.y, moduleSize, moduleSize);
    ctx.strokeRect(d.x, d.y, moduleSize, moduleSize);

    const dx = player.x - d.x;
    const dy = player.y - d.y;
    if (Math.hypot(dx, dy) < 30) {
      for (let ox = -2; ox <= 2; ox++) {
        for (let oy = -2; oy <= 2; oy++) {
          const k = `${ox},${oy}`;
          if (!player.modules[k]) {
            player.modules[k] = new Module(d.type);
            droppedModules = droppedModules.filter(m => m !== d);
            return;
          }
        }
      }
    }
  }
}

let lastSpawn = 0;

function gameLoop(timestamp) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  player.update();
  player.draw();

  updateEnemies();
  updateDroppedModules();
  checkCollisions();

  bullets.forEach(b => {
    b.update();
    b.draw();
  });
  bullets = bullets.filter(b => b.life > 0);

  if (timestamp - lastSpawn > 5000 && enemies.length < 5) {
    spawnEnemy();
    lastSpawn = timestamp;
  }

  document.getElementById("score").textContent = score;
  requestAnimationFrame(gameLoop);
}

spawnEnemy();
spawnEnemy();
requestAnimationFrame(gameLoop);
