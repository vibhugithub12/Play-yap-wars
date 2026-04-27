const express = require("express");
const cors = require("cors");
const Pusher = require("pusher");

// ============================================================
// 🔑 PUSHER CONFIG — REPLACE THESE WITH YOUR REAL KEYS
// ============================================================
const pusher = new Pusher({
  appId:   process.env.PUSHER_APP_ID,
  key:     process.env.PUSHER_KEY,
  secret:  process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS:  true,
});
// ============================================================

const app = express();
app.use(cors());
app.use(express.json());

// Active rooms: { [CODE]: { createdAt } }
const activeRooms = {};

// Cleanup rooms older than 3 hours
setInterval(
  () => {
    const now = Date.now();
    Object.keys(activeRooms).forEach((code) => {
      if (now - activeRooms[code].createdAt > 3 * 60 * 60 * 1000)
        delete activeRooms[code];
    });
  },
  10 * 60 * 1000,
);

app.get("/", (req, res) => res.send("Hot Take Showdown 🔥"));

// Guest calls this before joining to verify room exists
app.get("/room-exists", (req, res) => {
  const code = (req.query.code || "").toUpperCase();
  res.json({ exists: !!activeRooms[code] });
});

// Single event endpoint — all game events go through here
app.post("/event", async (req, res) => {
  const { channel, event, data } = req.body;
  if (!channel || !event || !data)
    return res.status(400).json({ error: "Missing fields" });

  const code = channel.replace("game-", "").toUpperCase();

 
  // Register room on first player-joined (host creates room)
  if (event === "player-joined" && !activeRooms[code]) {
    activeRooms[code] = { createdAt: Date.now() };
    console.log(
      `✅ Room created: ${code}  |  Active: ${Object.keys(activeRooms).length}`,
    );
  }

  // Remove room shortly after game ends
  if (event === "show-final") {
    setTimeout(() => {
      delete activeRooms[code];
      console.log(`🗑  Room removed: ${code}`);
    }, 60_000);
  }

  try {
    await pusher.trigger(channel, event, data);
    res.json({ ok: true });
  } catch (err) {
    console.error("Pusher error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

 // Add this new endpoint
  app.post("/create-room", (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Missing code" });
    activeRooms[code.toUpperCase()] = { createdAt: Date.now() };
    console.log(
      `✅ Room created: ${code} | Active: ${Object.keys(activeRooms).length}`,
    );
    res.json({ ok: true });
  });

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
// Keep server alive — ping self every 14 minutes
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => {
  fetch(SERVER_URL)
    .then(() => console.log("🏓 Self-ping OK"))
    .catch(err => console.log("Self-ping failed:", err.message));
}, 14 * 60 * 1000);