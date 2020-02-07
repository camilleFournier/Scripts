import { TrackType, Phase, RecordTypes } from './resources-string.js';

export class NamedObject {
  /**
   * @param {!TracingModel} model
   * @param {number} id
   */
  constructor(model, id) {
    this._model = model;
    this._id = id;
    this._name = '';
    this._sortIndex = 0;
  }

  /**
   * @param {!Array.<!NamedObject>} array
   */
  static _sort(array) {
    /**
     * @param {!NamedObject} a
     * @param {!NamedObject} b
     */
    function comparator(a, b) {
      return a._sortIndex !== b._sortIndex ? a._sortIndex - b._sortIndex : a.name().localeCompare(b.name());
    }
    return Array.from(array).sort(comparator);
  }

  /**
   * @param {string} name
   */
  _setName(name) {
    this._name = name;
  }

  /**
   * @return {string}
   */
  name() {
    return this._name;
  }

  /**
   * @param {number} sortIndex
   */
  _setSortIndex(sortIndex) {
    this._sortIndex = sortIndex;
  }
}

export class Process extends NamedObject {
    /**
     * @param {!TracingModel} model
     * @param {number} id
     */ 
    constructor(model, id) {
      super(model, id);
      /** @type {!Map<number, !Thread>} */
      this._threads = new Map();
      this._threadByName = new Map();
    }
  
    /**
     * @return {number}
     */
    id() {
      return this._id;
    }
  
    /**
     * @param {number} id
     * @return {!Thread}
     */
    threadById(id) {
      let thread = this._threads.get(id);
      if (!thread) {
        thread = new Thread(this, id);
        this._threads.set(id, thread);
      }
      return thread;
    }
  
    /**
     * @param {string} name
     * @return {?Thread}
     */
    threadByName(name) {
      return this._threadByName.get(name) || null;
    }
  
    /**
     * @param {string} name
     * @param {!Thread} thread
     */
    _setThreadByName(name, thread) {
      this._threadByName.set(name, thread);
    }
  
    /**
     * @param {!SDK.TracingManager.EventPayload} payload
     * @return {?Event} event
     */
    _addEvent(payload) {
      return this.threadById(payload.tid)._addEvent(payload);
    }
  
    /**
     * @return {!Array.<!Thread>}
     */
    sortedThreads() {
      return NamedObject._sort(Array.from(this._threads.values()));
    }
  }

  export class Thread extends NamedObject {
    /**
     * @param {!Process} process
     * @param {number} id
     */
    constructor(process, id) {
      super(process._model, id);
      this._process = process;
      this._events = [];
      this._asyncEvents = [];
      this._lastTopLevelEvent = null;
    }
  
    tracingComplete(maximumRecordTime) {
      this._asyncEvents.sort(Event.compareStartTime);
      this._events.sort(Event.compareStartTime);
      const phases = Phase;
      const stack = [];
      for (let i = 0; i < this._events.length; ++i) {
        const e = this._events[i];
        e.ordinal = i;
        switch (e.phase) {
          case phases.End:
            this._events[i] = null;  // Mark for removal.
            // Quietly ignore unbalanced close events, they're legit (we could have missed start one).
            if (!stack.length) {
              continue;
            }
            const top = stack.pop();
            if (top.name !== e.name || top.categoriesString !== e.categoriesString) {
              console.error(
                  'B/E events mismatch at ' + top.startTime + ' (' + top.name + ') vs. ' + e.startTime + ' (' + e.name +
                  ')');
            } else {
              top._complete(e);
            }
            break;
          case phases.Begin:
            stack.push(e);
            break;
        }
      }
      while (stack.length) {
        stack.pop().setEndTime(maximumRecordTime);
      }
      //this._events.remove(null, false); raise an error
      this._events = this._events.filter(e => e);
    }
  
    /**
     * @param {!SDK.TracingManager.EventPayload} payload
     * @return {?Event} event
     */
    _addEvent(payload) {
        //There is no SnapshotObject
      const event = Event.fromPayload(payload, this);
      if (event.isTopLevel()) {
        // Discard nested "top-level" events.
        if (this._lastTopLevelEvent && this._lastTopLevelEvent.endTime > event.startTime) {
          return null;
        }
        this._lastTopLevelEvent = event;
      }
      this._events.push(event);
      return event;
    }
  
    /**
     * @param {!AsyncEvent} asyncEvent
     */
    _addAsyncEvent(asyncEvent) {
      this._asyncEvents.push(asyncEvent);
    }
  
    /**
     * @override
     * @param {string} name
     */
    _setName(name) {
      super._setName(name);
      this._process._setThreadByName(name, this);
    }
  
    /**
     * @return {number}
     */
    id() {
      return this._id;
    }
  
    /**
     * @return {!Process}
     */
    process() {
      return this._process;
    }
  
    /**
     * @return {!Array.<!Event>}
     */
    events() {
      return this._events;
    }
  
    /**
     * @return {!Array.<!AsyncEvent>}
     */
    asyncEvents() {
      return this._asyncEvents;
    }
  }

  export class Event {
    /**
     * @param {string|undefined} categories
     * @param {string} name
     * @param {!Phase} phase
     * @param {number} startTime
     * @param {!Thread} thread
     */
    constructor(categories, name, phase, startTime, thread) {
      /** @type {string} */
      this.categoriesString = categories || '';
      /** @type {!Set<string>} */
      this._parsedCategories = new Set(categories.split(','));
      /** @type {string} */
      this.name = name;
      /** @type {!Phase} */
      this.phase = phase;
      /** @type {number} */
      this.startTime = startTime;
      /** @type {!Thread} */
      this.thread = thread;
      /** @type {!Object} */
      this.args = {};
  
      /** @type {number} */
      this.selfTime = 0;
    }
  
    /**
     * @this {null}
     * @param {!SDK.TracingManager.EventPayload} payload
     * @param {!Thread} thread
     * @return {!Event}
     */
    static fromPayload(payload, thread) {
      const event = new Event(payload.cat, payload.name, /** @type {!Phase} */ (payload.ph), payload.ts / 1000, thread);
      if (payload.args) {
        event.addArgs(payload.args);
      }
      if (typeof payload.dur === 'number') {
        event.setEndTime((payload.ts + payload.dur) / 1000);
      }
      const id = payload.id;
      if (typeof id !== 'undefined') {
        event.id = id;
      }
      if (payload.bind_id) {
        event.bind_id = payload.bind_id;
      }
  
      return event;
    }

    isTopLevel() {
        return this.hasCategory('disabled-by-default-devtools.timeline') && this.name === 'RunTask' ||
            this.hasCategory('toplevel') ||
            this.hasCategory('disabled-by-default-devtools.timeline') &&
            this.name === 'Program';  // Older timelines may have this instead of toplevel.
    }
  
    /**
     * @param {!Event} a
     * @param {!Event} b
     * @return {number}
     */
    static compareStartTime(a, b) {
      return a.startTime - b.startTime;
    }
  
    /**
     * @param {!Event} a
     * @param {!Event} b
     * @return {number}
     */
    static orderedCompareStartTime(a, b) {
      // Array.mergeOrdered coalesces objects if comparator returns 0.
      // To change this behavior this comparator return -1 in the case events
      // startTime's are equal, so both events got placed into the result array.
      return a.startTime - b.startTime || a.ordinal - b.ordinal || -1;
    }
  
    /**
     * @param {string} categoryName
     * @return {boolean}
     */
    hasCategory(categoryName) {
      return this._parsedCategories.has(categoryName);
    }
  
    /**
     * @param {number} endTime
     */
    setEndTime(endTime) {
      if (endTime < this.startTime) {
        console.assert(false, 'Event out of order: ' + this.name);
        return;
      }
      this.endTime = endTime;
      this.duration = endTime - this.startTime;
    }
  
    /**
     * @param {!Object} args
     */
    addArgs(args) {
      // Shallow copy args to avoid modifying original payload which may be saved to file.
      for (const name in args) {
        if (name in this.args) {
          console.error('Same argument name (' + name + ') is used for begin and end phases of ' + this.name);
        }
        this.args[name] = args[name];
      }
    }
  
    /**
     * @param {!Event} endEvent
     */
    _complete(endEvent) {
      if (endEvent.args) {
        this.addArgs(endEvent.args);
      } else {
        console.error('Missing mandatory event argument \'args\' at ' + endEvent.startTime);
      }
      this.setEndTime(endEvent.startTime);
    }
  
  }

  export class AsyncEvent extends Event {
    /**
     * @param {!Event} startEvent
     */
    constructor(startEvent) {
      super(startEvent.categoriesString, startEvent.name, startEvent.phase, startEvent.startTime, startEvent.thread);
      this.addArgs(startEvent.args);
      this.steps = [startEvent];
    }
  
    /**
     * @param {!Event} event
     */
    _addStep(event) {
      this.steps.push(event);
      if (event.phase === Phase.AsyncEnd || event.phase === Phase.NestableAsyncEnd) {
        this.setEndTime(event.startTime);
        // FIXME: ideally, we shouldn't do this, but this makes the logic of converting
        // async console events to sync ones much simpler.
        this.steps[0].setEndTime(event.startTime);
      }
    }
  }

  export class Track {
    constructor() {
      this.name = '';
      this.type = TrackType.Other;
      // TODO(dgozman): replace forMainFrame with a list of frames, urls and time ranges.
      this.forMainFrame = false;
      this.url = '';
      // TODO(dgozman): do not distinguish between sync and async events.
      /** @type {!Array<!SDK.TracingModel.Event>} */
      this.events = [];
      /** @type {!Array<!SDK.TracingModel.AsyncEvent>} */
      this.asyncEvents = [];
      /** @type {!Array<!SDK.TracingModel.Event>} */
      this.tasks = [];
      this._syncEvents = null;
      /** @type {?SDK.TracingModel.Thread} */
      this.thread = null;
    }
  
    /**
     * @return {!Array<!SDK.TracingModel.Event>}
     */
    syncEvents() {
      if (this.events.length) {
        return this.events;
      }
  
      if (this._syncEvents) {
        return this._syncEvents;
      }
  
      const stack = [];
      this._syncEvents = [];
      for (const event of this.asyncEvents) {
        const startTime = event.startTime;
        const endTime = event.endTime;
        while (stack.length && startTime >= stack.peekLast().endTime) {
          stack.pop();
        }
        if (stack.length && endTime > stack.peekLast().endTime) {
          this._syncEvents = [];
          break;
        }
        const syncEvent = new Event(
            event.categoriesString, event.name, SDK.TracingModel.Phase.Complete, startTime, event.thread);
        syncEvent.setEndTime(endTime);
        syncEvent.addArgs(event.args);
        this._syncEvents.push(syncEvent);
        stack.push(syncEvent);
      }
      return this._syncEvents;
    }
  }

  export class ProfileEventsGroup {
    /**
     * @param {!Event} event
     */
    constructor(event) {
      /** @type {!Array<!Event>} */
      this.children = [event];
    }
  
    /**
     * @param {!Event} event
     */
    _addChild(event) {
      this.children.push(event);
    }
  }

  export class PageFrame {
    /**
     * @param {!Object} payload
     */
    constructor(payload) {
      this.frameId = payload['frame'];
      this.url = payload['url'] || '';
      this.name = payload['name'];
      /** @type {!Array<!PageFrame>} */
      this.children = [];
      /** @type {?PageFrame} */
      this.parent = null;
      /** @type {!Array<!{time: number, processId: number, processPseudoId: ?string, url: string}>} */
      this.processes = [];
      /** @type {?number} */
      this.deletedTime = null;
      // TODO(dgozman): figure this out.
      // this.ownerNode = target && payload['nodeId'] ? new SDK.DOMModel.DeferredDOMNode(target, payload['nodeId']) : null;
      this.ownerNode = null;
    }
  
    /**
     * @param {number} time
     * @param {!Object} payload
     */
    update(time, payload) {
      this.url = payload['url'] || '';
      this.name = payload['name'];
      if (payload['processId']) {
        this.processes.push(
            {time: time, processId: payload['processId'], processPseudoId: '', url: payload['url'] || ''});
      } else {
        this.processes.push(
            {time: time, processId: -1, processPseudoId: payload['processPseudoId'], url: payload['url'] || ''});
      }
    }
  
    /**
     * @param {string} processPseudoId
     * @param {number} processId
     */
    processReady(processPseudoId, processId) {
      for (const process of this.processes) {
        if (process.processPseudoId === processPseudoId) {
          process.processPseudoId = '';
          process.processId = processId;
        }
      }
    }
  
    /**
     * @param {!PageFrame} child
     */
    addChild(child) {
      this.children.push(child);
      child.parent = this;
    }
}

export class TimelineData {
    constructor() {
      /** @type {?string} */
      this.warning = null;
      /** @type {?Element} */
      this.previewElement = null;
      /** @type {?string} */
      this.url = null;
      /** @type {number} */
      this.backendNodeId = 0;
      /** @type {?Array<!Protocol.Runtime.CallFrame>} */
      this.stackTrace = null;
      /** @type {?SDK.TracingModel.ObjectSnapshot} */
      this.picture = null;
      /** @type {?SDK.TracingModel.Event} */
      this._initiator = null;
      this.frameId = '';
      /** @type {number|undefined} */
      this.timeWaitingForMainThread;
    }
  
    /**
     * @param {!SDK.TracingModel.Event} initiator
     */
    setInitiator(initiator) {
      this._initiator = initiator;
      if (!initiator || this.url) {
        return;
      }
      const initiatorURL = TimelineData.forEvent(initiator).url;
      if (initiatorURL) {
        this.url = initiatorURL;
      }
    }
  
    /**
     * @return {?SDK.TracingModel.Event}
     */
    initiator() {
      return this._initiator;
    }
  
    /**
     * @return {?Protocol.Runtime.CallFrame}
     */
    topFrame() {
      const stackTrace = this.stackTraceForSelfOrInitiator();
      return stackTrace && stackTrace[0] || null;
    }
  
    /**
     * @return {?Array<!Protocol.Runtime.CallFrame>}
     */
    stackTraceForSelfOrInitiator() {
      return this.stackTrace || (this._initiator && TimelineData.forEvent(this._initiator).stackTrace);
    }
  
    /**
     * @param {!SDK.TracingModel.Event} event
     * @return {!TimelineData}
     */
    static forEvent(event) {
      let data = event[TimelineData._symbol];
      if (!data) {
        data = new TimelineData();
        event[TimelineData._symbol] = data;
      }
      return data;
    }
}

export class TimelineAsyncEventTracker {
    constructor() {
      TimelineAsyncEventTracker._initialize();
      /** @type {!Map<!RecordTypes, !Map<string, !SDK.TracingModel.Event>>} */
      this._initiatorByType = new Map();
      for (const initiator of TimelineAsyncEventTracker._asyncEvents.keys()) {
        this._initiatorByType.set(initiator, new Map());
      }
    }
  
    static _initialize() {
      if (TimelineAsyncEventTracker._asyncEvents) {
        return;
      }
      const events = new Map();
      let type = RecordTypes;
  
      events.set(type.TimerInstall, {causes: [type.TimerFire], joinBy: 'timerId'});
      events.set(type.ResourceSendRequest, {
        causes: [type.ResourceMarkAsCached, type.ResourceReceiveResponse, type.ResourceReceivedData, type.ResourceFinish],
        joinBy: 'requestId'
      });
      events.set(type.RequestAnimationFrame, {causes: [type.FireAnimationFrame], joinBy: 'id'});
      events.set(type.RequestIdleCallback, {causes: [type.FireIdleCallback], joinBy: 'id'});
      events.set(type.WebSocketCreate, {
        causes: [type.WebSocketSendHandshakeRequest, type.WebSocketReceiveHandshakeResponse, type.WebSocketDestroy],
        joinBy: 'identifier'
      });
  
      TimelineAsyncEventTracker._asyncEvents = events;
      /** @type {!Map<!RecordTypes, !RecordTypes>} */
      TimelineAsyncEventTracker._typeToInitiator = new Map();
      for (const entry of events) {
        const types = entry[1].causes;
        for (type of types) {
          TimelineAsyncEventTracker._typeToInitiator.set(type, entry[0]);
        }
      }
    }
  
    /**
     * @param {!SDK.TracingModel.Event} event
     */
    processEvent(event) {
      let initiatorType = TimelineAsyncEventTracker._typeToInitiator.get(
          /** @type {!RecordTypes} */ (event.name));
      const isInitiator = !initiatorType;
      if (!initiatorType) {
        initiatorType = /** @type {!RecordTypes} */ (event.name);
      }
      const initiatorInfo = TimelineAsyncEventTracker._asyncEvents.get(initiatorType);
      if (!initiatorInfo) {
        return;
      }
      let data = event.args['data'] || event.args['beginData'];
      let idTemp = data && data[initiatorInfo.joinBy]
      const id = idTemp ? `${event.thread.process().id()}.${idTemp}` : '';
    //   const id = TimelineModelImpl.globalEventId(event, initiatorInfo.joinBy);
      if (!id) {
        return;
      }
      /** @type {!Map<string, !SDK.TracingModel.Event>|undefined} */
      const initiatorMap = this._initiatorByType.get(initiatorType);
      if (isInitiator) {
        initiatorMap.set(id, event);
        return;
      }
      const initiator = initiatorMap.get(id) || null;
      const timelineData = TimelineData.forEvent(event);
      timelineData.setInitiator(initiator);
      if (!timelineData.frameId && initiator) {
          data = initiator.args['data'] || initiator.args['beginData'];
          timelineData.frameId = data && data['frame'] || ''
        // timelineData.frameId = TimelineModelImpl.eventFrameId(initiator);
      }
    }
  }

export class TimelineRecordStyle {
    /**
     * @param {string} title
     * @param {!TimelineCategory} category
     * @param {boolean=} hidden
     */
    constructor(title, category) {
      this.title = title;
      this.category = category;
    }
}

export class TimelineFrame {
    /**
     * @param {number} startTime
     * @param {number} startTimeOffset
     */
    constructor(startTime, startTimeOffset) {
      this.startTime = startTime;
      this.startTimeOffset = startTimeOffset;
      this.endTime = this.startTime;
      this.duration = 0;
      this.timeByCategory = {};
      this.cpuTime = 0;
      this.idle = false;
      /** @type {?TracingFrameLayerTree} */
      this.layerTree = null;
      /** @type {!Array.<!LayerPaintEvent>} */
      this._paints = [];
      /** @type {number|undefined} */
      this._mainFrameId = undefined;
    }
  
    /**
     * @return {boolean}
     */
    hasWarnings() {
      return false;
    }
  
    /**
     * @param {number} endTime
     */
    _setEndTime(endTime) {
      this.endTime = endTime;
      this.duration = this.endTime - this.startTime;
    }
  
    /**
     * @param {?TracingFrameLayerTree} layerTree
     */
    _setLayerTree(layerTree) {
      this.layerTree = layerTree;
    }
  
    /**
     * @param {!Object} timeByCategory
     */
    _addTimeForCategories(timeByCategory) {
      for (const category in timeByCategory) {
        this._addTimeForCategory(category, timeByCategory[category]);
      }
    }
  
    /**
     * @param {string} category
     * @param {number} time
     */
    _addTimeForCategory(category, time) {
      this.timeByCategory[category] = (this.timeByCategory[category] || 0) + time;
      this.cpuTime += time;
    }
}

export class PendingFrame {
    /**
     * @param {number} triggerTime
     * @param {!Object.<string, number>} timeByCategory
     */
    constructor(triggerTime, timeByCategory) {
        /** @type {!Object.<string, number>} */
        this.timeByCategory = timeByCategory;
        /** @type {!Array.<!LayerPaintEvent>} */
        this.paints = [];
        /** @type {number|undefined} */
        this.mainFrameId = undefined;
        this.triggerTime = triggerTime;
    }
}  