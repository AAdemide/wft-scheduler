import * as constants from "../utils/constants.js";
import * as utils from "../utils/utils.js";

Object.assign(self, constants);
Object.assign(self, utils);

//BUG: oauth webpage opening twice if you do not give access to the web app. Test out bug theory by counting how many times the app is run and printing count to see if it is run after clear interval. Suddenly stopped test more to confirm absence
let timer;

//TODO: move to constants
const AUTH_STATES = {
  UNAUTHENTICATED: "unauthenticated",
  AUTHENTICATING: "authenticating",
  AUTH_FAILED: "auth_failed",
  AUTH_SUCCESS: "auth_success",
};
let authState = AUTH_STATES.UNAUTHENTICATED;

const THD_AUTH_STATES = {
  IDLE: "idle",
  AUTHENTICATING: "authenticating",
  AUTH_FAILED: "auth_failed",
  AUTH_SUCCESS: "auth_success",
};
let thdAuthState = THD_AUTH_STATES.IDLE;

const API_STATES = {
  FAILED: "failed", //failed validation or adding events
  SUCCESS: "success", //failed validation or adding events
  WAITING: "waiting", //waiting for validation or adding events
  IDLE: "idle", //the initial state and the reset state
};
//apiStates: -1 if failed (validating or adding events); 0 if waiting (validating or adding events); 1 if validated successfully ;2 if added successfully; undefined as the initial state and the reset state
let apiState = API_STATES.IDLE;

async function fetchUserData() {
  try {
    // console.log(
    //   `summary:${urls.summary}\ndetails: ${urls.details}\nweekly:${urls.weekly}\nuser details: ${urls.userDetails}`
    // );
    if (await urls.gottenAllUrls()) {
      thdAuthState = THD_AUTH_STATES.AUTHENTICATING;
      swDisabled = true;
      const results = await Promise.all([
        fetch(urls.summary),
        fetch(urls.details),
        fetch(urls.weekly),
        fetch(urls.userDetails),
      ]);


      const [summary, details, weekly, userDetails] = await Promise.all(
        results.map((r) => r.json())
      );
      fetchedJsons = {
        summary,
        details,
        weekly,
        userDetails
      };
      thdAuthState = THD_AUTH_STATES.AUTH_SUCCESS;
      return true;
    } else {
      thdAuthState = THD_AUTH_STATES.AUTH_FAILED;
      return false;
    }
  } catch (err) {
    thdAuthState = THD_AUTH_STATES.AUTH_FAILED;
    urls.clearAllUrls();
    console.log(err);
  }
  swDisabled = false;
  return false;
}

let globalInit = {
  async: true,
  contentType: "json",
};

let swDisabled = false;
let fetchedJsons = {};

let urls = {
  summary: "",
  details: "",
  weekly: "",
  userDetails: "",
  summaryMatch: (url) => regexp.summaryRegExp.test(url) && !swDisabled,
  detailsMatch: (url) => regexp.detailsRegExp.test(url) && !swDisabled,
  weeklyMatch: (url) => regexp.weeklyRegExp.test(url) && !swDisabled,
  userDetailsMatch: (url) => regexp.userDetailsRegExp.test(url) && !swDisabled,
  async gottenAllUrls() {
    const myUrls = await chrome.storage.session.get("urls");
    if (myUrls?.urls?.summary) {
      this.summary = myUrls.urls.summary;
      this.details = myUrls.urls.details;
      this.weekly = myUrls.urls.weekly;
      this.userDetails = myUrls.urls.userDetails;
      return true;
    }
    const result =
      this.summary !== "" &&
      this.details !== "" &&
      this.weekly !== "" &&
      this.userDetails !== "";
    if (result) {
      console.log("setting session storage");

      chrome.storage.session.set({
        urls: {
          summary: this.summary,
          details: this.details,
          weekly: this.weekly,
          userDetails: this.userDetails,
        },
      });
    }
    return result && !swDisabled;
  },
  clearAllUrls() {
    this.summary = "";
    this.details = "";
    this.weekly = "";
    this.userDetails = "";
  },
};

async function makeCalendar() {
  let init = { ...globalInit };
  init.method = "POST";
  init.body = JSON.stringify({
    summary: `${fetchUserData.userDetails.firstName} ${fetchUserData.userDetails.lastName}'s WFT Calendar`,
    description: "A calendar of your work schedule at The Home Depot",
  });

  try {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars",
      init
    );
    const data = await res.json();
    const calendarID = JSON.parse(JSON.stringify(data)).id;
    chrome.storage.sync.set({ "WFT-Scheduler Calendar ID": calendarID });
    console.log("calID:", calendarID);
    return calendarID;
  } catch (error) {
    console.error("There was an error while making the calendar:", err);
  }
}
async function deleteCalendar(calIds) {
  apiState = API_STATES.WAITING;
  const init = { ...globalInit, method: "DELETE" };

  const results = await Promise.allSettled(
    calIds.map((id) =>
      fetch(`https://www.googleapis.com/calendar/v3/calendars/${id}`, init)
        .then((res) => {
          console.log(res.status);
          return { id, status: res.status };
        })
        .catch((err) => {
          console.log(err);
          return { id, error: err };
        })
    )
  );

  console.log(results);

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
    console.log("Successfully removed calendars:", succeeded);
    apiState = API_STATES.SUCCESS;
  } else if (failed.length > 0) {
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
  try {
    const _res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?colorRgbFormat=true",
      init
    );
  } catch (error) {
    console.error(
      "There was an error while adding calendar to calendar list",
      error
    );
  }
}

async function addEventsToCalendar(events, formData, calID) {
  apiState = API_STATES.WAITING;
  if (!calID) {
    try {
      calID = await makeCalendar();
      addToCalendarList(
        { method: formData.method, minutes: formData.minutes },
        calID
      );
    } catch (error) {
      apiState = API_STATES.FAILED;
    }
  }

  let init = { ...globalInit };
  const location = formData.location;
  init.method = "POST";
  return Promise.all(
    events.map((event) => {
      const body = JSON.stringify({ ...event, location });
      // console.log("body: ", body)
      return fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calID}/events`,
        {
          ...init,
          body,
        }
      );
    })
  )
    .then((res) => res.map((i) => i.json()))
    .then((data) => {
      // console.log(JSON.parse(JSON.stringify(data)));
      apiState = API_STATES.SUCCESS;
    })
    .catch((err) => {
      console.log(err);
      apiState = API_STATES.FAILED;
    });
}

function getOAuthToken() {
  return new Promise((resolve, reject) => {
    // if(apiState==API_STATES.AUTH_FAILED) {
    // chrome.identity.removeCachedAuthToken({token:oldToken});
    // }
    console.log("globalInit", globalInit);
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
      "Content-Type": "application/json",
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
  const currUrl = details.url;

  //BUG: error in console when wft logs out url start from identity.homedepot.com/idp [exact redirect url: https://identity.homedepot.com/idp/DRON2_2tHsN/resume/idp/startSLO.ping]

  fetchUserData();

  // console.log(currUrl, "matches summaryURL:", urls.summaryMatch(currUrl), "swDisabled", swDisabled);
  if (urls.summaryMatch(currUrl)) urls.summary = currUrl;
  else if (urls.detailsMatch(currUrl)) urls.details = currUrl;
  else if (urls.weeklyMatch(currUrl)) urls.weekly = currUrl;
  else if (urls.userDetailsMatch(currUrl)) urls.userDetails = currUrl;
};

const onMessageCallback = (req, _, sendResponse) => {
  const genericHandler = async (event) => {
    const actions = {
      addEvents: async () => {
        if (apiState == API_STATES.WAITING) {
          return apiState;
        }
        return await addEventsToCalendar(
          parseDays(fetchedJsons.details.days),
          req.formData,
          req.calID
        );
      },
      delCal: async () => {
        if (apiState == API_STATES.WAITING) {
          return apiState;
        }
        return await deleteCalendar([req.calID]);
      },
    };
    // console.log(authState, thdAuthState,timer?.tokenValid());
    if (
      authState == AUTH_STATES.UNAUTHENTICATED ||
      authState == AUTH_STATES.AUTH_FAILED
    ) {
      if (!timer?.tokenValid()) authenticate();
    } else if (timer?.tokenValid() && authState == AUTH_STATES.AUTH_SUCCESS) {
      try {
        console.log(event);
        if (thdAuthState == THD_AUTH_STATES.AUTH_SUCCESS || event == "delCal") {
          await actions[event]();

          if (apiState == API_STATES.SUCCESS) {
            if (thdAuthState == THD_AUTH_STATES.AUTH_SUCCESS) {
              if (event == "addEvents") {
                sendResponse({ nextPage: "calendar", apiState: apiState });
              } else {
                sendResponse({ nextPage: "form", apiState: apiState });
              }
            } else {
              sendResponse({ nextPage: "instructions", apiState: apiState });
            }
          } else {
            sendResponse({ [event]: apiState });
          }
        }
      } catch (error) {
        console.error(error);
      }
    }

    // else {
    //   console.log("else block hit, this is apiSate and thdAuthState: ", apiState, ", ", thdAuthState)
    // }
  };
  const handlers = {
    questionReady: () => {
      fetchUserData();
      if (thdAuthState == THD_AUTH_STATES.AUTH_SUCCESS) {
        // sendResponse({ nextPage: "form" });
        sendResponse({ ready: true });
      } else if (thdAuthState == THD_AUTH_STATES.AUTHENTICATING) {
        console.log("else if block");
        sendResponse({ nextPage: "loading" });
      } else if (thdAuthState == THD_AUTH_STATES.AUTH_FAILED) {
        console.log(apiState, thdAuthState);
        sendResponse({ nextPage: "instructions" });
      } else {
        console.log("else block");
        sendResponse({ nextPage: "loading" });
      }
    },
    makeIdle: () => {
      apiState = API_STATES.IDLE;
      // thdAuthState = THD_AUTH_STATES.UNAUTHENTICATED;
      sendResponse({ message: "apiState idle" });
    },
    addEvents: () => genericHandler("addEvents"),
    delCal: () => genericHandler("delCal"),
  };

  const reqKey = Object.keys(req)[0];
  if (handlers[reqKey]) {
    handlers[reqKey]();
    return true;
  }

  sendResponse({ ready: false, next: "loading" });
};

chrome.webRequest.onHeadersReceived.addListener(
  onHeadersReceivedCallback,
  filter,
  []
);
chrome.runtime.onMessage.addListener(onMessageCallback);
