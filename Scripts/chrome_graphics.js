class Frame {
    constructor(start, id) {
        // Graphics.Pipeline steps
        this._issueBeginFrame = start;
        this._receiveBeginFrame = null;
        this._receiveBeginFrameDiscard = null;
        this._generateRenderPass = null;
        this._generateCompositorFrame = null;
        this._submitCompositorFrame = null;
        this._receiveCompositorFrame = null;
        this._surfaceAggregation = null;
        this._bind_id = id;


        this._swapBuffers = null;
        this._frameCompleted = null;
        this._mainFrameId = null;
        this._isMainFrame = false;
        this._dropped = null;
        this._scheduled = null;
        this._useless = null;

        // if main frame
        this._sendRequestMainFrame = null;
        this._beginMainFrame = null;
        this._prePaint = null;
        this._beginMainFrameCommit = null;
        this._beginCommit = null;
        this._activateLayerTree = null;
    }
}

class MainFrame {
    constructor(time, id) {
        this._sendRequestMainFrame = time;
        this._beginMainFrame = null;
        this._prePaint = null;
        this._beginMainFrameCommit = null;
        this._beginCommit = null;
        this._mainFrameAborted = null;
        this._activateLayerTree = null;
        this._id = id;
        this._aborted = false;
        this._first_draw = null;
        this._canBeSkipped = false;
    }
}

class Warning {
    constructor(timestamp, message) {
        this._timestamp = timestamp;
        this._msg = message + ' !';
        this._save = `${this._timestamp}: ${this._msg}` 
        console.log(this._save);
    }
}

let metadata;
function reset() {
    metadata = {
        minimumRecordTime: 0,
        errors: [],
        // last_main_frame: null,
        main_frames_pending: [],
        main_frames_aborted: [],
        main_frames_drawn: [],
        frames_completed: [],
        frames_pending: [],
        frames_discarded: [],
        frames_dropped: [],
        frames_useless: [],
        threads: {},
        processes: {}
    }
}

function childEvents(event, sorted_events) {
    return sorted_events.filter(e => (e.ts > event.ts && e.ts < event.ts + event.dur && e.tid == event.tid));
}

function oneAndOnly(time, list, name) {
    if (list.length == 0) {
        metadata.errors.push(new Warning(time, `No ${name}`));
        return false;
    } else if (list.length > 1) {
        metadata.errors.push(new Warning(time, `${list.length} ${name}`));
        // console.log(list);
        return false;
    }

    return true;
}

function shouldBeInThread(event, thread) {
    if (event.tid != metadata.threads[thread]) {
        let name = event.name;
        if (event.name == 'Graphics.Pipeline') {
            name = event.args.step;
        }
        let current_thread;
        const keys = Object.keys(metadata.threads);
        for (t in keys ) {
            if (metadata.threads[keys[t]] == event.tid) {
                current_thread = keys[t];
            }
        }
        metadata.errors.push(new Warning(event.timestamp, `${name} should be in ${thread}, not in ${current_thread}: ${event.tid}`));
    }
}

function processEvents(events) {
    //Variables used in several cases
    reset();
    let frames_matching;
    let main_frames_matching;
    let child_events;
    let index;
    let frame;
    const metadata_events = events.filter(e => e.name == 'thread_name');
    metadata_events.forEach(e => {
        switch (e.name) {
            case 'process_name':
                metadata.processes[e.args.name] = e.pid;
                break;
            case 'thread_name':
                metadata.threads[e.args.name] = e.tid;
                break;
            default: break;
        }
    });
    events.sort((a, b) => a.ts - b.ts);
    const start_index = events.findIndex(e => e.name == 'Graphics.Pipeline' && e.args.step == 'IssueBeginFrame');
    metadata.minimumRecordTime = events.find(e => e.name == 'ThreadPool_RunTask' && e.args.src_func == 'OnTraceLogEnabled').ts;
    events.forEach(e => Object.assign(e, { timestamp: e.ts - metadata.minimumRecordTime }));
    for (let i=start_index; i<events.length; i++) {
        const event = events[i];
        const beginningNoFrame = metadata.frames_completed.length == 0
                            && metadata.frames_pending.length == 0
                            && metadata.frames_useless.length == 0
                            && metadata.frames_discarded.length == 0
                            && metadata.frames_dropped.length == 0;
        const beginningNoMainFrame = metadata.main_frames_pending.length == 0
                                    && metadata.main_frames_aborted.length == 0
                                    && metadata.main_frames_drawn.length == 0
        switch (event.name) {
            case 'Graphics.Pipeline':
                switch(event.args.step) {
                    case 'IssueBeginFrame':
                        shouldBeInThread(event, 'VizCompositorThread');
                        frame = new Frame(event.timestamp, event.bind_id);
                        metadata.frames_pending.push(frame);
                        break;
                    case 'ReceiveBeginFrame':
                        shouldBeInThread('Compositor');
                        let pending_issuebeginframes = metadata.frames_pending.filter(f => !f._receiveBeginFrame && !f._receiveBeginFrameDiscard);
                        oneAndOnly(event.timestamp, pending_issuebeginframes, 'IssueBeginFrame pending ReceiveBeginFrame');

                        frames_matching = metadata.frames_pending.filter(f => f._bind_id == event.bind_id);
                        if (oneAndOnly(event.timewwwwwstamp, frames_matching, 'frame with same bind id (ReceiveBeginFrame)') && !frames_matching[ 0 ]._receiveBeginFrame && !frames_matching[0]._receiveBeginFrameDiscard) {
                            index = metadata.frames_pending.findIndex(f => f._bind_id == event.bind_id);
                            metadata.frames_pending[ index ]._receiveBeginFrame = event.timestamp;

                            if (pending_issuebeginframes.length > 0 && pending_issuebeginframes[ 0 ]._bind_id != metadata.frames_pending[ index ]._bind_id && pending_issuebeginframes[ 0 ]._issueBeginFrame < metadata.frames_pending[ index ]._issueBeginFrame) {
                                metadata.errors.push(new Warning(event.timestamp, 'One IssueBeginFrame lost'));
                                let lost_index = metadata.frames_pending.filter(f => f._bind_id == pending_issuebeginframes[0].bind_id);
                                metadata.frames_useless.push(metadata.frames_pending.splice(lost_index, 1)[0]);
                            }
                        } else { console.log(event.bind_id); console.log(pending_frames)}
                        
                        break;

                    case 'ReceiveBeginFrameDiscard':
                        shouldBeInThread(event, 'Compositor');
                        oneAndOnly(event.timestamp, metadata.frames_pending.filter(f => !f._receiveBeginFrame && !f._receiveBeginFrameDiscard), 'IssueBeginFrame pending ReceiveBegiFrameDiscard');

                        frames_matching = metadata.frames_pending.filter(f => f._bind_id == event.bind_id);
                        if (oneAndOnly(event.timestamp, frames_matching, 'Frame with same bind id (ReceiveBeginFrameDiscard)')) {
                            index = metadata.frames_pending.findIndex(f => f._bind_id == event.bind_id);
                            metadata.frames_pending[ index ]._receiveBeginFrameDiscard = event.timestamp;
                            metadata.frames_discarded.push(metadata.frames_pending[index]);
                            metadata.frames_pending.splice(index, 1);
                        }
                        break;
                    case 'GenerateRenderPass':
                        shouldBeInThread(event, 'Compositor');
                        // Processed as child of ScheduleActionDraw
                        break;
                    case 'GenerateCompositorFrame':
                        shouldBeInThread(event, 'Compositor');
                        // Processed as child of ScheduleActionDraw
                        break;
                    case 'SubmitCompositorFrame':
                        shouldBeInThread(event, 'Compositor');
                        // Processed as child of ScheduleActionDraw
                        break;
                    case 'ReceiveCompositorFrame':
                        shouldBeInThread(event, 'VizCompositorThread');
                        if (beginningNoFrame) { break; }
                        // oneAndOnly(event.timestamp, metadata.frames_pending.filter(f => f._submitCompositorFrame && !f._receiveCompositorFrame), 'frames pending ReceiveCompositorFrame');

                        frames_matching = metadata.frames_pending.filter(f => f._bind_id == event.bind_id);
                        if (oneAndOnly(event.timestamp, frames_matching, 'frames with same bind id (ReceiveCompositorFrame)')) {
                            index = metadata.frames_pending.findIndex(f => f._bind_id == event.bind_id);
                            if (!metadata.frames_pending[index]._generateCompositorFrame) { metadata.errors.push(new Warning(event.timestamp, 'Received Compositor frame that was not generated')); }
                            metadata.frames_pending[index]._receiveCompositorFrame = event.timestamp;
                        }
                        break;
                    case 'SurfaceAggregation':
                        shouldBeInThread(event, 'VizCompositorThread');
                        if (beginningNoFrame) { break; }
                        // console.log(event.bind_id);
                        // frames_matching = metadata.frames_pending.filter(f => f._bind_id == event.bind_id);
                        // if (oneAndOnly(event.timestamp, frames_matching, 'frames with same id (SurfaceAggregation)')) {
                        //     index = metadata.frames_pending.findIndex(f => f._bind_id == event.bind_id);
                        //     metadata.frames_pending[ index ]._surfaceAggregation = event.timestamp;
                        // }
                        child_events = childEvents(event, events);
                        let surface_index = child_events.findIndex(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SurfaceAggregation');
                        if (surface_index > -1) {
                            oneAndOnly(event.timestamp, metadata.frames_pending.filter(f => f._receiveCompositorFrame && !f._surfaceAggregation), 'frames pending SurfaceAggregation');

                            frames_matching = metadata.frames_pending.filter(f => f._bind_id == child_events[surface_index].bind_id);
                            if (oneAndOnly(event.timestamp, frames_matching, 'frames with same bind id (SurfaceAggregation)')) {
                                index = metadata.frames_pending.findIndex(f => f._bind_id == child_events[ surface_index ].bind_id);
                                metadata.frames_pending[ index ]._surfaceAggregation = child_events[surface_index].timestamp;
                            }
                        }
                        break;
                    default: break;
                }
                break;
            case 'Scheduler::BeginImplFrame':
                shouldBeInThread(event, 'Compositor');
                if (beginningNoFrame) { break; }

                frames_matching = metadata.frames_pending.filter(f => f._receiveBeginFrame && !f._scheduled && !f._dropped);
                if (oneAndOnly(event.timestamp, frames_matching, 'frames pendig scheduler')) {
                    index = metadata.frames_pending.findIndex(f => f._receiveBeginFrame && !f._scheduled && !f._dropped);
                    metadata.frames_pending[index]._scheduled = event.timestamp;

                    child_events = childEvents(event, events);
                    oneAndOnly(event.timestamp, child_events.filter(e => e.name == 'BeginFrame'), 'BeginFrame under Scheduler::BeginImplFrame');
                }
                break;
            case 'Scheduler::BeginFrameDropped':
                shouldBeInThread(event, 'Compositor');
                if (beginningNoFrame) { break; }
                frames_matching = metadata.frames_pending.filter(f => f._receiveBeginFrame && !f._scheduled && !f._dropped);
                // oneAndOnly(event.timestamp, frames_matching, 'pending frames waiting schedule');
                if (frames_matching.length > 0) {
                    // Drop the oldest frame matching ie the first one
                    index = metadata.frames_pending.findIndex(f => f._bind_id == frames_matching[0]._bind_id);
                    metadata.frames_pending[index]._dropped = event.timestamp;
                    metadata.frames_dropped.push(metadata.frames_pending.splice(index, 1)[0]);
                }
                break;
            // case 'NeedsBeginFrameChanged':
            //     shouldBeInThread(event, 'Compositor');
            //     if (event.args.data.needsBeginFrame == 0) {
            //         frames_matching = metadata.frames_pending.filter(f => f._scheduled && !f._dropped && !f._generateRenderPass);
            //         if (oneAndOnly(event.timestamp, frames_matching, 'pending frames waiting drawing')) {
            //             index = metadata.frames_pending.findIndex(f => f._scheduled && !f._dropped && !f._generateRenderPass);
            //             // console.log(`Removing Frame from ${metadata.frames_pending[index]._issueBeginFrame}`);
            //             metadata.frames_pending[ index ]._dropped = event.timestamp;
            //             metadata.frames_dropped.push(metadata.frames_pending.splice(index, 1));
            //         }
            //     }
            //     break;
            case 'Scheduler::OnBeginImplFrameDeadline':
                shouldBeInThread(event, 'Compositor');
                if (beginningNoFrame) { break; }
                frames_matching = metadata.frames_pending.filter(f => f._scheduled && !f._useless && !f._generateRenderPass);
                if (oneAndOnly(event.timestamp, frames_matching, 'frames pending scheduler fired')) {
                    child_events = childEvents(event, events);
                    if (child_events.filter(e => e.name == 'ProxyImpl::ScheduledActionDraw').length == 0) {
                        index = metadata.frames_pending.findIndex(f => f._scheduled && !f._useless && !f._generateRenderPass);
                        metadata.frames_pending[index]._useless = event.timestamp;
                        metadata.frames_useless.push(metadata.frames_pending.splice(index, 1)[0]);
                    } 
                }
                break;

            case 'ProxyImpl::ScheduledActionDraw':
                shouldBeInThread(event, 'Compositor');
                if (beginningNoFrame) { break; }
                frames_matching = metadata.frames_pending.filter(f => f._scheduled && !f._dropped && !f._generateRenderPass);

                if (!oneAndOnly(event.timestamp, frames_matching, 'frames pending ScheduleActionDraw')) {
                    child_events = childEvents(event, events);
                    if (child_events.filter(e => e.name == 'LayerTreeHostImpl::PrepareToDraw').length > 0 && metadata.main_frames_pending.length > 0) {
                        let prepareToDraw = child_events.find(e => e.name == 'LayerTreeHostImpl::PrepareToDraw');
                        if (prepareToDraw.args.SourceFrameNumber == metadata.main_frames_pending[0]._id) {
                            metadata.main_frames_pending[0]._first_draw = event.timestamp;
                            metadata.main_frames_drawn.push(metadata.main_frames_pending.splice(0,1)[0]);
                            
                        }
                    } 
                    break;
                }
                index = metadata.frames_pending.findIndex(f => f._scheduled && !f._dropped && !f._generateRenderPass);
                child_events = childEvents(event, events);

                let renderPass = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateRenderPass' && e.bind_id == metadata.frames_pending[index]._bind_id);
                if (oneAndOnly(event.timestamp, renderPass, 'frames with same bind_id GenerateRenderPass')) {
                    metadata.frames_pending[ index ]._generateRenderPass = renderPass[ 0 ].timestamp;
                }

                let drawFrames = child_events.filter(e => e.name == 'DrawFrame');

                let prepareToDraw = child_events.filter(e => e.name == 'LayerTreeHostImpl::PrepareToDraw');
                if (oneAndOnly(event.timestamp, prepareToDraw, 'PrepareToDraw')) {
                    metadata.frames_pending[ index ]._mainFrameId = prepareToDraw[0].args.SourceFrameNumber;
                    main_frames_matching = metadata.main_frames_pending.filter(f => f._activateLayerTree && f._id == prepareToDraw[ 0 ].args.SourceFrameNumber).concat(
                        metadata.main_frames_drawn.filter(f => f._first_draw && f._id == prepareToDraw[ 0 ].args.SourceFrameNumber));

                    if (drawFrames.length > 0) {
                        oneAndOnly(event.timestamp, drawFrames, 'DrawFrame under ScheduleActionDraw');
                        let generateCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateCompositorFrame');
                        if (oneAndOnly(event.timestamp, generateCompositor, 'GenerateCompositorFrame')) {
                            metadata.frames_pending[ index ]._generateCompositorFrame = generateCompositor[ 0 ].timestamp;
                        }

                        let submitCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SubmitCompositorFrame');
                        if (oneAndOnly(event.timestamp, submitCompositor, 'SubmitCompositorFrame')) {
                            metadata.frames_pending[ index ]._submitCompositorFrame = submitCompositor[ 0 ].timestamp;
                        }
                        if (!beginningNoMainFrame && oneAndOnly(event.timestamp, main_frames_matching, 'Main Frames with same id')) {
                            if (main_frames_matching[0]._first_draw) {
                                let main_index = metadata.main_frames_drawn.findIndex(f => f._id == prepareToDraw[ 0 ].args.SourceFrameNumber);
                                if (main_index < metadata.main_frames_drawn.length - 1) {
                                    metadata.errors.push(new Warning(event.timestamp, 'Not the last main frame redrawn'));
                                }
                                Object.assign(metadata.frames_pending[ index ], metadata.main_frames_drawn[ main_index ]);
                            } else {
                                let main_frames_waiting = metadata.main_frames_pending.filter(f => f._activateLayerTree);
                                if (main_frames_waiting.length > 1) {
                                    if (metadata.frames_pending[index]._mainFrameId > main_frames_waiting[0]._id && main_frames_waiting[0]._canBeSkipped) {
                                        let cancelled_index = metadata.main_frames_pending.findIndex(f => f._id == main_frames_waiting[ 0 ]._id);
                                        metadata.main_frames_aborted.push(metadata.main_frames_pending.splice(cancelled_index, 1)[0]);
                                    } else {
                                        oneAndOnly(event.timestamp, main_frames_waiting, 'Main frames activated pending drawing');
                                    }
                                } 
                                // if (!oneAndOnly(event.timestamp, metadata.main_frames_pending.filter(f => f._activateLayerTree), 'Main frames activated pending drawing (bis)')) {
                                //     console.log(metadata.main_frames_pending.filter(f => f._activateLayerTree));
                                // }
                                let main_index = metadata.main_frames_pending.findIndex(f => f._activateLayerTree && f._id == prepareToDraw[ 0 ].args.SourceFrameNumber);

                                metadata.frames_pending[ index ]._isMainFrame = true;
                                metadata.main_frames_pending[ main_index ]._first_draw = event.timestamp;
                                Object.assign(metadata.frames_pending[ index ], metadata.main_frames_pending[ main_index ]);
                                metadata.main_frames_drawn.push(metadata.main_frames_pending.splice(main_index, 1)[0]);
                                
                            }
                        } else if (!beginningNoMainFrame){
                            console.log(`${metadata.main_frames_drawn[ metadata.main_frames_drawn.length - 1 ]._id} : ${prepareToDraw[ 0 ].args.SourceFrameNumber}`)
                            metadata.errors.push(new Warning(event.timestamp, 'SourceFrame unknown'));
                        }
                    } else if (oneAndOnly(event.timestamps, main_frames_matching, 'Main Frames with same id')) {
                        if (!main_frames_matching[0]._first_draw) {
                            let main_index = metadata.main_frames_pending.findIndex(f => f._activateLayerTree && f._id == prepareToDraw[ 0 ].args.SourceFrameNumber);
                            metadata.main_frames_pending[main_index]._canBeSkipped = true;
                        }
                        metadata.frames_useless.push(metadata.frames_pending.splice(index, 1)[0]);
                    }
                }

                break;
            case 'LayerTreeHostImpl::PrepareToDraw':
                shouldBeInThread(event, 'Compositor');
                //Processed in ScheduleActionDraw
                break;
            case 'DrawFrame':
                shouldBeInThread(event, 'Compositor');
                //Processed in ScheduleActionDraw
                break;
            case 'NativeViewGLSurfaceEGL:RealSwapBuffers':
                shouldBeInThread(event, 'CrGpuMain');
                if (beginningNoFrame) { break; }
                frames_matching = metadata.frames_pending.filter(f => f._surfaceAggregation && !f._swapBuffers);
                if (oneAndOnly(event.timestamp, frames_matching, 'frames pending SwapBuffers')) {
                    let index = metadata.frames_pending.findIndex(f => f._surfaceAggregation && !f._swapBuffers);
                    metadata.frames_pending[ index ]._swapBuffers = event.timestamp;
                    metadata.frames_pending[ index ]._frameCompleted = event.timestamp + event.dur;
                    metadata.frames_completed.push(metadata.frames_pending.splice(index, 1)[0]);
                }
                break;
            
            //Main Thread events
            case 'ThreadProxy::ScheduledActionSendBeginMainFrame':
                shouldBeInThread(event, 'Compositor');
                if (metadata.main_frames_drawn.some(f => f._id == event.args.begin_frame_id)) {
                    metadata.errors.push(new Warning(event.timestamp, 'Main Frame already drawn (SendBeginMainFrame)'));
                }
                if (metadata.main_frames_pending.some(f => f._id == event.args.begin_frame_id)) {
                    metadata.errors.push(new Warning(event.timestamp, 'Main Frame already requested (SendBeginMainFrame)'));
                }
                metadata.main_frames_pending.push(new MainFrame(event.timestamp, event.args.begin_frame_id));

                child_events = childEvents(event, events);
                oneAndOnly(event.timestamp, child_events.filter(e => e.name == 'RequestMainThreadFrame'), 'RequestMainThreadFrame under SendRequestMainThread');
                

                break;
            case 'ThreadProxy::BeginMainFrame':
                shouldBeInThread(event, 'CrRendererMain');
                if (beginningNoMainFrame) { break; }
                main_frames_matching = metadata.main_frames_pending.filter(f => f._sendRequestMainFrame && !f._beginMainFrame);
                if (oneAndOnly(event.timestamp, main_frames_matching, 'Main Frames requested (BeginMainFrame)')) {
                    if (main_frames_matching[0]._id !== event.args.begin_frame_id) {
                        metadata.errors.push(new Warning(event.timestamp, 'BeginMainFrame and SendRequestMainFrame don\'t match'));
                    } else {
                        index = metadata.main_frames_pending.findIndex(f => f._sendRequestMainFrame && !f._beginMainFrame);
                        metadata.main_frames_pending[index]._beginMainFrame = event.timestamp;

                        child_events = childEvents(event, events);

                        // let prepaints = child_events.filter(e => e.name == 'LocalFrameView::RunPrePaintLifecyclePhase');
                        // if (oneAndOnly(event.timestamp, prepaints, 'PrePaint')) {
                        //     metadata.main_frames_pending[index]._prePaint = prepaints[ 0 ].ts;
                        // }

                        let commits = child_events.filter(e => e.name == 'ProxyMain::BeginMainFrame::commit');
                        let aborted = child_events.filter(e => e.name == 'EarlyOut_NoUpdates');

                        if (commits.length == 0 && aborted.length == 0) {
                            metadata.errors.push(new Warning(event.timestamp, 'Main Frame neither commited nor aborted'));
                        } else if (commits.length > 0 && aborted.length > 0) {
                            // console.log(aborted)
                            metadata.errors.push(new Warning(event.timestamp, 'Main Frame both committed and aborted'));
                        } else if (commits.length > 0 && oneAndOnly(event.timestamp, commits, 'BeginCommit')) {
                            metadata.main_frames_pending[index]._beginMainFrameCommit = commits[ 0 ].ts;
                        } else if (aborted.length > 0 && oneAndOnly(event.timestamp, aborted, 'EarlyOut')) {
                            metadata.main_frames_pending[index]._aborted = true;
                        }
                    }
                }
                
                break;
            case 'LocalFrameView::RunPrePaintLifecyclePhase':
                shouldBeInThread(event, 'CrRendererMain');
                //Processed in BeginMainFrame
                break;
            case 'ProxyMain::BeginMainFrame::commit':
                shouldBeInThread(event, 'CrRendererMain');
                //Processed in BeginMainFrame
                break;
            case 'ProxyImpl::BeginMainFrameAbortedOnImplThread':
                shouldBeInThread(event, 'Compositor');
                if (beginningNoMainFrame) { break; }
                main_frames_matching = metadata.main_frames_pending.filter(f => f._beginMainFrame && f._aborted && !f._beginMainFrameCommit);
                if (oneAndOnly(event.timestamp, main_frames_matching, 'Main Frame to abort')) {
                    index = metadata.main_frames_pending.findIndex(f => f._beginMainFrame && f._aborted && !f._beginMainFrameCommit);
                    metadata.main_frames_pending[index]._mainFrameAborted = event.timestamp;
                    metadata.main_frames_aborted.push(metadata.main_frames_pending.splice(index, 1)[0]);
                }
                break;
            // case 'Scheduler::NotifyReadyToCommit':
            case 'ProxyImpl::ScheduledActionCommit':
                shouldBeInThread(event, 'Compositor');
                if (beginningNoMainFrame) { break; }
                main_frames_matching = metadata.main_frames_pending.filter(f => f._beginMainFrame && !f._beginCommit && !f._aborted && f._beginMainFrameCommit);
                if (oneAndOnly(event.timestamp, main_frames_matching, 'Main Frame pending ScheduleActionCommit')) {
                    index = metadata.main_frames_pending.findIndex(f => f._beginMainFrame && !f._beginCommit && !f._aborted && f._beginMainFrameCommit);

                    child_events = childEvents(event, events);

                    let beginCommit = child_events.filter(e => e.name == 'LayerTreeHostImpl::BeginCommit');
                    if (oneAndOnly(event.timestamp, beginCommit, 'LayerTreeHostImpl::BeginCommit')) {
                        metadata.main_frames_pending[ index ]._beginCommit = beginCommit[ 0 ].timestamp;
                    }

                    let updateDraw = child_events.filter(e => e.name == 'LayerTreeImpl::UpdateDrawProperties::CalculateDrawProperties');
                    if (oneAndOnly(event.timestamp, updateDraw, 'CalculateDrawProperties') && (updateDraw[ 0 ].args[ 'SourceFrameNumber' ] != metadata.main_frames_pending[ index ]._id)) {
                        metadata.errors.push(new Warning(event.timestamp, 'Commit not for the pending main frame'));
                    }
                }
                break;
            case 'LayerTreeHostImpl::BeginCommit':
                shouldBeInThread(event, 'Compositor');
                //Processed in NotifyReadyToCommit
                break;
            case 'ActivateLayerTree':
                shouldBeInThread(event, 'Compositor');
                if (beginningNoMainFrame) { break; }
                main_frames_matching = metadata.main_frames_pending.filter(f => f._beginCommit && !f._activateLayerTree && f._id == event.args.frameId);
                if (oneAndOnly(event.timestamp, main_frames_matching, 'Main Frame with same if pending activation')) {
                    oneAndOnly(event.timestamp, metadata.main_frames_pending.filter(f => f._beginCommit && !f._activateLayerTree), 'Main Frame to activate')
                    index = metadata.main_frames_pending.findIndex(f => f._beginCommit && !f._activateLayerTree && f._id == event.args.frameId);
                    metadata.main_frames_pending[ index ]._activateLayerTree = event.timestamp;
                }
                break;
            
            default: break;
        }
    }

    return metadata;
}

exports = Object.assign(exports, { processEvents });