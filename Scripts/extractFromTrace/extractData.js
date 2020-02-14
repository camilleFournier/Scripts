import * as fs from "fs";
import {
    State,
    Phase,
    MetadataEvent,
    TrackType,
    DevToolsMetadataEventCategory,
    DevToolsTimelineEventCategory,
    isAsyncPhase,
    isNestableAsyncPhase
} from './resources-string.js';
import {
    NamedObject,
    Process,
    Thread,
    Event,
    AsyncEvent,
    ProfileEventsGroup,
} from './resources-class.js';
import { setTimelineModel } from './timelineModel.js';
import { addTraceEvents } from './frameModel.js';

// const fs = require('fs');
const path = './../../Data/testPWA/trace_pwa.json';

const tracing_model = {
    processById: new Map(),
    processByName: new Map(),
    minimumRecordTime: 0,
    maximumRecordTime: 0,
    devToolsMetadataEvents: [],
    asyncEvents: [],
    openAsyncEvents: new Map(),
    openNestableAsyncEvents: new Map(),
    profileGroups : new Map(),
    parsedCategories: new Map()
};



function loadEvents() {
    var file = fs.readFileSync(path);
    var raw_events = JSON.parse(file);

    //TracingModel.addEvents(raw_events)
    for (let i = 1; i < raw_events.length; i++) {
        var raw = raw_events[i];
        //TracingModel._addEvent(payload)
        let process = tracing_model.processById.get(raw.pid);
        if (!process) {
            process = new Process(this, raw.pid);
            tracing_model.processById.set(raw.pid, process);
        }

        const timestamp = raw.ts/1000;
        if (timestamp && (!tracing_model.minimumRecordTime || timestamp < tracing_model.minimumRecordTime) &&
        (raw.ph === Phase.Begin || raw.ph === Phase.Complete || raw.ph === Phase.Instant)) {
            tracing_model.minimumRecordTime = timestamp;
        }

        const endTimeStamp = (raw.ts + (raw.dur || 0)) / 1000;
        tracing_model.maximumRecordTime = Math.max(tracing_model.maximumRecordTime, endTimeStamp);
        let event = process._addEvent(raw);

        if (raw.ph === Phase.Sample) {
            //TracingModel._addSampleEvent(event)
            const id = `${event.thread.process().id()}:${event.id}`;
            const group = tracing_model.profileGroups.get(id);
            if (group) {
                group._addChild(event);
            } else {
                tracing_model.profileGroups.set(id, new ProfileEventsGroup(event));
            }
        }
        if (isAsyncPhase(raw.ph)) { tracing_model.asyncEvents.push(event); }
        if (event.hasCategory(DevToolsMetadataEventCategory)) { tracing_model.devToolsMetadataEvents.push(event); }
        if (raw.ph === Phase.Metadata) {
            switch(raw.name) {
                case MetadataEvent.ProcessSortIndex:
                    process._setSortIndex(raw.args['sort_index']);
                    break;
                case MetadataEvent.ProcessName:
                    const processName = raw.args['name'];
                    process._setName(processName);
                    tracing_model.processByName.set(processName, process);
                    break;
                case MetadataEvent.ThreadSortIndex:
                    process.threadById(raw.tid)._setSortIndex(raw.args['sort_index']);
                    break;
                case MetadataEvent.ThreadName:
                    process.threadById(raw.tid)._setName(raw.args['name']);
                    break;
            }
        }
    }
    
    tracingComplete();

    // performanceModel.setTracingModel(tracingmodel);
    let timelineModel = setTimelineModel(tracing_model);
    const mainTracks = timelineModel.tracks.filter(
        track => track.type === TrackType.MainThread && track.forMainFrame && track.events.length);

    const threadData = mainTracks.map(track => {
      const event = track.events[0];
      return {thread: event.thread, time: event.startTime};
    });

    const frameModel = addTraceEvents(timelineModel.inspectedTargetEvents, threadData);
    // console.log(frameModel);
    let cpuTime = 0;
    for (const frame of frameModel.frames) {
        cpuTime += frame.cpuTime;
    }
    let selfTime = 0;
    for (const event of timelineModel.inspectedTargetEvents) {
        if (event.thread.name() == 'CrRendererMain') {
            selfTime += event.selfTime || 0;
        }
    }
    // console.log(timelineModel.cpuProfiles[0].gcNode);
    // console.log(timelineModel.cpuProfiles[0].programNode);
    // console.log(timelineModel.cpuProfiles[0].idleNode);

    const duration = tracing_model.maximumRecordTime - tracing_model.minimumRecordTime;
    console.log('CPU time: ' + cpuTime + 'ms over a period of ' + duration + ' ms');
    console.log('Sum of main thread selfTime: ' + selfTime + ' ms');
    console.log(cpuTime/duration * 100 + "% CPU Core");

    let samplingTime = timelineModel.cpuProfiles[0].profileEndTime - timelineModel.cpuProfiles[0].profileStartTime;
    console.log('CPU Profile Model:');
    console.log( timelineModel.cpuProfiles[0].profileEndTime, ', ', timelineModel.cpuProfiles[0].profileStartTime);
    console.log('Total sampling time: ', samplingTime, ' ms for ' + timelineModel.cpuProfiles[0].totalHitCount, ' samples');
    console.log('Total time recorded: ', timelineModel.cpuProfiles[0].root.total, ' ms with ', timelineModel.cpuProfiles[0].idleNode.total, ' ms of idle time');
    console.log('Result: ', (timelineModel.cpuProfiles[0].root.total - timelineModel.cpuProfiles[0].idleNode.total)/samplingTime*100, '% CPU');
    
    console.log(frameModel.frames.length + ' frames rendered in '+ duration + ' ms');
    console.log('Average of: ' + frameModel.frames.length/(duration/1000) + ' FPS');
    
    const JSevents = raw_events.filter(event => event.name === "UpdateCounters");
    const JSused = JSevents.reduce((sum, event) => sum+event.args.data.jsHeapSizeUsed, 0);
    console.log('Average JS Heap used: ' + JSused/JSevents.length/1000000 + ' MB');


    // writeProcessedData();
    // writeFrames(frameModel);
    // writeEvents(timelineModel.inspectedTargetEvents);

}

// Unite Begin and End events
//TracingModel.tracingComplete()
function tracingComplete() {
    //TracingModel._processPendingAsyncEvents()
    tracing_model.asyncEvents.sort(Event.compareStartTime);
    for (let i=0; i<tracing_model.asyncEvents.length; i++) {
        const event = tracing_model.asyncEvents[i];
        if (isNestableAsyncPhase(event.phase)) {
            addNestableAsyncEvent(event);
        } else {
            addAsyncEvent(event);
        }
    }
    tracing_model.asyncEvents = [];
    //TracingModel._closeOpenAsyncEvents
    for (const event of tracing_model.openAsyncEvents.values()) {
        event.setEndTime(tracing_model.maximumRecordTime);
        event.steps[0].setEndTime(tracing_model.maximumRecordTime);
    }
    tracing_model.openAsyncEvents.clear();
    for (const eventStack of tracing_model.openNestableAsyncEvents.values()) {
        while (eventStack.length) {
            eventStack.pop().setEndTime(tracing_model.maximumRecordTime);
        }
    }
    tracing_model.openNestableAsyncEvents.clear();
    
    for (const processKey of tracing_model.processById) {
        for (const threadKey of processKey[1]._threads) {
            const thread = threadKey[1];
            thread.tracingComplete(tracing_model.maximumRecordTime);
        }
        
    }
}

function addAsyncEvent(event) {
    const key = event.categoriesString + '.' + event.name + '.' + event.id;
    let asyncEvent = tracing_model.openAsyncEvents.get(key);

    if (event.phase === Phase.AsyncBegin) {
        asyncEvent = new AsyncEvent(event);
        tracing_model.openAsyncEvents.set(key, asyncEvent);
        event.thread._addAsyncEvent(asyncEvent);
        return;
    }
    if (!asyncEvent) { return; }
    
    if (event.phase === Phase.AsyncEnd) {
        asyncEvent._addStep(event);
        tracing_model.openAsyncEvents.delete(key);
        return;  
    }
    
    if (event.phase === Phase.AsyncStepInto || event.phase === Phase.AsyncStepPast) {
        const lastStep = asyncEvent.steps[-1];
        if (lastStep.phase !== phase.AsyncBegin && lastStep.phase !== event.phase) {
            console.assert('Async event mismatch');
            return;
        }
        asyncEvent._addStep(event);
        return;
    }
    console.assert('Invalid async event');
    return;
}

function addNestableAsyncEvent(event) {
    const key = event.categoriesString + '.' + event.id;
    let openEventsStack = tracing_model.openNestableAsyncEvents.get(key);

    switch (event.phase) {
        case Phase.NestableAsyncBegin:
            if (!openEventsStack) {
                openEventsStack = [];
                tracing_model.openNestableAsyncEvents.set(key, openEventsStack);
            }
            const asyncEvent = new AsyncEvent(event);
            openEventsStack.push(asyncEvent);
            event.thread._addAsyncEvent(asyncEvent);
            break;
        case Phase.NestableAsyncInstant:
            if (openEventsStack && openEventsStack.length) {
                (openEventsStack[openEventsStack.length-1])._addStep(event);
            }
            break;
  
        case Phase.NestableAsyncEnd:
            if (!openEventsStack || !openEventsStack.length) {
                break;
            }
            const top = openEventsStack.pop();
            if (top.name !== event.name) {
                console.error(
                    `Begin/end event mismatch for nestable async event, ${top.name} vs. ${event.name}, key: ${key}`);
                break;
            }
            top._addStep(event);
    }
}





function writeProcessedData() {
    var newjson = '[';
    for (const process of tracing_model.processById) {
        for (const thread of process[1]._threads) {
            for (const event of thread[1]._events) {
                var infoEvent = event;
                infoEvent.thread = null;
                newjson += JSON.stringify(infoEvent);
                newjson += ',\n';
            }
        }
    }
    newjson += '{}]'
    fs.writeFileSync('newdata.json', newjson);
}

function writeFrames(frameModel) {
    var newjson = '[';
    for (const frame of frameModel.frames) {
        newjson += JSON.stringify(frame);
        newjson += ',\n';
    }
    newjson += '{}]'
    fs.writeFileSync('frames.json', newjson); 
}

function writeEvents(events) {
    var newjson = '[';
    for (const event of events) {
        event.thread = null;
        if (event.parent && event.parent.children) {
            event.parent.children = null;
            
        }
        if (event.timelineData && event.timelineData.stackTrace) {
            event.timelineData.stackTrace = null;
            event.args.data.stackTrace = null;
        }
        newjson += JSON.stringify(event);
        newjson += ',\n';
    }
    newjson += '{}]'
    fs.writeFileSync('events.json', newjson); 
}

loadEvents();