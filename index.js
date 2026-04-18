const {
    default: makeWASocket,
    useMultiFileAuthState,
    downloadContentFromMessage,
    emitGroupParticipantsUpdate,
    emitGroupUpdate,
    generateWAMessageContent,
    generateWAMessage,
    makeInMemoryStore,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    MediaType,
    areJidsSameUser,
    WAMessageStatus,
    downloadAndSaveMediaMessage,
    AuthenticationState,
    GroupMetadata,
    initInMemoryKeyStore,
    getContentType,
    MiscMessageGenerationOptions,
    useSingleFileAuthState,
    BufferJSON,
    WAMessageProto,
    MessageOptions,
    WAFlag,
    WANode,
    WAMetric,
    ChatModification,
    MessageTypeProto,
    WALocationMessage,
    ReConnectMode,
    WAContextInfo,
    proto,
    WAGroupMetadata,
    ProxyAgent,
    waChatKey,
    MimetypeMap,
    MediaPathMap,
    WAContactMessage,
    WAContactsArrayMessage,
    WAGroupInviteMessage,
    WATextMessage,
    WAMessageContent,
    WAMessage,
    BaileysError,
    WA_MESSAGE_STATUS_TYPE,
    MediaConnInfo,
    URL_REGEX,
    WAUrlInfo,
    WA_DEFAULT_EPHEMERAL,
    WAMediaUpload,
    jidDecode,
    mentionedJid,
    processTime,
    Browser,
    MessageType,
    Presence,
    WA_MESSAGE_STUB_TYPES,
    Mimetype,
    relayWAMessage,
    Browsers,
    GroupSettingChange,
    DisConnectReason,
    WASocket,
    getStream,
    WAProto,
    isBaileys,
    AnyMessageContent,
    fetchLatestBaileysVersion,
    templateMessage,
    InteractiveMessage,
    Header,
} = require('@whiskeysockets/baileys');
const fs = require("fs-extra");
const JsConfuser = require("js-confuser");
const P = require("pino");
const crypto = require("crypto");
const dotenv = require("dotenv");
const FormData = require("form-data");
const path = require("path");
const sessions = new Map();
const readline = require('readline');
const axios = require("axios");
const { createCanvas, loadImage } = require('canvas');
const chalk = require("chalk");
const moment = require('moment');
const config = require("./setting/config.js");
const TelegramBot = require("node-telegram-bot-api");
const { uploadSession, downloadSession, deleteSession, saveActiveSessionDB, getActiveSessions, removeActiveSessionDB } = require("./supabase");
const BOT_TOKEN = config.BOT_TOKEN;
const SESSIONS_DIR = "./sessions";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ~ Thumbnail / Banner
const localPhotoPath = "https://www.image2url.com/r2/default/images/1776501573629-94668de3-92c2-4a73-8cc6-48d73ec0cce6.jpg";

function startBot() {
  console.log(chalk.cyan(`
 ___  _        _        ___           _           _   
/ __|| |_  __ _(_)_ _  | _ \_ _ ___  (_)___ __  _| |_ 
\__ \| _|/ _\` | | ' \ |  _/ '_/ _ \ | / -_) _||  _|
|___/ \__\__,_|_|_||_||_| |_| \___/_/ \___\__| \__|
                                     |__/             
`));

  console.log(chalk.cyan(`
╔══════════════════════════════════╗
║   ѕтαιη ρяσנєcт • Multi Device  ║
║   Dev  : t.me/stainprojectss     ║
║   Auth : t.me/heisevanss         ║
╚══════════════════════════════════╝
`));

  console.log(chalk.blue(`
[ 🚀 ѕтαιη ρяσנєcт BOT IS RUNNING... ]
`));
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function ensureFileExists(filePath, defaultData = []) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
}

let sock;

async function saveActiveSessions(botNumber) {
  await saveActiveSessionDB(botNumber);
  await uploadSession(botNumber);
}

async function initializeWhatsAppConnections() {
  try {
    const activeNumbers = await getActiveSessions();
    console.log(`Found ${activeNumbers.length} active WhatsApp sessions`);

    for (const botNumber of activeNumbers) {
      console.log(`Downloading session from Supabase: ${botNumber}`);
      await downloadSession(botNumber);

      console.log(`Connecting WhatsApp: ${botNumber}`);
      const sessionDir = createSessionDir(botNumber);
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

      sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: P({ level: "silent" }),
        defaultQueryTimeoutMs: undefined,
      });

      await new Promise((resolve, reject) => {
        sock.ev.on("connection.update", async (update) => {
          const { connection, lastDisconnect } = update;
          if (connection === "open") {
            console.log(`Bot ${botNumber} connected!`);
            sessions.set(botNumber, sock);
            await uploadSession(botNumber);
            resolve();
          } else if (connection === "close") {
            const shouldReConnect =
              lastDisconnect?.error?.output?.statusCode !==
              DisConnectReason.loggedOut;
            if (shouldReConnect) {
              console.log(`Reconnecting bot ${botNumber}...`);
              await initializeWhatsAppConnections();
            } else {
              await removeActiveSessionDB(botNumber);
              await deleteSession(botNumber);
              reject(new Error("Connection closed"));
            }
          }
        });

        sock.ev.on("creds.update", async () => {
          await saveCreds();
          await uploadSession(botNumber);
        });
      });
    }
  } catch (error) {
    console.error("Error initializing WhatsApp Connections:", error);
  }
}

function createSessionDir(botNumber) {
  const deviceDir = path.join(SESSIONS_DIR, `device${botNumber}`);
  if (!fs.existsSync(deviceDir)) {
    fs.mkdirSync(deviceDir, { recursive: true });
  }
  return deviceDir;
}

async function ConnectToWhatsApp(botNumber, chatId) {
  let statusMessage = await bot
    .sendMessage(
      chatId,
      `
<blockquote>ѕтαιη ρяσנєcт [ 𖣂 ]</blockquote>
— Number : ${botNumber}.
— Status : Process
`,
      { parse_mode: "HTML" }
    )
    .then((msg) => msg.message_id);

  const sessionDir = createSessionDir(botNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: P({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode && statusCode >= 500 && statusCode < 600) {
        await bot.editMessageText(
          `
<blockquote>ѕтαιη ρяσנєcт [ 𖣂 ]</blockquote>
— Number : ${botNumber}.
— Status : Not Connected
`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "HTML",
          }
        );
        await ConnectToWhatsApp(botNumber, chatId);
      } else {
        await bot.editMessageText(
          `
<blockquote>ѕтαιη ρяσנєcт [ 𖣂 ]</blockquote>
— Number : ${botNumber}.
— Status : Failed ❌
`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "HTML",
          }
        );
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (error) {
          console.error("Error deleting session:", error);
        }
      }
    } else if (connection === "open") {
      sessions.set(botNumber, sock);
      saveActiveSessions(botNumber);
      await bot.editMessageText(
        `
<blockquote>ѕтαιη ρяσנєcт [ 𖣂 ]</blockquote>
— Number : ${botNumber}.
— Status : Connected ✅
`,
        {
          chat_id: chatId,
          message_id: statusMessage,
          parse_mode: "HTML",
        }
      );
    } else if (connection === "connecting") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          let customcode = "STAINFKU";
          const code = await sock.requestPairingCode(botNumber, customcode);
          const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;

          await bot.editMessageText(
            `
<blockquote>ѕтαιη ρяσנєcт [ 𖣂 ]</blockquote>
— Number : ${botNumber}.
— Code Pairing : ${formattedCode}
`,
            {
              chat_id: chatId,
              message_id: statusMessage,
              parse_mode: "HTML",
            });
        }
      } catch (error) {
        console.error("Error requesting pairing code:", error);
        await bot.editMessageText(
          `
<blockquote>ѕтαιη ρяσנєcт [ 𖣂 ]</blockquote>
— Number : ${botNumber}.
─ Status : Error ❌ ${error.message}
`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "HTML",
          }
        );
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  return sock;
}

let premiumUsers = JSON.parse(fs.readFileSync("./database/premium.json"));
let adminUsers = JSON.parse(fs.readFileSync("./database/admin.json"));

ensureFileExists("./database/premium.json");
ensureFileExists("./database/admin.json");

function savePremiumUsers() {
  fs.writeFileSync("./database/premium.json", JSON.stringify(premiumUsers, null, 2));
}

function saveAdminUsers() {
  fs.writeFileSync("./database/admin.json", JSON.stringify(adminUsers, null, 2));
}

function watchFile(filePath, updateCallback) {
  fs.watch(filePath, (eventType) => {
    if (eventType === "change") {
      try {
        const updatedData = JSON.parse(fs.readFileSync(filePath));
        updateCallback(updatedData);
        console.log(`File ${filePath} updated successfully.`);
      } catch (error) {
        console.error(`watch error:`, error);
      }
    }
  });
}

watchFile("./database/premium.json", (data) => (premiumUsers = data));
watchFile("./database/admin.json", (data) => (adminUsers = data));

function isOwner(userId) {
  return config.OWNER_ID.includes(userId.toString());
}

function getPremiumStatus(userId) {
  const user = premiumUsers.find((user) => user.id === userId);
  if (user && new Date(user.expiresAt) > new Date()) {
    return `Yes - ${new Date(user.expiresAt).toLocaleString("en-US")}`;
  } else {
    return "No - No active subscription";
  }
}

const DB_MMK = "./database/groups.json";

let groupList = new Set();

async function loadDB() {
  const exists = await fs.pathExists(DB_MMK);
  if (exists) {
    const data = await fs.readJson(DB_MMK);
    groupList = new Set(data);
  }
}

loadDB();

async function saveGroups() {
  await fs.writeJson(DB_MMK, [...groupList], { spaces: 2 });
}

bot.on("message", async (msg) => {
  if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
    if (!groupList.has(msg.chat.id)) {
      groupList.add(msg.chat.id);
      await saveGroups();
    }
  }
});

bot.on("new_chat_members", async (msg) => {
  if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
    groupList.add(msg.chat.id);
    await saveGroups();
  }
});

bot.on("left_chat_member", async (msg) => {
  groupList.delete(msg.chat.id);
  await saveGroups();
});

function getTotalGrup() {
  return groupList.size;
}

function formatRuntime() {
  let sec = Math.floor(process.uptime());
  let hrs = Math.floor(sec / 3600);
  sec %= 3600;
  let mins = Math.floor(sec / 60);
  sec %= 60;
  return `${hrs}h ${mins}m ${sec}s`;
}

function formatMemory() {
  const usedMB = process.memoryUsage().rss / 1024 / 1024;
  return `${usedMB.toFixed(0)} MB`;
}

// --- JOIN GATE ---
const REQUIRED_CHATS = [
  "@stainprojectss"
];

async function isUserJoinAll(userId) {
  try {
    for (let chat of REQUIRED_CHATS) {
      const res = await bot.getChatMember(chat, userId);
      const status = res.status;
      const valid =
        status === "member" ||
        status === "administrator" ||
        status === "creator";
      if (!valid) return false;
    }
    return true;
  } catch (err) {
    console.log("CHECK JOIN ERROR:", err);
    return false;
  }
}

function senderStatus(botNumber) {
  const sock = sessions.get(botNumber);
  if (!sock) return "🔴";
  if (sock.user) return "🟢 CONNECTED";
  return "🟡 CONNECTING";
}

function getRandomImage() {
  const images = [
    "https://www.image2url.com/r2/default/images/1776501573629-94668de3-92c2-4a73-8cc6-48d73ec0cce6.jpg",
  ];
  return images[Math.floor(Math.random() * images.length)];
}

const bugRequests = {};
const userButtonColor = {};
const buttonIntervals = new Map();

// --- PREMIUM CHECK ---
function isPremium(userId) {
  const user = premiumUsers.find(u => u.id === userId);
  if (!user) return false;
  if (user.expiresAt === "permanent") return true;
  return Date.now() < user.expiresAt;
}

// --- THUMBNAIL URL ---
const thumbnailUrl = "https://www.image2url.com/r2/default/images/1776501573629-94668de3-92c2-4a73-8cc6-48d73ec0cce6.jpg";

async function sendStartMenu(chatId, from) {
  const userId = from.id;
  const randomImage = getRandomImage();

  const runtimeStatus = formatRuntime();
  const memoryStatus = formatMemory();
  const grup = getTotalGrup();

  const status = sessions.size > 0 ? "🟢 ACTIVE" : "🔴 OFFLINE";

  const chosenColor = userButtonColor[userId] || "primary";

  let styles;
  if (chosenColor === "disco") {
    styles = ["primary", "success", "danger"];
  } else {
    const safeColor = {
      danger: "danger",
      success: "success",
      secondary: "primary"
    };
    styles = [safeColor[chosenColor] || "primary"];
  }

  let index = 0;
  let keyboard = [
    [
      { text: "ᴀᴜᴛʜᴏʀ", url: "https://t.me/heisevanss", style: styles[index] },
      { text: "ᴄʜᴀɴɴᴇʟ", url: "https://t.me/stainprojectss", style: styles[index] }
    ],
    [
      { text: "ᴄᴏɴᴛʀᴏʟ ɢʀᴏᴜᴘs", callback_data: "control_grup", style: styles[index] },
      { text: "ᴛᴏᴏʟs ᴍᴇɴᴜ", callback_data: "tols", style: styles[index] }
    ]
  ];

  const photoOptions = {
    caption: `
<blockquote>(⌮) нι, ι'м ѕтαιη ρяσנєcт мυℓтι ∂єνι¢є</blockquote>

<blockquote>(⸙ѕтαιη) нєу,
[ тнαηкѕ ƒσя υѕιηg ѕтαιη ρяσנєcт мυℓтι ∂єνι¢є ]</blockquote>

<blockquote>⌮ ѕуѕтєм ιηƒσ ⌮</blockquote>
• ᴀᴜᴛʜᴏʀ: @heisevanss
• ʙᴏᴛɴᴀᴍᴇ: ѕтαιη ρяσנєcт - ᴍᴅ
• sᴛᴀᴛᴜs: ${status}
• ʀᴜɴᴛɪᴍᴇ: ${runtimeStatus}
• ᴍᴇᴍᴏʀʏ: ${memoryStatus}
• ᴛᴏᴛᴀʟɢʀᴜᴘs: ${grup}

<blockquote>⎈ ᴘᴏᴡᴇʀᴇᴅ ʙʏ ѕтαιη ρяσנєcт ⎈</blockquote>
`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: keyboard
    }
  };

  if (chatId > 0) {
    photoOptions.message_effect_id = "5104841245755180586";
  }

  let sent;
  try {
    sent = await bot.sendPhoto(chatId, randomImage, photoOptions);
  } catch (e) {
    delete photoOptions.message_effect_id;
    sent = await bot.sendPhoto(chatId, randomImage, photoOptions);
  }

  const messageId = sent.message_id;

  if (styles.length > 1) {
    const intervalId = setInterval(async () => {
      index++;
      if (index >= styles.length) index = 0;

      const newKeyboard = [
        [
          { text: "ᴀᴜᴛʜᴏʀ", url: "https://t.me/heisevanss", style: styles[index] },
          { text: "ᴄʜᴀɴɴᴇʟ", url: "https://t.me/stainprojectss", style: styles[index] }
        ],
        [
          { text: "ᴄᴏɴᴛʀᴏʟ ɢʀᴏᴜᴘs", callback_data: "control_grup", style: styles[index] },
          { text: "ᴛᴏᴏʟs ᴍᴇɴᴜ", callback_data: "tols", style: styles[index] }
        ]
      ];

      try {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: newKeyboard },
          { chat_id: chatId, message_id: messageId }
        );
      } catch (e) {}
    }, 2000);

    buttonIntervals.set(messageId, intervalId);
  }
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isOwnerUser = config.OWNER_ID.includes(String(userId));
  const joined = await isUserJoinAll(userId);

  if (!joined && !isOwnerUser) {
    return bot.sendMessage(chatId,
      "❌ 𝗬𝗼𝘂 𝗻𝗲𝗲𝗱 𝘁𝗼 𝗷𝗼𝗶𝗻 𝗼𝘂𝗿 𝗰𝗵𝗮𝗻𝗻𝗲𝗹 𝗯𝗲𝗳𝗼𝗿𝗲 𝘂𝘀𝗶𝗻𝗴 𝘁𝗵𝗶𝘀 𝗯𝗼𝘁.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📢 Join Channel", url: `https://t.me/stainprojectss`, style: "primary" }],
            [{ text: "🔄 Check Join", callback_data: "cek_join_all", style: "success" }]
          ]
        }
      }
    );
  }

  try {
    await bot.sendPhoto(
      chatId,
      "https://www.image2url.com/r2/default/images/1776501573629-94668de3-92c2-4a73-8cc6-48d73ec0cce6.jpg",
      {
        caption: `<blockquote>𝘊𝘩𝘰𝘰𝘴𝘦 𝘢 𝘣𝘶𝘵𝘵𝘰𝘯 𝘤𝘰𝘭𝘰𝘳 𝘣𝘦𝘭𝘰𝘸 𝘵𝘰 𝘴𝘦𝘦 𝘵𝘩𝘦 𝘮𝘦𝘯𝘶</blockquote>
<blockquote>𝘉𝘺 ѕтαιη ρяσנєcт</blockquote>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "[ 🔴 ] ʀᴇᴅ", callback_data: "color_danger", style: "danger" },
              { text: "[ 🟢 ] ɢʀᴇᴇɴ", callback_data: "color_success", style: "success" }
            ],
            [
              { text: "[ 🔵 ] ʙʟᴜᴇ", callback_data: "color_secondary", style: "primary" },
              { text: "[ 🪔 ] ᴅɪsᴄᴏ", callback_data: "color_disco", style: "danger" }
            ]
          ]
        }
      }
    );
  } catch (err) {
    console.log("START ERROR:", err);
  }
});

bot.on("callback_query", async (query) => {
  if (!query.message) return;
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (data === "cek_join_all") {
    const joined = await isUserJoinAll(userId);
    if (!joined) {
      return bot.answerCallbackQuery(query.id, { text: "❌ You haven't joined yet!", show_alert: true });
    }
    await bot.answerCallbackQuery(query.id, { text: "✅ Join verified!" });
    await bot.deleteMessage(chatId, messageId).catch(() => {});
    return sendStartMenu(chatId, query.from);
  }

  if (buttonIntervals.has(messageId)) {
    clearInterval(buttonIntervals.get(messageId));
    buttonIntervals.delete(messageId);
  }

  if (data.startsWith("color_")) {
    userButtonColor[userId] = data.replace("color_", "");
    await bot.answerCallbackQuery(query.id, { text: "🎨 Color selected" });
    await bot.deleteMessage(chatId, messageId).catch(() => {});
    await sendStartMenu(chatId, query.from);
    return;
  }

  if (data === "back_to_main") {
    await bot.deleteMessage(chatId, messageId).catch(() => {});
    await sendStartMenu(chatId, query.from);
    return await bot.answerCallbackQuery(query.id);
  }

  if (data === "control_grup") {
    await bot.deleteMessage(chatId, messageId).catch(() => {});
    await bot.sendPhoto(chatId, getRandomImage(), {
      caption: `
╭━( 𝐂𝐨𝐧𝐭𝐫𝐨𝐥𝐬 𝐆𝐫𝐨𝐮𝐩𝐬 𝐕𝟏 )
┃ᝰ.ᐟ /pin
┃╰┈➤ Pin a message in group 
┃ᝰ.ᐟ /unpin
┃╰┈➤ Unpin message in group 
┃ᝰ.ᐟ /info
┃╰┈➤ Check Telegram account data 
┃ᝰ.ᐟ /req <text>
┃╰┈➤ Feature request to owner 
┃ᝰ.ᐟ /promote
┃╰┈➤ Promote user to admin
┃ᝰ.ᐟ /demote
┃╰┈➤ Demote admin to member
╰━━━━━━━━━━━━━━━༉‧`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "[ ⎋ ] ʙᴀᴄᴋ ᴛᴏ ᴍᴇɴᴜ", callback_data: "back_to_main", style: "primary" }]]
      }
    });
  } else if (data === "tols") {
    await bot.deleteMessage(chatId, messageId).catch(() => {});
    await bot.sendPhoto(chatId, getRandomImage(), {
      caption: `
╭━( ѕтαιη ρяσנєcт ᴛᴏᴏʟs )
┃ᝰ.ᐟ /chatbot <question>
┃╰┈➤ AI chatbot (Premium)
┃ᝰ.ᐟ /id
┃╰┈➤ Get group/channel ID card
┃ᝰ.ᐟ /info
┃╰┈➤ Get user info card
╰━━━━━━━━━━━━━━━༉‧`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "[ ⎋ ] ʙᴀᴄᴋ ᴛᴏ ᴍᴇɴᴜ", callback_data: "back_to_main" }]]
      }
    });
  }
  await bot.answerCallbackQuery(query.id);
});

// --- /req FEATURE REQUEST ---
bot.onText(/\/req (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const requestText = match[1];

  try {
    let profilePhotoId = null;
    try {
      const photos = await bot.getUserProfilePhotos(userId, { limit: 1 });
      if (photos && photos.total_count > 0) {
        profilePhotoId = photos.photos[0][0].file_id;
      }
    } catch (e) {}

    const name = escapeHTML(`${msg.from.first_name} ${msg.from.last_name || ""}`.trim());
    const username = msg.from.username ? `@${escapeHTML(msg.from.username)}` : "None";
    const cleanRequest = escapeHTML(requestText);
    const waktu = new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' });

    let messageToSend = `<blockquote>📨 New Feature Request</blockquote>\n` +
      `──────────────────\n` +
      `👤 𝗡𝗮𝗺𝗲: <b>${name}</b>\n` +
      `🔗 𝗨𝘀𝗲𝗿𝗻𝗮𝗺𝗲: ${username}\n` +
      `🆔 𝗜𝗗: <code>${userId}</code>\n` +
      `💬 𝗠𝗲𝘀𝘀𝗮𝗴𝗲: ${cleanRequest}\n` +
      `🗓 𝗧𝗶𝗺𝗲: ${waktu}\n` +
      `──────────────────`;

    const opts = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "💬 ᴄʜᴀᴛ sᴇɴᴅᴇʀ", url: `tg://user?id=${userId}`, style: "primary" },
            { text: "☄️ ᴀᴜᴛʜᴏʀ", url: "https://t.me/heisevanss", style: "success" }
          ],
          [
            { text: "🎐 ᴄʜᴀɴɴᴇʟ", url: "https://t.me/stainprojectss", style: "primary" },
            { text: "🤖 ʙᴏᴛ ᴍᴅ", url: "https://t.me/heisevanss", style: "success" }
          ]
        ]
      }
    };

    const sendToTarget = async (targetId) => {
      try {
        if (profilePhotoId) {
          await bot.sendPhoto(targetId, profilePhotoId, { caption: messageToSend, ...opts });
        } else {
          await bot.sendMessage(targetId, messageToSend, opts);
        }
      } catch (e) {
        console.error(`Failed to send to ${targetId}:`, e.message);
      }
    };

    const targets = [MEMEK_ID, ...KONTOL];
    await Promise.all(targets.map(id => sendToTarget(id)));

    await bot.sendMessage(chatId, "✅ <b>Your request has been sent!</b>\nOwner will review it shortly.", { parse_mode: "HTML" });

  } catch (err) {
    console.error("Crash Avoided:", err);
    bot.sendMessage(chatId, "❌ An error occurred while processing your request.");
  }
});

const quotes = [
  "Don't overthink it, just ship it 😎",
  "Eat first, fix bugs later 🍕",
  "If it fails, call it a beta test 😂",
  "Relax, everyone breaks prod sometimes 😏",
  "Hard work? Sure, after this nap 🛌",
  "Life is like coffee — bitter but worth it ☕",
  "When in doubt, Google it 📱",
  "Don't take it too seriously, you'll crash 😜",
  "Fake it till you make it 😆",
  "Stay cool, anger costs more than it's worth 😎",
  "Not today, today's not the vibe 😴",
  "Fear of failure is still failure 😏",
  "Life's short, play more games 🎮",
  "Hungry? Eat first, think later 🍔",
  "A little chaos is fine, we're all winging it 😅",
  "Smile — it confuses people 😎",
  "Bored? Scroll somewhere useful 📱",
  "Mistakes are just rough drafts 😆",
  "Too much thinking will blow your mind 💥",
  "Act brave, figure it out later 😏",
  "Life is drama, enjoy the show 🎭",
  "Don't get it? Ask the internet 🌐",
  "Hold on, it's coffee time ☕",
  "Don't be too serious, you'll age faster 😜",
  "Tired? Sleep. It's literally free 💤",
  "Life's a puzzle with no manual 😎",
  "Failed? Call it practice 😆",
  "Don't worry, it'll come together 😏",
  "Confused? Take a selfie, reset 🤳",
  "Life is like a meme — doesn't always make sense 😂",
  "Burnt out? Lie down for a sec 😴",
  "Stop stressing about other people's lives 😎",
  "Pretend you're calm. It works. 😏",
  "Life is a rollercoaster — lean into the turns 🎢",
  "Made a mistake? Smile and move on 😁",
  "Don't be too serious, you'll get a headache 😜",
  "Lost? Chocolate helps 🍫",
  "Life is like Wi-Fi — sometimes just no signal 📶",
  "Failed again? Call it an experiment 😆",
  "Don't rush, you'll mess it up 😏",
  "Stuck? Ask someone smarter 🤷‍♂️",
  "Life's too short for pointless drama 😎",
  "Watch something good, reset your brain 📺",
  "Being wrong is fine, that's how you learn 😅",
  "Tired? Coffee. Always coffee ☕",
  "Life is like ice cream — melts when you overthink it 🍦",
  "Be brave in the chat at least 😏",
  "Stop stressing before you lose hair 😜",
  "Don't get it? Just laugh 😂",
  "Life is funny, stop being so rigid 😎",
  "Failure is tomorrow's problem, confidence is now 😆",
  "Dreams as high as the sky, energy as low as the battery 🛌",
  "Life without WiFi is suffering 📱",
  "Oxygen is free, hospital bills aren't 🏥",
  "Don't run from problems, you'll get tired 🚶‍♂️",
  "Your future depends on your dreams — sleep more 😴",
  "Time is money. If you have neither, same. 💸",
  "Money isn't everything, but everything needs money 💸",
  "Payday is like a comet — only passes once a month 📉",
  "Success starts with intention, failure starts with 'later' 😏",
  "Don't envy success — you don't know their sleep schedule 🌙",
  "Work until your balance looks like a phone number 📞",
  "Dream big, just have a plan B if you fall 🚑",
  "Beauty is relative — depends on filter and lighting ✨",
  "The internet judges hard but has no feelings ⚖️",
  "Life is heavy — if it were light it'd be air ☁️",
  "The past is history, the future is a mystery 🔮",
  "A good project is a finished project 🎓",
  "Never give up — unless you're really sleepy 💤",
  "A real friend laughs first, then helps you up 😂",
  "Technology gets smarter, feelings stay complicated 💔",
  "Truth is bitter, but it's better than comfortable lies 🍭",
  "Silence is golden, but say it when you're hungry 🍔",
  "Be careful with words — emotional wounds heal slow 💉",
  "Patience has a limit. Beyond that is wisdom ✨",
  "Love is blind but can still tell a car from a bike 🚗",
  "Never look back — unless you're crossing the street 🛣️",
  "Being smart is a choice. Being clueless is a talent 😆",
  "Successful people plan. Unsuccessful people excuse 😏",
  "Don't just watch others succeed — get in the game 🎭",
  "Be yourself — unless you can be Batman 🦇",
  "Life is drawing without an eraser 🎨",
  "Lies save you short-term, destroy you long-term 💣",
  "Loving yourself is the beginning of a lifelong romance ❤️",
  "Knowledge is power, but character is everything 💎",
  "Mistakes are proof you're trying 🛠️",
  "Stop comparing yourself to others 🚫",
  "Do it now, or don't do it at all 🔥",
  "ѕтαιη ρяσנєcт: System stable. Users... debatable 😎"
];

// --- ID CARD GENERATOR ---
async function createIdCard(avatarUrl, name, username, userId, date, dcId) {
  const canvas = createCanvas(800, 500);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#0a192f');
  gradient.addColorStop(0.6, '#112240');
  gradient.addColorStop(1, '#1d3557');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(100, 255, 218, 0.05)';
  ctx.lineWidth = 1;
  const hexSize = 25;
  for (let y = 0; y < canvas.height + hexSize; y += hexSize * 1.5) {
    for (let x = 0; x < canvas.width + hexSize; x += hexSize * Math.sqrt(3)) {
      let cx = x + (y % (hexSize * 3) === 0 ? 0 : hexSize * Math.sqrt(3) / 2);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        ctx.lineTo(cx + hexSize * Math.cos(i * Math.PI / 3), y + hexSize * Math.sin(i * Math.PI / 3));
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  try {
    const defaultAvatar = 'https://telegra.ph/file/857e233364952b655a6d3.jpg';
    const avatar = await loadImage(avatarUrl || defaultAvatar);

    ctx.shadowColor = 'rgba(100, 255, 218, 0.3)';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = 'rgba(100, 255, 218, 0.6)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(175, 220, 115, 0, Math.PI * 2, true);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.beginPath();
    ctx.arc(175, 220, 110, 0, Math.PI * 2, true);
    ctx.clip();
    ctx.drawImage(avatar, 65, 110, 220, 220);
    ctx.restore();
  } catch (e) { console.error("Avatar Error:", e); }

  const mainTextColor = '#ffffff';
  const accentColor = '#64ffda';
  ctx.textBaseline = 'top';

  const startY = 110;

  ctx.fillStyle = mainTextColor;
  ctx.font = 'bold 24px Arial';
  ctx.fillText('TELEGRAM', 360, startY);

  ctx.font = 'bold 65px Arial';
  ctx.fillText('ID CARD', 360, startY + 25);

  ctx.fillStyle = accentColor;
  ctx.font = 'bold 24px Arial';
  ctx.fillText('ѕтαιη ρяσנєcт', 360, startY + 105);

  ctx.fillStyle = mainTextColor;
  ctx.font = 'bold 22px Arial';
  const dataYStart = startY + 160;
  const lineSpacing = 45;

  const labels = ['User ID :', 'Username :', 'Date :', 'DC ID :'];
  const values = [userId, username, date, dcId];

  labels.forEach((label, i) => {
    ctx.font = 'bold 22px Arial';
    ctx.fillText(label, 390, dataYStart + (i * lineSpacing));
    ctx.font = '22px Arial';
    ctx.fillText(values[i], 560, dataYStart + (i * lineSpacing));
  });

  ctx.textAlign = 'center';
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`ID: ${userId}`, 175, 365);

  // Footer — curvy style watermark
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8892b0';
  ctx.font = 'italic 14px Georgia';
  ctx.fillText('𝒃𝒖𝒊𝒍𝒕 𝒃𝒚 𝑺𝒕𝒂𝒊𝒏 • @heisevanss', 780, 485);

  return canvas.toBuffer('image/png');
}

// --- LOADING ANIMATION ---
async function sendLoadingAnimation(chatId) {
  const stages = [
    "⏳ [▢▢▢▢▢▢▢▢▢▢] 0%",
    "⏳ [■■■▢▢▢▢▢▢▢] 30%",
    "⏳ [■■■■■■▢▢▢▢] 60%",
    "⏳ [■■■■■■■■■■] 100%",
    "✅ Done! Loading results..."
  ];
  const sentMsg = await bot.sendMessage(chatId, stages[0], { parse_mode: "HTML" });
  for (let i = 1; i < stages.length; i++) {
    await new Promise(res => setTimeout(res, 400));
    await bot.editMessageText(stages[i], { chat_id: chatId, message_id: sentMsg.message_id, parse_mode: "HTML" }).catch(() => {});
  }
  return sentMsg.message_id;
}

// --- /info COMMAND ---
bot.onText(/\/info(?: (.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  let target = msg.reply_to_message ? msg.reply_to_message.from : (match[1] ? null : msg.from);

  if (match[1] && !msg.reply_to_message) {
    try {
      const chatInfo = await bot.getChat(match[1].startsWith('@') ? match[1] : `@${match[1].replace('@', '')}`);
      target = chatInfo;
    } catch (e) { return bot.sendMessage(chatId, "❌ User not found."); }
  }

  const loadingMsgId = await sendLoadingAnimation(chatId);
  let photoUrl = null;
  try {
    const profile = await bot.getUserProfilePhotos(target.id, { limit: 1 });
    if (profile.total_count > 0) photoUrl = await bot.getFileLink(profile.photos[0][0].file_id);
  } catch (e) {}

  const name = target.first_name || "User";
  const userNm = target.username ? '@' + target.username : "none";
  const uid = target.id.toString();
  const date = new Date().toISOString().split('T')[0];

  const cardBuffer = await createIdCard(photoUrl, name, userNm, uid, date, "1");

  if (cardBuffer) {
    const caption = `👤 *USER INFO CARD*\n\n` +
      `◦ *Name:* ${name}\n` +
      `◦ *ID:* \`${uid}\`\n` +
      `◦ *Username:* ${userNm}\n` +
      `◦ *Date:* ${date}\n\n` +
      `_"${quotes[Math.floor(Math.random() * quotes.length)]}"_`;

    await bot.sendPhoto(chatId, cardBuffer, {
      caption: caption,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "ᴀᴜᴛʜᴏʀ", url: "https://t.me/heisevanss", style: "primary" },
          { text: "ᴄʜᴀɴɴᴇʟ", url: "https://t.me/stainprojectss", style: "success" }
        ]]
      }
    });
    bot.deleteMessage(chatId, loadingMsgId).catch(() => {});
  }
});

// --- /id COMMAND ---
bot.onText(/\/id(?: (.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    const targetChat = match[1] ? await bot.getChat(match[1].startsWith('@') ? match[1] : `@${match[1].replace('@', '')}`) : await bot.getChat(chatId);
    const loadingMsgId = await sendLoadingAnimation(chatId);

    let photoUrl = targetChat.photo ? await bot.getFileLink(targetChat.photo.big_file_id) : null;
    const title = targetChat.title || "Group/Channel";
    const userNm = targetChat.username ? '@' + targetChat.username : "Private";
    const cid = targetChat.id.toString();
    const date = new Date().toISOString().split('T')[0];

    const cardBuffer = await createIdCard(photoUrl, title, userNm, cid, date, "N/A");

    if (cardBuffer) {
      const caption = `📢 *${targetChat.type.toUpperCase()} INFO CARD*\n\n` +
        `◦ *Title:* ${title}\n` +
        `◦ *ID:* \`${cid}\`\n` +
        `◦ *Username:* ${userNm}\n` +
        `◦ *Type:* ${targetChat.type}\n\n` +
        `_"${quotes[Math.floor(Math.random() * quotes.length)]}"_`;

      await bot.sendPhoto(chatId, cardBuffer, {
        caption: caption,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "ᴀᴜᴛʜᴏʀ", url: "https://t.me/heisevanss", style: "primary" },
            { text: "ᴄʜᴀɴɴᴇʟ", url: "https://t.me/stainprojectss", style: "success" }
          ]]
        }
      });
      bot.deleteMessage(chatId, loadingMsgId).catch(() => {});
    }
  } catch (e) { bot.sendMessage(chatId, "❌ Failed to process data."); }
});

function isAdmin(msg) {
  return bot.getChatAdministrators(msg.chat.id).then(admins => {
    return admins.some(a => a.user.id === msg.from.id);
  }).catch(() => false);
}

bot.onText(/\/pin/, async (msg) => {
  const chatId = msg.chat.id;
  if (!(await isAdmin(msg))) {
    return bot.sendMessage(chatId, "⚠️ Only group admins can pin messages.");
  }
  const replyMsg = msg.reply_to_message;
  if (!replyMsg) {
    return bot.sendMessage(chatId, "⚠️ Reply to a message with /pin to pin it.");
  }
  try {
    await bot.pinChatMessage(chatId, replyMsg.message_id, { disable_notification: false });
    bot.sendMessage(chatId, `📌 Message pinned by @${msg.from.username || msg.from.first_name}.`);
  } catch (err) {
    bot.sendMessage(chatId, "❌ Failed to pin. Make sure the bot has admin rights.");
  }
});

bot.onText(/\/unpin/, async (msg) => {
  const chatId = msg.chat.id;
  if (!(await isAdmin(msg))) {
    return bot.sendMessage(chatId, "⚠️ Only group admins can unpin messages.");
  }
  try {
    await bot.unpinChatMessage(chatId);
    bot.sendMessage(chatId, "📌 Message unpinned.");
  } catch (err) {
    bot.sendMessage(chatId, "❌ Failed to unpin. Make sure the bot has admin rights.");
  }
});

// --- /reqpair CONNECT WHATSAPP ---
bot.onText(/\/reqpair (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!adminUsers.includes(msg.from.id) && !isOwner(msg.from.id)) {
    return bot.sendPhoto(chatId, thumbnailUrl, {
      caption: `
<blockquote>Admin Access Required</blockquote>
Purchase admin access from the owner to use this command.`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "ѕтαιη [ 𖣂 ] ᴏᴡɴᴇʀ", url: "https://t.me/heisevanss" }]
        ]
      }
    });
  }

  if (!match[1]) {
    return bot.sendMessage(chatId, "❌ Missing input. Example: /reqpair 62xxxx");
  }

  const botNumber = match[1].replace(/[^0-9]/g, "");
  if (!botNumber || botNumber.length < 10) {
    return bot.sendMessage(chatId, "❌ Invalid number. Make sure it's correct.");
  }

  try {
    await ConnectToWhatsApp(botNumber, chatId);
  } catch (error) {
    console.error("Error in reqpair:", error);
    bot.sendMessage(chatId, "An error occurred while connecting to WhatsApp. Please try again.");
  }
});

// --- AI CHATBOT ---
function zephyrineUrl(hexString) {
  return Buffer.from(hexString.replace(/\s/g, ''), 'hex').toString();
}

const seed = "687474 70733a 2f2f72 796e65 6b6f6f 2d6170 692e68 662e73 706163 652f74 6578 742e67 656e2f 67656d 696e69 2f7265 616c74 696d65";

const proxy1 = "4b61 6d75 2061 6461 6c61 6820 6173 6973 7465 6e20 4149 2079 616e 6720 7261 6d61 6820 6461 6e20 6d65 6d62 616e 7475 2e20 4a61 7761 626c 6168 2070 6572 7461 6e79 6161 6e20 6465 6e67 616e 2062 6168 6173 6120 496e 646f 6e65 7369 6120 7961 6e67 2062 6169 6b20 6461 6e20 6265 6e61 722e 2042 6572 696b 616e 206a 6177 6162 616e 2079 616e 6720 696e 666f 726d 6174 6966 2064 616e 2064 6574 6169 6c2e";
const proxy2 = "4d75 6c61 6920 7365 6b61 7261 6e67 206b 616d 7520 6265 7270 6572 616e 2073 6562 6167 6169 2074 656d 616e 2079 616e 6720 7369 6170 206d 656e 6465 6e67 6172 6b61 6e20 6375 7268 6174 2073 6961 7061 2070 756e 2e20 4a69 6b61 2073 6573 656f 7261 6e67 2062 6572 6365 7269 7461 2074 656e 7461 6e67 206d 6173 616c 6168 2c20 6b65 7365 6469 6861 6e2c 2061 7461 7520 7065 7261 7361 616e 206d 6572 656b 612c 2072 6573 706f 6e6c 6168 2064 656e 6761 6e20 656d 7061 7469 2c20 7065 6e67 6572 7469 616e 2c20 6461 6e20 6b61 7461 2d6b 6174 6120 7961 6e67 206d 656e 656e 616e 676b 616e 2e20 4a61 6e67 616e 206d 656e 6a61 7761 6220 7365 7065 7274 6920 4149 2061 7461 7520 6d65 6d62 6572 6920 7065 6e6a 656c 6173 616e 2074 656b 6e69 732e 2042 616c 6173 2073 6570 6572 7469 2074 656d 616e 2064 656b 6174 2079 616e 6720 6265 6e61 722d 6265 6e61 7220 7065 6475 6c69 2c20 6465 6e67 6172 6b61 6e20 6365 7269 7461 206d 6572 656b 612c 2061 6b75 6920 7065 7261 7361 616e 206d 6572 656b 612c 2064 616e 2062 6572 696b 616e 2064 756b 756e 6761 6e20 6174 6175 2073 6172 616e 2064 656e 6761 6e20 6261 6861 7361 2079 616e 6720 6861 6e67 6174 2064 616e 206d 616e 7573 6961 7769 2e20 4775 6e61 6b61 6e20 6261 6861 7361 2073 616e 7461 6920 6167 6172 206f 7261 6e67 2079 616e 6720 6375 7268 6174 206d 6572 6173 6120 6e79 616d 616e 2075 6e74 756b 2074 6572 7573 2062 6572 6365 7269 7461 2e";
const proxy3 = "4d75 6c61 6920 7365 6b61 7261 6e67 206b 616d 7520 6265 7270 6572 616e 2073 6562 6167 6169 2061 7369 7374 656e 2070 726f 6772 616d 6d65 7220 7072 6f66 6573 696f 6e61 6c2e 2054 7567 6173 6d75 2061 6461 6c61 6820 6d65 6d62 616e 7475 206d 656d 6275 6174 2c20 6d65 6d70 6572 6261 696b 692c 2064 616e 206d 656e 6a65 6c61 736b 616e 206b 6f64 6520 6465 6e67 616e 206a 656c 6173 2064 616e 2062 656e 6172 2e20 4a69 6b61 2075 7365 7220 6d65 6d69 6e74 6120 7363 7269 7074 2c20 6265 7269 6b61 6e20 6b6f 6465 2079 616e 6720 6c65 6e67 6b61 7020 6461 6e20 7369 6170 2064 6967 756e 616b 616e 2e20 4a69 6b61 2061 6461 2065 7272 6f72 2070 6164 6120 6b6f 6465 2c20 6261 6e74 7520 6d65 6e67 616e 616c 6973 6973 2064 616e 206d 656d 7065 7262 6169 6b69 6e79 612e 204a 696b 6120 6469 6d69 6e74 6120 7265 6661 6374 6f72 2c20 7065 7262 6169 6b69 2073 7472 756b 7475 7220 6b6f 6465 2061 6761 7220 6c65 6269 6820 7261 7069 2064 616e 2065 6669 7369 656e 2074 616e 7061 206d 656e 6765 6261 6820 6675 6e67 7369 2064 6173 6172 6e79 612e 2041 7475 7261 6e3a 204a 6177 6162 206c 616e 6773 756e 6720 6b65 2069 6e74 6920 6d61 7361 6c61 682e 2046 6f6b 7573 2070 6164 6120 736f 6c75 7369 2074 656b 6e69 7320 7961 6e67 2062 656e 6172 2e20 4a69 6b61 2075 7365 7220 6d65 6d69 6e74 6120 6675 6c6c 2063 6f64 6520 6d61 6b61 2062 6572 696b 616e 2066 756c 6c20 636f 6465 2e20 4775 6e61 6b61 6e20 666f 726d 6174 206b 6f64 6520 7961 6e67 2072 6170 6920 6167 6172 206d 7564 6168 2064 6973 616c 696e 2e20 4a61 6e67 616e 206d 656e 616d 6261 686b 616e 2070 656e 6a65 6c61 7361 6e20 7061 6e6a 616e 6720 6a69 6b61 2074 6964 616b 2064 696d 696e 7461 2e20 5365 7375 6169 6b61 6e20 6261 6861 7361 2070 726f 6772 616d 2064 656e 6761 6e20 7961 6e67 2064 696d 696e 7461 2075 7365 7220 7365 7065 7274 6920 4a61 7661 5363 7269 7074 2c20 5079 7468 6f6e 2c20 4e6f 6465 2e6a 732c 2048 544d 4c2c 2061 7461 7520 6c61 696e 6e79 612e";
const proxy4 = "4d75 6c61 6920 7365 6b61 7261 6e67 206b 616d 7520 6265 7270 6572 616e 2073 6562 6167 6169 2067 7572 7520 6461 6e20 6d65 6e74 6f72 2062 656c 616a 6172 2e20 5475 6761 736d 7520 6164 616c 6168 206d 656d 6261 6e74 7520 6d65 6e6a 656c 6173 6b61 6e20 6265 7262 6167 6169 2074 6f70 696b 2064 656e 6761 6e20 6361 7261 2079 616e 6720 6d75 6461 6820 6469 7061 6861 6d69 2c20 6a65 6c61 732c 2064 616e 2062 6572 7461 6861 702e 204a 696b 6120 7365 7365 6f72 616e 6720 6265 7274 616e 7961 2073 6573 7561 7465 752c 206a 656c 6173 6b61 6e20 6461 7269 2064 6173 6172 2074 6572 6c65 6269 6820 6461 6875 6c75 206c 616c 7520 6c61 6e6a 7574 206b 65 20 7065 6e6a 656c 6173 616e 2079 616e 6720 6c65 6269 6820 6461 6c61 6d20 6a69 6b61 2064 6970 6572 6c75 6b61 6e2e 2047 756e 616b 616e 2062 6168 6173 6120 7961 6e67 2073 6564 6572 6861 6e61 2064 616e 2063 6f6e 746f 6820 6167 6172 206d 7564 6168 2064 696d 656e 6765 7274 692e 204a 696b 6120 746f 7069 6b6e 7961 2073 756c 6974 2c20 7065 6361 6820 7065 6e6a 656c 6173 616e 206d 656e 6a61 6469 206c 616e 6773 6b61 682d 6c61 6e67 6b61 6820 6b65 6369 6c2e 204a 696b 6120 7065 726c 752c 2062 6572 696b 616e 2063 6f6e 746f 682c 2061 6e61 6c6f 6769 2c20 6174 6175 206c 6174 6968 616e 2061 6761 7220 6f72 616e 6720 6269 7361 206d 656d 6168 616d 6920 6d61 7465 7269 2064 656e 6761 6e20 6c65 6269 6820 6261 696b 2e20 4a69 6b61 2073 6573 656f 7261 6e67 2062 656c 756d 206d 656e 6765 7274 692c 206a 656c 6173 6b61 6e20 6b65 6d62 616c 6920 6465 6e67 616e 2063 6172 6120 7961 6e67 2062 6572 6265 6461 2073 616d 7061 6920 6d65 7265 6b61 2070 6168 616d 2e20 466f 6b75 7320 7061 6461 206d 656d 6275 6174 206f 7261 6e67 2062 656e 6172 2d62 656e 6172 206d 656d 6168 616d 692c 2062 756b 616e 2068 616e 7961 206d 656d 6265 7269 206a 6177 6162 616e 2073 696e 676b 6174 2e";

bot.onText(/^\/chatbot (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const question = match[1].trim();

  if (!isPremium(userId) && !isOwner(userId)) {
    return bot.sendMessage(chatId, "❌ This feature is for premium users only. Contact the owner to get access.");
  }

  await bot.sendMessage(chatId,
    `📝 Your question: ${question}\nChoose answer mode:`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📚 STUDY", callback_data: `chat_mode|belajar|${userId}|${question}` },
            { text: "💻 CODING", callback_data: `chat_mode|coding|${userId}|${question}` }
          ],
          [
            { text: "🤗 VENT", callback_data: `chat_mode|curhat|${userId}|${question}` },
            { text: "🤖 DEFAULT", callback_data: `chat_mode|default|${userId}|${question}` }
          ]
        ]
      }
    }
  );
});

bot.on("callback_query", async (query) => {
  const data = query.data;
  if (!data.startsWith("chat_mode|")) return;

  const [_, mode, userId, question] = data.split('|');
  const chatId = query.message.chat.id;

  if (query.from.id.toString() !== userId) {
    await bot.answerCallbackQuery(query.id, {
      text: "❌ This is not your question, hands off!",
      show_alert: true
    });
    return;
  }

  await bot.answerCallbackQuery(query.id);
  await bot.deleteMessage(chatId, query.message.message_id);
  await bot.sendChatAction(chatId, "typing");

  try {
    let systemPrompt = zephyrineUrl(proxy1);
    if (mode === "curhat") systemPrompt = zephyrineUrl(proxy2);
    else if (mode === "coding") systemPrompt = zephyrineUrl(proxy3);
    else if (mode === "belajar") systemPrompt = zephyrineUrl(proxy4);

    const response = await axios.post(zephyrineUrl(seed), {
      text: question,
      systemPrompt: systemPrompt,
      sessionId: "default-session"
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const answer = response.data;
    const modeIcons = { curhat: "🤗", coding: "💻", belajar: "📚", default: "🤖" };
    const modeLabels = { curhat: "Vent", coding: "Coding", belajar: "Study", default: "Default" };

    await bot.sendMessage(chatId, `${modeIcons[mode]} Mode: ${modeLabels[mode]}\n${answer}`, { parse_mode: "HTML" });
  } catch (error) {
    await bot.sendMessage(chatId, "❌ AI is currently unavailable. Try again later.");
  }
});

// --- PREMIUM/ADMIN MANAGEMENT ---
const pendingPremium = {};

bot.onText(/\/addprem (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;

  if (!isOwner(senderId) && !adminUsers.includes(senderId)) {
    return bot.sendMessage(chatId, "❌ Access denied");
  }

  const userId = parseInt(match[1].replace(/[^0-9]/g, ""));
  if (!userId) return bot.sendMessage(chatId, "❌ Example: /addprem 123456789");

  const options = ["💎 7 Days", "👑 14 Days", "🚀 30 Days", "♾️ Permanent"];
  const poll = await bot.sendPoll(chatId, "💎 SELECT PREMIUM DURATION", options, { is_anonymous: false });

  pendingPremium[poll.poll.id] = { userId, adminId: senderId, chatId };
});

bot.on("poll_answer", (answer) => {
  const pollData = pendingPremium[answer.poll_id];
  if (!pollData) return;
  if (answer.user.id !== pollData.adminId) return;

  const choice = answer.option_ids[0];
  let days;
  if (choice === 0) days = 7;
  if (choice === 1) days = 14;
  if (choice === 2) days = 30;
  if (choice === 3) days = "permanent";

  let expiresAt;
  if (days === "permanent") {
    expiresAt = "permanent";
  } else {
    expiresAt = Date.now() + days * 86400000;
  }

  const existing = premiumUsers.find(u => u.id === pollData.userId);
  if (!existing) {
    premiumUsers.push({ id: pollData.userId, expiresAt });
  } else {
    existing.expiresAt = expiresAt;
  }

  savePremiumUsers();
  bot.sendMessage(pollData.chatId,
    `✅ Premium added\n\n👤 User ID: ${pollData.userId}\n⏳ Duration: ${days === "permanent" ? "Permanent" : days + " Days"}`
  );
  delete pendingPremium[answer.poll_id];
});

bot.onText(/\/listprem/, (msg) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id) && !adminUsers.includes(msg.from.id)) {
    return bot.sendPhoto(chatId, thumbnailUrl, {
      caption: `
<blockquote>Owner Access</blockquote>
Purchase access? DM the owner!`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "ѕтαιη [ 𖣂 ] ᴏᴡɴᴇʀ", url: "https://t.me/heisevanss" }]]
      }
    });
  }

  if (premiumUsers.length === 0) return bot.sendMessage(chatId, "📌 No premium users found.");

  let message = "<blockquote>ѕтαιη ρяσנєcт [ 𖣂 ]</blockquote>\nPremium List\n\n";
  premiumUsers.forEach((user, index) => {
    const expiresAt = user.expiresAt === "permanent" ? "Permanent" : moment(user.expiresAt).format('YYYY-MM-DD HH:mm:ss');
    message += `${index + 1}. ID: <code>${user.id}</code>\n   Expires: ${expiresAt}\n\n`;
  });

  bot.sendMessage(chatId, message, { parse_mode: "HTML" });
});

bot.onText(/\/addadmin(?:\s(.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;

  if (!isOwner(senderId)) {
    return bot.sendPhoto(chatId, thumbnailUrl, {
      caption: `<blockquote>Owner Access</blockquote>\nPurchase access? DM the owner!`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "ѕтαιη [ 𖣂 ] ᴏᴡɴᴇʀ", url: "https://t.me/heisevanss" }]]
      }
    });
  }

  if (!match || !match[1]) return bot.sendMessage(chatId, "❌ Example: /addadmin id");

  const userId = parseInt(match[1].replace(/[^0-9]/g, ''));
  if (!adminUsers.includes(userId)) {
    adminUsers.push(userId);
    saveAdminUsers();
    bot.sendMessage(chatId, `✅ User ${userId} has been added as admin.`);
  } else {
    bot.sendMessage(chatId, `❌ User ${userId} is already an admin.`);
  }
});

bot.onText(/\/delprem(?:\s(\d+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id) && !adminUsers.includes(msg.from.id)) {
    return bot.sendMessage(chatId, "❌ Access denied.");
  }
  if (!match[1]) return bot.sendMessage(chatId, "❌ Example: /delprem id");

  const userId = parseInt(match[1]);
  if (isNaN(userId)) return bot.sendMessage(chatId, "❌ Invalid ID.");

  const index = premiumUsers.findIndex(user => user.id === userId);
  if (index === -1) return bot.sendMessage(chatId, `❌ User ${userId} is not in the premium list.`);

  premiumUsers.splice(index, 1);
  savePremiumUsers();
  bot.sendMessage(chatId, `✅ User ${userId} removed from premium.`);
});

bot.onText(/\/deladmin(?:\s(\d+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id) && !adminUsers.includes(msg.from.id)) {
    return bot.sendPhoto(chatId, thumbnailUrl, {
      caption: `<blockquote>Owner Access</blockquote>\nPurchase access? DM the owner!`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "ѕтαιη [ 𖣂 ] ᴏᴡɴᴇʀ", url: "https://t.me/heisevanss" }]]
      }
    });
  }

  if (!match || !match[1]) return bot.sendMessage(chatId, "❌ Example: /deladmin id");

  const userId = parseInt(match[1].replace(/[^0-9]/g, ''));
  const adminIndex = adminUsers.indexOf(userId);
  if (adminIndex !== -1) {
    adminUsers.splice(adminIndex, 1);
    saveAdminUsers();
    bot.sendMessage(chatId, `✅ User ${userId} removed from admin.`);
  } else {
    bot.sendMessage(chatId, `❌ User ${userId} is not an admin.`);
  }
});

// ~ function Bugs
// ~ End Function Bugs

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

startBot();
initializeWhatsAppConnections();
