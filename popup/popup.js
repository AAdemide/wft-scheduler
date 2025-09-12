// import { API_STATES } from "../utils/constants";

const wftURL = /https:\/\/wft.homedepot.com\/*/;

const home = document.querySelector("#instruction-page");
const calendarMade = document.querySelector("#calendar-made-page");
const deleteCalButton = document.querySelector("#delete-calendar");
const loading = document.querySelector("#loader-page");
const form = document.querySelector("#form-page");
const failedPage = document.querySelector("#failed-page");
const formButton = form.querySelector("#form-submit");
let calId = {};
let port;
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

let currentPage = Pages.LOADING;
  

const pageElements = {
  instructionPage: document.querySelector("#instruction-page"),
  calendarMade: document.querySelector("#calendar-made-page"),
  deleteCalButton: document.querySelector("#delete-calendar"),
  loading: document.querySelector("#loader-page"),
  form: document.querySelector("#form-page"),
  failedPage: document.querySelector("#failed-page"),
  formButton: form.querySelector("#form-submit"),
  refreshTimeElapsed: document.querySelector("#refresh-time-elapsed"),
  shareCalForm: document.querySelector("#share-cal"),
  updateButton: document.querySelector("#update-calendar"),
  shareButton: document.querySelector("#share-button"),
  shareInput: document.querySelector("#share-to-gmail"),
  shareCalSuccess: document.querySelector("#share-cal-success"),
  shareCalFailed: document.querySelector("#share-cal-failed"),
  emailErr: document.querySelector("#email-error"),
  orb: document.getElementById("cursor-orb"),
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
  currentPage = page;
  pageElements.updateButton.disabled = true;

  if (page == Pages.CALENDAR) {
    pageElements.calendarMade.classList.remove("hidden");
    pageElements.form.classList.add("hidden");
    pageElements.instructionPage.classList.add("hidden");
    pageElements.loading.classList.add("hidden");
    pageElements.failedPage.classList.add("hidden");
  } else if (page == Pages.FORM) {
    pageElements.form.classList.remove("hidden");
    pageElements.calendarMade.classList.add("hidden");
    pageElements.instructionPage.classList.add("hidden");
    pageElements.loading.classList.add("hidden");
    pageElements.failedPage.classList.add("hidden");
  } else if (page == Pages.INSTRUCTIONS) {
    pageElements.instructionPage.classList.remove("hidden");
    pageElements.form.classList.add("hidden");
    pageElements.calendarMade.classList.add("hidden");
    pageElements.loading.classList.add("hidden");
    pageElements.failedPage.classList.add("hidden");
  } else if (page == Pages.LOADING) {
    pageElements.form.classList.add("hidden");
    pageElements.calendarMade.classList.add("hidden");
    pageElements.instructionPage.classList.add("hidden");
    pageElements.failedPage.classList.add("hidden");
    pageElements.loading.classList.remove("hidden");
  } else if (page == Pages.FAILED) {
    pageElements.form.classList.add("hidden");
    pageElements.calendarMade.classList.add("hidden");
    pageElements.instructionPage.classList.add("hidden");
    pageElements.loading.classList.add("hidden");
    pageElements.failedPage.classList.remove("hidden");
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
      if (shareButtonHandled == API_STATES.SUCCESS) {
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
        if (calId) {
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

async function setRefreshTimeElapsed() {
  const res = await chrome.storage.sync.get("refreshTimeElapsed");
  const pastTime = moment(res.refreshTimeElapsed);
  const duration = moment.duration(-1, moment().diff(pastTime));
  pageElements.refreshTimeElapsed.innerText = duration.humanize();
}

function sendMessage(message) {
  if (port) {
    port.postMessage(message);
    return;
  }

  chrome.runtime.sendMessage({ type: "wake-up" }, (response) => {
    console.log(response)
    port = chrome.runtime.connect({ name: "wftSchedulerEventLoop" });
    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(() => {
      port = null;
    });
    port.postMessage(message);
  });
}

function handleMessage(message, sender) {
  // console.log(message);
  const { fetchedJsons, nextPage, updateRefresh, shareButtonHandled } = message;

  // if fetchedJsons == true, check the current page and make the right decision
  if (fetchedJsons == "success" && !calId) {
    changePage(Pages.FORM);
  } else if (fetchedJsons == "success" && calId) {
    pageElements.updateButton.disabled = false;
  } else if (fetchedJsons == "pending" && !calId) {
    changePage(Pages.LOADING);
  } else if (fetchedJsons == "failed" && !calId) {
    changePage(Pages.INSTRUCTIONS);
  } else if (updateRefresh) {
    setRefreshTimeElapsed();
  } else if (shareButtonHandled == "success") {
    pageElements.shareCalSuccess.classList.toggle("hidden");
    setTimeout(() => {
      pageElements.shareCalSuccess.classList.toggle("hidden");
    }, 5000);
  } else if (shareButtonHandled == "failed") {
    pageElements.shareCalFailed.classList.toggle("hidden");
    setTimeout(() => {
      pageElements.shareCalFailed.classList.toggle("hidden");
    }, 5000);
  }
  if (nextPage) {
    changePage(nextPage);
  }
}

function eventListenerSetup() {
  // Regex to validate gmail/googlemail
  const emailRegex = /^[a-zA-Z0-9._%+~-]+@(gmail\.com|googlemail\.com)$/;

  // if (orb && instructionPage) {
    pageElements.instructionPage.addEventListener(
      "mousemove",
      (e) => {
        const rect = pageElements.instructionPage.getBoundingClientRect();
        const x = e.clientX - 100;
        const y = e.clientY - 150;
        orb.style.transform = `translate(${x}px, ${y}px)`;
      },
      { passive: true }
    );
  //}

  // questionReady is to check whether thdAuthState [ workforce has been logged into]
  if (calId) {
    changePage(Pages.CALENDAR);
    pageElements.shareCalForm.addEventListener("submit", (event) => {
      event.preventDefault();
      sendMessage({
        shareButtonClicked: {
          calId,
          email: event.target[0].value,
        },
      });
      event.target[0].value = "";
      event.target[1].disabled = true;
    });

    pageElements.updateButton.addEventListener("click", () => {
      sendMessage({
        updateButtonClicked: { calId },
      });
    });
  }

  pageElements.shareInput.addEventListener("input", function () {
    const value = pageElements.shareInput.value.trim();

    const isValidEmail = emailRegex.test(value);

    if (value === "" || isValidEmail) {
      errorMsg.classList.add("hidden");
    } else {
      errorMsg.classList.remove("hidden");
    }

    pageElements.shareButton.disabled = !isValidEmail;
  });

  pageElements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = getFormData();
    sendMessage({ addEvents: true, formData, calId });
  });

  pageElements.deleteCalButton.addEventListener("click", () => {
    sendMessage({ delCal: true, calId });
  });
}

window.onload = async function () {
  calId = await getCalId();
  setRefreshTimeElapsed();

  chrome.runtime.sendMessage({ type: "wake-up" }, (response) => {
    port = chrome.runtime.connect({ name: "wftSchedulerEventLoop" });
    port.onMessage.addListener(handleMessage);
  });

  eventListenerSetup();
};
