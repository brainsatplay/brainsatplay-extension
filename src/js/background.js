const extensions = ["devtools-page"]

// --------------- Allow for running after update (broken...) ---------------
chrome.runtime.onInstalled.addListener(async (details) => {

  // Open Onboarding Page
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({
      url: 'https://brainsatplay.com/workflow' // Change to the main workflow page
    });
  }

  for (const cs of chrome.runtime.getManifest().content_scripts) {
    for (const tab of await chrome.tabs.query({url: cs.matches})) {
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: cs.js,
      });
    }
  }
});

// --------------- Assign Connections ---------------
var connections = {};
var ports = {};


const sendTo = (id, message) => {

  for (let name in ports[id]) {
    const msg = { ...message }
    delete msg.tabId

    const port = ports[id][name]
    port.postMessage(msg)
  }
}



var extensionListener = function (port, message, sender) {


  // ------------------------- Create Context Menu for Extension -------------------------
  chrome.contextMenus.create({
    title: "Inspect Element",
    contexts: ["all"],
    id: "brainsatplay-inspect-element"
  })
  
  chrome.contextMenus.onClicked.addListener((info, tab) => sender.postMessage({ inspect: true }))


  // ------------------ Initialize Connection ------------------
  if (message.name == "init") {
    connections[message.tabId] = port;
    sendTo(message.tabId, message)
    return;
  } 

  // ------------------ Script Injection ------------------
  else if (message.script) {
        chrome.scripting.executeScript({ target: {tabId: message.tabId}, files: [message.script] })
        sender.postMessage({ message: `${message.script} has been added as a content script!` });
  } 
    
  // Forward to Connected Scripts
  else {
    sendTo(message.tabId, message)
  }
}

chrome.runtime.onConnect.addListener(function (port) {

    if (extensions.includes(port.name)) {

      // Listen to messages sent from the DevTools page
      const liveListener = (...args) => extensionListener(port, ...args)
      port.onMessage.addListener(liveListener);

      port.onDisconnect.addListener(function(port) {
          port.onMessage.removeListener(liveListener);
          var tabs = Object.keys(connections);
          for (var i=0, len=tabs.length; i < len; i++) {
            if (connections[tabs[i]] == port) {
              delete connections[tabs[i]]
              break;
            }
          }
      });

    } else {

      let tabs = []

        port.onDisconnect.addListener(function(port) {
          tabs.forEach(id => delete ports[id][port.name])
        })

        port.onMessage.addListener((message, port) => {

          // -------------------- Shortcut Commands --------------------
          if (message.command === 'openOptions') chrome.runtime.openOptionsPage()
          if (message.command === 'echo') port.postMessage(message)

          // -------------------- Other Commands --------------------
          else {
            const sender = port.sender
            // Messages from content scripts should have sender.tab set
            if (sender.tab) {
              var tabId = sender.tab.id;

              tabs.push(tabId)

              // Register sender
              if (!ports[tabId]) ports[tabId] = {}
              if (!ports[tabId][sender.id]) ports[tabId][sender.id] = port

              // Post to connections
              if (tabId in connections) connections[tabId].postMessage(message);
              else console.log("Tab not found in connection list.");
            } else {
              console.log("sender.tab not defined.");
            }
            return true;
        }
      })
    }
});