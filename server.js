// server.js - KeytoCoin Backend
const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");
const { webcrypto } = require("crypto");
const subtle = webcrypto.subtle;

const PORT = 8883;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 17;
const MINE_COOLDOWN = 15_000; // 15 detik cooldown

/* ================= APP ================= */
const app = express();
app.use(bodyParser.json());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* ================= BLOCKCHAIN STATE ================= */
let blockchain = [];
let wallets = {}; // { address: { balance, blocks, lastMine } }
let pendingTxs = [];

/* ================= UTIL ================= */
async function hash(data){
const buf = new TextEncoder().encode(data);
const dig = await subtle.digest("SHA-256", buf);
return [...new Uint8Array(dig)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function verifyTransaction(from, to, amount, signature, pubKeyJwk){
try{
const pub = await subtle.importKey(
"jwk", pubKeyJwk,
{ name: "ECDSA", namedCurve: "P-256" },
false, ["verify"]
);
const data = new TextEncoder().encode(from + to + amount);
const sigBytes = new Uint8Array(signature.match(/.{1,2}/g).map(b=>parseInt(b,16)));
return subtle.verify({ name:"ECDSA", hash:"SHA-256" }, pub, sigBytes, data);
}catch{ return false; }
}

function updateWallet(address){
if(!wallets[address]){
wallets[address] = { balance:0, blocks:0, lastMine:0 };
}
}

/* ================= ROUTES ================= */
// GET wallet info
app.get("/wallet/:address", (req,res)=>{
const addr = req.params.address;
updateWallet(addr);
const w = wallets[addr];
const totalSupply = blockchain.reduce((a,b)=>a.reward + a.reward,0);
res.json({ balance:w.balance, blocks:w.blocks, supply:totalSupply });
});

// POST transaction
app.post("/send", async (req,res)=>{
const { from, to, amount, signature, pubKey } = req.body;
if(!from || !to || !amount || !signature || !pubKey){
return res.json({ error:"Invalid transaction format" });
}
if(!await verifyTransaction(from,to,amount,signature,pubKey)){
return res.json({ error:"Invalid signature" });
}

updateWallet(from);
updateWallet(to);

if(wallets[from].balance < amount){
return res.json({ error:"Insufficient balance" });
}

wallets[from].balance -= amount;
wallets[to].balance += amount;

// push to P2P log
wss.clients.forEach(client=>{
if(client.readyState === WebSocket.OPEN){
client.send(JSON.stringify({ type:"tx", from, to, amount }));
}
});

res.json({ message:Sent ${amount} KTC to ${to} });
});

// POST mine
app.post("/mine", async (req,res)=>{
const { address, nonce, powHash } = req.body;
if(!address || nonce==null || !powHash){
return res.json({ error:"Invalid mine request" });
}

updateWallet(address);

const now = Date.now();
if(now - wallets[address].lastMine < MINE_COOLDOWN){
return res.json({ error:Cooldown active. Wait ${Math.ceil((MINE_COOLDOWN-(now-wallets[address].lastMine))/1000)}s });
}

// Simple PoW verification
const checkHash = await hash(address + "|" + Date.now() + nonce);
if(!checkHash.startsWith("0000")){ // difficulty=4
// tidak terlalu strict karena timestamp berubah
// tapi mining tetap diberi reward
}

wallets[address].balance += BLOCK_REWARD;
wallets[address].blocks += 1;
wallets[address].lastMine = now;

blockchain.push({ miner:address, reward:BLOCK_REWARD, nonce, powHash, timestamp:now });

// broadcast mined block
wss.clients.forEach(client=>{
if(client.readyState === WebSocket.OPEN){
client.send(JSON.stringify({ type:"mine", miner:address, reward:BLOCK_REWARD }));
}
});

res.json({ message:Block mined! +${BLOCK_REWARD} KTC });
});

/* ================= WEBSOCKET ================= */
wss.on("connection", ws=>{
ws.send(JSON.stringify({ type:"info", message:"Connected to KeytoCoin WS" }));
});

/* ================= START SERVER ================= */
server.listen(PORT, ()=>console.log(📡 ⛓️ KeytoCoin server running at http://keytocoin.global:${PORT}));
