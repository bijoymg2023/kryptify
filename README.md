# Zero-Knowledge File Integrity Monitor

A 100% Client-Side Web Application that detects unauthorized file modifications, additions, and deletions using advanced in-browser Cryptography. 

This project implements core **Cybersecurity / SIEM** concepts (File Integrity Monitoring) but runs entirely within an isolated browser session, ensuring maximum privacy. 

![FIM Dashboard](https://raw.githubusercontent.com/bijoymg2023/File_Integrity_Monitor/main/screenshot.png) *(Note: screenshot placeholder)*

## 🔒 Zero-Knowledge Architecture

Unlike traditional FIM tools that require you to install Python agents and beam your private file hashes up to a Cloud Database:

1. **Zero Installation**: There is no backend, no database, and no Python script to run. You just double-click the HTML file.
2. **Native Local Access**: Uses the modern HTML5 `window.showDirectoryPicker()` to securely read your local folders directly into the browser tab.
3. **In-Browser WebCrypto**: Uses your local device's CPU to natively compute **SHA-256** cryptographic hashes of your files via `crypto.subtle.digest()`.
4. **Session-Only Memory**: 100% of your file paths, contents, and hashes are stored exclusively in the browser's active RAM. 
5. **Absolute Privacy**: The exact second you close the browser tab, all data ceases to exist. **Not a single byte of data is ever sent over the internet or saved to a server.**

## 🚀 How to Use

*(Requires a Chromium-based browser: Google Chrome, Microsoft Edge, Brave, or Opera)*

1. Clone this repository or download the ZIP.
   ```bash
   git clone https://github.com/bijoymg2023/File_Integrity_Monitor.git
   ```
2. Open the `File_Integrity_Monitor` folder in your file explorer.
3. Double-click `index.html` to open it in your browser.
4. Click **📁 Select Local Folder**.
5. Your browser will prompt you to grant permission to "View files in this folder". Click Allow.
6. The app instantly hashes all files in that folder and establishes a **Baseline** in RAM.
7. Modify any file in that folder using a text editor.
8. Switch back to the browser and click **🔍 Run Integrity Scan**.
9. The in-memory change detection engine will immediately flag the breached file!

## 🛠️ Technology Stack
* Pure HTML5 & Semantic markup
* Pure Vanilla CSS (Glassmorphism Dark Mode)
* Pure Vanilla JavaScript (ES6+ async/await)
* File System Access API
* WebCrypto API (`SHA-256`)

## ⚠️ Browser Support Limitation
Because this project utilizes the highly secure File System Access API to read local directories without an upload dialog, it is currently supported by **Chromium browsers only**. Safari and Firefox block websites from reading local folder structures natively for security reasons.
