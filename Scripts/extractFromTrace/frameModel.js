import { TimelineRecordStyle, TimelineFrame, PendingFrame, Event } from './resources-class.js';
import { eventStyles, RecordTypes, mainFrameMarkers } from './resources-string.js';

let frame_model = {
    minimumRecordTime: Infinity,
    frames: [],
    frameById: {},
    lastFrame: null,
    lastLayerTree: null,
    mainFrameCommitted: false,
    mainFrameRequested: false,
    framePendingCommit: null,
    lastBeginFrame: null,
    lastNeedsBeginFrame: null,
    framePendingActivation: null,
    lastTaskBeginTime: null,
    target: null,
    layerTreeId: null,
    currentTaskTimeByCategory: {},
}

function reset() {
    frame_model = {
        minimumRecordTime: Infinity,
        frames: [],
        frameById: {},
        lastFrame: null,
        lastLayerTree: null,
        mainFrameCommitted: false,
        mainFrameRequested: false,
        framePendingCommit: null,
        lastBeginFrame: null,
        lastNeedsBeginFrame: null,
        framePendingActivation: null,
        lastTaskBeginTime: null,
        target: null,
        layerTreeId: null,
        currentTaskTimeByCategory: {},
    };
}

function categoryMapper(event) {
    //TimelineUIUtilseventStyle(event)
    if (event.hasCategory('blink.console') || event.hasCategory('blink.user_timing')) {
      return new TimelineRecordStyle(event.name, 'scripting');
    }

    if (event.hasCategory('latencyInfo')) {
        /** @const */
        const prefix = 'InputLatency::';
        const inputEventType = event.name.startsWith(prefix) ? event.name.substr(prefix.length) : event.name;
    //   const displayName = TimelineUIUtils.inputEventDisplayName(
    //       /** @type {!TimelineModel.TimelineIRModel.InputEvents} */ (inputEventType));
    //   return new TimelineRecordStyle(displayName || inputEventType, TimelineUIUtils.categories()['scripting']);
    //DO NOT NEED SPECIFIC INPUT EVENTS
        return new TimelineRecordStyle(inputEventType, 'scripting');
    }
    let result = eventStyles[event.name];
    if (!result) {
      result = new TimelineRecordStyle(event.name, 'other');
      eventStyles[event.name] = result;
    }
    return result.category;
}

function processCompositorEvents(event) {
    if (event.args.layerTreeId !== frame_model.layerTreeId) { return; }

    const timestamp = event.startTime;
    if (event.name === RecordTypes.BeginFrame) {
        handleBeginFrame(timestamp);
    } else if (event.name === RecordTypes.DrawFrame) {
        handleDrawFrame(timestamp);
    } else if (event.name === RecordTypes.ActivateLayerTree) {
        handleActivateLayerTree();
    } else if (event.name === RecordTypes.RequestMainThreadFrame) {
        handleRequestMainThreadFrame();
    } else if (event.name === RecordTypes.NeedsBeginFrameChanged) {
        handleNeedFrameChanged(timestamp, event.args['data'] && event.args['data']['needsBeginFrame']);
    }
}

function startFrame(startTime) {
    if (frame_model.lastFrame) {
        // flushFrame(frame_model.lastFrame, startTime);
        const frame = frame_model.lastFrame;
        const endTime = startTime;
        // frame_model.lastFrame._setLayerTree(this._lastLayerTree);
        frame_model.lastFrame._setEndTime(endTime); 
        // if (frame_model.lastLayerTree) {
        //     frame_model.lastLayerTree._setPaints(frame_model.lastFrame._paints);
        // }
        if (frame_model.frames.length &&
            (frame_model.lastFrame.startTime !== frame_model.frames[frame_model.frames.length-1].endTime || frame.startTime > frame.endTime)) {
            console.assert(
                false, `Inconsistent frame time for frame ${frame_model.frames.length} (${frame.startTime} - ${frame.endTime})`);
        }
        frame_model.frames.push(frame);
        if (typeof frame_model.lastFrame._mainFrameId === 'number') {
            frame_model.frameById[frame_model.lastFrame._mainFrameId] = frame;
        }
    }
    frame_model.lastFrame = new TimelineFrame(startTime, startTime - frame_model.minimumRecordTime);
}

function commitPendingFrame() {
    frame_model.lastFrame._addTimeForCategories(frame_model.framePendingActivation.timeByCategory);
    frame_model.lastFrame._paints = frame_model.framePendingActivation.paints;
    frame_model.lastFrame._mainFrameId = frame_model.framePendingActivation.mainFrameId;
    frame_model.framePendingActivation = null;
}

function handleBeginFrame(startTime) {
    if (!frame_model.lastFrame) {
        startFrame(startTime);
    }
    frame_model.lastBeginFrame = startTime;
}

function handleDrawFrame(startTime) {
    if (!frame_model.lastFrame) {
        startFrame(startTime);
        return;
    }
      // - if it wasn't drawn, it didn't happen!
      // - only show frames that either did not wait for the main thread frame or had one committed.
    if (frame_model.mainFrameCommitted || !frame_model.mainFrameRequested) {
        if (frame_model.lastNeedsBeginFrame) {
            const idleTimeEnd = frame_model.framePendingActivation ? frame_model.framePendingActivation.triggerTime :
                                                             (frame_model.lastBeginFrame || frame_model.lastNeedsBeginFrame);
            if (idleTimeEnd > frame_model.lastFrame.startTime) {
                frame_model.lastFrame.idle = true;
                startFrame(idleTimeEnd);
                if (frame_model.framePendingActivation) {
                    commitPendingFrame();
                }
                frame_model.lastBeginFrame = null;
            }
            frame_model.lastNeedsBeginFrame = null;
        }
        startFrame(startTime);
    }
    frame_model.mainFrameCommitted = false;
}

function handleActivateLayerTree() {
    if (!frame_model.lastFrame) { return; }
    if (frame_model.framePendingActivation && !frame_model.lastNeedsBeginFrame) {
        commitPendingFrame();
    }
}

function handleRequestMainThreadFrame() {
    if (!frame_model.lastFrame) { return; }
    frame_model.mainFrameRequested = true;
}

function handleNeedFrameChanged(startTime, needsBeginFrame) {
    if (needsBeginFrame) { frame_model.lastNeedsBeginFrame = startTime; }
}
// MIGHT NEED A RETURN
function addTimeForCategory(timeByCategory, event) {
    if (!event.selfTime) { return; }
    const categoryName = categoryMapper(event);
    timeByCategory[categoryName] = (timeByCategory[categoryName] || 0) + event.selfTime; 
}

function addMainThreadTraceEvent(event) {
    if (event.isTopLevel()) {
        frame_model.currentTaskTimeByCategory = {};
        frame_model.lastTaskBeginTime = event.startTime;
    }
    if (!frame_model.framePendingCommit && mainFrameMarkers.indexOf(event.name) >= 0) {
        frame_model.framePendingCommit =
            new PendingFrame(frame_model.lastTaskBeginTime || event.startTime, frame_model.currentTaskTimeByCategory);
    }
    if (!frame_model.framePendingCommit) {
        addTimeForCategory(frame_model.currentTaskTimeByCategory, event);
        return;
    }
    addTimeForCategory(frame_model.framePendingCommit.timeByCategory, event);
  
    if (event.name === RecordTypes.BeginMainThreadFrame && event.args['data'] && event.args['data']['frameId']) {
        frame_model.framePendingCommit.mainFrameId = event.args['data']['frameId'];
    }
    // ARE LAYERPAINTEVENT USEFUL??? NO
    // if (event.name === RecordTypes.Paint && event.args['data']['layerId'] && TimelineData.forEvent(event).picture &&
    //     frame_model.target) {
    //     frame_model.framePendingCommit.paints.push(new LayerPaintEvent(event, frame_model.target));
    // }
    if (event.name === RecordTypes.CompositeLayers && event.args['layerTreeId'] === frame_model.layerTreeId) {
        // handleCompositeLayers();
        if (!frame_model.framePendingCommit) {
            return;
          }
          frame_model.framePendingActivation = frame_model.framePendingCommit;
          frame_model.framePendingCommit = null;
          frame_model.mainFrameRequested = false;
          frame_model.mainFrameCommitted = true;
    }
}

export function addTraceEvents(events, threadData) {
    reset();
    let j = 0;
    let selfTime = 0;
    frame_model.currentProcessMainThread = threadData.length && threadData[0].thread || null;
    for (let i = 0; i < events.length; ++i) {
        while (j + 1 < threadData.length && threadData[j + 1].time <= events[i].startTime) {
            frame_model.currentProcessMainThread = threadData[++j].thread;
        }
    //   addTraceEvent(events[i]);
        const event = events[i];
        if (event.startTime && event.startTime < frame_model.minimumRecordTime) {
            frame_model.minimumRecordTime = event.startTime;
        }
        if (event.name === RecordTypes.SetLayerTreeId) {
            frame_model.layerTreeId = event.args['layerTreeId'] || event.args['data']['layerTreeId'];
            //There is no Snapshot Object, directly go to other else
        } else {
            processCompositorEvents(event);
            if (event.thread === frame_model.currentProcessMainThread) {
                addMainThreadTraceEvent(event);
                selfTime+=event.selfTime;
            } else if (frame_model.lastFrame && event.selfTime && !event.isTopLevel()) {
                frame_model.lastFrame._addTimeForCategory(categoryMapper(event), event.selfTime);
                selfTime+=event.selfTime;
            }
          }
    }
    frame_model.currentProcessMainThread = null;
    return frame_model;
}