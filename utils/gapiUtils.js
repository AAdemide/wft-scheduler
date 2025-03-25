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
  const addToCalendarList = (reminder = defaultReminder, id) => {
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
    console.log(id)
    let init = { ...globalInit };
    const location = formData.location;
    init.method = "POST";
    // Promise.all(
    //   events.map((event) =>
    //     fetch(`https://www.googleapis.com/calendar/v3/calendars/${id}/events`, {
    //       ...init,
    //       body: JSON.stringify(event),
    //     })
    //   )
    // )
    //   .then((res) => res.map((i) => i.json()))
    //   .then((data) => {
    //     console.log(JSON.parse(JSON.stringify(data)));
    //     apiState = 2;
    //   })
    //   .catch((err) => {
    //     console.log(err);
    //     apiState = -1;
    //   });
    apiState = 2;
  };
  const getOAuthToken = () => {
    chrome.identity.launchWebAuthFlow(
      { url: auth_url, interactive: true },
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
    