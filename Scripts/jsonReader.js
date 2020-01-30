const fs = require('fs');

var datafile = fs.readFileSync('trace_sw.json');
var datajson = JSON.parse(datafile);
// var dataframes = datajson.filter(data => data.cat == "disabled-by-default-v8.cpu_profiler");

// var result = [];
// for (var j=0; j<dataframes.length; j++) {
//     var isNew = true
//     for (var i=0; i<result.length; i++) {
//         if (result[i].name == dataframes[j].name) {
//             result[i].number ++;
//             isNew = false;
//         }
//     }
//     if (isNew) {
//         result.push({name: dataframes[j].name, number: 1});
//     }
// }

function startTime() {
    var startThread = datajson.filter(data => data.name == "TracingStartedInBrowser");
    return startThread[0].ts
}

function countNames(category) {
    var dataCat = datajson.filter(data => data.cat.includes(category));
    var result = [];
    for (var j=0; j<dataCat.length; j++) {
        var isNew = true
        for (var i=0; i<result.length; i++) {
            if (result[i].name == dataCat[j].name) {
                result[i].number ++;
                isNew = false;
            }
        }
        if (isNew) {
            result.push({name: dataCat[j].name, number: 1});
        }
    }
    console.log(result);
}


function countCategories() {
    var result = [];
    for (var j=0; j<datajson.length; j++) {
        var isNew = true
        for (var i=0; i<result.length; i++) {
            if (result[i].cat == datajson[j].cat) {
                result[i].number ++;
                isNew = false;
            }
        }
        if (isNew) {
            result.push({cat: datajson[j].cat, number: 1});
        }
    }
    console.log(result);
}



function computeFPS(jsondata) {

    var frames = jsondata.filter(data => data.name == "DrawFrame");
    var time = frames[frames.length -1].ts - startTime();
    console.log(frames.length + " frames rendered in " + time/1000000 + "s?");
    console.log(frames.length/time*1000000);
}

function computeTime() {
    var last = datajson[datajson.length - 14];
    console.log(last);
    var first = datajson[0];
    tts = last.tts - first.tts;
    ts = last.ts - startTime()
    console.log('Thread Clock duration : ' + tts/1000 + ' millisec');
    console.log('Tracing Clock duration : ' + ts/1000 + ' millisec');
    console.log((ts + tts)/1000);
}

function computeCPU() {
    var cpuProfile = datajson.filter(data => data.name == "ProfileChunk");
    var totalTime = 0;
    for (var i=0; i<cpuProfile.length; i++) {
        var time = 0;
        var deltas = cpuProfile[i].args.data.timeDeltas;
        for (var j=0; j<deltas.length; j++) {
            time += deltas[j];
        };
        totalTime += time;
    }
    var duration = cpuProfile[cpuProfile.length-1].ts - cpuProfile[0].ts
    console.log('Time CPU samples : ' + totalTime);
    console.log('CPU Profile Duration : ' + duration)
}


function processData() {
    var datafile = fs.readFileSync('chrome_trace.json');
    var datajson = JSON.parse(datafile);
  
    var dataTracing = datajson.filter(data => data.method === 'Tracing.dataCollected');
      var result = [];
      for (var j=0; j<dataTracing.length; j++) {
          var isNew = true;
          for (var i=0; i<result.length; i++) {
              if (result[i].name == dataTracing[j].params.cat) {
                  result[i].number ++;
                  isNew = false;
              }
          }
          if (isNew) {
              result.push({name: dataTracing[j].params.cat, number: 1});
          }
      }
      console.log(result);
  }



// computeCPU();
// computeFPS(datajson);
// computeTime();
// countNames('devtools.timeline');

// processData();

countCategories();