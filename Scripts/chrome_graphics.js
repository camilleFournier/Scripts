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
        // Timestamps
        this._issueBeginFrame = start;
        this._receiveBeginFrame = null;
        this._scheduled = null;
        this._beginFrame = null;
        this._generateRenderPass = null;
        this._generateCompositorFrame = null;
        this._submitCompositorFrame = null;
        this._receiveCompositorFrame = null;
        this._surfaceAggregation = null;
        this._swapBuffers = null;
        this._frameCompleted = null;

        //Ids making solid links between events
        this._bind_id = id;
        this._sequence_number = null;
        this._mainFrameId = null;
        this._last_put_offset = null;

        //Drop timestamps
        this._receiveBeginFrameDiscard = null;
        this._dropped = null;
        this._useless = null;

        this._isMainFrame = false;

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
        if (index < 0) {
            this.addError('No Frame with same frameId');
            return;
        }
        this._pending[ index ]._mainFrameId = main_id;
    }

    addFrame(frame) {
        this._pending.push(frame);
    }

    removeFrame(bind_id) {
        const index = this._pending.findIndex(f => f.withBindId(bind_id));
        return this._pending.splice(index, 1)[0];
    }

    dropFrame(event) {
        const index = this._pending.findIndex(f => f.withBindId(event.bind_id));
        if (index < 0) {
            this.addError('No Frame with same id', event);
            return;
        }
        if (!this._pending[index].waitingGenerateCompositorFrame()) {
            this.addError('Frame not waiting GenerateCompositorFrame');
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
            if (!this._pending[index].waitingScheduling()) {
                this.addError('Frame not waiting');
            }
            this._pending[ index ]._scheduled = event.timestamp;
            return true;
        }
        return false;
    }

    persistentBeginImplFrame(event) {
        const frames_matching = this._dropped.filter(f => f.withSequenceNumber(event.args.args.sequence_number));
        if (frames_matching.length) {
            const index = this._dropped.findIndex(f => f.withSequenceNumber(event.args.args.sequence_number));
            if (!this._dropped[ index ].waitingScheduling()) {
                this.addError('Frame not waiting');
            }
            this._dropped[ index ]._scheduled = event.timestamp;
            this._pending.push(this._dropped.splice(index, 1)[0]);
            return true;
        }
        return false;
    }

    beginFrame(timestamp, sequence_number) {
        const frames_matching = this._pending.filter(f => f.withSequenceNumber(sequence_number));
        if (!frames_matching.length && !this._completed.length && (!this._pending.length || !this._pending.find(f => f.waitingBeginFrame()))) {
            //Can't add the frame as they would be no bind_id but not an error as beginning of frame was outside of trace
            return
        }

        if (this.oneAndOnly(frames_matching, 'frame with same sequence number')) {
            const index = this._pending.findIndex(f => f.withSequenceNumber(sequence_number));
            if (!this._pending[ index ].waitingBeginFrame()) {
                this.addError('Frame not waiting');
            }
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

    checkConsistency(bind_id, frameId) {
        const frame = this._pending.find(f => f.withBindId(bind_id));
        if (frame._mainFrameId != frameId) {
            this.addError('Brower frame from bind_id and SourceFrameNumber don\'t match');
        }
    }

    generateRenderPass(event) {
        const index = this._pending.findIndex(f => f.withBindId(event.bind_id));
        if (index < 0) {
            if (!this._completed.length && (!this._pending.length || !this._pending.find(f => f.waitingDrawing()))) {
                const frame = new Frame(0, event.bind_id);
                frame._generateRenderPass = event.timestamp;
                this._pending.push(frame);
                return
            }
            this.addError('No Frame with same bind_Id', event);
            return;
        }
        if (!this._pending[ index ].waitingDrawing()) {
            this.addError(`Frame not pending GenerateRenderPass`, event);
        }
        this._pending[ index ]._generateRenderPass = event.timestamp;
    }

    generateCompositorFrame(event) {
        const index = this._pending.findIndex(f => f.withBindId(event.bind_id));
        if (index < 0) {
            this.addError('No Frame with same bind_Id', event);
            return;
        }
        if (!this._pending[ index ].waitingGenerateCompositorFrame()) {
            this.addError(`Frame not pending GenerateCompositorFrame`, event);
        }
        this._pending[ index ]._generateCompositorFrame = event.timestamp;
    }

    submitCompositorFrame(event) {
        if (event) {
            const index = this._pending.findIndex(f => f.withBindId(event.bind_id));
            if (index < 0) {
                this.addError('No Frame with same bind_Id', event);
                return;
            }
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
                // console.log(frames);
                this.addError('Frame was not pending SurfaceAggregation', event);
                return;
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
            if (!this._pending[ index ].waitingSwap()) {
                this.addError('Frame not waiting');
            }
            this._pending[index]._swapBuffers = event.timestamp;
            this._pending[index]._frameCompleted = event.timestamp + event.dur;
            this._completed.push(this._pending.splice(index, 1)[0]);
            return;
        }
        frames = this._completed.filter(f => f.withPutOffset(put_offset));
        if (frames.length) {
            /* Same offset can be used several times so there might be several completed frames matching the offset.
               We just need to make sure the last completed one is the one also have the same put_offset.
            */
            const index = this._completed.findIndex(f => f.withBindId(frames[frames.length-1]._bind_id));
            if (index < this._completed.length - 1) {
                this.addError(`Last completed frame with same put_offset expected index : ${this._completed.length-1}, instead ${index}`);
            }
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
        //Start cases
        if (!this._pending.find(f => f.withFrameId(beginFrame.args.data.frameId))) {
            if (this._pending.length <= 1 && beginFrame.args.data.frameId == threadProxy.args.begin_frame_id - 1) {
                const frame = new MainFrame(0, beginFrame.args.data.frameId);
                frame._sendRequestMainFrame = true;
                this._pending.push(frame);
            }
        }
        if (this.oneAndOnly(this._pending.filter(f => f.withFrameId(beginFrame.args.data.frameId)), 'MainFrame with same id')) {
            const index = this._pending.findIndex(f => f.withFrameId(beginFrame.args.data.frameId));
            if (!this._pending[index].waitingBeginMainFrame()) {
                this.addError('MainFrame not waiting');
                return;
            }
            this._pending[index]._beginMainFrame = beginFrame.timestamp;

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
        if (!this._completed.length && !this._pending.find(f => f.waitingAbort() || f.waitingCommitReceived())) {
            return;
        }
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
                if (!this._completed.length && !this._pending.filter(f => f.waitingCommitReceived())) {
                    const frame = new MainFrame(0, updateDraw[ 0 ].args.SourceFrameNumber);
                    //will not count at the end so okay to put wrong timestamp
                    frame._beginCommit = event.timestamp;
                    this._pending.push(frame);
                    return;
                }
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
            if (!this._completed.length && !this._pending.find(f => f.waitingActivation())) {
                const frame = new MainFrame(0, event.args.frameId);
                frame._activateLayerTree = event.timestamp;
                this._pending.push(frame);
                return;
            }
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
        this._frames = {}
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

        //event placed at 0ms on chrome://tracing
        this._minimumRecordTime = events.find(e => e.ts > 0).ts;
        //sort events chronologically
        this._events = events.sort((a, b) => a.ts - b.ts);
        this._events.forEach(e => Object.assign(e, { timestamp: e.ts - this._minimumRecordTime }));

        //return index of first IssueBeginFrame ie start of pipeline
        return this._events.findIndex(e => e.name == 'Graphics.Pipeline' && e.args.step == 'IssueBeginFrame');
    }

    handleReceiveBeginFrame() {
        /* Start of the trace : the beginning of the pipeline was not recorded */
        if (!this._frames[ Compositor ]._completed.length && !this._frames[ Compositor ]._pending.length) {
            this._frames[ Compositor ]._pending.push(new Frame(0, this._event.bind_id));
        }
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
        /* Start of the trace : the beginning of the pipeline was not recorded */
        if (!this._frames[ Compositor ]._completed.length && !this._frames[ Compositor ]._pending.length) {
            this._frames[ Compositor ]._pending.push(new Frame(0, this._event.bind_id));
        }
        const frames_matching = this._frames[ Compositor ].pendingWithBindId(this._event.bind_id);
        if (this.oneAndOnly(frames_matching, 'frames with same bind_id')) {
            if (this.isIn(Browser)) {
                this._frames[Browser].addFrame(this._frames[Compositor].removeFrame(this._event.bind_id));
            }
            this._frames[thread].receiveBeginFrameDiscard(this._event);
        }
    }

    handleBeginImplFrame(thread) {
        if (!this._frames[ thread ]._completed.length && !this._frames[ thread ]._pending.find(f => f.waitingScheduling())) {
            /*We wouldn't be able to link the frame to a bind id, so we just drop the event and return*/
            return;
        }
        if (!this._frames[ thread ].beginImplFrame(this._event) &&
            this._frames[thread].persistentBeginImplFrame(this._event)) {
            // this.addError('Dropped frame actually scheduled');
        }
        const child_events = this.childEvents();
        const beginFrames = child_events.filter(e => e.name == 'BeginFrame');
        if (beginFrames.length) {
            this.oneAndOnly(beginFrames, 'BeginFrame')
            this._frames[thread].beginFrame(this._event.timestamp, this._event.args.args.sequence_number);
        }
    }

    handleOnBeginImplFrame(thread) {
        if (!this._frames[ thread ]._completed.length && !this._frames[ thread ]._pending.find(f => f.waitingDrawing())) {
            /*If a frame is drawn, it will be handled better inside the draw event.
                If it is not drawn, no need to add it */
            return;
        }
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
        let beginning = {};

        process_event:
        for (let i = start_index; i < this._events.length; i++) {
            beginning[Compositor] = !this._frames[Compositor]._completed.length;
            beginning[Renderer] = !this._frames[ Renderer ]._completed.length;
            beginning[Browser] = !this._frames[Browser]._completed.length;

            this._event = this._events[i];
            const end = !this._event.dur;
            switch(this._event.tid) {
                case this._threads[VizCompositor]:
                    switch(this._event.name) {
                        case 'Graphics.Pipeline':
                            if (end) { break process_event }
                            switch (this._event.args.step) {
                                case 'IssueBeginFrame':
                                    this._frames[Compositor].createFrame(this._event);
                                    break;
                                case 'ReceiveCompositorFrame':
                                /* Start of the trace handled here.
                                   Adds a new frame with just ReceiveCompositorFrame and an IssueBeginFrame of 0 */
                                    let thread;
                                    switch (this._event.bind_id.length) {
                                        case 15:
                                            thread = Compositor;
                                            break;
                                        case 11:
                                            thread = Browser;
                                            break;
                                    }
                                    if (beginning[thread] && !this._frames[thread]._pending.find(f => f.waitingCompositorFrameReception())) {
                                        const frame = new Frame(0, this._event.bind_id);
                                        frame._receiveCompositorFrame = this._event.timestamp;
                                        this._frames[thread]._pending.push(frame);
                                        break;
                                    }
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
                        /* Start of the trace handled in the thread in surfaceAggregation()
                          Adds a new frame with just SurfaceAggregation and an IssueBeginFrame of 0 */
                            if (end) { break process_event }
                            child_events = this.childEvents();
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
                        /* Start of the trace handled inside the function
                           Adds the frame as it is with an IssueBeginFrame of 0 */
                            if (end) { break process_event };
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
                        /*Start of the trace handled here.
                          No need to add the frame as it would be dropped anyway*/
                            if (beginning[ Compositor ] && !this._frames[ Compositor ]._pending.find(f => f.waitingScheduling())) { break; }
                            this._frames[Compositor].beginFrameDropped(this._event);
                            break;
                        case 'Scheduler::BeginImplFrame':
                        /* Start of the trace handled in the function.
                           Drops the event as we don't have a bind_id here*/
                            if (end) { break process_event };
                            this.handleBeginImplFrame(Compositor);
                            break;
                        case 'Scheduler::MissedBeginFrameDropped':
                        /*Start of the trace handled here.
                          No need to add the frame as it would be dropped anyway*/
                            if (beginning[ Compositor ] && !this._frames[Compositor]._pending.find(f => f.waitingDrawing())) { break; }
                            this._frames[Compositor].missedBeginFrameDropped(this._event);
                            break;
                        case 'Scheduler::OnBeginImplFrameDeadline':
                        /*Start of the trace handled in the draw event handled after.
                          Just returns immediatly if start of the trace.*/
                            if (end) { break process_event };
                            this.handleOnBeginImplFrame(Compositor);
                            break;
                        case 'ProxyImpl::ScheduledActionDraw':
                        /*Start of the trace handled in the thread in generateRenderPass()
                          Adds a frame with just a generateRenderPass, it is then handled just as every other frame */
                            if (end) { break process_event };
                            child_events = this.childEvents();
                            renderPass = child_events.find(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateRenderPass');
                            if (renderPass) {
                                this._frames[Compositor].generateRenderPass(renderPass);

                                let drawFrame = child_events.find(e => e.name == 'DrawFrame');
                                if (drawFrame) {
                                    this._frames[ Compositor ].generateCompositorFrame(child_events.find(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateCompositorFrame'));
                                    this._frames[ Compositor ].submitCompositorFrame(child_events.find(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SubmitCompositorFrame'));

                                    let prepareToDraw = child_events.find(e => e.name == 'LayerTreeHostImpl::PrepareToDraw');
                                    if (prepareToDraw) {
                                        this._frames[Compositor].setMainFrameId(renderPass.bind_id, prepareToDraw.args.SourceFrameNumber);
                                        const mainFrame = this._frames[ Renderer ].mainFrameDrawn(this._event, prepareToDraw.args.SourceFrameNumber);
                                        this._frames[ Compositor ].setMainFrameId(renderPass.bind_id, mainFrame);
                                    }
                                }
                            }
                            break;

                        case 'ThreadProxy::ScheduledActionSendBeginMainFrame':
                            if (end) { break process_event };
                            if (this.childEvents().find(e => e.name == 'RequestMainThreadFrame')) {
                                this._frames[Renderer].createMainFrame(this._event);
                            } else { this.addError('No RequestMainThreadFrame'); }
                            break;
                        case 'ProxyImpl::BeginMainFrameAbortedOnImplThread':
                        /*Start of the trace handled inside abortFrame().
                          No need to add the frame as it would be dropped anyway*/
                            if (end) { break process_event };
                            this._frames[Renderer].abortFrame(this._event);
                            break;
                        case 'ProxyImpl::ScheduledActionCommit':
                        /*Start of the trace handled inside commitFrame().
                          Adds the frame with _beginCommit and a sendRequestMainFrame at 0*/
                            if (end) { break process_event };
                            this._frames[Renderer].commitFrame(this._event);
                            break;
                        case 'ActivateLayerTree':
                            this._frames[Renderer].activateLayerTree(this._event);
                            break;
                        
                    }
                    break;
                case this._threads[Renderer]:
                    switch (this._event.name) {
                        case 'ThreadProxy::BeginMainFrame':
                        /*Several error cases possible at the beginning :
                            - No Request && ThreadProxy in sync with its children (ie same id) ==> handled here
                            - Request for ThreadProxy, but not its children's id ==> handled in Renderer's MainFramesList
                            - No Request && ThreadProxy not in sync with its children ==> handled here && in Renderer's MainFramesList
                          Adds the frame with the SourceFrameNumber ie Mainframe id
                        */
                            if (end) { break process_event };
                            if (beginning[Renderer] && !this._frames[Renderer]._pending.find(f => f.waitingBeginMainFrame())) {
                                let frame = new MainFrame(0, this._event.args.begin_frame_id);
                                //Wrong timestamp but doesn't matter, can filter it afterwards if necessary
                                //set _sendRequestMainFrame so that it is handled correctly afterwards by Renderer's MainFramesList
                                frame._sendRequestMainFrame = this._event.timestamp;
                                this._frames[ Renderer ]._pending.push(frame);
                            }
                            child_events = this.childEvents();
                            let beginMain = child_events.filter(e => e.name == 'BeginMainThreadFrame');
                            if (beginMain.length) {
                                this.oneAndOnly(beginMain, 'BeginMainThreadFrame');
                                this._frames[Renderer].beginMainFrame(this._event, beginMain[0]);
                            } else if (this.oneAndOnly(child_events.filter(e => e.name.includes('EarlyOut')), 'EarlyOut though no BeginMainThreadFrame')) {
                                this._frames[Renderer].defer(this._event);
                            }
                            break;
                    }
                    break;
                case this._threads[Browser]:
                    switch (this._event.name) {
                        case 'Graphics.Pipeline':
                        /* Start of the trace handled inside the function
                            Adds the frame as it is with an IssueBeginFrame of 0 */
                            if (end) { break process_event };
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
                        /*Start of the trace handled here.
                          No need to add the frame as it would be dropped anyway*/
                            if (beginning[ Browser ] && this._frames[ Browser ]._pending.find(f => f.waitingScheduling())) { break; }
                            this._frames[ Browser ].beginFrameDropped(this._event);
                            break;
                        case 'Scheduler::BeginImplFrame':
                        /* Start of the trace handled in the function.
                            Drops the event as we don't have a bind_id here*/
                            if (end) { break process_event };
                            this.handleBeginImplFrame(Browser);
                            break;
                        case 'Scheduler::MissedBeginFrameDropped':
                        /*Start of the trace handled here.
                          No need to add the frame as it would be dropped anyway*/
                            if (beginning[ Browser ] && this._frames[ Browser ]._pending.find(f => f.waitingDrawing())) { break; }
                            this._frames[ Browser ].missedBeginFrameDropped(this._event);
                            break;
                        case 'SingleThreadProxy::ScheduledActionSendBeginMainFrame':
                        /*Start of the trace handled here.
                          Drops the event as we don't have ay id for the frame*/
                            if (end) { break process_event };
                            if (beginning[Browser] && !this._frames[Browser]._pending.find(f => f.waitingDrawing())) { break; }
                            this._frames[Browser].sendBeginMainFrame(this._event);
                            break;
                        case 'BeginMainThreadFrame':
                        /*Start of the trace handled here.
                          Drops the event as we don't have a bind_id for the frame*/
                            if (beginning[ Browser ] && !this._frames[ Browser ]._pending.find(f => f.waitingBeginMainFrame())) { break; }
                            this._frames[Browser].beginMainFrame(this._event);
                            break;
                        case 'Scheduler::OnBeginImplFrameDeadline':
                        /*Start of the trace handled in the draw event handled after.
                          Just returns immediatly if start of the trace.*/
                            if (end) { break process_event };
                            this.handleOnBeginImplFrame(Browser);
                            break;
                        case 'SingleThreadProxy::DoComposite':
                        /*Start of the trace handled in the thread in generateRenderPass()
                          Adds a frame with just a generateRenderPass, it is then handled just as every other frame */
                            if (end) { break process_event };
                            child_events = this.childEvents();
                            renderPass = child_events.find(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateRenderPass');
                            this._frames[Browser].generateRenderPass(renderPass);
                            let generateCompositor = child_events.find(e => e.name == 'Graphics.Pipeline' && e.args.step == 'GenerateCompositorFrame');
                            if (generateCompositor) {
                                this._frames[Browser].generateCompositorFrame(generateCompositor);
                                this._frames[ Browser ].submitCompositorFrame(child_events.find(e => e.name == 'Graphics.Pipeline' && e.args.step == 'SubmitCompositorFrame'));
                            } else {
                                this._frames[Browser].dropFrame(renderPass);
                            }

                            let prepareToDraw = child_events.find(e => e.name == 'LayerTreeHostImpl::PrepareToDraw');
                            this._frames[Browser].checkConsistency(renderPass.bind_id, prepareToDraw.args.SourceFrameNumber);
                            break;
                        case 'ActivateLayerTree':
                        /*Start of the trace handled here.
                          Drops the event as we don't have a bind_id for the frame*/
                            if (beginning[Browser] && !this._frames[Browser]._pending.find(f => f.waitingActivation())) {
                                break;
                            }
                            this._frames[Browser].activateLayerTree(this._event);
                            break;

                    }
                    break;
                case this._threads[GPU]:
                    switch(this._event.name) {
                        case 'InProcessCommandBuffer::FlushOnGpuThread':
                        /*Start of the trace handled in the thread in swapBuffer()
                          Adds a frame already completed, though with just swapBuffer and frameCompleted*/
                            if (end) { break process_event };
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

        }

        return this;
    }
}

function processEvents(events) {
    let frameModel = new FrameModel();
    return frameModel.processEvents(events);
}

exports = Object.assign(exports, { processEvents });