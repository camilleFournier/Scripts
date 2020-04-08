class Warning {
    constructor (timestamp, message) {
        this._timestamp = timestamp;
        this._msg = message + ' !';
        this._save = `${this._timestamp}: ${this._msg}`
    }
}

const Browser = 'CrBrowserMain';
const Compositor = 'Compositor';
const Renderer = 'CrRendererMain';
const VizCompositor = 'VizCompositorThread';
const GPU = 'CrGpuMain';


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
        this._last_put_offset = null;
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

    withBindId(id) {
        return this._bind_id == id;
    }

    withSequenceNumber(nb) {
        return this._sequence_number == nb;
    }

    withFrameId(id) {
        return this._mainFrameId == id;
    }

    withPutOffset(offset) {
        return this._last_put_offset == offset;
    }

    waitingReceiveBeginFrame() {
        return this._issueBeginFrame && !this._receiveBeginFrame && !this._receiveBeginFrameDiscard;
    }

    waitingScheduling() {
        return this._receiveBeginFrame && !this._receiveBeginFrameDiscard && !this._scheduled;
    }

    waitingBeginFrame() {
        return this._scheduled && !this._beginFrame;
    }

    waitingDrawing() {
        return this._scheduled && !this._generateRenderPass;
    }

    waitingGenerateCompositorFrame() {
        return this._generateRenderPass  && !this._generateCompositorFrame;
    }

    waitingCompositorFrameReception() {
        return this._generateCompositorFrame && !this._receiveCompositorFrame;
    }

    waitingAggregation() {
        return this._receiveCompositorFrame && !this._surfaceAggregation;
    }

    waitingSwap() {
        return this._surfaceAggregation && !this._swapBuffers;
    }

    //Only BrowserFrame
    waitingRequestMainFrame() {
        return this._beginFrame && !this._sendRequestMainFrame;
    }

    waitingBeginMainFrame() {
        return this._sendRequestMainFrame && !this._beginMainFrame;
    }

    waitingActivation() {
        return this._beginMainFrame && !this._activateLayerTree;
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

    withFrameId(id) {
        return this._id == id;
    }

    waitingBeginMainFrame() {
        return this._sendRequestMainFrame && !this._beginMainFrame;
    }

    waitingCommit() {
        return this._beginMainFrame && !this._beginMainFrameCommit && !this._aborted;
    }

    waitingCommitReceived() {
        return this._beginMainFrameCommit && !this._beginCommit && !this._aborted;
    }

    waitingAbort() {
        return this._beginMainFrame && this._aborted && !this._beginMainFrameCommit;
    }

    waitingActivation() {
        return this._beginCommit && !this._activateLayerTree;
    }

    waitingFirstDraw() {
        return this._activateLayerTree && !this._first_draw;
    }

    waitingAfterDefer() {
        return this._defer && !this._beginMainFrame;
    }
    
}

class FramesList {
    constructor (childEvents, addError, oneAndOnly) {
        this._pending = [];
        this._dropped = [];
        this._completed = [];
        this.childEvents = childEvents;
        this.addError = addError;
        this.oneAndOnly = oneAndOnly;
    }

    pendingWithBindId(bind_id) {
        return this._pending.filter( f => f.withBindId(bind_id));
    }

    createFrame(event) {
        const frame = new Frame(event.timestamp, event.bind_id);
        this._pending.push(frame);
    }

    setSequenceNumber(bind_id, sequence_number) {
        const index = this._pending.findIndex(f => f.withBindId(bind_id));
        this._pending[ index ]._sequence_number = sequence_number;
    }

    setMainFrameId(bind_id, main_id) {
        const index = this._pending.findIndex(f => f.withBindId(bind_id));
        this._pending[ index ]._mainFrameId = main_id;
    }

    addFrame(frame) {
        this._pending.push(frame);
    }

    removeFrame(bind_id) {
        const index = this._pending.findIndex(f => f.withBindId(bind_id));
        return this._pending.splice(index, 1);
    }

    dropFrame(event) {
        const index = this._pending.findIndex(f => f.withBindId(event.bind_id));
        if (index < 0) {
            this.addError('No Frame with same id', event);
            return;
        }
        this._dropped.push(this._pending.splice(index, 0));
    }

    receiveBeginFrame(event) {
        const index = this._pending.findIndex(f => f.withBindId(event.bind_id));
        if (index < 0) {
            this.addError('No Frame with same id', event);
            return;
        }
        if (!this._pending[ index ].waitingReceiveBeginFrame()) {
            this.addError(`Frame not waiting for receiveBeginFrame`, event);
        }
        this._pending[ index ]._receiveBeginFrame = event.timestamp;
    }

    receiveBeginFrameDiscard(event) {
        const index = this._pending.findIndex(f => f.withBindId(event.bind_id));
        if (index < 0) {
            this.addError('No Frame with same id', event);
            return;
        }
        if (!this._pending[ index ].waitingReceiveBeginFrame()) {
            this.addError(`Frame not waiting for receiveBeginFrame`, event);
        }
        this._pending[ index ]._receiveBeginFrameDiscard = event.timestamp;
        this._dropped.push(this._pending.splice(index, 1)[0]);
    }

    receiveCompositorFrame(event) {
        const index = this._pending.findIndex(f => f.withBindId(event.bind_id));
        if (!this._pending[ index ].waitingCompositorFrameReception()) {
            this.addError(`Frame not waiting ReceiveCompositorFrame`, event);
        }
        this._pending[ index ]._receiveCompositorFrame = event.timestamp;
    }

    beginFrameDropped(event) {
        const frames_matching = this._pending.filter(f => f.waitingScheduling());
        if (frames_matching.length) {
            //Remove the first one
            const index = this._pending.findIndex(f => f.waitingScheduling());
            this._pending[index]._dropped = event.timestamp;
            this._dropped.push(this._pending.splice(index, 1)[0]);

        } else {
            this.addError('No frame to drop', event);
        }
    }

    missedBeginFrameDropped(event) {
        const frames_matching = this._pending.filter(f => f.waitingBeginFrame());
        if (frames_matching.length) {
            //Remove the first one
            const index = this._pending.findIndex(f => f.waitingBeginFrame());
            this._pending[ index ]._dropped = event.timestamp;
            this._dropped.push(this._pending.splice(index, 1)[ 0 ]);

        } else {
            this.addError('No frame to drop', event);
        }
    }

    beginImplFrame(event) {
        const frames_matching = this._pending.filter(f => f.withSequenceNumber(event.args.args.sequence_number));
        if (frames_matching.length) {
            const index = this._pending.findIndex(f => f.withSequenceNumber(event.args.args.sequence_number));
            this._pending[ index ]._scheduled = event.timestamp;
            return true;
        }
        return false;
    }

    persistentBeginImplFrame(event) {
        const frames_matching = this._dropped.filter(f => f.withSequenceNumber(event.args.args.sequence_number));
        if (frames_matching.length) {
            const index = this._dropped.findIndex(f => f.withSequenceNumber(event.args.args.sequence_number));
            this._dropped[ index ]._scheduled = event.timestamp;
            this._pending.push(this._dropped.splice(index, 1)[0]);
            return true;
        }
        return false;
    }

    beginFrame(timestamp, sequence_number) {
        const frames_matching = this._pending.filter(f => f.withSequenceNumber(sequence_number));
        if (this.oneAndOnly(frames_matching, 'frame with same sequence number')) {
            const index = this._pending.findIndex(f => f.withSequenceNumber(sequence_number));
            this._pending[ index ]._beginFrame = timestamp;
        }
    }

    sendBeginMainFrame(event) {
        const frames_matching = this._pending.filter(f => f.waitingDrawing());
        if (this.oneAndOnly(frames_matching, 'frame pending SendBeginMainFrame')) {
            const index = this._pending.findIndex(f => f.waitingDrawing());
            this._pending[ index ]._sendRequestMainFrame = event.timestamp;
        }
    }

    beginMainFrame(event) {
        const frames_matching = this._pending.filter(f => f.waitingBeginMainFrame());
        if (this.oneAndOnly(frames_matching, 'frame pending BeginMainFrame')) {
            const index = this._pending.findIndex(f => f.waitingBeginMainFrame());
            this._pending[ index ]._beginMainFrame = event.timestamp;
            this._pending[index]._mainFrameId = event.args.data.frameId;
        }
    }

    activateLayerTree(event) {
        const index = this._pending.findIndex(f => f._mainFrameId == event.args.frameId);
        if (index < 0) {
            this.addError('No Frame with same frameId', event);
            return;
        }
        if (!this._pending[index].waitingActivation()) {
            this.addError('Browser Frame not waiting', event);
        }
        this._pending[index]._activateLayerTree = event.timestamp;
    }

    dropNoDrawing(event) {
        const index = this._pending.findIndex(f => f.waitingDrawing());
        this._pending[index].useless = event.timestamp;
        this._dropped.push(this._pending.splice(index, 1)[0]);
    }

    generateRenderPass(event) {
        const index = this._pending.findIndex(f => f.withBindId(event.bind_id));
        if (!this._pending[ index ].waitingDrawing()) {
            this.addError(`Frame not pending GenerateRenderPass`, event);
        }
        this._pending[ index ]._generateRenderPass = event.timestamp;
    }

    generateCompositorFrame(event) {
        const index = this._pending.findIndex(f => f.withBindId(event.bind_id));
        if (!this._pending[ index ].waitingGenerateCompositorFrame()) {
            this.addError(`Frame not pending GenerateCompositorFrame`, event);
        }
        this._pending[ index ]._generateCompositorFrame = event.timestamp;
    }

    submitCompositorFrame(event) {
        if (event) {
            const index = this._pending.findIndex(f => f.withBindId(event.bind_id));
            if (!this._pending[ index ].waitingCompositorFrameReception()) {
                this.addError(`Frame not pending SubmitCompositorFrame`, event);
            }
            this._pending[ index ]._submitCompositorFrame = event.timestamp;
        }
    }

    addMainFrame(mainFrame, bind_id) {
        const index = this._pending.findIndex(f => f.withBindId(bind_id));
        Object.assign(this._pending[ index ], mainFrame);
    }

    surfaceAggregation(event, put_offset) {
        let frames = this._pending.filter(f => f.withBindId(event.bind_id));
        if (frames.length) {
            this.oneAndOnly(frames, 'Pending frame with same id');
            if (!frames[0].waitingAggregation()) {
                this.addError('Frame was not pending SurfaceAggregation', event);
            }
            const index = this._pending.findIndex(f => f.withBindId(event.bind_id));
            this._pending[index]._surfaceAggregation = event.timestamp;
            this._pending[index]._last_put_offset = put_offset;
            return;
        }
        
        frames = this._completed.filter(f => f.withBindId(event.bind_id));
        if (frames.length) {
            this.oneAndOnly(frames, 'Completed frame with same id');
            const index = this._completed.findIndex(f => f.withBindId(event.bind_id));
            if (index < this._completed.length - 1) {
                this.addError(`Frames are going backwards, expected ${this._completed.length-1}, instead ${index}`, event);
            }
            this._completed[ index ]._last_put_offset = put_offset;
            return
        }
        if (!this._completed.length && (!this._pending.length || !this._pending.find(f => f.waitingAggregation()))) {
            const frame = new Frame(0, event.bind_id);
            frame._surfaceAggregation = event.timestamp;
            frame._last_put_offset = put_offset;
            this._pending.push(frame);
            return
        }
        this.addError(`Unknow bind_id ${event.bind_id}`, event);
    }

    swapBuffer(event, put_offset) {
        let frames = this._pending.filter(f => f.withPutOffset(put_offset));
        if (frames.length) {
            this.oneAndOnly(frames, 'Pending Frames with same put_offset');
            const index = this._pending.findIndex(f => f.withPutOffset(put_offset));
            this._pending[index]._swapBuffers = event.timestamp;
            this._pending[index]._frameCompleted = event.timestamp + event.dur;
            this._completed.push(this._pending.splice(index, 1)[0]);
            return;
        }
        frames = this._completed.filter(f => f.withPutOffset(put_offset));
        if (frames.length) {
            this.oneAndOnly(frames, 'Completed Frames with same put_offset');
            return;
        }
        if ( !this._completed.length && ( !this._pending.length || !this._pending.find(f => f.waitingSwap()) ) ) {
            const frame = new Frame(0, 0);
            frame._swap = event.timestamp;
            frame._frameCompleted = event.timestamp + event.dur;
            frame._last_put_offset = put_offset;
            this._completed.push(frame);
            return
        }
        this.addError('No Frames matching', event);
    }
}

class MainFramesList extends FramesList {
    constructor (...args) {
        super(...args);
    }

    createMainFrame(event) {
        if ( (this._pending.concat(this._completed)).find(f => f.withFrameId(event.args.begin_frame_id)) ) {
            this.addError('MainFrame id already exist', event);
            return
        }
        this._pending.push(new MainFrame(event.timestamp, event.args.begin_frame_id));
    }

    defer(event) {
        const index = this._pending.findIndex(f => f.withFrameId(event.args.begin_frame_id));
        if (index > -1) {
            this._pending[index]._defer = event.timestamp;
            return
        }
        this.addError('No Main Frames matching', event);
    }

    beginMainFrame(threadProxy, beginFrame) {
        if (this.oneAndOnly(this._pending.filter(f => f.withFrameId(beginFrame.args.data.frameId)), 'Main Frames with same id')) {
            const index = this._pending.findIndex(f => f.withFrameId(beginFrame.args.data.frameId));

            const child_events = this.childEvents();
            let commits = child_events.filter(e => e.name == 'ProxyMain::BeginMainFrame::commit');
            let aborted = child_events.filter(e => e.name == 'EarlyOut_NoUpdates');

            if (!commits.length && !aborted.length) {
                this.addError('Main Frame neither commited nor aborted', threadProxy);
            } else if (commits.length && aborted.length) {
                this.addError('Main Frame both committed and aborted', threadProxy);
            } else if (commits.length && this.oneAndOnly(commits, 'BeginCommit')) {
                this._pending[ index ]._beginMainFrameCommit = commits[ 0 ].timestamp;
            } else if (aborted.length && this.oneAndOnly(aborted, 'EarlyOut_NoUpdates')) {
                this._pending[ index ]._aborted = true;
            }
        }
    }

    abortFrame(event) {
        const frames = this._pending.filter(f => f.waitingAbort());
        if (frames.length) {
            this.oneAndOnly(frames, 'Main frames waiting', event)
            const index = this._pending.findIndex(f => f.waitingAbort());
            this._pending[index]._mainFrameAborted = event.timestamp;
            this._dropped.push(this._pending.splice(index, 1)[0]);
        } else if (!this._pending.filter( f => f._defer)){
            this.addError('No MainFrame to abort', event);
        }
    }

    commitFrame(event) {
        const child_events = this.childEvents(event);
        let updateDraw = child_events.filter(e => e.name == 'LayerTreeImpl::UpdateDrawProperties::CalculateDrawProperties');
        if (this.oneAndOnly(updateDraw, 'CalculateDrawProperties')) {
            const index = this._pending.findIndex(f => f.withFrameId(updateDraw[0].args.SourceFrameNumber));
            if (index < 0) {
                this.addError('No MainFrame with same id', event);
                return;
            }
            if (!this._pending[index].waitingCommitReceived()) {
                this.addError('MainFrame not waiting', event);
            }
            let beginCommit = child_events.filter(e => e.name == 'LayerTreeHostImpl::BeginCommit');
            if (this.oneAndOnly(beginCommit, 'BeginCommit')) {
                this._pending[index]._beginCommit = beginCommit[0].timestamp;
            }

        }
    }

    activateLayerTree(event) {
        const index = this._pending.findIndex(f => f.withFrameId(event.args.frameId));
        if (index < 0) {
            this.addError('No MainFrame with same id', event);
            return;
        }
        if (!this._pending[index].waitingActivation()) {
            this.addError('MainFrame not waiting', event);
        }
        this._pending[index]._activateLayerTree = event.timestamp;
    }
    mainFrameDrawn(event, id) {
        if (this._pending.find(f => f.withFrameId(id))) {
            const index = this._pending.findIndex(f => f.withFrameId(id));
            if (!this._pending[index].waitingFirstDraw()) {
                this.addError('Main frame not pending first draw', event)
            }
            this._pending[index]._first_draw = event.timestamp;
            this._completed.push(this._pending.splice(index,1)[0]);
            return this._completed[this._completed.length - 1];
        }

        if (this._completed.find(f => f.withFrameId(id))) {
            if (this._completed.findIndex(f => f.withFrameId(id)) < this._completed.length - 1) {
                this.addError('Not the last main frame redrawn', event);
            }
            return this._completed.find(f => f.withFrameId(id));
        }

        if (!this._completed.length && !this._pending.find(f => f.waitingFirstDraw() )) {
            this._completed.push(new MainFrame(0, id));
            this._completed[0]._first_draw = event.timestamp;
            return this._completed[0];
        }

        console.log(`SourceFrame unkown, last id : ${this._completed[ this._completed.length - 1 ]._id}, now : ${id}`)
        this.addError(`SourceFrame unkown, last id : ${this._completed[ this._completed.length - 1 ]._id}, now : ${id}`, event);
    }
}
class FrameModel {
    constructor() {

        this._events = [];
        this._minimumRecordTime =  0;
        this._errors =  [];
        this._frames = {};
        // this._main_frames_pending =  [];
        // this._main_frames_aborted =  [];
        // this._main_frames_drawn =  [];
        // this._frames_completed =  [];
        // this._frames_pending =  [];
        // this._frames_discarded =  [];
        // this._frames_dropped =  [];
        // this._frames_useless =  [];
        // this._browser_frames_pending =  [];
        // this._browser_frames_completed =  [];
        // this._browser_frames_dropped =  [];
        this._threads =  { };
        this._processes =  { }
    }

    childEvents(event = this._event) {
        return this._events.filter(e => (e.ts > event.ts && e.ts < event.ts + event.dur && e.tid == event.tid));
    }

    addError(message, event = this._event) {
        const name = event.name == 'Graphics.Pipeline' ? event.args.step : event.name; 
        const warning = new Warning(event.timestamp, `${message} (${name})`);
        console.log(warning._save);
        this._errors.push(warning);
    }

    oneAndOnly(list, name, event = this._event) {
        if (list.length == 0) {
            this.addError(`No ${name}`, event);
            return false;
        } else if (list.length > 1) {
            this.addError(`${list.length} ${name}`, event);
            // console.log(list);
            return false;
        }

        return true;
    }

    shouldBeInThread(thread) {
        if (this._event.tid != this._threads[ thread ]) {
            let name = this._event.name;
            if (this._event.name == 'Graphics.Pipeline') {
                name = event.args.step;
            }
            let current_thread;
            const keys = Object.keys(this._threads);
            for (let t in keys) {
                if (this._threads[ keys[ t ] ] == this._event.tid) {
                    current_thread = keys[ t ];
                }
            }
            this.addError(`${name} should be in ${thread}, not in ${current_thread}: ${this._event.tid}`);
        }
    }


    isIn(thread) {
        return this._event.tid == this._threads[ thread ];
    }


    initialize(events) {
        //reset model
        this._events = [];
        this._minimumRecordTime = 0;
        this._errors = [];
        this._frames[ Compositor ] = new FramesList(this.childEvents.bind(this), this.addError.bind(this), this.oneAndOnly.bind(this));
        this._frames[ Renderer ] = new MainFramesList(this.childEvents.bind(this), this.addError.bind(this), this.oneAndOnly.bind(this));
        this._frames[ Browser ] = new FramesList(this.childEvents.bind(this), this.addError.bind(this), this.oneAndOnly.bind(this));
        // this._main_frames_pending =  [];
        // this._main_frames_aborted =  [];
        // this._main_frames_drawn =  [];
        // this._frames_completed =  [];
        // this._frames_pending =  [];
        // this._frames_discarded =  [];
        // this._frames_dropped =  [];
        // this._frames_useless =  [];
        // this._browser_frames_pending =  [];
        // this._browser_frames_completed =  [];
        // this._browser_frames_dropped =  [];
        this._threads = {};
        this._processes = {};

        //find threads and processes
        const metadata_events = events.filter(e => e.name == 'thread_name');
        metadata_events.forEach(e => {
            switch (e.name) {
                case 'process_name':
                    this._processes[ e.args.name ] = e.pid;
                    break;
                case 'thread_name':
                    this._threads[ e.args.name ] = e.tid;
                    break;
                default: break;
            }
        });

        //event placed at 0ms on chrome://tracing though not always this one
        this._minimumRecordTime = events.find(e => e.ts > 0).ts;
        //sort events chronologically
        this._events = events.sort((a, b) => a.ts - b.ts);
        this._events.forEach(e => Object.assign(e, { timestamp: e.ts - this._minimumRecordTime }));

        //return index of first IssueBeginFrame ie start of pipeline
        return this._events.findIndex(e => e.name == 'Graphics.Pipeline' && e.args.step == 'IssueBeginFrame');
    }

    // processGraphicsPipelineEvent() {
    //     const beginningNoFrame = this._frames[Compositor]._completed.length == 0
    //         && this._frames[Compositor]._pending.length == 0
    //         && this._frames[Compositor]._dropped.length == 0;
    //     const beginningNoMainFrame = this._frames[Renderer]._pending.length == 0
    //         && this._frames[Renderer]._dropped.length == 0
    //         && this._frames[Renderer]._completed.length == 0

    //     let frames_matching;
    //     let index;
    //     let frame;
    //     let compositor_frames;
    //     switch (this._event.args.step) {
    //         case 'IssueBeginFrame':
    //             this.shouldBeInThread(VizCompositor);
    //             frame = new Frame(this._event.timestamp, this._event.bind_id);
    //             this._frames_pending.push(frame);
    //             break;
    //         case 'ReceiveBeginFrame':
    //             // shouldBeInThread('Compositor');
    //             frames_matching = this._frames_pending.filter(f => f.withBindId(this._event.bind_id));
    //             if (this.oneAndOnly(frames_matching, 'frames pending ReceiveBeginFrame')) {
    //                 index = this._frames_pending.findIndex(f => f.withBindId(this._event.bind_id));
    //                 this._frames_pending[ index ]._receiveBeginFrame = this._event.timestamp;
    //                 let scheduler = this.childEvents().filter(e => e.name == "Scheduler::BeginFrame");
    //                 if (this.oneAndOnly(scheduler, 'Scheduler::BeginFrame')) {
    //                     this._frames_pending[ index ]._sequence_number = scheduler[ 0 ].args.args.sequence_number;
    //                 }


    //                 if (this.isIn(Browser)) {
    //                     this._browser_frames_pending.push(this._frames_pending.splice(index, 1)[ 0 ]);
    //                 }
    //             }
    //             break;

    //         case 'ReceiveBeginFrameDiscard':
    //             frames_matching = this._frames_pending.filter(f => f.withBindId(this._event.bind_id));
    //             if (this.oneAndOnly(frames_matching, 'frames pending ReceiveBeginFrameDiscard')) {
    //                 index = this._frames_pending.findIndex(f => f.withBindId(this._event.bind_id));
    //                 if (this.isIn(Compositor)) {
    //                     index = this._frames_pending.findIndex(f => f.withBindId(this._event.bind_id));
    //                     this._frames_pending[ index ]._receiveBeginFrameDiscard = this._event.timestamp;
    //                     this._frames_discarded.push(this._frames_pending.splice(index, 1)[ 0 ]);
    //                 } else if (this.isIn(Browser)) {
    //                     this._frames_pending[ index ]._receiveBeginFrameDiscard = this._event.timestamp;
    //                     this._frames_pending[ index ]._shouldDrop = this._event.timestamp;
    //                     this._browser_frames_dropped.push(this._frames_pending.splice(index, 1)[ 0 ]);
    //                 } else {
    //                     //To know where it is
    //                     this.shouldBeInThread(Compositor);
    //                 }
    //             }

    //             break;
    //         case 'ReceiveCompositorFrame':
    //             this.shouldBeInThread(VizCompositor);
    //             if (beginningNoFrame) { break; }
    //             const compositor_frames = this._frames_pending.filter(f => f.withBindId(this._event.bind_id));
    //             let browser_frames = this._browser_frames_pending.filter(f => f.withBindId(this._event.bind_id));
    //             if (this.oneAndOnly(compositor_frames.concat(browser_frames), 'frames with same bind_id')) {
    //                 if (compositor_frames.length > 0) {
    //                     index = this._frames_pending.findIndex(f => f.withBindId(this._event.bind_id));
    //                     if (!this._frames_pending[ index ]._generateCompositorFrame) {
    //                         this.addError('Received Compositor frame that was not generated');
    //                     }
    //                     this._frames_pending[ index ]._receiveCompositorFrame = this._event.timestamp;
    //                 } else if (browser_frames.length > 0) {
    //                     index = this._browser_frames_pending.findIndex(f => f.withBindId(this._event.bind_id));
    //                     if (!this._browser_frames_pending[ index ]._generateCompositorFrame) {
    //                         this.addError('Received Compositor frame that was not generated in Browser'); 
    //                     }
    //                     this._browser_frames_pending[ index ]._receiveCompositorFrame = this._event.timestamp;
    //                 }
    //             }
    //             break;
    //     }
    // }

    handleReceiveBeginFrame() {
        const frames_matching = this._frames[ Compositor ].pendingWithBindId(this._event.bind_id);
        if (this.oneAndOnly(frames_matching, 'frames with same bind_id')) {
            this._frames[ Compositor ].receiveBeginFrame(this._event);
            let scheduler = this.childEvents().filter(e => e.name == "Scheduler::BeginFrame");
            if (this.oneAndOnly(scheduler, 'Scheduler::BeginFrame')) {
                this._frames[Compositor].setSequenceNumber(this._event.bind_id, scheduler[ 0 ].args.args.sequence_number);
            }
            if (this.isIn(Browser)) {
                this._frames[Browser].addFrame(this._frames[Compositor].removeFrame(this._event.bind_id))
            }
        }
    }

    handleReceiveBeginFrameDiscard(thread) {
        const frames_matching = this._frames[ Compositor ].pendingWithBindId(this._event.bind_id);
        if (this.oneAndOnly(frames_matching, 'frames with same bind_id')) {
            if (this.isIn(Browser)) {
                this._frames[Browser].addFrame(this._frames[Compositor].removeFrame(this._event.bind_id));
            }
            this._frames[thread].receiveBeginFrameDiscard(this._event);
        }
    }

    handleBeginImplFrame(thread) {
        if (!this._frames[ thread ].beginImplFrame(this._event) &&
            this._frames[thread].persistentBeginImplFrame(this._event)) {
            this.addError('Dropped frame actually scheduled');
        }
        const child_events = this.childEvents();
        const beginFrames = child_events.filter(e => e.name == 'BeginFrame');
        if (beginFrames.length) {
            this.oneAndOnly(beginFrames, 'BeginFrame')
            this._frames[thread].beginFrame(this._event.timestamp, this._event.args.args.sequence_number);
        }
    }

    handleOnBeginImplFrame(thread) {
        const draw_event = thread == Compositor ? 'ProxyImpl::ScheduledActionDraw' : 'SingleThreadProxy::DoComposite';
        const frames_matching = this._frames[thread]._pending.filter(f => f.waitingDrawing());
        if (this.oneAndOnly(frames_matching, 'frames pending scheduler fired')) {
            const child_events = this.childEvents();
            if (!child_events.filter(e => e.name == draw_event).length) {
                this._frames[thread].dropNoDrawing(this._event);
            }
        }

    }
    processEvents(events) {
        let start_index = this.initialize(events);

        let frames_matching;
        let main_frames_matching;
        let child_events;
        let index;
        let renderPass;

        for (let i = start_index; i < this._events.length; i++) {
            const beginningNoFrame = this._frames[Compositor]._completed.length == 0
                && this._frames[ Compositor ]._pending.length == 0
                && this._frames[ Compositor ]._dropped.length == 0;
            const beginningNoMainFrame = this._frames[ Renderer ]._pending.length == 0
                && this._frames[ Renderer ]._dropped.length == 0
                && this._frames[ Renderer ]._completed.length == 0

            this._event = this._events[i];
            switch(this._event.tid) {
                case this._threads[VizCompositor]:
                    switch(this._event.name) {
                        case 'Graphics.Pipeline':
                            switch (this._event.args.step) {
                                case 'IssueBeginFrame':
                                    this._frames[Compositor].createFrame(this._event);
                                    break;
                                case 'ReceiveCompositorFrame':
                                    if (beginningNoFrame) { break; }
                                    const compositor_frames = this._frames[Compositor].pendingWithBindId(this._event.bind_id);
                                    let browser_frames = this._frames[ Browser ].pendingWithBindId(this._event.bind_id);
                                    if (this.oneAndOnly(compositor_frames.concat(browser_frames), 'frames with same bind id')) {
                                        if (compositor_frames.length) {
                                            this._frames[ Compositor ].receiveCompositorFrame(this._event);
                                        } else if (browser_frames.length > 0) {
                                            this._frames[ Browser ].receiveCompositorFrame(this._event);
                                        }
                                    }
                                    break;
                            }
                            break;
                        case 'Display::DrawAndSwap':
                            child_events = this.childEvents();
                            //Extract put_offset which links frames to swap buffers
                            let gl_renderer = child_events.filter(e => e.name == 'GLRenderer::SwapBuffers');
                            if (this.oneAndOnly(gl_renderer, 'GLRenderer:SwapBuffers')) {
                                let grand_children = this.childEvents(gl_renderer[ 0 ]);
                                let buffer_flush = grand_children.filter(e => e.name == 'InProcessCommandBuffer::Flush');
                                if (this.oneAndOnly(buffer_flush, 'Buffer:Flush', gl_renderer[ 0 ])) {
                                    let surfaces = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SurfaceAggregation');
                                    surfaces.forEach(e => {
                                        switch(e.bind_id.length) {
                                            case 15:
                                                this._frames[Compositor].surfaceAggregation(e, buffer_flush[0].args.put_offset);
                                                break;
                                            case 11:
                                                this._frames[Browser].surfaceAggregation(e, buffer_flush[0].args.put_offset);
                                                break;
                                            default:
                                                this.addError(`Unknown bind_id with length ${e.bind_id.length}`);
                                                break;
                                        }
                                    });
                                }
                            }
                    }
                    break;
                case this._threads[Compositor]:
                    switch(this._event.name) {
                        case 'Graphics.Pipeline':
                            switch (this._event.args.step) {
                                case 'ReceiveBeginFrame':
                                    this.handleReceiveBeginFrame();
                                    break;

                                case 'ReceiveBeginFrameDiscard':
                                    this.handleReceiveBeginFrameDiscard(Compositor);
                                    break;
                            }
                            break;
                        case 'Scheduler::BeginFrameDropped':
                            if (beginningNoFrame) { break; }
                            this._frames[Compositor].beginFrameDropped(this._event);
                            break;
                        case 'Scheduler::BeginImplFrame':
                            this.handleBeginImplFrame(Compositor);
                            break;
                        case 'Scheduler::MissedBeginFrameDropped':
                            if (beginningNoFrame) { break; }
                            this._frames[Compositor].missedBeginFrameDropped(this._event);
                            break;
                        case 'Scheduler::OnBeginImplFrameDeadline':
                            this.handleOnBeginImplFrame(Compositor);
                            break;
                        case 'ProxyImpl::ScheduledActionDraw':
                            if (beginningNoFrame) { break; }
                            child_events = this.childEvents();
                            renderPass = child_events.find(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateRenderPass');
                            if (renderPass) {
                                this._frames[Compositor].generateRenderPass(renderPass);

                                let drawFrame = child_events.find(e => e.name == 'DrawFrame');
                                if (drawFrame) {
                                    this._frames[ Compositor ].generateCompositorFrame(child_events.find(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateCompositorFrame'));
                                    this._frames[ Compositor ].submitCompositorFrame(child_events.find(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SubmitCompositorFrame'));
                                } else {
                                    this.oneAndOnly(child_events.find(e => e.name.includes('EarlyOut')));
                                    this._frames[ Compositor ].dropFrame(renderPass);
                                    break;
                                }

                                let prepareToDraw = child_events.find(e => e.name == 'LayerTreeHostImpl::PrepareToDraw');
                                if (prepareToDraw) {
                                    this._frames[Compositor].setMainFrameId(renderPass.bind_id, prepareToDraw.args.SourceFrameNumber);
                                    const mainFrame = this._frames[ Renderer ].mainFrameDrawn(this._event, prepareToDraw.args.SourceFrameNumber);
                                    this._frames[ Compositor ].setMainFrameId(renderPass.bind_id, mainFrame);
                                }
                            }
                            break;

                        case 'ThreadProxy::ScheduledActionSendBeginMainFrame':
                            if (this.childEvents().find(e => e.name == 'RequestMainThreadFrame')) {
                                this._frames[Renderer].createMainFrame(this._event);
                            } else { this.addError('No RequestMainThreadFrame'); }
                            break;
                        case 'ProxyImpl::BeginMainFrameAbortedOnImplThread':
                            if (beginningNoMainFrame) { break; }
                            this._frames[Renderer].abortFrame(this._event);
                            break;
                        case 'ProxyImpl::ScheduledActionCommit':
                            if (beginningNoMainFrame) { break; }
                            this._frames[Renderer].commitFrame(this._event);
                            break;
                        case 'ActivateLayerTree':
                            if (beginningNoMainFrame) { break; }
                            this._frames[Renderer].activateLayerTree(this._event);
                            break;
                        
                    }
                    break;
                case this._threads[Renderer]:
                    switch (this._event.name) {
                        case 'ThreadProxy::BeginMainFrame':
                            if (beginningNoMainFrame) { break; }
                            child_events = this.childEvents();
                            let beginMain = child_events.filter(e => e.name == 'BeginMainThreadFrame');
                            if (beginMain.length) {
                                this.oneAndOnly(beginMain, 'BeginMainThreadFrame');
                                this._frames[Renderer].beginMainFrame(this._event, beginMain[0]);
                            } else if (this.oneAndOnly(child_events.filter(e => e.name.includes('EarlyOut')), 'EarlyOut though no BeginMainThreadFrame')) {
                                this._frames[Renderer].defer(event);
                            }
                            break;
                    }
                    break;
                case this._threads[Browser]:
                    switch (this._event.name) {
                        case 'Graphics.Pipeline':
                            switch (this._event.args.step) {
                                case 'ReceiveBeginFrame':
                                    this.handleReceiveBeginFrame();
                                    break;

                                case 'ReceiveBeginFrameDiscard':
                                    this.handleReceiveBeginFrameDiscard(Browser);
                                    break;
                            }
                            break;
                        case 'Scheduler::BeginFrameDropped':
                            if (beginningNoFrame) { break; }
                            this._frames[ Browser ].beginFrameDropped(this._event);
                            break;
                        case 'Scheduler::BeginImplFrame':
                            this.handleBeginImplFrame(Browser);
                            break;
                        case 'Scheduler::MissedBeginFrameDropped':
                            if (beginningNoFrame) { break; }
                            this._frames[ Browser ].missedBeginFrameDropped(this._event);
                            break;
                        case 'SingleThreadProxy::ScheduledActionSendBeginMainFrame':
                            this._frames[Browser].sendBeginMainFrame(this._event);
                            break;
                        case 'BeginMainThreadFrame':
                            this._frames[Browser].beginMainFrame(this._event);
                            break;
                        case 'Scheduler::OnBeginImplFrameDeadline':
                            this.handleOnBeginImplFrame(Browser);
                        case 'SingleThreadProxy::DoComposite':
                            child_events = this.childEvents();
                            renderPass = child_events.find(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateRenderPass');
                            this._frames[Browser].generateRenderPass(renderPass);
                            let generateCompositor = child_events.find(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateCompositorFrame');
                            if (generateCompositor) {
                                this._frames[Browser].generateCompositorFrame(generateCompositor[0]);
                                this.frames[ Browser ].submitCompositorFrame(child_events.find(e.name == 'Graphics.Pipeline' && e.args.step == 'SubmitCompositorFrame'));
                            } else {
                                this._frames[Browser].dropFrame(renderPass);
                            }
                            break;
                        case 'ActivateLayerTree':
                            this._frames[Browser].activateLayerTree(this._event);
                            break;

                    }
                    break;
                case this._threads[GPU]:
                    switch(this._event.name) {
                        case 'InProcessCommandBuffer::FlushOnGpuThread':
                            if (beginningNoFrame) { break; }
                            child_events = this.childEvents();
                            let swap = child_events.filter(e => e.name == 'NativeViewGLSurfaceEGL:RealSwapBuffers');
                            if (swap.length) {
                                this._frames[ Compositor ].swapBuffer(swap[ 0 ], this._event.args.put_offset);
                                this._frames[ Browser ].swapBuffer(swap[ 0 ], this._event.args.put_offset);
                            } else if (swap.length > 1) {
                                this.addError('Too many swapBuffers');
                            }

                            break;
                    }
                    break;
                default: break;                
            }
            // switch(this._event.name) {
                // case 'Graphics.Pipeline':
                //     this.processGraphicsPipelineEvent();
                //     break;
                // case 'Scheduler::BeginFrameDropped':
                //     if (beginningNoFrame) { break; }
                //     if (this.isInCompositor()) {
                //         frames_matching = this._frames_pending.filter(f => f.waitingScheduling());
                //         if (frames_matching.length > 0) {
                //             // Drop the oldest frame matching ie the first one
                //             index = this._frames_pending.findIndex(f => f.withBindId(frames_matching[ 0 ]._bind_id));
                //             this._frames_pending[ index ]._dropped = this._event.timestamp;
                //             this._frames_dropped.push(this._frames_pending.splice(index, 1)[ 0 ]);
                //         }
                //     } else if (this.isInBrowser()) {
                //         frames_matching = this._browser_frames_pending.filter(f => f.waitingScheduling());
                //         if (frames_matching.length > 0) {
                //             // Drop the oldest frame matching ie the first one
                //             index = this._browser_frames_pending.findIndex(f => f.withBindId(frames_matching[ 0 ]._bind_id));
                //             this._browser_frames_dropped.push(this._browser_frames_pending.splice(index, 1)[ 0 ]);
                //         }
                //     }
                //     break;
                // case 'Scheduler::BeginImplFrame':
                //     if (beginningNoFrame) { break; }
                //     child_events = this.childEvents();
                //     let beginFrames = child_events.filter(e => e.name == 'BeginFrame');
                //     if (this.isInCompositor()) {
                //         frames_matching = this._frames_pending.filter(f => f.withSequenceNumber(this._event.args.args.sequence_number));
                //         if (this.oneAndOnly(frames_matching, 'frames with same sequence number')) {
                //             index = this._frames_pending.findIndex(f => f.withSequenceNumber(this._event.args.args.sequence_number));
                //             this._frames_pending[ index ]._scheduled = this._event.timestamp;

                //             if (beginFrames.length > 0) {
                //                 this.oneAndOnly(beginFrames, 'BeginFrame under Scheduler::BeginImplFrame')
                //                 this._frames_pending[ index ]._beginFrame = beginFrames[ 0 ].timestamp;
                //             }

                //         } else if (this._frames_dropped.filter(f => f.withSequenceNumber(this._event.args.args.sequence_number)).length > 0) {
                //             this.addError('Dropped compositor frame actually scheduled');
                //             index = this._frames_dropped.findIndex(f => f.withSequenceNumber(this._event.args.args.sequence_number));
                //             this._frames_dropped[ index ]._scheduled = this._event.timestamp;

                //             if (beginFrames.length > 0) {
                //                 this.oneAndOnly(beginFrames, 'BeginFrame under Scheduler::BeginImplFrame on Browser')
                //                 this._frames_dropped[ index ]._beginFrame = beginFrames[ 0 ].timestamp;
                //             }

                //             this._frames_pending.push(this._frames_dropped.splice(index, 1)[ 0 ]);
                //         }

                //     } else if (this.isInBrowser()) {
                //         frames_matching = this._browser_frames_pending.filter(f => f.withSequenceNumber(this._event.args.args.sequence_number));
                //         if (frames_matching.length > 0) {
                //             this.oneAndOnly(frames_matching, 'browser frames with same sequence number')
                //             index = this._browser_frames_pending.findIndex(f => f.withSequenceNumber(this._event.args.args.sequence_number));
                //             this._browser_frames_pending[ index ]._scheduled = this._event.timestamp;

                //             if (beginFrames.length == 1) {
                //                 this._browser_frames_pending[ index ]._beginFrame = beginFrames[ 0 ].timestamp;
                //             }

                //         } else if (this._browser_frames_dropped.filter(f => f.withSequenceNumber(this._event.args.args.sequence_number)).length > 0) {
                //             this.addError('Dropped browser frame actually scheduled');
                //             index = this._browser_frames_dropped.findIndex(f => f.withSequenceNumber(this._event.args.args.sequence_number));
                //             this._browser_frames_dropped[ index ]._scheduled = this._event.timestamp;

                //             if (beginFrames.length == 1) {
                //                 this._browser_frames_dropped[ index ]._beginFrame = beginFrames[ 0 ].timestamp;
                //             }

                //             this._browser_frames_pending.push(this._browser_frames_dropped.splice(index, 1)[ 0 ]);
                //         } else {
                //             this.addError('Unknown boorwser frame being scheduled');
                //             break;
                //         }

                //     }
                //     break;

                // case 'Scheduler::MissedBeginFrameDropped':
                //     if (beginningNoFrame) { break; }
                //     if (this.isInCompositor()) {
                //             frames_matching = this._frames_pending.filter(f => f.waitingBeginFrame());
                //             if (frames_matching.length > 0) {
                //                 // Drop the oldest frame matching ie the first one
                //                 index = this._frames_pending.findIndex(f => f.withBindId(frames_matching[ 0 ]._bind_id));
                //                 this._frames_pending[ index ]._dropped = this._event.timestamp;
                //                 this._frames_dropped.push(this._frames_pending.splice(index, 1)[ 0 ]);
                //             }
                //     } else if (this.isInBrowser()) {
                //         frames_matching = this._browser_frames_pending.filter(f => f.waitingBeginFrame());
                //             if (frames_matching.length > 0) {
                //                 // Drop the oldest frame matching ie the first one
                //                 index = this._browser_frames_pending.findIndex(f => f.withBindId(frames_matching[ 0 ]._bind_id));
                //                 this._browser_frames_pending[ index ]._shouldDrop = this._event.timestamp;
                //                 this._browser_frames_dropped.push(this._browser_frames_pending.splice(index, 1)[ 0 ]);
                //             }
                //     }
                //     break;
                // case 'SingleThreadProxy::ScheduledActionSendBeginMainFrame':
                //     this.shouldBeInThread(Browser);
                //     frames_matching = this._browser_frames_pending.filter(f => f.waitingRequestMainFrame());
                //     if (this.oneAndOnly(frames_matching, 'BrowserFrame pending main frame request')) {
                //         index = this._browser_frames_pending.findIndex(f => f.waitingRequestMainFrame());
                //         this._browser_frames_pending[ index ]._sendRequestMainFrame = this._event.timestamp;
                //     }
                //     break;

                // case 'BeginMainThreadFrame':
                //     if (this.isInBrowser()) {
                //         frames_matching = this._browser_frames_pending.filter(f => f.waitingBeginMainFrame());
                //         if (this.oneAndOnly(frames_matching, 'BrowserFrame pending beginMainFrame')) {
                //             index = this._browser_frames_pending.findIndex(f => f.waitingBeginMainFrame());
                //             this._browser_frames_pending[ index ]._beginMainFrame = this._event.timestamp;
                //         } else {
                //             console.log(this._browser_frames_pending);
                //         }
                //     } else {
                //         this.shouldBeInThread(Renderer);
                //     }

                //     break;
                
                // case 'Scheduler::OnBeginImplFrameDeadline':
                //     if (this.isInCompositor()) {
                //         if (beginningNoFrame) { break; }
                //         frames_matching = this._frames_pending.filter(f => f.waitingDrawing());
                //         if (this.oneAndOnly(frames_matching, 'frames pending scheduler fired')) {
                //             child_events = this.childEvents();
                //             if (child_events.filter(e => e.name == 'ProxyImpl::ScheduledActionDraw').length == 0) {
                //                 index = this._frames_pending.findIndex(f => f.waitingDrawing());
                //                 this._frames_pending[ index ]._useless = this._event.timestamp;
                //                 this._frames_useless.push(this._frames_pending.splice(index, 1)[ 0 ]);
                //             }
                //         }
                //     } else if (this.isInBrowser()) {
                //         frames_matching = this._browser_frames_pending.filter(f => f.waitingDrawing());
                //         if (this.oneAndOnly(frames_matching, 'frames pending scheduler fired on Browser')) {
                //             child_events = this.childEvents();
                //             if (child_events.filter(e => e.name == 'SingleThreadProxy::DoComposite').length == 0) {
                //                 index = this._browser_frames_pending.findIndex(f => f.waitingDrawing());
                //                 this._browser_frames_pending[ index ]._useless = this._event.timestamp;
                //                 this._browser_frames_dropped.push(this._browser_frames_pending.splice(index, 1)[ 0 ]);
                //             }
                //         }
                //     }
                //     break;
                // case 'SingleThreadProxy::DoComposite':
                //     this.shouldBeInThread(Browser);
                //     child_events = this.childEvents();
                //     renderPass = child_events.find(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateRenderPass');
                //     if (this.oneAndOnly(this._browser_frames_pending.filter(f => f.withBindId(renderPass.bind_id)), 'frame with same id as GenerateRenderPass')) {
                //         index = this._browser_frames_pending.findIndex(f => f.withBindId(renderPass.bind_id));
                //         this._browser_frames_pending[ index ]._generateRenderPass = renderPass.timestamp;
                //         let generateCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateCompositorFrame');
                //         if (this.oneAndOnly(generateCompositor, 'GenerateCompositorFrame')) {
                //             this._browser_frames_pending[ index ]._generateCompositorFrame = generateCompositor[ 0 ].timestamp;
                //         } else if (generateCompositor.length == 0) {
                //             this._browser_frames_pending[ index ]._useless = true;
                //             this._browser_frames_dropped.push(this._browser_frames_pending.splice(index, 1)[ 0 ]);
                //             break;
                //         }

                //         let submitCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SubmitCompositorFrame');
                //         if (submitCompositor.length > 0) {
                //             this._browser_frames_pending[ index ]._submitCompositorFrame = submitCompositor[ 0 ].timestamp;
                //         }
                //     }
                //     break;
                // case 'ProxyImpl::ScheduledActionDraw':
                //     this.shouldBeInThread(Compositor);
                //     if (beginningNoFrame) { break; }
                //     child_events = this.childEvents();
                //     renderPass = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateRenderPass');
                //     if (this.oneAndOnly(renderPass, 'GenerateRenderPass')) {
                //         index = this._frames_pending.findIndex(f => f.withBindId(renderPass[ 0 ].bind_id));
                //         if (index < 0) {
                //             this.addError('No pending compositor frame with same bind_id');
                //             break;
                //         }
                //         this._frames_pending[ index ]._generateRenderPass = renderPass[ 0 ].timestamp;

                //         let drawFrames = child_events.filter(e => e.name == 'DrawFrame');
                //         if (drawFrames.length > 0) {
                //             this.oneAndOnly(drawFrames, 'DrawFrame')

                //             let generateCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateCompositorFrame');
                //             if (this.oneAndOnly(generateCompositor, 'GenerateCompositorFrame')) {
                //                 this._frames_pending[ index ]._generateCompositorFrame = generateCompositor[ 0 ].timestamp;
                //             } else if (generateCompositor.length == 0) {
                //                 this._frames_pending[ index ]._useless = true;
                //                 this._frames_dropped.push(this._browser_frames_pending.splice(index, 1)[ 0 ]);
                //                 break;
                //             }

                //             let submitCompositor = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SubmitCompositorFrame');
                //             if (submitCompositor.length == 1) {
                //                 this._frames_pending[ index ]._submitCompositorFrame = submitCompositor[ 0 ].timestamp;
                //             }
                //         }

                //         let prepareToDraw = child_events.filter(e => e.name == 'LayerTreeHostImpl::PrepareToDraw');
                //         if (this.oneAndOnly(prepareToDraw, 'PrepareToDraw')) {
                //             this._frames_pending[ index ]._mainFrameId = prepareToDraw[ 0 ].args.SourceFrameNumber;
                //             main_frames_matching = this._main_frames_pending.filter(f => f.withFrameId(prepareToDraw[ 0 ].args.SourceFrameNumber)).concat(
                //                 this._main_frames_drawn.filter(f => f.withFrameId(prepareToDraw[ 0 ].args.SourceFrameNumber)));

                //             if (main_frames_matching.length == 0 && this._main_frames_drawn.length == 0) {
                //                 let prev_main_frame = new MainFrame(0, prepareToDraw[ 0 ].args.SourceFrameNumber);
                //                 prev_main_frame._first_draw = true;
                //                 this._main_frames_drawn.push(prev_main_frame);
                //                 main_frames_matching = this._main_frames_drawn;
                //             }

                //             if (!beginningNoMainFrame && this.oneAndOnly(main_frames_matching, 'Main Frames with same id')) {
                //                 if (main_frames_matching[ 0 ]._first_draw) {
                //                     let main_index = this._main_frames_drawn.findIndex(f => f.withFrameId(prepareToDraw[ 0 ].args.SourceFrameNumber));
                //                     if (main_index < this._main_frames_drawn.length - 1) {
                //                         this.addError('Not the last main frame redrawn');
                //                     }
                //                     Object.assign(this._frames_pending[ index ], this._main_frames_drawn[ main_index ]);
                //                 } else {
                //                     let main_frames_waiting = this._main_frames_pending.filter(f => f.waitingFisrtDraw());
                //                     if (main_frames_waiting.length > 1) {
                //                         if (this._frames_pending[ index ]._mainFrameId > main_frames_waiting[ 0 ]._id && main_frames_waiting[ 0 ]._canBeSkipped) {
                //                             let cancelled_index = this._main_frames_pending.findIndex(f => f.withFrameId(main_frames_waiting[ 0 ]._id));
                //                             this._main_frames_aborted.push(this._main_frames_pending.splice(cancelled_index, 1)[ 0 ]);
                //                         } else {
                //                             this.oneAndOnly(main_frames_waiting, 'Main frames activated pending drawing');
                //                         }
                //                     }
                //                     let main_index = this._main_frames_pending.findIndex(f => f.withFrameId(prepareToDraw[ 0 ].args.SourceFrameNumber));

                //                     this._frames_pending[ index ]._isMainFrame = true;
                //                     this._main_frames_pending[ main_index ]._first_draw = this._event.timestamp;
                //                     Object.assign(this._frames_pending[ index ], this._main_frames_pending[ main_index ]);
                //                     this._main_frames_drawn.push(this._main_frames_pending.splice(main_index, 1)[ 0 ]);

                //                 }
                //             } else if (!beginningNoMainFrame && this._main_frames_drawn.length > 0) {
                //                 console.log(`${this._main_frames_drawn[ this._main_frames_drawn.length - 1 ]._id} : ${prepareToDraw[ 0 ].args.SourceFrameNumber}`)
                //                 this.addError('SourceFrame unknown');
                //             } else if (this.oneAndOnly(main_frames_matching, 'Main Frames with same id')) {
                //                 if (!main_frames_matching[ 0 ]._first_draw) {
                //                     let main_index = this._main_frames_pending.findIndex(f => f.withFrameId(prepareToDraw[ 0 ].args.SourceFrameNumber));
                //                     this._main_frames_pending[ main_index ]._canBeSkipped = true;
                //                 }
                //                 this._frames_useless.push(this._frames_pending.splice(index, 1)[ 0 ]);
                //             }
                //         }
                //     }
                //     break;

                // case 'Display::DrawAndSwap':
                //     this.shouldBeInThread(VizCompositor);
                //     child_events = this.childEvents();
                //     let surfaces = child_events.filter(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SurfaceAggregation');
                //     let frames_drawn = [];
                //     surfaces.forEach(e => {
                //         let new_compositor_frames = this._frames_pending.filter(f => f.withBindId(e.bind_id));
                //         let old_compositor_frames = this._frames_completed.filter(f => f.withBindId(e.bind_id));
                //         let new_browser_frames = this._browser_frames_pending.filter(f => f.withBindId(e.bind_id));
                //         let old_browser_frames = this._browser_frames_completed.filter(f => f.withBindId(e.bind_id));
                //         let frames = new_compositor_frames.concat(old_compositor_frames).concat(new_browser_frames).concat(old_browser_frames)
                //         if (frames.length > 0) {
                //             this.oneAndOnly(frames, 'frames with same bind id', e)
                //             if (new_compositor_frames.length > 0) {
                //                 index = this._frames_pending.findIndex(f => f.withBindId(e.bind_id));
                //                 if (!this._frames_pending[ index ].waitingAggregation()) {
                //                     this.addError('frame surface already aggregated', e);
                //                 } else {
                //                     this._frames_pending[ index ]._surfaceAggregation = e.timestamp;
                //                     frames_drawn.push({ id: e.bind_id, inBrowser: false });
                //                 }
                //             } else if (old_compositor_frames.length > 0) {
                //                 index = this._frames_completed.findIndex(f => f.withBindId(e.bind_id));
                //                 if (index < this._frames_completed.length - 1) {
                //                     this.addError('Compositor Frames are going back', e);
                //                 }
                //             } else if (new_browser_frames.length > 0) {
                //                 index = this._browser_frames_pending.findIndex(f => f.withBindId(e.bind_id));
                //                 if (!this._browser_frames_pending[ index ].waitingAggregation()) {
                //                     this.addError('pending browser frame surface was already aggregated', e); }
                //                 this._browser_frames_pending[ index ]._surfaceAggregation = e.timestamp;
                //                 frames_drawn.push({ id: e.bind_id, inBrowser: true });
                //             } else if (old_browser_frames.length > 0) {
                //                 index = this._browser_frames_completed.findIndex(f => f.withBindId(e.bind_id));
                //                 if (index < this._browser_frames_completed.length - 1) {
                //                     this.addError('Browser Frames are going back', e);
                //                 }

                //             }
                //             //If no known browser frame, add the bind id as a current browser frame to have the error only once
                //         } else if (this._browser_frames_completed.length == 0 && e.bind_id.length == 11) {
                //             this._browser_frames_completed.push(new Frame(0, e.bind_id));
                //         } else if (this._frames_completed.length == 0 && e.bind_id.length == 15) {
                //             this._frames_completed.push(new Frame(0, e.bind_id));
                //         } else {
                //             console.log(`Unknown bind_id: ${e.bind_id}`);
                //         }
                //     });

                //     let gl_renderer = child_events.filter(e => e.name == 'GLRenderer::SwapBuffers');
                //     if (this.oneAndOnly(gl_renderer, 'GLRenderer:SwapBuffers')) {
                //         let grand_children = this.childEvents(gl_renderer[ 0 ]);
                //         let buffer_flush = grand_children.filter(e => e.name == 'InProcessCommandBuffer::Flush');
                //         if (this.oneAndOnly(buffer_flush, 'Buffer:Flush', gl_renderer[ 0 ])) {
                //             frames_drawn.forEach(frame => {
                //                 if (frame.inBrowser) {
                //                     index = this._browser_frames_pending.findIndex(f => f.withBindId(frame.id));
                //                     this._browser_frames_pending[ index ]._put_offset = buffer_flush[ 0 ].args.put_offset;
                //                 } else {
                //                     index = this._frames_pending.findIndex(f => f.withBindId(frame.id));
                //                     this._frames_pending[ index ]._put_offset = buffer_flush[ 0 ].args.put_offset;
                //                 }
                //             });
                //         }
                //     }

                //     break;
                
                // case 'InProcessCommandBuffer::FlushOnGpuThread':
                //     this.shouldBeInThread(GPU);
                //     if (beginningNoFrame) { break; }
                //     child_events = this.childEvents();
                //     let swap = child_events.filter(e => e.name == 'NativeViewGLSurfaceEGL:RealSwapBuffers');
                //     if (swap.length == 1) {
                //         index = this._frames_pending.findIndex(f => f.withPutOffset(this._event.args.put_offset));
                //         if (index >= 0) {
                //             if (!this._frames_pending[ index ].waitingSwap()) {
                //                 this.addError('Frame with same put offset not aggregated');
                //             } else {
                //                 this._frames_pending[ index ]._swapBuffers = swap[ 0 ].timestamp;
                //                 this._frames_pending[ index ]._frameCompleted = swap[ 0 ].timestamp + swap[ 0 ].dur;
                //                 this._frames_completed.push(this._frames_pending.splice(index, 1)[ 0 ]);
                //             }
                //         }
                //         index = this._browser_frames_pending.findIndex(f => f.withPutOffset(this._event.args.put_offset));
                //         if (index >= 0) {
                //             this._browser_frames_pending[ index ]._swapBuffers = swap[ 0 ].timestamp;
                //             this._browser_frames_pending[ index ]._frameCompleted = swap[ 0 ].timestamp + swap[ 0 ].dur;
                //             this._browser_frames_completed.push(this._browser_frames_pending.splice(index, 1)[ 0 ]);
                //         }
                //     } else if (swap.length > 1) {
                //         this.addError('Too many swapBuffers');
                //     }

                //     break;

                // case 'ThreadProxy::ScheduledActionSendBeginMainFrame':
                //     this.shouldBeInThread(Compositor);
                //     if (this._main_frames_drawn.some(f => f.withFrameId(this._event.args.begin_frame_id))) {
                //         this.addError('Main Frame already drawn');
                //     }
                //     if (this._main_frames_pending.some(f => f.withFrameId(this._event.args.begin_frame_id))) {
                //         this.addError('Main Frame already requested');
                //     }
                //     this._main_frames_pending.push(new MainFrame(this._event.timestamp, this._event.args.begin_frame_id));
                //     //TODO : register a new main frame only with child event
                //     child_events = this.childEvents();
                //    this.oneAndOnly(child_events.filter(e => e.name == 'RequestMainThreadFrame'), 'RequestMainThreadFrame');


                //     break;
                // case 'ThreadProxy::BeginMainFrame':
                //     this.shouldBeInThread(Renderer);
                //     if (beginningNoMainFrame) { break; }
                //     child_events = this.childEvents();
                //     let beginMain = child_events.filter(e => e.name == 'BeginMainThreadFrame');
                //     if (beginMain.length > 0) {
                //         this.oneAndOnly(beginMain, 'BeginMainThreadFrame');
                //         main_frames_matching = this._main_frames_pending.filter(f => f.withFrameId(beginMain[ 0 ].args.data.frameId));
                //         if (this.oneAndOnly(main_frames_matching, 'Main Frames with same id pending beginFrame')) {
                //             index = this._main_frames_pending.findIndex(f => f._id == beginMain[ 0 ].args.data.frameId);
                //             this._main_frames_pending[ index ]._beginMainFrame = beginMain[ 0 ].timestamp;

                //             let commits = child_events.filter(e => e.name == 'ProxyMain::BeginMainFrame::commit');
                //             let aborted = child_events.filter(e => e.name.includes('EarlyOut_NoUpdate'));

                //             if (commits.length == 0 && aborted.length == 0) {
                //                 this.addError('Main Frame neither commited nor aborted');
                //             } else if (commits.length > 0 && aborted.length > 0) {
                //                 // console.log(aborted)
                //                 this.addError('Main Frame both committed and aborted');
                //             } else if (commits.length > 0 && this.oneAndOnly(commits, 'BeginCommit')) {
                //                 this._main_frames_pending[ index ]._beginMainFrameCommit = commits[ 0 ].ts;
                //             } else if (aborted.length > 0 && this.oneAndOnly(aborted, 'EarlyOut_NoUpdate')) {
                //                 this._main_frames_pending[ index ]._aborted = true;
                //             }
                //         }
                //     } else if (this.oneAndOnly(child_events.filter(e => e.name.includes('EarlyOut')), 'EarlyOut though no BeginMainThreadFrame')) {
                //         index = this._main_frames_pending.findIndex(f => f.withFrameId(this._event.args.begin_frame_id));
                //         this._main_frames_pending[ index ]._defer = true;
                //     }
                //     break;

                // case 'ProxyImpl::BeginMainFrameAbortedOnImplThread':
                //     this.shouldBeInThread(Compositor);
                //     if (beginningNoMainFrame) { break; }
                //     main_frames_matching = this._main_frames_pending.filter(f => f.waitingAbort());
                //     if (main_frames_matching.length > 0) {
                //         this.oneAndOnly(main_frames_matching, 'Main Frame to abort')
                //         index = this._main_frames_pending.findIndex(f => f.waitingAbort());
                //         this._main_frames_pending[ index ]._mainFrameAborted = this._event.timestamp;
                //         this._main_frames_aborted.push(this._main_frames_pending.splice(index, 1)[ 0 ]);
                //     } else if (!this._main_frames_pending.some(f => f.waitingAfterDefer())) {
                //         this.addError("No main frame to abort");
                //     }
                //     break;
                // case 'Scheduler::NotifyReadyToCommit':
                // case 'ProxyImpl::ScheduledActionCommit':
                //     this.shouldBeInThread(Compositor);
                //     if (beginningNoMainFrame) { break; }
                //     main_frames_matching = this._main_frames_pending.filter(f => f.waitingCommitReceived());
                //     if (this.oneAndOnly(main_frames_matching, 'Main Frame pending ScheduleActionCommit')) {
                //         index = this._main_frames_pending.findIndex(f => f.waitingCommitReceived());

                //         child_events = this.childEvents();

                //         let beginCommit = child_events.filter(e => e.name == 'LayerTreeHostImpl::BeginCommit');
                //         if (this.oneAndOnly(beginCommit, 'LayerTreeHostImpl::BeginCommit')) {
                //             this._main_frames_pending[ index ]._beginCommit = beginCommit[ 0 ].timestamp;
                //         }

                //         let updateDraw = child_events.filter(e => e.name == 'LayerTreeImpl::UpdateDrawProperties::CalculateDrawProperties');
                //         if (this.oneAndOnly(updateDraw, 'CalculateDrawProperties') && (updateDraw[ 0 ].args[ 'SourceFrameNumber' ] != this._main_frames_pending[ index ]._id)) {
                //             this.addError('Commit not for the pending main frame');
                //         }
                //     }
                //     break;
                
                // case 'ActivateLayerTree':
                //     // shouldBeInThread(event, 'Compositor');
                //     if (this.isInCompositor()) {
                //         if (beginningNoMainFrame) { break; }
                //         main_frames_matching = this._main_frames_pending.filter(f => f.withFrameId(this._event.args.frameId));
                //         if (this.oneAndOnly(main_frames_matching, 'Main Frame with same id')) {
                //             // oneAndOnly(event.timestamp, this._main_frames_pending.filter(f => f._beginCommit && !f._activateLayerTree), 'Main Frame to activate')
                //             index = this._main_frames_pending.findIndex(f => f.withFrameId(this._event.args.frameId));
                //             if (!this._main_frames_pending[ index ].waitingActivation()) {
                //                 this.addError('Main Frame already activated');
                //             }
                //             this._main_frames_pending[ index ]._activateLayerTree = this._event.timestamp;
                //         }
                //     } else if (this.isInBrowser()) {
                //         //We don't really take the id for the browser main frame, so we have to guess
                //         let browser_frames_matching = this._browser_frames_pending.filter(f => f.waitingActivation());
                //         if (this.oneAndOnly(browser_frames_matching, ' Browser Frame with same id pending activation')) {
                //             index = this._browser_frames_pending.findIndex(f => f.waitingActivation());
                //             this._browser_frames_pending[ index ]._activateLayerTree = this._event.timestamp;
                //         }
                //     }
                //     break;
                
            // }

        }

        return this;
    }
}

function processEvents(events) {
    let frameModel = new FrameModel();
    return frameModel.processEvents(events);
}

exports = Object.assign(exports, { processEvents });