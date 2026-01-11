// ================= IMPORT =================
const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");

// ================= CONFIG =================
const HTTP_PORT = 8882;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 1;

// Mining auth key (HARUS sama dengan HTML)
const MINING_KEY = "EQB1FrLRrNYXPdgidVkVUPG2G-dUi36SyNGnoYQGzc6fZ165";

// ================= STATE =================
let wallets = {}; 
// address => { balance: number, blocks: number }

let totalSupply = 0;

// ================= APP =================
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ================= HELPERS =================
function getWallet(address) {
  if (!wallets[address]) {
    wallets[address] = { balance: 0, blocks: 0 };
  }
  return wallets[address];
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(data);
    }
  });
}

// ================= API =================

// Get wallet info
app.get("/wallet/:address", (req, res) => {
  const { address } = req.params;
  const w = getWallet(address);

  res.json({
    address,
    balance: w.balance,
    blocks: w.blocks,
    supply: totalSupply
  });
});

// Mine block
app.post("/mine", (req, res) => {
  const { address, miningKey } = req.body;

  if (!address) {
    return res.json({ error: "No address" });
  }

  if (miningKey !== MINING_KEY) {
    return res.json({ error: "Invalid mining key" });
  }

  if (totalSupply + BLOCK_REWARD > MAX_SUPPLY) {
    return res.json({ error: "Max supply reached" });
  }

  const w = getWallet(address);

  w.balance += BLOCK_REWARD;
  w.blocks += 1;
  totalSupply += BLOCK_REWARD;

  broadcast({ type: "mine", address });

  res.json({
    message: `Block mined +${BLOCK_REWARD} KTC`,
    balance: w.balance,
    blocks: w.blocks,
    supply: totalSupply
  });
});

// Send transaction
app.post("/send", (req, res) => {
  const { from, to, amount } = req.body;

  if (!from || !to || !amount) {
    return res.json({ error: "Invalid transaction" });
  }

  const a = parseInt(amount);
  if (a <= 0) {
    return res.json({ error: "Invalid amount" });
  }

  const wf = getWallet(from);
  const wt = getWallet(to);

  if (wf.balance < a) {
    return res.json({ error: "Insufficient balance" });
  }

  wf.balance -= a;
  wt.balance += a;

  broadcast({ type: "tx", from, to, amount: a });

  res.json({
    message: `Sent ${a} KTC to ${to}`,
    balance: wf.balance
  });
});

// ================= WEBSOCKET =================
wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "info", message: "Connected to KeytoCoin P2P" }));
});

// ================= START =================
server.listen(HTTP_PORT, () => {
  console.log("🟢 KeytoCoin Server running on http://localhost:" + HTTP_PORT);
});
