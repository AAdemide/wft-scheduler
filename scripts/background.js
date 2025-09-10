import * as constants from "../utils/constants.js";
import * as utils from "../utils/utils.js";

Object.assign(self, constants);
Object.assign(self, utils);

let port;
let timer;
let thdAuthState = THD_AUTH_STATES.IDLE;
let authState = AUTH_STATES.UNAUTHENTICATED;
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
  sendMessage({ nextPage: Pages.LOADING });
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
    if (fetchedJsons.userDetails?.firstName) {
      sendMessage({ nextPage: Pages.INSTRUCTIONS });
    } else {
      sendMessage({ nextPage: Pages.FORM });
    }
  } else if (failed.length > 0) {
    // console.log(`failed: ${failed}\nsucceeded: ${succeeded}\nresults: ${results}`)
    apiState = API_STATES.FAILED;
    sendMessage({ nextPage: Pages.INSTRUCTIONS });
    console.warn("Failed to remove calendars:", failed);
  }

  // else {
  //   apiState = API_STATES.IDLE;
  // }
}

//adds calendar to users calendar list
async function addToCalendarList(reminder = constants.defaultReminder, calId) {
  let init = { ...globalInit };
  init.method = "POST";
  init.body = JSON.stringify({
    id: calId,
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

//separate into 2 functions
async function addEventsToCalendar(events, calId) {
  let init = { ...globalInit };
  init.method = "POST";
  return Promise.all(
    events.map((event) => {
      const body = JSON.stringify(event);
      return fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`,
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
      console.log("success");
      return true;
    })
    .catch((err) => {
      console.warn(err);
      return false;
    });
}

function shareCalendar(email, calId) {
  // set apiState so that share calendar disables the share button when in waiting/loading state then shows the appropriate message for failure and success
  apiState = API_STATES.WAITING;
  sendMessage({ shareButtonHandled: API_STATES.WAITING });
  let init = { ...globalInit };
  console.log("shareCalendar called", init, authState, email, calId);
  init.method = "POST";
  const body = JSON.stringify({
    scope: {
      type: "user",
      value: email,
    },
    role: "reader",
  });
  fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/acl`, {
    ...init,
    body,
  })
    .then(async (res) => {
      if (res.ok) {
        apiState = constants.API_STATES.SUCCESS;
        sendMessage({ shareButtonHandled: API_STATES.SUCCESS });
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
      sendMessage({ shareButtonHandled: API_STATES.FAILED });
      console.warn(err);
    });
}

async function updateCalendar(calId) {
  // update button will be disabled until fetchedJson is filled
  // we need to tell the user how to get the most up to date info

  function fetchAll(urls, method) {
    return Promise.all(
      urls.map(({ url, payload }) => {
        const body = payload ? JSON.stringify(payload) : "";
        console.log("url", url);
        console.log("body", body);
        return fetch(url, {
          ...globalInit,
          method,
          body,
        })
          .then((res) => {
            if (res.ok) {
              console.log(res.status)
              return method=="PUT" ? res.json() : res.text();
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

  fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`, {
    ...globalInit,
  })
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
      // fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${events['PUT'][0].eventId}`,
      //   {
      //     ...globalInit,
      //     method: "PUT",
      //     body: JSON.stringify(events['PUT'][0].payload)
      //   }
      // ).then((res) => {
      //   if(res.ok) {
      //     return res.text();
      //   }
      //   throw new Error(res.status)
      // }).then((data) => {
      //   console.log(data)
      // }).catch((err) => {
      //   console.warn(err);
      // })
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
    if (!timer?.tokenValid()) authenticate();
    // checks if workforce has been logged into by calling fetchUserData (which also fetches the user data)
    // if (!fetchedJsons.userDetails?.firstName) {
    // console.log("fetching and initializing connection");
    fetchUserData();
    // }
  });
};
chrome.runtime.onMessage.addListener(onMessageCallback);

function handleMessage(message, sender) {
  const genericHandler = async (event) => {
    const actions = {
      addEvents: async () => {
        apiState = API_STATES.WAITING;
        sendMessage({ nextPage: Pages.LOADING });
        try {
          const calId = await makeCalendar();
          addToCalendarList(
            {
              method: message.formData.method,
              minutes: message.formData.minutes,
            },
            calId
          );
        } catch (error) {
          console.warn(error);
          apiState = API_STATES.FAILED;
          sendMessage({ nextPage: Pages.INSTRUCTIONS });
        }
        const addEventSuccess = await addEventsToCalendar(
          parseDays(
            fetchedJsons.details.days,
            message.formData.location,
            fetchedJsons.userDetails.timeZoneCode
          ),
          calId
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
      delCal: () => {
        deleteCalendar([message.calId]);
      },
      shareButtonClicked: () => {
        shareCalendar(
          message.shareButtonClicked.email,
          message.shareButtonClicked.calId
        );
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

    // else {
    //   console.log("else block hit, this is apiSate and thdAuthState: ", apiState, ", ", thdAuthState)
    // }
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
