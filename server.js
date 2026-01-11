// ================= IMPORT =================
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const WebSocket = require("ws");

// ================= CONFIG =================
const PORT = 8882;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 1;
const MINING_KEY = "EQB1FrLRrNYXPdgidVkVUPG2G-dUi36SyNGnoYQGzc6fZ165";

// ================= STATE =================
let wallets = {}; 
// address => { balance: number, blocks: number }
let totalSupply = 0;

// ================= APP =================
const app = express();
app.use(cors());
app.use(express.json());

// ================= UTIL =================
function broadcast(type, payload = {}) {
  const msg = JSON.stringify({ type, ...payload });
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

function ensureWallet(address) {
  if (!wallets[address]) {
    wallets[address] = { balance: 0, blocks: 0 };
  }
}

// ================= API =================

// GET WALLET INFO
app.get("/wallet/:address", (req, res) => {
  const { address } = req.params;
  ensureWallet(address);

  res.json({
    balance: wallets[address].balance,
    blocks: wallets[address].blocks,
    supply: totalSupply
  });
});

// MINE BLOCK
app.post("/mine", (req, res) => {
  const { address, miningKey } = req.body;

  if (miningKey !== MINING_KEY) {
    return res.json({ error: "Invalid mining key" });
  }

  if (totalSupply + BLOCK_REWARD > MAX_SUPPLY) {
    return res.json({ error: "Max supply reached" });
  }

  ensureWallet(address);

  wallets[address].balance += BLOCK_REWARD;
  wallets[address].blocks += 1;
  totalSupply += BLOCK_REWARD;

  broadcast("mine", { address });

  res.json({
    message: `Block mined +${BLOCK_REWARD} KTC`,
    supply: totalSupply
  });
});

// SEND TRANSACTION
app.post("/send", (req, res) => {
  const { from, to, amount } = req.body;

  if (!from || !to || amount <= 0) {
    return res.json({ error: "Invalid transaction data" });
  }

  ensureWallet(from);
  ensureWallet(to);

  if (wallets[from].balance < amount) {
    return res.json({ error: "Insufficient balance" });
  }

  wallets[from].balance -= amount;
  wallets[to].balance += amount;

  broadcast("tx", { from, to, amount });

  res.json({
    message: `Sent ${amount} KTC to ${to}`
  });
});

// ================= SERVER =================
const server = app.listen(PORT, () => {
  console.log(`🚀 KeytoCoin server running on http://localhost:${PORT}`);
});

// ================= WEBSOCKET P2P =================
const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "sync", wallets, supply: totalSupply }));

  ws.on("close", () => {
    console.log("❌ P2P client disconnected");
  });
});
