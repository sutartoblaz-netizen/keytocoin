// ================= IMPORT =================
const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

// ================= CONFIG =================
const HTTP_PORT = process.env.PORT || 8882;
const WS_PORT = 8883;
const DATA_DIR = "./data";
const CHAIN_FILE = path.join(DATA_DIR, "chain.json");
const WALLET_FILE = path.join(DATA_DIR, "wallets.json");
const MAX_SUPPLY = 17000000;
const MINING_REWARD = 17;

// ================= INIT DIR =================
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(CHAIN_FILE)) fs.writeFileSync(CHAIN_FILE, JSON.stringify([]));
if (!fs.existsSync(WALLET_FILE)) fs.writeFileSync(WALLET_FILE, JSON.stringify({}));

// ================= HELPER =================
function hash(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function loadChain() {
  return JSON.parse(fs.readFileSync(CHAIN_FILE));
}

function saveChain(chain) {
  fs.writeFileSync(CHAIN_FILE, JSON.stringify(chain, null, 2));
}

function loadWallets() {
  return JSON.parse(fs.readFileSync(WALLET_FILE));
}

function saveWallets(wallets) {
  fs.writeFileSync(WALLET_FILE, JSON.stringify(wallets, null, 2));
}

// ================= FIXED WALLET =================
let PRIVATE_KEY = fs.existsSync(path.join(DATA_DIR,"private_key.json"))
  ? JSON.parse(fs.readFileSync(path.join(DATA_DIR,"private_key.json")))
  : crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });

if(!fs.existsSync(path.join(DATA_DIR,"private_key.json"))){
  fs.writeFileSync(path.join(DATA_DIR,"private_key.json"), JSON.stringify(PRIVATE_KEY.privateKey.export({ format: "jwk" })));
}
const PUBLIC_KEY = PRIVATE_KEY.publicKey.export({ format: "jwk" });
const FIXED_ADDRESS = hash(JSON.stringify(PUBLIC_KEY)).slice(0,32);

// ================= EXPRESS =================
const app = express();
app.use(cors());
app.use(express.json());

// ===== WALLET INFO =====
app.get("/wallet/:address", (req, res) => {
  const wallets = loadWallets();
  const address = req.params.address;
  const wallet = wallets[address] || { balance: 0, blocks: 0, supply: 0 };
  res.json(wallet);
});

// ===== MINE BLOCK =====
app.post("/mine", (req, res) => {
  const { address } = req.body;
  if (!address) return res.json({ error: "Address required" });

  const chain = loadChain();
  const wallets = loadWallets();

  // Reward
  let supply = Object.values(wallets).reduce((a,b)=>a+b.balance,0);
  if (supply + MINING_REWARD > MAX_SUPPLY)
    return res.json({ error: "Max supply reached" });

  // New block
  const prevHash = chain.length ? chain[chain.length-1].hash : "0".repeat(64);
  const block = {
    index: chain.length,
    timestamp: Date.now(),
    miner: address,
    reward: MINING_REWARD,
    prevHash,
  };
  block.hash = hash(JSON.stringify(block));
  chain.push(block);
  saveChain(chain);

  // Update wallet
  if (!wallets[address]) wallets[address] = { balance: 0, blocks: 0, supply: 0 };
  wallets[address].balance += MINING_REWARD;
  wallets[address].blocks += 1;
  wallets[address].supply = supply + MINING_REWARD;
  saveWallets(wallets);

  // Broadcast to P2P
  broadcast({ type:"mine", block });

  res.json({ message: `Mined block #${block.index} +${MINING_REWARD} KTC` });
});

// ===== SEND TRANSACTION =====
app.post("/send", (req,res)=>{
  const { from, to, amount, signature, pubKey } = req.body;
  if(!from||!to||!amount||!signature||!pubKey) return res.json({ error:"Invalid tx" });

  const wallets = loadWallets();
  if(!wallets[from] || wallets[from].balance < amount) return res.json({ error:"Insufficient balance" });

  // Verify signature
  const key = crypto.createPublicKey({ key: JSON.stringify(pubKey), format:"jwk" });
  const verify = crypto.createVerify("SHA256");
  verify.update(from + to + amount);
  verify.end();
  const sigBuf = Buffer.from(signature, "hex");
  if(!verify.verify(key, sigBuf)) return res.json({ error:"Invalid signature" });

  // Transfer
  if(!wallets[to]) wallets[to] = { balance:0, blocks:0, supply: wallets[from].supply };
  wallets[from].balance -= amount;
  wallets[to].balance += amount;
  saveWallets(wallets);

  // Broadcast tx
  broadcast({ type:"tx", from,to,amount });

  res.json({ message:`Sent ${amount} KTC to ${to}` });
});

// ===== START SERVER =====
const server = http.createServer(app);
server.listen(HTTP_PORT, ()=>console.log(`HTTP Server running on ${HTTP_PORT}`));

// ================= P2P =================
const wss = new WebSocket.Server({ port: WS_PORT });
let peers = [];

function broadcast(msg){
  peers.forEach(ws=>{
    if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg));
  });
}

wss.on("connection", ws=>{
  peers.push(ws);
  ws.on("message", msg=>{
    const data = JSON.parse(msg);
    console.log("P2P message:", data);
  });
  ws.on("close", ()=>{ peers = peers.filter(p=>p!==ws); });
});

console.log(`WebSocket P2P running on ${WS_PORT}`);
