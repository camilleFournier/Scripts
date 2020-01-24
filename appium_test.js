//Appium test run

const {Builder, By, Key, until} = require('selenium-webdriver');

const opts = {
    port: 4723,
    capabilities: {
      platformName: "Android",
      platformVersion: "9",
      deviceName: "Genymotion",
      browserName: 'Chrome',
      automationName: "UiAutomator2"
    }
};



(async function example() {
    let driver = await new Builder().forBrowser('chrome').build();
    try {
        // Navigate to Url
        await driver.get('https://www.google.com');

        // Enter text "cheese" and perform keyboard action "Enter"
        await driver.findElement(By.name('q')).sendKeys('cheese', Key.ENTER);

        let firstResult = await driver.wait(until.elementLocated(By.css('h3>div')), 10000);

        console.log(await firstResult.getAttribute('textContent'));
    }
    finally{
        driver.quit();
    }
})();
  