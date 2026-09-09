# Open Karaoke - Final GitHub + Firebase Web App

A free, browser-based karaoke MVP built with plain HTML, CSS, vanilla JavaScript, Firebase Realtime Database, Firebase Anonymous Authentication, the official YouTube IFrame Player API, and QRCode.js.

## No-install architecture

Normal use does **not** require npm, Node.js, a local server, a paid domain, or a paid backend.

- Hosting: GitHub Pages
- Realtime sync: Firebase Realtime Database
- Guest identity/security: Firebase Anonymous Authentication
- Playback: official YouTube IFrame Player API
- Search: YouTube Data API v3 (optional but recommended)
- QR code: QRCode.js CDN

The Host and guests only need a modern browser and internet access.

---

## Included features

### Host / TV screen

- Create a unique karaoke session
- 6-character random session suffix, e.g. `KARAOKE-A7K2QF`
- QR code for the exact guest-session URL
- Connected guest count and guest names
- YouTube embedded player
- Now Playing song and singer
- Play / Resume
- Pause
- Stop
- Next / Skip
- Previous / restart behavior
- Volume control
- Automatic next song when the current YouTube video ends
- Queue Move Up / Move Down
- Remove waiting song
- Clear waiting queue
- Lock / unlock new reservations
- Recent completed/skipped song history
- Clear finished history
- Fullscreen button for TV/projector use
- Host PIN lock
- Reload/session recovery on the same Host browser
- End & Delete Session cleanup

### Guest phone controller

- Join by QR or session code
- Singer/nickname stored locally on the guest phone
- YouTube search with thumbnail, title, and channel
- Preview search results
- Reserve from a search result
- Manual YouTube-link/video-ID reservation fallback
- Shared real-time queue
- Queue position
- My Songs
- Cancel only the guest's own waiting reservation
- Duplicate reservation protection for the same guest/video while that queue record exists
- Live Now Playing information
- Live reservation lock notice
- Host online/offline status

### Security model

The Host PIN is a UI lock for the Host computer. It is **not** the database authority.

Actual Host permissions are enforced by Firebase Authentication UID + Realtime Database Security Rules. A guest who opens `host.html` gets a different anonymous Firebase UID and cannot control another Host's session.

The PIN itself is not hard-coded in the source. A salted SHA-256 PIN hash is stored only in the Host browser's local storage.

Important: because this is a static browser app, the PIN is intended to stop casual access to the Host controls on the Host device. Firebase rules are what protect the shared data.

---

# One-time setup

## 1. Create a GitHub repository

1. Sign in to GitHub.
2. Create a new repository, for example `open-karaoke`.
3. Upload all files and folders from this project to the repository root.
4. Commit the files.

Do not rename these files unless you also update their links:

```text
index.html
host.html
guest.html
css/
js/
database.rules.json
README.md
```

## 2. Turn on GitHub Pages

In the GitHub repository:

1. Open **Settings**.
2. Open **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select your main branch and `/ (root)`.
5. Save.

GitHub will give you a public URL similar to:

```text
https://YOUR-USERNAME.github.io/open-karaoke/
```

The Host page will be:

```text
https://YOUR-USERNAME.github.io/open-karaoke/host.html
```

The QR code automatically builds the correct `guest.html?session=...` URL from the deployed Host page, including the repository path.

---

# Firebase setup

## 3. Create a Firebase project

1. Open Firebase Console.
2. Create a project.
3. You do not need paid hosting for this app because GitHub Pages hosts the website.

## 4. Enable Anonymous Authentication

In Firebase Console:

1. Go to **Authentication**.
2. Click **Get started**.
3. Open **Sign-in method**.
4. Enable **Anonymous**.
5. Save.

Do not skip this step. The security rules depend on `auth.uid`.

## 5. Create Realtime Database

1. Go to **Realtime Database**.
2. Click **Create Database**.
3. Choose an appropriate region.
4. Complete database creation.

You can start with temporary setup rules only long enough to finish configuration. Before real testing, publish the included `database.rules.json` rules.

## 6. Add the Firebase web app

In Firebase Project Settings:

1. Open **General**.
2. Under **Your apps**, add a Web app (`</>`).
3. Register the app.
4. Firebase shows a configuration object.

Open:

```text
js/firebase-config.js
```

Replace the placeholders with your Firebase web-app config.

Example shape:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

The Firebase web configuration is expected to be present in a browser app. Database security comes from Authentication + Security Rules, not from hiding this object.

## 7. Publish the included database rules

Open:

```text
database.rules.json
```

Copy its entire contents.

Then in Firebase Console:

1. Realtime Database
2. **Rules**
3. Replace the existing rules
4. Click **Publish**

These rules allow:

- authenticated users to check whether a session exists
- joined guests to read that room's public karaoke state
- guests to create/cancel only their own waiting reservation
- guests to update only their own presence record
- the Host Firebase UID to control the room, queue, playback state, settings, and deletion

---

# YouTube setup

## 8. Playback

Host playback uses the official YouTube IFrame Player API.

No YouTube Data API key is needed simply to play a known YouTube video ID/link through the embedded player.

The app does not download, rip, extract, or bypass YouTube restrictions.

Private, deleted, unavailable, or embedding-disabled videos may fail. The Host gets a friendly warning and can press Next.

## 9. Optional YouTube Search

Guest-side YouTube search uses YouTube Data API v3.

Without a search API key, the app still works using the **Have a YouTube link already?** reservation form.

To enable search:

1. Open Google Cloud Console for a project you control.
2. Enable **YouTube Data API v3**.
3. Create a browser API key.
4. Restrict the key to your GitHub Pages web origin/referrer.
5. Restrict the key to **YouTube Data API v3**.
6. Open:

```text
js/youtube-config.js
```

7. Replace the placeholder:

```js
export const youtubeConfig = {
  apiKey: "YOUR_RESTRICTED_BROWSER_KEY"
};
```

The browser key is sent from the browser when search is used, so HTTP-referrer and API restrictions are important.

YouTube API quotas still apply. The app searches only when the guest presses Search and caches identical searches in that browser for 10 minutes to reduce unnecessary requests.

---

# Upload configuration changes to GitHub

After editing `js/firebase-config.js`, `js/youtube-config.js`, and publishing the Firebase rules:

1. Upload/commit the changed files to GitHub.
2. Wait for GitHub Pages to publish the new commit.
3. Open the public `host.html` URL.

No npm command, build command, or local server is required.

---

# How to run a karaoke event

## Host

1. Open the GitHub Pages `host.html` URL on the laptop connected to the TV/projector.
2. Enter a 4-8 digit Host PIN.
3. Click **Create Karaoke Session**.
4. The app creates a session code and QR code.
5. Optional: click **Fullscreen**.
6. Leave the Host page open during the event.

## Guests

1. Scan the QR code.
2. Enter a singer/nickname.
3. Search for a karaoke song or use a direct YouTube link.
4. Preview if desired.
5. Tap **Reserve**.
6. The reservation appears on all connected devices in real time.

Multiple guests can join the same QR/session simultaneously.

## Start playback

On Host:

- Click **Play / Resume** when there is no current song. The first waiting reservation becomes Now Playing.
- When the video ends, the app automatically marks it completed and starts the next waiting song.
- **Next / Skip** marks the current song skipped and advances.
- **Previous** returns to the most recently completed/skipped song. If a song is currently playing, that interrupted song is placed at the front of the waiting queue.
- If no previous history exists, Previous restarts the current video from the beginning.

---

# Host PIN and recovery

The app stores:

- the Host Firebase anonymous identity using Firebase browser-local persistence
- the active Host session ID in local storage
- a salted hash of the Host PIN in local storage

If the Host refreshes/reopens the page in the same browser profile, the app can recover the same room and asks for the PIN before showing controls.

Do not clear that browser's site storage in the middle of an event. Clearing browser storage can remove the anonymous Host identity and prevent recovery of the existing Host authority.

The PIN does not transfer Host ownership to another laptop. This is intentional: Host authority is tied to the Firebase UID that created the room.

---

# Queue behavior

- New guest reservations enter as `waiting`.
- Host can reorder waiting songs with Up/Down controls.
- The current song is `playing`.
- A normally ended song becomes `completed`.
- A song advanced with Next becomes `skipped`.
- Finished records are kept temporarily so Previous works.
- **Clear Finished** deletes completed/skipped history.
- A guest can cancel only their own `waiting` item.

If the same guest needs to reserve the exact same YouTube video again later and its finished record still exists, the Host can clear finished history first.

---

# Free-tier / low-usage design

The app intentionally avoids constant polling and constant playback-position writes.

Realtime listeners are limited to room state such as:

- queue
- current song
- reservation setting
- connected guests
- Host online status

Playback position is **not** written every second.

YouTube searches happen only on demand and are cached briefly per browser.

At the end of the event, use **End & Delete Session**. This removes the entire karaoke session from Realtime Database so old queue/guest/history records do not accumulate.

Always check the current Firebase and Google API free-tier/quota policies for your own account/project. The app itself does not require a paid server or paid domain.

---

# Troubleshooting

## Host says Firebase needs setup

Check `js/firebase-config.js` and make sure no `PASTE_YOUR_...` placeholders remain.

## Permission denied

Check all three:

1. Anonymous Authentication is enabled.
2. `database.rules.json` was copied and Published in Realtime Database Rules.
3. The `databaseURL` in `firebase-config.js` exactly matches your Realtime Database.

## QR opens but session is not found

Make sure the Host has successfully created the room and the guest is opening the current QR/session code.

## Guest joins but queue cannot load

Publish the latest included Realtime Database rules. The final rules require the guest to join the session before reading its queue/settings/current-song state.

## YouTube Search is disabled

Add a valid restricted YouTube Data API v3 browser key to `js/youtube-config.js`, or use the direct-link reservation form.

## YouTube video is unavailable

Some videos are private, deleted, region-limited, or disallow embedded playback. Use another karaoke upload and press Next on the Host.

## Playback does not automatically start after a page reload

Modern browsers can block autoplay after reload. Press **Play / Resume** once on the Host. After the browser accepts user interaction, normal playback controls continue.

## Host PIN is rejected

Use the PIN originally set in that Host browser. If this is an older room created before PIN protection was added, the recovery screen lets the same Firebase Host identity create a new local PIN.

---

# Project structure

```text
open-karaoke-final/
├── index.html
├── host.html
├── guest.html
├── css/
│   └── style.css
├── js/
│   ├── firebase-config.js
│   ├── firebase.js
│   ├── guest.js
│   ├── host.js
│   ├── qr.js
│   ├── queue.js
│   ├── youtube-config.js
│   └── youtube.js
├── database.rules.json
└── README.md
```

---

## Final deployment checklist

- [ ] Files uploaded to GitHub
- [ ] GitHub Pages enabled from repository root
- [ ] Firebase Web App created
- [ ] Firebase config pasted into `js/firebase-config.js`
- [ ] Anonymous Authentication enabled
- [ ] Realtime Database created
- [ ] `database.rules.json` published
- [ ] Optional YouTube Data API v3 key added and restricted
- [ ] Host page opens from GitHub Pages
- [ ] Host creates session and QR
- [ ] Phone scans QR and joins
- [ ] Guest reservation appears on Host
- [ ] Host can reorder and play queue
- [ ] Auto-next works after video ends
- [ ] Guest sees Now Playing updates
- [ ] Host PIN works after page refresh
- [ ] End & Delete Session removes room after the event

This is the final static-web MVP architecture: GitHub Pages + Firebase + official YouTube web APIs, with no npm/build/server requirement for normal deployment or use.
