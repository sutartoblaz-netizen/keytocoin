// ================= IMPORT =================
const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require("fs");

// ================= CONFIG =================
const HTTP_PORT = 8882;
const DATA_DIR = "./data";
const CHAIN_FILE = DATA_DIR + "/chain.json";
const WALLET_FILE = DATA_DIR + "/wallets.json";

const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 1;
const DIFFICULTY = 4;
const MINING_KEY = "EQB1FrLRrNYXPdgidVkVUPG2G-dUi36SyNGnoYQGzc6fZ165";

// ================= STATE =================
let blockchain = [];
let wallets = {};
let totalSupply = 0;

// ================= INIT =================
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

if (fs.existsSync(CHAIN_FILE))
  blockchain = JSON.parse(fs.readFileSync(CHAIN_FILE));

if (fs.existsSync(WALLET_FILE)) {
  wallets = JSON.parse(fs.readFileSync(WALLET_FILE));
  for (const a in wallets) totalSupply += wallets[a].balance;
}

// ================= UTILS =================
function sha256(d) {
  return crypto.createHash("sha256").update(d).digest("hex");
}

function saveAll() {
  fs.writeFileSync(CHAIN_FILE, JSON.stringify(blockchain, null, 2));
  fs.writeFileSync(WALLET_FILE, JSON.stringify(wallets, null, 2));
}

// ================= GENESIS =================
if (blockchain.length === 0) {
  blockchain.push({
    index: 0,
    time: Date.now(),
    data: "GENESIS",
    prevHash: "0",
    nonce: 0,
    hash: sha256("GENESIS")
  });
  saveAll();
}

// ================= WALLET =================
function wallet(addr) {
  if (!wallets[addr])
    wallets[addr] = { balance: 0, blocks: 0 };
  return wallets[addr];
}

// ================= POW =================
function mine(prevHash, data) {
  let nonce = 0;
  let hash = "";
  const target = "0".repeat(DIFFICULTY);

  do {
    nonce++;
    hash = sha256(prevHash + JSON.stringify(data) + nonce);
  } while (!hash.startsWith(target));

  return { nonce, hash };
}

// ================= BLOCK =================
function addBlock(data) {
  const prev = blockchain[blockchain.length - 1];
  const mined = mine(prev.hash, data);

  const block = {
    index: blockchain.length,
    time: Date.now(),
    data,
    prevHash: prev.hash,
    nonce: mined.nonce,
    hash: mined.hash
  };

  blockchain.push(block);
  saveAll();
  return block;
}

// ================= SERVER =================
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ================= API =================
app.get("/wallet/:addr", (req, res) => {
  const w = wallet(req.params.addr);
  res.json({
    balance: w.balance,
    blocks: w.blocks,
    supply: totalSupply
  });
});

app.post("/mine", (req, res) => {
  const { address, miningKey } = req.body;

  if (miningKey !== MINING_KEY)
    return res.json({ error: "Invalid mining key" });

  if (totalSupply + BLOCK_REWARD > MAX_SUPPLY)
    return res.json({ error: "Max supply reached" });

  addBlock({ type: "mine", to: address, reward: BLOCK_REWARD });

  const w = wallet(address);
  w.balance += BLOCK_REWARD;
  w.blocks++;
  totalSupply += BLOCK_REWARD;

  saveAll();
  broadcast({ type: "mine" });

  res.json({ message: "Block mined KTC" });
});

app.post("/send", (req, res) => {
  const { from, to, amount, signature, pubKey } = req.body;
  const a = Number(amount);

  if (!from || !to || !signature || !pubKey || a <= 0)
    return res.json({ error: "Invalid TX" });

  const verify = crypto.verify(
    null,
    Buffer.from(from + to + a),
    pubKey,
    Buffer.from(signature, "hex")
  );

  if (!verify) return res.json({ error: "Bad signature" });

  const wf = wallet(from);
  const wt = wallet(to);

  if (wf.balance < a)
    return res.json({ error: "Insufficient balance" });

  addBlock({ type: "tx", from, to, amount: a });

  wf.balance -= a;
  wt.balance += a;

  saveAll();
  broadcast({ type: "tx" });

  res.json({ message: "Transaction sent" });
});

// ================= P2P =================
function broadcast(msg) {
  const d = JSON.stringify(msg);
  wss.clients.forEach(c => c.readyState === 1 && c.send(d));
}

// ================= START =================
server.listen(HTTP_PORT, () => {
  console.log("🟢 KEYTOCOIN FINAL REAL SERVER");
});
