import { AUTH_STATES, API_STATES } from "./constants.js";
import { parseDiff } from "./utils.js";

export default class GApiUtils {
  constructor(calId) {
    this.calId = calId;
    this.globalInit = {
      async: true,
      ["Content-Type"]: "application/json",
    };
    this.authState = AUTH_STATES.UNAUTHENTICATED;
    this.apiState = API_STATES.IDLE;
  }

  static async create() {
    const calId = await makeCalendar();
    return new gApiUtils(calId);
  }

  async fetchUserEmail(myHeader) {
    const { headers } = myHeader || this.globalInit;
    try {
      const res = await fetch(
        "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
        {
          headers,
        }
      );

      const user = await res.json();
      if (user.error) throw new Error(user.error);
      const userEmail = user.email;
      return userEmail;
    } catch (error) {
      console.error("Failed to fetch user info:", error);
    }
  }

  async makeCalendar(body) {
    let init = {
      ...this.globalInit,
      method: "POST",
      body: JSON.stringify(body),
    };
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars",
      init
    );
    const data = await res.json();
    if (data.error) {
      throw new Error(JSON.stringify(data.error));
    }
    const calendarID = JSON.parse(JSON.stringify(data)).id;
    this.calId = calendarID;
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
        res.map(async (i) => {
          if (!i.ok) throw new Error(i.text());
          const r = await i.json();
          return r;
        })
      )
      .then((data) => {
        // console.log("success");
        // console.log(data);
        return true;
      })
      .catch((err) => {
        console.warn(err);
        return false;
      });
  }

  async deleteCalendar() {
    const init = { ...this.globalInit, method: "DELETE" };
    console.log(init);
    return fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${this.calId}`,
      init
    )
      .then((res) => {
        if (res.ok || res.status == 404) {
          return res.text();
        }
        throw new Error(res.status, res.text());
      })
      .then(async (_) => {
        return true;
      })
      .catch((err) => {
        console.warn(err);
        return false;
      });
  }

  shareCalendar(email) {
    const body = JSON.stringify({
      scope: {
        type: "user",
        value: email,
      },
      role: "reader",
    });
    let init = { ...this.globalInit, method: "POST", body };
    console.log(this.globalInit);
    return fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${this.calId}/acl`,
      init
    )
      .then(async (res) => {
        if (res.ok) {
          return res.json();
        }
        return res.text().then((text) => {
          throw new Error(text);
        });
      })
      .then((data) => {
        console.log(
          `${data.scope.value} has been invited to join your calendar`
        );
        return true;
      })
      .catch((err) => {
        console.warn(err);
        return false;
      });
  }

  async updateCalendar(fetchedSchedule) {
    const fetchAll = (urls, method) => {
      return Promise.all(
        urls.map(({ url, payload }) => {
          const body = payload ? JSON.stringify(payload) : "";
          return fetch(url, {
            ...this.globalInit,
            method,
            body,
          })
            .then((res) => {
              if (!res.ok) {
                throw new Error(res.text());
              }
            })
            .catch((err) => {
              console.log(method);
              throw new Error(err);
            });
        })
      );
    };

    return fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${this.calId}/events`,
      {
        ...this.globalInit,
      }
    )
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
        throw new Error(res.status);
      })
      .then(async (calendarEvents) => {
        // console.log(fetchedSchedule)
        const events = parseDiff(calendarEvents, fetchedSchedule);

        if (
          events.PUT.length == 0 &&
          events.POST.length == 0 &&
          events.DELETE.length == 0
        ) {
          return false;
        }

        await this.addEventsToCalendar(events["POST"], this.calId);
        await fetchAll(
          events["DELETE"].map((eventId) => ({
            url: `https://www.googleapis.com/calendar/v3/calendars/${this.calId}/events/${eventId}`,
          })),
          "DELETE"
        );
        await fetchAll(
          events["PUT"].map(({ payload, eventId }) => ({
            url: `https://www.googleapis.com/calendar/v3/calendars/${this.calId}/events/${eventId}`,
            payload,
          })),
          "PUT"
        );
        return true;
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

  setAuthorizationHeader(tokenType, token) {
    // if(!tokenType || !token) {
    //   console.warn("headers have been removed")
    // }
    this.globalInit.headers = {
      Authorization: `${tokenType} ${token}`,
    };
  }
}
