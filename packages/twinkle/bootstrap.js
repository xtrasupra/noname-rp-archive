const path = require('path');

global.TWINKLE_PATH = __dirname;

global.TWINKLE = {
  ROOT: __dirname,
  DATABASE: path.join(__dirname, 'database'),
  UTILS: path.join(__dirname, 'utils'),
};

global.twinklePlayer = require('./utils/player.js');

console.log('[BOOT] TWINKLE globals initialized');
