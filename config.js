const config = {
  BOT_TOKEN: process.env.BOT_TOKEN || "",
  OWNER_ID: ["7259883138"],
  MEMEK_ID: process.env.CHANNEL_ID || "",   // Your Telegram channel ID (numbers, not username)
  KONTOL: [],                                // Extra owner IDs to receive /req messages
};

module.exports = config;
