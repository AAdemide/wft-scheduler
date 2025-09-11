export default class OAuthManager {
  constructor() {
    this.auth_params = {
      client_id: chrome.runtime.getManifest().oauth2.client_id,
      redirect_uri: chrome.identity.getRedirectURL(),
      response_type: "token",
      scope: "https://www.googleapis.com/auth/calendar",
    };
  }
  getOAuthURL(promptConsent = false) {
    let url;
    if (promptConsent)
      url = new URLSearchParams(
        Object.entries({ ...this.auth_params, prompt: "consent" })
      );
    else {
      url = new URLSearchParams(Object.entries(this.auth_params));
    }
    return "https://accounts.google.com/o/oauth2/auth?" + url.toString();
  }

  getOAuthToken(authFlowOptions) {
    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(authFlowOptions, (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          const error =
            chrome.runtime.lastError?.message || "Authorization failed";
          return reject(error);
        }

        const resUrl = new URL(responseUrl);
        const params = new URLSearchParams(resUrl.hash.substring(1));

        if (params.get("error")) return reject(params.get("error"));
        resolve({
          token: params.get("access_token"),
          tokenType: params.get("token_type"),
          expiresIn: parseInt(params.get("expires_in"), 10),
        });
      });
    });
  }

  createTimer(expiresIn) {
    this.timer = new TokenTimer(expiresIn);
  }

  setTimer(timer) {
    this.timer = timer;
    this.timer.startTimer();
  }

  startTimer(){
    this.timer.startTimer()
  }

  getTimerTokenValid() {
    return this.timer?.getTokenValid();
  }
}

class TokenTimer {
  constructor(stopTime) {
    this.currentTime = 0;
    this.stopTime = stopTime;
    (this.startTimer = () => {
      const intervalId = setInterval(() => {
        this.currentTime++;
      }, 1000);
      if (stopTime < this.currentTime) {
        clearInterval(intervalId);
      }
    }),
      (this.getTokenValid = () => this.stopTime > this.currentTime);
  }
}
