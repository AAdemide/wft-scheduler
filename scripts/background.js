import * as constants from "../utils/constants.js";
import * as utils from "../utils/utils.js";

Object.assign(self, constants);
Object.assign(self, utils);

import GApiUtils from "../utils/gApiUtils.js";
import OAuthManager from "../utils/OAuthManager.js";

try {
  let port;
  let thdAuthState = THD_AUTH_STATES.IDLE;
  let authState = AUTH_STATES.UNAUTHENTICATED;
  let apiState = API_STATES.IDLE;
  let lastReceivedHeaderTimer;
  let fetchedJsons = {};
  const gapi = new GApiUtils();
  const oauthManager = new OAuthManager();

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
          fetchedJsons: THD_AUTH_STATES.AUTH_SUCCESS,
        });
        return true;
      }
      updateAuthState(THD_AUTH_STATES.AUTHENTICATING, {
        fetchedJsons: THD_AUTH_STATES.AUTHENTICATING,
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
            fetchedJsons: THD_AUTH_STATES.AUTH_FAILED,
          });
          return false;
        }

        fetchedJsons = {
          details,
          userDetails,
        };
        updateAuthState(THD_AUTH_STATES.AUTH_SUCCESS, {
          fetchedJsons: THD_AUTH_STATES.AUTH_SUCCESS,
        });
        return true;
      }

      if (!fromHeaderCallback || headerTimeout) {
        updateAuthState(THD_AUTH_STATES.AUTH_FAILED, {
          fetchedJsons: THD_AUTH_STATES.AUTH_FAILED,
        });
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
        url: oauthManager.getOAuthURL(promptConsent),
        interactive: true,
      };
      const { token, tokenType } = await oauthManager.getOAuthToken(
        authFlowOptions
      );
      gapi.setAuthorizationHeader(tokenType, token);
      authState = AUTH_STATES.AUTH_SUCCESS;
    } catch (error) {
      console.error("OAuth error:", error);
      authState = AUTH_STATES.AUTH_FAILED;
    }
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
  const onMessageCallback = (_req, _, sendResponse) => {
    sendResponse({ awake: true });
    chrome.runtime.onConnect.addListener(async (p) => {
      port = p;
      port.onMessage.addListener(handleMessage);
      // first thing's first check if google api has been authenticated
      authenticate();
      fetchUserData();
      return true;
    });
  };
  chrome.runtime.onMessage.addListener(onMessageCallback);

  function handleMessage(message, _sender) {
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
            chrome.storage.sync.set({
              "WFT-Scheduler Calendar ID": await gapi.makeCalendar(body),
            });
            const calOptions = {
              id: gapi.getCalId(),
              backgroundColor: "#F96302",
              foregroundColor: "#FFFFFF",
              defaultReminders: {
                method:
                  message?.formData?.method || constants.defaultReminder.method,
                minutes:
                  message?.formData?.minutes ||
                  constants.defaultReminder.minutes,
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
              // fetchedJsons.userDetails.timeZoneCode
            )
          );

          console.log(addEventSuccess);
          if (addEventSuccess) {
            apiState = API_STATES.SUCCESS;
            sendMessage({
              nextPage: Pages.CALENDAR,
              fetchedJsons: userDataFetched(),
            });
          } else {
            apiState = API_STATES.FAILED;
            sendMessage({ nextPage: Pages.INSTRUCTIONS });
          }
        },
        delCal: async () => {
          console.log("delete button clicked");
          apiState = API_STATES.WAITING;
          sendMessage({ nextPage: Pages.LOADING });
          if (!gapi.getCalId()) {
            gapi.setCalId(message.calId);
          }
          const deleteCalendarSuccess = await gapi.deleteCalendar();
          if (deleteCalendarSuccess) {
            apiState = API_STATES.SUCCESS;
            chrome.storage.sync.remove("WFT-Scheduler Calendar ID");
            if (userDataFetched()) {
              sendMessage({ nextPage: Pages.FORM });
            } else {
              sendMessage({ nextPage: Pages.INSTRUCTIONS });
            }
          } else {
            apiState = API_STATES.FAILED;
            sendMessage({ nextPage: Pages.INSTRUCTIONS });
          }
        },
        shareButtonClicked: async () => {
          this.apiState = API_STATES.WAITING;
          sendMessage({ shareButtonHandled: API_STATES.WAITING });
          gapi.setCalId(message.shareButtonClicked.calId);
          const shareCalendarSuccess = await gapi.shareCalendar(
            message.shareButtonClicked.email
          );

          if (shareCalendarSuccess) {
            sendMessage({ shareButtonHandled: API_STATES.SUCCESS });
          } else {
            sendMessage({ shareButtonHandled: API_STATES.FAILED });
          }
        },
        updateButtonClicked: async () => {
          this.apiState = API_STATES.WAITING;
          sendMessage({ updateButtonClicked: API_STATES.WAITING });
          if (!gapi.getCalId()) {
            gapi.setCalId(message.updateButtonClicked.calId);
          }
          console.log(fetchedJsons.userDetails);
          const updateCalendarSuccess = await gapi.updateCalendar(fetchedJsons.details);

          if(updateCalendarSuccess) {
            sendMessage({ updateButtonClicked: API_STATES.SUCCESS });
          } else  {
            sendMessage({ updateButtonClicked: API_STATES.FAILED });
          }
        },
      };

      // console.log(oauthManager.getTimerTokenValid())
      const tokenValid = await oauthManager.getTokenValid();
      if (!tokenValid) {
        await authenticate();
      }
      try {
        actions[event]();
      } catch (error) {
        console.error(error);
      }
    };

    const handlers = {
      makeIdle: () => (apiState = API_STATES.IDLE),
      addEvents: () => genericHandler("addEvents"),
      delCal: () => genericHandler("delCal"),
      shareButtonClicked: () => genericHandler("shareButtonClicked"),
      updateButtonClicked: () => genericHandler("updateButtonClicked"),
    };
    // const {questionReady} = message;
    //handle questionReady
    const reqKeys = Object.keys(message);

    // if there are valid handler functions call them and return the function
    reqKeys.forEach((reqKey) => {
      if (handlers[reqKey]) {
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
} catch (e) {
  console.warn(e);
}
