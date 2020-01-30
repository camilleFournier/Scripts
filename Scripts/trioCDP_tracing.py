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


import logging
import os
import sys

from cdp import target, page, tracing
import trio
from trio_cdp import open_cdp_connection

# Configuring log system
log_level = os.environ.get('LOG_LEVEL', 'info').upper()
logging.basicConfig(level=getattr(logging, log_level))
logger = logging.getLogger('monitor')
logging.getLogger('trio-websocket').setLevel(logging.WARNING)

uri_pwa = 'ws://localhost:9222/devtools/page/114851EC1B6E303B258D817C1FFAB53B'
path = 'trace_pwa.json'

traceConfig = tracing.TraceConfig(
    record_mode='recordContinuously',
    enable_sampling=True,
    included_categories= [
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'disabled-by-default-v8',
        'disabled-by-default-v8.cpu_profiler',
        'devtools.timeline',
        'devtools',
        'ServiceWorker',
        "v8.execute",
        "blink.user_timing"
        'benchmark']
)

def findPWA(target):
    return (target.type == 'page')

async def generateTrace(session, outfile):
    # handles DataCollected events
    async def collectData():
        async for event in session.listen(tracing.DataCollected):
            logger.info('Data received')
            # Convert data into correct and readable json
            data = ',\n'.join([str(item) for item in event.value])
            data+=',\n'
            data = data.replace("'", "\"").replace("True", "true").replace("False", "false").replace("class=\"", "class='").replace("\"\"}", "'\"}")
            # Write into file
            await outfile.write(data)

    # handles TracingComplete event
    async def dataComplete(nursery):
        async for event in session.listen(tracing.TracingComplete):
            logger.info('{}: Data completed'.format(trio.current_time()))
            logger.info(event.data_loss_occurred)
            nursery.cancel_scope.cancel()

    # handles bufferUsage events (that should be sent, but didn't received any in all my tests)
    async def bufferUsage():
        async for event in session.listen(tracing.BufferUsage):
            logger.info('{} events recorded. \n percentFull {:0.1f}% \n value {:0.1f}%'.format(event.eventCount, event.percentFull*100, event.value*100))
    
    # run event handlers in parallel 
    async with trio.open_nursery() as nursery:
        nursery.start_soon(collectData)
        nursery.start_soon(dataComplete, nursery)

        # trace for around 6 seconds
        await session.execute(tracing.start(buffer_usage_reporting_interval=500, trace_config=traceConfig))
        await trio.sleep(6)
        await session.execute(tracing.end())

async def main():
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

        outfile_path = trio.Path(path)
        async with await outfile_path.open('a') as outfile:
            logger.info('{}: Tracing...'.format(trio.current_time()))
            # write things to file to be readable as a json
            await outfile.write('[')
            await generateTrace(session, outfile)
            await outfile.write("{ }]")

trio.run(main)

