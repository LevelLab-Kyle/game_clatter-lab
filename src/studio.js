// Level Lab accounts, cloud saves and share links, through Level Lab Studio
// (platform/docs/STUDIO.md). Loaded after main.js and uses its globals.
//
// - Signed in, the player's progress follows them to any computer: levels
//   beaten, the parts placed in each level and the Sandbox board. The view
//   and the scroll lock stay on this device.
// - Share (Sandbox) saves a copy of the board and copies a link to it. The
//   link opens that board in anyone's Sandbox, signed in or not.
// - Guests, the phone app and pages opened from disk keep playing with the
//   browser save in main.js. Nothing here is needed to play.
//
// - On a shared computer (a classroom), local progress remembers whose it
//   is. A guest's progress joins the first account that signs in; another
//   player's never does: signing in swaps it for theirs.
//
// Level Lab's site, and so its API, comes from ?studio= (release by
// default; ?studio=dev or ?studio=stage for testing). The choice rides along
// in share links.

const STUDIO_APP = 'clatter-lab';
const STUDIO_SITES = {
  release: 'https://levellab.com',
  stage: 'https://stage.levellab.com',
  dev: 'https://dev.levellab.com',
};
// When the progress below last changed, what it was (main.js's save is
// rewritten on every view move, so changes are found by comparing), and
// whose it is (the account id; null for a guest's).
const CLOUD_KEY = 'clatter-lab.cloud.v1';
const CLOUD_PUSH_MS = 2000;
const TOAST_MS = 3000;

let studio = null;
let cloudReady = false; // signed in, and the cloud copy merged in
let pushTimer = null;
let toastTimer = null;

const btnAccount = document.getElementById('btn-account');
const btnShare = document.getElementById('btn-share');
const cloudCard = document.getElementById('cloud-card');

// ---------------------------------------------------------------------------
// Progress: what main.js saves, minus what belongs to this device.

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function localProgress() {
  const levels = readJson(LEVELS_KEY) || {};
  const board = readJson(SAVE_KEY);
  return {
    done: levels.done || [],
    boards: levels.boards || {},
    sandbox: board && Array.isArray(board.items) ? { items: board.items, example: board.example || '' } : null,
  };
}

// main.js calls this after each save. A real change gets a new time and is
// sent up shortly.
function cloudSaved() {
  const progress = localProgress();
  const json = JSON.stringify(progress);
  const last = readJson(CLOUD_KEY);
  if (last && last.json === json) return;
  // The first look is a starting point, not a change (time 0): a device
  // opening this version with an old save must not beat a newer cloud copy.
  const savedAt = last ? Date.now() : 0;
  writeCloud({ savedAt, json, owner: last?.owner || null });
  if (cloudReady) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushProgress, CLOUD_PUSH_MS);
  }
}

function writeCloud(cloud) {
  try { localStorage.setItem(CLOUD_KEY, JSON.stringify(cloud)); } catch {}
}

// Returns whether the account now has this device's progress.
async function pushProgress() {
  pushTimer = null;
  if (!cloudReady) return false;
  const savedAt = readJson(CLOUD_KEY)?.savedAt || Date.now();
  try {
    await studio.saveProgress({ v: 1, savedAt, ...localProgress() });
    return true;
  } catch (error) {
    console.warn(`Could not save progress to Level Lab: ${error.message}`);
    return false;
  }
}

// Fold the account's copy into this device's: levels beaten add up; for
// boards, whichever copy changed last wins. The open board reloads only if
// the player hasn't touched it yet. Progress that belongs to another
// account is swapped out instead, so it never joins this one.
function mergeProgress(remote, userId) {
  const cloud = readJson(CLOUD_KEY);
  const someoneElse = !!cloud?.owner && cloud.owner !== userId;
  if (someoneElse) {
    levelsDone.clear();
    for (const name of Object.keys(levelBoards)) delete levelBoards[name];
    try { localStorage.removeItem(SAVE_KEY); } catch {}
  }
  if (!someoneElse && !remote) {
    // Nothing in the account yet: this device's progress becomes its first copy.
    writeCloud({ ...(cloud || { savedAt: 0, json: '' }), owner: userId });
    return;
  }
  remote = remote || {};
  const remoteNewer = someoneElse || (remote.savedAt || 0) > (cloud?.savedAt || 0);
  (remote.done || []).forEach((name) => levelsDone.add(name));
  for (const [name, board] of Object.entries(remote.boards || {})) {
    if (remoteNewer || !levelBoards[name]) levelBoards[name] = board;
  }
  const takeSandbox = remote.sandbox && (remoteNewer || !readJson(SAVE_KEY));
  if (takeSandbox) {
    // The account's board, with no saved view: Home fits it.
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(remote.sandbox)); } catch {}
  }

  // Another player's board never stays up, touched or not.
  const reload = someoneElse || (!history.undo.length && !playing);
  clearTimeout(saveTimer); // the pending save would keep the old board
  saveTimer = null;
  if (reload && playing) stopPlay();
  if (reload && currentLevel()) {
    let n = levelIndex;
    while (n > 0 && !levelOpen(n)) n--; // a level this player has opened
    loadLevel(n);
  } else if (reload && (takeSandbox || someoneElse)) {
    clearBoard();
    if (!loadProgress()) loadExample('Domino Run');
    resetHistory();
    homeView();
  }
  saveProgress();
  writeCloud({ ...(readJson(CLOUD_KEY) || { savedAt: 0, json: '' }), owner: userId });
}

// ---------------------------------------------------------------------------
// Messages: a short note over the board, or a card that asks.

function showNote(text) {
  setTextWithIcons(toast, text);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, TOAST_MS);
}

function showCard({ title, text, yes, onYes, no = 'Cancel' }) {
  document.getElementById('cloud-title').textContent = title;
  document.getElementById('cloud-text').textContent = text;
  const yesButton = document.getElementById('cloud-yes');
  yesButton.textContent = yes;
  yesButton.onclick = () => { cloudCard.hidden = true; onYes(); };
  const noButton = document.getElementById('cloud-no');
  noButton.textContent = no || '';
  noButton.hidden = !no; // one button when there's nothing to cancel
  cloudCard.hidden = false;
}
document.getElementById('cloud-no').onclick = () => { cloudCard.hidden = true; };
cloudCard.addEventListener('pointerdown', (ev) => ev.stopPropagation());

// ---------------------------------------------------------------------------
// Signing in and out

function showAccount() {
  const user = studio?.user;
  btnAccount.classList.toggle('on', !!user);
  btnAccount.title = user ? 'Signed In' : 'Sign In';
  btnAccount.setAttribute('aria-label', btnAccount.title);
}

// Level Lab's sign-in shows over the game; the game never leaves.
function signIn() {
  studio.signIn().catch((error) => {
    console.warn(`Could not sign in: ${error.message}`);
    showNote('Could not reach Level Lab. Try again.');
  });
}

btnAccount.onclick = () => {
  if (studio.user) {
    showCard({
      title: 'You are signed in',
      text: 'Your levels and boards are saved. You can play on any computer.',
      yes: 'Sign Out',
      no: 'Close',
      onYes: signOut,
    });
  } else {
    showCard({
      title: 'Sign In',
      text: 'Sign in to save your work. Then you can play on any computer.',
      yes: 'Sign In',
      onYes: signIn,
    });
  }
};

// Signing out saves anything not sent yet, then starts this computer
// fresh, so the next player never sees or inherits this one's work. If the
// save fails, nothing is signed out or cleared.
async function signOut() {
  clearTimeout(pushTimer);
  if (cloudReady && !(await pushProgress())) {
    showNote('Could not save your work. Try again.');
    return;
  }
  cloudReady = false;
  await studio.signOut();
  try { [LEVELS_KEY, SAVE_KEY, CLOUD_KEY].forEach((key) => localStorage.removeItem(key)); } catch {}
  levelsDone.clear();
  for (const name of Object.keys(levelBoards)) delete levelBoards[name];
  clearTimeout(saveTimer);
  saveTimer = null;
  if (playing) stopPlay();
  if (currentLevel()) {
    loadLevel(0);
  } else {
    clearBoard();
    loadExample('Domino Run');
    resetHistory();
    homeView();
  }
  showNote('Signed out. Your work is saved.');
}

async function onSignedIn() {
  const userId = studio.user.id;
  try {
    const remote = await studio.loadProgress();
    if (studio.user?.id !== userId) return; // signed out or switched meanwhile
    mergeProgress(remote?.v === 1 ? remote : null, userId);
    cloudReady = true;
    await pushProgress();
  } catch (error) {
    console.warn(`Could not load progress from Level Lab: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Sharing a Sandbox board

btnShare.onclick = async () => {
  if (playing) stopPlay();
  if (!items.size) { showNote('Build something first!'); return; }
  if (!studio.user) {
    showCard({
      title: 'Sign In to Share',
      text: 'Sign in first. Then you can share your board with a friend.',
      yes: 'Sign In',
      onYes: signIn,
    });
    return;
  }
  btnShare.disabled = true;
  try {
    const link = await shareBoard({
      items: snapshot().map(({ locked, ...s }) => s),
      example: examplesSelect.value,
    });
    try {
      await navigator.clipboard.writeText(link);
      showNote('Link copied! Send it to a friend.');
    } catch {
      showCard({ title: 'Your Link', text: `Send this link to a friend: ${link}`, yes: 'Done', no: null, onYes: () => {} });
    }
  } catch (error) {
    console.warn(`Could not share the board: ${error.message}`);
    showNote('Could not share. Try again.');
  } finally {
    btnShare.disabled = false;
  }
};

// Each share is its own copy, so later changes don't change what a friend
// already opened. Past the limit, the oldest share makes room.
async function shareBoard(board) {
  const id = 'share-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try {
    await studio.saveProject(id, board);
  } catch (error) {
    if (error.code !== 'STUDIO_PROJECTS_FULL') throw error;
    const all = await studio.listProjects();
    await studio.deleteProject(all[all.length - 1].id);
    await studio.saveProject(id, board);
  }
  const { shareId } = await studio.shareProject(id);
  const url = new URL(location.href);
  url.hash = '';
  url.search = '';
  url.searchParams.set('share', shareId);
  const site = new URLSearchParams(location.search).get('studio');
  if (site) url.searchParams.set('studio', site);
  return url.href;
}

// A ?share= link: the friend's board, in the Sandbox. Undo brings back the
// board that was there.
async function openSharedBoard(shareId) {
  const url = new URL(location.href);
  url.searchParams.delete('share');
  // window.history: main.js's `history` is the undo stack.
  window.history.replaceState(window.history.state, '', url.href); // a reload shouldn't load it again
  try {
    const shared = await StudioClient.openShared(shareId);
    if (shared.app !== STUDIO_APP || !Array.isArray(shared.data?.items)) throw new Error('Not a board');
    if (mode !== 'sandbox') enterSandbox();
    if (playing) stopPlay();
    if (items.size) recordEdit();
    clearBoard();
    for (const s of shared.data.items.map(upgradeEntry)) {
      if (GADGETS[s.type] && canPlace(s.type, s.x, s.y, s.rot || 0, null, s.size || null)) {
        addItem(s.type, s.x, s.y, s.rot || 0, !!s.flip, s.size || null);
      }
    }
    if (EXAMPLES[shared.data.example]) examplesSelect.value = shared.data.example;
    homeView();
    scheduleSave();
    showNote('A friend made this! Press {play} to watch it go.');
  } catch (error) {
    console.warn(`Could not open the shared board: ${error.message}`);
    showNote('That link does not work anymore.');
  }
}

// ---------------------------------------------------------------------------
// Start: load Level Lab's client from the chosen site, then sign in quietly.
// The buttons only show once Level Lab answers.

(function startStudio() {
  const params = new URLSearchParams(location.search);
  const shareId = params.get('share');
  const inApp = !!window.Capacitor?.isNativePlatform?.();
  if (inApp || !/^https?:$/.test(location.protocol)) {
    if (shareId) showNote('That link does not work here.');
    return;
  }
  const site = STUDIO_SITES[params.get('studio')] || STUDIO_SITES.release;
  const script = document.createElement('script');
  script.src = `${site}/studio/StudioClient.js`;
  script.onerror = () => {
    console.warn(`Level Lab is not reachable at ${site}; playing as a guest.`);
    if (shareId) showNote('That link does not work anymore.');
  };
  script.onload = async () => {
    if (shareId) openSharedBoard(shareId);
    studio = await StudioClient.connect(STUDIO_APP);
    showAccount();
    btnAccount.hidden = false;
    btnShare.hidden = false;
    fitBrand();
    studio.onChange(() => {
      showAccount();
      cloudReady = false;
      if (studio.user) onSignedIn();
    });
    if (studio.user) onSignedIn();
  };
  document.head.appendChild(script);
})();

window.addEventListener('pagehide', () => { if (pushTimer) { clearTimeout(pushTimer); pushProgress(); } });
