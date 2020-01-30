// const {Builder, By, Key, until} = require('selenium-webdriver');

// (async function example() {
//     let driver = await new Builder().forBrowser('chrome').build();
//     try {
//         await driver.get('http://www.google.com/ncr');
//         await driver.findElement(By.name('q')).sendKeys('webdriver', Key.RETURN);
//         await driver.wait(until.titleIs('webdriver - Google search'), 3000);
//     } finally {
//         await driver.quit();
//     }
// })();

var wd = require('wd');

// This is for Chromedriver directly. 
// If you are using Selenium, use http://localhost:4444/wd/hub
var browser = wd.promiseRemote();
var URL = 'https://gist.github.com/axemclion/079f8bf1a997e9cfe9f0/'; // Change this to a custom URL

var config = {
    "browserName": "chrome",
    "chromeOptions": {
        "perfLoggingPrefs": {
            "traceCategories": ",blink.console,disabled-by-default-devtools.timeline,benchmark"
        },
        "args": ["--enable-gpu-benchmarking", "--enable-thread-composting"]
    },
    "loggingPrefs": {
        "performance": "ALL"
    }
};

browser.init(config).then(function() {
    console.log('Fetching URL', URL);
    return browser.get(URL);
}).then(function() {
    console.log('Flushing timeline data before we start collecting it for real');
    return browser.log('performance');
}).then(function() {
    console.log('Sending the scroll function to the browser and executing it');
    return browser.execute('(' + scroll.toString() + ')()');
}).then(function() {
    console.log('Wait for scroll to finish. When it finishes, it sets the __scrollComplete__ to true');
    return browser.waitFor({
        asserter: wd.asserters.jsCondition('(window.__scrollComplete__ === true)', false),
        timeout: 1000 * 60 * 10,
        pollFreq: 2000
    });
}).then(function() {
    console.log('Getting actual timeline data - this will take a while');
    return browser.log('performance');
}).then(function(data) {
    console.log('Saving timeline data to a file _perflog.json');
    require('fs').writeFileSync('_perflog.json', JSON.stringify(data.map(function(record) {
        return JSON.parse(record.message).message;
    })), null, 4);
}).fin(function() {
    // Disable the following statement if you want to keep the browser open
    return browser.quit();
}).done();


// This function scrolls the page. Calling this function from the browser dev tools console should also scroll the pgae
var scroll = function() {
    window.chrome.gpuBenchmarking.smoothScrollBy(5000, function() {
        window.__scrollComplete__ = true;
    }, 0, 0, chrome.gpuBenchmarking.DEFAULT_INPUT, 'down', 800);
}