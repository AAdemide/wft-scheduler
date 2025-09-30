export default class OAuthManager {
  constructor() {
    this.auth_params = {
      client_id: chrome.runtime.getManifest().oauth2.client_id,
      redirect_uri: chrome.identity.getRedirectURL(),
      response_type: "token",
      scope: "https://www.googleapis.com/auth/calendar openid email profile",
    };
  }
  async getOAuthURL() {
    let url;
    const options = { ...this.auth_params };
    try {
      const selectAccount = (
        await chrome.storage.session.get("wft-scheduler-oauth-prompt")
      )["wft-scheduler-oauth-prompt"];

      if (!selectAccount) {
        options.prompt = "select_account";
        // chrome.storage.session.set({"wft-scheduler-oauth-prompt": "account_selected"});
      }

      url = new URLSearchParams(Object.entries(options));
      return `https://accounts.google.com/o/oauth2/auth?${url.toString()}`;
    } catch (error) {
      console.log(error);
    }
  }

  storeTokenWithExpiry(token, tokenType, expiresIn) {
    chrome.storage.local.set({
      sukunaFragment: {
        token,
        tokenType,
        expiresIn: expiresIn,
      },
    });
  }

  async getOAuthToken(authFlowOptions) {
    const { sukunaFragment } = await chrome.storage.local.get("sukunaFragment");

    if (sukunaFragment?.expiresIn > Date.now()) {
      this.expiresIn = sukunaFragment.expiresIn;
      return sukunaFragment;
    } else {
      console.log("poop")
    }

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        authFlowOptions,
        async (responseUrl) => {
          if (chrome.runtime.lastError || !responseUrl) {
            const error =
              chrome.runtime.lastError?.message || "Authorization failed";
            return reject(error);
          }

          const resUrl = new URL(responseUrl);
          const params = new URLSearchParams(resUrl.hash.substring(1));
          const token = params.get("access_token");
          const tokenType = params.get("token_type");
          const expiresInMillis = (parseInt(params.get("expires_in"), 10) * 1000);
          console.log(expiresInMillis)
          const expiresIn = Date.now() + expiresInMillis;
          console.log(expiresIn)

          // await callback(tokenType, token, expiresIn);

          if (params.get("error")) return reject(params.get("error"));
          return resolve({
            token,
            tokenType,
            expiresIn,
          });
        }
      );
    });
  }

  async getExpiryTimestamp() {
    if (this.expiresIn) {
      return this.expiresIn;
    }
    const { sukunaFragment } = await chrome.storage.local.get("sukunaFragment");
    return sukunaFragment.expiresIn;
  }

  async getTokenValid(expiresIn) {
    if (!expiresIn) {
      expiresIn = this.expiresIn ?? (await this.getExpiryTimestamp());
    }
    return Date.now() <= expiresIn - 60000 * 5;
  }
}
