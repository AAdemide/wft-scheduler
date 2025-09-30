window.onload = () => {
    chrome.runtime.sendMessage({ type: "wake-up", origin: "content-script" }, (_res) => {

    });
}

