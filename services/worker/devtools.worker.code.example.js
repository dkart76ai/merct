const workerCode = `
  self.onmessage = function(e) {
    console.log('Worker received:', e.data);
    self.postMessage('Hello from worker!');
  };
`

const blob = new Blob([workerCode], { type: 'application/javascript' })
const workerUrl = URL.createObjectURL(blob)
const myWorker = new Worker(workerUrl)

myWorker.onmessage = e => console.log('Main thread received:', e.data)
myWorker.postMessage('Test message')
