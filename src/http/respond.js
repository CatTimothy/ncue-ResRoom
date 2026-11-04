export function respond(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}
