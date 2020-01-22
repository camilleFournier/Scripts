# Imports the monkeyrunner modules used by this program
from com.android.monkeyrunner import MonkeyRunner, MonkeyDevice
import re

# Connects to the current device, returning a MonkeyDevice object
device = MonkeyRunner.waitForConnection()

# Installs the Android package. Notice that this method returns a boolean, so you can test
# to see if the installation worked.
# device.installPackage('myproject/bin/MyApplication.apk')

# sets a variable with the package's internal name
package = 'com.example.testprofiler'

# sets a variable with the name of an Activity in the package
activity = package + '.MainActivity'

# sets the name of the component to start
runComponent = package + '/' + activity


def getData(clock, gfxinfo, cpuinfo, meminfo):
    time = device.getProperty('clock.realtime')
    clock.append(time)
    gfxinfo.append(device.shell("dumpsys gfxinfo " + package + " reset"))
    cpuinfo.append(device.shell("dumpsys cpuinfo "))
    meminfo.append(device.shell("dumpsys meminfo " + package))

def writeData(file, clock, gfxinfo, cpuinfo, meminfo):
    for i in range(len(clock)):
        time = clock[i]
        fps = getFPS(gfxinfo[i])
        cpu = getCPU(cpuinfo[i])
        pss = getMemory(meminfo[i])

        file.write(time + ", " + fps[0] + ", " + fps[1] + ", " + cpu + ", " + pss + "\n")

# return [totalframes, jankyFrames]
def getFPS(data):
    dataLines = data.splitlines()
    i = 0
    line = dataLines[0]
    while 'Total frames' not in line:
        i+=1
        line = dataLines[i]
    print(line)
    totalFrame = re.findall(r'\d+', line)[0]
    line = dataLines[i+1]
    print(line)
    jankyFrame = re.findall(r'\d+', line)[0]
    return [totalFrame, jankyFrame]

def getCPU(data):
    # get cpu usage
    dataLines = data.splitlines()
    i = 0
    line = dataLines[0]
    while (package not in line) and (i<len(dataLines)-1):
        i+=1
        line = dataLines[i]
    print(line)
    cpu = re.findall(r'\d+%', line)[0]
    return cpu

def getMemory(data):
    # get memory
    dataLines = data.splitlines()
    i = 0
    line = dataLines[0]
    while ('TOTAL SWAP PSS' not in line) and (i<len(dataLines)-1):
        i+=1
        line = dataLines[i]
    print(line)
    pss = re.findall(r'\d+', line)[0]
    return pss

def doExperiment():
    # Runs the component
    file = open('emulator.txt', 'at')
    file.write('Clock, Total frames rendered, Janky frames, CPU%, PSS \n')
    
    # Number of experiments
    for loop in range(10):
        clock = []
        gfxinfo = []
        cpuinfo = []
        meminfo = []

        device.startActivity(component=runComponent)
        MonkeyRunner.sleep(10) #wait for it to be properly started
        device.shell("dumpsys gfxinfo " + package + " reset") # Reset to have stats only from stable state (after launching)
        time = device.getProperty('clock.realtime')
        print(time)
        file.write(time + "\n")

        # Number of entry in one experiment
        for loop in range(10):
            MonkeyRunner.sleep(310) #wait little more than 5min so cpuinfo is updated
            getData(clock, gfxinfo, cpuinfo, meminfo)
        # device.shell("am force-stop " + package)
        # device.shell("am kill "+ package)
        device.reboot("None")
        writeData(file, clock, gfxinfo, cpuinfo, meminfo)

    file.close()

doExperiment()




