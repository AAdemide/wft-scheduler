import * as constants from "../utils/constants.js";
import * as utils from "../utils/utils.js";

Object.assign(self, constants);
Object.assign(self, utils);

import GApiUtils from "../utils/gApiUtils.js";
import OAuthManager from "../utils/OAuthManager.js";

  let port;
  let thdAuthState = THD_AUTH_STATES.IDLE;
  let authState = AUTH_STATES.UNAUTHENTICATED;
  let lastReceivedHeaderTimer;
  let fetchedJsons = {};
  const gapi = new GApiUtils();
  const oauthManager = new OAuthManager();

  let urls = {
    details: "",
    userDetails: "",

    detailsMatch: (url) => regexp.detailsRegExp.test(url),
    userDetailsMatch: (url) => regexp.userDetailsRegExp.test(url),

    gottenAllUrls() {
      const result = this.details !== "" && this.userDetails !== "";

      if (result) {
        chrome.storage.session.set({
          urls: {
            details: this.details,
            userDetails: this.userDetails,
          },
        });
      }
      return result;
    },

    clearAllUrls() {
      this.details = "";
      this.userDetails = "";
    },
  };

  async function getUrlsFromStorage() {
    const myUrls = await chrome.storage.session.get("urls");
    if (myUrls?.urls?.details) {
      urls.details = myUrls.urls.details;
      urls.userDetails = myUrls.urls.userDetails;
    }
  }

  getUrlsFromStorage();

  function userDataFetched() {
    return !!fetchedJsons.userDetails?.firstName;
  }

  async function fetchAllJson() {
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
    console.log(url)
    thdAuthState = constants.THD_AUTH_STATES.AUTHENTICATING;
    const headerTimeout = Date.now() - lastReceivedHeaderTimer > 5000;

    if (fromHeaderCallback && headerTimeout) {
      thdAuthState = constants.THD_AUTH_STATES.FAILED;
      return false;
    }

    const [details, userDetails] = await fetchAllJson([
      fetch(urls.details),
      fetch(urls.userDetails),
    ]);

    if (!details || !userDetails) {
      thdAuthState = constants.THD_AUTH_STATES.AUTH_FAILED;
      return false;
    }

    fetchedJsons = {
      details,
      userDetails,
    };
    thdAuthState = constants.THD_AUTH_STATES.AUTH_SUCCESS;
    return true;
  }

  async function authenticate() {
    if (authState == AUTH_STATES.AUTHENTICATING) {
      return;
    }
    authState = AUTH_STATES.AUTHENTICATING;
    try {
      const authFlowOptions = {
        url: await oauthManager.getOAuthURL(),
        interactive: true,
      };

      //I can pass in current email here
      const { tokenType, token, expiresIn } = (await oauthManager.getOAuthToken(
        authFlowOptions
      )) || {};

      const calUserEmail = (await chrome.storage.sync.get(
        "WFT-Scheduler Calendar userEmail"
      ))["WFT-Scheduler Calendar userEmail"];

      const userEmail =
        (await gapi.fetchUserEmail({
          headers: {
            Authorization: `${tokenType} ${token}`,
          },
        })) || {};
      if (typeof calUserEmail == "string" && calUserEmail != userEmail) {
        console.log("failed")
        authState = AUTH_STATES.AUTH_FAILED;
        return {
          authenticateSuccess: false,
          modalMessage: `You have signed in with the wrong email, please use ${calUserEmail}`,
        };
      }
      oauthManager.expiresIn = expiresIn;
      oauthManager.storeTokenWithExpiry(token, tokenType, expiresIn);
      gapi.setAuthorizationHeader(tokenType, token);
      authState = AUTH_STATES.AUTH_SUCCESS;
      console.log("success");
      return { authenticateSuccess: true };
    } catch (error) {
      console.warn("OAuth error:", error);
      authState = AUTH_STATES.AUTH_FAILED;
      return {
        authenticateSuccess: false,
        modalMessage:
          "There was an error in the authentication of your google account please try again",
      };
    }
  }

  const onHeadersReceivedCallback = ({ url }) => {
    console.log(url)
    lastReceivedHeaderTimer = Date.now();
    //BUG: error in console when wft logs out url start from identity.homedepot.com/idp [exact redirect url: https://identity.homedepot.com/idp/DRON2_2tHsN/resume/idp/startSLO.ping]

    if (
      thdAuthState == constants.THD_AUTH_STATES.IDLE &&
      !userDataFetched() &&
      urls.gottenAllUrls()
    ) {
      sendMessage({
        fetchedJsons: THD_AUTH_STATES.AUTHENTICATING,
      });
      fetchUserData(true).then(() => {
        if (thdAuthState === THD_AUTH_STATES.AUTH_SUCCESS) {
          sendMessage({
            fetchedJsons: THD_AUTH_STATES.AUTH_SUCCESS,
          });
        } else if (thdAuthState === THD_AUTH_STATES.AUTH_FAILED) {
          sendMessage({
            fetchedJsons: THD_AUTH_STATES.AUTH_FAILED,
          });
        }
        thdAuthState = constants.THD_AUTH_STATES.IDLE;
      });
    }

    if (urls.detailsMatch(url)) urls.details = url;
    else if (urls.userDetailsMatch(url)) {
      urls.userDetails = url;
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

      try {
              await getUrlsFromStorage();

      if (userDataFetched() && urls.gottenAllUrls()) {
        sendMessage({
          fetchedJsons: THD_AUTH_STATES.AUTH_SUCCESS,
        });
      } else if (!userDataFetched() && urls.gottenAllUrls()) {
        sendMessage({ fetchedJsons: THD_AUTH_STATES.AUTHENTICATING });
        const fetchUserDataSuccess = await fetchUserData();

        if (fetchUserDataSuccess) {
          sendMessage({
            fetchedJsons: THD_AUTH_STATES.AUTH_SUCCESS,
          });
        } else {
          sendMessage({
            fetchedJsons: THD_AUTH_STATES.AUTH_FAILED,
          });
        }
      } else {
        console.log(urls)
        sendMessage({
          fetchedJsons: THD_AUTH_STATES.AUTH_FAILED,
        });
      }

      const { authenticateSuccess, modalMessage } =
        (await authenticate()) || {};
      if (authenticateSuccess == false) {
        sendMessage({ openModal: true, modalMessage });
      }
      return true;
      } catch (error) {
        console.log(error)
      }


    });
  };
  chrome.runtime.onMessage.addListener(onMessageCallback);

  function handleMessage(message, _sender) {
    const genericHandler = async (event) => {
      const actions = {
        addEvents: async () => {
          sendMessage({ nextPage: Pages.LOADING });

          const body = {
            summary: `${fetchedJsons.userDetails.firstName ?? ""} ${
              fetchedJsons.userDetails.lastName ?? ""
            }'s WFT Calendar`,
            description: "A calendar of your work schedule at The Home Depot",
          };
          try {
            const userEmail = await gapi.fetchUserEmail();
            console.log(userEmail)
            // set email of user too
            chrome.storage.sync.set({
              "WFT-Scheduler Calendar userEmail": userEmail,
            });
            chrome.storage.sync.set({
              "WFT-Scheduler Calendar ID": await gapi.makeCalendar(body)});
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
            sendMessage({ nextPage: Pages.INSTRUCTIONS });
          }
          const addEventSuccess = await gapi.addEventsToCalendar(
            parseDays(
              JSON.parse(JSON.stringify(fetchedJsons.details.days)),
              message.formData.location
              // fetchedJsons.userDetails.timeZoneCode
            )
          );

          console.log(addEventSuccess);
          if (addEventSuccess) {
            sendMessage({
              nextPage: Pages.CALENDAR,
              fetchedJsons: userDataFetched(),
            });
          } else {
            sendMessage({ nextPage: Pages.INSTRUCTIONS });
          }
        },
        delCal: async () => {
          sendMessage({ nextPage: Pages.LOADING });
          if (!gapi.getCalId()) {
            gapi.setCalId(message.calId);
          }
          const deleteCalendarSuccess = await gapi.deleteCalendar();
          if (deleteCalendarSuccess) {
            chrome.storage.sync.remove("WFT-Scheduler Calendar ID");
            chrome.storage.sync.remove("WFT-Scheduler Calendar userEmail");
            if (userDataFetched()) {
              sendMessage({ nextPage: Pages.FORM });
            } else {
              sendMessage({ nextPage: Pages.INSTRUCTIONS });
            }
          } else {
            sendMessage({ openModal: true, modalMessage: "Delete Failed" });
          }
        },
        shareButtonClicked: async () => {
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
          sendMessage({ updateButtonClicked: API_STATES.WAITING });
          if (!gapi.getCalId()) {
            gapi.setCalId(message.updateButtonClicked.calId);
          }
          const updateCalendarSuccess = await gapi.updateCalendar(
            JSON.parse(JSON.stringify(fetchedJsons.details.days))
          );
          // fetchedJsons = {}

          if (updateCalendarSuccess) {
            sendMessage({ updateButtonClicked: API_STATES.SUCCESS });
          } else {
            sendMessage({ updateButtonClicked: API_STATES.FAILED });
          }
        },
      };

      const tokenValid = await oauthManager.getTokenValid();
      if (!tokenValid) {
        const { authenticateSuccess, modalMessage } =
          (await authenticate()) || {};

        if (authenticateSuccess == false) {
          sendMessage({ openModal: true, modalMessage });
        }
      }
      try {
        actions[event]();
      } catch (error) {
        console.error(error);
      }
    };

    const handlers = {
      addEvents: () => genericHandler("addEvents"),
      delCal: () => genericHandler("delCal"),
      shareButtonClicked: () => genericHandler("shareButtonClicked"),
      updateButtonClicked: () => genericHandler("updateButtonClicked"),
    };
    const reqKeys = Object.keys(message);
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
      // console.log("popup not open");
    }
  }
