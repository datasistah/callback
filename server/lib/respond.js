// Small helpers for consistent error responses.
//
// The api-contract error shape is: { "error": "short_code", "message": "..." }.
export function sendError(res, status, error, message) {
  return res.status(status).json({ error, message });
}

export const unauthorized = (res) =>
  sendError(res, 401, 'unauthorized', 'Invalid or expired session.');

export const notFoundJob = (res) =>
  sendError(res, 404, 'not_found', 'Job not found.');

export const serverError = (res) =>
  sendError(res, 500, 'server_error', 'Something went wrong. Please try again.');
