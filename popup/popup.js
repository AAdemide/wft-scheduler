const wftURL = /https:\/\/wft.homedepot.com\/*/;

const main = window.document.querySelector("main");
const form = document.querySelector("form");
const calendarMade = document.querySelector("#calendar-made");
const deleteCalButton = document.querySelector("#delete-calendar");
const formButton = form.querySelector("form > button");
let id = {};
const interval = 100;
let countInterval;
const maxInterval = 100;

window.onload = async function () {
  id = await chrome.storage.sync.get("WFT-Scheduler Calendar ID");
  id = Object.keys(id).length==0 ? id : id['WFT-Scheduler Calendar ID'];
  console.log(id);
  const loginChecker = setInterval( () => {
    chrome.runtime.sendMessage({question: "ready"}, (res) => {
      console.log("ready to fetch:", res.ready)
      if (res.ready) {
          clearInterval(loginChecker);
        if (Object.keys(id).length != 0) {
          form.classList.add("hidden");
          main.classList.add("hidden");
          calendarMade.classList.remove("hidden");
        } else {
          form.classList.remove("hidden");
          calendarMade.classList.add("hidden");
          main.classList.add("hidden");
        }
      } else {
        form.classList.add("hidden");
        calendarMade.classList.add("hidden");
        main.classList.remove("hidden");
      }
    })}, interval );
  
  
  form.onsubmit = async (event) => {
    event.preventDefault();
    formButton.disabled = true;
    id = await chrome.storage.sync.get("WFT-Scheduler Calendar ID");
    id = Object.keys(id).length==0 ? id : id['WFT-Scheduler Calendar ID'];
    console.log(id);
    let formData = {};
    for(let [key, value] of new FormData(form) ) {
      formData[key] = value;
    }
    const apiStateChecker = setInterval(()=>{
      chrome.runtime.sendMessage(
        { add: "events", formData: formData, id: id},
        (res) => {
          console.log("waiting")
          if (res.apiState == "success"){
            form.classList.add("hidden");
            calendarMade.classList.remove("hidden");
            formButton.disabled = false;
            clearInterval(apiStateChecker)
          } else if (res.apiState == "failed"){
            clearInterval(apiStateChecker)
            console.log("failed");
            formButton.disabled = false;
          }
          
        }
      );
    }, interval)
  };
  deleteCalButton.onclick = async () => {
    id = await chrome.storage.sync.get("WFT-Scheduler Calendar ID");
    id = Object.keys(id).length==0 ? id : id['WFT-Scheduler Calendar ID'];
    deleteCalButton.disabled = true;
    
      const apiStateChecker2 = setInterval(()=>{
        chrome.runtime.sendMessage(
          { delete: "calendar", id: id},
          (res) => {
            console.log(res.apiState)
            if (res.apiState == "success"){
              console.log("success end interval")
              clearInterval(apiStateChecker2)
              form.classList.remove("hidden");
              calendarMade.classList.add("hidden");
              deleteCalButton.disabled = false;
              
            } else if (res.apiState == "failed"){
              clearInterval(apiStateChecker2)
              console.log("failed");
              deleteCalButton.disabled = false;
            }
            
          }
        );
      }, interval)
    
  };
};