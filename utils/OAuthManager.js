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
    // if (promptConsent)
    //   url = new URLSearchParams(
    //     Object.entries({ ...this.auth_params, prompt: "consent" })
    //   );
    // else {
    url = new URLSearchParams(Object.entries(this.auth_params));
    //}
    return "https://accounts.google.com/o/oauth2/auth?" + url.toString();
  }

  storeTokenWithExpiry(token, tokenType, expiresIn) {
    chrome.storage.local.set({
      sukunaFragment: {
        token,
        tokenType,
        expiresIn: Date.now() + expiresIn * 1000,
      },
    });
  }

  async getOAuthToken(authFlowOptions) {
    const { sukunaFragment } = await chrome.storage.local.get("sukunaFragment");
    const { expiresIn, ...rest } = sukunaFragment;

    if (expiresIn > Date.now()) {
      this.expiresIn = expiresIn;
      return rest;
    }

    console.log(
      "token expired, last token timestamp:",
      sukunaFragment.expiresIn
    );
    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(authFlowOptions, (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          const error =
            chrome.runtime.lastError?.message || "Authorization failed";
          return reject(error);
        }

        const resUrl = new URL(responseUrl);
        const params = new URLSearchParams(resUrl.hash.substring(1));
        const token = params.get("access_token");
        const tokenType = params.get("token_type");
        this.expiresIn = expiresIn;
        const expiresIn = parseInt(params.get("expires_in"), 10) - 60000 * 5;
        this.expiresIn = expiresIn;

        this.storeTokenWithExpiry(token, tokenType, expiresIn);

        if (params.get("error")) return reject(params.get("error"));
        resolve({
          token,
          tokenType
        });
      });
    });
  }

  async getExpiryTimestamp() {
    if (this.expiresIn) {
      return this.expiresIn;
    }
    const { sukunaFragment } = await chrome.storage.local.get("sukunaFragment");
    return sukunaFragment.expiresIn;
  }

  getTimerTokenValid() {
    return this.timer?.getTokenValid();
  }
}
