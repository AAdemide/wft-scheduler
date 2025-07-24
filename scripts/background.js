import * as constants from "../utils/constants.js";
import * as utils from "../utils/utils.js";

Object.assign(self, constants);
Object.assign(self, utils);

//BUG: oauth webpage opening twice if you do not give access to the web app. Test out bug theory by counting how many times the app is run and printing count to see if it is run after clear interval. Suddenly stopped test more to confirm absence
let timer;

//apiStates: -1 if failed (validating or adding events); 0 if waiting (validating or adding events); 1 if validated successfully ;2 if added successfully; undefined as the initial state and the reset state
let apiState;

//TODO: move to constants
const API_STATES = {
  AUTHENTICATING: "authenticating",
  AUTH_FAILED: "auth_failed",
  AUTH_SUCCESS: "auth_success",
  FAILED: "failed", //failed validation or adding events
  WAITING: "waiting", //waiting for validation or adding events
  VALIDATION_SUCCESS: "validation_success", //validated successfully
  ADDITION_SUCCESS: "addition_success", //addition successfully
  IDLE: "idle", //the initial state and the reset state
};

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
  summaryMatch: (url) => regexp.summaryRegExp.test(url) && !swDisabled,
  detailsMatch: (url) => regexp.detailsRegExp.test(url) && !swDisabled,
  weeklyMatch: (url) => regexp.weeklyRegExp.test(url) && !swDisabled,
  gottenAllUrls() {
    return this.summary && this.details && this.weekly && !swDisabled;
  },
};
// const gottenAllUrls = () =>
//   urls.summary && urls.details && urls.weekly && !swDisabled;
// const clearAllUrls = () =>
//   ([urls.summary, urls.details, urls.weekly] = Array.from(Array(3).keys()));

//returns calID or undefined
async function makeCalendar() {
  apiState = API_STATES.WAITING;
  let init = { ...globalInit };
  init.method = "POST";
  init.body = JSON.stringify({
    summary: "Username's WFT Calendar",
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
    apiState = API_STATES.FAILED;
  }

  // return new Promise((resolve, reject) => {
  //   fetch("https://www.googleapis.com/calendar/v3/calendars", init)
  //     .then((res) => res.json())
  //     .then(function (data) {
  //       const calendarID = JSON.parse(JSON.stringify(data)).id;
  //       chrome.storage.sync.set({ "WFT-Scheduler Calendar ID": calendarID });
  //       console.log(calendarID);
  //       resolve(calendarID);
  //     })
  //     .catch((err) => {
  //       console.log(err);
  //       apiState = -1;
  //       reject(err);
  //     });
  // });
}
async function deleteCalendar(calIds) {
  apiState = API_STATES.WAITING;
  const init = { ...globalInit, method: "DELETE" };

  const results = await Promise.allSettled(
    calIds.map((id) =>
      fetch(`https://www.googleapis.com/calendar/v3/calendars/${id}`, init)
        .then((res) => 
           ({ id, ok: res.ok }))
        .catch((err) => {
          console.log(err);
          return { id, error: err };
        })
    )
  );

  const failed = [];
  const succeeded = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value.ok) {
        succeeded.push(result.value.id);
      } else {
        failed.push(result.value.id);
      }
    } else {
      failed.push(result.reason?.id ?? "Unknown");
    }
  }

  //print succeeded and failed and figure out why it is always setting apiState to failed
  console.log(succeeded);
  console.log(failed);
  if (succeeded.length > 0) {
    chrome.storage.sync.remove("WFT-Scheduler Calendar ID");
    console.log("Successfully removed calendars:", succeeded);
    apiState = API_STATES.SUCCESS;
  } else {
    apiState = API_STATES.FAILED;
  }

  if (failed.length > 0) {
    console.warn("Failed to remove calendars:", failed);
  }
}

//adds calendar to users calendar list
async function addToCalendarList(reminder = constants.defaultReminder, calID) {
  apiState = API_STATES.WAITING;
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
    // const data = await _res.json()
    apiState = API_STATES.SUCCESS;
  } catch (error) {
    console.error(
      "There was an error while adding calendar to calendar list",
      error
    );
    apiState = API_STATES.FAILED;
  }

  //OLD CODE
  // .then((res) => res.json())
  // .then(function (data) {})
  // .catch((err) => console.log(err));
}

async function addEventsToCalendar(events, formData, calID) {
  if (!calID) {
    calID = await makeCalendar();
    console.log(calID);
    addToCalendarList(
      { method: formData.method, minutes: formData.minutes },
      calID
    );
  }

  let init = { ...globalInit };
  const location = formData.location;
  init.method = "POST";
  Promise.all(
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
          apiState == API_STATES.AUTH_FAILED
            ? constants.getAuthURL((promptConsent = true))
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
  apiState = API_STATES.AUTHENTICATING;
  try {
    const { token, expiresIn, tokenType } = await getOAuthToken();
    globalInit.headers = {
      Authorization: `${tokenType} ${token}`,
      "Content-Type": "application/json",
    };
    timer = new TokenTimer(expiresIn - 10);
    timer.startTimer();
    apiState = API_STATES.AUTH_SUCCESS;
  } catch (error) {
    console.error("OAuth error:", error);
    apiState = API_STATES.AUTH_FAILED;
  }
}

const callback = function (details) {
  apiState = API_STATES.WAITING;
  const currUrl = details.url;

  if (urls.summaryMatch(currUrl)) urls.summary = currUrl;
  else if (urls.detailsMatch(currUrl)) urls.details = currUrl;
  else if (urls.weeklyMatch(currUrl)) urls.weekly = currUrl;

  //BUG: error in console when wft logs out url start from identity.homedepot.com/idp [exact redirect url: https://identity.homedepot.com/idp/DRON2_2tHsN/resume/idp/startSLO.ping]
  if (urls.gottenAllUrls()) {
    swDisabled = true;
    (() => {
      Promise.all([
        fetch(urls.summary),
        fetch(urls.details),
        fetch(urls.weekly),
      ])
        .then((results) => {
          return Promise.all(results.map((r) => r.json()));
        })
        .then(([summary, details, weekly]) => {
          fetchedJsons = {
            summary: { ...summary },
            details: { ...details },
            weekly: { ...weekly },
          };
          swDisabled = false;
          apiState = API_STATES.SUCCESS;
        })
        .catch((err) => {
          apiState = API_STATES.FAILED;
          console.log(err)
        });
    })();
  }
};

chrome.webRequest.onHeadersReceived.addListener(callback, filter, []);

chrome.runtime.onMessage.addListener((req, _, sendResponse) => {
  const sendAPIState = () => {
    // console.log("called")
    if (apiState == API_STATES.FAILED || apiState == API_STATES.SUCCESS) {
      apiState = API_STATES.IDLE;
    }
    // console.log("apiState from background.js:", apiState);
    sendResponse({ apiState: apiState });
  };
  const genericHandler = async (event) => {
    console.log(apiState)
    const actions = {
      addEvents: async () => {
        try {
          console.log("adding events below")
          await addEventsToCalendar(
            parseDays(fetchedJsons.details.days),
            req.formData,
            req.calID
          );
        } catch (error) {
          console.error(error);
        }
      },
      deleteCalendar: async () => {
        try {
          await deleteCalendar([req.calID]);
        } catch (error) {
          console.error(error);
        }
      },
    };

    if (apiState == API_STATES.IDLE || apiState == API_STATES.AUTH_FAILED) {
      if (!timer?.tokenValid()) authenticate();
    } else if (apiState == API_STATES.AUTH_SUCCESS && timer.tokenValid()) {
      actions[event]();

      if (apiState == API_STATES.SUCCESS) sendResponse({ [event]: "success" });
      else {
        sendResponse({ [event]: "failed" });
      }
    }
    sendAPIState();
  };
  const handlers = {
    questionReady: () => {
      if (Object.keys(fetchedJsons).length != 0) {
        sendResponse({ ready: true });
      }
    },
    addEvents: () => genericHandler("addEvents"),
    deleteCalendar: () => genericHandler("deleteCalendar"),
  };

  const reqKey = Object.keys(req)[0];
  console.log(reqKey)
  if (handlers[reqKey]) {
    handlers[reqKey]();
  }

  sendResponse({ ready: false });
});
