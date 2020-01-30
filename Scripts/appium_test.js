//Appium test run

const wdio = require("webdriverio");
const fs = require('fs');

const opts = {
    port: 4723,
    capabilities: {
      platformName: "Android",
      platformVersion: "9",
      deviceName: "Samsung Galaxy S9",
      browserName: 'Chrome',
      automationName: "UiAutomator2",
      chromedriverExecutable: "C:/Users/Camille FOURNIER/Documents/Webdrivers/chromedriver.exe",
      enablePerformanceLogging: true,
      chromeOptions: {
          perfLoggingPrefs : {
            enableNetwork: false,
            traceCategories: "toplevel,disabled-by-default-devtools.timeline.frame,blink.console,disabled-by-default-devtools.timeline,benchmark"
          },
          w3c: false
      }
    }
};

var data;


async function main () {
    const browser = await wdio.remote(opts);
    await browser.url('https://duckduckgo.com');
    console.log(await browser.executeScript('SystemInfo.getInfo();', []));
    // data = await browser.getLogs('performance');
    const inputElem = await browser.$('#search_form_input_homepage')
    await inputElem.setValue('WebdriverIO')

    const submitBtn = await browser.$('#search_button_homepage')
    await submitBtn.click()
    // data = await browser.getLogs('performance'); 
    // fs.writeFileSync('appium.json', data);
    // fs.writeFileSync('appium.json', data.map(function(s) {
    //     return (JSON.stringify(JSON.parse(s.message).message) + "\n"); // This is needed since Selenium spits out logs as strings
    // }));

    // console.log(data.map(s => (JSON.parse(s.message).message)));
    
    // console.log(await browser.getTitle()) // outputs: "Title is: WebdriverIO (Software) at DuckDuckGo"
  
    await browser.deleteSession();
}

function processData() {
  var datafile = fs.readFileSync('appium.json');
  var datajson = JSON.parse(datafile);

  var dataTracing = datajson.filter(data => data.method === 'Tracing.dataCollected');
    var result = [];
    for (var j=0; j<dataTracing.length; j++) {
        var isNew = true
        for (var i=0; i<result.length; i++) {
            if (result[i].name == dataTracing[j].cat) {
                result[i].number ++;
                isNew = false;
            }
        }
        if (isNew) {
            result.push({name: dataTracing[j].params.cat, number: 1});
        }
    }
    console.log(result);
}
  
main();