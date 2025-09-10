import { AUTH_STATES, API_STATES, defaultReminder } from "./constants";
import { TokenTimer } from "./utils";

class gApiUtils {
  constructor(calId) {
    this.calId = calId;
    this.globalInit = {
      async: true,
      ["Content-Type"]: "application/json",
    };
    this.auth_params = {
      client_id: chrome.runtime.getManifest().oauth2.client_id,
      redirect_uri: chrome.identity.getRedirectURL(),
      response_type: "token",
      scope: "https://www.googleapis.com/auth/calendar",
    };
    this.authState = AUTH_STATES.UNAUTHENTICATED;
    this.apiState = API_STATES.IDLE;
  }

  getOAuthURL(promptConsent = false) {
    let url;
    if (promptConsent)
      url = new URLSearchParams(
        Object.entries({ ...this.auth_params, prompt: "consent" })
      );
    else {
      url = new URLSearchParams(Object.entries(this.auth_params));
    }
    return "https://accounts.google.com/o/oauth2/auth?" + url.toString();
  }

  getOAuthToken(authFlowOptions) {
    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(authFlowOptions, (responseUrl) => {
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
      });
    });
  }

  async authenticate() {
    // if(this.authState == AUTH_STATES.AUTHENTICATING) {
    //     return;
    // }
    this.authState = AUTH_STATES.AUTHENTICATING;
    try {
      const promptConsent =
        (this.authState == AUTH_STATES.AUTH_FAILED ||
          this.authState == AUTH_STATES.AUTHENTICATING) ??
        false;
      const authFlowOptions = {
        url: getOAuthURL(promptConsent),
        interactive: true,
      };
      const { token, expiresIn, tokenType } = await getOAuthToken(
        authFlowOptions
      );
      this.globalInit.headers = {
        Authorization: `${tokenType} ${token}`,
      };
      this.timer = new TokenTimer(expiresIn - 10);
      this.timer.startTimer();
      this.authState = AUTH_STATES.AUTH_SUCCESS;
    } catch (error) {
      console.error("OAuth error:", error);
      this.authState = AUTH_STATES.AUTH_FAILED;
    }
  }

  async makeCalendar() {
    let init = { ...this.globalInit };
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

  //adds calendar to users calendar list
  async addToCalendarList(options) {
    let init = { ...this.globalInit };
    init.method = "POST";
    init.body = JSON.stringify(options);

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
  async addEventsToCalendar(events) {
    let init = { ...this.globalInit };
    init.method = "POST";
    return Promise.all(
      events.map((event) => {
        const body = JSON.stringify(event);
        return fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${this.calId}/events`,
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
        console.log(data);
        return true;
      })
      .catch((err) => {
        console.warn(err);
        return false;
      });
  }

  async deleteCalendar() {
    this.apiState = API_STATES.WAITING;
    //   sendMessage({ nextPage: Pages.LOADING });
    const init = { ...this.globalInit, method: "DELETE" };
    fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${this.calId}`,
      init
    )
      .then((res) => {
        if (res.ok) {
          return text();
        }
        throw new Error(res.status);
      }).then((data) => {
        console.log(data);
      })
      .catch((err) => {
        console.warn(err);
      });
  }

  shareCalendar(email) {
    // set apiState so that share calendar disables the share button when in waiting/loading state then shows the appropriate message for failure and success
    this.apiState = API_STATES.WAITING;
    //   sendMessage({ shareButtonHandled: API_STATES.WAITING });
    const body = JSON.stringify({
      scope: {
        type: "user",
        value: email,
      },
      role: "reader",
    });
    let init = { ...this.globalInit, method: "POST", body };
    fetch(`https://www.googleapis.com/calendar/v3/calendars/${this.calId}/acl`, init)
      .then(async (res) => {
        if (res.ok) {
          this.apiState = constants.API_STATES.SUCCESS;
        //   sendMessage({ shareButtonHandled: API_STATES.SUCCESS });
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
        this.apiState = API_STATES.FAILED;
        // sendMessage({ shareButtonHandled: API_STATES.FAILED });
        console.warn(err);
      });
  }

  async updateCalendar() {
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

  setCalId(calId) {
    this.calId = calId;
  }

  getCalId() {
    return this.calId;
  }
}

// async deleteCalendars(calIds) {
//   this.apiState = API_STATES.WAITING;
//   sendMessage({ nextPage: Pages.LOADING });
//   const init = { ...globalInit, method: "DELETE" };
//   const results = await Promise.allSettled(
//     calIds.map((id) =>
//       fetch(`https://www.googleapis.com/calendar/v3/calendars/${id}`, init)
//         .then((res) => {
//           // console.log(res.status);
//           return { id, status: res.status };
//         })
//         .catch((err) => {
//           console.log(err);
//           return { id, error: err };
//         })
//     )
//   );

//   // console.log(results);

//   const failed = [];
//   const succeeded = [];

//   for (const result of results) {
//     if (result.status === "fulfilled") {
//       if (
//         result.value.status == 200 ||
//         result.value.status == 204 ||
//         result.value.status == 404
//       ) {
//         succeeded.push(result.value.id);
//       } else {
//         failed.push(result.value.id);
//       }
//     } else {
//       failed.push(result.reason?.id ?? "Unknown");
//     }
//   }

//   if (succeeded.length > 0) {
//     chrome.storage.sync.remove("WFT-Scheduler Calendar ID");
//     // console.log("Successfully removed calendars:", succeeded);
//     apiState = API_STATES.SUCCESS;
//     if (fetchedJsons.userDetails?.firstName) {
//       sendMessage({ nextPage: Pages.INSTRUCTIONS });
//     } else {
//       sendMessage({ nextPage: Pages.FORM });
//     }
//   } else if (failed.length > 0) {
//     // console.log(`failed: ${failed}\nsucceeded: ${succeeded}\nresults: ${results}`)
//     apiState = API_STATES.FAILED;
//     sendMessage({ nextPage: Pages.INSTRUCTIONS });
//     console.warn("Failed to remove calendars:", failed);
//   }

//   // else {
//   //   apiState = API_STATES.IDLE;
//   // }
// }
