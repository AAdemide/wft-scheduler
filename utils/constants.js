export const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const defaultReminder = [
  {
    method: "popup",
    minutes: 60,
  },
];

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