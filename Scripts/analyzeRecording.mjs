// const fs = require('fs');
// const loadEvents = require('./extractFromTrace/extractData.js');
import * as fs from 'fs';
import * as m from './extractFromTrace/extractData.js';

const name = 'pwa';
const nbExp = 10;
const data = []

for (let i=1; i<=nbExp; i++) {
    const path = `trace_${name}_${i}.json`;
    var file = fs.readFileSync(path);
    var raw_events = JSON.parse(file);
    console.log('Trace n°', i);
    data.push(m.loadEvents(raw_events));
    // console.log(data[-1]);
}

const dataRows = ['cpuTime, selfTime, selfCpu, recording duration, recordCpu, nb samples, sampling duration, samplingCpu, FPS, JS used'].concat(data.map(d => 
    `${d.cpuTime}, ${d.selfTime}, ${d.cpuTime/d.selfTime*100}, ${d.recordDur}, ${d.cpuTime/d.recordDur*100}, ${d.nbSamples}, ${d.samplingDur}, ${d.cpuSampling}, ${d.fps}, ${d.JSused}`
));

// console.log(data);

// fs.writeFileSync(`data_${name}.txt`, dataRows.join('\n'));


