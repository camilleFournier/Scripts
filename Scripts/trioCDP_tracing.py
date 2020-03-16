# FOR DESKTOP :
# go to file location C:\Program Files (x86)\Google\Chrome\Application
# open chrome with cmd line : 
# chrome.exe --remote-debugging-port=9000
# go to localhost:9000/json
# copy one websocket address into cdp_uri (ws: format)
# execute this file

# FOR ANDROID:
# Enable USB debugging
# enter cmd line :
# adb (-s device if several) forward tcp:9222 localabstract:chrome_devtools_remote
# go to localhost:9222/json
# you will find websocket address for both app and service worker

# To make single CPU work :  changed the file _init_ de trio_cdp (Python38/lib/site-packages/trio_cdp)
# to not have only flatten connections

import logging
import os
import sys
import time

from cdp import target, page, tracing
import cdp.input
import cdp.tracing
import trio
from trio_cdp import open_cdp_connection

# Configuring log system
log_level = os.environ.get('LOG_LEVEL', 'info').upper()
logging.basicConfig(level=getattr(logging, log_level))
logger = logging.getLogger('monitor')
logging.getLogger('trio-websocket').setLevel(logging.WARNING)

uri_pwa = 'ws://localhost:9222/devtools/page/C3A9BAFF42907EAD768BFD22A424139A'
name = 'pwa_auto_input/manual_fast_tap/pwa_50_input_trace'
# name = 'pwa_touch_trace'

traceConfig = tracing.TraceConfig(
    record_mode='recordAsMuchAsPossible',
    enable_sampling=True,
    included_categories= [
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        # 'toplevel',
        'gpu',
        'ipc',
        # 'disabled-by-default-v8',
        # 'disabled-by-default-v8.cpu_profiler',
        'devtools.timeline',
        'devtools',
        # 'ServiceWorker',
        # "v8.execute",
        # "blink.user_timing",
        # 'benchmark'
    ]
)

def findPWA(target):
    return (target.type == 'page')



async def generateTrace(session, outfile, final_data):
    # handles DataCollected events
    async def collectData():
        async for event in session.listen(cdp.tracing.DataCollected):
            logger.info('Data received')
            # Convert data into correct and readable json
            data = ',\n'.join(map(str, event.value))
            # data = data.replace("'", "\"").replace("True", "true").replace("False", "false").replace("class=\"", "class='").replace("\"\"}", "'\"}")
            data = data.replace("True", "true").replace("False", "false").replace("\"\"}", "'\"}").replace("'", "\"").replace("class=\"", "class='").replace("\"\"", "'\"").replace(":'\"", ":\"\"").replace(": '\"", ":\"\"")
            final_data.append(data)
            # Write into file
            # await outfile.write(data)

    # handles TracingComplete event
    async def dataComplete(nursery):
        async for event in session.listen(cdp.tracing.TracingComplete):
            logger.info('{}: Data completed'.format(trio.current_time()))
            logger.info(event)
            nursery.cancel_scope.cancel()

    # handles bufferUsage events (that should be sent, but didn't received any in all my tests)
    async def bufferUsage():
        async for event in session.listen(tracing.BufferUsage):
            logger.info('{} events recorded. \n percentFull {:0.1f}% \n value {:0.1f}%'.format(event.eventCount, event.percentFull*100, event.value*100))

    async def simulateTouch():
        await session.execute(cdp.input.synthesize_tap_gesture(180, 303))
        await trio.sleep(0.02)
        await simulateTouch()
    
    async def tracing():
        # trace for around 10 seconds
        await session.execute(cdp.tracing.start(buffer_usage_reporting_interval=500, trace_config=traceConfig))
        await trio.sleep(10)
        await session.execute(cdp.tracing.end())
        print('tracing end')

    # run event handlers in parallel 
    async with trio.open_nursery() as nursery:
        nursery.start_soon(collectData)
        nursery.start_soon(dataComplete, nursery)
        # nursery.start_soon(simulateTouch)
        nursery.start_soon(tracing)
        # await session.execute(tracing.start(buffer_usage_reporting_interval=500, trace_config=traceConfig))
        # await trio.sleep(10)
        # await session.execute(tracing.end())
        # print('tracing end')
    


        


async def main(i):
    # Open connection
    async with open_cdp_connection(uri_pwa) as conn:
        logger.info('Connecting')
        targets = await conn.execute(target.get_targets())
        # Filter the targets to find the PWA one
        targets = list(filter(findPWA, targets))
        logger.info(targets[0])
        target_id = targets[0].target_id

        logger.info('Attaching to target id=%s', target_id)
        session = await conn.open_session(target_id)

        final_data = []
        def addData(data):
            final_data+=data

        outfile_path = trio.Path(name + '_' + str(i) + '.json')
        async with await outfile_path.open('a+') as outfile:
            logger.info('Tracing...')
            # write things to file to be readable as a json
            await outfile.write('[')
            # data = '['
            await generateTrace(session, outfile, final_data)
            logger.info('Tracing n° {} ended'.format(i))
            await outfile.write(',\n'.join(final_data))
            await outfile.write("]")

for i in range(1, 2):
    time.sleep(30)
    trio.run(main, 7)

