export const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const defaultReminder = [
  {
    method: "popup",
    minutes: 60,
  },
];

const auth_params = {
  client_id: chrome.runtime.getManifest().oauth2.client_id,
  redirect_uri: chrome.identity.getRedirectURL(),
  response_type: "token",
  scope: "https://www.googleapis.com/auth/calendar",
};
export function getAuthURL(promptConsent = false) {
  let url;
  if (promptConsent)
    url = new URLSearchParams(
      Object.entries({ ...auth_params, prompt: "consent" })
    );
  else {
    url = new URLSearchParams(Object.entries(auth_params));
  }
  return "https://accounts.google.com/o/oauth2/auth?" + url.toString();
}
export const regexp = {
  wftURL: /https:\/\/wft.homedepot.com\/*/,
  summaryRegExp:
    /https:\/\/wft.homedepot.com\/missioncontrol\/v1\/timecards\/([0-9]+)\/summary*/,
  detailsRegExp:
    /https:\/\/wft.homedepot.com\/missioncontrol\/v1\/schedule\/([0-9]+)\/details*/,
  weeklyRegExp:
    /https:\/\/wft.homedepot.com\/missioncontrol\/v1\/timecards\/([0-9]+)\/weekly*/,
  userDetailsRegExp: /https:\/\/wft.homedepot.com\/missioncontrol\/v1\/user\/details*/,
};

export const filter = { urls: ["https://wft.homedepot.com/*"] };
