import {
  API_STATES,
  Pages,
  THD_AUTH_STATES,
} from "../utils/constants.js";
import PopupPOM from "../utils/popupPOM.js";

let calId = {};
let port;
let pom;

async function getCalId() {
  const myID = await chrome.storage.sync.get("WFT-Scheduler Calendar ID");
  return myID["WFT-Scheduler Calendar ID"] ?? null;
}

function sendMessage(message) {
  try {  
    port.postMessage(message);
    return;
  } catch (error) {
    console.warn("Port send failed", port);
    chrome.runtime.sendMessage({ type: "wake-up", origin: "popup" }, (response) => {
      port = chrome.runtime.connect({ name: "wftSchedulerEventLoop" });
      port.onMessage.addListener(handleMessage);
      port.onDisconnect.addListener(() => {
        port = null;
      });
      port.postMessage(message);
    });
  }

}

function handleMessage(message, _sender) {
  console.log(message)
  const {
    fetchedJsons,
    nextPage,
    updateRefresh,
    shareButtonHandled,
    updateButtonClicked,
    openModal,
    modalMessage
  } = message;

  if (fetchedJsons == THD_AUTH_STATES.AUTH_SUCCESS && !calId) {
    pom.changePage(Pages.FORM);
  } else if (fetchedJsons == THD_AUTH_STATES.AUTH_SUCCESS && calId) {
    pom.updateButton.disabled = false;
  } else if (fetchedJsons == THD_AUTH_STATES.AUTHENTICATING && !calId) {
    pom.changePage(Pages.LOADING);
  } else if (fetchedJsons == THD_AUTH_STATES.AUTH_FAILED && !calId) {
    pom.changePage(Pages.INSTRUCTIONS);
  } else if (updateRefresh) {
    pom.setRefreshTimeElapsed();
  } else if (shareButtonHandled == API_STATES.SUCCESS) {
    pom.flashMessage(pom.shareCalSuccess);
  } else if (shareButtonHandled == API_STATES.FAILED) {
    pom.flashMessage(pom.shareCalFailed);
  } else if (updateButtonClicked == API_STATES.SUCCESS) {
    pom.flashMessage(pom.updateCalSuccess);
  } else if (updateButtonClicked == API_STATES.FAILED) {
    pom.flashMessage(pom.calUpToDate);
  } else if (openModal) {
    pom.setModalMessage(modalMessage);
    pom.modalOpen();
  }
  if (nextPage) {
    pom.changePage(nextPage);
  }
}

window.onload = async function () {
  calId = await getCalId();
  pom = new PopupPOM(calId, sendMessage);
  pom.setRefreshTimeElapsed();
  pom.modalClose();

  chrome.runtime.sendMessage({ type: "wake-up", origin: "popup" }, (_res) => {
    port = chrome.runtime.connect({ name: "wftSchedulerEventLoop" });
    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(() => {
      pom.updateButton.disabled = true;
    });
  });
};
