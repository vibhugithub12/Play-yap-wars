const express = require("express");
const { Resend } = require("resend");

// ============================================================
// 🔑 RESEND API KEY — replace or set as env var RESEND_API_KEY
// ============================================================
const resend = new Resend(process.env.RESEND_API_KEY || "YOUR_RESEND_API_KEY"); // 👈 Replace
const FEEDBACK_TO = "lifeprogress37@gmail.com";
// ============================================================
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

// Active rooms: { [CODE]: { createdAt, status, players[] } }
// status: "lobby" | "ongoing"
const activeRooms = {};

// Cleanup rooms older than 3 hours
setInterval(() => {
  const now = Date.now();
  Object.keys(activeRooms).forEach(code => {
    if (now - activeRooms[code].createdAt > 3 * 60 * 60 * 1000)
      delete activeRooms[code];
  });
}, 10 * 60 * 1000);

app.get("/", (req, res) => res.send("Yap 🗣️ Wars"));

// Guest calls this before joining to verify room exists + check status
app.get("/room-exists", (req, res) => {
  const code = (req.query.code || "").toUpperCase();
  const room = activeRooms[code];
  res.json({ exists: !!room, status: room?.status || null });
});

// Create room explicitly (called by host on lobby creation)
app.post("/create-room", (req, res) => {
  const code = (req.body.code || "").toUpperCase();
  if (!code) return res.status(400).json({ error: "Missing code" });
  activeRooms[code] = { createdAt: Date.now(), status: "lobby" };
  console.log(`✅ Room created: ${code}  |  Active: ${Object.keys(activeRooms).length}`);
  res.json({ ok: true });
});

// Update room status (lobby <-> ongoing)
app.post("/room-status", (req, res) => {
  const code = (req.body.code || "").toUpperCase();
  const { status } = req.body;
  if (!activeRooms[code]) return res.status(404).json({ error: "Room not found" });
  activeRooms[code].status = status;
  console.log(`🔄 Room ${code} status → ${status}`);
  res.json({ ok: true });
});

// Feedback endpoint
app.post("/feedback", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "No message" });
  try {
    await resend.emails.send({
      from:    "Yap Wars Feedback <onboarding@resend.dev>",
      to:      FEEDBACK_TO,
      subject: "💬 New Yap Wars Feedback",
      html: `<p>${message.replace(/\n/g, "<br/>")}</p><hr/><p style="color:#888;font-size:12px">Sent from yapwars.online</p>`,   });
    res.json({ ok: true });
  } catch(err) {
    console.error("Resend error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// All game events go through here
app.post("/event", async (req, res) => {
  const { channel, event, data } = req.body;
  if (!channel || !event || !data)
    return res.status(400).json({ error: "Missing fields" });

  const code = channel.replace("game-", "").toUpperCase();

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

// Keep alive ping (prevents Render free tier from sleeping)
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 4000}`;
setInterval(() => {
  fetch(SERVER_URL)
    .then(() => console.log("🏓 Self-ping OK"))
    .catch(err => console.log("Self-ping failed:", err.message));
}, 14 * 60 * 1000);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));