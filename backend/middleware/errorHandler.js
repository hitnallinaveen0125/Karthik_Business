function errorHandler(err, req, res, next) {
  console.error(err.message || err);

  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: statusCode === 413 ? 'PDF exceeds the 50 MB upload limit.' : statusCode >= 500 ? 'Internal server error' : err.message,
  });
}

module.exports = { errorHandler };
