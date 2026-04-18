// server.js — Entry point
// Runs both the Telegram bot (index.js) and web pairing server (web.js) together

require("./web");   // starts Express on process.env.PORT
require("./index"); // starts Telegram bot + WA connections
