// ...existing scene routes and WebSocket handlers remain unchanged...

async function start() {
  if (process.env.NODE_ENV === 'production') {
    const DIST_DIR = path.resolve(process.cwd(), 'dist');
    app.use(express.static(DIST_DIR));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(DIST_DIR, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Destroyer Engine Playground running on port ${PORT}`);
  });
}

start();
