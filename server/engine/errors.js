// 统一业务错误：带 statusCode，由 app.js 的错误处理器转成 { error, message }
export function httpError(statusCode, error, message) {
  const err = new Error(message ?? error);
  err.statusCode = statusCode;
  err.expose = { error, message: message ?? error };
  return err;
}
