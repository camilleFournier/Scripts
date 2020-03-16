import * as fs from "fs";
import {
    State,
    Phase,
    MetadataEvent,
    TrackType,
    DevToolsMetadataEventCategory,
    DevToolsTimelineEventCategory,
    isAsyncPhase,
    isNestableAsyncPhase,
    sortedProcesses
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
// const path = './../trace_not_empty_pwa_8.json';

let tracing_model = {
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

function reset() {
    tracing_model = {
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
}

export function loadEvents(raw_events) {
    reset();
    //TracingModel.addEvents(raw_events)
    for (let i = 0; i < raw_events.length; i++) {
        var raw = raw_events[i];
        //TracingModel._addEvent(payload)
        if (!raw.cat) { console.log(i, raw); continue; }
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
        if (event && event.hasCategory(DevToolsMetadataEventCategory)) { tracing_model.devToolsMetadataEvents.push(event); }
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

    const listThreads = {};
    for (const process of tracing_model.processById.values()) {
        listThreads[process.id()] = { name: process._name };
        for (const thread of process._threads.values()) {
            listThreads[process.id()][thread.id()] = { name: thread._name };
        }
    }
    for (let i=0; i<raw_events.length; i++) {
        const event = raw_events[i];
        // console.log(event);
        if (listThreads[event.pid][event.tid]) {
            if (listThreads[event.pid][event.tid][event.cat]) {
                if (listThreads[event.pid][event.tid][event.cat][event.name]) {
                    listThreads[event.pid][event.tid][event.cat][event.name] ++;
                } else {
                    listThreads[event.pid][event.tid][event.cat][event.name] = 1;
                }
            } else {
                listThreads[event.pid][event.tid][event.cat] = {}
                listThreads[event.pid][event.tid][event.cat][event.name] = 1;
            }
        } else {
            listThreads[process._id][event.tid] = { name: 'no name' };
            listThreads[event.pid][event.tid][event.cat] = {}
            listThreads[event.pid][event.tid][event.cat][event.name] = 1;
        }
    }

    // console.log(listThreads['21751']);

    // performanceModel.setTracingModel(tracingmodel);
    let timelineModel = setTimelineModel(tracing_model);
    const mainTracks = timelineModel.tracks.filter(
        track => track.type === TrackType.MainThread && track.forMainFrame && track.events.length);

    const threadData = mainTracks.map(track => {
      const event = track.events[0];
      return {thread: event.thread, time: event.startTime};
    });

    const frameModel = addTraceEvents(timelineModel.inspectedTargetEvents, threadData);
    let cpuTime = 0;
    let selfTime = 0;
    let frameTime = 0;
    let nbFrames = 0;
    let GPUProcessPID = tracing_model.processByName.get('GPU Process').id();
    // console.log(frameModel.frames.filter(frame => frame.idle).length);
    for (const frame of frameModel.frames) {
        if (!frame.idle) {
            // cpuTime += frame.cpuTime;
            frameTime += frame.duration;
            nbFrames++;
        }
        cpuTime += frame.cpuTime;
        // selfTime += frame.selfTime;
    }
    let fps=1000/frameTime*nbFrames;
    console.log('Avg Frame dur: '+frameTime/nbFrames);
    // console.log(cpuTime);
    // console.log(timelineModel.tracks.map(e => `${e.name} : ${e.forMainFrame}`));
    for (const event of timelineModel.inspectedTargetEvents) {
        if (event.thread.name() == 'CrRendererMain') {
            selfTime += event.selfTime || 0;
        }
    }

    const duration = tracing_model.maximumRecordTime - tracing_model.minimumRecordTime;
    // console.log('CPU time: ' + cpuTime + 'ms over a period of ' + duration + ' ms');
    // console.log('Sum of main thread selfTime: ' + selfTime + ' ms');
    // console.log(cpuTime/duration * 100 + "% CPU Core");

    // let samplingTime = timelineModel.cpuProfiles[0].profileEndTime - timelineModel.cpuProfiles[0].profileStartTime;
    // console.log('CPU Profile Model:');
    // console.log( timelineModel.cpuProfiles[0].profileEndTime, ', ', timelineModel.cpuProfiles[0].profileStartTime);
    // console.log('Total sampling time: ', samplingTime, ' ms for ' + timelineModel.cpuProfiles[0].totalHitCount, ' samples');
    // console.log('Total time recorded: ', timelineModel.cpuProfiles[0].root.total, ' ms with ', timelineModel.cpuProfiles[0].idleNode.total, ' ms of idle time');
    // console.log('Result: ', (timelineModel.cpuProfiles[0].root.total - timelineModel.cpuProfiles[0].idleNode.total)/samplingTime*100, '% CPU');
    
    // console.log(frameModel.frames.length + ' frames rendered in '+ duration + ' ms');
    // console.log('Average of: ' + frameModel.frames.length/(duration/1000) + ' FPS');
    
    const JSevents = raw_events.filter(event => event.name === "UpdateCounters");
    const JSused = JSevents.reduce((sum, event) => sum+event.args.data.jsHeapSizeUsed, 0);
    // console.log('Average JS Heap used: ' + JSused/JSevents.length/1000000 + ' MB');

    const data = {
        cpuTime: cpuTime,
        selfTime: selfTime,
        recordDur: duration,
        // nbSamples: timelineModel.cpuProfiles[0].totalHitCount,
        // samplingDur: samplingTime,
        // cpuSampling: (timelineModel.cpuProfiles[0].root.total - timelineModel.cpuProfiles[0].idleNode.total)/timelineModel.cpuProfiles[0].root.total*100,
        fps: fps,
        JSused: JSused/JSevents.length/1000000,
        nbFrames: nbFrames,
        nbDrawFrame: raw_events.filter(raw => raw.name == 'DrawFrame').length,
        nbBeginFrame: raw_events.filter(raw => raw.name == 'BeginFrame').length,
        nbRequestMainThreadFrame : raw_events.filter(raw => raw.name == 'RequestMainThreadFrame').length,
        nbBeginMainThreadFrame : raw_events.filter(raw => raw.name == 'BeginMainThreadFrame').length,
        nbActivateLayerTree : raw_events.filter(raw => raw.name == 'ActivateLayerTree').length,
        nbSwapBuffers: raw_events.filter(raw => raw.name == 'GLES2DecoderImpl::DoSwapBuffers').length
    }

    // console.log(data);

    return data;
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
        const lastStep = asyncEvent.steps[asyncEvent.steps.length - 1];
        if (lastStep.phase !== Phase.AsyncBegin && lastStep.phase !== event.phase) {
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

// const name = 'not_empty_pwa';
// const nbExp = 10;
// const data = [];

// for (let i=1; i<=nbExp; i++) {
//     const path = `./../trace_${name}_${i}.json`;
//     var file = fs.readFileSync(path);
//     var raw_events = JSON.parse(file);
//     var chunk = loadEvents(raw_events);
//     data.push(chunk);
// }
// console.log(data);

// const dataRows = ['cpuTime, selfTime, selfCpu, recording duration, recordCpu, nb samples, sampling duration, samplingCpu, FPS, JS used'].concat(data.map(d => 
//     `${d.cpuTime}, ${d.selfTime}, ${d.cpuTime/d.selfTime*100}, ${d.recordDur}, ${d.cpuTime/d.recordDur*100}, ${d.nbSamples}, ${d.samplingDur}, ${d.cpuSampling}, ${d.fps}, ${d.JSused}`
// ));

// fs.writeFileSync(`data_${name}.txt`, dataRows.join('\n'));

// const path = `./../trace_${name}_10.json`;
// var file = fs.readFileSync(path);
// var raw_events = JSON.parse(file);
// var data = [loadEvents(raw_events)];
// console.log(data);