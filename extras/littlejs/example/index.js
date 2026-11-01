// Load order matters: the engine, then the Ejecta shim, then the game.
ejecta.include('littlejs.js');
ejecta.include('littlejs-ejecta.js');
ejecta.include('game.js');
