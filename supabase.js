const { createClient } = require("@supabase/supabase-js");
const fs = require("fs-extra");
const path = require("path");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUCKET = "sessions";
const LOCAL_CACHE = "./sessions";

// --- UPLOAD a local session folder to Supabase Storage ---
async function uploadSession(botNumber) {
  const sessionDir = path.join(LOCAL_CACHE, `device${botNumber}`);
  if (!fs.existsSync(sessionDir)) return;

  const files = fs.readdirSync(sessionDir);
  for (const file of files) {
    const filePath = path.join(sessionDir, file);
    const fileBuffer = fs.readFileSync(filePath);
    const storagePath = `${botNumber}/${file}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, { upsert: true });

    if (error) console.error(`Upload error [${file}]:`, error.message);
  }
  console.log(`Session uploaded to Supabase: ${botNumber}`);
}

// --- DOWNLOAD a session from Supabase to local cache ---
async function downloadSession(botNumber) {
  const sessionDir = path.join(LOCAL_CACHE, `device${botNumber}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  const { data: files, error } = await supabase.storage
    .from(BUCKET)
    .list(botNumber);

  if (error || !files || files.length === 0) {
    console.log(`No session found in Supabase for: ${botNumber}`);
    return false;
  }

  for (const file of files) {
    const storagePath = `${botNumber}/${file.name}`;
    const { data, error: dlError } = await supabase.storage
      .from(BUCKET)
      .download(storagePath);

    if (dlError) {
      console.error(`Download error [${file.name}]:`, dlError.message);
      continue;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(path.join(sessionDir, file.name), buffer);
  }

  console.log(`Session downloaded from Supabase: ${botNumber}`);
  return true;
}

// --- DELETE a session from Supabase ---
async function deleteSession(botNumber) {
  const { data: files, error } = await supabase.storage
    .from(BUCKET)
    .list(botNumber);

  if (error || !files) return;

  const paths = files.map(f => `${botNumber}/${f.name}`);
  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths);
    console.log(`Session deleted from Supabase: ${botNumber}`);
  }
}

// --- SAVE active session list to Supabase DB ---
async function saveActiveSessionDB(botNumber) {
  const { data, error } = await supabase
    .from("active_sessions")
    .upsert({ number: botNumber, connected_at: new Date().toISOString() }, { onConflict: "number" });

  if (error) console.error("DB save error:", error.message);
}

// --- GET all active sessions from Supabase DB ---
async function getActiveSessions() {
  const { data, error } = await supabase
    .from("active_sessions")
    .select("number");

  if (error) {
    console.error("DB fetch error:", error.message);
    return [];
  }

  return data.map(row => row.number);
}

// --- REMOVE active session from Supabase DB ---
async function removeActiveSessionDB(botNumber) {
  const { error } = await supabase
    .from("active_sessions")
    .delete()
    .eq("number", botNumber);

  if (error) console.error("DB delete error:", error.message);
}

module.exports = {
  uploadSession,
  downloadSession,
  deleteSession,
  saveActiveSessionDB,
  getActiveSessions,
  removeActiveSessionDB,
};
