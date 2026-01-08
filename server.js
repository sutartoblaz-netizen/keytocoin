// ================= IMPORT =================
const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");
const crypto = require("crypto");

// ================= CONFIG =================
const HTTP_PORT = 8882;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 1;

// ================= STATE =================
let wallets = {};   // address => { balance, blocks }
let totalSupply = 0;

// ================= APP =================
const app = express();
app.use(cors());
app.use(express.json());

// ================= HELPERS =================
function sha256(data){
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ================= DIFFICULTY =================
function currentDifficulty(){
  if(totalSupply < 5_000_000) return 2;
  if(totalSupply < 10_000_000) return 3;
  return 4;
}

// ================= WEBSOCKET =================
let wss;

function broadcast(msg){
  const data = JSON.stringify(msg);
  if(!wss) return;
  wss.clients.forEach(ws=>{
    if(ws.readyState === WebSocket.OPEN){
      ws.send(data);
    }
  });
}

// ================= API =================

// ---------- WALLET INFO ----------
app.get("/wallet/:address",(req,res)=>{
  const { address } = req.params;

  if(!wallets[address]){
    wallets[address] = { balance:0, blocks:0 };
  }

  res.json({
    balance: wallets[address].balance,
    blocks: wallets[address].blocks,
    supply: totalSupply
  });
});

// ---------- MINE BLOCK (REAL POW LOOP) ----------
app.post("/mine",(req,res)=>{
  const { address } = req.body;

  if(!address){
    return res.json({ error:"Invalid mining request" });
  }

  if(totalSupply >= MAX_SUPPLY){
    return res.json({ error:"Max supply reached" });
  }

  const difficulty = currentDifficulty();
  let nonce, hash, tries = 0;

  // ===== REAL PoW LOOP =====
  do{
    nonce = crypto.randomBytes(16).toString("hex");
    hash = sha256(address + nonce);
    tries++;
  }while(!hash.startsWith("0".repeat(difficulty)));

  if(!wallets[address]){
    wallets[address] = { balance:0, blocks:0 };
  }

  wallets[address].balance += BLOCK_REWARD;
  wallets[address].blocks += 1;
  totalSupply += BLOCK_REWARD;

  broadcast({
    type:"mine",
    address,
    reward:BLOCK_REWARD,
    supply: totalSupply
  });

  res.json({
    message:`Block mined +${BLOCK_REWARD} KTC`,
    difficulty,
    tries
  });
});

// ---------- SEND TRANSACTION ----------
app.post("/send",(req,res)=>{
  const { from, to, amount } = req.body;

  if(!from || !to || amount <= 0){
    return res.json({ error:"Invalid transaction" });
  }

  if(!wallets[from] || wallets[from].balance < amount){
    return res.json({ error:"Insufficient balance" });
  }

  if(!wallets[to]){
    wallets[to] = { balance:0, blocks:0 };
  }

  wallets[from].balance -= amount;
  wallets[to].balance += amount;

  broadcast({
    type:"tx",
    from,
    to,
    amount
  });

  res.json({ message:`Sent ${amount} KTC` });
});

// ================= START SERVER =================
const server = app.listen(HTTP_PORT,()=>{
  console.log("🚀 KeytoCoin Mainnet running");
  console.log("🌐 HTTP  http://localhost:"+HTTP_PORT);
  console.log("🔗 WS    ws://localhost:"+HTTP_PORT);
});

// ================= P2P =================
wss = new WebSocket.Server({ server });

wss.on("connection",(ws)=>{
  ws.send(JSON.stringify({
    type:"sync",
    supply: totalSupply
  }));
});
