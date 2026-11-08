import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const SCENES_DIR = path.resolve(DATA_DIR, 'scenes');
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SCENES_DIR)) fs.mkdirSync(SCENES_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Seed default scenes if missing
const defaultScenes = [
  {
    fileName: 'massive_battle.json',
    name: '10,000 Mech Battlefield',
    preset: 'massive_indirect',
    entitiesCount: 10000,
    camera: { position: [0, 15, 30], target: [0, 0, 0], radius: 35, mode: 'ORBIT' },
    entities: []
  },
  {
    fileName: 'mech_sentry.json',
    name: 'Combat Mech Squadron',
    preset: 'skinned_mech',
    entitiesCount: 3,
    camera: { position: [0, 4, 14], target: [0, 1.5, 0], radius: 14, mode: 'ORBIT' },
    entities: []
  },
  {
    fileName: 'quantum_core.json',
    name: 'Morphing Quantum Core',
    preset: 'morph_core',
    entitiesCount: 9,
    camera: { position: [0, 8, 20], target: [0, 0, 0], radius: 20, mode: 'ORBIT' },
    entities: []
  },
  {
    fileName: 'harmonic_waves.json',
    name: 'Harmonic Wave Terrain',
    preset: 'wave_terrain',
    entitiesCount: 1,
    camera: { position: [0, 12, 32], target: [0, 0, 0], radius: 32, mode: 'ORBIT' },
    entities: []
  }
];

for (const scn of defaultScenes) {
  const filePath = path.join(SCENES_DIR, scn.fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(scn, null, 2), 'utf-8');
  }
}

app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Helper: Get scene list
function getScenesList() {
  const files = fs.readdirSync(SCENES_DIR).filter(f => f.endsWith('.json'));
  return files.map(fileName => {
    try {
      const raw = fs.readFileSync(path.join(SCENES_DIR, fileName), 'utf-8');
      const data = JSON.parse(raw);
      return {
        fileName,
        name: data.name || fileName.replace('.json', ''),
        preset: data.preset || 'massive_indirect',
        entitiesCount: data.entitiesCount || (data.entities ? data.entities.length : 0)
      };
    } catch {
      return { fileName, name: fileName, preset: 'custom', entitiesCount: 0 };
    }
  });
}

// REST Endpoints
app.get('/api/scenes', (req, res) => {
  res.json(getScenesList());
});

app.get('/api/scenes/:fileName', (req, res) => {
  const filePath = path.join(SCENES_DIR, req.params.fileName);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Scene not found' });
  }
});

app.post('/api/scenes/:fileName', (req, res) => {
  const filePath = path.join(SCENES_DIR, req.params.fileName);
  fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2), 'utf-8');
  broadcast({ type: 'SCENE_LIST', scenes: getScenesList() });
  res.json({ success: true, fileName: req.params.fileName });
});

app.delete('/api/scenes/:fileName', (req, res) => {
  const filePath = path.join(SCENES_DIR, req.params.fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    broadcast({ type: 'SCENE_LIST', scenes: getScenesList() });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Scene not found' });
  }
});

app.get('/api/assets', (req, res) => {
  const files = fs.readdirSync(UPLOADS_DIR);
  const assets = files.map(file => {
    const stat = fs.statSync(path.join(UPLOADS_DIR, file));
    return {
      name: file,
      url: `/uploads/${file}`,
      sizeBytes: stat.size
    };
  });
  res.json(assets);
});

app.post('/api/assets/upload', (req, res) => {
  const { name, base64Data } = req.body;
  if (!name || !base64Data) {
    return res.status(400).json({ error: 'Missing name or base64Data' });
  }
  const cleanName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(UPLOADS_DIR, cleanName);
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(filePath, buffer);
  res.json({ success: true, name: cleanName, url: `/uploads/${cleanName}`, sizeBytes: buffer.length });
});

// Broadcast helper to all WebSocket clients
function broadcast(data: any) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// WebSocket Connection Handler
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'SCENE_LIST', scenes: getScenesList() }));

  ws.on('message', (message: string) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === 'LOAD_SCENE') {
        const filePath = path.join(SCENES_DIR, msg.fileName);
        if (fs.existsSync(filePath)) {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          ws.send(JSON.stringify({ type: 'SCENE_LOADED', fileName: msg.fileName, data: content }));
        }
      } else if (msg.type === 'SAVE_SCENE') {
        const filePath = path.join(SCENES_DIR, msg.fileName);
        fs.writeFileSync(filePath, JSON.stringify(msg.payload, null, 2), 'utf-8');
        broadcast({ type: 'SCENE_LIST', scenes: getScenesList() });
      } else if (msg.type === 'CREATE_PROJECT') {
        const fileName = `${msg.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`;
        const filePath = path.join(SCENES_DIR, fileName);
        const newScene = {
          name: msg.name,
          preset: msg.preset || 'massive_indirect',
          entitiesCount: 0,
          camera: { position: [0, 8, 20], target: [0, 0, 0], radius: 20, mode: 'ORBIT' },
          entities: []
        };
        fs.writeFileSync(filePath, JSON.stringify(newScene, null, 2), 'utf-8');
        broadcast({ type: 'SCENE_LIST', scenes: getScenesList() });
        ws.send(JSON.stringify({ type: 'PROJECT_CREATED', fileName }));
      }
    } catch (err) {
      console.error('[WS Error]:', err);
    }
  });
});

async function start() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Destroyer Engine Playground running on http://localhost:${PORT}`);
  });
}

start();
