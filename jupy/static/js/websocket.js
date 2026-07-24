export function createRunSocket(onMessage) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws/run`);

  socket.onmessage = (event) => onMessage(JSON.parse(event.data));
  socket.onclose = () => setTimeout(() => createRunSocket(onMessage), 1000);

  return socket;
}

export function createTermSocket(onMessage) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws/terminal`);

  socket.onmessage = (event) => onMessage(JSON.parse(event.data));
  socket.onclose = () => {};

  return socket;
}