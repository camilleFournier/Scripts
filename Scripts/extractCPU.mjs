
import * as fs from 'fs';
import * as m from './extractFromTrace/extractData.js';



function extractDumpsys(name) {
    const path = `${name}_dumpsys_cpuinfo.txt`;
    const file = fs.readFileSync(path, 'utf8');
    const measures = file.split(/#+([\s\w])+#+/);

    const browser = [];
    const renderer = [];
    const gpuProcess = [];

    for (let i=0; i<measures.length; i++) {
        const lines = measures[i].split('\n');
        for (let l=0; l<lines.length; l++) {
            if (lines[l].includes('com.android.chrome')) {
                if (lines[l].includes('sandboxed_process')) {
                    const match = lines[l].match(/[\d.]*%/)[0];
                    renderer.push(match.substring(0, match.length-1));
                    continue;
                }
                if (lines[l].includes('privileged_process')) {
                    const match = lines[l].match(/[\d.]*%/)[0];
                    gpuProcess.push(match.substring(0, match.length-1));
                    continue;
                }
                const match = lines[l].match(/[\d.]*%/)[0];
                browser.push(match.substring(0, match.length-1))
            }
        }
    }
    return ({ browser: browser, renderer: renderer, gpuProcess: gpuProcess });
}

function extractDumpsysTop(name) {
    const path = `${name}_dumpsys_top.txt`;
    const file = fs.readFileSync(path, 'utf8');
    const measures = file.split(/#+([\s\w])+#+/);

    const browser = [];
    const renderer = [];
    const gpuProcess = [];

    for (let i=0; i<measures.length; i++) {
        const lines = measures[i].split('\n');
        for (let l=0; l<lines.length; l++) {
            if (lines[l].includes('com.android.chrome')) {
                if (lines[l].includes('sandboxed_process')) {
                    const match = lines[l].match(/[\d.]*%/)[0];
                    renderer.push(parseFloat(match.substring(0, match.length-1)));
                    continue;
                }
                if (lines[l].includes('privileged_process')) {
                    const match = lines[l].match(/[\d.]*%/)[0];
                    gpuProcess.push(parseFloat(match.substring(0, match.length-1)));
                    continue;
                }
                const match = lines[l].match(/[\d.]*%/)[0];
                browser.push(parseFloat(match.substring(0, match.length-1)))
            }
        }
    }
    return ({ browser: browser, renderer: renderer, gpuProcess: gpuProcess });
}

function extractTrace(name) {
    const data = [];
    for (let i=1; i<=100; i++) {
        const path = `${name}_trace_${i}.json`;
        var file = fs.readFileSync(path);
        var raw_events = JSON.parse(file);
        const raw = m.loadEvents(raw_events);
        data.push({
            cpuTime: raw.cpuTime,
            cpuSampling: raw.cpuSampling,
            recordDur: raw.recordDur,
            samplDur: raw.samplingDur,
            nbFrames: raw.nbFrames,
            nbGPUTasks: raw.nbGPUTasks,
            nbRunTasks: raw.nbRunTasks
        });
        // console.log(data[-1]);
    }
    return data;
    // const dataRows = ['cpuTime, selfTime, selfCpu, recording duration, recordCpu, nb samples, sampling duration, samplingCpu, FPS, JS used'].concat(data.map(d => 
    //     `${d.cpuTime}, ${d.selfTime}, ${d.cpuTime/d.selfTime*100}, ${d.recordDur}, ${d.cpuTime/d.recordDur*100}, ${d.nbSamples}, ${d.samplingDur}, ${d.cpuSampling}, ${d.fps}, ${d.JSused}`
    // ));
}



// const exp = [16, 50, 100, 200, 500];
// const dataRows = ['Name; Browser; Renderer; GPU Process; cpuTime (%); cpuSampling (%); Sum dumpsys'];
// for (let i=0; i<exp.length; i++) {
//     console.log('Frame every '+exp[i]+'ms');
//     const name = `pwa_trace_dumpsys/Emulator/hundred_points/pwa_${exp[i]}/pwa_${exp[i]}`;
//     const dumpsys = extractDumpsys(name);
//     const trace = extractTrace(name);
//     for (let l=0; l<trace.length; l++) {
//         dataRows.push(`${exp[i]}ms; ${dumpsys.browser[l]}; ${dumpsys.renderer[l]}; ${dumpsys.gpuProcess[l]}; ${trace[l].cpuTime/trace[l].recordDur*100}; ${trace[l].cpuSampling}; ${dumpsys.browser[l]+dumpsys.gpuProcess[l]+dumpsys.renderer[l]}`);
//     }
// };

const exp = [16, 50, 100, 200, 500];
const dataRows = ['Exp; Number of frames; Number of BeginFrame; Number of RequestMainThreadFrame; Number of BeginMainThreadFrame; Number of ActivateLayerTree; Number of DrawFrame; nb of SwapBuffers'];
// for (let i=0; i<exp.length; i++) {
//     console.log('Frame every '+exp[i]+'ms');
//     const name = `pwa_trace_dumpsys/Emulator/hundred_points/pwa_${exp[i]}/pwa_${exp[i]}`;
//     const trace = extractTrace(name);
//     for (let l=0; l<trace.length; l++) {
//         dataRows.push(`${trace[l].nbFrames}; ${trace[l].nbGPUTasks}; ${trace[l].nbRunTasks}`);
//     }
// };
for (let i=1; i<=9;i++) {
    const name = `pwa_trace/pwa_50_input_trace_${i}.json`;
    var file = fs.readFileSync(name);
    var raw_events = JSON.parse(file);
    const raw = m.loadEvents(raw_events);
    dataRows.push(`${i}; ${raw.nbFrames}; ${raw.nbBeginFrame}; ${raw.nbRequestMainThreadFrame}; ${raw.nbBeginMainThreadFrame}; ${raw.nbActivateLayerTree}; ${raw.nbDrawFrame}; ${raw.nbSwapBuffers}`);
}
console.log(dataRows);

fs.writeFileSync('pwa_trace/summary.txt', dataRows.join('\n'));

// fs.writeFileSync(`pwa_trace_dumpsys/Emulator/hundred_points/summary.txt`, dataRows.join('\n'));

// const name = 'pwa_touch_trace_1.json';
// const file = fs.readFileSync(name, 'utf8');
// var raw_events = JSON.parse(file);
// const raw = m.loadEvents(raw_events);