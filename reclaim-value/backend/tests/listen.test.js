const { EventEmitter } = require('events');
const listen = require('../src/listen');

describe('backend listener startup', () => {
  test('explains that the backend may already be running when the port is occupied', () => {
    const server = new EventEmitter();
    const app = { listen: jest.fn(() => server) };
    const logger = { log: jest.fn(), error: jest.fn() };
    const exit = jest.fn();

    expect(listen(app, 5000, logger, exit)).toBe(server);
    server.emit('error', Object.assign(new Error('address in use'), { code: 'EADDRINUSE' }));

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Port 5000 is already in use. The backend may already be running.'),
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('http://localhost:5000/api/health'));
    expect(exit).toHaveBeenCalledWith(1);
  });

  test('reports other listen errors explicitly', () => {
    const server = new EventEmitter();
    const logger = { log: jest.fn(), error: jest.fn() };
    const exit = jest.fn();

    listen({ listen: () => server }, 5000, logger, exit);
    server.emit('error', Object.assign(new Error('permission denied'), { code: 'EACCES' }));

    expect(logger.error).toHaveBeenCalledWith('Backend failed to listen on port 5000: permission denied');
    expect(exit).toHaveBeenCalledWith(1);
  });
});
