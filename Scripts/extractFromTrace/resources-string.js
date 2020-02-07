import { TimelineRecordStyle, NamedObject } from './resources-class.js';

export const State = {
  Initial: Symbol('Initial'),
  LookingForEvents: Symbol('LookingForEvents'),
  ReadingEvents: Symbol('ReadingEvents'),
  SkippingTail: Symbol('SkippingTail'),
  LoadingCPUProfileFormat: Symbol('LoadingCPUProfileFormat')
};

/**
 * @enum {string}
 */
export const Phase = {
  Begin: 'B',
  End: 'E',
  Complete: 'X',
  Instant: 'I',
  AsyncBegin: 'S',
  AsyncStepInto: 'T',
  AsyncStepPast: 'p',
  AsyncEnd: 'F',
  NestableAsyncBegin: 'b',
  NestableAsyncEnd: 'e',
  NestableAsyncInstant: 'n',
  FlowBegin: 's',
  FlowStep: 't',
  FlowEnd: 'f',
  Metadata: 'M',
  Counter: 'C',
  Sample: 'P',
  CreateObject: 'N',
  SnapshotObject: 'O',
  DeleteObject: 'D'
};

export function isNestableAsyncPhase(phase) {
  return phase === 'b' || phase === 'e' || phase === 'n';
}

export function isAsyncPhase(phase) {
  return isNestableAsyncPhase(phase) || phase === 'S' || phase === 'T' || phase === 'F' || phase === 'p';
}

export function isMarkerEvent(event, timelineModel) {
    switch (event.name) {
      case RecordTypes.TimeStamp:
        return true;
      case RecordTypes.MarkFirstPaint:
      case RecordTypes.MarkFCP:
      case RecordTypes.MarkFMP:
        // TODO(alph): There are duplicate FMP events coming from the backend. Keep the one having 'data' property.
        return timelineModel.mainFrame && event.args.frame === timelineModel.mainFrame.frameId && !!event.args.data;
      case RecordTypes.MarkDOMContent:
      case RecordTypes.MarkLoad:
      case RecordTypes.MarkLCPCandidate:
      case RecordTypes.MarkLCPInvalidate:
        return !!event.args['data']['isMainFrame'];
      default:
        return false;
    }
}

export function sortedProcesses(tracingModel) {
    // return Array.from(tracingModel.processById.values()).sort((a, b) => {
    //     return a._sortIndex !== b._sortIndex ? a._sortIndex - b._sortIndex : a.name().localeCompare(b.name());
    // })
    return NamedObject._sort(Array.from(tracingModel.processById.values()));
  }

export function eventFrameId(event) {
    const data = event.args['data'] || event.args['beginData'];
    return data && data['frame'] || '';
}

export const MetadataEvent = {
  ProcessSortIndex: 'process_sort_index',
  ProcessName: 'process_name',
  ThreadSortIndex: 'thread_sort_index',
  ThreadName: 'thread_name'
};

export const DevToolsMetadataEventCategory = 'disabled-by-default-devtools.timeline';
export const DevToolsTimelineEventCategory = 'disabled-by-default-devtools.timeline';

export const TrackType = {
  MainThread: Symbol('MainThread'),
  Worker: Symbol('Worker'),
  Input: Symbol('Input'),
  Animation: Symbol('Animation'),
  Timings: Symbol('Timings'),
  Console: Symbol('Console'),
  Raster: Symbol('Raster'),
  GPU: Symbol('GPU'),
  Other: Symbol('Other'),
};

export const RecordTypes = {
  Task: 'RunTask',
  Program: 'Program',
  EventDispatch: 'EventDispatch',

  GPUTask: 'GPUTask',

  Animation: 'Animation',
  RequestMainThreadFrame: 'RequestMainThreadFrame',
  BeginFrame: 'BeginFrame',
  NeedsBeginFrameChanged: 'NeedsBeginFrameChanged',
  BeginMainThreadFrame: 'BeginMainThreadFrame',
  ActivateLayerTree: 'ActivateLayerTree',
  DrawFrame: 'DrawFrame',
  HitTest: 'HitTest',
  ScheduleStyleRecalculation: 'ScheduleStyleRecalculation',
  RecalculateStyles: 'RecalculateStyles',  // For backwards compatibility only, now replaced by UpdateLayoutTree.
  UpdateLayoutTree: 'UpdateLayoutTree',
  InvalidateLayout: 'InvalidateLayout',
  Layout: 'Layout',
  UpdateLayer: 'UpdateLayer',
  UpdateLayerTree: 'UpdateLayerTree',
  PaintSetup: 'PaintSetup',
  Paint: 'Paint',
  PaintImage: 'PaintImage',
  Rasterize: 'Rasterize',
  RasterTask: 'RasterTask',
  ScrollLayer: 'ScrollLayer',
  CompositeLayers: 'CompositeLayers',

  ScheduleStyleInvalidationTracking: 'ScheduleStyleInvalidationTracking',
  StyleRecalcInvalidationTracking: 'StyleRecalcInvalidationTracking',
  StyleInvalidatorInvalidationTracking: 'StyleInvalidatorInvalidationTracking',
  LayoutInvalidationTracking: 'LayoutInvalidationTracking',

  ParseHTML: 'ParseHTML',
  ParseAuthorStyleSheet: 'ParseAuthorStyleSheet',

  TimerInstall: 'TimerInstall',
  TimerRemove: 'TimerRemove',
  TimerFire: 'TimerFire',

  XHRReadyStateChange: 'XHRReadyStateChange',
  XHRLoad: 'XHRLoad',
  CompileScript: 'v8.compile',
  EvaluateScript: 'EvaluateScript',
  CompileModule: 'v8.compileModule',
  EvaluateModule: 'v8.evaluateModule',
  WasmStreamFromResponseCallback: 'v8.wasm.streamFromResponseCallback',
  WasmCompiledModule: 'v8.wasm.compiledModule',
  WasmCachedModule: 'v8.wasm.cachedModule',
  WasmModuleCacheHit: 'v8.wasm.moduleCacheHit',
  WasmModuleCacheInvalid: 'v8.wasm.moduleCacheInvalid',

  FrameStartedLoading: 'FrameStartedLoading',
  CommitLoad: 'CommitLoad',
  MarkLoad: 'MarkLoad',
  MarkDOMContent: 'MarkDOMContent',
  MarkFirstPaint: 'firstPaint',
  MarkFCP: 'firstContentfulPaint',
  MarkFMP: 'firstMeaningfulPaint',
  MarkLCPCandidate: 'largestContentfulPaint::Candidate',
  MarkLCPInvalidate: 'largestContentfulPaint::Invalidate',

  TimeStamp: 'TimeStamp',
  ConsoleTime: 'ConsoleTime',
  UserTiming: 'UserTiming',

  ResourceWillSendRequest: 'ResourceWillSendRequest',
  ResourceSendRequest: 'ResourceSendRequest',
  ResourceReceiveResponse: 'ResourceReceiveResponse',
  ResourceReceivedData: 'ResourceReceivedData',
  ResourceFinish: 'ResourceFinish',
  ResourceMarkAsCached: 'ResourceMarkAsCached',

  RunMicrotasks: 'RunMicrotasks',
  FunctionCall: 'FunctionCall',
  GCEvent: 'GCEvent',  // For backwards compatibility only, now replaced by MinorGC/MajorGC.
  MajorGC: 'MajorGC',
  MinorGC: 'MinorGC',
  JSFrame: 'JSFrame',
  JSSample: 'JSSample',
  // V8Sample events are coming from tracing and contain raw stacks with function addresses.
  // After being processed with help of JitCodeAdded and JitCodeMoved events they
  // get translated into function infos and stored as stacks in JSSample events.
  V8Sample: 'V8Sample',
  JitCodeAdded: 'JitCodeAdded',
  JitCodeMoved: 'JitCodeMoved',
  StreamingCompileScript: 'v8.parseOnBackground',
  StreamingCompileScriptWaiting: 'v8.parseOnBackgroundWaiting',
  StreamingCompileScriptParsing: 'v8.parseOnBackgroundParsing',
  V8Execute: 'V8.Execute',

  UpdateCounters: 'UpdateCounters',

  RequestAnimationFrame: 'RequestAnimationFrame',
  CancelAnimationFrame: 'CancelAnimationFrame',
  FireAnimationFrame: 'FireAnimationFrame',

  RequestIdleCallback: 'RequestIdleCallback',
  CancelIdleCallback: 'CancelIdleCallback',
  FireIdleCallback: 'FireIdleCallback',

  WebSocketCreate: 'WebSocketCreate',
  WebSocketSendHandshakeRequest: 'WebSocketSendHandshakeRequest',
  WebSocketReceiveHandshakeResponse: 'WebSocketReceiveHandshakeResponse',
  WebSocketDestroy: 'WebSocketDestroy',

  EmbedderCallback: 'EmbedderCallback',

  SetLayerTreeId: 'SetLayerTreeId',
  TracingStartedInPage: 'TracingStartedInPage',
  TracingSessionIdForWorker: 'TracingSessionIdForWorker',

  DecodeImage: 'Decode Image',
  ResizeImage: 'Resize Image',
  DrawLazyPixelRef: 'Draw LazyPixelRef',
  DecodeLazyPixelRef: 'Decode LazyPixelRef',

  LazyPixelRef: 'LazyPixelRef',
  LayerTreeHostImplSnapshot: 'cc::LayerTreeHostImpl',
  PictureSnapshot: 'cc::Picture',
  DisplayItemListSnapshot: 'cc::DisplayItemList',
  LatencyInfo: 'LatencyInfo',
  LatencyInfoFlow: 'LatencyInfo.Flow',
  InputLatencyMouseMove: 'InputLatency::MouseMove',
  InputLatencyMouseWheel: 'InputLatency::MouseWheel',
  ImplSideFling: 'InputHandlerProxy::HandleGestureFling::started',
  GCCollectGarbage: 'BlinkGC.AtomicPhase',

  CryptoDoEncrypt: 'DoEncrypt',
  CryptoDoEncryptReply: 'DoEncryptReply',
  CryptoDoDecrypt: 'DoDecrypt',
  CryptoDoDecryptReply: 'DoDecryptReply',
  CryptoDoDigest: 'DoDigest',
  CryptoDoDigestReply: 'DoDigestReply',
  CryptoDoSign: 'DoSign',
  CryptoDoSignReply: 'DoSignReply',
  CryptoDoVerify: 'DoVerify',
  CryptoDoVerifyReply: 'DoVerifyReply',

  // CpuProfile is a virtual event created on frontend to support
  // serialization of CPU Profiles within tracing timeline data.
  CpuProfile: 'CpuProfile',
  Profile: 'Profile',

  AsyncTask: 'AsyncTask',
};

export const mainFrameMarkers = [
    RecordTypes.ScheduleStyleRecalculation,
    RecordTypes.InvalidateLayout,
    RecordTypes.BeginMainThreadFrame,
    RecordTypes.ScrollLayer
];

const eventStyles = {};
    eventStyles[RecordTypes.Task] = new TimelineRecordStyle(`Task`, 'other');
    eventStyles[RecordTypes.Program] = new TimelineRecordStyle(`Other`, 'other');
    eventStyles[RecordTypes.Animation] = new TimelineRecordStyle(`Animation`, 'rendering');
    eventStyles[RecordTypes.EventDispatch] = new TimelineRecordStyle(`Event`, 'scripting');
    eventStyles[RecordTypes.RequestMainThreadFrame] = new TimelineRecordStyle(`Request Main Thread Frame`, 'rendering');
    eventStyles[RecordTypes.BeginFrame] = new TimelineRecordStyle(`Frame Start`, 'rendering');
    eventStyles[RecordTypes.BeginMainThreadFrame] = new TimelineRecordStyle(`Frame Start (main thread)`, 'rendering');
    eventStyles[RecordTypes.DrawFrame] = new TimelineRecordStyle(`Draw Frame`, 'rendering');
    eventStyles[RecordTypes.HitTest] = new TimelineRecordStyle(`Hit Test`, 'rendering');
    eventStyles[RecordTypes.ScheduleStyleRecalculation] = new TimelineRecordStyle(`Schedule Style Recalculation`, 'rendering');
    eventStyles[RecordTypes.RecalculateStyles] = new TimelineRecordStyle(`Recalculate Style`, 'rendering');
    eventStyles[RecordTypes.UpdateLayoutTree] = new TimelineRecordStyle(`Recalculate Style`, 'rendering');
    eventStyles[RecordTypes.InvalidateLayout] = new TimelineRecordStyle(`Invalidate Layout`, 'rendering');
    eventStyles[RecordTypes.Layout] = new TimelineRecordStyle(`Layout`, 'rendering');
    eventStyles[RecordTypes.PaintSetup] = new TimelineRecordStyle(`Paint Setup`, 'painting');
    eventStyles[RecordTypes.PaintImage] = new TimelineRecordStyle(`Paint Image`, 'painting');
    eventStyles[RecordTypes.UpdateLayer] = new TimelineRecordStyle(`Update Layer`, 'painting');
    eventStyles[RecordTypes.UpdateLayerTree] = new TimelineRecordStyle(`Update Layer Tree`, 'rendering');
    eventStyles[RecordTypes.Paint] = new TimelineRecordStyle(`Paint`, 'painting');
    eventStyles[RecordTypes.RasterTask] = new TimelineRecordStyle(`Rasterize Paint`, 'painting');
    eventStyles[RecordTypes.ScrollLayer] = new TimelineRecordStyle(`Scroll`, 'rendering');
    eventStyles[RecordTypes.CompositeLayers] = new TimelineRecordStyle(`Composite Layers`, 'painting');
    eventStyles[RecordTypes.ParseHTML] = new TimelineRecordStyle(`Parse HTML`, 'loading');
    eventStyles[RecordTypes.ParseAuthorStyleSheet] = new TimelineRecordStyle(`Parse Stylesheet`, 'loading');
    eventStyles[RecordTypes.TimerInstall] = new TimelineRecordStyle(`Install Timer`, 'scripting');
    eventStyles[RecordTypes.TimerRemove] = new TimelineRecordStyle(`Remove Timer`, 'scripting');
    eventStyles[RecordTypes.TimerFire] = new TimelineRecordStyle(`Timer Fired`, 'scripting');
    eventStyles[RecordTypes.XHRReadyStateChange] = new TimelineRecordStyle(`XHR Ready State Change`, 'scripting');
    eventStyles[RecordTypes.XHRLoad] = new TimelineRecordStyle(`XHR Load`, 'scripting');
    eventStyles[RecordTypes.CompileScript] = new TimelineRecordStyle(`Compile Script`, 'scripting');
    eventStyles[RecordTypes.EvaluateScript] = new TimelineRecordStyle(`Evaluate Script`, 'scripting');
    eventStyles[RecordTypes.CompileModule] = new TimelineRecordStyle(`Compile Module`, 'scripting');
    eventStyles[RecordTypes.EvaluateModule] = new TimelineRecordStyle(`Evaluate Module`, 'scripting');
    eventStyles[RecordTypes.StreamingCompileScript] = new TimelineRecordStyle(`Streaming Compile Task`, 'other');
    eventStyles[RecordTypes.StreamingCompileScriptWaiting] = new TimelineRecordStyle(`Waiting for Network`, 'idle');
    eventStyles[RecordTypes.StreamingCompileScriptParsing] = new TimelineRecordStyle(`Parse and Compile`, 'scripting');
    eventStyles[RecordTypes.WasmStreamFromResponseCallback] = new TimelineRecordStyle(`Streaming Wasm Response`, 'scripting');
    eventStyles[RecordTypes.WasmCompiledModule] = new TimelineRecordStyle(`Compiled Wasm Module`, 'scripting');
    eventStyles[RecordTypes.WasmCachedModule] = new TimelineRecordStyle(`Cached Wasm Module`, 'scripting');
    eventStyles[RecordTypes.WasmModuleCacheHit] = new TimelineRecordStyle(`Wasm Module Cache Hit`, 'scripting');
    eventStyles[RecordTypes.WasmModuleCacheInvalid] = new TimelineRecordStyle(`Wasm Module Cache Invalid`, 'scripting');
    eventStyles[RecordTypes.FrameStartedLoading] = new TimelineRecordStyle(`Frame Started Loading`, 'loading');
    eventStyles[RecordTypes.MarkLoad] = new TimelineRecordStyle(`Onload Event`, 'scripting');
    eventStyles[RecordTypes.MarkDOMContent] = new TimelineRecordStyle(`DOMContentLoaded Event`, 'scripting');
    eventStyles[RecordTypes.MarkFirstPaint] = new TimelineRecordStyle(`First Paint`, 'painting');
    eventStyles[RecordTypes.MarkFCP] = new TimelineRecordStyle(`First Contentful Paint`, 'rendering');
    eventStyles[RecordTypes.MarkFMP] = new TimelineRecordStyle(`First Meaningful Paint`, 'rendering');
    eventStyles[RecordTypes.MarkLCPCandidate] = new TimelineRecordStyle(`Largest Contentful Paint`, 'rendering');
    eventStyles[RecordTypes.TimeStamp] = new TimelineRecordStyle(`Timestamp`, 'scripting');
    eventStyles[RecordTypes.ConsoleTime] = new TimelineRecordStyle(`Console Time`, 'scripting');
    eventStyles[RecordTypes.UserTiming] = new TimelineRecordStyle(`User Timing`, 'scripting');
    eventStyles[RecordTypes.ResourceWillSendRequest] = new TimelineRecordStyle(`Will Send Request`, 'loading');
    eventStyles[RecordTypes.ResourceSendRequest] = new TimelineRecordStyle(`Send Request`, 'loading');
    eventStyles[RecordTypes.ResourceReceiveResponse] = new TimelineRecordStyle(`Receive Response`, 'loading');
    eventStyles[RecordTypes.ResourceFinish] = new TimelineRecordStyle(`Finish Loading`, 'loading');
    eventStyles[RecordTypes.ResourceReceivedData] = new TimelineRecordStyle(`Receive Data`, 'loading');
    eventStyles[RecordTypes.RunMicrotasks] = new TimelineRecordStyle(`Run Microtasks`, 'scripting');
    eventStyles[RecordTypes.FunctionCall] = new TimelineRecordStyle(`Function Call`, 'scripting');
    eventStyles[RecordTypes.GCEvent] = new TimelineRecordStyle(`GC Event`, 'scripting');
    eventStyles[RecordTypes.MajorGC] = new TimelineRecordStyle(`Major GC`, 'scripting');
    eventStyles[RecordTypes.MinorGC] = new TimelineRecordStyle(`Minor GC`, 'scripting');
    eventStyles[RecordTypes.JSFrame] = new TimelineRecordStyle(`JS Frame`, 'scripting');
    eventStyles[RecordTypes.RequestAnimationFrame] = new TimelineRecordStyle(`Request Animation Frame`, 'scripting');
    eventStyles[RecordTypes.CancelAnimationFrame] = new TimelineRecordStyle(`Cancel Animation Frame`, 'scripting');
    eventStyles[RecordTypes.FireAnimationFrame] = new TimelineRecordStyle(`Animation Frame Fired`, 'scripting');
    eventStyles[RecordTypes.RequestIdleCallback] = new TimelineRecordStyle(`Request Idle Callback`, 'scripting');
    eventStyles[RecordTypes.CancelIdleCallback] = new TimelineRecordStyle(`Cancel Idle Callback`, 'scripting');
    eventStyles[RecordTypes.FireIdleCallback] = new TimelineRecordStyle(`Fire Idle Callback`, 'scripting');
    eventStyles[RecordTypes.WebSocketCreate] = new TimelineRecordStyle(`Create WebSocket`, 'scripting');
    eventStyles[RecordTypes.WebSocketSendHandshakeRequest] = new TimelineRecordStyle(`Send WebSocket Handshake`, 'scripting');
    eventStyles[RecordTypes.WebSocketReceiveHandshakeResponse] =
        new TimelineRecordStyle(`Receive WebSocket Handshake`, 'scripting');
    eventStyles[RecordTypes.WebSocketDestroy] = new TimelineRecordStyle(`Destroy WebSocket`, 'scripting');
    eventStyles[RecordTypes.EmbedderCallback] = new TimelineRecordStyle(`Embedder Callback`, 'scripting');
    eventStyles[RecordTypes.DecodeImage] = new TimelineRecordStyle(`Image Decode`, 'painting');
    eventStyles[RecordTypes.ResizeImage] = new TimelineRecordStyle(`Image Resize`, 'painting');
    eventStyles[RecordTypes.GPUTask] = new TimelineRecordStyle(`GPU`, 'gpu');
    eventStyles[RecordTypes.LatencyInfo] = new TimelineRecordStyle(`Input Latency`, 'scripting');

    eventStyles[RecordTypes.GCCollectGarbage] = new TimelineRecordStyle(`DOM GC`, 'scripting');

    eventStyles[RecordTypes.CryptoDoEncrypt] = new TimelineRecordStyle(`Encrypt`, 'scripting');
    eventStyles[RecordTypes.CryptoDoEncryptReply] = new TimelineRecordStyle(`Encrypt Reply`, 'scripting');
    eventStyles[RecordTypes.CryptoDoDecrypt] = new TimelineRecordStyle(`Decrypt`, 'scripting');
    eventStyles[RecordTypes.CryptoDoDecryptReply] = new TimelineRecordStyle(`Decrypt Reply`, 'scripting');
    eventStyles[RecordTypes.CryptoDoDigest] = new TimelineRecordStyle(`Digest`, 'scripting');
    eventStyles[RecordTypes.CryptoDoDigestReply] = new TimelineRecordStyle(`Digest Reply`, 'scripting');
    eventStyles[RecordTypes.CryptoDoSign] = new TimelineRecordStyle(`Sign`, 'scripting');
    eventStyles[RecordTypes.CryptoDoSignReply] = new TimelineRecordStyle(`Sign Reply`, 'scripting');
    eventStyles[RecordTypes.CryptoDoVerify] = new TimelineRecordStyle(`Verify`, 'scripting');
    eventStyles[RecordTypes.CryptoDoVerifyReply] = new TimelineRecordStyle(`Verify Reply`, 'scripting');

    eventStyles[RecordTypes.AsyncTask] = new TimelineRecordStyle(`Async Task`, 'async');

export { eventStyles }