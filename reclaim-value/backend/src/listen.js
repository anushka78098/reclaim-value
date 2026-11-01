function listen(app, port, logger = console, exit = (code) => process.exit(code)) {
  const server = app.listen(port, () => logger.log(`API on :${port}`));

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(
        `Port ${port} is already in use. The backend may already be running. ` +
        `Check http://localhost:${port}/api/health, stop the existing process with Ctrl+C, ` +
        `or set PORT to a different port before starting.`,
      );
    } else {
      logger.error(`Backend failed to listen on port ${port}: ${error.message}`);
    }
    exit(1);
  });

  return server;
}

module.exports = listen;
