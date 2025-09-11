import * as constants from "../utils/constants.js";
import * as utils from "../utils/utils.js";

Object.assign(self, constants);
Object.assign(self, utils);

import GApiUtils from "../utils/gApiUtils.js";
import OAuthManager from "../utils/OAuthManager.js";

let port;
let thdAuthState = THD_AUTH_STATES.IDLE;
let authState = AUTH_STATES.UNAUTHENTICATED;
let apiState = API_STATES.IDLE;
let lastReceivedHeaderTimer;
let fetchedJsons = {};
const gapi = new GApiUtils();
const oathManager = new OAuthManager();

let urls = {
  details: "",
  userDetails: "",

  detailsMatch: (url) => regexp.detailsRegExp.test(url),
  userDetailsMatch: (url) => regexp.userDetailsRegExp.test(url),

  async gottenAllUrls() {
    const result = this.details !== "" && this.userDetails !== "";

    if (result) {
      chrome.storage.session.set({
        urls: {
          details: this.details,
          userDetails: this.userDetails,
        },
      });
    } else {
      const myUrls = await chrome.storage.session.get("urls");
      if (myUrls?.urls?.details) {
        this.details = myUrls.urls.details;
        this.userDetails = myUrls.urls.userDetails;
        return true;
      }
    }
    return result;
  },

  clearAllUrls() {
    this.details = "";
    this.userDetails = "";
  },
};

function userDataFetched() {
  return fetchedJsons.userDetails?.firstName;
}

function updateAuthState(state, message) {
  thdAuthState = state;
  sendMessage(message);
}

async function fetchAllJson() {
  console.log(urls.details, urls.userDetails);
  const results = await Promise.all([
    fetch(urls.details),
    fetch(urls.userDetails),
  ]);

  return Promise.all(
    results.map(async (res, idx) => {
      if (res.ok) {
        return res.json();
      } else {
        console.error(`Failed to fetch ${urls[idx]} - Status: ${res.status}`);
        return null;
      }
    })
  );
}
// checks if workforce has been authenticated, if so get the user data
async function fetchUserData(fromHeaderCallback) {
  // since the background script is polled only run the function if the authentication has begun.
  // if (thdAuthState == THD_AUTH_STATES.AUTHENTICATING) return;
  try {
    if (userDataFetched()) {
      updateAuthState(THD_AUTH_STATES.AUTH_SUCCESS, {
        fetchedJsons: "success",
      });
      return true;
    }
    updateAuthState(THD_AUTH_STATES.AUTHENTICATING, {
      fetchedJsons: "pending",
    });

    const urlsReady = await urls.gottenAllUrls();
    const headerTimeout = Date.now() - lastReceivedHeaderTimer > 5000;

    if (urlsReady) {
      const [details, userDetails] = await fetchAllJson([
        fetch(urls.details),
        fetch(urls.userDetails),
      ]);

      if (!details || !userDetails) {
        updateAuthState(THD_AUTH_STATES.AUTH_FAILED, {
          fetchedJsons: "failed",
        });
        return false;
      }

      fetchedJsons = {
        details,
        userDetails,
      };
      updateAuthState(THD_AUTH_STATES.AUTH_SUCCESS, {
        fetchedJsons: "success",
      });
      return true;
    }

    if (!fromHeaderCallback || headerTimeout) {
      updateAuthState(THD_AUTH_STATES.AUTH_FAILED, { fetchedJsons: "failed" });
      return false;
    }
  } catch (err) {
    updateAuthState(THD_AUTH_STATES.AUTH_FAILED, {
      nextPage: Pages.INSTRUCTIONS,
    });
    urls.clearAllUrls();
    console.warn(err);
    return false;
  }
  return false;
}

async function authenticate() {
  // if(this.authState == AUTH_STATES.AUTHENTICATING) {
  //     return;
  // }
  authState = AUTH_STATES.AUTHENTICATING;
  try {
    const promptConsent =
      (authState == AUTH_STATES.AUTH_FAILED ||
        authState == AUTH_STATES.AUTHENTICATING) ??
      false;
    const authFlowOptions = {
      url: oathManager.getOAuthURL(promptConsent),
      interactive: true,
    };
    const { token, expiresIn, tokenType } = await getOAuthToken(
      authFlowOptions
    );
    gapi.setAuthorizationHeader(tokenType, token);
    oathManager.setTimer(new TokenTimer(expiresIn - 10));
    authState = AUTH_STATES.AUTH_SUCCESS;
  } catch (error) {
    console.error("OAuth error:", error);
    authState = AUTH_STATES.AUTH_FAILED;
  }
}

async function updateCalendar() {
  // update button will be disabled until fetchedJson is filled
  // we need to tell the user how to get the most up to date info

  function fetchAll(urls, method) {
    return Promise.all(
      urls.map(({ url, payload }) => {
        const body = payload ? JSON.stringify(payload) : "";
        console.log("url", url);
        console.log("body", body);
        return fetch(url, {
          ...this.globalInit,
          method,
          body,
        })
          .then((res) => {
            if (res.ok) {
              console.log(res.status);
              return method == "PUT" ? res.json() : res.text();
            }
            throw new Error(res.text());
          })
          .then((data) => {
            console.log(method, " success");
            console.log(data);
          })
          .catch((err) => {
            console.log(method);
            console.warn(err);
          });
      })
    );
  }

  fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${this.calId}/events`,
    {
      ...globalInit,
    }
  )
    .then((res) => {
      if (res.ok) {
        return res.json();
      }
      throw new Error(res.status);
    })
    .then((data) => {
      const events = parseDiff(
        data,
        fetchedJsons.details,
        fetchedJsons.userDetails.timeZoneCode
      );

      console.log(events);

      // addEventsToCalendar(events["POST"], calId);
      console.log(calId, events["PUT"][0]);
      fetchAll(
        events["DELETE"].map((eventId) => ({
          url: `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`,
        })),
        "DELETE"
      );
      fetchAll(
        events["PUT"].map(({ payload, eventId }) => ({
          url: `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`,
          payload,
        })),
        "PUT"
      );
    })
    .catch((err) => {
      console.warn(err);
    });
}

const onHeadersReceivedCallback = async (details) => {
  lastReceivedHeaderTimer = Date.now();
  const currUrl = details.url;

  //BUG: error in console when wft logs out url start from identity.homedepot.com/idp [exact redirect url: https://identity.homedepot.com/idp/DRON2_2tHsN/resume/idp/startSLO.ping]

  fetchUserData(true);

  if (urls.detailsMatch(currUrl)) urls.details = currUrl;
  else if (urls.userDetailsMatch(currUrl)) {
    urls.userDetails = currUrl;
  }
  chrome.storage.sync.set({ refreshTimeElapsed: Date.now() });
  sendMessage({ updateRefresh: true });
};

chrome.webRequest.onHeadersReceived.addListener(
  onHeadersReceivedCallback,
  filter,
  []
);
const onMessageCallback = (req, _, sendResponse) => {
  sendResponse({ awake: true });
  chrome.runtime.onConnect.addListener((p) => {
    port = p;
    port.onMessage.addListener(handleMessage);

    // first thing's first check if google api has been authenticated
    if (!oathManager.getTimerTokenValid()) authenticate();
    fetchUserData();
  });
};
chrome.runtime.onMessage.addListener(onMessageCallback);

function handleMessage(message, sender) {
  const genericHandler = async (event) => {
    const actions = {
      addEvents: async () => {
        apiState = API_STATES.WAITING;
        sendMessage({ nextPage: Pages.LOADING });

        const body = {
          summary: `${fetchedJsons.userDetails.firstName ?? ""} ${
            fetchedJsons.userDetails.lastName ?? ""
          }'s WFT Calendar`,
          description: "A calendar of your work schedule at The Home Depot",
        };
        try {
          chrome.storage.sync.set({ "WFT-Scheduler Calendar ID": await gapi.makeCalendar(body) });
          const calOptions = {
            id: gapi.getCalId(),
            backgroundColor: "#F96302",
            foregroundColor: "#FFFFFF",
            defaultReminders: {
              method:
                message?.formData?.method || constants.defaultReminder.method,
              minutes:
                message?.formData?.minutes || constants.defaultReminder.minutes,
            },
          };
          gapi.addToCalendarList(calOptions);
        } catch (error) {
          console.warn(error);
          apiState = API_STATES.FAILED;
          sendMessage({ nextPage: Pages.INSTRUCTIONS });
        }
        const addEventSuccess = await gapi.addEventsToCalendar(
          parseDays(
            fetchedJsons.details.days,
            message.formData.location,
            fetchedJsons.userDetails.timeZoneCode
          )
        );

        console.log(addEventSuccess);
        if (addEventSuccess) {
          apiState = API_STATES.SUCCESS;
          sendMessage({
            nextPage: Pages.CALENDAR,
            fetchedJsons: fetchedJsons.userDetails?.firstName != undefined,
          });
        } else {
          apiState = API_STATES.FAILED;
          sendMessage({ nextPage: Pages.INSTRUCTIONS });
        }
      },
      delCal: async () => {
        apiState = API_STATES.WAITING;
        sendMessage({ nextPage: Pages.LOADING });
        if(!gapi.getCalId) {
          gapi.setCalId(message.calId);
        }
        const deleteCalendarSuccess = await gapi.deleteCalendar();
        if (deleteCalendarSuccess) {
          apiState = API_STATES.SUCCESS;
          chrome.storage.sync.remove("WFT-Scheduler Calendar ID");
          if (fetchedJsons.userDetails?.firstName) {
            sendMessage({ nextPage: Pages.INSTRUCTIONS });
          } else {
            sendMessage({ nextPage: Pages.FORM });
          }
        } else {
          apiState = API_STATES.FAILED;
          sendMessage({ nextPage: Pages.INSTRUCTIONS });
        }
      },
      shareButtonClicked: async () => {
        this.apiState = API_STATES.WAITING;
        sendMessage({ shareButtonHandled: API_STATES.WAITING });
        const shareCalendarSuccess = await shareCalendar(
          message.shareButtonClicked.email,
          message.shareButtonClicked.calId
        );

        if (shareCalendarSuccess) {
          sendMessage({ shareButtonHandled: API_STATES.SUCCESS });
        } else {
          sendMessage({ shareButtonHandled: API_STATES.FAILED });
        }
      },
      updateButtonClicked: () => {
        updateCalendar(message.updateButtonClicked.calId);
      },
    };

    if (timer?.tokenValid() && authState == AUTH_STATES.AUTH_SUCCESS) {
      try {
        actions[event]();
      } catch (error) {
        console.error(error);
      }
    }
  };
  const handlers = {
    makeIdle: () => (apiState = API_STATES.IDLE),
    addEvents: () => genericHandler("addEvents"),
    delCal: () => genericHandler("delCal"),
    shareButtonClicked: () => genericHandler("shareButtonClicked"),
    updateButtonClicked: () => {
      genericHandler("updateButtonClicked");
    },
  };
  // const {questionReady} = message;
  //handle questionReady
  const reqKeys = Object.keys(message);

  // if there are valid handler functions call them and return the function
  reqKeys.forEach((reqKey) => {
    if (handlers[reqKey]) {
      console.log(reqKey);
      handlers[reqKey]();
    }
  });
}
function sendMessage(message) {
  try {
    port.postMessage(message);
    return;
  } catch (error) {
    console.warn("Port send failed", port);
  }
}
