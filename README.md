# 🛒 Shopping List Voice App

A voice-powered shopping list app that reads and writes to your Google Sheet ("Notes and list" → List tab, column A).

---

## Deploy to Vercel (Free, ~3 minutes)

### Option A — Drag & Drop (Easiest)
1. Go to [vercel.com](https://vercel.com) and sign up / log in (free)
2. From the dashboard, click **"Add New Project"**
3. Choose **"Deploy from your computer"** or drag this entire folder into the Vercel deploy box
4. Vercel auto-detects it as a React app — click **Deploy**
5. In ~60 seconds you get a URL like: `https://shopping-list-abc123.vercel.app`

### Option B — Via GitHub
1. Upload this folder to a GitHub repo
2. On Vercel, click **"Import Git Repository"** and select it
3. Deploy — done

---

## Set Up Google Assistant Auto-Launch

Once deployed, your app URL will be something like:
`https://your-app-name.vercel.app`

**For auto-mic activation**, use this URL:
`https://your-app-name.vercel.app?listen=1`

### Add to Android Home Screen
1. Open the `?listen=1` URL in **Chrome** on your Android
2. Tap the **3-dot menu** → **"Add to Home Screen"**
3. Name it **"Shopping List"** → tap Add

### Create Google Assistant Routine
1. Open **Google Home** app → tap your profile → **Assistant Settings**
2. Go to **Routines** → **+** (Add routine)
3. **When:** type `add to my shopping list`
4. **Action:** Open app → select the **Shopping List** shortcut
5. Save

Now say **"Hey Google, add to my shopping list"** and the app opens with the mic already listening!

---

## How to Use

| Say... | What happens |
|--------|-------------|
| "Add milk and eggs" | Appends both to your Google Sheet |
| "I need coffee and bread" | Adds both items |
| "Read my list" | Shows + reads aloud all items |
| "What's on my list" | Same as above |

---

## Notes
- Uses Chrome's built-in speech recognition (works best in Chrome on Android)
- Requires your Google Drive MCP connection to be active in Claude.ai
- The app calls the Anthropic API directly — make sure you're logged into Claude.ai when using it
