const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const http = require("http");
const WebSocket = require("ws");

/* ================= CONFIG ================= */
const PORT = 8882;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 1;
const DIFFICULTY = "0000";
const MINING_KEY = "EQB1FrLRrNYXPdgidVkVUPG2G-dUi36SyNGnoYQGzc6fZ165";

/* ================= APP ================= */
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* ================= STATE ================= */
let chain = [];
let mempool = [];
let balances = {};
let minedBlocks = {};
let totalSupply = 0;

/* ================= UTILS ================= */
const hash = (data) =>
  crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");

function broadcast(data) {
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify(data));
    }
  });
}

/* ================= GENESIS ================= */
function genesis() {
  const block = {
    index: 0,
    time: Date.now(),
    prevHash: "0",
    nonce: 0,
    txs: [],
  };
  block.hash = hash(block);
  chain.push(block);
}
genesis();

/* ================= P2P ================= */
wss.on("connection", (ws) => {
  console.log("🌐 P2P node connected");
  ws.send(
    JSON.stringify({
      type: "sync",
      supply: totalSupply,
      height: chain.length,
    })
  );
});

/* ================= API ================= */

/* WALLET INFO */
app.get("/wallet/:address", (req, res) => {
  const addr = req.params.address;
  res.json({
    balance: balances[addr] || 0,
    blocks: minedBlocks[addr] || 0,
    supply: totalSupply,
  });
});

/* SEND TX */
app.post("/send", (req, res) => {
  const { from, to, amount } = req.body;

  if (!from || !to || amount <= 0)
    return res.json({ error: "Invalid transaction" });

  if ((balances[from] || 0) < amount)
    return res.json({ error: "Insufficient balance" });

  const tx = {
    id: crypto.randomUUID(),
    from,
    to,
    amount,
    time: Date.now(),
  };

  mempool.push(tx);
  broadcast({ type: "tx", tx });

  res.json({ message: "Transaction sent" });
});

/* MINE */
app.post("/mine", (req, res) => {
  const { address, miningKey } = req.body;

  if (miningKey !== MINING_KEY)
    return res.json({ error: "Invalid mining key" });

  if (totalSupply >= MAX_SUPPLY)
    return res.json({ error: "Max supply reached" });

  const block = {
    index: chain.length,
    time: Date.now(),
    prevHash: chain[chain.length - 1].hash,
    nonce: 0,
    txs: mempool.splice(0),
    miner: address,
  };

  while (!hash(block).startsWith(DIFFICULTY)) {
    block.nonce++;
  }

  block.hash = hash(block);
  chain.push(block);

  // reward
  balances[address] = (balances[address] || 0) + BLOCK_REWARD;
  minedBlocks[address] = (minedBlocks[address] || 0) + 1;
  totalSupply += BLOCK_REWARD;

  // apply txs
  block.txs.forEach((tx) => {
    balances[tx.from] -= tx.amount;
    balances[tx.to] = (balances[tx.to] || 0) + tx.amount;
  });

  broadcast({ type: "mine", block, supply: totalSupply });

  res.json({ message: "BlOCK KEYTOCOIN" });
});

/* ================= START ================= */
server.listen(PORT, () => {
  console.log(`🚀 KeytoCoin MAINNET running on port ${PORT}`);
});
