# EVE Ratting Tracker

An Electron-based desktop analytics application for EVE Online players. It automatically syncs character wallet journal entries via the ESI API, detects ratting sessions based on activity gaps, and provides detailed historical ISK/hr metrics across single or multiple accounts.

---

## Features

* **Multi-Account Support:** Authenticate multiple characters via EVE Online SSO.
* **Automatic Session Detection:** Automatically groups bounty payouts and ESS escrow transfers into discrete ratting runs based on time gaps.
* **Expanded Run Breakdown:** Click any detected run to view per-character totals, averages, and individual payout ticks.
* **Lifetime Analytics:** Tracks total ISK earned, total transaction count, and time range recorded.
* **Portable & Lightweight:** Uses `sql.js` (WebAssembly SQLite) for fast local data persistence with zero C++ compilation dependencies.

---

## What's Included

This repository contains the complete source code as well as a pre-packaged `.zip` archive containing the exact folder structure and files required to get up and running immediately.

---

## EVE Developer Application Setup

Before running or building the app, you need to create an application in the EVE Online Developer Portal to obtain your credentials:

1. Navigate to the [EVE Online Developer Portal](https://developers.eveonline.com/).
2. Log in and click **Create New Application**.
3. Fill in the required details:
   * **Name:** `EVE Ratting Tracker` (or your preferred name)
   * **Connection Type:** `Authentication & API Access`
   * **Permissions (Scopes):** Add `esi-wallet.read_character_wallet.v1`
   * **Callback URL:** `http://localhost:5000/auth/callback`
4. Save the application and copy your **Client ID** and **Secret Key**.

---

## Setup & Configuration

### Option 1: Using the Zip File
1. Download and extract the `.zip` file from the repository.
2. Open `main.js` and paste your `CLIENT_ID` and `CLIENT_SECRET` into the top configuration section:
   ```javascript
   const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
   const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
   const REDIRECT_URI = 'http://localhost:5000/auth/callback';
   const PORT = 5000;
3. Open or create the .env file in the root folder and add your credentials as well:
   * CLIENT_ID=YOUR_CLIENT_ID_HERE
   * CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
   * REDIRECT_URI=http://localhost:5000/auth/callback
   * PORT=5000

## Running the App
1) To launch the desktop app in development/local mode -> Open Powershell as Administrator and navigate to the folder you used for the tracker.
   * npm start
2) Building the portable .exe
   * npm run build

The output of the npm run build will be within the sub directory `/dist/`.

## Data & Database Storage

All character authentication tokens, transaction records and session data are stored locally on your machine in a SQLite database file at:
    `%APPDATA%/eve-ratting-tracker/ratting_tracker.db`
