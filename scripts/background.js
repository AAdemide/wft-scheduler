import * as constants from "../utils/constants.js";
import * as utils from "../utils/utils.js";

Object.assign(self, constants);
Object.assign(self, utils);

let timer;
let authState = AUTH_STATES.UNAUTHENTICATED;
let thdAuthState = THD_AUTH_STATES.IDLE;
let apiState = API_STATES.IDLE;
// let swDisabled = false;
let fetchedJsons = {};
let globalInit = {
  async: true,
  ["Content-Type"]: "application/json",
};
let urls = {
  details: "",
  userDetails: "",

  detailsMatch: (url) => regexp.detailsRegExp.test(url),
  userDetailsMatch: (url) => regexp.userDetailsRegExp.test(url),

  async gottenAllUrls() {
    const result = this.details !== "" && this.userDetails !== "";

    // console.log(` this.details: ${this.details}, this.userDetails: ${this.userDetails}`);

    if (result) {
      // console.log("setting session storage", fetchedJsons);

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

let lastReceivedHeaderTimer;
// checks if workforce has been authenticated, if so get the user data
async function fetchUserData(fromHeaderCallback) {
  // since the background script is polled only run the function if the authentication has begun.
  if (thdAuthState != THD_AUTH_STATES.AUTHENTICATING) {
    try {
      if (await urls.gottenAllUrls()) {
        thdAuthState = THD_AUTH_STATES.AUTHENTICATING;
        // swDisabled = true;
        const results = await Promise.all([
          fetch(urls.details),
          fetch(urls.userDetails),
        ]);

        const [details, userDetails] = await Promise.all(
          results.map(async (r) => {
            let res;
            if (r.status === 200) {
              res = await r.json();
              // console.log("json", res);
            } else {
              res = await r.text();
              // console.log("not json", res);
            }
            return res;
          })
        );
        fetchedJsons = {
          details,
          userDetails,
        };
        thdAuthState = THD_AUTH_STATES.AUTH_SUCCESS;
        return true;
      }
      //The else block sets the authState to false when the user has simply not logged in to workforce.
      //also if all urls weren't found after waiting 2s after all networks requests from refresh
      else if (
        !fromHeaderCallback ||
        Date.now() - lastReceivedHeaderTimer > 10000
      ) {
        console.log(
          fromHeaderCallback,
          "did not get all urls",
          urls.details,
          urls.userDetails
        );
        thdAuthState = THD_AUTH_STATES.AUTH_FAILED;
        return false;
      }
    } catch (err) {
      thdAuthState = THD_AUTH_STATES.AUTH_FAILED;
      urls.clearAllUrls();
      console.warn(err);
    }
    // swDisabled = false;
    return false;
  }
}

async function makeCalendar() {
  let init = { ...globalInit };
  init.method = "POST";
  init.body = JSON.stringify({
    summary: `${fetchedJsons.userDetails.firstName ?? ""} ${
      fetchedJsons.userDetails.lastName ?? ""
    }'s WFT Calendar`,
    description: "A calendar of your work schedule at The Home Depot",
  });
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars",
    init
  );
  const data = await res.json();
  // console.log(data);
  if (data.error) {
    throw new Error(JSON.stringify(data.error));
  }
  const calendarID = JSON.parse(JSON.stringify(data)).id;
  chrome.storage.sync.set({ "WFT-Scheduler Calendar ID": calendarID });
  return calendarID;
}

async function deleteCalendar(calIds) {
  // console.log("from delete calendar", apiState);
  apiState = API_STATES.WAITING;
  const init = { ...globalInit, method: "DELETE" };
  const results = await Promise.allSettled(
    calIds.map((id) =>
      fetch(`https://www.googleapis.com/calendar/v3/calendars/${id}`, init)
        .then((res) => {
          // console.log(res.status);
          return { id, status: res.status };
        })
        .catch((err) => {
          console.log(err);
          return { id, error: err };
        })
    )
  );

  // console.log(results);

  const failed = [];
  const succeeded = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (
        result.value.status == 200 ||
        result.value.status == 204 ||
        result.value.status == 404
      ) {
        succeeded.push(result.value.id);
      } else {
        failed.push(result.value.id);
      }
    } else {
      failed.push(result.reason?.id ?? "Unknown");
    }
  }

  if (succeeded.length > 0) {
    chrome.storage.sync.remove("WFT-Scheduler Calendar ID");
    // console.log("Successfully removed calendars:", succeeded);
    apiState = API_STATES.SUCCESS;
  } else if (failed.length > 0) {
    // console.log(`failed: ${failed}\nsucceeded: ${succeeded}\nresults: ${results}`)
    apiState = API_STATES.FAILED;
    console.warn("Failed to remove calendars:", failed);
  }

  // else {
  //   apiState = API_STATES.IDLE;
  // }
}

//adds calendar to users calendar list
async function addToCalendarList(reminder = constants.defaultReminder, calID) {
  let init = { ...globalInit };
  init.method = "POST";
  init.body = JSON.stringify({
    id: calID,
    backgroundColor: "#F96302",
    foregroundColor: "#FFFFFF",
    defaultReminders: reminder,
  });

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?colorRgbFormat=true",
    init
  );
  const data = await res.json();
  if (data.error) {
    throw new Error(JSON.stringify(data.error));
  }
}

async function addEventsToCalendar(events, formData) {
  // if (!calID) {
  console.log("I'm supposed to add events and should be called once");
  apiState = API_STATES.WAITING;
  let calID;
  try {
    calID = await makeCalendar();
    addToCalendarList(
      { method: formData.method, minutes: formData.minutes },
      calID
    );
    // apiState = API_STATES.SUCCESS;
  } catch (error) {
    console.warn(error);
    apiState = API_STATES.FAILED;
  }
  // The HTTP headers for the outer batch request, except for the Content- headers such as Content-Type, apply to every request in the batch. If you specify a given HTTP header in both the outer request and an individual call, then the individual call header's value overrides the outer batch request header's value. The headers for an individual call apply only to that call.
  let init = { ...globalInit };
  const location = formData.location;
  init.method = "POST";
  // console.log(events)
  return Promise.all(
    events.map((event) => {
      const body = JSON.stringify({ ...event, location });
      //Each part begins with its own Content-Type: application/http HTTP header.
      return fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calID}/events`,
        {
          ...init,
          body,
        }
      );
    })
  )
    .then((res) =>
      res.map((i) => {
        const r = i.json();
        return r;
      })
    )

    .then((data) => {
      // console.log(JSON.parse(JSON.stringify(data)));
      apiState = API_STATES.SUCCESS;
    })
    .catch((err) => {
      console.warn(err);
      apiState = API_STATES.FAILED;
    });
}

function shareCalendar(email, calID) {
  // set apiState so that share calendar disables the share button when in waiting/loading state then shows the appropriate message for failure and success
  console.log("here");
  apiState = API_STATES.WAITING;
  let init = { ...globalInit };
  console.log("shareCalendar called", init, authState, email, calID);
  init.method = "POST";
  const body = JSON.stringify({
    scope: {
      type: "user",
      value: "ademideakinsefunmi@gmail.com",
    },
    role: "reader",
  });
  fetch(`https://www.googleapis.com/calendar/v3/calendars/${calID}/acl`, {
    ...init,
    body,
  })
    .then(async (res) => {
      if (res.ok) {
        apiState = constants.API_STATES.SUCCESS;
        return res.json();
      }
      return res.text().then((text) => {
        console.error("Error response:", text);
        throw new Error(text);
      });
    })
    .then((data) => {
      console.log(data);
    })
    .catch((err) => {
      apiState = API_STATES.FAILED;
      console.warn(err);
    });
}

function updateCalendar(calId="fc73be9c24e5bc970d447c49a9b1388b66d0edcc813fb6e04af385677898873b@group.calendar.google.com") {
  // update button will be disabled until fetchedJson is filled
  // we need to tell the user how to get the most up to date info
  fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`, ...globalInit)
  .then((res) => {
    if(res.ok) {
      return res.json();
    }
    throw new Error(res.status);
  })
  .then((data) => {
    console.log(data);
  })
  .catch((err) => {
    console.warn(err);
  })
}

function getOAuthToken() {
  return new Promise((resolve, reject) => {
    // if(apiState==API_STATES.AUTH_FAILED) {
    // chrome.identity.removeCachedAuthToken({token:oldToken});
    // }
    // console.log("globalInit", globalInit);
    chrome.identity.launchWebAuthFlow(
      {
        url:
          authState == AUTH_STATES.AUTH_FAILED ||
          authState == AUTH_STATES.AUTHENTICATING
            ? constants.getAuthURL(undefined, true)
            : constants.getAuthURL(),
        interactive: true,
      },
      (responseUrl) => {
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
      }
    );
  });
}

async function authenticate() {
  authState = AUTH_STATES.AUTHENTICATING;
  try {
    const { token, expiresIn, tokenType } = await getOAuthToken();
    globalInit.headers = {
      Authorization: `${tokenType} ${token}`,
    };
    timer = new TokenTimer(expiresIn - 10);
    timer.startTimer();
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

  // has fetchedJsons been filled with data
  if (!fetchedJsons.userDetails?.firstName) {
    fetchUserData(true);
  } else {
    console.log("update can be enabled now");
  }

  // console.log(urls.details, urls.userDetails);
  if (urls.detailsMatch(currUrl)) urls.details = currUrl;
  else if (urls.userDetailsMatch(currUrl)) {
    urls.userDetails = currUrl;
  }
  chrome.storage.sync.set({ refreshTimeElapsed: Date.now() });
};

const onMessageCallback = (req, _, sendResponse) => {
  const genericHandler = async (event) => {
    const actions = {
      addEvents: () => {
        addEventsToCalendar(parseDays(fetchedJsons.details.days), req.formData);
      },
      delCal: () => {
        deleteCalendar([req.calID]);
      },
      shareButtonClicked: () => {
        shareCalendar(
          req.shareButtonClicked.email,
          req.shareButtonClicked.calID
        );
      },
    };

    // first thing's first check if google api has been authenticated
    if (
      authState == AUTH_STATES.UNAUTHENTICATED ||
      authState == AUTH_STATES.AUTH_FAILED
    ) {
      if (!timer?.tokenValid()) authenticate();
      sendResponse({ ready: false });
    } else if (timer?.tokenValid() && authState == AUTH_STATES.AUTH_SUCCESS) {
      try {
        if (
          thdAuthState == THD_AUTH_STATES.AUTH_SUCCESS ||
          event == "delCal" ||
          req.shareButtonClicked
        ) {
          if (apiState == API_STATES.IDLE) {
            // console.log("apiState is idle so event will be called");
            actions[event]();
          } else if (apiState == API_STATES.SUCCESS) {
            if (event == "shareButtonClicked") {
              sendResponse({ shareButtonHandled: "success" });
              apiState = API_STATES.IDLE;
            } else if (thdAuthState == THD_AUTH_STATES.AUTH_SUCCESS) {
              if (event == "addEvents") {
                sendResponse({ nextPage: "calendar", apiState: apiState });
                apiState = API_STATES.IDLE;
              } else {
                sendResponse({ nextPage: "form", apiState: apiState });
                apiState = API_STATES.IDLE;
              }
            } else {
              console.log(`else block entered thdAuthState: ${thdAuthState}`);
              sendResponse({ nextPage: "instructions", apiState: apiState });
              apiState = API_STATES.IDLE;
            }
          } else {
            if (event == "shareButtonClicked") {
              if (apiState == API_STATES.FAILED) {
                sendResponse({ shareButtonHandled: "failed" });
                apiState = API_STATES.IDLE;
              } else if (apiState == API_STATES.WAITING) {
                sendResponse({ shareButtonHandled: "pending" });
              }
            }

            // console.log(apiState);
            sendResponse({ apiState });
          }
        }
      } catch (error) {
        console.error(error);
      }
    } else if (authState == AUTH_STATES.AUTHENTICATING) {
      if (event == "shareButtonClicked") {
        sendResponse({ shareButtonHandled: "pending" });
      } else {
        sendResponse({ nextPage: "loading" });
      }
    }

    // else {
    //   console.log("else block hit, this is apiSate and thdAuthState: ", apiState, ", ", thdAuthState)
    // }
  };
  const handlers = {
    questionReady: () => {
      // checks if workforce has been logged into by calling fetchUserData (which also fetches the user data)
      fetchUserData();

      // depending on the state of thdAuthState change the page
      if (thdAuthState == THD_AUTH_STATES.AUTH_SUCCESS) {
        // console.log(`thdAuthState: ${thdAuthState}, apiState: ${apiState}, authState: ${authState}, event: ${req}, fetchedJsons: ${fetchedJsons}`);
        sendResponse({ wftAuthenticated: true, nextPage: "form" });
      } else if (thdAuthState == THD_AUTH_STATES.AUTHENTICATING) {
        sendResponse({ nextPage: "loading" });
      } else if (thdAuthState == THD_AUTH_STATES.AUTH_FAILED) {
        sendResponse({ nextPage: "instructions" });
      } else {
        // console.log(authState, thdAuthState, apiState);
        sendResponse({ nextPage: "loading" });
      }
    },
    makeIdle: () => (apiState = API_STATES.IDLE),
    addEvents: () => genericHandler("addEvents"),
    delCal: () => genericHandler("delCal"),
    shareButtonClicked: () => genericHandler("shareButtonClicked"),
  };

  // handlers called by popup.js
  const reqKeys = Object.keys(req);

  // if there are valid handler functions call them and return the function
  reqKeys.forEach((reqKey) => {
    if (handlers[reqKey]) {
      handlers[reqKey]();
      return true;
    }
  });
  // if no handlers were called return ready false
  // sendResponse({ ready: false, nextPage: "instructions" });
  return true;
};

chrome.webRequest.onHeadersReceived.addListener(
  onHeadersReceivedCallback,
  filter,
  []
);
chrome.runtime.onMessage.addListener(onMessageCallback);
