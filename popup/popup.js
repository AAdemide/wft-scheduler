const wftURL = /https:\/\/wft.homedepot.com\/*/;

const home = window.document.querySelector("#instruction-page");
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
  // console.log("changed to page", page);

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
  const startTime = Date.now();
  const poller = setInterval(() => {
    chrome.runtime.sendMessage(message, (res) => {
      // console.log(
      //   "polling with message:",
      //   message,
      //   "\n",
      //   "response received in popup.js",
      //   res
      // );
      const { apiState, nextPage, ready } = res ?? {};
      // temporary ? solution
      if (apiState === "failed") {
        // button.disabled = false;
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
        // button.disabled = false;
        if (nextPage != "loading") {
          // console.log("polling should stop");
          clearInterval(poller);
        }
        changePage(nextPage);
      }
      // else if (Date.now() - startTime > timeout) {
      //   console.log("Timeout reached, stopping poll");
      //   // button.disabled = false;
      //   clearInterval(poller);
      // }
      else if (apiState === "waiting") {
        changePage(Pages.LOADING);
      }
    });
  }, interval);
}

window.onload = async function () {
  calID = await getCalId();
  apiStatePoll({ questionReady: true }, undefined, undefined);

  form.onsubmit = async (event) => {
    event.preventDefault();
    // formButton.disabled = true;
    const formData = getFormData();

    apiStatePoll({ addEvents: true, formData, calID });
  };

  deleteCalButton.onclick = async () => {
    // deleteCalButton.disabled = true;

    apiStatePoll({ delCal: true, calID });
  };
};
