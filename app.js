const STORAGE_KEY = "blocnote.notes.v1";
const CLOUD_SETTINGS_KEY = "blocnote.cloud.settings.v1";
const CLOUD_BEHAVIOR_KEY = "blocnote.cloud.behavior.v1";
const CLOUD_TABLE_NAME = "note_snapshots";

const notesList = document.getElementById("notes-list");
const newNoteBtn = document.getElementById("new-note-btn");
const exportNotesBtn = document.getElementById("export-notes-btn");
const importNotesBtn = document.getElementById("import-notes-btn");
const importFileInput = document.getElementById("import-file-input");
const deleteNoteBtn = document.getElementById("delete-note-btn");
const searchInput = document.getElementById("search-input");
const tagFilterSelect = document.getElementById("tag-filter-select");
const noteTitleInput = document.getElementById("note-title");
const noteContentInput = document.getElementById("note-content");
const noteTagsInput = document.getElementById("note-tags");
const statusText = document.getElementById("status-text");
const countText = document.getElementById("count-text");
const supabaseUrlInput = document.getElementById("supabase-url");
const supabaseAnonKeyInput = document.getElementById("supabase-anon-key");
const cloudEmailInput = document.getElementById("cloud-email");
const cloudPasswordInput = document.getElementById("cloud-password");
const cloudConnectBtn = document.getElementById("cloud-connect-btn");
const cloudLogoutBtn = document.getElementById("cloud-logout-btn");
const cloudPushBtn = document.getElementById("cloud-push-btn");
const cloudPullBtn = document.getElementById("cloud-pull-btn");
const cloudStatusText = document.getElementById("cloud-status-text");
const cloudConflictText = document.getElementById("cloud-conflict-text");
const cloudAutoEnabledInput = document.getElementById("cloud-auto-enabled");
const cloudAutoMinutesInput = document.getElementById("cloud-auto-minutes");
const conflictActions = document.getElementById("conflict-actions");
const resolveLocalBtn = document.getElementById("resolve-local-btn");
const resolveCloudBtn = document.getElementById("resolve-cloud-btn");
const phonePreviewBtn = document.getElementById("phone-preview-btn");
const installAppBtn = document.getElementById("install-app-btn");
const installHelpText = document.getElementById("install-help-text");

let notes = loadNotes();
let selectedId = notes[0]?.id ?? null;
let cloudSettings = loadCloudSettings();
let cloudBehavior = loadCloudBehavior();
let supabaseClient = null;
let cloudUser = null;
let cloudBusy = false;
let cloudConflictIds = new Set();
let lastRemoteNotesById = new Map();
let autoSyncTimer = null;
let cloudAccessToken = "";
let phonePreviewEnabled = false;
let deferredInstallPrompt = null;

registerServiceWorker();

applyCloudSettingsToInputs();
applyCloudBehaviorToInputs();
initPhonePreviewMode();
initInstallControls();

newNoteBtn.addEventListener("click", createNote);
exportNotesBtn.addEventListener("click", exportNotesAsJson);
importNotesBtn.addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", importNotesFromFile);
deleteNoteBtn.addEventListener("click", deleteSelectedNote);
searchInput.addEventListener("input", render);
tagFilterSelect.addEventListener("change", render);
noteTitleInput.addEventListener("input", onEditorInput);
noteContentInput.addEventListener("input", onEditorInput);
noteTagsInput.addEventListener("input", onEditorInput);
supabaseUrlInput.addEventListener("input", onCloudSettingsInput);
supabaseAnonKeyInput.addEventListener("input", onCloudSettingsInput);
cloudEmailInput.addEventListener("input", onCloudSettingsInput);
cloudConnectBtn.addEventListener("click", connectCloud);
cloudLogoutBtn.addEventListener("click", logoutCloud);
cloudPushBtn.addEventListener("click", pushToCloud);
cloudPullBtn.addEventListener("click", pullFromCloud);
cloudAutoEnabledInput.addEventListener("change", onCloudBehaviorInput);
cloudAutoMinutesInput.addEventListener("input", onCloudBehaviorInput);
resolveLocalBtn.addEventListener("click", resolveConflictKeepLocal);
resolveCloudBtn.addEventListener("click", resolveConflictKeepCloud);
window.addEventListener("pagehide", syncOnPageExit);
document.addEventListener("visibilitychange", onVisibilityChange);
phonePreviewBtn.addEventListener("click", togglePhonePreviewMode);
installAppBtn.addEventListener("click", installApp);

render();
initCloudSync();

function initInstallControls() {
  if (isStandaloneMode()) {
    installAppBtn.hidden = true;
    installHelpText.hidden = false;
    installHelpText.textContent = "L'app est deja installee sur cet appareil";
    return;
  }

  if (isIosDevice()) {
    installAppBtn.hidden = false;
    installHelpText.hidden = false;
    installHelpText.textContent = "iPhone: Safari > Partager > Sur l'ecran d'accueil";
    return;
  }

  installAppBtn.hidden = true;
  installHelpText.hidden = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installAppBtn.hidden = false;
    installHelpText.hidden = false;
    installHelpText.textContent = "Appuie sur Installer l'app";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installAppBtn.hidden = true;
    installHelpText.hidden = false;
    installHelpText.textContent = "Installation terminee";
  });
}

async function installApp() {
  if (isIosDevice()) {
    installHelpText.hidden = false;
    installHelpText.textContent = "iPhone: Safari > Partager > Sur l'ecran d'accueil";
    return;
  }

  if (!deferredInstallPrompt) {
    installHelpText.hidden = false;
    installHelpText.textContent = "Installation non disponible pour le moment";
    return;
  }

  deferredInstallPrompt.prompt();
  const choiceResult = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;

  installHelpText.hidden = false;
  installHelpText.textContent =
    choiceResult.outcome === "accepted" ? "Installation en cours..." : "Installation annulee";
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

function initPhonePreviewMode() {
  const isLikelyMobile = window.matchMedia("(max-width: 860px)").matches;

  if (isLikelyMobile) {
    phonePreviewBtn.hidden = true;
    document.body.classList.remove("phone-preview");
    phonePreviewEnabled = false;
    return;
  }

  phonePreviewBtn.hidden = false;
  phonePreviewEnabled = true;
  document.body.classList.add("phone-preview");
  updatePhonePreviewLabel();
}

function togglePhonePreviewMode() {
  phonePreviewEnabled = !phonePreviewEnabled;
  document.body.classList.toggle("phone-preview", phonePreviewEnabled);
  updatePhonePreviewLabel();
}

function updatePhonePreviewLabel() {
  phonePreviewBtn.textContent = `Apercu ecran telephone: ${phonePreviewEnabled ? "ON" : "OFF"}`;
}

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function loadCloudSettings() {
  try {
    const raw = localStorage.getItem(CLOUD_SETTINGS_KEY);
    if (!raw) return { url: "", anonKey: "", email: "" };
    const parsed = JSON.parse(raw);
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      anonKey: typeof parsed.anonKey === "string" ? parsed.anonKey : "",
      email: typeof parsed.email === "string" ? parsed.email : "",
    };
  } catch {
    return { url: "", anonKey: "", email: "" };
  }
}

function saveCloudSettings() {
  localStorage.setItem(CLOUD_SETTINGS_KEY, JSON.stringify(cloudSettings));
}

function applyCloudSettingsToInputs() {
  supabaseUrlInput.value = cloudSettings.url;
  supabaseAnonKeyInput.value = cloudSettings.anonKey;
  cloudEmailInput.value = cloudSettings.email;
}

function loadCloudBehavior() {
  try {
    const raw = localStorage.getItem(CLOUD_BEHAVIOR_KEY);
    if (!raw) return { autoSyncEnabled: false, autoSyncMinutes: 5 };
    const parsed = JSON.parse(raw);
    const minutes = Number(parsed.autoSyncMinutes);

    return {
      autoSyncEnabled: Boolean(parsed.autoSyncEnabled),
      autoSyncMinutes: Number.isFinite(minutes) ? clampAutoSyncMinutes(minutes) : 5,
    };
  } catch {
    return { autoSyncEnabled: false, autoSyncMinutes: 5 };
  }
}

function saveCloudBehavior() {
  localStorage.setItem(CLOUD_BEHAVIOR_KEY, JSON.stringify(cloudBehavior));
}

function applyCloudBehaviorToInputs() {
  cloudAutoEnabledInput.checked = cloudBehavior.autoSyncEnabled;
  cloudAutoMinutesInput.value = String(cloudBehavior.autoSyncMinutes);
}

function clampAutoSyncMinutes(value) {
  return Math.min(120, Math.max(1, Math.round(value)));
}

function onCloudBehaviorInput() {
  const requestedMinutes = Number(cloudAutoMinutesInput.value);
  const safeMinutes = Number.isFinite(requestedMinutes)
    ? clampAutoSyncMinutes(requestedMinutes)
    : 5;

  cloudBehavior = {
    autoSyncEnabled: cloudAutoEnabledInput.checked,
    autoSyncMinutes: safeMinutes,
  };

  cloudAutoMinutesInput.value = String(safeMinutes);
  saveCloudBehavior();
  restartAutoSync();
}

function onCloudSettingsInput() {
  cloudSettings = {
    url: supabaseUrlInput.value.trim(),
    anonKey: supabaseAnonKeyInput.value.trim(),
    email: cloudEmailInput.value.trim(),
  };
  saveCloudSettings();
}

function setCloudStatus(message) {
  cloudStatusText.textContent = message;
}

function setCloudConflictStatus(message) {
  cloudConflictText.textContent = message;
}

function updateCloudConflictStatus() {
  const count = cloudConflictIds.size;
  if (count === 0) {
    setCloudConflictStatus("Aucun conflit detecte");
    return;
  }

  setCloudConflictStatus(`${count} conflit${count > 1 ? "s" : ""} detecte${count > 1 ? "s" : ""}`);
}

function updateCloudUi() {
  const isConnected = Boolean(cloudUser);
  const hasConfig = Boolean(cloudSettings.url && cloudSettings.anonKey);

  cloudConnectBtn.disabled = cloudBusy || !hasConfig;
  cloudLogoutBtn.disabled = cloudBusy || !isConnected;
  cloudPushBtn.disabled = cloudBusy || !isConnected;
  cloudPullBtn.disabled = cloudBusy || !isConnected;
}

function onVisibilityChange() {
  if (document.visibilityState !== "hidden") return;
  syncOnPageExit();
}

function clearAutoSyncTimer() {
  if (!autoSyncTimer) return;
  clearInterval(autoSyncTimer);
  autoSyncTimer = null;
}

function restartAutoSync() {
  clearAutoSyncTimer();

  const shouldRun =
    Boolean(cloudUser) &&
    Boolean(supabaseClient) &&
    cloudBehavior.autoSyncEnabled &&
    cloudBehavior.autoSyncMinutes > 0;

  if (!shouldRun) return;

  const delayMs = cloudBehavior.autoSyncMinutes * 60 * 1000;

  autoSyncTimer = window.setInterval(() => {
    if (cloudBusy) return;
    pushToCloud({ silent: true, source: "auto" });
  }, delayMs);
}

function createSupabaseClient() {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("SDK Supabase indisponible");
  }

  return window.supabase.createClient(cloudSettings.url, cloudSettings.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

async function initCloudSync() {
  updateCloudUi();
  updateCloudConflictStatus();

  if (!cloudSettings.url || !cloudSettings.anonKey) {
    setCloudStatus("Ajoute URL et Anon Key Supabase pour activer le cloud");
    return;
  }

  try {
    supabaseClient = createSupabaseClient();
    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();

    if (error) throw error;

    cloudUser = session?.user ?? null;
    cloudAccessToken = session?.access_token || "";
    setCloudStatus(
      cloudUser
        ? `Connecte en cloud: ${cloudUser.email || cloudUser.id}`
        : "Cloud configure, connecte-toi pour synchroniser"
    );
  } catch {
    supabaseClient = null;
    cloudUser = null;
    cloudAccessToken = "";
    setCloudStatus("Configuration cloud invalide");
  }

  updateCloudUi();
  restartAutoSync();
}

async function connectCloud() {
  const email = cloudEmailInput.value.trim();
  const password = cloudPasswordInput.value;

  onCloudSettingsInput();

  if (!cloudSettings.url || !cloudSettings.anonKey) {
    setCloudStatus("Renseigne URL et Anon Key Supabase");
    updateCloudUi();
    return;
  }

  if (!email || !password) {
    setCloudStatus("Email et mot de passe requis");
    updateCloudUi();
    return;
  }

  cloudBusy = true;
  updateCloudUi();

  try {
    supabaseClient = createSupabaseClient();
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
        email,
        password,
      });

      if (signUpError) throw signUpError;

      if (signUpData.user && !signUpData.session) {
        cloudAccessToken = "";
        setCloudStatus("Compte cree. Verifie ton email puis reconnecte-toi");
        return;
      }

      cloudUser = signUpData.user ?? null;
      cloudAccessToken = signUpData.session?.access_token || "";
      setCloudStatus(`Compte cree et connecte: ${email}`);
    } else {
      cloudUser = data.user ?? null;
      cloudAccessToken = data.session?.access_token || "";
      setCloudStatus(`Connecte en cloud: ${email}`);
    }

    cloudPasswordInput.value = "";
    restartAutoSync();
  } catch {
    cloudUser = null;
    cloudAccessToken = "";
    setCloudStatus("Connexion cloud impossible");
    restartAutoSync();
  } finally {
    cloudBusy = false;
    updateCloudUi();
  }
}

async function logoutCloud() {
  if (!supabaseClient) return;

  cloudBusy = true;
  updateCloudUi();

  try {
    await supabaseClient.auth.signOut();
    cloudUser = null;
    cloudAccessToken = "";
    setCloudStatus("Deconnecte du cloud");
    restartAutoSync();
  } catch {
    setCloudStatus("Deconnexion cloud impossible");
  } finally {
    cloudBusy = false;
    updateCloudUi();
  }
}

async function pushToCloud(options = {}) {
  const { silent = false, source = "manual" } = options;

  if (!supabaseClient || !cloudUser) {
    if (!silent) setCloudStatus("Connecte-toi avant d'envoyer tes notes");
    return;
  }

  cloudBusy = true;
  updateCloudUi();

  try {
    const { error } = await supabaseClient.from(CLOUD_TABLE_NAME).upsert(
      {
        user_id: cloudUser.id,
        notes,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    );

    if (error) throw error;

    if (!silent) {
      setCloudStatus(`Cloud mis a jour: ${notes.length} note${notes.length > 1 ? "s" : ""}`);
    } else if (source === "auto") {
      setCloudStatus(`Sync auto OK (${cloudBehavior.autoSyncMinutes} min)`);
    }
  } catch {
    if (!silent) {
      setCloudStatus(`Echec d'envoi cloud (table ${CLOUD_TABLE_NAME} manquante ?)`);
    } else {
      setCloudStatus("Sync auto en echec");
    }
  } finally {
    cloudBusy = false;
    updateCloudUi();
  }
}

async function pullFromCloud() {
  if (!supabaseClient || !cloudUser) {
    setCloudStatus("Connecte-toi avant de recuperer tes notes");
    return;
  }

  cloudBusy = true;
  updateCloudUi();

  try {
    const { data, error } = await supabaseClient
      .from(CLOUD_TABLE_NAME)
      .select("notes, updated_at")
      .eq("user_id", cloudUser.id)
      .maybeSingle();

    if (error) throw error;
    if (!data || !Array.isArray(data.notes)) {
      cloudConflictIds = new Set();
      updateCloudConflictStatus();
      setCloudStatus("Aucune sauvegarde cloud trouvee");
      return;
    }

    const remoteNotes = data.notes.map(normalizeNote).filter((note) => note !== null);
    lastRemoteNotesById = new Map(remoteNotes.map((note) => [note.id, note]));
    cloudConflictIds = detectConflicts(notes, remoteNotes);
    notes = mergeNotesByNewest(notes, remoteNotes);
    selectedId = notes[0]?.id ?? null;
    saveNotes();
    render();
    updateCloudConflictStatus();

    setCloudStatus(
      `Sync terminee: ${remoteNotes.length} note${remoteNotes.length > 1 ? "s" : ""} lue${
        remoteNotes.length > 1 ? "s" : ""
      }`
    );
  } catch {
    setCloudStatus("Echec de recuperation cloud");
  } finally {
    cloudBusy = false;
    updateCloudUi();
  }
}

function detectConflicts(localNotes, remoteNotes) {
  const localById = new Map(localNotes.map((note) => [note.id, note]));
  const conflicts = new Set();

  remoteNotes.forEach((remoteNote) => {
    const localNote = localById.get(remoteNote.id);
    if (!localNote) return;

    const localFingerprint = noteFingerprint(localNote);
    const remoteFingerprint = noteFingerprint(remoteNote);
    if (localFingerprint === remoteFingerprint) return;

    const localTime = new Date(localNote.updatedAt).getTime();
    const remoteTime = new Date(remoteNote.updatedAt).getTime();

    if (Math.abs(localTime - remoteTime) > 1000) {
      conflicts.add(remoteNote.id);
    }
  });

  return conflicts;
}

function noteFingerprint(note) {
  return JSON.stringify({
    title: note.title || "",
    content: note.content || "",
    tags: normalizeTags(note.tags),
  });
}

function mergeNotesByNewest(localNotes, remoteNotes) {
  const merged = new Map();

  [...localNotes, ...remoteNotes].forEach((note) => {
    if (!note || !note.id) return;

    const previous = merged.get(note.id);
    if (!previous) {
      merged.set(note.id, note);
      return;
    }

    const previousTime = new Date(previous.updatedAt).getTime();
    const candidateTime = new Date(note.updatedAt).getTime();
    merged.set(note.id, candidateTime >= previousTime ? note : previous);
  });

  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function resolveConflictKeepLocal() {
  const selected = notes.find((note) => note.id === selectedId);
  if (!selected || !cloudConflictIds.has(selected.id)) return;

  cloudConflictIds.delete(selected.id);
  updateCloudConflictStatus();
  render();
  setCloudStatus("Conflit resolu: version locale conservee");
}

function resolveConflictKeepCloud() {
  const selected = notes.find((note) => note.id === selectedId);
  if (!selected || !cloudConflictIds.has(selected.id)) return;

  const remote = lastRemoteNotesById.get(selected.id);
  if (!remote) {
    setCloudStatus("Version cloud introuvable pour cette note");
    return;
  }

  const selectedIndex = notes.findIndex((note) => note.id === selected.id);
  if (selectedIndex === -1) return;

  notes[selectedIndex] = {
    ...remote,
    id: selected.id,
  };

  notes = notes
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  cloudConflictIds.delete(selected.id);
  saveNotes();
  updateCloudConflictStatus();
  render();
  setCloudStatus("Conflit resolu: version cloud appliquee");
}

function syncOnPageExit() {
  if (!cloudBehavior.autoSyncEnabled) return;
  if (!cloudSettings.url || !cloudSettings.anonKey || !cloudUser || !cloudAccessToken) return;

  const endpoint = `${cloudSettings.url}/rest/v1/${CLOUD_TABLE_NAME}?on_conflict=user_id`;
  const payload = JSON.stringify({
    user_id: cloudUser.id,
    notes,
    updated_at: new Date().toISOString(),
  });

  // keepalive allows the request to continue briefly during tab close/navigation.
  fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: cloudSettings.anonKey,
      Authorization: `Bearer ${cloudAccessToken}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Ignore close-time sync errors.
  });
}

function exportNotesAsJson() {
  const payload = {
    app: "BlocNote",
    version: 1,
    exportedAt: new Date().toISOString(),
    notes,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `blocnote-export-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);

  statusText.textContent = "Export JSON termine";
}

async function importNotesFromFile(event) {
  const file = event.target.files?.[0];
  importFileInput.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const imported = Array.isArray(parsed) ? parsed : parsed.notes;

    if (!Array.isArray(imported)) {
      throw new Error("Format de fichier invalide");
    }

    const normalized = imported
      .map(normalizeNote)
      .filter((note) => note !== null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    notes = normalized;
    selectedId = notes[0]?.id ?? null;
    saveNotes();
    render();
    statusText.textContent = `${notes.length} note${notes.length > 1 ? "s" : ""} importee${
      notes.length > 1 ? "s" : ""
    }`;
  } catch {
    statusText.textContent = "Import impossible: fichier JSON invalide";
  }
}

function createNote() {
  const note = {
    id: crypto.randomUUID(),
    title: "Nouvelle note",
    content: "",
    tags: [],
    updatedAt: new Date().toISOString(),
  };

  notes.unshift(note);
  selectedId = note.id;
  saveNotes();
  render();
  noteTitleInput.focus();
  noteTitleInput.select();
}

function deleteSelectedNote() {
  if (!selectedId) return;

  const currentIndex = notes.findIndex((note) => note.id === selectedId);
  if (currentIndex === -1) return;

  notes.splice(currentIndex, 1);
  selectedId = notes[0]?.id ?? null;
  saveNotes();
  render();
}

function onEditorInput() {
  const selected = notes.find((note) => note.id === selectedId);
  if (!selected) return;

  selected.title = noteTitleInput.value.trim() || "Sans titre";
  selected.content = noteContentInput.value;
  selected.tags = parseTags(noteTagsInput.value);
  selected.updatedAt = new Date().toISOString();

  // Keep most recently edited note at top.
  notes = notes
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  saveNotes();
  render();
}

function render() {
  renderTagFilter();
  renderList();
  renderEditor();
  renderMeta();
}

function renderTagFilter() {
  const allTags = Array.from(
    new Set(
      notes
        .flatMap((note) => (Array.isArray(note.tags) ? note.tags : []))
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "fr"));

  const previousValue = tagFilterSelect.value;

  tagFilterSelect.innerHTML = '<option value="">Tous les tags</option>';

  allTags.forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    tagFilterSelect.appendChild(option);
  });

  if (allTags.includes(previousValue)) {
    tagFilterSelect.value = previousValue;
  }
}

function renderList() {
  const query = searchInput.value.trim().toLowerCase();
  const selectedTag = tagFilterSelect.value;

  const filtered = notes.filter((note) => {
    const noteTags = Array.isArray(note.tags) ? note.tags : [];
    const matchesTag = !selectedTag || noteTags.includes(selectedTag);

    if (!matchesTag) return false;

    return (
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query) ||
      noteTags.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  notesList.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("li");
    empty.className = "note-item";
    empty.textContent = query || selectedTag ? "Aucun resultat" : "Aucune note pour le moment";
    notesList.appendChild(empty);
    return;
  }

  filtered.forEach((note) => {
    const item = document.createElement("li");
    const hasConflict = cloudConflictIds.has(note.id);
    item.className = `note-item ${note.id === selectedId ? "active" : ""} ${
      hasConflict ? "has-conflict" : ""
    }`;

    const tagsHtml = renderTagsHtml(note.tags);
    const conflictHtml = hasConflict ? '<div class="conflict-chip">Conflit local/cloud</div>' : "";

    item.innerHTML = `
      <div class="note-title">${escapeHtml(note.title)}</div>
      <div class="note-preview">${escapeHtml(trimPreview(note.content))}</div>
      ${tagsHtml}
      ${conflictHtml}
      <div class="note-date">${formatDate(note.updatedAt)}</div>
    `;

    item.addEventListener("click", () => {
      selectedId = note.id;
      render();
    });

    notesList.appendChild(item);
  });
}

function renderEditor() {
  const selected = notes.find((note) => note.id === selectedId);
  const hasSelection = Boolean(selected);

  noteTitleInput.disabled = !hasSelection;
  noteContentInput.disabled = !hasSelection;
  noteTagsInput.disabled = !hasSelection;
  deleteNoteBtn.disabled = !hasSelection;

  if (!hasSelection) {
    noteTitleInput.value = "";
    noteContentInput.value = "";
    noteTagsInput.value = "";
    conflictActions.hidden = true;
    statusText.textContent = "Aucune note selectionnee";
    return;
  }

  noteTitleInput.value = selected.title;
  noteContentInput.value = selected.content;
  noteTagsInput.value = (selected.tags || []).join(", ");
  const hasConflict = cloudConflictIds.has(selected.id);
  conflictActions.hidden = !hasConflict;
  const conflictSuffix = hasConflict ? " - conflit cloud detecte" : "";
  statusText.textContent = `Derniere modif: ${formatDate(selected.updatedAt)}${conflictSuffix}`;
}

function renderMeta() {
  const total = notes.length;
  countText.textContent = `${total} ${total > 1 ? "notes" : "note"}`;
}

function trimPreview(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "(note vide)";
  return clean.length > 52 ? `${clean.slice(0, 52)}...` : clean;
}

function formatDate(isoDate) {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeNote(rawNote) {
  if (!rawNote || typeof rawNote !== "object") return null;

  const title = typeof rawNote.title === "string" ? rawNote.title.trim() : "";
  const content = typeof rawNote.content === "string" ? rawNote.content : "";
  const tags = normalizeTags(rawNote.tags);
  const updatedAt = new Date(rawNote.updatedAt || Date.now()).toISOString();

  return {
    id: typeof rawNote.id === "string" && rawNote.id ? rawNote.id : crypto.randomUUID(),
    title: title || "Sans titre",
    content,
    tags,
    updatedAt,
  };
}

function parseTags(tagsValue) {
  return Array.from(
    new Set(
      tagsValue
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((tag) => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function renderTagsHtml(tags) {
  const safeTags = normalizeTags(tags);
  if (safeTags.length === 0) return "";

  return `<div class="note-tags">${safeTags
    .map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`)
    .join("")}</div>`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch {
      // Ignore SW registration errors to avoid interrupting note features.
    }
  });
}
