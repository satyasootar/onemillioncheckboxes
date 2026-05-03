import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { publisher, subscriber, redis } from './redis-connection.js';
import pool, { initDB } from './db.js';

const CHECKBOX_STATE_KEY = 'checkbox-statev1';
const FEED_HISTORY_KEY = 'live-feed-historyv1';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret123';

async function main() {
  await initDB();

  const app = express();
  app.use(express.json());
  
  const server = http.createServer(app);
  const io = new Server(server);
  const PORT = process.env.PORT || 3000;

  // Auth endpoints
  app.post('/register', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      
      const hash = await bcrypt.hash(password, 10);
      await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hash]);
      res.json({ message: "Registered successfully! You can now log in." });
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: "Username already taken" });
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
      
      const valid = await bcrypt.compare(password, rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign({ username }, JWT_SECRET);
      res.json({ token, username, message: "Logged in successfully!" });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  //socket.io handlers
  io.attach(server);
  await subscriber.subscribe('checkbox-change', 'user-joined', 'user-registered');
    
  subscriber.on('message', (channel, message) => {
      if (channel === 'checkbox-change') {
          const {index, checked, by} = JSON.parse(message);
          io.emit('checkbox-update', { index, checked, by });
      }
      if (channel === 'user-joined') {
          io.emit('user-joined', message);
      }
      if (channel === 'user-registered') {
          io.emit('user-registered', message);
      }
  }); 

  io.on('connection', (socket) => {
    socket.on('user-joined', async (username) => {
        await redis.lpush(FEED_HISTORY_KEY, JSON.stringify({ type: 'joined', user: username, timestamp: Date.now() }));
        await redis.ltrim(FEED_HISTORY_KEY, 0, 49);
        await publisher.publish('user-joined', username);
    });

    socket.on('user-registered', async (username) => {
        await redis.lpush(FEED_HISTORY_KEY, JSON.stringify({ type: 'registered', user: username, timestamp: Date.now() }));
        await redis.ltrim(FEED_HISTORY_KEY, 0, 49);
        await publisher.publish('user-registered', username);
    });

    socket.on("checkbox-change", async(data) => {
        const { index, checked, token } = data;

        if (!token) {
            socket.emit("server:error", { message: "You must be logged in to check boxes.", data: data });
            return;
        }

        let username = null;
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            username = decoded.username;
        } catch(err) {
            socket.emit("server:error", { message: "Invalid session, please log in again.", data: data });
            return;
        }

        const rateLimitKey = `rate-limit:${socket.id}`;
        const lastOperationTimeStr = await redis.get(rateLimitKey);
        
        if(lastOperationTimeStr){
            const lastOperationTime = parseInt(lastOperationTimeStr, 10);
            const timeElapsed = Date.now() - lastOperationTime;
            if(timeElapsed < 2000){
              const remainingTime = 2000 - timeElapsed;
              socket.emit("server:error", { message: `Rate limit exceeded. Please try again in ${remainingTime} ms.`, data: data });
              return;
            }
        }
        await redis.set(rateLimitKey, Date.now().toString(), 'PX', 5000).catch(() => redis.set(rateLimitKey, Date.now().toString()));
        
        const existingstate = await redis.get(CHECKBOX_STATE_KEY);
        const remoteData = existingstate ? JSON.parse(existingstate) : new Array(1000000).fill(null);
        
        remoteData[index] = checked ? username : null;
        redis.set(CHECKBOX_STATE_KEY, JSON.stringify(remoteData));
       
        if (username) {
            await redis.lpush(FEED_HISTORY_KEY, JSON.stringify({ type: 'checkbox', index, checked, by: username, timestamp: Date.now() }));
            await redis.ltrim(FEED_HISTORY_KEY, 0, 49);
        }

        // Always pass the username so the feed knows who unchecked it
        await publisher.publish('checkbox-change', JSON.stringify({ index, checked, by: username }));
    });
  });

  //express handlers
  app.use(express.static('public'));

  app.get("/feed-history", async (req, res) => {
    const history = await redis.lrange(FEED_HISTORY_KEY, 0, -1);
    res.json({ history: history.map(item => JSON.parse(item)) });
  });

  app.get("/checkbox-state", async(req, res)=>{
    const existingstate = await redis.get(CHECKBOX_STATE_KEY);
    if(existingstate){
      res.json({state: JSON.parse(existingstate)});
    }else{
      res.json({state: new Array(1000000).fill(null)});
    }
  });

  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("❌ Server failed to start:", err);
});