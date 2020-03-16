import {
    State,
    Phase,
    MetadataEvent,
    DevToolsMetadataEventCategory,
    DevToolsTimelineEventCategory,
    RecordTypes,
    TrackType,
    isAsyncPhase,
    isNestableAsyncPhase,
    isFlowPhase,
    isMarkerEvent,
    nativeGroup,
    sortedProcesses,
    eventFrameId
} from './resources-string.js';
import {
    NamedObject,
    Process,
    Thread,
    Event,
    AsyncEvent,
    ProfileEventsGroup,
    Track,
    PageFrame,
    TimelineData,
    TimelineAsyncEventTracker
} from './resources-class.js';
import { CPUProfileDataModel } from './CPUProfileDataModel.js';

let timeline_model = {
    //this.reset()
    isGenericTrace: false,
    tracks: [],
    namedTracks: new Map(),
    inspectedTargetEvents: [],
    timeMarkerEvents: [],
    sessionId: null,
    mainFrameNodeId: null,
    cpuProfiles: [],
    workerIdByThread: new WeakMap(),
    pageFrames: new Map(),
    mainFrame: null,
    requestsFromBrowser: new Map(),
    minimumRecordTime: 0,
    maximumRecordTime: 0,
    //this.resetProcessingState()
    asyncEventTracker: new TimelineAsyncEventTracker(),
    // invalidationTracker: new InvalidationTracker(),
    layoutInvalidate: {},
    lastScheduleStyleRecalculation: {},
    paintImageEventByPixelRefId: {},
    lastPaintForLayer: {},
    lastRecalculateStylesEvent: null,
    currentScriptEvent: null,
    eventStack: [],
    knownInputEvents: new Set(),
    browserFrameTracking: false,
    persistentIds: false,
    legacyCurrentPage: null

}

function reset() {
    timeline_model = {
        //this.reset()
        isGenericTrace: false,
        tracks: [],
        namedTracks: new Map(),
        inspectedTargetEvents: [],
        timeMarkerEvents: [],
        sessionId: null,
        mainFrameNodeId: null,
        cpuProfiles: [],
        workerIdByThread: new WeakMap(),
        pageFrames: new Map(),
        mainFrame: null,
        requestsFromBrowser: new Map(),
        minimumRecordTime: 0,
        maximumRecordTime: 0,
        //this.resetProcessingState()
        asyncEventTracker: new TimelineAsyncEventTracker(),
        // invalidationTracker: new InvalidationTracker(),
        layoutInvalidate: {},
        lastScheduleStyleRecalculation: {},
        paintImageEventByPixelRefId: {},
        lastPaintForLayer: {},
        lastRecalculateStylesEvent: null,
        currentScriptEvent: null,
        eventStack: [],
        knownInputEvents: new Set(),
        browserFrameTracking: false,
        persistentIds: false,
        legacyCurrentPage: null
    
    };
}

  //this._timelineModel.setEvents(tracingModel) called from this_performanceModel.setTracingModel(tracingModel)
  export function setTimelineModel(tracingModel) {
    reset();
    timeline_model.minimumRecordTime = tracingModel.minimumRecordTime;
    timeline_model.maximumRecordTime = tracingModel.maximumRecordTime;
    //this._processSyncBrowserEvents(tracingmodel)
    let browserMain = browserMainThread(tracingModel);
    if (browserMain) {
        //browserMain is a Thread
        browserMain.events().forEach(processBrowserEvent, this);
    }
    browserMain = null;
    
    if (timeline_model.browserFrameTracking) { processThreadsForBrowserFrames(tracingModel); }
    else {
        const metadataEvents = processMetadataEvents(tracingModel);
        timeline_model.isGenericTrace = !metadataEvents;
        if (metadataEvents) { processMetadataAndThreads(tracingModel, metadataEvents); }
        else {
            // processGenericTrace
            let browser_main_thread = browserMainThread(tracingModel);
            if (!browser_main_thread && sortedProcesses(tracingModel).length) {
                browser_main_thread = sortedProcesses(tracingModel)[0].sortedThreads()[0];
            }
            for (const process of sortedProcesses(tracingModel)) {
                for (const thread of process.sortedThreads()) {
                    processThreadEvents( tracingModel, [{from: 0, to: Infinity}], thread, thread === browser_main_thread, false, true, null);
                }
            }
        }
    }
    timeline_model.inspectedTargetEvents.sort(Event.compareStartTime);
    //this._processAsyncBrowserEvents(tracingModel);
    browserMain = browserMainThread(tracingModel);
    if (browserMain) { processAsyncEvents(browserMain, [{from: 0, to: Infinity}]); }

    //this._buildGPUEEvents(tracingModel);
    // const thread = tracingModel.threadByName('GPU Process', 'CrGpuMain');
    const thread = (tracingModel.processByName.get('GPU Process') && tracingModel.processByName.get('GPU Process').threadByName('CrGpuMain'));
    if (thread) { 
        const gpuEventName = RecordTypes.GPUTask;
        const track = ensureNamedTrack(TrackType.GPU);
        track.thread = thread;
        track.events = thread.events().filter(event => event.name === gpuEventName);
    }
    // See later if useful to do
    // resetProcessingState
    return timeline_model;

    
}

    //TracingModel.browserMainThread(tracingModel)
function browserMainThread(tracingModel) {
    const processes = sortedProcesses(tracingModel);
    if (!processes.length) { return null; }
    const browserMainThreadName = 'CrBrowserMain';
    const browserProcesses = [];
    const browserMainThreads = [];
    for (const process of processes) {
        if (process.name().toLowerCase().endsWith('browser')) {
            browserProcesses.push(process);
        }
        browserMainThreads.push(...process.sortedThreads().filter(t => t.name() === browserMainThreadName));
    }
    if (browserMainThreads.length === 1) {
        return browserMainThreads[0];
    } else if (browserProcesses.length === 1) {
        return browserProcesses[0].threadByName(browserMainThreadName);
    } else {
        const tracingStartedInBrowser = tracingModel.devToolsMetadataEvents.filter(e => e.name === 'TracingStartedInBrowser');
        if (tracingStartedInBrowser.length === 1) {
            return tracingStartedInBrowser[0].thread;
        }
    }
    return null;
}

//TimelineModel._processBrowserEvent(event)
function processBrowserEvent(event) {
    if (event.name === RecordTypes.LatencyInfoFlow) {
        const frameId = event.args['frameTreeNodeId'];
        if (typeof frameId === 'number' && frameId === timeline_model.mainFrameNodeId) {
            timeline_model.knownInputEvents.add(event.bind_id);
        }
        return;
    }

    if (event.name === RecordTypes.ResourceWillSendRequest) {
        const requestId = event.args['data']['requestId'];
        if (typeof requestId === 'string') {
            timeline_model.requestsFromBrowser.set(requestId, event);
        }
        return;
    }

    if (event.hasCategory(DevToolsMetadataEventCategory) && event.args['data']) {
        const data = event.args['data'];
        switch(event.name) {
            case 'TracingStartedInBrowser':
                if (!data['persistentIds']) { break; }
                timeline_model.browserFrameTracking = true;
                timeline_model.mainFrameNodeId = data['frameTreeNodeId'];
                const frames = data['frames'] || [];
                frames.forEach(payload => {
                    const parent = payload['parent'] && timeline_model.pageFrames.get(payload.parent);
                    if (!(payload.parent && !parent)) { 
                        let frame = timeline_model.pageFrames.get(payload.frame);
                        if (!frame) {
                            frame = new PageFrame(payload);
                            timeline_model.pageFrames.set(frame.frameId, frame);
                            if (parent) { parent.addChild(frame); } else { timeline_model.mainFrame = frame; }
                        }
                        frame.update(timeline_model.minimumRecordTime, payload);
                    }
                });
                break;
            case 'FrameCommitedInBrowser':
                if (!timeline_model.browserFrameTracking) { break; }
                let frame = timeline_model.pageFrames.get(data.frame);
                if (!frame) {
                    const parent = data.parent && timeline_model.pageFrames.get(data.parent);
                    if (!parent) { break; }
                    frame = new PageFrame(data);
                    timeline_model.pageFrames.set(frame.frameId, frame);
                    parent.addChild(frame);
                }
                frame.update(event.startTime, data);
                break;
            case 'ProcessReadyInBrowser':
                if (!timeline_model.browserFrameTracking) { break; }
                frame = timeline_model.get(data.frame);
                if (frame) { frame.processReady(data.processPseudoId, data.processId); }
                break;
            case 'FrameDeletedInBrowser':
                if (!timeline_model.browserFrameTracking) { break; }
                frame = timeline_model.get(data.frame);
                if (frame) { frame.deletedTime = event.startTime }
                break;
        }
        
        return
    }
}

function processThreadsForBrowserFrames(tracingModel) {
    const processData = new Map();
    for (const frame of timeline_model.pageFrames.values()) {
        for (let i = 0; i < frame.processes.length; i++) {
            const pid = frame.processes[i].processId;
            let data = processData.get(pid);
            if (!data) {
                data = [];
                processData.set(pid, data);
            }
            const to = (i === frame.processes.length-1) ? (frame.deletedTime || Infinity) : frame.processes[i + 1].time;
            data.push({from: frame.processes[i].time, to: to, main: !frame.parent, url: frame.processes[i].url});
      }
    }
    const allMetadataEvents = tracingModel.devToolsMetadataEvents;
    for (const process of sortedProcesses(tracingModel)) {
        const data = processData.get(process.id());
        if (!data) { 
            continue; }
        data.sort((a, b) => a.from - b.from || a.to - b.to);
        const ranges = [];
        let lastUrl = null;
        let lastMainUrl = null;
        let hasMain = false;
        for (const item of data) {
            if (!ranges.length || item.from > ranges[ranges.length-1].to) {
                ranges.push({from: item.from, to: item.to});
            } else { ranges[ranges.length-1].to = item.to; }
            if (item.main) { hasMain = true; }
            if (item.url) {
                if (item.main) { lastMainUrl = item.url; }
                lastUrl = item.url;
            }
        }
        for (const thread of process.sortedThreads()) {
            if (thread.name() === 'CrRendererMain') {
                processThreadEvents(
                    tracingModel, ranges, thread, true /* isMainThread */, false /* isWorker */, hasMain,
                    hasMain ? lastMainUrl : lastUrl);
            } else if (
                thread.name() === 'DedicatedWorker thread' ||
                thread.name() === 'DedicatedWorker Thread') {
                const workerMetaEvent = allMetadataEvents.find(e => {
                    if (e.name !== 'TracingSessionIdForWorker') {
                        return false;
                    }
                    if (e.thread.process() !== process) {
                        return false;
                    }
                    if (e.args['data']['workerThreadId'] !== thread.id()) {
                        return false;
                    }
                    return !!timeline_model.pageFrames.get(eventFrameId(e));
                });
                if (!workerMetaEvent) { continue; }
                timeline_model.workerIdByThread.set(thread, workerMetaEvent.args['data']['workerId'] || '');
                processThreadEvents(
                    tracingModel, ranges, thread, false /* isMainThread */, true /* isWorker */, false /* forMainFrame */,
                    workerMetaEvent.args['data']['url'] || '');
            } else {
                processThreadEvents(
                    tracingModel, ranges, thread, false /* isMainThread */, false /* isWorker */, false /* forMainFrame */,
                    null);
            }
        }
    }
}

function processThreadEvents(tracingModel, ranges, thread, isMainThread, isWorker, forMainFrame, url) {
    const track = new Track();
    track.name = thread.name() || `Thread ${thread.id()}`;
    track.type = TrackType.Other;
    track.thread = thread;
    if (isMainThread) {
        track.type = TrackType.MainThread;
        track.url = url || null;
        track.forMainFrame = forMainFrame;
    } else if (isWorker) {
        track.type = TrackType.Worker;
        track.url = url;
    } else if (thread.name().startsWith('CompositorTileWorker')) {
        track.type = TrackType.Raster;
    }

    timeline_model.tracks.push(track);
    //TimelineModel.injectJSFrameEvents
    const jsProfileModel = extractCpuProfile(tracingModel, thread);
    let events = thread.events();
    const jsSamples = jsProfileModel ? generateTracingEventsFromCpuProfile(jsProfileModel, thread) : null;
    if (jsSamples && jsSamples.length) {
        events = events.concat(jsSamples).sort(Event.orderedCompareStartTime);
    }
    if (jsSamples || events.some(e => e.name === RecordTypes.JSSample)) {
        const jsFrameEvents = generateJSFrameEvents(events);
        if (jsFrameEvents && jsFrameEvents.length) {
            events = events.concat(jsFrameEvents).sort(Event.orderedCompareStartTime);
        }
    }

    const eventStack = [];
    for (const range of ranges) {
        // let i = events.lowerBound(range.from, (time, event) => time - event.startTime);
        let i = events.findIndex(e => e.startTime >= range.from);
        i = i >=0 ? i : events.length;
        for (; i < events.length; i++) {
            const event = events[i];
            if (!event) { console.log(i, event); continue;}
            if (event.startTime >= range.to) { break; }
            while (eventStack.length && eventStack[eventStack.length-1].endTime <= event.startTime) {
                eventStack.pop();
            }
            if (!processEvent(event)) { continue; }
            if (!isAsyncPhase(event.phase) && event.duration) {
                if (eventStack.length) {
                    eventStack[eventStack.length-1].selfTime -= event.duration;
                    if (eventStack[eventStack.length-1].selfTime < 0) { eventStack[eventStack.length-1].selfTime = 0; }
                }
                event.selfTime = event.duration;
                if (!eventStack.length) { track.tasks.push(event) };
                eventStack.push(event);
            }
            if (isMarkerEvent(event, timeline_model)) { timeline_model.timeMarkerEvents.push(event); }
            track.events.push(event);
            timeline_model.inspectedTargetEvents.push(event);
        }
    }
    processAsyncEvents(thread, ranges);

}

function extractCpuProfile(tracingModel, thread) {
    const events = thread.events();
    let cpuProfile;
    let cpuProfileEvent = events[events.length-1];
    if (cpuProfileEvent && cpuProfileEvent.name === RecordTypes.CpuProfile) {
        const eventData = cpuProfileEvent.args['data'];
        cpuProfile = /** @type {?Protocol.Profiler.Profile} */ (eventData && eventData['cpuProfile']);
        
    }
    if (!cpuProfile) {
        cpuProfileEvent = events.find(e => e.name === RecordTypes.Profile);
        
        if (!cpuProfileEvent) { return null; }
        const profileGroup = tracingModel.profileGroups.get(`${cpuProfileEvent.thread.process().id()}:${cpuProfileEvent.id}`) || null;
        
        if (!profileGroup) { return null; }
        cpuProfile = /** @type {!Protocol.Profiler.Profile} */ ({
            startTime: cpuProfileEvent.args['data']['startTime'],
            endTime: 0,
            nodes: [],
            samples: [],
            timeDeltas: [],
            lines: []
        });
        for (const profileEvent of profileGroup.children)  {
            const eventData = profileEvent.args['data'];
            if ('startTime' in eventData) {
                cpuProfile.startTime = eventData['startTime'];
            }
            if ('endTime' in eventData) {
                cpuProfile.endTime = eventData['endTime'];
            }
            const nodesAndSamples = eventData['cpuProfile'] || {};
            const samples = nodesAndSamples['samples'] || [];
            const lines = eventData['lines'] || Array(samples.length).fill(0);
            cpuProfile.nodes.push(...(nodesAndSamples['nodes'] || []));
            cpuProfile.lines.push(...lines);
            cpuProfile.samples.push(...samples);
            cpuProfile.timeDeltas.push(...(eventData['timeDeltas'] || []));
            if (cpuProfile.samples.length !== cpuProfile.timeDeltas.length) { return null; }
        }
        if (!cpuProfile.endTime) {
            cpuProfile.endTime = cpuProfile.timeDeltas.reduce((x, y) => x + y, cpuProfile.startTime);
        }
    } 
    try {
        const jsProfileModel = new CPUProfileDataModel(cpuProfile);
        timeline_model.cpuProfiles.push(jsProfileModel); 
        return jsProfileModel;
    } catch(e) { return null; }
}

function generateTracingEventsFromCpuProfile(jsProfileModel, thread) {
    const idleNode = jsProfileModel.idleNode;
    const programNode = jsProfileModel.programNode;
    const gcNode = jsProfileModel.gcNode;
    const samples = jsProfileModel.samples;
    const timestamps = jsProfileModel.timestamps;
    const jsEvents = [];
    /** @type {!Map<!Object, !Array<!Protocol.Runtime.CallFrame>>} */
    const nodeToStackMap = new Map();
    nodeToStackMap.set(programNode, []);
    for (let i = 0; i < samples.length; ++i) {
        let node = jsProfileModel.nodeByIndex(i);
        if (!node || node === gcNode || node === idleNode) { continue; }
        let callFrames = nodeToStackMap.get(node);
        if (!callFrames) {
            callFrames = /** @type {!Array<!Protocol.Runtime.CallFrame>} */ (new Array(node.depth + 1));
            nodeToStackMap.set(node, callFrames);
            for (let j = 0; node.parent; node = node.parent) {
                callFrames[j++] = /** @type {!Protocol.Runtime.CallFrame} */ (node);
            }
        }
        const jsSampleEvent = new Event(
            DevToolsTimelineEventCategory,
            RecordTypes.JSSample,
            Phase.Instant,
            timestamps[i],
            thread
        );
        jsSampleEvent.args['data'] = {stackTrace: callFrames};
        jsEvents.push(jsSampleEvent);
    }
    return jsEvents;
}

function generateJSFrameEvents(events) {
    function equalFrames(frame1, frame2) {
        return frame1.scriptId === frame2.scriptId &&
               frame1.functionName === frame2.functionName &&
               frame1.lineNumber === frame2.lineNumber;
    }

    function isJSInvocationEvent(e) {
        switch (e.name) {
            case RecordType.RunMicrotasks:
            case RecordType.FunctionCall:
            case RecordType.EvaluateScript:
            case RecordType.EvaluateModule:
            case RecordType.EventDispatch:
            case RecordType.V8Execute:
            return true;
        }
        return false;
    }
  
    const jsFrameEvents = [];
    const jsFramesStack = [];
    const lockedJsStackDepth = [];
    let ordinal = 0;
    // const showAllEvents = Root.Runtime.experiments.isEnabled('timelineShowAllEvents');
    // const showRuntimeCallStats = Root.Runtime.experiments.isEnabled('timelineV8RuntimeCallStats');
    // const showNativeFunctions = self.Common.settings.moduleSetting('showNativeFunctionsInJSProfile').get();
    const showAllEvents = true;
    const showRuntimeCallStats = true;
    const showNativeFunctions = true;
  
    function onStartEvent(e) {
        e.ordinal = ++ordinal;
        extractStackTrace(e);
        // For the duration of the event we cannot go beyond the stack associated with it.
        lockedJsStackDepth.push(jsFramesStack.length);
    }
  
    function onInstantEvent(e, parent) {
        e.ordinal = ++ordinal;
        if (parent && isJSInvocationEvent(parent)) {
            extractStackTrace(e);
        }
    }

    function onEndEvent(e) {
        truncateJSStack(lockedJsStackDepth.pop(), e.endTime);
    }
  
    function truncateJSStack(depth, time) {
        if (lockedJsStackDepth.length) {
            const lockedDepth = lockedJsStackDepth[lockedJsStackDepth.length - 1];
            if (depth < lockedDepth) {
                console.error(`Child stack is shallower (${depth}) than the parent stack (${lockedDepth}) at ${time}`);
                depth = lockedDepth;
            }
        }
        if (jsFramesStack.length < depth) {
            console.error(`Trying to truncate higher than the current stack size at ${time}`);
            depth = jsFramesStack.length;
        }
        for (let k = 0; k < jsFramesStack.length; ++k) {
            jsFramesStack[k].setEndTime(time);
        }
        jsFramesStack.length = depth;
    }
  
    function showNativeName(name) {
        return showRuntimeCallStats && !!nativeGroup(name);
    }

    function filterStackFrames(stack) {
        if (showAllEvents) { return; }
        let previousNativeFrameName = null;
        let j = 0;
        for (let i = 0; i < stack.length; ++i) {
            const frame = stack[i];
            const url = frame.url;
            const isNativeFrame = url && url.startsWith('native ');
            if (!showNativeFunctions && isNativeFrame) { continue; }
            const isNativeRuntimeFrame = frame.url === 'native V8Runtime';
            if (isNativeRuntimeFrame && !showNativeName(frame.functionName)) { continue; }
            const nativeFrameName =
                isNativeRuntimeFrame ? nativeGroup(frame.functionName) : null;
            if (previousNativeFrameName && previousNativeFrameName === nativeFrameName) { continue; }
            previousNativeFrameName = nativeFrameName;
            stack[j++] = frame;
        }
        stack.length = j;
      }
  
    function extractStackTrace(e) {
        const recordTypes = RecordTypes;
        /** @type {!Array<!Protocol.Runtime.CallFrame>} */
        const callFrames = e.name === recordTypes.JSSample ? e.args['data']['stackTrace'].slice().reverse() :
                                                             jsFramesStack.map(frameEvent => frameEvent.args['data']);
        filterStackFrames(callFrames);
        const endTime = e.endTime || e.startTime;
        const minFrames = Math.min(callFrames.length, jsFramesStack.length);
        let i;
        for (i = lockedJsStackDepth[lockedJsStackDepth.length - 1] || 0; i < minFrames; ++i) {
            const newFrame = callFrames[i];
            const oldFrame = jsFramesStack[i].args['data'];
            if (!equalFrames(newFrame, oldFrame)) { break; }
            jsFramesStack[i].setEndTime(Math.max(jsFramesStack[i].endTime, endTime));
        }
        truncateJSStack(i, e.startTime);
        for (; i < callFrames.length; ++i) {
            const frame = callFrames[i];
            const jsFrameEvent = new SDK.TracingModel.Event(
                DevToolsTimelineEventCategory, recordTypes.JSFrame, Phase.Complete,
                e.startTime, e.thread);
            jsFrameEvent.ordinal = e.ordinal;
            jsFrameEvent.addArgs({data: frame});
            jsFrameEvent.setEndTime(endTime);
            jsFramesStack.push(jsFrameEvent);
            jsFrameEvents.push(jsFrameEvent);
        }
      }
  
        const firstTopLevelEvent = events.find(e => e.isTopLevel());
        const startTime = firstTopLevelEvent ? firstTopLevelEvent.startTime : 0;
        forEachEvent(events, onStartEvent, onEndEvent, onInstantEvent, startTime);
        return jsFrameEvents;
}

function forEachEvent(events, onStartEvent, onEndEvent, onInstantEvent, startTime, endTime, filter) {
    startTime = startTime || 0;
    endTime = endTime || Infinity;
    const stack = [];
    // const startEvent = TimelineModelImpl._topLevelEventEndingAfter(events, startTime);
    //topLevelEventEndingAfter(events, startTime)
    // let index = events.upperBound(time, (time, event) => time - event.startTime) - 1;
    let index;
    events.forEach((e, i) => {
        if (startTime - e.startTime <= 0) { index = i; }
    });
    while (index > 0 && events[index].isTopLevel()) { index--; }
    const startEvent = Math.max(index, 0);

    for (let i = startEvent; i < events.length; ++i) {
        const e = events[i];
        if ((e.endTime || e.startTime) < startTime) { continue; }
        if (e.startTime >= endTime) { break; }
        if (isAsyncPhase(e.phase) || isFlowPhase(e.phase)) { continue; }
        while (stack.length && stack[stack.length-1].endTime <= e.startTime) {
            onEndEvent(stack.pop());
        }
        if (filter && !filter(e)) { continue; }
        if (e.duration) {
            onStartEvent(e);
            stack.push(e);
        } else {
            onInstantEvent && onInstantEvent(e, stack[stack.length-1] || null);
        }
    }
    while (stack.length) {
        onEndEvent(stack.pop());
    }
}

function processEvent(event) {
    const recordTypes = RecordTypes;
    const eventStack = timeline_model.eventStack;

    if (!eventStack.length) {
        if (timeline_model.currentTaskLayoutAndRecalcEvents && timeline_model.currentTaskLayoutAndRecalcEvents.length) {
            const totalTime = timeline_model.currentTaskLayoutAndRecalcEvents.reduce((time, event) => time + event.duration, 0);
            if (totalTime > 30) {
                for (const e of timeline_model.currentTaskLayoutAndRecalcEvents) {
                    const timelineData = TimelineData.forEvent(e);
                    timelineData.warning = e.name === RecordTypes.Layout ? 'ForcedLayout' : 'ForcedStyle';
                }
            }
        }
        timeline_model.currentTaskLayoutAndRecalcEvents = [];
    }

    if (timeline_model.currentScriptEvent && event.startTime > timeline_model.currentScriptEvent) {
        currentScriptEvent = null;
    }

    const eventData = event.args['data'] || event.args['beginData'] || {};
    const timelineData = TimelineData.forEvent(event);
    if (eventData['stackTrace']) {
        timelineData.stackTrace = eventData['stackTrace'];
    }
    if (timelineData.stackTrace && event.name !== RecordTypes.JSSample) {
        // TraceEvents come with 1-based line & column numbers. The frontend code
        // requires 0-based ones. Adjust the values.
        for (let i = 0; i < timelineData.stackTrace.length; ++i) {
            --timelineData.stackTrace[i].lineNumber;
            --timelineData.stackTrace[i].columnNumber;
        }
    }
    let pageFrameId = eventFrameId(event);
    if (!pageFrameId && eventStack.length) {
        pageFrameId = TimelineData.forEvent(eventStack.peekLast()).frameId;
    }
    timelineData.frameId = pageFrameId || (timeline_model.mainFrame && timeline_model.mainFrame.frameId) || '';
    timeline_model.asyncEventTracker.processEvent(event);

    if (isMarkerEvent(event, timeline_model)) {
        timeline_model.ensureNamedTrack(TrackType.Timings);
        if (!timeline_model.namedTracks.has(TrackType.Timings)) {
            const track = new Track();
            track.type = TrackType.Timings;
            timeline_model.tracks.push(track);
            timeline_model.namedTracks.set(TrackType.Timings, track);
        }
    }

    let frameId;
    let paintImageEvent;
    switch (event.name) {
        case recordTypes.ResourceSendRequest:
        case recordTypes.WebSocketCreate:
            timelineData.setInitiator(eventStack[eventStack.length-1] || null);
            timelineData.url = eventData['url'];
            break;
        case recordTypes.ScheduleStyleRecalculation:
            timeline_model.lastScheduleStyleRecalculation[eventData['frame']] = event;
            break;
        case recordTypes.UpdateLayoutTree:
            case recordTypes.RecalculateStyles:
            // timeline_model.invalidationTracker.didRecalcStyle(event);
            if (event.args['beginData']) {
                timelineData.setInitiator(timeline_model.lastScheduleStyleRecalculation[event.args['beginData']['frame']]);
            }
            timeline_model.lastRecalculateStylesEvent = event;
            if (timeline_model.currentScriptEvent) {
                timeline_model.currentTaskLayoutAndRecalcEvents.push(event);
            }
            break;
        // case recordTypes.ScheduleStyleInvalidationTracking:
        // case recordTypes.StyleRecalcInvalidationTracking:
        // case recordTypes.StyleInvalidatorInvalidationTracking:
        // case recordTypes.LayoutInvalidationTracking:
        //     // this._invalidationTracker.addInvalidation(new InvalidationTrackingEvent(event));
        //     break;

        case recordTypes.InvalidateLayout: 
            // Consider style recalculation as a reason for layout invalidation,
            // but only if we had no earlier layout invalidation records.
            let layoutInitator = event;
            frameId = eventData['frame'];
            if (!timeline_model.layoutInvalidate[frameId] && timeline_model.lastRecalculateStylesEvent &&
                timeline_model.lastRecalculateStylesEvent.endTime > event.startTime) {
                layoutInitator = TimelineData.forEvent(timeline_model.lastRecalculateStylesEvent).initiator();
            }
            timeline_model.layoutInvalidate[frameId] = layoutInitator;
            break;
        case recordTypes.Layout: 
            // timeline_model.invalidationTracker.didLayout(event);
            frameId = event.args['beginData']['frame'];
            timelineData.setInitiator(timeline_model.layoutInvalidate[frameId]);
            // In case we have no closing Layout event, endData is not available.
            if (event.args['endData']) {
                timelineData.backendNodeId = event.args['endData']['rootNode'];
            }
            timeline_model.layoutInvalidate[frameId] = null;
            if (timeline_model.currentScriptEvent) {
                timeline_model.currentTaskLayoutAndRecalcEvents.push(event);
            }
            break;
        case recordTypes.Task:
            if (event.duration > 200) {
                timelineData.warning = 200;
            }
            break;
    
        case recordTypes.EventDispatch:
            if (event.duration > 50) {
                timelineData.warning = 'LongHandler';
            }
            break;

        case recordTypes.TimerFire:
        case recordTypes.FireAnimationFrame:
            if (event.duration > 50) {
                timelineData.warning = 'LongRecurringHandler';
            }
            break;

        case recordTypes.FunctionCall:
            // Compatibility with old format.
            if (typeof eventData['scriptName'] === 'string') {
                eventData['url'] = eventData['scriptName'];
            }
            if (typeof eventData['scriptLine'] === 'number') {
                eventData['lineNumber'] = eventData['scriptLine'];
            }
        case recordTypes.EvaluateScript:
        case recordTypes.CompileScript:
            if (typeof eventData['lineNumber'] === 'number') {
            --eventData['lineNumber'];
            }
            if (typeof eventData['columnNumber'] === 'number') {
            --eventData['columnNumber'];
            }
        case recordTypes.RunMicrotasks:
            // Microtasks technically are not necessarily scripts, but for purpose of
            // forced sync style recalc or layout detection they are.
            if (!timeline_model.currentScriptEvent) {
                timeline_model.currentScriptEvent = event;
            }
            break;
        case recordTypes.SetLayerTreeId:
            // This is to support old traces.
            if (timeline_model.sessionId && eventData['sessionId'] && timeline_model.sessionId === eventData['sessionId']) {
                timeline_model.mainFrameLayerTreeId = eventData['layerTreeId'];
                break;
            }
    
            // We currently only show layer tree for the main frame.
            frameId = eventFrameId(event);
            let pageFrame = timeline_model.pageFrames.get(frameId);
            if (!pageFrame || pageFrame.parent) {
                return false;
            }
            timeline_model.mainFrameLayerTreeId = eventData['layerTreeId'];
            break;
        case recordTypes.Paint:
            // this._invalidationTracker.didPaint(event);
            timelineData.backendNodeId = eventData['nodeId'];
            // Only keep layer paint events, skip paints for subframes that get painted to the same layer as parent.
            if (!eventData['layerId']) {
                break;
            }
            const layerId = eventData['layerId'];
            timeline_model.lastPaintForLayer[layerId] = event;
            break;
        case recordTypes.ScrollLayer:
            timelineData.backendNodeId = eventData['nodeId'];
            break;
        case recordTypes.PaintImage:
            timelineData.backendNodeId = eventData['nodeId'];
            timelineData.url = eventData['url'];
            break;
        case recordTypes.DecodeImage:
        case recordTypes.ResizeImage:
            paintImageEvent = findAncestorEvent(recordTypes.PaintImage);
            if (!paintImageEvent) {
                const decodeLazyPixelRefEvent = findAncestorEvent(recordTypes.DecodeLazyPixelRef);
                paintImageEvent = decodeLazyPixelRefEvent &&
                    timeline_model.paintImageEventByPixelRefId[decodeLazyPixelRefEvent.args['LazyPixelRef']];
            }
            if (!paintImageEvent) { break; }
            let paintImageData = TimelineData.forEvent(paintImageEvent);
            timelineData.backendNodeId = paintImageData.backendNodeId;
            timelineData.url = paintImageData.url;
            break;
        case recordTypes.DrawLazyPixelRef:
            paintImageEvent = findAncestorEvent(recordTypes.PaintImage);
            if (!paintImageEvent) {
                break;
            }
            timeline_model.paintImageEventByPixelRefId[event.args['LazyPixelRef']] = paintImageEvent;
            paintImageData = TimelineData.forEvent(paintImageEvent);
            timelineData.backendNodeId = paintImageData.backendNodeId;
            timelineData.url = paintImageData.url;
            break;
        case recordTypes.FrameStartedLoading:
            if (timelineData.frameId !== event.args['frame']) {
                return false;
            }
            break;
        case recordTypes.MarkLCPCandidate:
            timelineData.backendNodeId = eventData['nodeId'];
            break;
    
        case recordTypes.MarkDOMContent:
        case recordTypes.MarkLoad:
            frameId = eventFrameId(event);
            if (!timeline_model.pageFrames.has(frameId)) {
                return false;
            }
            break;
        case recordTypes.CommitLoad:
            if (timeline_model.browserFrameTracking) {
                break;
            }
            frameId = eventFrameId(event);
            const isMainFrame = !!eventData['isMainFrame'];
            pageFrame = timeline_model.pageFrames.get(frameId);
            if (pageFrame) {
                pageFrame.update(event.startTime, eventData);
            } else {
                // We should only have one main frame which has persistent id,
                // unless it's an old trace without 'persistentIds' flag.
                if (!timeline_model.persistentIds) {
                if (eventData['page'] && eventData['page'] !== timeline_model.legacyCurrentPage) {
                    return false;
                }
                } else if (isMainFrame) {
                return false;
                } else if (!addPageFrame(event, eventData)) {
                return false;
                }
            }
            if (isMainFrame) {
                timeline_model.mainFrame = timeline_model.pageFrames.get(frameId);
            }
            break;
        case recordTypes.FireIdleCallback:
            if (event.duration > eventData['allottedMilliseconds'] + 5) {
                timelineData.warning = 'IdleDeadlineExceeded';
            }
            break;
    }
    return true;    
}

function processAsyncEvents(thread, ranges) {
    const asyncEvents = thread.asyncEvents();
    const groups = new Map();

    function group(type) {
        if (!groups.has(type)) {
            groups.set(type, []);
        }
        return groups.get(type);
    }

    for (const range of ranges) {
        // let i = asyncEvents.lowerBound(range.from, function(time, asyncEvent) {
        //     return time - asyncEvent.startTime;
        // });
        let i = asyncEvents.findIndex(e => e.startTime > range.from);
        i = i>=0 ? i : asyncEvents.length;
        for (; i < asyncEvents.length; ++i) {
            const asyncEvent = asyncEvents[i];
            if (asyncEvent.startTime >= range.to) { break; }
  
            if (asyncEvent.hasCategory('blink.console')) {
                group(TrackType.Console).push(asyncEvent);
                continue;
            }
  
            if (asyncEvent.hasCategory('blink.user_timing')) {
                group(TrackType.Timings).push(asyncEvent);
                continue;
            }
  
            if (asyncEvent.name === RecordTypes.Animation) {
                group(TrackType.Animation).push(asyncEvent);
                continue;
            }
  
            if (asyncEvent.hasCategory('latencyInfo') ||asyncEvent.name === RecordTypes.ImplSideFling) {
                const lastStep = asyncEvent.steps[asyncEvent.steps.length-1];
                // FIXME: fix event termination on the back-end instead.
                if (lastStep.phase !== Phase.AsyncEnd) {
                    continue;
                }
                const data = lastStep.args['data'];
                asyncEvent.causedFrame = !!(data && data['INPUT_EVENT_LATENCY_RENDERER_SWAP_COMPONENT']);
                if (asyncEvent.hasCategory('latencyInfo')) {
                    if (!timeline_model.knownInputEvents.has(lastStep.id)) { continue; }
                    if (asyncEvent.name === RecordTypes.InputLatencyMouseMove && !asyncEvent.causedFrame) { continue; }
                    // Coalesced events are not really been processed, no need to track them.
                    if (data['is_coalesced']) { continue; }
                    const rendererMain = data['INPUT_EVENT_LATENCY_RENDERER_MAIN_COMPONENT'];
                    if (rendererMain) {
                        const time = rendererMain['time'] / 1000;
                        TimelineData.forEvent(asyncEvent.steps[0]).timeWaitingForMainThread =
                        time - asyncEvent.steps[0].startTime;
                    }
                }   
                group(TrackType.Input).push(asyncEvent);
                continue;
            }
        }
    }

    for (const [type, events] of groups) {
        const track = ensureNamedTrack(type);
        track.thread = thread;
        track.asyncEvents = track.asyncEvents.concat(events).sort(Event.compareStartTime);
    }
}

function processMetadataEvents(tracingModel) {
    const metadataEvents = tracingModel.devToolsMetadataEvents;
    const pageDevToolsMetadataEvents = [];
    const workersDevToolsMetadataEvents = [];
    for (const event of metadataEvents) {
        if (event.name === 'TracingStartedInPage') {
            pageDevToolsMetadataEvents.push(event);
            if (event.args['data'] && event.args['data']['persistentIds']) {
                timeline_model.persistentIds = true;
            }
            const frames = ((event.args['data'] && event.args['data']['frames']) || []);
            frames.forEach(payload => addPageFrame(event, payload));
            timeline_model.mainFrame = Array.from(timeline_model.pageFrames.values()).filter(frame => !frame.parent)[0];
        } else if (event.name === 'TracingSessionIdForWorker') {
            workersDevToolsMetadataEvents.push(event);
        } else if (event.name === 'TracingStartedInBrowser') {
            console.assert(!timeline_model.mainFrameNodeId, 'Multiple sessions in trace');
            timeline_model.mainFrameNodeId = event.args['frameTreeNodeId'];
        }
    }
    if (!pageDevToolsMetadataEvents.length) { return null; }

    const sessionId = pageDevToolsMetadataEvents[0].args['sessionId'] || pageDevToolsMetadataEvents[0].args['data']['sessionId'];
    timeline_model.sessionId = sessionId;
    const mismatchingIds = new Set();
    const result = {
        page: pageDevToolsMetadataEvents
            .filter(event => {
                let args = event.args;
                // FIXME: put sessionId into args["data"] for TracingStartedInPage event.
                if (args['data']) {
                    args = args['data'];
                }
                const id = args['sessionId'];
                if (id === sessionId) {
                    return true;
                }
                mismatchingIds.add(id);
                return false;
            })
            .sort(Event.compareStartTime),
        workers: workersDevToolsMetadataEvents.sort(Event.compareStartTime)
    };
    return result;
}

function processMetadataAndThreads(tracingModel, metadataEvents) {
    let startTime = 0;
    for (let i = 0, length = metadataEvents.page.length; i < length; i++) {
        const metaEvent = metadataEvents.page[i];
        const process = metaEvent.thread.process();
        const endTime = i + 1 < length ? metadataEvents.page[i + 1].startTime : Infinity;
        if (startTime === endTime) { continue; }

        timeline_model.legacyCurrentPage = metaEvent.args['data'] && metaEvent.args['data']['page'];
        for (const thread of process.sortedThreads()) {
            let workerUrl = null;
            if (thread.name() === 'DedicatedWorker thread' || thread.name() === 'DedicatedWorker Thread') {
                const workerMetaEvent = metadataEvents.workers.find(e => {
                    if (e.args['data']['workerThreadId'] !== thread.id()) {
                        return false;
                    }
                    // This is to support old traces.
                    if (e.args['data']['sessionId'] === timeline_model.sessionId) {
                        return true;
                    }
                    return !!timeline_model.pageFrames.get(TimelineModelImpl.eventFrameId(e));
                });
                if (!workerMetaEvent) { continue; }
                const workerId = workerMetaEvent.args['data']['workerId'];
                if (workerId) {
                    timeline_model.workerIdByThread.set(thread, workerId);
                }
                workerUrl = workerMetaEvent.args['data']['url'] || '';
            }
        processThreadEvents(
            tracingModel, [{from: startTime, to: endTime}], thread, thread === metaEvent.thread, !!workerUrl, true,
            workerUrl);
        }
        startTime = endTime;
    }
}


function findAncestorEvent(name) {
    for (let i = timeline_model.eventStack.length - 1; i >= 0; --i) {
      const event = timeline_model.eventStack[i];
      if (event.name === name) {
        return event;
      }
    }
    return null;
}

function addPageFrame(event, payload) {
    const parent = payload['parent'] && timeline_model.pageFrames.get(payload['parent']);
    if (payload['parent'] && !parent) {
      return false;
    }
    const pageFrame = new PageFrame(payload);
    timeline_model.pageFrames.set(pageFrame.frameId, pageFrame);
    pageFrame.update(event.startTime, payload);
    if (parent) {
      parent.addChild(pageFrame);
    }
    return true;
}

function ensureNamedTrack(type) {
    if (!timeline_model.namedTracks.has(type)) {
      const track = new Track();
      track.type = type;
      timeline_model.tracks.push(track);
      timeline_model.namedTracks.set(type, track);
    }
    return timeline_model.namedTracks.get(type);
  }

