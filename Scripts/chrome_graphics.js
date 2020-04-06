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

        this._beginFrame = null;
        this._put_offset = null;
        this._sequence_number = null;
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
        browser_frames_pending: [],
        browser_frames_completed: [],
        browser_frames_dropped: [],
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
    let compositor_frames;
    let renderPass;
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
    //event placed at 0ms on chrome://tracing though not always this one
    metadata.minimumRecordTime = events.find(e => e.ts > 0).ts;
    events.sort((a, b) => a.ts - b.ts);
    const start_index = events.findIndex(e => e.name == 'Graphics.Pipeline' && e.args.step == 'IssueBeginFrame');
    // metadata.minimumRecordTime = events.find(e => e.name == 'ThreadPool_RunTask' && e.args.src_func == 'OnTraceLogEnabled').ts;
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
                        // shouldBeInThread('Compositor');
                        frames_matching = metadata.frames_pending.filter(f => f._bind_id == event.bind_id);
                        if (oneAndOnly(event.timestamp, frames_matching, 'frames pending ReceiveBeginFrame')) {
                            index = metadata.frames_pending.findIndex(f => f._bind_id == event.bind_id);
                            metadata.frames_pending[ index ]._receiveBeginFrame = event.timestamp;
                            let scheduler = childEvents(event, events).filter(e => e.name == "Scheduler::BeginFrame");
                            if (oneAndOnly(event.timestamp, scheduler, 'Scheduler::BeginFrame')) {
                                metadata.frames_pending[index]._sequence_number = scheduler[0].args.args.sequence_number;
                            }

                            
                            if (metadata.threads['CrBrowserMain'] == event.tid) {
                                metadata.browser_frames_pending.push(metadata.frames_pending.splice(index, 1)[0]);
                            }
                        }
                        break;

                    case 'ReceiveBeginFrameDiscard':
                        // shouldBeInThread(event, 'Compositor');
                        frames_matching = metadata.frames_pending.filter(f => f._bind_id == event.bind_id);
                        if (oneAndOnly(event.timestamp, frames_matching, 'frames pending ReceiveBeginFrameDiscard')) {
                            index = metadata.frames_pending.findIndex(f => f._bind_id == event.bind_id);
                            if (metadata.threads[ 'Compositor' ] == event.tid) {
                                index = metadata.frames_pending.findIndex(f => f._bind_id == event.bind_id);
                                metadata.frames_pending[ index ]._receiveBeginFrameDiscard = event.timestamp;
                                metadata.frames_discarded.push(metadata.frames_pending.splice(index, 1)[ 0 ]);
                            } else if (metadata.threads[ 'CrBrowserMain' ] == event.tid) {
                                metadata.frames_pending[ index ]._receiveBeginFrameDiscard = event.timestamp;
                                metadata.frames_pending[ index ]._shouldDrop = event.timestamp;
                                // metadata.browser_frames_pending.push(metadata.frames_pending.splice(index, 1)[0]);
                                metadata.browser_frames_dropped.push(metadata.frames_pending.splice(index, 1)[0]);
                            } else {
                                //To know where it is
                                shouldBeInThread(event, 'Compositor');
                            }
                        }
                        
                        break;
                    case 'GenerateRenderPass':
                        // shouldBeInThread(event, 'Compositor');
                        // Processed as child of ScheduleActionDraw
                        break;
                    case 'GenerateCompositorFrame':
                        // shouldBeInThread(event, 'Compositor');
                        // Processed as child of ScheduleActionDraw
                        break;
                    case 'SubmitCompositorFrame':
                        // shouldBeInThread(event, 'Compositor');
                        // Processed as child of ScheduleActionDraw
                        break;
                    case 'ReceiveCompositorFrame':
                        shouldBeInThread(event, 'VizCompositorThread');
                        if (beginningNoFrame) { break; }
                        // oneAndOnly(event.timestamp, metadata.frames_pending.filter(f => f._submitCompositorFrame && !f._receiveCompositorFrame), 'frames pending ReceiveCompositorFrame');

                        compositor_frames = metadata.frames_pending.filter(f => f._bind_id == event.bind_id);
                        let browser_frames = metadata.browser_frames_pending.filter(f => f._bind_id == event.bind_id);
                        if (oneAndOnly(event.timestamp, compositor_frames.concat(browser_frames), 'frames with same bind id (ReceiveCompositorFrame)')) {
                            if (compositor_frames.length > 0) {
                                index = metadata.frames_pending.findIndex(f => f._bind_id == event.bind_id);
                                if (!metadata.frames_pending[index]._generateCompositorFrame) { metadata.errors.push(new Warning(event.timestamp, 'Received Compositor frame that was not generated')); }
                                metadata.frames_pending[index]._receiveCompositorFrame = event.timestamp;
                            } else if (browser_frames.length > 0) {
                                index = metadata.browser_frames_pending.findIndex(f => f._bind_id == event.bind_id);
                                if (!metadata.browser_frames_pending[ index ]._generateCompositorFrame) { metadata.errors.push(new Warning(event.timestamp, 'Received Compositor frame that was not generated in Browser')); }
                                metadata.browser_frames_pending[ index ]._receiveCompositorFrame = event.timestamp;
                            }
                        }
                        break;
                }
                break;
            
            case 'Scheduler::BeginFrameDropped':
                if (beginningNoFrame) { break; }
                switch (event.tid) {
                    case metadata.threads[ 'Compositor' ]:
                        frames_matching = metadata.frames_pending.filter(f => f._receiveBeginFrame && !f._scheduled && !f._dropped);
                        // oneAndOnly(event.timestamp, frames_matching, 'pending frames waiting schedule');
                        if (frames_matching.length > 0) {
                            // Drop the oldest frame matching ie the first one
                            index = metadata.frames_pending.findIndex(f => f._bind_id == frames_matching[ 0 ]._bind_id);
                            metadata.frames_pending[ index ]._dropped = event.timestamp;
                            metadata.frames_dropped.push(metadata.frames_pending.splice(index, 1)[ 0 ]);
                        }
                        break;
                    case metadata.threads[ 'CrBrowserMain' ]:
                        frames_matching = metadata.browser_frames_pending.filter(f => f._receiveBeginFrame && !f._scheduled && !f._dropped);
                        // oneAndOnly(event.timestamp, frames_matching, 'pending frames waiting schedule');
                        if (frames_matching.length > 0) {
                            // Drop the oldest frame matching ie the first one
                            index = metadata.browser_frames_pending.findIndex(f => f._bind_id == frames_matching[ 0 ]._bind_id);
                            // metadata.browser_frames_pending[ index ]._shouldDrop = event.timestamp;
                            metadata.browser_frames_dropped.push(metadata.browser_frames_pending.splice(index, 1)[ 0 ]);
                        }
                        break;
                }
                break;
            // case 'viz.mojom.FrameSinkManager': 
            //     shouldBeInThread('VizCompositorFrame');
            //     child_events = childEvents(event, events);
            //     let framesink = child_events.filter(e => e.name == 'CompositorFrameSinkSupport::DidNotProduceFrame');
            //     if (framesink.length > 0) {
            //         let browser_frames_matching = metadata.browser_frames_pending.filter(f => f._sequence_number == framesink[0].args.ack.sequence_number);
            //         if (browser_frames_matching.length == 0) {
            //             browser_frames_matching = metadata.browser_frames_pending.filter(f => f._receiveBeginFrameDiscard);
            //         }
            //         if (oneAndOnly(framesink[0].timestamp, browser_frames_matching, 'Browser frame with same sequence number (DidNotProduceFrame)')) {
            //             index = metadata.browser_frames_pending.findIndex(f => f._sequence_number == framesink[0].args.ack.sequence_number);
            //             if (index < 0) {
            //                 index = metadata.browser_frames_pending.findIndex(f => f._receiveBeginFrameDiscard);
            //             }
            //             if (!metadata.browser_frames_pending[ index ]._shouldDrop) {
            //                 if (metadata.browser_frames_pending[ index ]._scheduled) {
            //                     metadata.browser_frames_pending[ index ]._willDrop = framesink[0].timestamp;
            //                 } else {
            //                     metadata.errors.push(new Warning(framesink[0].timestamp, 'Browser frame dropped but no BeginFrameDropped (DidNotProduceFrame)'));
            //                 }
            //             } else {
            //                 metadata.browser_frames_pending[ index ]._dropped = event.timestamp;
            //                 metadata.browser_frames_dropped.push(metadata.browser_frames_pending.splice(index, 1)[ 0 ]);
            //             }
            //         } else {
            //             console.log(metadata.browser_frames_pending);
            //             console.log(framesink[0].args);
            //         }
            //     }
            // case 'CompositorFrameSinkSupport::DidNotProduceFrame':
            //     shouldBeInThread('VizCompositorThread');
            //     let browser_frames_matching = metadata.browser_frames_pending.filter(f => f._sequence_number == event.args.ack.sequence_number);
            //     if (oneAndOnly(event.timestamp, browser_frames_matching, 'Browser frame with same sequence number (DidNotProduceFrame)')) {
            //         index = metadata.browser_frames_pending.findIndex(f => f._sequence_number == event.args.ack.sequence_number);
            //         if (!metadata.browser_frames_pending[index]._shouldDrop) {
            //             metadata.errors.push(new Warning(event.timestamp, 'Browser frame dropped but no BeginFrameDropped (DidNotProduceFrame)'));
            //         }
            //         metadata.browser_frames_pending[index]._dropped = event.timestamp;
            //         metadata.browser_frames_dropped.push(metadata.browser_frames_pending.splice(index, 0)[0]);
            //     }


            case 'Scheduler::BeginImplFrame':
                // shouldBeInThread(event, 'Compositor');

                if (beginningNoFrame) { break; }
                child_events = childEvents(event, events);
                let beginFrames = child_events.filter(e => e.name == 'BeginFrame');
                if (metadata.threads[ 'Compositor' ] == event.tid) {
                    frames_matching = metadata.frames_pending.filter(f => f._sequence_number == event.args.args.sequence_number);
                    if (oneAndOnly(event.timestamp, frames_matching, 'frames with same sequence number (BeginImplFrame)')) {
                        index = metadata.frames_pending.findIndex(f => f._sequence_number == event.args.args.sequence_number);
                        metadata.frames_pending[index]._scheduled = event.timestamp;
                        
                        // if (oneAndOnly(event.timestamp, beginFrames , 'BeginFrame under Scheduler::BeginImplFrame')) {
                        //     metadata.frames_pending[index]._beginFrame = beginFrames[0].timestamp;
                        // }
                        if (beginFrames.length > 0) {
                            oneAndOnly(event.timestamp, beginFrames, 'BeginFrame under Scheduler::BeginImplFrame')
                            metadata.frames_pending[ index ]._beginFrame = beginFrames[ 0 ].timestamp;
                        }

                    } else if (metadata.frames_dropped.filter(f => f._sequence_number == event.args.args.sequence_number).length > 0) {
                        metadata.errors.push(new Warning(event.timestamp, 'Dropped compositor frame actually scheduled'));
                        index = metadata.frames_dropped.findIndex(f => f._sequence_number == event.args.args.sequence_number);
                        metadata.frames_dropped[ index ]._scheduled = event.timestamp;

                        if (beginFrames.length > 0) {
                            oneAndOnly(event.timestamp, beginFrames, 'BeginFrame under Scheduler::BeginImplFrame on Browser')
                            metadata.frames_dropped[ index ]._beginFrame = beginFrames[ 0 ].timestamp;
                        }

                        metadata.frames_pending.push(metadata.frames_dropped.splice(index, 1)[ 0 ]);
                    }

                } else if (metadata.threads[ 'CrBrowserMain' ] == event.tid) {
                    frames_matching = metadata.browser_frames_pending.filter(f => f._sequence_number == event.args.args.sequence_number);
                    let sendrequest = child_events.filter(e => e.name == 'SingleThreadProxy::ScheduledActionSendBeginMainFrame');
                    if (frames_matching.length > 0) {
                        oneAndOnly(event.timestamp, frames_matching, 'browser frames with same sequence number (BeginImplFrame)')
                        index = metadata.browser_frames_pending.findIndex(f => f._sequence_number == event.args.args.sequence_number);
                        metadata.browser_frames_pending[ index ]._scheduled = event.timestamp;

                        if (beginFrames.length == 1) {
                            metadata.browser_frames_pending[ index ]._beginFrame = beginFrames[ 0 ].timestamp;

                            // if (sendrequest.length > 0) {
                            //     oneAndOnly(event.timestamp, sendrequest, 'Request main frame (Browser)')
                            //     metadata.browser_frames_pending[ index ]._sendRequestMainFrame = sendrequest[ 0 ].timestamp;
                            // }
                        }
                    } else if (metadata.browser_frames_dropped.filter(f => f._sequence_number == event.args.args.sequence_number).length > 0) {
                        metadata.errors.push(new Warning(event.timestamp, 'Dropped browser frame actually scheduled'));
                        index = metadata.browser_frames_dropped.findIndex(f => f._sequence_number == event.args.args.sequence_number);
                        metadata.browser_frames_dropped[ index ]._scheduled = event.timestamp;

                        if (beginFrames.length == 1) {
                            metadata.browser_frames_dropped[ index ]._beginFrame = beginFrames[ 0 ].timestamp;
                            // if (oneAndOnly(event.timestamp, sendrequest, 'Request main frame (Browser)')) {
                            //     metadata.browser_frames_dropped[ index ]._sendRequestMainFrame = sendrequest[ 0 ].timestamp;
                            // }
                        }

                        metadata.browser_frames_pending.push(metadata.browser_frames_dropped.splice(index, 1)[0]);
                    } else {
                        metadata.errors.push(new Warning(event.timestamp, 'Unknown boorwser frame being scheduled (BeginImplFrame)'));
                        break;
                    }
                
                }
                break;
            
            case 'Scheduler::MissedBeginFrameDropped':
                if (beginningNoFrame) { break; }
                switch (event.tid) {
                    case metadata.threads[ 'Compositor' ]:
                        frames_matching = metadata.frames_pending.filter(f => f._scheduled && !f._beginFrame && !f._dropped);
                        // oneAndOnly(event.timestamp, frames_matching, 'pending frames waiting schedule');
                        if (frames_matching.length > 0) {
                            // Drop the oldest frame matching ie the first one
                            index = metadata.frames_pending.findIndex(f => f._bind_id == frames_matching[ 0 ]._bind_id);
                            metadata.frames_pending[ index ]._dropped = event.timestamp;
                            metadata.frames_dropped.push(metadata.frames_pending.splice(index, 1)[ 0 ]);
                        }
                        break;
                    case metadata.threads[ 'CrBrowserMain' ]:
                        frames_matching = metadata.browser_frames_pending.filter(f => f._scheduled && !f._beginFrame && !f._dropped);
                        // oneAndOnly(event.timestamp, frames_matching, 'pending frames waiting schedule');
                        if (frames_matching.length > 0) {
                            // Drop the oldest frame matching ie the first one
                            index = metadata.browser_frames_pending.findIndex(f => f._bind_id == frames_matching[ 0 ]._bind_id);
                            metadata.browser_frames_pending[ index ]._shouldDrop = event.timestamp;
                            metadata.browser_frames_dropped.push(metadata.browser_frames_pending.splice(index, 1)[ 0 ]);
                        }
                        break;
                }
                break;
                // frames_matching = metadata.browser_frames_pending.filter(f => f._receiveBeginFrame && !f._beginMainFrame);
                // // oneAndOnly(event.timestamp, frames_matching, 'pending frames waiting schedule');
                // if (frames_matching.length > 0) {
                //     // Drop the oldest frame matching ie the first one
                //     index = metadata.browser_frames_pending.findIndex(f => f._bind_id == frames_matching[ 0 ]._bind_id);
                //     metadata.browser_frames_pending[ index ]._dropped = event.timestamp;
                //     metadata.browser_frames_dropped.push(metadata.browser_frames_pending.splice(index, 1)[ 0 ]);
                // }
                // break;
            case 'SingleThreadProxy::ScheduledActionSendBeginMainFrame':
                shouldBeInThread('CrBrowserMain');
                frames_matching = metadata.browser_frames_pending.filter(f => f._beginFrame && !f._sendRequestMainFrame);
                if (oneAndOnly(event.timestamp, frames_matching, 'BrowserFrame pending main frame request')) {
                    // console.log(`${event.timestamp}: MAIN FRAME REQUEST`);
                    index = metadata.browser_frames_pending.findIndex(f => f._beginFrame && !f._sendRequestMainFrame);
                    // console.log(metadata.browser_frames_pending[ index ]);
                    metadata.browser_frames_pending[index]._sendRequestMainFrame = event.timestamp;
                }
                break;

            case 'BeginMainThreadFrame':
                if (metadata.threads['CrBrowserMain'] == event.tid) {
                    frames_matching = metadata.browser_frames_pending.filter(f => f._sendRequestMainFrame && !f._beginMainFrame);
                    if (oneAndOnly(event.timestamp, frames_matching, 'BrowserFrame pending beginMainFrame')) {
                        index = metadata.browser_frames_pending.findIndex(f => f._sendRequestMainFrame && !f._beginMainFrame);
                        metadata.browser_frames_pending[index]._beginMainFrame = event.timestamp;
                    } else {
                        console.log(metadata.browser_frames_pending);
                    }
                } else if (metadata.threads[ 'CrRendererMain' ] != event.tid) {
                    metadata.errors.push(new Warning(event.timestamp, `BeginMainThreadFrame in ${event.tid}`))
                }
            
                break;
            case 'Scheduler::OnBeginImplFrameDeadline':
                // shouldBeInThread(event, 'Compositor');
                if (metadata.threads[ 'Compositor' ] == event.tid) {
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
                } else if (metadata.threads[ 'CrBrowserMain' ] == event.tid) {
                    frames_matching = metadata.browser_frames_pending.filter(f => f._scheduled && !f._useless && !f._generateRenderPass);
                    if (oneAndOnly(event.timestamp, frames_matching, 'frames pending scheduler fired on Browser')) {
                        child_events = childEvents(event, events);
                        if (child_events.filter(e => e.name == 'SingleThreadProxy::DoComposite').length == 0) {
                            index = metadata.browser_frames_pending.findIndex(f => f._scheduled && !f._useless && !f._generateRenderPass);
                            metadata.browser_frames_pending[ index ]._useless = event.timestamp;
                            metadata.browser_frames_dropped.push(metadata.browser_frames_pending.splice(index, 1)[ 0 ]);
                        }
                    }
                }
                break;
            case 'SingleThreadProxy::DoComposite':
                shouldBeInThread('CrRendererMain');
                child_events = childEvents(event, events);
                renderPass = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateRenderPass');
                if (oneAndOnly(event.timestamp, renderPass, 'frames with same bind_id GenerateRenderPass')) {
                    index = metadata.browser_frames_pending.findIndex(f => f._bind_id == renderPass[0].bind_id);
                    metadata.browser_frames_pending[ index ]._generateRenderPass = renderPass[ 0 ].timestamp;
                    let generateCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateCompositorFrame');
                    if (oneAndOnly(event.timestamp, generateCompositor, 'GenerateCompositorFrame')) {
                        metadata.browser_frames_pending[ index ]._generateCompositorFrame = generateCompositor[ 0 ].timestamp;
                    } else if (generateCompositor.length == 0) {
                        metadata.browser_frames_pending[ index ]._useless = true;
                        metadata.browser_frames_dropped.push(metadata.browser_frames_pending.splice(index, 1)[ 0 ]);
                        break;
                    }

                    let submitCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SubmitCompositorFrame');
                    if (oneAndOnly(event.timestamp, submitCompositor, 'SubmitCompositorFrame')) {
                        metadata.browser_frames_pending[ index ]._submitCompositorFrame = submitCompositor[ 0 ].timestamp;
                    }
                }
                // frames_matching = metadata.browser_frames_pending.filter(f => f._activateLayerTree && !f._generateRenderPass);
                // if (oneAndOnly(event.timestamp, frames_matching, 'Browser frame pending composition')) {
                //     index = metadata.browser_frames_pending.findIndex(f => f._scheduled && !f._generateRenderPass);
                //     // child_events = childEvents(event, events);

                //     // let renderPass = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateRenderPass' && e.bind_id == metadata.browser_frames_pending[ index ]._bind_id);
                //     // if (oneAndOnly(event.timestamp, renderPass, 'frames with same bind_id GenerateRenderPass')) {
                //     //     metadata.browser_frames_pending[ index ]._generateRenderPass = renderPass[ 0 ].timestamp;
                //     // }

                //     let generateCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateCompositorFrame');
                //     if (oneAndOnly(event.timestamp, generateCompositor, 'GenerateCompositorFrame')) {
                //         metadata.browser_frames_pending[ index ]._generateCompositorFrame = generateCompositor[ 0 ].timestamp;
                //     } else if (generateCompositor.length == 0) {
                //         metadata.browser_frames_pending[index]._useless = true;
                //         metadata.browser_frames_dropped.push(metadata.browser_frames_pending.splice(index, 1)[0]);
                //         break;
                //     }

                //     let submitCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SubmitCompositorFrame');
                //     if (oneAndOnly(event.timestamp, submitCompositor, 'SubmitCompositorFrame')) {
                //         metadata.browser_frames_pending[ index ]._submitCompositorFrame = submitCompositor[ 0 ].timestamp;
                //     }
                // }

                break;

            case 'ProxyImpl::ScheduledActionDraw':
                shouldBeInThread(event, 'Compositor');
                if (beginningNoFrame) { break; }
                child_events = childEvents(event, events);
                renderPass = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateRenderPass');
                if (oneAndOnly(event.timestamp, renderPass, 'frames with same bind_id GenerateRenderPass')) {
                    index = metadata.frames_pending.findIndex(f => f._bind_id == renderPass[ 0 ].bind_id);
                    if (index < 0) {
                        metadata.errors.push(new Warning(event.timestamp, 'No pending compositor frame with same bind_id'));
                        break;
                    }
                    metadata.frames_pending[ index ]._generateRenderPass = renderPass[ 0 ].timestamp;

                    let drawFrames = child_events.filter(e => e.name == 'DrawFrame');
                    if (drawFrames.length > 0) {
                        oneAndOnly(event.timestamp, drawFrames, 'DrawFrame under ScheduleActionDraw')

                        let generateCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateCompositorFrame');
                        if (oneAndOnly(event.timestamp, generateCompositor, 'GenerateCompositorFrame')) {
                            metadata.frames_pending[ index ]._generateCompositorFrame = generateCompositor[ 0 ].timestamp;
                        } else if (generateCompositor.length == 0) {
                            metadata.frames_pending[ index ]._useless = true;
                            metadata.frames_dropped.push(metadata.browser_frames_pending.splice(index, 1)[ 0 ]);
                            break;
                        }

                        let submitCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SubmitCompositorFrame');
                        if (submitCompositor.length == 1) {
                            metadata.frames_pending[ index ]._submitCompositorFrame = submitCompositor[ 0 ].timestamp;
                        }
                    }

                    let prepareToDraw = child_events.filter(e => e.name == 'LayerTreeHostImpl::PrepareToDraw');
                    if (oneAndOnly(event.timestamp, prepareToDraw, 'PrepareToDraw')) {
                        metadata.frames_pending[ index ]._mainFrameId = prepareToDraw[ 0 ].args.SourceFrameNumber;
                        main_frames_matching = metadata.main_frames_pending.filter(f => f._activateLayerTree && f._id == prepareToDraw[ 0 ].args.SourceFrameNumber).concat(
                            metadata.main_frames_drawn.filter(f => f._first_draw && f._id == prepareToDraw[ 0 ].args.SourceFrameNumber));
                        
                        if (main_frames_matching.length == 0 && metadata.main_frames_drawn.length == 0 ) {
                            let prev_main_frame = new MainFrame(0, prepareToDraw[ 0 ].args.SourceFrameNumber);
                            prev_main_frame._first_draw = true;
                            metadata.main_frames_drawn.push(prev_main_frame);
                            main_frames_matching = metadata.main_frames_drawn;
                        }

                        if (!beginningNoMainFrame && oneAndOnly(event.timestamp, main_frames_matching, 'Main Frames with same id (ScheduleActionDraw)')) {
                            if (main_frames_matching[ 0 ]._first_draw) {
                                let main_index = metadata.main_frames_drawn.findIndex(f => f._id == prepareToDraw[ 0 ].args.SourceFrameNumber);
                                if (main_index < metadata.main_frames_drawn.length - 1) {
                                    metadata.errors.push(new Warning(event.timestamp, 'Not the last main frame redrawn'));
                                }
                                Object.assign(metadata.frames_pending[ index ], metadata.main_frames_drawn[ main_index ]);
                            } else {
                                let main_frames_waiting = metadata.main_frames_pending.filter(f => f._activateLayerTree);
                                if (main_frames_waiting.length > 1) {
                                    if (metadata.frames_pending[ index ]._mainFrameId > main_frames_waiting[ 0 ]._id && main_frames_waiting[ 0 ]._canBeSkipped) {
                                        let cancelled_index = metadata.main_frames_pending.findIndex(f => f._id == main_frames_waiting[ 0 ]._id);
                                        metadata.main_frames_aborted.push(metadata.main_frames_pending.splice(cancelled_index, 1)[ 0 ]);
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
                                metadata.main_frames_drawn.push(metadata.main_frames_pending.splice(main_index, 1)[ 0 ]);

                            }
                        } else if (!beginningNoMainFrame && metadata.main_frames_drawn.length > 0) {
                            console.log(`${metadata.main_frames_drawn[ metadata.main_frames_drawn.length - 1 ]._id} : ${prepareToDraw[ 0 ].args.SourceFrameNumber}`)
                            metadata.errors.push(new Warning(event.timestamp, 'SourceFrame unknown'));
                        } else if (oneAndOnly(event.timestamp, main_frames_matching, 'Main Frames with same id (ScheduleActionDraw)')) {
                            if (!main_frames_matching[ 0 ]._first_draw) {
                                let main_index = metadata.main_frames_pending.findIndex(f => f._activateLayerTree && f._id == prepareToDraw[ 0 ].args.SourceFrameNumber);
                                metadata.main_frames_pending[ main_index ]._canBeSkipped = true;
                            }
                            metadata.frames_useless.push(metadata.frames_pending.splice(index, 1)[ 0 ]);
                        }
                    }
                }



                // frames_matching = metadata.frames_pending.filter(f => f._scheduled && !f._dropped && !f._generateRenderPass);

                // if (!oneAndOnly(event.timestamp, frames_matching, 'frames pending ScheduleActionDraw')) {
                //     child_events = childEvents(event, events);
                //     if (child_events.filter(e => e.name == 'LayerTreeHostImpl::PrepareToDraw').length > 0 && metadata.main_frames_pending.length > 0) {
                //         let prepareToDraw = child_events.find(e => e.name == 'LayerTreeHostImpl::PrepareToDraw');
                //         if (prepareToDraw.args.SourceFrameNumber == metadata.main_frames_pending[0]._id) {
                //             metadata.main_frames_pending[0]._first_draw = event.timestamp;
                //             metadata.main_frames_drawn.push(metadata.main_frames_pending.splice(0,1)[0]);
                            
                //         }
                //     } 
                //     break;
                // }
                // index = metadata.frames_pending.findIndex(f => f._scheduled && !f._dropped && !f._generateRenderPass);
                // child_events = childEvents(event, events);

                // let renderPass = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateRenderPass' && e.bind_id == metadata.frames_pending[index]._bind_id);
                // if (oneAndOnly(event.timestamp, renderPass, 'frames with same bind_id GenerateRenderPass')) {
                //     metadata.frames_pending[ index ]._generateRenderPass = renderPass[ 0 ].timestamp;
                // }

                // let drawFrames = child_events.filter(e => e.name == 'DrawFrame');

                // let prepareToDraw = child_events.filter(e => e.name == 'LayerTreeHostImpl::PrepareToDraw');
                // if (oneAndOnly(event.timestamp, prepareToDraw, 'PrepareToDraw')) {
                //     metadata.frames_pending[ index ]._mainFrameId = prepareToDraw[0].args.SourceFrameNumber;
                //     main_frames_matching = metadata.main_frames_pending.filter(f => f._activateLayerTree && f._id == prepareToDraw[ 0 ].args.SourceFrameNumber).concat(
                //         metadata.main_frames_drawn.filter(f => f._first_draw && f._id == prepareToDraw[ 0 ].args.SourceFrameNumber));

                //     if (drawFrames.length > 0) {
                //         oneAndOnly(event.timestamp, drawFrames, 'DrawFrame under ScheduleActionDraw');
                //         let generateCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateCompositorFrame');
                //         if (oneAndOnly(event.timestamp, generateCompositor, 'GenerateCompositorFrame')) {
                //             metadata.frames_pending[ index ]._generateCompositorFrame = generateCompositor[ 0 ].timestamp;
                //         }

                //         let submitCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SubmitCompositorFrame');
                //         if (oneAndOnly(event.timestamp, submitCompositor, 'SubmitCompositorFrame')) {
                //             metadata.frames_pending[ index ]._submitCompositorFrame = submitCompositor[ 0 ].timestamp;
                //         }
                //         if (!beginningNoMainFrame && oneAndOnly(event.timestamp, main_frames_matching, 'Main Frames with same id')) {
                //             if (main_frames_matching[0]._first_draw) {
                //                 let main_index = metadata.main_frames_drawn.findIndex(f => f._id == prepareToDraw[ 0 ].args.SourceFrameNumber);
                //                 if (main_index < metadata.main_frames_drawn.length - 1) {
                //                     metadata.errors.push(new Warning(event.timestamp, 'Not the last main frame redrawn'));
                //                 }
                //                 Object.assign(metadata.frames_pending[ index ], metadata.main_frames_drawn[ main_index ]);
                //             } else {
                //                 let main_frames_waiting = metadata.main_frames_pending.filter(f => f._activateLayerTree);
                //                 if (main_frames_waiting.length > 1) {
                //                     if (metadata.frames_pending[index]._mainFrameId > main_frames_waiting[0]._id && main_frames_waiting[0]._canBeSkipped) {
                //                         let cancelled_index = metadata.main_frames_pending.findIndex(f => f._id == main_frames_waiting[ 0 ]._id);
                //                         metadata.main_frames_aborted.push(metadata.main_frames_pending.splice(cancelled_index, 1)[0]);
                //                     } else {
                //                         oneAndOnly(event.timestamp, main_frames_waiting, 'Main frames activated pending drawing');
                //                     }
                //                 } 
                //                 // if (!oneAndOnly(event.timestamp, metadata.main_frames_pending.filter(f => f._activateLayerTree), 'Main frames activated pending drawing (bis)')) {
                //                 //     console.log(metadata.main_frames_pending.filter(f => f._activateLayerTree));
                //                 // }
                //                 let main_index = metadata.main_frames_pending.findIndex(f => f._activateLayerTree && f._id == prepareToDraw[ 0 ].args.SourceFrameNumber);

                //                 metadata.frames_pending[ index ]._isMainFrame = true;
                //                 metadata.main_frames_pending[ main_index ]._first_draw = event.timestamp;
                //                 Object.assign(metadata.frames_pending[ index ], metadata.main_frames_pending[ main_index ]);
                //                 metadata.main_frames_drawn.push(metadata.main_frames_pending.splice(main_index, 1)[0]);
                                
                //             }
                //         } else if (!beginningNoMainFrame){
                //             console.log(`${metadata.main_frames_drawn[ metadata.main_frames_drawn.length - 1 ]._id} : ${prepareToDraw[ 0 ].args.SourceFrameNumber}`)
                //             metadata.errors.push(new Warning(event.timestamp, 'SourceFrame unknown'));
                //         }
                //     } else if (oneAndOnly(event.timestamps, main_frames_matching, 'Main Frames with same id')) {
                //         if (!main_frames_matching[0]._first_draw) {
                //             let main_index = metadata.main_frames_pending.findIndex(f => f._activateLayerTree && f._id == prepareToDraw[ 0 ].args.SourceFrameNumber);
                //             metadata.main_frames_pending[main_index]._canBeSkipped = true;
                //         }
                //         metadata.frames_useless.push(metadata.frames_pending.splice(index, 1)[0]);
                //     }
                // }

                break;
            case 'LayerTreeHostImpl::PrepareToDraw':
                // shouldBeInThread(event, 'Compositor');
                //Processed in ScheduleActionDraw
                break;
            case 'DrawFrame':
                // shouldBeInThread(event, 'Compositor');
                //Processed in ScheduleActionDraw
                break;
            case 'Display::DrawAndSwap':
                shouldBeInThread('VizCompositorThread');
                child_events = childEvents(event, events);
                let surfaces = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SurfaceAggregation');
                let frames_drawn = [];
                surfaces.forEach(e => {
                    let new_compositor_frames = metadata.frames_pending.filter(f => f._bind_id == e.bind_id);
                    let old_compositor_frames = metadata.frames_completed.filter(f => f._bind_id == e.bind_id);
                    let new_browser_frames = metadata.browser_frames_pending.filter(f => f._bind_id == e.bind_id);
                    let old_browser_frames = metadata.browser_frames_completed.filter(f => f._bind_id == e.bind_id);
                    let frames = new_compositor_frames.concat(old_compositor_frames).concat(new_browser_frames).concat(old_browser_frames)
                    if (frames.length > 0) {
                        oneAndOnly(e.timestamp, frames, 'frames with same bind id (SurfaceAggregation)')
                        if (new_compositor_frames.length > 0) {
                            index = metadata.frames_pending.findIndex(f => f._bind_id == e.bind_id);
                            if (metadata.frames_pending[ index ]._surfaceAggregation) {
                                metadata.errors.push(new Warning(e.timestamp, 'frame surface already aggregated'));
                            } else {
                                metadata.frames_pending[ index ]._surfaceAggregation = e.timestamp;
                                frames_drawn.push({ id: e.bind_id, inBrowser: false });
                            }
                        } else if (old_compositor_frames.length > 0) {
                            index = metadata.frames_completed.findIndex(f => f._bind_id == e.bind_id);
                            if (index < metadata.frames_completed.length - 1) {
                                metadata.errors.push(new Warning(e.timestamp, 'Compositor Frames are going back'));
                            }
                        } else if (new_browser_frames.length > 0) {
                            index = metadata.browser_frames_pending.findIndex(f => f._bind_id == e.bind_id);
                            if (metadata.browser_frames_pending[ index ]._surfaceAggregation) { metadata.errors.push(new Warning(e.timestamp, 'pending browser frame surface was already aggregated')); }
                            metadata.browser_frames_pending[ index ]._surfaceAggregation = e.timestamp;
                            frames_drawn.push({ id: e.bind_id, inBrowser: true  });
                        } else if (old_browser_frames.length > 0) {
                            index = metadata.browser_frames_completed.findIndex(f => f._bind_id == e.bind_id);
                            if (index < metadata.browser_frames_completed.length - 1) {
                                metadata.errors.push(new Warning(e.timestamp, 'Browser Frames are going back'));
                            }

                        }
                    //If no known browser frame, add the bind id as a current browser frame to have the error only once
                    } else if (metadata.browser_frames_completed.length == 0 && e.bind_id.length == 11) {
                        metadata.browser_frames_completed.push(new Frame(0, e.bind_id));
                    } else if (metadata.frames_completed.length == 0 && e.bind_id.length == 15) {
                        metadata.frames_completed.push(new Frame(0, e.bind_id));
                    } else {
                        console.log(`Unknown bind_id: ${e.bind_id}`);
                    }
                });

                let gl_renderer = child_events.filter(e => e.name == 'GLRenderer::SwapBuffers');
                if (oneAndOnly(event.timestamp, gl_renderer, 'GLRenderer:SwapBuffers')) {
                    let grand_children = childEvents(gl_renderer[0], events);
                    let buffer_flush = grand_children.filter(e => e.name == 'InProcessCommandBuffer::Flush');
                    if (oneAndOnly(gl_renderer[0].timestamp, buffer_flush, 'Buffer:Flush')) {
                        frames_drawn.forEach(frame => {
                            if (frame.inBrowser) {
                                index = metadata.browser_frames_pending.findIndex(f => f._bind_id == frame.id);
                                metadata.browser_frames_pending[index]._put_offset = buffer_flush[0].args.put_offset;
                            } else {
                                index = metadata.frames_pending.findIndex(f => f._bind_id == frame.id);
                                metadata.frames_pending[ index ]._put_offset = buffer_flush[ 0 ].args.put_offset;
                            }
                        })
                    }
                }

                break;

            case 'InProcessCommandBuffer::FlushOnGpuThread':
                shouldBeInThread(event, 'CrGpuMain');
                if (beginningNoFrame) { break; }
                child_events = childEvents(event, events);
                let swap = child_events.filter(e => e.name == 'NativeViewGLSurfaceEGL:RealSwapBuffers');
                if (swap.length == 1) {
                    index = metadata.frames_pending.findIndex(f => f._put_offset == event.args.put_offset);
                    if (index >= 0) {
                        if (!metadata.frames_pending[index]._surfaceAggregation) {
                            metadata.errors.push(new Warning(event.timestamp, 'Frame with same put offset not aggregated'));
                        } else {
                            metadata.frames_pending[ index ]._swapBuffers = swap[0].timestamp;
                            metadata.frames_pending[ index ]._frameCompleted = swap[ 0 ].timestamp + swap[0].dur;
                            metadata.frames_completed.push(metadata.frames_pending.splice(index,1)[0]);
                        }
                    }
                    index = metadata.browser_frames_pending.findIndex(f => f._put_offset == event.args.put_offset);
                    if (index >= 0) {
                        metadata.browser_frames_pending[ index ]._swapBuffers = swap[ 0 ].timestamp;
                        metadata.browser_frames_pending[ index ]._frameCompleted = swap[ 0 ].timestamp + swap[ 0 ].dur;
                        metadata.browser_frames_completed.push(metadata.browser_frames_pending.splice(index, 1)[ 0 ]);
                    }
                } else if (swap.length > 1) {
                    metadata.errors.push(new Warning(event.timestamp, 'Too many swapBuffers'));
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
                //TODO : register a new main frame only with child event
                child_events = childEvents(event, events);
                oneAndOnly(event.timestamp, child_events.filter(e => e.name == 'RequestMainThreadFrame'), 'RequestMainThreadFrame under SendRequestMainThread');
                

                break;
            case 'ThreadProxy::BeginMainFrame':
                shouldBeInThread(event, 'CrRendererMain');
                if (beginningNoMainFrame) { break; }
                child_events = childEvents(event, events);
                let beginMain = child_events.filter(e => e.name == 'BeginMainThreadFrame');
                if (beginMain.length > 0) {
                    oneAndOnly(event.timestamp, beginMain, 'BeginMainThreadFrame');
                    main_frames_matching = metadata.main_frames_pending.filter(f => f._id == beginMain[0].args.data.frameId);
                    if (oneAndOnly(event.timestamp, main_frames_matching, 'Main Frames with same id pending beginFrame')) {
                        index = metadata.main_frames_pending.findIndex(f => f._id == beginMain[ 0 ].args.data.frameId);
                        metadata.main_frames_pending[ index ]._beginMainFrame = beginMain[0].timestamp;

                        let commits = child_events.filter(e => e.name == 'ProxyMain::BeginMainFrame::commit');
                        let aborted = child_events.filter(e => e.name.includes('EarlyOut_NoUpdate'));

                        if (commits.length == 0 && aborted.length == 0) {
                            metadata.errors.push(new Warning(event.timestamp, 'Main Frame neither commited nor aborted'));
                        } else if (commits.length > 0 && aborted.length > 0) {
                            // console.log(aborted)
                            metadata.errors.push(new Warning(event.timestamp, 'Main Frame both committed and aborted'));
                        } else if (commits.length > 0 && oneAndOnly(event.timestamp, commits, 'BeginCommit')) {
                            metadata.main_frames_pending[ index ]._beginMainFrameCommit = commits[ 0 ].ts;
                        } else if (aborted.length > 0 && oneAndOnly(event.timestamp, aborted, 'EarlyOut_NoUpdate')) {
                            metadata.main_frames_pending[ index ]._aborted = true;
                        }
                    }
                } else if (oneAndOnly(event.timestamp, child_events.filter(e => e.name.includes('EarlyOut')), 'EarlyOut though no BeginMainThreadFrame')) {
                    index = metadata.main_frames_pending.findIndex(f => f._id == event.args.begin_frame_id);
                    metadata.main_frames_pending[index]._defer = true;
                }

                // main_frames_matching = metadata.main_frames_pending.filter(f => f._sendRequestMainFrame && !f._beginMainFrame);
                // main
                // if (oneAndOnly(event.timestamp, main_frames_matching, 'Main Frames requested (BeginMainFrame)')) {
                //     if (main_frames_matching[0]._id !== event.args.begin_frame_id) {
                //         metadata.errors.push(new Warning(event.timestamp, 'BeginMainFrame and SendRequestMainFrame don\'t match'));
                //     } else {
                //         index = metadata.main_frames_pending.findIndex(f => f._sendRequestMainFrame && !f._beginMainFrame);
                //         metadata.main_frames_pending[index]._beginMainFrame = event.timestamp;

                //         child_events = childEvents(event, events);

                //         // let prepaints = child_events.filter(e => e.name == 'LocalFrameView::RunPrePaintLifecyclePhase');
                //         // if (oneAndOnly(event.timestamp, prepaints, 'PrePaint')) {
                //         //     metadata.main_frames_pending[index]._prePaint = prepaints[ 0 ].ts;
                //         // }

                //         let commits = child_events.filter(e => e.name == 'ProxyMain::BeginMainFrame::commit');
                //         let aborted = child_events.filter(e => e.name.includes('EarlyOut_NoUpdate'));

                //         if (commits.length == 0 && aborted.length == 0) {
                //             metadata.errors.push(new Warning(event.timestamp, 'Main Frame neither commited nor aborted'));
                //         } else if (commits.length > 0 && aborted.length > 0) {
                //             // console.log(aborted)
                //             metadata.errors.push(new Warning(event.timestamp, 'Main Frame both committed and aborted'));
                //         } else if (commits.length > 0 && oneAndOnly(event.timestamp, commits, 'BeginCommit')) {
                //             metadata.main_frames_pending[index]._beginMainFrameCommit = commits[ 0 ].ts;
                //         } else if (aborted.length > 0 && oneAndOnly(event.timestamp, aborted, 'EarlyOut')) {
                //             if (aborted[0].name == 'EarlyOut_NoUpdate') {
                //                 metadata.main_frames_pending[index]._aborted = true;
                //             } else if (aborted[0].name == 'EarlyOut_DeferCommit') {
                //                 metadata.main_frames_pending[ index ]._defered = true;
                //             }
                //         }
                //     }
                // }
                
                break;
            case 'LocalFrameView::RunPrePaintLifecyclePhase':
                // shouldBeInThread(event, 'CrRendererMain');
                //Processed in BeginMainFrame
                break;
            case 'ProxyMain::BeginMainFrame::commit':
                // shouldBeInThread(event, 'CrRendererMain');
                //Processed in BeginMainFrame
                break;
            case 'ProxyImpl::BeginMainFrameAbortedOnImplThread':
                shouldBeInThread(event, 'Compositor');
                if (beginningNoMainFrame) { break; }
                main_frames_matching = metadata.main_frames_pending.filter(f => f._beginMainFrame && f._aborted && !f._beginMainFrameCommit);
                if (main_frames_matching.length > 0) {
                    oneAndOnly(event.timestamp, main_frames_matching, 'Main Frame to abort')
                    index = metadata.main_frames_pending.findIndex(f => f._beginMainFrame && f._aborted && !f._beginMainFrameCommit);
                    metadata.main_frames_pending[index]._mainFrameAborted = event.timestamp;
                    metadata.main_frames_aborted.push(metadata.main_frames_pending.splice(index, 1)[0]);
                } else if (!metadata.main_frames_pending.some(f => f._defer && !f.beginMainFrame )) {
                    metadata.errors.push(new Warning(event.timestamp, "No main frame to abort"))
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
                // shouldBeInThread(event, 'Compositor');
                //Processed in NotifyReadyToCommit
                break;
            case 'ActivateLayerTree':
                // shouldBeInThread(event, 'Compositor');
                if (event.tid == metadata.threads['Compositor']) {
                    if (beginningNoMainFrame) { break; }
                    main_frames_matching = metadata.main_frames_pending.filter(f => f._id == event.args.frameId);
                    if (oneAndOnly(event.timestamp, main_frames_matching, 'Main Frame with same id (ActivateLayerTree)')) {
                        // oneAndOnly(event.timestamp, metadata.main_frames_pending.filter(f => f._beginCommit && !f._activateLayerTree), 'Main Frame to activate')
                        index = metadata.main_frames_pending.findIndex(f => f._id == event.args.frameId);
                        if (metadata.main_frames_pending[index]._activateLayerTree) {
                            metadata.errors.push(new Warning(event.timestamp, 'Main Frame already activated'));
                        }
                        metadata.main_frames_pending[ index ]._activateLayerTree = event.timestamp;
                    }
                } else if (event.tid == metadata.threads['CrBrowserMain']) {
                    //We don't really take the id for the browser main frame, so we have to guess
                    let browser_frames_matching = metadata.browser_frames_pending.filter(f => f._beginMainFrame && !f._activateLayerTree );
                    if (oneAndOnly(event.timestamp, browser_frames_matching, ' Browser Frame with same id pending activation')) {
                        index = metadata.browser_frames_pending.findIndex(f => f._beginMainFrame && !f._activateLayerTree );
                        metadata.browser_frames_pending[ index ]._activateLayerTree = event.timestamp;
                    }
                }
                break;
            
            default: break;
        }
    }

    return metadata;
}

exports = Object.assign(exports, { processEvents });