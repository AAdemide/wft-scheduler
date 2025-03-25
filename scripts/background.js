import * as constants from "../utils/constants.js"
import * as utils from "../utils/utils.js"

Object.assign(self, constants)
Object.assign(self, utils)
//BUG: oauth webpage opening twice if you do not give access to the web app. Test out bug theory by counting how many times the app is run and printing count to see if it is run after clear interval. Suddenly stopped test more to confirm absence
let timer;
let myResUrl;
let myParams;
//apiStates: -1 if failed (validating or adding events); 0 if waiting (validating or adding events); 1 if validated successfully ;2 if added successfully; undefined as the initial state and the reset state
let apiState;

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
};
const gottenAllUrls = () =>
  urls.summary && urls.details && urls.weekly && !swDisabled;
const clearAllUrls = () =>
  ([urls.summary, urls.details, urls.weekly] = Array.from(Array(3).keys()));

const makeCalendar = () => {
  let init = { ...globalInit };
  init.method = "POST";
  init.body = JSON.stringify({
    summary: "Username's WFT Calendar",
    description: "A calendar of your work schedule at The Home",
  });
  return new Promise((resolve, reject) => {
    fetch("https://www.googleapis.com/calendar/v3/calendars", init)
      .then((res) => res.json())
      .then(function (data) {
        const calendarID = JSON.parse(JSON.stringify(data)).id;
        chrome.storage.sync.set({ "WFT-Scheduler Calendar ID": calendarID });
        console.log(calendarID)
        resolve(calendarID)
      })
      .catch((err) => {
        console.log(err);
        apiState = -1;
        reject(err);
      });
  });
};
const deleteCalendar = (calIds) => {
  apiState = 0;
  //BUG: deletes calendars but causes an error
  let init = { ...globalInit };
  init.method = "DELETE";
  Promise.all(
    calIds.map((i) =>
      fetch("https://www.googleapis.com/calendar/v3/calendars/" + i, init)
    )
  )
    .then((res) => res)
    .then((_) => {
      chrome.storage.sync.remove("WFT-Scheduler Calendar ID");
      console.log("Successfully removed calendar");
      apiState = 2;
    })
    .catch((err) => {
      console.log(err)
      apiState = -1;
    });
};
const addToCalendarList = (reminder = constants.defaultReminder, id) => {
  let init = { ...globalInit };
  init.method = "POST";
  init.body = JSON.stringify({
    id: id,
    backgroundColor: "#F96302",
    foregroundColor: "#FFFFFF",
    defaultReminders: reminder,
  });
  fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?colorRgbFormat=true",
    init
  )
    .then((res) => res.json())
    .then(function (data) {})
    .catch((err) => console.log(err));
};
const addEventsToCalendar = async (events, formData, id) => {
  apiState = 0
  if (Object.keys(id).length == 0) {
    id = await makeCalendar();
    console.log(id);
    addToCalendarList(
      { method: formData.method, minutes: formData.minutes },
      id
    );
  }
  
  let init = { ...globalInit };
  const location = formData.location;
  init.method = "POST";
  Promise.all(
    events.map((event) => {
      const body = JSON.stringify({ ...event,
        location})
        // console.log("body: ", body)
     return fetch(`https://www.googleapis.com/calendar/v3/calendars/${id}/events`, {
        ...init,
        body,
      })
    }
      
    )
  )
    .then((res) => res.map((i) => i.json()))
    .then((data) => {
      console.log(JSON.parse(JSON.stringify(data)));
      apiState = 2;
    })
    .catch((err) => {
      console.log(err);
      apiState = -1;
    });
  apiState = 2;
};

const getOAuthToken = () => {
  chrome.identity.launchWebAuthFlow(
    { url: constants.auth_url, interactive: true },
    function (responseUrl) {
      if (chrome.runtime.lastError) {
        console.log("error");
        apiState = -1;
      } else {
        myResUrl = new URL(responseUrl);
        myParams = new URLSearchParams(myResUrl.hash.substring(1));
        if (myParams.get("error") != undefined) {
          apiState = -1;
        } else {
          console.log("successful validation");
          timer = new TokenTimer(parseInt(myParams.get("expires_in"), 10) - 10);
          timer.startTimer();
          console.log(timer);
          globalInit.headers = {
            Authorization:
              myParams.get("token_type") + " " + myParams.get("access_token"),
            "Content-Type": "application/json",
          };
          apiState = 1;
        }
      }
    }
  );
  apiState = 0;
};

const callback = function (details) {
  const currUrl = details.url;
  if (urls.summaryMatch(currUrl)) urls.summary = currUrl;
  else if (urls.detailsMatch(currUrl)) urls.details = currUrl;
  else if (urls.weeklyMatch(currUrl)) urls.weekly = currUrl;

  //BUG: error in console when wft logs out url start from identity.homedepot.com/idp [exact redirect url: https://identity.homedepot.com/idp/DRON2_2tHsN/resume/idp/startSLO.ping]
  if (gottenAllUrls()) {
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
        })
        .catch((err) => console.log(err));
    })();
  }
};

chrome.webRequest.onHeadersReceived.addListener(callback, filter, []);
chrome.runtime.onMessage.addListener((req, _, sendResponse) => {
  if (req.question == "ready" && Object.keys(fetchedJsons).length != 0) {
    sendResponse({ ready: true });
  } else if (req.add == "events") {
    
    if (!timer?.tokenValid() && apiState == undefined) {
      getOAuthToken();
    }else if (timer?.tokenValid() && apiState == undefined) {
      apiState = 1;
    }else if (apiState == 1 && timer?.tokenValid()) {
      addEventsToCalendar(
        parseDays(fetchedJsons.details.days),
        req.formData,
        req.id
      );
      sendResponse({ apiState: "ready" });
    } else if (apiState == 0) {
      sendResponse({ apiState: "waiting" });
    } else if (apiState == -1) {
      apiState = undefined;
      sendResponse({ apiState: "failed" });
    } else if (apiState == 2) {
      apiState = undefined;
      sendResponse({ apiState: "success" });
    }

    sendResponse({
      success: "button handled",
    });
  } else if (req.delete == "calendar") {
    
    if ( !timer?.tokenValid() && apiState == undefined ) {
      getOAuthToken();
    }else if (timer?.tokenValid() && apiState == undefined) {
      apiState = 1;
    } else if (apiState == 1 && timer?.tokenValid()) {
      deleteCalendar([req.id]);
      sendResponse({ apiState: "ready" });
    }else if (apiState==0){
      sendResponse({ apiState: "waiting" });
    } else if (apiState == -1) {
      apiState = undefined;
      sendResponse({ apiState: "failed" });
    } else if (apiState == 2) {
      apiState = undefined;
      sendResponse({ apiState: "success" });
    }
    
    sendResponse({
      success: "button handled",
    });
  } else {
    sendResponse({ ready: false });
  }
});
