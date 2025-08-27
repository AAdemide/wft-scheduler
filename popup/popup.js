const wftURL = /https:\/\/wft.homedepot.com\/*/;

const home = document.querySelector("#instruction-page");
const calendarMade = document.querySelector("#calendar-made-page");
const deleteCalButton = document.querySelector("#delete-calendar");
const loading = document.querySelector("#loader-page");
const form = document.querySelector("#form-page");
const failedPage = document.querySelector("#failed-page");
const formButton = form.querySelector("#form-submit");
let calID = {};
const interval = 100;
let countInterval;
const maxInterval = 100;
const Pages = {
  FORM: "form",
  CALENDAR: "calendar",
  INSTRUCTIONS: "instructions",
  LOADING: "loading",
  FAILED: "failed",
};

function getFormData() {
  const formData = {};
  for (let [key, value] of new FormData(form)) {
    formData[key] = value;
  }
  return formData;
}

async function getCalId() {
  const myID = await chrome.storage.sync.get("WFT-Scheduler Calendar ID");
  return myID["WFT-Scheduler Calendar ID"] ?? null;
}

function changePage(page) {
  if (page == Pages.CALENDAR) {
    calendarMade.classList.remove("hidden");
    form.classList.add("hidden");
    home.classList.add("hidden");
    loading.classList.add("hidden");
    failedPage.classList.add("hidden");
  } else if (page == Pages.FORM) {
    form.classList.remove("hidden");
    calendarMade.classList.add("hidden");
    home.classList.add("hidden");
    loading.classList.add("hidden");
    failedPage.classList.add("hidden");
  } else if (page == Pages.INSTRUCTIONS) {
    home.classList.remove("hidden");
    form.classList.add("hidden");
    calendarMade.classList.add("hidden");
    loading.classList.add("hidden");
    failedPage.classList.add("hidden");

    apiStatePoll({ makeIdle: true, questionReady: true });
  } else if (page == Pages.LOADING) {
    form.classList.add("hidden");
    calendarMade.classList.add("hidden");
    home.classList.add("hidden");
    failedPage.classList.add("hidden");
    loading.classList.remove("hidden");
  } else if (page == Pages.FAILED) {
    form.classList.add("hidden");
    calendarMade.classList.add("hidden");
    home.classList.add("hidden");
    loading.classList.add("hidden");
    failedPage.classList.remove("hidden");
  }
}

function apiStatePoll(message, timeout = 5000) {
  const poller = setInterval(() => {
    chrome.runtime.sendMessage(message, (res) => {
      const {
        apiState,
        nextPage,
        ready,
        wftAuthenticated,
        shareButtonHandled,
      } = res ?? {};
      if (shareButtonHandled) {
        const shareButton = document.querySelector("#share-button");
        if (shareButtonHandled == "success") {
          shareButton.disabled = false;
          const shareCalSuccess = document.querySelector("#share-cal-success");

          shareCalSuccess.classList.toggle("hidden");
          setTimeout(() => {
            shareCalSuccess.classList.toggle("hidden");
          }, 5000);
          clearInterval(poller);
        } else if (shareButtonHandled == "failed") {
          // failed displayed
          shareButton.disabled = false;
          const shareCalFailed = document.querySelector("#share-cal-failed");

          shareCalFailed.classList.toggle("hidden");
          setTimeout(() => {
            shareCalFailed.classList.toggle("hidden");
          }, 5000);
          clearInterval(poller);
        } else {
          //button disabled
          shareButton.disabled = true;
        }
      } else if (apiState === "failed") {
        clearInterval(poller);
        changePage(Pages.FAILED);
      } else if (ready) {
        //check if authState is successful (not done yet) and if there is a valid calendar ID, show the delete/update page
        if (calID) {
          clearInterval(poller);
          changePage(Pages.CALENDAR);
        }
      }
      // changes to the page requested by the background script
      else if (nextPage) {
        // console.log(nextPage);
        if (nextPage != "loading") {
          // console.log("polling should stop");
          clearInterval(poller);
        }
        changePage(nextPage);
      } else if (apiState === "waiting") {
        changePage(Pages.LOADING);
      }
    });
  }, interval);
}

window.onload = async function () {
  const refreshTimeElapsed = document.querySelector("#refresh-time-elapsed");
  const addUserForm = document.querySelector("#add-user");
  const updateButton = document.querySelector("#update-calendar");

  const res = await chrome.storage.sync.get("refreshTimeElapsed");
  const pastTime = moment(res.refreshTimeElapsed);
  const duration = moment.duration(moment().diff(pastTime));
  refreshTimeElapsed.innerText = duration.humanize();
  calID = await getCalId();
  // questionReady is to check whether thdAuthState [ workforce has been logged into]
  if (calID) {
    changePage(Pages.CALENDAR);
    addUserForm.addEventListener("submit", (event) => {
      event.preventDefault();
      apiStatePoll(
        {
          shareButtonClicked: {
            calID,
            email: "ademideakinsefunmi@gmail.com",
          },
        });
    });

    updateButton.addEventListener("click", () => {
      apiStatePoll({
        updateButtonClicked: calID
      });
    })
  } else {
    apiStatePoll({ questionReady: true }, undefined, undefined);
  }

  form.onsubmit = async (event) => {
    event.preventDefault();
    const formData = getFormData();
    apiStatePoll({ addEvents: true, formData, calID });
  };

  deleteCalButton.onclick = async () => {
    apiStatePoll({ delCal: true, calID });
  };
};
