# 🛠️ WFT Helper Chrome Extension (wft-scheduler)

[![GitHub Issues](https://img.shields.io/github/issues/AAdemide/wft-scheduler)](https://github.com/AAdemide/wft-scheduler/issues)
[![GitHub Stars](https://img.shields.io/github/stars/AAdemide/wft-scheduler)](https://github.com/AAdemide/wft-scheduler/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🎥 Video Demonstration

Here is a quick video demo:  
<video src="https://github.com/user-attachments/assets/60d55877-119b-46a4-a614-3be67ddf2f90" width="300" />

---

## 📅 Project Overview

The **WFT Helper Chrome Extension** is a free, open-source tool designed to bridge the gap between The Home Depot's proprietary **Workforce Tools (WFT) scheduling portal** and your personal **Google Calendar**.

It eliminates the tedious, error-prone process of manually transferring shifts, ensuring your work and personal life are unified in a single, comprehensive view.

### ✨ Key Features

* **Unified Calendar View:** Automatically synchronizes shifts to Google Calendar, merging your work and personal life in one place.
* **Seamless Update:** Shifts are automatically updated in your calendar whenever changes occur on the WFT portal.
* **Flexible Control:** Allows users to **customize** event details (reminders, location) and securely **share or delete** the dedicated work calendar.
* **Smart Data Capture:** Uses the **`webRequest` API** to securely intercept and retrieve reliable JSON data directly from internal Home Depot API endpoints.

---

## 🔒 Security and Privacy

Security was a non-negotiable priority, especially when handling user and proprietary data.

* **Local Processing Only:** All data synchronization, token handling, and scheduling logic occurs **exclusively on the user's local device**.
* **Zero External Storage:** **No user data** (shifts, tokens, emails, or API links) is ever stored, transmitted, or logged on external servers.
* **Google OAuth:** Secure authentication is handled entirely via Google's official **OAuth flow** (`chrome.identity`).

**Read our full Privacy Policy:** [https://aademide.github.io/wft-scheduler-privacy-policy/](https://aademide.github.io/wft-scheduler-privacy-policy/)

---

## 🏗️ Technical Architecture & Refactoring

This project grew from a simple script into a robust, maintainable application through significant architectural refactoring.

### Core Technology Stack

* **Language:** Vanilla JavaScript (ES6+)
* **APIs:** Chrome Extensions API (`webRequest`, `identity`, `storage`), Google Calendar API (via `gapi.client`)

### Architectural Transition

The initial working script was refactored for **modularity** and **scalability**. We adopted the **Page Object Model (POM)** pattern—a methodology often used in automated testing—to manage the application's complex interactions with the WFT DOM and proprietary API endpoints.

This structure ensures:
1.  **Clean Separation:** UI management and complex AJAX operations are cleanly abstracted.
2.  **Maintainability:** Easier debugging and future changes without breaking the core sync logic.

---

## 🛠️ Installation (Pending Review)

The extension is currently **pending review** on the Google Chrome Web Store.

### ⬇️ Install via Chrome Web Store (Coming Soon)
***Link will be here once approved***

### 👨‍💻 Installation via Source Code (For Developers)

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/AAdemide/wft-scheduler.git](https://github.com/AAdemide/wft-scheduler.git)
    ```
2.  **Open Chrome and navigate to `chrome://extensions`**.
3.  Enable **Developer mode** and click **Load unpacked**.
4.  Select the cloned `wft-scheduler` directory.

---

## 👋 Contribution and Feedback

Feedback and contributions are highly encouraged! If you find a bug, have a feature suggestion, or would like to contribute:

1.  **Report Issues:** Open an issue on GitHub.
2.  **Submit Pull Requests:** Fork the repository and submit a PR. Please adhere to the existing POM structure.

This project is licensed under the MIT License.
