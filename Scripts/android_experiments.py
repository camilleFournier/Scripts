# Imports the monkeyrunner modules used by this program
from com.android.monkeyrunner import MonkeyRunner, MonkeyDevice
import re
import time

native_p = 'com.example.benchmark'
native_a = '.controller.MainActivity'
react_native_p = 'com.benchmarkhybrid'
react_native_a = '.MainActivity'
maxScrollText = 6
maxScrollPicture = 7
#time unit is second
scroll_duration = 0.05
scroll_interval = 0.3
click_interval = 0.05 

def main():
    e = Experiment('samsung_s6', 100)
    def doExperiments(package, activity):
        e.startApp(package, activity)
        e.clickingExperiment()
        e.clickingExperiment(True)
        e.scrollingExperiment()
        e.scrollingExperiment(True)

    doExperiments(native_p, native_a)
    doExperiments(react_native_p, react_native_a)
    # experiment.goToScrolling()
    # experiment.scrollingExperiment()
    # experiment.goBack()
    # experiment.goToScrolling()
    # experiment.changeContent()
    # experiment.scrollingExperiment()
    # experiment.startApp(react_native)
    # experiment.goToScrolling()
    # experiment.scrollingExperiment()
    # experiment.goBack()
    # experiment.goToScrolling()
    # experiment.changeContent()
    # experiment.scrollingExperiment()

class Experiment:
    scrolling = False
    clicking = False
    package = ''
    content = 'text'
    activity = ''
    scrollPos = 0
    scrollDir = 1

    def __init__(self, device_name, nbMeasures):
        self.nbMeasures = nbMeasures
        self.device_name = device_name
        self.device =  MonkeyRunner.waitForConnection()
        self.height = int(self.device.getProperty('display.height'))
        self.width = int(self.device.getProperty('display.width'))
    
    def startApp(self, package, activity):
        self.package = package
        self.device.startActivity(component=package + '/' + package + activity)
        time.sleep(5)

    def goToScrolling(self):
        y = int(self.height*0.57)
        x = int(self.width//2)
        self.device.touch(x, y, 'DOWN_AND_UP')
        time.sleep(0.5) #wait for phone to handle input

    def goToClicking(self):
        y = int(self.height*0.67)
        x = self.width//2
        self.device.touch(x, y, 'DOWN_AND_UP')
        time.sleep(0.5) #wait for phone to handle input

    def goBack(self):
        y = int(self.height*0.1)
        x = int(self.width*0.1)
        self.device.touch(x, y, 'DOWN_AND_UP')
        self.content = 'text'
        self.scrollPos = 0
        self.scrollDir = 1
        time.sleep(0.5) #wait for phone to handle input

    def changeContent(self):
        y = int(self.height*0.1)
        x = int(self.width*0.9)
        self.device.touch(x, y, 'DOWN_AND_UP')
        self.content = 'text' if self.content == 'picture' else 'picture'
        self.scrollPos = 0
        self.scrollDir = 1
        time.sleep(0.5) #wait for phone to handle input
    
    def scroll(self, duration):
        start = (int(self.width//2), int(self.height//4*3))
        end = (int(self.width//2), int(self.height//8))
        nbScroll = duration // (scroll_interval + scroll_duration)
        maxScroll = maxScrollText if self.content == 'text' else maxScrollPicture
        for i in range(nbScroll):
            if (self.scrollDir > 0):
                self.device.drag(start, end, scroll_duration)
                self.scrollPos+=1
                if (self.scrollPos >= maxScroll):
                    self.scrollDir = -1
            else:
                self.device.drag(end, start, scroll_duration)
                self.scrollPos-=1
                if (self.scrollPos <= 0):
                    self.scrollDir = 1
            print('scroll ' + str(self.scrollPos))
            time.sleep(scroll_interval)

    def click(self, duration): #duration of clicking in seconds
        y = int(self.height//2)
        x = int(self.width//2)
        nbClicks = duration//click_interval 
        for j in range(nbClicks):
            self.device.touch(x, y, 'DOWN_AND_UP')
            time.sleep(click_interval)

    
    def extractFramestats(self):
        label = '---PROFILEDATA---'
        output = self.device.shell("dumpsys gfxinfo " + self.package + " framestats reset")
        start = output.find(label)
        end = output.rfind(label)
        data = output[start:end+len(label)]
        return data
    
    def saveToFile(self, metric, index, action, data):
        app = 'native' if self.package == native_p else 'hybrid'
        filename = app + '/' + self.device_name + '/' + self.content + '/' + action + '/' + metric + '_'  + str(index+1) + '.txt'
        file = open(filename, 'w')
        file.write(data)


    def clickingExperiment(self, showPicture=False):
        for i in range(self.nbMeasures):
            self.goToClicking()
            if (showPicture):
                self.changeContent()
            time.sleep(1)
            self.click(3)
            data = self.extractFramestats()
            self.saveToFile('framestats', i, 'clicking', data)
            self.goBack()

    def scrollingExperiment(self, showPicture=False):
        for i in range(self.nbMeasures):
            self.goToScrolling()
            if (showPicture):
                self.changeContent()
            time.sleep(1)
            self.scroll(3)
            data = self.extractFramestats()
            self.saveToFile('framestats', i, 'scrolling', data)
            self.goBack()
            


main()