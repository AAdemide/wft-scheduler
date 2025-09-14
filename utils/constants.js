export const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

// REMOVABLE?
export const defaultReminder = [
  {
    method: "popup",
    minutes: 60,
  },
];

//rename to sm like homedepotApiRegexp
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
// Regex to validate gmail/googlemail
export const emailRegex = /^[a-zA-Z0-9._%+~-]+@(gmail\.com|googlemail\.com)$/;

export const AUTH_STATES = {
  UNAUTHENTICATED: "unauthenticated",
  AUTHENTICATING: "authenticating",
  AUTH_FAILED: "auth_failed",
  AUTH_SUCCESS: "auth_success",
};

export const THD_AUTH_STATES = {
  IDLE: "idle",
  AUTHENTICATING: "authenticating",
  AUTH_FAILED: "auth_failed",
  AUTH_SUCCESS: "auth_success",
};

export const API_STATES = {
  FAILED: "failed",
  SUCCESS: "success",
  WAITING: "waiting",
  IDLE: "idle",
};

export const filter = { urls: ["https://wft.homedepot.com/*"] };

export const Pages = {
  FORM: "form",
  CALENDAR: "calendar",
  INSTRUCTIONS: "instructions",
  LOADING: "loading",
  FAILED: "failed",
};